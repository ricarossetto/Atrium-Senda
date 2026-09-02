# Conectividade judicial gerenciada

Status: **CURRENT**

## Purpose

Supervisionar cobertura judicial por identidade e portal, com estratégia explícita, sessão isolada, cadência conservadora e backoff.

## Canonical authority

`lib/judicial/managed-connectivity.mjs`, `lib/judicial/session-manager.mjs`, `lib/judicial/credential-manager.mjs`, `collector/agent.mjs` e `server.mjs`.

## Invariants

- A1, PJeOffice, Windows Store, usuário/senha/TOTP e sessão interativa são estratégias distintas.
- Estado é isolado por usuário + identidade + portal.
- “Verificado” exige fonte pública canônica ou evidência explícita; demais portais ficam `experimental` ou `not_verified`.
- Um único coletor gerenciado executa por vez no servidor.

## Allowed operations

- `authenticate`, `health`, `discoverCases`, `fetchMovements`, `fetchPublications`, `disconnect` em adapter declarado read-only.
- Atualização manual explícita e agenda supervisionada de no mínimo 30 minutos.
- Sessão assistida explícita para portais habilitados; o usuário conclui login, CAPTCHA, TOTP ou confirmação humana exigida pelo tribunal.

## Forbidden operations

- Adapter com `acknowledge`, `science`, `sign`, `file`, `protocol`, `petition` ou `confirmDeadline`.
- Retry rápido, loop durante ação humana ou alegação de suporte live sem evidência.

## State model

`not_configured`, `authenticating`, `connected`, `action_required`, `expired`, `error`; registra última tentativa/sucesso, próxima atualização e falhas.

## Security boundary

Credenciais por identidade permanecem no cofre cifrado; cobertura pública contém apenas estado e erros sanitizados.

## Failure semantics

Erro transitório aplica backoff exponencial limitado; CAPTCHA/2FA interativo e expiração removem próxima tentativa até reconexão humana. Certificado A1 válido ou Sandbox operacional não equivale a uma sessão autenticada no portal.

## Persistence semantics

Estado de sessão é persistido separadamente do Store jurídico; coleta bem-sucedida usa o ingest canônico.

## Relevant tests

`tests/managed_judicial_connectivity.mjs`, `tests/judicial_integrations_feature.mjs`, `tests/ui_v2_judicial_integrations.mjs`, `tests/ui_v2_judicial_integrations_accessibility.mjs`.
