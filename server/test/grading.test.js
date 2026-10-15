const test = require('node:test');
const assert = require('node:assert');
const { scoreQuestion, computeAttemptScore, shuffle } = require('../src/grading');

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

test('manual i nota final', () => {
  const l = q('LONG_TEXT', {});
  assert.ok(scoreQuestion(l, 'text').manual);
  const quiz = { maxScore: 10 };
  const qs = [{ id: 1, points: 1 }, { id: 2, points: 1 }];
  const r = computeAttemptScore(quiz, qs, new Map([[1, { score: 1 }], [2, { score: null, needsReview: true }]]));
  assert.deepStrictEqual(r, { score: 5, pending: true });
});

test('shuffle determinista', () => {
  assert.deepStrictEqual(shuffle([1, 2, 3, 4, 5], 7), shuffle([1, 2, 3, 4, 5], 7));
});
