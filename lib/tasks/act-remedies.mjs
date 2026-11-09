/**
 * ATRIUM — Tipo do ato e providências cabíveis (publicação → recurso ou resposta).
 *
 * Determinístico e sem modelo: lê o rótulo e o texto da publicação, identifica o tipo do ato e aponta
 * o que cabe contra ele, com o dispositivo legal e o modelo de tarefa do escritório.
 * Só o cabimento em tese: quem decide recorrer é a pessoa, que sabe se a parte venceu ou perdeu.
 *
 * Nada aqui calcula prazo (§16 do AGENTS.md). Nenhum texto deve citar quantidade de dias.
 */


function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export const ACT_KIND_LABELS = Object.freeze({
  acordao: 'Acórdão',
  sentenca: 'Sentença',
  decisao_monocratica: 'Decisão monocrática',
  decisao_interlocutoria: 'Decisão interlocutória',
  decisao_ou_despacho: 'Despacho ou decisão',
  despacho: 'Despacho',
  desconhecido: ''
});

const TEXT_SIGNALS = Object.freeze({
  acordao: /\bacordam\b|\bpor unanimidade\b|\bpor maioria\b|\bvistos,? relatados\b/,
  sentenca: /\bjulgo (?:\w+ ){0,2}(?:im)?procedente|\bjulgo extint|\bextingo o (?:processo|feito)|\bresolvo o merito\b|\bhomologo [^.]{0,60}(?:acordo|desistencia|transacao)/,
  decisao_monocratica: /\bdecisao monocratica\b|\bnego (?:seguimento|provimento)\b|\bnao conheco do recurso\b|\bart\.? ?932\b/,
  decisao_interlocutoria: /\b(?:in)?defiro\b|\bdecido\b|\bconcedo\b|\brevogo\b|\bacolho\b|\brejeito\b|\bdecisao interlocutoria\b/,
  despacho: /\bintime-se\b|\bintimem-se\b|\bcite-se\b|\bcumpra-se\b|\bmanifeste-se\b|\bmanifestem-se\b|\bdiga a parte\b|\bdigam as partes\b|\bvista as partes\b|\bvista a parte\b/
});

const LABEL_SIGNALS = Object.freeze({
  acordao: /\bacordao\b/,
  sentenca: /\bsentenca\b/,
  decisao_monocratica: /\bmonocratica\b/,
  decisao_interlocutoria: /\bdecisao\b/,
  despacho: /\bdespacho\b|\bato ordinatorio\b/
});

const AMBIGUOUS_LABEL = /despacho\s*\/\s*decisao|decisao\s*\/\s*despacho/;
const SHORT_NOTICE_CHARS = 400;

/**
 * Tipo do ato. O rótulo da fonte manda quando é claro; "DESPACHO/DECISÃO" não diz nada, e aí vale o
 * texto. "Cumprimento de sentença" é classe do processo, não sentença.
 */
export function classifyAct({ label = '', text = '' } = {}) {
  const corpo = normalize(text).slice(0, 12_000);
  // Aviso curto (eproc) é só o nome do ato, então vale como rótulo. Em texto longo, "sentença"
  // pode ser só a menção a uma sentença antiga.
  const avisoCurto = corpo.length <= SHORT_NOTICE_CHARS ? corpo : '';
  const rotulo = `${normalize(label)} ${avisoCurto}`.replace(/cumprimento de sentenca/g, '');
  const ambiguo = AMBIGUOUS_LABEL.test(rotulo);

  if (!ambiguo) {
    for (const kind of ['acordao', 'sentenca', 'decisao_monocratica', 'decisao_interlocutoria', 'despacho']) {
      if (LABEL_SIGNALS[kind].test(rotulo)) return { kind, reason: 'Pelo rótulo informado pela fonte.' };
    }
  }
  for (const kind of ['acordao', 'sentenca', 'decisao_monocratica', 'decisao_interlocutoria']) {
    const achado = corpo.match(TEXT_SIGNALS[kind]);
    if (achado) return { kind, reason: `O texto traz "${achado[0].slice(0, 60)}".` };
  }
  if (TEXT_SIGNALS.despacho.test(corpo)) {
    return { kind: 'despacho', reason: 'O texto só traz comandos de andamento, sem decidir pedido.' };
  }
  if (ambiguo) return { kind: 'decisao_ou_despacho', reason: 'A fonte não separa despacho de decisão e o texto não permite distinguir.' };
  return { kind: 'desconhecido', reason: '' };
}

/** Ramo que muda o recurso cabível. A Justiça do Trabalho vem do próprio número CNJ. */
export function detectBranch({ processNumber = '', text = '' } = {}) {
  if (/^\d{7}-?\d{2}\.?\d{4}\.?5\./.test(String(processNumber).trim())) return 'trabalhista';
  const corpo = normalize(text).slice(0, 12_000);
  if (/\bjuizado especial\b|\bjuizados especiais\b|\blei (?:n\.? ?)?9\.099\b|\brecurso inominado\b/.test(corpo)) return 'juizado';
  if (/\bdenuncia\b|\bacao penal\b|\breu preso\b|\bpena de reclusao\b|\bpena de detencao\b/.test(corpo)) return 'criminal';
  return 'civel';
}

const REMEDIES = Object.freeze({
  apelacao: { label: 'Apelação', action: 'recorrer', legal: 'CPC, art. 1.009', models: ['recurso de apelacao', 'apelacao'] },
  agravo: { label: 'Agravo de instrumento', action: 'recorrer', legal: 'CPC, art. 1.015; conferir o rol e o Tema 988 do STJ', models: ['agravo de instrumento'] },
  embargos: { label: 'Embargos de declaração', action: 'recorrer', legal: 'CPC, art. 1.022', models: ['embargos de declaracao'] },
  agravo_interno: { label: 'Agravo interno', action: 'recorrer', legal: 'CPC, art. 1.021', models: ['agravo interno'] },
  resp: { label: 'Recurso especial', action: 'recorrer', legal: 'CF, art. 105, III; CPC, art. 1.029', models: ['recurso especial'] },
  re: { label: 'Recurso extraordinário', action: 'recorrer', legal: 'CF, art. 102, III; CPC, art. 1.029', models: ['recurso extraordinario'] },
  recurso_ordinario: { label: 'Recurso ordinário', action: 'recorrer', legal: 'CLT, art. 895', models: ['recurso ordinario'] },
  recurso_revista: { label: 'Recurso de revista', action: 'recorrer', legal: 'CLT, art. 896', models: ['recurso de revista'] },
  agravo_peticao: { label: 'Agravo de petição', action: 'recorrer', legal: 'CLT, art. 897, "a"', models: ['agravo de peticao'] },
  embargos_trabalhista: { label: 'Embargos de declaração', action: 'recorrer', legal: 'CLT, art. 897-A', models: ['embargos de declaracao'] },
  inominado: { label: 'Recurso inominado', action: 'recorrer', legal: 'Lei 9.099/95, art. 41', models: ['recurso inominado', 'apelacao/inominado'] },
  embargos_juizado: { label: 'Embargos de declaração', action: 'recorrer', legal: 'Lei 9.099/95, art. 48', models: ['embargos de declaracao'] },
  apelacao_criminal: { label: 'Apelação criminal', action: 'recorrer', legal: 'CPP, art. 593', models: ['recurso de apelacao', 'apelacao'] },
  rese: { label: 'Recurso em sentido estrito', action: 'recorrer', legal: 'CPP, art. 581', models: ['recurso em sentido estrito'] },
  embargos_criminal: { label: 'Embargos de declaração', action: 'recorrer', legal: 'CPP, art. 619', models: ['embargos de declaracao'] }
});

const REMEDIES_BY_BRANCH = Object.freeze({
  civel: {
    sentenca: ['apelacao', 'embargos'],
    decisao_interlocutoria: ['agravo', 'embargos'],
    decisao_ou_despacho: ['agravo', 'embargos'],
    decisao_monocratica: ['agravo_interno', 'embargos'],
    acordao: ['embargos', 'resp', 're']
  },
  trabalhista: {
    sentenca: ['recurso_ordinario', 'embargos_trabalhista'],
    decisao_interlocutoria: ['embargos_trabalhista'],
    decisao_ou_despacho: ['embargos_trabalhista'],
    decisao_monocratica: ['embargos_trabalhista'],
    acordao: ['embargos_trabalhista', 'recurso_revista']
  },
  juizado: {
    sentenca: ['inominado', 'embargos_juizado'],
    decisao_interlocutoria: ['embargos_juizado'],
    decisao_ou_despacho: ['embargos_juizado'],
    decisao_monocratica: ['embargos_juizado'],
    acordao: ['embargos_juizado', 're']
  },
  criminal: {
    sentenca: ['apelacao_criminal', 'embargos_criminal'],
    decisao_interlocutoria: ['rese', 'embargos_criminal'],
    decisao_ou_despacho: ['rese', 'embargos_criminal'],
    decisao_monocratica: ['agravo_interno', 'embargos_criminal'],
    acordao: ['embargos_criminal', 'resp', 're']
  }
});

const BRANCH_NOTES = Object.freeze({
  trabalhista: {
    decisao_interlocutoria: 'No processo do trabalho, a decisão interlocutória em regra não admite recurso imediato (CLT, art. 893, § 1º). Em execução, confira o agravo de petição.',
    decisao_ou_despacho: 'No processo do trabalho, a decisão interlocutória em regra não admite recurso imediato (CLT, art. 893, § 1º). Em execução, confira o agravo de petição.'
  },
  juizado: {
    decisao_interlocutoria: 'No juizado especial, a decisão interlocutória em regra não admite recurso próprio. Confira a hipótese de mandado de segurança.',
    decisao_ou_despacho: 'No juizado especial, a decisão interlocutória em regra não admite recurso próprio. Confira a hipótese de mandado de segurança.'
  }
});

/** O que o próprio texto manda fazer. Vem antes do recurso porque é o que o juízo pediu. */
const DETERMINATIONS = Object.freeze([
  { label: 'Contrarrazões', action: 'manifestar', signal: /\b(?:apresent|oferec|intim)\w* [^.]{0,80}(?:contrarraz|contraminuta)|\bpara (?:as )?(?:contrarraz|contraminuta)|\bvista para contrarraz|\bvista a\(?s?\)? parte\(?s?\)? (?:agravad|apelad|recorrid|embargad)|\bimpugnacao d[oa]s? (?:agravo|recurso|apelacao|embargos)/, legal: 'CPC, art. 1.010, § 1º', models: ['elaborar contrarrazoes', 'contrarrazoes'] },
  { label: 'Réplica', action: 'manifestar', signal: /\bpara replica\b|\bintim\w* [^.]{0,60}\breplica\b|\bmanifest[\w-]* [^.]{0,40}sobre a contestacao\b|\bimpugnar a contestacao\b/, legal: 'CPC, art. 351', models: ['replica/impugnacao a contestacao', 'replica'], base: null },
  { label: 'Contestação', action: 'contestar', signal: /\b(?:apresentar|oferecer) (?:contestacao|resposta)\b|\bpara contestar\b|\bcite-se\b/, legal: 'CPC, art. 335', models: ['contestacao com modelo', 'contestacao'] },
  { label: 'Emenda à inicial', action: 'cumprir', signal: /\bemenda a inicial\b|\bemendar a inicial\b|\bemende a inicial\b/, legal: 'CPC, art. 321', models: ['emenda a inicial'], base: null },
  { label: 'Alegações finais', action: 'manifestar', signal: /\b(?:apresent|oferec|intim)\w* [^.]{0,60}(?:alegacoes finais|memoriais)\b/, legal: 'CPC, art. 364', models: ['alegacoes finais simples', 'alegacoes finais'] },
  { label: 'Manifestação sobre o laudo', action: 'manifestar', signal: /\bmanifest[\w-]* [^.]{0,60}\blaudo\b|\bsobre o laudo\b/, legal: 'CPC, art. 477', models: ['impugnacao a pericia judicial'], base: null },
  { label: 'Manifestação sobre o cálculo', action: 'manifestar', signal: /\bsobre (?:o|os) calculos?\b|\bimpugnar (?:o|os) calculos?\b/, legal: '', models: ['impugnacao ao calculo'], base: null },
  { label: 'Impugnação à penhora', action: 'manifestar', signal: /\bimpugn\w* [^.]{0,40}\bpenhora\b|\bintim\w* [^.]{0,60}\bpenhora\b/, legal: 'CPC, art. 525, § 11', models: ['impugnacao a penhora'], base: null },
  { label: 'Especificar provas', action: 'manifestar', signal: /\bespecifi\w+ [^.]{0,40}provas\b|\bprovas que pretende\b/, legal: 'CPC, art. 348', models: ['peticao intermediaria'] },
  { label: 'Preparar audiência', action: 'preparar_audiencia', signal: /\bdesigno audiencia\b|\bdesignada audiencia\b|\baudiencia designada\b|\bintim\w* [^.]{0,80}\baudiencia\b|\baudiencia de (?:conciliacao|mediacao) destinatari/, legal: '', models: [], base: null },
  { label: 'Recolher custas ou preparo', action: 'pagar_guia', signal: /\b(?:recolh|complement|comprov)\w* [^.]{0,40}(?:custas|preparo|guia)\b/, legal: '', models: [], base: null },
  { label: 'Juntar documento', action: 'juntar_documento', signal: /\bjunte\b|\bjuntem\b|\bjuntar (?:o|os|a|as|aos) /, legal: '', models: [], base: null },
  { label: 'Manifestação', action: 'manifestar', signal: /\bmanifest(?:e|em)-se\b|\bpara se manifestar\b|\bpara manifestacao\b|\bdiga a parte\b|\bdigam as partes\b|\bvista as partes\b|\bvista a parte\b/, legal: '', models: ['peticao intermediaria'], base: null },
  { label: 'Cumprir determinação', action: 'cumprir', signal: /\bregularize\b|\bregularizar\b|\bcumpra a determinacao\b|\bcumprir a determinacao\b/, legal: '', models: ['cumprimento de exigencias'], base: null }
]);

/** Modelo do catálogo pelo nome, na ordem de preferência. Nunca inventa nome de tarefa. */
export function findModel(models = [], catalogo = []) {
  for (const wanted of models) {
    const alvo = normalize(wanted);
    const exato = catalogo.find(definition => normalize(definition.name) === alvo);
    if (exato) return exato;
    const parcial = catalogo.find(definition => normalize(definition.name).includes(alvo));
    if (parcial) return parcial;
  }
  return null;
}

const describe = remedy => ({
  label: remedy.label,
  action: remedy.action,
  legal: remedy.legal || '',
  models: remedy.models || []
});

/**
 * Providências cabíveis, primeiro o que o juízo mandou fazer, depois o recurso. Despacho e
 * determinação de contrarrazões não abrem recurso: não há o que recorrer ali.
 */
export function buildActRemedies({ label = '', text = '', processNumber = '' } = {}) {
  const { kind, reason } = classifyAct({ label, text });
  const branch = detectBranch({ processNumber, text });
  const corpo = normalize(`${label} ${text}`).slice(0, 12_000);
  // Sentença e acórdão narram o processo inteiro: "laudo" ou "alegações finais" ali é história, não ordem.
  let determinations = kind === 'sentenca' || kind === 'acordao'
    ? []
    : DETERMINATIONS.filter(item => item.signal.test(corpo));
  // Vista para responder a recurso já é a resposta: "Manifestação" genérica só repetiria.
  if (determinations.some(item => item.label === 'Contrarrazões')) {
    determinations = determinations.filter(item => item.label !== 'Manifestação');
  }
  const remedyIds = REMEDIES_BY_BRANCH[branch]?.[kind] || [];
  const items = [...determinations.map(describe), ...remedyIds.map(id => describe(REMEDIES[id]))];

  let note = BRANCH_NOTES[branch]?.[kind] || '';
  if (kind === 'despacho') note = 'Despacho de mero expediente não admite recurso (CPC, art. 1.001). Se ele decidir algum pedido, trate como decisão.';
  if (kind === 'decisao_ou_despacho' && !note) note = 'Confira no texto se houve decisão. Se for só despacho, não há recurso (CPC, art. 1.001).';

  return { kind, actLabel: ACT_KIND_LABELS[kind] || '', reason, branch, note, items };
}

/** Temas da base jurídica ligados ao texto. Na edição aberta não há catálogo de base jurídica embarcado; retorna vazio. */
export function relatedBaseTitles(_text = '', { limit = 3 } = {}) {
  return [];
}
