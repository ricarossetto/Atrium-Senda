export const PJE_CREDENTIAL_SCOPE = 'pdpj';

export const PJE_LAYOUT_FAMILIES = Object.freeze({
  STANDARD: 'standard',
  TRABALHISTA: 'trabalhista',
  ELETORAL: 'eleitoral',
  MILITAR: 'militar',
  PJE_COR: 'pje-cor'
});

export const PJE_RUNTIME_VALUES = Object.freeze(['server', 'local_sidecar', 'auto']);
export const PJE_DEFAULT_RUNTIME = 'server';
export const PJE_RUNTIME_FALLBACKS = Object.freeze(['local_sidecar']);

export const PJE_VERIFICATION_DIMENSIONS = Object.freeze(['auth', 'expedientes', 'acervo']);

export const PJE_DEFAULT_TRUSTED_AUTH_ORIGINS = Object.freeze(['https://sso.cloud.pje.jus.br']);

// Collectors só entram como "implemented" quando o módulo real da fase existe.
// Até lá, portais de família compatível permanecem pending_collector de forma honesta.
const PJE_COLLECTOR_IMPLEMENTATION = Object.freeze({
  standard: Object.freeze({ implemented: true, phase: 'F1' }),
  trabalhista: Object.freeze({ implemented: true, phase: 'F2' })
});

function basePortal(overrides) {
  return {
    group: 'Justiça Estadual',
    system: 'PJe',
    branch: 'estadual',
    uf: null,
    grau: 'both',
    url: null,
    consultaPublicaUrl: null,
    layoutFamily: PJE_LAYOUT_FAMILIES.STANDARD,
    collectorKey: PJE_LAYOUT_FAMILIES.STANDARD,
    routeStatus: 'discovery_pending',
    confirmedRoutes: {},
    loginEntrySelector: null,
    authenticatedUrlPatterns: null,
    authenticatedSelectors: null,
    runtime: PJE_DEFAULT_RUNTIME,
    runtimeFallbacks: [...PJE_RUNTIME_FALLBACKS],
    requiresBrowser: true,
    accountScoped: true,
    enabled: false,
    legacy: false,
    credentialScope: PJE_CREDENTIAL_SCOPE,
    trustedAuthOrigins: [...PJE_DEFAULT_TRUSTED_AUTH_ORIGINS],
    notice: null,
    ...overrides
  };
}

const STATE_COURTS = [
  { uf: 'AC', sigla: 'TJAC', nome: 'Acre' },
  { uf: 'AL', sigla: 'TJAL', nome: 'Alagoas' },
  { uf: 'AM', sigla: 'TJAM', nome: 'Amazonas' },
  { uf: 'AP', sigla: 'TJAP', nome: 'Amapá' },
  { uf: 'BA', sigla: 'TJBA', nome: 'Bahia' },
  { uf: 'CE', sigla: 'TJCE', nome: 'Ceará' },
  { uf: 'DFT', sigla: 'TJDFT', nome: 'Distrito Federal e Territórios', host: 'pje.tjdft.jus.br' },
  { uf: 'ES', sigla: 'TJES', nome: 'Espírito Santo' },
  { uf: 'GO', sigla: 'TJGO', nome: 'Goiás' },
  { uf: 'MA', sigla: 'TJMA', nome: 'Maranhão' },
  { uf: 'MG', sigla: 'TJMG', nome: 'Minas Gerais' },
  { uf: 'MS', sigla: 'TJMS', nome: 'Mato Grosso do Sul' },
  { uf: 'PA', sigla: 'TJPA', nome: 'Pará' },
  { uf: 'PB', sigla: 'TJPB', nome: 'Paraíba' },
  { uf: 'PE', sigla: 'TJPE', nome: 'Pernambuco' },
  { uf: 'PI', sigla: 'TJPI', nome: 'Piauí' },
  { uf: 'PR', sigla: 'TJPR', nome: 'Paraná' },
  { uf: 'RJ', sigla: 'TJRJ', nome: 'Rio de Janeiro' },
  { uf: 'RN', sigla: 'TJRN', nome: 'Rio Grande do Norte' },
  { uf: 'RO', sigla: 'TJRO', nome: 'Rondônia' },
  { uf: 'RR', sigla: 'TJRR', nome: 'Roraima' },
  { uf: 'SE', sigla: 'TJSE', nome: 'Sergipe' }
];

const LABOR_COURTS = Array.from({ length: 24 }, (_, index) => index + 1).filter(numero => numero !== 4);

const statePortals = STATE_COURTS.map(court => basePortal({
  id: `pje-${court.sigla.toLowerCase()}-1g`,
  name: `${court.sigla} · PJe 1º e 2º graus`,
  short: court.sigla.replace('TJ', ''),
  court: `${court.sigla} · ${court.nome}`,
  uf: court.uf,
  grau: 'both',
  url: `https://${court.host || `pje.${court.sigla.toLowerCase()}.jus.br`}`,
  notice: 'Rota de painel será confirmada em discovery autenticado antes de habilitar.'
}));

const laborPortals = LABOR_COURTS.map(numero => basePortal({
  id: `pje-trt${numero}-1g`,
  name: `TRT${numero} · PJe 1º e 2º graus`,
  short: `T${numero}`,
  group: 'Justiça do Trabalho',
  system: 'PJe-JT',
  branch: 'trabalho',
  court: `TRT${numero}`,
  grau: 'both',
  url: `https://pje.trt${numero}.jus.br`,
  layoutFamily: PJE_LAYOUT_FAMILIES.TRABALHISTA,
  collectorKey: PJE_LAYOUT_FAMILIES.TRABALHISTA,
  notice: 'Rota de painel será confirmada em discovery autenticado antes de habilitar.'
}));

const TSE_PORTAL = basePortal({
  id: 'pje-tse',
  name: 'TSE · PJe unificado da Justiça Eleitoral',
  short: 'TSE',
  group: 'Justiça Eleitoral',
  system: 'PJe (eleitoral)',
  branch: 'eleitoral',
  court: 'TSE · Justiça Eleitoral',
  url: 'https://pje.tse.jus.br',
  layoutFamily: PJE_LAYOUT_FAMILIES.ELETORAL,
  collectorKey: null,
  notice: 'Família eleitoral ainda sem collector implementado; portal fica pending_collector.'
});

const PJE_COR_PORTAL = basePortal({
  id: 'pje-cnj-pjecor',
  name: 'CNJ · PJeCor',
  short: 'PJeCor',
  group: 'Conselhos e Nacionais',
  system: 'PJe (correição)',
  branch: 'conselho',
  court: 'CNJ · PJeCor',
  url: 'https://pje.cnj.jus.br',
  consultaPublicaUrl: null,
  layoutFamily: PJE_LAYOUT_FAMILIES.PJE_COR,
  collectorKey: null,
  notice: 'Família PJeCor ainda sem collector implementado; portal fica pending_collector.'
});

const CONFIRMED_PORTALS = [
  basePortal({
    id: 'pje-tjmt-1g',
    name: 'TJMT · PJe 1º grau',
    short: 'MT1',
    court: 'TJMT 1º grau',
    uf: 'MT',
    grau: '1G',
    url: 'https://pje.tjmt.jus.br',
    routeStatus: 'confirmed',
    confirmedRoutes: {
      panel: 'https://pje.tjmt.jus.br/pje/Painel/painel_usuario/advogado.seam'
    }
  }),
  basePortal({
    id: 'pje-tjmt-2g',
    name: 'TJMT · PJe 2º grau',
    short: 'MT2',
    court: 'TJMT 2º grau',
    uf: 'MT',
    grau: '2G',
    url: 'https://pje2.tjmt.jus.br',
    routeStatus: 'confirmed',
    confirmedRoutes: {
      panel: 'https://pje2.tjmt.jus.br/pje2/Painel/painel_usuario/advogado.seam'
    }
  }),
  basePortal({
    id: 'pje-trt4-1g',
    name: 'TRT4 · PJe 1º grau',
    short: 'T41',
    group: 'Justiça do Trabalho',
    system: 'PJe-JT',
    branch: 'trabalho',
    uf: 'RS',
    grau: '1G',
    url: 'https://pje.trt4.jus.br',
    layoutFamily: PJE_LAYOUT_FAMILIES.TRABALHISTA,
    collectorKey: PJE_LAYOUT_FAMILIES.TRABALHISTA,
    // O painel do TRT4 e Angular e so monta com render real: exige Chromium
    // headed no Xvfb do host. Os demais portais seguem headless.
    requiresHeaded: true,
    routeStatus: 'confirmed',
    confirmedRoutes: {
      panel: 'https://pje.trt4.jus.br/primeirograu/Painel/painel_usuario/list.seam',
      acervo: 'https://pje.trt4.jus.br/pjekz/painel/usuario-externo/acervo-geral',
      expedientes: 'https://pje.trt4.jus.br/pjekz/painel/usuario-externo/pendentes-manifestacao'
    },
    loginEntrySelector: '#btnSsoPdpj',
    authenticatedUrlPatterns: ['/pjekz/', '/Painel/']
  }),
  basePortal({
    id: 'pje-trt4-2g',
    name: 'TRT4 · PJe 2º grau',
    short: 'T42',
    group: 'Justiça do Trabalho',
    system: 'PJe-JT',
    branch: 'trabalho',
    uf: 'RS',
    grau: '2G',
    url: 'https://pje.trt4.jus.br',
    layoutFamily: PJE_LAYOUT_FAMILIES.TRABALHISTA,
    collectorKey: PJE_LAYOUT_FAMILIES.TRABALHISTA,
    requiresHeaded: true,
    routeStatus: 'confirmed',
    confirmedRoutes: {
      panel: 'https://pje.trt4.jus.br/segundograu/Painel/painel_usuario/list.seam'
    },
    loginEntrySelector: '#btnSsoPdpj',
    authenticatedUrlPatterns: ['/pjekz/', '/Painel/']
  })
];

const FEDERAL_PORTALS = [
  basePortal({
    id: 'pje-trf1-1g',
    name: 'TRF1 · PJe 1º grau',
    short: 'F11',
    group: 'Justiça Federal',
    system: 'PJe',
    branch: 'federal',
    court: 'TRF1 1º grau',
    grau: '1G',
    url: 'https://pje1g.trf1.jus.br',
    routeStatus: 'confirmed',
    confirmedRoutes: {
      panel: 'https://pje1g.trf1.jus.br/pje/Painel/painel_usuario/advogado.seam'
    }
  }),
  basePortal({
    id: 'pje-trf1-2g',
    name: 'TRF1 · PJe 2º grau',
    short: 'F12',
    group: 'Justiça Federal',
    system: 'PJe',
    branch: 'federal',
    court: 'TRF1 2º grau',
    grau: '2G',
    url: 'https://pje2g.trf1.jus.br',
    routeStatus: 'confirmed',
    confirmedRoutes: {
      panel: 'https://pje2g.trf1.jus.br/pje/Painel/painel_usuario/advogado.seam'
    }
  }),
  basePortal({
    id: 'pje-trf3-1g',
    name: 'TRF3 · PJe 1º grau',
    short: 'F31',
    group: 'Justiça Federal',
    system: 'PJe',
    branch: 'federal',
    court: 'TRF3 1º grau · SP/MS',
    grau: '1G',
    url: 'https://pje1g.trf3.jus.br',
    routeStatus: 'confirmed',
    confirmedRoutes: {
      panel: 'https://pje1g.trf3.jus.br/pje/Painel/painel_usuario/advogado.seam'
    }
  }),
  basePortal({
    id: 'pje-trf3-2g',
    name: 'TRF3 · PJe 2º grau',
    short: 'F32',
    group: 'Justiça Federal',
    system: 'PJe',
    branch: 'federal',
    court: 'TRF3 2º grau',
    grau: '2G',
    url: 'https://pje2g.trf3.jus.br',
    routeStatus: 'confirmed',
    confirmedRoutes: {
      panel: 'https://pje2g.trf3.jus.br/pje/Painel/painel_usuario/advogado.seam'
    }
  }),
  basePortal({
    id: 'pje-trf5',
    name: 'TRF5 · PJe 1º e 2º graus',
    short: 'F5',
    group: 'Justiça Federal',
    system: 'PJe',
    branch: 'federal',
    court: 'TRF5 · AL/CE/PB/PE/RN/SE',
    grau: 'both',
    url: 'https://pje.trf5.jus.br',
    routeStatus: 'confirmed',
    confirmedRoutes: {
      panel: 'https://pje.trf5.jus.br/pje/Painel/painel_usuario/advogado.seam'
    }
  }),
  basePortal({
    id: 'pje-trf6-1g',
    name: 'TRF6 · PJe 1º grau',
    short: 'F61',
    group: 'Justiça Federal',
    system: 'PJe',
    branch: 'federal',
    court: 'TRF6 1º grau · MG',
    grau: '1G',
    url: 'https://pje1g.trf6.jus.br',
    notice: 'Rota de painel será confirmada em discovery autenticado antes de habilitar.'
  }),
  basePortal({
    id: 'pje-trf6-2g',
    name: 'TRF6 · PJe 2º grau',
    short: 'F62',
    group: 'Justiça Federal',
    system: 'PJe',
    branch: 'federal',
    court: 'TRF6 2º grau · MG',
    grau: '2G',
    url: 'https://pje2g.trf6.jus.br',
    notice: 'Rota de painel será confirmada em discovery autenticado antes de habilitar.'
  })
];

const MILITARY_PORTALS = [
  basePortal({
    id: 'pje-tjmmg',
    name: 'TJMMG · PJe',
    short: 'MMG',
    group: 'Justiça Militar',
    system: 'PJe',
    branch: 'militar',
    court: 'TJMMG · Minas Gerais',
    url: 'https://pje.tjmmg.jus.br',
    notice: 'Host e rota de painel a confirmar em discovery autenticado.'
  }),
  basePortal({
    id: 'pje-tjmsp',
    name: 'TJMSP · PJe',
    short: 'MSP',
    group: 'Justiça Militar',
    system: 'PJe',
    branch: 'militar',
    court: 'TJMSP · São Paulo',
    url: 'https://pje.tjmsp.jus.br',
    notice: 'Host e rota de painel a confirmar em discovery autenticado.'
  })
];

const TST_PORTAL = basePortal({
  id: 'pje-tst',
  name: 'TST · PJe',
  short: 'TST',
  group: 'Justiça do Trabalho',
  system: 'PJe-JT',
  branch: 'trabalho',
  court: 'TST · Tribunal Superior do Trabalho',
  grau: 'both',
  url: 'https://pje.tst.jus.br',
  layoutFamily: PJE_LAYOUT_FAMILIES.TRABALHISTA,
  collectorKey: PJE_LAYOUT_FAMILIES.TRABALHISTA,
  notice: 'Rota de painel será confirmada em discovery autenticado antes de habilitar.'
});

export const PJE_PORTALS = Object.freeze(
  [
    ...CONFIRMED_PORTALS,
    ...statePortals,
    ...laborPortals,
    ...MILITARY_PORTALS,
    ...FEDERAL_PORTALS,
    TST_PORTAL,
    TSE_PORTAL,
    PJE_COR_PORTAL
  ].map(portal => {
    let sessionScope = '';
    try {
      sessionScope = new URL(portal.url).origin;
    } catch {
      sessionScope = portal.url;
    }
    return Object.freeze({
      ...portal,
      confirmedRoutes: Object.freeze({ ...portal.confirmedRoutes }),
      runtimeFallbacks: Object.freeze([...portal.runtimeFallbacks]),
      trustedAuthOrigins: Object.freeze([...portal.trustedAuthOrigins]),
      sessionScope
    });
  })
);

export const CANONICAL_PJE_PORTAL_IDS = Object.freeze(new Set(PJE_PORTALS.map(portal => portal.id)));

export function normalizePjePortalId(portalId) {
  if (!portalId || typeof portalId !== 'string') return null;
  const clean = portalId.trim().toLowerCase();
  return CANONICAL_PJE_PORTAL_IDS.has(clean) ? clean : null;
}

export function getPjePortalById(portalId) {
  const canonical = normalizePjePortalId(portalId);
  if (!canonical) return null;
  return PJE_PORTALS.find(portal => portal.id === canonical) || null;
}

export function isPjePortalId(portalId) {
  return normalizePjePortalId(portalId) !== null;
}

// IDs iniciados por "pje-" são tratados como PJe mesmo fora do registry (ex.: portais customizados),
// garantindo que o escopo compartilhado pdpj valha para todo o sistema.
export function isPjeCredentialPortalId(portalId) {
  if (!portalId || typeof portalId !== 'string') return false;
  const clean = portalId.trim().toLowerCase();
  return CANONICAL_PJE_PORTAL_IDS.has(clean) || clean.startsWith('pje-') || clean.startsWith('pje_');
}

export function getPjeCredentialScope(portalId) {
  return isPjeCredentialPortalId(portalId) ? PJE_CREDENTIAL_SCOPE : null;
}

export function listPjePortals({ group, branch, grau, layoutFamily, runtime, routeStatus, enabled } = {}) {
  return PJE_PORTALS.filter(portal => {
    if (group && portal.group !== group) return false;
    if (branch && portal.branch !== branch) return false;
    if (grau && portal.grau !== grau) return false;
    if (layoutFamily && portal.layoutFamily !== layoutFamily) return false;
    if (runtime && portal.runtime !== runtime) return false;
    if (routeStatus && portal.routeStatus !== routeStatus) return false;
    if (typeof enabled === 'boolean' && portal.enabled !== enabled) return false;
    return true;
  });
}

export function resolvePjeCollector(portalOrId) {
  const portal = typeof portalOrId === 'string' ? getPjePortalById(portalOrId) : portalOrId;
  if (!portal) {
    return Object.freeze({ collectorKey: null, status: 'unknown_portal' });
  }
  const collectorKey = portal.collectorKey || null;
  if (!collectorKey) {
    return Object.freeze({
      collectorKey: null,
      status: 'pending_collector',
      layoutFamily: portal.layoutFamily,
      reason: `Família ${portal.layoutFamily} ainda não possui collector implementado.`
    });
  }
  const implementation = PJE_COLLECTOR_IMPLEMENTATION[collectorKey];
  if (implementation?.implemented) {
    return Object.freeze({ collectorKey, status: 'implemented', layoutFamily: portal.layoutFamily });
  }
  return Object.freeze({
    collectorKey,
    status: 'pending_collector',
    layoutFamily: portal.layoutFamily,
    plannedPhase: implementation?.phase || null,
    reason: `Collector "${collectorKey}" ainda não implementado.`
  });
}

export function resolvePjeRuntime(portal, requested = 'auto') {
  const runtime = PJE_RUNTIME_VALUES.includes(requested) ? requested : 'auto';
  const primary = runtime === 'auto' ? (portal?.runtime || PJE_DEFAULT_RUNTIME) : runtime;
  const fallbacks = runtime === 'auto'
    ? [...new Set([...(portal?.runtimeFallbacks || PJE_RUNTIME_FALLBACKS), 'local_sidecar'])].filter(item => item !== primary)
    : [];
  return Object.freeze({ runtime: primary, transport: runtime, fallbacks: Object.freeze(fallbacks) });
}

export function buildPjeClientCertificateOrigins(portal) {
  const origins = new Set();
  const add = value => {
    if (!value) return;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // rota relativa ou inválida é ignorada aqui; a navegação valida o destino depois
    }
  };
  add(portal?.url);
  add(portal?.confirmedRoutes?.panel);
  add(portal?.confirmedRoutes?.login);
  for (const origin of portal?.trustedAuthOrigins || []) add(origin);
  return Object.freeze([...origins]);
}

export function getAllowedPjeOrigins(portal) {
  const origins = new Set(buildPjeClientCertificateOrigins(portal));
  if (portal?.sessionScope) origins.add(portal.sessionScope);
  return Object.freeze([...origins]);
}
