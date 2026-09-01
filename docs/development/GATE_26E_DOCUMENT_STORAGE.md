# Gate 26E — abstração de armazenamento documental

## Decisão tecnológica

O acervo documental passa a depender do contrato `put/get/exists/delete/metadata/health`, validado na composição do servidor. A implementação CURRENT é `EncryptedLocalDocumentStorageProvider`, que preserva exatamente o diretório privado `documents/blobs`, endereçamento SHA-256, envelope AES-256-GCM e publicação atômica por arquivo temporário seguido de rename.

`DocumentBlobStore` permanece somente como alias de compatibilidade. Regras de ownership, naming, lixeira, restore, purge, OCR e PDF derivado não conhecem caminho físico nem operações nativas de filesystem.

## Invariantes preservadas

- Bytes idênticos continuam deduplicados pelo checksum do conteúdo em claro, sem expor esse conteúdo.
- Original, OCR supervisionado e PDF derivado usam a mesma autoridade de storage e referências independentes.
- Soft delete e restore alteram apenas metadata; purge remove bytes somente após a última referência canônica desaparecer.
- Falha antes da publicação não deixa temporário; falha após a gravação e antes da metadata pode deixar apenas blob órfão cifrado, nunca remover referência confirmada.
- O backup/restore vigente continua protegendo o Store e suas referências; como os blobs residem no mesmo diretório privado e não são removidos durante restore, originais e derivados referenciados continuam recuperáveis no runtime local. Backup portátil de blobs é evolução futura explícita, não foi inferido neste gate.

## Limites

Não foram implementados S3, R2, NAS, WebDAV ou replicação. Um provider futuro precisa satisfazer o mesmo contrato, criptografia, atomicidade, limites, ownership server-side e testes de equivalência antes de se tornar CURRENT.

## Evidência

`tests/document_storage_provider.mjs` cobre completude do contrato, cifragem, deduplicação, traversal, corrupção, metadata, health, exclusão idempotente e ausência de temporário após falha. As suítes documentais canônicas continuam cobrindo upload/download, lixeira/restore/purge, OCR, derivados e referência compartilhada.
