import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const checkFiles = [
  'server.mjs',
  'lib/security.mjs',
  'lib/ai-context.mjs',
  'lib/judicial/credential-manager.mjs',
  'lib/judicial/session-manager.mjs',
  'lib/judicial/a1-sandbox.mjs',
  'lib/judicial/totp-sandbox.mjs',
  'lib/judicial/auth-adapters.mjs',
  'lib/judicial/orchestrator.mjs',
  'scripts/import-spreadsheet.mjs',
  'scripts/import-legal-data.mjs',
  'scripts/migrate-judicial-secrets.mjs',
  'scripts/reset-judicial-connections.mjs',
  'scripts/setup-keys.mjs',
  'js/auth.js',
  'js/portal.js',
  'js/app/bootstrap.js',
  'js/core/api.js',
  'js/core/store.js',
  'js/components/modal.js',
  'js/components/toast.js',
  'js/components/theme.js',
  'js/components/global-search.js',
  'js/components/onboarding.js',
  'js/views/ui-v2/preference-init.js',
  'js/views/ui-v2/mode.js',
  'js/views/ui-v2/primitives.js',
  'js/views/ui-v2/system-status.js',
  'js/views/ui-v2/shell.js',
  'js/views/ui-v2/dashboard.js',
  'js/views/ui-v2/processes-presenter.js',
  'js/views/ui-v2/publications-presenter.js',
  'js/views/ui-v2/tasks-presenter.js',
  'js/views/ui-v2/agenda-presenter.js',
  'js/views/ui-v2/financial-presenter.js',
  'js/views/ui-v2/documents-presenter.js',
  'js/views/ui-v2/assistant-presenter.js',
  'js/views/ui-v2/prompts-presenter.js',
  'js/views/ui-v2/monitoring-presenter.js',
  'js/views/ui-v2/judicial-integrations-presenter.js',
  'js/views/ui-v2/configuration-presenter.js',
  'js/features/dashboard.js',
  'js/features/office-identity.js',
  'js/features/audit.js',
  'js/features/links.js',
  'js/features/email-integration.js',
  'js/features/external-calendar.js',
  'js/features/importer.js',
  'js/features/agenda.js',
  'js/features/assistant.js',
  'js/features/configuration.js',
  'js/features/publications.js',
  'js/features/tasks.js',
  'js/features/processes.js',
  'js/features/contacts.js',
  'js/features/leads.js',
  'js/features/financial.js',
  'js/features/documents.js',
  'js/features/prompts.js',
  'js/features/system-admin.js',
  'js/features/monitoring.js',
  'js/features/judicial-integrations.js',
  'js/prompts-data.js',
  'js/office-data.js',
  'collector/agent.mjs',
  'collector/adapters/djen.mjs',
  'collector/adapters/datajud.mjs',
  'collector/adapters/pje.mjs',
  'tests/helpers.mjs',
  'tests/security.mjs',
  'tests/security_migrations.mjs',
  'tests/importer.mjs',
  'tests/rls.mjs',
  'tests/collector.mjs',
  'tests/judicial_discovery.mjs',
  'tests/judicial_totp_qr.mjs',
  'tests/judicial_integration_rbac.mjs',
  'tests/publication_task_linking.mjs',
  'tests/document_type_ids.mjs',
  'tests/documents_feature.mjs',
  'tests/assistant_feature.mjs',
  'tests/prompts_feature.mjs',
  'tests/configuration_feature.mjs',
  'tests/system_admin_feature.mjs',
  'tests/monitoring_feature.mjs',
  'tests/judicial_integrations_feature.mjs',
  'tests/dashboard_feature.mjs',
  'tests/office_identity_feature.mjs',
  'tests/audit_feature.mjs',
  'tests/links_feature.mjs',
  'tests/features_validation.mjs',
  'tests/open_source_features.mjs',
  'tests/ai-context.mjs',
  'tests/deployment.mjs',
  'tests/system_diagnostic.mjs',
  'tests/runtime_recovery.mjs',
  'tests/backup_restore.mjs',
  'tests/judicial_sandbox.mjs',
  'tests/smoke.mjs',
  'lib/state-migrations.mjs',
  'lib/email/email-service.mjs',
  'scripts/state-doctor.mjs',
  'tests/state_migrations.mjs',
  'tests/email_service.mjs',
  'tests/visual_light_foundation.mjs',
  'tests/visual_publications_light.mjs',
  'tests/publications_treatment.mjs',
  'tests/publications_feature.mjs',
  'tests/email_integration_feature.mjs',
  'tests/external_calendar_feature.mjs',
  'tests/importer_feature.mjs',
  'js/views/ui-v2/importer-presenter.js',
  'tests/ui_v2_importer.mjs',
  'tests/ui_v2_importer_accessibility.mjs',
  'tests/visual_ui_v2_importer.mjs',
  'js/views/ui-v2/audit-presenter.js',
  'tests/ui_v2_audit.mjs',
  'tests/ui_v2_audit_accessibility.mjs',
  'tests/visual_ui_v2_audit.mjs',
  'tests/agenda_feature.mjs',
  'tests/tasks_feature.mjs',
  'tests/processes_feature.mjs',
  'tests/contacts_feature.mjs',
  'tests/leads_feature.mjs',
  'tests/financial_feature.mjs',
  'tests/ui_v2_financial.mjs',
  'tests/ui_v2_financial_accessibility.mjs',
  'tests/visual_ui_v2_financial.mjs',
  'tests/ui_v2_documents.mjs',
  'tests/ui_v2_documents_accessibility.mjs',
  'tests/visual_ui_v2_documents.mjs',
  'js/views/ui-v2/leads-presenter.js',
  'tests/ui_v2_leads.mjs',
  'tests/ui_v2_leads_accessibility.mjs',
  'tests/visual_ui_v2_leads.mjs',
  'tests/ui_v2_assistant.mjs',
  'tests/ui_v2_assistant_accessibility.mjs',
  'tests/visual_ui_v2_assistant.mjs',
  'tests/ui_v2_prompts.mjs',
  'tests/ui_v2_prompts_accessibility.mjs',
  'tests/visual_ui_v2_prompts.mjs',
  'tests/ui_v2_monitoring.mjs',
  'tests/ui_v2_monitoring_accessibility.mjs',
  'tests/visual_ui_v2_monitoring.mjs',
  'tests/ui_v2_judicial_integrations.mjs',
  'tests/ui_v2_judicial_integrations_accessibility.mjs',
  'tests/ui_v2_action_system.mjs',
  'tests/visual_ui_v2_judicial_integrations.mjs',
  'js/views/ui-v2/email-calendar-presenter.js',
  'tests/ui_v2_email_calendar_integrations.mjs',
  'tests/ui_v2_email_calendar_integrations_accessibility.mjs',
  'tests/visual_ui_v2_email_calendar_integrations.mjs',
  'tests/ui_v2_configuration_admin.mjs',
  'tests/ui_v2_configuration_admin_accessibility.mjs',
  'tests/visual_ui_v2_configuration_admin.mjs',
  'tests/configuration_persistence.mjs',
  'tests/configuration_empty_persistence.mjs',
  'tests/new_install_persistence.mjs',
  'tests/frontend_module_foundation.mjs',
  'tests/frontend_module_boot.mjs',
  'tests/store_module.mjs',
  'tests/sync_result_contract.mjs',
  'tests/shared_components.mjs',
  'tests/onboarding_component.mjs',
  'tests/brand_neutrality.mjs',
  'tests/toolchain_contract.mjs',
  'tests/beta_readiness_gate.mjs',
  'tests/ui_v2_helpers.mjs',
  'tests/ui_v2_mode_contract.mjs',
  'tests/ui_v2_auth_shell.mjs',
  'tests/visual_ui_v2_onboarding.mjs',
  'tests/ui_v2_foundation.mjs',
  'tests/ui_v2_dashboard.mjs',
  'tests/ui_v2_accessibility.mjs',
  'tests/ui_v2_processes.mjs',
  'tests/ui_v2_processes_accessibility.mjs',
  'tests/ui_v2_publications.mjs',
  'tests/ui_v2_publications_accessibility.mjs',
  'tests/ui_v2_tasks.mjs',
  'tests/ui_v2_tasks_accessibility.mjs',
  'tests/ui_v2_agenda.mjs',
  'tests/ui_v2_agenda_accessibility.mjs',
  'tests/ui_v2_contacts.mjs',
  'tests/ui_v2_contacts_accessibility.mjs',
  'tests/ui_v2_visual_direction.mjs',
  'tests/visual_ui_v2_dashboard.mjs',
  'tests/visual_ui_v2_processes.mjs',
  'tests/visual_ui_v2_publications.mjs',
  'tests/visual_ui_v2_tasks.mjs',
  'tests/visual_ui_v2_agenda.mjs',
  'tests/visual_ui_v2_contacts.mjs',
  'tests/visual-qa.mjs'
];

const testSuites = [
  { name: 'Segurança e Criptografia (Auth, TOTP, CSRF, AES-256-GCM)', file: 'tests/security.mjs' },
  { name: 'Migrações Seguras da Chave IA e Feedback Beta Local Cifrado', file: 'tests/security_migrations.mjs' },
  { name: 'Importador de Planilhas e Deduplicação (XLSX, PII protegido)', file: 'tests/importer.mjs' },
  { name: 'Políticas Supabase e Row Level Security (RLS AAL2)', file: 'tests/rls.mjs' },
  { name: 'Coletores Judiciais (DJEN, DataJud, PJe sem ciência auto)', file: 'tests/collector.mjs' },
  { name: 'Judicial Discovery (DJEN → DataJud → Processo → Contatos)', file: 'tests/judicial_discovery.mjs' },
  { name: 'QR TOTP Sintético, Migration, Alta Densidade e Segredo Cifrado', file: 'tests/judicial_totp_qr.mjs' },
  { name: 'RBAC administrativo das integrações judiciais', file: 'tests/judicial_integration_rbac.mjs' },
  { name: 'Vínculo transacional entre Publicações e Tarefas', file: 'tests/publication_task_linking.mjs' },
  { name: 'IDs canônicos do gerador de documentos', file: 'tests/document_type_ids.mjs' },
  { name: 'Feature Modular de Documentos e Gerador de Minutas', file: 'tests/documents_feature.mjs' },
  { name: 'Feature Modular do Assistente IA e Skills Jurídicas', file: 'tests/assistant_feature.mjs' },
  { name: 'Feature Modular da Biblioteca de Prompts', file: 'tests/prompts_feature.mjs' },
  { name: 'Feature Modular de Configurações e Usuários', file: 'tests/configuration_feature.mjs' },
  { name: 'Feature Modular de Administração do Sistema', file: 'tests/system_admin_feature.mjs' },
  { name: 'Neutralidade de Marca e Compatibilidade do Calendário Legado', file: 'tests/brand_neutrality.mjs' },
  { name: 'Feature Modular de Monitoramento', file: 'tests/monitoring_feature.mjs' },
  { name: 'Feature Modular de Integrações Judiciais', file: 'tests/judicial_integrations_feature.mjs' },
  { name: 'Feature Modular do Dashboard e Área de Trabalho', file: 'tests/dashboard_feature.mjs' },
  { name: 'Feature Modular da Identidade do Escritório', file: 'tests/office_identity_feature.mjs' },
  { name: 'Feature Modular da Auditoria Frontend', file: 'tests/audit_feature.mjs' },
  { name: 'Feature Modular de Links Úteis', file: 'tests/links_feature.mjs' },
  { name: 'Catálogos jurídicos e regras de negócio', file: 'tests/features_validation.mjs' },
  { name: 'Recursos jurídicos, privacidade e cálculos auxiliares', file: 'tests/open_source_features.mjs' },
  { name: 'Minimização de dados no contexto do assistente de IA', file: 'tests/ai-context.mjs' },
  { name: 'Deployment e Conformidade com Nuvem (Render / Cloud)', file: 'tests/deployment.mjs' },
  { name: 'Diagnóstico do Sistema, Backups Criptografados & Feedback Beta', file: 'tests/system_diagnostic.mjs' },
  { name: 'Runtime Derivado: Estado, Quarentena e Rebuild Explícito', file: 'tests/runtime_recovery.mjs' },
  { name: 'Backup / Restore Atômico, Cifrado e Revision-Safe', file: 'tests/backup_restore.mjs' },
  { name: 'Arquitetura Judicial, A1 Sandbox (mTLS) & TOTP Sandbox', file: 'tests/judicial_sandbox.mjs' },
  { name: 'Higiene de Estado, Migrações Determinísticas & Recuperação', file: 'tests/state_migrations.mjs' },
  { name: 'Motor SMTP e Entrega Segura de E-mail de Teste', file: 'tests/email_service.mjs' },
  { name: 'Workflow de Tratamento e Triagem de Publicações', file: 'tests/publications_treatment.mjs' },
  { name: 'Feature Modular de Publicações e Intimações', file: 'tests/publications_feature.mjs' },
  { name: 'Feature Modular de Integração de E-mail', file: 'tests/email_integration_feature.mjs' },
  { name: 'Feature Modular de Agenda Externa', file: 'tests/external_calendar_feature.mjs' },
  { name: 'Feature Modular do Importador de Planilhas', file: 'tests/importer_feature.mjs' },
  { name: 'UI V2 Importador, Preview Supervisionado e Contratos Canônicos', file: 'tests/ui_v2_importer.mjs' },
  { name: 'UI V2 Importador, Acessibilidade e Workspace Responsivo', file: 'tests/ui_v2_importer_accessibility.mjs' },
  { name: 'UI V2 Importador, Visual QA e Contenção de Planilhas', file: 'tests/visual_ui_v2_importer.mjs' },
  { name: 'UI V2 Auditoria, Ledger, Filtros e Contratos Canônicos', file: 'tests/ui_v2_audit.mjs' },
  { name: 'UI V2 Auditoria, Acessibilidade e Registros Responsivos', file: 'tests/ui_v2_audit_accessibility.mjs' },
  { name: 'UI V2 Auditoria, Visual QA e Contenção do Ledger', file: 'tests/visual_ui_v2_audit.mjs' },
  { name: 'Feature Modular de Agenda Integrada', file: 'tests/agenda_feature.mjs' },
  { name: 'Feature Modular de Tarefas e Kanban', file: 'tests/tasks_feature.mjs' },
  { name: 'Feature Modular de Processos', file: 'tests/processes_feature.mjs' },
  { name: 'Feature Modular de Contatos', file: 'tests/contacts_feature.mjs' },
  { name: 'Feature Modular de Leads e CRM', file: 'tests/leads_feature.mjs' },
  { name: 'Feature Modular Financeiro, RPV e Honorários', file: 'tests/financial_feature.mjs' },
  { name: 'UI V2 Financeiro, Operações e Contratos Canônicos', file: 'tests/ui_v2_financial.mjs' },
  { name: 'UI V2 Financeiro, Acessibilidade e RecordList Responsiva', file: 'tests/ui_v2_financial_accessibility.mjs' },
  { name: 'UI V2 Documentos, Registry, Gerador e Contrato Read-only', file: 'tests/ui_v2_documents.mjs' },
  { name: 'UI V2 Documentos, Acessibilidade e Workspace Responsivo', file: 'tests/ui_v2_documents_accessibility.mjs' },
  { name: 'UI V2 Leads, Intake Jurídico e Contratos Canônicos', file: 'tests/ui_v2_leads.mjs' },
  { name: 'UI V2 Leads, Acessibilidade e RecordList Responsiva', file: 'tests/ui_v2_leads_accessibility.mjs' },
  { name: 'UI V2 Assistente, Segurança, Payload e Contratos Canônicos', file: 'tests/ui_v2_assistant.mjs' },
  { name: 'UI V2 Assistente, Acessibilidade e Workspace Responsivo', file: 'tests/ui_v2_assistant_accessibility.mjs' },
  { name: 'UI V2 Prompts, Biblioteca Jurídica e Contratos Canônicos', file: 'tests/ui_v2_prompts.mjs' },
  { name: 'UI V2 Prompts, Acessibilidade e Biblioteca Responsiva', file: 'tests/ui_v2_prompts_accessibility.mjs' },
  { name: 'UI V2 Monitoring, Métricas, Rotas e Contratos Canônicos', file: 'tests/ui_v2_monitoring.mjs' },
  { name: 'UI V2 Monitoring, Acessibilidade e Workspace Responsivo', file: 'tests/ui_v2_monitoring_accessibility.mjs' },
  { name: 'UI V2 Integrações Judiciais, A1, Cobertura e Contratos Canônicos', file: 'tests/ui_v2_judicial_integrations.mjs' },
  { name: 'UI V2 Integrações Judiciais, Acessibilidade e Workspace Responsivo', file: 'tests/ui_v2_judicial_integrations_accessibility.mjs' },
  { name: 'UI V2 Action System e Controle de Interface', file: 'tests/ui_v2_action_system.mjs' },
  { name: 'UI V2 E-mail, Agenda Externa, RBAC e Contratos Canônicos', file: 'tests/ui_v2_email_calendar_integrations.mjs' },
  { name: 'UI V2 E-mail, Agenda Externa, Acessibilidade e Sheets Responsivos', file: 'tests/ui_v2_email_calendar_integrations_accessibility.mjs' },
  { name: 'UI V2 Configuração, Identidade, Administração e Contratos Canônicos', file: 'tests/ui_v2_configuration_admin.mjs' },
  { name: 'UI V2 Configuração/Admin, Acessibilidade e Workspace Responsivo', file: 'tests/ui_v2_configuration_admin_accessibility.mjs' },
  { name: 'Persistência de Configurações, Coalescing e Reload', file: 'tests/configuration_persistence.mjs' },
  { name: 'Persistência Deliberada de Coleções de Configuração Vazias', file: 'tests/configuration_empty_persistence.mjs' },
  { name: 'Primeira Persistência de Instalação Nova e Reload', file: 'tests/new_install_persistence.mjs' },
  { name: 'Fundação de ES Modules e Segurança de Arquivos Estáticos', file: 'tests/frontend_module_foundation.mjs' },
  { name: 'Boot Nativo do Portal e Compatibilidade Legada', file: 'tests/frontend_module_boot.mjs' },
  { name: 'Store Modular, Persistência, Concorrência e Recovery', file: 'tests/store_module.mjs' },
  { name: 'Contrato Booleano da Sincronização e Ausência de Falso Sucesso', file: 'tests/sync_result_contract.mjs' },
  { name: 'Componentes Globais Compartilhados, Foco e Navegação', file: 'tests/shared_components.mjs' },
  { name: 'Onboarding Modular, Primeiro Acesso e Persistência', file: 'tests/onboarding_component.mjs' },
  { name: 'Contrato Canônico Node 24, pnpm e Frozen Lockfile', file: 'tests/toolchain_contract.mjs' },
  { name: 'Gate Documental de Readiness Técnico Pré-UI-V2', file: 'tests/beta_readiness_gate.mjs' },
  { name: 'UI V2 Mode sem Mutação de Store, Revision ou Network', file: 'tests/ui_v2_mode_contract.mjs' },
  { name: 'UI V2 Auth Shell, Estados, Acessibilidade e Responsividade', file: 'tests/ui_v2_auth_shell.mjs' },
  { name: 'UI V2 Onboarding Visual, Temas e Responsividade', file: 'tests/visual_ui_v2_onboarding.mjs' },
  { name: 'UI V2 Foundation, Tokens, Primitives e Isolamento', file: 'tests/ui_v2_foundation.mjs' },
  { name: 'UI V2 Dashboard Piloto e Hierarquia Operacional', file: 'tests/ui_v2_dashboard.mjs' },
  { name: 'UI V2 Acessibilidade, Busca, Dialog e Mobile', file: 'tests/ui_v2_accessibility.mjs' },
  { name: 'UI V2 Processos, Tabela Densa, Inspector e Contratos Funcionais', file: 'tests/ui_v2_processes.mjs' },
  { name: 'UI V2 Processos, Acessibilidade e RecordList Responsiva', file: 'tests/ui_v2_processes_accessibility.mjs' },
  { name: 'UI V2 Publicações, Triagem, Leitura e Tratamento', file: 'tests/ui_v2_publications.mjs' },
  { name: 'UI V2 Publicações, Acessibilidade e Mobile Sheet', file: 'tests/ui_v2_publications_accessibility.mjs' },
  { name: 'UI V2 Tarefas e Kanban, Movimento, Timer e Formulário', file: 'tests/ui_v2_tasks.mjs' },
  { name: 'UI V2 Tarefas, Acessibilidade, RecordList e Drawer', file: 'tests/ui_v2_tasks_accessibility.mjs' },
  { name: 'UI V2 Agenda Integrada, Datas Explícitas e Fluxos Canônicos', file: 'tests/ui_v2_agenda.mjs' },
  { name: 'UI V2 Agenda, Acessibilidade, Calendário e Mobile Sheet', file: 'tests/ui_v2_agenda_accessibility.mjs' },
  { name: 'UI V2 Contatos, Relacionamentos e Contratos Canônicos', file: 'tests/ui_v2_contacts.mjs' },
  { name: 'UI V2 Contatos, Acessibilidade, Inspector e Mobile Sheet', file: 'tests/ui_v2_contacts_accessibility.mjs' },
  { name: 'UI V2 Direção Mineral Editorial, Motion e Isolamento Classic', file: 'tests/ui_v2_visual_direction.mjs' },
  { name: 'Smoke Test E2E Playwright (Fluxo Completo UI / Kanban)', file: 'tests/smoke.mjs' }
];

async function runCommand(args, description) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => {
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      if (code === 0) resolve(duration);
      else reject(new Error(`${description} falhou com código ${code} (${duration}s)`));
    });
  });
}

console.log('===============================================================');
console.log('  ATRIUM SENDA — SUÍTE DE TESTES E AUDITORIA COMPLETA');
console.log('===============================================================');

let hasFailure = false;

console.log('\n[1/2] Verificando sintaxe de todos os módulos JavaScript...');
for (const file of checkFiles) {
  try {
    await runCommand(['--check', file], `Verificação de ${file}`);
    console.log(`  ✓ ${file}`);
  } catch (error) {
    console.error(`  ✗ ${file}: ${error.message}`);
    hasFailure = true;
  }
}

if (hasFailure) {
  console.error('\nErro na verificação de sintaxe. Execução dos testes interrompida.');
  process.exit(1);
}

console.log('\n[2/2] Executando suítes de testes de conformidade...');
const results = [];

for (const suite of testSuites) {
  console.log(`\n--- Executando: ${suite.name} ---`);
  try {
    const duration = await runCommand([suite.file], suite.name);
    results.push({ name: suite.name, file: suite.file, status: 'APROVADO', duration });
  } catch (error) {
    results.push({ name: suite.name, file: suite.file, status: 'FALHOU', error: error.message });
    hasFailure = true;
  }
}

console.log('\n===============================================================');
console.log('                    RELATÓRIO DE RESULTADOS');
console.log('===============================================================');
for (const res of results) {
  const icon = res.status === 'APROVADO' ? '✓' : '✗';
  console.log(`${icon} [${res.status}] ${res.name} (${res.duration || 'erro'}s)`);
}
console.log('===============================================================');

if (hasFailure) {
  console.error('\nAlgumas suítes de teste falharam.');
  process.exit(1);
} else {
  console.log(`\nTodas as ${testSuites.length} suítes de teste e verificações foram APROVADAS com sucesso!`);
  process.exit(0);
}
