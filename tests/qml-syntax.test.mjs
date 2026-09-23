import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {existsSync,readdirSync} from 'node:fs';
const parser='/usr/lib/qt6/bin/qmlformat';
test('every top-level QML component parses, including the live overlay', {skip:!existsSync(parser)},()=>{
 const root=new URL('../',import.meta.url);
 for(const name of readdirSync(root).filter(name=>name.endsWith('.qml'))){
  execFileSync(parser,[new URL(name,root).pathname],{stdio:['ignore','ignore','pipe']});
 }
});
