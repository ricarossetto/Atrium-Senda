# Busca global full-text

Status: **CURRENT**

## Purpose

Localizar conteúdo jurídico e operacional já autorizado em Processos, Contatos, Publicações, Tarefas, Documentos/OCR, Prompts e metadados apropriados de Auditoria.

## Canonical authority

`lib/search-index.mjs`, `server.mjs`, `js/components/global-search.js` e `js/portal.js`.

## Invariants

- O índice é DERIVED / REBUILDABLE e nunca é fonte de verdade.
- O Store cifrado continua sendo a autoridade canônica; blobs OCR continuam cifrados no acervo documental.
- Cada resultado contém tipo, título, contexto, snippet, campo encontrado e relevância.
- A sincronização usa a revision canônica e reaproveita entradas inalteradas quando seguro.

## Allowed operations

- Busca autenticada por conteúdo local já autorizado.
- Sincronização derivada sob demanda e reconstrução explícita por administrador.
- Destaque visual somente depois de escapar título, contexto e snippet.

## Forbidden operations

- Persistir um segundo Store, substituir o JSON cifrado por SQLite ou tratar o índice como autoridade.
- Indexar credenciais, chaves, tokens, senhas, TOTP, dados de sessão ou conteúdo apagado.
- Executar HTML de resultados, enviar conteúdo a serviço externo ou alterar registros ao pesquisar/reconstruir.

## State model

Snapshot em memória, versionado, ligado à revision canônica e composto por entradas derivadas. Ausência, versão inválida ou corrupção lógica dispara rebuild; nenhuma cópia plaintext é gravada em disco.

## Security boundary

`/api/search` exige sessão autenticada. `/api/search/rebuild` exige administrador e CSRF. Campos são selecionados por allowlist, padrões de segredo são descartados e a UI escapa todo texto antes do highlight.

Credenciais, chaves, tokens, senhas, TOTP e dados de sessão não são fontes do índice.

## Failure semantics

Falha ao ler um blob OCR omite apenas aquele texto derivado e preserva metadata/original. Índice ausente ou inválido é reconstruído do Store e dos blobs cifrados; falha remota da busca mantém o fallback local sem mutação.

## Persistence semantics

Nenhuma persistência canônica nova. O índice vive somente em memória, é sincronizado quando a revision muda e pode ser descartado ou reconstruído sem perda de dados.

## Relevant tests

`tests/full_text_search.mjs`, `tests/ui_v2_full_text_search.mjs`, `tests/shared_components.mjs` e `tests/spec_contracts.mjs`.
