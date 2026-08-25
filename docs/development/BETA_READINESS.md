# ATRIUM — CHECKLIST BETA READY (BETA_READINESS.md)

Este documento define os critérios obrigatórios para a liberação do Atrium para testes reais por advogados (Beta Ready).

## Checklist de Conformidade

- [x] **Instalação limpa funciona**: Servidor e dependências instalam sem falhas.
- [x] **Aplicação inicia automaticamente**: `npm start` inicializa na porta padrão.
- [x] **Setup inicial funciona**: Configuração do primeiro admin com nome, usuário e senha forte.
- [x] **Autenticação funciona**: Login seguro com controle de sessão HttpOnly.
- [x] **MFA / 2FA funciona**: Segundo fator TOTP (RFC 6238) com QR Code e segredo manual.
- [x] **Recuperação de acesso funciona**: 8 códigos de emergência de uso único gerados no setup.
- [x] **Criptografia em repouso**: AES-256-GCM com chave derivada via Scrypt.
- [x] **Contatos funcionam**: Cadastro, importação XLSX e deduplicação inteligente.
- [x] **Processos funcionam**: Cadastro, busca e consulta processual unificada.
- [x] **Tarefas & Kanban funcionam**: Atribuição, prioridades, TaskScore e movimentação de cards.
- [x] **Agenda jurídica funciona**: Compromissos e audiências integradas com cálculo CPC/2015.
- [x] **Financeiro funciona**: TimeSheet, apontamento de horas e cálculo de honorários/RPV.
- [x] **Triagem de intimações funciona**: Classificação autônoma por tipo de ato e sugestão de prazo.
- [x] **Catálogos ADVBOX/Legal One**: 86 tipos de ação e 140 definições de tarefas com pontos.
- [x] **Identidade visual oficial**: Logotipos vetoriais SVG, tipografia Playfair Display e alto contraste.
- [x] **Diagnóstico de primeira classe**: Painel de verificação de integridade e exportação segura.
- [x] **Backup e restauração integrados**: Exportação cifrada `.atrium-backup` e restore testado.
- [x] **Feedback Beta integrado**: Canal nativo de comunicação de bugs e sugestões.
- [x] **Ausência de Gemini não quebra aplicativo**: Fallbacks graciosos para operação offline.
- [x] **Logs não contêm segredos**: Sanitização de credenciais e chaves.
- [x] **Busca global funciona**: Atalho `/` para busca em contatos, processos e tarefas.
- [x] **Todas as suítes de teste passam**: 10/10 suítes 100% aprovadas (`pnpm test`).
- [x] **CI automatizado**: GitHub Actions configurado e ativo.

## Status Atual
- **Modo**: `AUDIT MODE / BETA CANDIDATE`
- **Gargalo Prioritário**: Auditoria final de regressão para geração da tag `beta-rc1`.
