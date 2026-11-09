# Vendor — Legal Intelligence (ma-serra)

Material de terceiros importado de forma **seletiva, versionada e determinística** para a
camada `lib/legal-intelligence/` do ATRIUM.

## Regras

- Nada aqui é buscado do GitHub em runtime. O conteúdo é pinado por commit em `UPSTREAM.json`.
- Nenhum `.env`, cookie, token, banco ou dado real foi importado (ver `UPSTREAM.json` → `secretsExcluded`).
- O material permanece com os bytes originais. A sanitização (emoji/símbolos decorativos),
  a normalização e o truncamento por orçamento acontecem em tempo de carregamento
  (`lib/legal-intelligence/loader.mjs`), preservando a integridade do upstream.
- Alterações nos arquivos vendorados exigem atualização deliberada de `UPSTREAM.json`.

## Estrutura

| Caminho | Origem | Licença |
| --- | --- | --- |
| `ma-serra/lex-intelligentia/` | `ma-serra/lex-intelligentia-skills` `21f5496` | MIT |
| `ma-serra/rom/` | `ma-serra/ROM-Agent` `ded6807` | `LICENSE_REVIEW_REQUIRED` (ver `LICENSES/ROM-Agent-NOTICE.md`) |
| `ma-serra/biblioteca-prompts/` | `ma-serra/biblioteca-prompts-juridicos` `d181c20` | Sem licença — somente taxonomia; prompts não copiados |
| `ma-serra/jusbrasil-mcp/` | `ma-serra/jusbrasil-mcp` `7034c54` | MIT (docs/manifests; serviço remoto proprietário) |

O projeto `ma-serra/legal-ai-advocacia-brasil` foi excluído integralmente por decisão da missão.
