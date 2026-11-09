import assert from 'node:assert/strict';
import {
  collectDjen,
  appendDjenItem,
  validDjenItem,
  djenProcessDigits,
  normalizeDateOnly,
  djenInternals
} from '../collector/adapters/djen.mjs';

console.log('--- Iniciando Testes Focais DJEN Nacional + Marco Fixo de Intimações ---');

// 1. Item que tenha SOMENTE numeroprocessocommascara é aceito por validDjenItem e processado
{
  const itemOnlyMasked = {
    id: 101,
    numeroprocessocommascara: '5001234-56.2026.8.21.0001',
    siglaTribunal: 'TJRS',
    tipoComunicacao: 'Intimação',
    data_disponibilizacao: '2026-09-15',
    texto: 'Publicação somente com máscara'
  };
  assert.equal(djenProcessDigits(itemOnlyMasked), '50012345620268210001');
  assert.equal(validDjenItem(itemOnlyMasked), true, 'Cenário 1: validDjenItem deve aceitar item com somente numeroprocessocommascara');

  const target = { intimations: [], contacts: [], processes: [], tasks: [] };
  const res = appendDjenItem(itemOnlyMasked, { name: 'DJEN' }, { monitoredTerm: {} }, target, { intimationCutoffDate: '2026-09-15' });
  assert.equal(res, 'added');
  assert.equal(target.intimations.length, 1);
  assert.equal(target.intimations[0].process, '5001234-56.2026.8.21.0001');
  console.log('✓ Cenário 1: item com somente numeroprocessocommascara é aceito e processado');
}

// 2. Item anterior a 2026-09-15 e inexistente NÃO entra na inbox
{
  const itemOld = {
    id: 102,
    numeroProcesso: '50012345620268210002',
    data_disponibilizacao: '2026-09-14',
    texto: 'Publicação antiga inexistente'
  };
  const target = { intimations: [], contacts: [], processes: [], tasks: [] };
  const res = appendDjenItem(itemOld, { name: 'DJEN' }, { monitoredTerm: {} }, target, { intimationCutoffDate: '2026-09-15' });
  assert.equal(res, 'historical', 'Cenário 2: item anterior ao marco e inexistente deve retornar "historical"');
  assert.equal(target.intimations.length, 0, 'Cenário 2: não deve entrar na inbox');
  console.log('✓ Cenário 2: item anterior a 2026-09-15 e inexistente não entra na inbox');
}

// 3. Item de 2026-09-15 entra na inbox
{
  const itemAtWatermark = {
    id: 103,
    numero_processo: '50012345620268210003',
    data_disponibilizacao: '2026-09-15',
    texto: 'Publicação na data exata do marco'
  };
  const target = { intimations: [], contacts: [], processes: [], tasks: [] };
  const res = appendDjenItem(itemAtWatermark, { name: 'DJEN' }, { monitoredTerm: {} }, target, { intimationCutoffDate: '2026-09-15' });
  assert.equal(res, 'added', 'Cenário 3: item na data exata do marco deve retornar "added"');
  assert.equal(target.intimations.length, 1, 'Cenário 3: deve entrar na inbox');
  assert.equal(target.intimations[0].id, 'djen:103');
  console.log('✓ Cenário 3: item na data do marco (2026-09-15) entra na inbox');
}

// 4. Item posterior ao marco entra na inbox
{
  const itemPostWatermark = {
    id: 104,
    numero_processo: '50012345620268210004',
    data_disponibilizacao: '2026-09-16',
    texto: 'Publicação após marco'
  };
  const target = { intimations: [], contacts: [], processes: [], tasks: [] };
  const res = appendDjenItem(itemPostWatermark, { name: 'DJEN' }, { monitoredTerm: {} }, target, { intimationCutoffDate: '2026-09-15' });
  assert.equal(res, 'added', 'Cenário 4: item posterior deve retornar "added"');
  assert.equal(target.intimations.length, 1, 'Cenário 4: deve entrar na inbox');
  console.log('✓ Cenário 4: item posterior ao marco entra na inbox');
}

// 5. Cenário: publicação 16/09, sincronização 25/09, marco 15/09 -> publicação entra
{
  const itemLagged = {
    id: 105,
    numero_processo: '50012345620268210005',
    data_disponibilizacao: '2026-09-16',
    texto: 'Publicação de 16/09 sincronizada dias depois'
  };
  const target = { intimations: [], contacts: [], processes: [], tasks: [] };
  const res = appendDjenItem(itemLagged, { name: 'DJEN' }, { monitoredTerm: {} }, target, { intimationCutoffDate: '2026-09-15' });
  assert.equal(res, 'added', 'Cenário 5: publicação de 16/09 deve entrar com marco 15/09 independente do dia do sync');
  assert.equal(target.intimations.length, 1);
  console.log('✓ Cenário 5: publicação de 16/09 com marco 15/09 entra mesmo sincronizada dias depois');
}

// 6. Item anterior ao marco que JÁ exista continua sendo atualizado/deduplicado
{
  const target = {
    intimations: [{
      id: 'djen:106',
      externalId: 'djen:106',
      title: 'Título Antigo',
      text: 'Texto Antigo',
      publishedAt: '2026-08-10'
    }],
    contacts: [],
    processes: [],
    tasks: []
  };
  const itemPreExistingHistorical = {
    id: 106,
    numero_processo: '50012345620268210006',
    tipoComunicacao: 'Intimação Atualizada',
    data_disponibilizacao: '2026-08-10',
    texto: 'Texto Atualizado'
  };
  const res = appendDjenItem(itemPreExistingHistorical, { name: 'DJEN' }, { monitoredTerm: {} }, target, { intimationCutoffDate: '2026-09-15' });
  assert.equal(res, 'updated', 'Cenário 6: item pré-existente anterior ao marco deve retornar "updated"');
  assert.equal(target.intimations.length, 1, 'Cenário 6: não deve duplicar');
  assert.equal(target.intimations[0].title, 'Intimação Atualizada');
  assert.equal(target.intimations[0].text, 'Texto Atualizado');
  console.log('✓ Cenário 6: item anterior ao marco pré-existente é atualizado/deduplicado normalmente');
}

// 7. Nenhuma duplicação pelo mesmo externalId
{
  const itemDuplicate = {
    id: 107,
    numero_processo: '50012345620268210007',
    data_disponibilizacao: '2026-09-15',
    texto: 'Execução 1'
  };
  const target = { intimations: [], contacts: [], processes: [], tasks: [] };
  const res1 = appendDjenItem(itemDuplicate, { name: 'DJEN' }, { monitoredTerm: {} }, target, { intimationCutoffDate: '2026-09-15' });
  assert.equal(res1, 'added');
  assert.equal(target.intimations.length, 1);

  const itemDuplicateSecondPass = {
    id: 107,
    numero_processo: '50012345620268210007',
    data_disponibilizacao: '2026-09-15',
    texto: 'Execução 2 (conteúdo atualizado)'
  };
  const res2 = appendDjenItem(itemDuplicateSecondPass, { name: 'DJEN' }, { monitoredTerm: {} }, target, { intimationCutoffDate: '2026-09-15' });
  assert.equal(res2, 'updated');
  assert.equal(target.intimations.length, 1, 'Cenário 7: continua com 1 registro, sem duplicação');
  assert.equal(target.intimations[0].text, 'Execução 2 (conteúdo atualizado)');
  console.log('✓ Cenário 7: nenhuma duplicação pelo mesmo externalId');
}

// 8. Marco fixo explícito prevalece sobre intimationLookbackDays: 2
{
  const target = { intimations: [], contacts: [], processes: [], tasks: [] };
  const items = [
    {
      id: 201,
      numeroProcesso: '50012345620268210008',
      data_disponibilizacao: '2026-09-14', // < marco 2026-09-15 -> historical
      texto: 'Item 201'
    },
    {
      id: 202,
      numeroProcesso: '50012345620268210009',
      data_disponibilizacao: '2026-09-15', // >= marco 2026-09-15 -> added
      texto: 'Item 202'
    }
  ];

  const fakeFetch = async () => new Response(JSON.stringify({
    count: 2,
    items
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const result = await collectDjen({
    url: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao',
    numeroOab: '135294',
    ufOab: 'RS',
    lookbackDays: 60,
    intimationLookbackDays: 2, // janela móvel que descartaria o de 2026-09-15 se hoje fosse posterior
    intimationTrackingSince: '2026-09-15' // marco explícito prevalece
  }, { monitoredTerm: { oabNumber: '135294', oabUf: 'RS' } }, target, {
    fetchImpl: fakeFetch,
    sleep: async () => {}
  });

  assert.equal(result.records, 2);
  assert.equal(result.historicalSkipped, 1, 'Cenário 8: 1 item anterior ao marco fixo foi ignorado');
  assert.equal(result.inboxAdded, 1, 'Cenário 8: 1 item de 2026-09-15 foi adicionado');
  assert.equal(result.trackingSince, '2026-09-15', 'Cenário 8: trackingSince deve refletir o marco fixo');
  assert.equal(target.intimations.length, 1);
  assert.equal(target.intimations[0].id, 'djen:202');
  console.log('✓ Cenário 8: marco fixo explícito prevalece sobre intimationLookbackDays: 2');
}

// 9. Nenhum prazo ou tarefa é criado automaticamente
{
  const target = { intimations: [], contacts: [], processes: [], tasks: [], agenda: [] };
  const items = [
    {
      id: 301,
      numeroProcesso: '50012345620268210010',
      data_disponibilizacao: '2026-09-15',
      texto: 'Intimação com prazo de 15 dias para contestar',
      tipoComunicacao: 'Intimação'
    }
  ];
  const fakeFetch = async () => new Response(JSON.stringify({
    count: 1,
    items
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  await collectDjen({
    url: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao',
    numeroOab: '135294',
    ufOab: 'RS',
    intimationTrackingSince: '2026-09-15'
  }, { monitoredTerm: { oabNumber: '135294', oabUf: 'RS' } }, target, {
    fetchImpl: fakeFetch,
    sleep: async () => {}
  });

  assert.equal(target.intimations.length, 1);
  assert.equal(target.tasks?.length || 0, 0, 'Cenário 9: nenhuma tarefa deve ser criada automaticamente');
  assert.equal(target.agenda?.length || 0, 0, 'Cenário 9: nenhum agendamento de prazo deve ser criado');
  console.log('✓ Cenário 9: nenhum prazo ou tarefa é criado automaticamente');
}

// Verificação de robustez do normalizeDateOnly
{
  assert.equal(normalizeDateOnly('2026-09-15'), '2026-09-15');
  assert.equal(normalizeDateOnly('  2026-09-15  '), '2026-09-15');
  assert.equal(normalizeDateOnly('2026-02-31'), null);
  assert.equal(normalizeDateOnly('2026/09/15'), null);
  assert.equal(normalizeDateOnly('invalid'), null);
  assert.equal(normalizeDateOnly(''), null);
  assert.equal(normalizeDateOnly(null), null);
  console.log('✓ normalizeDateOnly valida rigorosamente YYYY-MM-DD');
}

console.log('=== TODOS OS 9 TESTES FOCAIS PASSARAM COM SUCESSO! ===');
