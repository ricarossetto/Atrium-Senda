# ATRIUM — primeiros 10 minutos

Este roteiro é para quem recebeu o ATRIUM para testar no próprio computador. Não é necessário conhecer programação.

## 1. Abrir o ATRIUM

1. Baixe e extraia o ZIP da versão recebida.
2. Abra a pasta extraída e dê duplo clique em `ATRIUM.bat`.
3. Se o Windows informar que o Node.js está ausente, aceite a instalação oficial oferecida pelo inicializador.
4. Aguarde o navegador abrir em `http://127.0.0.1:4173` e mantenha a janela do ATRIUM aberta durante o uso.

Na primeira execução, a preparação pode demorar alguns minutos porque o inicializador instala os componentes do navegador usados pelo sistema. Nas próximas aberturas, o processo é mais rápido.

## 2. Criar o acesso

A configuração inicial acontece em etapas curtas:

1. informe nome, e-mail profissional, usuário e uma senha forte;
2. se for advogado, informe número e UF da OAB;
3. marque **Ativar monitoramento automático** somente se quiser que o ATRIUM consulte as fontes disponíveis ao entrar;
4. configure a verificação em duas etapas ou escolha configurá-la mais tarde;
5. se forem exibidos códigos de recuperação, guarde-os fora da pasta do ATRIUM.

Quem não informar OAB pode continuar normalmente e configurar o monitoramento depois em **Fontes monitoradas**. O botão da segunda etapa deixa explícito se o acesso seguirá com ou sem monitoramento.

## 3. Entender a primeira sincronização

Quando o monitoramento é ativado, o ATRIUM inicia a primeira busca depois da entrada. A barra superior mostra o andamento. O resultado depende das fontes disponíveis e das conexões configuradas no computador.

- **Publicações** abre em **Não tratadas** e mostra inicialmente os dois dias mais recentes.
- O histórico continua preservado e pode ser escolhido no filtro de período.
- Processos encontrados por uma fonte são incorporados sem apagar os registros locais preenchidos pelo usuário.
- Uma conexão autenticada de tribunal pode exigir credencial, TOTP, certificado, PJeOffice ou intervenção no portal.
- Consulta, descoberta e download são operações de leitura. O ATRIUM não dá ciência, protocola petição ou confirma prazo automaticamente.

## 4. Fazer um teste simples

Use dados fictícios ou autorizados pelo escritório.

1. Abra **Contatos** e cadastre um contato.
2. Abra **Processos e casos** e cadastre um processo pelo número CNJ.
3. Abra o painel lateral do processo e use **Criar tarefa**.
4. Vá a **Gestão de tarefas** e alterne entre **Lista** e **Kanban**.
5. Abra **Publicações**, escolha uma ocorrência e confira o teor integral antes de criar qualquer tarefa.
6. Abra **Configurações → Sistema** e gere um backup cifrado antes de inserir uma base maior.

Tarefas criadas a partir de publicação começam sem prazo fatal. A data deve ser informada somente após conferência profissional.

## 5. Se algo não abrir

Feche a janela do ATRIUM, dê duplo clique em `ATRIUM.bat` novamente e aguarde o navegador. Para um diagnóstico que não altera os dados, abra o Prompt de Comando na pasta do programa e execute:

```bat
ATRIUM.bat --doctor
```

O aviso de que o coletor TJRS local está indisponível significa que os recursos dependentes desse componente não puderam consultar o tribunal. Os dados já atuais continuam preservados. Consulte o [manual de instalação](INSTALLATION.md) para diagnóstico e atualização.

Nunca envie em feedback público senha, QR code, código de recuperação, certificado, chave processual, nomes de clientes ou documentos do escritório.
