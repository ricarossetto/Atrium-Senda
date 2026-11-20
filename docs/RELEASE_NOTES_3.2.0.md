# ATRIUM Senda 3.2.0 — 20/11/2026

## Destaques da versão 3.2.0

- **Central de Cálculos Cíveis e Financeiros liberada nativamente no ATRIUM Senda**:
  - **Planilha Judicial (Lei 14.905/2024 e Res. CMN 5.171/2024)** com opção de transição automática em `30/08/2024` (CC/1916 0,5% a.m., CC/2002 1% a.m. até 29/08/2024 e Taxa Legal a partir de 30/08/2024), multa e honorários do art. 523 do CPC e conferência oficial de índices.
  - **Atualização Monetária e Desatualização Reversa** (`1 / fator`) com pró-rata por dias corridos, expurgo opcional de deflação e comparativo simultâneo entre índices (`IPCA`, `INPC`, `IGP-M`, `TR`).
  - **Tabelas PRICE e SAC Analíticas** com entrada, tarifas financiadas, cálculo de CET mensal simplificado, carência (juros pagos ou capitalizados), comparativo PRICE × SAC e absorção exata de centavos na última parcela.
  - **Financiamento Imobiliário SFH (`SACRE`, `SAC` e `PRICE`)** com atualização mensal pela TR, recálculo cíclico, seguros `MIP` e `DFI`, taxa de administração (`TCA`), arredondamento bancário `half-down` (paridade 120/120 parcelas) e comparativo triplo.
  - **Equivalência de Taxas (7 Bases Temporais) e Solver TVM** (`PV`, `FV`, `PMT`, `Taxa` e `Prazo`, postecipado e antecipado).
  - **Reajuste de Aluguéis e Contratos** com cláusula de congelamento em deflação (piso 0%) e geração automática de minuta de notificação locatícia.
  - **Auditor e Importador de Planilhas `.HTM` Legadas** com reparo automático de referências `http://` anteriores a `01/06/2023` para `https://` e envio direto das parcelas extraídas para a Planilha Judicial.
- **Pacote de Correções do BugHunt Integrado**:
  - Segurança e privacidade (`lib/security.mjs`, `lib/security/network-guard.mjs`, `lib/office/access-control.mjs`), consistência do `Store` (`js/core/store.js`, `js/core/state-rebase.js`) e correções completas nos motores cível, trabalhista, tempo de contribuição e LC 142.
