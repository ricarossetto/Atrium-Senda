import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import QRCode from 'qrcode';
import {
  createWorkspaceId,
  DEFAULT_WORKSPACE_NAME,
  migrateWorkspaceIdentity,
  normalizeWorkspaceName,
  publicWorkspace,
  resolveWorkspace
} from './workspaces/workspace-identity.mjs';
import {
  OFFICE_PERMISSIONS,
  OFFICE_PERMISSION_CATALOG,
  OFFICE_ROLES,
  MEMBER_KINDS,
  assertMemberKindMatchesRole,
  assertPrincipalMutationAllowed,
  defaultMemberKind,
  hasOfficePermission,
  isFactoryOfficeRole,
  isOfficePrincipalMember,
  legacyRoleToOfficeRole,
  principalProtectionError,
  publicRoleCatalog,
  registerOfficeRoles,
  resolveOfficePermissions,
  roleById
} from './office/role-catalog.mjs';

const scrypt = promisify(scryptCallback);
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const SETUP_TOKEN_MS = 10 * 60 * 1000;
const TEAM_INVITATION_MS = 48 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_ACCOUNT_MAX_FAILURES = 10;
const LOGIN_ADDRESS_MAX_FAILURES = 20;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_BLOCK_MS = 60 * 60 * 1000;
const LOGIN_ATTEMPT_MAX_ENTRIES = 2000;
const SETUP_MAX_ATTEMPTS_PER_ADDRESS = 10;
const SETUP_MAX_VERIFICATION_ATTEMPTS = 5;
const TOTP_STEP_MS = 30_000;
const TRUSTED_DEVICE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const STEP_UP_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_TOKEN_MS = 30 * 60 * 1000;
const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_MAX_PER_IDENTITY = 5;
const PASSWORD_RESET_MAX_PER_ADDRESS = 30;
const PASSWORD_RESET_MAX_ENTRIES = 2000;
const PASSWORD_RESET_EQUALIZATION_ROUNDS = 6000;
const PASSWORD_RESET_TOKEN_MESSAGE = 'Este link de redefinição de senha não é mais válido: ele já foi utilizado, expirou ou foi substituído por uma solicitação mais recente. Solicite um novo link.';

// Cada prefixo de bucket define janela, teto de falhas e backoff progressivo.
// O bloqueio dobra a cada reincidência até LOGIN_MAX_BLOCK_MS.
const LOGIN_BUCKET_SPECS = Object.freeze({
  attempt: { windowMs: LOGIN_WINDOW_MS, maxFailures: LOGIN_MAX_FAILURES, baseBlockMs: LOGIN_BLOCK_MS, maxBlockMs: LOGIN_MAX_BLOCK_MS },
  account: { windowMs: LOGIN_WINDOW_MS, maxFailures: LOGIN_ACCOUNT_MAX_FAILURES, baseBlockMs: LOGIN_BLOCK_MS, maxBlockMs: LOGIN_MAX_BLOCK_MS },
  address: { windowMs: LOGIN_WINDOW_MS, maxFailures: LOGIN_ADDRESS_MAX_FAILURES, baseBlockMs: LOGIN_BLOCK_MS, maxBlockMs: LOGIN_MAX_BLOCK_MS },
  setup: { windowMs: LOGIN_WINDOW_MS, maxFailures: SETUP_MAX_ATTEMPTS_PER_ADDRESS, baseBlockMs: LOGIN_BLOCK_MS, maxBlockMs: LOGIN_MAX_BLOCK_MS },
  mfa: { windowMs: LOGIN_WINDOW_MS, maxFailures: LOGIN_MAX_FAILURES, baseBlockMs: LOGIN_BLOCK_MS, maxBlockMs: LOGIN_MAX_BLOCK_MS },
  factoryReset: { windowMs: LOGIN_WINDOW_MS, maxFailures: LOGIN_MAX_FAILURES, baseBlockMs: LOGIN_BLOCK_MS, maxBlockMs: LOGIN_MAX_BLOCK_MS },
  passwordChange: { windowMs: LOGIN_WINDOW_MS, maxFailures: LOGIN_MAX_FAILURES, baseBlockMs: LOGIN_BLOCK_MS, maxBlockMs: LOGIN_MAX_BLOCK_MS }
});
const UNIFORM_CREDENTIAL_MESSAGE = 'Usuário ou senha inválido.';

// Um registro legado (sem `mfaEnabled`) que carrega `encryptedTotp` persistido é
// tratado como 2FA ATIVO. A regra fica em um único predicado para que o login, o
// step-up e os guards de reconfiguração (enable/enrollment) nunca divirjam.
function hasActiveMfa(user) {
  return user?.mfaEnabled === true || (user?.mfaEnabled === undefined && Boolean(user?.encryptedTotp));
}

export class SecurityManager {
  constructor({ dataDirectory, sessionSecret, encryptionKey, secureCookies = false, allowWorkspaceRegistration = true, bootstrapRequired = false }) {
    this.file = path.join(dataDirectory, 'security.json');
    this.dataDirectory = dataDirectory;
    this.sessionSecret = Buffer.from(sessionSecret, 'base64url');
    this.encryptionKey = Buffer.from(encryptionKey, 'base64');
    if (this.sessionSecret.length < 32) throw new Error('AUTH_SESSION_SECRET deve ter ao menos 32 bytes em base64url.');
    if (this.encryptionKey.length !== 32) throw new Error('AUTH_ENCRYPTION_KEY deve conter exatamente 32 bytes em base64.');
    this.secureCookies = secureCookies;
    this.allowWorkspaceRegistration = Boolean(allowWorkspaceRegistration);
    this.bootstrapRequired = Boolean(bootstrapRequired);
    this.state = { configured: false };
    this.saveTail = Promise.resolve();
    this.sessions = new Map();
    this.loginAttempts = new Map();
    this.workspaceRegistrationAttempts = new Map();
    this.passwordResetAttempts = new Map();
  }

  async init() {
    await mkdir(this.dataDirectory, { recursive: true });
    try { this.state = { configured: false, ...JSON.parse(await readFile(this.file, 'utf8')) }; } catch { /* primeira execução */ }
    this.state.trustedDevices = Array.isArray(this.state.trustedDevices) ? this.state.trustedDevices.filter(device => Number(device.expiresAt) > Date.now()).slice(-10) : [];
    if (!Array.isArray(this.state.users)) {
      this.state.users = [];
      if (this.state.configured && this.state.username) {
        this.state.users.push({
          id: 'usr-master-1',
          username: this.state.username,
          displayName: this.state.displayName || 'Administrador',
          email: this.state.email || '',
          oab: this.state.oab || '',
          oabUf: this.state.oabUf || '',
          judicialMonitoringEnabled: this.state.judicialMonitoringEnabled,
          role: 'master_admin',
          status: 'active',
          salt: this.state.salt,
          passwordHash: this.state.passwordHash,
          encryptedTotp: this.state.encryptedTotp,
          createdAt: this.state.createdAt || new Date().toISOString()
        });
      }
    }
    this.state.pendingRegistrations = Array.isArray(this.state.pendingRegistrations)
      ? this.state.pendingRegistrations.filter(registration => Number(registration.expiresAt) > Date.now()).slice(-20)
      : [];
    this.state.pendingWorkspaceRegistrations = Array.isArray(this.state.pendingWorkspaceRegistrations)
      ? this.state.pendingWorkspaceRegistrations.filter(registration => Number(registration.expiresAt) > Date.now()).slice(-20)
      : [];
    this.state.teamInvitations = Array.isArray(this.state.teamInvitations)
      ? this.state.teamInvitations.filter(invitation => !invitation.acceptedAt && Number(invitation.expiresAt) > Date.now()).slice(-100)
      : [];
    this.state.passwordResetTokens = Array.isArray(this.state.passwordResetTokens)
      ? this.state.passwordResetTokens.filter(entry => entry?.tokenHash && entry?.username && Number(entry.expiresAt) > Date.now()).slice(-100)
      : [];
    this.state.collectorAgents = Array.isArray(this.state.collectorAgents)
      ? this.state.collectorAgents.filter(agent => agent?.workspaceId && agent?.tokenHash).slice(-100)
      : [];
    // Limitações de tentativas sobrevivem ao reinício. A hidratação acontece ANTES de
    // qualquer save() das migrações: save() espelha o Map em memória no estado e, com o
    // Map ainda vazio, apagaria os baldes persistidos (bloqueio de login não sobrevivia).
    const now = Date.now();
    const loginHydration = hydrateLoginAttempts(this.state.loginAttempts, now);
    const passwordResetHydration = hydratePasswordResetAttempts(this.state.passwordResetAttempts, now);
    const workspaceRegistrationHydration = hydrateWorkspaceRegistrationAttempts(this.state.workspaceRegistrationAttempts, now);
    this.loginAttempts = loginHydration.map;
    this.passwordResetAttempts = passwordResetHydration.map;
    this.workspaceRegistrationAttempts = workspaceRegistrationHydration.map;
    const attemptsHydrationChanged = loginHydration.changed || passwordResetHydration.changed || workspaceRegistrationHydration.changed;
    const workspaceMigration = migrateWorkspaceIdentity(this.state);
    this.state = workspaceMigration.state;
    const officeRolesMigration = this.hydrateOfficeRoles();
    const officeMigration = this.hydrateOfficeAccess();
    if (workspaceMigration.changed || officeMigration.changed || officeRolesMigration.changed || attemptsHydrationChanged) await this.save();
  }

  publicStatus(req) {
    const session = this.authenticate(req);
    return {
      configured: Boolean(this.state.configured),
      authenticated: Boolean(session),
      user: session ? publicProfile(session) : null,
      workspace: session ? publicWorkspace(resolveWorkspace(this.state, session.workspaceId)) : null,
      csrfToken: session?.csrfToken || null,
      mfaRequired: false,
      trustedDevice: Boolean(this.findTrustedDevice(req)),
      workspaceRegistrationEnabled: this.allowWorkspaceRegistration,
      bootstrapRequired: !this.state.configured && this.bootstrapRequired,
      setupMfaRequired: false
    };
  }

  async registerUser({ username, displayName, email, oab, password, memberKind = '', officeRoleId = '', teamIds = [], permissionOverrides } = {}, workspaceId = this.state.defaultWorkspaceId) {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const normalizedName = String(displayName || '').trim();
    assertDisplayNameAllowed(normalizedName);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    validateUsername(normalizedUsername);
    validatePassword(password);
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw httpError(400, 'Informe um endereço de e-mail válido.');
    }
    if (normalizedName.length < 3 || normalizedName.length > 100) {
      throw httpError(400, 'Informe o nome completo do usuário.');
    }

    // Papel e tipo de membro são validados aqui, antes de qualquer decisão de
    // escalonamento: papel inexistente ou incompatível é erro de entrada (400).
    const requestedRoleId = String(officeRoleId || '').trim();
    const requestedKind = String(memberKind || '').trim();
    if (requestedRoleId || requestedKind) {
      const effectiveRoleId = requestedRoleId || 'associate';
      const effectiveKind = requestedKind || defaultMemberKind({ roleId: effectiveRoleId, oab, workspaceId });
      assertMemberKindMatchesRole(effectiveRoleId, effectiveKind, workspaceId);
    }
    // Permissão fora do catálogo nunca é gravada; recusa explícita em vez de descarte silencioso.
    if (permissionOverrides !== undefined && permissionOverrides !== null) {
      if (!Array.isArray(permissionOverrides)) throw httpError(400, 'Lista de permissões inválida.');
      for (const permission of permissionOverrides) {
        if (!OFFICE_PERMISSIONS.includes(String(permission))) throw httpError(400, 'Permissão do escritório inválida.');
      }
    }

    if (!Array.isArray(this.state.users)) this.state.users = [];
    this.state.pendingRegistrations = (this.state.pendingRegistrations || []).filter(registration => Number(registration.expiresAt) > Date.now()).slice(-19);
    const exists = this.state.users.some(u => u.username === normalizedUsername || (u.email && u.email.toLowerCase() === normalizedEmail))
      || this.state.pendingRegistrations.some(u => u.username === normalizedUsername || u.email === normalizedEmail);
    if (exists || (this.state.configured && constantEqual(normalizedUsername, this.state.username))) {
      throw httpError(409, 'Este usuário ou e-mail já está cadastrado no sistema.');
    }

    const salt = randomBytes(16).toString('base64');
    const passwordHash = await hashPassword(password, salt);
    const totpSecret = encodeBase32(randomBytes(20));
    const nonce = randomBytes(18).toString('base64url');
    const expiresAt = Date.now() + SETUP_TOKEN_MS;
    const issuer = 'ATRIUM';
    const account = `${issuer}:${normalizedUsername}`;
    const pendingRegistration = {
      username: normalizedUsername,
      displayName: normalizedName,
      email: normalizedEmail,
      oab: String(oab || '').trim(),
      memberKind: memberKind || '',
      officeRoleId: officeRoleId || '',
      teamIds: Array.isArray(teamIds) ? [...teamIds] : [],
      workspaceId,
      salt,
      passwordHash,
      encryptedTotp: this.encrypt(totpSecret),
      nonce,
      expiresAt,
      createdAt: new Date().toISOString()
    };
    this.state.pendingRegistrations.push(pendingRegistration);
    this.state.updatedAt = new Date().toISOString();
    await this.save();

    return {
      setupToken: this.signSetupToken({ nonce, expiresAt }),
      manualSecret: totpSecret,
      qrCode: await QRCode.toDataURL(`otpauth://totp/${encodeURIComponent(account)}?secret=${totpSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
    };
  }

  listTeams(workspaceId = this.state.defaultWorkspaceId) {
    return (this.state.teams || [])
      .filter(team => team.workspaceId === workspaceId)
      .map(publicTeam);
  }

  async createTeam({ name, description = '', memberIds = [] } = {}, workspaceId = this.state.defaultWorkspaceId) {
    const workspace = resolveWorkspace(this.state, workspaceId);
    if (!workspace || workspace.status !== 'active') throw httpError(404, 'Escritório não encontrado.');
    const normalizedName = String(name || '').trim().replace(/\s+/g, ' ');
    if (normalizedName.length < 2 || normalizedName.length > 60) throw httpError(400, 'Informe um nome de equipe entre 2 e 60 caracteres.');
    const normalizedDescription = String(description || '').trim().slice(0, 280);
    const requestedIds = [...new Set((Array.isArray(memberIds) ? memberIds : []).map(id => String(id || '').trim()).filter(Boolean))].slice(0, 50);
    const activeMembers = (this.state.users || []).filter(user => user.workspaceId === workspaceId && user.status === 'active' && requestedIds.includes(user.id));
    if (activeMembers.length !== requestedIds.length) throw httpError(400, 'A equipe contém integrante inexistente ou inativo.');
    const duplicate = (this.state.teams || []).some(team => team.workspaceId === workspaceId && String(team.name).toLowerCase() === normalizedName.toLowerCase());
    if (duplicate) throw httpError(409, 'Já existe uma equipe com este nome.');
    const now = new Date().toISOString();
    const team = {
      id: `team-${Date.now()}-${randomBytes(4).toString('hex')}`,
      workspaceId,
      name: normalizedName,
      description: normalizedDescription,
      memberIds: requestedIds,
      createdAt: now,
      updatedAt: now
    };
    if (!Array.isArray(this.state.teams)) this.state.teams = [];
    this.state.teams.push(team);
    this.state.updatedAt = now;
    await this.save();
    return publicTeam(team);
  }

  async updateTeam(teamId, { name, description, memberIds } = {}, workspaceId = this.state.defaultWorkspaceId) {
    const team = (this.state.teams || []).find(item => item.id === teamId && item.workspaceId === workspaceId);
    if (!team) throw httpError(404, 'Equipe não encontrada.');
    if (name !== undefined) {
      const normalizedName = String(name || '').trim().replace(/\s+/g, ' ');
      if (normalizedName.length < 2 || normalizedName.length > 60) throw httpError(400, 'Informe um nome de equipe entre 2 e 60 caracteres.');
      const duplicate = (this.state.teams || []).some(item => item.id !== team.id && item.workspaceId === workspaceId && String(item.name).toLowerCase() === normalizedName.toLowerCase());
      if (duplicate) throw httpError(409, 'Já existe uma equipe com este nome.');
      team.name = normalizedName;
    }
    if (description !== undefined) team.description = String(description || '').trim().slice(0, 280);
    if (memberIds !== undefined) {
      const requestedIds = [...new Set((Array.isArray(memberIds) ? memberIds : []).map(id => String(id || '').trim()).filter(Boolean))].slice(0, 50);
      const activeMembers = (this.state.users || []).filter(user => user.workspaceId === workspaceId && user.status === 'active' && requestedIds.includes(user.id));
      if (activeMembers.length !== requestedIds.length) throw httpError(400, 'A equipe contém integrante inexistente ou inativo.');
      team.memberIds = requestedIds;
    }
    team.updatedAt = new Date().toISOString();
    this.state.updatedAt = team.updatedAt;
    await this.save();
    return publicTeam(team);
  }

  // O predicado de uso é injetado pelo chamador HTTP: `lib/security.mjs` não conhece
  // processos nem o Store de negócio. Sem o predicado, a exclusão é recusada — nenhum
  // chamador consegue pular a conferência.
  async deleteTeam(teamId, workspaceId = this.state.defaultWorkspaceId, { isTeamInUse } = {}) {
    const team = (this.state.teams || []).find(item => item.id === teamId && item.workspaceId === workspaceId);
    if (!team) throw httpError(404, 'Equipe não encontrada.');
    if (typeof isTeamInUse !== 'function') {
      // Falha do chamador, não do usuário: sem predicado a exclusão continua proibida.
      throw httpError(500, 'A exclusão de equipe exige a verificação de uso por processo.');
    }
    if (await isTeamInUse(teamId)) throw teamInUseError();
    this.state.teams = (this.state.teams || []).filter(item => item.id !== teamId);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return true;
  }

  /** Troca de titular em um passo: o anterior vira gestor, para o escritório nunca ficar sem nenhum. */
  async transferOfficePrincipal(toUserId, fromUserId, workspaceId = this.state.defaultWorkspaceId) {
    const users = (this.state.users || []).filter(item => item.workspaceId === workspaceId);
    const from = users.find(item => item.id === fromUserId || item.username === fromUserId);
    const to = users.find(item => item.id === toUserId || item.username === toUserId);
    if (!from || !to) throw httpError(404, 'Membro não localizado neste escritório.');
    if (from === to) throw httpError(400, 'Escolha outro membro para receber a titularidade.');
    if (to.status !== 'active') throw httpError(409, 'A titularidade só pode ir para um membro ativo.');
    assertMemberKindMatchesRole('office_principal', defaultMemberKind({ memberKind: to.memberKind, roleId: 'office_principal', oab: to.oab, workspaceId }), workspaceId);
    to.officeRoleId = 'office_principal';
    to.role = 'master_admin';
    from.officeRoleId = 'office_manager';
    from.role = 'admin';
    for (const [key, session] of this.sessions) {
      if (session.username === to.username || session.username === from.username) this.sessions.delete(key);
    }
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return publicProfile(to);
  }

  listTeamInvitations(workspaceId = this.state.defaultWorkspaceId) {
    return (this.state.teamInvitations || [])
      .filter(invitation => invitation.workspaceId === workspaceId && !invitation.acceptedAt && Number(invitation.expiresAt) > Date.now())
      .map(invitation => ({
        id: invitation.id,
        displayName: invitation.displayName,
        email: invitation.email,
        role: invitation.role,
        memberKind: invitation.memberKind || '',
        officeRoleId: invitation.officeRoleId || '',
        teamIds: Array.isArray(invitation.teamIds) ? [...invitation.teamIds] : [],
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt
      }));
  }

  async createTeamInvitation({ displayName, email, role = 'collaborator', memberKind = '', officeRoleId = '', teamIds = [] }, workspaceId = this.state.defaultWorkspaceId) {
    const workspace = resolveWorkspace(this.state, workspaceId);
    if (!workspace || workspace.status !== 'active') throw httpError(404, 'Escritório não encontrado.');
    const normalizedName = String(displayName || '').trim().replace(/\s+/g, ' ');
    assertDisplayNameAllowed(normalizedName);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (normalizedName.length < 3 || normalizedName.length > 100) throw httpError(400, 'Informe o nome completo do integrante.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw httpError(400, 'Informe um endereço de e-mail válido.');
    if (role !== 'collaborator') throw httpError(400, 'Novos convites devem começar com o perfil de colaborador.');
    const invitationRoleId = officeRoleId || 'associate';
    const invitationKind = defaultMemberKind({ memberKind, roleId: invitationRoleId, workspaceId });
    assertMemberKindMatchesRole(invitationRoleId, invitationKind, workspaceId);
    const validTeamIds = (this.state.teams || []).filter(team => team.workspaceId === workspaceId).map(team => team.id);
    const invitationTeamIds = [...new Set((Array.isArray(teamIds) ? teamIds : []).map(String).filter(id => validTeamIds.includes(id)))];
    const duplicate = (this.state.users || []).some(user => user.email?.toLowerCase() === normalizedEmail)
      || (this.state.pendingRegistrations || []).some(user => user.email === normalizedEmail)
      || (this.state.teamInvitations || []).some(invitation => invitation.email === normalizedEmail && !invitation.acceptedAt && Number(invitation.expiresAt) > Date.now());
    if (duplicate) throw httpError(409, 'Este e-mail já possui conta ou convite ativo.');
    const nonce = randomBytes(24).toString('base64url');
    const expiresAt = Date.now() + TEAM_INVITATION_MS;
    const invitation = {
      id: `inv-${Date.now()}-${randomBytes(4).toString('hex')}`,
      purpose: 'team_invite',
      workspaceId: workspace.id,
      displayName: normalizedName,
      email: normalizedEmail,
      role,
      memberKind: invitationKind,
      officeRoleId: invitationRoleId,
      teamIds: invitationTeamIds,
      nonce,
      expiresAt,
      createdAt: new Date().toISOString()
    };
    this.state.teamInvitations = (this.state.teamInvitations || [])
      .filter(item => !item.acceptedAt && Number(item.expiresAt) > Date.now())
      .slice(-99);
    this.state.teamInvitations.push(invitation);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return {
      invitation: this.listTeamInvitations(workspace.id).find(item => item.id === invitation.id),
      inviteToken: this.signSetupToken({ nonce, expiresAt, purpose: invitation.purpose })
    };
  }

  validateTeamInvitation(inviteToken) {
    const invitation = (this.state.teamInvitations || []).find(item => !item.acceptedAt && this.verifySetupToken(inviteToken, item));
    if (!invitation) throw httpError(401, 'Este convite é inválido, já foi utilizado ou expirou.');
    const workspace = resolveWorkspace(this.state, invitation.workspaceId);
    if (!workspace || workspace.status !== 'active') throw httpError(401, 'Este convite não está mais disponível.');
    return {
      displayName: invitation.displayName,
      email: invitation.email,
      role: invitation.role,
      memberKind: invitation.memberKind || '',
      officeRoleId: invitation.officeRoleId || '',
      teamIds: Array.isArray(invitation.teamIds) ? [...invitation.teamIds] : [],
      expiresAt: invitation.expiresAt,
      workspace: publicWorkspace(workspace)
    };
  }

  async acceptTeamInvitation({ inviteToken, username, password }) {
    const invitation = (this.state.teamInvitations || []).find(item => !item.acceptedAt && this.verifySetupToken(inviteToken, item));
    if (!invitation) throw httpError(401, 'Este convite é inválido, já foi utilizado ou expirou.');
    invitation.acceptedAt = new Date().toISOString();
    await this.save();
    try {
      const result = await this.registerUser({
        username,
        displayName: invitation.displayName,
        email: invitation.email,
        password,
        memberKind: invitation.memberKind || '',
        officeRoleId: invitation.officeRoleId || 'associate',
        teamIds: invitation.teamIds || []
      }, invitation.workspaceId);
      const pending = (this.state.pendingRegistrations || []).find(item => this.verifySetupToken(result.setupToken, item));
      if (!pending) throw httpError(500, 'Não foi possível concluir o vínculo do convite.');
      pending.invited = true;
      pending.invitationId = invitation.id;
      this.state.teamInvitations = (this.state.teamInvitations || []).filter(item => item !== invitation);
      this.state.updatedAt = new Date().toISOString();
      await this.save();
      return result;
    } catch (error) {
      invitation.acceptedAt = null;
      await this.save();
      throw error;
    }
  }

  async revokeTeamInvitation(invitationId, workspaceId = this.state.defaultWorkspaceId) {
    const invitation = (this.state.teamInvitations || []).find(item => item.id === invitationId && item.workspaceId === workspaceId);
    if (!invitation) throw httpError(404, 'Convite não localizado neste escritório.');
    this.state.teamInvitations = this.state.teamInvitations.filter(item => item !== invitation);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return true;
  }

  async resendTeamInvitation(invitationId, workspaceId = this.state.defaultWorkspaceId) {
    const invitation = (this.state.teamInvitations || []).find(item => item.id === invitationId && item.workspaceId === workspaceId);
    if (!invitation) throw httpError(404, 'Convite não localizado neste escritório.');
    if (invitation.acceptedAt) throw httpError(410, 'Este convite já foi utilizado.');
    invitation.nonce = randomBytes(24).toString('base64url');
    invitation.expiresAt = Date.now() + TEAM_INVITATION_MS;
    invitation.createdAt = new Date().toISOString();
    invitation.resendCount = Number(invitation.resendCount || 0) + 1;
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return {
      invitation: this.listTeamInvitations(workspaceId).find(item => item.id === invitation.id),
      inviteToken: this.signSetupToken({ nonce: invitation.nonce, expiresAt: invitation.expiresAt, purpose: invitation.purpose })
    };
  }

  async beginWorkspaceRegistration({ username, displayName, email, workspaceName, password, oab = '', oabUf = '', plan = 'pro', courtesyToken = '', enableMonitoring = false }, remoteAddress = 'unknown') {
    if (!this.state.configured) throw httpError(409, 'Conclua primeiro a configuração do administrador da instalação.');
    if (!this.allowWorkspaceRegistration) throw httpError(403, 'O cadastro público de novos escritórios não está habilitado nesta instalação.');
    await this.assertWorkspaceRegistrationAllowed(remoteAddress);
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const normalizedName = String(displayName || '').trim().replace(/\s+/g, ' ');
    assertDisplayNameAllowed(normalizedName);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedWorkspaceName = normalizeWorkspaceName(workspaceName);
    validateUsername(normalizedUsername);
    validatePassword(password);
    if (normalizedName.length < 3 || normalizedName.length > 100) throw httpError(400, 'Informe o nome do usuário responsável.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw httpError(400, 'Informe um endereço de e-mail válido.');

    this.state.pendingWorkspaceRegistrations = (this.state.pendingWorkspaceRegistrations || [])
      .filter(registration => Number(registration.expiresAt) > Date.now())
      .slice(-19);
    const duplicate = (this.state.users || []).some(user => user.username === normalizedUsername || user.email?.toLowerCase() === normalizedEmail)
      || this.state.pendingWorkspaceRegistrations.some(item => item.username === normalizedUsername || item.email === normalizedEmail);
    if (duplicate) throw httpError(409, 'Este usuário ou e-mail já está cadastrado no sistema.');

    const salt = randomBytes(16).toString('base64');
    const passwordHash = await hashPassword(password, salt);
    const totpSecret = encodeBase32(randomBytes(20));
    const nonce = randomBytes(18).toString('base64url');
    const expiresAt = Date.now() + SETUP_TOKEN_MS;
    const workspaceId = createWorkspaceId();
    const account = `ATRIUM:${normalizedUsername}`;
    const normalizedOab = String(oab || '').trim().toUpperCase().replace(/\s+/g, '');
    const normalizedOabUf = String(oabUf || '').trim().toUpperCase();
    // Plano escolhido na fundação do escritório. Muda a superfície operacional
    // (Basic/Pro/Pro IA), nunca permissões ou prazos; default conservador: pro.
    const requestedPlan = String(plan || '').trim().toLowerCase();
    const normalizedPlan = ['basic', 'pro', 'pro_ia'].includes(requestedPlan) ? requestedPlan : 'pro';
    const pending = {
      username: normalizedUsername,
      displayName: normalizedName,
      email: normalizedEmail,
      workspaceId,
      workspaceName: normalizedWorkspaceName,
      oab: normalizedOab,
      oabUf: normalizedOabUf,
      plan: normalizedPlan,
      courtesyToken: String(courtesyToken || '').slice(0, 200),
      judicialMonitoringEnabled: Boolean(enableMonitoring),
      salt,
      passwordHash,
      encryptedTotp: this.encrypt(totpSecret),
      nonce,
      expiresAt,
      createdAt: new Date().toISOString()
    };
    this.state.pendingWorkspaceRegistrations.push(pending);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return {
      setupToken: this.signSetupToken({ nonce, expiresAt }),
      manualSecret: totpSecret,
      qrCode: await QRCode.toDataURL(`otpauth://totp/${encodeURIComponent(account)}?secret=${totpSecret}&issuer=ATRIUM&algorithm=SHA1&digits=6&period=30`, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
    };
  }

  async assertWorkspaceRegistrationAllowed(remoteAddress) {
    const key = String(remoteAddress || 'unknown');
    const now = Date.now();
    this.pruneWorkspaceRegistrationAttempts(now);
    const current = this.workspaceRegistrationAttempts.get(key);
    const attempt = !current || now - Number(current.startedAt || 0) > LOGIN_WINDOW_MS
      ? { startedAt: now, count: 0 }
      : current;
    if (attempt.count >= 5) throw httpError(429, 'Muitas tentativas de cadastro. Aguarde antes de tentar novamente.');
    attempt.count += 1;
    this.workspaceRegistrationAttempts.set(key, attempt);
    await this.save();
  }

  pruneWorkspaceRegistrationAttempts(now = Date.now()) {
    for (const [key, attempt] of this.workspaceRegistrationAttempts) {
      if (!Number.isFinite(Number(attempt?.startedAt)) || now - Number(attempt.startedAt) > LOGIN_WINDOW_MS) {
        this.workspaceRegistrationAttempts.delete(key);
      }
    }
  }

  async finishWorkspaceRegistration({ setupToken, code, skipMfa }) {
    const registrations = this.state.pendingWorkspaceRegistrations || [];
    const pending = registrations.find(registration => this.verifySetupToken(setupToken, registration));
    if (!pending) throw httpError(401, 'A criação do escritório expirou. Recomece o cadastro.');
    if ((pending.verificationAttempts || 0) >= 5) throw httpError(429, 'Recomece o cadastro para gerar um novo código de configuração.');
    pending.verificationAttempts = (pending.verificationAttempts || 0) + 1;
    await this.save();

    let mfaEnabled = false;
    let encryptedTotp = null;
    let recoveryCodes = [];
    let recoverySalt = null;
    let recoveryHashes = [];

    if (!skipMfa && code) {
      if (!verifyTotp(this.decrypt(pending.encryptedTotp), code)) throw httpError(401, 'Código de autenticação inválido.');
      mfaEnabled = true;
      encryptedTotp = pending.encryptedTotp;
      recoveryCodes = Array.from({ length: 8 }, () => `${randomDigits(5)}-${randomDigits(5)}`);
      recoverySalt = randomBytes(16).toString('base64');
      recoveryHashes = recoveryCodes.map(value => hashRecovery(value, recoverySalt));
    } else if (!skipMfa && !code) {
      throw httpError(400, 'Código de autenticação é obrigatório.');
    }

    const duplicate = (this.state.users || []).some(user => user.username === pending.username || user.email?.toLowerCase() === pending.email);
    if (duplicate) throw httpError(409, 'Este usuário ou e-mail já está cadastrado no sistema.');
    if ((this.state.workspaces || []).some(workspace => workspace.id === pending.workspaceId)) throw httpError(409, 'Este escritório já foi cadastrado.');

    const now = new Date().toISOString();
    const user = {
      id: `usr-${Date.now()}-${randomBytes(4).toString('hex')}`,
      username: pending.username,
      displayName: pending.displayName,
      email: pending.email,
      oab: pending.oab || '',
      oabUf: pending.oabUf || '',
      judicialMonitoringEnabled: Boolean(pending.judicialMonitoringEnabled),
      workspaceId: pending.workspaceId,
      role: 'master_admin',
      status: 'active',
      mfaEnabled,
      salt: pending.salt,
      passwordHash: pending.passwordHash,
      encryptedTotp,
      recoverySalt,
      recoveryHashes,
      createdAt: pending.createdAt,
      updatedAt: now
    };
    this.state.workspaces.push({
      id: pending.workspaceId,
      name: pending.workspaceName,
      status: 'active',
      plan: pending.plan || 'pro',
      createdAt: now,
      updatedAt: now
    });
    this.state.users.push(user);
    this.state.pendingWorkspaceRegistrations = registrations.filter(registration => registration !== pending);
    this.state.updatedAt = now;
    await this.save();
    const session = this.createSession(user.username, user.displayName, user.role, user.email, '', '', user.oab, user.oabUf, user.judicialMonitoringEnabled, user.workspaceId, mfaEnabled);
    return { ...session, recoveryCodes, mfaEnabled, courtesyToken: pending.courtesyToken || '', workspace: publicWorkspace(resolveWorkspace(this.state, user.workspaceId)) };
  }

  async verifyRegisteredUser({ setupToken, code, skipMfa }) {
    const registrations = this.state.pendingRegistrations || [];
    const pending = registrations.find(registration => this.verifySetupToken(setupToken, registration));
    if (!pending) throw httpError(401, 'A configuração do novo usuário expirou. Recomece o cadastro.');
    if ((pending.verificationAttempts || 0) >= 5) throw httpError(429, 'Recomece o cadastro para gerar um novo código de configuração.');
    pending.verificationAttempts = (pending.verificationAttempts || 0) + 1;
    await this.save();
    if (pending.invited && (skipMfa || !code)) throw httpError(400, 'A proteção em duas etapas é obrigatória para aceitar este convite.');

    let mfaEnabled = false;
    let encryptedTotp = null;
    let recoveryCodes = [];
    let recoverySalt = null;
    let recoveryHashes = [];

    if (!skipMfa && code) {
      if (!verifyTotp(this.decrypt(pending.encryptedTotp), code)) throw httpError(401, 'Código de autenticação inválido.');
      mfaEnabled = true;
      encryptedTotp = pending.encryptedTotp;
      recoveryCodes = Array.from({ length: 8 }, () => `${randomDigits(5)}-${randomDigits(5)}`);
      recoverySalt = randomBytes(16).toString('base64');
      recoveryHashes = recoveryCodes.map(value => hashRecovery(value, recoverySalt));
    }

    const duplicate = (this.state.users || []).some(user => user.username === pending.username || user.email?.toLowerCase() === pending.email);
    if (duplicate) throw httpError(409, 'Este usuário ou e-mail já está cadastrado no sistema.');
    const user = {
      id: `usr-${Date.now()}-${randomBytes(4).toString('hex')}`,
      username: pending.username,
      displayName: pending.displayName,
      email: pending.email,
      oab: pending.oab,
      workspaceId: pending.workspaceId || this.state.defaultWorkspaceId,
      role: 'collaborator',
      officeRoleId: pending.officeRoleId || 'associate',
      memberKind: pending.memberKind || '',
      permissionOverrides: [],
      isPrincipal: false,
      status: pending.invited ? 'active' : 'pending_approval',
      mfaEnabled,
      salt: pending.salt,
      passwordHash: pending.passwordHash,
      encryptedTotp,
      recoverySalt,
      recoveryHashes,
      createdAt: pending.createdAt
    };
    this.state.users.push(user);
    for (const teamId of [...new Set((pending.teamIds || []).map(String))]) {
      const team = (this.state.teams || []).find(item => item.id === teamId && item.workspaceId === user.workspaceId);
      if (team && !(team.memberIds || []).includes(user.id)) {
        team.memberIds = [...(team.memberIds || []), user.id];
        team.updatedAt = new Date().toISOString();
      }
    }
    this.state.pendingRegistrations = registrations.filter(registration => registration !== pending);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return {
      ok: true,
      status: user.status,
      mfaEnabled,
      recoveryCodes,
      message: pending.invited
        ? 'Cadastro concluído. Você já pode entrar no ATRIUM.'
        : 'Cadastro concluído com sucesso. A conta aguarda aprovação do administrador.'
    };
  }

  hydrateOfficeAccess() {
    let changed = false;
    if (!this.state.officeAccess || typeof this.state.officeAccess !== 'object' || Array.isArray(this.state.officeAccess)) {
      this.state.officeAccess = {};
      changed = true;
    }
    for (const workspace of this.state.workspaces || []) {
      const current = this.state.officeAccess[workspace.id];
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        this.state.officeAccess[workspace.id] = { accessMode: 'shadow', privateMonitoring: 'allowed', updatedAt: new Date().toISOString() };
        changed = true;
      } else {
        if (!['shadow', 'enforced'].includes(current.accessMode)) {
          current.accessMode = 'shadow';
          changed = true;
        }
        if (!['allowed', 'disabled'].includes(current.privateMonitoring)) {
          current.privateMonitoring = 'allowed';
          changed = true;
        }
      }
    }
    for (const user of this.state.users || []) {
      const workspaceId = user.workspaceId || this.state.defaultWorkspaceId;
      const roleId = roleById(user.officeRoleId, workspaceId) ? user.officeRoleId : legacyRoleToOfficeRole(user.role);
      if (user.officeRoleId !== roleId) { user.officeRoleId = roleId; changed = true; }
      const kind = defaultMemberKind({ memberKind: user.memberKind, roleId, oab: user.oab, workspaceId });
      if (user.memberKind !== kind) { user.memberKind = kind; changed = true; }
      if (!Array.isArray(user.permissionOverrides)) { user.permissionOverrides = []; changed = true; }
      const principal = user.role === 'master_admin';
      if (Boolean(user.isPrincipal) !== principal) { user.isPrincipal = principal; changed = true; }
      if (!user.workspaceId) { user.workspaceId = workspaceId; changed = true; }
    }
    return { changed };
  }

  async setOfficeAccessMode(accessMode, workspaceId = this.state.defaultWorkspaceId) {
    const mode = accessMode === 'enforced' ? 'enforced' : 'shadow';
    this.state.officeAccess = this.state.officeAccess || {};
    this.state.officeAccess[workspaceId] = { ...(this.state.officeAccess[workspaceId] || {}), accessMode: mode, updatedAt: new Date().toISOString() };
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return mode;
  }

  async setOfficePrivateMonitoring(privateMonitoring, workspaceId = this.state.defaultWorkspaceId) {
    const mode = privateMonitoring === 'disabled' ? 'disabled' : 'allowed';
    this.state.officeAccess = this.state.officeAccess || {};
    this.state.officeAccess[workspaceId] = { ...(this.state.officeAccess[workspaceId] || {}), privateMonitoring: mode, updatedAt: new Date().toISOString() };
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return mode;
  }

  officeProfile(workspaceId = this.state.defaultWorkspaceId) {
    const access = this.state.officeAccess?.[workspaceId] || { accessMode: 'shadow', privateMonitoring: 'allowed' };
    return {
      roles: [...publicRoleCatalog(), ...this.publicOfficeRoles(workspaceId)],
      memberKinds: MEMBER_KINDS,
      permissions: [...OFFICE_PERMISSIONS],
      permissionCatalog: OFFICE_PERMISSION_CATALOG,
      accessMode: access.accessMode === 'enforced' ? 'enforced' : 'shadow',
      privateMonitoring: access.privateMonitoring === 'disabled' ? 'disabled' : 'allowed',
      principalRequired: true
    };
  }

  // Papéis próprios do escritório: registro em security.json, ao lado de
  // officeAccess. Não existe Store paralelo; este é o mesmo arquivo de RBAC.
  customOfficeRoles(workspaceId = this.state.defaultWorkspaceId) {
    if (!Array.isArray(this.state.officeRoles)) this.state.officeRoles = [];
    return this.state.officeRoles.filter(role => role.workspaceId === workspaceId);
  }

  hydrateOfficeRoles() {
    if (!Array.isArray(this.state.officeRoles)) {
      this.state.officeRoles = [];
      return { changed: false };
    }
    const before = this.state.officeRoles.length;
    // Papel de fábrica nunca é gravado aqui: o catálogo é código, não estado.
    this.state.officeRoles = this.state.officeRoles.filter(role => role && typeof role.id === 'string' && !isFactoryOfficeRole(role.id));
    registerOfficeRoles(this.state.officeRoles);
    return { changed: this.state.officeRoles.length !== before };
  }

  publicOfficeRoles(workspaceId = this.state.defaultWorkspaceId) {
    return this.customOfficeRoles(workspaceId)
      .filter(role => role.active !== false)
      .map(role => ({
        id: role.id,
        name: role.name,
        description: role.description || '',
        memberKinds: [...(role.memberKinds || ['lawyer', 'staff'])],
        permissions: [...(role.defaultPermissions || [])],
        custom: true,
        createdAt: role.createdAt || null,
        updatedAt: role.updatedAt || null
      }));
  }

  officeRoleInUse(roleId, workspaceId = this.state.defaultWorkspaceId) {
    return (this.state.users || [])
      .filter(user => user.workspaceId === workspaceId && (user.officeRoleId || legacyRoleToOfficeRole(user.role)) === roleId)
      .map(user => ({ id: user.id, displayName: user.displayName || user.username, status: user.status || 'active' }));
  }

  async createOfficeRole({ name, description = '', permissions = [], memberKinds = [] } = {}, workspaceId = this.state.defaultWorkspaceId) {
    const workspace = resolveWorkspace(this.state, workspaceId);
    if (!workspace || workspace.status !== 'active') throw httpError(404, 'Escritório não encontrado.');
    const normalizedName = String(name || '').trim().replace(/\s+/g, ' ');
    if (normalizedName.length < 2 || normalizedName.length > 60) throw httpError(400, 'Informe um nome de papel entre 2 e 60 caracteres.');
    if (!Array.isArray(permissions)) throw httpError(400, 'Lista de permissões inválida.');
    const requested = [...new Set(permissions.map(permission => String(permission)))];
    for (const permission of requested) if (!OFFICE_PERMISSIONS.includes(permission)) throw httpError(400, `Permissão do escritório inválida: ${permission}.`);
    const kinds = [...new Set((Array.isArray(memberKinds) ? memberKinds : []).map(String))].filter(kind => ['lawyer', 'staff'].includes(kind));
    const duplicate = [...OFFICE_ROLES, ...this.customOfficeRoles(workspaceId).filter(role => role.active !== false)]
      .some(role => String(role.name).toLowerCase() === normalizedName.toLowerCase());
    if (duplicate) throw httpError(409, 'Já existe um papel com este nome neste escritório.');
    const now = new Date().toISOString();
    const role = {
      id: `role-${Date.now()}-${randomBytes(4).toString('hex')}`,
      workspaceId,
      name: normalizedName,
      description: String(description || '').trim().slice(0, 280),
      memberKinds: kinds.length ? kinds : ['lawyer', 'staff'],
      defaultPermissions: requested,
      active: true,
      createdAt: now,
      updatedAt: now
    };
    this.state.officeRoles.push(role);
    this.state.updatedAt = now;
    await this.save();
    registerOfficeRoles(this.state.officeRoles);
    return this.publicOfficeRoles(workspaceId).find(item => item.id === role.id);
  }

  async updateOfficeRole(roleId, { name, description, permissions } = {}, workspaceId = this.state.defaultWorkspaceId) {
    if (isFactoryOfficeRole(roleId)) {
      // Papel de fábrica tem permissões definidas em código: editar aqui criaria uma
      // segunda fonte de verdade para o mesmo papel.
      throw httpError(403, 'Papéis de fábrica não podem ser editados. Crie um papel próprio do escritório.');
    }
    const role = this.customOfficeRoles(workspaceId).find(item => item.id === roleId && item.active !== false);
    if (!role) throw httpError(404, 'Papel não encontrado neste escritório.');
    if (name !== undefined) {
      const normalizedName = String(name || '').trim().replace(/\s+/g, ' ');
      if (normalizedName.length < 2 || normalizedName.length > 60) throw httpError(400, 'Informe um nome de papel entre 2 e 60 caracteres.');
      const duplicate = [...OFFICE_ROLES, ...this.customOfficeRoles(workspaceId).filter(item => item.id !== role.id && item.active !== false)]
        .some(item => String(item.name).toLowerCase() === normalizedName.toLowerCase());
      if (duplicate) throw httpError(409, 'Já existe um papel com este nome neste escritório.');
      role.name = normalizedName;
    }
    if (description !== undefined) role.description = String(description || '').trim().slice(0, 280);
    if (permissions !== undefined) {
      if (!Array.isArray(permissions)) throw httpError(400, 'Lista de permissões inválida.');
      const requested = [...new Set(permissions.map(permission => String(permission)))];
      for (const permission of requested) if (!OFFICE_PERMISSIONS.includes(permission)) throw httpError(400, `Permissão do escritório inválida: ${permission}.`);
      role.defaultPermissions = requested;
    }
    role.updatedAt = new Date().toISOString();
    this.state.updatedAt = role.updatedAt;
    await this.save();
    registerOfficeRoles(this.state.officeRoles);
    return this.publicOfficeRoles(workspaceId).find(item => item.id === role.id);
  }

  async deactivateOfficeRole(roleId, workspaceId = this.state.defaultWorkspaceId) {
    if (isFactoryOfficeRole(roleId)) throw httpError(403, 'Papéis de fábrica não podem ser excluídos.');
    const role = this.customOfficeRoles(workspaceId).find(item => item.id === roleId && item.active !== false);
    if (!role) throw httpError(404, 'Papel não encontrado neste escritório.');
    const inUse = this.officeRoleInUse(roleId, workspaceId);
    if (inUse.length) {
      throw httpError(409, `Este papel ainda está atribuído a ${inUse.length} membro(s) do escritório. Antes de excluir, altere o papel desses membros em Pessoas e equipes.`);
    }
    role.active = false;
    role.updatedAt = new Date().toISOString();
    this.state.updatedAt = role.updatedAt;
    await this.save();
    registerOfficeRoles(this.state.officeRoles);
    return true;
  }

  teamIdsForUser(user, workspaceId = this.state.defaultWorkspaceId) {
    const userId = String(user?.id || '');
    const username = String(user?.username || '');
    return (this.state.teams || [])
      .filter(team => team.workspaceId === workspaceId)
      .filter(team => (team.memberIds || []).some(id => String(id) === userId || String(id) === username))
      .map(team => team.id);
  }

  publicUser(u) {
    const roleId = u.officeRoleId || legacyRoleToOfficeRole(u.role);
    const workspaceId = u.workspaceId || this.state.defaultWorkspaceId;
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email || '',
      phone: u.phone || '',
      avatar: u.avatar || '',
      oab: u.oab || '',
      oabUf: u.oabUf || '',
      judicialMonitoringEnabled: u.judicialMonitoringEnabled,
      role: u.role || 'collaborator',
      officeRoleId: roleId,
      memberKind: defaultMemberKind({ memberKind: u.memberKind, roleId, oab: u.oab, workspaceId }),
      permissions: resolveOfficePermissions(roleId, u.permissionOverrides, workspaceId),
      teamIds: this.teamIdsForUser(u, workspaceId),
      isPrincipal: Boolean(u.isPrincipal || u.role === 'master_admin'),
      status: u.status || 'active',
      mfaEnabled: Boolean(u.mfaEnabled || u.encryptedTotp),
      createdAt: u.createdAt || null
    };
  }

  listUsers(workspaceId = this.state.defaultWorkspaceId) {
    return (this.state.users || []).filter(u => u.workspaceId === workspaceId).map(u => this.publicUser(u));
  }

  hasOfficePermission(session, permission) {
    return Array.isArray(session?.permissions) && session.permissions.includes(permission);
  }

  async updateOfficeMember(memberId, { memberKind, officeRoleId, teamIds, status, permissionOverrides } = {}, workspaceId = this.state.defaultWorkspaceId) {
    const user = (this.state.users || []).find(item => item.id === memberId || item.username === memberId);
    if (!user || user.workspaceId !== workspaceId) throw httpError(404, 'Membro não localizado neste escritório.');
    if (memberKind && !['lawyer', 'staff'].includes(memberKind)) throw httpError(400, 'Tipo de membro inválido.');
    if (officeRoleId && memberKind) assertMemberKindMatchesRole(officeRoleId, memberKind, workspaceId);
    else if (officeRoleId) assertMemberKindMatchesRole(officeRoleId, defaultMemberKind({ memberKind: user.memberKind, roleId: officeRoleId, oab: user.oab, workspaceId }), workspaceId);
    if (status && !['active', 'inactive', 'pending_approval'].includes(status)) throw httpError(400, 'Status de membro inválido.');
    // Titularidade: desativar, remover ou rebaixar o titular é recusado em qualquer
    // caminho que não seja a transferência explícita (rota separada). Alterações que
    // não ferem a titularidade (nome, equipes, permissões, status `active`) seguem.
    assertPrincipalMutationAllowed(user, { status, officeRoleId });
    const nextRole = officeRoleId || user.officeRoleId || legacyRoleToOfficeRole(user.role);
    const effectiveKind = memberKind || user.memberKind || defaultMemberKind({ roleId: nextRole, oab: user.oab, workspaceId });
    if (officeRoleId) assertMemberKindMatchesRole(nextRole, effectiveKind, workspaceId);
    const nextStatus = status || user.status || 'active';
    const activeManagers = (this.state.users || []).filter(item => item.workspaceId === workspaceId && ['active'].includes(item.status || 'active') && ['office_manager', 'office_principal'].includes(item.officeRoleId || legacyRoleToOfficeRole(item.role)));
    if (activeManagers.length <= 1 && activeManagers.some(item => item.id === user.id || item.username === user.username) && (!['office_manager', 'office_principal'].includes(nextRole) || nextStatus !== 'active')) {
      throw httpError(409, 'O escritório precisa de ao menos um gestor ativo.');
    }
    const validTeamIds = new Set((this.state.teams || []).filter(team => team.workspaceId === workspaceId).map(team => team.id));
    const nextTeams = Array.isArray(teamIds) ? [...new Set(teamIds.map(String).filter(id => validTeamIds.has(id)))] : null;
    if (memberKind) user.memberKind = memberKind;
    else if (officeRoleId) user.memberKind = defaultMemberKind({ memberKind: user.memberKind, roleId: nextRole, oab: user.oab, workspaceId });
    if (officeRoleId) user.officeRoleId = officeRoleId;
    if (Array.isArray(permissionOverrides)) user.permissionOverrides = [...new Set(permissionOverrides.map(String).filter(permission => OFFICE_PERMISSIONS.includes(permission)))];
    if (status) {
      user.status = status;
      if (status !== 'active') {
        for (const [key, session] of this.sessions) {
          if (session.username === user.username) this.sessions.delete(key);
        }
        this.state.trustedDevices = (this.state.trustedDevices || []).filter(device => device.username !== user.username);
      }
    }
    if (nextTeams) {
      for (const team of this.state.teams || []) {
        if (team.workspaceId !== workspaceId) continue;
        const members = new Set((team.memberIds || []).map(String));
        if (nextTeams.includes(team.id)) members.add(String(user.id));
        else members.delete(String(user.id));
        team.memberIds = [...members];
        team.updatedAt = new Date().toISOString();
      }
    }
    user.updatedAt = new Date().toISOString();
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return this.publicUser(user);
  }

  async updateUserStatus(userId, { status, role }, workspaceId = this.state.defaultWorkspaceId) {
    if (!Array.isArray(this.state.users)) return false;
    const user = this.state.users.find(u => u.id === userId || u.username === userId);
    if (!user) throw httpError(404, 'Usuário não localizado.');
    if (user.workspaceId !== workspaceId) throw httpError(404, 'Usuário não localizado neste escritório.');
    // Titularidade: o mesmo predicado do PATCH recusa qualquer status diferente de
    // `active`. A checagem manual anterior aceitava `pending_approval`, que também
    // invalida sessões, recusa login e conta como conta bloqueada.
    const allowedStatuses = new Set(['active', 'inactive', 'pending_approval']);
    const allowedRoles = new Set(['admin', 'collaborator']);
    if (status && !allowedStatuses.has(status)) throw httpError(400, 'Status de usuário inválido.');
    if (role && !allowedRoles.has(role)) throw httpError(400, 'Papel de usuário inválido.');
    assertPrincipalMutationAllowed(user, { status });
    if (status) user.status = status;
    if (role && user.role !== 'master_admin') user.role = role;
    this.state.trustedDevices = (this.state.trustedDevices || []).filter(device => device.username !== user.username);
    for (const [key, session] of this.sessions) {
      if (session.username === user.username) this.sessions.delete(key);
    }
    user.updatedAt = new Date().toISOString();
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return this.publicUser(user);
  }

  async updateCurrentUserProfile(username, { displayName, email, phone, avatar }) {
    const normalizedName = String(displayName || '').trim().replace(/\s+/g, ' ');
    assertDisplayNameAllowed(normalizedName);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPhone = String(phone || '').trim().replace(/\s+/g, ' ');
    const normalizedAvatar = String(avatar || '').trim();
    if (normalizedName.length < 3 || normalizedName.length > 100) throw httpError(400, 'Informe um nome com 3 a 100 caracteres.');
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw httpError(400, 'Informe um endereço de e-mail válido.');
    if (normalizedPhone.length > 32) throw httpError(400, 'O telefone informado é muito longo.');
    if (normalizedAvatar && (!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(normalizedAvatar) || normalizedAvatar.length > 700_000)) {
      throw httpError(400, 'A foto deve ser PNG, JPEG ou WebP e ter no máximo 512 KB.');
    }
    const user = (this.state.users || []).find(item => item.username === username);
    if (!user) throw httpError(404, 'Usuário não localizado.');
    if (normalizedEmail && (this.state.users || []).some(item => item.username !== username && String(item.email || '').toLowerCase() === normalizedEmail)) {
      throw httpError(409, 'Este e-mail já está vinculado a outro usuário.');
    }
    Object.assign(user, { displayName: normalizedName, email: normalizedEmail, phone: normalizedPhone, avatar: normalizedAvatar, updatedAt: new Date().toISOString() });
    if (constantEqual(username, this.state.username)) {
      this.state.displayName = normalizedName;
      this.state.email = normalizedEmail;
      this.state.phone = normalizedPhone;
      this.state.avatar = normalizedAvatar;
    }
    for (const session of this.sessions.values()) {
      if (session.username === username) Object.assign(session, { displayName: normalizedName, email: normalizedEmail, phone: normalizedPhone, avatar: normalizedAvatar });
    }
    for (const device of this.state.trustedDevices || []) {
      if (device.username === username) Object.assign(device, { displayName: normalizedName, email: normalizedEmail, phone: normalizedPhone, avatar: normalizedAvatar });
    }
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return publicProfile(user);
  }

  async resetCurrentUserProfile(username) {
    const user = (this.state.users || []).find(item => item.username === username);
    if (!user) throw httpError(404, 'Usuário não localizado.');
    user.avatar = '';
    user.phone = '';
    user.updatedAt = new Date().toISOString();
    if (constantEqual(username, this.state.username)) {
      this.state.avatar = '';
      this.state.phone = '';
    }
    for (const session of this.sessions.values()) {
      if (session.username === username) {
        session.avatar = '';
        session.phone = '';
      }
    }
    for (const device of this.state.trustedDevices || []) {
      if (device.username === username) {
        device.avatar = '';
        device.phone = '';
      }
    }
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return publicProfile(user);
  }

  async verifyFactoryResetReauthentication({ username, workspaceId, password, code, remoteAddress } = {}) {
    const user = (this.state.users || []).find(item => item.username === username
      && item.workspaceId === workspaceId && item.role === 'master_admin' && item.status === 'active');
    if (!user || typeof password !== 'string' || !password) return false;
    // Mesmo limitador de senha do login, com chave por usuário e endereço. O
    // contrato booleano deste verificador é preservado: bloqueio retorna false.
    const attemptKey = `factoryReset:${user.username}:${String(remoteAddress || 'unknown').toLowerCase()}`;
    try { this.assertLoginAllowed(attemptKey); } catch { return false; }
    const salt = user.salt || this.state.salt || '';
    if (!salt || !constantEqual(await hashPassword(password, salt), user.passwordHash || '')) {
      await this.recordLoginFailure(attemptKey);
      return false;
    }
    const mfaEnabled = user.mfaEnabled === true || (user.mfaEnabled === undefined && Boolean(user.encryptedTotp));
    if (!mfaEnabled) {
      await this.clearLoginAttempts(attemptKey);
      return true;
    }
    const secret = user.encryptedTotp || (username === this.state.username ? this.state.encryptedTotp : null);
    if (!secret || !String(code || '').trim()) {
      await this.recordLoginFailure(attemptKey);
      return false;
    }
    let secondFactorOk = false;
    try { secondFactorOk = verifyTotp(this.decrypt(secret), String(code).trim()); } catch { secondFactorOk = false; }
    if (!secondFactorOk) {
      await this.recordLoginFailure(attemptKey);
      return false;
    }
    await this.clearLoginAttempts(attemptKey);
    return true;
  }


  hasFreshStepUp(req) {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies.atrium_session || cookies.keller_session;
    const session = token ? this.sessions.get(sha256(token)) : null;
    return Boolean(session && session.stepUpAt && Date.now() - session.stepUpAt <= STEP_UP_TTL_MS);
  }

  grantStepUp(req) {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies.atrium_session || cookies.keller_session;
    const session = token ? this.sessions.get(sha256(token)) : null;
    if (session) session.stepUpAt = Date.now();
  }
  async verifyReauthentication({ username, password, code } = {}, remoteAddress = '') {
    // Sem senha apresentada nao ha adivinhacao: rejeicao simples, sem consumir o
    // balde de throttling (forca bruta sempre carrega senha).
    const cleanPassword = String(password || '');
    if (!cleanPassword) return false;
    const normalized = String(username || '').trim().toLowerCase();
    const attemptKey = `reauth:${String(remoteAddress || 'unknown').toLowerCase()}:${normalized}`;
    this.assertLoginAllowed(attemptKey);
    let user = (this.state.users || []).find(u => u.username === normalized || (u.email && u.email.toLowerCase() === normalized));
    if (!user && this.state.configured && constantEqual(normalized, this.state.username)) {
      user = this.state;
    }
    if (!user || user.status === 'inactive') {
      await this.recordLoginFailure(attemptKey);
      return false;
    }
    const storedSalt = user.salt || this.state.salt || randomBytes(16).toString('base64');
    const suppliedHash = await hashPassword(cleanPassword, storedSalt);
    if (!constantEqual(suppliedHash, user.passwordHash)) {
      await this.recordLoginFailure(attemptKey);
      return false;
    }
    const hasMfa = hasActiveMfa(user);
    if (!hasMfa) {
      await this.clearLoginAttempts(attemptKey);
      return true;
    }
    const secretEnc = user.encryptedTotp || this.state.encryptedTotp;
    const cleanCode = String(code || '').replace(/\s/g, '');
    // Step-up valida o codigo na janela +-1 SEM consumir o passo (mesmo criterio do
    // enableUserMfa e do factory reset); o anti-replay de passo permanece no login.
    let ok = false;
    if (/^\d{6}$/.test(cleanCode) && secretEnc) {
      ok = verifyTotp(this.decrypt(secretEnc), cleanCode);
    } else if (cleanCode) {
      ok = await this.consumeRecoveryCodeForUser(user, cleanCode);
    }
    if (!ok) {
      await this.recordLoginFailure(attemptKey);
      return false;
    }
    await this.clearLoginAttempts(attemptKey);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return true;
  }

  authorizeFactoryReset({ username, workspaceId, role } = {}) {
    if (role !== 'master_admin') return false;
    return (this.state.users || []).some(item => item.username === username
      && item.workspaceId === workspaceId && item.role === 'master_admin' && item.status === 'active');
  }

  async snapshotFactoryResetIdentity({ workspaceId } = {}) {
    const scopedArrays = ['users', 'trustedDevices', 'teamInvitations', 'pendingRegistrations', 'collectorAgents', 'pendingWorkspaceRegistrations'];
    return {
      workspaceId,
      arrays: Object.fromEntries(scopedArrays.map(key => [key, structuredClone((this.state[key] || []).filter(item => item.workspaceId === workspaceId))])),
      sessions: [...this.sessions.entries()].filter(([, value]) => value.workspaceId === workspaceId).map(([key, value]) => [key, structuredClone(value)])
    };
  }

  async restoreFactoryResetIdentity({ workspaceId, snapshot } = {}) {
    if (!snapshot || snapshot.workspaceId !== workspaceId || !snapshot.arrays || !Array.isArray(snapshot.sessions)) {
      throw httpError(500, 'Snapshot de identidade inválido para restauração.');
    }
    for (const [key, values] of Object.entries(snapshot.arrays)) {
      this.state[key] = [...(this.state[key] || []).filter(item => item.workspaceId !== workspaceId), ...structuredClone(values)];
    }
    for (const [key, value] of this.sessions) if (value.workspaceId === workspaceId) this.sessions.delete(key);
    for (const [key, value] of snapshot.sessions) this.sessions.set(key, structuredClone(value));
    this.state.updatedAt = new Date().toISOString();
    await this.save();
  }

  async persistFactoryResetIdentitySnapshot({ file, snapshot } = {}) {
    if (!file || !snapshot) throw httpError(500, 'Snapshot de identidade ausente.');
    const temporary = `${file}.tmp-${randomBytes(8).toString('hex')}`;
    await mkdir(path.dirname(file), { recursive: true });
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, encrypted: this.encrypt(JSON.stringify(snapshot)) }), { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, file);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  async restorePersistedFactoryResetIdentitySnapshot({ workspaceId, file } = {}) {
    const envelope = JSON.parse(await readFile(file, 'utf8'));
    if (envelope?.version !== 1 || !envelope.encrypted) throw httpError(500, 'Snapshot persistido de identidade inválido.');
    const snapshot = JSON.parse(this.decrypt(envelope.encrypted));
    return this.restoreFactoryResetIdentity({ workspaceId, snapshot });
  }

  async preserveWorkspaceMasterIdentity({ workspaceId, username, req } = {}) {
    const master = (this.state.users || []).find(item => item.username === username
      && item.workspaceId === workspaceId && item.role === 'master_admin' && item.status === 'active');
    if (!master) throw httpError(403, 'A identidade principal deste escritório não pôde ser preservada.');
    const cookies = parseCookies(req?.headers?.cookie || '');
    const currentToken = cookies.atrium_session || cookies.keller_session;
    const currentKey = currentToken ? sha256(currentToken) : '';
    const currentSession = currentKey ? this.sessions.get(currentKey) : null;
    if (!currentSession || currentSession.username !== username || currentSession.workspaceId !== workspaceId) {
      throw httpError(401, 'A sessão atual não pôde ser preservada. Entre novamente antes de redefinir o escritório.');
    }
    this.state.users = (this.state.users || []).filter(item => item.workspaceId !== workspaceId || item.username === username);
    this.state.trustedDevices = (this.state.trustedDevices || []).filter(item => item.workspaceId !== workspaceId);
    this.state.teamInvitations = (this.state.teamInvitations || []).filter(item => item.workspaceId !== workspaceId);
    this.state.pendingRegistrations = (this.state.pendingRegistrations || []).filter(item => item.workspaceId !== workspaceId);
    this.state.collectorAgents = (this.state.collectorAgents || []).filter(item => item.workspaceId !== workspaceId);
    this.state.pendingWorkspaceRegistrations = (this.state.pendingWorkspaceRegistrations || []).filter(item => item.workspaceId !== workspaceId);
    for (const [key, session] of this.sessions) {
      if (session.workspaceId === workspaceId && key !== currentKey) this.sessions.delete(key);
    }
    this.state.updatedAt = new Date().toISOString();
    await this.save();
  }

  async deleteUser(userId, workspaceId = this.state.defaultWorkspaceId) {
    if (!Array.isArray(this.state.users)) return false;
    const index = this.state.users.findIndex(u => (u.id === userId || u.username === userId) && u.workspaceId === workspaceId);
    if (index === -1) throw httpError(404, 'Usuário não localizado.');
    const user = this.state.users[index];
    if (isOfficePrincipalMember(user)) throw principalProtectionError();
    this.state.users.splice(index, 1);
    this.state.trustedDevices = (this.state.trustedDevices || []).filter(device => device.username !== user.username);
    for (const [key, session] of this.sessions) {
      if (session.username === user.username) this.sessions.delete(key);
    }
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return { ok: true, deleted: true, userId: user.id, username: user.username };
  }

  async deleteCurrentUserAccount(username) {
    const userIndex = (this.state.users || []).findIndex(item => item.username === username);
    if (userIndex === -1) throw httpError(404, 'Usuário não localizado.');
    const user = this.state.users[userIndex];
    const isMaster = user.role === 'master_admin' || constantEqual(username, this.state.username);

    // Titularidade: a saída do titular deixaria o escritório sem `office_principal`.
    // Antes a decisão olhava só o `master_admin` legado, e um titular promovido por
    // PATCH (sem esse papel) se auto-excluía. A promoção implícita do `master_admin`
    // para outro administrador ativo continua permitida logo abaixo.
    if (isOfficePrincipalMember(user)) {
      const otherActivePrincipal = (this.state.users || []).some(item => item.username !== username
        && item.workspaceId === user.workspaceId
        && (item.status || 'active') === 'active'
        && isOfficePrincipalMember(item));
      const hasPromotionCandidate = user.role === 'master_admin'
        && (this.state.users || []).some(item => item.username !== username
          && item.role === 'admin'
          && item.status === 'active'
          && item.workspaceId === user.workspaceId);
      if (!otherActivePrincipal && !hasPromotionCandidate) throw principalProtectionError();
    }

    if (!isMaster) {
      this.state.users.splice(userIndex, 1);
      this.state.trustedDevices = (this.state.trustedDevices || []).filter(device => device.username !== username);
      for (const [key, session] of this.sessions) {
        if (session.username === username) this.sessions.delete(key);
      }
      this.state.updatedAt = new Date().toISOString();
      await this.save();
      return { ok: true, deleted: true, loggedOut: true, username };
    }

    const otherAdmins = (this.state.users || []).filter(u => u.username !== username && u.role === 'admin' && u.status === 'active' && u.workspaceId === user.workspaceId);
    if (otherAdmins.length > 0) {
      const nextMaster = otherAdmins[0];
      nextMaster.role = 'master_admin';
      this.state.username = nextMaster.username;
      this.state.displayName = nextMaster.displayName;
      this.state.passwordHash = nextMaster.passwordHash;
      this.state.salt = nextMaster.salt;
      this.state.encryptedTotp = nextMaster.encryptedTotp || null;
      this.state.mfaEnabled = Boolean(nextMaster.mfaEnabled);
      this.state.users.splice(userIndex, 1);
      this.state.trustedDevices = (this.state.trustedDevices || []).filter(device => device.username !== username);
      for (const [key, session] of this.sessions) {
        if (session.username === username) this.sessions.delete(key);
      }
      this.state.updatedAt = new Date().toISOString();
      await this.save();
      return { ok: true, deleted: true, loggedOut: true, transferredTo: nextMaster.displayName || nextMaster.username };
    }

    const otherWorkspaces = (this.state.workspaces || []).filter(workspace => workspace.id !== user.workspaceId);
    if (otherWorkspaces.length > 0) {
      throw httpError(409, 'Há outros escritórios nesta instalação. Transfira a administração para outro usuário antes de excluir esta conta.');
    }

    this.state.users = [];
    this.state.configured = false;
    this.state.username = '';
    this.state.displayName = '';
    this.state.passwordHash = '';
    this.state.salt = '';
    this.state.encryptedTotp = null;
    this.state.mfaEnabled = false;
    this.state.trustedDevices = [];
    this.state.teamInvitations = [];
    this.sessions.clear();
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return { ok: true, deleted: true, loggedOut: true, systemReset: true };
  }

  async beginSetup({ username, displayName, email, workspaceName, oab, oabUf, enableMonitoring, password, bootstrapToken }, remoteAddress) {
    if (this.state.configured) throw httpError(409, 'A autenticação já foi configurada.');
    // beginSetup custa scrypt e grava security.json; o balde por IP de socket
    // evita que um atacante force CPU e escrita de arquivo em série.
    const setupKey = `setup:${String(remoteAddress || 'unknown')}`;
    this.assertLoginAllowed(setupKey);
    this.registerLoginAttempt(setupKey);
    await this.save();
    if (process.env.SETUP_BOOTSTRAP_TOKEN) {
      const expected = process.env.SETUP_BOOTSTRAP_TOKEN.trim();
      const provided = String(bootstrapToken || '').trim();
      const expBuf = Buffer.from(expected);
      const provBuf = Buffer.from(provided);
      if (!provided || expBuf.length !== provBuf.length || !timingSafeEqual(expBuf, provBuf)) {
        throw httpError(403, 'Token de bootstrap de administrador inválido ou ausente.');
      }
    }
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const normalizedName = String(displayName || '').trim();
    assertDisplayNameAllowed(normalizedName);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedOab = String(oab || '').trim().toUpperCase().replace(/\s+/g, '');
    const normalizedOabUf = String(oabUf || '').trim().toUpperCase();
    const judicialMonitoringEnabled = enableMonitoring === true || /^(?:true|on|1)$/i.test(String(enableMonitoring || ''));
    const normalizedWorkspaceName = normalizeWorkspaceName(workspaceName, DEFAULT_WORKSPACE_NAME);
    validateUsername(normalizedUsername);
    validatePassword(password);
    if (normalizedName.length < 3 || normalizedName.length > 100) throw httpError(400, 'Informe o nome do usuário responsável.');
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw httpError(400, 'Informe um endereço de e-mail válido.');
    if (normalizedOab && !/^[0-9A-Z./-]{3,20}$/.test(normalizedOab)) throw httpError(400, 'Informe um número de OAB válido.');
    if (normalizedOab && !/^[A-Z]{2}$/.test(normalizedOabUf)) throw httpError(400, 'Informe a UF da OAB.');
    if (!normalizedOab && normalizedOabUf) throw httpError(400, 'Informe o número da OAB ou remova a UF selecionada.');
    if (judicialMonitoringEnabled && (!normalizedOab || !normalizedOabUf)) throw httpError(400, 'Informe a OAB e a UF para ativar o monitoramento automático.');

    const salt = randomBytes(16).toString('base64');
    const passwordHash = await hashPassword(password, salt);
    const totpSecret = encodeBase32(randomBytes(20));
    const nonce = randomBytes(18).toString('base64url');
    const expiresAt = Date.now() + SETUP_TOKEN_MS;
    const issuer = 'Atrium Senda';
    const account = `${issuer}:${normalizedUsername}`;
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(account)}?secret=${totpSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

    this.state = {
      configured: false,
      pending: {
        username: normalizedUsername,
        displayName: normalizedName,
        email: normalizedEmail,
        oab: normalizedOab,
        oabUf: normalizedOabUf,
        judicialMonitoringEnabled,
        workspaceId: createWorkspaceId(),
        workspaceName: normalizedWorkspaceName,
        passwordHash,
        salt,
        encryptedTotp: this.encrypt(totpSecret),
        nonce,
        expiresAt
      }
    };
    await this.save();
    const setupToken = this.signSetupToken({ nonce, expiresAt });
    return { setupToken, manualSecret: totpSecret, qrCode: await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 }) };
  }

  async finishSetup({ setupToken, code, skipMfa }) {
    const pending = this.state.pending;
    if (!pending || !this.verifySetupToken(setupToken, pending)) throw httpError(401, 'A configuração expirou. Recomece o cadastro.');
    if ((pending.verificationAttempts || 0) >= SETUP_MAX_VERIFICATION_ATTEMPTS) throw httpError(429, 'Recomece a configuração para gerar um novo código de configuração.');
    pending.verificationAttempts = (pending.verificationAttempts || 0) + 1;
    await this.save();

    let mfaEnabled = false;
    let encryptedTotp = null;
    let recoveryCodes = [];
    let recoverySalt = null;
    let recoveryHashes = [];

    if (!skipMfa && code) {
      const secret = this.decrypt(pending.encryptedTotp);
      if (!verifyTotp(secret, code)) throw httpError(401, 'Código de autenticação inválido.');
      mfaEnabled = true;
      encryptedTotp = pending.encryptedTotp;
      recoveryCodes = Array.from({ length: 8 }, () => `${randomDigits(5)}-${randomDigits(5)}`);
      recoverySalt = randomBytes(16).toString('base64');
      recoveryHashes = recoveryCodes.map(value => hashRecovery(value, recoverySalt));
    }

    const masterUser = {
      id: 'usr-master-1',
      username: pending.username,
      displayName: pending.displayName,
      email: pending.email || '',
      oab: pending.oab || '',
      oabUf: pending.oabUf || '',
      judicialMonitoringEnabled: Boolean(pending.judicialMonitoringEnabled),
      workspaceId: pending.workspaceId,
      role: 'master_admin',
      status: 'active',
      mfaEnabled,
      salt: pending.salt,
      passwordHash: pending.passwordHash,
      encryptedTotp,
      recoverySalt,
      recoveryHashes,
      createdAt: new Date().toISOString()
    };

    this.state = {
      configured: true,
      username: pending.username,
      displayName: pending.displayName,
      email: pending.email || '',
      oab: pending.oab || '',
      oabUf: pending.oabUf || '',
      judicialMonitoringEnabled: Boolean(pending.judicialMonitoringEnabled),
      passwordHash: pending.passwordHash,
      salt: pending.salt,
      encryptedTotp,
      mfaEnabled,
      recoverySalt,
      recoveryHashes,
      users: [masterUser],
      defaultWorkspaceId: pending.workspaceId,
      workspaces: [{
        id: pending.workspaceId,
        name: pending.workspaceName,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await this.save();
    const session = this.createSession(this.state.username, this.state.displayName, 'master_admin', pending.email || '', '', '', pending.oab || '', pending.oabUf || '', Boolean(pending.judicialMonitoringEnabled), pending.workspaceId, mfaEnabled);
    return { ...session, recoveryCodes, mfaEnabled };
  }

  /** Plano do escritório, definido pela assinatura. Muda a apresentação; não apaga nem esconde dados. */
  async setWorkspacePlan(workspaceId, plan) {
    const workspace = (this.state.workspaces || []).find(item => item.id === workspaceId);
    if (!workspace || !['basic', 'pro', 'pro_ia'].includes(plan)) return;
    workspace.plan = plan;
    workspace.updatedAt = new Date().toISOString();
    this.state.updatedAt = workspace.updatedAt;
    await this.save();
  }

  /** Bloqueia ou reativa um escritório. Não apaga dados; o escritório principal não pode ser bloqueado. */
  async setWorkspaceStatus(workspaceId, status) {
    if (!['active', 'suspended'].includes(status)) throw httpError(400, 'Situação de escritório inválida.');
    if (workspaceId === this.state.defaultWorkspaceId && status !== 'active') {
      throw httpError(409, 'O escritório principal não pode ser bloqueado.');
    }
    const workspace = (this.state.workspaces || []).find(item => item.id === workspaceId);
    if (!workspace) throw httpError(404, 'Escritório não encontrado.');
    workspace.status = status;
    workspace.statusChangedAt = new Date().toISOString();
    this.state.updatedAt = workspace.statusChangedAt;
    if (status !== 'active') {
      for (const [key, session] of this.sessions) if (session.workspaceId === workspaceId) this.sessions.delete(key);
    }
    await this.save();
    return { id: workspace.id, name: workspace.name, status: workspace.status };
  }

  async login({ username, password, code, trustBrowser }, remoteAddress, userAgent = '') {
    const normalized = String(username || '').trim().toLowerCase();
    const addressKey = String(remoteAddress || 'unknown');
    const attemptKey = `attempt:${addressKey}:${normalized}`;
    const accountKey = `account:${normalized}`;
    const addressBucketKey = `address:${addressKey}`;
    // Três barreiras independentes: par IP+usuário, conta normalizada (anti-spraying
    // distribuído) e endereço de origem (anti-spraying com muitos usuários).
    this.assertLoginAllowed(attemptKey);
    this.assertLoginAllowed(accountKey);
    this.assertLoginAllowed(addressBucketKey);

    // 1. Localiza usuário na lista de usuários ou no estado mestre legado
    let user = (this.state.users || []).find(u => u.username === normalized || (u.email && u.email.toLowerCase() === normalized));
    if (!user && this.state.configured && constantEqual(normalized, this.state.username)) {
      user = {
        username: this.state.username,
        displayName: this.state.displayName,
        email: '',
        role: 'master_admin',
        status: 'active',
        mfaEnabled: this.state.mfaEnabled !== false && Boolean(this.state.encryptedTotp),
        salt: this.state.salt,
        passwordHash: this.state.passwordHash,
        encryptedTotp: this.state.encryptedTotp,
        recoverySalt: this.state.recoverySalt,
        recoveryHashes: this.state.recoveryHashes,
        oab: this.state.oab || '',
        oabUf: this.state.oabUf || '',
        judicialMonitoringEnabled: this.state.judicialMonitoringEnabled
      };
    }

    if (!user) {
      await this.recordLoginFailure(attemptKey, accountKey, addressBucketKey);
      throw httpError(401, UNIFORM_CREDENTIAL_MESSAGE);
    }

    if (user.status === 'pending_approval') {
      throw httpError(403, 'Sua solicitação de acesso está em análise e aguarda aprovação do administrador.');
    }

    if (user.status === 'inactive') {
      throw httpError(403, 'Esta conta foi suspensa ou desativada pelo Administrador Master.');
    }

    const storedSalt = user.salt || this.state.salt || randomBytes(16).toString('base64');
    const suppliedHash = await hashPassword(String(password || ''), storedSalt);
    const passwordOk = constantEqual(suppliedHash, user.passwordHash);

    if (!passwordOk) {
      await this.recordLoginFailure(attemptKey, accountKey, addressBucketKey);
      throw httpError(401, UNIFORM_CREDENTIAL_MESSAGE);
    }

    const hasMfa = hasActiveMfa(user);
    let secondFactorOk = false;
    let consumedTotpStep = null;

    if (!hasMfa) {
      // Usuário sem 2FA: autenticação direta por senha
      secondFactorOk = true;
    } else {
      // Usuário com 2FA ativo: exige código TOTP ou código de recuperação
      const secretEnc = user.encryptedTotp || this.state.encryptedTotp;
      const cleanCode = String(code || '').replace(/\s/g, '');
      if (/^\d{6}$/.test(cleanCode) && secretEnc) {
        // Anti-replay por passo de tempo: um passo já consumido por este usuário
        // não pode ser reapresentado, nem dentro da janela ±1.
        const matchedStep = matchTotpStep(this.decrypt(secretEnc), cleanCode);
        const lastUsedStep = Number(user.totpLastUsedStep);
        if (matchedStep !== null && (!Number.isFinite(lastUsedStep) || matchedStep > lastUsedStep)) {
          secondFactorOk = true;
          consumedTotpStep = matchedStep;
        }
      } else if (cleanCode) {
        secondFactorOk = await this.consumeRecoveryCodeForUser(user, cleanCode);
      }
    }

    if (!secondFactorOk) {
      // Mensagem indistinguível da senha inválida para não revelar que a senha
      // fornecida estava correta e o segundo fator era o único elo faltante.
      await this.recordLoginFailure(attemptKey, accountKey, addressBucketKey);
      throw httpError(401, UNIFORM_CREDENTIAL_MESSAGE);
    }

    if (consumedTotpStep !== null) this.applyTotpConsumption(user, consumedTotpStep);
    // Sucesso limpa o par IP+usuário e a conta, mas não o balde do endereço:
    // um login válido não pode zerar a contagem anti-spraying compartilhada.
    this.loginAttempts.delete(attemptKey);
    this.loginAttempts.delete(accountKey);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    const session = this.createSession(user.username, user.displayName, user.role, user.email, user.phone, user.avatar, user.oab, user.oabUf, user.judicialMonitoringEnabled, user.workspaceId || this.state.defaultWorkspaceId, hasMfa && secondFactorOk);
    if (trustBrowser === true || /^(?:true|on|1)$/i.test(String(trustBrowser || ''))) session.trustedToken = await this.createTrustedDevice(user, userAgent);
    return session;
  }

  async consumeRecoveryCodeForUser(user, code) {
    const isMaster = !user.id || constantEqual(user.username, this.state.username);
    const salt = isMaster ? (this.state.recoverySalt || user.recoverySalt) : user.recoverySalt;
    const hashes = isMaster ? (this.state.recoveryHashes || user.recoveryHashes || []) : (user.recoveryHashes || []);
    if (!salt || !hashes.length) return false;
    const targetHash = hashRecovery(code, salt);
    const index = hashes.findIndex(hash => constantEqual(hash, targetHash));
    if (index < 0) return false;
    hashes.splice(index, 1);
    if (user.id) {
      const dbUser = (this.state.users || []).find(u => u.id === user.id);
      if (dbUser) dbUser.recoveryHashes = hashes;
    }
    if (isMaster) {
      this.state.recoveryHashes = hashes;
    }
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return true;
  }

  async enableUserMfa(username, { code, password, totpSecret }, remoteAddress = '') {
    let user = (this.state.users || []).find(u => u.username === username);
    if (!user && this.state.configured && constantEqual(username, this.state.username)) {
      user = this.state;
    }
    if (!user) throw httpError(404, 'Usuário não encontrado.');

    const attemptKey = `mfa:${user.username}:${String(remoteAddress || 'unknown').toLowerCase()}`;
    this.assertLoginAllowed(attemptKey);
    const storedSalt = user.salt || this.state.salt || randomBytes(16).toString('base64');
    const suppliedHash = await hashPassword(String(password || ''), storedSalt);
    if (!constantEqual(suppliedHash, user.passwordHash)) {
      await this.recordLoginFailure(attemptKey);
      throw httpError(401, 'Senha incorreta.');
    }

    const cleanSecret = totpSecret || (user.pendingTotp ? this.decrypt(user.pendingTotp) : null);
    if (hasActiveMfa(user)) {
      throw httpError(409, 'O 2FA já está ativo nesta conta. Desative a proteção em duas etapas antes de reconfigurá-la.');
    }
    if (!cleanSecret || !verifyTotp(cleanSecret, String(code || '').trim())) {
      await this.recordLoginFailure(attemptKey);
      throw httpError(401, 'Código de validação do 2FA inválido.');
    }

    const recoveryCodes = Array.from({ length: 8 }, () => `${randomDigits(5)}-${randomDigits(5)}`);
    const recoverySalt = randomBytes(16).toString('base64');
    const recoveryHashes = recoveryCodes.map(value => hashRecovery(value, recoverySalt));

    user.mfaEnabled = true;
    user.encryptedTotp = this.encrypt(cleanSecret);
    user.recoverySalt = recoverySalt;
    user.recoveryHashes = recoveryHashes;
    user.totpLastUsedStep = null;
    delete user.pendingTotp;

    this.loginAttempts.delete(attemptKey);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return { ok: true, mfaEnabled: true, recoveryCodes };
  }

  getUserMfaStatus(username) {
    const normalized = String(username || '').trim().toLowerCase();
    let user = (this.state.users || []).find(candidate => candidate.username === normalized);
    if (!user && this.state.configured && constantEqual(normalized, this.state.username)) {
      user = this.state;
    }
    if (!user) throw httpError(404, 'Usuário não encontrado.');
    return {
      mfaEnabled: user.mfaEnabled === true || Boolean(user.encryptedTotp),
      recoveryCodesRemaining: Array.isArray(user.recoveryHashes) ? user.recoveryHashes.length : 0
    };
  }

  async beginUserMfaEnrollment(username) {
    const normalized = String(username || '').trim().toLowerCase();
    let user = (this.state.users || []).find(candidate => candidate.username === normalized);
    if (!user && this.state.configured && constantEqual(normalized, this.state.username)) {
      user = this.state;
    }
    if (!user) throw httpError(404, 'Usuário não encontrado.');
    if (hasActiveMfa(user)) throw httpError(409, 'O 2FA já está ativo nesta conta. Desative a proteção em duas etapas antes de reconfigurá-la.');
    const totpSecret = encodeBase32(randomBytes(20));
    const issuer = 'Atrium Senda';
    const account = `${issuer}:${user.username}`;
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(account)}?secret=${totpSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    user.pendingTotp = this.encrypt(totpSecret);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return { manualSecret: totpSecret, qrCode: await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 }) };
  }

  async disableUserMfa(username, { password, code, recoveryCode }, remoteAddress = '') {
    let user = (this.state.users || []).find(u => u.username === username);
    const isMaster = !user && this.state.configured && constantEqual(username, this.state.username);
    if (isMaster) {
      user = this.state;
    }
    if (!user) throw httpError(404, 'Usuário não encontrado.');

    const attemptKey = `mfa:${user.username || username}:${String(remoteAddress || 'unknown').toLowerCase()}`;
    this.assertLoginAllowed(attemptKey);

    // 1. Validar senha
    const storedSalt = user.salt || this.state.salt || randomBytes(16).toString('base64');
    const suppliedHash = await hashPassword(String(password || ''), storedSalt);
    if (!constantEqual(suppliedHash, user.passwordHash)) {
      await this.recordLoginFailure(attemptKey);
      throw httpError(401, 'Senha incorreta.');
    }

    // 2. Exigir TOTP atual OU recovery code válido (BUG-013)
    let factorOk = false;
    const cleanTotpSecret = user.encryptedTotp ? this.decrypt(user.encryptedTotp) : null;
    const cleanCode = String(code || '').trim();
    const cleanRecovery = String(recoveryCode || '').trim();

    if (cleanTotpSecret && cleanCode && verifyTotp(cleanTotpSecret, cleanCode)) {
      factorOk = true;
    } else if (cleanRecovery) {
      factorOk = await this.consumeRecoveryCodeForUser(user, cleanRecovery);
    }

    if (!factorOk) {
      await this.recordLoginFailure(attemptKey);
      throw httpError(401, 'Autenticação em 2 etapas exigida para desativação: forneça o código TOTP atual ou um código de recuperação válido.');
    }

    // 3. Desativar MFA e destruir recovery codes
    user.mfaEnabled = false;
    user.encryptedTotp = null;
    user.recoveryHashes = [];
    user.recoverySalt = null;
    user.totpLastUsedStep = null;
    delete user.pendingTotp;

    if (isMaster) {
      this.state.mfaEnabled = false;
      this.state.encryptedTotp = null;
      this.state.recoveryHashes = [];
      this.state.recoverySalt = null;
    }

    // 4. Revogar trusted devices daquele usuário
    if (Array.isArray(this.state.trustedDevices)) {
      this.state.trustedDevices = this.state.trustedDevices.filter(d => d.username !== username && (!isMaster || d.username !== this.state.username));
    }

    // 5. Revogar todas as outras sessões ativas do usuário
    for (const [key, sess] of this.sessions.entries()) {
      if (sess.username === username) {
        this.sessions.delete(key);
      }
    }

    this.loginAttempts.delete(attemptKey);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return { ok: true, mfaEnabled: false };
  }

  findAccountByIdentifier(identifier) {
    const normalized = String(identifier || '').trim().toLowerCase().slice(0, 160);
    if (!normalized) return null;
    return (this.state.users || []).find(user => user.username === normalized || (user.email && String(user.email).toLowerCase() === normalized)) || null;
  }

  isActiveAccount(user) {
    return Boolean(user) && String(user.status || 'active').toLowerCase() === 'active';
  }

  assertPasswordResetAllowed(scope, key) {
    const now = Date.now();
    this.prunePasswordResetAttempts(now);
    const bucketKey = `${scope}:${String(key || 'unknown')}`;
    const limit = scope === 'identity' ? PASSWORD_RESET_MAX_PER_IDENTITY : PASSWORD_RESET_MAX_PER_ADDRESS;
    const current = this.passwordResetAttempts.get(bucketKey);
    if (current && now < current.resetAt && current.count >= limit) {
      const error = httpError(429, 'Muitas tentativas de recuperação de senha. Aguarde antes de tentar novamente.');
      error.retryAfter = Math.ceil((current.resetAt - now) / 1000);
      throw error;
    }
    // Buckets ativos nunca são descartados: a evicção dos mais antigos permitia ao
    // atacante inundar o mapa para zerar o próprio contador. No teto, identidades
    // novas falham fechado; buckets já existentes continuam contando.
    if (!current && this.passwordResetAttempts.size >= PASSWORD_RESET_MAX_ENTRIES) {
      const error = httpError(429, 'Muitas tentativas de recuperação de senha. Aguarde antes de tentar novamente.');
      error.retryAfter = Math.ceil(PASSWORD_RESET_WINDOW_MS / 1000);
      throw error;
    }
    const attempt = current && now < current.resetAt ? current : { count: 0, resetAt: now + PASSWORD_RESET_WINDOW_MS };
    attempt.count += 1;
    this.passwordResetAttempts.set(bucketKey, attempt);
  }

  prunePasswordResetAttempts(now = Date.now()) {
    for (const [key, attempt] of this.passwordResetAttempts) {
      if (!Number.isFinite(Number(attempt?.resetAt)) || now >= Number(attempt.resetAt)) this.passwordResetAttempts.delete(key);
    }
  }

  // Trabalho computacional constante e sem segredo para aproximar o tempo de
  // resposta entre conta existente e inexistente. É best-effort: efeitos internos
  // de auditoria e enfileiramento permanecem observáveis apenas por medição estatística.
  applyPasswordResetEqualizationWork() {
    let digest = Buffer.from('atrium-password-reset-equalization');
    for (let round = 0; round < PASSWORD_RESET_EQUALIZATION_ROUNDS; round += 1) {
      digest = createHash('sha256').update(digest).digest();
    }
    return digest.length;
  }

  revokeUserAccess(username, workspaceId = null) {
    for (const [key, session] of this.sessions) {
      if (session.username !== username) continue;
      if (workspaceId && session.workspaceId !== workspaceId) continue;
      this.sessions.delete(key);
    }
    this.state.trustedDevices = (this.state.trustedDevices || []).filter(device => {
      if (device.username !== username) return true;
      const deviceWorkspace = device.workspaceId || this.state.defaultWorkspaceId;
      return workspaceId ? deviceWorkspace !== workspaceId : false;
    });
  }

  async requestPasswordReset({ identifier } = {}, remoteAddress = '') {
    const normalized = String(identifier || '').trim().toLowerCase().slice(0, 160);
    this.assertPasswordResetAllowed('address', remoteAddress || 'unknown');
    this.assertPasswordResetAllowed('identity', normalized || 'empty');
    await this.save();
    this.applyPasswordResetEqualizationWork();

    const user = this.findAccountByIdentifier(normalized);
    const email = String(user?.email || '').trim().toLowerCase();
    if (!this.isActiveAccount(user) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { delivered: false };

    const now = Date.now();
    const workspaceId = user.workspaceId || this.state.defaultWorkspaceId;
    const token = randomBytes(32).toString('base64url');
    this.state.passwordResetTokens = (this.state.passwordResetTokens || [])
      .filter(entry => Number(entry.expiresAt) > now)
      .filter(entry => !(entry.username === user.username && entry.workspaceId === workspaceId))
      .slice(-99);
    this.state.passwordResetTokens.push({
      id: `prt-${now}-${randomBytes(4).toString('hex')}`,
      username: user.username,
      workspaceId,
      tokenHash: sha256(token),
      expiresAt: now + PASSWORD_RESET_TOKEN_MS,
      createdAt: new Date(now).toISOString()
    });
    this.state.updatedAt = new Date(now).toISOString();
    await this.save();
    return {
      delivered: true,
      token,
      username: user.username,
      displayName: user.displayName || user.username,
      email,
      workspaceId,
      expiresAt: now + PASSWORD_RESET_TOKEN_MS
    };
  }

  async completePasswordReset({ token, password } = {}, remoteAddress = '') {
    this.assertPasswordResetAllowed('address', remoteAddress || 'unknown');
    await this.save();
    const supplied = String(token || '').trim();
    if (!supplied || supplied.length > 256) throw httpError(401, PASSWORD_RESET_TOKEN_MESSAGE);
    validatePassword(password);
    const now = Date.now();
    const entries = this.state.passwordResetTokens || [];
    const suppliedHash = sha256(supplied);
    const entry = entries.find(item => Number(item.expiresAt) > now && constantEqual(item.tokenHash, suppliedHash));
    if (!entry) throw httpError(401, PASSWORD_RESET_TOKEN_MESSAGE);
    const user = (this.state.users || []).find(item => item.username === entry.username
      && (item.workspaceId || this.state.defaultWorkspaceId) === entry.workspaceId);
    if (!this.isActiveAccount(user)) throw httpError(401, PASSWORD_RESET_TOKEN_MESSAGE);

    const salt = randomBytes(16).toString('base64');
    const passwordHash = await hashPassword(password, salt);

    // Revalida o token imediatamente antes da mutação para que duas requisições
    // concorrentes com o mesmo link não consumam a redefinição duas vezes.
    const currentEntries = this.state.passwordResetTokens || [];
    const index = currentEntries.findIndex(item => Number(item.expiresAt) > now && constantEqual(item.tokenHash, suppliedHash));
    if (index < 0) throw httpError(401, PASSWORD_RESET_TOKEN_MESSAGE);

    user.salt = salt;
    user.passwordHash = passwordHash;
    user.updatedAt = new Date().toISOString();
    if (constantEqual(user.username, this.state.username)) {
      this.state.salt = salt;
      this.state.passwordHash = passwordHash;
    }
    this.state.passwordResetTokens = currentEntries.filter(item => item !== currentEntries[index]);
    this.revokeUserAccess(user.username, entry.workspaceId);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return { ok: true, username: user.username, workspaceId: entry.workspaceId };
  }

  async changePassword({ username, workspaceId, currentPassword, newPassword, code, recoveryCode } = {}, remoteAddress = '') {
    const user = (this.state.users || []).find(item => item.username === username
      && (item.workspaceId || this.state.defaultWorkspaceId) === (workspaceId || this.state.defaultWorkspaceId));
    if (!this.isActiveAccount(user)) throw httpError(404, 'Usuário não localizado neste escritório.');
    const attemptKey = `passwordChange:${user.username}:${String(remoteAddress || 'unknown').toLowerCase()}`;
    // O limitador conta apenas falhas de credencial: sucesso limpa o balde e
    // validações baratas de payload (nova senha inválida) não consomem tentativas.
    this.assertLoginAllowed(attemptKey);
    validatePassword(newPassword);
    if (!currentPassword) throw httpError(400, 'Informe a senha atual para confirmar a alteração.');
    if (String(currentPassword).length > 256) throw httpError(400, 'Senha atual incorreta.');
    const storedSalt = user.salt || this.state.salt || '';
    const suppliedHash = await hashPassword(String(currentPassword), storedSalt || randomBytes(16).toString('base64'));
    if (!storedSalt || !constantEqual(suppliedHash, user.passwordHash || '')) {
      await this.recordLoginFailure(attemptKey);
      throw httpError(400, 'Senha atual incorreta.');
    }

    const hasMfa = user.mfaEnabled === true || (user.mfaEnabled === undefined && Boolean(user.encryptedTotp));
    if (hasMfa) {
      const secret = user.encryptedTotp || (constantEqual(username, this.state.username) ? this.state.encryptedTotp : null);
      const cleanCode = String(code || '').replace(/\s/g, '');
      const cleanRecovery = String(recoveryCode || '').trim();
      let factorOk = false;
      if (secret && /^\d{6}$/.test(cleanCode)) factorOk = verifyTotp(this.decrypt(secret), cleanCode);
      if (!factorOk && cleanRecovery) factorOk = await this.consumeRecoveryCodeForUser(user, cleanRecovery);
      if (!factorOk) {
        await this.recordLoginFailure(attemptKey);
        throw httpError(400, 'Informe o código atual do autenticador ou um código de recuperação para confirmar a alteração.');
      }
    }

    const salt = randomBytes(16).toString('base64');
    const passwordHash = await hashPassword(newPassword, salt);
    user.salt = salt;
    user.passwordHash = passwordHash;
    user.updatedAt = new Date().toISOString();
    if (constantEqual(username, this.state.username)) {
      this.state.salt = salt;
      this.state.passwordHash = passwordHash;
    }
    this.state.passwordResetTokens = (this.state.passwordResetTokens || [])
      .filter(entry => !(entry.username === user.username && entry.workspaceId === (user.workspaceId || this.state.defaultWorkspaceId)));
    this.revokeUserAccess(user.username, user.workspaceId || this.state.defaultWorkspaceId);
    this.loginAttempts.delete(attemptKey);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    const session = this.createSession(user.username, user.displayName, user.role || 'master_admin', user.email, user.phone, user.avatar, user.oab, user.oabUf, user.judicialMonitoringEnabled, user.workspaceId || this.state.defaultWorkspaceId, false);
    return { ok: true, username: user.username, token: session.token, csrfToken: session.csrfToken, user: session.user };
  }

  authenticate(req) {
    this.cleanupSessions();
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies.atrium_session || cookies.keller_session;
    let key = token ? sha256(token) : '';
    let session = key ? this.sessions.get(key) : null;
    if (!session) {
      const trusted = this.findTrustedDevice(req);
      if (trusted) {
        key = `trusted:${trusted.tokenHash}`;
        session = this.sessions.get(key);
        if (!session) {
          const now = Date.now();
          const user = this.userForTrustedDevice(trusted);
          if (!user) return null;
          session = { ...publicProfile(user), csrfToken: randomBytes(24).toString('base64url'), createdAt: now, lastSeenAt: now, expiresAt: now + SESSION_MAX_AGE_MS, mfaVerified: false, trustedDevice: true };
          this.sessions.set(key, session);
        }
      }
    }
    if (!session) return null;
    if (!session || Date.now() > session.expiresAt || Date.now() - session.lastSeenAt > SESSION_IDLE_MS) {
      this.sessions.delete(key);
      const trusted = this.findTrustedDevice(req);
      if (!trusted) return null;
      const now = Date.now();
      const user = this.userForTrustedDevice(trusted);
      if (!user) return null;
      session = { ...publicProfile(user), csrfToken: randomBytes(24).toString('base64url'), createdAt: now, lastSeenAt: now, expiresAt: now + SESSION_MAX_AGE_MS, mfaVerified: false, trustedDevice: true };
      this.sessions.set(`trusted:${trusted.tokenHash}`, session);
    }
    // Invariante de Segurança do Data Plane:
    // Todas as sessões ativas (cookie de sessão normal ou trusted device) devem ser continuamente
    // validadas contra o estado atual do usuário e do workspace.
    // Sessões tornam-se imediatamente inválidas se:
    // 1) O usuário foi removido de state.users;
    // 2) O usuário foi suspenso, desativado ou bloqueado (suspended, disabled, inactive, pending_approval);
    // 3) O workspace do usuário foi suspenso ou desativado;
    // 4) Tentativa de forjar sessão via createSession com username arbitrário sem usuário ativo correspondente.
    // Adicionalmente, alterações de role (ex: rebaixamento de privilégio) entram em vigor na próxima requisição.
    const currentUser = this.userForTrustedDevice({ username: session.username });
    if (!currentUser) {
      this.sessions.delete(key);
      return null;
    }

    const currentWorkspace = resolveWorkspace(this.state, currentUser.workspaceId || session.workspaceId);
    if (currentWorkspace) {
      const wsStatus = String(currentWorkspace.status || 'active').toLowerCase();
      if (wsStatus === 'inactive' || wsStatus === 'suspended' || wsStatus === 'disabled') {
        this.sessions.delete(key);
        return null;
      }
    }

    session.displayName = currentUser.displayName || session.displayName;
    session.role = currentUser.role || 'collaborator';
    const sessionWorkspaceId = currentUser.workspaceId || session.workspaceId;
    session.officeRoleId = currentUser.officeRoleId || legacyRoleToOfficeRole(session.role);
    session.memberKind = defaultMemberKind({ memberKind: currentUser.memberKind, roleId: session.officeRoleId, oab: currentUser.oab, workspaceId: sessionWorkspaceId });
    session.permissions = resolveOfficePermissions(session.officeRoleId, currentUser.permissionOverrides, sessionWorkspaceId);
    session.isPrincipal = Boolean(currentUser.isPrincipal || session.role === 'master_admin');
    session.teamIds = this.teamIdsForUser(currentUser, session.workspaceId);
    session.email = currentUser.email || '';
    session.phone = currentUser.phone || '';
    session.avatar = currentUser.avatar || '';
    session.oab = currentUser.oab || '';
    session.oabUf = currentUser.oabUf || '';
    session.judicialMonitoringEnabled = currentUser.judicialMonitoringEnabled;
    session.workspaceId = currentUser.workspaceId || this.state.defaultWorkspaceId;
    session.workspaceName = currentWorkspace?.name || resolveWorkspace(this.state, session.workspaceId)?.name || DEFAULT_WORKSPACE_NAME;
    session.lastSeenAt = Date.now();
    return session;
  }

  requireSession(req) {
    const session = this.authenticate(req);
    if (!session) throw httpError(401, 'Faça login para acessar a Central.');
    return session;
  }

  requireCsrf(req, session) {
    const supplied = String(req.headers['x-csrf-token'] || '');
    if (!supplied || !constantEqual(supplied, session.csrfToken)) throw httpError(403, 'Validação de segurança da sessão ausente ou inválida.');
  }

  async logout(req) {
    const token = parseCookies(req.headers.cookie || '').keller_session;
    if (token) this.sessions.delete(sha256(token));
    await this.revokeTrustedDevice(req);
  }

  sessionCookie(token) {
    return `keller_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}${this.secureCookies ? '; Secure' : ''}`;
  }

  clearCookie() {
    return `keller_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${this.secureCookies ? '; Secure' : ''}`;
  }

  trustedDeviceCookie(token) {
    return `keller_trusted=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(TRUSTED_DEVICE_MAX_AGE_MS / 1000)}${this.secureCookies ? '; Secure' : ''}`;
  }

  clearTrustedDeviceCookie() {
    return `keller_trusted=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${this.secureCookies ? '; Secure' : ''}`;
  }

  async createTrustedDevice(user, userAgent = '') {
    const token = randomBytes(48).toString('base64url');
    const now = Date.now();
    this.state.trustedDevices = (this.state.trustedDevices || []).filter(device => device.expiresAt > now).slice(-9);
    this.state.trustedDevices.push({
      id: randomBytes(12).toString('base64url'),
      tokenHash: sha256(token),
      userAgentHash: sha256(normalizeUserAgent(userAgent)),
      username: user.username,
      displayName: user.displayName,
      role: user.role || 'collaborator',
      email: user.email || '',
      phone: user.phone || '',
      avatar: user.avatar || '',
      workspaceId: user.workspaceId || this.state.defaultWorkspaceId,
      createdAt: new Date(now).toISOString(),
      expiresAt: now + TRUSTED_DEVICE_MAX_AGE_MS
    });
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return token;
  }

  findTrustedDevice(req) {
    const token = parseCookies(req.headers.cookie || '').keller_trusted;
    if (!token || !Array.isArray(this.state.trustedDevices)) return null;
    const tokenHash = sha256(token);
    const userAgentHash = sha256(normalizeUserAgent(req.headers['user-agent'] || ''));
    return this.state.trustedDevices.find(device => device.expiresAt > Date.now() && constantEqual(device.tokenHash, tokenHash) && constantEqual(device.userAgentHash, userAgentHash)) || null;
  }

  userForTrustedDevice(device) {
    const username = device.username || this.state.username;
    const user = (this.state.users || []).find(item => item.username === username)
      || (username === this.state.username ? {
        username: this.state.username,
        displayName: this.state.displayName,
        role: 'master_admin',
        email: this.state.email || '',
        oab: this.state.oab || '',
        oabUf: this.state.oabUf || '',
        judicialMonitoringEnabled: this.state.judicialMonitoringEnabled,
        workspaceId: this.state.defaultWorkspaceId
      } : null);
    const status = String(user?.status || 'active').toLowerCase();
    const isBlocked = status === 'inactive' || status === 'pending_approval' || status === 'suspended' || status === 'disabled';
    return user && !isBlocked ? user : null;
  }

  async revokeTrustedDevice(req) {
    const trusted = this.findTrustedDevice(req);
    if (!trusted) return false;
    this.state.trustedDevices = this.state.trustedDevices.filter(device => device.id !== trusted.id);
    this.sessions.delete(`trusted:${trusted.tokenHash}`);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return true;
  }

  createSession(username, displayName, role = 'master_admin', email = '', phone = '', avatar = '', oab = '', oabUf = '', judicialMonitoringEnabled, workspaceId = this.state.defaultWorkspaceId, mfaVerified = false) {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const now = Date.now();
    const workspaceName = resolveWorkspace(this.state, workspaceId)?.name || DEFAULT_WORKSPACE_NAME;
    const member = (this.state.users || []).find(item => item.username === username) || null;
    const officeRoleId = member?.officeRoleId || legacyRoleToOfficeRole(role);
    const memberKind = defaultMemberKind({ memberKind: member?.memberKind, roleId: officeRoleId, oab: oab || member?.oab, workspaceId });
    const permissions = resolveOfficePermissions(officeRoleId, member?.permissionOverrides, workspaceId);
    const isPrincipal = Boolean(member?.isPrincipal || role === 'master_admin');
    const teamIds = member ? this.teamIdsForUser(member, workspaceId) : [];
    this.sessions.set(sha256(token), { id: member?.id || '', username, displayName, role, officeRoleId, memberKind, permissions, isPrincipal, teamIds, email, phone: phone || '', avatar: avatar || '', oab: oab || '', oabUf: oabUf || '', judicialMonitoringEnabled, workspaceId, workspaceName, csrfToken, createdAt: now, lastSeenAt: now, expiresAt: now + SESSION_MAX_AGE_MS, mfaVerified: Boolean(mfaVerified) });
    return { token, csrfToken, user: publicProfile({ id: member?.id || '', username, displayName, role, officeRoleId, memberKind, permissions, isPrincipal, teamIds, email, phone, avatar, oab, oabUf, judicialMonitoringEnabled, workspaceId, workspaceName }) };
  }

  async consumeRecoveryCode(code) {
    if (!/^\d{5}-\d{5}$/.test(code) || !Array.isArray(this.state.recoveryHashes)) return false;
    const candidate = hashRecovery(code, this.state.recoverySalt);
    const index = this.state.recoveryHashes.findIndex(hash => constantEqual(hash, candidate));
    if (index < 0) return false;
    this.state.recoveryHashes.splice(index, 1);
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return true;
  }

  assertLoginAllowed(key) {
    this.pruneLoginAttempts();
    const attempt = this.loginAttempts.get(key);
    if (!attempt) return;
    const now = Date.now();
    if (Number(attempt.blockedUntil || 0) > now) {
      const error = httpError(429, 'Muitas tentativas. Aguarde antes de tentar novamente.');
      error.retryAfter = Math.ceil((Number(attempt.blockedUntil) - now) / 1000);
      throw error;
    }
  }

  registerLoginAttempt(key, now = Date.now()) {
    const spec = loginBucketSpec(key);
    const current = this.loginAttempts.get(key);
    const withinWindow = current && now < Number(current.resetAt || 0) && Number(current.blockedUntil || 0) <= now;
    const attempt = withinWindow
      ? current
      : { count: 0, resetAt: now + spec.windowMs, blockedUntil: 0, strikes: Math.max(0, Math.floor(Number(current?.strikes) || 0)) };
    attempt.count = Math.max(0, Math.floor(Number(attempt.count) || 0)) + 1;
    if (attempt.count >= spec.maxFailures) {
      const maxFactor = Math.max(1, Math.floor(spec.maxBlockMs / spec.baseBlockMs));
      const factor = Math.min(2 ** Math.min(attempt.strikes, 8), maxFactor);
      attempt.blockedUntil = now + spec.baseBlockMs * factor;
      attempt.strikes = Math.max(0, Math.floor(Number(attempt.strikes) || 0)) + 1;
      attempt.count = 0;
    }
    this.loginAttempts.set(key, attempt);
    this.pruneLoginAttempts(now);
  }

  async recordLoginFailure(...keys) {
    const now = Date.now();
    for (const key of keys) this.registerLoginAttempt(key, now);
    await this.save();
  }

  async clearLoginAttempts(...keys) {
    let removed = false;
    for (const key of keys) if (this.loginAttempts.delete(key)) removed = true;
    if (removed) await this.save();
  }

  pruneLoginAttempts(now = Date.now()) {
    for (const [key, attempt] of this.loginAttempts) {
      if (!Number.isFinite(Number(attempt?.resetAt)) || (now >= Number(attempt.resetAt) && Number(attempt.blockedUntil || 0) <= now)) {
        this.loginAttempts.delete(key);
      }
    }
    // Nunca evicta entradas ainda bloqueadas ou dentro da janela: a evicção
    // permitiria ao atacante reiniciar o próprio contador.
    if (this.loginAttempts.size > LOGIN_ATTEMPT_MAX_ENTRIES) {
      for (const [key, attempt] of this.loginAttempts) {
        if (this.loginAttempts.size <= LOGIN_ATTEMPT_MAX_ENTRIES) break;
        if (Number(attempt.blockedUntil || 0) > now || Number(attempt.resetAt || 0) > now) continue;
        this.loginAttempts.delete(key);
      }
    }
  }

  applyTotpConsumption(user, step) {
    const record = this.findPersistedUserRecord(user);
    if (record) record.totpLastUsedStep = step;
  }

  findPersistedUserRecord(user) {
    if (!user) return null;
    if (user.id) {
      const stored = (this.state.users || []).find(item => item.id === user.id);
      if (stored) return stored;
    }
    return constantEqual(user.username, this.state.username) ? this.state : null;
  }

  signSetupToken(payload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${createHmac('sha256', this.sessionSecret).update(encoded).digest('base64url')}`;
  }

  verifySetupToken(token, pending) {
    const [encoded, signature] = String(token || '').split('.');
    if (!encoded || !signature) return false;
    const expected = createHmac('sha256', this.sessionSecret).update(encoded).digest('base64url');
    if (!constantEqual(signature, expected)) return false;
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      return payload.nonce === pending.nonce
        && payload.expiresAt === pending.expiresAt
        && (!pending.purpose || payload.purpose === pending.purpose)
        && Date.now() < payload.expiresAt;
    } catch { return false; }
  }

  encrypt(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  }

  decrypt(payload) {
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  sessionsSnapshotFile() {
    return path.join(this.dataDirectory, 'sessions.snapshot.json');
  }

  /** Ao encerrar o serviço, guarda as sessões ativas cifradas: publicar não desconecta ninguém. */
  async persistSessionsSnapshot() {
    this.cleanupSessions();
    const payload = JSON.stringify([...this.sessions.entries()]);
    await writeFile(this.sessionsSnapshotFile(), JSON.stringify(this.encrypt(payload)), { encoding: 'utf8', mode: 0o600 });
    return this.sessions.size;
  }

  /** O arquivo vale uma única vez e é apagado ao ler. Sessão vencida não volta. */
  async restoreSessionsSnapshot() {
    const file = this.sessionsSnapshotFile();
    let raw;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      return 0;
    }
    await unlink(file).catch(() => {});
    try {
      const now = Date.now();
      let restored = 0;
      for (const [key, session] of JSON.parse(this.decrypt(JSON.parse(raw)))) {
        if (!session || now > session.expiresAt || now - session.lastSeenAt > SESSION_IDLE_MS) continue;
        this.sessions.set(key, session);
        restored += 1;
      }
      return restored;
    } catch {
      return 0;
    }
  }

  cleanupSessions() {
    const now = Date.now();
    for (const [key, session] of this.sessions) if (now > session.expiresAt || now - session.lastSeenAt > SESSION_IDLE_MS) this.sessions.delete(key);
  }

  async issueCollectorToken(workspaceId) {
    const workspace = resolveWorkspace(this.state, workspaceId);
    if (!workspace || workspace.status !== 'active') throw httpError(404, 'Escritório não encontrado.');
    const token = randomBytes(32).toString('base64url');
    this.state.collectorAgents = (this.state.collectorAgents || []).filter(agent => agent.workspaceId !== workspace.id);
    this.state.collectorAgents.push({
      workspaceId: workspace.id,
      tokenHash: sha256(token),
      createdAt: new Date().toISOString()
    });
    this.state.updatedAt = new Date().toISOString();
    await this.save();
    return { token, workspace: publicWorkspace(workspace) };
  }

  authenticateCollector(token, workspaceId) {
    const suppliedToken = String(token || '').trim();
    const workspace = resolveWorkspace(this.state, workspaceId);
    if (!suppliedToken || !workspace || workspace.status !== 'active') return null;
    const agent = (this.state.collectorAgents || []).find(item => item.workspaceId === workspace.id);
    if (!agent?.tokenHash || !constantEqual(agent.tokenHash, sha256(suppliedToken))) return null;
    return publicWorkspace(workspace);
  }

  collectorTokenStatus(workspaceId) {
    const agent = (this.state.collectorAgents || []).find(item => item.workspaceId === workspaceId);
    return agent ? { paired: true, createdAt: agent.createdAt || null } : { paired: false, createdAt: null };
  }

  async revokeCollectorToken(workspaceId) {
    const before = (this.state.collectorAgents || []).length;
    this.state.collectorAgents = (this.state.collectorAgents || []).filter(agent => agent.workspaceId !== workspaceId);
    if (this.state.collectorAgents.length !== before) {
      this.state.updatedAt = new Date().toISOString();
      await this.save();
    }
    return { revoked: this.state.collectorAgents.length !== before };
  }

  async save() {
    // Os baldes vivem em Map em memória e são espelhados no estado persistido no
    // momento da gravação, inclusive quando state é substituído (setup/cloud).
    this.state.loginAttempts = serializeAttemptMap(this.loginAttempts);
    this.state.passwordResetAttempts = serializeAttemptMap(this.passwordResetAttempts);
    this.state.workspaceRegistrationAttempts = serializeAttemptMap(this.workspaceRegistrationAttempts);
    const snapshot = JSON.stringify(this.state, null, 2);
    const operation = async () => {
      await mkdir(this.dataDirectory, { recursive: true });
      const temporary = `${this.file}.tmp-${randomBytes(8).toString('hex')}`;
      try {
        await writeFile(temporary, snapshot, { encoding: 'utf8', mode: 0o600 });
        await rename(temporary, this.file);
      } finally {
        await unlink(temporary).catch(() => {});
      }
    };
    const queued = this.saveTail.then(operation, operation);
    this.saveTail = queued.catch(() => {});
    return queued;
  }
}

export function isLoopback(address = '') {
  return address === '127.0.0.1' || address === '::1' || address.endsWith('127.0.0.1');
}

export function verifyTotp(secret, code, now = Date.now()) {
  const normalized = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(now / TOTP_STEP_MS);
  return [-1, 0, 1].some(offset => constantEqual(generateTotp(secret, counter + offset), normalized));
}

// Retorna o passo de tempo (±1 janela) ao qual o código apresentado pertence,
// ou null. Usado pelo login para consumir o passo uma única vez por usuário.
export function matchTotpStep(secret, code, now = Date.now()) {
  const normalized = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const counter = Math.floor(now / TOTP_STEP_MS);
  for (const offset of [0, -1, 1]) {
    const step = counter + offset;
    if (step < 0) continue;
    if (constantEqual(generateTotp(secret, step), normalized)) return step;
  }
  return null;
}

export function generateTotp(secret, counter = Math.floor(Date.now() / TOTP_STEP_MS)) {
  const key = decodeBase32(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, '0');
}

async function hashPassword(password, salt) {
  return Buffer.from(await scrypt(String(password), Buffer.from(salt, 'base64'), 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })).toString('base64');
}

function publicTeam(team = {}) {
  return {
    id: String(team.id || ''),
    name: String(team.name || ''),
    description: String(team.description || ''),
    memberIds: Array.isArray(team.memberIds) ? team.memberIds.map(String) : [],
    createdAt: team.createdAt || '',
    updatedAt: team.updatedAt || ''
  };
}

function publicProfile(user = {}) {
  return {
    id: user.id || '',
    username: user.username,
    displayName: user.displayName,
    role: user.role || 'master_admin',
    officeRoleId: user.officeRoleId || '',
    memberKind: user.memberKind || '',
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    isPrincipal: Boolean(user.isPrincipal),
    teamIds: Array.isArray(user.teamIds) ? user.teamIds : [],
    email: user.email || '',
    phone: user.phone || '',
    avatar: user.avatar || '',
    oab: user.oab || '',
    oabUf: user.oabUf || '',
    judicialMonitoringEnabled: user.judicialMonitoringEnabled,
    workspaceId: user.workspaceId || '',
    workspaceName: user.workspaceName || ''
  };
}

function validateUsername(username) {
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) throw httpError(400, 'O usuário deve ter de 3 a 64 caracteres simples.');
}

/**
 * Nomes reservados do produto: a autoria das ações autônomas do Atrium IA não pode ser
 * falsificada por um perfil de pessoa (decisão do operador, 2026-09-30). A comparação ignora
 * caixa, acentos e espaços repetidos — "  atrium   iá " também é recusado.
 */
const RESERVED_DISPLAY_NAMES = new Set(['atrium ia']);

function normalizeDisplayNameKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function assertDisplayNameAllowed(displayName) {
  if (RESERVED_DISPLAY_NAMES.has(normalizeDisplayNameKey(displayName))) {
    throw httpError(400, 'Este nome é reservado para as ações autônomas do Atrium IA. Escolha outro nome.');
  }
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 10 || value.length > 128) throw httpError(400, 'A senha deve ter entre 10 e 128 caracteres.');
  const groups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(expression => expression.test(value)).length;
  if (groups < 3) throw httpError(400, 'Combine ao menos três grupos: minúsculas, maiúsculas, números e símbolos.');
}

function parseCookies(header) {
  return Object.fromEntries(header.split(';').map(item => item.trim()).filter(Boolean).map(item => {
    const separator = item.indexOf('=');
    if (separator < 0) return [item, ''];
    const raw = item.slice(separator + 1);
    let value = raw;
    try { value = decodeURIComponent(raw); } catch { value = raw; }
    return [item.slice(0, separator), value];
  }));
}
function normalizeUserAgent(value) { return String(value || '').slice(0, 500).trim(); }

function sha256(value) { return createHash('sha256').update(value).digest('base64url'); }
function hashRecovery(value, salt) { return createHmac('sha256', Buffer.from(salt, 'base64')).update(value).digest('base64url'); }
function constantEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}
function randomDigits(length) { return Array.from(randomBytes(length), byte => String(byte % 10)).join(''); }
function encodeBase32(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0; let value = 0; let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0; let current = 0; const bytes = [];
  for (const character of String(value).toUpperCase().replace(/=|\s/g, '')) {
    const index = alphabet.indexOf(character); if (index < 0) continue;
    current = (current << 5) | index; bits += 5;
    if (bits >= 8) { bytes.push((current >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}
function httpError(statusCode, message) { return Object.assign(new Error(message), { statusCode }); }

// Contrato público 409: a equipe continua atribuída a processo e a exclusão revogaria
// acesso. A saída é desatribuir nos processos antes de excluir.
const TEAM_IN_USE_MESSAGE = 'A equipe ainda está atribuída a processos. Remova a atribuição desses processos antes de excluir a equipe.';

function teamInUseError() {
  return Object.assign(new Error(TEAM_IN_USE_MESSAGE), { statusCode: 409, code: 'TEAM_IN_USE' });
}

function loginBucketSpec(key) {
  const prefix = String(key || '').split(':', 1)[0];
  return LOGIN_BUCKET_SPECS[prefix] || LOGIN_BUCKET_SPECS.attempt;
}

function parseLimitRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const count = Number(raw.count);
  const resetAt = Number(raw.resetAt);
  const blockedUntil = Number(raw.blockedUntil || 0);
  const strikes = Number(raw.strikes || 0);
  if (!Number.isFinite(count) || count < 0 || !Number.isFinite(resetAt)) return null;
  return {
    count: Math.floor(count),
    resetAt,
    blockedUntil: Number.isFinite(blockedUntil) && blockedUntil > 0 ? blockedUntil : 0,
    strikes: Number.isFinite(strikes) && strikes > 0 ? Math.floor(strikes) : 0
  };
}

function hydrateLoginAttempts(value, now = Date.now()) {
  const map = new Map();
  let changed = value !== undefined;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    changed = false;
    for (const [key, raw] of Object.entries(value)) {
      const record = parseLimitRecord(raw);
      if (!record || (now >= record.resetAt && record.blockedUntil <= now)) { changed = true; continue; }
      map.set(key, record);
    }
  }
  return { map, changed };
}

function hydratePasswordResetAttempts(value, now = Date.now()) {
  const map = new Map();
  let changed = value !== undefined;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    changed = false;
    for (const [key, raw] of Object.entries(value)) {
      const record = parseLimitRecord(raw);
      if (!record || now >= record.resetAt) { changed = true; continue; }
      map.set(key, { count: record.count, resetAt: record.resetAt });
    }
  }
  return { map, changed };
}

function hydrateWorkspaceRegistrationAttempts(value, now = Date.now()) {
  const map = new Map();
  let changed = value !== undefined;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    changed = false;
    for (const [key, raw] of Object.entries(value)) {
      const startedAt = Number(raw?.startedAt);
      const count = Number(raw?.count);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Number.isFinite(startedAt) || !Number.isFinite(count) || count < 0 || now - startedAt > LOGIN_WINDOW_MS) {
        changed = true;
        continue;
      }
      map.set(key, { startedAt, count: Math.floor(count) });
    }
  }
  return { map, changed };
}

function serializeAttemptMap(map) {
  return Object.fromEntries([...map].map(([key, value]) => [key, { ...value }]));
}
