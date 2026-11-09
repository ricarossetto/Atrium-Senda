import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAiClassifierChip, renderAiClassifierDeadlineChip, renderAiClassifierPanel, renderDeadlineConference, renderDuplicateReviewPanel, renderPublicationDetail, renderPublicationRow } from '../js/views/ui-v2/publications-presenter.js';
import { RISK_CONFIRM_COPY, createRiskConfirm, renderRiskConfirm } from '../js/components/risk-confirm.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readText = relative => readFileSync(path.join(ROOT, relative), 'utf8');

console.log('\n===============================================================');
console.log('  ATRIUM — CLASSIFICADOR IA: CONTRATO VISUAL (PURO, SEM BROWSER)');
console.log('===============================================================\n');

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

console.log('[V1] Painel: desligado não renderiza; estados asisten com honestidade...');
{
  assert.equal(renderAiClassifierPanel({ panel: null, escapeHtml }), '');
  assert.equal(renderAiClassifierPanel({ panel: { enabled: false, status: 'ready' }, escapeHtml }), '');
  const loading = renderAiClassifierPanel({ panel: { enabled: true, status: 'loading' }, escapeHtml });
  assert.match(loading, /role="status"/);
  assert.match(loading, /Gerando sugestão/);
  assert.match(loading, /Atrium IA/);
  const unavailable = renderAiClassifierPanel({ panel: { enabled: true, status: 'unavailable', message: 'Sem credencial.' }, escapeHtml });
  assert.match(unavailable, /Sem credencial\./);
  assert.match(unavailable, /aria-label="Atrium IA"/);
  const failed = renderAiClassifierPanel({ panel: { enabled: true, status: 'error' }, escapeHtml });
  assert.match(failed, /Não foi possível gerar a sugestão\./);
  assert.match(failed, /data-ai-classifier-action="refresh"/);
  assert.match(failed, /Tentar de novo/);
}

console.log('[V2] Painel pronto: chips da família, nota honesta e sem marca interna...');
{
  const ready = renderAiClassifierPanel({
    panel: {
      enabled: true,
      status: 'ready',
      suggestion: {
        action: 'suggest',
        confidence: 0.85,
        suggestion: {
          area: { label: 'trabalhista', confidence: 0.9 },
          priority: { label: 'alta', confidence: 0.8 }
        }
      }
    },
    escapeHtml
  });
  assert.match(ready, /class="act-chip">Área: Trabalhista</);
  assert.match(ready, /class="act-chip">Prioridade: Alta</);
  assert.match(ready, /Confiança 0,90/);
  assert.match(ready, /Não altera tratamento, prazo ou responsável\./);
  assert.match(ready, /Atualizar sugestão/);
  assert.match(ready, /href="assets\/icons\/atrium-ui-icons\.svg(?:\?v=[^"#]+)?#atrium-icon-assistant"/);
  assert.ok(!/jev/i.test(ready), 'painel sem marca interna');
  const abstained = renderAiClassifierPanel({
    panel: { enabled: true, status: 'ready', suggestion: { action: 'review', confidence: 0.4, suggestion: {} } },
    escapeHtml
  });
  assert.match(abstained, /Sem sugestão firme/);
}

console.log('[V3] Rótulos desconhecidos e hostis: escapar, nunca sumir nem quebrar...');
{
  const hostile = renderAiClassifierPanel({
    panel: {
      enabled: true,
      status: 'ready',
      suggestion: { action: 'suggest', confidence: 0.9, suggestion: { area: { label: '<script>alert(1)</script>', confidence: 0.9 }, priority: { label: 'zzz', confidence: 0.9 } } }
    },
    escapeHtml
  });
  assert.doesNotMatch(hostile, /<script>/);
  assert.match(hostile, /&lt;script&gt;/);
  assert.match(hostile, /Prioridade: zzz</);
}

console.log('[V4] Detalhe preserva comportamento sem o painel; com o painel, injeta sem duplicar...');
{
  const base = {
    item: { id: 'pub-v', title: 'T', text: 'Texto', treatmentStatus: 'untreated', unread: true },
    act: { label: 'Ato', css: 'rotina' },
    parties: '', linkedTasks: [], linkedProcess: null, linkedContact: null,
    privileged: false, escapeHtml,
    formatDate: value => value || '—', formatDateTime: value => value || 'Nunca', formatAge: () => 'Hoje'
  };
  const without = renderPublicationDetail(base);
  assert.doesNotMatch(without, /ai-classifier-panel/);
  const withPanel = renderPublicationDetail({ ...base, aiClassifier: { enabled: true, status: 'loading' } });
  assert.match(withPanel, /ai-classifier-panel/);
  assert.equal(withPanel.split('<section class="ai-classifier-panel"').length - 1, 1, 'uma seção, sem duplicação');
}

console.log('[V5] Toggle no HTML: escondido, acessível, sprite oficial, sem handler inline...');
{
  const html = readText('index.html');
  assert.match(html, /<button class="button ghost v2-only" id="aiClassifierToggle" type="button" hidden aria-pressed="false"[^>]*>/);
  assert.match(html, /id="aiClassifierToggle"[^>]*title="Ligar ou desligar o Atrium IA \(somente administradores\)"/);
  assert.match(html, /#atrium-icon-assistant/);
  assert.match(html, /<span>Atrium IA<\/span>/);
  assert.doesNotMatch(html, /aiClassifierToggle"[^>]*onclick/);
  assert.ok(!/jev/i.test(html), 'index.html sem marca interna');
}

console.log('[V6] CSS: escopo do domínio, tokens semânticos, sem hexadecimal novo...');
{
  const css = readText('css/views/ui-v2/publications.css');
  const toggleAt = css.indexOf('#aiClassifierToggle[aria-pressed');
  assert.ok(toggleAt > 0, 'regra do toggle existe');
  assert.ok(css.lastIndexOf('#view-inbox', toggleAt) > css.lastIndexOf('}', toggleAt) - 2000, 'toggle sob escopo da view');
  const panelAt = css.indexOf('.ai-classifier-panel {');
  assert.ok(panelAt > 0, 'regra do painel existe');
  for (const block of [css.slice(toggleAt, toggleAt + 400), css.slice(panelAt, panelAt + 1200)]) {
    assert.ok(block.includes('var(--v2-'), 'somente tokens semânticos');
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, 'sem hexadecimal espalhado');
    assert.doesNotMatch(block, /!important/, 'sem important');
  }
  assert.ok(!/jev/i.test(css), 'CSS sem marca interna');
}

console.log('[V7] Feature e presenter sem marca interna no código de UI...');
{
  for (const relative of ['js/features/publications.js', 'js/views/ui-v2/publications-presenter.js']) {
    assert.ok(!/jev/i.test(readText(relative)), `${relative} sem marca interna`);
  }
  const feature = readText('js/features/publications.js');
  assert.match(feature, /securePostJson\('\/api\/ai-classifier\/settings'[\s\S]{0,200}'PATCH'/, 'toggle usa PATCH como o contrato do backend');
}

console.log('[V8] Chip na lista: triagem visível sem clique, com variantes e escaping...');
{
  const firm = renderAiClassifierChip({ classifier: { enabled: true, action: 'suggest', area: 'trabalhista', areaConfidence: 0.91, priority: 'alta' }, escapeHtml });
  assert.match(firm, /class="publication-ai-chip is-firm"/);
  assert.match(firm, /Trabalhista · Alta/);
  assert.match(firm, /atrium-icon-assistant/);
  assert.match(firm, /title="Atrium IA · Confiança 0,91 · sugestão para conferência"/);
  const soft = renderAiClassifierChip({ classifier: { enabled: true, action: 'review', area: 'fazenda', areaConfidence: 0.62, priority: '' }, escapeHtml });
  assert.match(soft, /is-soft/);
  assert.match(soft, /Fazenda pública/);
  assert.equal(renderAiClassifierChip({ classifier: null, escapeHtml }), '');
  assert.equal(renderAiClassifierChip({ classifier: { enabled: false, action: 'suggest', area: 'civil' }, escapeHtml }), '');
  const hostile = renderAiClassifierChip({ classifier: { enabled: true, action: 'suggest', area: '<script>x</script>', priority: 'zzz' }, escapeHtml });
  assert.doesNotMatch(hostile, /<script>/);
  assert.match(hostile, /&lt;script&gt;/);
  const base = { act: { label: 'Ato', css: 'rotina' }, parties: '', selected: false, escapeHtml, formatDate: value => value || '—', formatAge: () => 'Hoje' };
  const row = renderPublicationRow({ ...base, item: { id: 'pub-x', title: 'T', text: 'Texto', treatmentStatus: 'untreated', unread: true }, aiClassifier: { enabled: true, action: 'suggest', area: 'marcas', priority: 'normal' } });
  assert.match(row, /publication-ai-chip/);
  assert.match(row, /Marcas e patentes/);
  assert.match(row, /Atrium IA sugere uma área para conferência/);
  const withoutAi = renderPublicationRow({ ...base, item: { id: 'pub-y', title: 'T', text: 'Texto', treatmentStatus: 'untreated', unread: true } });
  assert.doesNotMatch(withoutAi, /publication-ai-chip/);
  assert.ok(!/jev/i.test(row), 'linha sem marca interna');
}

console.log('[V9] Feature consome o derivado e o lote; botão e status existem no shell...');
{
  const feature = readText('js/features/publications.js');
  assert.match(feature, /\/api\/ai-classifier\/suggestions/);
  assert.match(feature, /\/api\/ai-classifier\/triage-backlog/);
  assert.match(feature, /aiClassifierSuggestions\.has/);
  assert.match(feature, /aiClassifierBadgeState/);
  const html = readText('index.html');
  assert.match(html, /id="aiClassifierBacklogButton"/);
  assert.match(html, /id="aiClassifierBacklogStatus"/);
  assert.doesNotMatch(html, /aiClassifierBacklogButton"[^>]*onclick/);
  assert.ok(!/jev/i.test(feature));
}

console.log('[V10] Sinal de prazo: chip para conferência e pré-preenchimento da contagem...');
{
  const chip = renderAiClassifierDeadlineChip({ classifier: { enabled: true, deadlineSignal: 'sim', deadlineDays: 'd15' }, escapeHtml });
  assert.match(chip, /class="publication-ai-deadline"/);
  assert.match(chip, /Possível prazo · 15 dias/);
  assert.match(chip, /nada é gravado automaticamente/);
  const vague = renderAiClassifierDeadlineChip({ classifier: { enabled: true, deadlineSignal: 'sim', deadlineDays: 'sem_contagem' }, escapeHtml });
  assert.match(vague, /Possível prazo no texto/);
  assert.equal(renderAiClassifierDeadlineChip({ classifier: { enabled: true, deadlineSignal: 'nao' }, escapeHtml }), '');
  assert.equal(renderAiClassifierDeadlineChip({ classifier: null, escapeHtml }), '');
  const hostile = renderAiClassifierDeadlineChip({ classifier: { enabled: true, deadlineSignal: 'sim', deadlineDays: '<img src=x>' }, escapeHtml });
  assert.doesNotMatch(hostile, /<img/);
  const base = { item: { id: 'pub-d', publishedAt: '2026-09-10', treatmentStatus: 'untreated', unread: true }, escapeHtml };
  const plain = renderDeadlineConference(base);
  assert.match(plain, /value="15" data-conference-days/, 'sem sinal, mantém o padrão 15');
  assert.doesNotMatch(plain, /data-conference-signal/);
  const with_ = renderDeadlineConference({
    ...base,
    aiClassifier: { enabled: true, suggestion: { suggestion: { deadline_signal: { label: 'sim' }, deadline_days: { label: 'd20' } } } }
  });
  assert.match(with_, /value="20" data-conference-days/, 'sinal pré-preenche os dias');
  assert.match(with_, /data-conference-signal="sim"/);
  assert.match(with_, /Confira a data e os dias antes de calcular — nada é gravado./);
  assert.ok(!/fatalDeadline/i.test(with_), 'conferência nunca cria prazo fatal');
}

console.log('[V10] Painel de duplicatas: pares, veredito tracejado e nenhuma fusão automática...');
{
  assert.equal(renderDuplicateReviewPanel({ panel: null, escapeHtml }), '');
  assert.equal(renderDuplicateReviewPanel({ panel: { enabled: false, pairs: [] }, escapeHtml }), '');
  const empty = renderDuplicateReviewPanel({ panel: { enabled: true, pairs: [] }, escapeHtml });
  assert.match(empty, /Nenhuma duplicata para revisar/);
  assert.doesNotMatch(empty, /data-duplicate-action/);

  const panel = renderDuplicateReviewPanel({
    panel: {
      enabled: true,
      running: false,
      pairs: [
        {
          key: 'eproc:1|djen:1',
          aId: 'eproc:1',
          bId: 'djen:1',
          aSource: 'eproc',
          bSource: 'djen',
          aLabel: 'Prazo em aberto · 0000001-00.2026.8.21.0001',
          bLabel: 'Intimação DJEN · 0000001-00.2026.8.21.0001',
          verdict: 'mesma',
          confidence: 0.91
        },
        {
          key: 'djen:2|djen:3',
          aId: 'djen:2',
          bId: 'djen:3',
          aSource: 'djen',
          bSource: 'djen',
          aLabel: 'Publicação A',
          bLabel: 'Publicação B',
          verdict: '',
          confidence: 0
        }
      ]
    },
    escapeHtml
  });
  assert.match(panel, /Duplicatas prováveis \(2\)/);
  assert.match(panel, /manual e reversível/);
  assert.match(panel, /data-duplicate-open="eproc:1"/);
  assert.match(panel, /verdict-mesma/);
  assert.match(panel, /Mesma publicação/);
  assert.match(panel, /Não analisado/);
  assert.match(panel, /data-duplicate-action="analyze"/);
  assert.match(panel, /confiança 91%/);
  assert.ok(!/fatalDeadline|deadline"/.test(panel), 'painel de duplicatas não toca prazo');

  const running = renderDuplicateReviewPanel({ panel: { enabled: true, running: true, pairs: [{ key: 'a|b', aId: 'a', bId: 'b', verdict: '' }] }, escapeHtml });
  assert.match(running, /Procurando…/);
  assert.match(running, /disabled/);
}

console.log('[V11] Duplicatas: descartar por par, confirmar em lote e alerta de riscos do Atrium IA...');
{
  const base = { enabled: true, running: false };
  const pair = (key, verdict = 'mesma') => ({
    key,
    aId: `${key}-a`,
    bId: `${key}-b`,
    aSource: 'eproc',
    bSource: 'djen',
    aLabel: `A ${key}`,
    bLabel: `B ${key}`,
    verdict,
    confidence: 0.9
  });

  const duasMesma = renderDuplicateReviewPanel({ panel: { ...base, pairs: [pair('p1'), pair('p2')] }, escapeHtml });
  assert.match(duasMesma, /data-duplicate-action="confirm-all"/, 'lote disponível com mais de uma sugestão de mesma publicação');
  assert.match(duasMesma, /Confirmar tudo \(2\)/);
  assert.match(duasMesma, /data-duplicate-action="dismiss"/, 'descarte por par disponível');
  assert.match(duasMesma, /Descartar sugestão/);
  assert.match(duasMesma, /data-duplicate-a="p1-a"/, 'descarte leva os dois lados do par');

  const umaMesma = renderDuplicateReviewPanel({ panel: { ...base, pairs: [pair('p1')] }, escapeHtml });
  assert.doesNotMatch(umaMesma, /data-duplicate-action="confirm-all"/, 'uma só sugestão não abre lote');
  const nenhumaMesma = renderDuplicateReviewPanel({ panel: { ...base, pairs: [pair('p1', 'diferente'), pair('p2', '')] }, escapeHtml });
  assert.doesNotMatch(nenhumaMesma, /data-duplicate-action="confirm-all"/, 'sem "mesma publicação" não há lote');
  assert.match(nenhumaMesma, /data-duplicate-action="dismiss"/, 'o descarte continua acessível para qualquer par');

  assert.equal(RISK_CONFIRM_COPY.title, 'Você tem certeza que deseja confirmar todas as sugestões do Atrium IA?');
  assert.equal(RISK_CONFIRM_COPY.acknowledge, 'Compreendo os riscos e desejo continuar');
  assert.equal(RISK_CONFIRM_COPY.cancel, 'Não, vou revisar manualmente');
  assert.equal(RISK_CONFIRM_COPY.skip, 'Não perguntar novamente');

  const stepAck = renderRiskConfirm({ options: { count: 3 }, step: 'ack', escapeHtml });
  assert.match(stepAck, /Você tem certeza que deseja confirmar todas as sugestões do Atrium IA\?/);
  assert.match(stepAck, /data-risk-action="acknowledge"/);
  assert.match(stepAck, /data-risk-action="cancel"/);
  assert.match(stepAck, /Não, vou revisar manualmente/);
  assert.match(stepAck, /3<\/strong> itens serão afetados/, 'o alerta diz quantos itens serão afetados');
  assert.match(stepAck, /role="dialog" aria-modal="true"/);
  assert.doesNotMatch(stepAck, /riskConfirmSkip/, 'a opção de não perguntar só aparece depois do reconhecimento');
  assert.ok(!/atrium-icon-emoji|[\u{1F300}-\u{1FAFF}]/u.test(stepAck), 'sem emoji: só SVG oficial');

  const stepConfirm = renderRiskConfirm({ options: { count: 3 }, step: 'confirm', escapeHtml });
  assert.match(stepConfirm, /riskConfirmSkip/, 'checkbox "não perguntar novamente" no segundo passo');
  assert.match(stepConfirm, /data-risk-action="confirm"/);
  assert.match(stepConfirm, /Confirmar todas as sugestões/);
  assert.doesNotMatch(stepConfirm, /data-risk-action="acknowledge"/, 'o reconhecimento não se repete');

  const skipStorage = new Map([['atrium:ai:bulk-confirm-skip', 'true']]);
  const skipConfirm = createRiskConfirm({
    documentRef: { defaultView: { localStorage: { getItem: key => skipStorage.get(key) ?? null, setItem: (key, value) => skipStorage.set(key, value), removeItem: key => skipStorage.delete(key) } } },
    escapeHtml
  });
  assert.equal(skipConfirm.isSkipEnabled(), true);
  assert.equal(await skipConfirm.open({ count: 5 }), true, 'com "não perguntar" gravado, a autorização já vale');
  skipConfirm.resetSkip();
  assert.equal(skipConfirm.isSkipEnabled(), false);
  const comRecusa = renderDuplicateReviewPanel({
    panel: {
      ...base,
      pairs: [{
        ...pair('p1'),
        refusal: {
          reason: 'treatment-conflict',
          label: 'Conflito de teor: uma tratada e outra descartada',
          detail: 'Este par não pode ser fundido agora (treatment-conflict).'
        }
      }]
    },
    escapeHtml
  });
  assert.match(comRecusa, /duplicate-verdict-cell[\s\S]{0,300}duplicate-refusal/, 'a recusa fica na mesma célula do veredito, sem quebrar a grade do par');
  assert.match(comRecusa, /Conflito de teor: uma tratada e outra descartada/, 'o motivo da recusa é legível para quem opera');
  assert.match(comRecusa, /title="Este par não pode ser fundido agora \(treatment-conflict\)\."/, 'o detalhe do servidor acompanha a marca');
  assert.doesNotMatch(umaMesma, /duplicate-refusal/, 'par sem recusa não ganha a marca');

  console.log('  OK: descarte por par, lote só com "mesma publicação" e alerta de riscos na ordem pedida.');
}

console.log('\n[PASS] Atrium IA: contrato visual íntegro (browser pendente).\n');
