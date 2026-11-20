# Changelog

As mudanças relevantes do ATRIUM Senda são registradas neste arquivo. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa versionamento semântico.

## 3.3.0 — 2026-11-20

### Adicionado

- **Paridade completa da Central Cível e Financeira**:
  - **Juros simples ou compostos** (`juros.capitalizacao`), **juros compensatórios separados dos moratórios** (`jurosCompensatorios` — cenário de desapropriação com opção `incidirMoratoriosSobreCompensatorios`), **multa contratual independente**, **cumprimento de sentença art. 523 §1º CPC** (`multa_10` / `multa_e_honorarios_10`) e **custas finais fixas** (`custasFinais`) na Planilha Judicial (`lib/calc/civel.mjs`).
  - **Perfis jurídicos rápidos** (5 botões de preenchimento na Planilha Judicial: Lei 14.905/24, Cível 1% INPC, Fazenda EC 113 SELIC, Poupança e Desapropriação) e **gerador de parcelas mensais recorrentes** (1 a 120 meses).
  - **Série `POUPANCA` contínua pré/pós 04/05/2012**: emenda automática entre regra antiga (`SGS 25` até 04/2012) e regra nova (`SGS 195` a partir de 05/2012) em `lib/calc/source.mjs`.
  - **Sub-abas e exportações**: seleção livre de até 5 índices no comparativo de Correção e Deflação, seletor **Simples / Composta** no Solver TVM, download direto do `.htm` reparado com `https://`, botão para copiar a minuta de notificação no Reajuste de Aluguel, **Copiar p/ petição** e **Exportar CSV** para as planilhas cíveis e financeiras.
  - **Memorial detalhado em PDF com identidade visual ATRIUM** (`lib/calc/pdf/calc-report.mjs`, `POST /api/calc/relatorio-pdf`): novo botão *Baixar PDF (ATRIUM)* com timbre do escritório, brasão vetorial, identificação opcional dos autos e assinatura técnica do advogado em todas as abas (`Cível`, `Trabalhista` e `Previdenciário`).

### Corrigido

- **Solver TVM**: passa a devolver `capitalizacao` e `timing` explicitamente em `solveTvm` (`lib/calc/civel-juros-tvm.mjs`) e na rota `/api/calc/civel/tvm`.

## 3.2.0 — 2026-11-20

### Adicionado

- **Central de Cálculos Cíveis e Financeiros liberada nativamente na edição local**: além da Planilha Judicial (Lei 14.905/2024 e Resolução CMN 5.171/2024, com transição automática em 30/08/2024), a aba Cível passa a contar com sub-navegação para **Correção e Desatualização Reversa**, **Tabelas PRICE e SAC analíticas**, **Financiamento Imobiliário SFH (SACRE, SAC e PRICE com TR, MIP, DFI e TCA)**, **Equivalência de Taxas em 7 bases e Solver TVM**, **Reajuste de Aluguéis e Contratos** (com cláusula de piso zero em deflação e minuta de notificação) e **Importador e Reparador de Planilhas `.HTM` Legadas** (conversão automática de links `http://` pré-01/06/2023 para `https://`).
- **Série `INCC-DI` (SGS 192)** adicionada ao catálogo oficial do BCB e `BigInt` decimal estendido com arredondamento bancário `half-down`, exponenciação inteira (`powInt`) e radiciação por Newton-Raphson (`nthRoot`).

### Corrigido

- **Sincronização das correções de segurança, cálculos e estabilidade do BugHunt**: correção do sinal de juros em amortizações e descontos no motor cível (`BUG-06`), isolamento de escopo privado e RBAC em `state.calculations` (`BUG-10`), proteção contra SSRF/DNS rebinding (`network-guard.mjs`), consistência de `Store.load()`/`rebaseOnServerState()`, projeção de avos e datas bissextas no motor trabalhista (`BUG-05`), concomitância em marcos de tempo de contribuição (`BUG-09`) e overrides/snapshots do assistente LC 142 (`BUG-07`, `BUG-08`, `BUG-17`).

## 3.1.4 — 2026-11-15

### Alterado

- **Escopo Básico Local (`basic`) como padrão oficial do Senda**: o aplicativo inicia na superfície Basic (Processos, Publicações, Tarefas, Agenda, Contatos, Integrações Judiciais somente leitura, Auditoria e Configurações) e bloqueia mutações locais nos módulos exclusivos dos planos pagos na nuvem (Financeiro, Cálculos, Documentos com OCR e Atrium IA).
- **Promoção direta do ATRIUM Pro & Pro IA na nuvem**: tela de acesso, painel de Configurações e documentação passam a destacar a degustação de 14 dias em `https://atrium.adv.br/discover/` e a nova página oficial `https://senda.atrium.adv.br/discover/`.
- **Licença alterada para FSL-1.1 (Uso Local Não-Concorrente)**: mantém o uso local gratuito para advogados em suas próprias máquinas e veda a oferta do código como SaaS, serviço hospedado ou produto concorrente do ATRIUM.

## 3.1.3 — 2026-11-14

### Alterado

- **A trava de token de ativação saiu do primeiro acesso**: quem instala o ATRIUM agora cria a conta de administrador sem precisar de token. O app desktop não gera mais `SETUP_BOOTSTRAP_TOKEN` e o campo "Token de ativação" deixou de existir na tela de primeiro acesso.
- **Instalação manual e aplicativo desktop passam a se comportar igual**: a instalação por `pnpm start` nunca exigiu token; agora o aplicativo desktop também não exige.
- A configuração cloud deixa de exigir `SETUP_BOOTSTRAP_TOKEN` e o painel administrativo deixou de reportar o status desse segredo.

### Corrigido

- A tela de primeiro acesso não pede mais um segredo que o aplicativo desktop gerava mas nunca exibia — o valor ficava apenas no arquivo `.env`, sem caminho de leitura para quem não conhecia o arquivo.

## 3.1.2 — 2026-11-14

### Corrigido

- **O endereço da versão na nuvem virou link no FAQ**: a resposta sobre Windows, Mac e Linux citava `atrium.adv.br` como texto simples, sem link para a versão hospedada.

## 3.1.1 — 2026-11-14

### Corrigido

- **Botão "Conheça o Atrium" não quebrava mais o aplicativo**: o link apontava para `/discover/`, rota que o servidor não atende. Na tela de acesso, o botão virou "Versão na nuvem", que abre o serviço hospedado em uma aba nova.
- **Promoção da versão na nuvem**: a tela de acesso ganhou um bloco próprio com o botão "Conhecer a versão na nuvem", a navegação da landing page ganhou o link "Versão na nuvem" e o banner final ganhou a chamada "Ver planos na nuvem".
- **Navegação da landing page em uma linha**: os links deixaram de quebrar em duas linhas e os itens menos usados somem progressivamente em telas estreitas, sem espremer o botão de acesso.
- **Instaladores republicados** para Windows x64 e ARM64 (NSIS e MSI), Linux (deb, rpm e AppImage) e macOS (dmg), agora com a interface corrigida.

### Alterado

- A lista de frases de segurança da tela de acesso foi removida: o espaço passou a ser ocupado pela promoção da versão na nuvem.
- O botão "Ver planos" do rodapé do cartão de acesso agora leva aos planos da versão na nuvem.

## 3.1.0 — 2026-11-13

### Novo

- **Aplicativo desktop para Linux**: pacotes `.deb` (Debian 12+, Ubuntu 22.04+, Mint, Pop!_OS, Zorin), `.rpm` (Fedora 36+, RHEL 9+, Rocky, Alma, openSUSE) e AppImage para qualquer distribuição x64, com script `packaging/linux/install.sh` que detecta a família da distribuição e confere o SHA-256.
- **Arch Linux**: `PKGBUILD` em `packaging/arch/` empacota o AppImage oficial como `atrium-senda-bin`, com entrada no menu e ícone.
- **Aplicativo desktop para macOS**: builds separados para Apple Silicon (`aarch64`) e Intel (`x64`), com `.dmg`, ícone `.icns` e dados em `~/Library/Application Support/ATRIUM`.
- **Aplicativo desktop para Windows ARM64**: instalador NSIS nativo com Node 24 `win-arm64` oficial, para Windows 11 em Snapdragon e outros ARM64.
- **Camada de movimento da UI V2**: menus com origem no gatilho, entrada de modal, toast, tooltip com 80 ms de intenção, troca de ícone do tema, selo de notificações e indicador Lista/Kanban nos tokens do sistema.

### Alterado

- **Instalador Windows** atualizado para 3.1.0 (NSIS e MSI) e texto de metadados sem qualificador de marketing.
- **Fim do Node exclusivo do Windows**: o staging baixa o Node 24 oficial da plataforma alvo (`win32`, `linux`, `darwin`; x64 e arm64) e extrai com `tar`, sem PowerShell.
- **Caminhos por sistema**: `%APPDATA%\ATRIUM` no Windows, `~/Library/Application Support/ATRIUM` no macOS e `${XDG_DATA_HOME:-~/.local/share}/atrium` no Linux.
- **Encerramento do servidor no Unix**: grupo de processos com `SIGTERM` e, se preciso, `SIGKILL`, alcançando coletor e Chromium.
- **Entrada de view**: uma única animação direcional, removendo a sobreposição de 280 ms do CSS com 200 ms do controlador.
- **Indicador Lista/Kanban** e chevrons de análise/publicações alinhados a `--v2-duration-*` e `--v2-ease-*`.

### Corrigido

- Geração de `AUTH_ENCRYPTION_KEY` no Unix passa a ler `/dev/urandom`, em vez do gerador de emergência baseado em tempo.
- Publicação multi-plataforma usa um único `SHA256SUMS.txt` e um `latest.json` serializado por plataforma.

## 3.0.2 — 2026-11-09

### Corrigido

- **Executável não abria**: o instalador não levava as dependências de produção (junctions do pnpm não sobrevivem ao pacote) e o servidor morria com `ERR_MODULE_NOT_FOUND`. O staging agora instala com `node-linker=hoisted` (árvore real, sem links) e o mapa de recursos do Tauri preserva a estrutura de pastas; integralmente testado no ciclo instalação → primeiro acesso → `/api/health` 200 → reinício.
- **Segredos de runtime do desktop**: o aplicativo agora gera `AUTH_SESSION_SECRET`, `AUTH_ENCRYPTION_KEY` (32 bytes em base64) e `SETUP_BOOTSTRAP_TOKEN` no primeiro boot com o gerador criptográfico do Windows (BCryptGenRandom), persiste em `%APPDATA%\ATRIUM\.env` (sobrevive a atualizações) e injeta as variáveis no processo do servidor. A chave recusada/AUSente é regenerada na inicialização.

### Alterado

- `ATRIUM_FRONTEND_ORIGINS` deixou de ser gravado com porta dinâmica (que ficava obsoleta no boot seguinte); as cadências de colete agendadas continuam fora da edição aberta (coleta é manual).

## 3.0.1 — 2026-11-09

### Corrigido

- Referências à marca MinutaIA removidas de código, pedidos e testes (guardião de neutralidade de marca agora proíbe o termo).

## 3.0.0 — 2026-11-09

### Recomposição da edição aberta

Esta versão marca o retorno do ATRIUM Senda como projeto aberto ativo, recomposto a partir da linha principal do ATRIUM com todas as correções acumuladas no período: publicações e triagem/tratamento, captura DJEN, integrações judiciais somente leitura (eproc nacional, PJe nacional), módulo de cálculos, documentos com OCR, assistente IA opcional, auditoria, UI V2 e o instalador do aplicativo.

### Novo

- **Aplicativo desktop para Windows**: instalador NSIS/MSI (`ATRIUM_Setup_3.0.0_x64.exe`) com Node.js empacotado, inicialização automática do servidor local, atalho no menu Iniciar e atualização silenciosa pelas releases do GitHub.
- Portas dinâmicas em `127.0.0.1`, dados do escritório em `%APPDATA%\ATRIUM\data` e logs em `%APPDATA%\ATRIUM\logs`.
- Instalação manual continua suportada (`pnpm start` ou `ATRIUM.bat`).

### Removido da edição aberta

- **Camada comercial do produto hospedado**: papéis Basic/Pro/Pro IA, cobrança, cortesia e verificação de assinatura por escritório.
- **Plano de administração da plataforma hospedada** (`/api/platform/*`, painel `/admin.html`): configurações de instância, chaves globais, suporte e telemetria interna — exclusivos da operação do serviço hospedado.
- **E-mails de ciclo de vida e comerciais** (trilhas de ativação e novidades).
- **Base de habilidades jurídicas calibrada** do Assistente. O Assistente permanece disponível com chave própria do escritório; a assistência calibrada é exclusiva do produto hospedado.
- **Página pública /discover e aplicativos móveis** desta edição aberta.

### Segurança e privacidade

- Histórico público consolidado em uma importação única: caminhos locais de desenvolvimento e nomes de pessoas foram removidos da árvore importada.
- Revisada a superfície pública: artefatos de operação interna, chaves de exemplo reais e configurações de infraestrutura interna saíram do repositório.
- A auditoria de privacidade (`pnpm audit:privacy`) permanece obrigatória antes de publicar.

### Migração

- Dados de instalações 2.x: exporte o backup cifrado antes de atualizar (Configurações → Backup → Exportar). Consulte o [guia de atualização](docs/INSTALLATION.md).
- O app desktop cria um diretório de dados próprio; nenhuma infraestrutura remota é obrigatória.

## [2.1.1] - 2026-09-09

### Fixed

- Primeiro acesso separado entre cria├º├úo da conta e escolha opcional de monitoramento por OAB/UF.
- Decis├úo de monitoramento apresentada de forma expl├¡cita, sem aceitar cadastro profissional parcial.
- Publica├º├Áes abertas em ÔÇ£N├úo tratadasÔÇØ com janela inicial dos dois dias mais recentes e hist├│rico preservado.
- Rodap├® do processo sem sobreposi├º├úo ou c├®lula vazia, acesso por chave mais claro e exporta├º├úo t├®cnica identificada.
- Origens DJEN/DataJud deduplicadas durante a consolida├º├úo e na apresenta├º├úo de dados j├í existentes.

### Changed

- Importa├º├úo do acervo autenticado aguarda o portal concluir antes da consolida├º├úo com DJEN/DataJud.
- Documenta├º├úo de instala├º├úo e primeiro uso ganhou um roteiro direto para testadores sem experi├¬ncia t├®cnica.

## [2.1.0] - 2026-09-08

### Added

- Gest├úo de tarefas em Lista e Kanban, busca contextual e navega├º├úo entre registros vinculados.
- Monitoramento com chave judicial protegida e sincroniza├º├úo na abertura, ├ás 10h e manual.

### Fixed

- Edi├º├úo e exclus├úo confirmada de despesas, legibilidade e organiza├º├úo dos pain├®is.
- Teste de ponta a ponta aguarda o carregamento do estado antes de operar a interface.

### Changed

- Documenta├º├úo e inicializadores auxiliares organizados em pastas.
- Release validada pelo workflow completo, incluindo verifica├º├úo Windows A1.

## [2.0.0] - 2026-09-02

### Stable

- Primeira vers├úo est├ível do ATRIUM, com a interface V2 como ├║nica experi├¬ncia oferecida ao usu├írio.
- Distribui├º├úo Windows de um clique por `ATRIUM.bat`, com diagn├│stico e instala├º├úo idempotente.

### Added

- Dashboard operacional, contatos/clientes, CRM, processos, publica├º├Áes, Kanban, agenda, financeiro, documentos, prompts, assist├¬ncia por IA, auditoria, notifica├º├Áes, monitoramento, links e configura├º├Áes.
- Lan├ºamentos de despesas, custas e reembolsos vincul├íveis aos registros financeiros e processuais.
- Busca global e full-text derivada sobre entidades, documentos/OCR e conte├║do autorizado.
- Importador de planilhas com pr├®via e aplica├º├úo supervisionada.
- Temas claro/escuro, layouts responsivos, acessibilidade por teclado e motion reduz├¡vel.

### Changed

- Identidade p├║blica e labels correntes consolidados como ATRIUM 2.0.0 Stable.
- Bootstrap e imagem Docker alinhados a Node.js 24, pnpm 11.19.0 e lockfile congelado.
- Documenta├º├úo de instala├º├úo, uso, arquitetura, seguran├ºa e limita├º├Áes consolidada para a release.
- Pain├®is laterais fecham por clique externo quando n├úo h├í altera├º├Áes e pedem confirma├º├úo antes de descartar edi├º├úo pendente.
- Biblioteca de prompts compactada para quatro cart├Áes por linha em telas amplas, com a├º├Áes de altura reduzida.

### Security

- Persist├¬ncia AES-256-GCM com revis├úo, grava├º├úo at├┤mica, recovery e backups cifrados.
- Sess├Áes HttpOnly/SameSite, CSRF, RBAC, TOTP e separa├º├úo de segredos do Store frontend.
- Documentos privados cifrados, rotas protegidas e egress cadastral com allowlist, timeout, rate limit e circuit breaker.
- Distribui├º├úo exclui `.env`, dados, certificados, chaves, perfis e demais artefatos privados.

### Judicial

- Discovery conservador DJEN ÔåÆ CNJ ÔåÆ processo ÔåÆ DataJud ÔåÆ contatos/rela├º├úo de cliente quando autorizado por dados estruturados.
- Reconcilia├º├úo de clientes idempotente, com prioridade ao v├¡nculo manual, confian├ºa m├¡nima de 90% e Gemini opcional; advogado e parte contr├íria n├úo s├úo promovidos a cliente.
- Sess├Áes A1, PJeOffice e TOTP supervisionadas e separadas por portal, com suporte a m├║ltiplas abas e confirma├º├úo somente por evid├¬ncia positiva de autentica├º├úo.
- Pol├¡tica read-only expl├¡cita: sem ci├¬ncia, assinatura, peticionamento, protocolo, bypass ou confirma├º├úo autom├ítica de prazo.

### Documents

- Acervo com upload/download, preview seguro, exclus├úo l├│gica, restaura├º├úo, expurgo e deduplica├º├úo por checksum.
- OCR local configur├ível, extra├º├úo de texto, derivados textuais/PDF e indexa├º├úo full-text.
- Gerador de minutas preservado, com preview e exporta├º├úo Markdown.

### Registry Intelligence

- Valida├º├úo local de CPF; CNPJ num├®rico/alfanum├®rico via BrasilAPI; CEP via BrasilAPI/ViaCEP; diret├│rio de bancos.
- Compara├º├úo atual/encontrado, proveni├¬ncia, freshness/cache, QSA e sugest├Áes supervisionadas de duplicidade/conflito.

### User Interface

- Sistema Mineral Editorial, superf├¡cies read-first, inspectors, drawers e RecordLists responsivas.
- Microintera├º├Áes contidas, foco vis├¡vel, redu├º├úo de movimento e estados claros de opera├º├úo/erro.

### Testing

- CI em Node 24 com Lint/Test/E2E, Visual QA multiviewport e valida├º├úo A1 no Windows.
- Cobertura dirigida de seguran├ºa, concorr├¬ncia, recovery, persist├¬ncia, integra├º├Áes e fluxos reais sint├®ticos.

[2.0.0]: https://github.com/ricarossetto/Atrium-Senda/releases/tag/v2.0.0
