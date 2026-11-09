# ATRIUM — Guardrails para agentes de programação

Este arquivo define regras permanentes para qualquer agente que trabalhe neste repositório.
Ele é um conjunto de guardrails de desenvolvimento, não documentação completa do produto.
Em caso de conflito entre uma tarefa e estas regras, pare e peça orientação explícita.

## Termo proibido (regra global, sem exceção)

- É terminantemente proibido o adjetivo derivado de "cânone" em qualquer gênero, número ou grau — incluindo a forma feminina singular e plural, a masculina singular e plural e o advérbio —, bem como o mesmo adjetivo em inglês.
- Não use o termo em respostas, código, nomes de funções ou arquivos, comentários, documentação, mensagens de interface, commits, relatórios ou qualquer arquivo gerado.
- Quando o sentido for necessário, use termo concreto em português: "oficial", "padrão", "de referência", "fonte única", "normativo", "definitivo" ou "consolidado", conforme o caso.
- Esta regra vale em todos os projetos e não admite exceção por estilo, hábito ou conveniência.

## Português brasileiro: redação e terminologia de produto

- Toda comunicação dirigida ao usuário (telas, mensagens, relatórios, e-mails, ajuda e respostas do agente) deve ser escrita em português brasileiro natural, correto e profissional. Evite traduções literais do inglês ou de outros idiomas.
- Prefira frases curtas, ordem direta, verbos concretos e nomes familiares à prática jurídica e à gestão de escritórios. Não use linguagem excessivamente solene, propaganda, metáforas técnicas ou jargão de engenharia na interface.
- Exemplos de substituição em texto voltado ao usuário: "materializar prazo" → "registrar o prazo"; "hidratar os dados" → "carregar os dados"; "egresso ao provedor" → "envio ao serviço"; "poda de registros" → "remoção de registros"; "bucket" → "grupo"; "fallback" → "alternativa"; "trilho de elegibilidade" → "verificação dos requisitos"; "projetar acesso" → "aplicar as permissões de acesso".
- Em logs e documentação de engenharia, termos técnicos consagrados podem ser usados quando aumentarem a precisão. Não traduza nomes de APIs, campos, identificadores de código, comandos ou contratos existentes por razões estilísticas.
- Use os termos jurídicos com sentido exato: intimação, citação, ciência, publicação, prazo processual, data informada pelo tribunal, vencimento e tarefa não são sinônimos. Não escreva que o ATRIUM praticou ato oficial quando apenas registrou informação.
- Botões e mensagens devem explicar a ação ou o estado de forma direta: "Conferir prazo", "Nenhuma tarefa encontrada", "Não foi possível importar o arquivo". Evite rótulos vagos e mensagens que ocultem a causa de uma falha conhecida.
- Preserve acentuação, crase, concordância, capitalização e plural. Use "você" e "seu escritório" quando adequado ao contexto; evite regionalismos na interface pública.
- Ao concluir alterações que atinjam textos visíveis, revise manualmente a redação das strings modificadas e confira consistência terminológica entre interface, notificações e relatórios.
- Se uma tradução soar artificial, reformule a frase inteira em português natural em vez de trocar palavras isoladas.

## 1. Produto e identidade

- O nome do produto é **ATRIUM**. Este repositório é a edição open-source, self-hosted e MIT do ATRIUM.
- O nome **Atrium Senda** refere-se à edição aberta e ao pacote de distribuição; nos textos de interface, o produto chama-se ATRIUM.
- Não introduza branding próprio de terceiros nem nomes internos do produto hospedado.
- Use nomenclatura própria e neutra do ATRIUM. Integrações oficiais e tecnologias externas podem ser nomeadas quando tecnicamente necessário.
- Identificadores concorrenciais legados só podem permanecer em uma camada mínima de compatibilidade, nunca na interface ou em estado persistido novo.
- Não reescreva o histórico Git para remover referências antigas.


## 2. Git, branches e checkpoints

- A branch principal é `main`. Trabalho em andamento acontece em branches de curta duração a partir de `main`.
- Nunca altere `main` sem instrução explícita. Refatorações estruturais usam branches próprios.
- Nunca mova tags ou branches de checkpoint sem instrução explícita; elas são referências de recuperação.
- Nunca faça force push por iniciativa própria.
- Prefira operações Git não destrutivas e preserve trabalho local não identificado.


## 3. Baseline validada sem dependência de CI

Antes de iniciar feature, refactor ou mudança relevante, confirme:

- working tree limpo;
- branch correta;
- HEAD local e upstream auditados, sem divergências não identificadas;
- baseline = último SHA promovido com validação local documentada + produção saudável (`GET /api/health` respondendo com `commitSha` coerente e frontend no mesmo SHA auditável).

GitHub Actions não é evidência exigida. Se o teste local do escopo estiver vermelho ou a produção não estiver verificada, diagnostique e corrija a falha antes de iniciar trabalho dependente. Uma missão autorizada de correção pode prosseguir com essa correção, preservando as assertions e proteções.
Não acumule refactors sobre um commit com teste local vermelho no escopo.
Um teste isolado verde não substitui a regressão do domínio tocado.

## 4. Um objetivo por commit

- Cada commit deve ter uma responsabilidade clara.
- Não misture refactor, bugfix, feature, redesign ou limpeza de branding.
- Só combine categorias quando forem tecnicamente inseparáveis e isso estiver justificado.
- Mantenha a aplicação executável entre ciclos incrementais.
- Não esconda mudanças funcionais dentro de commits descritos como refactor.

## 5. Tecnologia e simplicidade

O frontend atual usa Vanilla JavaScript, HTML, CSS e APIs nativas do navegador.

Não introduza sem autorização:

- React, Vue, Angular, Svelte ou Next;
- Vite, Webpack, Rollup, framework SPA ou bundler obrigatório;
- microserviço, fila, banco externo ou framework pesado sem necessidade comprovada.

Evite overengineering.
O sistema deve continuar simples de instalar, operar, depurar e recuperar.

## 6. Direção da modularização frontend

A direção arquitetural aproximada é:

```text
js/
  app/
  core/
  components/
  views/
  features/
```

Essa estrutura é orientação, não obrigação de criar arquivos vazios.
Não fragmente o código artificialmente apenas para reduzir contagem de linhas.
Separe módulos por responsabilidade real, coesão e dependências claras.

## 7. Hotspots do frontend

- `js/portal.js` é um hotspot atual.
- À medida que módulos existirem, não adicione grandes blocos novos a `portal.js`.
- `portal.js` deve evoluir para bootstrap, orquestração e compatibilidade temporária.
- `css/portal.css` é um hotspot atual e será modularizado incrementalmente.
- Refactor de CSS não deve alterar a aparência incidentalmente.
- Preserve ordem de cascade, especificidade e temas light/dark.
- Não despeje megablocos de overrides no fim de `portal.css` quando houver módulo apropriado.
- `index.html` deve evoluir para shell da aplicação.
- Não reintroduza grandes templates de feature no HTML depois que a feature for modularizada.
- Não antecipe extrações de template antes de existir um módulo responsável.

## 8. Core e dependências

- Separe código compartilhado por responsabilidade: store, API, datas e utilidades específicas.
- Não transforme `utils` em depósito genérico de funções sem domínio.
- Mantenha funções próximas do domínio quando não forem verdadeiramente compartilhadas.
- Prefira dependências explícitas.
- Evite novos globals em `window`, singletons desnecessários e imports circulares.
- Evite ciclos como `Store → App → Store`.
- Não crie `window.AlgumaCoisa` sem necessidade comprovada.

## 9. Compatibilidade legada

Podem existir consumidores de `window.Atrium`, `window.AtriumSenda`, `window.JurisFlow`,
`window.KellerCentral` e `window.portalApp`.

Antes de remover qualquer global, pesquise consumidores com `git grep` ou `rg` em HTML,
JavaScript e testes.

Durante a migração, mantenha wrappers finos e documentados quando necessários.
Não use compatibilidade temporária como justificativa para criar novos globals.

## 10. Store, persistência e proteção de dados

O Store e o estado do backend são críticos.
Preserve `revision`, `expectedRevision`, atomic save, state migrations, recovery,
backups pré-migração, criptografia, coalescing e serialização de writes.

Não crie um segundo Store ou sistema de estado paralelo.
Não esconda resposta `409`, falha de persistência ou lost update.
O frontend não deve fingir sucesso quando o backend falhou.
Mudanças no formato de armazenamento exigem backup, validação e teste de restauração.
Nenhuma migration pode ser destrutiva sem mecanismo explícito de proteção.

## 11. Backend como source of truth

Para dados sensíveis ou oficiais, o backend é a autoridade.
Isso inclui authenticated actor, role, permissões, conteúdo de publicação usado em e-mail,
revision e dados internos de usuários.

Não confie em valor do frontend quando o servidor puder determiná-lo autoritativamente.

## 12. Backend e rotas

- `server.mjs` é um hotspot atual.
- Depois que existir infraestrutura de rotas, não adicione grandes endpoints diretamente nele.
- A direção futura aproximada é `lib/http/` e `routes/`.
- `server.mjs` deve evoluir para bootstrap, serviços e registro de rotas.
- Não introduza framework HTTP pesado sem necessidade e autorização.
- Não mova endpoints apenas para aumentar quantidade de módulos.

## 13. Segurança e privacidade

Nunca enfraqueça para fazer testes passarem CSRF, MFA/TOTP RFC 6238, sessões,
cookies seguros/HttpOnly, RBAC, AES-256-GCM, rate limits ou proteção de arquivos privados.

Nunca commite ou registre em log `.env`, senhas, API keys, TOTP secrets, recovery codes,
private keys, PFX, cookies, tokens, dados pessoais ou dados reais de clientes.

## 14. Dados e fixtures de teste

- Fixtures devem ser claramente sintéticas.
- Não use CPF, OAB, processo, cliente, e-mail pessoal ou telefone reais.
- Prefira `Advogada Teste`, `Cliente Teste`, `teste@example.test` e `OAB/RS 000000`.
- Nunca use certificado real em teste.
- Não copie dados de produção para reproduzir falhas localmente.

## 15. Publicações e ciência judicial

Preserve a distinção entre read/unread, `treatmentStatus` e ciência judicial oficial.

Os estados atuais de tratamento são `untreated`, `in_review`, `treated` e `discarded`.

Publicação tratada no ATRIUM não significa ciência judicial.
Não automatize ciência nem use texto de interface que confunda esses conceitos.
O backend deve ser a autoridade das transições de tratamento.

O discovery judicial oficial deve encadear DJEN → número CNJ → DataJud → processo e
contatos para todos os termos monitorados. Preserve campos manuais melhores, deduplique
por identidades estáveis e mantenha todas as associações quando mais de um advogado for
localizado. Discovery é somente leitura: nunca abra prazo, envie e-mail ou pratique ato
processual automaticamente.

## 16. Prazos jurídicos

- A preferência do escritório `settings.deadlineMode` decide o fluxo: `auto` (padrão) aplica o prazo declarado pela fonte oficial (eproc/PJe — `sourceReportedDeadlineAt`) automaticamente ao registro e à tarefa correspondente, com `deadlineSource` preservado; `manual` mantém a data da fonte como referência e exige confirmação humana antes de virar prazo.
- Ajustes de contagem (embargos e similares) são edição manual do usuário e prevalecem sobre a fonte em qualquer modo.
- Nunca infira deadline por regex, heurística ou texto da publicação em nenhum modo (DJEN sem data de fonte permanece sem deadline até registro manual).
- Não reintroduza regras como `Recurso = 15 dias`, `Embargos = 5 dias` ou `Prazo Geral = 15 dias`.
- `fatalDeadline` permanece decisão humana; estimativa nunca é apresentada como prazo fatal.
- Hierarquia de fontes de prazo: eproc/PJe são verdade absoluta; o Domicílio Eletrônico é redundância e sua data entra apenas como referência (`sourceReportedDeadlineSource: 'domicilio'`, sem aplicação automática) e `dataFinalCiencia` nunca é `deadline`. Divergência entre fontes se resolve pelo eproc, sem rebaixar a data humana já confirmada.

## 17. E-mail

- O `EmailService` é o único transporte SMTP autorizado para e-mails de Publicações. Não crie caminho SMTP paralelo.
- O endpoint removido `/api/email/publications` não deve ser reintroduzido.
- O frontend nunca deve fornecer conteúdo judicial como source of truth para envio.
- O envio individual usa a arquitetura oficial baseada em ID: `POST /api/intimations/email`, com o alias `POST /api/publications/email`.
- Antes do envio individual, o backend resolve a publicação oficial persistida.
- O envio em lote usa `POST /api/publications/email/batch` e recebe somente os identificadores das publicações e o destinatário, nunca objetos judiciais completos como autoridade.
- No envio em lote, o backend também resolve as publicações oficiais persistidas.
- Todo envio de publicação por e-mail exige autenticação, perfil `admin` ou `master_admin` e proteção CSRF.
- O envio manual de conteúdo judicial completo continua exclusivo do `EmailService`, baseado em IDs, com admin/master_admin e CSRF. A exceção autorizada é o bloco recolhido de íntegra oficial em boletim de publicação, apenas para destinatário com acesso, sem anexos e sem alterar prazo, tratamento ou ciência.
- Boletins operacionais (contagens, referências, trechos higienizados e, para publicação oficial com processo e acesso do destinatário, a íntegra em bloco recolhido, sem anexos) usam somente o pipeline oficial `NotificationService → outbox → worker → Resend`, não um segundo SMTP. A cadência aprovada é `BULLETINS`, às 08h/14h/20h BRT, no máximo um boletim lógico por horário/destinatário e três por dia; opt-outs permanecem válidos. Nenhum evento operacional gera e-mail avulso. `PASSWORD_RESET` e `SYSTEM_TEST` são transacionais separados, com quotas próprias; detalhes e gates em `specs/email-policy.md`.
- A íntegra recolhida usa o texto oficial persistido, escapado, sem anexos, nunca para publicação privada/restrita e nunca altera prazo, tratamento ou ciência. Clientes de e-mail sem suporte a `<details>` podem exibir o bloco expandido; isso é limitação do cliente, não mudança de contrato.
- Não reintroduza `SMTP_HOST`, `SMTP_USER` ou `SMTP_PASS` como segundo transporte específico para Publicações, fallback Gmail ou fallback `mailto` contendo conteúdo judicial.
- Nunca defina endereço pessoal hardcoded como destinatário default ou fallback.

## 18. Segurança de arquivos estáticos

- Não transforme o servidor em static hosting irrestrito.
- Autorize explicitamente novos diretórios frontend.
- Preserve validação contra path traversal.
- Bloqueie acesso a `..`, `data/`, `.env`, `.git/`, `lib/`, `tests/` e arquivos sensíveis.
- Inclua testes de segurança quando a allowlist ou o resolvedor de paths mudar.

## 19. Testes locais

A validação é local, dirigida ao escopo alterado e sem dependência de GitHub Actions.

- Antes de commitar: `node scripts/check-syntax.mjs` (equivalente a `pnpm check`).
- Rode as suítes locais focadas no escopo alterado, sempre com diretório de dados sintético.
- Suítes longas (`pnpm test` completo, Visual QA, `tests/judicial_sandbox.mjs`/A1) rodam sob demanda: ao tocar UI, judicial, A1, persistência ou segurança, e antes de promoção relevante.
- É proibido fingir A1 no Linux; a suíte A1 completa só é válida em execução local explícita no Windows.
- Não remova assertions para obter verde.
- Teste local vermelho no escopo bloqueia commit e deploy daquele escopo.
- Não aumente timeout como primeira solução para race condition. Prefira sincronização com eventos reais: resposta HTTP, estado do DOM e estado persistido.
- Não trate syntax check como prova de comportamento correto.

## 20. Visual QA

- Antes de criar ou alterar qualquer interface, leia integralmente `docs/ui-v2/VISUAL_IMPLEMENTATION_GUIDE.md` e aplique seu checklist. Isso vale para OpenCode, Codex e subagentes; encaminhe o guia em toda delegação visual.
- Screenshot gerado não é prova suficiente.
- Valide a view ativa, overlays inesperados e layout.
- Detecte screenshots duplicados quando views deveriam ser diferentes.
- Teste onboarding separadamente das views normais.
- Preserve temas light e dark e os viewports cobertos.

## 21. Integração judicial A1

- A autoridade da suíte A1 completa é a execução local explícita no Windows: `node tests/judicial_sandbox.mjs`, sob demanda (§19).
- Não finja full A1 no Linux. Linux valida apenas partes realmente cross-platform.
- Nunca use certificado, senha, CPF ou chave real em testes A1.
- Toda função executada via `page.evaluate` deve ser autossuficiente (sem imports, closures ou helpers externos) e recebe **um único argumento**; o Playwright recusa a assinatura com múltiplos argumentos ("Too many arguments") e o erro derruba a extração inteira em silêncio. Prefira `page.evaluate(fn, { ... })` e valide com teste focado antes de considerar a coleta corrigida.
- Não enfraqueça a suíte A1 local para simplificar refactor.

## 22. Regras de refactor

Refactor deve preservar comportamento, schema, API e visual, salvo autorização expressa.

Se encontrar bug fora do escopo, documente-o no relatório.
Não corrija silenciosamente.
Não substitua um monólito por microarquivos sem responsabilidade real.
Também não crie um novo monólito dentro de um único módulo.
Divida por responsabilidade, não apenas por quantidade de linhas.

## 23. Fluxo obrigatório de trabalho

O fluxo normal é:

```text
alteração
→ testes locais focados
→ commit
→ deploy
→ próxima fase
```

Não inicie a próxima fase antes de encerrar o ciclo anterior com os testes do escopo verdes e o deploy validado quando houver publicação. Os workflows em `.github/workflows/` permanecem apenas para `workflow_dispatch` manual e não são passo do fluxo.

## 24. Documentação e contexto

Antes de qualquer mudança arquitetural, de regra de negócio, persistência, segurança ou integração, leia o índice `specs/README.md` e todas as especificações oficiais relevantes ao domínio alterado.

- A especificação descreve o contrato atual; o código e os testes apontados nela são a autoridade executável.
- Não implemente comportamento marcado como `FUTURE` sem autorização explícita e uma missão própria.
- Se código, teste e spec divergirem, não escolha silenciosamente um deles: audite a autoridade oficial, corrija a contradição no mesmo escopo ou pare e reporte.
- Mudança funcional aprovada deve atualizar a spec relevante e seu teste de contrato.

Quando relevantes para a missão, consulte:

- `docs/development/DEVELOPMENT_MASTER_PLAN.md`;
- `docs/development/ROADMAP.md`;
- `docs/development/DECISIONS.md`;
- `docs/development/BETA_READINESS.md`.

Atualize documentação apenas quando estiver no escopo autorizado.
Não transforme este arquivo em documentação extensa do produto.

## 25. Relatório de missão

Ao final de missão relevante, informe HEAD anterior e novo (SHA), arquivos alterados,
mudança funcional, comandos locais executados com seus resultados, riscos e dívida técnica observada.

## 26. Parada obrigatória

Pare e informe antes de continuar quando houver working tree inesperadamente sujo,
teste local do escopo vermelho ou baseline de produção não verificada, premissa incorreta,
risco de perda de dados, migration conflitante, necessidade de mudança fora do escopo ou
dúvida sobre material sensível.

Não contorne uma condição de parada com reset, remoção de teste ou mudança incidental.

## 27. Publicação autorizada

- Antes de publicar: diff auditado do lote, regressão do domínio tocado e suítes locais aplicáveis verdes (§19).
- Exclua dados privados do pacote; mantenha versão, instalador e notas de release coerentes.
- Publique sem force push. Diferencie release no GitHub de qualquer serviço implantado em outro lugar: este repositório não hospeda produção.


## 28. Distribuição e releases

1. **Distribuição exclusiva por releases**: o ATRIUM Senda é distribuído por tags `vX.Y.Z` no GitHub, com instalador Windows assinado por SHA-256 (sem assinatura Authenticode nesta edição) e notas por release.
2. **Nenhuma produção vive neste repositório**: instalações são self-hosted, gerenciadas por quem instala. Nenhum segredo, cofre ou dado de produção de instância alguma entra no repositório.
3. **Cadência de release**: todo lote publicado nasce com versão nova, notas `docs/RELEASE_NOTES_<versão>.md` e entrada no `docs/CHANGELOG.md`.


## 29. Proibição Absoluta de Emojis e Uso Obrigatório da Paleta Própria de Ícones SVG

1. **Proibição Total de Emojis Unicode**:
   - É expressamente proibido inserir qualquer emoji unicode (tais como 🔄, 📋, ⚡, ⚖️, 🛑, etc.) em botões, abas, cartões, listas, cabeçalhos, formulários, modais, tooltips ou mensagens do sistema.
   - O sistema Atrium é uma plataforma jurídica corporativa premium e deve manter rigor estético e visual uniforme.

2. **Uso Exclusivo da Biblioteca Própria SVG**:
   - Todos os ícones visuais devem ser renderizados via SVG a partir do sprite oficial do projeto em `assets/icons/atrium-ui-icons.svg`, usando a sintaxe padronizada:
     `<svg class="atrium-icon" aria-hidden="true"><use href="assets/icons/atrium-ui-icons.svg#atrium-icon-[nome]"></use></svg>`.
   - Ao criar ou modificar botões com ícone e texto, o elemento SVG deve anteceder o rótulo de texto e ser acompanhado pelas classes de dimensionamento adequadas (`atrium-icon`, `btn-icon`, etc.).
   - Ícones devem harmonizar com a paleta nobre do Atrium (dourado escovado `#DFBE6A`, tons de carvão e acentos metálicos elegantes).

## 30. Runtime e isolamento do plano de administração

- Confira `package.json`: o runtime requer Node.js >= 24 (inclui `node:sqlite`) e a versão de pnpm declarada em `packageManager`. Instale com `pnpm install --frozen-lockfile`.
- `pnpm start` e `pnpm dev` executam `node server.mjs`; `pnpm check` faz verificação de sintaxe, não lint semântico ou typecheck. Não invente scripts ausentes. `pnpm build:cloud` gera `dist` com `ATRIUM_API_BASE_URL`; confira o conteúdo do artefato e a configuração do hosting antes de publicá-lo.
- Verifique o proprietário do servidor local e use diretório de dados sintético antes de iniciar/reiniciar processos ou executar testes que persistem estado.
- A administração do escritório (usuários, diagnóstico, auditoria) fica em **Configurações**, protegida por papel no servidor; não há plano de administração de plataforma neste repositório.

- Não execute factory reset em conta ou dados reais para validar implementação. Documente falhas e teste com fixtures sintéticas, sem restaurar/copiar bancos privados como fixture.

## 31. Publicações, sincronização e fonte de verdade

- O resultado do sync judicial (DJEN/CNJ, DataJud, INPI, eproc) é persistido no estado oficial do workspace pelo próprio servidor, dentro da fila de escrita do app-state (enqueueAppStateMutation), antes da resposta HTTP. O flush do navegador não é caminho único de persistência; digest de e-mail e painel devem sempre convergir.
- Divergência entre o que o e-mail informa e o que o painel exibe é incidente de contrato: corrija o caminho de persistência (backend como autoridade) e cubra com teste de contrato, sem 'consertar' apenas o frontend.
- Contadores de pendência (badge lateral e cards "Não tratadas"/"Em análise") refletem todo o acervo, independente da data; "tratadas hoje/descartadas hoje" usam o dia corrente; Activity Inbox e alertas de novidade permanecem na janela móvel de dois dias civis (`specs/publication-treatment.md`).
- Janela de captura DJEN: 60 dias na primeira captura por workspace (marcador durável djen-sync.json), 2 dias nas seguintes, com agendador 07h/12h/19h BRT e botão manual; nunca reintroduzir watermark fixo global. Falhas por termo/OAB são reconciliadas na fila durável `djen-capture-errors.json` a cada execução; o retry manual reconsulta apenas termos pendentes e nunca avança o marcador. Sincronização completa só roda no primeiro acesso (conta recém-criada), nos ciclos silenciosos do servidor (07h/12h/19h) ou no botão manual: recarregar a página, abrir nova aba ou repetir a autenticação nunca dispara coleta.
- O Domicílio Eletrônico (PDPJ/Jus.br) é fonte de **redundância declarada** de intimações e roda **no servidor** (cloud-first, sem instalação local): `lib/judicial/domicilio/domicilio-runner.mjs` autentica no SSO do PDPJ com o Certificado A1 do cofre do workspace em navegador headless, lê a sessão da própria página e chama a API oficial somente leitura. Janela de 7 dias na primeira captura por workspace e 2 dias nos ciclos (marcador durável `domicilio-sync.json`), com execução agendada nos ciclos 07h/12h/19h BRT (após o sweep eproc) e rota manual autenticada `POST /api/judicial/domicilio/sync`. `informar ciência` e qualquer escrita no portal são proibidos; prazo declarado entra como referência (`sourceReportedDeadlineSource: 'domicilio'`) e `dataFinalCiencia` como `noticeDeadlineAt`; o eproc continua verdade absoluta do prazo e a ciência no portal nunca vira tratamento no ATRIUM. O portal do PDPJ recusa IPs de nuvem (403): configure `DOMICILIO_PROXY_URL` com uma sa?da aceita; sem isso o ciclo ? `PORTAL_BLOCKED` declarado, nunca falso sucesso.
- A Fábrica de Cálculos (TRF3/PDPJ-Br) é a fonte oficial de índices, leitura documental e cálculos RGPS: `FC_API_KEY` opcional no ambiente do servidor, somente leitura, cotas por minuto com `429`/`Retry-After` e falha fechada sem chave (`FABRICA_NOT_CONFIGURED`). Payload documental com PII nunca é logado nem persistido pela integração, e extração oficial não substitui conferência humana nem abre prazo, ciência ou ato.
- A execução da automação eproc/A1 na nuvem (VPS) é decisão operacional vigente do operador; não introduzir bloqueio por modo nuvem, quota de CPU ou remoção do fluxo sem autorização explícita.

## 32. Segurança: invariantes de endurecimento

- CSRF é obrigatório em TODA mutação autenticada (inclusive aprovações de suporte do escritório); nunca tornar a checagem condicional à presença do header.
- O login do plano de administração tem throttle por IP de socket e por identidade (com `Retry-After`); MFA permanece opcional por decisão do operador. A decisão de rate limit usa o socket, nunca `X-Forwarded-For`.
- Limitadores de autenticação são persistidos em `security.json` (sobrevivem a restart); TOTP é anti-replay por passo monotônico; mensagens de falha não distinguem senha de TOTP.
- O servidor mantém trava de instância única por diretório de dados (lock em diretório temporário, chaveado pelo hash do data dir, com recuperação de lock órfão). Não iniciar dois processos no mesmo data dir.
- CSP é servida pelo servidor local (`script-src 'self'`, `object-src 'none'`). Não introduzir scripts/handlers inline nem remover a CSP sem revisão; `style-src` mantém `'unsafe-inline'` até a migração de estilos inline.
- Conteúdo externo (publicação/DJEN/INPI/importação) nunca entra em HTML/atributo sem escape; e-mails escapam todos os campos, inclusive datas, e assuntos removem CR/LF.
- Pendências de rate limiting na fronteira judicial (DJEN agendado com guarda in-flight, CSRF das rotas INPI de monitores, cooldowns de omni/sidecar/eproc/sync, lock do cofre judicial) ficam na janela de eproc/sincronização; ao tocá-las, aplicar os mesmos invariantes desta seção.

## 32. Seguranca: invariantes de endurecimento

## 33. Identificação de sessão e frentes

- Toda sessão de trabalho neste repositório começa com um resumo do objetivo, do estado da branch e do que está fora de escopo.
- Frentes oficiais em uso: `ATRIUM — Publicações/DJEN`, `ATRIUM — eproc/A1`, `ATRIUM — UI V2`, `ATRIUM — Notificações/E-mail`, `ATRIUM — PJe Nacional`.
- Frentes diferentes não devem misturar escopos: um objetivo por commit continua obrigatório (§4).

## 34. Contexto do produto

- Uma sessão nova deve ler `README.md`, o índice `specs/README.md` e a spec do domínio afetado antes de agir.
- O ATRIUM Senda é a edição aberta, self-hosted, sem serviço oficial hospedado neste repositório. O serviço hospedado mantido pelo mesmo projeto é outro produto, com seu próprio repositório e sua própria política.
- Integrações judiciais são somente leitura: DJEN, DataJud, eproc nacional e PJe nacional (`specs/judicial-readonly-policy.md`).
- Nenhum runbook interno, endereço de produção ou credencial entra neste repositório ou em logs.


## 35. Direção visual obrigatória

- `docs/ui-v2/VISUAL_IMPLEMENTATION_GUIDE.md` é leitura obrigatória para toda missão de HTML, CSS, presenter, componente, formulário, tabela, modal, drawer, landing ou painel administrativo. Leia também `specs/ui-mode.md`, os tokens/primitivas e o módulo visual do domínio antes de editar.
- Preserve a direção editorial jurídica: tipografia hierárquica, paleta sóbria, densidade controlada, alinhamento preciso, SVG oficial e estados operacionais verdadeiros. Não invente um design system paralelo nem copie a aparência genérica de outro produto.
- A aprovação visual exige inspeção da view correta, geometria sem sobreposição, light/dark, responsividade, teclado e estados relevantes. Gerar screenshots ou passar sintaxe não substitui essa conferência.
- Antes de editar UI, registre o componente existente usado como referência e os estados/viewports afetados. Ao concluir, entregue o registro de evidências da seção 21 do guia. Colisão, clipping, foco inacessível, ação encoberta ou estado visual falso impedem declarar a UI aprovada; corrija e confira novamente. Sem navegador disponível, declare validação visual pendente, nunca presumida.
- O guia não autoriza redesign, alteração funcional, ativação de CI ou deploy. A autorização e o escopo da missão continuam prevalecendo; uma missão somente documental não deve alterar runtime ou produção.

## 36. README e release a cada alteração publicada

- Toda correção ou funcionalidade nova exige, **no mesmo ciclo**: atualizar o `README.md` (quando o comportamento visível ou a versão mudar), registrar em `docs/CHANGELOG.md` e publicar um **release próprio** (tag `vX.Y.Z` + `docs/RELEASE_NOTES_<versão>.md` + GitHub Release).
- **Cadeia de entrada com a versão do pacote**: `index.html` → `js/app/bootstrap.js?v=<versão>` → `js/portal.js?v=<versão>`. Rebumpar as duas pontas a cada release (o contrato em `tests/stable_release_contract.mjs` exige). Sem isso, navegador com cache antigo continua executando os módulos antigos depois do deploy — foi a causa real de uma feature nova "não aparecer" na tela do usuário enquanto o asset no servidor já estava certo.
- **Todo módulo alterado precisa de bump no próprio `?v=`**: o guardião `scripts/asset-version-manifest.mjs` (manifesto `asset-version-manifest.json`) falha quando um arquivo versionado muda sem rebump — foi assim que `shell.js?v=6.2.10` seguiu servindo a cópia antiga depois da correção. Ao mexer em módulo/CSS/ícone com `?v=`, rebumpe a referência e rode `node scripts/asset-version-manifest.mjs --write` no mesmo commit.
- **Por que o `?v=` é a única alavanca de cache**: o servidor local aplica CSP e `X-Frame-Options`, mas não controla `Cache-Control` de asset de forma confiável em todos os ambientes. Ou seja: módulo sem bump pode ficar na máquina do usuário muito além do necessário. Módulos fora da cadeia versionada (`js/core/*` importado sem `?v=`) herdam esse risco; ao alterar um deles, prefira bump na referência versionada mais próxima e registre a limitação no relatório.
- O release acompanha a tag: `main`, tag e artefato publicado no GitHub nascem do mesmo SHA verificável.
- Correção sem mudança visível ainda exige versão patch e entrada no changelog; feature nova exige bump minor. Nunca acumule alterações publicadas sem release correspondente.
- Não publique release de trabalho não deployado e não deploye lote sem release correspondente.
- O lote de release respeita a revisão do responsável; quando segurado, o release é preparado e só publicado junto do lote seguinte.

## 37. Catálogo de contexto do produto

- O contexto do produto vive em três superfícies: o catálogo de skills do Assistente (`js/skills-data.js`, export `CODEX_LEGAL_SKILLS`), as diretrizes do prompt base (`lib/legal-intelligence/atrium-base-prompt.mjs`) e estas specs.
- Fontes de verdade do catálogo: as skills jurídicas de `.agents/skills/*/SKILL.md` (corpo sem frontmatter) e os checklists de qualidade de `.agents/references/` (resumidos na skill `padroes-de-qualidade`). Ao editar um SKILL.md jurídico, sincronize o texto integral no catálogo no mesmo commit (hoje 19 skills: 9 jurídicas + 7 de análise de produto + `consulta-judicial-mcp`, `padroes-de-qualidade` e `jev-data-analyzer`, análise operacional com Atrium IA conforme `specs/operational-analysis.md`).
- `.opencode/skills/` é toolchain de agentes (gitignored) e **não entra** no catálogo do produto nem em release; skills de engenharia de `.agents/skills/` também não entram no catálogo do usuário (produto jurídico).
- MCPs (`atrium` = consultas judiciais somente leitura; `firecrawl` = pesquisa) são capacidades de agentes; suas regras (somente leitura, ausência ≠ inexistência, homônimos exigem confirmação) estão refletidas na skill `consulta-judicial-mcp` e na diretriz 7 do prompt base. Plugins do `.opencode/` (SDK `@opencode-ai/plugin`) seguem desabilitados por decisão; mudanças nesse estado exigem subgate próprio.

## 38. Autonomia e verificação assistida (agir dentro do sistema)

- **Verificação dentro do produto, não só em teste**: ao mexer em UI, fluxo, classificador ou automação, entre no sistema real com a sessão autenticada do operador (skill `browser-skill`/`browser-testing-with-devtools`) e exercite os painéis de verdade — clique, corrija, funda, classifique — em vez de pedir conferência manual ao operador. Relate com evidência (tela/comando/rota) o que encontrou.
- **Conferência visual é print lido, não métrica**: toda conferência visual (missão que toca UI) exige **tirar o print do sistema real e abrir/ler a imagem** — desktop (~1250px) e mobile (390px) — antes de declarar qualquer aprovação. Medição de geometria (overflow, clipping, colisão, alvo de toque) é complementar e nunca substitui o olhar: em 2026-09-29 a varredura geométrica deu "sem colisões, sem cortes" em telas que o operador reprovou em segundos ao olhar. Se nenhum print foi lido, o resultado a declarar é "validação visual pendente". Protocolo completo em `docs/ui-v2/VISUAL_IMPLEMENTATION_GUIDE.md`, seção 22.
- **Perfil de sessão importa no teste mobile**: sessão criada no perfil desktop responde `401` no perfil mobile do agente; faça login já no perfil mobile antes de coletar (limitação do teste, não defeito do produto). Navegue sempre pela rota da aplicação, nunca por URL em SPA.
- **Sweep adversarial contínuo**: rode a bateria visual/geométrica (390/860/1920/2560) e a tese adversária do fluxo tocado (interface quebrada/desalinhada/fora do padrão, estado mentindo, ação sem efeito, dado oficial sobrescrito) até estabilizar; falha nova é para ser diagnosticada e corrigida na causa, não contornada.
- **Autorização uma vez, não a cada passo**: movimentos em lote que mudam o acervo (fusão/reapontamento em massa, tratamento/descarte em lote, correção em lote de rótulos) e envio de e-mail pedem autorização **uma vez** para o lote inteiro; leitura, classificações, conferências, análises e correções pontuais com evidência inequívoca não pedem autorização a cada item.
- **Ações com alvo claro não travam a missão**: sem credencial/acesso, use dado sintético, usuário genérico e estado de teste em diretório isolado, e registre a limitação — não pare o trabalho por isso. O que nunca é sintético: resultado apresentado como real, prazo, ciência, assinatura ou ato em portal.
- **Aprendizado do classificador é do escritório**: a correção humana feita no painel vence o modelo e vira exemplo (`specs/ai-classifier.md`, seção "Aprendizado e autonomia assistida"); o agente pode corrigir rótulo com evidência inequívoca e nunca sobrescreve a correção humana.
- Se ficar travado no mesmo bug depois de ~10 tentativas fundamentadas, aplique as skills instaladas do projeto (ex.: `debugging-and-error-recovery`, `doubt-driven-development`, `doutrina-adversarial` quando aplicável) antes de pedir orientação ao operador.
