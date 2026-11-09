# Judicial Intelligence Beta (paralela e isolada)

Status: **CURRENT** para os contratos internos, feature flags e armazenamento não autoritativo do beta; **EXPERIMENTAL / UNVERIFIED** para conectividade real com PDPJ, MNI, certidões e aquisição de autos.

## Purpose

Registrar os contratos da camada experimental `lib/judicial-intelligence/`, criada em worktree e branch dedicadas para provar teses de descoberta nacional (PDPJ), enriquecimento (DataJud/TPU), aquisição resiliente de autos, due diligence, auditoria de privacidade e Legal RAG verificável sem substituir ou acoplar o OMNI/PJe oficial.

## Canonical authority

`lib/judicial-intelligence/` no worktree `atrium-judicial-intelligence-beta` (branch `beta/judicial-intelligence`), o CLI `scripts/judicial-intelligence.mjs`, o armazenamento `ji-beta-v1.sqlite` (aberto pelo chamador com diretório isolado por workspace) e os testes `tests/ji_core.mjs`, `tests/ji_beta_storage.mjs`. O OMNI (`lib/judicial/omni/`), o `collector/` e o Store oficial (`app-state.json`) permanecem as autoridades executáveis de seus domínios e não são alterados por esta camada.

## Invariants

- Nenhuma rota HTTP, template ou componente do beta é montado em `server.mjs` ou na UI; ativação é somente por CLI/teste.
- Toda flag `BETA_*` é desativada por padrão; valor ausente, vazio ou não reconhecido resolve para desligado.
- `BETA_DISABLE_AUTOMATIONS` é `true` por padrão: subir o servidor não autoriza varredura, download massivo, lote de certidões, polling ou monitoramento; execução automatizada exige opt-in explícito.
- Todo módulo declara um estado de verificação explícito — `LIVE_VERIFIED`, `LIVE_PARTIAL`, `FIXTURE_VALIDATED`, `HUMAN_REQUIRED`, `UNVERIFIED` ou `UNAVAILABLE` — e a agregação é sempre conservadora: fixture nunca é apresentada como validação real.
- O beta nunca escreve no Store oficial, em `state.documents` ou no runtime; `ji-beta-v1.sqlite` é derivado, cifrado e aberto pelo chamador com um diretório isolado por workspace; a camada nunca resolve workspace por conta própria.
- Todo dado importado carrega proveniência com `source`, `collectedAt`, `confidence` e `payloadHash`; divergência entre fontes é preservada como conflito, nunca mesclada em silêncio.
- Incômodos de estado processual sempre expõem `derivedState`, `confidence` e `basis[]`; incerteza não é ocultada.
- Prazos nunca são inferidos de publicações ou movimentos.
- A classificação de movimentos usa a tabela oficial do CNJ (SGT) versionada em `lib/judicial-intelligence/process-intelligence/tpu-official.json` (nome, hierarquia e situação por código, com `tableVersion` e hash das fontes); a categoria é taxonomia do produto derivada do nome oficial, nunca um campo do CNJ. Código ausente cai no léxico com incerteza explícita (`TPU_CODE_UNKNOWN`).
- Processos com `nivelSigilo > 0` não entram no acervo, no digest nem na UI (guarda de contrato em `collector/adapters/datajud.mjs`); o índice público do DataJud não devolve sigilosos (verificado ao vivo em 20/09/2026: 0 de 14,4M no TJRS), mas a guarda permanece fail-closed.
- CAPTCHA, reCAPTCHA, hCaptcha e desafios anti-bot não são contornados; a resposta oficial é `human_required`.
- Logs e registros de operação nunca contêm token, cookie, segredo, PFX, TOTP, CPF/CNPJ completo ou documento integral.
- Licenças de referências externas são auditadas antes do uso; repositórios sem licença ou com GPL/AGPL são clean-room com especificação própria.

## Allowed operations

- Consultar fontes públicas ou autenticadas em modo somente leitura e normalizar o resultado para o formato oficial do beta.
- Comparar presença e conteúdo entre PDPJ, PJe, DataJud e MNI, classificando MATCH, SOURCE_A_NEWER, SOURCE_B_NEWER, MISSING e CONFLICT.
- Baixar documentos com manifesto, checksum, lotes, retomada, deduplicação e falha isolada por documento.
- Registrar requests de certidão e artefatos em staging beta, com status explícito e `human_required` quando o portal exigir etapa humana.
- Auditar o próprio repositório (segredos, PII em logs, retenção, isolamento de workspace, certificados versionados) e gerar relatórios JSON/Markdown.
- Indexar documentos para recuperação híbrida com citação verificável e abstenção explícita (`INSUFFICIENT_EVIDENCE`).

## Forbidden operations

- Peticionar, assinar, protocolar, praticar ato processual, dar ciência ou automatizar qualquer ação destrutiva ou oficial.
- Contornar CAPTCHA, 2FA, WAF ou etapa humana de portal; automatizar login com certificado.
- Criar segundo Store, tabela de produção paralela ou escrita oficial disfarçada de cache.
- Expor o beta a usuário comum, adicionar rota/UI ou habilitar flag em ambiente de produção.
- Persistir JWT/senha/PFX/TOTP em `state`, logs ou repositório; copiar código de repositório sem licença compatível.

## State model

Cada módulo declara capabilities em um registry comum (`PROCESS_SEARCH`, `PROCESS_DETAIL`, `MOVEMENTS`, `DOCUMENT_LIST`, `DOCUMENT_DOWNLOAD`, `COMMUNICATIONS`, `CERTIFICATES`, entre outras) e reporta `ok`, `degraded`, `experimental`, `unavailable` ou `disabled`, sempre acompanhado do `verificationState` mais conservador aplicável. O snapshot de status expõe módulos, verificações e flags sem segredo, com `authority: non-authoritative` e `isolation: beta-namespace`.

## Security boundary

O transporte nega por padrão: credenciais embutidas na URL, protocolos não HTTP(S), loopback/privado/link-local/metadata endpoints falham fechados; `allowedHosts` é uma allowlist opcional fornecida pelo provider. Redirecionamentos são seguidos **hop a hop** com validação de destino antes de cada requisição, cross-origin é bloqueado e o corpo nunca é baixado de um destino não validado. Providers que transmitem credencial/chave usam transporte com HTTPS obrigatório (`requireHttps`); HTTP permanece possível apenas em transporte local explícito de fixture, sem credencial. Providers usam token efêmero fornecido pelo usuário, nunca persistido no Store. O armazenamento beta usa AES-256-GCM via `SecurityManager`, com fail-closed em chave incorreta e isolamento físico por diretório de workspace.

## Failure semantics

Falha de um provider não derruba os demais: cada consulta retorna erro tipado (`UNAVAILABLE`, `TIMEOUT`, `RATE_LIMITED`, `HUMAN_REQUIRED`, `DISABLED`, `PARSE_ERROR`, `TOO_LARGE`) e alimenta observabilidade sanitizada. Ausência de evidência suficiente produz abstenção, não resposta afirmativa. Manifesto de cópia integral reporta esperado/baixado/falho/duplicado e sequências ausentes sem abortar o lote.

## Persistence semantics

O beta persiste apenas dados derivados, cifrados por workspace, sem migração destrutiva e sem tocar `app-state.json`, `runtime.json` ou `data/system/`. **FUTURE:** a promoção para entidades oficiais exige transformação pura própria, executável somente em missão autorizada; ela não está implementada nesta camada e nenhuma rotina de promoção é invocável hoje. Documentos beta usam staging próprio com checksum SHA-256; blobs oficiais não são criados, movidos ou apagados por esta camada.

## Limites de aquisição

Respostas HTTP são limitadas por `maxResponseBytes` (8 MiB por padrão), lotes de aquisição por `batchSize` e `maxDocuments`, com falha isolada por documento, retomada por journal e deduplicação por checksum. Aquisição em lote exige `BETA_DOCUMENT_ACQUISITION=true` **e** `BETA_DISABLE_AUTOMATIONS=false` explícito no próprio executor, mesmo quando chamado diretamente.

## Health estrito

`pnpm ji health` declara módulos sem afirmar verificação; `pnpm ji health --strict` executa probes locais determinísticos (sem rede): Process Intelligence, Document Acquisition, Privacy Audit e Legal RAG usam fixtures sintéticas, enquanto DataJud/PDPJ permanecem `UNVERIFIED`/`HUMAN_REQUIRED` no health — verificação ao vivo só existe em `datajud-check`/`pdpj-probe` sob opt-in supervisionado. O snapshot distingue `verificationEvidence` (`declared` vs `probed`) e nunca converte fixture em validação real. O modo estrito falha (exit 1) apenas para módulo `DEGRADED` ou `UNAVAILABLE`; `HUMAN_REQUIRED` e `UNVERIFIED` são estados honestos, não falhas.

## Relevant tests

`tests/ji_core.mjs`, `tests/ji_beta_storage.mjs`, `tests/spec_contracts.mjs`; nos lotes seguintes, `tests/ji_pdpj_provider.mjs`, `tests/ji_process_intelligence.mjs`, `tests/ji_document_acquisition.mjs`, `tests/ji_privacy_audit.mjs`, `tests/ji_certificates.mjs` e `tests/ji_legal_rag.mjs`.
