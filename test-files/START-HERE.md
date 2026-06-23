# 🚀 Drug Normalizer Test Data - START HERE

## What's in This Folder?

**11 CSV test files** + **3 documentation files** for comprehensive testing of your Drug Name Normalizer app.

📁 **Location:** `~/Desktop/drug-normalizer-test-files/`

---

## 📚 Documentation (Read These First)

1. **START-HERE.md** ← You are here
2. **QUICK-START.md** - 3-step testing guide (start here if you want to test immediately)
3. **README.md** - Complete file descriptions, data sources, expected results
4. **EDGE-CASES-GUIDE.md** - Advanced testing with challenging medications

---

## 🎯 Quick Test (5 Minutes)

### Option 1: Simple Test
1. Go to: https://drug-normalizer.vercel.app
2. Upload: `test-set-1-cardiovascular.csv`
3. Select: DESCRIPTION column
4. Click: "Normalize Drug Names"
5. Download: Enriched CSV with GENERIC_NAME column

**Expected:** ~90% success rate (13-14 out of 15 drugs)

### Option 2: Real Data Test
1. Upload: `test-set-6-REAL-synthea-sample.csv`
2. Same steps as above

**Expected:** ~85% success rate (extracted from real Synthea dataset)

---

## 📊 Test Files At a Glance

### 🟢 Standard Tests (High Success Rate)
| File | Medications | Test Focus |
|------|-------------|-----------|
| test-set-1-cardiovascular.csv | 15 | Simple generics, common brands |
| test-set-2-diabetes-endocrine.csv | 17 | Insulins, GLP-1s (Ozempic) |
| test-set-3-antibiotics-infections.csv | 16 | Antibiotics, abbreviations |
| test-set-4-mental-health-pain.csv | 17 | Tylenol, Advil, antidepressants |
| test-set-5-respiratory-gi.csv | 17 | Inhalers, acid reflux meds |
| test-set-6-REAL-synthea-sample.csv | 18 | ⭐ Real extracted data |

**Total:** 100 medications | **Expected Success:** 85-90%

### 🟡 Edge Cases (Moderate-Low Success Rate)
| File | Medications | Test Focus |
|------|-------------|-----------|
| test-set-7-EDGE-brand-names.csv | 18 | [Humulin], [Toprol] brackets |
| test-set-8-EDGE-combination-drugs.csv | 18 | Multi-ingredient (/) |
| test-set-9-EDGE-injectables-IV.csv | 18 | Injectable formulations |
| test-set-10-EDGE-special-formulations.csv | 18 | Extended release, patches |
| test-set-11-EDGE-inhalers-sprays.csv | 18 | ACTUAT dosing, MDI |

**Total:** 90 medications | **Expected Success:** 65-75%

---

## 🏆 Recommended Testing Sequence

### Beginner (15 minutes)
1. `test-set-1-cardiovascular.csv` - Baseline
2. `test-set-6-REAL-synthea-sample.csv` - Real data
3. Done! You've tested 33 medications

### Intermediate (30 minutes)
1. All standard tests (files 1-6)
2. Download each result
3. Compare success rates
4. You've tested 100 medications

### Advanced (1 hour)
1. All standard tests (files 1-6)
2. All edge cases (files 7-11)
3. Document NOT_FOUND patterns
4. Compare vs industry benchmarks
5. You've tested all 190 medications

---

## ✅ Success Criteria

### Your App is Working Well If:
- ✅ Standard tests: 80-90% success rate
- ✅ Edge cases: 60-75% success rate
- ✅ Brand names converted: Tylenol → acetaminophen
- ✅ Abbreviations handled: APAP → acetaminophen
- ✅ Chemical names stripped: metformin hcl → metformin

### Expected Failures (These are NORMAL):
- ❌ Triple combinations: "Amlodipine / HCTZ / Olmesartan" → NOT_FOUND
- ❌ Brand + device: "Lantus SoloStar" → NOT_FOUND
- ❌ Old brands: "Enovid" → NOT_FOUND
- ❌ NDA codes: "NDA020503" → NOT_FOUND

---

## 🔗 Links

- **Live App:** https://drug-normalizer.vercel.app
- **GitHub:** https://github.com/prahlaadr/drug-normalizer
- **Data Source:** https://synthetichealth.github.io/synthea-sample-data/

---

## 💡 Pro Tips

1. **Start Simple:** Test file 1 first to establish baseline
2. **Check Column:** App auto-detects "DESCRIPTION" column
3. **Download Results:** Compare before/after in Excel
4. **Edge Cases:** Don't be discouraged by 40-60% success on file 8 (combinations are hard!)
5. **Real Data:** File 6 is 100% authentic Synthea output

---

## 📞 Need Help?

- **Quick Start:** Read `QUICK-START.md`
- **Detailed Info:** Read `README.md`
- **Edge Cases:** Read `EDGE-CASES-GUIDE.md`

---

**Created:** 2025-01-21  
**Files:** 11 CSV + 4 Documentation  
**Total Medications:** 190  
**Data Source:** Official Synthea 10K COVID-19 Dataset
