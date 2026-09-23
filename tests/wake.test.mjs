import test from 'node:test';
import assert from 'node:assert/strict';
import {wakeReason,microphoneAvailable} from '../runtime/wake.mjs';
test('shared recording does not block wake; lock and mute still pause it',()=>{
 const s={enabled:true,key:true,idle:true,locked:false,muted:false,available:true};
 assert.equal(wakeReason({...s,busy:true}),'Listening for Hey O.M.A.');
 assert.equal(wakeReason({...s,busy:null}),'Listening for Hey O.M.A.');
 assert.match(wakeReason({...s,muted:true}),/muted/);
 assert.match(wakeReason({...s,locked:true}),/locked/);
 assert.match(wakeReason({...s,locked:null}),/unavailable/);
 assert.match(wakeReason({...s,idle:false}),/conversation/);
});
