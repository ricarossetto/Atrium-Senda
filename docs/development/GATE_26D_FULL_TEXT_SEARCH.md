# Gate 26D — busca global full-text

## Decisão tecnológica

O ATRIUM mantém o JSON cifrado como Store canônico. SQLite/FTS5 não foi introduzido porque o runtime atual não possui driver SQLite e adicionar banco/dependência apenas para um índice derivado aumentaria migração, backup e superfície de falha sem benefício proporcional neste gate.

`SearchIndex` é uma abstração local em memória. Ela recebe o estado canônico já descriptografado no servidor e lê somente blobs OCR cifrados referenciados. O snapshot possui versão, revision de origem, data de geração e entradas derivadas; nunca é salvo como plaintext.

## Fontes e minimização

- Processos: identificação, partes, órgão, classe/fase, andamento e monitoramento.
- Contatos: nome, papel, documento cadastral, meios de contato, localidade e origem.
- Publicações: título, processo, cliente, tribunal, texto, fonte e categoria.
- Tarefas: título, descrição, vínculo, responsável e estado.
- Documentos: nome, proprietário, tipo, data e texto OCR supervisionado; lixeira é excluída.
- Prompts: catálogo padrão e prompts customizados.
- Auditoria: ação, ator, data e detalhe já minimizado.

Settings, credenciais, segredos judiciais, chave Gemini, senha SMTP, cookies, CSRF, TOTP e runtime de sessão não são fontes. Valores com padrões explícitos de segredo são descartados mesmo dentro de campos permitidos.

## Lifecycle

Na primeira busca, o índice ausente é reconstruído. Em nova revision, a sincronização compara fingerprints, adiciona/atualiza/remove entradas e reaproveita as inalteradas; textos OCR são cacheados por checksum. Snapshot ausente, incompatível ou logicamente inválido é descartado e reconstruído. Administradores podem executar `POST /api/search/rebuild` com CSRF sem alterar Store, revision ou audit.

## UX e segurança

Ctrl/Cmd+K mantém o combobox e a navegação canônica. Resultados agora informam tipo, título, contexto, snippet, campo encontrado e relevância. A UI aceita somente tipos conhecidos e escapa cada segmento antes de envolver correspondências em `<mark>`; conteúdo remoto nunca entra como HTML cru.

Se a API derivada estiver indisponível, a busca local existente continua operando sobre o estado carregado. Pesquisar não salva, não audita e não dispara chamadas externas.
