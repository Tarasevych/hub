// Diepe gezondheidscontrole (29.10.2026): GET /__gezondheid?diep=1, alleen vanaf de server zelf (127.0.0.1, zonder Cloudflare-kop).
// Aanleiding: «Технічні модулі не завантажено». /__gezondheid deed alleen `SELECT 1`, de controle na installatie en de nazorg openden
// alleen openbare pagina's — niemand probeerde of de technische ruimte haar bestanden kreeg. Deze controle doet precies dat pad na:
//   1. een PROEFSESSIE van de technische ruimte v2 (app.tech_ruimte_sessies, eigen proef-gebruiker, 2 minuten);
//   2. de toegangscookie voor /assets/tech/* maken zoals /api/owner/tech/status dat doet (assetCookieVoor);
//   3. controleren dat die cookie /assets/tech/* opent (assetToegestaan) en dat ZONDER cookie niets opengaat;
//   4. als de build een technisch bestand heeft: het bestand bestaat echt in dist/assets/tech/;
//   5. ALTIJD opruimen: de proefsessie verwijderen (de sleutel gaat mee via ON DELETE CASCADE) — ook bij een fout.
// Er komt niets in de echte sessies van mensen; de proef-gebruiker bestaat niet als account.
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { getPool } from '../server/platform/pg';
import { assetCookieVoor, assetToegestaan, vergeetSleutel } from './tech-bundels';

export type DiepeStap = { id: string; ok: boolean; detail: string };
export type DiepeUitslag = { ok: boolean; db: boolean; diep: true; stappen: DiepeStap[]; duurMs: number };
export const PROEF_GEBRUIKER = 'gezondheid-proef';

let bezig: Promise<DiepeUitslag> | null = null;
let laatste: { tijd: number; uit: DiepeUitslag } | null = null;

/** Eén controle tegelijk; binnen 5 s hetzelfde antwoord (de controle na installatie roept hem enkele keren snel na elkaar aan). */
export function diepeControle(distDir: string): Promise<DiepeUitslag> {
  if (laatste && Date.now() - laatste.tijd < 5000) return Promise.resolve(laatste.uit);
  if (!bezig) bezig = uitvoeren(distDir).then((u) => { laatste = { tijd: Date.now(), uit: u }; return u; }).finally(() => { bezig = null; });
  return bezig;
}

async function uitvoeren(distDir: string): Promise<DiepeUitslag> {
  const t0 = Date.now();
  const stappen: DiepeStap[] = [];
  const stap = (id: string, ok: boolean, detail = '') => { stappen.push({ id, ok, detail: detail.slice(0, 200) }); return ok; };
  const sys = getPool('systeem');
  let db = false;
  try { await sys.query('SELECT 1'); db = stap('database', true); } catch (e) { stap('database', false, (e as Error).message); }
  let sessie = '';
  let sleutel = '';
  if (db) {
    try {
      const r = await sys.query(`INSERT INTO app.tech_ruimte_sessies (user_id, profiel_id, sessie_id, rollen, modus, reden, grens_op)
        VALUES ($1, 'proef', $2, ARRAY['proef'], 'tot-technisch-einde', 'diepe gezondheidscontrole', now() + interval '2 minutes') RETURNING id`, [PROEF_GEBRUIKER, `proef-${randomUUID()}`]);
      sessie = String(r.rows[0].id);
      stap('proefsessie', true);
      const kop = await assetCookieVoor('', { id: sessie, eind: Date.now() + 120_000 }, PROEF_GEBRUIKER);
      const cookie = kop ? kop.split(';')[0] : '';
      sleutel = cookie.slice(cookie.indexOf('=') + 1);
      if (stap('toegangscookie', !!cookie, cookie ? '' : 'geen cookie (de sleutel voor /assets/tech/* is niet opgeslagen)')) {
        stap('tech-bestanden-open', await assetToegestaan(cookie, Date.now(), true), 'met cookie');
        stap('tech-bestanden-dicht-zonder-cookie', !(await assetToegestaan('', Date.now(), true)), 'zonder cookie');
      }
    } catch (e) {
      stap('proefsessie-of-cookie', false, (e as Error).message);
    } finally {
      if (sessie) {
        try { await sys.query(`DELETE FROM app.tech_ruimte_sessies WHERE id = $1 AND user_id = $2`, [sessie, PROEF_GEBRUIKER]); stap('opgeruimd', true); }
        catch (e) { stap('opgeruimd', false, (e as Error).message); }
      }
      if (sleutel) vergeetSleutel(sleutel);
    }
  }
  try {
    const namen = await readdir(path.join(distDir, 'assets', 'tech'));
    stap('tech-bestanden-in-build', namen.some((n) => n.endsWith('.js')), `${namen.length} bestanden`);
  } catch { stap('tech-bestanden-in-build', true, 'geen dist/assets/tech (ontwikkelstand)'); }
  return { ok: db && stappen.every((s) => s.ok), db, diep: true, stappen, duurMs: Date.now() - t0 };
}

/** Komt dit verzoek van de server zelf (en niet via Cloudflare)? Alleen dan mag de diepe controle draaien. */
export function vanDezeServer(remoteAddress: string | undefined, kop: Record<string, unknown>): boolean {
  const ip = String(remoteAddress || '').replace(/^::ffff:/, '');
  if (kop['cf-connecting-ip'] || kop['x-forwarded-for']) return false;
  return ip === '127.0.0.1' || ip === '::1';
}

/** Antwoord voor GET /__gezondheid?diep=1 (server/start.ts): status en inhoud. */
export async function diepAntwoord(verzoek: { socket: { remoteAddress?: string }; headers: Record<string, unknown> }, distDir: string): Promise<{ status: number; inhoud: unknown }> {
  if (!vanDezeServer(verzoek.socket.remoteAddress, verzoek.headers)) return { status: 403, inhoud: { ok: false, fout: 'ALLEEN_LOKAAL' } };
  let d: DiepeUitslag;
  try { d = await diepeControle(distDir); }
  catch (e) { d = { ok: false, db: false, diep: true, stappen: [{ id: 'fout', ok: false, detail: String((e as Error).message).slice(0, 200) }], duurMs: 0 }; }
  if (!d.ok) console.error('[gezondheid] diepe controle mislukt:', JSON.stringify(d.stappen.filter((x) => !x.ok)));
  return { status: d.ok ? 200 : 503, inhoud: d };
}
