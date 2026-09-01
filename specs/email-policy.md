# Política de e-mail

Status: **CURRENT**

## Purpose

Garantir envio exclusivamente manual, com conteúdo judicial resolvido pelo backend e transporte SMTP único.

## Canonical authority

`lib/email/email-service.mjs`, rotas de e-mail em `server.mjs` e `js/features/email-integration.js`.

## Invariants

- `EmailService` é o único transporte SMTP.
- Publicação individual usa ID; lote usa IDs + destinatário.
- Backend resolve conteúdo canônico persistido.
- Envio exige ação humana explícita, admin/master_admin e CSRF.

## Allowed operations

- Configurar/testar SMTP por ação administrativa.
- Gerir destinatários e enviar publicação/boletim manualmente.

## Forbidden operations

- Auto-send, cron de e-mail, envio após sync/import/tratamento ou fallback `mailto` com conteúdo judicial.
- Payload do frontend como autoridade do texto judicial ou segredo persistido no Store.

## State model

Configuração cifrada, status higienizado, destinatários ativos/inativos e resultado de envio explícito.

## Security boundary

Senha SMTP não retorna à UI; destinatários e conteúdo são validados no servidor; audit usa endereço mascarado quando aplicável.

## Failure semantics

Falha de transporte não produz sucesso nem alteração automática da publicação; erro sensível é sanitizado.

## Persistence semantics

Configuração/receivers ficam no serviço cifrado; envio não cria agenda automática nem muda treatmentStatus.

## Relevant tests

`tests/email_service.mjs`, `tests/email_integration_feature.mjs`, `tests/ui_v2_email_calendar_integrations.mjs`, `tests/publications_feature.mjs`.
