// Text pla de la resposta d'un alumne, per passar-la com a context al model LLM.
function describeAnswer(question, value) {
  if (value == null || value === '') return '(sense resposta)';
  const config = question.config || {};
  const text = (list, id) => (config[list] || []).find((entry) => entry.id === id)?.text ?? id;
  switch (question.type) {
    case 'MCQ': return value.map((id) => text('options', id)).join(', ');
    case 'TRUE_FALSE': return value ? 'Cert' : 'Fals';
    case 'MATCHING': return Object.entries(value).map(([left, right]) => `${text('left', left)} -> ${text('right', right)}`).join('; ');
    case 'ORDERING': return value.map((id) => text('items', id)).join(' > ');
    case 'IMAGE_LABEL': return (config.points || []).map((point, index) => `${index + 1}: ${value[point.id] || '-'}`).join('; ');
    case 'FILL_BLANKS': return value.map((blank, index) => `${index + 1}: ${blank || '-'}`).join('; ');
    case 'TABLE': return (config.rows || []).map((row, index) => `${row}: ${(config.columns || []).map((column, j) => `${column} = ${value[index]?.[j] || '-'}`).join(', ')}`).join('; ');
    case 'IMAGE_UPLOAD':
    case 'DRAWING': return '(fitxer o dibuix, no disponible en text)';
    default: return String(value);
  }
}

module.exports = { describeAnswer };
