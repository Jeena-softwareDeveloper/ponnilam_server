import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { branchCodePrefix } from '../center-code.utils';

describe('branchCodePrefix', () => {
  it('uses first 3 letters of branch name', () => {
    assert.equal(branchCodePrefix('Erode'), 'ERO');
    assert.equal(branchCodePrefix('Anthiyur'), 'ANT');
    assert.equal(branchCodePrefix('Sathiyamangalam'), 'SAT');
  });

  it('strips non-letters and uppercases', () => {
    assert.equal(branchCodePrefix('  erode '), 'ERO');
    assert.equal(branchCodePrefix('Erode-1'), 'ERO');
  });

  it('falls back when name has no letters', () => {
    assert.equal(branchCodePrefix('123'), 'CTR');
    assert.equal(branchCodePrefix(''), 'CTR');
  });
});
