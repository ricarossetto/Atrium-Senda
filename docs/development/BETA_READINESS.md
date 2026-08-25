# ATRIUM — CHECKLIST BETA READY (BETA_READINESS.md)

Este documento define os critérios de conformidade técnica para a liberação do Atrium para testes reais por advogados (Beta Ready).

## Checklist de Conformidade Técnica & Segurança

- [x] **Instalação limpa e bootstrap automatizado**: `iniciar-atrium.bat` detecta ausência de `node_modules` e instala automaticamente dependências em 1 clique.
- [x] **Aplicação inicia automaticamente**: `npm start` inicializa na porta padrão e abre o navegador automaticamente.
- [x] **Setup inicial funciona**: Configuração do primeiro admin com nome, usuário e senha forte.
- [x] **Autenticação robusta**: Sessão HttpOnly SameSite=Strict com Zero Trust e CSRF tokens.
- [x] **MFA / 2FA opcional por usuário**: Segundo fator TOTP (RFC 6238) opcional com ativação posterior soberana por usuário.
- [x] **Recuperação de acesso individualizada**: 8 códigos de emergência de uso único por usuário gerados na ativação do 2FA.
- [x] **Criptografia em repouso**: AES-256-GCM com chave derivada via Scrypt e segredos judiciais cifrados em disco.
- [x] **A1 Sandbox & Validação mTLS**: Validação de certificados PFX em memória sem persistência de segredos, assinando nonce SHA-256 (Windows .NET + Linux OpenSSL para CI).
- [x] **Gestão Segura de Credenciais**: `JudicialCredentialManager` realiza exclusão física imediata (`unlink`) de certificados substituídos ou revogados.
- [x] **Arquitetura de Adaptadores Judiciais**: `AuthAdapter` desacoplado por estratégia (`credentials-totp` para eproc, `pjeoffice-local` para PJe, `client-cert-mtls` para mTLS, `manual-persistent-session` para e-SAJ).
- [x] **Contatos funcionam**: Cadastro, importação XLSX e deduplicação inteligente.
- [x] **Processos funcionam**: Cadastro, busca e consulta processual unificada.
- [x] **Tarefas & Kanban funcionam**: Atribuição, prioridades, TaskScore e movimentação de cards.
- [x] **Agenda jurídica funciona**: Compromissos e audiências integradas com cálculo CPC/2015 (dias úteis e recesso forense).
- [x] **Financeiro funciona**: TimeSheet, apontamento de horas e cálculo de honorários/RPV.
- [x] **Triagem de intimações funciona**: Classificação autônoma por tipo de ato e sugestão de prazo via DJEN / DataJud.
- [x] **Catálogos ADVBOX/Legal One**: 86 tipos de ação e 140 definições de tarefas com pontos.
- [x] **Identidade visual oficial**: Logotipos vetoriais SVG, tipografia Playfair Display e alto contraste.
- [x] **Diagnóstico de primeira classe**: Painel de verificação de integridade e exportação segura.
- [x] **Backup e restauração integrados**: Exportação cifrada `.atrium-backup` com snapshot de segurança pré-restauração.
- [x] **Feedback Beta integrado**: Canal nativo de comunicação de bugs e sugestões.
- [x] **Ausência de Gemini não quebra aplicativo**: Fallbacks graciosos para operação offline.
- [x] **Logs não contêm segredos**: Sanitização de credenciais, senhas de PFX via stdin e chaves criptográficas.
- [x] **Busca global funciona**: Atalho `/` para busca em contatos, processos e tarefas.
- [x] **Todas as 11 suítes de teste passam**: 11/11 suítes 100% aprovadas (`npm test` e `npm run check`).
- [x] **CI automatizado**: GitHub Actions configurado com matrix de integridade de sintaxe e testes completos.

## Status Atual
- **Modo**: `BETA READY / HARDENED`
- **Versão**: `v2.0 Beta` (Branch `beta-hardening`)
- **Estabilidade do Main**: `main` intacta e congelada no commit estável `e545e57`.
