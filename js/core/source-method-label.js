// O método das fontes fica salvo no estado do escritório; textos antigos são trocados só na exibição.
const LEGACY_METHOD_LABELS = new Map([['agente local seguro', 'Coleta no servidor']]);

export const sourceMethodLabel = method => LEGACY_METHOD_LABELS.get(String(method || '').trim().toLowerCase()) || method;
