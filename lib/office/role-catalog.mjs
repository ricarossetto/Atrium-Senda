export const OFFICE_PERMISSIONS = Object.freeze([
  'office.manage',
  'office.principal',
  'members.manage',
  'roles.manage',
  'teams.manage',
  'processes.read_all',
  'processes.create',
  'processes.assign',
  'processes.archive',
  'publications.read_all',
  'publications.treat',
  'tasks.read_all',
  'tasks.assign',
  'clients.read_all',
  'crm.read_all',
  'agenda.read_all',
  'documents.read_all',
  'finance.read',
  'finance.write',
  'reports.read_all',
  'audit.read',
  'integrations.manage',
  'settings.manage',
  'ai.use',
  'private_monitoring.self'
]);

const ALL = new Set(OFFICE_PERMISSIONS);
const MANAGER = new Set([...OFFICE_PERMISSIONS].filter(permission => permission !== 'office.principal'));

// Descrição legível e risco de cada permissão. A rota de gestão de papéis expõe
// este catálogo para que quem concede saiba o custo da concessão antes de salvar.
const PERMISSION_LABELS = Object.freeze({
  'office.manage': 'Administrar o escritório',
  'office.principal': 'Titularidade do escritório',
  'members.manage': 'Administrar membros',
  'roles.manage': 'Administrar papéis',
  'teams.manage': 'Administrar equipes',
  'processes.read_all': 'Ler todos os processos',
  'processes.create': 'Criar processos',
  'processes.assign': 'Atribuir processos',
  'processes.archive': 'Arquivar processos',
  'publications.read_all': 'Ler todas as publicações',
  'publications.treat': 'Tratar publicações',
  'tasks.read_all': 'Ler todas as tarefas',
  'tasks.assign': 'Atribuir tarefas',
  'clients.read_all': 'Ler todos os clientes',
  'crm.read_all': 'Ler o CRM',
  'agenda.read_all': 'Ler a agenda completa',
  'documents.read_all': 'Ler todos os documentos',
  'finance.read': 'Ler o financeiro',
  'finance.write': 'Escrever no financeiro',
  'reports.read_all': 'Ler todos os relatórios',
  'audit.read': 'Ler a auditoria',
  'integrations.manage': 'Administrar integrações',
  'settings.manage': 'Administrar configurações',
  'ai.use': 'Usar o assistente de IA',
  'private_monitoring.self': 'Monitoramento privado do próprio acervo'
});

const RISK_NOTES = Object.freeze({
  critico: 'Dá controle administrativo do escritório ou permite ampliar o próprio acesso. Conceda apenas ao titular e a gestores de confiança.',
  alto: 'Dá acesso a dados sensíveis ou muda o trabalho de outras pessoas. Revise antes de conceder.',
  medio: 'Amplia a leitura ou a operação do dia a dia sem entregar controle administrativo.',
  baixo: 'O efeito fica restrito ao próprio usuário.'
});

const RISK_BY_PERMISSION = Object.freeze({
  'office.principal': 'critico',
  'office.manage': 'critico',
  'roles.manage': 'critico',
  'settings.manage': 'critico',
  'integrations.manage': 'critico',
  'members.manage': 'alto',
  'finance.write': 'alto',
  'finance.read': 'alto',
  'audit.read': 'alto',
  'publications.treat': 'alto',
  'processes.assign': 'alto',
  'processes.archive': 'alto',
  'tasks.assign': 'alto',
  'private_monitoring.self': 'baixo'
});

export const OFFICE_PERMISSION_CATALOG = Object.freeze(OFFICE_PERMISSIONS.map(id => {
  const risk = RISK_BY_PERMISSION[id] || 'medio';
  return Object.freeze({ id, label: PERMISSION_LABELS[id] || id, risk, riskNote: RISK_NOTES[risk] });
}));

export const OFFICE_ROLES = Object.freeze([
  {
    id: 'office_principal',
    name: 'Administrador principal',
    description: 'Titular do escritório; único, com todas as permissões e a palavra final na governança.',
    memberKinds: ['lawyer', 'staff'],
    defaultPermissions: [...ALL]
  },
  {
    id: 'office_manager',
    name: 'Gestor do escritório',
    description: 'Administra pessoas, equipes, atribuições e configurações do escritório.',
    memberKinds: ['lawyer', 'staff'],
    defaultPermissions: [...MANAGER]
  },
  {
    id: 'partner',
    name: 'Sócio',
    description: 'Atua nos processos atribuídos e nas equipes; financeiro e leitura ampla dependem de concessão.',
    memberKinds: ['lawyer'],
    defaultPermissions: ['processes.create', 'publications.treat', 'tasks.assign', 'ai.use', 'private_monitoring.self']
  },
  {
    id: 'associate',
    name: 'Advogado associado',
    description: 'Atua nos processos e equipes atribuídos; sem financeiro e sem administração por padrão.',
    memberKinds: ['lawyer'],
    defaultPermissions: ['processes.create', 'publications.treat', 'ai.use', 'private_monitoring.self']
  },
  {
    id: 'contractor',
    name: 'Advogado contratado',
    description: 'Atua apenas nos processos atribuídos; sem financeiro e sem administração.',
    memberKinds: ['lawyer'],
    defaultPermissions: ['processes.create', 'publications.treat', 'ai.use', 'private_monitoring.self']
  },
  {
    id: 'paralegal',
    name: 'Apoio / paralegal',
    description: 'Apoia tarefas e processos atribuídos; tratamento de publicação é configurável.',
    memberKinds: ['staff'],
    defaultPermissions: ['ai.use']
  },
  {
    id: 'intern',
    name: 'Estagiário',
    description: 'Leitura e tarefas dos processos atribuídos; sem tratamento por padrão.',
    memberKinds: ['staff'],
    defaultPermissions: []
  },
  {
    id: 'finance',
    name: 'Financeiro',
    description: 'Lê e escreve o financeiro, com referências mínimas de cliente/processo.',
    memberKinds: ['staff'],
    defaultPermissions: ['finance.read', 'finance.write', 'clients.read_all']
  },
  {
    id: 'operations',
    name: 'Operações',
    description: 'Administração e integrações conforme delegação; sem conteúdo jurídico ou financeiro por padrão.',
    memberKinds: ['staff'],
    defaultPermissions: ['audit.read', 'settings.manage']
  }
]);

export const MEMBER_KINDS = Object.freeze([
  { id: 'lawyer', name: 'Advogado(a)' },
  { id: 'staff', name: 'Funcionário(a)' }
]);

const FACTORY_ROLE_IDS = new Set(OFFICE_ROLES.map(role => role.id));

// Papéis próprios do escritório vivem em security.json (autoridade de RBAC) e são
// registrados aqui para que a resolução de permissões da sessão enxergue o mesmo
// catálogo. O mapa é somente de leitura para o resto do sistema: quem grava é o
// SecurityManager. Papel desativado sai do mapa e deixa de ser atribuível.
// O mapa reúne todos os escritórios; a separação acontece na resolução.
const customRoles = new Map();

// A chave composta impede que duas gravações com o mesmo id em escritórios
// diferentes colidam no mapa e uma sobrescreva a outra.
function customRoleKey(workspaceId, roleId) {
  return `${String(workspaceId || '')}::${String(roleId || '')}`;
}

export function isFactoryOfficeRole(roleId) {
  return FACTORY_ROLE_IDS.has(String(roleId || ''));
}

export function registerOfficeRoles(roles = []) {
  customRoles.clear();
  for (const role of Array.isArray(roles) ? roles : []) {
    if (!role?.id || FACTORY_ROLE_IDS.has(role.id) || role.active === false) continue;
    const permissions = [...new Set((Array.isArray(role.defaultPermissions) ? role.defaultPermissions : []).filter(permission => ALL.has(permission)))];
    const memberKinds = (Array.isArray(role.memberKinds) ? role.memberKinds : []).filter(kind => ['lawyer', 'staff'].includes(kind));
    const scope = String(role.workspaceId || '');
    customRoles.set(customRoleKey(scope, role.id), {
      id: role.id,
      workspaceId: scope,
      name: role.name,
      description: role.description || '',
      memberKinds: memberKinds.length ? memberKinds : ['lawyer', 'staff'],
      defaultPermissions: permissions
    });
  }
  return customRoles.size;
}

// Papel de fábrica é idêntico em todos os escritórios e resolve sempre. Papel
// personalizado pertence ao escritório que o criou: sem workspaceId a resolução
// falha fechada, e o workspaceId de outro escritório também não resolve. Assim
// um papel do escritório A nunca é concedido no escritório B.
export function roleById(roleId, workspaceId = '') {
  const factoryRole = OFFICE_ROLES.find(role => role.id === roleId);
  if (factoryRole) return factoryRole;
  const scope = String(workspaceId || '');
  if (!scope) return null;
  const customRole = customRoles.get(customRoleKey(scope, roleId));
  if (!customRole) return null;
  return customRole.workspaceId === scope ? customRole : null;
}

export function legacyRoleToOfficeRole(role) {
  if (role === 'master_admin') return 'office_principal';
  if (role === 'admin') return 'office_manager';
  return 'associate';
}

// Proteção da titularidade. O papel `office_principal` é único e privativo, e o
// titular não pode ser desativado, removido nem rebaixado por caminho nenhum. A
// O predicado e a mensagem moram aqui para que a autoridade de RBAC
// (`lib/security.mjs`) e as rotas HTTP (`lib/http/office-routes.mjs`) recusem com
// o mesmo critério, sem divergir.
export const PRINCIPAL_PROTECTION_MESSAGE = 'O administrador principal (titular do escritório) não pode ser desativado, removido ou rebaixado. Faça antes a transferência de titularidade.';

export function principalTransferRequiredError() {
  return Object.assign(new Error('O escritório tem um único titular. Para trocar, use a transferência de titularidade.'), { statusCode: 409, code: 'PRINCIPAL_TRANSFER_REQUIRED' });
}

export function isOfficePrincipalMember(user) {
  if (!user) return false;
  if (user.isPrincipal || user.role === 'master_admin') return true;
  return (user.officeRoleId || legacyRoleToOfficeRole(user.role)) === 'office_principal';
}

export function principalProtectionError() {
  return Object.assign(new Error(PRINCIPAL_PROTECTION_MESSAGE), { statusCode: 409 });
}

// Recusa apenas mutações que ferem a titularidade. Qualquer outro campo
// (nome, equipes, permissões, status `active`) continua liberado.
export function assertPrincipalMutationAllowed(user, { status, officeRoleId } = {}) {
  if (!isOfficePrincipalMember(user)) return true;
  if (officeRoleId && officeRoleId !== 'office_principal') throw principalProtectionError();
  if (status && status !== 'active') throw principalProtectionError();
  return true;
}

export function memberKindForRole(roleId, workspaceId = '') {
  return roleById(roleId, workspaceId)?.memberKinds?.includes('staff') && !roleById(roleId, workspaceId)?.memberKinds?.includes('lawyer') ? 'staff' : 'lawyer';
}

export function defaultMemberKind({ memberKind, roleId, oab, workspaceId = '' }) {
  if (memberKind === 'lawyer' || memberKind === 'staff') return memberKind;
  const role = roleById(roleId, workspaceId);
  if (role?.memberKinds?.length === 1) return role.memberKinds[0];
  return String(oab || '').replace(/\D/g, '') ? 'lawyer' : 'staff';
}

export function resolveOfficePermissions(roleId, overrides = [], workspaceId = '') {
  const role = roleById(roleId, workspaceId);
  const base = new Set(role?.defaultPermissions || []);
  if (Array.isArray(overrides)) {
    for (const permission of overrides) if (ALL.has(permission)) base.add(permission);
  }
  return [...base];
}

export function hasOfficePermission(roleId, overrides, permission, workspaceId = '') {
  return resolveOfficePermissions(roleId, overrides, workspaceId).includes(permission);
}

function badRequestError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

// Validação única de papel + tipo de membro. As mensagens são as mesmas já usadas
// no convite e na edição de membro; não altere o texto sem revisar os consumidores.
export function assertMemberKindMatchesRole(roleId, memberKind, workspaceId = '') {
  const role = roleById(roleId, workspaceId);
  if (!role) throw badRequestError('Papel do escritório inválido.');
  // Papel próprio pertence a um escritório: de fora, ele é tratado como inexistente.
  if (role.workspaceId && workspaceId && role.workspaceId !== workspaceId) throw badRequestError('Papel do escritório inválido.');
  if (!role.memberKinds.includes(memberKind)) throw badRequestError('Este papel não é compatível com o tipo de membro.');
  return true;
}

const ROLE_ESCALATION_MESSAGE = 'Esta ação foi recusada porque o papel ou a permissão excede o que você pode conceder. Peça a um gestor ou ao titular do escritório para fazer a concessão.';

function roleEscalationError() {
  return Object.assign(new Error(ROLE_ESCALATION_MESSAGE), { statusCode: 409, code: 'ROLE_ESCALATION' });
}

// Comparação de custo do papel alvo quando o chamador não informa o escritório
// (a rota de convite não recebe escopo e não pode ser alterada aqui). Esta busca
// ampla serve apenas para medir permissões; ela NÃO autoriza gravação: toda
// escrita revalida o papel contra o workspace e recusa papel de outro escritório.
function roleForGrantComparison(roleId) {
  const id = String(roleId || '');
  for (const role of customRoles.values()) if (role.id === id) return role;
  return null;
}

// Escalonamento de privilégio: ninguém concede papel ou permissão que não possui.
// "Acima" aqui é conjunto de permissões, não nível: o papel alvo só pode ter
// permissões que o ator já detém. Conceder gestor ou titular exige office.principal.
// Com `workspaceId`, papel de outro escritório não existe neste escopo e vira erro
// de entrada (400). Sem escopo, mantém-se o contrato 409 ROLE_ESCALATION.
export function assertCanGrantOfficeRole({ actorRoleId = '', actorPermissions = [], targetRoleId = null, targetPermissions = [], workspaceId = '' } = {}) {
  const scoped = String(workspaceId || '');
  const effective = new Set(resolveOfficePermissions(actorRoleId, actorPermissions, workspaceId));
  const requested = Array.isArray(targetPermissions) ? targetPermissions.map(String) : [];
  for (const permission of requested) if (!ALL.has(permission)) throw roleEscalationError();
  if (targetRoleId) {
    const targetRole = roleById(targetRoleId, workspaceId) || (scoped ? null : roleForGrantComparison(targetRoleId));
    if (!targetRole) {
      if (scoped) throw badRequestError('Papel do escritório inválido.');
      throw roleEscalationError();
    }
    if (['office_manager', 'office_principal'].includes(targetRole.id) && !effective.has('office.principal')) throw roleEscalationError();
    for (const permission of targetRole.defaultPermissions) if (!effective.has(permission)) throw roleEscalationError();
  }
  for (const permission of requested) if (!effective.has(permission)) throw roleEscalationError();
  return true;
}

export function publicRoleCatalog() {
  return OFFICE_ROLES.map(role => ({
    id: role.id,
    name: role.name,
    description: role.description,
    memberKinds: [...role.memberKinds],
    permissions: [...role.defaultPermissions]
  }));
}
