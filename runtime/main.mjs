#!/usr/bin/env node
import {ApprovalVoice} from './approval-voice.mjs';
import {IdleConversation,idleInstruction} from './idle.mjs';
import {EchoPath} from './echo-path.mjs';
import {OpenMic,canListen} from './open-mic.mjs';
import {WakeListener,HandsFreeTurn,microphoneAvailable} from './wake.mjs';
import {loadApiKey,saveApiKey} from './credentials.mjs';
import {StartupCue} from './startup.mjs';
import {createInterface} from 'node:readline';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {readFile,writeFile,unlink,mkdir} from 'node:fs/promises';
import {Memory} from './memory.mjs';
import {Audio} from './audio.mjs';
import {Codex} from './codex.mjs';
import {Oma} from './oma.mjs';
import {resolveLocale,restoreInstruction,reconnectInstruction} from './locale.mjs';
process.umask(0o077);
const data=process.env.OMA_DATA_DIR||join(process.env.XDG_DATA_HOME||join(homedir(),'.local/share'),'oma');
const restartContextPath=join(data,'restart-context.json');
async function saveRestartContext(context){
 await mkdir(data,{recursive:true});
 await writeFile(restartContextPath,JSON.stringify(context),'utf8');
}
async function loadRestartContext(){
 try{return JSON.parse(await readFile(restartContextPath,'utf8'));}
 catch{return null;}
}
async function clearRestartContext(){
 try{await unlink(restartContextPath);}catch{}
}
let approvalVoice;
const emit=patch=>{
 process.stdout.write(JSON.stringify(patch)+'\n');
 if(patch.approval!==undefined)queueMicrotask(()=>{
  if(!approvalVoice)return;
  if(patch.approval===null){approvalVoice.clear();return;}
  if(!codex.approvals.has(patch.approval.id))return;
  oma.interrupt();if(oma.turn.response)oma.turn.blocked.add(oma.turn.response);oma.turn.response=null;oma.setState('approval');
  approvalVoice.show(patch.approval);
 });
};
const memory=new Memory(join(data,'memory.sqlite'));
let key=await loadApiKey();
if(!key)emit({state:'unauthenticated',keyConfigured:false,error:'Open Settings to configure your OpenAI API key.'});
const echoPath=new EchoPath();
try{await echoPath.start();}catch(e){emit({state:'error',error:e.message});process.exit(1);}
const audioOptions={inputTarget:echoPath.source,outputTarget:echoPath.sink};
const audio=new Audio((level,shapes)=>emit({level,...shapes}),error=>emit({state:'error',error}),audioOptions);
const codex=new Codex({home:join(data,'codex'),cwd:process.env.OMA_WORKSPACE||join(homedir(),'Projects'),key,memory,emit});
const oma=new Oma({key,memory,audio,codex,emit});
oma.onPrepareRestartContext=ctx=>command({action:'prepareRestartContext',...ctx});
let restartContext=await loadRestartContext();
if(restartContext){
 // One-shot restore context: consume at startup so it is not repeated forever.
 await clearRestartContext();
}
approvalVoice=new ApprovalVoice({key,locale:oma.locale,emit,audio:new Audio((level,shapes)=>emit({level,...shapes}),error=>emit({error}),audioOptions),onDecision:(id,allow)=>codex.approve(id,allow)});
let presented=false;let savingKey=false;let demoTimer=null;const startupCue=new StartupCue(echoPath.sink);
const handsFree=new HandsFreeTurn({release:()=>oma.release().catch(e=>oma.error(e)),cancel:()=>command({action:'stop'})});
audio.onInputLevel=rawLevel=>{
 // Input meter uses RMS-derived mic level from existing recorder path.
 const normalized=Math.min(1,Math.sqrt(Math.max(0,rawLevel))/130);
 emit({inputLevel:normalized});
 handsFree.level(rawLevel);
 if(rawLevel>650)idle.activity();
};
oma.onWakeReady=()=>handsFree.start();
const wake=new WakeListener({data,enabled:memory.get('wakeEnabled')!=='false',ready:()=>({key:!!key,idle:!presented&&!savingKey&&(approvalVoice.pending?approvalVoice.phase==='waiting':oma.state==='idle'&&!codex.busy)}),emit,onWake:async()=>{
 idle.activity();emit({wakeDetected:true});
 if(approvalVoice.pending){approvalVoice.ask().catch(e=>approvalVoice.failed(e));return;}
 try{await oma.greet(false);}catch(e){oma.error(e);}
}});
wake.start();
const idle=new IdleConversation({ready:()=>!!key&&oma.state==='idle'&&!oma.turn.recording&&!oma.active&&!oma.responseRequested&&!audio.pumping&&!oma.toolsRunning&&!codex.busy&&!savingKey,
 speak:farewell=>oma.greet(false,idleInstruction(oma.locale,farewell)),dismiss:()=>emit({dismiss:true})});
const standbyAudio=new Audio(()=>{},error=>{openMic.pause();emit({error});},audioOptions);
let microphoneChecked=0,microphoneFree=false;
const openMic=new OpenMic({audio:standbyAudio,handoff:true,
 ready:()=>canListen({presented,key:!!key,savingKey,demo:!!demoTimer,state:oma.state,recording:oma.turn.recording,approvalPhase:approvalVoice.pending?approvalVoice.phase:null}),
 available:async()=>{if(Date.now()-microphoneChecked>1000){microphoneFree=await microphoneAvailable();microphoneChecked=Date.now();}return microphoneFree;},
 onListening:listeningReady=>emit({listeningReady}),onError:e=>oma.error(e),
 onSpeech:async pcm=>{
  idle.activity();wake.pause();startupCue.stop();
  if(approvalVoice.pending){await standbyAudio.stopRecording();await approvalVoice.press(pcm);return;}
  audio.takeRecording(standbyAudio);
  handsFree.speechRms=openMic.speechRms;
  if(codex.busy)codex.cancel().catch(e=>oma.error(e));
  handsFree.start();handsFree.level(1000);await oma.press(pcm);
 }
});
const microphoneTimer=setInterval(()=>openMic.tick(),250);
const idleTimer=setInterval(()=>idle.tick().catch(e=>{idle.show(false);oma.error(e);}),250);
async function command(c){
 if(c.action==='presentation'){presented=c.active===true;idle.show(presented);const paused=openMic.pause();openMic.after=Date.now()+600;if(presented)wake.pause();else if(oma.noticeResponse||oma.turn.recording)await command({action:'stop'});await paused;return;}
 if(['press','text','approve','answer'].includes(c.action))idle.activity();
 if(c.action==='setWake'){memory.set('wakeEnabled',c.enabled===true?'true':'false');wake.setEnabled(c.enabled===true);return;}
 if(c.action==='saveApiKey'){
  if(savingKey)return;savingKey=true;emit({keySaving:true,keyError:'',keySaved:false});
  try{await saveApiKey(c.key);emit({keyConfigured:true,keySaved:true,keyError:''});}
  catch(e){emit({keyError:e.message});}
  finally{c.key='';savingKey=false;emit({keySaving:false});}return;
 }
 if(c.action==='prepareRestartContext'){
  // Persist minimal text-only context to continue naturally after restart.
  const locale=resolveLocale()||oma.locale||'en-US';
  const summary=String(c.summary||'').slice(0,400);
  const lastUserUtterance=String(c.lastUserUtterance||'').slice(0,300);
  const progress=String(c.progress||'').slice(0,200);
  await saveRestartContext({requestedAt:Date.now(),summary,lastUserUtterance,progress,locale});
  return;
 }
 if(c.action==='opening'||c.action==='closing'){startupCue.play();return;}
 if(c.action==='demo'){
  await openMic.pause();
  emit({state:'speaking',userText:'What can you help me with?',assistantText:'I can answer questions, find information, and help you with your work.',error:''});let tick=0;
  clearInterval(demoTimer);demoTimer=setInterval(()=>{emit({level:Math.max(0,Math.sin(tick++*.34)*.45+.20),inputLevel:0,lipRound:Math.max(0,Math.sin(tick*.13))*.6,lipWide:Math.max(0,Math.sin(tick*.19))*.3});if(tick>180){clearInterval(demoTimer);demoTimer=null;emit({state:'idle',level:0,inputLevel:0,lipRound:0,lipWide:0});}},40);return;
 }
 if(c.action==='stop'){const paused=openMic.pause();approvalVoice.clear();idle.activity();handsFree.stop();wake.pause();wake.cooldown=Date.now()+3000;startupCue.stop();if(codex.busy)codex.cancel().catch(e=>oma.error(e));clearInterval(demoTimer);demoTimer=null;oma.turn.stop();oma.interrupt();await Promise.all([paused,audio.stopRecording()]);oma.setState('idle',{level:0,inputLevel:0,lipRound:0,lipWide:0});return;}
 if(c.action==='approve'){approvalVoice.clear();codex.approve(String(c.id),c.allow===true);return;}
 if(c.action==='answer'){codex.answerQuestion(String(c.id),c.answers||{});return;}
 if(c.action==='cancelTask'){await codex.cancel();return;}
 if(!key)throw Error('OpenAI API key is unavailable. Open Settings to configure your API key.');
 if(c.action==='press'&&approvalVoice.pending){await approvalVoice.press();return;}
 if(c.action==='release'&&approvalVoice.pending){await approvalVoice.release();return;}
 if(c.action==='press'){await openMic.pause();handsFree.start();wake.pause();startupCue.stop();if(codex.busy)codex.cancel().catch(e=>oma.error(e));await oma.press();}
 else if(c.action==='release')await oma.release();
 else if(c.action==='text'){await openMic.pause();await oma.text(String(c.text||'').slice(0,10000));}
 else if(c.action==='connect')await oma.connect();
 else if(c.action==='greet')await oma.greet();
 else if(c.action==='restoreGreet'){
  if(restartContext){
   const locale=restartContext.locale||resolveLocale()||oma.locale;
   // Prefer a short connective line; keep summary stored for optional/manual use.
   await oma.text(reconnectInstruction(locale));
   restartContext=null;
   await clearRestartContext();
  }else await oma.greet();
 }
}
const input=createInterface({input:process.stdin});input.on('line',line=>{if(line.length>20000)return;try{command(JSON.parse(line)).catch(e=>oma.error(e));}catch{emit({error:'Invalid command'});}});
let closing=false;
async function close(){if(closing)return;closing=true;echoPath.close();presented=false;clearInterval(microphoneTimer);await openMic.pause();clearInterval(idleTimer);idle.show(false);wake.close();handsFree.stop();startupCue.stop();clearInterval(demoTimer);await approvalVoice.close();await oma.close();echoPath.close();memory.close();process.exit(0);}
input.on('close',close);process.on('SIGTERM',close);process.on('SIGINT',close);
process.on('uncaughtException',e=>{emit({state:'error',error:'O.M.A. runtime error: '+e.message.slice(0,200)});close();});
if(key)emit({keyConfigured:true,state:'idle',level:0,inputLevel:0,lipRound:0,lipWide:0,error:''});
