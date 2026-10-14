// Opt-in billed GPT-Live client-delegation smoke test with a deterministic memory agent.
// Fictional audio/memory only; this does not verify a real CLI backend or PC actions.
import OpenAI from 'openai';import {LiveWS} from 'openai/resources/live/ws';
import {loadApiKey} from '../runtime/credentials.mjs';import {Speech} from './fixtures/synthetic-speech.mjs';
import {LiveSession} from '../runtime/live-session.mjs';import {liveConfig} from '../runtime/live-config.mjs';
import {Memory} from '../runtime/memory.mjs';import {LocalTools} from '../runtime/local-tools.mjs';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'oma-live-'));const memory=new Memory(join(dir,'memory.sqlite'));const key=await loadApiKey();const input=[];await new Speech({key,locale:'ja-JP'}).speak('オーマ、私の好きな色は紫です。覚えておいてください。',b=>input.push(b));
let received=0,first=0,clock;const tools=new LocalTools({memory,emit(){}});tools.begin();
const config=liveConfig(memory);
const agent={id:'fixture',label:'Memory fixture',async run({text}){assert.match(text,/紫|purple/i);await tools.call('remember',{key:'favorite_color',value:'purple'});return '好きな色は紫と記憶しました。';}};
const session=new LiveSession({agent,config,connect:()=>new LiveWS(new OpenAI({apiKey:key})),audio:{enqueue(b){received+=b.length;if(!first){for(let i=0;i+1<b.length;i+=2)if(Math.abs(b.readInt16LE(i))>500){first=performance.now();break;}}},stop(){}},memory,execute:(...a)=>tools.call(...a),cancelTools:()=>tools.cancel(),emit:p=>{if(p.error)console.log('ERROR:',p.error)}});
try{await session.start();console.log('Live session started');clock=performance.now();const pcm=Buffer.concat([Buffer.alloc(24000),...input,Buffer.alloc(24000*2*20)]);for(let i=0;i<pcm.length;i+=960){session.appendAudio(pcm.subarray(i,i+960));await new Promise(r=>setTimeout(r,20));}assert.ok(received>0,'Audio received');assert.ok(memory.facts().some(f=>/紫|purple/i.test(f.value)),'Memory tool executed');console.log(JSON.stringify({pass:true,audioBytes:received,firstAudioMs:Math.round(first-clock),facts:memory.facts().length}));}finally{await session.close();memory.close();rmSync(dir,{recursive:true,force:true});}
