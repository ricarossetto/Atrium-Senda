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
- A triagem abre com o período em "Todas as publicações (histórico)" e preserva a preferência escolhida pelo usuário nas visitas seguintes; o filtro de período permite restringir para hoje, 2, 7 ou 30 dias.
- Ao abrir Publicações, a lista inicia em `Não tratadas`.
- Métricas e badge lateral refletem o backlog real do acervo (todas as `untreated`/`in_review`, qualquer data); "tratadas hoje/descartadas hoje" usam o dia corrente. A Activity Inbox e os alertas de novidade continuam na janela móvel de dois dias civis (hoje e ontem).
- O resultado do sync judicial (DJEN/DataJud/INPI/eproc) é persistido no estado oficial pelo próprio servidor antes de responder; o flush do navegador não é caminho único de persistência e o painel nunca pode divergir do digest de e-mail.
- O funil semanal (recebidas por data da fonte, tratadas/descartadas pela semana de São Paulo, pendentes como estoque) é persistido por workspace em `publication-funnel-weekly.json` a cada ciclo de sincronização (`lib/publications/publication-funnel-weekly.mjs`); o dashboard lê `GET /api/publications/funnel-weekly` (leitura pura, sem escrita no GET) e exibe no máximo as 4 semanas mais recentes. Essa visão não altera a janela móvel de dois dias civis do Activity Inbox nem os contadores de pendência.
- "Todas as publicações (histórico)" permite consultar registros anteriores sem alterar seu tratamento.
- Datas desconhecidas continuam visíveis para conferência. A janela de publicações nunca restringe a descoberta nem a atualização dos processos cadastrados.
- A leitura resolve o cliente pela cadeia oficial: vínculo direto da publicação (`contactId`/`clientContactId`) → processo vinculado (cliente textual do processo, contato `cliente` por `contactId` ou contato `cliente` único com o número em `relatedProcessNumbers`) → nome exato e único em Contatos. Sem correspondência fuzzy; ambiguidade exibe `Não identificado` e não cria vínculo. Cobertura: `tests/ui_v2_publications.mjs`.

## Layout e continuidade da leitura V2

- No detalhe, o texto oficial vem logo depois do cabeçalho e dos avisos e antecede `Leitura rápida`, dados, `Providências vinculadas`, demais vínculos e blocos assistivos. Conteúdo e toolbar HTML conservam os contratos existentes.
- O texto oficial chega das fontes em uma linha só. A tela o organiza em identificação, títulos e parágrafos (`js/core/publication-text-layout.js`) mudando apenas as quebras de linha: nenhuma palavra é alterada e, se a conferência final não bater, o texto aparece como veio. Texto longo começa recolhido, com `Ler texto completo`.
- Dados secundários, `Contagem de prazo` e `Área e prioridade` ficam em seções recolhidas com resumo visível. A contagem abre sozinha quando a sugestão aponta prazo no texto ou quando já existe resultado; a classificação abre durante a correção ou em falha. O estado aberto sobrevive aos rerenders do mesmo detalhe.
- Em estado pronto, `Corrigir área`, `Corrigir prioridade` e `Atualizar sugestão` compartilham um grupo flexível com quebra de linha, mesma família visual e alvos de pelo menos 44px no mobile. Estados de correção e carregamento conservam suas ações e mensagens reais.
- Rerenders assíncronos do mesmo detalhe (playbook/IA) preservam edições locais, posição de leitura e foco por ID ou atributos de ação estáveis, inclusive seleção de texto. Não restauram foco quando estava fora do detalhe ou há overlay superior; trocar de publicação não transporta edições. A confirmação de alterações não salvas continua ativa.
- Cobertura: `tests/ui_v2_publications_accessibility.mjs` e `tests/visual_ui_v2_publications.mjs` (Basic/PRO, light/dark, 1440/1280/1024/390px, texto longo/vazio, IA loading/ready/correction e requests sem duplicação).

## Allowed operations

- Iniciar análise, marcar tratada, descartar com nota, reabrir e restaurar conforme a máquina de estados.
- **Concluir tarefa vinculada trata a publicação**: quando uma tarefa ligada à publicação (`intimationId`/`sourceIntimationId`/`publicationId`) passa a `concluida`, a publicação em `untreated`/`in_review` vira `treated`, com `treatedBy` do ator autenticado, `treatmentSource: 'task-completion'` e `treatmentTaskId`, além de auditoria. A regra roda no servidor no save oficial do app-state (autoridade) e o cliente aplica a mesma derivação antes do flush para refletir na hora; publicação `discarded` ou já `treated` não muda, e reabrir a tarefa não desfaz o tratamento (reabertura é ação manual na publicação). Tratamento continua sendo triagem interna, nunca ciência judicial. Cobertura: `tests/publication_task_treatment.test.mjs` e `tests/tasks_feature.mjs`.
- Criar tarefa por ação explícita e transacional. Na escolha do modelo do catálogo ("Do prazo à providência"), o campo é um combobox com busca incremental por digitação (mesmo controlador oficial dos formulários, `installModalComboboxes`), agrupado por área e com o nome oficial preservado (`data-providence-definition`); a digitação só filtra e nada é criado sem a confirmação. O botão de confirmar reage à escolha em tempo real (habilita quando o valor corresponde a um modelo do catálogo — inclusive digitado sem acento ou caixa, que é resolvido para o nome oficial no envio; o servidor continua recusando nome fora do catálogo com 422) e, sem modelo, o aviso explica o que falta. Cobertura: os blocos P1 e P4 de `tests/ui_v2_publication_action.mjs`.
- Quando o DJEN fornecer HTML, preservar o payload original limitado no registro e permitir visualização explícita em iframe sandboxed e download de documento HTML autônomo sanitizado. A versão de texto simples continua sendo a leitura oficial da interface.
- No cadastro manual, pesquisar processo por número, cliente, ação ou tribunal e pesquisar cliente nos contatos cadastrados. A escolha grava `processId`/`contactId`; selecionar o processo também preenche número, cliente e tribunal. Texto livre continua permitido e limpa somente o identificador oficial do campo alterado.

## Forbidden operations

- Pular transição inválida, confiar em ator do frontend ou marcar ciência judicial.
- Inferir prazo ou enviar e-mail automaticamente como efeito do tratamento.
- Inserir `rawHtml` diretamente no DOM ativo, preservar scripts/handlers/formulários ou carregar recursos remotos do conteúdo judicial.

## State model

`untreated → in_review → treated|discarded`, com reabertura/restauração nas rotas oficiais.

## Security boundary

Autenticação, CSRF, revision e ator são verificados no servidor; texto externo é escapado na UI.

## Failure semantics

Transição inválida ou revision divergente retorna conflito e não produz estado/audit parcial.

## Persistence semantics

Transição e audit são gravados atomicamente; metadados contraditórios são removidos.

### Disponibilização e publicação (DJEN)

- Para intimações do DJEN, `disponibilizadoEm` preserva a data informada pela fonte (`data_disponibilizacao`) e `publishedAt` é a publicação derivada: o primeiro dia útil seguinte (Lei 11.419/2006, art. 4º, §3º; CPC/2015, art. 224, §2º; Resolução CNJ 455/2022, art. 11, §3º, redação da Resolução 569/2024).
- A derivação é **informativa** e usa fins de semana, feriados nacionais estatutários e Sexta-feira Santa (`lib/core/business-days.mjs`). Feriados locais, pontos facultativos, recesso forense e suspensões por indisponibilidade não são calculados: a interface exibe as duas datas e a conferência é humana.
- A identidade de fusão usa a data da fonte (`disponibilizadoEm`, com fallback para `publishedAt`), preservando chaves existentes; a migração `v11→v12` (`migrate11To12`) separa os campos nos registros DJEN anteriores, sem tocar em eproc/PJe/INPI.
- Nenhum prazo é criado ou alterado por essa derivação (ver `human-deadline-policy.md`).

### Advogados citados e vínculo por OAB (DJEN)

- O DJEN declara os advogados destinatários (`destinatarioadvogados`); o ATRIUM persiste somente o que a fonte declara em `publicationLawyers` (nome, OAB, UF; deduplicado e limitado) e o rótulo legível `lawyers`, usado na leitura e no e-mail. Advogado nunca é inferido de partes ou de texto livre.
- O vínculo com o escritório é derivado e apenas informativo (`js/core/publication-lawyers.js`): a leitura mostra "Advogado(s) na publicação" e, quando um usuário do escritório possui a mesma inscrição OAB/UF, o nome correspondente e o selo "Vínculo por OAB". Correspondência por nome não vincula.
- O vínculo nunca grava `responsible` nem cria tarefa ou atribuição automática; o campo manual permanece autoridade e a ausência de correspondência exibe "Não atribuído".
- **Responsável pelo polo do escritório**: a fonte oficial declara a associação entre parte e advogado (`AGRAVANTE : NOME` seguido de `ADVOGADO(A) : NOME (OAB UF NNNNN)`, `ADVOGADOS : NOME - UFNNNNN` ou `REPRESENTANTES POLO ATIVO/PASSIVO`). `js/core/publication-parties.js` lê essa estrutura do texto preservado e agrupa os advogados por polo; o polo do escritório é o que contém uma inscrição OAB do próprio escritório (termos monitorados ativos e membros do diretório). Os advogados desse polo são exibidos como "Responsável" e como envolvidos na lista; o campo manual `responsible` continua prevalecendo. O polo oposto (patrono da parte contrária) nunca é apresentado como responsável. Quando a fonte não permite determinar o polo (sem advogados no texto, sem inscrição do escritório ou formato desconhecido), a leitura mantém o comportamento anterior e a lista completa segue em "Advogado(s) na publicação". Cobertura: `tests/publication_parties.test.mjs`, `tests/office_involved.test.mjs` e `tests/ui_v2_publications.mjs`.
- A lista de publicações exibe, na linha de processo, um bloco compacto com advogados/envolvidos e a equipe do escritório quando derivável; o bloco é informativo e não altera tratamento, leitura, prazo ou ciência. Cobertura: `tests/office_involved.test.mjs` e `tests/ui_v2_office_involved.test.mjs`.
- Cobertura: `tests/publication-lawyers.test.mjs`, `tests/judicial_discovery.mjs` e `tests/ui_v2_publications.mjs`.

### Fila de falhas de captura (DJEN)

- Cada execução de captura (agendador 07h/19h, botão manual ou retry) reconcilia a fila durável `djen-capture-errors.json` no diretório do workspace via `lib/judicial/djen-capture-errors.mjs` (puro): termo tentado que coletou com sucesso sai da fila; termo com falha ou coleta parcial permanece com `attempts`, `firstFailedAt` e `lastFailedAt` atualizados.
- A fila é limitada a 100 termos, ordenada pela falha mais recente; termo fora do lote tentado permanece pendente (a rotação de termos não descarta falha antiga). A fila não substitui o marcador de sincronização nem altera a janela de captura.
- `GET /api/djen/capture-errors` (autenticado) expõe fila e resumo; `POST /api/djen/capture-errors/retry` (autenticado + CSRF; `termId` ou `all: true`) reconsulta somente termos da fila que ainda existem no monitoramento, com single-flight local e sem avançar o marcador. Com `?async=1` (ou `body.async: true`), a rota responde `202 { idCommand, statusUrl }` e a reconsulta roda em segundo plano sob o contrato de comandos assíncronos (`specs/api-evolution.md`); o resultado final é idêntico ao da rota síncrona. A UI de Fontes monitoradas exibe o painel "Falhas na captura DJEN" apenas quando a fila não está vazia e aguarda a conclusão real do comando antes de anunciar o resultado.
- A paginação da API oficial usa o teto de 100 itens por página com orçamento de 2000 itens por termo/run (`collector/adapters/djen.mjs`); estourar o orçamento marca a coleta como parcial e mantém o termo na fila. Cobertura: `tests/collector.mjs`.
- Cobertura: `tests/djen-capture-errors.test.mjs`, `tests/djen_capture_errors_http.mjs`, `tests/ui_v2_djen_capture_errors.mjs` e `tests/visual_ui_v2_monitoring.mjs`.

## Fusão de publicações duplicadas

- `lib/publications/intimation-identity.mjs` agrupa somente registros elegíveis (`djen:`/`eproc:`/`domicilio:`/`pje:`/`intimation:eproc:`/`intimation:djen:`/`intimation:domicilio:`/`intimation:pje:`). A **auto-fusão** exige chave forte (CNJ+data+evento) OU texto normalizado integral idêntico (`fullTextKey`); igualdade apenas do `fallback` (160 primeiros caracteres do texto) nunca funde e vira `fallbackCandidates` (`autoSafe: false`) para revisão humana, como a tolerância de ±1 dia (`nearDateCandidates`). Candidatos não alteram o acervo sem decisão humana.
- `lib/publications/intimation-merge-engine.mjs` é puro e produz `{ mergeable, conflict, merged, alias, taskLinkRewrites }`; conflito `treated` × `discarded` impede a fusão; conteúdo prefere a fonte DJEN; **texto integral (`fullText`/`fullTextSource`) é aditivo com longer-wins** (o maior teor vence — ordem de prioridade: 1) DJEN captura/metadados, 2) Domicílio Eletrônico texto integral, 3) eproc/PJe prazos) sem sobrescrever `text` do DJEN; vínculo de cliente/processo prefere eproc/curadoria (recipient DJEN nunca vira `client`); prazo informado, proveniência e evidência preferem eproc; `sourceStatus` é união (`active` se qualquer fonte estiver ativa; sem fonte ativa, preserva o status existente); arrays são união deduplicada.
- Campos protegidos: `status`/`responsible`/`completedAt` permanecem do keeper; prazo manual do keeper prevalece e o prazo aplicado pela fonte oficial (`deadlineSource` eproc/pje) é preservado quando não houver prazo humano; `fatalDeadline` nunca é inferido; `unread` é a união booleana dos dois lados.
- O Domicílio Eletrônico (PDPJ) é fonte de **redundância declarada**: sua data de prazo/ciência entra como `sourceReportedDeadlineAt` com `sourceReportedDeadlineSource: 'domicilio'`, que é referência da fonte e nunca vira prazo operativo por si só (`AUTO_APPLIED_DEADLINE_SOURCES` = eproc/pje). O eproc continua verdade absoluta do prazo; `dataFinalCiencia` é preservada como referência de ciência (`noticeDeadlineAt`, unida na fusão com preferência de fonte) e nunca como `deadline`. A captura roda **no servidor** (cloud-first, sem instalação local): `lib/judicial/domicilio/domicilio-runner.mjs` usa o Certificado A1 do cofre do workspace em navegador headless, autentica no SSO do PDPJ/Jus.br, lê a sessão da própria página e chama a API oficial somente leitura (`domicilio-client.mjs`, Bearer + `tenantId`); o resultado é normalizado (`domicilio-normalizer.mjs`, `externalId: domicilio:<numeroComunicacao>`) e persistido pelo caminho oficial compartilhado com digest. O marcador durável `domicilio-sync.json` (0600, sem PII) define 7 dias na primeira captura por workspace e 2 dias nos ciclos, com execução agendada junto aos ciclos 07h/12h/19h BRT (depois do sweep eproc) e rota manual autenticada `POST /api/judicial/domicilio/sync`; `GET /api/judicial/domicilio/status` expõe janela e estado. Sem A1 o ciclo é `SKIPPED_NO_CERTIFICATE`; se o portal exigir interação humana, `HUMAN_ACTION_REQUIRED` — nada é contornado. A ciência no portal permanece estado da fonte (`domicilioMeta.ciente`), nunca tratamento automático. Cobertura: `tests/domicilio-eletronico.test.mjs`, `tests/domicilio-ingest.test.mjs` e `tests/domicilio-runner.test.mjs`. O portal do PDPJ recusa IPs de nuvem (403): o runner declara `PORTAL_BLOCKED` com instru??o e usa `DOMICILIO_PROXY_URL` (ou `PORTAL_PROXY_URL`) como egress aceito quando configurado ? nunca finge login nem leitura.
- Quando a Central fornece o teor em HTML, o normalizador converte a marcação em texto e exclui cabeçalho, scripts e estilos. O mapeamento da Central preserva `prazo` e `dataFinalCiencia` quando presentes; ambos mantêm a autoridade de referência do Domicílio.
- O backend funde os grupos no estado oficial pelo mesmo fluxo de mutação/revisão (`lib/publications/canonical-intimation-state.mjs`): flush do cliente, persistência de coleções externas do `/api/sync` e save do sweep eproc/PJe. O perdedor nunca é removido fisicamente: recebe `mergedInto`, `mergedAt`, `mergeReason: 'duplicate-identity'` e `sourceAliases`.
- Tarefas do perdedor são reapontadas para o keeper (`intimationId`/`sourceIntimationId`/`publicationId` e `linkedTaskIds`), sem apagar tarefas; o reapontamento conta como mudança e é persistido mesmo se nenhum outro campo mudar.
- `readPublicAppStateEnvelope` filtra registros com `mergedInto`; painel, métricas e e-mail nunca exibem o alias. O flush do navegador preserva aliases oficiais, não ressuscita o perdedor e restaura do estado oficial o keeper omitido pelo cliente (alias nunca fica órfão). A varredura de fusão no flush só roda quando há indício de intimação elegível nova em relação ao estado atual.
- Rotas de tratamento, tarefa, providências e e-mail resolvem id/externalId antigo para o keeper, inclusive em cadeias de aliases A→B→C; ciclo de alias resolve para ausência (nunca devolve o próprio alias).
- O audit registra a fusão apenas com ids, fontes e motivo (sem PII); a operação é idempotente e preserva o `mergedAt` original. No flush, o audit de fusão é gravado server-side fora do cap de 100 entradas do cliente, respeitando o cap global de 1000.
- **Notificações e digest** anunciam exatamente o que o painel mostra: `selectNewPublicationEvents`/`absorbedIntimationKeys` descartam alias (`mergedInto`), ids já conhecidos e perdedores absorvidos na rodada. Todos os caminhos de escrita oficial (flush do cliente, coleções externas do `/api/sync` e save do sweep eproc/PJe) fundem antes de gravar e passam as chaves absorvidas ao digest. Como a ingestão do coletor grava apenas o runtime, seu digest deriva as chaves absorvidas do plano de fusão sobre estado oficial + lote recebido (`planAbsorbedIntimationKeys`): o primeiro ingest de um par cross-source já anuncia somente o keeper, nunca o perdedor.
- A busca global (`lib/search-index.mjs`) não indexa registros com `mergedInto` (nem suas notas); no cliente, `resolveIntimationId`/`findIntimationRecord` (`js/core/publication-scope.js`) resolvem qualquer id absorvido para o keeper antes de abrir a publicação.
- `lib/publications/publication-merge-backfill.mjs` aplica o mesmo motor aos duplicados já existentes no acervo de cada workspace, sem remover registros/tarefas: perdedor vira alias e as tarefas reapontam para o keeper. Conflito `treated` × `discarded` não funde e registra pendência no audit com id determinístico (replay não duplica) contendo apenas ids, fontes e motivo; grupos apenas-fallback também não são fundidos pelo backfill; reexecutar sobre estado processado é no-op.
- O backfill roda como migração de schema `v10→v11` (`migrate10To11` em `lib/state-migrations.mjs`) no boot de cada workspace, após o backup `pre-migration-*` e pelo mesmo contrato de `revision`/`expectedRevision` (sem 409 indevido e sem segundo Store).
- Cobertura: `tests/intimation-merge-engine.mjs`, `tests/publication-merge-wiring.mjs`, `tests/publication-merge-sync-path.mjs`, `tests/publication-merge-alias-consumers.mjs`, `tests/intimation-identity.mjs` e `tests/publication-merge-backfill.mjs`.

## Relevant tests

`tests/publications_treatment.mjs`, `tests/publications_feature.mjs`, `tests/publication_task_linking.mjs`, `tests/ui_v2_publications.mjs`, `tests/publication_link_search.mjs`, `tests/decision_html_and_access_key.mjs`, `tests/intimation-merge-engine.mjs`, `tests/publication-merge-wiring.mjs`, `tests/publication-merge-backfill.mjs`.

### Leitura contextual de vínculos

Processos relacionados no contato abrem o inspetor lateral sem trocar a view ativa. Publicações vinculadas em contatos e processos abrem um leitor lateral sobre o contexto de origem, com Voltar e Escape. O leitor resolve o registro pelo ID no Store oficial, exibe texto como texto simples e não altera tratamento, leitura ou ciência judicial. Ao fechar, restaura o foco e o painel anterior. Contrato: `tests/contextual_link_navigation.mjs` e `tests/cross_module_navigation.mjs`.

## Providência cabível por tipo de ato (6.63.6)

`lib/tasks/act-remedies.mjs` identifica o tipo do ato pelo rótulo da fonte e, quando ele é ambíguo, pelo texto. A partir do tipo e do ramo, aponta o recurso cabível em tese, com dispositivo e habilidade da base jurídica. Determinístico e sem modelo. Não calcula prazo, não cria tarefa sem confirmação humana e não inventa nome de tarefa: recurso sem modelo no catálogo sai sem botão de criar. Sem ato identificado, nada é sugerido. Teste de contrato: `tests/act_remedies.test.mjs`.
