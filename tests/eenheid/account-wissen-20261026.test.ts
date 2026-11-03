// Блок 4 (26.10): стирання без м’якого вікна, матриця критичних дій, GeheimInvoer.
// Postgres у цьому середовищі немає — реєстр звіряється з міграціями, не з живою базою.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dekking, wisOpdrachten } from '../../shared/account-wissen';
import { googleAlleenVolstaat, KRITIEKE_ACTIES } from '../../shared/kritieke-acties';

const lees = (p: string) => readFileSync(p, 'utf8');
const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean) => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}`); };

/** Прибрати -- і блокові коментарі, не ріжучи всередині лапок. */
function zonderCommentaar(sql: string): string {
  let uit = '';
  let i = 0;
  let q: string | null = null;
  while (i < sql.length) {
    const c = sql[i];
    if (q) {
      uit += c;
      if (c === q) q = null;
      else if (c === '\\' && q !== "'" ) { /* noop */ }
      i += 1;
      continue;
    }
    if (c === "'" || c === '"') { q = c; uit += c; i += 1; continue; }
    if (c === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl < 0 ? sql.length : nl;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const einde = sql.indexOf('*/', i + 2);
      i = einde < 0 ? sql.length : einde + 2;
      continue;
    }
    uit += c;
    i += 1;
  }
  return uit;
}

function kolommenUitLichaam(body: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let d = 0;
  let q: string | null = null;
  for (const c of body) {
    if (q) { buf += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; buf += c; continue; }
    if (c === '(') { d += 1; buf += c; continue; }
    if (c === ')') { d -= 1; buf += c; continue; }
    if (c === ',' && d === 0) { parts.push(buf); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) parts.push(buf);
  const cols: string[] = [];
  for (const part of parts) {
    const s = part.trim();
    if (!s) continue;
    if (/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE)\b/i.test(s)) continue;
    const m = /^([a-z_][a-z0-9_]*)\s+/i.exec(s);
    if (m) cols.push(m[1].toLowerCase());
  }
  return cols;
}

/** CREATE TABLE app|public + ALTER … ADD COLUMN. Імена лише з файлів міграцій. */
function tabellenUitMigraties(): Map<string, Set<string>> {
  const uit = new Map<string, Set<string>>();
  const voeg = (schema: string, tabel: string, cols: string[]) => {
    const sleutel = `${schema}.${tabel}`;
    const set = uit.get(sleutel) || new Set<string>();
    for (const c of cols) set.add(c);
    uit.set(sleutel, set);
  };
  for (const naam of readdirSync('migrations').filter((n) => n.endsWith('.sql')).sort()) {
    const sql = zonderCommentaar(lees(join('migrations', naam)));
    const create = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(app|public)\.([a-z_][a-z0-9_]*)\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = create.exec(sql))) {
      let i = m.index + m[0].length;
      let depth = 1;
      while (i < sql.length && depth) {
        if (sql[i] === '(') depth += 1;
        else if (sql[i] === ')') depth -= 1;
        i += 1;
      }
      voeg(m[1].toLowerCase(), m[2].toLowerCase(), kolommenUitLichaam(sql.slice(m.index + m[0].length, i - 1)));
    }
    const alter = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(app|public)\.([a-z_][a-z0-9_]*)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;
    while ((m = alter.exec(sql))) voeg(m[1].toLowerCase(), m[2].toLowerCase(), [m[3].toLowerCase()]);
  }
  return uit;
}

const deel = (bron: string, van: string, tot: string) => {
  const a = bron.indexOf(van);
  const b = bron.indexOf(tot, a + van.length);
  return a >= 0 && b > a ? bron.slice(a, b) : '';
};

export async function main() {
  const index = lees('backend/index.ts');
  const zelf = deel(index, "'POST /api/account/delete'", "'POST /api/account/recover'");
  const ident = deel(index, "'POST /api/owner/identity/account/delete'", "'POST /api/owner/identity/account/workspaces");
  // INTEG-001 (03.11.2026, besluit eigenaar): zelf verwijderen = 30 dagen herstelbaar, daarna automatisch definitief (opruimen-timer).
  check('zelf verwijderen (account en identiteit) loopt via deleteRecoverably (30 dagen)', zelf.includes('deleteRecoverably') && ident.includes('deleteRecoverably'));
  check('zelf verwijderen wist niet meteen (geen accountMeteenWissen in de routes)', !zelf.includes('accountMeteenWissen') && !ident.includes('accountMeteenWissen'));
  check('власника не стирають і кодове слово лишається', zelf.includes('OWNER_NIET_WISSEN') && ident.includes('OWNER_NIET_WISSEN') && zelf.includes('codewoordEis') && ident.includes('codewoordEis'));
  check('обидва маршрути йдуть через матрицю account-verwijderen', zelf.includes("kritiekStapOp") && zelf.includes("'account-verwijderen'") && ident.includes('kritiekStapOp') && ident.includes("'account-verwijderen'"));
  const beheerd = index.match(/async function deleteManagedUser\([\s\S]*?return publicUser\(next\); \}/)?.[0] || '';
  check('beheerder verwijderen loopt ook via deleteRecoverably (30 dagen, alleen de beheerder zet terug)', beheerd.includes('deleteRecoverably') && beheerd.includes('admin') && !beheerd.includes('accountMeteenWissen'));
  check('deleteRecoverably: 3 aanroepen (zelf, identiteit, beheerder)', (index.match(/await deleteRecoverably(/g) || []).length === 3);
  check('ворота кодового слова не знято', index.includes('CODEWOORD_POORT'));
  check('зворотний Google імпортує googleSuiteStateParts', index.includes("from './google-suite-inrichting'") && index.includes('googleSuiteStateParts') && index.includes('googleSuiteCallbackPost'));

  const del = KRITIEKE_ACTIES['account-verwijderen'];
  const herstel = KRITIEKE_ACTIES.herstelcodes;
  check('матриця: видалення, коди відновлення і кодове слово',
    del.includes('passkey') && del.includes('herstelcode') && del.includes('codewoord')
    && herstel.includes('passkey') && herstel.includes('herstelcode') && herstel.includes('codewoord')
    && KRITIEKE_ACTIES.aanmeldmethode.includes('codewoord') && KRITIEKE_ACTIES['ai-hoog'].includes('passkey'));
  check('свіжого Google недостатньо для критичної дії', googleAlleenVolstaat('account-verwijderen') === false && googleAlleenVolstaat('herstelcodes') === false && googleAlleenVolstaat('aanmeldmethode') === false && googleAlleenVolstaat('ai-hoog') === false && googleAlleenVolstaat('iets-anders') === true);
  const laag = lees('backend/toegangslaag.ts');
  check('зміна методів входу і коди відновлення питають матрицю', laag.includes('kritiekeActie') && laag.includes("'herstelcodes'") && laag.includes("'aanmeldmethode'") && laag.includes('sterkeStapOpFout'));
  check('ШІ високого ризику питає ту саму матрицю', lees('backend/ai-bevestiging-routes.ts').includes("kritiekeActie('ai-hoog')") && lees('backend/ai-bevestiging-routes.ts').includes('sterkeStapOp'));

  const allow = ['src/toegangslaag-panelen.tsx', 'src/BeheerSleutelsWeergave.tsx', 'src/ApiPlatformWeergave.tsx', 'src/agenten/TabExternMcp.tsx', 'src/McpAppsWeergave.tsx', 'src/agenda/Agenda.tsx', 'src/agenda/ICloudVenster.tsx', 'src/extern/ExternBureaublad.tsx', 'src/mail/MailKoppelVenster.tsx', 'src/integraties/Wizard.tsx'];
  const kluis = lees('src/geheimen/Geheimen.tsx');
  check('сховище секретів не з дозволеного списку і йде через GeheimInvoer', !allow.includes('src/geheimen/Geheimen.tsx') && kluis.includes('GeheimInvoer') && kluis.includes("soort='kluis'") && kluis.includes('verborgen') && !kluis.includes("className='gm-geheim-invoer'") && !kluis.includes("type='password'"));
  check('клавіатура не ціль автоматизації', lees('extension/bridge.js').includes("closest('[data-scherm-toetsenbord]')") && lees('src/geheim/GeheimInvoer.tsx').includes("data-scherm-toetsenbord='1'") && lees('src/geheim/SchermToetsenbord.tsx').includes('onPointerDown') && !lees('src/geheim/SchermToetsenbord.tsx').includes('onClick'));
  check('синтетичний pointerdown не друкує', (lees('src/geheim/SchermToetsenbord.tsx').match(/if \(!e\.isTrusted\) return/g) || []).length >= 9);
  const wissenBron = lees('backend/account-wissen.ts');
  check('DELETE реєстру в одній транзакції', wissenBron.includes("client.query('BEGIN')") && wissenBron.includes("client.query('COMMIT')") && wissenBron.includes('ROLLBACK') && wissenBron.includes('client.release()'));
  check('адмінка не обіцяє безстрокове відновлення стертому', lees('src/BeheerConsoleWeergave.tsx').includes('if(retired>0)') && lees('src/BeheerConsoleWeergave.tsx').includes('стерто одразу, відновити не можна'));

  const plan = wisOpdrachten([
    { schema: 'app', tabel: 'mail_afzenders', kolommen: ['user_id', 'owner_id'] },
    { schema: 'app', tabel: 'records', kolommen: ['owner_id'] },
    { schema: 'app', tabel: 'users', kolommen: ['id'] },
    { schema: 'app', tabel: 'audit', kolommen: ['owner_id', 'actor_id'] },
    { schema: 'public', tabel: 'users;drop', kolommen: ['user_id'] },
    { schema: 'pg_catalog', tabel: 'pg_authid', kolommen: ['user_id'] },
    { schema: 'app', tabel: 'impersonatie_sessies', kolommen: ['beheerder_id', 'doel_id', 'beeindigd_door'] },
    { schema: 'app', tabel: 'uitrol_github_instellingen', kolommen: ['eigenaar_id'] },
  ], 'gebruiker-1');
  const sqlVan = (tabel: string) => plan.find((o) => o.sql.includes(tabel))?.sql || '';
  check('план: owner_id важливіший, users/records/audit і сміття пропущені', plan.length === 3 && sqlVan('mail_afzenders') === 'DELETE FROM app.mail_afzenders WHERE owner_id = $1' && !plan.some((o) => /users|records|audit|pg_/.test(o.sql)) && plan.every((o) => o.params[0] === 'gebruiker-1' && o.sql.includes('WHERE')));
  check('додаткові колонки: OR лише для своїх id, eigenaar як text', sqlVan('impersonatie_sessies') === 'DELETE FROM app.impersonatie_sessies WHERE beheerder_id = $1 OR doel_id = $1' && sqlVan('uitrol_github_instellingen') === 'DELETE FROM app.uitrol_github_instellingen WHERE eigenaar_id::text = $1');

  const tabellen = tabellenUitMigraties();
  const open: string[] = [];
  const nietInRegister = new Set(['gemeld_door', 'door_email', 'gebruikersnaam', 'gebruiker', 'author', 'account_email', 'accounts', 'gebruikers', 'voor_gebruikers', 'beheerder_tab', 'aanvrager_tab', 'voorbereider', 'wie']);
  const verdacht = /^(owner_id|user_id|account_id|eigenaar_id|created_by|aanvrager_id|doel_id|beheerder_id|owner_key|actor_id)$|_door$|^door$|^door_/;
  const onbekend: string[] = [];
  for (const [sleutel, cols] of tabellen) {
    const tabel = sleutel.slice(sleutel.indexOf('.') + 1);
    const lijst = [...cols];
    const stand = dekking(tabel, lijst);
    if (stand === 'open') open.push(`${sleutel} [${lijst.filter((c) => /id|door|owner|user|account|eigenaar|created_by/.test(c)).join(',')}]`);
    for (const c of lijst) if (verdacht.test(c) && !nietInRegister.has(c) && stand === 'geen') onbekend.push(`${sleutel}.${c}`);
  }
  check(`реєстр покриває CREATE TABLE з колонкою акаунта (${tabellen.size} таблиць)`, open.length === 0 && onbekend.length === 0 && tabellen.has('app.invites') && tabellen.has('app.records') && dekking('invites', ['created_by']) === 'wissen' && dekking('records', ['owner_id']) === 'uitzondering' && dekking('uitrol_runs', ['goedgekeurd_door']) === 'uitzondering' && dekking('audit', ['owner_id', 'actor_id']) === 'uitzondering');
  if (open.length) console.log('OPEN ' + open.join(' | '));
  if (onbekend.length) console.log('ONBEKEND ' + onbekend.join(' | '));

  const mis = resultaten.filter((r) => !r.ok);
  console.log(`${resultaten.length - mis.length}/${resultaten.length} geslaagd (account-wissen-20261026)`);
  return mis.length ? 1 : 0;
}
