// UI-014 fase 2A — melding «Новий вхід / новий пристрій» na een GESLAAGDE aanmelding.
//
// Wordt aangeroepen NA het aanmaken van de sessie (backend/index.ts) en nooit afgewacht door de inlogflow: elke fout wordt
// gelogd en ingeslikt, zodat aanmelden nooit kan mislukken door deze module. Alleen actief met vlag `meldingen-uitleg-v3`.
//
// Dedupe: sleutel = sha256(account + hash van de eigen apparaatcookie van de browser) — SEC-002, zie backend/apparaat-cookie.ts;
// vroeger sha256(account + grof apparaatlabel «Browser/Systeem»), na te bootsen met elke User-Agent. Bekend apparaat → alleen laatst_gezien bij.
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

/** OUD (alleen nog voor aanroepers zonder apparaatcookie): sleutel op het grove label — door elke User-Agent na te bootsen. */
export const apparaatSleutel = (userId: string, label: string) => createHash('sha256').update(`bekend-apparaat\u0000${userId}\u0000${label}`).digest('hex').slice(0, 32);
/** SEC-002 (integraties-04 / aanmelden-05): sleutel op de hash van de eigen apparaatcookie van de browser (backend/apparaat-cookie.ts).
 *  Andere invoer dan in apparaatSleutel (voorvoegsel v2), zodat een oude labelrij nooit een cookie-browser «bekend» maakt. */
export const apparaatCookieSleutel = (userId: string, cookieHash: string) => createHash('sha256').update(`bekend-apparaat-v2\u0000${userId}\u0000${cookieHash}`).digest('hex').slice(0, 32);

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
/**
 * `apparaatCookie` (SEC-002): de hash van de apparaatcookie van de browser die zich net aanmeldde (backend/index.ts geeft hem
 * altijd mee — een browser zonder cookie krijgt er in hetzelfde antwoord één, en is dus nieuw). Dan telt alleen DIE browser als
 * bekend; het label is enkel tekst. Zonder dit veld (oude aanroepers) blijft het oude gedrag op het label.
 */
/**
 * SEC-002 (slot s, eind-regressie midden-2): neutrale melding voor een browser die het systeem VÓÓR de beveiligingsupdate al kende
 * (oude rij op het label «Browser/Systeem»), maar die nog geen apparaatcookie had. Geen alarm («новий пристрій»), wel een spoor.
 * De bescherming blijft: zo'n browser is voor Telegram nog altijd nieuw (één keer bevestigen), en de oude labelrij wordt hierbij
 * VERBRUIKT — een tweede browser met hetzelfde label krijgt dus wél de gewone waarschuwing.
 * Нейтральне сповіщення: перший вхід на цьому пристрої після оновлення безпеки; стара позначка використовується один раз.
 */
export const OVERGANG_SOORT = 'security';
export function overgangTekst(o: { label: string; tijd: number }) {
  const titel = 'Перший вхід на цьому пристрої після оновлення безпеки / Eerste aanmelding op dit apparaat na de beveiligingsupdate';
  const uk = `Пристрій «${o.label}» ви вже використовували раніше. Після оновлення безпеки система впізнає браузери за власною позначкою, тому цей вхід — перший за новим правилом · ${brusselsTijd(o.tijd, 'uk')} (Брюссель). Нічого робити не треба; якщо сайт попросить — один раз підтвердіть ключем доступу. Якщо ви не входили — завершіть сеанс на сторінці безпеки.`;
  const nl = `Apparaat «${o.label}» gebruikte u al eerder. Na de beveiligingsupdate herkent het systeem browsers aan een eigen markering, dus deze aanmelding is de eerste volgens de nieuwe regel · ${brusselsTijd(o.tijd, 'nl')} (Brussel). U hoeft niets te doen; vraagt de site erom, bevestig dan één keer met uw toegangssleutel. Meldde u zich niet aan, beëindig dan de sessie op de beveiligingspagina.`;
  return { titel, tekst: `${uk} / ${nl}` };
}
export async function naAanmelding(o: { userId: string; email: string; ua?: string; locatie?: Locatie; methode: AanmeldMethode; apparaatCookie?: string }, deps: Deps): Promise<'uit' | 'basis' | 'bekend' | 'gemeld' | 'overgang' | 'fout'> {
  try {
    if (!o.userId) return 'uit';
    const vlag = await deps.vlagAan();
    // Oude aanroepers (zonder apparaatcookie): zonder vlag niets, zoals vroeger.
    if (!vlag && o.apparaatCookie === undefined) return 'uit';
    const label = apparaatLabel(o.ua) || 'onbekend/onbekend';
    if (o.apparaatCookie !== undefined && !/^[a-f0-9]{64}$/.test(o.apparaatCookie)) throw new Error('APPARAAT_COOKIE_ONGELDIG');
    const sleutel = o.apparaatCookie !== undefined ? apparaatCookieSleutel(o.userId, o.apparaatCookie) : apparaatSleutel(o.userId, label);
    // SEC-002 (g10h-toets-3): de vlag regelt alleen de MELDING. Welke browser bekend is, wordt ook zonder vlag onthouden — anders
    // was voor Telegram elke browser «nieuw» (ook de eigen) en kreeg de mens bij elke aanmelding een onware waarschuwing.
    if (!vlag) {
      await sys().query('INSERT INTO app.bekende_apparaten (user_id, sleutel, apparaat) VALUES ($1, $2, $3) ON CONFLICT (user_id, sleutel) DO UPDATE SET laatst_gezien = now()',
        [o.userId, sleutel, label.slice(0, 40)]);
      return 'uit';
    }
    const bij = await sys().query('UPDATE app.bekende_apparaten SET laatst_gezien = now() WHERE user_id = $1 AND sleutel = $2 RETURNING id', [o.userId, sleutel]);
    if (bij.rows.length) return 'bekend';
    const n = Number((await sys().query('SELECT count(*)::int AS n FROM app.bekende_apparaten WHERE user_id = $1', [o.userId])).rows[0]?.n || 0);
    const ins = await sys().query('INSERT INTO app.bekende_apparaten (user_id, sleutel, apparaat, bevestigd_op) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, sleutel) DO NOTHING RETURNING id',
      [o.userId, sleutel, label.slice(0, 40), n === 0 ? new Date() : null]);
    if (!ins.rows.length) return 'bekend'; // gelijktijdige aanmelding legde hem net vast
    if (n === 0) return 'basis';
    // SEC-002 (slot s, midden-2): bestond er een OUDE rij op het label van deze browser? Dan kende het systeem hem vóór de update:
    // die rij verbruiken (DELETE … RETURNING: hoogstens één keer) en een neutrale melding in plaats van de waarschuwing.
    if (o.apparaatCookie !== undefined) {
      const oud = await sys().query('DELETE FROM app.bekende_apparaten WHERE user_id = $1 AND sleutel = $2 RETURNING id', [o.userId, apparaatSleutel(o.userId, label)]);
      if (oud.rows.length) {
        const { titel, tekst } = overgangTekst({ label, tijd: (deps.nu || Date.now)() });
        await meld(o.userId, OVERGANG_SOORT, titel, tekst, `https://id.tarasevych.com/sessions?apparaat=${ins.rows[0].id}`);
        return 'overgang';
      }
    }
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
      'https://id.tarasevych.com/recovery#aanmeldmethoden-herstel'); /* IDENTITEIT-014: #herstel bestond niet */
  } catch (err) { console.error('[nieuw-apparaat] herstelcode-melding mislukt:', (err as Error).message); }
}
