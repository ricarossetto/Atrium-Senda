# Limites de segurança

Status: **CURRENT**

## Purpose

Preservar autenticação forte, autorização, criptografia, isolamento de arquivos e minimização de dados.

## Canonical authority

`lib/security.mjs`, `server.mjs`, `js/auth.js`, políticas em `supabase/` e serviços de segredo em `lib/`.

## Invariants

- Senhas são derivadas com algoritmo canônico; MFA/TOTP RFC 6238, recovery codes e trusted devices permanecem isolados por usuário.
- Cookies de sessão são protegidos; mutações exigem CSRF e RBAC.
- Estado, backup, feedback e cofres sensíveis usam criptografia autenticada.
- Rotas estáticas usam allowlist e bloqueiam paths/arquivos privados.

## Allowed operations

- Autenticar, habilitar/desabilitar MFA por fluxos autorizados e rotacionar segredos com migration explícita.
- Retornar apenas status higienizado necessário à UI.

## Forbidden operations

- Logar/commitar senha, key, PFX, TOTP, cookie, token, recovery code ou dado real de cliente.
- Enfraquecer CSRF/MFA/RBAC/rate limit/CSP para facilitar teste.
- Servir `data/`, `.env`, `.git`, `lib/`, `tests/` ou traversal.

## State model

Usuário, role/status, MFA, sessão, trusted device e artefatos cifrados separados por autoridade.

## Security boundary

Backend determina ator/role/revision; frontend não é autoridade de permissão ou segredo.

## Failure semantics

Falha é deny-by-default, com mensagens sanitizadas e sem fallback inseguro.

## Persistence semantics

Material sensível é cifrado e escrito de forma privada/atômica; chaves não entram no Store jurídico.

## Relevant tests

`tests/security.mjs`, `tests/security_migrations.mjs`, `tests/rls.mjs`, `tests/deployment.mjs`, `tests/backup_restore.mjs`.
