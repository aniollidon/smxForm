const test = require('node:test');
const assert = require('node:assert');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
const { latestDeadline, extensionFor } = require('../src/services/classroom');

const due = new Date('2026-11-02T23:59:00.000Z');
const extension = new Date('2026-11-09T23:59:00.000Z');

test('sense termini a la tasca no hi ha límit, ni amb pròrroga', () => {
  assert.strictEqual(latestDeadline(null, null), null);
  assert.strictEqual(latestDeadline(null, extension), null);
});

test('sense pròrroga mana el termini de la tasca', () => {
  assert.strictEqual(latestDeadline(due, null), due);
});

test('amb pròrroga mana la data més permissiva', () => {
  assert.strictEqual(latestDeadline(due, extension).getTime(), extension.getTime());
  assert.strictEqual(latestDeadline(due, extension.toISOString()).getTime(), extension.getTime());
});

test('una pròrroga anterior al termini no l’escurça', () => {
  assert.strictEqual(latestDeadline(due, new Date('2026-10-01T00:00:00.000Z')), due);
  assert.strictEqual(latestDeadline(due, due), due);
});

test('una pròrroga invàlida s’ignora', () => {
  assert.strictEqual(latestDeadline(due, 'no-és-una-data'), due);
});

test('la pròrroga es troba pel correu o per l’identificador de Classroom', () => {
  const byEmail = { identifier: 'anna@escola.cat', externalId: '112233', expiresAt: extension };
  const byId = { identifier: '112244', externalId: '112244', expiresAt: extension };
  const list = [byEmail, byId];
  assert.strictEqual(extensionFor(list, 'anna@escola.cat', null), byEmail);
  assert.strictEqual(extensionFor(list, 'ANNA@escola.cat', '112233'), byEmail);
  assert.strictEqual(extensionFor(list, 'altre@escola.cat', '112244'), byId);
  assert.strictEqual(extensionFor(list, 'altre@escola.cat', null), null);
  assert.strictEqual(extensionFor([], 'anna@escola.cat', '112233'), null);
});

test('una pròrroga desada només amb l’identificador de Classroom no es confon amb un altre correu', () => {
  const list = [{ identifier: '998877', externalId: '998877', expiresAt: extension }];
  assert.strictEqual(extensionFor(list, 'anna@escola.cat', '998877'), list[0]);
  assert.strictEqual(extensionFor(list, 'anna@escola.cat', '555'), null);
});
