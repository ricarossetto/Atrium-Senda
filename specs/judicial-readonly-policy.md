# Política judicial read-only

Status: **CURRENT**

## Purpose

Delimitar toda integração judicial a consulta, descoberta e importação supervisionada.

## Canonical authority

`collector/`, `lib/judicial/`, rotas judiciais em `server.mjs` e `docs/judicial/`.

## Invariants

- DJEN → CNJ → DataJud é discovery somente leitura.
- Portais podem autenticar e consultar acervo, movimentos e publicações.
- Matching por CNJ/referência pode deduplicar; sinais fracos geram sugestão explicável.

## Allowed operations

- Autenticar, verificar saúde, descobrir processos, ler movimentos/publicações e desconectar.
- Upsert seguro preservando dados locais significativos e identidades estáveis.

## Forbidden operations

- Ciência, acknowledgment, assinatura, petição, protocolo ou confirmação automática de prazo.
- Contornar CAPTCHA, 2FA ou etapa humana do portal.

## State model

Fonte pública ou portal autenticado com estado independente; dados importados mantêm `source` e identidade externa.

## Security boundary

Segredos ficam cifrados no agente local; PFX, senha, cookies e TOTP não entram em Store, UI persistente ou logs.

## Failure semantics

Falha parcial é declarada; autenticação humana pausa o ciclo; erro sanitizado não vira ato automático.

## Persistence semantics

Somente dados de consulta passam pelo ingest canônico; não há persistência de ato processual oficial.

## Relevant tests

`tests/collector.mjs`, `tests/judicial_discovery.mjs`, `tests/judicial_integration_rbac.mjs`, `tests/publication_task_linking.mjs`.
