# ATRIUM — GUIA DE USO DO TESTADOR BETA (BETA TESTER GUIDE)
## Instruções simples e práticas para advogados e operadores jurídicos

Bem-vindo ao programa de testes da versão **ATRIUM Escritório Integrado v2.0 (Beta)**.

Este guia foi elaborado para que você utilize todos os recursos essenciais do sistema com total segurança e sem necessidade de conhecimentos técnicos avançados.

---

## 🚀 1. Como Iniciar o Sistema no Windows

1. Dê um **duplo clique** no arquivo `iniciar-atrium.bat` na pasta do projeto.
2. Uma janela do console abrirá e, automaticamente, seu navegador padrão abrirá no endereço:
   `http://localhost:4173`
3. Mantenha a janelinha minimizada enquanto estiver usando o ATRIUM. Ao terminar, basta fechar o navegador e a janela.

---

## 🔐 2. Primeiro Acesso e Cadastro de Administrador

1. Ao abrir o sistema pela primeira vez, você verá a tela de **Setup do Administrador**.
2. Preencha seu **Nome Completo**, **Nome de Usuário** e crie uma **Senha Segura**.
3. **Autenticação em Dois Fatores (2FA/TOTP)**:
   - Se desejar ativar imediatamente: abra o aplicativo *Google Authenticator*, *Microsoft Authenticator* ou *1Password* no seu celular e leia o QR Code ou digite a chave manual. Digite o código de 6 dígitos para validar.
   - Guarde os **códigos de recuperação** exibidos em local seguro.
   - Caso prefira configurar depois, clique em "Configurar mais tarde".

---

## 📂 3. Importação de Acervo e Planilhas

O ATRIUM possui importador universal compatível com planilhas `.xlsx` / `.csv` exportadas por sistemas de gestão jurídica e relatórios processuais compatíveis.

1. Acesse o menu **Processos e casos** na barra lateral.
2. Clique no botão **[ 📥 Importar Planilha ]**.
3. Arraste ou selecione seu arquivo `.xlsx` ou `.csv`.
4. O sistema identificará automaticamente as colunas (Número do Processo CNJ, Cliente, CPF/CNPJ, Tribunal, Fase e Valor da Causa) e apresentará uma pré-visualização.
5. Clique em **[ Confirmar Importação ]**. Seus processos e contatos serão cadastrados e deduplicados automaticamente.

---

## 🧪 4. Configuração do Certificado Digital A1 e Teste Sandbox

O ATRIUM possui uma tecnologia exclusiva de **Sandbox Local** que valida seu certificado digital A1 ICP-Brasil sem enviar sua chave privada para a internet:

1. Acesse o menu **Ajustes & Sistema -> Integrações Judiciais**.
2. Na seção **Certificado Digital A1 ICP-Brasil**, clique em **[ Cadastrar / Atualizar Certificado ]**.
3. Selecione seu arquivo `.pfx` ou `.p12` e digite a senha.
4. Clique no botão **[ 🧪 Testar Certificado no Sandbox ]**.
5. O sistema executará um teste em 8 etapas em tempo real (validação do contêiner PKCS#12, período de vigência, assinatura criptográfica de desafio SHA-256 e conexão mTLS local).
6. Quando todas as etapas ficarem verdes com o status **`A1 OPERACIONAL`**, seu certificado estará 100% pronto para sincronização com os tribunais.

---

## 📋 5. Gestão de Tarefas, Prazos e Kanban

1. Acesse o menu **Quadro Kanban & Prazos**.
2. Suas tarefas estão organizadas em colunas visuais: **Triagem**, **Em Andamento**, **Revisão** e **Concluído**.
3. Cada cartão exibe claramente o **Nome do Cliente**, **Número do Processo**, **Tribunal** e **Data Fatal**.
4. **Estimador de Prazos Inteligente**: Ao clicar em uma intimação na caixa de entrada, o sistema calcula automaticamente o prazo em dias úteis conforme o CPC/2015 e preenche a data sugerida.
5. **Apontamento de Horas (TimeSheet)**: Você pode registrar o tempo investido em cada atividade diretamente no cartão da tarefa.

---

## 💾 6. Como Fazer Backup dos seus Dados

Todos os seus dados no ATRIUM são salvos localmente e protegidos por criptografia **AES-256-GCM**.

Para gerar uma cópia de segurança:
1. Acesse o menu **Ajustes & Sistema -> Diagnóstico & Backup**.
2. Clique no botão **[ 💾 Gerar Backup Criptografado (.atrium-backup) ]**.
3. O download do arquivo `.atrium-backup` começará imediatamente. Guarde este arquivo em um pen drive ou nuvem segura.
4. Para restaurar seus dados em outro computador, basta utilizar o botão **[ Restaurar Cópia de Segurança ]** na mesma tela.

---

## 💬 7. Canal de Feedback do Beta

Encontrou alguma inconsistência ou tem uma sugestão de melhoria?
1. Clique no botão **[ 💬 Enviar Feedback do Beta ]** no canto inferior da barra lateral ou na tela de configurações.
2. Descreva sua experiência. Nenhum dado pessoal ou confidencial é enviado.
