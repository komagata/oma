import {loadApiKey} from '../runtime/credentials.mjs';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {Memory} from '../runtime/memory.mjs';import {Oma} from '../runtime/oma.mjs';
const key=await loadApiKey();const dir=mkdtempSync(join(tmpdir(),'oma-memory-live-'));const m=new Memory(join(dir,'memory.sqlite'));let errors=[];let received=0;let reply='';
const audio={played:0,pumping:false,stop(){},finish(){},close:async()=>{},stopRecording:async()=>{},enqueue(b){received+=b.length}};
let o=new Oma({key,memory:m,audio,emit(e){if(e.error)errors.push(e.error);if(e.assistantText)reply=e.assistantText}});let pass=false;const timeout=setTimeout(()=>process.exit(1),90000);
async function wait(){for(let i=0;i<800;i++){await new Promise(r=>setTimeout(r,50));if(!o.active&&!o.responseRequested&&!o.toolsRunning&&received)break;}}
try{
 await o.text('Remember this preference using the remember tool: my favorite fictional test color is emerald green.');await wait();
 if(!m.facts().some(f=>f.value.toLowerCase().includes('green')))throw Error('Memory tool did not store preference');
 await o.close();received=0;o=new Oma({key,memory:m,audio,emit(e){if(e.error)errors.push(e.error);if(e.assistantText)reply=e.assistantText}});
 await o.text('What is my favorite fictional test color?');await wait();
 if(!reply.toLowerCase().includes('emerald'))throw Error('Memory unavailable after reconnection');
 if(errors.length)throw Error(errors.join('; '));
 console.log('Recall response:',reply);console.log('Realtime memory tool + new-session recall: PASS');pass=true;
}finally{clearTimeout(timeout);await o.close();m.close();rmSync(dir,{recursive:true,force:true});process.exit(pass?0:1);}
