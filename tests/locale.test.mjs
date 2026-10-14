import test from 'node:test';
import assert from 'node:assert/strict';
const localeModule=await import('../runtime/locale.mjs').catch(()=>({}));
test('desktop locale precedence and POSIX fallback',()=>{
 assert.equal(typeof localeModule.resolveLocale,'function');
 assert.equal(localeModule.resolveLocale({LANG:'ja_JP.UTF-8'}),'ja-JP');
 assert.equal(localeModule.resolveLocale({LC_ALL:'de_DE.UTF-8',LC_MESSAGES:'fr_FR',LANG:'ja_JP'}),'de-DE');
 assert.equal(localeModule.resolveLocale({LC_MESSAGES:'en_US.UTF-8',LANG:'ja_JP'}),'en-US');
 assert.equal(localeModule.resolveLocale({LANG:'C.UTF-8'}),null);
 assert.equal(localeModule.resolveLocale({LANG:'invalid / instruction'}),null);
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
test('input transcription follows the locale independently of response instructions',()=>{
 for(const [locale,language] of [['en-US','en'],['en-GB','en'],['ja-JP','ja'],['fr-FR','fr']]){
  assert.equal(localeModule.transcriptionLanguage(locale),language);
 }
 assert.equal(localeModule.transcriptionLanguage(null),undefined);
});
test('saved response language overrides locale and system default follows it',async()=>{
 const {responseLocale,languageOptions,validateResponseLanguage}=await import('../runtime/locale.mjs');
 const env={LANG:'ja_JP.UTF-8'};
 assert.equal(responseLocale('',env),'ja-JP');
 assert.equal(responseLocale('de',env),'de');
 assert.equal(validateResponseLanguage('ja'),'ja');
 assert.throws(()=>validateResponseLanguage('ignore instructions'));
 assert.match(languageOptions(env)[0].label,/Japanese/);
 assert.ok(languageOptions(env).some(x=>x.value==='ja'));
 const {liveConfig}=await import('../runtime/live-config.mjs');
 const config=liveConfig({facts:()=>[],get:k=>k==='responseLanguage'?'de':null},env);
 assert.deepEqual(config.delegation,{type:'client'});
 assert.match(config.instructions,/Reply in German/);
 assert.doesNotMatch(config.instructions,/desktop locale is de/);
});
