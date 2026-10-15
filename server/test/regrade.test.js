const test = require('node:test');
const assert = require('node:assert/strict');
const { regradeAttempt, hasChangedExportedGrade, getGradingStatus } = require('../src/grading/regrade');

test('regrades automatic answers against the latest key and marks the version', () => {
  const quiz = { maxScore: 10, negativePenalty: 0, gradingVersion: 3 };
  const questions = [{ id: 1, type: 'TRUE_FALSE', points: 2, gradingVersion: 1, answerKey: JSON.stringify({ correct: true }) }];
  const answers = [{ id: 9, questionId: 1, value: 'false', score: 2, needsReview: false, questionGradingVersion: 0 }];
  assert.deepEqual(regradeAttempt(quiz, questions, answers), {
    answerUpdates: [{ id: 9, data: { score: 0, needsReview: false, questionGradingVersion: 1 } }],
    score: 0,
    status: 'GRADED',
    gradedVersion: 3,
  });
});

test('sets answered manual questions pending review and preserves blank manual answers as zero', () => {
  const quiz = { maxScore: 10, negativePenalty: 0, gradingVersion: 2 };
  const questions = [
    { id: 1, type: 'LONG_TEXT', points: 2, gradingVersion: 1, answerKey: '{}' },
    { id: 2, type: 'LONG_TEXT', points: 2, gradingVersion: 1, answerKey: '{}' },
  ];
  const answers = [
    { id: 10, questionId: 1, value: JSON.stringify('Resposta'), score: 2, needsReview: false, questionGradingVersion: 0 },
    { id: 11, questionId: 2, value: JSON.stringify(''), score: 0, needsReview: false, questionGradingVersion: 0 },
  ];
  const result = regradeAttempt(quiz, questions, answers);
  assert.deepEqual(result.answerUpdates, [
    { id: 10, data: { score: null, needsReview: true, questionGradingVersion: 1 } },
    { id: 11, data: { score: 0, needsReview: false, questionGradingVersion: 1 } },
  ]);
  assert.equal(result.score, null);
  assert.equal(result.status, 'NEEDS_REVIEW');
});

test('preserves an already-reviewed manual answer when another question changes', () => {
  const quiz = { maxScore: 10, negativePenalty: 0, gradingVersion: 2 };
  const questions = [
    { id: 1, type: 'LONG_TEXT', points: 2, gradingVersion: 0, answerKey: '{}' },
    { id: 2, type: 'TRUE_FALSE', points: 2, gradingVersion: 1, answerKey: JSON.stringify({ correct: true }) },
  ];
  const answers = [
    { id: 10, questionId: 1, value: JSON.stringify('Resposta'), score: 1.5, needsReview: false, questionGradingVersion: 0 },
    { id: 11, questionId: 2, value: 'true', score: 0, needsReview: false, questionGradingVersion: 0 },
  ];
  const result = regradeAttempt(quiz, questions, answers);
  assert.deepEqual(result.answerUpdates, [
    { id: 10, data: { score: 1.5, needsReview: false, questionGradingVersion: 0 } },
    { id: 11, data: { score: 2, needsReview: false, questionGradingVersion: 1 } },
  ]);
  assert.equal(result.status, 'GRADED');
});

test('preserves teacher-reviewed short text unless its grading key changes', () => {
  const quiz = { maxScore: 10, negativePenalty: 0, gradingVersion: 3 };
  const questions = [
    { id: 1, type: 'SHORT_TEXT', points: 2, gradingVersion: 1, answerKey: JSON.stringify({ accepted: ['correcte'] }) },
    { id: 2, type: 'SHORT_TEXT', points: 2, gradingVersion: 2, answerKey: JSON.stringify({ accepted: ['correcte'] }) },
  ];
  const answers = [
    { id: 10, questionId: 1, value: JSON.stringify('quasi'), score: 1.5, needsReview: false, manuallyReviewed: true, questionGradingVersion: 1 },
    { id: 11, questionId: 2, value: JSON.stringify('quasi'), score: 1.5, needsReview: false, manuallyReviewed: true, questionGradingVersion: 1 },
  ];
  const result = regradeAttempt(quiz, questions, answers);
  assert.deepEqual(result.answerUpdates, [
    { id: 10, data: { score: 1.5, needsReview: false, questionGradingVersion: 1, manuallyReviewed: true } },
    { id: 11, data: { score: 0, needsReview: false, questionGradingVersion: 2, manuallyReviewed: false } },
  ]);
});

test('preserves LLM-reviewed short text unless its grading key changes', () => {
  const quiz = { maxScore: 10, negativePenalty: 0, gradingVersion: 3 };
  const questions = [
    { id: 1, type: 'SHORT_TEXT', points: 2, gradingVersion: 1, answerKey: JSON.stringify({ accepted: ['correcte'] }) },
    { id: 2, type: 'SHORT_TEXT', points: 2, gradingVersion: 2, answerKey: JSON.stringify({ accepted: ['correcte'] }) },
  ];
  const answers = [
    { id: 10, questionId: 1, value: JSON.stringify('gairebé'), score: 1.5, needsReview: false, llmReviewed: true, questionGradingVersion: 1 },
    { id: 11, questionId: 2, value: JSON.stringify('gairebé'), score: 1.5, needsReview: false, llmReviewed: true, questionGradingVersion: 1 },
  ];
  const result = regradeAttempt(quiz, questions, answers);
  assert.deepEqual(result.answerUpdates, [
    { id: 10, data: { score: 1.5, needsReview: false, questionGradingVersion: 1, llmReviewed: true } },
    { id: 11, data: { score: 0, needsReview: false, questionGradingVersion: 2, manuallyReviewed: false, llmReviewed: false } },
  ]);
});

test('clears LLM provenance when an edited long-text question becomes pending again', () => {
  const result = regradeAttempt(
    { maxScore: 10, negativePenalty: 0, gradingVersion: 2 },
    [{ id: 1, type: 'LONG_TEXT', points: 2, gradingVersion: 1, answerKey: '{}' }],
    [{ id: 10, questionId: 1, value: JSON.stringify('Resposta'), score: 1.5, needsReview: false, manuallyReviewed: false, llmReviewed: true, questionGradingVersion: 0 }],
  );
  assert.deepEqual(result.answerUpdates, [
    { id: 10, data: { score: null, needsReview: true, questionGradingVersion: 1, llmReviewed: false } },
  ]);
  assert.equal(result.status, 'NEEDS_REVIEW');
});

test('detects whether an exported Classroom grade differs from the current score', () => {
  assert.equal(hasChangedExportedGrade({ exportedAt: new Date(), exportedScore: 6, score: 8 }), true);
  assert.equal(hasChangedExportedGrade({ exportedAt: new Date(), exportedScore: 8, score: 8 }), false);
  assert.equal(hasChangedExportedGrade({ exportedAt: null, exportedScore: null, score: 8 }), false);
});

test('summarizes outdated attempts and changed Classroom grades per student', () => {
  const quiz = { gradingVersion: 2, gradeToExport: 'BEST' };
  const attempts = [
    { userId: 1, status: 'GRADED', score: 5, gradedVersion: 1, submittedAt: '2026-01-01', exportedAt: '2026-01-02', exportedScore: 5 },
    { userId: 1, status: 'GRADED', score: 8, gradedVersion: 2, submittedAt: '2026-01-03', exportedAt: null, exportedScore: null },
    { userId: 2, status: 'IN_PROGRESS', score: null, gradedVersion: 0, submittedAt: null, exportedAt: null, exportedScore: null },
  ];
  assert.deepEqual(getGradingStatus(quiz, attempts), { needsRegrade: 1, pendingReview: 0, classroomUpdates: 1 });
});

test('reports pending manual reviews as a Classroom export blocker', () => {
  const status = getGradingStatus(
    { gradingVersion: 2, gradeToExport: 'BEST' },
    [{ userId: 1, status: 'NEEDS_REVIEW', score: null, gradedVersion: 2, submittedAt: '2026-01-01', exportedAt: '2026-01-02', exportedScore: 5 }],
  );
  assert.deepEqual(status, { needsRegrade: 0, pendingReview: 1, classroomUpdates: 1 });
});