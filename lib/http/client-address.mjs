// Endereço do cliente para todos os limites de tentativas (login, recuperação, MFA, convites, rotas
// autenticadas com limite e ferramentas públicas).
//
// Em produção o servidor só enxerga o proxy (Cloudflare Pages → Caddy), então o endereço do socket é
// o mesmo para todos. O proxy do Pages (functions/api/[[path]].js) repassa o endereço real em
// `x-atrium-client-ip` junto da chave `x-atrium-edge-key`, que só ele e o servidor conhecem
// (ATRIUM_EDGE_KEY). O servidor só aceita esse endereço quando a chave confere; caso contrário usa o
// socket. X-Forwarded-For nunca é considerado (AGENTS.md §32). Sem a chave configurada, todos os
// limites voltam ao socket.
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export const EDGE_KEY_HEADER = 'x-atrium-edge-key';
export const CLIENT_IP_HEADER = 'x-atrium-client-ip';
export const MIN_EDGE_KEY_LENGTH = 32;

function sameKey(received, expected) {
  const a = Buffer.from(String(received));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function publicClientAddress(req, env = process.env) {
  const socket = String(req?.socket?.remoteAddress || 'desconhecido').toLowerCase();
  const expected = String(env?.ATRIUM_EDGE_KEY || '');
  if (expected.length < MIN_EDGE_KEY_LENGTH) return socket;
  const received = req?.headers?.[EDGE_KEY_HEADER];
  const claimed = String(req?.headers?.[CLIENT_IP_HEADER] || '').trim();
  if (typeof received !== 'string' || !sameKey(received, expected)) return socket;
  if (!isIP(claimed)) return socket;
  return claimed.toLowerCase();
}
