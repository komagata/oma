import test from 'node:test';
import assert from 'node:assert/strict';
import {OpenMic} from '../runtime/open-mic.mjs';
const chunk=value=>{const b=Buffer.alloc(1920);for(let i=0;i<b.length;i+=2)b.writeInt16LE(value,i);return b};
test('standby keeps silence local, includes the start of speech, and resumes after a reply',async()=>{
 let callback,ready=true,listening=false;const turns=[];
 const mic=new OpenMic({audio:{record(fn){callback=fn},async stopRecording(){}},ready:()=>ready,available:async()=>true,onSpeech:b=>{turns.push(b);ready=false},onListening:v=>listening=v});
 await mic.tick();assert.equal(listening,true);
 callback(chunk(0));callback(chunk(1000));assert.equal(turns.length,0);
 callback(chunk(1000));callback(chunk(1000));await new Promise(r=>setImmediate(r));
 assert.equal(turns.length,1);assert.equal(turns[0].length,7680);assert.equal(listening,false);
 ready=true;await mic.tick();assert.equal(listening,true);await mic.pause();
});
test('hidden, busy or unavailable microphones never start; stale checks cannot reopen after close',async()=>{
 let ready=false,starts=0,resolve;
 const mic=new OpenMic({audio:{record(){starts++},async stopRecording(){}},ready:()=>ready,available:()=>new Promise(r=>resolve=r),now:()=>1000,onSpeech(){}});
 await mic.tick();assert.equal(starts,0);ready=true;mic.after=0;
 const check=mic.tick();await mic.pause();resolve(true);await check;assert.equal(starts,0);
 mic.available=async()=>false;await mic.tick();assert.equal(starts,0);
});
test('moderate speech is detected without requiring loud speech',async()=>{
 let callback,fired=0;
 const mic=new OpenMic({audio:{record(fn){callback=fn},async stopRecording(){}},ready:()=>true,available:async()=>true,onSpeech:()=>fired++});
 await mic.tick();for(let i=0;i<4;i++)callback(chunk(700));
 await new Promise(r=>setImmediate(r));assert.equal(fired,1);await mic.pause();
});
test('quiet onset is detected and recording is handed off without stopping',async()=>{
 let callback,stops=0,received;
 const mic=new OpenMic({handoff:true,audio:{record(fn){callback=fn},async stopRecording(){stops++}},ready:()=>true,available:async()=>true,onSpeech:b=>received=b});
 await mic.tick();
 callback(chunk(40));callback(chunk(180));callback(chunk(180));callback(chunk(180));
 await new Promise(r=>setImmediate(r));
 assert.ok(received);assert.equal(received.length,7680);assert.equal(stops,0);
});
