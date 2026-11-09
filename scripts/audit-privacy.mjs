#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runPrivacyAudit } from '../lib/judicial-intelligence/security/privacy-audit.mjs';
import { renderMarkdown, exitCodeFor } from '../lib/judicial-intelligence/security/report.mjs';

const args = process.argv.slice(2);

function readOption(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = args.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function main() {
  const rootDir = path.resolve(readOption('root', process.cwd()));
  const failOn = readOption('fail-on', 'never');
  const markdownPath = readOption('markdown', null);
  const includeDynamic = args.includes('--dynamic');
  const report = await runPrivacyAudit({ rootDir, includeDynamic });

  if (markdownPath) {
    const target = path.resolve(markdownPath);
    await writeFile(target, renderMarkdown(report), 'utf8');
    process.stderr.write(`Relatório Markdown gravado em ${target}\n`);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const code = exitCodeFor(report, { failOn });
  if (code !== 0) {
    process.stderr.write(`Achados iguais ou acima de ${failOn.toUpperCase()} encontrados; falhando conforme --fail-on.\n`);
  }
  process.exit(code);
}

main().catch(error => {
  process.stderr.write(`Falha na auditoria de privacidade: ${error?.message ?? error}\n`);
  process.exit(2);
});
