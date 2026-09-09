# PROMPT E GUIA MESTRE DE INTEGRAÇÃO PARA O OPENAI CODEX / AGENTE
> **Missão**: Integrar ao sistema principal ATRIUM 2.1.1 (Commit `449be7f`) todas as funcionalidades desenvolvidas e validadas no laboratório `consulta tjrs atrium / TESTE INTEGRAÇÃO ATRIUM`, preservando 100% da integridade visual e estabilidade do sistema com máximo reaproveitamento e mínimo gasto de créditos.
>
> **Status de Validação Local**: Aprovado com 100% dos testes passando (`stable_release_contract`, `ui_v2_processes`, `ui_v2_tasks`, `ui_v2_documents`, `ui_v2_iconography`, `decision_html_and_access_key`, `smoke`).
> **Servidor Local Rodando**: Porta 4188 (`http://127.0.0.1:4188`).

---

## 1. DIRETRIZES FUNDAMENTAIS PARA O CODEX (RESTRIÇÕES DE OURO)
1. **Preservação Visual e Estrutural**: NÃO reescreva telas, layouts, paletas de cores ou menus existentes. O objetivo é estritamente **adicionar as features** descritas abaixo.
2. **Reaproveitamento Máximo de Arquivos (Zero Desperdício de Créditos)**:
   - Os arquivos integrados já estão prontos e testados diretamente no commit `4cc335b` (baseado no `449be7f`).
   - Caminho base de origem dos arquivos deste laboratório:
     `c:\projetos IA\consulta tjrs atrium\TESTE INTEGRAÇÃO ATRIUM\`
   - O Codex pode aplicar diretamente o patch unificado:
     `git apply "c:\projetos IA\consulta tjrs atrium\TESTE INTEGRAÇÃO ATRIUM\atrium-2.1.1-features.patch"`
     ou copiar os arquivos listados na seção 2.
3. **Pureza Arquitetural V2**:
   - Arquivos `*-presenter.js` (em especial `processes-presenter.js`) devem permanecer **puros**: NUNCA utilize `fetch`, `secureFetch`, `/api/` ou `Store` dentro do presenter. Todas as chamadas de dados devem vir via callbacks (`onPreviewDocument`, `onDownloadDocument`, etc.).
   - NUNCA introduza caracteres de emojis Unicode nos arquivos V2 (isso viola `tests/ui_v2_iconography.mjs` que possui allowlist restrita de 30 emojis clássicos). Utilize apenas símbolos seguros como `●` ou os ícones SVG do sprite oficial (`iconSvg(...)`).
4. **Resolução de Conflitos e Ajustes Cirúrgicos**:
   - O Codex está autorizado a fazer pequenas adaptações de imports ou nomes de instâncias locais se a versão do repositório de destino tiver divergências pontuais, desde que preserve o contrato funcional e os 8 botões originais no rodapé do inspector.

---

## 2. MAPA DE ARQUIVOS E AÇÕES DE INTEGRAÇÃO

| Arquivo de Origem (`TESTE INTEGRAÇÃO ATRIUM/`) | Arquivo de Destino no Sistema | Modo de Integração |
|---|---|---|
| `js/views/ui-v2/processes-presenter.js` | `js/views/ui-v2/processes-presenter.js` | **Substituir / Mesclar**: Adiciona gaveta de documentos, ordenação 0-N, detecção de candidatos a auto-enriquecimento e banners |
| `js/features/processes.js` | `js/features/processes.js` | **Mesclar pontual**: Passa callbacks `onPreviewDocument` e `onDownloadDocument` ao instanciar o presenter |
| `js/features/tasks.js` | `js/features/tasks.js` | **Mesclar pontual**: Adiciona botão/banner "Acessar processo" no modal de tarefas e aciona `onOpenProcess` |
| `js/features/documents.js` | `js/features/documents.js` | **Mesclar pontual**: Adiciona `extractEventNumber`, ordenação 0-N e isolamento estrito por processo no acervo de Documentos |
| `js/portal.js` | `js/portal.js` | **Mesclar pontual**: Adiciona `App.openProcess(processOrId)` e trigger de auto-enriquecimento silencioso `triggerAutoEnrichEproc()` |
| `index.html` | `index.html` | **Adicionar tags**: Adiciona `#processDocumentsBackdrop`, `#processDocumentsDrawer`, `#processDocumentsBody` e `#processDocumentPreviewPanel` |
| `css/views/ui-v2/processes.css` | `css/views/ui-v2/processes.css` | **Anexar ao final**: Adiciona estilos para o drawer lateral de documentos, cards com badges e preview panel |
| `css/views/ui-v2/tasks.css` | `css/views/ui-v2/tasks.css` | **Anexar ao final**: Adiciona estilos para `.task-completion-actions` e `.task-linked-process-banner` |
| `server.mjs` | `server.mjs` | **Mesclar pontual**: Adiciona verificação de auto-enriquecimento A1 para processos TJRS na sincronização |
| `lib/judicial/eproc-a1-downloader.mjs` | `lib/judicial/eproc-a1-downloader.mjs` | **Copiar / Atualizar**: Contém o motor `downloadProcessWithA1` e `sweepAndEnrichProcessesWithA1` |

---

## 3. ESPECIFICAÇÃO DETALHADA DAS FEATURES

### Feature 1: Acesso Direto ao Processo pela Tarefa (Tasks -> Processes)
- **Onde**: Drawer/Modal de Tarefas (`#modalBackdrop[data-modal-mode="task"]`).
- **O que faz**:
  - Quando a tarefa possui processo vinculado (via `defaults.processId`, `defaults.process` ou CNJ), exibe um botão no topo:
    `<button type="button" class="button ghost task-process-quick-link" id="btnOpenTaskProcess">Acessar processo</button>`
    e o banner contextual `.task-linked-process-banner` com dados da parte e do processo.
  - Ao clicar, fecha o modal de tarefa e aciona `App.openProcess(process)`.
  - `App.openProcess` chaveia a tela para `processes` e abre imediatamente o inspector do processo (`getProcessesFeature().openDetails(process)`).

### Feature 2: Menu Lateral de Documentos do Processo com Preview Contextual
- **Onde**: Inspector de Processos (`#processInspectorContent`).
- **O que faz**:
  - Clicar no botão "Ver documentos" ou em peças na "Linha do tempo jurídica" NÃO redireciona o usuário para a aba geral de Documentos.
  - Em vez disso, abre a gaveta lateral `#processDocumentsDrawer` exibindo exclusivamente as peças do processo selecionado.
  - As peças são listadas em ordem cronológica de eventos (000, 001, 002... a N) com identificadores visuais:
    - Badge de Evento: `Ev. 000`, `Ev. 001`, etc.
    - Badge Oficial: `Oficial A1` para peças extraídas do eproc.
    - Metadados: data, tipo e tamanho.
  - Ao clicar em "Preview" em qualquer documento, o painel contextual `#processDocumentPreviewPanel` é aberto dentro da própria gaveta, permitindo ler o texto/imagem e baixar a peça oficial sem perder o contexto do processo.
  - Botão "Voltar ao processo" retorna ao drawer do processo.

### Feature 3: Isolamento Estrito e Ordenação por Eventos (0 a N) no Acervo de Documentos
- **Onde**: Workspace geral de Documentos (`#view-documents`).
- **O que faz**:
  - No filtro de proprietário por processo (`#documentOwnerType = 'process'` e `#documentOwnerId`), o acervo isola **estritamente** os documentos daquele processo.
  - Ordena automaticamente de forma crescente pelos números de evento do eproc (`extractEventNumber` via regex `^(\d{1,5})\s*[-_.]` ou `evento\s*(\d+)`).
  - Mostra badge `Ev. 000` e `Oficial A1` em cada card de documento.
  - Adiciona o botão "Limpar filtro (Ver todos os documentos)" para retornar à listagem geral sem esforço.

### Feature 4: Flag e Auto-Enriquecimento eproc TJRS para Processos sem Cliente ou em Segredo
- **Critérios de Identificação**:
  - Tribunal é TJRS (CNJ contém `.8.21.` ou tribunal `TJRS`).
  - Cliente ausente ou genérico: nome vazio, "Cliente Geral", "Cliente não informado", "Cliente do Escritório", "SIGILO", "Segredo de Justiça", ou `isKnownClientName() === false`.
  - E/ou `secrecy: true` / tag `segredo-de-justica`.
- **Comportamento Visual**:
  - Na listagem de processos: tag visual `● Enriquecimento eproc`.
  - No inspector de processos: banner informativo:
    `● Identificação eproc pendente: Processo em segredo de justiça ou sem cliente identificado. O coletor eproc A1 busca os dados oficiais automaticamente.`
- **Comportamento Automático**:
  - Em segundo plano (sem intervenção manual do usuário), o portal invoca `POST /api/integrations/eproc/sweep`.
  - O backend utiliza as credenciais seguras configuradas (Certificado A1 e TOTP) para autenticar no eproc TJRS, abrir o processo, descobrir as partes e os andamentos, e persistir no CRM.
  - Ao concluir, o store do ATRIUM é recarregado e a interface atualiza o cliente e as partes contrárias automaticamente.

### Feature 5: Reconciliação no CRM (Dados Já Consolidados)
- Contato do cliente:
  - **Nome**: `VALENTIM DE LUCA`
  - **CPF**: `309.514.020-72`
  - **Papel**: `cliente`
  - **Vínculo**: Processo `5000890-02.2026.8.21.0091`
- Contato adverso:
  - **Nome**: `MARCELINA LENY FERREIRA`
  - **CPF**: `232.821.180-15`
  - **Papel**: `adverso`

---

## 4. COMANDOS DE TESTE E VALIDAÇÃO QUE O CODEX DEVE EXECUTAR
Após aplicar os arquivos e mesclagens, execute os seguintes testes automatizados no terminal do projeto para garantir zero regressão:

```bash
# 1. Validação de Processos V2 (inclui Pureza Arquitetural do Presenter)
node tests/ui_v2_processes.mjs

# 2. Validação de Tarefas V2 (fluxo de estados, formulário e modal)
node tests/ui_v2_tasks.mjs

# 3. Validação de Documentos V2 (catálogo, isolamento e preview read-only)
node tests/ui_v2_documents.mjs

# 4. Validação de Iconografia (garantia de zero emojis ilegais no V2)
node tests/ui_v2_iconography.mjs

# 5. Validação de Decisão Judicial, Chave de Acesso e Caderno PDF
node tests/decision_html_and_access_key.mjs

# 6. Validação do Módulo Funcional de Processos
node tests/processes_feature.mjs

# 7. Smoke Test Completo E2E do ATRIUM
node tests/smoke.mjs
```
*Critério de Sucesso: Todos os 7 testes acima devem reportar código de saída 0.*

---

## 5. PROMPT PRONTO PARA COPIAR E COLAR NO CODEX

```text
Olá, Codex! Preciso que você integre as melhorias de funcionalidades desenvolvidas no laboratório ao nosso sistema ATRIUM principal.

Siga estritamente as instruções contidas no documento CODEX_INTEGRATION_PROMPT.md.

Origem dos arquivos com as implementações testadas e aprovadas:
c:\projetos IA\consulta tjrs atrium\TESTE INTEGRAÇÃO ATRIUM\

Principais pontos de atenção:
1. NÃO mude o design, visual ou estrutura de telas já existentes. A integração é exclusivamente de funcionalidades (features).
2. Não reescreva código desnecessariamente para poupar créditos: copie ou mescle cirurgicamente os arquivos conforme a tabela do guia.
3. Mantenha a pureza do `processes-presenter.js`: zero `fetch`, `secureFetch`, `/api/` ou `Store` dentro dele (use callbacks).
4. Não introduza emojis Unicode em arquivos V2.
5. Valide a integração rodando os testes:
   - node tests/ui_v2_processes.mjs
   - node tests/ui_v2_tasks.mjs
   - node tests/ui_v2_documents.mjs
   - node tests/ui_v2_iconography.mjs
   - node tests/smoke.mjs

Por favor, execute a mesclagem e confirme a execução dos testes com 100% de aprovação.
```
