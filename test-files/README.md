# Drug Normalizer Test Files

This folder contains **11 realistic medication CSV test files** for comprehensive testing of the Drug Name Normalizer app.

- **Files 1-6:** Standard medication categories (cardiovascular, diabetes, antibiotics, etc.)
- **Files 7-11:** ⚠️ **EDGE CASES** - Complex real-world challenges (see EDGE-CASES-GUIDE.md)

## 📋 Files Overview

| File | Medications | Category | Description |
|------|-------------|----------|-------------|
| **test-set-1-cardiovascular.csv** | 15 | Heart/Blood Pressure | Statins, ACE inhibitors, beta blockers, blood thinners |
| **test-set-2-diabetes-endocrine.csv** | 17 | Diabetes/Thyroid | Metformin, insulin, GLP-1s (Ozempic, Jardiance), thyroid meds |
| **test-set-3-antibiotics-infections.csv** | 16 | Antibiotics | Amoxicillin, azithromycin, cipro, doxy for various infections |
| **test-set-4-mental-health-pain.csv** | 17 | Mental Health/Pain | Antidepressants, anxiety meds, pain relievers (Tylenol, Advil) |
| **test-set-5-respiratory-gi.csv** | 17 | Respiratory/GI | Asthma inhalers, acid reflux meds (Prilosec, Nexium) |
| **test-set-6-REAL-synthea-sample.csv** | 18 | ⭐ **REAL DATA** | Random sample from actual 10K Synthea COVID-19 dataset |
| **test-set-7-EDGE-brand-names.csv** | 18 | ⚠️ Brand Names [Brackets] | Humulin, Humalog, Epogen, Toprol (60-75% expected) |
| **test-set-8-EDGE-combination-drugs.csv** | 18 | ⚠️ Multi-Ingredient (/) | Triple combos, slash-separated (40-60% expected) |
| **test-set-9-EDGE-injectables-IV.csv** | 18 | ⚠️ Injectable/IV | Prefilled syringes, MG/ML dosing (70-85% expected) |
| **test-set-10-EDGE-special-formulations.csv** | 18 | ⚠️ Extended Release | 24 HR, ER, XR, transdermal (75-85% expected) |
| **test-set-11-EDGE-inhalers-sprays.csv** | 18 | ⚠️ Actuated Devices | ACTUAT, MDI, nasal sprays (70-80% expected) |

**Total:** 190 medications across 11 files
- **Standard Tests (1-6):** 100 medications (~85-90% success expected)
- **Edge Cases (7-11):** 90 medications (~65-75% success expected)

### ⭐ NEW: Real Synthea Data (test-set-6)
**File 6 is extracted from actual Synthea-generated data** (not manually created):
- **Source:** Official Synthea 10K COVID-19 Patient Dataset (431,263 medication records)
- **Download:** https://synthetichealth.github.io/synthea-sample-data/downloads/10k_synthea_covid19_csv.zip
- **Selection:** Random 18 medications from real patient data
- **Includes:** Combination drugs, complex formulations, brand names [Humulin]

## 🎯 What Makes These Realistic

These files are modeled after **Synthea** (Synthetic Patient Generator) format, which is the industry standard for synthetic healthcare data used by:
- Healthcare researchers
- Data engineers building ETL pipelines
- Clinical trial analysts
- Insurance claims processors

### Real-World Variations Included

Each file tests the Drug Name Normalizer's ability to handle:

✅ **Brand Names**
- Tylenol → acetaminophen
- Lipitor → atorvastatin
- Ozempic → semaglutide
- Nexium → esomeprazole
- ProAir HFA → albuterol

✅ **Abbreviations**
- APAP → acetaminophen
- HCTZ → hydrochlorothiazide
- AMOX → amoxicillin
- Z-Pack → azithromycin

✅ **Chemical Names with Salts**
- Metformin hydrochloride → metformin
- Losartan Potassium → losartan
- Duloxetine HCL → duloxetine

✅ **Case Variations**
- LIPITOR 20mg (ALL CAPS)
- simvastatin (lowercase)
- Zoloft 50mg (Title Case)

✅ **Dosage Formats**
- "500 MG Oral Tablet"
- "500mg"
- "0.09 MG/ACTUAT"

## 📊 CSV Format

All files follow the **Synthea medications.csv schema**:

```csv
START,STOP,PATIENT,PAYER,ENCOUNTER,CODE,DESCRIPTION,BASE_COST,PAYER_COVERAGE,DISPENSES,TOTALCOST,REASONCODE,REASONDESCRIPTION
```

### Key Columns

- **DESCRIPTION** - The medication name to normalize (brand names, generics, abbreviations)
- **START/STOP** - ISO 8601 timestamps for prescription dates
- **PATIENT** - Synthetic patient UUID
- **PAYER** - Insurance provider (Medicare, UnitedHealthcare, Aetna, etc.)
- **BASE_COST/TOTALCOST** - Realistic pricing data
- **REASONCODE/REASONDESCRIPTION** - SNOMED-CT diagnosis codes

## 🧪 How to Use These Files

1. **Open Drug Normalizer:** https://drug-normalizer.vercel.app
2. **Upload a test file** from this folder
3. **Select "DESCRIPTION" column** (should auto-detect)
4. **Click "Normalize Drug Names"**
5. **Download enriched CSV** with GENERIC_NAME column added

## ✅ Expected Results

The normalizer should successfully convert:
- ~85-90% of medications to generic names
- Brand names → generics (Tylenol → acetaminophen)
- Abbreviations → full names (APAP → acetaminophen)
- Chemical names → base ingredient (metformin hcl → metformin)

Some medications may return "NOT_FOUND" due to:
- Overly specific formulations (e.g., "Lantus SoloStar" with device name)
- OTC suffixes (e.g., "Prilosec OTC")
- Extended release notation (e.g., "Effexor XR")
- Invalid/test drugs

## 🔗 Data Sources

### Files 1-5: Curated Test Sets (Manually Created)
Based on documented patterns from:
- **Synthea Format Specification:** https://github.com/synthetichealth/synthea/wiki/CSV-File-Data-Dictionary
- **Medicare Part D:** Prescription naming patterns from CMS public datasets
- **Common Pharmacy Abbreviations:** Real-world EHR naming conventions
- **Use Case:** Targeted testing of specific drug categories and edge cases

### File 6: Real Synthea Data (Extracted from Official Dataset)
- **Source:** 10K Synthea COVID-19 Patient Dataset (54MB ZIP, 431K+ medication records)
- **Direct Download:** https://synthetichealth.github.io/synthea-sample-data/downloads/10k_synthea_covid19_csv.zip
- **Extracted:** Random 18 medications from `medications.csv`
- **Why This Matters:** 100% authentic Synthea output, not manually typed
- **Use Case:** Testing against real-world data quality issues

### Why Harvard Dataverse Didn't Work
The Harvard Dataverse dataset (https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/BWDKXS) requires:
- Manual download through web interface (no direct curl access)
- Authentication/session management
- Large file size (15K patients)

**Solution:** We downloaded the publicly available Synthea COVID-19 dataset instead, which provides the same authentic format with easier access.

## 📁 Why Not Real Patient Data?

We use **synthetic data** because:
- ✅ **HIPAA Compliant** - No real patient information
- ✅ **Publicly Shareable** - Can be used for demos, testing, training
- ✅ **Realistic Patterns** - Mirrors real-world healthcare data quality issues
- ✅ **No Privacy Concerns** - Safe for portfolios and public repositories

## 🎓 Use Cases

Perfect for testing:
- Drug name normalization algorithms
- Healthcare data ETL pipelines
- Clinical data warehouse loads
- Insurance claims processing
- Pharmacy benefit management systems
- Research study data harmonization

---

**Created:** 2025-01-21
**Format:** Synthea-compliant medications.csv
**Purpose:** Testing Drug Name Normalizer (https://drug-normalizer.vercel.app)
