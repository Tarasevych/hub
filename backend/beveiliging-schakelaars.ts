// «Захист» (/diagnostiek): drie beschermingen die tot nu toe alleen met SSH/root aan konden, nu met één beslissing van de eigenaar.
//
//   auth-poort     anoniem 2xx buiten PUBLIEKE_ROUTES → 401        (server/platform/auth-poort.ts, schaduw: app.rls_audit 'anoniem-2xx')
//   opa-afdwingen  beheer alleen in een actief technisch profiel, OPA fail-closed (backend/beleid.ts, schaduw: app.beleid_schaduw)
//   rls            RLS afdwingen voor mijnruimte_app                (migraties 0004/0007/0033, schaduw: app.rls_audit per tabel)
//
// Per bescherming: stand (uit / schaduw / aan), gereedheid (automatische controles op de echte database en dienst), «Увімкнути» en
// «Вимкнути». Regels (alles hier afgedwongen, getest in tests/eenheid/beveiliging-schakelaars.test.ts):
//  - lezen: de eigenaar, of iemand met diagnose.lezen in een actief technisch profiel;
//  - aanzetten: ALLEEN de eigenaar, in een actief technisch profiel van dit tabblad, met passkey (step-up, eenmalig verbruikt), met een
//    reden, en alleen als alle blokkerende controles op dat moment slagen (de server controleert opnieuw, de browser beslist niets);
//  - uitzetten: de eigenaar, meteen, zonder passkey en zonder technisch profiel (een noodrem moet altijd werken). Deze routes hangen
//    daarom NIET achter afdwingAdmin: ook als OPA stuk is, kan de eigenaar het afdwingen uitzetten;
//  - zekering: 10 minuten na het aanzetten kijkt de bewaker (hoogstens elke 15 s, na een antwoord) naar pieken in 5xx, 401 van de poort,
//    «OPA onbereikbaar», 403 of RLS-fouten en zet de bescherming dan zelf uit, met journaalregel en melding aan de eigenaar;
//  - omgeving gaat voor (AUTH_POORT_AFDWINGEN / OPA_AFDWINGEN = 1|0) en het root-bestand voor OPA ("beheer-alleen-tech": true);
//    de kaart toont dat als «примусово»;
//  - alles in het beheerjournaal met reden; geen geheimen in antwoorden of logboek;
//  - RLS zonder DATABASE_URL_APP: knop «Створити роль застосунку» start de vaste root-dienst mijn-ruimte-db-rollen.service
//    (polkit: alleen «start» van die naam). Die voert db-rollen-instellen.sh instellen-als-nodig uit (rollen + wachtwoorden +
//    variabelen in /etc/mijn-ruimte/geheimen.env, herstart, gezondheidscontrole, bij een fout alles terug).
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { appRolActief, getPool } from '../server/platform/pg';
import { isPubliek, poortMelderActief } from '../server/platform/auth-poort';
import { envGeforceerd, isSchakelaar, schakelaarLokaal, schakelaarsVerversen, schakelaarTabel, type SchakelaarSleutel, SCHAKELAARS } from '../server/platform/schakelaars';
import { registreerBewaker, som } from '../server/platform/antwoord-teller';
import { afdwingenBron, DOEL_TECH, schaduwAan } from './beleid';
import { schrijfBeheerAudit } from './audit-gebeurtenis';
import { meld } from './melder';
import { passkeyStapOpGeldig, stapOpVerbruiken, type StapOpAuth } from './stap-op';
import { actieveActivatie, heeftTechMogelijkheid, isEigenaar, TAB_RE } from './tech-profiel';

const sys = () => getPool('systeem');
export const BEWAKING_MS = 10 * 60 * 1000;
export const UREN_STANDAARD = 24;
const urenVan = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 && n <= 168 ? n : UREN_STANDAARD; };

export type Stand = 'uit' | 'schaduw' | 'aan';
export type Controle = { id: string; ok: boolean; uk: string; nl: string; detail?: string; info?: boolean; lijst?: Array<{ naam: string; aantal: number }> };
export type Kaart = {
  sleutel: SchakelaarSleutel; stand: Stand; aan: boolean; bron: 'site' | 'env' | 'root'; geforceerd: 'aan' | 'uit' | null;
  klaar: boolean; controles: Controle[]; uren: number;
  laatst: { op: number; door: string; reden: string } | null; bewakingTot: number | null; automatischUit: { op: number; reden: string } | null;
};
type Rij = { sleutel: string; stand: string; gewijzigd_op: Date; door_email: string | null; reden: string; bewaking_tot: Date | null; basis: Record<string, number> | null; automatisch_uit_op: Date | null; automatisch_uit_reden: string; door_id: string | null };

const c = (id: string, ok: boolean, uk: string, nl: string, extra: Partial<Controle> = {}): Controle => ({ id, ok, uk, nl, ...extra });
/** Klaar = alle blokkerende controles slagen (info-controles tellen niet mee). Puur. */
export const isKlaar = (controles: Controle[]) => controles.every((x) => x.info || x.ok);

// ------------------------------------------------------------------------------------------------ zuivere beoordelingen (getest)
type AuditRij = { route: string; tbl: string; actie: string; aantal: number };
/** Toegangspoort: anoniem 2xx buiten de allowlist in de laatste N uur (bron: app.rls_audit 'anoniem-2xx'). */
export function poortControles(rijen: AuditRij[], melderActief: boolean, env: 'aan' | 'uit' | null): Controle[] {
  const anoniem = rijen.filter((r) => r.actie === 'anoniem-2xx' && !isPubliek(r.route));
  return [
    c('schaduw', melderActief, 'Тіньовий журнал працює: кожна анонімна відповідь 2xx поза списком публічних записується', 'Schaduwlogboek loopt: elk anoniem 2xx-antwoord buiten de publieke lijst wordt geteld'),
    c('anoniem-2xx', anoniem.length === 0, anoniem.length ? `Анонімні 2xx поза allowlist: ${anoniem.length} маршрут(и) — після увімкнення вони отримають 401` : 'Жодної анонімної відповіді 2xx поза allowlist',
      anoniem.length ? `Anonieme 2xx buiten de allowlist: ${anoniem.length} route(s) — die krijgen na het aanzetten 401` : 'Geen enkel anoniem 2xx-antwoord buiten de allowlist',
      { lijst: anoniem.map((r) => ({ naam: r.route, aantal: r.aantal })) }),
    c('env', env !== 'uit', env === 'uit' ? 'AUTH_POORT_AFDWINGEN=0 у середовищі: примусово вимкнено' : 'Середовище не блокує вмикання', env === 'uit' ? 'AUTH_POORT_AFDWINGEN=0 in de omgeving: geforceerd uit' : 'De omgeving blokkeert het aanzetten niet'),
  ];
}

type SchaduwRij = { actie: string; uitkomst: string; reden: string; aantal: number };
/** OPA: gezond, schaduw met gegevens, geen verschil, niets dat geweigerd zou worden; eigen techprofiel mist niets. Puur. */
export function opaControles(a: { gezond: boolean; schaduw: boolean; rijen: SchaduwRij[]; env: 'aan' | 'uit' | null; tech: { actief: boolean; mogelijkheden: readonly string[] } | null }): Controle[] {
  const totaal = a.rijen.reduce((s, r) => s + r.aantal, 0);
  const verschil = a.rijen.filter((r) => r.uitkomst === 'verschil');
  const weiger = a.rijen.filter((r) => r.uitkomst === 'doel-weigert' || r.uitkomst === 'onbereikbaar');
  const perActie = new Map<string, number>();
  for (const r of weiger) perActie.set(r.actie, (perActie.get(r.actie) || 0) + r.aantal);
  const nodig = [...new Set(Object.values(DOEL_TECH).filter(Boolean))];
  const mist = a.tech ? nodig.filter((m) => !a.tech!.mogelijkheden.includes(m)) : nodig;
  return [
    c('opa-gezond', a.gezond, a.gezond ? 'OPA відповідає (127.0.0.1:8181)' : 'OPA не відповідає — з fail-closed адмінку буде закрито', a.gezond ? 'OPA antwoordt (127.0.0.1:8181)' : 'OPA antwoordt niet — met fail-closed gaat het beheer dicht'),
    c('schaduw', a.schaduw && totaal > 0, !a.schaduw ? 'Тіньовий режим вимкнено (OPA_SCHADUW=uit): немає даних' : totaal ? `Тіньові рішення за період: ${totaal}` : 'За період немає жодного тіньового рішення — оцінити неможливо',
      !a.schaduw ? 'Schaduw uit (OPA_SCHADUW=uit): geen gegevens' : totaal ? `Schaduwbesluiten in de periode: ${totaal}` : 'Geen schaduwbesluiten in de periode — niet te beoordelen'),
    c('verschil', verschil.length === 0, verschil.length ? `Розбіжність застосунку й OPA: ${verschil.reduce((s, r) => s + r.aantal, 0)}` : 'Розбіжностей застосунку й OPA немає', verschil.length ? `Verschil tussen app en OPA: ${verschil.reduce((s, r) => s + r.aantal, 0)}` : 'Geen verschil tussen app en OPA',
      { lijst: verschil.map((r) => ({ naam: `${r.actie} · ${r.reden || '—'}`, aantal: r.aantal })) }),
    c('weigeringen', weiger.length === 0, weiger.length ? `Було б відмовлено: ${[...perActie.values()].reduce((s, n) => s + n, 0)} разів (${perActie.size} дій)` : 'Жодної відмови, якби правило вже діяло',
      weiger.length ? `Zou geweigerd zijn: ${[...perActie.values()].reduce((s, n) => s + n, 0)} keer (${perActie.size} acties)` : 'Geen enkele weigering als de regel al gold',
      { lijst: [...perActie.entries()].map(([naam, aantal]) => ({ naam, aantal })) }),
    c('techprofiel', !!a.tech?.actief, a.tech?.actief ? 'Ви зараз у технічному профілі цієї вкладки' : 'Активуйте технічний профіль у цій вкладці', a.tech?.actief ? 'U bent nu in een technisch profiel in dit tabblad' : 'Activeer een technisch profiel in dit tabblad'),
    c('mogelijkheden', mist.length === 0, mist.length ? `Вашому профілю бракує: ${mist.join(', ')} — ці розділи адмінки будуть недоступні` : 'Ваш профіль має всі можливості адмінки', mist.length ? `Uw profiel mist: ${mist.join(', ')} — die beheeronderdelen worden onbereikbaar` : 'Uw profiel heeft alle beheermogelijkheden', { info: true }),
    c('env', a.env !== 'uit', a.env === 'uit' ? 'OPA_AFDWINGEN=0 у середовищі: примусово вимкнено' : 'Середовище не блокує вмикання', a.env === 'uit' ? 'OPA_AFDWINGEN=0 in de omgeving: geforceerd uit' : 'De omgeving blokkeert het aanzetten niet'),
  ];
}

export type TabelStand = { tabel: string; rls: boolean; policies: number };
/** RLS: rol, verbinding, policy's op alle tabellen met gebruikersgegevens, isolatieproef, audit leeg. Puur. */
export function rlsControles(a: {
  appUrl: boolean; rol: { bestaat: boolean; login: boolean; bypass: boolean; superuser: boolean } | null; verbinding: { ok: boolean; rol: string; bypass: boolean } | null;
  tabellen: TabelStand[]; proef: { ok: boolean; detail: string } | null; audit: AuditRij[]; installatie: { tijd: string; ok: boolean; code: string } | null;
}): Controle[] {
  const r = a.rol;
  const rolOk = !!r && r.bestaat && r.login && !r.bypass && !r.superuser;
  const zonder = a.tabellen.filter((t) => !t.rls || t.policies < 1);
  const weiger = a.audit.filter((x) => x.actie !== 'anoniem-2xx');
  return [
    c('app-url', a.appUrl, a.appUrl ? 'DATABASE_URL_APP задано: запити користувачів ідуть через роль mijnruimte_app' : 'DATABASE_URL_APP не задано — запити йдуть через системну роль, RLS нічого не обмежить. Натисніть «Створити роль застосунку»',
      a.appUrl ? 'DATABASE_URL_APP gezet: verzoeken van gebruikers lopen via mijnruimte_app' : 'DATABASE_URL_APP ontbreekt — verzoeken lopen via de systeemrol, RLS beperkt niets. Klik «Rol van de app maken»',
      a.installatie ? { detail: `${a.installatie.ok ? 'OK' : 'FOUT'} ${a.installatie.code} · ${a.installatie.tijd}` } : {}),
    c('app-rol', rolOk, !r?.bestaat ? 'Роль mijnruimte_app не існує' : rolOk ? 'Роль mijnruimte_app: LOGIN, без BYPASSRLS, не суперкористувач' : `Роль mijnruimte_app має неправильні атрибути (${[!r.login && 'без LOGIN', r.bypass && 'BYPASSRLS', r.superuser && 'SUPERUSER'].filter(Boolean).join(', ')})`,
      !r?.bestaat ? 'Rol mijnruimte_app bestaat niet' : rolOk ? 'Rol mijnruimte_app: LOGIN, zonder BYPASSRLS, geen superuser' : `Rol mijnruimte_app heeft verkeerde attributen (${[!r.login && 'geen LOGIN', r.bypass && 'BYPASSRLS', r.superuser && 'SUPERUSER'].filter(Boolean).join(', ')})`),
    c('verbinding', !!a.verbinding?.ok, a.verbinding?.ok ? 'Підключення застосунку працює як mijnruimte_app' : a.verbinding ? `Підключення застосунку працює як ${a.verbinding.rol}${a.verbinding.bypass ? ' (BYPASSRLS)' : ''}, а не mijnruimte_app` : 'Немає підключення від імені застосунку',
      a.verbinding?.ok ? 'Verbinding van de app werkt als mijnruimte_app' : a.verbinding ? `Verbinding van de app werkt als ${a.verbinding.rol}${a.verbinding.bypass ? ' (BYPASSRLS)' : ''}, niet als mijnruimte_app` : 'Geen verbinding als de app'),
    c('policies', a.tabellen.length > 0 && zonder.length === 0, zonder.length ? `Таблиці з даними користувачів без RLS або політик: ${zonder.length}` : `RLS і політики на всіх ${a.tabellen.length} таблицях з даними користувачів, до яких має доступ застосунок`,
      zonder.length ? `Tabellen met gebruikersgegevens zonder RLS of policy: ${zonder.length}` : `RLS en policy's op alle ${a.tabellen.length} tabellen met gebruikersgegevens die de app mag raken`,
      { lijst: zonder.map((t) => ({ naam: `${t.tabel}${t.rls ? '' : ' (RLS вимкнено / uit)'}`, aantal: t.policies })) }),
    c('isolatie', !!a.proef?.ok, a.proef?.ok ? 'Перевірка ізоляції: застосунок не бачить і не змінює чужих рядків (синтетичні рядки, ROLLBACK)' : `Перевірка ізоляції не пройдена: ${a.proef?.detail || 'не виконувалась'}`,
      a.proef?.ok ? 'Isolatieproef: de app ziet en wijzigt geen rijen van anderen (synthetische rijen, ROLLBACK)' : `Isolatieproef mislukt: ${a.proef?.detail || 'niet uitgevoerd'}`),
    c('audit', weiger.length === 0, weiger.length ? `Тіньовий аудит RLS: ${weiger.reduce((s, x) => s + x.aantal, 0)} запитів було б відхилено` : 'Тіньовий аудит RLS за період порожній: нічого не було б відхилено',
      weiger.length ? `Schaduwaudit RLS: ${weiger.reduce((s, x) => s + x.aantal, 0)} verzoeken zouden geweigerd zijn` : 'Schaduwaudit RLS in de periode leeg: niets zou geweigerd zijn',
      { lijst: weiger.map((x) => ({ naam: `${x.route} · ${x.tbl} · ${x.actie}`, aantal: x.aantal })) }),
  ];
}

/** Zekering: reden om automatisch uit te zetten, of null. `recent` = laatste 2 min, `basis` = 10 min vóór het aanzetten. Puur. */
export function zekeringOordeel(sleutel: SchakelaarSleutel, recent: Record<string, number>, basis: Record<string, number> = {}): string | null {
  const tot = Math.max(1, recent.totaal || 0), btot = Math.max(1, basis.totaal || 0);
  const piek = (soort: string, minAantal: number, minAandeel: number) => (recent[soort] || 0) >= minAantal && (recent[soort] || 0) / tot > Math.max(minAandeel, 3 * ((basis[soort] || 0) / btot));
  if (sleutel === 'auth-poort' && (recent.poort401 || 0) >= 5) return 'poort-401-piek';
  if (sleutel === 'opa-afdwingen' && (recent.opa || 0) >= 3) return 'opa-onbereikbaar';
  if (sleutel === 'opa-afdwingen' && piek('403', 10, 0.10)) return '403-piek';
  if (sleutel === 'rls' && (recent.rls || 0) >= 3) return 'rls-fouten';
  if (piek('5xx', 10, 0.05)) return '5xx-piek';
  return null;
}
const ZEKERING_TEKST: Record<string, [string, string]> = {
  'poort-401-piek': ['сплеск 401 від шлюзу автентифікації', 'piek in 401 van de toegangspoort'],
  'opa-onbereikbaar': ['OPA не відповідає (fail-closed закрив адмінку)', 'OPA antwoordt niet (fail-closed sloot het beheer)'],
  '403-piek': ['сплеск відмов 403', 'piek in 403-weigeringen'],
  'rls-fouten': ['помилки RLS у запитах', 'RLS-fouten in verzoeken'],
  '5xx-piek': ['сплеск помилок 5xx', 'piek in 5xx-fouten'],
};

// ------------------------------------------------------------------------------------------------ gegevens van de echte dienst
const NAAM: Record<SchakelaarSleutel, [string, string]> = {
  'auth-poort': ['Шлюз автентифікації (AUTH_POORT_AFDWINGEN)', 'Toegangspoort (AUTH_POORT_AFDWINGEN)'],
  'opa-afdwingen': ['OPA fail-closed + «адмінка лише в тех. профілі»', 'OPA fail-closed + «beheer alleen in technisch profiel»'],
  rls: ['RLS через роль застосунку', 'RLS via de rol van de app'],
};
async function auditRijen(uren: number): Promise<AuditRij[]> {
  try {
    return ((await sys().query(`SELECT route, tbl, actie, aantal FROM app.rls_audit WHERE laatst > now() - make_interval(hours => $1) ORDER BY aantal DESC LIMIT 200`, [uren])).rows as Array<{ route: string; tbl: string; actie: string; aantal: string }>)
      .map((r) => ({ route: r.route, tbl: r.tbl, actie: r.actie, aantal: Number(r.aantal) }));
  } catch { return []; }
}
async function opaGezond(): Promise<boolean> {
  try { return (await fetch(`${(process.env.OPA_URL || 'http://127.0.0.1:8181').replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(800) })).ok; } catch { return false; }
}
async function schaduwRijen(uren: number): Promise<SchaduwRij[]> {
  try {
    return ((await sys().query(`SELECT actie, uitkomst, reden, aantal FROM app.beleid_schaduw WHERE laatst > now() - make_interval(hours => $1)`, [uren])).rows as Array<{ actie: string; uitkomst: string; reden: string; aantal: string }>)
      .map((r) => ({ actie: r.actie, uitkomst: r.uitkomst, reden: r.reden, aantal: Number(r.aantal) }));
  } catch { return []; }
}
const KOLOMMEN = ['owner_id', 'user_id', 'account_id', 'recipient_user_id', 'eigenaar_id'];
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
/** Tabellen in schema app met een kolom die een account aanwijst en die mijnruimte_app mag raken. */
export async function rlsTabellen(): Promise<Array<TabelStand & { kolom: string; lezen: boolean }>> {
  const rows = (await sys().query(`
    SELECT c.relname AS tabel, c.relrowsecurity AS rls, (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policies,
           min(a.attname) AS kolom, has_table_privilege('mijnruimte_app', c.oid, 'SELECT') AS lezen
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'app'
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attname = ANY ($1::text[])
     WHERE c.relkind IN ('r', 'p')
       AND (has_table_privilege('mijnruimte_app', c.oid, 'SELECT') OR has_table_privilege('mijnruimte_app', c.oid, 'INSERT')
            OR has_table_privilege('mijnruimte_app', c.oid, 'UPDATE') OR has_table_privilege('mijnruimte_app', c.oid, 'DELETE'))
     GROUP BY c.oid, c.relname, c.relrowsecurity ORDER BY c.relname`, [KOLOMMEN])).rows as Array<{ tabel: string; rls: boolean; policies: number; kolom: string; lezen: boolean }>;
  return rows.filter((r) => IDENT.test(r.tabel) && IDENT.test(r.kolom));
}

/**
 * Isolatieproef als mijnruimte_app, in één transactie die ALTIJD terugdraait. app.rls_proef = 'aan' maakt de policy's streng
 * (alsof afdwingen aan stond, alleen in deze transactie). Synthetisch account A schrijft een rij; account B mag die niet zien,
 * wijzigen of wissen, en ziet in geen enkele tabel rijen van een ander. Controle dat de proef echt test: zonder proefmodus
 * (en afdwingen uit) ziet B de rij van A wél.
 */
export async function isolatieProef(tabellen: Array<{ tabel: string; kolom: string; lezen: boolean; rls: boolean }>): Promise<{ ok: boolean; detail: string }> {
  if (!appRolActief()) return { ok: false, detail: 'DATABASE_URL_APP ontbreekt' };
  const client = await getPool('app').connect();
  const A = `rls-proef-a-${randomUUID()}`, B = `rls-proef-b-${randomUUID()}`, id = `rls-proef-${randomUUID()}`;
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = '5s'`);
    const wie = (await client.query('SELECT current_user::text AS rol')).rows[0]?.rol;
    if (wie !== 'mijnruimte_app') return { ok: false, detail: `verbinding is ${wie}, niet mijnruimte_app` };
    const afgedwongen = (await client.query(`SELECT COALESCE((SELECT waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'), 'uit') AS w`)).rows[0]?.w === 'aan';
    await client.query(`SELECT set_config('app.rls_proef', 'aan', true), set_config('app.user_id', $1, true)`, [A]);
    await client.query(`INSERT INTO app.records (tbl, id, data) VALUES ('rls_proef', $1, jsonb_build_object('ownerUserId', $2::text, 'proef', true))`, [id, A]);
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [B]);
    const gezien = (await client.query('SELECT count(*)::int AS n FROM app.records WHERE id = $1', [id])).rows[0]?.n;
    const gewijzigd = (await client.query(`UPDATE app.records SET data = data || '{"gewijzigd":true}'::jsonb WHERE id = $1`, [id])).rowCount;
    const gewist = (await client.query('DELETE FROM app.records WHERE id = $1', [id])).rowCount;
    if (gezien !== 0 || gewijzigd !== 0 || gewist !== 0) return { ok: false, detail: `B zag/wijzigde/wiste de rij van A (${gezien}/${gewijzigd}/${gewist})` };
    const lekken: string[] = [];
    for (const t of tabellen.filter((x) => x.lezen && x.rls)) {
      await client.query('SAVEPOINT t');
      try {
        const r = await client.query(`SELECT 1 FROM app.${t.tabel} WHERE ${t.kolom} IS NOT NULL AND ${t.kolom}::text <> $1 LIMIT 1`, [B]);
        if (r.rowCount) lekken.push(t.tabel);
        await client.query('RELEASE SAVEPOINT t');
      } catch (e) { await client.query('ROLLBACK TO SAVEPOINT t'); lekken.push(`${t.tabel} (${String((e as { code?: string }).code || 'fout')})`); }
    }
    if (lekken.length) return { ok: false, detail: `B ziet rijen van anderen in: ${lekken.slice(0, 8).join(', ')}` };
    if (!afgedwongen) {
      await client.query(`SELECT set_config('app.rls_proef', '', true)`);
      const zonder = (await client.query('SELECT count(*)::int AS n FROM app.records WHERE id = $1', [id])).rows[0]?.n;
      if (zonder !== 1) return { ok: false, detail: 'controle mislukt: zonder proefmodus is de synthetische rij ook onzichtbaar (proef bewijst niets)' };
    }
    return { ok: true, detail: '' };
  } catch (e) {
    return { ok: false, detail: `fout ${String((e as { code?: string }).code || (e as Error).message || '').slice(0, 60)}` };
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

const statusDir = () => process.env.OPDRACHT_STATUS_DIR || '/var/lib/mijn-ruimte-uitrol-status';
async function installatieResultaat(): Promise<{ tijd: string; ok: boolean; code: string } | null> {
  try {
    const j = JSON.parse(await readFile(`${statusDir()}/db-rollen.json`, 'utf8')) as { tijd?: unknown; ok?: unknown; code?: unknown };
    return { tijd: String(j.tijd || '').slice(0, 40), ok: j.ok === true, code: String(j.code || '').replace(/[^A-Z0-9_]/g, '').slice(0, 40) };
  } catch { return null; }
}

async function rijenVan(): Promise<Map<string, Rij>> {
  try { return new Map(((await sys().query('SELECT * FROM app.beveiliging_schakelaars')).rows as Rij[]).map((r) => [r.sleutel, r])); } catch { return new Map(); }
}
async function rlsStand(): Promise<boolean> {
  try { return (await sys().query(`SELECT COALESCE((SELECT waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'), 'uit') AS w`)).rows[0]?.w === 'aan'; } catch { return false; }
}

type Tech = { actief: boolean; mogelijkheden: readonly string[] } | null;
/** Gereedheid + stand van één bescherming. */
export async function kaart(sleutel: SchakelaarSleutel, opties: { uren?: number; tech?: Tech; rij?: Rij } = {}): Promise<Kaart> {
  const uren = urenVan(opties.uren);
  const rij = opties.rij ?? (await rijenVan()).get(sleutel);
  let aan = false, bron: Kaart['bron'] = 'site', schaduw = false, controles: Controle[] = [];
  const geforceerd = envGeforceerd(sleutel);
  if (sleutel === 'auth-poort') {
    aan = geforceerd ? geforceerd === 'aan' : schakelaarTabel('auth-poort'); bron = geforceerd ? 'env' : 'site';
    schaduw = poortMelderActief();
    controles = poortControles(await auditRijen(uren), poortMelderActief(), geforceerd);
  } else if (sleutel === 'opa-afdwingen') {
    const b = await afdwingenBron(); aan = b.aan; bron = b.bron; schaduw = schaduwAan();
    controles = opaControles({ gezond: await opaGezond(), schaduw: schaduwAan(), rijen: await schaduwRijen(uren), env: geforceerd, tech: opties.tech ?? null });
  } else {
    aan = await rlsStand(); schaduw = appRolActief();
    let rol: Parameters<typeof rlsControles>[0]['rol'] = null, verbinding: Parameters<typeof rlsControles>[0]['verbinding'] = null;
    let tabellen: Awaited<ReturnType<typeof rlsTabellen>> = [], proef: { ok: boolean; detail: string } | null = null;
    try {
      const r = (await sys().query(`SELECT rolcanlogin, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'mijnruimte_app'`)).rows[0] as { rolcanlogin: boolean; rolbypassrls: boolean; rolsuper: boolean } | undefined;
      rol = r ? { bestaat: true, login: r.rolcanlogin, bypass: r.rolbypassrls, superuser: r.rolsuper } : { bestaat: false, login: false, bypass: false, superuser: false };
    } catch { rol = null; }
    if (appRolActief()) {
      try {
        const v = (await getPool('app').query(`SELECT current_user::text AS rol, (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user) AS bypass`)).rows[0] as { rol: string; bypass: boolean };
        verbinding = { ok: v.rol === 'mijnruimte_app' && !v.bypass, rol: v.rol, bypass: !!v.bypass };
      } catch { verbinding = { ok: false, rol: '?', bypass: false }; }
    }
    if (rol?.bestaat) {
      try { tabellen = await rlsTabellen(); } catch { tabellen = []; }
      proef = verbinding?.ok ? await isolatieProef(tabellen) : null;
    }
    controles = rlsControles({ appUrl: appRolActief(), rol, verbinding, tabellen, proef, audit: await auditRijen(uren), installatie: await installatieResultaat() });
  }
  return {
    sleutel, aan, bron, geforceerd, uren, controles, klaar: isKlaar(controles),
    stand: aan ? 'aan' : schaduw ? 'schaduw' : 'uit',
    laatst: rij ? { op: new Date(rij.gewijzigd_op).getTime(), door: String(rij.door_email || ''), reden: String(rij.reden || '') } : null,
    bewakingTot: rij?.bewaking_tot && new Date(rij.bewaking_tot).getTime() > Date.now() ? new Date(rij.bewaking_tot).getTime() : null,
    automatischUit: rij?.automatisch_uit_op ? { op: new Date(rij.automatisch_uit_op).getTime(), reden: String(rij.automatisch_uit_reden || '') } : null,
  };
}

// ------------------------------------------------------------------------------------------------ schakelen + zekering
const bewaakt = new Map<SchakelaarSleutel, { tot: number; basis: Record<string, number>; doorId: string }>();
let bewakingGeladen = false;

async function zetStand(sleutel: SchakelaarSleutel, aan: boolean, door: { id: string | null; email: string }, reden: string, extra: { bewakingTot?: number | null; basis?: Record<string, number>; automatisch?: string } = {}) {
  const client = await sys().connect();
  try {
    await client.query('BEGIN');
    if (sleutel === 'rls') await client.query('SELECT app.rls_afdwingen_zetten($1)', [aan ? 'aan' : 'uit']);
    await client.query(`UPDATE app.beveiliging_schakelaars SET stand = $2, gewijzigd_op = now(), door_id = $3, door_email = $4, reden = $5,
        bewaking_tot = $6, basis = $7::jsonb, automatisch_uit_op = CASE WHEN $8::text <> '' THEN now() WHEN $2 = 'aan' THEN NULL ELSE automatisch_uit_op END,
        automatisch_uit_reden = CASE WHEN $8::text <> '' THEN $8 WHEN $2 = 'aan' THEN '' ELSE automatisch_uit_reden END
      WHERE sleutel = $1`, [sleutel, aan ? 'aan' : 'uit', door.id, door.email.slice(0, 200), reden.slice(0, 300), extra.bewakingTot ? new Date(extra.bewakingTot) : null, JSON.stringify(extra.basis || {}), extra.automatisch || '']);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => undefined); throw e; } finally { client.release(); }
  if (sleutel !== 'rls') schakelaarLokaal(sleutel, aan);
  if (aan && extra.bewakingTot) bewaakt.set(sleutel, { tot: extra.bewakingTot, basis: extra.basis || {}, doorId: door.id || '' });
  else bewaakt.delete(sleutel);
}

/** Aanzetten (na alle controles van de route). Basis voor de zekering = de 10 minuten ervoor. */
export async function aanzetten(sleutel: SchakelaarSleutel, door: { id: string; email: string }, reden: string, nu = Date.now()) {
  const b = som(nu - BEWAKING_MS, nu);
  await zetStand(sleutel, true, door, reden, { bewakingTot: nu + BEWAKING_MS, basis: { totaal: b.totaal, '5xx': b['5xx'], '403': b['403'] } });
  await schrijfBeheerAudit({ actor: door, doel: { soort: 'beveiliging', naam: sleutel }, actie: 'admin.beveiliging.aan', resultaat: 'success', reden, voor: { stand: 'uit' }, na: { stand: 'aan', bewakingMinuten: BEWAKING_MS / 60000 } });
}
export async function uitzetten(sleutel: SchakelaarSleutel, door: { id: string | null; email: string }, reden: string, automatisch = '') {
  await zetStand(sleutel, false, door, reden, { automatisch });
  await schrijfBeheerAudit({ actor: door.id ? { id: door.id, email: door.email } : null, doel: { soort: 'beveiliging', naam: sleutel }, actie: automatisch ? 'admin.beveiliging.zekering' : 'admin.beveiliging.uit', resultaat: 'success', reden, voor: { stand: 'aan' }, na: { stand: 'uit', ...(automatisch ? { automatisch } : {}) } });
}

/** De bewaker: zet een bescherming in haar eerste 10 minuten terug uit bij een piek. Exporteert de uitkomst voor tests. */
export async function zekeringControleren(nu = Date.now()): Promise<Array<{ sleutel: SchakelaarSleutel; reden: string }>> {
  if (!bewakingGeladen) {
    bewakingGeladen = true;
    for (const r of (await rijenVan()).values()) {
      if (isSchakelaar(r.sleutel) && r.stand === 'aan' && r.bewaking_tot && new Date(r.bewaking_tot).getTime() > nu && !bewaakt.has(r.sleutel)) bewaakt.set(r.sleutel, { tot: new Date(r.bewaking_tot).getTime(), basis: r.basis || {}, doorId: r.door_id || '' });
    }
  }
  const uit: Array<{ sleutel: SchakelaarSleutel; reden: string }> = [];
  for (const [sleutel, b] of [...bewaakt.entries()]) {
    if (b.tot <= nu) { bewaakt.delete(sleutel); continue; }
    const reden = zekeringOordeel(sleutel, som(nu - 120_000, nu), b.basis);
    if (!reden) continue;
    const [uk, nl] = ZEKERING_TEKST[reden] || [reden, reden];
    try {
      await uitzetten(sleutel, { id: null, email: 'zekering' }, `automatisch: ${nl}`, reden);
      uit.push({ sleutel, reden });
      console.warn(`[beveiliging] zekering: ${sleutel} automatisch uitgezet (${reden})`);
      if (b.doorId) await meld(b.doorId, 'beveiliging.zekering', `Захист «${NAAM[sleutel][0]}» автоматично вимкнено`, `Протягом 10 хв після увімкнення: ${uk}. Сайт повернувся до попереднього стану. Перевірте «Діагностика → Захист». / ${NAAM[sleutel][1]} automatisch uitgezet: ${nl}.`, '/diagnostiek');
    } catch (e) { console.error('[beveiliging] zekering kon niet uitzetten:', (e as Error).message); }
  }
  return uit;
}
export const _bewakingReset = () => { bewaakt.clear(); bewakingGeladen = false; };

// ------------------------------------------------------------------------------------------------ root-dienst voor de app-rol
type Runner = (args: string[]) => Promise<{ code: number; stderr: string }>;
let runner: Runner = (args) => new Promise((resolve) => {
  execFile('/usr/bin/systemctl', args, { timeout: 15_000, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' }, maxBuffer: 64 * 1024 }, (err, _o, stderr) => {
    resolve({ code: err ? (typeof (err as { code?: unknown }).code === 'number' ? Number((err as { code: number }).code) : 1) : 0, stderr: String(stderr || '').slice(0, 300) });
  });
});
export const _zetRunner = (r: Runner) => { runner = r; };
export const DB_ROLLEN_UNIT = 'mijn-ruimte-db-rollen.service';

// ------------------------------------------------------------------------------------------------ routes
type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string; session?: { id: string; createdAt: number } | null; tabSession?: { id: string; createdAt: number } | null };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
const lijf = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
const redenVan = (v: unknown) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);

export function beveiligingRoutes(deps: { requireSession: RequireSession }): Record<string, RouterMiddleware[]> {
  registreerBewaker((nu) => zekeringControleren(nu));
  if (process.env.DATABASE_URL_SYSTEM || process.env.DATABASE_URL) void schakelaarsVerversen();

  type Opts = { lezen?: boolean; tech?: boolean; passkey?: boolean };
  const poort = (o: Opts, run: (auth: SessionOk, b: Record<string, unknown>, tech: Tech) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (auth.service !== 'admin') return error('ADMIN_SERVICE_REQUIRED', 403);
    const b = lijf(ctx.body);
    const tab = typeof b.tabContext === 'string' && TAB_RE.test(b.tabContext) ? b.tabContext : '';
    const eigenaar = isEigenaar(auth.user);
    const actor = { id: auth.user.id, email: auth.user.email };
    const sleutel = isSchakelaar(b.sleutel) ? b.sleutel : 'alle';
    if (!eigenaar) {
      if (o.lezen && tab && (await heeftTechMogelijkheid(auth.user.id, tab, 'diagnose.lezen'))) return json(await run(auth, b, null));
      await schrijfBeheerAudit({ actor, doel: { soort: 'beveiliging', naam: sleutel }, actie: 'admin.beveiliging.geweigerd', resultaat: 'denied', reden: 'OWNER_REQUIRED' });
      return error('OWNER_REQUIRED', 403);
    }
    const act = tab ? await actieveActivatie(auth.user.id, tab).catch(() => null) : null;
    const tech: Tech = act ? { actief: true, mogelijkheden: act.mogelijkheden } : { actief: false, mogelijkheden: [] };
    if (o.tech && !act) {
      await schrijfBeheerAudit({ actor, doel: { soort: 'beveiliging', naam: sleutel }, actie: 'admin.beveiliging.geweigerd', resultaat: 'denied', reden: 'TECH_PROFIEL_VEREIST' });
      return error('TECH_PROFIEL_VEREIST', 403);
    }
    if (o.passkey && !(await passkeyStapOpGeldig(auth as StapOpAuth))) {
      await schrijfBeheerAudit({ actor, doel: { soort: 'beveiliging', naam: sleutel }, actie: 'admin.beveiliging.geweigerd', resultaat: 'denied', reden: 'STEP_UP_REQUIRED' });
      return json({ error: 'STEP_UP_REQUIRED', reasonCode: 'STEP_UP_REQUIRED', methods: ['passkey'], maxAgeSeconds: 300 }, 403);
    }
    try {
      const uit = await run(auth, b, tech);
      if (o.passkey) await stapOpVerbruiken(auth as StapOpAuth); // één bevestiging = één schakeling
      return json(uit);
    } catch (e) {
      const code = (e as Error).message || 'BEVEILIGING_FOUT';
      if (code.startsWith('NIET_KLAAR:')) return json({ error: 'NIET_KLAAR', mislukt: code.slice(11).split(',') }, 409);
      if (/^[A-Z][A-Z0-9_]{2,60}$/.test(code)) return error(code, code === 'GEFORCEERD' ? 409 : 400);
      console.error('[beveiliging]', code); return error('BEVEILIGING_FOUT', 500);
    }
  }) as RouterMiddleware;

  return {
    'POST /api/owner/beveiliging/stand': [poort({ lezen: true }, async (_a, b, tech) => ({
      ok: true, kaarten: await Promise.all(SCHAKELAARS.map((s) => kaart(s, { uren: b.uren as number, tech }))), bewakingMinuten: BEWAKING_MS / 60000,
    }))],
    'POST /api/owner/beveiliging/aanzetten': [poort({ tech: true, passkey: true }, async (auth, b, tech) => {
      if (!isSchakelaar(b.sleutel)) throw new Error('SCHAKELAAR_ONBEKEND');
      const reden = redenVan(b.reden);
      if (reden.length < 3) throw new Error('REDEN_VEREIST');
      const k = await kaart(b.sleutel, { uren: b.uren as number, tech });
      if (k.geforceerd || k.bron === 'root') throw new Error('GEFORCEERD');
      if (k.aan) return { ok: true, kaart: k, al: true };
      if (!k.klaar) {
        await schrijfBeheerAudit({ actor: { id: auth.user.id, email: auth.user.email }, doel: { soort: 'beveiliging', naam: b.sleutel }, actie: 'admin.beveiliging.geweigerd', resultaat: 'denied', reden: 'NIET_KLAAR', details: { mislukt: k.controles.filter((x) => !x.info && !x.ok).map((x) => x.id) } });
        throw new Error(`NIET_KLAAR:${k.controles.filter((x) => !x.info && !x.ok).map((x) => x.id).join(',')}`);
      }
      await aanzetten(b.sleutel, { id: auth.user.id, email: String(auth.user.email || '') }, reden);
      return { ok: true, kaart: await kaart(b.sleutel, { uren: b.uren as number, tech }) };
    })],
    'POST /api/owner/beveiliging/uitzetten': [poort({}, async (auth, b, tech) => {
      if (!isSchakelaar(b.sleutel)) throw new Error('SCHAKELAAR_ONBEKEND');
      const reden = redenVan(b.reden) || 'вимкнено власником / uitgezet door de eigenaar';
      await uitzetten(b.sleutel, { id: auth.user.id, email: String(auth.user.email || '') }, reden);
      return { ok: true, kaart: await kaart(b.sleutel, { tech }) };
    })],
    'POST /api/owner/beveiliging/app-rol-maken': [poort({ tech: true, passkey: true }, async (auth, b) => {
      const reden = redenVan(b.reden) || 'DATABASE_URL_APP створити / aanmaken';
      if (appRolActief()) return { ok: true, al: true };
      const r = await runner(['start', '--no-ask-password', '--no-block', DB_ROLLEN_UNIT]);
      await schrijfBeheerAudit({ actor: { id: auth.user.id, email: auth.user.email }, doel: { soort: 'beveiliging', naam: 'rls' }, actie: 'admin.beveiliging.app_rol', resultaat: r.code === 0 ? 'success' : 'failure', reden, details: { unit: DB_ROLLEN_UNIT, code: r.code } });
      if (r.code !== 0) throw new Error('APP_ROL_START_MISLUKT');
      return { ok: true, gestart: true };
    })],
  };
}
