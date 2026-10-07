import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {marketOverview} from '../packages/core/market-overview.js';
import {validateSeed} from '../scripts/validate-seed.mjs';
import {buildContext} from '../packages/core/context.js';
test('market candidates have sourced metrics, exclude published holdings, and retain qualifiers',async()=>{
  const seed=JSON.parse(await readFile(new URL('../data/research-seed.json',import.meta.url),'utf8'));
  const exclusions=JSON.parse(await readFile(new URL('../data/portfolio-exclusions.json',import.meta.url),'utf8'));
  const {rows}=marketOverview(validateSeed(seed));
  assert.equal(rows.length,6);
  for(const row of rows){
    assert.ok(!exclusions.names.some(n=>n.toLowerCase()===row.company.name.toLowerCase()));
    assert.equal(row.source.checkedAt,'2026-10-07');
    assert.ok(row.company.sourceIds.includes(row.source.id));
    assert.ok(buildContext(seed,{companyId:row.companyId}).sources.some(s=>s.id===row.source.id));
  }
  assert.equal(rows.find(r=>r.companyId==='radiant').lowerBound,true);
  assert.equal(rows.find(r=>r.companyId==='rerun').source.publishedAt,null);
  const broken=structuredClone(seed);broken.marketMetrics[0].companyId='modal';
  assert.throws(()=>validateSeed(broken),/must be research/);
  assert.equal(marketOverview(broken).rows.length,5);
});
