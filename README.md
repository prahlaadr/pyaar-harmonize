# pyaar harmonize

Browser-first harmonizers that turn messy drug data into standard vocabularies, built on the NIH RxNorm and RxClass APIs and aligned with the [Tuva Project](https://thetuvaproject.com). Two tools are live:

| Tool | Route | What it does |
|------|-------|--------------|
| **Drug Name Normalization** | `/drug-names` | Maps brand names, abbreviations and misspellings to generic ingredients and an RxCUI. |
| **Drug Class Rollup** | `/drug-classes` | Rolls drug names up to WHO ATC drug classes (levels 1 to 4). Built for claims extracts such as the CMS Part D prescriber files. |

**Live:** https://harmonize.pyaarproject.org

## Drug Class Rollup

### The problem

CMS publishes Medicare Part D prescribing per NPI, but each row identifies the drug only by a brand name and a generic name. CMS builds those names by linking the NDCs on the underlying claims to a commercial drug database, then aggregates to NPI + brand + generic, so the drug code is gone by the time the file is published. To analyze prescribing by drug class you need a crosswalk from those names to a classification.

The names come from one compendium, so a drug is spelled the same way in every row. They are also abbreviated and capped at 30 characters:

```
Fluticasone/Umeclidin/Vilanter     (Trelegy Ellipta)
Insulin Glargine,hum.Rec.Anlog     (Lantus Solostar)
Amoxicillin/Potassium Clav
Pen Needle, Diabetic               (a supply, not a drug)
```

Fuzzy matching every row is slow and quietly wrong. This tool matches each distinct name once, exact first, and labels every fuzzy match.

### How it works

1. **Stream the file.** The CSV is read in chunks in the browser, so a multi-gigabyte Part D file works without an upload. One pass collects the distinct name pairs and totals a measure column (for example `Tot_Clms`) per pair.
2. **Match each distinct name to RxNorm**, in this order:

   | Step | Example |
   |------|---------|
   | Supply check (never sent to fuzzy matching) | `Pen Needle, Diabetic` |
   | Exact or normalized match on the drug name | `Metformin Hcl` to metformin |
   | Combination split, every part exact | `Amoxicillin/Potassium Clav` to amoxicillin / clavulanate |
   | Backup name (brand), then brand prefixes that are themselves brands | `Trelegy Ellipta` to Trelegy |
   | Cleanup: compendium abbreviations, text after a comma, trailing formulation words | `Phenytoin Sodium Extended` to phenytoin |
   | Fuzzy (`approximateTerm`), accepted only when the result shares a word stem with the input | flagged for review |

3. **Classify with RxClass (WHO ATC).** Product-level classes (`ATCPROD`) come first, so combinations land in combination classes (losartan/HCTZ is C09DA, not one class per ingredient) and route matters (timolol eye drops are S01ED). For combinations without an RxNorm multi-ingredient concept, the tool uses the classes of products that contain every ingredient (birth-control packs with iron tablets are G03AA, not B03AA iron). Ingredient-level ATC is the last fallback.
4. **Download** a crosswalk (one row per distinct name), a rollup at the chosen ATC level, and, for files under 25 MB, the original rows with the class columns appended.

Crosswalk columns: `MATCH_TYPE`, `MATCHED_ON`, `MATCH_SCORE`, `RXCUI`, `RXNORM_NAME`, `RXNORM_TTY`, `INGREDIENTS`, `INGREDIENT_RXCUIS`, `ATC_SOURCE`, `ATC1_CODE` through `ATC4_NAME`, `ATC4_ALL`, `MATCH_NOTE`.

When a drug has more than one ATC class, the primary class is the one most of its RxNorm products carry; every class is listed in `ATC4_ALL`.

### Results on real Part D data

Every national row of *Medicare Part D Prescribers by Geography and Drug*, 2024: 3,632 distinct brand/generic pairs covering 1.71 billion claims.

| Match type | Names | Share of claims |
|------------|------:|----------------:|
| Exact | 2,847 | 94.8% |
| Combination (split, every part exact) | 110 | 1.7% |
| Brand name | 273 | 2.5% |
| Cleaned | 36 | 0.1% |
| Fuzzy, flagged for review | 93 | 0.3% |
| Supply (needles, pump cartridges, pads) | 230 | 0.6% |
| Not found | 43 | <0.1% |

**99.9% of drug claims (excluding supplies) land in an ATC class.** The run took about 11 minutes at NIH's rate limit.

Reproduce it, or run it on your own extract:

```bash
npx tsx scripts/eval-partd.ts                    # pulls the 2024 file from the CMS API
npx tsx scripts/eval-partd.ts path/to/file.csv   # any CSV with Gnrc_Name, Brnd_Name, Tot_Clms
```

### Known gaps

- Prenatal vitamins, multivitamins and some IV fluids have no RxNorm concept under their compendium names, so they come back `not_found`.
- A few drugs resolve in RxNorm but have no ATC class in RxClass (porcine thyroid, some new vaccines).
- ATC classifies by therapeutic use of the ingredient, not by indication on the claim.

## Drug Name Normalization

Upload a CSV, pick the medication column, and get `GENERIC_NAME` (every active ingredient, `/` separated), `RXCUI` and `MATCH_TYPE` columns back. It uses the same exact-first matcher as the Drug Class Rollup.

On the 116 distinct names in `test-files/` (Synthea-style descriptions, brand names, combinations, injectables, inhalers), the matcher resolves all 116 (each fuzzy and cleaned result checked by hand), up from 105 with the earlier fuzzy-first approach, and combination drugs now return every ingredient rather than the first.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, PapaParse, NIH RxNav (RxNorm + RxClass) REST APIs, Vercel.

API calls are rate limited to 15 requests per second (NIH allows 20), run a few at a time, retry timeouts and 5xx responses, and are cached per session.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## References

- RxNorm API: https://lhncbc.nlm.nih.gov/RxNav/APIs/
- RxClass API: https://lhncbc.nlm.nih.gov/RxNav/APIs/RxClassAPIs.html
- CMS Part D Prescribers methodology: https://data.cms.gov/resources/medicare-part-d-prescribers-methodology
- WHO ATC/DDD index: https://atcddd.fhi.no/atc_ddd_index/

## License and disclaimer

Part of the pyaar harmonize suite of healthcare-data harmonizers.

**Medical disclaimer:** For data processing and standardization only. Not for clinical decision-making; always verify medication information with licensed professionals.

**Data privacy:** Files are read in the browser and never uploaded. The only data that leaves the browser is the list of distinct drug names, sent to the NIH RxNav API.
