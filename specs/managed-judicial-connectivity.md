# Conectividade judicial gerenciada

Status: **CURRENT**

## Purpose

Supervisionar cobertura judicial por identidade e portal, com estratégia explícita, sessão isolada, cadência conservadora e backoff.

## Canonical authority

`lib/judicial/managed-connectivity.mjs`, `lib/judicial/session-manager.mjs`, `lib/judicial/credential-manager.mjs`, `collector/agent.mjs` e `server.mjs`.

## Invariants

- A1, PJeOffice, Windows Store, usuário/senha/TOTP e sessão interativa são estratégias distintas.
- Estado é isolado por usuário + identidade + portal.
- “Verificado” exige fonte pública canônica ou evidência explícita; demais portais ficam `experimental` ou `not_verified`.
- Um único coletor gerenciado executa por vez no servidor.
- Recarregar, abrir outra aba ou repetir a autenticação não repete a sincronização da mesma inicialização nem a execução diária já reivindicada.
- No primeiro acesso pela interface, a OAB e a seccional são obrigatórias e formam o termo principal antes da sincronização automática de inicialização; a tela informa antecipadamente esse comportamento.

## Allowed operations

- `authenticate`, `health`, `discoverCases`, `fetchMovements`, `fetchPublications`, `disconnect` em adapter declarado read-only.
- Atualização manual explícita, uma sincronização por inicialização do servidor e uma execução diária às 10h no fuso `America/Sao_Paulo` enquanto o portal estiver aberto.
- Antes de consolidar o Store, a sincronização geral aguarda a leitura completa do acervo nos portais autenticados habilitados. Essa etapa descobre os processos do procurador independentemente de haver publicação recente; DJEN e DataJud continuam no encadeamento público posterior e não são executados em duplicidade pelo coletor gerenciado.
- Sessão assistida explícita para portais habilitados; o usuário conclui login, CAPTCHA, TOTP ou confirmação humana exigida pelo tribunal.

## Forbidden operations

- Adapter com `acknowledge`, `science`, `sign`, `file`, `protocol`, `petition` ou `confirmDeadline`.
- Retry rápido, loop durante ação humana ou alegação de suporte live sem evidência.

## State model

`not_configured`, `authenticating`, `connected`, `action_required`, `expired`, `error`; registra última tentativa/sucesso, próxima atualização e falhas.

## Security boundary

Credenciais por identidade permanecem no cofre cifrado; cobertura pública contém apenas estado e erros sanitizados.

## Failure semantics

Erro transitório aplica backoff exponencial limitado; CAPTCHA/2FA interativo e expiração removem próxima tentativa até reconexão humana. Certificado A1 válido ou Sandbox operacional não equivale a uma sessão autenticada no portal.

## Persistence semantics

Estado de sessão é persistido separadamente do Store jurídico; coleta bem-sucedida usa o ingest canônico.

## Omni-Collector integrado (v2.1-dev)

- O listener do ATRIUM registra `/api/integrations/omni/*`; não exige um daemon adicional. O sidecar TJRS existente mantém prioridade; indisponibilidade permite fallback interno, reutilizando o JSON já lido e seus limites de tamanho.
- Status do motor interno significa capacidade local disponível. Provedores permanecem `NOT_VERIFIED` até evidência de consulta; não equivale a autenticação ou certificação live.
- Preview é dry-run (`persist: false`): não grava Store, snapshots, diffs ou watchlist. O cliente não é inferido.
- Sync exige sessão, CSRF, revisão atual e igualdade estrita entre CNJ solicitado, processo local e resposta do provedor. Campos manuais de cadastro prevalecem. Repetição do mesmo snapshot mantém a revisão.
- Importação confirmada usa o Store canônico, com auditoria; o cache do coletor não é autoridade para o acervo. Falha de cache após salvar o Store é informada como aviso, nunca como perda do salvamento confirmado.
- Cache operacional usa `omni-cache-v1.sqlite`, payloads AES-256-GCM pelo SecurityManager e índices CNJ com HMAC. Nenhum banco do laboratório é copiado/migrado; o schema antigo não é lido. Backups canônicos continuam cobrindo o Store, não o cache reconstruível.
- Watchlist e execução de consulta da lista são manuais e exigem CSRF. Não há agendamento automático, ciência, protocolo ou prazo inferido. A CLI OAB é somente diagnóstico, não um segundo importador.
- Processos TJRS podem receber uma chave de acesso eproc. A chave é validada pelo sidecar loopback, armazenada somente no cofre judicial cifrado e isolada por usuário + CNJ; nunca integra o Store jurídico nem retorna ao frontend. Preview usa a chave informada apenas naquela requisição. A atualização individual, a geração do caderno e os ciclos gerais de sincronização na abertura, às 10h e por comando manual reutilizam automaticamente a chave já guardada para monitorar o processo.
- O inspetor informa somente se há chave no cofre, sem retornar seu valor. Quando ausente, oferece cadastro direto em modal; uma tentativa sem snapshot também conduz a essa ação. A chave continua fora do Store, do estado visual e dos logs.
- O inspetor pode gerar, por ação explícita, um caderno processual em PDFs determinísticos a partir dos andamentos do snapshot. Esses PDFs são derivados de consulta, não peças originais nem certidões do tribunal, e entram no acervo documental canônico cifrado com checksum, owner processual, revisão e auditoria.
- Adaptadores mantêm fila serial e espaçamento/backoff. Os provedores portados são TJRS, TJDFT, TJSP, DataJud e DJEN; TRF4 usa fallback DataJud, não um novo adaptador autenticado.
- Testes Omni usam transporte sintético sob `tests/fixtures/omni-network.mjs`, injetado pelo processo de teste. Não há flag de mock, credencial de teste ou endpoint de injeção no servidor de produção.

## Relevant tests

`tests/omni_collector_comprehensive.mjs`, `tests/omni_server_e2e.mjs`, `tests/sync_progress_bar_e2e.mjs`, `tests/omni_ui_v2.mjs`, `tests/managed_judicial_connectivity.mjs`, `tests/decision_html_and_access_key.mjs`, `tests/judicial_integrations_feature.mjs`, `tests/ui_v2_judicial_integrations.mjs`, `tests/ui_v2_judicial_integrations_accessibility.mjs`.
