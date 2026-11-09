# Ferramentas

Legal MCP (alternativa ao Jusbrasil) expõe 20 ferramentas (todas somente leitura).

### 1. `djen_search_comunicacoes`
**Input**: `numero_oab` (opcional), `uf_oab` (opcional), `nome_advogado` (opcional), `nome_parte` (opcional), `numero_processo` (opcional), `sigla_tribunal` (opcional), `data_inicio` (opcional), `data_fim` (opcional), `meio` (opcional), `texto` (opcional), `pagina` (opcional), `itens_por_pagina` (opcional)

Busca publicações/intimações no Diário de Justiça Eletrônico Nacional (DJEN) por OAB, nome de advogado, número de processo, tribunal e data.

### 2. `djen_processos_por_parte`
**Input**: `nome_parte`, `sigla_tribunal` (opcional), `data_inicio` (opcional), `data_fim` (opcional), `itens_por_pagina` (opcional), `pagina` (opcional)

DESCOBERTA por NOME de parte (grátis, sem captcha): busca o DJEN por quem figura no processo e agrupa por número — devolve a lista de processos da pessoa/empresa, com partes e tribunal.

### 3. `djen_get_certidao`
**Input**: `hash`

Retorna a URL da certidão (PDF) de uma comunicação do DJEN pelo seu hash (campo `hash` retornado na busca).

### 4. `processos_buscar_por_nome`
**Input**: `nome`, `platforms` (opcional), `tribunais` (opcional), `max_results` (opcional)

DESCOBERTA: busca processos pelo NOME de uma parte (pessoa ou empresa) raspando os portais públicos dos tribunais (ESAJ/PJe/eproc/Projudi) — o gap que datajud (só por número) e djen (OAB/advogado) não cobrem.

### 5. `processos_buscar_por_documento`
**Input**: `documento`, `platforms` (opcional), `tribunais` (opcional), `max_results` (opcional)

DESCOBERTA por CPF ou CNPJ. O serviço resolve o documento em nome(s) (CNPJ→razão social/sócios; CPF→nome) e então busca os processos por nome nos portais. ASSÍNCRONO: retorna { job_id }; faça o polling com processos_g…

### 6. `processos_get_resultado`
**Input**: `job_id`, `job_ids` (opcional)

Polling de um job de busca (de processos_buscar_por_nome/documento).

### 7. `cnpj_consultar`
**Input**: `cnpj`

Consulta cadastral de um CNPJ (grátis): razão social, nome fantasia, situação cadastral, CNAE principal, porte, município/UF e SÓCIOS (QSA).

### 8. `cnpj_processos`
**Input**: `cnpj`, `incluir_socios` (opcional)

DESCOBERTA por CNPJ: resolve o CNPJ em razão social (e sócios) e busca os processos por NOME no Diário (DJEN) — grátis, com número de processo completo.

### 9. `cpf_validar`
**Input**: `cpf`

Valida os dígitos verificadores de um CPF (mod 11) e informa se há broker de identidade disponível.

### 10. `cpf_processos`
**Input**: `cpf`, `nome` (opcional)

DESCOBERTA por CPF: busca os processos da pessoa por NOME no Diário (DJEN), grátis.

### 11. `transparencia_sancoes`
**Input**: `cpf_cnpj`

Consulta sanções de uma pessoa ou empresa por CPF/CNPJ no Portal da Transparência (consolida CEIS — inidôneas/suspensas, CNEP — empresas punidas, e CEPIM — entidades impedidas).

### 12. `transparencia_pep`
**Input**: `cpf`

Verifica se um CPF é de Pessoa Exposta Politicamente (PEP) e retorna função/órgão/período.

### 13. `querido_diario_buscar`
**Input**: `termo`, `territory_ids` (opcional), `data_inicio` (opcional), `data_fim` (opcional), `size` (opcional)

Busca em diários oficiais MUNICIPAIS (milhares de prefeituras) por termo/nome — útil pra menções fora do Judiciário: licitações, nomeações, contratos, sanções municipais.

### 14. `jurisprudencia_buscar`
**Input**: `termo`, `tipo` (opcional), `max` (opcional)

Busca jurisprudência (acórdãos, súmulas, OJs) no acervo público LexML por termo/tese — cobre tribunais superiores e demais.

### 15. `jurisprudencia_sumulas`
**Input**: `termo`, `max` (opcional)

Busca SÚMULAS (incluindo vinculantes) por termo no acervo LexML.

### 16. `legal_dossie`
**Input**: `nome` (opcional), `cnpj` (opcional), `cpf` (opcional), `nome_titular` (opcional), `numero_processo` (opcional), `incluir_andamento` (opcional), `incluir_socios` (opcional), `incluir_sancoes` (opcional), `incluir_mencoes_municipais` (opcional), `max_processos` (opcional), `sigla_tribunal` (opcional)

Raio-X jurídico de uma pessoa ou empresa: descobre os processos e (opcional) o andamento, num relatório consolidado.

### 17. `legal_monitorar`
**Input**: `numero_processo` (opcional), `nome` (opcional), `cnpj` (opcional), `oab` (opcional), `uf` (opcional), `sigla_tribunal` (opcional), `intervalo_horas` (opcional), `label` (opcional)

Cria um monitoramento: avisa quando houver NOVIDADE — nova movimentação (numero_processo), novo processo de uma pessoa/empresa (nome/cnpj), ou nova publicação/intimação de uma OAB (oab+uf).

### 18. `legal_listar_monitoramentos`
**Input**: nenhum input

Lista os monitoramentos ativos do workspace.

### 19. `legal_remover_monitoramento`
**Input**: `watch_id`, `watch_ids` (opcional)

Remove (desativa) um monitoramento pelo seu id (`watch_id`).

### 20. `legal_checar_novidades`
**Input**: `watch_id` (opcional), `watch_ids` (opcional)

Checa AGORA se há novidade nos monitoramentos (sem esperar o ciclo automático).

## Prompts de exemplo

```
Monte um raio-X dos processos de Fulano de Tal
Tem intimação para a OAB 21076/SP nos últimos 7 dias?
Investigue a empresa pelo CNPJ 33.000.167/0001-01 (processos e sanções)
Quais processos a empresa X tem no TJSP?
```
