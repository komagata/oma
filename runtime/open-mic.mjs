export function canListen({presented,key,state,recording,savingKey,demo,approvalPhase}){
 return !!(presented&&key&&!savingKey&&!demo&&!recording&&
  !['error','offline','unauthenticated'].includes(state)&&
  !['listening','transcribing'].includes(approvalPhase));
}
// Local-only standby capture. Send a short pre-roll only after speech starts.
export class OpenMic {
 constructor({audio,ready,available,onSpeech,onError=()=>{},onListening=()=>{},handoff=false,now=Date.now}){
  Object.assign(this,{audio,ready,available,onSpeech,onError,onListening,handoff,now});this.serial=0;this.after=0;this.chunks=[];
  // Lower onset gate; sustained detection still rejects isolated clicks.
  this.startRms=650;
  this.noiseRms=40;
  this.stopRms=300;
  this.startBytes=5760;    // ~120 ms sustained speech before trigger.
  this.stopHoldBytes=9600; // ~200 ms below stopRms to reset partial detection.
 }
 async pause(){this.serial++;this.listening=false;this.onListening(false);this.chunks=[];this.voiceBytes=0;await this.audio.stopRecording();}
 async tick(){
  if(this.polling)return;this.polling=true;
  try{
   if(!this.ready()){this.after=this.now()+400;if(this.listening)await this.pause();return;}
   if(this.now()<this.after)return;
   const serial=this.serial;
   if(!await this.available()){this.after=this.now()+1000;await this.pause();return;}
   if(serial!==this.serial||!this.ready())return;
   if(this.listening)return;
   this.listening=true;this.onListening(true);this.chunks=[];this.voiceBytes=0;this.stopBytes=0;
   this.audio.record(b=>{
    if(serial!==this.serial||!this.listening||!this.ready())return;
    this.chunks.push(b);while(this.chunks.length>1&&this.chunks.reduce((n,c)=>n+c.length,0)>48000)this.chunks.shift();
    let sum=0;for(let i=0;i+1<b.length;i+=2)sum+=b.readInt16LE(i)**2;
    const rms=Math.sqrt(sum/Math.max(1,b.length/2));
    const threshold=Math.max(120,Math.min(this.startRms,this.noiseRms*3));
    this.speechRms=threshold*.65;
    if(rms<threshold)this.noiseRms=this.noiseRms*.98+rms*.02;
    if(rms>=threshold){
     this.voiceBytes+=b.length;
     this.stopBytes=0;
    }else if(this.voiceBytes>0){
     if(rms<threshold*.65)this.stopBytes+=b.length;
     else this.stopBytes=0;
     if(this.stopBytes>=this.stopHoldBytes){this.voiceBytes=0;this.stopBytes=0;}
    }
    if(this.voiceBytes<this.startBytes)return; // Minimum sustained speech before trigger.
    const preRoll=Buffer.concat(this.chunks);
    if(this.handoff){
     this.serial++;this.listening=false;this.onListening(false);this.chunks=[];this.voiceBytes=0;
     Promise.resolve(this.onSpeech(preRoll)).catch(this.onError);return;
    }
    const stopped=this.pause(),generation=this.serial;
    stopped.then(()=>{if(generation===this.serial&&this.ready())return this.onSpeech(preRoll);}).catch(this.onError);
   });
  }catch(e){await this.pause();this.after=this.now()+3000;this.onError(e);}
  finally{this.polling=false;}
 }
}
