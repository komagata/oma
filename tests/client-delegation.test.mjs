import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {LiveSession} from '../runtime/live-session.mjs';
import {DatabaseSync} from 'node:sqlite';import {TranscriptLog} from '../runtime/transcript.mjs';import {omaClientDelegationInstructions} from '../runtime/profile.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){const deadline=Date.now()+3000;while(!check()){assert.ok(Date.now()<deadline,'condition timed out');await wait(5);}}
async function fixture(t,run=async()=> 'Verified reply'){
 const wire=new EventEmitter();wire.socket=new EventEmitter();wire.sent=[];wire.send=e=>{wire.sent.push(e);if(e.type==='session.close')queueMicrotask(()=>wire.emit('event',{type:'session.closed'}))};wire.close=()=>{};
 const calls=[],patches=[],audio=[];const session=new LiveSession({connect:()=>wire,config:{delegation:{type:'client'}},audio:{enqueue(pcm){audio.push(pcm)},stop(){}},memory:{add(){},context(){return 'remembered untrusted reference'}},emit:p=>patches.push(p),execute(){throw Error('Responses tools must not run')},cancelTools(){},agent:{id:'codex',label:'Codex CLI',run:async args=>{calls.push(args);return run(args)}},delegationWaitMs:20});
 t.after(()=>session.close());const p=session.start();wire.socket.emit('open');wire.emit('event',{type:'session.started'});await p;
 return {session,wire,calls,patches,audio,input:delta=>wire.emit('event',{type:'session.input_transcript.delta',delta}),delegate:id=>wire.emit('event',{type:'session.delegation.created',delegation:{id,target:'client'}}),replies:()=>wire.sent.filter(e=>e.type==='session.commentary.append')};
}
test('typed verified reply is immediately recorded once without waiting for Live speech',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const log=new TranscriptLog(db);log.begin();
 const f=await fixture(t,async()=> '7');const saved=[];f.session.memory.add=(role,text)=>saved.push([role,text]);
 f.wire.emit('event',{type:'session.output_transcript.delta',delta:'Waiting.'});
 await f.session.text('3 plus 4');
 const updates=f.patches.filter(p=>p.assistantText?.includes('7'));assert.deepEqual(updates,[{assistantText:'Waiting.\n7'}]);
 for(const patch of f.patches)log.update(patch);
 assert.deepEqual(log.read().filter(row=>row.role==='assistant').map(row=>row.body),['Waiting.','7']);
 assert.equal(f.session.captions.assistant,'Waiting.\n7');assert.deepEqual(saved.filter(([role,text])=>role==='assistant'&&text==='7'),[['assistant','7']]);
 assert.deepEqual(f.replies(),[{type:'session.commentary.append',delegation_id:null,content:'7'}]);
});
test('typed CLI answer stays single in captions while Live speech audio still plays',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const log=new TranscriptLog(db);log.begin();
 const f=await fixture(t,async()=> '七です。');
 await f.session.text('答えは？');
 f.wire.emit('event',{type:'session.output_transcript.delta',delta:'はい、'});
 f.wire.emit('event',{type:'session.output_transcript.delta',delta:'七です。'});
 f.wire.emit('event',{type:'session.output_audio.delta',delta:Buffer.from([1,2,3,4]).toString('base64')});
 for(const patch of f.patches)log.update(patch);
 assert.deepEqual(f.patches.filter(p=>p.assistantText!==undefined).map(p=>p.assistantText),['七です。']);
 assert.equal(f.session.captions.assistant,'七です。');
 assert.deepEqual(log.read().filter(row=>row.role==='assistant').map(row=>row.body),['七です。']);
 assert.deepEqual(f.replies(),[{type:'session.commentary.append',delegation_id:null,content:'七です。'}]);
 assert.deepEqual(f.audio,[Buffer.from([1,2,3,4])]);
});
test('new typed and spoken user turns restore Live transcript capture after a typed answer',async t=>{
 let resolveSecond;let count=0;const f=await fixture(t,()=>++count===1?'first':new Promise(resolve=>resolveSecond=resolve));
 await f.session.text('first request');
 const next=f.session.text('second request');await until(()=>f.calls.length===2);
 f.wire.emit('event',{type:'session.output_transcript.delta',delta:'interim Live caption'});
 assert.ok(f.patches.some(p=>p.assistantText?.includes('interim Live caption')));
 resolveSecond('second');await next;
 f.input('spoken request');f.wire.emit('event',{type:'session.output_transcript.delta',delta:'spoken answer'});
 assert.ok(f.patches.some(p=>p.assistantText?.includes('spoken answer')));
});
test('client voice instructions explicitly speak completed commentary without redelegating',()=>{
 assert.match(omaClientDelegationInstructions,/commentary/i);assert.match(omaClientDelegationInstructions,/null delegation_id/);assert.match(omaClientDelegationInstructions,/speak.*result/i);assert.match(omaClientDelegationInstructions,/Do not delegate.*result/i);
});
test('voice reply produces captions only when Live transcribes speech',async t=>{
 const f=await fixture(t,async()=> '7');f.input('3 plus 4');f.delegate('voice-answer');await until(()=>f.session.tasks.size===0);
 assert.deepEqual(f.patches.filter(p=>p.assistantText!==undefined),[]);
 f.wire.emit('event',{type:'session.output_transcript.delta',delta:'7'});
 assert.deepEqual(f.patches.filter(p=>p.assistantText!==undefined),[{assistantText:'7'}]);assert.equal(f.replies()[0].delegation_id,'voice-answer');
});
test('typed close ignores late verified output and emits no successful caption',async t=>{
 let resolve;const f=await fixture(t,()=>new Promise(r=>resolve=r));const request=f.session.text('work');await until(()=>f.calls.length===1);await f.session.close();resolve('late reply');await request;
 assert.equal(f.calls[0].signal.aborted,true);assert.deepEqual(f.replies(),[]);assert.deepEqual(f.patches.filter(p=>p.assistantText!==undefined),[]);
});
test('empty and invalid CLI results emit errors without successful captions',async t=>{
 for(const result of ['', '   ', null]){const f=await fixture(t,async()=>result);await f.session.text('work');assert.ok(f.patches.some(p=>p.agentError));assert.deepEqual(f.patches.filter(p=>p.assistantText!==undefined),[]);}
});
test('voice delegation waits for delayed text, deduplicates IDs, and returns original ID',async t=>{const f=await fixture(t);f.delegate('voice-1');f.input('Read ');await wait(10);f.input('this file');f.delegate('voice-1');await until(()=>f.session.tasks.size===0);assert.equal(f.calls.length,1);assert.equal(f.calls[0].text,'Read this file');assert.match(f.calls[0].context,/untrusted/);assert.deepEqual(f.replies().map(e=>[e.delegation_id,e.content]),[['voice-1','Verified reply']]);f.delegate('voice-1');await wait(30);assert.equal(f.calls.length,1);});
test('no empty task and no reuse of consumed text for another delegation',async t=>{const f=await fixture(t);f.delegate('empty');await until(()=>f.session.tasks.size===0);assert.equal(f.calls.length,0);f.input('Only once');f.delegate('one');await until(()=>f.session.tasks.size===0);f.delegate('duplicate-task');await until(()=>f.session.tasks.size===0);assert.equal(f.calls.length,1);assert.ok(f.patches.some(p=>p.agentError));});
test('typed input routes once directly and uses null commentary ID',async t=>{const f=await fixture(t);await f.session.text('typed request');assert.equal(f.calls.length,1);assert.equal(f.calls[0].text,'typed request');assert.equal(f.replies()[0].delegation_id,null);assert.ok(!f.wire.sent.some(e=>['response.create','response.item.create'].includes(e.type)));f.delegate('spurious');await until(()=>f.session.tasks.size===0);assert.equal(f.calls.length,1);});
test('close aborts work and ignores late results',async t=>{let resolve;const f=await fixture(t,()=>new Promise(r=>resolve=r));f.input('work');f.delegate('cancel');await until(()=>f.calls.length===1);assert.equal(f.calls.length,1);await f.session.close();assert.equal(f.calls[0].signal.aborted,true);resolve('must not be spoken');await wait(5);assert.deepEqual(f.replies(),[]);});
test('failure is safe and truthful, busy input cannot start another process',async t=>{let reject;const f=await fixture(t,()=>new Promise((_,r)=>reject=r));const first=f.session.text('one');await wait(5);await f.session.text('two');assert.equal(f.calls.length,1);reject(Error('secret raw failure'));await first;assert.ok(f.replies().every(e=>!e.content.includes('secret')));assert.ok(f.patches.some(p=>p.agentError));});
test('long multilingual results are UTF-8 safe and conservatively below append token limit',async t=>{const content='日本語😀'.repeat(200);const f=await fixture(t,async()=>content);await f.session.text('long');assert.equal(f.replies().map(e=>e.content).join(''),content);assert.ok(f.replies().every(e=>Buffer.byteLength(e.content)<=400));});
test('notice cannot launch client work',async t=>{const f=await fixture(t);f.session.speakNotice('A notice');f.delegate('notice');f.input('new request');await wait(80);assert.equal(f.calls.length,0);});
test('typed input is retained as a user caption and memory for following requests',async t=>{const f=await fixture(t);const saved=[];f.session.memory.add=(role,text)=>saved.push([role,text]);await f.session.text('Keep this context');assert.ok(f.patches.some(p=>p.userText==='Keep this context'));assert.ok(saved.some(([role,text])=>role==='user'&&text==='Keep this context'));});
test('context uses recent captions rather than oldest session text',async t=>{const f=await fixture(t);f.session.captions.user='old'.repeat(4000)+'RECENT_USER';f.session.captions.assistant='old'.repeat(4000)+'RECENT_ASSISTANT';await f.session.text('follow-up');assert.ok(f.calls[0].context.includes('RECENT_USER'));assert.ok(f.calls[0].context.includes('RECENT_ASSISTANT'));assert.ok(Buffer.byteLength(f.calls[0].context)<=18000);});
test('a second delegation during transcript collection does not erase the first request',async t=>{const f=await fixture(t);f.input('original request');f.delegate('first');f.delegate('second');await until(()=>f.session.tasks.size===0);assert.equal(f.calls.length,1);assert.equal(f.calls[0].text,'original request');assert.ok(f.replies().some(e=>e.delegation_id==='first'&&e.content==='Verified reply'));});

test('Hermes typed and voice delegation only speak confirmed OMA save results',async t=>{
 const {withHermesMemory}=await import('../runtime/agent-backends.mjs');const {Memory}=await import('../runtime/memory.mjs');const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'oma-hermes-delegation-')),memory=new Memory(join(dir,'memory.db'));t.after(()=>{memory.close();rmSync(dir,{recursive:true,force:true})});const f=await fixture(t);const contexts=[];
 f.session.memory.context=(...args)=>memory.context(...args);
 f.session.client.agent=withHermesMemory({id:'hermes',label:'Hermes Agent',async run({text,toolConnection,rememberFact,context}){contexts.push(context);if(toolConnection)await toolConnection.call({key:'drink',value:rememberFact,request:text});return 'fixture agent result';}},{memory,async startBridge({execute}){const done=Promise.withResolvers();return {connection:{call:args=>execute('propose_remember',args)},closed:done.promise,async close(){done.resolve()}}}});
 await f.session.text('私の好きな飲み物はコーヒーです。覚えて');assert.equal(memory.facts()[0].value,'私の好きな飲み物はコーヒーです');assert.match(f.replies().at(-1).content,/OMA.*保存しました/);
 f.input('何が好きですか');f.delegate('read-memory');await until(()=>f.session.tasks.size===0);assert.match(contexts.at(-1),/コーヒー/);assert.equal(memory.facts().length,1);
 f.input('私の好きな飲み物は紅茶です。覚えて');f.delegate('save-memory');await until(()=>f.session.tasks.size===0);assert.equal(memory.facts()[0].value,'私の好きな飲み物は紅茶です');assert.match(f.replies().at(-1).content,/OMA.*保存しました/);
});
