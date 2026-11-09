# Política de e-mail

Status: **CURRENT**; mudança de cadência **aprovada e com publicação explicitamente autorizada**, em execução. A cadência abaixo substitui os defaults legados na 6.34.0; produção só será declarada após gates, release e smoke no mesmo SHA.

## Purpose

Garantir a separação entre e-mail judicial manual e notificações operacionais do ATRIUM, sempre com conteúdo oficial resolvido pelo backend.

## Canonical authority

`lib/email/email-service.mjs`, `lib/notifications/`, rotas de e-mail e notificações em `server.mjs` e `js/features/email-integration.js`.

## Invariants

- `EmailService` é o único transporte SMTP e permanece responsável pelos envios judiciais manuais.
- O envio exclusivamente manual de publicações nasce de ação humana explícita na interface, nunca de automação, cron ou importação.
- Notificações operacionais seguem `domain event → NotificationService → outbox → worker → Resend → webhook/delivery`; módulos de negócio não chamam o provider.
- A recuperação de senha é um transacional supervisionado (`PASSWORD_RESET`) no mesmo pipeline Resend: o backend resolve a conta oficial, enfileira o link de uso único e o worker entrega mesmo com o master switch de notificações do escritório desabilitado, como já ocorre com `SYSTEM_TEST`. O e-mail não contém senha, segredo de MFA ou dado interno, e a base do link vem de `ATRIUM_BASE_URL`.
- O master switch nasce habilitado em workspaces existentes e novos. A primeira abertura registra o watermark de ativação, de modo que eventos anteriores ao boot não geram disparo retroativo; a desativação continua sendo ação administrativa explícita.
- Todos os eventos operacionais (`PUBLICATION_NEW`, `HEARING_NEW`, `MOVEMENT_NEW`, `DEADLINE_CRITICAL`, `SYNC_FAILED`, `A1_CERT_EXPIRING`) têm default `BULLETINS`: três janelas independentes no servidor, às **08h, 14h e 20h BRT** (`America/Sao_Paulo`), no máximo um boletim lógico por horário/destinatário e **três boletins lógicos bem-sucedidos por dia/destinatário**. Tentativas do provider não equivalem a novos boletins bem-sucedidos.
- **Audiência por responsável (filtro, sem mudar cadência nem teto)**: cada boletim filtra eventos e contexto pela audiência do destinatário — responsáveis da tarefa (`assigneeUserId`/`followerUserIds`) e do processo (`responsibleUserIds`), resolvidos por `processId` ou dígitos do CNJ. `DEADLINE_CRITICAL` une tarefa + processo; `MOVEMENT_NEW` usa o processo; `PUBLICATION_NEW`/`HEARING_NEW` usam o processo pelo número. Sem vínculo inequívoco (evento sem tarefa/processo resolvido, processo sem responsáveis), o evento transmite a **todos** — fallback sem perda silenciosa. A cadência 08h/14h/20h, o teto de um boletim lógico por turno/destinatário e três por dia, e a dedup por cobertura permanecem inalterados. Cobertura: `tests/notification-audience.test.mjs` (responsável recebe só o seu + sem vínculo para todos; tarefa delegada chega só a delegado + responsável do processo).
- Nenhum tipo operacional gera e-mail avulso, inclusive prazo crítico, falha de sync e certificado A1. Sync registra eventos oficiais e não dispara boletim pós-sync; render, reload, login ou abertura de drawer não executam scheduler nem coleta.
- O boletim agrega movimentações e comunicações oficiais, contagens, referências e trechos higienizados; para publicação oficial vinculada a processo e acessível ao destinatário, inclui a íntegra em bloco recolhido (`<details>`/`<summary>`), sem anexos. Publicação privada, restrita ou sem processo resolvido não expõe a íntegra. Sem boletim vazio nem repetição de novidade consumida; sem consumir evento destinado a outro usuário.

### Íntegra recolhida no boletim (CURRENT — 6.60.2)

- O texto vem de `text`/`fullText` oficial persistido, é escapado, preserva quebras de linha e não é resumido, reescrito ou inferido por IA.
- A íntegra só é materializada para destinatário na audiência de responsáveis do processo; destinatários externos e o fallback "sem vínculo → todos" recebem apenas trecho. Publicações acima de 10.000 caracteres informam que a íntegra é extensa e apontam o ATRIUM.
- O bloco nasce fechado (`<details>` sem `open`); clique ou teclado expande. Clientes que não suportam o elemento podem exibir o conteúdo expandido; não há script, anexo ou tracking novo. A alternativa texto puro não tem colapso e recebe a íntegra integral quando materializada.
- A íntegra não altera prazo, tratamento, ciência ou tarefa. Publicação privada, restrita ou sem processo resolvido permanece sem texto integral.
- Cobertura: `tests/notification-templates.test.mjs`, `tests/notification-email-visual.mjs` e `tests/notification-audience.test.mjs`.
- Agenda de hoje/amanhã e prazos já registrados (janela de 3 dias, fatal apenas se marcado humanamente) entram no primeiro boletim efetivamente enviado do dia; nos seguintes, somente mudanças relevantes de contexto. Datas vêm do estado oficial: sem inferência de prazo por texto, categoria, regex ou IA; não altera deadline, tarefa, tratamento ou ciência.
- `PASSWORD_RESET` permanece imediato/transacional, fora da preferência operacional e da quota de três boletins; `SYSTEM_TEST` é teste manual exclusivo de `master_admin`, também fora dessa quota. Ambos conservam seus rate limits/quotas próprios e podem passar pelo master switch desabilitado. Envios judiciais manuais por IDs seguem separados, com `EmailService`, admin/master_admin e CSRF.
- `SYNC_FAILED` e `A1_CERT_EXPIRING` são restritos a admin/master_admin; destinatários externos e colaboradores não recebem esses eventos. Backend determina o papel, não o campo da UI.
- Publicação individual usa ID; lote usa IDs + destinatário.
- Backend resolve conteúdo oficial persistido.
- O envio exclusivamente manual de publicações exige ação humana explícita, admin/master_admin e CSRF.
- Cada notificação usa um destinatário, sem `To`/`Cc` compartilhado e sem attachment automático.

## Conclusão de tarefa — digest das 19h (CURRENT — 6.45.3)

- Evento `TASK_COMPLETED` e digest `TASK_COMPLETED_DIGEST` são **separados** dos boletins operacionais de publicações.
- Um único e-mail por destinatário/dia, às **19h BRT** (`America/Sao_Paulo`), após o ciclo de sincronização das 19h e sem depender do sucesso dele.
- O digest contém somente conclusões de tarefas do recorte desde o último digest, com título, autor da conclusão, data/hora, processo/cliente acessível e link. Sem texto judicial completo, anexo, prazo inferido ou instrução de ato.
- A audiência é a união dos envolvidos na tarefa e no processo (delegado, seguidores, responsáveis/equipes do processo e criador), filtrada pelo acesso. Sem envolvidos resolvidos, vai para gestores/`tasks.assign`, nunca para todos os membros.
- Sem conclusões no recorte, não há e-mail. Retry não duplica o e-mail lógico; falha de entrega é registrada.
- O digest não entra no boletim das 20h e não consome a quota de três boletins/dia. A preferência do digest é própria; o padrão é ligado.
- Implementado em 6.45.3: evento `TASK_COMPLETED`, central autenticada, digest transacional das 19h e scheduler. A UI de preferências do digest e a política de opt-out permanecem no escopo de `specs/office-teams-access.md`; nenhuma automação de prazo, ciência ou tratamento é criada.

## Convite de equipe — transacional (CURRENT — 6.47.0)

- `TEAM_INVITE` é um transacional do mesmo pipeline Resend, disparado somente por ação administrativa explícita em `POST /api/auth/invitations` ou `/resend` com `sendEmail: true`.
- O backend resolve o convite oficial persistido e enfileira destinatário, link e validade; o frontend não fornece conteúdo judicial nem link como autoridade.
- Não entra na quota de três boletins, não é controlado pelo master switch de boletins e não usa o SMTP de publicações.
- Sem provider configurado, a rota responde `emailStatus: not_configured` e o link manual de 48h continua disponível. Falha de enfileiramento responde `failed`, sem falso sucesso.
- Reenvio renova o token e a geração de idempotência; o mesmo convite não gera dois e-mails para a mesma geração.
- A mensagem contém nome do escritório, convidante, validade, CTA para `/login#invite=<token>` e aviso de que o ATRIUM não envia senhas. O e-mail não concede ciência, prazo ou ato processual.

## Allowed operations

- Testar o ATRIUM Mail e gerir master switch/destinatários por ação administrativa.
- Gerir preferências pessoais de cadência dentro dos limites de RBAC.
- O cartão Mail compartilha a linha do INPI/RPI no desktop e empilha no mobile, sem lista vazia de destinatários. Configuração pessoal abre o drawer de preferências; teste de envio é exclusivo do `master_admin`, tanto na UI quanto no backend. A compactação visual não altera ativação, cadência ou destinatários.
- Enviar publicação/boletim judicial manualmente pelo fluxo oficial baseado em ID.

## Forbidden operations

- Auto-send de conteúdo judicial completo fora do bloco recolhido de publicação oficial acessível ao destinatário, ciência automática, attachment automático ou fallback `mailto` com conteúdo judicial.
- Chamada direta ao Resend por módulos de negócio.
- Payload do frontend como autoridade do texto judicial ou segredo persistido no Store.

## Preferências pessoais e compatibilidade

- Drawer existente em Integrações → ATRIUM Mail: cada evento operacional oferece somente **Boletins (08h, 14h e 20h)** (`BULLETINS`) ou **Desativado** (`DISABLED`). Falhas de sync e certificado A1 aparecem somente para administradores; transacionais não aparecem como preferências.
- Preferência ausente usa o default aprovado; `enabled: false`/`0` ou `DISABLED` preserva opt-out. Legados habilitados `IMMEDIATE`, `SYNC_DIGEST` e `DAILY` normalizam para `BULLETINS`. Valor desconhecido é exibido conservadoramente como desativado, com aviso, e omitido do PUT até escolha explícita; eventos não representados no drawer nunca são sobrescritos por ele.
- GET exige resposta válida antes de permitir salvar; falha deixa feedback durável e salvar bloqueado. PUT 500/409 não fecha o drawer, não anuncia sucesso e conserva escolhas para retry. Reabrir/refresh relê a autoridade backend; abrir não escreve preferências nem estado jurídico. SecureFetch conserva sessão e CSRF, sem payload judicial no PUT.
- Foco inicial, Tab/Shift+Tab contidos, Escape e retorno ao gatilho usam o presenter existente; durante PUT há guarda in-flight. Labels quebram em mobile, selects têm 16px e alvos de 44px, sem redesign da família visual.

## State model

Preferências e destinatários por workspace, eventos deduplicados, outbox com retry, entregas correlacionadas e status higienizado. Payload e destinatário sensíveis ficam cifrados.

## Tenant e banco de notificacoes (reconciliacao 2026-09-22)

- O escritorio canonico `ws-4c0597cc-8aab-4a1c-8b2f-700c793eab32` e o `defaultWorkspaceId` e persiste em `data/` (raiz); o `data/notifications.sqlite` da raiz e o banco canonico desse tenant — nao e residuo legado.
- Workspaces nao padrao usam `NotificationDatabase.forWorkspace` em `data/workspaces/<id>/notifications.sqlite` (criado on-demand); nenhum existe hoje.
- Webhooks do Resend resolvem o tenant exclusivamente por routing tags assinadas (`atrium_tenant`/`atrium_outbox`); outbox ids anteriores a um restore/reset respondem `OUTBOX_NOT_FOUND` fail-safe, sem varredura entre tenants.
- Nenhuma migracao de layout e necessaria para o funcionamento; o historico de outbox/deliveries existente e preservado.
## Security boundary

Segredos SMTP/Resend não retornam à UI; destinatários e conteúdo são validados no servidor; audit usa endereço mascarado quando aplicável. Webhooks validam assinatura Svix, janela temporal, replay e routing tags assinadas por tenant/outbox.

## Failure semantics

Falha de transporte não produz sucesso nem alteração automática da publicação; erro sensível é sanitizado e retry usa a outbox sem manter transação aberta durante HTTP.

## Persistence semantics

Configuração/receivers ficam no serviço cifrado; envio não cria agenda automática, não muda `treatmentStatus` e não representa ciência judicial.

## Migração e gates de promoção da candidata

- Migração aditiva de quatro tabelas: `notification_bulletins`, `notification_event_coverage`, `notification_preference_cutoffs` e `notification_legacy_coverage_holds`, mais a coluna `notification_outbox.first_provider_attempt_at`. Preserva `user_version`, histórico, opt-outs e isolamento por workspace. Antes do DDL em banco existente com registros, gera backup consistente por `VACUUM INTO`, com modo 0600 solicitado (ACL privada no Windows deve ser conferida operacionalmente); payload, destinatário, contexto e políticas sensíveis permanecem cifrados.
- Cobertura legada só é reconhecida por identidades estáveis. Avulsos operacionais pendentes são cancelados sem consumir a novidade nem cancelar transacionais. `SENDING` ambíguo torna-se `FAILED`/`LEGACY_DELIVERY_AMBIGUOUS`; tentativas antigas sem primeira tentativa durável falham com `DELIVERY_UNCONFIRMED`. Cobertura não reconstruível gera hold durável por workspace/destinatário/tipo/cutoff, conservador quando metadados são indeterminados. Eventos novos fora do hold continuam; não se inventa histórico nem se reenvia silenciosamente o acervo retido.
- Gate sandbox reexecutado em 2026-10-08: `tests/notification-events-and-cadence.test.mjs`, **21/21 PASS**, incluindo backup íntegro, rollback de DDL interrompido, restart e restauração do backup com o código real de `67cd7667:lib/notifications/db.mjs`, `integrity_check=ok`, preferências/destinatários/outbox/watermark e `user_version=17` preservados. Não usa banco privado nem restaura sobre produção; a existência das tabelas não substitui essa prova.
- Reservas por workspace/destinatário/dia/slot e cobertura por destinatário sustentam deduplicação lógica local, não exactly-once externo. Cada HTTP revalida papel, status, destinatário, preferências e master switch. Antes do primeiro HTTP, `first_provider_attempt_at` é gravado duravelmente; retries e restart reutilizam esse limite e a mesma outbox/chave, nunca renovam a janela. Com 24h ou mais desde a primeira tentativa, encerra `FAILED`/`DELIVERY_WINDOW_EXPIRED` sem outro HTTP. Claim/tentativa sem limite comprovável encerra `FAILED`/`DELIVERY_UNCONFIRMED`. Timeout ambíguo permanece diagnosticado durante retry dentro da janela; não representa entrega confirmada.
- Holds e falhas podem ser inspecionados nos metadados operacionais; `GET /api/admin/mail/status`, já existente e exclusivo de `master_admin`, retorna `stats.unresolvedLegacyCoverage`. Não há novo endpoint nem UI de resolução. **FUTURE**: resolução humana auditada da cobertura/entrega indeterminada, em missão própria; nunca liberação automática ou replay para ocultar o bloqueio.
- Fonte oficial do payload e criptografia permanecem no backend; frontend só transmite escolhas de cadência, nunca texto judicial ou segredo. Gates de scheduler, banco, transporte/templates e rollback são separados do QA do drawer. Scheduler de boletins consulta a cada 30s após listen e seu stop aguarda o ciclo ativo; consultas judiciais de 07h/12h/19h permanecem inalteradas. Boot não cria eventos/e-mails retroativos; um ciclo útil devido pode reservar boletim de contexto oficial atual, sem inventar novidade.
- Bloqueio HTTP reconciliado com evidência executável: `node tests/notification-settings-http.test.mjs` passou em 2026-10-08. Todos os seis tipos aceitam `BULLETINS`, com GET/PUT persistido, normalização legada, opt-outs, rejeição atômica de lote inválido, RBAC/CSRF e isolamento; `MOVEMENT_NEW` não exige fallback `SYNC_DIGEST` na candidata.
- **6.34.0 com publicação explicitamente autorizada**: README/changelog/notas, registro de testes e cache/manifesto preparados. Baseline `67cd7667` confirmada por origin/main, API 6.33.0 READY/ok e Pages success. Fixtures SMTP/recuperação segregadas em `0732fe18`, sem alteração de auth runtime. Deploy exige backup privado consistente e smoke; SHA final e resultado serão registrados no GitHub Release. Somente cadência natural autorizada, sem teste real ou envio manual. Evidências e limites em `docs/RELEASE_NOTES_6.34.0.md`.

## Evidência UI da candidata (2026-10-08)

- Referência inspecionada: `index.html:#mailPreferencesForm`, `css/views/ui-v2/integrations.css` e `js/views/ui-v2/email-calendar-presenter.js`; view ativa **Integrações**, drawer ATRIUM Mail. Sem mudança no transporte, scheduler, templates de e-mail ou Store jurídico nesta frente.
- Gates locais: `node tests/email_integration_feature.mjs`, `node tests/integration_comments_layout.mjs`, `node tests/ui_v2_email_calendar_integrations.mjs`, `node tests/spec_contracts.mjs` e `node scripts/check-syntax.mjs` passaram. Execuções de navegador limitadas a 80s, servidor e usuários sintéticos, sem SMTP real; helper usa `JEV_CMD_BIN=process.execPath`. Não é aprovação de produção nem gate do backend.
- Matriz: light/dark, 1538/1280/1186/390×844, mais 390×500; master/admin/colaborador, opções legadas/oficiais, opt-outs, desconhecidas, 500/409, retry, reabertura e refresh com resposta backend sintética. Tab/Shift+Tab, foco inicial, Escape/retorno, fundo inerte, alvos de 44px e overflow local conferidos. Na primeira execução de 390×500, erro deslocava a ação fora do viewport; corrigido com scroll local até a ação, sem remover a assertion de hit-test; rerun verde.
- Prints lidos em `artifacts/visual-qa/integration-comments/`: `preferences-before-light-390.png` e `preferences-before-dark-1280.png` mostravam os modos legados; `preferences-after-{light,dark}-{390,1280}.png` mostram labels completas, foco e ajuda legível, sem colisões observadas; `preferences-409-{light,dark}-390x500.png` mostram erro durável e ação de retry acessível após correção. Conteúdo excedente rola no drawer, não no documento.
- Conclusão da frente UI: validado nos cenários locais descritos. A preparação de release reexecutou os gates HTTP, cadência/restore, scheduler, worker, provider e templates listados nas notas 6.34.0; cache e registro de testes preparados, sem publicação. Safari/iOS físico, clientes Gmail/Outlook reais, smoke e promoção permanecem pendentes. Evidência anterior do drawer é atribuída à frente UI; screenshots abertos nesta preparação são discriminados nas notas, sem presumir inspeção de toda a matriz.

## Templates e imagem de e-mail da candidata

- Assuntos reais por turno: `ATRIUM | Resumo da manhã — DD/MM`, `ATRIUM | Resumo da tarde — DD/MM` e `ATRIUM | Resumo da noite — DD/MM`, com até dois contadores do recorte (ex.: `2 publicações, 1 prazo`); metadados do backend determinam turno/data. O corpo abre com `Em resumo` e a publicação oficial traz a íntegra em bloco recolhido. Título editorial Georgia/Playfair com fallback, corpo Arial/Inter/sans-serif, sem download de fonte.
- Layout por tabelas `role="presentation"`, largura máxima 600px e CSS inline próprio de e-mail para compatibilidade, sem exceção nova ao CSP da aplicação, scripts ou overrides web. Imagem passiva em `https://atrium.adv.br/assets/icons/atrium-logo-email.png`, no diretório público já autorizado, com alt ATRIUM; raster derivado de `assets/icons/atrium-logo-light.svg`, 960×240 e 32.312 bytes medidos. Não requer nova allowlist, acesso privado ou tracking.
- `node tests/notification-email-visual.mjs --verify-logo` passou em 15 cenários locais (1280/600/390, light/dark simulado, imagens bloqueadas, CSS inline isolado, contexto/delta, transacionais, conteúdo longo), com Tab/foco, hover estável e overflow zero. Nesta preparação foram abertos apenas `morning-light-1280.png` e `morning-dark-390.png`; matriz automatizada não equivale à inspeção visual de todas as imagens nem à certificação Gmail/Outlook real.

## Relevant tests

`tests/email_service.mjs`, `tests/email_integration_feature.mjs`, `tests/ui_v2_email_calendar_integrations.mjs`, `tests/integration_comments_layout.mjs`, `tests/publications_feature.mjs`, `tests/password_recovery.mjs`, `tests/notification-email-visual.mjs`, `tests/notification-audience.test.mjs`, `tests/notification-settings-http.test.mjs`, `tests/notification-bulletin-scheduler.test.mjs` e `tests/notification-*.test.mjs`. Registro em `tests/run-all.mjs` não executa automaticamente testes nesta preparação; suíte global e CI não foram habilitados/executados.
