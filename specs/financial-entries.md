# Lançamentos financeiros

Status: CURRENT

## Autoridade
js/features/financial.js, js/views/ui-v2/financial-presenter.js, Store canônico, /api/state e lib/state-migrations.mjs.

## Vínculos
- Processos preservam contratos, requisições, expenses, receipts e feeInstallments existentes.
- Contatos aceitam expenses, receipts e feeInstallments diretamente; não criam processo fictício. Requisições e contratos deste fluxo exigem processo.
- Despesas operacionais sem vínculo usam a coleção opcional officeExpenses do mesmo estado canônico cifrado. Ausência significa coleção vazia; nenhum registro histórico é movido.
- Não há segundo Store, banco ou transporte financeiro. Registros são persistidos com save/flush e revisão; falha não é apresentada como sucesso.
- officeExpenses exige array limitado, ID e descrição não vazios, valor numérico finito não negativo e status pendente, pago ou reembolsado.

## UI e segurança
A pesquisa local resolve IDs de processos/contatos ou a opção Escritório, sem requests de busca. Edição textual limpa a identidade selecionada. Estado permanece privado e cifrado; backup/restauração seguem o contrato do Store.

## Testes

A linha financeira abre edição por clique ou Enter/Espaço. Na edição de despesas, vínculo, descrição, valor, data e situação são editáveis; o tipo pode ser corrigido para recebimento ou parcela, respeitando os vínculos permitidos. A transferência remove o original e insere o atualizado no mesmo save/flush, preservando ID e createdAt. Outros tipos mantêm vínculo e tipo; despesas, parcelas e recebimentos atualizam o registro pelo ID, preservando createdAt e campos adicionais. Requisições e honorários simples atualizam os campos canônicos do processo; modalidades não suportadas pelo formulário mantêm abertura do processo. O link explícito de processo continua navegando ao processo.
Descrições de despesas oferecem sugestões de custos do escritório e custos processuais, sem impedir descrição livre nem introduzir categoria obrigatória ou migration. Save/flush deve confirmar a edição antes de fechar o formulário.
tests/financial_office_entries.mjs, tests/financial_feature.mjs, tests/state_migrations.mjs.

A exclusão de despesa fica no painel de edição e exige confirmação em diálogo interno, com descrição e valor do registro salvo. Cancelar/Escape preserva a despesa. Exclusão e transferência não fecham o painel nem exibem sucesso antes do flush confirmado; falha restaura o estado e permite nova tentativa.
