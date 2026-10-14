import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Quickshell's native plugin is only registered by its own executable.
// Exercise the actual lifecycle function without creating layer-shell windows.
test('resolving a closed overlay never cancels the incoming wake greeting',()=>{
 const qml=readFileSync(new URL('../qml/Overlay.qml',import.meta.url),'utf8');
 const source=qml.slice(qml.indexOf('function resolveService()'),qml.indexOf('function open('));
 const patches=[];
 const ctx={shell:{serviceFor(){return {keyConfigured:true}}},service:null,opened:false,settingsMode:false,
  syncPresentation(){patches.push('presentation')},greetOnOpen(){patches.push('greeting')}};
 vm.runInNewContext(source+';resolveService()',ctx);
 assert.deepEqual(patches,[]);
 ctx.opened=true;vm.runInNewContext('resolveService()',ctx);
 assert.deepEqual(patches,['presentation','greeting']);
});
test('desktop observation keeps a docked window mapped so its tile survives',()=>{
 const qml=readFileSync(new URL('../qml/Overlay.qml',import.meta.url),'utf8');
 const expression=qml.match(/^        visible: (.+)$/m)[1];
 const root={opened:true,docked:true,service:{computerUsing:true}};
 assert.equal(vm.runInNewContext(expression,{root}),true);
 root.docked=false;assert.equal(vm.runInNewContext(expression,{root}),false);
 root.service.computerUsing=false;assert.equal(vm.runInNewContext(expression,{root}),true);
 root.opened=false;assert.equal(vm.runInNewContext(expression,{root}),false);
});

function commandContext() {
 const source=readFileSync(new URL('../runtime/main-live.mjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('async function command(c)'),source.indexOf('const input=createInterface'));
 const calls=[];const companion={setAutoVisible(v){calls.push(['auto',v])},restore(){calls.push('restore')},setPanelState(a,c){calls.push(['panel',a,c])}};
 const ctx={switchingAgent:false,tools:{companion},presented:true,transcriptLog:{begin(){},end(){}},idle:{show(){}},start:async()=>{},stop:async()=>calls.push('stop')};
 vm.runInNewContext(body,ctx);return {ctx,calls};
}
test('presentation stopping and automatic visibility cancellation never restore visible layout',async()=>{
 const {ctx,calls}=commandContext();
 await ctx.command({action:'presentation',active:false});
 await ctx.command({action:'companionVisibility',active:false});
 assert.equal(calls.includes('stop'),true);assert.equal(calls.includes('restore'),false);
});
test('panel lifecycle independently reports animation and actual hiding',async()=>{
 const {ctx,calls}=commandContext();
 await ctx.command({action:'companionPanel',active:true,closing:true});
 await ctx.command({action:'companionPanel',active:false,closing:false});
 assert.deepEqual(calls,[['panel',true,true],['panel',false,false]]);
});

test('temporary-hide opens are bounded, validated, cancelled by target close and discarded at panel close',()=>{
 const qml=readFileSync(new URL('../qml/Overlay.qml',import.meta.url),'utf8');
 const source=qml.slice(qml.indexOf('function companionEvent('),qml.indexOf('onTargetScreenChanged:'));
 const sync=qml.slice(qml.indexOf('function syncAutoCompanion()'),qml.indexOf('function syncPresentation()'));
 const opens=[],closes=[];
 const ctx={opened:true,closing:false,pendingCompanionOpens:[],window:{visible:false},service:{companionPanel(){},companionVisibility(){},companionOpened(a){opens.push(a)},companionClosed(a){closes.push(a)}}};ctx.root=ctx;
 vm.runInNewContext(source+sync,ctx);
 for(let i=1;i<=20;i++)ctx.companionEvent({name:'openwindow',data:i.toString(16)+',1,editor,title'});
 ctx.companionEvent({name:'openwindow',data:'bad";command,1,editor,title'});
 assert.equal(ctx.pendingCompanionOpens.length,16);assert.deepEqual(opens,[]);
 ctx.companionEvent({name:'closewindow',data:'1'});assert.deepEqual(closes,['0x1']);
 ctx.window.visible=true;ctx.syncAutoCompanion();assert.equal(opens.length,15);assert.equal(opens.includes('0x1'),false);
 ctx.window.visible=false;ctx.companionEvent({name:'openwindow',data:'30'});
 ctx.closing=true;ctx.syncAutoCompanion();assert.equal(ctx.pendingCompanionOpens.length,0);
 ctx.companionEvent({name:'openwindow',data:'40'});assert.equal(ctx.pendingCompanionOpens.length,0);
 ctx.opened=false;ctx.closing=false;ctx.companionEvent({name:'openwindow',data:'50'});assert.equal(ctx.pendingCompanionOpens.length,0);
});
