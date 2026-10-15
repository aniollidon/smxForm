const gradeFormatter = new Intl.NumberFormat('ca-ES', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatGrade(value) {
  if (value == null || value === '') return '—';
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? gradeFormatter.format(numericValue) : '—';
}