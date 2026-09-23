import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const script=new URL('../scripts/check-setup.py',import.meta.url).pathname;
test('setup check reports missing tools without Node or a working runtime',()=>{
 const result=JSON.parse(execFileSync('/usr/bin/python3',[script],{env:{PATH:'/nonexistent'},encoding:'utf8'}));
 assert.equal(result.setupRequired,true);
 assert.match(result.setupMessage,/Node.js 24/);
 assert.match(result.setupMessage,/Codex/);
 assert.match(result.setupMessage,/key storage/);
});
test('setup check never contains credentials',()=>{
 const result=execFileSync('/usr/bin/python3',[script],{env:{PATH:'/nonexistent',OPENAI_API_KEY:'secret-fixture'},encoding:'utf8'});
 assert.ok(!result.includes('secret-fixture'));
});

import {mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

for (const failInstall of [false,true]) test('isolated first installation '+(failInstall?'keeps package failure visible':'installs missing dependencies'),t=>{
 if(spawnSync('bwrap',['--ro-bind','/','/','--','true']).status!==0){t.skip('bubblewrap unavailable');return;}
 const dir=mkdtempSync(join(tmpdir(),'oma-setup-test-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const bin=join(dir,'bin');mkdirSync(bin);
 for(const name of ['dirname','python3','find','grep'])symlinkSync('/usr/bin/'+name,join(bin,name));
 const executable=(name,body)=>writeFileSync(join(bin,name),'#!/bin/bash\n'+body,{mode:0o755});
 executable('sudo',`echo "$*" >> "${dir}/commands"
${failInstall?'exit 1':`for name in node pw-record pw-play pw-cli wpctl grim wtype xdg-open setpriv secret-tool; do
printf '#!/bin/bash\\necho 24\\n' > "${bin}/$name"
chmod +x "${bin}/$name"
done`}
`);
 // Fake package installation uses chmod through an absolute path.
 writeFileSync(join(bin,'sudo'),readFileSync(join(bin,'sudo'),'utf8').replace('chmod +x','/usr/bin/chmod +x'),{mode:0o755});
 executable('hyprctl','exit 0');
 executable('mise','exit 0');
 executable('omarchy',`echo "$*" >> "${dir}/commands"
[[ "$1" == mise ]] || exit 0
printf '#!/bin/bash\\necho codex-cli-test\\n' > "${bin}/codex"
/usr/bin/chmod +x "${bin}/codex"
`);
 const root=new URL('..',import.meta.url).pathname;
 const result=spawnSync('bwrap',['--ro-bind','/','/','--dev','/dev','--bind',dir,dir,
  '--tmpfs','/home','--dir','/home/komagata','--ro-bind',root,'/home/oma',
  '--setenv','PATH',bin,'--','/bin/bash','/home/oma/scripts/setup'],
  {input:'y\ny\nn\nn\n\n',encoding:'utf8',timeout:15000});
 assert.ok(result.stdout.includes('O.M.A.'),result.stderr+result.stdout);
 const log=readFileSync(join(dir,'commands'),'utf8');
 assert.match(log,/pipewire-audio/);
 assert.match(log,/update -y/);
 if(failInstall){
  assert.notEqual(result.status,0);
  assert.match(result.stdout,/Setup did not finish/);
  assert.doesNotMatch(result.stdout,/Return to O.M.A./);
 }else{
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.match(log,/mise install codex/);
  assert.match(result.stdout,/CHECK AGAIN/);
 }
});
