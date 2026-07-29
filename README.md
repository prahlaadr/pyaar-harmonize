# pyaar harmonize

Drug-name normalization: map brand names, abbreviations, and misspellings to standardized generic ingredients via the NIH RxNorm API. The first tool in the pyaar harmonize suite of healthcare-data harmonizers.

**Live:** https://harmonize.pyaarproject.org

## The problem

Healthcare data arrives from many sources with inconsistent medication naming:

```
Hospital A: "Tylenol 500mg"
Hospital B: "acetaminophen 500 mg tablet"
Hospital C: "APAP 325mg"
Pharmacy:   "Paracetamol"
```

Without normalization, analysis treats these as four different drugs. With it, they all map to `acetaminophen`, so data can be aggregated accurately across systems. That matters for multi-site clinical trials, claims analysis, drug-safety surveillance, and any ETL that feeds analytics.

## How it works

Everything runs client-side in the browser, so patient data never leaves the user's machine (no server, no uploads). Upload a CSV, pick the medication column, and for each name the tool:

1. **Fuzzy-matches** against RxNorm — `GET /REST/approximateTerm.json?term={name}` returns the best `rxcui` (RxNorm concept id).
2. **Resolves the ingredient** — `GET /REST/rxcui/{rxcui}/related.json?tty=IN` returns the active-ingredient (generic) name.

The original CSV is returned with a `GENERIC_NAME` column added, alongside a before/after view and a download. Names RxNorm can't resolve are flagged `NOT_FOUND` rather than guessed.

**Stack:** Next.js (App Router) · TypeScript · TailwindCSS · PapaParse · RxNorm REST API · Vercel.

## Results

On a 120-drug stress test with diverse naming, 103/120 (85.8%) normalized correctly in ~2 minutes. It handles brand → generic (Lipitor → atorvastatin), abbreviations (APAP → acetaminophen, HCTZ → hydrochlorothiazide), salt and chemical suffixes (metformin hcl → metformin), case variations, and common misspellings (Ambian → zolpidem), and correctly returns `NOT_FOUND` for nonsense input.

The remaining ~14% are RxNorm database limits, not app errors — mostly formulation or device suffixes (Ventolin HFA, Lantus SoloStar), OTC and product-line suffixes (Prilosec OTC, Pepcid AC), and extended-release notation (Effexor XR, bupropion xl).

## Limitations

- Normalizes one medication column at a time.
- Sequential API calls (no batching), paced by a short delay.
- English medication names only (RxNorm scope).
- Combination drugs return the first ingredient only.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## References

- RxNorm API — https://lhncbc.nlm.nih.gov/RxNav/APIs/
- RxNorm overview — https://www.nlm.nih.gov/research/umls/rxnorm/
- Synthea (synthetic patient data) — https://synthetichealth.github.io/synthea/

## License & disclaimer

Part of the pyaar harmonize suite of healthcare-data harmonizers.

**Medical disclaimer:** For data processing and standardization only. Not for clinical decision-making; always verify medication information with licensed professionals.

**Data privacy:** All processing happens client-side. No data is transmitted anywhere except public drug-name queries to the NIH RxNorm API.
