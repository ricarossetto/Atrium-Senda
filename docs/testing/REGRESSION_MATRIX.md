# ATRIUM — MATRIZ DE TESTES E CONTROLE DE REGRESSÕES (REGRESSION_MATRIX)

**Data de Atualização:** 12 de Setembro de 2026  
**Repositório Oficial:** `ricarossetto/Atrium-Senda`  
**Branch de Estabilização:** `stabilization/atrium-quality-gate`  
**Status do Baseline:** Bateria completa de testes executada e classificada  

---

## 1. Visão Geral da Matriz

Esta matriz documenta o diagnóstico factual de cada suíte de teste do ATRIUM, mapeando causas-raiz de falhas históricas em CI, sua classificação técnica unívoca e o status de resolução comprovado por execução determinística.

### Taxonomia de Classificação:
- **`PRODUCT BUG`**: Falha genuína de comportamento, lógica ou contrato de dados do produto.
- **`REGRESSION`**: Degradação funcional introduzida em modificação recente que quebrou fluxo existente.
- **`STALE TEST`**: Teste defasado que verifica regex textual frágil, versão desatualizada ou detalhe incidental de implementação.
- **`FLAKY TEST`**: Teste não-determinístico sujeito a condições de corrida de temporização.
- **`ENVIRONMENT FAILURE`**: Falha decorrente de especificidades do sistema operacional ou toolchain (ex: lock de filesystem no Windows).
- **`EXTERNAL SERVICE FAILURE`**: Dependência de serviços de terceiros fora do controle do runtime local.
- **`TEST INFRASTRUCTURE BUG`**: Defeito no harness de teste ou helpers de inicialização.

---

## 2. Diagnóstico e Resolução de Falhas Históricas de CI

| Suíte de Teste | Falha Observada no CI | Classificação | Causa-Raiz Técnica | Ação de Correção Executada | Status Atual |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`tests/ui_v2_auth_shell.mjs`** | Falha de asserção visual no Auth Gate V2. | `REGRESSION` | Regressão de espaçamento em `css/views/ui-v2/auth.css` que alterou o cálculo de caixa do formulário de login. | Corrigido `margin-bottom: 12px` e normalizado fluxo com 166/166 asserções aprovadas. | **PASS** (100%) |
| **`tests/ui_v2_foundation.mjs`** | `assert.doesNotMatch` falhou com vazamento de valores hex (`#fff` e `#ef4444`). | `PRODUCT BUG` | Inserção acidental de cores hex literais em `primitives.css` e `shell.css` violando o isolamento estrito de tokens V2. | Substituído `#fff` por `white` e `#ef4444` pelo token oficial `var(--v2-color-danger)`. | **PASS** (100%) |
| **`tests/ui_v2_global_polish.mjs`** | `assert.doesNotMatch` falhou em `radial-gradient` e `translateY(-1px/-2px)`. | `REGRESSION` | `landing.css` introduziu `radial-gradient` no ambient glow e múltiplos botões/cards usaram `translateY` para hover. | Substituído por `linear-gradient` e purgado `translateY` em favor de elevação mineral por `box-shadow`. | **PASS** (100%) |
| **`tests/ui_v2_tasks_accessibility.mjs`** | 1) `5 !== 6` linhas de tarefas.<br>2) Alvo tátil do checkbox com `18px < 44px`. | 1) `STALE TEST`<br>2) `PRODUCT BUG` | 1) O teste alternava para lista com filtro padrão "Em andamento" (5 tarefas) esperando todas (6).<br>2) O checkbox na lista mobile media 18px de largura. | 1) Selecionado filtro explícito `all` no teste.<br>2) Declarado alvo tátil de 44px com padding responsivo em `tasks.css`. | **PASS** (100%) |
| **`tests/ui_v2_visual_direction.mjs`** | 1) `animation...infinite` falhou.<br>2) `ENOTEMPTY: directory not empty` ao encerrar servidor no Windows. | 1) `STALE TEST`<br>2) `ENVIRONMENT FAILURE` | 1) Regex amplo bloqueava legítimo spinner de sincronização (`v2-sync-spin`).<br>2) Lock temporário de descritor no Windows impedia exclusão imediata do `tmpdir`. | 1) Regex refinado para ignorar estados de carregamento transitórios.<br>2) Adicionado `maxRetries: 5, retryDelay: 100` em `tests/helpers.mjs`. | **PASS** (100%) |
| **`tests/cross_module_navigation.mjs`** | Ao clicar em documento na timeline de processos, abria modal em vez de navegar para Documentos. | `PRODUCT BUG` | `processes-presenter.js` chamava `openProcessDocuments(selectedItem, timelineEvent.entityId)` em vez de invocar `onDocuments?.(item, id)`. | Substituído por `close({ restoreFocus: false }); onDocuments?.(item, timelineEvent.entityId);`. | **PASS** (100%) |
| **`tests/visual_human_acceptance.mjs`** | `tileRows[0] === tileRows[1]` falhou em Integrations (desalinhamento em 2 colunas). | `REGRESSION` | Inserção prévia de `.inpi-integration-card` antes de `.judicial-integration-card` quebrou o emparelhamento visual de 2 colunas no desktop. | Movido card INPI para após o card do importador, garantindo alinhamento de cobertura judicial com importador na linha 2. | **PASS** (100%) |
| **`tests/stable_release_contract.mjs`** | Falha de correspondência em `$ReleaseTag` vs versão do pacote. | `STALE TEST` | `install.ps1` precisa acompanhar a versão publicada do pacote. | O contrato passou a derivar a versão do `package.json` e exige `v3.0.0`. | **PASS** (100%) |
| **`tests/smoke.mjs`** | Suite de fumaça black-box do primeiro acesso: cadastro, 2FA, persistência e painéis. | `TEST INFRASTRUCTURE` (Resiliência) | Backdrop de onboarding tour interceptava cliques em testes headless. | Adicionado dismiss determinístico de onboarding tour e modais no harness. | **PASS** (100%) |
| **`tests/frontend_module_boot.mjs`** | Grafo de módulos ES detectou import estático duplicado com `?v=2.4.5`. | `REGRESSION` | `js/features/tasks.js` continha query strings acidentais em import estático interno relativo. | Removidas query strings dos imports estáticos em `tasks.js` e refinado regex de bootstrap. | **PASS** (100%) |
| **Landing Page Claims Audit** | Alegações absolutas na página pública ("sem falhas", "garantia inviolável", "mTLS nativo", "criptografia militar"). | `PRODUCT BUG` (Compliance) | Copywriting comercial com claims absolutos não comprovados ou juridicamente frágeis. | Substituído por redação defensável, ética e tecnicamente comprovada alinhada à LGPD e provimentos OAB. | **PASS** (100%) |

---

## 3. Inventário Consolidado das Principais Suítes

| Grupo de Teste | Arquivos de Teste | Escopo & Verificações | Executável Oficial | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Integridade Sintática** | `scripts/check-syntax.mjs` | Verificação estrita de sintaxe `--check` em 356 arquivos JS/MJS | `pnpm check` | **PASS** |
| **Administração do escritório** | `tests/admin_mfa_enforcement.mjs`, `tests/admin_reauthentication.mjs` | MFA do administrador, reautenticação em ações sensíveis, RBAC `assertAdmin`, auditoria | `node tests/admin_mfa_enforcement.mjs` | **PASS** |
| **Criptografia & Sessões** | `tests/security.mjs`, `tests/security_migrations.mjs` | Cifra AES-256-GCM, Scrypt, TOTP 2FA, proteção CSRF e rotação de chaves | `pnpm test:security` | **PASS** |
| **Row Level Security (RLS)** | `tests/rls.mjs` | Políticas de autorização de leitura e escrita por workspace | `pnpm test:rls` | **PASS** |
| **Multi-Tenant & IDOR** | `tests/multi_tenant_isolation.mjs` | Separação de SQLite por workspace, bloqueio de IDOR em query/body/headers, Last Admin protection | `node tests/multi_tenant_isolation.mjs` | **PASS** |
| **Importador de Planilhas** | `tests/importer.mjs` | Importação XLSX de processos e clientes com deduplicação e pontuação | `pnpm test:importer` | **PASS** |
| **Backup & Restore** | `tests/backup_restore.mjs` | 20 contratos de segurança: atomicidade, rollback em erro, concorrência | `pnpm test:backup-restore` | **PASS** |
| **Acervo Documental** | `tests/document_storage.mjs` | Ownership, deduplicação SHA-256, lixeira, expurgo e metadados | `node tests/document_storage.mjs` | **PASS** |
| **Integração Judicial eproc** | `tests/eproc_a1_totp_integration.mjs` | Autenticação mTLS A1 + injeção TOTP 2FA e validação de sessão | `pnpm test:eproc` | **PASS** |
| **Publicações & DJEN** | `tests/publications_treatment.mjs` | Triagem, vínculo com tarefas, cálculo de prazos e fluxo de corte | `pnpm test:treatment` | **PASS** |
| **Multi-Workspace** | `tests/multi_workspace.mjs` | Isolamento de diretórios de dados e integridade pós-restart | `pnpm test:workspace` | **PASS** |
| **UI V2 Processos** | `tests/ui_v2_processes.mjs` | Tabela densa, busca única, inspector read-first e consulta TJRS supervisionada | `node tests/ui_v2_processes.mjs` | **PASS** |
| **UI V2 Tarefas** | `tests/ui_v2_tasks.mjs` | Kanban 6 colunas, drag-and-drop, timer de timesheet e tarefas vinculadas | `node tests/ui_v2_tasks.mjs` | **PASS** |
| **UI V2 Acessibilidade** | `tests/ui_v2_tasks_accessibility.mjs` | Teclado, Tab trap em Drawers, alvos táteis mobile >= 44px e contenção | `node tests/ui_v2_tasks_accessibility.mjs` | **PASS** |
| **Direção Mineral Editorial** | `tests/ui_v2_visual_direction.mjs` | Geometria, paleta mineral, contraste e reflow responsivo | `node tests/ui_v2_visual_direction.mjs` | **PASS** |
| **Global Polish** | `tests/ui_v2_global_polish.mjs` | Ausência de framework, tokens consistentes, motion reduzido | `node tests/ui_v2_global_polish.mjs` | **PASS** |
| **Auth Shell V2** | `tests/ui_v2_auth_shell.mjs` | 14 screenshots com hash único, formulários de login e 2FA | `node tests/ui_v2_auth_shell.mjs` | **PASS** |

---

## 4. Política de Prevenção de Falsos Verdes

1. **Proibição de Asserções Fictícias**: É terminantemente vedado substituir asserções reais por `assert.ok(true)` ou remover blocos de teste para produzir aprovação artificial.
2. **Reprodução Obrigatória**: Toda falha identificada deve ser reproduzida isoladamente antes de qualquer tentativa de correção.
3. **Validação Cruzada no Browser**: Alterações que afetam componentes visuais exigem execução no Playwright com viewport de Desktop e Mobile antes do encerramento da suíte.
