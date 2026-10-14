import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
test('development notice wake is marked while voice wake retains its ordinary event',()=>{
 const runtime=readFileSync(new URL('../runtime/main-live.mjs',import.meta.url),'utf8');
 const noticeWake=runtime.match(/const devNoticeDelivery=.*wake:(\(\)=>emit\(\{[^}]+\}\))/)?.[1];
 const voiceWake=runtime.match(/const wake=new WakeListener.*onWake:(\(\)=>\{emit\(\{[^}]+\}\)\})/)?.[1];
 assert.ok(noticeWake,'Missing development notice wake callback');
 assert.ok(voiceWake,'Missing voice wake callback');
 for(const [callback,expected] of [[noticeWake,{wakeDetected:true,developmentNotice:true}],[voiceWake,{wakeDetected:true}]]){
  const events=[];
  vm.runInNewContext(`(${callback})()`,{emit:event=>events.push(JSON.parse(JSON.stringify(event)))});
  assert.deepEqual(events,[expected]);
 }
});
test('development notices open silently without greeting while voice wake still greets',()=>{
 const qml=readFileSync(new URL('../qml/Service.qml',import.meta.url),'utf8');
 const update=qml.match(/function update\(line\) \{([\s\S]*?)\n    \}\n    Timer/)?.[1];
 const show=qml.match(/function show\(greeting, silent\) \{ (.*) \}/)?.[1];
 assert.ok(update,'Missing runtime update handler');assert.ok(show,'Missing shell summon bridge');
 for(const [event,expectedArgs,expectedPayload] of [
  [{wakeDetected:true,developmentNotice:true},[false,true],{greet:false,silent:true}],
  [{wakeDetected:true},[true],{greet:true,silent:false}],
  [{wakeDetected:true,developmentNotice:false},[true],{greet:true,silent:false}],
  [{developmentNotice:true},null,null]
 ]){
  const calls=[],payloads=[],root={revision:0,error:''};
  vm.runInNewContext(`(function(){${update}})()`,{alive:true,line:JSON.stringify(event),root,show:(...args)=>{
   calls.push(args);
   vm.runInNewContext(show,{greeting:args[0],silent:args[1],shell:{summon:(id,payload)=>{
    assert.equal(id,'io.github.komagata.oma');payloads.push(JSON.parse(payload));
   }}});
  }});
  assert.equal(root.error,'');assert.equal(root.revision,1);
  assert.deepEqual(calls,expectedArgs?[expectedArgs]:[]);
  assert.deepEqual(payloads,expectedPayload?[expectedPayload]:[]);
 }
});
test('an external agent can synchronize the same computer-use visibility state',()=>{
 const qml=readFileSync(new URL('../qml/Service.qml',import.meta.url),'utf8');
 const body=qml.match(/function computerUse\(active: bool\): void \{([^}]+)\}/)?.[1];
 assert.ok(body,'Missing computer-use visibility bridge');
 const root={computerUsing:false};
 vm.runInNewContext(body,{root,active:true});assert.equal(root.computerUsing,true);
 vm.runInNewContext(body,{root,active:false});assert.equal(root.computerUsing,false);
});
test('sending to an open assistant does not re-summon it and steal editor focus',()=>{
 const qml=readFileSync(new URL('../qml/Service.qml',import.meta.url),'utf8');
 const body=qml.match(/function send\(text: string\): void \{ (.*) \}/)[1];
 for(const panelOpened of [true,false]){
  const calls=[];const root={panelOpened,show(){calls.push('show')},command(value){calls.push(value.text)}};
  vm.runInNewContext(body,{root,text:'hello'});
  assert.deepEqual(calls,panelOpened?['hello']:['show','hello']);
 }
});
test('voice test controls use the same setters as Settings',()=>{
 const qml=readFileSync(new URL('../qml/Service.qml',import.meta.url),'utf8');
 for(const [method,setter,value] of [['responseLanguage','setResponseLanguage','en'],['microphone','setMicrophone','test-source']]){
  const body=qml.match(new RegExp('function '+method+'\\(value: string\\): void \\{([^}]+)\\}'))?.[1];
  assert.ok(body,'Missing '+method);let received;
  vm.runInNewContext(body,{value,root:{[setter](v){received=v}}});assert.equal(received,value);
 }
});

test('voice effects setter and IPC use backend authority rather than local toggle state',()=>{
 const qml=readFileSync(new URL('../qml/Service.qml',import.meta.url),'utf8');
 const setter=qml.match(/function setVoiceEffects\(enabled\) \{ ([^\n]+) \}/)?.[1];assert.ok(setter);const sent=[];vm.runInNewContext(setter,{enabled:false,command:c=>sent.push(JSON.stringify(c))});assert.equal(sent[0],JSON.stringify({action:'setVoiceEffects',enabled:false}));
 const ipc=qml.match(/function voiceEffects\(enabled: bool\): void \{([^}]+)\}/)?.[1];assert.ok(ipc);let value;vm.runInNewContext(ipc,{enabled:true,root:{setVoiceEffects(v){value=v}}});assert.equal(value,true);
 assert.match(qml,/property bool voiceEffectsEnabled: true/);assert.match(qml,/"wakeEnabled", "voiceEffectsEnabled", "wakeStatus"/);assert.match(qml,/voiceEffectsEnabled: root.voiceEffectsEnabled/);
});
