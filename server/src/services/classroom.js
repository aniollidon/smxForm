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

// Alumnes matriculats al curs, amb nom i correu. Requereix el permís de rosters.
async function rosterOf(c, courseId) {
  const list = new Map();
  let skipped = 0;
  let raw = 0;
  let pageToken;
  do {
    const r = await c.courses.students.list({ courseId, pageSize: 100, pageToken });
    const page = r.data.students || [];
    raw += page.length;
    for (const student of page) {
      // `userId` és el correu en els comptes de Workspace; `profile.emailAddress` pot venir buit.
      const email = String(student.profile?.emailAddress || student.userId || '').toLowerCase();
      if (!email.includes('@')) {
        skipped++;
        continue;
      }
      list.set(email, { email, name: student.profile?.name?.fullName || '', courseId });
    }
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  return { list, skipped, raw };
}

// Cada alumne assignat a la tasca té un enviament, així que serveixen de recanvi quan no es pot
// llegir el roster. Només donen el correu (userId), no el nom.
async function assigneesOf(c, link) {
  const assignees = new Map();
  let pageToken;
  do {
    const r = await c.courses.courseWork.studentSubmissions.list({
      courseId: link.courseId,
      courseWorkId: link.courseWorkId,
      pageSize: 100,
      pageToken,
    });
    for (const submission of r.data.studentSubmissions || []) {
      const email = String(submission.userId || '').toLowerCase();
      if (email.includes('@')) assignees.set(email, { email, name: '', courseId: link.courseId });
    }
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  return assignees;
}

function googleError(e) {
  const status = e?.response?.status || (typeof e?.code === 'number' ? e.code : null);
  const message = e?.response?.data?.error?.message || e?.message || 'Error de Classroom';
  return status ? `${message} (${status})` : message;
}

async function tokenScopes(teacherId) {
  const user = await prisma.user.findUnique({ where: { id: teacherId }, select: { googleTokens: true } });
  if (!user?.googleTokens) return '';
  try {
    return String(JSON.parse(user.googleTokens).scope || '');
  } catch {
    return '';
  }
}

// Els tokens concedits abans d'afegir el permís de rosters no el tenen: cal tornar a connectar.
async function missingRosterScope(teacherId) {
  const scopes = await tokenScopes(teacherId);
  return !scopes.includes('https://www.googleapis.com/auth/classroom.rosters.readonly');
}

// Assignats individualment a la tasca (null si la tasca és per a tot el curs).
async function individualAssignees(c, link) {
  const cw = (await c.courses.courseWork.get({ courseId: link.courseId, id: link.courseWorkId })).data;
  const ids = (cw.assignees || [])
    .map((assignee) => String(assignee.userId || '').toLowerCase())
    .filter((userId) => userId.includes('@'));
  return cw.assigneeMode === 'INDIVIDUAL' && ids.length ? new Set(ids) : null;
}

// Alumnes dels cursos vinculats, sense duplicats entre cursos. Retorna també l'estat de cada curs
// perquè la interfície pugui explicar per què no apareix ningú.
// No mira si l'alumne ha entrat mai a l'aplicació: només cal que tingui la tasca assignada.
async function listStudents(teacherId, links) {
  const c = await classroomFor(teacherId);
  const students = new Map();
  const courses = [];
  for (const link of links) {
    const entry = { courseId: link.courseId, courseWorkId: link.courseWorkId, ok: false, count: 0, raw: 0, skipped: 0, source: 'roster', error: null };
    try {
      const { list: roster, skipped, raw } = await rosterOf(c, link.courseId);
      entry.skipped = skipped;
      entry.raw = raw;
      // Si la tasca és només per a alguns alumnes, el roster sencer no serveix.
      const assignees = await individualAssignees(c, link).catch(() => null);
      if (assignees) entry.source = 'assignees';
      let assigned = new Map();
      for (const [email, student] of roster) if (!assignees || assignees.has(email)) assigned.set(email, student);
      if (assignees) for (const email of assignees) if (!assigned.has(email)) assigned.set(email, { email, name: '', courseId: link.courseId });
      // Un roster buit pot voler dir que el centre en restringeix la lectura: proven els enviaments.
      if (!assigned.size) {
        const fallback = await assigneesOf(c, link).catch(() => null);
        if (fallback?.size) {
          assigned = fallback;
          entry.source = 'submissions';
          entry.raw = Math.max(entry.raw, fallback.size);
        }
      }
      for (const [email, student] of assigned) if (!students.has(email)) students.set(email, student);
      entry.count = assigned.size;
      entry.ok = true;
    } catch (e) {
      entry.error = googleError(e);
      try {
        const assignees = await individualAssignees(c, link).catch(() => null);
        entry.source = assignees ? 'assignees' : 'submissions';
        const fallback = assignees || (await assigneesOf(c, link));
        for (const email of fallback.keys()) if (!students.has(email)) students.set(email, { email, name: '', courseId: link.courseId });
        entry.count = fallback.size;
        entry.raw = fallback.size;
        entry.ok = true;
      } catch (fallbackError) {
        entry.error = `${entry.error} · ${googleError(fallbackError)}`;
      }
    }
    courses.push(entry);
  }
  if (courses.length && courses.every((course) => !course.ok)) {
    throw Object.assign(new Error(`No s’ha pogut llegir la llista d’alumnes del Classroom: ${courses[0].error}`), { status: 409 });
  }
  const sorted = [...students.values()].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'ca', { sensitivity: 'base' }));
  return { students: sorted, courses, needsReconnect: courses.some((course) => course.source === 'submissions') };
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

module.exports = { authUrl, saveTokensFromCode, listCourses, listStudents, missingRosterScope, createCourseWork, checkStudentAccess, exportGrades, latestDeadline };
