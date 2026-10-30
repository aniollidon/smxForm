// Decideix quina nota s'exporta de cada alumne i si ja està al dia al Classroom.
// Els intents han d'incloure `exportedAt` i `exportedScore` per poder reprendre exportacions.

const sameScore = (a, b) => a != null && b != null && Math.abs(a - b) < 0.005;

function pickExportTargets(quiz, attempts, { skipUnchanged = false } = {}) {
  const ordered = [...attempts].sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));

  // Mateixa norma que la vista de l'editor: la millor nota o l'últim intent.
  const chosen = new Map();
  for (const attempt of ordered) {
    const current = chosen.get(attempt.userId);
    if (!current || quiz.gradeToExport === 'LAST' || attempt.score > current.score) chosen.set(attempt.userId, attempt);
  }

  // Última exportació de cada alumne, encara que sigui d'un intent anterior.
  const exported = new Map();
  for (const attempt of ordered) {
    if (!attempt.exportedAt) continue;
    const current = exported.get(attempt.userId);
    if (!current || new Date(attempt.exportedAt) > new Date(current.exportedAt)) exported.set(attempt.userId, attempt);
  }

  return [...chosen.values()].map((attempt) => ({
    attempt,
    skip: skipUnchanged && sameScore(exported.get(attempt.userId)?.exportedScore, attempt.score),
  }));
}

module.exports = { pickExportTargets, sameScore };
