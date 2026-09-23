// The worker inherits the desktop session environment, not a terminal's locale.
export function resolveLocale(env=process.env){
 const raw=env.LC_ALL||env.LC_MESSAGES||env.LANG||'';
 const tag=raw.split('.')[0].split('@')[0].replaceAll('_','-');
 if(!tag||tag==='C'||tag==='POSIX')return null;
 try{return Intl.getCanonicalLocales(tag)[0]||null;}catch{return null;}
}
export function languageInstruction(locale){
 let language;
 try{language=locale&&new Intl.DisplayNames(['en'],{type:'language'}).of(locale);}catch{}
 return language
  ? `The user's desktop locale is ${locale}. Reply in ${language}, including speech, greetings, subtitles and task reports, unless the user explicitly requests another language. English UI labels, old conversations and tool output do not change the response language.`
  : "Reply in the user's language, unless they explicitly request another language. Do not infer English from UI labels or tool output.";
}
export const greetingSource='Awaiting your command.';
export const restoreSourceEn='Restoring the previous session.';
export const reconnectSourceEn='Restart complete. Let’s continue.';
export function greetingInstruction(locale){
 const lang=locale?.split('-')[0];
 const wording=lang==='en'
  ? `Say exactly: "${greetingSource}".`
  : `Translate this single English source line into the response language for locale ${locale||'undetermined (use the user language)'}: "${greetingSource}". Speak only the translation. Preserve the brief science-fiction system identity and make it sound like a natural response to being called. Make it natural and concise, conveying that the user can now speak their request; do not add a separate greeting or an explanation.`;
 return `${languageInstruction(locale)} Use a cool, composed, computer-like voice with clear articulation. Greet the user as O.M.A. opens. ${wording} Do not answer earlier requests or call tools.`;
}
export function restoreInstruction(locale,summary=''){
 const intro=restoreSourceEn;
 const cleanSummary=String(summary||'').trim().slice(0,400);
 const summaryLine=cleanSummary.length>0
  ? `Summary: ${cleanSummary}`
  : '';
 const speak=[intro,summaryLine].filter(Boolean).join('\n');
 return `${languageInstruction(locale)} Use a cool, composed, computer-like voice with clear articulation. Translate the following English source lines naturally into the response language and speak only the translation. Do not answer earlier requests or call tools.\n${JSON.stringify(speak)}`;
}
export function reconnectInstruction(locale){
 const speak=reconnectSourceEn;
 return `${languageInstruction(locale)} Use a cool, composed, computer-like voice with clear articulation. Translate the following English source line naturally into the response language and speak only the translation. Do not answer earlier requests or call tools.\n${JSON.stringify(speak)}`;
}
