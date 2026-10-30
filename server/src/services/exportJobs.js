// Exportacions de notes en curs. Un sol procés Node (PM2 amb una instància), així que
// n'hi ha prou amb un Map en memòria: el client consulta l'estat cada 500 ms.

const TTL_MS = 15 * 60 * 1000; // prou per llegir el resum després d'acabar
const MAX_EVENTS = 200; // el detall antic ja no interessa i no volem créixer sense límit

const jobs = new Map();
let counter = 0;

function prune(now = Date.now()) {
  for (const [id, job] of jobs) if (now - job.updatedAt > TTL_MS) jobs.delete(id);
}

function runningFor(quizId, teacherId, returnToStudents) {
  prune();
  for (const job of jobs.values()) {
    if (job.quizId !== quizId || job.teacherId !== teacherId || job.state !== 'running') continue;
    if (returnToStudents !== undefined && !!job.returnToStudents !== !!returnToStudents) continue;
    return job;
  }
  return null;
}

function create({ quizId, teacherId, returnToStudents = false }) {
  const existing = runningFor(quizId, teacherId, returnToStudents);
  if (existing) return existing;
  counter += 1;
  const job = {
    id: `x${Date.now().toString(36)}${counter.toString(36)}`,
    quizId,
    teacherId,
    returnToStudents,
    state: 'running',
    cancelled: false,
    started: false,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    progress: { total: 0, done: 0, ok: 0, failed: 0, skipped: 0, courses: 0, current: null, last: null },
    events: [],
    results: null,
    error: null,
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
}

function get(id) {
  prune();
  return jobs.get(id) || null;
}

// Retorna cert només la primera vegada: evita engegar dues exportacions si el botó es prem dues vegades.
function claim(job) {
  if (job.started) return false;
  job.started = true;
  return true;
}

function handle(job, event) {
  job.updatedAt = Date.now();
  if (event.type === 'start') {
    job.progress.total = event.total ?? 0;
    job.progress.courses = event.courses ?? 0;
  }
  if (event.type === 'student') {
    job.progress.current = { email: event.email, name: event.name || '', index: event.index };
  }
  if (event.type === 'studentDone') {
    job.progress.done += 1;
    job.progress.current = null;
    job.progress.last = { email: event.email, name: event.name || '', index: event.index, ok: !!event.ok, skipped: !!event.skipped };
    if (event.skipped) job.progress.skipped += 1;
    else if (event.ok) job.progress.ok += 1;
    else job.progress.failed += 1;
  }
  job.events.push({ ...event, at: new Date().toISOString() });
  if (job.events.length > MAX_EVENTS) job.events.splice(0, job.events.length - MAX_EVENTS);
  return job;
}

function finish(job, results = []) {
  job.results = results;
  job.state = job.cancelled ? 'cancelled' : 'done';
  job.finishedAt = new Date().toISOString();
  job.progress.current = null;
  job.updatedAt = Date.now();
  return job;
}

function fail(job, message) {
  job.state = 'error';
  job.error = message || 'Error en exportar les notes';
  job.finishedAt = new Date().toISOString();
  job.progress.current = null;
  job.updatedAt = Date.now();
  return job;
}

function cancel(job) {
  if (job.state === 'running') job.cancelled = true;
  job.updatedAt = Date.now();
  return job;
}

function snapshot(job) {
  if (!job) return null;
  return {
    id: job.id,
    quizId: job.quizId,
    state: job.state,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    progress: { ...job.progress, current: job.progress.current ? { ...job.progress.current } : null, last: job.progress.last ? { ...job.progress.last } : null },
    events: job.events,
    results: job.results,
    error: job.error,
  };
}

// Només per als tests.
function reset() {
  jobs.clear();
  counter = 0;
}

module.exports = { create, get, claim, handle, finish, fail, cancel, snapshot, runningFor, reset, TTL_MS, MAX_EVENTS };
