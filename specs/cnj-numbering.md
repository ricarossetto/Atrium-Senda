# ATRIUM — Numeração única de processos (CNJ)

Status: **CURRENT** — estrutura, dígito verificador e tabelas derivadas da Resolução CNJ nº 65/2008 (redação dada pelas Resoluções nº 223/2016 e nº 477/2022), implementadas como fonte única compartilhada entre servidor e frontend. O uso assistido no cadastro manual (aviso de DV, sugestão de correção, alerta de duplicidade e derivação de tribunal/grau) é contrato da mesma missão.

Autoridade executável: `js/core/cnj.js` (módulo puro), reexportado pelo backend em `lib/judicial/omni/contracts.mjs`; testes em `tests/cnj_numbering.test.mjs`, `tests/collector.mjs`, `tests/processes_feature.mjs` e `tests/ui_v2_processes.mjs`.

## 1. Objetivo

Garantir que todo número de processo judicial tratado pelo ATRIUM seja interpretado, validado e derivado pela mesma regra oficial, evitando divergência entre o acervo local, o casamento com DJEN/DataJud e as consultas judiciais.

## 2. Estrutura e dígito verificador

1. **Formato oficial:** `NNNNNNN-DD.AAAA.J.TR.OOOO` (20 dígitos). O armazenamento aceita o formato com pontuação; a normalização para comparação usa apenas dígitos (`cleanCnj`).
2. **Dígito verificador:** Módulo 97 Base 10 (ISO 7064), Anexo VIII da Resolução: `DD = 98 − ((NNNNNNN + AAAA + J + TR + OOOO) × 100 mod 97)`, em dois dígitos (02 a 98). A verificação equivale a `(18 dígitos + DD) mod 97 = 1` com o DD deslocado para o final.
3. **Números não-CNJ:** valores com menos de 20 dígitos (número antigo/físico, protocolo) permanecem livres, sem formatação ou validação, e nunca são convertidos automaticamente em CNJ.
4. **Zeros e formato incompleto** são inválidos; `assertCnj` continua bloqueante (400) nas rotas judiciais.

## 3. Tabelas oficiais

1. **Segmento (J):** 1 STF, 2 CNJ, 3 STJ, 4 Justiça Federal, 5 Justiça do Trabalho, 6 Justiça Eleitoral, 7 Justiça Militar da União, 8 Justiça dos Estados e do Distrito Federal e Territórios, 9 Justiça Militar Estadual.
2. **Tribunal (TR):** TJs 01–27 (ordem oficial da Resolução; DF = 07, sigla consolidada `TJDFT`), TRFs 01–06, TRTs 01–24, TREs 01–27 (`TRE-UF`), Circunscrições Militares 01–12, TJMs estaduais 13/21/26 (`TJM-MG/RS/SP`), conselhos 90 (`CJF`/`CSJT`), superiores 00 (`STF`, `CNJ`, `STJ`, `TST`, `TSE`, `STM` — Anexos I, III, IV e V).
3. **Unidade de origem (OOOO) e grau:** `0000` = competência originária do tribunal; `9999` = recurso em autos principais com competência delegada; primeiro dígito `9` (demais) = turma recursal; caso contrário, 1º grau.
4. **`describeCnj`** devolve campos, nomes oficiais, sigla do tribunal, grau/competência, marcação `delegated` e `valid` (DV conferido). O descritor não é autoridade de jurisdição nem de prazo: serve a apresentação, cadastro assistido e roteamento técnico.
5. **Vínculo de número original.** O processo pode registrar `originNumbers` — lista normalizada (CNJ de 20 dígitos no formato oficial), deduplicada e limitada a 10 entradas — com os números anteriores do mesmo processo em redistribuição ou recurso com competência delegada (art. 4º §7º, art. 5º §1º e art. 3º §§2º-3º). A busca localiza o processo por qualquer número vinculado; o formulário orienta o vínculo quando o CNJ é `delegated` (OOOO 9999) e permite limpar a lista na edição.

## 4. Invariantes

1. **Fonte única.** A tabela e o cálculo vivem em `js/core/cnj.js`; `lib/judicial/omni/contracts.mjs` apenas reexporta. Nenhum consumidor mantém cópia divergente da regra (exceções locais de transporte podem existir, mas devem citar a fonte).
2. **Sem inferência jurídica.** Grau e tribunal derivam exclusivamente do próprio número; o ATRIUM não infere competência, prazo, ciência ou ato processual a partir dele (§15/§16 do `AGENTS.md`).
3. **Nunca repetir número.** O cadastro manual recusa criar um segundo processo com o mesmo CNJ normalizado no acervo (o alerta identifica o processo existente).
4. **Dado legado preservado.** Editar um processo cujo número já estava salvo e não foi alterado não é bloqueado por DV; a validação incide sobre número novo ou alterado.
5. **Egresso e consulta.** O descritor pode compor evidência de IA e busca; a redação de PII continua sendo aplicada pelos módulos de política (ver `specs/legal-intelligence.md` e `specs/security-boundaries.md`).
6. **Aliases de transporte.** A resolução de alias DataJud por segmento é detalhe de transporte em `collector/adapters/datajud.mjs` e deve espelhar a tabela verificada ao vivo: TRE por UF (DF usa `tre-df`; a wiki oficial lista `tre-dft`, que responde `index_not_found`), militar estadual por `tjm<uf>`, CJF/TNU por `cjf`; STF, CNJ, CSJT e circunscrições militares não têm endpoint público.

## 5. Fora de escopo

- Vínculo automático entre processos (criar/atualizar o processo de origem a partir do vínculo) e consulta oficial pelo número antigo no tribunal: o ATRIUM apenas registra e indexa `originNumbers`; nenhuma consulta externa é disparada pelo vínculo.
- Formato curto dos anexos (`100-15.2008.821`) não é usado para armazenamento.
- Validação bloqueante global de fixtures históricas: a suíte sintética pode conter números com DV meramente ilustrativo fora do fluxo de cadastro manual.
