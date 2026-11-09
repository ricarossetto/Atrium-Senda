# Cálculos trabalhistas — verbas rescisórias

Status: **CURRENT — motor, rotas, aba Trabalhista e tributação automática 2026; vigências históricas e casos-âncora FUTURE.**

## Objetivo

Calcular verbas rescisórias com regras da CLT e legislação complementar, produzindo memória auditável por verba e por fundamento. Ferramenta de apoio: não substitui a conferência do operador, não fixa tese e não pratica ato.

## Regras cobertas

| Verba | Regra | Fundamento |
| --- | --- | --- |
| Saldo de salário | salário ÷ 30 × dias trabalhados (máx. 30) | CLT, art. 462 e prática de liquidação |
| Aviso prévio | 30 dias + 3 por ano completo, teto 90; acordo paga metade | CLT, art. 487; Lei 12.506/2011; CLT, art. 484-A |
| Projeção do aviso indenizado | integra tempo de serviço para 13º e férias proporcionais (dias inteiros, truncado) | Súmula 371 do TST |
| 13º proporcional | 1/12 por mês com 15 dias ou mais de trabalho | Lei 4.090/1962, art. 1º, § 2º |
| Férias proporcionais | 1/12 por mês com 15 dias ou mais, acrescidas de 1/3 | Súmula 261 do TST; CF/88, art. 7º, XVII |
| Férias vencidas | 1 período por quantidade informada, com 1/3 | CLT, arts. 130 e 142 |
| Multa do FGTS | 40% sem justa causa; 20% no acordo do art. 484-A; zero nas demais | Lei 8.036/1990, art. 18; CLT, art. 484-A |
| Pedido de demissão com aviso descontado | desconto de 30 dias de salário | CLT, art. 487, § 2º |
| INSS do saldo e do 13º | progressivo por faixas, 13º em separado, teto de contribuição | Lei 8.212/1991, art. 28; Lei 8.620/1993, art. 7º; Portaria MPS/MF vigente |
| IRRF do saldo | deduções legais × desconto simplificado (o menor imposto) e redutor da isenção | Lei 9.250/1995; Lei 15.191/2025; Lei 15.270/2025 |
| IRRF do 13º | imposto exclusivo de fonte com INSS e dependentes e redutor estendido ao 13º | Decreto 9.580/2018, art. 700; Lei 15.270/2025, art. 2º, § 3º |

Exclusões por tipo de desligamento (explícitas na memória):

- Justa causa: sem aviso, sem 13º proporcional, sem férias proporcionais e sem multa (Súmula 171 do TST preserva apenas férias vencidas).
- Término de contrato a prazo: saída sem aviso no MVP; rescisão antecipada fica FUTURE.
- Pedido de demissão e justa causa: multa zero.

## Limites do MVP (declarados, não silenciosos)

- A tributação automática cobre apenas a vigência fiscal de 2026 (Portaria MPS/MF 13/2026, Lei 15.191/2025 e Lei 15.270/2025). Para anos sem vigência cadastrada o motor falha com mensagem explícita e o operador informa os descontos manualmente; vigências históricas ficam FUTURE.
- Férias indenizadas e aviso prévio indenizado ficam isentos por padrão, com aviso de conferência do caso concreto; pensão alimentícia e outras deduções entram apenas na base do IRRF.
- O saldo do FGTS é informado; o motor não estima depósitos mês a mês.
- Correção monetária e juros trabalhistas (ADC 58 e EC 113/2021) não são automatizados nesta fase: o título e a tese aplicável são conferidos pelo operador, e o módulo cível aceita a linha do tempo explícita.
- Férias vencidas em dobro, intervalo suprimido, horas extras e adicionais ficam fora desta fase.
- A referência funcional é o PJe-Calc (CSJT), sem reutilização de código; a base open source auditada está em `docs/development/CALCULOS_OPEN_SOURCE_BASE.md`.

## Autoridade

`lib/calc/trabalhista.mjs` (motor), `lib/calc/tabelas.mjs` (vigências fiscais com fonte), `lib/http/calc-routes.mjs` (rota de preview), `lib/calc/calendar.mjs` e `lib/calc/decimal.mjs` (fundação). Regras de correção permanecem em `specs/calculations-civel.md`; bases open source auditadas em `docs/development/CALCULOS_OPEN_SOURCE_BASE.md`.

## Operações proibidas

- Estimar saldo de FGTS, médias, horas extras ou encargos sem dado informado.
- Presumir verbas de justa causa ou de acordo sem escolher o tipo de desligamento.
- Produzir valor sem memória por verba e sem fundamento.
- Tratar o resultado como prazo, ciência, parecer ou ato processual.

## Testes relevantes

`tests/calculation_trabalhista.mjs`, `tests/calculation_tabelas.mjs`, `tests/calculation_routes.mjs`, `tests/calculation_spec_contract.mjs`, `tests/ui_v2_calculations.mjs`, `tests/visual_ui_v2_calculations.mjs`. FUTURE: `tests/calculation_trabalhista_anchor.mjs` (casos-âncora contra o PJe-Calc Cidadão).
