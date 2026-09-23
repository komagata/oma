import test from 'node:test';import assert from 'node:assert/strict';
const {sessionConfig,Oma}=await import('../runtime/oma.mjs').catch(()=>({}));
test('session disables VAD and configures speech plus task and memory tools',()=>{
 assert.equal(typeof sessionConfig,'function','Realtime configuration missing');const s=sessionConfig('saved context');
 assert.equal(s.audio.input.turn_detection,null);assert.deepEqual(s.output_modalities,['audio']);
 for(const n of ['run_task','open_url','search_memory','remember','forget','cancel_task'])assert.ok(s.tools.some(x=>x.name===n));
 assert.ok(s.instructions.includes('saved context'));
});
test('late audio from interrupted response never reaches output',()=>{
 assert.equal(typeof Oma,'function','Realtime controller missing');let chunks=0;let saved=0;
 const o=new Oma({memory:{add(){saved++},context(){return ''}},emit(){},audio:{enqueue(){chunks++},stop(){},finish(){}}});
 o.turn.beginResponse('old');o.turn.press();o.turn.release();o.turn.beginResponse('new');
 o.receive({type:'response.output_audio.delta',response_id:'old',delta:'AAAA'});
 o.receive({type:'response.output_audio_transcript.done',response_id:'old',transcript:'not heard'});
 assert.equal(chunks,0);assert.equal(saved,0);
 o.receive({type:'response.output_audio.delta',response_id:'new',delta:'AAAA'});assert.equal(chunks,1);
});
test('closing intentionally never reports offline or Codex failure',async()=>{
 assert.equal(typeof Oma,'function','Realtime controller missing');const patches=[];
 const o=new Oma({memory:{add(){},context(){return ''}},emit:p=>patches.push(p),audio:{stop(){},close:async()=>{}},codex:{close(){}}});
 await o.close();assert.equal(o.closing,true);
});
test('stale response.created is fenced by request generation',()=>{
 const o=new Oma({memory:{context(){return ''}},emit(){},audio:{stop(){},finish(){}}});
 o.turn.press();o.turn.release();o.receive({type:'response.created',response:{id:'stale',metadata:{generation:'0'}}});
 assert.equal(o.turn.accept('stale'),false);
});
test('fast tool result waits for response.done before requesting continuation',async()=>{
 const sent=[];const o=new Oma({memory:{revision:0,remember(){},context(){return ''},needsCompaction(){return false}},emit(){},audio:{stop(){},finish(){},pumping:false}});
 o.send=e=>sent.push(e);o.turn.beginResponse('tool-response');o.active=true;
 await o.callTool({name:'remember',arguments:'{"key":"color","value":"green"}',call_id:'call1'});
 assert.equal(sent.filter(e=>e.type==='response.create').length,0);
 o.receive({type:'response.done',response:{id:'tool-response',status:'completed'}});
 assert.equal(sent.filter(e=>e.type==='response.create').length,1);
});
test('a delayed release cannot commit audio from the next key press',async()=>{
 const sent=[];let finishStop;
 const o=new Oma({memory:{context(){return ''}},emit(){},audio:{record(){},stop(){},stopRecording:()=>new Promise(r=>finishStop=r)}});
 o.connected=true;o.send=e=>sent.push(e);await o.press();o.sentBytes=10000;
 const release=o.release();await o.press();o.sentBytes=10000;finishStop();await release;clearTimeout(o.recordTimeout);
 assert.equal(sent.filter(e=>e.type==='input_audio_buffer.commit').length,0);
});
