import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Quickshell's native plugin is only registered by its own executable.
// Exercise the actual lifecycle function without creating layer-shell windows.
test('resolving a closed overlay never cancels the incoming wake greeting',()=>{
 const qml=readFileSync(new URL('../Overlay.qml',import.meta.url),'utf8');
 const source=qml.slice(qml.indexOf('function resolveService()'),qml.indexOf('function open('));
 const patches=[];
 const ctx={shell:{serviceFor(){return {keyConfigured:true}}},service:null,opened:false,settingsMode:false,
  syncPresentation(){patches.push('presentation')},greetOnOpen(){patches.push('greeting')}};
 vm.runInNewContext(source+';resolveService()',ctx);
 assert.deepEqual(patches,[]);
 ctx.opened=true;vm.runInNewContext('resolveService()',ctx);
 assert.deepEqual(patches,['presentation','greeting']);
});
