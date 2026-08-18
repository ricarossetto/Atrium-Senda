import { randomBytes } from 'node:crypto';

console.log('===============================================================');
console.log('  JURISFLOW — GERADOR DE CHAVES CRIPTOGRÁFICAS DE PRODUÇÃO');
console.log('===============================================================');
console.log('\nCopie e cole as variáveis abaixo no seu arquivo .env ou no painel da nuvem:\n');
console.log(`AUTH_SESSION_SECRET=${randomBytes(48).toString('base64url')}`);
console.log(`AUTH_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`);
console.log(`COLLECTOR_INGEST_TOKEN=${randomBytes(32).toString('base64url')}`);
console.log('\n===============================================================\n');
