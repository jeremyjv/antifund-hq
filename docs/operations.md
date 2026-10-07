# Operations

## Local development

```sh
npm ci
npm run build
npm run db:local
npm run seed:local
npm run dev
```

Local D1 state is ignored under `.wrangler/`. The development server runs at port 4321. Production never falls back to local or browser storage.

## Explicit deployment

Copy `.env.example` to ignored `.env`, set a project-scoped account and token, and update the D1 binding in `wrangler.jsonc` if deploying your own instance. Alternatively set `ANTIFUND_ENV_FILE` to a credential file outside the repository. Scripts require explicit `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, and refuse the implicit Wrangler login.

```sh
npm run check
npm run eval
npm run db:remote
npm run seed:remote
npm run deploy
```

The current public demo owns a dedicated `antifund-hq` Worker and D1 database. Do not reuse another application's data binding. No credentials are shipped in the static assets or committed to Git.

## Seed updates

Review the original primary pages; retain stable IDs; distinguish new publication dates from recheck dates. Update `data/research-seed.json`, run validation and retrieval evaluations, and commit a source audit with material changes. The import increments the public catalog version. It does not modify private visitor records.

## Recovery and limits

Export D1 before schema changes using an explicit project credential. Workspace archiving preserves all versions. Restore is a version-checked update, with its own revision. The interface can export visitor records; D1 backup is the operational recovery boundary. Visitor cookie expiration is 30 days and there is no self-service identity recovery in this demo.

## Smoke checks

- `/api/health` must report D1 and research readiness.
- `/api/research` must expose only the curated public catalog.
- Separate browser sessions must never see each other's workspace records.
- Save, reload, edit, view history, archive, and restore through the browser.
- Test read-only MCP initialization and tool calls.
- Verify mobile navigation, focus behavior, source links, assets and console errors.
