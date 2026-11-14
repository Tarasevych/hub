// IDENTITEIT-015 (крок «aanmelden», етап 3.5–3.7 плану): вхід БЕЗ Google — ключем доступу, паролем і через прив'язаний
// Microsoft/Discord/Apple. Aanmelden zonder Google: toegangssleutel, wachtwoord en gekoppelde Microsoft/Discord/Apple.
//
// Один механізм сеансу. Кожен шлях спершу створює ТУ САМУ транзакцію входу, що й Google/Telegram (owner_auth_transactions_v1,
// бінд-кукі цього браузера й вкладки — backend/aanmeld-binding.ts), а після перевірки особи завершує її тим самим
// ownerCompletePrimaryRedirect (backend/index.ts передає start/voltooien як залежності). Свого сеансового коду тут немає.
//
// Правила, однакові для всіх шляхів:
//   • прапорець на кожен шлях (aanmelden-passkey / -wachtwoord / -extern, типово «Тільки я»). Кнопка на сторінці входу є, коли
//     прапорець комусь увімкнено (vlagPubliek); сеанс видається лише людині, якій він увімкнений (vlagAan) — інакше чесна відмова
//     METHODE_NIET_VOOR_U без сеансу, з аудитом;
//   • одноразовість: виклик (challenge) / state живе 5–10 хв у app.aanmeld_uitdagingen (міграція 0275) і забирається атомарно;
//     повторне «Завершити» з тим самим викликом — UITDAGING_ONGELDIG, другого сеансу немає;
//   • ліміти: на IP (rateLimit); блокування спроб на пару «адреса + IP» (pogingReserveren у verifyPasswordLogin) і, для пароля,
//     ЗАГАЛЬНА межа на адресу незалежно від IP (WACHTWOORD_PER_ADRES за годину) — пул адрес більше не дає необмежених вгадувань;
//   • аудит (aanmelden.<шлях>) і сповіщення людині (access_method_login) про кожен успішний вхід без Google;
//   • другий чинник: ключ доступу з перевіркою користувача (UV) сам є двома чинниками; пароль із TOTP чи кодом відновлення —
//     також. Тоді ворота «другий чинник обов'язковий» (backend/tweede-factor-poort.ts) для цього входу одразу відчинені.
//   • захист від блокування: робочі шляхи людини реєструються в backend/aanmeld-wegen.ts (registreerExtraWegen), і сторінка
//     розміщення (werkendeMethoden) рахує лише ті способи, що справді видають сеанс.
import { createHash, randomBytes } from 'node:crypto';
import * as kern from '../deploy/goedkeuring/webauthn-kern.mjs';
import { json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { rateLimit } from '../server/platform/beveiliging';
import { getPool } from '../server/platform/pg';
import type { RouterContext, RouterMiddleware, RouterResponse } from '../server/platform/router';
import { limietSleutel } from '../shared/ip-limiet';
import type { MethodeId as AanmeldMethodeId } from '../shared/aanmeld-plaatsing/plaatsing';
import { SERVICE_HOSTS } from './deployment-identiteit';
import { aanmeldTerugBasis, externAutoriseerUrl, externIdentiteit, externKlaar, koppelingEigenaar } from './aanmeld-koppel';
import { registreerExtraWegen } from './aanmeld-wegen';
import { meld } from './melder';
import { gebruikVastleggen } from './toegang-context';
import { verifyPasswordLogin } from './toegangslaag';
import { gebruikerHandle, passkeyAantal, passkeyRp } from './toegangssleutels';
import { tweedeFactorVastleggen } from './tweede-factor-poort';
import { registreerExtraWerkend } from './telegram-aanmelden/plaatsing';

export type Weg = 'passkey' | 'password' | 'microsoft' | 'discord' | 'apple';
type Extern = 'microsoft' | 'discord' | 'apple';
const EXTERN: readonly Extern[] = ['microsoft', 'discord', 'apple'];
export const WEG_VLAG: Readonly<Record<Weg, string>> = Object.freeze({ passkey: 'aanmelden-passkey', password: 'aanmelden-wachtwoord', microsoft: 'aanmelden-extern', discord: 'aanmelden-extern', apple: 'aanmelden-extern' });
const WEG_NAAM: Readonly<Record<Weg, readonly [string, string]>> = Object.freeze({ passkey: ['ключ доступу', 'toegangssleutel'], password: ['пароль', 'wachtwoord'], microsoft: ['Microsoft', 'Microsoft'], discord: ['Discord', 'Discord'], apple: ['Apple', 'Apple'] });
/** Скільки живе виклик/state. Hoelang een uitdaging of state geldt. */
export const UITDAGING_MS = 5 * 60 * 1000;
/** IDENTITEIT-015 (herstel): спроб входу паролем на одну адресу за годину з усіх IP разом. / Pogingen per e-mailadres per uur. */
export const WACHTWOORD_PER_ADRES = 20;
export const EXTERN_STATE_MS = 10 * 60 * 1000;

export type AanmeldWegDeps = {
  start: (rc: RouterContext, o: { tab: string; locale: 'uk' | 'nl'; remember: boolean; intent?: 'login' | 'replace-tab'; returnTo?: string; sourceOrigin?: string }, methode: Weg) => Promise<{ transactieId: string; setCookie: string } | { fout: string }>;
  afbreken?: (transactieId: string) => Promise<unknown>;
  bindingKlopt: (rc: RouterContext, transactieId: string, methode: Weg) => Promise<boolean>;
  voltooien: (rc: RouterContext, o: { transactieId: string; userId: string; methode: Weg }) => Promise<{ antwoord: RouterResponse; sessieId: string }>;
  terugAdres?: (transactieId: string) => Promise<string>;
  /** Прапорець для конкретної людини (backend/index.ts → flagsBerekenen). */
  vlagAan: (userId: string, sleutel: string) => Promise<boolean>;
  /** Чи прапорець увімкнено хоч комусь (головний вимикач + аудиторія) — тоді кнопка на сторінці входу є. */
  vlagPubliek: (sleutel: string) => Promise<boolean>;
};

// ------------------------------------------------------------------------------------------------ дрібниці
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const lichaam = (rc: RouterContext): Record<string, unknown> => (rc.body && typeof rc.body === 'object' ? rc.body as Record<string, unknown> : {});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64U = /^[A-Za-z0-9_-]+$/;
const sys = () => getPool('systeem');
const fout = (code: string, status = 400, extra: Record<string, unknown> = {}): RouterResponse => {
  const r = json({ ok: false, error: code, reasonCode: code, sessionCreated: false, ...extra }, status);
  if (status === 429 && Number(extra.retryAfter) > 0) r.headers['Retry-After'] = String(Math.ceil(Number(extra.retryAfter)));
  return r;
};
const ipVan = (rc: RouterContext): string => {
  const h = ((rc.event as unknown as { headers?: Record<string, string> }).headers || {});
  const f = String(h['x-forwarded-for'] || h['X-Forwarded-For'] || '').split(',')[0].trim();
  return limietSleutel(f || String((rc.event as unknown as { requestContext?: { http?: { sourceIp?: string } } }).requestContext?.http?.sourceIp || '')) || 'onbekend';
};
const audit = (userId: string | null, action: string, result: string, details: Record<string, unknown> = {}) =>
  auditToevoegen({ ownerId: userId || 'anonymous', actorId: userId || 'anonymous', action, type: 'identity', result, details, service: 'identity' }).catch(() => undefined);
const ipLimiet = async (rc: RouterContext, emmer: string, max: number): Promise<RouterResponse | null> => {
  const r = await rateLimit(`aanmelden-${emmer}:${ipVan(rc)}`, max, 600);
  return r.ok ? null : fout('RATE_LIMITED', 429, { retryAfter: r.retryAfter });
};
const sessieIds = (s: string) => s.split('|').map((x) => x.replace(/^[at]:/, '')).filter(Boolean);

// ------------------------------------------------------------------------------------------------ виклики (app.aanmeld_uitdagingen)
async function uitdagingBewaren(o: { soort: 'passkey' | 'wachtwoord' | 'extern'; aanbieder?: string; sleutel: string; transactieId: string; uitdaging?: string; verifier?: string; nonce?: string; ms: number }): Promise<string> {
  await sys().query("DELETE FROM app.aanmeld_uitdagingen WHERE verloopt_op < now() - interval '1 day'").catch(() => undefined);
  const r = await sys().query(`INSERT INTO app.aanmeld_uitdagingen (soort, aanbieder, sleutel_hash, transactie_id, uitdaging, verifier, nonce, verloopt_op)
    VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(secs => $8)) RETURNING id`,
  [o.soort, o.aanbieder || '', sha(o.sleutel), o.transactieId, o.uitdaging || '', o.verifier || '', o.nonce || '', o.ms / 1000]);
  return String(r.rows[0].id);
}
type UitdagingRij = { id: string; transactie_id: string; uitdaging: string; verifier: string; nonce: string; aanbieder: string };
/** Атомарно й одноразово: друга спроба з тим самим викликом нічого не отримує. */
async function uitdagingInnemen(soort: string, sleutel: string, aanbieder = ''): Promise<UitdagingRij | null> {
  const r = await sys().query(`UPDATE app.aanmeld_uitdagingen SET gebruikt_op = now()
     WHERE sleutel_hash = $1 AND soort = $2 AND aanbieder = $3 AND gebruikt_op IS NULL AND verloopt_op > now()
     RETURNING id, transactie_id, uitdaging, verifier, nonce, aanbieder`, [sha(sleutel), soort, aanbieder]);
  return (r.rows[0] as UitdagingRij | undefined) || null;
}
/** Чи є (ще не використаний) запис — щоб зворотний виклик Microsoft/Discord/Apple відрізнив вхід від прив'язки. */
async function uitdagingBestaat(soort: string, sleutel: string, aanbieder: string): Promise<boolean> {
  const r = await sys().query('SELECT 1 FROM app.aanmeld_uitdagingen WHERE sleutel_hash = $1 AND soort = $2 AND aanbieder = $3', [sha(sleutel), soort, aanbieder]);
  return (r.rowCount || 0) > 0;
}

// ------------------------------------------------------------------------------------------------ шляхи цієї людини (захист від блокування)
/** Робочі шляхи входу людини, крім Google і пароля (їх рахує toegangslaag): ключ доступу, прив'язані Microsoft/Discord/Apple. */
export async function extraWegenVoor(deps: Pick<AanmeldWegDeps, 'vlagAan'>, userId: string, zonder?: string): Promise<string[]> {
  const uit: string[] = [];
  if (zonder !== 'passkey' && (await deps.vlagAan(userId, WEG_VLAG.passkey).catch(() => false)) && (await passkeyAantal(userId)) > 0) uit.push('passkey');
  if (await deps.vlagAan(userId, WEG_VLAG.microsoft).catch(() => false)) {
    for (const id of EXTERN) if (id !== zonder && (await externKlaar(id)) && (await koppelingVanGebruiker(userId, id))) uit.push(id);
  }
  return uit;
}
async function koppelingVanGebruiker(userId: string, aanbieder: string): Promise<boolean> {
  const r = await sys().query("SELECT 1 FROM app.records WHERE tbl = 'aanmeld_koppelingen_v1' AND data->>'ownerUserId' = $1 AND data->>'aanbieder' = $2 LIMIT 1", [userId, aanbieder]);
  return (r.rowCount || 0) > 0;
}
/** Способи, що ЗАРАЗ можуть дати сеанс комусь (сторінка входу й розміщення): прапорець увімкнено хоч комусь (+ ключі й самоперевірка). */
export async function werkendePubliek(deps: Pick<AanmeldWegDeps, 'vlagPubliek'>): Promise<AanmeldMethodeId[]> {
  const uit: AanmeldMethodeId[] = [];
  if (await deps.vlagPubliek(WEG_VLAG.passkey).catch(() => false)) uit.push('passkey');
  if (await deps.vlagPubliek(WEG_VLAG.password).catch(() => false)) uit.push('wachtwoord');
  if (await deps.vlagPubliek(WEG_VLAG.microsoft).catch(() => false)) for (const id of EXTERN) if (await externKlaar(id).catch(() => false)) uit.push(id);
  return uit;
}

// ------------------------------------------------------------------------------------------------ спільне завершення
async function afronden(deps: AanmeldWegDeps, rc: RouterContext, o: { transactieId: string; userId: string; methode: Weg; tweedeFactor: boolean; details?: Record<string, unknown> }): Promise<RouterResponse> {
  if (!(await deps.vlagAan(o.userId, WEG_VLAG[o.methode]).catch(() => false))) {
    await audit(o.userId, `aanmelden.${o.methode}`, 'denied', { reden: 'METHODE_NIET_VOOR_U' });
    await deps.afbreken?.(o.transactieId).catch(() => undefined);
    return fout('METHODE_NIET_VOOR_U', 403);
  }
  const { antwoord, sessieId } = await deps.voltooien(rc, { transactieId: o.transactieId, userId: o.userId, methode: o.methode });
  if (!sessieId) { await audit(o.userId, `aanmelden.${o.methode}`, 'denied', { reden: 'GEEN_SESSIE', ...(o.details || {}) }); return antwoord; }
  if (o.tweedeFactor) await tweedeFactorVastleggen(o.userId, sessieIds(sessieId)).catch(() => undefined);
  await audit(o.userId, `aanmelden.${o.methode}`, 'success', { tweedeFactor: o.tweedeFactor, ...(o.details || {}) });
  const [uk, nl] = WEG_NAAM[o.methode];
  await meld(o.userId, 'access_method_login', `Вхід без Google: ${uk} / Aanmelding zonder Google: ${nl}`,
    `Щойно виконано вхід у ваш обліковий запис через «${uk}». Якщо це були не ви — завершіть інші сеанси на сторінці «Сесії та пристрої» і змініть спосіб входу. / Er is net aangemeld op uw account met «${nl}». Was u dit niet? Beëindig de andere sessies bij «Sessies en apparaten» en wijzig de aanmeldmethode.`).catch(() => undefined);
  return antwoord;
}

// ------------------------------------------------------------------------------------------------ маршрути
export function aanmeldMethodenRoutes(deps: AanmeldWegDeps): Record<string, RouterMiddleware[]> {
  registreerExtraWegen((userId, zonder) => extraWegenVoor(deps, userId, zonder));
  registreerExtraWerkend(() => werkendePubliek(deps));
  const r = (run: (rc: RouterContext) => Promise<RouterResponse>): RouterMiddleware[] => [(async (rc: RouterContext) => {
    try { return await run(rc); }
    catch (e) { console.error('[aanmelden-methoden]', (e as Error)?.message); return fout('AANMELDEN_MISLUKT', 500); }
  }) as RouterMiddleware];
  const startTx = async (rc: RouterContext, methode: Weg) => {
    const d = lichaam(rc);
    return deps.start(rc, {
      tab: str(d.tab || d.tabContext, 200), locale: d.locale === 'nl' ? 'nl' : 'uk', remember: d.remember !== false,
      intent: d.intent === 'replace-tab' ? 'replace-tab' : 'login', returnTo: str(d.returnTo, 500) || undefined, sourceOrigin: str(d.sourceOrigin, 200) || undefined,
    }, methode);
  };
  const metCookie = (resp: RouterResponse, cookie: string): RouterResponse => { if (cookie) resp.headers['Set-Cookie'] = resp.headers['Set-Cookie'] ? `${resp.headers['Set-Cookie']}, ${cookie}` : cookie; return resp; };

  return {
    // ================================================================ ключ доступу (discoverable credential)
    // 1) виклик: без allowCredentials — браузер сам пропонує збережені ключі цього сайту (rpId tarasevych.com).
    'POST /api/aanmelden/passkey/opties': r(async (rc) => {
      if (!(await deps.vlagPubliek(WEG_VLAG.passkey))) return fout('METHODE_UIT', 404);
      { const l = await ipLimiet(rc, 'passkey', 30); if (l) return l; }
      const tx = await startTx(rc, 'passkey');
      if ('fout' in tx) return fout(tx.fout, 400);
      const uitdaging = randomBytes(32).toString('base64url');
      const uitdagingId = randomBytes(24).toString('base64url');
      await uitdagingBewaren({ soort: 'passkey', sleutel: uitdagingId, transactieId: tx.transactieId, uitdaging, ms: UITDAGING_MS });
      return metCookie(json({ uitdagingId, publicKey: { challenge: uitdaging, rpId: passkeyRp().rpId, timeout: 120000, userVerification: 'required', allowCredentials: [] } }), tx.setCookie);
    }),
    // 2) відповідь браузера: ключ за credentialId → підпис, origin, rpId, UV, лічильник → той самий сеанс, що й Google.
    'POST /api/aanmelden/passkey/voltooien': r(async (rc) => {
      { const l = await ipLimiet(rc, 'passkey-voltooien', 30); if (l) return l; }
      const d = lichaam(rc);
      const uitdagingId = str(d.uitdagingId, 64);
      const a = (d.assertie && typeof d.assertie === 'object' ? d.assertie : {}) as Record<string, unknown>;
      const veld = (v: unknown, max: number) => { const t = str(v, max + 1); return t && t.length <= max && B64U.test(t) ? t : ''; };
      const assertie = { credentialId: veld(a.credentialId, 1400), clientDataJSON: veld(a.clientDataJSON, 8192), authenticatorData: veld(a.authenticatorData, 8192), signature: veld(a.signature, 2048) };
      if (!uitdagingId || Object.values(assertie).some((x) => !x)) return fout('PASSKEY_ANTWOORD_ONGELDIG', 400);
      const rij = await uitdagingInnemen('passkey', uitdagingId);
      if (!rij) return fout('UITDAGING_ONGELDIG', 403);
      // Бінд-кукі транзакції ДО будь-якої перевірки ключа: чужий браузер із підглянутим uitdagingId нічого не отримає.
      if (!(await deps.bindingKlopt(rc, rij.transactie_id, 'passkey'))) { await audit(null, 'aanmelden.passkey', 'denied', { reden: 'LOGIN_BINDING_MISMATCH' }); return fout('LOGIN_BINDING_MISMATCH', 403); }
      const k = (await sys().query('SELECT id, user_id, credential_id, alg, jwk, vingerafdruk, naam, sign_count FROM app.passkeys WHERE credential_id = $1 LIMIT 2', [assertie.credentialId])).rows as Array<{ id: string; user_id: string; credential_id: string; alg: number; jwk: kern.Jwk; vingerafdruk: string; naam: string; sign_count: string | number }>;
      if (k.length !== 1) { await audit(null, 'aanmelden.passkey', 'denied', { reden: 'SLEUTEL_ONBEKEND' }); return fout('PASSKEY_ONBEKEND', 403); }
      const sleutel = k[0];
      const userHandle = str(a.userHandle, 200);
      if (userHandle && userHandle !== gebruikerHandle(sleutel.user_id)) { await audit(sleutel.user_id, 'aanmelden.passkey', 'denied', { reden: 'USER_HANDLE' }); return fout('PASSKEY_ONBEKEND', 403); }
      // Origin: сторінка входу будь-якої власної служби (той самий rpId tarasevych.com); чужий сайт не пройде — kern перевіряє точний збіг.
      const origins = [...new Set([...passkeyRp().origins, ...Object.values(SERVICE_HOSTS).map((h) => `https://${h}`).filter((o) => kern.originHoortBijRp(o, passkeyRp().rpId))])];
      const v = kern.verifieerAssertie({ assertie, verwachteUitdaging: rij.uitdaging, rpId: passkeyRp().rpId, origins,
        sleutels: [{ credentialId: sleutel.credential_id, alg: sleutel.alg, jwk: sleutel.jwk, label: sleutel.naam, vingerafdruk: sleutel.vingerafdruk }] });
      if (!v.ok) { await audit(sleutel.user_id, 'aanmelden.passkey', 'denied', { reden: v.code }); return fout(`PASSKEY_${v.code}`, 403); }
      const ok = v as Extract<typeof v, { ok: true }>;
      if (!kern.tellerOk(Number(sleutel.sign_count), ok.signCount)) { await audit(sleutel.user_id, 'aanmelden.passkey', 'denied', { reden: 'TELLER_TERUG' }); return fout('PASSKEY_TELLER_TERUG', 403); }
      await sys().query('UPDATE app.passkeys SET sign_count = GREATEST(sign_count, $2), laatst_gebruikt_op = now(), backup_state = $3 WHERE id = $1', [sleutel.id, Math.max(0, ok.signCount), (ok.vlaggen & kern.VLAG.BS) !== 0]);
      const antwoord = await afronden(deps, rc, { transactieId: rij.transactie_id, userId: sleutel.user_id, methode: 'passkey', tweedeFactor: true, details: { vingerafdruk: sleutel.vingerafdruk.slice(0, 16) } });
      if (antwoord.statusCode < 300) await gebruikVastleggen(sleutel.user_id, 'passkey', String(sleutel.id), 'inloggen', { dienst: 'identity' }).catch(() => undefined);
      return antwoord;
    }),

    // ================================================================ пароль (+ код із застосунку або код відновлення)
    // 1) start: лише транзакція і бінд-кукі (пароль ще не надсилається); 2) voltooien: адреса, пароль, код — одним запитом
    //    (SEC-002 aanmelden-08: жодної проміжної відповіді «потрібен код», тож не видно, у кого є TOTP).
    'POST /api/aanmelden/wachtwoord/start': r(async (rc) => {
      if (!(await deps.vlagPubliek(WEG_VLAG.password))) return fout('METHODE_UIT', 404);
      { const l = await ipLimiet(rc, 'wachtwoord-start', 30); if (l) return l; }
      const tx = await startTx(rc, 'password');
      if ('fout' in tx) return fout(tx.fout, 400);
      const pogingId = randomBytes(24).toString('base64url');
      await uitdagingBewaren({ soort: 'wachtwoord', sleutel: pogingId, transactieId: tx.transactieId, ms: UITDAGING_MS });
      return metCookie(json({ pogingId }), tx.setCookie);
    }),
    'POST /api/aanmelden/wachtwoord/voltooien': r(async (rc) => {
      { const l = await ipLimiet(rc, 'wachtwoord', 20); if (l) return l; }
      const d = lichaam(rc);
      const rij = await uitdagingInnemen('wachtwoord', str(d.pogingId, 64));
      if (!rij) return fout('UITDAGING_ONGELDIG', 403);
      if (!(await deps.bindingKlopt(rc, rij.transactie_id, 'password'))) { await audit(null, 'aanmelden.password', 'denied', { reden: 'LOGIN_BINDING_MISMATCH' }); return fout('LOGIN_BINDING_MISMATCH', 403); }
      const code = str(d.code || d.totp, 40).replace(/\s+/g, '');
      // IDENTITEIT-015 (herstel): межа на АДРЕСУ, а не лише на IP — цей шлях видає повний сеанс. Рахуються всі спроби з усіх адрес
      // (і для неіснуючих адрес — відповідь нічого не розкриває). Наслідок для власника: при атаці вхід паролем на годину зачиняється,
      // інші способи (Google, ключ доступу) працюють. / Grens per e-mailadres over alle IP's heen.
      const adres = str(d.email, 254).trim().toLowerCase();
      if (adres) {
        const l = await rateLimit(`aanmelden-wachtwoord-adres:${sha(adres)}`, WACHTWOORD_PER_ADRES, 3600, { failClosed: true });
        if (!l.ok) { await audit(null, 'aanmelden.password', 'denied', { reden: 'ADRES_LIMIET' }); await deps.afbreken?.(rij.transactie_id).catch(() => undefined); return fout('RATE_LIMITED', 429, { retryAfter: l.retryAfter }); }
      }
      const uit = await verifyPasswordLogin(str(d.email, 254), str(d.password, 1024), code, ipVan(rc), 'identity', { tijdelijkWeigeren: true });
      if (uit.status === 'must_change') {
        // Тимчасовий пароль: відмова ДО коду — код відновлення не витрачено; транзакцію входу закрито.
        await audit(uit.userId, 'aanmelden.password', 'denied', { reden: 'ACCESS_PASSWORD_MUST_CHANGE' });
        await deps.afbreken?.(rij.transactie_id).catch(() => undefined);
        return fout('ACCESS_PASSWORD_MUST_CHANGE', 403);
      }
      if (uit.status !== 'ok' || !('user' in uit) || !uit.user) {
        await audit(null, 'aanmelden.password', 'denied', { reden: uit.code });
        return fout(uit.code, uit.http || 401, 'retryAfter' in uit && uit.retryAfter ? { retryAfter: uit.retryAfter } : {});
      }
      // IDENTITEIT-015 (давня вада): тимчасовий пароль (mustChange) відомий тому, хто його видав, — сеансу він не дає. Людина входить іншим
      // способом і задає власний пароль у «Способах входу». Перевірка ПІСЛЯ пароля й коду: відповідь не розкриває нічого стороннім.
      if (uit.mustChange) { await audit(uit.user.id, 'aanmelden.password', 'denied', { reden: 'ACCESS_PASSWORD_MUST_CHANGE' }); await deps.afbreken?.(rij.transactie_id).catch(() => undefined); return fout('ACCESS_PASSWORD_MUST_CHANGE', 403); }
      return afronden(deps, rc, { transactieId: rij.transactie_id, userId: uit.user.id, methode: 'password', tweedeFactor: uit.tweedeFactor === true });
    }),

    // ================================================================ Microsoft / Discord / Apple за прив'язаною особою
    // start: транзакція + state/PKCE/nonce у app.aanmeld_uitdagingen; той самий redirect_uri, що й прив'язка (власник реєструє одну адресу).
    'POST /api/aanmelden/extern/start': r(async (rc) => {
      const id = str(lichaam(rc).id, 20) as Extern;
      if (!EXTERN.includes(id)) return fout('AANBIEDER_ONBEKEND', 404);
      if (!(await deps.vlagPubliek(WEG_VLAG[id])) || !(await externKlaar(id))) return fout('METHODE_UIT', 404);
      { const l = await ipLimiet(rc, 'extern', 30); if (l) return l; }
      const tx = await startTx(rc, id);
      if ('fout' in tx) return fout(tx.fout, 400);
      const state = randomBytes(24).toString('base64url'), verifier = randomBytes(48).toString('base64url'), nonce = randomBytes(18).toString('base64url');
      await uitdagingBewaren({ soort: 'extern', aanbieder: id, sleutel: state, transactieId: tx.transactieId, verifier, nonce, ms: EXTERN_STATE_MS });
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      return metCookie(json({ id, url: externAutoriseerUrl(id, { state, challenge, nonce }) }), tx.setCookie);
    }),
  };
}

/**
 * Зворотний виклик Microsoft/Discord/Apple для ВХОДУ (backend/aanmeld-koppel.ts викликає це першим; null — це прив'язка, не вхід).
 * Порядок: state належить входу → бінд-кукі цього браузера → одноразово забрати state → обмін коду (PKCE, підпис id_token, nonce)
 * → особа прив'язана рівно до одного облікового запису → прапорець → сеанс тим самим механізмом → 302 на адресу повернення.
 * Помилка — 302 на сторінку входу з ?aanmeld_fout=<КОД> (без секретів).
 */
export function externTerugVoor(deps: AanmeldWegDeps) {
  return async (rc: RouterContext, aanbieder: string, q: Record<string, string>): Promise<RouterResponse | null> => {
    if (!(EXTERN as readonly string[]).includes(aanbieder)) return null;
    const state = str(q.state, 200);
    if (!state || !(await uitdagingBestaat('extern', state, aanbieder))) return null;
    const naar = (pad: string, code: string) => ({ statusCode: 302, headers: { Location: `${pad}${pad.includes('?') ? '&' : '?'}aanmeld_fout=${encodeURIComponent(code)}`, 'Cache-Control': 'no-store' }, body: '' } as RouterResponse);
    const basis = `${aanmeldTerugBasis()}/`;
    const rij = await uitdagingInnemen('extern', state, aanbieder);
    if (!rij) return naar(basis, 'UITDAGING_ONGELDIG');
    const terug = (await deps.terugAdres?.(rij.transactie_id).catch(() => '')) || basis;
    if (!(await deps.bindingKlopt(rc, rij.transactie_id, aanbieder as Weg))) { await audit(null, `aanmelden.${aanbieder}`, 'denied', { reden: 'LOGIN_BINDING_MISMATCH' }); return naar(terug, 'ANDERE_BROWSER'); }
    let wie: { subject: string; label: string };
    try { wie = await externIdentiteit(aanbieder as Extern, q, { verifier: rij.verifier, nonce: rij.nonce }); }
    catch (e) { const code = String((e as Error)?.message || 'TOKEN_ONGELDIG').replace(/[^A-Z_]/g, '').slice(0, 40) || 'TOKEN_ONGELDIG'; await audit(null, `aanmelden.${aanbieder}`, 'denied', { reden: code }); return naar(terug, code); }
    const userId = await koppelingEigenaar(aanbieder, wie.subject);
    if (!userId) { await audit(null, `aanmelden.${aanbieder}`, 'denied', { reden: 'NIET_GEKOPPELD', label: wie.label }); await deps.afbreken?.(rij.transactie_id).catch(() => undefined); return naar(terug, 'NIET_GEKOPPELD'); }
    const antwoord = await afronden(deps, rc, { transactieId: rij.transactie_id, userId, methode: aanbieder as Weg, tweedeFactor: false, details: { label: wie.label } });
    if (antwoord.statusCode >= 300) {
      let code = 'AANMELDEN_MISLUKT'; try { code = String(JSON.parse(String(antwoord.body || '{}')).reasonCode || code); } catch { /* standaard */ }
      return naar(terug, code.replace(/[^A-Z_]/g, '').slice(0, 40) || 'AANMELDEN_MISLUKT');
    }
    let doel = terug; try { const b = JSON.parse(String(antwoord.body || '{}')) as { returnTo?: string }; if (b.returnTo) doel = b.returnTo; } catch { /* terug */ }
    const cookie = Object.entries(antwoord.headers || {}).find(([k]) => k.toLowerCase() === 'set-cookie')?.[1] || '';
    return { statusCode: 302, headers: { Location: doel, 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) }, body: '' };
  };
}

/** Публічні маршрути цього модуля (для server/platform/auth-poort.ts PUBLIEKE_ROUTES і тесту). */
export const AANMELD_METHODEN_PUBLIEKE_ROUTES: Readonly<Record<string, string>> = Object.freeze({
  'POST /api/aanmelden/passkey/opties': 'вхід ключем доступу: одноразовий виклик + транзакція і бінд-кукі (до сеансу)',
  'POST /api/aanmelden/passkey/voltooien': 'вхід ключем доступу: підпис, origin/rpId, UV, лічильник → сеанс (бінд-кукі, одноразово)',
  'POST /api/aanmelden/wachtwoord/start': 'вхід паролем: транзакція і бінд-кукі (без пароля)',
  'POST /api/aanmelden/wachtwoord/voltooien': 'вхід паролем: адреса, пароль, код другого чинника одним запитом; блокування спроб',
  'POST /api/aanmelden/extern/start': 'вхід через прив’язаний Microsoft/Discord/Apple: state + PKCE + nonce, транзакція і бінд-кукі',
});
