# ATRIUM Senda 3.1.3 — 14/11/2026

O primeiro acesso deixa de pedir token de ativação. Quem instala o ATRIUM cria a conta de administrador direto.

## O que muda

- **Sem token no primeiro acesso.** O campo "Token de ativação" saiu da tela de criação do administrador. Não há mais segredo para digitar.
- **O aplicativo desktop não gera mais esse segredo.** O `SETUP_BOOTSTRAP_TOKEN` deixou de ser criado no primeiro boot e de ser guardado em `%APPDATA%\ATRIUM\.env`.
- **Instalação manual e aplicativo desktop iguais.** Quem rodava por `pnpm start` nunca precisou de token; agora o aplicativo desktop também não precisa.
- **Configuração cloud simplificada.** A lista de variáveis obrigatórias em produção perdeu o token de bootstrap, e o painel administrativo deixou de reportar o status desse segredo.

## O que continua protegido

A trava não era o que segurava a instalação. Estas proteções seguem intactas:

- A criação do administrador só acontece **uma vez**: depois de concluída, uma nova tentativa volta com erro 409.
- O segundo fator (TOTP) continua disponível e configurável por usuário.
- Senhas continuam derivadas com Scrypt e guardadas com hash.
- O limite de tentativas por IP continua valendo no caminho do setup.
- Sessões, cookies `HttpOnly`, CSRF e o cofre AES-256-GCM não foram tocados.

O risco que a trava cobria era estreito: alguém com acesso ao computador, antes do primeiro acesso, criar a conta de administrador no lugar do dono. Em troca, a trava impedia toda pessoa que baixasse o instalador de criar a própria conta.

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
- `node tests/deployment.mjs` — setup sem token retorna 200; setup repetido retorna 409.
- `node tests/ui_v2_auth_shell.mjs` — 193/193 asserções, 16 capturas em light e dark.
- `node tests/ui_v2_auth_topbar.mjs` — 8 cenários aprovados em 390×844, 390×500, 1280×800 e 1440×900.
- `node tests/secret-hygiene.mjs` e `node tests/beta_environment_flags.mjs` — aprovados.
- `node scripts/asset-version-manifest.mjs` — 166 referências versionadas, nenhuma alteração sem rebumpe.
