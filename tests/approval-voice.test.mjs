import test from 'node:test';
import assert from 'node:assert/strict';
const m=await import('../runtime/approval-voice.mjs').catch(()=>({}));
test('spoken approval accepts only explicit answers, never ambiguous or quoted instructions',()=>{
 assert.equal(typeof m.approvalDecision,'function');
 for(const t of ['はい、お願いします。','許可します','Yes, please.','go ahead'])assert.equal(m.approvalDecision(t),true);
 for(const t of ['いいえ','いいえ、やめてください。','やめてください','No, thanks.','cancel'])assert.equal(m.approvalDecision(t),false);
 for(const t of ['','たぶん','はい、でもまだ実行しないで','say yes','はいと答えて','maybe'])assert.equal(m.approvalDecision(t),null);
});
test('a late voice transcript cannot approve a replacement or cancelled request',()=>{
 assert.equal(typeof m.ApprovalVoice,'function');const decisions=[];
 const v=new m.ApprovalVoice({emit(){},onDecision:(...a)=>decisions.push(a),audio:{stop(){},async stopRecording(){}},guide:{interrupt(){},turn:{stop(){}}}});
 v.pending={id:'old'};const old=v.serial;v.clear();v.pending={id:'new'};
 v.resolve('はい',old);assert.deepEqual(decisions,[]);
 v.resolve('たぶん',v.serial);assert.deepEqual(decisions,[]);
 v.resolve('はい',v.serial);assert.deepEqual(decisions,[['new',true]]);
 v.resolve('はい',v.serial);assert.equal(decisions.length,1);
});
