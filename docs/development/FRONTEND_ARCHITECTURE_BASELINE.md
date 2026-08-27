# ATRIUM — Baseline arquitetural do frontend

## Referências

- HEAD pré-Fase 1: `43d8829ee85b1497c668458f4f8226245f2c3ea5`.
- Checkpoint imutável: `pre-modularization-beta-1`.
- Commit do checkpoint: `bab50a06ff711aeba4f88acad0b8ad6af83e6218`.

## Tamanho antes da Fase 1

| Arquivo | Linhas | Bytes |
| --- | ---: | ---: |
| `js/portal.js` | 6.038 | 342.273 |
| `css/portal.css` | 4.650 | 140.176 |
| `index.html` | 2.250 | 146.736 |
| `server.mjs` | 2.418 | 117.861 |

Os números registram os arquivos no working tree limpo do HEAD pré-Fase 1.

## Responsabilidades concentradas

- `js/portal.js`: Store, persistência, App, navegação, views, modais, onboarding, busca, integrações e compatibilidade global.
- `css/portal.css`: tokens, temas, layout, componentes e estilos específicos das views.
- `index.html`: shell e grandes estruturas de HTML pertencentes a features.
- `server.mjs`: bootstrap HTTP, arquivos estáticos, estado, segurança, integrações e endpoints de domínio.

## Direção alvo

O frontend deve evoluir incrementalmente para `js/app/`, `js/core/`, `js/components/`,
`js/views/` e `js/features/`. O backend poderá evoluir posteriormente para `lib/http/` e
`routes/`. Essa direção não exige arquivos vazios nem fragmentação artificial.

## Regra de migração incremental

Cada fase deve mover uma responsabilidade coesa, preservar comportamento, API, schema e
visual, manter wrappers legados somente quando houver consumidores e terminar com CI completo
verde. Store, App e views não são movidos na Fase 1.

Quando existir módulo responsável por um domínio, novas features grandes não devem voltar para
`js/portal.js`. O arquivo deve reduzir gradualmente para bootstrap, orquestração e compatibilidade
temporária, sem usar redução de linhas como objetivo isolado.
