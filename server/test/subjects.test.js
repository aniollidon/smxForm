const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const express = require('express');
const { ZodError } = require('zod');

test('library classes migrate, follow quiz lifecycle and remain private to each teacher', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'palamform-subjects-'));
  const schema = fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');
  const oldSchemaPath = path.join(dir, 'old.prisma');
  const schemaPath = path.join(dir, 'schema.prisma');
  fs.writeFileSync(oldSchemaPath, schema.replace('  subject               String     @default("General")\n', ''));
  fs.writeFileSync(schemaPath, schema);
  const env = { ...process.env, DATABASE_URL: `file:${path.join(dir, 'test.db')}` };
  const prismaCli = path.join(__dirname, '../node_modules/.bin/prisma');
  const prismaCommand = (args, input) => {
    const result = spawnSync(prismaCli, args, { env, input, encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  };
  let server;
  let prisma;
  try {
    prismaCommand(['db', 'push', '--schema', oldSchemaPath, '--skip-generate']);
    prismaCommand(['db', 'execute', '--schema', oldSchemaPath, '--stdin'], `
      INSERT INTO "User" ("id", "email", "role") VALUES (1, 'teacher@example.test', 'TEACHER');
      INSERT INTO "Quiz" ("title", "teacherId", "publicSlug") VALUES ('Antiga', 1, 'old-quiz');
    `);
    prismaCommand(['db', 'push', '--schema', schemaPath, '--skip-generate']);
    process.env.DATABASE_URL = env.DATABASE_URL;
    prisma = require('../src/db');
    const secondTeacher = await prisma.user.create({ data: { email: 'other@example.test', role: 'TEACHER' } });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: Number(req.get('x-teacher-id')), role: 'TEACHER' };
      next();
    });
    app.use('/api/teacher', require('../src/routes/teacher'));
    app.use((error, _req, res, _next) => {
      res.status(error instanceof ZodError ? 400 : error.status || 500).json({ error: error.message });
    });
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const request = async (endpoint, { method = 'GET', body, teacher = 1 } = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/teacher${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-teacher-id': String(teacher) },
        ...(body && { body: JSON.stringify(body) }),
      });
      return { status: response.status, data: await response.json() };
    };

    const old = (await request('/quizzes')).data[0];
    assert.equal(old.subject, 'General');
    assert.deepEqual((await request('/subjects')).data, ['General']);
    const created = await request('/quizzes', { method: 'POST', body: { title: 'Xarxes', subject: '  Informàtica  ' } });
    assert.equal(created.status, 201);
    assert.equal(created.data.subject, 'Informàtica');
    const quizId = created.data.id;
    assert.deepEqual((await request('/subjects')).data, ['General', 'Informàtica']);
    assert.deepEqual((await request('/subjects', { teacher: secondTeacher.id })).data, []);

    const unchanged = await request(`/quizzes/${quizId}`, { method: 'PUT', body: { title: 'Xarxes' } });
    assert.equal(unchanged.data.subject, 'Informàtica');
    const duplicate = await request(`/quizzes/${quizId}/duplicate`, { method: 'POST' });
    assert.equal(duplicate.data.subject, 'Informàtica');
    assert.equal((await request(`/quizzes/${quizId}`, { teacher: secondTeacher.id })).status, 404);
    assert.equal((await request(`/quizzes/${quizId}`, { method: 'PUT', body: { title: 'Xarxes', subject: 'x'.repeat(101) } })).status, 400);
    const cleared = await request(`/quizzes/${quizId}`, { method: 'PUT', body: { title: 'Xarxes', subject: '  ' } });
    assert.equal(cleared.data.subject, 'General');
    assert.deepEqual((await request('/subjects')).data, ['General', 'Informàtica']);
    await request(`/quizzes/${duplicate.data.id}`, { method: 'DELETE' });
    assert.deepEqual((await request('/subjects')).data, ['General']);
    const general = await request(`/quizzes/${quizId}`, { method: 'PUT', body: { title: 'Xarxes', subject: 'general' } });
    assert.equal(general.data.subject, 'General');
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (prisma) await prisma.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
