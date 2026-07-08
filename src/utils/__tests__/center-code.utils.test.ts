import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBranchCode,
  formatCenterCode,
  highestCenterSequence,
} from '../center-code.utils';

describe('normalizeBranchCode', () => {
  it('uppercases and strips non-alphanumerics', () => {
    assert.equal(normalizeBranchCode('ant'), 'ANT');
    assert.equal(normalizeBranchCode('  sat-1 '), 'SAT1');
    assert.equal(normalizeBranchCode('ANT'), 'ANT');
  });

  it('returns empty string for missing/invalid codes', () => {
    assert.equal(normalizeBranchCode(''), '');
    assert.equal(normalizeBranchCode(null), '');
    assert.equal(normalizeBranchCode('---'), '');
  });
});

describe('formatCenterCode', () => {
  it('zero-pads the sequence to 3 digits', () => {
    assert.equal(formatCenterCode('ANT', 1), 'ANT001');
    assert.equal(formatCenterCode('ANT', 23), 'ANT023');
    assert.equal(formatCenterCode('ANT', 100), 'ANT100');
  });

  it('does not truncate sequences beyond 3 digits', () => {
    assert.equal(formatCenterCode('ANT', 1000), 'ANT1000');
  });
});

describe('highestCenterSequence', () => {
  it('returns the max numeric sequence for a prefix', () => {
    assert.equal(highestCenterSequence(['ANT001', 'ANT002', 'ANT003'], 'ANT'), 3);
    assert.equal(highestCenterSequence(['ANT010', 'ANT002'], 'ANT'), 10);
  });

  it('ignores codes that do not match the prefix exactly', () => {
    // "ANTX001" must not count towards the "ANT" sequence (avoids prefix-substring bugs).
    assert.equal(highestCenterSequence(['ANTX001', 'ANT002'], 'ANT'), 2);
    assert.equal(highestCenterSequence(['SAT051', 'ANT002'], 'ANT'), 2);
  });

  it('handles empty / null codes', () => {
    assert.equal(highestCenterSequence([], 'ANT'), 0);
    assert.equal(highestCenterSequence([null, undefined, ''], 'ANT'), 0);
  });

  it('is case-insensitive on stored codes', () => {
    assert.equal(highestCenterSequence(['ant005'], 'ANT'), 5);
  });
});
