import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const module = await import('../runtime/memory.mjs').catch(() => ({}));
const Memory = module.Memory;
function fixture(t) { const dir=mkdtempSync(join(tmpdir(),'oma-test-')); t.after(()=>rmSync(dir,{recursive:true,force:true})); return join(dir,'memory.sqlite'); }
test('URLs remain exact and searchable after compaction and restart', async t => {
 assert.equal(typeof Memory,'function','Memory store is not implemented');
 const path=fixture(t); let m=new Memory(path);
 const url='https://example.com/search?q=green%20face&lang=ja#part-2';
 m.action('open_url',{url,title:'Green face'},'completed');
 for(let i=0;i<35;i++) m.add('user','conversation '+i+' '.repeat(200));
 await m.compact(async()=> 'Earlier conversation about a green face.', 6);
 m.close(); m=new Memory(path);
 assert.equal(m.lastUrl().url,url); assert.ok(m.context('green').includes(url)); m.close();
});
test('forget removes source history and summary and invalidates old compaction', async t => {
 assert.equal(typeof Memory,'function','Memory store is not implemented');
 const m=new Memory(fixture(t)); m.remember('drink','green tea');
 for(let i=0;i<12;i++)m.add('user','I like green tea '+i);
 let resolve; const work=m.compact(()=>new Promise(r=>resolve=r),2);
 m.forget('green tea'); resolve('User likes green tea.'); await work;
 assert.ok(!m.context('tea').includes('green tea')); assert.equal(m.search('green tea').length,0); m.close();
});
test('context has a hard byte budget and facts update without duplicate keys', t => {
 assert.equal(typeof Memory,'function','Memory store is not implemented');
 const m=new Memory(fixture(t)); m.remember('language','English'); m.remember('language','Japanese');
 for(let i=0;i<100;i++)m.add('user','日本語'.repeat(500));
 assert.ok(Buffer.byteLength(m.context('',4096))<=4096); assert.equal(m.facts()[0].value,'Japanese'); m.close();
});
test('newest request survives large old messages in a small context budget',t=>{
 const m=new Memory(fixture(t));m.add('user','old '.repeat(9000));m.add('user','LATEST_REFERENCE_42');
 assert.ok(m.context('',4096).includes('LATEST_REFERENCE_42'));m.close();
});
test('unfinished task and progress survive restart and are visible without a search query',t=>{
 const path=fixture(t);let m=new Memory(path);
 m.set('taskCheckpoint',JSON.stringify({instruction:'Inspect microphone input',status:'running',progress:'Volume checked; capture verification still pending'}));
 m.close();m=new Memory(path);
 assert.match(m.context(),/capture verification still pending/);
 m.forget('microphone');assert.equal(m.get('taskCheckpoint'),'');m.close();
});
