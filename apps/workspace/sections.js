// Five-section navigation. Each section has an icon-rail entry and its own pages.
export const sections = [
  { id: 'hq', label: 'HQ', title: 'HQ', icon: 'home', desc: 'The shared desk: what happened, what is open, who is on it.',
    pages: [['overview', 'Home', 'home'], ['feed', 'Feed', 'feed'], ['teamlog', 'Team log', 'log'], ['workspace', 'Saved work', 'folder']] },
  { id: 'deals', label: 'Deals', title: 'Deals', icon: 'search', desc: 'One flow from first signal to partner decision.',
    pages: [['pipeline', 'Pipeline', 'grid'], ['sourcing', 'Sourcing', 'search'], ['companies', 'Companies', 'companies'], ['diligence', 'Diligence & memos', 'edit'], ['agents', 'Agents', 'spark'], ['research', 'Research briefs', 'research']] },
  { id: 'people', label: 'People', title: 'Relationships', icon: 'people', desc: 'The in-person edge, logged with follow-ups.',
    pages: [['founders', 'Founders', 'people'], ['visits', 'Field visits & events', 'pin'], ['intros', 'Intros & co-investors', 'connect']] },
  { id: 'portfolio', label: 'Portfolio', title: 'Portfolio', icon: 'chart', desc: 'How the bets are doing, and the story that raises the next fund.',
    pages: [['stats', 'Stats & marks', 'chart'], ['attention', 'Attention lift', 'megaphone'], ['operations', 'LP reporting & ops', 'clock']] },
  { id: 'connect', label: 'Connect', title: 'Connect', icon: 'plug', desc: 'Plug every teammate and their agent into the same context.',
    pages: [['agent-setup', 'Agent setup', 'plug'], ['integrations', 'Integrations', 'connect'], ['about', 'Sources', 'research']] },
];
export const views = sections.flatMap(s => s.pages.map(([id]) => id));
export const labels = Object.fromEntries(sections.flatMap(s => s.pages.map(([id, label]) => [id, label])));
export const sectionOf = view => sections.find(s => s.pages.some(([id]) => id === view)) || sections[0];

// Pages whose data sources are not connected yet: purpose, inputs, and what they will show.
export const plannedPages = {
  feed: { eyebrow: 'HQ / Feed', title: 'Everything that moved, in one stream.', desc: 'New deals, memo drafts, founder meetings, portfolio updates, and completed focuses, newest first.', inputs: ['HQ focuses & goals', 'Deal pipeline changes', 'Founder meeting notes', 'Portfolio company updates'], output: 'A chronological feed anyone can scan in two minutes each morning.' },
  teamlog: { eyebrow: 'HQ / Team log', title: 'What each person shipped this week.', desc: 'A running log per teammate, written from completed focuses and agent activity, so the Monday sync starts from facts.', inputs: ['Completed weekly focuses', 'Agent runs per teammate', 'Calendar meetings held'], output: 'A weekly digest per person, ready before the partner meeting.' },
  pipeline: { eyebrow: 'Deals / Pipeline', title: 'Every live deal, by stage.', desc: 'Sourced → First call → Diligence → Partner review → Decision. Each card carries its memo, owner, and days in stage.', inputs: ['Sourcing radar', 'Group-chat & email mentions', 'Intro requests', 'Saved shortlist'], output: 'Stage counts and time-in-stage, which feed the time-to-decision KPI on Home.' },
  founders: { eyebrow: 'Relationships / Founders', title: 'Know every founder before the round.', desc: 'Profiles for founders and researchers the team is tracking: last touchpoint, who owns the relationship, and the next step.', inputs: ['Email & calendar', 'Meeting notes', 'Sourcing radar', 'Group chats'], output: 'Nudges when a tracked founder is raising, hiring, or has gone quiet.' },
  visits: { eyebrow: 'Relationships / Field visits & events', title: 'Turn in-person time into pipeline.', desc: 'Plan field visits and events, log who was met, and capture follow-ups before the drive home.', inputs: ['Calendar', 'Voice notes', 'Event attendee lists'], output: 'Every in-person meeting logged with an owner and a follow-up date.' },
  intros: { eyebrow: 'Relationships / Intros & co-investors', title: 'Who knows whom, and who owes a follow-up.', desc: 'Track warm intros in and out, and the co-investors the firm builds rounds with.', inputs: ['Email threads', 'Group chats', 'Cap tables of portfolio companies'], output: 'Open intros by owner, and co-investor overlap per deal.' },
  attention: { eyebrow: 'Portfolio / Attention lift', title: 'Measure the attention moat.', desc: 'When a partner posts about a portfolio company, track the lift in mentions, traffic, downloads, and signups against the days before.', inputs: ['Partner social posts', 'Company web & app analytics', 'Social mention volume'], output: 'A lift score per post and per company: proof for founders and LPs that the attention converts.' },
  integrations: { eyebrow: 'Connect / Integrations', title: 'One context layer for the whole firm.', desc: 'Each integration feeds HQ, so every page and every teammate’s agent works from the same facts.', inputs: ['Gmail & Calendar', 'Group chats (iMessage, WhatsApp, Telegram)', 'Notion / Google Docs memos', 'Cap table & fund admin', 'GitHub, arXiv, hiring & traffic signals'], output: 'Connected sources show up as citations on every page and in every agent answer.' },
};
