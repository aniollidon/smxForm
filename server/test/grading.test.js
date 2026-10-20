const test = require('node:test');
const assert = require('node:assert');
const { scoreQuestion, computeAttemptScore, shuffle, getInvalidNumericFields } = require('../src/grading');

const q = (type, answerKey, points = 2) => ({ id: 1, type, points, answerKey });

test('MCQ parcial i penalització', () => {
  const m = q('MCQ', { correct: ['a', 'b'] });
  assert.strictEqual(scoreQuestion(m, ['a', 'b']).score, 2);
  assert.strictEqual(scoreQuestion(m, ['a']).score, 1);
  assert.strictEqual(scoreQuestion(m, ['c'], 0.5).score, -1);
  assert.strictEqual(scoreQuestion(m, [], 0.5).score, 0);
  assert.strictEqual(scoreQuestion(q('MCQ', { correct: ['a', 'b'], allOrNothing: true }), ['a'], 0.5).score, -1);
  assert.strictEqual(scoreQuestion(q('MCQ', { correct: ['a', 'b'], allOrNothing: true }), ['a', 'b']).score, 2);
});

test('TRUE_FALSE', () => {
  const t = q('TRUE_FALSE', { correct: false });
  assert.strictEqual(scoreQuestion(t, false).score, 2);
  assert.strictEqual(scoreQuestion(t, true, 1).score, -2);
});

test('MATCHING', () => {
  const m = q('MATCHING', { pairs: { 1: 'x', 2: 'y' } });
  assert.strictEqual(scoreQuestion(m, { 1: 'x', 2: 'y' }).score, 2);
  assert.strictEqual(scoreQuestion(m, { 1: 'x' }).score, 1);
  const strict = q('MATCHING', { pairs: { 1: 'x', 2: 'y' }, allOrNothing: true });
  assert.strictEqual(scoreQuestion(strict, { 1: 'x', 2: 'y' }).score, 2);
  assert.strictEqual(scoreQuestion(strict, { 1: 'x' }).score, 0);
  assert.strictEqual(scoreQuestion(strict, { 1: 'x', 2: 'y', extra: 'z' }).score, 0);
  assert.strictEqual(scoreQuestion(strict, { 1: 'x', 2: 'wrong' }, 0.25).score, -0.5);
});

test('ORDERING dona puntuació parcial pels elements ben posicionats', () => {
  const ordering = q('ORDERING', { order: ['a', 'b', 'c', 'd'] });
  assert.strictEqual(scoreQuestion(ordering, ['a', 'b', 'c', 'd']).score, 2);
  assert.strictEqual(scoreQuestion(ordering, ['b', 'a', 'c', 'd']).score, 1);
  assert.strictEqual(scoreQuestion(ordering, ['a']).score, 0.5);
  const strict = q('ORDERING', { order: ['a', 'b', 'c', 'd'], allOrNothing: true });
  assert.strictEqual(scoreQuestion(strict, ['a', 'b', 'c', 'd']).score, 2);
  assert.strictEqual(scoreQuestion(strict, ['a', 'b', 'd', 'c']).score, 0);
});

test('IMAGE_LABEL i SHORT_TEXT normalitzats', () => {
  assert.strictEqual(scoreQuestion(q('IMAGE_LABEL', { labels: { p1: 'Cor' } }), { p1: ' cor ' }).score, 2);
  assert.strictEqual(scoreQuestion(q('SHORT_TEXT', { accepted: ['Àtom'] }), 'atom').score, 2);
});

test('FILL_BLANKS puntua cada buit amb alternatives acceptades', () => {
  const f = q('FILL_BLANKS', { blanks: [['més', 'mes'], ['soroll']] });
  assert.strictEqual(scoreQuestion(f, [' Més ', 'Soroll']).score, 2);
  assert.strictEqual(scoreQuestion(f, ['mes', 'res']).score, 1);
  assert.strictEqual(scoreQuestion(f, ['', '']).answered, false);
  assert.strictEqual(scoreQuestion(f, ['no', 'no'], 0.5).score, -1);
});

test('numeric expected answers compare numerically and validate independent fields', () => {
  const short = { ...q('SHORT_TEXT', { accepted: ['1.0'] }), config: { numericAnswer: true } };
  assert.equal(scoreQuestion(short, '1,00').score, 2);
  assert.equal(scoreQuestion(short, 'text').score, 0);

  const blanks = {
    ...q('FILL_BLANKS', { blanks: [['2'], ['two']] }),
    config: { numericBlanks: [true, false] },
  };
  assert.equal(scoreQuestion(blanks, ['2,0', 'TWO']).score, 2);
  assert.deepEqual(getInvalidNumericFields(blanks, ['wrong', 'text']), ['blank0']);
  assert.deepEqual(getInvalidNumericFields({ type: 'IMAGE_LABEL', config: JSON.stringify({ points: [{ id: 'p1', numeric: true }, { id: 'p2', numeric: false }] }) }, { p1: '3,5', p2: 'text' }), []);
  assert.deepEqual(getInvalidNumericFields({ type: 'CALCULATED', config: { numericAnswer: true } }, 'not a number'), ['answer']);
  assert.deepEqual(getInvalidNumericFields({ type: 'CALCULATED', config: {} }, 'not a number'), ['answer']);
  assert.deepEqual(getInvalidNumericFields({ type: 'CALCULATED', config: { numericAnswer: false } }, 'text'), []);
});

test('manual i nota final', () => {
  const l = q('LONG_TEXT', {});
  assert.ok(scoreQuestion(l, 'text').manual);
  const table = q('TABLE', { reference: 'Dades de referència' });
  assert.deepEqual(scoreQuestion(table, [['2024', '1.6M'], ['', '']]), { manual: true, answered: true, score: null });
  assert.deepEqual(scoreQuestion(table, [['', '']]), { manual: true, answered: false, score: null });
  const quiz = { maxScore: 10 };
  const qs = [{ id: 1, points: 1 }, { id: 2, points: 1 }];
  const r = computeAttemptScore(quiz, qs, new Map([[1, { score: 1 }], [2, { score: null, needsReview: true }]]));
  assert.deepStrictEqual(r, { score: 5, pending: true });
});

test('shuffle determinista', () => {
  assert.deepStrictEqual(shuffle([1, 2, 3, 4, 5], 7), shuffle([1, 2, 3, 4, 5], 7));
});
