const express = require('express');
const { z } = require('zod');
const crypto = require('crypto');
const prisma = require('../db');
const classroom = require('../services/classroom');
const { scoreQuestion, computeAttemptScore, shuffle, isAnswered, getInvalidNumericFields } = require('../grading');
const { requireAuth } = require('../auth');
const { instantiate, personalize } = require('../grading/calculated');

const router = express.Router();
router.use(requireAuth);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, msg) => Object.assign(new Error(msg), { status });

async function quizBySlug(slug) {
  const quiz = await prisma.quiz.findUnique({ where: { publicSlug: slug } });
  if (!quiz || !quiz.published) throw fail(404, 'Quiz no trobat');
  return quiz;
}

async function assertAccess(quiz, user) {
  if (process.env.DEV_LOGIN === '1' && process.env.NODE_ENV !== 'production' && user.email.startsWith('prova.')) return;
  const r = await classroom.checkStudentAccess(quiz, user.email).catch(() => ({ ok: false, reason: 'No es pot verificar l\'accés amb Classroom' }));
  if (!r.ok) throw fail(403, r.reason);
}

// Vista de la pregunta per a l'alumne (sense answerKey) i amb l'ordre aleatori de l'intent
function studentQuestion(q, seed) {
  const config = JSON.parse(q.config);
  if (q.shuffleOptions) {
    const s = seed + q.id * 31;
    if (config.options) config.options = shuffle(config.options, s);
    if (config.right) config.right = shuffle(config.right, s);
    if (config.items) config.items = shuffle(config.items, s);
    if (config.labels) config.labels = shuffle(config.labels, s);
  }
  const { answerKey, ...rest } = q;
  if (q.type === 'CALCULATED') {
    const { text } = instantiate({ ...q, answerKey: JSON.parse(answerKey) }, seed);
    return { ...rest, text, config: { allowClipboard: !!config.allowClipboard, numericAnswer: config.numericAnswer !== false } };
  }
  return { ...rest, config };
}

function orderedQuestions(quiz, questions, seed) {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  if (!quiz.shuffleQuestions) return sorted;
  // Es barregen les preguntes dins de cada secció; un grup es mou com un sol bloc.
  const sections = [];
  for (const q of sorted) {
    if (!sections.length || q.sectionTitle) sections.push({ title: q.sectionTitle ?? null, units: [] });
    const units = sections[sections.length - 1].units;
    const last = units[units.length - 1];
    if (q.groupId != null && last && last[0].groupId === q.groupId) last.push(q);
    else units.push([q]);
  }
  return sections.flatMap((section, i) => shuffle(section.units, seed + i).flat().map((q, j) => ({ ...q, sectionTitle: j === 0 ? section.title : null })));
}

const resultsVisible = (quiz) => quiz.showResults !== 'NONE' && (!quiz.showResultsFrom || new Date() >= quiz.showResultsFrom);

function attemptResult(attempt, quiz, questions, answers) {
  if (attempt.status === 'IN_PROGRESS') return null;
  const base = { status: attempt.status, submittedAt: attempt.submittedAt, visible: resultsVisible(quiz), questionCount: answers.length };
  if (!base.visible) return base;
  base.score = attempt.score;
  base.maxScore = quiz.maxScore;
  base.groups = quiz.groups || [];
  if (quiz.showResults === 'FULL' || quiz.showResults === 'ANSWERS') {
    const corrected = quiz.showResults === 'FULL';
    base.corrected = corrected;
    const byQ = new Map(answers.map((a) => [a.questionId, a]));
    base.questions = questions.map((q) => {
      const a = byQ.get(q.id);
      const pq = personalize({ ...q, config: JSON.parse(q.config), answerKey: JSON.parse(q.answerKey) }, attempt.seed);
      return {
        id: q.id,
        sectionTitle: q.sectionTitle,
        groupId: q.groupId,
        text: pq.text,
        type: q.type,
        points: q.points,
        imageUrl: q.imageUrl,
        config: pq.config,
        answerKey: corrected ? pq.answerKey : null,
        value: a ? JSON.parse(a.value) : null,
        fileUrl: a?.fileUrl ?? null,
        score: corrected ? a?.score ?? null : null,
        feedback: corrected ? a?.feedback ?? null : null,
      };
    });
  }
  return base;
}

router.get('/me', (req, res) => {
  const { id, email, name, role } = req.user;
  res.json({ id, email, name, role });
});

router.get('/attempts', wrap(async (req, res) => {
  const attempts = await prisma.attempt.findMany({
    where: { userId: req.user.id },
    include: { quiz: true },
    orderBy: { startedAt: 'desc' },
  });
  res.json(
    attempts.map((a) => ({
      id: a.id,
      quizTitle: a.quiz.title,
      slug: a.quiz.publicSlug,
      status: a.status,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      score: resultsVisible(a.quiz) ? a.score : null,
      maxScore: a.quiz.maxScore,
    }))
  );
}));

router.get('/quizzes/:slug', wrap(async (req, res) => {
  const quiz = await quizBySlug(req.params.slug);
  await assertAccess(quiz, req.user);
  const attempts = await prisma.attempt.findMany({ where: { quizId: quiz.id, userId: req.user.id }, orderBy: { startedAt: 'desc' } });
  const used = attempts.filter((a) => a.status !== 'IN_PROGRESS').length;
  const max = quiz.allowRetry ? quiz.maxAttempts : 1;
  res.json({
    title: quiz.title,
    description: quiz.description,
    slug: quiz.publicSlug,
    attemptsUsed: used,
    maxAttempts: max,
    canStart: used < max || attempts.some((a) => a.status === 'IN_PROGRESS'),
    inProgressAttemptId: attempts.find((a) => a.status === 'IN_PROGRESS')?.id ?? null,
    attempts: attempts.map((a) => ({ id: a.id, status: a.status, submittedAt: a.submittedAt, score: resultsVisible(quiz) ? a.score : null })),
  });
}));

router.post('/quizzes/:slug/start', wrap(async (req, res) => {
  const quiz = await quizBySlug(req.params.slug);
  await assertAccess(quiz, req.user);
  const existing = await prisma.attempt.findMany({ where: { quizId: quiz.id, userId: req.user.id } });
  const open = existing.find((a) => a.status === 'IN_PROGRESS');
  if (open) return res.json({ attemptId: open.id });
  if (existing.length >= (quiz.allowRetry ? quiz.maxAttempts : 1)) throw fail(409, 'Has esgotat els intents');
  const attempt = await prisma.attempt.create({
    data: { quizId: quiz.id, userId: req.user.id, seed: crypto.randomInt(1, 2 ** 30) },
  });
  res.status(201).json({ attemptId: attempt.id });
}));

async function ownAttempt(req) {
  const a = await prisma.attempt.findUnique({
    where: { id: Number(req.params.aid) },
    include: { quiz: { include: { questions: true, groups: true } }, answers: true },
  });
  if (!a || a.userId !== req.user.id) throw fail(404, 'Intent no trobat');
  return a;
}

router.get('/attempts/:aid', wrap(async (req, res) => {
  const a = await ownAttempt(req);
  const questions = orderedQuestions(a.quiz, a.quiz.questions, a.seed);
  const result = attemptResult(a, a.quiz, questions, a.answers);
  const out = { id: a.id, status: a.status, title: a.quiz.title, result };
  if (a.status === 'IN_PROGRESS') {
    out.questions = questions.map((q) => studentQuestion(q, a.seed));
    out.groups = a.quiz.groups;
    out.answers = Object.fromEntries(a.answers.map((x) => [x.questionId, { value: JSON.parse(x.value), fileUrl: x.fileUrl }]));
  }
  res.json(out);
}));

router.put('/attempts/:aid/answers/:qid', wrap(async (req, res) => {
  const a = await ownAttempt(req);
  if (a.status !== 'IN_PROGRESS') throw fail(409, 'Intent ja enviat');
  const q = a.quiz.questions.find((x) => x.id === Number(req.params.qid));
  if (!q) throw fail(404, 'Pregunta no trobada');
  if (q.type === 'IMAGE_UPLOAD') throw fail(400, 'Usa la pujada de fitxer');
  const { value } = z.object({ value: z.any() }).parse(req.body);
  if (q.type === 'DRAWING') {
    const ok = value === null || (Array.isArray(value?.strokes) && value.strokes.length <= 500
      && value.strokes.every((s) => Array.isArray(s) && s.length >= 2 && s.length <= 4000 && s.every((n) => Number.isFinite(n))));
    if (!ok) throw fail(400, 'Dibuix invàlid');
  }
  const json = JSON.stringify(value ?? null);
  if (json.length > (q.type === 'DRAWING' ? 150000 : 20000)) throw fail(413, 'Resposta massa llarga');
  await prisma.answer.upsert({
    where: { attemptId_questionId: { attemptId: a.id, questionId: q.id } },
    update: { value: json },
    create: { attemptId: a.id, questionId: q.id, value: json },
  });
  res.json({ ok: true });
}));

router.post('/attempts/:aid/submit', wrap(async (req, res) => {
  const a = await ownAttempt(req);
  if (a.status !== 'IN_PROGRESS') throw fail(409, 'Intent ja enviat');
  await assertAccess(a.quiz, req.user);
  const byQ = new Map(a.answers.map((x) => [x.questionId, x]));
  const invalidNumeric = a.quiz.questions.flatMap((question) => {
    const answer = byQ.get(question.id);
    const fields = getInvalidNumericFields({ ...question, config: JSON.parse(question.config) }, answer ? JSON.parse(answer.value) : null);
    return fields.length ? [{ questionId: question.id, fields }] : [];
  });
  if (invalidNumeric.length) return res.status(422).json({ error: 'Algunes respostes han de ser nombres vàlids', invalidNumeric });
  const missing = a.quiz.questions
    .filter((q) => {
      if (!q.required) return false;
      const x = byQ.get(q.id);
      if (!x) return true;
      return !(q.type === 'IMAGE_UPLOAD' ? !!x.fileUrl : isAnswered(q.type, JSON.parse(x.value)));
    })
    .map((q) => q.id);
  if (missing.length) return res.status(422).json({ error: 'Falten preguntes obligatòries', missing });

  const scored = new Map();
  for (const q of a.quiz.questions) {
    const x = byQ.get(q.id);
    const value = x ? JSON.parse(x.value) : null;
    const r = scoreQuestion({ ...q, answerKey: JSON.parse(q.answerKey), seed: a.seed }, q.type === 'IMAGE_UPLOAD' ? !!x?.fileUrl : value, a.quiz.negativePenalty);
    const data = { score: r.manual ? null : r.score, needsReview: !!(r.manual && r.answered), questionGradingVersion: q.gradingVersion };
    if (r.manual && !r.answered) data.score = 0;
    const saved = await prisma.answer.upsert({
      where: { attemptId_questionId: { attemptId: a.id, questionId: q.id } },
      update: data,
      create: { attemptId: a.id, questionId: q.id, ...data },
    });
    scored.set(q.id, saved);
  }
  const { score, pending } = computeAttemptScore(a.quiz, a.quiz.questions, scored);
  await prisma.attempt.update({
    where: { id: a.id },
    data: {
      submittedAt: new Date(),
      score: pending ? null : score,
      status: pending ? 'NEEDS_REVIEW' : 'GRADED',
      gradedVersion: a.quiz.gradingVersion,
    },
  });
  res.json({ ok: true });
}));

module.exports = { router, assertAccess };
