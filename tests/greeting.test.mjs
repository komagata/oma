import test from 'node:test';
import assert from 'node:assert/strict';
import {Oma} from '../runtime/oma.mjs';
function fixture(){
 const events=[],patches=[];
 const oma=new Oma({memory:{context(){return ''},add(){throw Error('Greeting must not invent a user utterance')}},audio:{},emit:p=>patches.push(p)});
 oma.connect=async()=>{};oma.send=e=>events.push(e);
 return {oma,events,patches};
}
test('opening requests an assistant greeting without inventing user input',async()=>{
 const {oma,events,patches}=fixture();
 assert.equal(typeof oma.greet,'function');await oma.greet();await oma.greet();
 assert.equal(events.filter(e=>e.type==='response.create').length,1);
 assert.ok(events[0].response.instructions.includes('Greet the user as O.M.A. opens.'));
 assert.ok(!events.some(e=>e.type==='conversation.item.create'));
 assert.ok(patches.some(p=>p.userText===''&&p.assistantText===''));
});
test('a key press while connecting suppresses the pending greeting',async()=>{
 const {oma,events}=fixture();let connected;
 oma.connect=()=>new Promise(r=>connected=r);
 assert.equal(typeof oma.greet,'function');const greeting=oma.greet();
 oma.turn.press();connected();await greeting;assert.equal(events.length,0);
});
test('opening during an active response never adds another greeting',async()=>{
 const {oma,events}=fixture();oma.active=true;
 assert.equal(typeof oma.greet,'function');await oma.greet();assert.equal(events.length,0);
});
test('voice wake waits for the greeting playback before recording',async()=>{
 const {oma}=fixture();let presses=0;oma.press=async()=>{presses++};
 await oma.greet(true);oma.responseRequested=false;oma.active=false;oma.audio.pumping=true;
 oma.audio.onDrained();await new Promise(r=>setTimeout(r,160));assert.equal(presses,0);
 oma.audio.pumping=false;oma.audio.onDrained();await new Promise(r=>setTimeout(r,160));assert.equal(presses,1);
});
test('closing while the wake greeting plays never starts recording later',async()=>{
 const {oma}=fixture();let presses=0;oma.press=async()=>{presses++};
 await oma.greet(true);oma.responseRequested=false;oma.audio.pumping=false;
 oma.audio.onDrained();oma.turn.stop();await new Promise(r=>setTimeout(r,160));assert.equal(presses,0);
});
test('automatic speech cannot access previous conversation or invoke a tool',async()=>{
 const {oma,events}=fixture();await oma.greet();
 assert.equal(events[0].response.conversation,'none');assert.deepEqual(events[0].response.input,[]);
 assert.deepEqual(events[0].response.tools,[]);assert.equal(events[0].response.tool_choice,'none');
 oma.transcript='A lifecycle notice';assert.doesNotThrow(()=>oma.saveSpoken());
});
