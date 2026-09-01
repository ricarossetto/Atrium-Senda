# ATRIUM — Roadmap pós-hardening técnico

## NOW — Managed Judicial Connectivity

- Operar A1, PJeOffice, TOTP e sessões como estratégias independentes por portal.
- Manter cobertura read-only com cadência conservadora, backoff, pausa por autenticação e reconexão supervisionada.
- Expor somente estado e erros sanitizados; credenciais continuam cifradas no agente local.
- Tratar portais autenticados sem evidência live como experimentais ou não verificados.

## NEXT — Canonical Product Specifications

- Registrar contratos canônicos do produto para reduzir ambiguidades em mudanças futuras.

## AFTER — Product Maturity / Document Intelligence

- Evoluir documentos, preview/OCR, busca, storage e adapters externos por subgates independentes e recuperáveis.

## CHECKPOINTS VISUAIS CONCLUÍDOS

- Gate 23: iconografia original, coerente e acessível, checkpoint `ui-v2-iconography`.
- Gate 24: polish global Mineral Editorial, temas e responsividade, checkpoint `ui-v2-global-polish`.

## CONCLUÍDO

- Frontend modular com `js/portal.js` como composition shell.
- Migração UI V2 concluída nas 17 views canônicas, com V2 padrão e Classic como fallback sobre a mesma autoridade funcional.
- Features de dashboard, publicações, agenda, tarefas, processos, contatos, leads, financeiro, documentos, assistente, prompts, monitoramento, integrações, configurações, importador, auditoria e links isoladas por responsabilidade.
- Store único revision-safe e backend canônico.
- E-mail exclusivamente manual e conteúdo judicial resolvido no backend.
- Deadlines jurídicos sujeitos a confirmação humana, sem inferência automática.
- Discovery DJEN → DataJud somente leitura, sem ciência judicial.
- Backup/restore cifrado e atômico, runtime recuperável e feedback local cifrado.
- Neutralidade de marca e compatibilidade legada restrita à camada necessária.
- Human Beta Gate 1 preservado como checkpoint histórico, com A1 Windows e Visual QA verdes no respectivo baseline.

## Evoluções posteriores

- Teste humano guiado com advogados Beta, registro local de feedback e correções finitas.
- Empacotamento Windows somente após validar instalação, atualização, backup e restauração no ambiente alvo.
- SQLite pode ser estudado como migração futura. Qualquer adoção exige schema, backup prévio, migração forward, verificação e teste de restauração; não é o armazenamento padrão atual.
