const test = require('node:test');
const assert = require('node:assert');
const { pickExportTargets } = require('../src/services/exportPlan');

const at = (iso) => new Date(iso);
const attempt = (userId, email, score, submittedAt, extra = {}) => ({
  id: userId * 100 + score,
  userId,
  score,
  submittedAt: at(submittedAt),
  exportedAt: null,
  exportedScore: null,
  user: { email, name: email.split('@')[0] },
  ...extra,
});

test('sense represa exporta el millor intent de cada alumne', () => {
  const targets = pickExportTargets({ gradeToExport: 'BEST' }, [
    attempt(1, 'a@x.cat', 5, '2026-10-01T10:00:00Z'),
    attempt(1, 'a@x.cat', 8, '2026-10-02T10:00:00Z'),
    attempt(2, 'b@x.cat', 6, '2026-10-03T10:00:00Z'),
  ]);
  assert.strictEqual(targets.length, 2);
  assert.deepStrictEqual(targets.map((t) => t.attempt.score).sort(), [6, 8]);
  assert.ok(targets.every((t) => t.skip === false));
});

test('amb gradeToExport LAST exporta l’últim intent', () => {
  const targets = pickExportTargets({ gradeToExport: 'LAST' }, [
    attempt(1, 'a@x.cat', 9, '2026-10-01T10:00:00Z'),
    attempt(1, 'a@x.cat', 4, '2026-10-02T10:00:00Z'),
  ]);
  assert.strictEqual(targets.length, 1);
  assert.strictEqual(targets[0].attempt.score, 4);
});

test('la represa salta els alumnes amb la nota ja exportada igual', () => {
  const targets = pickExportTargets({ gradeToExport: 'BEST' }, [
    attempt(1, 'a@x.cat', 8, '2026-10-01T10:00:00Z', { exportedAt: at('2026-10-05T10:00:00Z'), exportedScore: 8 }),
    attempt(2, 'b@x.cat', 6, '2026-10-02T10:00:00Z', { exportedAt: at('2026-10-05T10:00:00Z'), exportedScore: 3 }),
  ], { skipUnchanged: true });
  const byEmail = new Map(targets.map((t) => [t.attempt.user.email, t]));
  assert.strictEqual(byEmail.get('a@x.cat').skip, true);
  assert.strictEqual(byEmail.get('b@x.cat').skip, false);
});

test('la represa no salta un alumne amb un intent nou de nota diferent', () => {
  const targets = pickExportTargets({ gradeToExport: 'BEST' }, [
    attempt(1, 'a@x.cat', 5, '2026-10-01T10:00:00Z', { exportedAt: at('2026-10-02T10:00:00Z'), exportedScore: 5 }),
    attempt(1, 'a@x.cat', 9, '2026-10-03T10:00:00Z'),
  ], { skipUnchanged: true });
  assert.strictEqual(targets.length, 1);
  assert.strictEqual(targets[0].attempt.score, 9);
  assert.strictEqual(targets[0].skip, false);
});

test('sense represa no se salta ningú encara que estigui al dia', () => {
  const targets = pickExportTargets({ gradeToExport: 'BEST' }, [
    attempt(1, 'a@x.cat', 8, '2026-10-01T10:00:00Z', { exportedAt: at('2026-10-02T10:00:00Z'), exportedScore: 8 }),
  ]);
  assert.strictEqual(targets[0].skip, false);
});
