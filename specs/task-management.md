# Gestão de tarefas

Status: **CURRENT**

## Purpose

Administrar a mesma fila canônica de tarefas em visualizações adequadas à consulta detalhada e à movimentação do fluxo.

## Canonical authority

`js/features/tasks.js`, `js/views/ui-v2/tasks-presenter.js`, `css/views/ui-v2/tasks.css` e `js/core/store.js`.

## Invariants

- Lista e Kanban apresentam a mesma coleção `Store.state.tasks`; não existe Store, CRUD ou persistência paralela.
- A escolha visual é uma preferência local do navegador e não altera revision, dados jurídicos ou tarefas.
- Lista permite pesquisar, filtrar, ordenar, editar, apontar tempo e mover tarefas pelas mesmas operações canônicas do Kanban.
- Processo e cliente preservam texto e IDs canônicos quando selecionados nos comboboxes do formulário.
- Prazos exibidos são somente datas já informadas. A interface não infere prazo jurídico.

## Failure and persistence semantics

Mudança de etapa usa `moveTask` e seu `Store.flush()` canônico, com rollback e mensagem de erro quando a gravação falha. Busca, filtros, ordenação e preferência visual não gravam o Store.

## Relevant tests

`tests/task_management_modes.mjs`, `tests/task_link_search.mjs`, `tests/tasks_feature.mjs`, `tests/ui_v2_tasks.mjs` e `tests/ui_v2_tasks_accessibility.mjs`.
