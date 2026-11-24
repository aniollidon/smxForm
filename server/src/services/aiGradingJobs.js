const jobs = new Map();
const TTL_MS = 15 * 60 * 1000;

function get(quizId, teacherId) {
  for (const [id, entry] of jobs) {
    if (entry.state !== 'running' && Date.now() - entry.updatedAt > TTL_MS) jobs.delete(id);
  }
  const job = jobs.get(quizId);
  if (!job || job.teacherId !== teacherId) return null;
  return job;
}

function start(quizId, teacherId, run) {
  const existing = get(quizId, teacherId);
  if (existing?.state === 'running') return existing;
  const job = { quizId, teacherId, state: 'running', total: 0, done: 0, graded: 0, skipped: 0, failed: 0, questions: [], error: null, updatedAt: Date.now() };
  jobs.set(quizId, job);
  Promise.resolve().then(() => run(job)).then(() => {
    job.state = 'done';
    job.updatedAt = Date.now();
  }).catch((error) => {
    job.state = 'error';
    job.error = error.message;
    job.updatedAt = Date.now();
  });
  return job;
}

function snapshot(job) {
  if (!job) return null;
  const { teacherId, updatedAt, ...result } = job;
  return result;
}

module.exports = { get, start, snapshot };
