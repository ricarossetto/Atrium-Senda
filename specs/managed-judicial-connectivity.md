# Conectividade judicial gerenciada

Status: **CURRENT**

## Purpose

Supervisionar cobertura judicial por identidade e portal, com estratégia explícita, sessão isolada, cadência conservadora e backoff.

## Canonical authority

`lib/judicial/managed-connectivity.mjs`, `lib/judicial/session-manager.mjs`, `lib/judicial/credential-manager.mjs`, `collector/agent.mjs` e `server.mjs`.

## Invariants

- A1, PJeOffice, Windows Store, usuário/senha/TOTP e sessão interativa são estratégias distintas.
- Estado é isolado por usuário + identidade + portal.
- “Verificado” exige fonte pública oficial ou evidência explícita; demais portais ficam `experimental` ou `not_verified`.
- Um único coletor gerenciado executa por vez no servidor.
- Recarregar a página, abrir outra aba ou repetir a autenticação **nunca** inicia sincronização. A única sincronização automática completa é a do primeiro acesso (conta recém-criada, marcador de sessão consumido uma única vez); os ciclos seguintes são silenciosos no servidor às 07:00 e 19:00 BRT, e o botão Sincronizar permanece manual e sempre completo.
- No primeiro acesso, a criação da conta ocorre antes da configuração profissional. OAB e seccional são opcionais e devem ser preenchidas em conjunto; quando informadas, o usuário decide explicitamente se deseja ativar o monitoramento automático. A ação final distingue claramente continuar sem monitoramento de ativá-lo. Somente a escolha afirmativa forma o termo principal e libera o ciclo automático silencioso do servidor (07:00/19:00 BRT).

## Allowed operations

- `authenticate`, `health`, `discoverCases`, `fetchMovements`, `fetchPublications`, `disconnect` em adapter declarado read-only.
- Atualização manual explícita (botão Sincronizar), sempre completa; no primeiro acesso, uma sincronização completa automática; quando o monitoramento automático foi aceito, ciclos silenciosos no servidor às 07:00 e 19:00 no fuso `America/Sao_Paulo`. Nenhuma sincronização é disparada por recarregamento, nova aba ou nova autenticação.
- Antes de consolidar o Store, a sincronização geral aguarda a leitura completa do acervo nos portais autenticados habilitados. Essa etapa descobre os processos do procurador independentemente de haver publicação recente; DJEN e DataJud continuam no encadeamento público posterior e não são executados em duplicidade pelo coletor gerenciado.
- Sessão assistida permanece disponível somente para o coletor local compatível. A interface web não oferece esse comando porque a autenticação operacional ocorre pelo executor do backend.

## Forbidden operations

- Adapter com `acknowledge`, `science`, `sign`, `file`, `protocol`, `petition` ou `confirmDeadline`.
- Retry rápido, loop durante ação humana ou alegação de suporte live sem evidência.

## State model

`not_configured`, `authenticating`, `connected`, `action_required`, `expired`, `error`; registra última tentativa/sucesso, próxima atualização e falhas.

**Job eproc (scheduler)**: portais em `PENDING`, `RUNNING`, `COMPLETED`, `PARTIAL`, `ERROR`; o job agrega em `COMPLETED`, **`COMPLETED_WITH_WARNINGS`** (algum portal terminou com ressalvas) ou `ERROR` (algum portal falhou sem nenhum item coletado). Um portal que retorna erro **mas** coletou/persistiu itens vira `PARTIAL` com a ressalva explícita em `warnings` — nunca `ERROR` genérico: o que entrou no acervo continua válido e a UI mostra "Concluída com ressalvas" com o motivo. Falha sem nenhum dado coletado permanece `ERROR` e a UI mantém "Interrompida". Cobertura: `tests/eproc-scheduler-contract.mjs`.

## Security boundary

Credenciais permanecem no cofre cifrado do workspace. Workspaces não padrão não herdam o cofre raiz nem fallbacks de ambiente; cobertura pública contém apenas estado e erros sanitizados. A sincronização A1 oficial (relatório oficial + painel), o enriquecimento pontual (`enrich-single`) e o download de autos usam exclusivamente o cofre e o perfil de browser do workspace do chamador; sem o gestor de credenciais do workspace a operação falha fechada com `EPROC_CREDENTIAL_MANAGER_REQUIRED` (ou `EPROC_CREDENTIAL_MISSING` quando não há certificado utilizável nem conta do tribunal; `TOTP_2FA_MISSING` quando o segundo fator do portal não está no cofre), nunca com fallback cruzado. O auto-sweep pós-upload de certificado permanece desativado. As rotas legadas `/api/integrations/eproc/sweep` e `/sweep/status` são apenas fachada de leitura do job oficial do `EprocSyncScheduler`; não existe segundo pipeline A1 em produção. O download de autos mantém lease próprio com token de dono e sem expiração automática por tempo (120 s é apenas telemetria; passagem de tempo nunca libera operação ativa e `release` só libera o token corrente) e recusa concorrência com um job oficial ativo do mesmo escritório. O acompanhamento e o reset são estritamente escopados por workspace: outro workspace recebe apenas mensagem sanitizada e nunca lê, sobrescreve ou libera job/trava alheios.

## Failure semantics

Erro transitório aplica backoff exponencial limitado; CAPTCHA/2FA interativo e expiração removem próxima tentativa até reconexão humana. Certificado A1 válido ou Sandbox operacional não equivale a uma sessão autenticada no portal.

## Persistence semantics

Estado de sessão é persistido separadamente do Store jurídico; coleta bem-sucedida usa o ingest oficial.

## Domicílio Judicial Eletrônico (redundância declarada)

O Domicílio Judicial Eletrônico (Resolução CNJ 455/2022, arts. 15 a 22; requisitos técnicos na Portaria CNJ 29/2023) é uma fonte de **redundância declarada** de citações e intimações. A captura roda **no servidor**, sem instalação local: `lib/judicial/domicilio/domicilio-runner.mjs` usa o Certificado A1 do cofre do workspace (ou conta PDPJ + TOTP) em navegador headless, autentica no SSO do PDPJ/Jus.br, lê a sessão da própria página e chama a API oficial somente leitura.

- Janela durável `domicilio-sync.json`: 7 dias na primeira captura por workspace e 2 dias nos ciclos, executada junto aos ciclos 07h/12h/19h BRT e pela rota manual autenticada.
- O prazo declarado entra como `sourceReportedDeadlineAt` com `sourceReportedDeadlineSource: 'domicilio'`, apenas como referência; `dataFinalCiencia` vira `noticeDeadlineAt`, nunca `deadline`. O eproc continua verdade absoluta do prazo.
- `informar ciência` e qualquer escrita no portal são proibidos. A ciência no portal permanece estado da fonte (`domicilioMeta.ciente`), nunca tratamento automático.
- O portal do PDPJ recusa IPs de nuvem (403). O runner declara `PORTAL_BLOCKED` com instrução e usa `DOMICILIO_PROXY_URL`/`PORTAL_PROXY_URL` como egress aceito quando configurado; nunca finge login ou leitura. Sem A1/conta o ciclo é `SKIPPED_NO_CERTIFICATE`; interação humana é `HUMAN_ACTION_REQUIRED`.

## Sincronização eproc live

- A interface de cobertura agrupa portais de forma compacta. Vincular QR/chave exige o código atual do autenticador para validar o segredo RFC 6238, grava a credencial no escopo oficial do portal no cofre cifrado e limpa apenas o estado de intervenção obsoleto. Isso produz `Credencial pronta`, nunca `connected` ou `verified`; somente leitura real bem-sucedida confirma a sessão.
- Autenticação eproc aceita duas credenciais do cofre: Certificado A1 (mTLS + TOTP) ou conta do tribunal (usuário/senha + TOTP), no mesmo pipeline read-only. A varredura e o download preferem o A1 quando configurado e caem para a conta quando não há certificado utilizável; sem nenhuma das duas a operação falha fechada com `EPROC_CREDENTIAL_MISSING`. O login por conta usa o SSO real do tribunal (usuário e senha na mesma página, TOTP RFC 6238) e encerra com `AUTH-CAPTCHA-REQUIRED`/`AUTH-CREDENTIALS-INVALID` quando o portal desafia ou recusa — nunca há contorno de CAPTCHA. O TOTP é resolvido por portal e o fallback de escopo nunca cruza tribunal.
- A conta do tribunal é cadastrada em `Cobertura Judicial` (Etapa 4) somente por admin, guardada no cofre cifrado do workspace e removível a qualquer momento; a interface nunca exibe usuário, senha, código ou segredo.
- O comando de atualização da cobertura abre o acompanhamento oficial do job eproc e usa exclusivamente o estado retornado pelo scheduler. A interface não executa uma segunda sincronização nem inventa progresso.
- A sequência automática inicial deriva exclusivamente de `capabilities.liveSyncVerified` no registry. Atualmente somente TJRS 1G possui evidência positiva global. TJRS 2G, JFRS 1G e TRF4 2G são candidatos explícitos de verificação manual: quando selecionados pelo usuário, podem executar uma tentativa read-only isolada; somente autenticação e leitura reais bem-sucedidas gravam evidência durável para aquele workspace e permitem sua inclusão nos ciclos posteriores. JFSC 1G e JFPR 1G permanecem visíveis e explicitamente não verificados, sem tentativa live automática.
- Origem, diretório do controlador, escopo de credencial e exigência de TOTP são resolvidos pelo portal selecionado. Navegação, click, submit e download continuam sob allowlist read-only e default-deny da ação real.
- O roteamento usa os campos J/TR/unidade de origem do CNJ para separar TJRS 1G/2G, JFRS 1G e TRF4 2G. Um processo solicitado explicitamente não pode ser executado por portal incompatível.
- Todos os processos TJRS que a interface marca como `Enriquecimento eproc` entram na varredura; o limite operacional continua aplicável somente aos demais candidatos.
- O pipeline oficial é report-first: após autenticar, o ATRIUM aciona a exportação oficial "Gerar Planilha" do Relatório de Processos, valida a assinatura OLE/BIFF8, normaliza os registros, persiste um snapshot atômico por workspace e calcula o diff `NEW`/`UPDATED`/`UNCHANGED`/`REMOVED_OR_INACTIVE`. Ausência no relatório ativo é somente sinal de auditoria, nunca exclusão. Se o relatório não puder ser obtido, o coletor usa o painel como fallback e registra a execução como parcial, nunca como sucesso pleno.
- Somente processos `NEW`/`UPDATED` (e backlog pendente de execuções anteriores) entram no enriquecimento, com orçamento por execução e registro do que ficou diferido. `UNCHANGED` não é reaberto no eproc, exceto a revisão única de marca legada de sigilo: processo marcado pela detecção antiga (sem tag de origem `segredo-de-justica` e sem `secrecyManual`) é relido uma vez para a fonte confirmar ou limpar a marcação. O sigilo do processo tem proveniência explícita: a fonte prevalece quando declara o nível (nível 0 explícito limpa a marcação de origem; ausência de nível declarado não é evidência e apenas registra `secrecyReviewedAt`); marcação manual do usuário (`secrecyManual`) nunca é alterada. O enriquecimento lê capa, movimentos e Chave do Processo; a mesclagem de inventário é não destrutiva e nunca sobrescreve cliente ou parte adversa curados manualmente.
- A publicação reconciliada do Painel herda de forma aditiva `client`/`clientName`/`contactId` do processo vinculado (mesmo CNJ) e materializa o texto oficial já capturado em `sourceText`; vínculo confirmado em execução posterior alcança publicações anteriores. A mesclagem nunca sobrescreve valor existente com vazio e continua sem tocar `deadline`/`fatalDeadline`. Contrato: `tests/eproc-sweep-report-pipeline.mjs`.
- A Chave do Processo vive exclusivamente no cofre cifrado do workspace, com escopo owner de workspace + portal/grau + CNJ; nunca é gravada no estado oficial, nunca retorna ao frontend e nunca entra em telemetria ou logs. Estado já existente com chave em texto claro é migrado para o cofre e redigido na borda da API.
- O Painel do Advogado é a fonte de `Prazos em aberto` e `Intimações pendentes`. Cada registro mantém CNJ, portal, tipo, evento, texto original, data informada pela fonte, instante da coleta e evidência histórica. Repetições reconciliam a mesma identidade externa; quando todas as páginas de uma seção reconhecida foram coletadas com sucesso e deixam de listar o item, ele passa a `not_present` sem apagar evidência.
- Audiências designadas são lidas das listas oficiais de audiências do Painel com identidade externa estável por portal + CNJ + data/hora + tipo e reconciliadas como eventos da Agenda (`state.agenda`). Audiência nunca cria cliente, tarefa, `deadline` ou `fatalDeadline`; evento manual nunca é sobrescrito e ausência só é marcada quando a listagem inteira foi coletada com sucesso. Contrato: `tests/eproc-hearings-sync.mjs`.
- `sourceReportedDeadlineAt` é o prazo declarado pelo eproc: no modo `auto` (padrão de `settings.deadlineMode`) preenche `deadline` e `deadlineSource: 'eproc'` do registro e da tarefa idempotente do item ("Prazo eproc — …"); no modo `manual`, a data permanece apenas como referência e a tarefa de conferência é mantida sem deadline. Ajustes de contagem (embargos e similares) são edição manual do usuário e prevalecem. Se a fonte deixar de listar o item, a tarefa fica inativa e a evidência histórica é preservada. Se qualquer seção do Painel não puder ser confirmada, o coletor registra erro real e o job não termina como sucesso pleno.
- A persistência mantém a revisão do snapshot que está sendo salvo. Edição concorrente produz conflito real e job com erro; o coletor não adota uma revisão mais nova para sobrescrever o Store com estado antigo.
- Quando a fonte `inpi-rpi` estiver ativa no workspace, a sincronização global manual executa a consulta RPI e reconcilia as ocorrências no Store oficial antes de concluir. Ciclos automáticos preservam a cadência semanal e apenas reconciliam o dashboard já coletado. A reconciliação é idempotente, preserva o tratamento existente e falha da RPI aparece como resultado parcial, nunca como sucesso pleno silencioso.
- A tabela de cobertura deve reconciliar o estado oficial do eproc: um job `PENDING`/`RUNNING`/`AUTHENTICATING` prevalece sobre erro ou sucesso histórico; um erro atual permanece visível e conserva `lastSuccessfulSyncAt`; `lastAttemptAt` acompanha a tentativa mais recente. No frontend, a indicação de enriquecimento só desaparece por status/timestamp oficial de conclusão; tags legadas como `varredura-a1` não constituem, isoladamente, evidência de conclusão e não podem ocultar estados pendentes ou de erro.

O writer da varredura grava `enrichmentStatus=COMPLETE`, instante e proveniência somente após leitura fresca da capa com cliente identificado, juiz, vara, classe e chave, sem erro de coleta/persistência da credencial naquele processo. Ausência de campo, placeholder de sigilo ou erro mantém a indicação de trabalho pendente; tags de atualização parcial não confirmam conclusão. Evidência histórica já concluída não é apagada.

- Somente a ação manual explícita e os ciclos agendados do `EprocSyncScheduler` (07:00 e 19:00 BRT) iniciam sincronização pesada. Login, reload e abertura de Processos/Publicações não iniciam coleta. Requisições concorrentes do mesmo workspace ingressam no job existente (single-flight), e o `lastSuccessfulSyncAt` só muda em sucesso verdadeiro.

Testes focais de fechamento: `tests/eproc-coverage-reconciliation-http.mjs`, `tests/eproc-enrichment-completion.mjs`, `tests/eproc-report-first-pipeline.mjs`, `tests/eproc-access-key-hygiene.mjs` e `tests/ui_v2_processes.mjs`.

## Omni-Collector integrado (v2.1-dev)

- O listener do ATRIUM registra `/api/integrations/omni/*`; não exige um daemon adicional. O sidecar TJRS existente mantém prioridade; indisponibilidade permite fallback interno, reutilizando o JSON já lido e seus limites de tamanho.
- Status do motor interno significa capacidade local disponível. Provedores permanecem `NOT_VERIFIED` até evidência de consulta; não equivale a autenticação ou certificação live.
- Preview é dry-run (`persist: false`): não grava Store, snapshots, diffs ou watchlist. O cliente não é inferido.
- Sync exige sessão, CSRF, revisão atual e igualdade estrita entre CNJ solicitado, processo local e resposta do provedor. Campos manuais de cadastro prevalecem. Repetição do mesmo snapshot mantém a revisão.
- Importação confirmada usa o Store oficial, com auditoria; o cache do coletor não é autoridade para o acervo. Falha de cache após salvar o Store é informada como aviso, nunca como perda do salvamento confirmado.
- Cache operacional usa `omni-cache-v1.sqlite`, payloads AES-256-GCM pelo SecurityManager e índices CNJ com HMAC. Nenhum banco do laboratório é copiado/migrado; o schema antigo não é lido. Backups oficiais continuam cobrindo o Store, não o cache reconstruível.
- Watchlist e execução de consulta da lista são manuais e exigem CSRF. Não há agendamento automático, ciência, protocolo ou prazo inferido. A CLI OAB é somente diagnóstico, não um segundo importador.
- Processos TJRS podem receber uma chave de acesso eproc. A chave é validada pelo sidecar loopback, armazenada somente no cofre judicial cifrado e isolada por usuário + CNJ; nunca integra o Store jurídico nem retorna ao frontend. Preview usa a chave informada apenas naquela requisição. A atualização individual, a geração do caderno e os ciclos gerais de sincronização agendados (07:00/19:00 BRT) e por comando manual reutilizam automaticamente a chave já guardada para monitorar o processo.
- O inspetor informa somente se há chave no cofre, sem retornar seu valor. Quando ausente, oferece cadastro direto em modal. A validação solicita ao sidecar uma coleta live por CNJ; somente após resposta válida guarda a chave no cofre e incorpora os dados coletados ao processo. Ausência de dados locais é explicada em linguagem de usuário, sem exigir conhecimento do termo técnico “snapshot”. A chave continua fora do Store, do estado visual e dos logs.
- O inspetor pode gerar, por ação explícita, um caderno processual em PDFs determinísticos a partir dos andamentos do snapshot. Esses PDFs são derivados de consulta, não peças originais nem certidões do tribunal, e entram no acervo documental oficial cifrado com checksum, owner processual, revisão e auditoria.
- Adaptadores mantêm fila serial e espaçamento/backoff. Os provedores portados são TJRS, TJDFT, TJSP, DataJud e DJEN; TRF4 usa fallback DataJud, não um novo adaptador autenticado.
- Testes Omni usam transporte sintético sob `tests/fixtures/omni-network.mjs`, injetado pelo processo de teste. Não há flag de mock, credencial de teste ou endpoint de injeção no servidor de produção.

## Relevant tests

`tests/omni_collector_comprehensive.mjs`, `tests/omni_server_e2e.mjs`, `tests/sync_progress_bar_e2e.mjs`, `tests/omni_ui_v2.mjs`, `tests/managed_judicial_connectivity.mjs`, `tests/decision_html_and_access_key.mjs`, `tests/judicial_integrations_feature.mjs`, `tests/ui_v2_judicial_integrations.mjs`, `tests/ui_v2_judicial_integrations_accessibility.mjs`, `tests/eproc-multitribunal-routing.mjs`, `tests/eproc-scheduler-contract.mjs` e `tests/eproc-real-wiring.mjs`.
