# Política de segurança

## Versão suportada

A linha estável suportada é a 2.0.x. Correções de segurança são publicadas no repositório e nas releases oficiais.

## Divulgação responsável

Não abra issue pública para vulnerabilidade que possa expor dados, credenciais ou permitir acesso indevido. Entre em contato de forma privada com o mantenedor pelo recurso **Report a vulnerability** do GitHub, quando disponível, ou pelo canal privado indicado no perfil do repositório. Inclua impacto, versão, passos mínimos e uma prova inteiramente sintética.

Não anexe nem envie:

- dados reais de clientes, processos ou publicações;
- `.env`, cookies, tokens ou chaves de API;
- certificado PFX/P12/PEM, chave privada ou senha;
- QR, segredo TOTP ou código de recuperação;
- diretório `data/`, backup real ou perfil de portal.

## Escopo de segurança

São especialmente sensíveis: autenticação e sessão, RBAC/ownership, CSRF, persistência cifrada, backup/restore, documentos privados, segredos de integração, sessão judicial, egress externo e prevenção de vazamento estático.

O ATRIUM depende de Node.js, navegador/Playwright e serviços externos. Vulnerabilidades nesses componentes devem ser verificadas contra as versões efetivamente usadas antes do reporte.

## Operação segura

- Mantenha `.env` e `data/` fora do Git e com acesso restrito.
- Preserve `AUTH_ENCRYPTION_KEY` em backup seguro separado.
- Use HTTPS e `COOKIE_SECURE=true` quando houver acesso além de localhost.
- Faça backup antes de atualizar ou migrar.
- Não automatize ciência, assinatura, peticionamento, protocolo, CAPTCHA ou 2FA.
- Revise relatórios de diagnóstico antes de compartilhá-los.

O projeto não oferece garantia de segurança de serviços externos nem substitui a avaliação profissional do ambiente de implantação.
