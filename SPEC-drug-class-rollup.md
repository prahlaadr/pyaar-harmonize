---
spec_format_version: "0.1"
title: "pyaar harmonize — drug-class rollup"
artifact_type: "feature-spec"
spec_revision: 1
author: "Prahlaad"
created_at: "2026-10-28T00:00:00Z"
updated_at: "2026-10-28T00:00:00Z"
linked_github_repo: "prahlaadr/pyaar-harmonize"
parent_spec: "SPEC.md"
status: "proposed"
---

## Problem

The live drug-names tool normalizes a messy medication string to its generic
ingredient (`Lipitor` to `atorvastatin`). That is the right unit for dedup and
exact-drug analysis, but it is still too granular for the common next question:
"what is this drug, roughly?" Analysts routinely need to roll hundreds of
distinct ingredients up into a smaller set of therapeutic categories (statins,
antidepressants, antipsychotics, opioids) before they can count, segment, or
chart.

This gap is concrete in the CMS Medicare Part D "prescribers by provider and
drug" dataset, which ships brand and generic name **strings** with no NDC and no
drug code of any kind. A community question in the Out of Pocket Slack landed on
exactly this: with only strings, the practical path is
`string -> RxNorm (RxCUI) -> drug class`, and the cheap, accurate, free way to
get the class is the NLM RxClass API rather than paid terminology (First
Databank, Medispan) or a stale crosswalk. pyaar harmonize already does the first
two-thirds of that path and stops one step short of the class.

## Hypothesis

If the drug-names tool adds an optional step that resolves each matched RxCUI to
its ATC drug class(es) and appends a class column, then analysts working from
name-only datasets (Part D being the headline case) can go from raw strings to a
usable categorical rollup in one pass, without a warehouse, a paid vocabulary, or
hand-mapping, because the class lookup reuses the same RxNav API family the tool
already calls and preserves the privacy-first, browser-only promise.

## Scope

```productspec-scope
in:
  - an additional lookup step in the existing /drug-names tool, run after generic resolution
  - RxCUI to ATC class via RxClass: GET /REST/rxclass/class/byRxcui.json?rxcui={rxcui}&relaSource=ATC
  - a selectable ATC level (default: ATC level 2, "therapeutic subgroup") so the rollup granularity is a user choice
  - one appended output column per selected level (e.g. ATC_CLASS, with ATC_CLASS_CODE)
  - flagging drugs with no ATC mapping as NOT_CLASSIFIED, never guessed
  - a documented one-to-many policy for drugs that map to multiple classes
out:
  - a separate tile; this ships inside the existing drug-names tool, not as a new vocabulary
  - NDC-sourced class lookup (Part D has no NDC; string path only here)
  - paid terminology sources (First Databank, Medispan) or any licensed class system
  - server-side processing or storage of row values (privacy promise unchanged)
cut:
  - EPC / MED-RT / VA class sources (ATC only in this revision; others are a later option)
  - offline/bundled ATC crosswalk (stays a live RxNav call for now; revisit if rate limits bite)
```

## How it works

Builds directly on the current two-call flow in `lib/rxnorm-client.ts`
(`searchDrug` -> `getGenericName`). It adds a third call keyed on the RxCUI the
tool already has, so no extra fuzzy matching is needed:

1. **String to RxCUI** (existing) — `approximateTerm.json?term={name}`.
2. **RxCUI to generic ingredient** (existing) — `related.json?tty=IN`.
3. **RxCUI to drug class** (new) —
   `rxclass/class/byRxcui.json?rxcui={rxcui}&relaSource=ATC` returns the ATC
   class(es) for the drug, each with a code (e.g. `C10AA`) and a name (e.g.
   "HMG CoA reductase inhibitors"). The tool keeps the class(es) at the selected
   ATC level.

ATC is the WHO Anatomical Therapeutic Chemical classification: five nested
levels from anatomical main group (14 classes) down to chemical substance.
Level 2 (therapeutic subgroup) is the default because it gives a readable,
mid-grained rollup; level 1 is usually too coarse and level 4/5 too fine for a
first categorical cut. The level is exposed as a control so the analyst can pick.

A new type captures the result, e.g.:

```ts
export interface DrugClassResult {
  rxcui: string;
  atcLevel: number;
  classes: Array<{ code: string; name: string }>; // may be empty or length > 1
}
```

## Acceptance Criteria

- In the `/drug-names` tool the user can opt into a drug-class rollup and pick an
  ATC level (default level 2); with it on, the enriched CSV gains a class column
  (plus a code column) alongside the existing `GENERIC_NAME`.
- Each class value is derived from the drug's own RxCUI via the RxClass ATC
  endpoint; no new fuzzy match is performed for the class step.
- A drug with no ATC mapping is written as `NOT_CLASSIFIED` and never inferred or
  guessed, consistent with how unresolved names are flagged `NOT_FOUND` today.
- Drugs that map to more than one ATC class at the chosen level follow a single
  documented policy (see Open Questions) and the output states which policy was
  applied; multi-class rows are never silently reduced to one without a rule.
- The class step runs entirely client-side against RxNav; nothing but the drug
  value (already sent for normalization) leaves the browser, so the privacy claim
  in the parent SPEC still holds literally.
- The class step reuses the existing retry, timeout, and pacing in
  `rxnorm-client.ts`; a large CSV completes with visible progress and degrades
  gracefully under RxNav throttling.
- A stress run over the CMS Part D generic-name column produces a class for the
  clear majority of rows, with the unmatched remainder flagged rather than wrong.

## Design Decisions / Open Questions

- **Which ATC level is the default?** Proposed level 2 (therapeutic subgroup).
  Confirm against a real Part D rollup; some analyses want level 3
  (pharmacological subgroup). Shipping a selector defers the hard choice to the
  user but a sensible default still matters.
- **One-to-many policy.** A drug can belong to several ATC classes (different
  indications). Options: (a) emit all, semicolon-joined in one cell; (b) emit the
  first/primary; (c) explode to multiple rows. Recommendation: (a) all,
  semicolon-joined, so nothing is dropped and the analyst decides downstream.
  Needs a decision before build.
- **Combination drugs.** The generic step already returns only the first
  ingredient. Decide whether class lookup keys on the combination RxCUI (often
  mapped to its own ATC class) or on the first ingredient, since these can
  differ.
- **Coverage holes.** RxClass ATC coverage is good but not total; quantify the
  miss rate on the Part D set so `NOT_CLASSIFIED` is a known, reported quantity
  rather than a surprise.

## Risks

- **RxNav rate limits.** This adds a third sequential call per row, increasing
  request volume by roughly 50% on large files. Reuse the existing pacing and
  retry, and consider caching class lookups by RxCUI within a session (many rows
  share an ingredient) to cut calls sharply.
- **Privacy claim must stay literal.** The parent SPEC's promise is "nothing but
  the drug value leaves the browser." The class step must not introduce any new
  outbound payload beyond the RxCUI/drug already in flight; keep the docs precise.
- **Class-system expectations.** Users may expect a specific class taxonomy
  (e.g. a payer's or Tuva's preferred grouping) rather than ATC. Be explicit that
  this is ATC via RxClass, free and standard, and that other sources (EPC,
  MED-RT) are a later option, not this revision.

## Success Metrics

```productspec-success-metrics
- id: part_d_rollup_coverage
  metric: part_d_generic_rows_assigned_an_atc_class
  target: ">= 90%"
  window: one-time stress run
  segment: CMS Part D generic-name column
  source: repo test run
- id: class_step_adopted
  metric: sessions_enabling_the_class_rollup
  target: ">= 30%"
  window: monthly
  segment: sessions reaching the drug-names tool
  source: product_analytics (pending, see parent SPEC open questions)
- id: no_silent_drops
  metric: multi_class_rows_reduced_without_a_stated_policy
  target: "0"
  window: always
  segment: enriched output
  source: output audit
```
