import net from 'node:net';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdtemp,chmod,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export const AGENT_TOOL_BRIDGE_LIMITS=Object.freeze({requestBytes:256*1024,responseBytes:32*1024*1024,connections:8,inFlight:32});
const errors={INVALID_REQUEST:'Invalid request.',UNKNOWN_OPERATION:'Unknown operation.',UNKNOWN_TOOL:'Unknown tool.',TOOL_FAILED:'Tool call failed.',RESULT_TOO_LARGE:'Tool result exceeds transport limit.',BUSY:'Too many pending calls.'};
const failure=(id,code)=>({v:1,id,ok:false,error:{code,message:errors[code]}});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validId=id=>typeof id==='string'&&id.length>0&&Buffer.byteLength(id)<=128;
async function removeEndpoint(socketPath,directory){
 try{await unlink(socketPath);}catch(error){if(error.code!=='ENOENT')throw error;}
 // Never recursively remove a directory: unexpected contents must survive.
 await rmdir(directory);
}

/**
 * Private per-live-session NDJSON RPC, not an MCP server or a permissions layer.
 * Await startAgentToolBridge({definitions: localToolDefinitions,
 *   execute: (name,args) => tools.call(name,args), cancel: () => tools.cancel(), signal}).
 * Pass connection only over a private child channel, never logs or command argv.
 * Requests: {v:1,id:<nonempty string>,token,op:'list'|'call',name?,args?} + LF.
 * Replies: {v:1,id,ok:true,result} or {v:1,id,ok:false,error:{code,message}} + LF.
 * Each frame authenticates; ids must be unique among pending calls on a connection.
 * Tool validation/permissions/approval and result contents remain the owner's job.
 * Images are preserved verbatim in JSON; oversized results fail, never become text.
 *
 * cancel must synchronously cancel owner waits (LocalTools.cancel). Active-client
 * disconnect, close(), or session abort terminally closes the whole bridge and
 * invokes cancel once if a call has started and is still pending. Idle/rejected
 * clients do not cancel tools. Integrations must call LocalTools.begin() before
 * the next CLI task after cancellation. Cancellation cannot undo side effects;
 * a disconnected client has an UNKNOWN outcome and must not retry automatically.
 * close()/closed report cleanup/cancel failures but never await a stuck execute.
 */
export async function startAgentToolBridge({definitions,execute,cancel,signal}={}){
 if(!Array.isArray(definitions)||definitions.some(d=>!object(d)||typeof d.name!=='string'||!d.name)||typeof execute!=='function'||typeof cancel!=='function')throw new TypeError('Invalid tool bridge owner.');
 const names=new Set(definitions.map(d=>d.name));
 if(names.size!==definitions.length)throw new TypeError('Duplicate tool definitions.');
 const toolDefinitions=JSON.parse(JSON.stringify(definitions));
 signal?.throwIfAborted();
 const directory=await mkdtemp(join(tmpdir(),'oma-tools-')),socketPath=join(directory,'rpc.sock');
 const secret=randomBytes(32).toString('hex'),secretBytes=Buffer.from(secret);
 const connection=Object.freeze({version:1,socketPath,token:secret});
 const peers=new Set();let stopping=false,ready=false,active=0;
 let resolveClosed,rejectClosed;
 const closed=new Promise((resolve,reject)=>{resolveClosed=resolve;rejectClosed=reject;});
 // Automatic terminal paths have no caller awaiting yet; keep the rejection
 // available on closed/close() without emitting private errors as unhandled logs.
 closed.catch(()=>{});
 const server=net.createServer(accept);
 const abort=()=>{close();};
 function close(){
  if(stopping)return closed;
  stopping=true;ready=false;signal?.removeEventListener('abort',abort);
  let cancelError;
  if(active){try{cancel();}catch{cancelError=new Error('Owner cancellation failed.');}}
  for(const peer of peers){peer.dead=true;peer.pending.clear();peer.buffer=Buffer.alloc(0);peer.socket.destroy();}
  peers.clear();
  server.close(async()=>{
   try{await removeEndpoint(socketPath,directory);if(cancelError)throw cancelError;resolveClosed();}
   catch{rejectClosed(new Error(cancelError?'Owner cancellation failed.':'Tool bridge cleanup failed.'));}
  });
  return closed;
 }
 function accept(socket){
  if(!ready||stopping||peers.size>=AGENT_TOOL_BRIDGE_LIMITS.connections){socket.destroy();return;}
  const peer={socket,buffer:Buffer.alloc(0),pending:new Set(),running:0,dead:false};peers.add(peer);
  const disconnect=()=>{
   if(peer.dead)return;
   peer.dead=true;peer.buffer=Buffer.alloc(0);peer.pending.clear();peers.delete(peer);socket.destroy();
   if(peer.running)close();
  };
  socket.on('error',disconnect);socket.on('end',disconnect);socket.on('close',disconnect);
  function send(response){
   if(stopping||peer.dead)return;
   let wire;
   try{wire=JSON.stringify(response)+'\n';}
   catch{wire=JSON.stringify(failure(response.id,'TOOL_FAILED'))+'\n';}
   if(Buffer.byteLength(wire)>AGENT_TOOL_BRIDGE_LIMITS.responseBytes)wire=JSON.stringify(failure(response.id,'RESULT_TOO_LARGE'))+'\n';
   if(socket.writableLength+Buffer.byteLength(wire)>AGENT_TOOL_BRIDGE_LIMITS.responseBytes){disconnect();return;}
   socket.write(wire);
  }
  function request(frame){
   let data;
   try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(frame));}catch{disconnect();return;}
   if(!object(data)||typeof data.token!=='string'||Buffer.byteLength(data.token)!==secretBytes.length||!timingSafeEqual(Buffer.from(data.token),secretBytes)){disconnect();return;}
   const {id,op}=data;
   if(!validId(id)){send(failure(null,'INVALID_REQUEST'));return;}
   // A duplicate cannot be answered safely with the same correlation id.
   if(peer.pending.has(id)){disconnect();return;}
   if(data.v!==1){send(failure(id,'INVALID_REQUEST'));return;}
   if(op==='list'){send({v:1,id,ok:true,result:toolDefinitions});return;}
   if(op!=='call'){send(failure(id,'UNKNOWN_OPERATION'));return;}
   if(!names.has(data.name)){send(failure(id,'UNKNOWN_TOOL'));return;}
   if(!object(data.args)){send(failure(id,'INVALID_REQUEST'));return;}
   // Global cap includes queued calls on all connections; there is no unbounded queue.
   if([...peers].reduce((count,p)=>count+p.pending.size,0)>=AGENT_TOOL_BRIDGE_LIMITS.inFlight){send(failure(id,'BUSY'));return;}
   peer.pending.add(id);
   Promise.resolve().then(async()=>{
    if(stopping||peer.dead)return;
    active++;peer.running++;
    try{const result=await execute(data.name,data.args);send({v:1,id,ok:true,result});}
    catch{send(failure(id,'TOOL_FAILED'));}
    finally{active--;peer.running--;peer.pending.delete(id);}
   });
  }
  socket.on('data',chunk=>{
   let offset=0;
   while(offset<chunk.length&&!stopping&&!peer.dead){
    const newline=chunk.indexOf(10,offset),end=newline<0?chunk.length:newline;
    if(peer.buffer.length+end-offset>AGENT_TOOL_BRIDGE_LIMITS.requestBytes){disconnect();return;}
    peer.buffer=Buffer.concat([peer.buffer,chunk.subarray(offset,end)]);
    if(newline<0)return;
    const frame=peer.buffer;peer.buffer=Buffer.alloc(0);request(frame);offset=end+1;
   }
  });
 }
 try{
  await chmod(directory,0o700);
  await new Promise((resolve,reject)=>{
   const error=err=>{server.removeListener('listening',listening);reject(err);};
   const listening=()=>{server.removeListener('error',error);resolve();};
   server.once('error',error);server.once('listening',listening);server.listen(socketPath);
  });
  await chmod(socketPath,0o600);
  signal?.throwIfAborted();
  ready=true;server.on('error',abort);signal?.addEventListener('abort',abort,{once:true});
  return {connection,close,closed};
 }catch(error){await close();throw error;}
}
