# Agente Jurídico para Codex — sem chave de API

Este projeto transforma o Codex em um agente jurídico de fluxo completo usando `AGENTS.md` e Agent Skills do repositório. O raciocínio e a redação são feitos pelo modelo do próprio Codex/ChatGPT; não há `OPENAI_API_KEY` no projeto.

## Uso rápido

1. Abra esta pasta como projeto/repositório no Codex.
2. Coloque PDFs/documentos em `workspace/inbox/` ou anexe-os à conversa.
3. Inicie com, por exemplo:

```text
$legal-agent Analise integralmente os documentos e elabore réplica à contestação. Enfrente todos os argumentos relevantes, pesquise apenas jurisprudência verificável em fontes oficiais e entregue a peça final em FINAL.md.
```

O Codex detecta skills do repositório em `.agents/skills/`.

## O que será criado por execução

Em `workspace/runs/<data_nome>/`:

- fontes e rastreabilidade;
- cronologia;
- issues/riscos;
- plano;
- rascunho;
- auditoria;
- `FINAL.md`.

## Por que isso economiza API

O projeto não chama a Responses API. Quando você roda o fluxo dentro do Codex autenticado com seu ChatGPT, o trabalho entra no uso agentivo do Codex/ChatGPT aplicável ao seu plano.

Isso **não transforma a cota do Codex numa API pública**. Para uma aplicação web pública disparar automaticamente um agente do ChatGPT, a solução oficial atual é Workspace Agents com trigger/API, disponível em Business/Enterprise. Em Plus, use este projeto diretamente no Codex; um ChatGPT Site pode hospedar a UI e dados, mas não assuma que visitantes possam consumir sua cota semanal do Codex como backend de inferência.

## Sites

Veja `sites/SITE_PROMPT.md` e `sites/ARCHITECTURE.md`.
