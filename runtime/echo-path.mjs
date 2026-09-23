import {spawn} from 'node:child_process';
import {runDesktopCommand} from './desktop.mjs';
// A client-owned module disappears with this child, including on worker shutdown.
// Virtual nodes have zero session priority and never become the default devices.
export class EchoPath {
 constructor({spawnProcess=spawn,run=runDesktopCommand}={}){
  Object.assign(this,{spawnProcess,run});this.prefix=`oma-aec-${process.pid}`;
  this.source=this.prefix+'-source';this.sink=this.prefix+'-sink';this.capture=this.prefix+'-capture';
 }
 async start(){
  const props=(name,extra='')=>`{ node.name = "${name}" ${extra} }`;
  const args=`library.name = aec/libspa-aec-webrtc audio.channels = 1 audio.position = [ MONO ] capture.props = ${props(this.capture,'node.passive = true')} source.props = ${props(this.source,'priority.session = 0')} sink.props = ${props(this.sink,'priority.session = 0')} playback.props = ${props(this.prefix+'-playback','node.passive = true')}`;
  const child=this.spawnProcess('setpriv',['--pdeathsig','TERM','--','pw-cli','-m','load-module','libpipewire-module-echo-cancel',args],{stdio:['pipe','ignore','pipe']});this.child=child;
  let failure='';child.on('error',e=>{failure=e.message});child.stderr.on('data',b=>{failure=(failure+b).slice(-500)});child.stdin.on('error',()=>{});
  for(let i=0;i<30;i++){
   await new Promise(r=>setTimeout(r,100));
   if(child.exitCode!==null||failure)break;
   const nodes=JSON.parse(await this.run('pw-dump',[]));
   const names=new Set(nodes.filter(n=>n.type==='PipeWire:Interface:Node').map(n=>n.info?.props?.['node.name']));
   if(names.has(this.source)&&names.has(this.sink))return;
  }
  this.close();throw Error('O.M.A. echo cancellation could not start. Check PipeWire WebRTC audio processing. '+failure);
 }
 close(){this.child?.kill();this.child=null;}
}
