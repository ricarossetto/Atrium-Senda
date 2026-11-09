# EPROC NATIONAL COVERAGE & ARCHITECTURE REPORT (WAVE B AUDIT)

## 1. Visão Geral da Arquitetura Nacional Eproc (ATRIUM Judicial Connectivity)

O **ATRIUM** adota uma arquitetura orientada a perfis (Profile-Driven Architecture) para conexão com a família **eproc** em âmbito nacional, substituindo múltiplos scrapers isolados por um **núcleo comum reutilizável (Core Eproc)** e um **Registro Central Oficial (`EPROC_PORTALS`)**.

```
                    ATRIUM JUDICIAL CONNECTIVITY
                                 │
                     EprocReadOnlyAdapter (Core)
                                 │
                    Eproc Portal Registry (21 Portais)
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
  Justiça Federal         Justiça Estadual        Justiça Militar
  • TRF4 (JFRS,SC,PR,2G)  • TJRS (1G, 2G)         • TJMRS (1G)
  • TRF2 (JFRJ,ES,2G)     • TJSC (1G, 2G)
  • TRF6 (JFMG, 2G)       • TJTO (1G, 2G)
                          • TJSP (1G, 2G - Parcial)
                          • TJRJ (1G - Piloto)
                          • TJMG (1G - Piloto)
                          • TJBA (1G - Piloto)
```

---

## 2. Auditoria Programática de Portais e Níveis de Evidência

A contagem programática oficial no código (`lib/judicial/eproc/portal-registry.mjs`) totaliza rigorosamente **21 portais** (`EPROC_PORTALS.length === 21`). 

### Níveis de Evidência Técnicos Rigorosos
Para assegurar integridade de engenharia, cada portal é classificado segundo seu estado real de validação:
- `REAL_READONLY_VERIFIED`: Sessão autenticada real comprovada em produção com ingestão de acervo, chave e prazos.
- `AUTH_MAPPED`: Fluxo de autenticação observado empiricamente em rede (redirecionamentos, parâmetros e endpoints de formulário/SSO mapeados).
- `ENTRYPOINT_OBSERVED`: URL e assinatura de software eproc confirmadas via requisições HTTP controladas.
- `SYNTHETIC_TESTED`: Validado contra suítes de teste de contrato e modelos de dados sanitizados.

### Tabela Oficial dos 21 Portais

| Tribunal | Portal ID | Grau | Status eproc | Auth Strategy | Estado de Evidência | URL Base Oficial |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **TRF4** | `trf4-eproc-2g` | 2G | `active` | Keycloak mTLS A1 + TOTP 2FA / PDPJ SSO | REAL_READONLY_VERIFIED | `https://eproc.trf4.jus.br/eproc2trf4/` |
| **JFRS** | `jfrs-eproc-1g` | 1G | `active` | Keycloak mTLS A1 + TOTP 2FA / PDPJ SSO | REAL_READONLY_VERIFIED | `https://eproc.jfrs.jus.br/eprocV2/` |
| **JFSC** | `jfsc-eproc-1g` | 1G | `active` | PDPJ SSO / Native Fallback (`sso=N`) | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc.jfsc.jus.br/eprocV2/` |
| **JFPR** | `jfpr-eproc-1g` | 1G | `active` | PDPJ SSO / Native Fallback (`sso=N`) | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc.jfpr.jus.br/eprocV2/` |
| **TRF2** | `trf2-eproc-2g` | 2G | `active` | Direct Web Login (`txtUsuario`/`pwdSenha`) | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc.trf2.jus.br/eproc/` |
| **JFRJ** | `jfrj-eproc-1g` | 1G | `active` | Direct Web Login (`txtUsuario`/`pwdSenha`) | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc.jfrj.jus.br/eproc/` |
| **JFES** | `jfes-eproc-1g` | 1G | `active` | Direct Web Login (`txtUsuario`/`pwdSenha`) | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc.jfes.jus.br/eproc/` |
| **TRF6** | `trf6-eproc-2g` | 2G | `active` | Direct Web Login (`txtUsuario`/`pwdSenha`) | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc2g.trf6.jus.br/eproc/` |
| **JFMG** | `jfmg-eproc-1g` | 1G | `active` | Direct Web Login (`txtUsuario`/`pwdSenha`) | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc1g.trf6.jus.br/eproc/` |
| **TJRS** | `tjrs-eproc-1g` | 1G | `active` | Keycloak mTLS A1 + TOTP 2FA | REAL_READONLY_VERIFIED | `https://eproc1g.tjrs.jus.br/eproc/` |
| **TJRS** | `tjrs-eproc-2g` | 2G | `active` | Keycloak mTLS A1 + TOTP 2FA | REAL_READONLY_VERIFIED | `https://eproc2g.tjrs.jus.br/eproc/` |
| **TJSC** | `tjsc-eproc-1g` | 1G | `active` | Direct Web Login (`txtUsuario`/`pwdSenha`) | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc1g.tjsc.jus.br/eproc/` |
| **TJSC** | `tjsc-eproc-2g` | 2G | `active` | Direct Web Login (`txtUsuario`/`pwdSenha`) | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc2g.tjsc.jus.br/eproc/` |
| **TJTO** | `tjto-eproc-1g` | 1G | `active` | Direct Web Login (`txtUsuario`/`pwdSenha`) | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc1.tjto.jus.br/eprocV2_prod_1g/` |
| **TJTO** | `tjto-eproc-2g` | 2G | `active` | Direct Web Login (`txtUsuario`/`pwdSenha`) | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc2.tjto.jus.br/eprocV2_prod_2g/` |
| **TJSP** | `tjsp-eproc-1g` | 1G | `partial` | SSO Redirect / Web Login | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc1g.tjsp.jus.br/eproc/` |
| **TJSP** | `tjsp-eproc-2g` | 2G | `partial` | SSO Redirect / Web Login | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc2g.tjsp.jus.br/eproc/` |
| **TJRJ** | `tjrj-eproc-1g` | 1G | `pilot` | SSO Redirect / Web Login | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc1g.tjrj.jus.br/eproc/` |
| **TJMG** | `tjmg-eproc-1g` | 1G | `pilot` | Direct Web Login (`txtUsuario`/`pwdSenha`) | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc1g.tjmg.jus.br/eproc/` |
| **TJBA** | `tjba-eproc-1g` | 1G | `pilot` | Direct Web Login (`txtUsuario`/`pwdSenha`) | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc1g.tjba.jus.br/eproc/` |
| **TJMRS**| `tjmrs-eproc-1g`| 1G | `active` | Direct Web Login (`txtUsuario`/`pwdSenha`) | ENTRYPOINT_OBSERVED / SYNTHETIC_TESTED | `https://eproc1g.tjmrs.jus.br/eproc/` |

**Última execução live (20/10/2026):** job manual `COMPLETED` 4/4 portais — TJRS 1G (109 processos, 6 enriquecidos, 22 prazos), TRF4 2G (14/10/2), JFRS 1G (27/3/2) e TJRS 2G (18/7/2); total 168 processos, 26 enriquecidos e 28 prazos, sem erro de portal.

---

## 3. Auditoria de Engenharia de Projetos Open Source

Para assegurar que o modelo oficial do ATRIUM não é uma extrapolação acidental do TJRS, mas reflete o modelo do eproc nacional, quatro projetos de referência pública sob licença permissiva foram examinados:

### 3.1 `trf2-jus-br/eproc-api` (Repositório Oficial do TRF2 - Licença MIT)
- **Modelo de Processo**: Estruturado em torno de `num_processo`, `id_orgao_juizo`, `magistrado`, `des_assunto`.
- **Avisos e Prazos (`usuario-username-avisos-get.sql`)**: Mapeamento direto de `data_evento`, `data_prazo_final`, `num_dias_prazo_evento`, `status_prazo` e a regra de intimação tácita de 10 dias (`adddate(pe.dth_evento, interval 10 day)` como `datalimiteintauto`, art. 5º, § 3º, Lei 11.419/2006).
- **Procuradores e Partes**: Mapeamento de `processo_parte`, `processo_parte_procurador` com `ident_principal` e OAB.

### 3.2 `ricardopera/eProc-TJSC-JFSC-webscraper` (Licença MIT)
- **Campos de Login**: `txtUsuario`, `pwdSenha`, botão `sbmEntrar`.
- **Pesquisa Rápida**: Campo `txtNumProcessoPesquisaRapida` e espera de elemento `Árvore`.
- **Visualização de Documentos**: Links de documentos (`INIC1`, `PET1`) e visualizador em `conteudoIframe`.

### 3.3 `grgbrasil/ProcAPI`
- **Modelo de Dados Canonical**: `Processo` (`numero`, `chave`, `grau`, `classe`, `orgao_julgador`, `nivel_sigilo`, `assuntos`, `vinculados`).

### 3.4 `gianluca-magnabosco/Agendador-ePROC`
- **Painel do Advogado**: `externo_controlador.php?acao=principal`.
- **Detecção de Falha de Login**: Retorno para `externo_controlador.php?acao=principal&acao_retorno=login_invalido`.
- **Download Seguro de Intimações (Sem Ciência)**: Uso de `conteudoCitacoesIntimacoes` e botão `sbmPlanilha` para exportação direta de planilhas de prazos sem disparar o gatilho de ciência processual.

---

## 4. Matriz de Reaproveitamento e Compatibilidade Conceitual

| Conceito | ATRIUM Core Atual | TRF2 eproc-api | TJSC/JFSC Scraper | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| **Processo** | `{ cnj, court, level, class, judicialUnit, judge, status, secrecyLevel }` | `processo` (`num_processo`, `des_orgao`, `magistrado`, `des_assunto`) | Capa com CNJ, Vara, Juiz, Classe | **Compatível (100%)** |
| **Login** | Adapters mTLS, Form Web e SSO | `autenticar-post.sql` / credenciais | `txtUsuario`, `pwdSenha`, `sbmEntrar` | **Compatível** |
| **Eventos** | Timeline sequencial com ISO date e documentos associados | `processo_evento` (`dth_evento`, `des_evento`) | Tabela de eventos com badges `INIC1`, `PET1` | **Compatível (100%)** |
| **Documentos** | `{ id, title, type, accessUrl, availability }` | `id_documento`, `des_documento` | Extração de anexo via iframe `conteudoIframe` | **Compatível** |
| **Intimações** | `{ id, processNumber, limitDate, daysUntil, status }` | `usuario-username-avisos-get.sql` | Extração via `sbmPlanilha` sem dar ciência | **Compatível (100%)** |
| **Prazos** | Prazos em aberto com dias até vencimento | `prazo_processo` (`data_final_prazo`) | Tabela de prazos com data limite | **Compatível (100%)** |
| **Partes** | `{ role, name, pole, documentNumber, oab }` | `processo_parte`, `processo_parte_procurador` | Autor, Réu e Advogados na capa | **Compatível (100%)** |
| **OAB** | Filtragem por procurador e extração de número OAB | Consulta por `ident_principal` / OAB | Painel vinculado ao advogado logado | **Compatível (100%)** |

---

## 5. Caracterização Empírica da 4ª Região: JFRS 1G & TRF4 2G

As sondagens e capturas realizadas nos ambientes oficiais da Justiça Federal da 4ª Região comprovaram:

1. **SSO Federado via PDPJ**:
   - `GET /eproc/` redireciona para `externo_controlador.php?acao=SSO/login`.
   - O eproc aciona o Identity Provider do PDPJ (`https://sso.cloud.pje.jus.br/auth/realms/pje/`) com `client_id=eproc-trf4`, `kc_idp_hint=trf4` e escopo `profile+openid`.
2. **Entrada Direta Nativa (`index.php?sso=N`)**:
   - O eproc da 4ª Região mantém um fallback nativo em `index.php?sso=N`.
   - O formulário nativo possui `action="index.php"`, input oculto `desligarSSO="S"`, `txtUsuario`, `pwdSenha`, botão `Certificado Digital` (`externo_controlador.php?acao=login_cert`) e `hdnAcao="login"`.
   - Credenciais inválidas disparam redirecionamento HTTP 302 para `externo_controlador.php?acao=principal&acao_retorno=login`.
3. **Consulta Pública Desativada vs Consulta por Chave**:
   - `externo_controlador.php?acao=processo_consulta_publica` exibe: `A consulta pública está desativada`.
   - A consulta externa não autenticada opera exclusivamente por **Processo + Chave de Acesso** em `externo_controlador.php?acao=processo_consulta_publica_chave/consultar` com campos `txtNumProcesso` e `txtNumChaveDocumento`.
4. **Política de Segurança Estrita: Risco de Ciência (`SCIENCE_RISK`)**:
   - Para intimações e avisos, o conector veta qualquer clique no link de abertura de aviso que acione ciência tácita ou expressa. A coleta é realizada via leitura do relatório/painel sem alteração de status.

---

## 6. Benchmarks em Fixtures Reais Sanitizadas e Evolução dos Parsers

As fixtures reais sanitizadas capturadas de processos e listas da 4ª Região foram auditadas pela suíte `tests/eproc-real-fixtures.mjs`:

| Parser | Compatibilidade Inicial | Gargalo Identificado | Ajuste no Core | Compatibilidade Final |
| :--- | :---: | :--- | :--- | :---: |
| **`panel-parser`** | 42.8% | Ordem fixa de colunas colidia com variações de tabela (ex: pesquisa OAB vs painel geral). | Detecção dinâmica de cabeçalhos (`th`) e múltiplos seletores de link (`processo_seleciona_publica`). | **100.0%** |
| **`case-parser`** | 77.8% | Inclusão de `Vara` na regex de label truncava `1ª Vara Federal` para `Federal`; autuação capturava distribuição do evento. | Suporte a caracteres ordinais (`ª`, `º`) e priorização estrita de `Data de autuação` sobre `Distribuição`. | **100.0%** |
| **`movement-parser`** | 80.0% | Documentos sem link HTML (apenas código textual como `INIC1`, `DEC2`) eram ignorados. | Detecção dinâmica de coluna `Documentos` e extração de identificadores de anexo. | **100.0%** |
| **`document-parser`** | 60.0% | Links com padrão `processo_documento` e códigos em células de tabela não eram mapeados. | Expansão de ações de documento suportadas e captura de badges de anexo. | **100.0%** |

---

## 7. Refinamento do Motor de Roteamento CNJ (`cnj-resolver.mjs`)

O motor de resolução de CNJ foi atualizado para cumprir as seguintes diretrizes:
1. **Não Presunção de Certeza (`isGuaranteed: false`)**: Todo retorno é explicitamente classificado como lista de candidatos priorizados com pontuação de confiança (`confidence`).
2. **Justificativa Transparente (`reason`)**: Cada candidato inclui uma string de diagnóstico explicando a inferência (ex: `origin_unit_0000_suggests_second_degree_court`, `origin_unit_71xx_matches_federal_subdivision_rs`, `hybrid_court_candidate_eproc_coexists_with_legacy_system`).
3. **Tribunais Híbridos (TJSP, TJRJ, TJMG, TJBA)**: Recebem confiança ponderada (`0.65`) com alerta de coexistência de acervo com sistemas legados (SAJ, DCP, PJe, Themis, Projudi).

---

## 8. Wave C: Piloto Real Autenticado JFRS 1G & TRF4 2G (Evidências Empíricas)

A Wave C completou com sucesso a autenticação controlada em produção (read-only) com credencial real autorizada de advogado na Justiça Federal da 4ª Região, eliminando qualquer dependência de simulação ou autoengano:

### 8.1 Topologia de Autenticação e mTLS Multi-Origin
- **Handshake mTLS**: Descoberto e comprovado que o Keycloak da 4ª Região utiliza o host dedicado `https://eproc-sso-certificado.trf4.jus.br/` para negociação mTLS de certificado digital ICP-Brasil (A1/A3).
- **Segundo Fator (2FA TOTP RFC 6238)**: Integrado diretamente via semente TOTP, gerando tokens temporais de 6 dígitos que são validados pelo Keycloak no input `#otp` seguido da submissão `#kc-login`.
- **Callback OIDC e Sessão Final**: Redirecionamento completo `eproc-sso-certificado.trf4.jus.br` -> `sso.cloud.pje.jus.br` -> `externo_controlador.php?acao=SSO/callback` -> `controlador.php?acao=painel_adv_listar&hash=...`.
- **Isolamento de Sessão**: Cada portal (JFRS 1G e TRF4 2G) operou em navegador isolado com cookie jars independentes (`PHPSESSID`, `AUTH_SESSION_ID`), sem qualquer compartilhamento de credenciais ou cookies entre instâncias.

### 8.2 Descoberta de Processos (`discoverCases()`)
- **JFRS 1º Grau**: Executado `acao=relatorio_processo_procurador_listar` descobrindo **28 processos judiciais ativos** pertencentes ao acervo do advogado na Seção Judiciária do RS.
- **TRF4 2º Grau**: Executado `acao=relatorio_processo_procurador_listar` descobrindo **12 processos judiciais ativos** no Tribunal Regional Federal (recursos e agravos).
- **Mapeamento Oficial**: CNJ, Classe, Polo Ativo, Polo Passivo, Localidade Judicial, Assunto, Último Evento, Data do Último Evento, Data de Autuação e Valor da Causa extraídos com 100% de consistência.

### 8.3 Consulta e Extração Read-Only de Processo Piloto
- **JFRS Piloto (`5003280-32.2026.4.04.7113`)**:
  - Unidade: 1ª Vara Federal de Bento Gonçalves (Juízo Substituto).
  - Magistrado: ANDRE AUGUSTO GIORDANI.
  - Partes: Polo Ativo com CPF mascarado, Polo Passivo (Entidade Pública), 5 Advogados constituídos com OAB.
  - Movimentos: 18 eventos sequenciados cronologicamente na `tblEventos`, sem omissões.
  - Documentos: Peças identificadas via `acao=acessar_documento&doc=...&evento=...&key=...` sem ciência processual.
- **TRF4 Piloto (`5013073-10.2024.4.04.0000`)**:
  - Órgão Julgador: Vice-Presidência do TRF4.
  - Magistrada: Desembargadora Federal VIVIAN JOSETE PANTALEÃO CAMINHA.
  - Partes: Polo Ativo, Polo Passivo (Autarquia Federal), Advogados constituídos.
  - Movimentos: 51 eventos sequenciados cronologicamente na `tblEventos`.
  - Documentos: Peça recursal identificada via `acao=acessar_documento` com chave segura.

### 8.4 Comparação JFRS (1G) × TRF4 (2G)
A compatibilidade entre o eproc de 1º Grau (JFRS) e o de 2º Grau (TRF4) foi classificada como **`IDENTICAL`**:
- Idêntico layout de tabelas de relatório e painel (`table.infraTable`).
- Idêntica estrutura de capa com IDs de elementos compartilhados (`txtClasse`, `txtCompetencia`, `txtOrgaoJulgador`, `txtMagistrado`, `txtAutuacao`, `txtSituacao`).
- Idêntica tabela de partes `#tblPartesERepresentantes` com colunas `AUTOR` e `RÉU`.
- Idêntica tabela de movimentações `#tblEventos` com colunas `[Evento, Data/Hora, Descrição, Usuário, Documentos]`.

### 8.5 Promoção de Evidência
Com a comprovação empírica de:
1. Autenticação real;
2. Painel real;
3. discoverCases real;
4. Consulta real;
5. Movements real;
6. Documents metadata real;

Os portais **`jfrs-eproc-1g`** e **`trf4-eproc-2g`** foram formalmente promovidos para **`REAL_READONLY_VERIFIED`**.


## Autenticação por conta (sem Certificado A1)

Validada live em 19/09/2026, read-only, com a conta do operador (1 tentativa por portal):

| Portal | Perfil de login | TOTP | Sessão real |
| --- | --- | --- | --- |
| `trf4-eproc-2g` | keycloak-sso | QR Eproc/TRF4 | VERIFIED |
| `jfrs-eproc-1g` | keycloak-sso | QR Eproc/TRF4 (família) | VERIFIED |
| `jfsc-eproc-1g` | keycloak-sso | QR Eproc/TRF4 (família) | VERIFIED |
| `jfpr-eproc-1g` | keycloak-sso | QR Eproc/TRF4 (família) | VERIFIED |
| `tjrs-eproc-1g` / `tjrs-eproc-2g` | keycloak-sso | QR Eproc/TJRS (1G/2G compartilham) | VERIFIED |
| `tjrj-eproc-1g` | keycloak-sso | QR Eproc/TJRJ | VERIFIED |
| `tjsc-eproc-1g/2g`, `tjsp-eproc-1g/2g` | keycloak-sso | QR próprio cadastrável | fluxo validado; credencial recusada no teste (senha divergente) |
| `trf2-eproc-2g`, `jfrj-eproc-1g`, `jfes-eproc-1g`, `trf6-eproc-2g`, `jfmg-eproc-1g`, `tjto-eproc-1g/2g`, `tjba-eproc-1g`, `tjmrs-eproc-1g`, `tjmg-eproc-1g` | native-form | QR próprio (quando houver) | formulário e submit validados; sessão refutada por senha divergente no teste |

- O TOTP é por tribunal: 1G e 2G compartilham o mesmo QR, e a família TRF4 (TRF4/JFRS/JFSC/JFPR) compartilha o vínculo regional.
- CAPTCHA nunca é contornado: o cliente detecta e encerra com `CAPTCHA_REQUIRED`.
- Submit sem sessão confirmada vira `AUTH-CREDENTIALS-INVALID`; nunca há sucesso presumido.
