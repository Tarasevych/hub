// E2E-hulp: echte server (server/start.ts → backend/index) achter HTTPS op 127.0.0.1, met nagebootste Google (nep-google).
// Chrome mapt *.tarasevych.com naar deze poort (--host-resolver-rules) en vertrouwt de test-CA (NSS), zodat WebAuthn
// (rpId tarasevych.com) echt werkt. Alleen lokaal; er gaat niets naar buiten.
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nepGoogle } from '../eenheid/hulp/nep-google';

export async function startE2eServer(o: { ownerEmail: string; poort: number; tls: string }) {
  process.env.DIST_DIR = resolve(process.env.E2E_DIST || 'dist');
  const G = await nepGoogle({ ownerEmail: o.ownerEmail });
  const { createServer } = await import('../../server/start');
  const http = createServer();
  const s = https.createServer({ key: readFileSync(`${o.tls}/srv.key`), cert: readFileSync(`${o.tls}/srv.crt`) }, (req, res) => { http.emit('request', req, res); });
  await new Promise<void>((r) => s.listen(o.poort, '127.0.0.1', () => r()));
  return { G, stop: () => new Promise<void>((r) => { s.closeAllConnections?.(); s.close(() => r()); }) };
}
