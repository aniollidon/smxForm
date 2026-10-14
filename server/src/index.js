require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const passport = require('passport');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { ZodError } = require('zod');
const prisma = require('./db');
const { router: authRouter, setupPassport } = require('./auth');
const teacherRouter = require('./routes/teacher');
const { router: studentRouter } = require('./routes/student');
const filesRouter = require('./routes/files');

async function seedTeachers() {
  const emails = (process.env.SEED_TEACHERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const email of emails) {
    await prisma.user.upsert({ where: { email }, update: { role: 'TEACHER' }, create: { email, role: 'TEACHER' } });
  }
}

const app = express();
const prod = process.env.NODE_ENV === 'production';
if (prod) app.set('trust proxy', 1);
if (prod && (process.env.SESSION_SECRET || 'canvia-aixo') === 'canvia-aixo') {
  throw new Error('Defineix SESSION_SECRET en producció');
}

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
app.use(express.json({ limit: '200kb' }));
app.use(
  cookieSession({
    name: 'smx',
    keys: [process.env.SESSION_SECRET || 'canvia-aixo'],
    maxAge: 8 * 3600 * 1000,
    sameSite: 'lax',
    httpOnly: true,
    secure: prod,
  })
);
// Compatibilitat passport 0.5 amb cookie-session no necessària, però afegim els mètodes per seguretat
app.use((req, _res, next) => {
  if (req.session && !req.session.regenerate) req.session.regenerate = (cb) => cb();
  if (req.session && !req.session.save) req.session.save = (cb) => cb();
  next();
});
setupPassport();
app.use(passport.initialize());
app.use(passport.session());

// Protecció CSRF bàsica: les peticions que modifiquen estat han de venir del nostre origen
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== new URL(process.env.BASE_URL).origin) return res.status(403).json({ error: 'Origen no permès' });
  next();
});

app.use('/auth', rateLimit({ windowMs: 60_000, limit: 60 }), authRouter);
app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticat' });
  const { id, email, name, role } = req.user;
  res.json({ id, email, name, role });
});
app.use('/api', rateLimit({ windowMs: 60_000, limit: 600 }));
app.use('/api/teacher', teacherRouter);
app.use('/api/student', studentRouter);
app.use('/api/files', filesRouter);

const dist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|auth).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: 'Dades invàlides', details: err.issues });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Fitxer massa gran' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Error intern' : err.message });
});

const port = process.env.PORT || 3001;
seedTeachers().then(() => app.listen(port, () => console.log(`API a http://localhost:${port}`)));
