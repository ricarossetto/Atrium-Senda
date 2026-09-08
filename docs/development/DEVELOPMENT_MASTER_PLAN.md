# ATRIUM — Plano-mestre de desenvolvimento

## Modo atual: UI V2 MIGRATION COMPLETE / TECHNICAL BASELINE

A arquitetura frontend foi modularizada e a migração das 17 views canônicas para a UI V2 foi concluída. A V2 é a interface padrão e a Classic permanece fallback visual; ambas compartilham o mesmo App, Store, backend e regras. Isso não equivale a release final nem certificação de produção.

## Proteção das referências Git

- `main` preserva o baseline humano anteriormente promovido; a baseline técnica concluída da migração UI V2 permanece na branch `ui-v2` até decisão explícita de promoção.
- Os marcos históricos permanecem imutáveis nas tags `pre-modularization-beta-1`, `pre-ui-v2-beta-technical-ready` e `pre-ui-v2-human-beta-gate1`.
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
- UI V2 e UI Clássica são apresentações da mesma aplicação; não existem Store, backend ou persistência paralelos.

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
4. **P3 — Iconography & Visual Language Polish**: próximo ciclo visual, em missão própria e sem mudança funcional.
5. **P4 — Global Visual Polish**: somente depois da consolidação da iconografia.
6. **P5 — Managed Judicial Connectivity**: estudo posterior, read-only por padrão e sempre supervisionado, sem ciência, assinatura ou protocolo automático.
7. **P6 — Empacotamento**: depois de teste humano e validação de atualização/recuperação no Windows alvo.

## Critério da baseline técnica atual

- Suíte canônica integral, paridade final, acessibilidade global, reflow e higiene de runtime aprovados.
- Lint/Test/E2E, job A1 Windows e Visual QA aprovados no mesmo HEAD, preferencialmente no attempt 1.
- Working tree limpo e branch `ui-v2` sincronizada com o remoto.
- Status: **UI V2 MIGRATION COMPLETE**. Isso não equivale a release final, certificação jurídica ou produção final.

## Próxima sequência planejada

Iconography & Visual Language Polish; depois Global Visual Polish; somente então Managed Judicial Connectivity. A conectividade judicial gerenciada não foi implementada neste gate e, se autorizada futuramente, deverá permanecer read-only por padrão e exigir intervenção humana para qualquer ato oficial.
