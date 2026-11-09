/**
 * ATRIUM Sovereign Judicial Connectivity — National Eproc Portal Registry
 *
 * Canonical registry of all officially verified eproc environments across Brazil.
 * Covers Federal Justice (TRFs/SJs), State Justice (TJs), and Military Justice (TJMs).
 */

import { isPjeCredentialPortalId, PJE_CREDENTIAL_SCOPE } from '../pje/portal-registry.mjs';

export const EPROC_BRANCH = Object.freeze({
  FEDERAL: 'federal',
  STATE: 'state',
  MILITARY: 'military'
});

export const EPROC_STATUS = Object.freeze({
  ACTIVE: 'active',
  PARTIAL: 'partial',
  PILOT: 'pilot',
  MIGRATION: 'migration',
  UNVERIFIED: 'unverified'
});

const RAW_EPROC_PORTALS = Object.freeze([
  // =========================================================================
  // JUSTIÇA FEDERAL — 4ª REGIÃO (TRF4, JFRS, JFSC, JFPR)
  // Berço do sistema eproc, 100% dos processos eletrônicos tramitam no eproc.
  // =========================================================================
  {
    id: 'trf4-eproc-2g',
    credentialScope: 'trf4-eproc',
    name: 'TRF 4ª Região — 2º Grau',
    court: 'TRF4',
    courtCode: '4.04',
    branch: EPROC_BRANCH.FEDERAL,
    state: 'RS/SC/PR',
    family: 'eproc',
    level: 2,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Tribunal Regional Federal da 4ª Região, 2º Grau e Turmas Regionais de Uniformização.' },
    baseUrl: 'https://eproc.trf4.jus.br/eproc2trf4/',
    controllerPath: 'controlador.php',
    loginPath: 'externo_controlador.php?acao=SSO/login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: true,
      password: true,
      sso: true,
      mtlsOrigin: 'https://eproc-sso-certificado.trf4.jus.br',
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true,
      productVisible: true,
      manualVerificationCandidate: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc.trf4.jus.br/eproc2trf4/',
      'https://www.trf4.jus.br/trf4/controlador.php?acao=pagina_visualizar&id_pagina=3939'
    ]
  },
  {
    id: 'jfrs-eproc-1g',
    credentialScope: 'trf4-eproc',
    name: 'Justiça Federal do Rio Grande do Sul — 1º Grau',
    court: 'JFRS',
    courtCode: '4.04',
    branch: EPROC_BRANCH.FEDERAL,
    state: 'RS',
    family: 'eproc',
    level: 1,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Seção Judiciária do Rio Grande do Sul, Varas Federais e Juizados Especiais Federais.' },
    baseUrl: 'https://eproc.jfrs.jus.br/eprocV2/',
    controllerPath: 'controlador.php',
    loginPath: 'externo_controlador.php?acao=SSO/login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: true,
      password: true,
      sso: true,
      mtlsOrigin: 'https://eproc-sso-certificado.trf4.jus.br',
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true,
      productVisible: true,
      manualVerificationCandidate: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc.jfrs.jus.br/eprocV2/',
      'https://www.jfrs.jus.br/'
    ]
  },
  {
    id: 'jfsc-eproc-1g',
    credentialScope: 'trf4-eproc',
    name: 'Justiça Federal de Santa Catarina — 1º Grau',
    court: 'JFSC',
    courtCode: '4.04',
    branch: EPROC_BRANCH.FEDERAL,
    state: 'SC',
    family: 'eproc',
    level: 1,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Seção Judiciária de Santa Catarina, Varas Federais e Juizados Especiais Federais.' },
    baseUrl: 'https://eproc.jfsc.jus.br/eprocV2/',
    controllerPath: 'controlador.php',
    loginPath: 'externo_controlador.php?acao=SSO/login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: true,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true,
      productVisible: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc.jfsc.jus.br/eprocV2/',
      'https://www.jfsc.jus.br/'
    ]
  },
  {
    id: 'jfpr-eproc-1g',
    credentialScope: 'trf4-eproc',
    name: 'Justiça Federal do Paraná — 1º Grau',
    court: 'JFPR',
    courtCode: '4.04',
    branch: EPROC_BRANCH.FEDERAL,
    state: 'PR',
    family: 'eproc',
    level: 1,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Seção Judiciária do Paraná, Varas Federais e Juizados Especiais Federais.' },
    baseUrl: 'https://eproc.jfpr.jus.br/eprocV2/',
    controllerPath: 'controlador.php',
    loginPath: 'externo_controlador.php?acao=SSO/login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: true,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true,
      productVisible: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc.jfpr.jus.br/eprocV2/',
      'https://www.jfpr.jus.br/'
    ]
  },

  // =========================================================================
  // JUSTIÇA FEDERAL — 2ª REGIÃO (TRF2, JFRJ, JFES)
  // Adotou o eproc nacionalmente a partir de cessão do TRF4.
  // =========================================================================
  {
    id: 'trf2-eproc-2g',
    credentialScope: 'trf2-eproc',
    name: 'TRF 2ª Região — 2º Grau',
    court: 'TRF2',
    courtCode: '4.02',
    branch: EPROC_BRANCH.FEDERAL,
    state: 'RJ/ES',
    family: 'eproc',
    level: 2,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Tribunal Regional Federal da 2ª Região, 2º Grau.' },
    baseUrl: 'https://eproc.trf2.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'controlador.php?acao=login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: false,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc.trf2.jus.br/eproc/',
      'https://www.trf2.jus.br/sistemas-processuais/eproc'
    ]
  },
  {
    id: 'jfrj-eproc-1g',
    credentialScope: 'trf2-eproc',
    name: 'Justiça Federal do Rio de Janeiro — 1º Grau',
    court: 'JFRJ',
    courtCode: '4.02',
    branch: EPROC_BRANCH.FEDERAL,
    state: 'RJ',
    family: 'eproc',
    level: 1,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Seção Judiciária do Rio de Janeiro, 1º Grau.' },
    baseUrl: 'https://eproc.jfrj.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'controlador.php?acao=login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: false,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc.jfrj.jus.br/eproc/',
      'https://www.jfrj.jus.br/'
    ]
  },
  {
    id: 'jfes-eproc-1g',
    credentialScope: 'trf2-eproc',
    name: 'Justiça Federal do Espírito Santo — 1º Grau',
    court: 'JFES',
    courtCode: '4.02',
    branch: EPROC_BRANCH.FEDERAL,
    state: 'ES',
    family: 'eproc',
    level: 1,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Seção Judiciária do Espírito Santo, 1º Grau.' },
    baseUrl: 'https://eproc.jfes.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'controlador.php?acao=login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: false,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc.jfes.jus.br/eproc/',
      'https://www.jfes.jus.br/'
    ]
  },

  // =========================================================================
  // JUSTIÇA FEDERAL — 6ª REGIÃO (TRF6, JFMG)
  // Criada a partir do desmembramento da 1ª Região em Minas Gerais.
  // Adotou o eproc integralmente.
  // =========================================================================
  {
    id: 'trf6-eproc-2g',
    credentialScope: 'trf6-eproc',
    name: 'TRF 6ª Região — 2º Grau',
    court: 'TRF6',
    courtCode: '4.06',
    branch: EPROC_BRANCH.FEDERAL,
    state: 'MG',
    family: 'eproc',
    level: 2,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Tribunal Regional Federal da 6ª Região (Minas Gerais), 2º Grau.' },
    baseUrl: 'https://eproc2g.trf6.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'controlador.php?acao=login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: false,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc2g.trf6.jus.br/eproc/',
      'https://portal.trf6.jus.br/'
    ]
  },
  {
    id: 'jfmg-eproc-1g',
    credentialScope: 'trf6-eproc',
    name: 'Justiça Federal de Minas Gerais — 1º Grau (TRF6)',
    court: 'JFMG',
    courtCode: '4.06',
    branch: EPROC_BRANCH.FEDERAL,
    state: 'MG',
    family: 'eproc',
    level: 1,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Seção Judiciária de Minas Gerais (TRF6), 1º Grau.' },
    baseUrl: 'https://eproc1g.trf6.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'controlador.php?acao=login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: false,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc1g.trf6.jus.br/eproc/',
      'https://portal.trf6.jus.br/'
    ]
  },

  // =========================================================================
  // JUSTIÇA ESTADUAL — RIO GRANDE DO SUL (TJRS)
  // Totalmente eproc no 1G, 2G e Turmas Recursais.
  // Autenticação via Keycloak mTLS + TOTP 2FA.
  // =========================================================================
  {
    id: 'tjrs-eproc-1g',
    credentialScope: 'tjrs-eproc',
    name: 'Tribunal de Justiça do Rio Grande do Sul — 1º Grau',
    court: 'TJRS',
    courtCode: '8.21',
    branch: EPROC_BRANCH.STATE,
    state: 'RS',
    family: 'eproc',
    level: 1,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Comarcas do Estado do Rio Grande do Sul, Varas Cíveis, Família, Criminais e JEC.' },
    baseUrl: 'https://eproc1g.tjrs.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'externo_controlador.php?acao=SSO/login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: true,
      password: true,
      sso: true,
      keycloak: true,
      mtlsOrigin: 'https://keycloak-httpd-mtls.tjrs.jus.br'
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true,
      productVisible: true,
      manualVerificationCandidate: true,
      liveSyncVerified: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc1g.tjrs.jus.br/eproc/',
      'https://www.tjrs.jus.br/novo/processos-e-servicos/sistemas-processuais/eproc/'
    ]
  },
  {
    id: 'tjrs-eproc-2g',
    credentialScope: 'tjrs-eproc',
    name: 'Tribunal de Justiça do Rio Grande do Sul — 2º Grau',
    court: 'TJRS',
    courtCode: '8.21',
    branch: EPROC_BRANCH.STATE,
    state: 'RS',
    family: 'eproc',
    level: 2,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Tribunal de Justiça do Rio Grande do Sul, Câmaras Cíveis e Criminais.' },
    baseUrl: 'https://eproc2g.tjrs.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'externo_controlador.php?acao=SSO/login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: true,
      password: true,
      sso: true,
      keycloak: true,
      mtlsOrigin: 'https://keycloak-httpd-mtls.tjrs.jus.br'
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true,
      productVisible: true,
      manualVerificationCandidate: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc2g.tjrs.jus.br/eproc/',
      'https://www.tjrs.jus.br/'
    ]
  },

  // =========================================================================
  // JUSTIÇA ESTADUAL — SANTA CATARINA (TJSC)
  // Adotou integralmente o eproc em todas as unidades jurisdicionais.
  // =========================================================================
  {
    id: 'tjsc-eproc-1g',
    credentialScope: 'tjsc-eproc',
    name: 'Tribunal de Justiça de Santa Catarina — 1º Grau',
    court: 'TJSC',
    courtCode: '8.24',
    branch: EPROC_BRANCH.STATE,
    state: 'SC',
    family: 'eproc',
    level: 1,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Todas as comarcas e varas do Estado de Santa Catarina.' },
    baseUrl: 'https://eproc1g.tjsc.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'controlador.php?acao=login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: false,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc1g.tjsc.jus.br/eproc/',
      'https://www.tjsc.jus.br/eproc'
    ]
  },
  {
    id: 'tjsc-eproc-2g',
    credentialScope: 'tjsc-eproc',
    name: 'Tribunal de Justiça de Santa Catarina — 2º Grau',
    court: 'TJSC',
    courtCode: '8.24',
    branch: EPROC_BRANCH.STATE,
    state: 'SC',
    level: 2,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Tribunal de Justiça de Santa Catarina, Câmaras e Turmas Recursais.' },
    baseUrl: 'https://eproc2g.tjsc.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'controlador.php?acao=login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: false,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc2g.tjsc.jus.br/eproc/',
      'https://www.tjsc.jus.br/eproc'
    ]
  },

  // =========================================================================
  // JUSTIÇA ESTADUAL — TOCANTINS (TJTO)
  // Pioneiro nos tribunais estaduais no uso de eproc.
  // =========================================================================
  {
    id: 'tjto-eproc-1g',
    credentialScope: 'tjto-eproc',
    name: 'Tribunal de Justiça do Tocantins — 1º Grau',
    court: 'TJTO',
    courtCode: '8.27',
    branch: EPROC_BRANCH.STATE,
    state: 'TO',
    family: 'eproc',
    level: 1,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Todas as comarcas do Estado do Tocantins, 1º Grau.' },
    baseUrl: 'https://eproc1.tjto.jus.br/eprocV2_prod_1grau/',
    controllerPath: 'controlador.php',
    loginPath: 'controlador.php?acao=login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: false,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc1.tjto.jus.br/eprocV2_prod_1grau/',
      'https://www.tjto.jus.br/'
    ]
  },
  {
    id: 'tjto-eproc-2g',
    credentialScope: 'tjto-eproc',
    name: 'Tribunal de Justiça do Tocantins — 2º Grau',
    court: 'TJTO',
    courtCode: '8.27',
    branch: EPROC_BRANCH.STATE,
    state: 'TO',
    family: 'eproc',
    level: 2,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Tribunal de Justiça do Tocantins, 2º Grau e Câmaras.' },
    baseUrl: 'https://eproc2.tjto.jus.br/eprocV2_prod_2grau/',
    controllerPath: 'controlador.php',
    loginPath: 'controlador.php?acao=login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: false,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc2.tjto.jus.br/eprocV2_prod_2grau/',
      'https://www.tjto.jus.br/'
    ]
  },

  // =========================================================================
  // JUSTIÇA ESTADUAL — SÃO PAULO (TJSP)
  // Transição do SAJ para eproc em andamento (cronograma de expansão 2024-2026).
  // STATUS: PARTIAL / MIGRATION (Não cobre todo o acervo).
  // =========================================================================
  {
    id: 'tjsp-eproc-1g',
    credentialScope: 'tjsp-eproc',
    name: 'Tribunal de Justiça de São Paulo — 1º Grau (eproc)',
    court: 'TJSP',
    courtCode: '8.26',
    branch: EPROC_BRANCH.STATE,
    state: 'SP',
    family: 'eproc',
    level: 1,
    status: EPROC_STATUS.PARTIAL,
    coverage: {
      scope: 'selected_competencies',
      notes: 'Implantação progressiva do eproc no TJSP por comarcas e competências. Processos legados permanecem no SAJ/ESAJ.'
    },
    baseUrl: 'https://eproc1g.tjsp.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'externo_controlador.php?acao=SSO/login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: true,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc1g.tjsp.jus.br/eproc/',
      'https://portal.tjsp.jus.br/eproc'
    ]
  },
  {
    id: 'tjsp-eproc-2g',
    credentialScope: 'tjsp-eproc',
    name: 'Tribunal de Justiça de São Paulo — 2º Grau (eproc)',
    court: 'TJSP',
    courtCode: '8.26',
    branch: EPROC_BRANCH.STATE,
    state: 'SP',
    family: 'eproc',
    level: 2,
    status: EPROC_STATUS.PARTIAL,
    coverage: {
      scope: 'selected_competencies',
      notes: 'Implantação progressiva no 2º Grau do TJSP.'
    },
    baseUrl: 'https://eproc2g.tjsp.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'externo_controlador.php?acao=SSO/login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: true,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc2g.tjsp.jus.br/eproc/',
      'https://portal.tjsp.jus.br/eproc'
    ]
  },

  // =========================================================================
  // JUSTIÇA ESTADUAL — RIO DE JANEIRO (TJRJ)
  // STATUS: PILOT / MIGRATION (Implantação piloto gradual).
  // =========================================================================
  {
    id: 'tjrj-eproc-1g',
    credentialScope: 'tjrj-eproc',
    name: 'Tribunal de Justiça do Rio de Janeiro — 1º Grau (eproc)',
    court: 'TJRJ',
    courtCode: '8.19',
    branch: EPROC_BRANCH.STATE,
    state: 'RJ',
    family: 'eproc',
    level: 1,
    status: EPROC_STATUS.PILOT,
    coverage: {
      scope: 'pilot_units',
      notes: 'Unidades piloto e novas competências migradas do DCP para o eproc.'
    },
    baseUrl: 'https://eproc1g.tjrj.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'externo_controlador.php?acao=SSO/login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: true,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc1g.tjrj.jus.br/eproc/',
      'https://www.tjrj.jus.br/'
    ]
  },

  // =========================================================================
  // JUSTIÇA ESTADUAL — MINAS GERAIS (TJMG)
  // STATUS: PILOT / MIGRATION (Implantação progressiva do eproc).
  // =========================================================================
  {
    id: 'tjmg-eproc-1g',
    credentialScope: 'tjmg-eproc',
    name: 'Tribunal de Justiça de Minas Gerais — 1º Grau (eproc)',
    court: 'TJMG',
    courtCode: '8.13',
    branch: EPROC_BRANCH.STATE,
    state: 'MG',
    family: 'eproc',
    level: 1,
    status: EPROC_STATUS.PILOT,
    coverage: {
      scope: 'pilot_units',
      notes: 'Implantação em comarcas piloto em substituição ao PJe / Themis.'
    },
    baseUrl: 'https://eproc1g.tjmg.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'controlador.php?acao=login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: false,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc1g.tjmg.jus.br/eproc/',
      'https://www.tjmg.jus.br/'
    ]
  },

  // =========================================================================
  // JUSTIÇA ESTADUAL — BAHIA (TJBA)
  // STATUS: PILOT / MIGRATION
  // =========================================================================
  {
    id: 'tjba-eproc-1g',
    credentialScope: 'tjba-eproc',
    name: 'Tribunal de Justiça da Bahia — 1º Grau (eproc)',
    court: 'TJBA',
    courtCode: '8.05',
    branch: EPROC_BRANCH.STATE,
    state: 'BA',
    family: 'eproc',
    level: 1,
    status: EPROC_STATUS.PILOT,
    coverage: {
      scope: 'pilot_units',
      notes: 'Implantação e unidades piloto do eproc no TJBA.'
    },
    baseUrl: 'https://eproc1g.tjba.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'controlador.php?acao=login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: false,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc1g.tjba.jus.br/eproc/',
      'https://www.tjba.jus.br/'
    ]
  },

  // =========================================================================
  // JUSTIÇA MILITAR — RIO GRANDE DO SUL (TJMRS)
  // 100% no eproc.
  // =========================================================================
  {
    id: 'tjmrs-eproc-1g',
    credentialScope: 'tjmrs-eproc',
    name: 'Tribunal de Justiça Militar do Rio Grande do Sul — 1º Grau',
    court: 'TJMRS',
    courtCode: '9.21',
    branch: EPROC_BRANCH.MILITARY,
    state: 'RS',
    family: 'eproc',
    level: 1,
    status: EPROC_STATUS.ACTIVE,
    coverage: { scope: 'full', notes: 'Auditorias Militares de Porto Alegre, Santa Maria e Passo Fundo.' },
    baseUrl: 'https://eproc1g.tjmrs.jus.br/eproc/',
    controllerPath: 'controlador.php',
    loginPath: 'controlador.php?acao=login',
    publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica',
    auth: {
      strategy: 'password_or_certificate',
      certificate: true,
      totp: false,
      password: true,
      sso: false,
      keycloak: false
    },
    capabilities: {
      authenticatedPanel: true,
      discoverCases: true,
      movements: true,
      documents: true,
      publications: true,
      deadlines: true
    },
    verifiedAt: '2026-09-13T14:15:00.000Z',
    evidence: [
      'https://eproc1g.tjmrs.jus.br/eproc/',
      'https://www.tjmrs.jus.br/'
    ]
  }
]);

/**
 * Consulta pública por chave de acesso: declaração por portal. Portais sem observação
 * live permanecem `UNVERIFIED` (`directHttp: 'candidate'`, `captcha: 'unknown'`) — nenhum
 * portal recebe capacidade verificada sem execução real contra o portal (AGENTS §21).
 * A observação live de 2026-09-18 (read-only, com autorização do operador) confirmou que
 * os portais abaixo protegem a consulta por chave com CAPTCHA: o caminho HTTP direto fica
 * bloqueado e o estado honesto é `CAPTCHA_REQUIRED`/`HUMAN_REQUIRED` (nunca contorno).
 */
export const EPROC_PUBLIC_ACCESS_CREDENTIAL_KINDS = Object.freeze(['EPROC_PROCESS_KEY']);

/**
 * Autenticação por conta (usuário/senha + TOTP, sem A1): perfil de login observado
 * live por família e portais com sessão real confirmada (2026-09-19). O perfil é
 * diagnóstico/documental — o cliente detecta o fluxo em tempo de execução.
 */
export const EPROC_ACCOUNT_LOGIN_PROFILES = Object.freeze({
  'keycloak-sso': Object.freeze([
    'trf4-eproc-2g', 'jfrs-eproc-1g', 'jfsc-eproc-1g', 'jfpr-eproc-1g',
    'tjrs-eproc-1g', 'tjrs-eproc-2g', 'tjsc-eproc-1g', 'tjsc-eproc-2g',
    'tjsp-eproc-1g', 'tjsp-eproc-2g', 'tjrj-eproc-1g'
  ]),
  'native-form': Object.freeze([
    'trf2-eproc-2g', 'jfrj-eproc-1g', 'jfes-eproc-1g', 'trf6-eproc-2g', 'jfmg-eproc-1g',
    'tjto-eproc-1g', 'tjto-eproc-2g', 'tjba-eproc-1g', 'tjmrs-eproc-1g', 'tjmg-eproc-1g'
  ])
});

export const EPROC_ACCOUNT_LOGIN_VERIFIED = Object.freeze([
  'trf4-eproc-2g', 'jfrs-eproc-1g', 'jfsc-eproc-1g', 'jfpr-eproc-1g',
  'tjrs-eproc-1g', 'tjrs-eproc-2g', 'tjrj-eproc-1g'
]);

export function getPortalLoginProfile(portalId) {
  for (const [profile, ids] of Object.entries(EPROC_ACCOUNT_LOGIN_PROFILES)) {
    if (ids.includes(portalId)) return profile;
  }
  return 'unknown';
}

export function isPortalAccountLoginVerified(portalId) {
  return EPROC_ACCOUNT_LOGIN_VERIFIED.includes(portalId);
}

export const EPROC_PUBLIC_ACCESS_CAPTCHA_OBSERVATIONS = Object.freeze({
  'jfrs-eproc-1g': 'turnstile',
  'tjrs-eproc-1g': 'image',
  'tjrs-eproc-2g': 'hcaptcha',
  'trf4-eproc-2g': 'turnstile'
});

function buildPublicAccess(p) {
  const isActive = p.status === EPROC_STATUS.ACTIVE;
  const observedCaptcha = EPROC_PUBLIC_ACCESS_CAPTCHA_OBSERVATIONS[p.id] || null;
  return Object.freeze({
    supported: isActive,
    credentialKinds: EPROC_PUBLIC_ACCESS_CREDENTIAL_KINDS,
    entryPath: p.publicSearchPath || 'externo_controlador.php?acao=processo_consulta_publica',
    processKeySupported: isActive,
    documentKeySupported: false,
    processDocumentsSupported: false,
    directHttp: observedCaptcha ? 'blocked_by_captcha' : 'candidate',
    browserFallback: true,
    captcha: observedCaptcha || 'unknown',
    verificationState: observedCaptcha ? 'ENTRYPOINT_OBSERVED' : 'UNVERIFIED'
  });
}

export const EPROC_PORTALS = Object.freeze(
  RAW_EPROC_PORTALS.map(p => {
    let sessionScope = '';
    try {
      sessionScope = new URL(p.baseUrl).origin;
    } catch {
      sessionScope = p.baseUrl;
    }
    const isRealmVerified = p.capabilities?.liveSyncVerified === true;
    return Object.freeze({
      ...p,
      capabilities: Object.freeze({
        ...p.capabilities,
        liveSyncVerified: p.capabilities?.liveSyncVerified === true
      }),
      publicAccess: buildPublicAccess(p),
      loginProfile: getPortalLoginProfile(p.id),
      accountLoginVerified: isPortalAccountLoginVerified(p.id),
      credentialScopeStatus: isRealmVerified ? 'CREDENTIAL_SCOPE_REALM_VERIFIED' : 'CREDENTIAL_SCOPE_CANDIDATE',
      validationLevel: isRealmVerified ? 'VERIFIED_FIXTURE' : 'IMPLEMENTED_UNVERIFIED',
      sessionScope
    });
  })
);

export const CANONICAL_PORTAL_IDS = Object.freeze(new Set(RAW_EPROC_PORTALS.map(p => p.id)));

export const LEGACY_PORTAL_ALIASES = Object.freeze({
  'eproc-tjrs-1g': 'tjrs-eproc-1g',
  'eproc-tjrs-2g': 'tjrs-eproc-2g',
  'eproc-jfrs-1g': 'jfrs-eproc-1g',
  'eproc-jfsc-1g': 'jfsc-eproc-1g',
  'eproc-jfpr-1g': 'jfpr-eproc-1g',
  'eproc-jfrs': 'jfrs-eproc-1g',
  'eproc-jfsc': 'jfsc-eproc-1g',
  'eproc-jfpr': 'jfpr-eproc-1g',
  'eproc-trf4-2g': 'trf4-eproc-2g',
  'trf4-eproc': 'trf4-eproc-2g',
  'jfrs-eproc': 'jfrs-eproc-1g',
  'jfsc-eproc': 'jfsc-eproc-1g',
  'jfpr-eproc': 'jfpr-eproc-1g',
  'tjrs-eproc': 'tjrs-eproc-1g',
  'tjsc-eproc': 'tjsc-eproc-1g',
  'tjto-eproc': 'tjto-eproc-1g'
});

export const REGIONAL_CREDENTIAL_SCOPES = Object.freeze({
  TRF4_REGION: 'trf4-region',
  TRF4_EPROC: 'trf4-eproc',
  TJRS_EPROC: 'tjrs-eproc',
  TRF2_EPROC: 'trf2-eproc',
  TRF6_EPROC: 'trf6-eproc',
  TJSC_EPROC: 'tjsc-eproc',
  TJTO_EPROC: 'tjto-eproc'
});

/**
 * Normalizes a portal ID to its canonical registry form.
 * Accepts canonical IDs and verified legacy aliases.
 * Rejects arbitrary typos by returning null (or throwing in strict mode).
 *
 * @param {string} portalId
 * @param {Object} [options]
 * @param {boolean} [options.strict=false]
 * @returns {string|null} Canonical portal ID or null if unrecognized
 */
export function normalizePortalId(portalId, { strict = false } = {}) {
  if (!portalId || typeof portalId !== 'string') {
    if (strict) throw new Error(`Portal ID inválido ou não informado: "${portalId}"`);
    return null;
  }
  const clean = portalId.trim().toLowerCase();
  if (CANONICAL_PORTAL_IDS.has(clean)) {
    return clean;
  }
  if (LEGACY_PORTAL_ALIASES[clean]) {
    return LEGACY_PORTAL_ALIASES[clean];
  }
  if (strict) {
    throw new Error(`Portal judicial desconhecido ou inexistente: "${portalId}"`);
  }
  return null;
}

export const canonicalPortalId = normalizePortalId;

export function getPortalCredentialKeyCandidates(portalId) {
  const canonical = normalizePortalId(portalId);
  if (!canonical) return portalId ? [String(portalId).trim().toLowerCase()] : [];
  const aliases = Object.entries(LEGACY_PORTAL_ALIASES)
    .filter(([, target]) => target === canonical)
    .map(([alias]) => alias);
  return [...new Set([String(portalId).trim().toLowerCase(), canonical, ...aliases])];
}

export function getEprocPortalById(id) {
  if (!id) return null;
  const canonical = normalizePortalId(id);
  if (!canonical) return null;
  return EPROC_PORTALS.find(p => p.id === canonical) || null;
}

export function isEprocPortalLiveSyncVerified(id) {
  return getEprocPortalById(id)?.capabilities?.liveSyncVerified === true;
}

export function getPortalPublicAccess(portalId) {
  return getEprocPortalById(portalId)?.publicAccess || null;
}

export function listLiveSyncVerifiedEprocPortals() {
  return EPROC_PORTALS.filter(portal => portal.capabilities?.liveSyncVerified === true);
}

export function listEprocPortals({ branch, court, courtCode, level, status } = {}) {
  return EPROC_PORTALS.filter(p => {
    if (branch && p.branch !== branch) return false;
    if (court && p.court !== court) return false;
    if (courtCode && p.courtCode !== courtCode) return false;
    if (level && p.level !== level) return false;
    if (status && p.status !== status) return false;
    return true;
  });
}

export function getCandidateEprocPortalsForCnj(cnj) {
  const digits = String(cnj || '').replace(/\D/g, '');
  if (digits.length !== 20) return [];
  const courtSegment = `${digits[13]}.${digits.slice(14, 16)}`;
  return EPROC_PORTALS.filter(p => p.courtCode === courtSegment);
}

export function getCredentialScopeForPortal(portalId) {
  if (!portalId) return 'eproc-generic';
  if (isPjeCredentialPortalId(portalId)) return PJE_CREDENTIAL_SCOPE;
  const canonical = normalizePortalId(portalId);
  const p = canonical ? getEprocPortalById(canonical) : null;
  if (p && p.credentialScope) return p.credentialScope;
  const clean = String(portalId).toLowerCase();
  if (clean.includes('trf4') || clean.includes('jfrs') || clean.includes('jfsc') || clean.includes('jfpr')) return 'trf4-region';
  if (clean.includes('tjrs')) return 'tjrs-eproc';
  if (clean.includes('trf2') || clean.includes('jfrj') || clean.includes('jfes')) return 'trf2-eproc';
  if (clean.includes('trf6') || clean.includes('jfmg')) return 'trf6-eproc';
  if (clean.includes('tjsc')) return 'tjsc-eproc';
  if (clean.includes('tjto')) return 'tjto-eproc';
  return portalId;
}
