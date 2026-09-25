// Pure name matching used by `status` now and `migrate match-projects` later.

export interface Named {
  id: string;
  name: string;
  ofId?: string | null;
}

export interface Match<A, B> {
  of: A;
  notion: B;
  method: "ofId" | "override" | "exact" | "fuzzy";
  score: number;
}

export interface MatchResult<A, B> {
  pairs: Match<A, B>[];
  ofOnly: A[];
  notionOnly: B[];
}

export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(name: string): Set<string> {
  return new Set(normalizeName(name).split(" ").filter(Boolean));
}

/** Jaccard similarity of word tokens, 0..1. */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/**
 * One-to-one matching: existing OF ID links first, then hand-confirmed overrides,
 * then exact normalized names, then the best remaining fuzzy pairs at or above `threshold`.
 */
export function matchByName<A extends Named, B extends Named>(
  ofItems: A[],
  notionItems: B[],
  overrides: { omnifocus: string; notion: string }[] = [],
  threshold = 0.5,
): MatchResult<A, B> {
  const pairs: Match<A, B>[] = [];
  const ofLeft = new Set(ofItems);
  const notionLeft = new Set(notionItems);
  const take = (a: A, b: B, method: Match<A, B>["method"], score: number) => {
    pairs.push({ of: a, notion: b, method, score });
    ofLeft.delete(a);
    notionLeft.delete(b);
  };

  const byId = new Map(ofItems.map((a) => [a.id, a]));
  for (const b of notionItems) {
    const a = b.ofId ? byId.get(b.ofId) : undefined;
    if (a && ofLeft.has(a)) take(a, b, "ofId", 1);
  }

  for (const o of overrides) {
    const a = [...ofLeft].find((a) => normalizeName(a.name) === normalizeName(o.omnifocus));
    const b = [...notionLeft].find((b) => normalizeName(b.name) === normalizeName(o.notion));
    if (a && b) take(a, b, "override", 1);
  }

  for (const a of [...ofLeft]) {
    const b = [...notionLeft].find((b) => normalizeName(b.name) === normalizeName(a.name));
    if (b) take(a, b, "exact", 1);
  }

  const candidates: { a: A; b: B; score: number }[] = [];
  for (const a of ofLeft) {
    for (const b of notionLeft) {
      const score = similarity(a.name, b.name);
      if (score >= threshold) candidates.push({ a, b, score });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  for (const { a, b, score } of candidates) {
    if (ofLeft.has(a) && notionLeft.has(b)) take(a, b, "fuzzy", score);
  }

  return { pairs, ofOnly: [...ofLeft], notionOnly: [...notionLeft] };
}
