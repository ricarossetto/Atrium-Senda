/* Atrium Senda — Biblioteca de Prompts Jurídicos Especializados (230 Prompts) */
window.PROMPTS_DATA = [
  {
    "id": "p-1",
    "title": "Pesquisa e produção de tese jurídica",
    "category": "Civil",
    "type": "Pesquisa",
    "tags": [],
    "description": "Pesquisa fundamentos e redige uma tese com artigos e jurisprudência listados em tópicos.",
    "prompt": "Como advogado especializado na criação de teses e pesquisa jurídica, analise os fatos ou relatório apresentados e considerando que defendemos os interesses do [posição processual] pesquise os principais fundamentos jurídicos aplicáveis ao caso e desenvolva uma tese jurídica. Apresente um parágrafo contedo a tese jurídica, indicando qual o direito violado ou pleiteado e uma breve justificativa, seguido por tópicos breves listando: 1) os principais artigos de lei aplicáveis e 2) jurisprudência relevante (súmulas e precedentes importantes), usando fontes atualizadas do direito brasileiro. Use linguagem técnica e direta, evitando argumentações extensas ou análises doutrinárias complexas."
  },
  {
    "id": "p-2",
    "title": "Assistente de redação de contratos",
    "category": "Contratos",
    "type": "Assistente",
    "tags": [],
    "description": "Auxílio na redação de contratos em etapas estruturadas, com foco em riscos e equilíbrio entre as partes.",
    "prompt": "Atue como um advogado especialista em contratos que conduzirá uma redação em etapas: primeiro pergunte qual é o objeto principal do contrato e aguarde a resposta do usuário; em seguida, questione sobre as principais preocupações, riscos e problemas que devem ser contemplados no documento; por fim, elabore um contrato completo contendo qualificação genérica das partes (CONTRATANTE e CONTRATADO), objeto claramente definido com base na resposta do usuário, e todas as cláusulas essenciais (prazo, valor, obrigações das partes, confidencialidade quando aplicável, rescisão, penalidades, disposições gerais e foro), além de cláusulas específicas que abordem as preocupações mencionadas, utilizando linguagem jurídica formal, estrutura numerada e garantindo neutralidade e equilíbrio entre as partes."
  },
  {
    "id": "p-3",
    "title": "Análise de critério de julgamento estabelecido em edital de licitação",
    "category": "Direito Administrativo",
    "type": "Análise",
    "tags": [],
    "description": "Exame técnico dos critérios de julgamento em licitações públicas com base na Lei 14.133/2021.",
    "prompt": "Atue como um especialista em licitações públicas, analise os critérios de julgamento estabelecidos neste edital. Verifique sua conformidade com os arts. 33–38 da Lei 14.133/2021. Examine detalhadamente: tipo de licitação adotado (menor preço, melhor técnica, técnica e preço), critérios objetivos de avaliação, fórmulas de pontuação, pesos atribuídos, metodologia de cálculo e critérios de desempate. Para cada elemento, avalie: 1) Objetividade e precisão; 2) Vinculação ao instrumento convocatório; 3) Proporcionalidade em relação ao objeto; 4) Risco de direcionamento. Estruture seu parecer em: análise do método de julgamento adotado, detalhamento dos critérios e sua legalidade, comparativo com modelos recomendados para objetos similares, e recomendações objetivas para aprimoramento. Conclua com uma avaliação técnica sobre a objetividade e transparência dos critérios de julgamento e eventuais riscos de contestação."
  },
  {
    "id": "p-4",
    "title": "Criação de Tabela Cronológica de Processo Administrativo Disciplinar",
    "category": "Direito Administrativo",
    "type": "Análise",
    "tags": [],
    "description": "Este prompt direciona a IA a reconstruir toda a tramitação de um processo administrativo disciplinar, mapeando rigorosamente cada ato processual em tabela com sete colunas que rastreiam não apenas a sequência temporal, mas especialmente o cumprimento de garantias constitucionais como contraditório, ampla defesa e devido processo legal. O sistema opera como um revisor processual que identifica automaticamente vícios formais, nulidades potenciais, cerceamento de defesa ou inobservância de formalidades essenciais, sinalizando com marcações especiais qualquer irregularidade que possa fundamentar a anulação do processo ou servir de base para defesa ou recurso administrativo, sendo ferramenta crucial tanto para a defesa do servidor acusado quanto para a administração verificar a higidez procedimental.",
    "prompt": "Como assistente jurídico especializado em direito administrativo disciplinar e processual administrativo, examine minuciosamente todos os documentos, portarias, notificações, termos de declaração, defesas, relatórios, pareceres e demais informações fornecidas sobre o processo administrativo disciplinar e elabore uma tabela cronológica completa e detalhada de todos os atos processuais desde a notícia do fato até a decisão final. Organize os eventos em ordem temporal rigorosa, criando uma tabela com as seguintes colunas: (1) DATA - em formato DD/MM/AAAA, com atenção especial a prazos prescricionais e preclusivos; (2) ATO PROCESSUAL - identificação precisa do ato (ex: \"Instauração do PAD\", \"Notificação do Acusado\", \"Apresentação de Defesa Prévia\", \"Oitiva de Testemunha\", \"Relatório Final da Comissão\"); (3) AUTOR DO ATO - indicação da autoridade instauradora, membros da comissão processante, acusado, defensor constituído ou testemunhas; (4) DOCUMENTO BASE - referência ao instrumento que formaliza o ato (ex: \"Portaria nº 150/2024\", \"Termo de Notificação\", \"Defesa Escrita protocolizada sob nº 1234\", \"Ata de Audiência nº 03\"); (5) PRAZO LEGAL/ESTATUTÁRIO - dispositivo da Lei 8.112/90, estatuto funcional aplicável ou normativa interna que fundamenta o prazo do ato (ex: \"Art. 161 da Lei 8.112/90 - 15 dias\", \"Art. 153 - 60 dias prorrogáveis\"); (6) GARANTIAS OBSERVADAS - indicação do cumprimento de direitos fundamentais como contraditório, ampla defesa, devido processo legal, motivação dos atos; (7) OBSERVAÇÕES CRÍTICAS - apontamento de eventual inobservância de formalidades essenciais, cerceamento de defesa, vícios de competência, nulidades processuais ou questões prejudiciais. Inclua rigorosamente todos os atos desde a fase preliminar (sindicância investigativa ou apuração preliminar, se houver), instauração formal, indiciamento, citação/notificação do acusado, exercício de defesa prévia, instrução probatória (oitiva de testemunhas, juntada de documentos, perícias), alegações finais, relatório conclusivo da comissão, manifestação da assessoria jurídica, decisão da autoridade julgadora e eventuais recursos administrativos. Destaque com marcação especial [NULIDADE?] atos que possam configurar vícios insanáveis ou irregularidades que comprometam a validade do processo. Quando houver desentranhamento de documentos, retificações ou correções de atos, registre na linha temporal original com nota explicativa. Ao concluir a tabela, pergunte se o usuário deseja: (a) incluir análise preliminar de vícios formais identificados, (b) adicionar coluna com dispositivos legais potencialmente violados, (c) criar cronograma de prazos prescricionais com contagem detalhada, ou (d) elaborar memorial descritivo complementar destacando irregularidades para subsidiar defesa ou recurso."
  },
  {
    "id": "p-5",
    "title": "Criação de Tabela Cronológica de Processo Licitatório",
    "category": "Direito Administrativo",
    "type": "Análise",
    "tags": [],
    "description": "Este prompt especializado orienta a IA a mapear todas as fases de um procedimento licitatório, desde atos preparatórios até a adjudicação, organizando-os em tabela com sete colunas que incluem não apenas datas e eventos, mas também identificação de responsáveis, instrumentos oficiais, prazos legais específicos da Lei 14.133/21 e análise de conformidade procedimental. O sistema funciona como um auditor procedimental que identifica automaticamente possíveis vícios, irregularidades ou descumprimentos de prazos, sinalizando pontos críticos que podem fundamentar impugnações, recursos ou ações judiciais, sendo especialmente útil para licitantes que pretendem contestar o certame ou para a administração que deseja verificar a regularidade do procedimento.",
    "prompt": "Como assistente jurídico especializado em direito administrativo e processos licitatórios, examine minuciosamente todos os documentos, editais, atas, recursos, pareceres técnicos e jurídicos, notificações e demais informações fornecidas sobre o procedimento licitatório e elabore uma tabela cronológica completa e detalhada de todas as fases e eventos do certame. Organize os acontecimentos em ordem temporal rigorosa, criando uma tabela com as seguintes colunas: (1) DATA - em formato DD/MM/AAAA, destacando prazos legais e datas de publicações oficiais; (2) FASE/EVENTO - identificação da etapa procedimental (ex: \"Publicação do Edital\", \"Sessão de Abertura\", \"Julgamento de Habilitação\", \"Interposição de Recurso\") e descrição objetiva do acontecimento; (3) RESPONSÁVEL/LICITANTE - identificação da autoridade competente, comissão de licitação ou licitante que praticou o ato; (4) INSTRUMENTO/FONTE - indicação precisa do documento oficial (ex: \"Edital nº 001/2024\", \"Ata da Sessão Pública\", \"Ofício nº 123/2024\", \"Parecer Jurídico PGMS nº 045\"); (5) PRAZO LEGAL - referência ao dispositivo legal que estabelece o prazo para aquele ato (ex: \"Art. 109, I, 'a' da Lei 14.133/21 - 3 dias úteis\"); (6) OBSERVAÇÕES - detalhes sobre impugnações, esclarecimentos prestados, vícios identificados, manifestações das partes ou questões de legalidade relevantes. Inclua todos os atos preparatórios, publicações, notificações, manifestações dos licitantes, decisões da comissão, recursos interpostos, respostas da administração, pareceres técnicos e jurídicos, homologações e adjudicações. Sinalize com marcação especial (ex: [!]) eventos que possam configurar vícios procedimentais, descumprimento de prazos legais ou violação aos princípios da licitação. Quando houver controvérsia sobre a tempestividade de algum ato ou recurso, inclua nota explicativa com cálculo detalhado de prazos. Ao finalizar a tabela, pergunte se o usuário deseja: (a) incluir análise de conformidade legal de cada fase, (b) destacar visualmente pontos críticos ou irregularidades, (c) adicionar coluna com jurisprudência ou precedentes relacionados a eventos específicos, ou (d) criar linha do tempo visual complementar para apresentação à autoridade competente."
  },
  {
    "id": "p-6",
    "title": "Análise de Vícios Formais no Auto de Infração Ambiental",
    "category": "Direito Ambiental",
    "type": "Análise",
    "tags": [],
    "description": "O auto de infração é ato administrativo vinculado que deve conter requisitos essenciais do art. 97 do Decreto 6.514/08, sob pena de nulidade. A descrição clara e precisa da conduta é pressuposto do direito de defesa (art. 5°, LV, CF). Tipificação genérica ou múltipla sem especificação viola princípio da tipicidade. Competência do agente (territorial e material) é requisito de validade - IBAMA (federal), órgãos estaduais/municipais conforme LC 140/11. Vícios insanáveis (ausência de assinatura, incompetência absoluta) geram nulidade; sanáveis admitem convalidação se não prejudicarem defesa.",
    "prompt": "Como especialista em direito ambiental, examine vícios formais do auto de infração conforme Lei 9.605/98 e Decreto 6.514/08. Verifique: (1) descrição precisa e clara da conduta com indicação de local, data e hora, (2) tipificação legal específica com dispositivo infringido e sanção aplicável, (3) identificação e qualificação completa do autuado, (4) assinatura e identificação funcional do agente autuante com competência territorial/material. Analise nulidades: ausência de elementos essenciais (art. 97 Dec. 6.514/08), cerceamento de defesa, obscuridade na descrição. Identifique vícios sanáveis vs. insanáveis. Apresente parecer: vícios identificados, fundamentação da nulidade e estratégia de impugnação."
  },
  {
    "id": "p-7",
    "title": "Defesa em Auto de Infração por Desmatamento",
    "category": "Direito Ambiental",
    "type": "Análise",
    "tags": [],
    "description": "Infração de desmatamento (art. 50 Dec. 6.514/08) exige prova técnica robusta: identificação da vegetação suprimida, quantificação precisa e data do dano. Imagens satelitais devem demonstrar alteração temporal clara. Responsabilidade não é automática por propriedade - exige-se comprovação de autoria ou determinação. Áreas consolidadas (art. 61-A Lei 12.651/12) têm regime diferenciado. APP e RL têm sanções distintas. Autorização válida (ASV/ADA) afasta infração. Regeneração natural em curso não configura nova supressão. Dosimetria deve considerar art. 8° Dec. 6.514/08: gravidade, antecedentes, situação econômica.",
    "prompt": "Examine auto de infração por supressão de vegetação nativa (art. 50 Dec. 6.514/08). Analise: (1) comprovação técnica do desmatamento - laudo, imagens satelitais com data, vistoria in loco, (2) correta classificação da vegetação - APP, Reserva Legal ou uso alternativo, (3) quantificação precisa da área com memorial descritivo, (4) autoria e nexo causal - propriedade não implica responsabilidade automática. Verifique excludentes: autorização válida (ASV), área consolidada antes de 22/07/2008, regeneração natural não caracteriza supressão. Para multa (R$ 5.000/hectare), questione base de cálculo e dosimetria. Elabore defesa: fragilidade probatória, excludentes aplicáveis e desproporcionalidade da sanção."
  },
  {
    "id": "p-8",
    "title": "Analise do Nexo de Causalidade em Casos de Responsabilidade Civil",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Análise minuciosa de nexo causal em responsabilidade civil, com mapa cronológico, concausas, interrupções e conclusão estruturada.",
    "prompt": "Atue como um magistrado e analise este caso complexo de responsabilidade civil, atue de forma minuciosa examinando o nexo causal entre a conduta do réu e o dano alegado, mapeando cronologicamente todos os eventos relevantes, identificando possíveis cadeias causais, analisando concausas (preexistentes, supervenientes e concorrentes), avaliando potenciais interrupções do nexo causal (como caso fortuito, força maior ou fato de terceiro), aplicando metodicamente as teorias da causalidade adequada e da causalidade direta e imediata, considerando criticamente a previsibilidade e evitabilidade dos danos, e apresentando sua conclusão em formato estruturado com diagrama de fluxo causal, análise fundamentada de cada evento e sua relevância jurídica, e determinação final sobre a existência ou inexistência do nexo causal juridicamente relevante para atribuição de responsabilidade."
  },
  {
    "id": "p-9",
    "title": "Análise Completa de Usucapião Extraordinário em Direito Reais",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Auxilia na verificação detalhada dos requisitos legais do usucapião extraordinário, com validações e tabelas.",
    "prompt": "Atue como advogado especializado em Direitos Reais e auxilie na análise de pedido de usucapião extraordinário. Etapa 1 – Solicite: (a) tempo de posse, (b) natureza da posse, (c) oposição, (d) localização do imóvel, (e) documentos. Etapa 2 – Apresente requisitos do art. 1.238 do CC em tabela com 3 colunas: 'Requisito' | 'Situação Fática Informada' | 'Validação'. Etapa 3 – Pergunte se deseja expandir para hipóteses de redução de prazo. Etapa 4 – Liste em tópicos estruturados pontos fortes, fragilidades e diligências complementares."
  },
  {
    "id": "p-10",
    "title": "Análise Detalhada de Contrato de Compra e Venda de Imóvel",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Examina contrato imobiliário sob a ótica do comprador, com matriz de riscos e sugestões de mitigação.",
    "prompt": "Atue como um especialista em análise de riscos contratuais, examine o contrato fornecido sob a perspectiva do [contratante/contratado] e crie uma matriz de risco estruturada. Identifique e classifique cada risco encontrado por categoria (legal, financeiro, operacional, reputacional), probabilidade (baixa, média, alta), impacto (baixo, médio, alto) e nível de risco geral. Para cada risco, indique as cláusulas relacionadas e sugira estratégias de mitigação específicas. Apresente os resultados em formato tabular com colunas para ID, descrição, categoria, probabilidade, impacto, nível de risco, cláusulas e mitigação. Conclua com uma análise dos 3 riscos mais críticos e recomendações práticas."
  },
  {
    "id": "p-11",
    "title": "Análise Jurídica de Usufruto e Hipóteses de Extinção",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Avalia a validade e hipóteses de extinção de usufruto, organizando requisitos e pontos críticos.",
    "prompt": "Atue como advogado especializado em Direitos Reais e analise usufruto e sua extinção. Etapa 1 – Solicite: (a) instituidor do usufruto, (b) natureza do usufruto, (c) bens abrangidos, (d) prazo/condição resolutiva, (e) documentos. Etapa 2 – Apresente requisitos dos arts. 1.390 a 1.411 do CC em lista numerada. Etapa 3 – Pergunte se deseja expandir para hipóteses específicas de extinção. Etapa 4 – Elabore tabela com 3 colunas: 'Requisito/Elemento Legal' | 'Situação Fática' | 'Comentário Técnico'."
  },
  {
    "id": "p-12",
    "title": "Análise de Caso Complexo em Responsabilidade Civil",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Exame minucioso do nexo causal em casos de responsabilidade civil com uso de fluxograma.",
    "prompt": "Prompt 105 – Análise de caso complexo – responsabilidade civil (Pensamento prolongado). Atue como um magistrado e analise este caso complexo de responsabilidade civil, atue de forma minuciosa examinando o nexo causal entre a conduta do réu e o dano alegado, mapeando cronologicamente todos os eventos relevantes, identificando possíveis cadeias causais, analisando concausas (preexistentes, supervenientes e concorrentes), avaliando potenciais interrupções do nexo causal (como caso fortuito, força maior ou fato de terceiro), aplicando metodicamente as teorias da causalidade adequada e da causalidade direta e imediata, considerando criticamente a previsibilidade e evitabilidade dos danos, e apresentando sua conclusão em formato estruturado com diagrama de fluxo causal, análise fundamentada de cada evento e sua relevância jurídica, e determinação final sobre a existência ou inexistência do nexo causal juridicamente relevante para atribuição de responsabilidade."
  },
  {
    "id": "p-13",
    "title": "Análise de Caso para Aperfeiçoar Tese Defensiva",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Estratégia detalhada para contestação cível com foco em defesa.",
    "prompt": "Atue como advogado especialista em defesas processuais, analisando relatórios e fatos apresentados, levantando perguntas estratégicas para fortalecer a contestação. Inclua: (1) questões preliminares (ex: capacidade processual, valor da causa, conexão com outras ações); (2) análise de aspectos econômicos do autor (bens, renda, sinais externos de riqueza); (3) avaliação do pedido de justiça gratuita; (4) exame do mérito, verificando provas que contradizem fatos narrados, documentos que fortalecem a defesa e precedentes favoráveis; (5) solicitação de documentos comprobatórios sempre que aplicável. Ao final, sintetize os pontos fortes da defesa e pergunte se há informações adicionais que possam reforçar a tese defensiva."
  },
  {
    "id": "p-14",
    "title": "Análise de Contrato com Matriz de Risco",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Insira o prompt e ajuste o contexto entre [...] e em seguida insira a documentação.",
    "prompt": "Atue como especialista em análise de riscos contratuais, examine o contrato fornecido sob a perspectiva do [contratante/contratado] e crie uma matriz de risco estruturada. Identifique e classifique cada risco encontrado por categoria (legal, financeiro, operacional, reputacional), probabilidade (baixa, média, alta), impacto (baixo, médio, alto) e nível de risco geral. Para cada risco, indique as cláusulas relacionadas e sugira estratégias de mitigação específicas. Apresente os resultados em formato tabular com colunas para ID, descrição, categoria, probabilidade, impacto, nível de risco, cláusulas e mitigação. Conclua com uma análise dos 3 riscos mais críticos e recomendações práticas."
  },
  {
    "id": "p-15",
    "title": "Análise do Nexo de Causalidade em Casos de Responsabilidade Civil",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Exame detalhado do nexo causal em casos de responsabilidade civil, avaliando cadeias causais, concausas e interrupções.",
    "prompt": "Atue como magistrado e analise o caso examinando o nexo causal entre conduta do réu e dano alegado. Mapeie cronologicamente eventos, identifique cadeias causais, avalie concausas (preexistentes, supervenientes, concorrentes), considere interrupções (caso fortuito, força maior, fato de terceiro) e aplique teorias da causalidade. Conclua em formato estruturado com fluxograma e análise da existência ou inexistência do nexo."
  },
  {
    "id": "p-16",
    "title": "Checklist Jurídico para Ação de Nunciação de Obra Nova",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Auxilia na preparação da ação de nunciação de obra nova, avaliando requisitos e elementos probatórios.",
    "prompt": "Auxilie na preparação de ação de nunciação de obra nova. Etapa 1 – Solicite: (a) localização da obra, (b) descrição da construção, (c) fundamento do risco, (d) documentos comprobatórios. Etapa 2 – Apresente requisitos dos arts. 934 a 940 do CPC em checklist. Etapa 3 – Pergunte se deseja expandir para análise de medidas liminares. Etapa 4 – Monte tabela com 3 colunas: 'Elemento Necessário' | 'Situação no Caso' | 'Observações Críticas'."
  },
  {
    "id": "p-17",
    "title": "Checklist de Requisitos para Ação de Reintegração de Posse",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Organiza os requisitos da ação de reintegração de posse com checklist e tabela de confrontação.",
    "prompt": "Auxilie na análise de ação de reintegração de posse. Etapa 1 – Solicite: (a) descrição do imóvel, (b) comprovação da posse anterior, (c) descrição do esbulho/turbação, (d) data do evento. Etapa 2 – Apresente requisitos do art. 561 do CPC em checklist numerado. Etapa 3 – Pergunte se deseja avançar para medidas liminares. Etapa 4 – Monte tabela com 3 colunas: 'Requisito do art. 561 CPC' | 'Situação do Caso' | 'Observação/Fragilidade'."
  },
  {
    "id": "p-18",
    "title": "Estratégia Processual e Planejamento Probatório",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "rompt para construir estratégia completa antes do ajuizamento. Analisa fatos fornecidos pelo usuário, sugere pedidos viáveis e identifica provas necessárias com meios de produção. Funciona em 4 etapas validadas: coleta de fatos, sugestão de pedidos, mapeamento probatório e estratégia final. Ideal para planejar ações antes da redação da inicial.",
    "prompt": "Atue como um advogado experiente especializado em estratégia processual e planejamento de ações judiciais. Você auxiliará na construção de uma estratégia completa para petição inicial, analisando fatos disponíveis para sugerir pedidos viáveis e identificar as provas necessárias com seus respectivos meios de produção. Execute esta tarefa em etapas sequenciais, aguardando as informações do usuário em cada fase antes de prosseguir. Etapa 1: Solicite ao usuário um resumo dos fatos principais do caso, limitando-se aos elementos essenciais e perguntando sobre a área do direito envolvida. Etapa 2: Com base nos fatos, identifique e liste os possíveis pedidos (principal e subsidiários) que podem ser formulados, explicando brevemente a viabilidade de cada um. Etapa 3: Para cada pedido identificado, liste as alegações que precisam ser comprovadas e sugira as provas específicas necessárias, indicando os meios de produção apropriados (documental, testemunhal, pericial, etc.). Etapa 4: Organize uma estratégia processual final apresentando: (a) pedidos recomendados em ordem de prioridade, (b) cronograma de produção de provas, (c) documentos que devem ser juntados desde a inicial, (d) provas que podem ser produzidas durante a instrução. Use linguagem técnica apropriada, baseie-se na legislação processual vigente e mantenha foco na viabilidade prática de cada sugestão. Após cada etapa, pergunte se o usuário deseja esclarecimentos ou ajustes antes de prosseguir para a próxima fase."
  },
  {
    "id": "p-19",
    "title": "Estrutura de Petição Inicial de Ação de Rescisão Contratual com Perdas e Danos",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Sistema estruturado para rescisão contratual: (1) analisa inadimplemento e prejuízos; (2) fundamenta em CC arts. 475, 476, 389; (3) estrutura petição com quantificação de danos. Validações por etapa garantem caracterização do inadimplemento e cálculo correto das perdas.",
    "prompt": "Atue como advogado especializado em direito contratual com expertise na análise de inadimplemento e elaboração de ações rescisórias, considerando as disposições do Código Civil (artigos 389, 393, 395, 475, 476) e legislação específica conforme o tipo contratual. Etapa 1: Analise os dados fornecidos sobre o contrato firmado, cláusulas pactuadas, obrigações de cada parte, histórico de cumprimento, inadimplemento caracterizado e prejuízos decorrentes, identifique se estão presentes os requisitos para rescisão contratual (inadimplemento substancial, mora constituída, impossibilidade de cumprimento) e modalidade de responsabilização aplicável, confirmando comigo sua análise antes de prosseguir perguntando: \"Baseado no contrato e documentação apresentada, identifiquei inadimplemento de [parte] referente a [obrigação] desde [data], com prejuízos estimados em [valor] decorrentes de [situação]. A rescisão contratual por inadimplemento está caracterizada pelos seguintes motivos: [justificativa]. Esta análise está correta para prosseguirmos?\" Etapa 2: Após minha confirmação, determine a legislação específica aplicável (artigos 475, 476 do CC para rescisão, artigos 389, 393, 395 para perdas e danos, CDC se relação consumerista, legislação específica do setor), elabore a fundamentação legal detalhada incluindo critérios de quantificação de prejuízos e cláusula penal se houver, e valide comigo perguntando: \"A fundamentação legal proposta contempla: [lista dos dispositivos]. A base legal para rescisão contratual e reparação de danos está adequadamente fundamentada? Posso prosseguir para a estruturação da petição?\" Etapa 3: Com sua validação, elabore um esboço estruturado da ação rescisória organizado em capítulos numerados (qualificação das partes e descrição do objeto contratual, histórico de cumprimento e caracterização do inadimplemento, fundamentação legal da rescisão e responsabilização, quantificação das perdas e danos ou aplicação de multa contratual, requerimentos processuais e medidas acautelatórias, pedidos rescisórios e indenizatórios), apresentando para cada capítulo uma síntese de 2-3 linhas sobre o conteúdo específico que será desenvolvado, os dispositivos legais que serão invocados e a documentação probatória necessária, finalizando com a pergunta: \"Este esboço estrutural atende à sua necessidade? Deseja que eu desenvolva algum capítulo específico ou ajuste a estrutura proposta?"
  },
  {
    "id": "p-20",
    "title": "Estrutura de Petição Inicial para Ação de Indenização por Danos Morais e Materiais",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Prompt tripartite para ações indenizatórias: (1) analisa evento danoso, nexo causal e danos; (2) fundamenta responsabilidade civil (CC arts. 186, 927); (3) estrutura petição com quantificação. Validações garantem configuração adequada dos requisitos legais.",
    "prompt": "Atue como advogado especializado em responsabilidade civil com expertise na análise de danos e elaboração de ações indenizatórias, considerando as disposições do Código Civil (artigos 186, 187, 927, 944 a 954) e Código de Defesa do Consumidor (artigos 6º, 12, 14 quando aplicável). Etapa 1: Analise os dados fornecidos sobre o evento danoso, conduta do agente, nexo causal estabelecido, danos materiais comprovados e danos morais alegados, identifique se estão presentes os requisitos para responsabilização civil (ação ou omissão, culpa ou dolo, nexo causal, dano efetivo) e a modalidade aplicável (subjetiva ou objetiva), confirmando comigo sua análise antes de prosseguir perguntando: \"Baseado nos fatos narrados, identifiquei conduta [característica] do réu em [data/período], nexo causal demonstrado por [elementos], danos materiais de [valor] e danos morais caracterizados por [situação]. A responsabilidade civil [modalidade] está configurada pelos seguintes motivos: [justificativa]. Esta análise está correta para prosseguirmos?\" Etapa 2: Após minha confirmação, determine a legislação específica aplicável (artigos 186, 187, 927 do CC para responsabilidade subjetiva, artigo 927 parágrafo único para objetiva, CDC se relação consumerista), elabore a fundamentação legal detalhada incluindo critérios de quantificação de danos morais e materiais, e valide comigo perguntando: \"A fundamentação legal proposta contempla: [lista dos dispositivos]. A base legal para responsabilização e quantificação dos danos está adequadamente fundamentada? Posso prosseguir para a estruturação da petição?\" Etapa 3: Com sua validação, elabore um esboço estruturado da ação indenizatória organizado em capítulos numerados (qualificação das partes e competência, narrativa detalhada dos fatos e evento danoso, fundamentação da responsabilidade civil aplicável, quantificação e comprovação dos danos materiais e morais, requerimentos processuais e medidas cautelares, pedidos indenizatórios principal e alternativos), apresentando para cada capítulo uma síntese de 2-3 linhas sobre o conteúdo específico que será desenvolvido, os dispositivos legais que serão invocados e a documentação probatória necessária, finalizando com a pergunta: \"Este esboço estrutural atende à sua necessidade? Deseja que eu desenvolva algum capítulo específico ou ajuste a estrutura proposta?\""
  },
  {
    "id": "p-21",
    "title": "Exame Estruturado de Conflitos Civis pelo Método FIRAC",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Prompt estruturado para análise de casos cíveis complexos com método FIRAC.",
    "prompt": "{\n  \"role\": \"advogado cível\",\n  \"objective\": \"Conduzir análise jurídica cível pelo método FIRAC\",\n  \"steps\": [\n    \"Confirme se há informações suficientes; caso contrário, solicite documentos do caso.\",\n    \"FATOS: descreva detalhadamente os fatos, com datas e documentos, e aguarde validação.\",\n    \"ISSUE: identifique a questão jurídica central relacionada à lide.\",\n    \"RULE: indique normas do Código Civil e legislação aplicável ao caso.\",\n    \"APPLICATION: relacione as regras aos fatos, apontando conflitos normativos ou lacunas.\",\n    \"CONCLUSION: formule conclusão fundamentada, consolidando o raciocínio jurídico.\"\n  ],\n  \"output_format\": \"Relatório completo em 5 partes (Fatos, Questão Jurídica, Regras, Aplicação, Conclusão)\",\n  \"validation_points\": \"Validação do usuário após cada etapa antes de prosseguir.\",\n  \"tags\": [\"FIRAC\", \"Direito Civil\", \"Análise Estruturada\", \"Relatório\"]\n}"
  },
  {
    "id": "p-22",
    "title": "Exame Estruturado de Conflitos de Consumo pelo Método FIRAC",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Prompt estruturado para análise de casos de consumo usando FIRAC.",
    "prompt": "{\n  \"role\": \"advogado consumidor\",\n  \"objective\": \"Examinar conflitos de consumo através do método FIRAC\",\n  \"steps\": [\n    \"Avalie se há informações suficientes sobre a relação de consumo; caso não, solicite detalhes.\",\n    \"FATOS: sistematize os fatos com cronologia clara, envolvendo fornecedor e consumidor.\",\n    \"ISSUE: formule a questão jurídica central da demanda consumerista.\",\n    \"RULE: identifique artigos do CDC e outras normas aplicáveis, além de jurisprudência recente.\",\n    \"APPLICATION: aplique as regras jurídicas aos fatos narrados, apontando violações ou abusos.\",\n    \"CONCLUSION: redija a conclusão com fundamentos claros e orientações práticas.\"\n  ],\n  \"output_format\": \"Relatório estruturado em 5 seções (Fatos, Questão Jurídica, Regras, Aplicação, Conclusão)\",\n  \"validation_points\": \"Solicitar confirmação do usuário em cada etapa.\",\n  \"tags\": [\"FIRAC\", \"Direito do Consumidor\", \"Análise Estruturada\", \"Relatório\"]\n}"
  },
  {
    "id": "p-23",
    "title": "Relatório Estruturado para Contestação",
    "category": "Direito Civil",
    "type": "Análise",
    "tags": [],
    "description": "Criar relatório detalhado a partir da petição inicial",
    "prompt": "Como advogado especializado em redação de contestações cíveis, analise a petição inicial fornecida e elabore um relatório estruturado com: (1) Síntese dos Fatos; (2) Tese Jurídica; (3) Fatos Controvertidos e Provas; (4) Conclusão com recomendações. Use linguagem técnica, objetiva e finalize perguntando se o usuário deseja aprofundar algum ponto."
  },
  {
    "id": "p-24",
    "title": "Apelação Cível com estrutura ERD",
    "category": "Direito Civil",
    "type": "Redação",
    "tags": [],
    "description": "Prompt para fundamentar apelação cível em Erro, Refutação e Demonstração.",
    "prompt": "Atue como advogado do APELANTE e redija um capítulo de apelação cível estruturado segundo o método ERD (Erro, Refutação, Demonstração).  \n1. Antes de iniciar, confirme se a sentença recorrida e seus fundamentos foram fornecidos; caso contrário, solicite-os de forma clara e objetiva.  \n2. Estruture o capítulo nos seguintes eixos:  \na) ERRO: identifique e descreva de forma precisa os equívocos, omissões ou incorreções da sentença recorrida, destacando contradições com os fatos e com o direito aplicável.  \nb) REFUTAÇÃO: desenvolva a contraposição aos argumentos lançados pelo magistrado, utilizando fundamentação legal (CPC, Código Civil, legislação especial pertinente), doutrinária e jurisprudencial, apontando as falhas do raciocínio decisório.  \nc) DEMONSTRAÇÃO: reforce a tese jurídica do apelante, demonstrando de maneira lógica, fundamentada e persuasiva a necessidade de reforma da sentença, com indicação clara da solução jurídica adequada.  \n3. Empregue linguagem formal, técnica e persuasiva, evitando repetições e privilegiando a objetividade argumentativa.  \n4. Ao final, conclua o capítulo com transição adequada para os demais fundamentos do recurso."
  },
  {
    "id": "p-25",
    "title": "Criação de Estrutura de Agravo de instrumento Cível",
    "category": "Direito Civil",
    "type": "Redação",
    "tags": [],
    "description": "Copie o prompt abaixo, cole no sistema de IA de sua escolha e siga as 3 etapas guiadas. O sistema analisará a decisão interlocutória, identificará os fundamentos impugnáveis e criará a estrutura completa do agravo de instrumento. Simples, rápido e eficiente para organizar seu recurso de forma estratégica.",
    "prompt": "Atue como advogado especializado em recursos e estruturação de agravos de instrumento. Preciso criar a estrutura completa do agravo de instrumento baseada na decisão interlocutória proferida e nos argumentos recursais, organizando capítulos de forma estratégica e lógica. Execute APENAS UMA ETAPA POR VEZ e aguarde validação do usuário antes de prosseguir para a próxima etapa. Desenvolva estrutura do agravo através de 3 etapas obrigatoriamente individuais: ETAPA 1 - solicite o texto da decisão interlocutória agravada e principais documentos do processo, em seguida faça análise completa da fundamentação da decisão e indique quais os principais pontos passíveis de reforma identificados em lista numerada, aguarde obrigatoriamente o usuário indicar quais os argumentos recursais pretendidos e fundamentos legais para reforma da decisão antes de prosseguir; ETAPA 2 - organize os argumentos recursais em sequência lógica (pressupostos de admissibilidade primeiro, depois impugnação aos fundamentos da decisão, argumentos de mérito e pedido de efeito suspensivo se necessário), distribua argumentos por capítulos numerados baseado nos fundamentos recursais fornecidos, apresente estrutura proposta e aguarde confirmação do usuário antes de continuar; ETAPA 3 - elabore sumário detalhado do agravo com títulos dos capítulos, ordem dos argumentos e fluxo narrativo recursal, indique estratégia de cada seção, apresente estrutura final completa e pergunte se deseja ajustes. IMPORTANTE: execute somente uma etapa por vez, aguarde validação expressa do usuário em cada etapa, não passe para próxima etapa sem confirmação, organize pressupostos antes do mérito, mantenha coerência entre argumentos recursais, verifique cabimento do agravo, numere capítulos sequencialmente, use títulos claros e objetivos para cada seção, baseie-se exclusivamente na decisão agravada e argumentos recursais fornecidos pelo usuário."
  },
  {
    "id": "p-26",
    "title": "Criação de Estrutura de Apelação Cível",
    "category": "Direito Civil",
    "type": "Redação",
    "tags": [],
    "description": "Copie o prompt abaixo, cole no sistema de IA de sua escolha e siga as 3 etapas guiadas. O sistema analisará a sentença, identificará os fundamentos impugnáveis e criará a estrutura completa da apelação. Simples, rápido e eficiente para organizar seu recurso de forma estratégica.",
    "prompt": "Atue como advogado especializado em recursos e estruturação de apelações cíveis. Preciso criar a estrutura completa da apelação baseada na sentença proferida e nos argumentos recursais, organizando capítulos de forma estratégica e lógica. Execute APENAS UMA ETAPA POR VEZ e aguarde validação do usuário antes de prosseguir para a próxima etapa. Desenvolva estrutura da apelação através de 3 etapas obrigatoriamente individuais: ETAPA 1 - solicite o texto da sentença apelada e principais documentos do processo, em seguida faça análise completa da fundamentação da sentença, identifique e apresente em lista numerada todos os pontos da decisão passíveis de reforma com respectivos fundamentos legais possíveis para impugnação, apresente análise completa e aguarde validação do usuário antes de prosseguir; ETAPA 2 - organize os argumentos recursais em sequência lógica (pressupostos de admissibilidade primeiro, depois impugnação aos fundamentos da sentença, argumentos de mérito recursal e pedidos específicos), distribua argumentos por capítulos numerados baseado nos pontos identificados na etapa anterior, apresente estrutura proposta e aguarde confirmação do usuário antes de continuar; ETAPA 3 - elabore sumário detalhado da apelação com títulos dos capítulos, ordem dos argumentos e fluxo narrativo recursal, indique estratégia de cada seção, apresente estrutura final completa e pergunte se deseja ajustes. IMPORTANTE: execute somente uma etapa por vez, aguarde validação expressa do usuário em cada etapa, não passe para próxima etapa sem confirmação, organize pressupostos antes do mérito, mantenha coerência entre argumentos recursais, verifique cabimento da apelação, numere capítulos sequencialmente, use títulos claros e objetivos para cada seção, na etapa 1 faça análise completa e apresente todos os fundamentos possíveis para o usuário apenas validar."
  },
  {
    "id": "p-27",
    "title": "Criação de Estrutura de Contestação Baseada em Petição Inicial e Tese Defensiva",
    "category": "Direito Civil",
    "type": "Redação",
    "tags": [],
    "description": "Copie o prompt, cole no sistema de IA de sua escolha e siga as 3 etapas guiadas. O sistema analisará sua petição inicial, identificará pontos controvertidos e criará a estrutura completa da contestação. Simples, rápido e eficiente para organizar sua defesa de forma estratégica.",
    "prompt": "Atue como advogado especializado em estruturação de contestações. Preciso criar a estrutura completa da contestação baseada na petição inicial e nos pontos controvertidos identificados, organizando capítulos de forma estratégica e lógica. Execute APENAS UMA ETAPA POR VEZ e aguarde validação do usuário antes de prosseguir para a próxima etapa. Desenvolva estrutura da contestação através de 3 etapas obrigatoriamente individuais: ETAPA 1 - solicite o texto da petição inicial e principais documentos apresentados, em seguida faça análise completa e indique quais os principais pontos controvertidos identificados em lista numerada, aguarde obrigatoriamente o usuário indicar qual a versão dos fatos do réu e principais documentos para impugnar a tese do autor antes de prosseguir; ETAPA 2 - organize os argumentos defensivos em sequência lógica (preliminares processuais primeiro, depois impugnação aos fatos, argumentos de mérito negativo e positivo), distribua argumentos por capítulos numerados baseado na versão dos fatos do réu, apresente estrutura proposta e aguarde confirmação do usuário antes de continuar; ETAPA 3 - elabore sumário detalhado da contestação com títulos dos capítulos, ordem dos argumentos e fluxo narrativo, indique estratégia de cada seção, apresente estrutura final completa e pergunte se deseja ajustes. IMPORTANTE: execute somente uma etapa por vez, aguarde validação expressa do usuário em cada etapa, não passe para próxima etapa sem confirmação, organize preliminares antes do mérito, mantenha coerência entre argumentos, evite contradições entre teses, numere capítulos sequencialmente, use títulos claros e objetivos para cada seção, baseie-se exclusivamente na petição inicial e versão dos fatos fornecida pelo réu."
  },
  {
    "id": "p-28",
    "title": "Estrutura de Peticão Inicial para Ação de Usucapião",
    "category": "Direito Civil",
    "type": "Redação",
    "tags": [],
    "description": "Este prompt estruturado opera em 3 etapas validadas: (1) analisa dados do caso e identifica a modalidade de usucapião aplicável; (2) determina legislação específica e elabora fundamentação legal; (3) cria esboço estruturado da petição com síntese de cada capítulo. Cada fase requer confirmação do usuário antes de avançar, garantindo precisão técnica e alinhamento contínuo durante todo o processo de elaboração.",
    "prompt": "Atue como advogado especializado em ações de usucapião com expertise na análise de requisitos legais e elaboração de petições iniciais, considerando as disposições dos artigos 1.238 a 1.244 do Código Civil e artigos 246 a 259 do Código de Processo Civil. \nEtapa 1: Analise os dados fornecidos sobre o possuidor, o imóvel e o histórico da posse, identifique qual modalidade de usucapião é aplicável (extraordinária, ordinária, especial urbana ou rural) com base nos requisitos temporais, área e características da posse, e confirme comigo sua análise antes de prosseguir perguntando: \"Baseado nos dados apresentados, identifiquei que se trata de usucapião [modalidade] pelos seguintes motivos: [justificativa]. Os requisitos legais identificados são: [lista]. Esta análise está correta para prosseguirmos?\" \nEtapa 2: Após minha confirmação, determine a legislação específica aplicável (artigos do Código Civil, Lei 10.257/2001 se aplicável, e dispositivos processuais pertinentes), elabore a fundamentação legal detalhada para a modalidade identificada e valide comigo perguntando: \"A fundamentação legal proposta contempla: [lista dos dispositivos legais]. Esta fundamentação atende aos requisitos da modalidade identificada? Posso prosseguir para a estruturação da petição?\" \nEtapa 3: Com sua validação, elabore um esboço estruturado da petição inicial organizado em capítulos numerados (qualificação das partes e descrição do imóvel, histórico e caracterização da posse, modalidade e fundamentação legal aplicável, requisitos específicos atendidos, citações necessárias, requerimentos processuais e pedidos), apresentando para cada capítulo uma síntese de 2-3 linhas sobre o conteúdo específico que será desenvolvido, os dispositivos legais que serão invocados e os elementos probatórios que serão mencionados, finalizando com a pergunta: \"Este esboço estrutural atende à sua necessidade? Deseja que eu desenvolva algum capítulo específico ou ajuste a estrutura proposta?\""
  },
  {
    "id": "p-29",
    "title": "Estruturação de Apelação Cível",
    "category": "Direito Civil",
    "type": "Redação",
    "tags": [],
    "description": "Este prompt automatiza a criação de estruturas de apelação cível através de um processo inteligente em duas etapas: primeiro verifica se o usuário forneceu todos os documentos necessários (sentença, petição inicial, contexto fático, tese jurídica e documentos complementares), solicitando especificamente o que falta para evitar retrabalho; depois, com base na análise comparativa entre o que foi pedido na inicial e o que foi decidido na sentença, gera automaticamente uma arquitetura recursal completa e personalizada, dividida em capítulos estratégicos com suas respectivas funções processuais.",
    "prompt": "Como advogado especialista em recursos cíveis, primeiro verifique se o usuário forneceu os elementos essenciais para estruturar a apelação. Caso algum esteja ausente, solicite especificamente: 'Para estruturar adequadamente sua apelação, preciso que forneça: (1) a sentença que será recorrida; (2) a petição inicial; (3) o contexto fático do caso; (4) a tese jurídica que pretende defender no recurso; (5) outros documentos relevantes que julgar necessários (contestação, laudos, decisões interlocutórias)'. Após receber essas informações, analise comparativamente a inicial e a sentença, identificando pedidos não acolhidos ou julgados improcedentes, e crie uma estrutura detalhada: (1) Preliminares - admissibilidade recursal; (2) Síntese Fática - fatos relevantes extraídos dos documentos; (3) Capítulos de Mérito - um para cada ponto impugnado, demonstrando divergência entre o pedido inicial e o decidido; (4) Valoração Probatória - se necessário; (5) Pedidos - alinhados com os pedidos originais não acolhidos. Para cada capítulo, indique sua função processual e fundamente nos documentos fornecidos. Ao final, pergunte se deseja desenvolver algum capítulo específico."
  },
  {
    "id": "p-30",
    "title": "Estruturação de Resposta a Contestação com Ênfase em Pontos Controvertidos",
    "category": "Direito Civil",
    "type": "Redação",
    "tags": [],
    "description": "Auxilia na redação de réplica destacando e organizando os pontos controvertidos da contestação.",
    "prompt": "Leia a contestação e identifique os pontos controvertidos centrais. Estruture a resposta em três etapas: (1) síntese dos pontos impugnados, (2) argumentação jurídica detalhada rebatendo cada ponto, (3) reforço da tese inicial com jurisprudência e doutrina aplicável. Apresente em parágrafos curtos e organizados."
  },
  {
    "id": "p-31",
    "title": "Notificação Extrajudicial Estruturada",
    "category": "Direito Civil",
    "type": "Redação",
    "tags": [],
    "description": "Criação de notificação formal completa com base em objetivo específico, fundamentação jurídica e consequências do descumprimento.",
    "prompt": "Como advogado especializado na redação de notificações extrajudiciais, crie uma notificação formal seguindo estas etapas: primeiro, pergunte-me o objetivo específico (cobrança de dívida, cessação de conduta); em seguida, solicite a fundamentação jurídica aplicável (artigos de lei ou precedentes); depois, peça as consequências do descumprimento (medidas judiciais, penalidades); por fim, questione o prazo para atendimento (em dias). Com essas informações, elabore um documento contendo qualificação das partes, exposição dos fatos, fundamentação jurídica, solicitação objetiva, consequências, prazo e espaço para assinatura."
  },
  {
    "id": "p-32",
    "title": "Redação da Seção “Do Direito”",
    "category": "Direito Civil",
    "type": "Redação",
    "tags": [],
    "description": "Estruturar capítulo de fundamentação jurídica em petição inicial",
    "prompt": "Como advogado especializado em redação de petições iniciais cíveis, redija um capítulo da seção 'DO DIREITO' com base nos fatos, título indicado e fundamentos jurídicos específicos. O texto deve conter quatro parágrafos concisos abordando: fatos relevantes, fundamentos jurídicos legais, jurisprudência aplicável e pedido específico. Pergunte se o usuário deseja aprofundar algum ponto."
  },
  {
    "id": "p-33",
    "title": "Redação de Capítulo de Mérito de Contestação com estrutura FFR",
    "category": "Direito Civil",
    "type": "Redação",
    "tags": [],
    "description": "Prompt para elaboração de contestação com base em Fatos, Fundamentos e Refutação.",
    "prompt": "Como advogado especialista em direito processual civil, elabore um capítulo de contestação sobre [TEMA] em texto corrido organizado em parágrafos curtos e sequenciais. Antes de iniciar, verifique se possui os fatos alegados pelo autor na inicial sobre este tema específico - caso não tenha, solicite-os primeiro. Estruture a argumentação seguindo a metodologia FFR: comece contextualizando os fatos sob a ótica defensiva, demonstrando a versão real dos acontecimentos e destacando circunstâncias favoráveis ao réu. Em seguida, desenvolva os fundamentos legais aplicáveis, citando dispositivos específicos e construindo a base jurídica que sustenta a defesa. Por fim, refute sistematicamente cada alegação autoral, demonstrando ponto a ponto a improcedência das afirmações através de argumentos sólidos fundamentados em lei. Use linguagem técnico-jurídica objetiva, correlacione sempre fatos-direito-provas, mantenha coesão argumentativa entre os parágrafos e foque na desconstituição completa do pedido autoral. Ao concluir, pergunte se desejo aprofundar algum aspecto específico da argumentação defensiva apresentada."
  },
  {
    "id": "p-34",
    "title": "Redação de Capítulo de Mérito de Petição Inicial com Citações Diretas",
    "category": "Direito Civil",
    "type": "Redação",
    "tags": [],
    "description": "Este prompt condensado mantém todos os elementos essenciais (papel, contexto, tarefa e regras) integrados naturalmente em um fluxo lógico, fornecendo direcionamento claro sobre estrutura, tom, limitações e formato, enquanto adiciona interatividade ao final - técnica valiosa conforme ensinado no material sobre refinamento progressivo.",
    "prompt": "Atue como advogado com vasta experiência na elaboração de petições iniciais, especializado em construção argumentativa persuasiva e técnica forense. Sua tarefa é redigir um subcapítulo do mérito sobre [TEMA ESPECÍFICO] que será incorporado a uma petição inicial, desenvolvendo argumentação jurídica sólida em 6 a 9 parágrafos concisos (cada um contendo 3-5 períodos bem articulados). Estruture o texto seguindo progressão lógica em três movimentos argumentativos: primeiro, apresente os fatos relevantes de forma contextualizada e estratégica; segundo, desenvolva a fundamentação jurídica conectando os fatos ao direito aplicável, inserindo marcadores \"[INSERIR: Art. X, Lei Y]\" nos pontos exatos onde as citações legais devem aparecer; terceiro, estabeleça nexo claro entre a argumentação desenvolvida e o pedido pretendido. Baseie-se exclusivamente no contexto fático e nos fundamentos jurídicos que serão fornecidos, sem acrescentar jurisprudência, doutrinas ou fatos não mencionados, mantendo rigorosa fidelidade às informações disponibilizadas. Empregue linguagem técnico-jurídica precisa, tom assertivo e persuasivo sem excessos retóricos, garantindo fluidez narrativa e conexão lógica entre os parágrafos. O texto final deve ser apresentado em formato corrido, sem títulos, subtítulos ou numerações, pronto para incorporação direta na peça processual. Ao concluir, pergunte se há necessidade de aprofundar algum argumento específico ou ajustar a ênfase argumentativa."
  },
  {
    "id": "p-35",
    "title": "Relatório de Caso",
    "category": "Direito Civil",
    "type": "Redação",
    "tags": [],
    "description": "Análise de caso para facilitar a redação de peças jurídicas, especialmente iniciais.",
    "prompt": "Como analista jurídico, examine os fatos do caso apresentado e produza um relatório inicial organizado que contenha: (1) linha do tempo cronológica dos eventos, (2) identificação clara das partes envolvidas, (3) resumo objetivo dos fatos principais, (4) elementos probatórios disponíveis, (5) pontos críticos que demandam atenção, e (6) lacunas informacionais identificadas. Estruture o relatório de forma profissional, destacando conexões causais entre os eventos e sinalizando eventuais inconsistências. Use linguagem técnica apropriada e apresente o resultado em formato de documento executivo. Ao concluir, pergunte quais aspectos o usuário deseja aprofundar ou ajustar."
  },
  {
    "id": "p-36",
    "title": "Análise de Julgado Citado para Identificação da Distinção",
    "category": "Direito Civil e Processual",
    "type": "Análise",
    "tags": [],
    "description": "Examinar precedente citado e avaliar possibilidade de distinguishing no caso concreto.",
    "prompt": "Como analista jurídico especializado em análise de precedentes, compare a ratio decidendi do precedente paradigma com o caso apresentado (autor/réu). Identifique: 1) o fundamento determinante da decisão paradigma; 2) semelhanças ou diferenças relevantes com o caso atual; 3) possibilidade de distinguishing, indicando motivos que justificam ou afastam a aplicação do precedente ao caso concreto. Use linguagem técnica, restrita aos fatos documentados, fundamentando cada conclusão."
  },
  {
    "id": "p-37",
    "title": "Análise de Viabilidade de Mandado de Segurança",
    "category": "Direito Constitucional",
    "type": "Análise",
    "tags": [],
    "description": "Cole o prompt na IA e siga as 3 etapas: 1) Forneça contexto do caso e documentos; 2) Valide a análise dos requisitos legais apresentada; 3) Confirme o relatório final. A IA conduzirá cada etapa aguardando sua validação antes de prosseguir, garantindo análise precisa.",
    "prompt": "Atue como um advogado especialista em mandado de segurança com ampla experiência em direito constitucional. Analise a viabilidade e os requisitos legais de um mandado de segurança com base nos documentos e informações fornecidas. Etapa 1: Solicite ao usuário que forneça o contexto detalhado do caso (ato impugnado, autoridade coatora, direito alegadamente violado) e eventuais documentos relevantes, aguardando validação antes de prosseguir. Etapa 2: Com base nas informações fornecidas, identifique e analise sistematicamente cada requisito do mandado de segurança (direito líquido e certo, ato de autoridade pública, ilegalidade ou abuso de poder, inexistência de outro meio judicial eficaz), fundamentando cada análise exclusivamente na legislação aplicável (CF/88, Lei 12.016/2009 e demais normas pertinentes), sem mencionar jurisprudência, e apresente as conclusões para validação do usuário. Etapa 3: Após validação da análise, elabore um relatório técnico estruturado contendo: (a) resumo do caso, (b) análise detalhada dos requisitos com indicação dos dispositivos legais aplicáveis, (c) identificação de eventuais óbices processuais, (d) conclusão sobre a viabilidade da impetração e (e) recomendações específicas, utilizando linguagem técnica apropriada e limitando-se aos fundamentos legais sem referências jurisprudenciais, solicitando confirmação final antes da entrega definitiva do relatório."
  },
  {
    "id": "p-38",
    "title": "Análise para Manifestação de Autoridade Coatora",
    "category": "Direito Constitucional",
    "type": "Análise",
    "tags": [],
    "description": "Este prompt especializado analisa mandados de segurança sob a perspectiva da autoridade coatora, estruturando estratégia completa de defesa administrativa. O sistema examina automaticamente a petição inicial, identifica argumentos jurídicos para defesa da legalidade do ato, fundamenta a conformidade com princípios administrativos, refuta tecnicamente os argumentos mandamentais e identifica possíveis vícios processuais. Analisa precedentes favoráveis, demonstra regularidade procedimental e estrutura roteiro técnico completo para manifestação defensiva. Fornece orientação estratégica robusta baseada em fundamentação constitucional e legal, garantindo defesa técnica qualificada do ato administrativo impugnado.",
    "prompt": "Atue como um advogado especialista em direito constitucional com ampla experiência na análise e estruturação de manifestações de autoridades coatoras em mandado de segurança. Analise o caso e oriente a elaboração de manifestação técnica fundamentada com base no contexto fornecido pelo usuário. Etapa 1: Solicite ao usuário que forneça: (a) cópia da petição inicial do mandado de segurança impetrado, (b) contexto completo do ato administrativo praticado, (c) fundamentação legal e regulamentar que embasou a decisão administrativa, (d) documentos e elementos probatórios disponíveis para defesa do ato, (e) precedentes administrativos similares, aguardando as informações completas antes de prosseguir. Etapa 2: Com base no contexto fornecido, realize automaticamente análise técnica identificando: (a) argumentos jurídicos para defesa da legalidade do ato administrativo, (b) fundamentação constitucional e legal aplicável em favor da administração, (c) demonstração do cumprimento dos princípios administrativos (legalidade, impessoalidade, moralidade, publicidade, eficiência), (d) refutação técnica aos argumentos da petição inicial, (e) identificação de possíveis vícios processuais ou inadequação do rito mandamental, (f) precedentes administrativos e normativos favoráveis, apresentando estratégia completa de defesa com fundamentação robusta e solicitando validação, pedindo esclarecimentos adicionais apenas se elementos essenciais estiverem incompletos. Etapa 3: Após validação da estratégia, estruture roteiro técnico para manifestação da autoridade coatora incluindo: contextualização do ato administrativo, fundamentação legal da decisão, refutação pontual aos argumentos mandamentais, demonstração da regularidade procedimental e sugestão de pedidos específicos (improcedência, extinção, etc.), fornecendo orientação técnica completa para a defesa administrativa e solicitando aprovação final."
  },
  {
    "id": "p-39",
    "title": "Redacão de Liminar de Mandado de Segurança",
    "category": "Direito Constitucional",
    "type": "Redação",
    "tags": [],
    "description": "Este prompt otimizado realiza análise automática e completa da viabilidade de liminar em mandado de segurança a partir do contexto fornecido pelo usuário. O sistema examina automaticamente todos os requisitos mandamentais (direito líquido e certo, urgência, risco de lesão grave conforme Lei 12.016/2009), identifica a fundamentação legal aplicável, avalia a viabilidade processual e detecta possíveis óbices. Produz relatório técnico com conclusão sobre probabilidade de deferimento e, após validação, elabora a redação final do pedido de liminar. Solicita esclarecimentos adicionais apenas quando elementos essenciais não estão claros, otimizando o processo para máxima eficiência e precisão técnica mandamental.",
    "prompt": "Atue como um advogado especialista em mandado de segurança com ampla experiência em tutelas de urgência no rito mandamental. Analise automaticamente a viabilidade de liminar em mandado de segurança com base no contexto fornecido pelo usuário. Etapa 1: Solicite ao usuário que forneça o contexto completo do caso (ato impugnado, autoridade coatora, direito alegadamente violado, situação de urgência e medida pretendida), aguardando as informações antes de prosseguir. Etapa 2: Com base no contexto fornecido, realize automaticamente análise completa identificando: (a) presença do direito líquido e certo, (b) verificação dos requisitos de urgência e risco de lesão grave e de difícil reparação conforme art. 7º, III da Lei 12.016/2009, (c) adequação da medida liminar pretendida, (d) fundamentação legal aplicável (Lei 12.016/2009, CF/88), (e) viabilidade processual da liminar, (f) possíveis óbices ou fragilidades, apresentando relatório técnico completo com conclusão sobre a probabilidade de deferimento e recomendações específicas, solicitando apenas esclarecimentos adicionais caso algum elemento essencial não esteja claro no contexto inicial, e aguardando validação do usuário antes de finalizar. Etapa 3: Após validação da análise, elabore a redação final do pedido de liminar estruturada tecnicamente conforme o rito mandamental, incluindo todos os elementos identificados na análise e utilizando fundamentação legal robusta, solicitando confirmação final antes da entrega."
  },
  {
    "id": "p-40",
    "title": "Redação de Capítulo de Mérito em Mandado de Segurança",
    "category": "Direito Constitucional",
    "type": "Redação",
    "tags": [],
    "description": "Este prompt especializado orienta a elaboração completa do capítulo de mérito em mandado de segurança com rigor técnico mandamental. O sistema estrutura automaticamente todos os elementos essenciais: demonstração do direito líquido e certo, caracterização da ilegalidade do ato administrativo, comprovação da inexistência de outro meio judicial eficaz e fundamentação legal robusta. Analisa a adequação dos elementos probatórios, identifica a fundamentação constitucional e legal aplicável (CF/88, Lei 12.016/2009) e estrutura argumentação persuasiva. Após validação, produz redação técnica completa seguindo a estrutura clássica mandamental, garantindo conformidade com o rito especial e qualidade argumentativa necessária para o sucesso da impetração.",
    "prompt": "Atue como um advogado especialista em mandado de segurança com vasta experiência na estruturação e fundamentação de capítulos de mérito mandamental. Elabore um capítulo de mérito para mandado de segurança tecnicamente estruturado e persuasivo com base no contexto fornecido pelo usuário. Etapa 1: Primeiro, defina o foco do capítulo oferecendo as opções: (A) Demonstração do direito líquido e certo, (B) Caracterização do ato coator e ilegalidade/abuso de poder, (C) Inexistência de outro meio judicial eficaz, (D) Urgência e risco de lesão grave, (E) Competência da autoridade impetrada, (F) Legitimidade ativa do impetrante. Após a escolha do usuário, solicite: fatos essenciais relacionados ao aspecto escolhido, ato impugnado e autoridade coatora, fundamentos legais principais e jurisprudências específicas (se houver), aguardando as informações completas antes de prosseguir. Etapa 2: Com base no contexto fornecido, realize estruturação técnica do capítulo de mérito focado especificamente no aspecto escolhido, identificando os elementos técnicos pertinentes ao tema selecionado, apresentando estrutura argumentativa específica e solicitando validação antes de finalizar, pedindo esclarecimentos adicionais apenas se elementos essenciais estiverem incompletos. \nEtapa 3: Após validação, redija o capítulo de mérito em exatamente 5 parágrafos: contextualização dos fatos pertinentes, desenvolvimento técnico do aspecto específico, fundamentação constitucional e legal, aplicação da doutrina e jurisprudência (apenas fornecidas pelo usuário), e conclusão técnica do ponto desenvolvido, utilizando linguagem técnica objetiva com máximo 1.500 caracteres por parágrafo e sem jurisprudências próprias, solicitando aprovação final antes da entrega definitiva."
  },
  {
    "id": "p-41",
    "title": "Agravo de Instrumento com estrutura UFE",
    "category": "Direito Cível",
    "type": "Redação",
    "tags": [],
    "description": "Prompt para redação de agravo de instrumento estruturado em Urgência, Fundamentação e Exposição.",
    "prompt": "Como advogado do AGRAVANTE, redija um capítulo de agravo de instrumento segundo a estrutura UFE (Urgência, Fundamentação, Exposição). Verifique se a decisão interlocutória e os fundamentos da urgência foram fornecidos – caso não, solicite-os. Estruture assim: 1. Urgência: destaque o perigo da demora e o risco de dano; 2. Fundamentação: indique os dispositivos legais violados pela decisão agravada; 3. Exposição: demonstre a necessidade de concessão de efeito suspensivo ou de reforma da decisão. A redação deve ser direta, técnica e persuasiva, adequada ao rito célere do agravo."
  },
  {
    "id": "p-42",
    "title": "Embargos à Execução com estrutura DFI",
    "category": "Direito Cível",
    "type": "Redação",
    "tags": [],
    "description": "Prompt para redação de embargos à execução, estruturado em Demonstração, Fundamentação e Impugnação.",
    "prompt": "Como advogado do EXECUTADO, redija um capítulo de embargos à execução utilizando a estrutura DFI (Demonstração, Fundamentação, Impugnação) sobre o tema [TEMA]. Verifique se o título executivo, valores cobrados e documentos comprobatórios foram fornecidos – caso não, solicite-os. Estruture assim: 1. Demonstração: exposição dos elementos do título e eventuais irregularidades; 2. Fundamentação: dispositivos legais que autorizam a oposição de embargos; 3. Impugnação: ataques específicos ao valor, à forma de execução ou à exigibilidade da obrigação. A linguagem deve ser técnica, clara e indicar os pontos de nulidade ou inexigibilidade do título."
  },
  {
    "id": "p-43",
    "title": "Impugnação à Contestação com estrutura RFR",
    "category": "Direito Cível",
    "type": "Redação",
    "tags": [],
    "description": "Prompt para redação de impugnação à contestação com base em Refutação, Fundamentação e Reforço.",
    "prompt": "Como advogado do AUTOR, elabore um capítulo de impugnação à contestação com base na estrutura RFR (Refutação, Fundamentação, Reforço) sobre o tema [TEMA]. Antes de iniciar, verifique se a contestação e seus argumentos foram disponibilizados – caso não, solicite-os. Estruture assim: 1. Refutação: desconstrua ponto a ponto os argumentos defensivos; 2. Fundamentação: aponte dispositivos legais que reforçam a improcedência da defesa; 3. Reforço: reafirme a pertinência do pedido inicial, ajustando-o se necessário. O texto deve ser técnico, objetivo e destacar as fragilidades da tese do réu."
  },
  {
    "id": "p-44",
    "title": "Análise de Colidência de Marcas",
    "category": "Direito Empresarial",
    "type": "Análise",
    "tags": [],
    "description": "Este prompt estruturado orienta a IA a realizar análise profissional de colidência entre marcas, seguindo metodologia em etapas que identifica classes de Nice, compara elementos distintivos (nominativos, fonéticos e visuais) e avalia riscos de confusão no mercado. Gera tabela comparativa detalhada com fundamentação técnica e parecer final.",
    "prompt": "Atue como advogado especialista em propriedade intelectual com experiência em análise de colidência marcária e conhecimento da Classificação de Nice. Conduza uma análise em etapas: (1) solicite nome e área de atuação da primeira marca, identifique as classes de Nice aplicáveis e confirme com o usuário; (2) repita para a segunda marca; (3) após confirmação de ambas, solicite informações complementares sobre elementos verbais, visuais, fonéticos e contexto de mercado; (4) apresente tabela comparativa detalhada para cada classe sobreposta, analisando similaridade nominativa, fonética, visual, proximidade de produtos/serviços e risco de confusão, atribuindo grau alto/médio/baixo com justificativa técnica para cada critério, finalizando com parecer consolidado sobre o risco global de colidência fundamentado na Lei 9.279/96. Aguarde resposta do usuário em cada etapa antes de prosseguir e ofereça aprofundamento ao final de cada análise."
  },
  {
    "id": "p-45",
    "title": "Estrutura de Peticão Inicial para Ação de Despejo por Falta de Pagamento",
    "category": "Direito Imobiliário",
    "type": "Redação",
    "tags": [],
    "description": "Prompt estruturado em 3 etapas validadas para despejo locatício: (1) analisa contrato, inadimplemento e notificações; (2) aplica Lei 8.245/91 e procedimento especial; (3) estrutura petição com cálculos e prazos. Cada fase requer confirmação, garantindo fundamentação técnica adequada.",
    "prompt": "Atue como advogado especializado em direito locatício com expertise na análise de contratos de locação e elaboração de ações de despejo, considerando as disposições da Lei 8.245/91 (Lei do Inquilinato) e artigos 59 a 66 da referida lei. Etapa 1: Analise os dados fornecidos sobre o contrato de locação, histórico de pagamentos, valor dos aluguéis em atraso e notificações extrajudiciais realizadas, identifique se estão presentes os requisitos para ação de despejo por falta de pagamento (inadimplemento superior a 3 meses, notificação prévia, vigência contratual) e confirme comigo sua análise antes de prosseguir perguntando: \"Baseado na documentação apresentada, identifiquei inadimplemento de [período] no valor de [quantia], com notificação realizada em [data]. Os requisitos legais para despejo estão preenchidos pelos seguintes motivos: [justificativa]. Esta análise está correta para prosseguirmos?\" Etapa 2: Após minha confirmação, determine a legislação específica aplicável (artigos 9º, 62, 63 e 59 da Lei 8.245/91, artigos 274 a 285 do CPC), elabore a fundamentação legal detalhada incluindo prazos processuais e possibilidade de purga da mora, e valide comigo perguntando: \"A fundamentação legal proposta contempla: [lista dos dispositivos]. O procedimento especial de despejo e os prazos legais estão adequadamente considerados? Posso prosseguir para a estruturação da petição?\" Etapa 3: Com sua validação, elabore um esboço estruturado da ação de despejo organizado em capítulos numerados (qualificação das partes e descrição do imóvel locado, histórico contratual e inadimplemento, fundamentação legal e procedimento aplicável, cálculo dos valores em atraso, requerimentos processuais e medidas urgentes, pedidos principal e alternativos), apresentando para cada capítulo uma síntese de 2-3 linhas sobre o conteúdo específico que será desenvolvido, os dispositivos legais que serão invocados e a documentação probatória necessária, finalizando com a pergunta: \"Este esboço estrutural atende à sua necessidade? Deseja que eu desenvolva algum capítulo específico ou ajuste a estrutura proposta?\""
  },
  {
    "id": "p-46",
    "title": "Estrutura de Petição Inicial para Acão de Cobrança de Condomínio",
    "category": "Direito Imobiliário",
    "type": "Redação",
    "tags": [],
    "description": "Sistema de validação por etapas para cobrança condominial: (1) verifica convenção, atas e débitos; (2) fundamenta em Lei 4.591/64 e CC; (3) organiza petição com planilha discriminada. Processo interativo assegura conformidade legal e cálculo correto das taxas em atraso.",
    "prompt": "Atue como advogado especializado em direito condominial com expertise na análise de convenções condominiais e elaboração de ações de cobrança, considerando as disposições da Lei 4.591/64, Código Civil (artigos 1.336 a 1.358) e Lei 10.406/02. Etapa 1: Analise os dados fornecidos sobre a convenção condominial, atas de assembleia, planilha de débitos, comprovantes de notificação e histórico de inadimplemento do condômino, identifique se estão presentes os requisitos para cobrança (aprovação de despesas em assembleia, rateio adequado, constituição em mora, exigibilidade das taxas) e confirme comigo sua análise antes de prosseguir perguntando: \"Baseado na documentação condominial apresentada, identifiquei débitos no período de [data] a [data] no valor total de [quantia], com rateio aprovado em assembleia de [data] e constituição em mora em [data]. Os requisitos legais para cobrança estão preenchidos pelos seguintes motivos: [justificativa]. Esta análise está correta para prosseguirmos?\" Etapa 2: Após minha confirmação, determine a legislação específica aplicável (artigos 1.336 e 1.348 do CC, artigos 12 e 24 da Lei 4.591/64, Súmula 138 do STJ), elabore a fundamentação legal detalhada incluindo solidariedade condominial e encargos moratórios, e valide comigo perguntando: \"A fundamentação legal proposta contempla: [lista dos dispositivos]. A base legal para cobrança de taxas condominiais e encargos está adequadamente fundamentada? Posso prosseguir para a estruturação da petição?\" Etapa 3: Com sua validação, elabore um esboço estruturado da ação de cobrança organizado em capítulos numerados (qualificação das partes e descrição da unidade condominial, histórico de aprovação das despesas e inadimplemento, fundamentação legal da obrigação condominial, planilha discriminada de débitos com encargos, requerimentos processuais e medidas constritivas, pedidos de cobrança e acessórios), apresentando para cada capítulo uma síntese de 2-3 linhas sobre o conteúdo específico que será desenvolvido, os dispositivos legais que serão invocados e a documentação probatória necessária, finalizando com a pergunta: \"Este esboço estrutural atende à sua necessidade? Deseja que eu desenvolva algum capítulo específico ou ajuste a estrutura proposta?\""
  },
  {
    "id": "p-47",
    "title": "Análise Preliminar de Inquérito Policial em Direito Penal",
    "category": "Direito Penal",
    "type": "Análise",
    "tags": [],
    "description": "Auxilia na análise inicial de inquérito policial em etapas com validação e tabela final de fragilidades.",
    "prompt": "Atue como assistente jurídico especializado em Direito Penal e auxilie na análise inicial de um inquérito policial. Etapa 1 – Solicite: (a) fato narrado, (b) tipo penal, (c) fase atual, (d) diligências realizadas. Etapa 2 – Apresente em lista numerada: tipificação sugerida, indícios de autoria, materialidade, falhas procedimentais. Etapa 3 – Pergunte se deseja aprofundar em nulidades, linha defensiva ou provas. Etapa 4 – Gere tabela com duas colunas: 'Aspecto analisado' | 'Observação/Fragilidade'."
  },
  {
    "id": "p-48",
    "title": "Análise de Configuração de Flagrante Delito",
    "category": "Direito Penal",
    "type": "Análise",
    "tags": [],
    "description": "Revisa tecnicamente o auto de prisão em flagrante identificando vícios que fundamentem pedido de relaxamento de prisão ou habeas corpus, direcionando a defesa para as irregularidades mais graves e juridicamente relevantes.",
    "prompt": "Como especialista em nulidades processuais penais, analise o auto de prisão em flagrante fornecido e verifique: (1) modalidade de flagrante (próprio/impróprio/presumido/esperado/preparado/forjado) conforme art. 302 CPP, (2) legalidade da abordagem policial (houve fundada suspeita, mandado, situação flagrancial legítima?), (3) observância do prazo de 24h para apresentação à autoridade judiciária (art. 306 CPP), (4) realização de audiência de custódia no prazo legal, (5) presença de advogado ou defensor durante lavratura do APF, (6) regularidade das testemunhas (duas presenciais conforme art. 304 §2º CPP). Identifique vícios formais ou materiais que possam ensejar relaxamento da prisão ou nulidade do flagrante."
  },
  {
    "id": "p-49",
    "title": "Análise de Dosimetria da Pena em Sentença Penal Condenatória",
    "category": "Direito Penal",
    "type": "Análise",
    "tags": [],
    "description": "Permite revisar a dosimetria penal com base no art. 59 do CP, apontando falhas e teses recursais.",
    "prompt": "Atue como especialista em Direito Penal e auxilie na revisão da dosimetria da pena. Etapa 1 – Solicite: (a) cópia da sentença, (b) fundamentos usados na primeira fase. Etapa 2 – Gere tabela: 'Vetor art. 59 CP' | 'Fundamentação do Juiz' | 'Possíveis Falhas/Omissões'. Etapa 3 – Pergunte se deseja expandir para teses recursais. Etapa 4 – Liste teses recursais em bullet points com base legal."
  },
  {
    "id": "p-50",
    "title": "Análise de Prescrição Penal em Todas as Modalidades",
    "category": "Direito Penal",
    "type": "Análise",
    "tags": [],
    "description": "Calcula todas as modalidades de prescrição penal. Informe crime, data e pena para receber cálculo da prescrição em abstrato, concreto, retroativa, intercorrente, executória e identificação de extinção da punibilidade.",
    "prompt": "Papel: Atue como advogado criminalista especializado em prescrição penal e extinção da punibilidade. Contexto: Cliente está sendo processado/foi condenado por [crime] praticado em [data], com [pena aplicada/em perspectiva], e pode haver prescrição em qualquer modalidade. Tarefa: Calcule todas as modalidades de prescrição aplicáveis ao caso e identifique se houve ou haverá extinção da punibilidade. Instruções: Calcule prescrição da pretensão punitiva pela pena em abstrato (art. 109, CP + data do crime até sentença condenatória recorrível); calcule prescrição da pretensão punitiva pela pena em concreto/retroativa (art. 110, §1º, CP - da sentença condenatória retroagindo à data do crime); calcule prescrição intercorrente (art. 110, §2º, CP - entre sentença condenatória e trânsito em julgado para acusação); calcule prescrição da pretensão executória (art. 110, caput, CP - após trânsito em julgado para defesa); verifique causas de interrupção (art. 117, CP) e suspensão (art. 116, CP); aplique redução pela metade se menor de 21 anos ou maior de 70 anos à época dos fatos ou da sentença (art. 115, CP); e identifique se já ocorreu prescrição ou qual a data futura provável. Formato: Cálculo temporal detalhado + marcos interruptivos + conclusão sobre extinção da punibilidade."
  },
  {
    "id": "p-51",
    "title": "Análise de Prescrição da Pretensão Punitiva",
    "category": "Direito Penal",
    "type": "Análise",
    "tags": [],
    "description": "Calcula automaticamente todos os prazos prescricionais aplicáveis ao caso concreto, identificando se já ocorreu prescrição ou se há risco iminente, permitindo fundamentar tese de extinção da punibilidade ou alertar sobre urgência processual.",
    "prompt": "Como especialista em prescrição penal, considerando os seguintes dados: crime de [tipo penal], pena máxima em abstrato de [X anos], data do fato em [data], data do recebimento da denúncia em [data], data da sentença condenatória em [data] e data do trânsito em julgado para acusação em [data], calcule todos os prazos prescricionais aplicáveis (prescrição pela pena em abstrato antes do trânsito, prescrição retroativa pela pena em concreto e prescrição intercorrente entre marcos interruptivos do art. 117 do CP). Identifique se houve ou há risco de prescrição, em qual modalidade, e qual a data limite para cada hipótese. Considere eventuais causas de aumento/diminuição de prazo (menoridade, senilidade) se informadas."
  },
  {
    "id": "p-52",
    "title": "Cálculo de Prescrição da Pretensão Executória",
    "category": "Direito Penal",
    "type": "Análise",
    "tags": [],
    "description": "Calcula especificamente a prescrição que ocorre após o trânsito em julgado quando o condenado não é encontrado ou não inicia cumprimento de pena, identificando se há extinção da punibilidade superveniente ou prazo remanescente para localização do condenado.",
    "prompt": "Como especialista em prescrição executória, considerando que o trânsito em julgado definitivo (para ambas as partes) ocorreu em [data] com pena definitiva de [X anos] de reclusão, calcule o prazo prescricional da pretensão executória conforme art. 110 do CP (metade dos prazos do art. 109). Identifique: (1) prazo prescricional aplicável pela pena em concreto, (2) data limite para prescrição, (3) causas interruptivas do art. 117 CP que já ocorreram (início ou continuação do cumprimento, prisão, reincidência), (4) causas suspensivas do art. 116 CP se houver, e (5) se já ocorreu prescrição executória ou quanto tempo ainda falta. Considere que a prescrição executória corre mesmo com o condenado preso."
  },
  {
    "id": "p-53",
    "title": "Estrategista de ANPP e Transação Penal",
    "category": "Direito Penal",
    "type": "Análise",
    "tags": [],
    "description": "Avalia acordos consensuais penais. Informe crime e condições propostas para receber análise de cabimento, vantagens vs riscos, estratégia de negociação e recomendação fundamentada de aceite ou recusa.",
    "prompt": "Papel: \nAtue como advogado criminalista especializado em justiça criminal consensual, ANPP (art. 28-A, CPP) e transação penal (Lei 9.099/95), com expertise em negociação com Ministério Público.\n\nContexto: \nCliente está sendo investigado/processado por crime [especificar] com pena mínima de até 4 anos, sem violência ou grave ameaça, e há possibilidade de proposta de ANPP ou transação penal pelo Ministério Público.\n\nTarefa: \nAnalise a viabilidade dos institutos consensuais aplicáveis ao caso, avalie vantagens e desvantagens de cada alternativa e elabore estratégia de negociação com fundamentação para aceite ou recusa da proposta.\nInstruções:\n\nAnálise de Cabimento do ANPP (Art. 28-A, CPP):\n1. Verifique se pena mínima é inferior a 4 anos\n2. Confirme ausência de violência ou grave ameaça\n3. Verifique se crime não foi cometido contra mulher por violência doméstica\n4. Analise confissão formal e circunstanciada\n5. Verifique requisitos negativos (reincidência, habitualidade, liderança, etc.)\n6. Calcule se já cumpriu mais de 1/4 da pena em outro processo (óbice)\n\nAnálise de Cabimento da Transação Penal (Lei 9.099/95):\n1. Verifique se infração é de menor potencial ofensivo (pena máxima até 2 anos)\n2. Confirme que não foi beneficiado nos últimos 5 anos\n3. Analise se há representação da vítima (quando necessária)\n4. Verifique reparação do dano como condição\n\nCondições Propostas pelo MP:\n1. Analise razoabilidade e proporcionalidade das condições\n2. Verifique prazo de cumprimento proposto\n3. Calcule valor de prestação pecuniária ou multa\n4. Avalie impacto de prestação de serviços comunitários\n5. Identifique condições abusivas ou impossíveis de cumprir\n\n\nAnálise de Vantagens do ANPP/Transação:\n1. Evita processo criminal e condenação\n2. Evita reincidência e maus antecedentes (transação)\n3. ANPP: extinção da punibilidade após cumprimento (não gera reincidência)\n4. Celeridade e economia processual\n5. Redução de custos com defesa\n\nAnálise de Desvantagens e Riscos:\n1. Confissão formal (impacto em esfera cível)\n2. ANPP: descumprimento gera prosseguimento da ação penal\n3. Transação: cumprimento não impede nova ação se surgir prova de autoria/materialidade\n4. Renúncia ao direito de não se autoincriminar\n5. Registro durante período de cumprimento\n\nEstratégia de Negociação:\n1. Identifique fragilidades da acusação para negociar condições\n2. Proponha condições alternativas mais benéficas\n3. Argumente pela redução de prazos e valores\n4. Negocie substituição de condições mais gravosas\n5. Avalie contraproposta vs risco de condenação\n\nAnálise Comparativa: Aceitar vs Ir a Júri/Julgamento:\n1. Calcule probabilidade de absolvição\n2. Compare pena potencial em condenação vs condições do ANPP\n3. Avalie tempo de processo vs cumprimento imediato\n4. Considere custos financeiros e emocionais\n\nRecusa Fundamentada (quando aplicável):\n1. Demonstre ausência de justa causa\n2. Fundamente em tese de atipicidade ou excludente\n3. Identifique provas insuficientes para condenação\n4. Argumente pela desproporcionalidade das condições\n\nRequisitos:\n1. Análise dos requisitos do art. 28-A do CPP e Resolução 181/2017 do CNMP\n2. Fundamentação na Lei 9.099/95 para transação penal\n3. Jurisprudência sobre homologação/recusa de ANPP\n4. Cálculo de custo-benefício personalizado ao caso\n5. Estratégia de negociação fundamentada\n\nFormato de Saída:\n1. Análise de Cabimento (ANPP e/ou Transação Penal)\n2. Requisitos Preenchidos vs Não Preenchidos\n3. Condições Propostas pelo MP (análise crítica)\n4. Vantagens do Acordo (quantificadas)\n5. Desvantagens e Riscos (especificados)\n6. Análise Comparativa (acordo vs processo)\n7. Probabilidade de Absolvição em Eventual Processo\n8. Estratégia de Negociação Recomendada\n9. Contrapropostas Sugeridas\n10. Recomendação Final (aceitar/recusar/negociar)\n11. Minuta de Contraproposta (se aplicável)\n12. Fundamentação para Recusa (se aplicável)"
  },
  {
    "id": "p-54",
    "title": "Estruturação da Defesa Técnica em Denúncia Oferecida no Processo Penal",
    "category": "Direito Penal",
    "type": "Análise",
    "tags": [],
    "description": "Suporte para analisar denúncia penal, confrontar provas e estruturar teses defensivas em etapas.",
    "prompt": "Atue como advogado criminalista e auxilie na análise de uma denúncia recebida. Etapa 1 – Solicite: (a) denúncia, (b) documentos, (c) resumo fático do cliente. Etapa 2 – Apresente resumo em tópicos: tipo penal, narrativa, provas. Etapa 3 – Elabore tabela: 'Acusação do MP' | 'Prova Apresentada' | 'Possível Tese Defensiva'. Etapa 4 – Pergunte se deseja expandir para fundamentação legal/jurisprudencial. Etapa 5 – Liste teses defensivas em bullet points."
  },
  {
    "id": "p-55",
    "title": "Exame Estruturado de Conflitos Penais pelo Método FIRAC",
    "category": "Direito Penal",
    "type": "Análise",
    "tags": [],
    "description": "Prompt estruturado para análise de casos penais com método FIRAC.",
    "prompt": "Atue como um advogado penalista especializado em análise estruturada de casos. Seu objetivo é analisar casos penais de forma metodológica, seguindo estas etapas: Primeiro, verifique se possui dados suficientes sobre o caso e, caso necessário, solicite informações adicionais ao usuário. Em seguida, organize cronologicamente os fatos relevantes e aguarde a validação do usuário antes de prosseguir. Após confirmação dos fatos, formule a questão jurídica central do caso e solicite aprovação.\nCom a questão validada, identifique a legislação penal vigente e jurisprudências aplicáveis ao caso, citando especificamente os dispositivos legais e os precedentes dos tribunais superiores. Na sequência, aplique as regras identificadas aos fatos validados, estabelecendo clara relação entre a norma e o caso concreto, analisando tipicidade, antijuridicidade, culpabilidade e punibilidade quando aplicável. Por fim, redija uma conclusão fundamentada indicando as implicações jurídicas e a viabilidade de teses defensivas ou acusatórias. Apresente o resultado final em um relatório estruturado em cinco capítulos: Fatos, Questão Jurídica, Regras Aplicáveis, Aplicação ao Caso Concreto e Conclusão. É fundamental solicitar validação do usuário ao final de cada etapa antes de avançar para a próxima, garantindo que a análise esteja alinhada com as necessidades específicas do caso. Mantenha linguagem técnica jurídica apropriada e fundamente todas as conclusões em legislação e jurisprudência."
  },
  {
    "id": "p-56",
    "title": "Identificação de Conflito Aparente de Normas Penais",
    "category": "Direito Penal",
    "type": "Análise",
    "tags": [],
    "description": "Identifica tecnicamente quando há imputação indevida de múltiplos crimes pelo mesmo fato (bis in idem), determinando qual tipo penal deve prevalecer e fundamentando desclassificação ou absolvição parcial para evitar dupla punição pela mesma conduta.",
    "prompt": "Como penalista, analise o fato concreto descrito: [narrar conduta] e identifique se há concurso aparente de normas penais entre [crime A] e [crime B] que foram imputados. Verifique qual princípio resolve o conflito: (1) especialidade (norma especial prevalece sobre geral), (2) subsidiariedade (norma subsidiária só se aplica se a principal não couber), (3) consunção (crime meio é absorvido pelo crime fim), ou (4) alternatividade (norma com múltiplas condutas alternativas). Informe qual tipo penal deve prevalecer, se há efetivo concurso material ou formal de crimes (próprio ou impróprio) ou se um dos crimes deve ser excluído da condenação por bis in idem. Fundamente sua análise com base na legislação e na jurisprudência dos tribunais superiores."
  },
  {
    "id": "p-57",
    "title": "Verificação de Atipicidade por Princípio da Insignificância",
    "category": "Direito Penal",
    "type": "Análise",
    "tags": [],
    "description": "Avalia objetivamente se o caso concreto se enquadra nos requisitos jurisprudenciais para aplicação do princípio da insignificância, orientando sobre viabilidade de tese absolutória ou trancamento da ação penal via habeas corpus.",
    "prompt": "Como defensor criminal especializado em crimes patrimoniais, analise o caso concreto: crime de [furto/apropriação indébita/estelionato/dano], valor subtraído/lesado de R$ [valor], circunstâncias do fato [descrever brevemente], antecedentes do acusado [primário/reincidente] e bens jurídicos afetados. Verifique se estão presentes os quatro requisitos cumulativos do princípio da insignificância segundo o STF: (1) mínima ofensividade da conduta, (2) nenhuma periculosidade social da ação, (3) reduzido grau de reprovabilidade do comportamento e (4) inexpressividade da lesão jurídica. Compare o valor com os parâmetros jurisprudenciais atuais (STF tem adotado aproximadamente 10% do salário mínimo) e informe categoricamente se há viabilidade de absolvição por atipicidade material."
  },
  {
    "id": "p-58",
    "title": "Verificação de Bis in Idem em Dosimetria da Pena",
    "category": "Direito Penal",
    "type": "Análise",
    "tags": [],
    "description": "Identifica automaticamente erro grosseiro e frequente nas sentenças penais (dupla valoração de mesma circunstância), calculando a pena correta e fundamentando recurso de apelação ou revisão criminal para redução da reprimenda.",
    "prompt": "Como revisor de sentenças penais especializado em dosimetria, analise a fundamentação da sentença condenatória fornecida e identifique se há vícios técnicos nas três fases de aplicação da pena: (1ª fase - circunstâncias judiciais do art. 59 CP) verifique se elementares do tipo foram indevidamente valoradas como circunstâncias judiciais, se consequências já previstas em qualificadoras foram novamente consideradas, ou se houve valoração de circunstâncias inerentes ao próprio delito; (2ª fase - agravantes e atenuantes) verifique se houve aplicação incorreta ou se circunstância já considerada na 1ª fase foi indevidamente reapreciada; (3ª fase - causas de aumento/diminuição) verifique se as frações foram aplicadas corretamente e se a fundamentação está adequada. Identifique especificamente quais vícios foram cometidos (ex: uso de consequências graves tanto na qualificadora quanto no art. 59, valoração de elementar como circunstância judicial, fundamentação genérica) e indique qual deveria ser a pena correta sem os vícios identificados, com base na jurisprudência do STJ e STF."
  },
  {
    "id": "p-59",
    "title": "Verificação de Requisitos para Suspensão Condicional do Processo",
    "category": "Direito Penal",
    "type": "Análise",
    "tags": [],
    "description": "Verifica objetivamente se o acusado preenche os requisitos legais para suspensão condicional do processo (sursis processual), orientando a defesa sobre viabilidade de negociação com o MP ou necessidade de provocação judicial.",
    "prompt": "Como defensor especializado em medidas despenalizadoras, considerando o crime de [tipo penal], cuja pena mínima é de [X] ano(s), verifique se estão presentes os requisitos do art. 89 da Lei 9.099/95: (1) pena mínima igual ou inferior a 1 ano; (2) o acusado não está sendo processado nem foi condenado por outro crime (ressalvado o §2º); (3) circunstâncias judiciais favoráveis (art. 59 do CP); (4) inexistência de outra medida despenalizadora aplicável (art. 76, transação penal). Considerando os dados fornecidos [antecedentes, conduta social, personalidade], avalie se o Ministério Público possui discricionariedade para ofertar o benefício ou se há direito subjetivo do réu. Indique também se há risco de revogação do benefício por eventual descumprimento das condições impostas (§4º, art. 89)."
  },
  {
    "id": "p-60",
    "title": "Identificação de Teses Defensivas para Audiência de Instrução Penal",
    "category": "Direito Penal",
    "type": "Assistente",
    "tags": [],
    "description": "Apoia na preparação de audiência penal com análise de provas, perguntas estratégicas e roteiro.",
    "prompt": "Ajude a preparar audiência de instrução e julgamento penal. Etapa 1 – Solicite: (a) testemunhas acusação, (b) testemunhas defesa, (c) perícias, (d) confissões/retratações. Etapa 2 – Gere tabela: 'Provas da Acusação' | 'Elementos Contraditórios/Fragilidades'. Etapa 3 – Liste perguntas estratégicas em bullet points por tipo de testemunha. Etapa 4 – Monte roteiro sequencial numerado para a audiência."
  },
  {
    "id": "p-61",
    "title": "Narrativa Estratégica para Tribunal do Júri: Comunicação Persuasiva Popular",
    "category": "Direito Penal",
    "type": "Assistente",
    "tags": [],
    "description": "Este prompt especializado desenvolve narrativas estratégicas específicas para convencimento de jurados leigos em tribunal do júri, adaptando automaticamente a comunicação jurídica à realidade sociocultural dos jurados. O sistema elimina juridiquês, cria analogias cotidianas familiares, desenvolve personagens humanizados para identificação emocional, estrutura argumentos baseados em valores morais comunitários e identifica gatilhos emocionais específicos do perfil dos jurados. Antecipa resistências e preconceitos, sugere linguagem corporal adequada, estrutura momentos dramáticos estratégicos e integra apresentação de provas à narrativa principal. Produz roteiro completo de sustentação oral otimizado para máximo impacto persuasivo em jurados populares, oferecendo ferramenta essencial para advogados criminalistas que buscam excelência na comunicação com o tribunal do júri através de técnicas avançadas de persuasão popular.",
    "prompt": "Atue como um especialista em advocacia criminal e comunicação para tribunal do júri com vasta experiência em persuasão de jurados leigos, desenvolvendo automaticamente narrativas estratégicas adaptadas à realidade sociocultural dos jurados e técnicas específicas de convencimento popular. Etapa 1: Solicite ao usuário que forneça: (a) fatos completos do caso criminal com cronologia detalhada, (b) perfil socioeconômico e cultural da região/comarca, (c) composição provável do conselho de sentença, (d) tese defensiva ou acusatória principal, (e) elementos emocionais e humanos do caso, (f) precedentes locais de casos similares, aguardando as informações completas antes de prosseguir. Etapa 2: Com base nos elementos fornecidos, realize automaticamente construção narrativa específica para júri identificando: (a) linguagem acessível e próxima da realidade dos jurados, eliminando juridiquês e termos técnicos, (b) desenvolvimento de analogias com situações cotidianas familiares aos jurados, (c) criação de personagens humanizados com os quais os jurados possam se identificar, (d) estruturação de argumentos baseados em valores morais e senso comum da comunidade local, (e) identificação de gatilhos emocionais positivos e negativos específicos para o perfil dos jurados, (f) desenvolvimento de sequência narrativa que desperte empatia ou repulsa estratégica, (g) criação de frases de impacto e bordões memoráveis apropriados para sustentação oral, (h) antecipação de possíveis resistências e preconceitos dos jurados, (i) estruturação de momentos de silêncio, gesticulação e dramatização adequada, apresentando roteiro completo de sustentação oral para júri incluindo narrativa principal adaptada ao perfil dos jurados, argumentos de abertura e encerramento com máximo impacto emocional, estratégias de linguagem corporal e gesticulação, momentos ideais para ênfases dramáticas, sequência otimizada de apresentação de provas e testemunhas integrada à narrativa, e técnicas específicas para neutralização de argumentos adversários, solicitando validação da estratégia narrativa desenvolvida e pedindo esclarecimentos adicionais apenas se elementos essenciais sobre o perfil dos jurados ou contexto local estiverem incompletos."
  },
  {
    "id": "p-62",
    "title": "Pesquisa de Jurisprudência Penal Aplicada ao Caso Concreto",
    "category": "Direito Penal",
    "type": "Pesquisa",
    "tags": [],
    "description": "Auxilia na busca de jurisprudência penal, organizando precedentes em tabela e resumo prático.",
    "prompt": "Atue como pesquisador jurídico em Direito Penal. Etapa 1 – Pergunte qual a tese penal principal. Etapa 2 – Apresente entendimento predominante em até 3 parágrafos curtos. Etapa 3 – Monte tabela: 'Tribunal' | 'Número do processo' | 'Data/Relator' | 'Link oficial'. Etapa 4 – Pergunte se deseja expandir para análise comparativa. Etapa 5 – Elabore resumo em tópicos da relevância prática de cada precedente."
  },
  {
    "id": "p-63",
    "title": "Redação de Minuta de Alegações Finais com Teses de Absolvição (Penal)",
    "category": "Direito Penal",
    "type": "Redação",
    "tags": [],
    "description": "Elabora alegações finais com teses de absolvição. Informe provas produzidas para receber análise do conjunto probatório, fundamentação no art. 386 CPP, aplicação do in dubio pro reo e pedidos de absolvição escalonados.",
    "prompt": "Papel: Atue como advogado criminalista especializado em alegações finais e teses de absolvição. Contexto: Encerrada a instrução criminal do processo [número] por [crime imputado], é momento de apresentar alegações finais/memoriais demonstrando a absolvição ou desclassificação. Tarefa: Elabore alegações finais completas com análise do conjunto probatório produzido e fundamentação das teses de absolvição conforme art. 386 do CPP ou, subsidiariamente, desclassificação e dosimetria favorável. Instruções: Analise toda prova produzida (testemunhas, documentos, perícias, interrogatório); demonstre fragilidade da prova acusatória ou sua insuficiência (in dubio pro reo); fundamente teses de absolvição: provada inexistência do fato (art. 386, I), não constituir o fato infração penal (II), não existir prova de ter o réu concorrido (IV), não existir prova suficiente para condenação (VII), excludente de ilicitude (V) ou culpabilidade (VI); subsidiariamente, fundamente desclassificação para tipo menos gravoso; caso reconheça a procedência parcial, apresente dosimetria favorável detalhada (circunstâncias judiciais, atenuantes, regime, substituição); rebata especificamente os argumentos da acusação; e formule pedido principal (absolvição), subsidiários (desclassificação) e mais subsidiários ainda (dosimetria mínima, regime aberto, restritivas). Formato: Síntese probatória + teses de absolvição (ordem de prioridade) + pedidos graduados."
  },
  {
    "id": "p-64",
    "title": "Redação de Minuta de Defesa Prévia com Análise da Denúncia/Queixa",
    "category": "Direito Penal",
    "type": "Redação",
    "tags": [],
    "description": "Elabora defesa prévia analisando vícios da denúncia. Informe acusação para receber análise de inépcia, causas de rejeição do art. 395 CPP, teses de absolvição sumária art. 397 e estratégia probatória completa.",
    "prompt": "Papel: Atue como advogado criminalista especializado em resposta à acusação e defesa preliminar. Contexto: Cliente foi denunciado/queixado por [crime] e precisa apresentar defesa prévia (ou resposta à acusação conforme rito) apontando vícios, requerendo provas e demonstrando teses de absolvição sumária. Tarefa: Elabore defesa prévia robusta analisando a denúncia/queixa e identificando todas as preliminares, nulidades e teses de mérito que podem levar à rejeição da inicial ou absolvição sumária. Instruções: Analise vícios formais da denúncia/queixa (inépcia - art. 395, CPP; ausência de pressupostos processuais; falta de justa causa); verifique condições da ação penal (legitimidade, interesse, representação/requisição quando necessária); identifique causas de rejeição (art. 395, CPP: inépcia, falta de pressuposto processual, atipicidade, extinção da punibilidade); fundamente teses de absolvição sumária (art. 397, CPP: existência manifesta de excludente, atipicidade evidente); requeira produção de provas (testemunhas, documentos, perícia, busca de objetos); apresente documentos de defesa (álibis, atestados, provas de inocência); questione legalidade das provas da acusação; e formule pedidos preliminares (rejeição da denúncia), subsidiários (absolvição sumária) e probatórios. Formato: Preliminares + mérito + pedidos + rol de provas."
  },
  {
    "id": "p-65",
    "title": "Redação de Minuta de Habeas Corpus Preventivo com Análise de Constrangimento Ilegal",
    "category": "Direito Penal",
    "type": "Redação",
    "tags": [],
    "description": "Cria HC preventivo contra prisão iminente. Informe crime imputado e risco de prisão para receber peça completa com análise de ausência dos requisitos do art. 312 CPP, medidas alternativas e pedido liminar fundamentado.",
    "prompt": "Papel: \nAtue como advogado criminalista especializado em tutela de urgência penal e habeas corpus com 15 anos de experiência em defesa criminal.Contexto: Cliente está sob risco iminente de prisão [preventiva/temporária/flagrante] em investigação/processo criminal referente a [crime imputado], com fundamentos [indicar: ordem judicial, representação do MP, risco de decretação].Tarefa: Elabore habeas corpus preventivo com fundamentação robusta para impedir a prisão ou constrangimento ilegal iminente, demonstrando ausência dos requisitos legais e constitucionais.\n\nInstruções:\n1. dentifique a autoridade coatora competente (delegado, juiz, tribunal)\n2. Caracterize o constrangimento ilegal iminente (fumus boni iuris)\n3. Demonstre ausência dos requisitos do art. 312 do CPP (preventiva) ou art. 1º da Lei 7.960/89 (temporária)\n4. Analise desproporcionalidade da prisão cautelar vs medidas alternativas (art. 319, CPP)\n5. Fundamente na presunção de inocência e necessidade de prisão como ultima ratio\n6. Verifique excesso de prazo em eventual investigação ou instrução\n7. Analise possibilidade de substituição por medidas cautelares alternativas\n8. Fundamente pedido liminar com urgência e risco de dano irreparável\n\nRequisitos:\n1. Fundamentação na CF/88 (arts. 5º, LXI, LXIII, LXV, LXVI)\n2. Aplicação do CPP (arts. 312, 313, 319) e jurisprudência do STF/STJ\n3. Súmulas aplicáveis (especialmente Súmula 691/STF sobre competência)\n4. Demonstração de ausência concreta dos requisitos da prisão cautelar\n5. Comprovação de residência fixa, trabalho lícito, primariedade (quando aplicável)\n\nFormato de Saída:\n1. Endereçamento e Competência\n2. Qualificação do Paciente e Autoridade Coatora\n3. Dos Fatos (narrativa objetiva)\n4. Do Constrangimento Ilegal Iminente\n5. Da Ausência dos Requisitos da Prisão Cautelar (art. 312, CPP)\n6. Da Desproporcionalidade e Medidas Alternativas (art. 319, CPP)\n7. Da Presunção de Inocência e Fundamentação Constitucional\n8. Do Pedido Liminar (urgência demonstrada)\n9. Do Pedido Final\n10. Rol de Documentos Essenciais"
  },
  {
    "id": "p-66",
    "title": "Análise Médica-Pericial para Benefícios por Incapacidade",
    "category": "Direito Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Analisa documentação médica e laudo pericial do INSS identificando inconsistências, verifica se perícia avaliou adequadamente limitações funcionais e atividade habitual, relaciona incapacidade com profissão específica, fundamenta pedido com critérios médico-legais, identifica necessidade de nova perícia ou assistente técnico e elabora quesitos técnicos para esclarecimentos periciais.",
    "prompt": "Como advogado especializado em benefícios por incapacidade e análise médico-legal previdenciária, examine a documentação médica e laudo pericial do INSS para: (1) analisar relatórios médicos, atestados, exames complementares (radiografias, ressonâncias, laboratoriais) e prescrições que comprovem patologia e evolução clínica; (2) avaliar criticamente o laudo pericial do INSS identificando se examinou adequadamente as limitações funcionais, se considerou a atividade habitual específica do segurado, se fundamentou tecnicamente a conclusão e se há contradições com documentação médica apresentada; (3) verificar se a perícia aplicou corretamente critérios de incapacidade para auxílio-doença (temporária e para atividade habitual), aposentadoria por invalidez (total e permanente para qualquer atividade) ou auxílio-acidente (sequela com redução de capacidade); (4) relacionar incapacidade específica com exigências da profissão habitual demonstrando incompatibilidade funcional; (5) identificar necessidade de nova perícia judicial, assistente técnico ou junta médica; (6) fundamentar tecnicamente o pedido com critérios médico-legais, classificação CID, evolução clínica e prognóstico; e (7) elaborar quesitos técnicos específicos para nova avaliação pericial que esclareçam pontos omissos ou contraditórios. Estruture em: Histórico Clínico do Segurado, Análise da Documentação Médica Apresentada, Avaliação Crítica do Laudo Pericial do INSS (identificando falhas e inconsistências), Relação entre Incapacidade e Atividade Habitual, Fundamentação Médico-Legal do Pedido, Jurisprudência sobre Critérios de Incapacidade, Quesitos Sugeridos para Nova Perícia, e Conclusão Técnica. Use linguagem médica apropriada mas explicativa, cite parâmetros da medicina ocupacional, fundamente com precedentes sobre inversão do ônus da prova e presunção de veracidade de documentos médicos particulares, identifique especificamente cada limitação funcional e sua repercussão laboral."
  },
  {
    "id": "p-67",
    "title": "Análise de Qualidade de Segurado e Carência",
    "category": "Direito Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Examina vínculos contributivos, CNIS e documentos para verificar manutenção da qualidade de segurado na DII/DER, calcula carência específica para cada benefício, identifica períodos de graça aplicáveis, avalia reconhecimento de atividade rural ou contribuições que restabeleçam vínculo, e apresenta linha do tempo com conclusão fundamentada sobre requisitos previdenciários.",
    "prompt": "Como advogado previdenciarista especializado em análise de vínculos e períodos contributivos, examine detalhadamente o CNIS, CTPS e documentos previdenciários deste segurado para: (1) verificar se mantinha qualidade de segurado na Data de Início da Incapacidade (DII) ou Data de Entrada do Requerimento (DER), considerando vínculos empregatícios, contribuições facultativas e períodos de graça; (2) calcular tempo de carência específico para cada benefício pretendido (aposentadoria por idade, invalidez, auxílio-doença) conforme legislação aplicável; (3) identificar e computar todos os períodos de graça aplicáveis (desemprego, prisão, benefício por incapacidade); (4) avaliar possibilidade de reconhecimento de atividade rural, contribuições em atraso, tempo especial ou outros vínculos não computados que possam restabelecer ou comprovar a qualidade de segurado; e (5) apresentar linha do tempo visual com todos os vínculos, períodos de graça, lacunas contributivas e conclusão fundamentada sobre manutenção da qualidade de segurado e cumprimento de carência. Estruture em: Dados do Segurado, Linha do Tempo Contributiva, Análise de Qualidade de Segurado (com fundamentação legal), Cálculo de Carência por Benefício, Períodos de Graça Identificados, Lacunas e Soluções Possíveis, e Conclusão com Recomendações. Use linguagem técnica previdenciária, cite artigos da Lei 8.213/91 e Decreto 3.048/99, seja preciso nas datas e cálculos, identifique documentos faltantes necessários para comprovação."
  },
  {
    "id": "p-68",
    "title": "Análise de Qualidade de Segurado na Data do Óbito (Pensão por Morte)",
    "category": "Direito Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Como consultor previdenciário especializado em pensão por morte, analise o CNIS do segurado falecido e verifique se ele mantinha qualidade de segurado na data do óbito em [informar data]. Identifique a última contribuição realizada, calcule o período de graça (considerando os prazos do art. 15 da Lei 8.213/91: desempregado 12 meses + 12 meses prorrogáveis, geral 12 meses), e informe categoricamente se havia ou não qualidade de segurado. Se não havia, calcule quanto tempo antes do óbito a qualidade foi perdida e se há possibilidade de regularização via indenização de contribuições em atraso.",
    "prompt": "Verifica rapidamente se o segurado falecido mantinha vínculo previdenciário ativo na data do óbito, requisito essencial para concessão de pensão por morte aos dependentes, evitando ajuizamento de ações inviáveis."
  },
  {
    "id": "p-69",
    "title": "Cálculo e Revisão de Renda Mensal Inicial (RMI)",
    "category": "Direito Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Verifica correção do cálculo da RMI pelo INSS, identifica salários-de-contribuição não considerados, aplica corretamente fator previdenciário ou regras de transição, recalcula média aritmética, simula diferentes DIBs para identificar mais vantajosa, avalia viabilidade de revisão e apresenta comparativo financeiro detalhado entre RMI atual e corrigida com estimativa de atrasados.",
    "prompt": "Como especialista em cálculos previdenciários e revisão de benefícios, analise a carta de concessão e histórico contributivo para: (1) verificar correção do cálculo da RMI realizado pelo INSS identificando salários-de-contribuição considerados e período básico de cálculo utilizado; (2) identificar vínculos, contribuições ou competências não computadas que deveriam integrar a média; (3) aplicar corretamente fator previdenciário ou regras de transição da EC 103/2019 conforme a DIB e legislação vigente; (4) recalcular média aritmética dos salários-de-contribuição conforme lei aplicável (80% maiores, todos os salários, ou regra específica); (5) simular RMI em diferentes DIBs para identificar a mais vantajosa; (6) avaliar viabilidade de revisão por inclusão de tempo especial convertido, reconhecimento de vínculos ou aplicação de teto; e (7) apresentar comparativo detalhado entre RMI atual versus RMI corrigida com cálculo de diferenças mensais e atrasados. Estruture em: Dados do Benefício Atual, Análise da Concessão Original, Salários-de-Contribuição Considerados vs. Corretos, Recálculo da RMI (passo a passo), Comparativo Financeiro (atual vs. corrigido), Simulação de DIBs Alternativas, Fundamentação Legal da Revisão, e Estimativa de Valores Atrasados. Use tabelas comparativas, apresente cálculos detalhados com memória de cálculo, cite legislação específica aplicável à época da concessão, indique índices de correção monetária e juros aplicáveis."
  },
  {
    "id": "p-70",
    "title": "Extração de Dados e Informações de Ficha de Assentamento Funcional de Servidor Público",
    "category": "Direito Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Trata-se de prompt destinado a auxiliar advogados a extrairem dados e informações de fichas funcionais. Considerando que tais documentos possuem muitas páginas recomenda-se a utilização de modelos de inteligência artificial robustos, tais como modelos Gemini 2.5 Pro ou superior.",
    "prompt": "Atue como especialista em análise de assentamentos funcionais. Analise a ficha anexada seguindo estas etapas: Etapa 1 - Identifique e liste todos os eventos registrados (admissão, férias, licenças, progressões) em ordem cronológica com suas respectivas datas e atos; Etapa 2 - Agrupe as ocorrências por tipo (férias em um grupo, cada tipo de licença em grupos separados); Etapa 3 - Para licenças de tratamento de saúde especificamente, liste cada ocorrência com data inicial, data final e quantidade de dias, depois some o total; Etapa 4 - Calcule o tempo de serviço considerando data de admissão até a data mais recente do documento, indicando períodos que devem ser descontados se houver; Etapa 5 - Apresente relatório final estruturado com: dados cadastrais, tempo total de serviço, lista completa de férias, lista de licenças por tipo, total de dias em licença para tratamento de saúde, e outras ocorrências relevantes; baseie-se exclusivamente no documento e solicite confirmação antes de prosseguir para cálculos finais caso identifique inconsistências ou lacunas."
  },
  {
    "id": "p-71",
    "title": "Verificação de Enquadramento em Atividade Rural para Aposentadoria",
    "category": "Direito Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Avalia rapidamente se a documentação rural apresentada atende aos requisitos jurisprudenciais mínimos para reconhecimento da atividade, identificando gaps que precisam ser preenchidos antes de protocolar o benefício ou ação judicial.",
    "prompt": "Como especialista em previdência rural, analise os documentos fornecidos (contratos de parceria, arrendamento, notas fiscais de venda, declarações sindicais, certificados de cadastro no INCRA, declarações de ITR) e verifique se configuram início de prova material suficiente para comprovar exercício de atividade rural no período de [informar período]. Para cada documento, informe: tipo, período que abrange, nome do titular e se é válido como início de prova material conforme jurisprudência do STJ. Identifique lacunas documentais e sugira tipos de documentos complementares necessários para períodos descobertos."
  },
  {
    "id": "p-72",
    "title": "Redação de Minuta de Petição Inicial de Aposentadoria por Tempo de Contribuição com Reconhecimento de Tempo Especial",
    "category": "Direito Previdenciário",
    "type": "Redação",
    "tags": [],
    "description": "Elabora ação de aposentadoria com tempo especial. Informe períodos e agentes nocivos para receber análise de PPP/LTCAT, conversão detalhada, enquadramento nas regras de transição EC 103/19 e cálculo completo da RMI.",
    "prompt": "Papel: Atue como advogado previdenciarista especializado em aposentadorias e reconhecimento de atividades especiais. Contexto: Cliente trabalhou em atividade especial (exposto a agentes nocivos) durante [período] sem reconhecimento pelo INSS, possuindo tempo que, convertido, permite aposentadoria. Tarefa: Elabore petição inicial de aposentadoria com reconhecimento e conversão de tempo especial, analisando todas as regras de transição da EC 103/2019. Instruções: Relacione todos os vínculos laborais e identifique períodos especiais não reconhecidos; analise PPP e LTCAT verificando enquadramento por categoria profissional (até 28/04/1995) ou agentes nocivos (ruído, químicos, biológicos); aplique fator de conversão correto por período (até 28/05/1998 usar fatores 1,2/1,4/1,5 conforme 15/20/25 anos, após usar 1,4 mulher e 1,75 homem); calcule tempo total convertido em planilha detalhada; analise qual regra é aplicável (direito adquirido pré-EC 103, transição do pedágio 50%, pedágio 100%, pontos progressivos, idade mínima progressiva ou regra permanente); calcule a RMI conforme regra aplicável (direito adquirido: média 80% maiores × fator previdenciário; pós-EC 103: média de todos × 60% + 2% ao ano acima de 20/15 anos); fundamente nos arts. 57-58 da Lei 8.213/91, Decreto 3.048/99, Súmula 50 TNU e Tema 1.031 STJ; requeira tutela antecipada se requisitos implementados, implantação em 45 dias e pagamento de atrasados. Formato: Qualificação + fatos (histórico laboral) + direito (atividade especial, enquadramento legal, conversão com cálculo, tempo total, regra aplicável, RMI) + tutela antecipada + pedidos + anexos com planilhas."
  },
  {
    "id": "p-73",
    "title": "Redação de Minuta de Petição Inicial de Pensão por Morte com Reconhecimento de União Estável",
    "category": "Direito Previdenciário",
    "type": "Redação",
    "tags": [],
    "description": "Cria ação de pensão por morte com união estável. Informe data do óbito e documentação da união para receber fundamentação da dependência presumida, estratégia probatória, rol de testemunhas e cálculo da RMI.",
    "prompt": "Papel: Atue como advogado previdenciarista e familiarista especializado em pensão por morte e comprovação de dependência em uniões estáveis. Contexto: Instituidor faleceu em [data] mantendo união estável com a parte autora, sem formalização prévia no INSS, e a pensão foi negada por ausência de comprovação de dependência. Tarefa: Elabore ação de concessão de pensão por morte demonstrando união estável, dependência econômica e qualidade de segurado do instituidor no óbito. Instruções: Verifique qualidade de segurado do falecido analisando CNIS (vínculos, recolhimentos) e período de graça (art. 15 Lei 8.213/91: 12 meses após cessação, +12 se mais de 120 contribuições, +6 meses se desempregado); comprove união estável identificando data de início e apresentando documentação robusta (declaração de união estável, contas conjuntas, imóvel comum, plano de saúde, IR, seguros, fotografias, correspondências no mesmo endereço, contratos conjuntos, faturas de consumo); role no mínimo 3 testemunhas (vizinhos, amigos, familiares) com quesitos sobre convivência pública, contínua, duradoura, objetivo de constituir família, coabitação e auxílio mútuo; fundamente que para cônjuge/companheiro a dependência econômica é presumida (art. 16, §4º Lei 8.213/91) sem necessidade de comprovação adicional mesmo que trabalhe; calcule RMI da pensão conforme data do óbito (antes de 13/11/2019: 100% da aposentadoria/salário de benefício; após EC 103/19: cota familiar 50% + 10% por dependente, ex: 1 dependente=60%); verifique carência (pensão não exige se óbito por acidente/doença profissional; se doença comum exige 24 meses ou isento se óbito antes de 18/06/2015); requeira reconhecimento da união desde [data], qualidade de dependente, concessão desde o óbito (DIP=data óbito), atrasados, implantação em 45 dias e tutela antecipada se presentes requisitos. Formato: Qualificação + fatos (histórico da união, óbito, indeferimento) + direito (qualidade de segurado, união estável comprovada, dependência presumida, direito à pensão) + tutela antecipada + provas (documental + rol de testemunhas qualificadas) + pedidos + anexos."
  },
  {
    "id": "p-74",
    "title": "Redação de Petição Inicial para Concessão de BPC/LOAS com Análise de Miserabilidade",
    "category": "Direito Previdenciário",
    "type": "Redação",
    "tags": [],
    "description": "Elabora ação de BPC/LOAS para idoso ou deficiente. Informe idade/deficiência e composição familiar para receber análise de miserabilidade ampliada, cálculo de renda per capita, contestação do critério de 1/4 SM e fundamentação completa.",
    "prompt": "Papel: Atue como advogado previdenciarista especializado em assistência social e BPC/LOAS para idosos e pessoas com deficiência. Contexto: Cliente é [idoso 65+ anos / pessoa com deficiência] em miserabilidade (renda familiar per capita < 1/4 SM) com pedido de BPC negado administrativamente. \nTarefa: Elabore ação de concessão de BPC/LOAS demonstrando preenchimento dos requisitos (idade/deficiência + miserabilidade) e contestando o indeferimento, com análise ampliada da miserabilidade além do critério objetivo. Instruções: Identifique tipo de BPC (idoso: 65+ anos + miserabilidade no art. 20, §1º Lei 8.742/93; deficiência: impedimentos de longo prazo mínimo 2 anos que impeçam participação plena conforme Lei 13.146/15 + miserabilidade); para BPC idoso apresente certidão comprovando 65+ anos; para BPC deficiência apresente documentação médica robusta (relatórios, laudos de especialistas, exames, atestados de incapacidade, CID, CIF) e requeira perícia judicial médica e social com avaliação biopsicossocial demonstrando impedimentos e impossibilidade de vida independente; comprove miserabilidade pelo critério objetivo calculando renda familiar per capita (grupo familiar: requerente + cônjuge + pais + filhos/enteados solteiros <21 anos ou inválidos + irmãos solteiros <21 anos ou inválidos, conforme art. 20, §1º Decreto 6.214/07; fórmula: soma de rendas ÷ integrantes < 1/4 SM; excluir BPC de outro membro conforme Tema 1.50 TNU); demonstre miserabilidade por critério ampliado além do objetivo (fundamentando na análise de outros elementos permitida pelo STF no Tema 185) apresentando despesas médicas elevadas (medicamentos, tratamentos, fraldas, alimentação especial), gastos com cuidador, condições precárias de moradia, ausência de patrimônio, comprometimento da renda com necessidades básicas, CadÚnico com baixa pontuação, inscrição em programas sociais; apresente documentação completa (documentos pessoais do requerente e grupo familiar, certidões, comprovantes de renda de todos, relatórios médicos para deficiência, comprovante de residência, CadÚnico, declaração de composição familiar, comprovantes de despesas); requeira concessão desde DER ou ajuizamento, implantação em 45 dias, atrasados, tutela antecipada (urgência pela miserabilidade), perícia médica e social, e não aplicação do critério objetivo se renda ligeiramente acima de 1/4 SM. Formato: Qualificação + fatos (situação de idoso/deficiente, miserabilidade, indeferimento) + direito (requisito etário/deficiência, miserabilidade comprovada, inconstitucionalidade/insuficiência do 1/4 SM se aplicável, direito ao BPC) + composição familiar e cálculo de renda per capita + despesas excepcionais + tutela antecipada + provas + pedidos + anexos com planilha de cálculo."
  },
  {
    "id": "p-75",
    "title": "Quesitos para Perícia Judicial",
    "category": "Direito Processual (Perícias)",
    "type": "Análise",
    "tags": [],
    "description": "Elaboração de lista objetiva de quesitos periciais estratégicos.",
    "prompt": "Atue como um perito judicial especializado em [área específica], e com base nos documentos apresentados no processo, elabore uma lista objetiva de quesitos periciais estratégicos que favoreçam a tese defendida pelo [autor/réu], começando com questões preliminares sobre [descrever o objeto da perícia], seguidas por perguntas específicas para esclarecer o nexo causal entre [fato gerador] e [dano alegado], o período e intensidade de exposição a fatores de risco (se aplicável), a eficácia das medidas preventivas ou mitigadoras adotadas, o grau de comprometimento resultante, e possíveis fatores concorrentes, utilizando linguagem técnica apropriada e formulando as perguntas de modo objetivo para fortalecer nossa argumentação sem parecer tendencioso ou induzir respostas."
  },
  {
    "id": "p-76",
    "title": "Análise de Contestação e Sentença para Recurso",
    "category": "Direito Processual Civil",
    "type": "Análise",
    "tags": [],
    "description": "Avaliar contestação e sentença para definir viabilidade de recurso",
    "prompt": "Como advogado especializado em recursos, analise a contestação, a sentença e demais peças processuais, apresentando relatório objetivo sobre viabilidade de apelação. Compare teses defensivas com provas dos autos e resultado da sentença, indicando pontos desfavoráveis ao réu. Avalie chances de êxito em recurso, custos e riscos envolvidos. Conclua com recomendação sobre recorrer ou não."
  },
  {
    "id": "p-77",
    "title": "Análise de Inicial e Sentença para Recurso",
    "category": "Direito Processual Civil",
    "type": "Análise",
    "tags": [],
    "description": "Verificar necessidade e utilidade de recorrer",
    "prompt": "Como advogado especializado em recursos, analise a petição inicial, a sentença e demais peças processuais, apresentando relatório sobre viabilidade de apelação. Compare teses e pedidos da inicial com provas e resultado da sentença, apontando improcedência ou procedência parcial desfavorável ao autor. Avalie chances de sucesso, custos e riscos, concluindo se há ou não necessidade de recurso."
  },
  {
    "id": "p-78",
    "title": "Análise de Omissão em Decisão Judicial",
    "category": "Direito Processual Civil",
    "type": "Análise",
    "tags": [],
    "description": "Identificação de omissões em sentença para fundamentar embargos de declaração.",
    "prompt": "Papel: Advogado do [autor/réu] especialista na redação de recursos. Contexto: Análise de sentença para identificar omissões conforme art. 1.022, parágrafo único, II c/c art. 489, §1º do CPC. Caracterizam-se como omissões: a falta de enfrentamento de argumentos capazes de infirmar a conclusão, ausência de análise de pedidos formulados, teses jurídicas relevantes não apreciadas ou documentos essenciais ignorados. Para fundamentar embargos de declaração, a omissão deve ter sido previamente suscitada no processo e impactar o resultado do julgamento. Tarefa: Identifique omissões na sentença que possam fundamentar um recurso embargos de declaração. Instruções: 1) Localize argumentos, questões fáticas e fundamentos jurídicos ignorados pelo juízo; 2) Indique localização exata (página/parágrafo). Formato: Tabela com colunas: Tipo de Omissão, Síntese da Omissão, Trecho Original e Localização."
  },
  {
    "id": "p-79",
    "title": "Extração de Dispositivos Legais de Decisão Judicial",
    "category": "Direito Processual Civil",
    "type": "Análise",
    "tags": [],
    "description": "Identificação dos principais fundamentos jurídicos de decisões judiciais.",
    "prompt": "Como assistente jurídico especializado em análise de decisões judiciais, examine o documento fornecido e extraia os principais fundamentos jurídicos. Identifique: (1) Artigos de lei citados e sua relevância para o caso, (2) Dispositivos legais que embasam os argumentos centrais, (3) Normas específicas que fundamentam a conclusão. Apresente os fundamentos de forma organizada, com breve explicação sobre como cada dispositivo se aplica ao caso. Use linguagem técnica precisa e limite-se aos fundamentos expressamente mencionados no documento. Ao final, pergunte se o usuário deseja detalhamento adicional sobre algum dos fundamentos identificados."
  },
  {
    "id": "p-80",
    "title": "Extração de Fatos, Provas e Fundamentação em Sentença",
    "category": "Direito Processual Civil",
    "type": "Análise",
    "tags": [],
    "description": "Organização tabular de fatos, provas e fundamentos extraídos de sentença.",
    "prompt": "Prompt 108 – Extração de fatos, provas, fundamentos e dispositivo de sentença em formato de tabela. Como assistente jurídico especializado em análise estruturada de sentenças judiciais, examine o documento fornecido e extraia as informações essenciais para criar uma tabela organizada com três seções principais: (1) FATOS RELEVANTES: eventos principais, datas, envolvidos e cronologia reconhecida pelo juízo; (2) PROVAS CONSIDERADAS: documentos, depoimentos, perícias e elementos determinantes; (3) DECISÃO E FUNDAMENTAÇÃO: dispositivo final, argumentos jurídicos, precedentes e artigos de lei aplicados; apresente os dados em formato tabular objetivo, preservando a linguagem técnica quando necessário, e finalize com um parágrafo sintetizando a ratio decidendi, perguntando se o usuário deseja aprofundamento em algum elemento específico ou conexões entre fatos e provas."
  },
  {
    "id": "p-81",
    "title": "Capítulo de Apelação Estruturado (QRAC)",
    "category": "Direito Processual Civil",
    "type": "Redação",
    "tags": [],
    "description": "Estruturação de capítulo de apelação no modelo Questão-Regra-Aplicação-Conclusão.",
    "prompt": "Como advogado do (AUTOR/RÉU), crie um capítulo de apelação com estrutura QRAC (Questão-Regra-Aplicação-Conclusão) impugnando trecho específico da sentença. Verifique se o trecho e os fundamentos jurídicos foram fornecidos – caso não, solicite-os. Só redija quando tiver ambas informações. Estruture com: identificação do ponto controverso (questão), apresentação dos fundamentos jurídicos fornecidos (Regra), demonstração da contradição entre fundamentos e sentença (Aplicação), e conclusão indicando a reforma necessária. Use linguagem técnica, mantenha foco na impugnação específica e utilize exclusivamente os fundamentos fornecidos."
  },
  {
    "id": "p-82",
    "title": "Capítulo de Mérito com Argumentação Jurídica",
    "category": "Direito Processual Civil",
    "type": "Redação",
    "tags": [],
    "description": "Elaboração de capítulo de mérito com ênfase em argumentação técnica e jurídica estruturada em parágrafos curtos.",
    "prompt": "Como advogado do [AUTOR/RÉU], redija um capítulo específico do mérito sobre [tema] contendo 7-9 parágrafos curtos e 4-5 linhas cada. Verifique se há contexto fático e fundamentos jurídicos específicos (caso não, pergunte). Comece com 1-2 parágrafos de fatos, siga com argumentação jurídica em parágrafos curtos, inserindo espaços entre parágrafos para as citações legais [Art. XX – citação]. Não mencione nenhuma jurisprudência ou fundamento jurídico que não tenha sido explicitamente fornecida. Mantenha o texto conciso, sem títulos ou numerações."
  },
  {
    "id": "p-83",
    "title": "Transformação de Relatório em Capítulo de Fatos",
    "category": "Direito Processual Civil",
    "type": "Redação",
    "tags": [],
    "description": "Conversão de relatório de atendimento em capítulo de fatos para petição inicial, mantendo ênfase em elementos probatórios.",
    "prompt": "Como advogado especializado na redação de petições iniciais, transforme o relatório de atendimento em um capítulo de fatos para petição inicial que tem por objetivo [indique resumidamente o objetivo geral desta ação]. Organize cronologicamente em parágrafos curtos. Integre argumentos que defendam os interesses do autor de forma convincente, destacando elementos probatórios disponíveis. Use linguagem formal e técnica, substitua nomes por “Requerente” e “Requerido”, mantenha tom profissional sem excessos argumentativos. Enfatize as provas mencionadas no relatório. Limite-se a argumentos fáticos, sem citar jurisprudências ou legislações."
  },
  {
    "id": "p-84",
    "title": "Análise de Processo de Execução e Próximos Passos",
    "category": "Direito Processual Civil (Execução)",
    "type": "Análise",
    "tags": [],
    "description": "Orientações práticas para a condução do processo de execução/cumprimento de sentença.",
    "prompt": "Como advogado especializado em processo de execução, analise o atual estágio do processo executivo e sugira os próximos passos processuais adequados a serem requeridos ao juízo. Verifique se as informações do processo executivo (tipo de execução, fase atual, diligências já realizadas, resultados obtidos e pendentes) foram fornecidas – caso não, solicite-as. Estruture a análise com: 1) Resumo da situação atual do processo executivo (Status); 2) Identificação dos obstáculos ou pendências processuais existentes (Obstáculos); 3) Fundamentação legal das medidas cabíveis neste momento processual (Fundamento); 4) Sugestão objetiva e prática das próximas diligências ou requerimentos a serem apresentados ao juízo (Providências). Utilize linguagem técnico-jurídica, mantenha foco nas medidas mais eficientes para satisfação do crédito, ordene as sugestões por prioridade e viabilidade, e indique claramente os dispositivos legais que amparam cada medida sugerida."
  },
  {
    "id": "p-85",
    "title": "Análise de Proposta de Planejamento Tributário e Elisão Fiscal",
    "category": "Direito Tributário",
    "type": "Análise",
    "tags": [],
    "description": "Elisão fiscal é economia tributária lícita mediante atos anteriores ao fato gerador, usando meios legais. Evasão é redução ilícita por atos posteriores ao fato gerador (sonegação, fraude, conluio - Lei 8.137/90). O propósito negocial legitima o planejamento, afastando artificialidade. A norma antielisiva permite desconsiderar atos sem propósito negocial que visem exclusivamente economia fiscal. Limites: simulação (art. 149, VII, CTN), abuso de direito (art. 187, CC) e fraude à lei. O planejamento deve respeitar a substância econômica sobre a forma jurídica.",
    "prompt": "Avalie a legitimidade do planejamento tributário proposto distinguindo elisão de evasão fiscal. Analise: (1) momento dos atos - se anteriores ao fato gerador, (2) licitude dos meios empregados e causa jurídica dos negócios, (3) propósito negocial além da economia tributária, (4) aplicabilidade da norma antielisiva (art. 116, parágrafo único, CTN). Verifique simulação, dissimulação, fraude à lei ou abuso de direito. Considere capacidade contributiva e isonomia tributária. Conclua sobre: validade da estrutura, riscos de desconsideração e economia tributária efetiva."
  },
  {
    "id": "p-86",
    "title": "Análise de Auto de Infração e Imposição de Multa (AIIM)",
    "category": "Direito Tributário",
    "type": "Análise",
    "tags": [],
    "description": "Analisa autos de infração identificando vícios formais e materiais. Cole o AIIM e informe tributo, valor e infração alegada para receber análise completa com teses de defesa e jurisprudência aplicável.",
    "prompt": "Papel: Atue como advogado tributarista especializado em defesas administrativas fiscais com 15 anos de experiência em processos administrativos tributários.\nContexto: Um contribuinte recebeu um Auto de Infração e Imposição de Multa lavrado pela Receita Federal/Estadual/Municipal referente a [tributo específico] no valor de [valor], alegando [infração].\nTarefa: Analise o AIIM identificando vícios formais e materiais que possam fundamentar defesa ou impugnação administrativa.\nInstruções:\n1. Verifique o atendimento aos requisitos formais do art. 142 do CTN\n2. Identifique possíveis vícios de competência, forma, objeto e motivação\n3. Analise a capitulação legal e sua adequação à conduta imputada\n4. Verifique a observância dos prazos decadenciais (art. 173 e 150, §4º do CTN)\n5. Examine o cálculo da multa e sua proporcionalidade conforme Súmula Vinculante 50\n6. Identifique teses de defesa aplicáveis ao caso\nRequisitos:\n- Cite dispositivos específicos do CTN, legislação do tributo e regulamentos aplicáveis\n- Referencie jurisprudência consolidada do CARF, STJ e STF quando pertinente\n- Identifique se há teses repetitivas ou precedentes vinculantes aplicáveis\nFormato de Saída:\n1. Análise de Regularidade Formal (vícios formais identificados)\n2. Análise Material (inadequações na capitulação e cálculo)\n3. Verificação de Decadência e Prescrição\n4. Teses de Defesa Aplicáveis (ordem de prioridade)\n5. Jurisprudência de Suporte\n6. Recomendação Estratégica"
  },
  {
    "id": "p-87",
    "title": "Análise de Incidência Tributária",
    "category": "Direito Tributário",
    "type": "Análise",
    "tags": [],
    "description": "A incidência tributária ocorre quando o fato concreto se subsume à hipótese abstrata prevista em lei (fato gerador - art. 114 CTN). A regra-matriz de incidência decompõe-se em: critério material (verbo + complemento), temporal (momento), espacial (local), pessoal (sujeitos) e quantitativo (base + alíquota). A obrigação tributária nasce com o fato gerador (art. 113), sendo principal (pagamento) ou acessória (deveres instrumentais). Imunidades são limitações constitucionais ao poder de tributar; isenções são dispensas legais do pagamento.",
    "prompt": "omo especialista tributário, analise a incidência tributária sobre a operação descrita. Verifique: (1) hipótese de incidência conforme CTN - aspecto material, temporal, espacial e pessoal, (2) momento do fato gerador e nascimento da obrigação tributária, (3) base de cálculo e alíquota aplicável, (4) sujeito passivo direto e responsável tributário se houver. Identifique possíveis imunidades (art. 150, VI, CF) ou isenções específicas. Apresente parecer estruturado: enquadramento legal, cálculo da obrigação principal e obrigações acessórias aplicáveis."
  },
  {
    "id": "p-88",
    "title": "Comparador de Enquadramento Tributário",
    "category": "Direito Tributário",
    "type": "Análise",
    "tags": [],
    "description": "Este prompt analisa e compara automaticamente os três regimes tributários brasileiros (Simples Nacional, Lucro Presumido e Lucro Real) para identificar qual é mais vantajoso para sua empresa. Basta fornecer informações básicas como faturamento anual, tipo de atividade, folha de pagamento e custos operacionais, e você receberá uma análise completa com cálculos detalhados da carga tributária de cada regime, quadro comparativo em tabela, identificação do regime mais econômico, economia estimada e orientações sobre próximos passos - tudo fundamentado na legislação vigente e organizado de forma clara para apoiar sua decisão junto ao contador.",
    "prompt": "Como consultor tributário especializado em regimes de tributação empresarial, analise qual regime tributário (Simples Nacional, Lucro Presumido ou Lucro Real) é mais vantajoso para a empresa do usuário. Solicite: (1) faturamento anual, (2) tipo de atividade/CNAE, (3) folha de pagamento mensal, (4) margem de lucro ou custos operacionais. Verifique a elegibilidade para cada regime, calcule a carga tributária estimada de forma discriminada (mostrando cada tributo individualmente), apresente um quadro comparativo claro indicando o regime mais vantajoso e a economia estimada. Inclua vantagens/desvantagens não-tributárias (obrigações acessórias, complexidade contábil). Organize a resposta em seções: (1) Dados da Análise, (2) Elegibilidade, (3) Comparativo de Carga Tributária (tabela), (4) Detalhamento por Regime, (5) Recomendação Fundamentada, (6) Próximos Passos. Use linguagem técnica apropriada, cite dispositivos legais relevantes e alerte que a análise não substitui acompanhamento profissional contábil. Limite cálculos a 12 meses e baseie-se estritamente na legislação tributária brasileira vigente."
  },
  {
    "id": "p-89",
    "title": "Redação de Impugnação de Lançamento de ICMS por Diferencial de Alíquota",
    "category": "Direito Tributário",
    "type": "Análise",
    "tags": [],
    "description": "Elabora impugnação contra autuações de ICMS-DIFAL em operações interestaduais. Informe período autuado e operações para receber defesa fundamentada com teses constitucionais e jurisprudência do STF.",
    "prompt": "Papel: Atue como advogado tributarista especializado em ICMS e operações interestaduais.\nContexto: Empresa comercial recebeu autuação estadual por alegado recolhimento insuficiente de ICMS-DIFAL em operações interestaduais destinadas a consumidor final não contribuinte, no período de [data] a [data].\nTarefa: Elabore impugnação administrativa fundamentada contestando o lançamento de ICMS diferencial de alíquota.\nInstruções:\n1. Verifique a aplicabilidade temporal da EC 87/2015 e Convênio ICMS 93/2015\n2. Analise se há discussão sobre Lei Complementar 190/2022 e tese de inconstitucionalidade\n3. Identifique se as operações estavam no regime de substituição tributária\n4. Verifique se há dupla tributação ou bitributação\n5. Analise o conceito de \"consumidor final não contribuinte\"\n6. Examine se houve recolhimento parcial ou integral por outro meio\nRequisitos:\n- Fundamentação na LC 87/96, EC 87/2015 e LC 190/2022\n- Citação de decisões do STF (RE 1.287.019, tema 1093)\n- Análise de eventual modulação de efeitos\n- Verificação de operações específicas por NCM/CEST\nFormato de Saída:\n- Preliminares (vícios formais, decadência, prescrição)\n- Mérito (teses materiais sobre não incidência ou incidência menor)\n- Pedido específico e subsidiários\n- Documentação probatória necessária"
  },
  {
    "id": "p-90",
    "title": "Análise Jurídica em Direito de Família pelo Método FIRAC",
    "category": "Direito de Família",
    "type": "Análise",
    "tags": [],
    "description": "Produzir uma análise jurídica detalhada de conflitos familiares empregando o método FIRAC, de forma a permitir a construção de um parecer ou fundamentação processual com alta densidade técnica e precisão argumentativa.",
    "prompt": "{\n  \"title\": \"Análise Jurídica em Direito de Família pelo Método FIRAC\",\n  \"role\": \"advogado de família\",\n  \"objective\": \"Produzir uma análise jurídica detalhada de conflitos familiares empregando o método FIRAC, de forma a permitir a construção de um parecer ou fundamentação processual com alta densidade técnica e precisão argumentativa.\",\n  \"steps\": [\n    \"1. Solicite ao usuário todos os fatos relevantes do caso: qual a relação jurídica entre as partes (casamento, união estável, parentesco), se há filhos, qual a idade deles, se existem bens a partilhar, se há histórico de litígios ou medidas anteriores (alimentos provisórios, guarda, visitas, medidas protetivas). Peça que detalhe a cronologia, fornecendo datas aproximadas, contextos familiares e qualquer decisão judicial prévia.\",\n    \"2. Sistematize os FATOS em ordem cronológica, diferenciando fatos incontroversos (aqueles já documentados ou reconhecidos pelas partes) e fatos controvertidos (que precisarão de prova em juízo). Acrescente observações sobre o impacto jurídico de cada fato, de modo a contextualizar a relevância para a demanda.\",\n    \"3. Identifique a QUESTÃO JURÍDICA CENTRAL, formulando-a de maneira clara e precisa. Por exemplo: 'O ponto a decidir é se o genitor possui capacidade financeira para arcar com a pensão pleiteada' ou 'A questão consiste em saber se há direito à partilha de bens adquiridos durante a união estável não formalizada'.\",\n    \"4. Aplique a etapa RULE: traga a legislação aplicável (Código Civil, especialmente arts. 1.694-1.710 sobre alimentos, arts. 1.571-1.582 sobre dissolução da sociedade conjugal, arts. 1.583-1.590 sobre guarda), dispositivos constitucionais (art. 226 CF, proteção da família), o Estatuto da Criança e do Adolescente e a jurisprudência mais recente do STJ e STF. Insira precedentes obrigatórios e súmulas quando cabível.\",\n    \"5. Desenvolva a etapa APPLICATION: relacione cada regra aos fatos narrados, demonstrando a lógica jurídica e a forma como a norma deve ser aplicada ao caso concreto. Utilize linguagem técnica e persuasiva, rebatendo possíveis argumentos contrários e destacando pontos de vulnerabilidade da parte adversa.\",\n    \"6. Finalize com a CONCLUSÃO: elabore uma síntese consistente que indique a solução mais adequada, sugerindo encaminhamentos práticos como ajuizamento de ação, interposição de recurso, acordo extrajudicial ou outras medidas cabíveis.\"\n  ],\n  \"output_format\": \"Relatório completo em cinco seções: Fatos, Questão Jurídica, Regras, Aplicação e Conclusão, redigido em linguagem formal e estruturada.\",\n  \"validation_points\": \"Solicite validação do usuário após a organização dos fatos e novamente após a formulação da questão jurídica, antes de aplicar as regras.\",\n  \"tags\": [\n    \"Direito de Família\",\n    \"FIRAC\",\n    \"Parecer\",\n    \"Análise Estruturada\",\n    \"Processo Civil\"\n  ]\n}"
  },
  {
    "id": "p-91",
    "title": "Análise de Provas em Direito de Família por meio da Técnica da Pertinência Probatória",
    "category": "Direito de Família",
    "type": "Análise",
    "tags": [],
    "description": "Examinar em profundidade as provas apresentadas em litígios de família, classificando-as segundo sua pertinência, validade, suficiência e fragilidades, com base na técnica da pertinência-probatória.",
    "prompt": "Como advogado especializado em direito de família, examine as provas do litígio aplicando a técnica da pertinência-probatória para classificá-las segundo pertinência, validade, suficiência e fragilidades. Solicite primeiro a lista completa de provas disponíveis (certidões, recibos, comprovantes de renda, extratos, conversas de aplicativos, e-mails, testemunhas, laudos psicológicos, relatórios escolares). Classifique cada prova por tipo (documental, testemunhal, pericial, digital), analise sua pertinência ao objeto da demanda (comprovantes financeiros para alimentos, laudos psicológicos para guarda, prints para alienação parental). Avalie a suficiência probatória conforme art. 371 CPC, verificando se sustenta isoladamente a tese ou precisa reforço. Aponte fragilidades específicas (documentos sem assinatura, testemunhas interessadas, prints não autenticados) e riscos processuais. Sugira complementações necessárias (estudo social, perícias, testemunhas neutras). Apresente em tabela com colunas: Prova, Tipo, Pertinência, Suficiência, Fragilidades e Provas Complementares."
  },
  {
    "id": "p-92",
    "title": "Exame Crítico de Decisões em Direito de Família pela Técnica da Fundamentação Crítica",
    "category": "Direito de Família",
    "type": "Análise",
    "tags": [],
    "description": "Realizar análise crítica e aprofundada de decisões judiciais em Direito de Família, identificando falhas de fundamentação, omissões e contradições, à luz do art. 489 do CPC, e sugerindo estratégias recursais.",
    "prompt": "{\n  \"title\": \"Exame Crítico de Decisões em Direito de Família pela Técnica da Fundamentação Crítica\",\n  \"role\": \"advogado de família\",\n  \"objective\": \"Realizar análise crítica e aprofundada de decisões judiciais em Direito de Família, identificando falhas de fundamentação, omissões e contradições, à luz do art. 489 do CPC, e sugerindo estratégias recursais.\",\n  \"steps\": [\n    \"1. Solicite ao usuário a íntegra da decisão a ser analisada (sentença, acórdão ou decisão interlocutória).\",\n    \"2. Sistematize os fundamentos fáticos utilizados pelo magistrado e depois os fundamentos jurídicos, separando-os em tópicos distintos.\",\n    \"3. Identifique vícios de fundamentação: ausência de enfrentamento de todos os argumentos relevantes, contradições entre fundamentação e dispositivo, uso de conceitos jurídicos indeterminados sem explicitação, repetição genérica de jurisprudência sem cotejo com o caso concreto.\",\n    \"4. Confronte a decisão com jurisprudência consolidada e precedentes obrigatórios do STJ e STF, indicando divergências e pontos de alinhamento.\",\n    \"5. Avalie se cabem embargos de declaração (em caso de omissão, obscuridade ou contradição), apelação (em caso de erro material ou má valoração da prova) ou agravo de instrumento (em decisões interlocutórias).\",\n    \"6. Elabore relatório crítico dividido em seções, apresentando fundamentos identificados, falhas de fundamentação, confronto jurisprudencial e estratégias recursais recomendadas.\"\n  ],\n  \"output_format\": \"Relatório crítico dividido em: Fundamentos do Juízo, Falhas de Fundamentação, Confronto Jurisprudencial, Estratégia Recursal.\",\n  \"validation_points\": \"Solicite confirmação do usuário antes de sugerir a medida recursal adequada.\",\n  \"tags\": [\n    \"Direito de Família\",\n    \"Fundamentação Crítica\",\n    \"Recursos\",\n    \"Processo Civil\",\n    \"Decisões Judiciais\"\n  ]\n}"
  },
  {
    "id": "p-93",
    "title": "Exame de Documentos em Direito de Família pela Técnica da Força Probatória",
    "category": "Direito de Família",
    "type": "Análise",
    "tags": [],
    "description": "Avaliar em profundidade documentos apresentados em litígios de família, classificando-os quanto à validade formal, força probatória e utilidade para a tese, segundo a técnica da força probatória prevista no CPC e doutrina processual.",
    "prompt": "{\n  \"title\": \"Exame de Documentos em Direito de Família pela Técnica da Força Probatória\",\n  \"role\": \"advogado de família\",\n  \"objective\": \"Avaliar em profundidade documentos apresentados em litígios de família, classificando-os quanto à validade formal, força probatória e utilidade para a tese, segundo a técnica da força probatória prevista no CPC e doutrina processual.\",\n  \"steps\": [\n    \"1. Solicite ao usuário a lista completa de documentos: certidões de nascimento e casamento, contratos, comprovantes de renda, boletins escolares, relatórios médicos, mensagens eletrônicas, recibos, extratos financeiros, documentos de propriedade.\",\n    \"2. Verifique a validade formal de cada documento: autenticidade, se é público ou particular, existência de assinatura, reconhecimento em cartório, registro oficial.\",\n    \"3. Classifique a força probatória de cada documento: plena (documentos públicos), relativa (documentos particulares assinados), indiciária (prints, recibos informais).\",\n    \"4. Relacione cada documento com a tese principal da parte: por exemplo, certidão de nascimento comprova filiação; comprovantes de despesas escolares demonstram necessidade de alimentos; contrato de aluguel evidencia despesas ordinárias do guardião.\",\n    \"5. Aponte a utilidade estratégica do documento para o processo e indique possíveis complementações (atestados médicos adicionais, certidões atualizadas, perícias documentais).\",\n    \"6. Apresente um quadro detalhado que permita ao usuário compreender quais documentos são suficientes, quais precisam de reforço e quais podem ser descartados por baixa relevância.\"\n  ],\n  \"output_format\": \"Tabela com colunas: Documento, Validade Formal, Força Probatória, Utilidade, Complementações Recomendadas.\",\n  \"validation_points\": \"Confirme com o usuário se todos os documentos disponíveis foram listados antes da análise.\",\n  \"tags\": [\n    \"Direito de Família\",\n    \"Força Probatória\",\n    \"Documentos\",\n    \"Provas\",\n    \"Processo Civil\"\n  ]\n}"
  },
  {
    "id": "p-94",
    "title": "Organização Cronológica e Quadro Fático-Probatório em Demandas Familiares",
    "category": "Direito de Família",
    "type": "Análise",
    "tags": [],
    "description": "Estruturar os acontecimentos de um conflito familiar em ordem cronológica aplicando a técnica do quadro fático-probatório, permitindo identificar relevância jurídica, controvérsia e meios de prova possíveis.",
    "prompt": "{\n  \"title\": \"Organização Cronológica e Quadro Fático-Probatório em Demandas Familiares\",\n  \"role\": \"advogado de família\",\n  \"objective\": \"Estruturar os acontecimentos de um conflito familiar em ordem cronológica aplicando a técnica do quadro fático-probatório, permitindo identificar relevância jurídica, controvérsia e meios de prova possíveis.\",\n  \"steps\": [\n    \"1. Solicite ao usuário uma descrição ampla e cronológica dos eventos: data de início da relação, casamento ou união estável, nascimento de filhos, separação de corpos, eventual violência doméstica, guarda provisória, partilha de bens iniciada, acordos não cumpridos. Incentive a detalhar cada evento com documentos ou evidências associadas.\",\n    \"2. Reordene os fatos apresentados em uma linha do tempo clara, destacando o encadeamento lógico dos acontecimentos, o contexto socioeconômico e familiar em que ocorreram e sua relevância jurídica.\",\n    \"3. Classifique cada fato como incontroverso (comprovado documentalmente ou aceito pelas partes) ou controverso (dependente de prova testemunhal, pericial ou complementar).\",\n    \"4. Construa um quadro fático-probatório relacionando fatos, relevância jurídica, status (controverso/incontroverso) e prova disponível ou recomendada. Exemplo: 'Data: 10/02/2019 – nascimento do filho – relevância: fixação de alimentos – status: incontroverso – prova: certidão de nascimento'.\",\n    \"5. Indique as lacunas probatórias e sugira complementações, como estudo psicossocial, perícia médica, prova testemunhal ou juntada de documentos adicionais.\",\n    \"6. Ao final, apresente a linha cronológica estruturada e o quadro probatório como ferramentas auxiliares para a redação de petições, memoriais e peças recursais.\"\n  ],\n  \"output_format\": \"Linha do tempo textual e tabela analítica com colunas: Data, Fato, Relevância Jurídica, Status (controverso/incontroverso), Prova Vinculada ou Recomendada.\",\n  \"validation_points\": \"Submeta a linha do tempo inicial ao usuário para validação antes de prosseguir para a etapa de classificação e quadro probatório.\",\n  \"tags\": [\n    \"Direito de Família\",\n    \"Quadro Fático-Probatório\",\n    \"Organização Fática\",\n    \"Litígio Familiar\",\n    \"Processo Civil\"\n  ]\n}"
  },
  {
    "id": "p-95",
    "title": "Estrutura de Petição Inicial para Ação de Dissolução de União Estável",
    "category": "Direito de Família",
    "type": "Redação",
    "tags": [],
    "description": "Estrutura validada para dissolução de união: (1) verifica requisitos da união estável e patrimônio; (2) aplica CC arts. 1.723-1.727 e Lei 9.278/96; (3) organiza petição com partilha e guarda. Etapas interativas asseguram caracterização legal e divisão patrimonial adequada.",
    "prompt": "Atue como advogado especializado em direito de família com expertise na análise de relacionamentos afetivos e elaboração de ações de dissolução, considerando as disposições do Código Civil (artigos 1.723 a 1.727), Lei 9.278/96 e Súmula 377 do STF. Etapa 1: Analise os dados fornecidos sobre o relacionamento (período de convivência, publicidade, continuidade, objetivo de constituir família), patrimônio adquirido na constância da união, existência de filhos comuns e causas da dissolução, identifique se estão caracterizados os requisitos da união estável (convivência pública, contínua, duradoura com objetivo de constituir família) e o regime patrimonial aplicável, confirmando comigo sua análise antes de prosseguir perguntando: \"Baseado nos elementos apresentados, identifiquei união estável no período de [data] a [data], caracterizada por [elementos], com patrimônio [descrição] adquirido sob regime de [modalidade] e [situação dos filhos]. A configuração da união estável está demonstrada pelos seguintes motivos: [justificativa]. Esta análise está correta para prosseguirmos?\" Etapa 2: Após minha confirmação, determine a legislação específica aplicável (artigos 1.723, 1.725, 1.726 do CC, Lei 9.278/96, Súmula 377 STF para regime patrimonial, ECA se houver menores), elabore a fundamentação legal detalhada incluindo partilha de bens e guarda de filhos quando aplicável, e valide comigo perguntando: \"A fundamentação legal proposta contempla: [lista dos dispositivos]. A base legal para dissolução, partilha patrimonial e questões envolvendo filhos está adequadamente fundamentada? Posso prosseguir para a estruturação da petição?\" Etapa 3: Com sua validação, elabore um esboço estruturado da ação de dissolução organizado em capítulos numerados (qualificação das partes e competência, histórico e caracterização da união estável, causas e fundamentação da dissolução, inventário e partilha dos bens comuns, regulamentação de guarda e alimentos se aplicável, requerimentos processuais e medidas urgentes), apresentando para cada capítulo uma síntese de 2-3 linhas sobre o conteúdo específico que será desenvolvido, os dispositivos legais que serão invocados e a documentação probatória necessária, finalizando com a pergunta: \"Este esboço estrutural atende à sua necessidade? Deseja que eu desenvolva algum capítulo específico ou ajuste a estrutura proposta?\""
  },
  {
    "id": "p-96",
    "title": "Análise de Cláusulas Abusivas em Contrato de Consumo",
    "category": "Direito do Consumidor",
    "type": "Análise",
    "tags": [],
    "description": "Auxilia na identificação e avaliação de cláusulas contratuais potencialmente abusivas em contratos de consumo.",
    "prompt": "Atue como advogado especializado em Direito do Consumidor e auxilie na análise de cláusulas contratuais potencialmente abusivas. Etapa 1 – Solicite: (a) cópia integral do contrato, (b) serviços/produtos contratados, (c) cláusulas suspeitas. Etapa 2 – Apresente lista numerada dos pontos mais relevantes do contrato. Etapa 3 – Pergunte se deseja aprofundar na análise de riscos de cada cláusula. Etapa 4 – Monte tabela com 3 colunas: 'Cláusula' | 'Possível Abusividade (art. 51 do CDC)' | 'Comentário Técnico'."
  },
  {
    "id": "p-97",
    "title": "Análise de Contrato de Adesão sob Perspectiva Consumerista",
    "category": "Direito do Consumidor",
    "type": "Análise",
    "tags": [],
    "description": "Examina contratos de adesão, destacando cláusulas de destaque obrigatório e restrições ao consumidor.",
    "prompt": "Atue como advogado especialista em Direito do Consumidor e analise contrato de adesão. Etapa 1 – Solicite: (a) objeto do contrato, (b) principais cláusulas, (c) se houve negociação, (d) cláusulas limitativas. Etapa 2 – Identifique cláusulas de destaque obrigatório (art. 54 §4º do CDC) em lista numerada. Etapa 3 – Pergunte se deseja expandir para equilíbrio contratual. Etapa 4 – Monte tabela com 3 colunas: 'Cláusula' | 'Risco/Restrição ao Consumidor' | 'Comentário Técnico'."
  },
  {
    "id": "p-98",
    "title": "Análise de Prática Abusiva em Relação de Consumo",
    "category": "Direito do Consumidor",
    "type": "Análise",
    "tags": [],
    "description": "Permite identificar e classificar práticas abusivas à luz do CDC, com saída em tabela e resumo crítico.",
    "prompt": "Atue como advogado consumerista e analise prática abusiva. Etapa 1 – Solicite: (a) qual prática foi identificada, (b) cobrança indevida, (c) limitação de direito ou cláusula onerosa, (d) documentos comprobatórios. Etapa 2 – Classifique a prática abusiva conforme arts. 39 e 51 do CDC em tabela: 'Conduta' | 'Fundamento legal' | 'Impacto no consumidor'. Etapa 3 – Pergunte se deseja expandir para medidas cabíveis. Etapa 4 – Elabore resumo numerado com riscos e pontos de defesa."
  },
  {
    "id": "p-99",
    "title": "Análise de Responsabilidade Civil Consumerista: Verificação Completa de Requisitos CDC",
    "category": "Direito do Consumidor",
    "type": "Análise",
    "tags": [],
    "description": "Cole o prompt na IA e forneça contexto completo do caso consumerista. A IA fará síntese técnica identificando violações ao CDC para sua validação. Aprovando, gerará relatório completo com fundamentação legal e estratégia processual recomendada.",
    "prompt": "Atue como um advogado especialista em direito do consumidor com ampla experiência em responsabilidade civil consumerista e análise de violações às relações de consumo. Analise sistematicamente a responsabilidade civil em caso de direito do consumidor verificando todos os requisitos legais com base no contexto fornecido. Etapa 1: Solicite ao usuário que forneça o contexto completo do caso incluindo: (a) descrição detalhada dos fatos ocorridos, (b) identificação do fornecedor e do consumidor, (c) produto ou serviço envolvido, (d) danos alegados (materiais, morais, estéticos), (e) documentos e provas disponíveis, (f) tentativas de solução extrajudicial realizadas, aguardando as informações completas antes de prosseguir. Etapa 2: Com base no contexto fornecido, realize automaticamente síntese técnica do caso e análise completa identificando: (a) caracterização da relação de consumo conforme art. 2º e 3º do CDC, (b) verificação dos requisitos da responsabilidade civil consumerista (conduta, nexo causal, dano), (c) identificação de possíveis violações ao CDC (vícios do produto/serviço, publicidade enganosa, práticas abusivas, defeitos de informação), (d) aplicabilidade da responsabilidade objetiva (art. 12, 14 e 18 do CDC), (e) quantificação preliminar dos danos, (f) prescrição e decadência aplicáveis, (g) viabilidade de inversão do ônus da prova, apresentando síntese clara do caso com identificação de todas as possíveis violações consumeristas e solicitando validação do usuário antes de gerar o relatório final. Caso o usuário concorde com a análise, elabore relatório técnico completo incluindo fundamentação legal específica (CDC, CF/88), estratégia processual recomendada e quantificação detalhada dos danos pleiteáveis."
  },
  {
    "id": "p-100",
    "title": "Análise de Responsabilidade por Vício do Produto (CDC)",
    "category": "Direito do Consumidor",
    "type": "Análise",
    "tags": [],
    "description": "O sistema de responsabilidade por vício (arts. 18-20) difere do fato do produto (arts. 12-17) por não exigir dano além do próprio vício. A responsabilidade é objetiva e solidária entre todos da cadeia de fornecimento. O fornecedor tem 30 dias para sanar o vício; após, nasce o direito potestativo do consumidor escolher entre três alternativas. Prazos decadenciais: 30 dias (não duráveis) ou 90 dias (duráveis), contados da entrega ou da descoberta em vícios ocultos. A garantia legal é de ordem pública, inafastável por convenção.",
    "prompt": "Analise responsabilidade por vício do produto (arts. 18-20 CDC). Determine: (1) natureza do vício (qualidade/quantidade), (2) prazo decadencial aplicável (30 ou 90 dias), (3) marco inicial da contagem conforme tipo de vício, (4) aplicação do §2º do art. 26 para vícios ocultos. Verifique as três opções do consumidor (art. 18, §1º): substituição, restituição com correção, ou abatimento. Conclua indicando responsabilidade solidária da cadeia e impossibilidade de exclusão convencional da garantia legal."
  },
  {
    "id": "p-101",
    "title": "Análise de Venda Casada",
    "category": "Direito do Consumidor",
    "type": "Análise",
    "tags": [],
    "description": "A venda casada é prática abusiva que viola a liberdade de escolha do consumidor ao condicionar o fornecimento de produto ou serviço à aquisição de outro. O art. 39, I, do CDC proíbe expressamente esta conduta, protegendo a autonomia da vontade e o direito de escolha. A exceção ocorre apenas quando há justificativa técnica comprovada para a vinculação (ex: incompatibilidade técnica). A prática também viola princípios concorrenciais ao criar barreiras artificiais de mercado.",
    "prompt": "Como advogado consumerista, analise se a conduta configura venda casada (art. 39, I, CDC). Verifique: (1) se há condicionamento de venda/serviço a outro produto, (2) existência de justificativa técnica para vinculação, (3) limitação da liberdade de escolha do consumidor. Fundamente com base nos princípios da livre concorrência, boa-fé objetiva e vulnerabilidade do consumidor. Apresente parecer em três parágrafos: caracterização da prática, violação legal identificada e medidas cabíveis."
  },
  {
    "id": "p-102",
    "title": "Análise de Viabilidade de Nulidade de Empréstimo Consignado",
    "category": "Direito do Consumidor",
    "type": "Análise",
    "tags": [],
    "description": "Cole o prompt na IA, forneça os documentos do empréstimo (contrato, extratos, comprovantes) e relate os fatos (descontos indevidos, falta de autorização, etc). A IA analisará vícios contratuais, documentos faltantes, chances de êxito e sugerirá os próximos passos para a ação de nulidade.Tentar novamente",
    "prompt": "Como advogado especializado em direito do consumidor e contratos bancários, analise os documentos fornecidos relacionados ao empréstimo consignado (contrato, comprovantes de desconto, extratos, correspondências bancárias) e o contexto fático apresentado pelo cliente. Identifique possíveis vícios no contrato (ausência de assinatura, falta de comprovação da contratação, cobrança de valores indevidos, desconto não autorizado, vícios de consentimento), avalie a força probatória dos documentos disponíveis e indique quais documentos ou informações ainda são necessários para robustecer a tese (extratos bancários completos, gravações telefônicas, comprovantes de renda, histórico médico se houver alegação de incapacidade). Apresente as chances de êxito da ação anulatória com base nos elementos fáticos e probatórios disponíveis, sugira a estratégia processual mais adequada (tutela de urgência para suspensão dos descontos, inversão do ônus da prova, perícia técnica), calcule os valores envolvidos para restituição e danos morais, e recomende os próximos passos práticos (notificação extrajudicial, ajuizamento imediato ou coleta de mais documentos). Ao final, pergunte se o usuário deseja aprofundar algum ponto específico da análise ou esclarecer dúvidas sobre a estratégia sugerida."
  },
  {
    "id": "p-103",
    "title": "Checklist de Ação de Indenização por Vício do Produto ou Serviço",
    "category": "Direito do Consumidor",
    "type": "Análise",
    "tags": [],
    "description": "Estrutura a análise de casos envolvendo vícios em produtos ou serviços conforme os prazos e soluções previstas no CDC.",
    "prompt": "Auxilie na análise preliminar de vício em produto ou serviço. Etapa 1 – Solicite: (a) descrição do vício, (b) data da aquisição, (c) garantias contratuais, (d) tentativas de solução administrativa. Etapa 2 – Apresente prazos legais dos arts. 18 a 26 do CDC em tabela: 'Situação' | 'Prazo aplicável' | 'Cumprido?'. Etapa 3 – Pergunte se deseja expandir para análise das opções de solução (substituição, abatimento, restituição). Etapa 4 – Gere síntese em tópicos com direitos do consumidor e fragilidades do caso."
  },
  {
    "id": "p-104",
    "title": "Checklist para Análise de Publicidade Enganosa ou Abusiva",
    "category": "Direito do Consumidor",
    "type": "Análise",
    "tags": [],
    "description": "Auxilia na verificação de publicidade potencialmente enganosa ou abusiva conforme parâmetros do CDC.",
    "prompt": "Auxilie na análise de publicidade possivelmente enganosa ou abusiva. Etapa 1 – Solicite: (a) conteúdo da publicidade, (b) veículo, (c) período de veiculação, (d) expectativa gerada. Etapa 2 – Apresente parâmetros dos arts. 36 a 38 do CDC em checklist. Etapa 3 – Pergunte se deseja expandir para provas necessárias. Etapa 4 – Gere tabela com 2 colunas: 'Elemento da publicidade' | 'Avaliação de conformidade com o CDC'."
  },
  {
    "id": "p-105",
    "title": "Quantificação de Repetição de Indébito (CDC)",
    "category": "Direito do Consumidor",
    "type": "Análise",
    "tags": [],
    "description": "O art. 42, parágrafo único, estabelece sanção civil ao fornecedor que cobra indevidamente: devolução em dobro do valor pago em excesso. Requisitos cumulativos: (a) cobrança indevida, (b) pagamento pelo consumidor, (c) ausência de engano justificável. A natureza é punitiva-pedagógica, visando coibir cobranças abusivas. O \"engano justificável\" é exceção restrita, cabendo ao fornecedor o ônus probatório. A correção monetária preserva o valor real, enquanto juros moratórios compensam a privação do capital.",
    "prompt": "Calcule a repetição de indébito em dobro (art. 42, parágrafo único, CDC) para cobrança indevida. Analise: (1) comprovação do pagamento indevido, (2) inexistência de engano justificável do fornecedor, (3) valores cobrados vs. efetivamente devidos. Aplique correção monetária (INPC) desde cada pagamento e juros de 1% ao mês desde a citação. Apresente memória de cálculo discriminada por período e fundamente a aplicação da sanção civil do pagamento em dobro."
  },
  {
    "id": "p-106",
    "title": "Análise de Enquadramento de Vínculo Empregatício",
    "category": "Direito do Trabalho",
    "type": "Análise",
    "tags": [],
    "description": "Este prompt foi desenvolvido para auxiliar advogados trabalhistas na análise criteriosa de situações onde há controvérsia sobre a existência de vínculo empregatício, verificando a presença dos requisitos legais do art. 3º da CLT e identificando possíveis fraudes à legislação trabalhista.",
    "prompt": "Como advogado trabalhista especializado em relações de trabalho, analise a situação descrita para determinar se há configuração de vínculo empregatício conforme o art. 3º da CLT.\n\nExamine se estão presentes os requisitos essenciais:\n(1) Pessoa física\n(2) Pessoalidade (impossibilidade de substituição)\n(3) Não eventualidade/habitualidade (continuidade na prestação dos serviços)\n(4) Subordinação jurídica (recebimento de ordens, controle)\n(5) Onerosidade (pagamento pelos serviços)\n\nEstruture sua análise nos seguintes tópicos:\n\n(1) RESUMO DOS FATOS\n    - Síntese da situação apresentada\n    - Forma de contratação atual\n    - Atividades desempenhadas\n\n(2) ANÁLISE DE CADA REQUISITO LEGAL\n    Para cada requisito, indique:\n    - Se está presente ou ausente\n    - Elementos fáticos que caracterizam ou afastam\n    - Base legal (CLT, súmulas do TST)\n\n(3) ELEMENTOS CARACTERIZADORES DO VÍNCULO\n    - Liste todos os indícios que apontam para vínculo empregatício\n    - Classifique por grau de relevância (forte, médio, fraco)\n\n(4) FUNDAMENTOS JURISPRUDENCIAIS\n    - Cite súmulas do TST aplicáveis\n    - Mencione orientações jurisprudenciais relevantes\n    - Indique precedentes sobre situações similares\n\n(5) ANÁLISE DE POSSÍVEIS FRAUDES\n    - Identifique se há indícios de pejotização\n    - Verifique simulação em cooperativas de trabalho\n    - Analise fraude em estágios\n    - Outras fraudes à legislação trabalhista\n\n(6) RISCOS E RECOMENDAÇÕES\n    - Riscos jurídicos identificados\n    - Probabilidade de reconhecimento judicial do vínculo\n    - Recomendações práticas (para empresa ou trabalhador)\n\n(7) CONCLUSÃO\n    - Posicionamento objetivo: há ou não vínculo empregatício?\n    - Grau de solidez da tese (forte, razoável, fraco)\n    - Encaminhamentos sugeridos\n\nUse linguagem técnica e fundamente cada análise com base na legislação e jurisprudência atual do TST. Seja objetivo e realista na avaliação dos riscos.\n\nAguardo a descrição da situação fática para iniciar a análise de vínculo empregatício."
  },
  {
    "id": "p-107",
    "title": "Análise de Rescisão Contratual e Cálculo de Verbas",
    "category": "Direito do Trabalho",
    "type": "Análise",
    "tags": [],
    "description": "Este prompt foi desenvolvido para auxiliar advogados trabalhistas na análise detalhada de termos de rescisão contratual, verificando se todas as verbas rescisórias obrigatórias foram corretamente calculadas e pagas pelo empregador.",
    "prompt": "Como advogado trabalhista especializado em cálculos de rescisão, analise o termo de rescisão contratual fornecido. \n\nIdentifique se todas as verbas rescisórias obrigatórias foram incluídas (aviso prévio, férias proporcionais e vencidas, 13º salário, saldo de salário, FGTS e multa de 40%), calcule os valores devidos com base no salário e tempo de serviço informados, aponte eventuais irregularidades ou valores incorretos, e apresente um resumo objetivo das verbas pagas versus verbas devidas. \n\nEstruture sua análise em: \n(1) Dados do contrato (admissão, demissão, tipo de rescisão, salário base)\n(2) Verbas rescisórias pagas (conforme termo apresentado)\n(3) Verbas que deveriam ter sido pagas (cálculo correto)\n(4) Diferenças identificadas (valor por valor)\n(5) Valor total da diferença, se houver\n\nUse linguagem técnica apropriada, mas clara o suficiente para orientar o cliente. Ao final, indique se há fundamento para reclamação trabalhista e quais as principais irregularidades encontradas.\n\nAguarde que eu forneça os dados da rescisão para iniciar a análise."
  },
  {
    "id": "p-108",
    "title": "Análise de Responsabilidade por Danos no Ambiente de Trabalho",
    "category": "Direito do Trabalho",
    "type": "Análise",
    "tags": [],
    "description": "Este prompt orienta a IA a realizar análise técnica de casos envolvendo responsabilidade civil do empregador por danos causados ao trabalhador, abrangendo acidentes de trabalho, doenças ocupacionais, assédio moral/sexual e dano existencial. A ferramenta identifica a natureza da responsabilidade (objetiva ou subjetiva), analisa o nexo causal, fundamenta legalmente com base na CLT e legislação civil, avalia danos materiais e morais indenizáveis, apresenta jurisprudência aplicável e estima probabilidade de êxito. Ideal para análise preliminar de viabilidade de ações indenizatórias trabalhistas.",
    "prompt": "Atue como advogado trabalhista especializado em responsabilidade civil e indenizações por danos decorrentes de relações de trabalho, com expertise em acidentes de trabalho, doenças ocupacionais, assédio moral e dano existencial. Conduza uma análise em etapas: (1) solicite ao usuário o tipo de dano alegado (acidente de trabalho, doença ocupacional, assédio moral, assédio sexual, dano existencial, exposição a agentes nocivos ou outro), aguarde resposta; (2) peça informações sobre os fatos (descrição detalhada do evento/situação, data, local, testemunhas, consequências físicas/psicológicas, documentos médicos, medidas de segurança existentes, nexo causal); (3) após receber as informações, identifique automaticamente a natureza da responsabilidade (objetiva ou subjetiva) e os fundamentos legais aplicáveis (CLT, Constituição Federal, Código Civil); (4) apresente análise estruturada contendo: (a) caracterização do dano e sua natureza jurídica, (b) análise do nexo causal entre o trabalho e o dano, (c) identificação da responsabilidade do empregador (culpa, dolo, risco da atividade), (d) fundamentação legal específica com artigos aplicáveis, (e) danos materiais e morais passíveis de indenização, (f) precedentes jurisprudenciais relevantes dos Tribunais Superiores, (g) estimativa de valores indenizatórios baseada em jurisprudência quando possível, (h) probabilidade de êxito da ação. Aguarde validação em cada etapa e ofereça aprofundamento em aspectos específicos ao final da análise."
  },
  {
    "id": "p-109",
    "title": "Identificação de Períodos com Exposição a Agentes Nocivos",
    "category": "Direito do Trabalho",
    "type": "Análise",
    "tags": [],
    "description": "Extrai automaticamente do PPP os períodos que qualificam para tempo especial, identifica quais agentes nocivos estavam presentes e se a documentação está completa, poupando o trabalho de análise técnica linha por linha do formulário.",
    "prompt": "Como perito em segurança do trabalho e direito previdenciário, analise o PPP (Perfil Profissiográfico Previdenciário) fornecido e identifique todos os períodos com exposição habitual e permanente a agentes nocivos químicos, físicos ou biológicos previstos nos Decretos 53.831/64, 83.080/79 ou Anexo IV do Decreto 3.048/99. Para cada período identificado, informe: data inicial e final, agente nocivo presente, código do agente, intensidade/concentração registrada e se atende aos requisitos para reconhecimento de tempo especial. Sinalize se há ausência de informações técnicas obrigatórias que possam inviabilizar o reconhecimento."
  },
  {
    "id": "p-110",
    "title": "Criação de Estrutura de Reclamação Trabalhista",
    "category": "Direito do Trabalho",
    "type": "Redação",
    "tags": [],
    "description": "Copie o prompt abaixo, cole no ChatGPT e siga as 3 etapas guiadas. O sistema analisará os fatos trabalhistas, identificará os direitos violados e criará a estrutura completa da reclamação trabalhista. Simples, rápido e eficiente para organizar sua petição inicial trabalhista de forma estratégica.",
    "prompt": "Atue como advogado especializado em direito do trabalho e estruturação de reclamações trabalhistas. Preciso criar a estrutura completa da reclamação trabalhista baseada nos fatos da relação de emprego e direitos violados, organizando capítulos de forma estratégica e lógica. Execute APENAS UMA ETAPA POR VEZ e aguarde validação do usuário antes de prosseguir para a próxima etapa. Desenvolva estrutura da reclamação através de 3 etapas obrigatoriamente individuais: ETAPA 1 - solicite informações sobre a relação de emprego (dados das partes, período do contrato, função exercida, salário, jornada, forma de rescisão e principais irregularidades), em seguida faça análise completa dos fatos apresentados, identifique e apresente em lista numerada todos os direitos trabalhistas violados com respectivos fundamentos legais da CLT e legislação trabalhista aplicável, apresente análise completa e aguarde validação do usuário antes de prosseguir; ETAPA 2 - organize os pedidos trabalhistas em sequência lógica (reconhecimento do vínculo se necessário, diferenças salariais, horas extras, adicionais, verbas rescisórias, indenizações e multas), distribua pedidos por capítulos numerados baseado nos direitos identificados na etapa anterior, apresente estrutura proposta e aguarde confirmação do usuário antes de continuar; ETAPA 3 - elabore sumário detalhado da reclamação com títulos dos capítulos, ordem dos pedidos e fluxo narrativo trabalhista, indique estratégia de cada seção, apresente estrutura final completa e pergunte se deseja ajustes. IMPORTANTE: execute somente uma etapa por vez, aguarde validação expressa do usuário em cada etapa, não passe para próxima etapa sem confirmação, organize reconhecimento de vínculo antes das verbas, mantenha coerência entre pedidos trabalhistas, verifique prescrição dos direitos, numere capítulos sequencialmente, use títulos claros e objetivos para cada seção, na etapa 1 faça análise completa dos direitos violados e apresente todos os fundamentos trabalhistas possíveis para o usuário apenas validar."
  },
  {
    "id": "p-111",
    "title": "Elaboração de Acordo Trabalhista",
    "category": "Direito do Trabalho",
    "type": "Redação",
    "tags": [],
    "description": "Este prompt foi desenvolvido para auxiliar advogados trabalhistas na elaboração de minutas de acordo trabalhista, seja judicial ou extrajudicial, garantindo segurança jurídica para ambas as partes e observando os limites legais para transação em direito do trabalho.",
    "prompt": "Como advogado trabalhista experiente em negociações e acordos, elabore uma minuta de acordo trabalhista considerando os valores e condições que fornecerei.\n\nO acordo deve incluir obrigatoriamente:\n\n(1) QUALIFICAÇÃO COMPLETA DAS PARTES\n    - EMPREGADO: nome completo, nacionalidade, estado civil, profissão, RG, CPF, endereço completo\n    - EMPREGADOR: razão social, CNPJ, endereço, representante legal\n\n(2) HISTÓRICO DO CONTRATO DE TRABALHO\n    - Data de admissão\n    - Função exercida\n    - Último salário\n    - Data da rescisão/situação atual\n    - Se há processo judicial em curso (número dos autos e vara)\n\n(3) NATUREZA E OBJETO DO ACORDO\n    - Declaração de que as partes transacionam\n    - Contexto da negociação (rescisão, pendências, processo)\n\n(4) DISCRIMINAÇÃO DETALHADA DAS VERBAS\n    Especificar cada parcela do acordo com:\n    - Nome da verba (aviso prévio, férias, 13º, horas extras, etc.)\n    - Valor individual de cada verba\n    - Natureza jurídica (salarial, indenizatória, previdenciária)\n    - Incidência de INSS e IRRF (quando aplicável)\n    - Valor líquido a receber\n\n(5) FORMA E PRAZO DE PAGAMENTO\n    - Se pagamento à vista ou parcelado\n    - Número de parcelas e valores\n    - Datas de vencimento\n    - Forma de pagamento (depósito, transferência, alvará)\n    - Conta bancária para depósito\n\n(6) FGTS E CONTRIBUIÇÕES PREVIDENCIÁRIAS\n    - Recolhimento do FGTS e multa de 40% (quando aplicável)\n    - Fornecimento de guias para saque\n    - Responsabilidade por recolhimentos previdenciários\n    - Prazo para entrega de documentos\n\n(7) CLÁUSULA DE QUITAÇÃO\n    - Especificar EXATAMENTE quais verbas estão sendo quitadas\n    - Indicar o período abrangido pela quitação\n    - Se quitação é geral ou específica\n    - Ressalvar direitos não transacionáveis (se aplicável)\n\n(8) DESISTÊNCIA E RENÚNCIA (se acordo judicial)\n    - Desistência da ação com extinção do processo\n    - Renúncia ao direito de recorrer\n    - Responsabilidade por custas processuais\n\n(9) DOCUMENTAÇÃO\n    - Entrega de TRCT, guias de seguro-desemprego, CTPS\n    - Prazo para fornecimento dos documentos\n    - Chaves de acesso (e-Social, Conectividade Social)\n\n(10) MULTA POR DESCUMPRIMENTO\n    - Percentual da multa em caso de inadimplemento\n    - Atualização e juros de mora\n    - Obrigações acessórias\n\n(11) DISPOSIÇÕES FINAIS\n    - Irrevogabilidade e irretratabilidade\n    - Foro competente\n    - Data e assinaturas\n\nIMPORTANTE: \n- Use linguagem clara, técnica e juridicamente segura\n- Observe os limites legais para transação conforme Lei 13.467/2017\n- Fundamente cláusulas polêmicas em jurisprudência recente do TST\n- Especifique claramente a extensão da quitação para evitar futuras discussões\n- Garanta equilíbrio e legalidade para proteger ambas as partes\n\nAguardo as informações do acordo para elaborar a minuta completa."
  },
  {
    "id": "p-112",
    "title": "Redação de Fatos em Reclamação Trabalhista",
    "category": "Direito do Trabalho",
    "type": "Redação",
    "tags": [],
    "description": "Estruturação do capítulo fático de uma petição trabalhista",
    "prompt": "Com base nas anotações ou documentos apresentados, redija o capítulo dos fatos da inicial em ordem cronológica, abordando contratação, alterações contratuais relevantes, irregularidades (jornada, pagamentos, tratamento), circunstâncias do término e inadimplementos. Use linguagem técnica e objetiva, evitando argumentações jurídicas, mas assegurando que todos os fatos necessários aos pedidos estejam narrados."
  },
  {
    "id": "p-113",
    "title": "Criação de Questões Baseadas em Material de Aula",
    "category": "Estudante de Direito",
    "type": "Redação",
    "tags": [],
    "description": "Gerar questões de treinamento a partir de material enviado, com gabarito e explicações detalhadas.",
    "prompt": "Sou estudante universitário e preciso treinar com questões sobre o material que enviei. Crie [QUANTIDADE] questões do tipo [TIPO DE QUESTÃO] com gabarito completo e explicações detalhadas. Adapte o nível de dificuldade ao perfil universitário e baseie-se exclusivamente no conteúdo fornecido."
  },
  {
    "id": "p-114",
    "title": "Análise Cronológica de Prazos e Eventos Processuais",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Após receber a análise inicial, você pode aprofundar pontos específicos com comandos complementares como:",
    "prompt": "Como advogado processualista especializado em gestão de prazos, analise este processo judicial e construa uma linha do tempo cronológica completa. Para cada evento processual, identifique: (1) a data do ato, (2) o prazo legal aplicável com fundamento normativo, (3) se o prazo foi cumprido ou perdido, e (4) as consequências processuais. Destaque eventos críticos que geraram preclusão, identifique prazos atualmente em aberto com suas datas limites, e aponte oportunidades processuais ainda disponíveis. Apresente em formato de linha do tempo organizada cronologicamente, seguida de seções específicas para prazos em aberto e resumo executivo. Use apenas informações constantes dos autos e mantenha linguagem técnica processual."
  },
  {
    "id": "p-115",
    "title": "Análise Crítica de Sentença para Embargos de Declaração",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Fornece subsídios para identificar omissões, contradições e obscuridades em sentenças para embargos de declaração.",
    "prompt": "Atue como um advogado especialista em recursos e técnica processual para analisar a sentença fornecida e avaliar a viabilidade de embargos de declaração. Execute as seguintes etapas com validação: Etapa 1 - Leia integralmente a sentença e confirme sua compreensão dos pedidos e decisão antes de prosseguir; Etapa 2 - Identifique especificamente obscuridades, contradições, omissões e erros materiais conforme Art. 1.022 do CPC, validando a categorização de cada vício encontrado; Etapa 3 - Fundamente legalmente cada vício identificado com base no CPC e jurisprudência aplicável, confirmando a consistência da fundamentação; Etapa 4 - Organize os achados em tabela com colunas: Trecho da Sentença, Tipo de Vício, Fundamentação Legal, Análise do Vício e Sugestão de Correção, validando a completude da tabela; Etapa 5 - Avalie a viabilidade dos embargos considerando a jurisprudência e confirme se a avaliação está alinhada; Etapa 6 - Apresente recomendação final objetiva sobre a viabilidade (Alta/Média/Baixa) com estratégia específica. Utilize apenas linguagem técnica, baseie-se exclusivamente no texto da sentença, foque apenas nos vícios do Art. 1.022 do CPC, cite literalmente os trechos problemáticos e apresente o resultado final em formato estruturado com resumo da decisão, tabela de análise, avaliação de viabilidade, recomendação objetiva e próximos passos. Aguarde validação em cada etapa antes de prosseguir para a seguinte."
  },
  {
    "id": "p-116",
    "title": "Análise Hermenêutica Tridimensional Kelseniana para Subsunção Normativa",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "A metodologia kelseniana decompõe casos jurídicos em três dimensões estruturais: fática (elementos concretos do caso), normativa (hierarquia das normas aplicáveis) e axiológica (valores e princípios em tensão). Utiliza-se aplicando primeiro a subsunção do fato à norma, depois resolvendo antinomias pelos critérios hierárquico, cronológico e de especialidade, finalmente ponderando princípios constitucionais. Ideal para casos complexos com múltiplas normas incidentes e conflitos aparentes entre dispositivos legais.",
    "prompt": "Atue como hermeneuta jurídico especializado em análise tridimensional do direito com expertise na aplicação da metodologia kelseniana de subsunção normativa para decomposição estrutural de casos complexos. Etapa 1: Examine os documentos processuais fornecidos aplicando a decomposição tridimensional (dimensão fática, dimensão normativa, dimensão axiológica), identificando o suporte fático concreto, as normas jurídicas incidentes e os valores jurídicos em tensão, mapeando a pirâmide normativa aplicável desde a Constituição até atos infralegais e confirme comigo perguntando: \"Identifiquei na análise tridimensional: suporte fático [descrição dos elementos], normas incidentes [hierarquia constitucional/legal/infralegal], valores em tensão [princípios colidentes]. A subsunção preliminar indica [resultado da incidência normativa]. Esta decomposição hermenêutica está adequada?\" Etapa 2: Após confirmação, aplique a metodologia de ponderação axiológica para resolver antinomias aparentes, utilize os critérios hierárquico, cronológico e de especialidade para conflitos normativos, examine a incidência de princípios constitucionais mediante técnica de concordância prática e máxima efetividade, validando comigo: \"A análise axiológica revelou: antinomias [identificação e solução], conflitos normativos [critérios aplicados], ponderação principiológica [resultado da concordância prática]. A solução hermenêutica converge para [conclusão fundamentada]. Esta metodologia procede?\" Etapa 3: Com sua validação, elabore um relatório estruturado apresentando: matriz tridimensional (elemento fático/norma aplicável/valor subjacente/síntese interpretativa), hierarquia normativa aplicável (nível/dispositivo/incidência/eficácia), tabela de ponderação axiológica (princípio/peso/resultado/fundamentação), cronograma de subsunção (etapa/operação lógica/resultado/validação) e conclusão hermenêutica sistematizada por dimensões (adequação fática, conformidade normativa, consonância axiológica, síntese decisória)."
  },
  {
    "id": "p-117",
    "title": "Análise Procedimentalista Habermasiana de Legitimidade Democrática Processual",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "A metodologia habermasiana examina a legitimidade democrática das decisões através da racionalidade comunicativa e qualidade do discurso jurídico. Utiliza-se verificando se as pretensões de validade foram atendidas, se houve participação simétrica dos sujeitos processuais e se a ética discursiva foi observada. Aplica-se especialmente em casos que envolvem direitos fundamentais e questões constitucionais, garantindo que a decisão tenha legitimidade democrática beyond mera legalidade formal.",
    "prompt": "Atue como teórico procedimentalista especializado na metodologia habermasiana de legitimidade democrática com expertise em análise da racionalidade comunicativa e validade procedimental das decisões jurídicas. Etapa 1: Examine o processo fornecido aplicando os critérios de racionalidade comunicativa habermasiana, identificando a qualidade do discurso jurídico construído (pretensões de validade, correção normativa, veracidade subjetiva), analisando a participação democrática dos sujeitos processuais e a observância do princípio discursivo na formação da decisão e confirme comigo perguntando: \"Identifiquei na análise procedimentalista: qualidade do discurso [pretensões de validade atendidas], participação democrática [efetividade do contraditório], racionalidade comunicativa [nível de argumentação]. A legitimidade procedimental indica [grau de validade democrática]. Esta análise habermasiana está adequada?\" Etapa 2: Após confirmação, examine a efetividade do princípio discursivo na construção das teses jurídicas, verifique a observância da ética discursiva na argumentação das partes e do julgador, analise a tensão entre facticidade e validade na decisão proferida, avalie a legitimidade democrática do procedimento mediante critérios de inclusão e simetria participativa, validando comigo: \"A análise discursiva revelou: efetividade do princípio discursivo [qualidade argumentativa], observância da ética discursiva [padrões comunicativos], tensão facticidade/validade [equilíbrio], legitimidade democrática [grau de inclusão]. Esta metodologia procede?\" Etapa 3: Com sua validação, elabore um relatório estruturado apresentando: matriz de racionalidade comunicativa (pretensão/atendimento/qualidade/observações), tabela de participação democrática (sujeito/inclusão/simetria/efetividade), análise da ética discursiva (fase processual/qualidade argumentativa/correção procedimental/legitimidade), cronograma de validade procedimental (momento/ação/conformidade/impacto democrático) e síntese da legitimidade habermasiana organizada por dimensões (racionalidade comunicativa, inclusão democrática, ética discursiva, validade procedimental, legitimidade decisória)."
  },
  {
    "id": "p-118",
    "title": "Análise SWOT avançada de caso jurídico",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Estrutura estratégica de pontos fortes e fracos em qualquer processo",
    "prompt": "Como advogado especialista, realize uma análise SWOT completa de um caso judicial ou consultivo. Etapa 1: Solicite os autos principais, documentos de prova e contexto processual (fatos alegados, partes envolvidas, histórico de decisões). Etapa 2: Construa diagnóstico listando Forças (provas consistentes, precedentes favoráveis, tempo de tramitação), Fraquezas (lacunas probatórias, custo elevado, testemunhas frágeis), Oportunidades (mudanças legislativas, tendências jurisprudenciais, possibilidade de acordo) e Ameaças (teses fortes da parte contrária, prescrição, risco de improcedência). Etapa 3: Para cada elemento, sugira ações práticas (ex: reforço probatório, jurisprudência específica, negociação preventiva). Etapa 4: Elabore quadro estratégico com plano de maximização das forças/oportunidades e mitigação das fraquezas/ameaças. Aguarde validação do usuário a cada fase."
  },
  {
    "id": "p-119",
    "title": "Análise SWOT de caso jurídico",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Estrutura estratégica de pontos fortes e fracos em qualquer processo",
    "prompt": "Como advogado, realize uma análise SWOT (Forças, Fraquezas, Oportunidades, Ameaças) de um caso judicial ou consultivo. Etapa 1: Solicite os autos/documentos relevantes. Etapa 2: Classifique as Forças (provas sólidas, jurisprudência favorável), Fraquezas (lacunas probatórias, risco processual), Oportunidades (precedentes, alternativas de acordo) e Ameaças (prazo, custos, teses contrárias). Etapa 3: Elabore parecer estratégico com plano de ação para maximizar vantagens e mitigar riscos. Valide com o usuário a cada etapa."
  },
  {
    "id": "p-120",
    "title": "Análise de Acordo Judicial",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Cole o prompt na IA, anexe: proposta de acordo, petição inicial e principais provas. A IA analisará se o acordo compensa comparado às chances de vitória judicial, identificando discrepâncias e recomendando aceitar, recusar ou contrapropor com base nos fatos e provas apresentados.",
    "prompt": "Como advogado especializado em negociação e análise de acordos judiciais, examine a proposta de acordo apresentada em comparação com os fatos documentados, as provas disponíveis e os pedidos formulados na petição inicial. Analise a adequação financeira da proposta considerando a força probatória do caso, identifique eventuais discrepâncias entre o valor oferecido e os danos efetivamente demonstrados, avalie as chances reais de procedência total ou parcial dos pedidos com base no conjunto probatório, e determine se o acordo representa uma solução vantajosa ou se seria mais estratégico prosseguir com o litígio. Apresente sua análise em formato estruturado abordando: (1) correspondência entre acordo e pedidos, (2) adequação do valor às provas, (3) probabilidade de êxito na via judicial, (4) vantagens e riscos de cada opção, e (5) recomendação fundamentada sobre aceitar, recusar ou contrapropor o acordo, justificando sua posição com base nos elementos fático-probatórios disponíveis."
  },
  {
    "id": "p-121",
    "title": "Análise de Cabimento de Recurso Especial: Verificação Completa de Admissibilidade STJ",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Cole o prompt na IA e forneça acórdão recorrido, decisões anteriores e contexto do caso. A IA analisará automaticamente todos os requisitos de admissibilidade do recurso especial, apresentará percentual de viabilidade e estratégias para superação de óbices.",
    "prompt": "Atue como um advogado especialista em recursos especiais com vasta experiência no Superior Tribunal de Justiça, analisando automaticamente o cabimento e todos os requisitos de admissibilidade do recurso especial conforme art. 105, III da CF/88 e arts. 1.029-1.041 do CPC. Etapa 1: Solicite ao usuário que forneça o acórdão recorrido, decisões de instâncias anteriores, contexto do caso e questões jurídicas envolvidas, aguardando as informações antes de prosseguir. Etapa 2: Com base nos documentos fornecidos, realize automaticamente análise técnica completa verificando: (a) adequação do prequestionamento das questões federais, (b) demonstração de violação direta à lei federal ou divergência jurisprudencial válida, (c) tempestividade e regularidade formal, (d) recolhimento adequado do preparo, (e) competência do STJ para a matéria, (f) cabimento da via recursal escolhida, (g) inexistência de óbices processuais, apresentando relatório técnico estruturado com percentual de viabilidade do recurso, identificação de eventuais deficiências nos requisitos, estratégias para superação de óbices identificados e recomendações específicas para otimização das chances de admissibilidade, solicitando validação antes de finalizar e pedindo esclarecimentos adicionais apenas se elementos essenciais estiverem incompletos no material fornecido."
  },
  {
    "id": "p-122",
    "title": "Análise de Cabimento de Recurso Extraordinário: Verificação Completa de Admissibilidade STF",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Cole o prompt na IA e forneça acórdão recorrido, contexto constitucional e questões envolvidas. A IA analisará automaticamente todos os requisitos do recurso extraordinário, incluindo repercussão geral, e apresentará viabilidade e estratégias específicas.",
    "prompt": "Atue como um advogado especialista em recursos extraordinários com vasta experiência no Supremo Tribunal Federal, analisando automaticamente o cabimento e todos os requisitos de admissibilidade do recurso extraordinário conforme art. 102, III da CF/88 e arts. 1.029-1.041 do CPC. Etapa 1: Solicite ao usuário que forneça o acórdão recorrido, decisões de instâncias anteriores, contexto constitucional do caso e questões constitucionais envolvidas, aguardando as informações antes de prosseguir. Etapa 2: Com base nos documentos fornecidos, realize automaticamente análise técnica completa verificando: (a) adequação do prequestionamento das questões constitucionais, (b) demonstração de violação direta à Constituição Federal, contrariedade a súmula ou jurisprudência dominante do STF, (c) presença de repercussão geral da questão constitucional conforme art. 1.035 do CPC, (d) tempestividade e regularidade formal, (e) recolhimento adequado do preparo, (f) competência do STF para a matéria constitucional, (g) inexistência de óbices processuais, (h) adequação da tese constitucional aos precedentes do STF, apresentando relatório técnico estruturado com percentual de viabilidade do recurso, análise específica da repercussão geral, identificação de eventuais deficiências nos requisitos constitucionais, estratégias para superação de óbices identificados e recomendações específicas para otimização das chances de admissibilidade no tribunal constitucional, solicitando validação antes de finalizar e pedindo esclarecimentos adicionais apenas se elementos essenciais estiverem incompletos no material fornecido."
  },
  {
    "id": "p-123",
    "title": "Análise de Caso sob a Ótica da Metodologia Dworkiana de Integridade Decisória e Coerência Sistêmica",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "A técnica dworkiana busca coerência sistêmica analisando precedentes e construindo a \"melhor teoria\" do direito aplicável através do modelo do \"juiz Hércules\". Aplica-se mapeando precedentes relevantes, testando adequação (fit) e justificativa moral-política (justification), identificando novel cases e hard cases. Útil para construir teses jurídicas sólidas em áreas com jurisprudência consolidada, garantindo decisões coerentes com a tradição jurídica e moralmente justificáveis dentro do sistema. Recomenda-se que o usuario forneça os precendetes sob o tema para o sistema antes de utilizar este prompt ou utilize em um sistema robusto de busca ativa.",
    "prompt": "Atue como teorista jurídico especializado na metodologia dworkiana de integridade decisória com expertise em análise de coerência sistêmica e construção de teses jurídicas mediante o modelo do \"juiz Hércules\". Etapa 1: Examine o conjunto processual fornecido aplicando o teste de integridade decisória, identificando precedentes relevantes na cadeia decisória, mapeando a evolução jurisprudencial do tema, analisando a coerência horizontal (decisões contemporâneas) e vertical (instâncias superiores) e confirme comigo perguntando: \"Identifiquei na análise de integridade: precedentes formadores [casos paradigmáticos], evolução jurisprudencial [linha temporal], coerência horizontal [consistência entre órgãos], coerência vertical [alinhamento hierárquico]. A cadeia decisória sugere [tendência interpretativa]. Esta análise dworkiana está correta?\" Etapa 2: Após confirmação, aplique o modelo hercúleo de tomada de decisão construindo a melhor teoria justificatória do direito aplicável, examine fit (adequação aos precedentes) e justification (melhor justificativa moral-política), identifique novel cases e hard cases na cadeia interpretativa, validando comigo: \"A metodologia hercúlea revelou: adequação aos precedentes [grau de fit], justificativa moral-política [dimensão axiológica], classificação do caso [novel/hard/easy case]. A melhor teoria interpretativa converge para [solução fundamentada]. Esta construção procede?\" Etapa 3: Com sua validação, elabore um relatório estruturado apresentando: mapeamento de precedentes (caso/ratio decidendi/holding/distinguishing), matriz de coerência sistêmica (decisão/alinhamento horizontal/alinhamento vertical/observações), tabela hercúlea de decisão (critério fit/critério justification/peso/resultado), análise de novel/hard cases (caso/complexidade/solução/fundamentação) e síntese da integridade decisória organizada por dimensões (adequação precedencial, coerência sistêmica, justificativa moral, decisão ótima)."
  },
  {
    "id": "p-124",
    "title": "Análise de Fatos e Provas em Tabela: Mapeamento Organizado do Ônus Probatório",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Prompt para auxiliar na redação de contestações e peças de defesa em geral. A ideia é obter um mapeamento do ônus probatório completo considerando o exposto no processo.",
    "prompt": "Atue como advogado especialista em direito processual civil, com foco em análise de ônus da prova e estratégia probatória. Analise sistematicamente os fatos alegados, provas disponíveis e distribuição do ônus probatório.\nEtapa 1: Solicite ao usuário que forneça o contexto do caso (petição inicial, contestação, documentos ou relato dos fatos) da forma mais conveniente. Aguarde as informações antes de prosseguir.\nEtapa 2: Com base nas informações fornecidas, extraia e analise automaticamente: área do direito e natureza da ação, fatos alegados pelas partes e sua classificação (constitutivos, modificativos, extintivos, impeditivos), provas disponíveis e sua adequação, distribuição do ônus da prova conforme art. 373 do CPC, possibilidade de inversão do ônus, provas necessárias a produzir e análise da distribuição dinâmica.\nApresente a análise em tabela com as colunas: Fato Alegado, Classificação do Fato, Parte que Alega, Prova Disponível, Adequação Probatória, Ônus da Prova, Possibilidade de Inversão, Prova Necessária, Fundamentação Legal e Observações Estratégicas. Se informações essenciais estiverem ausentes, solicite apenas os esclarecimentos necessários."
  },
  {
    "id": "p-125",
    "title": "Análise de Fatos e Provas em Tabela: Mapeamento Organizado do Ônus Probatório",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Cole o prompt na IA e forneça petição inicial, documentos e contexto do processo. A IA entregará análise completa em tabela organizada com fatos, provas, ônus probatório, possibilidades de inversão e estratégias recomendadas por item.",
    "prompt": "{\n  \"prompt\": {\n    \"papel\": \"Atue como um advogado especialista em direito processual civil e direito probatório com vasta experiência em análise de ônus da prova e estratégia probatória.\",\n    \"objetivo\": \"Analise sistematicamente os fatos alegados, provas disponíveis e distribuição do ônus probatório com base nas informações fornecidas pelo usuário.\",\n    \"etapas\": [\n      {\n        \"etapa\": 1,\n        \"acao\": \"coleta_informacoes\",\n        \"descricao\": \"Solicite ao usuário que forneça o contexto do caso (petição inicial, contestação, documentos principais ou relato dos fatos) da forma que for mais conveniente para ele.\",\n        \"instrucao\": \"aguardando as informações antes de prosseguir\"\n      },\n      {\n        \"etapa\": 2,\n        \"acao\": \"analise_automatica\",\n        \"descricao\": \"Com base nas informações fornecidas, extraia automaticamente e analise:\",\n        \"elementos_analise\": [\n          \"identificação da área do direito e natureza da ação a partir do contexto\",\n          \"mapeamento de todos os fatos alegados pelas partes\",\n          \"classificação automática dos fatos (constitutivos, modificativos, extintivos, impeditivos)\",\n          \"identificação das provas já disponíveis nos autos\",\n          \"avaliação da adequação probatória\",\n          \"distribuição do ônus da prova conforme art. 373 do CPC\",\n          \"verificação automática de possibilidade de inversão do ônus\",\n          \"identificação de provas necessárias a produzir\",\n          \"análise da distribuição dinâmica do ônus\"\n        ],\n        \"formato_saida\": {\n          \"tipo\": \"tabela_estruturada\",\n          \"colunas\": [\n            \"Fato Alegado\",\n            \"Classificação do Fato\", \n            \"Parte que Alega\",\n            \"Prova Disponível\",\n            \"Adequação Probatória\",\n            \"Ônus da Prova\",\n            \"Possibilidade de Inversão\",\n            \"Prova Necessária\",\n            \"Fundamentação Legal\",\n            \"Observações Estratégicas\"\n          ]\n        },\n        \"instrucao\": \"Se alguma informação essencial não puder ser extraída do contexto fornecido, solicite esclarecimentos específicos apenas sobre os pontos faltantes. Apresente a análise completa em formato de tabela para validação.\"\n      }\n    ]\n  }\n}"
  },
  {
    "id": "p-126",
    "title": "Análise de Julgado Citado para Identificar Distinção",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Como analista jurídico especializado em análise de precedentes, compare a razão de decidir do precedente citado com o caso concreto apresentado pelo autor/réu. Identifique: (1) o fundamento determinante da decisão paradigma; (2) as semelhanças e diferenças relevantes com o caso atual; (3) análise objetiva sobre a possibilidade de distinguishing, apontando motivos que justificam ou afastam a aplicação do precedente ao caso. Use linguagem técnica e fundamente cada conclusão, ao final pergunte se o usuário deseja aprofundar algum aspecto específico.",
    "prompt": "Comparação de precedentes para verificar distinção (distinguishing)."
  },
  {
    "id": "p-127",
    "title": "Análise de Riscos e Prognóstico Processual",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Avalia probabilidade de êxito recursal com percentual fundamentado, identifica pontos fortes e fragilidades, projeta cenários (melhor/provável/pior caso), estima tempo e custos totais, analisa custo-benefício, cita jurisprudência relevante e recomenda estratégia (recorrer/acordar/aceitar) com análise equilibrada de riscos e oportunidades para decisão informada.",
    "prompt": "Como advogado especialista em análise estratégica processual e gestão de riscos jurídicos, avalie este processo judicial após a decisão proferida e elabore análise técnica que: (1) quantifique a probabilidade de êxito em eventual recurso classificando como alta/média/baixa com percentual estimado e fundamentação; (2) identifique os 3 principais pontos fortes e as 3 principais fragilidades da tese recursal; (3) projete três cenários possíveis (melhor caso, caso provável, pior caso) com suas probabilidades; (4) estime tempo de tramitação em cada instância e custos processuais totais (custas, honorários, depósitos); (5) realize análise custo-benefício comparando valor em disputa versus investimento necessário; (6) cite ao menos 2 precedentes jurisprudenciais relevantes; e (7) apresente recomendação estratégica clara e fundamentada sobre recorrer, buscar acordo ou aceitar a decisão. Estruture em: Resumo Executivo com recomendação direta, Análise de Viabilidade (percentual e fundamentação), Pontos Fortes vs Fragilidades, Projeção de Cenários, Análise Temporal e Financeira, Jurisprudência Aplicável, e Recomendação Final Justificada. Use linguagem técnica mas acessível, seja honesto sobre incertezas e riscos, não crie falsas expectativas, fundamente estimativas em dados objetivos (jurisprudência, estatísticas, complexidade), e permita decisão informada apresentando análise equilibrada dos aspectos positivos e negativos."
  },
  {
    "id": "p-128",
    "title": "Análise de demanda através do método FIRAC com validação por etapas e pesquisa ativa",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Fluxo IRAC com checkpoints para validação: Fatos, Questão, Regras (pesquisa ativa) e Aplicação/Conclusão.",
    "prompt": "Atue como um advogado especializado em [ÁREA] e analise o caso através do método IRAC em etapas sequenciais. Primeiramente, verifique se existem dados suficientes para iniciar a análise; caso não existam, solicite-me que forneça os fatos do caso. Em seguida: 1) Identifique os FATOS relevantes organizados cronologicamente e aguarde minha validação; 2) Após minha aprovação, formule a QUESTÃO JURÍDICA central a ser resolvida; 3) Com minha confirmação, pesquise ativamente na internet e apresente as REGRAS aplicáveis, incluindo legislação vigente e jurisprudências relevantes; 4) Mediante minha aprovação final, realize a APLICAÇÃO das regras aos fatos e apresente uma CONCLUSÃO jurídica fundamentada. Ao término, organize todos os elementos em um relatório completo com os quatro capítulos do método IRAC."
  },
  {
    "id": "p-129",
    "title": "Análise de sentença",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Analise sentença judicial identificando partes, fatos, decisão, fundamentos, impactos práticos, vulnerabilidades e recomendações recursais. Linguagem técnica, estrutura numerada, baseado exclusivamente no documento.",
    "prompt": "Como assistente jurídico especializado em análise processual, examine a sentença fornecida e produza uma análise estruturada abordando: (1) identificação das partes e objeto da ação, (2) síntese dos fatos relevantes considerados pelo juiz, (3) dispositivo da decisão com o resultado para cada pedido, (4) fundamentos jurídicos centrais (legais e jurisprudenciais) que embasaram a decisão, (5) impactos práticos imediatos para as partes (obrigações, prazos, custas), (6) vulnerabilidades ou pontos críticos da fundamentação que possam fundamentar recursos, e (7) recomendações objetivas sobre cabimento e viabilidade de medidas recursais, apresentando tudo em linguagem técnica clara, com seções numeradas, evitando opiniões pessoais e baseando-se exclusivamente no conteúdo da sentença analisada."
  },
  {
    "id": "p-130",
    "title": "Assistente para Elaboração de Proposta de Acordo em Processo de Execução",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Estruturar proposta de acordo judicial em três níveis com cláusulas e estratégia de negociação.",
    "prompt": "Como advogado especializado em negociação judicial atuando segundo os interesses do [executado/exequente], elabore uma proposta de acordo completa com estratégia escalonada em três etapas de negociação para um processo judicial. Etapa 1: Solicite ao usuário as informações do processo (tipo de ação, fatos principais, pedidos, valores, fase processual) e aguarde as respostas antes de prosseguir. Etapa 2: Peça as condições e limitações do acordo (condições mínimas aceitáveis, restrições específicas, pontos não negociáveis, interesses prioritários de cada parte) e confirme o entendimento, incluindo o campo \"Proposta apresentada por: [espaço para identificação]\". Etapa 3: Com base nas informações coletadas, elabore a proposta de acordo principal em linguagem jurídica formal com todas as cláusulas essenciais e uma estratégia escalonada contendo três abordagens progressivas (conservadora, intermediária e final), cada uma com justificativas e argumentos persuasivos. Use linguagem técnica apropriada, mantenha equilíbrio entre as partes, inclua cláusulas de segurança jurídica e apresente no formato: I. Objeto do Acordo, II. Condições e Termos, III. Obrigações das Partes, IV. Prazos e Cumprimento, V. Cláusulas Finais, seguido da estratégia escalonada detalhada. Ao final, pergunte se o usuário deseja ajustar aspectos específicos da proposta ou da estratégia de negociação."
  },
  {
    "id": "p-131",
    "title": "Criador de Matriz de Riscos Processuais",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Cole o prompt no ChatGPT ou similar, forneça os documentos do processo (petição inicial, contestação, decisões), responda às validações e receba uma matriz detalhada com pontos fortes/fracos, probabilidade de êxito (%) e estratégias de mitigação organizadas por categoria, auxiliando na tomada de decisões estratégicas do litígio.",
    "prompt": "Atue como um consultor jurídico especializado em análise de riscos processuais e avaliação estratégica de litígios. Sua tarefa será criar uma matriz de riscos completa do caso, identificando pontos fortes, pontos fracos, probabilidades de êxito e estratégias de mitigação. Execute as seguintes etapas: Etapa 1 - Coleta e Análise de Documentos: Após receber o(s) documento(s) processual(is), analise cuidadosamente identificando: tipo de ação, pedidos formulados, argumentos da parte contrária, provas disponíveis, fase processual e peculiaridades do caso. Confirme perguntando: \"Analisei o(s) documento(s). Identifiquei [quantidade] elementos críticos para avaliação de risco. Deseja incluir informações adicionais sobre provas, testemunhas ou particularidades antes de elaborar a matriz?\" Aguarde a resposta. Se houver novos elementos, repita a análise incluindo-os. Etapa 2 - Elaboração da Matriz de Riscos: Após confirmação, crie uma tabela com cinco colunas: (1) Aspecto Analisado, (2) Ponto Forte/Fraco, (3) Impacto (Alto/Médio/Baixo), (4) Probabilidade de Êxito (%) e (5) Estratégia de Mitigação. Organize por categorias: questões de mérito, questões processuais, provas disponíveis e jurisprudência aplicável. Avalie cada elemento com base em jurisprudência dominante, qualidade probatória e precedentes dos tribunais. Seja realista e técnico na avaliação de probabilidades. Após apresentar, pergunte: \"A matriz está completa? Deseja (a) aprofundar a análise de algum risco específico, (b) incluir cenários alternativos de julgamento, (c) receber recomendações estratégicas detalhadas, ou (d) finalizar?\" Aguarde orientação antes de modificar ou concluir."
  },
  {
    "id": "p-132",
    "title": "Criação de Tabela Cronológica Detalhada do Contexto Fático",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Este prompt instrui a IA a extrair todos os eventos mencionados em documentos e relatos, organizando-os em uma tabela visual com cinco colunas essenciais: data, descrição do evento, partes envolvidas, fonte da informação e observações relevantes. O sistema trabalha como um organizador documental que não apenas lista fatos, mas também rastreia suas fontes probatórias e destaca conexões importantes, criando uma linha do tempo visual que facilita a compreensão da sequência de acontecimentos e serve como ferramenta de consulta rápida durante toda a condução do caso.",
    "prompt": "Como assistente jurídico especializado em organização processual e análise documental, examine minuciosamente todos os documentos, relatos e informações fornecidas sobre o caso e elabore uma tabela cronológica completa e detalhada dos fatos. Organize os eventos em ordem temporal rigorosa, criando uma tabela com as seguintes colunas: (1) DATA - em formato DD/MM/AAAA, utilizando \"Data não especificada\" ou estimativas aproximadas quando a informação exata não estiver disponível; (2) EVENTO - descrição objetiva e concisa do acontecimento, utilizando linguagem técnica apropriada; (3) PARTES ENVOLVIDAS - identificação de quem participou ou foi afetado pelo evento; (4) FONTE DA INFORMAÇÃO - indicação do documento, relato ou prova que comprova ou menciona o fato (ex: \"Contrato anexo\", \"Relato do cliente\", \"E-mail de 15/03/2024\"); (5) OBSERVAÇÕES RELEVANTES - detalhes adicionais importantes, nexos causais, consequências ou elementos probatórios relacionados. Garanta que todos os eventos mencionados nos documentos e relatos sejam incluídos, mesmo aqueles aparentemente secundários, pois podem revelar-se importantes posteriormente. Quando houver dúvidas sobre datas ou sequência de eventos, sinalize com marcação específica (ex: asterisco) e inclua nota explicativa ao final da tabela. Após apresentar a tabela completa, pergunte se o usuário deseja: (a) adicionar eventos não documentados mas relevantes ao contexto, (b) expandir a descrição de algum evento específico, (c) reorganizar agrupando eventos por temas além da ordem cronológica, ou (d) destacar visualmente eventos críticos para o caso."
  },
  {
    "id": "p-133",
    "title": "Diagnóstico Inicial de Viabilidade de Recurso Especial",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Insira o prompt com os documentos processuais disponíveis. A IA verificará a documentação, analisará requisitos de admissibilidade e emitirá parecer técnico sobre viabilidade. Use como filtro inicial para decidir se vale investir na elaboração do recurso. Responde em 3 etapas validadas sequencialmente.",
    "prompt": "Atue como advogado especialista em admissibilidade de recursos especiais no STJ. Execute diagnóstico de viabilidade em três etapas sequenciais: ETAPA 1 - DOCUMENTAÇÃO: Verifique se foram fornecidos: (1) acórdão recorrido completo; (2) acórdão dos embargos declaratórios, se houver; (3) certidão de publicação; (4) petição inicial e contestação. Se faltar algum documento, solicite especificamente antes de prosseguir: 'Para análise de viabilidade, forneça: [documentos faltantes]'. ETAPA 2 - REQUISITOS DE ADMISSIBILIDADE: Com os documentos completos, examine: (a) se a matéria é exclusivamente de direito federal; (b) prequestionamento explícito ou ficto dos dispositivos legais; (c) se não demanda reexame fático (Súmula 7/STJ); (d) tempestividade - 15 dias úteis da publicação; (e) não incidência das Súmulas impeditivas 5, 182, 211, 282, 283, 284 e 320 do STJ; (f) existência de sucumbência. ETAPA 3 - PARECER: Apresente diagnóstico fundamentado: VIÁVEL (todos requisitos atendidos) | VIÁVEL COM RESSALVAS (indicar embargos prequestionadores ou correções necessárias) | INVIÁVEL (apontar óbices intransponíveis). Cite os pontos do acórdão e precedentes do STJ que fundamentam a conclusão. Se viável, pergunte: 'Prosseguir para mapeamento das teses recursais?"
  },
  {
    "id": "p-134",
    "title": "Diagnóstico jurídico via 5W2H",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Ferramenta estruturada para mapear demandas e soluções jurídicas",
    "prompt": "Atue como advogado e aplique a metodologia 5W2H (What, Why, Where, When, Who, How, How much) para estruturar um caso. Etapa 1: Solicite os fatos/documentos. Etapa 2: Preencha: O que é a demanda? Por que existe? Onde ocorre? Quando aconteceu? Quem está envolvido? Como será conduzido? Quanto custa ou impacta? Etapa 3: Elabore diagnóstico estratégico com recomendações objetivas. Valide cada etapa antes de seguir."
  },
  {
    "id": "p-135",
    "title": "Diagnóstico jurídico via 5W2H expandido",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Ferramenta estruturada para mapear demandas e soluções jurídicas",
    "prompt": "Atue como advogado e aplique a metodologia 5W2H em profundidade. Etapa 1: Solicite os documentos principais e resumo dos fatos. Etapa 2: Preencha detalhadamente cada dimensão: (i) What – Qual é a demanda e seus pedidos? (ii) Why – Por que a demanda existe (causas jurídicas e fáticas)? (iii) Where – Onde tramita ou se aplica (foro, tribunal, órgão)? (iv) When – Quando ocorreram os fatos relevantes e prazos em curso? (v) Who – Quem são as partes, testemunhas e interessados? (vi) How – Como será conduzida a prova e defesa? (vii) How much – Quanto custará (custas, honorários, impacto financeiro)? Etapa 3: Elabore diagnóstico estratégico destacando gargalos, oportunidades de êxito e plano de ação. Etapa 4: Valide com o usuário e ajuste conforme feedback."
  },
  {
    "id": "p-136",
    "title": "Gerador de Checklist de Documentos e Provas",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Cole o prompt, forneça a petição ou contestação, responda às validações e receba checklist organizado por relevância, urgência, prazo de juntada e fundamentação legal de cada prova, garantindo estratégia probatória completa sem esquecimentos.",
    "prompt": "Atue como um assistente jurídico especializado em estratégia probatória e organização de documentação processual. Sua tarefa será criar um checklist completo de documentos e provas necessários ao caso, organizado por relevância, urgência e fundamentação legal. Execute as seguintes etapas: Etapa 1 - Análise da Causa de Pedir e Pedidos: Após receber o(s) documento(s) processual(is), analise cuidadosamente identificando a causa de pedir, todos os pedidos formulados, fatos que necessitam comprovação e teses jurídicas que exigem suporte probatório. Confirme perguntando: \"Analisei o(s) documento(s). Identifiquei [quantidade] fatos/teses que necessitam de prova documental ou pericial. Deseja incluir informações adicionais sobre provas já disponíveis ou particularidades probatórias antes de elaborar o checklist?\" Aguarde a resposta. Se houver novos elementos, incorpore-os à análise. Etapa 2 - Elaboração do Checklist: Após confirmação, crie uma tabela com seis colunas: (1) Documento/Prova, (2) Finalidade Probatória, (3) Relevância (Essencial/Importante/Complementar), (4) Urgência (Imediata/Média/Baixa), (5) Prazo para Juntada e (6) Fundamentação Legal (artigo do CPC que autoriza/exige). Organize as provas por categorias: documentos essenciais, provas testemunhais, perícias técnicas, provas emprestadas e outras. Indique claramente quais documentos são indispensáveis ao êxito da demanda e quais são complementares. Após apresentar, pergunte: \"O checklist está completo? Deseja (a) incluir orientações sobre como obter documentos específicos, (b) sugestões de requerimentos probatórios para a petição, (c) análise de provas alternativas caso algum documento seja inacessível, ou (d) finalizar?\" Aguarde orientação antes de modificar ou concluir."
  },
  {
    "id": "p-137",
    "title": "Gerador de Cronograma de Prazos Processuais",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Cole o prompt no ChatGPT ou similar, forneça os documentos processuais (petição, intimações, decisões), responda às validações do assistente e receba uma tabela cronológica completa com prazos, status e criticidade. Você pode refinar, incluir cenários futuros ou solicitar estratégias temporais para otimizar a gestão do processo.",
    "prompt": "Atue como um assistente jurídico especializado em gestão de prazos processuais. Sua tarefa será criar um cronograma estratégico completo de prazos (passados e futuros) com alertas de preclusão e sugestões temporais. Execute as seguintes etapas: Etapa 1 - Análise de Documentos: Após receber o(s) documento(s) processual(is), analise identificando fase processual, datas de intimações, prazos em curso e já preclusos. Confirme perguntando: \"Analisei o(s) documento(s). Identifiquei [quantidade] marcos temporais relevantes. Deseja incluir informações adicionais antes de elaborar o cronograma?\" Aguarde a resposta. Se houver novos documentos, repita a análise. Etapa 2 - Elaboração do Cronograma: Após confirmação, crie uma tabela com quatro colunas: (1) Data/Prazo, (2) Evento Processual, (3) Status (Realizado/Pendente/Precluso) e (4) Criticidade (Alta/Média/Baixa). Organize cronologicamente, destaque prazos críticos, calcule dias úteis conforme CPC, inclua audiências e recursos cabíveis, e identifique janelas estratégicas. Após apresentar, pergunte: \"O cronograma está completo? Deseja (a) acrescentar detalhes a algum prazo, (b) incluir análise de cenários recursais futuros, (c) receber sugestões de estratégia temporal, ou (d) finalizar?\" Aguarde orientação antes de modificar ou finalizar.Tentar novamenteLB"
  },
  {
    "id": "p-138",
    "title": "Gestão processual com Matriz de Eisenhower detalhada",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Priorização de medidas jurídicas por urgência e importância",
    "prompt": "Atue como consultor jurídico e aplique a Matriz de Eisenhower de forma estruturada. Etapa 1: Solicite a lista completa de tarefas ou medidas (protocolos, recursos, diligências, prazos, perícias). Etapa 2: Classifique cada medida conforme: (i) Urgente/Importante (ex: prazo fatal), (ii) Urgente/Não Importante (tarefas delegáveis), (iii) Não Urgente/Importante (estratégias de médio prazo), (iv) Não Urgente/Não Importante (atividades dispensáveis). Etapa 3: Para cada categoria, sugira responsável, prazo de execução, riscos de adiamento e impacto esperado. Etapa 4: Produza cronograma estratégico priorizando medidas críticas. Etapa 5: Valide se o usuário deseja ajustes no plano antes de consolidar a versão final."
  },
  {
    "id": "p-139",
    "title": "Identificação de Divergência Jurisprudencial para Redação de Recurso Especial",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Forneça o acórdão recorrido. A IA extrairá automaticamente as teses jurídicas e perguntará sobre paradigmas divergentes. Você pode fornecer julgados que conhece ou pedir orientação. A ferramenta validará se configuram verdadeiro dissídio e criará o confronto analítico exigido pelo STJ.",
    "prompt": "Como especialista em dissídio jurisprudencial para recursos especiais, analise o acórdão recorrido para identificar teses jurídicas passíveis de demonstração de divergência com outros tribunais, seguindo este protocolo: primeiro extraia do acórdão as principais teses jurídicas de direito federal decididas, apresentando-as em formato sintético (exemplo: 'é dispensável prova do prejuízo em caso de X' ou 'prazo prescricional para Y é quinquenal'); para cada tese identificada, indique (1) trecho exato do acórdão onde foi firmada com página, (2) questão jurídica central em termos abstratos, (3) dispositivos legais interpretados; apresente as teses ao usuário perguntando: 'Identifiquei as teses jurídicas acima no acórdão recorrido. Para quais delas você possui ou conhece julgados divergentes de outros Tribunais ou do próprio STJ?'; após resposta do usuário indicando paradigmas ou solicitando ajuda para encontrá-los, oriente sobre os requisitos formais: paradigmas devem ser de tribunal diverso ou turma diferente do STJ, ter similitude fática essencial, decidir a mesma questão jurídica com solução oposta, estar disponível na íntegra; para cada paradigma fornecido ou localizado, crie quadro comparativo com TRIBUNAL/TURMA | DATA DO JULGAMENTO | FATOS SIMILARES (demonstrar analogia) | TESE DO RECORRIDO | TESE DO PARADIGMA | DISPOSITIVO LEGAL INTERPRETADO | DIVERGÊNCIA CONFIGURADA (sim/não); ao final, classifique a força do dissídio como FORTE (divergência clara e atual), MÉDIO (divergência parcial ou antiga) ou FRACO (similitude fática questionável), perguntando: 'Deseja buscar paradigmas adicionais ou prosseguir com a estruturação do recurso?"
  },
  {
    "id": "p-140",
    "title": "Mapeamento de Violações Legais para Recurso Especial",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Forneça apenas o acórdão, petição inicial e contestação e demais documentos de destaque, tais como contratos e etc se houver. A IA identificará automaticamente possíveis violações legais, criará análise técnica de cada uma e apresentará para validação. Você revisa a lista e pode adicionar dispositivos não detectados. Elimina trabalho manual de mapeamento inicial.",
    "prompt": "Como advogado especializado em recursos especiais ao STJ, analise autonomamente o acórdão recorrido e documentos fornecidos para identificar todas as possíveis violações a dispositivos de lei federal, executando o seguinte protocolo: examine o acórdão comparando com a petição inicial e contestação para identificar onde o tribunal (1) negou aplicação a dispositivo legal aplicável ao caso, (2) interpretou lei federal de forma manifestamente contrária ao texto legal, (3) aplicou indevidamente dispositivo não incidente na hipótese; para cada violação identificada, crie ficha técnica contendo DISPOSITIVO VIOLADO (artigo e transcrição) → COMO O TRIBUNAL DECIDIU (trecho do acórdão com página) → TIPO DE VIOLAÇÃO (negativa de vigência/má interpretação/aplicação indevida) → INTERPRETAÇÃO CORRETA (com base na literalidade da lei e precedentes STJ) → PREJUÍZO AO RECORRENTE (consequência prática da violação) → PRECEDENTES (pesquise 3 julgados recentes do STJ sobre o tema) → FORÇA DO ARGUMENTO (FORTE se violação direta, MÉDIA se interpretação controvertida, FRACA se tese inovadora); organize as violações identificadas em ordem de probabilidade de êxito, apresente lista completa ao usuário e pergunte: 'Identifiquei as violações acima. Deseja incluir algum dispositivo adicional não mapeado, excluir algum dos identificados, ou prosseguir com esta análise para desenvolver as teses?"
  },
  {
    "id": "p-141",
    "title": "Matriz GUT em demandas jurídicas complexas",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Priorização robusta de problemas jurídicos",
    "prompt": "Como advogado, utilize a Matriz GUT (Gravidade, Urgência, Tendência) para organizar pendências jurídicas complexas. Etapa 1: Solicite a lista de problemas ou riscos (ex: prazo iminente, perícia pendente, contestação frágil). Etapa 2: Para cada item, atribua notas de 1 a 5 em Gravidade (impacto do problema), Urgência (tempo de resposta necessário) e Tendência (chance de agravamento). Etapa 3: Multiplique GxUxT e organize os itens em ranking de prioridade. Etapa 4: Elabore relatório com plano de ação priorizado, sugerindo medidas concretas (ex: protocolo imediato, diligência complementar, negociação). Etapa 5: Valide com o usuário se deseja rever notas ou estratégias antes de consolidar o resultado."
  },
  {
    "id": "p-142",
    "title": "Matriz GUT em processos judiciais",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Ordena prioridades com base em Gravidade, Urgência e Tendência",
    "prompt": "Como advogado, utilize a Matriz GUT (Gravidade, Urgência, Tendência) para organizar problemas e pendências em uma demanda. Etapa 1: Solicite lista de pendências ou riscos. Etapa 2: Atribua notas de 1 a 5 para Gravidade, Urgência e Tendência. Etapa 3: Calcule GxUxT e classifique os pontos em ordem de prioridade. Etapa 4: Produza relatório com plano de ação priorizado. Sempre valide antes de avançar."
  },
  {
    "id": "p-143",
    "title": "Matriz de Eisenhower para gestão processual",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Priorização de medidas jurídicas por urgência e importância",
    "prompt": "Atue como consultor jurídico e aplique a Matriz de Eisenhower às medidas cabíveis em um processo ou consultoria. Etapa 1: Solicite lista de tarefas ou medidas pendentes. Etapa 2: Classifique-as em Urgente/Importante, Urgente/Não Importante, Não Urgente/Importante, Não Urgente/Não Importante. Etapa 3: Produza um plano de priorização com cronograma sugerido. Valide antes de concluir."
  },
  {
    "id": "p-144",
    "title": "Matriz de Riscos aplicada a litígios",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Estrutura de riscos em processos complexos",
    "prompt": "Como advogado, conduza análise baseada em Matriz de Riscos para um litígio. Etapa 1: Solicite autos, provas e informações do caso. Etapa 2: Identifique os principais riscos (processuais, probatórios, financeiros, reputacionais). Etapa 3: Classifique cada risco por probabilidade e impacto. Etapa 4: Elabore relatório indicando medidas de mitigação (provas, acordos, precedentes). Valide etapa a etapa com o usuário."
  },
  {
    "id": "p-145",
    "title": "Matriz de Riscos jurídica avançada",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Estrutura completa de riscos em litígios complexos",
    "prompt": "Como advogado, conduza análise baseada em Matriz de Riscos para litígios de alta complexidade. Etapa 1: Solicite autos, provas e informações adicionais (valores envolvidos, partes interessadas, impacto reputacional). Etapa 2: Identifique riscos processuais (prescrição, indeferimento de provas, improcedência), probatórios (falta de documentos, fragilidade de testemunhas), financeiros (custas, honorários, condenações) e institucionais (impacto em compliance, reputação). Etapa 3: Classifique cada risco em probabilidade (baixa, média, alta) e impacto (baixo, médio, alto). Etapa 4: Gere matriz cruzando variáveis e destaque os riscos críticos. Etapa 5: Sugira estratégias de mitigação personalizadas (ex: reforço documental, perícia antecipada, acordo estratégico, comunicação institucional). Aguarde validação a cada passo antes de avançar."
  },
  {
    "id": "p-146",
    "title": "Revisão Final de Recurso Especial Cível",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Execute como última etapa antes de protocolar. Forneça o recurso completo ou use o checklist para revisar manualmente. A IA fará auditoria sistemática identificando riscos de não conhecimento. Corrija itens marcados como 'CORRIGIR URGENTE' antes do protocolo. Reduz drasticamente erro formal.",
    "prompt": "Como revisor sênior especializado em recursos especiais ao STJ, execute auditoria completa do recurso antes do protocolo: primeiro solicite ao usuário que forneça o recurso completo ou confirme ter em mãos todos os capítulos para verificação própria - caso não forneça, oriente: 'Para revisão eficaz, ideal seria fornecer a peça completa, mas posso criar checklist detalhado para sua própria conferência'; execute verificação sistemática em cinco dimensões: ASPECTOS FORMAIS conferindo (1) endereçamento correto 'Excelentíssimo Senhor Ministro Presidente do [Tribunal]', (2) qualificação completa das partes com CPF/CNPJ, (3) número correto do processo originário, (4) numeração sequencial de páginas e parágrafos, (5) valor da causa atualizado; REQUISITOS DE ADMISSIBILIDADE verificando (1) demonstração expressa do cabimento constitucional, (2) comprovação de tempestividade com datas, (3) prequestionamento com indicação de páginas do acórdão para cada dispositivo, (4) afastamento expresso da Súmula 7/STJ, (5) demonstração de inaplicabilidade das súmulas impeditivas; CONSISTÊNCIA DO MÉRITO analisando (1) cada violação legal com dispositivo transcrito, (2) paradigmas com dados completos se houver dissídio, (3) confronto analítico parágrafo a parágrafo na divergência, (4) coerência entre teses e pedidos; DOCUMENTAÇÃO OBRIGATÓRIA listando (1) procuração com poderes específicos, (2) acórdão recorrido completo, (3) certidão de publicação/intimação, (4) comprovante de preparo ou isenção, (5) acórdãos paradigmas na íntegra se houver dissídio; ASPECTOS DE LINGUAGEM revisando (1) uso de linguagem técnica sem excessos, (2) ausência de argumentos sobre matéria fática, (3) clareza e objetividade, (4) respeito ao limite de páginas se houver; apresente resultado como relatório de conformidade indicando 'CONFORME', 'REVISAR' ou 'CORRIGIR URGENTE' para cada item, com observações específicas; finalize perguntando: 'Identificou algum ponto crítico que necessite correção imediata antes do protocolo?"
  },
  {
    "id": "p-147",
    "title": "Verificação de Prequestionamento em Recurso Especial",
    "category": "Geral",
    "type": "Análise",
    "tags": [],
    "description": "Utilize esse prompt após confirmar viabilidade geral do recurso. Forneça o acórdão e liste todos os artigos que pretende alegar violados. A IA criará mapa visual do status de prequestionamento de cada dispositivo, indicando se precisa opor embargos antes do especial ou reformular estratégia. Essencial para evitar não conhecimento.",
    "prompt": "Como especialista em recursos especiais ao STJ, realize análise detalhada do prequestionamento dos dispositivos legais que o usuário pretende alegar violados, seguindo este protocolo: primeiro solicite ao usuário a lista completa dos artigos de lei federal que pretende invocar no recurso especial; após receber, examine no acórdão recorrido cada dispositivo verificando se (1) foi expressamente mencionado e debatido no voto condutor, (2) constou apenas da ementa ou relatório sem análise no mérito, (3) foi objeto de embargos de declaração para suprir omissão, (4) houve prequestionamento ficto com oposição de embargos rejeitados por omissão; crie tabela analítica com cinco colunas: DISPOSITIVO LEGAL | MENÇÃO NO ACÓRDÃO (com indicação de página) | ANÁLISE EFETIVA (sim/não) | STATUS (prequestionado/não prequestionado/prequestionamento ficto) | PROVIDÊNCIA NECESSÁRIA (nenhuma/opor embargos/impossível prosseguir); destaque em vermelho dispositivos sem prequestionamento que inviabilizam a tese, em amarelo os que necessitam embargos declaratórios, em verde os adequadamente prequestionados; ao final, emita parecer objetivo: 'PREQUESTIONAMENTO ADEQUADO - prosseguir com recurso' ou 'NECESSÁRIO OPOR EMBARGOS PREQUESTIONADORES para os dispositivos X, Y, Z' ou 'PREQUESTIONAMENTO INSUFICIENTE - reformular estratégia recursal', sempre fundamentando com citação de precedentes do STJ sobre prequestionamento."
  },
  {
    "id": "p-148",
    "title": "Assistente de Audiência",
    "category": "Geral",
    "type": "Assistente",
    "tags": [],
    "description": "Esse prompt serve para preparar e conduzir audiências judiciais com precisão. Basta inseri-lo no assistente de IA, adicionar os documentos do processo e solicitar análises, identificação de pontos controvertidos, roteiro de sustentação, simulação de perguntas e apoio em tempo real, sempre baseado exclusivamente nos autos.",
    "prompt": "Papel: Atue como um advogado experiente especializado em audiências judiciais, com 15 anos de experiência em sustentação oral e análise processual estratégica.\n\nContexto: Você auxiliará na preparação e condução de audiência judicial. Terá acesso aos documentos processuais completos para fornecer suporte estratégico durante todas as fases da audiência.\nTarefa: Fique atento as solicitações do usuário, você deverá, quando solicitado analisar os autos processuais e fornecer suporte estratégico completo para preparação e condução de audiência, incluindo identificação de pontos controvertidos, elaboração de argumentos e suporte em tempo real.\n\nInstruções:\n- Identifique automaticamente pontos controvertidos e argumentos das partes\n- Elabore roteiro estruturado de sustentação oral (máximo 10 minutos)\n- Prepare contra-argumentos e simule possíveis questionamentos judiciais\n- Responda consultas rápidas durante a audiência de forma concisa\n- Baseie todas as análises exclusivamente nos documentos fornecidos\n\nRequisitos:\n- Use apenas informações dos documentos processuais fornecidos\n- Cite fundamentos legais específicos e jurisprudência relevante\n- Mantenha linguagem técnica apropriada para ambiente judicial\n- Estruture respostas em tópicos claros e objetivos\n- Priorize argumentos com maior força persuasiva\n\nRestrições:\n- Não invente fatos não constantes dos autos\n- Limite respostas durante audiência a máximo 200 palavras\n- Evite argumentos meramente protelatórios\n- Não inclua informações confidenciais desnecessárias"
  },
  {
    "id": "p-149",
    "title": "Assistente de Conciliação/MEDIAÇÃO (Interesses Subjacentes)",
    "category": "Geral",
    "type": "Assistente",
    "tags": [],
    "description": "Auxílio na elaboração de relatórios de conciliação e mediação, destacando pontos de convergência e interesses comuns.",
    "prompt": "Atue como conciliador judicial e conduza relatório em etapas: (1) Solicite dados do usuário sobre objetivos de cada parte e pontos de divergência; (2) Elabore relatório com resumo do conflito, identificação de convergências e interesses comuns; (3) Apresente 2-3 propostas concretas de acordo, explicando benefícios mútuos e concessões necessárias. Mantenha imparcialidade e use linguagem clara."
  },
  {
    "id": "p-150",
    "title": "Assistente de Criação de Tabela Cronológica de Fatos",
    "category": "Geral",
    "type": "Assistente",
    "tags": [],
    "description": "Gera uma tabela cronológica (Data/Período × Acontecimento) a partir do relato, com linguagem objetiva.",
    "prompt": "Atue como um assistente jurídico especializado em análise processual e organização de cronologias. Sua tarefa será criar uma linha do tempo precisa e contextualizada dos fatos processuais. Execute as seguintes etapas: Etapa 1 - Coleta de Documentos: Após receber o(s) documento(s) processual(is), analise cuidadosamente seu conteúdo identificando datas, eventos e partes envolvidas. Em seguida, confirme seu entendimento perguntando: \"Analisei o(s) documento(s) fornecido(s). Identifiquei [quantidade] eventos relevantes. Deseja incluir documentos adicionais antes de prosseguir para a elaboração da cronologia?\" Aguarde a resposta antes de avançar. Se o usuário fornecer mais documentos, repita esta análise incluindo os novos elementos. Etapa 2 - Elaboração da Cronologia: Após a confirmação de que todos os documentos foram fornecidos, crie uma tabela com três colunas: (1) Data/Período, (2) Acontecimento e (3) Documento de Referência. Organize os eventos em ordem cronológica crescente, utilize linguagem objetiva e técnica apropriada ao contexto jurídico, inclua apenas fatos explicitamente mencionados nos documentos, e faça referência específica ao documento fonte de cada informação (ex: \"Petição Inicial, fl. 03\" ou \"Contestação, parágrafo 2º\"). Após apresentar a tabela, pergunte: \"A cronologia está completa e precisa? Deseja (a) acrescentar informações adicionais a algum evento específico, (b) incluir novos documentos que possam complementar a linha do tempo, ou (c) finalizar a análise?\" Aguarde orientação antes de proceder com qualquer modificação ou finalização."
  },
  {
    "id": "p-151",
    "title": "Análise Comparativa de Petição Inicial e Contestação para Identificação de Fatos Controvertidos",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Comparar inicial e contestação para identificar fatos controvertidos e ônus da prova.",
    "prompt": "Como assistente jurídico, identifique os fatos controvertidos neste processo, comparando a petição inicial e a contestação. Antes de iniciar, verifique se a petição inicial e a contestação completas estão disponíveis para análise. Se não estiverem, solicite esses documentos. Após confirmar o acesso aos documentos, crie uma tabela com três colunas: 1. Fato alegado na inicial; 2. Posição da contestação sobre o fato; 3. Status (incontroverso/controvertido). Quanto aos fatos não especificamente impugnados pelo réu, indique na coluna \"Status\" como \"Incontroverso por ausência de impugnação específica (art. 341, CPC)\" e na coluna \"Posição da contestação\" indique \"Não impugnado especificamente\". Liste os fatos relevantes para a causa de pedir e organize-os em ordem de importância para a solução da lide. Para cada fato controvertido, indique brevemente qual parte tem o ônus da prova, conforme art. 373 do CPC."
  },
  {
    "id": "p-152",
    "title": "Análise Jurídica - Base Legal",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Produz capítulo jurídico com fundamentação legal detalhada.",
    "prompt": "Como advogado que atua na área [...] e tem experiência em redação de pareceres, auxilie na redação de capítulo que discuta a base legal. Pergunte: (1) qual legislação principal fundamenta a análise, incluindo artigo e teor; (2) quais outras leis são relevantes. Redija texto formal em parágrafos conectados abordando: (1) fundamentação legal principal, (2) análise de legislações complementares, (3) discussão de dispositivos não aplicáveis, (4) conclusão técnica. Texto corrido, sem tópicos, com conexões claras entre dispositivos."
  },
  {
    "id": "p-153",
    "title": "Análise de Acórdão - Estrutura Completa",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Fornece análise detalhada de acórdão para compreender decisão judicial.",
    "prompt": "Atue como assessor jurídico, analise o acórdão fornecido organizando relatório com: histórico processual, teses jurídicas, razões de decidir, conclusão e referências jurídicas. Inclua dispositivos legais aplicados e jurisprudência referenciada. Linguagem técnica e precisa, destacando pontos mais relevantes para a compreensão da decisão."
  },
  {
    "id": "p-154",
    "title": "Análise de Contestação e Sentença para Apelação",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Examina contestação e sentença para verificar fundamentos desfavoráveis ao réu e recomendar recurso ou não com base em custos e riscos.",
    "prompt": "Como advogado especializado em recursos, analise a contestação, a sentença e as demais peças processuais indicadas, apresentando um relatório objetivo sobre a necessidade e viabilidade de apelação. Compare as teses defensivas da contestação e as provas dos autos com o resultado da sentença, indicando os pontos desfavoráveis ao réu, avaliando para cada um deles as chances de êxito em recurso com base nos fundamentos jurídicos e probatórios disponíveis. Conclua com uma recomendação sobre recorrer ou não de cada capítulo da sentença, incluindo análise sobre custos e riscos envolvidos. Caso a sentença tenha sido integralmente favorável à defesa, indique não haver necessidade de recurso, exceto por eventual interesse em ônus sucumbenciais."
  },
  {
    "id": "p-155",
    "title": "Análise de Contestação para facilitar a redação de Réplica à Contestação",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Mapear contra‑argumentos da contestação e sugerir respostas estruturadas para a réplica.",
    "prompt": "Como assistente jurídico especializado na redação de peças de réplica à contestação, analise a contestação apresentada pelo requerido comparando-a com nossa petição inicial. Identifique os principais contra-argumentos, sugira respostas que mantenham nossa posição original com fundamentação legal adequada, e destaque quaisquer fatos ou argumentos novos que não constavam na inicial. Apresente sua análise em formato estruturado com: (I) Resumo dos contra-argumentos, (II) Análise detalhada com sugestões de resposta e espaços para referências legais, (III) Lista de novos fatos/argumentos, e (IV) Perguntas específicas sobre pontos que necessitem esclarecimento do usuário. Mantenha linguagem técnica e objetiva, evitando suposições ou argumentos emotivos, focando apenas nos elementos jurídicos relevantes para fortalecer nossa réplica."
  },
  {
    "id": "p-156",
    "title": "Análise de Contrato com Pontos Críticos",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Examina contratos destacando riscos e sugerindo medidas práticas.",
    "prompt": "Como advogado especialista em direito civil, com experiência na análise de contratos, analise sob a perspectiva do [contratante/contratado], identificando partes, objeto, valor, prazo, obrigações, condições de pagamento, multas, rescisão e riscos. Destaque pontos críticos que possam impactar os interesses da parte e sugira medidas de proteção. Linguagem técnica, objetiva e prática."
  },
  {
    "id": "p-157",
    "title": "Análise de Petição Inicial e Sentença para Apelação",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Analisa petição inicial e sentença para avaliar a necessidade e viabilidade de recurso de apelação, apontando riscos e chances de êxito.",
    "prompt": "Como advogado especializado em recursos, analise a petição inicial, a sentença e as demais peças processuais indicadas, apresentando um relatório objetivo sobre a necessidade e viabilidade de apelação. Compare as teses e pedidos da inicial e as provas dos autos com o resultado da sentença, indicando os pontos de improcedência ou procedência parcial desfavoráveis ao autor, avaliando para cada um deles as chances de êxito em recurso com base nos fundamentos jurídicos e probatórios disponíveis. Conclua com uma recomendação sobre recorrer ou não de cada capítulo da sentença, incluindo análise sobre custos e riscos envolvidos. Caso a sentença tenha sido integralmente procedente, atendendo todos os pedidos na forma pleiteada, indique não haver necessidade de recurso."
  },
  {
    "id": "p-158",
    "title": "Análise de Sentença para Propositura de Recurso",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Examinar sentença e planejar estratégia recursal com pontos impugnáveis e fundamentos.",
    "prompt": "Como advogado especializado na análise estratégica de sentenças para ingresso de recursos judiciais, analise a sentença fornecida e elabore uma estratégia argumentativa para impugnação. Primeiro, identifique os principais fundamentos da decisão e apresente um resumo conciso. Em seguida, pergunte ao usuário quais pontos específicos deseja contestar e solicite as principais peças processuais relevantes (petição inicial, contestação e documentos). Considerando as informações fornecidas, aponte cada ponto impugnável, determine a técnica de refutação adequada (contradição com provas, erro de direito, omissão, jurisprudência contrária) e elabore um relatório estruturado contendo: fundamento da sentença a ser impugnado, argumentos que contrapõem a fundamentação da sentença, precedentes favoráveis, dispositivos legais aplicáveis e sugestão de redação. Apresente o resultado em formato organizado com síntese da sentença, análise detalhada de cada ponto contestável e estratégia recursal global, utilizando linguagem técnico-jurídica apropriada e evitando argumentos sem embasamento sólido. Não crie informações novas, observe os apontamentos do usuário."
  },
  {
    "id": "p-159",
    "title": "Capítulo 'DO DIREITO' em Petição Inicial Cível",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Cria capítulo jurídico da petição inicial com foco na seção 'DO DIREITO', estruturado em quatro parágrafos sobre fatos, fundamentos, jurisprudência e pedido.",
    "prompt": "Como um advogado especializado na redação de petições inicias cíveis, redija um capítulo da petição inicial, referente a seção DO DIREITO com o título: [...], observando os fatos, o título indicado para o capítulo e os fundamentos jurídicos específicos que devem ser abordados. O texto deve conter quatro parágrafos concisos abordando: fatos relevantes, fundamentos jurídicos legais, jurisprudência aplicável e o pedido específico. Use linguagem formal e técnica. Após a redação, pergunte se o usuário deseja aprofundar algum ponto específico."
  },
  {
    "id": "p-160",
    "title": "Capítulo 'DOS FATOS' em Petição Inicial Cível",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Transforma anotações em narrativa estruturada no capítulo 'DOS FATOS' da petição inicial, com nexo causal entre fatos e direitos pleiteados.",
    "prompt": "Como assistente jurídico especializado na redação de petições iniciais cíveis, transforme as anotações de atendimento no capítulo \"DOS FATOS\" de uma petição inicial, que tem por objetivo [indique o objetivo da ação que será movida - Exemplo: Obter uma indenização por danos materiais considerando danos provocados ao veículo do cliente que foi atingido por um ônibus]. Organize os eventos de forma cronológica e coesa em parágrafos curtos, estabelecendo nexo causal entre os fatos e direitos pleiteados. Use linguagem formal e técnica, substituindo nomes das partes por \"Requerente\" e \"Requerido\". Integre naturalmente na narrativa os argumentos que defendam os interesses do cliente, destacando provas disponíveis que reforcem cada alegação. Mantenha foco apenas em elementos relevantes à pretensão, sem menções a fundamentos jurídicos, tais como citações a dispositivos de lei. Após a redação, confirme se há necessidade de ajustes ou destaque de pontos específicos."
  },
  {
    "id": "p-161",
    "title": "Capítulo de Mérito Recursal",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Auxilia na redação de capítulos de mérito em recursos cíveis.",
    "prompt": "Atue como advogado especializado em recursos cíveis com vasta experiência em redigir apelações, para elaborar capítulos do mérito recursal a partir da análise da sentença recorrida. Pergunte ao usuário: (1) Qual trecho específico da sentença deseja recorrer? (2) Quais são as questões fáticas que fundamentam a impugnação? (3) Quais os fundamentos jurídicos legais e precedentes jurisprudenciais que embasam o recurso? Com base nas respostas, elabore um texto coeso em 5 parágrafos curtos, estruturados em síntese do trecho recorrido, desenvolvimento dos argumentos, e conclusão com pedido específico de reforma."
  },
  {
    "id": "p-162",
    "title": "Elaboração de Estratégia de Defesa Processual",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Auxilia na construção de tese defensiva sólida por meio de perguntas estratégicas e análise de fatos e documentos.",
    "prompt": "Como advogado especialista em defesas processuais, analise o relatório/fatos apresentados e faça perguntas estratégicas para construir uma tese defensiva sólida. Comece com questões preliminares (ex: \"Há problemas na documentação que comprovem a capacidade processual?\", \"Existe conexão com outras ações?\", \"O valor da causa está correto?\"). Em seguida, explore aspectos econômicos do autor (ex: \"Há sinais externos de riqueza nas redes sociais?\", \"O autor possui bens em seu nome?\", \"Qual sua profissão/renda?\") para avaliar o pedido de justiça gratuita. No mérito, questione pontos cruciais da narrativa autoral (ex: \"Existem provas que contradizem os fatos narrados?\", \"Há documentos que fortaleçam nossa versão?\", \"Conhecemos precedentes favoráveis sobre este tema?\"), sempre focando em elementos que possam enfraquecer a pretensão inicial ou fortalecer a defesa. Para cada resposta relevante, solicite documentação comprobatória quando aplicável. Ao final, sintetize os pontos fortes identificados e pergunte se há informações adicionais que possam fortalecer a tese defensiva."
  },
  {
    "id": "p-163",
    "title": "Minuta de Alegações Finais para Audiência",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Auxilia na elaboração de texto para leitura oral em alegações finais, limitado a 5 minutos, com base em peças e depoimentos.",
    "prompt": "Como assistente jurídico especializado em alegações finais, vou ajudar a criar um texto para leitura em audiência, limitado a 5 minutos. Primeiro verifique e pergunte ao usuário: 1. Você representa o autor ou réu?; 2. Forneça a inicial, contestação e outros documentos que julgar necessários; 3. Forneça uma síntese dos depoimentos colhidos em audiência. Com base nisso entenda os principais aspectos da inicial e contestação, os documentos cruciais mencionados e decisões relevantes já proferidas. Com estas informações, elabore um texto para leitura que seguirá esta estrutura: INÍCIO: Excelentíssimo Juiz, ilustre colega advogado, serventuários da justiça e demais presentes. DESENVOLVIMENTO: Desenvolvimento em parágrafos fluidos abordando: Síntese da controvérsia; Provas documentais essenciais correlacionadas com depoimentos; Fundamentos jurídicos principais; CONCLUSÃO: Conclusão objetiva: É isto que tem a manifestar. O texto será natural para leitura oral, com ritmo adequado, usando linguagem formal clara, com aproximadamente 2 páginas, focado nos pontos decisivos, com transições suaves entre os parágrafos."
  },
  {
    "id": "p-164",
    "title": "Parecer Jurídico - Relatório Estruturado",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Auxilia na redação de parecer jurídico estruturado em 5 parágrafos.",
    "prompt": "Como advogado especialista na redação de pareceres jurídicos sobre [tema], auxilie na redação do capítulo do relatório em texto corrido. Pergunte: (1) qual a controvérsia ou dúvida jurídica que motivou o parecer; (2) se existem aspectos contextuais ou jurídicos de fundo a considerar. Redija texto em 5 parágrafos: (1) apresentação da controvérsia, (2) contextualização, (3) questões jurídicas de fundo, (4) aspectos adicionais, (5) síntese das questões apresentadas. Linguagem formal e técnica."
  },
  {
    "id": "p-165",
    "title": "Pesquisa de Jurisprudência em Tribunal",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Identifica e analisa decisões recentes de tribunais sobre tema específico.",
    "prompt": "Como pesquisador jurídico especializado em jurisprudência do [INDICAR TRIBUNAL], identifique e analise as decisões mais relevantes dos últimos 5 anos sobre [DESCREVER TEMA/CASO], considerando que o caso envolve [DESCREVER FATOS PRINCIPAIS]. Apresente síntese do entendimento do tribunal, citando 3–5 precedentes com números, datas e relatores, destacando a tese predominante, fundamentos essenciais e eventual repercussão geral. Inclua links diretos para as decisões e aponte aspectos que impactem a aplicabilidade dos precedentes."
  },
  {
    "id": "p-166",
    "title": "Pesquisa e Criação de Tese Jurídica",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Analisa os fatos e desenvolve uma tese jurídica com fundamentos legais e jurisprudenciais aplicáveis ao caso concreto.",
    "prompt": "Como advogado especializado na criação de teses e pesquisa jurídica, analise os fatos ou relatório apresentados e considerando que defendemos os interesses do [posição processual] pesquise os principais fundamentos jurídicos aplicáveis ao caso e desenvolva uma tese jurídica. Apresente um parágrafo contendo a tese jurídica, indicando qual o direito violado ou pleiteado e uma breve justificativa, seguido por tópicos breves listando: 1) os principais artigos de lei aplicáveis e 2) jurisprudência relevante (súmulas e precedentes importantes), usando fontes atualizadas do direito brasileiro. Use linguagem técnica e direta, evitando argumentações extensas ou análises doutrinárias complexas."
  },
  {
    "id": "p-167",
    "title": "Redação de Capítulo de Mérito - Auxílio-Doença Previdenciário",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Guiar a redação do capítulo de mérito em ações de auxílio‑doença, com etapas e base legal.",
    "prompt": "Como advogado previdenciarista especializado em redação de petições de auxílio-doença, conduza a elaboração de um capítulo de mérito através das seguintes etapas estruturadas. Etapa 1: Solicite ao usuário o contexto geral do caso (dados do segurado, histórico laboral, quando surgiu a incapacidade, tentativas administrativas), informações médicas fundamentais (diagnósticos, CIDs, grau de incapacidade, duração estimada) e tipo específico de doença/condição. Etapa 2: Com base nas informações fornecidas, apresente uma sugestão de legislação aplicável ao caso (modalidade de auxílio-doença, artigos específicos da Lei 8.213/91, Decreto 3.048/99, requisitos de carência e incapacidade) e aguarde confirmação do usuário antes de prosseguir. Etapa 3: Após confirmação da legislação, redija um capítulo de mérito estruturado em exatamente 5 parágrafos: (1º) contexto geral e situação fática, (2º) fundamentos legais da incapacidade temporária, (3º) fundamentos do direito ao benefício e carência, (4º) fundamentos da responsabilidade do INSS e critérios médico-periciais, (5º) conclusão com pedido específico. Utilize exclusivamente a fundamentação legal confirmada pelo usuário sem incluir jurisprudência. Aguarde validação do usuário ao final de cada etapa antes de prosseguir, mantendo linguagem técnica e formal apropriada para petições judiciais."
  },
  {
    "id": "p-168",
    "title": "Redação de Capítulo de Mérito de Apelação Cível com Espaços para Citações Diretas",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Produzir capítulo de apelação/contrarrazões com espaços para citações legais.",
    "prompt": "Como advogado do [APELANTE/APELADO], redija seção específica das razões/contrarrazões sobre [matéria] em 8–11 parágrafos concisos (3–4 linhas cada). Confirme existência de sentença e fundamentos específicos (caso contrário, questione). Abra com 2–3 parágrafos sobre erro/acerto da decisão, desenvolva argumentação recursal em parágrafos sintéticos, deixando lacunas para referências legais [Art. XX – citação]. Essencial: mencione somente precedentes e normas previamente indicados. Mantenha redação direta, sem subdivisões ou marcadores."
  },
  {
    "id": "p-169",
    "title": "Redação de Fatos em Petição Inicial",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Transforma relatório em narrativa estruturada de fatos para petição inicial.",
    "prompt": "Como advogado especializado em redação de petições iniciais, transforme o relatório de atendimento fornecido no capítulo de fatos de uma petição inicial. Crie texto corrido em parágrafos curtos, organizando eventos cronologicamente, estabelecendo nexo causal e integrando argumentos probatórios. Substitua nomes por 'Requerente' e 'Requerido'. Linguagem formal e técnica."
  },
  {
    "id": "p-170",
    "title": "Relatório Estruturado de Acórdão",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Elabora relatório detalhado a partir de acórdão complexo.",
    "prompt": "Atue como assessor jurídico especializado em análise de acórdãos complexos e elabore relatório estruturado. Inicie com cabeçalho contendo tribunal, órgão julgador, número do processo, relator, data do julgamento. Desenvolva: I – Contexto Processual e Fático; II – Teses Jurídicas; III – Razões de Decidir; IV – Conclusão e Resultado; V – Referências Jurídicas. Linguagem técnica, objetiva e precisa."
  },
  {
    "id": "p-171",
    "title": "Relatório Estruturado para Contestação Cível",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Produz relatório completo de contestação cível estruturado em síntese dos fatos, tese jurídica, fatos controvertidos/provas e conclusão com recomendações.",
    "prompt": "Como advogado especializado na redação de contestações cíveis, analise a petição inicial fornecida e elabore um relatório estruturado com: (1) SÍNTESE DOS FATOS em parágrafo único descrevendo objetivamente o caso; (2) TESE JURÍDICA em parágrafo conciso identificando o direito pleiteado e sua fundamentação legal principal; (3) FATOS CONTROVERTIDOS E PROVAS, listando cada fato relevante alegado pelo autor, sua prova indicada e, para cada um, sugerindo um contra-argumento prático e a prova necessária para sustentar a defesa; (4) CONCLUSÃO com recomendações objetivas sobre a melhor abordagem para contestação. Use linguagem direta e técnica, e ao final pergunte se o usuário deseja aprofundar algum ponto específico. Crie um artefato."
  },
  {
    "id": "p-172",
    "title": "Revisão de Peça Jurídica",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Fornece análise detalhada de peça jurídica com pontos fortes e fracos.",
    "prompt": "Atue como especialista em [ÁREA] com experiência na revisão de [peça jurídica], forneça análise detalhada identificando pontos fracos, melhorias e possíveis contra-argumentos. Apresente em seções organizadas cobrindo: análise geral, pontos fracos, sugestões de melhoria e potenciais contra-argumentos. Linguagem profissional, objetiva e técnica."
  },
  {
    "id": "p-173",
    "title": "Roteiro de Perguntas para Interrogatório",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Organiza roteiro de perguntas estratégicas em capítulos temáticos para interrogatório de partes e testemunhas em audiência.",
    "prompt": "Você é um advogado especializado em <área>, preparando-se para interrogar [réu/testemunha do autor/testemunha do réu] em um processo de <síntese do processo>. \n        \nContexto: O caso envolve <síntese do processo>. \n\nTarefa: Crie uma lista de perguntas, organizadas em 5 capítulos temáticos. Cada capítulo deve conter uma síntese do tema e uma série de perguntas relacionadas. \n\nInstruções: \n1. Identifique 5 temas principais relacionados ao caso para formar os capítulos. \n2. Para cada capítulo: \n   a) Crie uma síntese que inclua o foco principal, datas relevantes e detalhes importantes. \n   b) Desenvolva 5 perguntas relacionadas ao tema do capítulo. \n3. As perguntas devem visar estabelecer fatos, revelar inconsistências e explorar o conhecimento do interrogado. \n\nFormato: \nPara cada capítulo: \nCapítulo [Número]: [Nome do Tema] \nSíntese: [3–5 frases resumindo os pontos-chave do tema, incluindo datas relevantes e aspectos cruciais a serem explorados] \nPerguntas: [Pergunta 1] [Pergunta 2] [Pergunta 3] \n\nRequisitos: \n- As perguntas devem ser claras e diretas. \n- A síntese deve fornecer contexto suficiente para o advogado improvisar, se necessário. \n- Foque nos pontos cruciais do caso: <síntese do processo>. \n- Inclua perguntas sobre as datas-chave: <síntese do processo>. \n\nRestrição: Limite-se aos fatos e eventos relevantes para o caso em questão, evitando especulações. \n\nCapítulos Sugeridos: [caso já saiba de pontos específicos para perguntas liste para facilitar]."
  },
  {
    "id": "p-174",
    "title": "Tabela de Fatos e Provas em Processo",
    "category": "Geral",
    "type": "Geral",
    "tags": [],
    "description": "Elabora tabela estruturada relacionando fatos controvertidos, provas documentais e necessidade de prova testemunhal.",
    "prompt": "Como assistente jurídico especializado em análise processual, examine a petição inicial e a contestação fornecidas. Elabore uma tabela organizada com as seguintes colunas: (1) Fato Controvertido, (2) Provas Documentais do Autor, (3) Impugnação do Réu, (4) Provas Documentais do Réu, e (5) Recomendação de Prova Testemunhal (Sim/Não + breve justificativa). Para cada fato controvertido, indique claramente as provas apresentadas por cada parte e avalie a necessidade de prova testemunhal considerando a natureza do fato e a suficiência das provas documentais. Organize a tabela em ordem de relevância dos fatos para a causa. Após a apresentação, pergunte ao usuário se deseja análise detalhada de algum ponto específico da tabela."
  },
  {
    "id": "p-175",
    "title": "Busca e Tabulação de Jurisprudência do Superior Tribunal de Justiça - STJ",
    "category": "Geral",
    "type": "Pesquisa",
    "tags": [],
    "description": "Informe o tema para pesquisa. A IA indicará termos e filtros para usar no SCON (https://processo.stj.jus.br/SCON/). Após buscar, cole os resultados. A ferramenta criará tabela analítica e identificará tendências jurisprudenciais, facilitando seleção de precedentes para seu recurso. Note que a todo momento os tribunais tem dificultado o acesso por bots para realização de buscas, até o momento este prompt funciona bem no Manus AI, mas não sabemos até quando.",
    "prompt": "Como pesquisador especializado em jurisprudência do STJ, execute busca sistemática de precedentes no sistema SCON e organize os resultados em formato tabular: primeiro solicite ao usuário (1) o tema ou questão jurídica a ser pesquisada, (2) período temporal desejado (últimos 2 anos, 5 anos, ou sem limitação), (3) se há palavras-chave específicas ou artigos de lei que devem constar na busca, (4) se deseja apenas julgados de alguma turma ou seção específica; com essas informações, oriente o usuário sobre a busca: 'Para pesquisar jurisprudência, acesse https://processo.stj.jus.br/SCON/, na pesquisa livre digite os termos [indicar termos sugeridos com base no tema fornecido], utilize operadores como E, OU, NÃO para refinar, no campo LEGISLAÇÃO insira o artigo específico se houver (exemplo: 1.022 do CPC), aplique filtros de data em Pesquisa Avançada se necessário, ordene por data decrescente para ver os mais recentes'; após o usuário informar que realizou a busca e fornecer os julgados encontrados (ementas, dados ou links), organize em tabela estruturada com as seguintes colunas: PROCESSO (REsp/AREsp/AgInt + número) | DATA | ÓRGÃO JULGADOR | RELATOR | EMENTA/TESE (resumo da decisão em 2 linhas) | ARTIGOS APLICADOS | RESULTADO | RELEVÂNCIA (alta/média/baixa para seu caso); analise o conjunto identificando (1) se há entendimento consolidado ou divergência entre turmas, (2) evolução cronológica das decisões, (3) leading case ou precedente qualificado sobre o tema, (4) se algum julgado foi afetado como repetitivo; apresente conclusão sobre a tendência jurisprudencial: 'ENTENDIMENTO DOMINANTE: [qual tese prevalece]' ou 'DIVERGÊNCIA ATUAL: [turmas divergem sobre...]'; pergunte: 'Deseja buscar com termos diferentes ou explorar período diverso?"
  },
  {
    "id": "p-176",
    "title": "Construção de Tese Jurídica com Pesquisa Profunda",
    "category": "Geral",
    "type": "Pesquisa",
    "tags": [],
    "description": "Atue como advogado especialista em análise de casos complexos e pesquisa jurídica avançada. Com base no caso narrado, realize uma análise que inclua: (1) identificação das questões jurídicas principais; (2) pesquisa em bases oficiais do STF e STJ sobre casos semelhantes e suas soluções, com links diretos; (3) análise de 5 precedentes jurisprudenciais relevantes (número do processo, relator, data, ementa, link); (4) construção de tese jurídica sólida e aplicável ao caso, detalhando a fundamentação legal; (5) recomendações práticas para implementação da solução. É obrigatória a indicação da fonte por link direto no site oficial do tribunal.",
    "prompt": "Pesquisa avançada com construção de tese fundamentada."
  },
  {
    "id": "p-177",
    "title": "Pesquisa de Direitos Violados a partir de Ato ou Fato",
    "category": "Geral",
    "type": "Pesquisa",
    "tags": [],
    "description": "Substitua [DESCREVER ATO OU FATO CONCRETO] pela narrativa detalhada da situação, cole no Gemini ou Perplexity e receba análise completa identificando direitos violados, dispositivos legais infringidos, jurisprudência recente com links diretos e súmulas aplicáveis, tudo organizado por área do direito e gravidade da violação.",
    "prompt": "Atue como advogado especialista em análise jurídica, a partir do seguinte ato/fato [DESCREVER ATO OU FATO CONCRETO]. Identifique: (1) quais direitos foram violados, (2) todos os dispositivos legais infringidos (CF, CC, CP e legislação específica), (3) jurisprudência recente dos tribunais superiores sobre casos similares (últimos 5 anos), fornecendo para cada precedente: número do processo, ementa, relator, data do julgamento e link direto para decisão; (4) súmulas aplicáveis com links para a fonte oficial. Apresente o resultado em tópicos organizados por área do direito afetada, incluindo a gravidade da violação."
  },
  {
    "id": "p-178",
    "title": "Pesquisa de Jurisprudência em Tribunal sobre Tema Específico",
    "category": "Geral",
    "type": "Pesquisa",
    "tags": [],
    "description": "Estrutura para pesquisa organizada em tribunais sobre temas específicos.",
    "prompt": "Atue como advogado em pesquisa jurisprudencial: acesse sistema do tribunal, realize busca sobre tema indicado. Liste os 10 acórdãos mais recentes em tabela com: número do processo, relator, órgão julgador, data, ementa resumida (até 150 palavras). Em seguida, apresente síntese das teses identificadas e indique se há tendência consolidada ou divergente."
  },
  {
    "id": "p-179",
    "title": "Análise de Estrutura Argumentativa Jurídica",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Reorganização da estrutura de textos jurídicos para maior clareza e persuasão",
    "prompt": "Reorganize o texto fornecido para melhorar sua estrutura argumentativa, mantendo os mesmos fundamentos e argumentos, mas apresentando-os em sequência lógica e persuasiva. Não adicione novos argumentos ou jurisprudências, apenas reordene e melhore as transições entre os parágrafos existentes para maior clareza e impacto."
  },
  {
    "id": "p-180",
    "title": "Arquitetura Completa do Recurso Especial",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Use após completar análises preliminares. A IA compilará todas as informações anteriores em estrutura completa e organizada do recurso. Serve como índice mestre para redação, garantindo que nenhum elemento essencial seja esquecido. Valide antes de iniciar redação.",
    "prompt": "Como advogado sênior especializado em recursos ao STJ, estruture a arquitetura completa do recurso especial com base em todos os elementos já analisados nas fases anteriores (viabilidade, prequestionamento, violações legais e divergência jurisprudencial), criando roteiro detalhado seguindo a sistemática processual: organize a peça em I. ENDEREÇAMENTO E QUALIFICAÇÃO (destinatário, partes, número do processo); II. CABIMENTO CONSTITUCIONAL demonstrando enquadramento no art. 105, III, alíneas 'a' e/ou 'c' da CF conforme as teses identificadas; III. PRESSUPOSTOS DE ADMISSIBILIDADE com subseções para (1) Tempestividade com datas específicas, (2) Preparo com valores ou isenção, (3) Regularidade formal da representação, (4) Prequestionamento demonstrado dispositivo por dispositivo conforme tabela anterior, (5) Inaplicabilidade da Súmula 7 demonstrando que não há reexame fático, (6) Afastamento de súmulas impeditivas; IV. RELEVÂNCIA DA MATÉRIA demonstrando repercussão para casos similares e interesse público; V. MÉRITO DO RECURSO dividido em (A) VIOLAÇÕES À LEI FEDERAL com subcapítulos numerados para cada dispositivo violado conforme mapeamento anterior, (B) DIVERGÊNCIA JURISPRUDENCIAL se identificada, com confronto analítico; VI. PEDIDOS especificando conhecimento, provimento e exata providência jurisdicional pretendida; para cada seção, indique (1) argumentos-chave a desenvolver, (2) documentos comprobatórios necessários, (3) precedentes STJ aplicáveis, (4) extensão sugerida em páginas; ao final, apresente checklist de documentos obrigatórios para instruir o recurso e pergunte: 'Esta estrutura contempla todos os pontos necessários? Deseja ajustar alguma seção antes de iniciarmos a redação?"
  },
  {
    "id": "p-181",
    "title": "Assistente de Elaboração de Proposta de Acordo",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Insira as principais peças processuais e em segudia o prompt.",
    "prompt": "Atue como um advogado especialista em mediação e acordos judiciais com vasta experiência em estratégias de negociação. Com base nas informações processuais fornecidas, elabore uma proposta de acordo estruturada em três cenários distintos (ideal, médio e mínimo) que sirva como base para negociação estratégica. Analise os fatos processuais, avalie os riscos e probabilidades de êxito de cada parte, e estruture três cenários progressivos com valores e condições diferentes, justificando brevemente a lógica de cada proposta. Apresente o resultado organizando: (1) Análise preliminar com resumo dos fatos e estimativa de riscos, (2) Cenário Ideal com proposta de abertura e fundamentação, (3) Cenário Médio com posição intermediária e justificativa, (4) Cenário Mínimo com posição de resistência e base legal, e (5) Estratégia de negociação com sequência recomendada e pontos não negociáveis. Utilize linguagem jurídica apropriada, baseie-se exclusivamente nas informações processuais disponíveis, mantenha coerência entre os cenários propostos e inclua cláusulas essenciais como prazos e formas de pagamento. Evite propostas desproporcionais e mantenha-se dentro do escopo dos pedidos processuais. Após elaborar a proposta, pergunte se o usuário deseja ajustar algum dos cenários ou aprofundar aspectos específicos da estratégia de negociação."
  },
  {
    "id": "p-182",
    "title": "Criador de Storytelling Jurídico Persuasivo: Narrativas que Convencem e Emocionam",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "ste prompt inovador transforma fatos processuais áridos em narrativas jurídicas envolventes e persuasivas através de técnicas avançadas de storytelling. O sistema identifica automaticamente elementos dramáticos nos fatos, desenvolve arco narrativo convincente com protagonistas e antagonistas bem definidos, cria tensão e resolução estratégicas, incorpora valores universais que ressoam emocionalmente com a audiência e adapta linguagem e tom ao perfil específico do público (juízes ou jurados). Estrutura o clímax argumentativo para máximo impacto emocional, desenvolve metáforas simplificadoras e produz roteiro persuasivo completo com sugestões de entonação e momentos de ênfase. Oferece ferramenta revolucionária para advogados que buscam transcender a argumentação técnica tradicional e conquistar corações e mentes através do poder transformador das narrativas bem construídas.",
    "prompt": "Atue como um roteirista especializado em narrativas jurídicas com vasta experiência em comunicação persuasiva e psicologia da persuasão, transformando automaticamente fatos processuais áridos em narrativas envolventes que conectem emocionalmente com juízes e jurados através de storytelling estratégico. Etapa 1: Solicite ao usuário que forneça: (a) fatos completos do caso com cronologia detalhada, (b) perfil do público-alvo (juiz singular, tribunal colegiado, júri popular), (c) características socioculturais da audiência, (d) objetivo persuasivo principal (culpa, inocência, responsabilidade, danos), (e) valores e princípios que deseja enfatizar, aguardando as informações completas antes de prosseguir. Etapa 2: Com base nos elementos fornecidos, realize automaticamente construção narrativa estratégica identificando: (a) elementos dramáticos centrais e conflitos humanos envolvidos, (b) desenvolvimento de arco narrativo clássico com introdução, desenvolvimento, clímax e resolução, (c) definição clara de protagonistas, antagonistas e personagens coadjuvantes, (d) criação de tensão dramática e momentos de virada na narrativa, (e) incorporação de valores universais (justiça, família, dignidade, proteção) que ressoem com a audiência, (f) adaptação da linguagem, tom e registro ao perfil específico do público, (g) estruturação do clímax argumentativo no momento de maior impacto emocional, (h) desenvolvimento de metáforas e analogias que simplifiquem conceitos complexos, (i) criação de frases de efeito e elementos memoráveis, apresentando narrativa jurídica completa estruturada em formato de roteiro persuasivo, incluindo sugestões de entonação, pausas estratégicas, momentos de ênfase emocional, sequência lógica de apresentação dos fatos transformados em história coesa e memorável que maximize o impacto persuasivo, solicitando validação da narrativa desenvolvida e pedindo esclarecimentos adicionais apenas se elementos essenciais da construção dramática estiverem incompletos no contexto fornecido."
  },
  {
    "id": "p-183",
    "title": "Criação de Flashcards com Base em Material de Aula",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Transforma material de aula em 30+ flashcards (pergunta/resposta), com dicas e conexões, do básico ao avançado.",
    "prompt": "Sou estudante de [CURSO] na matéria [DISCIPLINA]. Transforme o conteúdo enviado em flashcards no formato pergunta/resposta para facilitar minha memorização. Para cada conceito importante, crie: pergunta clara, resposta concisa, dica de memorização quando útil e conexão com outros conceitos da disciplina. Faça pelo menos 30 flashcards cobrindo definições, exemplos e aplicações práticas. Organize do mais básico ao mais avançado."
  },
  {
    "id": "p-184",
    "title": "Estrutura de Mandado de Segurança",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Copie o prompt abaixo, cole no sistema de IA de sua escolha e siga as 3 etapas guiadas. O sistema analisará o ato coator, identificará a violação ao direito líquido e certo e criará a estrutura completa do mandado de segurança. Simples, rápido e eficiente para organizar seu writ constitucional de forma estratégica.",
    "prompt": "Atue como advogado especializado em direito constitucional e estruturação de mandados de segurança. Preciso criar a estrutura completa do mandado de segurança baseada no ato coator e na violação ao direito líquido e certo, organizando capítulos de forma estratégica e lógica. Execute APENAS UMA ETAPA POR VEZ e aguarde validação do usuário antes de prosseguir para a próxima etapa. Desenvolva estrutura do mandado através de 3 etapas obrigatoriamente individuais: ETAPA 1 - solicite informações sobre o ato coator (autoridade coatora, descrição do ato impugnado, data do ato, direito violado e documentos comprobatórios), em seguida faça análise completa dos fatos apresentados, identifique e apresente em lista numerada a configuração do direito líquido e certo violado, ilegalidade ou abuso de poder do ato, urgência da medida e fundamentos constitucionais aplicáveis, apresente análise completa e aguarde validação do usuário antes de prosseguir; ETAPA 2 - organize os argumentos constitucionais em sequência lógica (pressupostos do mandado de segurança, demonstração do direito líquido e certo, ilegalidade do ato coator, ausência de outro meio eficaz e pedido de liminar se necessário), distribua argumentos por capítulos numerados baseado na análise da etapa anterior, apresente estrutura proposta e aguarde confirmação do usuário antes de continuar; ETAPA 3 - elabore sumário detalhado do mandado com títulos dos capítulos, ordem dos argumentos e fluxo narrativo constitucional, indique estratégia de cada seção, apresente estrutura final completa e pergunte se deseja ajustes. IMPORTANTE: execute somente uma etapa por vez, aguarde validação expressa do usuário em cada etapa, não passe para próxima etapa sem confirmação, organize pressupostos constitucionais primeiro, demonstre claramente o direito líquido e certo, verifique prazo decadencial de 120 dias, numere capítulos sequencialmente, use títulos claros e objetivos para cada seção, na etapa 1 faça análise completa da violação constitucional e apresente todos os fundamentos do writ para o usuário apenas validar."
  },
  {
    "id": "p-185",
    "title": "Estrutura de Petição Inicial (Geral)",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Copie e cole o prompt no ChatGPT ou Claude. O sistema atuará como advogado experiente e guiará você por 5 etapas para criar sua petição inicial. Em cada etapa, forneça as informações solicitadas (dados das partes, fatos do caso, provas disponíveis). Aguarde a confirmação do sistema antes de avançar. Ao final, você terá uma petição completa e estruturada conforme o CPC, pronta para revisão e ajustes finais.",
    "prompt": "Atue como advogado especializado em contencioso cível com 15 anos de experiência na elaboração de petições iniciais, conhecimento aprofundado do CPC e técnicas de redação jurídica persuasiva. Guie-me através de 5 etapas estruturadas para elaborar uma petição inicial completa: (1) Colete informações sobre tipo de ação, qualificação das partes, competência e valor da causa, identificando pressupostos processuais e confirmando comigo: \"Trata-se de [tipo de ação] perante [juízo], valor R$ [X], com interesse processual por [razão]. Correto?\"; (2) Solicite relato cronológico dos fatos e documentação probatória, organizando em ordem lógica e validando: \"Narrativa em [X] tópicos com provas [lista]. Adequado?\"; (3) Identifique dispositivos legais aplicáveis, desenvolva teses jurídicas e relacione jurisprudência, perguntando: \"Fundamentação em [dispositivos] com precedentes [tribunal]. Prossigo?\"; (4) Estruture pedidos principais, subsidiários e processuais, confirmando: \"Pedidos: [lista numerada]. Há coerência entre fatos e pedidos?\"; (5) Compile tudo no formato padrão com seções numeradas (Endereçamento, Síntese, Fatos, Direito, Tutelas, Pedidos, Provas, Valor da Causa), finalizando: \"Esta é a estrutura. Deseja aprofundar alguma seção?\" Aguarde confirmação entre etapas, use linguagem técnica clara, cite dispositivos completos e mantenha coerência narrativa."
  },
  {
    "id": "p-186",
    "title": "Inclusão de Argumento Doutrinário em Texto Jurídico",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Integração de novo argumento doutrinário na argumentação existente",
    "prompt": "Inclua o argumento doutrinário fornecido no texto, integrando-o à argumentação existente. Desenvolva a conexão entre o novo fundamento e os já apresentados, mantendo a coerência do texto e demonstrando como a base teórica fortalece a argumentação."
  },
  {
    "id": "p-187",
    "title": "Integração de Dispositivo Legal em Texto Jurídico",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Inclusão de dispositivo legal em fundamentação existente",
    "prompt": "Integre ao texto o dispositivo legal fornecido, desenvolvendo sua aplicação em harmonia com os argumentos apresentados. Demonstre como a norma reforça a tese sem contradizer fundamentos anteriores. Mantenha a coerência argumentativa e a linguagem técnica já utilizada."
  },
  {
    "id": "p-188",
    "title": "Minuta de Memoriais para Julgamento em Segunda Instância",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Este prompt cria memoriais sintéticos de uma página para entrega aos desembargadores antes da sessão de julgamento. Extrai informações essenciais das peças processuais e estrutura resumo executivo com síntese dos fatos, questão jurídica central, argumentos principais organizados, precedentes relevantes e pedido específico. Utiliza formatação clara, linguagem técnica elevada e estrutura otimizada para consulta rápida durante o julgamento, oferecendo ferramenta prática para facilitar a compreensão dos desembargadores sobre os pontos centrais do recurso.",
    "prompt": "Atue como um advogado especialista em memoriais para tribunais de segunda instância, criando automaticamente memorial sintético de uma página para entrega aos desembargadores antes da sessão de julgamento. Etapa 1: Solicite ao usuário que forneça as principais peças do processo (recurso interposto, acórdão ou decisão recorrida, principais fundamentos recursais) e eventual jurisprudência relevante, aguardando os documentos antes de prosseguir. Etapa 2: Com base nas peças fornecidas, extraia automaticamente os elementos essenciais e crie memorial sintético estruturado em uma única página contendo: (a) cabeçalho com identificação do processo, recurso e partes, (b) síntese objetiva dos fatos em no máximo 3 linhas, (c) questão jurídica central controvertida apresentada de forma direta, (d) argumentos recursais principais organizados em tópicos numerados e concisos, (e) precedentes superiores (STJ/STF) mais relevantes com ementas resumidas, (f) dispositivos legais centrais citados de forma precisa, (g) pedido recursal específico destacado, utilizando linguagem técnica elevada, formatação clara com espaçamento adequado, destaques visuais para pontos centrais e estrutura que facilite consulta rápida pelos desembargadores durante o julgamento, solicitando validação do memorial desenvolvido e pedindo esclarecimentos apenas se elementos essenciais não puderem ser extraídos das peças fornecidas."
  },
  {
    "id": "p-189",
    "title": "Redacão do Requerimento FInal (Pedidos) de Recurso Especial Cível",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Forneça preferencialmente os capítulos já escritos para análise completa. Se não tiver, informe apenas os dados essenciais solicitados. A IA alinhará automaticamente os pedidos com o conteúdo do recurso ou gerará com base nas informações mínimas fornecidas. Garante coerência processual.",
    "prompt": "Como processualista especializado em recursos ao STJ, redija o capítulo completo de pedidos do recurso especial em texto corrido e formato processual adequado: primeiro verifique se o usuário forneceu os capítulos anteriores do recurso para análise - caso não tenha fornecido, solicite: 'Para redigir pedidos alinhados com a fundamentação, preciso que forneça os capítulos já desenvolvidos do recurso ou, no mínimo, informe: (1) quais artigos de lei federal foram arguidos como violados, (2) se há alegação de divergência jurisprudencial, (3) qual providência jurisdicional busca (reforma com qual resultado ou anulação para novo julgamento)'; se fornecidos os capítulos, analise-os para extrair automaticamente as violações arguidas e teses desenvolvidas; com essas informações, inicie com 'ANTE O EXPOSTO, em face das razões de fato e de direito amplamente demonstradas, e evidenciadas as violações à legislação federal infraconstitucional, o recorrente vem respeitosamente requerer'; desenvolva o pedido de conhecimento 'Preliminarmente, o CONHECIMENTO do presente recurso especial, interposto com fundamento no artigo 105, inciso III, alínea(s) [especificar com base nas teses] da Constituição Federal, posto que presentes todos os requisitos de admissibilidade'; prossiga com pedido de mérito 'No mérito, o integral PROVIMENTO do recurso para [detalhar especificamente com base no analisado ou informado]'; adicione 'Protesta-se, desde já, nos termos do artigo 1.025 do CPC, pelo prequestionamento de toda a matéria constitucional e infraconstitucional suscitada'; finalize com pedido de intimações e 'Nestes termos, pede deferimento'; pergunte: 'Os pedidos refletem adequadamente as teses desenvolvidas e o resultado pretendido?"
  },
  {
    "id": "p-190",
    "title": "Redação de Capítulo de Mérito de Embargos de Declaração",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Prompt estruturado em etapas para redigir capítulo de mérito de embargos de declaração com foco em vícios processuais.",
    "prompt": "Como advogado especialista em técnica processual e embargos de declaração, execute esta tarefa em etapas validadas para redigir um capítulo técnico dos embargos: Etapa 1 - Analise a sentença fornecida e identifique um vício específico (obscuridade, contradição, omissão ou erro material do Art. 1.022 CPC), indicando precisamente em qual seção da sentença o vício está localizado e perguntando se devo prosseguir com este vício identificado; Etapa 2 - Transcreva literalmente o trecho problemático da sentença, confirmando se a citação está correta e se é este o trecho que deve fundamentar o capítulo dos embargos; Etapa 3 - Redija o capítulo seguindo rigorosamente esta estrutura: (a) Parágrafo 1 - Contexto fático: situe o vício dentro do contexto da decisão, explicando brevemente a questão decidida, (b) Parágrafo 2 - Fundamentação legal: cite o Art. 1.022 do CPC e seu inciso específico, explicando tecnicamente porque o trecho se enquadra na hipótese legal, (c) Parágrafo 3 - Argumentação técnica: demonstre especificamente como o vício prejudica a clareza/completude da decisão e qual esclarecimento é necessário, (d) Parágrafo 4 - Conclusão e pedido: formule o pedido específico de esclarecimento para este capítulo. Utilize exclusivamente linguagem técnica processual, baseie-se apenas no conteúdo da sentença analisada, mantenha cada parágrafo entre 80-120 palavras, e após redigir pergunte se o usuário deseja ajustar algum parágrafo específico do capítulo."
  },
  {
    "id": "p-191",
    "title": "Redação de Capítulo de Mérito de Recurso Especial Cível (Divergência Jurisprudencial)",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Forneça apenas paradigmas reais que você possui com dados completos. A IA estruturará o confronto analítico em texto corrido conforme exige o STJ. Não inventa jurisprudência - trabalha apenas com os julgados que você fornecer. Essencial para evitar problemas na admissibilidade.",
    "prompt": "Como especialista em demonstração de divergência jurisprudencial para o STJ, redija capítulo completo do dissídio em texto corrido seguindo rigorosamente a técnica processual: primeiro solicite ao usuário (1) a tese jurídica específica em que há divergência, (2) os paradigmas que possui com dados completos (tribunal, número do acórdão, data, relator e trechos relevantes do voto); com essas informações, inicie o capítulo com título 'DA DIVERGÊNCIA JURISPRUDENCIAL' e primeiro parágrafo introdutório 'Além das violações legais demonstradas, o v. acórdão recorrido diverge frontalmente da interpretação conferida por outros tribunais pátrios à mesma questão jurídica, ensejando o conhecimento do presente recurso também pela alínea 'c' do permissivo constitucional'; desenvolva parágrafo apresentando a tese do acórdão recorrido 'O acórdão recorrido firmou o entendimento de que [transcrever a tese exata com indicação de fls.]'; para cada paradigma fornecido, construa em texto fluido a demonstração começando com 'Em sentido diametralmente oposto, o [Tribunal] decidiu que [transcrever trecho do paradigma]', seguindo com parágrafo demonstrando a similitude fática 'Verifica-se que naquele caso, assim como no presente, [demonstrar semelhanças fáticas essenciais]', e parágrafo evidenciando a divergência 'Enquanto o acórdão recorrido entendeu que [resumir tese], o paradigma colacionado firmou que [resumir tese oposta], caracterizando nítida divergência interpretativa sobre [questão jurídica]'; após apresentar todos os paradigmas fornecidos pelo usuário, conclua com parágrafo sobre a atualidade do dissídio; pergunte ao final: 'A demonstração do dissídio está adequada com os paradigmas fornecidos?"
  },
  {
    "id": "p-192",
    "title": "Redação de Capítulo de Mérito de Recurso Especial Cível (Violação Legal)",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Indique o artigo violado e forneça jurisprudências do STJ se tiver (com números e trechos). A IA só citará precedentes que você fornecer, evitando citações inventadas. Sem jurisprudência fornecida, desenvolverá argumentação na lei e lógica jurídica. Garante confiabilidade das citações.",
    "prompt": "Como redator especializado em recursos ao STJ, redija em texto corrido e fluido um único capítulo completo de violação legal, mantendo narrativa contínua sem tópicos ou listas: solicite primeiro (1) qual dispositivo específico será desenvolvido neste capítulo, (2) se o usuário possui jurisprudências do STJ sobre o tema - caso positivo, peça que forneça números dos recursos e trechos relevantes; após receber as informações, inicie com título centralizado 'DA VIOLAÇÃO AO ARTIGO [X] DA LEI [Y]' e desenvolva texto coeso começando com parágrafo que naturalmente apresente o dispositivo violado 'O artigo X da Lei Y estabelece de forma cristalina que [transcrição entre aspas], norma que tem por escopo [explicar brevemente a finalidade da norma no contexto do ordenamento]'; prossiga em novo parágrafo expondo como o acórdão decidiu, integrando a citação fluidamente 'O v. acórdão recorrido, todavia, ao enfrentar a questão posta nos autos, concluiu que [inserir trecho relevante], conforme se depreende do voto condutor às fls. [número]'; desenvolva em 3-4 parágrafos argumentativos a demonstração do erro, construindo raciocínio lógico que flua naturalmente, entrelaçando doutrina quando pertinente e, SE O USUÁRIO FORNECEU JURISPRUDÊNCIA, incorpore-a organicamente ao texto usando apenas os precedentes indicados ('Este entendimento encontra respaldo na jurisprudência desta Corte Superior, conforme REsp [número fornecido pelo usuário]...'); caso não tenha sido fornecida jurisprudência, desenvolva a argumentação baseada na interpretação literal da lei e na lógica jurídica; finalize com parágrafo demonstrando o prejuízo concreto causado ao recorrente; ao concluir, pergunte: 'O capítulo está adequado? Deseja desenvolver outro dispositivo violado?"
  },
  {
    "id": "p-193",
    "title": "Redação de Capítulo de Preenchimento dos Requisitos de Admissibilidade de Recurso Especial",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Execute após validar a estrutura geral. Forneça datas e valores específicos do processo. A IA gerará texto pronto da seção de admissibilidade com linguagem técnica padrão do STJ. Revise datas e valores antes de incorporar ao recurso final. Economiza tempo com fórmulas processuais.",
    "prompt": "Como processualista especializado em requisitos formais do STJ, desenvolva texto completo da seção de admissibilidade do recurso especial utilizando as informações já coletadas, redigindo cada requisito com linguagem técnica e fórmulas processuais consagradas: inicie com CABIMENTO 'O presente recurso especial encontra fundamento no artigo 105, inciso III, alínea [especificar 'a' para violação legal e/ou 'c' para divergência], da Constituição Federal, insurgindo-se contra acórdão proferido por Tribunal de Justiça/Tribunal Regional Federal em última instância'; TEMPESTIVIDADE 'O v. acórdão recorrido foi publicado em [DATA], iniciando-se o prazo recursal em [DATA], com término em [DATA], sendo tempestivo o presente recurso protocolizado em [DATA], dentro do prazo de 15 dias úteis previsto no art. 1.003, §5º do CPC'; PREPARO 'O preparo foi devidamente recolhido conforme guia anexa' ou 'A recorrente é beneficiária da justiça gratuita conforme decisão de fls.'; PREQUESTIONAMENTO 'Todos os dispositivos legais invocados foram devidamente prequestionados, tendo sido objeto de análise expressa pelo tribunal a quo: [listar cada dispositivo com indicação específica das páginas do acórdão onde foram debatidos]'; AUSÊNCIA DE REEXAME FÁTICO 'A pretensão recursal limita-se à análise da correta interpretação e aplicação do direito federal aos fatos já delineados no acórdão, não demandando qualquer reexame do conjunto fático-probatório, afastando-se a incidência da Súmula 7/STJ'; INEXISTÊNCIA DE ÓBICES SUMULARES demonstrar inaplicabilidade das súmulas impeditivas; apresente texto pronto para inserção e pergunte: 'O texto está adequado ou necessita ajustes nas datas/valores/referências específicas do seu caso?"
  },
  {
    "id": "p-194",
    "title": "Redação de Contrarrazões Estruturadas em Etapas",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Guia para elaborar contrarrazões de forma organizada e eficaz, abordando preliminares e mérito.",
    "prompt": "Como advogado especializado em recursos especiais, siga rigorosamente estas etapas sequenciais, aguardando validação do usuário antes de avançar: Etapa 1: Solicite as razões do recurso especial, extraia e apresente (a) hipóteses de cabimento invocadas, (b) tese jurídica central, (c) dispositivos legais apontados como violados, (d) questão jurídica de fundo e aguarde confirmação. Etapa 2: Questione o usuário: qual tese deve ser sustentada nas contrarrazões? qual o correto entendimento jurídico sobre a questão? há fragilidades na tese recursal? Aguarde respostas. Caso o usuário não saiba responder, realize busca sobre a questão jurídica identificada na Etapa 1 e apresente sugestões de teses defensivas para aprovação. Etapa 3: Solicite em síntese os fundamentos legais (dispositivos, princípios, interpretação aplicável) e aguarde resposta. Caso o usuário não apresente, realize busca pelos dispositivos legais aplicáveis à tese defensiva definida e apresente para aprovação. Etapa 4: Solicite jurisprudência do STJ aplicável (ementas, números, teses repetitivas) e aguarde resposta. Caso o usuário não apresente, realize busca por precedentes do STJ sobre a matéria e apresente os julgados relevantes para aprovação. Etapa 5: Proponha estrutura completa de capítulos apresentando para cada um: título, síntese de 2 a 3 linhas do que será sustentado e objetivo argumentativo. Aguarde aprovação da estrutura. Etapa 6: Redija um capítulo por vez seguindo a estrutura aprovada, desenvolvendo argumentação com fundamentos e jurisprudência fornecidos ou pesquisados. Aguarde aprovação de cada capítulo antes de redigir o próximo. Etapa 7: Após todos capítulos aprovados, pergunte se deseja revisar ou aprofundar algo. Nunca pule etapas, nunca avance sem validação, nunca redija múltiplos capítulos simultaneamente."
  },
  {
    "id": "p-195",
    "title": "Redação de Relatório de Atendimento",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Este prompt representa uma aplicação prática da metodologia de prompts estruturados condensada em formato simplificado, especialmente desenvolvido para a rotina advocatícia de documentação de atendimentos. A estrutura integra harmoniosamente os cinco elementos fundamentais da engenharia de prompts em um único parágrafo fluido: estabelece o papel do sistema como advogado documentalista experiente, define implicitamente o contexto de um atendimento jurídico recém-realizado, especifica a tarefa de elaborar um relatório profissional, detalha instruções precisas através de seis seções numeradas que cobrem desde a identificação das partes até os encaminhamentos práticos, e determina o formato de saída com linguagem técnica e tom profissional apropriados.",
    "prompt": "Como advogado experiente especializado em documentação jurídica, analise as informações do atendimento realizado e elabore um relatório profissional estruturado. Organize o conteúdo em seções claras: (1) Dados do atendimento com identificação das partes e data, (2) Relato objetivo dos fatos apresentados pelo cliente em ordem cronológica, (3) Identificação da demanda jurídica principal e questões acessórias, (4) Análise preliminar dos direitos envolvidos com menção aos dispositivos legais aplicáveis, (5) Documentos apresentados ou necessários, (6) Providências imediatas recomendadas e próximos passos, mantendo linguagem técnica apropriada, tom profissional e objetivo, preservando todos os detalhes relevantes sem incluir informações confidenciais desnecessárias. Ao final, pergunte se o usuário deseja aprofundar algum ponto específico da análise ou adicionar informações complementares."
  },
  {
    "id": "p-196",
    "title": "Redação de capítulo do mérito de petição inicial (Fato-Fundamento-Pedido)",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Mantém todos elementos essenciais (verificação prévia, estrutura FFP detalhada, orientações práticas e interatividade) em formato conciso mas completo, fluindo naturalmente como instrução única e coesa.",
    "prompt": "Como advogado processualista representando o autor, elabore um capítulo de mérito sobre [TEMA] seguindo rigorosamente a estrutura FFP (Fato-Fundamento-Pedido), iniciando por verificar se possui os fatos essenciais e fundamentos jurídicos necessários - caso faltem, solicite-os antes de prosseguir. Ao redigir, desenvolva três blocos argumentativos interconectados: primeiro, narre os fatos relevantes de forma objetiva e cronológica, destacando elementos que sustentam a pretensão; segundo, apresente a fundamentação jurídica subsumindo os fatos ao direito, indicando dispositivos legais específicos com marcação \"[Art. X da Lei Y]\" e jurisprudência aplicável fornecida; terceiro, formule pedido claro e específico que decorra logicamente da correlação fato-fundamento estabelecida, garantindo que a pretensão seja consequência jurídica direta dos elementos anteriores. Utilize linguagem técnico-forense precisa, mantenha coesão argumentativa através de conectivos lógicos apropriados, e assegure que cada elemento reforce progressivamente a tese até culminar no pedido, finalizando com a pergunta se há necessidade de aprofundar algum ponto específico ou ajustar a ênfase argumentativa."
  },
  {
    "id": "p-197",
    "title": "Roteiro de Sustentação Oral em Segunda Instância",
    "category": "Geral",
    "type": "Redação",
    "tags": [],
    "description": "Este prompt cria roteiros completos com falas palavra por palavra para sustentações orais em tribunais, extraindo automaticamente informações das peças processuais fornecidas. Desenvolve script detalhado com saudação protocolar, argumentos sequenciais, citações de precedentes, refutação fundamentada e gestão do tempo. Solicita esclarecimentos apenas sobre elementos que não conseguir extrair dos documentos, oferecendo máxima praticidade na criação de sustentações recursais profissionais.",
    "prompt": "Atue como um advogado especialista em sustentação oral para tribunais, desenvolvendo automaticamente roteiro completo com falas estruturadas para sustentação oral em segunda instância. Etapa 1: Solicite ao usuário que forneça as principais peças do processo (recurso interposto, decisão recorrida, principais alegações das partes) e contexto da sustentação, aguardando os documentos antes de prosseguir. Etapa 2: Com base nas peças fornecidas, extraia automaticamente tipo de recurso, argumentos principais, fundamentos da decisão recorrida e identifique elementos necessários, solicitando esclarecimentos apenas sobre informações essenciais que não puderem ser extraídas dos documentos (composição da turma, tempo disponível, estratégia específica), então crie roteiro com falas específicas incluindo: (a) saudação protocolar e síntese inicial do caso, (b) desenvolvimento sequencial dos argumentos recursais com linguagem técnica adequada, (c) citação estratégica de precedentes e refutação da decisão recorrida, (d) gestão do tempo com cronometragem por tópico, (e) preparação para questionamentos, (f) conclusão persuasiva, apresentando script palavra por palavra com frases de abertura, transições, citações literais, marcações de ênfase, pausas estratégicas e cronometragem precisa, solicitando validação final do roteiro desenvolvido."
  },
  {
    "id": "p-198",
    "title": "Análise SWOT de caso previdenciário",
    "category": "Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Aplicação da matriz SWOT em demandas previdenciárias",
    "prompt": "Como advogado previdenciário, realize análise SWOT (Forças, Fraquezas, Oportunidades, Ameaças) de uma demanda judicial ou administrativa. Etapa 1: Solicite documentos (CNIS, indeferimentos, laudos médicos). Etapa 2: Classifique Forças (provas robustas, vínculos claros), Fraquezas (lacunas probatórias), Oportunidades (jurisprudência favorável, revisões possíveis) e Ameaças (teses defensivas do INSS, risco de prescrição). Etapa 3: Produza parecer estratégico com plano de ação para maximizar forças/oportunidades e mitigar fraquezas/ameaças. Valide cada etapa antes de prosseguir."
  },
  {
    "id": "p-199",
    "title": "Análise de indeferimento administrativo do INSS",
    "category": "Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Estrutura técnica para revisar decisão negativa do INSS",
    "prompt": "Como advogado previdenciário, avalie decisão administrativa de indeferimento. Etapa 1: Solicite cópia integral da decisão do INSS, documentos analisados e resumo dos fundamentos de negativa. Etapa 2: Sintetize os motivos do indeferimento (ex: falta de qualidade de segurado, ausência de carência, incapacidade não comprovada). Etapa 3: Elabore relatório crítico destacando falhas do INSS, contradições e fundamentos legais/jurisprudenciais que sustentem a revisão, sugerindo se o caminho mais viável é recurso administrativo ou ação judicial. Sempre aguarde validação antes de avançar."
  },
  {
    "id": "p-200",
    "title": "Análise estratégica por Matriz GUT em demandas previdenciárias",
    "category": "Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Ordena prioridades com base em Gravidade, Urgência e Tendência",
    "prompt": "Como advogado previdenciário, use a Matriz GUT (Gravidade, Urgência, Tendência) para organizar prioridades de uma ação ou recurso. Etapa 1: Solicite os problemas ou pendências processuais (ex: falta de perícia, ausência de documentos, risco de prescrição). Etapa 2: Atribua notas (1 a 5) para cada critério: Gravidade, Urgência, Tendência. Etapa 3: Calcule o índice GxUxT e classifique os itens em ordem decrescente. Etapa 4: Elabore relatório com plano de ação priorizando os pontos mais críticos. Valide cada etapa com o usuário antes de finalizar."
  },
  {
    "id": "p-201",
    "title": "Análise preliminar de documentos para benefício previdenciário",
    "category": "Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Estrutura análise inicial técnica de documentos para verificar viabilidade de concessão",
    "prompt": "Como advogado previdenciário, auxilie na triagem técnica de documentos para pedido de benefício. Etapa 1: Solicite e catalogue os documentos fornecidos (CNIS, CTPS, PPP, laudos médicos, requerimento administrativo). Etapa 2: Elabore uma síntese indicando tempo total de contribuição, vínculos reconhecidos e eventuais lacunas. Etapa 3: Produza parecer inicial apontando se há base para concessão imediata, complementação de provas ou necessidade de ação judicial. Pare após cada etapa e aguarde validação do usuário."
  },
  {
    "id": "p-202",
    "title": "Diagnóstico de caso previdenciário via 5W2H",
    "category": "Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Método estruturado para mapear dados e ações do caso",
    "prompt": "Atue como advogado previdenciário e aplique a metodologia 5W2H (What, Why, Where, When, Who, How, How much) a uma demanda previdenciária. Etapa 1: Solicite dados do caso (benefício pretendido, documentos). Etapa 2: Preencha cada dimensão: O que é a demanda? Por que foi indeferida? Onde está o vínculo/tempo? Quando ocorreu? Quem são as partes? Como comprovar? Quanto custa a prova ou risco? Etapa 3: Elabore relatório com visão panorâmica do caso e recomendações práticas. Sempre aguarde validação antes da próxima fase."
  },
  {
    "id": "p-203",
    "title": "Matriz de Riscos aplicada a revisões previdenciárias",
    "category": "Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Estrutura riscos de revisões e demandas de forma técnica",
    "prompt": "Como advogado previdenciário, conduza análise baseada em Matriz de Riscos. Etapa 1: Solicite dados do benefício (carta de concessão, memória de cálculo, CNIS). Etapa 2: Identifique potenciais hipóteses de revisão (tempo especial, revisão do teto, vínculos omitidos). Etapa 3: Classifique cada risco em termos de probabilidade (baixa/média/alta) e impacto (baixo/médio/alto), gerando matriz visual. Etapa 4: Indique prioridades de atuação e plano de mitigação (provas adicionais, perícia, jurisprudência). Valide com o usuário antes de avançar."
  },
  {
    "id": "p-204",
    "title": "Parecer médico-previdenciário para incapacidade",
    "category": "Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Avaliação técnica sobre auxílio-doença ou aposentadoria por invalidez",
    "prompt": "Como advogado previdenciário, elabore parecer técnico sobre incapacidade laboral. Etapa 1: Solicite laudos, atestados e exames médicos. Etapa 2: Resuma diagnósticos (CIDs), limitações funcionais e histórico laboral do segurado. Etapa 3: Produza parecer avaliando se os elementos sustentam auxílio por incapacidade temporária ou aposentadoria por incapacidade permanente, destacando pontos fortes e fragilidades para eventual prova pericial judicial. Sempre aguarde confirmação antes de seguir."
  },
  {
    "id": "p-205",
    "title": "Planejamento estratégico de provas em ações previdenciárias",
    "category": "Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Define provas necessárias para demandas previdenciárias",
    "prompt": "Como advogado previdenciário, elabore plano estratégico de provas. Etapa 1: Solicite documentos disponíveis (CNIS, PPP, laudos médicos, testemunhos). Etapa 2: Sintetize pontos controvertidos (ex: tempo especial, incapacidade, vínculos não reconhecidos). Etapa 3: Indique provas ideais para cada ponto (pericial, testemunhal, documental complementar), avaliando custo, tempo e eficácia. Pergunte sempre se deseja avançar."
  },
  {
    "id": "p-206",
    "title": "Priorização de estratégias via Matriz de Eisenhower",
    "category": "Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Classificação de medidas urgentes/importantes em processos previdenciários",
    "prompt": "Atue como advogado previdenciário aplicando a Matriz de Eisenhower às medidas cabíveis em um processo. Etapa 1: Solicite informações do processo (fase, provas disponíveis, decisões recentes). Etapa 2: Liste todas as possíveis medidas (recursos, diligências, perícia, complementação documental). Etapa 3: Classifique cada medida em: Urgente/Importante, Urgente/Não Importante, Não Urgente/Importante, Não Urgente/Não Importante. Etapa 4: Sugira ordem prática de execução, justificando com base no risco de perecimento de direito e eficácia probatória. Valide antes de concluir."
  },
  {
    "id": "p-207",
    "title": "Relatório de viabilidade de aposentadoria",
    "category": "Previdenciário",
    "type": "Análise",
    "tags": [],
    "description": "Verifica qual modalidade de aposentadoria é possível com os dados do cliente",
    "prompt": "Atue como advogado especialista em aposentadorias. Etapa 1: Solicite dados objetivos: idade, sexo, tempo de contribuição no CNIS, períodos especiais, vínculos rurais e eventuais requerimentos indeferidos. Etapa 2: Calcule o tempo total de contribuição (comum e especial), considerando regras de transição (EC 103/2019). Etapa 3: Elabore relatório técnico comparando as modalidades (idade, tempo, especial), destacando requisitos cumpridos, faltantes e alternativas mais vantajosas. Valide cada etapa antes de prosseguir."
  },
  {
    "id": "p-208",
    "title": "Checklist de revisão de benefício previdenciário",
    "category": "Previdenciário",
    "type": "Pesquisa",
    "tags": [],
    "description": "Identifica oportunidades de revisão em benefícios concedidos",
    "prompt": "Atue como advogado previdenciário na análise de revisões. Etapa 1: Solicite carta de concessão e memória de cálculo. Etapa 2: Resuma os parâmetros do benefício (DIB, tempo de contribuição, coeficiente, salários considerados). Etapa 3: Elabore checklist das revisões possíveis: tempo especial não computado, revisões do teto, buraco negro/verde, IRSM, inclusão de vínculos ausentes, erro de cálculo da RMI. Valide cada etapa antes de prosseguir."
  },
  {
    "id": "p-209",
    "title": "Estruturação de contestação em ação previdenciária",
    "category": "Previdenciário",
    "type": "Redação",
    "tags": [],
    "description": "Suporte à elaboração de defesa técnica em ações contra o INSS",
    "prompt": "Como advogado previdenciário, auxilie na elaboração de contestação. Etapa 1: Solicite a petição inicial e documentos do autor. Etapa 2: Resuma pedidos e fundamentos alegados. Etapa 3: Estruture pontos de defesa, indicando teses possíveis: ausência de qualidade de segurado, carência, inexistência de incapacidade, falta de prova material para tempo rural/especial. Organize em tópicos objetivos, prontos para uso em contestação. Valide cada etapa com o usuário antes de avançar."
  },
  {
    "id": "p-210",
    "title": "Estruturação de recurso administrativo previdenciário",
    "category": "Previdenciário",
    "type": "Redação",
    "tags": [],
    "description": "Ajuda a redigir recurso técnico contra negativa do INSS",
    "prompt": "Atue como advogado previdenciário na elaboração de recurso. Etapa 1: Solicite decisão indeferitória e documentos do segurado. Etapa 2: Sintetize fundamentos utilizados pelo INSS. Etapa 3: Estruture minuta recursal com: (i) fatos, (ii) fundamentos legais e probatórios, (iii) análise crítica da decisão, (iv) pedido expresso de revisão. Use linguagem formal e técnica. Valide com o usuário antes da redação final."
  },
  {
    "id": "p-211",
    "title": "Análise de Pedido de Tutela de Urgência",
    "category": "Processo Civil",
    "type": "Análise",
    "tags": [],
    "description": "Estrutura análise detalhada de pedidos de tutela de urgência para avaliar sua viabilidade.",
    "prompt": "Leia o pedido de tutela apresentado e avalie segundo os critérios: (1) probabilidade do direito, (2) perigo de dano ou risco ao resultado útil do processo, (3) adequação da medida postulada. Apresente análise em tabela com fundamentos fáticos e jurídicos. Conclua com parecer sobre a viabilidade da concessão."
  },
  {
    "id": "p-212",
    "title": "Análise de processo de execução/cumprimento de sentença e sugestão de próximos passos",
    "category": "Processo Civil",
    "type": "Análise",
    "tags": [],
    "description": "Análise do estágio do processo de execução e plano de próximas medidas, estruturado em Status, Obstáculos, Fundamento e Providências.",
    "prompt": "Como advogado especializado em processo de execução, analise o atual estágio do processo executivo e sugira os próximos passos processuais adequados a serem requeridos ao juízo. Verifique se as informações do processo executivo (tipo de execução, fase atual, diligências já realizadas, resultados obtidos e pendentes) foram fornecidas – caso não, solicite-as. Estruture a análise com: 1) Resumo da situação atual do processo executivo (Status); 2) Identificação dos obstáculos ou pendências processuais existentes (Obstáculos); 3) Fundamentação legal das medidas cabíveis neste momento processual (Fundamento); 4) Sugestão objetiva e prática das próximas diligências ou requerimentos a serem apresentados ao juízo (Providências). Utilize linguagem técnico-jurídica, mantenha foco nas medidas mais eficientes para satisfação do crédito, ordene as sugestões por prioridade e viabilidade, e indique claramente os dispositivos legais que amparam cada medida sugerida."
  },
  {
    "id": "p-213",
    "title": "Redação de Agravo de Instrumento",
    "category": "Processo Civil",
    "type": "Redação",
    "tags": [],
    "description": "Auxilia na construção de peças recursais de agravo de instrumento com base em decisão interlocutória.",
    "prompt": "Solicite a decisão interlocutória a ser impugnada. Estruture o recurso em: (1) síntese da decisão agravada, (2) exposição dos fundamentos jurídicos demonstrando o desacerto, (3) pedido de reforma, (4) requerimentos finais (efeito suspensivo, intimações). Utilize linguagem técnica e objetiva, mantendo clareza e precisão."
  },
  {
    "id": "p-214",
    "title": "Relatório estruturado para apoiar a contestação",
    "category": "Processual Civil",
    "type": "Analise",
    "tags": [],
    "description": "Decompõe a inicial em fatos, tese, pontos controvertidos/provas e recomendações.",
    "prompt": "Como advogado especializado na redação de contestações cíveis, analise a petição inicial fornecida e elabore um relatório estruturado com: (1) SÍNTESE DOS FATOS em parágrafo único descrevendo objetivamente o caso; (2) TESE JURÍDICA em parágrafo conciso identificando o direito pleiteado e sua fundamentação legal principal; (3) FATOS CONTROVERTIDOS E PROVAS, listando cada fato relevante alegado pelo autor, sua prova indicada e, para cada um, sugerindo um contra-argumento prático e a prova necessária para sustentar a defesa; (4) CONCLUSÃO com recomendações objetivas sobre a melhor abordagem para contestação. Use linguagem direta e técnica, e ao final pergunte se o usuário deseja aprofundar algum ponto específico. Crie um artefato."
  },
  {
    "id": "p-215",
    "title": "Tabela de fatos, provas e recomendação de prova testemunhal",
    "category": "Processual Civil",
    "type": "Analise",
    "tags": [],
    "description": "Cria tabela comparativa entre inicial e contestação, com recomendação de prova.",
    "prompt": "Como assistente jurídico especializado em análise processual, examine a petição inicial e a contestação fornecidas. Elabore uma tabela organizada com as seguintes colunas: (1) Fato Controvertido, (2) Provas Documentais do Autor, (3) Impugnação do Réu, (4) Provas Documentais do Réu, e (5) Recomendação de Prova Testemunhal (Sim/Não + breve justificativa). Para cada fato controvertido, indique claramente as provas apresentadas por cada parte e avalie a necessidade de prova testemunhal considerando a natureza do fato e a suficiência das provas documentais. Organize a tabela em ordem de relevância dos fatos para a causa. Após a apresentação, pergunte ao usuário se deseja análise detalhada de algum ponto específico da tabela."
  },
  {
    "id": "p-216",
    "title": "Viabilidade de apelação com base na contestação e sentença (réu)",
    "category": "Processual Civil",
    "type": "Analise",
    "tags": [],
    "description": "Relatório sobre necessidade e chance de apelar em favor do réu.",
    "prompt": "Como advogado especializado em recursos, analise a contestação, a sentença e as demais peças processuais indicadas, apresentando um relatório objetivo sobre a necessidade e viabilidade de apelação. Compare as teses defensivas da contestação e as provas dos autos com o resultado da sentença, indicando os pontos desfavoráveis ao réu, avaliando para cada um deles as chances de êxito em recurso com base nos fundamentos jurídicos e probatórios disponíveis. Conclua com uma recomendação sobre recorrer ou não de cada capítulo da sentença, incluindo análise sobre custos e riscos envolvidos. Caso a sentença tenha sido integralmente favorável à defesa, indique não haver necessidade de recurso, exceto por eventual interesse em ônus sucumbenciais."
  },
  {
    "id": "p-217",
    "title": "Viabilidade de apelação com base na petição inicial e sentença (autor)",
    "category": "Processual Civil",
    "type": "Analise",
    "tags": [],
    "description": "Relatório objetivo sobre necessidade e chance de apelar em favor do autor.",
    "prompt": "Como advogado especializado em recursos, analise a petição inicial, a sentença e as demais peças processuais indicadas, apresentando um relatório objetivo sobre a necessidade e viabilidade de apelação. Compare as teses e pedidos da inicial e as provas dos autos com o resultado da sentença, indicando os pontos de improcedência ou procedência parcial desfavoráveis ao autor, avaliando para cada um deles as chances de êxito em recurso com base nos fundamentos jurídicos e probatórios disponíveis. Conclua com uma recomendação sobre recorrer ou não de cada capítulo da sentença, incluindo análise sobre custos e riscos envolvidos. Caso a sentença tenha sido integralmente procedente, atendendo todos os pedidos na forma pleiteada, indique não haver necessidade de recurso."
  },
  {
    "id": "p-218",
    "title": "Análise comparativa de sentença e recurso de embargos de declaração",
    "category": "Processual Civil",
    "type": "Análise",
    "tags": [],
    "description": "Análise detalhada de decisão embargada comparando-a com embargos de declaração para contrarrazões.",
    "prompt": "Como analista jurídico especializado em recursos, compare detalhadamente o conteúdo da decisão embargada com as alegações apresentadas nos embargos de declaração. Para cada ponto questionado pelo embargante: 1) Cite o trecho específico dos embargos; 2) Localize e transcreva os trechos da decisão que já abordam a questão supostamente omitida, contraditória ou obscura; 3) Demonstre tecnicamente como a decisão já contemplou todos os argumentos relevantes para o julgamento. Organize a análise em uma tabela, seguindo a ordem dos argumentos apresentados nos embargos, e evidencie quando o embargante estiver tentando rediscutir o mérito sob o pretexto de sanar vícios inexistentes."
  },
  {
    "id": "p-219",
    "title": "Análise de Provas Processuais por meio de Tabelas",
    "category": "Processual Civil",
    "type": "Análise",
    "tags": [],
    "description": "Elaborar tabela detalhada de provas do processo com colunas específicas para organização.",
    "prompt": "Como um analista jurídico especializado em organização processual, crie uma tabela detalhada que analise as provas do processo, usando cinco colunas: 1) Fato Alegado (em ordem cronológica), 2) Provas do Autor (documentos com número das páginas), 3) Provas Adicionais Possíveis (testemunhal, pericial), 4) Impugnação do Réu (contestações específicas), 5) Provas do Réu (documentos com páginas)."
  },
  {
    "id": "p-220",
    "title": "Análise de fatos e provas de forma profunda e em etapas",
    "category": "Processual Civil",
    "type": "Análise",
    "tags": [],
    "description": "Exame detalhado de alegações e provas com etapas estruturadas de pensamento.",
    "prompt": "Atue como um magistrado e analise as provas apresentadas neste processo em relação às alegações da parte autora, utilizando uma cadeia de pensamento explícita que demonstre seu raciocínio em etapas sequenciais: Estrutura de Análise: 1. Catalogação das Alegações: Identifique e enumere cada alegação factual relevante da parte autora; Classifique por natureza (constitutiva, modificativa, impeditiva, extintiva); Determine quais são centrais para o pedido e quais são acessórias. 2. Inventário Probatório: Classifique sistematicamente todas as provas por tipo (documental, testemunhal, pericial); Avalie preliminarmente a admissibilidade, autenticidade e tempestividade; Identifique a finalidade declarada de cada elemento probatório. 3. Análise Individual das Provas: Examine cada prova quanto à relevância, força probante e credibilidade; Identifique contradições internas ou com outras provas; Avalie conformidade com requisitos legais específicos (quando aplicável). 4. Correlação Provas-Alegações: Estabeleça conexões diretas entre cada prova e as alegações específicas; Identifique alegações sem suporte probatório adequado; Avalie a suficiência do conjunto probatório para cada alegação principal. 5. Aplicação do Ônus Probatório: Determine a quem incumbe provar cada fato alegado; Avalie se o ônus foi devidamente cumprido em cada caso; Considere as consequências processuais das falhas probatórias. Formato de Saída: Matriz de correlação entre alegações e elementos probatórios; Avaliação fundamentada da suficiência probatória para cada alegação principal; Conclusão sobre robustez da prova apresentada, com recomendações de redação de fundamentos jurídicos e possíveis ajustes estratégicos."
  },
  {
    "id": "p-221",
    "title": "Roteiro de perguntas estratégicas para tese defensiva",
    "category": "Processual Civil",
    "type": "Assistente",
    "tags": [],
    "description": "Gera questionário tático (preliminares, economia do autor e mérito) para fortalecer a defesa.",
    "prompt": "Como advogado especialista em defesas processuais, analise o relatório/fatos apresentados e faça perguntas estratégicas para construir uma tese defensiva sólida. Comece com questões preliminares (ex: 'Há problemas na documentação que comprovem a capacidade processual?', 'Existe conexão com outras ações?', 'O valor da causa está correto?'). Em seguida, explore aspectos econômicos do autor (ex: 'Há sinais externos de riqueza nas redes sociais?', 'O autor possui bens em seu nome?', 'Qual sua profissão/renda?') para avaliar o pedido de justiça gratuita. No mérito, questione pontos cruciais da narrativa autoral (ex: 'Existem provas que contradizem os fatos narrados?', 'Há documentos que fortaleçam nossa versão?', 'Conhecemos precedentes favoráveis sobre este tema?'), sempre focando em elementos que possam enfraquecer a pretensão inicial ou fortalecer a defesa. Para cada resposta relevante, solicite documentação comprobatória quando aplicável. Ao final, sintetize os pontos fortes identificados e pergunte se há informações adicionais que possam fortalecer a tese defensiva."
  },
  {
    "id": "p-222",
    "title": "Roteiro temático para interrogatório de testemunhas",
    "category": "Processual Civil",
    "type": "Assistente",
    "tags": [],
    "description": "Monta 5 capítulos com síntese e 5 perguntas por capítulo para instrução.",
    "prompt": "Papel: Você é um advogado especializado em <área>, preparando-se para interrogar [réu/testemunha do autor/testemunha do réu] em um processo de <síntese do processo>. Contexto: O caso envolve <síntese do processo> Tarefa: Crie uma lista de perguntas, organizadas em 5 capítulos temáticos. Cada capítulo deve conter uma síntese do tema e uma série de perguntas relacionadas. Instruções: 1. Identifique 5 temas principais relacionados ao caso para formar os capítulos. 2. Para cada capítulo: a) Crie uma síntese que inclua o foco principal, datas relevantes e detalhes importantes. b) Desenvolva 5 perguntas relacionadas ao tema do capítulo. 3. As perguntas devem visar estabelecer fatos, revelar inconsistências e explorar o conhecimento do interrogado. Formato: Para cada capítulo: Capítulo [Número]: [Nome do Tema] Síntese: [3–5 frases resumindo os pontos-chave do tema, incluindo datas relevantes e aspectos cruciais a serem explorados] Perguntas: 1. [Pergunta 1] 2. [Pergunta 2] 3. [Pergunta 3] Requisitos: 1. As perguntas devem ser claras e diretas. 2. A síntese deve fornecer contexto suficiente para o advogado improvisar, se necessário. 3. Foque nos pontos cruciais do caso: <síntese do processo> 4. Inclua perguntas sobre as datas-chave: <síntese do processo> Restrição: Limite-se aos fatos e eventos relevantes para o caso em questão, evitando especulações. Capítulos Sugeridos: [caso já saiba de pontos específicos para perguntas liste para facilitar]."
  },
  {
    "id": "p-223",
    "title": "Capítulo “DO DIREITO” para petição inicial cível",
    "category": "Processual Civil",
    "type": "Redação",
    "tags": [],
    "description": "Gera a seção “DO DIREITO” com 4 parágrafos (fatos, fundamentos legais, jurisprudência e pedido).",
    "prompt": "Como um advogado especializado na redação de petições iniciais cíveis, redija um capítulo da petição inicial, referente a seção DO DIREITO com o título: [...], observando os fatos, o título indicado para o capítulo e os fundamentos jurídicos específicos que devem ser abordados. O texto deve conter quatro parágrafos concisos abordando: fatos relevantes, fundamentos jurídicos legais, jurisprudência aplicável e o pedido específico. Use linguagem formal e técnica. Após a redação, pergunte se o usuário deseja aprofundar algum ponto específico."
  },
  {
    "id": "p-224",
    "title": "Capítulo “DOS FATOS” a partir das anotações de atendimento",
    "category": "Processual Civil",
    "type": "Redação",
    "tags": [],
    "description": "Converte as notas do atendimento em narrativa cronológica coesa para a inicial.",
    "prompt": "Como assistente jurídico especializado na redação de petições iniciais cíveis, transforme as anotações de atendimento no capítulo 'DOS FATOS' de uma petição inicial, que tem por objetivo [indique o objetivo da ação que será movida - Exemplo: Obter uma indenização por danos materiais considerando danos provocados ao veículo do cliente que foi atingido por um ônibus]. Organize os eventos de forma cronológica e coesa em parágrafos curtos, estabelecendo nexo causal entre os fatos e direitos pleiteados. Use linguagem formal e técnica, substituindo nomes das partes por 'Requerente' e 'Requerido'. Integre naturalmente na narrativa os argumentos que defendam os interesses do cliente, destacando provas disponíveis que reforcem cada alegação. Mantenha foco apenas em elementos relevantes à pretensão, sem menções a fundamentos jurídicos, tias como citações a dispositivos de lei. Após a redação, confirme se há necessidade de ajustes ou destaque de pontos específicos."
  },
  {
    "id": "p-225",
    "title": "Redação de Manifestação de Especificação de Provas",
    "category": "Processual Civil",
    "type": "Redação",
    "tags": [],
    "description": "Gerar manifestação de especificação de provas com base em fatos alegados, documentos e ônus da prova.",
    "prompt": "Você é um advogado especialista em análise probatória. Preciso que me ajude a criar uma manifestação de especificação de provas. Forneça todos os fatos alegados na inicial e que precisam ser provados, indicando: a) documentos já juntados aos autos (com número das páginas), b) se houve impugnação específica do réu, e c) provas já produzidas para cada fato. Indique também provas adicionais necessárias (testemunhal, pericial, documental). Conforme o art. 373 do CPC, especifique o ônus da prova. Estruture em: 1) Fatos Incontroversos, 2) Provas a Produzir (lista numerada com justificativa), 3) Requerimentos (síntese dos pedidos probatórios)."
  },
  {
    "id": "p-226",
    "title": "Redação de capítulo de mérito de recurso especial - Estrutura VTDC",
    "category": "Processual Civil",
    "type": "Redação",
    "tags": [],
    "description": "Criação de capítulo de mérito para Recurso Especial com base na estrutura VTDC.",
    "prompt": "Atue como um advogado especializado na redação de recursos especiais, crie um capítulo de mérito para um Recurso Especial seguindo a estrutura VTDC (Violação-Texto legal-Demonstração-Conclusão), através destas etapas: (1) primeiro, solicite o trecho exato do acórdão que se pretende impugnar e os dispositivos legais federais violados; (2) após receber estas informações, elabore o capítulo começando pela identificação clara da violação no acórdão (transcrevendo o trecho e explicando o equívoco), seguido pela apresentação do texto legal federal violado (com transcrição exata do dispositivo), prosseguindo com a demonstração analítica do erro interpretativo (confrontando a decisão com a correta interpretação da lei, citando jurisprudência do STJ quando indicada pelo usuário), e concluindo com o pedido específico de reforma, utilizando uma linguagem técnica formal, sem menção adentrar ao reexame de provas (Súmula 7/STJ)."
  },
  {
    "id": "p-227",
    "title": "Redação de capítulo de síntese processual de apelação",
    "category": "Processual Civil",
    "type": "Redação",
    "tags": [],
    "description": "Elaboração de síntese processual para apelação cível.",
    "prompt": "Atue como advogado experiente em direito processual civil e elabore uma síntese processual precisa para introduzir uma apelação cível. Solicite ao usuário: \"Por favor, compartilhe os dados básicos do processo (número, vara, partes envolvidas), o objeto da ação, um resumo da sentença recorrida e os principais pontos que deseja contestar.\" Com essas informações, redija um relatório processual conciso e objetivo em 3–4 parágrafos, estruturado cronologicamente, destacando: (1) qualificação das partes e natureza da ação; (2) pretensões iniciais e contestação; (3) principal fundamentação da sentença impugnada; e (4) decisão final e seus efeitos práticos para o apelante. Utilize terminologia técnico-jurídica de forma clara e precisa, evitando expressões em língua estrangeira e jargões jurídicos desnecessários."
  },
  {
    "id": "p-228",
    "title": "Redação de capítulo de síntese processual de recurso especial",
    "category": "Processual Civil",
    "type": "Redação",
    "tags": [],
    "description": "Estruturação de síntese para recurso especial.",
    "prompt": "Atue como advogado com experiência na redação de recursos especiais e elabore o capítulo: 1. SÍNTESE PROCESSUAL. Execute esta tarefa em duas etapas distintas: Primeira etapa: Solicite do usuário as seguintes informações: Tipo da ação originária (ex.: indenizatória, mandado de segurança); Objeto específico da ação (ex.: reparação por danos morais, anulação de ato administrativo); Resultado da sentença de primeiro grau (procedência/improcedência); Tribunal de origem que julgou o recurso; Decisão específica do tribunal (ex.: reformou a sentença, manteve a condenação); Artigos da legislação federal que foram violados pelo acórdão. Segunda etapa: Após o usuário fornecer todas as informações, redija uma síntese processual ordenada e coesa. Inicie pela descrição da ação originária e seu objeto, seguida pelo resultado da demanda e a motivação para o presente recurso. O texto deve ser sucinto, demonstrando claramente como o acórdão recorrido violou a legislação federal, estabelecendo as bases para o cabimento do recurso nos termos do artigo 105, III, da Constituição Federal."
  },
  {
    "id": "p-229",
    "title": "Redação de réplica à contestação (Refutação-Reforço-Reiteração)",
    "category": "Processual Civil",
    "type": "Redação",
    "tags": [],
    "description": "Estrutura RRR para redação de réplica à contestação.",
    "prompt": "Como advogado do AUTOR, redija um capítulo de réplica à contestação seguindo a estrutura RRR (Refutação-Reforço-Reiteração) sobre o tema específico [TEMA].\nVerifique se o trecho da contestação e as bases jurídicas para a réplica foram fornecidos - caso não, solicite-os. Estruture com: refutação clara e objetiva dos argumentos apresentados na contestação (Refutação), reforço dos fundamentos jurídicos e fáticos que sustentam a pretensão inicial (Reforço), e reiteração do pedido original com eventual adaptação se necessário (Reiteração). Use linguagem técnica precisa, mantenha foco nos pontos controvertidos e demonstre claramente por que os argumentos da contestação não devem prevalecer."
  },
  {
    "id": "p-230",
    "title": "Texto para alegações finais orais (até 5 min)",
    "category": "Processual Civil",
    "type": "Redação",
    "tags": [],
    "description": "Produz fala linear (início, desenvolvimento, conclusão) com provas e fundamentos.",
    "prompt": "Como assistente jurídico especializado em alegações finais, vou ajudar a criar um texto para leitura em audiência, limitado a 5 minutos. Primeiro verifique e pergunte ao usuário: 1. Você representa o autor ou réu?; 2. Forneça a inicial, contestação e outros documentos que julgar necessários; 3. Forneça uma síntese dos depoimentos colhidos em audiência. Com base nisso entenda os principais aspectos da inicial e contestação, os documentos cruciais mencionados e decisões relevantes já proferidas. Com estas informações, elabore um texto para leitura que seguirá esta estrutura: INÍCIO: Excelentíssimo Juiz, ilustre colega advogado, serventuários da justiça e demais presentes. DESENVOLVIMENTO: Desenvolvimento em parágrafos fluidos abordando: Síntese da controvérsia; Provas documentais essenciais correlacionadas com depoimentos; Fundamentos jurídicos principais; CONCLUSÃO: Conclusão objetiva: É isto que tem a manifestar. O texto será natural para leitura oral, com ritmo adequado, usando linguagem formal clara, com aproximadamente 2 páginas, focado nos pontos decisivos, com transições suaves entre os parágrafos."
  }
];
