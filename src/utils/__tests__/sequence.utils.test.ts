import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nameCodePrefix } from '../sequence.utils';

describe('nameCodePrefix (customer no)', () => {
  it('uses first 3 letters of center name', () => {
    assert.equal(nameCodePrefix('nagammal samathuvapuram'), 'NAG');
    assert.equal(nameCodePrefix('priya center test 1'), 'PRI');
  });

  it('strips non-letters and uppercases', () => {
    assert.equal(nameCodePrefix('  erode '), 'ERO');
  });

  it('falls back when name has no letters', () => {
    assert.equal(nameCodePrefix('123'), 'CUS');
  });
});
