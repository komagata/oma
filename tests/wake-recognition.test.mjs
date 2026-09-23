import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const script=`import sys,json
sys.path.insert(0,'runtime')
from wake_match import is_wake
print(json.dumps([is_wake(r) for r in json.load(sys.stdin)]))`;
const result=(text,words)=>({text,result:words.map(([word,conf])=>({word,conf}))});
test('recognizes the observed Japanese call without accepting weak prefixes or unrelated speech',()=>{
 const samples=[
  result('ヘイ 大間',[['ヘイ',1],['大間',.672]]),
  result('ヘイ オー マ',[['ヘイ',.99],['オー',.75],['マ',.76]]),
  result('ヘイ オマ',[['ヘイ',.95],['オマ',.95]]),
  result('ヘイ 大間',[['ヘイ',.60],['大間',1]]),
  result('ヘイ 大間',[['ヘイ',1],['大間',.4]]),
  result('ヘイ 大間',[['ヘイ',.85],['大間',.56]]),
  result('大間',[['大間',1]]),
  result('ヘイ [unk] 大間',[['ヘイ',1],['[unk]',1],['大間',1]]),
  {text:'ヘイ 大間',result:[]},
 ];
 const p=spawnSync('python3',['-c',script],{cwd:new URL('..',import.meta.url),input:JSON.stringify(samples),encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 assert.deepEqual(JSON.parse(p.stdout),[true,true,true,false,false,false,false,false,false]);
});
