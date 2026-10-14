import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const guide=readFileSync(new URL('../docs/INSTALL.md',import.meta.url),'utf8');
const resolver=guide.match(/payload="\$\(python3 - "\$plugin" <<'PY'\n([\s\S]*?)\nPY\n\)"/)[1];
for(const layout of ['qml/Service.qml','builds/hash with spaces/qml/Service.qml'])test('documented payload resolver executes for '+layout,t=>{
 const plugin=mkdtempSync(join(tmpdir(),'oma install guide '));t.after(()=>rmSync(plugin,{recursive:true,force:true}));
 mkdirSync(join(plugin,layout,'..'),{recursive:true});
 writeFileSync(join(plugin,'manifest.json'),JSON.stringify({id:'io.github.komagata.oma',entryPoints:{service:layout}}));
 const r=spawnSync('/usr/bin/python3',['-c',resolver,plugin],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),join(plugin,layout,'../..'));
});
test('documented resolver refuses another plugin ID',t=>{
 const plugin=mkdtempSync(join(tmpdir(),'oma-guide-other-'));t.after(()=>rmSync(plugin,{recursive:true,force:true}));
 writeFileSync(join(plugin,'manifest.json'),JSON.stringify({id:'other',entryPoints:{service:'qml/Service.qml'}}));
 assert.notEqual(spawnSync('/usr/bin/python3',['-c',resolver,plugin],{encoding:'utf8'}).status,0);
});
test('public installation links are available near README start and agent entry point',()=>{
 const readme=readFileSync(new URL('../README.md',import.meta.url),'utf8');
 assert.ok(readme.indexOf('(docs/INSTALL.md)')<readme.indexOf('## Choose a task agent'));
 assert.match(readFileSync(new URL('../AGENTS.md',import.meta.url),'utf8'),/docs\/INSTALL.md/);
 assert.doesNotMatch(guide,/\/home\/komagata/);
});
