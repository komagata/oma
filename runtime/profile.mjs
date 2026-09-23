import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
export const profileSkills=['oma','oma-camera'];
const sources=profileSkills.map(name=>({name,source:readFileSync(new URL('../skills/'+name+'/SKILL.md',import.meta.url),'utf8')}));
export const omaProfile=sources.map(({source})=>source.replace(/^---\n[\s\S]*?\n---\n/,'').trim()).join('\n\n');
export const profileRevision=createHash('sha256').update(omaProfile).digest('hex');
export function installProfile(home){
 for(const {name,source} of sources){
  const directory=join(home,'skills',name);mkdirSync(directory,{recursive:true,mode:0o700});
  writeFileSync(join(directory,'SKILL.md'),source,{mode:0o600});
 }
}
