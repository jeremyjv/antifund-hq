// Derived exclusively from the source-linked catalog stored in D1.
export function marketOverview(research) {
  const rows=(research.marketMetrics||[]).map(metric=>({...metric,company:research.companies.find(c=>c.id===metric.companyId),source:research.sources.find(s=>s.id===metric.sourceIds[0])})).filter(row=>row.company?.relationship==='research' && row.source);
  return {rows,sectors:[...new Set(rows.map(r=>r.theme))].map(name=>({name,count:rows.filter(r=>r.theme===name).length})),checkedAt:research.checkedAt};
}
