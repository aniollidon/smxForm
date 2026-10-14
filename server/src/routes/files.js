const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const prisma = require('../db');
const { requireAuth, requireTeacher } = require('../auth');

const UPLOAD_DIR = path.resolve(__dirname, '../../../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, msg) => Object.assign(new Error(msg), { status });

// Detecta el tipus real per magic bytes (no es fia del mimetype del client)
function sniff(buf) {
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.length > 6 && /^GIF8[79]a$/.test(buf.slice(0, 6).toString())) return 'gif';
  return null;
}

function saveImage(file, prefix) {
  if (!file) throw fail(400, 'Falta el fitxer');
  const ext = sniff(file.buffer);
  if (!ext) throw fail(415, 'Format d\'imatge no vàlid (png, jpg, webp, gif)');
  const name = `${prefix}_${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.buffer);
  return name;
}

router.post('/question-image', requireTeacher, upload.single('file'), wrap(async (req, res) => {
  res.status(201).json({ imageUrl: saveImage(req.file, 'q') });
}));

router.post('/answer-image/:aid/:qid', requireAuth, upload.single('file'), wrap(async (req, res) => {
  const attempt = await prisma.attempt.findUnique({
    where: { id: Number(req.params.aid) },
    include: { quiz: { include: { questions: true } } },
  });
  if (!attempt || attempt.userId !== req.user.id) throw fail(404, 'Intent no trobat');
  if (attempt.status !== 'IN_PROGRESS') throw fail(409, 'Intent ja enviat');
  const q = attempt.quiz.questions.find((x) => x.id === Number(req.params.qid));
  if (!q || q.type !== 'IMAGE_UPLOAD') throw fail(400, 'Pregunta invàlida');
  const name = saveImage(req.file, 'a');
  const data = { fileUrl: name, value: '"file"' };
  await prisma.answer.upsert({
    where: { attemptId_questionId: { attemptId: attempt.id, questionId: q.id } },
    update: data,
    create: { attemptId: attempt.id, questionId: q.id, ...data },
  });
  res.status(201).json({ fileUrl: name });
}));

router.get('/:name', requireAuth, wrap(async (req, res) => {
  const name = req.params.name;
  if (!/^(q|a)_[a-f0-9]{32}\.(png|jpg|webp|gif)$/.test(name)) throw fail(404, 'No trobat');
  if (name.startsWith('a_')) {
    const ans = await prisma.answer.findFirst({
      where: { fileUrl: name },
      include: { attempt: true, question: { include: { quiz: true } } },
    });
    const allowed = ans && (ans.attempt.userId === req.user.id || ans.question.quiz.teacherId === req.user.id);
    if (!allowed) throw fail(404, 'No trobat');
  }
  res.set('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.join(UPLOAD_DIR, name), (err) => err && !res.headersSent && res.status(404).end());
}));

module.exports = router;
