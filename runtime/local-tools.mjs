import {newOmaTextDocument} from '../skills/oma/scripts/new-document.mjs';
import {WindowCompanion} from './window-companion.mjs';
import {DevJobs} from './dev-jobs.mjs';
import {Desktop,desktopTools,runDesktopCommand} from './desktop.mjs';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const schema=(name,description,properties)=>({type:'function',name,description,strict:true,parameters:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}});
const string={type:'string'};
export const localToolDefinitions=[
 schema('new_text_document','Open an UNSAVED editor buffer in OmaText (オマテキスト, オーマーテクスト). This does not save a disk file. For a requested filesystem path, use a file-writing tool instead. Use this tool when the user requests a new OmaText editor buffer, not bash or run_command. Empty text means blank. Otherwise pass only the final document contents, applying requested spacing and punctuation; never include editing instructions. Preserves existing unsaved work.',{text:string}),
 ...desktopTools.filter(t=>t.name!=='restart_assistant').map(t=>schema(t.name,t.description,t.inputSchema.properties)),
 schema('remember','Save an explicit durable user preference. Do not store guesses.',{key:string,value:string}),
 schema('search_memory','Search saved preferences, past conversation and exact URLs.',{query:string}),
 schema('forget','Forget stored information matching one literal substring. Find the exact stored key or value first; do not send a list of terms. Zero removed records means no match. Ends this voice session to clear its context.',{query:string}),
 schema('open_url','Open an exact public HTTP(S) URL.',{url:string}),
 schema('read_file','Read a UTF-8 file, including installed skill references. Limit output to 24 KB.',{path:string}),
 schema('write_file','Write UTF-8 text to an explicitly requested file. Confirm destructive overwrites first.',{path:string,content:string}),
 schema('run_command','Run an executable with literal arguments, no implicit shell. Use supported Omarchy commands. Confirm consequential actions first.',{command:string,args:{type:'array',items:string}}),
 schema('start_development_job','Start a durable local AO development job that continues after this voice session closes. Required: existing clean git repository root workspace under the development root, specific request, bounded relative allowed_paths (files or subtree globs), files_to_inspect with relevant symbols/context, and validation_commands. The last two are task text, not commands run by this bridge. Clarify missing scope before starting. Uses isolated retained worktree, codex-cli=gpt-6.1-sol, medium effort; no commit/push/PR/public/production/credential operations. Returns job_id; do not start again to check progress.',{workspace:string,request:string,allowed_paths:{type:'array',items:string},files_to_inspect:string,validation_commands:string}),
 schema('list_development_jobs','Rediscover the latest 20 OMA-created durable AO jobs with job_id, state, creation time and workspace, without worker logs. Call when checking progress or questions without a known ID, including after OMA reopens. If several jobs are plausible, ask the user which before using an exact ID.',{}),
 schema('development_job_status','Read AO state and recent progress for exactly the supplied durable job_id, including after OMA reopens. Execution success still requires independent review.',{job_id:string}),
 schema('development_job_questions','List pending AO question IDs and text for exactly the supplied durable job_id. Relay questions to the user before answering.',{job_id:string}),
 schema('answer_development_job_question','Send the user\'s explicit answer to one pending question on exactly this job_id and question_id. Never invent an answer. Fixed bans on public, production, credential and destructive operations remain in force.',{job_id:string,question_id:string,answer:string}),
 schema('confirm_action','Ask yes/no approval for one consequential operation. Await approved:true; do not bypass denial. For save/discard/cancel choices, ask in a normal reply and wait for the next message instead.',{description:string}),
 schema('accompany_window','Place O.M.A. in a right-hand tile next to the application window just opened. Obtain its exact Hyprland address first.',{address:string}),
 schema('close_application_window','Close an explicitly identified application window by its exact Hyprland address. Never infer the target from adjacency or focus. Never close O.M.A.',{address:string}),
 schema('restore_floating','Undo side-by-side tiling and restore the saved floating position and size. Does not switch mini/normal presentation; use set_view_mode for that.',{}),
 schema('set_view_mode','Switch O.M.A. between face-only mini mode and normal mode without ending the conversation.',{mode:{type:'string',enum:['mini','normal']}}),
 schema('end_conversation','End this conversation only for goodbye or an explicit request to close O.M.A. Never use this to close OmaText or another application; use close_application_window. Never shuts down the desktop.',{}),
 schema('restart_assistant','Restart only O.M.A. after the reply. Never restart the desktop bar.',{})
];
export class LocalTools {
 constructor({memory,emit,cwd=process.cwd(),devJobs=new DevJobs(),onEnd=()=>{},onRestart=()=>{},onForget=()=>{}}){Object.assign(this,{memory,emit,cwd,devJobs,onEnd,onRestart,onForget});this.desktop=new Desktop({emit});this.companion=new WindowCompanion({emit});this.approvals=new Map();}
 begin(){this.controller=new AbortController();this.desktop.begin();}
 cancel(){this.controller?.abort();this.desktop.cancel();for(const finish of [...this.approvals.values()])finish(false);}
 approve(id,allow){this.approvals.get(id)?.(allow===true);}
 async call(name,args){
  this.controller.signal.throwIfAborted();
  const definition=localToolDefinitions.find(t=>t.name===name);if(!definition)throw Error('Unknown tool');
  if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Invalid arguments');
  for(const [key,spec] of Object.entries(definition.parameters.properties)){if(spec.type==='array'?!Array.isArray(args[key])||args[key].some(v=>typeof v!=='string'):typeof args[key]!==spec.type)throw Error('Invalid '+key);}
  if(desktopTools.some(t=>t.name===name)&&name!=='restart_assistant'){
   try{const items=await this.desktop.call(name,args);return {observations:items.filter(i=>i.type==='inputText').map(i=>i.text),images:items.filter(i=>i.type==='inputImage').map(i=>i.imageUrl)};}finally{this.emit({computerUsing:false});}
  }
  const signal=this.controller.signal;
  if(name==='start_development_job')return this.devJobs.start(args);
  if(name==='list_development_jobs')return this.devJobs.list();
  if(name==='development_job_status')return this.devJobs.status(args.job_id);
  if(name==='development_job_questions')return this.devJobs.questions(args.job_id);
  if(name==='answer_development_job_question')return this.devJobs.answer(args.job_id,args.question_id,args.answer);
  if(name==='new_text_document'){try{return await newOmaTextDocument({desktop:this.desktop,companion:this.companion,text:args.text})}finally{this.emit({computerUsing:false})}}
  if(name==='remember'){return {saved:true,...this.memory.remember(args.key,args.value)};}
  if(name==='search_memory')return {lastUrl:this.memory.lastUrl(),matches:this.memory.search(args.query)};
  if(name==='forget'){const removed=this.memory.forget(args.query);this.onForget();return {forgotten:removed>0,removed};}
  if(name==='open_url'){const url=new URL(args.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Only public HTTP(S) URLs supported');await runDesktopCommand('xdg-open',[url.href],{signal});this.memory.action('open_url',{url:url.href},'completed');return {opened:url.href};}
  if(name==='read_file'){const file=await readFile(resolve(this.cwd,args.path),{signal});if(file.length>24000)throw Error('File exceeds 24 KB; use a bounded command to inspect a section');return {text:file.toString('utf8')};}
  if(name==='write_file'){if(Buffer.byteLength(args.content)>100000)throw Error('File exceeds 100 KB');await writeFile(resolve(this.cwd,args.path),args.content,{signal});return {written:true};}
  if(name==='run_command'){const output=await runDesktopCommand(args.command,args.args,{signal,cwd:this.cwd});return {stdout:output.toString('utf8').slice(0,24000)};}
  if(name==='accompany_window')return this.companion.accompany(args.address);
  if(name==='close_application_window')return this.companion.closeTarget(args.address);
  if(name==='restore_floating')return this.companion.restore();
  if(name==='set_view_mode'){if(!['mini','normal'].includes(args.mode))throw Error('Invalid mode');this.emit({viewMode:args.mode});return {viewMode:args.mode};}
  if(name==='end_conversation'){this.onEnd();return {closingAfterReply:true};}
  if(name==='restart_assistant'){this.onRestart();return {restartingAfterReply:true};}
  if(name==='confirm_action'){
   if(!args.description.trim()||args.description.length>5000)throw Error('Invalid confirmation');
   return new Promise(resolve=>{const id=randomUUID();const finish=approved=>{signal.removeEventListener('abort',abort);this.approvals.delete(id);this.emit({approval:null});resolve({approved})};const abort=()=>finish(false);this.approvals.set(id,finish);signal.addEventListener('abort',abort,{once:true});this.emit({approval:{id,description:args.description,method:'oma/confirmAction'},state:'approval'});});
  }
 }
}
