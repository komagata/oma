import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import net from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startAgentToolBridge} from '../runtime/agent-tool-bridge.mjs';
import {localToolDefinitions,LocalTools} from '../runtime/local-tools.mjs';

const implementation=await import('../runtime/agent-tool-mcp.mjs').catch(error=>{
 if(error.code==='ERR_MODULE_NOT_FOUND')return {};
 throw error;
});
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:(...a)=>resolve(...a)};};
async function fixture(t,owner={}){
 assert.equal(typeof implementation.startAgentToolMcp,'function','stdio MCP translator must be implemented');
 const bridge=await startAgentToolBridge({definitions:localToolDefinitions,execute:async()=>({done:true}),cancel(){},...owner});
 t.after(()=>bridge.close());
 return {bridge,...stdio(t,{OMA_TOOL_SOCKET:bridge.connection.socketPath,OMA_TOOL_TOKEN:bridge.connection.token})};
}
function stdio(t,env={}){
 assert.equal(typeof implementation.startAgentToolMcp,'function','stdio MCP translator must be implemented');
 const input=new PassThrough(),output=new PassThrough(),responses=[],waiting=new Map();let id=0,buffer='';
 output.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const reply=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);responses.push(reply);waiting.get(reply.id)?.(reply);waiting.delete(reply.id);}});
 const server=implementation.startAgentToolMcp({input,output,env});t.after(()=>server.close());
 const send=message=>input.write(JSON.stringify(message)+'\n');
 return {server,input,output,responses,send,request:(method,params={})=>{const requestId=++id;return new Promise(resolve=>{waiting.set(requestId,resolve);send({jsonrpc:'2.0',id:requestId,method,params});});}};
}
test('initializes, accepts notification and ping, reports JSON-RPC errors without needing a socket',async t=>{
 const f=stdio(t);const initialized=await f.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'test',version:'1'}});
 assert.equal(initialized.result.protocolVersion,'2024-11-05');assert.deepEqual(initialized.result.capabilities,{tools:{}});
 f.send({jsonrpc:'2.0',method:'notifications/initialized'});assert.deepEqual((await f.request('ping')).result,{});
 assert.equal((await f.request('not/a/method')).error.code,-32601);
 assert.equal((await f.request('tools/call',{name:'read_file',arguments:[]})).error.code,-32602);
 f.input.write('{bad json}\n');await new Promise(r=>setImmediate(r));assert.equal(f.responses.at(-1).error.code,-32700);
 assert.ok(!JSON.stringify(f.responses).includes('bad json'));
});
test('lists exact OMA schemas and calls owner with structured results and camera images',async t=>{
 const calls=[];const f=await fixture(t,{execute:async(name,args)=>{calls.push([name,args]);return name==='camera_snapshot'?{observations:['Camera view'],images:['data:image/png;base64,AAECAw==','data:image/jpeg;base64,/9j/']}:{saved:true,value:'fixture'};}});
 const tools=(await f.request('tools/list')).result.tools;
 assert.deepEqual(tools,localToolDefinitions.map(({name,description,parameters})=>({name,description,inputSchema:parameters})));
 const images=await f.request('tools/call',{name:'camera_snapshot',arguments:{}});
 assert.deepEqual(images.result,{content:[{type:'text',text:'Camera view'},{type:'image',mimeType:'image/png',data:'AAECAw=='},{type:'image',mimeType:'image/jpeg',data:'/9j/'}]});
 const result=await f.request('tools/call',{name:'remember',arguments:{key:'fixture',value:'fixture'}});
 assert.deepEqual(JSON.parse(result.result.content[0].text),{saved:true,value:'fixture'});
 assert.deepEqual(calls,[['camera_snapshot',{}],['remember',{key:'fixture',value:'fixture'}]]);
 const unknown=await f.request('tools/call',{name:'__proto__',arguments:{}});assert.equal(unknown.result.isError,true);assert.equal(calls.length,2);
});
test('owner failure and malformed image cannot leak or downgrade image data to text',async t=>{
 const f=await fixture(t,{execute:async(name)=>{if(name==='camera_snapshot')return {observations:['private'],images:['https://private.invalid/image']};throw Error('private exception');}});
 for(const name of ['read_file','camera_snapshot']){
  const response=await f.request('tools/call',{name,arguments:{}});assert.equal(response.result.isError,true);
  assert.ok(!JSON.stringify(response).includes('private'));
 }
});
test('confirmation waits for owner approval and closes pending confirmation on stdin EOF',async t=>{
 const patches=[],ready=deferred();const tools=new LocalTools({memory:{},emit:patch=>{patches.push(patch);if(patch.approval)ready.resolve(patch.approval);}});tools.begin();
 const f=await fixture(t,{execute:tools.call.bind(tools),cancel:tools.cancel.bind(tools)});
 const approved=f.request('tools/call',{name:'confirm_action',arguments:{description:'fixture'}});const approval=await ready.promise;
 assert.equal(tools.approvals.size,1);tools.approve(approval.id,true);assert.deepEqual(JSON.parse((await approved).result.content[0].text),{approved:true});
 const next=deferred();tools.emit=patch=>{if(patch.approval)next.resolve();};f.request('tools/call',{name:'confirm_action',arguments:{description:'cancel fixture'}});await next.promise;
 const count=f.responses.length;f.input.end();await f.server.closed;await f.bridge.closed;assert.equal(tools.approvals.size,0);assert.equal(f.responses.length,count);
});
test('bounds fragmented stdin frames and output, and does not echo private input',async t=>{
 const f=stdio(t);f.input.write('x'.repeat(256*1024));f.input.write('x');await f.server.closed;assert.deepEqual(f.responses,[]);
 const huge=await fixture(t,{execute:async()=>({observations:[],images:['data:image/png;base64,'+'A'.repeat(32*1024*1024)]})});
 const response=await huge.request('tools/call',{name:'camera_snapshot',arguments:{}});assert.equal(response.result.isError,true);assert.ok(JSON.stringify(response).length<512);
});
for(const [name,reply] of [['malformed JSON','private not json\n'],['wrong envelope',JSON.stringify({v:2,id:'1',ok:true,result:{secret:'private'}})+'\n'],['missing result',JSON.stringify({v:1,id:'1',ok:true})+'\n']])test('malformed bridge reply closes MCP without echoing '+name,{timeout:5000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'oma-mcp-test-')),socketPath=join(dir,'rpc.sock'),peers=new Set();
 const server=net.createServer(socket=>{peers.add(socket);socket.on('error',()=>{});socket.on('data',()=>socket.write(reply));});
 t.after(async()=>{for(const peer of peers)peer.destroy();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});
 const f=stdio(t,{OMA_TOOL_SOCKET:socketPath,OMA_TOOL_TOKEN:'fixture-token'});f.request('tools/call',{name:'read_file',arguments:{path:'fixture'}});
 await f.server.closed;assert.deepEqual(f.responses,[]);
});
