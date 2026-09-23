import {loadApiKey} from '../runtime/credentials.mjs';
// Opt-in integration check. Fictional data only; bills a short API response.
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Memory} from '../runtime/memory.mjs';import {Oma} from '../runtime/oma.mjs';import {Codex} from '../runtime/codex.mjs';
const key=await loadApiKey();
const dir=mkdtempSync(join(tmpdir(),'oma-live-'));const memory=new Memory(join(dir,'memory.sqlite'));const pcm=[];const events=[];
const audio={played:0,pumping:false,enqueue(b){pcm.push(b)},finish(){},stop(){},stopRecording:async()=>{},close:async()=>{}};
const emit=e=>{events.push(e);if(e.error)console.log('ERROR:',e.error);};
const codex=new Codex({home:join(dir,'codex'),cwd:dir,key,memory,emit});const oma=new Oma({key,memory,emit,audio,codex});
let passed=false;
const timer=setTimeout(()=>{console.error('TIMEOUT');process.exit(1)},120000);
try{
 await oma.text('Say exactly: Systems online. I am O.M.A.');
 for(let n=0;n<400;n++){await new Promise(r=>setTimeout(r,50));if(pcm.length&&!oma.active)break;}
 if(!pcm.length)throw Error('No audio received');console.log('Realtime audio bytes:',Buffer.concat(pcm).length);console.log('Realtime transcript:',events.filter(e=>e.assistantText).at(-1)?.assistantText);
 writeFileSync('/tmp/oma-voice-preview.pcm',Buffer.concat(pcm));
 const result=await codex.run('Do not use tools. Reply exactly OMA_READY.');console.log('Codex:',result);
 if(!result.includes('OMA_READY'))throw Error('Codex response missing');
 console.log('LIVE PASS');passed=true;
}finally{clearTimeout(timer);await oma.close();setTimeout(()=>{memory.close();rmSync(dir,{recursive:true,force:true});process.exit(passed?0:1)},500);}
