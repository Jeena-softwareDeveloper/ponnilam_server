import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

const SHORT_CODE_LENGTH = 3;
const FALLBACK_CODE = 'CTR';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Derive a human-friendly base short code (3 uppercase letters) from a center name.
 *
 * Rules:
 *  - Dots and other separators inside a token are stripped so acronyms stay whole
 *    (e.g. "K.V.P" is treated as the single word "KVP").
 *  - 3+ words  -> first letter of the first three words   ("JEEVITHA K.V.P ATHANI" -> "JKA")
 *  - 2 words   -> first letters of both words + 2nd letter of the last word
 *                                                          ("JEEVITHA PALLIPALAYAM" -> "JPA")
 *  - 1 word    -> first three letters                     ("NAGAMMAL" -> "NAG")
 *  - empty     -> "CTR"
 *
 * This is only the *base*; global uniqueness is enforced by
 * {@link generateUniqueCenterShortCode}, which resolves clashes deterministically.
 */
export function deriveShortCodeBase(name: string): string {
  const cleaned = (name || '').toUpperCase().replace(/[^A-Z\s]/g, '');
  const words = cleaned.split(/\s+/).filter(Boolean);

  let code: string;
  if (words.length >= 3) {
    code = words[0][0] + words[1][0] + words[2][0];
  } else if (words.length === 2) {
    code = words[0][0] + words[1][0] + (words[1][1] || words[0][1] || 'X');
  } else if (words.length === 1) {
    code = (words[0] + 'XX').slice(0, SHORT_CODE_LENGTH);
  } else {
    code = FALLBACK_CODE;
  }

  return code.slice(0, SHORT_CODE_LENGTH).toUpperCase();
}

/**
 * Deterministic, exhaustive stream of candidate short codes derived from a name.
 * Order of preference:
 *  1. the base code
 *  2. keep first two chars, vary the 3rd using the name's own remaining letters
 *  3. keep first two chars, vary the 3rd through A-Z
 *  4. keep the 1st char, brute-force the 2nd and 3rd through A-Z (guarantees a free slot)
 */
export function* shortCodeCandidates(name: string): Generator<string> {
  const base = deriveShortCodeBase(name);
  const seen = new Set<string>();
  const emit = function* (code: string) {
    const c = code.slice(0, SHORT_CODE_LENGTH).toUpperCase();
    if (c.length === SHORT_CODE_LENGTH && !seen.has(c)) {
      seen.add(c);
      yield c;
    }
  };

  yield* emit(base);

  const letters = (name || '').toUpperCase().replace(/[^A-Z]/g, '');
  const prefix2 = base.slice(0, 2);
  for (const ch of letters) yield* emit(prefix2 + ch);
  for (let i = 0; i < 26; i++) yield* emit(prefix2 + String.fromCharCode(65 + i));

  const prefix1 = base.slice(0, 1);
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      yield* emit(prefix1 + String.fromCharCode(65 + i) + String.fromCharCode(65 + j));
    }
  }
}

/**
 * Allocate a globally unique center short code for the given name (race-safe within a tx).
 * If `excludeCenterId` is supplied, a code already owned by that center is treated as free
 * (so re-running for the same center is idempotent).
 */
export async function generateUniqueCenterShortCode(
  tx: Tx,
  name: string,
  excludeCenterId?: string
): Promise<string> {
  for (const candidate of shortCodeCandidates(name)) {
    const clash = await tx.center.findFirst({
      where: {
        shortCode: candidate,
        ...(excludeCenterId ? { id: { not: excludeCenterId } } : {}),
      },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new Error(`Unable to generate a unique center short code for "${name}"`);
}

/**
 * Return the center's stored short code, generating and persisting one on first use.
 * This makes the feature self-healing for centers created before short codes existed.
 */
export async function ensureCenterShortCode(tx: Tx, centerId: string): Promise<string> {
  const center = await tx.center.findUnique({
    where: { id: centerId },
    select: { shortCode: true, name: true },
  });
  if (!center) throw new Error('Center not found');
  if (center.shortCode) return center.shortCode;

  const code = await generateUniqueCenterShortCode(tx, center.name, centerId);
  await tx.center.update({ where: { id: centerId }, data: { shortCode: code } });
  return code;
}

export { escapeRegExp };
