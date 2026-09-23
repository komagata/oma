import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const mesh=JSON.parse(readFileSync(new URL('../assets/face.json',import.meta.url)));
test('mouth shapes move lips without moving the forehead, and preserve topology',()=>{
 assert.ok(mesh.shapes?.jawOpen, 'Articulated jaw shape is missing');
 for(const name of ['jawOpen','lipRound','lipWide']) {
  const shape=mesh.shapes[name];assert.equal(shape.length,mesh.vertices.length);
  assert.ok(shape.some(v=>v.some(n=>Math.abs(n)>.005)));
  for(let i=0;i<shape.length;i++) {
   assert.ok(shape[i].every(Number.isFinite));
   if(mesh.vertices[i][1]>.25) assert.ok(shape[i].every(n=>Math.abs(n)<1e-6),'Forehead and eyes must stay still');
  }
 }
 const z=mesh.vertices.map(v=>v[2]);assert.ok(Math.max(...z)-Math.min(...z)>1,'Head needs real side and rear volume');
});
