import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { JudicialCredentialManager } from '../lib/judicial/credential-manager.mjs';
import {
  normalizePortalId,
  getCredentialScopeForPortal,
  REGIONAL_CREDENTIAL_SCOPES
} from '../lib/judicial/eproc/portal-registry.mjs';
import { sanitizeTelemetryPayload, buildPortalTelemetry } from '../lib/judicial/eproc/telemetry.mjs';

// Mock SecurityManager using simple reversible AES mock for unit testing
const mockSecurity = {
  encrypt: (val) => JSON.stringify({ cipher: Buffer.from(val).toString('base64') }),
  decrypt: (val) => Buffer.from(JSON.parse(val).cipher, 'base64').toString('utf8'),
  encryptionKey: Buffer.from('01234567890123456789012345678901')
};

async function runRegionalCredentialScopeTest() {
  console.log('=== TESTE FOCAL: REGIONAL CREDENTIAL SCOPE & MULTI-TENANT ISOLATION (WAVE E) ===\n');

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'atrium-cred-scope-'));

  try {
    const cm = new JudicialCredentialManager({
      dataDirectory: tmpDir,
      securityManager: mockSecurity
    });
    await cm.init();

    // -------------------------------------------------------------------------
    // 1. Herança Regional (4ª Região: TRF4, JFRS, JFSC, JFPR)
    // -------------------------------------------------------------------------
    // Configura credenciais e TOTP no escopo compartilhado 'trf4-region' para um workspace
    const ws1 = 'workspace-curitiba-adv';
    const ident1 = 'adv-principal';

    // Salva TOTP sob o escopo regional 'trf4-region'
    // Segredo Base32 válido (JBSWY3DPEHPK3PXP)
    await cm.savePortalTotp('trf4-region', {
      secret: 'JBSWY3DPEHPK3PXP',
      label: '4ª Região Unificada',
      workspaceId: ws1,
      identityId: ident1
    });

    await cm.savePortalCredentials('trf4-region', {
      username: 'adv.trf4.nacional',
      password: 'senha-regional-segura',
      oab: '12345',
      uf: 'PR',
      workspaceId: ws1,
      identityId: ident1
    });

    // Consulta para todos os 4 portais da 4ª Região: devem herdar o segredo e credencial regional
    const regionalPortals = ['trf4-eproc-2g', 'jfrs-eproc-1g', 'jfsc-eproc-1g', 'jfpr-eproc-1g'];
    for (const pid of regionalPortals) {
      const totp = await cm.getPortalTotpSecret(pid, ident1, ws1);
      assert.equal(totp, 'JBSWY3DPEHPK3PXP', `Portal ${pid} deve herdar TOTP regional trf4-region`);

      const creds = await cm.getPortalCredentials(pid, ident1, ws1);
      assert.ok(creds, `Portal ${pid} deve herdar credenciais regionais`);
      assert.equal(creds.username, 'adv.trf4.nacional');
      assert.equal(creds.password, 'senha-regional-segura');
    }
    console.log('✓ 1. Herança regional comprovada para TRF4, JFRS, JFSC e JFPR via trf4-region.');

    // -------------------------------------------------------------------------
    // 2. Override por Portal
    // -------------------------------------------------------------------------
    // Configura override específico apenas para JFSC (ex: filial de Florianópolis com OAB/SC distinta)
    await cm.savePortalTotp('jfsc-eproc-1g', {
      secret: 'KRUGS4ZANFZSA3TJ', // Segredo base32 válido distinto
      label: 'JFSC Florianópolis Dedicado',
      workspaceId: ws1,
      identityId: ident1
    });

    await cm.savePortalCredentials('jfsc-eproc-1g', {
      username: 'adv.florianopolis.sc',
      password: 'senha-especifica-sc',
      oab: '98765',
      uf: 'SC',
      workspaceId: ws1,
      identityId: ident1
    });

    // JFSC deve retornar o override
    const jfscTotp = await cm.getPortalTotpSecret('jfsc-eproc-1g', ident1, ws1);
    assert.equal(jfscTotp, 'KRUGS4ZANFZSA3TJ', 'JFSC deve retornar o override específico de portal');

    const jfscCreds = await cm.getPortalCredentials('jfsc-eproc-1g', ident1, ws1);
    assert.equal(jfscCreds.username, 'adv.florianopolis.sc', 'JFSC deve retornar credenciais específicas');

    // Os demais (JFPR, JFRS, TRF4) devem continuar herdando o regional sem contaminação
    const jfprTotp = await cm.getPortalTotpSecret('jfpr-eproc-1g', ident1, ws1);
    assert.equal(jfprTotp, 'JBSWY3DPEHPK3PXP', 'JFPR deve continuar com o segredo regional original');

    const trf4Creds = await cm.getPortalCredentials('trf4-eproc-2g', ident1, ws1);
    assert.equal(trf4Creds.username, 'adv.trf4.nacional', 'TRF4 deve continuar com a credencial regional original');
    console.log('✓ 2. Override por portal validado: JFSC possui configuração dedicada e JFPR/TRF4 mantêm herança.');

    // -------------------------------------------------------------------------
    // 3. Ausência de Credencial
    // -------------------------------------------------------------------------
    const missingTotp = await cm.getPortalTotpSecret('tjto-eproc-1g', ident1, ws1);
    assert.equal(missingTotp, null, 'Portal não configurado deve retornar null');

    const missingCreds = await cm.getPortalCredentials('tjto-eproc-1g', ident1, ws1);
    assert.equal(missingCreds, null, 'Credenciais não configuradas devem retornar null');
    console.log('✓ 3. Ausência de credencial tratada com segurança (retorna null, fail-safe).');

    // -------------------------------------------------------------------------
    // 4. Portal Desconhecido & Rejeição de Typos Arbitrários
    // -------------------------------------------------------------------------
    assert.equal(normalizePortalId('tjrs-eproc-99g'), null, 'Typo arbitrário não deve ser mascarado');
    assert.equal(normalizePortalId('eproc-desconhecido'), null, 'Portal inexistente deve retornar null');
    assert.throws(
      () => normalizePortalId('eproc-desconhecido', { strict: true }),
      /Portal judicial desconhecido ou inexistente/,
      'normalizePortalId em modo strict deve lançar erro explícito'
    );

    // Aliases legados devem normalizar para oficial
    assert.equal(normalizePortalId('eproc-tjrs-1g'), 'tjrs-eproc-1g');
    assert.equal(normalizePortalId('eproc-jfsc-1g'), 'jfsc-eproc-1g');
    assert.equal(normalizePortalId('eproc-jfpr-1g'), 'jfpr-eproc-1g');
    assert.equal(normalizePortalId('eproc-jfrs-1g'), 'jfrs-eproc-1g');
    assert.equal(normalizePortalId('eproc-trf4-2g'), 'trf4-eproc-2g');
    assert.equal(getCredentialScopeForPortal('eproc-tjrs-1g'), 'tjrs-eproc');
    assert.equal(getCredentialScopeForPortal('eproc-tjrs-2g'), 'tjrs-eproc');
    assert.equal(getCredentialScopeForPortal('eproc-jfrs'), 'trf4-eproc');
    assert.equal(getCredentialScopeForPortal('eproc-trf4-2g'), 'trf4-eproc');
    await cm.savePortalTotp('eproc-tjrs-1g', { secret: 'JBSWY3DPEHPK3PXP', label: 'Alias legado sintético' });
    assert.equal(
      await cm.getPortalTotpSecret('tjrs-eproc-1g'),
      'JBSWY3DPEHPK3PXP',
      'O executor oficial deve ler credencial salva anteriormente pelo alias da UI.'
    );
    await cm.savePortalTotp('tjrs-eproc-1g', { secret: 'JBSWY3DPEHPK3PXP', label: 'Override legado' });
    await cm.savePortalTotp('tjrs-eproc', {
      secret: 'MFRGGZDFMZTWQ2LK',
      label: 'Escopo TJRS atualizado',
      replacePortalIds: ['eproc-tjrs-1g', 'tjrs-eproc-1g']
    });
    assert.equal(await cm.getPortalTotpSecret('tjrs-eproc-1g'), 'MFRGGZDFMZTWQ2LK', 'Troca por escopo deve remover override legado e alimentar o executor oficial.');
    console.log('✓ 4. Validação de portal ID oficial: aliases normalizados e typos rejeitados sem mascaramento.');

    // -------------------------------------------------------------------------
    // 5. Segredo TOTP Inválido
    // -------------------------------------------------------------------------
    await assert.rejects(
      async () => {
        await cm.savePortalTotp('jfpr-eproc-1g', {
          secret: 'INVALIDO!@#$1234999', // Caracteres fora da base32
          workspaceId: ws1,
          identityId: ident1
        });
      },
      /Segredo Base32 inválido|Segredo TOTP inválido/,
      'Deve rejeitar segredo TOTP que não seja base32 válida'
    );
    console.log('✓ 5. Rejeição de segredo TOTP inválido comprovada via sandbox criptográfico.');

    // -------------------------------------------------------------------------
    // 6. Redaction em Telemetria e Logs
    // -------------------------------------------------------------------------
    const dirtyTelemetry = {
      portalId: 'jfsc-eproc-1g',
      credentialScope: 'trf4-region',
      username: 'usuario_admin',
      password: 'SENHA_SUPER_SECRETA_123',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      accessKey: 'CHAVE_DE_ACESSO_SECRETA',
      cookie: 'ChaAnon_abc123456',
      cpf: '123.456.789-00',
      plaintiff: 'João da Silva Sauro',
      counts: { processes: 42, deadlines: 3 }
    };

    const clean = sanitizeTelemetryPayload(dirtyTelemetry);
    assert.equal(clean.password, '[REDACTED_SECRET]', 'Senha deve ser redigida');
    assert.equal(clean.totpSecret, '[REDACTED_SECRET]', 'TOTP secret deve ser redigido');
    assert.equal(clean.accessKey, '[REDACTED_SECRET]', 'Chave de acesso deve ser redigida');
    assert.equal(clean.cookie, '[REDACTED_SECRET]', 'Cookie deve ser redigido');
    assert.equal(clean.cpf, '123.***.***-00', 'CPF deve ser mascarado');
    assert.equal(clean.plaintiff, 'João d*** S*** S***', 'Nome de parte deve ser mascarado');
    assert.equal(clean.counts.processes, 42, 'Contadores operacionais devem ser preservados');

    // Teste de buildPortalTelemetry
    const telemetryRecord = buildPortalTelemetry({
      portalId: 'jfpr-eproc-1g',
      credentialScope: 'trf4-region',
      trigger: 'scheduled',
      scheduledSlot: '2026-09-14T22:00:00.000Z',
      startedAt: '2026-09-14T22:00:00.000Z',
      finishedAt: '2026-09-14T22:00:05.500Z',
      state: 'COMPLETED',
      counts: { processes: 15, deadlines: 2 }
    });
    assert.equal(telemetryRecord.durationMs, 5500);
    assert.equal(telemetryRecord.portalId, 'jfpr-eproc-1g');
    assert.equal(telemetryRecord.credentialScope, 'trf4-region');
    assert.equal(telemetryRecord.scheduledSlot, '2026-09-14T22:00:00.000Z');
    console.log('✓ 6. Sanitização e redaction de telemetria comprovada (zero vazamento de segredos ou PII).');

    // -------------------------------------------------------------------------
    // 7. Isolamento Estrito entre Workspaces
    // -------------------------------------------------------------------------
    const ws2 = 'workspace-outro-escritorio';
    const ident2 = 'outro-advogado';

    // ws2 não possui credenciais cadastradas
    const ws2Totp = await cm.getPortalTotpSecret('trf4-eproc-2g', ident2, ws2);
    assert.equal(ws2Totp, null, 'Workspace B nunca pode acessar segredos do Workspace A');

    const ws2Creds = await cm.getPortalCredentials('jfsc-eproc-1g', ident2, ws2);
    assert.equal(ws2Creds, null, 'Workspace B nunca pode acessar credenciais do Workspace A');
    console.log('✓ 7. Isolamento multitenant estrito comprovado entre workspaces independentes.');

    // -------------------------------------------------------------------------
    // 8. Workspace novo não herda cofre raiz nem variáveis de ambiente
    // -------------------------------------------------------------------------
    const isolatedRoot = path.join(tmpDir, 'isolamento-cofre');
    const defaultData = path.join(isolatedRoot, 'data');
    const isolatedData = path.join(defaultData, 'workspaces', 'ws-00000000-0000-4000-8000-000000000001');
    const defaultManager = new JudicialCredentialManager({ dataDirectory: defaultData, securityManager: mockSecurity });
    await defaultManager.init();
    await defaultManager.savePortalTotp('tjrs-eproc-1g', { secret: 'JBSWY3DPEHPK3PXP', label: 'Workspace padrão' });

    const previousEnvTotp = process.env.TJRS_EPROC_TOTP_SECRET;
    process.env.TJRS_EPROC_TOTP_SECRET = 'KRUGS4ZANFZSA3TJ';
    try {
      const isolatedManager = new JudicialCredentialManager({
        dataDirectory: isolatedData,
        securityManager: mockSecurity,
        allowLegacyRootFallback: false,
        allowEnvironmentFallback: false
      });
      await isolatedManager.init();
      assert.equal(await isolatedManager.getPortalTotpSecret('tjrs-eproc-1g'), null, 'Workspace novo não pode herdar TOTP do cofre raiz ou do ambiente.');
      await isolatedManager.savePortalTotp('tjrs-eproc-1g', { secret: 'MFRGGZDFMZTWQ2LK', label: 'Workspace isolado' });
      assert.equal(await isolatedManager.getPortalTotpSecret('tjrs-eproc-1g'), 'MFRGGZDFMZTWQ2LK');
      assert.equal(await defaultManager.getPortalTotpSecret('tjrs-eproc-1g'), 'JBSWY3DPEHPK3PXP', 'Salvar no workspace isolado não pode alterar o cofre padrão.');
      await isolatedManager.removePortalTotp('tjrs-eproc-1g');
      assert.equal(await isolatedManager.getPortalTotpSecret('tjrs-eproc-1g'), null);
      assert.equal(await defaultManager.getPortalTotpSecret('tjrs-eproc-1g'), 'JBSWY3DPEHPK3PXP', 'Remover no workspace isolado não pode alterar o cofre padrão.');
    } finally {
      if (previousEnvTotp === undefined) delete process.env.TJRS_EPROC_TOTP_SECRET;
      else process.env.TJRS_EPROC_TOTP_SECRET = previousEnvTotp;
    }
    console.log('✓ 8. Workspace novo não herda cofre raiz nem fallback de ambiente.');

    console.log('\n>>> REGIONAL CREDENTIAL SCOPE TEST PASSED! <<<\n');
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

runRegionalCredentialScopeTest().catch(err => {
  console.error('Falha no teste regional credential scope:', err);
  process.exit(1);
});
