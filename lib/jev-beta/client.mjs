import { getJevSchema, assertJevInputSize } from './schemas.mjs';

export const JEV_DEFAULT_API_URL = 'https://api.typesafe.ai/v1/decide';
/**
 * Provider API oficial do modelo de decisão JEV (Command Code):
 * `POST /provider/v1/systemone` com `Authorization: Bearer <CMD_API_KEY>` e o mesmo corpo do
 * headless — `{ model, state, questions }` — devolvendo `{ model, answers, usage }`.
 * É o caminho do JEV **na nuvem**, sem depender do CLI em máquina local.
 */
export const JEV_PROVIDER_API_URL = 'https://api.commandcode.ai/provider/v1/systemone';
export const JEV_DEFAULT_MODEL = 'jev-1.13';
export const JEV_GATEWAY_MODEL = 'typesafe/jev-1.13';

const TRUTHY_JEV = new Set(['1', 'true', 'yes', 'on', 'enabled']);

export function isLocalTransportAllowed(env = process.env) {
  return TRUTHY_JEV.has(String(env?.JEV_ALLOW_LOCAL_TRANSPORT ?? '').trim().toLowerCase());
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);

function isLoopbackHost(host) {
  return LOOPBACK_HOSTS.has(String(host || '').toLowerCase());
}

function assertJevUrl(raw, { context = 'jev-url', allowLocal = false } = {}) {
  const value = String(raw || '').trim();
  if (!value) {
    const error = new Error(`URL ausente em ${context}.`);
    error.code = 'INVALID_URL';
    throw error;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    const error = new Error(`URL inválida em ${context}.`);
    error.code = 'INVALID_URL';
    throw error;
  }
  if (parsed.protocol !== 'https:') {
    const localHttp = allowLocal === true && parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname);
    if (!localHttp) {
      const error = new Error(`Somente HTTPS em ${context} (HTTP só em loopback com JEV_ALLOW_LOCAL_TRANSPORT=true).`);
      error.code = 'INVALID_URL';
      throw error;
    }
  }
  if (parsed.username || parsed.password) {
    const error = new Error(`Credencial embutida na URL em ${context}.`);
    error.code = 'INVALID_URL';
    throw error;
  }
  const host = parsed.hostname.toLowerCase();
  const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'];
  const localBypass = allowLocal === true && isLoopbackHost(host);
  if (!localBypass && (blocked.includes(host) || host.endsWith('.local') || host.endsWith('.internal'))) {
    const error = new Error(`Host bloqueado em ${context}: ${host}.`);
    error.code = 'BLOCKED_HOST';
    throw error;
  }
  if (host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('172.')) {
    const error = new Error(`Rede privada bloqueada em ${context}: ${host}.`);
    error.code = 'BLOCKED_HOST';
    throw error;
  }
  if (host === '169.254.169.254' || host === 'metadata.google.internal') {
    const error = new Error(`Metadata endpoint bloqueado em ${context}.`);
    error.code = 'BLOCKED_HOST';
    throw error;
  }
  return parsed.toString();
}

export function buildJevDecideRequest({ schemaId, redactedText, model = JEV_DEFAULT_MODEL, apiUrl = JEV_DEFAULT_API_URL, allowLocal = false } = {}) {
  const schema = getJevSchema(schemaId);
  assertJevInputSize(redactedText);
  const url = assertJevUrl(apiUrl, { context: 'jev-api-url', allowLocal });
  const cleanModel = String(model || '').trim();
  if (!cleanModel) {
    const error = new Error('Modelo Jev ausente.');
    error.code = 'INVALID_MODEL';
    throw error;
  }
  return {
    mode: 'direct',
    url,
    headers: { 'Content-Type': 'application/json' },
    body: {
      model: cleanModel,
      schema: schema.id,
      schemaVersion: schema.version,
      state: String(redactedText),
      questions: schema.questions.map(question => ({ key: question.key, labels: [...question.labels] }))
    }
  };
}

export function buildJevGatewayRequest({ schemaId, redactedText, model = JEV_GATEWAY_MODEL, baseUrl = 'https://openrouter.ai/api/v1', allowLocal = false } = {}) {
  const schema = getJevSchema(schemaId);
  assertJevInputSize(redactedText);
  const base = assertJevUrl(baseUrl, { context: 'jev-gateway-url', allowLocal });
  const prompt = `Classifique de forma assistiva (sugestão, sem prazo, sem vínculo automático) no schema ${schema.id} ${schema.version}. Responda em JSON com probabilidades por pergunta. Texto: ${String(redactedText).slice(0, 8000)}`;
  return {
    mode: 'gateway-degraded',
    url: `${base.replace(/\/+$/, '')}/chat/completions`,
    headers: { 'Content-Type': 'application/json' },
    body: {
      model: String(model),
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 512
    }
  };
}

export const NINE_ROUTER_DEFAULT_BASE_URL = 'http://127.0.0.1:20128/v1';
export const NINE_ROUTER_FREE_MODEL = 'opencode/jev-1.13-free';
export const NINE_ROUTER_ZEN_MODEL = 'opencode/jev-1.13';

export function buildNineRouterSystemoneRequest({ model = NINE_ROUTER_FREE_MODEL, state, questions, baseUrl = NINE_ROUTER_DEFAULT_BASE_URL, allowLocal = false } = {}) {
  const cleanModel = String(model || '').trim();
  if (!cleanModel) {
    const error = new Error('Modelo System One ausente (ex.: opencode/jev-1.13-free).');
    error.code = 'INVALID_MODEL';
    throw error;
  }
  const cleanState = String(state ?? '');
  assertJevInputSize(cleanState);
  if (!questions || typeof questions !== 'object' || Array.isArray(questions) || Object.keys(questions).length === 0) {
    const error = new Error('Questions ausente ou inválido: objeto não-vazio exigido pelo handler System One.');
    error.code = 'INVALID_QUESTIONS';
    throw error;
  }
  const base = assertJevUrl(baseUrl, { context: 'nine-router-url', allowLocal });
  return {
    mode: 'nine-router-systemone',
    url: `${base.replace(/\/+$/, '')}/systemone`,
    headers: { 'Content-Type': 'application/json' },
    body: { model: cleanModel, state: cleanState, questions }
  };
}

export function schemaToSystemoneQuestions(schemaId) {
  const schema = getJevSchema(schemaId);
  const questions = {};
  for (const question of schema.questions) {
    if (question.kind === 'noul') {
      questions[question.key] = { type: 'noul', instructions: question.instructions };
    } else {
      questions[question.key] = { type: 'choice', instructions: question.instructions, criteria: { ...question.criteria } };
    }
  }
  return questions;
}

export const CMD_PROVIDER_MODEL = 'typesafe/jev';

export function buildHeadlessPayload({ model = CMD_PROVIDER_MODEL, state, questions } = {}) {
  const cleanModel = String(model || '').trim();
  if (!cleanModel) {
    const error = new Error('Modelo System One ausente (ex.: typesafe/jev).');
    error.code = 'INVALID_MODEL';
    throw error;
  }
  const cleanState = String(state ?? '');
  assertJevInputSize(cleanState);
  if (!questions || typeof questions !== 'object' || Array.isArray(questions) || Object.keys(questions).length === 0) {
    const error = new Error('Questions ausente ou inválido: objeto não-vazio exigido.');
    error.code = 'INVALID_QUESTIONS';
    throw error;
  }
  return { stdin: JSON.stringify({ model: cleanModel, state: cleanState, questions }) };
}

/**
 * Corpo oficial da Provider API do JEV (Command Code): idêntico ao headless —
 * `{ model, state, questions }` — para o modelo de decisão rodar na nuvem com uma chave
 * do Command Code, sem CLI e sem máquina local.
 */
export function buildJevProviderRequest({ schemaId, state, model = CMD_PROVIDER_MODEL, apiUrl = JEV_PROVIDER_API_URL, allowLocal = false } = {}) {
  const url = assertJevUrl(apiUrl, { context: 'jev-provider-url', allowLocal });
  const { stdin } = buildHeadlessPayload({ model, state, questions: schemaToSystemoneQuestions(schemaId) });
  return { mode: 'provider-api', url, headers: { 'Content-Type': 'application/json' }, body: JSON.parse(stdin) };
}

export function parseHeadlessEnvelope(text) {
  let envelope;
  try {
    envelope = JSON.parse(String(text ?? ''));
  } catch {
    const error = new Error('Envelope headless inválido (não-JSON).');
    error.code = 'PARSE_ERROR';
    throw error;
  }
  if (envelope?.type !== 'result' || envelope?.subtype !== 'success' || !envelope?.answers || typeof envelope.answers !== 'object') {
    const error = new Error('Envelope headless sem answers de sucesso.');
    error.code = 'PARSE_ERROR';
    error.details = { subtype: envelope?.subtype || 'unknown' };
    throw error;
  }
  return { model: String(envelope.model || ''), answers: envelope.answers, usage: envelope.usage || null };
}

export function assertCmdBin(value) {
  const bin = String(value || 'commandcode').trim() || 'commandcode';
  if (!/^[A-Za-z0-9_.-]+$/.test(bin)) {
    const error = new Error('Binário do CLI inválido (só nome simples, sem caminho ou metacaracteres).');
    error.code = 'INVALID_BIN';
    throw error;
  }
  return bin;
}

export function assertHeadlessModel(value) {
  const model = String(value || '').trim();
  if (!/^[A-Za-z0-9_./:-]+$/.test(model)) {
    const error = new Error('Model id inválido para o CLI headless (só letras, números e _ . / : -).');
    error.code = 'INVALID_MODEL';
    throw error;
  }
  return model;
}

export async function callHeadlessCmd({ bin = 'commandcode', model, state, questions, timeoutMs = 60000, execImpl } = {}) {
  const safeBin = assertCmdBin(bin);
  const safeModel = assertHeadlessModel(model);
  const { stdin } = buildHeadlessPayload({ model: safeModel, state, questions });
  let execFn = execImpl;
  if (!execFn) {
    ({ exec: execFn } = await import('node:child_process'));
  }
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = (await import('node:path')).default;
  const dir = await mkdtemp(path.join(tmpdir(), 'jev-headless-'));
  const file = path.join(dir, 'stdin.json');
  await writeFile(file, stdin, 'utf8');
  const command = `"${safeBin}" -p -m "${safeModel}" --output-format json < "${file}"`;
  return new Promise((resolve, reject) => {
    execFn(command, { timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true }, async (error, stdout) => {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      if (error) {
        const failure = new Error(`Falha do CLI headless (${safeBin}): ${String(error?.message || error).slice(0, 200)}`);
        failure.code = 'CMD_FAILED';
        reject(failure);
        return;
      }
      try {
        resolve(parseHeadlessEnvelope(stdout));
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

export function extractJevDecision(payload, { schemaId } = {}) {
  const schema = getJevSchema(schemaId);
  if (!payload || typeof payload !== 'object') {
    const error = new Error('Resposta Jev vazia ou inválida.');
    error.code = 'PARSE_ERROR';
    throw error;
  }
  const decisions = payload.answers || payload.decisions || payload.outputs || payload.result || payload.questions || payload.data || null;
  if (!decisions || typeof decisions !== 'object') {
    const error = new Error('Resposta Jev sem decisões tipadas.');
    error.code = 'PARSE_ERROR';
    throw error;
  }
  const normalized = {};
  for (const question of schema.questions) {
    const entry = decisions[question.key];
    if (!entry || typeof entry !== 'object') continue;
    let label = '';
    let confidence = NaN;
    if (typeof entry.choice === 'string') {
      label = entry.choice;
      const probs = Object.values(entry.probabilities || {}).filter(value => Number.isFinite(Number(value))).map(Number);
      confidence = Number(entry.confidence ?? (probs.length > 0 ? Math.max(...probs) : NaN));
    } else if (typeof entry.noul === 'number' && Number.isFinite(entry.noul)) {
      const affirmative = entry.noul >= 0.5;
      label = affirmative ? 'sim' : 'nao';
      confidence = affirmative ? entry.noul : 1 - entry.noul;
    } else if (entry.type === 'score' || (entry.label === undefined && entry.value === undefined && entry.score !== undefined)) {
      const legend = entry.legend || {};
      label = String(legend[String(entry.score)] ?? entry.score);
      confidence = Number(entry.confidence ?? NaN);
    } else {
      label = String(entry.label ?? entry.value ?? '');
      confidence = Number(entry.confidence ?? entry.probability ?? entry.score ?? NaN);
    }
    if (!question.labels.includes(label) || !Number.isFinite(confidence)) continue;
    normalized[question.key] = { label, confidence: Math.min(1, Math.max(0, confidence)) };
  }
  return normalized;
}

export async function callJev({ request, apiKey, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (!request?.url || !request?.body) {
    const error = new Error('Request Jev inválido.');
    error.code = 'INVALID_REQUEST';
    throw error;
  }
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    const error = new Error('JEV_API_KEY ausente; forneça a chave efêmera no próprio executor.');
    error.code = 'MISSING_KEY';
    throw error;
  }
  if (typeof fetchImpl !== 'function') {
    const error = new Error('Cliente HTTP indisponível.');
    error.code = 'UNAVAILABLE';
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(request.url, {
      method: 'POST',
      headers: { ...request.headers, Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(request.body),
      signal: controller.signal,
      redirect: 'error'
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const status = response.status;
      const code = status === 401 || status === 403 ? 'UNAUTHORIZED' : status === 429 ? 'RATE_LIMITED' : status >= 500 ? 'UNAVAILABLE' : 'PARSE_ERROR';
      const rawExcerpt = JSON.stringify(payload)?.slice(0, 800) || '';
      const hint = code === 'UNAUTHORIZED'
        ? ' Verifique JEV_API_KEY (chave de API do 9Router, não a de outro provider).'
        : status === 422
          ? ' Corpo rejeitado pelo 9Router/montante: confira model/state/questions ou se o provider está ligado no dashboard.'
          : '';
      const error = new Error(`Falha do provedor Jev (HTTP ${status}).${hint}`);
      error.code = code;
      error.details = { status, bodyExcerpt: rawExcerpt };
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Tempo esgotado na consulta Jev.');
      timeoutError.code = 'TIMEOUT';
      throw timeoutError;
    }
    if (!error?.code && /fetch failed|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ECONNRESET|ETIMEDOUT/i.test(String(error?.message || ''))) {
      const unreachable = new Error('O provedor JEV não está alcançável. Confira a configuração do endpoint (JEV_API_URL) e a conectividade do servidor.');
      unreachable.code = 'UNREACHABLE';
      unreachable.details = { hint: 'verifique o endpoint configurado e a rota de rede do servidor; loops locais exigem JEV_ALLOW_LOCAL_TRANSPORT=true' };
      throw unreachable;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
