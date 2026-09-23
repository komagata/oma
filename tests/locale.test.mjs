import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionConfig,Oma} from '../runtime/oma.mjs';
const localeModule=await import('../runtime/locale.mjs').catch(()=>({}));
test('desktop locale precedence and POSIX fallback',()=>{
 assert.equal(typeof localeModule.resolveLocale,'function');
 assert.equal(localeModule.resolveLocale({LANG:'ja_JP.UTF-8'}),'ja-JP');
 assert.equal(localeModule.resolveLocale({LC_ALL:'de_DE.UTF-8',LC_MESSAGES:'fr_FR',LANG:'ja_JP'}),'de-DE');
 assert.equal(localeModule.resolveLocale({LC_MESSAGES:'en_US.UTF-8',LANG:'ja_JP'}),'en-US');
 assert.equal(localeModule.resolveLocale({LANG:'C.UTF-8'}),null);
 assert.equal(localeModule.resolveLocale({LANG:'invalid / instruction'}),null);
});
test('session response language follows locale instead of forcing English',()=>{
 assert.match(sessionConfig('', 'ja-JP').instructions,/Japanese/);
 assert.doesNotMatch(sessionConfig('', 'ja-JP').instructions,/Speak English/);
 assert.match(sessionConfig('', 'fr-FR').instructions,/French/);
 assert.match(sessionConfig('', null).instructions,/user.*language/i);
});
test('Japanese opening overrides old English conversation context',async()=>{
 const events=[];
 const oma=new Oma({locale:'ja-JP',memory:{},audio:{},emit(){}});
 oma.connect=async()=>{};oma.send=e=>events.push(e);
 await oma.greet();
 assert.match(events[0].response.instructions,/Japanese/);
 assert.doesNotMatch(events[0].response.instructions,/Say exactly: "Systems online/);
});
test('greeting has one English source and translates it for other locales',()=>{
 const english=localeModule.greetingInstruction('en-US');
 assert.match(english,/Say exactly: "Awaiting your command\."/);
 for(const locale of ['ja-JP','fr-FR','de-DE']){
  const instruction=localeModule.greetingInstruction(locale);
  assert.match(instruction,/Awaiting your command\./);
  assert.match(instruction,/Translate/);
  assert.ok(instruction.includes(locale));
  assert.doesNotMatch(instruction,/[ぁ-んァ-ン一-龯]/);
 }
});
