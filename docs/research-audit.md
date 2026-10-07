# Public research audit

Second-pass evidence audit, October 7, 2026. Scope: seed classification, dated observations, brief claim support, and public source availability. This checks support in primary publications; it does not independently validate company performance.

## Result

**Pass with explicit evidence gaps.** The 6 portfolio classifications match Anti Fund's public list; 5 external examples assert no fund relationship. All 24 source URLs returned HTTP 200. The 4 precisely dated signals agree with official publication dates. No seed correction was required.

## Classification

[Anti Fund's selected investments](https://antifund.com/) explicitly names **Efference, Westmag, Etched, Modal, General Matter, and Helion**. The seed does not convert their disclosed investment rounds into current stages, positions, marks, or ownership.

**Foxglove, Rerun, Skild AI, Bedrock Robotics, and Hugging Face** remain research examples, not asserted portfolio companies or active deals. This classification is a demonstration label, not a claim that Anti Fund has never invested in them. Hugging Face is an ecosystem comparison, and no fundraising availability is implied.

## Date and claim support

| Signal | Seed date | Primary support | Outcome |
|---|---|---|---|
| Modal Clusters availability | 2026-10-01 | [Official release](https://modal.com/blog/modal-clusters-generally-available) displays October 1; includes a 1X training example | Pass |
| General Matter NRC filing | 2026-09-28 | [Official announcement](https://generalmatter.com/news/submitted-our-first-nrc-license/) displays September 28 and reports an application submission | Pass; submission is not approval |
| Skild physical self-play | 2026-09-23 | [Official post](https://www.skild.ai/blogs/physical-self-play) displays September 23 and reports simulation-to-hardware transfer | Pass; company result, not replicated here |
| Skild S1 release | 2026-08-18 | [Official index](https://www.skild.ai/blogs) dates the [S1 article](https://www.skild.ai/blogs/s1); article describes cumulative step scoring with intervention recovery | Pass; do not substitute these scores for unassisted task completion |

The remaining eight observations keep `observedAt: null`. [Efference H1](https://efference.ai/h1/) labels limited production as September 2026 without a publication day. [Bedrock's field report](https://bedrockrobotics.com/news/building-fully-autonomous-fleets-with-the-crews-who-need-them) has no displayed publication date in the reviewed content. Product-page review dates must not become event dates. The manifesto's month-only `2026-09` is intentionally preserved.

## Brief review

- **Data loop:** explicitly framed as a hypothesis. Product evidence supports the proposed workflow map. Skild's internal infrastructure and the open LeRobot baseline are meaningful counterpoints. The proposed incident-to-dataset measurement has not been performed; the brief says so. Diligence asks about intervention rates, data rights, integration effort, and budget ownership.
- **Physical stack:** accurately distinguishes Westmag's actuation, Efference's sensing, and Bedrock's deployment roles. No relationship between them is asserted. The readiness matrix is proposed analysis, not a completed benchmark. Yield, latency tails, supplier concentration, qualification, and productive hours are concrete unanswered questions.
- **Power and compute:** separates available cloud infrastructure, hardware validation, nuclear licensing, and future generation. It correctly separates uranium enrichment from fusion. [Helion's Orion page](https://www.helionenergy.com/orion) supplies the 2028 company target; the seed does not describe it as delivered power. No revenue, valuations, fund marks, returns, or capacity estimates were invented.

## Remaining gaps

The corpus is a curated public snapshot, not proprietary field research, a complete market census, or a continuous monitor. Company statements require replication, customer references, or regulatory corroboration before investment use. No interviews or benchmarks have been run. An HTTP 200 establishes retrieval, not claim truth or guaranteed browser rendering. Page content may change after this check; no immutable source snapshots are included.

## Availability ledger

All pages were read through the web tool during seed creation. This additional check used one bounded GET per URL, four concurrent requests, a 12-second timeout, and at most 2 KiB of response content. All 24 returned HTML and status 200; no bot blocks, 404s, or transport failures were observed. A future 403/429 must be classified as access restriction rather than evidence that a source is dead.

| Source | HTTP | Checked URL |
|---|---|---|
| af-manifesto | 200 | [Anti Fund](https://antifund.com/manifesto) |
| af-portfolio | 200 | [Anti Fund](https://antifund.com/) |
| efference | 200 | [Efference](https://efference.ai/) |
| efference-h1 | 200 | [Efference](https://efference.ai/h1/) |
| westmag | 200 | [Westmag](https://www.westmag.com/) |
| etched | 200 | [Etched](https://www.etched.com/) |
| modal | 200 | [Modal](https://modal.com/) |
| modal-clusters | 200 | [Modal](https://modal.com/blog/modal-clusters-generally-available) |
| gm-tech | 200 | [General Matter](https://generalmatter.com/technology/) |
| gm-nrc | 200 | [General Matter](https://generalmatter.com/news/submitted-our-first-nrc-license/) |
| helion | 200 | [Helion](https://www.helionenergy.com/) |
| helion-orion | 200 | [Helion](https://www.helionenergy.com/orion) |
| foxglove | 200 | [Foxglove](https://foxglove.dev/) |
| foxglove-mcap | 200 | [Foxglove](https://github.com/foxglove/mcap) |
| rerun | 200 | [Rerun](https://rerun.io/) |
| rerun-github | 200 | [Rerun](https://github.com/rerun-io/rerun) |
| skild | 200 | [Skild AI](https://www.skild.ai/) |
| skild-s1 | 200 | [Skild AI](https://www.skild.ai/blogs/s1) |
| skild-blog | 200 | [Skild AI](https://www.skild.ai/blogs) |
| skild-play | 200 | [Skild AI](https://www.skild.ai/blogs/physical-self-play) |
| bedrock | 200 | [Bedrock Robotics](https://bedrockrobotics.com/) |
| bedrock-fleets | 200 | [Bedrock Robotics](https://bedrockrobotics.com/news/building-fully-autonomous-fleets-with-the-crews-who-need-them) |
| lerobot | 200 | [Hugging Face](https://huggingface.co/docs/lerobot/index) |
| lerobot-github | 200 | [Hugging Face](https://github.com/huggingface/lerobot) |
