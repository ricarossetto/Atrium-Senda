# Decision Layer JEV do ATRIUM

Status: **CURRENT** (beta/atrium-jev; holographic isolation do `main` até promoção autorizada)

## Purpose

Camada única e reutilizável de julgamento estruturado sobre o cliente/gateway JEV existente: Task Router, Research Guard e Completion Review em boundaries reais do orquestrador, com Tool Guard preparado e Model Router documentado. O JEV permanece consultivo: nunca regra jurídica determinística, modelo principal, RAG, orquestrador ou revisão humana.

## Canonical authority

- Fundação: `lib/jev-beta/taxonomy.mjs`, `context.mjs`, `telemetry.mjs`, `policy.mjs`, `decision.mjs` (`decide()` — ponto único de entrada; todo workflow passa por ele).
- Workflows: `lib/jev-beta/task-router.mjs`, `research-guard.mjs`, `completion-review.mjs`, `tool-guard.mjs`.
- Schemas: `lib/jev-beta/schemas.mjs` (`task_routing`, `research_check`, `completion_review`, `tool_check`, além dos de triagem).
- Costura: `lib/legal-intelligence/index.mjs` (`runAgenticStep` + `jevTelemetry()`), atrás de flags default-off.
- CLIs: `scripts/jev-decide.mjs` (route/check/review), `scripts/jev-eval.mjs` (4 datasets).
- Testes: `tests/decision_layer.test.mjs`, `tests/decision_seam.test.mjs`.

## Workflows e boundaries reais

| Workflow | Schema | Boundary real | Efeito (só com flag + transporte) |
|---|---|---|---|
| Task Router | `task_routing` → `proceed_fast`, `deep_review`, `split_task`, `block` | `runAgenticStep`, pré-etapa | Anexa `plan.artifacts.jev.taskRouting`; `block` escala a etapa para `pending-approval` (humano decide; sem contorno automático) |
| Research Guard | `research_check` → `accept`, `verify_more`, `reject` | `runAgenticStep` etapa `pesquisa` + `revisao-citacoes` (top-3 não resolvidas) | Anexa `researchCheck`/`citationChecks` com `evidenceSourceIds`; nunca pesquisa, nunca inventa referência; sem evidência → `reject` sem gastar chamada |
| Completion Review | `completion_review` → `complete`, `verify_more`, `incomplete` (+`human_review` no teto) | `runAgenticStep` etapa `redacao`, pré-`finish` | `complete` mantém a conclusão; `verify_more` devolve a etapa para `pending` com nota; `incomplete`/teto → `pending-approval`; `complete` com gaps materiais é rebaixado para `verify_more` |
| Tool Guard | `tool_check` → `allow`, `confirm`, `review`, `deny` | **não conectado** (adapter + flag prontos) | `effectivePermission = intersection(local, Jev)` — nunca amplia; falha escala a política local |
| Model Router | — | **não implementado** | `resolveModelRoute()` retorna `{ route: null }`; candidatos futuros validados por `validateModelCandidates()` contra `AI_PROVIDER_CATALOG` (`lib/ai/providers.mjs`) — desconhecido é recusado |

Com flags desligadas ou sem transporte, o comportamento é byte-idêntico ao original (coberto por `tests/decision_seam.test.mjs` S1/S5 e pelas suítes legadas).

## Invariants

- Um único transporte por chamada (`headless`, `http` ou `mock` injetado); nenhum módulo abre HTTP próprio.
- `DecisionContext` compacto com secret-sweep (`SECRET_DETECTED` nunca é convertido em fallback); PII redigida antes do egresso; sem autos integrais.
- Taxonomia `legalArea` oficial (`civil`, `trabalhista`, `previdenciario`, `criminal`, `tributario`, `outro`); alias `civel→civil` normalizado na borda, nunca propagado.
- Limite de ciclos: `attempts >= 2` escala para revisão humana; sem recursão ou fan-out.
- Telemetria em memória por instância de serviço (contadores e hashes, sem PII); trilha de auditoria por decisão (`decisionId`, `workflow`, entidade, fingerprint, resultado, confiança, fallback, override humano).
- Flags por workflow (`JEV_TASK_ROUTER_ENABLED`, `JEV_RESEARCH_GUARD_ENABLED`, `JEV_COMPLETION_REVIEW_ENABLED`, `JEV_TOOL_GUARD_ENABLED`, default off) sempre E-com `BETA_JEV_ENABLED`; chamadas vivas exigem também `BETA_JEV_LIVE`; transporte só via `JEV_TRANSPORT=headless|http` explícito.

## Fail-safe

Assistivo indisponível → `abstain`, funcionalidade preservada, nada inventado. Crítico (Tool Guard) em falha → política local mais conservadora; erro nunca vira `allow`. Confiança insuficiente no guard → `verify_more`/`incomplete`, nunca `complete`.

## Minutas (§6)

Guarda seletiva: só afirmações materiais citadas (top-3 não resolvidas por revisão), com claim, evidence IDs, decisão, confiança e timestamp em `artifacts.jev.citationChecks`; a minuta carrega a proveniência real; JEV nunca é fonte.

## Relevant tests

`tests/decision_layer.test.mjs` (D1–D10: taxonomia, contexto, decide, 4 rotas, accept/verify_more/reject, complete/verify_more/incomplete/limite, matriz 16 do tool guard, flags/fail-safe, telemetria, segurança), `tests/decision_seam.test.mjs` (S1–S6: off idêntico, advisory, block→aprovação, gate com teto, sem transporte idêntico, research sem chamada), eval com métricas de risco.
