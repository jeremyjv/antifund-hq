import {agentWorkflows, operationWorkflows, selectedFirmCompany} from '../../packages/core/firm-workflows.js';

export function renderFirmPage(view, ui) {
  const {state,esc,heading,btn,icon,mark,external,date,relationship}=ui;
  const r=state.research;
  const selected=selectedFirmCompany(r,state.firmCompany);
  const preview=(key,label='Preview workflow')=>btn('workflow-preview',`${esc(label)} ${icon('arrow')}`,'',`data-id="${esc(key)}"`);
  const draft=(key,label)=>btn('workflow-draft',`${icon('plus')} ${esc(label)}`,'primary',`data-id="${esc(key)}"`);
  const status=(text)=>`<span class="firm-status">${esc(text)}</span>`;
  const banner=(text)=>`<div class="firm-context">${icon('grid')}<span>${esc(text)}</span></div>`;
  const companySelect=()=>`<div class="firm-selector"><label for="firm-company">Explore a company</label><select id="firm-company">${r.companies.map(c=>`<option value="${esc(c.id)}" ${selected.id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>${relationship(selected)}</div>`;
  const sourceLinks=ids=>r.sources.filter(s=>ids.includes(s.id)).map(s=>external(s.url,s.publisher)).join(' ');
  const workflowCard=(w,kind)=>`<article class="firm-card"><div class="firm-card-top">${icon(kind==='agent'?'spark':'clock')}${status(kind==='agent'?'Not deployed':'Not scheduled')}</div><h2>${esc(w.title)}</h2><p>${esc(w.purpose)}</p><dl><dt>Inputs</dt><dd>${esc(w.input)}</dd><dt>Output</dt><dd>${esc(w.output)}</dd><dt>${kind==='agent'?'Review gate':'Trigger'}</dt><dd>${esc(kind==='agent'?w.review:w.trigger)}</dd></dl>${preview(w.id,kind==='agent'?'Preview example output':'Preview checklist')}</article>`;
  if(view==='sourcing') {
    const candidates=r.companies.filter(c=>c.relationship==='research');
    const repositories=r.sources.filter(s=>s.url.startsWith('https://github.com/'));
    return `${heading('Sourcing','Find the people building what comes next.','Bring technical signals together, investigate the company, and decide who belongs on your shortlist.',draft('sourcing-plan','Draft sourcing plan'))}
      ${banner('Public research examples are ready to explore. Live feeds and proprietary datasets are not connected.')}
      <section class="firm-flow" aria-label="Sourcing workflow"><span>01 · Collect signals</span><span>02 · Check thesis fit</span><span>03 · Review evidence</span><span>04 · Shortlist</span></section>
      <div class="firm-section-title"><h2>A place for every signal</h2><span>Proposed inputs</span></div>
      <div class="firm-source-grid"><article class="firm-card compact"><h3>GitHub & open source</h3>${status('Public reference links')}<p>Inspect releases, contributors, and the work behind the claims.</p><div class="firm-source-links">${repositories.map(s=>external(s.url,s.title.replace(' open source repository',''))).join('')}</div></article>
      <article class="firm-card compact"><h3>Research & launches</h3>${status('Curated snapshot')}<p>Published technical work and product announcements already inform the dashboard.</p><a class="text-link" href="#overview">Review public updates ${icon('arrow')}</a></article>
      <article class="firm-card compact"><h3>Hiring, traffic & social</h3>${status('Not connected')}<p>Planned supporting signals for technical hiring, adoption, and founder discovery.</p>${preview('sourcing-plan','See collection plan')}</article></div>
      <div class="firm-section-title"><h2>Explore research candidates</h2><span>${candidates.length} public examples · No live deal status implied</span></div>
      <div class="firm-candidate-list">${candidates.map(c=>`<article><div class="company-name-cell">${mark(c)}<div><h3>${esc(c.name)}</h3><span>${esc(c.sector)}</span></div></div><p>${esc(c.bottleneck)}</p><div>${btn('open-company','Review company','',`data-id="${esc(c.id)}"`)}${btn('shortlist',`${icon('bookmark')} Save to shortlist`,'',`data-id="${esc(c.id)}"`)}</div></article>`).join('')}</div>`;
  }
  if(view==='agents') return `${heading('Agents','Give the team research capacity.','A proposed team of agents for sourcing, company research, and diligence—with review before decisions.')}
    ${banner('Workflow previews, not live agents. Example outputs are assembled from the public catalog; no model is called.')}
    ${companySelect()}<div class="firm-card-grid">${agentWorkflows.map(w=>workflowCard(w,'agent')).join('')}</div>
    <section class="firm-wide-panel"><div><h2>Make reliability visible</h2><p>Every future run should retain its sources, missing evidence, reviewer, cost, and outcome.</p></div><div class="firm-review-tags"><span>Source support</span><span>Coverage gaps</span><span>Human review</span></div></section>
    <div class="firm-section-title"><h2>Context the team can use today</h2></div><p class="firm-small-copy">The read-only research connector is available now. Live execution, scheduling, and run-level evaluation would be the next integration step.</p><a class="text-link" href="#about">Inspect sources & agent access ${icon('arrow')}</a>`;
  if(view==='stats') {
    const portfolio=r.companies.filter(c=>c.relationship==='portfolio');
    return `${heading('Portfolio stats','One place to trust the numbers.','A shared view of company metrics, valuation marks, fund records, and comparable companies.',preview('metrics-request','Preview metrics request'))}
      ${banner('Layout preview using public portfolio names. Private financial data is not connected; dashes mean unknown, never zero.')}
      <div class="firm-card-grid"><article class="firm-card compact"><h3>Company metrics</h3>${status('Awaiting company updates')}<p>Revenue, cash, runway, and operating KPIs with reporting dates and sources.</p></article><article class="firm-card compact"><h3>Fund data & marks</h3>${status('Awaiting fund records')}<p>Cost basis, ownership, approved marks, NAV, and distributions.</p></article><article class="firm-card compact"><h3>Market comps</h3>${status('Awaiting comparable data')}<p>Peer metrics, valuation dates, and adjustments behind each comparison.</p></article></div>
      <div class="firm-section-title"><h2>Portfolio reporting view</h2><span>Public membership · ${portfolio.length} companies in this sample</span></div>
      <div class="firm-table-wrap"><table class="firm-table"><thead><tr><th>Company</th><th>Revenue</th><th>Runway</th><th>Valuation / mark</th><th>As of</th><th>Review status</th></tr></thead><tbody>${portfolio.map(c=>`<tr><td><button class="company-name" data-action="open-company" data-id="${esc(c.id)}">${esc(c.name)}</button></td><td aria-label="Revenue not provided">—</td><td aria-label="Runway not provided">—</td><td aria-label="Valuation and mark not provided">—</td><td>—</td><td><span class="firm-missing">Data needed</span></td></tr>`).join('')}</tbody></table></div>
      <section class="firm-wide-panel"><div><h2>Every number needs a source and an owner.</h2><p>Collect the metric definition, period, currency, source document, and reviewer before using it in a decision.</p></div>${draft('metrics-request','Draft collection checklist')}</section>`;
  }
  if(view==='diligence') return `${heading('Diligence & relationships','Make the next founder meeting count.','Use technical evidence to prepare better questions, then capture what the conversation changes.')}
    ${banner('Public evidence is available. Contacts, meeting history, and live deals are not connected.')}
    ${companySelect()}<div class="firm-two-column"><section class="firm-card"><div class="firm-card-top">${mark(selected)}${status('Meeting preparation')}</div><h2>Questions for ${esc(selected.name)}</h2><ol class="firm-question-list">${selected.questions.map(q=>`<li>${esc(q)}</li>`).join('')}</ol>${draft('meeting-prep','Prepare conversation note')}<p class="firm-fine-print">No meeting is scheduled and no message is sent.</p></section>
    <section class="firm-card"><div class="firm-card-top">${icon('search')}${status('Technical review')}</div><h2>What needs stronger evidence?</h2><ul class="firm-question-list">${selected.risks.map(q=>`<li>${esc(q)}</li>`).join('')}</ul><div class="firm-source-links">${sourceLinks(selected.sourceIds)}</div>${preview('diligence-reviewer','Preview diligence checklist')}</section></div>
    <section class="firm-wide-panel"><div><h2>Build relationship context over time</h2><p>A connected firm workspace would keep each founder’s conversations, commitments, introductions, and next action together. Start with a private preparation note in this demo.</p></div><a class="button" href="#workspace">View saved work ${icon('arrow')}</a></section>`;
  if(view==='operations') {
    const records=state.workspace.filter(x=>x.status!=='done').slice(0,4);
    return `${heading('Operations','Keep a small team moving together.','Reusable workflows for portfolio reviews, investment decisions, and fund reporting.')}
      ${banner('Workflow templates are ready to preview. Schedules, external integrations, and automated reporting are not enabled.')}
      <div class="firm-card-grid">${operationWorkflows.map(w=>workflowCard(w,'operation')).join('')}</div>
      <div class="firm-section-title"><h2>Your open work</h2><a class="text-link" href="#workspace">All saved work ${icon('arrow')}</a></div>
      ${state.workspaceError?'<p class="firm-context">Saved work could not load. Open Saved work to reconnect.</p>':records.length?`<div class="firm-work-list">${records.map(x=>`<article><div><h3>${esc(x.title)}</h3><p>${esc(x.status)} · Saved ${esc(date(x.updatedAt))}</p></div>${btn('edit-record','Review','',`data-id="${esc(x.id)}"`)}</article>`).join('')}</div>`:'<div class="firm-empty"><h3>No open work saved yet.</h3><p>Preview a checklist, make it your own, and save it to start a review.</p></div>'}
      <p class="firm-small-copy">This queue reflects your private visitor workspace. Firm-wide assignments, deadlines, and approvals would require team identity and permissions.</p>`;
  }
  return '';
}
