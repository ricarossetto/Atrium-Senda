# PROMPT E GUIA MESTRE DE INTEGRAÇÃO PARA O OPENAI CODEX / AGENTE
> **Missão**: Integrar ao sistema principal ATRIUM 2.1.1 (Commit `449be7f`) todas as funcionalidades desenvolvidas e validadas no laboratório `consulta tjrs atrium / TESTE INTEGRAÇÃO ATRIUM`, preservando 100% da integridade visual e estabilidade do sistema com máximo reaproveitamento e mínimo gasto de créditos.
>
> **Status de Validação Local**: Aprovado com 100% dos testes passando (`stable_release_contract`, `ui_v2_processes`, `ui_v2_tasks`, `ui_v2_documents`, `ui_v2_iconography`, `decision_html_and_access_key`, `configuration_feature`, `ui_v2_configuration_admin`, `configuration_persistence`, `smoke`).
> **Servidor Local Rodando**: Porta 4188 (`http://127.0.0.1:4188`).

---

## 1. DIRETRIZES FUNDAMENTAIS PARA O CODEX (RESTRIÇÕES DE OURO)
1. **Preservação Visual e Estrutural**: NÃO reescreva telas, layouts, paletas de cores ou menus existentes. O objetivo é estritamente **adicionar as features** descritas abaixo.
2. **Reaproveitamento Máximo e Commits Limpos (Zero Segredos / Zero Hardcode)**:
   - Os arquivos integrados estão limpos, auditados e testados diretamente sobre a base `449be7f`.
   - Nenhuma senha, caminho pessoal ou credencial real consta nesses arquivos.
   - Foram gerados patches limpos e unificados:
     - `atrium-2.1.1-safe-features.patch` (Todas as features seguras de UI: Processos, Tarefas, Documentos e Configurações).
     - `atrium-2.1.1-configuration.patch` (Patch cirúrgico focado exclusivamente no Menu Configurações).
   - O Codex pode aplicar via:
     ```bash
     git apply "c:\projetos IA\consulta tjrs atrium\TESTE INTEGRAÇÃO ATRIUM\atrium-2.1.1-safe-features.patch"
     ```
     ou mesclar os arquivos listados na seção 2.
3. **Pureza Arquitetural V2**:
   - Arquivos `*-presenter.js` (em especial `processes-presenter.js`) devem permanecer **puros**: NUNCA utilize `fetch`, `secureFetch`, `/api/` ou `Store` dentro do presenter. Todas as chamadas de dados devem vir via callbacks.
   - NUNCA introduza caracteres de emojis Unicode nos arquivos V2 (isso viola `tests/ui_v2_iconography.mjs` que possui allowlist restrita de 30 emojis clássicos). Utilize apenas símbolos seguros como `●` ou os ícones SVG do sprite oficial (`iconSvg(...)`).
4. **Contratos Estritos no Menu Configurações**:
   - Em `actionGroups`, o seletor `#modalFields input` deve conter estritamente **2 inputs** (para passar em `tests/ui_v2_configuration_admin.mjs:75`). Campos adicionais foram implementados como `<select>` e `<textarea>`.
   - Em `taskDefinitions`, os três primeiros campos devem permanecer `name`, `points`, `phase` para compatibilidade com `tests/configuration_persistence.mjs` e `smoke.mjs`.

---

## 2. MAPA DE ARQUIVOS E AÇÕES DE INTEGRAÇÃO

| Arquivo de Origem (`TESTE INTEGRAÇÃO ATRIUM/`) | Arquivo de Destino no Sistema | Modo de Integração |
|---|---|---|
| `js/features/configuration.js` | `js/features/configuration.js` | **Substituir / Mesclar**: Transforma campos superficiais em parâmetros administrativos ricos (SLA, prioridade, checklist, canais de alerta, triggers de automação) e conecta atalhos para os modais de credenciais reais |
| `css/views/ui-v2/configuration.css` | `css/views/ui-v2/configuration.css` | **Anexar ao final**: Adiciona estilos para `.configuration-status-pill`, `.configuration-action-btn` e `.configuration-modal-callout` |
| `js/views/ui-v2/processes-presenter.js` | `js/views/ui-v2/processes-presenter.js` | **Substituir / Mesclar**: Adiciona gaveta de documentos, ordenação 0-N, detecção de candidatos a auto-enriquecimento e banners |
| `js/features/processes.js` | `js/features/processes.js` | **Mesclar pontual**: Passa callbacks `onPreviewDocument` e `onDownloadDocument` ao instanciar o presenter |
| `js/features/tasks.js` | `js/features/tasks.js` | **Mesclar pontual**: Adiciona botão/banner "Acessar processo" no modal de tarefas e aciona `onOpenProcess` |
| `js/features/documents.js` | `js/features/documents.js` | **Mesclar pontual**: Adiciona `extractEventNumber`, ordenação 0-N e isolamento estrito por processo no acervo de Documentos |
| `js/portal.js` | `js/portal.js` | **Mesclar pontual**: Conecta atalhos de configuração (`onOpenJudicialSetup`, `onOpenDataJudModal`, `onOpenGeminiKeyModal`, `onOpenCalendarSetup`, `onOpenEmailConfigModal`) e método `App.openProcess` |
| `index.html` | `index.html` | **Adicionar tags**: Adiciona `#processDocumentsBackdrop`, `#processDocumentsDrawer`, `#processDocumentsBody` e `#processDocumentPreviewPanel` |
| `css/views/ui-v2/processes.css` | `css/views/ui-v2/processes.css` | **Anexar ao final**: Adiciona estilos para o drawer lateral de documentos, cards com badges e preview panel |
| `css/views/ui-v2/tasks.css` | `css/views/ui-v2/tasks.css` | **Anexar ao final**: Adiciona estilos para `.task-completion-actions` e `.task-linked-process-banner` |
| `tests/configuration_feature.mjs` | `tests/configuration_feature.mjs` | **Substituir**: Atualiza lista de campos esperados (`expectedFields`) cobrindo as 10 seções enriquecidas |

---

## 3. ESPECIFICAÇÃO DETALHADA DAS FEATURES

### Feature 1: Menu "Configurações" como Painel Operacional Acionável
- **Problema Anterior**: Clicar nos itens das categorias de configuração abria apenas campos de edição de texto com nomes genéricos, sem permitir configurar o comportamento prático do escritório.
- **Solução Implementada**:
  - **Integrações**: 
    - Exibe status real (`Ativo`, `Pausado`, `Preparado`) via botões interativos `.configuration-status-pill` que alternam com um clique.
    - Exibe o botão de ação rápida `Configurar Conexão ⚙`.
    - Ao abrir a edição de qualquer integração oficial (TJRS/eproc, DataJud/DJEN, Google Gemini IA, Calendário iCal, E-mail IMAP/SMTP), exibe um banner de destaque dourado `.configuration-modal-callout` com o botão **"Abrir Painel de Credenciais & Conexão →"**, que comuta diretamente para o modal do subsistema correspondente (`App.openJudicialSetup()`, `App.openDataJudConfigModal()`, `App.openGeminiKeyModal()`, `App.openCalendarConfigModal()`, `App.openEmailConfigModal()`).
  - **Definições de Tarefas**:
    - Campos operacionais reais: Prazo padrão (SLA em dias úteis), Prioridade sugerida (Normal, Alta, Urgente, Baixa), Responsável sugerido, Exigência documental (sim/não), Status no catálogo e Instruções / Checklist de execução detalhado.
    - Badges dinâmicos na lista com contagem de pontos e botão rápido para alternar Ativa/Inativa.
  - **Notificações**:
    - Canais de entrega (Painel In-App, E-mail, Alerta Sonoro, Banner Crítico em Tela), Momento do envio (Imediato, 24h antes, 48h antes, 08:00 do dia), Nível de gravidade, Gatilho para criação automática de tarefa no kanban e alternador de estado Ativa/Pausada.
  - **Demais Seções Enriquecidas**:
    - *Tipos de Ação*: Rito processual sugerido (Comum, Sumaríssimo, Execução, Especial), tribunal padrão e duração média estimada.
    - *Etapas*: Alerta de estagnação em dias (SLA máximo) e próxima etapa sugerida no pipeline.
    - *Origens*: Canal de captação, comissão/parceria padrão em % e atendente responsável.
    - *Metas*: Meta mensal em R$ (faturamento de novos fechamentos), meta de pontos e período de apuração.
    - *Caixa de Entrada*: Regras de filtro de publicações, limite de exibição e destaque de urgências.

### Feature 2: Acesso Direto ao Processo pela Tarefa (Tasks -> Processes)
- **Onde**: Drawer/Modal de Tarefas (`#modalBackdrop[data-modal-mode="task"]`).
- **O que faz**:
  - Quando a tarefa possui processo vinculado, exibe botão no topo:
    `<button type="button" class="button ghost task-process-quick-link" id="btnOpenTaskProcess">Acessar processo</button>`
    e o banner contextual `.task-linked-process-banner`.
  - Ao clicar, fecha o modal de tarefa e aciona `App.openProcess(process)`, comutando para a tela de Processos e abrindo o inspector.

### Feature 3: Gaveta Lateral de Documentos do Processo com Preview Contextual
- **Onde**: Inspector de Processos (`#processInspectorContent`).
- **O que faz**:
  - Clicar em "Ver documentos" abre a gaveta lateral `#processDocumentsDrawer` sem sair do contexto do processo.
  - Lista as peças em ordem cronológica de eventos (Ev. 000, Ev. 001, etc.) com badge `Oficial A1` para peças extraídas dos autos.
  - Clicar em "Preview" abre o leitor contextual `#processDocumentPreviewPanel` com download direto.

### Feature 4: Isolamento Estrito e Ordenação por Eventos no Acervo Geral
- **Onde**: Workspace geral de Documentos (`#view-documents`).
- **O que faz**:
  - Ao selecionar um processo no filtro, isola estritamente os documentos daquele processo.
  - Ordena automaticamente de 000 a N pelos números de evento.
  - Botão "Limpar filtro" para restaurar a visão global.

---

## 4. COMANDOS DE TESTE E VALIDAÇÃO QUE O CODEX DEVE EXECUTAR
Após aplicar o patch ou arquivos, execute os testes automatizados no terminal para garantir 100% de aprovação:

```bash
# 1. Validação modular de Configurações (novo contrato e schemas)
node tests/configuration_feature.mjs

# 2. Validação administrativa e RBAC de Configurações UI V2
node tests/ui_v2_configuration_admin.mjs

# 3. Validação de persistência e reload de Configurações
node tests/configuration_persistence.mjs

# 4. Validação de Processos V2 (inclui Pureza Arquitetural do Presenter)
node tests/ui_v2_processes.mjs

# 5. Validação de Tarefas V2 (fluxo de estados, formulário e modal)
node tests/ui_v2_tasks.mjs

# 6. Validação de Documentos V2 (catálogo, isolamento e preview read-only)
node tests/ui_v2_documents.mjs

# 7. Validação de Iconografia (garantia de zero emojis ilegais no V2)
node tests/ui_v2_iconography.mjs

# 8. Smoke Test Completo E2E do ATRIUM
node tests/smoke.mjs
```
*Critério de Sucesso: Todos os 8 testes acima devem reportar código de saída 0.*

---

## 5. PROMPT PRONTO PARA COPIAR E COLAR NO CODEX

```text
Olá, Codex! O menu "Configurações" do ATRIUM foi aprimorado no laboratório para ser 100% funcional e operacional, e as funcionalidades seguras de UI (Tarefas → Processo, Gaveta de Documentos e Isolamento do Acervo) já foram testadas e validadas sobre a versão 2.1.1 (commit 449be7f).

Siga rigorosamente as instruções do arquivo docs/CODEX_INTEGRATION_PROMPT.md.

Para facilitar e evitar qualquer reescrita ou gasto de créditos, foi gerado um patch limpo com as features seguras (sem senhas, sem dados locais, sem segredos):
c:\projetos IA\consulta tjrs atrium\docs\atrium-2.1.1-safe-features.patch

Você pode aplicar diretamente via git:
git apply "c:\projetos IA\consulta tjrs atrium\docs\atrium-2.1.1-safe-features.patch"

Principais garantias que devem ser mantidas:
1. Em `actionGroups`, o seletor `#modalFields input` deve ter exatamente 2 elementos input (o restante dos campos enriquecidos usa <select> e <textarea>) para passar em tests/ui_v2_configuration_admin.mjs.
2. Em `taskDefinitions`, os 3 primeiros campos são name, points, phase para manter compatibilidade com tests/configuration_persistence.mjs e smoke.mjs.
3. Preservar a pureza arquitetural de `processes-presenter.js` (zero chamadas de fetch/Store diretas).
4. Rodar e aprovar a suíte de testes:
   - node tests/configuration_feature.mjs
   - node tests/ui_v2_configuration_admin.mjs
   - node tests/configuration_persistence.mjs
   - node tests/ui_v2_processes.mjs
   - node tests/ui_v2_tasks.mjs
   - node tests/ui_v2_documents.mjs
   - node tests/smoke.mjs

Confirme a aplicação e o resultado 100% verde dos testes.
```
