# Changelog

As mudanças relevantes do ATRIUM são registradas neste arquivo. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa versionamento semântico.

## [2.0.0] - 2026-09-02

### Stable

- Primeira versão estável do ATRIUM, com a interface V2 como única experiência oferecida ao usuário.
- Distribuição Windows de um clique por `ATRIUM.bat`, com diagnóstico e instalação idempotente.

### Added

- Dashboard operacional, contatos/clientes, CRM, processos, publicações, Kanban, agenda, financeiro, documentos, prompts, assistência por IA, auditoria, notificações, monitoramento, links e configurações.
- Lançamentos de despesas, custas e reembolsos vinculáveis aos registros financeiros e processuais.
- Busca global e full-text derivada sobre entidades, documentos/OCR e conteúdo autorizado.
- Importador de planilhas com prévia e aplicação supervisionada.
- Temas claro/escuro, layouts responsivos, acessibilidade por teclado e motion reduzível.

### Changed

- Identidade pública e labels correntes consolidados como ATRIUM 2.0.0 Stable.
- Bootstrap e imagem Docker alinhados a Node.js 24, pnpm 11.19.0 e lockfile congelado.
- Documentação de instalação, uso, arquitetura, segurança e limitações consolidada para a release.
- Painéis laterais fecham por clique externo quando não há alterações e pedem confirmação antes de descartar edição pendente.
- Biblioteca de prompts compactada para quatro cartões por linha em telas amplas, com ações de altura reduzida.

### Security

- Persistência AES-256-GCM com revisão, gravação atômica, recovery e backups cifrados.
- Sessões HttpOnly/SameSite, CSRF, RBAC, TOTP e separação de segredos do Store frontend.
- Documentos privados cifrados, rotas protegidas e egress cadastral com allowlist, timeout, rate limit e circuit breaker.
- Distribuição exclui `.env`, dados, certificados, chaves, perfis e demais artefatos privados.

### Judicial

- Discovery conservador DJEN → CNJ → processo → DataJud → contatos/relação de cliente quando autorizado por dados estruturados.
- Reconciliação de clientes idempotente, com prioridade ao vínculo manual, confiança mínima de 90% e Gemini opcional; advogado e parte contrária não são promovidos a cliente.
- Sessões A1, PJeOffice e TOTP supervisionadas e separadas por portal, com suporte a múltiplas abas e confirmação somente por evidência positiva de autenticação.
- Política read-only explícita: sem ciência, assinatura, peticionamento, protocolo, bypass ou confirmação automática de prazo.

### Documents

- Acervo com upload/download, preview seguro, exclusão lógica, restauração, expurgo e deduplicação por checksum.
- OCR local configurável, extração de texto, derivados textuais/PDF e indexação full-text.
- Gerador de minutas preservado, com preview e exportação Markdown.

### Registry Intelligence

- Validação local de CPF; CNPJ numérico/alfanumérico via BrasilAPI; CEP via BrasilAPI/ViaCEP; diretório de bancos.
- Comparação atual/encontrado, proveniência, freshness/cache, QSA e sugestões supervisionadas de duplicidade/conflito.

### User Interface

- Sistema Mineral Editorial, superfícies read-first, inspectors, drawers e RecordLists responsivas.
- Microinterações contidas, foco visível, redução de movimento e estados claros de operação/erro.

### Testing

- CI em Node 24 com Lint/Test/E2E, Visual QA multiviewport e validação A1 no Windows.
- Cobertura dirigida de segurança, concorrência, recovery, persistência, integrações e fluxos reais sintéticos.

[2.0.0]: https://github.com/ricarossetto/Atrium-Senda/releases/tag/v2.0.0
