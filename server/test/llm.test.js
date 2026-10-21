const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateAnswers, llmOptions, modelList } = require('../src/services/llm');

const input = {
  provider: 'openai',
  apiKey: 'openai-test-key',
  model: 'gpt-test-model',
  questionText: 'Explica la fotosíntesi',
  expectedAnswer: 'Transformació de llum en energia química',
  maxPoints: 4,
  criteria: 'Valora exactitud i completesa',
  answers: [{ answerId: 24, value: 'Les plantes fan servir la llum' }],
};

function openAIResponse(evaluations) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ evaluations }) } }] }),
  };
}

test('requests structured grading from OpenAI and validates the result', async () => {
  let request;
  const evaluations = await evaluateAnswers({
    ...input,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return openAIResponse([{ answerId: 24, score: 2.5, feedback: 'Resposta parcial.' }]);
    },
  });

  assert.deepEqual(evaluations, [{ answerId: 24, score: 2.5, feedback: 'Resposta parcial.' }]);
  assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer openai-test-key');
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.model, 'gpt-test-model');
  assert.deepEqual(payload.response_format, { type: 'json_object' });
  assert.match(payload.messages[1].content, /Explica la fotosíntesi/);
  assert.match(payload.messages[1].content, /Puntuació màxima: 4/);
});

test('requires an OpenAI API key and rejects out-of-range scores', async () => {
  await assert.rejects(evaluateAnswers({ ...input, apiKey: '' }), /OPENAI_API_KEY/);
  await assert.rejects(evaluateAnswers({
    ...input,
    fetchImpl: async () => openAIResponse([{ answerId: 24, score: 5, feedback: 'Fora de rang.' }]),
  }), /puntuació o resposta invàlida/);
});

test('rejects an unsupported provider', async () => {
  await assert.rejects(evaluateAnswers({ ...input, provider: 'other' }), /LLM_PROVIDER/);
});

test('reads the model list from the active provider .env value', () => {
  const env = { LLM_PROVIDER: 'openai', OPENAI_MODEL: 'gpt-a, gpt-b ,, gpt-a', GEMINI_MODEL: 'gem-a' };
  assert.deepEqual(modelList('openai', env), ['gpt-a', 'gpt-b']);
  assert.deepEqual(modelList('gemini', env), ['gem-a']);
  assert.deepEqual(llmOptions(env), { provider: 'openai', models: ['gpt-a', 'gpt-b'] });
});

test('falls back to the default model when the list is empty', () => {
  assert.deepEqual(modelList('openai', { OPENAI_MODEL: ' ' }), ['gpt-4.1-mini']);
  assert.deepEqual(modelList('gemini', {}), ['gemini-2.5-flash']);
});