const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateAnswers } = require('../src/services/gemini');

const input = {
  apiKey: 'test-key',
  model: 'gemini-test',
  questionText: 'Explica la fotosíntesi',
  expectedAnswer: 'Transformació de llum en energia química',
  maxPoints: 4,
  criteria: 'Valora exactitud i completesa',
  answers: [{ answerId: 12, value: 'Les plantes fan servir la llum' }],
};

function responseWith(evaluations) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ evaluations }) }] } }] }),
  };
}

test('sends the requested prompt and returns validated grading suggestions', async () => {
  let request;
  const result = await evaluateAnswers({
    ...input,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return responseWith([{ answerId: 12, score: 2.5, feedback: 'Resposta parcial.' }]);
    },
  });
  assert.deepEqual(result, [{ answerId: 12, score: 2.5, feedback: 'Resposta parcial.' }]);
  assert.match(request.url, /gemini-test:generateContent/);
  const prompt = JSON.parse(request.options.body).contents[0].parts[0].text;
  assert.match(prompt, /Explica la fotosíntesi/);
  assert.match(prompt, /Transformació de llum en energia química/);
  assert.match(prompt, /Valora exactitud i completesa/);
  assert.match(prompt, /Puntuació màxima: 4/);
});

test('rejects missing configuration and invalid model scores', async () => {
  await assert.rejects(evaluateAnswers({ ...input, apiKey: '' }), /GEMINI_API_KEY/);
  await assert.rejects(evaluateAnswers({
    ...input,
    fetchImpl: async () => responseWith([{ answerId: 12, score: 5, feedback: 'Massa alta' }]),
  }), /puntuació o resposta invàlida/);
});

test('rejects incomplete model evaluations', async () => {
  await assert.rejects(evaluateAnswers({
    ...input,
    answers: [...input.answers, { answerId: 13, value: 'Una altra resposta' }],
    fetchImpl: async () => responseWith([{ answerId: 12, score: 2, feedback: 'Parcial' }]),
  }), /no ha avaluat totes les respostes seleccionades/);
});
