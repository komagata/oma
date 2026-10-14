import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import {stat,access} from 'node:fs/promises';
import {dirname} from 'node:path';
import {localToolDefinitions} from '../runtime/local-tools.mjs';

// Keep the initial red state an explicit missing-feature assertion.
const bridgeModule=await import('../runtime/agent-tool-bridge.mjs').catch(error=>{
 if(error.code==='ERR_MODULE_NOT_FOUND')return {};
 throw error;
});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function host(t,options={}){
 assert.equal(typeof bridgeModule.startAgentToolBridge,'function','private tool bridge host must be implemented');
 const bridge=await bridgeModule.startAgentToolBridge({definitions:localToolDefinitions,execute:async()=>({done:true}),cancel(){},...options});
 t.after(()=>bridge.close());return bridge;
}
async function client(t,bridge){
 const socket=net.createConnection(bridge.connection.socketPath),responses=[],waiters=[];
 let buffer='';socket.setEncoding('utf8');socket.on('data',chunk=>{
  buffer+=chunk;let newline;
  while((newline=buffer.indexOf('\n'))!==-1){const response=JSON.parse(buffer.slice(0,newline));buffer=buffer.slice(newline+1);if(waiters.length)waiters.shift()(response);else responses.push(response);}
 });
 // Socket errors are surfaced by connect/close assertions; never print credentials.
 socket.on('error',()=>{});await once(socket,'connect');t.after(()=>socket.destroy());
 return {socket,responses,send:(id,op,extra={})=>socket.write(JSON.stringify({v:1,id,op,token:bridge.connection.token,...extra})+'\n'),next:()=>responses.length?Promise.resolve(responses.shift()):new Promise(resolve=>waiters.push(resolve))};
}
const call=(peer,id,args={})=>peer.send(id,'call',{name:'confirm_action',args});
const missing=path=>assert.rejects(access(path),{code:'ENOENT'});

test('discovers exact definitions and creates a unique private per-session endpoint', {timeout:5000},async t=>{
 const a=await host(t),b=await host(t),peer=await client(t,a);
 assert.equal(a.connection.version,1);assert.notEqual(a.connection.socketPath,b.connection.socketPath);
 assert.notEqual(a.connection.token,b.connection.token);assert.match(a.connection.token,/^[a-f0-9]{64}$/);
 assert.equal((await stat(dirname(a.connection.socketPath))).mode&0o777,0o700);
 assert.equal((await stat(a.connection.socketPath)).mode&0o777,0o600);
 peer.send('definitions','list');assert.deepEqual(await peer.next(),{v:1,id:'definitions',ok:true,result:localToolDefinitions});
});

test('passes an allowlisted name and arguments to the owner and preserves image values', {timeout:5000},async t=>{
 const calls=[],result={observations:['camera view'],images:['data:image/png;base64,AAECAw=='],extra:{unchanged:true}};
 const bridge=await host(t,{execute:async(name,args)=>{calls.push([name,args]);return result;}}),peer=await client(t,bridge);
 peer.send('image','call',{name:'search_memory',args:{query:'fixture'}});
 assert.deepEqual(await peer.next(),{v:1,id:'image',ok:true,result});
 assert.deepEqual(calls,[['search_memory',{query:'fixture'}]]);
});

test('correlates simultaneous out-of-order replies by request id', {timeout:5000},async t=>{
 const slow=deferred(),started=deferred();const bridge=await host(t,{execute:async(name,args)=>{if(args.slow){started.resolve();return slow.promise;}return {fast:true};}}),peer=await client(t,bridge);
 call(peer,'slow',{slow:true});await started.promise;call(peer,'fast');
 assert.deepEqual(await peer.next(),{v:1,id:'fast',ok:true,result:{fast:true}});
 slow.resolve({approved:false});assert.deepEqual(await peer.next(),{v:1,id:'slow',ok:true,result:{approved:false}});
});

test('rejects unknown tools, operations, versions and invalid arguments without executing', {timeout:5000},async t=>{
 let calls=0;const bridge=await host(t,{execute:()=>{calls++;}}),peer=await client(t,bridge);
 for(const [extra,code] of [[{op:'call',name:'__proto__',args:{}},'UNKNOWN_TOOL'],[{op:'shell'},'UNKNOWN_OPERATION'],[{v:2},'INVALID_REQUEST'],[{op:'call',name:'remember',args:[]},'INVALID_REQUEST']]){
  peer.send('invalid','list',extra);const response=await peer.next();assert.equal(response.id,'invalid');assert.equal(response.ok,false);assert.equal(response.error.code,code);assert.ok(JSON.stringify(response).length<512);
 }
 assert.equal(calls,0);
});

test('invalid secret and unauthenticated malformed clients never execute or cancel', {timeout:5000},async t=>{
 let calls=0,cancels=0;const pending=deferred(),started=deferred();
 const bridge=await host(t,{execute:()=>{calls++;started.resolve();return pending.promise;},cancel:()=>{cancels++;pending.resolve({approved:false});}}),owner=await client(t,bridge);
 call(owner,'waiting');await started.promise;
 for(const payload of [JSON.stringify({v:1,id:'bad',op:'call',name:'remember',args:{},token:'incorrect'})+'\n','{invalid\n','null\n']){
  const peer=await client(t,bridge),closed=once(peer.socket,'close');peer.socket.write(payload);await closed;
 }
 assert.equal(calls,1);assert.equal(cancels,0);
 pending.resolve({approved:true});assert.deepEqual((await owner.next()).result,{approved:true});
});

test('oversized complete and fragmented frames are closed before execution', {timeout:5000},async t=>{
 let calls=0;const bridge=await host(t,{execute:()=>{calls++;}});
 for(const fragmented of [false,true]){
  const peer=await client(t,bridge),closed=once(peer.socket,'close'),payload='x'.repeat(bridgeModule.AGENT_TOOL_BRIDGE_LIMITS.requestBytes+1);
  if(fragmented){peer.socket.write(payload.slice(0,100));peer.socket.write(payload.slice(100));}else peer.socket.write(payload+'\n');
  await closed;
 }
 assert.equal(calls,0);
});

test('accepts UTF-8 frames fragmented inside a character and multiple frames in one write', {timeout:5000},async t=>{
 const bridge=await host(t,{execute:async(name,args)=>args}),peer=await client(t,bridge);
 const line=Buffer.from(JSON.stringify({v:1,id:'unicode',op:'call',token:bridge.connection.token,name:'search_memory',args:{query:'日本語'}})+'\n');
 const index=line.indexOf(Buffer.from('日'))+1;peer.socket.write(line.subarray(0,index));peer.socket.write(line.subarray(index));
 assert.deepEqual((await peer.next()).result,{query:'日本語'});
 peer.socket.write(['one','two'].map(id=>JSON.stringify({v:1,id,op:'list',token:bridge.connection.token})+'\n').join(''));
 assert.deepEqual(new Set([(await peer.next()).id,(await peer.next()).id]),new Set(['one','two']));
});

test('safe errors never echo owner exceptions or oversized image results', {timeout:5000},async t=>{
 const bridge=await host(t,{execute:async(name,args)=>{if(args.large)return {images:['x'.repeat(bridgeModule.AGENT_TOOL_BRIDGE_LIMITS.responseBytes)]};throw Error('private saved memory / secret');}}),peer=await client(t,bridge);
 call(peer,'error');let response=await peer.next();assert.equal(response.error.code,'TOOL_FAILED');assert.doesNotMatch(JSON.stringify(response),/private|secret/);
 call(peer,'large',{large:true});response=await peer.next();assert.equal(response.error.code,'RESULT_TOO_LARGE');assert.ok(JSON.stringify(response).length<512);
});

test('disconnect during approval closes the bridge, cancels once and cleans its files', {timeout:5000},async t=>{
 const started=deferred(),pending=deferred(),cancelled=deferred();let cancels=0;
 const bridge=await host(t,{execute:()=>{started.resolve();return pending.promise;},cancel:()=>{cancels++;pending.resolve({approved:false});cancelled.resolve();}}),peer=await client(t,bridge);
 call(peer,'approval');await started.promise;peer.socket.destroy();await cancelled.promise;await bridge.close();await bridge.close();
 assert.equal(cancels,1);assert.deepEqual(peer.responses,[]);await missing(bridge.connection.socketPath);await missing(dirname(bridge.connection.socketPath));
});

test('session abort cancels approval once and invalidates late results on every connection', {timeout:5000},async t=>{
 const controller=new AbortController(),started=deferred(),pending=deferred();let calls=0,cancels=0;
 const bridge=await host(t,{signal:controller.signal,execute:()=>{if(++calls===2)started.resolve();return pending.promise;},cancel:()=>{cancels++;}});
 const a=await client(t,bridge),b=await client(t,bridge),closedA=once(a.socket,'close'),closedB=once(b.socket,'close');
 call(a,'a');call(b,'b');await started.promise;controller.abort();await bridge.close();pending.resolve({approved:true});await Promise.all([closedA,closedB]);
 assert.equal(cancels,1);assert.deepEqual(a.responses,[]);assert.deepEqual(b.responses,[]);await missing(dirname(bridge.connection.socketPath));
});

test('normal disconnect and idle close do not cancel owner tools', {timeout:5000},async t=>{
 let cancels=0;const bridge=await host(t,{cancel:()=>{cancels++;}}),peer=await client(t,bridge);
 peer.send('list','list');await peer.next();peer.socket.end();await once(peer.socket,'close');
 const next=await client(t,bridge);call(next,'ok');assert.equal((await next.next()).ok,true);
 await Promise.all([bridge.close(),bridge.close()]);assert.equal(cancels,0);await missing(dirname(bridge.connection.socketPath));
});

test('close prevents buffered requests from starting and does not await an uncancellable owner', {timeout:5000},async t=>{
 let bridge,calls=0,cancels=0;
 bridge=await host(t,{execute:()=>{calls++;bridge.close();return new Promise(()=>{});},cancel:()=>{cancels++;}});
 const peer=await client(t,bridge),closed=once(peer.socket,'close');
 peer.socket.write(['first','queued'].map(id=>JSON.stringify({v:1,id,op:'call',name:'confirm_action',args:{},token:bridge.connection.token})+'\n').join(''));
 await closed;await bridge.close();assert.equal(calls,1);assert.equal(cancels,1);await missing(dirname(bridge.connection.socketPath));
});

test('duplicate in-flight ids cannot start a second tool and invalidate the first reply', {timeout:5000},async t=>{
 const started=deferred(),pending=deferred();let calls=0,cancels=0;
 const bridge=await host(t,{execute:()=>{calls++;started.resolve();return pending.promise;},cancel:()=>{cancels++;pending.resolve({approved:false});}}),peer=await client(t,bridge);
 call(peer,'duplicate');await started.promise;const closed=once(peer.socket,'close');call(peer,'duplicate');await closed;await bridge.close();
 assert.equal(calls,1);assert.equal(cancels,1);assert.deepEqual(peer.responses,[]);
});

test('an already aborted session cannot create a live bridge',async()=>{
 assert.equal(typeof bridgeModule.startAgentToolBridge,'function','private tool bridge host must be implemented');
 await assert.rejects(bridgeModule.startAgentToolBridge({definitions:localToolDefinitions,execute(){},cancel(){},signal:AbortSignal.abort()}),{name:'AbortError'});
});
