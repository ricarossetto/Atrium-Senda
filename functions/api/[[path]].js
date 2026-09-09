/**
 * Cloudflare Pages Function — Transparent Edge Reverse Proxy
 * Encaminha chamadas /api/* do frontend na Cloudflare Pages para o backend VPS
 */
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const targetUrl = new URL(url.pathname + url.search, 'https://api.atrium.adv.br');

  const headers = new Headers(context.request.headers);
  headers.set('X-Forwarded-Host', url.host);
  headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

  const newRequest = new Request(targetUrl, {
    method: context.request.method,
    headers: headers,
    body: ['GET', 'HEAD'].includes(context.request.method) ? undefined : context.request.body,
    redirect: 'follow'
  });

  return fetch(newRequest);
}
