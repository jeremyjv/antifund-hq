# Research workspace UI

- Keep the public research snapshot distinct from private visitor records. Load both through the authenticated/owner-scoped API; never substitute localStorage or hardcoded records.
- All interpolated text passes through `esc`; all external source URLs pass through `safeURL`. No raw imported HTML.
- Preserve source date precision: unknown dates remain unknown and month-only dates never acquire an invented day.
- A saved record means the cloud API confirmed it. Keep drafts visible on failure; use expectedVersion updates and never automatically overwrite a conflicting revision.
- Source briefs are deterministic compilations, not agent runs. Do not invent activity, fund metrics, performance, or portfolio relationships.
- Use local brand assets with provenance in assets/SOURCES.md. Preserve original logo colors.
- Verify desktop and mobile interactions, keyboard/dialog behavior, create/edit/archive/restore/history, and persistence after reload.
