# ATRIUM — CATÁLOGO OFICIAL DE KNOWN ISSUES (MEMÓRIA TÉCNICA)

Este documento registra os problemas conhecidos, regressões históricas, riscos e pontos de atenção arquitetural do ATRIUM.  
Cada item é classificado rigorosamente com base em evidências fáticas e testes reproduzíveis.

**Status Permitidos:**
- `OPEN`: Problema ativo comprovado por teste ou reprodução.
- `NEEDS_REVALIDATION`: Problema histórico que requer nova rodada de testes no ambiente atual.
- `HISTORICAL_REGRESSION`: Problema que já ocorreu no passado e possui teste sentinela de regressão.
- `FIXED`: Problema comprovadamente corrigido com teste automatizado/manual validado.
- `WONT_FIX`: Decisão de produto deliberada por não alterar o comportamento.
- `RISK`: Ponto de fragilidade arquitetural que ainda não quebrou, mas demanda monitoramento.

---

## KI-001 — Regressões de layout responsivo em diferentes viewports
- **Área:** Frontend / Design System (UI v2)
- **Severidade:** P2 (MEDIUM)
- **Status:** `FIXED`
- **Primeira Evidência:** Falhas prévias no teste `tests/visual-qa.mjs` com premissa incorreta de que cartões de kanban deveriam caber 100% sem scroll vertical em viewports de baixa altura.
- **Reprodução:** Reduzir viewport para laptop (1280x720) ou tablet (768x1024) com dados volumosos no kanban de processos e tarefas.
- **Comportamento Esperado:** Rolagem suave dos contêineres internos sem quebra de grid, truncamento de texto nem overflow horizontal na viewport principal.
- **Comportamento Observado:** Histórico de quebra de altura mínima em telas menores; ajustado com CSS flex/grid responsivo nos presenters V2.
- **Provável Causa:** Falta de regras de overflow adaptativo em contêineres pai flexbox.
- **Correção:** Adaptação de classes em `css/views/ui-v2/shell.css` e `tasks.css`.
- **Teste de Regressão:** `tests/visual_ui_v2_global_polish.mjs` (46 screenshots, 18 views), `tests/ui_v2_global_polish_accessibility.mjs` (72 estados responsivos), `tests/smoke.mjs`.
- **Última Validação:** 12/09/2026.

---

## KI-002 — Navegação cruzada entre módulos, drawers e histórico
- **Área:** Frontend / Router / Presenters
- **Severidade:** P1 (HIGH)
- **Status:** `FIXED`
- **Primeira Evidência:** Ao clicar em um processo a partir de uma intimação ou tarefa, o drawer de detalhe conflitava com o estado da view principal (`js/portal.js`).
- **Reprodução:** Acessar Intimações -> Abrir Intimação -> Clicar no link de Processo Vinculado -> Fechar drawer -> Tentar usar botão 'Voltar' do navegador.
- **Comportamento Esperado:** Transição suave para a tela de Processos focando o processo de destino, mantendo a pilha de navegação íntegra.
- **Comportamento Observado:** O sistema abria o detalhe, mas deixava a aba de navegação lateral desalinhada.
- **Provável Causa:** Desacoplamento entre o roteador hash/history e a função `switchView()`.
- **Correção:** Unificação da navegação cruzada em `js/portal.js` com o método `navigateToEntity(type, id)`.
- **Teste de Regressão:** `tests/cross_module_navigation.mjs`.
- **Última Validação:** 12/09/2026.

---

## KI-003 — Publicações do DJEN e estado determinístico de triagem
- **Área:** Backend / Coletores / Publicações
- **Severidade:** P1 (HIGH)
- **Status:** `FIXED`
- **Primeira Evidência:** Divergência de contagem de publicações novas entre o widget do Dashboard e a listagem completa da Caixa de Intimações.
- **Reprodução:** Executar varredura do DJEN com corte temporal de 30 dias com publicações antigas já tratadas.
- **Comportamento Esperado:** Ambos os componentes devem consumir a mesma fonte da verdade (`store.state.intimations`) filtrada pela data de corte (`checkpointDate`).
- **Comportamento Observado:** O dashboard contava todos os registros não lidos independente da data de corte; a lista filtrava pelo checkpoint.
- **Provável Causa:** Consulta duplicada com critérios de filtro divergentes no frontend.
- **Correção:** Função oficial única `getFilteredPublications(state)` compartilhada entre dashboard e publications feature.
- **Teste de Regressão:** `tests/publications_treatment.mjs` e `tests/publication_workflow.mjs`.
- **Última Validação:** 12/09/2026.

---

## KI-004 — Isolamento de falhas em integrações externas (eproc TJRS / DataJud)
- **Área:** Backend / Sidecars / Coletores
- **Severidade:** P1 (HIGH)
- **Status:** `FIXED`
- **Primeira Evidência:** Timeout de Cloudflare (HTTP 524) e travamento do servidor ao varrer processos no eproc TJRS via Playwright.
- **Reprodução:** Disparar varredura de processos volumosa com o portal do TJRS sob alta latência ou instabilidade de rede.
- **Comportamento Esperado:** O coletor deve rodar de forma assíncrona desacoplada em background, retornando HTTP 202 Accepted imediatamente e permitindo polling de status em `/api/integrations/eproc/sweep/status`.
- **Comportamento Observado:** A requisição HTTP ficava síncrona aguardando o fim da varredura, estourando o timeout de 100 segundos do Cloudflare com erro 524.
- **Provável Causa:** Falta de pipeline assíncrono para operações de coleta externa.
- **Correção:** Commit `e3e5f63` introduziu polling dinâmico de status com fila assíncrona, eliminando o bloqueio da conexão.
- **Teste de Regressão:** `tests/eproc_a1_totp_integration.mjs`.
- **Última Validação:** 12/09/2026.

---

## KI-005 — Conflito de portas e inicialização de serviços locais
- **Área:** Infraestrutura / Configuração
- **Severidade:** P2 (MEDIUM)
- **Status:** `FIXED`
- **Primeira Evidência:** Tentativa de inicializar múltiplos testes concorrentes resultava em `EADDRINUSE: port 3000`.
- **Reprodução:** Rodar `npm start` enquanto uma suíte de testes de integração (`tests/security.mjs`) sobe uma instância temporária na mesma porta padrão.
- **Comportamento Esperado:** Testes devem alocar portas efêmeras aleatórias (`port: 0`) e o servidor principal deve respeitar a variável de ambiente `PORT`.
- **Comportamento Observado:** Testes tentavam bind fixo na 3000.
- **Provável Causa:** Hardcoding de `const PORT = 3000` em testes auxiliares.
- **Correção:** `startTestServer()` agora utiliza porta dinâmica ou porta isolada via `PORT || 0`.
- **Teste de Regressão:** `tests/helpers.mjs`.
- **Última Validação:** 12/09/2026.

---

## KI-006 — Loop de refresh na indisponibilidade do backend durante o startup
- **Área:** Frontend / Core / Autenticação
- **Severidade:** P1 (HIGH)
- **Status:** `FIXED`
- **Primeira Evidência:** Se a página carregasse antes do backend estar totalmente no ar, o cliente entrava em loop frenético de `/api/auth/session` gerando dezenas de requisições por segundo.
- **Reprodução:** Abrir o frontend no navegador com o servidor Node parado ou retornando ECONNREFUSED.
- **Comportamento Esperado:** Exibição de tela de erro gracioso de conexão com botão de tentar novamente e backoff exponencial.
- **Comportamento Observado:** O interceptor de fetch tentava refresh infinito sem delay.
- **Provável Causa:** Falta de contador de tentativas e backoff no interceptor do `js/core/api.js`.
- **Correção:** Limite de 3 retentativas com parada total e toast informativo de indisponibilidade temporária.
- **Teste de Regressão:** `tests/security.mjs`.
- **Última Validação:** 12/09/2026.

---

## KI-007 — Acessibilidade de Drawers, Focus Trap e Fechamento com Teclado (ESC)
- **Área:** Frontend / Acessibilidade
- **Severidade:** P2 (MEDIUM)
- **Status:** `FIXED`
- **Primeira Evidência:** Usuário navegando por teclado não conseguia fechar o modal/drawer pressionando a tecla `Escape`.
- **Reprodução:** Pressionar `Tab` até abrir o drawer de processo e pressionar `Escape`.
- **Comportamento Esperado:** Fechamento imediato do modal, retorno do foco para o elemento disparador e desbloqueio do scroll do body.
- **Comportamento Observado:** O drawer permanecia aberto ou o foco se perdia no fim do DOM.
- **Provável Causa:** Falta de event listener global para `Escape` e captura de foco não restaurada.
- **Correção:** Implementação de `trapFocus()` e `restoreFocus()` em `js/components/modal.js` e nos presenters V2.
- **Teste de Regressão:** `tests/ui_v2_processes_accessibility.mjs` e `tests/ui_v2_tasks_accessibility.mjs`.
- **Última Validação:** 12/09/2026.

---

## KI-008 — Smoke test de recursos essenciais da interface (Desktop & Mobile)
- **Área:** Frontend / UI
- **Severidade:** P2 (MEDIUM)
- **Status:** `FIXED`
- **Primeira Evidência:** Pequenas inconsistências visuais em botões secundários nos módulos de Clientes e Financeiro.
- **Reprodução:** Execução do smoke test de navegação completa.
- **Comportamento Esperado:** Todos os 20 módulos abrem sem erro de console e renderizam os cabeçalhos V2 unificados.
- **Comportamento Observado:** Funcionamento regular comprovado no commit `e3e5f63`.
- **Teste de Regressão:** `tests/smoke.mjs`.
- **Última Validação:** 12/09/2026.

---

## KI-009 — Divergência entre execução local e publicação em produção
- **Área:** Release / DevOps
- **Severidade:** P1 (HIGH)
- **Status:** `FIXED`
- **Primeira Evidência:** Alterações locais não chegavam imediatamente à operação hospedada.
- **Reprodução:** Commitar localmente e esquecer de disparar o deploy remoto.
- **Comportamento Esperado:** Alinhamento contínuo entre `main` e a operação hospedada.
- **Comportamento Observado:** Commit `e3e5f63` validado com status `MATCH` tanto no frontend quanto no backend.
- **Provável Causa:** Falta de protocolo formal de sincronização.
- **Correção:** Diretriz estrita de deploy documentada na Seção 4.5 das regras do projeto.
- **Última Validação:** 12/09/2026.

---

## KI-010 — Ambiguidade de nomenclatura do diretório local `TESTE INTEGRAÇÃO ATRIUM`
- **Área:** Governança / Workspace
- **Severidade:** P3 (LOW)
- **Status:** `FIXED` (DOCUMENTED)
- **Primeira Evidência:** Dúvida recorrente do usuário sobre o propósito da pasta local.
- **Reprodução:** Auditoria de caminhos de arquivos.
- **Comportamento Esperado:** Documentação clara de que a pasta é o clone oficial do Atrium Pro e que renomeá-la quebraria ferramentas de build e git do diretório pai.
- **Comportamento Observado:** Formalizado no relatório `docs/architecture/WORKSPACE_STRUCTURE.md`.
- **Última Validação:** 12/09/2026.

---

## KI-011 — Contradição comercial entre a página pública e o cadastro
- **Área:** Produto / Comunicação / Compliance
- **Severidade:** P1 (HIGH)
- **Status:** `FIXED` (19/10/2026)
- **Primeira Evidência:** Comparacão entre o texto público e o formulário de cadastro (versões antigas da entrada).
- **Reprodução:** Navegar pela página pública e ler a promessa institucional. Em seguida, clicar em "Criar Escritório" e conferir as opções do cadastro.
- **Comportamento Esperado:** Coerência entre a comunicação pública e os termos da entrada.
- **Comportamento Observado:** A comunicação institucional e os cartões de cadastro descreviam modelos comerciais diferentes.
- **Correção:** A entrada pública e o cadastro foram alinhados. Os cartões de plano definem apenas a apresentação; não ativam recursos de IA nem concedem acesso. O documento comercial detalhado não integra o repositório aberto.
- **Última Validação:** 19/10/2026.

---

## KI-012 — Claims técnicos absolutos na comunicação pública ("sem falhas", "garantia inviolável")
- **Área:** Compliance / Jurídico / Comunicação
- **Severidade:** P2 (MEDIUM)
- **Status:** `FIXED`
- **Primeira Evidência:** `index.html:1146` ("Varredura automática eproc TJRS e DJEN Nacional sem falhas") e `index.html:1314` ("garantia inviolável do sigilo do cliente").
- **Reprodução:** Leitura da seção de métricas e de segurança da Landing Page.
- **Comportamento Esperado:** Linguagem profissional, defensável, ética perante a OAB e tecnicamente acurada.
- **Comportamento Observado:** Uso de adjetivos absolutos passíveis de questionamento ético e jurídico.
- **Provável Causa:** Copywriting de conversão agressivo sem revisão técnica/jurídica.
- **Correção:** Substituído por "varredura contínua eproc TJRS e DJEN Nacional com alertas proativos", "segurança avançada e proteção rigorosa do sigilo do cliente", "criptografia robusta AES-256-GCM" e "conexão direta com tribunais oficiais".
- **Última Validação:** 12/09/2026.

---

## KI-013 — Experiência do fluxo de recuperação de senha ("Esqueceu sua senha?")
- **Área:** Autenticação / UX
- **Severidade:** P2 (MEDIUM)
- **Status:** `FIXED` (22/09/2026)
- **Primeira Evidência:** Ao clicar em "Esqueceu sua senha?" na tela de login (`index.html:1714`), o sistema não solicita e-mail nem envia link de redefinição; exibe uma mensagem orientando a utilizar os códigos de uso único de 2FA ou pedir ajuda ao administrador.
- **Reprodução:** Na tela de login, clicar em "Esqueceu sua senha?".
- **Comportamento Esperado:** Um modal acolhedor explicando as opções de recuperação (código de emergência 2FA salvo na criação da conta, ou redefinição manual pelo Administrador Mestre da banca).
- **Comportamento Observado:** Mensagem curta em texto estático que pode frustrar usuários que esperam um link automático por e-mail no modelo tradicional de SaaS.
- **Provável Causa:** Em arquitetura local-first e Zero Trust sem servidor de e-mail transacional obrigatório, a redefinição depende de chaves locais ou do administrador do escritório.
- **Correção:** Suplantada pelo fluxo real de redefinição por link seguro de uso único: formulário "Esqueceu sua senha?" (`authForgotForm`) → `requestPasswordReset` → e-mail com link → `completePasswordReset` → nova senha → login. Resolve a frustração central do KI (ausência do link por e-mail no modelo SaaS). Coberto por `tests/ui_v2_password_recovery.mjs` (38/38 asserções, fluxo real ponta a ponta e-mail → link → nova senha → login).
- **Última Validação:** 22/09/2026.

---

## KI-014 — Ausência de administração centralizada do escritório
- **Área:** Administração / Governança
- **Severidade:** P1 (HIGH)
- **Status:** `FIXED`
- **Primeira Evidência:** O usuário precisava navegar na aba 'Configurações -> Diagnóstico' para ver integridade, mas não dispunha de uma rota centralizada que unisse saúde, RBAC, auditoria e diagnóstico.
- **Reprodução:** Tentar acessar a área administrativa pelo menu principal.
- **Comportamento Esperado:** Rota administrativa protegida por autenticação e papel administrativo, com proteção server-side que impeça acesso indevido por advogados ou colaboradores comuns.
- **Comportamento Observado:** Recursos administrativos fragmentados em `system-admin.js` e `configuration.js`.
- **Correção:** Centralizado em **Configurações → Diagnóstico** (integridade, acompanhamento, auditoria e relatórios), com controle server-side por papel. O plano de administração do operador hospedado não integra o repositório aberto.
- **Última Validação:** 12/09/2026.

---

## KI-015 — Isolamento Estrito Multi-Tenant, RBAC & Prevenção de IDOR
- **Área:** Backend / Segurança / Multi-Tenancy
- **Severidade:** P0 (CRITICAL)
- **Status:** `FIXED`
- **Primeira Evidência:** Necessidade de comprovação formal contra ataques de travessia de inquilino (IDOR) e vazamento de dados entre bancas distintas.
- **Reprodução:** Usuário autenticado da Banca B tenta acessar recursos (processos, documentos, auditoria) da Banca A manipulando `workspaceId` em query strings, corpo JSON ou cabeçalhos HTTP.
- **Comportamento Esperado:** O servidor deve ignorar ou rejeitar parâmetros externos de workspace e forçar rigorosamente o escopo da sessão autenticada (`req.session.workspaceId`), isolando fisicamente os bancos de dados SQLite e diretórios de storage.
- **Comportamento Observado:** Arquitetura do Atrium isola bancos e diretórios via TenantManager e `req.session.workspaceId`. Proteção validada exaustivamente contra IDOR (query, body, headers), controle de acesso das rotas administrativas (401 sem auth, 403 para não-admin) e proteção do administrador principal.
- **Provável Causa:** Falta de suíte de testes de ponta a ponta que testasse explicitamente vetores de ataque IDOR simulados contra rotas ativas do servidor.
- **Correção:** Criação da suíte `tests/multi_tenant_isolation.mjs` integrada à suíte oficial de verificação do Atrium (`scripts/verify-atrium.mjs`).
- **Teste de Regressão:** `tests/multi_tenant_isolation.mjs`.
- **Última Validação:** 12/09/2026.

---

## KI-016 — Contraste insuficiente do tema claro da página pública (histórico)
- **Área:** Frontend / Página pública / Acessibilidade (WCAG 2.2 AA)
- **Severidade:** P2 (MEDIUM)
- **Status:** `HISTORICAL_REGRESSION`
- **Registro:** A página pública correspondente não integra este repositório. O registro é mantido por continuidade do catálogo; a componente e os testes associados foram removidos junto com a página. Nenhuma ação é necessária para quem compila o ATRIUM a partir deste repositório.

---

## KI-017 — Página pública não consultava economia de dados (histórico)
- **Área:** Frontend / Página pública / Performance
- **Severidade:** P3 (LOW)
- **Status:** `HISTORICAL_REGRESSION`
- **Registro:** A página pública correspondente não integra este repositório. O registro é mantido por continuidade do catálogo; a componente e os testes associados foram removidos junto com a página. Nenhuma ação é necessária para quem compila o ATRIUM a partir deste repositório.
