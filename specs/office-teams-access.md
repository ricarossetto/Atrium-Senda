# Escritório, equipes e acesso por processo

Status: **CURRENT com itens FUTURE** — em 3.0.0 o núcleo do modelo está implementado: catálogo de nove papéis e permissões em `lib/office/role-catalog.mjs`; `memberKind` e `permissionOverrides` persistidos por `lib/security.mjs`; resolução de acesso por processo em `lib/office/access-control.mjs`, aplicada em `/api/state`, `POST /api/state`, busca, `/api/documents`, contexto do assistente e eventos; modo `shadow`/`enforced` por workspace; atribuição de equipe e responsáveis com revisão otimista; concessões individuais; offboarding com transferência de carteira e auditoria; escopo privado de OAB com precedência do escritório. Seguem **FUTURE**, com o lote que os entrega: rota `/api/office/roles` e UI de permissões `C` (**Lote B**); contratos `REVISION_CONFLICT`/`PROCESS_UNASSIGNED` e contadores filtrados no servidor (**Lote C**); teste do offboarding, `GET /api/office/access-audit`, `GET/PATCH /api/office/monitoring` e `GET/PATCH /api/me/private-monitoring` (**Lote D**); relatório consolidado e carteira do sócio na UI (**Lote E**). O núcleo do acesso do financeiro segregado está **CURRENT**: `canAccessFinancialEntry` aplica o mesmo predicado em `filterOfficeState` e `mergeVisibleClientState`, e `canWriteFinancial` (E-1c) exige `finance.write` ou `office.manage` para gravar — sem esse direito, a versão oficial de `officeExpenses`/`financialEntries` prevalece por inteiro no flush. Fora de qualquer lote: `captureOwner`/`lastCaptureAt` não serão persistidos — a auditoria de quem capturou fica no log de auditoria. Não use esta spec para anunciar como pronto o que está marcado FUTURE.

## Atualização 6.53.0 (22/10/2026)

- Termos de monitoramento têm `scope: office|private` e `privateOwnerUserId`; a UI permite escolher o escopo.
- Publicações, processos e contatos capturados pelo DJEN são marcados com o escopo; escritório vence por CNJ e captura privada não duplica/atualiza registro office.
- O filtro privado é aplicado em `/api/state`, busca e documentos mesmo no modo `shadow`; gestor com `read_all` não vê conteúdo privado de outro membro.
- O perfil do escritório tem `privateMonitoring: allowed|disabled`; desativar bloqueia novas capturas privadas e preserva os dados existentes.
- Digest de publicações e andamentos exclui `scope: private`.
- Identidade externa por dono em captura privada (`djen:<id>:private:<dono>`); a captura do escritório marca a cópia privada com `captureSuppressed` e `canonicalPublicationId`/`canonicalProcessId`.
- Marcadores e fila de falhas DJEN separados por escopo (`djen-sync.json` e `djen-sync-private.json`).
- `/api/events`, grupos de tarefas repetidas e funil semanal não somam registros privados nem suprimidos.
- Contadores do dashboard, relatório de produtividade, contexto do assistente e exportação de processo usam a projeção do escritório (`js/core/office-scope.js`); o escopo privado fica fora de contadores, relatórios, exportações e contexto de IA.
- Tratamento de publicação fora do escopo do usuário é recusado pelo servidor com `403`.

## Purpose

Definir o modelo oficial de escritório, membros, papéis, equipes, atribuição processual e monitoramento por OAB para que o ATRIUM deixe de ser um conjunto de dados compartilhados por todos os usuários do workspace e passe a aplicar acesso por responsabilidade, com o backend como autoridade.

## Modelo em duas camadas

O ATRIUM tem **um perfil de escritório** e **perfis de membros**. Não são dois logins, dois tenants ou dois Stores.

| Camada | O que é | Quem configura | O que enxerga |
|---|---|---|---|
| **Perfil do escritório** (`workspace`) | Contêiner oficial do escritório: membros, equipes, OABs do escritório, processos, publicações, tarefas, clientes, agenda, financeiro e configurações | Principal e gestores (`office.manage`) | Todo o acervo `office`; não enxerga conteúdo do escopo privado dos membros |
| **Perfil do membro** (`user`) | Vínculo de uma pessoa com o escritório; pode ser advogado (`memberKind: lawyer`) ou funcionário (`memberKind: staff`) | O próprio membro edita seus dados; gestor define papel, equipe e acesso | Apenas o que lhe foi atribuído, concedido ou o que sua permissão permite |

- O **principal** (`office_principal`) é único e não pode ser removido pelo próprio escritório; pode haver **vários gestores** (`office_manager`) ao mesmo tempo.
- O gestor **administra** o escritório e os membros; não “entra” na sessão do membro, não lê o escopo privado e não pratica ato processual em nome dele.
- O perfil de escritório é a autoridade do acervo compartilhado; o perfil do membro é a autoridade do escopo privado e da própria conta.
- `memberKind` não concede acesso por si: um advogado associado e um funcionário paralegal podem ter o mesmo processo atribuído, mas permissões diferentes. O que decide é `officeRoleId` + permissões + atribuição.

## Leitura honesta do estado atual

| Capacidade | Estado atual | Autoridade |
|---|---|---|
| Isolamento entre escritórios | **CURRENT** — cada usuário pertence a um workspace; dados e arquivos são separados por workspace | `specs/multi-workspace-cloud.md`, `lib/security.mjs`, `lib/workspaces/workspace-identity.mjs` |
| Papéis | **CURRENT** — catálogo de nove papéis em `lib/office/role-catalog.mjs`, que carrega os dados em `officeRoleId`; papéis legados (`master_admin`, `admin`, `collaborator`) mapeados por `legacyRoleToOfficeRole` | `lib/office/role-catalog.mjs`, `lib/security.mjs:670-676,753-777` |
| Permissões `C` | **CURRENT no backend, FUTURE na tela** — `permissionOverrides` é persistido por `PATCH /api/office/members/:id` (`lib/security.mjs`) e aplicado por `resolveOfficePermissions`; falta a UI da matriz de permissões (Lote B) | `lib/office/role-catalog.mjs`, `lib/security.mjs` |
| Cadastro de integrante | **CURRENT** — o administrador cria a conta (usuário, senha inicial, tipo, papel e equipes) em `POST /api/auth/register`; o membro ativa com o código de configuração e o código do autenticador, e a conta fica pendente até a aprovação | `lib/security.mjs`, `js/features/configuration.js`, `js/auth.js` |
| Interface de gestão | **CURRENT, parcial** — Configurações > Equipe > Escritório reúne membros, equipes, atribuição e offboarding; faltam a matriz de permissões `C` e a aba de monitoramento | `js/features/configuration.js`, `js/views/ui-v2/configuration-presenter.js` |
| Responsáveis do processo | **CURRENT como fronteira de segurança** — `responsibleUserIds`, `assignedTeamIds` e `accessGrants` são resolvidos por `canAccessProcess` no servidor | `lib/office/access-control.mjs:65`, `lib/http/process-access-routes.mjs` |
| Filtro “apenas meus itens” | **CURRENT somente visual** — não altera RBAC; quem decide é o servidor | `specs/task-management.md` |
| Equipes | **CURRENT** — nome, descrição e integrantes; atribuir a equipe ao processo concede acesso pelo resolvedor | `lib/security.mjs:232-258`, `/api/office/teams`, `/api/processes/:id/assignment` |
| ACL por processo/publicação/tarefa | **CURRENT** — `canAccessProcess`, `canAccessTask`, `canAccessPublication`, `canAccessContact`, `canAccessAgenda`, `canAccessDocument`, `canAccessFinancialEntry` e `canAccessSearchResult` | `lib/office/access-control.mjs:65-226` |
| Financeiro | **CURRENT** — `canAccessFinancialEntry` aplica a mesma decisão em `filterOfficeState` e `mergeVisibleClientState`: `canManageFinance` (`finance.read`/`finance.write`/`office.manage`) vê tudo; sem ela, o lançamento segue o processo vinculado por `canAccessProcess` e, sem vínculo, o autor (`createdByUserId`, carimbado pelo servidor). Gravar exige `canWriteFinancial` (`finance.write`/`office.manage`): sem esse direito, o flush mantém a versão oficial das duas coleções. Campos aditivos opcionais em `officeExpenses[]`/`financialEntries[]`: `processId` (`string \| null`) e `createdByUserId` (`string \| null`); ausência vale `null` e não exige migração | `lib/office/access-control.mjs`, `lib/office/finance-entry-scope.mjs` |
| Perfil privado por OAB | **CURRENT** — termos com `scope: private` e `privateOwnerUserId`, captura separada, `privateMonitoring: allowed|disabled` e deduplicação com precedência do escritório | `lib/office/monitoring-scope.mjs`, `collector/adapters/djen.mjs:206-363`, `js/core/office-scope.js` |
| Offboarding | **CURRENT** — transfere processos e tarefas, protege principal e último gestor, desativa preservando autoria e registra auditoria | `lib/http/office-routes.mjs:55-99` |

O que ainda falta é pontual e está listado abaixo na seção “Pendências por lote”, não no modelo em si.

### Onde configurar hoje (3.0.0)

1. Entre como membro com `office.manage` (principal ou gestor).
2. Abra **Configurações**.
3. No grupo **Equipe**, selecione **Escritório**.
4. O painel mostra membros, equipes e o modo de acesso. O cadastro de membro mostra o QR do autenticador, o segredo manual e o código de configuração para o membro ativar a conta.
5. A ficha do membro permite editar tipo e papel, desligar com transferência de carteira. A atribuição de processo fica no inspetor do processo, cartão **Equipe e acesso**.
6. Ainda **não** existem nessa tela: edição de permissões individuais `C`, aba de monitoramento por OAB e consulta de auditoria de acesso. Essas ações estão nos lotes B, D e seguem sem implementação.

O guia operacional curto, com o que já funciona e o que ainda não funciona, está em `docs/office/GUIA_CONFIGURACAO_ESCRITORIO.md`.

### Jornada alvo do gestor

1. Confirmar o perfil do escritório, principal e gestores.
2. Configurar a(s) OAB(s) do escritório.
3. Cadastrar advogados e funcionários, definindo `memberKind`, papel e equipes iniciais, e aprovar as contas ativadas.
4. Criar equipes por área e revisar seus membros.
5. Para cada processo novo, manual ou automático, definir equipe principal, advogados responsáveis e, se necessário, pessoa extra com acesso.
6. Confirmar a atribuição; sem ela, o processo fica na fila do gestor e não aparece para associados/contratados.
7. Revisar a matriz de acesso e ativar o modo `enforced` quando a cobertura estiver comprovada.

O gestor não precisa repetir a atribuição em toda captura: a atribuição existente é preservada. Uma captura nova de processo não atribuído entra na fila, nunca “chuta” responsável por nome, OAB ou área.

## Decisões confirmadas pelo operador (2026-10-20)

- O gestor **não vê conteúdo** do escopo privado; vê apenas existência e contagens agregadas.
- Sócio **não vê financeiro por padrão**; recebe `finance.read`/`finance.write` por concessão explícita do gestor.
- Associado e contratado **podem criar processo sem autorização prévia**; a criação não depende de aprovação. O criador fica como responsável provisório e o gestor confirma ou altera a atribuição depois.


## Implementado em 6.47.0 (histórico)

A seção abaixo registra a entrega original e permanece válida; o estado consolidado é o da tabela acima.

### Cadastro de membro (substituindo o convite por e-mail)

- O administrador cria a conta em `POST /api/auth/register` (usuário, senha inicial, tipo, papel e equipes); a resposta devolve `setupToken`, QR e segredo manual do TOTP.
- O membro ativa a conta na tela de login (Ativar conta) com o código de configuração e o código de 6 dígitos do autenticador (`POST /api/auth/register/verify`). A conta nasce `pending_approval` e só entra após a aprovação no painel de membros.
- O cadastro direto substitui os antigos convites por e-mail (`TEAM_INVITE`) e por link (`/login#invite=`), retirados da edição aberta: o escritório é local e os membros se cadastam no próprio computador.

### Envolvidos em tarefas e publicações

- Tarefas e publicações exibem um bloco compacto com avatares, primeiros nomes e, quando houver correspondência, a equipe do escritório separada por um divisor.
- Tarefa usa `assigneeUserId`, `followerUserIds` e o responsável textual como fallback; publicação prioriza `responsibleUserIds` do processo vinculado e, sem eles, os advogados da própria publicação, com vínculo por OAB.
- A equipe é derivada da maior correspondência entre os membros identificados e `memberIds` das equipes; é **informativa** e não concede acesso.
- O bloco é somente leitura: não altera responsável, tratamento, prazo, ciência ou ACL.
- A mesma identificação aparece na Gestão de tarefas, na Área de trabalho (lista de tarefas) e na lista de Publicações.

### Papéis, membros e atribuição (6.48.0)

- `lib/office/role-catalog.mjs` define nove papéis, `memberKind` compatível e o catálogo de permissões; `security.json` carrega os dados de `officeRoleId`, `memberKind`, `permissionOverrides` e `isPrincipal` sem quebrar usuários legados.
- O painel Escritório permite editar tipo e papel do membro, convidar com tipo/papel/equipe inicial e ativar/desativar o modo `enforced`.
- `PATCH /api/office/members/:id` exige `members.manage`; só o principal nomeia gestores e o último gestor ativo não pode ser rebaixado. O titular (`office_principal`) não pode ser desativado, removido nem rebaixado: qualquer `status` diferente de `active` e qualquer papel diferente de `office_principal` são recusados com **409**. A transferência de titularidade ainda não existe no produto.
- `PATCH /api/processes/:id/assignment` exige `processes.assign`/`office.manage`, valida equipes e membros ativos, atualiza `assignedTeamIds`, `responsibleUserIds`, `assignmentStatus` e auditoria com revisão otimista.
- O inspetor do processo ganhou o cartão **Equipe e acesso** com equipes, advogados responsáveis e explicação do escopo.
- `GET /api/state` filtra processos, tarefas, publicações/comunicações, contatos, agenda, documentos, leads e financeiro quando o modo é `enforced`; `POST /api/state` preserva registros ocultos e campos de atribuição. Busca e `/api/documents` também filtram.
- O padrão de migração é `shadow`: nada é escondido até o gestor confirmar o relatório de cobertura. A ativação é explícita e reversível.

## Definições

- **Perfil do escritório** (também “conta do escritório”): o workspace/tenant. Não é um segundo login. É o contêiner oficial de membros, equipes, processos, publicações, tarefas, clientes, financeiro e configurações.
- **Perfil do membro**: o usuário autenticado dentro do escritório. Todo membro pertence a exatamente um escritório.
- **Tipo de membro** (`memberKind`): `lawyer` (advogado, com OAB própria) ou `staff` (funcionário/apoio, sem OAB profissional). O tipo orienta a ficha e os defaults, mas não substitui papel, permissão ou atribuição.
- **Papel**: modelo de permissões (`office_manager`, `partner`, `associate`, `contractor`, `paralegal`, `intern`, `finance`, `operations`).
- **Permissão**: capacidade nomeada e verificada no backend (`processes.read_all`, `finance.write`, etc.).
- **Equipe**: agrupamento nomeado de membros, com descrição opcional. Equipe não é papel e não concede permissão administrativa por si só. O modelo persistido hoje é `{ id, workspaceId, name, description, memberIds }` (`lib/security.mjs:232-258`, `publicTeam` em `:2129-2138`): **área e líder não existem como campo**; a descrição faz esse papel. Atribuir a equipe ao processo é o que concede acesso.
- **Atribuição processual**: vínculo explícito entre processo e equipe(s), responsável(is) e concessões individuais.
- **Escopo**: `office` (dados do escritório) ou `private` (dados pessoais do membro, fora da operação do escritório).
- **Gestor**: membro com `office.manage`. Pode haver mais de um; o principal (`office_principal`) é único.

## Princípios invariantes

1. **Um escritório por workspace e um workspace por membro.** Não há compartilhamento entre escritórios.
2. **O escritório é um pool compartilhado governado por gestores**, não um login onipotente. “Acesso total do escritório” é uma permissão explícita, não o padrão.
3. **O processo é a fronteira principal de acesso.** Tarefas, publicações, atendimentos, agenda, documentos e comunicações herdam o acesso do processo quando vinculados a ele.
4. **Atribuição é explícita e auditada.** Nenhum processo novo, manual ou automático, ganha responsável por adivinhação. Processo sem atribuição fica na fila de gestão.
5. **Equipe é um pacote de acesso.** Atribuir uma equipe concede acesso aos membros ativos daquela equipe; remover a equipe revoga o acesso na próxima requisição.
6. **Permissão administrativa não implica acesso jurídico.** `office.manage` governa pessoas e configuração; `processes.read_all` e `finance.read` são permissões separadas.
7. **O escopo privado é pessoal.** O gestor vê que o membro possui monitoramento privado e contagens agregadas, mas não vê conteúdo, CNJ, partes, textos ou clientes do escopo privado. Compartilhar um processo privado com o escritório é ação explícita do dono.
8. **Backend é a autoridade.** Filtro de tela, “meus itens” e seleção de responsável no frontend nunca substituem a verificação do servidor.
9. **Compatibilidade não é permissão.** Papéis legados (`master_admin`, `admin`, `collaborator`) continuam aceitos durante a migração, mas o novo contrato usa `officeRoleId` + permissões.
10. **Nenhuma mudança neste modelo cria prazo, ciência, tratamento automático ou ato processual.** As regras de `specs/human-deadline-policy.md` e `specs/publication-treatment.md` permanecem intactas.

## Papéis e permissões

### Papéis de fábrica

| Papel | Uso | Padrão |
|---|---|---|
| `office_principal` | Titular/controlador do escritório; único; não pode ser removido por outro gestor | todas as permissões, incluindo transferir principal e nomear gestores |
| `office_manager` | Gestor do escritório; pode haver vários | todas as permissões do escritório, exceto as privativas do principal |
| `partner` | Sócio | trabalho nos processos atribuídos/equipes; `processes.read_all` e `finance.read` configuráveis |
| `associate` | Advogado associado | processos/equipes atribuídos; sem financeiro e sem administração por padrão |
| `contractor` | Advogado contratado | apenas processos atribuídos; sem financeiro e sem administração |
| `paralegal` | Funcionário/apoio | tarefas e leitura dos processos atribuídos; tratamento de publicação configurável; sem financeiro |
| `intern` | Estagiário | leitura e tarefas dos processos atribuídos; sem tratamento por padrão |
| `finance` | Financeiro | `finance.read`/`finance.write`; referências mínimas de cliente/processo; sem conteúdo jurídico completo |
| `operations` | Administrativo/operações | configurações e integrações, membros e auditoria conforme delegação; sem conteúdo jurídico ou financeiro por padrão |

`office_principal` e `office_manager` não são a mesma coisa que o `PLATFORM_SUPER_ADMIN` do control plane. O operador da plataforma continua sem acesso a conteúdo jurídico.

Relação com `memberKind`:

- `lawyer`: papéis típicos `partner`, `associate` e `contractor`; pode receber `office_manager`/`office_principal`.
- `staff`: papéis típicos `paralegal`, `intern`, `finance` e `operations`; não recebe OAB profissional nem aparece como advogado responsável de processo.
- Um `staff` pode ser gestor administrativo se tiver `office.manage`, mas continua sem acesso jurídico automático; um `lawyer` associado continua sem financeiro por padrão.
- A interface não deve oferecer papel incompatível com o tipo sem confirmação explícita e justificativa auditada.

### Catálogo inicial de permissões

| Permissão | Efeito |
|---|---|
| `office.manage` | gerir perfil do escritório, membros, papéis e equipes |
| `office.principal` | transferir principal, nomear/remover gestores, última palavra em conflito de gestão |
| `members.manage` | cadastrar, alterar papel, equipes, status e offboarding |
| `roles.manage` | criar/editar papéis e concessões dentro do catálogo |
| `teams.manage` | criar/editar/desativar equipes e membros |
| `processes.read_all` | ler todos os processos do escritório |
| `processes.create` | cadastrar processo; criador fica como responsável provisório até confirmação do gestor |
| `processes.assign` | atribuir equipe, responsáveis e concessões |
| `processes.archive` | arquivar/desarquivar processo |
| `publications.read_all` | ler todas as publicações do escritório |
| `publications.treat` | iniciar análise, tratar ou descartar publicação acessível |
| `tasks.read_all` | ler todas as tarefas do escritório |
| `tasks.assign` | atribuir/reatribuir tarefas |
| `clients.read_all` | ler todos os clientes/contatos do escritório |
| `crm.read_all` | ler todos os atendimentos/leads do escritório |
| `agenda.read_all` | ler toda a agenda do escritório |
| `documents.read_all` | ler todos os documentos do escritório |
| `finance.read` | ler o financeiro do escritório |
| `finance.write` | criar/editar lançamentos financeiros |
| `reports.read_all` | ler relatórios consolidados do escritório |
| `audit.read` | ler a auditoria de acesso e mudanças |
| `integrations.manage` | gerir integrações e cofres |
| `settings.manage` | gerir configurações gerais |
| `ai.use` | usar recursos assistivos dentro do escopo permitido |
| `private_monitoring.self` | habilitar o próprio escopo privado de OAB |

`S` = sim por padrão; `C` = configurável pelo gestor; `N` = não por padrão.

| Permissão | Principal | Gestor | Sócio | Associado | Contratado | Apoio | Estagiário | Financeiro | Operações |
|---|---|---|---|---|---|---|---|---|---|
| `office.manage` | S | S | N | N | N | N | N | N | C |
| `office.principal` | S | N | N | N | N | N | N | N | N |
| `members.invite` | S | S | N | N | N | N | N | N | C |
| `members.manage` | S | S | N | N | N | N | N | N | C |
| `roles.manage` | S | S | N | N | N | N | N | N | N |
| `teams.manage` | S | S | C | N | N | N | N | N | N |
| `processes.read_all` | S | S | C | N | N | N | N | N | N |
| `processes.create` | S | S | S | S | S | N | N | N | N |
| `processes.assign` | S | S | C | N | N | N | N | N | N |
| `publications.read_all` | S | S | C | N | N | N | N | N | N |
| `publications.treat` | S | S | S | S | S | C | N | N | N |
| `tasks.assign` | S | S | S | C | N | N | N | N | N |
| `clients.read_all` | S | S | C | N | N | N | N | S | N |
| `crm.read_all` | S | S | C | C | N | N | N | N | N |
| `finance.read` | S | S | C | N | N | N | N | S | N |
| `finance.write` | S | S | C | N | N | N | N | S | N |
| `audit.read` | S | S | C | N | N | N | N | N | S |
| `integrations.manage` | S | S | N | N | N | N | N | N | C |
| `settings.manage` | S | S | N | N | N | N | N | N | S |
| `ai.use` | S | S | S | S | S | S | N | N | N |
| `private_monitoring.self` | S | S | S | S | S | C | C | N | N |

Esta matriz reproduz o `defaultPermissions` de `lib/office/role-catalog.mjs:33-97`: `S` aparece onde a permissão está no padrão do papel; `C` marca o que o papel não recebe por padrão e pode receber por concessão; `N` é o que não se aplica.

`processes.archive`, `tasks.read_all`, `agenda.read_all`, `documents.read_all` e `reports.read_all` não entram no padrão de nenhum papel além de principal e gestor; ficam disponíveis apenas por concessão explícita (`permissionOverrides`).

Permissões `C` são ajustáveis pelo gestor, mas **ainda não pela tela**. O backend já aceita a lista em `PATCH /api/office/members/:id`: `updateOfficeMember` (`lib/security.mjs:753-777`) grava `permissionOverrides` filtrado por `OFFICE_PERMISSIONS`, e `resolveOfficePermissions` aplica o resultado. A ficha do membro hoje edita apenas tipo e papel; a matriz de permissões `C` é o Lote B. Toda alteração de membro entra na auditoria como atualização de membro. Nenhum papel pode receber permissão fora do catálogo.

## Atribuição processual

### Campos oficiais

O processo continua no Store oficial. Os campos abaixo são **aditivos** aos atuais:

- `scope`: `office` (padrão) ou `private`.
- `privateOwnerUserId`: obrigatório quando `scope = private`; ausente no escritório.
- `responsibleUserIds`: já existe; continua sendo a lista de responsáveis explícitos, teto 10.
- `assignedTeamIds`: equipes responsáveis, na ordem de prioridade; a primeira é a principal.
- `accessGrants`: concessões individuais `{ userId, reason, grantedBy, grantedAt, expiresAt? }`.
- `assignmentStatus`: `unassigned`, `provisional` ou `assigned`.
- `canonicalProcessId`: usado apenas em registro privado que foi superado por um processo do escritório.
- `captureOwner`: `office` ou `private:<userId>`; descreveria quem atualiza o processo nas capturas. **Não será persistido** — decisão de arquitetura registrada abaixo. Existe apenas como variável local `captureOwnerUserId` em `collector/adapters/djen.mjs:206`; o campo persistido é `privateOwnerUserId`.
- `lastCaptureAt`: data/hora da última captura que tocou o registro. **Não existe e não será criado**; a data disponível é a do registro e a da última versão no app-state.

Por que `captureOwner` não vira campo persistido: auditar "quem capturou" é responsabilidade do log de auditoria, não do registro do processo. O acesso já se resolve com `privateOwnerUserId` no escopo privado e com `scope: office` no escritório. Guardar o autor da captura no processo duplicaria a auditoria e criaria um campo que envelhece com a última captura. O Lote C **não** cria esse campo.

`responsibleUserIds` e `assignedTeamIds` são metadados de atribuição, não a única checagem. O servidor resolve o acesso por uma função única, coberta por testes.

### Resolução de acesso

```
canAccessProcess(user, process):
  se process.workspaceId != user.workspaceId: negar
  se user tem office.manage ou processes.read_all: permitir
  se process.scope = private: permitir somente se privateOwnerUserId = user.id
  se user.id está em responsibleUserIds: permitir
  se user pertence a alguma assignedTeamIds ativa: permitir
  se há accessGrants ativo para user.id: permitir
  negar
```

- `canAccessTask`: tarefa acessível se o processo vinculado for acessível **e** o usuário for `assigneeUserId`, `followerUserIds`, responsável do processo ou tiver `tasks.read_all`. Atribuir tarefa a quem não tem acesso ao processo exige `tasks.assign` + concessão explícita; sem isso, a atribuição é recusada.
- `canAccessPublication`: publicação acessível se o processo vinculado for acessível; publicação sem processo só é visível para gestores/`publications.read_all` e para a fila de triagem.
- `canAccessContact`: contato acessível se vinculado a processo acessível, se for lead de propriedade do usuário ou se o usuário tiver `clients.read_all`/`crm.read_all`.
- `canAccessAgenda`: evento acessível se vinculado a processo acessível, se for do próprio usuário ou se tiver `agenda.read_all`.
- `canAccessDocument`: documento acessível se vinculado a processo/contato acessível ou se tiver `documents.read_all`.
- `canManageFinance` governa **leitura**: `finance.read`, `finance.write` ou `office.manage`. Acesso ao processo **não** concede financeiro. Complementa-o `canAccessFinancialEntry`, que aplica o mesmo predicado em `filterOfficeState` e `mergeVisibleClientState`.
- `canWriteFinancial` governa **gravação** de `officeExpenses`/`financialEntries`: exige `finance.write` ou `office.manage`. `finance.read` sozinho não grava. Sem esse direito, o merge do flush (`mergeVisibleClientState`) e `saveClientAppState` mantêm a versão oficial das duas coleções por inteiro — ler não é gravar. A assimetria "quem grava também lê" é intencional: não faz sentido gravar o que não se pode ver.
- `search` e contadores aplicam o mesmo filtro antes de retornar. Não basta esconder no frontend.
- Notificações e boletins usam a mesma audiência. Evento sem processo/responsável vai para gestores e para quem tem `processes.assign`, **não** para todos os membros. Isso substitui o fallback atual de “sem vínculo, todos recebem”.

### Processo novo

- Processo capturado automaticamente: entra como `scope: office`, `assignmentStatus: unassigned`; fica visível para gestores e para `processes.assign`. Não aparece para associados/contratados até atribuição.
- Processo manual criado por membro com `processes.create`: **não exige autorização prévia**; o criador vira responsável provisório (`assignmentStatus: provisional`) e o gestor confirma ou troca a equipe/responsáveis depois. Se o criador não puder ser responsável, o processo nasce `unassigned`.
- Processo já existente: a atribuição é preservada; nova captura não troca responsáveis.
- Processo privado: não entra na fila do escritório e não é contado nos painéis do escritório, exceto em contagem agregada de “monitoramento privado ativo”, sem conteúdo.

## Conclusão de tarefa e notificações

Regra de produto:

- Ao concluir uma tarefa, ela sai da **fila ativa** de todos (lista de abertas, contadores de abertas e coluna de andamento), mas **não é apagada**. Permanece no histórico/“Concluídas” para quem tem acesso ao processo e para a auditoria.
- A transição é autoritativa no backend, com ator da sessão; `completedBy` não pode ser a única prova de autoria. Reabrir e concluir de novo gera um novo evento de conclusão.
- **Notificação no sistema:** os envolvidos recebem uma notificação imediata e durável no central de notificações, com link para a tarefa concluída. “Envolvidos” é a união de:
  - `assigneeUserId`;
  - `followerUserIds`;
  - `responsibleUserIds` do processo vinculado;
  - membros ativos das equipes atribuídas ao processo;
  - criador da tarefa, quando distinto.
  - Sem nenhum envolvido resolvido, a notificação vai para gestores/`tasks.assign`, nunca para o escritório inteiro.
- **E-mail:** um único e-mail consolidado por destinatário, às **19h BRT**, com todas as conclusões do recorte desde o último digest. É **separado do resumo/boletim** de publicações; não entra no boletim das 20h. Sem conclusões no recorte, não há e-mail. A falha de entrega é registrada e não vira sucesso presumido.
- O e-mail contém apenas: título da tarefa, quem concluiu, data/hora, processo/cliente quando acessíveis e link. Não contém texto judicial completo, anexo, prazo inferido ou instrução de ato.
- A notificação e o e-mail respeitam o acesso do destinatário; trocar responsável/equipe depois da conclusão não reenvia o evento para quem perdeu acesso.
- Isso não altera prazo, `fatalDeadline`, tratamento de publicação, ciência judicial ou tarefa de conferência.

Implementação 6.45.3:

- O flush do cliente detecta a transição para `concluida`, o backend grava `completedBy` com o ator da sessão e emite `TASK_COMPLETED`.
- A central consulta `/api/notifications/inbox` e o digest das 19h é enfileirado pelo scheduler de notificações.
- O evento não entra no boletim das 20h e não altera prazo, tratamento ou ciência.
- A fila ativa esconde a tarefa concluída para todos; o histórico continua disponível para quem tem acesso.

## Cadastro e ciclo de vida do membro

### Cadastro de membro

- O administrador cria a conta com usuário, nome, e-mail, senha inicial, tipo, papel e equipe(s) inicial(is) em `POST /api/auth/register` (CSRF + admin; o papel e a permissão concedidos não podem exceder os do ator).
- A resposta mostra QR code, segredo manual do TOTP e código de configuração (válido por 10 minutos); o administrador entrega esses dados ao membro.
- O membro ativa a conta na tela de login (**Ativar conta**) com o código de configuração e o código de 6 dígitos do autenticador (`POST /api/auth/register/verify`, uso único, com limite de tentativas).
- A conta nasce `pending_approval`; o administrador aprova no painel de membros (`POST /api/auth/users/manage`). A aprovação é passo obrigatório — ativação sem aprovação não concede acesso.
- Substitui os antigos convites por e-mail e por link, que ficavam reservados ao produto hospedado (colaboração multi-máquina).

### Ciclo de vida

- Desativar membro: bloqueia login, preserva autoria histórica, retira de equipes ativas e mantém registros.
- Remover membro: exige `members.manage`, step-up/CSRF e plano de transferência de processos/tarefas; nunca apaga autoria.
- Último gestor ativo não pode ser removido, rebaixado ou desativado. O titular não pode ser desativado, removido nem rebaixado por nenhum caminho — diretório (`PATCH /api/office/members/:id`), desligamento (`/offboard`), gestão de usuários (`POST /api/admin/users/role`, `/api/auth/users/manage`) ou auto-exclusão (`POST /api/auth/profile/delete`). A recusa é **409** com a mensagem de proteção do titular (`lib/office/role-catalog.mjs`, `PRINCIPAL_PROTECTION_MESSAGE`), aplicada pelo predicado `assertPrincipalMutationAllowed`. A transferência de titularidade é escopo separado e **ainda não está disponível**.
- Offboarding: lista processos/tarefas do membro; gestor escolhe novos responsáveis/equipes; a transferência é auditada e o membro perde acesso ao concluir. **CURRENT** (`lib/http/office-routes.mjs:110-156`): protege o titular (`:120`) e o último gestor (`:121-122`), transfere `responsibleUserIds`/`assigneeUserId`/`followerUserIds` (`:125-152`), desativa preservando autoria (`:153`) e grava auditoria (`:154`). A UI fica em `js/features/configuration.js:426,587-591`.
- Toda mudança de papel, equipe, concessão ou status entra na auditoria com ator, alvo e antes/depois, sem PII desnecessária. **CURRENT:** os eventos são gravados em `lib/http/office-routes.mjs:56,67,89,99,106,154,177,185,212` e `lib/http/process-access-routes.mjs:95-99,128`; a consulta paginada (`GET /api/office/access-audit`) está no Lote D.

## Monitoramento por OAB e escopo privado

### Escopo do escritório

- O escritório tem uma lista `officeOabs`; uma OAB é primária e as demais são adicionais, se o escritório optar por mais de uma. **Estado real em 3.0.0:** `officeOabs` **não existe**; a OAB do escritório continua sendo editada como termo em `appState.terms`. A lista explícita e as rotas `GET/PATCH /api/office/monitoring` entram no Lote D.
- A captura do escritório usa **somente** as OABs configuradas em `officeOabs`. Não adiciona automaticamente a OAB de cada membro. No caso de um escritório com uma única OAB principal, todas as varreduras do escritório usam essa inscrição; o sistema não deve varrer também a OAB pessoal de cada advogado.
- A OAB do principal é apenas o valor inicial sugerido; o gestor confirma a lista. A OAB de um membro nunca vira OAB do escritório por inferência.
- Processos e publicações capturados por OAB do escritório pertencem ao escopo `office`.
- O membro que também é advogado pode ter sua própria OAB privada, mas ela fica no escopo `private` e não amplia a varredura do escritório.

### Escopo privado

- Cada membro pode habilitar `privateMonitoring` com uma ou mais OABs próprias, se `private_monitoring.self` e a política do escritório permitirem.
- Processos privados têm `scope: private` e `privateOwnerUserId`; somente o dono os vê, além de contagens agregadas para o gestor.
- Se a OAB privada for igual a uma OAB do escritório, o sistema recusa a duplicação e explica que o monitoramento já é do escritório.
- O escritório pode desabilitar o escopo privado por política (`privateMonitoring: disabled`), mas isso não apaga dados privados existentes; apenas impede novas capturas.

### Deduplicação e precedência

A identidade oficial é o número CNJ normalizado. A regra é **escritório vence**:

1. Captura do escritório cria/atualiza o processo `office`.
2. Captura privada de um CNJ que já existe no escritório **não cria duplicata e não atualiza** o registro do escritório. Registra `captureDecision: skipped_office_owned` e, se o membro não tiver acesso ao processo do escritório, informa apenas “já monitorado pelo escritório; solicite acesso ao gestor”.
3. Captura do escritório de um CNJ que existe apenas em escopo privado cria/promove o processo `office`, marca o registro privado com `canonicalProcessId` e `captureSuppressed: true`, preserva notas/histórico privado e entra na fila de atribuição do gestor.
4. Duas capturas privadas do mesmo CNJ por membros diferentes permanecem separadas por dono; não há compartilhamento automático entre escopos privados. Essa é uma limitação consciente de privacidade, não um bug.
5. Publicações seguem a mesma identidade oficial; uma publicação já absorvida pelo escritório não é duplicada no privado.
6. `captureOwner` e `lastCaptureAt` não existem como campo persistido e **não serão criados**: a auditoria de "quem capturou" fica no log de auditoria, e o acesso já se resolve com `privateOwnerUserId`. O job privado pode consultar a OAB, mas o ingestor descarta o CNJ já pertencente ao escritório. **Estado real em 3.0.0:** existe apenas `captureOwnerUserId`, variável local do adaptador (`collector/adapters/djen.mjs:206`); o campo persistido é `privateOwnerUserId`.
7. O agendador executa primeiro o escritório e depois os escopos privados; falha de um escopo não contamina o outro. Cada escopo tem marcador e fila de falhas próprios.

`captureDecision` tem **seis valores reais** no código (`collector/adapters/djen.mjs`): `skipped_office_owned` (`:242-243,326`), `skipped_private_other_owner` (`:246,329`), `skipped_private_without_owner` (`:241`), `historical` (`:340`), `added` (`:375`) e `updated` (`:388`). A versão anterior desta spec previa quatro valores — `created`, `updated`, `skipped_office_owned` e `promoted_to_office` — dos quais `created` e `promoted_to_office` não existem: a criação é reportada como `added` e a promoção do privado para o escritório é reportada como `added` no escopo do escritório, com o registro privado marcado por `captureSuppressed`/`canonicalProcessId`.

### Migração do modelo atual

- `appState.terms` existentes migram para `scope: office`, `ownerUserId: null`, preservando IDs e configuração.
- O termo primário criado automaticamente a partir do usuário autenticado deixa de ser recriado em todo login; passa a ser um item do escritório confirmado pelo gestor.
- Processos existentes recebem `scope: office` e `assignedTeamIds: []`; `responsibleUserIds` é preservado.
- Nenhum processo é apagado, fundido ou reatribuído automaticamente. Processos sem responsável entram no relatório de cobertura.

## API alvo

Rotas novas usam sessão autenticada, CSRF em mutação e verificação de permissão no backend. Rotas legadas permanecem como alias de compatibilidade durante a migração.

| Rota | Situação | Uso |
|---|---|---|
| `GET /api/office` | **existente** (`lib/http/office-routes.mjs:20-29`) | perfil do escritório, membros, equipes, papel atual e permissões da sessão |
| `PATCH /api/office` | **existente** (`lib/http/office-routes.mjs:30-43`) | modo de acesso (`shadow`/`enforced`) e política `privateMonitoring` |
| `GET /api/office/members` | **futura** (Lote B) | diretório com papel, equipes, status e carga; hoje os membros vêm em `GET /api/office` |
| `PATCH /api/office/members/:id` | **existente** (`lib/http/office-routes.mjs:157-179`) | papel, tipo, equipes e status; recusa **409** para o titular |
| `POST /api/office/members/:id/offboard` | **existente** (`lib/http/office-routes.mjs:110-156`) | plano de transferência e desligamento; recusa **409** para o titular |
| `GET/POST/PATCH/DELETE /api/office/roles` | **futura** (Lote B) | papéis e catálogo de permissões; hoje o catálogo é fixo em `lib/office/role-catalog.mjs` |
| `GET/POST /api/office/teams` e `PATCH/DELETE /api/office/teams/:id` | **existente** (`lib/http/office-routes.mjs:44-54,116-130`) | equipes, líder e membros |
| `GET/POST/DELETE /api/auth/invitations` | **existente** (`lib/http/invitation-routes.mjs:6-11`) | convites e status de entrega. A rota vive em `/api/auth/invitations`; `/api/office/invitations` não existe |
| `POST /api/auth/invitations/resend` | **existente** | novo token e novo envio |
| `PATCH /api/processes/:id/assignment` | **existente** (`server.mjs:5701`, `lib/http/process-access-routes.mjs:49-130`) | equipe(s), responsáveis e status de atribuição, com revisão otimista. O método é `PATCH`; a versão anterior desta spec grafava `POST` |
| `POST /api/processes/:id/access-grants` | **existente** (`server.mjs:5702`) | concessão individual com motivo/validade |
| `DELETE /api/processes/:id/access-grants/:userId` | **existente** (`handleProcessAccessRevoke`) | revogação |
| `GET/PATCH /api/office/monitoring` | **futura** (Lote D) | OABs do escritório; hoje a OAB é editada como termo em `appState.terms` e não existe `officeOabs` |
| `GET/PATCH /api/me/private-monitoring` | **futura** (Lote D) | OABs privadas do próprio membro. Nenhuma rota `/api/me/*` existe hoje |
| `GET /api/office/access-audit` | **futura** (Lote D) | auditoria de acesso paginada. Os eventos já são gravados; falta só a consulta |

Contratos de erro:

- `403 FORBIDDEN`: membro do mesmo escritório sem permissão; não retorna conteúdo.
- `404 NOT_FOUND`: recurso inexistente ou de outro escritório; não revela existência.
- `409 LAST_MANAGER`: tentativa de remover/rebaixar o último gestor. **CURRENT** (`lib/http/office-routes.mjs:121-122`, resposta `409`).
- `409` de proteção do titular: tentativa de desativar, remover ou rebaixar o titular (`office_principal`) por qualquer caminho — `PATCH /api/office/members/:id`, `/offboard`, `POST /api/admin/users/role`, `POST /api/auth/users/manage` e `POST /api/auth/profile/delete`. **CURRENT** — predicado `assertPrincipalMutationAllowed` (`lib/office/role-catalog.mjs`), resposta `409` com `PRINCIPAL_PROTECTION_MESSAGE` e sem campo `code` próprio. A transferência de titularidade não existe nesta versão.
- `409 ROLE_ESCALATION`: tentativa de conceder papel/permissão acima do convidante. **FUTURE — Lote B.**
- `409 TEAM_IN_USE`: exclusão de equipe ainda atribuída a processo. **CURRENT** — `teamInUseInState` (`lib/office/access-control.mjs`) varre todos os processos do workspace, inclusive `scope: private`, e o predicado é injetado em `deleteTeam`; sem predicado a exclusão é recusada (`lib/security.mjs`).
- `409 PROCESS_UNASSIGNED`: operação que exige processo atribuído. **FUTURE — Lote C.**
- `409 REVISION_CONFLICT`: atribuição concorrente; o cliente relê o processo. **FUTURE — Lote C.** Hoje a revisão otimista da atribuição devolve conflito pela checagem existente, sem código de erro próprio.

## Pendências por lote

| Item | Estado | Lote |
|---|---|---|
| `GET/POST/PATCH/DELETE /api/office/roles` e UI de permissões `C` | FUTURE | B |
| `409 ROLE_ESCALATION` no convite e na edição de papel | FUTURE | B |
| `captureOwner` e `lastCaptureAt` persistidos | NÃO SERÁ — auditoria de captura vai para o log de auditoria; acesso usa `privateOwnerUserId` | — |
| `409 REVISION_CONFLICT`, `409 PROCESS_UNASSIGNED` | FUTURE | C |
| Contadores do dashboard filtrados no servidor (hoje o filtro é no cliente: `js/features/dashboard.js:277-281,466,508,597-602`, `js/features/reports.js:65`, `js/portal.js:859-862`, via `js/core/office-scope.js`) | FUTURE | C |
| `deleteTeam` conferir equipe atribuída antes de excluir (`409 TEAM_IN_USE`) | CURRENT | C |
| Cobertura de teste do offboarding (hoje nenhum arquivo em `tests/` exercita `offboard`) | FUTURE | D |
| `GET /api/office/access-audit` | FUTURE | D |
| `GET/PATCH /api/office/monitoring` e `GET/PATCH /api/me/private-monitoring` | FUTURE | D |
| Financeiro segregado por responsável do processo — **núcleo do acesso** | CURRENT (E-1a) | E |
| Financeiro segregado — exigir `finance.write` para gravar (`canWriteFinancial`) | CURRENT (E-1c) | E |
| Financeiro segregado — relatório consolidado e carteira do sócio na UI | FUTURE | E |

## Persistência e migração

- **Identidade, papéis, equipes e convites**: `security.json` do workspace (autoridade de autenticação/RBAC). Não criar Store paralelo.
- **Processo, atribuição, escopo e termos de monitoramento**: `app-state.json` oficial, pelo caminho de mutação/revision existente.
- **Auditoria**: audit oficial do workspace, com eventos de membro, papel, equipe, convite, atribuição, concessão e escopo privado.
- Migração aditiva `v12 -> v13`: campos de processo, termos e política de acesso. Backup pré-migração obrigatório. Nenhum campo existente é removido.
- **Campos de processo ausentes por decisão:** `captureOwner` e `lastCaptureAt` não são persistidos e não entram no Lote C; a auditoria de captura fica no log de auditoria e o acesso usa `privateOwnerUserId`. `captureDecision` grava seis valores (`added`, `updated`, `historical`, `skipped_office_owned`, `skipped_private_other_owner`, `skipped_private_without_owner`).
- `security.json` recebe migração idempotente e tolerante a campos ausentes; papéis legados são mapeados para o novo modelo.
- Modo de acesso por workspace: `shadow` (padrão da migração; calcula e mostra cobertura, não bloqueia) e `enforced`. A virada para `enforced` é ato do gestor, com relatório de processos sem atribuição e confirmação.
- Rollback: manter `enforced` reversível para `shadow`; redeployar o SHA anterior; a migration aditiva permanece compatível.

## UI alvo

A gestão precisa sair do control plane e ficar encontrável. **Estado atual (3.0.0):** a tela existe em **Configurações > Equipe > Escritório**, em um painel único com membros, convites, equipes, catálogo de papéis e modo de acesso. Não há abas. O desenho abaixo é o alvo, não a tela de hoje.

- **Configurações > Escritório** com abas: Visão geral, Membros, Convites, Papéis e permissões, Equipes, Monitoramento, Auditoria de acesso.
- Atalho “Gerenciar escritório” no menu do perfil para quem tem `office.manage`.
- Estado vazio explícito: “Seu escritório ainda não tem membros/equipes” + “Convidar primeira pessoa”.
- Convite: formulário com nome, e-mail, papel, equipes e checkbox “Enviar por e-mail”; depois, status e link de fallback.
- Membro: papel, equipes, permissões `C`, carga, status e ações de desligamento.
- Papéis: matriz de permissões com explicação de risco; alterações exigem confirmação e auditoria.
- Equipes: nome, descrição, membros e processos atribuídos. Área e líder só entram se o modelo persistir esses campos; hoje a equipe não os tem.
- Processo: card “Equipe e acesso” no inspetor, com equipe principal, equipes adicionais, responsáveis e concessões. Somente `processes.assign` edita.
- Monitoramento: “OAB do escritório” (gestor) e “Meu monitoramento privado” (membro), com aviso de deduplicação e de que OAB de membro não entra automaticamente no escritório.
- Processo privado: selo “Privado”, sem contagem nos painéis do escritório; gestor vê apenas “monitoramento privado ativo”, sem conteúdo.
- A interface deve seguir `docs/ui-v2/VISUAL_IMPLEMENTATION_GUIDE.md`, com light/dark, 390/860/1440/1920, foco, teclado e estados reais.

## Segurança e privacidade

- Toda leitura e mutação passa por uma função de autorização única; nenhuma rota confia em `role`, `userId` ou lista de IDs enviada pelo frontend.
- CSRF, rate limit, step-up quando aplicável, revisão otimista e auditoria continuam obrigatórios.
- Escopo privado não entra em busca global, contadores, boletins, relatórios, exportações ou contexto de IA do escritório.
- Gestor não pode “assumir” a sessão de um membro. Suporte de plataforma continua separado e sem conteúdo jurídico.
- Convite não contém senha, token não é persistido em claro, link usa fragmento e é removido após o aceite.
- Nenhum e-mail de convite contém conteúdo judicial, anexo ou detalhe de permissão.
- Logs e auditoria não registram texto judicial, CPF/CNPJ, token ou conteúdo privado.

## Não objetivos

- Não alterar prazos, ciência, tratamento, tarefas automáticas ou atos processuais.
- Não treinar modelo com dados de clientes.
- Não criar segundo Store, segundo backend ou banco externo.
- Não permitir compartilhamento entre escritórios.
- Não transformar o control plane da plataforma em ferramenta de leitura jurídica.
- Não implementar papéis com permissões arbitrárias fora do catálogo.

## Critérios de aceite

1. Gestor consegue convidar por e-mail e por link, com papel e equipe iniciais; o convite aceito cria o membro com o papel/equipe corretos.
2. Associado vê apenas processos, tarefas, publicações, contatos e agenda dos processos atribuídos. No financeiro, vê os lançamentos dos processos que pode acessar e os próprios lançamentos sem vínculo; os demais não aparecem, e o merge do cliente não os reintroduz. Gravar lançamento exige `finance.write` ou `office.manage` (`canWriteFinancial`); quem não grava mantém a versão oficial no flush.
3. Gestor vê o escritório inteiro e consegue atribuir equipe, responsáveis e concessões.
4. Atribuir uma equipe concede acesso aos membros ativos; remover a equipe revoga na próxima requisição.
5. Processo automático sem atribuição não aparece para associado; aparece na fila do gestor.
6. Busca, contadores, notificações e boletins respeitam o mesmo acesso.
7. OAB do escritório captura uma vez; OAB privada do mesmo CNJ não cria duplicata nem atualiza o processo do escritório.
8. Processo privado não aparece para outro membro nem para o gestor; gestor vê apenas contagem agregada.
9. Último gestor não pode ser removido/rebaixado; principal só transfere para membro ativo.
10. Toda mudança de papel/equipe/atribuição aparece na auditoria com ator e antes/depois.
11. Concluir tarefa remove da fila ativa de todos, preserva histórico e notifica todos os envolvidos no sistema.
12. O e-mail de conclusões é único por destinatário, sai às 19h BRT, separado do resumo, e não duplica em retry.
13. Migração preserva dados, `responsibleUserIds` e autoria; modo `shadow` não esconde dados sem confirmação.
14. Rollback para `shadow` e para o SHA anterior é documentado e testado.
15. Matriz visual e de teclado aprovada em light/dark, 390/860/1440/1920, sem overflow, corte ou ação encoberta.
16. O gestor encontra **Configurações > Equipe > Escritório** sem depender de documentação externa e entende, na própria tela, o que já está ativo e o que é próxima fase.
17. Um processo novo, manual ou automático, só aparece para associado/contratado depois de atribuição explícita; a fila de processos sem atribuição é visível ao gestor.
18. Um convite informa `memberKind`, papel e equipe iniciais — **CURRENT** desde 6.48.0 (`lib/security.mjs:308-338`).

## Relevant tests

Existentes que cobrem o domínio (nomes reais em 3.0.0):

- `tests/office_access_resolver.test.mjs` — matriz do resolvedor de acesso.
- `tests/office_teams_http.test.mjs` — CRUD de equipes, vínculo de membros e `409 TEAM_IN_USE` na exclusão de equipe atribuída.
- `tests/office_invite_email.test.mjs` — convite por e-mail e link manual (substitui o nome original `office_invitations_email`).
- `tests/office_access_http.test.mjs` — atribuição HTTP e revisão otimista (substitui o nome original `process_assignment_http`).
- `tests/office_monitoring_scope.test.mjs` — deduplicação do escopo privado (cobre o que a lista original chamava de `private_monitoring_dedup`).
- `tests/private_scope_write_isolation.test.mjs` — isolamento de escrita do escopo privado.
- `tests/ui_v2_second_member_isolation.mjs` — vazamento entre dois membros na UI V2 (cobre `office_scope_leakage` e `ui_v2_process_access`).
- `tests/ui_v2_office_panel.test.mjs` — painel Escritório na UI V2 (substitui `ui_v2_office_members`).
- `tests/visual_ui_v2_configuration_admin.mjs` — cobertura visual parcial do antigo `visual_ui_v2_office_access`.
- `tests/task_completion_notifications.test.mjs` — conclusão de tarefa e digest das 19h (cobre `task_completion_digest`).

Também relevantes, já existentes: `tests/multi_workspace.mjs`, `tests/security.mjs`, `tests/task_delegation.test.mjs`, `tests/ui_v2_tasks.mjs`, `tests/ui_v2_processes.mjs`, `tests/publications_treatment.mjs`, `tests/notification-audience.test.mjs`, `tests/state_migrations.mjs`, `tests/backup_restore.mjs`, `tests/spec_contracts.mjs`.

A criar, com o lote responsável:

- `tests/office_roles_http.test.mjs` — rotas `/api/office/roles`, matriz de permissões e `409 ROLE_ESCALATION` (**Lote B**).
- `tests/office_access_migration.test.mjs` — migração aditiva de atribuição e escopo, com backup/restauração (**Lote C**).

Nenhum arquivo de teste existente deve ser renomeado: os registros em `tests/run-all.mjs:533-540,885-892,911-912,179-180,814,819` apontam para os nomes atuais.

## Referências

- `specs/multi-workspace-cloud.md` — isolamento entre escritórios.
- `specs/security-boundaries.md` — RBAC, CSRF, sessão e step-up.
- `specs/process-workspace.md` — carteira e responsáveis atuais.
- `specs/task-management.md` — delegação e filtro “meus itens”.
- `specs/publication-treatment.md` — tratamento e vínculo por OAB atual.
- `specs/email-policy.md` — pipeline transacional e limites de e-mail.
- `docs/development/PLAN_OFFICE_TEAMS_ACCESS.md` — plano de implantação.

## Atualização 6.63.3

Passam a CURRENT os itens abaixo, que as tabelas anteriores desta spec ainda listam como futuros:

- `GET /api/office/access-audit`: auditoria de acesso paginada (`audit.read`).
- `GET/PATCH /api/office/monitoring` (`office.manage`) e `GET/PATCH /api/me/private-monitoring`: OABs do escritório e OABs privadas do próprio membro. O dono do termo privado vem da sessão.
- `GET /api/office/hygiene`: processos que apontam para equipe apagada. É só relatório; não altera nada.
- `GET /api/office/finance/portfolio`: carteira consolidada por responsável (`finance.read`). Ainda sem tela.
- `POST /api/office/principal/transfer`: transferência de titularidade, só pelo titular e com reautenticação. O anterior vira gestor e as sessões dos dois são encerradas. Fora dela, conceder `office_principal` responde `409 PRINCIPAL_TRANSFER_REQUIRED`.
- `409 LAST_MANAGER` e `409 REVISION_CONFLICT` têm código formal.
- `officeStats` no `GET /api/state`: contadores calculados no servidor sobre o estado projetado. O painel ainda usa os seus próprios contadores.
- Campos financeiros do processo não gravam sem `finance.write`.

Continua FUTURE: tela de permissões finas (B-3), tela da carteira do sócio (E-2) e `409 PROCESS_UNASSIGNED`.

## Atualização 6.63.9

Configurações, Escritório, ganhou a tela de papéis (permissões por risco; papel padrão somente leitura; papel próprio com criar, editar e desativar) e a carteira por responsável, visível para `office.manage` e `finance.read`. O servidor continua decidindo quem concede o quê. Teste: `tests/ui_v2_office_roles_portfolio.mjs`.

## Atualização 6.63.11

O painel do escritório mostra a auditoria de acesso (`audit.read` ou `office.manage`) e os processos com equipe excluída (`teams.manage` ou `office.manage`). Só leitura. Teste: `tests/ui_v2_office_roles_portfolio.mjs`.
