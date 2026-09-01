# Gate 26B — Document maturity core

## Decision

O acervo documental usa metadata em `state.documents` e conteúdo binário privado, cifrado e endereçado por SHA-256. A separação permite múltiplas referências legítimas ao mesmo conteúdo sem duplicar bytes ou inflar o estado jurídico.

## Ownership

Cada metadata possui um único owner canônico (`contact` ou `process`) validado no servidor. Clientes continuam sendo contatos com papel de cliente; não há coleção paralela de clientes nem cópia do binário em módulos relacionados.

## Naming

O servidor resolve o template do escritório, limita placeholders, sanitiza caracteres e traversal e preserva a extensão original. Colisão de nome por owner falha com `409`; nunca há overwrite silencioso.

## Deletion and recovery

Excluir na UI significa soft delete com `deletedAt` e `deletedBy`. Restore limpa esses campos sem tocar no blob. Purge exige ação destrutiva explícita, confirmação, auditoria e remoção física apenas quando o checksum não tem outra referência.

## Deferred

OCR, extração/classificação automática, versionamento, colaboração, assinatura e geração DOCX/PDF permanecem fora do Gate 26B e dependem de gates próprios.
