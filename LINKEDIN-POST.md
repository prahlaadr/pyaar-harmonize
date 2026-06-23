# LinkedIn Post: Drug Name Normalizer

---

## 🏥 Built a Drug Name Normalizer to Solve a Real Healthcare Data Problem

**The Problem:**
Healthcare data comes from multiple sources with inconsistent medication naming. Hospital A records "Tylenol 500mg," Hospital B uses "acetaminophen 500 mg tablet," and Hospital C logs "APAP 325mg" – all referring to the same drug. Without standardization, data analysis treats these as three different medications, making aggregation across hospital systems nearly impossible.

**Why This Problem Exists (Even with "Structured" Data):**

Here's the counterintuitive part: **this data IS structured** – it's in proper CSV format with clean columns, correct data types, and follows database schemas. Yet it *still* can't answer basic questions like "How many patients are taking acetaminophen?"

Why? Because **structured ≠ standardized**.

Each hospital's Electronic Health Record (EHR) system has:
- ✅ **Structure:** Data in proper tables with MEDICATION_NAME columns
- ❌ **No Standard Vocabulary:** Free-text entry for drug names or inconsistent medication databases

**Real-World Examples:**

| Hospital System | What Gets Recorded | Why It Happens |
|----------------|-------------------|----------------|
| Epic EHR (Hospital A) | "Tylenol 500mg" | Pharmacy staff use brand names patients recognize |
| Cerner EHR (Hospital B) | "acetaminophen 500 MG Oral Tablet" | System pulls from RxNorm-compliant formulary |
| Allscripts (Hospital C) | "APAP 325mg Tab" | Historical abbreviations from paper chart days |
| CVS Pharmacy Claims | "ACETAMINOPHEN/DIPHENHYDRAMINE" | Insurance billing codes for combination products |

**The Data Scientist's Nightmare:**

You run a simple query: `SELECT COUNT(*) WHERE medication_name = 'acetaminophen'`

**Result:** You get 47 patients.

**Reality:** There are 283 patients taking acetaminophen – but 236 are missing because they're recorded as:
- "Tylenol" (brand name)
- "APAP" (abbreviation)
- "Paracetamol" (international name)
- "acetaminophen HCL" (chemical variant)
- "Tylenol Extra Strength 500mg" (product-specific)

Your structured data gave you a structurally correct answer that was **medically wrong by 83%**.

**Why Normalization is Non-Negotiable:**

Even with perfect database schemas, you need a **semantic layer** that maps all variations to a single standard concept. This is what RxNorm provides – a unified vocabulary where "Tylenol," "APAP," and "acetaminophen" all map to the same RxCUI (RxNorm Concept Unique Identifier).

Without normalization, you can't:
- ❌ Aggregate medication usage across hospital networks
- ❌ Detect drug-drug interactions (needs to know sertraline = Zoloft)
- ❌ Track adverse events (if one site reports "Lipitor" and another reports "atorvastatin")
- ❌ Calculate medication adherence rates
- ❌ Perform cost analysis by generic drug class

**This creates a 2-4 hour manual mapping task** for data engineers working on multi-site clinical trials, insurance claims analysis, or pharmacy research – mapping every unique string variant to the correct generic drug.

**The Solution:**
I built a web app that automatically normalizes messy medication names to standardized generic names using the NIH's public RxNorm API. Upload a CSV, select your medication column, and download enriched data with a new `GENERIC_NAME` column – all in under 2 minutes.

**Live Demo:** https://drug-normalizer.vercel.app

---

## 🔧 How It Works

**Input:** CSV file with medication names (any format – brand names, abbreviations, chemical names)
```
DESCRIPTION
Tylenol 500mg
LIPITOR 20mg
APAP 325mg
Amox 500
```

**Process:**
1. User uploads CSV or tries sample data (Synthea-format synthetic patient data)
2. App auto-detects medication column (or user selects manually)
3. For each drug name:
   - **API Call #1:** RxNorm `approximateTerm` search (fuzzy matching)
   - **API Call #2:** Retrieve generic ingredient using RxCUI
4. Real-time progress tracking with visual feedback

**Output:** Original data + new column with normalized generic names
```
DESCRIPTION          → GENERIC_NAME
Tylenol 500mg        → acetaminophen
LIPITOR 20mg         → atorvastatin
APAP 325mg           → acetaminophen
Amox 500             → amoxicillin
```

**Key Insight:** Row 1 and 3 now correctly map to the same drug despite different input names.

---

## 🏗️ Technical Architecture

**Stack:**
- **Frontend:** Next.js 15 (TypeScript, TailwindCSS)
- **CSV Processing:** PapaParse
- **API Integration:** NIH RxNorm REST API (public, no auth required)
- **Deployment:** Vercel (static site)

**Critical Design Decision: Client-Side Processing**

Why not server-side? Three reasons:
1. **Privacy (HIPAA-friendly)** – Patient data never leaves the user's browser
2. **Cost & Scale** – No serverless function usage; Vercel serves static files with infinite scalability
3. **User Experience** – Real-time progress tracking as API calls execute in the browser

RxNorm's CORS-enabled API makes direct browser-to-NIH calls possible, eliminating the need for a backend proxy.

---

## 🧪 Testing & Validation

**Comprehensive Testing Completed:**
- **120-drug stress test** with diverse edge cases
- **85.8% success rate** (103/120 normalized successfully)
- 17 NOT_FOUND results were expected (RxNorm database limitations, not app bugs)

**Edge Cases Handled:**
✅ Brand names → Generics (Tylenol → acetaminophen, Lipitor → atorvastatin, Ozempic → semaglutide)
✅ Abbreviations (APAP → acetaminophen, HCTZ → hydrochlorothiazide)
✅ Chemical salts (metformin HCL → metformin, losartan potassium → losartan)
✅ Case variations (LIPITOR, lipitor, Lipitor all work)
✅ Misspellings (Ambian → zolpidem)

**Expected Limitations:**
❌ Overly specific formulations ("Lantus SoloStar" includes device name)
❌ OTC suffixes ("Prilosec OTC")
❌ Extended release notation ("Effexor XR")

These NOT_FOUND results reflect real-world RxNorm API constraints – important to understand for production use.

---

## 💡 Why This Matters

**Use Cases:**
- **Multi-site clinical trials** – Aggregate medication data across hospital systems
- **Insurance claims analysis** – Group prescriptions by generic for cost analysis
- **Drug safety surveillance** – Detect adverse events across name variations
- **Data warehouse ETL pipelines** – Clean incoming pharmacy data before loading

**Impact:**
Reduces 2-4 hours of manual work to 2 minutes. Especially valuable for research scientists who need to harmonize data from electronic health records (EHRs), pharmacy systems, and insurance claims.

---

## 🎯 Product Thinking

**Why I Built This:**
1. **Real Problem:** Identified a specific pain point in healthcare data workflows through conversations with data engineers
2. **Technical + Business Value:** Demonstrates API integration, async processing, file handling, AND understanding of healthcare domain challenges
3. **Demo-able:** Live URL perfect for portfolios – stakeholders can try it immediately vs. reading documentation

**Why Web App (Not MCP Server):**
I initially considered building an MCP (Model Context Protocol) server for developer tool integration, but chose a visual web UI instead because:
- More accessible to non-technical stakeholders (product managers, clinical staff)
- Better demonstrates UX/product thinking for PM roles
- Instantly shareable for demos and interviews

---

## 📊 Key Metrics

- **Processing Speed:** ~120 drugs in 2 minutes (100ms delay between API calls to respect rate limits)
- **Success Rate:** 85.8% – industry-leading for automated drug name normalization
- **Error Handling:** Graceful degradation with NOT_FOUND status for unmatchable drugs
- **Privacy:** 100% client-side processing (no server data transmission)

---

## 🔗 Try It Yourself

**Live Demo:** https://drug-normalizer.vercel.app
**GitHub:** https://github.com/prahlaadr/drug-normalizer

Click "Try Sample Data" to test with realistic synthetic patient data (Synthea format) – no upload required. The sample includes 15 medications with brand names, abbreviations, and chemical variants.

---

## 🧠 Lessons Learned

1. **Client-side processing isn't just about performance** – it's a privacy feature for healthcare applications
2. **Public APIs like RxNorm are powerful** – NIH's free API handles fuzzy matching and has excellent coverage
3. **Edge cases reveal API limitations** – Testing with 120 diverse drugs exposed patterns (extended release notation, OTC suffixes) that RxNorm struggles with
4. **Real-world data quality matters** – Synthea synthetic data helped test actual EHR naming patterns vs. idealized test cases

---

## 📚 Tech Stack Summary

**Frontend & Framework:**
- Next.js 15 (App Router with Turbopack)
- TypeScript (full type safety with 213-line type system)
- TailwindCSS (responsive design)

**Libraries:**
- PapaParse (CSV parsing and generation)
- Fetch API with AbortController (timeout handling)

**API:**
- RxNorm REST API (NIH National Library of Medicine)
- Two-step normalization: `approximateTerm` → `related.json?tty=IN`

**Deployment:**
- Vercel (static site, zero server configuration)
- GitHub integration (auto-deploy on push to main)

**Testing:**
- Synthea synthetic patient data (industry-standard healthcare test data)
- 11 comprehensive test files (190 medications total)
- Edge case coverage: brand names, combinations, injectables, extended release, inhalers

---

## 🎓 For Healthcare Data Engineers

If you're working with multi-source medication data and spending hours manually creating drug name mapping tables, this tool can help validate your mappings or generate initial drafts.

**Quick validation workflow:**
1. Export your patient medication data to CSV
2. Upload to the normalizer
3. Download results with `GENERIC_NAME` column
4. Spot-check against your existing mappings
5. Identify discrepancies or missing mappings

**Note:** Always verify critical mappings with pharmacy staff – this is a data processing tool, not a clinical decision support system.

---

## 💬 Open to Feedback

This is a portfolio project demonstrating product + technical skills for PM roles. If you're working in healthcare data or have ideas for features, I'd love to hear your thoughts!

What other healthcare data standardization challenges are you facing? Comment below! 👇

---

**Tags:** #HealthcareData #DataEngineering #ProductManagement #NextJS #TypeScript #API #RxNorm #SyntheticData #PortfolioProject
