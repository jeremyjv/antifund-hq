import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardSnapshot} from '../packages/core/dashboard.js';

test('dashboard uses snapshot dates, excludes future events, and keeps undated evidence separate', () => {
  const r = {checkedAt:'2026-10-07', companies:[{id:'a',relationship:'portfolio'},{id:'b',relationship:'research'}], signals:[
    {id:'start',companyId:'a',observedAt:'2026-09-08'},
    {id:'old',companyId:'a',observedAt:'2026-09-07'},
    {id:'now',companyId:'a',observedAt:'2026-10-07'},
    {id:'research',companyId:'b',observedAt:'2026-10-01'},
    {id:'future',companyId:'a',observedAt:'2026-10-08'},
    {id:'unknown',companyId:'b',observedAt:null},
    {id:'month',companyId:'b',observedAt:'2026-10'},
  ]};
  const d=dashboardSnapshot(r);
  assert.deepEqual(d.recent.map(s=>s.id),['now','research','start']);
  assert.deepEqual(d.undated.map(s=>s.id),['unknown','month']);
  assert.equal(d.portfolioCount,1);
  assert.equal(r.signals[0].id,'start');
});
