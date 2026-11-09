/**
 * Adaptador FINO entre o oráculo sintético e o motor de produção do ATRIUM.
 *
 * Propósito: provar que o código de PRODUÇÃO (`lib/calc/lc142.mjs`) reproduz o
 * contrato observado. Este arquivo não contém regra de negócio, não lê resultados
 * esperados e não fabrica números: só traduz o schema do oráculo para a forma que
 * a produção consome e devolve o envelope que ela produziu.
 *
 * Regras do adaptador:
 *  - `calculateScenario(calculation)` recebe o caso do fixture e devolve o envelope.
 *  - Não muta a entrada (o comparador verifica isso).
 *  - Não consulta `expected`, não importa o fixture, não chama serviço externo.
 *  - Erros de validação propagam como `Error` com a mensagem do motor.
 */

import { calculateCase, parseRulePolicy } from '../lib/calc/lc142.mjs';

/**
 * Traduz o `Calculation` do oráculo para o mesmo objeto que a produção espera.
 * Nada é reinterpretado: apenas repassado, porque o motor de produção adota o
 * mesmo schema de entrada (string decimal, datas ISO, competência AAAA-MM).
 */
function traduzir(calculation) {
  return {
    id: calculation.id,
    name: calculation.name,
    kind: calculation.kind,
    status: calculation.status,
    identity: calculation.identity ?? {},
    cnis: calculation.cnis ?? null,
    sex: calculation.sex ?? null,
    disability: calculation.disability ?? null,
    dib: calculation.dib,
    scenario: calculation.scenario,
    assistant: calculation.assistant ?? null,
    manual_links: Array.isArray(calculation.manual_links) ? calculation.manual_links : [],
    manual_salaries: Array.isArray(calculation.manual_salaries) ? calculation.manual_salaries : [],
    contribution_review: calculation.contribution_review ?? null,
    options: calculation.options ?? {},
    result: null,
    notes: calculation.notes ?? '',
    archived: calculation.archived === true
  };
}

export async function calculateScenario(calculation) {
  const traduzido = traduzir(calculation);
  // Garante que a política é JSON válido antes de entrar no motor, para que um
  // fixture corrompido falhe aqui e não vire bloqueio silencioso.
  parseRulePolicy(traduzido.options.rule_policy);
  return calculateCase(traduzido);
}
