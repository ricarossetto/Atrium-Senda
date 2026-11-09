# UI mode

Status: **CURRENT**

## Purpose

Definir UI V2 como a única apresentação selecionável pelo usuário, preservando a camada Classic apenas como compatibilidade interna temporária sobre a mesma aplicação funcional.

## Canonical authority

`js/views/ui-v2/mode.js`, `js/views/ui-v2/preference-init.js`, `js/views/ui-v2/shell.js`,
`css/views/ui-v2/shell.css`, `js/portal.js` e `index.html`.

## Densidade Basic (filtro visual local)

- `basic` e `pro` usam a mesma App, Store, backend, rotas, RBAC, prazos e regras; muda só a superfície.
- `document.documentElement.dataset.uiDensity` resolve nesta ordem: preferência local válida `atrium_ui_density` (seção Experimental de Configurações), host Basic oficial (`basic.atrium.adv.br` e seus subdomínios), plano oficial do workspace somente em `atrium.adv.br` (também `localhost`/`127.0.0.1` para testes sintéticos), fallback `pro`. Plano `basic` usa `basic`; `pro`, `pro_ia`, ausente ou desconhecido usam `pro`, sem habilitar IA. O prepaint permanece local/host; após autenticação, a densidade é aplicada antes da inicialização do shell. `AtriumAuth.currentWorkspace` expõe uma cópia somente leitura do estado de autenticação: reload usa `/api/auth/status`, cadastro/verify usa o workspace retornado pelo backend, login interativo e setup/verify sem workspace consultam o status autenticado antes de entrar. O usuário completo confirmado pelo GET, inclusive seu papel atual, é adotado na entrada; POST sem usuário ou com identidade incompatível é recusado. Status inicial e cadastro/verify também exigem vínculo válido entre usuário e workspace. Somente a entrada validada marca a sessão como autenticada; falhas limpam identidade e CSRF e não liberam bootstrap tardio. Falha dessa confirmação não abre o shell; logout, login falho e sessão expirada limpam workspace obsoleto. Setup/verify bem-sucedido consome o token local e conserva os códigos na tela de recuperação antes do GET de confirmação; o reconhecimento humano tenta somente GET, sem repetir setup, e falha retorna ao login depois desse reconhecimento. Sem códigos, a falha retorna diretamente ao login. Reentrada com workspace, usuário ou papel diferente da sessão estabelecida recarrega o documento antes de expor o shell, descartando o Store anterior e preservando a preferência local de densidade. A resolução de densidade não faz requests nem acessa o Store.
- O Basic oculta navegação secundária (Financeiro, Cálculos, Relatórios, Documentos, Assistente, Prompts, Links, Atendimentos) e os grupos Gestão/Inteligência, sem remover views, requests ou dados.
- A densidade em uso é sempre visível: chip `brand-density-chip` na identidade do menu só no Basic (PRO não ganha elemento novo; no desktop recolhido ele sai junto do texto da marca, mas permanece no drawer mobile) e linha de estado em Configurações → Experimental, junto do controle que alterna Basic/PRO. A linha distingue **em uso** (`data-ui-density` aplicado) de **preferência gravada** (`atrium_ui_density`): quando divergem, informa os dois valores e que a troca vale após recarregar. Nunca apresentar a preferência pendente como se já estivesse aplicada.
- O chip é indicador visual redundante (`aria-hidden`): não entra no nome acessível do botão da marca, que tem `aria-label` próprio. O estado semântico fica no controle rotulado de Configurações → Experimental (checkbox com nome próprio, linha de estado em texto e aviso por toast), que é o destino acessível da preferência.
- A troca de densidade atualiza a linha de estado em linha (sem reconstruir o bloco), preservando o foco do checkbox e mantendo a live region `role="status"` ativa. O aviso só declara "Preferência gravada" depois de reler o valor do `localStorage`; gravação não confirmada gera aviso de falha, nunca sucesso presumido.
- Somente preferência local de UI; zero `Store.save()`, `Store.flush()`, `revision`, request ou backend.

## Criação rápida global

- O topbar expõe um único gatilho **Novo** com menu de seis destinos: tarefa, compromisso, contato, processo, lançamento financeiro e atendimento. Cada item reutiliza o modal oficial da feature; o quick-add não possui formulário próprio, Store, `revision`, request ou permissão paralela.
- Abrir ou fechar o menu é apenas apresentação local e não dispara mutation. A ação escolhida respeita o RBAC e o fluxo de confirmação já existente em cada feature.
- Teclado: setas, Home/End, Enter/Espaço e Escape; ao fechar sem abrir modal, o foco retorna ao gatilho. Em mobile, o gatilho mantém alvo de 44px e o menu não ultrapassa a viewport.
- O menu usa `role="menu"` com `menuitem`; o gatilho usa `aria-haspopup="menu"` e `aria-expanded`.

## Invariants

- Existe um único App, um único Store e uma única árvore operacional por feature.
- Trocar `data-ui` altera apresentação local, não dados, revision ou regras de negócio.
- V2 é padrão e única apresentação exposta ao usuário.
- Classic não aparece na navegação nem nas configurações; sua árvore interna pode permanecer durante a transição para testes de compatibilidade, sem virar uma segunda aplicação.

## Allowed operations

- Persistir somente a preferência visual local prevista pelo controlador de modo.
- Escolher presenter Classic ou V2 sobre callbacks e dados oficiais únicos.

## Forbidden operations

- Criar segunda feature, Store, listener funcional ou request por causa do modo.
- Reexpor Classic como preferência ou alternativa selecionável sem gate explícito.

## State model

`v2` para toda sessão de produto. O valor `classic` é reservado à compatibilidade interna e não integra o estado jurídico persistido.

## Security boundary

O modo não altera autenticação, RBAC, CSRF, payloads nem autoridade do backend.

## Failure semantics

Preferência ausente ou inválida usa o default oficial sem bloquear o boot.

## Persistence semantics

Somente preferência local de UI; zero `Store.save()`, `Store.flush()` ou revision.

O tema visual também é uma preferência local independente. Sem escolha salva, o ATRIUM inicia
em tema claro. O seletor fica disponível desde a tela de autenticação e permanece sincronizado
com o seletor da aplicação; a escolha `light` ou `dark` usa a chave `atrium_theme` no navegador.
O `theme-color` acompanha essa escolha desde o prepaint e nas trocas de tema da aplicação,
autenticação e landing embutida, sem alterar dados ou navegação.

As referências primárias de composição desktop são 1920×1080 (padrão principal), 1920×1200
(notebook) e 2560×1080 (ultrawide). Viewports menores continuam cobertos como comportamento
responsivo complementar.

## Navegação e URL

- Os painéis internos usam rotas de caminho separadas por categoria:
  `/visao-geral`, `/trabalho/*`, `/relacionamento/*`, `/gestao/*`, `/inteligencia/*` e `/sistema/*`.
- Cliques de navegação do usuário (`[data-view]` e `[data-view-link]`) atualizam a URL via
  `history.pushState`; trocas programáticas de `switchView` não gravam URL.
- Reload, deep-link, `popstate` e `hashchange` restauram a view oficial; hashes legados
  (`#configuration`, `#admin`, ...) são convertidos para o caminho correspondente.
- `/sistema/administracao` continua restrito a `admin`/`master_admin`.
- O item de navegação ativo expõe `aria-current="page"`.
- O atalho "Pular para o conteúdo principal" permanece alcançável por Tab, aparece no foco e transfere o foco a `#appMain` sem alterar a rota nem recarregar a aplicação; `<base href="/">` não pode transformá-lo em navegação ao documento raiz. Cobertura: `tests/ui_v2_shell_keyboard_regression.mjs`.
- Até 860px, a UI V2 apresenta a navegação inferior Hoje, Tarefas, Publicações, Agenda e Mais. Os quatro destinos usam as rotas existentes; Mais abre o mesmo menu lateral com as demais áreas, respeitando permissões e restaurando o foco ao fechar. Em áreas secundárias, Mais indica a seção ativa sem criar segunda árvore funcional. No Safari, o viewport usa `viewport-fit=auto` para o navegador reservar automaticamente as áreas do notch e do indicador inferior; o shell conserva seus insets CSS para contextos que os expõem.
- Até 860px, apenas com `#appShell` ativo na UI V2, `html` mantém a altura do viewport (`100dvh`) sem rolagem e `body` é o contêiner rolável. O `scroll-padding-top` do `body` reserva o cabeçalho expandido fixo para âncoras e foco, inclusive na leitura. Trocar de view volta imediatamente ao topo do `body`, junto com a expansão do chrome; overlays bloqueiam e restauram esse scroll. Landing, login e desktop mantêm a rolagem anterior.
- Na UI V2 móvel autenticada, o chrome alterna entre `expanded` e `reading` conforme a direção de rolagem do `body`: no topo ou ao subir, pesquisa, utilidades e navegação inferior aparecem; ao descer, pesquisa e utilidades colapsam em altura e a navegação inferior se recolhe, mantendo hamburger, título e marca visíveis. O cabeçalho é uma camada fixa com espaço reservado constante no conteúdo; a view não muda de posição documental nem salta quando a busca colapsa ou expande. Mudança de view, interação por teclado, foco em controles, abertura de menu, notificações ou modal restauram o chrome expandido. Os controles recolhidos ficam inertes; a navegação inferior, incluindo seu padding de safe-area, conclui a transição visual antes de sair da árvore visual. A cor de `html`/`body` atrás da barra inferior permanece na superfície enquanto a barra se move e só passa ao fundo do conteúdo quando `is-chrome-hidden` a retira da pintura; na expansão, volta à superfície junto com a remoção dessa classe, em ambos os temas e inclusive com movimento reduzido. A transição dura até 340 ms; mesmo sem `transitionend` ou após `transitioncancel`, o estado de pintura inferior deve terminar sincronizado com a barra. Após cancelamento, a geometria é reavaliada por até 600 ms, sem retirar a barra ainda visível; a expansão invalida essa recuperação. A preferência por movimento reduzido dispensa a animação. Esse estado é apenas visual e não persiste dados nem muda rotas ou insets de safe-area.
- Cada seção do menu lateral V2 é um botão acessível (`aria-expanded`/`aria-controls`) que recolhe e expande o grupo; o padrão é sempre todos expandidos e o estado é apenas em memória (o shell não cria persistência de apresentação). A ordem do grupo Trabalho é Gestão de tarefas, Publicações, Agenda e Processos e casos.
- **Personalização do painel (experimental)**: a seção `Experimental` de Configurações oferece ligar/desligar blocos do dashboard. A preferência é **somente deste navegador** (`localStorage`, chave `atrium_dashboard_widgets`), **desligada por padrão** — desligada, o layout permanece exatamente o atual e o grid de duas colunas é restaurado; ligada, os blocos desmarcados são ocultados (`hidden`) e o workspace ajusta a coluna. Não há Store, `revision`, request, backend, permissão, prazo ou dado alterado por essa preferência, e ela não entra no catálogo de skills nem em release. Catálogo e regras em `js/core/dashboard-widgets.js`; cobertura em `tests/dashboard-widgets.test.mjs` e `tests/ui_v2_dashboard_widgets.mjs`.
- Nas listas paginadas de Contatos, Processos, Tarefas (Lista), Documentos, Atendimentos, Financeiro, Auditoria e expedientes PJe, trocar de página aplica uma entrada com fade lateral curto somente ao conteúdo novo. Busca, filtros, mudança de tamanho, seleção e carregamento inicial não animam. Os controles permanecem estáveis e focáveis; movimento reduzido dispensa o efeito. A transição não altera dados, requisições, revisão nem a ordem de navegação.
- O servidor reconhece as rotas de painel como SPA e serve `index.html`; hospedagens de arquivos estáticos aplicam o roteamento do próprio provedor.
- Nos candidatos nativos, Android 15+ reserva as barras do sistema no contêiner do WebView;
  iOS/iPadOS permite gestos de retorno/avanço do WKWebView. Uma navegação externa
  bloqueada não substitui a página interna já válida por uma tela de erro; falhas
  reais de carregamento continuam visíveis. Build iOS, interação autenticada e
  conferência visual em aparelho físico permanecem pendentes.

## Cadastro público progressivo

- `#authRegisterForm` apresenta Conta → Escritório; o seletor de plano é opcional, aberto por **Ver planos**, e sem ele vale o Pro. Tudo fica na mesma árvore de formulário. Continuar/Voltar preservam valores somente no DOM/memória, sem request ou persistência intermediária; reload não recupera o cadastro.
- Validação do passo ativo não tenta focar campos ocultos. Confirmar o cadastro revalida todos os campos, revela o primeiro passo inválido e foca seu campo.
- O payload completo é capturado antes de bloquear controles; somente a confirmação final chama `/api/auth/workspaces/register`. Guarda in-flight impede requests duplicados e mudança de etapa durante o envio. Falha preserva os dados e mostra erro durável junto da ação; após desbloquear, restaura foco ao gatilho ainda visível no mesmo passo. Sucesso segue ao TOTP existente, sem restaurar foco no cadastro oculto.
- OAB/UF permanecem opcionais; nenhuma cobrança ou ativação de IA é inferida do cadastro.
- Topbar de autenticação ocupa linha própria no grid do painel, com espaço reservado separado do card/abas e controles com alvo mínimo de 44px. Login, cadastro, setup, TOTP, recovery e convite compartilham essa regra, sem posicionamento sobre o formulário.
- Autoridade: `index.html`, `js/auth.js`, `css/views/ui-v2/auth.css`; testes `tests/ui_v2_auth_topbar.mjs`, `tests/ui_v2_auth_shell.mjs` e `tests/ui_v2_plan_density.mjs`.

## Onboarding oficial — wizard e passo A1

Esta subseção descreve o fluxo funcional de entrada, não uma preferência de modo ou densidade. O contrato de densidade Basic acima permanece inalterado; F3 local (densidade por plano) não integra o PATCH 6.29.1.

### Autoridade e sequência

- Autoridade executável: `js/features/setup-wizard.js`, `js/components/onboarding.js`, orquestração em `js/portal.js`, shell em `index.html` e estilos em `css/views/ui-v2/setup-wizard.css`.
- Os marcadores de sessão `atrium_pending_a1_onboarding` e `atrium_pending_setup_wizard` identificam a entrada pendente. Quando ambos existem, o passo A1 tem precedência; o wizard abre depois da confirmação da configuração A1. Não há timers concorrentes de abertura A1/wizard/apresentação; o timer da apresentação é cancelado/guardado contra overlay ativo.
- Escritório novo não recebe mais o wizard nem a apresentação automaticamente (decisão do operador em 02/11/2026): depois do passo A1, o painel mostra o bloco **Comece por aqui** (`js/views/ui-v2/first-steps.js`), derivado do estado oficial, somente para `master_admin` e enquanto houver passo pendente. O wizard e a apresentação seguem disponíveis em Configurações.
- A abertura automática do wizard exige marcador pendente e perfil `master_admin`; conclusão já confirmada limpa o marcador. O adiamento não consome o marcador nem é conclusão, portanto não há garantia de exibição única após adiar.
- Configurações oferece **Primeiros passos** somente a `master_admin`; a guarda funcional também recusa outros perfis e overlay concorrente. A reabertura preenche `courts`, `teamSize`, `processVolume` e `aiInterest` de `settings.workspaceProfile`, sem persistir ao abrir. Equipe, volume e IA validam opções conhecidas; `courts` preserva strings salvas, inclusive fora do catálogo.

### Confirmação e falha de persistência

- Concluir ou abrir Integrações/Configurações pelo resumo passa pela mesma gravação de `settings.workspaceProfile` e `settings.onboardingWizardCompleted` no Store oficial. Só `Store.flush() === true`, após `Store.save()`, autoriza fechar, limpar o marcador, anunciar sucesso e navegar.
- Retorno `false`, exceção, HTTP 500 ou 409 não são sucesso. O wizard conserva as escolhas em memória para nova tentativa e mostra erro durável (`role="alert"`), inclusive ao voltar/editar. Os campos de settings tentativos são restaurados quando ainda pertencem à operação; não sobrescrever estado mais recente. Conflito mantém a semântica de recuperação do Store, sem ocultar 409 ou forçar revisão.
- X/Escape no wizard adiam: não gravam perfil/conclusão nem retiram o marcador. Enquanto a confirmação está em andamento, controles e fechamento ficam bloqueados; sessão perdida retorna ao fluxo de autenticação em vez de simular sucesso.
- O passo A1 também exige flush confirmado para registrar `settings.hasA1Certificate` e seguir ao wizard, inclusive na opção sem certificado. Escape não dispensa esse passo.
- Vinculação A1 usa a rota autenticada oficial `/api/integrations/judicial/certificate`. Depois de resposta de upload bem-sucedida, limpa os campos de arquivo e senha. Se somente o salvamento de settings falhar, mantém a vinculação já confirmada na operação aberta: o retry grava apenas settings, sem reenviar arquivo/senha. Isso não promete recuperação dessa memória após reload nem validação nacional do certificado.

### Foco, layout e linguagem

- Inicialização idempotente, bloqueio de submissões repetidas, `aria-busy`, foco inicial/contido por Tab e Shift+Tab, shell `inert` e bloqueio do scroll do body durante o overlay. Ao fechar, restaurar inert/overflow anteriores e foco ao gatilho disponível; deep-link confirmado foca o destino.
- Wizard e A1 limitam a altura do diálogo e reservam cabeçalho/rodapé; conteúdo excedente rola no corpo. No mobile, não alargar o documento: senha A1 com fonte de 16px e ações com alvo de pelo menos 44px, inclusive em altura de 500px.
- As quatro perguntas registram interesse em tribunais, equipe, volume e IA. Não alteram portais, certificado, permissões, frequência de consultas ou painel; copy não promete cadência ou configuração integral concluída. Este contrato não entrega F3, billing, trial ou nova cobertura nacional.

### Seletor de tribunais e órgãos

- O passo `courts` usa os 107 órgãos de `CNJ_TRIBUNALS` e os grupos de `CNJ_SEGMENTS`, em `js/core/cnj.js`, incluindo conselhos e circunscrições militares (CJM). O catálogo identifica órgãos; não certifica cobertura, portal disponível ou integração ativa.
- Novas seleções usam a sigla oficial em minúsculas. As quatro strings legadas `tjrs`, `trt4`, `trf4` e `tjdft` continuam válidas, sem depreciação ou migração. Outras strings salvas são preservadas literalmente, deduplicadas e escapadas, no grupo “Seleções salvas fora do catálogo”; remoção só por escolha explícita ou Limpar seleção.
- O seletor abre sob demanda, com resumo compacto (contagem, até três siglas e excedente). Busca por sigla, nome ou grupo ignora caixa e acentos, sem alterar seleções; resultado vazio não apaga escolhas. Voltar/avançar mantém o estado em memória; não há gravação intermediária nem ativação de portais, consultas, sync ou envio de e-mail.
- Abrir foca a busca; Fechar seleção ou o primeiro Escape fecha apenas o seletor e retorna o foco ao gatilho. Escape seguinte adia o wizard. Tab/Shift+Tab permanecem contidos no diálogo; durante confirmação, `aria-busy`, controles e fechamento continuam bloqueados. Conclusão e deep-links mantêm a exigência de `Store.flush() === true`, sem ocultar falhas ou 409.

### Testes de contrato

`tests/ui_v2_setup_wizard_courts.mjs`, `tests/cnj_numbering.test.mjs`, `tests/onboarding_component.mjs`, `tests/ui_v2_setup_wizard.mjs`, `tests/shared_components.mjs` e `tests/judicial_integrations_feature.mjs`; sintaxe em `scripts/check-syntax.mjs`. A suíte do wizard cobre false/exceção, HTTP 500/409, retry confirmado, deep-links, reload/prefill, adiamento, precedência A1, foco/inert/locks e matriz local light/dark com larguras 1280/390 e alturas 844/500. A suíte `ui_v2_setup_wizard_courts.mjs` cobre catálogo completo, legado/desconhecido, busca, teclado, busy, HTTP 500/409, retry, reload/prefill, ausência de requests operacionais e geometria em 1280×844, 1024×844, 390×844 e 390×500, light/dark. Upload A1 nas provas usa mock e dados sintéticos, não certificado real. Cobertura de teste não equivale a execução verde, inspeção dos prints ou validação de produção; o registro do release discrimina essas evidências.

## Relevant tests

`tests/ui_v2_mode_contract.mjs`, `tests/ui_v2_basic_density.mjs`, `tests/ui_v2_basic_density_browser.mjs`, `tests/ui_v2_final_parity.mjs`, `tests/ui_v2_runtime_hygiene.mjs`,
`tests/ui_v2_sidebar_navigation.mjs`, `tests/ui_v2_mobile_dynamic_chrome.mjs`,
`tests/ui_v2_mobile_safe_area.mjs`, `tests/ui_v2_mobile_safe_area_webkit.mjs`,
`tests/ui_v2_mobile_shell_frames.mjs`, `tests/ui_v2_mobile_shell_timing.mjs`,
`tests/configuration_persistence.mjs`.
