import {bounded} from './memory.mjs';
import {AgentBackendError} from './agent-backends.mjs';
// At most 400 UTF-8 bytes: even byte-fallback tokenization stays below 500 tokens.
export function commentaryChunks(text){const chunks=[];let chunk='';for(const ch of text){if(Buffer.byteLength(chunk+ch)>400){chunks.push(chunk);chunk='';}chunk+=ch;}if(chunk)chunks.push(chunk);return chunks;}
export class ClientDelegation {
 constructor({agent,context,send,emit,busy,waitMs=250}){Object.assign(this,{agent,context,send,emit,busy,waitMs});this.seen=new Set();this.pending='';this.closed=false;this.current=null;}
 input(delta){this.pending=bounded(this.pending+delta,10000);this.lastInput=Date.now();}
 reply(id,text){if(!this.closed)for(const content of commentaryChunks(text))this.send({type:'session.commentary.append',delegation_id:id,content});}
 failure(id,error){const message=error instanceof AgentBackendError?error.message:this.agent.label+': task did not complete. Check the selected CLI locally before retrying.';this.emit({agentError:message,taskStatus:'Task interrupted'});this.reply(id,message);}
 created(id,blocked=false){
  if(this.closed||typeof id!=='string'||!id||this.seen.has(id))return;
  this.seen.add(id);
  if(blocked)return;
  if(this.current){if(!this.waiting)this.pending='';this.failure(id,new AgentBackendError(this.agent.label+': a task is still running. Wait or stop it before making another request.'));return;}
  const controller=new AbortController();this.current=controller;this.busy(true,id);this.waiting=true;const began=Date.now();
  const check=()=>{
   if(this.closed||controller.signal.aborted)return;
   const elapsed=Date.now()-began;
   if(elapsed<this.waitMs*3&&(!this.pending.trim()||Date.now()-this.lastInput<this.waitMs)){this.timer=setTimeout(check,this.waitMs);return;}
   const text=this.pending.trim();this.pending='';this.waiting=false;
   this.run(text,id,controller);
  };
  this.timer=setTimeout(check,this.waitMs);
 }
 async text(text){
  if(this.closed)return;
  if(this.current){this.failure(null,new AgentBackendError(this.agent.label+': a task is still running. Wait or stop it before making another request.'));return;}
  const controller=new AbortController();this.current=controller;this.pending='';this.busy(true,'typed');await this.run(bounded(text,10000).trim(),null,controller);
 }
 async run(text,id,controller){
  try{
   if(!text)throw new AgentBackendError(this.agent.label+': no new user transcript received. Please repeat your request.');
   this.emit({agentError:'',state:'working',taskStatus:this.agent.label+' is working'});
   const context=await this.context(text);if(this.closed||controller.signal.aborted)return;
   const result=await this.agent.run({text,context,signal:controller.signal,onProgress:()=>{}});
   if(this.closed||controller.signal.aborted)return;
   if(typeof result!=='string'||!result.trim())throw Error('No final reply');
   // Typed requests have no Live delegation transcript to rely on for display.
   if(id===null)this.emit({assistantText:result});
   this.reply(id,result);this.emit({taskStatus:'',agentError:''});
  }catch(error){if(!this.closed&&!controller.signal.aborted)this.failure(id,error)}
  finally{if(this.current===controller){this.current=null;this.busy(false,id??'typed');}}
 }
 close(){this.closed=true;clearTimeout(this.timer);this.current?.abort();this.current=null;this.pending='';}
}
