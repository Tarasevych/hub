// ZOEKEN — DIEPE LINKS EN PLEKKEN VAN DE CATALOGUS (ZOEKDIEP-001, 05.11.2026). Zonder database.
//
// Na PR #30 bleven er fouten over die de zoeker naar de juiste вкладка brachten maar niet naar het ding zelf:
//   1. de index schreef `bericht`/`item`/`drive`/`afspraak`, de pagina's lazen `open_message_id`/`open_item_id`/`open_file_id` of niets;
//      nu één afspraak (shared/zoek-diepe-link.ts), de adapters schrijven het id van de aanbieder, oude objecten worden bij het lezen
//      vertaald (backend/zoek/diepe-link.ts) en elke pagina opent het item (mail + bijlage, cloud, Drive, agenda, notities, bord);
//   2. de hub «Підключення ШІ» opende zonder onderdeel (#extensie, #agent/<slug> …), admin/directories zonder «Зовнішні каталоги»;
//   3. IdentiteitBeheerWeergave (nergens getoond) en McpToestemmingVenster (alleen met ?consent=) stonden in de catalogus;
//   4. blokken die alleen met een technisch profiel verschijnen (AiVerbinden, TabExtensie) kregen de toegang van het bestand;
//   5. wederzijds recursieve componenten verloren hun tabblad;
//   6. de beheerweergave van Gmail (mode==='accounts': «Оновити доступ» voor zoeken) werd nergens gerenderd.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';
import { DIEPE_PARAMS, diepeRoute, diepeWaarde, oudeRecordRoute } from '../../shared/zoek-diepe-link';
import { routeUitRecord, verrijkDiepeRoutes } from '../../backend/zoek/diepe-link';
import { agendaGoogleObject, bijlageObject, bordObject, cloudObject, driveObject, mailObject } from '../../backend/zoek/adapters';
import { UI_ELEMENTEN } from '../../shared/zoek-ui-knoppen.generated';
import type { ZoekTreffer } from '../../shared/zoek-model';
import { dagVanItem } from '../../src/agenda/v3/agenda-tijd';

const lees = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-diepe-link-20261105');
  const lade = { userId: 'u1', ruimte: 'prive' as const };

  // 1a. adapters: de parameters die de pagina's lezen, met het id van de aanbieder
  const mail = mailObject(lade, { id: 'rec-1', providerMessageId: 'gm-77', mailAccountId: 'acc-1', subject: 'S', receivedAt: 1 });
  check('1a mail → mail/inbox ?open_message_id=<Gmail-id>&open_mail_account=<postbus>', mail.route?.host === 'mail' && mail.route.pad === 'inbox' && mail.route.params?.open_message_id === 'gm-77' && mail.route.params?.open_mail_account === 'acc-1' && !('bericht' in (mail.route.params || {})), JSON.stringify(mail.route));
  const zonderPmid = mailObject(lade, { id: 'rec-2', subject: 'S' });
  check('1a mail zonder Gmail-id (lokale import) → het eigen id, geen lege postbus', zonderPmid.route?.params?.open_message_id === 'rec-2' && !('open_mail_account' in (zonderPmid.route?.params || {})));
  const bij = bijlageObject(lade, { id: 'rec-1', providerMessageId: 'gm-77', mailAccountId: 'acc-1', subject: 'S' }, { providerAttachmentId: 'att-9', filename: 'a.pdf', contentType: 'application/pdf' }, { pad: '', tekst: 't', sha256: 'x' });
  check('1a bijlage → hetzelfde bericht + open_attachment_id', bij.route?.params?.open_message_id === 'gm-77' && bij.route.params?.open_attachment_id === 'att-9', JSON.stringify(bij.route));
  const cloud = cloudObject(lade, { id: 'c-1', originalName: 'x.txt' });
  check('1a cloud → cloud/search ?open_item_id', cloud.route?.host === 'cloud' && cloud.route.params?.open_item_id === 'c-1');
  const drive = driveObject(lade, { id: 'd-rec', providerFileId: 'gfile-5', principalId: 'pr-2', name: 'x' });
  check('1a Drive → cloud/google (DriveBrowser) ?open_file_id=<Google-id>&open_drive_principal', drive.route?.pad === 'google' && drive.route.params?.open_file_id === 'gfile-5' && drive.route.params?.open_drive_principal === 'pr-2', JSON.stringify(drive.route));
  const afspraak = agendaGoogleObject(lade, { id: 'a-rec', providerEventId: 'ev1', calendarId: 'cal@x', summary: 'S' });
  check('1a agenda → hub/calendar ?open_event_id=google:<agenda>:<gebeurtenis> (zoals backend/agenda-spiegel.ts)', afspraak.route?.host === 'hub' && afspraak.route.pad === 'calendar' && afspraak.route.params?.open_event_id === 'google:cal@x:ev1', JSON.stringify(afspraak.route));
  const notitie = bordObject(lade, { id: 'n1', kind: 'note', title: 'N' }), taak = bordObject(lade, { id: 't1', kind: 'task', title: 'T' });
  check('1a notitie → hub/notes ?open_item_id; taak → mcp/board ?doel=bord:<id> (hub/tasks heeft geen bord)', notitie.route?.pad === 'notes' && notitie.route.params?.open_item_id === 'n1' && taak.route?.host === 'mcp' && taak.route.pad === 'board' && taak.route.params?.doel === 'bord:t1', JSON.stringify(taak.route));

  // 1b. oude routes (al in de index) → de nieuwe namen, zuiver
  check('1b oude namen vertaald: bericht/bijlage/item/drive/afspraak', JSON.stringify(diepeRoute({ host: 'mail', pad: 'inbox', params: { bericht: 'r', bijlage: 'b' } })) === JSON.stringify({ host: 'mail', pad: 'inbox', params: { open_message_id: 'r', open_attachment_id: 'b' } }));
  check('1b oude Drive-route (cloud/accounts) → cloud/google; oude afspraak (cloud/calendar) → hub/calendar', diepeRoute({ host: 'cloud', pad: 'accounts', params: { drive: 'd' } })?.pad === 'google' && diepeRoute({ host: 'cloud', pad: 'calendar', params: { afspraak: 'a' } })?.host === 'hub');
  check('1b oude taak (hub/tasks ?item) → mcp/board ?doel=bord:<id>; oude notitie blijft hub/notes', JSON.stringify(diepeRoute({ host: 'hub', pad: 'tasks', params: { item: 't9' } }, 'taak')) === JSON.stringify({ host: 'mcp', pad: 'board', params: { doel: 'bord:t9' } }) && diepeRoute({ host: 'hub', pad: 'notes', params: { item: 'n9' } }, 'notitie')?.params?.open_item_id === 'n9');
  check('1b een nieuwe route blijft ongewijzigd; null blijft null', JSON.stringify(diepeRoute(mail.route)) === JSON.stringify(mail.route) && diepeRoute(null) === null);
  check('1b oudeRecordRoute herkent alleen oude record-ids', oudeRecordRoute({ host: 'mail', pad: 'inbox', params: { bericht: 'r' } }) === 'mail' && oudeRecordRoute(mail.route) === '' && oudeRecordRoute({ host: 'cloud', pad: 'accounts', params: { drive: 'd' } }) === 'drive');

  // 1c. verrijking bij het lezen: één opzoeking per tabel, altijd met de gebruiker, fouten stil
  const treffer = (bron: string, soort: string, route: ZoekTreffer['route']) => ({ id: 'x', bron, soort, route } as unknown as ZoekTreffer);
  const items = [
    treffer('mail', 'bericht', { host: 'mail', pad: 'inbox', params: { bericht: 'rec-1' } }),
    treffer('drive', 'bestand', { host: 'cloud', pad: 'accounts', params: { drive: 'd-rec' } }),
    treffer('agenda', 'afspraak', { host: 'cloud', pad: 'calendar', params: { afspraak: 'a-rec' } }),
    treffer('bord', 'taak', { host: 'hub', pad: 'tasks', params: { item: 't1' } }),
  ];
  const vragen: Array<[string, string, string[]]> = [];
  await verrijkDiepeRoutes('u1', items, async (tabel, userId, ids) => {
    vragen.push([tabel, userId, ids]);
    const data: Record<string, Record<string, unknown>> = { 'rec-1': { providerMessageId: 'gm-77', mailAccountId: 'acc-1' }, 'd-rec': { providerFileId: 'gfile-5', principalId: 'pr-2' }, 'a-rec': { providerEventId: 'ev1', calendarId: 'cal@x' } };
    return ids.filter((i) => data[i]).map((i) => ({ id: i, data: data[i] }));
  });
  check('1c oude mail → Gmail-id + postbus uit mail_items_v1', items[0].route?.params?.open_message_id === 'gm-77' && items[0].route?.params?.open_mail_account === 'acc-1', JSON.stringify(items[0].route));
  check('1c oude Drive → Google-id + principal; oude afspraak → google:<agenda>:<gebeurtenis> op hub/calendar', items[1].route?.params?.open_file_id === 'gfile-5' && items[1].route?.pad === 'google' && items[2].route?.params?.open_event_id === 'google:cal@x:ev1' && items[2].route?.host === 'hub');
  check('1c oude taak zonder opzoeking naar mcp/board', items[3].route?.host === 'mcp' && items[3].route?.params?.doel === 'bord:t1');
  check('1c precies drie opzoekingen (mail, drive, agenda), elk met de gebruiker uit de sessie', vragen.length === 3 && vragen.every((v) => v[1] === 'u1') && vragen.map((v) => v[0]).join(',') === 'mail_items_v1,google_suite_drive_projection_v1,google_suite_calendar_events_v1', JSON.stringify(vragen));
  const stuk = [treffer('mail', 'bericht', { host: 'mail', pad: 'inbox', params: { bericht: 'rec-1' } })];
  await verrijkDiepeRoutes('u1', stuk, async () => { throw new Error('db weg'); });
  check('1c opzoeking faalt → de vertaalde route blijft (geen fout naar de zoeker)', stuk[0].route?.params?.open_message_id === 'rec-1');
  check('1c routeUitRecord zonder velden laat de route staan', routeUitRecord('mail', { host: 'mail', pad: 'inbox', params: { open_message_id: 'r' } }, {}).params?.open_message_id === 'r');
  check('1c diepeWaarde: alleen zichtbare ASCII, geen spaties of stuurtekens', diepeWaarde('?open_message_id=gm-77', 'open_message_id') === 'gm-77' && diepeWaarde('?open_message_id=a%20b', 'open_message_id') === '' && diepeWaarde('?x=1', 'open_message_id') === '');

  // 1d. de pagina's lezen ze echt (bron)
  const mailSrc = lees('src/GoogleMailWerkruimte.tsx');
  check('1d mail: opent het bericht (openMessageById) in de postbus van open_mail_account, daarna de bijlage (openAttachment)', /diepeWaarde\(location\.search,DIEPE_PARAMS\.bericht\)/.test(mailSrc) && /void openMessageById\(doel\.bericht,doelAccount\)/.test(mailSrc) && /void openAttachment\(detail\.id,gevonden,lijst,wacht\.account\)/.test(mailSrc) && /koppeling\.email\.toLowerCase\(\)/.test(mailSrc));
  const driveSrc = lees('src/DriveBrowser.tsx');
  check('1d Drive: opent in het account van open_drive_principal, één keer per pagina', /DIEPE_PARAMS\.drivePrincipal/.test(driveSrc) && /openFileGedaan\.current=true/.test(driveSrc));
  check('1d agenda: zoekt google:<agenda>:<gebeurtenis> in het overzicht en opent het venster', /diepeWaarde\(location\.search, DIEPE_PARAMS\.afspraak\)/.test(lees('src/agenda/Agenda.tsx')) && /void openItem\(item\)/.test(lees('src/agenda/Agenda.tsx')));
  check('1d notities (oud en vNext): open_item_id → bewerker; vNext haalt de notitie op (ook buiten de eerste pagina)', /if \(n\) start\(n\)/.test(lees('src/HubNotities.tsx')) && /notitiesClient\.een\(id\)/.test(lees('src/notities/NotitiesPagina.tsx')));
  check('1d cloud: niet gevonden → melding en parameter weg (vroeger bleef hij stil hangen)', /Елемент із пошуку не знайдено в хмарі/.test(lees('src/CloudFunctioneelWeergave.tsx')));
  check('1d bord: elke taak op mcp/board draagt data-zoek-doel; focus-doel leest ?doel=', /data-zoek-doel=\{`bord:\$\{task\.id\}`\}/.test(lees('src/McpDienstWeergave.tsx')) && /doelSelector\(doel\)/.test(lees('src/platform/focus-doel.ts')));

  // 2-5. de catalogus
  const gen = await import(pathToFileURL(join(process.cwd(), 'scripts/zoek-ui-catalogus.mjs')).href);
  const metBestand = (f: string) => UI_ELEMENTEN.filter((e) => e.bestand === f);
  const alleHash = (f: string, h: string) => { const l = metBestand(f); return l.length > 0 && l.every((e) => e.hash === h); };
  check('2a hub: TabExtensie → #extensie, TabOrch → #orch, TabAi → #ai, connector-v2 → #connectors', alleHash('src/agenten/TabExtensie.tsx', 'extensie') && alleHash('src/agenten/TabOrch.tsx', 'orch') && alleHash('src/agenten/TabAi.tsx', 'ai') && metBestand('src/connector-v2/ConnectorsTab.tsx').every((e) => e.hash === 'connectors'));
  check('2a hub: de plek van één AI (AgentPagina) → #agent/claude; technische delen → #technisch', alleHash('src/agenten/AgentPagina.tsx', 'agent/claude') && alleHash('src/agenten/TechVerbindingen.tsx', 'technisch'));
  check('2a elk element van mcp/agents uit een sectiebestand heeft een hash (geen landing bovenaan)', UI_ELEMENTEN.filter((e) => e.dienst === 'mcp' && e.tab === 'agents' && /agenten\/Tab|connector-v2\/|extensie\//.test(e.bestand)).every((e) => !!e.hash));
  check('2b admin/directories: «Зовнішні каталоги» → #mappen; Integraties.tsx leest de hash', UI_ELEMENTEN.some((e) => e.uk === 'Зовнішні каталоги' && e.dienst === 'admin' && e.tab === 'directories' && e.hash === 'mappen') && /uitHash\(\) \?\? begin\.weergave/.test(lees('src/integraties/Integraties.tsx')));
  check('3 IdentiteitBeheerWeergave en McpToestemmingVenster (alleen ?consent=) niet in de catalogus', !metBestand('src/IdentiteitBeheerWeergave.tsx').length && !metBestand('src/McpToestemmingVenster.tsx').length);
  const tech = UI_ELEMENTEN.find((e) => e.bestand === 'src/agenten/AiVerbinden.tsx' && e.uk === 'Підключити ШІ до технічного простору');
  const profiel = UI_ELEMENTEN.find((e) => e.bestand === 'src/agenten/TabExtensie.tsx' && e.uk === 'Технічний профіль');
  check('4 toegang per element: technische tak van AiVerbinden → technisch (#technisch), «Технічний профіль» van TabExtensie → profiel', tech?.toegang === 'technisch' && tech?.hash === 'technisch' && profiel?.toegang === 'profiel', `${tech?.toegang}/${tech?.hash} ${profiel?.toegang}`);
  check('4 privé-knoppen van dezelfde bestanden blijven voor iedereen', UI_ELEMENTEN.some((e) => e.bestand === 'src/agenten/AiVerbinden.tsx' && e.toegang === 'iedereen'));
  const toeg = gen.toegangVoor as (src: string) => (i: number) => string;
  const s4 = `function X({technisch}){return <div>{!technisch && <b>a</b>}{technisch ? <i>b</i> : <u>c</u>}</div>}`;
  const t4 = toeg(s4);
  check('4 toegangVoor: ontkende voorwaarde en else-tak zijn niet technisch', t4(s4.indexOf('<b>')) === 'iedereen' && t4(s4.indexOf('<i>')) === 'technisch' && t4(s4.indexOf('<u>')) === 'iedereen');

  const TABS = ['overview', 'accounts', 'search'];
  const kring = `export function P({tab}){return tab==='accounts' ? <A/> : null}
function A(){return <div><button>{tr('Кнопка А','Knop A')}</button>{x && <B/>}</div>}
function B(){return <div><button>{tr('Кнопка Б','Knop B')}</button>{y && <A/>}</div>}`;
  for (const zonderGeheugen of [false, true]) {
    const els = gen.elementenUit(kring, 'src/X.tsx', TABS, { zonderGeheugen }) as Array<{ uk: string; tabHint: string }>;
    const a = els.find((e) => e.uk === 'Кнопка А'), b = els.find((e) => e.uk === 'Кнопка Б');
    check(`5 wederzijdse recursie A ↔ B: beide houden het tabblad van de pagina (accounts)${zonderGeheugen ? ' — zonder geheugen' : ''}`, a?.tabHint === 'accounts' && b?.tabHint === 'accounts', `${a?.tabHint}/${b?.tabHint}`);
  }

  // 6. Gmail-beheer
  const mf = lees('src/MailFunctioneelWeergave.tsx');
  check("6 mail/accounts rendert GoogleMailWorkspace mode='accounts' (actieve postbus, «Оновити доступ» voor zoeken), open als toegang nodig is", /<GoogleMailWorkspace lang=\{lang\} tab='inbox' mode='accounts'/.test(mf) && /mailSearchConsentRequired\)\|\|undefined/.test(mf));
  // 7. deel 2 (vlaggen): cloud vNext en agenda v3
  const cp = lees('src/cloud-vnext/CloudPagina.tsx'), bron = lees('src/cloud-vnext/onderdelen/Bron.tsx'), zk = lees('src/cloud-vnext/onderdelen/Zoeken.tsx');
  const best = lees('src/cloud-vnext/onderdelen/Bestanden.tsx'), bb = lees('backend/cloud-vnext-bestanden.ts'), bi = lees('backend/cloud-vnext-integraties.ts');
  check('7 cloud vNext: diepe link → overdracht (cvn-open / cvn-drive-open) en het juiste tabblad', /DIEPE_PARAMS\.item/.test(cp) && /sessieZet\('cvn-open', item\)/.test(cp) && /sessieZet\('cvn-drive-open'/.test(cp) && /naarTab\(d\)/.test(cp));
  check('7 cloud vNext Zoeken: leest de nieuwe namen via diepeRoute (oude «drive»/«item» lazen na 05.11 niets meer)', /diepeRoute\(r\.route, r\.soort\)/.test(zk) && /params\[DIEPE_PARAMS\.bestand\]/.test(zk) && !/params\.drive\b/.test(zk));
  check('7 cloud vNext Bestanden: kale id → één bestand van de server, anders een melding (vroeger stil genegeerd)', /cloudClient\.bestanden\(\{ id: open \}\)/.test(best) && /Файл не знайдено/.test(best));
  check('7 server: bestanden met id → alleen via eenItem (lade van de gebruiker)', /if \(d\.id !== undefined\) \{\s*const r = await eenItem\(lade, d\.id\);/.test(bb));
  check('7 integraties geven principalId mee; Bron kiest daarmee het account en wist de overdracht pas in het effect', /principalId: String\(item\.principalId\)/.test(bi) && /a\.principalId === overdracht\.current\?\.principal/.test(bron) && /sessieLees\('cvn-drive-open'\)/.test(bron) && !/sessieNeem\('cvn-drive-open'\)/.test(bron));
  const ag = lees('src/agenda/v3/AgendaPagina.tsx');
  check('7 agenda v3: open_event_id opent het detail op de dag van de afspraak, anders een melding', /diepeWaarde\(location\.search, DIEPE_PARAMS\.afspraak\)/.test(ag) && /setDetail\(item\)/.test(ag) && /v\.zetDatum\(dag\)/.test(ag));
  check('7 dagVanItem: hele dag blijft de datum', dagVanItem({ begin: '2026-12-31', heleDag: true }) === '2026-12-31');
  check('7 dagVanItem: tijdstip → plaatselijke dag', dagVanItem({ begin: '2026-12-03T10:00:00+01:00', heleDag: false }) === (() => { const d = new Date('2026-12-03T10:00:00+01:00'); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })());
  check('7 dagVanItem: onzin → leeg', dagVanItem({ begin: 'gisteren', heleDag: false }) === '');
  const gm = lees('src/GoogleMailWerkruimte.tsx');
  check('7 Gmail: de bijlage pas beoordelen als de volledige brief er is (de voorlopige rij heeft geen bijlagen)', /detail\.id!==wacht\.bericht\|\|detailLoading\)return;/.test(gm) && /\},\[detail,detailLoading\]\);/.test(gm));
  const db = lees('src/DriveBrowser.tsx');
  check('7 oude Drive-browser: met een diepe link geen hervatting van de vorige sessie (die zou het bestand vervangen); principalId getypeerd', /if\(startAtRoot\|\|initialOpenFileId\)/.test(db) && /principalId\?:string\}/.test(db) && /item\.principalId===principal/.test(db));
  // 8. Bugbot op PR #31: de oude cloudpagina zocht open_item_id alleen in de bootstrap (een deel van een grote bibliotheek)
  const cf = lees('src/CloudFunctioneelWeergave.tsx'), cpl = lees('backend/cloud-platform.ts');
  check('8 oude cloud: item buiten de bootstrap → /items/:id/open bij de server, «niet gevonden» pas als de server het niet kent', /void openItem\(stub, true\)/.test(cf) && /uitZoek && \/NOT_FOUND\|ANDERE_RUIMTE\/\.test/.test(cf) && /encodeURIComponent\(gegeven\.id\)/.test(cf));
  check('8 server: /items/:id/open geeft titel en werkruimte mee (eigenaar via ownerItem)', /const kop = \{ title: String\(item\.title \|\| ''\), workspaceId/.test(cpl) && /ownerItem\(auth\.user\.id, ctx\.params\.id\)/.test(cpl));
  check('contract: de parameternamen', DIEPE_PARAMS.bericht === 'open_message_id' && DIEPE_PARAMS.item === 'open_item_id' && DIEPE_PARAMS.bestand === 'open_file_id' && DIEPE_PARAMS.afspraak === 'open_event_id');
  return einde();
}
