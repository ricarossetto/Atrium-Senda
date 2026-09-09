# ATRIUM 2.1.1 — atualização de primeiro uso e monitoramento

Esta versão reúne as correções feitas durante a revisão prática do ATRIUM por um escritório de advocacia.

## Para quem está instalando

- O cadastro da conta voltou a ser uma tela própria, com nome, e-mail, usuário e senha.
- OAB, UF e ativação do monitoramento aparecem em uma segunda etapa opcional.
- O botão informa claramente se o usuário continuará sem monitoramento ou ativará a primeira busca automática.
- O novo guia [Primeiros 10 minutos](QUICK_START.md) explica instalação, primeiro acesso, sincronização e um teste simples sem exigir conhecimento técnico.

## Publicações e processos

- Publicações abre em **Não tratadas** e considera inicialmente os dois dias mais recentes, sem apagar o histórico.
- A conexão autenticada do tribunal termina a leitura do acervo antes da consolidação das demais fontes.
- O painel do processo facilita o cadastro da chave, organiza as ações sem sobreposição e explica que **Exportar dados** gera um backup técnico em JSON.
- Rótulos repetidos de DJEN e DataJud são deduplicados na importação e na apresentação.

## Limites preservados

O ATRIUM consulta fontes judiciais somente para leitura. Ele não dá ciência, protocola petições nem confirma prazos automaticamente. Tarefas geradas por publicação começam sem prazo fatal e dependem de conferência profissional.

O coletor TJRS é um componente local separado. Se ele estiver indisponível, os dados existentes permanecem preservados, mas os recursos que dependem desse coletor não conseguem atualizar o tribunal até o serviço voltar.

## Instalação e atualização

Consulte [Instalação](INSTALLATION.md). Antes de atualizar, exporte um backup cifrado e preserve `.env`, o diretório de dados e as chaves da instalação.
