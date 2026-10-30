const { google } = require('googleapis');
const prisma = require('../db');
const { pickExportTargets } = require('./exportPlan');

const CLASSROOM_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
];

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BASE_URL}/auth/classroom/callback`
  );
}

function authUrl(state) {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: CLASSROOM_SCOPES,
    hd: process.env.ALLOWED_DOMAIN,
    state,
  });
}

async function saveTokensFromCode(userId, code) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const prev = user.googleTokens ? JSON.parse(user.googleTokens) : {};
  const merged = { ...prev, ...tokens, refresh_token: tokens.refresh_token || prev.refresh_token };
  await prisma.user.update({ where: { id: userId }, data: { googleTokens: JSON.stringify(merged) } });
}

async function classroomFor(teacherId) {
  const user = await prisma.user.findUnique({ where: { id: teacherId } });
  if (!user?.googleTokens) {
    const e = new Error('El professor no ha connectat Google Classroom');
    e.status = 409;
    throw e;
  }
  const client = oauthClient();
  client.setCredentials(JSON.parse(user.googleTokens));
  client.on('tokens', async (t) => {
    const cur = JSON.parse((await prisma.user.findUnique({ where: { id: teacherId } })).googleTokens);
    await prisma.user.update({ where: { id: teacherId }, data: { googleTokens: JSON.stringify({ ...cur, ...t }) } });
  });
  return google.classroom({ version: 'v1', auth: client });
}

async function listCourses(teacherId) {
  const c = await classroomFor(teacherId);
  const r = await c.courses.list({ teacherId: 'me', courseStates: ['ACTIVE'] });
  return (r.data.courses || []).map((x) => ({ id: x.id, name: x.name, section: x.section }));
}

// Crea una tasca (esborrany) amb el mateix nom que el quiz
async function createCourseWork(quiz, courseId, link) {
  const c = await classroomFor(quiz.teacherId);
  const r = await c.courses.courseWork.create({
    courseId,
    requestBody: {
      title: quiz.title,
      description: quiz.description || undefined,
      workType: 'ASSIGNMENT',
      state: 'DRAFT',
      maxPoints: quiz.maxScore,
      materials: [{ link: { url: link, title: quiz.title } }],
    },
  });
  return r.data.id;
}

function dueDateOf(cw) {
  if (!cw.dueDate) return null;
  const t = cw.dueTime || {};
  return new Date(Date.UTC(cw.dueDate.year, cw.dueDate.month - 1, cw.dueDate.day, t.hours ?? 23, t.minutes ?? 59));
}

// Entre el termini de la tasca i la pròrroga manual de l'alumne mana el més permissiu.
// Sense termini a la tasca no hi ha límit, així que cap pròrroga el pot escurçar.
function latestDeadline(due, extensionUntil) {
  if (!due) return null;
  if (!extensionUntil) return due;
  const extension = new Date(extensionUntil);
  if (Number.isNaN(extension.getTime()) || extension <= due) return due;
  return extension;
}

async function studentSubmission(c, link, email) {
  try {
    const subs = await c.courses.courseWork.studentSubmissions.list({
      courseId: link.courseId,
      courseWorkId: link.courseWorkId,
      userId: email,
    });
    return (subs.data.studentSubmissions || [])[0] || null;
  } catch (e) {
    return null;
  }
}

async function checkLink(c, link, extensionUntil = null) {
  const cw = (await c.courses.courseWork.get({ courseId: link.courseId, id: link.courseWorkId })).data;
  if (cw.state !== 'PUBLISHED') return { ok: false, reason: 'La tasca encara no està publicada al Classroom' };
  const until = latestDeadline(dueDateOf(cw), extensionUntil);
  if (until && new Date() > until) return { ok: false, reason: 'S\'ha acabat el termini de la tasca' };
  if (cw.scheduledTime && new Date(cw.scheduledTime) > new Date()) return { ok: false, reason: 'La tasca encara no està disponible' };
  return { ok: true };
}

// Alumnes matriculats als cursos indicats, sense duplicats entre cursos.
// Si un curs falla (esborrat, sense permisos) es fa servir la resta, però si fallen tots es propaga l'error.
async function listStudents(teacherId, courseIds) {
  const c = await classroomFor(teacherId);
  const out = new Map();
  let firstError = null;
  let done = 0;
  for (const courseId of courseIds) {
    try {
      let pageToken;
      do {
        const r = await c.courses.students.list({ courseId, pageSize: 100, pageToken });
        for (const student of r.data.students || []) {
          const email = String(student.profile?.emailAddress || '').toLowerCase();
          if (!email || out.has(email)) continue;
          out.set(email, { email, name: student.profile?.name?.fullName || '', courseId });
        }
        pageToken = r.data.nextPageToken;
      } while (pageToken);
      done++;
    } catch (e) {
      firstError ||= e;
    }
  }
  if (!done && firstError) throw firstError;
  return [...out.values()].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'ca', { sensitivity: 'base' }));
}

// Retorna { ok, reason }: l'alumne ha d'estar assignat a la tasca d'algun curs vinculat i aquesta ha d'estar oberta
// (o bé el professor li ha donat una pròrroga que encara no ha vençut).
async function checkStudentAccess(quiz, email) {
  const links = await prisma.quizClassroom.findMany({ where: { quizId: quiz.id } });
  if (!links.length) return { ok: true };
  const extension = await prisma.quizExtension.findUnique({
    where: { quizId_email: { quizId: quiz.id, email: String(email).toLowerCase() } },
    select: { expiresAt: true },
  });
  const c = await classroomFor(quiz.teacherId);
  let firstReason = null;
  for (const link of links) {
    if (!(await studentSubmission(c, link, email))) continue;
    const r = await checkLink(c, link, extension?.expiresAt ?? null);
    if (r.ok) return r;
    firstReason ||= r.reason;
  }
  return { ok: false, reason: firstReason || 'No tens aquesta tasca assignada' };
}

// Exporta nota (millor o última) de cada alumne al curs o cursos on és.
// `onEvent` rep l'inici i el resultat de cada alumne; `shouldStop` permet cancel·lar entre alumnes.
async function exportGrades(quizId, { returnToStudents = false, skipUnchanged = false, onEvent = () => {}, shouldStop = () => false } = {}) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  const links = await prisma.quizClassroom.findMany({ where: { quizId } });
  if (!links.length) {
    const e = new Error('El quiz no està vinculat a cap tasca');
    e.status = 409;
    throw e;
  }
  const attempts = await prisma.attempt.findMany({
    where: { quizId, score: { not: null }, status: { in: ['SUBMITTED', 'GRADED'] } },
    include: { user: true },
    orderBy: { submittedAt: 'asc' },
  });
  // Reprendre només té sentit si no s'han de retornar les tasques: retornar no es pot detectar a la BD.
  const targets = pickExportTargets(quiz, attempts, { skipUnchanged: skipUnchanged && !returnToStudents });
  const total = targets.length;
  onEvent({ type: 'start', total, skipped: targets.filter((t) => t.skip).length, courses: links.length, courseNames: links.map((l) => l.courseName || l.courseId) });
  const c = await classroomFor(quiz.teacherId);
  const results = [];
  for (const [index, { attempt: a, skip }] of targets.entries()) {
    if (shouldStop()) {
      onEvent({ type: 'stopped', index, total });
      break;
    }
    const name = a.user.name || '';
    if (skip) {
      results.push({ email: a.user.email, name, score: a.score, ok: true, skipped: true });
      onEvent({ type: 'studentDone', index: index + 1, total, email: a.user.email, name, score: a.score, ok: true, skipped: true, ms: 0 });
      continue;
    }
    onEvent({ type: 'student', index: index + 1, total, email: a.user.email, name });
    const startedAt = Date.now();
    try {
      let exported = 0;
      for (const link of links) {
        const sub = await studentSubmission(c, link, a.user.email);
        if (!sub) continue;
        await c.courses.courseWork.studentSubmissions.patch({
          courseId: link.courseId,
          courseWorkId: link.courseWorkId,
          id: sub.id,
          updateMask: 'assignedGrade,draftGrade',
          requestBody: { assignedGrade: a.score, draftGrade: a.score },
        });
        if (returnToStudents) {
          await c.courses.courseWork.studentSubmissions.return({
            courseId: link.courseId,
            courseWorkId: link.courseWorkId,
            id: sub.id,
            requestBody: {},
          });
        }
        exported++;
      }
      if (!exported) throw new Error('Sense submission');
      await prisma.attempt.update({ where: { id: a.id }, data: { exportedAt: new Date(), exportedScore: a.score } });
      results.push({ email: a.user.email, name, score: a.score, ok: true });
      onEvent({ type: 'studentDone', index: index + 1, total, email: a.user.email, name, score: a.score, ok: true, ms: Date.now() - startedAt });
    } catch (e) {
      results.push({ email: a.user.email, name, score: a.score, ok: false, error: e.message });
      onEvent({ type: 'studentDone', index: index + 1, total, email: a.user.email, name, score: a.score, ok: false, error: e.message, ms: Date.now() - startedAt });
    }
  }
  return results;
}

module.exports = { authUrl, saveTokensFromCode, listCourses, listStudents, createCourseWork, checkStudentAccess, exportGrades, latestDeadline };
