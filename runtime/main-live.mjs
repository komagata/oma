import {createAgentBackends,changeAgentBackend,withAgentTools,resolveAgentWorkspace} from './agent-backends.mjs';
import {HyprlandContext} from './hyprland-context.mjs';
import {FarewellIntent} from './farewell-intent.mjs';
import {FarewellPlayback} from './farewell-playback.mjs';
import {canFinishConversation,finishConversation} from './conversation-end.mjs';
import {captionText} from './caption-text.mjs';
import {TranscriptLog} from './transcript.mjs';
import {LiveIdle} from './live-idle.mjs';
import {DevJobNotifier,DevJobNoticeDelivery,noticeInstruction} from './dev-job-notifier.mjs';
import {idleInstruction} from './idle.mjs';
import {GreetingCache,StartupGreeting} from './startup-greeting.mjs';
import {prepareGreeting} from './prepare-greeting.mjs';
import {StreamingVoiceEffects} from './streaming-voice-effects.mjs';
import {languageOptions,validateResponseLanguage,greetingInstruction,responseLocale} from './locale.mjs';
import OpenAI from 'openai';import {LiveWS} from 'openai/resources/live/ws';
import {createInterface} from 'node:readline';import {homedir} from 'node:os';import {join} from 'node:path';
import {listMicrophones,microphoneNode} from './microphones.mjs';
import {LiveSession} from './live-session.mjs';import {liveConfig,findOmarchySkill} from './live-config.mjs';
import {LocalTools,localToolDefinitions} from './local-tools.mjs';import {Memory} from './memory.mjs';import {Audio} from './audio.mjs';
import {WakeListener,microphoneAvailable} from './wake.mjs';
import {loadApiKey,saveApiKey} from './credentials.mjs';import {StartupCue} from './startup.mjs';
import {restartAssistant} from './restart.mjs';import {runDesktopCommand} from './desktop.mjs';
process.umask(0o077);
const data=process.env.OMA_DATA_DIR||join(process.env.XDG_DATA_HOME||join(homedir(),'.local/share'),'oma');
const workspace=resolveAgentWorkspace({dataDir:data});
const memory=new Memory(join(data,'memory.sqlite'));
const agentRegistry=createAgentBackends({workspace});
// Upgrade the retired task agent once, before status or any voice session reads it.
const savedAgentBackend=memory.get('agentBackend');
const initialAgentBackend=!savedAgentBackend||savedAgentBackend==='openai'?'codex':savedAgentBackend;
agentRegistry.get(initialAgentBackend);
if(savedAgentBackend!==initialAgentBackend)memory.set('agentBackend',initialAgentBackend);
let switchingAgent=false;
let key=await loadApiKey(),session=null,starting=null,presented=false,closing=false,testing=false,saving=false,ending=null,lastActivity=Date.now(),lastSpoken=0,approval=null;
const desktopContext=new HyprlandContext();
let docked=false;
let farewellIntent=null;
let idle=null,activeToolCalls=0,lastUserRequest=Date.now(),lastUserCaption='',lastInput=0,lastAssistant=0;
let transcriptLog=new TranscriptLog(memory.db);
const emit=p=>{if(p.docked!==undefined)docked=p.docked;for(const k of ['userText','assistantText'])if(p[k]!==undefined)p[k]=captionText(p[k]);if(p.assistantText?.trim())lastAssistant=Date.now();if(p.userText!==undefined){if(p.userText.trim()&&p.userText!==lastUserCaption)lastUserRequest=Date.now();lastUserCaption=p.userText;}transcriptLog?.update(p);if(p.userText!==undefined){idle?.input(p.userText);farewellIntent?.input(p.userText);}if(p.approval!==undefined)approval=p.approval;process.stdout.write(JSON.stringify(p)+'\n');if(p.state==='error')audio?.stopRecording().catch(()=>{});};
const audio=new Audio((level,shapes)=>{
 if(level>.04){idle?.output();lastSpoken=Date.now();lastActivity=Date.now();}
 emit({level,...shapes,state:approval?'approval':level>.04?'speaking':'idle'});
},error=>{emit({state:'error',error});stop().catch(()=>{});},{volume:3,playbackRate:1,startupBufferMs:250,inputTarget:memory.get('microphoneTarget')||null});
const voiceEffectsEnabled=()=>memory.get('voiceEffectsEnabled')!=='false';
audio.outputBuffer=new StreamingVoiceEffects({enabled:voiceEffectsEnabled(),deliver:pcm=>audio.enqueue(pcm),onError:fail});
audio.onInputLevel=rms=>{const level=Math.min(1,Math.sqrt(Math.max(0,rms))/130);if(level>.08)lastInput=Date.now();emit({inputLevel:level})};
const cue=new StartupCue();
const greetingCache=new GreetingCache(data);
const farewellCache=new GreetingCache(data,{farewell:true});
const startupGreeting=new StartupGreeting({play:async(pcm,text)=>{const request=greetingRequest;await cue.finished;if(request!==greetingRequest||closing||!startupGreeting.active)return;audio.enqueue(pcm);audio.finish();emit({assistantText:text});}});
const farewellPlayback=new FarewellPlayback({audio,
 disconnect:()=>{cue.stop();idle?.show(false);greetingRequest++;startupGreeting.stop();ending=null;const old=session;session=null;audio.stopRecording().catch(fail);old?.close().catch(fail);},
 // Replace any partial model reply so the farewell reads as one clean line.
 caption:text=>emit({assistantText:text}),
 dismiss:()=>emit({dismiss:true})
});
audio.onDrained=()=>{if(farewellPlayback.active)farewellPlayback.drained();else startupGreeting.drained();};
function cachedFarewell(){return farewellCache.load(responseLocale(memory.get('responseLanguage')),process.env.OMA_LIVE_VOICE||'cedar',voiceEffectsEnabled());}
let preparation=null,preparationKey=null,greetingRequest=0;
function prepare(){
 const locale=responseLocale(memory.get('responseLanguage')),voice=process.env.OMA_LIVE_VOICE||'cedar';
 const effectsEnabled=voiceEffectsEnabled();
 const id=JSON.stringify([locale,voice,effectsEnabled]);if(preparationKey===id)return;
 preparation?.abort();const controller=new AbortController();preparation=controller;preparationKey=id;
 Promise.all([greetingCache,farewellCache].map(cache=>prepareGreeting({key,locale,voice,cache,effectsEnabled,signal:controller.signal}))).catch(()=>{if(preparation===controller)preparationKey=null;});
}
async function greet(){
 const request=++greetingRequest;
 const entry=greetingCache.load(responseLocale(memory.get('responseLanguage')),process.env.OMA_LIVE_VOICE||'cedar',voiceEffectsEnabled());
 if(entry&&!startupGreeting.active&&!session?.captions.assistant){
  if(!await microphoneAvailable(audio.inputTarget)||request!==greetingRequest||closing)return;
  startupGreeting.begin(entry);
  await start();
  if(request!==greetingRequest||closing)return;
  if(session?.started){session.captions.assistant=entry.text+'\n';session.instruct('The application has already played the opening greeting. Do not repeat it. Listen for the user request.');startupGreeting.connect(pcm=>session?.appendAudio(pcm));}
 }else if(!startupGreeting.active){await cue.finished;if(request!==greetingRequest||closing)return;await start({greeting:true});}
}
function status(){const agentBackend=memory.get('agentBackend')||'codex',agent=agentRegistry.get(agentBackend);const ready=!!key&&!!findOmarchySkill();emit({agentBackend,agentOptions:agentRegistry.options(),agentError:'',voiceEffectsEnabled:voiceEffectsEnabled(),responseLanguages:languageOptions(),responseLanguage:memory.get('responseLanguage')||'',voiceProvider:'gpt-live',modelReady:ready,speechReady:ready,keyConfigured:ready,omarchySkillLoaded:!!findOmarchySkill(),modelProvider:agent.label,modelName:agent.label,state:ready?'idle':'unauthenticated',error:!findOmarchySkill()?'Omarchy skill not found':'',listeningReady:false});}
const tools=new LocalTools({memory,emit,cwd:workspace,onEnd:()=>{const entry=session?.farewellEntry;if(entry)farewellPlayback.start(entry);else ending={at:Date.now(),speechAfter:lastUserRequest,restart:false}},onRestart:()=>{ending={at:Date.now(),restart:true}},onForget:()=>{
 if(session){session.discardHistory=true;session.lastRole=null;session.captions={user:'',assistant:''};}
 setTimeout(()=>{stop().then(()=>emit({assistantText:'Memory cleared. Changes apply to your next conversation.',dismiss:true})).catch(fail)},0);
}});
const devNotices=new DevJobNotifier({jobs:tools.devJobs,memory,deliver:notice=>{
 if(!session?.speakNotice(noticeInstruction(notice,responseLocale(memory.get('responseLanguage')))))return false;
 idle?.activity();return true;
}});
const devNoticeDelivery=new DevJobNoticeDelivery({notifier:devNotices,wake:()=>emit({wakeDetected:true,developmentNotice:true})});
// Register the returned durable ID before handing the launch result to Live,
// including when the voice session closed while the detached launch was pending.
const startDevelopmentJob=tools.devJobs.start.bind(tools.devJobs);
tools.devJobs.start=async input=>{const job=await startDevelopmentJob(input);devNotices.register(job.job_id);return job;};
let noticesRefreshed=false;
const pollDevNotices=()=>devNotices.poll().then(ok=>{if(ok)noticesRefreshed=true;});
const devNoticeTimer=setInterval(pollDevNotices,25000);pollDevNotices();
const wake=new WakeListener({data,inputTarget:audio.inputTarget,enabled:memory.get('wakeEnabled')!=='false',ready:()=>({key:!!key,idle:!presented&&!session&&!starting&&!testing&&!saving}),emit,onWake:()=>{emit({wakeDetected:true})}});wake.start();
function fail(error){emit({state:'error',error:String(error.message||error).slice(0,800),listeningReady:false});}
async function start({microphone=true,greeting=false}={}){
 if(starting){await starting;if(greeting)session?.instructTransient(greetingInstruction(responseLocale(memory.get('responseLanguage'))));return;}if(session?.started){if(greeting)session.instructTransient(greetingInstruction(responseLocale(memory.get('responseLanguage'))));return;}
 starting=(async()=>{
  if(!key)throw Error('Add your OpenAI API key in Settings.');
  if(microphone&&!await microphoneAvailable(audio.inputTarget))throw Error('The microphone is muted or unavailable, or the screen is locked.');
  wake.pause();tools.begin();lastActivity=Date.now();emit({state:'connecting',error:'',userText:'',...(startupGreeting.active?{}:{assistantText:''})});
  const config=liveConfig(memory);
  const farewellEntry=cachedFarewell();
  if(greetingCache.load(responseLocale(memory.get('responseLanguage')),process.env.OMA_LIVE_VOICE||'cedar',voiceEffectsEnabled()))config.instructions+=' The application may play a prerecorded opening greeting. Do not initiate an opening greeting unless explicitly instructed. Wait for the user to speak.';
  const agent=withAgentTools(agentRegistry.get(memory.get('agentBackend')||'codex'),{memory,definitions:localToolDefinitions,begin:()=>tools.begin(),cancel:()=>tools.cancel(),execute:async(...a)=>{activeToolCalls++;try{return await tools.call(...a)}finally{activeToolCalls--}}});
  const next=new LiveSession({agent,desktopContext,outputEnabled:()=>!startupGreeting.playing&&!farewellIntent?.pending,config,connect:()=>new LiveWS(new OpenAI({apiKey:key}),{reconnect:false}),audio,memory,emit,execute:async(...a)=>{activeToolCalls++;try{return await tools.call(...a)}finally{activeToolCalls--}},cancelTools:()=>tools.cancel()});next.farewellEntry=farewellEntry;session=next;
  if(microphone)audio.record(pcm=>startupGreeting.active?startupGreeting.input(pcm):next.appendAudio(pcm));
  await next.start();if(session!==next||closing)return;prepare();idle?.show(presented);
  if(startupGreeting.active){next.instruct('The application is playing the opening greeting. Do not greet or speak until the user makes a request.');startupGreeting.connect(pcm=>next.appendAudio(pcm));}
  emit({state:'idle',listeningReady:microphone});
  if(greeting)next.instructTransient(greetingInstruction(responseLocale(memory.get('responseLanguage'))));
 })().catch(async e=>{await stop();throw e}).finally(()=>{starting=null});return starting;
}
async function stop(){preparation?.abort();preparation=null;preparationKey=null;farewellIntent?.reset();farewellPlayback.cancel();idle?.show(false);greetingRequest++;startupGreeting.stop();ending=null;const old=session;session=null;tools.cancel();await audio.stopRecording();audio.stop();await old?.close();emit({state:'idle',listeningReady:false,level:0,inputLevel:0,lipRound:0,lipWide:0});}
idle=new LiveIdle({
 ready:()=>!docked&&!!session?.started&&!starting&&!testing&&!saving&&!approval&&!ending&&!session.responses.size&&!session.tasks.size&&!activeToolCalls&&!startupGreeting.playing&&!devNoticeDelivery.pending,
 speak:farewell=>{const entry=farewell&&session?.farewellEntry;if(entry)farewellPlayback.start(entry);else session?.instructTransient(idleInstruction(responseLocale(memory.get('responseLanguage')),farewell)+' Speak this notice once. The application handles dismissal; do not call tools for this notice.');},
 dismiss:()=>finishConversation(stop,()=>emit({dismiss:true})).catch(fail)
});
farewellIntent=new FarewellIntent(()=>{if(!session?.started)return;const entry=session.farewellEntry;if(entry)farewellPlayback.start(entry);else {ending={at:Date.now(),speechAfter:lastUserRequest,restart:false};session.instructTransient(idleInstruction(responseLocale(memory.get('responseLanguage')),true));}});
const timer=setInterval(()=>{
 if(session?.started&&!approval&&!starting)farewellIntent.tick();
 devNoticeDelivery.tick({presented,session,started:!!session?.started,available:!!key&&noticesRefreshed&&!closing,
  busy:!!(starting||testing||saving||approval||ending||farewellIntent?.pending||farewellPlayback.active||activeToolCalls||session?.responses.size||session?.tasks.size||startupGreeting.playing||audio.outputBuffer.busy),
  lastActivity:Math.max(lastActivity,lastUserRequest,lastInput,lastAssistant),lastSpoken});
 idle.tick();
 if(!session?.started||testing||approval||activeToolCalls||audio.outputBuffer.busy)return;
 if(canFinishConversation(ending,lastSpoken)){const restart=ending.restart;if(restart)stop().then(()=>restartAssistant(runDesktopCommand)).catch(fail);else finishConversation(stop,()=>emit({dismiss:true})).catch(fail);return;}

},100);
let microphoneBusy=false;
async function refreshMicrophones(){
 const choices=(await listMicrophones()).map(({value,label})=>({value,label}));
 const target=memory.get('microphoneTarget')||'';
 if(target&&!choices.some(m=>m.value===target))choices.push({value:target,label:'Disconnected: '+target});
 emit({microphones:[{value:'',label:'System default'},...choices],microphoneTarget:target});
}
async function command(c){
 if(c.action==='setAgentBackend'){
  const busy=!!(switchingAgent||testing||saving||starting||closing||activeToolCalls||approval||ending||session?.tasks.size||session?.responses.size||startupGreeting.playing||farewellPlayback.active||audio.outputBuffer.busy);
  if(busy){emit({agentError:'Task agent cannot change while busy. Stop the task or wait for it to finish.'});return;}
  switchingAgent=true;
  try{await changeAgentBackend({value:c.value,memory,registry:agentRegistry,busy:false,active:presented||!!session?.started,stop,start,emit});}
  catch(e){emit({agentError:e.message});}finally{switchingAgent=false;}return;
 }
 if(switchingAgent&&['text','press','greet','restoreGreet','presentation','testConnection','setResponseLanguage','setVoiceEffects','saveApiKey'].includes(c.action)){emit({agentError:'Task agent is changing. Please wait.'});return;}

 if(c.action==='companionPanel'){await tools.companion.setPanelState(c.active,c.closing);return;}
 if(c.action==='companionVisibility'){tools.companion.setAutoVisible(c.active);return;}
 if(c.action==='autoAccompanyWindow'){await tools.companion.autoOpen(c.address);return;}
 if(c.action==='companionWindowClosed'){tools.companion.autoClose(c.address);await tools.companion.check();return;}
 if(c.action==='accompanyWindow'){await tools.companion.accompany(c.address);return;}
 if(c.action==='restoreFloating'){await tools.companion.restore();return;}
 if(c.action==='setVoiceEffects'){
  if(testing||starting||saving)return;
  const enabled=c.enabled===true;
  memory.set('voiceEffectsEnabled',enabled?'true':'false');
  preparation?.abort();preparation=null;preparationKey=null;
  greetingRequest++;startupGreeting.stop();audio.stop();audio.outputBuffer.setEnabled(enabled);
  if(session)session.farewellEntry=null;
  emit({voiceEffectsEnabled:enabled});
  await stop();if(presented)await start();return;
 }
 if(c.action==='setResponseLanguage'){
  if(testing||starting||saving)return;
  try{
   const value=validateResponseLanguage(c.value);
   memory.set('responseLanguage',value);
   emit({responseLanguage:value,languageError:''});
   // Instructions are fixed at session creation; reconnect with the saved choice.
   await stop();if(presented)await start();
  }catch(e){emit({languageError:e.message})}return;
 }

 if(c.action==='refreshMicrophones'){
  try{await refreshMicrophones();emit({microphoneError:''})}catch(e){emit({microphoneError:e.message})}return;
 }
 if(c.action==='setMicrophone'){
  if(microphoneBusy)return;microphoneBusy=true;emit({microphoneBusy:true,microphoneError:''});
  try{
   if(typeof c.target!=='string')throw Error('Choose a microphone.');
   await microphoneNode(c.target);
   await audio.stopRecording();wake.pause();
   audio.inputTarget=c.target||null;wake.inputTarget=audio.inputTarget;memory.set('microphoneTarget',c.target);
   await refreshMicrophones();
   if(session?.started&&presented){const active=session;audio.record(pcm=>active.appendAudio(pcm));}
  }catch(e){emit({microphoneError:e.message})}finally{microphoneBusy=false;emit({microphoneBusy:false})}return;
 }
 if(c.action==='presentation'){presented=c.active===true;if(presented)transcriptLog.begin();else transcriptLog.end();idle.show(presented);if(presented)await start();else await stop();return;}
 if(c.action==='stop'||c.action==='cancelTask'){await stop();return;}
 if(c.action==='greet'||c.action==='restoreGreet'){await greet();return;}
 if(c.action==='press'){await start();return;}if(c.action==='release')return;
 if(c.action==='text'){lastUserRequest=Date.now();idle.activity();await start();await session?.text(String(c.text||''));lastActivity=Date.now();return;}
 if(c.action==='approve'){idle.activity();tools.approve(String(c.id),c.allow===true);return;}
 if(c.action==='setWake'){memory.set('wakeEnabled',c.enabled===true?'true':'false');wake.setEnabled(c.enabled===true);return;}
 if(c.action==='opening'||c.action==='closing'){cue.play();return;}
 if(c.action==='prepareRestartContext')return;
 if(c.action==='connect'||c.action==='refreshConnections'){await stop();key=await loadApiKey();status();if(presented)await start();return;}
 if(c.action==='saveApiKey'){
  if(saving)return;saving=true;emit({keySaving:true,keyError:'',keySaved:false});
  try{await saveApiKey(c.key);key=await loadApiKey();preparationKey=null;status();emit({keySaved:true})}catch(e){emit({keyError:e.message})}finally{c.key='';saving=false;emit({keySaving:false})}return;
 }
 if(c.action==='testConnection'){
  if(testing)return;testing=true;emit({connectionTesting:true,connectionTestPassed:false,connectionTestError:''});
  let silence;try{await stop();await start({microphone:false});const before=lastSpoken;silence=setInterval(()=>session?.appendAudio(Buffer.alloc(960)),20);session.instruct('Speak once now in the configured response language: introduce yourself as O.M.A. and confirm the connection is working. Keep it to one short sentence.');
   const deadline=Date.now()+15000;while(lastSpoken===before&&Date.now()<deadline&&session?.started)await new Promise(r=>setTimeout(r,100));if(lastSpoken===before)throw Error('No audio received. Check your connection and API access.');
   while(Date.now()-lastSpoken<1500&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));emit({connectionTestPassed:true});
  }catch(e){emit({connectionTestError:e.message})}finally{clearInterval(silence);await stop();testing=false;emit({connectionTesting:false})}return;
 }
 if(c.action==='demo'){emit({state:'speaking',userText:'What can you do?',assistantText:'I can answer questions and help you use your computer.',level:.3});return;}
}
const input=createInterface({input:process.stdin});input.on('line',line=>{if(line.length>20000)return;try{command(JSON.parse(line)).catch(fail)}catch{fail(Error('Invalid command'))}});
async function close(){if(closing)return;closing=true;devNotices.close();clearInterval(devNoticeTimer);preparation?.abort();clearInterval(timer);wake.close();cue.stop();await stop();await starting?.catch(()=>{});memory.close();process.exit(0);}
input.on('close',close);process.on('SIGTERM',close);process.on('SIGINT',close);process.on('uncaughtException',e=>{fail(e);close()});status();refreshMicrophones().catch(e=>emit({microphoneError:e.message}));
