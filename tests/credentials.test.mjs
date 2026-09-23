import test from 'node:test';import assert from 'node:assert/strict';
const m=await import('../runtime/credentials.mjs').catch(()=>({}));
test('API keys travel over stdin and invalid keys never reach storage',async()=>{
 assert.equal(typeof m.saveApiKey,'function');const calls=[];
 const run=async(...args)=>{calls.push(args);return Buffer.alloc(0)};
 await assert.rejects(m.saveApiKey('not a key',run),/API key/);assert.equal(calls.length,0);
 const key='sk-test-'+ 'x'.repeat(40);await m.saveApiKey(key,run);
 assert.equal(calls[0][0],'gopass');assert.ok(!JSON.stringify(calls[0][1]).includes(key));
 assert.equal(calls[0][2].input,key+'\n');
});
