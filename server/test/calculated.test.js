const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, instantiate, validateDefinition, personalize } = require('../src/grading/calculated');
const { scoreQuestion } = require('../src/grading');

const question = {
  id: 5,
  type: 'CALCULATED',
  points: 2,
  text: 'Un cotxe fa {d} km en {t} h. Quina és la velocitat mitjana? (doble: {=2*{d}})',
  config: { variables: [{ name: 'd', min: 100, max: 200, decimals: 0 }, { name: 't', min: 2, max: 4, decimals: 1 }] },
  answerKey: { formula: '{d}/{t}', tolerance: 0.01, toleranceType: 'nominal' },
};

test('evaluates formulas with precedence, functions and variables', () => {
  assert.equal(evaluate('2+3*4', {}), 14);
  assert.equal(evaluate('-2**2', {}), -4);
  assert.equal(evaluate('sqrt({a})+pow(2,3)+pi()', { a: 9 }), 11 + Math.PI);
  assert.throws(() => evaluate('process.exit()', {}));
  assert.throws(() => evaluate('{x}+1', {}), /desconeguda/);
});

test('instantiation is deterministic per seed, within ranges, and varies between seeds', () => {
  const a = instantiate(question, 123);
  assert.deepEqual(instantiate(question, 123), a);
  assert.ok(a.values.d >= 100 && a.values.d <= 200);
  assert.match(a.text, new RegExp(`${a.values.d} km en ${a.values.t.toFixed(1)} h`));
  assert.ok(a.text.includes(`doble: ${2 * a.values.d}`));
  assert.ok(new Set([1, 2, 3, 4, 5, 6].map((s) => instantiate(question, s).text)).size > 1);
});

test('grades numeric answers with tolerance and decimal comma', () => {
  const { expected } = instantiate(question, 77);
  const grade = (v) => scoreQuestion({ ...question, seed: 77 }, v).score;
  assert.equal(grade(String(expected.toFixed(4)).replace('.', ',')), 2);
  assert.equal(grade(String(expected + 0.005)), 2);
  assert.equal(grade(String(expected + 1)), 0);
  assert.equal(grade('abc'), 0);
});

test('relative tolerance and validation', () => {
  const rel = { ...question, seed: 3, answerKey: { formula: '{d}', tolerance: 0.1, toleranceType: 'relative' } };
  const { values } = instantiate(rel, 3);
  assert.equal(scoreQuestion(rel, String(values.d * 1.05)).score, 2);
  assert.equal(scoreQuestion(rel, String(values.d * 1.2)).score, 0);
  assert.equal(validateDefinition(question.text, question.config, question.answerKey), null);
  assert.match(validateDefinition('x', question.config, { formula: '{z}*2' }), /desconeguda/);
  assert.match(validateDefinition('x', { variables: [{ name: 'a', min: 5, max: 1, decimals: 0 }] }, { formula: '{a}' }), /mínim/);
});

test('personalize adds rendered text and expected answer', () => {
  const p = personalize(question, 9);
  assert.ok(!p.text.includes('{d}'));
  assert.equal(typeof p.answerKey.expected, 'number');
});
