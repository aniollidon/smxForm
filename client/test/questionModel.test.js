import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, fromQuestion, toPayload } from '../src/questionModel.js';

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