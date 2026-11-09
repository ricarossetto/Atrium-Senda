# ATRIUM — Consulta pública por chave de acesso do eproc

Status: **CURRENT** — Fase 1 (contrato + cliente de transporte HTTP direto), Fase 2 (fluxo real de formulário em dois passos + detecção tipada de CAPTCHA) e Fase 3 (degrau assistido por navegador real, com humano concluindo o CAPTCHA, opt-in) implementadas e cobertas por testes sintéticos. Firecrawl foi avaliado e **não implementado por decisão** (enviaria a chave a terceiro e não contorna CAPTCHA). Integração de produto (rotas/UI/cofre) e famílias Projudi/e-SAJ/SEEU permanecem `FUTURE` e exigem missão própria.

Autoridade executável: `lib/judicial/eproc/public-search/` e `tests/eproc-public-search-client.mjs`.

## 1. Objetivo

Permitir que um usuário **sem certificado digital A1** informe a chave de acesso aos autos (e, quando o portal exigir, a senha de consulta) e que o ATRIUM consulte o portal oficial do eproc em **modo leitura**, devolvendo capa, partes, movimentos e documentos no modelo oficial do eproc, com estados honestos de verificação.

A consulta por chave é um caminho de **consulta**, não de autenticação de sessão. Ela não substitui a integração A1 e não amplia permissões: o portal decide o que é exibido, e o ATRIUM apenas interpreta e classifica a resposta.

## 2. Invariantes

1. **Cofre cifrado e escopado.** A chave de acesso vive exclusivamente no cofre cifrado do workspace (`JudicialCredentialManager`), no escopo **workspace + portal + grau + CNJ**. O cliente recebe a chave em memória por parâmetro e **nunca** a persiste, retorna, serializa ou inclui em resultado.
2. **Segredo nunca no estado/API/log/telemetria.** Toda mensagem de erro, log ou campo de proveniência passa por redação (`redactEprocSecrets`/`sanitizeJudicialError` e redação por valor exato). Resultados não contêm `accessKey`, `chaveAcesso` ou equivalentes.
3. **Read-only e default-deny.** O cliente constrói apenas a URL declarada no registry (`baseUrl` + `publicSearchPath`); não aceita URL arbitrária, não navega sessão autenticada e não executa nenhuma operação da lista proibida (`acknowledge`, `sign`, `file`, `petition`, `confirmDeadline`). O transporte exige HTTPS e allowlist de hosts do portal.
4. **Nunca burlar CAPTCHA/2FA.** A detecção de CAPTCHA, verificação humana ou 2FA encerra a tentativa com `CAPTCHA_REQUIRED`/`HUMAN_REQUIRED`. É proibido OCR, resolução automática, replay de token ou qualquer contorno.
5. **Estados honestos de verificação.** HTTP 200 **não** é sucesso por si. Só há sucesso quando: o CNJ retornado é idêntico ao solicitado; a estrutura de capa/eventos é reconhecida; os documentos pertencem ao processo retornado. Resposta vazia, estrutura alterada, CNJ divergente ou conteúdo restrito produzem falha tipada — nunca sucesso presumido.
6. **Backend como autoridade.** Quando o cliente for exposto pelo produto, o servidor resolve CNJ, portal e credencial do cofre; o frontend não é fonte de verdade nem recebe o segredo de volta. A persistência do resultado segue o estado oficial do workspace (§31).
7. **Prazos.** A consulta **não** infere prazo, ciência judicial ou ato processual (§15/§16). O resultado não contém deadline e não altera `treatmentStatus`.
8. **Hospedagem e execução.** A autoridade da suíte A1 completa continua sendo a execução local explícita no Windows (§21). Nenhum teste deste contrato acessa rede real; fixtures são 100% sintéticas (§14).

Referências normativas: `AGENTS.md` §13 (segurança), §14 (fixtures), §15 (publicações/ciência), §16 (prazos), §21 (A1 local), §31 (persistência no estado oficial pelo servidor), §32 (invariantes de endurecimento).

## 3. Contrato do cliente

```js
import { createEprocPublicSearchClient } from '../lib/judicial/eproc/public-search/index.mjs';

const client = createEprocPublicSearchClient({ transport, registry, logger });
const result = await client.searchByProcessKey({ cnj, accessKey, portalId });
```

- `transport` (opcional): transporte HTTP. Padrão `createDirectHttpTransport()`.
- `registry` (opcional): resolvedor de portais. Padrão `portal-registry.mjs` (`getEprocPortalById`, com aliases legados).
- `logger` (opcional): logger sanitizado; padrão silencioso (nenhum segredo pode vazar).
- `now` (opcional): relógio injetável para `collectedAt` determinístico em teste.

### 3.0 Fluxo real do portal

`searchByProcessKey` executa dois passos: (1) `GET` da ação de consulta por chave derivada do registry (`buildEprocPublicKeyFormRequest`); (2) leitura do formulário retornado (`parseEprocPublicKeyForm`: action, hiddens e campos `txtNumProcesso`/`txtNumChaveDocumento`) e `POST` com `Referer` e cookies da sessão de consulta (`buildEprocPublicKeySearchRequest`). A página do formulário é classificada antes do POST: `detectEprocCaptcha` identifica `turnstile`, `hcaptcha` ou `image` e encerra com `CAPTCHA_REQUIRED` + `captchaType`, **sem enviar a chave**. Formulário irreconhecível degrada para `PARSE_ERROR`; página sem os campos obrigatórios nunca gera POST cego.

### 3.1 Sucesso

```js
{
  ok: true,
  portalId,            // id oficial do registry
  cnj,                 // 20 dígitos, igual ao solicitado
  source: 'EPROC_PUBLIC_KEY',
  collectedAt,         // ISO-8601
  metadata,            // capa oficial (sem accessKey)
  parties,             // parseEprocParties
  movements,           // parseEprocMovements
  documents,           // parseEprocDocuments
  provenance           // portal, transporte, URL final sanitizada, validação; sem segredo
}
```

### 3.2 Falha tipada

```js
{
  ok: false,
  reason: 'KEY_INVALID' | 'KEY_EXPIRED' | 'NOT_FOUND' | 'PORTAL_UNAVAILABLE' |
          'RATE_LIMITED' | 'PARSE_ERROR' | 'HUMAN_REQUIRED' | 'CAPTCHA_REQUIRED' |
          'AUTH_REQUIRED' | 'UNSUPPORTED' | 'DOCUMENT_RESTRICTED',
  error,               // string sanitizada, nunca contém a chave
  portalId?, cnj?, errorCode?, captchaType?  // contexto opcional ('turnstile'|'hcaptcha'|'image' em CAPTCHA_REQUIRED)
}
```

`error` é sempre string (compatível com `AccessKeyEnrichmentStrategy`, que compara `reason` a `KEY_INVALID`/`KEY_EXPIRED` e lê `error`).

### 3.3 Classificação

- `KEY_INVALID` / `KEY_EXPIRED`: portal recusa explicitamente a chave.
- `NOT_FOUND`: processo não localizado na consulta pública.
- `AUTH_REQUIRED`: portal exige login/senha/certificado para exibir os autos, ou a chave de acesso não foi informada (`errorCode: MISSING_ACCESS_KEY`).
- `CAPTCHA_REQUIRED` / `HUMAN_REQUIRED`: desafio anti-bot ou verificação manual.
- `RATE_LIMITED`: HTTP 429 ou aviso textual de limite.
- `DOCUMENT_RESTRICTED`: segredo de justiça/restrição sem documentos abertos.
- `PARSE_ERROR`: estrutura não reconhecida, resposta vazia ou CNJ divergente.
- `PORTAL_UNAVAILABLE`: timeout, erro de rede, HTTP 5xx/404, resposta acima do limite.
- `UNSUPPORTED`: CNJ inválido, portal desconhecido/sem `publicSearchPath` ou destino bloqueado por política de transporte.

## 4. Cascata de transporte

Ordem de preferência, do mais barato/auditável ao último recurso:

1. **API oficial** do tribunal, se existir e autorizada — `FUTURE`.
2. **HTTP direto** (`createDirectHttpTransport`) — **Fase 1, este contrato**.
3. **Firecrawl** — **avaliado e não implementado por decisão**: exigiria enviar a chave de acesso a um terceiro (viola o invariante de segredo) e não contorna CAPTCHA.
4. **Playwright assistido** (`createAssistedBrowserTransport`) — **Fase 3, implementado**: navegador real, o humano conclui o CAPTCHA; opt-in por flag.
5. **CAPTCHA_REQUIRED/HUMAN_REQUIRED** — estado honesto quando o modo assistido não está habilitado ou o humano não conclui o desafio.

Nenhum degrau inferior pode ser usado para mascarar falha de um superior, e todos devem preservar o mesmo `PublicSearchResult` e os mesmos invariantes. A cascata não autoriza envio da chave a terceiros (Firecrawl) sem missão explícita.

## 5. Transporte HTTP direto

`createDirectHttpTransport({ fetchImpl, timeoutMs, maxBytes, userAgent, allowlist, maxRedirects })`:

- HTTPS obrigatório; URL `http:` falha com `INSECURE_TRANSPORT`.
- Allowlist de hosts (aceita hostname ou origin; casa host exato ou subdomínio). Redirecionamento para host fora da allowlist falha com `REDIRECT_BLOCKED`; hosts fora da allowlist na origem falham com `HOST_NOT_ALLOWED`.
- Redirects controlados hop-a-hop (`redirect: 'manual'`), limite de saltos, `302/303` após POST degradam para GET.
- Cookie jar simples por host, em memória (sessão de consulta), nunca persistido.
- Timeout via `AbortController` (`TIMEOUT`), limite de bytes (`RESPONSE_TOO_LARGE`).
- Erros sanitizados: `secrets` informados ao `request()` são removidos de qualquer mensagem (`NETWORK_ERROR`, `TRANSPORT_ERROR`).
- O transporte nunca inclui o corpo do formulário nem a chave em mensagens de erro.

### 5.1 Transporte assistido (Playwright)

`createAssistedBrowserTransport({ launch, timeoutMs, pollMs, onHumanRequired })` mantém **uma página real** entre o GET do formulário e o POST da consulta e declara `capabilities.interactiveCaptcha = true`. Quando o CAPTCHA é detectado nesse modo, o cliente **não encerra**: preenche o formulário, aguarda a conclusão do widget pelo humano (`waitForEprocCaptchaResolution`, com aviso único via `onHumanRequired`) e submete; tempo esgotado produz `CAPTCHA_TIMEOUT` (exigência humana). O ATRIUM nunca resolve, automatiza ou contorna o desafio, e nunca registra a chave. Habilitado por `EPROC_PUBLIC_KEY_ENABLED=on` + `EPROC_PUBLIC_KEY_INTERACTIVE=on` (padrão OFF). CLI de operador: `node scripts/eproc-assisted-search.mjs --cnj=<20 dígitos> --key-file=<arquivo> [--portal=<id>]`.

## 6. Portais e verificação

- Os 21 portais do registry (16 ativos) declaram `publicSearchPath: 'externo_controlador.php?acao=processo_consulta_publica'`; o cliente é genérico à família eproc.
- O parser de referência cobre o markup eproc com `tblPartesERepresentantes`/`tblEventos` e reaproveita `parsers/case-parser.mjs`, `parsers/movement-parser.mjs` e `parsers/document-parser.mjs`. O transporte muda; o modelo oficial não.
- Os nomes dos campos do formulário de consulta pública estão centralizados em `key-search-parser.mjs`; o fluxo real (formulário + POST + captcha) foi confirmado live nos portais testados.
- Verificação live read-only (2026-09-18): `jfrs-eproc-1g` (Cloudflare Turnstile), `tjrs-eproc-1g` (imagem `txtInfraCaptcha`), `tjrs-eproc-2g` (hCaptcha) e `trf4-eproc-2g` (Cloudflare Turnstile). Todos exigem CAPTCHA antes de concluir a consulta; o POST cego cai em "sessão encerrada" (`AUTH_REQUIRED`).
- O registry registra a observação live por portal em `publicAccess` (`captcha`, `directHttp: 'blocked_by_captcha'`, `verificationState: 'ENTRYPOINT_OBSERVED'`). Portais sem observação permanecem `UNVERIFIED`/`candidate`/`unknown`; nenhum recebe `LIVE_VERIFIED`.
- O portal unificado da Justiça Federal da 4ª Região (`consulta.trf4.jus.br`, família TRF4/JFRS/JFPR/JFSC) também foi sondado live e igualmente exige Cloudflare Turnstile (`cf-turnstile` + callback) no passo de validação da pesquisa: não é um degrau livre de CAPTCHA e permanece `FUTURE` (família própria).

## 7. Critérios de aceite da Fase 1

1. `createEprocPublicSearchClient({...}).searchByProcessKey({ cnj, accessKey, portalId })` implementa os contratos 3.1–3.3.
2. HTTP 200 sem confirmação semântica nunca retorna `ok: true`.
3. CNJ retornado diferente do solicitado, resposta vazia ou estrutura irreconhecível retornam `PARSE_ERROR`.
4. Sem modo assistido, CAPTCHA/verificação humana retornam `CAPTCHA_REQUIRED`/`HUMAN_REQUIRED` sem tentativa de contorno.
5. Nenhuma chave aparece no resultado, em erros ou em logs (verificado por spy e por `JSON.stringify`).
6. Transporte exige HTTPS, respeita allowlist (inclusive em redirect), timeout e limite de bytes.
7. Parsers oficiais são reutilizados (teste compara com chamadas diretas).
8. Fixtures 100% sintéticas, com CNJs válidos e sem dados reais.
9. `node scripts/check-syntax.mjs` e `node tests/eproc-public-search-client.mjs` verdes.
10. Modo assistido só prossegue após o widget do CAPTCHA ser concluído pelo humano; expiração gera exigência humana e o resultado nunca contém a chave (`tests/eproc-public-search-assisted.mjs`).

## 8. Fora de escopo

- Projudi, e-SAJ, SEEU e demais famílias: **não iniciadas**; exigem missão com contrato próprio (login, leitura e evidência por família).
- Firecrawl: **avaliado e rejeitado por decisão** (a chave de acesso não pode ser enviada a terceiros e o CAPTCHA não é contornável).
- Rotas HTTP, endpoints, UI e persistência/cofre no produto para a consulta pública (fase de integração).
- Verificação live de outros portais/WAFs e cadência real de rate limit; o portal unificado TRF4 permanece família própria.
- Ciência judicial, prazos, publicações, downloads autenticados ou qualquer ato processual.

## 9. Riscos e dívida observados

- Campos de formulário confirmados live nos 4 portais testados (`txtNumProcesso` + `txtNumChaveDocumento`, ação `processo_consulta_publica_chave/consultar`); nos demais permanecem declarativos e a classificação por marcador textual é conservadora (fail-closed).
- CAPTCHA/WAF confirmado em todos os portais testados (eproc e portal unificado TRF4); o caminho HTTP direto produz `CAPTCHA_REQUIRED` — comportamento honesto esperado, não falha a contornar. O degrau assistido (humano no navegador) está implementado e é opt-in; a conclusão depende de intervenção humana por desenho.
- Validação live (2026-09-19, JFRS 1G): o Cloudflare Turnstile recusou o navegador controlado por automação ("Falha na verificação") mesmo no modo assistido. Portais com essa proteção podem inviabilizar o degrau assistido por desenho; nesses casos o caminho oficial é a conta do tribunal (sem CAPTCHA, server-side) ou o Certificado A1.
- TJSP/TJRJ são portais piloto/parciais no registry; a cobertura real depende da validação live.
- A integração ao produto deve remover o segredo do frontend e persistir o resultado pelo servidor (§31), fora desta fase.
