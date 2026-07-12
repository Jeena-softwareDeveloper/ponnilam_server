/**
 * center-short-code.service.ts
 *
 * Generates and allocates unique 3-character Center Short Codes that are used
 * as the prefix for customer numbers (e.g. JKA → JKA001, JKA002 …).
 *
 * Algorithm (generateShortCodeFromName):
 *   1. Split center name on whitespace.
 *   2. Strip all non-alpha characters from each token (so "K.V.P" → "KVP").
 *   3. Collect the first letter of every non-empty token → "initials" array.
 *   4. If ≥ 3 initials are available, take the first three.
 *   5. If fewer than 3 initials, extend with additional alpha chars from the
 *      tokens (in order, skipping chars already taken), until 3 chars are
 *      collected.
 *   6. Pad with "X" if still < 3 (extreme edge case: very short single-word name).
 *   7. Return the 3-char uppercase code.
 *
 * Examples:
 *   "JEEVITHA K.V.P ATHANI"     → tokens J, K, A      → JKA
 *   "JEEVITHA PALLIPALAYAM"     → initials J, P (+A)  → JPA
 *   "JOTHILAKSHMI PUTHUKADU"    → initials J, P (+U)  → JPU  *
 *   "ILAVARASI GANAPATHIPALAYAM"→ initials I, G (+A)  → IGA  *
 *
 * (*) Two-word place names where the user's preferred code differs from the
 * purely automatic result can be set during the backfill dry-run and edited
 * before committing, because shortCode is editable before any customers exist.
 *
 * Collision disambiguation (allocateCenterShortCode):
 *   If a generated candidate is already taken by another center, the allocator
 *   tries the candidate with a numeric suffix (e.g. JPA → JPA2 → JPA3 …) up
 *   to MAX_SUFFIX attempts, then raises an error.
 */

import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

const MAX_SUFFIX_ATTEMPTS = 99;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Strip all non-alpha characters from a single word token.
 * "K.V.P" → "KVP",  "PUTHUKADU" → "PUTHUKADU"
 */
function cleanWord(word: string): string {
  return word.replace(/[^a-zA-Z]/g, '').toUpperCase();
}

/**
 * Generate a 3-character short code from a center name.
 *
 * The result is always exactly 3 uppercase ASCII letters (A-Z).
 * The function is pure and deterministic — the same name always produces the
 * same candidate code (collision resolution is handled separately).
 *
 * Pass 2 strategy: when fewer than 3 initials are available, fill remaining
 * positions from the LAST token first (the place name — most distinctive),
 * then from earlier tokens. This ensures:
 *   "JEEVITHA PALLIPALAYAM"      → J + P + A (from PALLIPALAYAM[1]) = JPA
 *   "ILAVARASI GANAPATHIPALAYAM" → I + G + A (from GANAPATHIPALAYAM[1]) = IGA
 */
export function generateShortCodeFromName(name: string): string {
  const tokens = name
    .trim()
    .split(/\s+/)
    .map(cleanWord)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return 'CTR'; // absolute fallback

  const chars: string[] = [];

  // Pass 1 — take the initial (first char) of every token, up to 3
  const initialsUsedIdx = new Set<number>();
  for (let i = 0; i < tokens.length && chars.length < 3; i++) {
    chars.push(tokens[i][0]);
    initialsUsedIdx.add(i);
  }

  // Pass 2 — if still < 3, fill from remaining chars of the LAST token first,
  // then work backwards through tokens (so the place name is most influential).
  if (chars.length < 3) {
    // Build iteration order: last token → second-last → ... → first
    const iterOrder = Array.from({ length: tokens.length }, (_, i) => tokens.length - 1 - i);
    for (const i of iterOrder) {
      const word = tokens[i];
      const startIdx = initialsUsedIdx.has(i) ? 1 : 0; // skip initial already used
      for (let j = startIdx; j < word.length && chars.length < 3; j++) {
        chars.push(word[j]);
      }
      if (chars.length >= 3) break;
    }
  }

  // Pad with 'X' in the extreme edge case of a very short name
  while (chars.length < 3) chars.push('X');

  return chars.slice(0, 3).join('').toUpperCase();
}

// ---------------------------------------------------------------------------
// Collision-safe transactional allocator
// ---------------------------------------------------------------------------

/**
 * Allocate a unique shortCode for a center inside a Prisma transaction.
 *
 * @param tx         - Active Prisma transaction client.
 * @param excludeId  - The center's own ID (pass null for new centers). Used to
 *                     exclude the center being created/updated from clash checks.
 * @param centerName - Human-readable center name used to derive the candidate.
 * @returns A 3–5 char uppercase string guaranteed to be unique across all centers.
 */
export async function allocateCenterShortCode(
  tx: Tx,
  excludeId: string | null,
  centerName: string,
): Promise<string> {
  const base = generateShortCodeFromName(centerName);

  // Attempt the base code first, then base+2, base+3, … up to MAX_SUFFIX_ATTEMPTS
  const candidates = [base, ...Array.from({ length: MAX_SUFFIX_ATTEMPTS }, (_, i) => `${base}${i + 2}`)];

  for (const candidate of candidates) {
    const clash = await tx.center.findFirst({
      where: {
        shortCode: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!clash) return candidate;
  }

  throw new Error(
    `Unable to allocate a unique short code for center "${centerName}" (base: ${base}). ` +
      `Tried ${MAX_SUFFIX_ATTEMPTS + 1} candidates.`,
  );
}

// ---------------------------------------------------------------------------
// Sequence key helper — consumed by sequence.utils.ts
// ---------------------------------------------------------------------------

/**
 * Returns the Sequence table key for a given center short code.
 * Example: "JKA" → "CUS:JKA"
 */
export function customerSequenceKey(shortCode: string): string {
  return `CUS:${shortCode}`;
}
