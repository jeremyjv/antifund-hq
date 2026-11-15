// Fund pulse KPIs. Illustrative sample values until pipeline, CRM, and
// portfolio integrations are connected. Not Anti Fund data.
export const fundKpis = [
  {
    id: 'pipeline', label: 'Pipeline this week', value: '42', unit: 'new qualified',
    delta: '+18%', good: true, note: '61% from proprietary signals',
    series: [24, 27, 25, 31, 29, 33, 36, 42],
  },
  {
    id: 'decision', label: 'Time to decision', value: '9', unit: 'days median',
    delta: '−4 days', good: true, note: 'First signal → partner yes/no',
    series: [21, 19, 18, 16, 14, 13, 11, 9],
  },
  {
    id: 'tvpi', label: 'Portfolio TVPI', value: '2.4x', unit: 'MOIC 2.6x',
    delta: '+0.2x', good: true, note: 'Quarter-to-date markups',
    series: [1.6, 1.7, 1.8, 1.8, 2.0, 2.1, 2.2, 2.4],
  },
  {
    id: 'coverage', label: 'Coverage', value: '94%', unit: 'mentions logged',
    delta: '3 missed', good: false, note: 'Group chats, email, intros → pipeline',
    series: [71, 76, 80, 84, 88, 90, 92, 94],
  },
];

export function sparkline(series, good) {
  const w = 120, h = 32, min = Math.min(...series), max = Math.max(...series);
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - 3 - ((v - min) / (max - min || 1)) * (h - 6)}`).join(' ');
  return `<svg class="kpi-spark ${good ? 'good' : 'bad'}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

export function renderKpis(esc) {
  return `<section class="kpi-row" aria-label="Fund pulse"><div class="kpi-head"><span class="eyebrow">Fund pulse</span><span class="team-week">Last 8 weeks</span><span class="pill" title="Illustrative values until pipeline, CRM, and portfolio integrations are connected. Not Anti Fund data.">Sample data</span></div><div class="kpi-grid">${fundKpis.map(k => `<article class="kpi-card"><div class="eyebrow">${esc(k.label)}</div><div class="kpi-value"><strong>${esc(k.value)}</strong><span class="kpi-delta ${k.good ? 'good' : 'bad'}">${esc(k.delta)}</span></div><div class="kpi-unit">${esc(k.unit)}</div>${sparkline(k.series, true)}<div class="kpi-note">${esc(k.note)}</div></article>`).join('')}</div></section>`;
}
