# Tratamento de publicações

Status: **CURRENT**

## Purpose

Registrar triagem interna de publicações sem confundi-la com ciência judicial oficial.

## Canonical authority

Endpoints de tratamento em `server.mjs`, `js/features/publications.js` e migration v7→v8 em `lib/state-migrations.mjs`.

## Invariants

- Estados: `untreated`, `in_review`, `treated`, `discarded`.
- Transições válidas são decididas no backend com ator autenticado e revision.
- Tratada no ATRIUM não significa ciência no tribunal.

## Allowed operations

- Iniciar análise, marcar tratada, descartar com nota, reabrir e restaurar conforme a máquina de estados.
- Criar tarefa por ação explícita e transacional.

## Forbidden operations

- Pular transição inválida, confiar em ator do frontend ou marcar ciência judicial.
- Inferir prazo ou enviar e-mail automaticamente como efeito do tratamento.

## State model

`untreated → in_review → treated|discarded`, com reabertura/restauração nas rotas canônicas.

## Security boundary

Autenticação, CSRF, revision e ator são verificados no servidor; texto externo é escapado na UI.

## Failure semantics

Transição inválida ou revision divergente retorna conflito e não produz estado/audit parcial.

## Persistence semantics

Transição e audit são gravados atomicamente; metadados contraditórios são removidos.

## Relevant tests

`tests/publications_treatment.mjs`, `tests/publications_feature.mjs`, `tests/publication_task_linking.mjs`, `tests/ui_v2_publications.mjs`.
