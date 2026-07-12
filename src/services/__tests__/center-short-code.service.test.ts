import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveShortCodeBase, shortCodeCandidates } from '../center-short-code.service';

describe('deriveShortCodeBase', () => {
  it('uses initials of the first three words', () => {
    assert.equal(deriveShortCodeBase('JEEVITHA K.V.P ATHANI'), 'JKA');
    assert.equal(deriveShortCodeBase('NAGAMMAL SAMATHUVAPURAM COLONY'), 'NSC');
  });

  it('keeps acronyms with dots as a single word', () => {
    // "K.V.P" must not split into K / V / P words.
    assert.equal(deriveShortCodeBase('JEEVITHA K.V.P ATHANI'), 'JKA');
  });

  it('handles two-word names (initials + 2nd letter of last word)', () => {
    assert.equal(deriveShortCodeBase('JEEVITHA PALLIPALAYAM'), 'JPA');
    assert.equal(deriveShortCodeBase('JOTHILAKSHMI PUTHUKADU'), 'JPU');
    assert.equal(deriveShortCodeBase('ILAVARASI GANAPATHIPALAYAM'), 'IGA');
  });

  it('handles single-word names', () => {
    assert.equal(deriveShortCodeBase('NAGAMMAL'), 'NAG');
    assert.equal(deriveShortCodeBase('AB'), 'ABX');
  });

  it('falls back to CTR for empty / non-letter names', () => {
    assert.equal(deriveShortCodeBase(''), 'CTR');
    assert.equal(deriveShortCodeBase('123 .. ---'), 'CTR');
  });

  it('always returns exactly 3 uppercase letters', () => {
    for (const name of ['a', 'jeevitha pallipalayam', 'x y z w', '']) {
      const code = deriveShortCodeBase(name);
      assert.equal(code.length, 3);
      assert.match(code, /^[A-Z]{3}$/);
    }
  });
});

describe('shortCodeCandidates', () => {
  it('yields the base code first', () => {
    const first = shortCodeCandidates('JEEVITHA PALLIPALAYAM').next().value;
    assert.equal(first, 'JPA');
  });

  it('produces unique, well-formed candidates for collision resolution', () => {
    const gen = shortCodeCandidates('JOTHILAKSHMI PUTHUKADU');
    const codes: string[] = [];
    for (let i = 0; i < 30; i++) {
      const { value, done } = gen.next();
      if (done) break;
      codes.push(value as string);
    }
    assert.equal(codes[0], 'JPU');
    assert.equal(new Set(codes).size, codes.length, 'candidates must be unique');
    for (const c of codes) assert.match(c, /^[A-Z]{3}$/);
  });

  it('can supply many candidates (scales past a single letter slot)', () => {
    const gen = shortCodeCandidates('ANNA NAGAR');
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { value, done } = gen.next();
      if (done) break;
      seen.add(value as string);
    }
    assert.ok(seen.size >= 100, `expected >=100 unique candidates, got ${seen.size}`);
  });
});
