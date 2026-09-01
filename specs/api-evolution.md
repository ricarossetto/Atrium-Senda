# Evolução da API

Status: **CURRENT** para metadata e headers do contrato interno; **POLICY-ONLY / FUTURE** para qualquer API pública ou rotas versionadas.

## Purpose

Permitir evolução compatível da API interna atual e preparar uma fronteira futura para clientes mobile/desktop ou integrações externas sem duplicar o servidor em `/v1` e `/v2`.

## Canonical authority

`lib/api/api-contract.mjs`, `server.mjs`, `tests/api_evolution_foundation.mjs` e esta política.

## Inventory and classification

- **Bootstrap de autenticação, não API pública**: `/api/auth/status`, setup, registro e login. São alcançáveis sem sessão somente para instalar/autenticar; rate limits, MFA e respostas sanitizadas continuam obrigatórios.
- **Frontend-facing internal**: estado, eventos, busca, documentos, publicações, tarefas, importação, IA, calendário e status operacional. Exigem sessão e, em mutações, CSRF/RBAC conforme o contrato existente.
- **Integration-facing private**: `/api/ingest` com bearer privado e as famílias judicial, e-mail e calendário. Não são endpoints públicos para terceiros.
- **Diagnostic/private**: `/api/system/*`, incluindo metadata, diagnóstico, backup, restore, feedback, recovery e rebuild. Metadata exige sessão; ações sensíveis preservam RBAC/CSRF.
- **Potential future public**: nenhuma rota atual. Uma API pública futura exige router separado, autenticação/escopo próprios, contrato publicado e versão explícita.

## Invariants

- As rotas atuais permanecem não versionadas e internas; não são duplicadas sob `/v1` ou `/v2`.
- Respostas JSON carregam `X-Atrium-API-Version` e `X-Atrium-API-Stability`; os payloads legados não recebem wrapping novo.
- `/api/system/api-metadata` é autenticado, determinístico e não enumera rotas nem capacidades sensíveis.
- Prefixo versionado desconhecido exige autenticação e falha com 404/código estável; nunca faz fallback para arquivo estático ou rota interna.
- Headers de versão descrevem o contrato, não compatibilidade pública nem garantia de suporte externo.

## Compatibility policy

- **Backward-compatible addition**: campo opcional, header informativo, novo endpoint autenticado ou novo valor que consumidores já tratem como extensível. Exige teste de não regressão.
- **Breaking change**: remover/renomear campo ou rota, mudar tipo/semântica/status HTTP, enfraquecer ou endurecer autenticação de forma incompatível, ou alterar idempotência/revision. Exige versão explícita antes da implementação.
- **Versioning trigger**: somente uma necessidade externa real com consumidor identificado e mudança incompatível justifica router/version prefix. Versão não nasce por cronologia ou estética.
- **Deprecation**: documentar substituto, consumidores conhecidos, telemetria local não sensível quando existente e janela mínima definida por release futura. Durante a janela, o endpoint antigo permanece funcional e sinalizado por headers padrão de depreciação.
- **Sunset**: só após comunicação, alternativa validada, janela concluída e checkpoint recuperável. Nunca remover silenciosamente rota usada pelo frontend atual.
- **Security-sensitive endpoints**: auth, state, documents, system, AI, e-mail, judicial, ingest e import nunca se tornam públicos por versionamento. MFA, sessão, bearer, CSRF e RBAC não são compatibilidade opcional.
- **Error compatibility**: envelopes legados `{ message }` permanecem válidos. Novos códigos podem ser adicionados como campo opcional; mensagem, status e significado não mudam silenciosamente.

## Allowed operations

- Consultar metadata autenticada e headers do contrato.
- Adicionar comportamento compatível às rotas internas com cobertura dirigida.
- Criar no futuro um router público isolado após gate próprio e threat model.

## Forbidden operations

- Tratar `/api/*` como API pública, enumerar rotas na metadata ou expor diagnóstico sem sessão.
- Duplicar em massa endpoints em `/v1`/`/v2` ou aceitar prefixo desconhecido por fallback.
- Remover autenticação, CSRF, RBAC, revision ou rate limit em nome de compatibilidade.
- Alterar payloads atuais para um wrapper global obrigatório.

## State model

A versão do contrato e a classificação de estabilidade são constantes de código, não estado jurídico nem preferência persistida. A metadata é derivada da versão da aplicação e não cria Store, migration ou arquivo próprio.

## Security boundary

Rotas internas continuam protegidas pela autoridade atual de sessão, CSRF, RBAC ou bearer. Metadata exige sessão e omite inventário; versionamento futuro não pode transformar endpoint sensível em público nem atravessar a static allowlist.

## Failure semantics

Versão desconhecida falha fechada com 401 sem sessão e 404 `UNSUPPORTED_API_VERSION` após autenticação. Metadata sem sessão falha como qualquer endpoint privado. Erros existentes preservam status e `{ message }`.

## Persistence semantics

Não existe persistência nova. Headers e metadata são derivados em memória a cada resposta; a foundation não altera Store, schema, revision, backup ou runtime.

## Relevant tests

`tests/api_evolution_foundation.mjs`, `tests/security.mjs`, `tests/deployment.mjs`, `tests/store_module.mjs` e `tests/smoke.mjs`.
