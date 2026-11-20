# ATRIUM Senda 3.3.0 — 20/11/2026

## Destaques da versão 3.3.0

- **Paridade completa da Central de Cálculos Cíveis e Financeiros**:
  - **Planilha Judicial estendida**: suporte a capitalização simples ou composta (`juros.capitalizacao`), juros compensatórios separados para desapropriação (com opção de incidência de moratórios sobre os compensatórios), multa contratual independente, cumprimento art. 523 §1º CPC (`multa_10` e `multa_e_honorarios_10`), custas finais fixas, cinco perfis jurídicos rápidos e gerador de parcelas mensais recorrentes (`1` a `120` meses).
  - **Série `POUPANCA` contínua**: emenda automática em `04/05/2012` combinando a regra antiga (`SGS 25` até 04/2012) com a regra nova (`SGS 195` a partir de 05/2012).
  - **Sub-abas e exportações**: escolha livre de até 5 índices no comparativo da aba Correção e Deflação, seletor Simples/Composta no Solver TVM, download do `.htm` reparado com `https://`, cópia da minuta de notificação locatícia, *Copiar p/ petição* e *Exportar CSV* analítico para todas as planilhas cíveis e financeiras.

## Conferência

- Conferida a suíte completa de cálculos (`25` arquivos de `test:calc`), manifesto de assets, verificação sintática, contrato de release e auditoria visual em desktop e mobile via Playwright.
