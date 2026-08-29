# ATRIUM — Registro de decisões arquiteturais

## 2026-08-29 — Frontend modular concluído

- **Decisão**: considerar encerrado o ciclo de modularização frontend. `js/portal.js` permanece como composition shell, e features/componentes vivem nos módulos já extraídos.
- **Consequência**: não haverá Fase 20 de modularização. Mudanças seguintes devem preservar o Store único, o backend e os contratos atuais.

## 2026-08-29 — UI V2 futura em modo dual

- **Decisão**: a futura UI V2 usará o mesmo Store/backend e será o modo visual padrão, mantendo a UI Clássica selecionável ao lado do tema Claro/Escuro.
- **Consequência**: rollback visual instantâneo sem duplicação de dados ou regras. Nenhum código da UI V2 pertence ao Gate Beta atual.

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
