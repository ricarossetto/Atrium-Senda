# Documentos

Status: **CURRENT** para catálogo/gerador; **FUTURE** para gestão binária documental.

## Purpose

Definir o contrato atual do gerador de minutas e impedir que planos de storage sejam apresentados como disponíveis.

## Canonical authority

`js/features/documents.js`, `js/views/ui-v2/documents-presenter.js` e os nove generators canônicos.

## Invariants

- CURRENT: uma única `createDocumentsFeature`, 9 tipos, 4 aliases e 5 cards de catálogo.
- CURRENT: textos jurídicos permanecem byte a byte protegidos por hashes.
- CURRENT: preview é temporário; copy e download usam o texto atual do textarea.
- FUTURE: upload, owner process/contact, naming templates, lixeira, restore, storage e versionamento.

## Allowed operations

- CURRENT: selecionar tipo/contato/processo, gerar preview, editar temporariamente, copiar e baixar `.md`.
- FUTURE: somente após gate próprio, schema/migration, segurança e testes de recuperação.

## Forbidden operations

- Alterar texto jurídico ou hashes para acomodar UI.
- CURRENT: save, flush, audit, Store mutation, request, DOCX/PDF, upload ou persistência documental.

## State model

CURRENT: seleção transitória e textarea de preview. Não existe coleção canônica de arquivos/documentos armazenados.

## Security boundary

Presenter não contém generators nem acessa Store; dados usados vêm das seleções existentes e não são enviados a serviço novo.

## Failure semantics

Tipo desconhecido ou feeType não canônico é rejeitado sem fallback silencioso e sem alterar preview anterior indevidamente.

## Persistence semantics

CURRENT: zero persistência de documento. FUTURE não está implementado.

## Relevant tests

`tests/documents_feature.mjs`, `tests/document_type_ids.mjs`, `tests/ui_v2_documents.mjs`, `tests/ui_v2_documents_accessibility.mjs`.
