# UI mode

Status: **CURRENT**

## Purpose

Definir UI V2 como a única apresentação selecionável pelo usuário, preservando a camada Classic apenas como compatibilidade interna temporária sobre a mesma aplicação funcional.

## Canonical authority

`js/views/ui-v2/mode.js`, `js/views/ui-v2/preference-init.js`, `js/portal.js` e `index.html`.

## Invariants

- Existe um único App, um único Store e uma única árvore operacional por feature.
- Trocar `data-ui` altera apresentação local, não dados, revision ou regras de negócio.
- V2 é padrão e única apresentação exposta ao usuário.
- Classic não aparece na navegação nem nas configurações; sua árvore interna pode permanecer durante a transição para testes de compatibilidade, sem virar uma segunda aplicação.

## Allowed operations

- Persistir somente a preferência visual local prevista pelo controlador de modo.
- Escolher presenter Classic ou V2 sobre callbacks e dados canônicos únicos.

## Forbidden operations

- Criar segunda feature, Store, listener funcional ou request por causa do modo.
- Reexpor Classic como preferência ou alternativa selecionável sem gate explícito.

## State model

`v2` para toda sessão de produto. O valor `classic` é reservado à compatibilidade interna e não integra o estado jurídico persistido.

## Security boundary

O modo não altera autenticação, RBAC, CSRF, payloads nem autoridade do backend.

## Failure semantics

Preferência ausente ou inválida usa o default canônico sem bloquear o boot.

## Persistence semantics

Somente preferência local de UI; zero `Store.save()`, `Store.flush()` ou revision.

## Relevant tests

`tests/ui_v2_mode_contract.mjs`, `tests/ui_v2_final_parity.mjs`, `tests/ui_v2_runtime_hygiene.mjs`.
