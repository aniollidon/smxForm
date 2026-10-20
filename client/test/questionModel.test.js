import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, fromQuestion, toPayload, validateDraft } from '../src/questionModel.js';

test('new questions are required and shuffle options when supported', () => {
  for (const type of ['MCQ', 'MATCHING', 'ORDERING', 'IMAGE_LABEL']) {
    const draft = emptyDraft(type);
    assert.equal(draft.required, true);
    assert.equal(draft.shuffleOptions, true);
    assert.equal(draft.allowClipboard, false);
  }

  for (const type of ['TRUE_FALSE', 'SHORT_TEXT', 'LONG_TEXT', 'IMAGE_UPLOAD']) {
    const draft = emptyDraft(type);
    assert.equal(draft.required, true);
    assert.equal(draft.shuffleOptions, false);
    assert.equal(draft.allowClipboard, false);
  }
});

test('question payload preserves the explicit clipboard permission', () => {
  for (const type of ['MCQ', 'TRUE_FALSE', 'MATCHING', 'ORDERING', 'IMAGE_LABEL', 'SHORT_TEXT', 'LONG_TEXT', 'IMAGE_UPLOAD']) {
    const draft = emptyDraft(type);
    assert.equal(toPayload({ ...draft, allowClipboard: true }).config.allowClipboard, true);
  }
});

test('partial credit is the default and all-or-nothing is preserved for eligible questions', () => {
  for (const type of ['MCQ', 'MATCHING', 'ORDERING']) {
    const draft = emptyDraft(type);
    assert.equal(draft.allOrNothing, false);
    const payload = toPayload({ ...draft, allOrNothing: true });
    assert.equal(payload.answerKey.allOrNothing, true);
    assert.equal(fromQuestion({ ...payload, id: 1, config: payload.config, answerKey: payload.answerKey }).allOrNothing, true);
  }
});

test('calculated question drafts preserve list generation and legacy ranges', () => {
  const draft = emptyDraft('CALCULATED');
  assert.equal(draft.numericAnswer, true);
  draft.text = 'Valor {x}';
  draft.vars = [{ name: 'x', mode: 'list', min: 1, max: 10, decimals: 0, values: '1,25\n2.5\n4' }];
  draft.formula = '{x}';
  assert.equal(validateDraft(draft), null);
  assert.deepEqual(toPayload(draft).config.variables[0].values, [1.25, 2.5, 4]);

  const legacy = fromQuestion({ ...toPayload({ ...draft, vars: [{ name: 'x', min: 1, max: 10, decimals: 0, values: '' }] }), id: 1 });
  assert.equal(legacy.vars[0].mode, 'range');
  assert.equal(fromQuestion({ ...toPayload(draft), id: 2, config: { variables: draft.vars.map((variable) => ({ ...variable, values: [] })) } }).numericAnswer, true);
});
test('fill-in-the-blanks drafts map each blank to its accepted alternatives', () => {
  const draft = { ...emptyDraft('FILL_BLANKS'), text: 'Un batch petit dona ___ actualitzacions i ___.', blanks: ['més | mes', 'soroll'] };
  assert.equal(validateDraft(draft), null);
  const payload = toPayload(draft);
  assert.deepEqual(payload.answerKey, { blanks: [['més', 'mes'], ['soroll']] });
  assert.deepEqual(fromQuestion({ ...payload, id: 1 }).blanks, ['més | mes', 'soroll']);
  assert.match(validateDraft({ ...draft, blanks: ['més'] }), /buit 2/);
  assert.match(validateDraft({ ...draft, text: 'Sense buits' }), /buits/);
});

test('numeric answer settings default to text except formulas and round-trip independently', () => {
  const short = emptyDraft('SHORT_TEXT');
  assert.equal(short.numericAnswer, false);
  short.accepted = '1\n2,5';
  short.numericAnswer = true;
  assert.equal(toPayload(short).config.numericAnswer, true);

  const blanks = { ...emptyDraft('FILL_BLANKS'), text: '___ i ___', blanks: ['1', '2'], numericBlanks: [true, false] };
  assert.deepEqual(toPayload(blanks).config.numericBlanks, [true, false]);

  const labels = { ...emptyDraft('IMAGE_LABEL'), text: 'Etiqueta', imageUrl: 'image.png', points_: [{ id: 'p1', x: 1, y: 2, label: '3,5', numeric: true }] };
  const labelPayload = toPayload(labels);
  assert.equal(labelPayload.config.points[0].numeric, true);
  assert.deepEqual(fromQuestion({ ...labelPayload, id: 1 }).points_.map(({ numeric }) => numeric), [true]);
  assert.match(validateDraft({ ...labels, points_: [{ ...labels.points_[0], label: 'tres' }] }), /numèrica/);

  const formula = emptyDraft('CALCULATED');
  assert.equal(formula.numericAnswer, true);
  assert.equal(toPayload({ ...formula, numericAnswer: false }).config.numericAnswer, false);
});

test('table question definitions round-trip and require at least one labeled cell', () => {
  const draft = { ...emptyDraft('TABLE'), text: 'Completa les dades', tableColumns: ['Any', 'Població'], tableRows: ['Barcelona', 'Girona'], reference: 'Consulta la font.' };
  assert.equal(validateDraft(draft), null);
  const payload = toPayload(draft);
  assert.deepEqual(payload.config, { columns: ['Any', 'Població'], rows: ['Barcelona', 'Girona'], allowClipboard: false });
  assert.deepEqual(payload.answerKey, { reference: 'Consulta la font.' });
  assert.deepEqual(fromQuestion({ ...payload, id: 1 }).tableColumns, draft.tableColumns);
  assert.deepEqual(fromQuestion({ ...payload, id: 1 }).tableRows, draft.tableRows);
  assert.match(validateDraft({ ...draft, tableColumns: [] }), /capçaleres/);
});
