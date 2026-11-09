# Integração EPROC (ATRIUM)

## Estratégia de autenticação, pipeline report-first e coleta de acervo

O eproc é o sistema de processo eletrônico adotado pela Justiça Federal da 4ª Região e por diversos Tribunais de Justiça estaduais. O ATRIUM trata o eproc como **conectividade judicial gerenciada, somente leitura**, com um único pipeline produtivo.

---

## Pipeline oficial (fonte de verdade)

```text
EprocSyncScheduler (07:00 / 19:00 BRT)  ou  sync manual explícito
  ↓
autenticação mTLS A1 + TOTP 2FA (workspace)
  ↓
Relatório de Processos oficial -> "Gerar Planilha" -> XLS OLE/BIFF8
  ↓
normalização + snapshot atômico por workspace
  ↓
diff NEW / UPDATED / UNCHANGED / REMOVED_OR_INACTIVE
  ↓
enriquecimento apenas de NEW/UPDATED (orçamento por execução)
  ↓
capa, movimentos, partes e Chave do Processo -> cofre cifrado (workspace + portal/grau + CNJ)
  ↓
Painel do Advogado -> prazos em aberto e intimações pendentes (triagem humana, sem prazo fatal)
  ↓
Store oficial + telemetria sanitizada
```

Regras estruturais:

1. **Autenticação**:
   - Certificado Digital A1 via `ClientCertMtlsAuthAdapter` (PFX modernizado em sandbox local).
   - Segundo fator TOTP RFC 6238 quando exigido pelo portal.
   - Perfis Chromium isolados em `data/browser-profiles/<workspace>/...`; cookies e sessão nunca são compartilhados entre workspaces.
2. **Relatório oficial**: a exportação "Gerar Planilha" é descoberta dinamicamente na página autenticada (inclusive em frames) e validada por allowlist read-only. Nenhum hash, token ou parâmetro efêmero é hardcoded. Planilhas são validadas por assinatura OLE/BIFF8 (`d0cf11e0a1b11ae1`); workbook vazio é resultado válido e distinto de arquivo incompatível.
3. **Diff**: fingerprints estáveis por portal + CNJ + evento + data + classe + unidade + valor. Mudança de ordem de linhas ou horário de geração não gera `UPDATED`. `UNCHANGED` não é reenriquecido.
4. **Enriquecimento**: apenas `NEW`/`UPDATED` e backlog pendente, com orçamento por execução; o restante é registrado como diferido. Reconciliação de cliente é conservadora: parte adversa nunca vira cliente e curadoria manual é preservada.
5. **Chave do Processo**: extraída da capa somente na sessão autenticada e persistida apenas no cofre cifrado do workspace, com escopo `owner de workspace + portal/grau + CNJ`. Nunca retorna ao frontend nem entra em estado, telemetria, logs ou mensagens de erro.
6. **Prazos e intimações**: lidos do Painel do Advogado com proveniência e evidência histórica; a data informada pela fonte exige conferência humana e nunca preenche `deadline`/`fatalDeadline`.
7. **Single-flight**: requisições concorrentes do mesmo workspace ingressam no job existente. Não existe segundo pipeline A1; as rotas legadas de sweep e enrich são fachada do scheduler oficial.
8. **Disparos automáticos**: somente o scheduler (07:00/19:00 BRT) e o comando manual explícito iniciam coleta pesada. Login, reload e abertura de views não iniciam sincronização.

## Cobertura e evidência

Código de adapter não equivale a validação em todos os tribunais e graus. Cada portal permanece `experimental`, `not_verified` ou candidato de verificação manual até existir evidência read-only específica para o workspace. A cobertura nacional e os níveis de evidência estão documentados em `docs/judicial/EPROC_NATIONAL_COVERAGE.md`.

## Limites

- A integração automática é read-only. Ciência, protocolo, petição, assinatura e confirmação de prazo são proibidos por default-deny e cobertos por `tests/eproc-read-only-actions.mjs`.
- O acesso a documentos e autos usa as ações oficiais de leitura; downloads são opt-in por comando explícito.
- Chaves de acesso e credenciais nunca entram no Store jurídico nem em fixtures de teste.

## Testes de referência

`tests/eproc-report-first-pipeline.mjs`, `tests/eproc-access-key-hygiene.mjs`, `tests/eproc-report-diff.mjs`, `tests/eproc-xls-import.mjs`, `tests/eproc-spreadsheet-download-fallback.mjs`, `tests/eproc-deadline-pipeline.mjs`, `tests/eproc-scheduler-contract.mjs`, `tests/eproc-real-wiring.mjs`, `tests/eproc-workspace-credential-isolation.mjs` e `tests/eproc-legacy-routes-csrf.mjs`.
