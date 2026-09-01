# Integrações DAV

Status: **CURRENT** para a foundation de segurança e transporte explícito; **EXPERIMENTAL / UNVERIFIED** para WebDAV, CalDAV e CardDAV em endpoints reais.

## Purpose

Definir uma base aberta, limitada e honesta para avaliar WebDAV, CalDAV e CardDAV sem introduzir sincronização automática, reconciliação destrutiva ou alegações de conectividade não comprovada.

## Canonical authority

`lib/dav/dav-integration-service.mjs`, o cofre privado `dav-integrations.json` e `tests/dav_integration_foundation.mjs`.

## Invariants

- WebDAV, CalDAV e CardDAV permanecem `experimental`; resposta de endpoint não significa compatibilidade completa nem produção verificada.
- Credenciais são cifradas e nunca retornam em status, logs, URL ou Store.
- Operações de rede são explícitas; não existe timer, sync bidirecional ou reconciliação automática.
- Agenda, Contatos e Documentos continuam autoridades canônicas independentes desta foundation.
- Redirect com credencial só pode permanecer na mesma origem HTTPS configurada.

## Allowed operations

- Configurar endpoint, usuário e senha em cofre local cifrado.
- Executar probe `PROPFIND` explícito e manter status sanitizado `endpoint_responded_unverified`.
- Executar `PROPFIND`, `GET` e `PUT` explícitos, limitados e supervisionados para experimentação controlada.
- Usar endpoint HTTP loopback somente quando o serviço é construído explicitamente em modo de teste.

## Forbidden operations

- Declarar conexão verificada, interoperabilidade completa ou suporte de produção com base em mock/probe.
- Fazer sync bidirecional documental, criar eventos duplicados ou sobrescrever contatos canônicos.
- Aceitar HTTP em produção, host privado/reservado, credencial embutida na URL ou redirect cross-origin.
- Fazer `DELETE`, `MOVE`, reconciliação silenciosa, download ilimitado ou parsing de DTD/entity XML.

## State model

O cofre cifra `connections[type]` com endpoint, usuário, senha, datas e último probe. A visão pública contém apenas tipo, maturidade, endpoint sanitizado, presença de usuário, status e datas; `verified` permanece `false` nesta foundation.

## Security boundary

O serviço valida protocolo, DNS/IP, origem de redirects, métodos e tamanho da resposta antes de expor bytes. Basic Auth só é emitido depois dessa validação e nunca acompanha redirect para outra origem. Store, Agenda, Contatos e Documentos não são importados.

## Failure semantics

URL inválida, HTTP não autorizado, SSRF, redirect inseguro, método não permitido, resposta maior que o limite e XML com DTD/entity falham fechados. Probe falho registra apenas estado sanitizado, sem propagar segredo ou promover status.

## Persistence semantics

Configuração e credenciais vivem em envelope AES-256-GCM privado, escrito por temporário seguido de rename. O arquivo não integra o Store jurídico nem backup portátil. Nenhum recurso DAV remoto é persistido automaticamente.

## Relevant tests

`tests/dav_integration_foundation.mjs`, `tests/security.mjs`, `tests/agenda_feature.mjs`, `tests/contacts_feature.mjs` e `tests/document_storage_provider.mjs`.
