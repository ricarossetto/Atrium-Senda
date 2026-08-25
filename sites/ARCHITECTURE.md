# Arquitetura Codex + Sites

## Plus — configuração recomendada agora

```text
Codex Project
  ├─ AGENTS.md
  ├─ .agents/skills/*
  ├─ documentos do caso
  └─ execução do $legal-agent
          ↓
     workspace/runs/*/FINAL.md

ChatGPT Site
  ├─ interface de casos
  ├─ D1 (metadados/estado)
  ├─ R2 (arquivos)
  └─ visualização/edição dos artefatos
```

A inferência jurídica fica no Codex. Não use uma chave OpenAI API.

## Business/Enterprise — evolução sem API tradicional

Quando Workspace Agents estiver disponível no workspace:

```text
ChatGPT Site
   ↓ server-side
Workspace Agent API trigger
   ↓
Agente Jurídico publicado
   ↓
resposta/artefatos
```

Nesse modelo, a execução do Workspace Agent integra o pool agentivo do workspace, em vez de usar uma `OPENAI_API_KEY` da plataforma. O Site deve guardar o access token do Workspace Agent apenas como secret de runtime, nunca no frontend.

## Observação

Não tente autenticar um Site público usando cookies/session tokens pessoais do Codex, nem automatizar a UI do ChatGPT para simular uma API. Isso é frágil e inseguro. Use o caminho oficial disponível ao plano.
