# ATRIUM — Roadmap pós-hardening técnico

## BASELINE ATUAL — CONCLUÍDO

- Managed Judicial Connectivity opera A1, PJeOffice, TOTP e sessões como estratégias independentes e read-only, com backoff e supervisão humana.
- As especificações canônicas, maturidade documental, inteligência local, busca derivada, provider de storage, DAV experimental e foundation da API foram concluídas nos limites registrados.
- Credenciais permanecem cifradas; conectividade sem evidência live continua experimental ou não verificada.

## PRÓXIMO — VALIDAÇÃO HUMANA

- Executar teste humano guiado com advogados, registrar feedback local e aplicar correções finitas.
- Validar empacotamento, atualização, backup e restauração no ambiente Windows alvo antes de release.

## FUTURO — SOMENTE POR SUBGATE

- Backup portátil de blobs, providers remotos, protocolos DAV verificados e API pública/versionada exigem evidência, threat model e subgates independentes.
- SQLite permanece hipótese de migração, não armazenamento atual.

## CHECKPOINTS VISUAIS CONCLUÍDOS

- Gate 23: iconografia original, coerente e acessível, checkpoint `ui-v2-iconography`.
- Gate 24: polish global Mineral Editorial, temas e responsividade, checkpoint `ui-v2-global-polish`.

## CHECKPOINTS DE MATURIDADE

- `GATE25_HEAD=e658c1734be912dfb66961f780b00466ed39d0e6` — Managed Judicial Connectivity aprovada na CI e protegida pela tag `managed-judicial-connectivity`.
- Gate 26A: árvore `specs/` estabelece contratos CURRENT/FUTURE e guidance obrigatório para agentes.
- Gate 26B: acervo documental canônico com ownership por contato/processo, naming seguro, blobs cifrados deduplicados e lixeira recuperável.
- Gate 26C: preview inerte, extração/OCR local supervisionada e conversão textual determinística para PDF.
- Gate 26D: índice full-text derivado, versionado e reconstruível sobre Store/OCR cifrados, com busca global segura em sete domínios.
- Gate 26E: regras documentais desacopladas do storage físico por provider canônico; adapter local cifrado preserva paths, deduplicação e atomicidade do baseline.
- Gate 26F: foundation DAV executável com cofre cifrado, transporte explícito e defesas de rede; WebDAV/CalDAV/CardDAV permanecem experimentais e não verificados.
- Gate 26G: contrato incremental da API interna com metadata autenticada, headers e política de compatibilidade; API pública/versionada permanece futura.

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
