# ATRIUM — Produtividade e relatórios de tarefas

Status: **CURRENT**

## Purpose

Projetar, sobre as tarefas oficiais, os indicadores de produtividade do painel de trabalho e da aba Relatórios — o que foi feito, por quem, em quanto tempo, com que pontuação e com qual alcance de meta — sem criar uma segunda fonte de verdade e sem qualquer inferência jurídica.

## Canonical authority

`js/core/task-performance.js` (agregação pura e CSV), `js/views/ui-v2/performance-chart.js` (gráfico SVG), `js/views/ui-v2/reports-presenter.js`, `js/features/reports.js` e o painel de performance de `js/features/dashboard.js`/`js/views/ui-v2/dashboard.js`. O dado permanece sendo `Store.state.tasks` (ver `specs/task-management.md`); configurações de meta vêm de `Store.state.configuration`.

## Invariants

O painel separado de análise operacional montado na mesma view tem contrato em `specs/operational-analysis.md`: leitura oficial no backend, proposta manual com auditoria e consulta opcional de contagens globais minimizadas. Essa exceção se restringe ao analisador; não envia o relatório/CSV ao modelo nem altera as métricas, filtros, exportação ou ausência de persistência do relatório.

- Painel e relatórios são projeções derivadas e somente leitura: nenhuma mutação de `Store`, nenhuma persistência paralela e nenhum estado de relatório em disco.
- Duração = `completedAt - createdAt`; atraso = `completedAt - deadline` (datas já informadas — o prazo nunca é inferido, conforme `specs/human-deadline-policy.md`). Tempo apontado soma `timeLogs[].minutes`.
- "Quem fez o que" usa `completedBy` ("registrado por", conforme `specs/task-management.md`); é registro da ação no próprio documento da tarefa, não autoridade de sessão do backend.
- Metas: o gráfico usa `configuration.goals[].pointsGoal` (meta da equipe); a tabela-resumo usa `configuration.users[].pointsGoal` por responsável. Meta vazia/zero aparece como ausente e nunca gera "alcance" fabricado.
- Períodos (mês atual, mês anterior, 30/90 dias, personalizado) são calculados no horário local do escritório; o mês atual termina em "hoje".
- Números agregados não mascaram falha de dado: sem base anterior não há variação; tarefa concluída legada sem `completedAt` não entra nas séries nem nos pendentes.

## Allowed operations

- Renderizar o painel de performance no hero do dashboard e a aba Relatórios.
- Filtrar por período, responsável e tipo de atividade; ordenar a tabela-resumo (nome, concluídas, pontos).
- Exportar CSV local (dois blocos: produtividade por responsável e conclusões do período).
- Alternar o gráfico para a tabela acessível equivalente.

## Forbidden operations

- Mutar qualquer coleção a partir do painel/relatórios (inclusive "corrigir" pontos ou datas).
- Inferir prazo, ciência judicial, valoração ou juízo de mérito sobre tarefas/pessoas.
- Enviar dados dos relatórios a qualquer provedor externo (CSV é download local).
- Usar o ranking como sanção individual: é registro operacional derivado do que a equipe já lançou.

## State model

Nenhum estado persistido. Filtros e ordenação vivem em memória da feature; o relatório (`computeProductivityReport`) é recriado a cada renderização a partir do estado oficial. `buildProductivityCsv` produz texto CSV puro (dois blocos, citação RFC 4180 de células com vírgula/aspas).

## Security boundary

- Visível a todos os membros do workspace autenticado: os dados já são do estado oficial compartilhado. Nenhum gate novo de RBAC é fingido no cliente.
- Nenhum egresso de rede; somente `Store` local, `Blob`/`URL.createObjectURL` para o download e o escopo atual do workspace (sem leitura cruzada).

## Failure semantics

- Sem conclusões no período: estado vazio honesto ("Nenhuma tarefa concluída neste período") e o gráfico não é desenhado; a tabela-resumo mostra somente pendentes quando existirem.
- CSV sai mesmo sem linhas (com cabeçalhos dos dois blocos); falha de download é informada por toast de erro sem sucesso presumido.

## Persistence semantics

Nada é salvo. A exportação CSV não grava estado; filtros voltam ao padrão (mês atual, todos) ao recriar a view.

## Relevant tests

`tests/task_performance.test.mjs`, `tests/reports_feature.mjs`, `tests/ui_v2_reports.mjs`, `tests/visual_ui_v2_reports.mjs`, `tests/dashboard_feature.mjs` e `tests/ui_v2_dashboard.mjs`.
