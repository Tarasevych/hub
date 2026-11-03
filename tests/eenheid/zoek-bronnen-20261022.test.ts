// ZOEKEN — BRONNEN EN LEVENSCYCLUS (Z2, 22.10.2026). Met database (PG 16, migraties 0096 + 0100 + 0101), nagebootst GitHub.
//
// Wat deze test vasthoudt:
//   1. De catalogus van de interface wordt GEGENEREERD (scripts/zoek-ui-catalogus.mjs ↔ shared/zoek-ui-knoppen.generated.ts is
//      actueel) en bevat echte elementen: «Шифрування моїх даних», «Повернути на типове місце», «Поштові акаунти», hulp-sleutels; technische
//      elementen alleen voor wie een technisch profiel heeft.
//   2. Geheimen (tokens, wachtwoordregels) komen nooit als tekst in een zoekobject.
//   3. Adapters geven ZoekObjecten met de JUISTE lade (rechten = lade van de aanroep), bron, soort en route.
//   4. Eerste indexering zonder dubbelen; tweede ronde slaat ongewijzigde objecten over; wijziging → bijgewerkt; verwijdering → weg.
//   5. Ontkoppelen van een integratie → verwijderBron; dichte sleutelkluis → uitgesteld met stand «очікує входу», geen fout.
//   6. De cron loopt BEIDE laden van één mens langs (persoonlijk én technisch), elk met zijn eigen rijen; niets kruist.
//   7. De stand per bron is waar: verbonden/niet, aantal geteld, wachtrij, uitleg uk+nl.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';
import { maskeerGeheimen, geheimenIn } from '../../shared/geheim-patronen';
import { UI_ELEMENTEN, UI_ELEMENTEN_VERSIE } from '../../shared/zoek-ui-knoppen.generated';
import { uiCatalogus, uiObjectenVoor, uiZoekObjecten } from '../../backend/zoek/catalogus-ui';
import { mailObject, cloudObject, driveObject, agendaGoogleObject, bordObject, githubRepoObject, githubIssueObject, bijlageObject } from '../../backend/zoek/adapters';
import { standAfleiden, WACHT_SLEUTEL } from '../../backend/zoek/stand';
import { wachttijdMs, isBlijvend, zoekMelden, zoekOphalen, zoekUitstellen, zoekAnnuleren, zoekTelling, type WachtItem } from '../../backend/zoek/wachtrij';
import * as bronnen from '../../backend/zoek/bronnen';
import { idsVanBron, standVanBron } from '../../backend/zoek-index';
import { standCacheLeeg } from '../../backend/sleutelkluis';
import * as rs from '../../backend/ruimte-scheiding';
import { tabHash } from '../../backend/tech-profiel';
import { koppelingBewaren, verzegel } from '../../backend/github-koppeling-opslag';
import { setGithubDeps } from '../../backend/github-platform';
import type { Lade } from '../../shared/ruimte-scheiding';

const sys = (sql: string, p: unknown[] = []) => getPool('systeem').query(sql, p);
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-bronnen-20261022');
  const sfx = randomBytes(4).toString('hex');
  const echteFetch = globalThis.fetch;

  // ------------------------------------------------------------------ 1. catalogus van de interface
  const { genereer, naarTs } = await import(pathToFileURL(join(process.cwd(), 'scripts/zoek-ui-catalogus.mjs')).href);
  const vers = naarTs(genereer(process.cwd()));
  const opSchijf = readFileSync(join(process.cwd(), 'shared/zoek-ui-knoppen.generated.ts'), 'utf8');
  check('de gegenereerde catalogus op schijf is actueel (node scripts/zoek-ui-catalogus.mjs)', vers === opSchijf, `${UI_ELEMENTEN.length} elementen, versie ${UI_ELEMENTEN_VERSIE}`);
  check('de generator vond honderden echte knoppen/koppen/dialogen in src/**/*.tsx', UI_ELEMENTEN.length > 500, String(UI_ELEMENTEN.length));
  const cat = uiCatalogus();
  const vind = (uk: string) => cat.filter((o) => o.titels.uk === uk);
  check('«Шифрування моїх даних» (SleutelkluisSectie) staat erin, op Налаштування › Способи входу', vind('Шифрування моїх даних').some((o) => o.route.host === 'identity' && o.route.pad === 'methods' && o.toegang === 'iedereen'));
  // 25.10.2026: de bel staat in een zone (shared/plaatsing.ts) — de knop heet nu «Повернути на типове місце» (vroeger «Повернути в кут»)
  check('«Повернути на типове місце» (knop in het meldingencentrum) staat erin met nl «Terug naar de standaardplek»', vind('Повернути на типове місце').some((o) => o.soort === 'knop' && o.titels.nl === 'Terug naar de standaardplek'));
  check('«Поштові акаунти» staat erin, op de mailpagina', vind('Поштові акаунти').some((o) => o.route.host === 'mail'));
  check('pagina «Мови» (identity/languages) en menu «Пошта» komen uit menu-model + labels', cat.some((o) => o.id === 'pagina:identity/languages' && o.titels.nl === 'Talen') && cat.some((o) => o.id === 'menu:mail' && o.soort === 'menu'));
  const hulp = cat.filter((o) => o.bron === 'hulp');
  check('elke sleutel van het hulp-register is een object met wat/gevolg/risico (uk ≠ nl) en een focus-route', hulp.length >= 100 && hulp.every((o) => o.omschrijving.uk && o.omschrijving.nl && o.omschrijving.uk !== o.omschrijving.nl && o.route.params?.focus), String(hulp.length));
  check('hulp-sleutel tech.erven is «profiel» (de band), uitrol.zone is «technisch», toegang.lokaal is voor iedereen',
    cat.find((o) => o.id === 'hulp:tech.erven')?.toegang === 'profiel' && cat.find((o) => o.id === 'hulp:uitrol.zone')?.toegang === 'technisch' && cat.find((o) => o.id === 'hulp:toegang.lokaal')?.toegang === 'iedereen');
  check('AI-rechten (connector v2) en integraties staan erin; beheerrechten alleen technisch', cat.some((o) => o.id.startsWith('recht:') && o.extra.kant === 'gebruiker' && o.toegang === 'iedereen') && cat.filter((o) => o.id.startsWith('recht:') && o.extra.kant === 'beheer').every((o) => o.toegang === 'technisch') && cat.some((o) => o.id.startsWith('integratie:')) && cat.some((o) => o.id === 'mailaanbieder:gmail'));
  const iedereen = uiObjectenVoor('iedereen'), technisch = uiObjectenVoor('technisch');
  check('zonder technisch profiel: geen admin/api-pagina, geen beheerpagina van mcp, geen tabblad «Технічне»', !iedereen.some((o) => o.route.host === 'admin' || o.route.host === 'api' || (o.route.host === 'mcp' && o.route.pad === 'dashboard') || o.titels.uk === 'Технічне') && technisch.some((o) => o.route.host === 'admin') && technisch.some((o) => o.titels.uk === 'Технічне'));
  const priveObj = uiZoekObjecten({ userId: 'u1', ruimte: 'prive' }), techObj = uiZoekObjecten({ userId: 'u1', ruimte: 'technisch' });
  check('ZoekObjecten: persoonlijke lade < technische lade; elk object draagt de lade in rechten, titels uk+nl, een versie', priveObj.length < techObj.length && priveObj.every((o) => o.rechten.userId === 'u1' && o.rechten.ruimte === 'prive' && o.titels?.uk && o.titels?.nl && o.versie) && new Set(priveObj.map((o) => `${o.bron}|${o.id}`)).size === priveObj.length, `${priveObj.length} / ${techObj.length}`);

  // ------------------------------------------------------------------ 2. geheimen
  const geheim = 'Hallo, token: ghp_' + 'a'.repeat(36) + ' en пароль: Hunter2Hunter2 en gewoon nieuws over postcodes.';
  const m = maskeerGeheimen(geheim);
  check('tokens en wachtwoordregels worden gemaskeerd, de rest van de zin blijft', !m.tekst.includes('ghp_') && !m.tekst.includes('Hunter2') && m.tekst.includes('postcodes') && m.soorten.includes('GitHub-token') && m.soorten.includes('wachtwoordregel'));
  check('een gewone zin met het woord «token» is geen geheim', geheimenIn('de token-tab toont uw toegangstokens zonder waarde').length === 0);
  const ladeP: Lade = { userId: 'u1', ruimte: 'prive' };
  const mo = mailObject(ladeP, { id: 'm1', subject: 'Sleutel', body: geheim, senderEmail: 'a@b.c', receivedAt: 1700000000000 });
  check('mailObject: de brieftekst in het zoekobject bevat het geheim niet meer', !String(mo.tekst).includes('ghp_') && String(mo.tekst).includes('[geheim]'));

  // ------------------------------------------------------------------ 3. adapters
  const ladeT: Lade = { userId: 'u1', ruimte: 'technisch' };
  const co = cloudObject(ladeT, { id: 'c1', title: 'Factuur', originalName: 'f.pdf', mimeType: 'application/pdf', updatedAt: 1, tags: ['werk'] });
  const dr = driveObject(ladeP, { id: 'd1', name: 'Plan.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', modifiedAt: '2026-01-01T00:00:00Z' });
  const ag = agendaGoogleObject(ladeP, { id: 'e1', summary: 'Tandarts', start: '2026-02-02', location: 'Gent' });
  const bo = bordObject(ladeT, { id: 'b1', kind: 'note', title: 'Idee', body: 'tekst', updated_at: '2026-01-01T00:00:00Z' });
  const gr = githubRepoObject(ladeP, { fullName: 'pavlo/site', description: 'd', pushedAt: '2026-01-01T00:00:00Z' }, '# README');
  const gi = githubIssueObject(ladeP, 'pavlo/site', { number: 7, title: 'Bug', isPull: false, state: 'open', updatedAt: '2026-01-02T00:00:00Z', labels: [{ name: 'bug' }] });
  const bj = bijlageObject(ladeP, { id: 'm1', subject: 'S', receivedAt: 1 }, { providerAttachmentId: 'att1', filename: 'scan.pdf', contentType: 'application/pdf', partPath: '1' }, { pad: '', tekst: 'OCR-tekst', sha256: 'a'.repeat(64), ocr: true });
  check('adapters: elke bron krijgt de lade van de aanroep (technisch blijft technisch) en de juiste bron/soort',
    co.rechten.ruimte === 'technisch' && co.bron === 'cloud' && co.soort === 'bestand' && co.formaat === 'pdf'
    && dr.rechten.ruimte === 'prive' && dr.bron === 'drive' && dr.formaat === 'docx' && ag.bron === 'agenda' && ag.soort === 'afspraak' && ag.id === 'g:e1'
    && bo.rechten.ruimte === 'technisch' && bo.soort === 'notitie' && bo.route?.pad === 'notes' && gr.soort === 'repo' && gi.soort === 'issue' && gi.id === 'issue:pavlo/site#7'
    && bj.bron === 'bijlage' && bj.fragmentBron === 'ocr' && bj.id === 'm1:1');
  check('wachtrij-regels: backoff 30 s → 6 u, blijvende fouten herkend', wachttijdMs(1) === 30_000 && wachttijdMs(30) === 6 * 3600_000 && isBlijvend('GOOGLE_MAIL_MESSAGES_REAUTH_REQUIRED') && isBlijvend('ZOEK_LADE_MISMATCH') && !isBlijvend('GOOGLE_MAIL_MESSAGES_RATE_LIMITED'));
  const sa = standAfleiden('mail', { verbonden: true }, { stand: 'klaar', voortgang: 100, aantal: 3, laatsteOk: 10, laatstePoging: 10, fout: '', versie: '', wachtReden: WACHT_SLEUTEL, volledigOp: 0 }, { wachtend: 1, bezig: 0, fout: 0, laatsteWachtFout: '', laatsteWachtFoutOp: 0 });
  check('standAfleiden: dichte sleutel = «gedeeltelijk» met uitleg «після входу», geen fout', sa.stand === 'gedeeltelijk' && sa.fout === '' && /входу/.test(sa.uitleg.uk) && /aanmelding/.test(sa.uitleg.nl));
  check('standAfleiden: niet verbonden wint; wachtrij → indexeert; fout na laatste succes → fout', standAfleiden('drive', { verbonden: false }, null, { wachtend: 2, bezig: 0, fout: 0, laatsteWachtFout: '', laatsteWachtFoutOp: 0 }).stand === 'niet_gekoppeld'
    && standAfleiden('bord', { verbonden: true }, { stand: 'klaar', voortgang: 100, aantal: 1, laatsteOk: 5, laatstePoging: 9, fout: '', versie: '', wachtReden: '', volledigOp: 0 }, { wachtend: 1, bezig: 0, fout: 0, laatsteWachtFout: '', laatsteWachtFoutOp: 0 }).stand === 'indexeert'
    && standAfleiden('github', { verbonden: true }, { stand: 'fout', voortgang: 0, aantal: 0, laatsteOk: 5, laatstePoging: 9, fout: 'GITHUB_RATE', versie: '', wachtReden: '', volledigOp: 0 }, { wachtend: 0, bezig: 0, fout: 0, laatsteWachtFout: '', laatsteWachtFoutOp: 0 }).stand === 'fout');

  // ------------------------------------------------------------------ database: één mens, twee laden
  const pool = getPool('systeem');
  const userId = randomUUID();
  await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', userId, { email: `zoek-${sfx}@eenheid.test`, role: 'member', status: 'approved' }]);
  const prive: Lade = { userId, ruimte: 'prive' }, tech: Lade = { userId, ruimte: 'technisch' };
  const rec = async (tbl: string, data: Record<string, unknown>) => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', [tbl, id, { ownerUserId: userId, ...data }]); return id; };
  const bij = (tbl: string, id: string, patch: Record<string, unknown>) => pool.query(`UPDATE app.records SET data = data || $3::jsonb, updated_at = now() WHERE tbl=$1 AND id=$2`, [tbl, id, JSON.stringify(patch)]);
  const tel = async (lade: Lade, bron: string) => Number((await pool.query('SELECT count(*)::int AS n FROM app.zoek_objecten WHERE user_id=$1 AND ruimte=$2 AND bron=$3', [lade.userId, lade.ruimte, bron])).rows[0].n);
  const ronde = () => bronnen.runZoekIndex({ gebruikers: [userId], limiet: 200, budgetMs: 120_000 });
  const gh: Array<{ url: string }> = [];
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(typeof input === 'string' ? input : input?.url ?? '');
    gh.push({ url });
    const j = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
    if (/api\.github\.com\/user$/.test(url)) return j({ login: 'pavlo', name: 'P', html_url: 'https://github.com/pavlo' });
    if (/api\.github\.com\/user\/repos/.test(url)) return j([{ id: 1, name: 'site', full_name: 'pavlo/site', private: false, description: 'De site van Mijn Ruimte', language: 'TypeScript', pushed_at: '2026-01-01T00:00:00Z', html_url: 'https://github.com/pavlo/site', owner: { login: 'pavlo' }, topics: ['byos'] }]);
    if (/\/repos\/pavlo\/site\/readme/.test(url)) return j({ name: 'README.md', encoding: 'base64', content: Buffer.from('# Mijn Ruimte\nZelf gehoste PaaS. Token in readme: ghp_' + 'b'.repeat(36)).toString('base64'), html_url: 'x' });
    if (/\/repos\/pavlo\/site\/issues/.test(url)) return j([{ number: 7, title: 'Zoeken vindt bijlagen niet', state: 'open', body: 'OCR ontbreekt', updated_at: '2026-01-02T00:00:00Z', user: { login: 'pavlo' }, labels: [{ name: 'bug' }], html_url: 'y' }]);
    if (/\/repos\/pavlo\/site\/pulls/.test(url)) return j([]);
    return echteFetch(input, init);
  }) as typeof fetch;
  setGithubDeps({ fetch: globalThis.fetch });

  try {
    // Bronnen vullen: 3 brieven (1 technisch), 1 bestand, 1 Drive-projectie, 1 agenda-afspraak + sync-state, 2 borditems (1 technisch), IMAP-koppeling, GitHub-koppeling.
    const m1 = await rec('mail_items_v1', { subject: 'Factuur Telenet oktober', body: 'Uw factuur bedraagt 42 euro. wachtwoord: SuperGeheim99', senderEmail: 'facturen@telenet.be', senderName: 'Telenet', receivedAt: Date.now() - 86400000, source: 'provider', hasAttachments: false });
    const m2 = await rec('mail_items_v1', { subject: 'Запрошення на зустріч', body: 'Зустріч у четвер о 10:00', senderEmail: 'kateryna@example.com', receivedAt: Date.now() });
    const m3 = await rec('mail_items_v1', { subject: 'Technische brief', body: 'alleen in de technische lade', senderEmail: 'ops@example.com', receivedAt: Date.now(), ruimte: 'technisch' });
    const c1 = await rec('cloud_items_v1', { title: 'Huurcontract', originalName: 'huur.txt', mimeType: 'text/plain', textContent: 'Huurcontract Gent 2026', updatedAt: Date.now(), tags: ['wonen'] });
    const d1 = await rec('google_suite_drive_projection_v1', { name: 'Reisplan.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', modifiedAt: Date.now(), principalId: 'p1', providerFileId: 'f1', updatedAt: Date.now() });
    const e1 = await rec('google_suite_calendar_events_v1', { summary: 'Tandarts', start: '2026-03-03T09:00', location: 'Leuven', providerUpdatedAt: Date.now() });
    await rec('google_suite_calendar_sync_state_v1', { service: 'calendar', principalId: 'p1', phase: 'incremental' });
    const b1 = String((await pool.query(`INSERT INTO app.mcp_console_items (user_id, kind, title, body, status, author) VALUES ($1,'task','Belastingaangifte indienen','voor 30 juni','backlog','operator') RETURNING id`, [userId])).rows[0].id);
    const b2 = String((await pool.query(`INSERT INTO app.mcp_console_items (user_id, kind, title, body, status, author, ruimte) VALUES ($1,'note','Technische notitie','server','backlog','operator','technisch') RETURNING id`, [userId])).rows[0].id);
    await pool.query(`INSERT INTO app.mail_imap_koppeling (user_id, id, aanbieder, adres, geheim, ruimte, actief) VALUES ($1,$2,'ukrnet','zoek@ukr.net','v1.test','prive',true)`, [userId, `imap-${sfx}`]);
    await koppelingBewaren(userId, 'oauth', { login: 'pavlo', scopes: ['repo'], tokenZegel: verzegel('gho_PERSOONLIJK', userId, 'oauth') });

    // ------------------------------------------------------------------ technisch profiel: bord op «eigen» → tweede lade
    const pid = `tech-${randomBytes(6).toString('hex')}`;
    await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['ontwikkelaar'],240,'test') ON CONFLICT (user_id) DO UPDATE SET rollen = EXCLUDED.rollen, ingetrokken_op = NULL`, [userId, pid]);
    await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['ontwikkelaar'],'zoek-test', now() + interval '60 minutes')`, [userId, pid, tabHash(randomBytes(24).toString('hex'))]);
    await rs.keuzeZetten(userId, 'per_dienst', userId);
    await rs.dienstZetten(userId, 'bord', 'verbind-eigen', { stapOpGedaan: true });
    const laden = await bronnen.ladenVan(userId);
    check('ladenVan: persoonlijke lade met alle bronnen + technische lade met ui en bord (bord staat op «власні дані»), mail niet',
      laden.length === 2 && laden[0].lade.ruimte === 'prive' && laden[1].lade.ruimte === 'technisch' && laden[1].bronnen.includes('ui') && laden[1].bronnen.includes('bord') && !laden[1].bronnen.includes('mail'), JSON.stringify(laden.map((l) => [l.lade.ruimte, l.bronnen])));

    // ------------------------------------------------------------------ 4. eerste indexering
    const r1 = await ronde();
    const fouten1 = (await pool.query(`SELECT bron, ruimte, status, last_error FROM app.zoek_wachtrij WHERE user_id=$1 AND last_error <> ''`, [userId])).rows;
    check('eerste ronde: plant beide laden en verwerkt zonder fouten', r1.gepland >= 9 && r1.fout === 0 && r1.klaar >= 9, JSON.stringify({ r1, fouten1 }));
    const telling = { mail: await tel(prive, 'mail'), cloud: await tel(prive, 'cloud'), drive: await tel(prive, 'drive'), agenda: await tel(prive, 'agenda'), bord: await tel(prive, 'bord'), github: await tel(prive, 'github'), ui: await tel(prive, 'ui'), pagina: await tel(prive, 'pagina'), hulp: await tel(prive, 'hulp'), instelling: await tel(prive, 'instelling'), techBord: await tel(tech, 'bord'), techMail: await tel(tech, 'mail'), techUi: await tel(tech, 'ui') };
    check('persoonlijke lade: 2 brieven, 1 bestand, 0 Drive-rijen (geen Google-account → niet gekoppeld → niets geïndexeerd), 1 afspraak, 1 taak, repo + issue', telling.mail === 2 && telling.cloud === 1 && telling.drive === 0 && telling.agenda === 1 && telling.bord === 1 && telling.github === 2, JSON.stringify(telling));
    check('technische lade: 1 notitie (bord «eigen»), geen mail (mail is daar niet verbonden), wél de catalogus', telling.techBord === 1 && telling.techMail === 0 && telling.techUi > telling.ui, JSON.stringify(telling));
    check('catalogus geïndexeerd in vier bronnen (ui/pagina/hulp/instelling), technische lade groter (admin-pagina’s)', telling.ui > 500 && telling.pagina > 50 && telling.hulp > 20 && telling.instelling > 100);
    const techBrief = await pool.query(`SELECT 1 FROM app.zoek_objecten WHERE user_id=$1 AND bron='mail' AND bron_id=$2`, [userId, m3]);
    check('de technische brief staat in GEEN enkele lade (mail is in de technische lade niet verbonden; persoonlijk hoort hij niet)', techBrief.rowCount === 0);
    const gi1 = (await pool.query(`SELECT tekst FROM app.zoek_objecten WHERE user_id=$1 AND ruimte='prive' AND bron='github' AND bron_id='repo:pavlo/site'`, [userId])).rows[0];
    check('het GitHub-token in de README is gemaskeerd in de index', !!gi1 && !String(gi1.tekst).includes('ghp_') && String(gi1.tekst).includes('Zelf gehoste'));
    const mi1 = (await pool.query(`SELECT tekst, titel FROM app.zoek_objecten WHERE user_id=$1 AND ruimte='prive' AND bron='mail' AND bron_id=$2`, [userId, m1])).rows[0];
    check('de wachtwoordregel in de brief is gemaskeerd; de rest blijft doorzoekbaar', !!mi1 && !String(mi1.tekst).includes('SuperGeheim99') && String(mi1.tekst).includes('42 euro'));
    const dup = await pool.query(`SELECT ruimte, bron, bron_id, count(*) FROM app.zoek_objecten WHERE user_id=$1 GROUP BY 1,2,3 HAVING count(*) > 1`, [userId]);
    check('geen dubbelen', dup.rowCount === 0);

    // ------------------------------------------------------------------ tweede ronde: niets dubbel, alles overgeslagen
    const voor = await pool.query(`SELECT count(*)::int AS n, max(geindexeerd_op) AS g FROM app.zoek_objecten WHERE user_id=$1`, [userId]);
    await wacht(50);
    const r2 = await ronde();
    const na = await pool.query(`SELECT count(*)::int AS n, max(geindexeerd_op) AS g FROM app.zoek_objecten WHERE user_id=$1`, [userId]);
    check('tweede ronde: zelfde aantal objecten, niets opnieuw geschreven (incrementeel: waterlijn + versie)', na.rows[0].n === voor.rows[0].n && String(na.rows[0].g) === String(voor.rows[0].g) && r2.fout === 0, JSON.stringify({ voor: voor.rows[0].n, na: na.rows[0].n, r2 }));

    // ------------------------------------------------------------------ wijziging → bijgewerkt; verwijdering → weg
    await bij('mail_items_v1', m2, { subject: 'Запрошення на зустріч (перенесено)' });
    await pool.query(`UPDATE app.mcp_console_items SET title = 'Belastingaangifte ingediend', updated_at = now() WHERE id::text = $1`, [b1]);
    await pool.query(`DELETE FROM app.records WHERE tbl='cloud_items_v1' AND id=$1`, [c1]);
    await pool.query(`UPDATE app.zoek_bron_stand SET volledig_op = NULL WHERE user_id=$1`, [userId]);   // afstemming afdwingen (anders pas na ZOEK_INDEX_VOLLEDIG_MIN)
    await pool.query(`UPDATE app.zoek_bron_stand SET laatste_poging_op = now() - interval '10 minutes' WHERE user_id=$1`, [userId]);
    const r3 = await ronde();
    const m2na = (await pool.query(`SELECT titel FROM app.zoek_objecten WHERE user_id=$1 AND ruimte='prive' AND bron='mail' AND bron_id=$2`, [userId, m2])).rows[0];
    const b1na = (await pool.query(`SELECT titel FROM app.zoek_objecten WHERE user_id=$1 AND ruimte='prive' AND bron='bord' AND bron_id=$2`, [userId, b1])).rows[0];
    check('gewijzigde brief en taak zijn bijgewerkt (alleen zij: waterlijn)', m2na?.titel === 'Запрошення на зустріч (перенесено)' && b1na?.titel === 'Belastingaangifte ingediend' && r3.fout === 0, JSON.stringify({ m2na, b1na, r3 }));
    check('verwijderd bestand is uit de index (afstemming op id’s)', (await tel(prive, 'cloud')) === 0);
    check('technische notitie staat nog in de technische lade en nooit in de persoonlijke', (await tel(tech, 'bord')) === 1 && (await pool.query(`SELECT 1 FROM app.zoek_objecten WHERE user_id=$1 AND ruimte='prive' AND bron='bord' AND bron_id=$2`, [userId, b2])).rowCount === 0);

    // ------------------------------------------------------------------ 5. ontkoppelen → verwijderBron
    await pool.query(`DELETE FROM app.mail_imap_koppeling WHERE user_id=$1`, [userId]);
    await pool.query(`UPDATE app.zoek_bron_stand SET laatste_poging_op = now() - interval '10 minutes' WHERE user_id=$1`, [userId]);
    const r4 = await ronde();
    check('IMAP ontkoppeld → mail is «niet_gekoppeld» en de brieven zijn uit de index', (await tel(prive, 'mail')) === 0 && (await standVanBron(prive, 'mail')).stand === 'niet_gekoppeld' && r4.fout === 0, JSON.stringify(r4));
    // De koppeling weer terug: de brieven komen terug (waterlijn is teruggezet).
    await pool.query(`INSERT INTO app.mail_imap_koppeling (user_id, id, aanbieder, adres, geheim, ruimte, actief) VALUES ($1,$2,'ukrnet','zoek@ukr.net','v1.test','prive',true)`, [userId, `imap-${sfx}`]);
    await pool.query(`UPDATE app.zoek_bron_stand SET laatste_poging_op = now() - interval '10 minutes' WHERE user_id=$1`, [userId]);
    await ronde();
    check('opnieuw gekoppeld → de brieven staan er weer (volledige herscan vanaf de teruggezette waterlijn)', (await tel(prive, 'mail')) === 2);

    // ------------------------------------------------------------------ dichte sleutelkluis → uitgesteld, geen fout, eerlijke stand
    await pool.query(`INSERT INTO app.sleutelkluis (user_id, ruimte, controle) VALUES ($1,'prive',$2)`, [userId, 'c'.repeat(64)]);
    standCacheLeeg();
    await bij('mail_items_v1', m1, { subject: 'Factuur Telenet november' });
    await pool.query(`UPDATE app.zoek_bron_stand SET laatste_poging_op = now() - interval '10 minutes' WHERE user_id=$1`, [userId]);
    const r5 = await ronde();
    const wachtend = await pool.query(`SELECT bron, status, last_error, attempts FROM app.zoek_wachtrij WHERE user_id=$1 AND ruimte='prive' AND status='wachtend'`, [userId]);
    check('sleutel dicht: items uitgesteld (wachtend, SLEUTELKLUIS_GESLOTEN, geen poging verbruikt), nul fouten', r5.uitgesteld >= 5 && r5.fout === 0 && wachtend.rows.some((r) => r.last_error === WACHT_SLEUTEL && Number(r.attempts) === 0), JSON.stringify({ r5, w: wachtend.rows.slice(0, 3) }));
    const m1dicht = (await pool.query(`SELECT titel FROM app.zoek_objecten WHERE user_id=$1 AND ruimte='prive' AND bron='mail' AND bron_id=$2`, [userId, m1])).rows[0];
    check('met dichte sleutel wordt NIETS gelezen: de gewijzigde brief is nog de oude', m1dicht?.titel === 'Factuur Telenet oktober');
    const standen = await bronnen.bronStanden(userId, {});
    const standMail = standen.find((s) => s.bron === 'mail')!;
    check('stand mail: «gedeeltelijk» met reden SLEUTELKLUIS_GESLOTEN en uitleg «після входу» (uk) / «aanmelding» (nl), geen fout', standMail.stand === 'gedeeltelijk' && standMail.wachtReden === WACHT_SLEUTEL && /входу/.test(standMail.uitleg.uk) && /aanmelding/.test(standMail.uitleg.nl) && standMail.fout === '' && standMail.aantal === 2, JSON.stringify(standMail));
    check('stand ui: de catalogus leest geen persoonlijke gegevens en blijft «klaar» ondanks de dichte sleutel', standen.find((s) => s.bron === 'ui')?.stand === 'klaar');
    await pool.query(`DELETE FROM app.sleutelkluis WHERE user_id=$1`, [userId]); standCacheLeeg();
    await pool.query(`UPDATE app.zoek_wachtrij SET run_after = now() WHERE user_id=$1 AND status='wachtend'`, [userId]);
    const r6 = await ronde();
    const m1open = (await pool.query(`SELECT titel FROM app.zoek_objecten WHERE user_id=$1 AND ruimte='prive' AND bron='mail' AND bron_id=$2`, [userId, m1])).rows[0];
    check('sleutel weer open (uit) → de uitgestelde items lopen en de brief is bijgewerkt; wacht_reden leeg', m1open?.titel === 'Factuur Telenet november' && r6.fout === 0 && (await bronnen.bronStanden(userId, {})).find((s) => s.bron === 'mail')?.wachtReden === '', JSON.stringify(r6));

    // ------------------------------------------------------------------ 7. stand per bron is waar
    const st = await bronnen.bronStanden(userId, {});
    const byBron = Object.fromEntries(st.map((s) => [s.bron, s]));
    check('stand: drive niet gekoppeld (geen Google-account), mail verbonden via IMAP met opmerking, bord klaar met geteld aantal, github verbonden',
      byBron.drive.stand === 'niet_gekoppeld' && byBron.mail.verbonden && byBron.mail.opmerking === 'IMAP_NIET_OPGESLAGEN' && byBron.bord.stand === 'klaar' && byBron.bord.aantal === 1 && byBron.github.verbonden && byBron.github.aantal === 2, JSON.stringify(st.map((s) => [s.bron, s.stand, s.aantal, s.verbonden])));
    check('bijlage: niet verbonden (alleen IMAP) met de eerlijke opmerking dat IMAP-bijlagen niet geïndexeerd worden', byBron.bijlage.stand === 'niet_gekoppeld' && byBron.bijlage.opmerking === 'IMAP_BIJLAGEN_NIET_GEINDEXEERD');
    check('geen enkel verzoek naar GitHub droeg een geheim in de URL', gh.every((v) => !/token|secret|gho_/i.test(v.url)));

    // ------------------------------------------------------------------ wachtrij: uitstellen/annuleren/telling
    await zoekMelden(sys as any, [{ userId, ruimte: 'prive', bron: 'cloud', bronId: 'x1' }, { userId, ruimte: 'prive', bron: 'cloud', bronId: 'x1', actie: 'verwijderen' }]);
    const items = (await zoekOphalen(sys as any, 50)).filter((i: WachtItem) => i.userId === userId && i.bronId === 'x1');
    check('zoekMelden is idempotent en «verwijderen» wint', items.length === 1 && items[0].actie === 'verwijderen');
    await zoekUitstellen(sys as any, items[0], 'TEST', 60_000);
    const t1 = await zoekTelling(sys as any, prive, 'cloud');
    check('uitstellen zet het item terug op wachtend', t1.wachtend === 1);
    check('annuleren van een bron maakt de rij leeg', (await zoekAnnuleren(sys as any, prive, 'cloud')) === 1 && (await zoekTelling(sys as any, prive, 'cloud')).wachtend === 0);
    check('idsVanBron (kern) en de tel-query zijn het eens', (await idsVanBron(prive, 'mail')).length === 2);
  } finally {
    globalThis.fetch = echteFetch; setGithubDeps(null);
    await pool.query(`DELETE FROM app.zoek_objecten WHERE user_id=$1`, [userId]).catch(() => undefined);
    await pool.query(`DELETE FROM app.zoek_wachtrij WHERE user_id=$1`, [userId]).catch(() => undefined);
    await pool.query(`DELETE FROM app.zoek_bron_stand WHERE user_id=$1`, [userId]).catch(() => undefined);
    await pool.query(`DELETE FROM app.mcp_console_items WHERE user_id=$1`, [userId]).catch(() => undefined);
    await pool.query(`DELETE FROM app.mail_imap_koppeling WHERE user_id=$1`, [userId]).catch(() => undefined);
    await pool.query(`DELETE FROM app.sleutelkluis WHERE user_id=$1`, [userId]).catch(() => undefined);
    await pool.query(`DELETE FROM app.tech_activaties WHERE user_id=$1`, [userId]).catch(() => undefined);
    await pool.query(`DELETE FROM app.tech_profielen WHERE user_id=$1`, [userId]).catch(() => undefined);
    await pool.query(`DELETE FROM app.ruimte_dienst_stand WHERE user_id=$1`, [userId]).catch(() => undefined);
    await pool.query(`DELETE FROM app.ruimte_keuze WHERE user_id=$1`, [userId]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE owner_id=$1 OR (tbl='users' AND id=$1) OR data->>'userId'=$1`, [userId]).catch(() => undefined);
  }
  return einde();
}
