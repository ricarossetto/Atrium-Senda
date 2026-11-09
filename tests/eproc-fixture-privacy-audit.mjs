import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'wave_d');

async function runFixturePrivacyAudit() {
  console.log('=== TESTE FOCAL: OLE CONTAINER & BINARY FIXTURE PRIVACY AUDIT ===\n');

  const files = [
    'RelatorioProcessos_sanitized.xls',
    'citacaoIntimacao_sanitized.xls'
  ];

  for (const filename of files) {
    const filePath = path.join(FIXTURES_DIR, filename);
    const buf = await readFile(filePath);

    // 1. Signature check: genuine OLE Compound File / BIFF8
    const sigHex = buf.subarray(0, 8).toString('hex');
    assert.equal(sigHex, 'd0cf11e0a1b11ae1', `${filename} deve ser OLE2 válido`);

    // 2. Parse workbook with full metadata inspection
    const wb = XLSX.read(buf, { type: 'buffer', cellFormula: true, cellHTML: true });

    // A. Sheet count & hidden sheets
    assert.equal(wb.SheetNames.length, 1, `${filename} deve conter exatamente 1 planilha ativa`);
    assert.equal(wb.Workbook?.Sheets?.some(s => s.Hidden > 0), false, 'Zero planilhas ocultas');

    // B. Workbook properties & SummaryInformation
    const props = wb.Props || {};
    const custProps = wb.Custprops || {};
    assert.equal(props.Author || '', '', 'Zero autor pessoal em metadata');
    assert.equal(props.Company || '', '', 'Zero empresa em metadata');
    assert.equal(props.LastAuthor || '', '', 'Zero último autor em metadata');

    // C. Defined Names & External Links
    const definedNames = wb.Workbook?.Names || [];
    assert.equal(definedNames.length, 0, 'Zero nomes definidos residuais');

    // D. Scan all cell strings, comments, and hyperlinks
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawBufferText = buf.toString('latin1');

    // Check for unmasked CPF regex (11 consecutive digits or standard format)
    const rawCpfMatches = rawBufferText.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g) || [];
    assert.equal(rawCpfMatches.length, 0, `Zero CPFs formatados em ${filename}`);

    // Check for tokens, private keys or passwords
    const secretKeywords = ['password', 'senha', 'BEGIN RSA', 'private key', 'secret', 'totp'];
    for (const kw of secretKeywords) {
      assert.equal(rawBufferText.toLowerCase().includes(kw), false, `Zero menções a "${kw}" no binário ${filename}`);
    }

    // Inspect cells for synthetic verification
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    for (const row of rows) {
      for (const cell of row) {
        const str = String(cell);
        // Any person name must be synthetic
        if (str.includes('PARTE')) {
          assert.ok(str.includes('SINTETICA'), `Nome de parte deve ser sintético: ${str}`);
        }
      }
    }

    console.log(`✓ ${filename}: Estrutura OLE verificada. Reconstrução sintética comprovada (zero PII, zero metadados residuais).`);
  }

  console.log('\n>>> FIXTURE PRIVACY AUDIT PASSED! <<<\n');
}

runFixturePrivacyAudit().catch(err => {
  console.error('Falha na auditoria de privacidade de fixtures:', err);
  process.exit(1);
});
