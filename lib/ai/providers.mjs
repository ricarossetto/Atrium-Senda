const ZEN_MODELS = Object.freeze([
  'claude-fable-5', 'claude-fable-5-1', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-4-5',
  'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-sonnet-4', 'claude-haiku-4-5',
  'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro', 'gemini-3-flash',
  'gpt-6-astra', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-5.4-pro', 'gpt-5.4-mini', 'gpt-5.4-nano',
  'gpt-5.3-codex', 'gpt-5.3-codex-spark', 'gpt-5.2', 'gpt-5.2-codex', 'gpt-5.1', 'gpt-5.1-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini',
  'gpt-5', 'gpt-5-codex', 'gpt-5-nano',
  'grok-4.6', 'grok-4.5', 'grok-build-0.1',
  'deepseek-v4.1-flash', 'deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp',
  'glm-5.3', 'glm-5.3-flash', 'glm-5.2', 'glm-5.1', 'glm-5',
  'kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6', 'kimi-k2.5',
  'minimax-m3', 'minimax-m2.7', 'minimax-m2.5',
  'qwen3.8-flash', 'qwen3.6-plus', 'qwen3.5-plus',
  'mimo-v2.5-free', 'deepseek-v4-flash-free', 'jev-1.13-free', 'muse-spark-1.3-contributor-free', 'muse-spark-1.2-contributor-free',
  'ling-3.0-flash-fin-free', 'nemotron-3-ultra-free', 'nemotron-3.5-lightning-free',
  'big-pickle', 'jev-1.13', 'muse-spark-1.3', 'muse-spark-1.2'
]);

const ZEN_GO_MODELS = Object.freeze([
  'deepseek-v4.1-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'deepseek-v4-pro', 'deepseek-flash',
  'minimax-m3', 'minimax-m2.7', 'minimax-m2.5',
  'kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6', 'kimi-k2.5',
  'glm-5.3', 'glm-5.3-flash', 'glm-5.2', 'glm-5.1', 'glm-5',
  'qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-plus', 'qwen3.5-plus',
  'grok-4.6', 'grok-4.5',
  'mimo-v2.5', 'mimo-v2.5-pro', 'mimo-v2-pro', 'mimo-v2-omni',
  'gpt-5.6-luna',
  'longcat-2.0', 'hy4-preview', 'hy3', 'hy3-preview',
  'muse-spark-1.3-contributor', 'muse-spark-1.2-contributor', 'omen-alpha'
]);

export const AI_PROVIDER_CATALOG = Object.freeze({
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    baseUrl: null,
    docsUrl: 'https://aistudio.google.com/app/apikey',
    defaultModel: 'gemini-3.5-flash-lite',
    models: ['gemini-3.5-flash-lite', 'gemini-2.5-flash']
  },
  zen: {
    id: 'zen',
    label: 'OpenCode Zen',
    kind: 'openai-compatible',
    baseUrl: 'https://opencode.ai/zen/v1',
    docsUrl: 'https://opencode.ai/docs/zen',
    defaultModel: 'big-pickle',
    models: ZEN_MODELS
  },
  'zen-anthropic': {
    id: 'zen-anthropic',
    label: 'OpenCode Zen (Anthropic)',
    kind: 'anthropic-compatible',
    baseUrl: 'https://opencode.ai/zen/v1',
    docsUrl: 'https://opencode.ai/docs/zen',
    defaultModel: 'big-pickle',
    models: ZEN_MODELS
  },
  'zen-go': {
    id: 'zen-go',
    label: 'OpenCode Go',
    kind: 'openai-compatible',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    docsUrl: 'https://opencode.ai/docs/go',
    requiresSessionHeader: true,
    defaultModel: 'deepseek-v4-flash',
    models: ZEN_GO_MODELS
  },
  'zen-go-anthropic': {
    id: 'zen-go-anthropic',
    label: 'OpenCode Go (Anthropic)',
    kind: 'anthropic-compatible',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    docsUrl: 'https://opencode.ai/docs/go',
    requiresSessionHeader: true,
    defaultModel: 'minimax-m3',
    models: ZEN_GO_MODELS
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-5-mini',
    models: ['gpt-5-mini', 'gpt-5.2']
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic-compatible',
    baseUrl: 'https://api.anthropic.com/v1',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-haiku-4-5',
    models: ['claude-haiku-4-5', 'claude-sonnet-5']
  }
});

export const AI_PROVIDER_IDS = Object.freeze(Object.keys(AI_PROVIDER_CATALOG));

export const DEFAULT_PROVIDER_ID = 'gemini';

export function providerDefinition(id) {
  return AI_PROVIDER_CATALOG[String(id || '').trim()] || null;
}

export function providerSummary(id) {
  const definition = providerDefinition(id);
  if (!definition) return null;
  return {
    id: definition.id,
    label: definition.label,
    kind: definition.kind,
    baseUrl: definition.baseUrl,
    docsUrl: definition.docsUrl,
    defaultModel: definition.defaultModel,
    models: definition.models,
    requiresSessionHeader: Boolean(definition.requiresSessionHeader)
  };
}

export function contentsToMessages(contents = []) {
  return (Array.isArray(contents) ? contents : [])
    .filter(item => item && Array.isArray(item.parts))
    .map(item => ({
      role: item.role === 'model' || item.role === 'assistant' ? 'assistant' : 'user',
      content: item.parts.map(part => String(part?.text ?? '')).join('\n')
    }))
    .filter(message => message.content.length > 0);
}

export function buildProviderChatRequest({
  kind,
  baseUrl,
  apiKey,
  model,
  systemInstruction = null,
  contents = [],
  maxTokens = 4096,
  sessionId = '',
  userAgent = 'ATRIUM-LegalIntelligence/1.0'
} = {}) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('Base URL do provedor de IA é obrigatória.');
  const messages = contentsToMessages(contents);
  const sessionHeader = sessionId ? { 'x-opencode-session': String(sessionId).slice(0, 120) } : {};
  if (kind === 'openai-compatible') {
    return {
      url: `${base}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': userAgent,
        ...sessionHeader
      },
      body: {
        model,
        messages: systemInstruction ? [{ role: 'system', content: String(systemInstruction) }, ...messages] : messages,
        max_tokens: maxTokens
      }
    };
  }
  if (kind === 'anthropic-compatible') {
    return {
      url: `${base}/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'User-Agent': userAgent,
        ...sessionHeader
      },
      body: {
        model,
        max_tokens: maxTokens,
        ...(systemInstruction ? { system: String(systemInstruction) } : {}),
        messages
      }
    };
  }
  throw new Error(`Tipo de provedor de IA não suportado: ${kind}.`);
}

function normalizeProviderUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0;
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0;
  const totalTokens = Number(usage.total_tokens ?? 0) || (promptTokens + completionTokens);
  if (!promptTokens && !completionTokens && !totalTokens) return null;
  return { promptTokens, completionTokens, totalTokens, reported: true };
}

export function extractProviderChatResponse({ kind, payload } = {}) {
  if (kind === 'openai-compatible') {
    const choice = payload?.choices?.[0] || {};
    const text = typeof choice.message?.content === 'string'
      ? choice.message.content
      : Array.isArray(choice.message?.content)
        ? choice.message.content.map(part => String(part?.text ?? '')).join('')
        : '';
    return { text, model: String(payload?.model || choice.model || ''), usage: normalizeProviderUsage(payload?.usage) };
  }
  if (kind === 'anthropic-compatible') {
    const text = Array.isArray(payload?.content)
      ? payload.content.map(part => String(part?.text ?? '')).join('')
      : '';
    return { text, model: String(payload?.model || ''), usage: normalizeProviderUsage(payload?.usage) };
  }
  throw new Error(`Tipo de provedor de IA não suportado: ${kind}.`);
}

export async function callCompatibleProvider({
  kind,
  baseUrl,
  apiKey,
  model,
  systemInstruction = null,
  contents = [],
  maxTokens = 4096,
  sessionId = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 120_000
} = {}) {
  if (!apiKey) throw new Error('Chave de API do provedor não configurada.');
  if (typeof fetchImpl !== 'function') throw new Error('Cliente HTTP indisponível para o provedor.');
  const request = buildProviderChatRequest({ kind, baseUrl, apiKey, model, systemInstruction, contents, maxTokens, sessionId });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
      throw new Error(`Falha do provedor de IA (${response.status}): ${String(detail).slice(0, 300)}`);
    }
    const parsed = extractProviderChatResponse({ kind, payload });
    return { text: parsed.text, model: parsed.model || model, usage: parsed.usage || null };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado na consulta ao provedor de IA.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
