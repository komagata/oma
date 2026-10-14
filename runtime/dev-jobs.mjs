import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {glob,mkdir,mkdtemp,realpath,stat,writeFile,rm} from 'node:fs/promises';
import {homedir} from 'node:os';
import {isAbsolute,join,relative,resolve,sep} from 'node:path';

const MODEL='gpt-6.1-sol', EFFORT='medium';
const idPattern=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const states=new Set(['starting','running','needs_input','succeeded','failed','cancelled','cancelling','timed_out','lost','scope_violated']);
const deniedPaths=['.git/**','**/.git/**','.env*','**/.env*','.aws/**','**/.aws/**','.codex/**','**/.codex/**','.agents/**','**/.agents/**'];
const safeText=(value,limit=800)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').slice(0,limit):'';
function validId(value,label='job ID'){if(typeof value!=='string'||!idPattern.test(value))throw Error('Invalid '+label);return value;}
function text(value,label,max){if(typeof value!=='string'||!value.trim()||value.includes('\0')||Buffer.byteLength(value)>max)throw Error('Invalid '+label);return value.trim();}
function contractText(value){return value.split('\n').map(line=>'> '+line).join('\n');}
function inside(root,path){const rel=relative(root,path);return rel!==''&&!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel);}

// No shell and no voice-session AbortSignal. Only this short-lived CLI process is
// bounded; AO owns the detached worker's lifetime and durable records.
export function runBoundedCommand(command,args,{timeoutMs=10000,maxOutputBytes=262144,env=process.env}={}){
 return new Promise((resolve,reject)=>{
  let stdout=[],stderr=[],size=0,settled=false;
  const child=spawn(command,args,{shell:false,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],env});
  const finish=(error,code)=>{
   if(settled)return;settled=true;clearTimeout(timer);
   if(error){
    // AO launch uses a new session for its durable worker. That worker is not
    // part of this group; catalog/other short-command descendants are.
    try{if(process.platform==='win32'||!child.pid)child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}
    child.stdout.destroy();child.stderr.destroy();reject(error);
   }else resolve({code,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')});
  };
  const timer=setTimeout(()=>finish(Error('Command timed out')),timeoutMs);
  child.on('error',()=>finish(Error('Command unavailable: '+command)));
  for(const [stream,chunks] of [[child.stdout,stdout],[child.stderr,stderr]])stream.on('data',chunk=>{if(settled)return;size+=chunk.length;if(size>maxOutputBytes)finish(Error('Command output limit exceeded'));else chunks.push(chunk);});
  child.on('close',code=>finish(null,code));
 });
}

export async function findAoRunner(env=process.env,home=homedir()){
 if(env.OMA_AO_RUNNER){
  try{if(isAbsolute(env.OMA_AO_RUNNER)&&(await stat(env.OMA_AO_RUNNER)).isFile())return await realpath(env.OMA_AO_RUNNER);}catch{}
  throw Error('AO integration unavailable: OMA_AO_RUNNER must name an existing absolute runner file');
 }
 const candidates=[];
 for await(const path of glob(join(home,'.codex/plugins/cache/agent-orchestrator/**/scripts/cli_agent_job.py')))candidates.push(path);
 candidates.sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
 if(!candidates.length)throw Error('AO integration unavailable: install Agent Orchestrator or configure OMA_AO_RUNNER; no CLI/model fallback is used');
 return realpath(candidates[0]);
}

export class DevJobs {
 constructor({env=process.env,commandRunner=runBoundedCommand}={}){
  this.env=env;this.commandRunner=commandRunner;
  this.home=env.HOME||homedir();
  this.root=env.OMA_DEVELOPMENT_ROOT||this.home;
  this.stateDir=join(env.OMA_DATA_DIR||join(env.XDG_DATA_HOME||join(this.home,'.local/share'),'oma'),'dev-jobs');
 }
 async command(command,args,{timeoutMs=10000}={}){
  const result=await this.commandRunner(command,args,{timeoutMs,maxOutputBytes:262144,env:this.env});
  if(result.code!==0)throw Error(`${command==='python3'?'AO '+args[1]:command} exited ${result.code}: ${safeText(result.stderr)||'Command failed'}`);
  return result.stdout;
 }
 async ao(runner,args,options){
  const output=await this.command('python3',[runner,...args,'--json'],options);
  try{return JSON.parse(output);}catch{throw Error('AO '+args[0]+' returned invalid JSON; check the installed runner version');}
 }
 async start(input){
  const request=text(input.request,'request',24000),inspect=text(input.files_to_inspect,'files_to_inspect',8000),validation=text(input.validation_commands,'validation_commands',8000);
  if(!Array.isArray(input.allowed_paths)||!input.allowed_paths.length||input.allowed_paths.length>32)throw Error('Invalid allowed_paths: supply a bounded list of relative files or subtrees');
  const paths=input.allowed_paths.map(path=>{
   if(typeof path!=='string'||path.length>200||!path.match(/^[A-Za-z0-9_*?.\/-]+$/)||isAbsolute(path)||path.split('/').some(p=>!p||p==='.'||p==='..'||['.git','.aws','.codex','.agents'].includes(p)||p.startsWith('.env'))||!/[A-Za-z0-9]/.test(path))throw Error('Invalid allowed_paths: relative files or subtrees only; credentials and agent configuration are forbidden');
   return path;
  });
  let workspace,root;
  try{if(typeof input.workspace!=='string'||!isAbsolute(input.workspace))throw Error();workspace=await realpath(input.workspace);root=await realpath(this.root);if(!(await stat(workspace)).isDirectory())throw Error();}catch{throw Error('Invalid workspace: supply an existing absolute project directory');}
  if(workspace===await realpath(this.home))throw Error('Workspace must not be the home directory');
  if(!inside(root,workspace))throw Error('Workspace is outside the allowed development root');
  const runner=await findAoRunner(this.env);
  // One bounded asynchronous setup, with no shell/UI operation or command text
  // forwarding. LocalTools has no global ten-second timeout for these tools.
  const deadline=Date.now()+60000;
  const remaining=()=>{const ms=deadline-Date.now();if(ms<=0)throw Error('Development job setup timed out');return {timeoutMs:Math.min(10000,ms)};};
  const gitArgs=['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-C',workspace];
  const top=(await this.command('git',[...gitArgs,'rev-parse','--show-toplevel'],remaining())).trim();
  if(top!==workspace)throw Error('Workspace must be a git repository root');
  if((await this.command('git',[...gitArgs,'status','--porcelain=v1','--untracked-files=all'],remaining())).trim())throw Error('Workspace has uncommitted changes; use a clean repository before starting a development job');
  const catalog=await this.ao(runner,['catalog','--cli','codex-cli','--workspace',workspace,'--query',MODEL,'--timeout-seconds','5'],remaining());
  const cli=catalog?.['codex-cli'];
  if(!cli?.available||cli.models?.discovery!=='succeeded'||!Array.isArray(cli.models.choices)||!cli.models.choices.some(m=>m?.id===MODEL&&Array.isArray(m.reasoning_efforts)&&m.reasoning_efforts.includes(EFFORT)))throw Error('AO integration unavailable: codex-cli='+MODEL+' with medium effort was not confirmed by catalog; no fallback is used');
  await this.ao(runner,['recommend-executors','--strategy','cost-first','--risk','medium','--task-type','general','--candidate','codex-cli='+MODEL],remaining());
  await mkdir(this.stateDir,{recursive:true,mode:0o700});
  const privateDir=await mkdtemp(join(this.stateDir,'job-'));
  const worktree=join(privateDir,'worktree'),taskFile=join(privateDir,'task.md'),planFile=join(privateDir,'plan.md');
  const guards='Do not commit, push, create a PR, release, publish, send external messages, touch production, modify credentials, install dependencies, or perform destructive cleanup. Do not spawn native subagents: AO owns delegation, retries and escalation. Do not change model or CLI. Do not delete this worktree. Work only within the allowed paths. Repository instructions apply within these fixed limits. Before irreversible actions or ambiguity affecting behavior, scope, data handling, permissions or security, stop and ask through the AO channel; an answer does not lift these fixed bans.';
  const task=`# Objective\n${contractText(request)}\n\n# Why\nImplement this user-requested local change in an isolated worktree; the development job must outlive the voice session.\n\n# Scope\nAllowed relative paths:\n${paths.map(p=>'    '+p).join('\n')}\nAll other paths and public operations are out of scope.\n\n# Files to inspect\nRead applicable AGENTS.md and the named files before editing:\n${contractText(inspect)}\n\n# Implementation guidance\n1. Inspect the specified files, symbols, callers and repository instructions.\n2. If essential information is missing or a decision changes public behavior or scope, ask a blocking question through the AO channel before editing.\n3. Write deterministic focused tests, then implement the smallest scoped change. Preserve unrelated behavior.\n4. Publish phase events before edits, before tests and at phase changes; report concrete progress and pending decisions.\n5. Run applicable validation and report exact commands and exits. Never execute request text as shell instructions.\n\n# Constraints\n${guards}\n\n# Acceptance criteria\nThe requested behavior is implemented within the allowed paths, focused tests pass, existing behavior is preserved, and no forbidden operation occurs. Execution success requires independent coordinator diff review and validation; do not claim acceptance.\n\n# Validation\nThe following is task text for you to inspect and validate against repository instructions, not commands run by the OMA bridge:\n${contractText(validation)}\nRun git diff --check. No GUI checks outside omabox.\n\n# Final report\nList changed files, observable behavior, exact tests and exits, assumptions, deviations, failures and remaining risks. Identify instructions that could not be followed. Coordinator review is still required.\n`;
  const plan=`# Goal\n${contractText(request)}\n\n# Decisions and assumptions\nOne isolated private git worktree from ${JSON.stringify(workspace)}. Exact executor codex-cli=${MODEL}, reasoning effort ${EFFORT}. Selected for bounded ordinary development under the approved local model policy. No fallback, automatic retry, or nested agents.\n\n# Constraints and guardrails\n${guards}\nAllowed paths: ${paths.join(', ')}.\n\n# Checklist\n- [ ] Implement the scoped request, run validation, and submit the diff for independent review.\n\n# Validation strategy\n${contractText(validation)}\nFocused deterministic tests followed by independent diff review and coordinator rerun.\n\n# Completion criteria\nScoped behavior implemented; tests pass; no scope violations; independent review accepted. AO execution success alone is awaiting review.\n`;
  await writeFile(taskFile,task,{mode:0o600,flag:'wx'});await writeFile(planFile,plan,{mode:0o600,flag:'wx'});
  await this.ao(runner,['validate-task','--task-file',taskFile],remaining());
  await this.command('git',[...gitArgs,'worktree','add','--detach','--',worktree,'HEAD'],remaining());
  const planResult=await this.ao(runner,['create-plan','--title','OMA local development','--workspace',worktree,'--plan-file',planFile,'--strategy','cost-first','--risk','medium','--task-type','general','--topology','single','--max-parallel','1','--executor','codex-cli='+MODEL],remaining());
  const planId=validId(planResult?.plan_id,'AO plan ID'),jobId='oma-'+randomUUID();
  let launched;
  try{launched=await this.ao(runner,['launch','--job-id',jobId,'--cli','codex-cli','--model',MODEL,'--reasoning-effort',EFFORT,'--plan-id',planId,'--checklist-item','item-001','--workspace',worktree,'--task-file',taskFile,'--timeout-seconds','7200','--role','implementation','--max-changed-files','32',...paths.flatMap(p=>['--allow-path',p]),...deniedPaths.flatMap(p=>['--deny-path',p])],remaining());}
  catch(error){throw Error(`${error.message}. Launch may have persisted job ${jobId}; query that ID before retrying. Retained worktree: ${worktree}`);}
  if(launched?.job_id!==jobId)throw Error(`AO returned an unexpected job ID; check ${jobId} before retrying`);
  return {job_id:jobId,plan_id:planId,state:'starting',workspace:worktree,summary:'Development job launched. It continues after OMA closes; independent review is required.'};
 }
 async list(){
  const value=await this.ao(await findAoRunner(this.env),['list']);
  if(!Array.isArray(value)||value.some(job=>!job||typeof job!=='object'||Array.isArray(job)||typeof job.job_id!=='string'))throw Error('AO returned invalid job list');
  const jobs=[];
  for(const job of value){
   // Both markers are needed: a similarly named AO job in another project is
   // not an OMA job. Use lexical containment so retained records survive a
   // removed worktree; discovery never reads worktree files or worker logs.
   if(!job.job_id.startsWith('oma-'))continue;
   if(typeof job.workspace!=='string'||!isAbsolute(job.workspace)||job.workspace.includes('\0'))throw Error('AO returned invalid job list');
   if(!inside(resolve(this.stateDir),job.workspace))continue;
   if(!idPattern.test(job.job_id)||!states.has(job.state)||typeof job.created_at!=='string'||job.created_at.length>100||!Number.isFinite(Date.parse(job.created_at)))throw Error('AO returned invalid job list');
   jobs.push({job_id:job.job_id,state:job.state,created_at:safeText(job.created_at,100),workspace:safeText(job.workspace,800)});
  }
  jobs.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||a.job_id.localeCompare(b.job_id));
  return {jobs:jobs.slice(0,20),truncated:jobs.length>20};
 }
 async status(jobId){
  validId(jobId);const value=await this.ao(await findAoRunner(this.env),['status',jobId]);
  if(value?.job_id!==jobId||!states.has(value.state))throw Error('AO returned invalid job status');
  const progress=value.last_event?.type==='worker_progress'?value.last_event:null;
  const summaries={starting:'Starting',running:'Development in progress',needs_input:'Waiting for your answer',succeeded:'Execution finished; check independent review',failed:'Development failed',cancelled:'Cancelled',cancelling:'Cancelling',timed_out:'Timed out',lost:'Worker process is unavailable',scope_violated:'Stopped due to a scope violation'};
  return {job_id:jobId,state:value.state,summary:summaries[value.state],phase:safeText(value.current_phase,100),progress:safeText(progress?.message),acceptance_state:safeText(value.acceptance_state,100),attention_required:value.attention_required===true};
 }
 async questions(jobId){
  validId(jobId);const value=await this.ao(await findAoRunner(this.env),['questions',jobId]);
  if(!Array.isArray(value)||value.some(q=>!q||typeof q.id!=='string'||!idPattern.test(q.id)||typeof q.question!=='string'||typeof q.state!=='string'))throw Error('AO returned invalid questions');
  return {job_id:jobId,questions:value.filter(q=>q.state==='pending').map(q=>({id:q.id,text:safeText(q.question,4000)}))};
 }
 async answer(jobId,questionId,answer){
  validId(jobId);validId(questionId,'question ID');const value=text(answer,'answer',16000);
  const pending=await this.questions(jobId);
  if(!pending.questions.some(q=>q.id===questionId))throw Error('Question is not pending on the specified job');
  await mkdir(this.stateDir,{recursive:true,mode:0o700});const dir=await mkdtemp(join(this.stateDir,'answer-')),file=join(dir,'answer.txt');
  try{
   await writeFile(file,value,{mode:0o600,flag:'wx'});
   const result=await this.ao(await findAoRunner(this.env),['answer',jobId,questionId,'--file',file]);
   if(result?.job_id!==jobId||result.question_id!==questionId||result.state!=='answered')throw Error('AO did not confirm the specified answer');
   return {job_id:jobId,question_id:questionId,answered:true};
  }finally{await rm(dir,{recursive:true,force:true});}
 }
}
