# Gate 26F — DAV Integration Foundation

## Scope decision

Implementar stacks completas WebDAV/CalDAV/CardDAV, discovery, XML namespaces, ETags, locks e reconciliação seria desproporcional e inseguro sem uma matriz real de servidores. O gate entrega uma foundation executável e testada, sempre rotulada `Experimental / Unverified`.

## Entregue

- contrato único para WebDAV, CalDAV e CardDAV;
- cofre AES-256-GCM com escrita privada e atômica;
- visão pública sem senha e sem alegação `Connected`/`Verified`;
- `PROPFIND`, `GET` e `PUT` explícitos;
- HTTPS obrigatório, SSRF deny-by-default, redirects same-origin e limite de resposta;
- rejeição de DTD/entity XML e de métodos destrutivos;
- mock DAV HTTP loopback habilitado somente por opção explícita de teste.

## Não entregue

Não há UI, sync automático, parser CalDAV/CardDAV completo, reconciliação, importação de eventos/contatos, remote document provider, locks, discovery ou servidor público de homologação. Agenda, Contatos, Documentos e Store não são mutados. Probes bem-sucedidos permanecem `endpoint_responded_unverified`.

## Próximo passo possível

Cada protocolo exige subgate próprio com servidor real identificado, matriz de compatibilidade, ETag/UID determinísticos, conflito supervisionado e UX explícita antes de sair de `Experimental`.
