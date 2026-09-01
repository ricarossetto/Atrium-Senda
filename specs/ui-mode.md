# UI mode

Status: **CURRENT**

## Purpose

Permitir UI V2 como apresentação padrão e UI Clássica como fallback sobre a mesma aplicação funcional.

## Canonical authority

`js/views/ui-v2/mode.js`, `js/views/ui-v2/preference-init.js`, `js/portal.js` e `index.html`.

## Invariants

- Existe um único App, um único Store e uma única árvore operacional por feature.
- Trocar `data-ui` altera apresentação local, não dados, revision ou regras de negócio.
- V2 é padrão; Classic permanece selecionável.

## Allowed operations

- Persistir somente a preferência visual local prevista pelo controlador de modo.
- Escolher presenter Classic ou V2 sobre callbacks e dados canônicos únicos.

## Forbidden operations

- Criar segunda feature, Store, listener funcional ou request por causa do modo.
- Remover Classic sem gate explícito.

## State model

`v2` ou `classic`; o estado é de apresentação e não integra o estado jurídico persistido.

## Security boundary

O modo não altera autenticação, RBAC, CSRF, payloads nem autoridade do backend.

## Failure semantics

Preferência ausente ou inválida usa o default canônico sem bloquear o boot.

## Persistence semantics

Somente preferência local de UI; zero `Store.save()`, `Store.flush()` ou revision.

## Relevant tests

`tests/ui_v2_mode_contract.mjs`, `tests/ui_v2_final_parity.mjs`, `tests/ui_v2_runtime_hygiene.mjs`.
