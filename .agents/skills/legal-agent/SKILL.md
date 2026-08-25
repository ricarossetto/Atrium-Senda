---
name: legal-agent
description: Orquestra análise de autos, planejamento, pesquisa jurídica, redação e auditoria de petições brasileiras. Use quando o usuário pedir para elaborar, revisar substancialmente, impugnar, recorrer, responder ou estruturar uma peça jurídica com base em documentos/processo.
---

# Legal Agent Orchestrator

Execute uma peça jurídica como pipeline, não como resposta única improvisada.

## Entrada

- Instrução atual do usuário;
- arquivos anexados e/ou `workspace/inbox/`;
- eventuais restrições de estilo;
- jurisdição, tribunal e fase processual inferíveis dos autos.

## Fase 1 — Ingestão

Leia todos os documentos relevantes antes de definir a tese. Invoque/consulte o skill `legal-ingest`.

Crie `00_request.md`, `01_sources.md` e `02_timeline.md`.

## Fase 2 — Issues

Use `legal-planner` para identificar:

- pretensão e providência processual adequada;
- fatos constitutivos, impeditivos, modificativos e extintivos relevantes;
- preliminares e prejudiciais;
- prazos, preclusões, coisa julgada e competência;
- provas favoráveis e desfavoráveis;
- argumentos adversos previsíveis;
- lacunas realmente relevantes.

Salve `03_issues.md`.

## Fase 3 — Plano

Para cada capítulo, registre:

- objetivo;
- conclusão pretendida;
- fatos D# necessários;
- claims jurídicos que exigem J#/L#;
- contra-argumento a enfrentar;
- pedido relacionado.

Salve `04_plan.md` antes de redigir.

## Fase 4 — Pesquisa

Use `legal-research-br` claim por claim. Não pesquise jurisprudência de forma ornamental. Cada fonte deve ter um uso definido.

Atualize `01_sources.md` com as fontes externas verificadas.

## Fase 5 — Redação

Use `legal-draft-br`. Redija de acordo com o plano. Não introduza autoridade não registrada nem fato sem suporte.

Salve `05_draft.md`.

## Fase 6 — Auditoria adversarial

Use `legal-audit`. Atue como revisor hostil ao próprio rascunho: tente encontrar erro factual, citação inexistente, salto lógico, omissão, pedido sem fundamento ou tese incompatível com os autos.

Salve `06_audit.md`. Corrija o rascunho e gere `FINAL.md`.

## Resultado ao usuário

Entregue a peça final. Se útil, mencione em poucas linhas quais pontos foram verificados e quais lacunas materiais permaneceram. Não despeje os arquivos intermediários na resposta salvo solicitação.
