# Assistente de IA do ATRIUM

Status: **CURRENT**

## Purpose

Definir o contrato do Assistente de IA: provedores e chaves (configurar, alterar, remover), status, montagem de contexto, ativação opcional da camada de inteligência jurídica e limites de exposição de credenciais.

## Canonical authority

- Catálogo e adaptadores de provedores: `lib/ai/providers.mjs` (Gemini, OpenAI-compatible, Anthropic-compatible; presets OpenCode Zen/Go).
- Backend: `server.mjs` — rotas `/api/ai/status`, `/api/ai/providers`, `/api/ai/configure` (POST e DELETE), `/api/ai/chat`; cofre por workspace em `aiSecretsFile()` (`data/ai-secrets.json`, AES-256-GCM) via `readAiSecrets`/`saveAiSecrets`/`readActiveProvider`.
- Camada jurídica opcional: `lib/legal-intelligence/` (contrato em `specs/legal-intelligence.md`).
- Frontend: `js/features/assistant.js` (modal de provedor/chave, remoção, skills, envio), `js/views/ui-v2/assistant-presenter.js`.
- Contexto: `lib/ai-context.mjs` (minimização e isolamento).
- Catálogo de skills do Assistente: `js/skills-data.js` (`CODEX_LEGAL_SKILLS`, 19 skills) sincronizado a partir de `.agents/skills/*/SKILL.md` (corpo sem frontmatter) e `.agents/references/` (checklists, resumidos em `padroes-de-qualidade`), gerado por `scripts/generate-skills-data.mjs`; diretrizes de fontes em `lib/legal-intelligence/atrium-base-prompt.mjs` (`ATRIUM_CORE_DIRECTIVES`).
- Testes: `tests/assistant_feature.mjs`, `tests/ui_v2_assistant.mjs`, `tests/ui_v2_assistant_accessibility.mjs`, `tests/ai_key_management.mjs`, `tests/ai_providers.mjs`, `tests/ai-context.mjs`, `tests/skills_catalog_contract.test.mjs`, `tests/skills_catalog_generation.mjs`, `tests/skills_catalog_triggering.test.mjs`.

## Governança de IA — referência CNJ (Resolução 615/2025)

Benchmark declarado, **não** alegação de conformidade: o Assistente do ATRIUM é apoio à gestão e à redação sob supervisão humana; não decide, não valora prova e não pratica ato.

- **Supervisão humana** (art. 2º, V; art. 3º, VII): toda saída do assistente é revisável e editável pelo profissional; nenhuma automação substitui a decisão humana.
- **Transparência, explicabilidade e auditabilidade** (art. 3º, II): o produto declara provedor ativo, modelo e origem do contexto; a auditoria registra configuração e remoção sem segredo.
- **Proteção de dados e segredo de justiça** (art. 2º, VIII): minimização de contexto, redação de PII e isolamento por workspace já são invariantes desta spec e de `specs/security-boundaries.md`.
- **Vedações do art. 10** (revisão humana impossível; perfilação para prever crimes; ranqueamento de pessoas; emoções por biometria): o escopo do assistente não contempla nenhuma dessas finalidades.
- **Anexo de Classificação de Riscos** (AR1–AR5 alto risco; BR1–BR8 baixo risco): as finalidades do assistente se enquadram nas hipóteses de apoio (BR1/BR4/BR7), sempre com supervisão humana; qualquer nova finalidade deve ser reavaliada contra o Anexo antes de implementação.

## Catálogo de skills e fontes

- O Assistente expõe 19 skills selecionáveis (`js/skills-data.js`): 9 jurídicas (ingestão, planejamento, pesquisa, redação, auditoria, execução fazendária, prescrição intercorrente, incapacidade previdenciária), 7 de análise de produto (cálculo processual, contratos, monitoramento de publicações, jurisprudência, análise de petição, sentenças, validação de tese), mais `consulta-judicial-mcp` (capacidades e regras das fontes judiciais somente leitura) e `padroes-de-qualidade` (Definition of Done + checklists adaptados do `.agents/references/`), além de `jev-data-analyzer` (análise operacional com Atrium IA, conforme `specs/operational-analysis.md`; seleção não executa o painel nem autoriza egresso).
- Sincronização obrigatória: ao editar `.agents/skills/<id>/SKILL.md` de skill jurídica, atualizar `instructions` no catálogo no mesmo commit (o corpo sem frontmatter é o texto oficial); o teste `tests/skills_catalog_contract.test.mjs` bloqueia divergência.
- Skills de contexto (`consulta-judicial-mcp`, `padroes-de-qualidade`, `jev-data-analyzer`) tem fonte propria em `.agents/skills/<id>/SKILL.md` e entram como `contextSkills` no catalogo canonico via `scripts/generate-skills-data.mjs`.
- Contrato de gatilho (triggering): toda `description` de skill ATRIUM traz gatilho explicito de acionamento ("Use quando/em/para/ao...") e fixtures de frases de usuario sinteticas devem resolver para a skill esperada; `tests/skills_catalog_triggering.test.mjs` cobre o contrato (heuristica deterministica; nao substitui avaliacao com modelo).
- Ordem de prioridade das fontes (diretriz 7 do prompt base e skill `consulta-judicial-mcp`): 1) DJEN/Comunica PJe para captura, identidade e metadados; 2) Domicílio Eletrônico (PDPJ/Jus.br) como redundância que traz o texto integral (`fullText`), com prazo e ciência apenas como referência; 3) eproc/PJe autenticados como verdade absoluta de prazos e de sigilo/chave.
- Proibido: emojis, texto de engenharia de software no catálogo do usuário e qualquer skill que prometa ato processual, ciência ou prazo definitivo.

## Invariants

- Cada chave vive apenas server-side: cofre cifrado AES-256-GCM por workspace (versão 2, múltiplos provedores, com migração do formato legado de chave Gemini) ou credencial de ambiente do servidor para o provider Gemini no workspace default; nunca é devolvida ao navegador, ao Store, a logs ou à auditoria.
- `GET /api/ai/status` expõe somente `configured`, `model` e o `provider` ativo (e `issue` quando o cofre estiver ilegível); `GET /api/ai/providers` lista o catálogo com `configured`/`model`/`baseUrl` e o `issue`, nunca `apiKey`.
- Configuração e remoção exigem sessão, CSRF e papel `master_admin`.
- A URL base de provedores compatíveis exige HTTPS, host público (bloqueio de loopback/rede privada via DNS) e ausência de credenciais embutidas.
- A validação da chave ocorre contra o provedor antes de persistir; a remoção é idempotente e reativa outro provedor configurado, se houver.
- O assistente continua operacional sem provedor: `POST /api/ai/chat` responde 400 orientando a configuração, sem afetar o restante do produto.
- A camada de inteligência jurídica permanece opcional e usa o provedor ativo; nenhuma referência à chave aparece no frontend.
- Anexos do Assistente (PDF ou texto, até 20 MB e 5 por mensagem) são processados no servidor com o OCR local (Tesseract com idioma `por` quando configurado) e descartados após uma única resposta; o texto extraído fica cifrado em `data/ai-attachments/` do workspace, com TTL de descarte, e nunca é persistido no acervo nem devolvido ao navegador.

## Allowed operations

- Consultar status e catálogo (autenticado) e configurar/remover provedores (sessão + CSRF + `master_admin`).
- Usar presets OpenCode Zen/Go e provedores OpenAI-compatible/Anthropic-compatible com URL base e modelo próprios.
- Conversar com o assistente por `POST /api/ai/chat` (sessão + CSRF) com contexto selecionado por ID oficial.
- Selecionar skill jurídica e receber o indicador de inteligência apenas quando o pipeline estiver ativo.
- Auditar no frontend a configuração e a remoção sem registrar o segredo.
- Anexar PDF ou texto no chat para digest: o texto extraído entra como documento não confiável (D#/A#), sujeito ao trust boundary e aos gates da inteligência jurídica.

## Forbidden operations

- Devolver a chave, total ou parcialmente, em qualquer resposta, página, script estático, `runtime-config.js`, log ou auditoria.
- Permitir configuração/remoção por usuário sem papel `master_admin`, sem sessão ou sem CSRF.
- Aceitar provedor desconhecido, URL base não-HTTPS, host local/privado ou credenciais embutidas na URL.
- Persistir chaves no Store, em `localStorage`/`sessionStorage` ou em qualquer artefato versionado.
- Enviar conteúdo judicial ou credencial a provedores externos sem a minimização prevista.
- Disparar envio de e-mail, ciência judicial ou ato processual a partir do assistente.
- Persistir anexos no acervo de documentos, no Store ou em qualquer artefato versionado, ou devolvê-los na resposta da API.

## State model

- O cofre é um arquivo por workspace (`data/ai-secrets.json`) no formato v2 (`providers` por id + `activeProvider`), sobrescrito atomicamente; o formato legado `geminiApiKey` é migrado na leitura.
- Cofre ilegível (JSON inválido, decriptação falha): o arquivo é movido para **quarentena com backup** (`ai-secrets.corrupt-<timestamp>.json`) e a leitura retorna vazio; `GET /api/ai/status` e `GET /api/ai/providers` respondem `200` com `issue: 'SECRETS_UNREADABLE'` — nunca `500`. Uma nova configuração bem-sucedida limpa o aviso.
- Anexos vivem em `data/ai-attachments/` do workspace, cifrados (envelope AES-256-GCM por anexo) e são removidos após o uso ou pelo TTL de descarte.
- Nenhum estado de conversa é persistido no servidor; o histórico é do cliente e limitado no envio.
- A disponibilidade da inteligência jurídica é derivada do catálogo vendorado, não do Store.
- **Ledger de uso**: cada chamada de modelo (assistente, inteligência jurídica, conciliação de clientes, teste de conexão) e cada extração OCR (documento, anexo) registra uma entrada operacional mínima em `data/system/ai-usage.json` (plano de administração, teto de 2000 entradas, escrita serializada): operação, provedor/modelo ou engine, duração, sucesso, categoria de falha e **tokens apenas quando o provedor os informa** (Gemini `usageMetadata`; OpenAI/Anthropic `usage`). Prompt, resposta, texto extraído e dado pessoal nunca entram no ledger. Custo não é estimado sem tabela de preços do operador; confiança de OCR não é fabricada — a engine local não a reporta. Leitura por `GET /api/platform/ai-usage` (`days` entre 1 e 365, padrão 30), exibida no panorama do plano de administração.

## Security boundary

- Todas as mutações exigem `assertAuthenticated(req, true)` (CSRF) e `session.role === 'master_admin'`.
- A credencial nunca cruza a fronteira server-side; o navegador apenas a envia uma vez no `POST /api/ai/configure` sob HTTPS.
- O gateway do provedor é alcançado exclusivamente pelo backend; o navegador nunca fala com o provedor.
- `vendor/` e `lib/` permanecem bloqueados nos hosts estáticos; o artefato cloud é auditado por allowlist.

## Failure semantics

- Falha de validação da chave: `400`, nada é persistido.
- Remoção sem cofre: `200` com `configured: false` (idempotente).
- Remoção com outro provedor configurado: `200` com `configured: true` e o provedor ativo informado.
- Ausência de provedor no chat: `400` com mensagem de orientação; o restante do ATRIUM permanece funcional.
- Catálogo de provedores indisponível na UI: o seletor mostra estado explícito ("Provedores indisponíveis") com **"Tentar novamente"**, permanece desabilitado e o salvamento é bloqueado com orientação — nunca uma falha silenciosa com select vazio.
- Fluxo de configuração é único: o cartão de ativação do onboarding é um **CTA** que abre o modal oficial (provedor, URL base e modelo); não existe campo de chave solto que assuma Gemini. O campo de modelo usa o combobox oficial do sistema (`installModalComboboxes`), com sugestões agrupadas por família, busca por digitação e texto livre para qualquer modelo aceito pela API; o catálogo espelha os modelos reais de OpenCode Zen/Go.
- Anexo sem formato suportado: `415`; acima de 20 MB: `413`; sem texto reconhecido: `422`; anexo inexistente ou expirado no chat: `400` com orientação de reenvio.
- Contexto do envio: o registro é escolhido por **busca oficial** (mesmo componente da busca global, em instância restrita ao acervo do assistente), com resultados agrupados por tipo, filtro por nome, número do processo e metadados, navegação por teclado e Escape sem fechar a view; a escolha grava a chave oficial no input oculto `#assistantContextSelect` e o rótulo no campo visível, e o botão de limpar remove o contexto sem tocar na conversa.
- Erro do provedor: a resposta de erro não inclui a credencial nem detalhes internos além do necessário.

## Persistence semantics

- Escrita permitida apenas no cofre do workspace, por `saveAiSecrets`, e remoção por `DELETE /api/ai/configure` (por provedor).
- Nenhuma migration de Store é acionada por essas operações; `revision` e `expectedRevision` não são tocados.
- Backups e auditoria de plataforma não são afetados.

## Relevant tests

- `tests/ai_providers.mjs`: catálogo, montagem de requisições OpenAI/Anthropic, chamadas compatíveis, rotas, guardas e quarentena de cofre ilegível.
- `tests/ai-usage-ledger.test.mjs`: normalização, teto, resumo por janela/provedor/engine e contrato de wiring do ledger.
- `tests/ai-usage-ledger.test.mjs`: ledger de uso puro, hooks de IA/OCR do servidor e dos provedores.
- `tests/ai_attachments.mjs`: upload de PDF/texto, OCR local, cifragem em disco, limites, TTL, remoção sem resíduo e ausência de texto na resposta.
- `tests/ai_key_management.mjs`: status, remoção idempotente, guardas de sessão/CSRF/RBAC, botões de UI (CTA do cartão e retry de provedores) e ausência de resíduo do cofre.
- `tests/assistant_feature.mjs`: arquitetura do módulo, payload do chat, skills, segurança do modal, estados de catálogo de provedores (falha com retry e recuperação com provedor ativo pré-selecionado).
- `tests/ui_v2_assistant.mjs` e `tests/ui_v2_assistant_accessibility.mjs`: contratos de interface e acessibilidade.
- `tests/ai-context.mjs`: minimização e isolamento do contexto.

