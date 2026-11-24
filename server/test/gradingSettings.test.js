const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const express = require('express');
const { ZodError } = require('zod');

test('web search settings persist per question alongside grading criteria', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'palamform-grading-'));
  const schema = fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');
  const oldSchemaPath = path.join(dir, 'old.prisma');
  const schemaPath = path.join(dir, 'schema.prisma');
  fs.writeFileSync(oldSchemaPath, schema.replace('  gradingWebSearch Boolean @default(false)\n', ''));
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
      INSERT INTO "User" ("id", "email", "role") VALUES (1, 'teacher@example.test', 'TEACHER'), (2, 'other@example.test', 'TEACHER');
      INSERT INTO "Quiz" ("id", "title", "teacherId", "publicSlug") VALUES (1, 'Quiz', 1, 'quiz');
      INSERT INTO "Question" ("id", "quizId", "type", "text", "gradingCriteria") VALUES
        (1, 1, 'LONG_TEXT', 'First', 'Existing criteria'), (2, 1, 'LONG_TEXT', 'Second', NULL);
    `);
    prismaCommand(['db', 'push', '--schema', schemaPath, '--skip-generate']);
    process.env.DATABASE_URL = env.DATABASE_URL;
    prisma = require('../src/db');
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
    const settings = '/questions/1/grading-criteria';
    const readQuestion = async (id) => (await request(`/questions/${id}/answers`)).data.question;

    assert.equal((await readQuestion(1)).gradingWebSearch, false);
    assert.equal((await readQuestion(1)).gradingCriteria, 'Existing criteria');
    const enabled = await request(settings, { method: 'PUT', body: { criteria: '  Criteria  ', webSearch: true } });
    assert.deepEqual(enabled.data, { gradingCriteria: 'Criteria', gradingWebSearch: true });
    assert.equal((await readQuestion(1)).gradingWebSearch, true);
    assert.equal((await readQuestion(2)).gradingWebSearch, false);
    const legacy = await request(settings, { method: 'PUT', body: { criteria: 'Updated' } });
    assert.equal(legacy.data.gradingWebSearch, true);
    assert.equal((await request(settings, { method: 'PUT', body: { criteria: 'Updated', webSearch: 'false' } })).status, 400);
    assert.equal((await request(settings, { method: 'PUT', teacher: 2, body: { criteria: 'Updated', webSearch: false } })).status, 404);
    const disabled = await request(settings, { method: 'PUT', body: { criteria: 'Updated', webSearch: false } });
    assert.equal(disabled.data.gradingWebSearch, false);
    assert.equal((await readQuestion(1)).gradingWebSearch, false);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (prisma) await prisma.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
