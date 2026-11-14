# ATRIUM Senda 3.1.2 — 14/11/2026

Correção na landing page: o endereço da versão na nuvem agora é clicável no FAQ.

## O que muda

A pergunta "O sistema funciona no Windows, Mac e Linux?" respondia com o endereço `atrium.adv.br` como texto simples. Quem lia a resposta não tinha como clicar para a versão hospedada.

Agora o endereço é um link direto, com destaque dourado e abertura em aba nova.

## Instalação

Os instaladores são republicados nesta versão. Baixe o pacote da sua plataforma na [página de releases](https://github.com/ricarossetto/Atrium-Senda/releases) e confira a soma SHA-256 no `SHA256SUMS.txt` antes de instalar.

Quem prefere a versão na nuvem pode usar `https://atrium.adv.br` sem instalar nada.

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
- `node tests/stable_release_contract.mjs` — versão 3.1.2 verificada.
- `node scripts/asset-version-manifest.mjs` — 166 referências versionadas, nenhuma alteração sem rebumpe.
