# ATRIUM — PLANO-MESTRE DE DESENVOLVIMENTO AUTÔNOMO
## MODO BETA HARDENING

O objetivo desta execução é transformar a versão atual do ATRIUM — Escritório Integrado em uma versão **BETA READY**, adequada para testes reais por um pequeno grupo de advogados não técnicos.

==================================================
REGRA ZERO — PROTEGER A VERSÃO ESTÁVEL
==================================================

A branch `main` representa a versão estável de referência. ELA NÃO PODE SER USADA PARA DESENVOLVIMENTO AUTÔNOMO.

1. Confirmar que o working tree está limpo;
2. Confirmar que estamos partindo do `main` atualizado;
3. Criar e preservar a tag de segurança: `stable-pre-beta`;
4. Criar ou utilizar exclusivamente a branch: `beta-hardening`.

Todo desenvolvimento deve ocorrer em `beta-hardening`.
- Nunca desenvolver diretamente em `main`.
- Nunca fazer merge automático para `main`.
- Nunca executar comandos destrutivos de git (`push --force`, `reset --hard`, reescrita de histórico) sem autorização humana explícita.

==================================================
PONTO DE RESTAURAÇÃO
==================================================

A tag `stable-pre-beta` é a fotografia oficial da versão estável anterior ao programa Beta. Ela não deve ser movida, recriada ou apagada.

==================================================
CHECKPOINTS DE DESENVOLVIMENTO
==================================================

Após concluir fases importantes e confirmar que todos os testes estão verdes, criar checkpoints Git (ex: `beta-phase-a-complete`, `beta-sqlite-working`, `beta-backup-working`, `beta-installer-working`, `beta-rc1`).

Critérios obrigatórios para checkpoint:
- Aplicação inicia;
- `pnpm test` (9/9 suítes) passa 100%;
- Não existe regressão crítica conhecida.

==================================================
NÃO CRIAR OUTRO ATRIUM
==================================================

Não iniciar reescrita paralela (ex: Atrium-v2, Atrium-next). Preservar a continuidade do produto atual. Decisões arquiteturais futuras devem ser registradas em `docs/development/DECISIONS.md`.

==================================================
MODELO DE EXECUÇÃO EM CICLOS FINITOS
==================================================

AUDITAR → IDENTIFICAR O MAIOR GARGALO → PLANEJAR UMA ALTERAÇÃO COERENTE → IMPLEMENTAR → TESTAR → CORRIGIR → REVISAR DIFF → DOCUMENTAR → COMMITAR → REAVALIAR BETA_READINESS → ESCOLHER PRÓXIMO GARGALO.

==================================================
UMA COISA POR VEZ & ANTI-OVERENGINEERING
==================================================

Cada ciclo possui um objetivo claro e autocontido. Não introduzir dependências ou serviços pesados desnecessários sem ganho concreto para o usuário final (advogado).

==================================================
ORDEM DE PRIORIDADE
==================================================

- **P0 — Integridade**: Perda de dados, corrupção, vulnerabilidades, falhas de autenticação, app não inicia, backup não restaura.
- **P1 — Confiabilidade**: Bugs funcionais, importação, migrations, instalação, sincronização, crashes.
- **P2 — Beta Usability**: Diagnóstico do sistema, onboarding, busca, tratamento de erros, facilidade de uso, feedback.
- **P3 — Melhoria Funcional**: Timeline, IA contextual, novos modelos/workflows.
- **P4 — Cosmética**: Microefeitos e ajustes visuais sem impacto funcional.

==================================================
BANCO & MIGRATIONS (SQLITE LOCAL)
==================================================

SQLite é o armazenamento estruturado padrão para o ambiente desktop/local. Toda migração de dados deve incluir schema, migration forward, verificação, backup prévio e teste de restauração.

==================================================
DIAGNÓSTICO & BETA FEEDBACK
==================================================

- **Diagnóstico de Primeira Classe**: Aba em Configurações com status de banco, criptografia, Node, Windows/PJeOffice, A1, DJEN, DataJud, IA, coletor e backups, com opção "Exportar diagnóstico" anonimizado.
- **Beta Feedback**: Fluxo nativo (Bug, Dificuldade, Sugestão, Performance) sem envio de dados pessoais ou processos.

==================================================
TRANSIÇÃO DE MODOS: BUILD MODE → AUDIT MODE
==================================================

- **BUILD MODE**: Ativo enquanto houver pendências em `BETA_READINESS.md`.
- **AUDIT MODE**: Ativo após todos os itens de readiness estarem concluídos. Realiza auditoria rigorosa de segurança, instalação, restore e cria o candidato `beta-rc1`.
