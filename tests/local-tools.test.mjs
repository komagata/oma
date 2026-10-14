import test from 'node:test';import assert from 'node:assert/strict';
import {LocalTools} from '../runtime/local-tools.mjs';
test('memory and PC tool layer is independent of Pi and rejects unknown tools',async()=>{
 const saved=[];const t=new LocalTools({memory:{remember:(...a)=>saved.push(a)},emit(){}});t.begin();
 assert.deepEqual(await t.call('remember',{key:'language',value:'Japanese'}),{saved:true});assert.deepEqual(saved,[['language','Japanese']]);
 await assert.rejects(()=>t.call('unknown',{}),/Unknown/);t.cancel();await assert.rejects(()=>t.call('remember',{key:'x',value:'y'}),/abort/i);
});
test('closing cancels an outstanding approval',async()=>{
 let approval;const t=new LocalTools({memory:{},emit:p=>{if(p.approval)approval=p.approval}});t.begin();const result=t.call('confirm_action',{description:'Publish this document'});assert.ok(approval.id);t.cancel();assert.deepEqual(await result,{approved:false});
});
test('ending a conversation schedules closure after the farewell',async()=>{
 let endings=0;
 const t=new LocalTools({memory:{},emit(){},onEnd:()=>endings++});t.begin();
 assert.deepEqual(await t.call('end_conversation',{}),{closingAfterReply:true});
 assert.equal(endings,1);t.cancel();
});
test('view modes change presentation without ending the conversation',async()=>{
 const patches=[];const t=new LocalTools({memory:{},emit:p=>patches.push(p)});t.begin();
 for(const mode of ['mini','normal'])assert.deepEqual(await t.call('set_view_mode',{mode}),{viewMode:mode});
 assert.deepEqual(patches,[{viewMode:'mini'},{viewMode:'normal'}]);
 await assert.rejects(()=>t.call('set_view_mode',{mode:'other'}),/Invalid/);
});

test('Live exposes the skill-owned new-document operation',async()=>{
 const {localToolDefinitions}=await import('../runtime/local-tools.mjs');
 const live=localToolDefinitions.find(t=>t.name==='new_text_document');
 assert.ok(live);assert.ok(live.parameters);
});

test('Live development tools are strict, require the bounded start contract and survive session cancellation',async()=>{
 const {localToolDefinitions}=await import('../runtime/local-tools.mjs');
 const names=['start_development_job','development_job_status','development_job_questions','answer_development_job_question'];
 for(const name of names){const d=localToolDefinitions.find(t=>t.name===name);assert.ok(d,name);assert.equal(d.strict,true);assert.equal(d.parameters.additionalProperties,false);assert.deepEqual(d.parameters.required,Object.keys(d.parameters.properties));}
 assert.deepEqual(localToolDefinitions.find(t=>t.name===names[0]).parameters.required,['workspace','request','allowed_paths','files_to_inspect','validation_commands']);
 let finish;const pending=new Promise(resolve=>finish=resolve),calls=[];
 const devJobs={start:async args=>{calls.push(args);return pending},status:async id=>({job_id:id,state:'running'}),questions:async id=>({job_id:id,questions:[]}),answer:async(...args)=>({args})};
 const tools=new LocalTools({memory:{},emit(){},devJobs});tools.begin();
 const input={workspace:'/fixture',request:'Change label',allowed_paths:['src/**'],files_to_inspect:'src/main',validation_commands:'node --test'};
 await assert.rejects(()=>tools.call(names[0],{workspace:'/fixture',request:'Change label'}),/Invalid/);
 const running=tools.call(names[0],input);tools.cancel();finish({job_id:'oma-fixture',state:'starting'});assert.equal((await running).job_id,'oma-fixture');assert.deepEqual(calls,[input]);
 tools.begin();assert.equal((await tools.call(names[1],{job_id:'oma-fixture'})).state,'running');assert.deepEqual(await tools.call(names[2],{job_id:'oma-fixture'}),{job_id:'oma-fixture',questions:[]});
 assert.deepEqual(await tools.call(names[3],{job_id:'oma-fixture',question_id:'q-one',answer:'yes'}),{args:['oma-fixture','q-one','yes']});
});

test('fresh LocalTools expose parameter-free strict durable job recovery',async()=>{
 const {localToolDefinitions}=await import('../runtime/local-tools.mjs');
 const definition=localToolDefinitions.find(t=>t.name==='list_development_jobs');
 assert.ok(definition);assert.equal(definition.strict,true);
 assert.deepEqual(definition.parameters,{type:'object',properties:{},required:[],additionalProperties:false});
 const {DevJobs}=await import('../runtime/dev-jobs.mjs');
 const result={jobs:[{job_id:'oma-prior',state:'needs_input',created_at:'2026-10-11T00:00:00Z',workspace:'/private/dev-jobs/job/worktree'}],truncated:false};
 // The runner must exist for discovery, but the injected argv runner never executes it.
 const runner=new URL('../runtime/dev-jobs.mjs',import.meta.url).pathname;
 let calls=0;const fresh=()=>new LocalTools({memory:{},emit(){},devJobs:new DevJobs({env:{OMA_AO_RUNNER:runner,OMA_DATA_DIR:'/private'},commandRunner:async(command,args)=>{
  calls++;assert.equal(command,'python3');assert.deepEqual(args,[runner,'list','--json']);
  return {code:0,stdout:JSON.stringify([...result.jobs,{...result.jobs[0],job_id:'unrelated-job'}]),stderr:''};
 }})});
 const tools=fresh();tools.begin();assert.deepEqual(await tools.call('list_development_jobs',{}),result);
 const reopened=fresh();reopened.begin();assert.deepEqual(await reopened.call('list_development_jobs',{}),result);assert.equal(calls,2);
});
