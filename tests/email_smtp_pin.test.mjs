import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EmailService } from '../lib/email/email-service.mjs';
import { SecurityManager } from '../lib/security.mjs';

// Regressão do achado Wave1-4: a validação do host SMTP resolvia o DNS e o
// Nodemailer resolvia de novo ao conectar, deixando aberta a janela de rebind
// entre a checagem e o socket. Agora a resolução acontece uma única vez, via
// lookup injetável (mesmo padrão do DavIntegrationService), e o IP validado é
// fixado na conexão. Nenhum SMTP real é contatado: o servidor local fala o
// mínimo de SMTP e os endereços públicos são sintéticos.

const ORIGINAL_MOCK_SMTP = process.env.ATRIUM_MOCK_SMTP;
delete process.env.ATRIUM_MOCK_SMTP;

after(() => {
  if (ORIGINAL_MOCK_SMTP === undefined) delete process.env.ATRIUM_MOCK_SMTP;
  else process.env.ATRIUM_MOCK_SMTP = ORIGINAL_MOCK_SMTP;
});

function lookupReturning(addresses) {
  return async () => addresses.map(address => ({ address, family: net.isIP(address) }));
}

async function withService(lookupFn, run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'atrium-smtp-pin-'));
  try {
    const security = new SecurityManager({
      dataDirectory: dir,
      sessionSecret: 'a'.repeat(64),
      encryptionKey: Buffer.alloc(32, 0x0c).toString('base64')
    });
    await security.init();
    const service = new EmailService({ dataDirectory: dir, securityManager: security, lookupFn });
    return await run(service, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('rejeita host que resolve para loopback ou rede privada (IPv4 e IPv6)', async () => {
  const cases = [
    ['127.0.0.1'],
    ['::1'],
    ['10.10.10.10'],
    ['172.20.0.5'],
    ['192.168.1.20'],
    ['169.254.169.254'],
    ['100.64.0.1'],
    ['0.0.0.0'],
    ['::ffff:127.0.0.1'],
    ['fd00::1'],
    ['fe80::1'],
    ['2606:2800:220:1:248:1893:25c8:1946', '10.0.0.7']
  ];
  for (const addresses of cases) {
    await withService(lookupReturning(addresses), async service => {
      await assert.rejects(
        () => service._validateSmtpHost('smtp.rebind.example.test'),
        err => err.statusCode === 400,
        `deveria bloquear ${addresses.join(', ')}`
      );
    });
  }
});

test('rejeita hostname que não resolve', async () => {
  await withService(async () => {
    const err = new Error('getaddrinfo EAI_AGAIN');
    err.code = 'EAI_AGAIN';
    throw err;
  }, async service => {
    await assert.rejects(
      () => service._validateSmtpHost('smtp.inexistente.example.test'),
      err => err.statusCode === 400
    );
  });
});

test('aceita host público sintético, fixa o IP e preserva o nome para TLS', async () => {
  const publicLookup = async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '93.184.216.35', family: 4 }
  ];
  await withService(publicLookup, async service => {
    const endpoint = await service._validateSmtpHost('smtp.publico.example.test');
    assert.equal(endpoint.address, '93.184.216.34');
    assert.equal(endpoint.family, 4);
    assert.equal(endpoint.hostname, 'smtp.publico.example.test');

    const transporter = service.createTransporter({
      host: 'smtp.publico.example.test',
      port: 587,
      secure: false,
      user: 'usuario@example.test',
      password: 'senha-sintetica'
    }, endpoint);

    assert.equal(transporter.options.host, '93.184.216.34', 'a conexão deve usar o IP já validado');
    assert.equal(transporter.options.servername, 'smtp.publico.example.test', 'SNI e verificação do certificado devem manter o nome original');
    assert.equal(transporter.options.auth.user, 'usuario@example.test');
  });
});

test('aceita host IPv6 público sintético e fixa a família correta', async () => {
  await withService(lookupReturning(['2606:2800:220:1:248:1893:25c8:1946']), async service => {
    const endpoint = await service._validateSmtpHost('smtp.v6.example.test');
    assert.equal(endpoint.family, 6);
    assert.equal(endpoint.address, '2606:2800:220:1:248:1893:25c8:1946');
  });
});

test('configure recusa host re-resolvido para IP interno sem gravar configuração', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'atrium-smtp-pin-config-'));
  try {
    const security = new SecurityManager({
      dataDirectory: dir,
      sessionSecret: 'b'.repeat(64),
      encryptionKey: Buffer.alloc(32, 0x0d).toString('base64')
    });
    await security.init();
    const service = new EmailService({
      dataDirectory: dir,
      securityManager: security,
      lookupFn: lookupReturning(['10.0.0.9'])
    });
    await assert.rejects(
      () => service.configure({
        host: 'smtp.rebind.example.test',
        port: 587,
        secure: false,
        user: 'usuario@example.test',
        password: 'senha-sintetica',
        fromAddress: 'contato@example.test'
      }),
      err => err.statusCode === 400
    );
    const status = await service.getStatus();
    assert.equal(status.configured, false, 'configuração não pode ser salva quando o host re-resolve para IP interno');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a conexão SMTP usa o IP fixado e não resolve o nome outra vez', async () => {
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    socket.write('220 smtp.local.test ESMTP\r\n');
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          socket.write('250-smtp.local.test\r\n250 SIZE 10485760\r\n');
        } else if (upper.startsWith('QUIT')) {
          socket.write('221 2.0.0 bye\r\n');
          socket.end();
        } else {
          socket.write('250 2.0.0 ok\r\n');
        }
      }
    });
    socket.on('error', () => {});
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  try {
    await withService(async () => [{ address: '127.0.0.1', family: 4 }], async service => {
      // Endpoint no mesmo formato que _validateSmtpHost devolve: aqui ele é
      // sintético porque o socket de teste é local. O nome smtp.pin.invalid é
      // reservado (RFC 6761) e nunca existe no DNS, então uma segunda
      // resolução do Nodemailer falharia com ENOTFOUND em vez de conectar.
      const endpoint = { address: '127.0.0.1', family: 4, hostname: 'smtp.pin.invalid' };
      const transporter = service.createTransporter({
        host: 'smtp.pin.invalid',
        port,
        secure: false,
        user: '',
        password: ''
      }, endpoint);
      assert.equal(transporter.options.host, '127.0.0.1', 'o transporte deve receber o IP já validado');
      const verified = await transporter.verify();
      assert.equal(verified, true, 'verify() deveria falar SMTP com o IP fixado');
    });
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});
