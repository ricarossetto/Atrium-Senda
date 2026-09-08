# Tratamento de publicações

Status: **CURRENT**

## Purpose

Registrar triagem interna de publicações sem confundi-la com ciência judicial oficial.

## Canonical authority

Endpoints de tratamento em `server.mjs`, `js/features/publications.js` e migration v7→v8 em `lib/state-migrations.mjs`.

## Invariants

- Estados: `untreated`, `in_review`, `treated`, `discarded`.
- Transições válidas são decididas no backend com ator autenticado e revision.
- Tratada no ATRIUM não significa ciência no tribunal.
- O início da triagem corrente é ativado explicitamente por "Iniciar acompanhamento de hoje". A data local fica em settings.publicationTrackingSince pelo Store com revisão e flush confirmado.
- O marco é fixo: pendências de dias anteriores ao dia atual, mas posteriores ao marco, continuam visíveis. A descoberta de processos não é restringida.
- Métricas, alertas e Activity Inbox usam esse marco. "Todas as publicações (histórico)" permite consultar registros anteriores sem alterar seu tratamento. Datas desconhecidas continuam visíveis para conferência.

## Allowed operations

- Iniciar análise, marcar tratada, descartar com nota, reabrir e restaurar conforme a máquina de estados.
- Criar tarefa por ação explícita e transacional.
- Quando o DJEN fornecer HTML, preservar o payload original limitado no registro e permitir visualização explícita em iframe sandboxed e download de documento HTML autônomo sanitizado. A versão de texto simples continua sendo a leitura canônica da interface.
- No cadastro manual, pesquisar processo por número, cliente, ação ou tribunal e pesquisar cliente nos contatos cadastrados. A escolha grava `processId`/`contactId`; selecionar o processo também preenche número, cliente e tribunal. Texto livre continua permitido e limpa somente o identificador canônico do campo alterado.

## Forbidden operations

- Pular transição inválida, confiar em ator do frontend ou marcar ciência judicial.
- Inferir prazo ou enviar e-mail automaticamente como efeito do tratamento.
- Inserir `rawHtml` diretamente no DOM ativo, preservar scripts/handlers/formulários ou carregar recursos remotos do conteúdo judicial.

## State model

`untreated → in_review → treated|discarded`, com reabertura/restauração nas rotas canônicas.

## Security boundary

Autenticação, CSRF, revision e ator são verificados no servidor; texto externo é escapado na UI.

## Failure semantics

Transição inválida ou revision divergente retorna conflito e não produz estado/audit parcial.

## Persistence semantics

Transição e audit são gravados atomicamente; metadados contraditórios são removidos.

## Relevant tests

`tests/publications_treatment.mjs`, `tests/publications_feature.mjs`, `tests/publication_task_linking.mjs`, `tests/ui_v2_publications.mjs`, `tests/publication_link_search.mjs`, `tests/decision_html_and_access_key.mjs`.

### Leitura contextual de vínculos

Processos relacionados no contato abrem o inspetor lateral sem trocar a view ativa. Publicações vinculadas em contatos e processos abrem um leitor lateral sobre o contexto de origem, com Voltar e Escape. O leitor resolve o registro pelo ID no Store canônico, exibe texto como texto simples e não altera tratamento, leitura ou ciência judicial. Ao fechar, restaura o foco e o painel anterior. Contrato: `tests/contextual_link_navigation.mjs` e `tests/cross_module_navigation.mjs`.
