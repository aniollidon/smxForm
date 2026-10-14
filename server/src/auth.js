const express = require('express');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const prisma = require('./db');
const classroom = require('./services/classroom');

const domain = () => (process.env.ALLOWED_DOMAIN || 'inspalamos.cat').toLowerCase();

function setupPassport() {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID || 'x',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'x',
        callbackURL: `${process.env.BASE_URL}/auth/google/callback`,
      },
      async (_at, _rt, profile, done) => {
        try {
          const email = (profile.emails?.[0]?.value || '').toLowerCase();
          if (!email.endsWith('@' + domain())) return done(null, false);
          const user = await prisma.user.upsert({
            where: { email },
            update: { name: profile.displayName },
            create: { email, name: profile.displayName, role: 'STUDENT' },
          });
          done(null, user);
        } catch (e) {
          done(e);
        }
      }
    )
  );
  passport.serializeUser((u, cb) => cb(null, u.id));
  passport.deserializeUser(async (id, cb) => {
    try {
      cb(null, (await prisma.user.findUnique({ where: { id } })) || false);
    } catch (e) {
      cb(e);
    }
  });
}

const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)/.test(n) ? n : '/');

const router = express.Router();

router.get('/google', (req, res, next) => {
  req.session.next = safeNext(req.query.next);
  passport.authenticate('google', { scope: ['profile', 'email'], hd: domain(), prompt: 'select_account' })(req, res, next);
});

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=domain' }),
  (req, res) => {
    const next = safeNext(req.session.next);
    delete req.session.next;
    res.redirect(next);
  }
);

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// Connexió de Classroom (només professors)
router.get('/classroom', requireTeacher, (req, res) => {
  res.redirect(classroom.authUrl(String(req.user.id)));
});
router.get('/classroom/callback', requireTeacher, async (req, res, next) => {
  try {
    if (req.query.state !== String(req.user.id) || !req.query.code) return res.redirect('/t?classroom=error');
    await classroom.saveTokensFromCode(req.user.id, String(req.query.code));
    res.redirect('/t?classroom=ok');
  } catch (e) {
    next(e);
  }
});

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autenticat' });
  next();
}
function requireTeacher(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autenticat' });
  if (req.user.role !== 'TEACHER') return res.status(403).json({ error: 'Només professors' });
  next();
}

module.exports = { router, setupPassport, requireAuth, requireTeacher };
