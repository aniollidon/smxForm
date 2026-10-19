let n = 0;
export const uid = () => `i${Date.now().toString(36)}${n++}`;

export const TYPE_LABELS = {
  MCQ: 'Test',
  TRUE_FALSE: 'Cert/Fals',
  MATCHING: 'Relacionar',
  ORDERING: 'Ordenar',
  IMAGE_LABEL: 'Etiquetar imatge',
  SHORT_TEXT: 'Text breu',
  CALCULATED: 'Fórmula',
  LONG_TEXT: 'Text llarg',
  IMAGE_UPLOAD: 'Pujar imatge',
  DRAWING: 'Dibuixar sobre imatge',
  FILL_BLANKS: 'Omplir buits',
};

// Un buit és una seqüència de 3 o més guions baixos a l'enunciat.
export const BLANK_PATTERN = /_{3,}/g;
export const countBlanks = (text) => (String(text).match(BLANK_PATTERN) || []).length;
export const splitBlanks = (text) => String(text).split(/_{3,}/);
const alternatives = (s) => String(s ?? '').split('|').map((x) => x.trim()).filter(Boolean);
const isNumericText = (value) => {
  const normalized = String(value ?? '').trim().replace(',', '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(normalized) && Number.isFinite(Number(normalized));
};

const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export function emptyDraft(type) {
  const base = { type, text: '', imageUrl: null, points: 1, required: true, shuffleOptions: ['MCQ', 'MATCHING', 'ORDERING', 'IMAGE_LABEL'].includes(type), allowClipboard: false };
  switch (type) {
    case 'MCQ':
      return { ...base, multiple: false, allOrNothing: false, opts: [{ id: uid(), text: '', correct: true }, { id: uid(), text: '', correct: false }] };
    case 'TRUE_FALSE':
      return { ...base, correct: true };
    case 'MATCHING':
      return { ...base, allOrNothing: false, pairs: [{ left: '', right: '' }, { left: '', right: '' }], distractors: '' };
    case 'ORDERING':
      return { ...base, allOrNothing: false, items: [{ id: uid(), text: '' }, { id: uid(), text: '' }] };
    case 'IMAGE_LABEL':
      return { ...base, points_: [], predefined: false, extraLabels: '' };
    case 'SHORT_TEXT':
      return { ...base, accepted: '', regex: '', numericAnswer: false };
    case 'FILL_BLANKS':
      return { ...base, blanks: [], numericBlanks: [] };
    case 'CALCULATED':
      return { ...base, vars: [{ name: 'a', mode: 'range', min: 1, max: 10, decimals: 0, values: '' }], formula: '', tolerance: 0, toleranceType: 'nominal', numericAnswer: true };
    case 'LONG_TEXT':
      return { ...base, reference: '' };
    case 'DRAWING':
      return { ...base, color: '#e11d48', width: 4 };
    default:
      return base;
  }
}

export function fromQuestion(q) {
  const { type, config: c, answerKey: k } = q;
  const base = { id: q.id, type, text: q.text, imageUrl: q.imageUrl, points: q.points, required: q.required, shuffleOptions: q.shuffleOptions, allowClipboard: !!c.allowClipboard };
  switch (type) {
    case 'MCQ':
      return { ...base, multiple: c.multiple, allOrNothing: !!k.allOrNothing, opts: c.options.map((o) => ({ ...o, correct: k.correct.includes(o.id) })) };
    case 'TRUE_FALSE':
      return { ...base, correct: k.correct };
    case 'MATCHING': {
      const used = new Set(Object.values(k.pairs));
      return {
        ...base,
        allOrNothing: !!k.allOrNothing,
        pairs: c.left.map((l) => ({ left: l.text, right: c.right.find((r) => r.id === k.pairs[l.id])?.text ?? '' })),
        distractors: c.right.filter((r) => !used.has(r.id)).map((r) => r.text).join('\n'),
      };
    }
    case 'ORDERING': {
      const itemsById = new Map(c.items.map((item) => [item.id, item]));
      return { ...base, allOrNothing: !!k.allOrNothing, items: (k.order || []).map((id) => itemsById.get(id)).filter(Boolean) };
    }
    case 'IMAGE_LABEL': {
      const usedLabels = new Set(Object.values(k.labels));
      return {
        ...base,
        points_: c.points.map((p) => ({ ...p, label: k.labels[p.id] ?? '', numeric: !!p.numeric })),
        predefined: !!c.labels,
        extraLabels: (c.labels || []).filter((l) => !usedLabels.has(l)).join('\n'),
      };
    }
    case 'SHORT_TEXT':
      return { ...base, accepted: (k.accepted || []).join('\n'), regex: k.regex || '', numericAnswer: !!c.numericAnswer };
    case 'FILL_BLANKS':
      return { ...base, blanks: (k.blanks || []).map((list) => list.join(' | ')), numericBlanks: c.numericBlanks || [] };
    case 'LONG_TEXT':
      return { ...base, reference: k.reference || '' };
    case 'DRAWING':
      return { ...base, color: c.color || '#e11d48', width: c.width || 4 };
    case 'CALCULATED':
      return { ...base, vars: c.variables.map((v) => ({ ...v, mode: v.mode || 'range', values: (v.values || []).join('\n') })), formula: k.formula || '', tolerance: k.tolerance ?? 0, toleranceType: k.toleranceType || 'nominal', numericAnswer: c.numericAnswer !== false };
    default:
      return base;
  }
}

export function toPayload(d) {
  const p = { type: d.type, text: d.text, imageUrl: d.imageUrl || null, points: Number(d.points), required: d.required, shuffleOptions: d.shuffleOptions, config: {}, answerKey: {} };
  switch (d.type) {
    case 'MCQ':
      p.config = { options: d.opts.map(({ id, text }) => ({ id, text })), multiple: d.multiple };
      p.answerKey = { correct: d.opts.filter((o) => o.correct).map((o) => o.id), allOrNothing: !!d.allOrNothing };
      break;
    case 'TRUE_FALSE':
      p.answerKey = { correct: d.correct };
      break;
    case 'MATCHING': {
      const left = d.pairs.map((x, i) => ({ id: `l${i}`, text: x.left }));
      const right = d.pairs.map((x, i) => ({ id: `r${i}`, text: x.right }));
      lines(d.distractors).forEach((t, i) => right.push({ id: `d${i}`, text: t }));
      p.config = { left, right };
      p.answerKey = { pairs: Object.fromEntries(d.pairs.map((_, i) => [`l${i}`, `r${i}`])), allOrNothing: !!d.allOrNothing };
      break;
    }
    case 'ORDERING':
      p.config = { items: d.items.map(({ id, text }) => ({ id, text })) };
      p.answerKey = { order: d.items.map((item) => item.id), allOrNothing: !!d.allOrNothing };
      break;
    case 'IMAGE_LABEL': {
      p.config = {
        points: d.points_.map(({ id, x, y, numeric }) => ({ id, x, y, numeric: !!numeric })),
        labels: d.predefined ? [...new Set([...d.points_.map((x) => x.label.trim()), ...lines(d.extraLabels)].filter(Boolean))] : null,
      };
      p.answerKey = { labels: Object.fromEntries(d.points_.map((x) => [x.id, x.label.trim()])) };
      break;
    }
    case 'SHORT_TEXT':
      p.config = { numericAnswer: !!d.numericAnswer };
      p.answerKey = { accepted: lines(d.accepted), ...(d.regex ? { regex: d.regex } : {}) };
      break;
    case 'FILL_BLANKS':
      p.config = { numericBlanks: Array.from({ length: countBlanks(d.text) }, (_, i) => !!d.numericBlanks?.[i]) };
      p.answerKey = { blanks: Array.from({ length: countBlanks(d.text) }, (_, i) => alternatives(d.blanks[i])) };
      break;
    case 'LONG_TEXT':
      p.answerKey = { reference: d.reference };
      break;
    case 'DRAWING':
      p.config = { color: d.color, width: Number(d.width) };
      break;
    case 'CALCULATED':
      p.config = { variables: d.vars.map((v) => ({
        name: v.name.trim(), mode: v.mode || 'range', min: Number(v.min), max: Number(v.max), decimals: Number(v.decimals),
        ...(v.mode === 'list' ? { values: lines(v.values).map((value) => Number(value.replace(',', '.'))) } : {}),
      })), numericAnswer: !!d.numericAnswer };
      p.answerKey = { formula: d.formula.trim(), tolerance: Number(d.tolerance) || 0, toleranceType: d.toleranceType };
      break;
  }
  p.config.allowClipboard = !!d.allowClipboard;
  return p;
}

export function validateDraft(d) {
  if (!d.text.trim()) return 'Escriu l\'enunciat';
  if (!(Number(d.points) >= 0)) return 'Punts invàlids';
  switch (d.type) {
    case 'MCQ':
      if (d.opts.some((o) => !o.text.trim())) return 'Totes les opcions necessiten text';
      if (!d.opts.some((o) => o.correct)) return 'Marca almenys una opció correcta';
      break;
    case 'MATCHING':
      if (d.pairs.some((x) => !x.left.trim() || !x.right.trim())) return 'Completa totes les parelles';
      break;
    case 'ORDERING':
      if (d.items.length < 2 || d.items.length > 30 || d.items.some((item) => !item.text.trim() || item.text.length > 500)) return 'Afegeix de 2 a 30 elements amb text de fins a 500 caràcters';
      break;
    case 'IMAGE_LABEL':
      if (!d.imageUrl) return 'Puja una imatge';
      if (!d.points_.length) return 'Clica sobre la imatge per afegir punts';
      if (d.points_.some((x) => !x.label.trim())) return 'Cada punt necessita una etiqueta';
      if (d.points_.some((x) => x.numeric && !isNumericText(x.label))) return 'Cada etiqueta marcada com a número necessita una resposta numèrica';
      break;
    case 'DRAWING':
      if (!d.imageUrl) return 'Puja una imatge base';
      if (!/^#[0-9a-fA-F]{6}$/.test(d.color) || !(Number(d.width) >= 1 && Number(d.width) <= 40)) return 'Color o mida del traç invàlids';
      break;
    case 'SHORT_TEXT':
      if (!lines(d.accepted).length && !d.regex) return 'Indica almenys una resposta acceptada';
      if (d.numericAnswer && lines(d.accepted).some((answer) => !isNumericText(answer))) return 'Les respostes acceptades han de ser nombres';
      break;
    case 'FILL_BLANKS': {
      const n = countBlanks(d.text);
      if (n < 1 || n > 20) return 'L\'enunciat ha de tenir d\'1 a 20 buits (escriu ___ on vulguis un buit)';
      for (let i = 0; i < n; i++) {
        const list = alternatives(d.blanks[i]);
        if (!list.length) return `Indica la resposta del buit ${i + 1}`;
        if (list.length > 20 || list.some((x) => x.length > 200)) return `El buit ${i + 1} admet fins a 20 respostes de 200 caràcters`;
        if (d.numericBlanks?.[i] && list.some((answer) => !isNumericText(answer))) return `Les respostes acceptades del buit ${i + 1} han de ser nombres`;
      }
      break;
    }
    case 'CALCULATED': {
      if (!d.vars.length) return 'Defineix almenys una variable';
      const names = new Set();
      for (const v of d.vars) {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,19}$/.test(v.name.trim())) return `Nom de variable invàlid: «${v.name}»`;
        if (names.has(v.name.trim())) return `Variable repetida: «${v.name}»`;
        names.add(v.name.trim());
        if (!['range', 'list'].includes(v.mode || 'range')) return `Mode de generació invàlid a {${v.name}}`;
        if (v.mode === 'list') {
          const values = lines(v.values);
          if (!values.length || values.length > 100 || values.some((value) => !Number.isFinite(Number(value.replace(',', '.'))))) return `Llista invàlida a {${v.name}}: indica d'1 a 100 nombres`;
        } else {
          if (![v.min, v.max].every((n) => v.min !== '' && v.max !== '' && Number.isFinite(Number(n)))) return `Rang invàlid a {${v.name}}`;
          if (Number(v.min) > Number(v.max)) return `A {${v.name}} el mínim supera el màxim`;
          if (!Number.isInteger(Number(v.decimals)) || v.decimals < 0 || v.decimals > 10) return `Decimals invàlids a {${v.name}}`;
        }
      }
      if (!d.formula.trim()) return 'Indica la fórmula de la resposta';
      if (!(Number(d.tolerance) >= 0)) return 'Tolerància invàlida';
      break;
    }
  }
  return null;
}
