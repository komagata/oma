import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,rmSync,readFileSync,statSync,readdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('a clean checkout preflight explains the missing GPT-Live dependency without starting the worker',t=>{
 const root=fileURLToPath(new URL('..',import.meta.url)),checkout=mkdtempSync(join(tmpdir(),'oma-plugin-checkout-'));t.after(()=>rmSync(checkout,{recursive:true,force:true}));
 for(const dir of ['scripts','runtime','skills'])cpSync(join(root,dir),join(checkout,dir),{recursive:true,filter:p=>!p.endsWith('/oma-pointer')});
 cpSync(join(root,'package.json'),join(checkout,'package.json'));
 const result=JSON.parse(execFileSync('python3',[join(checkout,'scripts/check-setup.py')],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 assert.equal(result.setupRequired,true);assert.match(result.setupMessage,/GPT-Live SDK/);assert.doesNotMatch(result.setupMessage,/Codex/);
});

test('local build includes the executable resources imported from bundled skills',()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 const files=readFileSync(join(root,'scripts/runtime-files.txt'),'utf8').trim().split('\n');
 assert.ok(files.includes('skills/oma/scripts/new-document.mjs'));
 assert.ok(!files.includes('runtime/main-pipeline.mjs'),'Removed providers must not ship');
 assert.ok(!files.some(f=>f.startsWith('docs/')||/preview|face\.obj|face\.json/.test(f)),'Development bulk must not ship');
});

test('explicit package includes every relative runtime import and QML resource',()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 const files=new Set(readFileSync(join(root,'scripts/runtime-files.txt'),'utf8').trim().split('\n'));
 for(const name of files){
  if(!/\.(mjs|qml)$/.test(name))continue;
  const source=readFileSync(join(root,name),'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s+|import\(|new URL\(|Qt\.resolvedUrl\()['"]([^'"]+)['"]/g)){
   const value=match[1];if(!value.startsWith('.')&&!name.endsWith('.qml'))continue;
   // Template fragments are covered by explicit skill/asset assertions below.
   if(value.endsWith('/')&&!name.endsWith('.qml'))continue;
   const resolved=fileURLToPath(new URL(value,new URL(name,new URL('../',import.meta.url))));
   const relative=resolved.slice(root.length);
   if(name.endsWith('.qml')&&match[0].startsWith('import ')&&!value.endsWith('.js')){
    assert.ok(statSync(resolved).isDirectory(),name+' imports directory '+relative);
    const components=readdirSync(resolved).filter(f=>f.endsWith('.qml'));
    assert.ok(components.length>0,name+' imports QML from '+relative);
    for(const component of components)assert.ok(files.has(join(relative,component)),name+' requires '+join(relative,component));
   }else{
    assert.ok(files.has(relative),name+' requires '+relative);
    if(name.endsWith('.qml'))assert.ok(statSync(resolved).isFile(),name+' requires file '+relative);
   }
  }
 }
 for(const name of ['skills/oma/SKILL.md','skills/oma-camera/SKILL.md','runtime/streaming-vocoder.py','runtime/wake.py','runtime/wake_match.py','runtime/restart_oma.py','runtime/oma-pointer','assets/FaceMesh.js','assets/reference-face.png','assets/crt.frag.qsb','assets/startup.pcm','scripts/setup','scripts/check-setup.py','scripts/doctor','scripts/build-pointer','scripts/setup-wake','scripts/install-cli','scripts/oma'])assert.ok(files.has(name),name);
 const dependencies=JSON.parse(readFileSync(join(root,'package.json'))).dependencies;
 assert.deepEqual(Object.keys(dependencies).sort(),['openai','ws']);
 const lock=JSON.parse(readFileSync(join(root,'package-lock.json')));
 assert.deepEqual(Object.keys(lock.packages).sort(),['','node_modules/openai','node_modules/ws']);
});
