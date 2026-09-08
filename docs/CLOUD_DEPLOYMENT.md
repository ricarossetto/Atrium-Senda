# Distribuição e hospedagem do ATRIUM

A distribuição oficial está nas [releases do ATRIUM](https://github.com/ricarossetto/Atrium-Senda/releases). Publicar uma release no GitHub distribui o código e o instalador; isso não comprova a existência de um servidor de produção hospedado.

## Instalação persistente

O fluxo documentado é a [instalação local](INSTALLATION.md), com o servidor Node.js, o estado cifrado e as integrações configuradas pelo escritório. Preserve os dados e os segredos existentes durante atualizações e execute backup antes de trocar a versão.

O coletor TJRS é um serviço local separado. Sua disponibilidade deve ser verificada na máquina que executa a integração. Publicar o frontend não instala esse serviço em um provedor externo.

## Manifesto de demonstração

O arquivo `render.yaml` descreve um serviço Node em plano gratuito, com modo de nuvem e segredos gerados no provedor. Ele não configura um volume persistente. Não use essa configuração como armazenamento definitivo de dados jurídicos.

Para hospedar dados reais, configure armazenamento persistente, HTTPS, variáveis de ambiente privadas, backup e restauração, além de verificar autenticação e isolamento dos arquivos. Use o backend canônico: servir apenas HTML, JavaScript e CSS não oferece a persistência e a autenticação do ATRIUM.

## Material privado

Não publique `.env`, diretórios de dados, certificados, chaves judiciais, sessões de navegador ou backups. A chave de criptografia deve acompanhar a recuperação dos dados por um canal privado, sem entrar no repositório ou nos arquivos da release.

## Conferência da publicação

A versão candidata deve concluir todos os jobs de GitHub Actions antes de ser promovida. A tag e a release devem apontar para o commit validado. Uma implantação externa exige, adicionalmente, conferir a URL de destino e a persistência após reinício; CI verde isoladamente não prova essa implantação.
