# Política humana de prazos

Status: **CURRENT**

## Purpose

Impedir que texto judicial, classificação ou IA sejam apresentados como prazo jurídico confirmado. A preferência do escritório `settings.deadlineMode` define a fonte oficial: `auto` (padrão) aplica o prazo do eproc/PJe automaticamente; `manual` exige confirmação humana antes de valer.

## Canonical authority

`js/features/publications.js`, `js/features/tasks.js`, `server.mjs` e os fluxos de criação de tarefa a partir de publicação.

## Invariants

- Tarefa criada de publicação recebe o prazo declarado pela fonte oficial (eproc/PJe) conforme `settings.deadlineMode`: `auto` aplica direto (`deadline` + `deadlineSource`); `manual` mantém a data apenas como referência e a tarefa nasce sem deadline.
- Prazo manual do usuário prevalece sobre o da fonte; ajustes de contagem (embargos e similares) são edição humana explícita.
- **Mudança de prazo pela fonte**: quando a fonte oficial altera a data declarada (suspensão, recesso, retificação), em `auto` a tarefa cujo prazo veio da fonte é atualizada, com registro da mudança na publicação (`sourceDeadlineChangedAt`/`sourceReportedDeadlinePrevious`), no histórico da tarefa e no audit. A propagação roda no fluxo oficial de coleções externas e no reconciliador do eproc (`lib/publications/source-deadline-sync.mjs`).
- **Divergência visível, nunca sobrescrita**: se o prazo vigente é edição humana e diverge do informado pela fonte, nada é alterado — a tarefa recebe `deadlineConflict` (fonte, valor da fonte, valor humano) e a interface mostra o aviso de conferência; o aviso desaparece sozinho quando os valores convergem.
- **Tarefa repetida da mesma família é consolidada, não multiplicada**: quando o portal republica o mesmo ato (suspensão, retificação, nova linha do Painel do Advogado), o `externalId` muda e, sem guardião, nasceria uma segunda tarefa para o mesmo prazo — foi assim que duas suspensões deixaram **três tarefas** no acervo real de 29/09. Regras (`lib/publications/source-deadline-consolidation.mjs`):
  - o reconciliador do eproc **reaproveita** a tarefa oficial da família (processo + ato da fonte) em vez de criar outra, e o prazo dela acompanha a fonte;
  - ao fim do ciclo, a família é consolidada numa única tarefa oficial (a da declaração mais recente da fonte); as repetidas recebem `absorbedInto`/`absorbedAt`/`absorbReason` + `active: false` (absorção **reversível**, nada é removido) e o prazo anterior entra no histórico da oficial;
  - **nunca** são absorvidas tarefas com curadoria humana (prazo digitado por pessoa, `fatalDeadline`, responsável, cliente, nota, apontamento, prioridade ou etapa alterada), nem prazos de **atos diferentes** no mesmo processo;
  - tarefa absorvida sai de todos os lugares que já respeitam `active: false` — lista, Kanban, dashboard, agenda, relatórios de produtividade, busca, contexto do assistente, triagem assistiva e **digest de e-mail** (painel e digest precisam convergir, `AGENTS.md` §31).
- A origem do prazo é derivada do dado, não de uma flag de confiança: só é tratado como "da fonte" o valor idêntico ao declarado por último pela fonte; qualquer outro valor é humano e intocável por automação.
- `deadline` e `fatalDeadline` existentes são dados explícitos; não são inferidos de movimentação ou categoria.
- A data de publicação derivada da disponibilização no DJEN (`publishedAt`, com `disponibilizadoEm` preservado) é informativa; prazo continua exclusivamente da fonte oficial (eproc/PJe).
- Classificação de ato e prioridade não calcula vencimento.
- **Sinal assistivo de prazo (conferência)**: o classificador assistivo pode sinalizar que o texto menciona prazo, audiência ou ato com data e **pré-preencher** a conferência de contagem com os dias declarados. Nada é gravado: `deadline`/`fatalDeadline` continuam exclusivamente humanos ou declarados pela fonte oficial, e nenhuma data é calculada sem o clique humano de conferência.
- **Conferência de contagem (informativa)**: a leitura da publicação oferece um cálculo sob demanda a partir da data e do número de dias **informados pelo usuário** (dias úteis ou corridos, depois ou antes do início), usando `lib/core/deadline-conference.mjs` e a rota `POST /api/calc/deadline/conference` (sessão + CSRF). O resultado mostra a data proposta, o primeiro dia útil posterior, o último dia útil anterior e as datas contadas; feriados locais, pontos facultativos, recesso e suspensões não são inferidos (suspensões registradas podem ser informadas explicitamente). A conferência **nunca grava sozinha**: o cálculo em si não persiste `deadline`, `fatalDeadline`, tarefa ou revision. A data calculada só é aplicada quando a pessoa confirma a providência (`POST /api/tasks/from-publication` com `deadline`): a tarefa criada recebe o valor com `deadlineSource: 'conferencia'` e `conferenceDeadlineAt` (rastro do valor aplicado), `fatalDeadline` continua intocado e o desfazer segue recusando remover tarefa com edição humana — só o prazo idêntico ao aplicado na criação conta como intocado.

## Allowed operations

- Exibir datas já cadastradas.
- Usuário autorizado informar, revisar, alterar ou remover prazo explicitamente.

## Forbidden operations

- Regex do tipo recurso=15 dias ou embargos=5 dias.
- IA, texto de publicação ou data genérica promovidos a prazo fatal.
- Criar tarefa automática com deadline estimado.
- No modo `auto`, descartar o prazo declarado pela fonte oficial ou tratá-lo como mera sugestão.

## State model

Prazo ausente, prazo informado e `fatalDeadline` explicitamente marcado.

## Security boundary

A confirmação jurídica é humana; automação não pratica ato, ciência ou decisão profissional.

## Failure semantics

Na ausência de data da fonte oficial, o prazo permanece vazio até registro humano.

## Persistence semantics

Somente valores submetidos pelo contrato oficial são persistidos; ausência continua ausência.

## Relevant tests

`tests/publication_task_linking.mjs`, `tests/publications_treatment.mjs`, `tests/eproc-deadline-pipeline.mjs`, `tests/source_deadline_sync.mjs`, `tests/source_deadline_consolidation.mjs`, `tests/intimation-merge-engine.mjs`, `tests/ui_v2_publications.mjs`, `tests/agenda_feature.mjs`, `tests/deadline-conference.test.mjs`, `tests/deadline_conference_http.mjs`, `tests/deadline_conference_ui.mjs`, `tests/publication_action.mjs` e `tests/ui_v2_publication_action.mjs`.
