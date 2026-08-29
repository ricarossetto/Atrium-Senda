# ATRIUM — Roadmap pós-hardening técnico

## NOW — Gate Beta Final pré-UI-V2

- Fechar recuperação do runtime derivado, persistência de configuração vazia, migrações de segredo, feedback cifrado, toolchain Node 24 e documentação verificável.
- Exigir suíte local e workflow canônico integralmente verdes antes de avançar.
- Preservar a UI atual, o único Store, o backend e todos os contratos jurídicos existentes.

## NEXT — UI V2 dual-mode

- Nova UI como modo visual padrão.
- UI Clássica preservada como rollback visual imediato.
- Toggle **Nova/Clássica** ao lado do controle **Claro/Escuro**.
- Mesmo Store, backend, schemas, rotas e regras de negócio nos dois modos.
- Sem duplicar estado ou implementar feature paralela.

Esta etapa só começa em missão própria depois do Gate Beta verde.

## DEPOIS

- Teste humano guiado com advogados Beta, registro local de feedback e correções finitas.
- Empacotamento Windows somente após validar instalação, atualização, backup e restauração no ambiente alvo.
- SQLite pode ser estudado como migração futura. Qualquer adoção exige schema, backup prévio, migração forward, verificação e teste de restauração; não é o armazenamento padrão atual.

## CONCLUÍDO

- Frontend modular com `js/portal.js` como composition shell.
- Features de dashboard, publicações, agenda, tarefas, processos, contatos, leads, financeiro, documentos, assistente, monitoramento, configurações e integrações isoladas por responsabilidade.
- Store único revision-safe e backend canônico.
- E-mail exclusivamente manual e conteúdo judicial resolvido no backend.
- Deadlines jurídicos sujeitos a confirmação humana, sem inferência automática.
- Discovery DJEN → DataJud somente leitura, sem ciência judicial.
- Backup/restore cifrado e atômico, runtime recuperável e feedback local cifrado.
- Neutralidade de marca e compatibilidade legada restrita à camada necessária.
