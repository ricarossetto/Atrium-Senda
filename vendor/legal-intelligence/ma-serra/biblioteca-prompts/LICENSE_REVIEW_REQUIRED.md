# biblioteca-prompts-juridicos — LICENSE_REVIEW_REQUIRED

Fonte: `https://github.com/ma-serra/biblioteca-prompts-juridicos`
Commit verificado: `d181c200e4a2dfa701b23e21f6ec9d18e43a5ada`

## Situação

Não existe `LICENSE`, `COPYING` ou `NOTICE` no repositório. O `package.json` não declara
licença. Pelo regime padrão de direito autoral, **não há autorização** para copiar,
modificar, adaptar ou redistribuir o conteúdo (incluindo os 41 prompts de `src/data/prompts.ts`).

## Decisão do ATRIUM

Conforme a política da missão:

- Nenhum texto de prompt foi copiado para este vendor.
- Apenas a **taxonomia genérica** (categorias, arquiteturas, modos de uso e níveis de
  raciocínio) foi registrada em `taxonomy.json`, para que o adapter
  (`lib/legal-intelligence/adapters/prompt-library-adapter.mjs`) esteja pronto para
  importação futura caso o autor conceda licença.
- O adapter permanece desativado (`imported: false`) até autorização documentada.

## Para habilitar no futuro

1. Obter autorização escrita do autor (Créditos no README upstream: Carlos Lima) ou licença
   compatível anexada ao repositório.
2. Registrar a licença em `vendor/legal-intelligence/UPSTREAM.json`.
3. Exportar os prompts para `vendor/legal-intelligence/ma-serra/biblioteca-prompts/prompts.json`
   no formato do adapter e rodar `node tests/skills_catalog_generation.mjs`/testes da camada.
