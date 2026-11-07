// E2E-hulp: echte server (server/start.ts → backend/index) achter HTTPS op 127.0.0.1, met nagebootste Google (nep-google).
// Chrome mapt *.tarasevych.com naar deze poort (--host-resolver-rules) en vertrouwt de test-CA (NSS), zodat WebAuthn
// (rpId tarasevych.com) echt werkt. Alleen lokaal; er gaat niets naar buiten.
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nepGoogle } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';

export async function startE2eServer(o: { ownerEmail: string; poort: number; tls: string; agentGateway?: boolean }) {
  process.env.DIST_DIR = resolve(process.env.E2E_DIST || 'dist');
  // Alle browsertests delen 127.0.0.1: strikte per-IP-limieten (o.a. stap-op) ×20, alleen hier (server/start.ts strikteFactor).
  process.env.E2E_LOKALE_LIMIETEN = '1';
  // Testhygiëne (14.10): elke e2e zet een eigen OWNER_EMAIL; daardoor verloor de eigenaar van de unittests zijn rol (eigenaarRolBijwerken)
  // en maakten volgende unittests een TWEEDE gebruiker met hetzelfde adres (dan «GEBRUIKER_NIET_GEVONDEN» in tech-profiel). Bij stop:
  // de eigenaren van vóór de test terug, de e2e-eigenaar weer gewoon lid.
  const sys = getPool('systeem');
  const eigenaren = async () => (await sys.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner'").catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((r) => String(r.id));
  const voor = await eigenaren();
  const herstel = async () => {
    try {
      for (const id of await eigenaren()) if (!voor.includes(id)) await sys.query(`UPDATE app.records SET data = jsonb_set(data, '{role}', '"member"') WHERE tbl='users' AND id=$1`, [id]);
      for (const id of voor) await sys.query(`UPDATE app.records SET data = jsonb_set(data, '{role}', '"owner"') WHERE tbl='users' AND id=$1 AND data->>'role' <> 'owner'`, [id]);
    } catch (e) { console.warn('[e2e] eigenaar herstellen mislukt:', (e as Error).message); }
  };
  const G = await nepGoogle({ ownerEmail: o.ownerEmail });
  const { createServer } = await import('../../server/start');
  const http = createServer();
  const s = https.createServer({ key: readFileSync(`${o.tls}/srv.key`), cert: readFileSync(`${o.tls}/srv.crt`) }, (req, res) => { http.emit('request', req, res); });
  // Optioneel: het WSS-kanaal voor echte agents (agent.mjs als apart proces), zoals server/start.ts het aan de HTTP-server hangt.
  if (o.agentGateway) {
    const { attachAgentGateway } = await import('../../backend/connectors-gateway');
    const { SERVICE_HOSTS } = await import('../../backend/deployment-identiteit');
    attachAgentGateway(s as never, new Set<string>(Object.values(SERVICE_HOSTS)));
  }
  await new Promise<void>((r) => s.listen(o.poort, '127.0.0.1', () => r()));
  return { G, stop: async () => { await new Promise<void>((r) => { s.closeAllConnections?.(); s.close(() => r()); }); await herstel(); } };
}

// Chrome-argumenten voor alle e2e-tests: *.tarasevych.com (alle poorten) → de lokale testserver; elke andere hostnaam
// bestaat niet (~NOTFOUND). Zo kan geen enkele test per ongeluk productie of een andere externe dienst raken.
export function chromeArgs(poort: number): string[] {
  return [`--host-resolver-rules=MAP *.tarasevych.com 127.0.0.1:${poort}, MAP tarasevych.com 127.0.0.1:${poort}, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`, '--no-proxy-server'];
}
