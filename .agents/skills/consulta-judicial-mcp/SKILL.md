---
name: consulta-judicial-mcp
description: Capacidades de consulta somente leitura às fontes judiciais oficiais do ATRIUM (DJEN/Comunica PJe e DataJud/CNJ) e às integrações gerenciadas. Use para localizar processos, publicações, movimentos e certidões antes de concluir qualquer resposta com dado processual.
---

# Consulta judicial read-only (fontes oficiais)

Use as fontes oficiais do ATRIUM para sustentar afirmações processuais; nunca as substitua por memória.

## Capacidades disponíveis

- Localizar processos pelo nome de uma parte (pessoa ou empresa), agrupando publicações por número de processo (DJEN/Comunica PJe, desde 2020).
- Buscar publicações e intimações por OAB, advogado, parte, número de processo ou termo no texto.
- Consultar metadados e movimentações de um processo pelo número CNJ (DataJud/CNJ).
- Obter a certidão oficial (PDF) de uma comunicação do DJEN.
- Integrações autenticadas eproc/PJe cobrem capa, partes, movimentos, sigilo, chave de acesso e prazos reportados pela fonte.

## Regras obrigatórias

1. Somente leitura: nunca afirmar ciência, assinar, peticionar, confirmar prazo ou praticar ato processual.
2. Ausência de resultado NÃO prova inexistência: o DJEN cobre publicações a partir de 2020 e exige origem de rede brasileira; sempre declare a limitação.
3. Busca por nome pode conter homônimos: confirme as partes no portal oficial do tribunal antes de vincular cliente/processo.
4. O número CNJ é o identificador oficial; preserve máscara e dígitos exatamente como a fonte declara.

## Ordem de prioridade das fontes

1. **DJEN/Comunica PJe** — captura de intimações, identidade e metadados.
2. **Domicílio Eletrônico (PDPJ/Jus.br)** — redundância declarada; traz o TEXTO INTEGRAL da comunicação (preenche `fullText`); prazo e ciência são apenas referência.
3. **eproc/PJe autenticados (Certificado A1)** — verdade absoluta de prazos (`deadlineSource` eproc/pje) e de sigilo/chave; nunca rebaixar a data humana já confirmada.

Conflito entre fontes: prevalece o eproc para prazos; o DJEN identifica a publicação; o Domicílio complementa o texto. Divergência relevante deve ser sinalizada ao usuário, nunca harmonizada em silêncio.
