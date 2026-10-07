import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildContext,CONTEXT_CHARACTER_BUDGET} from '../packages/core/context.js';
import {validateSeed} from './validate-seed.mjs';

const seed=validateSeed(JSON.parse(await readFile('data/research-seed.json','utf8')));
const sources=new Set(seed.sources.map(source=>source.id));
const cases=[
  {name:'Actuator bottleneck retrieves Westmag',query:'actuators',expected:'westmag'},
  {name:'Robot data workflow retrieves Foxglove',query:'robot data',expected:'foxglove'},
  {name:'Nuclear fuel retrieves General Matter',query:'nuclear fuel',expected:'general-matter'},
  {name:'Exact company query retrieves Modal',query:'Modal',expected:'modal'},
];
let passed=0;
function verifyPacket(packet){
  assert.ok(JSON.stringify(packet).length<=CONTEXT_CHARACTER_BUDGET,'Context exceeded serialized character cap');
  const included=new Set(packet.sources.map(source=>source.id));
  for(const record of packet.evidence){
    assert.ok(record.sourceIds.length>0,'Missing source attribution');
    for(const id of record.sourceIds){assert.ok(sources.has(id),'Unknown source ID');assert.ok(included.has(id),'Missing citation metadata');}
  }
}
for(const item of cases){
  const packet=buildContext(seed,{query:item.query});
  verifyPacket(packet);
  assert.ok(packet.evidence.slice(0,5).some(record=>record.id===item.expected),item.name);
  console.log(`PASS ${item.name}`);passed++;
}
for(const company of seed.companies){
  const packet=buildContext(seed,{companyId:company.id});verifyPacket(packet);
  assert.equal(packet.company.id,company.id);
  assert.ok(packet.evidence.some(record=>record.id===company.id));
  assert.ok(packet.evidence.filter(record=>record.kind==='company').every(record=>record.id===company.id));
  passed++;
}
const missing=buildContext(seed,{query:'notaresearchcompanyzz'});verifyPacket(missing);assert.equal(missing.evidence.length,0);passed++;
verifyPacket(buildContext(seed));passed++;
console.log(`PASS ${passed} retrieval cases. Citation integrity and serialized budget checked for every packet.`);
console.log('These are regression checks on a curated corpus, not investment-performance measurements.');
