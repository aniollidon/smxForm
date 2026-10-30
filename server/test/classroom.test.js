const test = require('node:test');
const assert = require('node:assert');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
const { latestDeadline } = require('../src/services/classroom');

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
