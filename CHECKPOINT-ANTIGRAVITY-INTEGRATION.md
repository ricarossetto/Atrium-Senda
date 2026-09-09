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

O teste focado anterior perdeu o retorno da ferramenta; não declare que passou. O servidor deve permanecer rodando na 4173.

