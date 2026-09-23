import {languageInstruction} from './locale.mjs';
export function idleInstruction(locale,farewell=false){
 const source=farewell?'Call me again whenever you need me.':"I'm ready. Tell me what you need.";
 return languageInstruction(locale)+' Speak only this line, translated naturally into the response language if needed: '+JSON.stringify(source)+'. Use a calm retro computer voice. Do not answer previous requests or call tools.';
}
// Time counts only when the conversation panel is open and ready for input.
export class IdleConversation {
 constructor({ready,speak,dismiss,now=Date.now,promptAfter=15000,closeAfter=20000}){Object.assign(this,{ready,speak,dismiss,now,promptAfter,closeAfter});this.active=false;this.reset();}
 reset(){this.epoch=(this.epoch||0)+1;this.stage='waiting';this.since=this.now();this.pending=false;}
 show(active){if(this.active===active)return;this.active=active;this.reset();}
 activity(){this.reset();}
 async tick(){
  if(!this.active||this.pending)return;
  if(!this.ready()){this.since=this.now();return;}
  if(this.stage==='closing'){this.active=false;this.dismiss();return;}
  if(this.stage==='prompting'){this.stage='prompted';this.since=this.now();return;}
  const delay=this.stage==='waiting'?this.promptAfter:this.closeAfter;
  if(this.now()-this.since<delay)return;
  const farewell=this.stage==='prompted',epoch=this.epoch;this.pending=true;
  try{
   const started=await this.speak(farewell);
   if(this.epoch===epoch){this.stage=started?(farewell?'closing':'prompting'):'waiting';this.since=this.now();}
  }finally{if(this.epoch===epoch)this.pending=false;}
 }
}
