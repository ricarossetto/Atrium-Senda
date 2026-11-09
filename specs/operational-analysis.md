# ATRIUM — Análise operacional com Atrium IA

Status: **CURRENT** na edição aberta 3.0.0 (Atrium Senda). Backend e UI publicados; a consulta opcional ao modelo real depende de configuração do escritório e não é avaliada por este contrato.

## Purpose

Analisar publicações pendentes, prioridades de tarefas, produtividade, sinais operacionais por processo e propostas de conferência humana sobre o estado oficial do escritório. A identificação pública é Atrium IA; `jev` é identificador técnico interno. O resultado determinístico é local ao backend. A consulta opcional ao modelo usa somente contagens globais minimizadas, mediante ação manual separada, sem treinamento nem execução de propostas.

## Canonical authority

- Núcleo puro: `lib/ai/jev-analyzer.mjs`, com `analyzePendingPublications`, `prioritizeTasks`, `analyzeTeamProductivity`, `identifyProcessRisks` e `generateActionPlan`.
- Serviço: `lib/ai/jev-analysis-service.mjs`, com `createJevAnalysisService`, `normalizeAnalysisFilters`, `minimizeAnalysisEgress` e `createNativeJevAnalysisAdapter`.
- HTTP: `lib/http/jev-analysis-routes.mjs`, `createJevAnalysisHttpHandler`; registro em `server.mjs` com `readAppStateEnvelope`, `enqueueAppStateMutation` e `saveAppStateDirectUnlocked`.
- UI: `js/features/jev-analyzer.js`, `js/views/ui-v2/operational-analysis.js`, `css/views/ui-v2/operational-analysis.css`; montagem em `js/features/reports.js` e host `#operationalAnalysis` em `index.html`, na view Relatórios, `/gestao/relatorios`.
- Persistência no cliente: `js/core/store.js`, `canonicalMutation` e `refreshCanonicalState`. As métricas reutilizam `js/core/task-performance.js`; a sugestão histórica reutiliza `lib/tasks/task-insights.mjs`.
- Transporte nativo: `lib/jev-beta/client.mjs`, `buildHeadlessPayload`, `callJev`, `CMD_PROVIDER_MODEL` e `JEV_PROVIDER_API_URL`. Não é o fluxo de chat de `lib/ai/providers.mjs` nem a camada de roteamento do orquestrador em `specs/decision-layer.md`.
- Skill de produto: `.agents/skills/jev-data-analyzer/SKILL.md`, sem YAML, com descrição no corpo. A fonte está ignorada por `.gitignore` (`.agents/`); promoção exige inclusão explícita desse arquivo no commit pelo operador, não apenas dos catálogos gerados. Sem fonte rastreada, a geração verificável bloqueia a promoção. `scripts/generate-skills-data.mjs` inclui o texto integral em `lib/legal-intelligence/catalog/skills-catalog.json` e `js/skills-data.js`. O total selecionável é 19: 9 jurídicas, 7 vendoradas e 3 de contexto. A seleção da skill não chama as rotas de análise automaticamente.
- Contratos relacionados: `specs/ai-assistant.md`, `specs/legal-intelligence.md`, `specs/productivity-reports.md`, `specs/human-deadline-policy.md`, `specs/publication-treatment.md` e `specs/store-persistence.md`.

## Invariants

### Fonte, datas e cobertura

- O backend lê o envelope do workspace autenticado. O cliente não fornece tarefas, processos, publicações, métricas, ator, relógio ou conteúdo judicial como autoridade.
- O serviço usa relógio confiável do servidor e retorna `evaluatedAt` e `sourceRevision`. O núcleo exige `evaluatedAt` explícito, podendo recebê-lo do estado em ensaios locais, sem consultar relógio ambiente escondido.
- Fuso padrão `America/Sao_Paulo`, dias civis do escritório; a API também aceita `UTC`. Janela entre 1 e 90 dias, padrão 90 na API; a UI inicia em 30 e oferece 30/90. Datas civis incluem o último dia, limitado ao instante atual; data sem horário só está atrasada depois do fim do dia. Instantes com offset são exatos. Duração mede tempo decorrido, não dias úteis.
- `pendingCount` de publicações considera todo o backlog `untreated`/`in_review`, sem aliases `mergedInto`; o detalhe é limitado à janela. Tarefas abertas não são restringidas pela janela; excluem inativas, absorvidas, concluídas e canceladas. Conclusões de produtividade dependem do período de até 90 dias. Idade do item não abre prazo.
- IDs ausentes/duplicados, coleções inválidas, datas inválidas/futuras, conclusões contraditórias e vínculos ambíguos produzem cobertura/exclusões explícitas. `outsideWindow` não equivale a erro ou inexistência. `observed_data` descreve apenas os registros observados, não certifica captura judicial completa.
- O núcleo mantém evidências e proveniência. A resposta HTTP projeta campos limitados e resumo de cobertura com `issueCount`, `excludedCount`, `outsideWindow`, `durationDenominator` e `deadlineDenominator`; não transmite todos os detalhes internos de cobertura. `confidence: null` não é confiança zero nem avaliação probabilística.

### Prioridades, produtividade e riscos

A pontuação é uma soma transparente de componentes operacionais:

| Componente | Peso |
| --- | ---: |
| Data operacional registrada em atraso | 40 |
| Data não vencida nos próximos 7 dias civis | 20 |
| Marcação fatal explícita já registrada | 30 |
| Prioridade `urgente` / `importante` / `normal` | 20 / 10 / 0 |
| Sem responsável registrado | 5 |

Ordenação por score decrescente, data crescente e ID. Os componentes e `scorePolicy` acompanham cada tarefa. Essa regra não calcula prazo nem probabilidade de perda; a data fatal já registrada permanece decisão humana. `sourceReportedDeadlineAt` é referência, não promovida a prazo pelo analisador. Referência do Domicílio não vira data operacional por cópia indevida.

- Produtividade reaproveita conclusões, pontos, metas e minutos apontados. Tempo médio usa criação/conclusão válidas; taxa de pontualidade usa conclusões com data operacional válida; taxa de backlog atrasado usa tarefas abertas. Cada taxa traz numerador/denominador e valor `null` sem base. Meta ausente/zero não cria alcance. Valores ausentes/inválidos não devem ser apresentados como certeza de zero.
- `completedBy` é quem registrou a conclusão, não prova de autoria do trabalho ou identidade autorizada. Nomes de responsáveis são referências operacionais, não autoridade de sessão ou permissão.
- Carga aberta, espera e atraso são `observed_factor`, com `causalClaim: false`. Não há diagnóstico causal de baixa produtividade nem julgamento de capacidade/qualidade individual.
- Sugestões de distribuição são hipotéticas, no máximo 10: carga aberta projetada, histórico do mesmo tipo e desempate por nome. Redistribuição só sugere redução da desigualdade observada de carga; não atribui nem altera a tarefa. A base quantitativa e as evidências acompanham a sugestão.
- Riscos conferem marcação fatal explícita sem tarefa aberta vinculada ao ato e andamento recente com data operacional próxima. Tarefa apenas no mesmo processo não comprova cobertura do ato; referências não resolvidas ficam declaradas.
- Andamento só é avaliável com origem registrada confiável `tjrs_public`, `datajud`, `eproc`, `pje` ou `djen`; herança DataJud exige origem do processo e alias `api_publica_*`. Sem isso, `not_evaluable`.
- Prescrição é sempre `not_evaluable` nesta implementação: `missing_canonical_structured_prescription_field`. Texto livre, idade do processo e andamento não são termo prescricional.
- Propostas são revalidadas contra registros oficiais; aliases são resolvidos e referências ausentes/obsoletas são declaradas. `automaticActions: []`, `requiresHumanReview: true`, `deadline: null` e `fatalDeadline: false`. Datas existentes aparecem apenas como referência, nunca como nova contagem.

## Allowed operations

| Rota | Contrato |
| --- | --- |
| `GET /api/jev/analysis/publications` | Análise local de publicações pendentes |
| `GET /api/jev/analysis/tasks` | Prioridades operacionais de tarefas abertas |
| `GET /api/jev/analysis/productivity` | Métricas e sugestões hipotéticas de distribuição |
| `GET /api/jev/analysis/risks` | Sinais registrados por processo, sem cálculo prescricional |
| `POST /api/jev/action-plan` | Proposta manual com auditoria, consulta externa somente se `advisory: true` |

GET aceita somente `windowDays`, `timeZone`, `limit` e `cursor`. POST aceita somente `windowDays`, `timeZone`, `limit`, `expectedRevision` obrigatório e `advisory` booleano opcional, padrão falso. Corpo limitado a 500 bytes; query desconhecida, repetida ou excessiva é recusada. Nenhuma rota aceita estado do navegador, prompt livre, URL de modelo ou payload judicial como entrada.

A UI não consulta ao abrir a view. O administrador escolhe tipo/janela e clica em consultar, preparar proposta local ou consultar modelo com contagens globais. A última ação é autorização manual específica para o egresso declarado; autorização de análise local ou escolha da skill não implica envio externo.

## Forbidden operations

- Inferir prazo jurídico, confirmar fatal, calcular prescrição por heurística, dar ciência, assinar, peticionar ou enviar e-mail.
- Criar/mover/atribuir tarefas, alterar tratamento/prioridade ou executar as propostas automaticamente.
- Enviar relatório, CSV, estado do navegador, nomes, CNJ, IDs, textos, datas individuais ou segredos ao modelo nesta integração.
- Usar dados reais do escritório como fixtures, massa de teste ou treinamento. A finalidade autorizada é análise operacional de dados reais minimizados, não aprendizado do modelo.
- Usar o provedor Zen/chat como fallback, escolher modelo por sugestão do usuário ou prometer modelo real validado a partir de simulações.
- Classificar fator observado como causa raiz, score como probabilidade ou estatística operacional como sanção/ranking de capacidade individual.

## State model

Resposta com schema `atrium-operational-analysis/1`, `kind`, `sourceRevision`, `evaluatedAt`, `engine`, `mode`, `externalModelUsed`, `requiresHumanReview`, `training: false`, `confidence: null`, `filters`, `data`, `coverage` e `pagination`.

GET usa paginação por coleção: `pagination.total` é o tamanho da maior coleção, com `totals` por lista. Limite entre 1 e 100, padrão 50 na API e 20 na UI. Cursor assinado em memória vincula workspace, revisão, schema e filtros; expira em 5 segundos. Agregação ocorre antes de cortar a página. Cache local de até 64 entradas, TTL de 5 segundos, sem disco.

POST retorna primeira página da proposta sem cursor seguinte; `pagination.truncated` declara limite excedido. Deduplicação só das chamadas simultâneas do mesmo workspace/revisão/filtros/opção/ator; não é idempotência durável para repetir após perda de resposta. Até 8 operações em voo. A consulta externa tem orçamento de 3 por minuto por workspace, limite global em voo e cancelamento.

Estado da UI vive em memória. Mudança de identidade/workspace/papel descarta o resultado e respostas tardias; `busy` bloqueia duplicidade. `canonicalMutation` exige flush confirmado, serializa na fila do Store e recarrega o estado após a auditoria sem sobrescrever edições concorrentes. Dirty ou falha de recarga conserva snapshot/revisão e `canonicalRefreshPending`, bloqueando save. Cancelar/Escape não descarta nem consulta. Descarte exige confirmação explícita e valida fingerprint, revisão e identidade antes e durante a leitura; falha mantém snapshot e trava. Só a recarga confirmada substitui o estado oficial e perde as edições locais cujo descarte foi aceito, sem rebase/merge automático. Não há segundo Store ou coleção de análises persistidas.

## Security boundary

- Todas as rotas exigem sessão com workspace e perfil `admin` ou `master_admin` pelo `assertAdmin` oficial. POST também exige CSRF. Ocultar a UI não substitui RBAC do backend. Respostas usam `Cache-Control: private, no-store`.
- GET é somente leitura, sem modelo ou auditoria escrita. POST primeiro confirma a auditoria da solicitação na fila oficial, depois consulta opcionalmente o modelo e confirma o desfecho. Ator vem da sessão.
- `minimizeAnalysisEgress` exclui marcas conservadoras de sigilo/restrição: `secrecy`, `restricted`, `segredoJustica`, `isSecret`, `confidential`, `sealed`, `isSealed`, `sigiloso`, `secrecyLevel`, `nivelSigilo` e tags de restrição. Valores não reconhecidos como públicos bloqueiam o registro. A exclusão se propaga no grafo de processos/publicações/tarefas. IDs/CNJ duplicados, vínculos inválidos/ausentes ou múltiplos também bloqueiam os componentes afetados. Ausência de marca não certifica publicidade.
- Somente cinco contagens globais permitidas chegam ao adaptador: `pendingPublications`, `openTasks`, `overdueTasks`, `completedTasks`, `operationalRisks`. Cada célula menor que 5, inclusive zero, vira `null`; se todas são suprimidas, nenhuma consulta é feita. Os detalhes locais e o resumo de exclusões não são enviados ao modelo. Agregação reduz exposição, mas não promete anonimização irreversível ou conformidade jurídica automática.
- `createNativeJevAnalysisAdapter` usa `JEV_API_KEY` ou `CMD_API_KEY`, somente ambiente server-side, modelo/endpoint fixados pelo cliente existente. Usa `buildHeadlessPayload` para montar payload estruturado e `callJev` em modo `provider-api`, sem CLI/headless real e sem fallback ao provedor do Assistente. Este transporte está conectado; sua disponibilidade em produção não foi verificada nesta missão.
- Modelo responde somente `answers.focus`: `publications`, `tasks`, `productivity`, `risks` ou `abstain`, com campos tipados validados. Texto livre não entra na UI; rótulo vem do vocabulário local. Confiança retornada não é apresentada como probabilidade medida da análise.
- Timeout máximo 8 segundos, resposta do modelo até 16 KiB, página HTTP até 256 KiB; projeção limita profundidade, listas e strings. Segredos, prompts, respostas e dados judiciais não entram em logs ou na auditoria desta integração. Auditoria conserva apenas ator oficial e metadados operacionais necessários.

## Failure semantics

- Falta de sessão/perfil/workspace: 401/403 antes de leitura/chamada. Método inválido: 405 com `Allow`; filtro/cursor inválido: 400; revisão ou cursor expirado: 409 `STALE_ANALYSIS`.
- Estado/relógio indisponível: 503. Página excessiva: 503 `ANALYSIS_TOO_LARGE`. Saturação do plano: 429 `ANALYSIS_BUSY`.
- Consulta opcional: `not_requested`, `suppressed`, `unavailable`, `rate_limited`, `cancelled`, `timeout`, `invalid_response`, `completed` ou `abstained`. Falha mantém proposta determinística local; não equivale a sucesso do modelo. Apenas resposta válida concluída/abstenção muda `mode` para `advisory`.
- O campo `externalModelUsed` é verdadeiro nos desfechos `completed`, `abstained` e `invalid_response`; outros estados não provam que nenhum pacote saiu da rede, pois uma chamada pode falhar após o envio. Não trate esse campo como recibo de ausência de egresso.
- Auditoria sem nova revisão confirmada retorna `AUDIT_NOT_CONFIRMED`, com 409/423/503 conforme a falha. Uma falha na segunda gravação pode ocorrer após consulta externa; o sucesso nunca é presumido. Perda de resposta exige conferir/recarregar o estado antes de repetir.
- POST retorna revisão final, `refreshCanonicalState: true` e `sourceChangedDuringAnalysis`. Dados que mudaram durante a análise não são silenciosamente tratados como a revisão mais recente. Falha de refresh mantém pendência e preserva edições locais; não se repete o plano para tentar corrigir persistência.

## Persistence semantics

GET e o núcleo puro não alteram o estado. POST persiste somente eventos de solicitação/desfecho em `state.audit`, teto de 1000, por `enqueueAppStateMutation` e CAS da revisão atual. Não persiste resultado, prompt, resposta do modelo ou treinamento. A auditoria altera `revision`; o cliente deve confirmar a releitura oficial, não apenas adotar a revisão e sobrescrever o estado.

Relatórios e CSV continuam sendo projeções locais somente leitura, sem egresso próprio. O painel separado acrescentado na mesma view tem contrato específico de leitura backend, auditoria e consulta manual minimizada. Essa exceção não autoriza envio do relatório nem muda sua agregação/exportação.

## Relevant tests

- `tests/jev-analyzer.test.mjs`: núcleo determinístico, datas civis/instantes, vínculos/aliases, score, denominadores, carga hipotética, prescrição não avaliável e propostas sem mutação.
- `tests/jev-analysis-http.test.mjs`: serviço/rotas em servidor HTTP sintético, auth/CSRF/RBAC, revisão, paginação, auditoria confirmada, sigilo/vínculos, supressão, orçamento, parser, timeout e adaptador nativo com transporte simulado.
- `tests/jev-analyzer-frontend.test.mjs`: Store/feature/presenter, concorrência, refresh, identidade e escape, sem navegador real.
- `tests/ui_v2_operational_analysis.mjs`: cenários de navegador disponíveis para a frente de UI, não equivalentes aos testes nativos acima.
- `tests/task_performance.test.mjs` e `tests/reports_feature.mjs`: preservação das métricas locais e do relatório/CSV.
- `tests/skills_catalog_contract.test.mjs`, `tests/skills_catalog_generation.mjs`, `tests/skills_catalog_triggering.test.mjs` e `tests/spec_contracts.mjs`: texto integral, 19 skills, gatilhos, exclusão de tooling e contrato documental.

Toolchain local inspecionado: Node.js `v24.14.0`, pnpm `11.19.0`. `pnpm check` é sintaxe, não lint semântico/typecheck; não há scripts separados desses checks no pacote. Comandos focais existentes, sem suíte completa:

```powershell
node scripts/generate-skills-data.mjs --check
node tests/skills_catalog_contract.test.mjs
node tests/skills_catalog_generation.mjs
node tests/skills_catalog_triggering.test.mjs
node tests/spec_contracts.mjs
node scripts/check-syntax.mjs
node --test tests/jev-analyzer.test.mjs tests/jev-analysis-http.test.mjs
node --test --experimental-test-coverage --test-coverage-include=lib/ai/jev-analyzer.mjs tests/jev-analyzer.test.mjs
node tests/jev-analyzer-frontend.test.mjs
```

Medição reexecutada na preparação 6.33.0 em 2026-10-08: 68/68 testes nativos, sendo 41 do núcleo e 27 HTTP; o script frontend usa assertions, não cinco testes nativos. Cobertura combinada limitada ao núcleo/serviço/rotas: 100% linhas, 96,90% branches e 98,94% funções, com thresholds nativos de 80% nos três indicadores. Comando exato:

```powershell
node --test --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 --test-coverage-include=lib/ai/jev-analyzer.mjs --test-coverage-include=lib/ai/jev-analysis-service.mjs --test-coverage-include=lib/http/jev-analysis-routes.mjs tests/jev-analyzer.test.mjs tests/jev-analysis-http.test.mjs
```

Não é cobertura global nem medição de frontend/browser. Catálogo: 19/19 entradas integrais, 25/25 frases de gatilho; specs: 20/20; sintaxe: 931 arquivos PASS. Frontend, relatórios/CSV e métricas PASS; navegador sintético PASS na matriz de oito cenários light/dark (1280×844, 1024×844, 390×844 e 390×500), incluindo recuperação e descarte. Gate `tests/store_module.mjs` confirmado após alinhar seus dois imports oficiais à URL versionada: execução via `spawnSync`, com `JEV_CMD_BIN=process.execPath`, retornou `VERIFIED_EXIT 0 SIGNAL null`. Publicação autorizada explicitamente em 2026-10-08. Gates, exits, evidências e limites em `docs/RELEASE_NOTES_6.33.0.md`. Sem suíte completa, produção ou modelo real nesta missão. Simulações não validam o tratamento contratual dos dados pelo provedor externo; retenção/treinamento pelo provedor exige conferência antes da habilitação operacional.
