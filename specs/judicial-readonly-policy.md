# Política judicial read-only

Status: **CURRENT**

## Purpose

Delimitar toda integração judicial a consulta, descoberta e importação supervisionada.

## Canonical authority

`collector/`, `lib/judicial/`, rotas judiciais em `server.mjs` e `docs/judicial/`.

## Invariants

- DJEN → CNJ → DataJud é discovery somente leitura e, quando a fonte estruturada identifica inequivocamente uma única parte representada, vincula o processo ao contato oficial correspondente.
- Portais podem autenticar e consultar acervo, movimentos e publicações.
- Matching por CNJ/referência pode deduplicar; sinais fracos geram sugestão explicável.

## Allowed operations

- Autenticar, verificar saúde, descobrir processos, ler movimentos/publicações e desconectar.
- Upsert seguro preservando dados locais significativos e identidades estáveis; partes estruturadas podem formar contatos oficiais e relações processo-cliente sem sobrescrever curadoria manual.
- Todo CNJ estruturado do DJEN pode criar um processo-base; o DataJud enriquece esse mesmo registro com tribunal, classe, assunto e movimentos quando localizado.
- Destinatários estruturados do DJEN viram contatos. A classificação automática como cliente exige OAB monitorada associada à comunicação e um único polo destinatário; polos múltiplos permanecem pendentes de confirmação humana.
- Novo termo por inscrição OAB começa sem UF predefinida e exige seleção explícita da seccional; o sistema não presume RS nem outra unidade federativa.
- Prazos e intimações lidos do Painel do Advogado preservam a data e o texto reportados pela fonte, o portal e a proveniência da coleta. O prazo declarado pela fonte oficial (eproc/PJe) é aplicado automaticamente como `deadline`/`deadlineSource` do registro e da tarefa derivada; ajustes de contagem (embargos e similares) permanecem humanos e nenhuma inferência de texto cria prazo.
- A exportação oficial "Gerar Planilha" do eproc é operação de leitura: o coletor descobre o comando real na página autenticada, valida a ação pela allowlist read-only e nunca hardcodeia hashes, tokens ou parâmetros efêmeros. O arquivo resultante é validado por assinatura OLE/BIFF8 e nunca interpretado como autorização para ato processual.
- A Chave do Processo é segredo operacional: permanece somente no cofre cifrado do workspace e na memória da sessão autenticada, nunca no estado oficial, em resposta de API, em telemetria, em log ou em mensagem de erro.
- O Domicílio Eletrônico (PDPJ/Jus.br) é fonte de redundância declarada e somente leitura: a captura lista comunicações da janela oficial (7 dias na primeira captura, 2 dias nos ciclos) com `Authorization: Bearer` da sessão do próprio usuário e `tenantId` do escritório; `informar ciência` e qualquer escrita no portal são proibidos, o prazo declarado entra apenas como referência (`sourceReportedDeadlineSource: 'domicilio'`, eproc continua verdade absoluta) e `dataFinalCiencia` vira `noticeDeadlineAt`, nunca `deadline`. Cobertura: `tests/domicilio-eletronico.test.mjs`.

## Forbidden operations

- Ciência, acknowledgment, assinatura, petição, protocolo ou confirmação automática de prazo.
- Contornar CAPTCHA, 2FA ou etapa humana do portal.

## State model

Fonte pública ou portal autenticado com estado independente; dados importados mantêm `source` e identidade externa.

## Security boundary

O SSO federal permite exclusivamente autenticação nas rotas explícitas do realm `eproc` dos hosts `eproc-sso.trf4.jus.br` e `eproc-sso-certificado.trf4.jus.br`, e nas rotas OIDC/broker TRF4 do realm `pje` em `sso.cloud.pje.jus.br`. Esses hosts não permitem coleta judicial/download. O controle de certificado federal tem seu destino real validado; `SSO/login` é permitido somente nos controladores externos federais durante autenticação. Ações desconhecidas, processuais e parâmetros `acao` duplicados proibidos permanecem bloqueados. Contrato: `tests/eproc-read-only-actions.mjs`.

Segredos ficam cifrados no cofre do workspace no servidor; PFX, senha, cookies e TOTP não entram em Store, UI persistente ou logs. Loopback, PJeOffice, sidecars e A1 server-side são detalhes técnicos internos, não um agente pareado no computador do usuário.

## Failure semantics

Falha parcial é declarada; autenticação humana pausa o ciclo; erro sanitizado não vira ato automático. Uma seção de prazos ou intimações que não pôde ser coletada não autoriza marcar itens ausentes nem concluir o job como sucesso pleno.

## Persistence semantics

Somente dados de consulta passam pelo ingest oficial; não há persistência de ato processual oficial. A reconciliação usa identidade externa estável, preserva o histórico completo de evidência e marca `not_present` somente após leitura reconhecida e paginação completa da seção correspondente.

## Relevant tests

`tests/collector.mjs`, `tests/judicial_discovery.mjs`, `tests/judicial_integration_rbac.mjs`, `tests/monitoring_feature.mjs`, `tests/ui_v2_monitoring.mjs`, `tests/publication_task_linking.mjs`, `tests/eproc-read-only-actions.mjs`, `tests/eproc-report-first-pipeline.mjs`, `tests/eproc-access-key-hygiene.mjs` e `tests/eproc-deadline-pipeline.mjs`.
