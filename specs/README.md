# ATRIUM — Especificações canônicas do produto

Status: **CURRENT**

Este diretório registra contratos de produto que não devem ser reinventados por agentes ou refactors. Cada spec descreve o comportamento existente e aponta para sua autoridade executável. Itens `FUTURE` são intenção delimitada, não funcionalidade disponível.

Antes de alterar um domínio, leia a spec correspondente e as specs transversais afetadas:

- [UI mode](ui-mode.md)
- [Store e persistência](store-persistence.md)
- [Política humana de prazos](human-deadline-policy.md)
- [Tratamento de publicações](publication-treatment.md)
- [Política judicial read-only](judicial-readonly-policy.md)
- [Conectividade judicial gerenciada](managed-judicial-connectivity.md)
- [Documentos](document-management.md)
- [Busca global full-text](full-text-search.md)
- [Integrações DAV experimentais](dav-integrations.md)
- [Evolução da API](api-evolution.md)
- [E-mail](email-policy.md)
- [Limites de segurança](security-boundaries.md)
- [Auditoria](audit-policy.md)
- [Importação](import-policy.md)
- [Relacionamento e CRM](relationship-crm.md)
- [Inteligência cadastral brasileira](brazilian-registry-intelligence.md)

## Regra de precedência

As specs não substituem código ou testes. Em caso de divergência, inspecione a autoridade indicada, preserve dados e segurança e atualize contrato, implementação e cobertura juntos. Não transforme uma seção `FUTURE` em alegação de capacidade atual.
