# ATRIUM Senda 3.1.1 — 14/11/2026

Correção da tela de acesso e da landing page, com promoção mais clara da versão hospedada do ATRIUM.

## O que muda

- **O botão "Conheça o Atrium" não quebra mais o aplicativo.** Ele apontava para `/discover/`, rota que o servidor não atende e que devolvia erro ao navegador. Na tela de acesso, o botão agora se chama "Versão na nuvem" e abre `https://atrium.adv.br` em uma aba nova.
- **Promoção da versão na nuvem em três pontos da interface.** A tela de acesso ganhou um bloco com o botão "Conhecer a versão na nuvem"; a navegação da landing page ganhou o link "Versão na nuvem"; e o banner final ganhou a chamada "Ver planos na nuvem", ao lado do cadastro local.
- **A lista de frases de segurança saiu da tela de acesso.** O espaço da coluna esquerda agora é ocupado pela promoção da versão na nuvem.
- **O botão "Ver planos" do rodapé do cartão de acesso** leva aos planos da versão hospedada.
- **Navegação da landing page em uma linha.** Os links deixaram de quebrar em duas linhas, e os itens menos usados saem progressivamente em telas estreitas, sem espremer o botão de acesso.

## Instalação

Os instaladores da 3.1.0 continuam valendo: esta versão muda apenas a interface e não traz artefato empacotado novo. Quem prefere a versão na nuvem pode usar `https://atrium.adv.br` sem instalar nada.

Para atualizar a edição local a partir do código:

```bash
git pull
pnpm install --frozen-lockfile
pnpm start
```

## Verificação

- `node scripts/check-syntax.mjs` — 1096 arquivos JS/MJS aprovados.
- `node tests/ui_v2_auth_shell.mjs` — 193/193 asserções, 16 capturas em light e dark.
- `node tests/ui_v2_auth_topbar.mjs` — 8 cenários aprovados em 390×844, 390×500, 1280×800 e 1440×900.
- `node scripts/asset-version-manifest.mjs` — 166 referências versionadas, nenhuma alteração sem rebumpe.
