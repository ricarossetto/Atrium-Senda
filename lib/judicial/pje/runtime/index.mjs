import { resolvePjeRuntime } from '../portal-registry.mjs';
import { PjeRuntimeUnavailableError } from './browser-host.mjs';
import { openServerPjeSession } from './server-host.mjs';
import { openSidecarPjeSession, isPjeSidecarChannelAvailable } from './sidecar-host.mjs';

const RUNTIME_HOSTS = Object.freeze({
  server: openServerPjeSession,
  local_sidecar: openSidecarPjeSession
});

export function listPjeRuntimeHosts() {
  return Object.freeze(Object.keys(RUNTIME_HOSTS));
}

export async function openPjeBrowserSession({
  portal,
  requested = 'auto',
  onRuntimeFallback,
  ...options
} = {}) {
  const plan = resolvePjeRuntime(portal, requested);
  const chain = [plan.runtime, ...plan.fallbacks].filter(runtime => runtime !== 'local_sidecar' || isPjeSidecarChannelAvailable());
  let lastError = null;
  for (const runtime of chain) {
    const host = RUNTIME_HOSTS[runtime];
    if (!host) continue;
    try {
      return await host({ portal, ...options });
    } catch (error) {
      if (error?.errorCode === 'PJE-RUNTIME-UNAVAILABLE') {
        lastError = error;
        if (typeof onRuntimeFallback === 'function') {
          onRuntimeFallback({ from: runtime, to: chain[chain.indexOf(runtime) + 1] || null, error });
        }
        continue;
      }
      throw error;
    }
  }
  throw lastError || new PjeRuntimeUnavailableError('Nenhum runtime PJe disponível para este portal.');
}

export { PjeRuntimeUnavailableError, isPjeSidecarChannelAvailable, openSidecarPjeSession };
