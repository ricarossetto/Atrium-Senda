# Configurações operacionais

Status: **CURRENT**

## Purpose

Administrar catálogos, equipe, fluxo, metas, notificações e integrações do escritório em um painel único, com persistência canônica e atalhos para os módulos que controlam credenciais reais.

## Canonical authority

`js/features/configuration.js`, `js/views/ui-v2/configuration-presenter.js`, `css/views/ui-v2/configuration.css` e `js/core/store.js`.

## Invariants

- Cada seção grava somente em `state.configuration` pelo Store canônico e preserva revisão, rollback e validação existentes.
- Status rápidos alteram o mesmo registro exibido; não criam Store ou fluxo paralelo.
- Configurações de integração descrevem preferências administrativas. Credenciais e conexão são tratadas exclusivamente pelos módulos próprios abertos pelos atalhos do painel.
- Tempo interno esperado, prioridade e alertas de estagnação são referências de gestão. Não calculam, confirmam nem preenchem prazo jurídico.
- Sugestões de responsável ou tarefa dependem de confirmação humana e não praticam ciência, envio ou ato processual.
- O painel não afirma frequência, provedor ou capacidade operacional sem suporte do módulo canônico correspondente.

## Security boundary

Senhas, certificados, chaves, TOTP e tokens nunca integram registros de configuração. Os atalhos apenas abrem os modais canônicos de A1/2FA, DataJud, IA, agenda e e-mail.

## Failure and persistence semantics

Falha de persistência restaura o estado anterior e informa o usuário. Alternar status não pode fingir sucesso quando o Store falha. Campos desconhecidos permanecem compatíveis com registros anteriores e não iniciam automação por si mesmos.

## Relevant tests

`tests/configuration_feature.mjs`, `tests/ui_v2_configuration_admin.mjs`, `tests/configuration_persistence.mjs` e `tests/smoke.mjs`.
