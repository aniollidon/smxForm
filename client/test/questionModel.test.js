import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft } from '../src/questionModel.js';

test('new questions are required and shuffle options when supported', () => {
  for (const type of ['MCQ', 'MATCHING', 'IMAGE_LABEL']) {
    const draft = emptyDraft(type);
    assert.equal(draft.required, true);
    assert.equal(draft.shuffleOptions, true);
  }

  for (const type of ['TRUE_FALSE', 'SHORT_TEXT', 'LONG_TEXT', 'IMAGE_UPLOAD']) {
    const draft = emptyDraft(type);
    assert.equal(draft.required, true);
    assert.equal(draft.shuffleOptions, false);
  }
});