# Cálculos judiciais (Atrium Cálculos)

Status: **CURRENT — Fase 0 completa (motor, rotas, view e persistência oficial); integração oficial da Fábrica de Cálculos (TRF3/PDPJ-Br) para índices, leitura documental e cálculos RGPS, com CNIS oficial na importação; memorial em PDF e casos-âncora FUTURE.**

## Propósito

O módulo de Cálculos do ATRIUM produz memória de cálculo auditável para débitos judiciais, começando pelo cível e pela atualização monetária (`specs/calculations-civel.md`). É ferramenta de apoio: não é parecer, não valida estratégia processual, não abre prazo, não dá ciência e não pratica ato. O resultado exige conferência humana antes de qualquer uso processual.

## Autoridade

- `lib/calc/decimal.mjs` — aritmética decimal determinística.
- `lib/calc/indices.mjs` — catálogo de séries oficiais (BCB/SGS), normalização, fatores acumulados e pró-rata.
- `lib/calc/calendar.mjs` — datas reais, frações de mês (início exclusivo, fim inclusivo) e intervalos.
- `lib/calc/regimes.mjs` — trilhas de regimes civis (geral, Fazenda Pública, precatórios), taxa legal auditável e comparação com a série publicada.
- `lib/calc/cnis.mjs` — parser de texto colado.
- `lib/calc/cnis-pdf.mjs` — extração de texto (unpdf) e portão de qualidade.
- `lib/calc/cnis-extrato.mjs` — extração estruturada (vínculos, competências, indicadores, benefícios, lacunas e concomitâncias).
- `lib/calc/cnis-planilha.mjs` — XLSX/CSV e modelo para download.
- `lib/calc/cnis-ocr.mjs` — fallback OCR (pdftoppm + tesseract) com dependências injetáveis.
- `lib/calc/tabelas.mjs` — vigências fiscais com fonte (INSS, IRRF, redutor, dependente e simplificado).
- `lib/calc/transicoes.mjs` — comparador de regras de transição da EC 103 a partir das competências e da data de nascimento.
- `docs/development/CALCULOS_OPEN_SOURCE_BASE.md` — bases open source auditadas, licenças e o que foi assimilado.
- `lib/calc/civel.mjs` — motor cível: itens, correção, juros, multa, honorários, abatimentos e memorial.
- `lib/calc/tribunais.mjs` — catálogo de tabelas por órgão com fonte HTTPS, status de curadoria e alerta de defasagem.
- `lib/calc/source.mjs` — provedor de séries SGS com aliases, cache e transporte injetável.
- `lib/calc/fabrica.mjs` — cliente read-only da Fábrica de Cálculos (TRF3/PDPJ-Br): `x-api-key` (`FC_API_KEY`), cotas por minuto com `429`/`Retry-After`, leitura documental multipart e cálculos RGPS; nunca loga payload com PII e falha fechada sem chave (`FABRICA_NOT_CONFIGURED`).
- `lib/calc/cnis-oficial.mjs` — converte a extração oficial do CNIS (`documentos/cnis/ler`) para o mesmo contrato da leitura local (`vinculos`, `competencias`, `resumo`, `avisos`) e une vínculos sem duplicar.
- `lib/http/calc-routes.mjs` — rotas autenticadas `/api/calc/*`.
- `js/views/ui-v2/calculations-presenter.js`, `js/features/calculations.js`, `css/views/ui-v2/calculations.css` — view `/calculos`, presenter puro e feature que delega ao backend.
- `lib/calc/persistence.mjs` — validação, sanitização e compactação dos cálculos salvos.
- FUTURE (Fase 0): `lib/calc/memorial.mjs` (exportação do memorial).
- Regras jurídicas do cível: `specs/calculations-civel.md`.

## Invariantes

1. Dinheiro e taxas usam inteiro `BigInt` com 18 casas (`lib/calc/decimal.mjs`); nenhum `Number` com ponto flutuante participa de soma, produto, divisão, arredondamento ou formatação de valor.
2. Arredondamento é explícito: `half-up` para valores monetários e `half-even` (ABNT NBR 5891:2014) para o fechamento da taxa legal mensal, expressa com 6 casas.
3. A taxa legal mensal segue a Resolução CMN 5.171/2024: `TL = max(FatorSelic / FatorIPCA − 1, 0)`, aplicada em juros simples, com pró-rata por dias corridos.
4. Séries e tabelas têm proveniência: identificador oficial (ex.: código SGS), origem, vigência e hash do snapshot. Índice sem fonte verificável não entra no motor.
5. Série com mês ausente no período pedido falha de forma explícita; o motor nunca interpola, completa ou silencia lacuna.
6. O motor é puro e determinístico: funções de cálculo não fazem I/O de rede; o transporte é injetável (`fetchImpl`).
7. Nenhum item `FUTURE` desta spec pode ser apresentado como capacidade disponível.
8. Cálculo não infere prazo jurídico nem tese: regime e índice aplicáveis são escolhas explícitas do operador ou do título, registradas no resultado.

## Operações permitidas

- Parsear, somar, subtrair, multiplicar, dividir, comparar e arredondar decimais escalados (`decimal.mjs`).
- Converter percentual em fator, aplicar fator, calcular juros simples e pró-rata.
- Normalizar respostas do SGS (`dd/MM/yyyy`, `valor` textual) e encadear variações mensais em fatores acumulados.
- Buscar séries do catálogo com divisão em janelas de 10 anos (limite do SGS) e transporte injetável.
- FUTURE: montar itens de débito, amortizações, custas e despesas, multa do art. 523 §1º do CPC e honorários conforme o regime escolhido.

## Rotas

- `GET /api/calc/catalog` — espécies, linhas do tempo de regime, catálogo de séries e resumo das tabelas; exige sessão.
- `GET /api/calc/tables` — catálogo completo das tabelas com fonte, status de curadoria e notas; exige sessão.
- `GET /api/calc/series/{chave}?from=AAAA-MM-DD&to=AAAA-MM-DD` — pontos normalizados da série, com última competência; janela máxima de 20 anos; exige sessão.
- `POST /api/calc/civel/preview` — calcula sem persistir nada; exige sessão e CSRF; corpo limitado a 512 KiB.
- `POST /api/calc/trabalhista/preview` — verbas rescisórias sem persistir nada; exige sessão e CSRF; corpo limitado a 512 KiB.
- `POST /api/calc/previdenciario/preview` — média, coeficiente e RMI do RGPS sem persistir nada; exige sessão e CSRF; corpo limitado a 512 KiB.
- `POST /api/calc/cnis/parse` — extrai competências de PDF, XLSX/CSV/TXT ou texto colado, com portão de qualidade e OCR sob demanda; exige sessão e CSRF; corpo limitado a 12 MB.
- `POST /api/calc/cnis/importar` — importação unificada: usa a extração oficial da Fábrica de Cálculos quando `FC_API_KEY` está configurada e cai para a leitura local com aviso honesto quando a oficial falha ou não reconhece o documento; mesmo contrato de resposta (`fonte`, `vinculos`, `competencias`, `resumo`, `avisos`); exige sessão e CSRF; corpo limitado a 12 MB.
- `GET /api/calc/cnis/template` — modelo CSV de competências e remunerações para download.
- `GET /api/calc/fabrica/status` — estado da integração (`configured`, `baseUrl`, limites oficiais); exige sessão.
- `GET /api/calc/fabrica/indices?tabela=...` — índices oficiais (`tabela`, `reajuste`, `moedas`, `tabua-mortalidade`, `adiantamento`, `os121`); exige sessão.
- `POST /api/calc/fabrica/documentos` — leitura oficial de `cnis`, `carta`, `rdctc`, `pap` e `prevjud` (PDF em base64 ou texto); exige sessão e CSRF; corpo limitado a 12 MB.
- `POST /api/calc/fabrica/calculo/{tipo}` — cálculos oficiais (`tempo`, `tempo-grupos`, `tempo-prevjud`, `atrasados`, `rmi`, `rmi-fundamento`, `rmi-desvinculada`); exige sessão e CSRF; corpo limitado a 512 KiB.
- Rotas da Fábrica falham fechadas sem chave: `409 FABRICA_NOT_CONFIGURED` (código interno; a resposta pública mantém apenas a mensagem) e nunca devolvem sucesso presumido.
- Falhas de domínio respondem 400 com mensagem determinística; limite de 60 requisições por minuto por socket responde 429 com `Retry-After`.

## UI

- A view `/calculos` é V2 e vive em `index.html` como `#view-calculations`, com o workspace `#calculationsWorkspace` renderizado pelo presenter e abas Cível, Trabalhista e Previdenciário.
- O presenter é puro: não acessa Store, rede, storage ou CSRF; a feature usa o `secureFetch` oficial e mantém o estado do formulário apenas em memória.
- Valores em moeda são formatados em pt-BR; o conteúdo digitado é escapado no HTML; o formulário informa o limite de ferramenta de apoio (não abre prazo, não produz ciência).
- A importação de CNIS aceita texto colado, PDF/planilha anexada (`data-prev-file`), extração oficial (selo "Fábrica de Cálculos (TRF3)") e OCR local sob demanda; os vínculos extraídos entram na aba Tempo de contribuição e os avisos da fonte permanecem visíveis para conferência humana.
- O catálogo é carregado sob demanda ao abrir a view; salvar, abrir e excluir usam o Store oficial e a lista de salvos aparece abaixo do formulário.

## Operações proibidas

- Aritmética monetária com `Number` ou ponto flutuante; arredondar etapa intermediária de juros, fator ou parcela sem necessidade documentada.
- Inventar índice, tabela, período ou fundamento; usar série sem código e origem verificáveis.
- Tratar o cálculo como parecer, prazo, ciência ou ato processual; automatizar envio, protocolo ou peticionamento.
- Usar IA ou LLM para produzir aritmética, fator ou memória de cálculo.
- Criar Store, banco ou fila paralelos; duplicar persistência fora do estado oficial.
- Expor no navegador tabela bruta, segredo, caminho de arquivo ou dado de outro workspace.

## Modelo de estado

Cálculos salvos vivem na coleção opcional `calculations` do app-state do workspace, com `id`, `tipo` (`civel`, `trabalhista`, `previdenciario`), `titulo`, `entrada` (input oficial do motor), `resultado` (memória congelada), `createdAt`, `createdBy`, `schemaVersion` do registro. O servidor valida cada registro em `validateAppState` (máximo de 200 registros e 150k caracteres por registro); a sanitização remove chaves perigosas e, quando o resultado excede o teto, compacta a memória mensal dos juros sinalizando `memoriaCompactada` sem alterar totais. Não existe segundo Store nem arquivo paralelo.

## Fronteira de segurança

- Somente leitura de fontes públicas oficiais; nenhuma credencial de tribunal, certificado ou dado de cliente é enviado a terceiros.
- A chave da Fábrica de Cálculos vive apenas no ambiente do servidor (`FC_API_KEY`) e nunca chega ao navegador; payloads documentais (CNIS/Carta/RDCTC/PAP/PrevJud) não são logados nem persistidos pela integração, e a resposta segue apenas para o fluxo autenticado da UI.
- FUTURE: rotas autenticadas com RBAC por workspace e CSRF obrigatório em mutação; auditoria segue `specs/audit-policy.md`.
- Valores e partes de um cálculo herdam a cifra e o isolamento do estado oficial.

## Semântica de falha

- `DecimalError` e `IndicesError` carregam mensagem determinística e identificam valor ou período rejeitado.
- Falha de rede ou resposta inválida do SGS propaga erro; nenhum fallback silencioso e nenhuma tabela embutida finge atualidade.
- Divergência de período, série vazia ou hash divergente bloqueiam o cálculo; a conferência humana decide.

## Semântica de persistência

Salvar usa o caminho oficial do Store: `Store.upsert('calculations', registro)` seguido de `flush` com `revision`; conflito 409 permanece visível e recarrega a versão mais recente, e falha de flush mantém o erro visível sem auditar nem anunciar sucesso. Abrir restaura a entrada nos formulários e exibe o resultado congelado (memória compactada aparece marcada). Excluir exige confirmação em dois passos e falha de flush restaura a lista ao recarregar.

## Testes relevantes

`tests/calculation_decimal.mjs`, `tests/calculation_indices.mjs`, `tests/calculation_calendar.mjs`, `tests/calculation_regimes.mjs`, `tests/calculation_tabelas.mjs`, `tests/calculation_civel.mjs`, `tests/calculation_trabalhista.mjs`, `tests/calculation_previdenciario.mjs`, `tests/calculation_transicoes.mjs`, `tests/calculation_cnis.mjs`, `tests/calculation_cnis_extrato.mjs`, `tests/calculation_cnis_planilha.mjs`, `tests/calculation_cnis_ocr.mjs`, `tests/calculation_cnis_pdf_sintetico.mjs`, `tests/calculation_tribunais.mjs`, `tests/calculation_routes.mjs`, `tests/fabrica-calculos.test.mjs`, `tests/calculation_persistence.mjs`, `tests/calculation_server_wiring.mjs`, `tests/calculation_spec_contract.mjs`, `tests/ui_v2_calculations.mjs`, `tests/visual_ui_v2_calculations.mjs`. FUTURE: `tests/calculation_civel_anchor.mjs`, `tests/calculation_trabalhista_anchor.mjs`, `tests/calculation_previdenciario_anchor.mjs` (casos-âncora contra ferramentas oficiais).

## Não-objetivos

Substituir software jurídico, conferência humana ou laudo pericial; decidir tese; calcular prazo; simular benefício previdenciário ou verbas trabalhistas nesta fase; publicar automaticamente; tratar a extração oficial (Fábrica de Cálculos) ou a leitura local do CNIS como cálculo concluído sem conferência humana.
