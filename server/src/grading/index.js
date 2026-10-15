const MANUAL_TYPES = ['LONG_TEXT', 'IMAGE_UPLOAD'];

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

function isAnswered(type, value) {
  if (value === null || value === undefined) return false;
  switch (type) {
    case 'MCQ':
      return Array.isArray(value) && value.length > 0;
    case 'TRUE_FALSE':
      return typeof value === 'boolean';
    case 'MATCHING':
    case 'ORDERING':
    case 'IMAGE_LABEL':
      return typeof value === 'object' && Object.values(value).some((v) => v !== '' && v != null);
    case 'SHORT_TEXT':
    case 'LONG_TEXT':
      return String(value).trim() !== '';
    case 'IMAGE_UPLOAD':
      return !!value;
    default:
      return false;
  }
}

// Retorna { answered, fraction } (fraction 0..1) o { manual: true }
function gradeQuestion(question, value) {
  const { type } = question;
  if (MANUAL_TYPES.includes(type)) return { manual: true, answered: isAnswered(type, value) };
  const key = question.answerKey || {};
  const answered = isAnswered(type, value);
  if (!answered) return { answered: false, fraction: 0 };

  let fraction = 0;
  switch (type) {
    case 'MCQ': {
      const correct = new Set((key.correct || []).map(String));
      const chosen = new Set((value || []).map(String));
      if (correct.size === 0) break;
      let good = 0;
      let bad = 0;
      for (const c of chosen) correct.has(c) ? good++ : bad++;
      fraction = Math.max(0, (good - bad) / correct.size);
      if (key.allOrNothing) fraction = good === correct.size && bad === 0 ? 1 : 0;
      break;
    }
    case 'TRUE_FALSE':
      fraction = value === key.correct ? 1 : 0;
      break;
    case 'MATCHING': {
      const pairs = key.pairs || {};
      const ids = Object.keys(pairs);
      if (!ids.length) break;
      const ok = ids.filter((l) => String(value[l]) === String(pairs[l])).length;
      const bad = ids.filter((l) => value[l] != null && value[l] !== '' && String(value[l]) !== String(pairs[l])).length;
      fraction = Math.max(0, (ok - bad) / ids.length);
      if (key.allOrNothing) {
        const hasExtraPair = Object.keys(value).some((leftId) => !ids.includes(leftId));
        fraction = ok === ids.length && bad === 0 && !hasExtraPair ? 1 : 0;
      }
      break;
    }
    case 'ORDERING': {
      const order = key.order || [];
      if (!order.length || !Array.isArray(value)) break;
      const correct = order.filter((id, index) => String(value[index]) === String(id)).length;
      fraction = correct / order.length;
      if (key.allOrNothing) fraction = value.length === order.length && correct === order.length ? 1 : 0;
      break;
    }
    case 'IMAGE_LABEL': {
      const labels = key.labels || {};
      const ids = Object.keys(labels);
      if (!ids.length) break;
      const ok = ids.filter((p) => norm(value[p]) === norm(labels[p])).length;
      fraction = ok / ids.length;
      break;
    }
    case 'SHORT_TEXT': {
      const v = norm(value);
      const accepted = (key.accepted || []).map(norm);
      let hit = accepted.includes(v);
      if (!hit && key.regex) {
        try {
          hit = new RegExp(key.regex, 'i').test(String(value));
        } catch {
          hit = false;
        }
      }
      fraction = hit ? 1 : 0;
      break;
    }
  }
  return { answered: true, fraction };
}

// Puntuació de la pregunta, amb penalització per errors totals
function scoreQuestion(question, value, negativePenalty = 0) {
  const g = gradeQuestion(question, value);
  if (g.manual) return { manual: true, answered: g.answered, score: null };
  if (!g.answered) return { answered: false, score: 0 };
  if (g.fraction > 0) return { answered: true, score: question.points * g.fraction };
  return { answered: true, score: negativePenalty ? -negativePenalty * question.points : 0 };
}

// answers: [{questionId, score|null}]; retorna { score, pending }
function computeAttemptScore(quiz, questions, answersByQ) {
  let total = 0;
  let max = 0;
  let pending = false;
  for (const q of questions) {
    max += q.points;
    const a = answersByQ.get(q.id);
    if (!a) continue;
    if (a.score === null || a.score === undefined) {
      if (a.needsReview) pending = true;
      continue;
    }
    total += a.score;
  }
  const raw = max > 0 ? (Math.max(0, total) / max) * quiz.maxScore : 0;
  return { score: Math.min(quiz.maxScore, Math.round(raw * 100) / 100), pending };
}

// PRNG determinista per aleatoritzar per intent
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, seed) {
  const r = rng(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { gradeQuestion, scoreQuestion, computeAttemptScore, shuffle, isAnswered, MANUAL_TYPES, norm };
