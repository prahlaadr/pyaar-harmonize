# Quick Start Guide

## 🚀 Test Your Drug Normalizer in 3 Steps

### Step 1: Choose a Test File
Pick any of the 6 CSV files in this folder:

**Recommended for first test:**
- `test-set-1-cardiovascular.csv` - Simple, common medications (15 drugs)
- `test-set-6-REAL-synthea-sample.csv` ⭐ - Real Synthea data (18 drugs)

### Step 2: Upload to Drug Normalizer
1. Go to: **https://drug-normalizer.vercel.app**
2. Click "Choose File" or drag & drop your CSV
3. Select "DESCRIPTION" column (should auto-detect)
4. Click "Normalize Drug Names"

### Step 3: Review Results
- View before/after comparison
- Download enriched CSV with GENERIC_NAME column
- Try another file!

---

## 📊 What You'll See

### Example Transformations
```
ORIGINAL                                    → GENERIC NAME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Simvastatin 20 MG Oral Tablet              → simvastatin
LIPITOR 20mg                               → atorvastatin  
Metformin hydrochloride 500 MG             → metformin
APAP 500mg Tab                             → acetaminophen
Ozempic 1mg                                → semaglutide
amLODIPine 5 MG / HCTZ 12.5 MG             → amlodipine
```

### Success Rate
- **Expected:** 85-90% successful normalizations
- **NOT_FOUND:** 10-15% (combination drugs, brand suffixes)

---

## 🎯 File Recommendations by Use Case

**Testing Brand → Generic:**
- `test-set-1-cardiovascular.csv` (Lipitor → atorvastatin)
- `test-set-4-mental-health-pain.csv` (Tylenol → acetaminophen, Zoloft → sertraline)

**Testing Abbreviations:**
- `test-set-1-cardiovascular.csv` (HCTZ)
- `test-set-3-antibiotics-infections.csv` (AMOX, Z-Pack)

**Testing Complex Cases:**
- `test-set-2-diabetes-endocrine.csv` (GLP-1s: Ozempic, Jardiance, Lantus)
- `test-set-6-REAL-synthea-sample.csv` (combination drugs, real variations)

**Testing Real-World Data:**
- `test-set-6-REAL-synthea-sample.csv` ⭐ (extracted from 431K actual Synthea records)

---

## ❓ Troubleshooting

### "Column not found"
- Make sure CSV has a header row
- Check that "DESCRIPTION" column exists
- Try manually selecting the medication column

### High "NOT_FOUND" rate
- Expected for combination drugs (e.g., "Amlodipine / HCTZ / Olmesartan")
- Brand names with suffixes (e.g., "Lantus SoloStar", "Prilosec OTC")
- This is normal RxNorm API behavior

### Slow processing
- Normal for 15-20 drugs (2-3 minutes)
- 100ms delay between API calls to avoid rate limits
- Progress bar shows real-time updates

---

## 📝 What to Test

✅ Upload all 6 files sequentially  
✅ Try with your own medication CSV  
✅ Compare results across different drug categories  
✅ Download and inspect the enriched CSV  
✅ Check edge cases (ALL CAPS, lowercase, abbreviations)  

---

## 🔗 Links

- **Live App:** https://drug-normalizer.vercel.app
- **GitHub Repo:** https://github.com/prahlaadr/drug-normalizer
- **Documentation:** See README.md in this folder
- **Synthea Data Source:** https://synthetichealth.github.io/synthea-sample-data/

---

**Created:** 2025-01-21  
**Last Updated:** 2025-01-21
