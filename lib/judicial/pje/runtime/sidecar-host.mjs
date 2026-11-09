import { PjeRuntimeUnavailableError } from './browser-host.mjs';

export function isPjeSidecarChannelAvailable() {
  return false;
}

export async function openSidecarPjeSession({ portal } = {}) {
  throw new PjeRuntimeUnavailableError(
    `Runtime local_sidecar ainda não possui canal com o agente local para o portal ${portal?.id || 'desconhecido'}. `
    + 'O mesmo collector roda no runtime server; a delegação ao sidecar será habilitada em fase própria.',
    { portalId: portal?.id || '', runtime: 'local_sidecar' }
  );
}
