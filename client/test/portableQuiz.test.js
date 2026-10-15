import test from 'node:test';
import assert from 'node:assert/strict';
import { exportQuiz, parsePortableQuiz } from '../src/portableQuiz.js';

const image = 'data:image/png;base64,aGVsbG8=';

test('round-trips semantic answers for every supported question type', () => {
  const quiz = {
    title: 'Prova', description: 'Descripció', maxScore: 12, shuffleQuestions: true, allowRetry: true,
    maxAttempts: 3, negativePenalty: 0.25, gradeToExport: 'LAST', showResults: 'FULL', showResultsFrom: null,
    questions: [
      { type: 'MCQ', text: 'Tria', points: 2, required: true, shuffleOptions: true, config: { multiple: true, allowClipboard: true, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }, answerKey: { correct: ['b'] } },
      { type: 'TRUE_FALSE', text: 'Cert?', points: 1, required: false, shuffleOptions: false, config: {}, answerKey: { correct: false } },
      { type: 'MATCHING', text: 'Relaciona', points: 3, required: false, shuffleOptions: true, config: { left: [{ id: 'l1', text: 'Un' }, { id: 'l2', text: 'Dos' }], right: [{ id: 'r1', text: 'Primer' }, { id: 'r2', text: 'Segon' }, { id: 'r3', text: 'Extra' }] }, answerKey: { pairs: { l1: 'r2', l2: 'r1' } } },
      { type: 'ORDERING', text: 'Ordena', points: 2, required: true, shuffleOptions: true, config: { items: [{ id: 'o1', text: 'Primer' }, { id: 'o2', text: 'Segon' }, { id: 'o3', text: 'Tercer' }] }, answerKey: { order: ['o2', 'o3', 'o1'] } },
      { type: 'IMAGE_LABEL', text: 'Etiqueta', points: 2, required: false, shuffleOptions: false, imageUrl: 'q_image.png', config: { points: [{ id: 'p1', x: 12, y: 34 }], labels: ['Cor', 'Pulmó', 'Extra'] }, answerKey: { labels: { p1: 'Cor' } } },
      { type: 'SHORT_TEXT', text: 'Breu', points: 1, required: false, shuffleOptions: false, config: {}, answerKey: { accepted: ['àtom', 'element'], regex: '^e' } },
      { type: 'LONG_TEXT', text: 'Llarga', points: 2, required: false, shuffleOptions: false, config: {}, answerKey: { reference: 'Resposta model' } },
      { type: 'IMAGE_UPLOAD', text: 'Adjunta', points: 1, required: false, shuffleOptions: false, config: {}, answerKey: {} },
    ],
  };
  const parsed = parsePortableQuiz(exportQuiz(quiz, { 'q_image.png': image }));
  assert.equal(parsed.title, quiz.title);
  assert.deepEqual(parsed.drafts.map((question) => question.type), quiz.questions.map((question) => question.type));
  assert.equal(parsed.drafts[0].allowClipboard, true);
  assert.equal(parsed.drafts[1].allowClipboard, false);
  assert.equal(exportQuiz(quiz).questions[0].allowClipboard, true);
  assert.deepEqual(parsed.drafts[0].opts.map(({ text, correct }) => ({ text, correct })), [{ text: 'A', correct: false }, { text: 'B', correct: true }]);
  assert.equal(parsed.drafts[1].correct, false);
  assert.deepEqual(parsed.drafts[2].pairs, [{ left: 'Un', right: 'Segon' }, { left: 'Dos', right: 'Primer' }]);
  assert.equal(parsed.drafts[2].distractors, 'Extra');
  assert.deepEqual(parsed.drafts[3].items.map(({ text }) => text), ['Segon', 'Tercer', 'Primer']);
  assert.equal(parsed.drafts[4].image, image);
  assert.deepEqual(parsed.drafts[4].points_.map(({ x, y, label }) => ({ x, y, label })), [{ x: 12, y: 34, label: 'Cor' }]);
  assert.deepEqual(parsed.drafts[5].accepted, 'àtom\nelement');
  assert.equal(parsed.drafts[6].reference, 'Resposta model');
  assert.equal(parsed.drafts[7].type, 'IMAGE_UPLOAD');
});

test('rejects unsupported versions and malformed question fields', () => {
  assert.throws(() => parsePortableQuiz({ format: 'palamForm.quiz', version: 2, title: 'Prova', questions: [] }), /Versió no compatible/);
  assert.throws(() => parsePortableQuiz({ format: 'palamForm.quiz', version: 1, title: 'Prova', questions: [{ type: 'MCQ', text: 'Tria', options: [{ text: 'A' }] }] }), /entre 2 i 12/);
  assert.throws(() => parsePortableQuiz({ format: 'palamForm.quiz', version: 1, title: 'Prova', questions: [{ type: 'MCQ', text: 'Tria', options: [{ text: 'A', correct: true }, { text: 'B', correct: true }] }] }), /exactament una/);
  assert.throws(() => parsePortableQuiz({ format: 'palamForm.quiz', version: 1, title: 'Prova', questions: [{ type: 'SHORT_TEXT', text: 'Breu', regex: 'x'.repeat(201) }] }), /fins a 200/);
  assert.throws(() => parsePortableQuiz({ format: 'palamForm.quiz', version: 1, title: 'Prova', questions: [{ type: 'ORDERING', text: 'Ordena', items: ['Un'] }] }), /entre 2 i 30/);
});