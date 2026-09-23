import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {restartAssistant} from '../runtime/restart.mjs';
test('self restart is scheduled outside the worker and never restarts the bar',async()=>{
 const calls=[];const result=await restartAssistant(async(...args)=>calls.push(args));
 assert.equal(result.scheduled,true);assert.equal(calls[0][0],'systemd-run');
 assert.ok(calls[0][1].includes('--on-active=2s'));assert.ok(!calls[0][1].includes('--scope'));
 assert.ok(calls[0][1].at(-1).endsWith('/restart_oma.py'));
 const code=`import importlib.util,json
spec=importlib.util.spec_from_file_location('restart','runtime/restart_oma.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
calls=[]
def run(*args):
 calls.append(args)
 return '{"state":"idle","panelOpened":true}' if args[-1]=='status' else 'ok'
m.restart(run,lambda _:None)
assert ('omarchy','plugin','disable',m.PLUGIN) in calls
assert ('omarchy','plugin','enable',m.PLUGIN) in calls
assert ('omarchy-shell',m.PLUGIN,'open') in calls
assert not any('restart' in c or 'kill' in c for c in calls)
print('ok')`;
 assert.equal(execFileSync('python3',['-c',code],{cwd:new URL('..',import.meta.url)}).toString().trim(),'ok');
});
