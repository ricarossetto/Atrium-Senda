# Guia do testador — ATRIUM Senda 3.4.0

Este guia orienta a validação da edição local com dados sintéticos. Ele não substitui a conferência profissional de informações judiciais.

## Preparar o ambiente

1. Use Node.js 24+ e pnpm na versão declarada em `package.json`.
2. Instale as dependências com `pnpm install --frozen-lockfile`.
3. Use um diretório de dados descartável, próprio para o teste.
4. Crie o administrador sintético e conclua o segundo fator.
5. Não use certificado, senha, processo, cliente ou chave real nos testes.

Para a interface, instale o Chromium do Playwright quando a suíte exigir navegador.

## Roteiro de validação

### Acesso e navegação

- Entre com a conta sintética.
- Confira a identidade do escritório e os dados do perfil.
- Abra Dashboard, Processos, Publicações, Tarefas, Agenda e Contatos.
- Confira que apenas uma view está ativa e que não há overlays inesperados.
- Teste o tema claro e o escuro em desktop e celular.

### Processos e publicações

- Cadastre um processo sintético e confira a persistência após recarregar.
- Abra uma publicação e leia o teor antes de editar.
- Altere um campo, atualize a publicação e confirme que a edição foi preservada.
- Verifique o comportamento com uma extensão de navegador que acrescente atributos `data-*`.
- Tratamento interno não significa ciência judicial.

### Tarefas

- Crie, edite, conclua e reabra uma tarefa sintética.
- Confira os estados vazios de primeiro uso, filtro sem resultado e acervo sem tarefas abertas.
- Use **Nova tarefa** e **Revisar filtros** pelo teclado.
- Confira que o estado vazio não cria tarefa nem altera o Store.

### Prazos e atos judiciais

O prazo informado pela fonte oficial (eproc/PJe) é uma referência. O ATRIUM não infere automaticamente deadline jurídico. A conferência humana e a confirmação do prazo continuam obrigatórias.

O sistema não dá ciência, não assina, não peticiona e não protocola. Integrações judiciais são somente leitura.

### E-mail e relato de erro

O envio individual manual de publicação exige autenticação, perfil autorizado e proteção CSRF. O boletim em lote manual segue o mesmo controle. Não existe envio automático de publicação nem há auto-send.

O relato de erro é redigido antes do envio. O envio ao suporte da plataforma é opcional e explícito, decidido pela pessoa que está usando o sistema. Não há envio automático de relato.

### Backup e restauração

- Exporte um backup sintético.
- Confira o checksum SHA-256 antes de restaurar.
- Restaure em um diretório vazio e compare os registros.
- Guarde a chave de criptografia separada do arquivo.
- Registre qualquer divergência sem editar dados reais para ocultar o problema.

## Evidências a registrar

Para cada falha, registre:

1. comando executado;
2. tela ou rota;
3. passos para reproduzir;
4. resultado esperado e obtido;
5. viewport, tema e navegador;
6. print lido da tela afetada;
7. erros de console relevantes, sem segredos nem dados pessoais.

Screenshot sem leitura não comprova aprovação visual. Também confira overflow, clipping, foco de teclado, alvos de toque e ausência de ações encobertas.
