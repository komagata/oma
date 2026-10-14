import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,cpSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'oma-doctor-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const home=join(dir,'home'),bin=join(dir,'bin'),xdg=join(home,'config with spaces'),plugin=join(xdg,'omarchy/plugins/io.github.komagata.oma'),payload=join(plugin,'build with spaces');
 mkdirSync(bin);mkdirSync(join(payload,'scripts'),{recursive:true});mkdirSync(join(payload,'qml'));
 cpSync(new URL('../scripts/doctor',import.meta.url),join(payload,'scripts/doctor'));
 writeFileSync(join(plugin,'manifest.json'),JSON.stringify({id:'io.github.komagata.oma',entryPoints:{service:'build with spaces/qml/Service.qml'}}));
 writeFileSync(join(payload,'scripts/check-setup.py'),'import json\nprint(json.dumps({"setupRequired": False, "setupMessage": "Dependencies available"}))\n');
 const command=(name,body)=>writeFileSync(join(bin,name),'#!/bin/bash\n'+body,{mode:0o755});
 for(const name of ['omarchy','hyprctl','codex'])command(name,'exit 0');
 command('secret-tool',`echo forbidden-keyring-read >&2; exit 99`);
 command('gopass',`echo forbidden-secret-read >&2; exit 99`);
 command('omarchy-shell',`[[ \"$*\" == \"io.github.komagata.oma status\" ]] || exit 1; echo '{"setupRequired":false,"keyConfigured":true,"agentBackend":"codex","agentOptions":[{"value":"codex","available":true}],"error":"secret-fixture","userText":"private transcript"}'`);
 const skill=join(dir,'SKILL.md');writeFileSync(skill,'fixture');
 const env={PATH:bin,HOME:home,XDG_CONFIG_HOME:xdg,WAYLAND_DISPLAY:'fixture',OMA_OMARCHY_SKILL:skill,OPENAI_API_KEY:'secret-fixture'};
 const run=(args=['--json'])=>spawnSync('/usr/bin/python3',[join(payload,'scripts/doctor'),...args],{env,encoding:'utf8',timeout:8000});
 return {run,command,payload,env,home,dir};
}
test('doctor resolves manifest payload and reports readiness without exposing or looking up secrets',t=>{
 const f=fixture(t),r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);const d=JSON.parse(r.stdout);
 assert.equal(d.checks.dependencies.setupRequired,false);assert.equal(d.checks.voice.keyConfigured,true);
 assert.equal(d.checks.agent.authentication,'UNVERIFIED');assert.equal(d.checks.voice.audioDevices,'UNVERIFIED');assert.equal(d.voiceReady,false);
 assert.ok(!r.stdout.includes('secret-fixture'));assert.ok(!r.stdout.includes('private transcript'));assert.equal(r.stderr,'');
});
test('doctor missing service returns nonzero with actionable non-secret output',t=>{
 const f=fixture(t);f.command('omarchy-shell','echo secret-fixture >&2; exit 1');
 const r=f.run();assert.notEqual(r.status,0);const d=JSON.parse(r.stdout);assert.equal(d.checks.service.available,false);
 assert.equal(d.checks.voice.keyConfigured,null);assert.match(d.checks.service.action,/enable|retry/);assert.ok(!r.stdout.includes('secret-fixture'));
});
test('doctor does not mistake unknown or false GUI agent availability for a terminal executable',t=>{
 const f=fixture(t);f.command('omarchy-shell',`[[ \"$*\" == \"io.github.komagata.oma status\" ]] || exit 1; echo '{"setupRequired":false,"keyConfigured":false,"agentBackend":"codex","agentOptions":[{"value":"codex","available":false}]}'`);
 const r=f.run();assert.notEqual(r.status,0);assert.equal(JSON.parse(r.stdout).checks.agent.executableAvailable,false);
});
test('doctor missing SDK and unavailable service remain separate checkpoints',t=>{
 const f=fixture(t);writeFileSync(join(f.payload,'scripts/check-setup.py'),'import json\nprint(json.dumps({"setupRequired":True,"setupMessage":"Missing: GPT-Live SDK"}))\n');
 f.command('omarchy-shell','exit 1');const r=f.run();assert.notEqual(r.status,0);const d=JSON.parse(r.stdout);
 assert.equal(d.checks.dependencies.setupRequired,true);assert.match(d.checks.dependencies.action,/setup/);assert.equal(d.checks.service.available,false);
});
test('dependency-ready installation without a saved key remains voice-unverified',t=>{
 const f=fixture(t);f.command('omarchy-shell',`echo '{"setupRequired":false,"keyConfigured":false,"agentBackend":"codex","agentOptions":[{"value":"codex","available":true}]}'`);
 const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);const d=JSON.parse(r.stdout);
 assert.equal(d.installationReady,true);assert.equal(d.voiceReady,false);assert.equal(d.checks.voice.keyConfigured,false);
 assert.equal(d.checks.agent.authentication,'UNVERIFIED');assert.equal(d.checks.voice.authentication,'UNVERIFIED');
});
test('doctor discovers the canonical system skill in a fresh HOME without personal links',t=>{
 const f=fixture(t);delete f.env.OMA_OMARCHY_SKILL;f.env.OMARCHY_PATH=join(f.dir,'omarchy');
 const skill=join(f.env.OMARCHY_PATH,'default/agents/skills/omarchy/SKILL.md');
 mkdirSync(join(skill,'..'),{recursive:true});writeFileSync(skill,'fixture');
 const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout).checks.omarchySkill.available,true);
});
test('doctor accepts override, personal and legacy skill files, rejects missing or directory candidates',t=>{
 const f=fixture(t);f.env.OMARCHY_PATH=join(f.dir,'omarchy');
 const candidates=[f.env.OMA_OMARCHY_SKILL,...['.agents/skills','.pi/agent/skills','.codex/skills'].map(base=>join(f.home,base,'omarchy/SKILL.md')),
  join(f.env.OMARCHY_PATH,'default/skills/omarchy/SKILL.md')];
 for(const skill of candidates){
  mkdirSync(join(skill,'..'),{recursive:true});writeFileSync(skill,'fixture');
  const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout).checks.omarchySkill.available,true);
  rmSync(skill);mkdirSync(skill);const missing=f.run();assert.equal(missing.status,1,missing.stdout+missing.stderr);
  assert.equal(JSON.parse(missing.stdout).checks.omarchySkill.available,false);rmSync(skill,{recursive:true});
 }
});
