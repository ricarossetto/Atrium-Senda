# Isolamento multi-escritório e implantação cloud

Status: **CURRENT — fundação em implantação incremental**

## Purpose

Permitir que vários escritórios usem a mesma implantação do ATRIUM sem compartilhar dados, usuários, documentos ou segredos.

## Canonical authority

`lib/security.mjs`, `lib/workspaces/workspace-identity.mjs`, `server.mjs`, `js/auth.js`, `js/core/store.js` e `tests/multi_workspace.mjs`.

## Invariants

- Todo usuário autenticado pertence a exatamente um `workspaceId`.
- O `workspaceId` vem da sessão validada pelo backend e nunca de payload livre do frontend.
- Usuários e operações administrativas são filtrados pelo escritório da sessão.
- O estado jurídico canônico e os blobs documentais usam diretórios físicos separados por escritório.
- Uma revisão de estado só pode concorrer com revisões do mesmo escritório.
- O cadastro adicional de escritório exige MFA. O primeiro acesso local preserva a política legada de MFA opcional; a política cloud precisa ser consolidada antes da abertura pública.
- Em cloud, segredos, token de bootstrap, cookies seguros e origens do frontend são configuração obrigatória; o servidor falha antes de abrir a porta se estiverem ausentes.
- O autosserviço de novos escritórios em cloud só é exposto quando `ATRIUM_PUBLIC_SIGNUP=true`.
- O backend aceita CORS com credenciais somente para origens exatas configuradas em `ATRIUM_FRONTEND_ORIGINS`.
- O frontend hospedado recebe a origem da API por `ATRIUM_CONFIG.apiBaseUrl`; instalações locais mantêm mesma origem.

## Estado local e compatibilidade

O escritório existente permanece no diretório raiz configurado por `JURISFLOW_DATA_DIR`. Escritórios adicionais usam `JURISFLOW_DATA_DIR/workspaces/<workspaceId>`. A migração de identidade adiciona um escritório padrão e associa usuários legados sem mover ou sobrescrever o estado existente.

## Cadastro

- A primeira instalação cria o primeiro escritório e seu administrador principal.
- Em uma instalação já configurada, `POST /api/auth/workspaces/register` inicia o cadastro de um novo escritório.
- `POST /api/auth/workspaces/register/verify` exige TOTP válido, cria o escritório e autentica seu administrador principal.
- Integrantes de um escritório são cadastrados somente por administrador autenticado e permanecem pendentes até aprovação.
- O fluxo amigável de equipe usa convite administrativo de uso único com validade de 48 horas. O link não contém senha: o integrante define suas próprias credenciais, ativa TOTP obrigatoriamente e recebe acesso ao escritório que emitiu o convite.
- Tokens de convite não são persistidos em texto aberto nem reapresentados pela API. A interface coloca o token no fragmento local do link, remove-o do endereço após a aceitação e permite ao administrador cancelar convites ainda pendentes.

## Fronteiras ainda pendentes

Runtime, diagnósticos, filas, índice de busca, cofre judicial, sessões e cache Omni são separados por escritório. O pareamento do coletor exige token exclusivo; o token legado só alcança o escritório padrão. A interface administrativa mostra o estado do pareamento, emite o token uma única vez e permite revogá-lo. A interface de equipe gera, lista e cancela convites, e a tela pública conclui senha e MFA sem expor essas credenciais ao administrador. Antes da abertura pública, ainda é necessário auditar o sidecar compartilhado e validar o frontend em origem separada. O SQL legado em `supabase/` é referência não conectada ao runtime atual e não deve ser tratado como produção ativa.

## Hospedagem

- Frontend estático: `app.atrium.adv.br` em Cloudflare Pages.
- Backend Node: `api.atrium.adv.br` em Railway com volume persistente montado em `/app/data`.
- `atrium.adv.br` pode apontar inicialmente para o mesmo frontend.
- HTTPS e cookies seguros são obrigatórios.
- O volume, a chave de criptografia e backups testados são requisitos de produção.

## Failure semantics

Sessão sem escritório é recusada. Identificador inválido, tentativa de administrar usuário de outro escritório e origem CORS não autorizada falham sem revelar existência ou conteúdo do outro escritório.

## Relevant tests

`tests/multi_workspace.mjs`, `tests/security.mjs`, `tests/ui_v2_auth_shell.mjs`, `tests/ui_v2_configuration_admin.mjs`, `tests/document_storage.mjs`, `tests/runtime_recovery.mjs`, `tests/backup_restore.mjs` e `tests/deployment.mjs`.

## Sidecar privado

Cloud e escritórios adicionais não acessam o sidecar compartilhado do servidor. As rotas privadas retornam LOCAL_AGENT_REQUIRED (503), e o adapter Omni consulta apenas fontes públicas nesses ambientes. O pareamento atual permite ingestão autenticada; não promete consulta privada remota já implementada.

O cadastro adicional só inicia após a configuração inicial e limita a cinco tentativas a confirmação TOTP por token.
