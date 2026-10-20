/**
 * Drug class lookup: RxNorm ingredients -> WHO ATC classes via NLM RxClass.
 *
 * ATC is a 4-level hierarchy, so one lookup gives every level of rollup:
 *   L1  C       Cardiovascular system
 *   L2  C09     Agents acting on the renin-angiotensin system
 *   L3  C09D    ARBs, combinations
 *   L4  C09DA   ARBs and diuretics
 *
 * Lookup order:
 *   1. ATCPROD (product level) for the ingredient, or for the combination's
 *      RxNorm MIN. It classifies actual products, so combinations land in
 *      combination classes (losartan/HCTZ -> C09DA rather than one class per
 *      ingredient) and route-specific use is reflected (timolol eye drops ->
 *      S01ED, timolol tablets -> C07AA).
 *   2. For combinations: WHO's ingredient-level ATC for the MIN, then ATCPROD
 *      classes of products that contain every ingredient (packs and kits).
 *   3. ATC (ingredient level) for each ingredient as the last fallback.
 *
 * When a drug sits in more than one class, the primary class is the one
 * carried by the most RxNorm products; every class is still returned.
 */

import { rxnavGet } from './rxnav';
import { DrugMatch, Ingredient, findMultiIngredient } from './drug-match';

export type AtcLevel = 1 | 2 | 3 | 4;

export interface AtcClass {
  code: string;
  name: string;
}

export interface AtcAssignment {
  /** Every ATC level-4 class found, most products first. */
  classes: AtcClass[];
  /** Primary class at each level (null when unclassified). */
  primary: Record<AtcLevel, AtcClass | null>;
  source: 'product' | 'ingredient' | 'none';
}

interface AllClassesResponse {
  rxclassMinConceptList?: {
    rxclassMinConcept?: Array<{ classId: string; className: string; classType: string }>;
  };
}

interface ByRxcuiResponse {
  rxclassDrugInfoList?: {
    rxclassDrugInfo?: Array<{
      minConcept: { rxcui: string; name: string; tty: string };
      rxclassMinConceptItem: { classId: string; className: string; classType: string };
      rela?: string;
      relaSource?: string;
    }>;
  };
}

// ---------------------------------------------------------------------------
// ATC hierarchy (one request, ~1,300 classes)
// ---------------------------------------------------------------------------

let hierarchyPromise: Promise<Map<string, string>> | null = null;

export function loadAtcHierarchy(): Promise<Map<string, string>> {
  if (!hierarchyPromise) {
    hierarchyPromise = rxnavGet<AllClassesResponse>('/rxclass/allClasses.json?classTypes=ATC1-4')
      .then((data) => {
        const names = new Map<string, string>();
        for (const c of data.rxclassMinConceptList?.rxclassMinConcept ?? []) {
          names.set(c.classId, c.className);
        }
        return names;
      })
      .catch((error) => {
        hierarchyPromise = null;
        throw error;
      });
  }
  return hierarchyPromise;
}

/** ATC code length by level: C, C09, C09D, C09DA. */
const LEVEL_LENGTH: Record<AtcLevel, number> = { 1: 1, 2: 3, 3: 4, 4: 5 };

export function atcAncestor(code: string, level: AtcLevel): string | null {
  const length = LEVEL_LENGTH[level];
  return code.length >= length ? code.slice(0, length) : null;
}

function titleCase(name: string): string {
  // Level 1-3 names arrive in ALL CAPS; make them readable.
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(And|Of|For|With|In|Or|The|On|To|By)\b/g, (m) => m.toLowerCase())
    .replace(/\b(Ace|Arbs?|Hiv|Hmg|Coa|Ssri|Nsaid|Gnrh|Tnf|Cns|Dpp|Sglt2|Glp)\b/gi, (m) => m.toUpperCase());
}

export function atcName(names: Map<string, string>, code: string): string {
  return titleCase(names.get(code) ?? code);
}

// ---------------------------------------------------------------------------
// Class lookup
// ---------------------------------------------------------------------------

/** Number of active ingredients in an RxNorm clinical/branded drug name. */
function productIngredientCount(name: string): number {
  // RxNorm separates ingredients with " / "; strengths use "MG/ML" without spaces.
  const body = name.replace(/\[[^\]]*\]\s*$/, '');
  return body.split(' / ').length;
}

async function productClasses(rxcui: string, ingredientCount: number): Promise<Map<string, number>> {
  const data = await rxnavGet<ByRxcuiResponse>(`/rxclass/class/byRxcui.json?rxcui=${rxcui}&relaSource=ATCPROD`);
  const products = new Map<string, Set<string>>();
  for (const info of data.rxclassDrugInfoList?.rxclassDrugInfo ?? []) {
    const product = info.minConcept;
    if (productIngredientCount(product.name) !== ingredientCount) continue;
    const code = info.rxclassMinConceptItem.classId;
    if (!products.has(code)) products.set(code, new Set());
    products.get(code)!.add(product.rxcui);
  }
  return new Map([...products].map(([code, set]) => [code, set.size]));
}

/**
 * Classes of products that contain every one of the ingredients. Catches
 * combinations with no RxNorm MIN, such as birth-control packs with iron
 * tablets (G03AA, not B03AA iron) and H. pylori kits (A02BD).
 */
async function sharedProductClasses(ingredients: Ingredient[]): Promise<Map<string, number>> {
  const perIngredient = await Promise.all(
    ingredients.map((i) =>
      rxnavGet<ByRxcuiResponse>(`/rxclass/class/byRxcui.json?rxcui=${i.rxcui}&relaSource=ATCPROD`)
    )
  );
  // product rxcui -> { name, classes }
  const products = perIngredient.map((data) => {
    const map = new Map<string, { name: string; classes: Set<string> }>();
    for (const info of data.rxclassDrugInfoList?.rxclassDrugInfo ?? []) {
      const p = info.minConcept;
      if (!map.has(p.rxcui)) map.set(p.rxcui, { name: p.name, classes: new Set() });
      map.get(p.rxcui)!.classes.add(info.rxclassMinConceptItem.classId);
    }
    return map;
  });
  const [first, ...rest] = products;
  if (!first) return new Map();
  const shared = [...first.entries()].filter(([rxcui]) => rest.every((m) => m.has(rxcui)));
  const exactCount = shared.filter(([, p]) => productIngredientCount(p.name) === ingredients.length);
  const chosen = exactCount.length ? exactCount : shared;
  const counts = new Map<string, number>();
  for (const [, p] of chosen) for (const code of p.classes) counts.set(code, (counts.get(code) ?? 0) + 1);
  return counts;
}

/** WHO's own classification of a multi-ingredient concept (e.g. R03AL for a triple inhaler). */
async function combinationClasses(minRxcui: string): Promise<Map<string, number>> {
  const data = await rxnavGet<ByRxcuiResponse>(`/rxclass/class/byRxcui.json?rxcui=${minRxcui}&relaSource=ATC`);
  const counts = new Map<string, number>();
  for (const info of data.rxclassDrugInfoList?.rxclassDrugInfo ?? []) {
    if (info.minConcept.rxcui !== minRxcui) continue;
    const code = info.rxclassMinConceptItem.classId;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

/**
 * Last resort: each ingredient's own ATC classes. For combinations, prefer the
 * therapeutic group (level 2) that the most ingredients share, so a
 * fluticasone / umeclidinium / vilanterol inhaler lands in R03 (obstructive
 * airway disease) rather than R01 (nasal sprays).
 */
async function ingredientClasses(ingredients: Ingredient[]): Promise<Map<string, number>> {
  const responses = await Promise.all(
    ingredients.map((i) =>
      rxnavGet<ByRxcuiResponse>(`/rxclass/class/byRxcui.json?rxcui=${i.rxcui}&relaSource=ATC`)
    )
  );
  const perIngredient = responses.map((data) => {
    const codes = new Set<string>();
    for (const info of data.rxclassDrugInfoList?.rxclassDrugInfo ?? []) {
      // Skip classes that come from combination products containing this ingredient.
      if (info.minConcept.tty !== 'IN' && info.minConcept.tty !== 'PIN') continue;
      codes.add(info.rxclassMinConceptItem.classId);
    }
    return codes;
  });
  const scores = new Map<string, number>();
  for (const codes of perIngredient) {
    for (const code of codes) {
      if (scores.has(code)) continue;
      const group = code.slice(0, 3);
      const groupSupport = perIngredient.filter((c) => [...c].some((x) => x.startsWith(group))).length;
      const direct = perIngredient.filter((c) => c.has(code)).length;
      scores.set(code, groupSupport * 100 + direct);
    }
  }
  return scores;
}

const assignmentCache = new Map<string, Promise<AtcAssignment>>();

function emptyAssignment(): AtcAssignment {
  return { classes: [], primary: { 1: null, 2: null, 3: null, 4: null }, source: 'none' };
}

function buildAssignment(
  counts: Map<string, number>,
  names: Map<string, string>,
  source: 'product' | 'ingredient'
): AtcAssignment {
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const classes = ranked.map(([code]) => ({ code, name: atcName(names, code) }));
  const top = classes[0]?.code;
  const primary = { 1: null, 2: null, 3: null, 4: null } as Record<AtcLevel, AtcClass | null>;
  if (top) {
    for (const level of [1, 2, 3, 4] as AtcLevel[]) {
      const code = atcAncestor(top, level);
      primary[level] = code ? { code, name: atcName(names, code) } : null;
    }
  }
  return { classes, primary, source };
}

async function computeAssignment(match: DrugMatch): Promise<AtcAssignment> {
  const ingredients = match.ingredients;
  if (ingredients.length === 0) return emptyAssignment();

  const names = await loadAtcHierarchy();

  // Concept to classify at product level: the ingredient itself, or the MIN.
  let classConcept: string | null = null;
  if (ingredients.length === 1) classConcept = ingredients[0].rxcui;
  else if (match.tty === 'MIN' && match.rxcui) classConcept = match.rxcui;
  else classConcept = await findMultiIngredient(ingredients);

  if (classConcept) {
    const fromProducts = await productClasses(classConcept, ingredients.length);
    if (fromProducts.size > 0) return buildAssignment(fromProducts, names, 'product');
    if (ingredients.length > 1) {
      const fromCombination = await combinationClasses(classConcept);
      if (fromCombination.size > 0) return buildAssignment(fromCombination, names, 'ingredient');
    }
  }

  if (ingredients.length > 1) {
    const fromShared = await sharedProductClasses(ingredients);
    if (fromShared.size > 0) return buildAssignment(fromShared, names, 'product');
  }

  const fromIngredients = await ingredientClasses(ingredients);
  if (fromIngredients.size > 0) return buildAssignment(fromIngredients, names, 'ingredient');
  return emptyAssignment();
}

/** ATC classes for a matched drug. Cached by ingredient set. */
export function classifyDrug(match: DrugMatch): Promise<AtcAssignment> {
  const key = match.ingredients.map((i) => i.rxcui).sort().join('+');
  if (!key) return Promise.resolve(emptyAssignment());
  const cached = assignmentCache.get(key);
  if (cached) return cached;
  const pending = computeAssignment(match).catch((error) => {
    assignmentCache.delete(key);
    throw error;
  });
  assignmentCache.set(key, pending);
  return pending;
}

export const ATC_LEVEL_LABELS: Record<AtcLevel, string> = {
  1: 'L1 · Anatomical group',
  2: 'L2 · Therapeutic group',
  3: 'L3 · Pharmacological subgroup',
  4: 'L4 · Drug class',
};
