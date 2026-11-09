# Recorrência de compromissos

Status: **CURRENT** (compromissos; tarefas permanecem `FUTURE`)

## Purpose

Registrar séries recorrentes de compromissos da Agenda com escopo de edição explícito, sem inferir prazos e sem duplicar ocorrências no Store.

## Canonical authority

- Motor puro: `js/core/recurrence.js` (regras, expansão, materialização, edição por escopo).
- Consumidor: `js/features/agenda.js` (modal, save, render e mini calendário).
- Testes: `tests/recurrence.test.mjs`, `tests/agenda_recurrence.test.mjs`, `tests/ui_v2_agenda.mjs`.

## Invariants

- O registro mestre guarda `recurrence: { rule, seriesId, startDate }`; ocorrências são **virtuais** (`id = seriesId::YYYY-MM-DD`) materializadas na leitura — nunca persistidas em massa.
- Exceções são itens próprios com `recurrence.exceptionOf` + `occurrenceDate`; cancelamento de uma ocorrência é tombstone `skipped: true`, sem apagar o mestre.
- Editar uma ocorrência exige escopo explícito: `single` (somente a ocorrência), `following` (esta e as seguintes, dividindo a série) ou `series` (toda a série). O formulário só oferece escopo quando a ocorrência pertence a uma série.
- Cada ocorrência é ancorada na data inicial: mensal no dia 31 usa o último dia disponível do mês e volta ao 31 quando existir; `until` e `count` limitam a expansão, com teto de 60 ocorrências por série.
- A Agenda marca a ocorrência como "Série recorrente" e não cria prazo, `fatalDeadline`, tarefa ou intimação a partir da recorrência.
- Tarefas recorrentes permanecem `FUTURE`: conclusão por ocorrência, timesheet e Kanban exigem contrato próprio e não devem ser inferidos a partir deste motor.

## Allowed operations

- Criar compromisso com repetição (diária, semanal, mensal, anual) e editar/encerrar a repetição no mestre ("Não repetir" remove a série a partir do mestre).
- Materializar a série na janela visível (dia selecionado, próximos 120 dias na lista, mês exibido no mini calendário).
- Aplicar patch por escopo preservando histórico de auditoria (`Compromisso atualizado (ocorrência da série)`, `Série de compromissos dividida`, `Série de compromissos atualizada`).

## Forbidden operations

- Persistir ocorrências virtuais no Store, duplicar o mestre ou alterar itens sem escopo declarado.
- Tratar recorrência como prazo judicial, gerar tarefa automática ou sugerir ciência.
- Editar série a partir de ocorrência sem registrar o escopo aplicado.

## Failure semantics

- Escopo inválido, mestre inexistente ou data inválida: nenhuma alteração é aplicada (`ok: false`).
- Divisão "esta e as seguintes" na primeira ocorrência é recusada; a alteração deve ser de série inteira.
- Série inexistente na edição de ocorrência não cria registros.

## Persistence semantics

- Somente o Store oficial (`state.agenda`) é usado, com `store.upsert` e auditoria; nenhuma migration e nenhum estado paralelo.
- O motor é puro e não lê disco, rede ou estado global.
