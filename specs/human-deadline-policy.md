# Política humana de prazos

Status: **CURRENT**

## Purpose

Impedir que texto judicial, classificação ou IA sejam apresentados como prazo jurídico confirmado.

## Canonical authority

`js/features/publications.js`, `js/features/tasks.js`, `server.mjs` e os fluxos de criação de tarefa a partir de publicação.

## Invariants

- Tarefa criada de publicação começa sem deadline, salvo data explicitamente fornecida e confirmada pelo usuário.
- `deadline` e `fatalDeadline` existentes são dados explícitos; não são inferidos de movimentação ou categoria.
- Classificação de ato e prioridade não calcula vencimento.

## Allowed operations

- Exibir datas já cadastradas.
- Usuário autorizado informar, revisar, alterar ou remover prazo explicitamente.

## Forbidden operations

- Regex do tipo recurso=15 dias ou embargos=5 dias.
- IA, texto de publicação ou data genérica promovidos a prazo fatal.
- Criar tarefa automática com deadline estimado.

## State model

Prazo ausente, prazo informado e `fatalDeadline` explicitamente marcado.

## Security boundary

A confirmação jurídica é humana; automação não pratica ato, ciência ou decisão profissional.

## Failure semantics

Na dúvida ou ausência de data explícita, o prazo permanece vazio e o fluxo pede conferência humana.

## Persistence semantics

Somente valores submetidos pelo contrato canônico são persistidos; ausência continua ausência.

## Relevant tests

`tests/publication_task_linking.mjs`, `tests/publications_treatment.mjs`, `tests/ui_v2_publications.mjs`, `tests/agenda_feature.mjs`.
