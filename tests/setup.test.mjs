import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const script=new URL('../scripts/check-setup.py',import.meta.url).pathname;
test('setup check reports missing tools without Node or a working runtime',()=>{
 const result=JSON.parse(execFileSync('/usr/bin/python3',[script],{env:{PATH:'/nonexistent'},encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 assert.equal(result.setupRequired,true);
 assert.match(result.setupMessage,/Node.js 24/);
 assert.match(result.setupMessage,/GPT-Live SDK/);

});
test('setup check never contains credentials',()=>{
 const result=execFileSync('/usr/bin/python3',[script],{env:{PATH:'/nonexistent',OPENAI_API_KEY:'secret-fixture'},encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.ok(!result.includes('secret-fixture'));
});

import {mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, rmSync, cpSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

for (const scenario of ['success','packageFailure','wakeFailure']) test('isolated first installation: '+scenario,t=>{
 const failInstall=scenario==='packageFailure';
 const failWake=scenario==='wakeFailure';
 if(spawnSync('bwrap',['--ro-bind','/','/','--','true']).status!==0){t.skip('bubblewrap unavailable');return;}
 const dir=mkdtempSync(join(tmpdir(),'oma-setup-test-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const bin=join(dir,'bin');mkdirSync(bin);
 for(const name of ['dirname','python3','find','grep','mkdir','install'])symlinkSync('/usr/bin/'+name,join(bin,name));
 const executable=(name,body)=>writeFileSync(join(bin,name),'#!/bin/bash\n'+body,{mode:0o755});
 executable('sudo',`echo "$*" >> "${dir}/commands"
${failInstall?'exit 1':`for name in node pw-record pw-play pw-cli wpctl grim wtype xdg-open setpriv bwrap secret-tool xdg-terminal-exec systemd-run npm; do
printf '#!/bin/bash\\necho 24\\n' > "${bin}/$name"
chmod +x "${bin}/$name"
done`}
`);
 // Fake package installation uses chmod through an absolute path.
 writeFileSync(join(bin,'sudo'),readFileSync(join(bin,'sudo'),'utf8').replace('chmod +x','/usr/bin/chmod +x'),{mode:0o755});
 if(failWake)executable('bash','echo Wake download failed >&2; exit 23');
 executable('hyprctl','exit 0');
 executable('mise','exit 0');
 executable('omarchy',`echo "$*" >> "${dir}/commands"
if [[ "$1" == pkg && "$2" == add ]]; then shift 2; exec sudo pacman -S --needed "$@"; fi
[[ "$1" == mise ]] || exit 0
printf '#!/bin/bash\\necho codex-cli-test\\n' > "${bin}/codex"
/usr/bin/chmod +x "${bin}/codex"
`);
 const root=new URL('..',import.meta.url).pathname;
 const result=spawnSync('bwrap',['--ro-bind','/','/','--dev','/dev','--bind',dir,dir,
  '--tmpfs','/home','--dir','/home/komagata','--ro-bind',root,'/home/oma',
  '--setenv','PATH',bin,'--','/bin/bash','/home/oma/scripts/setup'],
  {input:failWake?'y\nn\ny\n\n':'y\nn\nn\n\n',encoding:'utf8',timeout:15000});
 assert.ok(result.stdout.includes('O.M.A.'),result.stderr+result.stdout);
 const log=readFileSync(join(dir,'commands'),'utf8');
 assert.match(log,/pipewire-audio/);
 assert.doesNotMatch(log,/update -y/);
 assert.match(log,/pkg add/);
 if(failInstall){
  assert.notEqual(result.status,0);
  assert.match(result.stdout,/Setup did not finish/);
  assert.doesNotMatch(result.stdout,/Return to O.M.A./);
 }else{
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.doesNotMatch(log,/mise install codex/);
  assert.match(result.stdout,/Computer setup is complete/);
  if(failWake)assert.match(result.stdout,/Voice wake was not installed/);
 }
});

// Run the real scripts in a disposable checkout/home. Package installation and
// desktop commands are fixtures; this does not exercise a GUI or real keyring.
const requiredCommands=['pw-record','pw-play','pw-cli','wpctl','grim','wtype','hyprctl','xdg-open','setpriv','bwrap','secret-tool','xdg-terminal-exec','systemd-run','npm'];
function setupFixture(t,{missing=[],sdk=true,packageFailure=false,npmFailure=false,omitInstalled=''}={}){
 const dir=mkdtempSync(join(tmpdir(),'oma-first-run-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const bin=join(dir,'bin'),root=join(dir,'checkout with spaces'),home=join(dir,'home');
 mkdirSync(bin);mkdirSync(root);mkdirSync(join(home,'.config/hypr'),{recursive:true});
 writeFileSync(join(home,'.config/hypr/bindings.lua'),'-- existing user shortcuts\n');
 cpSync(new URL('../scripts',import.meta.url),join(root,'scripts'),{recursive:true});
 // NumPy is a fixture so the test is independent of system Python packages.
 const modules=join(dir,'modules');mkdirSync(modules);writeFileSync(join(modules,'numpy.py'),'');
 for(const name of ['dirname','python3','grep','mkdir','install','cp','date','cat'])symlinkSync('/usr/bin/'+name,join(bin,name));
 const command=(name,body)=>writeFileSync(join(bin,name),'#!/bin/bash\n'+body,{mode:0o755});
 const marker=join(dir,'sdk'),log=join(dir,'commands');
 if(sdk)writeFileSync(marker,'');
 const nodeBody=`if [[ "$1" == -p ]]; then echo 24; elif [[ "$1" == --input-type=module ]]; then [[ -f '${marker}' ]]; else exit 0; fi`;
 command('node',nodeBody);
 for(const name of requiredCommands){
  if(missing.includes(name))continue;
  command(name,name==='hyprctl'?`echo "$*" >> '${log}'; if [[ "$1" == -j ]]; then echo '[]'; fi`:name==='npm'?`echo "npm $*" >> '${log}'; ${npmFailure?'exit 17':`touch '${marker}'`}`:'exit 0');
 }
 symlinkSync('/usr/bin/touch',join(bin,'touch'));
 command('find','echo /usr/lib/spa-0.2/aec/libspa-aec-webrtc.so');
 command('pacman','exit 1');
 command('omarchy',`echo "$*" >> '${log}'\n${packageFailure?'exit 19':`for name in ${missing.filter(n=>n!==omitInstalled).join(' ')}; do /usr/bin/printf '#!/bin/bash\\nexit 0\\n' > '${bin}/'$name; /usr/bin/chmod +x '${bin}/'$name; done`}`);
 const env={...process.env,PATH:bin,HOME:home,XDG_CONFIG_HOME:join(home,'.config'),PYTHONPATH:modules};
 const probe=()=>JSON.parse(execFileSync('/usr/bin/python3',[join(root,'scripts/check-setup.py')],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 const run=(input='n\nn\ny\n\n',args=[],overrides={})=>spawnSync('/bin/bash',[join(root,'scripts/setup'),...args],{env:{...env,...overrides},input:input?Buffer.from(input):undefined,stdio:[input?'pipe':'ignore','pipe','pipe'],encoding:'utf8',timeout:5000});
 return {probe,run,home,log,bin,marker,command};
}
for(const [command,label] of [['secret-tool','keyring'],['xdg-terminal-exec','terminal'],['systemd-run','systemd'],['npm','npm']]){
 test('preflight requires '+command+' before allowing onboarding',t=>{
  const f=setupFixture(t,{missing:[command]});const result=f.probe();
  assert.equal(result.setupRequired,true);assert.match(result.setupMessage,new RegExp(label,'i'));
 });
}
test('interactive setup installs missing keyring and launcher tools only after consent',t=>{
 const f=setupFixture(t,{missing:['secret-tool','xdg-terminal-exec','systemd-run']});
 const declined=f.run('n\n\n');assert.notEqual(declined.status,0);assert.equal(existsSync(f.log),false);
 const accepted=f.run('y\nn\nn\nn\n\n');assert.equal(accepted.status,0,accepted.stdout+accepted.stderr);
 const commands=readFileSync(f.log,'utf8');assert.match(commands,/pkg add.*libsecret/);assert.match(commands,/xdg-terminal-exec/);assert.match(commands,/systemd/);
 assert.equal(f.probe().setupRequired,false);
});
test('setup refuses completion when package success leaves the keyring unavailable',t=>{
 const f=setupFixture(t,{missing:['secret-tool'],omitInstalled:'secret-tool'});
 const result=f.run('y\nn\nn\nn\n\n');assert.notEqual(result.status,0);assert.doesNotMatch(result.stdout,/Computer setup is complete/);
 assert.match(result.stdout,/dependencies are still unavailable/);
});
test('failed package setup can be retried without losing existing configuration',t=>{
 const f=setupFixture(t,{missing:['secret-tool'],packageFailure:true});
 const before=readFileSync(join(f.home,'.config/hypr/bindings.lua'),'utf8');
 const failed=f.run('y\n\n');assert.notEqual(failed.status,0);assert.match(failed.stdout,/Setup did not finish/);
 assert.equal(readFileSync(join(f.home,'.config/hypr/bindings.lua'),'utf8'),before);
 f.command('secret-tool','exit 0');const retry=f.run('n\nn\nn\n\n');assert.equal(retry.status,0,retry.stdout+retry.stderr);
 assert.equal(readFileSync(join(f.home,'.config/hypr/bindings.lua'),'utf8'),before);
});
test('clean dependency setup retries a failed npm install and uses the locked SDK',t=>{
 const f=setupFixture(t,{sdk:false,npmFailure:true});
 const failed=f.run('y\n\n');assert.notEqual(failed.status,0);assert.equal(f.probe().setupRequired,true);
 f.command('npm',`echo "npm $*" >> '${f.log}'; touch '${f.marker}'`);
 const result=f.run('y\nn\nn\nn\n\n');assert.equal(result.status,0,result.stdout+result.stderr);
 assert.match(readFileSync(f.log,'utf8'),/npm ci --omit=dev --ignore-scripts --bin-links=false/);assert.equal(f.probe().setupRequired,false);
});
test('re-running successful setup preserves its F8 shortcut without adding another binding',t=>{
 const f=setupFixture(t);const first=f.run();assert.equal(first.status,0,first.stdout+first.stderr);
 const binding=join(f.home,'.config/hypr/bindings.lua'),before=readFileSync(binding,'utf8');assert.match(before,/shell toggle io.github.komagata.oma/);
 const second=f.run();assert.equal(second.status,0,second.stdout+second.stderr);assert.equal(readFileSync(binding,'utf8'),before);
 assert.equal((readFileSync(f.log,'utf8').match(/reload/g)||[]).length,1);
});

test('interactive setup checks and installs bubblewrap only after consent',t=>{
 const f=setupFixture(t,{missing:['bwrap']});assert.match(f.probe().setupMessage,/bubblewrap/i);
 assert.notEqual(f.run('n\n\n').status,0);assert.equal(existsSync(f.log),false);
 const accepted=f.run('y\nn\nn\nn\n\n');assert.equal(accepted.status,0,accepted.stdout+accepted.stderr);
 assert.match(readFileSync(f.log,'utf8'),/pkg add.*bubblewrap/);assert.equal(f.probe().setupRequired,false);
});

for(const args of [['--help'],['--unknown']])test('setup parses '+args[0]+' before mutation',t=>{
 const f=setupFixture(t,{missing:['secret-tool']});const r=f.run('',args);
 assert.equal(r.status,args[0]==='--help'?0:2,r.stdout+r.stderr);assert.equal(existsSync(f.log),false);
 assert.equal(existsSync(join(f.home,'.local/bin/oma')),false);
});
test('unattended setup never accepts missing dependencies without explicit install consent',t=>{
 const f=setupFixture(t,{sdk:false});const r=f.run('', ['--non-interactive']);
 assert.notEqual(r.status,0);assert.match(r.stdout+r.stderr,/--install-missing/);assert.equal(existsSync(f.log),false);
});
test('unattended npm failure is actionable and can be retried idempotently',t=>{
 const f=setupFixture(t,{sdk:false,npmFailure:true});const args=['--non-interactive','--install-missing'];
 assert.notEqual(f.run('',args).status,0);
 f.command('npm',`echo "npm $*" >> '${f.log}'; touch '${f.marker}'`);
 const before=readFileSync(join(f.home,'.config/hypr/bindings.lua'),'utf8');
 for(let i=0;i<2;i++){const r=f.run('',args);assert.equal(r.status,0,r.stdout+r.stderr);assert.doesNotMatch(r.stdout,/Press Enter/);}
 assert.equal(readFileSync(join(f.home,'.config/hypr/bindings.lua'),'utf8'),before);
 assert.doesNotMatch(readFileSync(f.log,'utf8'),/reload|pkg add|wake/);
});
test('unattended setup preserves conflicting CLI and returns failure',t=>{
 const f=setupFixture(t);mkdirSync(join(f.home,'.local/bin'),{recursive:true});
 const cli=join(f.home,'.local/bin/oma');writeFileSync(cli,'unrelated command');
 const r=f.run('', ['--non-interactive']);assert.notEqual(r.status,0);assert.equal(readFileSync(cli,'utf8'),'unrelated command');
});
test('interactive EOF declines dependency installation',t=>{
 const f=setupFixture(t,{sdk:false});const r=f.run('');assert.notEqual(r.status,0);assert.equal(r.error,undefined);assert.equal(existsSync(f.log),false);
});
test('F8 setup respects XDG_CONFIG_HOME and preserves existing HOME bindings',t=>{
 const f=setupFixture(t);const xdg=join(f.home,'custom config');mkdirSync(join(xdg,'hypr'),{recursive:true});
 const bindings=join(xdg,'hypr/bindings.lua');writeFileSync(bindings,'-- custom shortcuts\n');
 const original=readFileSync(join(f.home,'.config/hypr/bindings.lua'),'utf8');
 const r=f.run('n\nn\ny\n\n',[],{XDG_CONFIG_HOME:xdg});assert.equal(r.status,0,r.stdout+r.stderr);
 assert.match(readFileSync(bindings,'utf8'),/shell toggle io.github.komagata.oma/);
 assert.equal(readFileSync(join(f.home,'.config/hypr/bindings.lua'),'utf8'),original);
});
for(const scenario of ['success','privilegeFailure','incomplete'])test('unattended scoped package installation: '+scenario,t=>{
 const f=setupFixture(t,{missing:['secret-tool']});
 f.command('sudo',`echo "sudo $*" >> '${f.log}'\n${scenario==='privilegeFailure'?'exit 1':scenario==='incomplete'?'exit 0':`/usr/bin/printf '#!/bin/bash\\nexit 0\\n' > '${f.bin}/secret-tool'; /usr/bin/chmod +x '${f.bin}/secret-tool'`}`);
 const r=f.run('', ['--non-interactive','--install-missing']);
 assert.equal(r.status===0,scenario==='success',r.stdout+r.stderr);assert.equal(r.error,undefined);
 assert.match(readFileSync(f.log,'utf8'),/sudo -n pacman -S --needed --noconfirm libsecret/);
 assert.doesNotMatch(readFileSync(f.log,'utf8'),/-Syu|-Sy |reload|pkg add/);
 if(scenario==='privilegeFailure')assert.match(r.stdout+r.stderr,/terminal privilege.*|Open a terminal/);
});
test('CLI installation refuses an unrelated dangling symlink without creating its target',t=>{
 const f=setupFixture(t);mkdirSync(join(f.home,'.local/bin'),{recursive:true});
 const target=join(f.home,'unrelated-target');symlinkSync(target,join(f.home,'.local/bin/oma'));
 const r=f.run('', ['--non-interactive']);assert.notEqual(r.status,0);assert.equal(r.error,undefined);assert.equal(existsSync(target),false);
});
