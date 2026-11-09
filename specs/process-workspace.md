# Carteira processual (lista)

Status: **CURRENT**

## Purpose

Preservar a lista de Processos como leitura densa da carteira, com busca, ordenação e detalhe lateral, sem criar Store paralelo, request por causa da apresentação ou consulta judicial automática.

## Canonical authority

`js/features/processes.js`, `js/views/ui-v2/processes-presenter.js` e `js/portal.js`.

## Invariants

- Existe uma única feature funcional de Processos; trocar apresentação não altera dados, revision ou regras.
- Busca e ordenação são locais e não fazem requests; abrir o inspector não consulta TJRS (TJRS somente por ação explícita).
- O contador informa o total do recorte (`N de M processos` com busca, `M processos` sem busca).

### Paginação da lista (apresentação)

A lista renderiza no máximo uma página por vez para preservar a responsividade com carteiras grandes. Paginação é preferência de apresentação local, sem Store paralelo, revision, request, auditoria ou timer.

- Tamanho padrão: 100 por página; opções: 100, 500 ou 1000, no seletor do rodapé da lista.
- Busca, ordenação e tamanho resetam para a página 1; a navegação entre páginas preserva a página atual. Cada render fecha o inspector lateral (comportamento pré-existente de busca/ordenação).
- A resolução do cliente exibido usa índice por render (mesma semântica: `===` no id com papel cliente, vínculo único por número normalizado).
- **Selos assistivos (sugestão, nunca dado)**: quando a leitura assistida está ligada, cada processo exibe no máximo dois avisos — tipo de andamento sugerido (com confiança no tooltip e "Conferir providência" quando o andamento parece exigir ação) e lacunas de cadastro (tribunal/órgão, comarca, classe, assunto; placeholders conhecidos contam como ausência). Nada disso altera o processo: nenhum campo é preenchido, nenhuma tarefa/prazo é criada e o nome do cliente não é enviado ao classificador. Cobertura: `tests/ai_classifier.mjs` (C15) e `tests/ui_v2_processes.mjs`.
- O campo de responsáveis do cadastro aceita o combobox com avatares dos integrantes ou texto livre com vários nomes; a identidade oculta (`responsibleUserId`) não integra o processo e o backend continua derivando `responsibleUserIds` dos nomes. O inspetor mostra o avatar do primeiro responsável vinculado, com fallback para o nome quando não há diretório.
- Cobertura: `tests/ui_v2_processes_pagination.mjs`.

## Andamento manual (append-only)

O inspetor do processo permite registrar um **andamento manual** na linha do tempo. O registro é **interno do escritório**: não é ato processual, não cria prazo, não altera `deadlineMode`, não abre ciência e não consulta fonte judicial.

- O item entra no array oficial `process.movements` com `source: 'Interna'`, `manual: true`, `id`/`code` únicos, `date`/`at` iguais à data escolhida, `description`/`name` iguais ao texto e `createdAt`; `lastMovement`/`lastMovementAt` só avançam quando a data é a mais recente.
- A persistência usa o `Store.flush()` oficial com rollback do array, do último andamento e da entrada de auditoria quando o flush falha; não existe coleção, rota ou Store paralelo.
- O modal reutiliza o controlador oficial (`processMovement`), com `appShell` inerte e validação de data e descrição.
- Cobertura: `tests/processes_feature.mjs` e `tests/process_manual_movement.mjs`.

## Security boundary

A lista mostra somente metadados já disponíveis no Store autenticado. Chave de acesso do eproc nunca entra no Store do frontend.

## Relevant tests

`tests/processes_feature.mjs`, `tests/ui_v2_processes.mjs`, `tests/ui_v2_processes_accessibility.mjs`, `tests/visual_ui_v2_processes.mjs`, `tests/ui_v2_processes_pagination.mjs` e `tests/process_manual_movement.mjs`.
