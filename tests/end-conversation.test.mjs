import test from 'node:test';
import assert from 'node:assert/strict';
import {Oma,sessionConfig} from '../runtime/oma.mjs';
function fixture(){
 const patches=[],events=[];
 const audio={pumping:true,finish(){},stop(){this.pumping=false}};
 const oma=new Oma({audio,memory:{add(){},needsCompaction(){return false}},emit:p=>patches.push(p)});
 oma.send=e=>events.push(e);oma.turn.beginResponse('bye');oma.active=true;
 return {oma,audio,patches,events};
}
test('farewell tool is available and uses the normal dismiss only after final audio has drained',async()=>{
 assert.ok(sessionConfig('').tools.some(t=>t.name==='end_conversation'));
 const {oma,audio,patches,events}=fixture();
 await oma.callTool({name:'end_conversation',call_id:'close',arguments:'{}'});
 assert.equal(patches.some(p=>p.dismiss),false);
 oma.receive({type:'response.done',response:{id:'bye',status:'completed'}});
 assert.equal(patches.some(p=>p.dismiss),false);
 audio.pumping=false;audio.onDrained();audio.onDrained();
 assert.equal(patches.filter(p=>p.dismiss).length,1);
 assert.equal(events.filter(e=>e.type==='response.create').length,0);
});
test('new user speech cancels a pending farewell dismissal',async()=>{
 const {oma,audio,patches}=fixture();
 await oma.callTool({name:'end_conversation',call_id:'close',arguments:'{}'});
 oma.turn.press();oma.interrupt();audio.onDrained();
 assert.equal(patches.some(p=>p.dismiss),false);
});
