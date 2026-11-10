# ATRIUM — primeiros 10 minutos

O ATRIUM Senda roda no computador do escritório (ou em um servidor próprio). As decisões jurídicas e os atos processuais permanecem humanos.

## 1. Instalar e abrir o ATRIUM

No Windows, baixe o instalador `ATRIUM_Setup_3.0.2_x64.exe` em [releases](https://github.com/ricarossetto/Atrium-Senda/releases), verifique a soma SHA-256 (`SHA256SUMS.txt`) e execute. Em outros sistemas, siga a [instalação manual](INSTALLATION.md).

Abra o aplicativo e crie a conta do administrador do escritório. Configure o segundo fator quando solicitado e guarde os códigos de recuperação fora do navegador.

## 2. Configurar o escritório

1. Informe a identidade do escritório em **Configurações**.
2. Informe OAB e UF se for advogado e escolha explicitamente se deseja monitoramento.
3. Cadastre a equipe e revise as preferências de notificações.
4. Configure somente as credenciais judiciais solicitadas pela área protegida de **Integrações**.

Credenciais, certificado A1 e TOTP permanecem no cofre cifrado do workspace, no computador do escritório. Portais que recusam acesso ou exigem autenticação humana declaram isso; nunca declaram sucesso sem evidência do portal.

## 3. Conferir a primeira sincronização

A primeira captura depende da configuração aceita no onboarding. Ciclos posteriores rodam em segundo plano no servidor ou pelo botão manual; recarregar a página não inicia coleta. Portais que exigem autenticação humana podem declarar intervenção necessária, sem falso sucesso.

- **Publicações** distingue registros não tratados, em análise, tratados e descartados.
- Processos encontrados não apagam campos curados manualmente.
- Uma fonte indisponível deve mostrar falha ou resultado parcial, nunca sucesso inventado.
- Consulta e download são somente leitura: o ATRIUM não dá ciência, assina, protocola nem confirma prazo automaticamente.

## 4. Fazer um teste simples

Use somente dados sintéticos no ambiente de teste; dados reais devem ser usados apenas no escritório autorizado.

1. Abra **Contatos** e cadastre um contato.
2. Abra **Processos e casos** e cadastre um processo pelo número CNJ.
3. No painel do processo, use **Criar tarefa**.
4. Em **Gestão de tarefas**, confira Lista e Kanban.
5. Abra **Publicações** e confira o teor integral antes de qualquer providência.
6. Em **Configurações**, gere um backup cifrado por ação administrativa autorizada.

Uma data de prazo sem confirmação humana não vira prazo fatal. Nunca envie em feedback público senha, QR code, código de recuperação, certificado, chave processual, nomes de clientes ou documentos do escritório.

## 5. Se algo não abrir

No Windows, execute `ATRIUM.bat --doctor` ou confira os logs em `%APPDATA%\ATRIUM\logs\server.log`. Em outros sistemas, consulte a saída do processo iniciado com `pnpm start`. Se a integração judicial não autenticar, revise o certificado, o PJeOffice e o TOTP na área de Integrações.
