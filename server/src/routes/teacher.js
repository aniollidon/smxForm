const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../db');
const classroom = require('../services/classroom');
const { computeAttemptScore } = require('../grading');
const { countBlanks } = require('../grading/blanks');
const { regradeAttempt, getGradingStatus } = require('../grading/regrade');
const { evaluateAnswers, llmOptions } = require('../services/llm');
const { validateDefinition, personalize, parseAnswer } = require('../grading/calculated');
const { requireTeacher } = require('../auth');
const { describeAnswer } = require('../services/linkedAnswer');

const router = express.Router();
router.use(requireTeacher);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, msg) => Object.assign(new Error(msg), { status });

const TYPES = ['MCQ', 'TRUE_FALSE', 'MATCHING', 'ORDERING', 'IMAGE_LABEL', 'SHORT_TEXT', 'LONG_TEXT', 'TABLE', 'IMAGE_UPLOAD', 'CALCULATED', 'DRAWING', 'FILL_BLANKS'];
const id = z.union([z.string(), z.number()]).transform(String);
const item = z.object({ id, text: z.string().max(500) });
const clipboardConfig = { allowClipboard: z.boolean().default(false) };

const configSchemas = {
  MCQ: z.object({ options: z.array(item).min(2).max(12), multiple: z.boolean().default(false), ...clipboardConfig }),
  TRUE_FALSE: z.object(clipboardConfig).passthrough(),
  MATCHING: z.object({ left: z.array(item).min(2).max(12), right: z.array(item).min(2).max(15), ...clipboardConfig }),
  ORDERING: z.object({ items: z.array(item.extend({ text: z.string().trim().min(1).max(500) })).min(2).max(30), ...clipboardConfig }),
  IMAGE_LABEL: z.object({
    points: z.array(z.object({ id, x: z.number().min(0).max(100), y: z.number().min(0).max(100), numeric: z.boolean().default(false) })).min(1).max(30),
    labels: z.array(z.string().max(100)).nullable().default(null),
    ...clipboardConfig,
  }),
  SHORT_TEXT: z.object({ numericAnswer: z.boolean().default(false), ...clipboardConfig }).passthrough(),
  FILL_BLANKS: z.object({ numericBlanks: z.array(z.boolean()).default([]), ...clipboardConfig }).passthrough(),
  CALCULATED: z.object({
    variables: z.array(z.object({
      name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,19}$/),
      mode: z.enum(['range', 'list']).default('range'),
      min: z.number().finite().optional(),
      max: z.number().finite().optional(),
      decimals: z.number().int().min(0).max(10).default(0),
      values: z.array(z.number().finite()).max(100).default([]),
    }).superRefine((variable, ctx) => {
      if (variable.mode === 'range' && (variable.min === undefined || variable.max === undefined)) {
        ctx.addIssue({ code: 'custom', message: 'El rang necessita mínim i màxim' });
      }
      if (variable.mode === 'list' && !variable.values.length) {
        ctx.addIssue({ code: 'custom', message: 'La llista necessita almenys un valor' });
      }
    }).transform((variable) => ({ ...variable, min: variable.min ?? 0, max: variable.max ?? 0 }))).min(1).max(20),
    numericAnswer: z.boolean().default(true),
    ...clipboardConfig,
  }),
  LONG_TEXT: z.object(clipboardConfig).passthrough(),
  TABLE: z.object({ columns: z.array(z.string().trim().min(1).max(200)).min(1).max(10), rows: z.array(z.string().trim().min(1).max(200)).min(1).max(20), ...clipboardConfig }),
  IMAGE_UPLOAD: z.object(clipboardConfig).passthrough(),
  DRAWING: z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#e11d48'), width: z.number().min(1).max(40).default(4), ...clipboardConfig }),
};
const keySchemas = {
  MCQ: z.object({ correct: z.array(id).min(1), allOrNothing: z.boolean().optional() }),
  TRUE_FALSE: z.object({ correct: z.boolean() }),
  MATCHING: z.object({ pairs: z.record(id), allOrNothing: z.boolean().default(false) }),
  ORDERING: z.object({ order: z.array(id).min(2).max(30), allOrNothing: z.boolean().default(false) }),
  IMAGE_LABEL: z.object({ labels: z.record(z.string()) }),
  SHORT_TEXT: z.object({ accepted: z.array(z.string()).default([]), regex: z.string().max(200).optional() }),
  FILL_BLANKS: z.object({ blanks: z.array(z.array(z.string().trim().min(1).max(200)).min(1).max(20)).min(1).max(20) }),
  CALCULATED: z.object({
    formula: z.string().trim().min(1).max(500),
    tolerance: z.number().min(0).max(1e9).default(0),
    toleranceType: z.enum(['nominal', 'relative']).default('nominal'),
  }),
  LONG_TEXT: z.object({ reference: z.string().optional() }).passthrough(),
  TABLE: z.object({ reference: z.string().max(5000).optional() }),
  IMAGE_UPLOAD: z.object({}).passthrough(),
  DRAWING: z.object({}).passthrough(),
};

const questionSchema = z.object({
  type: z.enum(TYPES),
  text: z.string().min(1).max(5000),
  imageUrl: z.string().regex(/^q_[a-f0-9]{32}\.(png|jpg|webp|gif)$/).nullable().optional(),
  points: z.number().min(0).max(1000).default(1),
  required: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
  linkedQuestionId: z.number().int().nullable().optional(),
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
  if (q.type === 'ORDERING') {
    const ids = new Set(q.config.items.map((entry) => entry.id));
    if (ids.size !== q.config.items.length || q.answerKey.order.length !== ids.size || !q.answerKey.order.every((entryId) => ids.has(entryId)) || new Set(q.answerKey.order).size !== ids.size) throw fail(400, 'Ordre invàlid');
  }
  if (q.type === 'DRAWING' && !q.imageUrl) throw fail(400, 'Cal una imatge base per dibuixar');
  if (q.type === 'FILL_BLANKS' && countBlanks(q.text) !== q.answerKey.blanks.length) throw fail(400, 'El nombre de buits de l’enunciat no coincideix amb les respostes');
  if (q.type === 'FILL_BLANKS' && q.config.numericBlanks.length > 0 && q.config.numericBlanks.length !== q.answerKey.blanks.length) throw fail(400, 'La configuració numèrica ha de tenir una entrada per buit');
  if (q.type === 'SHORT_TEXT' && q.config.numericAnswer && q.answerKey.accepted.some((answer) => !Number.isFinite(parseAnswer(answer)))) throw fail(400, 'Les respostes acceptades han de ser nombres');
  if (q.type === 'FILL_BLANKS' && q.answerKey.blanks.some((answers, index) => q.config.numericBlanks[index] && answers.some((answer) => !Number.isFinite(parseAnswer(answer))))) throw fail(400, 'Les respostes acceptades dels buits numèrics han de ser nombres');
  if (q.type === 'IMAGE_LABEL' && q.config.points.some((point) => point.numeric && !Number.isFinite(parseAnswer(q.answerKey.labels[point.id])))) throw fail(400, 'Les etiquetes dels punts numèrics han de ser nombres');
  if (q.type === 'CALCULATED') {
    const error = validateDefinition(q.text, q.config, q.answerKey);
    if (error) throw fail(400, error);
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
  showResults: z.enum(['NONE', 'SCORE', 'FULL', 'ANSWERS']).default('SCORE'),
  showResultsFrom: z.string().datetime().nullable().optional(),
  published: z.boolean().default(true),
});

const present = (q) => ({ ...q, config: JSON.parse(q.config), answerKey: JSON.parse(q.answerKey) });

// Amb ?seed=N, les preguntes calculades es mostren amb els valors d'aquesta llavor (previsualització).
const presentPreview = (q, req) => {
  const p = present(q);
  const seed = Number(req.query.seed);
  return Number.isInteger(seed) ? personalize(p, seed) : p;
};

async function ownQuiz(req, include) {
  const quiz = await prisma.quiz.findUnique({ where: { id: Number(req.params.id) }, include });
  if (!quiz || quiz.teacherId !== req.user.id) throw fail(404, 'Quiz no trobat');
  return quiz;
}

// La pregunta enllaçada ha de ser d'aquest quiz, diferent de la pròpia i anterior en l'ordre.
async function checkLink(quizId, linkedId, self) {
  if (linkedId == null) return;
  const linked = await prisma.question.findFirst({ where: { id: linkedId, quizId } });
  if (!linked || linked.id === self?.id || (self && linked.order >= self.order)) throw fail(400, 'Pregunta enllaçada invàlida');
}

// Desfà els enllaços que, després de reordenar, ja no apunten a una pregunta anterior.
async function dropInvalidLinks(quizId) {
  const questions = await prisma.question.findMany({ where: { quizId }, select: { id: true, order: true, linkedQuestionId: true } });
  const orderOf = new Map(questions.map((q) => [q.id, q.order]));
  const broken = questions.filter((q) => q.linkedQuestionId != null && !(orderOf.get(q.linkedQuestionId) < q.order)).map((q) => q.id);
  if (broken.length) await prisma.question.updateMany({ where: { id: { in: broken } }, data: { linkedQuestionId: null } });
}

// Resposta de l'alumne a la pregunta enllaçada, dins del mateix intent.
function linkedAnswerFor(question, questionsById, answersByQuestion, seed) {
  const linked = question.linkedQuestionId != null ? questionsById.get(question.linkedQuestionId) : null;
  if (!linked) return null;
  const answer = answersByQuestion.get(linked.id);
  return { question: personalize(present(linked), seed), value: answer ? JSON.parse(answer.value) : null, fileUrl: answer?.fileUrl ?? null };
}

async function gradingStatusFor(quiz) {
  const attempts = await prisma.attempt.findMany({
    where: { quizId: quiz.id, status: { not: 'IN_PROGRESS' } },
    select: { userId: true, status: true, score: true, submittedAt: true, gradedVersion: true, exportedAt: true, exportedScore: true },
  });
  return getGradingStatus(quiz, attempts);
}

router.get('/me', (req, res) => {
  res.json({ classroomConnected: !!req.user.googleTokens });
});

// Alumnes que el professorat pot veure "com si fos ells"
router.get('/students', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  const students = await prisma.user.findMany({
    where: {
      role: 'STUDENT',
      ...(q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {}),
    },
    orderBy: { email: 'asc' },
    take: 100,
    select: { id: true, email: true, name: true, _count: { select: { attempts: true } } },
  });
  res.json(students.map((student) => ({ id: student.id, email: student.email, name: student.name, attempts: student._count.attempts })));
}));

router.post('/impersonate', wrap(async (req, res, next) => {
  if (req.session.impersonatorId) throw fail(409, 'Ja estàs veient com a un alumne');
  const { userId } = z.object({ userId: z.number().int().positive() }).parse(req.body);
  const student = await prisma.user.findUnique({ where: { id: userId } });
  if (!student || student.role !== 'STUDENT') throw fail(404, 'Alumne no trobat');
  const teacherId = req.user.id;
  req.session.impersonatorId = teacherId;
  req.login(student, (err) => {
    if (err) {
      delete req.session.impersonatorId;
      return next(err);
    }
    res.json({ ok: true, student: { id: student.id, email: student.email, name: student.name } });
  });
}));

router.get('/llm-models', (req, res) => {
  res.json(llmOptions());
});

router.get('/quizzes', wrap(async (req, res) => {
  const quizzes = await prisma.quiz.findMany({
    where: { teacherId: req.user.id },
    orderBy: { createdAt: 'desc' },
    include: { classrooms: true, _count: { select: { questions: true, attempts: true } } },
  });
  const attempts = quizzes.length ? await prisma.attempt.findMany({
    where: { quizId: { in: quizzes.map((quiz) => quiz.id) }, status: { not: 'IN_PROGRESS' } },
    select: { quizId: true, userId: true, status: true, score: true, submittedAt: true, gradedVersion: true, exportedAt: true, exportedScore: true },
  }) : [];
  const attemptsByQuiz = new Map(quizzes.map((quiz) => [quiz.id, []]));
  for (const attempt of attempts) attemptsByQuiz.get(attempt.quizId).push(attempt);
  const enriched = quizzes.map((quiz) => ({ ...quiz, gradingStatus: getGradingStatus(quiz, attemptsByQuiz.get(quiz.id)) }));
  res.json(enriched);
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

router.get('/quizzes/by-slug/:slug', wrap(async (req, res) => {
  const quiz = await prisma.quiz.findFirst({
    where: { publicSlug: req.params.slug, teacherId: req.user.id },
    include: { questions: { orderBy: { order: 'asc' } }, groups: true },
  });
  if (!quiz) throw fail(404, 'Quiz no trobat');
  res.json({ ...quiz, questions: quiz.questions.map((q) => presentPreview(q, req)) });
}));

router.get('/quizzes/:id', wrap(async (req, res) => {
  const quiz = await ownQuiz(req, {
    classrooms: true,
    groups: true,
    questions: { orderBy: { order: 'asc' } },
    attempts: {
      where: { status: { not: 'IN_PROGRESS' } },
      select: { userId: true, status: true, score: true, submittedAt: true, gradedVersion: true, exportedAt: true, exportedScore: true },
    },
  });
  const { attempts, ...data } = quiz;
  res.json({ ...data, questions: quiz.questions.map((q) => presentPreview(q, req)), gradingStatus: getGradingStatus(quiz, attempts) });
}));

router.put('/quizzes/:id', wrap(async (req, res) => {
  const current = await ownQuiz(req);
  const data = quizSchema.parse(req.body);
  const scoringChanged = current.maxScore !== data.maxScore || current.negativePenalty !== data.negativePenalty;
  const quiz = await prisma.quiz.update({
    where: { id: Number(req.params.id) },
    data: {
      ...data,
      showResultsFrom: data.showResultsFrom ? new Date(data.showResultsFrom) : null,
      ...(scoringChanged ? { gradingVersion: { increment: 1 } } : {}),
    },
  });
  res.json(quiz);
}));

router.delete('/quizzes/:id', wrap(async (req, res) => {
  await ownQuiz(req);
  await prisma.quiz.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
}));

router.post('/quizzes/:id/duplicate', wrap(async (req, res) => {
  const src = await ownQuiz(req, { questions: true, groups: true });
  const { id: _i, createdAt, questions, groups, publicSlug, ...rest } = src;
  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.quiz.create({
      data: {
        ...rest,
        title: `${src.title} (còpia)`,
        published: false,
        publicSlug: crypto.randomBytes(8).toString('hex'),
      },
    });
    const groupIds = new Map();
    for (const group of groups) {
      groupIds.set(group.id, (await tx.questionGroup.create({ data: { quizId: created.id, text: group.text } })).id);
    }
    const questionIds = new Map();
    for (const { id: oldId, quizId, groupId, linkedQuestionId, ...q } of questions) {
      const copied = await tx.question.create({ data: { ...q, quizId: created.id, groupId: groupId ? groupIds.get(groupId) : null } });
      questionIds.set(oldId, copied.id);
    }
    for (const { id: oldId, linkedQuestionId } of questions) {
      if (linkedQuestionId != null && questionIds.has(linkedQuestionId)) {
        await tx.question.update({ where: { id: questionIds.get(oldId) }, data: { linkedQuestionId: questionIds.get(linkedQuestionId) } });
      }
    }
    return created;
  });
  res.status(201).json(copy);
}));

router.post('/quizzes/:id/questions', wrap(async (req, res) => {
  const quiz = await ownQuiz(req);
  const data = parseQuestion(req.body);
  const groupId = z.object({ groupId: z.number().int().nullable().optional() }).parse(req.body).groupId ?? null;
  const existing = await prisma.question.findMany({ where: { quizId: quiz.id }, orderBy: { order: 'asc' }, select: { id: true, groupId: true } });
  if (groupId !== null && !(await prisma.questionGroup.findFirst({ where: { id: groupId, quizId: quiz.id } }))) throw fail(400, 'Grup invàlid');
  await checkLink(quiz.id, data.linkedQuestionId);
  const [q] = await prisma.$transaction([
    prisma.question.create({ data: { ...data, quizId: quiz.id, groupId, order: existing.length } }),
    prisma.quiz.update({ where: { id: quiz.id }, data: { gradingVersion: { increment: 1 } } }),
  ]);
  if (groupId !== null) {
    // La pregunta nova va just després de l'última del grup.
    const ids = existing.map((x) => x.id);
    const lastMember = existing.reduce((last, x, i) => (x.groupId === groupId ? i : last), ids.length - 1);
    ids.splice(lastMember + 1, 0, q.id);
    await prisma.$transaction(ids.map((qid, order) => prisma.question.update({ where: { id: qid }, data: { order } })));
    await dropInvalidLinks(quiz.id);
  }
  res.status(201).json(present(q));
}));

async function dropEmptyGroups(quizId) {
  await prisma.questionGroup.deleteMany({ where: { quizId, questions: { none: {} } } });
}

router.post('/quizzes/:id/groups', wrap(async (req, res) => {
  const quiz = await ownQuiz(req);
  const { text } = z.object({ text: z.string().max(5000).default('') }).parse(req.body);
  res.status(201).json(await prisma.questionGroup.create({ data: { quizId: quiz.id, text } }));
}));

router.put('/groups/:gid', wrap(async (req, res) => {
  const group = await prisma.questionGroup.findUnique({ where: { id: Number(req.params.gid) }, include: { quiz: true } });
  if (!group || group.quiz.teacherId !== req.user.id) throw fail(404, 'Grup no trobat');
  const { text } = z.object({ text: z.string().max(5000) }).parse(req.body);
  res.json(await prisma.questionGroup.update({ where: { id: group.id }, data: { text } }));
}));

// Defineix d'una vegada l'ordre, les seccions i els grups de totes les preguntes.
router.put('/quizzes/:id/layout', wrap(async (req, res) => {
  const quiz = await ownQuiz(req, { questions: true, groups: true });
  const { items } = z.object({
    items: z.array(z.object({
      id: z.number().int(),
      sectionTitle: z.string().trim().max(200).nullable(),
      groupId: z.number().int().nullable(),
    })),
  }).parse(req.body);
  const valid = new Set(quiz.questions.map((q) => q.id));
  if (items.length !== valid.size || !items.every((x) => valid.has(x.id)) || new Set(items.map((x) => x.id)).size !== valid.size) throw fail(400, 'Llista invàlida');
  const groups = new Set(quiz.groups.map((g) => g.id));
  const closed = new Set();
  let previous = null;
  for (const x of items) {
    if (x.groupId !== null && !groups.has(x.groupId)) throw fail(400, 'Grup invàlid');
    if (x.groupId !== previous) {
      if (x.groupId !== null && closed.has(x.groupId)) throw fail(400, 'Les preguntes d’un grup han d’anar juntes');
      if (previous !== null) closed.add(previous);
    }
    // Una secció no pot començar enmig d'un grup.
    if (x.sectionTitle && x.groupId !== null && x.groupId === previous) throw fail(400, 'Una secció no pot començar enmig d’un grup');
    previous = x.groupId;
  }
  await prisma.$transaction(items.map((x, order) => prisma.question.update({
    where: { id: x.id },
    data: { order, groupId: x.groupId, sectionTitle: x.sectionTitle || null },
  })));
  await dropEmptyGroups(quiz.id);
  await dropInvalidLinks(quiz.id);
  res.json({ ok: true });
}));

async function ownQuestion(req) {
  const q = await prisma.question.findUnique({ where: { id: Number(req.params.qid) }, include: { quiz: true } });
  if (!q || q.quiz.teacherId !== req.user.id) throw fail(404, 'Pregunta no trobada');
  return q;
}

router.put('/questions/:qid', wrap(async (req, res) => {
  const current = await ownQuestion(req);
  const data = parseQuestion(req.body);
  await checkLink(current.quizId, data.linkedQuestionId, current);
  const [q] = await prisma.$transaction([
    prisma.question.update({ where: { id: Number(req.params.qid) }, data: { ...data, gradingVersion: { increment: 1 } } }),
    prisma.quiz.update({ where: { id: current.quizId }, data: { gradingVersion: { increment: 1 } } }),
  ]);
  res.json(present(q));
}));

router.delete('/questions/:qid', wrap(async (req, res) => {
  const question = await ownQuestion(req);
  await prisma.$transaction([
    prisma.question.delete({ where: { id: Number(req.params.qid) } }),
    prisma.quiz.update({ where: { id: question.quizId }, data: { gradingVersion: { increment: 1 } } }),
  ]);
  await dropEmptyGroups(question.quizId);
  res.json({ ok: true });
}));

router.put('/quizzes/:id/reorder', wrap(async (req, res) => {
  const quiz = await ownQuiz(req, { questions: true });
  const ids = z.array(z.number().int()).parse(req.body.ids);
  const valid = new Set(quiz.questions.map((q) => q.id));
  if (ids.length !== valid.size || !ids.every((i) => valid.has(i))) throw fail(400, 'Llista invàlida');
  await prisma.$transaction(ids.map((qid, order) => prisma.question.update({ where: { id: qid }, data: { order } })));
  await dropInvalidLinks(quiz.id);
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

router.post('/quizzes/:id/regrade', wrap(async (req, res) => {
  const quiz = await ownQuiz(req, { questions: true });
  const attempts = await prisma.attempt.findMany({
    where: { quizId: quiz.id, status: { not: 'IN_PROGRESS' }, gradedVersion: { lt: quiz.gradingVersion } },
    include: { answers: true },
  });
  let pendingReview = 0;
  for (const attempt of attempts) {
    const result = regradeAttempt(quiz, quiz.questions, attempt.answers, attempt.seed);
    await prisma.$transaction(async (tx) => {
      for (const update of result.answerUpdates) {
        await tx.answer.update({ where: { id: update.id }, data: update.data });
      }
      await tx.attempt.update({
        where: { id: attempt.id },
        data: { score: result.score, status: result.status, gradedVersion: result.gradedVersion },
      });
    });
    if (result.status === 'NEEDS_REVIEW') pendingReview++;
  }
  res.json({ regraded: attempts.length, pendingReview });
}));

router.get('/attempts/:aid', wrap(async (req, res) => {
  const a = await prisma.attempt.findUnique({
    where: { id: Number(req.params.aid) },
    include: { quiz: { include: { groups: true, questions: true } }, user: { select: { email: true, name: true } }, answers: { include: { question: true } } },
  });
  if (!a || a.quiz.teacherId !== req.user.id) throw fail(404, 'Intent no trobat');
  const questionsById = new Map(a.quiz.questions.map((q) => [q.id, q]));
  const answersByQuestion = new Map(a.answers.map((x) => [x.questionId, x]));
  const { questions: _questions, ...quiz } = a.quiz;
  res.json({
    ...a,
    quiz,
    answers: a.answers.map((x) => ({
      ...x,
      value: JSON.parse(x.value),
      question: personalize(present(x.question), a.seed),
      linkedAnswer: linkedAnswerFor(x.question, questionsById, answersByQuestion, a.seed),
    })),
  });
}));

router.delete('/attempts/:aid', wrap(async (req, res) => {
  const a = await prisma.attempt.findUnique({ where: { id: Number(req.params.aid) }, include: { quiz: true } });
  if (!a || a.quiz.teacherId !== req.user.id) throw fail(404, 'Intent no trobat');
  await prisma.attempt.delete({ where: { id: a.id } });
  res.json({ ok: true });
}));

router.get('/questions/:qid/answers', wrap(async (req, res) => {
  const question = await ownQuestion(req);
  const answers = await prisma.answer.findMany({
    where: { questionId: question.id, attempt: { status: { not: 'IN_PROGRESS' } } },
    include: { attempt: { include: { user: { select: { name: true, email: true } } } }, llmRun: { select: { provider: true, model: true, webSearch: true, prompt: true, response: true, createdAt: true } } },
    orderBy: { id: 'desc' },
  });
  const linkedQuestion = question.linkedQuestionId != null ? await prisma.question.findUnique({ where: { id: question.linkedQuestionId } }) : null;
  const linkedAnswers = linkedQuestion ? await prisma.answer.findMany({ where: { questionId: linkedQuestion.id, attemptId: { in: answers.map((answer) => answer.attemptId) } } }) : [];
  const linkedByAttempt = new Map(linkedAnswers.map((answer) => [answer.attemptId, answer]));
  res.json({
    question: present(question),
    quizId: question.quizId,
    answers: answers.map((answer) => ({
      ...answer,
      value: JSON.parse(answer.value),
      linkedAnswer: linkedQuestion ? linkedAnswerFor(question, new Map([[linkedQuestion.id, linkedQuestion]]), new Map([[linkedQuestion.id, linkedByAttempt.get(answer.attemptId)]]), answer.attempt.seed) : null,
    })),
  });
}));

router.put('/questions/:qid/grading-criteria', wrap(async (req, res) => {
  const question = await ownQuestion(req);
  if (!['SHORT_TEXT', 'LONG_TEXT', 'TABLE'].includes(question.type)) throw fail(400, 'L’avaluació assistida només està disponible per a respostes de text i taules');
  const body = z.object({ criteria: z.string().max(5000) }).parse(req.body);
  const updated = await prisma.question.update({
    where: { id: question.id },
    data: { gradingCriteria: body.criteria.trim() || null },
  });
  res.json({ gradingCriteria: updated.gradingCriteria });
}));

router.post('/questions/:qid/ai-grade', wrap(async (req, res) => {
  const question = await ownQuestion(req);
  if (!['SHORT_TEXT', 'LONG_TEXT', 'TABLE'].includes(question.type)) throw fail(400, 'L’avaluació assistida només està disponible per a respostes de text i taules');
  const body = z.object({ answerIds: z.array(z.number().int().positive()).min(1).max(100), model: z.string().max(100).optional(), webSearch: z.boolean().optional().default(false) }).parse(req.body);
  if (new Set(body.answerIds).size !== body.answerIds.length) throw fail(400, 'La selecció conté respostes duplicades');
  const answers = await prisma.answer.findMany({
    where: {
      id: { in: body.answerIds },
      questionId: question.id,
      attempt: { status: { not: 'IN_PROGRESS' } },
    },
    include: { attempt: { select: { seed: true } } },
  });
  if (answers.length !== body.answerIds.length) throw fail(400, 'La selecció inclou respostes que no pertanyen a aquesta pregunta o no s’han lliurat');
  const answerById = new Map(answers.map((answer) => [answer.id, answer]));
  const questionConfig = JSON.parse(question.config);
  const linkedQuestion = question.linkedQuestionId != null ? await prisma.question.findUnique({ where: { id: question.linkedQuestionId } }) : null;
  const linkedAnswers = linkedQuestion ? await prisma.answer.findMany({ where: { questionId: linkedQuestion.id, attemptId: { in: answers.map((answer) => answer.attemptId) } } }) : [];
  const linkedByAttempt = new Map(linkedAnswers.map((answer) => [answer.attemptId, answer]));
  const linkedContext = (answer) => {
    if (!linkedQuestion) return {};
    const personalized = personalize(present(linkedQuestion), answer.attempt.seed);
    const linked = linkedByAttempt.get(answer.attemptId);
    return { previousQuestion: personalized.text, previousAnswer: describeAnswer(personalized, linked ? JSON.parse(linked.value) : null) };
  };
  const selected = body.answerIds.map((answerId) => {
    const answer = answerById.get(answerId);
    const value = JSON.parse(answer.value);
    if (question.type === 'TABLE') {
      const validTable = Array.isArray(value)
        && value.length === questionConfig.rows.length
        && value.every((row) => Array.isArray(row)
          && row.length === questionConfig.columns.length
          && row.every((cell) => typeof cell === 'string' && cell.length <= 1000));
      if (!validTable || !value.some((row) => row.some((cell) => cell.trim()))) throw fail(400, 'No es poden avaluar respostes de taula buides o invàlides');
      return {
        answerId: answer.id,
        value: {
          columns: questionConfig.columns,
          rows: questionConfig.rows.map((label, index) => ({ label, cells: questionConfig.columns.map((column, j) => ({ column, value: value[index][j] })) })),
        },
        ...linkedContext(answer),
      };
    }
    if (typeof value !== 'string' || !value.trim()) throw fail(400, 'No es poden avaluar respostes buides o no textuals');
    return { answerId: answer.id, value, ...linkedContext(answer) };
  });

  const answerKey = JSON.parse(question.answerKey);
  const expectedAnswer = ['LONG_TEXT', 'TABLE'].includes(question.type)
    ? answerKey.reference || ''
    : { accepted: answerKey.accepted || [], ...(answerKey.regex ? { regex: answerKey.regex } : {}) };
  const evaluations = [];
  const { provider, models } = llmOptions();
  const model = body.model || models[0];
  if (!models.includes(model)) throw fail(400, 'Model no disponible per a aquest proveïdor');
  const llmConfig = { apiKey: provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY, model };
  const webSearch = body.webSearch === true;
  const traces = [];
  for (let offset = 0; offset < selected.length; offset += 20) {
    const batch = selected.slice(offset, offset + 20);
    let trace = null;
    evaluations.push(...await evaluateAnswers({
      provider,
      ...llmConfig,
      webSearch,
      questionText: question.text,
      expectedAnswer,
      maxPoints: question.points,
      criteria: question.gradingCriteria || 'Avalua l’exactitud, la pertinència i la completesa de la resposta respecte de l’enunciat i la resposta esperada. Assigna una puntuació proporcional als punts assolits i justifica-la breument.',
      answers: batch,
      onTrace: (value) => { trace = value; },
    }));
    traces.push({ trace, answerIds: batch.map((answer) => answer.answerId) });
  }
  // Una fila per crida: el prompt i la resposta crua es desen un sol cop per lot.
  const runIds = new Map();
  for (const { trace, answerIds } of traces) {
    if (!trace) continue;
    const run = await prisma.llmRun.create({
      data: { questionId: question.id, provider, model, webSearch, prompt: trace.prompt, response: trace.response },
    });
    for (const answerId of answerIds) runIds.set(answerId, run.id);
  }
  const affectedAttemptIds = [...new Set(answers.map((answer) => answer.attemptId))];
  await prisma.$transaction(async (tx) => {
    for (const evaluation of evaluations) {
      await tx.answer.update({
        where: { id: evaluation.answerId },
        data: {
          score: evaluation.score,
          feedback: evaluation.feedback,
          needsReview: false,
          manuallyReviewed: false,
          llmReviewed: true,
          llmRunId: runIds.get(evaluation.answerId) ?? null,
          questionGradingVersion: question.gradingVersion,
        },
      });
    }
    for (const attemptId of affectedAttemptIds) await recomputeAttempt(attemptId, tx);
  });
  res.json({ evaluations: evaluations.map(({ answerId }) => ({ answerId, llmReviewed: true })) });
}));

router.post('/questions/:qid/manual-grade', wrap(async (req, res) => {
  const question = await ownQuestion(req);
  const body = z.object({
    answerIds: z.array(z.number().int().positive()).min(1).max(100),
    score: z.number().min(0).max(question.points),
    feedback: z.string().max(2000).optional().default(''),
  }).parse(req.body);
  if (new Set(body.answerIds).size !== body.answerIds.length) throw fail(400, 'La selecció conté respostes duplicades');
  const answers = await prisma.answer.findMany({
    where: {
      id: { in: body.answerIds },
      questionId: question.id,
      attempt: { status: { not: 'IN_PROGRESS' } },
    },
  });
  if (answers.length !== body.answerIds.length) throw fail(400, 'La selecció inclou respostes que no pertanyen a aquesta pregunta o no s’han lliurat');
  const affectedAttemptIds = [...new Set(answers.map((answer) => answer.attemptId))];
  await prisma.$transaction(async (tx) => {
    await tx.answer.updateMany({
      where: { id: { in: body.answerIds } },
      data: {
        score: body.score,
        feedback: body.feedback,
        needsReview: false,
        questionGradingVersion: question.gradingVersion,
        manuallyReviewed: true,
        llmReviewed: false,
      },
    });
    for (const attemptId of affectedAttemptIds) await recomputeAttempt(attemptId, tx);
  });
  res.json({ reviewed: answers.length });
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
    data: {
      score: body.score,
      feedback: body.feedback ?? null,
      needsReview: false,
      questionGradingVersion: ans.question.gradingVersion,
      manuallyReviewed: true,
      llmReviewed: false,
    },
  });
  const attempt = await recomputeAttempt(ans.attemptId);
  res.json(attempt);
}));

async function recomputeAttempt(attemptId, db = prisma) {
  const attempt = await db.attempt.findUnique({
    where: { id: attemptId },
    include: { quiz: { include: { questions: true } }, answers: true },
  });
  const map = new Map(attempt.answers.map((a) => [a.questionId, a]));
  const { score, pending } = computeAttemptScore(attempt.quiz, attempt.quiz.questions, map);
  return db.attempt.update({
    where: { id: attemptId },
    data: {
      score: pending ? null : score,
      status: pending ? 'NEEDS_REVIEW' : 'GRADED',
      gradedVersion: attempt.gradedVersion,
    },
  });
}

// Classroom
router.get('/classroom/courses', wrap(async (req, res) => {
  res.json(await classroom.listCourses(req.user.id));
}));

router.post('/quizzes/:id/classroom', wrap(async (req, res) => {
  const quiz = await ownQuiz(req);
  const body = z.object({ courseId: z.string().min(1), courseName: z.string().max(200).optional(), courseWorkId: z.string().optional() }).parse(req.body);
  const existing = await prisma.quizClassroom.findUnique({ where: { quizId_courseId: { quizId: quiz.id, courseId: body.courseId } } });
  if (existing) throw fail(409, 'Aquest curs ja està vinculat');
  let courseWorkId = body.courseWorkId;
  if (!courseWorkId) {
    const link = `${process.env.BASE_URL}/q/${quiz.publicSlug}`;
    courseWorkId = await classroom.createCourseWork(quiz, body.courseId, link);
  }
  const created = await prisma.quizClassroom.create({
    data: { quizId: quiz.id, courseId: body.courseId, courseWorkId, courseName: body.courseName || '' },
  });
  res.json(created);
}));

router.delete('/quizzes/:id/classroom/:courseId', wrap(async (req, res) => {
  const quiz = await ownQuiz(req);
  await prisma.quizClassroom.deleteMany({ where: { quizId: quiz.id, courseId: req.params.courseId } });
  res.json({ ok: true });
}));

router.post('/quizzes/:id/export', wrap(async (req, res) => {
  const quiz = await ownQuiz(req);
  const status = await gradingStatusFor(quiz);
  if (status.needsRegrade > 0) throw fail(409, 'Reavalua els intents abans d’exportar les notes a Classroom');
  if (status.pendingReview > 0) throw fail(409, 'Revisa les respostes manuals abans d’actualitzar les notes a Classroom');
  const { returnToStudents } = z.object({ returnToStudents: z.boolean().optional() }).parse(req.body || {});
  res.json(await classroom.exportGrades(quiz.id, { returnToStudents }));
}));

module.exports = router;
