---
name: legal-audit
description: Faz revisão adversarial final de peça jurídica, conferindo fatos, datas, jurisprudência, legislação, lógica, pedidos e adequação processual antes da entrega.
---

# Auditoria final adversarial

Revise o rascunho como se você fosse a parte contrária e o magistrado.

## Checklist obrigatório

- Todo fato relevante tem suporte D#?
- Datas, valores, nomes e números processuais batem com a fonte?
- Alguma alegação adversa foi tratada como fato provado?
- Cada J# existe, foi lido e sustenta exatamente a proposição usada?
- Cada L# está vigente/aplicável ao período?
- Há precedente citado apenas por memória do modelo? Remover.
- Há salto lógico entre regra e fatos?
- Há tese incompatível com pedido ou fase processual?
- O cabimento, competência, prazo e interesse estão corretos?
- Todos os argumentos centrais da parte adversa foram enfrentados?
- Existe pedido sem capítulo correspondente ou capítulo sem consequência no pedido?
- Há contradições internas ou repetição excessiva?
- Cálculos foram feitos de modo determinístico?

Classifique achados como `crítico`, `relevante` ou `editorial`. Corrija críticos e relevantes antes de gerar `FINAL.md`.
