# MVP verification — October 7, 2026

The verified story is: a first-time visitor opens a populated research desk, inspects an evidence-backed brief and company, saves a shortlist or note, and retrieves the same cloud record after reload.

## Automated checks

- `npm run check`: build, 11 tests, and seed validation passed.
- `npm run eval`: 17 retrieval cases passed, checking concept coverage, company scoping, no-match behavior, citation integrity and the serialized context budget.
- `npm audit`: zero reported vulnerabilities at verification time.
- GitHub Actions verified the same build, tests, seed and retrieval checks on Ubuntu with Node 22.

The integration suite runs the actual Worker bundle against Miniflare D1. It covers visitor isolation, schema/reference validation, Origin and CSRF checks, concurrent expected-version updates, immutable history, archive/restore, idempotent shortlist creation, session quotas, public MCP and bounded retrieval. It does not establish the investment merits of any company.

## Chrome extension checks

| Flow | Evidence |
|---|---|
| First visit | Overview renders the real 11-company, 24-source corpus without sign-in. |
| Research | Featured brief opens with section citations, counterarguments, questions and related companies. |
| Company workflow | Foxglove detail shows its independent research label, sources and open questions; shortlist creation succeeds. |
| Brief assembly | Deterministic source brief opens as an editable draft, then saves to the private workspace. |
| Persistence | Saved brief remains after reload. Production note also remains after a separate live-site reload. |
| Editing/history | Changing title and status creates v2; v1 remains visible in history. |
| Archive/restore | Local record moves to Trash and restores as v4; the restored record survives reload. Production test note is recoverably archived after verification. |
| Export | Live JSON export downloaded successfully; parsed file contains the saved record and no CSRF/session credential fields. |
| Responsive layout | Narrow viewport uses mobile navigation and stacked cards; no document overflow. Company search and relationship filtering work. |
| Assets | Official Anti Fund mark, six portfolio logos and local typography render successfully. |
| Console | No browser warning/error entries captured during the checked flows. |

The narrow-layout review led to an explicit portfolio/research label under each company, and keyboard review corrected the skip link so it focuses the current page without changing routes.

## Live deployment checks

- `https://antifund-hq.jjvillan03.workers.dev/api/health`: HTTP 200 with D1 and research readiness.
- Public catalog: HTTP 200 with 11 companies, 24 sources and complete brief source counts of 9, 5 and 6.
- Public MCP: successful initialization and `get_company_context` for Westmag, with source metadata and bounded context.
- Clean source scan: no credentials or private workstation paths in tracked project files.

## Limits

Research is a curated snapshot. No private fund system, scheduled source refresh or autonomous model workflow was tested or claimed. Anonymous visitor access lasts 30 days and is tied to its browser cookie. The public MCP connector is read-only and excludes visitor records. Mobile checks are representative rather than exhaustive device certification.
