# Relacionamento e CRM

Status: **CURRENT**

## Purpose

Preservar Contatos como base canônica de pessoas e permitir que Atendimentos/Oportunidades referenciem uma pessoa existente sem criar coleção ou cadastro paralelo de clientes.

## Canonical authority

`js/features/contacts.js`, `js/features/leads.js`, `js/components/modal.js` e `js/portal.js`.

## Invariants

- Cliente continua sendo um papel de Contato; não existe Store separado de clientes.
- Na Agenda, Cliente / partes e Processo pesquisam contatos e processos do Store autenticado. Seleção grava contactId/processId junto ao texto apresentado; digitação livre limpa o ID desse campo. Compromissos antigos sem IDs permanecem válidos, sem associação inferida por nome. Persistência segue o submit e save/flush canônicos da Agenda. Cobertura: tests/agenda_link_search.mjs.
- Em Tarefas, Cliente e Processo usam a mesma busca contextual local. A seleção preserva `contactId`/`processId`; ao selecionar um processo, o formulário completa cliente e tipo de ação disponíveis no cadastro. Texto livre continua aceito e limpa o ID somente do campo alterado. Cobertura: `tests/task_link_search.mjs`.
- Um atendimento pode preservar `contactId` e o nome apresentado do contato selecionado.
- Digitação livre continua aceita para interessado ainda não cadastrado, mas não cria Contato automaticamente.
- Busca e seleção do combobox são locais, acessíveis por teclado e não fazem requests.
- O CRUD canônico de Leads permanece único e não muta Contatos ou Processos.
- Contatos usa lista de largura total e inspector lateral modal em desktop e celular; a leitura não abre nem salva formulário. Clique externo, Escape e X fecham a leitura; a edição mantém a proteção de alterações não salvas do modal compartilhado.
- Combobox abre por ação explícita (clique, digitação ou seta), não pelo foco automático ao abrir o formulário. Enter confirma a seleção sem submeter; Escape fecha primeiro a lista.
- O inspector isola com inert os ramos de fundo do appShell e restaura os atributos que adicionou ao fechar. Modais externos de edição/documentos não são bloqueados por esse isolamento.

## Security boundary

O seletor mostra somente metadados já disponíveis no Store autenticado. Auditoria do atendimento mantém o contrato existente e não passa a registrar documento, telefone, e-mail, endereço ou notas do contato.

## Relevant tests

`tests/leads_feature.mjs`, `tests/ui_v2_leads.mjs` e `tests/ui_v2_leads_accessibility.mjs`.

### Leitura contextual de vínculos

Processos relacionados no contato abrem o inspetor lateral sem trocar a view ativa. Publicações vinculadas em contatos e processos abrem um leitor lateral sobre o contexto de origem, com Voltar e Escape. O leitor resolve o registro pelo ID no Store canônico, exibe texto como texto simples e não altera tratamento, leitura ou ciência judicial. Ao fechar, restaura o foco e o painel anterior. Contrato: `tests/contextual_link_navigation.mjs` e `tests/cross_module_navigation.mjs`.

O rodapé do inspetor processual permite criar uma tarefa sem trocar de view. O formulário recebe o processo, cliente, tipo de ação e seus IDs canônicos; o salvamento continua no fluxo único de Tarefas. Contrato: `tests/process_task_creation.mjs`.
