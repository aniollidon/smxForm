const { evaluateAnswers: evaluateWithProvider } = require('./llm');

const evaluateAnswers = (options) => evaluateWithProvider({ ...options, provider: 'gemini' });

module.exports = { evaluateAnswers };