# Instalação do ATRIUM 2.0.0

Este guia atende tanto quem deseja apenas abrir o ATRIUM no Windows quanto quem administra uma instalação manual. Leia também o [manual do usuário](USER_MANUAL.md) e o [modelo de segurança](../SECURITY.md).

## 1. Requisitos do sistema

- Windows 10/11 para o fluxo de um clique e integrações locais com certificado/PJeOffice.
- Node.js 24 ou superior.
- Corepack disponível no `PATH`.
- Conexão com a internet na primeira instalação, para dependências e Chromium.
- Espaço para `node_modules`, Chromium, dados e documentos do escritório.

O ATRIUM fixa pnpm 11.19.0 pelo campo `packageManager` e pelo lockfile do projeto. Linux e macOS podem usar a instalação manual, mas o job A1 oficial é validado no Windows.

## 2. Instalação de um clique no Windows

1. Abra a [release v2.0.0](https://github.com/ricarossetto/Atrium-Senda/releases/tag/v2.0.0).
2. Baixe **Source code (zip)** e extraia todo o conteúdo.
3. Abra a pasta extraída e dê duplo clique em `ATRIUM.bat`.
4. Se o Node.js não existir e o `winget` estiver disponível, confirme a instalação do pacote oficial `OpenJS.NodeJS.LTS`. O inicializador não baixa executáveis de endereços arbitrários.
5. Aguarde a preparação das dependências e do Chromium.
6. Quando `/api/auth/status` responder, o navegador padrão abrirá em `http://127.0.0.1:4173`.

O inicializador resolve a própria pasta, inclusive quando o caminho contém espaços. Ele usa o lockfile congelado, preserva `.env` e `data/`, inicia somente `server.mjs` e não cria um collector paralelo.

Comandos de apoio:

```bat
ATRIUM.bat --doctor
ATRIUM.bat --install-only
```

`--doctor` apenas verifica ambiente, arquivos, Chromium e porta. `--install-only` prepara dependências e Chromium, mas não inicia o servidor. O arquivo histórico `iniciar-atrium.bat` continua funcionando como wrapper.

## 3. Primeira inicialização

Na primeira execução, o backend cria somente os segredos locais ausentes e os acrescenta ao `.env`. Ele não substitui valores já existentes. Depois, o navegador mostra o cadastro do primeiro administrador e a configuração de TOTP quando exigida pelo fluxo.

Mantenha a janela do ATRIUM aberta. `Ctrl+C` encerra o servidor. Não abra `server.mjs` e `collector/agent.mjs` separadamente: o servidor já é o runtime canônico e coordena as integrações necessárias.

## 4. Primeiro administrador

Informe nome, usuário, e-mail e senha forte. Conclua o segundo fator conforme a tela. Em ambiente publicado, defina previamente `SETUP_BOOTSTRAP_TOKEN` e mantenha-o fora de mensagens, screenshots e logs.

Nunca compartilhe segredo TOTP, QR, código de recuperação ou cookie de sessão.

## 5. Diretório de dados

O padrão é:

```text
<pasta-do-atrium>\data
```

Para separar os dados do código, defina um caminho absoluto antes de iniciar:

```env
JURISFLOW_DATA_DIR=D:\ATRIUM-DADOS
```

`KELLER_DATA_DIR` existe apenas para compatibilidade legada. Novas instalações devem usar `JURISFLOW_DATA_DIR`. Garanta acesso de leitura/gravação somente ao usuário que executa o ATRIUM.

## 6. Arquivos de configuração

- `.env`: variáveis locais e segredos do backend; ignorado pelo Git.
- `.env.example`: modelo público sem credenciais.
- `.env.collector`: compatibilidade e configuração judicial local; privado.
- `collector/portals.json`: configuração local quando explicitamente criada; use o exemplo versionado como referência.
- `data/`: estado cifrado, runtime derivado, documentos, backups e recuperação.

Nunca envie `.env`, `.env.collector`, `data/`, PFX ou perfis de portal ao GitHub.

## 7. Geração automática de segredos locais

Quando `AUTH_SESSION_SECRET`, `AUTH_ENCRYPTION_KEY` ou `COLLECTOR_INGEST_TOKEN` estão ausentes ou mantêm um placeholder reconhecido, `server.mjs` gera valores criptograficamente aleatórios e os anexa ao `.env`. Valores válidos existentes não são sobrescritos.

Também é possível gerar um conjunto para configuração administrada:

```powershell
corepack pnpm setup:keys
```

Guarde `AUTH_ENCRYPTION_KEY` fora do computador: sem a mesma chave, backups e estado cifrados não podem ser descriptografados.

## 8. Google Gemini opcional

Configure a chave pela interface administrativa do Assistente. A chave segue para o backend e não integra o Store jurídico do navegador. Sem chave, a integração fica não configurada. Nunca coloque uma chave real em issue, fixture, log ou screenshot.

## 9. SMTP opcional

Configure SMTP na área de integrações, com usuário autorizado. Use **Testar conexão** antes de qualquer envio. O envio de publicação ou boletim é sempre manual; não existe disparo automático de e-mail.

## 10. Integrações judiciais

DJEN e DataJud usam consulta oficial de leitura. Portais podem operar em sessão interativa ou conectividade gerenciada, com isolamento por portal, backoff e pausa quando houver ação humana. Consulte [Conectividade gerenciada](judicial/MANAGED_CONNECTIVITY.md).

## 11. A1, PJeOffice e TOTP

1. Abra **Sistema → Integrações → Cobertura judicial**.
2. Carregue o PFX somente na superfície local e informe a senha quando solicitado.
3. Execute o sandbox A1 e confirme validade/acessibilidade.
4. Verifique o PJeOffice quando o portal depender dele.
5. Vincule TOTP apenas ao portal correspondente.
6. Use **Autenticar no portal** ou a sessão assistida quando disponível.
7. Conclua manualmente login, consentimento, TOTP ou CAPTCHA exigidos.

Certificado válido não significa sessão de portal autenticada. Nunca faça commit de `.pfx`, `.p12`, `.pem`, chave privada, senha, QR ou segredo TOTP. Leia [A1 Sandbox](judicial/A1_SANDBOX.md), [PJe](judicial/PJE.md) e [TOTP](judicial/TOTP.md).

## 12. Provedores cadastrais

BrasilAPI atende CNPJ, CEP e bancos; ViaCEP é fallback de CEP. CPF recebe validação estrutural local, sem busca externa de identidade por padrão. Consultas usam endpoints autenticados do ATRIUM, allowlist, timeout, rate limit, cache e circuit breaker. A aplicação dos dados encontrados é seletiva e supervisionada.

## 13. Instalação manual no terminal

```powershell
git clone https://github.com/ricarossetto/Atrium-Senda.git
Set-Location Atrium-Senda
corepack --version
corepack pnpm --version
corepack pnpm install --frozen-lockfile
corepack pnpm exec playwright install chromium
corepack pnpm start
```

Abra `http://127.0.0.1:4173`.

## 14. Docker

O Dockerfile atual usa Node 24, pnpm 11.19.0, lockfile congelado e usuário sem privilégios. Docker é indicado para administração avançada e opera em `JURISFLOW_CLOUD_MODE=true`; recursos locais de Windows/A1/PJeOffice permanecem no dispositivo seguro.

Antes de `docker compose up --build`, crie um `.env` privado com valores estáveis e fortes para:

```env
AUTH_SESSION_SECRET=<valor-aleatorio-longo>
AUTH_ENCRYPTION_KEY=<32-bytes-em-base64>
COLLECTOR_INGEST_TOKEN=<token-aleatorio-longo>
COOKIE_SECURE=false
```

Em exposição HTTPS real, use proxy reverso confiável e `COOKIE_SECURE=true`. O volume `atrium-data` mantém os dados; segredos devem permanecer estáveis fora da imagem.

## 15. Atualização

1. Exporte um `.atrium-backup` e copie o diretório de dados.
2. Pare o servidor.
3. Preserve `.env`, `.env.collector` e o diretório definido em `JURISFLOW_DATA_DIR`.
4. Extraia a nova versão em outra pasta ou atualize o clone com Git.
5. Copie apenas a configuração privada necessária ou mantenha o diretório externo.
6. Execute `ATRIUM.bat --install-only` e depois `ATRIUM.bat`.
7. Confira o diagnóstico e os dados antes de retomar o uso.

Não copie `node_modules` entre versões.

## 16. Backup antes de atualizar

Use a exportação administrativa `.atrium-backup`, guarde a chave de criptografia e faça cópia do diretório de dados com o ATRIUM parado. Um backup sem a chave correspondente não é recuperável.

## 17. Desinstalação

Pare o servidor e remova a pasta do código. Remova `node_modules` e o Chromium apenas se nenhum outro projeto depender deles. Exclua o diretório de dados **somente** depois de confirmar backups recuperáveis. O ATRIUM não apaga dados ao ser desinstalado.

## 18. Solução de problemas

Comece por:

```bat
ATRIUM.bat --doctor
```

Depois confira a tela **Configurações → Sistema** e exporte o relatório anonimizado. Não cole segredos ou dados jurídicos em tickets públicos.

## 19. Conflito na porta 4173

Se o doctor disser que o ATRIUM já responde, o launcher apenas abre o navegador. Se outro serviço ocupar a porta, encerre-o ou faça execução manual com outra porta:

```powershell
$env:PORT = '4174'
corepack pnpm start
```

O launcher de um clique usa 4173 intencionalmente.

## 20. Problemas com Node, Corepack ou pnpm

- Confirme `node --version` (24+).
- Confirme `corepack --version`.
- Confirme `corepack pnpm --version` (11.19.0 no projeto).
- Feche e reabra o terminal depois de instalar Node.
- Use somente a distribuição oficial em [nodejs.org](https://nodejs.org/) ou `OpenJS.NodeJS.LTS` pelo winget.
- Não use `npm install` no projeto nem substitua o lockfile.

## 21. Chromium e Playwright

Se o Chromium estiver ausente:

```powershell
corepack pnpm exec playwright install chromium
```

Proxy, antivírus ou falta de espaço podem impedir o download. Não aponte o ATRIUM para um executável desconhecido.

## 22. Recuperação de dados

Se o estado estiver em `RECOVERY_REQUIRED` ou o runtime tiver sido quarentenado, não apague arquivos. Copie o diretório de dados, preserve `.env` e use o diagnóstico. Restaure somente um `.atrium-backup` confiável e cifrado com a chave correspondente. O runtime derivado pode ser reconstruído explicitamente; o Store canônico não deve ser substituído por arquivos derivados.

## 23. Diagnóstico seguro

O relatório administrativo anonimizado pode incluir versão, plataforma, status, contagens e saúde das integrações. Antes de compartilhar, revise o arquivo. Remova nomes, números processuais, corpos de publicação, e-mails, tokens, caminhos pessoais e qualquer conteúdo confidencial. Nunca anexe PFX, `.env`, TOTP, cookies, chaves ou a pasta `data/`.
