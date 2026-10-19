import test from 'node:test';
import assert from 'node:assert/strict';
import { invalidNumericFields, isNumericAnswer } from '../src/layout.js';

test('accepts decimal commas and rejects incomplete or non-finite numbers', () => {
  assert.equal(isNumericAnswer(' -1,25e2 '), true);
  assert.equal(isNumericAnswer('.5'), true);
  assert.equal(isNumericAnswer(''), false);
  assert.equal(isNumericAnswer('1,2,3'), false);
  assert.equal(isNumericAnswer('Infinity'), false);
});

test('validates only configured numeric fields independently', () => {
  const blanks = {
    type: 'FILL_BLANKS',
    config: { numericBlanks: [true, false, true] },
  };
  assert.deepEqual(invalidNumericFields(blanks, { value: ['1,5', 'text', 'oops'] }), ['blank2']);
  assert.deepEqual(invalidNumericFields(blanks, { value: ['', 'text', ''] }), []);

  const imageLabels = {
    type: 'IMAGE_LABEL',
    config: { points: [{ id: 'p1', numeric: true }, { id: 'p2', numeric: false }] },
  };
  assert.deepEqual(invalidNumericFields(imageLabels, { value: { p1: 'wrong', p2: 'text' } }), ['p1']);
  assert.deepEqual(invalidNumericFields({ type: 'SHORT_TEXT', config: { numericAnswer: true } }, { value: '2,5' }), []);
  assert.deepEqual(invalidNumericFields({ type: 'CALCULATED', config: { numericAnswer: false } }, { value: 'text' }), []);
});