# Store e persistência

Status: **CURRENT**

## Purpose

Manter uma autoridade única de estado com concorrência otimista, migração determinística e escrita recuperável.

## Canonical authority

`js/core/store.js`, `js/core/api.js`, `server.mjs` e `lib/state-migrations.mjs`.

## Invariants

- Um único Store no frontend.
- `revision` e `expectedRevision` protegem contra lost update.
- Schema/dataVersion atuais são validados; schema futuro é rejeitado. Versão corrente: **v12** (disponibilização × publicação no DJEN; `migrate11To12`).
- Escritas são serializadas, coalescidas quando previsto e atômicas no backend.

## Allowed operations

- `Store.upsert`, `Store.save` e `Store.flush` pelos contratos existentes.
- Migração forward explícita, com defaults seguros e preservação de campos.

## Forbidden operations

- Segundo Store, persistência paralela, ocultação de 409 ou falso sucesso.
- Migration destrutiva sem backup, validação e teste de restauração.

## State model

Estado oficial versionado, metadados do servidor, revision e estados operacionais de save/sync.

A coleção opcional `calculations` guarda os cálculos salvos do módulo de Cálculos: cada registro exige `id`, `tipo` (`civel`, `trabalhista`, `previdenciario`), `entrada` e `resultado`, com autor e data opcionais. O servidor valida a coleção em `validateAppState` (máximo de 200 registros e 150k caracteres por registro) e a sanitização remove chaves perigosas e compacta a memória mensal de cálculos extensos, sinalizando `memoriaCompactada` sem alterar totais. Ausência da coleção significa lista vazia; nenhum dado legado é movido.

## Security boundary

O arquivo de estado é privado e cifrado; ator, role e revision autoritativos vêm do backend.

## Failure semantics

409 exige recarga/resolução; falha de flush permanece visível e impede confirmação de sucesso.

No fluxo de análise operacional, `canonicalRefreshPending` bloqueia o salvamento enquanto a releitura após auditoria não for confirmada. Edições concorrentes (dirty) são preservadas no navegador com a revisão anterior; adotar apenas a revisão da auditoria não resolve o conflito. Recarga comum recusa dirty. Descarte exige confirmação humana explícita vinculada ao fingerprint, revisão e identidade/workspace; mudança antes ou durante a leitura invalida a confirmação. Cancelar/Escape não consulta nem descarta. Falha de rede, envelope inválido, mudança de sessão ou falha de normalização conserva o snapshot e a trava. Somente recarga confirmada substitui o estado pelas informações oficiais: as edições locais aceitas para descarte são perdidas, sem rebase, merge ou recuperação automática. A UI deve permitir conferência antes dessa escolha, e não repetir o plano para corrigir a atualização pendente.

## Persistence semantics

POST persistente usa revision esperada, temp+rename/serialização e resposta com nova revision.

A configuração de agenda externa em `/api/calendar/configure` é uma mutação oficial do backend: valida e lê o feed antes da única gravação do Store, persiste os campos e a auditoria com a revisão esperada e devolve a nova revisão e a URL normalizada. O frontend adota essa resposta sem executar um segundo `save` ou `flush`.

## Relevant tests

`tests/store_module.mjs`, `tests/jev-analyzer-frontend.test.mjs`, `tests/ui_v2_operational_analysis.mjs`, `tests/state_migrations.mjs`, `tests/runtime_recovery.mjs`, `tests/backup_restore.mjs`, `tests/sync_result_contract.mjs`, `tests/external_calendar_feature.mjs` e `tests/calculation_persistence.mjs`.
