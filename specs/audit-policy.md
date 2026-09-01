# Política de auditoria

Status: **CURRENT**

## Purpose

Manter ledger de ações relevantes com ator autoritativo, minimização de PII e exportação fiel.

## Canonical authority

`js/core/store.js`, `js/features/audit.js`, `server.mjs` e `js/views/ui-v2/audit-presenter.js`.

## Invariants

- Novos registros são ordenados do mais recente para o mais antigo.
- Backend usa ator autenticado em mutações autoritativas.
- Filtros/busca/exportação não mutam o ledger.
- Audit de contatos não inclui CPF/RG/telefone/e-mail/endereço/notas.

## Allowed operations

- Acrescentar evento com ação, detalhe minimizado, ator e timestamp.
- Filtrar, buscar e exportar o conjunto canônico.

## Forbidden operations

- Segredos, tokens, conteúdo excessivo ou PII desnecessária no detail.
- UI inventar ator para operação que o servidor conhece.
- Reordenar ou apagar silenciosamente para acomodar apresentação.

## State model

Entradas imutáveis por ID com `at`, `action`, `detail` e `actor`; limites de retenção atuais são aplicados pelas autoridades existentes.

## Security boundary

Detalhes são escapados na UI e minimizados antes da persistência; export respeita o ledger visível/canônico sem executar HTML.

## Failure semantics

Falha da mutação principal não deve gerar audit de sucesso; operações atômicas não deixam entrada órfã.

## Persistence semantics

Audit integra o estado revisionado ou append autoritativo do servidor, conforme o fluxo existente.

## Relevant tests

`tests/audit_feature.mjs`, `tests/ui_v2_audit.mjs`, `tests/ui_v2_audit_accessibility.mjs`, `tests/contacts_feature.mjs`.
