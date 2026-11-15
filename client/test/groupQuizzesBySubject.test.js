import test from 'node:test';
import assert from 'node:assert/strict';
import { groupQuizzesBySubject } from '../src/groupQuizzesBySubject.js';

test('groups all quizzes by subject, preserving their order within sorted sections', () => {
  const quizzes = [
    { id: 1, subject: 'Matemàtiques' },
    { id: 2, subject: 'General' },
    { id: 3, subject: 'Matemàtiques' },
    { id: 4, subject: 'Àlgebra' },
  ];
  assert.deepEqual(groupQuizzesBySubject(quizzes), [
    ['Àlgebra', [quizzes[3]]],
    ['General', [quizzes[1]]],
    ['Matemàtiques', [quizzes[0], quizzes[2]]],
  ]);
});

test('empty subjects disappear after their last quiz is removed or moved', () => {
  assert.deepEqual(groupQuizzesBySubject([]), []);
  assert.deepEqual(groupQuizzesBySubject([{ id: 1, subject: 'General' }]), [
    ['General', [{ id: 1, subject: 'General' }]],
  ]);
});
