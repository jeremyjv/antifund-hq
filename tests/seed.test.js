import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSeed} from '../scripts/validate-seed.mjs';

test('Public seed has valid provenance and explicit research versus portfolio relationships',async()=>{
  const seed=JSON.parse(await readFile(new URL('../data/research-seed.json',import.meta.url),'utf8'));
  assert.doesNotThrow(()=>validateSeed(seed));
  const broken=structuredClone(seed);broken.companies[0].sourceIds=['invented-source'];
  assert.throws(()=>validateSeed(broken),/unresolved/);
  const noPortfolioAttribution=structuredClone(seed);
  const company=noPortfolioAttribution.companies.find(item=>item.relationship==='portfolio');
  company.sourceIds=company.sourceIds.filter(id=>!noPortfolioAttribution.sources.find(source=>source.id===id).url.startsWith('https://antifund.com'));
  assert.throws(()=>validateSeed(noPortfolioAttribution));
  assert.ok(seed.sources.some(source=>/^\d{4}-\d{2}$/.test(source.publishedAt||'')),'Month-only publication precision should remain intact');
});
