// UI-014 fase 2A — melding «Новий вхід / новий пристрій» na een GESLAAGDE aanmelding.
//
// Wordt aangeroepen NA het aanmaken van de sessie (backend/index.ts) en nooit afgewacht door de inlogflow: elke fout wordt
// gelogd en ingeslikt, zodat aanmelden nooit kan mislukken door deze module. Alleen actief met vlag `meldingen-uitleg-v3`.
//
// Dedupe: sleutel = HMAC-vrij sha256(account + grof apparaatlabel «Browser/Systeem»). Bekend apparaat → alleen laatst_gezien bij.
// Eerste apparaat ooit van een account (nog geen enkele rij) → stil als basis opgeslagen, geen melding (anders krijgt iedereen
// bij het aanzetten van de vlag een melding voor zijn eigen apparaat).
// «Це був я» → POST /api/meldingen/apparaat-bekend (markeert bevestigd). «Це не я» → id.tarasevych.com/sessions (bestaande
// sessiebeheer met step-up). Er wordt hier NOOIT iets ingetrokken.
import { createHash } from 'node:crypto';
import { apparaat as apparaatLabel } from '../server/platform/audit';
import { getPool } from '../server/platform/pg';
import { meld } from './melder';

const sys = () => getPool('systeem');
export type AanmeldMethode = 'google' | 'passkey' | 'code' | 'telegram';
export type Locatie = { city?: string; region?: string; country?: string } | undefined;
// Bestaande soorten hergebruikt (security_warning / security): geen wijziging aan het sfeer-register en migratie 0107 nodig.
// Het uitlegregister herkent de kaart aan de titel («Новий вхід / новий пристрій», «… з іншого пристрою»).
export const MELDING_SOORT_NIEUW_APPARAAT = 'security_warning';
const UUID = /^[0-9a-f-]{36}$/i;

export const apparaatSleutel = (userId: string, label: string) => createHash('sha256').update(`bekend-apparaat\u0000${userId}\u0000${label}`).digest('hex').slice(0, 32);

const METHODE: Record<AanmeldMethode, readonly [string, string]> = { google: ['Google', 'Google'], passkey: ['ключ доступу', 'toegangssleutel'], code: ['код доступу', 'toegangscode'], telegram: ['Telegram', 'Telegram'] };
const regioTekst = (l: Locatie) => [l?.city, l?.region, l?.country].map((v) => String(v || '').replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 40)).filter(Boolean).join(', ');
export const brusselsTijd = (t: number, lang: 'uk' | 'nl') => new Date(t).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Brussels' });

/** Tekst van de melding (pure functie, getest). Geen IP, geen volledige user-agent. */
export function nieuwApparaatTekst(o: { email: string; label: string; methode: AanmeldMethode; locatie?: Locatie; tijd: number }) {
  const regio = regioTekst(o.locatie);
  const [mUk, mNl] = METHODE[o.methode];
  const titel = 'Новий вхід на новому пристрої / Nieuwe aanmelding op een nieuw apparaat';
  const uk = `Обліковий запис ${o.email || 'ваш'} · пристрій «${o.label}» · ${regio ? `регіон за IP: ${regio}` : 'регіон невідомий'} · ${brusselsTijd(o.tijd, 'uk')} (Брюссель) · спосіб: ${mUk}. Якщо це були ви — натисніть «Це був я». Якщо ні — завершіть сеанс і змініть доступ.`;
  const nl = `Account ${o.email || 'uw account'} · apparaat «${o.label}» · ${regio ? `regio volgens IP: ${regio}` : 'regio onbekend'} · ${brusselsTijd(o.tijd, 'nl')} (Brussel) · methode: ${mNl}. Was u dit: «Dit was ik». Zo niet: beëindig de sessie en wijzig de toegang.`;
  return { titel, tekst: `${uk} / ${nl}` };
}

type Deps = { vlagAan: () => Promise<boolean>; nu?: () => number };
/** Na een geslaagde aanmelding. Faalt nooit naar buiten. Geeft terug wat er gebeurde (voor tests/logs). */
export async function naAanmelding(o: { userId: string; email: string; ua?: string; locatie?: Locatie; methode: AanmeldMethode }, deps: Deps): Promise<'uit' | 'basis' | 'bekend' | 'gemeld' | 'fout'> {
  try {
    if (!o.userId || !(await deps.vlagAan())) return 'uit';
    const label = apparaatLabel(o.ua) || 'onbekend/onbekend';
    const sleutel = apparaatSleutel(o.userId, label);
    const bij = await sys().query('UPDATE app.bekende_apparaten SET laatst_gezien = now() WHERE user_id = $1 AND sleutel = $2 RETURNING id', [o.userId, sleutel]);
    if (bij.rows.length) return 'bekend';
    const n = Number((await sys().query('SELECT count(*)::int AS n FROM app.bekende_apparaten WHERE user_id = $1', [o.userId])).rows[0]?.n || 0);
    const ins = await sys().query('INSERT INTO app.bekende_apparaten (user_id, sleutel, apparaat, bevestigd_op) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, sleutel) DO NOTHING RETURNING id',
      [o.userId, sleutel, label.slice(0, 40), n === 0 ? new Date() : null]);
    if (!ins.rows.length) return 'bekend'; // gelijktijdige aanmelding legde hem net vast
    if (n === 0) return 'basis';
    const { titel, tekst } = nieuwApparaatTekst({ email: o.email, label, methode: o.methode, locatie: o.locatie, tijd: (deps.nu || Date.now)() });
    await meld(o.userId, MELDING_SOORT_NIEUW_APPARAAT, titel, tekst, `https://id.tarasevych.com/sessions?apparaat=${ins.rows[0].id}`);
    return 'gemeld';
  } catch (err) {
    console.error('[nieuw-apparaat] melding na aanmelding mislukt (aanmelding gaat gewoon door):', (err as Error).message);
    return 'fout';
  }
}

/** «Це був я»: apparaat als bevestigd markeren (alleen eigen rij). */
export async function alsBekendMarkeren(userId: string, id: unknown): Promise<boolean> {
  if (!userId || !UUID.test(String(id || ''))) return false;
  const r = await sys().query('UPDATE app.bekende_apparaten SET bevestigd_op = coalesce(bevestigd_op, now()) WHERE id = $1 AND user_id = $2 RETURNING id', [String(id), userId]);
  return r.rows.length > 0;
}

/** Vlag `meldingen-uitleg-v3` voor een account (lui geïmporteerd: geen importcyclus met vlaggen/tech-profiel). Fout = uit. */
export async function v3Aan(userId: string): Promise<boolean> {
  try { const { berekenen } = await import('./vlaggen'); return (await berekenen({ id: userId } as never, ['meldingen-uitleg-v3']))[0]?.value === true; }
  catch { return false; }
}

/** Toegangscode opnieuw gebruikt vanaf een apparaat dat deze code nog niet gebruikte (vlag v3). Faalt stil. */
export async function codeAnderApparaat(o: { userId: string; codeId: string; codeNaam: string; label: string | null; sessieId: string }): Promise<boolean> {
  try {
    if (!(await v3Aan(o.userId))) return false;
    const eerder = await sys().query('SELECT count(*)::int AS n, count(*) FILTER (WHERE apparaat IS NOT DISTINCT FROM $3)::int AS zelfde FROM app.gast_sessies WHERE code_id = $1 AND user_id = $2 AND id <> $4',
      [o.codeId, o.userId, o.label, o.sessieId]);
    const r = eerder.rows[0] || {};
    if (!Number(r.n) || Number(r.zelfde) > 0) return false;
    const l = o.label || 'невідомий пристрій';
    await meld(o.userId, 'security', `Код доступу «${o.codeNaam}» використано з іншого пристрою / Toegangscode «${o.codeNaam}» gebruikt vanaf een ander apparaat`,
      `Код «${o.codeNaam}» щойно використано на пристрої «${l}», якого раніше з цим кодом не було · ${brusselsTijd(Date.now(), 'uk')} (Брюссель). Якщо код міг потрапити до чужих рук — завершіть гостьовий сеанс і відкличте код. / Code «${o.codeNaam}» is net gebruikt op apparaat «${o.label || 'onbekend apparaat'}», dat deze code nog niet gebruikte · ${brusselsTijd(Date.now(), 'nl')} (Brussel). Kan de code in verkeerde handen zijn: beëindig de gastsessie en trek de code in.`,
      `https://id.tarasevych.com/methods?code=${o.codeId}#toegangscodes`);
    return true;
  } catch (err) { console.error('[nieuw-apparaat] code-melding mislukt:', (err as Error).message); return false; }
}

/** Herstelcode gebruikt (vlag v3). Faalt stil; geen code of hash in de tekst. */
export async function herstelcodeGebruiktMelden(userId: string, actie: string, label: string | null): Promise<void> {
  try {
    if (!(await v3Aan(userId))) return;
    const l = label || 'невідомий пристрій';
    await meld(userId, 'access_recovery_code_used', 'Використано код відновлення / Herstelcode gebruikt',
      `Один код відновлення щойно використано (дія: ${actie.slice(0, 40)}) на пристрої «${l}» · ${brusselsTijd(Date.now(), 'uk')} (Брюссель). Цей код більше не діє. Якщо це були не ви — завершіть чужі сеанси й створіть нові коди. / Er is net een herstelcode gebruikt (actie: ${actie.slice(0, 40)}) op apparaat «${label || 'onbekend apparaat'}» · ${brusselsTijd(Date.now(), 'nl')} (Brussel). Die code werkt niet meer. Was u dit niet: beëindig vreemde sessies en maak nieuwe codes.`,
      'https://id.tarasevych.com/methods#herstel');
  } catch (err) { console.error('[nieuw-apparaat] herstelcode-melding mislukt:', (err as Error).message); }
}
