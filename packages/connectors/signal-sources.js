// Signal Watch source adapters. Every source here is free and needs no key or account.
// Each adapter fetches one explicitly selected public endpoint and returns normalized
// observations. Source text is untrusted evidence: stored as plain text, never followed or executed.

const UA = 'AntiFundHQ-signal-watch/0.1 (+https://antifundhq.com)';
const DAY = 86400000;
const clip = (s, n = 320) => {
  const t = String(s || '').replace(/<[^>]+>/g, ' ').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const iso = (d) => { const t = Date.parse(d); return Number.isNaN(t) ? null : new Date(t).toISOString(); };
const money = (n) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : `$${Math.round(n / 1e3)}K`);
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
const GENERIC_HOSTS = new Set(['github.com', 'news.ycombinator.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'medium.com', 'substack.com', 'arxiv.org', 'huggingface.co', 'docs.google.com', 'apps.apple.com', 'play.google.com', 'gitlab.com', 'vercel.app', 'notion.site']);

// Normalized company identity for cross-source matching ("Acme Robotics, Inc." == "acme robotics").
export function entityKey(name) {
  if (!name) return null;
  const k = String(name).toLowerCase().replace(/\.(com|ai|io|dev|co|app|xyz|org|net|tech)$/, '')
    .replace(/[,.]|\b(inc|llc|l\.?l\.?c|corp|corporation|co|ltd|limited|lp|l\.p|holdings|technologies|technology|labs?|hq)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  return k.length >= 2 ? k : null;
}

async function get(url, type = 'json', init = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: type === 'json' ? 'application/json' : '*/*', ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${new URL(url).hostname} responded ${res.status}`);
  return type === 'json' ? res.json() : res.text();
}

// --- Hacker News (Algolia API): Show HN and Launch HN posts ---------------------------------
async function hackerNews() {
  const since = Math.floor((Date.now() - 4 * DAY) / 1000);
  const queries = ['launch_hn', 'show_hn'].map((tag) => `https://hn.algolia.com/api/v1/search_by_date?tags=${tag}&hitsPerPage=60&numericFilters=created_at_i%3E${since}`);
  const pages = await Promise.all(queries.map((q) => get(q)));
  return pages.flatMap((p, i) => p.hits.map((h) => {
    const title = String(h.title || '').replace(/^(Show|Launch) HN:\s*/i, '');
    const site = host(h.url);
    const named = title.split(/\s+[–—-]\s+|:\s+|\s+\(/)[0];
    const entity = i === 0 ? named.replace(/\s*\(YC [A-Z]\d{2}\)\s*/i, '') : site && !GENERIC_HOSTS.has(site) ? site : named;
    const yc = (h.title || '').match(/\(YC ([A-Z]\d{2})\)/i)?.[1];
    return {
      id: `hn:${h.objectID}`, source: 'hn', kind: 'launch', title, summary: clip(h.story_text || ''),
      url: `https://news.ycombinator.com/item?id=${h.objectID}`, author: h.author, entity,
      tags: [i === 0 ? 'launch hn' : 'show hn', ...(yc ? [`yc ${yc.toLowerCase()}`] : []), ...(site ? [site] : [])],
      metrics: { points: h.points || 0, comments: h.num_comments || 0, link: h.url || null }, publishedAt: iso(h.created_at),
    };
  }));
}

// --- GitHub: fast-rising new repositories ----------------------------------------------------
async function github() {
  const since = new Date(Date.now() - 21 * DAY).toISOString().slice(0, 10);
  const data = await get(`https://api.github.com/search/repositories?q=created:%3E${since}+stars:%3E60&sort=stars&order=desc&per_page=50`, 'json', { headers: { Accept: 'application/vnd.github+json' } });
  return (data.items || []).map((r) => {
    const ageDays = Math.max(1, (Date.now() - Date.parse(r.created_at)) / DAY);
    const isOrg = r.owner?.type === 'Organization';
    return {
      id: `github:${r.id}`, source: 'github', kind: 'repo', title: r.full_name, summary: clip(r.description || ''),
      url: r.html_url, author: r.owner?.login, entity: isOrg ? r.owner.login : r.name,
      tags: [...(r.topics || []).slice(0, 8), ...(r.language ? [r.language.toLowerCase()] : []), ...(isOrg ? ['org'] : [])],
      metrics: { stars: r.stargazers_count, forks: r.forks_count, starsPerDay: Math.round(r.stargazers_count / ageDays) }, publishedAt: iso(r.created_at),
    };
  });
}

// --- Hugging Face: trending models -------------------------------------------------------------
async function huggingFace() {
  const data = await get('https://huggingface.co/api/models?sort=trendingScore&limit=40');
  return data.map((m) => {
    const [org] = String(m.id).split('/');
    return {
      id: `huggingface:${m.id}`, source: 'huggingface', kind: 'model', title: m.id,
      summary: clip([...new Set([m.pipeline_tag, m.library_name, ...(m.tags || []).filter((t) => !t.includes(':') && t.length < 24)].filter(Boolean))].slice(0, 7).join(' · ')),
      url: `https://huggingface.co/${m.id}`, author: org, entity: org,
      tags: [m.pipeline_tag, m.library_name].filter(Boolean), metrics: { likes: m.likes || 0, downloads: m.downloads || 0, trending: m.trendingScore || 0 }, publishedAt: iso(m.createdAt),
    };
  });
}

// --- arXiv: newest robotics, systems, hardware and AI papers -----------------------------------
async function arxiv() {
  const q = encodeURIComponent('cat:cs.RO OR cat:eess.SY OR cat:cs.AR OR cat:cs.AI OR cat:physics.app-ph');
  const xml = await get(`https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=60`, 'text');
  const tag = (s, t) => s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] || '';
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
    const absUrl = tag(e, 'id').trim().replace('http://', 'https://');
    const id = absUrl.split('/abs/')[1]?.replace(/v\d+$/, '');
    const authors = [...e.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1]);
    const cats = [...e.matchAll(/<category term="([^"]+)"/g)].map((m) => m[1]);
    return id && {
      id: `arxiv:${id}`, source: 'arxiv', kind: 'paper', title: clip(tag(e, 'title'), 200), summary: clip(tag(e, 'summary')),
      url: `https://arxiv.org/abs/${id}`, author: authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : ''), entity: null,
      tags: cats.slice(0, 5), metrics: { authors: authors.length }, publishedAt: iso(tag(e, 'published')),
    };
  }).filter(Boolean);
}

// --- SEC EDGAR: new Form D filings (private raises, often before any press release) ------------
async function secFormD({ known }) {
  const feed = await get('https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=D&company=&dateb=&owner=include&count=100&output=atom', 'text');
  const entries = [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    form: e.match(/term="([^"]+)"/)?.[1], title: e.match(/<title>([^<]+)<\/title>/)?.[1] || '',
    link: e.match(/href="([^"]+)"/)?.[1] || '', updated: e.match(/<updated>([^<]+)<\/updated>/)?.[1],
    acc: e.match(/accession-number=([\d-]+)/)?.[1],
  })).filter((e) => (e.form === 'D' || e.form === 'D/A') && e.acc && !known.has(`sec_form_d:${e.acc}`));
  const out = [];
  // Each filing's details live in its own XML document; fetch a bounded number per run.
  for (const e of entries.slice(0, 20)) {
    const cik = e.link.match(/\/data\/(\d+)\//)?.[1];
    if (!cik) continue;
    let doc;
    try { doc = await get(`https://www.sec.gov/Archives/edgar/data/${cik}/${e.acc.replace(/-/g, '')}/primary_doc.xml`, 'text'); } catch { continue; }
    const x = (t) => doc.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1]?.trim() || '';
    const name = clip(x('entityName') || e.title.replace(/^D(\/A)? - /, '').replace(/\s*\(\d+\).*$/, ''), 160);
    const industry = x('industryGroupType');
    const fundType = x('investmentFundType');
    const offered = Number(x('totalOfferingAmount')) || null;
    const sold = Number(x('totalAmountSold')) || 0;
    const securities = ['isEquityType', 'isDebtType', 'isOptionToAcquireType', 'isPooledInvestmentFundType'].filter((t) => x(t) === 'true').map((t) => t.replace(/^is|Type$/g, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase());
    const state = x('stateOrCountryDescription') || x('stateOrCountry');
    const year = doc.match(/<yearOfInc>[\s\S]*?<value>(\d{4})<\/value>/)?.[1];
    const pooled = industry === 'Pooled Investment Fund';
    out.push({
      id: `sec_form_d:${e.acc}`, source: 'sec_form_d', kind: 'raise',
      title: `${name} filed a Form D${e.form === 'D/A' ? ' amendment' : ''}${sold ? ` · ${money(sold)} sold` : ''}`,
      summary: clip([industry && `Industry: ${industry}${fundType ? ` (${fundType})` : ''}`, offered ? `Offering $${Math.round(offered).toLocaleString('en-US')}` : 'Offering amount indefinite', sold ? `$${Math.round(sold).toLocaleString('en-US')} sold` : null, securities.length && `Securities: ${securities.join(', ')}`, state && `Based in ${state}`, year && `Incorporated ${year}`].filter(Boolean).join(' · ')),
      url: e.link, author: null, entity: name,
      tags: [industry?.toLowerCase(), pooled ? 'fund' : 'operating company', e.form === 'D/A' ? 'amendment' : 'new filing', year && Number(year) >= new Date().getFullYear() - 3 ? 'young company' : null].filter(Boolean),
      metrics: { amount: sold || offered || 0, offered, sold, incorporated: year ? Number(year) : null }, publishedAt: iso(e.updated),
    });
  }
  return out;
}

// --- USAspending: new Department of Defense R&D contract awards --------------------------------
async function usaSpending() {
  const end = new Date().toISOString().slice(0, 10);
  // DoD publishes contract data with a ~90-day delay, so look back further and sort by start date.
  const start = new Date(Date.now() - 180 * DAY).toISOString().slice(0, 10);
  const body = {
    filters: {
      time_period: [{ start_date: start, end_date: end, date_type: 'date_signed' }], award_type_codes: ['A', 'B', 'C', 'D'],
      agencies: [{ type: 'awarding', tier: 'toptier', name: 'Department of Defense' }],
      naics_codes: { require: ['5417', '3364', '334511'] },
      award_amounts: [{ lower_bound: 250000, upper_bound: 250000000 }],
    },
    fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Description', 'Awarding Sub Agency', 'Start Date', 'generated_internal_id', 'NAICS'],
    limit: 60, sort: 'Start Date', order: 'desc',
  };
  const data = await get('https://api.usaspending.gov/api/v2/search/spending_by_award/', 'json', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  return (data.results || []).map((a) => ({
    id: `usaspending:${a.generated_internal_id}`, source: 'usaspending', kind: 'contract',
    title: `${a['Recipient Name']} · ${money(a['Award Amount'] || 0)} from ${a['Awarding Sub Agency'] || 'DoD'}`,
    summary: clip(a.Description || ''), url: `https://www.usaspending.gov/award/${a.generated_internal_id}`, author: a['Awarding Sub Agency'], entity: a['Recipient Name'],
    tags: ['defense', 'dod', String(a.NAICS?.description || '').toLowerCase().slice(0, 60)].filter(Boolean),
    metrics: { amount: a['Award Amount'] || 0 }, publishedAt: iso(a['Start Date']),
  }));
}

// --- Bluesky: posts from an explicitly selected list of public accounts ------------------------
// (Bluesky's open search endpoint is closed to unauthenticated clients; following named people works.)
export const BLUESKY_ACCOUNTS = ['simonwillison.net', 'karpathy.bsky.social', 'natolambert.bsky.social', 'hamel.bsky.social', 'swyx.io', 'jay.bsky.team'];
async function bluesky() {
  const feeds = await Promise.all(BLUESKY_ACCOUNTS.map((a) => get(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${a}&limit=15&filter=posts_no_replies`).catch(() => null)));
  const cutoff = Date.now() - 30 * DAY;
  return feeds.filter(Boolean).flatMap((f) => f.feed.filter((i) => !i.reason && Date.parse(i.post.record?.createdAt || i.post.indexedAt) > cutoff).map(({ post }) => {
    const rkey = post.uri.split('/').pop();
    const link = post.embed?.external?.uri || null;
    return {
      id: `bluesky:${post.cid}`, source: 'bluesky', kind: 'post', title: clip(post.record?.text || '', 200) || '(post)',
      summary: clip([post.embed?.external?.title, post.embed?.external?.description].filter(Boolean).join(' — ')),
      url: `https://bsky.app/profile/${post.author.handle}/post/${rkey}`, author: post.author.handle, entity: link && host(link) && !GENERIC_HOSTS.has(host(link)) ? host(link) : null,
      tags: [post.author.handle, ...(link && host(link) ? [host(link)] : [])],
      metrics: { likes: post.likeCount || 0, reposts: post.repostCount || 0, replies: post.replyCount || 0, link }, publishedAt: iso(post.record?.createdAt || post.indexedAt),
    };
  }));
}

// cadence: minimum minutes between runs. Kept polite and inside free-tier limits.
export const SOURCES = [
  { id: 'hn', label: 'Hacker News', detail: 'Launch HN and Show HN posts', kind: 'launch', cadence: 30, home: 'https://news.ycombinator.com/show', run: hackerNews },
  { id: 'github', label: 'GitHub', detail: 'New repositories gaining stars fast', kind: 'repo', cadence: 180, home: 'https://github.com/trending', run: github },
  { id: 'huggingface', label: 'Hugging Face', detail: 'Trending open models', kind: 'model', cadence: 180, home: 'https://huggingface.co/models?sort=trending', run: huggingFace },
  { id: 'arxiv', label: 'arXiv', detail: 'Newest robotics, systems, hardware and AI papers', kind: 'paper', cadence: 360, home: 'https://arxiv.org/list/cs.RO/new', run: arxiv },
  { id: 'sec_form_d', label: 'SEC Form D', detail: 'Private raises filed with the SEC', kind: 'raise', cadence: 60, home: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=D', run: secFormD },
  { id: 'usaspending', label: 'USAspending', detail: 'DoD R&D and aerospace contract awards (published with a ~90-day delay)', kind: 'contract', cadence: 360, home: 'https://www.usaspending.gov/search', run: usaSpending },
  { id: 'bluesky', label: 'Bluesky', detail: `Posts from ${BLUESKY_ACCOUNTS.length} followed accounts`, kind: 'post', cadence: 60, home: 'https://bsky.app', run: bluesky },
];
// Paid or keyed sources, listed so the UI is honest about what is not connected in the free demo.
export const PLANNED_SOURCES = [
  { id: 'x', label: 'X', detail: 'Pay-per-use API, about $0.005 per post read' },
  { id: 'producthunt', label: 'Product Hunt', detail: 'Needs a developer token' },
  { id: 'jobs', label: 'Hiring (Greenhouse, Lever, Ashby)', detail: 'Needs a list of company boards to snapshot' },
];
