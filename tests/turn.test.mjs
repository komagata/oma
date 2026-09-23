import test from 'node:test';import assert from 'node:assert/strict';
const {Turn}=await import('../runtime/turn.mjs').catch(()=>({}));
test('press interrupts playback and fences late response events',()=>{
 assert.equal(typeof Turn,'function','Turn controller missing');const t=new Turn();
 t.beginResponse('old');assert.ok(t.accept('old'));t.press();assert.equal(t.state,'listening');assert.equal(t.accept('old'),false);t.release();assert.equal(t.state,'thinking');t.beginResponse('new');assert.ok(t.accept('new'));assert.equal(t.accept('old'),false);
});
test('repeated press and empty release do not submit duplicate turns',()=>{
 assert.equal(typeof Turn,'function','Turn controller missing');const t=new Turn();assert.equal(t.release(),false);assert.equal(t.press(),true);assert.equal(t.press(),false);assert.equal(t.release(),true);assert.equal(t.release(),false);
});
