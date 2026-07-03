import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lowestAvailableSuffix } from '../sequence.utils';

describe('lowestAvailableSuffix', () => {
  it('returns 1 when no numbers are used', () => {
    assert.equal(lowestAvailableSuffix([]), 1);
  });

  it('fills gap when 2 is missing (1,3,4)', () => {
    assert.equal(lowestAvailableSuffix([1, 3, 4]), 2);
  });

  it('returns next after continuous block 1..5', () => {
    assert.equal(lowestAvailableSuffix([1, 2, 3, 4, 5]), 6);
  });

  it('returns 1 when only higher numbers exist (2..6)', () => {
    assert.equal(lowestAvailableSuffix([2, 3, 4, 5, 6]), 1);
  });
});
