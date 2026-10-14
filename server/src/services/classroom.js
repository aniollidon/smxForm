const { google } = require('googleapis');
const prisma = require('../db');

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

// Retorna { ok, reason } segons assignaciÃ³ de l'alumne i dates de la tasca
async function checkStudentAccess(quiz, email) {
  if (!quiz.classroomCourseId || !quiz.classroomCourseWorkId) return { ok: true };
  const c = await classroomFor(quiz.teacherId);
  const cw = (await c.courses.courseWork.get({ courseId: quiz.classroomCourseId, id: quiz.classroomCourseWorkId })).data;
  if (cw.state !== 'PUBLISHED') return { ok: false, reason: 'La tasca encara no estÃ  publicada al Classroom' };
  const due = dueDateOf(cw);
  if (due && new Date() > due) return { ok: false, reason: 'S\'ha acabat el termini de la tasca' };
  if (cw.scheduledTime && new Date(cw.scheduledTime) > new Date()) return { ok: false, reason: 'La tasca encara no estÃ  disponible' };
  try {
    const subs = await c.courses.courseWork.studentSubmissions.list({
      courseId: quiz.classroomCourseId,
      courseWorkId: quiz.classroomCourseWorkId,
      userId: email,
    });
    if (!(subs.data.studentSubmissions || []).length) return { ok: false, reason: 'No tens aquesta tasca assignada' };
  } catch (e) {
    return { ok: false, reason: 'No tens aquesta tasca assignada' };
  }
  return { ok: true };
}

// Exporta nota (millor o Ãºltima) de cada alumne
async function exportGrades(quizId, { returnToStudents = false } = {}) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz.classroomCourseId || !quiz.classroomCourseWorkId) {
    const e = new Error('El quiz no estÃ  vinculat a cap tasca');
    e.status = 409;
    throw e;
  }
  const attempts = await prisma.attempt.findMany({
    where: { quizId, score: { not: null }, status: { in: ['SUBMITTED', 'GRADED'] } },
    include: { user: true },
    orderBy: { submittedAt: 'asc' },
  });
  const byUser = new Map();
  for (const a of attempts) {
    const cur = byUser.get(a.userId);
    if (!cur || quiz.gradeToExport === 'LAST' || a.score > cur.score) byUser.set(a.userId, a);
  }
  const c = await classroomFor(quiz.teacherId);
  const results = [];
  for (const a of byUser.values()) {
    try {
      const subs = await c.courses.courseWork.studentSubmissions.list({
        courseId: quiz.classroomCourseId,
        courseWorkId: quiz.classroomCourseWorkId,
        userId: a.user.email,
      });
      const sub = (subs.data.studentSubmissions || [])[0];
      if (!sub) throw new Error('Sense submission');
      await c.courses.courseWork.studentSubmissions.patch({
        courseId: quiz.classroomCourseId,
        courseWorkId: quiz.classroomCourseWorkId,
        id: sub.id,
        updateMask: 'assignedGrade,draftGrade',
        requestBody: { assignedGrade: a.score, draftGrade: a.score },
      });
      if (returnToStudents) {
        await c.courses.courseWork.studentSubmissions.return({
          courseId: quiz.classroomCourseId,
          courseWorkId: quiz.classroomCourseWorkId,
          id: sub.id,
          requestBody: {},
        });
      }
      await prisma.attempt.update({ where: { id: a.id }, data: { exportedAt: new Date(), exportedScore: a.score } });
      results.push({ email: a.user.email, score: a.score, ok: true });
    } catch (e) {
      results.push({ email: a.user.email, score: a.score, ok: false, error: e.message });
    }
  }
  return results;
}

module.exports = { authUrl, saveTokensFromCode, listCourses, createCourseWork, checkStudentAccess, exportGrades };
