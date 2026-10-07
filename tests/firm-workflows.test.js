import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {firmWorkflowDraft,agentWorkflows,operationWorkflows} from '../packages/core/firm-workflows.js';
import {recordCreate} from '../packages/core/schema.js';
const research=JSON.parse(readFileSync(new URL('../data/research-seed.json',import.meta.url)));

test('every firm workflow produces a valid unsaved record with explicit preview boundaries',()=>{
  const keys=['sourcing-plan','meeting-prep','metrics-request',...agentWorkflows.map(x=>x.id),...operationWorkflows.map(x=>x.id)];
  for(const key of keys){
    const result=firmWorkflowDraft(key,research,'modal');
    assert.equal(recordCreate.safeParse(result).success,true,key);
    assert.match(result.body,/WORKFLOW PREVIEW/);
    assert.equal(result.status,'open');
    assert.equal('id' in result,false);
  }
  assert.throws(()=>firmWorkflowDraft('unknown',research),/Unknown workflow/);
});

test('company selection carries the right questions and primary sources into a draft',()=>{
  const result=firmWorkflowDraft('meeting-prep',research,'general-matter');
  const c=research.companies.find(c=>c.id==='general-matter');
  assert.equal(result.companyId,c.id);
  assert.ok(result.body.includes(c.questions[0]));
  for(const id of c.sourceIds)assert.ok(result.body.includes(research.sources.find(s=>s.id===id).url));
  assert.match(result.body,/No conversation recorded/);
  assert.doesNotMatch(result.body,/How predictable are queue time/);
});
