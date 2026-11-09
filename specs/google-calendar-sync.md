# Sincronização com o Google Agenda

Status: **CURRENT**. Em produção, depende de `GOOGLE_CALENDAR_CLIENT_ID` e `GOOGLE_CALENDAR_CLIENT_SECRET` no servidor; sem elas, o cartão mostra "Em preparação" e nada roda.

## Purpose

Levar compromissos e prazos do ATRIUM à agenda pessoal de cada pessoa e trazer os compromissos dela para o ATRIUM, sem que a agenda pessoal altere prazo.

## Official authority

`lib/calendar-sync/` (API, tradução e serviço), `lib/http/google-calendar-routes.mjs`, `js/features/google-calendar.js` e `tests/google_calendar_sync.test.mjs`.

## Invariants

- A conexão é por pessoa. Pede só o escopo `calendar.events`, na agenda principal.
- O que vem da agenda pessoal entra em `state.agenda` com `source: 'Agenda pessoal'`, `scope: 'private'` e `privateOwnerUserId`. Só a dona ou o dono vê; fica fora de boletins e do contexto de IA.
- Prazo de tarefa, compromisso que não seja `Interna` ou `Agenda pessoal` e ocorrência de série não mudam pela agenda pessoal. Alterar ou apagar a cópia faz o ATRIUM restaurá-la.
- Compromisso comum muda nos dois sentidos. Com edição nos dois lados, vale a mais recente; a alteração vinda do Google entra na auditoria.
- Compromisso do escritório apagado na agenda pessoal continua no ATRIUM e não é recriado naquela agenda. Compromisso pessoal apagado no Google sai do ATRIUM.
- Publicações e compromissos trazidos por link de agenda externa não vão para a agenda pessoal: o que veio de outra agenda já existe lá.
- Título de prazo que já começa com "Prazo" não ganha outro prefixo. Com títulos completos, o título no Google termina com o cliente ou, sem cliente, com o processo; esse final não volta para o registro. Criação limitada a 30 dias para trás e 365 para frente.
- Títulos reduzidos tiram título, descrição, local, cliente e processo do que vai para o Google, e mudanças de texto vindas de lá são ignoradas.

## Allowed operations

Conectar, confirmar, escolher títulos e prazos, sincronizar agora e desconectar, cada pessoa na própria conta. O agendador envia alterações em até 30 segundos e lê o Google a cada 2 minutos.

## Forbidden operations

- Alterar `deadline`, `fatalDeadline`, ciência ou tratamento a partir do Google.
- Ler ou gravar em agenda de outra pessoa, ou ligar conta Google sem a confirmação feita com sessão.
- Apagar evento do Google que não esteja ligado a registro do ATRIUM.
- Enviar evento pessoal a provedor de IA, boletim ou exportação do escritório.

## Security boundary

A volta do Google não tem sessão, porque o cookie é `SameSite=Strict`. `/callback` só guarda o resultado por 10 minutos e redireciona; `/confirm`, com sessão e CSRF, confere se o pedido é da mesma pessoa e do mesmo escritório. Isso impede ligar a agenda de alguém à conta de outra pessoa por um link. Tokens ficam no cofre `google-calendar.json`, em AES-256-GCM, por escritório, fora do Store, de logs, de respostas e do backup portátil.

## Failure semantics

- Autorização encerrada pelo Google (`invalid_grant`): situação `reconnect_needed`, o agendador para e a tela pede nova conexão.
- Outras falhas: `lastError` visível e nova tentativa na rodada seguinte. Id de evento previsível torna a repetição segura.
- Chave de sincronização vencida (410): releitura completa da janela, sem duplicar.
- Se mais de 20 eventos e mais da metade dos ligados fossem sair de uma vez, nada é apagado e a tela avisa. Só a troca de "quais prazos aparecem" libera essa remoção.

## Persistence semantics

Mudanças vindas do Google passam por `enqueueAppStateMutation` e `saveAppStateDirectUnlocked`, com revisão; o navegador recebe pelo rebase de 409 ou pela releitura guardada, que não passa por cima de edição em andamento. Desconectar tira as cópias da agenda pessoal, apaga do ATRIUM os compromissos pessoais e revoga a autorização.

## Relevant tests

`tests/google_calendar_sync.test.mjs`, com o Google simulado em `tests/fake_google_calendar.mjs`. O teste com conta Google real depende das chaves do projeto no Google Cloud.
