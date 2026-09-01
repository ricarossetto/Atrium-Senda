# ATRIUM — Registro de decisões arquiteturais

## 2026-09-01 — Conectividade judicial gerenciada e estritamente read-only

- **Decisão**: reutilizar cofre, adapters, sessões persistentes e coletor existentes sob uma autoridade de cobertura por usuário, identidade e portal, com estratégia explícita, estado persistido, cadência conservadora e backoff.
- **Limite**: A1 armazenado, PJeOffice disponível, Windows Store e sessão autenticada são estados distintos. Portal autenticado sem evidência live permanece experimental ou não verificado.
- **Supervisão**: CAPTCHA, segundo fator interativo ou sessão expirada pausam retries e exigem reconexão humana. Ciência, assinatura, petição, protocolo, acknowledgment e confirmação automática de prazo são proibidos.
- **Matching**: CNJ e referências estáveis podem deduplicar; sinais de partes/tribunal produzem somente sugestão explicável.

## 2026-09-01 — UI V2 iconography e global polish concluídos

- **Decisão**: consolidar sprite local próprio e refinamento Mineral Editorial transversal sem novo framework, dependência ou runtime.
- **Checkpoints**: `ui-v2-iconography` e `ui-v2-global-polish` permanecem referências imutáveis; Classic, um App e um Store foram preservados.

## 2026-08-31 — Migração UI V2 concluída em modo dual

- **Decisão**: considerar concluída a migração das 17 views canônicas para a UI V2 na branch `ui-v2`. A V2 é o modo padrão e a UI Clássica permanece fallback visual selecionável.
- **Consequência**: os dois modos continuam sobre o mesmo App, Store, backend, schemas e regras de negócio. A conclusão técnica não promove `main`, não publica release, não certifica produção e não autoriza remover a Classic.
- **Sequência futura**: Iconography & Visual Language Polish, depois Global Visual Polish e, somente então, estudo de Managed Judicial Connectivity read-only e supervisionada.

## 2026-08-29 — Frontend modular concluído

- **Decisão**: considerar encerrado o ciclo de modularização frontend. `js/portal.js` permanece como composition shell, e features/componentes vivem nos módulos já extraídos.
- **Consequência**: não haverá Fase 20 de modularização. Mudanças seguintes devem preservar o Store único, o backend e os contratos atuais.

## 2026-08-29 — Planejamento histórico da UI V2 em modo dual

- **Decisão histórica**: planejar a UI V2 sobre o mesmo Store/backend, como modo visual padrão, mantendo a UI Clássica selecionável ao lado do tema Claro/Escuro.
- **Situação posterior**: decisão executada e encerrada pelo gate de conclusão de 2026-08-31, sem duplicação de dados ou regras.

## 2026-08-29 — Neutralidade de marca

- **Decisão**: UI, documentação, estado novo e fixtures usam nomenclatura própria e neutra do ATRIUM. Identificadores históricos só permanecem na camada mínima de compatibilidade auditada.
- **Consequência**: não são feitas substituições globais nem reescrita de histórico.

## 2026-08-29 — E-mail manual e backend canônico

- **Decisão**: SMTP é o transporte configurável único; teste, publicação individual e boletim em lote exigem ação manual. O backend resolve a publicação canônica pelo ID.
- **Consequência**: importação, sincronização e tratamento não disparam e-mail.

## 2026-08-29 — Deadlines confirmados por pessoa responsável

- **Decisão**: tarefa criada de publicação começa sem deadline. Estimativas de IA são preliminares; prazo fatal exige conferência e confirmação humana.
- **Consequência**: regex, catálogo ou texto de publicação não definem automaticamente a data jurídica.

## 2026-08-29 — Armazenamento Beta continua em JSON cifrado

- **Decisão**: o estado Beta permanece em JSON AES-256-GCM com revision, atomic save, migrations, recovery e backup. Runtime derivado corrompido é quarentenado e preservado, sem bloquear o app-state.
- **Consequência**: SQLite é hipótese futura e só poderá substituir este formato por migração deliberada e testada.

## 2026-08-29 — Feedback Beta local

- **Decisão**: feedback é registrado localmente, cifrado e minimizado. Não há serviço de transmissão embutido.
- **Consequência**: compartilhamento com suporte depende de ação explícita do usuário por canal autorizado.

## 2026-08-25 — Suporte local e cloud mode

- **Decisão**: manter separação entre operações locais Windows/A1 e capacidades compatíveis com cloud mode, com bootstrap protegido e falha explícita para operação indisponível.
- **Consequência**: o diagnóstico descreve configuração e última execução, sem declarar conectividade que não foi consultada.
