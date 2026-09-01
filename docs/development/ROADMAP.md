# ATRIUM — Roadmap pós-hardening técnico

## NOW — Baseline técnico da UI V2 concluído

- Preservar na branch `ui-v2` o checkpoint final aprovado e todos os checkpoints históricos por tags imutáveis.
- Manter a UI V2 como padrão e a UI Clássica como fallback visual selecionável.
- Preservar um único App, Store, backend, schemas, rotas e conjunto de regras de negócio.
- Não promover para `main`, publicar release ou remover a Classic sem decisão posterior e explícita.

## NEXT — Iconography & Visual Language Polish

- Consolidar iconografia e linguagem visual em missão própria, sem reabrir regras de negócio.

## AFTER — Global Visual Polish

- Executar o refinamento visual transversal somente depois da iconografia, preservando acessibilidade, temas e fallback Classic.

## THEN — Managed Judicial Connectivity

- Planejar conectividade judicial gerenciada para A1, PJeOffice e TOTP, com credenciais supervisionadas, sessões por portal, descoberta e sincronização do acervo, movimentações e estado de conexão.
- Manter intervenção humana quando o portal exigir e comportamento read-only por padrão.
- Não realizar ciência, assinatura ou protocolo automático.
- Esta capacidade está apenas planejada; não foi implementada pelo Gate 22.

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
