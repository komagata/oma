import test from 'node:test';import assert from 'node:assert/strict';
import {saveApiKey,loadApiKey} from '../runtime/credentials.mjs';
test('API keys travel to the desktop keyring over stdin; invalid keys never reach storage',async()=>{
 const calls=[];const run=async(...args)=>{calls.push(args);return Buffer.alloc(0)};
 await assert.rejects(saveApiKey('not a key',run),/API key/);assert.equal(calls.length,0);
 const key='sk-test-'+ 'x'.repeat(40);await saveApiKey(key,run);
 assert.equal(calls[0][0],'secret-tool');assert.ok(!JSON.stringify(calls[0][1]).includes(key));
 assert.equal(calls[0][2].input,key+'\n');
});
test('saved desktop key wins, and existing gopass keys remain readable',async()=>{
 assert.equal(await loadApiKey({OPENAI_API_KEY:'env'},async(cmd)=>Buffer.from(cmd==='secret-tool'?'keyring':'legacy')),'keyring');
 assert.equal(await loadApiKey({},async(cmd)=>{if(cmd==='secret-tool')throw Error('not found');return Buffer.from('legacy')}),'legacy');
});
test('a locked desktop keyring reports an actionable error without silently saving elsewhere',async()=>{
 let count=0;
 await assert.rejects(saveApiKey('sk-'+'x'.repeat(30),async()=>{count++;throw Error('locked')}),/Unlock.*keyring/);
 assert.equal(count,1);
});
