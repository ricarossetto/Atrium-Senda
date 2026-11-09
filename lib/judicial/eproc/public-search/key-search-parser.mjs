/**
 * ATRIUM — Eproc public key search response parser
 *
 * Converte a resposta HTML da consulta pública por chave no modelo oficial do
 * eproc, reutilizando os parsers de capa, movimentos e documentos. O transporte
 * muda; o modelo não.
 *
 * A interpretação é fail-closed: HTTP 200 só vira sucesso quando a estrutura é
 * reconhecida, o CNJ retornado é igual ao solicitado e não há marcador de
 * bloqueio (CAPTCHA, verificação humana, autenticação, restrição).
 *
 * Os nomes de campos do formulário são declarativos (não verificados live nesta
 * fase) e ficam centralizados aqui para ajuste único com fixture e teste.
 */

import { parseEprocCaseDetails, parseEprocParties } from '../parsers/case-parser.mjs';
import { parseEprocMovements } from '../parsers/movement-parser.mjs';
import { parseEprocDocuments } from '../parsers/document-parser.mjs';
import { cleanCnj, formatCnj } from '../../omni/contracts.mjs';

export const EPROC_PUBLIC_KEY_SEARCH = Object.freeze({
  actionField: 'acao',
  actionValue: 'processo_consulta_publica',
  keySearchAction: 'processo_consulta_publica_chave/consultar',
  processNumberField: 'txtNumProcesso',
  accessKeyField: 'txtNumChaveDocumento',
  legacyAccessKeyField: 'txtChaveAcesso'
});

const CAPTCHA_TURNSTILE = /cf-turnstile|challenges\.cloudflare\.com\/turnstile/i;
const CAPTCHA_HCAPTCHA = /h-captcha|hcaptcha\.com/i;
const CAPTCHA_IMAGE = /divInfraCaptcha/i;
const CAPTCHA_IMAGE_FIELD = /txtInfraCaptcha/i;

/**
 * Detecta o captcha da página do formulário de consulta por chave.
 * Nunca tenta resolver: apenas classifica para o estado honesto HUMAN_REQUIRED.
 *
 * @returns {{type:'turnstile'|'hcaptcha'|'image'}|null}
 */
export function detectEprocCaptcha(html) {
  const text = typeof html === 'string' ? html : '';
  if (!text) return null;
  if (CAPTCHA_TURNSTILE.test(text)) return { type: 'turnstile' };
  if (CAPTCHA_HCAPTCHA.test(text)) return { type: 'hcaptcha' };
  if (CAPTCHA_IMAGE.test(text) && (CAPTCHA_IMAGE_FIELD.test(text) || /<img[^>]*src=["']data:image/i.test(text))) {
    return { type: 'image' };
  }
  return null;
}

/**
 * Requisição GET da página do formulário de consulta por chave
 * (`processo_consulta_publica_chave/consultar`), derivada do registry.
 */
export function buildEprocPublicKeyFormRequest({ portal } = {}) {
  const baseUrl = String(portal?.baseUrl || '');
  let path = String(portal?.publicAccess?.keySearchPath || portal?.publicSearchPath || '');
  if (path.includes('acao=processo_consulta_publica') && !path.includes('_chave')) {
    path = path.replace('acao=processo_consulta_publica', `acao=${EPROC_PUBLIC_KEY_SEARCH.keySearchAction}`);
  }
  if (!path) path = `externo_controlador.php?acao=${EPROC_PUBLIC_KEY_SEARCH.keySearchAction}`;
  if (!baseUrl) return null;
  try {
    return { url: new URL(path, baseUrl).toString(), method: 'GET' };
  } catch {
    return null;
  }
}

const HTML_ENTITIES = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '
});

function decodeHtmlEntities(value) {
  return String(value ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = entity.toLowerCase();
    if (Object.hasOwn(HTML_ENTITIES, key)) return HTML_ENTITIES[key];
    if (key.startsWith('#x')) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith('#')) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

/**
 * Lê o formulário real de consulta por chave: action, método e campos
 * (incluindo hiddens da infra). Fail-closed: sem action ou sem os campos de
 * processo/chave, retorna null.
 */
export function parseEprocPublicKeyForm(html, baseUrl = '') {
  const text = typeof html === 'string' ? html : '';
  const match = text.match(/<form\b[^>]*action=["']([^"']*)["'][^>]*>([\s\S]*?)<\/form>/i);
  if (!match) return null;
  const actionRaw = decodeHtmlEntities(match[1]);
  let action;
  try {
    action = new URL(actionRaw, String(baseUrl || '')).toString();
  } catch {
    return null;
  }
  const fields = {};
  for (const tag of match[2].matchAll(/<input\b[^>]*>/gi)) {
    const name = decodeHtmlEntities((tag[0].match(/name=["']([^"']*)["']/i) || [])[1] || '');
    const type = ((tag[0].match(/type=["']([^"']*)["']/i) || [])[1] || 'text').toLowerCase();
    if (!name || type === 'submit' || type === 'button' || type === 'file' || type === 'image') continue;
    const value = decodeHtmlEntities((tag[0].match(/value=["']([^"']*)["']/i) || [])[1] || '');
    fields[name] = value;
  }
  const processField = Object.hasOwn(fields, EPROC_PUBLIC_KEY_SEARCH.processNumberField)
    ? EPROC_PUBLIC_KEY_SEARCH.processNumberField
    : null;
  const keyField = Object.hasOwn(fields, EPROC_PUBLIC_KEY_SEARCH.accessKeyField)
    ? EPROC_PUBLIC_KEY_SEARCH.accessKeyField
    : (Object.hasOwn(fields, EPROC_PUBLIC_KEY_SEARCH.legacyAccessKeyField) ? EPROC_PUBLIC_KEY_SEARCH.legacyAccessKeyField : null);
  if (!processField || !keyField) return null;
  return { action, method: 'POST', fields, processField, keyField };
}

const FAILURE_MARKERS = Object.freeze([
  {
    reason: 'CAPTCHA_REQUIRED',
    pattern: /(?:captcha|recaptcha|hcaptcha|txtcodigoseguranca|c[óo]digo de seguran[çc]a|informe os caracteres|caracteres da imagem|prove que voc[êe] n[ãa]o [ée] um rob[ôo])/i,
    error: 'O portal exige verificação por CAPTCHA; a consulta por chave não prossegue sem intervenção humana.'
  },
  {
    reason: 'HUMAN_REQUIRED',
    pattern: /(?:verifica[çc][ãa]o (?:de )?(?:seguran[çc]a|humana|manual)|confirme que voc[êe] [ée] humano|acesso sujeito a an[áa]lise|valida[çc][ãa]o manual|atendimento humano)/i,
    error: 'O portal exige verificação humana; nenhuma tentativa automática de contorno é permitida.'
  },
  {
    reason: 'AUTH_REQUIRED',
    pattern: /(?:efetue o login|realize o login|fa[çc]a login|entre com (?:seu )?(?:certificado|usu[áa]rio)|identifique-se|sess[ãa]o expirada|sua sess[ãa]o foi encerrada|inicie uma nova sess[ãa]o|acesso mediante (?:senha|autentica[çc][ãa]o)|informe (?:a )?senha)/i,
    error: 'O portal encerrou a sessão da consulta pública; uma nova sessão é necessária.'
  },
  {
    reason: 'RATE_LIMITED',
    pattern: /(?:muitas (?:consultas|requisi[çc][õo]es)|limite de consultas|excesso de tentativas|aguarde (?:alguns|antes de)|tente novamente mais tarde)/i,
    error: 'O portal indicou limite de consultas; tente novamente mais tarde.'
  },
  {
    reason: 'KEY_EXPIRED',
    pattern: /(?:chave (?:de acesso )?(?:expirada|expirado|vencida|vencido|revogada|revogado|fora da validade)|validade da chave (?:expirou|expirada))/i,
    error: 'A chave de acesso foi recusada como expirada ou revogada.'
  },
  {
    reason: 'KEY_INVALID',
    pattern: /(?:chave (?:de acesso )?(?:inv[áa]lida|inv[áa]lido|incorreta|incorreto|desconhecida|desconhecido|n[ãa]o confere|n[ãa]o corresponde))/i,
    error: 'A chave de acesso foi recusada pelo portal como inválida.'
  },
  {
    reason: 'NOT_FOUND',
    pattern: /(?:processo n[ãa]o (?:foi )?(?:encontrado|localizado)|n[ãa]o foi poss[íi]vel localizar|nenhum processo (?:encontrado|localizado)|processo inexistente|n[ãa]o existe processo)/i,
    error: 'O processo não foi localizado na consulta pública.'
  }
]);

const RESTRICTION_PATTERN = /(?:segredo de justi[çc]a|documentos? restritos?|acesso restrito|conte[úu]do restrito|restrito a partes)/i;
const STRUCTURE_PATTERN = /id=["']tblPartesERepresentantes["']|id=["']tblEventos["']|id=["']txtClasse["']|class=["'][^"']*infraTable/i;

export function classifyEprocKeySearchFailure(html) {
  const text = typeof html === 'string' ? html : '';
  if (!text) return null;
  for (const marker of FAILURE_MARKERS) {
    if (marker.pattern.test(text)) {
      return { reason: marker.reason, error: marker.error };
    }
  }
  return null;
}

export function buildEprocPublicKeySearchRequest({ portal, cnj, accessKey, form } = {}) {
  if (form?.action && form.processField && form.keyField) {
    const body = { ...form.fields };
    body[form.processField] = formatCnj(cnj);
    body[form.keyField] = String(accessKey ?? '');
    return { url: form.action, method: 'POST', form: body };
  }
  const baseUrl = String(portal?.baseUrl || '');
  const publicSearchPath = String(portal?.publicSearchPath || '');
  if (!baseUrl || !publicSearchPath) return null;
  let url;
  try {
    url = new URL(publicSearchPath, baseUrl).toString();
  } catch {
    return null;
  }
  const form_body = {
    [EPROC_PUBLIC_KEY_SEARCH.actionField]: EPROC_PUBLIC_KEY_SEARCH.actionValue,
    [EPROC_PUBLIC_KEY_SEARCH.processNumberField]: formatCnj(cnj),
    [EPROC_PUBLIC_KEY_SEARCH.accessKeyField]: String(accessKey ?? '')
  };
  return { url, method: 'POST', form: form_body };
}

/**
 * Interpreta a resposta bruta do portal. Retorna o modelo oficial em sucesso
 * ou uma falha tipada, sem nunca incluir a chave de acesso.
 *
 * @returns {{ok:true, cnj:string, metadata:Object, parties:Array, movements:Array, documents:Array, structure:Object}
 *          | {ok:false, reason:string, error:string}}
 */
export function interpretEprocKeySearchResponse({ html, requestedCnj, status = 0 } = {}) {
  const requested = cleanCnj(requestedCnj);
  const httpStatus = Number(status) || 0;

  if (typeof html !== 'string' || html.trim() === '') {
    if (httpStatus === 429) return { ok: false, reason: 'RATE_LIMITED', error: 'O portal indicou limite de consultas (HTTP 429).' };
    if (httpStatus === 401 || httpStatus === 407) return { ok: false, reason: 'AUTH_REQUIRED', error: 'O portal exigiu autenticação (HTTP ' + httpStatus + ').' };
    if (httpStatus >= 500) return { ok: false, reason: 'PORTAL_UNAVAILABLE', error: `O portal respondeu com erro HTTP ${httpStatus}.` };
    return { ok: false, reason: 'PARSE_ERROR', error: 'Resposta vazia ou ilegível da consulta pública.' };
  }

  const marker = classifyEprocKeySearchFailure(html);
  if (marker) return { ok: false, ...marker };

  if (httpStatus === 429) return { ok: false, reason: 'RATE_LIMITED', error: 'O portal indicou limite de consultas (HTTP 429).' };
  if (httpStatus === 401 || httpStatus === 407) return { ok: false, reason: 'AUTH_REQUIRED', error: `O portal exigiu autenticação (HTTP ${httpStatus}).` };
  if (httpStatus === 404) return { ok: false, reason: 'PORTAL_UNAVAILABLE', error: 'Endpoint de consulta pública indisponível (HTTP 404).' };
  if (httpStatus >= 500) return { ok: false, reason: 'PORTAL_UNAVAILABLE', error: `O portal respondeu com erro HTTP ${httpStatus}.` };

  const parsed = parseEprocCaseDetails(html) || {};
  const parties = parseEprocParties(html);
  const movements = parseEprocMovements(html);
  const documents = parseEprocDocuments(html);
  const returnedCnj = cleanCnj(parsed.cnj || '');
  const structureRecognized = parties.length > 0 || movements.length > 0 || STRUCTURE_PATTERN.test(html);

  if (RESTRICTION_PATTERN.test(html)) {
    const hasOpenDocument = documents.some(document => document.availability === 'available');
    if (!hasOpenDocument && movements.length === 0) {
      return { ok: false, reason: 'DOCUMENT_RESTRICTED', error: 'Processo ou documentos restritos na consulta pública.' };
    }
  }

  if (!returnedCnj && !structureRecognized) {
    return { ok: false, reason: 'PARSE_ERROR', error: 'Estrutura da consulta pública não reconhecida.' };
  }
  if (!returnedCnj) {
    return { ok: false, reason: 'PARSE_ERROR', error: 'A resposta não identifica o número do processo (CNJ).' };
  }
  if (returnedCnj !== requested) {
    return {
      ok: false,
      reason: 'PARSE_ERROR',
      error: `CNJ divergente: a resposta pertence a ${formatCnj(returnedCnj)}, não ao processo solicitado.`
    };
  }

  const { accessKey: _redactedAccessKey, ...metadata } = parsed;
  return {
    ok: true,
    cnj: returnedCnj,
    metadata,
    parties,
    movements,
    documents,
    structure: {
      coverRecognized: structureRecognized || Boolean(returnedCnj),
      eventsRecognized: movements.length > 0,
      partyCount: parties.length,
      movementCount: movements.length,
      documentCount: documents.length
    }
  };
}
