# ATRIUM — Guia obrigatório de construção e revisão visual

Status: diretriz de implementação e revisão. Referência inspecionada em 18/09/2026.

Versão documental: 2 — critérios de composição, contratos por componente e protocolo de prevenção de regressões. Seções 1–9: identidade e fundamentos; 10–12: processo e checklist; 13–18: implementação detalhada; 19–21: diagnóstico, aprovação e evidência.

Destinatários: OpenCode, Codex e qualquer agente que construa interfaces neste repositório. A leitura integral é obrigatória pelo `AGENTS.md`, inclusive para subagentes de UI.

Este guia ensina como manter a qualidade da interface; não altera o sistema e não concede autorização para redesign, mudanças funcionais ou publicação. Números apresentados como orientação não são prova de que todas as telas existentes já os cumprem.

## 1. O que faz a interface parecer bem construída

Não é um efeito isolado, uma sombra forte ou um título enorme. É a repetição coerente de pequenas decisões: mesma escala de espaço, mesma família de controles, contraste hierárquico, bordas discretas, alinhamento e comportamento previsível.

A direção do ATRIUM é **editorial jurídica, sóbria e contemporânea**: calma de papel e materiais naturais, precisão de ferramenta de trabalho. O usuário precisa perceber organização e confiança antes de perceber decoração.

Ordem de prioridade:

1. Informação legível e ação compreensível.
2. Estado operacional verdadeiro e visível.
3. Hierarquia e alinhamento.
4. Densidade e ritmo de leitura.
5. Acabamento visual discreto.

Não transformar o produto em landing de marketing, dashboard neon, portal burocrático pesado ou SaaS azul genérico. “Premium” significa acabamento consistente, não dourado em tudo, cards gigantes ou excesso de animação.

## 2. Autoridade e arquivos de referência

Antes de desenhar, leia:

- `specs/ui-mode.md`: contrato atual de apresentação, tema e navegação.
- `css/views/ui-v2/tokens.css`: cores, fontes, espaços, raios, sombras, motion e camadas atuais.
- `css/views/ui-v2/primitives.css`, `icons.css`, `motion.css` e `shell.css`: controles compartilhados, foco, sprite, movimento e shell.
- O CSS e o presenter da feature afetada, em `css/views/ui-v2/` e `js/views/ui-v2/`, além de seu controlador em `js/features/`.
- A spec funcional do domínio: apresentação nunca redefine permissões, prazos, persistência ou sucesso de um job.

`docs/ui-v2/DESIGN_CONTRACT.md` explica a intenção editorial original, mas contém baseline e propostas históricas, inclusive Classic como default. Não implementar essas propostas como contrato atual: hoje prevalecem `specs/ui-mode.md`, código e tokens vigentes. Este guia não reintroduz seletor de Classic, chaves de preferência antigas ou schema histórico.

Para cada novo componente, escolha um equivalente já bem resolvido no domínio: toolbar de Tarefas, tabela/inspetor de Processos, drawer de Contatos, cartão de Integrações, formulário de Configurações. Reutilize a família visual e o comportamento, não copie uma tela inteira com IDs/listeners duplicados.

## 3. Cor: função antes de preferência pessoal

Use tokens semânticos, não hexadecimais espalhados. Referência atual dos principais tokens:

| Função/token `--v2-color-*` | Light | Dark |
|---|---|---|
| `background` | `#F3F4F2` | `#111315` |
| `surface` | `#FAFAF8` | `#181B1E` |
| `surface-secondary` | `#EEF0EF` | `#202428` |
| `foreground` | `#252A2E` | `#ECEEED` |
| `muted-foreground` | `#737B80` | `#8B9297` |
| `primary` | `#596C7A` | `#8297A6` |
| `gold` | `#A7894D` | `#C0A261` |
| `border` | `#D2D6D5` | `#343A3F` |

Se os tokens mudarem, o arquivo CSS é a autoridade, não esta tabela. O dourado de marca `#DFBE6A` citado em `AGENTS.md` não deve substituir indiscriminadamente os dourados temáticos da UI.

- Fundo, superfície e superfície secundária precisam criar profundidade discreta, não uma sequência de caixas sem diferenciação.
- Dourado serve a identidade, pequenos títulos de seção e acentos. Ação primária usa `--v2-action-primary-*`; a classe legada `.gold` não obriga um botão amarelo, especialmente no tema claro.
- Sucesso, aviso e erro usam os respectivos tokens semânticos e um rótulo compreensível. Cor sozinha não informa estado.
- Não pintar texto importante com opacidade baixa para parecer sofisticado. Medir contraste no fundo real, inclusive em hover, disabled e dark.
- Não aplicar inversão automática de cores para produzir o tema escuro.

## 4. Tipografia e linguagem

Há dois papéis tipográficos, não uma fonte diferente por componente:

- Interface: `--v2-font-interface` (Inter e fallbacks do sistema), para controles, tabelas, formulários, descrições e números.
- Editorial: `--v2-font-editorial` (Playfair Display/Georgia), para títulos selecionados de página e cards. Não usar serifada em todas as labels ou nos dados densos.

Um título principal, um subtítulo curto quando necessário e grupos identificáveis bastam. Título, contador, filtros e ações não devem disputar a mesma força visual.

Orientação: textos operacionais em torno de 12–14px, labels compactas em torno de 10–12px e títulos ajustados à família existente. Isso não é licença para diminuir fonte até caber. Use `clamp()` onde o módulo já o utiliza, sem título de landing dentro de um modal operacional.

Números, datas, moedas e contadores que mudam devem manter leitura estável; reutilize `font-variant-numeric: tabular-nums`. Truncamento é aceitável em uma linha resumida se houver acesso ao conteúdo completo. Não esconder a informação essencial de um prazo ou erro só para manter o card baixo.

Use português direto, nomes neutros e frases que indiquem próxima ação. Evite slogans técnicos, textos repetidos de segurança e qualificadores como “soberana”. Em texto de produto, use **“e”**, não `&`; preserve operadores, escaping HTML, query strings, nomes próprios e valores compatíveis persistidos.

## 5. Espaçamento, forma e profundidade

A escala existente é baseada em 4px: `--v2-space-1` = 4px, `2` = 8px, `3` = 12px, `4` = 16px, `5` = 20px, `6` = 24px, `8` = 32px, `10` = 40px, `12` = 48px, `16` = 64px; há também o ajuste de 6px. Reutilize esses tokens.

- Espaço pequeno aproxima elementos relacionados; espaço maior separa grupos. Não espalhar o mesmo gap enorme entre tudo.
- Dentro de um card, manter margens consistentes e alinhar ícone, título, conteúdo e rodapé a eixos reconhecíveis.
- Raios atuais: 6, 10, 14 e 18px, mais o token round. Use a família do componente vizinho. Pill é adequada a chips e segmented controls, não precisa ser a forma de todos os campos/cards.
- Bordas geralmente discretas; sombras existentes indicam elevação. Não empilhar três sombras, glow e gradiente no mesmo controle.
- Textura/grain já pertence à base visual. Não adicionar filtros pesados ou nova textura por feature.

Se não conseguir justificar o espaço ou a decoração pela hierarquia, remova o excesso.

## 6. Composição e densidade

Construa a leitura nesta sequência quando aplicável: cabeçalho → ações/contadores → filtros → conteúdo → detalhe. Nem toda tela precisa de métricas ou de todos esses blocos.

- Reserve uma ação primária clara por contexto. Secundárias são mais discretas; ações destrutivas não ganham destaque decorativo.
- Alinhe os centros dos controles da mesma toolbar, mantendo altura e padding da família. Contador é um chip de largura pelo conteúdo, não uma barra esticada sem função.
- Tabelas são ferramentas densas: dados principais primeiro, metadados menores, ações previsíveis. Não converter cada célula em um card nem duplicar informação em várias colunas.
- Cards devem ter densidade semelhante quando compartilham uma linha. Conteúdo curto não exige um card de largura total. Mail ao lado de INPI/RPI é o exemplo: resumo e ações no card; preferências/destinatários detalhados no drawer.
- Se somente alguns portais estão selecionados, mostrar resumo compacto e expandir detalhe pertinente, sem obrigar o usuário a percorrer uma lista enorme de portais inativos.
- Não fixar altura só para “igualar” cards se isso corta conteúdo. Estruture o grid e alinhe rodapés quando fizer sentido.
- Empty state deve explicar ausência real e oferecer ação útil quando disponível, sem uma caixa monumental ou sucesso fictício.

## 7. Controles, ícones e hover

Reutilize os botões, campos, chips e menus existentes. Botões operacionais da família compartilhada têm referência de 40px; em mobile/touch, preservar alvos de pelo menos 44px. Controles densos existentes podem ter outra medida: validar o contexto, não redimensionar o sistema inteiro.

Todo ícone de produto usa o sprite `assets/icons/atrium-ui-icons.svg`, com símbolo existente, `currentColor` e tamanho da família. Exemplo de sintaxe, não de implementação de uma nova feature:

```html
<svg class="atrium-icon" aria-hidden="true">
  <use href="assets/icons/atrium-ui-icons.svg#atrium-icon-processes"></use>
</svg>
```

Ícone precede o texto. Botão só com ícone precisa de nome acessível. Não usar emojis, fontes de ícones, bibliotecas externas ou SVG decorativo inventado quando há equivalente oficial.

Hover/focus devem mudar acabamento, não geometria. Em Lista/Kanban e controles adjacentes, não aplicar scale, margem negativa ou sombra externa que invada o vizinho. Verificar também a camada do indicador deslizante e `pointer-events`; o ícone não pode interceptar o clique.

Botão desabilitado continua legível e comunica por que não está disponível quando necessário. Foco de teclado permanece visível; não remover outline sem substituição acessível.

## 8. Modais, drawers e feedback

Use drawer para detalhe/configuração contextual e modal para uma decisão pontual. Reutilize o comportamento de foco do sistema: foco inicial, trap de Tab, Escape/X, restauração ao gatilho, fundo inerte e controle de scroll, conforme o contrato do componente. Reautenticação não deve ser fechada ou contornada fora de seu fluxo.

- Cabeçalho e rodapé compactos; corpo com rolagem quando necessário. O rodapé não cobre último campo, mensagem ou ação.
- Mensagem de validação aparece junto da ação/campo que a causou, sem uma área vazia enorme entre botão e resposta.
- Não abrir modal dentro de modal sem necessidade comprovada nem deixar backdrop órfão após trocar de view.
- Usar tokens de z-index: base 0, sticky 20, navigation 40, popover 60, overlay 80 e toast 100. Conferir stacking contexts; não solucionar tudo com `z-index: 999999`.
- Erro, conflito de persistência e resultado parcial devem ser duráveis quando exigem ação; toast não pode ser o único registro de uma falha importante.
- Progresso mensurável vem do backend. Sem total real, mostrar indeterminado, não porcentagem fabricada. `RUNNING` não vira falha só porque a janela demorou.

## 9. Responsividade e movimento

Referências desktop da spec: 1920×1080, 1920×1200 e 2560×1080. Para pressão de layout, verificar também 1538, 1186/1152 e 390px de largura, em light e dark. As suítes visuais do repositório usam 1440×900 (viewport principal), 1280×800, 1024×768 e 390×844; confira ao menos esses tamanhos quando a mudança tocar a tela correspondente. Viewports adicionais dependem da feature, não de um novo breakpoint arbitrário.

- Reorganizar colunas e toolbars quando falta espaço; não apenas reduzir fontes.
- Usar `minmax(0, 1fr)`, `min-width: 0`, wrap e limites de largura conscientemente. Texto longo não deve aumentar a largura da página inteira.
- Mobile empilha campos e cards, mantém ações tocáveis e drawer dentro do viewport. Tabela pode ter scroll local deliberado; scroll horizontal do documento não é uma solução.
- Na largura intermediária, conferir a combinação real sidebar + conteúdo + toolbar: é onde contadores e segmented controls frequentemente colidem.
- Motion atual usa tokens de 100–340ms para transições curtas e deslocamentos pequenos. Indicadores contínuos são outra categoria; preserve os existentes. Não animar altura/largura de tabelas nem fazer controles saltarem.
- Respeitar `prefers-reduced-motion`. Animação não pode atrasar disponibilidade ou esconder o estado do job.

## 10. Receita de trabalho para OpenCode

1. Declare o objetivo visual e o que não pode mudar funcionalmente. Confirme branch/status; preserve trabalho de outras frentes.
2. Leia este guia, a spec e os arquivos visuais do domínio. Identifique componente equivalente e tokens que vai reutilizar.
3. Esboce a hierarquia antes do CSS: o que é título, resumo, ação primária, filtro, conteúdo e detalhe? Elimine duplicação.
4. Faça a menor alteração no módulo responsável. Não despeje overrides em `portal.css`, não use estilos inline novos como atalho e não introduza framework/design system paralelo.
5. Cubra dados curtos/longos, zero/muitos itens e estados de permissão/carga/erro relevantes com fixtures sintéticas.
6. Valide view ativa, geometria, screenshots, interações e teclado. Corrija a causa de uma colisão, não esconda o elemento ou enfraqueça o teste.
7. Confira regressão em tela vizinha, temas e largura intermediária. Se assets alterados usam cache versionado, atualize o caminho de carregamento autorizado.
8. Entregue evidência objetiva: arquivos, cenários, testes executados, o que foi inspecionado e limitações. Publicar somente conforme autorização vigente; nunca reativar CI ou executar suíte global por causa deste guia.

## 11. Checklist de aprovação visual

Uma mudança de UI só está pronta quando os itens aplicáveis forem conferidos; marque “não aplicável” com motivo, não suponha aprovação:

- [ ] A view correta está ativa; não foi fotografada a landing/onboarding ou overlay por engano.
- [ ] Há hierarquia clara, sem títulos/contadores/ações competindo.
- [ ] Fontes, tokens, raios, sombras e SVG pertencem à família do ATRIUM.
- [ ] Controles da mesma linha estão alinhados; hover/focus não invadem vizinhos.
- [ ] Cards, filtros, títulos longos e chips não cortam conteúdo ou geram overflow global.
- [ ] Light e dark foram inspecionados, incluindo contraste dos estados.
- [ ] Desktop, largura intermediária e mobile foram conferidos; ações touch mantêm tamanho adequado.
- [ ] Tab, foco visível, Escape e retorno ao gatilho funcionam quando aplicável.
- [ ] Modal/drawer não deixa fundo interativo, rodapé sobreposto ou backdrop órfão.
- [ ] Loading, empty, sucesso, erro, parcial, permissão e conflito mostram estado real quando aplicáveis.
- [ ] Sem emojis, `&` decorativo, slogans técnicos, fonte externa nova ou ornamento desnecessário.
- [ ] Sem nova mutation, request duplicado, Store paralelo ou mudança de regra funcional causada pelo visual.
- [ ] Screenshot foi realmente observado; imagens iguais de views distintas foram investigadas.
- [ ] Resultado de teste focal não foi apresentado como CI completo, auditoria de acessibilidade ou validação humana final.

Use `getBoundingClientRect()`/computed styles nos testes sintéticos para medir alinhamento, sobreposição, viewport e overflow. Uma tolerância pequena de arredondamento (por exemplo 1–2px) é diferente de aceitar colisão visível. Teste o hover dos dois lados do segmented control, não só o estado inicial.

## 12. Onde buscar provas existentes

Escolha somente os testes do domínio e do comportamento alterado; os comandos abaixo são referências, não uma ordem para executar todos:

- `tests/integration_comments_layout.mjs`: Mail/INPI, geometria, drawer, temas, viewports e RBAC.
- `tests/ui_v2_tasks_layout_contract.mjs`: estrutura e geometria de tarefas.
- `tests/ui_v2_processes.mjs` e `tests/visual_ui_v2_processes.mjs`: tabela e inspetor.
- `tests/ui_v2_contacts_accessibility.mjs`: interação e acessibilidade de contatos.
- `tests/ui_v2_motion.mjs`: movimento e preferências relacionadas.
- `tests/ui_v2_iconography_accessibility.mjs`: ícones e nomes acessíveis.
- `tests/visual_ui_v2_<domínio>.mjs` e `tests/ui_v2_<domínio>_accessibility.mjs`: verifique os nomes efetivamente existentes no repositório antes de executar.

Testes usam dados sintéticos, não certificados/clientes/segredos reais. A ausência de erro no console ou um screenshot gerado não prova que a interface está bem resolvida. **Olhar, medir e operar o componente são três verificações complementares.**

## 13. Antes do primeiro ajuste: contrato visual da mudança

Registre brevemente na tarefa, antes de editar:

- View/rota e componente afetado; objetivo do usuário em uma frase.
- Componente existente de referência, com arquivo e seletor reais. Referência deve ser inspecionada, não presumida pelo nome.
- O que muda visualmente e quais comportamentos permanecem sujeitos à spec funcional.
- Estados que podem aumentar conteúdo ou alterar ações: erro, carregamento, nome longo, permissão, seleção, expansão.
- Larguras críticas, temas e telas que compartilham os seletores atingidos.

Capture ou inspecione o estado inicial no navegador antes de modificar um layout existente. O DOM e os estilos computados devem explicar qual regra produz o resultado atual. Em uma feature nova, compare com a referência escolhida. Nenhum componente isolado é aprovado sem ser visto no shell real, com sidebar, topbar, fonte carregada e largura de conteúdo efetiva.

Se o usuário pede corrigir um botão desalinhado, o alvo é esse alinhamento. Uma nova paleta, reorganização de navegação ou substituição da família de controles requer escopo correspondente. A ausência de um componente idêntico não exige inventar outra linguagem visual: componha as primitivas existentes.

## 14. Contratos detalhados por componente

### 14.1 Cabeçalho de página e toolbar

- Título identifica a área; kicker identifica o contexto; descrição explica apenas o necessário. Evitar três frases dizendo a mesma coisa.
- Separar grupo de identidade e grupo de ações. O título pode quebrar sem deslocar um botão para fora do container.
- O contador deve acompanhar seu título ou filtro, com largura intrínseca. Não aplicar `flex: 1` a badge por conveniência.
- Busca recebe espaço flexível; ações preservam largura útil; filtros podem migrar para outra linha de forma deliberada.
- Uma toolbar com título em duas linhas deve alinhar ações segundo uma regra consistente do módulo, não pela coincidência de um `margin-top` fixo.
- Sticky header precisa de fundo legível, limite de elevação e espaço reservado. Não cobrir âncora, primeira linha de tabela ou foco ao navegar por teclado.

### 14.2 Botões e grupos de ações

- Reusar as classes semânticas existentes. Botões irmãos com mesma importância têm mesma altura, peso de fonte e padding.
- Rótulo é verbo + objeto quando necessário: “Salvar preferências”, “Gerenciar cobertura”. Evitar “OK” para ações ambíguas.
- Ícone e texto compartilham eixo; SVG não encolhe quando o rótulo cresce. Usar `gap`, não espaços em branco ou caracteres invisíveis.
- Spinner de loading ocupa o lugar reservado do ícone; o botão não deve mudar bruscamente de largura nem deslocar os vizinhos.
- Double-click não pode iniciar operações duplicadas; disabled/loading seguem a autoridade funcional existente.
- Ação secundária pode ir para menu quando realmente secundária. Não esconder a principal para resolver falta de espaço.
- Estado destructive usa semântica própria; nunca reaproveitar vermelho de erro como destaque promocional.

### 14.3 Segmentados, tabs e chips

- Cada segmento tem área própria de clique e nome acessível. O indicador visual não ultrapassa a célula ativa.
- Hover de um segmento inativo não apaga a identificação do ativo. Focus-visible permanece identificável mesmo no ativo.
- Validar início, fim e movimento do indicador; `z-index` não corrige dimensões erradas.
- Tabs indicam seleção e painel correspondente; navegação não deve parecer um conjunto de botões todos primários.
- Chips comunicam estado, filtro ou categoria, com padding compacto. Categoria informativa não deve parecer um botão clicável.
- Contagem zero é um número legítimo; ausência de dado deve usar mensagem distinta, não inventar zero.

### 14.4 Cards, métricas e grades

- Card deve responder: o que é, em que estado está, o que posso fazer? Detalhes longos pertencem à superfície de detalhe quando há uma.
- Ícone de integração é um acento; não ocupa metade da largura de um card estreito.
- Métrica tem valor, unidade e contexto curto. Números de larguras diferentes não podem alterar o alinhamento da grade.
- Evitar grades com uma única célula esticada em uma linha inteira por regra genérica herdada.
- Cards iguais podem usar footer alinhado ao fundo; cards de natureza diferente não precisam de altura artificialmente idêntica.
- Ao remover uma seção vazia, remover também o espaço que ela reservava. Não deixar separador, margem ou título órfão.
- Não tornar todo o card clicável se ele já contém botões com ações distintas sem resolver semântica e propagação de eventos.

### 14.5 Tabelas, listas e Kanban

- Cabeçalho e células seguem o mesmo modelo de largura. Texto à esquerda; números comparáveis alinhados consistentemente; ações em coluna previsível.
- CNJ, datas e valores precisam permanecer interpretáveis. Se truncar o resumo, o detalhe completo deve ser acessível por teclado e toque.
- Use linhas secundárias para metadados, sem transformar cada linha em um parágrafo extenso.
- Scroll horizontal, quando indispensável, fica na região da tabela, identificável e utilizável. Colunas sticky não podem cobrir ações ou duplicar bordas de forma confusa.
- Linha selecionada, hover e foco são distinguíveis. Não usar apenas uma mudança quase imperceptível de cinza.
- Kanban mantém largura útil das colunas; muitas colunas rolam na região própria. Drag não substitui uma alternativa acessível já prevista pelo produto.
- Filtros vazios devem indicar que não há resultado naquele recorte; não afirmar que todo o acervo está vazio.
- Testar uma linha, muitas linhas e atualizações que mudam contadores. Badges e novos ícones não podem alterar a altura de forma descontrolada.

### 14.6 Formulários, selects e comboboxes

- Label persiste acima ou ao lado do campo conforme a família; placeholder não substitui label.
- Campo obrigatório, ajuda e erro devem ser associados ao controle e compreensíveis sem depender de cor.
- Colunas são agrupamentos semânticos: pares como OAB/UF ficam próximos e empilham corretamente em mobile.
- Largura acompanha o dado esperado. Não dar a UF a mesma largura de uma descrição extensa sem motivo.
- Mensagens longas expandem o grupo sem sobrepor o próximo campo. Não posicionar erro com coordenadas absolutas frágeis.
- Combobox abre por ação reconhecível, navega por teclado e fecha conforme seu contrato; a lista não fica cortada pelo overflow do modal.
- Mostrar validação perto da ação; preservar o conteúdo digitado após erro conforme o fluxo existente.
- Upload usa label e feedback claros, nome de arquivo com quebra/truncamento seguro e ação de substituição. Não expor caminhos locais ou segredos em mensagens.
- Autofill, campo preenchido, readonly, disabled e erro precisam ser legíveis nos dois temas.

### 14.7 Drawers, diálogos, menus e tooltips

- Reusar o controlador existente de overlay. Não implementar outro trap de foco concorrente nem aplicar `inert` ao próprio diálogo.
- Definir qual região rola; evitar três scrollbars verticais aninhadas sem necessidade. Header/footer fixos exigem corpo dimensionado corretamente.
- X deve ser alcançável em viewport baixo e mobile. Mensagem final e botão de salvar devem continuar visíveis/acessíveis após validação.
- Dropdown perto da borda deve reposicionar ou limitar a altura; não escapar da viewport.
- Tooltip complementa um nome, não contém a única instrução necessária. Deve funcionar com foco quando aplicável e não cobrir o alvo de forma persistente.
- Um drawer de leitura pode abrir edição pelo fluxo oficial. Não sobrepor uma segunda árvore de detalhes apenas para evitar fechar a primeira.
- Conteúdo sem permissão não pode ser recuperado visualmente por esconder um botão; preservar RBAC backend e tratamento de respostas negadas.

### 14.8 Autenticação, landing e administração

- Login, onboarding e aplicação são estados distintos. Validar cada estado alcançado pela mudança, sem assumir que a captura de login prova o dashboard.
- Landing pode ter escala editorial maior; suas classes não devem atingir a área operacional.
- Administração pode ter composição própria já existente. Compartilhar identidade não autoriza trocar seu CSS inteiro pelos estilos da aplicação.
- Formulários de autenticação preservam navegação por teclado, autofill e mensagens reais de erro. Decoração não encobre campos ou confirmação.

## 15. Conteúdo difícil faz parte do projeto

Use uma amostra sintética que contenha, conforme aplicável:

| Conteúdo/estado | O que observar |
|---|---|
| Título de duas ou três linhas | Cabeçalho cresce sem empurrar ações para fora |
| Palavra/URL sem espaços | Quebra localizada, sem alargar documento |
| Nome longo de tribunal ou arquivo | Identificação continua disponível no detalhe |
| Contador 0, 9, 99 e 9999 | Chip e toolbar mantêm geometria útil |
| Descrição ausente | Sem espaço ou separador órfão |
| Erro de várias linhas | Ação de recuperação continua acessível |
| Loading demorado | Layout estável, estado legível, sem sucesso presumido |
| Resultado parcial | Distinção entre o que concluiu e o que falhou |
| Usuário com menos permissões | Sem buraco de layout após ocultar ação restrita |
| Lista vazia e lista extensa | Empty state proporcional e scroll no lugar correto |

Não usar dados privados para tornar fixtures “realistas”. Não encurtar o texto de produção, ocultar coluna relevante ou remover um estado para fazer screenshot passar.

## 16. Engenharia de CSS para impedir regressões

- Inspecionar a origem de cada declaração problemática: stylesheet, seletor, media query, herança, estilo inline e ordem de carregamento.
- Corrigir na camada responsável. Um novo seletor global `.button`, `h3`, `label`, `svg` ou `section` pode afetar dezenas de telas: preferir escopo do domínio quando a mudança é local.
- Não acumular várias regras concorrentes para o mesmo estado no fim do arquivo. Consolidar a regra específica quando o escopo permite e preservar a cascade relevante.
- `!important` exige uma causa identificada de precedência e impacto delimitado. Não repetir `!important` até a aparência desejada surgir.
- Não usar `overflow: hidden` no documento para esconder um bug de largura. Não recortar foco, menu ou texto para cumprir um número de teste.
- `position: absolute` é adequado a adornos/overlays ancorados; não substitui grid/flex para alinhar conteúdo variável de formulário e toolbar.
- Conferir `box-sizing`, padding, border e gaps ao calcular larguras. `width: 100%` somado a padding fora do border-box é causa comum de overflow.
- Flex/grid precisam de limites mínimos coerentes; texto intrínseco pode impedir o encolhimento mesmo quando a coluna parece flexível.
- `transform`, `filter`, opacity e posicionamento podem criar stacking context. Inspecionar o contexto antes de subir z-index.
- Testar estilos computados depois de fonts/assets carregarem. Fallback de fonte pode mascarar ou criar quebras diferentes.
- Não introduzir dependência de rede para fonte/ícone disponível localmente.
- Não editar assets compilados/gerados como única correção quando há fonte responsável. Preserve IDs, atributos de acessibilidade e hooks usados pelos controladores/testes.
- Se precisar de novo token, justificar por que nenhum token semântico atual representa o papel. Não criar `--cor-nova-botao-azul` para uma exceção cosmética.

## 17. Acessibilidade como critério visual verificável

Metas de projeto: texto normal com contraste de pelo menos 4,5:1; texto grande e componentes/gráficos essenciais, 3:1. São critérios de aceitação a medir nas combinações usadas, não uma declaração de conformidade de todo o ATRIUM. Se um token existente falhar no contexto, documente o par e resolva no escopo correto; não modifique a paleta global incidentalmente.

- Navegar com teclado sem mouse: alcançar ações, perceber foco, abrir/fechar overlay e retornar ao ponto anterior.
- Zoom de 200% não pode tornar ações essenciais inacessíveis. Verificar reflow em largura estreita; conteúdo bidimensional, como tabela, pode usar scroll local intencional.
- Testar viewport de altura reduzida para modais, não apenas uma tela desktop alta.
- A ordem visual precisa acompanhar uma ordem DOM compreensível. CSS `order` não deve tornar o percurso de Tab imprevisível.
- Ícones de estado exigem nome/texto quando portam informação; decoração usa `aria-hidden`.
- Labels e textos dinâmicos não devem ser substituídos por `title` como única forma de acesso.
- Reduced motion preserva a informação de progresso, mesmo quando reduz animações.

## 18. Matriz de verificação proporcional ao impacto

Toda mudança visual deve ser observada no navegador. A extensão das verificações depende da superfície afetada:

| Tipo de alteração | Verificação mínima relevante |
|---|---|
| Texto/ícone local | View real, quebra de linha, light/dark, largura estreita, nome acessível |
| Card/formulário/toolbar | Desktop + intermediário + mobile, dois temas, conteúdo longo, foco e estados afetados |
| Modal/drawer/menu | Matriz anterior + altura reduzida, scroll, bordas, teclado, retorno de foco e overlay |
| Tokens, primitivas ou shell | Matriz anterior + telas consumidoras representativas: tabela, formulário, dashboard, integrações e autenticação |
| Loading/progresso/status | Estado inicial, ativo, terminal, parcial e falha de request; verificar ausência de mensagens contraditórias |

Use os viewports da seção 9 segundo o impacto: uma alteração de shell exige conferir também os desktops largos de referência; uma label local não exige executar todas as suítes do produto. Em media query alterada, confira imediatamente abaixo e acima do breakpoint, além dos tamanhos representativos.

Screenshots de regressão devem usar dados, viewport, tema, fonte e estado determinísticos. Desabilitar animação para uma comparação estática pode ser adequado; o comportamento animado continua exigindo sua própria inspeção. Não aumentar tolerância do diff de imagem para absorver uma mudança inexplicada.

Se não houver acesso a navegador ou não for possível alcançar o estado relevante, registre **validação visual pendente**. Não use “aprovado” ou “sem anomalias” como inferência baseada só no código.

## 19. Catálogo de anomalias e correção esperada

| Anomalia | Investigar primeiro | Correção a evitar |
|---|---|---|
| Lista/Kanban invade vizinho no hover | Dimensões, transform, sombra, indicador e stacking | Aumentar z-index ou esconder o ícone |
| Badge parece barra esticada | Flex-grow, width e grid track | Diminuir fonte do contador |
| Botões da toolbar em alturas diferentes | Align-items, padding, line-height e wrap | Margem negativa por botão |
| Card Mail ocupa linha inteira sozinho | Grid-column herdado e ordem da grade | Width fixa que quebra no mobile |
| Texto some em dark | Token herdado, inline style, fundo real | `filter: invert()` na página |
| Erro aparece muito abaixo do botão | Margens, min-height e grid placement | Posicionar mensagem por pixels absolutos |
| Último campo fica sob rodapé | Altura do corpo e scroll region | Ocultar overflow do modal |
| Dropdown é cortado | Overflow ancestral e contexto de camadas | Z-index enorme dentro do mesmo recorte |
| Nome longo alarga toda a página | Min-content, min-width, overflow-wrap | `overflow-x: hidden` no body |
| Botão mostra sucesso com job em erro | Fonte do estado e renderização terminal | Trocar só a cor ou a mensagem |
| Ícone vira quadrado/caractere estranho | Referência do sprite, símbolo e carregamento | Colocar emoji de fallback |
| Screenshot parece correto, clique falha | Backdrop, pointer-events, hit target e foco | Forçar clique em todos os testes |

Os exemplos são hipóteses de diagnóstico, não receitas automáticas. Confirme a causa com DOM, estilos computados e interação antes de editar.

## 20. Critério de bloqueio e conclusão

Bloqueiam declarar a UI pronta: controle encoberto/inacessível; conteúdo essencial cortado; sobreposição involuntária; overflow global; foco perdido ou invisível; tema ilegível; label que contradiz estado real; quebra de permissão; regressão no componente de referência.

Refinamentos como um alinhamento secundário levemente desigual também devem ser corrigidos quando estão no lote. Não chamar um defeito visível de “preferência estética” sem examinar a consistência da família.

Ao encontrar problema:

1. Identifique o menor cenário que o reproduz.
2. Localize a regra/controlador responsável.
3. Corrija mantendo o contrato funcional.
4. Confira o cenário original e o vizinho afetado, inclusive outro tema/largura quando pertinente.
5. Atualize a evidência final. Não reutilize screenshot anterior à correção como prova da versão nova.

Nenhum documento torna impossível uma regressão. A obrigação operacional é não concluir por confiança: inspecionar, medir, interagir e registrar as limitações. “Não observei falha nos cenários X” é uma afirmação verificável; “nunca haverá anomalia” não é.

## 21. Registro obrigatório de entrega visual

Inclua na resposta/checkpoint da missão, de forma proporcional e sem criar outro sistema de documentação:

```text
Mudança visual:
Componente de referência (arquivo/seletor):
Arquivos alterados:
View/rota realmente inspecionada:
Temas e viewports conferidos:
Estados e conteúdo difícil conferidos:
Interações/teclado conferidos:
Geometria/overflow/hover:
Testes focais executados e resultado:
Screenshots observados (quando gerados):
Limitações ou cenários pendentes:
Conclusão: validado nos cenários descritos / validação visual pendente.
```

Não preencher com frases genéricas ou checks automáticos. Se houve apenas alteração documental, diga isso: a documentação pode ser revisada sem abrir a aplicação, executar testes de produto, alterar a interface ou publicar.

Instrução curta para iniciar uma missão no OpenCode:

> Leia integralmente `AGENTS.md` e `docs/ui-v2/VISUAL_IMPLEMENTATION_GUIDE.md` antes de editar UI. Identifique a referência existente e os tokens do domínio. Implemente dentro dessa família, verifique a matriz aplicável e entregue o registro da seção 21. Corrija anomalias observadas antes de declarar a interface pronta; se não puder verificar no navegador, informe exatamente o que ficou pendente. Encaminhe essa mesma obrigação aos subagentes que receberem trabalho visual.

## 22. Conferência visual no sistema real: print lido é obrigatório

Regra: **print tirado não é print visto.** A validação visual só existe quando o agente **abre e lê a imagem** do sistema real. Medição de geometria (overflow, clipping, colisão, alvo de toque, contraste) é complementar e **nunca substitui** a leitura da imagem. Se nenhum screenshot foi lido, o resultado correto a declarar é "validação visual pendente", jamais "aprovado".

### Por que esta seção existe

Em 2026-09-29 a varredura geométrica reportou `overflow: -10`, `colisoes: []` e `cortados: []` em telas que o operador reprovou em dez segundos ao olhar: selects cortados no celular (`"Todas as publ⌄"`), ícone vazando do botão (`"Classificar pendentes"`), abas de filtro fora da tela, rótulo quebrando no meio da palavra (`"expedição/pagam ento"`), filtro novo inalcançável e colisão entre faixa de abas e ações no desktop. Nenhum desses casos quebra overflow de container, então a métrica não os vê. O olho vê.

### Protocolo

1. **Perfil em teste.** Confirme em qual perfil a sessão foi criada. No perfil mobile do agente a sessão de desktop responde `401` e cai na tela de login — isso é limitação do teste, não defeito do produto; faça o login **já no perfil mobile** antes de coletar.
2. **Navegue pela rota da aplicação** (função de troca de view). Navegar por URL em SPA produz tela inválida para conferência.
3. **Tire o print de cada view**, viewport e página inteira quando o conteúdo passar da tela.
4. **Abra e leia a imagem** (o agente é multimodal): descreva hierarquia, cortes, colisões, alinhamento, tom de cor e estados. É desta leitura que saem os defeitos.
5. **Confira números contra a fonte**: contadores do painel × contagem da API. Tela bonita com número errado é defeito crítico.
6. **Liste os defeitos com status** (`identificado` / `corrigido` / `aguardando decisão do operador`) e corrija **um por um**, re-tirando o print e **olhando de novo** para confirmar.
7. **Entregue os dois perfis**: desktop (~1250px) e mobile (390px), com light/dark quando a mudança tocar cor.

### Proibido

- Declarar aprovação visual com base apenas em geometria, testes automatizados ou fixture.
- Dizer "não encontrei defeitos" sem ter lido os prints do painel real.
- Usar varredura de fixture como prova de comportamento do painel de produção.
- Reduzir fonte abaixo de 16px para "caber" no celular: o piso é anti-zoom do iOS. O certo é reorganizar (empilhar, quebrar linha, uma coluna).

### Registro

No card da seção 21, o campo de screenshots passa a exigir conteúdo:

```text
Screenshots lidos (arquivo → o que foi observado):
Defeitos identificados (com status):
Re-print após correção (arquivo → o que mudou):
```
