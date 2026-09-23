import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Audio} from '../runtime/audio.mjs';
test('standby recorder transfers without a process restart or missing subsequent PCM',()=>{
 let starts=0;
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr={resume(){}};child.kill=()=>{throw Error('must not stop capture')};
 const options={spawnProcess:()=>{starts++;return child}};
 const standby=new Audio(()=>{},()=>{},options),active=new Audio(()=>{},()=>{},options);
 const before=[],after=[];
 standby.record(b=>before.push(b));
 child.stdout.emit('data',Buffer.alloc(80));
 active.takeRecording(standby);active.record(b=>after.push(b));
 child.stdout.emit('data',Buffer.alloc(120));
 assert.equal(starts,1);assert.equal(standby.recorder,null);
 assert.equal(before.length,1);assert.equal(after[0].length,120);
 child.emit('exit',0);assert.equal(active.recorder,null);
});
