import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {omaProfile,installProfile,profileSkills} from '../runtime/profile.mjs';
import {sessionConfig} from '../runtime/oma.mjs';
test('the bundled skill is available to voice sessions and installed in the dedicated Codex home',()=>{
 const home=mkdtempSync(join(tmpdir(),'oma-profile-'));
 try{installProfile(home);for(const name of profileSkills){const body=readFileSync(join(home,'skills',name,'SKILL.md'),'utf8').replace(/^---\n[\s\S]*?\n---\n/,'').trim();assert.ok(omaProfile.includes(body));}assert.ok(omaProfile.includes('camera_snapshot'));assert.ok(sessionConfig('','ja-JP').instructions.includes(omaProfile));}finally{rmSync(home,{recursive:true,force:true});}
});
test('each fresh O.M.A. user home receives both bundled skills and updates overwrite stale copies',()=>{
 const homes=[mkdtempSync(join(tmpdir(),'oma-user-a-')),mkdtempSync(join(tmpdir(),'oma-user-b-'))];
 try{
  for(const home of homes){
   installProfile(home);
   for(const name of ['oma','oma-camera'])assert.ok(readFileSync(join(home,'skills',name,'SKILL.md'),'utf8').includes('name: '+name));
   installProfile(home);
   assert.ok(readFileSync(join(home,'skills/oma-camera/SKILL.md'),'utf8').includes('camera_snapshot'));
  }
 }finally{for(const home of homes)rmSync(home,{recursive:true,force:true});}
});
