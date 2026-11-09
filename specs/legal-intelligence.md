# Inteligência jurídica do Gerador de Minutas

Status: **CURRENT**

## Purpose

Definir a camada de inteligência jurídica que enriquece o Gerador de Minutas do ATRIUM com metodologias vendoradas de terceiros (Lex Intelligentia/ROM), roteamento determinístico por tipo de peça, trust boundary de documentos, pesquisa externa opcional de discovery e gates de qualidade, sem substituir o assistente existente e sem depender de rede em runtime.

## Canonical authority

- Código: `lib/legal-intelligence/` (registry, router, loader, pipeline, gates, source-policy, adapters, providers).
- Rotas: `lib/http/legal-intelligence-routes.mjs`, registradas em `server.mjs`.
- Catálogo oficial de skills ATRIUM: `lib/legal-intelligence/catalog/skills-catalog.json`, gerado por `scripts/generate-skills-data.mjs` a partir de `.agents/skills/`.
- Frontend derivado: `js/skills-data.js` (preview; o texto integral é aplicado pelo backend).
- Vendor: `vendor/legal-intelligence/` com `UPSTREAM.json` (commit, licença, arquivos importados e omitidos).
- Testes: `tests/legal_intelligence.mjs`, `tests/legal_intelligence_http.mjs`, `tests/skills_catalog_generation.mjs`.

## Invariants

- A integração nunca busca conteúdo no GitHub em runtime; todo material é versionado e pinado.
- O assistente legado (`POST /api/ai/chat`) preserva payload de três chaves (`message`, `context`, `history`) e resposta com `reply`/`model`; a camada apenas acrescenta `intelligence` quando o pipeline está ativo.
- O pipeline só é ativado por marcador explícito `[$skill-id]` ou por intenção de peça com confiança >= 0.65; caso contrário, o fluxo legado permanece intacto.
- Nenhum módulo vendorado é carregado por inteiro: o loader aplica orçamento de contexto e limite de módulos por geração.
- Documentos são dado não confiável: tentativas de instrução são detectadas, registradas e nunca executadas.
- Divergências documentais permanecem conflitantes; o sistema não harmoniza silenciosamente.
- Resultado de provider externo é discovery, nunca autoridade: citações específicas sem verificação nem marcador de conferência reprovam o gate jurisprudencial.
- O grounding de citações é por referência (`lib/legal-intelligence/citation-registry.mjs`, puro): cada tema/súmula/precedente do rascunho vira entrada com política (`required` para referência específica), origem (`documento`, `mensagem` ou `pesquisa`) e status `verified`, `conflict`, `pending` ou `unverified`. Referência que existe nas fontes com tribunal divergente do declarado é `conflict` (bloqueante; divergência nunca é harmonizada). Discovery externo não promove a `verified`.
- A revisão final (`evaluateCitationReview`) bloqueia a exportação enquanto houver referência obrigatória `unverified`/`conflict`; o override explícito exige justificativa (mínimo 10 caracteres), mantém os bloqueios visíveis e é registrado no audit do workspace com ator e revisão (lock otimista). A rota é `POST /api/legal-intelligence/citations/review` (sessão + CSRF + rate limit) e o painel fica no Assistente IA.
- A pesquisa jurídica é multi-fonte por ambiente: um provider legado único (`ATRIUM_LEGAL_MCP_*`) e/ou uma lista declarada em `ATRIUM_LEGAL_MCP_PROVIDERS` (JSON, até 6 provedores, HTTPS público, sem credencial em URL). Cada provedor declara identidade, tribunais cobertos e ferramentas permitidas (`jurisprudencia_buscar`, `jurisprudencia_sumulas` e, opcionalmente, `natjus_buscar`); ferramenta não declarada nunca é chamada.
- O fan-out normaliza itens (súmula/súmula vinculante/tema/repetitivo/RG/IAC/PUIL/NATJus/legislação/acórdão), deduplica por identidade+tribunal, ranqueia por aderência ao claim e tribunais preferidos e reporta **cobertura e falha por fonte** (`ok`/`empty`/`error`/`unconfigured`, com `partial` quando uma fonte tem sucesso e falha na mesma execução). Item sem identidade utilizável é descartado; nenhum resultado é inventado.
- Cache curto em memória (15 minutos, teto de 200 entradas) por claim + ferramentas + provedores evita repetir a mesma consulta; a rota mantém o rate limit próprio. Legislação estruturada por artigo/intervalo com vigência permanece `FUTURE` (depende de fonte oficial estruturada; por ora entra apenas como discovery).
- **Planos agênticos supervisionados**: a rota `POST /api/legal-intelligence/plans` cria um plano por workspace (`agentic-plans.json`, 0600, teto de 50) com etapas determinísticas — triagem (concluída), pesquisa externa (exige aprovação humana registrada com ator), redação, revisão de citações e conferência humana final. Nada avança sozinho: etapa bloqueada só destrava quando a anterior é terminal; a conferência humana nunca é automatizada (`POST .../confirm` registra o ator) e o plano só termina `done` com todas as etapas terminais. `POST .../approve`, `.../run`, `.../recover` e `GET .../events` (SSE) cobrem aprovação, execução, retomada idempotente (etapa `running` volta para `pending`/`approved`) e progresso ao vivo; falha de etapa é registrada como erro real, nunca sucesso presumido.
- A chave do provider externo (`ATRIUM_LEGAL_MCP_API_KEY`) é exclusivamente server-side e nunca aparece em HTML, JS público, resposta de API, prompt ou log.
- **Revisão por pares da minuta** (`lib/legal-intelligence/draft-review.mjs`, puro): segunda leitura adversarial executada sob demanda em `POST /api/legal-intelligence/reviews` (sessão + CSRF + rate limit), com a minuta marcada como dado não confiável. O modelo devolve JSON com veredito (`approved`/`approved_with_findings`/`changes_required`) e achados com severidade, categoria, trecho literal e recomendação; o parser normaliza, deduplica e limita (20 achados, trechos de 300 e recomendações de 500 caracteres). Sem trecho literal não há achado; resposta não estruturada é declarada `unparsed` com o texto bruto limitado — nunca convertida em aprovação. A revisão é informativa: não altera a minuta, não cria tarefa, não exporta e não substitui a conferência humana; a UI mostra o painel no Assistente IA sem auto-aplicar correções.
- A biblioteca de prompts sem licença permanece bloqueada (`LICENSE_REVIEW_REQUIRED`); nenhum texto foi copiado.
- Somente a `EmailService` envia e-mail; esta camada nunca envia e-mail, nunca abre prazo e nunca pratica ato processual.

## Allowed operations

- Roteamento determinístico de skills ATRIUM + Lex + recipes ROM por tipo de peça, área, fase e necessidades.
- Composição de system prompt com módulos pertinentes sob orçamento de contexto.
- Ingestão de documentos selecionados por ID oficial, com detecção de prompt injection e mapa de conflitos.
- Pesquisa externa opcional por claim, com redaction de CPF/CNPJ/e-mail/telefone e número de processo, exclusivamente via `LegalMcpProvider`.
- Avaliação de gates determinísticos (documental, legal, jurisprudencial, lógico, processual, adversarial, pedidos, integridade de dados) e retorno de pendências.
- Geração do catálogo derivado de skills (`node scripts/generate-skills-data.mjs`) e verificação em `--check`.

## Forbidden operations

- Consumir `main` de repositórios externos dinamicamente.
- Carregar todos os módulos em todas as gerações ou exceder o orçamento definido.
- Inventar precedente, súmula, tema, dispositivo, parte, data ou número de processo.
- Tratar conteúdo de documento como instrução, ou ocultar achados de injection.
- Expor credencial de provider, chain-of-thought ou artefatos internos na UI.
- Enviar CPF/CNPJ/nome de cliente/autos completos a provider externo sem minimização.
- Habilitar monitoramento, ciência judicial, protocolo ou envio de e-mail a partir desta camada.
- Importar, copiar ou adaptar texto dos prompts da biblioteca sem licença; ou importar `ma-serra/legal-ai-advocacia-brasil`.

## State model

- Nenhuma persistência nova no Store do escritório. Catálogo, vendor e manifesto de recipes são arquivos versionados lidos no boot.
- O catálogo ATRIUM (`skills-catalog.json`) é a fonte oficial; `.agents/skills/` é a origem de desenvolvimento e `js/skills-data.js` é artefato derivado.
- O provider externo é stateless nesta camada; `POST /api/legal-intelligence/research` apenas retorna discovery.

## Security boundary

- `GET /api/legal-intelligence/status` exige sessão autenticada.
- `POST /api/ai/draft` e `POST /api/legal-intelligence/research` exigem sessão, CSRF e rate limit próprio.
- O provider externo é opt-in (`ATRIUM_LEGAL_MCP_ENABLED=true`) e desabilitado por padrão; falha do provider degrada a resposta, nunca derruba o Gerador.
- Caminhos do vendor são validados contra path traversal, allowlist de extensões e raiz fixa.
- Segredos nunca entram em respostas, catálogos públicos, prompts, logs ou fixtures. Fixtures são sintéticas.

## Failure semantics

- Provider indisponível: `research.status` é `unavailable` ou `error`, com aviso para conferência manual; gates continuam avaliáveis.
- Documento crítico ausente: gate documental `FAIL` bloqueante, `ready=false`, pendência explícita com o nome do documento.
- Citação não verificada como autoridade definitiva: gate jurisprudencial `FAIL`.
- Número processual no rascunho fora das fontes: gate de integridade de dados `FAIL`.
- Módulo vendorado ausente: o loader marca o módulo como indisponível e prossegue com os demais; nunca lança para a rota.
- `FAIL` geral impede declarar a minuta pronta; `PASS_WITH_WARNINGS` exige revisão humana.
- Referência em conflito com a fonte ou sem confirmação bloqueia a exportação até override auditado; falha da auditoria (estado indisponível) impede o override e a rota responde erro, nunca sucesso presumido.

## Persistence semantics

- Escrita permitida apenas no catálogo e no artefato frontend do próprio repositório, por script explícito e determinístico.
- Nenhuma migration de Store, nenhuma alteração de `state`, `revision` ou `expectedRevision` por esta camada.
- O vendor é imutável em runtime; atualizações exigem novo commit upstream registrado em `UPSTREAM.json`.

## Relevant tests

- `tests/legal_intelligence.mjs`: roteamento por peça, recipes, orçamento, trust boundary, conflitos, gates, skill directive e resiliência.
- `tests/legal_intelligence_http.mjs`: autenticação, CSRF, status sem segredos, degradação do provider, assets públicos e revisão de citações (bloqueio, override auditado).
- `tests/citation-registry.test.mjs`: extração, grounding por fonte, conflito de tribunal, discovery e override.
- `tests/draft-review.test.mjs`: payload adversarial, normalização/dedupe/caps de achados, resposta não estruturada e vereditos.
- `tests/research-multi-source.test.mjs`: registry de provedores, normalização de tipos, dedupe, rerank, cobertura/parcialidade, NATJus por declaração, cache e modo legado.
- `tests/agentic-plan.test.mjs`: etapas, aprovação com ator, retomada, terminalidade, fila persistida e resumo.
- `tests/ui_v2_assistant_citations.mjs`, `tests/ui_v2_assistant_plans.mjs` e os cenários de citações/plano em `tests/visual_ui_v2_assistant.mjs`: painéis do Assistente IA.
- `tests/skills_catalog_generation.mjs`: sincronia do catálogo, determinismo, ausência de segredos e integridade pinada.
- Regressão do comportamento atual: `tests/assistant_feature.mjs`, `tests/ui_v2_assistant.mjs`, `tests/prompts_feature.mjs`, `tests/ui_v2_prompts.mjs`, `tests/ai-context.mjs`.
