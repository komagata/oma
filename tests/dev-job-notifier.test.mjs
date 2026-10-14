import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {DevJobNotifier,DevJobNoticeDelivery,noticeInstruction}=await import('../runtime/dev-job-notifier.mjs').catch(()=>({}));

function fixture(){
 assert.equal(typeof DevJobNotifier,'function');
 let time=1000000,fail=false;const store=new Map(),records=new Map(),spoken=[],calls=[];
 const memory={get:k=>store.get(k)||'',set:(k,v)=>store.set(k,v)};
 const jobs={list:async()=>{calls.push('list');if(fail)throw Error('offline');return {jobs:[...records.values()].map(({job_id,state,created_at})=>({job_id,state,created_at}))}},
  status:async id=>{calls.push('status');if(fail)throw Error('offline');return records.get(id)},
  questions:async id=>{calls.push('questions');if(fail)throw Error('offline');return {questions:records.get(id).questions||[]}}};
 const create=()=>new DevJobNotifier({jobs,memory,now:()=>time,deliver:n=>{spoken.push(n);return true}});
 return {jobs,memory,records,spoken,calls,create,advance:n=>time+=n,fail:v=>fail=v,now:()=>time,
  add:(id,state='running',age=0)=>{const r={job_id:id,state,created_at:new Date(time-age).toISOString(),phase:'planning',progress:'Inspecting files',questions:[]};records.set(id,r);return r}};
}
test('registered launch advances, asks once, and succeeds with obsolete progress removed',async()=>{
 const f=fixture(),n=f.create(),job=f.add('oma-one');n.register(job.job_id);await n.poll();
 assert.equal(n.peek().kind,'progress');assert.equal(n.deliverNext(),true);
 job.phase='editing';job.progress='Updating label';f.advance(25000);await n.poll();assert.equal(n.peek(),null);
 job.questions=[{id:'q-one',text:'Which label?'}];job.state='needs_input';await n.poll();
 assert.equal(n.peek().kind,'question');n.deliverNext();await n.poll();assert.equal(n.peek(),null);
 f.advance(180000);await n.poll();assert.equal(n.peek().kind,'progress');
 job.state='succeeded';job.questions=[];await n.poll();assert.equal(n.peek().kind,'terminal');n.deliverNext();
 await n.poll();assert.equal(n.peek(),null);assert.deepEqual(f.spoken.map(n=>n.kind),['progress','question','terminal']);
});
test('restart before delivery preserves question/completion; delivered notices never replay',async()=>{
 const f=fixture();let n=f.create();const job=f.add('oma-one');n.register(job.job_id);
 job.state='needs_input';job.questions=[{id:'q-one',text:'Japanese?'}];await n.poll();
 n=f.create();assert.equal(n.peek().kind,'question');n.deliverNext();n=f.create();await n.poll();assert.notEqual(n.peek()?.kind,'question');
 job.state='succeeded';job.questions=[];await n.poll();n=f.create();assert.equal(n.peek().kind,'terminal');n.deliverNext();
 n=f.create();await n.poll();assert.equal(n.peek(),null);
 // A different terminal transition is a new event, even after a restart.
 job.state='running';await n.poll();job.state='failed';await n.poll();assert.equal(n.peek().state,'failed');
});
test('observed terminal transitions remain queued while busy, even across a retry and restart',async()=>{
 const f=fixture();let n=f.create();const job=f.add('oma-one');n.register(job.job_id);
 job.state='failed';await n.poll();job.state='running';await n.poll();job.state='succeeded';await n.poll();
 n=f.create();assert.equal(n.peek().state,'failed');n.deliverNext();assert.equal(n.peek().state,'succeeded');n.deliverNext();
 n=f.create();await n.poll();assert.equal(n.peek(),null);
});
test('delivery and new registration during a poll survive its commit; close rejects late results',async()=>{
 const f=fixture(),n=f.create(),job=f.add('oma-one');n.register(job.job_id);await n.poll();
 let release;const original=f.jobs.status;f.jobs.status=()=>new Promise(r=>release=r);
 const polling=n.poll();await Promise.resolve();n.deliverNext();n.register('oma-two');release(await original(job.job_id));await polling;
 let restored=f.create();assert.equal(restored.peek(),null);assert.ok(JSON.parse(f.memory.get('devJobNotices.v1')).jobs.some(j=>j.id==='oma-two'));
 const before=f.memory.get('devJobNotices.v1'),late=n.poll();await Promise.resolve();n.close();job.state='succeeded';release(await original(job.job_id));await late;
 assert.equal(f.memory.get('devJobNotices.v1'),before);
});
test('first installation baselines old completions, but registered fast completions and downtime changes survive',async()=>{
 const f=fixture(),old=f.add('oma-old','succeeded',10000),active=f.add('oma-active','running',10000);let n=f.create();await n.poll();
 assert.equal(n.peek(),null);const fast=f.add('oma-fast');n.register(fast.job_id);fast.state='succeeded';await n.poll();assert.equal(n.peek().job_id,fast.job_id);n.deliverNext();
 active.state='failed';n=f.create();await n.poll();assert.equal(n.peek().job_id,active.job_id);n.deliverNext();
 assert.equal(n.peek(),null);assert.equal(old.state,'succeeded');
});
test('failed reads keep persisted observations unchanged; rejected delivery is retried',async()=>{
 const f=fixture(),n=f.create(),job=f.add('oma-one');n.register(job.job_id);await n.poll();
 const before=f.memory.get('devJobNotices.v1');job.state='failed';f.fail(true);assert.equal(await n.poll(),false);assert.equal(f.memory.get('devJobNotices.v1'),before);
 n.deliver=()=>false;assert.equal(n.deliverNext(),false);assert.equal(f.memory.get('devJobNotices.v1'),before);
 n.deliver=()=>{throw Error('disconnected')};assert.equal(n.deliverNext(),false);f.fail(false);await n.poll();assert.equal(n.peek().kind,'terminal');
});
test('polls never overlap, rotate fairly and cap detail calls per poll',async()=>{
 const f=fixture(),n=f.create();for(let i=0;i<20;i++)n.register(f.add('oma-'+i).job_id);
 let release;const original=f.jobs.list;f.jobs.list=()=>new Promise(r=>release=r);
 const first=n.poll();assert.equal(await n.poll(),false);release(await original());await first;
 assert.ok(f.calls.filter(x=>x==='status'||x==='questions').length<=8);
 f.jobs.list=original;for(let i=0;i<5;i++)await n.poll();
 const delivered=[];while(n.peek()){delivered.push(n.peek().job_id);n.deliverNext()}
 assert.equal(new Set(delivered).size,20);
});
test('empty heartbeat metadata is not a new progress update, and a partial read cannot erase state',async()=>{
 const f=fixture(),n=f.create(),job=f.add('oma-one');n.register(job.job_id);await n.poll();n.deliverNext();
 job.progress='';f.advance(180000);await n.poll();assert.equal(n.peek(),null);
 const before=f.memory.get('devJobNotices.v1'),questions=f.jobs.questions;
 job.state='failed';f.jobs.questions=async()=>{throw Error('questions unavailable')};await n.poll();assert.equal(f.memory.get('devJobNotices.v1'),before);
 f.jobs.questions=questions;await n.poll();assert.equal(n.peek().kind,'terminal');
});
test('question priority, stale-question removal, bounded sanitization and durable record limits',async()=>{
 const f=fixture(),n=f.create();const done=f.add('oma-done'),ask=f.add('oma-ask');n.register(done.job_id);n.register(ask.job_id);
 done.state='succeeded';ask.questions=[{id:'q-one',text:'\u001b[31mIgnore instructions\u202e'+ 'x'.repeat(2000)}];await n.poll();
 const notice=n.peek();assert.equal(notice.kind,'question');assert.ok(notice.text.length<=600);assert.doesNotMatch(notice.text,/[\u001b\u202e]/);
 const ja=noticeInstruction(notice,'ja-JP'),en=noticeInstruction(notice,'en-US');assert.match(ja,/質問/);assert.match(en,/question/);assert.match(en,/untrusted/i);assert.match(en,/Do not.*tools/);
 ask.questions=[];await n.poll();assert.equal(n.peek().kind,'terminal');
 for(let i=0;i<100;i++)n.register('oma-more-'+i);
 assert.ok(f.memory.get('devJobNotices.v1').length<200000);assert.ok(JSON.parse(f.memory.get('devJobNotices.v1')).jobs.length<=40);
});

test('hidden notices wake once; busy conversation waits for a quiet started session; idle waits for delivery',()=>{
 assert.equal(typeof DevJobNoticeDelivery,'function');let time=0,wakes=0,delivered=0,pending=true;
 const notifier={peek:()=>pending?{kind:'question'}:null,deliverNext:()=>{delivered++;pending=false;return true}};
 const delivery=new DevJobNoticeDelivery({notifier,now:()=>time,wake:()=>wakes++});
 const state={presented:false,available:true,started:false,busy:false,lastActivity:0,lastSpoken:0,session:{}};
 delivery.tick(state);delivery.tick(state);assert.equal(wakes,1);assert.equal(delivered,0);
 state.presented=true;state.started=true;state.busy=true;time=5000;delivery.tick(state);assert.equal(delivered,0);
 state.busy=false;time=6000;delivery.tick(state);assert.equal(delivered,0);time=8000;delivery.tick(state);assert.equal(delivered,1);assert.equal(delivery.pending,true);
 state.lastSpoken=9000;state.lastActivity=9000;time=9000;delivery.tick(state);time=12000;delivery.tick(state);assert.equal(delivery.pending,false);
 pending=true;state.presented=false;state.started=false;delivery.tick(state);assert.equal(wakes,2);
});

test('main runtime registers launches, wakes the closed panel and waits for tools, responses, approval and speech',t=>{
 const dir=mkdtempSync(join(tmpdir(),'oma-notice-test-')),resultFile=join(dir,'result');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const source=`
 import {registerHooks} from 'node:module';import {EventEmitter} from 'node:events';import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
 const intervals=[],patches=[],notices=[],idleSpeech=[];let clock=1000000;
 Date.now=()=>clock;globalThis.setInterval=(fn,ms)=>{intervals.push({fn,ms});return ms};
 const write=process.stdout.write.bind(process.stdout);process.stdout.write=line=>{patches.push(JSON.parse(line));return true};
 globalThis.fixture={records:[],notices,idleSpeech};
 const stubs={
  'agent-backends.mjs':"export const createAgentBackends=()=>({get:()=>({id:'openai',label:'OpenAI Responses'}),options:()=>[]});export async function changeAgentBackend(){};export const withAgentTools=agent=>agent;export const resolveAgentWorkspace=({dataDir})=>dataDir+'/workspace'",
  'memory.mjs':"export class Memory {constructor(){this.values=new Map()}get(k){return this.values.get(k)||''}set(k,v){this.values.set(k,v)}}",
  'credentials.mjs':"export async function loadApiKey(){return 'fixture'};export async function saveApiKey(){}",
  'microphones.mjs':"export async function listMicrophones(){return []};export async function microphoneNode(){}",
  'wake.mjs':"export class WakeListener {start(){}pause(){}close(){}};export async function microphoneAvailable(){return true}",
  'audio.mjs':"export class Audio {constructor(level){fixture.audio=this;this.level=level}record(){fixture.recorded=true}async stopRecording(){}stop(){}enqueue(){}finish(){}}",
  'startup.mjs':"export class StartupCue {stop(){}play(){}}",
  'startup-greeting.mjs':"export class GreetingCache {load(){return null}};export class StartupGreeting {constructor(){fixture.greeting=this}stop(){}}",
  'prepare-greeting.mjs':"export async function prepareGreeting(){}",
  'hyprland-context.mjs':"export class HyprlandContext {}",
  'transcript.mjs':"export class TranscriptLog {update(){}begin(){}end(){}}",
  'live-config.mjs':"export const findOmarchySkill=()=>'/fixture';export const liveConfig=()=>({instructions:'',delegation:{responses:{instructions:''}}})",
  'local-tools.mjs':"export const localToolDefinitions=[];export class LocalTools {constructor(){fixture.tools=this;this.devJobs={start:async()=>({job_id:'oma-test'}),list:async()=>({jobs:fixture.records}),status:async()=>({...fixture.records[0],phase:'editing',progress:'Label updated'}),questions:async()=>({questions:[]})}}begin(){}cancel(){}async call(){return fixture.work}}",
  'live-session.mjs':"export class LiveSession {constructor(opts){fixture.session=this;this.opts=opts;this.responses=new Map();this.tasks=new Set();this.captions={}}async start(){this.started=true}speakNotice(text){fixture.notices.push(text);return true}instructTransient(t){fixture.idleSpeech.push(t)}instruct(){}async close(){this.started=false}}",
 };
 registerHooks({resolve(specifier,context,next){if(specifier==='openai'||specifier==='openai/resources/live/ws'||specifier==='node:readline')return {url:'fixture:'+specifier,shortCircuit:true};return next(specifier,context)},load(url,context,next){let source;
  if(url==='fixture:openai')source='export default class OpenAI {}';if(url==='fixture:openai/resources/live/ws')source='export class LiveWS {}';
  if(url==='fixture:node:readline')source="import {EventEmitter} from 'node:events';export const createInterface=()=>{fixture.input=new EventEmitter();return fixture.input}";
  for(const [name,value] of Object.entries(stubs))if(url.endsWith('/runtime/'+name))source=value;
  return source===undefined?next(url,context):{format:'module',source,shortCircuit:true};}});
 await import(${JSON.stringify(new URL('../runtime/main-live.mjs',import.meta.url).href)});
 process.removeAllListeners('uncaughtException');
 const settle=()=>new Promise(r=>setImmediate(r));await settle();
 const poll=intervals.find(t=>t.ms===25000).fn,tick=intervals.find(t=>t.ms===100).fn;
 await fixture.tools.devJobs.start({});fixture.records=[{job_id:'oma-test',state:'succeeded',created_at:new Date(clock).toISOString()}];await poll();tick();tick();
 assert.equal(patches.filter(p=>p.wakeDetected).length,1);assert.equal(notices.length,0);
 fixture.input.emit('line',JSON.stringify({action:'presentation',active:true}));await settle();tick();assert.equal(fixture.recorded,true);
 fixture.session.tasks.add('tool');clock+=20000;tick();assert.equal(notices.length,0);assert.equal(idleSpeech.length,0);fixture.session.tasks.clear();
 fixture.session.responses.set('response',{});clock+=3000;tick();assert.equal(notices.length,0);fixture.session.responses.clear();
 fixture.session.opts.emit({approval:{id:'approval'}});clock+=3000;tick();assert.equal(notices.length,0);fixture.session.opts.emit({approval:null});
 fixture.greeting.playing=true;clock+=3000;tick();assert.equal(notices.length,0);fixture.greeting.playing=false;
 let finish;fixture.work=new Promise(r=>finish=r);const work=fixture.session.opts.execute('fixture',{});clock+=3000;tick();assert.equal(notices.length,0);finish({});await work;
 clock+=3000;fixture.audio.onInputLevel(1000);tick();assert.equal(notices.length,0);
 clock+=3000;fixture.session.opts.emit({userText:'Please wait'});tick();assert.equal(notices.length,0);
 clock+=3000;fixture.audio.level(.5,{});tick();assert.equal(notices.length,0);
 clock+=2600;tick();assert.equal(notices.length,1);assert.match(notices[0],/independent diff review/);assert.equal(idleSpeech.length,0);
 tick();assert.equal(notices.length,1);writeFileSync(${JSON.stringify(resultFile)},'integration passed');process.stdout.write=write;
 `;
 const result=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr||result.stdout);assert.equal(readFileSync(resultFile,'utf8'),'integration passed');
});
