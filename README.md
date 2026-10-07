# Anti Fund HQ

**A working research desk for the physical AI thesis.**

An independent application prototype by Jeremy: explore a source-grounded company universe, examine original research hypotheses, and turn evidence into a private shortlist and diligence notes.

[Open the dashboard](https://antifund-hq.jjvillan03.workers.dev) · [Research methodology](data/README.md) · [Architecture](docs/architecture.md) · [MVP scope](docs/scope.md)

## Try it in two minutes

1. Open **Start here** and read **The next robotics bottleneck may be the data loop**.
2. Follow a company into its evidence, risks, and unanswered questions. Public Anti Fund investments and independent research examples are labeled separately.
3. Save a company to your shortlist, assemble an editable brief, and add your judgment.
4. Reload. Your edits are stored in Cloudflare D1. Explore history, archive a record, and restore it from Trash.

The first visit includes **11 companies, 24 primary-source references, 12 observations, three original research briefs, and three thesis maps**, checked October 7, 2026. Counts describe this curated research corpus, not Anti Fund's full portfolio or live deal pipeline.

## What this demonstrates

- **Thesis into research:** maps robot data workflows, physical components and deployment, and the different timelines of compute and energy infrastructure.
- **Evidence into action:** connects source observations to company briefs, counterarguments, diligence questions, notes and a shortlist.
- **Shared agent context:** a bounded, source-linked research API and public read-only MCP tools reuse the same catalog as the interface.
- **Reliable persistence:** owner-scoped records, strict validation, expected-version updates, immutable revisions and recoverable archive/restore.
- **Inspectability:** source dates and check dates remain distinct; hypotheses and company-reported claims are labeled; unsupported financial metrics remain absent.

## Run locally

Requires Node 22.13–22.x. No model API key or external database account is required for local development.

```sh
npm ci
npm run build
npm run db:local
npm run seed:local
npm run dev
```

Open `http://localhost:4321`. Wrangler runs the same Worker and a local D1 database. Production records never use browser storage.

```sh
npm run check
npm run eval
```

## Monorepo

```text
apps/workspace/       Browser interface and official brand assets
apps/worker/          HTTP, visitor sessions and public read-only MCP
packages/core/       Schemas, owner-scoped data and bounded context retrieval
packages/connectors/ Explicit public-source adapter contract
agents/              Research instructions and boundaries
data/                Auditable public research fixture and methodology
migrations/          Cloudflare D1 schema and revision triggers
tests/               API, isolation, conflicts and context regression checks
scripts/             Build, seed validation, retrieval evaluation and deploy
docs/                Architecture, limitations, operations and verification
```

## Connect an agent

The public Streamable HTTP MCP endpoint is:

```text
https://antifund-hq.jjvillan03.workers.dev/mcp
```

It exposes `search_research` and `get_company_context`. No authentication is required for the public catalog. It cannot access visitor notes, change records, send messages, or retrieve provider credentials. See [the context contract](docs/context-contract.md) for retrieval behavior and a protocol example.

## Research and privacy boundaries

This is a curated public-source snapshot and an independent prototype, not Anti Fund's internal system. Public portfolio membership is attributed to Anti Fund's website; other companies are independent research examples, with no implied relationship or investment intent. Source links verify that a company made a claim, not that its technology or commercial performance has been independently validated.

Brief assembly is deterministic evidence scaffolding. There is no hidden model invocation, paid dataset, autonomous crawler, live fund accounting, or background outreach. Current retrieval is lexical and bounded; semantic indexing is a future extension, not a claimed feature.

Visitor records are stored in D1 and isolated by an opaque, HttpOnly browser cookie with a **30-day lifetime**. Clearing or losing that cookie loses access; account recovery and cross-device sign-in are outside this MVP. Export records before that period ends. This public application demo is for research notes, not confidential fund documents. Organization identity and access controls would be a separate deployment step before real firm adoption.

## Deploy

Use explicit project credentials with Workers and D1 permissions. Never use a default Wrangler account. See [operations](docs/operations.md). Production uses an isolated Worker and D1 database; it has no access to Jeremy HQ data.

## Attribution

Anti Fund and portfolio company marks belong to their respective owners. They are used to identify the subject of this independent application prototype. Asset sources and font licenses are listed in [asset provenance](apps/workspace/assets/SOURCES.md). No affiliation or endorsement is implied.
