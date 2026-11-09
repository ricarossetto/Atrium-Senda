import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('\n===============================================================');
console.log('  ATRIUM — CATÁLOGO DE SKILLS DO ASSISTENTE (CONTRATO)         ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(ROOT, relative), 'utf8');

const catalogSource = await read('js/skills-data.js');
const moduleShim = { exports: {} };
new Function('module', 'exports', 'self', catalogSource)(moduleShim, moduleShim.exports, undefined);
const skills = moduleShim.exports;

console.log('[C1] Estrutura do catálogo...');
assert.ok(Array.isArray(skills), 'O catálogo deve exportar um array.');
assert.equal(skills.length, 19, 'O catálogo deve ter 19 skills (9 jurídicas + 7 de produto + 3 de contexto).');
const ids = skills.map(skill => skill.id);
assert.equal(new Set(ids).size, ids.length, 'Ids devem ser únicos.');
for (const skill of skills) {
  for (const field of ['id', 'name', 'title', 'description', 'source', 'category', 'instructions']) {
    assert.ok(typeof skill[field] === 'string' && skill[field].trim(), `${skill.id}: campo ${field} obrigatório.`);
  }
  assert.ok(['atrium', 'lex-intelligentia'].includes(skill.source), `${skill.id}: origem deve ser atrium ou lex-intelligentia (recebido: ${skill.source}).`);
  assert.ok(skill.instructions.length > 80, `${skill.id}: instruções curtas demais para guiar o assistente.`);
}
console.log(`  ✓ 19 skills com campos completos e instruções substanciais.`);

console.log('[C2] Skills jurídicas sincronizadas com os SKILL.md...');
const LEGAL = ['fazenda-publica-cumprimento', 'legal-agent', 'legal-audit', 'legal-draft-br', 'legal-ingest', 'legal-planner', 'legal-research-br', 'prescricao-intercorrente', 'previdenciario-incapacidade'];
for (const id of LEGAL) {
  const skill = skills.find(item => item.id === id);
  assert.ok(skill, `Skill jurídica ${id} ausente do catálogo.`);
  const raw = await read(`.agents/skills/${id}/SKILL.md`);
  const parts = raw.split(/^---\s*$/m);
  const body = (parts.length >= 3 ? parts.slice(2).join('---') : raw).replace(/\r\n/g, '\n').trim();
  assert.equal(skill.instructions, body, `${id}: catálogo divergente do SKILL.md (sincronize no mesmo commit).`);
}
console.log('  ✓ 9/9 skills jurídicas idênticas aos SKILL.md (corpo sem frontmatter).');

console.log('[C2b] Skills de contexto sincronizadas com os SKILL.md...');
const CONTEXT_IDS = ['consulta-judicial-mcp', 'padroes-de-qualidade', 'jev-data-analyzer'];
for (const id of CONTEXT_IDS) {
  const skill = skills.find(item => item.id === id);
  assert.ok(skill, `Skill de contexto ${id} ausente do catalogo.`);
  const raw = await read(`.agents/skills/${id}/SKILL.md`);
  const parts = raw.split(/^---\s*$/m);
  const body = (parts.length >= 3 ? parts.slice(2).join('---') : raw).replace(/\r\n/g, '\n').trim();
  assert.equal(skill.instructions, body, `${id}: catalogo divergente do SKILL.md (sincronize no mesmo commit).`);
}
const analyzer = skills.find(skill => skill.id === 'jev-data-analyzer');
const analyzerRaw = await read('.agents/skills/jev-data-analyzer/SKILL.md');
assert.doesNotMatch(analyzerRaw, /^---/);
assert.equal(analyzer.description, analyzerRaw.match(/^Descrição: (.+)$/m)?.[1]);
assert.equal(analyzer.title, 'Análise operacional com Atrium IA');
assert.match(analyzer.instructions, /células menores que 5/);
assert.match(analyzer.instructions, /Prescrição permanece não avaliável/);
assert.match(analyzer.instructions, /sem treinamento/);
assert.match(analyzer.instructions, /Nenhuma proposta cria tarefa/);
assert.match(analyzer.instructions, /auditoria da solicitação confirmada antes da consulta/);
console.log('  3/3 skills de contexto identicas aos SKILL.md.');

console.log('[C3] Skills de contexto (MCP e qualidade) presentes e honestas...');
const mcp = skills.find(skill => skill.id === 'consulta-judicial-mcp');
assert.match(mcp.instructions, /somente leitura|Somente leitura/i);
assert.match(mcp.instructions, /aus[eê]ncia de resultado n[aã]o prova inexist[eê]ncia/i, 'Limitação de cobertura do DJEN deve estar declarada.');
assert.match(mcp.instructions, /hom[oô]nimos/i, 'Risco de homônimos deve estar declarado.');
assert.match(mcp.instructions, /Domic[ií]lio Eletr[oô]nico/, 'Ordem de prioridade deve citar o Domicílio.');
assert.match(mcp.instructions, /verdade absoluta de prazos/i, 'eproc/PJe deve seguir como verdade absoluta de prazos.');
const quality = skills.find(skill => skill.id === 'padroes-de-qualidade');
assert.match(quality.instructions, /Definition of Done/i);
assert.match(quality.instructions, /revis[aã]o adversarial/i);
assert.match(quality.instructions, /aprova[cç][aã]o humana/i);
console.log('  ✓ MCP (regras + prioridade) e padrões de qualidade refletidos.');

console.log('[C4] Higiene do catálogo (produto jurídico, sem emojis nem texto de engenharia)...');
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
for (const skill of skills) {
  assert.ok(!emoji.test(skill.title + skill.description + skill.instructions), `${skill.id}: emojis são proibidos no catálogo.`);
  assert.doesNotMatch(skill.instructions, /npm|pnpm|React|Playwright|CI\/CD/i, `${skill.id}: texto de engenharia de software não pertence ao catálogo do usuário.`);
}
const basePrompt = await read('lib/legal-intelligence/atrium-base-prompt.mjs');
assert.match(basePrompt, /Fontes e ferramentas do ATRIUM/, 'Diretriz 7 deve existir no prompt base.');
assert.match(basePrompt, /Domic[ií]lio Eletr[oô]nico \(PDPJ\/Jus\.br\) como redund[aâ]ncia/, 'Prompt base deve citar a redundância do Domicílio.');
console.log('  ✓ Sem emoji, sem texto de engenharia e diretriz de fontes presente no prompt base.');

console.log('\n>>> CATÁLOGO DE SKILLS DO ASSISTENTE: PASS <<<\n');
