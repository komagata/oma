// Real entry point and Memory/cache/effect routing, with all external I/O blocked.
import {registerHooks} from 'node:module';import {readFileSync} from 'node:fs';import {PassThrough} from 'node:stream';
// File-backed test controls also work when the harness closes inherited stdin.
const input=new PassThrough();Object.defineProperty(process,'stdin',{value:input});let consumed=0;
const controls=setInterval(()=>{const commands=readFileSync(process.env.OMA_TEST_COMMANDS,'utf8').trim().split('\n').filter(Boolean);while(consumed<commands.length){const line=commands[consumed++];if(JSON.parse(line).action==='fixtureClose'){clearInterval(controls);input.end();return;}input.write(line+'\n')}},10);
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
globalThis.omaVoiceFixtureEmit=emit;
const stubs={
 'credentials.mjs':"export async function loadApiKey(){return 'fictional'};export async function saveApiKey(){throw Error('Forbidden')}",
 'microphones.mjs':"export async function listMicrophones(){return []};export async function microphoneNode(){return {}}",
 'wake.mjs':"export class WakeListener {start(){}pause(){}close(){}setEnabled(){}};export async function microphoneAvailable(){return true}",
 'audio.mjs':"export class Audio {constructor(level,error,options){globalThis.omaVoiceFixtureEmit({audioOptions:options})}async stopRecording(){}stop(){this.outputBuffer?.reset()}record(){}enqueue(pcm){globalThis.omaVoiceFixtureEmit({played:pcm.toString('base64')})}finish(){}}",
 'startup.mjs':"export class StartupCue {stop(){}play(){}}",
 'hyprland-context.mjs':"export class HyprlandContext {}",
 'local-tools.mjs':"export const localToolDefinitions=[];export class LocalTools {constructor(options){Object.assign(this,options);this.devJobs={async start(){throw Error('Forbidden')},async list(){return []}}}begin(){}cancel(){}call(){this.onEnd()}}",
 'prepare-greeting.mjs':"export async function prepareGreeting({effectsEnabled,signal,cache}){globalThis.omaVoiceFixtureEmit({preparing:effectsEnabled,farewell:cache.farewell});signal.addEventListener('abort',()=>globalThis.omaVoiceFixtureEmit({aborted:effectsEnabled,farewell:cache.farewell}),{once:true})}",
 'live-session.mjs':"export class LiveSession {constructor(options){Object.assign(this,options);this.captions={assistant:''};this.responses=new Map()}async start(){this.started=true;globalThis.omaVoiceFixtureEmit({sessionEffects:this.audio.outputBuffer.enabled,voice:this.config.audio.output.voice,hasFarewell:!!this.farewellEntry,instructions:this.config.instructions})}instruct(){}instructTransient(){if(!this.audio.outputBuffer.enabled)this.audio.outputBuffer.append(Buffer.from([1,0,255,127,0,128]))}appendAudio(){}async close(){this.started=false}text(text){if(text==='bye')this.execute('end_conversation',{});else this.instructTransient()}}",
};
registerHooks({resolve(specifier,context,next){if(specifier==='openai'||specifier==='openai/resources/live/ws')return {url:'oma-voice-fixture:'+specifier,shortCircuit:true};return next(specifier,context)},load(url,context,next){
 if(url==='oma-voice-fixture:openai')return {format:'module',source:'export default class OpenAI {}',shortCircuit:true};
 if(url==='oma-voice-fixture:openai/resources/live/ws')return {format:'module',source:"export class LiveWS {constructor(){throw Error('Network forbidden')}}",shortCircuit:true};
 for(const [name,source] of Object.entries(stubs))if(url.endsWith('/runtime/'+name))return {format:'module',source,shortCircuit:true};
 return next(url,context);
}});
await import('../../runtime/main-live.mjs');
