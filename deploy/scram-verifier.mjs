// scram-verifier.mjs — leest één wachtwoord van stdin en schrijft de SCRAM-SHA-256-verifier zoals Postgres die
// opslaat (RFC 5802/7677: SCRAM-SHA-256$<iteraties>:<salt>$<StoredKey>:<ServerKey>) naar stdout.
// Gebruikt door deploy/db-rollen-instellen.sh (audit-fix 10): Postgres krijgt zo nooit het leesbare wachtwoord
// (niet in ALTER ROLE, niet in logs of pg_stat_statements). Het wachtwoord komt nooit in argumenten.
// Alleen ASCII-wachtwoorden (het script maakt hex): dan is SASLprep een no-op, net als in Postgres.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

const delen = [];
for await (const deel of process.stdin) delen.push(deel);
const wachtwoord = Buffer.concat(delen).toString('utf8').replace(/\r?\n$/, '');
if (!wachtwoord || !/^[\x21-\x7e]+$/.test(wachtwoord)) { console.error('scram-verifier: leeg of niet-ASCII wachtwoord'); process.exit(2); }
const iteraties = Number(process.env.SCRAM_ITERATIES || 4096);
const salt = randomBytes(16);
const gezouten = pbkdf2Sync(Buffer.from(wachtwoord, 'utf8'), salt, iteraties, 32, 'sha256');
const clientKey = createHmac('sha256', gezouten).update('Client Key').digest();
const storedKey = createHash('sha256').update(clientKey).digest();
const serverKey = createHmac('sha256', gezouten).update('Server Key').digest();
process.stdout.write(`SCRAM-SHA-256$${iteraties}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`);
