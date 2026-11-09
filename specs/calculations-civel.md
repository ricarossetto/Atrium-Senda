# Cálculos cíveis — atualização monetária, juros e consectários

Status: **CURRENT — contrato jurídico da Fase 0; motor cível e conferência oficial integrados; memorial em PDF FUTURE.**

## Objetivo

Fixar os regimes, marcos e critérios que o motor cível deve permitir reproduzir com memória auditável. O contrato não define tese jurídica do caso: o operador escolhe o regime aplicável ao título; o motor calcula, registra o critério escolhido e sua fonte, e não infere nada por conta própria.

## Regimes e marcos

| Vigência | Regime | Correção | Juros | Fundamento |
| --- | --- | --- | --- | --- |
| até 11/01/2003 | CC/1916 | conforme título ou lei | 6% a.a. quando não convencionados | CC/1916, art. 1.062 |
| 12/01/2003 a 29/08/2024 | CC/2002 | conforme título ou lei | 12% a.a. quando não convencionados | CC/2002, art. 406 (redação original) |
| 30/08/2024 em diante | Lei 14.905/2024 | IPCA quando não convencionado nem previsto em lei específica | taxa legal do art. 406 | Lei 14.905/2024; Res. CMN 5.171/2024 |
| Fazenda Pública até 08/12/2021 | Tema 905/STJ (modulado) | IPCA-E a partir de 25/03/2015, entre outros períodos | remuneração da poupança | Lei 11.960/2009; STJ, Tema 905 |
| Fazenda Pública desde 09/12/2021 | EC 113/2021 | SELIC acumulada mensalmente, uma única vez, sobre o débito consolidado em nov/2021 | embutidos na SELIC | EC 113/2021, art. 3º; Res. CNJ 303/2019, arts. 21, 21-A e 22 |
| Precatórios não tributários | Res. CNJ 303/2019 | linha própria (IPCA-E, UFIR, TR, SELIC conforme o período e o período de graça) | juros até nov/2021; SELIC depois | Res. CNJ 303/2019, 448/2022 e 482/2022 |
| Precatórios e débitos federais desde set/2025 | EC 136/2025 | conforme o título | juros simples de 2% a.a., vedados compensatórios | EC 136/2025, art. 3º (conferir leitura do tribunal) |

Regras complementares que o motor deve oferecer como presets, nunca como inferência:

- Multiplicidade de índices no tempo (ex.: INPC até 11/2021 e SELIC a partir de 12/2021) é uma linha do tempo explícita do cálculo, não uma média nem uma escolha automática.
- Teses em discussão em tribunal superior (ex.: STJ, Tema 1368) não são aplicadas automaticamente; o memorial registra o critério adotado e sua fonte.
- Correção de item e juros de item podem ter datas próprias (`dataInicialJuros` distinta da data da parcela), preservando a regra convencional de que custas e despesas recebem apenas atualização, salvo comando em contrário.

## Taxa legal

- Metodologia da Resolução CMN 5.171/2024, com séries publicadas pelo BCB no SGS: `29541` (fator Selic mensal), `29542` (fator IPCA) e `29543` (taxa legal mensal).
- `TL = max(FatorSelic / FatorIPCA − 1; 0) × 100`, com IPCA-15 do mês anterior ao de referência; taxa expressa com 6 casas decimais, com arredondamento NBR 5891:2014.
- Aplicação em juros simples: somam-se as taxas mensais; fração de mês usa pró-rata sobre dias corridos, pelo número de dias corridos do mês de referência.
- Havendo atualização monetária, a taxa legal incide sobre o valor já corrigido (art. 7º da Resolução).

## Multa e honorários

- Multa do art. 523, § 1º, do CPC e honorários têm percentual e base informados pelo operador; o motor não presume base (débito, débito com juros, parcelas vincendas) nem soma automática.
- Percentuais negativos ou acima do teto informado são rejeitados com mensagem explícita.

## Itens e bases

- Cada item declara espécie (débito, amortização, custas, despesa, desconto), data-base, valores, datas de juros e critério aplicável.
- Amortizações e descontos reduzem o saldo sem receber multa, salvo comando expresso; a ordem de imputação é escolha do operador e fica registrada.
- O resultado final discrimina principal, correção, juros, multa, honorários e abatimentos, com a memória linha a linha.

## Conferência oficial de índices

- `POST /api/calc/civel/conferencia-oficial` recalcula a mesma entrada no servidor e compara o fator de cada segmento de correção com a tabela oficial da Fábrica de Cálculos (TRF3), por coluna equivalente da série (IPCA, INPC, IGP-M, IGP-DI, IPCA-E, SELIC e taxa legal).
- A tabela publica a taxa mensal como fração; a conferência multiplica os meses de `de` a `ate` (o `de` da fonte é a primeira competência incluída) e usa `fatorSelic` diretamente para a SELIC.
- Série sem coluna equivalente fica `sem-fonte`; competência ausente fica `sem-dado`; fonte de juros fica `ignorado`. Não há aproximação silenciosa por outra série.
- Tolerância de 0,1% para arredondamento; acima disso a diferença é exibida com o fator do ATRIUM, o fator oficial e o percentual. A conferência é somente leitura, não altera o cálculo e não substitui a revisão humana.

## Operações proibidas

- Inferir automaticamente o índice, o regime, a taxa ou a base de um caso concreto; converter entendimento de tribunal em regra fixa do produto.
- Produzir número sem memória de cálculo, sem fonte de índice ou sem registro do critério escolhido.
- Usar o cálculo como prazo, ciência, parecer ou ato processual.

## Testes relevantes

`tests/calculation_decimal.mjs`, `tests/calculation_indices.mjs`, `tests/calculation_calendar.mjs`, `tests/calculation_regimes.mjs`, `tests/calculation_civel.mjs`, `tests/calculation_spec_contract.mjs`, `tests/calculation_civel_anchor.mjs` (âncora oficial 2025), `tests/calc_conferencia_indices.test.mjs`, `tests/calc_civel_conferencia_http.test.mjs`, `tests/calculation_routes.mjs`, `tests/ui_v2_calculations.mjs`, `tests/visual_ui_v2_calculations.mjs`.
