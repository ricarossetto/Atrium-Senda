# Documentos

Status: **CURRENT** para catálogo/gerador e para o acervo binário do Gate 26B; **FUTURE** para OCR, classificação, versionamento e colaboração avançada.

## Purpose

Definir o contrato do gerador de minutas e do acervo documental vinculado a clientes/contatos e processos, sem misturar texto jurídico gerado com armazenamento binário.

## Canonical authority

`js/features/documents.js`, `lib/documents/document-service.mjs`, as rotas `/api/documents*` de `server.mjs`, `state.documents` e os nove generators canônicos.

## Invariants

- Existe uma única `createDocumentsFeature`, com 9 tipos, 4 aliases e 5 cards de catálogo.
- Textos jurídicos permanecem byte a byte protegidos por hashes; preview continua temporário.
- Metadata canônica vive em `state.documents`; bytes nunca são duplicados dentro do estado.
- Cada documento pertence diretamente a exatamente um `contact` ou `process` existente.
- Conteúdo idêntico usa um único blob SHA-256, mesmo quando há referências legítimas por proprietários distintos.
- Soft delete precede a exclusão permanente; restore não recria nem altera os bytes.
- Padrões de nome aceitam somente `{processo}`, `{cliente}`, `{tipo}`, `{data}`, `{tribunal}` e `{oab}`.

## Allowed operations

- Selecionar tipo/contato/processo, gerar preview, editar temporariamente, copiar e baixar `.md`.
- Fazer upload explícito de até 20 MB para cliente/contato ou processo existente.
- Baixar, mover para a lixeira, restaurar e, após confirmação explícita, excluir permanentemente.
- Configurar um padrão de nome de escritório por usuário administrador; sem padrão, preservar o nome original sanitizado.

## Forbidden operations

- Alterar texto jurídico ou hashes para acomodar UI.
- Sobrescrever silenciosamente conteúdo com mesmo nome ou duplicar o mesmo conteúdo para o mesmo proprietário.
- Persistir bytes ou base64 em `state.documents`, audit, logs, URL ou DOM persistente.
- Expor o diretório de blobs como conteúdo estático ou aceitar traversal no nome/caminho.
- Destruir bytes no soft delete; purgar sem confirmação explícita e sem registro de auditoria.
- CURRENT: OCR, extração automática, classificação, versionamento, assinatura, DOCX/PDF gerados ou edição colaborativa.

## State model

`state.documents[]` contém, no mínimo: `id`, `name`, `originalName`, `mime`, `size`, `createdAt`, `updatedAt`, `documentDate`, `ownerType`, `ownerId`, `documentType`, `deletedAt`, `deletedBy` e `checksum`. `settings.documentNamingTemplate` contém apenas o template validado. Bytes são referenciados pelo checksum e não integram o estado público.

## Security boundary

O servidor é autoridade de ownership, naming, checksum, deduplicação, revisão, lixeira, restore e purge. Blobs são AES-256-GCM no diretório privado de dados; downloads exigem sessão e usam attachment com `application/octet-stream`. Toda mutação exige CSRF e revisão atual. Presenter não contém generators nem acessa storage diretamente.

## Failure semantics

Owner ausente/inválido, payload vazio, limite excedido, placeholder desconhecido, checksum duplicado no mesmo owner, colisão de nome, revisão obsoleta e transição inválida falham sem sobrescrever metadata ou bytes existentes. Documento na lixeira não pode ser baixado antes de restore. Falha de persistência pode deixar somente blob órfão criptografado, nunca apagar referência confirmada.

## Persistence semantics

Metadata e auditoria são gravadas atomicamente no estado criptografado com revisão. O blob é gravado por checksum em envelope AES-256-GCM e só é removido após a metadata ter sido purgada e quando não houver qualquer outra referência ao checksum.

## Relevant tests

`tests/documents_feature.mjs`, `tests/document_type_ids.mjs`, `tests/document_storage.mjs`, `tests/ui_v2_documents.mjs`, `tests/ui_v2_documents_accessibility.mjs`, `tests/ui_v2_document_storage.mjs`, `tests/visual_ui_v2_documents.mjs` e `tests/state_migrations.mjs`.
