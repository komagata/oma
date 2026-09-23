import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('a plugin checkout imports its runtime without npm install or native builds',t=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 const checkout=mkdtempSync(join(tmpdir(),'oma-plugin-checkout-'));
 t.after(()=>rmSync(checkout,{recursive:true,force:true}));
 for(const dir of ['runtime','skills','assets','vendor'])cpSync(join(root,dir),join(checkout,dir),{
  recursive:true,filter:path=>!path.endsWith('/oma-pointer')
 });
 cpSync(join(root,'package.json'),join(checkout,'package.json'));
 assert.equal(existsSync(join(checkout,'node_modules')),false);
 assert.equal(existsSync(join(checkout,'runtime','oma-pointer')),false);
 const result=execFileSync(process.execPath,['--input-type=module','-e',
  "import {sessionConfig} from './runtime/oma.mjs'; if(sessionConfig('', 'en-US').audio.input.transcription.language !== 'en') process.exit(1); console.log('ready');"],{cwd:checkout,encoding:'utf8'});
 assert.equal(result.trim(),'ready');
 const lock=JSON.parse(readFileSync(join(root,'package-lock.json')));
 const vendor=JSON.parse(readFileSync(join(root,'vendor/ws/package.json')));
 assert.equal(vendor.version,lock.packages['node_modules/ws'].version);
});
