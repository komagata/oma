import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Memory} from '../runtime/memory.mjs';
import * as backends from '../runtime/agent-backends.mjs';
const request='私の好きな飲み物はコーヒーです。覚えて';
const fact='私の好きな飲み物はコーヒーです';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'oma-hermes-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const home=join(dir,'hermes');mkdirSync(join(home,'memories'),{recursive:true});writeFileSync(join(home,'memories','MEMORY.md'),'native fixture');writeFileSync(join(home,'memories','USER.md'),'user fixture');return {dir,home};}
function transport(){let owner;let closes=0;return {get closes(){return closes},async startBridge(options){owner=options;const done=Promise.withResolvers();return {connection:{call:args=>owner.execute('propose_remember',args)},closed:done.promise,async close(){closes++;done.resolve()}}}};}
function wrap(run,memory,bridge){assert.equal(typeof backends.withHermesMemory,'function');return backends.withHermesMemory({id:'hermes',label:'Hermes Agent',run},{memory,startBridge:bridge.startBridge});}
test('Hermes proposal commits to actual OMA Memory only after completed result and bridge cleanup',async t=>{
 const {dir}=fixture(t),memory=new Memory(join(dir,'oma.db'));t.after(()=>memory.close());const bridge=transport();let writes=0;const remember=memory.remember.bind(memory);memory.remember=(...args)=>{writes++;assert.equal(bridge.closes,1);return remember(...args)};
 const agent=wrap(async({toolConnection,context})=>{assert.match(context,/OMA fixture/);const result=await toolConnection.call({key:'drink',value:fact,request});assert.deepEqual(result,{proposed:true,saved:false});assert.deepEqual(memory.facts(),[]);return 'proposal ready';},memory,bridge);
 const reply=await agent.run({text:request,context:'OMA fixture'});assert.match(reply,/OMA/);assert.equal(writes,1);assert.equal(memory.facts()[0].value,fact);assert.match(memory.context('コーヒー'),/コーヒー/);
});
for(const outcome of ['error','cancel','empty','cleanup'])test('Hermes discards proposal on '+outcome,async()=>{
 const bridge=transport(),controller=new AbortController();let writes=0;
 if(outcome==='cleanup'){const start=bridge.startBridge;bridge.startBridge=async opts=>({...await start(opts),close:async()=>{throw Error('cleanup')}});}
 const agent=wrap(async({toolConnection})=>{await toolConnection.call({key:'drink',value:fact,request});if(outcome==='error')throw Error('failed');if(outcome==='cancel')controller.abort();return outcome==='empty'?'':'done';},{remember(){writes++}},bridge);
 await assert.rejects(agent.run({text:request,signal:controller.signal}));assert.equal(writes,0);
});
for(const text of ['天気を教えて','「私の好きな飲み物はコーヒーです。覚えて」を英訳して','前の内容を覚えて','覚えて','Remember this','Do not remember that I like coffee'])test('Hermes rejects saving ordinary or ambiguous request: '+text,async()=>{
 let writes=0;const agent=wrap(async({toolConnection})=>{if(toolConnection)await assert.rejects(Promise.resolve().then(()=>toolConnection.call({key:'drink',value:fact,request:text})));return 'clarification';},{remember(){writes++}},transport());assert.equal(await agent.run({text}),'clarification');assert.equal(writes,0);
});
test('Hermes accepts one exact user fact; rejects duplicate, fabricated and context-sourced proposals',async()=>{
 let writes=0;const agent=wrap(async({toolConnection})=>{
  for(const args of [{key:'drink',value:'inferred fact',request},{key:'drink',value:fact,request:'forged request'},{key:'x'.repeat(201),value:fact,request}])await assert.rejects(Promise.resolve().then(()=>toolConnection.call(args)));
  await toolConnection.call({key:'drink',value:fact,request});await assert.rejects(Promise.resolve().then(()=>toolConnection.call({key:'drink',value:fact,request})));return 'done';},{remember(){writes++;return {key:'drink',value:fact}}},transport());await agent.run({text:request});assert.equal(writes,1);
});
test('Hermes DB error yields no success or automatic retry',async()=>{
 let writes=0;const agent=wrap(async({toolConnection})=>{await toolConnection.call({key:'drink',value:fact,request});return 'saved!';},{remember(){writes++;throw Error('DB unavailable')}},transport());await assert.rejects(agent.run({text:request}),/OMA.*save|OMA.*保存/);assert.equal(writes,1);
});
test('Hermes isolated command preserves native -z reads and fails closed without bwrap',async t=>{
 const {dir,home}=fixture(t);const cli=join(dir,'hermes-cli');writeFileSync(cli,'#!/bin/sh\necho should-not-run\n',{mode:0o700});
 await assert.rejects(backends.createAgentBackends({workspace:dir,env:{HOME:dir,HERMES_HOME:home,PATH:''},executables:{hermes:cli}}).get('hermes').run({text:'read memory'}),/Hermes.*bwrap/);
});
test('real bwrap allows /dev/null writes and memory reads, blocks native writes and leaves direct use writable',async t=>{
 const {dir,home}=fixture(t);const probe=spawnSync('bwrap',['--ro-bind','/','/','--unshare-user','--unshare-pid','--proc','/proc','--','true'],{encoding:'utf8'});
 if(probe.status!==0){t.skip('bwrap namespace unavailable: '+probe.stderr.trim());return;}
 const cli=join(dir,'hermes-cli');writeFileSync(cli,'#!'+process.execPath+'\n'+`
const fs=require('node:fs'),path=require('node:path');
const devnull=fs.openSync('/dev/null','w');fs.writeSync(devnull,'Hermes oneshot fixture',null,'utf8');fs.closeSync(devnull);
const args=process.argv.slice(2);if(args[0]!=='-z'||args.includes('--ignore-rules'))process.exit(5);
const message=JSON.parse(args[1].slice(args[1].indexOf('"'),args[1].lastIndexOf('"')+1));
if(!fs.readFileSync(message,'utf8').includes('OMA fixture'))process.exit(6);
for(const name of ['MEMORY.md','USER.md']){const p=path.join(process.env.HERMES_HOME,'memories',name);if(!fs.readFileSync(p,'utf8').includes('fixture'))process.exit(7);try{fs.writeFileSync(p,'bad');process.exit(8)}catch(e){if(e.code!=='EROFS')throw e}}
fs.writeSync(1,'/dev/null writable; both memories readable; native writes blocked');`,{mode:0o700});
 const env={...process.env,HERMES_HOME:home,HOME:dir};const reply=await backends.createAgentBackends({workspace:dir,env,executables:{hermes:cli}}).get('hermes').run({text:'read',context:'OMA fixture'});assert.match(reply,/\/dev\/null writable; both memories readable; native writes blocked/);assert.equal(readFileSync(join(home,'memories','MEMORY.md'),'utf8'),'native fixture');assert.equal(readFileSync(join(home,'memories','USER.md'),'utf8'),'user fixture');writeFileSync(join(home,'memories','MEMORY.md'),'direct writable');
});

test('Hermes pins active profile and rejects memory aliases or absent state',async t=>{
 const {hermesIsolation}=await import('../runtime/agent-backends.mjs');const {dir,home}=fixture(t);const env={HOME:dir,HERMES_HOME:home};
 const profile=join(home,'profiles','work');mkdirSync(join(profile,'memories'),{recursive:true});writeFileSync(join(home,'active_profile'),'Work');
 const launch=hermesIsolation({env,command:'/fixture/hermes',args:['-z','fixture'],bwrap:'/usr/bin/bwrap'});
 assert.equal(launch.env.HERMES_HOME,profile);assert.equal(launch.env.HERMES_IGNORE_RULES,'0');assert.deepEqual(launch.args.slice(-2),['--profile','work']);assert.ok(launch.args.includes(join(profile,'memories')));assert.deepEqual(env,{HOME:dir,HERMES_HOME:home});
 const outside=join(dir,'outside');writeFileSync(outside,'fixture');symlinkSync(outside,join(profile,'memories','MEMORY.md'));
 assert.throws(()=>hermesIsolation({env,command:'hermes',args:[],bwrap:'bwrap'}),/isolation/);
 assert.throws(()=>hermesIsolation({env:{...env,HERMES_HOME:join(dir,'absent')},command:'hermes',args:[],bwrap:'bwrap'}),/isolation/);
});
test('Hermes child inherits private remember capability without argv secrets',async t=>{
 const {dir,home}=fixture(t),cli=join(dir,'hermes-cli');writeFileSync(cli,'#!'+process.execPath+'\n'+`
const fs=require('node:fs'),args=process.argv.slice(2);const p=JSON.parse(args[1].slice(args[1].indexOf('"'),args[1].lastIndexOf('"')+1));
fs.writeFileSync('capture',JSON.stringify({args,input:fs.readFileSync(p,'utf8'),token:process.env.OMA_TOOL_TOKEN,socket:process.env.OMA_TOOL_SOCKET}));fs.writeSync(1,'complete');`,{mode:0o700});
 await backends.createAgentBackends({workspace:dir,env:{...process.env,HERMES_HOME:home},executables:{hermes:cli}}).get('hermes').run({text:request,context:'untrusted fixture',toolConnection:{token:'private-fixture-token',socketPath:'/tmp/private-fixture.sock'},rememberFact:fact});
 const capture=JSON.parse(readFileSync(join(dir,'capture'),'utf8'));assert.equal(capture.token,'private-fixture-token');assert.equal(capture.socket,'/tmp/private-fixture.sock');assert.ok(!capture.args.join(' ').includes(capture.token));assert.ok(!capture.args.join(' ').includes(request));assert.match(capture.input,/agent-backends.mjs/);assert.match(capture.input,/NOT a saved result/);assert.ok(!capture.input.includes(capture.token));
});
test('Hermes missing proposal cannot forward a fabricated save success',async()=>{
 const agent=wrap(async()=> 'Saved it!',{remember(){assert.fail('must not save')}},transport());assert.match(await agent.run({text:request}),/保存していません/);
});
test('Hermes English explicit fact is exact and confirmed after one DB call',async()=>{
 const text='Remember that I prefer coffee';let calls=0;const agent=wrap(async({toolConnection})=>{await toolConnection.call({key:'drink',value:'I prefer coffee',request:text});return 'done'},{remember(){calls++}},transport());assert.equal(await agent.run({text}),'Saved to OMA memory: I prefer coffee');assert.equal(calls,1);
});

test('real authenticated Hermes task helper proposes into OMA Memory after successful CLI completion',async t=>{
 const {dir,home}=fixture(t),memory=new Memory(join(dir,'oma.db'));t.after(()=>memory.close());const cli=join(dir,'hermes-cli'),modulePath=new URL('../runtime/agent-backends.mjs',import.meta.url).pathname;
 writeFileSync(cli,'#!'+process.execPath+'\n'+`
const fs=require('node:fs'),cp=require('node:child_process');
const result=cp.spawnSync(process.execPath,[${JSON.stringify(modulePath)},'--propose-remember'],{input:JSON.stringify({key:'drink',value:${JSON.stringify(fact)},request:${JSON.stringify(request)}}),encoding:'utf8',env:process.env});
if(result.status!==0)process.exit(4);
const pending=JSON.parse(result.stdout);if(pending.saved!==false||pending.proposed!==true)process.exit(5);
fs.writeSync(1,'proposal completed');`,{mode:0o700});
 const agent=backends.withAgentTools(backends.createAgentBackends({workspace:dir,env:{...process.env,HERMES_HOME:home},executables:{hermes:cli}}).get('hermes'),{memory});
 assert.match(await agent.run({text:request}),/OMA.*保存しました/);assert.equal(memory.facts()[0].value,fact);
});

test('Hermes isolation startup failure never falls back to direct CLI',async t=>{
 const {dir,home}=fixture(t),cli=join(dir,'hermes-cli');writeFileSync(cli,'#!/bin/sh\ntouch "'+join(dir,'unprotected')+'"\necho unsafe\n',{mode:0o700});writeFileSync(join(dir,'bwrap'),'#!/bin/sh\nexit 1\n',{mode:0o700});
 await assert.rejects(backends.createAgentBackends({workspace:dir,env:{...process.env,HERMES_HOME:home,PATH:dir},executables:{hermes:cli}}).get('hermes').run({text:'ordinary request'}),/Hermes.*bwrap memory isolation/);
 assert.throws(()=>readFileSync(join(dir,'unprotected')),{code:'ENOENT'});
});
