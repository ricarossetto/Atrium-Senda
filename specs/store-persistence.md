# Store e persistência

Status: **CURRENT**

## Purpose

Manter uma autoridade única de estado com concorrência otimista, migração determinística e escrita recuperável.

## Canonical authority

`js/core/store.js`, `js/core/api.js`, `server.mjs` e `lib/state-migrations.mjs`.

## Invariants

- Um único Store no frontend.
- `revision` e `expectedRevision` protegem contra lost update.
- Schema/dataVersion atuais são validados; schema futuro é rejeitado.
- Escritas são serializadas, coalescidas quando previsto e atômicas no backend.

## Allowed operations

- `Store.upsert`, `Store.save` e `Store.flush` pelos contratos existentes.
- Migração forward explícita, com defaults seguros e preservação de campos.

## Forbidden operations

- Segundo Store, persistência paralela, ocultação de 409 ou falso sucesso.
- Migration destrutiva sem backup, validação e teste de restauração.

## State model

Estado canônico versionado, metadados do servidor, revision e estados operacionais de save/sync.

## Security boundary

O arquivo de estado é privado e cifrado; ator, role e revision autoritativos vêm do backend.

## Failure semantics

409 exige recarga/resolução; falha de flush permanece visível e impede confirmação de sucesso.

## Persistence semantics

POST persistente usa revision esperada, temp+rename/serialização e resposta com nova revision.

## Relevant tests

`tests/store_module.mjs`, `tests/state_migrations.mjs`, `tests/runtime_recovery.mjs`, `tests/backup_restore.mjs`, `tests/sync_result_contract.mjs`.
