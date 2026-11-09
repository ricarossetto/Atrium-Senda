# Coletores PJe — painéis, menus e identidade de expediente

Status: **documento de referência técnica**. Descreve a anatomia de cada família de
coletor PJe, o menu de onde cada coleta nasce, e o que ainda **não** foi confirmado em
live. Nenhuma rota aqui é inventada: tudo marked como `confirmado` veio de observação
autenticada; tudo marcado como `a confirmar` é hipótese e não pode virar `confirmedRoutes`.

Spec do domínio: `specs/pje-readonly-pipeline.md`. Segurança read-only: este documento
não autoriza nenhum ato; a trava vive em `lib/judicial/pje/safety.mjs`.

---

## 1. As duas famílias de coletor

O PJe não é um produto só. O CNJ mantém **dois front-ends** e eles têm anatomias
incompatíveis. Por isso existem dois coletores, e não um coletor "com parâmetros":

| Família | `collectorKey` | Front-end | Portais | Arquivo |
|---|---|---|---|---|
| **`standard`** | `standard` | RichFaces (JSF) + PrimeNG | TJMT 1G/2G, e a maioria dos TJs | `lib/judicial/pje/collectors/standard-painel.mjs` |
|Trabalhista | `trabalhista` | Angular Material + REST | TRT4 1G/2G | `lib/judicial/pje/collectors/pje-jt.mjs` |

`resolvePjeCollector(portal)` em `portal-registry.mjs:418` decide qual roda, por
`portal.collectorKey`. As duas famílias **compartilham o motor**, que é onde mora a
lógica que importa:

```
PjeSyncService  (single-flight, jobs persistidos, audit JSONL)
  → runtime resolver (server | auto)
  → installPjeReadOnlyGuard  (fail-closed: sem guarda, não navega)
  → authenticatePjeSession   (state machine PDPJ/PJeOffice/TOTP — compartilhada)
  → collector por família    ← ÚNICO ponto que diverge
  → reconcilePjeCollection   (gate: loaded / empty_confirmed / partial / load_timeout)
  → snapshot + diff → ingestão oficial → JudicialCommunication
```

Consequência prática: **um bug no motor atinge todas as famílias; um bug de painel
atinge só a família daquele front-end.** É por isso que a correção de Selecting do 2G
(`selectExpedienteCells`) foi testada na família `standard` e não afetou o TRT4, e por
isso o TRT4 precisa de validação própria.

---

## 2. Autenticação (comum às famílias)

O login **não** é por portale Individual. O PDPJ é um ponto de entrada único:

1. `pje.trt4.jus.br` (ou o domínio do tribunal) abre o PDPJ.
2. A aba mostra **"Acesso com Certificado Digital"** — o botão `#btnSsoPdpj`
   (`loginEntrySelector`, `portal-registry.mjs:182` e `:201`).
3. O ATRIUM clica nesse botão; o PJeOffice Pro local assina via
   `127.0.0.1:8800/pjeOffice/` (`challengePhrase` + imagem-sinal).
4. Se o portal pedir 2FA, o mesmo **QRCode de TOTP serve para todos os PJe** do
   workspace (escopo `pdpj` do cofre, compartilhado).
5. Sem assinador local disponível, o fluxo tenta conta PDPJ (CPF + senha) no
   `sso.cloud.pje.jus.br`; sem conta, `AUTH-CREDENTIALS-REQUIRED` — estado humano, nunca
   contorno automático.

Cadeia de estados em `lib/judicial/pje/auth/pdpj-auth.mjs`:
`panel` · `totp` · `certificate` · `login_entry` · `credentials` · `manual` · `unknown`.

O botão `#btnSsoPdpj` é tratado em três pontos, propositalmente redundantes, porque o PDPJ
muda a página de entrada conforme o tribunal e o estado do cookie:
`login_entry` (linha 584), `certificate` sem helper (linha 529) e `unknown`/`manual`
(linha 613).

**Estado verificado:** `pje-tjmt-1g`, `pje-tjmt-2g` e `pje-trt4-1g` já registraram
`auth=verified` em produção. A entrada por certificado está funcionando; se um job falha
depois do `auth`, o defeito está na coleta, nunca na entrada.

---

## 3. Família `standard` — TJs (RichFaces)

### Menu de origem

```
Painel do advogado (Advogado.seam)
  └─ Expedientes
       ├─ por situação (Pendentes de ciência, Apenas pendentes de resposta, Sem prazo, ...)
       └─ Acervo
```

Rotas oficiais em `confirmedRoutes`: `/primeirograu/Painel/painel_usuario/list.seam`
(1G), `/pje2/Painel/painel_usuario/advogado.seam` (2G).

### Anatomia da tabela

RichFaces monta `TABLE#tbExpedientes` dentro de `TBODY`, e cada linha real carrega o id
do expediente na própria célula:

```
formExpedientes:tbExpedientes                     TABLE   ← NÃO é expediente
formExpedientes:tbExpedientes:tb                  TBODY   ← NÃO é expediente
formExpedientes:tbExpedientes:j_id587header       TH      ← cabeçalho
formExpedientes:tbExpedientes:66338074:j_id587    TD      ← ESTE é o expediente
```

Duas colunas-cell rivais por linha: a de botões (`j_id565`, "Tomar Ciência"/"Responder") e
a de conteúdo (`j_id587`, com CNJ, situação e datas). Só a segunda carrega o id.

### A regra que quebrou e foi corrigida

`parseExpedienteCellId` + `selectExpedienteCells` exigem, em conjunto:

1. id no formato `/:tbExpedientes:(\d{4,}):/`;
2. CNJ presente no texto;
3. número do expediente entre parênteses no texto;
4. dedupe por **id de expediente**, não por conteúdo nem por situação.

Sem a regra 4, o mesmo expediente aparece em várias situações e o gate contava `+1`
identidade por situação. Efeito observado no TJMT 2G: `expected` inflado (10, 14) contra 6
reais, `partial`, job `SKIPPED_UNRELIABLE`. Depois da correção: `6/6 loaded`.

Diagnóstico dessa família: abas `Expedientes Diagnostico` e `Expedientes Arvore` do XLS
(sem texto e sem PII) e a prova `tests/pje-standard-collector-dom.mjs`.

---

## 4. Família `trabalhista` — TRTs (Angular + REST)

### Menu de origem

```
Meu Painel (usuario-externo)
  ├─ Acervo Geral        → /pjekz/painel/usuario-externo/acervo-geral
  ├─ Meus Expedientes    → /pjekz/painel/usuario-externo/pendentes-manifestacao
  └─ Arquivados
```

Rotas em `PJE_JT_ROUTES` (`pje-jt.mjs:26`), declaradas como descobertas em live no teste
`tests/pje-jt-collector.mjs` T4.

A navegação é por **clique no card** (`mat-card` com o rótulo "Acervo Geral" /
"Meus Expedientes"), com `goto` direto como fallback. Os contadores expected saem do
próprio card (`readPjeJtCardCounters`, regex `^(\d+)\s+(Acervo Geral|Meus Expedientes|Arquivados)`).

### Anatomia da linha

Colunas de tabela, texto corrido com rótulos repetidos:

```
Detalhes do Processo | Processo | Órgão Julgador | Data de Criação | Data da Audiência
                     |         |                |                  | Data da Ciência | Prazo Final
```

parse por rótulo (`parsePjeJtAcervoRow`, `parsePjeJtExpedienteRow`): `Órgão Julgador`,
`Data da Audiência`, `Data da Autuação` / `Data de Criação`, `Data da Ciência`,
`Prazo Final`. Datas são **dado da fonte**, nunca prazo fatal.

### Identidade

`externalId` quando o link traz `id|nu|num|cod…expediente`; senão fingerprint estrutural
`fp:` sobre processo + órgão + datas. O texto volátil ("Abrir o Peticionar", horário de
renderização) **não** entra na identidade — é o que impede duplicata a cada re-render.

### Estado atual: `TRT4` funcionando, sem expedientes no momento (2026-10-04)

Cadeia de causas resolvida em produção, cada uma com evidência:

1. **Headless** (`6.24.7`): o painel Angular não montava. `requiresHeaded` por portal + `DISPLAY`/`XAUTHORITY` do Xvfb.
2. **Clique engolido** (`6.24.9`): o card "Meus Expedientes" existe mas o clique não navega. Exceção de clique retorna `false` e URL pós-clique é verificada; se continua na home, `goto` direto.
3. **Guarda bloqueando a própria rota** (`6.24.11`): `route.abort('blockedbyclient')` em `/pendentes-manifestacao` porque o pathname contém `manifestacao`. Pathname de `confirmedRoutes` (exato, só GET/HEAD) não indica ato; query e corpo seguem classificados.
4. **Tabela vazia real** (`6.24.12`): página "Meus Expedientes - PJE" carrega, `tableTextLen=262` (mensagem de vazio, não dados), `cnj=0`. Os 3 cards da home não trazem número (`cardProbe` sem match), então `expected=null` é comportamento correto, não bug de regex.

Com `expected=null` e 0 linhas, o gate cai em `load_timeout` e **não ingere ausência como fato** — decisão honesta do gate, não falha. Quando houver expedientes, o ciclo de 360 min coleta e ingere sozinho. `auth=verified`, `acervo=loaded` no mesmo job.

**Não mexer no gate** para forçar `empty_confirmed` sem contador: seria fabricar certeza.

Job `pje-mutcnlud-gkpg7y` (04:58Z, `6.24.12`, forçado pela rota autenticada):
`SKIPPED_UNRELIABLE`, `auth=verified`, `acervo=loaded`, `expedientes=load_timeout`,
`coletados=0`, `expected=null`. Estrutura final:

```
expedientes url=.../pendentes-manifestacao  titulo="Meus Expedientes - PJE"
            tabelas=1  tr=2  tableTextLen=262  cnj=0
            cards da home: 3, nenhum com numero (cardProbe sem match)
```

Histórico da investigação (cada hipótese com evidência, sem adivinhação):

- H "falta credencial" — **descartada**: `auth=verified` em todos os jobs; a conta `pdpj`
  do cofre é a mesma do TJMT.
- H "botão `#btnSsoPdpj`" — **descartada**: tratado em três ramos da state machine
  (`pdpj-auth.mjs`).
- H "parse/regex" — **descartada**: `cnj=0` porque não havia página montada, não porque o
  CNJ não casava; o parser nunca recebeu texto.
- H "headless" — **confirmada e corrigida** (`6.24.7`).
- H "clique engolido" — **confirmada e corrigida** (`6.24.9`): o rastro mostrou
  `apos-clique` mantendo a home.
- H "guarda bloqueando a própria rota" — **confirmada e corrigida** (`6.24.11`):
  `goto-erro: net::ERR_BLOCKED_BY_CLIENT`, `route.abort('blockedbyclient')` no pathname
  com `manifestacao`.
- H "tabela populada sem CNJ" — **descartada** (`6.24.12`): `tableTextLen=262` prova vazio
  real; `cardProbe` prova que a home não expõe contadores.

Estado de suporte no host verificado: `pjeoffice.service` e `pjeoffice-pin.service` ativos,
helper em `127.0.0.1:8800` respondendo, `Xvfb :99` no ar, `pin-agent.mjs` presente.
TRT4 1G habilitado na config e no ciclo de 360 min; TRT4 2G ainda não executado.

### O que NÃO é a causa

- Não é falta de credencial: `auth=verified` nos dois jobs e a entrada por certificado
  funciona. A conta `pdpj` do cofre é a mesma do TJMT.
- Não é o botão `#btnSsoPdpj`: é tratado em três ramos da state machine.
- Não é o gate nem o motor: são compartilhados com o TJMT, que está `6/6 loaded` nas duas
  praças.
- Não é regressão do 2G: a correção ficou confinada à família `standard`.
- Não é o parser de linha: não recebeu texto para parsear.

---

## 5. Mapa portal → família

| Portal | Família | Último estado live (20/10/2026) |
|---|---|---|
| `pje-tjmt-1g` | standard | `UNCHANGED`; auth `verified`; expedientes `loaded` 5/5; acervo `loaded`; diff 14 |
| `pje-tjmt-2g` | standard | `UNCHANGED`; auth `verified`; expedientes `loaded` 15/15; acervo `loaded`; diff 11 |
| `pje-trt4-1g` | trabalhista | `SKIPPED_UNRELIABLE`; auth `verified`; expedientes `load_timeout`; acervo `partial`; 0 coletados |
| `pje-trt4-2g` | trabalhista | `SKIPPED_UNRELIABLE`; auth `verified`; expedientes e acervo `load_timeout`; 0 coletados |
| demais TJs/TRFs | conforme `registry` | sem evidência live |

Este quadro é o **último estado verificado**, não uma garantia permanente. O TJMT 2G, que já
registrou `SKIPPED_UNRELIABLE` em 22/09 por identidade inflada, fechou `15/15` e `UNCHANGED` em
20/10/2026. O TRT4 autentica, mas o portal não monta a lista no runtime atual; o gate preserva
`load_timeout` e **não ingere ausência como fato**. Revalidar os portais habilitados em toda
promoção de coletor e registrar o resultado no runbook; não declarar portal verificado sem
leitura real no mesmo job.

Regra do registry (`portal-registry.mjs`): `confirmedRoutes` só recebe rota observada em
live. Portal sem rota confirmada não entra em `automaticSyncEnabled`.

---

## 6. Checklist antes de promover qualquer coletor

1. `auth=verified` **e** coleta `loaded` no mesmo job.
2. Relatório XLS com conteúdo real — abas de aviso "Sem registros coletados" são falha,
   não "escritório sem pendências".
3. `PJe_<portal>_estrutura.json` revisado quando o estado não é confiável.
4. `expected` bate com o contador real do portal (6/6 no TJMT).
5. Identidades `id:`/estáveis: reexecutar o mesmo portal não cria expediente novo.
6. Teste focal da família verde: `tests/pje-standard-collector.mjs`,
   `tests/pje-standard-collector-dom.mjs` (standard) ou `tests/pje-jt-collector.mjs`
   (trabalhista).
7. Nenhum clique em "Tomar Ciência", "Responder", "Assinar", "Peticionar" — a guarda
   read-only é fail-closed e não pode ser contornada por teste.

## 7. Referências

- `specs/pje-readonly-pipeline.md` — contrato do domínio
- `lib/judicial/pje/portal-registry.mjs` — registry, `confirmedRoutes`, `loginEntrySelector`
- `lib/judicial/pje/auth/pdpj-auth.mjs` — state machine de autenticação
- `lib/judicial/pje/collectors/standard-painel.mjs` — família TJ
- `lib/judicial/pje/collectors/pje-jt.mjs` — família TRT
- `lib/judicial/pje/safety.mjs` — trava read-only
- `tests/pje-jt-collector.mjs`, `tests/pje-standard-collector-dom.mjs` — provas por família