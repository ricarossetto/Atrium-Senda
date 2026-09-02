# Manual do usuário — ATRIUM 2.0.0

O ATRIUM organiza o trabalho do escritório em uma interface V2 responsiva. Este manual descreve os fluxos atuais e os limites de supervisão. Para preparar o ambiente, veja [Instalação](INSTALLATION.md).

## Primeiro acesso

No primeiro uso, crie o administrador com uma senha forte e conclua o segundo fator quando solicitado. Guarde os códigos e segredos em local privado. O tour inicial apresenta as áreas do sistema sem criar dados automaticamente.

Depois de entrar:

1. confira a identidade do escritório em **Configurações**;
2. cadastre equipe e responsáveis;
3. configure backups;
4. importe ou cadastre contatos e processos;
5. habilite somente as integrações realmente necessárias.

## Área de trabalho

O Dashboard mostra a situação operacional do escritório: indicadores, publicações pendentes, tarefas, compromissos e atalhos. Os números são derivados do mesmo Store usado pelos módulos; não constituem bases paralelas.

Clique em um indicador ou item para abrir a área correspondente. Use o sino para ver notificações reais e a barra de sincronização para acompanhar operações em andamento ou falhas.

## Contatos e clientes

Todo cliente é um contato com papel `cliente`; não existe cadastro paralelo. Outros papéis incluem testemunha, perito, adverso, correspondente, preposto e outro.

Para cadastrar, abra **Contatos → Novo contato**, preencha os dados necessários e salve. O inspector exibe identificação, meios de contato, endereço, origem e notas. Dados sensíveis têm apresentação discreta e não devem ser copiados para observações sem necessidade.

### Enriquecimento cadastral

No formulário, CPF recebe validação local. CNPJ, CEP e bancos podem consultar provedores públicos. Revise a comparação **atual versus encontrado** e aplique somente os campos desejados. Proveniência e freshness indicam de onde e quando o dado veio.

QSA pode sugerir novos contatos com papel `outro`. Sugestões de duplicidade ou conflito exigem revisão: o ATRIUM não faz merge destrutivo automático nem comprova identidade por semelhança.

## Processos

Abra **Processos e casos** para pesquisar e ordenar a lista. Selecione um registro para ler o inspector antes de editar. O número CNJ, quando disponível, é a identidade processual canônica.

O inspector reúne:

- cliente/contato e parte contrária;
- tribunal, unidade, classe, assunto e fase;
- último andamento e histórico completo disponível;
- publicações e tarefas vinculadas;
- documentos e metadados cadastrados.

O nome do cliente abre o contato canônico. Tarefas vinculadas podem ser abertas na área de trabalho. Dados trazidos por DJEN/DataJud complementam o processo sem apagar campos locais significativos.

## Publicações e intimações

A caixa de Publicações ocupa o workspace principal. Use a busca e os filtros para separar:

- `untreated`: não tratada;
- `in_review`: em análise;
- `treated`: tratada no fluxo interno;
- `discarded`: descartada.

Leitura e tratamento são dimensões diferentes. Abra uma publicação para ver o teor integral em uma superfície ampla. Iniciar análise, marcar como tratada ou descartar registra apenas o trabalho interno.

> **Tratada no ATRIUM não significa ciência judicial.** O sistema não pratica atos no portal.

### Criar tarefa a partir da publicação

Abra a publicação, escolha **Criar tarefa no Kanban**, revise título, processo, responsável e descrição e confirme. A tarefa nasce sem prazo fatal inferido. Informe data somente depois da conferência profissional.

### Confirmação humana de prazo

Datas sugeridas, movimentos e texto de publicação não confirmam prazo jurídico. Quando a tarefa exigir prazo, um profissional deve conferir o ato, o regime, feriados e o portal oficial antes de gravar a data fatal.

## Tarefas, Kanban e apontamentos

O Kanban organiza tarefas por status. Crie ou edite título, prioridade, responsável, vínculo processual e datas. O arraste altera o status canônico da mesma tarefa; não cria uma cópia.

Use o apontamento de tempo quando disponível para registrar trabalho efetivamente realizado. O timer é uma ferramenta operacional e não altera automaticamente honorários ou prazo.

## Agenda

A Agenda reúne compromissos, tarefas com data e publicações relacionadas. Use filtros e navegação por período. A integração iCalendar/Webcal é opcional e de leitura; o calendário externo não se torna autoridade sobre o Store jurídico.

Datas processuais só devem aparecer como prazo quando o campo canônico correspondente tiver sido explicitamente preenchido.

## Documentos e minutas

Há duas superfícies complementares:

- **Modelos e minutas:** seleciona tipo, contato e processo, gera preview editável temporário e permite copiar ou baixar Markdown.
- **Acervo documental:** armazena arquivos privados, metadados e relações canônicas.

No acervo, upload e download passam pelo backend. Preview segue política segura por tipo. Exclusão lógica permite restaurar; expurgo é explícito. Arquivos iguais podem ser detectados por checksum.

### OCR e extração

Quando Tesseract e `pdftoppm` estão configurados localmente, o ATRIUM pode executar OCR supervisionado. A extração gera texto derivado e, quando aplicável, PDF derivado. Revise o resultado: OCR pode errar nomes, números e acentos.

## Busca global

Pressione `Ctrl+K` (Windows/Linux) ou `Cmd+K` (macOS). Digite nome, número, termo ou conteúdo. A busca cobre processos, contatos, publicações, tarefas, documentos/OCR, prompts e metadados de auditoria adequados.

Use as setas e `Enter` para abrir o resultado. `Escape` fecha a paleta. O índice é reconstruível em memória; o registro aberto continua sendo a fonte canônica.

## CRM e oportunidades

Em **Atendimentos**, cadastre a oportunidade e escolha o cliente/interessado pelo seletor de contatos canônicos. A escolha guarda a identidade do contato, evitando vínculo baseado apenas no nome. Atualize etapa, responsável, origem, serviço e notas conforme o atendimento evolui.

Converter ou relacionar entidades exige ação explícita; a tela não transforma leads em clientes silenciosamente.

## Financeiro

O workspace financeiro organiza honorários, valores, RPV/alvarás e status. Sempre associe ao processo correto e confira tipo, percentual, valor fixo, mensalidade e situação. Zeros explícitos são valores válidos e não devem ser omitidos.

O módulo não substitui contabilidade nem realiza movimentação bancária. Cálculos e totalizadores dependem dos dados cadastrados.

## Assistente e Google Gemini

Sem chave, o Assistente permanece não configurado. Um administrador pode informar uma chave Gemini; ela é processada pelo backend e não integra o Store jurídico do navegador.

Digite uma pergunta ou carregue um prompt. Quando uma publicação estiver selecionada, somente o contexto previsto pelo produto é enviado. Revise toda resposta antes de usar. A IA não decide estratégia, não confirma prazo, não protocola e não atua como autoridade jurídica.

## Biblioteca de prompts

Pesquise por título, tag ou texto. Abra um prompt para ler seu conteúdo e escolha **Usar no Assistente** para carregar o texto no composer. Essa ação não envia mensagem automaticamente. Prompts personalizados seguem os fluxos de edição e auditoria existentes.

## Importação e exportação

O Importador aceita planilhas nos formatos suportados e mostra uma prévia antes da aplicação. Revise mapeamento, erros, conflitos e entidades que serão criadas. Importar exige confirmação; não corrija fixtures ou dados para ocultar inconsistências.

Exportações administrativas geram arquivos locais. Revise o conteúdo antes de compartilhá-lo, pois pode conter dados pessoais ou processuais.

## Monitoramento

Monitoramento apresenta saúde do Store, runtime derivado, fontes e integrações. Estados de atenção devem ser investigados; não apague arquivos de recovery/quarentena para fazer o aviso desaparecer.

Use **Recriar dados derivados** apenas quando indicado. Essa ação não substitui processos, contatos ou tarefas canônicos.

## Integrações judiciais

Em **Integrações**, acompanhe DJEN, DataJud, certificado, PJeOffice, TOTP e portais. A atualização é conservadora e somente de leitura.

### Login A1 supervisionado

1. carregue o PFX localmente e valide no sandbox;
2. verifique PJeOffice quando aplicável;
3. vincule TOTP ao portal correto;
4. habilite o portal;
5. escolha **Autenticar no portal** ou **Abrir sessão assistida** quando oferecido;
6. conclua manualmente os desafios apresentados;
7. confirme que o status da sessão mudou.

Um PFX válido não significa que a sessão esteja autenticada. O ATRIUM não contorna CAPTCHA, 2FA ou confirmação do portal e não executa ciência, assinatura, petição ou protocolo.

## Notificações

O sino abre pendências baseadas em publicações, tarefas e avisos internos reais. Se não houver itens, a tela informa o estado vazio. Selecionar uma notificação navega para o registro relacionado.

## Auditoria

A Auditoria registra ações relevantes, ator, data e detalhe permitido. Use filtros e exportação para conferência. Não espere que segredos, senhas, chave Gemini ou conteúdo sensível proibido apareçam no log — essa ausência é intencional.

## Configurações

Configure identidade, equipe, papéis, definições internas, integrações e administração. A versão estável apresenta somente a interface V2 ao usuário. Alterações persistentes seguem o mesmo Store, revisão e feedback de sincronização.

## Backup e restauração

Exporte o backup cifrado em **Configurações → Sistema**. Guarde o `.atrium-backup` junto com uma cópia segura da chave de criptografia, em locais separados.

Ao restaurar, o backend:

1. valida formato e checksum;
2. descriptografa com a chave atual;
3. valida e migra o schema quando necessário;
4. cria snapshot pré-restauração;
5. grava o novo estado de forma atômica.

Não restaure backup desconhecido. Faça uma cópia do diretório `data/` antes de atualização ou recuperação.

## Tema claro e escuro

Use o botão de tema na barra superior. A preferência é apenas visual e local ao navegador; não modifica os dados jurídicos. O sistema respeita redução de movimento configurada no sistema operacional.

## Atalhos de teclado

| Atalho | Ação |
| --- | --- |
| `Ctrl+K` / `Cmd+K` | Abrir busca global |
| `Escape` | Fechar paleta, drawer ou diálogo ativo |
| `Enter` | Confirmar seleção/ação conforme o controle |
| `Shift+Enter` no Assistente | Inserir nova linha sem enviar |
| `Tab` / `Shift+Tab` | Navegar pelos controles e manter foco no diálogo ativo |

## Problemas comuns

- **ATRIUM não abre:** execute `ATRIUM.bat --doctor` e confira Node 24/Corepack.
- **Porta ocupada:** se outro ATRIUM responde, o launcher apenas o abre; para outro serviço, encerre-o ou use porta manual.
- **Dados não aparecem:** confira `JURISFLOW_DATA_DIR`, usuário e ambiente antes de restaurar qualquer arquivo.
- **Integração judicial pede ação:** abra a sessão assistida e conclua login/TOTP/CAPTCHA manualmente.
- **DataJud não encontrou:** o dado base do DJEN é preservado; não invente complementos.
- **OCR não funciona:** confira Tesseract, `pdftoppm`, idioma e permissões do arquivo.
- **Gemini não configurado:** valide a chave na área do Assistente; não a registre em logs.
- **Conflito de salvamento:** recarregue o estado mais recente e reaplique conscientemente sua alteração; não force a revisão.

Para problemas de ambiente, consulte [Solução de problemas de instalação](INSTALLATION.md#18-solução-de-problemas). Para reportar vulnerabilidade, siga [SECURITY.md](../SECURITY.md).
