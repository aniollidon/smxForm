export function groupQuizzesBySubject(quizzes) {
  const groups = new Map();
  for (const quiz of quizzes) {
    if (!groups.has(quiz.subject)) groups.set(quiz.subject, []);
    groups.get(quiz.subject).push(quiz);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'ca'));
}
