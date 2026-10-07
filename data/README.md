# Public research seed

`research-seed.json` makes the first visit useful without pretending to possess the firm's private records. It contains 15 real organizations, 30 primary-source references, 18 observations, 3 research briefs, and 3 thesis maps. Sources were checked on **October 7, 2026**.

## What the labels mean

- **Portfolio**: Anti Fund publicly lists the company among its selected investments. This does not state current ownership, exposure, valuation, or endorsement of this prototype.
- **Research**: independently selected public research examples. This does not assert Anti Fund interest, a relationship, a live deal, or investment suitability. Hugging Face is also an ecosystem comparison point, not a claim of investment availability.
- **Research hypothesis**: original analysis for this prototype. It is not Anti Fund's internal thesis or an investment recommendation.
- Company statements remain **company-reported**, even when the original page has been verified. Technical benchmarks, economics, and customer outcomes have not been independently audited.

## Seeding methodology

1. Begin with Anti Fund's published focus on infrastructure constraints and physical automation. Select six named public investments as context anchors.
2. Map adjacent problems: recording and curating robot experience, physical components and deployment, compute access, and power delivery. Select five external organizations as explicit research examples or comparison points.
3. Read company product pages, technical documentation, official repositories, and original announcements. Store a source ID, title, publisher, URL, publication date where available, and the date checked.
4. Write short factual summaries. Store analysis in thesis-fit fields, briefs, and questions. Do not create revenue, valuation, fund marks, ownership percentages, pipeline stages, founder conversations, or live agent activity.
5. Connect every record to evidence. Add unknowns, competing explanations, and diligence questions before proposing a next step.
6. Keep the corpus curated and bounded. This is a research snapshot assembled with browsing assistance, not a continuously running crawler, exhaustive market census, proprietary dataset, or live monitoring service.

## Dates and freshness

`checkedAt` records review of the source. `publishedAt` records the source's displayed publication date, not the retrieval date. Month-only dates retain their original precision. Null means unavailable; it must not render as today's news.

`observedAt` is the displayed date of the underlying announcement when a precise day is available. Undated product observations remain null. Efference's H1 page states September 2026 limited production, but supplies no exact publication date. Skild S1's August 18, 2026 date is corroborated by its official blog index. Bedrock's fleet story supplies no publication date in the accessible page. Homepage copyright dates are not publication dates.

Do not silently update `checkedAt` on application start. Recheck sources before an application submission, then commit the verified changes. Old material can remain useful when clearly dated.

## Reproducible maintenance path

The next connector iteration should ingest an allowlisted set of official RSS feeds, GitHub releases, and source pages. Retain content hashes and fetch timestamps; resolve organizations by canonical domain; flag meaningful changes for review; generate drafts with source references. Promote a draft only after validating dates and claims. Maintain revisions and propagate source changes to dependent briefs.

Measure source coverage, duplicate rate, broken references, claim support, and time since actual review. GitHub stars and activity are discovery hints rather than evidence of revenue or technical quality. The seed intentionally omits volatile popularity counts.

## Schema and integrity

Source IDs and record IDs are stable. Relationships among records are explicit via `sourceIds` and `companyIds`. Company stages remain null because an old investment round is not a verified current fundraising stage. All links are public; the seed contains no Jeremy HQ private data, confidential fund information, or invented financial records.

To extend this dataset, preserve the distinction between evidence and analysis and run the repository's seed validation before importing it into D1.

## Sourcing candidate metrics

The six-company market snapshot covers Foxglove, Rerun, Baseten, Fireworks AI, Radiant, and Quaise Energy. Funding amounts come from company announcements linked in the public catalog. Dates describe those announcements, not live fundraising. Radiant's figure retains its “more than” qualifier; Rerun's article has no exact publication date, so the date remains unknown.

`portfolio-exclusions.json` records the expanded published investment list checked at https://antifund.com/#portfolio on October 7, 2026. The candidates are absent from that list; this does not rule out undisclosed investments. The validator rejects metrics tied to known holdings, and a regression check compares candidate names against the exclusion list. All private financial metrics remain unknown. Public company claims, our thesis interpretation, and diligence questions are kept distinct.
