import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {EchoPath} from '../runtime/echo-path.mjs';
import {Audio} from '../runtime/audio.mjs';

test('echo module belongs to a child, keeps system default priorities, and is removed on close',async()=>{
 let launch,killed=false;
 const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stderr:new PassThrough(),exitCode:null,kill(){killed=true}});
 const path=new EchoPath({spawnProcess:(...args)=>{launch=args;return child},run:async()=>JSON.stringify([path.source,path.sink].map(name=>({type:'PipeWire:Interface:Node',info:{props:{'node.name':name}}})))});
 await path.start();assert.equal(launch[0],'setpriv');assert.deepEqual(launch[1].slice(0,4),['--pdeathsig','TERM','--','pw-cli']);assert.match(launch[1].at(-1),/aec\/libspa-aec-webrtc/);assert.match(launch[1].at(-1),/priority.session = 0/);
 path.close();assert.equal(killed,true);
});
test('conversation microphone targets cleaned source for shared recording',()=>{
 let args;const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough()});
 const audio=new Audio(()=>{},()=>{},{inputTarget:'clean-mic',spawnProcess:(...a)=>{args=a;return child}});
 audio.record(()=>{});assert.deepEqual(args[1].slice(0,2),['--target','clean-mic']);
});
