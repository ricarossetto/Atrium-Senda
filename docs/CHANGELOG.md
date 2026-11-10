# Changelog

As mudanças relevantes do ATRIUM Senda são registradas neste arquivo. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa versionamento semântico.

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
