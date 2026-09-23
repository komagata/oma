import test from 'node:test';
import assert from 'node:assert/strict';
import {OpenMic,canListen} from '../runtime/open-mic.mjs';
import {Oma} from '../runtime/oma.mjs';

test('visible conversation listens during replies, thinking and tasks, but not hidden/settings or an existing recording',()=>{
 const s={presented:true,key:true,state:'speaking',recording:false};
 for(const state of ['idle','speaking','thinking','working','connecting'])assert.equal(canListen({...s,state}),true,state);
 assert.equal(canListen({...s,presented:false}),false);
 assert.equal(canListen({...s,recording:true}),false);
 assert.equal(canListen({...s,key:false}),false);
 assert.equal(canListen({...s,savingKey:true}),false);
 assert.equal(canListen({...s,demo:true}),false);
 assert.equal(canListen({...s,approvalPhase:'speaking'}),true);
 assert.equal(canListen({...s,approvalPhase:'listening'}),false);
});
test('speech during playback stops output, cancels the old response, preserves first syllables and rejects late audio',async()=>{
 const sent=[],played=[];let input,stops=0,callback;
 const audio={pumping:true,played:320,stop(){stops++;this.pumping=false},record(fn){input=fn},stopRecording:async()=>{},enqueue:b=>played.push(b)};
 const oma=new Oma({key:'test',memory:{add(){},context(){return ''}},emit(){},audio});
 oma.connected=true;oma.connect=async()=>{};oma.send=e=>sent.push(e);
 oma.turn.beginResponse('old');oma.active=true;oma.outputItem='old-item';
 const mic=new OpenMic({audio:{record(fn){callback=fn},stopRecording:async()=>{}},ready:()=>canListen({presented:true,key:true,state:oma.state,recording:oma.turn.recording}),available:async()=>true,onSpeech:b=>oma.press(b)});
 await mic.tick();
 const pcm=Buffer.alloc(7680);for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE(1200,i);
 callback(pcm);await new Promise(r=>setImmediate(r));
 assert.equal(stops,1);assert.equal(oma.turn.recording,true);assert.equal(typeof input,'function');
 assert.ok(sent.some(e=>e.type==='response.cancel'));
 assert.ok(sent.some(e=>e.type==='conversation.item.truncate'));
 assert.equal(sent.find(e=>e.type==='input_audio_buffer.append').audio,pcm.toString('base64'));
 oma.receive({type:'response.output_audio.delta',response_id:'old',delta:pcm.toString('base64')});assert.equal(played.length,0);
 clearTimeout(oma.recordTimeout);await mic.pause();
});
