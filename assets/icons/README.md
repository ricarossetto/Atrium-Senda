# ATRIUM UI icon set

O **ATRIUM Legal Icon System** é o conjunto de ícones funcionais da UI do projeto. Ele é separado dos ativos de marca (`atrium-logo.svg`, `atrium-emblem.svg` e `favicon.svg`) e usa símbolos SVG locais, com `currentColor`, caixa ótica comum e `viewBox="0 0 24 24"`.

- Fonte oficial: `atrium-ui-icons.svg`.
- Runtime externo: nenhum.
- Dependência de CDN ou pacote de ícones: nenhuma.
- Os ativos fazem parte deste projeto e podem ser auditados no próprio repositório.
- Packs e previews comerciais fornecidos durante o trabalho foram usados somente como referência conceitual. Nenhum SVG, PNG, path, screenshot ou watermark desses materiais foi incorporado.

## Registro semântico

Navegação: `dashboard`, `processes`, `publications`, `tasks`, `agenda`, `contacts`, `leads`, `reports`, `financial`, `calculations`, `documents`, `assistant`, `prompts`, `monitoring`, `integrations`, `configuration`, `importer`, `audit` e `links`.

Ações globais: `menu`, `sidebar-collapse`, `search`, `sync`, `notification`, `theme-light`, `theme-dark`, `close`, `add`, `edit`, `delete`, `download`, `upload`, `external-link`, `filter`, `more`, `chevron-left`, `chevron-right`, `chevron-down`, `check`, `warning`, `info`, `copy`, `send`, `reopen`, `maximize`, `restore` e `lock`.

Ações de campo: `eye` e `eye-off` (mostrar e ocultar senha).

Conceitos de apoio usados na interface: `court`, `certificate`, `security`, `deadline`, `office`, `email`, `disconnected` e `conflict`.

Os nomes expressam função e domínio, não geometria. Um símbolo só deve ser usado quando sua semântica corresponder ao controle ou dado apresentado.

Situações: `ready` (salvo no servidor) e a família de tratamento de publicação `status-untreated`, `status-in-review`, `status-treated` e `status-discarded`. Esses ícones indicam o tratamento no ATRIUM; nenhum deles representa ciência judicial.

Fontes: `source-portal` (portal do tribunal, como eproc e PJe), `source-database` (base pública, como o DataJud), `source-mailbox` (caixa postal oficial, como o Domicílio Eletrônico) e `bulletin` (boletim por e-mail). São ícones neutros: o nome da fonte aparece sempre em texto ao lado, e marcas de terceiros (tribunais, CNJ, gov.br) não são redesenhadas.

## Desenho (v2)

- Grade 24×24, área útil de 2 a 22, traço de 1,8 com pontas e junções arredondadas, raio 2 nas formas grandes e 1 nos detalhes.
- O traço principal usa `currentColor` e identifica o ícone sozinho, inclusive a 16 px.
- Um detalhe de domínio por ícone (etiqueta dos autos, selo do diário, areia do prazo, frontão do tribunal) usa `var(--atrium-icon-accent, currentColor)`. Sem a variável, o ícone fica monocromático. O `icons.css` define a variável como `--v2-color-gold` apenas no menu ativo, em métricas, cartões de integração, apresentação, área de envio e estados vazios.
- O sprite não contém cores fixas, gradientes nem filtros (contrato em `tests/ui_v2_iconography.mjs`). Todo traçado é original; nenhum path vem de biblioteca de ícones.
- Ícone novo entra no sprite e em `ATRIUM_ICON_NAMES` (`js/views/ui-v2/icons.js`) no mesmo commit; o teste exige que os dois coincidam.
