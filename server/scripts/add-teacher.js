require('dotenv').config();
const prisma = require('../src/db');
const email = (process.argv[2] || '').toLowerCase();
if (!email.includes('@')) { console.error('Ús: npm run add-teacher -- correu@inspalamos.cat'); process.exit(1); }
prisma.user.upsert({ where: { email }, update: { role: 'TEACHER' }, create: { email, role: 'TEACHER' } })
  .then((u) => console.log('Professor:', u.email)).finally(() => prisma.$disconnect());
