// Concordância de número para textos que o usuário lê.
// Singular só para 1 (ou -1); zero e demais valores usam o plural.

export function isSingular(count) {
  return Math.abs(Number(count)) === 1;
}

export function plural(count, singular, pluralForm) {
  return isSingular(count) ? singular : pluralForm;
}

// "3 publicações", "1 publicação".
export function contar(count, singular, pluralForm) {
  const n = Number(count) || 0;
  return `${n} ${plural(n, singular, pluralForm)}`;
}
