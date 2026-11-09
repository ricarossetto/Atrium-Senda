# ATRIUM — Especificações oficiais do produto

Status: **CURRENT**

Este diretório registra contratos de produto que não devem ser reinventados por agentes ou refactors. Cada spec descreve o comportamento existente e aponta para sua autoridade executável. Itens `FUTURE` são intenção delimitada, não funcionalidade disponível.

Antes de alterar um domínio, leia a spec correspondente e as specs transversais afetadas:

- [UI mode](ui-mode.md)
- [Página pública /discover](discover-public.md)
- [Store e persistência](store-persistence.md)
- [Lançamentos financeiros](financial-entries.md)
- [Cálculos judiciais](calculations.md)
- [Cálculos cíveis](calculations-civel.md)
- [Cálculos trabalhistas](calculations-trabalhista.md)
- [Cálculos previdenciários](calculations-previdenciario.md)
- [Tempo de contribuição e qualidade de segurado](calculations-tempo.md)
- [Política humana de prazos](human-deadline-policy.md)
- [Calendário de suspensões e indisponibilidades](deadline-calendar.md)
- [Sincronização com o Google Agenda](google-calendar-sync.md)
- [Tratamento de publicações](publication-treatment.md)
- [Política judicial read-only](judicial-readonly-policy.md)
- [Numeração única de processos (CNJ)](cnj-numbering.md)
- [Carteira processual (lista)](process-workspace.md)
- [Conectividade judicial gerenciada](managed-judicial-connectivity.md)
- [Pipeline PJe nacional read-only](pje-readonly-pipeline.md)
- [Consulta pública por chave de acesso do eproc](eproc-public-key.md)
- [Painel de administração da plataforma](platform-admin.md)
- [Documentos](document-management.md)
- [Busca global full-text](full-text-search.md)
- [Integrações DAV experimentais](dav-integrations.md)
- [Evolução da API](api-evolution.md)
- [E-mail](email-policy.md)
- [Limites de segurança](security-boundaries.md)
- [Auditoria](audit-policy.md)
- [Importação](import-policy.md)
- [Relacionamento e CRM](relationship-crm.md)
- [Escritório, equipes e acesso por processo](office-teams-access.md) — **CURRENT em 3.0.0**: painel, convite por e-mail/link, equipes, ACL por processo, papéis finos, escopo privado e offboarding implementados; pendências restantes (papéis configuráveis na tela, financeiro segregado, consulta de auditoria, rotas de monitoramento) estão listadas na própria spec
- [Gestão de tarefas](task-management.md)
- [Produtividade e relatórios de tarefas](productivity-reports.md)
- [Análise operacional com Atrium IA](operational-analysis.md)
- [Recorrência de compromissos](recurrence.md)
- [Inteligência cadastral brasileira](brazilian-registry-intelligence.md)
- [Inteligência jurídica do Gerador de Minutas](legal-intelligence.md)
- [Judicial Intelligence Beta (paralela e isolada)](judicial-intelligence.md)
- [Assistente de IA](ai-assistant.md)
- [Classificador IA (publicações)](ai-classifier.md)
- [Decision Layer JEV](decision-layer.md)
- [Jev Beta (classificador isolado)](jev-beta.md)

## Regra de precedência

As specs não substituem código ou testes. Em caso de divergência, inspecione a autoridade indicada, preserve dados e segurança e atualize contrato, implementação e cobertura juntos. Não transforme uma seção `FUTURE` em alegação de capacidade atual.

- [Cobrança e assinaturas](billing.md)
