// Probes locais e determinísticos do health estrito do MEGA BETA.
//
// Regras:
// - Nunca tocam a rede, nunca usam dados reais e nunca afirmam estado melhor do
//   que o efetivamente observado nesta execução.
// - Módulos que dependem de fonte externa permanecem UNVERIFIED/HUMAN_REQUIRED
//   no health; a verificação ao vivo existe apenas nos comandos de opt-in
//   supervisionado (`datajud-check` / `pdpj-probe`).
// - Cada probe devolve `{ status, verificationState, note }` consumido pelo
//   BetaStatusRegistry, que registra se o estado foi declarado ou testado.

import { VERIFICATION_STATES } from '../core/verification-state.mjs';
import { classifyMovements } from '../process-intelligence/movement-classifier.mjs';
import { createFixtureAcquisitionProvider } from '../providers/documents/fixture-provider.mjs';
import { scanSecrets } from '../security/secret-scanner.mjs';
import { scanLogPii } from '../security/pii-scanner.mjs';
import { createPdpjTokenProvider } from '../providers/pdpj/auth.mjs';
import { createDefaultCertificateRegistry } from '../providers/certificates/index.mjs';
import { chunkText } from '../rag/chunker.mjs';
import { buildGroundedAnswer } from '../rag/abstention.mjs';

const FIXTURE_CNJ = '0000000-00.0000.0.00.0000';

function syntheticSecretLine() {
  return ['const ', ['api', '_key'].join(''), " = '", 'P'.repeat(24), "';"].join('');
}

function syntheticLogLine() {
  return `${['console', '.', 'log'].join('')}(\`Sessao: \${${['session', 'Cookie'].join('')}}\`);`;
}

function probeProcessIntelligence() {
  const movements = classifyMovements([
    { date: '2024-01-10', description: 'Conclusos para decisao' },
    { date: '2024-01-11', description: 'Publicacao de intimacao no diario' }
  ], {});
  const methods = [...new Set(movements.map(movement => movement.classification?.method ?? 'none'))];
  return {
    status: methods.length > 0 && !methods.includes('none') ? 'ok' : 'degraded',
    verificationState: VERIFICATION_STATES.FIXTURE_VALIDATED,
    note: `Classificacao local executada com fixture; metodos efetivos: ${methods.join(', ') || 'nenhum'}.`
  };
}

async function probeDocuments() {
  const provider = createFixtureAcquisitionProvider({ documents: 2 });
  const listed = await provider.listDocuments(FIXTURE_CNJ);
  return {
    status: listed.length === 2 ? 'ok' : 'degraded',
    verificationState: VERIFICATION_STATES.FIXTURE_VALIDATED,
    note: `Provider fixture listou ${listed.length} documento(s) sintetico(s) sem rede.`
  };
}

function probePrivacyAudit() {
  const secretFindings = scanSecrets({ file: 'probe/config.mjs', lines: [syntheticSecretLine()] });
  const piiFindings = scanLogPii({ file: 'probe/log.mjs', lines: [syntheticLogLine()] });
  const detected = secretFindings.length >= 1 && piiFindings.length >= 1;
  return {
    status: detected ? 'ok' : 'degraded',
    verificationState: VERIFICATION_STATES.FIXTURE_VALIDATED,
    note: detected
      ? 'Deteccao local de segredo e PII sinteticos confirmada.'
      : 'Deteccao local de segredo/PII nao confirmada.'
  };
}

function probeRag() {
  const chunks = chunkText('Documento sintetico de prova. '.repeat(20));
  const answer = buildGroundedAnswer({ question: 'Qual o teor do documento?', evidence: [] });
  const abstained = answer?.status === 'INSUFFICIENT_EVIDENCE';
  return {
    status: chunks.length >= 1 && abstained ? 'ok' : 'degraded',
    verificationState: VERIFICATION_STATES.FIXTURE_VALIDATED,
    note: abstained
      ? `Chunking local e abstencao confirmados (${chunks.length} chunk(s)); resposta sem evidencia nao e afirmada.`
      : 'Abstencao sem evidencia nao confirmada.'
  };
}

function probeDatajud() {
  return {
    status: 'experimental',
    verificationState: VERIFICATION_STATES.UNVERIFIED,
    note: 'Probe de rede nao executado pelo health; use datajud-check com opt-in supervisionado.'
  };
}

function probePdpj(env) {
  const state = createPdpjTokenProvider({ env }).describe();
  if (!state.present) {
    return {
      status: 'experimental',
      verificationState: VERIFICATION_STATES.HUMAN_REQUIRED,
      note: 'Sem JWT humano (PDPJ_ACCESS_TOKEN ausente); o beta nao automatiza login.'
    };
  }
  return {
    status: 'experimental',
    verificationState: VERIFICATION_STATES.UNVERIFIED,
    note: 'Token humano presente; probe de rede nao executado pelo health.'
  };
}

async function probeCertificates(env) {
  const readiness = await createDefaultCertificateRegistry({ env }).readiness();
  const issuers = Object.entries(readiness);
  const ready = issuers.filter(([, state]) => state.ready === true).map(([id]) => id);
  return {
    status: 'experimental',
    verificationState: ready.length > 0 ? VERIFICATION_STATES.UNVERIFIED : VERIFICATION_STATES.HUMAN_REQUIRED,
    note: ready.length > 0
      ? `Credencial presente para: ${ready.join(', ')}; probe de rede nao executado pelo health.`
      : 'Nenhum emissor com credencial institucional; emissores retornam human_required.'
  };
}

export function createDefaultHealthProbes({ env = process.env } = {}) {
  return Object.freeze({
    process_intelligence: () => probeProcessIntelligence(),
    documents: () => probeDocuments(),
    privacy_audit: () => probePrivacyAudit(),
    rag: () => probeRag(),
    datajud: () => probeDatajud(),
    pdpj: () => probePdpj(env),
    mni: () => probePdpj(env),
    certificates: () => probeCertificates(env)
  });
}
