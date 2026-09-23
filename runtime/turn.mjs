export class Turn {
 constructor(){this.state='idle';this.response=null;this.generation=0;this.recording=false;this.blocked=new Set();}
 press(){if(this.recording)return false;if(this.response)this.blocked.add(this.response);this.response=null;this.generation++;this.recording=true;this.state='listening';return true;}
 release(){if(!this.recording)return false;this.recording=false;this.state='thinking';return true;}
 beginResponse(id){if(this.recording||this.blocked.has(id))return false;this.response=id;this.state='thinking';return true;}
 accept(id){return !this.recording&&id===this.response&&!this.blocked.has(id);}
 stop(){if(this.response)this.blocked.add(this.response);this.response=null;this.recording=false;this.generation++;this.state='idle';}
}
