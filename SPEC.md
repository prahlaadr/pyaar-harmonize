---
spec_format_version: "0.1"
title: "pyaar harmonize"
artifact_type: "prd"
spec_revision: 1
author: "Prahlaad"
created_at: "2026-07-08T00:00:00Z"
updated_at: "2026-07-08T00:00:00Z"
linked_github_repo: "prahlaadr/pyaar-harmonize"
---

## Problem

Healthcare-data teams lose days reconciling messy code sets before any analysis
can start. Raw claims and EHR extracts arrive with free-text drug names, loose
NDCs, and inconsistent ICD / CPT / LOINC / SNOMED codes that must be mapped to
standard vocabularies first. Today the options are lopsided: either stand up a
full data-warehouse pipeline (dbt + the Tuva Project), which needs engineering
setup and a warehouse, or map by hand in a spreadsheet. There is nothing
lightweight for the analyst or small team that just needs to harmonize one
column of a CSV, in minutes, without shipping potentially-sensitive data to a
server.

## Hypothesis

If we ship focused, browser-first harmonizer tools aligned to the Tuva vocabulary
set, where each tool maps one messy input column to a standard code system
entirely client-side, then healthcare analysts and small teams will adopt them
for quick harmonization and the Tuva community will come to see pyaar harmonize
as a complementary partner, because the tools lower the barrier to
Tuva-standard data without requiring a warehouse or a pipeline.

## Scope

```productspec-scope
in:
  - suite hub at / that frames the tools and their Tuva alignment
  - browser-first CSV crosswalk tools, one per Tuva-aligned vocabulary
  - drug names to RxNorm (live today)
  - queued tiles: NDC, ICD-10, CPT/HCPCS, LOINC, SNOMED, NPI/taxonomy, data-quality checks
  - fully in-browser processing (privacy-first, no upload to a server)
  - per-tool CSV in, enriched CSV out, with progress and flagged unmatched rows
out:
  - full data-warehouse / dbt pipelines (that is Tuva itself; we complement, not replace)
  - server-side storage of uploaded PHI
  - accounts, auth, multi-tenant workspaces
  - a paid tier
cut:
  - programmatic / bulk API access (browser UI only for now)
  - any tool beyond drug-names being live in this revision (rest stay "coming soon")
```

## Strategic Positioning

Built to align with the open-source Tuva Project (thetuvaproject.com). Tuva
harmonizes healthcare data inside a warehouse; pyaar harmonize delivers the same
vocabulary alignment as focused, browser-first tools for people who are not
ready to run a pipeline. The standing goal is to become a trusted partner in the
Tuva ecosystem, not to compete with it. Brand mark is always lowercase
"pyaar harmonize".

## Acceptance Criteria

- The hub at `/` frames the suite and its Tuva alignment, and shows every
  vocabulary as a tile with an accurate live / coming-soon status.
- A live tool accepts a CSV, lets the user pick the input column, and maps it to
  the target code system entirely in the browser, with visible progress on large
  files.
- The user can download an enriched CSV with the standardized codes appended.
- No uploaded data leaves the browser; processing is client-side and this is
  verifiable in the network tab.
- Rows that are unmatched or ambiguous are flagged in the output, never silently
  dropped.
- Each new tool mirrors the `/drug-names` structure and the pyaar theme tokens,
  so the suite stays visually and structurally consistent.

## Risks

- **Vocabulary licensing.** LOINC and RxNorm are freely usable, but CPT is
  AMA-licensed and SNOMED CT requires an affiliate license in some
  jurisdictions. A browser tool that redistributes or bulk-serves those code
  sets could cross a licensing line. Resolve per-vocabulary before shipping
  those tiles; may constrain which tools ship or how they source data.
- **Public-API rate limits.** Client-side crosswalks lean on NLM / RxNav and
  similar public APIs; large CSVs can hit throttling. Needs batching, retry, and
  a graceful degradation story.
- **Privacy claim must hold literally.** "Nothing leaves your browser" is the
  core promise. Any tool that calls an external API with row values (e.g. a drug
  name) technically sends data out; be precise about what is and isn't local so
  the claim stays honest.

## Success Metrics

```productspec-success-metrics
- id: tuva_partner_recognition
  metric: recognized_as_tuva_ecosystem_partner
  target: "yes (listed, referenced, or in active collaboration)"
  window: within 12 months
  segment: Tuva community
  source: qualitative milestone
- id: live_tools_shipped
  metric: vocabulary_tools_live
  target: ">= 4 of 8"
  window: within 6 months
  segment: suite
  source: repo state
- id: harmonization_completion_rate
  metric: sessions_that_upload_and_download_a_result
  target: ">= 50%"
  window: monthly
  segment: sessions reaching a live tool
  source: product_analytics (see open_questions)
```

## Open Questions

- **No analytics wired yet.** Usage metrics above (completion rate, repeat use)
  are not measurable until privacy-respecting analytics is added. Decide what to
  instrument without undermining the privacy-first promise, or accept that early
  success is judged on tools-shipped + partner-recognition alone.
- **Which tool is next?** NDC is the closest neighbor to the live RxNorm tool
  and shares the RxNav data source, so it is the low-friction next build.
  ICD-10 has broad demand but a different source. Pick before building.
- **Licensing per vocabulary** (see Risks) must be answered before CPT/HCPCS and
  SNOMED tiles move from "coming soon" to live.
