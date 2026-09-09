import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ClientCertMtlsAuthAdapter, AUTH_STRATEGIES } from '../lib/judicial/auth-adapters.mjs';
import { generateTotp } from '../lib/security.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — TESTE DE INTEGRAÇÃO: EPROC TJRS (A1 mTLS + TOTP 2FA)');
console.log('===============================================================\n');

// 1. Validação do catálogo de portais e origens de autenticação mTLS
console.log('[1/4] Verificando configuração dos portais TJRS em portals.example.json...');
const catalog = JSON.parse(await readFile(new URL('../collector/portals.example.json', import.meta.url), 'utf8'));
const tjrs1g = catalog.portals.find(p => p.id === 'eproc-tjrs-1g');
const tjrs2g = catalog.portals.find(p => p.id === 'eproc-tjrs-2g');

assert(tjrs1g, 'eproc-tjrs-1g deve existir no catálogo');
assert(tjrs2g, 'eproc-tjrs-2g deve existir no catálogo');
assert.equal(tjrs1g.authStrategy, 'client-cert-mtls');
assert.equal(tjrs1g.certificateMode, 'pfx-mtls');
assert.equal(tjrs1g.usesCertificate, true);
assert.equal(tjrs1g.supportsTotp, true);
assert(Array.isArray(tjrs1g.trustedAuthOrigins), 'trustedAuthOrigins deve ser array');
assert(tjrs1g.trustedAuthOrigins.includes('https://keycloak-httpd-mtls.tjrs.jus.br'), 'Origem mTLS do Keycloak do TJRS deve estar presente');

assert.equal(tjrs2g.authStrategy, 'client-cert-mtls');
assert(tjrs2g.trustedAuthOrigins.includes('https://keycloak-httpd-mtls.tjrs.jus.br'));
console.log('  ✓ Portais eproc-tjrs-1g e 2g configurados para mTLS com Keycloak e 2FA TOTP.');

// 2. Validação do Adapter ClientCertMtlsAuthAdapter com Keycloak e TOTP
console.log('\n[2/4] Testando fluxo de autenticação automatizada no ClientCertMtlsAuthAdapter...');
const adapter = new ClientCertMtlsAuthAdapter();
assert.equal(adapter.strategy, AUTH_STRATEGIES.CLIENT_CERT_MTLS);

// Mock page que simula o fluxo do Keycloak do TJRS
const testSecret = 'JBSWY3DPEHPK3PXP'; // segredo sintético padrão RFC 3548 (Base32)
let clickedCert = false;
let injectedOtp = '';
let submittedOtp = false;

const mockPage = {
  _url: 'https://keycloak-httpd-mtls.tjrs.jus.br/auth/realms/eproc/protocol/openid-connect/auth',
  url() { return this._url; },
  async goto(url) { this._url = url; },
  async waitForTimeout() {},
  async waitForLoadState() {},
  locator(selector) {
    if (selector.includes('acao=usuario_sair') || selector.includes('acao=painel_adv_listar')) {
      return { async count() { return 0; } };
    }
    if (selector.includes('kc-login-certificate')) {
      return {
        first() {
          return {
            async count() { return 1; },
            async isVisible() { return true; },
            async click() { clickedCert = true; }
          };
        }
      };
    }
    if (selector.includes('otp')) {
      return {
        first() {
          return {
            async count() { return 1; },
            async isVisible() { return true; },
            async fill(code) { injectedOtp = code; },
            async press(key) { if (key === 'Enter') submittedOtp = true; }
          };
        }
      };
    }
    if (selector.includes('kc-login')) {
      return {
        first() {
          return {
            async count() { return 1; },
            async click() { submittedOtp = true; }
          };
        }
      };
    }
    return { first() { return { async count() { return 0; } }; }, async count() { return 0; } };
  },
  async textContent() { return 'Tela de login Keycloak eproc'; }
};

const authResult = await adapter.authenticate(null, mockPage, tjrs1g, { totpSecret: testSecret });
assert.equal(authResult.ok, true);
assert.equal(clickedCert, true, 'Deve ter clicado em "Entrar com Certificado Digital"');
assert.equal(injectedOtp.length, 6, 'Código TOTP injetado deve ter 6 dígitos');
assert.equal(injectedOtp, generateTotp(testSecret), 'Código TOTP deve corresponder ao segredo');
assert.equal(submittedOtp, true, 'Deve ter submetido o formulário 2FA');
console.log(`  ✓ Autenticação híbrida executada: Certificado clicado + TOTP injetado (${injectedOtp}).`);

// 3. Validação de ausência de segredo quando 2FA é exigido
console.log('\n[3/4] Testando proteção contra ausência de segredo TOTP...');
const mockPageWithoutSecret = {
  ...mockPage,
  locator(selector) {
    if (selector.includes('kc-login-certificate')) {
      return { first() { return { async count() { return 0; } }; } };
    }
    if (selector.includes('otp')) {
      return { first() { return { async count() { return 1; }, async isVisible() { return true; } }; } };
    }
    return { first() { return { async count() { return 0; } }; }, async count() { return 0; } };
  }
};

try {
  await adapter.authenticate(null, mockPageWithoutSecret, tjrs1g, { totpSecret: null });
  assert.fail('Deveria ter lançado erro de TOTP ausente');
} catch (err) {
  assert.equal(err.errorCode, 'AUTH-TOTP-REQUIRED');
  assert.equal(err.humanRequired, true);
  console.log('  ✓ Erro informativo lançado quando TOTP é exigido mas não configurado.');
}

// 4. Validação de validação de sessão ativa vs inativa
console.log('\n[4/4] Testando detecção de sessão ativa e inativa do eproc...');
const activePage = {
  url() { return 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=painel_adv_listar&hash=123abc456def'; },
  async textContent() { return 'Painel do Advogado - Processos com Prazo Aberto'; },
  locator() { return { async count() { return 0; } }; }
};
assert.equal(await adapter.validateSession(activePage, tjrs1g), true, 'Sessão com hash e painel deve ser considerada ativa');

const keycloakPage = {
  url() { return 'https://keycloak-httpd-mtls.tjrs.jus.br/auth/realms/eproc/login'; },
  async textContent() { return 'Informe suas credenciais'; },
  locator(sel) { return { async count() { return sel.includes('kc-login') ? 1 : 0; } }; }
};
assert.equal(await adapter.validateSession(keycloakPage, tjrs1g), false, 'Página do Keycloak não pode ser considerada logada');
console.log('  ✓ Validador de sessão distingue perfeitamente sessão ativa de tela de login.');

console.log('\n===============================================================');
console.log('  TODOS OS TESTES DE INTEGRAÇÃO A1 + TOTP PASSARAM COM SUCESSO!');
console.log('===============================================================\n');
