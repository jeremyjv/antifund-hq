// In-house CRM views: one table, many views (People, Companies, Pipeline, Activity),
// search-first, and a side drawer for every record. Records live in D1 via /api/crm;
// teammates' agents read and write the same records over MCP.
import { STAGES, stageLabel, lastTouch, whoKnows } from "../../packages/core/crm-derive.js";

const KINDS = {
  people: [["founder", "Founders"], ["investor", "Investors"], ["lp", "LPs"], ["expert", "Experts"], ["operator", "Operators"]],
  orgs: [["company", "Companies"], ["fund", "Funds"], ["lp", "LPs"], ["lab", "Labs"]],
};
const TOUCH_KINDS = [["meeting", "Meeting"], ["call", "Call"], ["email", "Email"], ["intro", "Intro"], ["note", "Note"]];
const STRENGTH = { cold: "Cold", warm: "Warm", strong: "Strong" };
const STALE_DAYS = 45;

export function createCrm(ctx) {
  const { api, esc, icon, toast, viewerId, rerender, mark, catalogCompany, members } = ctx;
  const s = {
    data: null, error: null, loading: false, tab: "people", query: "", owner: "all", kind: "all", archived: false,
    sort: { people: ["last", "desc"], orgs: ["last", "desc"] }, open: null, editing: false, saving: false, preset: null, focusAfter: null,
  };
  const $ = (sel) => document.querySelector(sel);
  const name = (id) => members().find((m) => m.id === id)?.name || (id ? id[0].toUpperCase() + id.slice(1) : "");
  const today = () => new Date().toISOString().slice(0, 10);
  const days = (at) => (at ? Math.floor((Date.now() - new Date(at).getTime()) / 86400000) : null);
  const rel = (at) => {
    const d = days(at);
    if (d === null) return "Never";
    if (d <= 0) return "Today";
    if (d === 1) return "Yesterday";
    if (d < 14) return `${d}d ago`;
    if (d < 60) return `${Math.round(d / 7)}w ago`;
    return `${Math.round(d / 30)}mo ago`;
  };
  const fmtDay = (v) => (v ? new Date(`${v.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
  const initials = (n) => esc(String(n || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase());
  const avatar = (n, cls = "") => `<span class="crm-avatar ${cls}" aria-hidden="true">${initials(n)}</span>`;
  const member = (id) => (id ? `<span class="crm-member">${avatar(name(id), "sm")}${esc(name(id))}</span>` : `<span class="crm-muted">Unassigned</span>`);
  const orgOf = (p) => s.data.orgs.find((o) => o.id === p.orgId);
  const orgMark = (o) => (o?.catalogId && catalogCompany(o.catalogId) ? mark(catalogCompany(o.catalogId)) : `<span class="company-mark crm-mark" aria-hidden="true">${initials(o?.name)}</span>`);
  const sampleTag = (r) => (r.sample ? `<span class="crm-tag sample" title="Fictional record for the demo">Sample</span>` : "");
  const touchLabel = (r) => {
    const at = lastTouch(s.data, r);
    const d = days(at);
    return `<span class="crm-touch ${d === null ? "none" : d > STALE_DAYS ? "stale" : ""}" title="${at ? esc(new Date(at).toLocaleString()) : "No logged interactions"}">${rel(at)}</span>`;
  };
  const due = (o) => {
    if (!o.nextStepDue) return "";
    const late = o.nextStepDue < today() && !["invested", "passed"].includes(o.stage);
    return `<span class="crm-due ${late ? "late" : ""}">${late ? "Overdue · " : ""}${fmtDay(o.nextStepDue)}</span>`;
  };
  const stagePill = (st) => (st ? `<span class="crm-stage s-${esc(st)}">${esc(stageLabel(st))}</span>` : `<span class="crm-muted">—</span>`);

  async function load() {
    s.loading = true;
    try {
      const data = await api(`/api/crm${s.archived ? "?archived=true" : ""}`);
      ctx.setCsrf(data.csrfToken);
      s.data = data;
      s.error = null;
    } catch (e) {
      s.error = e.message;
    } finally {
      s.loading = false;
    }
  }

  // Search covers the record and everything logged against it, so "drone" finds the founder you discussed drones with.
  const touchText = (r) => s.data.interactions.filter((t) => t.personId === r.id || t.orgId === r.id).map((t) => t.summary).join(" ");
  const haystack = (r) => {
    if (r.type === "person") return `${r.name} ${r.title || ""} ${orgOf(r)?.name || ""} ${r.kind} ${r.location || ""} ${r.email || ""} ${r.notes || ""} ${touchText(r)}`;
    return `${r.name} ${r.sector || ""} ${r.domain || ""} ${r.nextStep || ""} ${r.notes || ""} ${r.kind} ${touchText(r)}`;
  };
  const matches = (r) => {
    const q = s.query.trim().toLowerCase();
    if (q && !haystack(r).toLowerCase().includes(q)) return false;
    if (s.owner !== "all" && (r.type === "person" ? r.relOwner : r.dealOwner) !== s.owner) return false;
    return true;
  };
  function rows(type) {
    const kind = s.preset?.kind || s.kind;
    const list = (type === "people" ? s.data.people : s.data.orgs).filter((r) => matches(r) && (kind === "all" || r.kind === kind));
    const [key, dir] = s.sort[type];
    const val = (r) => (key === "name" ? r.name.toLowerCase() : key === "last" ? lastTouch(s.data, r) || "" : key === "owner" ? name(r.type === "person" ? r.relOwner : r.dealOwner) || "~" : key === "org" ? orgOf(r)?.name?.toLowerCase() || "~" : key === "stage" ? (r.stage ? STAGES.indexOf(r.stage) : 99) : "");
    return list.sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * (dir === "asc" ? 1 : -1) || a.name.localeCompare(b.name);
    });
  }
  const th = (type, key, label) => {
    const [k, d] = s.sort[type];
    const active = k === key;
    return `<th scope="col" aria-sort="${active ? (d === "asc" ? "ascending" : "descending") : "none"}"><button class="crm-sort ${active ? "active" : ""}" data-crm="sort" data-type="${type}" data-key="${key}">${label}<span aria-hidden="true">${active ? (d === "asc" ? "↑" : "↓") : ""}</span></button></th>`;
  };
  const empty = (what) => `<div class="empty-state crm-empty">${icon("search")}<h2>No ${what} match.</h2><p>${s.query ? `Nothing for “${esc(s.query)}”. ` : ""}Try another search or clear the filters.</p><button type="button" class="button" data-crm="clear">Clear filters</button></div>`;

  function peopleTable() {
    const list = rows("people");
    if (!list.length) return empty("people");
    return `<table class="crm-table"><thead><tr>${th("people", "name", "Name")}${th("people", "org", "Organization")}<th scope="col">Type</th>${th("people", "owner", "Owner")}<th scope="col">Strength</th>${th("people", "last", "Last touch")}</tr></thead><tbody>${list
      .map((p) => {
        const o = orgOf(p);
        return `<tr class="${s.open?.id === p.id ? "selected" : ""}"><td><button class="crm-row-open" data-crm="open" data-type="person" data-id="${esc(p.id)}">${avatar(p.name)}<span><span class="crm-name">${esc(p.name)}</span>${sampleTag(p)}<span class="crm-sub">${esc(p.title || "")}</span></span></button></td><td>${o ? `<button class="crm-link" data-crm="open" data-type="org" data-id="${esc(o.id)}">${esc(o.name)}</button>` : `<span class="crm-muted">—</span>`}</td><td><span class="crm-kind">${esc(p.kind)}</span></td><td>${member(p.relOwner)}</td><td><span class="crm-strength ${esc(p.strength)}" title="${esc(STRENGTH[p.strength])}"><i></i><i></i><i></i><span>${esc(STRENGTH[p.strength])}</span></span></td><td>${touchLabel(p)}</td></tr>`;
      })
      .join("")}</tbody></table>`;
  }
  function orgTable() {
    const list = rows("orgs");
    if (!list.length) return empty("organizations");
    return `<table class="crm-table"><thead><tr>${th("orgs", "name", "Name")}<th scope="col">Type</th>${th("orgs", "stage", "Stage")}${th("orgs", "owner", "Owner")}<th scope="col">Next step</th>${th("orgs", "last", "Last touch")}</tr></thead><tbody>${list
      .map((o) => `<tr class="${s.open?.id === o.id ? "selected" : ""}"><td><button class="crm-row-open" data-crm="open" data-type="org" data-id="${esc(o.id)}">${orgMark(o)}<span><span class="crm-name">${esc(o.name)}</span>${sampleTag(o)}${o.catalogId ? `<span class="crm-tag research" title="From the public research catalog">Research</span>` : ""}<span class="crm-sub">${esc(o.sector || "")}</span></span></button></td><td><span class="crm-kind">${esc(o.kind)}</span></td><td>${stagePill(o.stage)}</td><td>${member(o.dealOwner)}</td><td class="crm-next">${o.nextStep ? `<span>${esc(o.nextStep)}</span>${due(o)}` : `<span class="crm-muted">—</span>`}</td><td>${touchLabel(o)}</td></tr>`)
      .join("")}</tbody></table>`;
  }
  function board() {
    const deals = s.data.orgs.filter((o) => o.stage && matches(o));
    return `<div class="crm-board" role="list">${STAGES.map((st) => {
      const cards = deals.filter((o) => o.stage === st).sort((a, b) => (a.nextStepDue || "9").localeCompare(b.nextStepDue || "9"));
      return `<section class="crm-col" data-stage="${st}" role="listitem" aria-label="${esc(stageLabel(st))}, ${cards.length} deals"><header><span class="crm-stage s-${st}">${esc(stageLabel(st))}</span><span class="crm-count">${cards.length}</span></header><div class="crm-col-body">${cards
        .map((o) => `<button class="crm-card ${s.open?.id === o.id ? "selected" : ""}" draggable="true" data-crm="open" data-type="org" data-id="${esc(o.id)}"><span class="crm-card-top">${orgMark(o)}<span><span class="crm-name">${esc(o.name)}</span>${sampleTag(o)}<span class="crm-sub">${esc(o.sector || "")}</span></span></span>${o.nextStep ? `<span class="crm-card-next">${esc(o.nextStep)}</span>` : ""}<span class="crm-card-foot">${o.dealOwner ? `${avatar(name(o.dealOwner), "sm")}<span>${esc(name(o.dealOwner))}</span>` : `<span class="crm-muted">Unassigned</span>`}${due(o)}</span></button>`)
        .join("") || `<p class="crm-col-empty">No deals</p>`}</div></section>`;
    }).join("")}</div><p class="crm-hint">Drag a card to change its stage, or open it and pick a stage. Every move is logged.</p>`;
  }
  const recordName = (t) => {
    const r = s.data.people.find((p) => p.id === t.personId) || s.data.orgs.find((o) => o.id === t.orgId);
    return r ? `<button class="crm-link" data-crm="open" data-type="${r.type}" data-id="${esc(r.id)}">${esc(r.name)}</button>` : "";
  };
  const touchRow = (t, withRecord = true) => `<li class="crm-touchrow k-${esc(t.kind)}"><span class="crm-when" title="${esc(new Date(t.at).toLocaleString())}">${fmtDay(t.at)}</span><span class="crm-touch-body"><span class="crm-touch-meta">${avatar(name(t.actor), "sm")}<strong>${esc(name(t.actor))}</strong><span class="crm-kind">${esc(t.kind === "stage" ? "stage change" : t.kind)}</span>${t.source === "agent" ? `<span class="crm-tag agent" title="Written by this teammate's agent over MCP">${icon("spark")}via agent</span>` : ""}${withRecord ? recordName(t) : ""}</span><span class="crm-touch-text">${esc(t.summary)}</span></span></li>`;
  function activity() {
    const q = s.query.trim().toLowerCase();
    const list = s.data.interactions.filter((t) => (s.owner === "all" || t.actor === s.owner) && (!q || `${t.summary} ${t.kind} ${name(t.actor)}`.toLowerCase().includes(q))).slice(0, 200);
    return list.length ? `<ol class="crm-timeline wide">${list.map((t) => touchRow(t)).join("")}</ol>` : empty("interactions");
  }

  function results() {
    if (s.tab === "pipeline") return board();
    if (s.tab === "activity") return activity();
    return s.tab === "orgs" ? orgTable() : peopleTable();
  }

  // ---------- Drawer ----------
  const options = (pairs, selected, blank) => `${blank ? `<option value="">${esc(blank)}</option>` : ""}${pairs.map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(l)}</option>`).join("")}`;
  const memberOpts = (sel, blank = "Unassigned") => options(members().map((m) => [m.id, m.name]), sel, blank);
  const logForm = (r) => `<form class="crm-log" data-crm-form="log" data-type="${r.type}" data-id="${esc(r.id)}"><div class="crm-log-kinds" role="radiogroup" aria-label="Interaction type">${TOUCH_KINDS.map(([v, l], i) => `<label><input type="radio" name="kind" value="${v}" ${i === 0 ? "checked" : ""}><span>${l}</span></label>`).join("")}</div><label class="visually-hidden" for="crm-log-summary">What happened</label><textarea id="crm-log-summary" name="summary" rows="2" maxlength="1000" required placeholder="What happened? e.g. Raising a seed in Q1, wants intros to drone OEMs"></textarea><div class="crm-log-foot"><label class="crm-inline">Date <input type="date" name="occurredAt" value="${today()}" max="${today()}"></label><span class="crm-muted">Logged as ${esc(name(viewerId()))}</span><button class="button primary small" type="submit">Log ${icon("check")}</button></div></form>`;
  const field = (label, value) => `<div class="crm-field"><dt>${label}</dt><dd>${value || `<span class="crm-muted">—</span>`}</dd></div>`;
  const knows = (r) => {
    const list = whoKnows(s.data, r);
    return list.length ? `<ul class="crm-knows">${list.map((w) => `<li>${avatar(name(w.member))}<span><strong>${esc(name(w.member))}</strong><span class="crm-sub">${w.touches ? `${w.touches} touch${w.touches > 1 ? "es" : ""} · last ${rel(w.last)}` : esc(w.reasons[0])}</span></span></li>`).join("")}</ul>` : `<p class="crm-muted">Nobody on the team has logged a touch yet.</p>`;
  };
  const timeline = (r) => {
    const ids = r.type === "org" ? new Set([r.id, ...s.data.people.filter((p) => p.orgId === r.id).map((p) => p.id)]) : new Set([r.id]);
    const list = s.data.interactions.filter((t) => ids.has(t.personId) || ids.has(t.orgId));
    return list.length ? `<ol class="crm-timeline">${list.map((t) => touchRow(t, r.type === "org" && t.personId)).join("")}</ol>` : `<p class="crm-muted">No interactions yet. Log the first one above, or ask your agent to.</p>`;
  };
  function editForm(r, isNew) {
    const person = r.type === "person";
    const orgOpts = s.data.orgs.filter((o) => !o.archived).map((o) => [o.id, o.name]);
    return `<form class="crm-edit" data-crm-form="${isNew ? "create" : "edit"}" data-type="${r.type}" data-id="${esc(r.id || "")}">
      <label>Name<input name="name" required maxlength="200" value="${esc(r.name || "")}" autocomplete="off"></label>
      <div class="crm-two"><label>Type<select name="kind">${options(person ? KINDS.people.map(([v, l]) => [v, l.replace(/s$/, "")]) : KINDS.orgs.map(([v, l]) => [v, l.replace(/s$/, "")]), r.kind)}</select></label>
      ${person ? `<label>Title<input name="title" maxlength="120" value="${esc(r.title || "")}"></label>` : `<label>Sector<input name="sector" maxlength="120" value="${esc(r.sector || "")}"></label>`}</div>
      ${person ? `<label>Organization<select name="orgId">${options(orgOpts, r.orgId, "None")}</select></label><div class="crm-two"><label>Email<input name="email" type="email" maxlength="200" value="${esc(r.email || "")}"></label><label>Location<input name="location" maxlength="120" value="${esc(r.location || "")}"></label></div>`
        : `<label>Website<input name="domain" maxlength="200" value="${esc(r.domain || "")}" placeholder="example.com"></label>`}
      <label>Notes<textarea name="notes" rows="3" maxlength="5000">${esc(r.notes || "")}</textarea></label>
      <div class="crm-edit-foot"><button type="button" class="button" data-crm="${isNew ? "close" : "cancel-edit"}">Cancel</button><button type="submit" class="button primary">${isNew ? "Create" : "Save"}</button></div></form>`;
  }
  function drawer() {
    if (!s.open) return "";
    const { type, id } = s.open;
    const isNew = id === "new";
    const r = isNew ? { type, kind: type === "person" ? "founder" : "company", strength: "cold" } : (type === "person" ? s.data.people : s.data.orgs).find((x) => x.id === id);
    if (!r) return "";
    const title = isNew ? (type === "person" ? "New person" : "New organization") : r.name;
    let body;
    if (isNew || s.editing) body = editForm(r, isNew);
    else if (type === "person") {
      const o = orgOf(r);
      body = `<div class="crm-quick"><label>Owner<select data-crm-patch="relOwner">${memberOpts(r.relOwner)}</select></label><label>Strength<select data-crm-patch="strength">${options(Object.entries(STRENGTH), r.strength)}</select></label></div>
        <section><h3>Log an interaction</h3>${logForm(r)}</section>
        <section><h3>Details</h3><dl class="crm-fields">${field("Organization", o ? `<button class="crm-link" data-crm="open" data-type="org" data-id="${esc(o.id)}">${esc(o.name)}</button>` : "")}${field("Email", r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : "")}${field("Location", esc(r.location || ""))}${field("Last touch", touchLabel(r))}</dl>${r.notes ? `<p class="crm-notes">${esc(r.notes)}</p>` : ""}</section>
        <section><h3>Who knows them</h3>${knows(r)}</section>
        <section><h3>Timeline</h3>${timeline(r)}</section>`;
    } else {
      const people = s.data.people.filter((p) => p.orgId === r.id);
      const research = r.catalogId && catalogCompany(r.catalogId);
      body = `<div class="crm-quick"><label>Stage<select data-crm-patch="stage">${options(STAGES.map((st) => [st, stageLabel(st)]), r.stage, "No stage")}</select></label><label>Owner<select data-crm-patch="dealOwner">${memberOpts(r.dealOwner)}</select></label></div>
        <form class="crm-next-form" data-crm-form="next" data-id="${esc(r.id)}"><label>Next step<input name="nextStep" maxlength="300" value="${esc(r.nextStep || "")}" placeholder="e.g. Reference calls with pilot customers"></label><label>Due<input type="date" name="nextStepDue" value="${esc(r.nextStepDue || "")}"></label>${r.stage === "passed" ? `<label class="crm-wide">Pass reason<input name="passReason" maxlength="300" value="${esc(r.passReason || "")}"></label>` : ""}<button class="button small" type="submit">Save</button></form>
        <section><h3>Log an interaction</h3>${logForm(r)}</section>
        <section><h3>People · ${people.length}</h3>${people.length ? `<ul class="crm-people">${people.map((p) => `<li><button class="crm-row-open" data-crm="open" data-type="person" data-id="${esc(p.id)}">${avatar(p.name)}<span><span class="crm-name">${esc(p.name)}</span><span class="crm-sub">${esc(p.title || p.kind)}</span></span></button>${touchLabel(p)}</li>`).join("")}</ul>` : `<p class="crm-muted">No people yet.</p>`}<button class="button small" data-crm="new-person-at" data-id="${esc(r.id)}">${icon("plus")} Add person</button></section>
        <section><h3>Who knows them</h3>${knows(r)}</section>
        ${research ? `<section><h3>Public research</h3><p class="crm-notes">${esc(research.summary || "")}</p><a class="text-link" href="#companies">Open in Companies ${icon("arrow")}</a></section>` : ""}
        ${r.notes ? `<section><h3>Notes</h3><p class="crm-notes">${esc(r.notes)}</p></section>` : ""}
        <section><h3>Timeline</h3>${timeline(r)}</section>`;
    }
    const sub = isNew ? "" : type === "person" ? [r.title, orgOf(r)?.name].filter(Boolean).map(esc).join(" · ") : esc(r.sector || r.kind);
    const head = isNew ? "" : type === "person" ? avatar(r.name, "lg") : orgMark(r);
    const foot = isNew || s.editing ? "" : `<footer class="crm-drawer-foot"><button class="button small" data-crm="edit">${icon("edit")} Edit details</button><button class="button small ${r.archived ? "" : "danger"}" data-crm="archive" data-archived="${r.archived ? "false" : "true"}">${icon(r.archived ? "restore" : "trash")} ${r.archived ? "Restore" : "Archive"}</button><span class="crm-muted">Version ${r.version} · revisions kept</span></footer>`;
    const enter = s.justOpened ? " crm-enter" : "";
    return `<div class="crm-scrim${enter}" data-crm="close"></div><aside class="crm-drawer${enter}" role="dialog" aria-modal="true" aria-labelledby="crm-drawer-title"><header class="crm-drawer-head">${head}<div><h2 id="crm-drawer-title">${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ""}<div class="crm-badges">${isNew ? "" : `<span class="crm-kind">${esc(r.kind)}</span>${sampleTag(r)}${r.archived ? `<span class="crm-tag">Archived</span>` : ""}`}</div></div><button class="icon-button" data-crm="close" aria-label="Close record">${icon("close")}</button></header><div class="crm-drawer-body">${body}</div>${foot}</aside>`;
  }

  // ---------- Page ----------
  function render(view) {
    s.preset = view === "founders" ? { kind: "founder" } : null;
    if (view === "founders") s.tab = "people";
    if (view === "pipeline") s.tab = "pipeline";
    const titles = {
      crm: ["CRM / All records", "Every relationship, one record.", "People, companies, deals, and every touch, in Anti Fund’s own database. Your agent reads and updates the same records over MCP."],
      founders: ["CRM / Founders", "Know every founder before the round.", "Who the team is tracking, who owns each relationship, and when we last spoke."],
      pipeline: ["Deals / Pipeline", "Every live deal, by stage.", "Sourced to decision. Drag to move a deal; owners, next steps, and every change are logged."],
    }[view];
    const actions = `<div class="crm-actions"><button class="button" data-crm="new" data-type="org">${icon("plus")} Organization</button><button class="button primary" data-crm="new" data-type="person">${icon("plus")} Person</button></div>`;
    const head = ctx.heading(titles[0], titles[1], titles[2], actions);
    if (!s.data) {
      if (!s.loading && !s.error) load().then(rerender);
      return `${head}${s.error ? `<div class="error-state"><h2>The CRM could not be loaded.</h2><p>${esc(s.error)}</p><button class="button" data-crm="retry">Try again</button></div>` : `<div class="loading-line"></div><p class="loading-label">Loading CRM…</p>`}`;
    }
    const counts = { people: s.data.people.filter((p) => !s.preset || p.kind === s.preset.kind).length, orgs: s.data.orgs.length, pipeline: s.data.orgs.filter((o) => o.stage).length, activity: s.data.interactions.length };
    const tabs = view === "crm" ? `<div class="crm-tabs" role="tablist" aria-label="CRM views">${[["people", "People"], ["orgs", "Organizations"], ["pipeline", "Pipeline"], ["activity", "Activity"]].map(([id, l]) => `<button role="tab" aria-selected="${s.tab === id}" class="${s.tab === id ? "active" : ""}" data-crm="tab" data-id="${id}">${l}<span>${counts[id]}</span></button>`).join("")}</div>` : "";
    const kindSel = ["people", "orgs"].includes(s.tab) && !s.preset ? `<select class="select" data-crm-filter="kind" aria-label="Filter by type"><option value="all">All types</option>${options(KINDS[s.tab], s.kind)}</select>` : "";
    const toolbar = `<div class="crm-toolbar"><label class="search-field crm-search">${icon("search")}<input id="crm-search" type="search" value="${esc(s.query)}" placeholder="Search names, companies, notes…" aria-label="Search the CRM" autocomplete="off"><kbd>/</kbd></label><div class="crm-filters">${kindSel}<select class="select" data-crm-filter="owner" aria-label="Filter by owner"><option value="all">Anyone</option>${options(members().map((m) => [m.id, m.name]), s.owner)}</select><label class="crm-check"><input type="checkbox" data-crm-filter="archived" ${s.archived ? "checked" : ""}> Archived</label></div></div>`;
    const sample = s.data.people.some((p) => p.sample) ? `<p class="crm-banner">${icon("lock")}<span>Private to your workspace. Records marked <span class="crm-tag sample">Sample</span> are fictional so the demo isn’t empty; companies marked <span class="crm-tag research">Research</span> come from the public catalog with no stage or activity, which implies no Anti Fund relationship.</span></p>` : "";
    return `${head}${tabs}${toolbar}<div class="table-wrap crm-results" id="crm-results">${results()}</div>${sample}${drawer()}`;
  }

  // ---------- Writes ----------
  async function write(path, method, body, okMessage) {
    if (s.saving) return false;
    s.saving = true;
    try {
      await api(path, { method, body: JSON.stringify({ ...body, actor: viewerId() }) });
      await load();
      if (okMessage) toast(okMessage);
      return true;
    } catch (e) {
      toast(e.status === 409 ? "Someone else just changed this record. Showing the latest version." : e.message, true);
      if (e.status === 409) await load();
      return false;
    } finally {
      s.saving = false;
    }
  }
  const current = () => s.open && s.open.id !== "new" && (s.open.type === "person" ? s.data.people : s.data.orgs).find((x) => x.id === s.open.id);
  const patch = (r, changes, msg) => write(`/api/crm/${r.type === "person" ? "people" : "orgs"}/${r.id}`, "PATCH", { expectedVersion: r.version, changes }, msg);
  function refresh(focus) {
    s.focusAfter = focus;
    rerender();
  }
  const isCrmView = () => ["crm", "founders", "pipeline"].includes(ctx.view());

  function openRecord(type, id, focus = "#crm-drawer-title") {
    s.lastTrigger = document.activeElement;
    if (s.open?.id !== id) s.justOpened = !s.open;
    s.open = { type, id };
    s.editing = false;
    refresh(id === "new" ? '.crm-edit input[name="name"]' : focus);
  }
  function close() {
    const trigger = s.open && `[data-crm="open"][data-id="${s.open.id}"]`;
    s.open = null;
    s.editing = false;
    refresh(trigger);
  }

  document.addEventListener("click", async (event) => {
    const el = event.target.closest("[data-crm]");
    if (!el || !isCrmView()) return;
    const a = el.dataset.crm;
    if (a === "open") return openRecord(el.dataset.type, el.dataset.id);
    if (a === "close") return close();
    if (a === "new") return openRecord(el.dataset.type, "new");
    if (a === "new-person-at") { s.newAt = el.dataset.id; return openRecord("person", "new"); }
    if (a === "tab") { s.tab = el.dataset.id; s.kind = "all"; return refresh(`[data-crm="tab"][data-id="${s.tab}"]`); }
    if (a === "sort") {
      const t = el.dataset.type, k = el.dataset.key, [ck, cd] = s.sort[t];
      s.sort[t] = [k, ck === k ? (cd === "asc" ? "desc" : "asc") : k === "last" ? "desc" : "asc"];
      return refresh(`[data-crm="sort"][data-key="${k}"]`);
    }
    if (a === "clear") { s.query = ""; s.owner = "all"; s.kind = "all"; return refresh("#crm-search"); }
    if (a === "retry") { s.error = null; await load(); return rerender(); }
    if (a === "edit") { s.editing = true; return refresh('.crm-edit input[name="name"]'); }
    if (a === "cancel-edit") { s.editing = false; return refresh('[data-crm="edit"]'); }
    if (a === "archive") {
      const r = current();
      if (r && (await patch(r, { archived: el.dataset.archived === "true" }, el.dataset.archived === "true" ? `${r.name} archived. Find it under Archived.` : `${r.name} restored.`))) close();
    }
  });

  document.addEventListener("change", async (event) => {
    if (!isCrmView()) return;
    const f = event.target.dataset.crmFilter;
    if (f) {
      if (f === "archived") { s.archived = event.target.checked; s.open = null; await load(); return refresh(`[data-crm-filter="archived"]`); }
      s[f] = event.target.value;
      return refresh(`[data-crm-filter="${f}"]`);
    }
    const p = event.target.dataset.crmPatch;
    if (p) {
      const r = current();
      if (!r) return;
      const value = event.target.value || null;
      if (await patch(r, { [p]: value }, p === "stage" ? `${r.name} moved to ${stageLabel(value)}` : "Saved")) refresh(`[data-crm-patch="${p}"]`);
      else rerender();
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id !== "crm-search") return;
    s.query = event.target.value;
    const box = $("#crm-results");
    if (box) box.innerHTML = results();
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-crm-form]");
    if (!form) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const kind = form.dataset.crmForm;
    const clean = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]));
    if (kind === "log") {
      const body = { kind: data.kind, summary: data.summary.trim(), occurredAt: data.occurredAt || undefined, [form.dataset.type === "person" ? "personId" : "orgId"]: form.dataset.id };
      if (await write("/api/crm/interactions", "POST", body, "Logged")) refresh("#crm-log-summary");
    } else if (kind === "next") {
      const r = current();
      const changes = clean({ nextStep: data.nextStep, nextStepDue: data.nextStepDue, ...("passReason" in data ? { passReason: data.passReason } : {}) });
      if (r && (await patch(r, changes, "Next step saved"))) refresh('.crm-next-form input[name="nextStep"]');
    } else if (kind === "edit") {
      const r = current();
      const changes = clean(data);
      changes.name = data.name.trim();
      changes.notes = data.notes || "";
      if (r && (await patch(r, changes, "Saved"))) { s.editing = false; refresh('[data-crm="edit"]'); }
    } else if (kind === "create") {
      const type = form.dataset.type;
      const body = clean(data);
      body.name = data.name.trim();
      body.notes = data.notes || "";
      if (type === "person") { body.relOwner = viewerId(); if (!body.orgId && s.newAt) body.orgId = s.newAt; }
      if (s.saving) return;
      s.saving = true;
      try {
        const res = await api(`/api/crm/${type === "person" ? "people" : "orgs"}`, { method: "POST", body: JSON.stringify({ ...body, actor: viewerId() }) });
        await load();
        const rec = res.person || res.org;
        s.newAt = null;
        toast(`${rec.name} added`);
        openRecord(type, rec.id);
      } catch (e) {
        toast(e.details?.[0] ? `${e.details[0].path.join(".")}: ${e.details[0].message}` : e.message, true);
      } finally {
        s.saving = false;
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!isCrmView()) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
    if ((event.key === "/" && !typing) || (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      $("#crm-search")?.focus();
      $("#crm-search")?.select();
    } else if (event.key === "Escape" && s.open) {
      event.preventDefault();
      close();
    } else if (event.key === "Enter" && !event.shiftKey && event.target.id === "crm-log-summary") {
      event.preventDefault();
      event.target.form.requestSubmit();
    }
  });

  // Drag and drop on the pipeline board; the drawer's stage select is the keyboard path.
  let dragId = null;
  document.addEventListener("dragstart", (e) => { const c = e.target.closest?.(".crm-card"); if (c) { dragId = c.dataset.id; e.dataTransfer.effectAllowed = "move"; c.classList.add("dragging"); } });
  document.addEventListener("dragend", (e) => { e.target.closest?.(".crm-card")?.classList.remove("dragging"); document.querySelectorAll(".crm-col.over").forEach((c) => c.classList.remove("over")); });
  document.addEventListener("dragover", (e) => { const col = e.target.closest?.(".crm-col"); if (col && dragId) { e.preventDefault(); document.querySelectorAll(".crm-col.over").forEach((c) => c !== col && c.classList.remove("over")); col.classList.add("over"); } });
  document.addEventListener("drop", async (e) => {
    const col = e.target.closest?.(".crm-col");
    if (!col || !dragId) return;
    e.preventDefault();
    const org = s.data.orgs.find((o) => o.id === dragId);
    dragId = null;
    if (org && org.stage !== col.dataset.stage && (await patch(org, { stage: col.dataset.stage }, `${org.name} moved to ${stageLabel(col.dataset.stage)}`))) rerender();
    else rerender();
  });

  // Coming back to the tab (e.g. after your agent logged a call) shows the latest records.
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !isCrmView() || !s.data || s.editing || s.open?.id === "new") return;
    const before = s.data.interactions.length + s.data.people.length + s.data.orgs.length;
    const active = document.activeElement;
    if (active && /^(INPUT|TEXTAREA)$/.test(active.tagName) && active.value) return;
    await load();
    if (s.data.interactions.length + s.data.people.length + s.data.orgs.length !== before) { toast("Updated with the latest activity"); rerender(); }
  });

  return {
    render,
    afterRender() {
      // The drawer lives outside the main column so no ancestor stacking context can trap it.
      document.querySelectorAll("body > .crm-portal").forEach((n) => n.remove());
      const parts = document.querySelectorAll("#main .crm-scrim, #main .crm-drawer");
      if (parts.length) {
        const portal = document.createElement("div");
        portal.className = "crm-portal";
        parts.forEach((n) => portal.appendChild(n));
        document.body.appendChild(portal);
      }
      s.justOpened = false;
      if (s.focusAfter) { document.querySelector(s.focusAfter)?.focus({ preventScroll: true }); s.focusAfter = null; }
      document.body.classList.toggle("crm-drawer-open", !!s.open && isCrmView());
    },
    reset() { s.open = null; s.editing = false; },
    // Another page (e.g. Signals → CRM) changed records; reload on next view.
    invalidate() { s.data = null; },
  };
}
