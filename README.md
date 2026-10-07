# Anti Fund HQ

**What changed. Why it matters. What to investigate next.**

[Open the live dashboard → antifundhq.com](https://antifundhq.com)

An independent application prototype by Jeremy, built around Anti Fund’s ambition to combine technical judgment, proprietary research, and agents. The working demo connects public company developments to investment questions, source-linked research notes, and reusable agent context.

Start with real public evidence on robotics, compute, and energy infrastructure. Explore the dashboard without an account; save your own research in a private visitor workspace.

[Research methodology](data/README.md) · [Architecture](docs/architecture.md) · [Agent context contract](docs/context-contract.md) · [Operations](docs/operations.md)

## Try it in two minutes

1. **Open Dashboard.** Scan company updates alongside their research relevance and the question to resolve next. Switch between the past 30 days, all dated updates, and undated evidence.
2. **Choose Investigate.** Open an editable note with the observation, research interpretation, company questions, and original source links. Add your judgment and save.
3. **Explore a company or brief.** Inspect risks, counterarguments, and sources. Save a company to your shortlist or assemble an editable company brief.
4. **Return to Saved work.** Reload to see cloud persistence. Edit a record, inspect its revision history, or archive and restore it from Trash.

## What is working

| Capability | What you can do | Why it matters |
| --- | --- | --- |
| Decision dashboard | Review dated developments, their relevance, and a concrete follow-up question | Move from an announcement to a focused investigation |
| Company research | Explore public portfolio companies and independent research candidates with sources, risks, and questions | Keep company claims, relationships, and analytical judgment distinguishable |
| Research briefs | Explore **Robot data tools**, **Robot hardware**, and **AI compute & energy**; review evidence or prepare founder questions | Turn an investment question into a focused founder conversation |
| Private saved work | Shortlist companies; create and edit notes and briefs; export, archive, restore, and inspect history | Carry research forward without losing earlier judgments |
| Shared agent context | Query the same catalog through bounded, source-linked HTTP and MCP tools | Let an external agent use the evidence behind the dashboard |

## Visualize the firm workspace

Five lightweight work areas map directly to the role. They pair usable public research and private saved drafts with clearly labeled previews of future firm integrations.

| Work area | Try now | What would be connected next |
| --- | --- | --- |
| **Sourcing** | Inspect public technical sources, review research candidates, save a shortlist, and draft a collection plan | GitHub, papers, hiring, launches, traffic, and social ingestion |
| **Agents** | Select a company and preview sourcing, research, and diligence outputs; edit and save a template | Deployed agents, scheduling, run traces, and evaluations |
| **Portfolio stats** | Explore a reporting layout using public portfolio names and prepare a metrics collection checklist | Company metrics, fund records, approved marks, and market comps |
| **Diligence & relationships** | Prepare company-specific founder questions and technical review notes | Contacts, meeting history, introductions, and live deal context |
| **Operations** | Preview weekly review, memo review, and quarterly reporting checklists; review your actual open saved work | Team assignments, approvals, schedules, and reporting integrations |

Agent outputs are deterministic previews, not model executions. Financial placeholders mean **unknown**, never zero. No founder meeting, firm task, automation schedule, or integration is represented as active. Templates become real private records only when a visitor edits and saves them; they use the same D1 validation, versioning, and recovery flows as existing notes.

## What the dashboard measures

The seeded snapshot was checked **October 7, 2026** and includes **11 companies, 24 primary-source references, 12 observations, three research briefs, and three thesis maps**.

The initial dashboard shows:

- **3 dated updates** in the 30-day window ending on the snapshot date.
- **2 distinct public portfolio companies** represented in those updates.
- **8 observations without exact publication dates**, presented separately as context.

These counts describe the curated research sample. They are not Anti Fund’s complete portfolio, live deal pipeline, or investment performance. The 30-day filter is anchored to the snapshot’s checked date; refreshing the page does not fetch new announcements. Publication dates and source-check dates remain separate, and unknown dates are never inferred.

Public portfolio membership is attributed to Anti Fund’s published investments. Research candidates imply no relationship or investment intent. Sources establish what a company reported; they do not independently validate its technology or commercial performance.

## Architecture and agent context

The browser and external agents use one public catalog in Cloudflare D1. Shared core code supplies validation, dashboard calculations, and bounded retrieval; the Worker provides HTTP endpoints, the public MCP interface, and isolated visitor workspaces.

```text
apps/workspace/       Dashboard, company research, notes, and local brand assets
apps/worker/          HTTP/MCP adapters, visitor sessions, and security boundary
packages/core/       Validation, D1 access, dashboard logic, and context retrieval
packages/connectors/ Public-source ingestion contract for future adapters
agents/              Agent instructions and tool boundaries
data/                Versioned research seed and source provenance
migrations/          D1 schema and immutable revision triggers
tests/               API, isolation, conflicts, dashboard, and provenance checks
scripts/             Build, seed validation, retrieval evaluation, and deploy
docs/                Architecture, context contract, methodology, and operations
```

Visitor queries are owner scoped. Writes require schema validation, an exact Origin match, a session-bound CSRF token, and the expected record version. Conflicts cannot silently overwrite a newer edit. Archiving preserves records and their revision history.

### Connect an agent

Use this Streamable HTTP MCP endpoint in a compatible client:

```text
https://antifundhq.com/mcp
```

| Tool | Purpose |
| --- | --- |
| `search_research` | Find relevant public research in the curated catalog |
| `get_company_context` | Retrieve a bounded company context packet with source references |

The public tools require no authentication. They cannot read visitor notes, modify records, send messages, or access provider credentials. Retrieval is lexical and bounded; semantic search and arbitrary data-source connections are future work. See the [context contract](docs/context-contract.md) for limits and a protocol example.

## Run locally

Requires **Node 22.13–22.x**. Local development needs no model API key or external database account.

```sh
npm ci
npm run build
npm run db:local
npm run seed:local
npm run dev
```

Open `http://localhost:4321`. Wrangler runs the Worker with a local D1 database. The application does not substitute browser storage for cloud workspace records.

### Validate changes

```sh
npm run check
npm run eval
```

`check` builds the app, runs regression tests, and validates the seed and its source references. Tests cover visitor isolation, persistence, conflicting writes, revision history, archive/restore, MCP behavior, and dashboard date handling. `eval` runs curated retrieval cases and checks citation integrity and serialized context limits; it does not measure investment performance.

Desktop and mobile browser verification also covers dashboard filters, investigation drafts, saving, reload persistence, editing, history, and archive/restore.

## Deploy and update research

The live app runs on an isolated Cloudflare Worker and D1 database, with `antifundhq.com` and `www.antifundhq.com` configured as custom domains. It has no access to Jeremy HQ data.

Deploy with explicit project credentials using the [operations guide](docs/operations.md). For your own deployment, replace the Worker name, D1 binding, repository URL, and custom-domain routes in `wrangler.jsonc`; use your own database and domains. Credentials belong in an ignored environment file, never in Git or browser assets.

To refresh the research, review primary sources, update `data/research-seed.json` with stable IDs and accurate publication/check dates, run validation and retrieval evaluations, and import the reviewed seed into D1. Public seed updates do not modify visitor records. See the [seeding methodology](data/README.md).

## Scope and privacy

This is a **working public-source prototype**, not Anti Fund’s internal system. Private revenue, valuations, fund marks, and investment decisions are not connected. Investigation drafts and company briefs are deterministic compilations; there are no hidden model calls, autonomous agents, live ingestion jobs, or background outreach.

Saved work is stored in D1 and accessed through an opaque, HttpOnly browser cookie with a **30-day lifetime**. Losing that cookie loses access. Workspaces are tied to the browser and hostname; switching between the custom domain and the original Workers URL does not migrate saved work. Use the canonical [antifundhq.com](https://antifundhq.com) address and export anything you want to keep. Cross-device sign-in and account recovery are outside this MVP.

The next step toward firm adoption would be organization sign-in and permissions, approved data connectors with ingestion history, and evaluated agent workflows with traceable outputs. This public demo is intended for research notes, not confidential fund documents.

## Attribution

Built by Jeremy as an independent application prototype, unaffiliated with Anti Fund. Anti Fund and company marks belong to their respective owners and identify the subjects of this demo. See [asset provenance and font licenses](apps/workspace/assets/SOURCES.md). No affiliation or endorsement is implied.
