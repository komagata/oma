import {runDesktopCommand} from './desktop.mjs';
export const apiKeyPath='projects/oma/openai/api-key';
const keyringAttributes=['application','io.github.komagata.oma','credential','openai-api-key'];
export async function loadApiKey(env=process.env,run=runDesktopCommand){
 try{const key=(await run('secret-tool',['lookup',...keyringAttributes])).toString().trim();if(key)return key;}catch{}
 // A key explicitly saved in O.M.A. takes precedence over inherited defaults.
 for(const path of [apiKeyPath]){try{const key=(await run('gopass',['show','-o',path])).toString().trim();if(key)return key;}catch{}}
 if(env.OPENAI_API_KEY)return env.OPENAI_API_KEY;
 try{return (await run('gopass',['show','-o','personal/openai/api-key'])).toString().trim()}catch{return ''}
}
export async function saveApiKey(value,run=runDesktopCommand){
 const key=String(value).trim();
 if(!/^sk-[A-Za-z0-9_-]{20,500}$/.test(key))throw Error('Enter a valid OpenAI API key (sk-…).');
 try{await run('secret-tool',['store','--label=O.M.A. OpenAI API key',...keyringAttributes],{input:key+'\n'});}catch{throw Error('Could not save the API key. Unlock your desktop keyring and try again. If secret-tool is missing, run SET UP.');}
}
