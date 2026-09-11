import assert from 'node:assert/strict';
import test from 'node:test';
import { extractProcessDetails } from '../collector/adapters/eproc.mjs';
import { createTjrsSidecarHttpHandler } from '../lib/http/tjrs-sidecar-routes.mjs';

test('eproc - Extração da chave do processo em diferentes formatos da capa', async () => {
  // Cenário 1: Chave visível em #spnChaveProcesso
  const mockPage1 = {
    locator: () => ({
      first: () => ({
        isVisible: async () => true,
        count: async () => 1
      })
    }),
    evaluate: async (fn) => {
      // Simula DOM do eproc com #spnChaveProcesso
      globalThis.document = {
        querySelector: (sel) => {
          if (sel.includes('#spnChaveProcesso')) return { innerText: '  847291048291  ' };
          return null;
        },
        querySelectorAll: () => [],
        body: { innerText: 'Processo 5001234-56.2026.8.21.0001\nClasse: Procedimento Comum' }
      };
      return fn();
    }
  };

  const details1 = await extractProcessDetails(mockPage1);
  assert.equal(details1.accessKey, '847291048291');
  assert.equal(details1.chaveAcesso, '847291048291');

  // Cenário 2: Chave presente no onclick de botão ou link
  const mockPage2 = {
    locator: () => ({
      first: () => ({
        isVisible: async () => false,
        count: async () => 0
      })
    }),
    evaluate: async (fn) => {
      globalThis.document = {
        querySelector: () => null,
        querySelectorAll: (sel) => {
          if (sel.includes('onclick')) {
            return [{
              dataset: {},
              getAttribute: (attr) => attr === 'onclick' ? "buscarChaveProcesso('998877665544')" : null
            }];
          }
          return [];
        },
        body: { innerText: 'Processo 5001234-56.2026.8.21.0001\nClasse: Procedimento Comum' }
      };
      return fn();
    }
  };

  const details2 = await extractProcessDetails(mockPage2);
  assert.equal(details2.accessKey, '998877665544');
  assert.equal(details2.chaveAcesso, '998877665544');

  // Cenário 3: Chave no texto corrido da capa (Chave de Acesso: ABC123456)
  const mockPage3 = {
    locator: () => ({
      first: () => ({
        isVisible: async () => false,
        count: async () => 0
      })
    }),
    evaluate: async (fn) => {
      globalThis.document = {
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { innerText: 'Processo: 5001234-56.2026.8.21.0001\nChave de Acesso: 554433221100\nÓrgão Julgador: 1ª Vara Cível de Porto Alegre' }
      };
      return fn();
    }
  };

  const details3 = await extractProcessDetails(mockPage3);
  assert.equal(details3.accessKey, '554433221100');
  assert.equal(details3.chaveAcesso, '554433221100');

  // Cenário 4: Chave capturada via diálogo (window.alert ao clicar no ícone)
  let dialogCallback;
  const mockPage4 = {
    on: (evt, cb) => { if (evt === 'dialog') dialogCallback = cb; },
    off: () => {},
    locator: () => ({
      first: () => ({
        isVisible: async () => false,
        count: async () => 1,
        click: async () => {
          if (dialogCallback) {
            dialogCallback({
              message: () => 'Chave do processo: 778899001122',
              dismiss: async () => {}
            });
          }
        }
      })
    }),
    evaluate: async (fn) => {
      globalThis.document = {
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { innerText: 'Processo 5001234-56.2026.8.21.0001' }
      };
      return fn();
    }
  };

  const details4 = await extractProcessDetails(mockPage4);
  assert.equal(details4.accessKey, '778899001122');
  assert.equal(details4.chaveAcesso, '778899001122');
});

test('eproc - Vinculação automática da chave de acesso no processo e no cofre do sistema', async () => {
  const cnj = '5001234-56.2026.8.21.0001';
  const accessKey = '987654321012';

  // Simula estado do sistema com processo enriquecido
  const state = {
    processes: [
      {
        id: 'proc-5001234',
        number: cnj,
        client: 'Empresa Teste SA',
        accessKey: accessKey,
        chaveAcesso: accessKey,
        tags: ['eproc', 'tjrs', 'chave-disponivel']
      }
    ]
  };

  const vault = new Map();
  const credentialManager = {
    getProcessAccessKey: async (pNum, uId) => vault.get(`${uId}:${String(pNum).replace(/\D/g, '')}`) || null,
    saveProcessAccessKey: async (pNum, { accessKey: key, userId: uId }) => {
      vault.set(`${uId}:${String(pNum).replace(/\D/g, '')}`, key);
      return { ok: true };
    }
  };

  const handler = createTjrsSidecarHttpHandler({
    client: { health: async () => ({ ok: true }) },
    assertAuthenticated: () => ({ userId: 'user-adv-1' }),
    readJson: async () => ({}),
    readStateEnvelope: async () => ({ state }),
    saveState: async () => {},
    credentialManager,
    json: (res, code, data) => {
      res.statusCode = code;
      res.data = data;
    }
  });

  // O cofre ainda não tem a chave para o user-adv-1
  assert.equal(await credentialManager.getProcessAccessKey(cnj, 'user-adv-1'), null);

  // Consulta de status da chave via endpoint
  const mockRes = {};
  const handled = await handler(
    { method: 'GET' },
    mockRes,
    new URL(`http://localhost/api/integrations/tjrs-sidecar/processes/access-key/status?processNumber=${encodeURIComponent(cnj)}`)
  );

  assert.equal(handled, true);
  assert.equal(mockRes.statusCode, 200);
  assert.equal(mockRes.data.ok, true);
  assert.equal(mockRes.data.configured, true, 'Deve auto-vincular a chave do processo ao cofre do usuário');

  // Confirma que agora a chave está salva no cofre seguro
  assert.equal(await credentialManager.getProcessAccessKey(cnj, 'user-adv-1'), accessKey);
});
