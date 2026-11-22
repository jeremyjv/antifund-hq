// Signal scoring. Pure functions (no imports) so the browser can re-score instantly while a
// watch's criteria are being edited, and the Worker/MCP produce the exact same ranking.
//
// A watch filters in three stages, cheapest first:
//   1. Hard filters  — sources, kinds, accounts, required and excluded terms. Fail = dropped.
//   2. Relevance     — include-term hits (title counts double) plus overlap with the watch's
//                      plain-English description. Lexical matching, not an LLM.
//   3. Momentum      — source-normalized traction, recency, and cross-source convergence
//                      (the same company showing up on two or more sources in the window).
// The final 0–100 score is compared with the watch's threshold; every score carries its reasons.

const DAY = 86400000;
const STOP = new Set('a an and are as at be by for from has have in into is it its of on or our that the their this to was we with without you your new any all more most than then them they what when where which who will can just like about over under also using use based via per not no only very such those these things them make makes made most every other some'.split(' '));

export const SOURCE_LABELS = { hn: 'Hacker News', github: 'GitHub', huggingface: 'Hugging Face', arxiv: 'arXiv', sec_form_d: 'SEC Form D', usaspending: 'USAspending', bluesky: 'Bluesky' };
export const KIND_LABELS = { launch: 'Launch', repo: 'Repository', model: 'Model', paper: 'Paper', raise: 'Raise', contract: 'Contract', post: 'Post' };

const norm = (s) => String(s || '').toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termRe = new Map();
function has(text, term) {
  const t = norm(term).trim();
  if (!t) return false;
  if (!termRe.has(t)) termRe.set(t, new RegExp(`(^|[^a-z0-9])${escapeRe(t)}(s|es)?($|[^a-z0-9])`));
  return termRe.get(t).test(text);
}
export const descriptionTerms = (d) => [...new Set(norm(d).split(/[^a-z0-9-]+/).filter((w) => w.length > 3 && !STOP.has(w)))].slice(0, 40);
const clamp = (x) => Math.max(0, Math.min(1, x));
const logScale = (v, top) => clamp(Math.log10((v || 0) + 1) / Math.log10(top));
const money = (n) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : `$${Math.round(n / 1e3)}K`);

// Traction normalized per source, with a human-readable reason.
export function momentum(sig) {
  const m = sig.metrics || {};
  switch (sig.source) {
    case 'hn': return [logScale(m.points, 600), m.points ? `${m.points} points on HN` : null];
    case 'github': return [clamp(0.6 * logScale(m.stars, 8000) + 0.4 * logScale(m.starsPerDay, 600)), `${(m.stars || 0).toLocaleString('en-US')} stars · ${m.starsPerDay || 0}/day`];
    case 'huggingface': return [logScale(m.likes, 4000), `${(m.likes || 0).toLocaleString('en-US')} likes, trending`];
    case 'sec_form_d': {
      // Investment funds raise large pools; an operating company's raise is the venture signal.
      const fund = (sig.tags || []).includes('fund');
      const base = m.amount ? clamp((Math.log10(m.amount) - 5) / 3.3) : 0.15;
      return [fund ? base * 0.3 : base, m.amount ? `${money(m.amount)} ${fund ? 'fund raise' : 'raise'} filed` : 'Raise filed, amount undisclosed'];
    }
    case 'usaspending': return [m.amount ? clamp((Math.log10(m.amount) - 5.3) / 3) : 0, m.amount ? `${money(m.amount)} DoD award` : null];
    case 'bluesky': return [logScale((m.likes || 0) + 2 * (m.reposts || 0), 800), m.likes ? `${m.likes} likes · ${m.reposts || 0} reposts` : null];
    case 'arxiv': return [0.25, null];
    default: return [0.2, null];
  }
}

// Build once per scoring pass: which entities appear on which sources, and which are already known.
export function buildIndex(signals, known = []) {
  const bySource = new Map();
  for (const s of signals) {
    if (!s.entityKey) continue;
    if (!bySource.has(s.entityKey)) bySource.set(s.entityKey, new Set());
    bySource.get(s.entityKey).add(s.source);
  }
  return { bySource, known: new Map(known.filter((k) => k.key).map((k) => [k.key, k])) };
}

export function scoreSignal(sig, watch, index, now = Date.now()) {
  const sources = watch.sources || [], kinds = watch.kinds || [];
  if (sources.length && !sources.includes(sig.source)) return null;
  if (kinds.length && !kinds.includes(sig.kind)) return null;
  const title = norm(`${sig.title} ${sig.entity || ''}`);
  const text = `${title} ${norm(sig.summary)} ${norm((sig.tags || []).join(' '))} ${norm(sig.author)}`;
  const accounts = (watch.accounts || []).map((a) => norm(a).replace(/^@/, '')).filter(Boolean);
  if (accounts.length && !accounts.some((a) => norm(sig.author) === a || norm(sig.author).split(/,\s*/).includes(a) || norm(sig.entity) === a || title.startsWith(`${a}/`))) return null;
  const excluded = (watch.excludeTerms || []).find((t) => has(text, t));
  if (excluded) return null;
  const missing = (watch.requireTerms || []).find((t) => !has(text, t));
  if (missing) return null;

  const include = watch.includeTerms || [];
  const hits = include.filter((t) => has(text, t));
  if (include.length && !hits.length) return null;
  const titleHits = hits.filter((t) => has(title, t)).length;
  const desc = descriptionTerms(watch.description).filter((w) => !include.some((t) => norm(t) === w));
  const descHits = desc.filter((w) => has(text, w));
  const relevance = include.length
    ? clamp((titleHits * 2 + (hits.length - titleHits)) / 3 + descHits.length * 0.08)
    : clamp(0.35 + descHits.length * 0.12);

  const [mo, moReason] = momentum(sig);
  const at = Date.parse(sig.publishedAt || sig.firstSeenAt) || now;
  const ageDays = Math.max(0, (now - at) / DAY);
  const fresh = Math.exp(-ageDays / 10);
  const seenOn = sig.entityKey ? index.bySource.get(sig.entityKey) : null;
  const converge = seenOn && seenOn.size > 1 ? clamp((seenOn.size - 1) / 2) : 0;
  const known = sig.entityKey ? index.known.get(sig.entityKey) : null;

  let score = Math.round(100 * (0.42 * relevance + 0.33 * mo + 0.13 * fresh + 0.12 * converge)) + (known ? 4 : 0);
  const vote = watch.votes?.[sig.id] || 0;
  if (vote > 0) score += 12;
  score = Math.max(0, Math.min(100, score));

  const reasons = [];
  if (hits.length) reasons.push(`Matches ${hits.slice(0, 4).map((h) => `“${h}”`).join(', ')}`);
  else if (descHits.length) reasons.push(`Fits the description: ${descHits.slice(0, 4).join(', ')}`);
  if (moReason) reasons.push(moReason);
  if (converge) reasons.push(`Also seen on ${[...seenOn].filter((x) => x !== sig.source).map((x) => SOURCE_LABELS[x] || x).join(', ')}`);
  if (known) reasons.push(known.label);
  reasons.push(ageDays < 1 ? 'Today' : `${Math.round(ageDays)}d old`);
  return { score, relevance, momentum: mo, fresh, converge, hits, reasons, vote, known: known?.label || null, crossSources: seenOn ? [...seenOn] : [sig.source] };
}

// Score every signal for a watch; drop thumbs-down and below-threshold results, best first.
export function runWatch(signals, watch, index, { limit = 200, includeBelow = false, now = Date.now() } = {}) {
  const out = [];
  for (const sig of signals) {
    if ((watch.votes?.[sig.id] || 0) < 0) continue;
    const r = scoreSignal(sig, watch, index, now);
    if (!r) continue;
    if (!includeBelow && r.score < (watch.minScore ?? 40)) continue;
    out.push({ signal: sig, ...r });
  }
  return out.sort((a, b) => b.score - a.score || (Date.parse(b.signal.publishedAt || 0) - Date.parse(a.signal.publishedAt || 0))).slice(0, limit);
}

// Plain search over every signal, for "is anyone talking about X?" lookups.
export function searchSignals(signals, query, index, limit = 50) {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return runWatch(signals, { requireTerms: terms, minScore: 0 }, index, { limit });
}
