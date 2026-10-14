import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {AGENT_TOOL_BRIDGE_LIMITS} from './agent-tool-bridge.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validId=id=>typeof id==='string'&&Buffer.byteLength(id)<=128||Number.isSafeInteger(id);
const toolFailure=()=>({content:[{type:'text',text:'OMA tool call failed. Verify any partial action before retrying.'}],isError:true});
function toolResult(result){
 if(object(result)&&('images' in result||'observations' in result)){
  if(!Array.isArray(result.observations)||result.observations.some(text=>typeof text!=='string')||!Array.isArray(result.images))throw Error('Invalid image result');
  const content=result.observations.map(text=>({type:'text',text}));
  for(const url of result.images){
   const match=typeof url==='string'&&/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
   if(!match||match[2].length%4!==0)throw Error('Invalid image result');
   content.push({type:'image',mimeType:match[1],data:match[2]});
  }
  const extra=Object.fromEntries(Object.entries(result).filter(([key])=>!['images','observations'].includes(key)));
  if(Object.keys(extra).length)content.push({type:'text',text:JSON.stringify(extra)});
  return {content};
 }
 const text=JSON.stringify(result);if(text===undefined)throw Error('Invalid result');
 return {content:[{type:'text',text}]};
}

/** Private stdio MCP adapter. Auth and request data travel only on inherited env and pipes. */
export function startAgentToolMcp({input=process.stdin,output=process.stdout,env=process.env}={}){
 const limits=AGENT_TOOL_BRIDGE_LIMITS,pending=new Map(),requests=new Set();
 let stopped=false,socket,connected,sequence=0,inputBuffer=Buffer.alloc(0),replyBuffer=Buffer.alloc(0),resolveClosed;
 const closed=new Promise(r=>resolveClosed=r);
 function close(){
  if(stopped)return closed;stopped=true;
  input.removeListener('data',onInput);input.removeListener('end',close);input.removeListener('error',close);output.removeListener('error',close);
  socket?.destroy();for(const {reject} of pending.values())reject(Error('Bridge unavailable'));pending.clear();
  inputBuffer=replyBuffer=Buffer.alloc(0);resolveClosed();return closed;
 }
 function send(response){
  if(stopped)return;
  let wire=JSON.stringify(response)+'\n';
  if(Buffer.byteLength(wire)>limits.responseBytes)wire=JSON.stringify({jsonrpc:'2.0',id:response.id,result:toolFailure()})+'\n';
  if(output.writableLength+Buffer.byteLength(wire)>limits.responseBytes){close();return;}
  output.write(wire);
 }
 const error=(id,code,message)=>send({jsonrpc:'2.0',id,error:{code,message}});
 function consume(buffer,chunk,limit,frame){
  let offset=0;
  while(offset<chunk.length&&!stopped){
   const newline=chunk.indexOf(10,offset),end=newline<0?chunk.length:newline;
   if(buffer.length+end-offset>limit){close();return Buffer.alloc(0);}
   buffer=Buffer.concat([buffer,chunk.subarray(offset,end)]);
   if(newline<0)return buffer;
   frame(buffer);buffer=Buffer.alloc(0);offset=end+1;
  }
  return buffer;
 }
 function connect(){
  if(connected)return connected;
  connected=new Promise((resolveConnect,reject)=>{
   if(typeof env.OMA_TOOL_SOCKET!=='string'||!env.OMA_TOOL_SOCKET||typeof env.OMA_TOOL_TOKEN!=='string'||!env.OMA_TOOL_TOKEN){reject(Error('Bridge unavailable'));return;}
   socket=net.createConnection(env.OMA_TOOL_SOCKET);
   socket.once('connect',resolveConnect);
   const disconnect=()=>{reject(Error('Bridge unavailable'));close();};
   socket.on('error',disconnect);socket.on('end',disconnect);socket.on('close',disconnect);
   socket.on('data',chunk=>{replyBuffer=consume(replyBuffer,chunk,limits.responseBytes,frame=>{
    let reply;try{reply=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(frame));}catch{close();return;}
    if(!object(reply)||reply.v!==1||typeof reply.id!=='string'||!pending.has(reply.id)||typeof reply.ok!=='boolean'||(reply.ok?!Object.hasOwn(reply,'result'):!object(reply.error))){close();return;}
    const waiter=pending.get(reply.id);pending.delete(reply.id);
    if(reply.ok)waiter.resolve(reply.result);else waiter.reject(Error('Tool failed'));
   });});
  });
  return connected;
 }
 async function rpc(op,extra={}){
  await connect();if(stopped)throw Error('Bridge unavailable');
  if(pending.size>=limits.inFlight)throw Error('Too many calls');
  const id=String(++sequence),wire=JSON.stringify({v:1,id,token:env.OMA_TOOL_TOKEN,op,...extra})+'\n';
  if(Buffer.byteLength(wire)>limits.requestBytes||socket.writableLength+Buffer.byteLength(wire)>limits.requestBytes)throw Error('Request too large');
  return new Promise((resolveReply,reject)=>{pending.set(id,{resolve:resolveReply,reject});socket.write(wire);});
 }
 async function request(data){
  if(!object(data)||data.jsonrpc!=='2.0'||typeof data.method!=='string'||(Object.hasOwn(data,'id')&&!validId(data.id))){error(null,-32600,'Invalid Request');return;}
  if(!Object.hasOwn(data,'id')){
   // The private bridge has terminal cancellation, so cancel the task connection.
   if(data.method==='notifications/cancelled'&&requests.has(data.params?.requestId))close();
   return;
  }
  const {id,method}=data;
  if(requests.has(id)){close();return;}
  if(requests.size>=limits.inFlight){error(id,-32603,'Too many pending requests');return;}
  requests.add(id);
  try{
   let result;
   if(method==='initialize'){
    const versions=['2024-11-05','2025-03-26','2025-06-18','2025-11-25'];
    result={protocolVersion:versions.includes(data.params?.protocolVersion)?data.params.protocolVersion:versions.at(-1),capabilities:{tools:{}},serverInfo:{name:'oma-local-tools',version:'1.0.0'}};
   }else if(method==='ping')result={};
   else if(method==='tools/list'){
    const definitions=await rpc('list');
    if(!Array.isArray(definitions)||definitions.some(d=>!object(d)||typeof d.name!=='string'||typeof d.description!=='string'||!object(d.parameters)))throw Error('Invalid definitions');
    result={tools:definitions.map(({name,description,parameters})=>({name,description,inputSchema:parameters}))};
   }else if(method==='tools/call'){
    if(!object(data.params)||typeof data.params.name!=='string'||!object(data.params.arguments??{})){error(id,-32602,'Invalid params');return;}
    try{result=toolResult(await rpc('call',{name:data.params.name,args:data.params.arguments??{}}));}catch{result=toolFailure();}
   }else{error(id,-32601,'Method not found');return;}
   send({jsonrpc:'2.0',id,result});
  }catch{error(id,-32603,'OMA tool bridge unavailable');}
  finally{requests.delete(id);}
 }
 function onInput(chunk){inputBuffer=consume(inputBuffer,Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk),limits.requestBytes,frame=>{
  let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(frame));}catch{error(null,-32700,'Parse error');return;}
  request(data).catch(()=>close());
 });}
 input.on('data',onInput);input.on('end',close);input.on('error',close);output.on('error',close);
 return {close,closed};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=startAgentToolMcp();const stop=()=>{server.close();process.stdin.pause();};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
 server.closed.then(()=>process.stdin.pause());
}
