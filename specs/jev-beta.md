# ATRIUM — Camada JEV beta (classificação assistiva experimental)

Status: **EXPERIMENTAL / NÃO VERIFICADA em produção** para conectividade real. O máximo comprovado hoje é `FIXTURE_VALIDATED`; qualquer resposta ao vivo é tratada como `UNVERIFIED` até campanha shadow com revisão humana.

## Purpose

Provar a tese de **classificação assistiva** — triagem de publicações, tarefas e sugestão de vínculo de contatos — sem substituir o Assistente generativo, sem montar rota/UI no produto e sem tocar no Store oficial.

Escopo desta camada:

- `lib/jev-beta/`: flags, redação, schemas, cliente de transporte, classificador e storage isolado.
- O CLI `scripts/jev-beta.mjs` e os testes (`tests/jev_beta.mjs`) com dados sintéticos.
- O Assistente (`specs/ai-assistant.md`), a inteligência jurídica (`specs/legal-intelligence.md`) e o Store oficial (`app-state.json`) permanecem autoridades e **não** são alterados por esta camada.

## Invariants

- **Precedência**: esta spec descreve a camada como biblioteca (`lib/jev-beta/`, CLI e fixture). A superfície montada no produto — rotas `/api/ai-classifier/*`, derivados por workspace e UI de conferência — é definida em `specs/ai-classifier.md`, que prevalece.
- **Transporte (ordem de preferência)**:
  1. **Modelo de decisão JEV** via provider configurado pelo servidor (`JEV_API_KEY` ou `CMD_API_KEY`), com o corpo tipado `{ model, state, questions }`;
  2. **Provedor de IA do escritório** (cofre `ai-secrets.json` ou `GEMINI_API_KEY`) respondendo as mesmas perguntas por prompt — declarado **modo degradado** (não é o modelo de decisão JEV);
  3. **CLI headless local** — apenas desenvolvimento.
- Nenhuma rota HTTP, template ou componente do beta é montado em `server.mjs` ou na UI **além do classificador descrito em `specs/ai-classifier.md`**; ativação continua somente por CLI/teste fora dessa superfície.
- Toda flag `BETA_JEV_*` é desativada por padrão; valor ausente, vazio ou não reconhecido resolve para desligado.
- `BETA_JEV_AUTOMATIONS` é `false` por padrão: lote/varredura exige opt-in explícito (`BETA_JEV_ENABLED=true` **e** `BETA_JEV_LIVE=true` **e** `BETA_JEV_AUTOMATIONS=true` no próprio executor).
- Todo módulo declara estado de verificação explícito — `LIVE_VERIFIED`, `LIVE_PARTIAL`, `FIXTURE_VALIDATED`, `HUMAN_REQUIRED`, `UNVERIFIED` ou `UNAVAILABLE`. Agregação sempre conservadora: fixture nunca é validação real.
- O beta nunca escreve no Store oficial, em `state.*`, no runtime ou em `data/system/`; `jev-beta-v1.json` é derivado, sem PII (só texto redigido + sugestões), aberto pelo chamador com diretório isolado. A camada nunca resolve workspace por conta própria.
- Todo dado carrega proveniência com `source`, `collectedAt`, `confidence` e `payloadHash`; divergência entre fontes é preservada como conflito, nunca mesclada em silêncio.
- **Prazos nunca são inferidos.** Nenhum schema do beta contém `deadline`/`fatalDeadline`; classificar prioridade/área **não** calcula vencimento (`specs/human-deadline-policy.md`).
- **Tratamento nunca é automático.** Sugestão é `suggest`/`review`/`abstain`; transições `untreated → in_review → treated|discarded` continuam no backend com ator autenticado e revision (`specs/publication-treatment.md`).
- **Vínculo de cliente nunca é automático.** Sugestão exige confirmação humana; sem correspondência exata a resposta é `nao_vincular`/`revisar`, nunca criação de vínculo.
- E-mail, ciência judicial, petição, protocolo, assinatura e confirmação de prazo são proibidos nesta camada.
- Redação antes de qualquer egresso: CPF/CNPJ/e-mail/telefone/número CNJ são mascarados; chave de API é efêmera do operador (`JEV_API_KEY`), nunca persistida, nunca em log/resposta/commit/fixture.
- Transporte nega por padrão: só HTTPS público; loopback/rede privada/link-local/metadata e credencial embutida na URL falham fechados. Redirecionamento cross-origin é bloqueado.
- Logs e registros nunca contêm token, cookie, segredo, PFX, TOTP, CPF/CNPJ completo ou documento integral. Fixtures são sintéticas.

## Verificação

`FIXTURE_VALIDATED` é o máximo declarado hoje. Qualidade de decisão ao vivo segue `UNVERIFIED` até campanha shadow com volume e revisão humana; fixtures de teste nunca representam validação operacional.
