import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Run the actual map builder without loading Quickshell or opening windows.
const overlay=readFileSync(new URL('../qml/Overlay.qml',import.meta.url),'utf8');
const rebuild=overlay.slice(overlay.indexOf('function rebuildDesktop()'),overlay.indexOf('function refreshDesktop()'));
const toplevel=(title,info={})=>({title,lastIpcObject:{class:'quickshell',at:[100,100],size:[400,300],mapped:true,hidden:false,focusHistoryID:0,...info}});
function map(windows,geometry={}) {
 const context={contextMonitor:{x:0,y:0,width:1000,height:800,scale:1,activeWorkspace:{id:1,name:'1',toplevels:{values:windows}},...geometry}};
 vm.runInNewContext(rebuild+';rebuildDesktop()',context);
 return JSON.parse(JSON.stringify({windows:context.desktopWindows,workspace:context.desktopWorkspace,aspect:context.desktopAspect}));
}

test('OMA-only map counts and labels itself without an external target',()=>{
 const result=map([toplevel('O.M.A.')]);assert.equal(result.windows.length,1);
 assert.equal(result.windows[0].isOma,true);assert.equal(result.windows[0].app,'O.M.A.');assert.equal(result.windows[0].title,'O.M.A.');
 assert.equal(result.windows[0].focused,false);assert.equal(result.workspace,'1');
});
test('mini and normal OMA are shown while most recent other app remains task focus',()=>{
 const result=map([toplevel('O.M.A.'),toplevel('O.M.A. Mini',{focusHistoryID:1}),toplevel('Editor',{class:'code',focusHistoryID:2}),toplevel('OmaText',{focusHistoryID:3})]);
 assert.equal(result.windows.length,4);assert.deepEqual(result.windows.map(w=>w.isOma),[true,true,false,false]);
 assert.equal(result.windows[1].app,'O.M.A.');assert.equal(result.windows[1].title,'O.M.A. Mini');
 assert.deepEqual(result.windows.filter(w=>w.focused).map(w=>w.app),['code']);assert.equal(result.windows[3].app,'quickshell');
});
test('focused other app remains target when OMA has an older history',()=>{
 const result=map([toplevel('O.M.A.',{focusHistoryID:2}),toplevel('Browser',{class:'browser',focusHistoryID:0}),toplevel('Editor',{class:'code',focusHistoryID:1})]);
 assert.deepEqual(result.windows.filter(w=>w.focused).map(w=>w.app),['browser']);
});
test('hidden, unmapped and missing-geometry windows are excluded, including OMA',()=>{
 const result=map([toplevel('O.M.A.',{hidden:true}),toplevel('O.M.A. Mini',{mapped:false}),toplevel('Editor',{hidden:true}),toplevel('Browser',{at:null}),toplevel('OmaText',{focusHistoryID:-1})]);
 assert.equal(result.windows.length,1);assert.equal(result.windows[0].isOma,false);assert.equal(result.windows[0].focused,false);
});
test('self geometry uses scaled monitor coordinates and the existing edge clipping',()=>{
 const result=map([toplevel('O.M.A.',{at:[150,80],size:[600,300]}),toplevel('Editor',{at:[900,650],size:[400,400],focusHistoryID:1})],{x:200,y:100,width:2000,height:1200,scale:2});
 assert.equal(result.aspect,1000/600);const [self,other]=result.windows;
 assert.deepEqual([self.x,self.y,self.w,self.h],[0,0,.55,280/600]);
 assert.deepEqual([other.x,other.y,other.w,other.h],[.7,550/600,1-.7,1-550/600]);
});

// Exercise the component's task target binding as a second boundary.
test('DesktopMap never anchors a task link to a self-marked window',()=>{
 const qml=readFileSync(new URL('../qml/components/DesktopMap.qml',import.meta.url),'utf8');
 const body=qml.slice(qml.indexOf('readonly property var focusedWindow: {')+'readonly property var focusedWindow: {'.length,qml.indexOf('readonly property real headerHeight')).trim().replace(/}$/, '');
 const resolve=windows=>vm.runInNewContext('(function(){'+body+'})()',{windows});
 assert.equal(resolve([{isOma:true,focused:true,app:'O.M.A.'}]),null);
 const other={isOma:false,focused:true,app:'code'};assert.equal(resolve([{isOma:true,focused:true},other]),other);
});

test('late compositor metadata schedules a rebuild only while the overlay is open',()=>{
 const source=overlay.match(/function onLastIpcObjectChanged\(\) \{[^}]*\}/)?.[0];
 assert.ok(source,'metadata arrivals have a rebuild handler');
 let rebuilds=0;const root={opened:true};const desktopSettle={restart(){rebuilds++}};
 const ctx={root,desktopSettle};vm.runInNewContext(source+';onLastIpcObjectChanged()',ctx);
 assert.equal(rebuilds,1);root.opened=false;vm.runInNewContext('onLastIpcObjectChanged()',ctx);assert.equal(rebuilds,1);
});
test('mapping the overlay requests fresh geometry after its surface becomes visible',()=>{
 const source=overlay.match(/onVisibleChanged: \{([^\n]+)\}/)?.[1];
 assert.ok(source,'overlay has a surface visibility handler');
 let refreshes=0;const root={opened:false,syncAutoCompanion(){},close(){},refreshDesktop(){refreshes++}};
 const ctx={root,visible:false};vm.runInNewContext(source,ctx);assert.equal(refreshes,0);
 ctx.visible=true;vm.runInNewContext(source,ctx);assert.equal(refreshes,1);
});
