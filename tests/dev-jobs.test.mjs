import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,access,mkdir,symlink,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DevJobs,findAoRunner,runBoundedCommand} from '../runtime/dev-jobs.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'oma-dev-jobs-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const projects=join(root,'repositories'),workspace=join(projects,'example'),stateDir=join(root,'private'),runner=join(root,'cli_agent_job.py');
 await mkdir(workspace,{recursive:true});await writeFile(runner,'# fixture, never executed');
 const env={OMA_AO_RUNNER:runner,OMA_DEVELOPMENT_ROOT:projects,OMA_DATA_DIR:stateDir};
 const calls=[],jobs=new Map();let dirty=false,git=true,fail='',malformed='',modelAvailable=true,answerFile;
 const commandRunner=async(command,args,options)=>{
  calls.push({command,args,options});
  if(command==='git'){
   if(args.includes('--show-toplevel'))return {code:git?0:128,stdout:git?workspace+'\n':'',stderr:'not a git repository'};
   if(args.includes('status'))return {code:0,stdout:dirty?' M src/main.mjs\n':'',stderr:''};
   if(args.includes('add')){await mkdir(args.at(-2));return {code:0,stdout:'',stderr:''};}
   throw Error('Unexpected git call '+args);
  }
  assert.equal(command,'python3');assert.equal(args[0],runner);assert.ok(args.includes('--json'));
  assert.ok(options.timeoutMs>0&&options.maxOutputBytes>0);assert.equal(options.signal,undefined);
  const sub=args[1];if(sub==='answer'){answerFile=args[args.indexOf('--file')+1];assert.equal((await stat(answerFile)).mode&0o777,0o600);assert.equal((await stat(join(answerFile,'..'))).mode&0o777,0o700);}
  if(sub===fail)return {code:7,stdout:'',stderr:'fixture failure'};
  if(sub===malformed)return {code:0,stdout:'not JSON',stderr:''};
  let value;
  if(sub==='catalog')value={'codex-cli':{available:true,models:{discovery:'succeeded',choices:modelAvailable?[{id:'gpt-6.1-sol',reasoning_efforts:['medium']}]:[]}}};
  else if(sub==='recommend-executors')value={recommendations:[{model:'gpt-6.1-sol'}]};
  else if(sub==='validate-task'){
   const text=await readFile(args[args.indexOf('--task-file')+1],'utf8');
   for(const section of ['Objective','Why','Scope','Files to inspect','Implementation guidance','Constraints','Acceptance criteria','Validation','Final report'])assert.ok(text.includes('# '+section+'\n'),section);
   assert.match(text,/Do not commit, push/);assert.match(text,/Do not spawn native subagents/);assert.match(text,/ask/);assert.ok(text.includes('$(touch /tmp/should-never-run)'));
   assert.equal((await stat(args[args.indexOf('--task-file')+1])).mode&0o777,0o600);
   value={valid:true};
  }else if(sub==='create-plan'){
   assert.equal(args[args.indexOf('--executor')+1],'codex-cli=gpt-6.1-sol');
   const text=await readFile(args[args.indexOf('--plan-file')+1],'utf8');
   for(const section of ['Goal','Decisions and assumptions','Constraints and guardrails','Checklist','Validation strategy','Completion criteria'])assert.ok(text.includes('# '+section+'\n'));
   assert.equal((text.match(/^\s*-\s+\[[ xX]\]/gm)||[]).length,1,'User text injected plan checklist items');
   assert.match(text,/medium/);value={plan_id:'plan-fixture',items:[{id:'item-001'}]};
  }else if(sub==='launch'){
   assert.equal(args[args.indexOf('--cli')+1],'codex-cli');assert.equal(args[args.indexOf('--model')+1],'gpt-6.1-sol');assert.equal(args[args.indexOf('--reasoning-effort')+1],'medium');
   assert.equal(args[args.indexOf('--plan-id')+1],'plan-fixture');assert.equal(args[args.indexOf('--checklist-item')+1],'item-001');
   assert.ok(args.includes('--allow-path'));assert.ok(args.includes('--deny-path'));assert.ok(!args.includes('--allow-dirty'));assert.ok(!args.includes('--allow-unstructured-task'));
   const id=args[args.indexOf('--job-id')+1];jobs.set(id,{job_id:id,state:'running',acceptance_state:'not_accepted',current_phase:'edit',last_event:{type:'worker_progress',phase:'edit',message:'Editing the scoped file'},questions:[{id:'q-123-abc',state:'pending',question:'Should the label be Japanese?'}]});
   value={job_id:id,state:'starting',workspace:args[args.indexOf('--workspace')+1],plan_id:'plan-fixture'};
  }else if(sub==='status'){value=jobs.get(args[2]);if(!value)return {code:1,stdout:'',stderr:'Unknown job ID'};}
  else if(sub==='list')value=[...jobs.values()];
  else if(sub==='questions'){value=jobs.get(args[2])?.questions;if(!value)return {code:1,stdout:'',stderr:'Unknown job ID'};}
  else if(sub==='answer'){
   const q=jobs.get(args[2]).questions.find(q=>q.id===args[3]);q.answer=await readFile(answerFile,'utf8');q.state='answered';value={job_id:args[2],question_id:args[3],state:'answered'};
  }else throw Error('Unexpected AO command '+sub);
  return {code:0,stdout:JSON.stringify(value),stderr:''};
 };
 const fresh=()=>new DevJobs({env,commandRunner});
 const input={workspace,request:'Fix the label $(touch /tmp/should-never-run)',allowed_paths:['src/main.mjs','tests/**'],files_to_inspect:'src/main.mjs: label renderer; tests/main.test.mjs: existing pattern',validation_commands:'node --test tests/main.test.mjs'};
 return {root,workspace,runner,env,calls,jobs,fresh,input,setDirty:v=>dirty=v,setGit:v=>git=v,setFail:v=>fail=v,setMalformed:v=>malformed=v,setModelAvailable:v=>modelAvailable=v,answerFile:()=>answerFile};
}

test('structured detached AO job can be observed and answered by fresh bridges',async t=>{
 const f=await fixture(t),started=await f.fresh().start(f.input);
 assert.match(started.job_id,/^oma-/);assert.equal(started.state,'starting');assert.notEqual(started.workspace,f.workspace);
 const status=await f.fresh().status(started.job_id);assert.equal(status.state,'running');assert.equal(status.progress,'Editing the scoped file');
 const questions=await f.fresh().questions(started.job_id);assert.deepEqual(questions,{job_id:started.job_id,questions:[{id:'q-123-abc',text:'Should the label be Japanese?'}]});
 assert.deepEqual(await f.fresh().answer(started.job_id,'q-123-abc','日本語でお願いします。'),{job_id:started.job_id,question_id:'q-123-abc',answered:true});
 assert.equal(f.jobs.get(started.job_id).questions[0].answer,'日本語でお願いします。');
 await assert.rejects(access(f.answerFile()),/ENOENT/);
 await assert.rejects(()=>f.fresh().answer(started.job_id,'q-123-abc','Again'),/pending/i);
});

test('invalid workspace, request, task scope and IDs fail before invoking AO',async t=>{
 const f=await fixture(t),bridge=f.fresh();
 for(const patch of [{workspace:f.root},{workspace:join(f.root,'missing')},{request:''},{request:'x'.repeat(24001)},{allowed_paths:[]},{allowed_paths:['../outside']},{allowed_paths:['**']},{allowed_paths:['.git/config']},{files_to_inspect:''},{validation_commands:''}])await assert.rejects(()=>bridge.start({...f.input,...patch}),/Invalid|Workspace|outside/i);
 const outside=join(f.root,'outside');await mkdir(outside);await symlink(outside,join(f.root,'repositories','escape'));
 await assert.rejects(()=>bridge.start({...f.input,workspace:join(f.root,'repositories','escape')}),/outside/i);
 for(const id of ['','../x','--help','x'.repeat(65)]){
  await assert.rejects(()=>bridge.status(id),/Invalid/);await assert.rejects(()=>bridge.questions(id),/Invalid/);await assert.rejects(()=>bridge.answer(id,'q-123','yes'),/Invalid/);
 }
 assert.equal(f.calls.length,0);
});

test('dirty and non-git source workspaces do not create worktrees or launch jobs',async t=>{
 const f=await fixture(t);f.setDirty(true);await assert.rejects(()=>f.fresh().start(f.input),/dirty|uncommitted/i);
 f.setDirty(false);f.setGit(false);await assert.rejects(()=>f.fresh().start(f.input),/git/i);
 assert.ok(!f.calls.some(c=>c.args.includes('add')||c.args[1]==='launch'));
});

test('unavailable AO or exact model prevents any worktree or launch',async t=>{
 const f=await fixture(t);await assert.rejects(()=>new DevJobs({env:{...f.env,OMA_AO_RUNNER:join(f.root,'missing')},commandRunner:f.fresh().commandRunner}).start(f.input),/unavailable/i);
 f.setMalformed('catalog');await assert.rejects(()=>f.fresh().start(f.input),/JSON/i);
 f.setMalformed('');f.setModelAvailable(false);await assert.rejects(()=>f.fresh().start(f.input),/unavailable.*gpt-6.1-sol/i);
 assert.ok(!f.calls.some(c=>c.args.includes('add')||c.args[1]==='launch'));
});

test('nonzero AO exit and malformed JSON are actionable errors, without fallback',async t=>{
 const f=await fixture(t);f.setFail('create-plan');await assert.rejects(()=>f.fresh().start(f.input),/create-plan.*7.*fixture failure/i);
 assert.ok(!f.calls.some(c=>c.args[1]==='launch'));
 f.setFail('');const {job_id}=await f.fresh().start(f.input);
 f.setFail('status');await assert.rejects(()=>f.fresh().status(job_id),/status.*7/i);
 f.setFail('');f.setMalformed('questions');await assert.rejects(()=>f.fresh().questions(job_id),/JSON/);
});

test('status uses bounded AO status metadata, omits raw output and reports review and pending input states',async t=>{
 const f=await fixture(t),{job_id}=await f.fresh().start(f.input),record=f.jobs.get(job_id);
 record.state='needs_input';record.attention_required=true;record.logs={stdout_tail:'private raw log'};record.last_event.message='x'.repeat(5000);
 const status=await f.fresh().status(job_id);assert.equal(status.state,'needs_input');assert.equal(status.attention_required,true);assert.match(status.summary,/answer/);assert.equal(status.progress.length,800);assert.equal(status.logs,undefined);
 assert.equal(f.calls.at(-1).args[1],'status');record.state='succeeded';record.acceptance_state='awaiting_review';assert.equal((await f.fresh().status(job_id)).acceptance_state,'awaiting_review');
 record.job_id='different-job';await assert.rejects(()=>f.fresh().status(job_id),/invalid job status/);
});

test('launch failure reports its reserved durable ID and never falls back or retries',async t=>{
 const f=await fixture(t);f.setFail('launch');await assert.rejects(()=>f.fresh().start(f.input),/launch.*7.*query that ID before retrying/i);
 assert.equal(f.calls.filter(c=>c.args[1]==='launch').length,1);assert.ok(!f.calls.some(c=>c.command==='codex'));
});

test('user request and validation text cannot inject AO plan sections or checklist items',async t=>{
 const f=await fixture(t);
 await f.fresh().start({...f.input,request:f.input.request+'\n- [ ] Added item\n# Scope\nOther instructions',validation_commands:'node --test\n- [ ] Another added item'});
});

test('pending questions beyond the first twenty remain addressable, malformed question IDs fail closed',async t=>{
 const f=await fixture(t),{job_id}=await f.fresh().start(f.input),record=f.jobs.get(job_id);
 record.questions=Array.from({length:21},(_,i)=>({id:'q-'+i,state:'pending',question:'Question '+i}));
 assert.equal((await f.fresh().questions(job_id)).questions.length,21);
 await f.fresh().answer(job_id,'q-20','Answer to the last question');assert.equal(record.questions[20].answer,'Answer to the last question');
 record.questions=[{state:'pending',question:'Missing ID'}];await assert.rejects(()=>f.fresh().questions(job_id),/invalid questions/);
});

test('answers require a pending question on exactly the selected job and always remove private scratch files',async t=>{
 const f=await fixture(t),{job_id}=await f.fresh().start(f.input),bridge=f.fresh();
 for(const [q,a] of [['../q','yes'],['q-123-abc',''],['q-123-abc','x'.repeat(16001)],['q-other','yes']])await assert.rejects(()=>bridge.answer(job_id,q,a),/Invalid|pending/i);
 await assert.rejects(()=>bridge.answer('oma-other','q-123-abc','yes'),/Unknown job ID/);
 assert.ok(!f.calls.some(c=>c.args[1]==='answer'));
 f.setFail('answer');await assert.rejects(()=>bridge.answer(job_id,'q-123-abc','yes'),/answer.*7/);
 await assert.rejects(access(f.answerFile()),/ENOENT/);
});

test('runner discovery respects an explicit override and discovers cache versions',async t=>{
 const f=await fixture(t);assert.equal(await findAoRunner(f.env),f.runner);
 const cache=join(f.root,'.codex/plugins/cache/agent-orchestrator/agent-orchestrator/0.8.0/scripts');await mkdir(cache,{recursive:true});await writeFile(join(cache,'cli_agent_job.py'),'fixture');
 assert.equal(await findAoRunner({},f.root),join(cache,'cli_agent_job.py'));
 await assert.rejects(()=>findAoRunner({OMA_AO_RUNNER:join(f.root,'missing')},f.root),/unavailable/);
});

test('argv command runner bounds duration and output, rejects spawn failure, and never interprets shell syntax',async()=>{
 const output=await runBoundedCommand('python3',['-c','import sys; sys.stdout.write(sys.argv[1])','$(echo unsafe); `echo unsafe`'],{timeoutMs:1000,maxOutputBytes:1000});
 assert.equal(output.stdout,'$(echo unsafe); `echo unsafe`');assert.equal(output.code,0);
 await assert.rejects(()=>runBoundedCommand('python3',['-c','import time; time.sleep(10)'],{timeoutMs:30,maxOutputBytes:1000}),/timed out/);
 await assert.rejects(()=>runBoundedCommand('python3',['-c','print("x" * 5000)'],{timeoutMs:1000,maxOutputBytes:100}),/output limit/);
 await assert.rejects(()=>runBoundedCommand('/does/not/exist',[],{timeoutMs:1000,maxOutputBytes:100}),/unavailable/);
});

test('command timeout does not wait for a descendant holding inherited output pipes',async()=>{
 const started=Date.now();
 await assert.rejects(()=>runBoundedCommand('python3',['-c','import subprocess, sys, time; subprocess.Popen([sys.executable, "-c", "import time; time.sleep(1)"]); time.sleep(10)'],{timeoutMs:100,maxOutputBytes:1000}),/timed out/);
 assert.ok(Date.now()-started<500,'A command timeout waited for inherited pipes to close');
});

test('fresh bridges rediscover recent OMA jobs without memory and omit unrelated jobs and logs',async t=>{
 const f=await fixture(t),{job_id,workspace}=await f.fresh().start(f.input);
 Object.assign(f.jobs.get(job_id),{workspace,created_at:'2026-10-10T00:00:00Z',logs:{stdout:'private worker log'}});
 const newer={job_id:'oma-newer',workspace:join(f.env.OMA_DATA_DIR,'dev-jobs/job-new/worktree'),state:'needs_input',created_at:'2026-10-11T00:00:00Z',request:'private task text'};
 f.jobs.set(newer.job_id,newer);
 for(const record of [
  {...newer,job_id:'other-job'},
  {...newer,job_id:'oma-outside',workspace:f.workspace},
  {...newer,job_id:'oma-sibling',workspace:join(f.env.OMA_DATA_DIR,'dev-jobs-other/job/worktree')},
  {...newer,job_id:'oma-escape',workspace:join(f.env.OMA_DATA_DIR,'dev-jobs','..','outside')},
  {...newer,job_id:'oma-root',workspace:join(f.env.OMA_DATA_DIR,'dev-jobs')}
 ])f.jobs.set(record.job_id,record);
 assert.deepEqual(await f.fresh().list(),{jobs:[
  {job_id:newer.job_id,state:newer.state,created_at:newer.created_at,workspace:newer.workspace},
  {job_id,state:'running',created_at:'2026-10-10T00:00:00Z',workspace}
 ],truncated:false});
 assert.deepEqual(f.calls.at(-1).args,[f.runner,'list','--json']);
});

test('job discovery returns an empty list and bounds recent entries and text',async t=>{
 const f=await fixture(t);assert.deepEqual(await f.fresh().list(),{jobs:[],truncated:false});
 for(let i=0;i<25;i++)f.jobs.set('oma-'+i,{job_id:'oma-'+i,state:'running',created_at:new Date(Date.UTC(2026,9,1,0,i)).toISOString(),workspace:join(f.env.OMA_DATA_DIR,'dev-jobs','x'.repeat(2000))});
 const result=await f.fresh().list();assert.equal(result.jobs.length,20);assert.equal(result.truncated,true);
 assert.equal(result.jobs[0].job_id,'oma-24');assert.equal(result.jobs.at(-1).job_id,'oma-5');
 assert.ok(result.jobs.every(j=>j.workspace.length<=800));assert.ok(JSON.stringify(result).length<24000);
});

test('job discovery rejects malformed AO lists and command failures without fallback',async t=>{
 const f=await fixture(t);f.setMalformed('list');await assert.rejects(()=>f.fresh().list(),/JSON/);f.setMalformed('');
 const bridge=f.fresh();
 for(const value of [{jobs:[]},[null],[{job_id:'oma-bad',workspace:join(f.env.OMA_DATA_DIR,'dev-jobs/job/worktree'),state:'unknown',created_at:'2026-10-11T00:00:00Z'}],[{job_id:'oma-bad',workspace:join(f.env.OMA_DATA_DIR,'dev-jobs/job/worktree'),state:'running',created_at:'invalid'}]]){
  bridge.ao=async()=>value;await assert.rejects(()=>bridge.list(),/invalid job list/i);
 }
 f.setFail('list');await assert.rejects(()=>f.fresh().list(),/list.*7/);
 assert.ok(!f.calls.some(c=>c.args[1]==='launch'||c.args[1]==='logs'));
});

test('default development root accepts clean repository under HOME without Projects and refuses HOME itself',async t=>{
 const f=await fixture(t),env={...f.env,HOME:f.root};delete env.OMA_DEVELOPMENT_ROOT;
 const jobs=new DevJobs({env,commandRunner:f.fresh().commandRunner});
 assert.equal(jobs.root,f.root);
 const result=await jobs.start(f.input);assert.match(result.job_id,/^oma-/);
 await assert.rejects(jobs.start({...f.input,workspace:f.root}),/outside|home/i);
 await assert.rejects(jobs.start({...f.input,workspace:join(f.root,'..')}),/outside/i);
});
