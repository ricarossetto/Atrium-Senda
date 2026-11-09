// Testes executáveis do renderer de PDF das sete famílias LC 142.
//
// Prova, por bytes e por extração de texto do próprio stream:
// - assinatura %PDF-, %%EOF, xref válida, MediaBox A4;
// - paginação com "Página N de M" calculado em duas passagens;
// - acentuação WinAnsi (Hipótese, competências, benefício, média, vínculos,
//   carência, parcelas descartadas, simulação) no TEXTO EXTRAÍDO;
// - valores monetários do cenário presentes como string formatada;
// - famílias distintas por conteúdo, não só por hash;
// - identificação desligada por padrão e ligada só quando habilitada;
// - arquivos sintéticos em artifacts/lc142-pdf/ para inspeção humana.
//
// Prova externa opcional: quando pdftotext/pdfinfo (Poppler) estão
// disponíveis, a extração do texto do PDF real é comparada com o stream
// descomprimido.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  renderLc142Report,
  LC142_REPORT_FAMILIES,
  LC142_MANDATORY_WARNING,
  formatBrDecimal
} from '../lib/calc/pdf/lc142-report.mjs';
import { measureText } from '../lib/calc/pdf/pdf-theme.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'lc142-pdf');
const ORACLE_PATH = path.join(ROOT, 'tests', 'fixtures', 'lc142-rust-oracle.json');
const SCENARIOS = ['base-moderada', 'future-salary-declared', 'salary-gap-declared-minimum', 'overlap-union', 'partial-month-days'];
const FIXED_GENERATED_AT = '2026-10-18T00:00:00Z';

fs.mkdirSync(OUTPUT, { recursive: true });

// ---------------------------------------------------------------------------
// Helpers de leitura do PDF
// ---------------------------------------------------------------------------

function findPopplerBinary(name) {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;
  const packages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  if (!fs.existsSync(packages)) return null;
  for (const entry of fs.readdirSync(packages)) {
    if (!entry.startsWith('oschwartz10612.Poppler')) continue;
    const base = path.join(packages, entry);
    for (const sub of fs.readdirSync(base)) {
      const candidate = path.join(base, sub, 'Library', 'bin', name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function commandAvailable(name) {
  try {
    execFileSync(name, ['-v'], { stdio: 'ignore' });
    return name;
  } catch {
    return null;
  }
}

const PDFTOTEXT = findPopplerBinary('pdftotext.exe') || commandAvailable('pdftotext');
const PDFINFO = findPopplerBinary('pdfinfo.exe') || commandAvailable('pdfinfo');
const POPPLER_AVAILABLE = Boolean(PDFTOTEXT && PDFINFO);

/** Extrai o texto do stream de conteúdo descomprimido (fonte da verdade). */
function extractStreamText(bytes) {
  const latin = bytes.toString('latin1');
  const pieces = [];
  const pattern = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  let match = pattern.exec(latin);
  while (match) {
    pieces.push(decodePdfLiteral(match[1]));
    match = pattern.exec(latin);
  }
  return pieces.join('\n');
}

function decodePdfLiteral(raw) {
  const bytesOut = [];
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === '\\') {
      const next = raw[index + 1];
      if (next === 'n') { bytesOut.push(0x0a); index += 1; continue; }
      if (next === 'r') { bytesOut.push(0x0d); index += 1; continue; }
      if (next === 't') { bytesOut.push(0x09); index += 1; continue; }
      if (next === '(' || next === ')' || next === '\\') { bytesOut.push(next.charCodeAt(0)); index += 1; continue; }
      if (/[0-7]/.test(next || '')) {
        let octal = '';
        let cursor = index + 1;
        while (octal.length < 3 && /[0-7]/.test(raw[cursor] || '')) {
          octal += raw[cursor];
          cursor += 1;
        }
        bytesOut.push(Number.parseInt(octal, 8));
        index = cursor - 1;
        continue;
      }
      index += 1;
      continue;
    }
    bytesOut.push(character.charCodeAt(0));
  }
  return Buffer.from(bytesOut).toString('latin1');
}

/** Decodifica WinAnsi (latin1) preservando acentos para comparação em UTF-8. */
function winAnsiToUnicode(text) {
  const bytes = Buffer.from(text, 'latin1');
  return new TextDecoder('windows-1252').decode(bytes);
}

function parsePdfStructure(bytes) {
  const latin = bytes.toString('latin1');
  const header = latin.slice(0, 8);
  const tail = latin.slice(-64);
  const startxrefMatch = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(latin);
  const pageObjects = latin.match(/\/Type\s*\/Page(?![s])/g) || [];
  const mediaBoxes = [...latin.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/g)]
    .map(match => [Number(match[1]), Number(match[2])]);
  const fonts = [...new Set([...latin.matchAll(/\/BaseFont\s*\/([A-Za-z-]+)/g)].map(match => match[1]))];
  const winAnsi = /\/Encoding\s*\/WinAnsiEncoding/.test(latin);
  const pagesCountMatch = /\/Type\s*\/Pages\s*\/Count\s+(\d+)/.exec(latin);
  return {
    header,
    hasEof: tail.includes('%%EOF'),
    startxref: startxrefMatch ? Number(startxrefMatch[1]) : null,
    latin,
    pageObjects: pageObjects.length,
    mediaBoxes,
    fonts,
    winAnsi,
    declaredPages: pagesCountMatch ? Number(pagesCountMatch[1]) : null
  };
}

function readXref(bytes) {
  const latin = bytes.toString('latin1');
  const startxrefMatch = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(latin);
  assert.ok(startxrefMatch, 'startxref/%%EOF ausentes no rodapé do PDF.');
  const offset = Number(startxrefMatch[1]);
  assert.equal(latin.slice(offset, offset + 4), 'xref', 'startxref não aponta para a xref table.');
  const table = latin.slice(offset);
  const header = /^xref\s+0\s+(\d+)\s*\n/.exec(table);
  assert.ok(header, 'cabeçalho da xref table inválido.');
  const size = Number(header[1]);
  const lines = table.split('\n').slice(2, size + 2);
  const entries = [];
  for (let id = 0; id < size; id += 1) {
    const line = lines[id];
    assert.match(line, /^\d{10} \d{5} [nf] $/, `entrada de xref inválida para o objeto ${id}.`);
    entries.push({ id, offset: Number(line.slice(0, 10)), type: line.slice(17, 18) });
  }
  // toda entrada "n" precisa apontar para "<id> 0 obj"
  for (const entry of entries.slice(1)) {
    if (entry.type !== 'n') continue;
    const at = latin.slice(entry.offset, entry.offset + 24);
    assert.ok(at.startsWith(`${entry.id} 0 obj`), `xref do objeto ${entry.id} aponta para o local errado (${JSON.stringify(at.slice(0, 16))}).`);
  }
  const trailer = /trailer\s*<<([\s\S]*?)>>\s*startxref/.exec(table);
  assert.ok(trailer, 'trailer ausente.');
  assert.match(trailer[1], new RegExp(`/Size\\s+${size}`), 'trailer /Size divergente da xref.');
  assert.match(trailer[1], /\/Root\s+\d+\s+0\s+R/, 'trailer sem /Root.');
  return { size, entries };
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pageTextsByFormFeed(text) {
  return text.split('\f');
}

// ---------------------------------------------------------------------------
// Carregamento dos cenários
// ---------------------------------------------------------------------------

const oracle = JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8'));
const fixtures = new Map();
for (const id of SCENARIOS) {
  const scenario = oracle.cases.find(item => item.id === id);
  assert.ok(scenario, `cenário ausente no oráculo: ${id}`);
  const envelope = scenario.expected.value;
  assert.equal(envelope.status, 'experimental', `cenário ${id} precisa ser experimental para gerar relatório.`);
  assert.ok(envelope.data?.native_result, `cenário ${id} sem native_result.`);
  fixtures.set(id, envelope);
}

function metadataFor(id, envelope) {
  const native = envelope.data.native_result;
  return {
    cenarioId: id,
    snapshotSha256: native.pcd?.snapshot_sha256 ?? null,
    sourceUrl: native.correcao?.parcelas?.find(parcela => parcela.fonte)?.fonte ?? null,
    through: native.parametros?.referencia_correcao ?? null,
    retrievedAt: '2026-10-15T10:00:00Z'
  };
}

// ---------------------------------------------------------------------------
// 1-2. Geração das 35 combinações + asserções estruturais
// ---------------------------------------------------------------------------

const generated = [];
for (const id of SCENARIOS) {
  const envelope = fixtures.get(id);
  const metadados = metadataFor(id, envelope);
  for (const familia of LC142_REPORT_FAMILIES) {
    const report = renderLc142Report({
      familia,
      resultado: envelope,
      metadados,
      identificacao: null,
      geradoEm: FIXED_GENERATED_AT
    });
    assert.ok(Buffer.isBuffer(report.bytes), `${id}/${familia}: bytes precisa ser Buffer.`);
    assert.equal(report.contentType, 'application/pdf');
    assert.match(report.filename, new RegExp(`^lc142-${familia}-\\d{8}-\\d{6}\\.pdf$`));
    assert.doesNotMatch(report.filename, /[^\x20-\x7e]/, 'filename com caractere fora de ASCII.');
    assert.ok(!report.filename.includes('/') && !report.filename.includes('\\'), 'filename não pode conter path.');

    const structure = parsePdfStructure(report.bytes);
    assert.equal(structure.header, '%PDF-1.7', `${id}/${familia}: assinatura %PDF ausente.`);
    assert.ok(structure.hasEof, `${id}/${familia}: %%EOF ausente.`);
    assert.ok(structure.pageObjects >= 1, `${id}/${familia}: sem objeto /Type /Page.`);
    assert.equal(structure.mediaBoxes.length, structure.pageObjects, `${id}/${familia}: MediaBox por página divergente.`);
    for (const [width, height] of structure.mediaBoxes) {
      assert.equal(width, 595.28, `${id}/${familia}: largura A4 incorreta (${width}).`);
      assert.equal(height, 841.89, `${id}/${familia}: altura A4 incorreta (${height}).`);
    }
    assert.equal(structure.declaredPages, structure.pageObjects, `${id}/${familia}: /Count diverge dos objetos de página.`);
    assert.ok(structure.winAnsi, `${id}/${familia}: /WinAnsiEncoding ausente.`);
    assert.ok(structure.fonts.includes('Helvetica') && structure.fonts.includes('Times-Roman'), `${id}/${familia}: fontes padrão ausentes.`);
    const xref = readXref(report.bytes);
    // objetos: catálogo + páginas + 6 fontes + (conteúdo+página) por página + info
    assert.equal(xref.size, (structure.pageObjects * 2) + 10, `${id}/${familia}: tamanho da xref inesperado.`);

    const streamText = winAnsiToUnicode(extractStreamText(report.bytes));
    assert.match(streamText, /SIMULAÇÃO/, `${id}/${familia}: texto do stream sem "SIMULAÇÃO".`);
    assert.match(streamText, /Página \d+ de \d+/, `${id}/${familia}: rodapé sem "Página N de M".`);
    assert.match(streamText, /actual_entitlement_verified/, `${id}/${familia}: texto sem actual_entitlement_verified.`);

    // valores monetários do cenário precisam estar no documento formatado
    const resumo = envelope.data.native_result.resumo;
    const marcos = [
      ['rmi', resumo.rmi],
      ['salario_beneficio', resumo.salario_beneficio],
      ['soma_salarios', resumo.soma_salarios]
    ];
    // Toda família carrega ao menos a RMI declarada; as famílias de conteúdo
    // financeiro carregam também média/salário de benefício e soma considerada.
    const carriesCash = ['detailed', 'summary', 'salaries', 'memory', 'indicators'];
    for (const [campo, valor] of marcos) {
      if (valor == null) continue;
      if (campo !== 'rmi' && !carriesCash.includes(familia)) continue;
      const formatted = formatBrDecimal(valor, { fixedDecimals: 2 });
      assert.ok(
        streamText.includes(formatted),
        `${id}/${familia}: valor de ${campo} (${formatted}) ausente no texto do PDF.`
      );
    }
    // Todas as parcelas do cenário aparecem nas famílias que as listam:
    // detailed/salaries listam o salário considerado; indicators lista o índice.
    if (['detailed', 'salaries'].includes(familia)) {
      for (const parcela of envelope.data.native_result.correcao.parcelas) {
        const formatted = formatBrDecimal(parcela.considerado, { fixedDecimals: 2 });
        assert.ok(streamText.includes(formatted),
          `${id}/${familia}: parcela ${parcela.competencia} (${formatted}) ausente no PDF.`);
      }
    }
    if (familia === 'indicators') {
      assert.ok(streamText.includes('Índices usados e limites'), `${id}/${familia}: bloco de snapshot ausente.`);
      for (const parcela of envelope.data.native_result.correcao.parcelas) {
        const formatted = formatBrDecimal(parcela.indice, { fixedDecimals: 6 });
        assert.ok(streamText.includes(formatted),
          `${id}/${familia}: índice ${parcela.competencia} (${formatted}) ausente no PDF.`);
      }
      const snapshotHash = envelope.data.native_result.pcd.snapshot_sha256;
      assert.ok(streamText.includes(snapshotHash), `${id}/${familia}: snapshot_sha256 ausente.`);
      assert.ok(streamText.includes(envelope.data.native_result.correcao.parcelas[0].fonte),
        `${id}/${familia}: source_url do snapshot ausente.`);
    }

    generated.push({ id, familia, ...report, streamText, structure, hash: hashBytes(report.bytes) });
  }
}

assert.equal(generated.length, SCENARIOS.length * LC142_REPORT_FAMILIES.length, 'total de PDFs gerado incorreto.');
assert.equal(generated.length, 35, 'devem ser 35 PDFs (5 cenários x 7 famílias).');

// ---------------------------------------------------------------------------
// 3. summary mais curto que detailed; detailed com 2+ páginas em PBC >= 5
// ---------------------------------------------------------------------------

for (const id of SCENARIOS) {
  const summary = generated.find(item => item.id === id && item.familia === 'summary');
  const detailed = generated.find(item => item.id === id && item.familia === 'detailed');
  assert.ok(summary.bytes.length < detailed.bytes.length,
    `${id}: summary (${summary.bytes.length}) precisa ser menor que detailed (${detailed.bytes.length}).`);
  assert.ok(summary.streamText.length < detailed.streamText.length,
    `${id}: summary precisa ter menos conteúdo textual que detailed.`);
  const parcelas = fixtures.get(id).data.native_result.correcao.parcelas.length;
  if (parcelas >= 5) {
    assert.ok(detailed.structure.pageObjects >= 2,
      `${id}: detailed com ${parcelas} parcelas precisa de pelo menos 2 páginas.`);
  }
}

// ---------------------------------------------------------------------------
// 4. Famílias distintas por CONTEÚDO (não apenas por hash)
// ---------------------------------------------------------------------------

const REQUIRED_MARKERS = {
  summary: ['Síntese do cenário', 'Tempo de contribuição', 'Avisos do cálculo'],
  detailed: ['1. Síntese do cenário', '3. Parcelas do PBC', '4. Memória das decisões', '6. Indicadores e proveniência'],
  periods: ['Vínculos considerados', 'Como a união de períodos foi tratada'],
  salaries: ['Período base de cálculo (PBC)', 'Parcelas do PBC', 'Legenda de origem das parcelas'],
  memory: ['Decisões registradas pelo motor', 'Seleção das parcelas', 'Valores oficiais do motor'],
  transitions: ['Limitações deste perfil', 'Códigos de bloqueio do perfil', 'O que este relatório não afirma'],
  indicators: ['Índices usados e limites', 'Identificadores de auditoria', 'Hash do cenário (sha256)']
};

const contentSignatures = new Map();
for (const item of generated) {
  const markers = REQUIRED_MARKERS[item.familia];
  for (const marker of markers) {
    assert.ok(item.streamText.includes(marker), `${item.id}/${item.familia}: marcador exclusivo ausente (${marker}).`);
  }
  const signature = markers.filter(marker => item.streamText.includes(marker)).sort().join('|');
  contentSignatures.set(item.familia, signature);
}
assert.equal(new Set(contentSignatures.values()).size, LC142_REPORT_FAMILIES.length,
  'cada família precisa ter assinatura de conteúdo própria.');

// families must not be truncations of detailed
for (const id of SCENARIOS) {
  const detailed = generated.find(item => item.id === id && item.familia === 'detailed');
  for (const familia of LC142_REPORT_FAMILIES) {
    if (familia === 'detailed') continue;
    const other = generated.find(item => item.id === id && item.familia === familia);
    assert.notEqual(hashBytes(other.bytes), hashBytes(detailed.bytes), `${id}/${familia}: hash igual ao detailed.`);
    assert.ok(other.streamText !== detailed.streamText, `${id}/${familia}: texto idêntico ao detailed.`);
  }
}

// distinct hashes within each scenario
for (const id of SCENARIOS) {
  const hashes = generated.filter(item => item.id === id).map(item => item.hash);
  assert.equal(new Set(hashes).size, hashes.length, `${id}: famílias precisam ter bytes distintos.`);
}

// ---------------------------------------------------------------------------
// 5. Identificação desligada por padrão / ligada quando habilitada
// ---------------------------------------------------------------------------

const NOME_SINTETICO = 'Segurada Teste da Silva';
const CPF_SINTETICO = '000.000.000-00';
const envelopeBase = fixtures.get('base-moderada');
const metadadosBase = metadataFor('base-moderada', envelopeBase);
const identificacaoSintetica = {
  habilitada: true,
  nome: NOME_SINTETICO,
  cpf: CPF_SINTETICO,
  nit: '000.00000.00-0',
  dataNascimento: '1960-01-01'
};

for (const familia of LC142_REPORT_FAMILIES) {
  const semIdentificacao = renderLc142Report({
    familia,
    resultado: envelopeBase,
    metadados: metadadosBase,
    geradoEm: FIXED_GENERATED_AT
  });
  const textoOmitido = winAnsiToUnicode(extractStreamText(semIdentificacao.bytes));
  assert.ok(!textoOmitido.includes(NOME_SINTETICO), `${familia}: nome vazou com identificação desligada.`);
  assert.ok(!textoOmitido.includes(CPF_SINTETICO), `${familia}: CPF vazou com identificação desligada.`);
  assert.ok(textoOmitido.includes('Identificação do segurado omitida por opção do operador'),
    `${familia}: documento precisa declarar a omissão de identificação.`);

  const comIdentificacao = renderLc142Report({
    familia,
    resultado: envelopeBase,
    metadados: metadadosBase,
    identificacao: identificacaoSintetica,
    geradoEm: FIXED_GENERATED_AT
  });
  const textoCom = winAnsiToUnicode(extractStreamText(comIdentificacao.bytes));
  assert.ok(textoCom.includes(NOME_SINTETICO), `${familia}: nome ausente com identificação habilitada.`);
  assert.ok(textoCom.includes(CPF_SINTETICO), `${familia}: CPF ausente com identificação habilitada.`);
  assert.ok(!textoCom.includes('Identificação do segurado omitida por opção do operador'),
    `${familia}: não deve declarar omissão quando a identificação está habilitada.`);
  assert.notEqual(hashBytes(semIdentificacao.bytes), hashBytes(comIdentificacao.bytes),
    `${familia}: habilitar identificação precisa alterar o documento.`);
}

// ---------------------------------------------------------------------------
// 6. Contratos de erro determinísticos
// ---------------------------------------------------------------------------

assert.throws(
  () => renderLc142Report({ familia: 'inexistente', resultado: envelopeBase }),
  /Família de relatório LC 142 inválida: inexistente\. Famílias válidas: detailed, summary, periods, salaries, memory, transitions, indicators\./
);

const bloqueado = oracle.cases.find(item => item.expected.value.status === 'blocked')?.expected.value;
assert.ok(bloqueado, 'o oráculo precisa ter ao menos um caso bloqueado.');
assert.throws(
  () => renderLc142Report({ familia: 'summary', resultado: bloqueado }),
  /PDF de bloqueio não é relatório de cálculo/
);
assert.throws(
  () => renderLc142Report({ familia: 'summary', resultado: { status: 'unknown' } }),
  /não está no estado experimental/
);
assert.throws(
  () => renderLc142Report({ familia: 'summary', resultado: null }),
  /exige o envelope experimental/
);
assert.throws(
  () => renderLc142Report({ familia: 'summary', resultado: envelopeBase, geradoEm: 'não é data' }),
  /Data de geração inválida/
);

// ---------------------------------------------------------------------------
// 7. Avisos obrigatórios em todas as famílias (texto e cor de destaque)
// ---------------------------------------------------------------------------

for (const item of generated) {
  assert.ok(item.streamText.includes(LC142_MANDATORY_WARNING),
    `${item.id}/${item.familia}: aviso obrigatório ausente.`);
  assert.ok(item.structure.latin.includes('0.478 0.106 0.106 rg'),
    `${item.id}/${item.familia}: aviso obrigatório sem cor de destaque (danger).`);
}

// ---------------------------------------------------------------------------
// 7. Geometria determinística: nenhuma linha fora da área de texto, nenhuma
//    sobreposição de linhas de base dentro da mesma página.
// ---------------------------------------------------------------------------

function parseTextRuns(bytes) {
  const latin = bytes.toString('latin1');
  const pages = [];
  const pageChunks = latin.split('endstream');
  for (const chunk of pageChunks) {
    if (!chunk.includes(' Tj')) continue;
    const runs = [];
    const pattern = /BT\n\/(F\d) ([\d.]+) Tf\n1 0 0 1 ([\d.]+) ([\d.]+) Tm\n\(((?:\\.|[^\\()])*)\) Tj\nET/g;
    let match = pattern.exec(chunk);
    while (match) {
      runs.push({
        font: match[1],
        size: Number(match[2]),
        x: Number(match[3]),
        y: Number(match[4]),
        text: winAnsiToUnicode(decodePdfLiteral(match[5]))
      });
      match = pattern.exec(chunk);
    }
    if (runs.length) pages.push(runs);
  }
  return pages;
}

for (const item of generated) {
  const pages = parseTextRuns(item.bytes);
  assert.equal(pages.length, item.structure.pageObjects,
    `${item.id}/${item.familia}: blocos de texto por página divergem da contagem de páginas.`);
  let totalRuns = 0;
  for (const runs of pages) {
    totalRuns += runs.length;
    for (const run of runs) {
      assert.ok(run.x >= 47.9 && run.x <= 547.5,
        `${item.id}/${item.familia}: texto fora da margem horizontal (x=${run.x}, "${run.text.slice(0, 24)}").`);
      // Área vertical: o cabeçalho corrido ocupa a faixa de margem superior
      // (acima de contentTop) e o rodapé a faixa inferior; nada pode sair da página.
      assert.ok(run.y >= 60 && run.y <= 812,
        `${item.id}/${item.familia}: texto fora da área vertical (y=${run.y}, "${run.text.slice(0, 24)}").`);
      assert.ok(run.size >= 6 && run.size <= 17,
        `${item.id}/${item.familia}: tamanho de fonte fora da escala (${run.size}pt).`);
    }
    // linhas de base coincidentes não podem ter caixas de texto sobrepostas:
    // detecta colisão real usando as métricas AFM da fonte declarada.
    const byPage = runs.filter(run => run.y > 100 && run.y < 780);
    const fontKeyFor = (resource) => (resource === 'F1' || resource === 'F2' || resource === 'F3' ? 'ui' : 'body');
    for (let i = 0; i < byPage.length; i += 1) {
      for (let j = i + 1; j < byPage.length; j += 1) {
        const a = byPage[i];
        const b = byPage[j];
        if (Math.abs(a.y - b.y) >= 1) continue;
        const aEnd = a.x + measureText(a.text, fontKeyFor(a.font), a.size);
        const bEnd = b.x + measureText(b.text, fontKeyFor(b.font), b.size);
        const overlap = Math.min(aEnd, bEnd) - Math.max(a.x, b.x);
        assert.ok(overlap <= 1.5,
          `${item.id}/${item.familia}: colisão de texto em y=${a.y} ("${a.text.slice(0, 18)}" / "${b.text.slice(0, 18)}").`);
      }
    }
    // ordem de leitura: as linhas de corpo descem (y decrescente por bloco)
    const headingYs = runs.filter(run => [11.4, 12.4].includes(run.size)).map(run => run.y);
    assert.ok(headingYs.length >= 1, `${item.id}/${item.familia}: página sem título de seção.`);
  }
  assert.ok(totalRuns >= 20, `${item.id}/${item.familia}: conteúdo textual insuficiente (${totalRuns} linhas).`);
}

// ---------------------------------------------------------------------------
// 8. Metadados /Info: sem mojibake — regressão de defeito real (travessão
//    saindo como "Š" porque a string literal do /Info não é WinAnsi).
// ---------------------------------------------------------------------------

function readInfoDictionary(bytes) {
  const latin = bytes.toString('latin1');
  const match = /\/Producer\s*(<[0-9A-Fa-f]+>|\((?:\\.|[^\\()])*\))/.exec(latin);
  assert.ok(match, 'dicionário /Info ausente.');
  const infoBlock = latin.slice(Math.max(0, match.index - 800), match.index + match[0].length + 200);
  const decodeInfoString = (raw) => {
    if (raw.startsWith('<')) {
      const hex = raw.slice(1, -1);
      assert.equal(hex.slice(0, 4).toUpperCase(), 'FEFF', '/Info precisa de string UTF-16BE com BOM.');
      const utf16be = Buffer.from(hex.slice(4), 'hex');
      const utf16le = Buffer.alloc(utf16be.length);
      for (let index = 0; index < utf16be.length; index += 2) {
        utf16le[index] = utf16be[index + 1];
        utf16le[index + 1] = utf16be[index];
      }
      return utf16le.toString('utf16le');
    }
    // String literal ( ... ) no /Info é PDFDocEncoding e corrompe acentos:
    // o writer nunca deve emitir isso.
    throw new Error('/Info precisa de string UTF-16BE com BOM; string literal é proibida.');
  };
  const entries = {};
  for (const key of ['Title', 'Subject', 'Author', 'Creator', 'Producer']) {
    const entry = new RegExp(`/${key}\\s*(<[0-9A-Fa-f]+>|\\((?:\\\\.|[^\\\\()])*\\))`).exec(infoBlock);
    if (entry) entries[key] = decodeInfoString(entry[1]);
  }
  return entries;
}

const MOJIBAKE = /[\u0160\u00C5\u00C3\uFFFD]|â€|Ã©|Ã£|Ã§|\uFFFD/;
// Prova de que o guardião reprova o defeito histórico (travessão -> "Š" em
// string literal PDFDocEncoding) e o mojibake latin1 duplo, sem falso positivo
// no texto correto. Guardião que não reprova o bug não é guardião.
assert.ok(MOJIBAKE.test('Relatório detalhado \u0160 LC 142/2013'), 'guardião precisa reprovar o defeito "Š".');
assert.ok(MOJIBAKE.test('SimulaÃ§Ã£o previdenciÃ¡ria'), 'guardião precisa reprovar mojibake latin1 duplo.');
assert.ok(!MOJIBAKE.test('Relatório detalhado — LC 142/2013'), 'guardião não pode reprovar metadado correto.');
assert.throws(
  () => readInfoDictionary(Buffer.from(
    '%PDF-1.7\n1 0 obj\n<< /Title (Relat\\227rio detalhado \\227 LC 142/2013) /Producer (ATRIUM) >>\nendobj\n',
    'latin1'
  )),
  /UTF-16BE com BOM/,
  'string literal no /Info precisa ser reprovada (exige UTF-16BE com BOM).'
);
for (const item of generated) {
  const info = readInfoDictionary(item.bytes);
  for (const key of ['Title', 'Subject']) {
    assert.ok(info[key], `${item.id}/${item.familia}: /Info sem ${key}.`);
    assert.ok(!MOJIBAKE.test(info[key]), `${item.id}/${item.familia}: mojibake em /${key} ("${info[key]}").`);
  }
  assert.ok(info.Title.includes('—'), `${item.id}/${item.familia}: travessão perdido no /Title ("${info.Title}").`);
  if (item.id !== '—') {
    assert.ok(info.Title.includes('LC 142/2013'), `${item.id}/${item.familia}: /Title sem identificação do perfil.`);
  }
  assert.equal(info.Producer, 'ATRIUM', `${item.id}/${item.familia}: /Producer inesperado.`);
  if (POPPLER_AVAILABLE) {
    // Prova externa do mesmo invariante: o leitor real não pode mostrar mojibake.
    const tempInfoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc142-info-'));
    const probePath = path.join(tempInfoDir, `${item.id}-${item.familia}.pdf`);
    fs.writeFileSync(probePath, item.bytes);
    const info = execFileSync(PDFINFO, [probePath], { encoding: 'utf8' });
    fs.rmSync(tempInfoDir, { recursive: true, force: true });
    const title = /^Title:\s+(.*)$/m.exec(info)?.[1] ?? '';
    const subject = /^Subject:\s+(.*)$/m.exec(info)?.[1] ?? '';
    assert.ok(!MOJIBAKE.test(title), `${item.id}/${item.familia}: pdfinfo Title com mojibake ("${title}").`);
    assert.ok(!MOJIBAKE.test(subject), `${item.id}/${item.familia}: pdfinfo Subject com mojibake ("${subject}").`);
    assert.ok(title.includes('—'), `${item.id}/${item.familia}: pdfinfo perdeu o travessão ("${title}").`);
  }
}

// ---------------------------------------------------------------------------
// 9. RMI nula (requisito não atingido) nunca vira R$ 0,00 nem reusa a média.
// ---------------------------------------------------------------------------

const cenarioSemRmi = oracle.cases.find(item => item.expected.value.status === 'experimental'
  && item.expected.value.data?.native_result?.resumo?.rmi == null);
assert.ok(cenarioSemRmi, 'o oráculo precisa ter cenário experimental com rmi null.');
const envelopeSemRmi = cenarioSemRmi.expected.value;
for (const familia of LC142_REPORT_FAMILIES) {
  const report = renderLc142Report({
    familia,
    resultado: envelopeSemRmi,
    metadados: { cenarioId: cenarioSemRmi.id },
    geradoEm: FIXED_GENERATED_AT
  });
  const texto = winAnsiToUnicode(extractStreamText(report.bytes));
  assert.ok(texto.includes('Não apurada'), `${familia}: RMI nula precisa aparecer como "Não apurada".`);
  assert.ok(!texto.includes('R$ 0,00'), `${familia}: RMI nula não pode virar R$ 0,00.`);
  assert.ok(/não apurada porque/.test(texto), `${familia}: falta a explicação de por que a RMI não foi apurada.`);
  // média declarada continua visível e não é apresentada como RMI
  const media = formatBrDecimal(envelopeSemRmi.data.native_result.resumo.salario_beneficio, { fixedDecimals: 2 });
  assert.ok(texto.includes(media), `${familia}: média do PBC precisa continuar visível.`);
}

// ---------------------------------------------------------------------------
// 10. Escrita dos artefatos para inspeção humana
// ---------------------------------------------------------------------------

const artifacts = [];
for (const item of generated) {
  // O filename contratual não carrega o cenário; o diretório do artefato carrega,
  // para que as 35 combinações coexistam e sejam inspecionáveis.
  const directory = path.join(OUTPUT, item.id);
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, item.filename);
  fs.writeFileSync(target, item.bytes);
  artifacts.push({ ...item, target });
}
const identificacaoSinteticaPath = path.join(OUTPUT, 'lc142-summary-com-identificacao-sintetica.pdf');
fs.writeFileSync(identificacaoSinteticaPath, renderLc142Report({
  familia: 'summary',
  resultado: envelopeBase,
  metadados: metadadosBase,
  identificacao: identificacaoSintetica,
  geradoEm: FIXED_GENERATED_AT
}).bytes);

// ---------------------------------------------------------------------------
// 9. Prova externa: Poppler lê os bytes reais (quando disponível)
// ---------------------------------------------------------------------------

let popplerReport = 'Poppler indisponível nesta máquina — prova externa não executada.';
if (POPPLER_AVAILABLE) {
  // O binário Windows do Poppler lê o argv como ANSI e não abre caminho com
  // caracteres não-ASCII (o diretório do repositório tem "INTEGRAÇÃO"). Por isso
  // a prova externa roda sobre uma cópia em diretório temporário ASCII.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc142-pdf-probe-'));
  const stage = (item) => {
    const target = path.join(tempDir, `${item.id}-${item.familia}.pdf`);
    fs.writeFileSync(target, item.bytes);
    return target;
  };
  const runPdfToText = (pdfPath) => {
    const txtPath = `${pdfPath}.txt`;
    execFileSync(PDFTOTEXT, ['-enc', 'UTF-8', '-layout', pdfPath, txtPath]);
    return fs.readFileSync(txtPath, 'utf8');
  };

  const accentedWords = ['Hipótese', 'competências', 'benefício', 'média', 'vínculos', 'carência', 'parcelas descartadas', 'SIMULAÇÃO'];
  // Cada palavra acentuada precisa round-tripar no TEXTO EXTRAÍDO pelo menos
  // uma vez (as famílias têm vocabulários próprios); nenhuma delas pode virar
  // mojibake em nenhum dos 7 documentos.
  const covered = new Set();
  const mojibake = /Hiptese|HipÃ|benefÃ|mÃ©dia|vÃ­nculo|carÃªncia|SIMULAÃ|competÃªncias|descartadas?Ã/;
  const probe = generated.find(item => item.id === 'base-moderada' && item.familia === 'detailed');
  for (const family of LC142_REPORT_FAMILIES) {
    const candidate = generated.find(item => item.id === 'base-moderada' && item.familia === family);
    const text = runPdfToText(stage(candidate));
    assert.ok(!mojibake.test(text), `${family}: texto extraído pelo pdftotext contém mojibake de acentuação.`);
    for (const word of accentedWords) {
      if (text.toLowerCase().includes(word.toLowerCase())) covered.add(word);
    }
    const pages = pageTextsByFormFeed(text).filter(chunk => chunk.trim()).length;
    assert.equal(pages, candidate.structure.pageObjects,
      `${family}: pdftotext leu ${pages} páginas, estrutura declara ${candidate.structure.pageObjects}.`);
    assert.ok(text.includes('Página 1 de'), `${family}: rodapé "Página 1 de N" não legível no texto extraído.`);
  }
  const uncovered = accentedWords.filter(word => !covered.has(word));
  assert.deepEqual(uncovered, [], `acentos ausentes no texto extraído pelo pdftotext: ${uncovered.join(', ')}`);
  assert.equal(covered.size, accentedWords.length, 'nem todas as palavras acentuadas apareceram no texto extraído.');

  const probeText = runPdfToText(stage(probe));
  assert.ok(probeText.includes('Hipótese'), 'pdftotext não leu "Hipótese" no relatório detalhado.');

  const info = execFileSync(PDFINFO, [stage(probe)], { encoding: 'utf8' });
  const pagesMatch = /^Pages:\s+(\d+)$/m.exec(info);
  assert.ok(pagesMatch, 'pdfinfo não reportou Pages.');
  assert.equal(Number(pagesMatch[1]), probe.structure.pageObjects, 'pdfinfo / Pages diverge da estrutura.');
  assert.match(info, /Page size:\s+595\.28 x 841\.89 pts \(A4\)/, 'pdfinfo não reconhece A4.');
  assert.match(info, /PDF version:\s+1\.7/);
  popplerReport = `Poppler OK — pdftotext (acentos reais no texto extraído: ${accentedWords.join(', ')}) e pdfinfo (Pages: ${pagesMatch[1]}, A4 595.28x841.89, PDF 1.7).`;
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Relatório final
// ---------------------------------------------------------------------------

const totalBytes = generated.reduce((sum, item) => sum + item.bytes.length, 0);
const averageBytes = Math.round(totalBytes / generated.length);
const pagesDistribution = {};
for (const item of generated) {
  pagesDistribution[item.familia] = pagesDistribution[item.familia] || [];
  pagesDistribution[item.familia].push(item.structure.pageObjects);
}

console.log('LC 142 — renderer de PDF: OK');
console.log(`PDFs gerados: ${generated.length} (${SCENARIOS.length} cenários x ${LC142_REPORT_FAMILIES.length} famílias)`);
console.log(`Famílias: ${LC142_REPORT_FAMILIES.join(', ')}`);
console.log(`Tamanho: total ${totalBytes} bytes, média ${averageBytes} bytes, mínimo ${Math.min(...generated.map(i => i.bytes.length))}, máximo ${Math.max(...generated.map(i => i.bytes.length))}`);
for (const familia of LC142_REPORT_FAMILIES) {
  const pages = pagesDistribution[familia];
  console.log(`  ${familia}: páginas por cenário = ${pages.join(', ')}`);
}
console.log(`Acentuação no stream descomprimido: Hipótese, competências, benefício, média, vínculos, carência, parcelas descartadas, SIMULAÇÃO — verificada.`);
console.log(`Avisos obrigatórios: "${LC142_MANDATORY_WARNING}" e actual_entitlement_verified: false em todas as famílias.`);
console.log(`Identificação: desligada por padrão (declara omissão) e presente quando habilitada com dados sintéticos.`);
console.log(`Artifacts: ${path.relative(ROOT, OUTPUT)} (${artifacts.length} PDFs + 1 com identificação sintética)`);
console.log(popplerReport);
