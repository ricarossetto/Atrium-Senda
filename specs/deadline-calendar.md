# Calendário de suspensões e indisponibilidades

Status: **CURRENT**

## Purpose

Registrar, por escritório, os períodos de indisponibilidade divulgados pelas fontes oficiais — Portal de Serviços/DJEN (Resolução CNJ 455/2022, arts. 6º a 9º) e PJe (Resolução CNJ 185/2013, arts. 9º a 12º) — como **informação de conferência**. O ATRIUM não calcula, não confirma e não altera prazo a partir desse registro.

## Canonical authority

- Módulo puro compartilhado: `js/core/suspension-calendar.js`.
- Registro na interface: `js/features/office-identity.js` (Configurações → Identidade do escritório) e `index.html` (seção "Suspensões e indisponibilidades").
- Aviso na leitura da publicação: `js/views/ui-v2/publications-presenter.js` (bloco `publication-suspension-notice`), alimentado por `js/features/publications.js`.
- Validação de estado: `lib/state-migrations.mjs` (`validateAppState`).

## Invariants

- O registro vive em `settings.suspensions` (array opcional, máximo 100 itens), com `start`/`end` em `YYYY-MM-DD` e `end >= start`; `scope` ∈ {`PJe`, `PSPJ`, `DJEN`, `MNI`, `Outro`}; `sourceUrl` aceita apenas HTTP(S).
- O aviso aparece na leitura da publicação cuja data (`publishedAt`, com fallback para `disponibilizadoEm`) cai dentro da janela — limites inclusivos.
- O aviso é **informativo**: nunca cria `deadline`, nunca marca `fatalDeadline`, nunca altera tarefa, tratamento, leitura ou ciência judicial.
- Nenhuma indisponibilidade é inferida automaticamente; o registro é humano e aponta a fonte oficial.

## Allowed operations

- Adicionar e remover registros com data inicial/final, origem, URL da fonte e observação.
- Exibir o aviso de possível prorrogação na leitura da publicação e o link para a fonte registrada.

## Forbidden operations

- Derivar prazo, vencimento ou prorrogação automática do registro.
- Bloquear, atrasar ou alterar tratamento de publicação por causa do registro.
- Registrar dados pessoais, conteúdo judicial ou segredo de justiça no campo de observação/URL.

## State model

`settings.suspensions`: lista normalizada, deduplicada por `id`, ordenada por data inicial. Ausência da chave significa lista vazia (compatível com estados anteriores, sem migration).

## Security boundary

A lista é parte do estado oficial cifrado do workspace; a validação no servidor rejeita formato inválido, datas invertidas e excesso de itens. O aviso renderiza texto escapado e URL apenas HTTP(S).

## Failure semantics

Registro inválido é rejeitado na interface com mensagem; estado persistido inválido falha a validação do servidor (recovery oficial), sem silenciar o problema.

## Persistence semantics

Salvamento pelo contrato oficial (`store.save()` + `flush()`), com `revision`; auditoria registra inclusão/remoção sem PII.

## Relevant tests

`tests/suspension_calendar.mjs`, `tests/ui_v2_publications.mjs`, `tests/office_identity_feature.mjs`, `tests/state_migrations.mjs`.
