// Atrium — Catálogo de Skills Nativas do Agente Jurídico Codex
(function(root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) { module.exports = data; }
  if (typeof root === 'object' && root) { root.CODEX_LEGAL_SKILLS = data; }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function() {
  return [
  {
    "id": "fazenda-publica-cumprimento",
    "name": "fazenda-publica-cumprimento",
    "title": "Cumprimento contra Fazenda Pública",
    "description": "Analisa cumprimento de sentença contra Fazenda Pública, arts. 534-535 CPC, cálculos, RPV/precatório e honorários. Use em execução/cumprimento contra ente público.",
    "instructions": "# Cumprimento contra Fazenda Pública\n\n- Identifique título, trânsito em julgado e parâmetros efetivamente cobertos pela coisa julgada.\n- Separe principal, correção, juros, honorários e parcelas incontroversas.\n- Verifique regime dos arts. 534 e 535 do CPC e forma de pagamento por RPV/precatório.\n- Não aplique automaticamente regras do art. 523 incompatíveis com o regime fazendário.\n- Em honorários, pesquise a hipótese processual concreta e precedentes vinculantes/repetitivos pertinentes."
  },
  {
    "id": "legal-agent",
    "name": "legal-agent",
    "title": "Legal Agent Orchestrator",
    "description": "Orquestra análise de autos, planejamento, pesquisa jurídica, redação e auditoria de petições brasileiras. Use quando o usuário pedir para elaborar, revisar substancialmente, impugnar, recorrer, responder ou estruturar uma peça jurídica com base em documentos/processo.",
    "instructions": "# Legal Agent Orchestrator\n\nExecute uma peça jurídica como pipeline, não como resposta única improvisada.\n\n## Entrada\n\n- Instrução atual do usuário;\n- arquivos anexados e/ou `workspace/inbox/`;\n- eventuais restrições de estilo;\n- jurisdição, tribunal e fase processual inferíveis dos autos.\n\n## Fase 1 — Ingestão\n\nLeia todos os documentos relevantes antes de definir a tese. Invoque/consulte o skill `legal-ingest`.\n\nCrie `00_request.md`, `01_sources.md` e `02_timeline.md`.\n\n## Fase 2 — Issues\n\nUse `legal-planner` para identificar:\n\n- pretensão e providência processual adequada;\n- fatos constitutivos, impeditivos, modificativos e extintivos relevantes;\n- preliminares e prejudiciais;\n- prazos, preclusões, coisa julgada e competência;\n- provas favoráveis e desfavoráveis;\n- argumentos adversos previsíveis;\n- lacunas realmente relevantes.\n\nSalve `03_issues.md`.\n\n## Fase 3 — Plano\n\nPara cada capítulo, registre:\n\n- objetivo;\n- conclusão pretendida;\n- fatos D# necessários;\n- claims jurídicos que exigem J#/L#;\n- contra-argumento a enfrentar;\n- pedido relacionado.\n\nSalve `04_plan.md` antes de redigir.\n\n## Fase 4 — Pesquisa\n\nUse `legal-research-br` claim por claim. Não pesquise jurisprudência de forma ornamental. Cada fonte deve ter um uso definido.\n\nAtualize `01_sources.md` com as fontes externas verificadas.\n\n## Fase 5 — Redação\n\nUse `legal-draft-br`. Redija de acordo com o plano. Não introduza autoridade não registrada nem fato sem suporte.\n\nSalve `05_draft.md`.\n\n## Fase 6 — Auditoria adversarial\n\nUse `legal-audit`. Atue como revisor hostil ao próprio rascunho: tente encontrar erro factual, citação inexistente, salto lógico, omissão, pedido sem fundamento ou tese incompatível com os autos.\n\nSalve `06_audit.md`. Corrija o rascunho e gere `FINAL.md`.\n\n## Resultado ao usuário\n\nEntregue a peça final. Se útil, mencione em poucas linhas quais pontos foram verificados e quais lacunas materiais permaneceram. Não despeje os arquivos intermediários na resposta salvo solicitação."
  },
  {
    "id": "legal-audit",
    "name": "legal-audit",
    "title": "Auditoria final adversarial",
    "description": "Faz revisão adversarial final de peça jurídica, conferindo fatos, datas, jurisprudência, legislação, lógica, pedidos e adequação processual antes da entrega.",
    "instructions": "# Auditoria final adversarial\n\nRevise o rascunho como se você fosse a parte contrária e o magistrado.\n\n## Checklist obrigatório\n\n- Todo fato relevante tem suporte D#?\n- Datas, valores, nomes e números processuais batem com a fonte?\n- Alguma alegação adversa foi tratada como fato provado?\n- Cada J# existe, foi lido e sustenta exatamente a proposição usada?\n- Cada L# está vigente/aplicável ao período?\n- Há precedente citado apenas por memória do modelo? Remover.\n- Há salto lógico entre regra e fatos?\n- Há tese incompatível com pedido ou fase processual?\n- O cabimento, competência, prazo e interesse estão corretos?\n- Todos os argumentos centrais da parte adversa foram enfrentados?\n- Existe pedido sem capítulo correspondente ou capítulo sem consequência no pedido?\n- Há contradições internas ou repetição excessiva?\n- Cálculos foram feitos de modo determinístico?\n\nClassifique achados como `crítico`, `relevante` ou `editorial`. Corrija críticos e relevantes antes de gerar `FINAL.md`."
  },
  {
    "id": "legal-draft-br",
    "name": "legal-draft-br",
    "title": "Redação jurídica brasileira",
    "description": "Redige petições brasileiras a partir de plano e registro fechado de fontes, com estilo técnico, objetivo e correspondência entre fatos, fundamentos e pedidos.",
    "instructions": "# Redação jurídica brasileira\n\n1. Use exclusivamente os fatos e autoridades já registrados.\n2. Não transforme alegação adversa em fato incontroverso.\n3. Cada capítulo deve começar pela questão concreta, desenvolver regra + aplicação aos fatos e terminar com consequência processual.\n4. Cite jurisprudência somente quando acrescentar valor. Prefira síntese fiel a colagem extensa de ementa.\n5. Preserve dados processuais exatamente como constam dos autos.\n6. Pedidos devem espelhar as teses desenvolvidas; não acrescente pedidos surpresa no final.\n7. Não use expressões vazias como “resta cristalino”, “não merece prosperar” ou fórmulas repetitivas sem conteúdo analítico.\n8. Mantenha tom firme e profissional.\n9. Se o usuário fornecer um modelo/estilo, ele prevalece sobre o estilo padrão, sem sacrificar precisão factual."
  },
  {
    "id": "legal-ingest",
    "name": "legal-ingest",
    "title": "Ingestão jurídica rastreável",
    "description": "Extrai e organiza fatos, páginas, documentos e cronologia de autos judiciais brasileiros antes da análise jurídica. Use em processos, PDFs, scans, anexos e conjuntos documentais jurídicos.",
    "instructions": "# Ingestão jurídica rastreável\n\n1. Inventarie os arquivos e identifique tipo, parte emissora, data e função processual.\n2. Leia texto nativo antes de recorrer a OCR.\n3. Para scan ou página visualmente complexa, use leitura visual/OCR e valide campos críticos.\n4. Atribua IDs `D#` em ordem estável. Para documentos longos, mantenha página/intervalo no registro.\n5. Extraia apenas fatos suportados. Diferencie claramente:\n   - fato alegado por uma parte;\n   - fato documentalmente comprovado;\n   - conclusão jurídica;\n   - inferência ainda não comprovada.\n6. Construa cronologia com data, evento, fonte D# e relevância.\n7. Preserve divergências: não reconcilie silenciosamente datas ou valores conflitantes.\n8. Marque OCR incerto e confira visualmente antes de usar em ponto decisivo."
  },
  {
    "id": "legal-planner",
    "name": "legal-planner",
    "title": "Planejamento jurídico",
    "description": "Planeja estratégia e estrutura de peça jurídica brasileira antes da redação, vinculando cada capítulo a fatos, fontes, claims e pedidos. Use após ingestão dos autos.",
    "instructions": "# Planejamento jurídico\n\nNão redija a peça nesta fase.\n\nProduza:\n\n- tipo de peça e fundamento de cabimento;\n- objetivo processual;\n- tese principal e teses subsidiárias;\n- questões preliminares/prejudiciais;\n- fatos críticos com IDs D#;\n- pontos adversos que precisam ser enfrentados;\n- riscos de improcedência/inadmissibilidade;\n- research needs.\n\nPara cada research need, use o formato:\n\n- `claim`: proposição jurídica exata que precisa ser sustentada;\n- `kind`: legislação | jurisprudência | doutrina;\n- `court/source preference`;\n- `expected use`: qual capítulo/argumento usará a fonte;\n- `necessity`: essencial | útil.\n\nPara cada capítulo do plano, vincule fatos e research needs. Um capítulo sem função decisória clara deve ser removido."
  },
  {
    "id": "legal-research-br",
    "name": "legal-research-br",
    "title": "Pesquisa jurídica orientada por claims",
    "description": "Pesquisa e verifica jurisprudência e legislação brasileiras para claims jurídicos específicos, priorizando STF, STJ, TRFs, TJs e fontes oficiais. Use quando uma peça depender de autoridade externa atual ou específica.",
    "instructions": "# Pesquisa jurídica orientada por claims\n\n## Método\n\n1. Comece pelo claim definido no plano.\n2. Pesquise termos jurídicos, dispositivo, tribunal e fato distintivo relevante.\n3. Priorize fonte oficial. Fonte secundária serve para descoberta, não como verificação final quando houver primária.\n4. Leia contexto suficiente para determinar se o precedente realmente sustenta o claim.\n5. Diferencie ratio/holding de observação lateral e de mera transcrição de alegação da parte.\n6. Verifique atualidade normativa e eventual superação, modulação, tema repetitivo/repercussão geral ou alteração legislativa.\n\n## Registro mínimo de J#\n\n- tribunal;\n- número/classe;\n- órgão julgador;\n- relator(a);\n- data relevante;\n- URL oficial;\n- proposição sustentada;\n- observação sobre aderência fática quando necessária.\n\n## Registro mínimo de L#\n\n- diploma;\n- dispositivo;\n- redação aplicável ao período do caso quando temporalmente relevante;\n- URL oficial.\n\n## Regra de rejeição\n\nRejeite a fonte se número, tribunal ou conteúdo não puderem ser confirmados; se o resultado apenas mencionar o tema sem decidir a questão; ou se o trecho encontrado contrariar o uso pretendido."
  },
  {
    "id": "prescricao-intercorrente",
    "name": "prescricao-intercorrente",
    "title": "Prescrição intercorrente",
    "description": "Analisa prescrição intercorrente em execução/cumprimento civil, com cronologia, art. 921 CPC, atos constritivos, suspensões e marcos interruptivos. Use quando houver alegação de inércia ou prescrição durante execução.",
    "instructions": "# Prescrição intercorrente\n\n- Identifique título, natureza da pretensão e prazo aplicável antes de contar qualquer período.\n- Construa linha do tempo com início da execução, suspensões, arquivamentos, diligências, atos constritivos e intimações relevantes.\n- Diferencie movimentação cartorária de ato juridicamente apto a alterar a contagem.\n- Verifique a redação do art. 921 do CPC aplicável ao período e regras de transição.\n- Não presuma suspensão/interrupção; identifique o fato jurídico e a autoridade que lhe atribui efeito.\n- Trate suspensões extraordinárias de prazos como questão autônoma e temporalmente delimitada."
  },
  {
    "id": "previdenciario-incapacidade",
    "name": "previdenciario-incapacidade",
    "title": "Benefícios por incapacidade",
    "description": "Analisa benefícios por incapacidade do RGPS com foco em prova médica, atividade habitual, DII/DER/DCB, perícia e tutela. Use em auxílio por incapacidade, aposentadoria por incapacidade e impugnações periciais.",
    "instructions": "# Benefícios por incapacidade\n\n- Separe diagnóstico, limitações funcionais, atividade habitual, tratamento, prognóstico e datas.\n- Não confunda doença com incapacidade: explique a ponte funcional entre quadro clínico e trabalho.\n- Compare perícia judicial/administrativa e documentos assistenciais por data, especialidade, achados objetivos e coerência longitudinal.\n- Só fixe DII/DER/DCB ou períodos se houver suporte documental/normativo.\n- Em tutela, trate probabilidade e perigo com fatos concretos."
  }
];
});
