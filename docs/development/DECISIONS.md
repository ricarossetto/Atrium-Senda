# ATRIUM — Registro de decisões arquiteturais

## 2026-09-01 — Baseline de maturidade consolidado sem novo Gate

- **Decisão**: encerrar a sequência 26D–26G com specs alinhadas ao comportamento executável e separar explicitamente CURRENT, EXPERIMENTAL e FUTURE.
- **Segurança**: nenhuma licença, visibilidade, API pública, integração DAV de produção ou persistência canônica adicional é inferida pelo baseline.
- **Próximo passo real**: revisão humana do produto e, somente depois, decisões comerciais ou novos subgates autorizados.

## 2026-09-01 — API interna evolui sem versionamento em massa

- **Decisão**: preservar as rotas internas atuais e adicionar apenas metadata autenticada, headers de contrato e rejeição segura de prefixos desconhecidos.
- **Política**: mudança incompatível e consumidor externo real são gatilhos para um router versionado separado; data ou estética não são.
- **Limite**: nenhuma API pública, SDK ou cliente mobile/desktop foi declarado operacional.

## 2026-09-01 — DAV como foundation experimental, sem sync automático

- **Decisão**: entregar primitives explícitas e cofre cifrado para WebDAV, CalDAV e CardDAV, sem implementar stacks completas ou reconciliação automática.
- **Status verdadeiro**: endpoint que respondeu ao probe continua `Experimental / Unverified`; não significa compatibilidade nem conexão de produção.
- **Limite**: Agenda, Contatos, Documentos e Store não são mutados. Promoção futura exige subgate por protocolo, servidor real e política de conflitos supervisionada.

## 2026-09-01 — Storage documental por provider canônico

- **Decisão**: separar a autoridade física de blobs do serviço de regras documentais por contrato mínimo `put/get/exists/delete/metadata/health`.
- **Provider CURRENT**: adapter local privado, cifrado em AES-256-GCM, endereçado por SHA-256 e publicado por temp+rename; `DocumentBlobStore` permanece apenas como compatibilidade.
- **Limite**: nenhum adapter remoto foi declarado operacional. S3, R2, NAS, WebDAV e backup portátil de blobs exigem subgate e evidência próprios.

## 2026-09-01 — Especificações canônicas antes da maturidade documental

- **Decisão**: criar `specs/` como índice curto de contratos de produto, sempre ligado à autoridade executável e aos testes relevantes.
- **Regra agentiva**: mudanças arquiteturais, de negócio, persistência, segurança ou integração exigem leitura prévia das specs afetadas; itens `FUTURE` não podem ser apresentados como capacidade atual.
- **Limite atual de Documentos**: catálogo, gerador, preview, copy e Markdown são CURRENT; storage, upload, lixeira, owner e naming engine permanecem FUTURE até subgate próprio.

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
