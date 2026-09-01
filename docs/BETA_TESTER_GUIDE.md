# ATRIUM — Guia do Testador Beta

Este guia descreve o Beta técnico com a UI V2 como interface padrão e a UI Clássica como fallback visual selecionável. Os dois modos usam o mesmo App, Store, backend e regras de negócio. O guia não substitui conferência jurídica, política de segurança do escritório nem validação dos atos oficiais.

## 1. Iniciar no Windows

1. Instale Node.js 24.
2. Dê duplo clique em `iniciar-atrium.bat`.
3. O starter valida a versão do Node.js, prepara `pnpm@11.19.0`, instala as dependências pelo lockfile congelado se necessário e abre `http://127.0.0.1:4173`.
4. Mantenha a janela do servidor aberta durante o uso.

## 2. Primeiro acesso

1. Cadastre o administrador com nome, usuário e senha forte.
2. O TOTP RFC 6238 é configurável por usuário. Se ativá-lo, confirme o código no aplicativo autenticador e guarde os códigos de recuperação em local seguro.
3. Nunca compartilhe senha, chave TOTP, código de recuperação ou certificado A1 em feedback ou diagnóstico.

## 3. Importar dados

O importador aceita planilhas `.xlsx` e `.csv`. Confira a prévia, o mapeamento de colunas e a deduplicação antes de confirmar. Use somente arquivos autorizados pelo escritório.

## 4. Publicações, tarefas e prazos

- O discovery consulta DJEN e DataJud em modo de leitura; tratamento no ATRIUM não equivale a ciência judicial.
- Uma publicação pode gerar uma tarefa, mas essa tarefa começa sem deadline.
- A data fatal deve ser conferida e informada pelo advogado. A IA pode apresentar estimativa preliminar, que não substitui a confirmação humana.
- O sistema não infere automaticamente deadline jurídico a partir do texto da publicação.

## 5. E-mail

- O SMTP é configurável e possui teste manual.
- O envio de uma publicação e o boletim em lote são ações manuais.
- O backend busca a publicação canônica pelo identificador antes de montar o e-mail.
- Não existe envio automático após importação, sincronização ou tratamento.

## 6. Certificado A1 e integrações judiciais

Cadastre o certificado somente na área administrativa e use o sandbox para validar o ambiente. O job Windows do CI é a autoridade para a suíte A1 completa; um indicador local não garante disponibilidade do tribunal.

## 7. Backup e recuperação

Gere o arquivo `.atrium-backup` pela tela de Administração do Sistema e armazene-o em local protegido. O backup contém estado cifrado, checksum SHA-256 e metadados mínimos. A restauração cria snapshot de segurança antes de gravar o estado validado.

Se o runtime derivado estiver quarentenado, o app-state principal continua disponível. Use **Recriar dados derivados** apenas de forma explícita após revisar o diagnóstico.

## 8. Feedback Beta local

O botão **Registrar Feedback Beta** grava a mensagem cifrada apenas no ambiente local do ATRIUM. Nada é enviado automaticamente ao mantenedor ou a terceiros.

Descreva o comportamento observado sem inserir nomes de clientes, números de processo, documentos, credenciais, tokens, diagnóstico completo ou qualquer conteúdo confidencial. Para compartilhar o relato com suporte, faça isso deliberadamente por um canal autorizado pelo escritório.

## 9. Limitações conhecidas

- Integrações externas dependem de rede, configuração e disponibilidade dos serviços.
- A confirmação de ciência, prazo e envio permanece humana.
- O feedback não possui transporte externo neste Beta.
- A UI V2 é o modo padrão; a UI Clássica permanece disponível em Configurações como fallback visual, sem criar uma segunda aplicação ou uma segunda base de dados.
- A conclusão da migração visual não equivale a release final nem certificação de produção.
