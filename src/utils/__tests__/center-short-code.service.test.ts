/**
 * center-short-code.service.test.ts
 *
 * Unit tests for generateShortCodeFromName (pure function — no DB required).
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateShortCodeFromName } from '../center-short-code.service';

describe('generateShortCodeFromName', () => {
  // ─── Primary examples from requirements ──────────────────────────────────

  it('3-word name: takes initial of each word — JEEVITHA K.V.P ATHANI → JKA', () => {
    // K.V.P is stripped of dots → KVP → initial K
    assert.equal(generateShortCodeFromName('JEEVITHA K.V.P ATHANI'), 'JKA');
  });

  it('2-word name: word initials + 2nd letter of 2nd word — JEEVITHA PALLIPALAYAM → JPA', () => {
    // J + P (initial of PALLIPALAYAM) + A (2nd letter of PALLIPALAYAM)
    assert.equal(generateShortCodeFromName('JEEVITHA PALLIPALAYAM'), 'JPA');
  });

  it('2-word name: initials + 2nd letter of last word — JOTHILAKSHMI PUTHUKADU → JPU', () => {
    // J + P (initial of PUTHUKADU) + U (2nd letter of PUTHUKADU)
    // The backfill dry-run lets you review and manually set shortCode to JPK if preferred.
    assert.equal(generateShortCodeFromName('JOTHILAKSHMI PUTHUKADU'), 'JPU');
  });

  it('2-word name: initials + 2nd letter of last word — ILAVARASI GANAPATHIPALAYAM → IGA', () => {
    // I + G (initial of GANAPATHIPALAYAM) + A (2nd letter of GANAPATHIPALAYAM)
    assert.equal(generateShortCodeFromName('ILAVARASI GANAPATHIPALAYAM'), 'IGA');
  });

  // ─── Algorithm edge cases ─────────────────────────────────────────────────

  it('3+ word name: takes only first 3 initials', () => {
    assert.equal(generateShortCodeFromName('ALPHA BETA GAMMA DELTA'), 'ABG');
  });

  it('single word: takes first 3 letters', () => {
    assert.equal(generateShortCodeFromName('PUTHUKADU'), 'PUT');
  });

  it('single short word under 3 chars: pads with X', () => {
    assert.equal(generateShortCodeFromName('AB'), 'ABX');
  });

  it('single 1-char word: pads with XX', () => {
    assert.equal(generateShortCodeFromName('A'), 'AXX');
  });

  it('strips dots and punctuation from tokens', () => {
    // "K.V.P" → "KVP" → initial K
    assert.equal(generateShortCodeFromName('A K.V.P B'), 'AKB');
  });

  it('is case-insensitive (lowercased input) — produces same code as uppercase', () => {
    // jeevitha pallipalayam → same result as JEEVITHA PALLIPALAYAM
    assert.equal(generateShortCodeFromName('jeevitha pallipalayam'), 'JPA');
  });

  it('handles extra whitespace between words', () => {
    assert.equal(generateShortCodeFromName('  JEEVITHA  PALLIPALAYAM  '), 'JPA');
  });

  it('numbers in name are stripped from each token', () => {
    // "CENTER1 ABC" → tokens "CENTER" + "ABC" → initials C, A → +B (2nd char of last token ABC)
    assert.equal(generateShortCodeFromName('CENTER1 ABC'), 'CAB');
  });

  it('3-letter result is always exactly 3 characters long', () => {
    const inputs = [
      'A',
      'AB',
      'ABC',
      'ABCD',
      'ALPHA BETA',
      'ALPHA BETA GAMMA',
      'JEEVITHA K.V.P ATHANI',
    ];
    for (const input of inputs) {
      const result = generateShortCodeFromName(input);
      assert.equal(result.length, 3, `Expected 3 chars for "${input}", got "${result}" (length ${result.length})`);
    }
  });

  it('result is always uppercase regardless of input case', () => {
    assert.equal(generateShortCodeFromName('alpha beta gamma'), 'ABG');
    assert.equal(generateShortCodeFromName('jeevitha pallipalayam'), 'JPA');
  });

  it('empty string falls back to CTR', () => {
    assert.equal(generateShortCodeFromName(''), 'CTR');
  });

  it('only punctuation / spaces falls back to CTR', () => {
    assert.equal(generateShortCodeFromName('... --- ...'), 'CTR');
  });
});
