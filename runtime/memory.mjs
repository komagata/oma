import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
export function bounded(text, bytes) {
 let out=''; let used=0;
 for(const ch of String(text)){const n=Buffer.byteLength(ch); if(used+n>bytes)break;out+=ch;used+=n;}
 return out;
}
export class Memory {
 constructor(path){
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  this.db=new DatabaseSync(path); chmodSync(path,0o600); this.revision=0;this.compacting=false;
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
   CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,at TEXT NOT NULL,role TEXT NOT NULL,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS facts(key TEXT PRIMARY KEY,value TEXT NOT NULL,at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS actions(id INTEGER PRIMARY KEY,at TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
 }
 get(key){return this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value || '';}
 set(key,value){this.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(key,String(value));}
 add(role,body){if(!body)return;this.db.prepare('INSERT INTO events(at,role,body) VALUES(?,?,?)').run(new Date().toISOString(),role,bounded(body,24000));}
 action(kind,body,status){this.db.prepare('INSERT INTO actions(at,kind,body,status) VALUES(?,?,?,?)').run(new Date().toISOString(),kind,JSON.stringify(body),status);}
 lastUrl(){const row=this.db.prepare("SELECT * FROM actions WHERE kind='open_url' AND status='completed' ORDER BY id DESC LIMIT 1").get();return row?{...JSON.parse(row.body),at:row.at}:null;}
 remember(key,value){if(!key?.trim()||!value?.trim())throw Error('Both key and value are required');this.db.prepare('INSERT OR REPLACE INTO facts VALUES(?,?,?)').run(bounded(key,200),bounded(value,3000),new Date().toISOString());this.revision++;this.set('summary','');}
 facts(){return this.db.prepare('SELECT * FROM facts ORDER BY at DESC LIMIT 100').all();}
 search(query){const q='%'+String(query).replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')+'%';
  const e=this.db.prepare("SELECT at,role,body FROM events WHERE body LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 8").all(q);
  const a=this.db.prepare("SELECT at,kind AS role,body FROM actions WHERE body LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 8").all(q);
  const f=this.db.prepare("SELECT at,key AS role,value AS body FROM facts WHERE key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\' LIMIT 8").all(q,q);
  return [...f,...a,...e];
 }
 forget(query){if(!query?.trim())throw Error('Specify what to forget');const q='%'+query.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')+'%';this.revision++;
  this.db.exec('BEGIN');try{
   for(const table of ['events','actions'])this.db.prepare(`DELETE FROM ${table} WHERE body LIKE ? ESCAPE '\\'`).run(q);
   this.db.prepare("DELETE FROM facts WHERE key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\'").run(q,q);
   this.set('taskCheckpoint','');this.set('summary','');this.set('summaryThrough',0);this.set('thread','');this.db.exec('COMMIT');this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 context(query='',budget=18000){
  const recent=this.db.prepare('SELECT at,role,body FROM events ORDER BY id DESC LIMIT 12').all();
  // Allocate independent budgets, so a long old message cannot evict a new request.
  const sections=[
   ['Last opened URL',this.lastUrl(),.15],
   ['Facts (newest wins)',this.facts(),.20],
   ['Recent conversation (newest first)',recent,.25],
   ['Relevant history',query?this.search(query):[],.20],
   ['Earlier summary',this.get('summary'),.05],
   ['Task checkpoint (may be interrupted; verify before repeating actions)',this.get('taskCheckpoint'),.15]
  ];
  return bounded(sections.map(([label,value,share])=>label+': '+bounded(JSON.stringify(value),Math.max(0,Math.floor(budget*share)-100))).join('\n'),budget);
 }
 async compact(summarize,keep=12){
  if(this.compacting)return false;
  const all=this.db.prepare('SELECT * FROM events WHERE id>? ORDER BY id').all(Number(this.get('summaryThrough')||0));
  if(all.length<=keep)return false;const rows=all.slice(0,-keep);const rev=this.revision;this.compacting=true;
  try{const summary=await summarize(bounded(JSON.stringify({previous:this.get('summary'),events:rows}),48000));
   if(rev!==this.revision)return false;
   this.set('summary',bounded(summary,6000));this.set('summaryThrough',rows.at(-1).id);return true;
  }finally{this.compacting=false;}
 }
 needsCompaction(){return this.db.prepare('SELECT COALESCE(SUM(length(body)),0) AS n FROM events WHERE id>?').get(Number(this.get('summaryThrough')||0)).n>10000;}
 close(){this.db.close();}
}
