import test from 'node:test';
import assert from 'node:assert/strict';
import {IdleConversation} from '../runtime/idle.mjs';
function fixture(){let time=0,busy=false;const speech=[];let closed=0;const idle=new IdleConversation({now:()=>time,ready:()=>!busy,speak:async bye=>{speech.push(bye);busy=true;return true},dismiss:()=>closed++});return {idle,speech,get closed(){return closed},advance:n=>time+=n,busy:v=>busy=v};}
test('opening is silent; prompt and farewell wait, and closure waits for playback',async()=>{
 const f=fixture();f.idle.show(true);await f.idle.tick();assert.deepEqual(f.speech,[]);
 f.advance(15000);await f.idle.tick();assert.deepEqual(f.speech,[false]);
 f.advance(60000);await f.idle.tick();assert.equal(f.closed,0);assert.equal(f.speech.length,1);
 f.busy(false);await f.idle.tick();f.advance(19999);await f.idle.tick();assert.equal(f.speech.length,1);
 f.advance(1);await f.idle.tick();assert.deepEqual(f.speech,[false,true]);await f.idle.tick();assert.equal(f.closed,0);
 f.busy(false);await f.idle.tick();assert.equal(f.closed,1);await f.idle.tick();assert.equal(f.closed,1);
});
test('settings and reopening reset the delay, tasks and recording never time out',async()=>{
 const f=fixture();f.idle.show(true);f.advance(14000);f.idle.show(false);f.advance(60000);await f.idle.tick();assert.equal(f.speech.length,0);
 f.idle.show(true);await f.idle.tick();assert.equal(f.speech.length,0);
 f.busy(true);f.advance(60000);await f.idle.tick();f.busy(false);await f.idle.tick();assert.equal(f.speech.length,0);
 f.advance(15000);await f.idle.tick();assert.equal(f.speech.length,1);
});
test('user interruption cancels a pending farewell and starts a fresh wait',async()=>{
 const f=fixture();f.idle.show(true);f.advance(15000);await f.idle.tick();f.busy(false);await f.idle.tick();f.advance(20000);await f.idle.tick();
 f.idle.activity();f.busy(false);await f.idle.tick();assert.equal(f.closed,0);
});
test('closing during a pending network connection cannot schedule dismissal',async()=>{
 let resolve;const f=fixture();f.idle.speak=()=>new Promise(r=>resolve=r);f.idle.show(true);f.advance(15000);const tick=f.idle.tick();f.idle.show(false);resolve(true);await tick;f.idle.show(true);await f.idle.tick();assert.equal(f.closed,0);assert.equal(f.idle.stage,'waiting');
});
