# ATRIUM — Product Maturity Baseline

Status: **CURRENT** em 2026-09-01 para o HEAD aprovado da branch `ui-v2`.

## Capacidades atuais

- Busca full-text derivada em memória, reconstruível e ligada à revision, sobre sete domínios autorizados.
- Acervo documental com provider canônico e adapter local AES-256-GCM, deduplicação SHA-256, lixeira, purge e derivados supervisionados.
- Preview inerte, OCR local explícito e PDF derivado de texto nos limites documentados.
- Foundation DAV executável e protegida, ainda **EXPERIMENTAL / UNVERIFIED**, sem UI, sync ou integração com Store/Agenda/Contatos/Documentos.
- Foundation de evolução da API interna com metadata autenticada e headers; API pública/versionada continua **POLICY-ONLY / FUTURE**.

## Limites reais

- O backup canônico protege o Store/revision. Portabilidade de blobs documentais para outro diretório/provedor ainda exige subgate próprio.
- WebDAV, CalDAV e CardDAV não possuem compatibilidade de produção certificada.
- Não existe API pública, SDK, OAuth externo ou cliente mobile/desktop certificado.
- Classificação documental automática, versionamento, assinatura, DOCX gerado e colaboração permanecem futuros.

## Evidência de segurança

A auditoria do baseline confirmou no conteúdo rastreado e nas autoridades executáveis:

- nenhum PFX, PEM, private key ou certificado real versionado;
- nenhum segredo real, cookie, senha SMTP ou TOTP adicionado pelos Gates 26D–26G;
- índice full-text apenas em memória e com fontes/segredos denylisted;
- temporários de preview/OCR removidos em `finally`;
- preview com detecção por conteúdo, CSP sandbox e `nosniff`;
- paths documentais derivados somente de checksum SHA-256 validado;
- DAV sem rota HTTP/UI, com HTTPS, validação DNS/IP, bloqueio de redes privadas/reservadas, redirects same-origin, timeout e limite de resposta;
- nenhuma execução de shell adicionada, conteúdo remoto ilimitado ou implementação AGPL incorporada.

## Clean-room

Produtos externos foram, no máximo, referência de comportamento. Nenhum source, classe, tradução de código, ícone ou asset de software AGPL foi incorporado. A implementação é independente e mantém a licença MIT existente.

## Autoridade e recuperação

Store, revision, autenticação, RBAC, CSRF, regras jurídicas e módulos V2 anteriores permanecem canônicos. Os checkpoints por gate são imutáveis; este baseline não altera `main`, visibilidade, LICENSE nem cria release.

## Trabalho genuinamente futuro

- validação humana de produto com advogados e correções finitas;
- empacotamento/atualização Windows com backup e restore validados;
- backup portátil dos blobs documentais;
- subgates por protocolo DAV com servidores reais e política supervisionada de conflitos;
- API pública somente quando houver consumidor real, threat model e contrato versionado.
