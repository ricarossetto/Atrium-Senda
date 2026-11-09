# Guia de configuração do escritório

Status: **CURRENT para o que existe no ATRIUM 3.0.0; FUTURE para o restante**. Este guia separa o que já funciona do que ainda está apenas planejado. O conteúdo abaixo reflete a edição aberta (self-hosted). O contrato completo está em `specs/office-teams-access.md`; o plano de implementação, em `docs/development/PLAN_OFFICE_TEAMS_ACCESS.md`.

## Onde fica

1. Entre como `office_principal` ou `office_manager` (os papéis legados `master_admin` e `admin` continuam aceitos).
2. Abra **Configurações**.
3. No grupo **Equipe**, clique em **Escritório**.

A central de administração da plataforma é outra coisa: ela não lê conteúdo jurídico do escritório e não substitui esta tela.

## O que já funciona

- Convite por link e por e-mail, com tipo (`memberKind`), papel (`officeRoleId`) e equipes (`teamIds`) iniciais.
- Gestão de membros e de equipes.
- Atribuição de processo com equipes, responsáveis e concessões.
- Modo `shadow` e `enforced`.
- Monitoramento privado de OAB com deduplicação.
- Offboarding com transferência de processos e tarefas.

## Como convidar alguém

1. Abra **Configurações > Equipe > Escritório**.
2. No cartão **Convidar integrante**, informe nome e e-mail.
3. Deixe **Enviar também por e-mail** marcado se o escritório já tiver o envio configurado.
4. Clique em **Gerar convite**.
5. O sistema mostra o resultado honesto:
   - `E-mail enfileirado para envio.`
   - `O e-mail não foi enfileirado; use o link abaixo.`
   - `Envio por e-mail não configurado; use o link abaixo.`
6. O link manual também aparece e vale por 48 horas. A pessoa abre `/login#invite=<token>`, define a senha e ativa a proteção em duas etapas.

O convite aceita **tipo** (`memberKind`: advogado ou colaborador), **papel** (`officeRoleId`) e **equipes** (`teamIds`) iniciais. Essas escolhas valem já no primeiro acesso.

## Como criar uma equipe

1. No mesmo painel, use **Times por área**.
2. Informe nome e descrição.
3. Marque os integrantes.
4. Clique em **Criar equipe**.

A equipe concede acesso: quem está numa equipe atribuída ao processo vê o processo, suas tarefas, publicações, atendimentos e agenda. O recorte é aplicado pelo servidor.

## Como atribuir um processo

1. Abra **Processos e casos**.
2. Selecione o processo.
3. No inspetor, localize **Equipe e acesso**.
4. Marque a equipe responsável e os advogados responsáveis.
5. Clique em **Salvar acesso**.
6. O backend grava a atribuição com revisão otimista e auditoria.

Só equipes e advogados marcados veem o processo, suas tarefas, publicações, atendimentos e agenda. O financeiro continua dependendo de `finance.read`/`finance.write`.

## Como desligar um membro

1. Abra **Configurações > Equipe > Escritório**.
2. Na ficha do membro, escolha o substituto em **Desligar e transferir para**.
3. Clique em **Desligar** e confirme.
4. O backend transfere processos e tarefas, remove o membro das equipes, desativa o acesso e revoga sessões/dispositivos.
5. O principal e o último gestor ativo são protegidos; nesses casos, transfira a titularidade ou nomeie outro gestor antes.

## Como ativar o bloqueio por processo

1. Abra **Configurações > Equipe > Escritório**.
2. Revise os processos sem equipe/responsável no cartão **Papéis**, rodapé **Modo preparação**.
3. Atribua os processos necessários.
4. Clique em **Ativar acesso por processo** e confirme.

Em `shadow` (padrão), o painel mostra a cobertura e nada é escondido. Em `enforced`, o servidor filtra o acervo. A volta para `shadow` é imediata e não apaga atribuições.

## O que ainda não funciona

- Editar permissões configuráveis pela tela.
- Rotas de consulta de papéis (`/api/office/roles`) e de auditoria de acesso (`/api/office/access-audit`).
- Rotas de monitoramento (`/api/office/monitoring`, `/api/me/private-monitoring`).
- Financeiro segregado por responsável do processo.

O modo `enforced` já filtra `/api/state`, busca e documentos, mas a ativação deve ser feita depois de revisar a cobertura de processos atribuídos.

## Modelo planejado

### Perfil do escritório

- Um workspace oficial, com **um principal** e **vários gestores**.
- Centraliza membros, equipes, OAB do escritório, processos, publicações, tarefas, clientes, agenda, financeiro e configurações.
- O gestor enxerga o acervo do escritório, mas não o conteúdo privado dos membros.
- O gestor não “entra” na conta do membro; ele administra vínculos, papéis, equipes e atribuições.

### Perfil do membro

- `memberKind: lawyer` ou `memberKind: staff`.
- Papel típico: sócio, associado, contratado, paralegal, estagiário, financeiro ou operações.
- Permissões modulares: processual, publicações, tarefas, clientes, agenda, documentos, financeiro, relatórios, administração, integrações e IA.
- Equipes e processos atribuídos definem o recorte de trabalho.
- Pode ter OAB privada e monitoramento privado, sem misturar com a OAB do escritório.

### Processo

- Todo processo novo, manual ou automático, entra na fila de atribuição.
- O gestor escolhe a equipe principal, advogados responsáveis e, se necessário, uma pessoa extra com acesso.
- Só os responsáveis, membros da equipe e concessões explícitas veem o processo e seus derivados.
- Associado/contratado pode criar processo sem autorização prévia; fica como responsável provisório até o gestor confirmar.

### OAB e deduplicação

- A captura do escritório usa **somente** as OABs confirmadas pelo gestor; não soma automaticamente a OAB de cada advogado.
- A OAB privada do membro é um escopo separado.
- Se o mesmo CNJ já pertence ao escritório, a captura privada **não cria duplicata e não atualiza** o registro do escritório; ela apenas registra que foi ignorada.
- Se o CNJ existe apenas no privado e depois é capturado pelo escritório, o escritório vence, o registro privado é preservado e o processo entra na fila de atribuição.
- Publicações seguem a mesma identidade oficial.

## Como saber se está funcionando

Testes de aceite que serão exigidos antes de declarar o modelo pronto:

- gestor convida com papel/equipe e o membro aceita com o vínculo correto;
- associado não vê processo não atribuído nem financeiro;
- atribuir equipe concede acesso; remover revoga na requisição seguinte;
- busca, contadores, notificações e boletins respeitam o mesmo filtro;
- OAB privada não duplica nem atualiza processo do escritório;
- offboarding não deixa processo órfão;
- migração em `shadow` não esconde dados sem confirmação;
- light/dark e 390/860/1440/1920 sem corte, sobreposição ou ação encoberta.
