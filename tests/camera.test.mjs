import test from 'node:test';
import assert from 'node:assert/strict';
import {Camera} from '../runtime/camera.mjs';
const jpeg=Buffer.from('ffd8ffe00001ffd9','hex');
function fixture(){const events=[],calls=[];return {events,calls,camera:new Camera({emit:e=>events.push(e),devices:async()=>[{device:'/dev/video0',name:'IR'},{device:'/dev/video2',name:'Color'}],run:async(cmd,args)=>{calls.push([cmd,args]);if(cmd==='v4l2-ctl')return Buffer.from(args.includes('/dev/video0')?"[0]: 'GREY'":"[0]: 'MJPG'");return jpeg;}})}}
test('camera discovery prefers color to infrared and snapshot returns an image without writing a file',async()=>{
 const f=fixture(),list=await f.camera.list();assert.equal(list[0].device,'/dev/video2');
 const items=await f.camera.snapshot('',new AbortController().signal);
 assert.equal(items[1].imageUrl,'data:image/jpeg;base64,'+jpeg.toString('base64'));
 assert.ok(f.calls.find(([cmd,args])=>cmd==='ffmpeg'&&args.includes('/dev/video2')&&args.at(-1)==='pipe:1'));
 assert.equal(f.events[0].cameraActive,true);assert.equal(f.events.at(-1).cameraActive,false);
});
test('missing, arbitrary and busy cameras fail without claiming a successful capture',async()=>{
 const f=fixture();await assert.rejects(f.camera.snapshot('/etc/passwd'),/available camera/i);
 f.camera.devices=async()=>[];await assert.rejects(f.camera.snapshot(''),/No camera/i);
 const g=fixture();g.camera.run=async(cmd)=>{if(cmd==='ffmpeg')throw Error('Device or resource busy');return Buffer.from("[0]: 'MJPG'")};
 await assert.rejects(g.camera.snapshot(''),/busy/);assert.equal(g.events.at(-1).cameraActive,false);
});
