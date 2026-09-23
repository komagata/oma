import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
// 24 kHz mono signed 16-bit PCM; see assets/NOTICE.md for source and license.
const startupPcm=readFileSync(new URL('../assets/startup.pcm',import.meta.url));
export function startupSound(){return startupPcm;}
export class StartupCue {
 constructor(outputTarget=null){this.outputTarget=outputTarget;}
 play(){this.stop();const child=spawn('pw-play',[...(this.outputTarget?['--target',this.outputTarget]:[]),'--raw','--rate','24000','--channels','1','--format','s16','-'],{stdio:['pipe','ignore','ignore']});this.child=child;child.on('error',()=>{});child.stdin.on('error',()=>{});child.on('exit',()=>{if(this.child===child)this.child=null});child.stdin.end(startupSound());}
 stop(){this.child?.kill();this.child=null;}
}
