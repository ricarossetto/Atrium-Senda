/**
 * Test Suite: Eproc Parsers Core with 100% Synthetic Sanitized Fixtures
 */

import assert from 'node:assert/strict';
import {
  parseEprocPanelProcesses,
  parseEprocDeadlines,
  parseEprocPagination,
  parseEprocCaseDetails,
  extractEprocAccessKey,
  parseEprocParties,
  parseEprocMovements,
  parseEprocDocuments
} from '../lib/judicial/eproc/index.mjs';
import { extractProcessSecrecyLevel } from '../lib/judicial/eproc/parsers/process-secrecy.mjs';

console.log('=== TESTE DOS PARSERS EPROC GENÉRICOS (FIXTURES SANITIZADAS) ===\n');

// 1. Fixture do Painel do Advogado
const mockPanelHtml = `
<table class="infraTable">
  <tr><th>Número Processo</th><th>Classe</th><th>Autor</th><th>Réu</th><th>Localização</th><th>Assunto</th><th>Último Evento</th><th>Data</th><th>Distribuição</th><th>Valor</th></tr>
  <tr>
    <td><a href="controlador.php?acao=processo_selecionar&amp;num_processo=50012345620244047100&amp;hash=abc123">5001234-56.2024.4.04.7100</a></td>
    <td>PROCEDIMENTO COMUM</td>
    <td>CLIENTE MODELO LTDA</td>
    <td>INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS</td>
    <td>1ª Vara Federal de Porto Alegre</td>
    <td>Benefício Previdenciário</td>
    <td>Conclusos para Despacho</td>
    <td>10/09/2026 14:30</td>
    <td>01/02/2024</td>
    <td>R$ 75.000,00</td>
  </tr>
  <tr>
    <td><a href="controlador.php?acao=processo_selecionar&amp;num_processo=50098765420244047200&amp;hash=def456">5009876-54.2024.4.04.7200</a></td>
    <td>MANDADO DE SEGURANÇA</td>
    <td>EMPRESA TESTE S/A</td>
    <td>UNIÃO - FAZENDA NACIONAL</td>
    <td>2ª Vara Federal de Florianópolis</td>
    <td>Tributário</td>
    <td>Juntada de Petição</td>
    <td>12/09/2026 09:15</td>
    <td>15/03/2024</td>
    <td>R$ 150.000,00</td>
  </tr>
</table>
<select id="selInfraPaginacaoSuperior">
  <option value="1" selected>1 a 2 de 2</option>
  <option value="2">3 a 4 de 4</option>
</select>
`;

const panelProcs = parseEprocPanelProcesses(mockPanelHtml);
assert.equal(panelProcs.length, 2, 'Deve extrair 2 processos da tabela do painel');
assert.equal(panelProcs[0].number, '5001234-56.2024.4.04.7100');
assert.equal(panelProcs[0].cnj, '50012345620244047100');
assert.equal(panelProcs[0].actionClass, 'PROCEDIMENTO COMUM');
assert.equal(panelProcs[0].plaintiff, 'CLIENTE MODELO LTDA');
assert.equal(panelProcs[0].defendant, 'INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS');
assert.equal(panelProcs[0].selectHref, 'controlador.php?acao=processo_selecionar&num_processo=50012345620244047100&hash=abc123');

const pagination = parseEprocPagination(mockPanelHtml);
assert.equal(pagination.totalPages, 2);
assert.equal(pagination.options[1].value, '2');

// 2. Fixture de Prazos e Intimações
const mockDeadlinesHtml = `
<table>
  <tr><th>Processo</th><th>Classe</th><th>Assunto</th><th>Evento</th><th>Expedição</th><th>Ciência</th><th>Prazo Final</th></tr>
  <tr>
    <td>5001234-56.2024.4.04.7100</td>
    <td>PROCEDIMENTO COMUM</td>
    <td>Previdenciário</td>
    <td>Intimação para Réplica</td>
    <td>01/09/2026 10:00</td>
    <td>05/09/2026</td>
    <td>25/09/2026 23:59</td>
  </tr>
</table>
`;

const deadlines = parseEprocDeadlines(mockDeadlinesHtml);
assert.equal(deadlines.length, 1);
assert.equal(deadlines[0].processNumber, '5001234-56.2024.4.04.7100');
assert.equal(deadlines[0].deadlineAt, '25/09/2026 23:59');
assert.equal(deadlines[0].sentAt, '01/09/2026 10:00');

// 3. Fixture de Detalhes do Processo (Capa, Chave, Partes)
const mockCaseHtml = `
<div id="divConteudo">
  <h2>Detalhes do Processo - 5001234-56.2024.4.04.7100</h2>
  <div>Classe: Procedimento Comum Cível</div>
  <div>Competência: Juizado Especial Federal</div>
  <div>Data de autuação: 15/01/2024 10:30:00</div>
  <div>Órgão Julgador: 3ª Vara Federal de Porto Alegre</div>
  <div>Juiz(a): Juiz Federal Titular</div>
  <div>Situação: Em tramitação</div>
  <div>Valor da Causa: R$ 45.890,50</div>
  <div>Nível de Sigilo: 0 (Público)</div>
  <span id="spnChaveProcesso" data-chave="987654321012">987654321012</span>
</div>
<table class="infraTable">
  <tr><th>Polo</th><th>Parte / Procurador</th></tr>
  <tr>
    <td>Autor</td>
    <td>JOAO DA SILVA 123.456.789-00</td>
  </tr>
  <tr>
    <td>Advogado</td>
    <td>DRA. ADVOGADA MODELO OAB/RS 12345</td>
  </tr>
  <tr>
    <td>Réu</td>
    <td>INSTITUTO NACIONAL DO SEGURO SOCIAL 00.000.000/0001-00</td>
  </tr>
</table>
`;

const caseDetails = parseEprocCaseDetails(mockCaseHtml);
assert.equal(caseDetails.number, '5001234-56.2024.4.04.7100');
assert.equal(caseDetails.cnj, '50012345620244047100');
assert.equal(caseDetails.actionClass, 'Procedimento Comum Cível');
assert.equal(caseDetails.competence, 'Juizado Especial Federal');
assert.equal(caseDetails.judicialUnit, '3ª Vara Federal de Porto Alegre');
assert.equal(caseDetails.caseValue, 'R$ 45.890,50');
assert.equal(caseDetails.accessKey, '987654321012');
assert.equal(caseDetails.secrecyLevel, 0);

// 3.1 Sigilo do PROCESSO: rótulos por documento/anexo não podem contaminar.
const caseWithDocumentLabels = parseEprocCaseDetails(`${mockCaseHtml}
<table>
  <tr><td>Sem Sigilo (Nível 0)</td></tr>
  <tr><td>Segredo de Justiça (Nível 1)</td></tr>
</table>`);
assert.equal(caseWithDocumentLabels.secrecyLevel, 0, 'Anexos sigilosos não tornam o processo sigiloso.');
assert.equal(extractProcessSecrecyLevel('<div>Nível de Sigilo: 2 (Restrito)</div>'), 2, 'Campo de nível do processo define o sigilo.');
assert.equal(extractProcessSecrecyLevel('<div>O Gaia Assistente está indisponível devido ao nível de sigilo deste processo (1),</div>'), 1);
assert.equal(extractProcessSecrecyLevel('<input id="txtNivelSigilo" value="3">'), 3);
assert.equal(extractProcessSecrecyLevel('<div>Processos com nível de sigilo superior a 1 devem ser enviados</div>'), 0, 'Texto informativo não é nível do processo.');
assert.equal(extractProcessSecrecyLevel('<div>Sem Sigilo (Nível 0)</div>'), 0, 'Rótulo de documento isolado não é sinal.');
assert.equal(extractProcessSecrecyLevel(''), 0);

const parties = parseEprocParties(mockCaseHtml);
assert.equal(parties.length, 3);
assert.equal(parties[0].pole, 'ACTIVE');
assert.equal(parties[0].documentNumber, '123.456.789-00');
assert.equal(parties[1].pole, 'ATTORNEY');
assert.equal(parties[1].oab, 'RS12345');
assert.equal(parties[2].pole, 'PASSIVE');

// 4. Teste de Extração de Chave em Vários Formatos
assert.equal(extractEprocAccessKey('<button onclick="buscarChaveProcesso(\'654321987\')">Ver Chave</button>'), '654321987');
assert.equal(extractEprocAccessKey('<input name="txtChaveProcesso" value="ABC123XYZ" />'), 'ABC123XYZ');
assert.equal(extractEprocAccessKey('<div>Chave de acesso: 778899001122</div>'), '778899001122');

// 5. Fixture de Movimentações (Eventos) e Documentos
const mockEventsHtml = `
<table id="tblEventos" class="infraTable">
  <tr><th>Evento</th><th>Data/Hora</th><th>Descrição</th><th>Usuário</th><th>Documentos</th></tr>
  <tr>
    <td>1</td>
    <td>15/01/2024 10:30:00</td>
    <td>Distribuição Automática</td>
    <td>DISTRIBUIDOR</td>
    <td><a href="controlador.php?acao=acessar_documento&amp;doc=1001&amp;tipo=pdf">Petição Inicial</a></td>
  </tr>
  <tr>
    <td>2</td>
    <td>18/01/2024 16:45:12</td>
    <td>Decisão / Despacho</td>
    <td>GABINETE DO JUIZ</td>
    <td><a href="controlador.php?acao=acessar_documento&amp;doc=1002&amp;tipo=pdf">Despacho Inicial</a></td>
  </tr>
</table>
`;

const movements = parseEprocMovements(mockEventsHtml);
assert.equal(movements.length, 2);
assert.equal(movements[0].sequence, 2, 'Deve ordenar por sequência decrescente');
assert.equal(movements[0].occurredAt, '2024-01-18T16:45:12.000Z');
assert.equal(movements[0].description, 'Decisão / Despacho');
assert.equal(movements[0].documents[0].url, 'controlador.php?acao=acessar_documento&doc=1002&tipo=pdf');

const documents = parseEprocDocuments(mockEventsHtml);
assert.equal(documents.length, 2);
assert.equal(documents[0].id, '1001');
assert.equal(documents[0].title, 'Petição Inicial');
assert.equal(documents[0].type, 'PDF');
assert.equal(documents[0].availability, 'available');

console.log('✓ Parsers eproc validados: 100% de sucesso em painel, prazos, capa, chave, partes, eventos e documentos.');
