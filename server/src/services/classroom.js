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

async function checkLink(c, link) {
  const cw = (await c.courses.courseWork.get({ courseId: link.courseId, id: link.courseWorkId })).data;
  if (cw.state !== 'PUBLISHED') return { ok: false, reason: 'La tasca encara no està publicada al Classroom' };
  const due = dueDateOf(cw);
  if (due && new Date() > due) return { ok: false, reason: 'S\'ha acabat el termini de la tasca' };
  if (cw.scheduledTime && new Date(cw.scheduledTime) > new Date()) return { ok: false, reason: 'La tasca encara no està disponible' };
  return { ok: true };
}

// Retorna { ok, reason }: l'alumne ha d'estar assignat a la tasca d'algun curs vinculat i aquesta ha d'estar oberta
async function checkStudentAccess(quiz, email) {
  const links = await prisma.quizClassroom.findMany({ where: { quizId: quiz.id } });
  if (!links.length) return { ok: true };
  const c = await classroomFor(quiz.teacherId);
  let firstReason = null;
  for (const link of links) {
    if (!(await studentSubmission(c, link, email))) continue;
    const r = await checkLink(c, link);
    if (r.ok) return r;
    firstReason ||= r.reason;
  }
  return { ok: false, reason: firstReason || 'No tens aquesta tasca assignada' };
}

// Exporta nota (millor o última) de cada alumne al curs o cursos on és
async function exportGrades(quizId, { returnToStudents = false } = {}) {
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
  const byUser = new Map();
  for (const a of attempts) {
    const cur = byUser.get(a.userId);
    if (!cur || quiz.gradeToExport === 'LAST' || a.score > cur.score) byUser.set(a.userId, a);
  }
  const c = await classroomFor(quiz.teacherId);
  const results = [];
  for (const a of byUser.values()) {
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
      results.push({ email: a.user.email, score: a.score, ok: true });
    } catch (e) {
      results.push({ email: a.user.email, score: a.score, ok: false, error: e.message });
    }
  }
  return results;
}

module.exports = { authUrl, saveTokensFromCode, listCourses, createCourseWork, checkStudentAccess, exportGrades };
