const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const express = require('express');
const { ZodError } = require('zod');

test('grades pending answers across questions, preserves concurrent reviews and reports errors', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'palamform-ai-job-'));
  const schemaPath = path.join(dir, 'schema.prisma');
  fs.copyFileSync(path.join(__dirname, '../prisma/schema.prisma'), schemaPath);
  const env = { ...process.env, DATABASE_URL: `file:${path.join(dir, 'test.db')}` };
  const result = spawnSync(path.join(__dirname, '../node_modules/.bin/prisma'), ['db', 'push', '--schema', schemaPath, '--skip-generate'], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  process.env.DATABASE_URL = env.DATABASE_URL;
  const prisma = require('../src/db');
  const llm = require('../src/services/llm');
  const originalEvaluate = llm.evaluateAnswers;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let started;
  const firstCall = new Promise((resolve) => { started = resolve; });
  const calls = [];
  let pauseLast;
  let releaseLast;
  llm.evaluateAnswers = async (input) => {
    calls.push(input);
    if (input.questionText === 'First' && calls.length === 1) {
      started();
      await gate;
    }
    if (input.questionText === 'Last' && pauseLast) {
      pauseLast.started();
      await pauseLast.gate;
    }
    if (input.questionText === 'Fails') throw new Error('Error del proveïdor');
    input.onTrace({ prompt: 'prompt', response: 'response' });
    return input.answers.map(({ answerId }) => ({ answerId, score: 1, feedback: 'LLM' }));
  };
  let server;
  try {
    const teacher = await prisma.user.create({ data: { email: 'teacher@example.test', role: 'TEACHER' } });
    const other = await prisma.user.create({ data: { email: 'other@example.test', role: 'TEACHER' } });
    const student = await prisma.user.create({ data: { email: 'student@example.test' } });
    const quiz = await prisma.quiz.create({ data: { title: 'Quiz', teacherId: teacher.id, publicSlug: 'quiz' } });
    const questions = [];
    for (const [order, text, type, gradingCriteria, gradingWebSearch] of [
      [0, 'First', 'LONG_TEXT', 'First criteria', true],
      [1, 'Fails', 'LONG_TEXT', 'Second criteria', false],
      [2, 'Last', 'LONG_TEXT', 'Last criteria', false],
      [3, 'Image', 'IMAGE_UPLOAD', null, false],
      [4, 'Empty', 'LONG_TEXT', null, false],
    ]) {
      questions.push(await prisma.question.create({ data: { quizId: quiz.id, order, text, type, gradingCriteria, gradingWebSearch } }));
    }
    const addAnswer = async (question, value, { needsReview = true, status = 'NEEDS_REVIEW' } = {}) => {
      const attempt = await prisma.attempt.create({ data: { quizId: quiz.id, userId: student.id, seed: 1, status } });
      return prisma.answer.create({ data: { attemptId: attempt.id, questionId: question.id, value: JSON.stringify(value), needsReview } });
    };
    const first = [];
    for (let i = 0; i < 21; i += 1) first.push(await addAnswer(questions[0], `Answer ${i}`));
    const failed = await addAnswer(questions[1], 'Answer');
    const last = await addAnswer(questions[2], 'Answer');
    await addAnswer(questions[3], null);
    await addAnswer(questions[4], '  ');
    const alreadyReviewed = await addAnswer(questions[0], 'Reviewed', { needsReview: false });
    const inProgress = await addAnswer(questions[0], 'Draft', { status: 'IN_PROGRESS' });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: Number(req.get('x-teacher-id')), role: 'TEACHER' }; next(); });
    app.use('/api/teacher', require('../src/routes/teacher'));
    app.use((error, _req, res, _next) => res.status(error instanceof ZodError ? 400 : error.status || 500).json({ error: error.message }));
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const request = async (method = 'GET', teacherId = teacher.id) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/teacher/quizzes/${quiz.id}/ai-grade/job`, {
        method, headers: { 'x-teacher-id': String(teacherId) },
      });
      return { status: response.status, data: await response.json() };
    };

    assert.equal((await request('POST', other.id)).status, 404);
    assert.equal((await request('POST')).status, 202);
    await firstCall;
    assert.equal((await request('POST')).data.state, 'running');
    await prisma.answer.update({ where: { id: first[0].id }, data: { needsReview: false, manuallyReviewed: true, score: 0.5, feedback: 'Manual' } });
    release();
    let job;
    for (let i = 0; i < 100; i += 1) {
      job = (await request()).data;
      if (job.state !== 'running') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(job.state, 'done');
    assert.deepEqual([job.total, job.done, job.graded, job.skipped, job.failed], [25, 25, 21, 3, 1]);
    assert.match(job.questions[1].detail, /Error del proveïdor/);
    assert.equal(job.questions[2].graded, 1);
    assert.match(job.questions[3].detail, /no compatible/);
    assert.match(job.questions[4].detail, /buides/);
    assert.equal(calls.filter((call) => call.questionText === 'First').length, 2);
    assert.equal(calls[0].criteria, 'First criteria');
    assert.equal(calls[0].webSearch, true);
    const lastCall = calls.find((call) => call.questionText === 'Last');
    assert.equal(lastCall.criteria, 'Last criteria');
    assert.equal(lastCall.webSearch, false);
    assert.equal(calls.some((call) => call.answers.some((answer) => [alreadyReviewed.id, inProgress.id].includes(answer.answerId))), false);
    const manual = await prisma.answer.findUnique({ where: { id: first[0].id } });
    assert.equal(manual.feedback, 'Manual');
    assert.equal(manual.score, 0.5);
    assert.equal((await prisma.answer.findUnique({ where: { id: failed.id } })).needsReview, true);
    assert.equal((await prisma.answer.findUnique({ where: { id: last.id } })).llmReviewed, true);

    const newAnswer = await addAnswer(questions[2], 'New answer');
    let lastStarted;
    const lastCallStarted = new Promise((resolve) => { lastStarted = resolve; });
    pauseLast = { started: lastStarted, gate: new Promise((resolve) => { releaseLast = resolve; }) };
    assert.equal((await request('POST')).status, 202);
    await lastCallStarted;
    await prisma.question.update({ where: { id: questions[2].id }, data: { gradingWebSearch: true } });
    releaseLast();
    for (let i = 0; i < 100; i += 1) {
      job = (await request()).data;
      if (job.state !== 'running') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(job.state, 'done');
    assert.match(job.questions.find((question) => question.id === questions[2].id).detail, /han canviat/);
    assert.equal((await prisma.answer.findUnique({ where: { id: newAnswer.id } })).needsReview, true);

    const single = await fetch(`http://127.0.0.1:${server.address().port}/api/teacher/questions/${questions[0].id}/ai-grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-teacher-id': String(teacher.id) },
      body: JSON.stringify({ answerIds: [first[0].id], webSearch: false }),
    });
    assert.equal(single.status, 200);
    assert.deepEqual((await single.json()).evaluations, [{ answerId: first[0].id, llmReviewed: true }]);
    assert.equal((await prisma.answer.findUnique({ where: { id: first[0].id } })).feedback, 'LLM');
  } finally {
    release();
    releaseLast?.();
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    llm.evaluateAnswers = originalEvaluate;
    await prisma.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
