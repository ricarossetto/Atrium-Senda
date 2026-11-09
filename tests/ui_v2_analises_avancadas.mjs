/**
 * Análises avançadas na aba Previdenciário — os três motores portados na 6.43.0.
 *
 * O que este teste protege, além do desenho:
 *  - `unsupported` NÃO desenha valor nenhum;
 *  - `rmi: null` com regra elegível aparece como "não calculada", nunca R$ 0,00;
 *  - os avisos do envelope são sempre exibidos (carregam os limites do modelo);
 *  - os campos carregam o valor que veio do estado, sem recomputar no navegador.
 */
import assert from 'node:assert/strict';

import { renderCalculationsV2Workspace } from '../js/views/ui-v2/calculations-presenter.js';

let ok = 0;
const falhas = [];
const check = (cond, msg) => { if (cond) ok += 1; else falhas.push(msg); };
const igual = (a, b, msg) => check(a === b, `${msg} (recebido ${JSON.stringify(a)}, esperado ${JSON.stringify(b)})`);

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const formatCurrency = value => {
  const numero = Number(String(value ?? '0').replace(',', '.'));
  return Number.isFinite(numero)
    ? numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : String(value ?? '');
};

function renderizar(avancadas) {
  /* A aba abre no hub; as análises avançadas são o fluxo `avancadas`. Renderizar o
   * fluxo é o que o usuário vê ao clicar em "Abrir análises". */
  return renderCalculationsV2Workspace({
    aba: 'previdenciario',
    prevSub: 'avancadas',
    catalog: { series: [], tabelas: { resumo: { total: 0 } } },
    form: {},
    previdenciario: {},
    complementar: {},
    avancadas,
    lc142: { aberto: false },
    escapeHtml,
    formatCurrency
  });
}

/* ---------- 1. Os três cards existem na aba Previdenciário ---------- */
{
  const html = renderizar({});
  check(html.includes('data-av-card="projecao"'), 'card de projeção ausente');
  check(html.includes('data-av-card="pensao"'), 'card de pensão ausente');
  check(html.includes('data-av-card="qualidade"'), 'card de qualidade ausente');
  check(html.includes('data-calc-action="projetar-aposentadoria"'), 'ação de projetar ausente');
  check(html.includes('data-calc-action="acumular-pensoes"'), 'ação de acumular ausente');
  check(html.includes('data-calc-action="avaliar-qualidade"'), 'ação de avaliar ausente');
  check(html.includes('Análises avançadas'), 'título da seção ausente');
  // Campos com namespace por card, para não colidir com os do cálculo principal.
  check(html.includes('data-av-field="projecao.dataNascimento"'), 'campo de nascimento ausente');
  check(html.includes('data-av-field="pensao.rendas"'), 'campo de rendas ausente');
  check(html.includes('data-av-field="qualidade.insuredCategory"'), 'campo de categoria ausente');
}

/* ---------- 2. Nenhum resultado ainda: sem valor inventado ---------- */
{
  const html = renderizar({});
  check(!/RMI projetada/.test(html) || !/R\$\s*0,00/.test(html), 'não pode exibir R$ 0,00 sem cálculo');
  check(!html.includes('data-av-status='), 'sem resultado não deve declarar status');
}

/* ---------- 3. Projeção experimental desenha DER, tempo e RMI ---------- */
{
  const html = renderizar({
    projecao: {
      resultado: {
        status: 'experimental',
        legal_validation_performed: false,
        actual_entitlement_verified: false,
        warnings: ['A projeção é estimativa e não constitui certidão de tempo de contribuição.'],
        data: {
          native_result: {
            der: '2031-06-09', mesesSimulados: 56, idadeDerAnos: 65, tempoDerAnos: 34,
            salarioBeneficio: '3000.00', rmi: '2640.00', regraNome: 'Regra permanente por idade (65 anos)',
            criterioRmi: 'coeficiente-progressivo', regrasElegiveis: [], avisos: []
          }
        }
      }
    }
  });
  check(html.includes('2031-06-09'), 'DER não exibida');
  check(html.includes('data-av-status="experimental"'), 'status não declarado');
  check(html.includes('RMI projetada'), 'tile de RMI ausente');
  check(html.includes('2.640,00'), 'RMI não formatada');
  check(html.includes('não constitui certidão'), 'aviso do envelope não exibido');
  check(html.includes('Regra permanente'), 'regra vencedora não exibida');
}

/* ---------- 4. RMI não calculável é declarada, não zerada ---------- */
{
  const html = renderizar({
    projecao: {
      resultado: {
        status: 'experimental',
        warnings: ['Sem expectativa de sobrevida do IBGE, a regra de pedágio de 50% não tem RMI calculada.'],
        data: {
          native_result: {
            der: '2022-12-31', mesesSimulados: 36, idadeDerAnos: 57, tempoDerAnos: 36,
            salarioBeneficio: '2500.00', rmi: null, motivoSemRmi: 'sem_rmi_calculavel',
            regrasElegiveisSemRmi: ['pedagio-50'], regrasElegiveis: [], avisos: []
          }
        }
      }
    }
  });
  check(html.includes('data-av-rmi-nao-calculada'), 'RMI nula não foi marcada como não calculada');
  check(html.includes('não calculada'), 'rótulo de RMI não calculada ausente');
  check(!/R\$\s*0,00/.test(html), 'RMI nula não pode virar R$ 0,00');
}

/* ---------- 5. Projeção sem regra elegível: sem valor, com motivo ---------- */
{
  const html = renderizar({
    projecao: {
      resultado: {
        status: 'unsupported',
        data: null,
        missing: ['regra_elegivel_no_limite_de_simulacao'],
        warnings: ['Nenhuma regra elegível em 480 meses de simulação (40 anos).']
      }
    }
  });
  check(html.includes('data-av-projecao-sem-regra'), 'estado sem regra não declarado');
  check(html.includes('480 meses'), 'aviso do limite não exibido');
  check(html.includes('data-av-status="unsupported"'), 'status unsupported não declarado');
  check(!html.includes('RMI projetada'), 'sem regra não pode haver tile de RMI');
}

/* ---------- 6. Pensão: rendas e totais ---------- */
{
  const html = renderizar({
    pensao: {
      resultado: {
        status: 'experimental',
        warnings: ['A base é entrada explícita do operador, não validada oficialmente.'],
        data: {
          native_result: {
            integralIncome: '3000.00', reducedTotal: '1800.00', combinedTotal: '4800.00',
            rounding: 'half-up',
            incomes: [
              { originalIndex: 0, originalAmount: '3000.00', integral: true, receivedAmount: '3000.00', receivedPercentage: '100.00', tranches: [] },
              { originalIndex: 1, originalAmount: '2500.00', integral: false, receivedAmount: '1800.00', receivedPercentage: '72.00', tranches: [] }
            ]
          }
        }
      }
    }
  });
  check(html.includes('4.800,00'), 'total combinado não exibido');
  check(html.includes('integral'), 'renda integral não rotulada');
  check(html.includes('72.00'), 'percentual recebido não exibido');
  check(html.includes('não validada oficialmente'), 'aviso da base não exibido');
}

/* ---------- 7. Qualidade: os dois modelos são distinguidos ---------- */
{
  const html = renderizar({
    qualidade: {
      resultado: {
        status: 'experimental',
        modelo_aplicado: 'geral_e_facultativa',
        warnings: ['Período de graça é contagem declarada.'],
        data: {
          native_result: {
            facultativa: {
              graceMonths: 6, lastGraceMonth: '2026-09', latestPaymentDate: '2026-11-15',
              qualityLossDate: '2026-11-16', explanation: ['Prazo experimental: dia 15 do segundo mês após o último mês de graça.']
            },
            geral: { mesesPeriodo: 12, prorrogacao: false, fimPeriodo: '2027-03-31', mantemQualidade: true, avisos: [] }
          }
        }
      }
    }
  });
  check(html.includes('Variante facultativa'), 'bloco facultativo ausente');
  check(html.includes('Regra geral (art. 15'), 'bloco da regra geral ausente');
  check(html.includes('2026-11-16'), 'data de perda não exibida');
  check(html.includes('data-av-modelo-aplicado="geral_e_facultativa"'), 'código do modelo não declarado no atributo');
  check(html.includes('Modelo aplicado: regra geral e variante facultativa'), 'modelo aplicado não traduzido para a tela');
  check(html.includes('dia 15 do segundo mês'), 'explicação da variante não exibida');
}

/* ---------- 8. Qualidade sem modelo: sem valor, com motivo ---------- */
{
  const html = renderizar({
    qualidade: { resultado: { status: 'unsupported', data: null, missing: ['qualidade_modelo_aplicavel'], warnings: [] } }
  });
  check(html.includes('data-av-qualidade-sem-modelo'), 'estado sem modelo não declarado');
  check(!html.includes('Variante facultativa'), 'sem modelo não pode desenhar a variante');
}

/* ---------- 9. Estado dos campos vem do estado, não do DOM ---------- */
{
  const html = renderizar({
    projecao: { sexo: 'masculino', dataNascimento: '1966-05-10', primeiraCompetencia: '1996-06', salarioContribuicao: '3000.00' },
    qualidade: { insuredCategory: 'employee', parouDeContribuir: true },
    pensao: { rounding: 'half-even', referenceBase: '1000.00' }
  });
  check(/data-av-field="projecao\.sexo"[^>]*>[\s\S]{0,400}value="masculino" selected/.test(html) || html.includes('value="masculino" selected'), 'sexo não refletido');
  check(html.includes('value="1966-05-10"'), 'nascimento não refletido');
  check(html.includes('value="1996-06"'), 'primeira competência não refletida');
  check(html.includes('value="3000.00"'), 'salário não refletido');
  check(/value="employee" selected/.test(html), 'categoria não refletida');
  check(/value="half-even" selected/.test(html), 'arredondamento não refletido');
  check(/data-av-field="qualidade\.parouDeContribuir"[^>]*checked/.test(html), 'checkbox não refletido');
}

/* ---------- 10. Erros de validação aparecem como alerta ---------- */
{
  const html = renderizar({ projecao: { error: 'Informe a data de nascimento para a projeção.' } });
  check(html.includes('role="alert"'), 'erro sem role=alert');
  check(html.includes('Informe a data de nascimento'), 'mensagem de erro não exibida');
}

/* ---------- 11. Escaping: nenhum campo entra cru ---------- */
{
  const html = renderizar({
    pensao: { rendas: '<script>alert(1)</script>', referenceBase: '"><img src=x onerror=1>' },
    projecao: { primeiraCompetencia: '"><b>x</b>' }
  });
  check(!html.includes('<script>alert(1)</script>'), 'rendas sem escape');
  check(!html.includes('<img src=x onerror=1>'), 'base sem escape');
  check(!html.includes('<b>x</b>'), 'competência sem escape');
}

/* ---------- 12. Só aparece na aba Previdenciário ---------- */
{
  const htmlCivel = renderCalculationsV2Workspace({
    aba: 'civel', catalog: { series: [], tabelas: { resumo: { total: 0 } } }, form: {}, previdenciario: {},
    complementar: {}, avancadas: {}, lc142: { aberto: false }, escapeHtml, formatCurrency
  });
  check(!htmlCivel.includes('data-av-card="projecao"'), 'análises avançadas não pertencem à aba Cível');
  const htmlTrab = renderCalculationsV2Workspace({
    aba: 'trabalhista', catalog: { series: [], tabelas: { resumo: { total: 0 } } }, form: {}, previdenciario: {},
    complementar: {}, avancadas: {}, lc142: { aberto: false }, escapeHtml, formatCurrency
  });
  check(!htmlTrab.includes('data-av-card="projecao"'), 'análises avançadas não pertencem à aba Trabalhista');
}

console.log(`\n${ok} verificações OK${falhas.length ? `, ${falhas.length} FALHAS` : ', 0 falhas'}`);
for (const f of falhas) console.log(`  - ${f}`);
if (falhas.length) process.exitCode = 1;
