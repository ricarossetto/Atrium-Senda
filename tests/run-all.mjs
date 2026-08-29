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
  'scripts/import-advbox.mjs',
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
  'tests/importer.mjs',
  'tests/rls.mjs',
  'tests/collector.mjs',
  'tests/judicial_discovery.mjs',
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
  'tests/features_validation.mjs',
  'tests/open_source_features.mjs',
  'tests/ai-context.mjs',
  'tests/deployment.mjs',
  'tests/system_diagnostic.mjs',
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
  'tests/agenda_feature.mjs',
  'tests/tasks_feature.mjs',
  'tests/processes_feature.mjs',
  'tests/contacts_feature.mjs',
  'tests/leads_feature.mjs',
  'tests/financial_feature.mjs',
  'tests/configuration_persistence.mjs',
  'tests/frontend_module_foundation.mjs',
  'tests/frontend_module_boot.mjs',
  'tests/store_module.mjs',
  'tests/shared_components.mjs',
  'tests/onboarding_component.mjs',
  'tests/visual-qa.mjs'
];

const testSuites = [
  { name: 'Segurança e Criptografia (Auth, TOTP, CSRF, AES-256-GCM)', file: 'tests/security.mjs' },
  { name: 'Importador de Planilhas e Deduplicação (XLSX, PII protegido)', file: 'tests/importer.mjs' },
  { name: 'Políticas Supabase e Row Level Security (RLS AAL2)', file: 'tests/rls.mjs' },
  { name: 'Coletores Judiciais (DJEN, DataJud, PJe sem ciência auto)', file: 'tests/collector.mjs' },
  { name: 'Judicial Discovery (DJEN → DataJud → Processo → Contatos)', file: 'tests/judicial_discovery.mjs' },
  { name: 'RBAC administrativo das integrações judiciais', file: 'tests/judicial_integration_rbac.mjs' },
  { name: 'Vínculo transacional entre Publicações e Tarefas', file: 'tests/publication_task_linking.mjs' },
  { name: 'IDs canônicos do gerador de documentos', file: 'tests/document_type_ids.mjs' },
  { name: 'Feature Modular de Documentos e Gerador de Minutas', file: 'tests/documents_feature.mjs' },
  { name: 'Feature Modular do Assistente IA e Skills Jurídicas', file: 'tests/assistant_feature.mjs' },
  { name: 'Feature Modular da Biblioteca de Prompts', file: 'tests/prompts_feature.mjs' },
  { name: 'Feature Modular de Configurações e Usuários', file: 'tests/configuration_feature.mjs' },
  { name: 'Feature Modular de Administração do Sistema', file: 'tests/system_admin_feature.mjs' },
  { name: 'Feature Modular de Monitoramento', file: 'tests/monitoring_feature.mjs' },
  { name: 'Feature Modular de Integrações Judiciais', file: 'tests/judicial_integrations_feature.mjs' },
  { name: 'Catálogos ADVBOX/Legal One e regras de negócio', file: 'tests/features_validation.mjs' },
  { name: 'Recursos jurídicos, privacidade e cálculos auxiliares', file: 'tests/open_source_features.mjs' },
  { name: 'Minimização de dados no contexto do assistente de IA', file: 'tests/ai-context.mjs' },
  { name: 'Deployment e Conformidade com Nuvem (Render / Cloud)', file: 'tests/deployment.mjs' },
  { name: 'Diagnóstico do Sistema, Backups Criptografados & Feedback Beta', file: 'tests/system_diagnostic.mjs' },
  { name: 'Backup / Restore Atômico, Cifrado e Revision-Safe', file: 'tests/backup_restore.mjs' },
  { name: 'Arquitetura Judicial, A1 Sandbox (mTLS) & TOTP Sandbox', file: 'tests/judicial_sandbox.mjs' },
  { name: 'Higiene de Estado, Migrações Determinísticas & Recuperação', file: 'tests/state_migrations.mjs' },
  { name: 'Motor SMTP e Entrega Segura de E-mail de Teste', file: 'tests/email_service.mjs' },
  { name: 'Workflow de Tratamento e Triagem de Publicações', file: 'tests/publications_treatment.mjs' },
  { name: 'Feature Modular de Publicações e Intimações', file: 'tests/publications_feature.mjs' },
  { name: 'Feature Modular de Agenda Integrada', file: 'tests/agenda_feature.mjs' },
  { name: 'Feature Modular de Tarefas e Kanban', file: 'tests/tasks_feature.mjs' },
  { name: 'Feature Modular de Processos', file: 'tests/processes_feature.mjs' },
  { name: 'Feature Modular de Contatos', file: 'tests/contacts_feature.mjs' },
  { name: 'Feature Modular de Leads e CRM', file: 'tests/leads_feature.mjs' },
  { name: 'Feature Modular Financeiro, RPV e Honorários', file: 'tests/financial_feature.mjs' },
  { name: 'Persistência de Configurações, Coalescing e Reload', file: 'tests/configuration_persistence.mjs' },
  { name: 'Fundação de ES Modules e Segurança de Arquivos Estáticos', file: 'tests/frontend_module_foundation.mjs' },
  { name: 'Boot Nativo do Portal e Compatibilidade Legada', file: 'tests/frontend_module_boot.mjs' },
  { name: 'Store Modular, Persistência, Concorrência e Recovery', file: 'tests/store_module.mjs' },
  { name: 'Componentes Globais Compartilhados, Foco e Navegação', file: 'tests/shared_components.mjs' },
  { name: 'Onboarding Modular, Primeiro Acesso e Persistência', file: 'tests/onboarding_component.mjs' },
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
