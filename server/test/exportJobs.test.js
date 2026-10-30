const test = require('node:test');
const assert = require('node:assert');
const jobs = require('../src/services/exportJobs');

test.beforeEach(() => jobs.reset());

test('un job nou queda en curs i amb el progrés a zero', () => {
  const job = jobs.create({ quizId: 1, teacherId: 2 });
  const snap = jobs.snapshot(jobs.get(job.id));
  assert.strictEqual(snap.state, 'running');
  assert.strictEqual(snap.progress.done, 0);
  assert.deepStrictEqual(snap.results, null);
  assert.strictEqual(snap.teacherId, undefined);
});

test('el segon POST mentre corre reutilitza el mateix job', () => {
  const first = jobs.create({ quizId: 1, teacherId: 2 });
  const second = jobs.create({ quizId: 1, teacherId: 2 });
  assert.strictEqual(second.id, first.id);
  const other = jobs.create({ quizId: 2, teacherId: 2 });
  assert.notStrictEqual(other.id, first.id);
});

test('només es pot reclamar l’inici una vegada', () => {
  const job = jobs.create({ quizId: 1, teacherId: 2 });
  assert.strictEqual(jobs.claim(job), true);
  assert.strictEqual(jobs.claim(job), false);
});

test('els esdeveniments actualitzen el progrés i el registre', () => {
  const job = jobs.create({ quizId: 1, teacherId: 2 });
  jobs.handle(job, { type: 'start', total: 3, skipped: 1, courses: 2 });
  jobs.handle(job, { type: 'student', index: 1, total: 3, email: 'a@x.cat', name: 'A' });
  assert.deepStrictEqual(jobs.snapshot(job).progress.current, { email: 'a@x.cat', name: 'A', index: 1 });
  jobs.handle(job, { type: 'studentDone', index: 1, total: 3, email: 'a@x.cat', ok: true, ms: 10 });
  jobs.handle(job, { type: 'studentDone', index: 2, total: 3, email: 'b@x.cat', ok: false, error: 'Sense submission', ms: 10 });
  jobs.handle(job, { type: 'studentDone', index: 3, total: 3, email: 'c@x.cat', ok: true, skipped: true, ms: 0 });
  const snap = jobs.snapshot(job);
  assert.strictEqual(snap.progress.done, 3);
  assert.strictEqual(snap.progress.ok, 1);
  assert.strictEqual(snap.progress.failed, 1);
  assert.strictEqual(snap.progress.skipped, 1);
  assert.strictEqual(snap.progress.current, null);
  assert.deepStrictEqual(snap.progress.last, { email: 'c@x.cat', name: '', index: 3, ok: true, skipped: true });
  assert.strictEqual(snap.events.length, 5);
});

test('el registre no creix sense límit', () => {
  const job = jobs.create({ quizId: 1, teacherId: 2 });
  for (let i = 0; i < jobs.MAX_EVENTS + 50; i += 1) jobs.handle(job, { type: 'studentDone', index: i, ok: true });
  assert.strictEqual(jobs.snapshot(job).events.length, jobs.MAX_EVENTS);
});

test('cancel·lar i acabar deixa l’estat cancelled amb els resultats parcials', () => {
  const job = jobs.create({ quizId: 1, teacherId: 2 });
  jobs.claim(job);
  jobs.cancel(job);
  assert.strictEqual(job.cancelled, true);
  jobs.finish(job, [{ email: 'a@x.cat', score: 5, ok: true }]);
  const snap = jobs.snapshot(job);
  assert.strictEqual(snap.state, 'cancelled');
  assert.strictEqual(snap.results.length, 1);
});

test('un error deixa l’estat error amb missatge', () => {
  const job = jobs.create({ quizId: 1, teacherId: 2 });
  jobs.fail(job, 'Token caducat');
  const snap = jobs.snapshot(job);
  assert.strictEqual(snap.state, 'error');
  assert.strictEqual(snap.error, 'Token caducat');
});

test('els jobs vells s’esborren de la memòria', () => {
  const job = jobs.create({ quizId: 1, teacherId: 2 });
  job.updatedAt -= jobs.TTL_MS + 1;
  assert.strictEqual(jobs.get(job.id), null);
});
