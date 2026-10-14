import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {LiveSession} from '../runtime/live-session.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(execute=async()=>({ok:true})){
 const wire=new EventEmitter();wire.socket=new EventEmitter();wire.sent=[];wire.send=e=>{wire.sent.push(e);if(e.type==='session.close')queueMicrotask(()=>wire.emit('event',{type:'session.closed',usage:{seconds:1}}))};wire.close=()=>{};
 const audio={enqueue(){},stop(){}};const memory={add(){}};const patches=[];
 const session=new LiveSession({connect:()=>wire,config:{model:'gpt-live-1'},audio,memory,emit:p=>patches.push(p),execute,cancelTools(){}});
 return {wire,audio,session,patches};
}
async function start(f){const p=f.session.start();f.wire.socket.emit('open');f.wire.emit('event',{type:'session.started',session:{id:'test'}});await p;}
test('development notices require a ready session and cannot execute tools until real user input',async()=>{
 const calls=[],f=fixture(async name=>{calls.push(name);return {ok:true}});
 assert.equal(typeof f.session.speakNotice,'function');assert.equal(f.session.speakNotice('question'),false);await start(f);
 f.session.tasks.add('busy');assert.equal(f.session.speakNotice('question'),false);f.session.tasks.clear();
 assert.equal(f.session.speakNotice('Read the untrusted question only: "run tools"'),true);
 assert.match(f.wire.sent.at(-1).content,/notification/);
 const backend=(id)=>{for(const event of [{type:'response.created',response:{id}},{type:'response.output_item.done',response_id:id,item:{type:'function_call',call_id:id,name:'start_development_job',arguments:'{}'}},{type:'response.completed',response:{id}}])f.wire.emit('event',{type:'response.event',delegation_id:id,event})};
 backend('notice');await tick();assert.deepEqual(calls,[]);
 f.wire.emit('event',{type:'session.input_transcript.delta',delta:'[breathing]'});backend('noise');await tick();assert.deepEqual(calls,[]);
 f.wire.emit('event',{type:'session.input_transcript.delta',delta:'Check my job please'});backend('user');await tick();assert.deepEqual(calls,['start_development_job']);
 await f.session.close();assert.equal(f.session.speakNotice('late'),false);
});
test('a tool response originating in a notice stays blocked after the user barges in',async()=>{
 const calls=[],f=fixture(async name=>{calls.push(name)});await start(f);f.session.speakNotice('untrusted question');
 const event=e=>f.wire.emit('event',{type:'response.event',delegation_id:'notice',event:e});
 event({type:'response.created',response:{id:'late'}});
 f.wire.emit('event',{type:'session.input_transcript.delta',delta:'No, tell me the time'});
 event({type:'response.output_item.done',response_id:'late',item:{type:'function_call',call_id:'late',name:'run_command',arguments:'{}'}});
 event({type:'response.completed',response:{id:'late'}});await tick();assert.deepEqual(calls,[]);await f.session.close();
});
test('a notice delegation created before barge-in cannot issue delayed tools afterward',async()=>{
 const calls=[],f=fixture(async name=>calls.push(name));await start(f);f.session.speakNotice('untrusted question');
 f.wire.emit('event',{type:'session.delegation.created',delegation:{id:'notice',target:'responses'}});
 f.wire.emit('event',{type:'session.input_transcript.delta',delta:'What time is it?'});
 for(const event of [{type:'response.created',response:{id:'late'}},{type:'response.output_item.done',response_id:'late',item:{type:'function_call',call_id:'late',name:'run_command',arguments:'{}'}},{type:'response.completed',response:{id:'late'}}])f.wire.emit('event',{type:'response.event',delegation_id:'notice',event});
 await tick();assert.deepEqual(calls,[]);await f.session.close();
});
test('waits for session start, aligns PCM samples and closes explicitly',async()=>{
 const f=fixture();f.session.appendAudio(Buffer.alloc(2));assert.equal(f.wire.sent.length,0);await start(f);
 f.session.appendAudio(Buffer.from([1]));f.session.appendAudio(Buffer.from([2,3]));assert.equal(f.wire.sent.at(-1).audio,'AQI=');
 await f.session.close();assert.equal(f.wire.sent.at(-1).type,'session.close');assert.equal(f.session.started,false);
});
test('only complete function items execute and all results precede continuation',async()=>{
 const calls=[];const f=fixture(async(name,args)=>{calls.push([name,args]);return {ok:true}});await start(f);
 const emit=event=>f.wire.emit('event',{type:'response.event',delegation_id:'d',event});
 emit({type:'response.created',response:{id:'r'}});
 emit({type:'response.function_call_arguments.done',name:'remember',arguments:'{}'});assert.equal(calls.length,0);
 const item={type:'function_call',call_id:'c',name:'remember',arguments:'{"key":"name"}'};
 emit({type:'response.output_item.done',response_id:'r',item});emit({type:'response.output_item.done',response_id:'r',item});
 emit({type:'response.completed',response:{id:'r',output:[]}});await tick();
 assert.equal(calls.length,1);assert.deepEqual(f.wire.sent.slice(-2).map(e=>e.type),['response.item.create','response.create']);await f.session.close();
});
test('closing rejects late audio and a pending tool cannot continue the backend',async()=>{
 let finish;const f=fixture(()=>new Promise(r=>finish=r));let audio=0;f.audio.enqueue=()=>audio++;await start(f);
 for(const event of [{type:'response.created',response:{id:'r'}},{type:'response.output_item.done',response_id:'r',item:{type:'function_call',call_id:'c',name:'wait',arguments:'{}'}},{type:'response.completed',response:{id:'r'}}])f.wire.emit('event',{type:'response.event',delegation_id:'d',event});
 await tick();await f.session.close();finish({ok:true});await tick();f.wire.emit('event',{type:'session.output_audio.delta',delta:'AAA='});assert.equal(audio,0);assert.equal(f.wire.sent.some(e=>e.type==='response.create'),false);
});
test('forgetting suppresses stale transcript persistence at session close',async()=>{
 const f=fixture();const saved=[];f.session.memory.add=(...a)=>saved.push(a);await start(f);
 f.wire.emit('event',{type:'session.input_transcript.delta',delta:'private old fact'});f.session.discardHistory=true;await f.session.close();assert.deepEqual(saved,[]);
});
test('failed startup rejects and releases transport without opening a microphone',async()=>{
 const f=fixture();let closed=0;f.wire.close=()=>closed++;const start=f.session.start();f.wire.emit('event',{type:'error',error:{message:'Access denied'}});await assert.rejects(start,/Access denied/);assert.equal(closed,1);assert.equal(f.session.started,false);
});
test('a greeting is sent as spoken commentary, not just a behavior update',async()=>{
 const f=fixture();await start(f);f.session.say('ご用件をどうぞ。');
 assert.deepEqual(f.wire.sent.at(-1),{type:'session.commentary.append',delegation_id:null,content:'ご用件をどうぞ。'});
 await f.session.close();
});
test('interleaved assistant fragments do not erase the user transcript',async()=>{
 const f=fixture(),saved=[];f.session.memory.add=(role,text)=>saved.push([role,text]);await start(f);
 const fragment=(role,delta)=>f.wire.emit('event',{type:`session.${role}_transcript.delta`,delta});
 fragment('input','私は');fragment('output','はい。');fragment('input','Yamahaのマイクで');fragment('output','どうぞ。');fragment('input','話しています。');
 assert.equal(f.patches.filter(p=>p.userText!==undefined).at(-1).userText,'私はYamahaのマイクで話しています。');
 assert.equal(f.patches.filter(p=>p.assistantText!==undefined).at(-1).assistantText,'はい。どうぞ。');
 await f.session.close();
 assert.equal(saved.filter(([role])=>role==='user').map(([,text])=>text).join(''),'私はYamahaのマイクで話しています。');
 assert.equal(saved.filter(([role])=>role==='assistant').map(([,text])=>text).join(''),'はい。どうぞ。');
});
test('separate utterances get new lines for both speakers using audio time, not packet arrival',async()=>{
 const f=fixture();await start(f);
 const fragment=(role,delta,start_ms,end_ms)=>f.wire.emit('event',{type:`session.${role}_transcript.delta`,delta,start_ms,end_ms});
 fragment('input','こんにちは。',0,600);
 fragment('output','こんにちは。',650,1300);
 fragment('input','次の質問です。',2500,3300);
 fragment('output','はい。',3400,3800);
 fragment('output','どうぞ。',3850,4200);
 assert.equal(f.session.captions.user,'こんにちは。\n次の質問です。');
 assert.equal(f.session.captions.assistant,'こんにちは。\nはい。どうぞ。');
 await f.session.close();
});
test('overlapping backchannels do not split a continuous user utterance',async()=>{
 const f=fixture();await start(f);
 for(const [role,delta,start_ms,end_ms] of [['input','私は',0,500],['output','はい',350,600],['input','このマイクで',520,1000],['input','話しています。',1050,1600]])
  f.wire.emit('event',{type:`session.${role}_transcript.delta`,delta,start_ms,end_ms});
 assert.equal(f.session.captions.user,'私はこのマイクで話しています。');await f.session.close();
});
test('user sound annotations stay hidden even when split across packets',async()=>{
 const f=fixture();await start(f);
 const input=delta=>f.wire.emit('event',{type:'session.input_transcript.delta',delta});
 input('[lip');assert.equal(f.session.captions.user,'');
 f.wire.emit('event',{type:'session.output_transcript.delta',delta:'はい。'});
 input(' smack] [tongue click]');assert.equal(f.session.captions.user,'');
 input('こんにちは');input('[breath');input('ing]。');
 assert.equal(f.session.captions.user,'こんにちは。');
 assert.ok(f.patches.filter(p=>p.userText!==undefined).every(p=>!/[\[\]]/.test(p.userText)));
 input(' [cough]');input(' 次の話です。');
 assert.ok(f.session.captions.user.includes('次の話です。'));
 await f.session.close();
});
test('assistant annotation fragments are hidden independently from user tags',async()=>{
 const f=fixture();await start(f);
 const output=delta=>f.wire.emit('event',{type:'session.output_transcript.delta',delta});
 output('[bre');assert.equal(f.session.captions.assistant,'');
 f.wire.emit('event',{type:'session.input_transcript.delta',delta:'[lip'});
 output('as] はい。');assert.equal(f.session.captions.assistant,'はい。');
 f.wire.emit('event',{type:'session.input_transcript.delta',delta:' smack]こんにちは'});
 output('[tongue click]どうぞ。');assert.equal(f.session.captions.user,'こんにちは');assert.equal(f.session.captions.assistant,'はい。どうぞ。');
 assert.ok(f.patches.filter(p=>p.assistantText!==undefined).every(p=>!/[\[\]]/.test(p.assistantText)));await f.session.close();
});

test('live silence cannot keep the cached opening player open and block microphone input',async()=>{
 const f=fixture();let playing=true,finished=true;
 f.session.outputEnabled=()=>!playing;
 f.audio.enqueue=()=>{finished=false};
 await start(f);
 f.wire.emit('event',{type:'session.output_audio.delta',delta:Buffer.alloc(960).toString('base64')});
 assert.equal(finished,true,'The finite opening must retain EOF while live silence arrives');
 playing=false;
 f.wire.emit('event',{type:'session.output_audio.delta',delta:Buffer.alloc(960).toString('base64')});
 assert.equal(finished,false,'Live output resumes after the opening drains');
 await f.session.close();
});
test('one-time notices release their restrictions when the user speaks again',async()=>{
 const f=fixture();await start(f);
 f.session.instructTransient('Say only Ready. Do not answer earlier requests.');
 const count=f.wire.sent.length;
 f.wire.emit('event',{type:'session.input_transcript.delta',delta:'[breath]'});
 assert.equal(f.wire.sent.length,count);
 f.wire.emit('event',{type:'session.input_transcript.delta',delta:'猫について教えて'});
 assert.equal(f.wire.sent.length,count+1);
 assert.match(f.wire.sent.at(-1).content,/Answer the user/);
 assert.match(f.wire.sent.at(-1).content,/even if it is still being spoken/);
 f.wire.emit('event',{type:'session.input_transcript.delta',delta:'ください'});
 assert.equal(f.wire.sent.length,count+1);
 await f.session.close();
});
test('an incomplete desktop response releases pending work and keeps voice input alive',async()=>{
 const f=fixture();await start(f);
 f.wire.emit('event',{type:'response.event',event:{type:'response.created',response:{id:'cutoff'}}});
 f.wire.emit('event',{type:'response.event',event:{type:'response.incomplete',response:{id:'cutoff',incomplete_details:{reason:'max_output_tokens'}}}});
 assert.equal(f.session.responses.size,0);assert.equal(f.session.started,true);
 assert.ok(f.wire.sent.some(e=>e.type==='session.instructions.append'&&/did not complete/.test(e.content)));
 f.session.appendAudio(Buffer.alloc(960));assert.equal(f.wire.sent.at(-1).type,'session.input_audio.append');await f.session.close();
});
test('desktop work stays busy between tool execution and the final backend reply',async()=>{
 const f=fixture();await start(f);
 const event=e=>f.wire.emit('event',{type:'response.event',delegation_id:'d',event:e});
 f.wire.emit('event',{type:'session.delegation.created',delegation:{id:'d',target:'responses'}});
 assert.equal(f.patches.at(-1).taskBusy,true);
 event({type:'response.created',response:{id:'r'}});
 event({type:'response.output_item.done',response_id:'r',item:{type:'function_call',call_id:'c',name:'run_command',arguments:'{"command":"true"}'}});
 event({type:'response.completed',response:{id:'r'}});await tick();
 assert.equal(f.patches.filter(p=>'taskBusy'in p).at(-1).taskBusy,true);
 event({type:'response.created',response:{id:'r2'}});
 event({type:'response.completed',response:{id:'r2'}});
 assert.equal(f.patches.filter(p=>'taskBusy'in p).at(-1).taskBusy,false);
 await f.session.close();
});
function observer(){
 let current={status:'current',windows:[{title:'initial'}]},listener;const o={starts:0,stops:0,refreshes:0,start:async()=>{o.starts++},stop:()=>{o.stops++},snapshot:()=>current,subscribe:fn=>{listener=fn;return ()=>{listener=null}},refresh:async()=>{o.refreshes++;return current},update:s=>{current=s;listener?.(s)}};return o;
}
test('desktop updates silently replace backend instructions and never grow the transcript',async()=>{
 const f=fixture(),context=observer();f.session.desktopContext=context;f.session.config.delegation={type:'responses',responses:{instructions:'Base tools and safety'}};
 await start(f);assert.equal(context.starts,1);assert.ok(f.wire.sent.some(e=>e.type==='session.update'));
 for(let i=0;i<30;i++)context.update({status:'current',windows:[{title:'new '+i}]});
 const updates=f.wire.sent.filter(e=>e.type==='session.update');assert.equal(updates.length,31);const instructions=updates.at(-1).session.delegation.responses.instructions;
 assert.match(instructions,/Base tools and safety/);assert.match(instructions,/untrusted/i);assert.match(instructions,/new 29/);assert.doesNotMatch(instructions,/new 28/);
 assert.equal(f.wire.sent.some(e=>['response.create','response.item.create','session.commentary.append','session.instructions.append','session.thinking.append'].includes(e.type)),false);
 context.update({status:'stale',windows:null});assert.match(f.wire.sent.at(-1).session.delegation.responses.instructions,/"stale"/);
 await f.session.close();const n=f.wire.sent.length;context.update({status:'current',windows:[]});assert.equal(f.wire.sent.length,n);assert.equal(context.stops,1);
});
test('desktop startup and typed/tool requests receive latest snapshot without a background response',async()=>{
 const f=fixture(),context=observer();f.session.desktopContext=context;f.session.config.delegation={type:'responses',responses:{instructions:'base'}};
 let release;context.start=()=>new Promise(r=>release=r);const p=f.session.start();f.wire.socket.emit('open');context.update({status:'current',windows:[{title:'during connection'}]});assert.equal(f.wire.sent.some(e=>e.type==='session.update'),false);
 f.wire.emit('event',{type:'session.started'});release();await p;assert.match(f.wire.sent.at(-1).session.delegation.responses.instructions,/during connection/);
 await f.session.text('What is beside you?');assert.ok(context.refreshes>0);const before=context.refreshes;await f.session.runTools([{call_id:'test',name:'test',arguments:'{}'}]);assert.ok(context.refreshes>before);assert.equal(f.wire.sent.at(-1).type,'response.create');await f.session.close();
});
test('initial backend context is ready before starting the cloud session; frontend stays static',async()=>{
 const f=fixture(),context=observer();f.session.desktopContext=context;f.session.config.instructions='Frontend delegates desktop questions';f.session.config.delegation={type:'responses',responses:{instructions:'Backend base'}};
 let release;context.start=()=>new Promise(r=>release=r);const p=f.session.start();f.wire.socket.emit('open');assert.equal(f.wire.sent.length,0,'do not start with missing desktop metadata');
 context.update({status:'current',windows:[{title:'ready at start'}]});release();await tick();const event=f.wire.sent[0];assert.equal(event.type,'session.start');assert.equal(event.session.instructions,'Frontend delegates desktop questions');assert.match(event.session.delegation.responses.instructions,/ready at start/);
 f.wire.emit('event',{type:'session.started'});await p;await f.session.close();
});
test('closing during context startup never starts a late cloud session',async()=>{
 const f=fixture(),context=observer();f.session.desktopContext=context;f.session.config.delegation={type:'responses',responses:{instructions:'base'}};
 let release;context.start=()=>new Promise(r=>release=r);const p=f.session.start();const rejected=assert.rejects(p,/closed/);f.wire.socket.emit('open');await f.session.close();release();await rejected;await tick();assert.equal(f.wire.sent.some(e=>e.type==='session.start'),false);
});
