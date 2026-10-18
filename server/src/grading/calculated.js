// Preguntes calculades (estil Moodle): variables {a} amb rang aleatori per intent i resposta numèrica per fórmula.
const { rng } = require('./rng');

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,19}$/;
const MAX_FORMULA = 500;

const FUNCTIONS = {
  abs: Math.abs, acos: Math.acos, asin: Math.asin, atan: Math.atan, atan2: Math.atan2, ceil: Math.ceil,
  cos: Math.cos, deg2rad: (x) => (x * Math.PI) / 180, exp: Math.exp, floor: Math.floor, log: Math.log,
  log10: Math.log10, max: Math.max, min: Math.min, pow: Math.pow, rad2deg: (x) => (x * 180) / Math.PI,
  round: Math.round, sin: Math.sin, sqrt: Math.sqrt, tan: Math.tan,
};

function tokenize(src) {
  if (src.length > MAX_FORMULA) throw new Error('Fórmula massa llarga');
  const tokens = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|\{([A-Za-z][A-Za-z0-9_]*)\}|([A-Za-z][A-Za-z0-9_]*)|(\*\*|[-+*/%^(),]))/y;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) {
      if (!src.slice(pos).trim()) break;
      throw new Error(`Caràcter no vàlid a la fórmula: «${src.slice(pos).trim()[0]}»`);
    }
    pos = re.lastIndex;
    if (m[1] !== undefined) tokens.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ t: 'var', v: m[2] });
    else if (m[3] !== undefined) tokens.push({ t: 'id', v: m[3] });
    else tokens.push({ t: 'op', v: m[4] });
  }
  return tokens;
}

function parse(src) {
  const tokens = tokenize(src);
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (v) => peek()?.t === 'op' && peek().v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new Error(`S'esperava «${v}» a la fórmula`);
    i++;
  };

  function expr() {
    let left = term();
    while (isOp('+') || isOp('-')) {
      const op = tokens[i++].v;
      const l = left;
      const r = term();
      left = op === '+' ? (env) => l(env) + r(env) : (env) => l(env) - r(env);
    }
    return left;
  }
  function term() {
    let left = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = tokens[i++].v;
      const l = left;
      const r = unary();
      left = op === '*' ? (env) => l(env) * r(env) : op === '/' ? (env) => l(env) / r(env) : (env) => l(env) % r(env);
    }
    return left;
  }
  function unary() {
    if (isOp('-')) { i++; const f = unary(); return (env) => -f(env); }
    if (isOp('+')) { i++; return unary(); }
    return power();
  }
  function power() {
    const base = primary();
    if (isOp('**') || isOp('^')) {
      i++;
      const exp = unary();
      return (env) => Math.pow(base(env), exp(env));
    }
    return base;
  }
  function primary() {
    const tok = tokens[i++];
    if (!tok) throw new Error('Fórmula incompleta');
    if (tok.t === 'num') return () => tok.v;
    if (tok.t === 'var') {
      return (env) => {
        if (!(tok.v in env)) throw new Error(`Variable desconeguda: {${tok.v}}`);
        return env[tok.v];
      };
    }
    if (tok.t === 'id') {
      if (tok.v === 'pi') {
        if (isOp('(')) { i++; expect(')'); }
        return () => Math.PI;
      }
      const fn = Object.hasOwn(FUNCTIONS, tok.v) ? FUNCTIONS[tok.v] : null;
      if (!fn) throw new Error(`Funció desconeguda: ${tok.v}`);
      expect('(');
      const args = [];
      if (!isOp(')')) {
        args.push(expr());
        while (isOp(',')) { i++; args.push(expr()); }
      }
      expect(')');
      if (!args.length) throw new Error(`La funció ${tok.v} necessita arguments`);
      return (env) => fn(...args.map((a) => a(env)));
    }
    if (tok.v === '(') {
      const e = expr();
      expect(')');
      return e;
    }
    throw new Error(`Símbol inesperat a la fórmula: «${tok.v}»`);
  }

  const ast = expr();
  if (i < tokens.length) throw new Error(`Símbol inesperat a la fórmula: «${tokens[i].v}»`);
  return ast;
}

function evaluate(src, env) {
  const result = parse(src)(env);
  if (!Number.isFinite(result)) throw new Error('La fórmula no té un resultat numèric finit');
  return result;
}

const asObject = (x) => (typeof x === 'string' ? JSON.parse(x) : x || {});

function generateValues(variables, seed, salt) {
  const r = rng(seed + salt * 7919);
  const values = {};
  for (const v of variables) {
    if (v.mode === 'list') {
      values[v.name] = v.values[Math.floor(r() * v.values.length)];
    } else {
      const raw = v.min + r() * (v.max - v.min);
      values[v.name] = Math.min(v.max, Math.max(v.min, Number(raw.toFixed(v.decimals))));
    }
  }
  return values;
}

const fmtValue = (variable, n) => (variable.mode === 'list' ? String(n) : n.toFixed(variable.decimals));

function renderText(text, variables, values) {
  const byName = new Map(variables.map((v) => [v.name, v]));
  return text
    .replace(/\{=((?:[^{}]|\{[A-Za-z][A-Za-z0-9_]*\})*)\}/g, (all, f) => {
      try { return String(Number(evaluate(f, values).toPrecision(10))); } catch { return all; }
    })
    .replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (all, name) => (byName.has(name) ? fmtValue(byName.get(name), values[name]) : all));
}

// Valors, enunciat i resposta esperada d'una pregunta per a un intent (determinista segons la llavor).
function instantiate(question, seed) {
  const config = asObject(question.config);
  const key = asObject(question.answerKey);
  const variables = config.variables || [];
  const base = Number(seed) + Number(question.id || 0) * 31;
  let lastError;
  for (let salt = 0; salt < 20; salt++) {
    const values = generateValues(variables, base, salt);
    try {
      const expected = evaluate(key.formula, values);
      return { values, expected, text: renderText(question.text, variables, values) };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

function parseAnswer(value) {
  const s = String(value ?? '').trim().replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NaN;
  return Number(s);
}

function isCorrect(value, expected, key) {
  const v = parseAnswer(value);
  if (!Number.isFinite(v)) return false;
  const tol = Number(key.tolerance) || 0;
  const allowed = key.toleranceType === 'relative' ? Math.abs(expected) * tol : tol;
  return Math.abs(v - expected) <= allowed + 1e-9 * Math.max(1, Math.abs(expected));
}

function gradeCalculated(question, value) {
  try {
    const { expected } = instantiate(question, question.seed ?? 0);
    return isCorrect(value, expected, asObject(question.answerKey));
  } catch {
    return false;
  }
}

// Aplica la instància de l'intent a una pregunta ja parsejada (per mostrar-la a alumne/professor).
function personalize(question, seed) {
  if (question.type !== 'CALCULATED') return question;
  const { text, expected } = instantiate(question, seed);
  return { ...question, text, answerKey: { ...question.answerKey, expected: Number(expected.toPrecision(10)) } };
}

// Retorna un missatge d'error o null.
function validateDefinition(text, config, key) {
  const vars = config.variables || [];
  const names = new Set();
  for (const v of vars) {
    if (!NAME.test(v.name)) return `Nom de variable invàlid: «${v.name}»`;
    if (names.has(v.name)) return `Variable repetida: «${v.name}»`;
    names.add(v.name);
    if (v.mode === 'list') {
      if (!Array.isArray(v.values) || v.values.length < 1 || v.values.length > 100 || !v.values.every(Number.isFinite)) return `Llista invàlida a {${v.name}}: indica d'1 a 100 nombres`;
    } else if (v.min > v.max) return `Rang invàlid a {${v.name}}: el mínim supera el màxim`;
  }
  if (!key.formula || !key.formula.trim()) return 'Indica la fórmula de la resposta';
  try {
    evaluate(key.formula, Object.fromEntries(vars.map((v) => [v.name, v.min])));
  } catch (e) {
    if (!/finit/.test(e.message)) return e.message;
  }
  for (const [, f] of text.matchAll(/\{=((?:[^{}]|\{[A-Za-z][A-Za-z0-9_]*\})*)\}/g)) {
    try { parse(f); } catch (e) { return `Fórmula a l'enunciat: ${e.message}`; }
  }
  try {
    instantiate({ id: 0, text, config, answerKey: key }, 1);
  } catch (e) {
    return `La fórmula no dona un resultat vàlid amb els rangs indicats (${e.message})`;
  }
  return null;
}

module.exports = { evaluate, instantiate, gradeCalculated, personalize, validateDefinition, parseAnswer, isCorrect };
