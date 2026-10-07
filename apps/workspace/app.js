import { dashboardSnapshot } from "../../packages/core/dashboard.js";
const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value = "") =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const safeURL = (value) => {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? esc(u.href) : "#";
  } catch {
    return "#";
  }
};
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  companies:
    '<path d="M4 21V7l8-4v18M12 9h8v12M2 21h20M7 9v1m0 3v1m0 3v1m9-5v1m0 3v1"/>',
  research:
    '<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zM13 7a3 3 0 0 1 3-3h4v15h-4a3 3 0 0 0-3 2"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3z"/>',
  connect:
    '<path d="m10 13 4-4M8 15l-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m2 5a3 3 0 0 0 4 0l4-4a3 3 0 0 0-4-4l-1 1"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 4H4v16h16v-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  edit: '<path d="m15 4 5 5M4 20l1-6L16 3a2 2 0 0 1 5 5L10 19z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  restore: '<path d="M3 10h5M3 10V5m0 5a9 9 0 1 1 0 6M12 7v6l4 2"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  github:
    '<path d="M9 19c-4 1-4-2-6-2m12 5v-4a3 3 0 0 0-1-2c4-.4 7-2 7-6a5 5 0 0 0-2-4c.3-1 .3-3 0-4-2 0-3 1-4 2a13 13 0 0 0-6 0C8 3 7 2 5 2c-.3 1-.3 3 0 4a5 5 0 0 0-2 4c0 4 3 5.6 7 6a3 3 0 0 0-1 2v4"/>',
  spark:
    '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.arrow}</svg>`;
const state = {
  research: null,
  researchError: null,
  workspace: [],
  archived: [],
  csrf: null,
  workspaceError: null,
  view: "overview",
  dashboardFilter: "recent",
  filter: "all",
  sector: "all",
  query: "",
  workspaceTab: "all",
  loading: true,
};
const github = "https://github.com/jeremyjv/antifund-hq";
const app = $("#app");
const dialog = $("#detail-dialog");
let dialogReturnFocus = null;
let toastTimer;
let editorDirty = false;
let editorSaving = false;
let activeEditor = null;
const date = (value) => {
  if (!value) return "Undated";
  if (/^\d{4}-\d{2}$/.test(value))
    return new Date(`${value}-15T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
};
const company = (id) => state.research?.companies.find((c) => c.id === id);
const source = (id) => state.research?.sources.find((s) => s.id === id);
const sourceList = (ids) => (ids || []).map(source).filter(Boolean);
const short = (value, limit = 180) => {
  const s = String(value || "");
  return s.length > limit ? `${s.slice(0, limit).replace(/\s+\S*$/, "")}…` : s;
};
const list = (items) =>
  (items || []).length
    ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
    : "<p>Not yet documented.</p>";
const companyLogoIds = new Set([
  "efference",
  "westmag",
  "etched",
  "modal",
  "general-matter",
  "helion",
]);
function mark(c) {
  return `<span class="company-mark" aria-hidden="true">${companyLogoIds.has(c?.id) ? `<img src="/assets/companies/${esc(c.id)}.png" alt="" loading="lazy">` : esc(c?.name?.slice(0, 2).toUpperCase() || "AF")}</span>`;
}
function relationship(c) {
  return `<span class="pill ${esc(c.relationship)}">${c.relationship === "portfolio" ? "Public portfolio" : "Research candidate"}</span>`;
}
function toast(message, error = false) {
  const node = $("#toast");
  node.textContent = message;
  node.className = `visible${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      node.className = "";
    },
    error ? 7500 : 4000,
  );
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body
        ? {
            "Content-Type": "application/json",
            "X-CSRF-Token": state.csrf || "",
          }
        : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.error || `Request failed (${response.status}). Please try again.`,
    );
    error.status = response.status;
    error.details = data.details;
    throw error;
  }
  return data;
}
const external = (url, label, classes = "text-link") =>
  `<a class="${classes}" href="${safeURL(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ${icon("external")}</a>`;
const btn = (action, text, classes = "", attrs = "") =>
  `<button type="button" class="button ${classes}" data-action="${action}" ${attrs}>${text}</button>`;
function heading(eyebrow, title, description, actions = "") {
  return `<header class="page-heading"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${actions}</header>`;
}
function footer() {
  return `<footer class="page-footer"><span>Public-source research · Checked ${esc(date(state.research?.checkedAt))}</span><span>Built by Jeremy · Independent prototype, unaffiliated with Anti Fund</span></footer>`;
}
function navItem(id, label, iconName, count = "") {
  return `<a class="nav-item ${state.view === id ? "active" : ""}" href="#${id}" ${state.view === id ? 'aria-current="page"' : ""}>${icon(iconName)}<span>${label}</span>${count !== "" ? `<span class="nav-count">${count}</span>` : ""}</a>`;
}
function shell() {
  const labels = {
    overview: "Dashboard",
    companies: "Companies",
    research: "Research briefs",
    workspace: "Saved work",
    about: "Sources & agent access",
  };
  document.title = `Anti Fund HQ — ${labels[state.view]}`;
  app.innerHTML = `<aside class="sidebar" aria-label="Primary navigation"><button class="icon-button mobile-menu" data-action="close-menu" aria-label="Close navigation">${icon("close")}</button><a class="brand" href="#overview" aria-label="Anti Fund HQ overview"><img class="brand-logo" src="/assets/antifund-logo.png" alt=""><div><div class="brand-name">Anti Fund</div><div class="brand-sub">RESEARCH HQ</div></div></a><div class="nav-label">Workspace</div><nav>${navItem("overview", "Dashboard", "grid")}${navItem("companies", "Companies", "companies", state.research?.companies.length ?? "")}${navItem("research", "Research briefs", "research")}</nav><div class="sidebar-bottom">${navItem("workspace", "Saved work", "folder", state.workspace.length || "")}${navItem("about", "Sources & agent access", "connect")}<div class="sidebar-note"><strong>Prepared for Anti Fund.</strong><br>Research demo by Jeremy.<br>Built from public sources.</div></div></aside><div class="app-main"><header class="topbar"><button class="icon-button mobile-menu" data-action="open-menu" aria-label="Open navigation">${icon("menu")}</button><div class="breadcrumb"><span>Anti Fund HQ</span><span>/</span><span>${labels[state.view]}</span></div><div class="topbar-actions"><span class="prototype"><span class="dot"></span> Independent prototype</span>${external(github, "View repository")}</div></header><main class="content" id="main" tabindex="-1">${page()}</main></div>`;
}
function page() {
  if (state.loading)
    return `${heading("Research workspace", "Good questions start here.", "Preparing a source-backed view of the companies and bottlenecks worth exploring.")}<div class="loading-line"></div><p class="loading-label">Loading public research…</p>`;
  if (state.researchError && state.view !== "workspace")
    return `<div class="error-state"><h2>Research could not be loaded.</h2><p>${esc(state.researchError)}</p>${btn("retry", "Try again", "primary")}</div>`;
  return (
    (
      {
        overview: overview,
        companies: companies,
        research: research,
        workspace: workspace,
        about: about,
      }[state.view] || overview
    )() + footer()
  );
}
function overview() {
  const r = state.research;
  const d = dashboardSnapshot(r);
  const filters = [["recent", "Past 30 days", d.recent.length], ["dated", "All dated updates", d.dated.length], ["undated", "Undated evidence", d.undated.length]];
  const rows = d[state.dashboardFilter] || d.recent;
  return `<div class="decision-dashboard">${heading("Anti Fund / Decision dashboard", "What changed. What matters.", "Company developments, investment questions, and the evidence to follow up.")}
  <div class="snapshot-status"><span>${icon("clock")} Snapshot checked ${esc(date(r.checkedAt))}</span><span>Curated public research · Not a live feed</span></div>
  <section class="decision-metrics" aria-label="Research snapshot summary">
    <button data-action="dashboard-filter" data-id="recent"><strong>${d.recent.length}</strong><span>Dated updates in 30 days<small>Window ending ${esc(date(r.checkedAt))}</small></span>${icon("arrow")}</button>
    <div><strong>${d.portfolioCount}</strong><span>Portfolio companies with updates<small>Within this research sample</small></span></div>
    <button data-action="dashboard-filter" data-id="undated"><strong>${d.undated.length}</strong><span>Observations without source dates<small>Review as context, not recent news</small></span>${icon("arrow")}</button>
  </section>
  <section class="decision-feed" aria-labelledby="changes-title"><div class="decision-section-heading"><div><h2 id="changes-title">Developments to investigate</h2><p>Company-reported evidence. Relevance and next steps are research judgment.</p></div><div class="decision-filters" role="group" aria-label="Update timeframe">${filters.map(([id,label,count])=>`<button data-action="dashboard-filter" data-id="${id}" aria-pressed="${state.dashboardFilter === id}">${label} <span>${count}</span></button>`).join("")}</div></div>
  <div class="decision-table-head" aria-hidden="true"><span>Company / source date</span><span>What changed & why it matters</span><span>What to check next</span></div>
  <div class="decision-rows">${rows.length ? rows.map(decisionRow).join("") : '<div class="empty-state"><h3>No dated updates in this window.</h3><p>Review all dated updates or undated evidence above.</p></div>'}</div></section>
  <section class="dashboard-briefs" aria-labelledby="thesis-title"><div class="decision-section-heading"><div><h2 id="thesis-title">The bigger investment questions</h2><p>Connect individual developments to a research thesis.</p></div><a class="text-link" href="#research">All research ${icon("arrow")}</a></div><div class="dashboard-brief-grid">${r.briefs.map(b=>`<button data-action="open-brief" data-id="${esc(b.id)}"><span class="small-label">Research hypothesis · ${b.sourceIds.length} sources</span><h3>${esc(b.title)}</h3><span class="text-link">Read brief ${icon("arrow")}</span></button>`).join("")}</div></section>
  <p class="dashboard-boundary">Coverage: ${r.companies.length} companies in this public research sample. Private revenue, valuations, fund marks, and investment decisions are not connected.</p></div>`;
}
function decisionRow(s) {
  const c = company(s.companyId);
  const sources = sourceList(s.sourceIds);
  return `<article class="decision-row"><div class="decision-company"><div class="company-name-cell">${mark(c)}<button class="company-name" data-action="open-company" data-id="${esc(c.id)}">${esc(c.name)}</button></div>${relationship(c)}<span class="decision-date">${esc(s.observedAt ? date(s.observedAt) : "Publication date unavailable")}</span><span class="small-label">${esc(s.kind)}</span></div>
  <div class="decision-change"><h3>${esc(s.title)}</h3><p>${esc(s.summary)}</p><p class="decision-relevance"><strong>Why it matters</strong> ${esc(c.thesisFit.replace(/^Research angle: /,""))}</p><div class="decision-sources">${sources.map(src=>external(src.url,src.publisher || "Source")).join(" ")}<span>Checked ${esc(date(sources[0]?.checkedAt))}</span></div></div>
  <div class="decision-next"><span class="small-label">Question to resolve</span><p>${esc(c.questions[0])}</p>${btn("investigate-signal", `Investigate ${icon("arrow")}`, "", `data-id="${esc(s.id)}" aria-label="Investigate ${esc(c.name)}"`)}<span class="decision-draft-hint">Opens an editable research note</span></div></article>`;
}
function signalCard(s) {
  const c = company(s.companyId);
  const sources = sourceList(s.sourceIds);
  return `<article class="signal">${mark(c)}<div><button class="signal-title" data-action="open-company" data-id="${esc(s.companyId)}"><h3>${esc(s.title)}</h3></button><p>${esc(short(s.summary, 175))}</p><div class="signal-meta"><span>${esc(c?.name || "")}</span><span>${esc(s.observedAt ? date(s.observedAt) : "Undated source")}</span>${sources[0] ? `<a href="${safeURL(sources[0].url)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ""}</div></div></article>`;
}
function filteredCompanies() {
  return state.research.companies.filter(
    (c) =>
      (state.filter === "all" || c.relationship === state.filter) &&
      (state.sector === "all" || c.sector === state.sector) &&
      `${c.name} ${c.summary} ${c.bottleneck} ${(c.tags || []).join(" ")}`
        .toLowerCase()
        .includes(state.query.toLowerCase()),
  );
}
function companyRows() {
  const rows = filteredCompanies();
  return rows.length
    ? `<table class="company-table"><thead><tr><th scope="col">Company</th><th scope="col">Research focus</th><th scope="col">Relationship</th><th scope="col">Evidence</th><th scope="col"><span class="small-label">Open</span></th></tr></thead><tbody>${rows.map((c) => `<tr><td><div class="company-name-cell">${mark(c)}<div><button class="company-name" data-action="open-company" data-id="${esc(c.id)}">${esc(c.name)}</button><div class="domain">${esc(c.sector)}</div><div class="mobile-relationship">${relationship(c)}</div></div></td><td class="company-bottleneck">${esc(c.bottleneck)}</td><td>${relationship(c)}</td><td class="source-count">${c.sourceIds.length} sources</td><td><button class="icon-button" data-action="open-company" data-id="${esc(c.id)}" aria-label="View ${esc(c.name)}">${icon("arrow")}</button></td></tr>`).join("")}</tbody></table>`
    : `<div class="empty-state">${icon("search")}<h2>No companies match.</h2><p>Try a different keyword or reset the filters.</p>${btn("clear-filters", "Clear filters")}</div>`;
}
function companies() {
  const r = state.research;
  const sectors = [...new Set(r.companies.map((c) => c.sector))].sort();
  return `${heading("Companies", "Choose a company to investigate.", "Open a profile to see what it does, why it matters, and what to ask its founders.")}<div class="toolbar"><div class="filters" role="group" aria-label="Company relationship">${[
    ["all", "All companies"],
    ["portfolio", "Public portfolio"],
    ["research", "Research candidates"],
  ]
    .map(
      ([id, label]) =>
        `<button class="filter-button ${state.filter === id ? "active" : ""}" data-action="filter" data-id="${id}" aria-pressed="${state.filter === id}">${label}</button>`,
    )
    .join(
      "",
    )}</div><select id="sector-filter" class="select" aria-label="Filter by sector"><option value="all">All sectors</option>${sectors.map((s) => `<option value="${esc(s)}" ${state.sector === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select><label class="search-field">${icon("search")}<input id="company-search" type="search" value="${esc(state.query)}" placeholder="Search companies or topics" aria-label="Search companies"></label></div><div class="table-wrap" id="company-results">${companyRows()}</div><p class="small-copy muted stack-space">Portfolio relationships follow Anti Fund’s public website. Research candidates are included for investigation; inclusion does not imply an investment, endorsement, or private relationship.</p>`;
}
function research() {
  return `${heading("Research briefs", "Three questions worth investigating.", "Each brief explains an idea, links the evidence, and suggests what to investigate next.")}<div class="brief-grid">${state.research.briefs.map((b, i) => `<article class="research-card"><span class="eyebrow">0${i + 1} / Research hypothesis</span><h2>${esc(b.title)}</h2><p>${esc(b.summary)}</p><footer>${b.companyIds.length} companies · ${b.sourceIds.length} sources · ${b.questions.length} open questions</footer>${btn("open-brief", `Read the brief ${icon("arrow")}`, "", `data-id="${esc(b.id)}"`)}</article>`).join("")}<article class="research-card" style="background:var(--surface)"><span class="eyebrow">Your next research question</span><h2>Where would you look next?</h2><p>Take a thesis, challenge an assumption, or write a question worth asking a founder. Keep the evidence and your judgment together.</p>${btn("new-note", `${icon("plus")} Start a research note`)}</article></div>`;
}
function workspace() {
  const isTrash = state.workspaceTab === "trash";
  const records = isTrash
    ? state.archived
    : state.workspace.filter(
        (r) => state.workspaceTab === "all" || r.type === state.workspaceTab,
      );
  return `${heading("Saved work", "Your shortlist and notes.", "Keep the companies and questions you want to revisit.", `<div style="display:flex;gap:8px;flex-wrap:wrap">${btn("export-workspace", `${icon("download")} Export`, "", 'aria-label="Export private workspace as JSON"')}${btn("new-note", `${icon("plus")} New note`, "primary")}</div>`)}<details class="session-detail"><summary>${icon("lock")} Private to this browser · Saved in the cloud</summary><p>Access lasts 30 days and depends on this browser’s cookie. Export a copy before the session expires or you clear cookies. Public research is shared and read-only.</p></details>${
    state.workspaceError
      ? `<div class="error-state"><h2>Your workspace is unavailable.</h2><p>${esc(state.workspaceError)}</p>${btn("retry-workspace", "Reconnect", "primary")}</div>`
      : `<div class="workspace-tabs" role="group" aria-label="Workspace record type">${[
          ["all", "All records"],
          ["watchlist", "Shortlist"],
          ["note", "Notes"],
          ["memo", "Briefs"],
          ["trash", "Trash"],
        ]
          .map(
            ([id, label]) =>
              `<button class="workspace-tab ${state.workspaceTab === id ? "active" : ""}" data-action="workspace-tab" data-id="${id}" aria-pressed="${state.workspaceTab === id}">${label}${id === "all" ? ` (${state.workspace.length})` : ""}</button>`,
          )
          .join(
            "",
          )}</div><div class="records-grid">${records.length ? records.map(recordCard).join("") : `<div class="empty-state">${icon(isTrash ? "trash" : "bookmark")}<h2>${isTrash ? "Nothing in the trash." : "Keep something worth following up."}</h2><p>${isTrash ? "Archived records can be restored here, with their revision history intact." : "Open a company and choose Save to shortlist, or capture your own question here."}</p>${isTrash ? "" : '<a class="button" href="#companies">Explore companies ' + icon("arrow") + "</a>"}</div>`}</div>`
  }`;
}
function recordCard(r) {
  const c = company(r.companyId);
  const label =
    { note: "Research note", watchlist: "Shortlist", memo: "Source brief" }[
      r.type
    ] || r.type;
  return `<article class="record-card"><header><span class="eyebrow">${esc(label)}${c ? ` / ${esc(c.name)}` : ""}</span><span class="pill status">${esc(r.status)}</span></header><h3>${esc(r.title)}</h3><p>${esc(r.body || "No additional notes yet.")}</p><footer><span class="record-time">v${r.version} · ${esc(date(r.updatedAt))}</span><div class="record-actions">${r.archived ? btn("restore", `${icon("restore")} Restore`, "small", `data-id="${esc(r.id)}"`) : btn("edit-record", `${icon("edit")} Open`, "small", `data-id="${esc(r.id)}"`)}<button class="icon-button" data-action="history" data-id="${esc(r.id)}" aria-label="Version history for ${esc(r.title)}">${icon("clock")}</button>${r.archived ? "" : `<button class="icon-button" data-action="archive" data-id="${esc(r.id)}" aria-label="Move ${esc(r.title)} to trash">${icon("trash")}</button>`}</div></footer></article>`;
}
function about() {
  const r = state.research;
  return `${heading("Context that travels with you", "Built to make the work compound.", "A working prototype of a research workspace and an agent-readable knowledge layer.")}<div class="about-grid"><div><section class="panel"><h2>A useful first visit, without private data.</h2><p>This workspace starts with ${r.companies.length} real companies, ${r.sources.length} public sources, and ${r.briefs.length} original research briefs. It translates Anti Fund’s public thesis into questions someone can actually investigate.</p><ol class="numbered-list"><li><div><strong>Start with the firm’s own words.</strong>The public manifesto and portfolio anchor the research universe and thesis map.</div></li><li><div><strong>Trace each observation to a primary source.</strong>Company sites, product announcements, technical documentation, and public repositories. Published dates and source check dates stay distinct.</div></li><li><div><strong>Separate evidence from interpretation.</strong>Briefs are research hypotheses. Company claims stay attributed. Revenue, performance, deal status, and private fund figures are not fabricated.</div></li><li><div><strong>Make the next step concrete.</strong>Every brief includes counterpoints and questions. Save your own notes, status, and source briefs with cloud persistence and version history. Private access uses a 30-day browser session; export your records before it expires or you clear cookies.</div></li></ol></section><section class="panel"><h2>Built by Jeremy.</h2><p>An independent application prototype for Anti Fund. Anti Fund names and public brand assets identify the intended audience; this is not an official Anti Fund product.</p><div class="detail-actions" style="margin-bottom:0">${external(github, "Explore the monorepo", "button")}${external("https://antifund.com/job", "The role that inspired it", "button")}</div></section></div><div><section class="panel"><div class="eyebrow">Agent context / MCP</div><h2 style="margin-top:10px">Bring the research to your agent.</h2><p>The public connector exposes bounded, source-linked research context. Private browser notes are excluded from public tools.</p><div class="code-field" id="mcp-url">${esc(location.origin)}/mcp</div>${btn("copy-mcp", `${icon("connect")} Copy MCP endpoint`, "small")}<p class="small-copy" style="margin-top:14px">Use this remote MCP URL in a compatible client. Read-only public research tools are available; client support and setup vary.</p><div class="code-field">“What evidence supports the robotics data-loop thesis, and what would change our mind?”</div></section><section class="panel"><h2>What is connected</h2><div class="integration-row"><span>Public research snapshot</span><span class="pill portfolio">Available</span></div><div class="integration-row"><span>Private cloud workspace</span><span class="pill portfolio">Available</span></div><div class="integration-row"><span>Public research MCP</span><span class="pill portfolio">Read-only</span></div><div class="integration-row"><span>Scheduled source refresh</span><span class="pill">Not connected</span></div><div class="integration-row"><span>CRM, email & private fund data</span><span class="pill">Not connected</span></div><p class="small-copy" style="margin-top:14px">A curated snapshot checked ${esc(date(r.checkedAt))}. No background agents or live market feeds are running.</p></section></div></div><section class="panel"><div class="section-heading"><h2>Source library</h2><span class="eyebrow">${r.sources.length} public sources</span></div><div class="source-library">${r.sources.map((s) => `<div class="source-library-item"><div><a href="${safeURL(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><p>${esc(s.publisher)} · ${s.publishedAt ? `Published ${esc(date(s.publishedAt))}` : "Publication date not stated"}</p></div><span class="eyebrow">Checked ${esc(date(s.checkedAt))}</span></div>`).join("")}</div></section>`;
}
function openDialog(content, label = "Research detail") {
  if (!dialog.open) dialogReturnFocus = document.activeElement;
  dialog.setAttribute("aria-label", label);
  dialog.innerHTML = `<div class="dialog-top"><span class="eyebrow">Anti Fund HQ / ${esc(label)}</span><button class="icon-button" data-action="close-dialog" aria-label="Close dialog">${icon("close")}</button></div><div class="dialog-body">${content}</div>`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  editorDirty = false;
}
function closeDialog() {
  if (editorSaving) return;
  if (editorDirty) {
    showDiscardPrompt();
    return;
  }
  dialog.close();
  activeEditor = null;
  dialogReturnFocus?.focus?.();
}
function showDiscardPrompt() {
  if ($("#discard-prompt", dialog)) return;
  const form = $("form", dialog);
  const warning = document.createElement("div");
  warning.id = "discard-prompt";
  warning.className = "form-error";
  warning.innerHTML = `Your changes have not been saved. ${btn("discard-edit", "Discard changes", "small")} ${btn("keep-editing", "Keep editing", "small")}`;
  (form || $(".dialog-body", dialog)).prepend(warning);
  $("#discard-prompt button", dialog)?.focus();
}
function citations(ids) {
  return `<div class="inline-citations">${sourceList(ids)
    .map(
      (s) =>
        `<a href="${safeURL(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.publisher)} ↗</a>`,
    )
    .join("")}</div>`;
}
function evidence(ids) {
  return `<div class="evidence-list">${sourceList(ids)
    .map(
      (s, i) =>
        `<div class="evidence-item"><span class="evidence-number">${String(i + 1).padStart(2, "0")}</span><div><a href="${safeURL(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><p>${esc(s.publisher)} · ${s.publishedAt ? `Published ${esc(date(s.publishedAt))}` : "Publication date not stated"} · Checked ${esc(date(s.checkedAt))}</p></div></div>`,
    )
    .join("")}</div>`;
}
function chips(ids) {
  return `<div class="company-chips">${(ids || [])
    .map(company)
    .filter(Boolean)
    .map(
      (c) =>
        `<button class="company-chip" data-action="open-company" data-id="${esc(c.id)}">${mark(c)}${esc(c.name)}</button>`,
    )
    .join("")}</div>`;
}
function openCompany(id) {
  const c = company(id);
  if (!c) return;
  const saved = state.workspace.find(
    (r) => r.type === "watchlist" && r.companyId === id,
  );
  openDialog(
    `<div class="dialog-company-title">${mark(c)}<div><h1>${esc(c.name)}</h1><div class="domain">${esc(c.domain)} · ${esc(c.sector)}</div></div></div>${relationship(c)}<p class="detail-subtitle">${esc(c.summary)}</p><div class="detail-actions">${saved ? btn("edit-record", `${icon("check")} On your shortlist`, "", `data-id="${esc(saved.id)}"`) : btn("shortlist", `${icon("bookmark")} Save to shortlist`, "primary", `data-id="${esc(c.id)}"`)}${btn("new-note", `${icon("plus")} Research note`, "", `data-company-id="${esc(c.id)}"`)}${btn("build-brief", `${icon("research")} Build source brief`, "", `data-id="${esc(c.id)}"`)}</div><div class="detail-grid"><section class="detail-section"><span class="eyebrow">Problem it addresses</span><h2 style="margin-top:8px">${esc(c.bottleneck)}</h2></section><section class="detail-section"><span class="eyebrow">Why investigate it</span><p style="margin-top:8px">${esc(c.thesisFit)}</p></section></div><div class="provenance-note">${c.relationship === "portfolio" ? "Listed in Anti Fund’s public portfolio. Investment date, ownership, stage, and private performance are not established by this snapshot." : "Independent research candidate. This prototype does not establish an Anti Fund investment or relationship."}</div><div class="detail-grid"><section class="detail-section"><h2>Questions for a founder</h2>${list(c.questions)}</section><section class="detail-section"><h2>What to pressure-test</h2>${list(c.risks)}</section></div>${
      state.research.signals.some((s) => s.companyId === id)
        ? `<section class="detail-section"><h2>Public observations</h2>${state.research.signals
            .filter((s) => s.companyId === id)
            .map(signalCard)
            .join("")}</section>`
        : ""
    }<section class="detail-section"><h2>The source trail</h2>${evidence(c.sourceIds)}</section>`,
    c.name,
  );
}
function openBrief(id) {
  const b = state.research.briefs.find(x => x.id === id);
  if (!b) return;
  const sections = b.sections;
  openDialog(`<div class="eyebrow">Research brief · ${b.sourceIds.length} sources</div><h1>${esc(b.title)}</h1>
  <p class="detail-subtitle">${esc(b.summary.replace(/^Research hypothesis: /,'').replace(/^./, c => c.toUpperCase()))}</p>
  <p class="brief-qualification">A research hypothesis based on public company material. It still needs independent testing.</p>
  <section class="brief-step"><span>01</span><div><h2>What we found</h2><p>${esc(sections[0]?.body || b.summary)}</p>${citations(sections[0]?.sourceIds || b.sourceIds)}</div></section>
  <section class="brief-step"><span>02</span><div><h2>What could prove this wrong?</h2>${list(b.counterpoints)}</div></section>
  <section class="brief-step"><span>03</span><div><h2>What to ask next</h2>${list(b.questions)}</div></section>
  <div class="detail-actions">${btn("brief-note", `${icon("plus")} Draft follow-up questions`, "primary", `data-id="${esc(b.id)}"`)}${btn("export-brief", `${icon("download")} Export brief`, "", `data-id="${esc(b.id)}"`)}</div>
  <section class="detail-section"><h2>Explore the companies</h2>${chips(b.companyIds)}</section>
  <details class="secondary-detail"><summary>Read the full analysis</summary>${sections.slice(1).map(section=>`<section class="detail-section"><h2>${esc(section.title)}</h2><p>${esc(section.body)}</p>${citations(section.sourceIds)}</section>`).join('')}</details>
  <details class="secondary-detail"><summary>View all ${b.sourceIds.length} sources</summary>${evidence(b.sourceIds)}</details>`, "Research brief");
}
function openThesis(id) {
  const t = state.research.theses.find((x) => x.id === id);
  if (!t) return;
  openDialog(
    `<div class="eyebrow" style="color:var(--red);margin-bottom:14px">Thesis map / Research hypothesis</div><h1>${esc(t.title)}</h1><p class="detail-subtitle">${esc(t.summary)}</p><section class="detail-section"><h2>The constraint to investigate</h2><p>${esc(t.bottleneck)}</p></section>${chips(t.companyIds)}<section class="detail-section"><h2>Questions worth answering</h2>${list(t.questions)}</section><section class="detail-section"><h2>Source trail</h2>${evidence(t.sourceIds)}</section>`,
    "Thesis map",
  );
}
function noteEditor(record = null, companyId = null, draft = null) {
  activeEditor = record;
  const value = record ||
    draft || { title: "", body: "", status: "open", companyId, type: "note" };
  const selectedId = value.companyId || companyId || "";
  openDialog(
    `<h1>${record ? "Your research, in progress." : value.type === "memo" ? "A brief with a source trail." : "Capture the next good question."}</h1><p class="detail-subtitle">${record ? "Save a new version. Earlier revisions remain recoverable." : value.type === "memo" ? "Assembled from the public snapshot. Review and edit before saving to your workspace." : "A private note, saved to your cloud workspace."}</p><form id="record-form"><div class="field"><label for="record-title">Title</label><input id="record-title" name="title" value="${esc(value.title)}" placeholder="What is worth investigating?" maxlength="200" required></div><div class="field-row"><div class="field"><label for="record-company">Company</label><select id="record-company" name="companyId" ${record ? "disabled" : ""}><option value="">General research</option>${state.research?.companies.map((c) => `<option value="${esc(c.id)}" ${selectedId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("") || ""}</select></div><div class="field"><label for="record-status">Status</label><select id="record-status" name="status">${["open", "reviewing", "done"].map((s) => `<option value="${s}" ${value.status === s ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}</select></div></div><div class="field"><label for="record-body">${value.type === "memo" ? "Source brief" : "Notes & evidence"}</label><textarea id="record-body" name="body" maxlength="20000" placeholder="What does the evidence suggest? What would change your mind?">${esc(value.body)}</textarea></div><input type="hidden" name="type" value="${esc(value.type || "note")}"><p class="form-help">${record ? `Current version: ${record.version}. Conflicting changes will not overwrite your work.` : "Saved to the cloud only when you click Save. Your browser cookie provides access."}</p><div id="form-message" aria-live="polite"></div><div class="form-actions"><span class="small-label muted">${record ? `Last saved ${esc(date(record.updatedAt))}` : "Draft · Not yet saved"}</span><div style="display:flex;gap:8px">${btn("close-dialog", "Cancel")}<button class="button primary" type="submit">${icon("check")} Save ${value.type === "memo" ? "brief" : "note"}</button></div></div></form>`,
    value.type === "memo" ? "Source brief" : "Research note",
  );
  activeEditor = record;
}
async function saveEditor(form) {
  const submit = $('button[type="submit"]', form);
  if (editorSaving) return;
  const values = new FormData(form);
  const body = {
    title: String(values.get("title") || "").trim(),
    body: String(values.get("body") || ""),
    status: values.get("status"),
  };
  if (!body.title) {
    $("#form-message", form).innerHTML =
      '<div class="form-error">Please enter a title.</div>';
    return;
  }
  editorSaving = true;
  submit.disabled = true;
  submit.textContent = "Saving…";
  try {
    await ensureWorkspace();
    const result = activeEditor
      ? await api(`/api/workspace/${encodeURIComponent(activeEditor.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: activeEditor.version,
            changes: body,
          }),
        })
      : await api("/api/workspace", {
          method: "POST",
          body: JSON.stringify({
            ...body,
            type: values.get("type"),
            companyId: values.get("companyId") || null,
          }),
        });
    const record = result.record || result;
    upsert(record);
    editorDirty = false;
    editorSaving = false;
    dialog.close();
    activeEditor = null;
    state.view = "workspace";
    state.workspaceTab = "all";
    location.hash = "workspace";
    shell();
    toast("Saved to your private cloud workspace.");
  } catch (error) {
    $("#form-message", form).innerHTML =
      `<div class="form-error">${error.status === 409 ? "A newer version exists. Your text is preserved here. Copy your changes before reopening the current record; this version has not been overwritten." : esc(error.message)}</div>`;
    if (error.status === 409) {
      await loadWorkspace().catch(() => {});
    }
  } finally {
    editorSaving = false;
    submit.disabled = false;
    submit.innerHTML = `${icon("check")} Save`;
  }
}
function upsert(record) {
  state.workspace = state.workspace.filter((r) => r.id !== record.id);
  state.archived = state.archived.filter((r) => r.id !== record.id);
  (record.archived ? state.archived : state.workspace).unshift(record);
}
async function ensureWorkspace() {
  if (!state.csrf) await loadWorkspace();
  if (!state.csrf)
    throw new Error(
      "Your private workspace could not be connected. Please retry.",
    );
}
async function loadWorkspace() {
  const result = await api("/api/workspace");
  state.workspace = result.records;
  state.csrf = result.csrfToken;
  state.workspaceError = null;
  return result;
}
async function shortlist(id, button) {
  const c = company(id);
  if (!c) return;
  button.disabled = true;
  try {
    await ensureWorkspace();
    const existing = state.workspace.find(
      (r) => r.type === "watchlist" && r.companyId === id,
    );
    if (existing) {
      openCompany(id);
      return;
    }
    const result = await api("/api/workspace", {
      method: "POST",
      body: JSON.stringify({
        type: "watchlist",
        companyId: id,
        title: c.name,
        body: `Research focus: ${c.bottleneck}\n\nNext questions:\n${c.questions.map((q) => `- ${q}`).join("\n")}`,
        status: "open",
      }),
    });
    upsert(result.record);
    shell();
    openCompany(id);
    toast(`${c.name} saved to your shortlist.`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
}
async function archiveRecord(id, archived, button) {
  const record = [...state.workspace, ...state.archived].find(
    (r) => r.id === id,
  );
  if (!record) return;
  button.disabled = true;
  try {
    await ensureWorkspace();
    const result = await api(`/api/workspace/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        expectedVersion: record.version,
        changes: { archived },
      }),
    });
    upsert(result.record);
    shell();
    toast(
      archived
        ? "Moved to Trash. You can restore it anytime."
        : "Restored to your workspace.",
    );
  } catch (error) {
    toast(
      error.status === 409
        ? "This record changed elsewhere. Refreshing the current version; please retry."
        : error.message,
      true,
    );
    if (error.status === 409) {
      await loadWorkspace();
      if (state.workspaceTab === "trash")
        state.archived = (await api("/api/workspace?archived=true")).records;
      shell();
    }
  } finally {
    button.disabled = false;
  }
}
function companyBrief(c) {
  return `# ${c.name} — public-source brief\n\nAssembled from the public research snapshot checked ${state.research.checkedAt}. This is a deterministic compilation, not a model-generated diligence conclusion.\n\n## Company\n${c.summary}\n\n## Bottleneck\n${c.bottleneck}\n\n## Research interpretation\n${c.thesisFit}\n\n## Questions for a founder\n${c.questions.map((q) => `- ${q}`).join("\n")}\n\n## Risks and unknowns\n${c.risks.map((q) => `- ${q}`).join("\n")}\n\n## Sources\n${sourceList(
    c.sourceIds,
  )
    .map(
      (s) =>
        `- ${s.title} — ${s.url}\n  Publisher: ${s.publisher}. ${s.publishedAt ? `Published: ${s.publishedAt}. ` : "Publication date not stated. "}Checked: ${s.checkedAt}.`,
    )
    .join("\n")}\n\n## My judgment\n\n## Next action\n`;
}
function briefMarkdown(b) {
  return `# ${b.title}\n\nIndependent research hypothesis. Checked ${state.research.checkedAt}.\n\n${b.summary}\n\n${b.sections
    .map(
      (s) =>
        `## ${s.title}\n\n${s.body}\n\n${sourceList(s.sourceIds)
          .map((s) => `Source: ${s.url}`)
          .join("\n")}`,
    )
    .join(
      "\n\n",
    )}\n\n## Counterpoints\n${b.counterpoints.map((x) => `- ${x}`).join("\n")}\n\n## Questions\n${b.questions.map((x) => `- ${x}`).join("\n")}\n\n## Sources\n${sourceList(
    b.sourceIds,
  )
    .map(
      (s) =>
        `- [${s.title}](${s.url}) — ${s.publisher}; checked ${s.checkedAt}`,
    )
    .join("\n")}\n`;
}
function download(text, filename, mime = "text/markdown;charset=utf-8") {
  const object = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = object;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(object), 1000);
}
async function history(id) {
  const r = [...state.workspace, ...state.archived].find((r) => r.id === id);
  openDialog(
    '<h1>Version history.</h1><p class="detail-subtitle">Loading saved revisions…</p>',
    "Revision history",
  );
  try {
    const result = await api(
      `/api/workspace/${encodeURIComponent(id)}/history`,
    );
    $(".dialog-body", dialog).innerHTML =
      `<h1>Every saved version.</h1><p class="detail-subtitle">${esc(r?.title || "Record")} · Revisions are read-only. ${r?.archived ? "Restore this record from Trash to continue editing." : "Open the current record to continue editing."}</p>${
        (result.revisions || [])
          .sort((a, b) => b.version - a.version)
          .map(
            (v) =>
              `<article class="revision"><header><span>Version ${v.version}${v.archived ? " · Archived" : ""}</span><span>${esc(date(v.updatedAt))}</span></header><h3>${esc(v.title)}</h3><p>${esc(v.body || "No additional notes.")}</p></article>`,
          )
          .join("") || "<p>No revision snapshots are available.</p>"
      }`;
  } catch (error) {
    $(".dialog-body", dialog).innerHTML =
      `<h1>History could not load.</h1><p class="detail-subtitle">${esc(error.message)}</p>${btn("history", "Try again", "", `data-id="${esc(id)}"`)}`;
  }
}
async function init() {
  state.loading = true;
  state.researchError = null;
  shell();
  const results = await Promise.allSettled([
    api("/api/research"),
    loadWorkspace(),
  ]);
  if (results[0].status === "fulfilled") state.research = results[0].value;
  else state.researchError = results[0].reason.message;
  if (results[1].status === "rejected")
    state.workspaceError = results[1].reason.message;
  state.loading = false;
  shell();
}
function navigate() {
  const route = location.hash.slice(1);
  state.view = [
    "overview",
    "companies",
    "research",
    "workspace",
    "about",
  ].includes(route)
    ? route
    : "overview";
  shell();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", navigate);
document.addEventListener("click", async (event) => {
  if (event.target.closest(".skip-link")) {
    event.preventDefault();
    const main = $("#main");
    main?.focus({ preventScroll: true });
    main?.scrollIntoView({ block: "start" });
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action,
    id = button.dataset.id;
  try {
    switch (action) {
      case "open-menu":
        $(".sidebar").classList.add("mobile-open");
        break;
      case "close-menu":
        $(".sidebar").classList.remove("mobile-open");
        break;
      case "retry":
        await init();
        break;
      case "retry-workspace":
        button.disabled = true;
        try {
          await loadWorkspace();
          shell();
          toast("Private cloud workspace connected.");
        } catch (e) {
          state.workspaceError = e.message;
          shell();
        }
        break;
      case "open-company":
        openCompany(id);
        break;
      case "open-brief":
        openBrief(id);
        break;
      case "open-thesis":
        openThesis(id);
        break;
      case "close-dialog":
        closeDialog();
        break;
      case "discard-edit":
        editorDirty = false;
        closeDialog();
        break;
      case "keep-editing":
        $("#discard-prompt", dialog)?.remove();
        $("#record-title", dialog)?.focus();
        break;
      case "dashboard-filter":
        state.dashboardFilter = ["recent", "dated", "undated"].includes(id) ? id : "recent";
        shell();
        $(`.decision-filters [data-id="${state.dashboardFilter}"]`)?.focus({preventScroll:true});
        break;
      case "investigate-signal": {
        const s = state.research.signals.find(s => s.id === id);
        const c = company(s.companyId);
        noteEditor(null, c.id, {
          type: "note", companyId: c.id, status: "open",
          title: `Investigate ${c.name}: ${s.title}`,
          body: `Public observation (${s.observedAt || "publication date unavailable"})\n${s.summary}\n\nResearch interpretation\n${c.thesisFit}\n\nQuestions to resolve\n${c.questions.map(q => `- ${q}`).join("\n")}\n\nEvidence\n${sourceList(s.sourceIds).map(src => `${src.title}: ${src.url} (checked ${src.checkedAt})`).join("\n")}\n\nMy findings and next step\n`,
        });
        break;
      }
      case "filter":
        state.filter = id;
        shell();
        break;
      case "clear-filters":
        state.filter = "all";
        state.sector = "all";
        state.query = "";
        shell();
        break;
      case "new-note":
        noteEditor(null, button.dataset.companyId || null);
        break;
      case "edit-record":
        noteEditor(state.workspace.find((r) => r.id === id));
        break;
      case "brief-note": {
        const b = state.research.briefs.find((b) => b.id === id);
        noteEditor(null, null, {
          type: "note",
          title: `Investigate: ${b.title}`,
          body: `Research hypothesis\n${b.summary}\n\nQuestions to pursue\n${b.questions.map((q) => `- ${q}`).join("\n")}\n\nMy evidence and next steps\n`,
          status: "open",
        });
        break;
      }
      case "build-brief": {
        const c = company(id);
        noteEditor(null, id, {
          type: "memo",
          title: `${c.name} — source brief`,
          body: companyBrief(c),
          companyId: id,
          status: "open",
        });
        break;
      }
      case "shortlist":
        await shortlist(id, button);
        break;
      case "archive":
        await archiveRecord(id, true, button);
        break;
      case "restore":
        await archiveRecord(id, false, button);
        break;
      case "history":
        await history(id);
        break;
      case "workspace-tab":
        state.workspaceTab = id;
        if (id === "trash") {
          button.disabled = true;
          state.archived = (await api("/api/workspace?archived=true")).records;
        }
        shell();
        break;
      case "export-brief": {
        const b = state.research.briefs.find((b) => b.id === id);
        download(briefMarkdown(b), `${b.id}.md`);
        toast("Research brief exported with source links.");
        break;
      }
      case "export-workspace": {
        button.disabled = true;
        try {
          await ensureWorkspace();
          const [current, trash] = await Promise.all([
            api("/api/workspace"),
            api("/api/workspace?archived=true"),
          ]);
          const backup = {
            format: "antifund-hq-workspace",
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            records: [...current.records, ...trash.records],
          };
          download(
            JSON.stringify(backup, null, 2) + "\n",
            "antifund-hq-workspace.json",
            "application/json;charset=utf-8",
          );
          toast(`Exported ${backup.records.length} records, including Trash.`);
        } finally {
          button.disabled = false;
        }
        break;
      }
      case "copy-mcp":
        await navigator.clipboard.writeText(`${location.origin}/mcp`);
        toast("Public research MCP endpoint copied.");
        break;
    }
  } catch (error) {
    toast(error.message || "Something went wrong. Please try again.", true);
    button.disabled = false;
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "company-search") {
    state.query = event.target.value;
    $("#company-results").innerHTML = companyRows();
  }
  if (event.target.closest("#record-form")) editorDirty = true;
});
document.addEventListener("change", (event) => {
  if (event.target.id === "sector-filter") {
    state.sector = event.target.value;
    $("#company-results").innerHTML = companyRows();
  }
  if (event.target.closest("#record-form")) editorDirty = true;
});
document.addEventListener("submit", (event) => {
  if (event.target.id === "record-form") {
    event.preventDefault();
    saveEditor(event.target);
  }
});
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog();
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      closeDialog();
  }
});
window.addEventListener("beforeunload", (event) => {
  if (editorDirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
state.view = [
  "overview",
  "companies",
  "research",
  "workspace",
  "about",
].includes(location.hash.slice(1))
  ? location.hash.slice(1)
  : "overview";
init();
