import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('face is a triangulated 3D mesh with a jaw morph and a dark mouth cavity',()=>{
 let mesh;try{mesh=JSON.parse(readFileSync(new URL('../assets/face.json',import.meta.url)))}catch{}
 assert.ok(mesh,'Face mesh missing');assert.ok(mesh.vertices.length>50);assert.ok(mesh.triangles.length>80);assert.ok(new Set(mesh.vertices.map(v=>v[2])).size>8);
 assert.ok(mesh.jaw.some(w=>w>0));assert.ok(mesh.mouth.length>=6);
 for(const t of mesh.triangles){assert.equal(t.length,4);for(const i of t.slice(0,3))assert.ok(i>=0&&i<mesh.vertices.length);}
});
