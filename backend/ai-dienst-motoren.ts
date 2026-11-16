// MAILAI-003 (16.11.2026, міграція 0295): спільні рушії ШІ «для всіх» і лічильник використання рушіїв у пошті.
// Власник сайту вмикає рушій (ключ постачальника, LibreTranslate або Ollama на власному сервері) для користувачів ОКРЕМО від
// особистих ключів: ключ лежить у його сховищі під назвою «gedeeld-…» із призначенням «other». Особистий пошук ключа шукає за
// призначенням-постачальником (anthropic, gemini, …), тож спільний ключ ніколи не стане особистим і навпаки.
// Типово вимкнено. Текст листа сервер не зберігає й не журналює; у базі лише лічильник запитів на людину й день.
// Gedeelde AI-motoren en de gebruiksteller. Lezen/schrijven alleen met de systeemrol; ontbreekt de tabel (migratie nog niet
// gedraaid) dan bestaan er geen gedeelde motoren en telt de teller in het geheugen.
import { error, json } from '../server/platform';
import { isOwnerEmail, rateLimit } from '../server/platform/beveiliging';
import { getPool } from '../server/platform/pg';
import { ownerVaultBewarenIntern, ownerVaultVerwijderenIntern, readOwnerVaultPlaintext } from './api-platform-kluis';
import { meld } from './melder';
import { AI_AANBIEDER_BIJ_ID, type AiAanbiederId } from '../shared/ai-aanbieders';
import {
  DIENST_ID_RE, DIENST_MAX_MOTOREN, akkoordSleutel, dienstKlaar, dienstRisicos, dienstSoortNaam, gebruikSleutelDienst,
  gedeeldeSleutelNaam, normaliseerDienstInvoer,
  type DienstGebruik, type DienstMotor, type DienstSoort,
} from '../shared/ai-dienst-motor';

/** Рядок бази: рушій разом із власником ключа (його сховище) — назовні власник ключа не віддається. */
export type DienstRij = DienstMotor & { eigenaarUserId: string };
export type GebruikStat = { motor: string; dag: string; aantal: number; geweigerd: number; gebruikers: number };

export type DienstOpslag = {
  lijst(): Promise<DienstRij[]>;
  bewaar(rij: DienstRij): Promise<void>;
  verwijder(id: string): Promise<boolean>;
  /** Атомарно: +1, якщо ще не досягнуто межі. Повертає нове число або null, коли межу вичерпано (тоді рахується відмова). */
  reserveer(userId: string, motor: string, dag: string, limiet: number | null): Promise<number | null>;
  geefTerug(userId: string, motor: string, dag: string): Promise<void>;
  gebruikVan(userId: string, dag: string): Promise<Record<string, number>>;
  statistiek(vanafDag: string): Promise<GebruikStat[]>;
};

const q = (sql: string, params: unknown[] = []) => getPool('systeem').query(sql, params);
const isOntbrekend = (err: unknown): boolean => (err as { code?: string })?.code === '42P01'
  || (err instanceof Error && /relation "app\.ai_(?:dienst_motoren|motor_gebruik)" does not exist/.test(err.message));

/** Лічильник у пам'яті: запасний шлях, доки міграцію не застосовано (і для тестів без бази). */
export function geheugenOpslag(): DienstOpslag {
  const rijen = new Map<string, DienstRij>();
  const tel = new Map<string, { aantal: number; geweigerd: number }>();
  const k = (u: string, m: string, d: string) => `${d}|${m}|${u}`;
  return {
    async lijst() { return [...rijen.values()].sort((a, b) => a.id.localeCompare(b.id)); },
    async bewaar(rij) { rijen.set(rij.id, { ...rij }); },
    async verwijder(id) { return rijen.delete(id); },
    async reserveer(u, m, d, limiet) {
      const cel = tel.get(k(u, m, d)) || { aantal: 0, geweigerd: 0 };
      tel.set(k(u, m, d), cel);
      if (limiet !== null && cel.aantal >= limiet) { cel.geweigerd += 1; return null; }
      cel.aantal += 1;
      if (tel.size > 5000) tel.delete(tel.keys().next().value as string);
      return cel.aantal;
    },
    async geefTerug(u, m, d) { const cel = tel.get(k(u, m, d)); if (cel && cel.aantal > 0) cel.aantal -= 1; },
    async gebruikVan(u, d) {
      const uit: Record<string, number> = {};
      for (const [sleutel, cel] of tel) { const [dag, motor, user] = sleutel.split('|'); if (dag === d && user === u) uit[motor] = cel.aantal; }
      return uit;
    },
    async statistiek(vanaf) {
      const per = new Map<string, GebruikStat>();
      for (const [sleutel, cel] of tel) {
        const [dag, motor] = sleutel.split('|');
        if (dag < vanaf) continue;
        const s = per.get(`${dag}|${motor}`) || { motor, dag, aantal: 0, geweigerd: 0, gebruikers: 0 };
        s.aantal += cel.aantal; s.geweigerd += cel.geweigerd; if (cel.aantal > 0) s.gebruikers += 1;
        per.set(`${dag}|${motor}`, s);
      }
      return [...per.values()];
    },
  };
}

const nood = geheugenOpslag();
const rijUitDb = (r: Record<string, unknown>): DienstRij => ({
  id: String(r.id), soort: String(r.soort) as DienstSoort, naam: String(r.naam),
  aanbieder: r.aanbieder ? String(r.aanbieder) as AiAanbiederId : undefined,
  url: r.url ? String(r.url) : undefined, model: r.model ? String(r.model) : undefined,
  aan: r.aan === true, limietPerDag: Number(r.limiet_per_dag), heeftSleutel: r.heeft_sleutel === true,
  beheerder: String(r.bijgewerkt_door || ''), bijgewerktOp: new Date(String(r.bijgewerkt_op)).getTime(), eigenaarUserId: String(r.eigenaar_user_id),
});

const pgOpslag: DienstOpslag = {
  async lijst() {
    try {
      const { rows } = await q('SELECT id, soort, naam, aanbieder, url, model, aan, limiet_per_dag, heeft_sleutel, bijgewerkt_door, bijgewerkt_op, eigenaar_user_id FROM app.ai_dienst_motoren ORDER BY id');
      return (rows as Record<string, unknown>[]).map(rijUitDb);
    } catch (err) { if (isOntbrekend(err)) return []; throw err; }
  },
  async bewaar(rij) {
    await q(
      `INSERT INTO app.ai_dienst_motoren (id, soort, naam, aanbieder, url, model, aan, limiet_per_dag, heeft_sleutel, bijgewerkt_door, bijgewerkt_op, eigenaar_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11)
       ON CONFLICT (id) DO UPDATE SET soort=EXCLUDED.soort, naam=EXCLUDED.naam, aanbieder=EXCLUDED.aanbieder, url=EXCLUDED.url, model=EXCLUDED.model,
         aan=EXCLUDED.aan, limiet_per_dag=EXCLUDED.limiet_per_dag, heeft_sleutel=EXCLUDED.heeft_sleutel, bijgewerkt_door=EXCLUDED.bijgewerkt_door,
         bijgewerkt_op=now(), eigenaar_user_id=EXCLUDED.eigenaar_user_id`,
      [rij.id, rij.soort, rij.naam, rij.aanbieder ?? null, rij.url ?? null, rij.model ?? null, rij.aan, rij.limietPerDag, rij.heeftSleutel, rij.beheerder.slice(0, 120), rij.eigenaarUserId],
    );
  },
  async verwijder(id) {
    const r = await q('DELETE FROM app.ai_dienst_motoren WHERE id = $1', [id]);
    return Number(r.rowCount || 0) > 0;
  },
  async reserveer(userId, motor, dag, limiet) {
    try {
      const { rows } = await q(
        `INSERT INTO app.ai_motor_gebruik (user_id, motor, dag, aantal) VALUES ($1,$2,$3::date,1)
         ON CONFLICT (user_id, motor, dag) DO UPDATE SET aantal = app.ai_motor_gebruik.aantal + 1
           WHERE $4::int IS NULL OR app.ai_motor_gebruik.aantal < $4::int
         RETURNING aantal`,
        [userId, motor, dag, limiet],
      );
      if (rows[0]) return Number((rows[0] as { aantal: number }).aantal);
      await q('UPDATE app.ai_motor_gebruik SET geweigerd = geweigerd + 1 WHERE user_id=$1 AND motor=$2 AND dag=$3::date', [userId, motor, dag]);
      return null;
    } catch (err) { if (isOntbrekend(err)) return nood.reserveer(userId, motor, dag, limiet); throw err; }
  },
  async geefTerug(userId, motor, dag) {
    try { await q('UPDATE app.ai_motor_gebruik SET aantal = GREATEST(aantal - 1, 0) WHERE user_id=$1 AND motor=$2 AND dag=$3::date', [userId, motor, dag]); }
    catch (err) { if (isOntbrekend(err)) return nood.geefTerug(userId, motor, dag); throw err; }
  },
  async gebruikVan(userId, dag) {
    try {
      const { rows } = await q('SELECT motor, aantal FROM app.ai_motor_gebruik WHERE user_id=$1 AND dag=$2::date', [userId, dag]);
      return Object.fromEntries((rows as { motor: string; aantal: number }[]).map((r) => [r.motor, Number(r.aantal)]));
    } catch (err) { if (isOntbrekend(err)) return nood.gebruikVan(userId, dag); throw err; }
  },
  async statistiek(vanafDag) {
    try {
      const { rows } = await q(
        `SELECT motor, to_char(dag, 'YYYY-MM-DD') AS dag, sum(aantal)::int AS aantal, sum(geweigerd)::int AS geweigerd, count(*) FILTER (WHERE aantal > 0)::int AS gebruikers
         FROM app.ai_motor_gebruik WHERE dag >= $1::date AND motor LIKE 'dienst:%' GROUP BY motor, dag ORDER BY dag DESC, motor`, [vanafDag]);
      return rows as GebruikStat[];
    } catch (err) { if (isOntbrekend(err)) return nood.statistiek(vanafDag); throw err; }
  },
};

let opslag: DienstOpslag = pgOpslag;
/** Призначення спільного ключа у сховищі: навмисно НЕ постачальник, щоб жоден особистий пошук його не знайшов. */
export const GEDEELD_DOEL = 'other' as const;
const echteLezer = async (eigenaar: string, keyName: string): Promise<string | null> => { try { return await readOwnerVaultPlaintext(eigenaar, keyName, GEDEELD_DOEL); } catch { return null; } };
let sleutelLezer: (eigenaarUserId: string, keyName: string) => Promise<string | null> = echteLezer;
const echteSchrijver = async (eigenaar: string, keyName: string, gebruiktDoor: string, waarde: string): Promise<void> => { await ownerVaultBewarenIntern(eigenaar, keyName, GEDEELD_DOEL, gebruiktDoor, waarde); };
const echteWisser = async (eigenaar: string, keyName: string): Promise<void> => { await ownerVaultVerwijderenIntern(eigenaar, keyName); };
let sleutelSchrijver = echteSchrijver;
let sleutelWisser = echteWisser;
let cache: { at: number; rijen: DienstRij[] } | null = null;
const VERS = 5_000;

/** Лише для тестів: власне сховище рядків і читач ключа. null повертає справжні. */
export function setDienstOpslag(o: DienstOpslag | null, kluis?: { lezer?: typeof sleutelLezer; schrijver?: typeof sleutelSchrijver; wisser?: typeof sleutelWisser } | null): void {
  opslag = o ?? pgOpslag; cache = null; resterend.clear();
  sleutelLezer = kluis?.lezer ?? echteLezer;
  sleutelSchrijver = kluis?.schrijver ?? echteSchrijver;
  sleutelWisser = kluis?.wisser ?? echteWisser;
}

export const dagVan = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

export async function leesDienstMotoren(): Promise<DienstRij[]> {
  if (cache && Date.now() - cache.at < VERS) return cache.rijen;
  const rijen = await opslag.lijst();
  cache = { at: Date.now(), rijen };
  return rijen;
}
export async function dienstMotor(id: string): Promise<DienstRij | null> {
  if (!DIENST_ID_RE.test(id)) return null;
  return (await leesDienstMotoren()).find((r) => r.id === id) || null;
}
/** Ключ спільного рушія: лише зі сховища власника, який його додав, і лише під назвою «gedeeld-<id>». */
export async function dienstSleutel(rij: DienstRij): Promise<string | null> {
  if (rij.soort !== 'aanbieder' || !rij.aanbieder || !rij.heeftSleutel) return null;
  return sleutelLezer(rij.eigenaarUserId, gedeeldeSleutelNaam(rij.id));
}

// ------------------------------------------------------------------ використання й ліміти

/** Останній залишок за заголовками постачальника — у пам'яті процесу, на людину й рушій. Не зберігається. */
const resterend = new Map<string, { resterend: number; limiet?: number; op: number }>();
const RESTEREND_GELDIG = 60 * 60_000;

export async function reserveerGebruik(userId: string, motor: string, limiet: number | null): Promise<number | null> {
  try { return await opslag.reserveer(userId, motor, dagVan(), limiet); }
  catch { return limiet === null ? 0 : null; }   // без бази особистий ключ працює далі; спільний — ні (межу не можна перевірити)
}
export async function geefGebruikTerug(userId: string, motor: string): Promise<void> {
  try { await opslag.geefTerug(userId, motor, dagVan()); } catch { /* лічильник — не причина ламати відповідь */ }
}

/** Заголовки ліміту запитів: Anthropic (anthropic-ratelimit-requests-*) та OpenAI-сумісні (x-ratelimit-*-requests). Gemini їх не дає. */
export function leesLimietKoppen(headers: { get?: (naam: string) => string | null } | null | undefined): { resterend: number; limiet?: number } | null {
  const get = (n: string) => { try { return headers?.get?.(n) ?? null; } catch { return null; } };
  const r = get('anthropic-ratelimit-requests-remaining') ?? get('x-ratelimit-remaining-requests');
  if (r === null || r === '' || !Number.isFinite(Number(r))) return null;
  const l = get('anthropic-ratelimit-requests-limit') ?? get('x-ratelimit-limit-requests');
  const limiet = l !== null && l !== '' && Number.isFinite(Number(l)) ? Math.max(0, Math.round(Number(l))) : undefined;
  return { resterend: Math.max(0, Math.round(Number(r))), limiet };
}
export function onthoudResterend(userId: string, motor: string, waarde: { resterend: number; limiet?: number } | null): void {
  if (!waarde) return;
  resterend.set(`${userId}|${motor}`, { ...waarde, op: Date.now() });
  if (resterend.size > 4000) resterend.delete(resterend.keys().next().value as string);
}

export async function gebruikVan(userId: string): Promise<Record<string, DienstGebruik>> {
  let tel: Record<string, number> = {};
  try { tel = await opslag.gebruikVan(userId, dagVan()); } catch { tel = {}; }
  const uit: Record<string, DienstGebruik> = {};
  for (const [motor, aantal] of Object.entries(tel)) uit[motor] = { vandaag: aantal };
  for (const [sleutel, w] of resterend) {
    const [u, motor] = sleutel.split('|');
    if (u !== userId || Date.now() - w.op > RESTEREND_GELDIG) continue;
    uit[motor] = { ...(uit[motor] || { vandaag: 0 }), resterend: w.resterend, limiet: w.limiet, gemetenOp: w.op };
  }
  return uit;
}
export async function gebruikEen(userId: string, motor: string, limietPerDag?: number): Promise<DienstGebruik> {
  const alle = await gebruikVan(userId);
  return { ...(alle[motor] || { vandaag: 0 }), ...(limietPerDag ? { limietPerDag } : {}) };
}

// ------------------------------------------------------------------ власний сервер: LibreTranslate та Ollama

export type ServerUitkomst<T> = { ok: true; waarde: T } | { ok: false; status: number };
const basisFetch = (fetchFn: typeof fetch, url: string, body: unknown, sleutel?: string | null) => fetchFn(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(sleutel ? { authorization: `Bearer ${sleutel}` } : {}) },
  body: JSON.stringify(body),
  redirect: 'error',            // власний сервер не має перенаправляти текст листа кудись іще
  signal: AbortSignal.timeout(60_000),
});

/** LibreTranslate: POST /translate, масив рядків → масив перекладів у тому самому порядку. Лише переклад. */
export async function vertaalLibre(fetchFn: typeof fetch, rij: DienstRij, teksten: string[], doel: string): Promise<ServerUitkomst<{ vertaald: string[]; brontaal?: string }>> {
  try {
    const res = await basisFetch(fetchFn, `${rij.url}/translate`, { q: teksten, source: 'auto', target: doel, format: 'text' });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json().catch(() => null) as { translatedText?: unknown; detectedLanguage?: unknown } | null;
    const t = data?.translatedText;
    const vertaald = Array.isArray(t) ? t.map((x) => String(x ?? '')) : typeof t === 'string' ? [t] : [];
    if (vertaald.length !== teksten.length) return { ok: false, status: 502 };
    const d = Array.isArray(data?.detectedLanguage) ? data?.detectedLanguage[0] : data?.detectedLanguage;
    const brontaal = d && typeof (d as { language?: unknown }).language === 'string' ? String((d as { language: string }).language) : undefined;
    return { ok: true, waarde: { vertaald, brontaal } };
  } catch { return { ok: false, status: 0 }; }
}

/** Ollama: POST /api/chat з format=json. Повертає сирий текст відповіді моделі. */
export async function vraagOllama(fetchFn: typeof fetch, rij: DienstRij, systeem: string, vraag: string, maxTokens: number): Promise<ServerUitkomst<string>> {
  try {
    const res = await basisFetch(fetchFn, `${rij.url}/api/chat`, {
      model: rij.model, stream: false, format: 'json', options: { num_predict: maxTokens, temperature: 0.2 },
      messages: [{ role: 'system', content: systeem }, { role: 'user', content: vraag }],
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json().catch(() => null) as { message?: { content?: unknown } } | null;
    const tekst = typeof data?.message?.content === 'string' ? data.message.content.trim() : '';
    return tekst ? { ok: true, waarde: tekst } : { ok: false, status: 502 };
  } catch { return { ok: false, status: 0 }; }
}

// ------------------------------------------------------------------ маршрути власника

type SessionOk = { user: { id: string; email: string; role: string; name?: string; displayName?: string; status?: string }; service: string; session?: { id: string; createdAt?: number } | null };
type Ctx = { event: Record<string, unknown>; body: unknown };
type Deps = {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
  audit: (userId: string, action: string, outcome: 'success' | 'rejected', details?: Record<string, unknown>) => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stepUp?: (ctx: unknown, auth: any) => Promise<any | null>;
  fetch?: typeof fetch;
};
const lichaam = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
const zonderEigenaar = ({ eigenaarUserId: _e, ...rest }: DienstRij): DienstMotor => rest;
const beheerderNaam = (auth: SessionOk) => String(auth.user.displayName || auth.user.name || '').trim().slice(0, 80) || 'Адміністратор сайту';

const TEST_ZIN = 'Goedemorgen, dit is een testzin.';

export function aiDienstMotorenRoutes(deps: Deps) {
  const eigenaar = async (ctx: Ctx) => {
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return { fout: error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401) };
    if (!['admin', 'mcp'].includes(auth.service)) return { fout: error('ADMIN_SERVICE_REQUIRED', 403) };
    if (!(auth.user.role === 'owner' && isOwnerEmail(auth.user.email))) return { fout: error('OWNER_REQUIRED', 403) };
    return { auth };
  };
  // Без функції підтвердження — відмова (ніколи не пропускати мовчки).
  const stapOp = async (ctx: Ctx, auth: SessionOk) => (deps.stepUp ? deps.stepUp(ctx, auth) : error('STEP_UP_REQUIRED', 403));
  const weiger = (code: string, uk: string, nl: string, status = 400) => json({ ok: false, error: code, messageUk: uk, messageNl: nl }, status);

  const overzicht = async () => {
    const rijen = await opslag.lijst();
    cache = { at: Date.now(), rijen };
    let stat: GebruikStat[] = [];
    try { stat = await opslag.statistiek(dagVan(Date.now() - 6 * 86_400_000)); } catch { stat = []; }
    return {
      ok: true,
      motoren: rijen.map((r) => ({
        ...zonderEigenaar(r), klaar: dienstKlaar(r), akkoordSleutel: akkoordSleutel(r),
        soortNaamUk: dienstSoortNaam(r.soort), soortNaamNl: dienstSoortNaam(r.soort, true),
        risicosUk: dienstRisicos(r), risicosNl: dienstRisicos(r, true),
        standaardModel: r.aanbieder ? AI_AANBIEDER_BIJ_ID[r.aanbieder].standaardVertaalModel : undefined,
      })),
      statistiek: stat, vandaag: dagVan(), max: DIENST_MAX_MOTOREN,
    };
  };

  return {
    'POST /api/owner/ai-dienst-motoren/overzicht': [async (ctx: Ctx) => {
      const g = await eigenaar(ctx); if (g.fout) return g.fout;
      return json(await overzicht());
    }],

    // Зберегти рушій. Новий рушій завжди вимкнений; зміна того, куди йде текст (вид, постачальник, адреса, модель), вимикає його
    // знову й скидає згоди користувачів — власник вмикає свідомо, люди погоджуються свідомо.
    'POST /api/owner/ai-dienst-motoren/bewaar': [async (ctx: Ctx) => {
      const g = await eigenaar(ctx); if (g.fout) return g.fout;
      const auth = g.auth!;
      const b = lichaam(ctx.body);
      const n = normaliseerDienstInvoer(b);
      if (!n.ok) return weiger(n.code, n.uk, n.nl);
      const su = await stapOp(ctx, auth); if (su) return su;
      const rijen = await opslag.lijst();
      const oud = rijen.find((r) => r.id === n.waarde.id) || null;
      if (!oud && rijen.length >= DIENST_MAX_MOTOREN) return weiger('DIENST_TE_VEEL', `Не більше ${DIENST_MAX_MOTOREN} спільних рушіїв.`, `Niet meer dan ${DIENST_MAX_MOTOREN} gedeelde motoren.`);
      const sleutel = typeof b.sleutel === 'string' ? b.sleutel.trim() : '';
      let heeftSleutel = oud?.heeftSleutel === true && oud.soort === n.waarde.soort && oud.aanbieder === n.waarde.aanbieder && oud.eigenaarUserId === auth.user.id;
      if (n.waarde.soort === 'aanbieder' && sleutel) {
        try {
          await sleutelSchrijver(auth.user.id, gedeeldeSleutelNaam(n.waarde.id), `Спільний ШІ для всіх: ${n.waarde.naam}`, sleutel);
          heeftSleutel = true;
        } catch (err) {
          await deps.audit(auth.user.id, 'owner.ai.dienst_motor.bewaar', 'rejected', { id: n.waarde.id, reden: (err as Error).message });
          return weiger('DIENST_SLEUTEL_NIET_BEWAARD', 'Ключ не вдалося зберегти у «Сховищі ключів». Рушій не змінено.', 'De sleutel kon niet in de «Sleutelkluis» worden bewaard. De motor is niet gewijzigd.', 503);
        }
      }
      if (n.waarde.soort !== 'aanbieder') heeftSleutel = false;
      const nieuw: DienstRij = {
        ...n.waarde, aan: false, heeftSleutel, beheerder: beheerderNaam(auth), bijgewerktOp: Date.now(), eigenaarUserId: auth.user.id,
      };
      // Увімкненим лишається лише рушій, у якого не змінилося, куди йде текст, і ключ не замінено.
      if (oud?.aan && akkoordSleutel(oud) === akkoordSleutel(nieuw) && !sleutel && dienstKlaar({ ...nieuw, aan: true })) nieuw.aan = true;
      await opslag.bewaar(nieuw);
      cache = null;
      await deps.audit(auth.user.id, 'owner.ai.dienst_motor.bewaar', 'success', { id: nieuw.id, soort: nieuw.soort, aanbieder: nieuw.aanbieder, host: nieuw.url ? new URL(nieuw.url).hostname : undefined, sleutelVervangen: Boolean(sleutel), aan: nieuw.aan });
      if (oud?.aan && !nieuw.aan) {
        await meld(auth.user.id, 'beheer.ai_motor', `Спільний рушій «${nieuw.naam}» вимкнено після зміни / Gedeelde motor «${nieuw.naam}» uitgezet na wijziging`,
          'Ви змінили, куди йде текст (постачальника, адресу, модель або ключ). Рушій вимкнено, а згоди користувачів скинуто: увімкніть його знову, коли перевірите. / U wijzigde waar de tekst heen gaat. De motor is uitgezet en de akkoorden zijn vervallen: zet hem weer aan na controle.',
          '/agenten#tech').catch(() => undefined);
      }
      return json(await overzicht());
    }],

    'POST /api/owner/ai-dienst-motoren/zet': [async (ctx: Ctx) => {
      const g = await eigenaar(ctx); if (g.fout) return g.fout;
      const auth = g.auth!;
      const b = lichaam(ctx.body);
      const id = String(b.id || '');
      if (typeof b.aan !== 'boolean') return weiger('DIENST_INVOER_ONGELDIG', 'Некоректний запит.', 'Ongeldig verzoek.');
      const rij = (await opslag.lijst()).find((r) => r.id === id);
      if (!rij) return weiger('DIENST_NIET_GEVONDEN', 'Такого рушія немає.', 'Deze motor bestaat niet.', 404);
      if (b.aan) {
        // Увімкнення відкриває рушій усім користувачам — лише з підтвердженням passkey і лише готовий рушій.
        if (!dienstKlaar({ ...rij, aan: true })) return weiger('DIENST_NIET_KLAAR', 'Спершу додайте ключ постачальника: без нього рушій нічого не обробить.', 'Voeg eerst de sleutel van de aanbieder toe: zonder sleutel verwerkt de motor niets.');
        const su = await stapOp(ctx, auth); if (su) return su;
      }
      await opslag.bewaar({ ...rij, aan: b.aan, beheerder: beheerderNaam(auth), bijgewerktOp: Date.now() });
      cache = null;
      await deps.audit(auth.user.id, 'owner.ai.dienst_motor.zet', 'success', { id, aan: b.aan });
      await meld(auth.user.id, 'beheer.ai_motor',
        b.aan ? `Спільний рушій «${rij.naam}» увімкнено для всіх / Gedeelde motor «${rij.naam}» aangezet voor iedereen` : `Спільний рушій «${rij.naam}» вимкнено / Gedeelde motor «${rij.naam}» uitgezet`,
        b.aan
          ? `Користувачі побачать його в пошті серед рушіїв ШІ й зможуть користуватися після власної згоди, не більше ${rij.limietPerDag} запитів на людину на день. ${dienstRisicos(rij)[0]} / Gebruikers zien hem in de post en kunnen hem na eigen akkoord gebruiken, hoogstens ${rij.limietPerDag} verzoeken per persoon per dag.`
          : 'Запити користувачів цим рушієм одразу відхиляються; їхні особисті ключі й локальний ШІ працюють далі. / Verzoeken via deze motor worden meteen geweigerd; persoonlijke sleutels en lokale AI werken door.',
        '/agenten#tech').catch(() => undefined);
      return json(await overzicht());
    }],

    // Перевірка зв'язку: надсилається лише фіксоване тестове речення, ніколи текст користувача.
    'POST /api/owner/ai-dienst-motoren/test': [async (ctx: Ctx) => {
      const g = await eigenaar(ctx); if (g.fout) return g.fout;
      const auth = g.auth!;
      const rl = await rateLimit(`ai-dienst-test:${auth.user.id}`, 20, 10 * 60);
      if (!rl.ok) return error('RATE_LIMITED', 429);
      const rij = (await opslag.lijst()).find((r) => r.id === String(lichaam(ctx.body).id || ''));
      if (!rij) return weiger('DIENST_NIET_GEVONDEN', 'Такого рушія немає.', 'Deze motor bestaat niet.', 404);
      const fetchFn = deps.fetch ?? fetch;
      const begin = Date.now();
      let ok = false; let status = 0; let voorbeeld = '';
      if (rij.soort === 'libretranslate') {
        const r = await vertaalLibre(fetchFn, rij, [TEST_ZIN], 'uk');
        ok = r.ok; status = r.ok ? 200 : r.status; if (r.ok) voorbeeld = r.waarde.vertaald[0].slice(0, 200);
      } else if (rij.soort === 'ollama') {
        const r = await vraagOllama(fetchFn, rij, 'Respond with valid JSON only.', `Translate to Ukrainian and return JSON {"t":"..."}: ${TEST_ZIN}`, 120);
        ok = r.ok; status = r.ok ? 200 : r.status; if (r.ok) voorbeeld = r.waarde.slice(0, 200);
      } else {
        const { testAanbiederSleutel } = await import('./ai-vertaling-routes');
        const r = await testAanbiederSleutel(rij, TEST_ZIN);
        ok = r.ok; status = r.status; voorbeeld = r.voorbeeld;
      }
      await deps.audit(auth.user.id, 'owner.ai.dienst_motor.test', ok ? 'success' : 'rejected', { id: rij.id, status });
      return json({ ok: true, geslaagd: ok, status, ms: Date.now() - begin, voorbeeld });
    }],

    'POST /api/owner/ai-dienst-motoren/verwijder': [async (ctx: Ctx) => {
      const g = await eigenaar(ctx); if (g.fout) return g.fout;
      const auth = g.auth!;
      const id = String(lichaam(ctx.body).id || '');
      const rij = (await opslag.lijst()).find((r) => r.id === id);
      if (!rij) return weiger('DIENST_NIET_GEVONDEN', 'Такого рушія немає.', 'Deze motor bestaat niet.', 404);
      const su = await stapOp(ctx, auth); if (su) return su;
      await opslag.verwijder(id);
      cache = null;
      // Ключ спільного рушія без рушія нікому не потрібен: прибираємо його зі сховища, щоб не лежав зайвий секрет.
      if (rij.heeftSleutel) await sleutelWisser(rij.eigenaarUserId, gedeeldeSleutelNaam(id)).catch(() => undefined);
      await deps.audit(auth.user.id, 'owner.ai.dienst_motor.verwijder', 'success', { id });
      await meld(auth.user.id, 'beheer.ai_motor', `Спільний рушій «${rij.naam}» прибрано / Gedeelde motor «${rij.naam}» verwijderd`,
        'Рушій зник зі списку в пошті, його ключ прибрано зі «Сховища ключів». Лічильник використання за минулі дні лишається. / De motor is uit de lijst in de post, de sleutel is uit de «Sleutelkluis» gehaald. De gebruiksteller van eerdere dagen blijft.',
        '/agenten#tech').catch(() => undefined);
      return json(await overzicht());
    }],
  };
}

export { gebruikSleutelDienst };
