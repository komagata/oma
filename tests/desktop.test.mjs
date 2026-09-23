import test from 'node:test';
import assert from 'node:assert/strict';
const mod=await import('../runtime/desktop.mjs').catch(()=>({}));
test('screenshot coordinates map to scaled and rotated monitors',()=>{
 assert.equal(typeof mod.monitorRect,'function');
 const rect=mod.monitorRect({x:-1280,y:0,width:3840,height:2160,scale:1.5,transform:0});
 assert.deepEqual(rect,{x:-1280,y:0,width:2560,height:1440});
 assert.deepEqual(mod.screenPoint({rect,width:1280,height:720},640,360),{x:0,y:720});
 assert.deepEqual(mod.monitorRect({x:0,y:0,width:1920,height:1080,scale:1,transform:1}),{x:0,y:0,width:1080,height:1920});
 assert.throws(()=>mod.screenPoint({rect,width:1280,height:720},1280,0));
});
test('desktop shortcuts work on an empty desktop while typing still needs a focused window',async()=>{
 const calls=[],monitor={name:'Virtual-1',x:0,y:0,width:1920,height:1080,scale:1,transform:0};
 const d=new mod.Desktop({emit(){},async run(cmd,args){
  calls.push([cmd,args]);
  return Buffer.from(JSON.stringify(args.includes('monitors')?[monitor]:{}));
 }});
 d.begin();d.screenshot=async()=>[];
 const frame=()=>({id:'observed',time:Date.now(),monitor:'Virtual-1',monitorBounds:mod.monitorRect(monitor),active:undefined});
 d.frame=frame();await d.call('desktop_key',{frameId:'observed',key:'SUPER+Return'});
 assert.equal(calls.some(([cmd])=>cmd==='wtype'),true);
 d.frame=frame();await assert.rejects(d.call('desktop_type',{frameId:'observed',text:'hello'}),/focused window/i);
});
test('desktop actions require a fresh screenshot and reject unsupported input',async()=>{
 assert.equal(typeof mod.Desktop,'function');
 const desktop=new mod.Desktop({emit(){}});desktop.begin();
 await assert.rejects(desktop.call('desktop_click',{frameId:'made-up',x:3,y:4,button:'left'}),/screenshot/i);
 await assert.rejects(desktop.call('desktop_shell',{command:'anything'}),/Unknown/);
 desktop.cancel();
 await assert.rejects(desktop.call('desktop_screenshot',{}),/cancel/i);
});
