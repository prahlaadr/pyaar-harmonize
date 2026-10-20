/**
 * Drug-name matcher: name -> RxNorm concept -> ingredients.
 *
 * Exact first, fuzzy last. Claims data (CMS Part D, pharmacy feeds) carries
 * drug names from a commercial compendium, so most names resolve with an exact
 * or normalized RxNorm lookup. Fuzzy matching is a last resort, and every fuzzy
 * hit is labeled so an analyst can review it.
 *
 * Order of attempts for one name (plus an optional backup name, e.g. the brand):
 *   1. supply     : needles, syringes, pump cartridges, pads. Not drugs, so
 *                   never sent to the fuzzy matcher (it would invent a drug).
 *   2. exact      : RxNorm exact / normalized string match.
 *   3. combination: split "a/b/c" and match every part exactly.
 *   4. brand      : exact match on the backup name, then on shorter prefixes
 *                   of it ("Trelegy Ellipta" -> "Trelegy").
 *   5. cleaned    : exact match after expanding compendium abbreviations
 *                   ("Potassium Clav" -> "potassium clavulanate"), dropping
 *                   text after a comma, and stripping "/Pf".
 *   6. approximate: RxNorm approximateTerm, accepted only when the candidate
 *                   shares a word stem with the input. Flag these for review.
 */

import { rxnavGet, q } from './rxnav';

export type MatchType =
  | 'exact'
  | 'combination'
  | 'brand'
  | 'cleaned'
  | 'approximate'
  | 'supply'
  | 'not_found'
  | 'error';

export interface Ingredient {
  rxcui: string;
  name: string;
}

export interface DrugMatch {
  input: string;
  backup: string | null;
  matchType: MatchType;
  /** The exact string that produced the match. */
  matchedOn: string | null;
  /** RxNorm concept the name resolved to (MIN for multi-ingredient drugs when one exists). */
  rxcui: string | null;
  conceptName: string | null;
  tty: string | null;
  /** Active ingredients (RxNorm IN), sorted by name. */
  ingredients: Ingredient[];
  /** approximateTerm score, only for approximate matches. */
  score: number | null;
  note: string | null;
}

// ---------------------------------------------------------------------------
// RxNav response shapes (only the fields used here)
// ---------------------------------------------------------------------------

interface IdGroupResponse {
  idGroup?: { rxnormId?: string[] };
}

interface PropertiesResponse {
  properties?: { rxcui: string; name: string; tty: string } | null;
}

interface RelatedResponse {
  relatedGroup?: {
    conceptGroup?: Array<{
      tty: string;
      conceptProperties?: Array<{ rxcui: string; name: string; tty: string }>;
    }>;
  };
}

interface ApproximateResponse {
  approximateGroup?: {
    candidate?: Array<{ rxcui?: string; score?: string; rank?: string; name?: string; source?: string }>;
  };
}

// ---------------------------------------------------------------------------
// Name helpers
// ---------------------------------------------------------------------------

const INSULIN_TYPES = /\b(aspart|lispro|glargine|detemir|degludec|glulisine|regular|nph|isophane)\b/i;

const SUPPLY_PATTERN = new RegExp(
  [
    'pen needle',
    'syring\\w*',
    'syrge',
    'needles?',
    'ndl',
    'syr',
    'lancets?',
    'insulin pu?mp',
    'pu?mp cart',
    'bolus insulin pump',
    'insulin device',
    'insulin admin',
    'antiseptic pads?',
    'alcohol (?:prep|pads?|swabs?)',
    'gauze',
    'bandage',
    'diabetic supplies',
    'blood-glucose',
    'glucose (?:meter|monitor|sensor|test)',
    'test strips?',
  ]
    .map((p) => `\\b${p}\\b`)
    .join('|'),
  'i'
);

/** Devices even when an insulin is named ("Insulin Pen,reusable,bt,aspart" is InPen). */
const DEVICE_PATTERN = /\b(reusable|sharps|container,\s*empty)\b/i;

/** Drug products packaged in a syringe or pen: "Enoxaparin 150 MG/ML Prefilled Syringe". */
const PACKAGED_DRUG_PATTERN = /\b(prefilled|pre-filled|auto-?injector)\b|\/\s*ml\b/i;

/** True for diabetic and administration supplies that have no RxNorm drug. */
export function isSupply(name: string): boolean {
  if (DEVICE_PATTERN.test(name)) return true;
  if (!SUPPLY_PATTERN.test(name) || PACKAGED_DRUG_PATTERN.test(name)) return false;
  // "Insulin Aspart/B3/Pump Cart" is insulin in a pump cartridge, a real drug.
  return !INSULIN_TYPES.test(name);
}

/** Compendium abbreviations seen in CMS Part D generic names. */
const WORD_ABBREVIATIONS: Record<string, string> = {
  hcl: 'hydrochloride',
  hbr: 'hydrobromide',
  sod: 'sodium',
  na: 'sodium',
  pot: 'potassium',
  potass: 'potassium',
  mag: 'magnesium',
  calc: 'calcium',
  hum: 'human',
  clav: 'clavulanate',
  monohyd: 'monohydrate',
  propion: 'propionate',
  dipropion: 'dipropionate',
  dip: 'dipropionate',
  brm: 'bromide',
  acet: 'acetate',
  phos: 'phosphate',
  sulf: 'sulfate',
  bicarb: 'bicarbonate',
  maleat: 'maleate',
  mesylat: 'mesylate',
  succ: 'succinate',
  tart: 'tartrate',
  fum: 'fumarate',
  besyl: 'besylate',
  chlr: 'chloride',
  cl: 'chloride',
  vacc: 'vaccine',
  vac: 'vaccine',
  ac: 'acetate',
  con: 'conjugated',
  eth: 'ethinyl',
  hydrocort: 'hydrocortisone',
  hc: 'hydrocortisone',
  desog: 'desogestrel',
  metronid: 'metronidazole',
  amoxiciln: 'amoxicillin',
  clarith: 'clarithromycin',
  emtricit: 'emtricitabine',
  tenofov: 'tenofovir',
  polymyxn: 'polymyxin',
  bacit: 'bacitracin',
  dapaglifloz: 'dapagliflozin',
  propaned: 'propanediol',
  prot: 'protamine',
  protamin: 'protamine',
  insuln: 'insulin',
  asp: 'aspart',
};

/** Phrase-level abbreviations, applied before word-level ones. */
const PHRASE_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\be\.\s*estradiol\b/gi, 'ethinyl estradiol'],
  [/\beth\.?\s+estrad\w*/gi, 'ethinyl estradiol'],
  [/\bl-norgest\w*/gi, 'levonorgestrel'],
  [/\bmedroxyprogest\w*|\bm-progest\w*/gi, 'medroxyprogesterone'],
  [/\bestrogens?,\s*con\w*/gi, 'estrogens, conjugated'],
];

/** Whole-part abbreviations (one slash-separated part). */
const PART_ABBREVIATIONS: Record<string, string> = {
  kcl: 'potassium chloride',
  nacl: 'sodium chloride',
  nahco3: 'sodium bicarbonate',
  apap: 'acetaminophen',
  hctz: 'hydrochlorothiazide',
  peg3350: 'polyethylene glycol 3350',
  'peg 3350': 'polyethylene glycol 3350',
  d5w: 'glucose',
  igg: 'immunoglobulin G',
};

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function expandAbbreviations(value: string): string {
  const whole = PART_ABBREVIATIONS[value.toLowerCase().trim()];
  if (whole) return whole;
  let phrased = value;
  for (const [pattern, replacement] of PHRASE_ABBREVIATIONS) phrased = phrased.replace(pattern, replacement);
  return collapse(
    phrased
      .split(/(\s+|-)/)
      .map((token) => WORD_ABBREVIATIONS[token.toLowerCase().replace(/\.$/, '')] ?? token)
      .join('')
  );
}

/** Strip a trailing preservative-free marker ("/Pf", " Pf"). */
function stripPf(value: string): string {
  return collapse(value.replace(/\s*\/\s*pf\s*$/i, '').replace(/\s+pf\s*$/i, ''));
}

/**
 * Variants worth an exact lookup after the raw string fails. Dropping the text
 * after a comma is skipped for combinations, where it would drop ingredients.
 */
export function cleanupVariants(name: string): string[] {
  const base = stripPf(name);
  const beforeComma = collapse(base.split(',')[0]);
  const isCombination = base.includes('/');
  const candidates = [
    base,
    expandAbbreviations(base),
    ...(isCombination ? [] : [beforeComma, expandAbbreviations(beforeComma)]),
    collapse(base.replace(/,/g, ' ')),
    expandAbbreviations(collapse(base.replace(/,/g, ' '))),
  ];
  const seen = new Set<string>([name.toLowerCase()]);
  const out: string[] = [];
  for (const c of candidates) {
    const key = c.toLowerCase();
    if (c.length >= 3 && !seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

/** Split a combination name into parts, ignoring a trailing "Pf" part. */
export function splitCombination(name: string): string[] {
  if (!name.includes('/')) return [];
  const parts = stripPf(name)
    .split('/')
    .map((p) => collapse(p))
    .filter((p) => p.length > 0);
  return parts.length >= 2 ? parts : [];
}

/** True when a cleanup variant kept only the text before the first comma. */
function droppedAfterComma(original: string, variant: string): boolean {
  if (!original.includes(',')) return false;
  const before = collapse(stripPf(original).split(',')[0]);
  const v = variant.toLowerCase();
  return v === before.toLowerCase() || v === expandAbbreviations(before).toLowerCase();
}

function stems(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4)
      .map((t) => t.slice(0, 4))
  );
}

function sharesStem(a: string, b: string): boolean {
  const sa = stems(a);
  for (const s of stems(b)) if (sa.has(s)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// RxNorm lookups
// ---------------------------------------------------------------------------

/** Exact or normalized RxNorm match (findRxcuiByString, search=2). */
export async function findExact(name: string): Promise<string | null> {
  const trimmed = collapse(name);
  if (!trimmed) return null;
  const data = await rxnavGet<IdGroupResponse>(`/rxcui.json?name=${q(trimmed)}&search=2`);
  return data.idGroup?.rxnormId?.[0] ?? null;
}

interface ResolvedConcept {
  rxcui: string;
  name: string;
  tty: string;
  ingredients: Ingredient[];
}

/** Concept properties plus its active ingredients (tty=IN). */
export async function resolveConcept(rxcui: string): Promise<ResolvedConcept | null> {
  const [props, related] = await Promise.all([
    rxnavGet<PropertiesResponse>(`/rxcui/${rxcui}/properties.json`),
    rxnavGet<RelatedResponse>(`/rxcui/${rxcui}/related.json?tty=IN`),
  ]);
  const p = props.properties;
  if (!p) return null;
  const ingredients = new Map<string, Ingredient>();
  for (const group of related.relatedGroup?.conceptGroup ?? []) {
    for (const c of group.conceptProperties ?? []) {
      // Packs list placebo tablets as an ingredient; it is not one.
      if (/^inert ingredients?$/i.test(c.name)) continue;
      ingredients.set(c.rxcui, { rxcui: c.rxcui, name: c.name });
    }
  }
  if (ingredients.size === 0) return null;
  return {
    rxcui: p.rxcui,
    name: p.name,
    tty: p.tty,
    ingredients: sortIngredients([...ingredients.values()]),
  };
}

function sortIngredients(list: Ingredient[]): Ingredient[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

/** RxNorm multiple-ingredient (MIN) concept for a set of ingredients, if one exists. */
export async function findMultiIngredient(ingredients: Ingredient[]): Promise<string | null> {
  if (ingredients.length < 2) return null;
  const name = sortIngredients(ingredients)
    .map((i) => i.name)
    .join(' / ');
  return findExact(name);
}

async function exactConcept(name: string): Promise<ResolvedConcept | null> {
  const rxcui = await findExact(name);
  return rxcui ? resolveConcept(rxcui) : null;
}

/**
 * approximateTerm, keeping the first candidate whose concept or ingredients
 * share a word stem with the query. Unrelated top hits are rejected.
 */
export async function findApproximate(
  name: string,
  accept: (concept: ResolvedConcept) => boolean = () => true
): Promise<{ concept: ResolvedConcept; score: number } | null> {
  const trimmed = collapse(name);
  if (trimmed.length < 3) return null;
  const data = await rxnavGet<ApproximateResponse>(
    `/approximateTerm.json?term=${q(trimmed)}&maxEntries=8`
  );
  const tried = new Set<string>();
  for (const candidate of data.approximateGroup?.candidate ?? []) {
    const rxcui = candidate.rxcui;
    if (!rxcui || tried.has(rxcui)) continue;
    tried.add(rxcui);
    if (tried.size > 4) break;
    const concept = await resolveConcept(rxcui);
    if (!concept) continue;
    const comparable = [concept.name, candidate.name ?? '', ...concept.ingredients.map((i) => i.name)].join(' ');
    if (sharesStem(trimmed, comparable) && accept(concept)) {
      return { concept, score: Number(candidate.score ?? 0) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Matching pipeline
// ---------------------------------------------------------------------------

function result(
  input: string,
  backup: string | null,
  matchType: MatchType,
  fields: Partial<DrugMatch> = {}
): DrugMatch {
  return {
    input,
    backup,
    matchType,
    matchedOn: null,
    rxcui: null,
    conceptName: null,
    tty: null,
    ingredients: [],
    score: null,
    note: null,
    ...fields,
  };
}

function fromConcept(
  input: string,
  backup: string | null,
  matchType: MatchType,
  matchedOn: string,
  concept: ResolvedConcept,
  extra: Partial<DrugMatch> = {}
): DrugMatch {
  return result(input, backup, matchType, {
    matchedOn,
    rxcui: concept.rxcui,
    conceptName: concept.name,
    tty: concept.tty,
    ingredients: concept.ingredients,
    ...extra,
  });
}

interface PartMatch {
  part: string;
  concept: ResolvedConcept;
  approximate: boolean;
  score: number | null;
  droppedText: boolean;
}

async function matchPart(part: string, allowApproximate: boolean): Promise<PartMatch | null> {
  const exact = await exactConcept(part);
  if (exact) return { part, concept: exact, approximate: false, score: null, droppedText: false };
  for (const variant of cleanupVariants(part)) {
    const cleaned = await exactConcept(variant);
    if (cleaned) {
      return { part, concept: cleaned, approximate: false, score: null, droppedText: droppedAfterComma(part, variant) };
    }
  }
  if (!allowApproximate) return null;
  const query = expandAbbreviations(stripPf(part));
  // The first word names the drug ("Dapaglifloz Propaned" is dapagliflozin,
  // not propanediol), so a candidate must contain an ingredient that matches it.
  const lead = query.split(' ')[0];
  const approx = await findApproximate(query, (c) => c.ingredients.some((i) => sharesStem(lead, i.name)));
  if (!approx) return null;
  // A fuzzy hit on one part can be a multi-ingredient product; keep only the
  // ingredients this part actually names.
  const named = approx.concept.ingredients.filter((i) => sharesStem(query, i.name));
  if (named.length === 0) return null;
  return {
    part,
    concept: { ...approx.concept, ingredients: named },
    approximate: true,
    score: approx.score,
    droppedText: false,
  };
}

async function matchCombination(
  input: string,
  backup: string | null,
  allowApproximate: boolean
): Promise<DrugMatch | null> {
  const parts = splitCombination(input);
  if (parts.length === 0) return null;

  const matches: PartMatch[] = [];
  for (const part of parts) {
    const m = await matchPart(part, allowApproximate);
    if (!m) return null;
    matches.push(m);
  }

  const ingredients = new Map<string, Ingredient>();
  for (const m of matches) for (const i of m.concept.ingredients) ingredients.set(i.rxcui, i);
  const list = sortIngredients([...ingredients.values()]);

  let concept: ResolvedConcept | null = null;
  const min = await findMultiIngredient(list);
  if (min) concept = await resolveConcept(min);

  const anyApproximate = matches.some((m) => m.approximate);
  const scores = matches.filter((m) => m.score !== null).map((m) => m.score as number);

  return result(input, backup, anyApproximate ? 'approximate' : 'combination', {
    matchedOn: matches.map((m) => m.part).join(' / '),
    rxcui: concept?.rxcui ?? null,
    conceptName: concept?.name ?? list.map((i) => i.name).join(' / '),
    tty: concept?.tty ?? null,
    ingredients: list,
    score: scores.length ? Math.min(...scores) : null,
    note:
      [
        anyApproximate ? `Fuzzy match on: ${matches.filter((m) => m.approximate).map((m) => m.part).join(', ')}` : '',
        matches.some((m) => m.droppedText)
          ? `Ignored text after a comma in: ${matches.filter((m) => m.droppedText).map((m) => m.part).join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('. ') || null,
  });
}

/** Brand names often carry device words: "Trelegy Ellipta", "Lantus Solostar". */
function brandPrefixes(name: string, splitHyphens = false): string[] {
  const tokens = collapse(splitHyphens ? name.replace(/-/g, ' ') : name).split(' ');
  const out: string[] = [];
  for (let k = tokens.length - 1; k >= 1; k--) {
    const prefix = tokens.slice(0, k).join(' ');
    if (prefix.replace(/[^a-z]/gi, '').length >= 4) out.push(prefix);
  }
  return out;
}

function sameName(a: string | null, b: string | null): boolean {
  return !!a && !!b && collapse(a).toLowerCase() === collapse(b).toLowerCase();
}

/**
 * Match one drug name to RxNorm.
 *
 * @param name   Primary name (for CMS Part D, Gnrc_Name).
 * @param backup Optional second name tried when the primary fails (Brnd_Name).
 */
export async function matchDrug(name: string, backup: string | null = null): Promise<DrugMatch> {
  const input = collapse(name ?? '');
  const alt = backup && collapse(backup) && !sameName(backup, input) ? collapse(backup) : null;

  if (!input && !alt) return result(input, alt, 'not_found', { note: 'Empty name' });

  try {
    if (isSupply(input) || (!input && alt && isSupply(alt))) {
      return result(input, alt, 'supply', { note: 'Medical supply, not a drug. No RxNorm ingredient.' });
    }

    if (input) {
      const exact = await exactConcept(input);
      if (exact) return fromConcept(input, alt, 'exact', input, exact);

      const combo = await matchCombination(input, alt, false);
      if (combo) return combo;
    }

    if (alt) {
      const brand = await exactConcept(alt);
      if (brand) return fromConcept(input, alt, 'brand', alt, brand);
      // Shorter prefixes only count when they are themselves a brand (BN):
      // "Trelegy Ellipta" -> "Trelegy" yes, "Potassium Chloride-0.9% Nacl" -> "Potassium" no.
      for (const prefix of brandPrefixes(alt)) {
        const fromPrefix = await exactConcept(prefix);
        if (fromPrefix && fromPrefix.tty === 'BN') return fromConcept(input, alt, 'brand', prefix, fromPrefix);
      }
    }

    if (input) {
      for (const variant of cleanupVariants(input)) {
        const cleaned = await exactConcept(variant);
        if (cleaned) {
          return fromConcept(input, alt, 'cleaned', variant, cleaned, {
            note: droppedAfterComma(input, variant) ? 'Matched on the text before the comma.' : null,
          });
        }
      }

      // Trailing formulation words: "Phenytoin Sodium Extended", "Griseofulvin Ultramicrosize".
      // Skipped for combinations written with "/", "-" between words, or "with",
      // where a shorter name would drop an ingredient.
      const looksCombined = /\/|[a-z]-[a-z]|\b(with|and)\b/i.test(input);
      if (!looksCombined) {
        for (const prefix of brandPrefixes(input.replace(/,/g, ' '), true)) {
          const shorter = await exactConcept(prefix);
          if (shorter) {
            return fromConcept(input, alt, 'cleaned', prefix, shorter, {
              note: 'Matched on a shorter form of the name.',
            });
          }
        }
      }

      const fuzzyCombo = await matchCombination(input, alt, true);
      if (fuzzyCombo) return fuzzyCombo;

      const approx = await findApproximate(expandAbbreviations(stripPf(input)));
      // A fuzzy hit for a combination must cover (nearly) every part.
      const parts = splitCombination(input).length;
      if (approx && (parts < 2 || approx.concept.ingredients.length >= parts - 1)) {
        return fromConcept(input, alt, 'approximate', input, approx.concept, {
          score: approx.score,
          note: 'Fuzzy match. Review before relying on it.',
        });
      }
    }

    if (alt) {
      const approx = await findApproximate(alt);
      if (approx) {
        return fromConcept(input, alt, 'approximate', alt, approx.concept, {
          score: approx.score,
          note: 'Fuzzy match on the backup name. Review before relying on it.',
        });
      }
    }

    return result(input, alt, 'not_found', { note: 'No RxNorm match' });
  } catch (error) {
    return result(input, alt, 'error', {
      note: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Single-name convenience used by the Drug Names tool. */
export function ingredientLabel(match: DrugMatch): string {
  return match.ingredients.map((i) => i.name).join(' / ');
}

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  exact: 'Exact',
  combination: 'Combination',
  brand: 'Brand name',
  cleaned: 'Cleaned',
  approximate: 'Fuzzy (review)',
  supply: 'Supply',
  not_found: 'Not found',
  error: 'Error',
};

/** Match types an analyst should eyeball before trusting. */
export function needsReview(type: MatchType): boolean {
  return type === 'approximate' || type === 'not_found' || type === 'error';
}

/** Match many names, a few at a time. The RxNav client enforces the rate limit. */
export async function matchDrugs(
  names: string[],
  onProgress?: (done: number, total: number, current: string) => void,
  concurrency = 6
): Promise<DrugMatch[]> {
  const results: DrugMatch[] = new Array(names.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < names.length) {
      const index = next++;
      results[index] = await matchDrug(names[index]);
      done++;
      onProgress?.(done, names.length, names[index]);
    }
  }
  onProgress?.(0, names.length, '');
  await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, worker));
  return results;
}
