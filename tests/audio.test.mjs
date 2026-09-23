import test from 'node:test';import assert from 'node:assert/strict';
const {shapeAudio}=await import('../runtime/audio.mjs').catch(()=>({}));
test('voice processing keeps silence silent and produces bounded mouth amplitude',()=>{
 assert.equal(typeof shapeAudio,'function','Audio processor missing');
 const silent=shapeAudio(Buffer.alloc(960));assert.equal(silent.level,0);assert.ok(silent.pcm.equals(Buffer.alloc(960)));
 const pcm=Buffer.alloc(960);for(let i=0;i<480;i++)pcm.writeInt16LE(Math.round(Math.sin(i/10)*15000),i*2);
 const voiced=shapeAudio(pcm);assert.ok(voiced.level>0&&voiced.level<=1);assert.equal(voiced.pcm.length,pcm.length);assert.ok(!voiced.pcm.equals(pcm));
});
test('lip rounding varies with speech spectrum and closes during silence',()=>{
 const tone=hz=>{const b=Buffer.alloc(960);for(let i=0;i<480;i++)b.writeInt16LE(Math.round(7000*Math.sin(2*Math.PI*hz*i/24000)),i*2);return b};
 const low=shapeAudio(tone(250)), high=shapeAudio(tone(2200));
 assert.ok(Number.isFinite(low.lipRound), 'Lip shape analysis is missing');
 assert.ok(low.lipRound>high.lipRound);
 assert.ok(high.lipWide>low.lipWide);
 const silence=shapeAudio(Buffer.alloc(960));assert.equal(silence.lipRound,0);assert.equal(silence.lipWide,0);
});
test('O.M.A. doubles quiet speech amplitude and limits loud peaks without changing lip poses',()=>{
 const quiet=Buffer.alloc(960);for(let i=0;i<480;i++)quiet.writeInt16LE(1000,i*2);
 const boosted=shapeAudio(quiet,0,0);
 assert.equal(boosted.pcm.readInt16LE(0),2000,'Default speech gain should be +6 dB');
 const loud=Buffer.alloc(960);for(let i=0;i<480;i++)loud.writeInt16LE(i%2?32767:-32768,i*2);
 const limited=shapeAudio(loud,0,0);
 for(let i=0;i<480;i++)assert.ok(Math.abs(limited.pcm.readInt16LE(i*2))<=30000,'Keep headroom and avoid digital clipping');
 const original=shapeAudio(quiet,0,0,1);
 assert.equal(boosted.level,original.level);assert.equal(boosted.lipRound,original.lipRound);
});

test('loud unmodulated tones retain their waveform instead of saturating peaks',()=>{
 const input=Buffer.alloc(960);
 for(let i=0;i<480;i++)input.writeInt16LE(Math.round(30000*Math.sin(2*Math.PI*i/48)),i*2);
 const {pcm}=shapeAudio(input,0,0);
 const ratio=pcm.readInt16LE(24)/input.readInt16LE(24);
 for(let i=0;i<480;i++)assert.ok(Math.abs(pcm.readInt16LE(i*2)-input.readInt16LE(i*2)*ratio)<2,'Limiter must scale, not flatten the waveform');
});
test('streaming voice effect is independent of incoming packet boundaries',async()=>{
 const {VoiceProcessor}=await import('../runtime/audio.mjs');
 assert.equal(typeof VoiceProcessor,'function');
 const input=Buffer.alloc(9600);
 for(let i=0;i<4800;i++)input.writeInt16LE(Math.round(30000*Math.sin(i*.11)),i*2);
 const whole=new VoiceProcessor().process(input);
 const processor=new VoiceProcessor(),parts=[];
 for(let at=0;at<input.length;at+=320)parts.push(processor.process(input.subarray(at,at+320)));
 assert.deepEqual(Buffer.concat(parts),whole);
 for(let i=0;i<whole.length;i+=2)assert.ok(Math.abs(whole.readInt16LE(i))<=28001);
});
test('retro modulation keeps the dry signal polarity and leaves output headroom',async()=>{
 const {VoiceProcessor}=await import('../runtime/audio.mjs');
 const input=Buffer.alloc(9600);for(let i=0;i<input.length;i+=2)input.writeInt16LE(25000,i);
 const out=new VoiceProcessor().process(input);
 for(let i=240;i<out.length;i+=2){
  assert.ok(out.readInt16LE(i)>=0,'Modulation should not reverse the voice phase');
  assert.ok(out.readInt16LE(i)<=24577,'Keep at least 2.5 dB of output headroom');
 }
});
