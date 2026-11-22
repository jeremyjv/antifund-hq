// Signal Watch: internet signals from free public sources, filtered by saved watches.
// Signals come from /api/signals (a shared public cache); watches, votes, and promotions are
// owner scoped. Scoring runs here with the same pure functions the Worker and MCP use, so
// editing a watch re-ranks results instantly.
import { buildIndex, runWatch, scoreSignal, SOURCE_LABELS, KIND_LABELS, descriptionTerms } from "../../packages/core/signal-score.js";

const SOURCE_ORDER = ["hn", "github", "huggingface", "arxiv", "sec_form_d", "usaspending", "bluesky"];
const KINDS = ["launch", "repo", "model", "paper", "raise", "contract", "post"];
const DELIVERY = { feed: "Feed", digest: "Daily digest", alert: "Alert" };
const GENERAL = { id: "all", name: "All signals", description: "", sources: [], kinds: [], includeTerms: [], requireTerms: [], excludeTerms: [], accounts: [], minScore: 0, votes: {} };

export function createSignals(ctx) {
  const { api, esc, icon, toast, viewerId, rerender, heading } = ctx;
  const s = { data: null, error: null, loading: false, watch: "all", query: "", sources: [], sort: "score", editing: null, draft: null, refreshing: false, promoting: null, showAll: 60, method: false, focusAfter: null };
  const $ = (sel) => document.querySelector(sel);
  const isView = () => ctx.view() === "signals";
  let index = null;

  const ago = (at) => {
    if (!at) return "";
    const m = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60000));
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 36) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  };
  const watches = () => s.data?.watches || [];
  const current = () => (s.watch === "all" ? GENERAL : watches().find((w) => w.id === s.watch) || GENERAL);
  const splitTerms = (v) => [...new Set(String(v || "").split(/[,\n]/).map((t) => t.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))];

  async function load() {
    s.loading = true;
    try {
      const data = await api("/api/signals");
      ctx.setCsrf(data.csrfToken);
      s.data = data;
      index = buildIndex(data.signals, data.known);
      s.error = null;
      if (s.watch !== "all" && !data.watches.some((w) => w.id === s.watch)) s.watch = "all";
    } catch (e) {
      s.error = e.message;
    } finally {
      s.loading = false;
    }
  }

  // The list a viewer sees: the watch's ranking, then the toolbar's search and source chips.
  function results(watch = current()) {
    const w = watch.id === "all" ? { ...GENERAL } : { ...watch };
    if (s.query.trim()) w.requireTerms = [...(w.requireTerms || []), ...s.query.toLowerCase().split(/\s+/).filter(Boolean)];
    if (s.sources.length) w.sources = (w.sources?.length ? w.sources.filter((x) => s.sources.includes(x)) : s.sources);
    if (watch.sources?.length && s.sources.length && !w.sources.length) return [];
    const list = runWatch(s.data.signals, w, index, { limit: 1000 });
    if (s.sort === "new") list.sort((a, b) => Date.parse(b.signal.publishedAt || b.signal.firstSeenAt) - Date.parse(a.signal.publishedAt || a.signal.firstSeenAt));
    return list;
  }
  const countFor = (w) => runWatch(s.data.signals, w, index, { limit: 5000 }).length;

  // ------------------------------------------------------------------ rendering
  const scoreBadge = (n) => `<span class="sig-score ${n >= 70 ? "hot" : n >= 50 ? "warm" : ""}" title="Score ${n} of 100">${n}</span>`;
  const sourceTag = (id) => `<span class="sig-source src-${esc(id)}">${esc(SOURCE_LABELS[id] || id)}</span>`;

  function row(r) {
    const g = r.signal;
    const w = current();
    const voted = r.vote;
    const promoting = s.promoting === g.id;
    const crm = r.known ? `<a class="crm-tag research" href="#crm" title="Already in your CRM">${esc(r.known)}</a>` : "";
    const voteBtns = w.id === "all" ? "" : `<button class="icon-button sig-vote ${voted > 0 ? "on" : ""}" data-sig="vote" data-id="${esc(g.id)}" data-vote="${voted > 0 ? 0 : 1}" aria-pressed="${voted > 0}" aria-label="More like this" title="More like this">${thumb(true)}</button><button class="icon-button sig-vote" data-sig="vote" data-id="${esc(g.id)}" data-vote="-1" aria-label="Hide from this watch" title="Not relevant: hide from this watch">${thumb(false)}</button>`;
    const promote = promoting
      ? `<form class="sig-promote" data-sig-form="promote" data-id="${esc(g.id)}"><label class="visually-hidden" for="sig-promote-name">Company name</label><input id="sig-promote-name" name="name" maxlength="200" required value="${esc(g.entity || "")}" placeholder="Company name"><button class="button primary small" type="submit">Add at Sourced</button><button class="button small" type="button" data-sig="promote-cancel">Cancel</button></form>`
      : `<button class="button small" data-sig="promote" data-id="${esc(g.id)}">${icon("plus")} CRM</button>`;
    return `<li class="sig-row">
      ${scoreBadge(r.score)}
      <div class="sig-main">
        <a class="sig-title" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">${esc(g.title)}${icon("external")}</a>
        <div class="sig-meta">${sourceTag(g.source)}<span>${esc(KIND_LABELS[g.kind] || g.kind)}</span>${g.entity && !g.title.toLowerCase().includes(String(g.entity).toLowerCase()) ? `<span>${esc(g.entity)}</span>` : ""}${g.author && g.source !== "sec_form_d" ? `<span>${esc(g.author)}</span>` : ""}<span title="${esc(g.publishedAt || g.firstSeenAt)}">${esc(ago(g.publishedAt || g.firstSeenAt))}</span>${crm}</div>
        ${g.summary ? `<p class="sig-summary">${esc(g.summary)}</p>` : ""}
        <ul class="sig-reasons" aria-label="Why it scored">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      </div>
      <div class="sig-actions">${voteBtns}${promote}</div>
    </li>`;
  }
  const thumb = (up) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="${up ? "" : "transform:rotate(180deg)"}"><path d="M7 10v11M7 10l4-7a2.5 2.5 0 0 1 3 3l-1 4h6a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 17.7 21H7"/></svg>`;

  function sourcesPanel() {
    const { live, planned } = s.data.sources;
    const last = live.map((x) => x.lastRun?.finishedAt || x.lastRun?.startedAt).filter(Boolean).sort().pop();
    return `<section class="sig-panel" aria-labelledby="sig-sources-h"><div class="sig-panel-head"><h2 id="sig-sources-h">Sources</h2><span class="crm-muted">${last ? `Updated ${esc(ago(last))}` : "Not fetched yet"}</span></div>
      <ul class="sig-health">${live.map((x) => {
        const st = x.lastRun?.status || "never";
        return `<li><span class="sig-dot ${esc(st)}" aria-hidden="true"></span><span class="sig-health-name"><a href="${esc(x.home)}" target="_blank" rel="noopener noreferrer">${esc(x.label)}</a><span class="crm-sub">${esc(x.detail)}</span>${st === "error" ? `<span class="sig-err">Last run failed: ${esc(x.lastRun.error || "unknown error")}</span>` : ""}</span><span class="sig-health-n" title="Signals in the last ${s.data.windowDays} days">${x.signals}</span></li>`;
      }).join("")}</ul>
      <p class="sig-planned"><strong>Not in the free demo:</strong> ${planned.map((p) => `${esc(p.label)} <span class="crm-muted">(${esc(p.detail)})</span>`).join(" · ")}</p>
      <p class="crm-muted sig-cadence">Runs every 15 minutes on a Cloudflare cron, each source on its own polite cadence. Free, no keys.</p></section>`;
  }

  function methodPanel() {
    return `<details class="sig-method" ${s.method ? "open" : ""} data-sig="method"><summary>How a signal is scored</summary><ol>
      <li><strong>Hard filters.</strong> Sources, types, followed accounts, must-include and exclude terms. Anything that fails is dropped before scoring.</li>
      <li><strong>Relevance (42%).</strong> Topic-term hits, title hits count double, plus overlap with the watch's plain-English description. Keyword matching, not an LLM.</li>
      <li><strong>Traction (33%).</strong> Normalized per source: HN points, GitHub stars per day, Hugging Face likes, raise and contract size, Bluesky engagement.</li>
      <li><strong>Recency (13%) and convergence (12%).</strong> The same company showing up on two or more sources in the window is the strongest signal.</li>
      </ol><p class="crm-muted">Thumbs up boosts a signal in that watch; thumbs down hides it. Known CRM companies are tagged. Every result links to its primary source.</p></details>`;
  }

  function watchNav() {
    const all = [GENERAL, ...watches()];
    return `<nav class="sig-watches" aria-label="Watches"><div class="sig-watches-head"><h2>Watches</h2><button class="icon-button" data-sig="new" aria-label="New watch" title="New watch">${icon("plus")}</button></div>
      <ul>${all.map((w) => `<li><button class="sig-watch ${s.watch === w.id ? "active" : ""}" data-sig="watch" data-id="${esc(w.id)}" ${s.watch === w.id ? 'aria-current="true"' : ""}><span class="sig-watch-name">${esc(w.name)}</span><span class="sig-watch-n">${countFor(w)}</span>${w.id !== "all" ? `<span class="sig-watch-sub">${esc(DELIVERY[w.delivery])} · score ≥ ${w.minScore}</span>` : `<span class="sig-watch-sub">Ranked by traction</span>`}</button></li>`).join("")}</ul></nav>`;
  }

  function editor() {
    const d = s.draft;
    const isNew = !d.id;
    const check = (name, value, on, label) => `<label class="sig-chip-check"><input type="checkbox" name="${name}" value="${esc(value)}" ${on ? "checked" : ""}><span>${esc(label)}</span></label>`;
    const preview = d ? countFor({ ...d, votes: watches().find((w) => w.id === d.id)?.votes || {} }) : 0;
    const descTerms = descriptionTerms(d.description).slice(0, 10);
    return `<div class="crm-scrim${s.justOpened ? " crm-enter" : ""}" data-sig="close"></div><aside class="crm-drawer sig-editor${s.justOpened ? " crm-enter" : ""}" role="dialog" aria-modal="true" aria-labelledby="sig-editor-title">
      <header class="crm-drawer-head"><div><h2 id="sig-editor-title">${isNew ? "New watch" : `Edit “${esc(d.name)}”`}</h2><p>Criteria are data: change them here or ask your agent to.</p></div><button class="icon-button" data-sig="close" aria-label="Close editor">${icon("close")}</button></header>
      <form class="crm-drawer-body sig-form" data-sig-form="watch" id="sig-watch-form">
        <div class="sig-live" aria-live="polite"><strong id="sig-live-n">${preview}</strong> signals match right now</div>
        <label>Name<input name="name" required maxlength="80" value="${esc(d.name)}" placeholder="e.g. Counter-drone startups"></label>
        <label>What are you looking for?<textarea name="description" rows="3" maxlength="600" placeholder="Plain English. Its words boost relevance.">${esc(d.description)}</textarea>${descTerms.length ? `<span class="crm-sub">Boost words: ${descTerms.map(esc).join(", ")}</span>` : ""}</label>
        <label>Topics: match any<input name="includeTerms" value="${esc(d.includeTerms.join(", "))}" placeholder="drone, counter-uas, autonomy"><span class="crm-sub">Comma separated. Leave empty to rank everything by traction.</span></label>
        <div class="sig-two"><label>Must include all<input name="requireTerms" value="${esc(d.requireTerms.join(", "))}" placeholder="e.g. open source"></label><label>Exclude<input name="excludeTerms" value="${esc(d.excludeTerms.join(", "))}" placeholder="crypto, gaming"></label></div>
        <label>Only these people or orgs<input name="accounts" value="${esc(d.accounts.join(", "))}" placeholder="simonwillison.net, anduril"><span class="crm-sub">Bluesky handles, GitHub or Hugging Face orgs. Leave empty for everyone.</span></label>
        <fieldset><legend>Sources <span class="crm-muted">(none = all)</span></legend><div class="sig-chips">${SOURCE_ORDER.map((id) => check("sources", id, d.sources.includes(id), SOURCE_LABELS[id])).join("")}</div></fieldset>
        <fieldset><legend>Types <span class="crm-muted">(none = all)</span></legend><div class="sig-chips">${KINDS.map((k) => check("kinds", k, d.kinds.includes(k), KIND_LABELS[k])).join("")}</div></fieldset>
        <div class="sig-two"><label>Minimum score <output id="sig-min-out">${d.minScore}</output><input type="range" name="minScore" min="0" max="100" step="1" value="${d.minScore}"></label><label>Delivery<select name="delivery">${Object.entries(DELIVERY).map(([v, l]) => `<option value="${v}" ${d.delivery === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
        <p class="crm-muted">Delivery is recorded on the watch; this demo shows every watch as a feed and does not send email.</p>
      </form>
      <footer class="crm-drawer-foot">${isNew ? "" : `<button class="button small danger" data-sig="archive">${icon("trash")} Archive</button><span class="crm-muted">Version ${d.version} · revisions kept</span>`}<span class="sig-spacer"></span><button class="button" data-sig="close">Cancel</button><button class="button primary" type="submit" form="sig-watch-form">${isNew ? "Create watch" : "Save"}</button></footer></aside>`;
  }

  function render() {
    const actions = s.data ? `<div class="crm-actions"><button class="button" data-sig="refresh" ${s.refreshing ? "disabled" : ""}>${icon("restore")} ${s.refreshing ? "Fetching sources…" : "Refresh now"}</button><button class="button primary" data-sig="new">${icon("plus")} New watch</button></div>` : "";
    const head = heading("Deals / Signals", "Launches, raises, and contracts, before anyone pitches them.", "Free public sources ingested on a schedule into the firm's own database, then filtered by watches anyone on the team, or their agent, can edit.", actions);
    if (!s.data) {
      if (!s.loading && !s.error) load().then(() => isView() && rerender());
      return `${head}${s.error ? `<div class="error-state"><h2>Signals could not be loaded.</h2><p>${esc(s.error)}</p><button class="button" data-sig="retry">Try again</button></div>` : `<div class="loading-line"></div><p class="loading-label">Loading signals…</p>`}`;
    }
    const w = current();
    const list = results();
    const empty = !s.data.signals.length;
    const chips = `<div class="sig-filter-chips" role="group" aria-label="Filter by source">${SOURCE_ORDER.map((id) => `<button class="sig-filter ${s.sources.includes(id) ? "on" : ""}" data-sig="source" data-id="${id}" aria-pressed="${s.sources.includes(id)}">${esc(SOURCE_LABELS[id])}</button>`).join("")}</div>`;
    const toolbar = `<div class="crm-toolbar"><label class="search-field crm-search">${icon("search")}<input id="sig-search" type="search" value="${esc(s.query)}" placeholder="Search every signal: “counter-drone”, “grid”, a company…" aria-label="Search signals" autocomplete="off"><kbd>/</kbd></label><div class="crm-filters"><select class="select" data-sig-filter="sort" aria-label="Sort"><option value="score" ${s.sort === "score" ? "selected" : ""}>Best score</option><option value="new" ${s.sort === "new" ? "selected" : ""}>Newest</option></select></div></div>`;
    const watchHead = `<div class="sig-watch-head"><div><h2>${esc(w.name)}</h2><p>${w.id === "all" ? "Everything in the last 30 days, ranked by traction, recency, and cross-source convergence." : esc(w.description || "No description yet.")}</p>${w.id !== "all" ? `<div class="sig-criteria">${w.includeTerms.length ? `<span>Any of: ${w.includeTerms.slice(0, 8).map(esc).join(", ")}${w.includeTerms.length > 8 ? "…" : ""}</span>` : ""}${w.accounts.length ? `<span>Following ${w.accounts.length}</span>` : ""}${w.sources.length ? `<span>${w.sources.map((x) => esc(SOURCE_LABELS[x])).join(", ")}</span>` : `<span>All sources</span>`}${w.excludeTerms.length ? `<span>Excludes ${w.excludeTerms.length}</span>` : ""}<span>Score ≥ ${w.minScore}</span>${w.starter ? `<span class="crm-tag sample" title="Starter watch included with the demo; edit freely">Starter</span>` : ""}</div>` : ""}</div>${w.id !== "all" ? `<button class="button small" data-sig="edit">${icon("edit")} Edit criteria</button>` : ""}</div>`;
    const body = empty
      ? `<div class="empty-state crm-empty">${icon("feed")}<h2>No signals fetched yet.</h2><p>Sources run every 15 minutes. Fetch them now to see the first results.</p><button class="button primary" data-sig="refresh">Fetch sources now</button></div>`
      : list.length
        ? `<ol class="sig-list">${list.slice(0, s.showAll).map(row).join("")}</ol>${list.length > s.showAll ? `<button class="button sig-more" data-sig="more">Show ${Math.min(60, list.length - s.showAll)} more of ${list.length - s.showAll}</button>` : ""}`
        : `<div class="empty-state crm-empty">${icon("search")}<h2>Nothing matches.</h2><p>${s.query ? `No signal mentions “${esc(s.query)}”. ` : ""}Try lowering the minimum score, widening topics, or clearing the source filter.</p><button class="button" data-sig="clear">Clear filters</button></div>`;
    return `${head}
      <div class="sig-layout">${watchNav()}<div class="sig-center">${watchHead}${toolbar}${chips}<p class="crm-muted sig-count">${list.length} signal${list.length === 1 ? "" : "s"}${s.query ? ` matching “${esc(s.query)}”` : ""}</p>${body}</div><aside class="sig-side">${sourcesPanel()}${methodPanel()}</aside></div>
      ${s.draft ? editor() : ""}`;
  }

  // ------------------------------------------------------------------ actions
  function openEditor(watch) {
    s.draft = watch ? JSON.parse(JSON.stringify(watch)) : { name: "", description: "", sources: [], kinds: [], includeTerms: [], requireTerms: [], excludeTerms: [], accounts: [], minScore: 40, delivery: "feed" };
    s.justOpened = true;
    s.focusAfter = '#sig-watch-form input[name="name"]';
    rerender();
  }
  function closeEditor() {
    s.draft = null;
    s.focusAfter = s.watch === "all" ? '[data-sig="new"]' : '[data-sig="edit"]';
    rerender();
  }
  function readForm(form) {
    const f = new FormData(form);
    return {
      name: String(f.get("name") || "").trim(), description: String(f.get("description") || "").trim(),
      includeTerms: splitTerms(f.get("includeTerms")), requireTerms: splitTerms(f.get("requireTerms")), excludeTerms: splitTerms(f.get("excludeTerms")), accounts: splitTerms(f.get("accounts")),
      sources: f.getAll("sources"), kinds: f.getAll("kinds"), minScore: Number(f.get("minScore")), delivery: f.get("delivery"),
    };
  }
  const errMsg = (e) => (e.details?.[0] ? `${e.details[0].path.join(".")}: ${e.details[0].message}` : e.message);

  async function refreshSources() {
    if (s.refreshing) return;
    s.refreshing = true;
    rerender();
    try {
      const r = await api("/api/signals/refresh", { method: "POST", body: JSON.stringify({}) });
      const added = r.ran.reduce((n, x) => n + (x.inserted || 0), 0);
      const failed = r.ran.filter((x) => x.status === "error").map((x) => SOURCE_LABELS[x.source]);
      await load();
      toast(r.ran.length ? `${added} new signal${added === 1 ? "" : "s"} from ${r.ran.length - failed.length} source${r.ran.length - failed.length === 1 ? "" : "s"}${failed.length ? ` · ${failed.join(", ")} failed` : ""}` : "Everything was fetched in the last 10 minutes", !!failed.length && failed.length === r.ran.length);
    } catch (e) {
      toast(errMsg(e), true);
    } finally {
      s.refreshing = false;
      s.focusAfter = '[data-sig="refresh"]';
      rerender();
    }
  }

  document.addEventListener("click", async (event) => {
    const el = event.target.closest("[data-sig]");
    if (!el || !isView()) return;
    const a = el.dataset.sig;
    if (a === "method") return;
    if (a === "retry") { s.error = null; s.data = null; return rerender(); }
    if (a === "watch") { s.watch = el.dataset.id; s.showAll = 60; s.promoting = null; s.focusAfter = `[data-sig="watch"][data-id="${s.watch}"]`; return rerender(); }
    if (a === "source") { const id = el.dataset.id; s.sources = s.sources.includes(id) ? s.sources.filter((x) => x !== id) : [...s.sources, id]; s.focusAfter = `[data-sig="source"][data-id="${id}"]`; return rerender(); }
    if (a === "clear") { s.query = ""; s.sources = []; return rerender(); }
    if (a === "more") { s.showAll += 60; return rerender(); }
    if (a === "refresh") return refreshSources();
    if (a === "new") return openEditor(null);
    if (a === "edit") return openEditor(current());
    if (a === "close") { if (event.target === el || el.tagName === "BUTTON") return closeEditor(); return; }
    if (a === "promote") { s.promoting = el.dataset.id; s.focusAfter = "#sig-promote-name"; return rerender(); }
    if (a === "promote-cancel") { const id = s.promoting; s.promoting = null; s.focusAfter = `[data-sig="promote"][data-id="${CSS.escape(id)}"]`; return rerender(); }
    if (a === "vote") {
      const w = current();
      const vote = Number(el.dataset.vote);
      try {
        await api("/api/signals/vote", { method: "POST", body: JSON.stringify({ watchId: w.id, signalId: el.dataset.id, vote }) });
        if (vote === 0) delete w.votes[el.dataset.id]; else w.votes[el.dataset.id] = vote;
        toast(vote < 0 ? "Hidden from this watch" : vote > 0 ? "Boosted in this watch" : "Boost removed");
        rerender();
      } catch (e) { toast(errMsg(e), true); }
      return;
    }
    if (a === "archive") {
      const d = s.draft;
      try {
        await api(`/api/watches/${d.id}`, { method: "PATCH", body: JSON.stringify({ expectedVersion: d.version, changes: { archived: true } }) });
        s.draft = null; s.watch = "all";
        await load();
        toast(`Archived “${d.name}”. Its revisions are kept.`);
        rerender();
      } catch (e) { toast(errMsg(e), true); }
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-sig-form]");
    if (!form || !isView()) return;
    event.preventDefault();
    if (form.dataset.sigForm === "watch") {
      const body = readForm(form);
      const d = s.draft;
      try {
        if (d.id) {
          const changes = Object.fromEntries(Object.entries(body).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(d[k])));
          if (!Object.keys(changes).length) return closeEditor();
          await api(`/api/watches/${d.id}`, { method: "PATCH", body: JSON.stringify({ expectedVersion: d.version, changes }) });
          toast(`Saved “${body.name}”`);
        } else {
          const r = await api("/api/watches", { method: "POST", body: JSON.stringify(body) });
          s.watch = r.watch.id;
          toast(`Created “${body.name}”`);
        }
        s.draft = null;
        await load();
        s.focusAfter = `[data-sig="watch"][data-id="${s.watch}"]`;
        rerender();
      } catch (e) {
        toast(e.status === 409 ? e.message : errMsg(e), true);
        if (e.status === 409) { s.draft = null; await load(); rerender(); }
      }
    }
    if (form.dataset.sigForm === "promote") {
      const name = new FormData(form).get("name");
      try {
        const r = await api("/api/signals/promote", { method: "POST", body: JSON.stringify({ signalId: form.dataset.id, name, actor: viewerId() }) });
        s.promoting = null;
        ctx.onCrmChange?.();
        await load();
        toast(r.created ? `${r.org.name} added to the CRM at Sourced` : `${r.org.name} was already in the CRM; signal logged on it`);
        rerender();
      } catch (e) { toast(errMsg(e), true); }
    }
  });

  // Live preview while editing: re-score on every keystroke without saving.
  document.addEventListener("input", (event) => {
    if (!isView()) return;
    if (event.target.id === "sig-search") {
      s.query = event.target.value;
      clearTimeout(s.searchTimer);
      s.searchTimer = setTimeout(() => { s.focusAfter = "#sig-search"; s.caret = event.target.selectionStart; rerender(); }, 160);
      return;
    }
    const form = event.target.closest('[data-sig-form="watch"]');
    if (!form || !s.draft) return;
    const body = readForm(form);
    if (event.target.name === "minScore") $("#sig-min-out").textContent = body.minScore;
    const n = countFor({ ...s.draft, ...body, votes: watches().find((w) => w.id === s.draft.id)?.votes || {} });
    $("#sig-live-n").textContent = n;
  });
  document.addEventListener("change", (event) => {
    if (!isView()) return;
    if (event.target.matches('[data-sig-filter="sort"]')) { s.sort = event.target.value; s.focusAfter = '[data-sig-filter="sort"]'; rerender(); return; }
    const form = event.target.closest('[data-sig-form="watch"]');
    if (form && s.draft) $("#sig-live-n").textContent = countFor({ ...s.draft, ...readForm(form), votes: watches().find((w) => w.id === s.draft.id)?.votes || {} });
  });
  document.addEventListener("toggle", (event) => { if (event.target.matches?.(".sig-method")) s.method = event.target.open; }, true);

  document.addEventListener("keydown", (event) => {
    if (!isView()) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
    if ((event.key === "/" && !typing) || (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      $("#sig-search")?.focus();
      $("#sig-search")?.select();
    } else if (event.key === "Escape" && s.draft) {
      event.preventDefault();
      closeEditor();
    } else if (event.key === "Escape" && s.promoting) {
      s.promoting = null;
      rerender();
    }
  });

  return {
    render,
    afterRender() {
      document.querySelectorAll("body > .sig-portal").forEach((n) => n.remove());
      const parts = document.querySelectorAll("#main .sig-editor, #main .crm-scrim[data-sig]");
      if (parts.length) {
        const portal = document.createElement("div");
        portal.className = "sig-portal";
        parts.forEach((n) => portal.appendChild(n));
        document.body.appendChild(portal);
      }
      s.justOpened = false;
      if (s.focusAfter) {
        const el = document.querySelector(s.focusAfter);
        el?.focus({ preventScroll: true });
        if (el && el.id === "sig-search" && s.caret != null) { el.setSelectionRange(s.caret, s.caret); s.caret = null; }
        s.focusAfter = null;
      }
      document.body.classList.toggle("crm-drawer-open", !!s.draft && isView());
    },
    reset() { s.draft = null; s.promoting = null; },
    scoreSignal,
  };
}
