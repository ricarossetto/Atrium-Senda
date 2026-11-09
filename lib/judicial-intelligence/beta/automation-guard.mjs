import { JudicialIntelligenceError, JI_ERROR_CODES } from '../core/errors.mjs';
import { parseFlagValue } from './feature-flags.mjs';

export const AUTOMATION_KILL_SWITCH = 'BETA_DISABLE_AUTOMATIONS';
export const AUTOMATION_OPERATIONS = Object.freeze([
  'scanner',
  'mass-download',
  'certificate-batch',
  'monitoring',
  'polling',
  'scheduled-run'
]);

export function automationsDisabled(env = process.env) {
  return parseFlagValue(env?.[AUTOMATION_KILL_SWITCH], true);
}

export function automationPolicy(env = process.env) {
  const disabled = automationsDisabled(env);
  const raw = env?.[AUTOMATION_KILL_SWITCH];
  return {
    automationsDisabled: disabled,
    source: raw === undefined || raw === null || String(raw).trim() === '' ? 'default' : 'environment',
    killSwitch: AUTOMATION_KILL_SWITCH,
    note: disabled
      ? 'Automações do beta bloqueadas; nenhuma varredura, download massivo, lote de certidões ou monitoramento inicia por conta própria.'
      : 'Automações liberadas explicitamente para execução supervisionada.'
  };
}

export function assertAutomationsEnabled(env = process.env, { operation = 'automation', provider = 'judicial-intelligence' } = {}) {
  if (!automationsDisabled(env)) return true;
  throw new JudicialIntelligenceError(
    JI_ERROR_CODES.DISABLED,
    `Operação ${operation} bloqueada: subir o servidor beta não autoriza automação.`,
    {
      provider,
      operation,
      humanAction: `${AUTOMATION_KILL_SWITCH} é true por padrão. Defina explicitamente ${AUTOMATION_KILL_SWITCH}=false apenas para uma execução local supervisionada.`
    }
  );
}
