import {loadApiKey} from '../runtime/credentials.mjs';
// Exercise push-to-talk with a synthetic, previously generated greeting, not the user's microphone.
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Memory} from '../runtime/memory.mjs';import {Oma} from '../runtime/oma.mjs';import {Codex} from '../runtime/codex.mjs';
const key=await loadApiKey();const dir=mkdtempSync(join(tmpdir(),'oma-audio-'));const m=new Memory(join(dir,'memory.sqlite'));let onData;let bytes=0;let text='';
const emit=e=>{if(e.userText)text=e.userText;if(e.error)console.log('ERROR',e.error)};
const audio={played:0,pumping:false,record(fn){onData=fn},stopRecording:async()=>{},stop(){},close:async()=>{},enqueue(b){bytes+=b.length},finish(){}};
const c=new Codex({home:join(dir,'codex'),cwd:dir,key,memory:m,emit});const o=new Oma({key,memory:m,emit,audio,codex:c});let passed=false;
const timer=setTimeout(()=>process.exit(1),120000);
try{
 await o.press();onData(readFileSync('/tmp/oma-voice-preview.pcm'));await o.release();
 for(let i=0;i<600;i++){await new Promise(r=>setTimeout(r,50));if(bytes&&text&&!o.active)break;}
 if(!text||!bytes)throw Error('No input transcript or reply audio');console.log('PTT transcript:',text);console.log('PTT reply audio bytes:',bytes);
 const result=await c.run('Create a file named oma-test.txt in the current directory containing exactly OMA_FILE_OK. Read it back and report success.');
 if(readFileSync(join(dir,'oma-test.txt'),'utf8').trim()!=='OMA_FILE_OK')throw Error('Codex file edit failed');console.log('Codex real file edit: PASS');
 passed=true;
}finally{clearTimeout(timer);await o.close();setTimeout(()=>{m.close();rmSync(dir,{recursive:true,force:true});process.exit(passed?0:1)},500);}
