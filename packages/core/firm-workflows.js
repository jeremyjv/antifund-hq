// Product workflow definitions, not a record of deployed agents or firm activity.
export const agentWorkflows = [
  {id:'sourcing-scout',title:'Sourcing scout',purpose:'Turn technical signals into a shortlist worth reviewing.',input:'Approved GitHub, research, launch, and hiring feeds',output:'Candidates with evidence and a reason to investigate',review:'A person checks source quality and thesis fit before shortlisting.'},
  {id:'research-analyst',title:'Company researcher',purpose:'Prepare the evidence before a founder conversation.',input:'Company profile, primary sources, and thesis context',output:'A source-linked company research memo',review:'A person checks claims, omissions, and counterarguments.'},
  {id:'diligence-reviewer',title:'Diligence reviewer',purpose:'Find the claims that need a stronger proof point.',input:'Company claims, technical risks, and draft memo',output:'Unanswered questions and evidence to request',review:'An investor owns the judgment and next action.'},
];
export const operationWorkflows = [
  {id:'weekly-review',title:'Weekly portfolio review',purpose:'Bring changes, unanswered questions, and next actions into one review.',trigger:'Proposed: weekly',input:'Company updates + reviewed metrics + team notes',output:'A review agenda with an owner and next step for each item'},
  {id:'memo-review',title:'Investment memo review',purpose:'Check that a decision has evidence, counterarguments, and an accountable reviewer.',trigger:'Proposed: when a memo is ready',input:'Research memo + source trail + diligence findings',output:'A decision checklist and outstanding evidence requests'},
  {id:'quarterly-report',title:'Quarterly reporting',purpose:'Prepare a consistent reporting pack from reconciled company and fund records.',trigger:'Proposed: each quarter',input:'Approved fund data + valuations + portfolio updates',output:'A reporting checklist with review and sign-off'},
];
export function selectedFirmCompany(research, id) {
  return research.companies.find(c=>c.id===id) || research.companies.find(c=>c.relationship==='research') || research.companies[0];
}
export function firmWorkflowDraft(key, research, companyId) {
  const c=selectedFirmCompany(research,companyId);
  const sourceText=ids=>research.sources.filter(s=>ids.includes(s.id)).map(s=>`${s.title}: ${s.url} (checked ${s.checkedAt})`).join('\n');
  const base={type:'note',status:'open',companyId:null};
  const header='WORKFLOW PREVIEW — editable planning draft, not an agent run or completed review.\n';
  const questions=c.questions.map(q=>`- ${q}`).join('\n');
  const evidence=`\n\nPublic source evidence\n${sourceText(c.sourceIds)}`;
  switch(key) {
    case 'sourcing-plan':
      return {...base,title:'Sourcing plan — technical founders and emerging companies',body:`${header}\nResearch focus\n[Define the thesis and technical problem]\n\nSources to connect\n- GitHub: releases, contributors, and sustained development\n- Research papers: authors, methods, and reproducible results\n- Hiring: role mix and technical expansion\n- Launches: products, customer use cases, and distribution\n- Traffic and social: supporting signals, not proof of traction\n\nReview gates\n- Resolve the company and founder identity\n- Deduplicate signals and preserve source dates\n- Separate public claims from interpretation\n- Test thesis fit before adding to a shortlist\n\nOwner: [Unassigned]\nNext review: [Not scheduled]`};
    case 'sourcing-scout': {
      const candidates=research.companies.filter(c=>c.relationship==='research').slice(0,3);
      return {...base,type:'memo',title:'Sourcing scout — public research sample',body:`${header}\nThese are existing research examples, not newly discovered leads. No live collection was run.\n\n${candidates.map(x=>`${x.name}\n${x.summary}\n${x.thesisFit}\nNext question: ${x.questions[0]}\nSources:\n${sourceText(x.sourceIds)}`).join('\n\n')}\n\nReviewer: [Unassigned]\nDecision and rationale: [To complete]`};
    }
    case 'research-analyst':
      return {...base,type:'memo',companyId:c.id,title:`${c.name} — company research preview`,body:`${header}\nWhat the company does\n${c.summary}\n\nResearch interpretation\n${c.thesisFit}\n\nRisks to assess\n${c.risks.map(x=>`- ${x}`).join('\n')}\n\nQuestions\n${questions}${evidence}\n\nReviewer judgment\n[Add findings and counter-evidence]`};
    case 'diligence-reviewer':
      return {...base,companyId:c.id,title:`${c.name} — diligence review checklist`,body:`${header}\nClaims and risks to verify\n${c.risks.map(x=>`- ${x}\n  Evidence needed: [To request]\n  Result: [Not assessed]`).join('\n')}\n\nTechnical questions\n${questions}${evidence}\n\nReviewer: [Unassigned]\nDecision: [Not made]`};
    case 'meeting-prep':
      return {...base,companyId:c.id,title:`${c.name} — founder conversation plan`,body:`${header}\nMeeting date: [Not scheduled]\nParticipants: [Not entered]\nRelationship: [No contact or meeting implied]\n\nPurpose\nPressure-test the public research and understand the customer problem.\n\nQuestions to ask\n${questions}\n\nWhat would change our view?\n${c.risks.map(x=>`- ${x}`).join('\n')}${evidence}\n\nConversation notes\n[No conversation recorded]\n\nFollow-up owner: [Unassigned]\nNext action: [To decide]`};
    case 'metrics-request':
      return {...base,title:'Portfolio metrics — collection and review template',body:`${header}\nNo financial data is connected. Use sample values only in this public demo.\n\nCompany: [Select]\nReporting period: [Required]\nMetric and definition: [Required]\nValue and currency/unit: [Not provided]\nSource document: [Not connected]\nAs-of date: [Required]\nData owner: [Unassigned]\nReviewer: [Unassigned]\nReview status: [Not assessed]\n\nCompany inputs\n- Revenue and growth, with consistent definitions\n- Cash and runway\n- Latest financing terms and valuation\n\nFund inputs\n- Ownership, cost basis, and approved marks\n- Capital calls, distributions, NAV, and performance calculations\n\nComparable-company inputs\n- Comparable, relevant metric, valuation date, source, and adjustments\n\nReconciliation issues and next action\n[To complete]`};
    default: {
      const w=operationWorkflows.find(w=>w.id===key);
      if(!w)throw new Error('Unknown workflow');
      const tasks={
        'weekly-review':['Review dated company updates and source freshness','Collect outstanding company metrics','Flag changes and missing evidence','Assign each follow-up to an owner','Approve and share the review'],
        'memo-review':['Verify each material claim against its source','Separate assumptions from established facts','Review technical risks and counterarguments','Resolve missing evidence and conflicts','Record the reviewer, decision, and rationale'],
        'quarterly-report':['Confirm the reporting period and audience','Reconcile fund records with the administrator','Review company updates and valuation methodology','Approve marks and reporting calculations','Record sign-off before distributing the report'],
      }[key];
      return {...base,title:w.title+' — planning checklist',body:`${header}\n${w.purpose}\n\n${w.trigger} — not scheduled\nInputs: ${w.input}\nOutput: ${w.output}\n\nChecklist\n${tasks.map(t=>`[ ] ${t}`).join('\n')}\n\nOwner: [Unassigned]\nDue date: [Not set]\nApprover: [Unassigned]\n\nNotes and evidence\n[To complete]`};
    }
  }
}
