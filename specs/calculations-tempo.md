# Tempo de contribuição e qualidade de segurado

Status: contrato vigente da Fase B do módulo Cálculos. Autoridade executável: `lib/calc/tempo-contribuicao.mjs` e `tests/calculation_tempo.mjs`.

## Escopo

Contabilizar tempo de contribuição declarado por vínculos (empregado, doméstico, contribuinte individual, avulso, facultativo, rural, especial, servidor) com:

- dias inclusivos por vínculo;
- **concomitância**: apenas a parcela não sobreposta é somada, e o vínculo sobreposto é marcado (`concomitante`), nunca silenciado;
- **fator** opcional por vínculo (ex.: conversão de tempo especial), aplicado sobre os dias;
- **marcos** EC 20/1998 (`1998-12-16`) e EC 103/2019 (`2019-11-13`): dias até cada marco e posteriores;
- **carência**: meses distintos cobertos por vínculo com ao menos um dia;
- totais em anos/meses/dias derivados dos dias efetivos (ano de 365 e mês de 30 dias, critério declarado).

Qualidade de segurado (período de graça):

- 12 meses após a última contribuição;
- prorrogação para 24 meses com 120 ou mais contribuições mensais (art. 15, § 1º, Lei 8.213/1991);
- acréscimo de 12 meses com desemprego comprovado, sempre declarado e com aviso de exigência documental;
- o período termina no último dia do mês de vencimento;
- `mantemQualidade` compara a data de referência com o fim do período quando informada.

## Limites declarados

- Tempo especial, rural e PcD não são enquadrados nem convertidos automaticamente; fator é informado pelo usuário com aviso.
- A conversão dias → anos/meses/dias usa 365/30 dias, não a tabela oficial de frações do INSS.
- O motor não lê CNIS diretamente; a importação assistida preenche os vínculos na view, e a conferência humana permanece obrigatória.
- Período de graça não verifica causas específicas de manutenção (incapacidade, serviço militar, etc.).

## Contrato

`calcularTempoContribuicao({ vinculos, dataReferencia })` → `{ vinculos, totalDias, totalDiasEfetivos, total, carenciaMeses, marcos, avisos }`.

`calcularPeriodoGraca({ ultimaContribuicao, contribuicoesMeses, dataReferencia, desempregoComprovado })` → `{ mesesPeriodo, prorrogacao, acrescimoDesemprego, fimPeriodo, mantemQualidade, avisos }`.

Erros de entrada lançam `TempoContribuicaoError`.

## Testes

`tests/calculation_tempo.mjs` cobre vínculo simples, concomitância, fator, vínculo em aberto, marcos, carência, período de graça 12/24, desemprego, perda e guardas. Adicionar ao `test:calc`.
