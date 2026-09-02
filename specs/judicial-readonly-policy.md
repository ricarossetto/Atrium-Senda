# Política judicial read-only

Status: **CURRENT**

## Purpose

Delimitar toda integração judicial a consulta, descoberta e importação supervisionada.

## Canonical authority

`collector/`, `lib/judicial/`, rotas judiciais em `server.mjs` e `docs/judicial/`.

## Invariants

- DJEN → CNJ → DataJud é discovery somente leitura e, quando a fonte estruturada identifica inequivocamente uma única parte representada, vincula o processo ao contato canônico correspondente.
- Portais podem autenticar e consultar acervo, movimentos e publicações.
- Matching por CNJ/referência pode deduplicar; sinais fracos geram sugestão explicável.

## Allowed operations

- Autenticar, verificar saúde, descobrir processos, ler movimentos/publicações e desconectar.
- Upsert seguro preservando dados locais significativos e identidades estáveis; partes estruturadas podem formar contatos canônicos e relações processo-cliente sem sobrescrever curadoria manual.
- Todo CNJ estruturado do DJEN pode criar um processo-base; o DataJud enriquece esse mesmo registro com tribunal, classe, assunto e movimentos quando localizado.
- Destinatários estruturados do DJEN viram contatos. A classificação automática como cliente exige OAB monitorada associada à comunicação e um único polo destinatário; polos múltiplos permanecem pendentes de confirmação humana.

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
