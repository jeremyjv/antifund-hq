// Derive a decision view from the public catalog; never infer missing dates.
export function dashboardSnapshot(research) {
  const end = Date.parse(`${research.checkedAt}T00:00:00Z`);
  const start = end - 29 * 86400000;
  const dated = research.signals.filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.observedAt || ''))
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const recent = dated.filter(s => {
    const time = Date.parse(`${s.observedAt}T00:00:00Z`);
    return time >= start && time <= end;
  });
  const undated = research.signals.filter(s => !/^\d{4}-\d{2}-\d{2}$/.test(s.observedAt || ''));
  const portfolioIds = new Set(research.companies.filter(c => c.relationship === 'portfolio').map(c => c.id));
  return {dated, recent, undated, portfolioCount: new Set(recent.filter(s => portfolioIds.has(s.companyId)).map(s => s.companyId)).size};
}
