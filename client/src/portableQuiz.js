import { uid, validateDraft } from './questionModel.js';

export const PORTABLE_FORMAT = 'palamForm.quiz';
export const PORTABLE_VERSION = 1;

export function dataUriToFile(dataUri) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUri);
  if (!match) throw new Error('La imatge incrustada no és una data URI vàlida.');
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Cada imatge pot tenir com a màxim 5 MiB.');
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[match[1]];
  return new File([bytes], `import.${extension}`, { type: match[1] });
}

export function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No s’ha pogut llegir una imatge de l’entrega.'));
    reader.readAsDataURL(blob);
  });
}

export function exportQuestion(question, image = null) {
  const common = {
    type: question.type,
    text: question.text,
    points: question.points,
    required: question.required,
    shuffleOptions: question.shuffleOptions,
    allowClipboard: !!question.config?.allowClipboard,
    ...(image ? { image } : {}),
  };
  const config = question.config || {};
  const answer = question.answerKey || {};

  switch (question.type) {
    case 'MCQ': {
      const correct = new Set(answer.correct || []);
      return { ...common, multiple: !!config.multiple, options: config.options.map((option) => ({ text: option.text, correct: correct.has(option.id) })) };
    }
    case 'TRUE_FALSE':
      return { ...common, correct: answer.correct };
    case 'MATCHING': {
      const rightById = new Map(config.right.map((item) => [item.id, item.text]));
      const used = new Set(Object.values(answer.pairs || {}));
      return {
        ...common,
        pairs: config.left.map((item) => ({ left: item.text, right: rightById.get(answer.pairs?.[item.id]) })),
        distractors: config.right.filter((item) => !used.has(item.id)).map((item) => item.text),
      };
    }
    case 'ORDERING': {
      const itemsById = new Map(config.items.map((item) => [item.id, item.text]));
      return { ...common, items: (answer.order || []).map((id) => itemsById.get(id)) };
    }
    case 'IMAGE_LABEL': {
      const correctLabels = new Set(Object.values(answer.labels || {}));
      return {
        ...common,
        image: image || null,
        markers: config.points.map((point) => ({ x: point.x, y: point.y, label: answer.labels?.[point.id] || '' })),
        predefined: !!config.labels,
        extraLabels: (config.labels || []).filter((label) => !correctLabels.has(label)),
      };
    }
    case 'SHORT_TEXT':
      return { ...common, accepted: answer.accepted || [], ...(answer.regex ? { regex: answer.regex } : {}) };
    case 'LONG_TEXT':
      return { ...common, reference: answer.reference || '' };
    case 'IMAGE_UPLOAD':
      return common;
    default:
      throw new Error(`Tipus de pregunta no admès: ${question.type}`);
  }
}

export function exportQuiz(quiz, imageByName = {}) {
  const settings = {
    maxScore: quiz.maxScore,
    shuffleQuestions: quiz.shuffleQuestions,
    allowRetry: quiz.allowRetry,
    maxAttempts: quiz.maxAttempts,
    negativePenalty: quiz.negativePenalty,
    gradeToExport: quiz.gradeToExport,
    showResults: quiz.showResults,
    showResultsFrom: quiz.showResultsFrom,
  };
  return {
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    title: quiz.title,
    description: quiz.description || '',
    settings,
    questions: quiz.questions.map((question) => exportQuestion(question, imageByName[question.imageUrl] || null)),
  };
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function importQuestionToDraft(question) {
  requireValue(question && typeof question === 'object' && !Array.isArray(question), 'Cada pregunta ha de ser un objecte.');
  requireValue(typeof question.text === 'string' && question.text.trim(), 'Cada pregunta necessita un enunciat.');
  const base = {
    id: undefined,
    type: question.type,
    text: question.text,
    imageUrl: null,
    image: question.image || null,
    points: question.points ?? 1,
    required: question.required ?? true,
    shuffleOptions: question.shuffleOptions ?? ['MCQ', 'MATCHING', 'ORDERING', 'IMAGE_LABEL'].includes(question.type),
    allowClipboard: question.allowClipboard ?? false,
  };
  requireValue(typeof base.allowClipboard === 'boolean', '«allowClipboard» ha de ser boolean.');
  let draft;
  switch (question.type) {
    case 'MCQ':
      requireValue(Array.isArray(question.options), 'MCQ: «options» ha de ser una llista.');
      requireValue(question.options.length >= 2 && question.options.length <= 12, 'MCQ: «options» ha de tenir entre 2 i 12 opcions.');
      requireValue(question.options.every((option) => typeof option.text === 'string' && typeof (option.correct ?? false) === 'boolean'), 'MCQ: cada opció necessita «text» de tipus string i «correct» de tipus boolean.');
      requireValue(typeof (question.multiple ?? false) === 'boolean', 'MCQ: «multiple» ha de ser boolean.');
      requireValue(question.multiple ? question.options.some((option) => option.correct) : question.options.filter((option) => option.correct).length === 1, 'MCQ: marca almenys una opció correcta; si «multiple» és false, marca’n exactament una.');
      draft = { ...base, multiple: question.multiple ?? false, opts: question.options.map((option) => ({ id: uid(), text: option.text, correct: option.correct ?? false })) };
      break;
    case 'TRUE_FALSE':
      requireValue(typeof question.correct === 'boolean', 'TRUE_FALSE: «correct» ha de ser true o false.');
      draft = { ...base, correct: question.correct };
      break;
    case 'MATCHING': {
      requireValue(Array.isArray(question.pairs) && question.pairs.length >= 2 && question.pairs.length <= 12, 'MATCHING: «pairs» ha de tenir entre 2 i 12 parelles.');
      requireValue(question.pairs.every((pair) => typeof pair.left === 'string' && typeof pair.right === 'string'), 'MATCHING: cada parella necessita «left» i «right» de tipus string.');
      requireValue(Array.isArray(question.distractors ?? []) && question.distractors.length + question.pairs.length <= 15 && (question.distractors ?? []).every((item) => typeof item === 'string'), 'MATCHING: «distractors» ha de ser una llista de text; el total de respostes no pot superar 15.');
      draft = { ...base, pairs: (question.pairs || []).map((pair) => ({ left: pair.left, right: pair.right })), distractors: (question.distractors || []).join('\n') };
      break;
    }
    case 'ORDERING':
      requireValue(Array.isArray(question.items) && question.items.length >= 2 && question.items.length <= 30, 'ORDERING: «items» ha de tenir entre 2 i 30 elements.');
      requireValue(question.items.every((item) => typeof item === 'string' && item.trim() && item.length <= 500), 'ORDERING: cada element ha de ser una cadena de text no buida de fins a 500 caràcters.');
      draft = { ...base, items: question.items.map((text) => ({ id: uid(), text })) };
      break;
    case 'IMAGE_LABEL':
      requireValue(typeof question.image === 'string', 'IMAGE_LABEL: cal incloure «image» amb una imatge data URI.');
      requireValue(Array.isArray(question.markers) && question.markers.length >= 1 && question.markers.length <= 30, 'IMAGE_LABEL: «markers» ha de tenir entre 1 i 30 punts.');
      requireValue(question.markers.every((point) => Number.isFinite(point.x) && point.x >= 0 && point.x <= 100 && Number.isFinite(point.y) && point.y >= 0 && point.y <= 100 && typeof point.label === 'string'), 'IMAGE_LABEL: cada punt necessita «x» i «y» entre 0 i 100 i una «label» de text.');
      requireValue(typeof (question.predefined ?? false) === 'boolean' && Array.isArray(question.extraLabels ?? []) && (question.extraLabels ?? []).every((label) => typeof label === 'string'), 'IMAGE_LABEL: «predefined» ha de ser boolean i «extraLabels» una llista de text.');
      draft = {
        ...base,
        points_: (question.markers || []).map((point) => ({ id: uid(), x: point.x, y: point.y, label: point.label })),
        predefined: question.predefined ?? false,
        extraLabels: (question.extraLabels || []).join('\n'),
      };
      break;
    case 'SHORT_TEXT':
      requireValue(Array.isArray(question.accepted ?? []) && (question.accepted ?? []).every((item) => typeof item === 'string'), 'SHORT_TEXT: «accepted» ha de ser una llista de text.');
      requireValue(question.regex == null || (typeof question.regex === 'string' && question.regex.length <= 200), 'SHORT_TEXT: «regex» ha de ser text de fins a 200 caràcters.');
      if (question.regex) {
        try { new RegExp(question.regex); } catch { throw new Error('SHORT_TEXT: «regex» no és una expressió regular vàlida.'); }
      }
      draft = { ...base, accepted: (question.accepted || []).join('\n'), regex: question.regex || '' };
      break;
    case 'LONG_TEXT':
      requireValue(question.reference == null || typeof question.reference === 'string', 'LONG_TEXT: «reference» ha de ser text.');
      draft = { ...base, reference: question.reference || '' };
      break;
    case 'IMAGE_UPLOAD':
      draft = base;
      break;
    default:
      throw new Error(`Tipus de pregunta no admès: ${question.type}`);
  }
  requireValue(typeof draft.required === 'boolean' && typeof draft.shuffleOptions === 'boolean', `${question.type}: «required» i «shuffleOptions» han de ser booleans.`);
  requireValue(Number.isFinite(Number(draft.points)) && Number(draft.points) >= 0, `${question.type}: «points» ha de ser un nombre igual o superior a zero.`);
  if (question.image != null) requireValue(typeof question.image === 'string' && question.image.length <= 7 * 1024 * 1024 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(question.image), `${question.type}: «image» ha de ser una data URI PNG, JPEG, WebP o GIF de màxim 5 MiB.`);
  const error = validateDraft(draft.type === 'IMAGE_LABEL' ? { ...draft, imageUrl: 'pending-image-upload' } : draft);
  requireValue(!error, `${question.type}: ${error}`);
  requireValue(typeof draft.text === 'string' && draft.text.length <= 5000, `${question.type}: «text» no pot superar els 5000 caràcters.`);
  requireValue(Number(draft.points) <= 1000, `${question.type}: «points» no pot superar 1000.`);
  return draft;
}

export function parsePortableQuiz(data) {
  requireValue(data && typeof data === 'object' && !Array.isArray(data), 'El fitxer ha de contenir un objecte JSON.');
  requireValue(data.format === PORTABLE_FORMAT, `El camp «format» ha de ser «${PORTABLE_FORMAT}».`);
  requireValue(data.version === PORTABLE_VERSION, `Versió no compatible: ${data.version}.`);
  requireValue(typeof data.title === 'string' && data.title.trim(), 'Falta el títol de l’entrega.');
  requireValue(data.title.length <= 200, 'El títol no pot superar els 200 caràcters.');
  requireValue(typeof (data.description ?? '') === 'string' && (data.description ?? '').length <= 5000, 'La descripció no pot superar els 5000 caràcters.');
  requireValue(Array.isArray(data.questions) && data.questions.length > 0, 'L’entrega ha de contenir almenys una pregunta.');
  requireValue(data.questions.length <= 200, 'L’entrega no pot contenir més de 200 preguntes.');
  const settings = data.settings || {};
  requireValue(settings && typeof settings === 'object' && !Array.isArray(settings), '«settings» ha de ser un objecte.');
  const quiz = {
    title: data.title.trim(),
    description: data.description || '',
    maxScore: settings.maxScore ?? 10,
    shuffleQuestions: settings.shuffleQuestions ?? false,
    allowRetry: settings.allowRetry ?? false,
    maxAttempts: settings.maxAttempts ?? 1,
    negativePenalty: settings.negativePenalty ?? 0,
    gradeToExport: settings.gradeToExport ?? 'BEST',
    showResults: settings.showResults ?? 'SCORE',
    showResultsFrom: settings.showResultsFrom ?? null,
  };
  requireValue(Number.isFinite(quiz.maxScore) && quiz.maxScore > 0 && quiz.maxScore <= 1000, '«settings.maxScore» ha de ser superior a zero i com a màxim 1000.');
  requireValue(typeof quiz.shuffleQuestions === 'boolean' && typeof quiz.allowRetry === 'boolean', '«settings.shuffleQuestions» i «settings.allowRetry» han de ser booleans.');
  requireValue(Number.isInteger(quiz.maxAttempts) && quiz.maxAttempts >= 1 && quiz.maxAttempts <= 100, '«settings.maxAttempts» ha de ser un enter entre 1 i 100.');
  requireValue(Number.isFinite(quiz.negativePenalty) && quiz.negativePenalty >= 0 && quiz.negativePenalty <= 1, '«settings.negativePenalty» ha de ser un nombre entre 0 i 1.');
  requireValue(['BEST', 'LAST'].includes(quiz.gradeToExport), '«settings.gradeToExport» ha de ser «BEST» o «LAST».');
  requireValue(['NONE', 'SCORE', 'FULL'].includes(quiz.showResults), '«settings.showResults» ha de ser «NONE», «SCORE» o «FULL».');
  if (quiz.showResultsFrom !== null) {
    requireValue(typeof quiz.showResultsFrom === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(quiz.showResultsFrom) && !Number.isNaN(Date.parse(quiz.showResultsFrom)), '«settings.showResultsFrom» ha de ser una data ISO 8601 amb zona horària o null.');
    quiz.showResultsFrom = new Date(quiz.showResultsFrom).toISOString();
  }
  const drafts = data.questions.map(importQuestionToDraft);
  return { ...quiz, drafts };
}