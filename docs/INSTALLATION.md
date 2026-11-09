# ATRIUM — instalação e ambiente

O ATRIUM Senda é uma edição **open-source e self-hosted**: o escritório instala no próprio computador (ou servidor) e opera com os seus dados. Nada é obrigatoriamente enviado a terceiros. Quem preferir uma operação hospedada e gerenciada encontra o mesmo produto em [atrium.adv.br](https://atrium.adv.br), fora deste repositório.

## Instalação (usuários)

### Aplicativo desktop (Windows)

Baixe o instalador `ATRIUM_Setup_3.0.0_x64.exe` em [releases](https://github.com/ricarossetto/Atrium-Senda/releases), confira o SHA-256 (`SHA256SUMS.txt`) e execute. O aplicativo abre o próprio servidor local; nenhum dado sai da máquina. Os dados ficam em `%APPDATA%\ATRIUM\data` e os logs, em `%APPDATA%\ATRIUM\logs`.

### Instalação manual (Node.js 24+)

```bash
git clone https://github.com/ricarossetto/Atrium-Senda.git
cd Atrium-Senda
pnpm install --frozen-lockfile
pnpm exec playwright install chromium   # somente para sessões assistidas de coleta judicial
pnpm start
```

Abra `http://127.0.0.1:4173` e siga o primeiro uso (administrador do escritório, verificação em duas etapas, OAB opcional). O `ATRIUM.bat --doctor` diagnostica o ambiente sem alterar dados.

## Primeiro acesso

Crie a conta como administrador no primeiro uso ou aceite o convite do escritório. Configure autenticação em duas etapas conforme a tela e guarde os códigos de recuperação. A administração do escritório resolve backups, permissões e credenciais judiciais pelas telas autenticadas do produto.

A1 fica no cofre cifrado do workspace, no computador do escritório. Portais judiciais podem exigir certificado A1, PJeOffice, TOTP ou ação humana. Integrações judiciais são somente leitura e nunca produzem ciência, assinatura ou protocolo.

## Operação e dados

O repositório preserva `server.mjs`, `collector/`, `lib/judicial/`, Playwright e scripts de diagnóstico. Use Node.js >=24 e o pnpm fixado em `package.json`:

```powershell
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check
```

`pnpm start` executa o servidor. Testes HTTP usam `tests/helpers.mjs` e diretórios temporários; a suíte A1 completa só vale em execução local explícita no Windows, sem certificado real.

Não copie `data/`, `.env`, PFX, perfis judiciais, chaves nem bases de produção para fixtures. `KELLER_DATA_DIR`/`JURISFLOW_DATA_DIR` são contratos de compatibilidade e operação do backend, não preferências do usuário final.

## Backup e restauração

O administrador pode exportar um backup cifrado (`.atrium-backup`) pela tela de administração; a restauração valida formato, checksum, schema e migrações, e cria um snapshot de segurança antes da troca atômica. Nunca restaure arquivo de origem desconhecida. Veja o [manual](USER_MANUAL.md).

## Diagnóstico e recuperação

Para falha de login ou integração, observe o status exibido na UI e o diagnóstico sanitizado na tela de administração. Backup/restore exigem a rota oficial autenticada e step-up; nunca manipule SQLite, cofres ou estado real diretamente. Para dados de teste descartáveis, use apenas o diretório temporário dos helpers de teste.

Para dúvidas do usuário, consulte o [manual](USER_MANUAL.md) e as [especificações](../specs/README.md). Para autenticação e segurança, consulte [Limites de segurança](../specs/security-boundaries.md).
