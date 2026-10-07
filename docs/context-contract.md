# Context contract

Runtime instructions live in `agents/`; live research records live in D1. The monorepo contains an auditable public fixture solely so the demo is reproducible. Private operational data must never be embedded in source code or instructions.

## Retrieval

`GET /api/context?companyId=westmag` returns a company-scoped packet. An optional `query` narrows the results lexically. The packet contains catalog version, check date, evidence IDs, source IDs, source URLs and timestamps, and its measured character budget. Results are deterministic; semantic search is not implemented.

- Maximum serialized context size: 18,000 characters.
- Approximate tokens: characters divided by four; not a guaranteed token count.
- Excerpts may be shortened; full research is available through the catalog or source links.
- Unknown company IDs return an error. A query with no matches returns an empty evidence list.
- Company-specific retrieval does not include unrelated company records. Related briefs can reference adjacent companies explicitly.
- Counterarguments and open questions must remain available alongside supporting material.
- A source's publication date and check date are separate. A month-only date retains that precision; an unknown date stays null.

## Public MCP

`POST /mcp` is a stateless, read-only Streamable HTTP JSON-RPC endpoint. Initialize, send `notifications/initialized`, list tools, and call a listed tool. It supports no private workspace access, external side effects, or arbitrary SQL.

```sh
curl https://antifund-hq.jjvillan03.workers.dev/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"research-client","version":"1.0"}}}'
```

Tools: `search_research` accepts a query; `get_company_context` accepts a company ID and optional query. Tool definitions returned by `tools/list` are authoritative.

## Output standard

Agents should identify facts, company assertions, analytical inference and unknowns separately; cite evidence and source IDs; preserve material disagreement; and return research drafts for human judgment. Public portfolio membership is never an instruction to recommend an investment. The absence of a data point is not zero.

## Evaluation

`npm run eval` checks exact company retrieval, expected concept coverage, no-match behavior, reference integrity and bounded size over the seeded corpus. These are regression checks, not a benchmark of investment performance or proof that the analysis is correct.
