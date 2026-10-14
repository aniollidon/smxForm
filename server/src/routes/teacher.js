const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../db');
const classroom = require('../services/classroom');
const { computeAttemptScore } = require('../grading');
const { requireTeacher } = require('../auth');

const router = express.Router();
router.use(requireTeacher);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, msg) => Object.assign(new Error(msg), { status });

const TYPES = ['MCQ', 'TRUE_FALSE', 'MATCHING', 'IMAGE_LABEL', 'SHORT_TEXT', 'LONG_TEXT', 'IMAGE_UPLOAD'];
const id = z.union([z.string(), z.number()]).transform(String);
const item = z.object({ id, text: z.string().max(500) });

const configSchemas = {
  MCQ: z.object({ options: z.array(item).min(2).max(12), multiple: z.boolean().default(false) }),
  TRUE_FALSE: z.object({}).passthrough(),
  MATCHING: z.object({ left: z.array(item).min(2).max(12), right: z.array(item).min(2).max(15) }),
  IMAGE_LABEL: z.object({
    points: z.array(z.object({ id, x: z.number().min(0).max(100), y: z.number().min(0).max(100) })).min(1).max(30),
    labels: z.array(z.string().max(100)).nullable().default(null),
  }),
  SHORT_TEXT: z.object({}).passthrough(),
  LONG_TEXT: z.object({}).passthrough(),
  IMAGE_UPLOAD: z.object({}).passthrough(),
};
const keySchemas = {
  MCQ: z.object({ correct: z.array(id).min(1), allOrNothing: z.boolean().optional() }),
  TRUE_FALSE: z.object({ correct: z.boolean() }),
  MATCHING: z.object({ pairs: z.record(id) }),
  IMAGE_LABEL: z.object({ labels: z.record(z.string()) }),
  SHORT_TEXT: z.object({ accepted: z.array(z.string()).default([]), regex: z.string().max(200).optional() }),
  LONG_TEXT: z.object({ reference: z.string().optional() }).passthrough(),
  IMAGE_UPLOAD: z.object({}).passthrough(),
};

const questionSchema = z.object({
  type: z.enum(TYPES),
  text: z.string().min(1).max(5000),
  imageUrl: z.string().regex(/^q_[a-f0-9]{32}\.(png|jpg|webp|gif)$/).nullable().optional(),
  points: z.number().min(0).max(1000).default(1),
  required: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  config: z.any().default({}),
  answerKey: z.any().default({}),
});

function parseQuestion(body) {
  const q = questionSchema.parse(body);
  q.config = configSchemas[q.type].parse(q.config);
  q.answerKey = keySchemas[q.type].parse(q.answerKey);
  if (q.type === 'MATCHING') {
    const l = new Set(q.config.left.map((x) => x.id));
    const r = new Set(q.config.right.map((x) => x.id));
    for (const [a, b] of Object.entries(q.answerKey.pairs)) if (!l.has(a) || !r.has(b)) throw fail(400, 'Parelles invàlides');
  }
  if (q.type === 'MCQ') {
    const o = new Set(q.config.options.map((x) => x.id));
    if (!q.answerKey.correct.every((c) => o.has(c))) throw fail(400, 'Resposta correcta invàlida');
  }
  return { ...q, config: JSON.stringify(q.config), answerKey: JSON.stringify(q.answerKey) };
}

const quizSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(''),
  maxScore: z.number().positive().max(1000).default(10),
  shuffleQuestions: z.boolean().default(false),
  allowRetry: z.boolean().default(false),
  maxAttempts: z.number().int().min(1).max(100).default(1),
  negativePenalty: z.number().min(0).max(1).default(0),
  gradeToExport: z.enum(['BEST', 'LAST']).default('BEST'),
  showResults: z.enum(['NONE', 'SCORE', 'FULL']).default('SCORE'),
  showResultsFrom: z.string().datetime().nullable().optional(),
  published: z.boolean().default(false),
});

const present = (q) => ({ ...q, config: JSON.parse(q.config), answerKey: JSON.parse(q.answerKey) });

async function ownQuiz(req, include) {
  const quiz = await prisma.quiz.findUnique({ where: { id: Number(req.params.id) }, include });
  if (!quiz || quiz.teacherId !== req.user.id) throw fail(404, 'Quiz no trobat');
  return quiz;
}

router.get('/me', (req, res) => {
  res.json({ classroomConnected: !!req.user.googleTokens });
});

router.get('/quizzes', wrap(async (req, res) => {
  const quizzes = await prisma.quiz.findMany({
    where: { teacherId: req.user.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { questions: true, attempts: true } } },
  });
  res.json(quizzes);
}));

router.post('/quizzes', wrap(async (req, res) => {
  const data = quizSchema.parse(req.body);
  const quiz = await prisma.quiz.create({
    data: {
      ...data,
      showResultsFrom: data.showResultsFrom ? new Date(data.showResultsFrom) : null,
      teacherId: req.user.id,
      publicSlug: crypto.randomBytes(8).toString('hex'),
    },
  });
  res.status(201).json(quiz);
}));

router.get('/quizzes/:id', wrap(async (req, res) => {
  const quiz = await ownQuiz(req, { questions: { orderBy: { order: 'asc' } } });
  res.json({ ...quiz, questions: quiz.questions.map(present) });
}));

router.put('/quizzes/:id', wrap(async (req, res) => {
  await ownQuiz(req);
  const data = quizSchema.parse(req.body);
  const quiz = await prisma.quiz.update({
    where: { id: Number(req.params.id) },
    data: { ...data, showResultsFrom: data.showResultsFrom ? new Date(data.showResultsFrom) : null },
  });
  res.json(quiz);
}));

router.delete('/quizzes/:id', wrap(async (req, res) => {
  await ownQuiz(req);
  await prisma.quiz.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
}));

router.post('/quizzes/:id/duplicate', wrap(async (req, res) => {
  const src = await ownQuiz(req, { questions: true });
  const { id: _i, createdAt, questions, classroomCourseId, classroomCourseWorkId, publicSlug, ...rest } = src;
  const copy = await prisma.quiz.create({
    data: {
      ...rest,
      title: `${src.title} (còpia)`,
      published: false,
      publicSlug: crypto.randomBytes(8).toString('hex'),
      questions: {
        create: questions.map(({ id: _q, quizId, ...q }) => q),
      },
    },
  });
  res.status(201).json(copy);
}));

router.post('/quizzes/:id/questions', wrap(async (req, res) => {
  const quiz = await ownQuiz(req);
  const data = parseQuestion(req.body);
  const last = await prisma.question.aggregate({ where: { quizId: quiz.id }, _max: { order: true } });
  const q = await prisma.question.create({ data: { ...data, quizId: quiz.id, order: (last._max.order ?? -1) + 1 } });
  res.status(201).json(present(q));
}));

async function ownQuestion(req) {
  const q = await prisma.question.findUnique({ where: { id: Number(req.params.qid) }, include: { quiz: true } });
  if (!q || q.quiz.teacherId !== req.user.id) throw fail(404, 'Pregunta no trobada');
  return q;
}

router.put('/questions/:qid', wrap(async (req, res) => {
  await ownQuestion(req);
  const q = await prisma.question.update({ where: { id: Number(req.params.qid) }, data: parseQuestion(req.body) });
  res.json(present(q));
}));

router.delete('/questions/:qid', wrap(async (req, res) => {
  await ownQuestion(req);
  await prisma.question.delete({ where: { id: Number(req.params.qid) } });
  res.json({ ok: true });
}));

router.put('/quizzes/:id/reorder', wrap(async (req, res) => {
  const quiz = await ownQuiz(req, { questions: true });
  const ids = z.array(z.number().int()).parse(req.body.ids);
  const valid = new Set(quiz.questions.map((q) => q.id));
  if (ids.length !== valid.size || !ids.every((i) => valid.has(i))) throw fail(400, 'Llista invàlida');
  await prisma.$transaction(ids.map((qid, order) => prisma.question.update({ where: { id: qid }, data: { order } })));
  res.json({ ok: true });
}));

// Intents i correcció manual
router.get('/quizzes/:id/attempts', wrap(async (req, res) => {
  await ownQuiz(req);
  const attempts = await prisma.attempt.findMany({
    where: { quizId: Number(req.params.id), status: { not: 'IN_PROGRESS' } },
    include: { user: { select: { email: true, name: true } } },
    orderBy: { submittedAt: 'desc' },
  });
  res.json(attempts);
}));

router.get('/attempts/:aid', wrap(async (req, res) => {
  const a = await prisma.attempt.findUnique({
    where: { id: Number(req.params.aid) },
    include: { quiz: true, user: { select: { email: true, name: true } }, answers: { include: { question: true } } },
  });
  if (!a || a.quiz.teacherId !== req.user.id) throw fail(404, 'Intent no trobat');
  res.json({
    ...a,
    answers: a.answers.map((x) => ({ ...x, value: JSON.parse(x.value), question: present(x.question) })),
  });
}));

router.put('/answers/:id/review', wrap(async (req, res) => {
  const body = z.object({ score: z.number(), feedback: z.string().max(2000).optional() }).parse(req.body);
  const ans = await prisma.answer.findUnique({
    where: { id: Number(req.params.id) },
    include: { question: { include: { quiz: true } }, attempt: true },
  });
  if (!ans || ans.question.quiz.teacherId !== req.user.id) throw fail(404, 'Resposta no trobada');
  if (body.score < 0 || body.score > ans.question.points) throw fail(400, 'Puntuació fora de rang');
  await prisma.answer.update({
    where: { id: ans.id },
    data: { score: body.score, feedback: body.feedback ?? null, needsReview: false },
  });
  const attempt = await recomputeAttempt(ans.attemptId);
  res.json(attempt);
}));

async function recomputeAttempt(attemptId) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { quiz: { include: { questions: true } }, answers: true },
  });
  const map = new Map(attempt.answers.map((a) => [a.questionId, a]));
  const { score, pending } = computeAttemptScore(attempt.quiz, attempt.quiz.questions, map);
  return prisma.attempt.update({
    where: { id: attemptId },
    data: { score: pending ? null : score, status: pending ? 'NEEDS_REVIEW' : 'GRADED', exportedAt: null },
  });
}

// Classroom
router.get('/classroom/courses', wrap(async (req, res) => {
  res.json(await classroom.listCourses(req.user.id));
}));

router.post('/quizzes/:id/classroom', wrap(async (req, res) => {
  const quiz = await ownQuiz(req);
  const body = z.object({ courseId: z.string().min(1), courseWorkId: z.string().optional() }).parse(req.body);
  let courseWorkId = body.courseWorkId;
  if (!courseWorkId) {
    const link = `${process.env.BASE_URL}/q/${quiz.publicSlug}`;
    courseWorkId = await classroom.createCourseWork(quiz, body.courseId, link);
  }
  const updated = await prisma.quiz.update({
    where: { id: quiz.id },
    data: { classroomCourseId: body.courseId, classroomCourseWorkId: courseWorkId },
  });
  res.json(updated);
}));

router.post('/quizzes/:id/export', wrap(async (req, res) => {
  const quiz = await ownQuiz(req);
  const { returnToStudents } = z.object({ returnToStudents: z.boolean().optional() }).parse(req.body || {});
  res.json(await classroom.exportGrades(quiz.id, { returnToStudents }));
}));

module.exports = router;
