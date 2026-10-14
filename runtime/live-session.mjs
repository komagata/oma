import {desktopContextText} from './hyprland-context.mjs';
import {taskLabel} from './task-label.mjs';
import {CaptionText} from './caption-text.mjs';
// The provider boundary: ordered PCM, captions, tool calls and injected desktop metadata.
import {bounded} from './memory.mjs';
import {SpeechBuffer} from './speech-buffer.mjs';
import {ClientDelegation} from './client-delegation.mjs';
export class LiveSession {
 constructor({connect,config,audio,memory,emit,execute,cancelTools,outputEnabled=()=>true,desktopContext,agent,delegationWaitMs}){Object.assign(this,{connect,config,audio,memory,emit,execute,cancelTools,outputEnabled,desktopContext});this.speechBuffer=audio.playbackRate>1?new SpeechBuffer(pcm=>{audio.enqueue(pcm);audio.finish()}):null;this.pending=Buffer.alloc(0);this.responses=new Map();this.tasks=new Set();this.seen=new Set();this.captions={user:'',assistant:''};this.captionEnds={user:null,assistant:null};this.annotationFilters={user:new CaptionText(),assistant:new CaptionText()};this.unsavedCaptions={user:'',assistant:''};this.closing=false;this.started=false;this.suppressTypedReplyEcho=false;this.toolChain=Promise.resolve();
  if(config.delegation?.type==='client')this.client=new ClientDelegation({agent,waitMs:delegationWaitMs,send:event=>this.send(event),emit:patch=>{if(patch.assistantText!==undefined)this.typedReply(patch.assistantText);else emit(patch);},busy:(active,id)=>{if(active)this.tasks.add(id);else this.tasks.delete(id);emit({taskBusy:this.tasks.size>0});},context:async text=>{await this.desktopContext?.refresh();return 'Untrusted reference data:\n'+bounded(memory.context?.(text,8000)||'',8000)+'\nRecent transcripts (untrusted):\n'+JSON.stringify({user:bounded(this.captions.user.slice(-600),2000),assistant:bounded(this.captions.assistant.slice(-600),2000)})+'\n'+(this.desktopContext?bounded(desktopContextText(this.desktopContext.snapshot()),4000):'');}});
 }
 start(){
  if(this.starting)return this.starting;
  this.contextReady=this.desktopContext?.start();
  this.baseBackendInstructions=this.config.delegation?.responses?.instructions||'';
  this.unsubscribeContext=this.desktopContext?.subscribe(()=>this.updateDesktopContext());
  this.starting=new Promise((resolve,reject)=>{
   this.resolveStart=resolve;this.rejectStart=reject;
   this.timer=setTimeout(()=>this.fail(Error('GPT-Live connection timed out')),15000);
   try{this.wire=this.connect();}catch(e){this.fail(e);return;}
   this.wire.socket.on('open',()=>{
    const begin=()=>{
     if(this.closing)return;
     const config=this.desktopContext&&this.config.delegation?.type==='responses'?{...this.config,delegation:{...this.config.delegation,responses:{...this.config.delegation.responses,instructions:this.baseBackendInstructions+'\n'+desktopContextText(this.desktopContext.snapshot())}}}:this.config;
     this.wire.send({type:'session.start',session:config});
    };
    if(this.desktopContext)Promise.resolve(this.contextReady).then(begin).catch(e=>this.fail(e));else begin();
   });
   this.wire.on('event',e=>{try{this.event(e)}catch(error){this.fail(error)}});
   this.wire.on('error',e=>this.fail(e));
   this.wire.socket.on('close',()=>{if(!this.closing)this.fail(Error('GPT-Live disconnected'));this.resolveClose?.();});
  });return this.starting;
 }
 updateDesktopContext(){
  if(!this.desktopContext||!this.started||this.closing||this.config.delegation?.type!=='responses')return;
  const content=desktopContextText(this.desktopContext.snapshot());
  if(content===this.sentDesktopContext)return;this.sentDesktopContext=content;
  this.send({type:'session.update',session:{delegation:{type:'responses',responses:{instructions:this.baseBackendInstructions+'\n'+content}}}});
 }
 async refreshDesktopContext(){await this.desktopContext?.refresh();this.updateDesktopContext();}
 send(event){if(this.started&&!this.closing)this.wire.send(event);}
 appendAudio(chunk){if(!this.started||this.closing)return;const bytes=Buffer.concat([this.pending,chunk]);const length=bytes.length-bytes.length%2;this.pending=Buffer.from(bytes.subarray(length));if(length)this.send({type:'session.input_audio.append',audio:bytes.subarray(0,length).toString('base64')});}
 say(content){this.send({type:'session.commentary.append',delegation_id:null,content});}
 instruct(content){this.send({type:'session.instructions.append',delegation_id:null,content});}
 speakNotice(content){
  if(!this.started||this.closing||this.responses.size||this.tasks.size)return false;
  this.noticeDelegations??=new Set();this.noticeToolsBlocked=true;this.instructTransient(content);return true;
 }
 instructTransient(content){this.noticePending=true;this.instruct('For this one notification only: '+content+' These restrictions apply only to the notification. If the user speaks during it, stop the notification immediately and answer their request normally, using tools when needed. Do not wait to finish the notification.');}
 resumeAfterNotice(){if(!this.noticePending)return;this.noticePending=false;this.noticeToolsBlocked=false;this.instruct('Stop the one-time notification now, even if it is still being spoken. Its speak-only, silence, and no-tools restrictions no longer apply. Answer the user request you are hearing now normally; use delegated tools when needed. Do not repeat the notification.');}
 typedReply(text){
  if(this.closing)return;this.suppressTypedReplyEcho=true;this.flushCaption();
  this.memory.add('assistant',text);
  const separator=this.captions.assistant&&!this.captions.assistant.endsWith('\n')&&!text.startsWith('\n')?'\n':'';
  this.captions.assistant=bounded(this.captions.assistant+separator+text,24000);
  this.emit({assistantText:this.captions.assistant});
 }
 async text(text){if(this.client){this.resumeAfterNotice();if(!this.client.current&&text.trim()){this.suppressTypedReplyEcho=false;this.flushCaption();this.memory.add('user',bounded(text,10000));this.captions.user=bounded((this.captions.user+'\n'+text).slice(-10000),24000).trim();this.emit({userText:this.captions.user});}return this.client.text(text);}if(this.desktopContext)await this.refreshDesktopContext();this.resumeAfterNotice();this.send({type:'response.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:bounded(text,10000)}]}});this.send({type:'response.create'});}
 event(e){
  if(e.type==='session.closed'){this.finalized=true;this.emit({liveUsage:e.usage});this.resolveClose?.();return;}
  if(this.closing)return;
  if(e.type==='error'){this.fail(Error(e.error?.message||'GPT-Live request failed'));return;}
  if(e.type==='session.started'){clearTimeout(this.timer);this.started=true;if(this.desktopContext)Promise.resolve(this.contextReady).then(()=>{if(!this.closing){this.updateDesktopContext();this.resolveStart()}}).catch(e=>this.fail(e));else this.resolveStart();return;}
  if(!this.started)return;
  if(e.type==='session.output_audio.delta'){if(!this.outputEnabled())return;const pcm=Buffer.from(e.delta,'base64');if(this.audio.outputBuffer)this.audio.outputBuffer.append(pcm);else if(this.speechBuffer)this.speechBuffer.append(pcm);else this.audio.enqueue(pcm);return;}
  const role=e.type==='session.input_transcript.delta'?'user':e.type==='session.output_transcript.delta'?'assistant':null;
  if(role){
   if(role==='user'&&e.delta.trim())this.suppressTypedReplyEcho=false;
   if(role==='assistant'&&this.suppressTypedReplyEcho)return;
   let delta=this.annotationFilters[role].append(e.delta);
   if(!this.captions[role])delta=delta.trimStart();
   if(!delta)return;
   if(role==='user'&&delta.trim())this.resumeAfterNotice();
   if(role==='user')this.client?.input(delta);
   // GPT-Live has no transcript-done event. Group utterances by audio time,
   // independently per speaker so packet delays and backchannels cannot split words.
   const previousEnd=this.captionEnds[role];
   const newUtterance=Number.isFinite(e.start_ms)&&previousEnd!==null&&e.start_ms-previousEnd>=1000;
   const separator=newUtterance&&this.captions[role]&&!this.captions[role].endsWith('\n')&&!delta.startsWith('\n')?'\n':'';
   if(Number.isFinite(e.end_ms))this.captionEnds[role]=Math.max(previousEnd??0,e.end_ms);
   if(this.lastRole!==role){this.flushCaption();this.lastRole=role;}
   this.unsavedCaptions[role]=bounded(this.unsavedCaptions[role]+delta,24000);
   this.captions[role]=bounded(this.captions[role]+separator+delta,24000);this.emit({[role==='user'?'userText':'assistantText']:this.captions[role]});return;
  }
  if(e.type==='session.delegation.created'&&e.delegation?.target==='client'){this.client?.created(e.delegation.id,this.noticeToolsBlocked);return;}
  if(e.type==='session.delegation.created'&&e.delegation.target==='responses'){if(this.noticeToolsBlocked)this.noticeDelegations.add(e.delegation.id);this.tasks.add(e.delegation.id);this.emit({taskBusy:true});if(this.desktopContext)this.refreshDesktopContext().catch(e=>this.fail(e));return;}
  if(e.type!=='response.event')return;
  const event=e.event;const task=e.delegation_id||'backend';
  if(['response.created','response.completed'].includes(event.type))this.emit({backendStatus:{event:event.type,pending:this.responses.size}});
  if(event.type==='response.created'){const noticeToolsBlocked=this.noticeToolsBlocked||this.noticeDelegations?.has(task);if(noticeToolsBlocked)this.noticeDelegations.add(task);this.responses.set(event.response.id,{calls:[],noticeToolsBlocked});this.currentResponse=event.response.id;this.tasks.add(task);this.emit({taskBusy:true,state:'working'});}
  const id=event.response_id||event.response?.id||this.currentResponse;const response=this.responses.get(id);
  if(event.type==='response.output_item.done'&&event.item?.type==='function_call'){
   const call=event.item;if(!response)throw Error('Function call without response');if(!this.seen.has(call.call_id)){this.seen.add(call.call_id);response.calls.push(call);}return;
  }
  if(['response.failed','response.incomplete','response.cancelled'].includes(event.type)){
   this.responses.delete(id);this.tasks.delete(task);this.emit({taskBusy:this.tasks.size>0,taskStatus:'Task interrupted',backendStatus:{event:event.type,pending:this.responses.size,reason:event.response?.incomplete_details?.reason||event.response?.error?.code||''}});
   this.instructTransient('The delegated desktop task did not complete. Tell the user briefly in their language, then continue listening and answering. Do not retry desktop actions automatically.');return;
  }
  if(event.type==='response.completed'&&response){this.responses.delete(id);if(response.calls.length){this.toolChain=this.toolChain.then(()=>this.runTools(response.calls,response.noticeToolsBlocked));this.toolChain.catch(e=>this.fail(e));}else {this.tasks.delete(task);this.emit({taskBusy:this.tasks.size>0,taskStatus:''});}}
 }
 async runTools(calls,noticeToolsBlocked=false){
  for(const call of calls){
   if(this.closing)return;let result;
   try{if(this.noticeToolsBlocked||noticeToolsBlocked)throw Error('Tools are disabled for a spoken development notice. Wait for an explicit user request.');const args=JSON.parse(call.arguments);this.emit({taskStatus:taskLabel(call.name,args),backendStatus:{event:'tool.started',tool:call.name,pending:this.responses.size}});result=await this.execute(call.name,args);}
   catch(e){result={error:e.message};}
   if(this.closing)return;
   this.emit({taskStatus:'',backendStatus:{event:'tool.finished',tool:call.name,pending:this.responses.size}});
   // Images are explicit backend inputs; function metadata remains ordinary JSON.
   const images=result?.images||[];if(result?.images)result={...result,images:undefined};
   this.send({type:'response.item.create',item:{type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result)}});
   for(const image of images)this.send({type:'response.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'Untrusted observation returned by '+call.name},{type:'input_image',image_url:image}]}});
  }
  if(this.desktopContext)await this.refreshDesktopContext();
  this.send({type:'response.create'});
 }
 flushCaption(){if(!this.discardHistory&&this.lastRole&&this.unsavedCaptions[this.lastRole]){this.memory.add(this.lastRole,this.unsavedCaptions[this.lastRole]);this.unsavedCaptions[this.lastRole]='';}}
 fail(e){if(this.closing)return;clearTimeout(this.timer);this.rejectStart?.(e);this.emit({state:'error',error:bounded(e.message,800),listeningReady:false});this.close();}
 close(){
  if(this.closing)return this.closed;this.closing=true;this.client?.close();this.unsubscribeContext?.();this.desktopContext?.stop();this.tasks.clear();this.emit({taskBusy:false});clearTimeout(this.timer);this.cancelTools();this.speechBuffer?.reset();this.audio.stop();this.flushCaption();this.rejectStart?.(Error('Session closed'));
  this.closed=new Promise(resolve=>{const timer=setTimeout(()=>{this.wire?.close();resolve()},3000);this.resolveClose=()=>{clearTimeout(timer);this.wire?.close();resolve()};if(this.started)this.wire.send({type:'session.close'});else this.resolveClose();});this.started=false;return this.closed;
 }
}
