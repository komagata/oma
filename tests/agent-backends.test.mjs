import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,readdirSync,statSync} from 'node:fs';import {tmpdir,homedir} from 'node:os';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {startAgentToolBridge} from '../runtime/agent-tool-bridge.mjs';
import {LocalTools,localToolDefinitions} from '../runtime/local-tools.mjs';
const load=()=>import('../runtime/agent-backends.mjs');
// A fake transport lets CLI requests and terminal cancellation be ordered by
// promises, without sleeps or socket scheduling. Real MCP coverage follows below.
function ownerBridgeFixture(){
 const bridges=[];
 return {bridges,async startBridge({execute,cancel,signal}){
  const done=Promise.withResolvers();let pending=0,stopped=false;
  const bridge={closed:done.promise,connection:{async call(...args){
   pending++;try{return await execute(...args);}finally{pending--;}
  }},close(){
   if(!stopped){stopped=true;signal.removeEventListener('abort',bridge.close);if(pending)cancel();done.resolve();}
   return done.promise;
  }};
  signal.addEventListener('abort',bridge.close,{once:true});bridges.push(bridge);return bridge;
 }};
}
for(const id of ['codex','claude'])for(const outcome of ['resolve','reject'])test(id+' serializes concurrent owner calls after '+outcome,async()=>{
 const {withAgentTools}=await load(),transport=ownerBridgeFixture(),first=Promise.withResolvers(),started=Promise.withResolvers();
 const order=[];let active=0,maxActive=0,cancels=0;
 const agent=withAgentTools({id,async run({toolConnection}){
  const calls=Promise.allSettled([toolConnection.call('confirm_action',{number:1}),toolConnection.call('confirm_action',{number:2})]);
  await started.promise;first[outcome](outcome==='reject'?new Error('fixture rejection'):'first');
  return calls;
 }},{definitions:[],begin(){},cancel(){cancels++;},startBridge:transport.startBridge,async execute(name,{number}){
  active++;maxActive=Math.max(maxActive,active);order.push('start '+number);
  try{if(number===1){started.resolve();return await first.promise;}return 'second';}
  finally{order.push('end '+number);active--;}
 }});
 const results=await agent.run({text:'fixture'});
 assert.equal(maxActive,1);assert.deepEqual(order,['start 1','end 1','start 2','end 2']);
 assert.equal(results[0].status,outcome==='reject'?'rejected':'fulfilled');assert.equal(results[1].value,'second');assert.equal(cancels,0);
});
for(const id of ['codex','claude'])for(const reason of ['abort','disconnect','completion'])test(id+' skips queued owner calls after '+reason+' and starts next task cleanly',async()=>{
 const {withAgentTools}=await load(),transport=ownerBridgeFixture(),first=Promise.withResolvers(),started=Promise.withResolvers(),controller=new AbortController();
 const calls=[];let cancels=0,begins=0,queued;
 const agent=withAgentTools({id,async run({text,toolConnection}){
  if(text==='next')return toolConnection.call('fixture',{number:3});
  queued=Promise.allSettled([toolConnection.call('fixture',{number:1}),toolConnection.call('fixture',{number:2})]);
  await started.promise;
  if(reason==='abort')controller.abort();
  if(reason==='disconnect')await transport.bridges[0].close();
  return 'finished';
 }},{definitions:[],begin(){begins++;},cancel(){cancels++;},startBridge:transport.startBridge,async execute(name,{number}){
  calls.push(number);if(number===1){started.resolve();return first.promise;}return 'next result';
 }});
 await agent.run({text:'fixture',signal:controller.signal}).catch(error=>assert.match(error.message,/connection closed|cancelled/));
 assert.deepEqual(calls,[1]);assert.equal(cancels,1);
 assert.equal(await agent.run({text:'next'}),'next result');assert.deepEqual(calls,[1,3]);assert.equal(begins,2);assert.equal(cancels,1);
 // A cancelled owner may settle only after the next task has begun. Its old
 // queue must remain closed, and cleanup must not wait for that stuck call.
 first.resolve('late result');const results=await queued;
 assert.equal(results[1].status,'rejected');assert.deepEqual(calls,[1,3]);
});
for(const id of ['codex','claude'])test(id+' presents only one LocalTools approval at a time',async()=>{
 const {withAgentTools}=await load(),transport=ownerBridgeFixture(),first=Promise.withResolvers(),second=Promise.withResolvers();
 let maxApprovals=0;
 const tools=new LocalTools({memory:{},emit:patch=>{
  if(patch.approval){maxApprovals=Math.max(maxApprovals,tools.approvals.size);(patch.approval.description==='first'?first:second).resolve(patch.approval.id);}
 }});
 const agent=withAgentTools({id,async run({toolConnection}){
  const calls=Promise.all([toolConnection.call('confirm_action',{description:'first'}),toolConnection.call('confirm_action',{description:'second'})]);
  tools.approve(await first.promise,true);tools.approve(await second.promise,false);return calls;
 }},{definitions:localToolDefinitions,begin:()=>tools.begin(),cancel:()=>tools.cancel(),execute:(...args)=>tools.call(...args),startBridge:transport.startBridge});
 assert.deepEqual(await agent.run({text:'fixture'}),[{approved:true},{approved:false}]);
 assert.equal(maxApprovals,1);assert.equal(tools.approvals.size,0);
});
test('independent CLI sessions do not share an owner execution queue',async()=>{
 const {withAgentTools}=await load(),transport=ownerBridgeFixture(),first=Promise.withResolvers(),started=Promise.withResolvers();
 const agent=withAgentTools({id:'codex',run:({text,toolConnection})=>toolConnection.call('fixture',{text})},
  {definitions:[],begin(){},cancel(){},startBridge:transport.startBridge,execute(name,{text}){if(text==='first'){started.resolve();return first.promise;}return 'independent';}});
 const pending=agent.run({text:'first'});await started.promise;
 try{assert.equal(await agent.run({text:'second'}),'independent');}finally{first.resolve('first result');}
 assert.equal(await pending,'first result');
});
test('Codex receives ephemeral MCP config and bridge secrets only in child environment',async t=>{
 const {createAgentBackends}=await load();const {dir,cli}=fixture(t,`const input=fixtureFs.readFileSync(0,'utf8');fixtureFs.writeFileSync('capture',JSON.stringify({argv:process.argv.slice(2),input,socket:process.env.OMA_TOOL_SOCKET,token:process.env.OMA_TOOL_TOKEN}));fixtureFs.writeSync(1,${JSON.stringify(result.codex)});`);
 const connection={socketPath:'/tmp/private-fixture.sock',token:'private-token-fixture'};
 assert.equal(await createAgentBackends({workspace:dir,env:{...process.env,OMA_WORKSPACE:undefined},executables:{codex:cli}}).get('codex').run({text:'private task',toolConnection:connection}),'Verified reply');
 const capture=JSON.parse(readFileSync(join(dir,'capture'),'utf8'));assert.equal(capture.socket,connection.socketPath);assert.equal(capture.token,connection.token);
 const config=capture.argv[capture.argv.indexOf('--config')+1];assert.match(config,/mcp_servers\.oma/);assert.match(config,/agent-tool-mcp\.mjs/);assert.match(config,/env_vars.*OMA_TOOL_SOCKET.*OMA_TOOL_TOKEN/);assert.match(config,/default_tools_approval_mode=\"approve\"/);
 assert.ok(!capture.argv.join(' ').includes(connection.token));assert.ok(!capture.argv.join(' ').includes(connection.socketPath));assert.ok(!capture.argv.join(' ').includes('private task'));
 assert.match(capture.input,/OMA.*MCP/);assert.ok(!capture.input.includes('approval buttons are unavailable'));
});
test('Codex owner wrapper begins every task and closes bridge on success, failure and abort',async()=>{
 const {withAgentTools}=await load();assert.equal(typeof withAgentTools,'function','Codex per-task bridge lifecycle wrapper must be implemented');
 let begins=0,closes=0;const connections=[];const startBridge=async({signal})=>{let finish;const closed=new Promise(r=>finish=r);const bridge={connection:{socketPath:'fixture',token:'fixture'},closed,close:async()=>{closes++;finish();}};signal.addEventListener('abort',()=>bridge.close(),{once:true});return bridge;};
 const owner={definitions:[],execute(){},cancel(){},begin:()=>begins++,startBridge};
 const agent=withAgentTools({id:'codex',label:'Codex CLI',run:async request=>{connections.push(request.toolConnection);return 'verified';}},owner);
 assert.equal(await agent.run({text:'first'}),'verified');assert.equal(await agent.run({text:'second'}),'verified');assert.equal(begins,2);assert.equal(closes,2);assert.equal(connections.length,2);
 const failed=withAgentTools({id:'codex',label:'Codex CLI',run:async()=>{throw Error('fixture failure');}},owner);await assert.rejects(failed.run({text:'failure'}),/fixture failure/);assert.equal(closes,3);
 const controller=new AbortController();const aborted=withAgentTools({id:'codex',label:'Codex CLI',run:request=>new Promise((_,reject)=>request.signal.addEventListener('abort',()=>reject(Error('cancelled'))))},owner);
 const pending=aborted.run({text:'wait',signal:controller.signal});await new Promise(r=>setImmediate(r));controller.abort();await assert.rejects(pending);assert.ok(closes>=4);
 const other={id:'hermes'};assert.equal(withAgentTools(other,owner),other);
});
test('Codex subprocess discovers and calls MCP through a real per-task owner bridge',async t=>{
 const {createAgentBackends,withAgentTools}=await load();assert.equal(typeof withAgentTools,'function','Codex per-task bridge lifecycle wrapper must be implemented');
 const {dir,cli}=fixture(t,`fixtureFs.readFileSync(0,'utf8');
 const argv=process.argv.slice(2),config=argv[argv.indexOf('--config')+1];
 const command=JSON.parse(config.match(/command=("(?:[^"\\\\]|\\\\.)*")/)[1]);
 const args=JSON.parse(config.match(/args=(\\[[^\\]]*\\])/)[1]);
 const mcp=require('node:child_process').spawn(command,args,{env:process.env,stdio:['pipe','pipe','pipe']});let buffer='';
 mcp.stderr.on('data',()=>{});mcp.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\\n'))>=0){const response=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);
 if(response.id===1){if(!response.result.tools.some(tool=>tool.name==='confirm_action'))process.exit(3);mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'confirm_action',arguments:{description:'fixture approval'}}})+'\\n');}
 if(response.id===2){if(!JSON.parse(response.result.content[0].text).approved)process.exit(4);mcp.stdin.end();fixtureFs.writeSync(1,${JSON.stringify(result.codex)});}
 }});mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})+'\\n');`);
 const calls=[];let begins=0,cancels=0;
 const agent=withAgentTools(createAgentBackends({workspace:dir,env:{...process.env,OMA_WORKSPACE:undefined},executables:{codex:cli}}).get('codex'),{definitions:[{type:'function',name:'confirm_action',description:'fixture',parameters:{type:'object',properties:{description:{type:'string'}},required:['description'],additionalProperties:false}}],begin:()=>begins++,cancel:()=>cancels++,execute:async(name,args)=>{calls.push([name,args]);return {approved:true};}});
 assert.equal(await agent.run({text:'fixture request'}),'Verified reply');assert.equal(begins,1);assert.equal(cancels,0);assert.deepEqual(calls,[['confirm_action',{description:'fixture approval'}]]);
});
for(const reason of ['crash','abort','timeout'])test('Codex '+reason+' cancels owner approval and next task begins cleanly',{timeout:5000},async t=>{
 const {createAgentBackends,withAgentTools}=await load();let approvalReady;const ready=new Promise(r=>approvalReady=r);
 const tools=new LocalTools({memory:{},emit:patch=>{if(patch.approval)approvalReady();}});
 const {dir,cli}=fixture(t,`fixtureFs.readFileSync(0,'utf8');const socket=require('node:net').createConnection(process.env.OMA_TOOL_SOCKET);socket.on('error',()=>{});socket.on('connect',()=>socket.write(JSON.stringify({v:1,id:'1',token:process.env.OMA_TOOL_TOKEN,op:'call',name:'confirm_action',args:{description:'fixture'}})+'\\n'));setInterval(()=>{},1000);`);
 const controller=new AbortController();let bridge;
 const agent=withAgentTools(createAgentBackends({workspace:dir,env:{...process.env,OMA_WORKSPACE:undefined},executables:{codex:cli},timeoutMs:reason==='timeout'?500:2000}).get('codex'),{definitions:localToolDefinitions,begin:()=>tools.begin(),cancel:()=>tools.cancel(),execute:async(...args)=>{if(reason==='crash')setTimeout(()=>{const pid=Number(readFileSync(join(dir,'pid'),'utf8'));process.kill(pid,'SIGKILL');},20);return tools.call(...args);},startBridge:async options=>{bridge=await startAgentToolBridge(options);return bridge;}});
 if(reason==='crash')writeFileSync(cli,readFileSync(cli,'utf8')+`fixtureFs.writeFileSync('pid',String(process.pid));`,{mode:0o700});
 const pending=agent.run({text:'fixture',signal:controller.signal});await ready;assert.equal(tools.approvals.size,1);
 if(reason==='abort')controller.abort();await assert.rejects(pending);await bridge.closed;
 assert.equal(tools.approvals.size,0);assert.equal(existsSync(bridge.connection.socketPath),false);assert.equal(tools.controller.signal.aborted,true);
 writeFileSync(cli,'#!'+process.execPath+'\nrequire("node:fs").readFileSync(0,"utf8");require("node:fs").writeSync(1,'+JSON.stringify(result.codex)+');',{mode:0o700});
 assert.equal(await agent.run({text:'next'}),'Verified reply');assert.equal(tools.controller.signal.aborted,false);
});
function fixture(t,body){const dir=mkdtempSync(join(tmpdir(),'oma-agents-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));mkdirSync(join(dir,'.hermes','memories'),{recursive:true});const cli=join(dir,'cli');writeFileSync(cli,'#!'+process.execPath+'\nconst fixtureFs = require("node:fs");\n'+body,{mode:0o700});return {dir,cli};}
const result={claude:JSON.stringify({type:'result',subtype:'success',is_error:false,result:'Verified reply'}),codex:JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Verified reply'}})+'\n'+JSON.stringify({type:'turn.completed'}),hermes:'Verified reply',openclaw:JSON.stringify({payloads:[{text:'Verified reply'}],meta:{stopReason:'stop',terminalReply:{disposition:'visible',text:'Verified reply'}}})};
const openclawCapture=`const argv=process.argv.slice(2);const path=argv[argv.indexOf('--message-file')+1];const input=path==='-'?fixtureFs.readFileSync(0,'utf8'):fixtureFs.readFileSync(path,'utf8');fixtureFs.writeFileSync('capture',JSON.stringify({argv,path,input,fileMode:path==='-'?null:fixtureFs.statSync(path).mode&0o777,dirMode:path==='-'?null:fixtureFs.statSync(require('node:path').dirname(path)).mode&0o777}));`;
const hermesCapture=`const argv=process.argv.slice(2);if(argv[0]!=='-z'||!argv[1].includes('Read the entire UTF-8 file '))throw Error('Missing file instruction');const path=JSON.parse(argv[1].slice(argv[1].indexOf('"'),argv[1].lastIndexOf('"')+1));const input=fixtureFs.readFileSync(path,'utf8');fixtureFs.writeFileSync('capture',JSON.stringify({argv,path,input,stdin:fixtureFs.readFileSync(0,'utf8'),fileMode:fixtureFs.statSync(path).mode&0o777,dirMode:fixtureFs.statSync(require('node:path').dirname(path)).mode&0o777}));`;
function assertPrivateFile(capture){assert.equal(capture.fileMode,0o600);assert.equal(capture.dirMode,0o700);assert.equal(existsSync(capture.path),false);assert.equal(existsSync(dirname(capture.path)),false);}
for(const id of Object.keys(result))test(id+' sends private prompts off argv and parses final output',async t=>{
 const {createAgentBackends}=await load();const {dir,cli}=fixture(t,(id==='openclaw'?openclawCapture:id==='hermes'?hermesCapture:`const input=fixtureFs.readFileSync(0,'utf8');fixtureFs.writeFileSync('capture',JSON.stringify({argv:process.argv.slice(2),input}));`)+`fixtureFs.writeSync(1,${JSON.stringify(result[id])});`);
 const registry=createAgentBackends({workspace:dir,env:{...process.env,OMA_WORKSPACE:undefined,HERMES_HOME:join(dir,'.hermes')},executables:{[id]:cli}});const text='private ; $(touch injected) `echo secret`\n--dangerously-bypass-approvals-and-sandbox';
 assert.equal(await registry.get(id).run({text,context:'untrusted windows'}),'Verified reply');assert.equal(existsSync(join(dir,'injected')),false);
 const capture=JSON.parse(readFileSync(join(dir,'capture'),'utf8'));assert.ok(capture.input.includes(text));assert.match(capture.input,/untrusted reference/i);assert.ok(capture.input.includes('untrusted windows'));assert.ok(!capture.argv.join(' ').includes(text));
 const skill=fileURLToPath(new URL('../skills/oma/SKILL.md',import.meta.url));assert.ok(existsSync(skill));assert.ok(capture.input.includes(skill));assert.match(capture.input,/read.*OMA-specific/i);assert.match(capture.input,/OMA LocalTools.*approval buttons.*unavailable for this task/i);
 assert.ok(!capture.argv.join(' ').includes('untrusted windows'));
 if(id==='codex')assert.deepEqual(capture.argv,['exec','--json','--ephemeral','--sandbox','read-only','--skip-git-repo-check','--cd',dir,'-']);
 if(id==='hermes'){assert.equal(capture.argv[0],'-z');assert.deepEqual(capture.argv.slice(2),['--profile','default']);assertPrivateFile(capture);assert.equal(capture.stdin,'');assert.ok(capture.argv[1].includes(JSON.stringify(capture.path)));}
 if(id==='openclaw'){assertPrivateFile(capture);assert.deepEqual(capture.argv,['agent','--local','--agent','main','--message-file',capture.path,'--json']);assert.ok(capture.input.includes(dir));}
});
function git(dir,args){return execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']});}
test('Codex explicit Git project and worktree grant only project-scoped workspace writes',async t=>{
 const {createAgentBackends}=await load();const {dir,cli}=fixture(t,`const input=fixtureFs.readFileSync(0,'utf8');fixtureFs.writeFileSync('capture',JSON.stringify({argv:process.argv.slice(2),input}));fixtureFs.writeSync(1,${JSON.stringify(result.codex)});`);
 const repo=join(dir,'repo');mkdirSync(repo);git(repo,['init','-q']);git(repo,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-q','--allow-empty','-m','fixture']);
 const worktree=join(dir,'worktree');git(repo,['worktree','add','-q','--detach',worktree]);assert.ok(readFileSync(join(worktree,'.git'),'utf8').startsWith('gitdir:'));
 for(const workspace of [repo,worktree]){
  const env={...process.env,OMA_WORKSPACE:workspace};const agent=createAgentBackends({workspace,env,executables:{codex:cli}}).get('codex');assert.equal(await agent.run({text:'private ; $(touch injected)'}),'Verified reply');
  const capture=JSON.parse(readFileSync(join(workspace,'capture'),'utf8'));assert.deepEqual(capture.argv,['exec','--json','--ephemeral','--sandbox','workspace-write','--cd',workspace,'-']);assert.equal(existsSync(join(workspace,'injected')),false);
 }
});
test('Codex rejects invalid configured projects before spawning without leaking private paths or requests',async t=>{
 const {createAgentBackends}=await load();const {dir,cli}=fixture(t,`fixtureFs.writeFileSync(${JSON.stringify('/tmp/unused')},'not used');`);
 const marker=join(dir,'spawned');writeFileSync(cli,'#!'+process.execPath+'\nrequire("node:fs").writeFileSync('+JSON.stringify(marker)+',"spawned");',{mode:0o700});
 const repo=join(dir,'repo');mkdirSync(repo);git(repo,['init','-q']);const subdir=join(repo,'subdir');mkdirSync(subdir);
 const forged=join(dir,'forged');mkdirSync(forged);mkdirSync(join(forged,'.git'));const file=join(dir,'private-file');writeFileSync(file,'private');
 const paths=['','relative-private-path',join(dir,'missing-private-path'),file,dir,subdir,forged,join(homedir(),'Projects'),homedir(),'/'];
 for(const workspace of paths){let progressed=false;const agent=createAgentBackends({workspace,env:{...process.env,OMA_WORKSPACE:workspace},executables:{codex:cli}}).get('codex');
  await assert.rejects(agent.run({text:'private user request',onProgress:()=>progressed=true}),e=>/OMA_WORKSPACE.*absolute.*Git repository root/i.test(e.message)&&!e.message.includes('private')&&!e.message.includes(dir));assert.equal(progressed,false);assert.equal(existsSync(marker),false);
 }
 // Inherited Git overrides must not turn a non-repository into an accepted project.
 await assert.rejects(createAgentBackends({env:{...process.env,OMA_WORKSPACE:forged,GIT_DIR:join(repo,'.git'),GIT_WORK_TREE:forged},executables:{codex:cli}}).get('codex').run({text:'test'}),/OMA_WORKSPACE/);assert.equal(existsSync(marker),false);
});
test('registry allowlist, client delegation and missing executable have safe actionable errors',async()=>{
 const {createAgentBackends}=await load();const r=createAgentBackends({env:{PATH:''}});assert.deepEqual(r.options().map(o=>o.value),['codex','claude','hermes','openclaw']);for(const id of ['codex','claude','hermes','openclaw'])assert.equal(r.get(id).mode,'client');assert.throws(()=>r.get('openai'),/Unknown/);assert.equal(r.get('codex').available,false);assert.throws(()=>r.get('__proto__'),/Unknown/);await assert.rejects(r.get('codex').run({text:'hello'}),/Codex CLI.*install|Codex CLI.*PATH/i);
});
for(const [id,output,code] of [['codex',JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'partial'}}),0],['codex',result.codex+'\n'+JSON.stringify({type:'turn.failed'}),0],['hermes','partial secret',2],['openclaw',JSON.stringify({ok:false,status:'error',final:'partial secret'}),0],['openclaw','garbage secret',0],['hermes','',0]])test(id+' rejects partial/nonzero/malformed/empty '+code+' '+output.slice(0,30),async t=>{
 const {createAgentBackends}=await load();const {dir,cli}=fixture(t,`fixtureFs.writeSync(1,${JSON.stringify(output)});fixtureFs.writeSync(2,'secret diagnostic');process.exit(${code});`);const r=createAgentBackends({workspace:dir,env:{...process.env,HERMES_HOME:join(dir,'.hermes')},executables:{[id]:cli}});
 await assert.rejects(r.get(id).run({text:'test'}),e=>!e.message.includes('secret')&&/failed|incomplete|final reply/i.test(e.message));
});
test('bounded output and timeout fail without returning partial text',async t=>{
 const {createAgentBackends}=await load();for(const [body,options,pattern] of [["fixtureFs.writeSync(1,'x'.repeat(10000));setInterval(()=>{},1000)",{maxOutputBytes:64,timeoutMs:1000},/output limit/],["setInterval(()=>{},1000)",{timeoutMs:30},/timed out/]]){const {dir,cli}=fixture(t,body);await assert.rejects(createAgentBackends({workspace:dir,env:{...process.env,HERMES_HOME:join(dir,'.hermes')},executables:{hermes:cli},...options}).get('hermes').run({text:'test'}),pattern);}
});
test('AbortSignal cancels a running process and an already cancelled request never starts',async t=>{
 const {createAgentBackends}=await load();const {dir,cli}=fixture(t,"fixtureFs.writeSync(1,'partial');setInterval(()=>{},1000)");const a=createAgentBackends({workspace:dir,env:{...process.env,HERMES_HOME:join(dir,'.hermes')},executables:{hermes:cli}}).get('hermes');const c=new AbortController();const p=a.run({text:'test',signal:c.signal});setTimeout(()=>c.abort(),30);await assert.rejects(p,/cancelled/);await assert.rejects(a.run({text:'test',signal:c.signal}),/cancelled/);await assert.rejects(a.run({text:'  '}),/empty/);
});

for(const [name,response] of [
 ['payloads only',{payloads:[{text:' One '},{text:'Two'}],meta:{stopReason:'stop'}}],
 ['terminal only',{meta:{stopReason:'end_turn',terminalReply:{disposition:'visible',text:'One\nTwo'}}}],
])test('OpenClaw accepts completed '+name,async t=>{
 const {createAgentBackends}=await load();const {dir,cli}=fixture(t,openclawCapture+`fixtureFs.writeSync(1,${JSON.stringify(JSON.stringify(response))});`);
 assert.equal(await createAgentBackends({workspace:dir,executables:{openclaw:cli}}).get('openclaw').run({text:'private request'}),'One\nTwo');
 assertPrivateFile(JSON.parse(readFileSync(join(dir,'capture'),'utf8')));
});
const partial={payloads:[{text:'partial secret'}],meta:{stopReason:'stop'}};
for(const [name,response,code] of [
 ['missing metadata',{payloads:partial.payloads},0],
 ['missing stop reason',{payloads:partial.payloads,meta:{}},0],
 ['length limit',{...partial,meta:{stopReason:'length'}},0],
 ['tool turn',{...partial,meta:{stopReason:'toolUse'}},0],
 ['false ok',{...partial,ok:false},0],
 ['top error',{...partial,error:'secret diagnostic'},0],
 ['meta error',{...partial,meta:{stopReason:'stop',error:{message:'secret diagnostic'}}},0],
 ['aborted',{...partial,meta:{stopReason:'stop',aborted:true}},0],
 ['yielded',{...partial,meta:{stopReason:'stop',yielded:true}},0],
 ['invalid replay',{...partial,meta:{stopReason:'stop',replayInvalid:true}},0],
 ['pending continuation',{...partial,meta:{stopReason:'stop',continuationPending:true}},0],
 ['pending tools',{...partial,meta:{stopReason:'stop',pendingToolCalls:[{name:'tool'}]}},0],
 ['error payload',{payloads:[{text:'secret diagnostic',isError:true}],meta:partial.meta},0],
 ['hidden terminal',{meta:{stopReason:'stop',terminalReply:{disposition:'silent',text:'partial secret'}}},0],
 ['empty',{payloads:[{text:'  '}],meta:partial.meta},0],
 ['bad text',{payloads:[{text:42}],meta:partial.meta},0],
 ['null',null,0],
 ['nonzero',partial,2],
 ['malformed','secret garbage',0],
])test('OpenClaw rejects '+name+' and removes private file',async t=>{
 const {createAgentBackends}=await load();const output=name==='malformed'?response:JSON.stringify(response);
 const {dir,cli}=fixture(t,openclawCapture+`fixtureFs.writeSync(1,${JSON.stringify(output)});fixtureFs.writeSync(2,'secret diagnostic');process.exit(${code});`);
 await assert.rejects(createAgentBackends({workspace:dir,executables:{openclaw:cli}}).get('openclaw').run({text:'private request'}),e=>/failed|final reply/.test(e.message)&&!e.message.includes('secret')&&!e.message.includes('private request'));
 assertPrivateFile(JSON.parse(readFileSync(join(dir,'capture'),'utf8')));
});
for(const id of ['openclaw','hermes'])for(const reason of ['timeout','abort','output limit'])test(id+' removes private file on '+reason,async t=>{
 const {createAgentBackends}=await load();const capture=id==='hermes'?hermesCapture:openclawCapture;const {dir,cli}=fixture(t,capture+`setInterval(()=>{},1000);`);
 const controller=new AbortController();let watcher;
 const options=reason==='timeout'?{timeoutMs:2000}:{};
 const agent=createAgentBackends({workspace:dir,env:{...process.env,HERMES_HOME:join(dir,'.hermes')},executables:{[id]:cli},...options,maxOutputBytes:reason==='output limit'?32:1024}).get(id);
 if(reason==='output limit')writeFileSync(cli,'#!'+process.execPath+'\nconst fixtureFs=require("node:fs");\n'+capture+`fixtureFs.writeSync(1,'secret'.repeat(100));setInterval(()=>{},1000);`,{mode:0o700});
 if(reason==='abort'){watcher=setInterval(()=>{if(existsSync(join(dir,'capture')))controller.abort();},10);t.after(()=>clearInterval(watcher));}
 await assert.rejects(agent.run({text:'private request',signal:controller.signal}),reason==='timeout'?/timed out/:reason==='abort'?/cancelled/:/output limit/);
 clearInterval(watcher);assertPrivateFile(JSON.parse(readFileSync(join(dir,'capture'),'utf8')));
});
for(const id of ['openclaw','hermes'])test(id+' removes private file on spawn error',async t=>{
 const {createAgentBackends}=await load();const {dir,cli}=fixture(t,'');writeFileSync(cli,'#!/nonexistent-oma-fixture-interpreter\n',{mode:0o700});
 const before=new Set(readdirSync(tmpdir()).filter(name=>name.startsWith('oma-'+id+'-')));
 let inputPath;
 await assert.rejects(createAgentBackends({workspace:dir,env:{...process.env,HERMES_HOME:join(dir,'.hermes')},executables:{[id]:cli}}).get(id).run({text:'private request',onProgress:()=>{
  const created=readdirSync(tmpdir()).filter(name=>name.startsWith('oma-'+id+'-')&&!before.has(name));assert.equal(created.length,1);
  inputPath=join(tmpdir(),created[0],'message');assert.ok(readFileSync(inputPath,'utf8').includes('private request'));
 }}),id==='hermes'?e=>/(?:failed or incomplete|failed to receive the request)/.test(e.message)&&!e.message.includes('private request'):/failed to start/);
 assert.ok(inputPath);assert.equal(existsSync(inputPath),false);assert.equal(existsSync(dirname(inputPath)),false);
 assert.deepEqual(new Set(readdirSync(tmpdir()).filter(name=>name.startsWith('oma-'+id+'-'))),before);
});

for(const [name,output,code] of [['nonzero','partial secret',2],['empty',' \n ',0]])test('Hermes rejects '+name+' and removes private file',async t=>{
 const {createAgentBackends}=await load();const {dir,cli}=fixture(t,hermesCapture+`fixtureFs.writeSync(1,${JSON.stringify(output)});fixtureFs.writeSync(2,'secret diagnostic');process.exit(${code});`);
 await assert.rejects(createAgentBackends({workspace:dir,env:{...process.env,HERMES_HOME:join(dir,'.hermes')},executables:{hermes:cli}}).get('hermes').run({text:'private request',context:'private context'}),e=>/failed|final reply/.test(e.message)&&!e.message.includes('secret')&&!e.message.includes('private request')&&!e.message.includes('private context'));
 assertPrivateFile(JSON.parse(readFileSync(join(dir,'capture'),'utf8')));
});

const claudeSuccess={type:'result',subtype:'success',is_error:false,result:'Verified reply'};
const claudeCapture=`const argv=process.argv.slice(2),path=argv[argv.indexOf('--mcp-config')+1];const config=JSON.parse(fixtureFs.readFileSync(path,'utf8'));const input=fixtureFs.readFileSync(0,'utf8');fixtureFs.writeFileSync('capture',JSON.stringify({argv,path,input,config,fileMode:fixtureFs.statSync(path).mode&0o777,dirMode:fixtureFs.statSync(require('node:path').dirname(path)).mode&0o777,envSocket:process.env.OMA_TOOL_SOCKET,envToken:process.env.OMA_TOOL_TOKEN}));`;
const claudeConnection={socketPath:'/tmp/claude-private.sock',token:'claude-private-token',toolNames:['confirm_action','desktop_screenshot']};
test('Claude exposes truthful executable availability and private prompt/config with only explicit OMA allowances',async t=>{
 const {createAgentBackends}=await load();const {dir,cli}=fixture(t,claudeCapture+`fixtureFs.writeSync(1,${JSON.stringify(JSON.stringify(claudeSuccess))});`);
 const registry=createAgentBackends({workspace:dir,env:{...process.env,OMA_TOOL_SOCKET:'stale socket',OMA_TOOL_TOKEN:'stale token'},executables:{claude:cli}});
 assert.equal(registry.get('claude').available,true);assert.equal(registry.get('claude').mode,'client');assert.equal(registry.get('claude').label,'Claude Code');
 assert.equal(await registry.get('claude').run({text:'private request',context:'private context',toolConnection:claudeConnection}),'Verified reply');
 const capture=JSON.parse(readFileSync(join(dir,'capture'),'utf8'));assertPrivateFile(capture);
 assert.deepEqual(capture.argv,['-p','--output-format','json','--no-session-persistence','--permission-prompts','none','--mcp-config',capture.path,'--allowedTools','mcp__oma__confirm_action,mcp__oma__desktop_screenshot']);
 assert.equal(capture.envSocket,undefined);assert.equal(capture.envToken,undefined);
 assert.deepEqual(capture.config,{mcpServers:{oma:{type:'stdio',command:process.execPath,args:[fileURLToPath(new URL('../runtime/agent-tool-mcp.mjs',import.meta.url))],env:{OMA_TOOL_SOCKET:claudeConnection.socketPath,OMA_TOOL_TOKEN:claudeConnection.token}}}});
 for(const value of ['private request','private context',claudeConnection.token,claudeConnection.socketPath])assert.ok(!capture.argv.join(' ').includes(value));
 assert.match(capture.input,/OMA.*MCP/);assert.match(capture.input,/private request/);assert.match(capture.input,/private context/);assert.match(capture.input,/untrusted reference/i);
 const missing=createAgentBackends({env:{PATH:''}}).get('claude');assert.equal(missing.available,false);await assert.rejects(missing.run({text:'hi'}),/Claude Code.*PATH/);
});
for(const [name,response,code] of [
 ['missing type',{subtype:'success',is_error:false,result:'partial secret'},0],
 ['missing subtype',{type:'result',is_error:false,result:'partial secret'},0],
 ['missing error flag',{type:'result',subtype:'success',result:'partial secret'},0],
 ['wrong error flag',{...claudeSuccess,is_error:'false'},0],
 ['error result',{...claudeSuccess,is_error:true},0],
 ['execution error',{...claudeSuccess,subtype:'error_during_execution',errors:['secret diagnostic']},0],
 ['max turns',{...claudeSuccess,subtype:'error_max_turns'},0],
 ['nonstring',{...claudeSuccess,result:42},0],
 ['empty',{...claudeSuccess,result:'  '},0],
 ['null',null,0],['array',[claudeSuccess],0],['malformed','secret garbage',0],
 ['nonzero',claudeSuccess,2],
])test('Claude rejects '+name+' without leaking output and removes MCP config',async t=>{
 const {createAgentBackends}=await load();const output=name==='malformed'?response:JSON.stringify(response);
 const {dir,cli}=fixture(t,claudeCapture+`fixtureFs.writeSync(1,${JSON.stringify(output)});fixtureFs.writeSync(2,'secret diagnostic');process.exit(${code});`);
 await assert.rejects(createAgentBackends({workspace:dir,executables:{claude:cli}}).get('claude').run({text:'private request',toolConnection:claudeConnection}),e=>/failed|final reply/.test(e.message)&&!e.message.includes('secret')&&!e.message.includes('private request'));
 assertPrivateFile(JSON.parse(readFileSync(join(dir,'capture'),'utf8')));
});
for(const reason of ['timeout','abort','output limit'])test('Claude removes MCP config on '+reason,async t=>{
 const {createAgentBackends}=await load();const {dir,cli}=fixture(t,claudeCapture+(reason==='output limit'?`fixtureFs.writeSync(1,'secret'.repeat(100));`:'')+`setInterval(()=>{},1000);`);
 const controller=new AbortController();let watcher;
 if(reason==='abort'){watcher=setInterval(()=>{if(existsSync(join(dir,'capture')))controller.abort();},10);t.after(()=>clearInterval(watcher));}
 await assert.rejects(createAgentBackends({workspace:dir,executables:{claude:cli},timeoutMs:1000,maxOutputBytes:reason==='output limit'?32:1024}).get('claude').run({text:'private request',signal:controller.signal,toolConnection:claudeConnection}),reason==='timeout'?/timed out/:reason==='abort'?/cancelled/:/output limit/);
 clearInterval(watcher);assertPrivateFile(JSON.parse(readFileSync(join(dir,'capture'),'utf8')));
});
test('Claude removes MCP config on spawn error and never starts cancelled requests',async t=>{
 const {createAgentBackends}=await load();const {dir,cli}=fixture(t,'');writeFileSync(cli,'#!/nonexistent-oma-fixture-interpreter\n',{mode:0o700});
 const before=new Set(readdirSync(tmpdir()).filter(n=>n.startsWith('oma-claude-')));
 let configPath;const agent=createAgentBackends({workspace:dir,executables:{claude:cli}}).get('claude');
 await assert.rejects(agent.run({text:'private request',toolConnection:claudeConnection,onProgress:()=>{const paths=readdirSync(tmpdir()).filter(n=>n.startsWith('oma-claude-')&&!before.has(n));assert.equal(paths.length,1);configPath=join(tmpdir(),paths[0],'mcp.json');assert.ok(existsSync(configPath));}}),e=>/failed to (start|receive the request)/.test(e.message));
 assert.equal(existsSync(configPath),false);assert.equal(existsSync(dirname(configPath)),false);
 const controller=new AbortController();controller.abort();await assert.rejects(agent.run({text:'private request',signal:controller.signal}),/cancelled/);
});
test('Claude fake subprocess calls approval and receives structured image through real OMA MCP',async t=>{
 const {createAgentBackends,withAgentTools}=await load();
 const {dir,cli}=fixture(t,claudeCapture+`
 const server=config.mcpServers.oma,mcp=require('node:child_process').spawn(server.command,server.args,{env:{...process.env,...server.env},stdio:['pipe','pipe','pipe']});let buffer='';
 const send=(id,method,params)=>mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\\n');mcp.stderr.on('data',()=>{});
 mcp.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\\n'))>=0){const response=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);
 if(response.id===1){if(!response.result.tools.some(tool=>tool.name==='confirm_action')||!response.result.tools.some(tool=>tool.name==='desktop_screenshot'&&tool.inputSchema.required.includes('monitor')))process.exit(3);send(2,'tools/call',{name:'confirm_action',arguments:{description:'fixture approval'}});}
 if(response.id===2){if(!JSON.parse(response.result.content[0].text).approved)process.exit(4);send(3,'tools/call',{name:'desktop_screenshot',arguments:{monitor:''}});}
 if(response.id===3){fixtureFs.writeFileSync('mcp-result',JSON.stringify(response.result));mcp.stdin.end();fixtureFs.writeSync(1,${JSON.stringify(JSON.stringify(claudeSuccess))});}
 }});send(1,'tools/list',{});`);
 const calls=[];let begins=0,cancels=0,bridge;
 const agent=withAgentTools(createAgentBackends({workspace:dir,executables:{claude:cli}}).get('claude'),{definitions:localToolDefinitions,begin:()=>begins++,cancel:()=>cancels++,execute:async(name,args)=>{calls.push([name,args]);return name==='confirm_action'?{approved:true}:{observations:['synthetic screenshot'],images:['data:image/png;base64,AQID'],fixture:true};},startBridge:async options=>{bridge=await startAgentToolBridge(options);return bridge;}});
 assert.equal(await agent.run({text:'fixture request'}),'Verified reply');assert.equal(begins,1);assert.equal(cancels,0);assert.deepEqual(calls,[['confirm_action',{description:'fixture approval'}],['desktop_screenshot',{monitor:''}]]);
 assert.deepEqual(JSON.parse(readFileSync(join(dir,'mcp-result'),'utf8')),{content:[{type:'text',text:'synthetic screenshot'},{type:'image',mimeType:'image/png',data:'AQID'},{type:'text',text:'{"fixture":true}'}]});
 assertPrivateFile(JSON.parse(readFileSync(join(dir,'capture'),'utf8')));assert.equal(existsSync(bridge.connection.socketPath),false);
});
for(const reason of ['crash','abort','timeout'])test('Claude '+reason+' cancels approval, cleans config/bridge and next task begins cleanly',{timeout:5000},async t=>{
 const {createAgentBackends,withAgentTools}=await load();let approvalReady;const ready=new Promise(r=>approvalReady=r);
 const tools=new LocalTools({memory:{},emit:patch=>{if(patch.approval)approvalReady();}});
 const {dir,cli}=fixture(t,claudeCapture+`fixtureFs.writeFileSync('pid',String(process.pid));const socket=require('node:net').createConnection(config.mcpServers.oma.env.OMA_TOOL_SOCKET);socket.on('error',()=>{});socket.on('connect',()=>socket.write(JSON.stringify({v:1,id:'1',token:config.mcpServers.oma.env.OMA_TOOL_TOKEN,op:'call',name:'confirm_action',args:{description:'fixture'}})+'\\n'));setInterval(()=>{},1000);`);
 const controller=new AbortController();let bridge;
 const agent=withAgentTools(createAgentBackends({workspace:dir,executables:{claude:cli},timeoutMs:reason==='timeout'?500:2000}).get('claude'),{definitions:localToolDefinitions,begin:()=>tools.begin(),cancel:()=>tools.cancel(),execute:async(...args)=>{if(reason==='crash')setTimeout(()=>process.kill(Number(readFileSync(join(dir,'pid'),'utf8')),'SIGKILL'),20);return tools.call(...args);},startBridge:async options=>{bridge=await startAgentToolBridge(options);return bridge;}});
 const pending=agent.run({text:'fixture',signal:controller.signal});await ready;assert.equal(tools.approvals.size,1);if(reason==='abort')controller.abort();await assert.rejects(pending);await bridge.closed;
 assert.equal(tools.approvals.size,0);assert.equal(tools.controller.signal.aborted,true);assert.equal(existsSync(bridge.connection.socketPath),false);assertPrivateFile(JSON.parse(readFileSync(join(dir,'capture'),'utf8')));
 writeFileSync(cli,'#!'+process.execPath+'\nrequire("node:fs").readFileSync(0,"utf8");require("node:fs").writeSync(1,'+JSON.stringify(JSON.stringify(claudeSuccess))+');',{mode:0o700});
 assert.equal(await agent.run({text:'next'}),'Verified reply');assert.equal(tools.controller.signal.aborted,false);
});

for(const storage of ['OMA_DATA_DIR','XDG_DATA_HOME','HOME'])test('all CLI subprocesses use private portable default workspace via '+storage,async t=>{
 const {createAgentBackends}=await load();
 for(const id of ['codex','claude','hermes','openclaw']){
  const {dir,cli}=fixture(t,`fixtureFs.readFileSync(0,'utf8');fixtureFs.writeFileSync(process.env.OMA_FIXTURE_CAPTURE,JSON.stringify({cwd:process.cwd(),argv:process.argv.slice(2),home:process.env.HOME}));fixtureFs.writeSync(1,${JSON.stringify(result[id])});`);
  const home=join(dir,'home');mkdirSync(home);
  const env={...process.env,OMA_FIXTURE_CAPTURE:join(dir,'capture'),HOME:home,OMA_WORKSPACE:undefined,OMA_DATA_DIR:undefined,XDG_DATA_HOME:undefined,HERMES_HOME:join(dir,'.hermes')};
  if(storage!=='HOME')env[storage]=join(dir,'data');
  const data=storage==='OMA_DATA_DIR'?env.OMA_DATA_DIR:storage==='XDG_DATA_HOME'?join(env.XDG_DATA_HOME,'oma'):join(home,'.local/share/oma');
  const workspace=join(data,'workspace');
  assert.equal(await createAgentBackends({env,executables:{[id]:cli}}).get(id).run({text:'fixture request'}),'Verified reply');
  const capture=JSON.parse(readFileSync(join(dir,'capture'),'utf8'));
  assert.equal(capture.cwd,workspace);assert.equal(capture.home,home);assert.equal(statSync(workspace).mode&0o777,0o700);
  assert.equal(existsSync(join(home,'Projects')),false);
  if(id==='codex'){assert.equal(capture.argv[capture.argv.indexOf('--sandbox')+1],'read-only');assert.equal(capture.argv[capture.argv.indexOf('--cd')+1],workspace);}
 }
});

test('workspace resolver keeps explicit directories authoritative and refuses invalid paths or default aliases',async t=>{
 const {resolveAgentWorkspace}=await load();const {symlinkSync,chmodSync}=await import('node:fs');
 const dir=mkdtempSync(join(tmpdir(),'oma-workspace-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const env={HOME:dir,OMA_DATA_DIR:join(dir,'data')},selected=join(dir,'repo');mkdirSync(selected);
 assert.equal(resolveAgentWorkspace({env:{...env,OMA_WORKSPACE:selected}}),selected);
 assert.equal(existsSync(env.OMA_DATA_DIR),false);
 for(const value of ['', 'relative',join(dir,'missing')])assert.throws(()=>resolveAgentWorkspace({env:{...env,OMA_WORKSPACE:value}}),/OMA_WORKSPACE/);
 assert.equal(existsSync(join(dir,'missing')),false);
 mkdirSync(env.OMA_DATA_DIR);symlinkSync(selected,join(env.OMA_DATA_DIR,'workspace'));
 assert.throws(()=>resolveAgentWorkspace({env}),/private OMA workspace/);
 assert.equal(statSync(selected).mode&0o777,0o755&~process.umask());
 const dataDir=join(dir,'second');mkdirSync(join(dataDir,'workspace'),{recursive:true});chmodSync(join(dataDir,'workspace'),0o755);
 const workspace=resolveAgentWorkspace({env,dataDir});assert.equal(workspace,join(dataDir,'workspace'));assert.equal(statSync(workspace).mode&0o777,0o700);
 const tools=new LocalTools({cwd:workspace});assert.equal(tools.cwd,workspace);
});

test('LocalTools files and command subprocess share the resolved OMA workspace',async t=>{
 const {resolveAgentWorkspace}=await load();const dir=mkdtempSync(join(tmpdir(),'oma-local-workspace-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const workspace=resolveAgentWorkspace({env:{HOME:dir}}),tools=new LocalTools({cwd:workspace,emit:()=>{}});tools.begin();t.after(()=>tools.cancel());
 await tools.call('write_file',{path:'fixture.txt',content:'workspace fixture'});
 assert.equal(readFileSync(join(workspace,'fixture.txt'),'utf8'),'workspace fixture');
 assert.equal((await tools.call('read_file',{path:'fixture.txt'})).text,'workspace fixture');
 const result=await tools.call('run_command',{command:process.execPath,args:['-e','require("node:fs").writeSync(1,process.cwd())']});
 assert.equal(result.stdout,workspace);
});
