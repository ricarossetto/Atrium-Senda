# ATRIUM 2.1.0 — Stable Release 2

Esta versão reúne a revisão de interface e dos fluxos de trabalho do escritório.

- Gestão de tarefas com visualizações Lista e Kanban sobre os mesmos registros.
- Busca contextual de processos e clientes na Agenda, nas tarefas e nas publicações; criação de tarefa vinculada pelo painel do processo.
- Navegação entre registros relacionados no painel lateral, sem trocar a área de trabalho.
- Edição completa de despesas e exclusão com confirmação interna.
- Ajustes de legibilidade, espaçamento, campos de leitura e confirmação de alterações não salvas.
- Acompanhamento de publicações a partir da data selecionada, preservando o histórico armazenado.
- Sincronização na abertura, diariamente às 10h e por comando manual.
- Reutilização da chave judicial protegida no monitoramento; indisponibilidade do coletor preserva os dados existentes.
- Documentação e inicializadores auxiliares organizados em diretórios próprios.

## Instalação e atualização

Consulte [Instalação](INSTALLATION.md). Antes de atualizar uma instalação existente, faça o backup descrito no [manual](USER_MANUAL.md). Preserve o diretório de dados e as chaves da instalação; não substitua o arquivo `.env`.

## Limites operacionais

O coletor TJRS é um serviço local separado e precisa estar disponível para as consultas que dependem dele. A release não comprova disponibilidade dos portais externos nem substitui conferência jurídica. Nenhum prazo, envio de e-mail ou ciência judicial é realizado automaticamente.

A distribuição oficial é o código versionado no GitHub. Hospedagem com dados reais exige armazenamento persistente e configuração própria; o manifesto de demonstração não constitui implantação de produção.
