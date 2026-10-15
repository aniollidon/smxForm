import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGrade } from '../src/formatGrade.js';

test('rounds grades to at most two decimal places using Catalan number formatting', () => {
  assert.equal(formatGrade(8), '8');
  assert.equal(formatGrade(7.1), '7,1');
  assert.equal(formatGrade(7.126), '7,13');
  assert.equal(formatGrade(0), '0');
});

test('uses a dash for missing or invalid grades', () => {
  assert.equal(formatGrade(null), '—');
  assert.equal(formatGrade(undefined), '—');
  assert.equal(formatGrade(Number.NaN), '—');
});