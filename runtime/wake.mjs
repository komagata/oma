import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runDesktopCommand} from './desktop.mjs';
export async function microphoneAvailable(){
 try{
  const [volume,lock]=await Promise.all([
   runDesktopCommand('wpctl',['get-volume','@DEFAULT_AUDIO_SOURCE@']),
   runDesktopCommand('loginctl',['show-session',process.env.XDG_SESSION_ID||'self','-p','LockedHint','--value'])
  ]);
  return !volume.toString().includes('[MUTED]')&&lock.toString().trim()==='no';
 }catch{return false;}
}
export function wakeReason(s){
 if(!s.enabled)return 'Voice wake is off';
 if(!s.key)return 'Add an API key first';
 if(!s.available)return 'Voice wake model is not installed';
 if(!s.idle)return 'Paused during conversation';
 if(s.locked===null||s.muted===null)return 'Paused: microphone status unavailable';
 if(s.locked)return 'Paused while screen is locked';
 if(s.muted)return 'Paused: microphone muted';
 return 'Listening for Hey O.M.A.';
}
export class WakeListener {
 constructor({data,enabled,ready,emit,onWake}){Object.assign(this,{data,enabled,ready,emit,onWake});this.running=false;this.closed=false;this.polling=false;this.cooldown=0;}
 start(){this.timer=setInterval(()=>this.poll(),1000);this.poll();}
 async poll(){
  if(this.closed||this.polling)return;this.polling=true;
  try{
   const python=join(this.data,'wake-venv/bin/python'),model=join(this.data,'models/vosk-model-small-ja-0.22');
   const s={...this.ready(),enabled:this.enabled,available:existsSync(python)&&existsSync(model),locked:null,muted:null};
   if(s.enabled&&s.available&&s.key&&s.idle){
    try{
     const [volume,lock]=await Promise.all([
      runDesktopCommand('wpctl',['get-volume','@DEFAULT_AUDIO_SOURCE@']),
      runDesktopCommand('loginctl',['show-session',process.env.XDG_SESSION_ID||'self','-p','LockedHint','--value'])
     ]);
     s.muted=volume.toString().includes('[MUTED]');
     const hint=lock.toString().trim();s.locked=hint==='yes'?true:hint==='no'?false:null;
    }catch{}
   }
   if(this.closed)return;
   const reason=wakeReason(s),listen=reason==='Listening for Hey O.M.A.'&&Date.now()>this.cooldown;
   this.emit({wakeEnabled:this.enabled,wakeStatus:listen&&!this.recorder?'Starting voice wake…':reason});
   if(!listen||!this.ready().idle){this.pause();return;}
   if(this.running)return;
   this.running=true;
   const recognizer=spawn(python,[fileURLToPath(new URL('./wake.py',import.meta.url)),model],{stdio:['pipe','pipe','ignore']});this.recognizer=recognizer;
   recognizer.on('error',()=>this.failed());recognizer.stdin.on('error',()=>{});
   recognizer.on('exit',()=>{if(this.recognizer===recognizer)this.failed()});
   createInterface({input:recognizer.stdout}).on('line',line=>{
    if(!this.running||this.recognizer!==recognizer)return;
    try{const event=JSON.parse(line);
     if(event.ready){
      this.recorder=spawn('pw-record',['--raw','--rate','16000','--channels','1','--format','s16','-P','{"node.name":"oma-wake","application.name":"O.M.A. Voice Wake"}','-'],{stdio:['ignore','pipe','ignore']});
      this.recorder.stdout.pipe(recognizer.stdin);this.recorder.on('error',()=>this.failed());
      this.recorder.on('exit',()=>{if(this.recognizer===recognizer)this.failed()});
     }
     if(event.wake){this.pause();this.cooldown=Date.now()+3000;this.onWake();}
    }catch{}
   });
  }finally{this.polling=false;}
 }
 failed(){this.pause();this.cooldown=Date.now()+10000;this.emit({wakeStatus:'Voice wake unavailable; retrying'});}
 pause(){this.running=false;const r=this.recorder,p=this.recognizer;this.recorder=null;this.recognizer=null;r?.kill();p?.kill();}
 setEnabled(value){this.enabled=value;if(!value)this.pause();this.poll();}
 close(){this.closed=true;clearInterval(this.timer);this.pause();}
}
export class HandsFreeTurn {
 constructor({release,cancel,silenceMs=5000,speechRms=120}){Object.assign(this,{release,cancel,silenceMs,speechRms});}
 start(){this.stop();this.began=Date.now();this.lastVoice=0;this.timer=setInterval(()=>this.tick(),100);}
 level(rms){if(this.timer&&rms>this.speechRms)this.lastVoice=Date.now();}
 tick(){const now=Date.now();if(this.lastVoice&&now-this.lastVoice>this.silenceMs||now-this.began>90000){this.stop();this.release();}else if(!this.lastVoice&&now-this.began>8000){this.stop();this.cancel();}}
 stop(){clearInterval(this.timer);this.timer=null;}
}
