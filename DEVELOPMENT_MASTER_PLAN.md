# ATRIUM — Plano-mestre de desenvolvimento

## Modo atual: AUDIT / TECHNICAL BETA PRE-UI-V2

A arquitetura frontend foi modularizada. O foco atual é integridade, segurança, recuperação, instalação reproduzível e correspondência entre documentação e comportamento real. Não há nova fase arquitetural neste gate.

## Proteção das referências Git

- Desenvolvimento exclusivamente em `beta-hardening`.
- `main`, `checkpoint-pre-modularization` e `pre-modularization-beta-1` permanecem imutáveis sem autorização explícita.
- Sem reset destrutivo, rebase de histórico ou force push.
- Cada ciclo termina com regressões dirigidas, `pnpm check`, `pnpm test`, revisão do diff, commit, push e GitHub Actions completo.

## Arquitetura atual

- Frontend Vanilla JavaScript modular em `js/app`, `js/core`, `js/components`, `js/views` e `js/features`.
- `js/portal.js` é o composition shell e camada fina de compatibilidade; não deve voltar a concentrar features.
- Um único Store frontend, com persistência revision-safe e conflitos 409 explícitos.
- Backend em `server.mjs` como autoridade para sessão, permissões, revision, conteúdo de publicação e segredos.
- Armazenamento Beta em JSON cifrado AES-256-GCM, com atomic save, migrations, recovery e backups.
- Runtime derivado cifrado e reconstruível, com estados `EMPTY`, `READY` e `QUARANTINED`.
- SQLite é possibilidade futura, não implementação ou padrão atual.

## Guardrails funcionais

- Discovery judicial é somente leitura e não produz ciência.
- E-mail de publicação e boletim são exclusivamente manuais; o backend resolve os registros canônicos.
- Tarefas originadas de publicação começam sem deadline. Prazo jurídico depende de conferência e confirmação humana.
- IA é assistencial, usa contexto minimizado e só chama o provedor quando uma chave foi configurada.
- Feedback Beta é local, cifrado e sem transporte externo.
- Não expor segredos, caminhos absolutos sensíveis, dados reais ou claims de saúde não medidos.

## Prioridades

1. **P0 — Integridade**: perda/corrupção de dados, recovery, concorrência, backup/restore, autenticação.
2. **P1 — Confiabilidade**: instalação Node 24/pnpm, migrations, imports, coletores e falhas explícitas.
3. **P2 — Beta usability**: diagnóstico verdadeiro, onboarding, mensagens acionáveis e feedback local.
4. **P3 — UI V2**: somente após gate verde, em dual-mode Nova/Clássica sobre o mesmo Store/backend.
5. **P4 — Empacotamento**: depois de teste humano e validação de atualização/recuperação no Windows alvo.

## Critério de saída do gate

- Testes novos de runtime recovery, configuração vazia, migrações de segurança, toolchain e readiness aprovados.
- 52 suítes canônicas locais aprovadas.
- Lint/Test/E2E, job A1 Windows e Visual QA aprovados no mesmo HEAD, preferencialmente no attempt 1.
- Working tree limpo e `beta-hardening` sincronizada com o remoto.
- Status permitido: **TECHNICAL BETA READY — PRE-UI-V2**. Isso não equivale a release final, certificação jurídica ou produção final.

## Próximo ciclo autorizado após o gate

UI V2 dual-mode: Nova UI padrão, UI Clássica preservada, toggle próximo a Claro/Escuro, mesmo Store/backend e rollback visual imediato. O ciclo atual não implementa qualquer parte dessa interface.
