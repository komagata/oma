import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {Memory} from '../runtime/memory.mjs';import {liveConfig} from '../runtime/live-config.mjs';
const env={OMA_OMARCHY_SKILL:new URL('../skills/oma/SKILL.md',import.meta.url).pathname};
test('default and every selectable task agent use client delegation without changing GPT-Live audio or locale',()=>{
 for(const id of ['', 'codex','claude','hermes','openclaw']){
  const config=liveConfig({facts:()=>[{key:'color',value:'purple'}],get:k=>k==='agentBackend'?id:k==='responseLanguage'?'de':''},{...env,OMA_LIVE_VOICE:'marin',OMA_BACKEND_MODEL:'obsolete-model'});
  assert.deepEqual(config.delegation,{type:'client'});assert.equal(config.model,'gpt-live-1');assert.equal(config.store,false);
  assert.deepEqual(config.audio,{format:{type:'audio/pcm',rate:24000},output:{voice:'marin'}});
  assert.match(config.instructions,/Reply in German/);assert.match(config.instructions,/purple/);assert.doesNotMatch(JSON.stringify(config),/obsolete-model|"responses"/);
 }
 for(const id of ['openai','bad'])assert.throws(()=>liveConfig({facts:()=>[],get:k=>k==='agentBackend'?id:''},env),/Unknown task agent/);
});
test('backend selection persists and rejects busy/invalid changes before stopping',async t=>{const {createAgentBackends,changeAgentBackend}=await import('../runtime/agent-backends.mjs');const dir=mkdtempSync(join(tmpdir(),'oma-selection-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));let memory=new Memory(join(dir,'memory.sqlite'));const events=[],calls=[];const args={memory,registry:createAgentBackends(),busy:false,active:true,stop:async()=>calls.push('stop'),start:async()=>calls.push('start'),emit:p=>events.push(p)};await changeAgentBackend({...args,value:'claude'});assert.deepEqual(calls,['stop','start']);memory.close();memory=new Memory(join(dir,'memory.sqlite'));t.after(()=>memory.close());assert.equal(memory.get('agentBackend'),'claude');await assert.rejects(changeAgentBackend({...args,memory,value:'hermes',busy:true}),/busy/i);await assert.rejects(changeAgentBackend({...args,memory,value:'bad'}),/Unknown/);assert.equal(memory.get('agentBackend'),'claude');assert.equal(calls.length,2);assert.ok(events.some(e=>e.agentBackend==='claude'));});
test('main-live command wires busy guards and restart to the persisted agent',async()=>{
 const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');const {createAgentBackends,changeAgentBackend}=await import('../runtime/agent-backends.mjs');
 const source=readFileSync(new URL('../runtime/main-live.mjs',import.meta.url),'utf8');const commandSource=source.slice(source.indexOf('async function command(c)'),source.indexOf('\nconst input='));
 for(const guard of ['testing','saving','starting','activeToolCalls','switchingAgent','approval','tasks','responses']){
  let saved='claude';const patches=[],calls=[];const context={createAgentBackends,changeAgentBackend,agentRegistry:createAgentBackends(),memory:{get:()=>saved,set:(k,v)=>saved=v},emit:p=>patches.push(p),testing:false,saving:false,starting:null,activeToolCalls:0,switchingAgent:false,approval:null,ending:null,presented:true,closing:false,session:{started:true,tasks:new Set(),responses:new Map()},stop:async()=>calls.push('stop'),start:async()=>calls.push('start'),audio:{outputBuffer:{busy:false}},startupGreeting:{playing:false},farewellPlayback:{active:false}};
  if(guard==='tasks')context.session.tasks.add('work');else if(guard==='responses')context.session.responses.set('work',{});else context[guard]=true;
  await runInNewContext(commandSource+';command({action:"setAgentBackend",value:"codex"})',context);assert.equal(saved,'claude',guard);assert.deepEqual(calls,[],guard);assert.ok(patches.some(p=>/busy/i.test(p.agentError||'')),guard);
 }
});
test('main-live resolves one workspace for task agents and LocalTools',async()=>{
 const {readFileSync}=await import('node:fs');const source=readFileSync(new URL('../runtime/main-live.mjs',import.meta.url),'utf8');
 assert.match(source,/const workspace=resolveAgentWorkspace\(\{dataDir:data\}\)/);
 assert.match(source,/createAgentBackends\(\{workspace\}\)/);
 assert.match(source,/new LocalTools\(\{memory,emit,cwd:workspace,/);
});

test('Claude selection persists its label and retains existing backend options',async t=>{
 const {createAgentBackends,changeAgentBackend}=await import('../runtime/agent-backends.mjs');const dir=mkdtempSync(join(tmpdir(),'oma-selection-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 let memory=new Memory(join(dir,'memory.sqlite'));const events=[],calls=[];
 await changeAgentBackend({value:'claude',memory,registry:createAgentBackends({env:{PATH:''}}),busy:false,active:true,stop:async()=>calls.push('stop'),start:async()=>calls.push('start'),emit:patch=>events.push(patch)});
 assert.deepEqual(calls,['stop','start']);assert.equal(events[0].agentBackend,'claude');assert.equal(events[0].modelProvider,'Claude Code');assert.equal(events[0].modelName,'Claude Code');assert.deepEqual(events[0].agentOptions.map(option=>option.value),['codex','claude','hermes','openclaw']);assert.equal(events[0].agentOptions.find(option=>option.value==='claude').available,false);
 memory.close();memory=new Memory(join(dir,'memory.sqlite'));t.after(()=>memory.close());assert.equal(memory.get('agentBackend'),'claude');
});

test('startup migrates only retired or unset selection, saves it once, and preserves other data across restart',async t=>{
 const backends=await import('../runtime/agent-backends.mjs');
 const dir=mkdtempSync(join(tmpdir(),'oma-migration-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const source=(await import('node:fs')).readFileSync(new URL('../runtime/main-live.mjs',import.meta.url),'utf8');
 const setup=source.slice(source.indexOf('const memory='),source.indexOf('let switchingAgent='));
 const {runInNewContext}=await import('node:vm');
 for(const saved of ['', 'openai','codex','claude','hermes','openclaw','invalid']){
  const path=join(dir,(saved||'unset')+'.sqlite');let memory=new Memory(path);
  if(saved)memory.set('agentBackend',saved);
  for(const [key,value] of Object.entries({responseLanguage:'de',microphoneTarget:'mic',voiceEffectsEnabled:'false',taskCheckpoint:'pending'}))memory.set(key,value);
  memory.remember('color','purple');const before=memory.db.prepare('SELECT * FROM meta ORDER BY key').all();let writes=0;const original=memory.set.bind(memory);memory.set=(...args)=>{writes++;return original(...args)};
  const boot=()=>runInNewContext(setup,{Memory:class{constructor(){return memory}},data:dir,workspace:dir,join,homedir:()=>dir,process:{env:{}},...backends});
  if(saved==='invalid'){assert.throws(boot,/Unknown task agent/);assert.equal(writes,0);assert.deepEqual(memory.db.prepare('SELECT * FROM meta ORDER BY key').all(),before);memory.close();continue;}
  const expected=!saved||saved==='openai'?'codex':saved;
  boot();assert.equal(memory.get('agentBackend'),expected);assert.equal(writes,!saved||saved==='openai'?1:0);boot();assert.equal(writes,!saved||saved==='openai'?1:0);
  memory.close();memory=new Memory(path);boot();assert.equal(memory.get('agentBackend'),expected);
  for(const row of before.filter(row=>row.key!=='agentBackend'))assert.equal(memory.get(row.key),row.value);
  assert.equal(memory.facts()[0].value,'purple');memory.close();
 }
});
test('retired backend switching fails before stopping, persisting, emitting or restarting',async()=>{
 const {createAgentBackends,changeAgentBackend}=await import('../runtime/agent-backends.mjs');let touched=false;
 await assert.rejects(changeAgentBackend({value:'openai',registry:createAgentBackends(),memory:{get:()=> 'claude',set:()=>{touched=true}},stop:async()=>{touched=true},start:async()=>{touched=true},emit:()=>{touched=true},busy:false,active:true}),/Unknown task agent/);
 assert.equal(touched,false);
});

test('upgraded status, started session and typed requests agree on the persisted task agent',async t=>{
 const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');const {createAgentBackends}=await import('../runtime/agent-backends.mjs');
 const source=readFileSync(new URL('../runtime/main-live.mjs',import.meta.url),'utf8');
 const setup=source.slice(source.indexOf('const memory='),source.indexOf('let switchingAgent='));
 const start=source.slice(source.indexOf('async function start('),source.indexOf('async function stop('));
 const status=source.slice(source.indexOf('function status()'),source.indexOf('\nconst tools='));
 const command=source.slice(source.indexOf('async function command(c)'),source.indexOf('\nconst input='));
 const dir=mkdtempSync(join(tmpdir(),'oma-upgrade-session-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 for(const saved of ['', 'openai','claude','hermes','openclaw']){
  const memory=new Memory(join(dir,(saved||'unset')+'.sqlite'));if(saved)memory.set('agentBackend',saved);
  const expected=!saved||saved==='openai'?'codex':saved,patches=[],sent=[],sessions=[];
  const context={Memory:class{constructor(){return memory}},data:dir,workspace:dir,join,homedir:()=>dir,process:{env:{}},createAgentBackends,
   switchingAgent:false,testing:false,saving:false,starting:null,session:null,closing:false,presented:false,key:'fixture',
   findOmarchySkill:()=>env.OMA_OMARCHY_SKILL,languageOptions:()=>[],voiceEffectsEnabled:()=>false,emit:p=>patches.push(p),
   withAgentTools:agent=>agent,localToolDefinitions:[],tools:{begin(){}},desktopContext:{},microphoneAvailable:async()=>true,
   wake:{pause(){}},idle:{activity(){},show(){}},startupGreeting:{active:false},greetingCache:{load:()=>null},cachedFarewell:()=>null,
   liveConfig:m=>liveConfig(m,env),responseLocale:()=> 'en',audio:{record(){}},prepare(){},stop:async()=>{},
   LiveSession:class{constructor(options){this.options=options;sessions.push(options)}async start(){this.started=true}async text(text){sent.push({id:this.options.agent.id,text})}}};
  await runInNewContext(setup+status+start+command+';status();command({action:"text",text:"hello"})',context);
  assert.equal(patches[0].agentBackend,expected);assert.equal(memory.get('agentBackend'),expected);assert.equal(sessions[0].agent.id,expected);
  assert.deepEqual(sessions[0].config.delegation,{type:'client'});assert.deepEqual(sent,[{id:expected,text:'hello'}]);memory.close();
 }
});
