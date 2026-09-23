import {fileURLToPath} from 'node:url';
export async function restartAssistant(run){
 await run('systemd-run',['--user','--collect','--on-active=2s','--timer-property=AccuracySec=100ms','--','python3',fileURLToPath(new URL('./restart_oma.py',import.meta.url))]);
 return {scheduled:true,message:'O.M.A. will reopen shortly. The desktop bar is not restarted.'};
}
