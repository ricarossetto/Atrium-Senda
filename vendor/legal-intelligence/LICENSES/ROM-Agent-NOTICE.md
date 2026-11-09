# ROM-Agent — aviso de licença (LICENSE_REVIEW_REQUIRED)

Fonte: `https://github.com/ma-serra/ROM-Agent`
Commit importado: `ded68072ad4c2f3d427a3f4ddd51e6cd62d275a3`

## Situação encontrada no upstream

- `package.json` declara `"license": "MIT"`.
- `README.md` menciona licença MIT.
- `projeto-rom-completo/rom-agent/LICENSE` declara:

  > Proprietary - Rodolfo Otávio Mota Advogados Associados S/S. Uso interno do escritório.
  > Todos os direitos reservados.

- Os prompts importados atribuem autoria a Dr. Rodolfo Otávio Mota (OAB/GO 21.841).

## Decisão do ATRIUM

A importação seletiva da camada declarativa (prompts) foi executada por instrução expressa
do titular do produto ATRIUM, restrita ao repositório privado do projeto. O conteúdo:

- não é redistribuído publicamente pelo ATRIUM;
- não substitui a licença original;
- deve passar por revisão de licença antes de qualquer publicação externa ou redistribuição;
- pode ser removido de `vendor/` sem impacto em código executável de terceiros (o loader trata
  a ausência como módulo indisponível, sem quebrar o Gerador).

Esta nota existe para transparência e rastreabilidade. Ela não concede direitos adicionais.
