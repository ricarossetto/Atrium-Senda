import assert from 'node:assert/strict';
import { resolveDensityFromPlan } from '../js/views/ui-v2/plan-density.js';

// Contrato da densidade de interface: preferência local vence; o plano só orienta
// na ausência dela; hospedagem com subdomínio "basic." força o modo enxuto.
const hosts = ['atrium.adv.br', 'localhost', '127.0.0.1', 'basic.atrium.adv.br', 'office.basic.atrium.adv.br', 'preview.example.test', 'atrium.adv.br.example.test', 'notbasic.atrium.adv.br'];
for (const host of hosts) {
  for (const plan of ['basic', 'pro', 'pro_ia', '', null, 'unknown']) {
    for (const preference of [null, '', 'invalid', 'basic', 'pro', ' PRO ']) {
      const expected = preference === 'basic' ? 'basic'
        : ['pro', ' PRO '].includes(preference) ? 'pro'
          : ['basic.atrium.adv.br', 'office.basic.atrium.adv.br'].includes(host) ? 'basic'
            : ['atrium.adv.br', 'localhost', '127.0.0.1'].includes(host) && plan === 'basic' ? 'basic' : 'pro';
      assert.equal(resolveDensityFromPlan(plan, preference, host), expected, `${host}/${plan}/${preference}`);
    }
  }
}
assert.equal(resolveDensityFromPlan('basic', null, 'ATRIUM.ADV.BR'), 'basic');
assert.equal(resolveDensityFromPlan(' BASIC ', null, 'localhost'), 'basic');
assert.equal(resolveDensityFromPlan('basic', null, undefined), 'pro');
assert.equal(resolveDensityFromPlan('basic', null, 'atrium.adv.br:443'), 'pro');
console.log('PASS: matriz literal hostname × plano × preferência (288 casos e limites).');
