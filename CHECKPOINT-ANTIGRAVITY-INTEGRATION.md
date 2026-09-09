# CHECKPOINT — integração Antigravity (2026-09-09)

Repo: `C:\Users\Ricardo PC\.codex\.chatgpt-projects\g-p-6a82f704d32881919c2abfb7ef8f806a\juris-flow`
Branch: `codex/antigravity-structural-integration`
Base: `449be7f` (main / ATRIUM 2.1.1).
Preserve a porta 4173 e não toque na 4188. Não descarte alterações locais.

## Auditoria
Fonte Anti lida apenas para comparação: `C:\projetos IA\consulta tjrs atrium\TESTE INTEGRAÇÃO ATRIUM`, commit `d96b145`.
Não faça merge/cherry-pick integral desse commit: foram encontrados credenciais e caminhos hardcoded, dados pessoais reais, chave processual indo ao Store/log e sincronização sem aceite explícito. Não copie o prompt de integração nem arquivos do brain.

## Implementado
- Drawer de documentos do processo com preview seguro, download e Assistente.
- Abertura do processo a partir de tarefa e dashboard.
- Banner do processo vinculado no modal de tarefa.
- Filtro estrito de documentos por proprietário e ordenação por evento iniciada.
- Removidos download A1 inseguro, bloco A1 inline e enriquecimento automático trazidos do laboratório.
- Preview restrito a imagem/texto; sem HTML ativo.
- Correções de foco, Escape, scroll e fechamento entre inspector e drawer.

## Alterações
`index.html`; `js/portal.js`; features de dashboard, documents, processes e tasks; presenter de processos; CSS das quatro views.

## Pendente
1. Ler AGENTS.md, este arquivo e specs/README.md; conferir git status sem reset.
2. Revisar o diff inteiro e garantir ausência de dados privados/credenciais.
3. Corrigir o comparator de eventos em documents.js (Infinity deve ordenar depois dos eventos numerados).
4. Consolidar badges usando document-metadata-tags: Evento, Oficial A1 e tags existentes.
5. Rodar node --check nos JS alterados, git diff --check e testes focados: ui_v2_processes, ui_v2_tasks, ui_v2_documents, dashboard_feature e ui_v2_iconography.
6. Não iniciar nem acompanhar pnpm test sem pedido do usuário.
7. Corrigir falhas focadas sem reduzir assertions.
8. Só depois fazer commit funcional/push da branch e preparar merge revisável. Não promover a main sem workflow candidato verde.
9. Não fazer redesign visual autônomo; apenas violações evidentes.

## Validação concluída após a retomada

- Removidos listener duplicado, estilos inline e promessa visual de download A1 sem implementação.
- Restaurada a apresentação canônica do tribunal e da classificação, sem presumir TJRS.
- Ordenação por evento e badges `Evento`, `Oficial A1` e tags existentes conferidos.
- `node --check` passou nos JavaScript alterados.
- `git diff --check` passou.
- Passaram: `ui_v2_processes.mjs`, `ui_v2_tasks.mjs`, `ui_v2_documents.mjs`, `dashboard_feature.mjs` e `ui_v2_iconography.mjs`.
- A suíte global `pnpm test` não foi executada, conforme orientação do usuário.

O servidor deve permanecer rodando na 4173. A próxima etapa é revisão humana/visual desta branch e, depois, preparação do merge; ainda não promover para `main` sem o workflow candidato verde.

## Painel operacional de Configurações

- As dez seções administrativas receberam campos operacionais para equipe, fluxo, metas, notificações e integrações.
- Status podem ser alternados no mesmo registro, com persistência e rollback em caso de falha.
- Integrações conhecidas abrem os modais canônicos de A1/2FA, DataJud, Gemini, agenda e e-mail; nenhuma credencial entra em `state.configuration`.
- Textos do patch externo que prometiam prazo automático, tarefa automática, envio automático ou frequências inexistentes foram substituídos por preferências e sugestões sujeitas a confirmação humana.
- Os novos atalhos e callouts usam a cor primária no tema claro, sem o dourado anteriormente rejeitado.
- Contrato registrado em `specs/configuration-management.md`.
- Passaram `configuration_feature.mjs`, `ui_v2_configuration_admin.mjs` e `configuration_persistence.mjs`.
