# Política de importação

Status: **CURRENT**

## Purpose

Receber dados externos de forma supervisionada, determinística e não destrutiva.

## Canonical authority

`scripts/import-spreadsheet.mjs`, `scripts/import-legal-data.mjs`, `js/features/importer.js` e rotas de importação em `server.mjs`.

## Invariants

- Preview/staging é transitório; commit é ação explícita.
- Deduplicação usa identidades estáveis e preserva dados manuais significativos.
- Importação não infere prazo jurídico nem converte automaticamente entidades fora do contrato.
- Campos desconhecidos legítimos são preservados quando o merge canônico prevê.

## Allowed operations

- Ler CSV/XLSX/JSON suportado, mapear, validar, exibir preview e confirmar importação.
- Upsert por chaves canônicas e consolidation explícita.

## Forbidden operations

- Sobrescrever silenciosamente registro manual, executar fórmula de planilha, importar segredo/PII para logs ou confirmar antes do flush.
- Criar prazo, enviar e-mail ou praticar ato judicial como efeito do import.

## State model

Arquivo selecionado → preview/staging → confirmação → merge canônico → flush; cancelamento descarta staging.

## Security boundary

Nome/tamanho/tipo e conteúdo são validados; dados externos não viram HTML executável nem authority de ator/role.

## Failure semantics

Erro de parsing/validação/flush mantém estado anterior e não mostra falso sucesso; conflitos permanecem explícitos.

## Persistence semantics

Somente confirmação válida produz upserts e flush revisionado; preview não persiste.

## Relevant tests

`tests/importer.mjs`, `tests/importer_feature.mjs`, `tests/ui_v2_importer.mjs`, `tests/ui_v2_importer_accessibility.mjs`.
