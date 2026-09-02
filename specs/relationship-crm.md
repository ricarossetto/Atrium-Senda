# Relacionamento e CRM

Status: **CURRENT**

## Purpose

Preservar Contatos como base canônica de pessoas e permitir que Atendimentos/Oportunidades referenciem uma pessoa existente sem criar coleção ou cadastro paralelo de clientes.

## Canonical authority

`js/features/contacts.js`, `js/features/leads.js`, `js/components/modal.js` e `js/portal.js`.

## Invariants

- Cliente continua sendo um papel de Contato; não existe Store separado de clientes.
- Um atendimento pode preservar `contactId` e o nome apresentado do contato selecionado.
- Digitação livre continua aceita para interessado ainda não cadastrado, mas não cria Contato automaticamente.
- Busca e seleção do combobox são locais, acessíveis por teclado e não fazem requests.
- O CRUD canônico de Leads permanece único e não muta Contatos ou Processos.

## Security boundary

O seletor mostra somente metadados já disponíveis no Store autenticado. Auditoria do atendimento mantém o contrato existente e não passa a registrar documento, telefone, e-mail, endereço ou notas do contato.

## Relevant tests

`tests/leads_feature.mjs`, `tests/ui_v2_leads.mjs` e `tests/ui_v2_leads_accessibility.mjs`.
