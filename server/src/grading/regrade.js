const { scoreQuestion, computeAttemptScore } = require('./index');

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function regradeAttempt(quiz, questions, answers) {
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const updates = [];
  const recalculatedAnswers = new Map();

  for (const question of questions) {
    const existing = answerByQuestion.get(question.id);
    if (!existing) continue;
    const value = parseJson(existing.value);
    const answerKey = parseJson(question.answerKey);
    const gradingValue = question.type === 'IMAGE_UPLOAD' ? !!existing.fileUrl : value;
    const result = scoreQuestion({ ...question, answerKey }, gradingValue, quiz.negativePenalty);
    const reviewedShortTextUnchanged = question.type === 'SHORT_TEXT'
      && existing.manuallyReviewed
      && existing.questionGradingVersion === question.gradingVersion;
    const manualAnswerUnchanged = result.manual
      && existing.questionGradingVersion === question.gradingVersion
      && existing.score != null
      && !existing.needsReview;
    const llmAnswerUnchanged = existing.llmReviewed
      && existing.questionGradingVersion === question.gradingVersion
      && existing.score != null
      && !existing.needsReview;
    const data = llmAnswerUnchanged
      ? { score: existing.score, needsReview: false, questionGradingVersion: question.gradingVersion, llmReviewed: true }
      : reviewedShortTextUnchanged
      ? { score: existing.score, needsReview: false, questionGradingVersion: question.gradingVersion, manuallyReviewed: true }
      : result.manual
      ? manualAnswerUnchanged
          ? { score: existing.score, needsReview: false, questionGradingVersion: question.gradingVersion, ...(existing.llmReviewed ? { llmReviewed: false } : {}) }
          : { score: result.answered ? null : 0, needsReview: result.answered, questionGradingVersion: question.gradingVersion, ...(existing.llmReviewed ? { llmReviewed: false } : {}) }
      : {
        score: result.score === 0 ? 0 : result.score,
        needsReview: false,
        questionGradingVersion: question.gradingVersion,
        ...(question.type === 'SHORT_TEXT' ? { manuallyReviewed: false } : {}),
          ...(existing.llmReviewed ? { llmReviewed: false } : {}),
      };
    updates.push({ id: existing.id, data });
    recalculatedAnswers.set(question.id, { ...existing, ...data });
  }

  const { score, pending } = computeAttemptScore(quiz, questions, recalculatedAnswers);
  return {
    answerUpdates: updates,
    score: pending ? null : score,
    status: pending ? 'NEEDS_REVIEW' : 'GRADED',
    gradedVersion: quiz.gradingVersion,
  };
}

function hasChangedExportedGrade(attempt) {
  if (!attempt.exportedAt) return false;
  if (attempt.exportedScore == null || attempt.score == null) return attempt.exportedScore !== attempt.score;
  return Math.abs(attempt.exportedScore - attempt.score) >= 0.005;
}

function getGradingStatus(quiz, attempts) {
  const evaluated = attempts.filter((attempt) => attempt.status !== 'IN_PROGRESS');
  const needsRegrade = evaluated.filter((attempt) => attempt.gradedVersion < quiz.gradingVersion).length;
  const pendingReview = evaluated.filter((attempt) => attempt.status === 'NEEDS_REVIEW').length;
  const byStudent = new Map();
  for (const attempt of evaluated) {
    if (!byStudent.has(attempt.userId)) byStudent.set(attempt.userId, []);
    byStudent.get(attempt.userId).push(attempt);
  }
  let classroomUpdates = 0;
  for (const studentAttempts of byStudent.values()) {
    const graded = studentAttempts
      .filter((attempt) => attempt.score != null && ['SUBMITTED', 'GRADED'].includes(attempt.status))
      .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
    const current = quiz.gradeToExport === 'LAST' ? graded.at(-1) : graded.reduce((best, attempt) => !best || attempt.score > best.score ? attempt : best, null);
    const exported = studentAttempts
      .filter((attempt) => attempt.exportedAt)
      .sort((a, b) => new Date(b.exportedAt) - new Date(a.exportedAt))[0];
    if (exported && (current?.score ?? null) !== (exported.exportedScore ?? null)) classroomUpdates++;
  }
  return { needsRegrade, pendingReview, classroomUpdates };
}

module.exports = { regradeAttempt, hasChangedExportedGrade, getGradingStatus };