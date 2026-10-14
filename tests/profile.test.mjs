import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
import {createAgentBackends} from '../runtime/agent-backends.mjs';
import {omaProfile,profileSkills} from '../runtime/profile.mjs';
import {liveConfig} from '../runtime/live-config.mjs';

for(const backend of ['codex','claude','hermes','openclaw'])for(const [language,label] of [['en','English'],['ja','Japanese']]){
 test(`live voice identifies as Oma and retains written O.M.A. branding during delegated readback (${backend}, ${language})`,()=>{
  const config=liveConfig({facts:()=>[],get:key=>key==='agentBackend'?backend:key==='responseLanguage'?language:null},{OMA_OMARCHY_SKILL:new URL('../skills/oma/SKILL.md',import.meta.url).pathname,OMA_LIVE_VOICE:'marin'});
  assert.match(config.instructions,/^You are Oma\./);
  assert.match(config.instructions,/Oma is your natural spoken name \(OH-mah in English, オーマ in Japanese\)/);
  assert.match(config.instructions,/Use O\.M\.A\. only as the written UI brand\. In Japanese reply text, write your own name as オーマ so it is spoken オーマ\. When asked who or what you are in Japanese, begin exactly with 私はオーマです。 Never put O\.M\.A\. in Japanese reply text\./);
  assert.match(config.instructions,/When reading delegated answers and agent commentary, replace the written brand O\.M\.A\. with your spoken name Oma\./);
  assert.match(config.instructions,/preserve the factual wording of short answers/);
  assert.doesNotMatch(config.instructions,/You are O\.M\.A\.|Name pronunciation rule:|ˈoʊmɑː|individual letters O, M, A|while applying the name pronunciation rule/);
  assert.match(config.instructions,new RegExp(`Reply in ${label}`));
  assert.match(config.instructions,/Delegate user questions and action requests/);
  assert.equal(config.model,'gpt-live-1');assert.equal(config.store,false);
  assert.deepEqual(config.audio,{format:{type:'audio/pcm',rate:24000},output:{voice:'marin'}});
  assert.deepEqual(config.delegation,{type:'client'});
 });
}

test('O.M.A. skills describe GPT-Live and local tools',()=>{
 assert.deepEqual(profileSkills,['oma','oma-camera']);
 assert.match(omaProfile,/private OMA MCP/);assert.match(omaProfile,/camera_snapshot/);
 assert.match(omaProfile,/Omarchy skill/);assert.doesNotMatch(omaProfile,/delegate.*run_task/);assert.match(omaProfile,/Codex CLI/);
});

test('the loaded OMA skill identifies spoken and written aliases as the assistant itself',()=>{
 assert.match(omaProfile,/Your own name is/);for(const alias of ['O.M.A.','OMA','OH-mah','オーマ'])assert.ok(omaProfile.includes(alias));assert.match(omaProfile,/not your personal name/);
});
test('loaded OMA skill routes transcript opening to the portable CLI',()=>{
 assert.match(omaProfile,/oma transcript --today/);assert.match(omaProfile,/oma transcript --follow/);assert.match(omaProfile,/ログを見せて/);assert.match(omaProfile,/xdg-open/);
});

test('voice routes requests to the selected agent and keeps backend procedures out of the speech prompt',async()=>{
 const {liveConfig}=await import('../runtime/live-config.mjs');const config=liveConfig({facts:()=>[],get:()=>null});
 assert.match(config.instructions,/Delegate user questions and action requests/);assert.match(config.instructions,/Do not claim an action succeeded before its result/);
 assert.doesNotMatch(config.instructions,/new_text_document|oma transcript --today/);
 assert.match(omaProfile,/new_text_document/);assert.match(omaProfile,/oma transcript --today/);
 assert.doesNotMatch(omaProfile,/Delegate to the backend when:|Do not delegate to the backend when:/);assert.match(omaProfile,/execute.*tools directly/i);
});
test('voice describes private MCP capabilities without promising tools to Hermes or OpenClaw',async()=>{
 const {omaClientDelegationInstructions}=await import('../runtime/profile.mjs');
 assert.match(omaClientDelegationInstructions,/Codex.*Claude.*OMA.*MCP/);
 assert.match(omaClientDelegationInstructions,/Hermes.*OpenClaw.*do not/);
 assert.doesNotMatch(omaClientDelegationInstructions,/External agents do not receive/);
 assert.match(omaClientDelegationInstructions,/local confirmation buttons/);
});
test('Live status reports the selected CLI separately from GPT-Live voice and ignores obsolete model overrides',()=>{
 const source=readFileSync(new URL('../runtime/main-live.mjs',import.meta.url),'utf8');const status=source.slice(source.indexOf('function status()'),source.indexOf('\nconst tools='));
 for(const [backend,label] of [['','Codex CLI'],['codex','Codex CLI'],['claude','Claude Code'],['hermes','Hermes Agent'],['openclaw','OpenClaw']]){
  let emitted;const memory={get:key=>key==='agentBackend'?backend:''};
  runInNewContext(status+';status();',{process:{env:{OMA_BACKEND_MODEL:'obsolete'}},key:'fictional',findOmarchySkill:()=>'/fixture',languageOptions:()=>[],voiceEffectsEnabled:()=>true,agentRegistry:createAgentBackends(),memory,emit:value=>{emitted=value}});
  assert.equal(emitted.modelName,label);assert.equal(emitted.modelProvider,label);assert.equal(emitted.agentBackend,backend||'codex');assert.equal(emitted.voiceProvider,'gpt-live');assert.equal(emitted.keyConfigured,true);
 }
});
