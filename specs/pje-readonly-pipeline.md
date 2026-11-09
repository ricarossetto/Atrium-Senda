# PJe Nacional Read-Only — Pipeline de Captura

Status: **implementado e em produção** (produção `6da953a`, implementação funcional `7a3780d`; TJMT 1G/2G validados na VPS).
Autoridade executável: código em `lib/judicial/pje/**`, rotas em `server.mjs`, UI em
`js/features/judicial-integrations.js`, testes `tests/pje-*.mjs` e
`tests/ui_v2_pje_section_placement.mjs`.

## Objetivo

Capturar **Acervo** e **Expedientes** de portais PJe de forma estritamente **read-only**, normalizar,
deduplicar e ingerir no estado oficial do workspace — sem praticar qualquer ato processual.

## Invariantes

1. **Read-only absoluto**: proibido ciência, resposta, petição, protocolo, assinatura, juntada,
   exclusão ou qualquer mutação. O guard classifica requisições por ação/payload (não por método):
   POSTs JSF/Seam de navegação, filtro e paginação são permitidos; ações mutantes e submissões
   desconhecidas caem em default-deny.
2. **Nunca abrir expediente pendente de ciência** (abrir = ciência tácita). Coleta lê apenas metadados
   de listagem.
3. **Prazo da fonte segue a preferência**: datas declaradas pelo PJe viram `sourceReportedDeadlineAt`;
   no modo `auto` (padrão de `settings.deadlineMode`) são aplicadas automaticamente como `deadline`/`deadlineSource: 'pje'`;
   no modo `manual` permanecem como referência até confirmação humana. Nenhuma inferência de texto cria prazo.
4. **Soft-delete só autoritativo**: ausência de comunicação só remove quando a coleta daquela dimensão
   termina `loaded`/`empty_confirmed`. `partial`, `load_timeout`, `parse_error`, `SKIPPED_UNRELIABLE`
   ou erro de auth preservam o histórico intacto.
5. **Identidades**: `processIdentity = CNJ` (Acervo/processos, dedupe por CNJ).
   `expedienteIdentity = ID externo estável quando o portal o expõe`; sem ID externo, fingerprint
   determinístico do conteúdo normalizado (CNJ + situação + órgão + datas). Índice de renderização
   JSF (`tbExpedientes:<n>`) e texto mutável (contadores, links, horários) nunca viram identidade.
   Dois expedientes do mesmo CNJ coexistem (IDs externos estáveis distintos não são colapsados); o
   mesmo expediente em N situações gera **1** `JudicialCommunication` com N memberships: o merge
   deduplica por (workspace, portal, CNJ, conteúdo normalizado) e faz união de
   `situationMemberships`, nunca substituição.
6. **Segredos**: A1/TOTP apenas no cofre do workspace (escopo `pdpj` compartilhado pelos portais PJe do
   mesmo workspace). Nada em log/API/telemetria/commit.

## Arquitetura

```
scheduler (intervalo por workspace) / API manual
  → PjeSyncService (single-flight workspaceId+portalId, jobs persistidos, audit JSONL)
    → runtime resolver (server | local_sidecar | auto)
    → auth A1 + PJeOffice Pro (challengePhrase) + PDPJ/TOTP ou conta PDPJ (CPF + senha + TOTP)
    → collector por família (standard | trabalhista)
    → reliability gate (loaded/empty_confirmed/partial/load_timeout/parse_error)
    → snapshot + diff → ingestão oficial → JudicialCommunication → telemetria
    → UI (cards, config, sync com polling, lista de expedientes)
```

### Componentes

- `lib/judicial/pje/portal-registry.mjs` — registry nacional (61 portais), `layoutFamily`,
  `collectorKey`, rotas confirmadas apenas com evidência (`confirmedRoutes`), runtimes e escopos.
- `lib/judicial/pje/runtime/**` — abstração de runtime (`server` padrão; `auto`). O identificador `local_sidecar` permanece como compatibilidade de estado legado, mas não tem canal operacional: a UI não o oferece, configuração e sync diretos o recusam, e preferências antigas são projetadas como `auto` sem regravar o arquivo. Falha no servidor conserva seu erro original, sem fallback falso.
- `lib/judicial/pje/auth/pdpj-auth.mjs` — state machine de autenticação; protocolo PJeOffice Pro
  (`challengePhrase` + imagem-sinal 1x1/2x1 na porta 8800) com retry/timeout; entrada SSO do TRT4
  (`#btnSsoPdpj`); erros tipados (`AUTH-*`).
- **Conta PDPJ (sem A1)**: quando o assinador local não está disponível no runtime, o formulário
  de credenciais do `sso.cloud.pje.jus.br` é preenchido com **CPF + senha** do cofre do workspace
  (escopo `pdpj`, o mesmo do TOTP) e o fluxo segue para o TOTP; sem conta vinculada o estado é
  `AUTH-CREDENTIALS-REQUIRED` (humano). CAPTCHA e gov.br continuam exigindo intervenção humana —
nunca há contorno.    **Estado em 2026-10-04:** `pje-trt4-1g` validado em produção até a coleta: `auth=verified`,
   `acervo=loaded`, página "Meus Expedientes - PJE" carregando com tabela vazia real
   (`tableTextLen=262`, sem CNJ) e home sem contadores nos cards. Com `expected=null` e 0 linhas
   o gate cai em `load_timeout` e não ingere ausência como fato — comportamento correto, não falha.
   Cadeia corrigida na 6.24.7–6.24.12 (headed por portal, clique engolido, guarda na própria rota,
   medidas sem PII). Detalhe em `docs/judicial/PJE-COLLECTORS.md` §4.
- `lib/judicial/pje/safety.mjs` — guard classificado + allowlist de origens + sanitização de telemetria.
- `lib/judicial/pje/collectors/standard-painel.mjs` — família `standard` (TJMT): Espera A4J dirigida,
  escopo por `linhaN` da árvore RichFaces, reconciliação por contador de expedientes.
  A listagem fornece `prazoFinal` somente quando declara uma data válida após o rótulo
  “Data limite prevista para manifestação”. A quantidade de dias e outras datas não geram prazo.
  A ciência declarada na linha também é capturada sem abrir o expediente.
- `lib/judicial/pje/collectors/pje-jt.mjs` — família `trabalhista` (TRT4): Meu Painel → Acervo Geral e
  Meus Expedientes (rotas confirmadas em `PJE_JT_ROUTES`).
- `lib/judicial/pje/sync/**` — serviço de jobs, snapshot/diff, ingestão, `JudicialCommunication`,
  verificação por runtime/dimensão.
- API: `GET /api/integrations/judicial/pje`, `/pje/portals`, `POST /pje/config`, `POST /pje/sync`,
  `GET /pje/jobs/:jobId`, `GET /api/judicial/communications` (+`/:id`).
- Config por workspace: `data/pje-workspace-config.json` (`pjeEnabled`, `enabledPortals`,
  `runtimePreference`, `automaticSyncEnabled`, `syncIntervalMinutes` 60–1440).
- Telemetria: `data/pje/audit/sync-audit.jsonl` (sem segredos) e `data/pje/jobs.json` com recovery de
  órfãos (`PROCESS_RESTARTED`).

## Projeção para Publicações

- As comunicações persistidas em `state.communications` são projetadas para `state.intimations`
  (o acervo que Publicações lê) pelo módulo puro
  `lib/judicial/pje/sync/project-intimations.mjs`, chamado na ingestão
  (`ingest-inventory.mjs`) antes do save oficial.
- A identidade projetada é estável por portal + expediente da fonte
  (`externalId: pje:<portalId>:<sourceCommunicationId>`), então sincronizações repetidas não
  duplicam. O upsert usa o mesmo merge de fonte externa de DJEN/eproc/Domicílio, preservando
  tratamento, leitura, tarefas, `deadline` e `fatalDeadline` já existentes.
- A data exibida é a informada na listagem do portal (`sourceReportedAt`); sem data de fonte a
  projeção não inventa data. Prazo acompanha a autoridade existente
  (`sourceReportedDeadlineSource: 'pje'`); a projeção nunca calcula prazo, nunca cria
  `fatalDeadline` e nunca converte `sourceReportedScienceAt` (ciência da fonte) em tratamento.
- `communication.status` é fluxo da comunicação e jamais vira `treatmentStatus`; a projeção
  entra como `untreated`/`unread`.
- Fusão com DJEN é **conservadora**: só ocorre por chave forte (CNJ + data de fonte + evento) ou
  texto integral idêntico. Como o PJe não expõe texto integral e o rótulo de situação difere do
  evento do DJEN, na prática os itens coexistem e podem virar candidatos de revisão humana
  (`fallbackCandidates`/`nearDateCandidates`) — nada é fundido por aproximação.
- Cobertura: `tests/intimation-identity.mjs`, `tests/pje-projection.mjs` e `tests/pje-sync-slice.mjs`.

## Rótulo da tarefa de prazo (derivação determinística, sem IA)

- O título da tarefa criada a partir de fonte oficial nomeia **o ato**, nunca uma data que
  possa ser confundida com o prazo. A data operacional continua apenas em `deadline`, com a
  origem em `deadlineSource`.
- PJe: `Prazo PJe — <Ato> (<expediente>) · <classe>` (ex.: `Prazo PJe — Decisão (54342666) · CumSen`).
  O ato, o expediente e a classe são extraídos do texto do próprio painel.
- eproc: `Prazo eproc — <assunto ou evento textual>`; quando o portal só oferece uma data de
  referência, o rótulo vira `intimação de DD/MM/AAAA`, nunca a data solta.
- Modo manual troca o prefixo por `Conferir prazo PJe` / `Conferir prazo informado pelo eproc`.
- A derivação é **determinística** (`lib/judicial/source-task-label.mjs`): não usa modelo, JEV,
  rede nem estado. O mesmo texto produz o mesmo rótulo em qualquer execução.
- Reescrita segura: só o título gerado pelo sistema é atualizado (`generatedTitle`, ou o antigo
  rótulo de situação no PJe). Título editado por pessoa é preservado.
- Cobertura: `tests/source_task_labels.mjs`.

## Estados

- Coleta por dimensão: `loaded`, `empty_confirmed`, `partial`, `load_timeout`, `parse_error`.
- Jobs: `QUEUED`, `RUNNING`, `COMPLETED`, `UNCHANGED`, `SKIPPED_UNRELIABLE`, `DEGRADED`, `ERROR`
  (com `errorCode`/`errorStage`; `percent=null` quando indeterminado).
- Cobertura de runtime por portal: `verified`, `unverified`, `server_unverified`, `degraded`, `blocked`.

## Deploy e runtime

- O runtime do coletor usa navegador headless (`lib/judicial/pje/runtime/`). A operação do runtime nos ambientes de produção é responsabilidade do operador e não está descrita neste repositório.
- O runtime `server` pode exigir `PJE_HEADLESS=false` ou `DISPLAY` configurado para tribunais de front-end antigo; sem isso o acervo carrega vazio e o portal é declarado `SERVER_BLOCKED`/`LOCAL_AGENT_REQUIRED`, nunca fingido como carregado.
- O TOTP do PJe fica no cofre do workspace; o A1 fica no ambiente do servidor, nunca neste repositório.

## Audiências do Acervo Geral (PJe-JT)

A coluna "Data da Audiência" do Acervo Geral vira evento da Agenda em `lib/judicial/pje/sync/acervo-hearings-sync.mjs`, com data, hora, partes e vara lidas da fonte. O evento nunca cria prazo, tarefa, ciência ou ato. Remarcação atualiza o evento futuro do mesmo processo. Só uma leitura completa do Acervo desativa evento futuro ausente, e audiência já ocorrida permanece no histórico. Contrato em `tests/pje-jt-collector.mjs`.
