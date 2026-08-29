# ATRIUM — Guardrails para agentes de programação

Este arquivo define regras permanentes para qualquer agente que trabalhe neste repositório.
Ele é um conjunto de guardrails de desenvolvimento, não documentação completa do produto.
Em caso de conflito entre uma tarefa e estas regras, pare e peça orientação explícita.

## 1. Produto e identidade

- O nome atual do produto é **ATRIUM**.
- Não introduza novo branding com `Atrium Senda`, `JurisFlow` ou `KellerCentral`.
- Referências legadas existentes podem ser aliases ou contratos de compatibilidade.
- Não remova branding ou aliases legados sem auditar consumidores em HTML, JavaScript e testes.
- Não faça substituição global de nomes por conveniência.
- Use nomenclatura própria e neutra do ATRIUM. Não introduza nomes, marcas, terminologia proprietária, classes, funções, fixtures ou textos com referências desnecessárias a softwares jurídicos concorrentes.
- Integrações oficiais e tecnologias externas podem ser nomeadas quando tecnicamente necessário.
- Identificadores concorrenciais legados só podem permanecer em uma camada mínima de compatibilidade, nunca na UI ou em novo estado persistido.
- Não reescreva o histórico Git para remover referências antigas.

## 2. Git, branches e checkpoints

- A branch normal de desenvolvimento é `beta-hardening`.
- Nunca altere `main` sem instrução explícita.
- Nunca faça merge automático para `main`.
- Nunca mova a branch `checkpoint-pre-modularization`.
- Nunca mova a tag `pre-modularization-beta-1`.
- Esses checkpoints são referências imutáveis de recuperação.
- Nunca faça force push por iniciativa própria.
- Prefira operações Git não destrutivas e preserve trabalho local não identificado.

## 3. Baseline verde

Antes de iniciar feature, refactor ou mudança relevante, confirme:

- working tree limpo;
- branch correta;
- HEAD local sincronizado com `origin/beta-hardening`;
- CI completo do commit anterior em estado verde.

Se o CI estiver vermelho, pare e diagnostique antes de iniciar trabalho dependente.
Não acumule refactors sobre um commit vermelho.
Um job isolado verde não equivale ao workflow completo verde.

## 4. Um objetivo por commit

- Cada commit deve ter uma responsabilidade clara.
- Não misture refactor, bugfix, feature, redesign ou limpeza de branding.
- Só combine categorias quando forem tecnicamente inseparáveis e isso estiver justificado.
- Mantenha a aplicação executável entre ciclos incrementais.
- Não esconda mudanças funcionais dentro de commits descritos como refactor.

## 5. Tecnologia e simplicidade

O frontend atual usa Vanilla JavaScript, HTML, CSS e APIs nativas do navegador.

Não introduza sem autorização:

- React, Vue, Angular, Svelte ou Next;
- Vite, Webpack, Rollup, framework SPA ou bundler obrigatório;
- microserviço, fila, banco externo ou framework pesado sem necessidade comprovada.

Evite overengineering.
O sistema deve continuar simples de instalar, operar, depurar e recuperar.

## 6. Direção da modularização frontend

A direção arquitetural aproximada é:

```text
js/
  app/
  core/
  components/
  views/
  features/
```

Essa estrutura é orientação, não obrigação de criar arquivos vazios.
Não fragmente o código artificialmente apenas para reduzir contagem de linhas.
Separe módulos por responsabilidade real, coesão e dependências claras.

## 7. Hotspots do frontend

- `js/portal.js` é um hotspot atual.
- À medida que módulos existirem, não adicione grandes blocos novos a `portal.js`.
- `portal.js` deve evoluir para bootstrap, orquestração e compatibilidade temporária.
- `css/portal.css` é um hotspot atual e será modularizado incrementalmente.
- Refactor de CSS não deve alterar a aparência incidentalmente.
- Preserve ordem de cascade, especificidade e temas light/dark.
- Não despeje megablocos de overrides no fim de `portal.css` quando houver módulo apropriado.
- `index.html` deve evoluir para shell da aplicação.
- Não reintroduza grandes templates de feature no HTML depois que a feature for modularizada.
- Não antecipe extrações de template antes de existir um módulo responsável.

## 8. Core e dependências

- Separe código compartilhado por responsabilidade: store, API, datas e utilidades específicas.
- Não transforme `utils` em depósito genérico de funções sem domínio.
- Mantenha funções próximas do domínio quando não forem verdadeiramente compartilhadas.
- Prefira dependências explícitas.
- Evite novos globals em `window`, singletons desnecessários e imports circulares.
- Evite ciclos como `Store → App → Store`.
- Não crie `window.AlgumaCoisa` sem necessidade comprovada.

## 9. Compatibilidade legada

Podem existir consumidores de `window.Atrium`, `window.AtriumSenda`, `window.JurisFlow`,
`window.KellerCentral` e `window.portalApp`.

Antes de remover qualquer global, pesquise consumidores com `git grep` ou `rg` em HTML,
JavaScript e testes.

Durante a migração, mantenha wrappers finos e documentados quando necessários.
Não use compatibilidade temporária como justificativa para criar novos globals.

## 10. Store, persistência e proteção de dados

O Store e o estado do backend são críticos.
Preserve `revision`, `expectedRevision`, atomic save, state migrations, recovery,
backups pré-migração, criptografia, coalescing e serialização de writes.

Não crie um segundo Store ou sistema de estado paralelo.
Não esconda resposta `409`, falha de persistência ou lost update.
O frontend não deve fingir sucesso quando o backend falhou.
Mudanças no formato de armazenamento exigem backup, validação e teste de restauração.
Nenhuma migration pode ser destrutiva sem mecanismo explícito de proteção.

## 11. Backend como source of truth

Para dados sensíveis ou canônicos, o backend é a autoridade.
Isso inclui authenticated actor, role, permissões, conteúdo de publicação usado em e-mail,
revision e dados internos de usuários.

Não confie em valor do frontend quando o servidor puder determiná-lo autoritativamente.

## 12. Backend e rotas

- `server.mjs` é um hotspot atual.
- Depois que existir infraestrutura de rotas, não adicione grandes endpoints diretamente nele.
- A direção futura aproximada é `lib/http/` e `routes/`.
- `server.mjs` deve evoluir para bootstrap, serviços e registro de rotas.
- Não introduza framework HTTP pesado sem necessidade e autorização.
- Não mova endpoints apenas para aumentar quantidade de módulos.

## 13. Segurança e privacidade

Nunca enfraqueça para fazer testes passarem CSRF, MFA/TOTP RFC 6238, sessões,
cookies seguros/HttpOnly, RBAC, AES-256-GCM, rate limits ou proteção de arquivos privados.

Nunca commite ou registre em log `.env`, senhas, API keys, TOTP secrets, recovery codes,
private keys, PFX, cookies, tokens, dados pessoais ou dados reais de clientes.

## 14. Dados e fixtures de teste

- Fixtures devem ser claramente sintéticas.
- Não use CPF, OAB, processo, cliente, e-mail pessoal ou telefone reais.
- Prefira `Advogada Teste`, `Cliente Teste`, `teste@example.test` e `OAB/RS 000000`.
- Nunca use certificado real em teste.
- Não copie dados de produção para reproduzir falhas localmente.

## 15. Publicações e ciência judicial

Preserve a distinção entre read/unread, `treatmentStatus` e ciência judicial oficial.

Os estados atuais de tratamento são `untreated`, `in_review`, `treated` e `discarded`.

Publicação tratada no ATRIUM não significa ciência judicial.
Não automatize ciência nem use texto de interface que confunda esses conceitos.
O backend deve ser a autoridade das transições de tratamento.

O discovery judicial canônico deve encadear DJEN → número CNJ → DataJud → processo e
contatos para todos os termos monitorados. Preserve campos manuais melhores, deduplique
por identidades estáveis e mantenha todas as associações quando mais de um advogado for
localizado. Discovery é somente leitura: nunca abra prazo, envie e-mail ou pratique ato
processual automaticamente.

## 16. Prazos jurídicos

- Nunca infira deadline jurídico automaticamente por regex ou texto da publicação.
- Não reintroduza regras como `Recurso = 15 dias`, `Embargos = 5 dias` ou `Prazo Geral = 15 dias`.
- Tarefa criada de publicação deve começar sem deadline.
- Só preencha deadline quando houver data explicitamente confirmada pelo usuário.
- Não apresente estimativa como prazo fatal ou cálculo jurídico definitivo.

## 17. E-mail

- O `EmailService` é o único transporte SMTP autorizado para e-mails de Publicações. Não crie caminho SMTP paralelo.
- O endpoint removido `/api/email/publications` não deve ser reintroduzido.
- O frontend nunca deve fornecer conteúdo judicial como source of truth para envio.
- O envio individual usa a arquitetura canônica baseada em ID: `POST /api/intimations/email`, com o alias `POST /api/publications/email`.
- Antes do envio individual, o backend resolve a publicação canônica persistida.
- O envio em lote usa `POST /api/publications/email/batch` e recebe somente os identificadores das publicações e o destinatário, nunca objetos judiciais completos como autoridade.
- No envio em lote, o backend também resolve as publicações canônicas persistidas.
- Todo envio de publicação por e-mail exige autenticação, perfil `admin` ou `master_admin` e proteção CSRF.
- O envio é exclusivamente manual. Nunca crie auto-send, cron de e-mail nem envio automático após importação, tratamento ou sincronização.
- Não reintroduza `SMTP_HOST`, `SMTP_USER` ou `SMTP_PASS` como segundo transporte específico para Publicações, fallback Gmail ou fallback `mailto` contendo conteúdo judicial.
- Nunca defina endereço pessoal hardcoded como destinatário default ou fallback.

## 18. Segurança de arquivos estáticos

- Não transforme o servidor em static hosting irrestrito.
- Autorize explicitamente novos diretórios frontend.
- Preserve validação contra path traversal.
- Bloqueie acesso a `..`, `data/`, `.env`, `.git/`, `lib/`, `tests/` e arquivos sensíveis.
- Inclua testes de segurança quando a allowlist ou o resolvedor de paths mudar.

## 19. Testes e CI

Antes de alterar um domínio, identifique a cobertura existente.
Depois, execute conforme aplicável: teste específico, `pnpm check`, `pnpm test`,
Visual QA e GitHub Actions completo.

Não remova assertions para obter verde.
Não aumente timeout como primeira solução para race condition.
Prefira sincronização com eventos reais: resposta HTTP, estado do DOM e estado persistido.
Não trate syntax check como prova de comportamento correto.

## 20. Visual QA

- Screenshot gerado não é prova suficiente.
- Valide a view ativa, overlays inesperados e layout.
- Detecte screenshots duplicados quando views deveriam ser diferentes.
- Teste onboarding separadamente das views normais.
- Preserve temas light e dark e os viewports cobertos.

## 21. Integração judicial A1

- O fluxo A1 completo é verificado no job Windows.
- Não finja full A1 no Linux.
- Linux deve validar apenas partes realmente cross-platform.
- Nunca use certificado, senha, CPF ou chave real em testes A1.
- Não enfraqueça o job Windows para simplificar refactor.

## 22. Regras de refactor

Refactor deve preservar comportamento, schema, API e visual, salvo autorização expressa.

Se encontrar bug fora do escopo, documente-o no relatório.
Não corrija silenciosamente.
Não substitua um monólito por microarquivos sem responsabilidade real.
Também não crie um novo monólito dentro de um único módulo.
Divida por responsabilidade, não apenas por quantidade de linhas.

## 23. Fluxo obrigatório de trabalho

O fluxo normal é:

```text
alteração
→ testes locais
→ commit
→ push em beta-hardening
→ GitHub Actions completo
→ próxima fase
```

Não inicie a próxima fase antes do workflow anterior terminar com sucesso.

## 24. Documentação e contexto

Quando relevantes para a missão, consulte:

- `DEVELOPMENT_MASTER_PLAN.md`;
- `docs/development/ROADMAP.md`;
- `docs/development/DECISIONS.md`;
- `docs/development/BETA_READINESS.md`.

Atualize documentação apenas quando estiver no escopo autorizado.
Não transforme este arquivo em documentação extensa do produto.

## 25. Relatório de missão

Ao final de missão relevante, informe HEAD anterior e novo, arquivos alterados,
mudança funcional, testes, estado do CI, riscos e dívida técnica observada.

## 26. Parada obrigatória

Pare e informe antes de continuar quando houver working tree inesperadamente sujo,
CI vermelho, premissa incorreta, risco de perda de dados, migration conflitante,
necessidade de mudança fora do escopo ou dúvida sobre material sensível.

Não contorne uma condição de parada com reset, remoção de teste ou mudança incidental.
