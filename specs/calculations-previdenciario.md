# Cálculos previdenciários — RGPS (média, coeficiente e RMI)

Status: **CURRENT — motor, rota, aba Previdenciário, importação assistida de CNIS por texto e comparador EC 103; casos-âncora e liquidação FUTURE.**

## Objetivo

Calcular o salário de benefício, o coeficiente e a renda mensal inicial (RMI) do RGPS a partir de um histórico de competências conferido pelo operador, com memória auditável. Ferramenta de apoio: não substitui a conferência do CNIS, não decide estratégia e não requer benefício.

## Regras cobertas

| Etapa | Regra | Fundamento |
| --- | --- | --- |
| Salário de benefício | média aritmética simples dos salários de contribuição informados a partir de 07/1994, dividida pelo número de competências (ou pelo divisor mínimo de 108 quando ativado) | Lei 8.213/1991, art. 29, I, com redação da Lei 13.846/2019; Lei 14.331/2022 |
| Correção do salário de contribuição | teto da época aplicado antes da correção (`min(SC, teto)`), corrigido pelo INPC acumulado da competência até a competência de referência (inclusive), com tetos oficiais embutidos | Lei 8.213/1991, art. 29; tabela oficial de tetos (Portarias MPS/MF); INPC/IBGE (SGS 188) |
| Descarte de 20% | média dos 80% maiores salários corrigidos (PBC pré-reforma), com registro das competências descartadas | Lei 9.876/1999, art. 2º; LC 142/2013 |
| Coeficiente | 60% + 2 pontos percentuais por ano completo que exceder 15 anos (mulher) ou 20 anos (homem) | EC 103/2019, art. 26, § 2º |
| Anos de contribuição | cada 12 competências equivalem a 1 ano completo | EC 103/2019, art. 26, § 2º (leitura de ano completo) |
| RMI | salário de benefício × coeficiente | Lei 8.213/1991, art. 29 |
| Limites | teto e piso informados pelo operador, aplicados ao final | CF/88, art. 201, § 2º |

Limites do MVP (declarados na resposta do motor e nos avisos):

- Os salários de contribuição podem chegar **nominais** (o motor aplica teto da época e INPC) ou já corrigidos; a correção usa a série oficial do INPC embutida (`lib/calc/dados/inpc-mensal.mjs`, com fonte) e aceita série injetada.
- Limite declarado: para competências **anteriores a 2001** a tabela oficial de transição do INSS diverge do INPC puro em parte dos meses; o motor usa o INPC embutido e o descarte dos 20% menores costuma absorver a diferença — a ingestão da tabela oficial de índices das Portarias MPAS permanece FUTURE.
- Regras de transição da EC 103 (pontos, idade progressiva, pedágios), direito adquirido pré-reforma, tempo especial, rural, concomitância e sobreposição não são calculados.
- O descarte de 20% dos menores salários corrigidos é suportado no cálculo de RMI com correção; o descarte de contribuições do art. 26, § 6º, da EC 103 não é implementado.
- Aposentadoria por incapacidade, pensão por morte, auxílios e revisões ficam FUTURE.
- O motor não recebe nem processa CNIS diretamente; a importação assistida vive no fluxo de CNIS da mesma view.

## Análise complementar (PcD, fator e retorno)

`POST /api/calc/previdenciario/complementar` aceita `{ pcd?, fator?, retorno? }` e responde cada bloco presente:

- **PcD (LC 142/2013)**: tempo mínimo por grau e sexo (grave 25/20, moderada 29/24, leve 33/28 anos), carência de 180 meses e RMI de 100% do salário de benefício (sem fator), com teto/piso. Grau declarado é biopsicossocial e exige perícia; conversão de tempo PcD↔comum (Decreto 10.410/2020) não é automática — use o fator informado no painel de tempo.
- **Fator previdenciário**: `(Tc × a / Es) × [1 + (Id + Tc × a) / 100]`, com `a` 0,31 (homem) e 0,26 (mulher); a expectativa de sobrevida (tábua IBGE) é declarada pelo usuário e registrada em aviso.
- **Retorno (ROI)**: bruto com 13º (um por ano completo), IRRF mensal pela tabela 2026, 13º tributado exclusivamente, isenção de 65+ limitada a R$ 1.903,98 (art. 6º, XV, Lei 7.713/1988) e retorno sobre contribuições quando informadas. Projeção estimada, sem reajustes.

Relatórios: a view oferece "Imprimir relatório" (impressão do navegador) com `@media print` que oculta shell, abas, formulário e painéis laterais, mantendo o resultado.

Autoridade executável: `lib/calc/pcd.mjs`, `lib/calc/retorno.mjs`, `lib/http/calc-routes.mjs`; testes `tests/calculation_pcd_retorno.mjs` e `tests/calculation_routes.mjs`.

## Cenário LC 142 de grau constante (trilha versionada)

Status: **CURRENT — motor, rotas, persistência e relatórios em PDF implementados.**

Trilha independente do helper complementar acima. O helper recebe média/tempo prontos e não
é o pipeline de salários/fatores/PBC/tempo; esta trilha é. Perfil comparativo versionado
`lc142-constant-grade-v1`, política `rgps-core-observational-v1`. **Não é regra universal de
cálculo previdenciário e não certifica concessão, deficiência, carência jurídica ou direito
adquirido.**

Escopo: grau constante em todos os períodos, RGPS confirmado, DIB e data-base explícitas,
PBC desde 07/1994 até o mês anterior à DIB, correção composta, descarte de 80%, tempo por
convenção declarada `declared_30_360_inclusive_union`, carência por competências distintas e
RMI de 100% limitada a piso/teto do mês de correção.

Fora de escopo (bloqueio explícito, nunca aproximação): graus mistos, atividade especial, CTC
automática, fator previdenciário, conversão de moeda histórica, rural, revisão de benefício,
benefício atual e juros/atrasados.

### Autoridade

- `lib/calc/lc142.mjs` — motor puro do cenário (envelope `blocked`/`experimental`).
- `lib/calc/lc142-profile.mjs` — constantes, tempo por grau/sexo, códigos de bloqueio.
- `lib/calc/lc142-snapshot.mjs` — validação e proveniência do snapshot, normalização de
  decimal público, fator de correção composto e truncagem de exibição.
- `lib/calc/lc142-overlays.mjs` — ajuste de vínculo e livro de contribuições como overlays
  documentais sobre a origem imutável.
- `lib/calc/calendar-30360.mjs` — convenção 30/360 inclusiva com união de sobreposições.
- `lib/calc/lc142-persistence.mjs` — proveniência, hash oficial, dedupe de snapshot e
  conferência de recálculo.
- `lib/http/calc-lc142-routes.mjs` — rotas autenticadas (ver abaixo).
- `lib/calc/pdf/` — renderer de PDF real nas sete famílias.
- `tests/fixtures/lc142-rust-oracle.json` — 34 cenários sintéticos gerados pelo motor de
  referência no commit `8ec45ec2`; proveniência e licença em `NOTICE.md`.

### Rotas (novas)

- `GET /api/calc/previdenciario/lc142/capacidades` — o que o motor faz e o que **não** faz;
  exige sessão.
- `POST /api/calc/previdenciario/lc142/preview` — calcula sem persistir; corpo
  `{calculation, politica?}`; exige sessão e CSRF; corpo limitado a 512 KiB.
- `POST /api/calc/previdenciario/lc142/validar-hipotese` — aponta bloqueios por campo sem
  calcular; exige sessão e CSRF.
- `POST /api/calc/previdenciario/lc142/relatorio` — exige o cenário oficial e **recalcula no
  servidor** antes de renderizar; nunca aceita RMI do browser; exige sessão e CSRF; corpo
  limitado a 1 MiB. Famílias: `detailed`, `summary`, `periods`, `salaries`, `memory`,
  `transitions`, `indicators`.
- Envelope HTTP é distinto do envelope de domínio: `200` com `status: "blocked"` é resposta
  bem-sucedida de cenário bloqueado, com `data: null`, e **não** é sucesso financeiro.
- Falhas: `400` domínio com mensagem determinística, `409` relatório de cenário bloqueado ou
  conflito de revisão, `413` corpo acima do limite, `422` schema, `429` com `Retry-After` por
  socket. A credencial do provedor nunca trafega no corpo (recusada com `422`) e permanece no
  ambiente do servidor.

### Invariantes específicos

1. Dinheiro, índices, fatores e percentuais usam o decimal `BigInt` de 18 casas; nenhum
   `Number` participa de aritmética ou formatação financeira. Saída monetária é string.
2. O fator de correção é multiplicado integral; apenas a exibição é truncada em 6 casas.
   Arredondamento monetário é `half-up` com meio afastado de zero, 2 casas, uma única vez.
3. Ausência de dado nunca vira zero: ou bloqueio explícito, ou hipótese declarada com
   evidência (`fill_missing_minimum`, `project_at_known_ceiling`).
4. RMI é `null` quando tempo exigido ou carência não se completam; a média nunca é
   apresentada como RMI.
5. Overlay não altera a origem importada; o estado inicial de cada lançamento precisa ser
   idêntico ao importado e o histórico precisa reconstruir o estado atual.
6. `actual_entitlement_verified: false` em todo resultado; nenhum caminho certifica direito.
7. Relatório PDF recompõe o cálculo no servidor; o `resultado` enviado pelo cliente não é
   autoridade.

### Relatórios

Sete famílias em `application/pdf` real (A4, cabeçalho repetido, paginação, fonte padrão com
acentuação portuguesa), com avisos obrigatórios em todas as famílias e identificação do
segurado **desligada por padrão**. O blob é servido com `no-store` e revogado após o uso.

### Matriz de aceitação e limitações

`lib/calc/previdenciario.mjs`, `lib/calc/retorno.mjs` e `lib/calc/projecao.mjs` implementam o motor; item a item validado pelos testes de cálculo nesta pasta.
provado, com que comando, e o que permanece lacuna. A paridade de 34/34 é recorte sintético de
aritmética e guardas; não cobre OCR, HTTP de produção, Store de produção, layout final nem
direito previdenciário.

## Importação assistida de CNIS

- Entradas aceitas: **PDF do Meu INSS** (extrato Relações Previdenciárias e Remunerações), **XLSX/CSV/TXT** e texto colado; modelo CSV para download em `/api/calc/cnis/template`.
- PDF: extração pela camada de texto (`unpdf`) com **portão de qualidade** (caracteres de controle, densidade de palavras, competências e valores reconhecidos). Se o portão reprovar (fontes sem mapa Unicode ou digitalização), o operador roda o **OCR** (`pdftoppm` + `tesseract -l por`, pré-requisitos no servidor) sob demanda, com aviso de conferência obrigatória.
- Extração estruturada: vínculos (CNPJ/empregador/datas), competências com remuneração e indicadores, benefícios, lacunas de contribuição e concomitâncias entre vínculos. Nada é aplicado automaticamente: o operador revisa, seleciona vínculos e confirma.
- Indicadores de pendência não são interpretados nem corrigidos; períodos marcados permanecem sob análise humana.
- Limites: 12 MB por arquivo, 400 páginas de PDF, 80 páginas de OCR, 5.000 linhas de planilha e 800 mil caracteres de texto; falhas de binário, layout ou limite geram erro claro, nunca aplicação parcial.
- PDF/parse binário de PPP e carta de concessão permanecem FUTURE.

## Comparador de regras de transição (EC 103/2019)

Quando a data de nascimento é informada, o motor deriva o tempo a partir das competências e compara as regras lado a lado: direito adquirido (pré-reforma), pontos (art. 15, progressão de 1 ponto/ano com tetos 100/105), idade progressiva (art. 16, +6 meses/ano até 62/65), pedágio de 50% (art. 17), pedágio de 100% (art. 20) e idade permanente (art. 18).

- Cada regra devolve status, faltas (tempo, idade, pontos, carência ou pedágio) e o critério de RMI esperado (`coeficiente-progressivo`, `100%-media`, `fator-previdenciario`).
- O pedágio de 50% exige fator previdenciário (expectativa de sobrevida do IBGE) e por isso é marcado como não calculado; o pedágio de 100% aponta RMI de 100% da média.
- Limites declarados: tempo apurado por competências não considera concomitância, tempo especial, rural ou militar; as projeções usam idade e tempo atuais, sem simular contribuições futuras; as regras antigas do direito adquirido não são recalculadas.
- Referência de conferência: `neimaciel/previdenciario-inss` (MIT), ver `NOTICE.md`.CALCULOS_OPEN_SOURCE_BASE.md`.

## Autoridade

`lib/calc/previdenciario.mjs`, `lib/calc/transicoes.mjs`, `lib/calc/tabelas-atualizacao.mjs`, `lib/calc/dados/` (tetos oficiais e INPC mensal com fonte), `lib/calc/decimal.mjs` e `lib/calc/calendar.mjs`. A rota `POST /api/calc/previdenciario/preview` e a aba previdenciária da view `/calculos` completam a fase.

## Operações proibidas

- Estimar, completar ou interpolar competências; presumir renda.
- Aplicar regra de transição, descarte ou direito adquirido sem cálculo próprio autorizado.
- Produzir RMI sem memória do divisor, do coeficiente e dos limites.
- Tratar o resultado como prazo, ciência, parecer ou ato processual.

## Testes relevantes

`tests/calculation_previdenciario.mjs`, `tests/calculation_atualizacao.mjs`, `tests/calculation_transicoes.mjs`, `tests/calculation_cnis.mjs`, `tests/calculation_cnis_extrato.mjs`, `tests/calculation_cnis_planilha.mjs`, `tests/calculation_cnis_ocr.mjs`, `tests/calculation_cnis_pdf_sintetico.mjs`, `tests/calculation_routes.mjs`, `tests/calculation_spec_contract.mjs`, `tests/ui_v2_calculations.mjs`, `tests/visual_ui_v2_calculations.mjs`.

Trilha LC 142 de grau constante: `tests/calculation_lc142_parity.mjs` (34/34 contra o oráculo e 10 verificações de contrato), `tests/calculation_lc142_routes.mjs` (15 cenários de fronteira HTTP), `tests/calculation_lc142_persistence.mjs` (13 cenários de proveniência/limite/revisão), `tests/calculation_lc142_pdf.mjs` (35 PDFs, 7 famílias, prova com Poppler) e o teste de contrato/DOM da UI. O comparador reutilizável é `tests/lc142-parity-core.mjs` com o adaptador fino `tests/lc142-adapter.mjs`.

FUTURE: `tests/calculation_previdenciario_anchor.mjs` (conferência contra carta de concessão sintética) e liquidação de sentença.
