import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {findOmarchySkill} from '../runtime/live-config.mjs';

function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'oma-skill-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const env={HOME:join(dir,'home'),OMARCHY_PATH:join(dir,'omarchy')};mkdirSync(env.HOME);
 const paths=[join(dir,'override.md'),...['.agents/skills','.pi/agent/skills','.codex/skills'].map(base=>join(env.HOME,base,'omarchy/SKILL.md')),
  ...['default/agents/skills','default/skills'].map(base=>join(env.OMARCHY_PATH,base,'omarchy/SKILL.md'))];
 const file=path=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,'fixture skill');};
 return {env,paths,file};
}

test('fresh HOME discovers the canonical system skill without personal links',t=>{
 const {env,paths,file}=fixture(t);file(paths[4]);assert.equal(findOmarchySkill(env),paths[4]);
});
test('explicit override, personal skills, canonical and legacy keep their search priority',t=>{
 const {env,paths,file}=fixture(t);env.OMA_OMARCHY_SKILL=paths[0];paths.forEach(file);
 for(const path of paths){assert.equal(findOmarchySkill(env),path);rmSync(path);}
 assert.equal(findOmarchySkill(env),undefined);
});
test('missing and directory candidates safely fall back to a legacy skill file',t=>{
 const {env,paths,file}=fixture(t);env.OMA_OMARCHY_SKILL=paths[0];
 mkdirSync(paths[1],{recursive:true});mkdirSync(paths[4],{recursive:true});file(paths[5]);
 assert.equal(findOmarchySkill(env),paths[5]);rmSync(paths[5]);assert.equal(findOmarchySkill(env),undefined);
});
