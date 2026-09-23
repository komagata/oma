import test from 'node:test';import assert from 'node:assert/strict';
test('startup cue is short, bounded and fades to silence',async()=>{
 const {startupSound}=await import('../runtime/startup.mjs').catch(()=>({}));
 assert.equal(typeof startupSound,'function');const pcm=startupSound();
 assert.ok(pcm.length>=24000&&pcm.length<=72000);
 assert.equal(pcm.readInt16LE(0),0);assert.equal(pcm.readInt16LE(pcm.length-2),0);
 let peak=0;for(let i=0;i<pcm.length;i+=2)peak=Math.max(peak,Math.abs(pcm.readInt16LE(i)));
 assert.ok(peak>1000&&peak<=30000);
});
