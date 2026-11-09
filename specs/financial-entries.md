# Lançamentos financeiros

Status: CURRENT

## Autoridade
js/features/financial.js, js/views/ui-v2/financial-presenter.js, Store oficial, /api/state e lib/state-migrations.mjs.

## Vínculos
- Processos preservam contratos, requisições, expenses, receipts e feeInstallments existentes.
- Contatos aceitam expenses, receipts e feeInstallments diretamente; não criam processo fictício. Requisições e contratos deste fluxo exigem processo.
- Despesas operacionais sem vínculo usam a coleção opcional officeExpenses do mesmo estado oficial cifrado. Ausência significa coleção vazia; nenhum registro histórico é movido.
- Não há segundo Store, banco ou transporte financeiro. Registros são persistidos com save/flush e revisão; falha não é apresentada como sucesso.
- officeExpenses exige array limitado, ID e descrição não vazios, valor numérico finito não negativo e status pendente, pago ou reembolsado.

## UI e segurança
A pesquisa local resolve IDs de processos/contatos ou a opção Escritório, sem requests de busca. Edição textual limpa a identidade selecionada. Estado permanece privado e cifrado; backup/restauração seguem o contrato do Store.
A carteira renderiza no máximo uma página por vez (padrão 100 por página; opções 100, 500 ou 1000 no rodapé) para preservar a responsividade com milhares de lançamentos. Paginação é preferência de apresentação local, sem Store paralelo, revision, request, auditoria ou timer: busca, filtro e tamanho resetam para a página 1; a navegação entre páginas a preserva. Métricas e edição por índice global (`visibleRecords`) usam a coleção integral.

## Testes

A linha financeira abre edição por clique ou Enter/Espaço. Na edição de despesas, vínculo, descrição, valor, data e situação são editáveis; o tipo pode ser corrigido para recebimento ou parcela, respeitando os vínculos permitidos. A transferência remove o original e insere o atualizado no mesmo save/flush, preservando ID e createdAt. Outros tipos mantêm vínculo e tipo; despesas, parcelas e recebimentos atualizam o registro pelo ID, preservando createdAt e campos adicionais. Requisições e honorários simples atualizam os campos oficiais do processo; modalidades não suportadas pelo formulário mantêm abertura do processo. O link explícito de processo continua navegando ao processo.
Descrições de despesas oferecem sugestões de custos do escritório e custos processuais, sem impedir descrição livre nem introduzir categoria obrigatória ou migration. Save/flush deve confirmar a edição antes de fechar o formulário.
tests/financial_office_entries.mjs, tests/financial_feature.mjs, tests/ui_v2_financial_pagination.mjs, tests/state_migrations.mjs.

A exclusão de despesa fica no painel de edição e exige confirmação em diálogo interno, com descrição e valor do registro salvo. Cancelar/Escape preserva a despesa. Exclusão e transferência não fecham o painel nem exibem sucesso antes do flush confirmado; falha restaura o estado e permite nova tentativa.

## Triagem assistiva da carteira (F5)

O classificador assistido sugere, por lançamento com descrição livre, um **bucket de conferência** — honorários, custas, reembolso, RPV/alvará, despesa operacional ou outros — gravado apenas no derivado `financial-triage.json` do workspace. Contratos:

- é **selo de conferência**: nunca cria, edita, paga, reembolsa ou transfere lançamento; nunca grava `category` (campo que não existe) nem introduz categoria obrigatória ou migration;
- a descrição continua livre e a sugestão não bloqueia salvar;
- o texto enviado é descrição, tipo e processo vinculado; **nome de cliente nunca é enviado**;
- rotas `GET /api/ai-classifier/financial-suggestions` (autenticado) e `POST /api/ai-classifier/triage-financial` (autenticado + CSRF + rate limit, 50 lançamentos por invocação, falha isolada por item), com o mesmo gancho pós-sincronização dos outros derivados;
- UI: selo na linha (desktop e mobile) e filtro **"Com sugestão"**, que recorta a carteira sem alterar métricas nem os demais filtros;
- requisitções/RPV e honorários contratuais são dirigidos por status do tribunal e ficam fora do escopo (sem descrição livre).

Teste de contrato: `tests/financial_triage.mjs`.

## Leitura gráfica da carteira (6.38.1)

A view Financeiro pode exibir dois gráficos derivados do mesmo recorte filtrado: **receitas × despesas por mês de vencimento** e **distribuição por categoria**.

- São leitura pura: não criam Store, `revision`, request, categoria, migration nem alteram métricas ou tabela. Registros sem data entram apenas na distribuição por categoria; o gráfico de barras mostra estado vazio honesto quando não há data.
- Cada gráfico tem resumo acessível e tabela alternativa em `<details>`. Filtro e busca são os mesmos da carteira.
- Teste: `tests/ui_v2_financial_chart.mjs`.
