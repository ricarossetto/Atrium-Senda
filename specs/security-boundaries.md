# Limites de segurança

Status: **CURRENT**

## Purpose

Preservar autenticação forte, autorização, criptografia, isolamento de arquivos e minimização de dados.

## Canonical authority

`lib/security.mjs`, `server.mjs`, `js/auth.js`, políticas em `supabase/` e serviços de segredo em `lib/`.

## Invariants

- Senhas são derivadas com algoritmo oficial; MFA/TOTP RFC 6238, recovery codes e trusted devices permanecem isolados por usuário.
- Cookies de sessão são protegidos; mutações exigem CSRF e RBAC. `NODE_ENV=production` ativa obrigatoriamente o modo cloud-only e a validação fail-closed de segredos, origem frontend, token de setup e cookie seguro; flags legadas não podem desligar esses controles em produção.
- Estado, backup, feedback e cofres sensíveis usam criptografia autenticada.
- Rotas estáticas usam allowlist e bloqueiam paths/arquivos privados. No Pages, HTML público (inclusive deep-links e fallback SPA) é `no-store`; CSS, JS e assets públicos são armazenáveis com revalidação obrigatória, inclusive fontes e imagens com URLs estáveis. O `Cache-Control` global não pode impor `no-store` aos assets, e as regras de cache dos caminhos estáticos não se sobrepõem. A API proxied permanece privada e sem cache; nenhum estado ou resposta autenticada recebe cache público.
- Recuperação de senha é opt-in por e-mail oficial do usuário: o token é aleatório, persistido apenas como hash, de uso único, com expiração curta, e a solicitação nunca revela existência de conta. Redefinição e alteração revogam sessões e trusted devices do usuário; a nova senha passa por `validatePassword` e contas com MFA continuam exigindo o segundo fator.
- **Aviso de link externo (anti-phishing)**: todo endereço renderizado como link em conteúdo de terceiro (links úteis do escritório, anexos RPI/INPI, suspensões registradas) é classificado por `js/core/link-safety.js` (puro) em `official` (sufixos `jus.br`/`gov.br`/`leg.br`/`mp.br`), `external` ou `unsafe` (http, IP literal, credenciais embutidas, domínio com caracteres especiais, porta não padrão). Externos e suspeitos recebem um aviso discreto com o motivo; o aviso é informativo e nunca bloqueia a navegação decidida pelo usuário. Domínio que apenas imita o sufixo oficial (ex.: `jus.br.exemplo`) permanece externo.
- **Relato de erro com consentimento**: erros relevantes recebem código próprio determinístico (`ATR-AAAAMMDD-XXXXXXXX`, SHA-256 de escopo+mensagem+detalhes redigidos) em `lib/admin/error-report.mjs` e `js/core/error-report.js` (paridade coberta por teste). O overlay mostra o código, o contexto e a **prévia exata** do que será enviado; o envio é sempre explícito (`POST /api/system/error-report`, sessão + CSRF + limite de 20/hora por workspace). O servidor reaplica a redação como autoridade (e-mail, CPF/CNPJ, telefone, tokens, credenciais, número de 20 dígitos) e persiste o relato redigido em `data/system/error-reports.json` (0600, teto 200). O e-mail de suporte, se configurado pelo operador com `ATRIUM_SUPPORT_EMAIL`, usa o SMTP próprio do escritório; sem essa variável, o relato fica registrado no servidor e a interface declara que o suporte não está configurado. Nenhum conteúdo judicial, segredo ou dado pessoal é enviado.

## Allowed operations

- Autenticar, habilitar/desabilitar MFA por fluxos autorizados e rotacionar segredos com migration explícita.
- Retornar apenas status higienizado necessário à UI.

## Forbidden operations

- Logar/commitar senha, key, PFX, TOTP, cookie, token, recovery code ou dado real de cliente.
- Enfraquecer CSRF/MFA/RBAC/rate limit/CSP para facilitar teste.
- Servir `data/`, `.env`, `.git`, `lib/`, `tests/` ou traversal.
- Interpolar dados externos diretamente em HTML, atributo ou URL executável. Formulários compartilhados escapam rótulos, notas e nomes; previews de documentos e boletins passam pelo sanitizador de HTML permitido em `js/core/html-safety.js`. Logos aceitam somente URL http(s) ou imagem base64 validada por `js/core/link-safety.js`; SVG conserva referências internas inertes.

## State model

Usuário, role/status, MFA, sessão, trusted device e artefatos cifrados separados por autoridade.

## Security boundary

Backend determina ator/role/revision; frontend não é autoridade de permissão ou segredo.

Mutations administrativas sensíveis — gestão/exclusão de usuários, cadastro e convites de integrantes, backup/restore, credenciais de IA, ativação de envio de publicações, credenciais do cofre judicial e reconstrução de runtime (inclusive `POST /api/system/rebuild-runtime`) — exigem papel administrativo (assertAdmin/assertMasterAdmin) e CSRF; o segundo fator nunca é obrigatório nem bloqueia acesso; o próprio usuário habilita e desabilita em Configurações (`GET /api/auth/mfa/status`, `POST /api/auth/mfa/enroll|enable|disable`). Gestão/exclusão de usuários, backup/restore e mudanças de papel/registro mantêm step-up de senha, com código apenas quando o segundo fator estiver ativo. `POST /api/auth/register` não usa step-up por body.password (a senha do body pertence ao novo usuário). Consumidores de UI de rotas com step-up recebem reauth genérica (`withReauth`); documentos históricos de auditoria não são reescritos e divergências de contrato são resolvidas nesta spec.

## Failure semantics

Falha é deny-by-default, com mensagens sanitizadas e sem fallback inseguro.

Solicitação de recuperação responde de forma genérica e indistinguível para identificador existente ou inexistente: mesmo status, mesmo corpo e mesmo erro para token ausente, expirado ou reutilizado. A equalização de tempo é best-effort por trabalho constante; efeitos internos de auditoria e enfileiramento podem permanecer observáveis apenas por medição estatística. Rate limit por identidade e por endereço de origem é aplicado antes da resolução da conta, sempre com o endereço real do socket — cabeçalhos de proxy controláveis pelo cliente nunca decidem o controle. O teto diário de e-mails de redefinição por escritório é auditado quando suspende envios.

## Persistence semantics

Material sensível é cifrado e escrito de forma privada/atômica; chaves não entram no Store jurídico.

Chaves de acesso de processos eproc ficam no cofre judicial cifrado, isoladas por usuário + CNJ. A UI pode substituí-las, mas nunca as relê; o backend as resolve para consultas posteriores.

## Relevant tests

`tests/security.mjs`, `tests/security_migrations.mjs`, `tests/rls.mjs`, `tests/deployment.mjs`, `tests/backup_restore.mjs`, `tests/password_recovery.mjs`, `tests/ui_v2_password_recovery.mjs`, `tests/link-safety.test.mjs`, `tests/xss_dom_hardening.mjs`, `tests/error_report_feature.mjs`, `tests/error_report_http.mjs`, `tests/visual_ui_v2_error_report.mjs`.
