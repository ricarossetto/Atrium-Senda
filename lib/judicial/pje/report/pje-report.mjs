import * as XLSX from 'xlsx';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function buildPjeInventorySheets(inventory) {
  const expedientesRows = (inventory.expedientes?.situations || []).map(situation => ({
    Situação: situation.label,
    Quantidade: situation.count
  }));
  const expedienteProcessRows = (inventory.expedientes?.processes || []).map(process => ({
    Processo: process.processNumber,
    Resumo: process.summary,
    'Última data': process.lastDate || ''
  }));
  const acervoRows = (inventory.acervo?.processes || []).map(process => ({
    Processo: process.processNumber,
    Resumo: process.summary,
    'Última data': process.lastDate || ''
  }));
  const expedienteDetailRows = (inventory.expedientes?.expedientes || []).map(record => ({
    Situação: record.situation || '',
    Jurisdição: record.jurisdiction || '',
    Processo: record.processNumber || '',
    'Identidade do expediente': record.identity || '',
    Resumo: record.summary || '',
    Datas: (record.dates || []).join(' | '),
    'Id da linha': record.rowId || '',
    'Cabecalho de resultados': /resultados?\s+encontrados?/i.test(String(record.summary || '')) ? 'sim' : ''
  }));
  // Diagnóstico da reconciliação: contadores por situação e o resultado de cada jurisdição
  // visitada (quantas linhas foram lidas, se o centro carregou e quantas páginas rolaram).
  const diagnosticoRows = [];
  for (const group of inventory.expedientes?.groups || []) {
    const situacao = group.labelCanonical || group.labelOriginal || '';
    diagnosticoRows.push({
      Situação: situacao,
      Jurisdição: '(total da situação)',
      Esperado: group.expected ?? '',
      Coletado: group.collected ?? '',
      Faltando: group.expected != null && group.collected != null ? Math.max(0, group.expected - group.collected) : '',
      Estado: group.state || '',
      Centro: '',
      'Vazio confirmado': '',
      'Erro de parse': '',
      Páginas: ''
    });
    for (const jurisdiction of group.jurisdictions || []) {
      diagnosticoRows.push({
        Situação: situacao,
        Jurisdição: jurisdiction.label || '',
        Esperado: jurisdiction.expected ?? '',
        Coletado: jurisdiction.collected ?? '',
        Faltando: jurisdiction.expected != null && jurisdiction.collected != null ? Math.max(0, jurisdiction.expected - jurisdiction.collected) : '',
        Estado: '',
        Centro: jurisdiction.centerKind || '',
        'Vazio confirmado': jurisdiction.emptyConfirmed === true ? 'sim' : '',
        'Erro de parse': jurisdiction.parseError === true ? 'sim' : '',
        Páginas: jurisdiction.pages ?? '',
        'Linhas varridas': jurisdiction.linhasVarridas ?? '',
        'Linhas sem CNJ': jurisdiction.linhasSemCnj ?? '',
        'Linhas agrupadas': jurisdiction.linhasAgrupadas ?? '',
        'Cabeçalhos ignorados': jurisdiction.linhasCabecalho ?? '',
        'Fora de célula': jurisdiction.linhasForaCelula ?? '',
        'Sem vínculo de id': jurisdiction.linhasSemVinculo ?? ''
      });
    }
  }
  // Árvore estrutural dos nós da listagem (sem texto/PII): identifica cabeçalho, nó de
  // ação e linha real para corrigir a leitura com evidência, nunca por heurística cega.
  const arvoreRows = [];
  for (const group of inventory.expedientes?.groups || []) {
    const situacao = group.labelCanonical || group.labelOriginal || '';
    for (const jurisdiction of group.jurisdictions || []) {
      for (const node of jurisdiction.arvore || []) {
        arvoreRows.push({
          Situação: situacao,
          Jurisdição: jurisdiction.label || '',
          'Nó': node.nodeId || '',
          Tag: node.tag || '',
          'Id do container': node.containerId || '',
          Classe: node.containerClass || '',
          'Tag do pai': node.parentTag || '',
          'Id do pai': node.parentId || '',
          Filhos: node.children ?? '',
          Links: node.links ?? '',
          Botões: node.buttons ?? '',
          'Tam. texto': node.textLength ?? '',
          CNJ: node.hasCnj === true ? 'sim' : '',
          'Nº expediente': node.expedienteNumero === true ? 'sim' : '',
          Diário: node.diario === true ? 'sim' : '',
          Resultados: node.resultados === true ? 'sim' : '',
          RESPONDER: node.responder === true ? 'sim' : ''
        });
      }
    }
  }
  return {
    Expedientes: expedientesRows,
    'Expedientes Detalhe': expedienteDetailRows,
    'Expedientes Diagnostico': diagnosticoRows,
    'Expedientes Arvore': arvoreRows.slice(0, 120),
    'Expedientes Processos': expedienteProcessRows,
    Acervo: acervoRows
  };
}

export function buildPjeInventoryWorkbook(inventory) {
  const workbook = XLSX.utils.book_new();
  const sheets = buildPjeInventorySheets(inventory);
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Aviso: 'Sem registros coletados nesta execução' }]);
    XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
  }
  return workbook;
}

export async function writePjeInventoryXls(inventory, { directory, fileName } = {}) {
  if (!directory) throw new Error('writePjeInventoryXls exige directory do workspace.');
  await mkdir(directory, { recursive: true });
  const name = fileName || `PJe_${inventory.portalId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const target = path.join(directory, name);
  const workbook = buildPjeInventoryWorkbook(inventory);
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  await writeFile(target, buffer);
  return target;
}

export async function readPjeInventoryXls(filePath) {
  const workbook = XLSX.read(await readFile(filePath), { type: 'buffer' });
  const sheets = {};
  for (const name of workbook.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name]);
  }
  return sheets;
}
