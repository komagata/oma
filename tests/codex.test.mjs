import test from 'node:test';import assert from 'node:assert/strict';
const {approvalResult}=await import('../runtime/codex.mjs').catch(()=>({}));
test('approval decisions are scoped to the requested operation and default to deny',()=>{
 assert.equal(typeof approvalResult,'function','Codex approval adapter missing');
 assert.deepEqual(approvalResult('item/commandExecution/requestApproval',true),{decision:'accept'});
 assert.deepEqual(approvalResult('item/fileChange/requestApproval',false),{decision:'decline'});
 assert.deepEqual(approvalResult('item/permissions/requestApproval',true),{permissions:{},scope:'turn'});
});
test('multiple Codex questions preserve separate answers',async()=>{
 const mod=await import('../runtime/codex.mjs');assert.equal(typeof mod.questionAnswers,'function','Question mapping missing');
 assert.deepEqual(mod.questionAnswers([{id:'a'},{id:'b'}],{a:'first',b:'second'}),{a:{answers:['first']},b:{answers:['second']}});
});
test('computer tool requests return images to the owning Codex turn',async()=>{
 const {Codex}=await import('../runtime/codex.mjs');const sent=[];
 const codex=new Codex({emit(){},memory:{}});codex.thread='t';codex.turn='r';codex.busy=true;
 codex.send=m=>sent.push(m);
 codex.desktop={async call(){return [{type:'inputImage',imageUrl:'data:image/png;base64,test'}]}};
 codex.receive({id:44,method:'item/tool/call',params:{threadId:'t',turnId:'r',tool:'desktop_screenshot',arguments:{}}});
 await new Promise(r=>setTimeout(r,5));
 assert.equal(sent[0]?.result?.success,true);
 assert.equal(sent[0].result.contentItems[0].type,'inputImage');
});
test('Allow once grants only the permission profile shown in that request',async()=>{
 const {approvalResult}=await import('../runtime/codex.mjs');
 const requested={network:{enabled:true},fileSystem:{write:['/tmp/oma-test']}};
 assert.deepEqual(approvalResult('item/permissions/requestApproval',true,requested),{permissions:requested,scope:'turn'});
 assert.deepEqual(approvalResult('item/permissions/requestApproval',false,requested),{permissions:{},scope:'turn'});
});
test('a deliberate confirmation waits for the answer and returns only that decision',async()=>{
 const {Codex}=await import('../runtime/codex.mjs');const sent=[],patches=[];
 const c=new Codex({emit:p=>patches.push(p),memory:{}});c.thread='t';c.turn='r';c.busy=true;c.send=m=>sent.push(m);
 await c.computerCall({id:19,params:{threadId:'t',turnId:'r',tool:'confirm_action',arguments:{description:'Delete the demo file?'}}});
 assert.equal(sent.length,0);assert.equal(patches.at(-1).approval.description,'Delete the demo file?');
 c.approve('19',false);
 assert.deepEqual(JSON.parse(sent[0].result.contentItems[0].text),{approved:false});
 c.approve('19',true);assert.equal(sent.length,1);
});
