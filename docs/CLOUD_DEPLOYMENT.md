# Distribuição e hospedagem do ATRIUM

A distribuição oficial está nas [releases do ATRIUM](https://github.com/ricarossetto/Atrium-Senda/releases). Publicar uma release no GitHub distribui o código e o instalador; isso não comprova a existência de um servidor de produção hospedado.

## Instalação persistente

O fluxo documentado é a [instalação local](INSTALLATION.md), com o servidor Node.js, o estado cifrado e as integrações configuradas pelo escritório. Preserve os dados e os segredos existentes durante atualizações e execute backup antes de trocar a versão.

O coletor TJRS é um serviço local separado. Sua disponibilidade deve ser verificada na máquina que executa a integração. Publicar o frontend não instala esse serviço em um provedor externo.

## Manifesto de demonstração

O arquivo `render.yaml` descreve um serviço Node em plano gratuito, com modo de nuvem e segredos gerados no provedor. Ele não configura um volume persistente. Não use essa configuração como armazenamento definitivo de dados jurídicos.

Para hospedar dados reais, configure armazenamento persistente, HTTPS, variáveis de ambiente privadas, backup e restauração, além de verificar autenticação e isolamento dos arquivos. Use o backend canônico: servir apenas HTML, JavaScript e CSS não oferece a persistência e a autenticação do ATRIUM.

## Topologia multi-escritório de baixo custo

O domínio oficial é `atrium.adv.br`. A topologia preparada pelo repositório separa:

- `app.atrium.adv.br`: frontend estático no Cloudflare Pages;
- `api.atrium.adv.br`: container Node no Railway;
- `/app/data`: volume persistente do backend, nunca filesystem efêmero.

No Cloudflare Pages, use `pnpm build:cloud-frontend`, defina `ATRIUM_API_BASE_URL=https://api.atrium.adv.br` e publique o diretório `dist`.

No Railway, implante o `Dockerfile`, crie um volume persistente montado em `/app/data` e configure:

```text
HOST=0.0.0.0
COOKIE_SECURE=true
JURISFLOW_CLOUD_MODE=true
JURISFLOW_DATA_DIR=/app/data
ATRIUM_FRONTEND_ORIGINS=https://app.atrium.adv.br,https://atrium.adv.br
AUTH_SESSION_SECRET=<48 bytes aleatórios em base64url>
AUTH_ENCRYPTION_KEY=<32 bytes aleatórios em base64>
SETUP_BOOTSTRAP_TOKEN=<token longo e aleatório>
ATRIUM_PUBLIC_SIGNUP=false
COLLECTOR_INGEST_TOKEN=<32 bytes aleatórios em base64url>
KELLER_SKIP_COLLECTOR_ENV=true
```

Mantenha `ATRIUM_PUBLIC_SIGNUP=false` durante a preparação. Troque para `true` somente quando o cadastro público de escritórios puder ser aberto; a tela de login só mostra **Criar escritório** quando essa opção estiver habilitada. Em modo cloud, o backend recusa iniciar se faltarem as chaves, o token de bootstrap, as origens exatas do frontend ou `COOKIE_SECURE=true`.

`railway.json` configura o health check público e o container. O volume ainda precisa ser criado no painel do provedor porque ele pertence à infraestrutura da conta. A chave `AUTH_ENCRYPTION_KEY` deve ser guardada fora do Git junto do procedimento de backup.

## Material privado

Não publique `.env`, diretórios de dados, certificados, chaves judiciais, sessões de navegador ou backups. A chave de criptografia deve acompanhar a recuperação dos dados por um canal privado, sem entrar no repositório ou nos arquivos da release.

## Conferência da publicação

A versão candidata deve concluir todos os jobs de GitHub Actions antes de ser promovida. A tag e a release devem apontar para o commit validado. Uma implantação externa exige, adicionalmente, conferir a URL de destino e a persistência após reinício; CI verde isoladamente não prova essa implantação.

## Pareamento do coletor por escritório

Um administrador autenticado emite o token com `POST /api/integrations/collector/pair`, protegido por CSRF. O token é exibido uma vez e sua reemissão revoga o anterior. `DELETE` na mesma rota revoga o pareamento. Configure no agente privado `ATRIUM_WORKSPACE_ID` com o identificador retornado e `COLLECTOR_INGEST_TOKEN` com o token. O agente envia ambos ao backend; trocar apenas o identificador não dá acesso a outro escritório.

Esta branch ainda não deve receber dados reais de vários escritórios: falta concluir a interface de convites/pareamento, a auditoria do sidecar e a validação em origens distintas. Nenhum serviço externo foi implantado por estes arquivos.
