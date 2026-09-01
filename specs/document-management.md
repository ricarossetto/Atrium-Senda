# Documentos

Status: **CURRENT** para catálogo/gerador, acervo binário, preview seguro, extração local supervisionada e conversão textual para PDF; **FUTURE** para classificação, versionamento e colaboração avançada.

## Purpose

Definir o contrato do gerador de minutas e do acervo documental vinculado a clientes/contatos e processos, incluindo derivados locais supervisionados sem misturar texto jurídico gerado, originais binários e resultados de extração.

## Canonical authority

`js/features/documents.js`, `lib/documents/document-service.mjs`, `lib/documents/document-intelligence.mjs`, as rotas `/api/documents*` de `server.mjs`, `state.documents` e os nove generators canônicos.

## Invariants

- Existe uma única `createDocumentsFeature`, com 9 tipos, 4 aliases e 5 cards de catálogo.
- Textos jurídicos permanecem byte a byte protegidos por hashes; preview continua temporário.
- Metadata canônica vive em `state.documents`; bytes nunca são duplicados dentro do estado.
- Cada documento pertence diretamente a exatamente um `contact` ou `process` existente.
- Conteúdo idêntico usa um único blob SHA-256, mesmo quando há referências legítimas por proprietários distintos.
- Soft delete precede a exclusão permanente; restore não recria nem altera os bytes.
- Padrões de nome aceitam somente `{processo}`, `{cliente}`, `{tipo}`, `{data}`, `{tribunal}` e `{oab}`.
- Preview, OCR e conversão são sempre ações explícitas; renderizar o acervo não inicia processamento.
- OCR nunca substitui o original: o texto derivado usa blob cifrado próprio e metadata rastreia source, checksum, data, motor/versão, idioma, páginas e supervisão.
- Preview decide o formato por magic bytes/conteúdo, não por MIME fornecido pelo navegador, e nunca executa HTML, SVG ou script.
- Conversão PDF deste contrato aceita somente texto UTF-8/Markdown inerte e cria novo documento derivado; não promete conversão universal.

## Allowed operations

- Selecionar tipo/contato/processo, gerar preview, editar temporariamente, copiar e baixar `.md`.
- Fazer upload explícito de até 20 MB para cliente/contato ou processo existente.
- Baixar, mover para a lixeira, restaurar e, após confirmação explícita, excluir permanentemente.
- Configurar um padrão de nome de escritório por usuário administrador; sem padrão, preservar o nome original sanitizado.
- Gerar preview inerte de texto UTF-8, PNG, JPEG e WebP; renderizar somente a primeira página de PDF quando Poppler local estiver disponível.
- Extrair texto nativo sem processo externo e executar OCR local explícito em imagens/PDF quando Tesseract (e, para PDF, Poppler) estiver configurado.
- Criar PDF determinístico a partir de texto UTF-8/Markdown inerte como novo documento do mesmo owner.

## Forbidden operations

- Alterar texto jurídico ou hashes para acomodar UI.
- Sobrescrever silenciosamente conteúdo com mesmo nome ou duplicar o mesmo conteúdo para o mesmo proprietário.
- Persistir bytes ou base64 em `state.documents`, audit, logs, URL ou DOM persistente.
- Expor o diretório de blobs como conteúdo estático ou aceitar traversal no nome/caminho.
- Destruir bytes no soft delete; purgar sem confirmação explícita e sem registro de auditoria.
- Enviar arquivo, página ou texto de cliente a OCR cloud/terceiro, iniciar OCR automático ou usar shell para montar comandos.
- Exibir PDF original, HTML ou SVG como conteúdo ativo; confiar apenas em extensão/MIME; prometer conversão de Office ou qualquer formato arbitrário.
- CURRENT: classificação automática, versionamento, assinatura, DOCX gerado ou edição colaborativa.

## State model

`state.documents[]` contém, no mínimo: `id`, `name`, `originalName`, `mime`, `size`, `createdAt`, `updatedAt`, `documentDate`, `ownerType`, `ownerId`, `documentType`, `deletedAt`, `deletedBy` e `checksum`. Extrações usam `intelligence.ocr` com referência ao source e ao checksum cifrado do texto, sem incluir o próprio texto. PDFs derivados usam `sourceDocumentId` e `derivation`. `settings.documentNamingTemplate` contém apenas o template validado. Bytes são referenciados pelo checksum e não integram o estado público.

## Security boundary

O servidor é autoridade de ownership, naming, checksum, deduplicação, revisão, lixeira, restore, purge e derivados. Blobs são AES-256-GCM no diretório privado de dados; downloads exigem sessão e usam attachment com `application/octet-stream`. Preview aplica `nosniff`, CSP sandbox e somente tipos allowlisted. Processos locais são chamados sem shell, com argumentos separados, temporário privado, limites e cleanup. Toda mutação exige CSRF e revisão atual. Presenter não contém generators nem acessa storage diretamente.

## Failure semantics

Owner ausente/inválido, payload vazio, limite excedido, placeholder desconhecido, checksum duplicado no mesmo owner, colisão de nome, revisão obsoleta e transição inválida falham sem sobrescrever metadata ou bytes existentes. Documento na lixeira não pode ser baixado nem processado antes de restore. Motor OCR/Poppler ausente retorna indisponibilidade operacional clara; formato não suportado retorna 415. Falha de persistência pode deixar somente blob órfão criptografado, nunca apagar referência confirmada.

## Persistence semantics

Metadata e auditoria são gravadas atomicamente no estado criptografado com revisão. Original, texto extraído e PDF derivado são blobs distintos endereçados por checksum; nenhum derivado substitui o source. Um blob só é removido após a metadata ter sido purgada e quando não houver qualquer outra referência ao checksum.

## Relevant tests

`tests/documents_feature.mjs`, `tests/document_type_ids.mjs`, `tests/document_storage.mjs`, `tests/document_intelligence.mjs`, `tests/ui_v2_documents.mjs`, `tests/ui_v2_documents_accessibility.mjs`, `tests/ui_v2_document_storage.mjs`, `tests/ui_v2_document_intelligence.mjs`, `tests/visual_ui_v2_documents.mjs` e `tests/state_migrations.mjs`.
