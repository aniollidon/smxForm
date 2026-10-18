// Un buit és una seqüència de 3 o més guions baixos a l'enunciat.
const BLANK_PATTERN = /_{3,}/g;

const countBlanks = (text) => (String(text).match(BLANK_PATTERN) || []).length;

module.exports = { BLANK_PATTERN, countBlanks };
