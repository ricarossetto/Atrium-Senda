// Synthetic transport for test processes only. No production switch or live court traffic.
export function syntheticCnj(sequence = 1, segment = '821', year = '2099', origin = '0000') {
  const seq = String(sequence).padStart(7, '0');
  const base = seq + year + segment + origin;
  return seq + String(98n - BigInt(base + '00') % 97n).padStart(2, '0') + year + segment + origin;
}
export const CNJ = syntheticCnj();
export const omniTestEnv = { NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import="${import.meta.url}"` };
export function snapshot(cnj = CNJ) {
  return { cnj, metadata: { cnj, rawCnj: cnj, court: 'TJRS', district: 'Comarca Sintética',
    judicialUnit: 'Vara Sintética', processClass: 'Ação Sintética', isSecret: false },
    parties: [{ name: 'Parte Adversa Sintética', role: 'REU', lawyers: [{ name: 'Advogada Sintética', oabNumber: '000000', oabUf: 'RS' }] }],
    movements: [{ eventNumber: 1, date: '2099-01-02T10:00:00Z', description: 'Movimento sintético' }] };
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    if (url.port === '3100') throw new Error('Synthetic sidecar offline');
    return originalFetch(input, options);
  }
  const response = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.hostname === 'consulta-processual-service.tjrs.jus.br') {
    if (url.pathname.includes('/advogado/')) return response([{ cnj: CNJ }]);
    if (url.pathname.includes('/processos/')) return response(snapshot(url.pathname.split('/').at(-1)));
    return response({ status: 'UP' });
  }
  if (url.hostname === 'comunicaapi.pje.jus.br') return response({ items: [], count: 0 });
  if (url.hostname === 'api-publica.datajud.cnj.jus.br') {
    const query = JSON.parse(options.body || '{}');
    const cnj = query.query?.match_phrase?.numeroProcesso || CNJ;
    return response({ hits: { hits: [{ _source: { numeroProcesso: cnj, tribunal: 'TRF4', classe: { nome: 'Classe Sintética' }, movimentos: [] } }] } });
  }
  throw new Error('External network forbidden in synthetic test');
};
