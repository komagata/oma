import test from 'node:test';import assert from 'node:assert/strict';
test('startup cue is short, bounded and fades to silence',async()=>{
 const {startupSound}=await import('../runtime/startup.mjs').catch(()=>({}));
 assert.equal(typeof startupSound,'function');const pcm=startupSound();
 assert.ok(pcm.length>=24000&&pcm.length<=72000);
 assert.equal(pcm.readInt16LE(0),0);assert.equal(pcm.readInt16LE(pcm.length-2),0);
 let peak=0;for(let i=0;i<pcm.length;i+=2)peak=Math.max(peak,Math.abs(pcm.readInt16LE(i)));
 assert.ok(peak>1000&&peak<=30000);
});

import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('GPT-Live startup does not cut the opening cue during microphone checks',async()=>{
 const source=readFileSync(new URL('../runtime/main-live.mjs',import.meta.url),'utf8');
 const start=source.slice(source.indexOf('async function start('),source.indexOf('async function stop('));
 let ready,playing=false,recorded=false,prepared=0;
 const context={withAgentTools:agent=>agent,localToolDefinitions:[],agentRegistry:{get(){return {id:"openai"}}},prepare(){assert.equal(context.session.started,true);prepared++},desktopContext:{},idle:null,presented:true,starting:null,session:null,key:'fixture',closing:false,
  microphoneAvailable:()=>new Promise(resolve=>{ready=resolve}),wake:{pause(){}},
  cue:{play(){playing=true},stop(){playing=false}},tools:{begin(){},cancel(){}},
  Date,cachedFarewell:()=>null,process:{env:{}},voiceEffectsEnabled:()=>true,startupGreeting:{active:false},greetingCache:{load(){return null}},responseLocale(){return 'ja'},emit(){},liveConfig(){return {}},memory:{get(){return ''}},
  audio:{record(){recorded=true}},
  LiveSession:class{async start(){this.started=true}},
  async stop(){},lastActivity:0};
 vm.createContext(context);vm.runInContext(start,context);
 const connecting=vm.runInContext('start()',context);
 assert.equal(prepared,0);context.cue.play();ready(true);await connecting;assert.equal(prepared,1);
 assert.equal(recorded,true);assert.equal(playing,true,'Opening sound must finish independently of network/microphone startup');
});
test('keyboard opening requests the same greeting as the bar button',()=>{
 const service=readFileSync(new URL('../qml/Service.qml',import.meta.url),'utf8');
 const press=service.match(/function press\(\) \{[^\n]+/)[0];
 const shown=[];const context={keyConfigured:true,show:(...args)=>shown.push(args),command(){},settings(){}};
 vm.createContext(context);vm.runInContext(press+'\npress()',context);
 assert.equal(shown[0][0],true);
});
test('closing during cached greeting microphone check prevents delayed playback',async()=>{
 const source=readFileSync(new URL('../runtime/main-live.mjs',import.meta.url),'utf8');
 const greet=source.slice(source.indexOf('async function greet('),source.indexOf('function status('));
 let ready,played=0,connected=0;
 const context={greetingRequest:0,closing:false,session:null,process:{env:{}},voiceEffectsEnabled:()=>true,memory:{get(){}},responseLocale(){return 'ja'},greetingCache:{load(){return {pcm:Buffer.alloc(4800),text:'Ready.'}}},audio:{inputTarget:null},microphoneAvailable:()=>new Promise(r=>ready=r),startupGreeting:{active:false,begin(){played++}},async start(){connected++}};
 vm.createContext(context);vm.runInContext(greet,context);const pending=vm.runInContext('greet()',context);context.greetingRequest++;ready(true);await pending;assert.equal(played,0);assert.equal(connected,0);
});
import {EventEmitter} from 'node:events';
import {StartupCue} from '../runtime/startup.mjs';
test('opening cue completion waits for player drain and stop cancels waiters',async()=>{
 const children=[];const cue=new StartupCue(null,()=>{const c=new EventEmitter();c.stdin=new EventEmitter();c.stdin.end=()=>{};c.kill=()=>{};children.push(c);return c;});
 cue.play();assert.ok(cue.finished instanceof Promise);let ended=false;cue.finished.then(()=>ended=true);await Promise.resolve();assert.equal(ended,false);children[0].emit('close',0);assert.equal(await cue.finished,true);
 cue.play();const pending=cue.finished;cue.stop();assert.equal(await pending,false);
});
test('cached speech waits for the opening cue without stopping it',async()=>{
 const source=readFileSync(new URL('../runtime/main-live.mjs',import.meta.url),'utf8');
 const setup=source.slice(source.indexOf('const startupGreeting='),source.indexOf("const farewellPlayback="));
 let finish,played=0,stopped=0,instance;
 const context={greetingRequest:1,closing:false,cue:{finished:new Promise(r=>finish=r),stop(){stopped++}},audio:{enqueue(){played++},finish(){}},emit(){},StartupGreeting:class{constructor({play}){this.active=true;this.play=play;instance=this;}}};
 vm.createContext(context);vm.runInContext(setup,context);const pending=instance.play(Buffer.alloc(4800),'Ready.');await Promise.resolve();assert.equal(played,0);assert.equal(stopped,0);finish(true);await pending;assert.equal(played,1);
 let finishNext;context.cue.finished=new Promise(r=>finishNext=r);const cancelled=instance.play(Buffer.alloc(4800),'Ready.');context.greetingRequest++;finishNext(true);await cancelled;assert.equal(played,1);
});

test('stopping the conversation aborts paid greeting preparation and clears its retry key',async()=>{
 const source=readFileSync(new URL('../runtime/main-live.mjs',import.meta.url),'utf8');
 const stop=source.slice(source.indexOf('async function stop('),source.indexOf('idle=new LiveIdle'));
 const preparation=new AbortController();let closed=0;
 const context={preparation,preparationKey:'pending',farewellIntent:null,farewellPlayback:{cancel(){}},idle:null,greetingRequest:0,startupGreeting:{stop(){}},ending:null,session:{async close(){closed++}},tools:{cancel(){}},audio:{async stopRecording(){},stop(){}},emit(){}};
 vm.createContext(context);vm.runInContext(stop,context);await vm.runInContext('stop()',context);
 assert.equal(preparation.signal.aborted,true);assert.equal(context.preparation,null);assert.equal(context.preparationKey,null);assert.equal(context.session,null);assert.equal(closed,1);
});
