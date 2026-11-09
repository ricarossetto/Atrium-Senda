# Relacionamento e CRM

Status: **CURRENT**

## Purpose

Preservar Contatos como base oficial de pessoas e permitir que Atendimentos/Oportunidades referenciem uma pessoa existente sem criar coleção ou cadastro paralelo de clientes.

## Canonical authority

`js/features/contacts.js`, `js/features/leads.js`, `js/components/modal.js` e `js/portal.js`.

## Invariants

- Cliente continua sendo um papel de Contato; não existe Store separado de clientes.
- **Vínculo automático conservador** (`lib/contacts/auto-link.mjs`, rodado no fluxo oficial de coleções externas): processo/publicação sem `contactId` recebe vínculo sozinho **apenas** com identidade exata e candidato único — documento com os mesmos dígitos ou nome normalizado idêntico. Homônimos, documento repetido entre contatos, nome genérico/sigiloso, contato adverso e alvo já vinculado (ou com cliente divergente) nunca são sobrescritos: viram pendência de conferência. O vínculo nunca cria contato, preenche `client` apenas quando vazio, registra `autoLinkedBy` + audit sem PII e é idempotente. Cobertura: `tests/contact_auto_link.mjs`.
- Na Agenda, Cliente / partes e Processo pesquisam contatos e processos do Store autenticado. Seleção grava contactId/processId junto ao texto apresentado; digitação livre limpa o ID desse campo. Compromissos antigos sem IDs permanecem válidos, sem associação inferida por nome. Persistência segue o submit e save/flush oficiais da Agenda. Cobertura: tests/agenda_link_search.mjs.
- Em Tarefas, Cliente e Processo usam a mesma busca contextual local. A seleção preserva `contactId`/`processId`; ao selecionar um processo, o formulário completa cliente e tipo de ação disponíveis no cadastro. Texto livre continua aceito e limpa o ID somente do campo alterado. Cobertura: `tests/task_link_search.mjs`.
- Um atendimento pode preservar `contactId` e o nome apresentado do contato selecionado.
- Digitação livre continua aceita para interessado ainda não cadastrado, mas não cria Contato automaticamente.
- Busca e seleção do combobox são locais, acessíveis por teclado e não fazem requests.
- O CRUD oficial de Leads permanece único e não muta Contatos ou Processos.
- Identidade de contato é oficial em `js/core/contact-identity.mjs`: normalização com colapso de espaços, chave por documento/externalId/nome, fusão automática somente com identificador forte compartilhado (homônimos só por nome nunca fundem sozinhos) e religação de referências. Upserts (frontend e coletores) fundem o recebido no registro mais antigo em vez de criar outro; a limpeza de duplicados históricos é papel de `scripts/dedupe-contacts.mjs` (dry-run por padrão, backup automático no `--execute`). Cobertura: `tests/contact_identity.mjs`, `tests/dedupe_contacts_plan.mjs`.
- O funil renderiza no máximo uma página por vez (padrão 100 por página; opções 100, 500 ou 1000 no rodapé). Paginação é preferência de apresentação local, sem Store paralelo, revision, request, auditoria ou timer: busca, estágio e tamanho resetam para a página 1; a navegação entre páginas a preserva. Cobertura: `tests/ui_v2_leads_pagination.mjs`.
- O funil pode ser lido em **Lista** ou **Kanban**. A preferência é local (`atrium:leads:view`), sem Store, revision, request ou timer; a troca só re-renderiza a superfície.
- O **Kanban** agrupa o recorte filtrado integral (busca + estágio) em cinco colunas (`novo`, `em_analise`, `proposta`, `fechado`, `declinado`), com teto de 200 cartões por coluna, contador integral e aviso "Mostrando 200 de N". Estágio desconhecido aparece **e conta** como `novo` (mesmo fallback do chip e do resumo), para nenhum atendimento sumir ou ficar fora do contador; o cartão abre o modal oficial do atendimento.
- Mudança de estágio (arraste entre colunas ou seletor "Mover para") usa mutação direta do lead + `Store.flush()` oficial, com rollback de `status`, `updatedAt` e da entrada de auditoria quando a gravação falha; a auditoria registra "Atendimento movimentado". Cobertura: `tests/ui_v2_leads_kanban.mjs`.
- Contatos usa lista de largura total e inspector lateral modal em desktop e celular; a leitura não abre nem salva formulário. Clique externo, Escape e X fecham a leitura; a edição mantém a proteção de alterações não salvas do modal compartilhado.
- Combobox abre por ação explícita (clique, digitação ou seta), não pelo foco automático ao abrir o formulário. Enter confirma a seleção sem submeter; Escape fecha primeiro a lista.
- O inspector isola com inert os ramos de fundo do appShell e restaura os atributos que adicionou ao fechar. Modais externos de edição/documentos não são bloqueados por esse isolamento.

### Paginação da lista (apresentação)

A lista de Contatos renderiza no máximo uma página por vez para preservar a responsividade com acervos grandes (ex.: 19 mil registros). Paginação é preferência de apresentação local, sem Store paralelo, revision, request, auditoria ou timer.

- Tamanho padrão: 100 por página; opções: 100, 500 ou 1000, no seletor do rodapé da lista.
- Busca, papel, ordenação e tamanho resetam para a página 1; seleção, fechamento do inspector e navegação entre páginas preservam a página atual. A seleção ajusta a página para exibir o contato escolhido. A busca por texto tem debounce de 150 ms (um único render por rajada de teclas).
- O contador do toolbar segue exibindo o total geral; o rodapé exibe `Página X de Y · N no filtro` com navegação Primeira/Anterior/Próxima/Última e estados desabilitados nos limites.
- Filtro+ordenação são reaproveitados entre trocas de página (memo local por referência/tamanho do array, versão de escritas, busca, papel e sort); escritas da feature e hidratacões invalidam o reaproveitamento. Sem worker, sem request, sem timer.
- Cobertura: `tests/ui_v2_contacts_pagination.mjs`.

## Security boundary

O seletor mostra somente metadados já disponíveis no Store autenticado. Auditoria do atendimento mantém o contrato existente e não passa a registrar documento, telefone, e-mail, endereço ou notas do contato.

## Relevant tests

`tests/leads_feature.mjs`, `tests/ui_v2_leads.mjs`, `tests/ui_v2_leads_accessibility.mjs`, `tests/ui_v2_leads_pagination.mjs` e `tests/ui_v2_leads_kanban.mjs`.
Contatos: `tests/ui_v2_contacts.mjs`, `tests/contacts_feature.mjs`, `tests/ui_v2_contacts_accessibility.mjs` e `tests/ui_v2_contacts_pagination.mjs`.

### Leitura contextual de vínculos

Processos relacionados no contato abrem o inspetor lateral sem trocar a view ativa. Publicações vinculadas em contatos e processos abrem um leitor lateral sobre o contexto de origem, com Voltar e Escape. O leitor resolve o registro pelo ID no Store oficial, exibe texto como texto simples e não altera tratamento, leitura ou ciência judicial. Ao fechar, restaura o foco e o painel anterior. Contrato: `tests/contextual_link_navigation.mjs` e `tests/cross_module_navigation.mjs`.

O rodapé do inspetor processual permite criar uma tarefa sem trocar de view. O formulário recebe o processo, cliente, tipo de ação e seus IDs oficiais; o salvamento continua no fluxo único de Tarefas. Contrato: `tests/process_task_creation.mjs`.
