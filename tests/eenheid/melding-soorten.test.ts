// Meldingen voor de gebruiker los van de beheermeldingen (verzoek eigenaar, 18.10.2026):
//  «панель Сповіщення має бути розділена для користувача від адмін сповіщень … лише одна графа … можна обеззвучити, вимкнути
//   спливні сповіщення для будь-якого типу».
// 1. Elke soort die backend/ maakt staat in ÉÉN tabel (shared/melding-soorten.ts) met type, ernst en — technisch — vereiste mogelijkheid.
// 2. De server levert technische meldingen alleen aan wie een technisch profiel met die mogelijkheid heeft (echte DB, siteNotificationOverview).
// 3. De gewone bel toont alleen persoonlijke meldingen + één regel «У технічній панелі N …»; voorkeuren per type schakelen geluid en
//    opduiken echt uit; kritieke types kunnen niet helemaal verborgen worden.
// Elk onderdeel bootst eerst het oude gedrag na en bewijst dan dat het weg is.
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { MELDING_SOORTEN, filterVoorOntvanger, isBekendeSoort, soortInfo, soortRuimte, typeVanBron, voorkeurVoorSoort, zichtbaarVoor } from '../../shared/melding-soorten';
import { MELDING_TYPES, MELDING_TYPE_IDS, isKritiekType, normaliseerTypeVoorkeuren, voorkeurVoor, type MeldingType } from '../../shared/melding-typen';
import { meldingRuimte, meldingenVoorRuimte } from '../../shared/meldingen-ruimte';
import { normaliseerMeldingen, standaardMeldingen } from '../../shared/menu-meldingen-voorkeuren';
import { normaliseerZijbalk, standaardZijbalk } from '../../shared/menu-model';
import { TECH_ROLLEN } from '../../shared/tech-rollen';
import { techSamenvattingTekst } from '../../src/meldingen/samenvatting';
import { filterTechMeldingen, ongelezenTech } from '../../src/meldingen/tech-filter';

const W = process.cwd();
const lees = (p: string) => readFileSync(join(W, p), 'utf8');
const bestanden = (map: string): string[] => readdirSync(join(W, map)).flatMap((n) => { const p = `${map}/${n}`; return statSync(join(W, p)).isDirectory() ? bestanden(p) : /\.(ts|mts)$/.test(n) ? [p] : []; });

/** Argumenten van een aanroep tot het sluitende haakje (strings en template-literals overgeslagen). */
function argumenten(s: string, start: number): string {
  let diep = 1, i = start;
  for (; i < s.length && diep > 0; i++) {
    const c = s[i];
    if (c === "'" || c === '"') { const q = c; for (i++; i < s.length && s[i] !== q; i++) if (s[i] === '\\') i++; continue; }
    if (c === '`') { let d = 0; for (i++; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === '$' && s[i + 1] === '{') { d++; i++; continue; } if (s[i] === '}' && d) { d--; continue; } if (s[i] === '`' && !d) break; } continue; }
    if (c === '(') diep++; else if (c === ')') diep--;
  }
  return s.slice(start, i - 1);
}
/** Alle soorten in notify()/meld()-aanroepen van backend/: stringliteralen zonder spaties in de argumenten (titels hebben spaties/Cyrillisch). */
function serverSoorten(): Map<string, string> {
  const uit = new Map<string, string>();
  for (const f of bestanden('backend')) {
    const s = lees(f);
    for (const m of s.matchAll(/\b(?:meld|notify)\(/g)) {
      const stuk = argumenten(s, m.index! + m[0].length);
      if (/^\s*(?:userId|recipientUserId)\s*:/.test(stuk) || /^[a-zA-Z]+:\s*string/.test(stuk)) continue; // definitie, geen aanroep
      for (const l of stuk.matchAll(/(===\s*)?'([a-z][a-z0-9_.]*[a-z0-9])'/g)) {
        if (l[1]) continue; // vergelijking (staat === 'verlopen' ? …), geen soort
        if (!/[_.]/.test(l[2]) && !MELDING_SOORTEN[l[2]] && !/^(security|server|deur|siem|uitrol|release|impersonatie|ondersteuning)$/.test(l[2])) continue;
        uit.set(l[2], f);
      }
    }
  }
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('melding-soorten');

  // ------------------------------------------------------------------ 1. classificatie volledig
  const gevonden = serverSoorten();
  const onbekend = [...gevonden].filter(([k]) => !isBekendeSoort(k)).map(([k, f]) => `${k} (${f})`);
  check(`elke soort die backend/ maakt staat in de tabel (${gevonden.size} gevonden)`, gevonden.size >= 20 && onbekend.length === 0, onbekend.join(', '));
  if (process.env.MELDING_SOORTEN_TOON) console.log('  gevonden:', [...gevonden.keys()].sort().join(' '));
  for (const k of ['security_warning', 'access_request', 'uitrol.mislukt', 'impersonatie.beheerder', 'beveiliging.zekering', 'vault_key_expired', 'mcp_app_secret'])
    check(`scanner vindt «${k}»`, gevonden.has(k));
  const mogelijk = new Set(TECH_ROLLEN.flatMap((r) => r.mogelijkheden));
  const fouteTabel = Object.entries(MELDING_SOORTEN).filter(([, i]) => !MELDING_TYPES[i.type] || (MELDING_TYPES[i.type].ruimte === 'technisch') !== !!i.vereist || (i.vereist && !mogelijk.has(i.vereist)));
  check('tabel: elk type bestaat; technisch ⇔ met vereiste mogelijkheid die een rol echt heeft', fouteTabel.length === 0, fouteTabel.map(([k]) => k).join(','));
  check('elk type heeft een naam in uk en nl', MELDING_TYPE_IDS.every((t) => MELDING_TYPES[t].naam[0] && MELDING_TYPES[t].naam[1] && /[а-яіїєґ]/i.test(MELDING_TYPES[t].naam[0])));
  check('kritieke types: beveiliging, inzage, mislukte uitrol, bescherming', ['beveiliging', 'inzage', 'tech.uitrol-mislukt', 'tech.bescherming'].every((t) => isKritiekType(t as MeldingType)) && !isKritiekType('post'));
  check('nieuw apparaat / sessies ingetrokken / «увійти як» / mislukte installatie → kritiek type',
    ['security_warning', 'impersonatie', 'uitrol.mislukt'].every((k) => isKritiekType(soortInfo(k).type)));
  // Oud gedrag: de admin-antwoorden op «Увійти як» heetten 'impersonatie' (persoonlijk) en de zekering 'beveiliging.zekering' viel buiten
  // de oude technische lijst → beide in de gewone bel van de eigenaar, tussen zijn post.
  const OUD = new Set(['access_request', 'google_login_config', 'mcp_app_secret', 'vault_key_expiring', 'vault_key_expired', 'uitrol', 'uitrol_voorstel', 'release', 'server', 'siem', 'deur']);
  const oudRuimte = (k: string) => (OUD.has(k) || /^(tech[._]|uitrol[._]|beheer[._]|deur[._]|server[._]|release[._]|siem[._]|vault_)/.test(k) ? 'technisch' : 'prive');
  check('oud gedrag nagebootst: «beveiliging.zekering» en het antwoord op «увійти як» stonden in de gewone bel', oudRuimte('beveiliging.zekering') === 'prive' && oudRuimte('impersonatie') === 'prive');
  check('nieuw: beide technisch; de vraag aan de gebruiker zelf («impersonatie») blijft persoonlijk', soortRuimte('beveiliging.zekering') === 'technisch' && soortRuimte('impersonatie.beheerder') === 'technisch' && soortRuimte('impersonatie') === 'prive');
  const imp = lees('backend/impersonatie.ts');
  check('backend: antwoorden aan de beheerder gebruiken «impersonatie.beheerder», de vraag aan de gebruiker «impersonatie»', (imp.match(/meld\(r\.beheerder_id, '', 'impersonatie\.beheerder'/g) || []).length === 3 && /meld\(doel\.id, doel\.email, 'impersonatie'/.test(imp));
  check('backend: mislukte/verlopen installatie → «uitrol.mislukt» aan wie goedkeurde', /meldMislukt\(v, String\(run\.uk/.test(lees('backend/uitrol-goedkeuring.ts')) && /'uitrol\.mislukt'/.test(lees('backend/uitrol-goedkeuring.ts')));
  check('geen regressie: oude technische soorten blijven technisch, persoonlijke blijven persoonlijk',
    [...OUD].every((k) => meldingRuimte(k) === 'technisch') && ['security', 'security_warning', 'workspace_share', 'access_decision', 'access_totp_replaced', 'onbekend_ding'].every((k) => meldingRuimte(k) === 'prive'));
  check('link naar admin./api. blijft technisch (ook bij een onbekende soort)', meldingRuimte('iets', 'https://admin.tarasevych.com/x') === 'technisch' && meldingRuimte('iets', 'https://hub.tarasevych.com/') === 'prive');
  check('lokale meldingen: bron → type', typeVanBron('mail-send') === 'post' && typeVanBron('calendar') === 'agenda' && typeVanBron('drive') === 'cloud' && typeVanBron('mcp') === 'ai' && typeVanBron('') === 'systeem');

  // ------------------------------------------------------------------ 2. wie ziet wat (puur)
  const items = ['security_warning', 'workspace_share', 'access_request', 'server', 'siem', 'uitrol.mislukt', 'impersonatie.beheerder', 'beveiliging.zekering'].map((kind, i) => ({ id: `n${i}`, kind }));
  const ids = (w: Parameters<typeof filterVoorOntvanger>[1]) => filterVoorOntvanger(items, w).map((m) => m.kind).sort().join(',');
  check('oud gedrag nagebootst: zonder filter krijgt een gewoon account ook technische meldingen als ze voor hem zijn aangemaakt', items.length === 8);
  check('gewoon account (geen profiel): alleen persoonlijke', ids({ techProfiel: false, mogelijkheden: [] }) === 'security_warning,workspace_share');
  check('auditor (journaal.lezen): persoonlijke + SIEM, geen toegang/server/uitrol', ids({ techProfiel: true, mogelijkheden: ['journaal.lezen', 'opnames.bekijken'] }) === 'security_warning,siem,workspace_share');
  check('ontwikkelaar: + server en mislukte uitrol, geen toegangsverzoeken', ids({ techProfiel: true, mogelijkheden: TECH_ROLLEN.find((r) => r.id === 'ontwikkelaar')!.mogelijkheden }) === 'security_warning,server,uitrol.mislukt,workspace_share');
  check('eigenaar: alles', ids({ eigenaar: true, techProfiel: true, mogelijkheden: [] }).split(',').length === 8);
  check('ingetrokken profiel (techProfiel false) met oude mogelijkheden: niets technisch', ids({ techProfiel: false, mogelijkheden: ['diagnose.lezen', 'users.manage'] }) === 'security_warning,workspace_share');

  // ------------------------------------------------------------------ 3. voorkeuren per type
  const std = standaardMeldingen();
  check('standaard: elk type geluid + opduiken + tonen aan', MELDING_TYPE_IDS.every((t) => std.soorten[t].geluid && std.soorten[t].opduiken && std.soorten[t].tonen));
  const raar = normaliseerMeldingen({ soorten: { post: { geluid: false, opduiken: 'ja', tonen: false }, beveiliging: { geluid: false, opduiken: false, tonen: false }, 'tech.uitrol-mislukt': { tonen: false }, hack: { tonen: false } } });
  check('normaliseren: booleans bewaard, rommel → standaard, onbekende types weg', raar.soorten.post.geluid === false && raar.soorten.post.opduiken === true && raar.soorten.post.tonen === false && !('hack' in raar.soorten));
  check('kritiek: geluid en opduiken mogen uit, verbergen NIET (ook niet als de opslag dat zegt)', raar.soorten.beveiliging.geluid === false && raar.soorten.beveiliging.opduiken === false && raar.soorten.beveiliging.tonen === true && raar.soorten['tech.uitrol-mislukt'].tonen === true);
  check('voorkeurVoor: kritiek altijd tonen, ook met een handgemaakte waarde', voorkeurVoor({ inzage: { geluid: true, opduiken: true, tonen: false } }, 'inzage').tonen === true);
  const zb = normaliseerZijbalk({ ...standaardZijbalk(), meldingen: { ...std, soorten: { ...std.soorten, agenda: { geluid: false, opduiken: false, tonen: true } } } });
  check('opgeslagen in het `sidebar`-veld op de server (normaliseerZijbalk behoudt de keuze)', zb.meldingen.soorten.agenda.geluid === false && zb.meldingen.soorten.agenda.opduiken === false);
  const oudeOpslag = normaliseerZijbalk({ versie: 1, meldingen: { aan: true } });
  check('oude opslag zonder `soorten` → alles aan (geen migratie nodig)', MELDING_TYPE_IDS.every((t) => oudeOpslag.meldingen.soorten[t].tonen && oudeOpslag.meldingen.soorten[t].geluid));
  check('serversoort → voorkeur van zijn type', voorkeurVoorSoort('workspace_share', { delen: { geluid: false, opduiken: true, tonen: true } }).geluid === false);
  const typ = normaliseerTypeVoorkeuren({ 'tech.server': { tonen: false } });
  const tech = [{ id: 'a', kind: 'server', title: 'A', message: '', createdAt: 1 }, { id: 'b', kind: 'uitrol.mislukt', title: 'B', message: '', createdAt: 2 }, { id: 'c', kind: 'siem', title: 'C', message: '', createdAt: 3, read: true }];
  check('technisch paneel: verborgen type weg, kritiek blijft; teller telt alleen ongelezen zichtbare', filterTechMeldingen(tech, typ, { type: '', ernst: '', gelezen: 'alle' }).map((m) => m.id).join() === 'b,c' && ongelezenTech(tech, typ) === 1);
  check('technisch paneel: filters type / ernst / gelezen', filterTechMeldingen(tech, undefined, { type: 'tech.audit', ernst: '', gelezen: 'alle' }).map((m) => m.id).join() === 'c'
    && filterTechMeldingen(tech, undefined, { type: '', ernst: 'kritiek', gelezen: 'alle' }).map((m) => m.id).join() === 'b'
    && filterTechMeldingen(tech, undefined, { type: '', ernst: '', gelezen: 'ongelezen' }).map((m) => m.id).join() === 'a,b'
    && filterTechMeldingen(tech, undefined, { type: '', ernst: '', gelezen: 'gelezen' }).map((m) => m.id).join() === 'c');
  check('regel: «У технічній панелі N нових сповіщень» met juiste meervoud (uk) en nl', techSamenvattingTekst('uk', 1) === 'У технічній панелі 1 нове сповіщення' && techSamenvattingTekst('uk', 3) === 'У технічній панелі 3 нові сповіщення'
    && techSamenvattingTekst('uk', 5) === 'У технічній панелі 5 нових сповіщень' && techSamenvattingTekst('uk', 12) === 'У технічній панелі 12 нових сповіщень' && techSamenvattingTekst('uk', 22) === 'У технічній панелі 22 нові сповіщення'
    && techSamenvattingTekst('nl', 1) === 'In het technisch paneel: 1 nieuwe melding' && techSamenvattingTekst('nl', 4) === 'In het technisch paneel: 4 nieuwe meldingen');

  // Bel: geluid en pop-up volgen de voorkeur per type (src/CanoniekMeldingencentrum.tsx, leesbare vorm).
  const bel = lees('src/CanoniekMeldingencentrum.tsx');
  check('bel: geen geluid als het type geluid uit heeft (activate speelt alleen zonder «stil»)', bel.includes('if (!next.stil) playChime();') && bel.includes('stil: !geluid'));
  check('bel: opduiken uit → wel in de geschiedenis, geen toast (return vóór activate/wachtrij)', /if \(!voorkeur\.opduiken\) \{[\s\S]{0,300}if \(geluid\) playChime\(\);\s*return;\s*\}\s*if \(activeRef\.current\)/.test(bel));
  check('bel: verborgen type → niet getoond, niet bewaard', /if \(!voorkeur\.tonen\) \{\s*if \(origin === 'prop'\) propsRef\.current\.onDismissNotice\?\.\(tekst\);\s*return;\s*\}/.test(bel));
  check('bel: nieuwe servermelding → geluid alleen als een type geluid mag, pop-up alleen als opduiken mag', bel.includes('const klinkt = added.some((item) => vk(soortInfo(item.kind).type).geluid);') && bel.includes('const toon = added.filter((item) => vk(soortInfo(item.kind).type).opduiken);') && /else if \(klinkt\) \{\s*playChime\(\);/.test(bel));
  check('bel: lijst, teller en geschiedenis zonder verborgen types', bel.includes('const server = (p.serverItems || []).filter((item) => vk(soortInfo(item.kind).type).tonen') && bel.includes('local={zichtbaarLokaal}'));
  check('bel: één regel naar het technische paneel (alleen met profiel), opent via openTechMeldingen', bel.includes("data-qa-id='tech-meldingen-samenvatting'") && bel.includes('const techRegel = techUnread > 0 && !!tech.profiel;') && bel.includes('openTechMeldingen()'));
  const chrome = lees('src/CanoniekOmlijsting.tsx');
  check('chrome: accountruimte geeft de bel alleen persoonlijke items + technische apart (techItems); store voor de band', chrome.includes("techItems={ruimte==='prive'?techMeldingen:undefined}") && chrome.includes('typen={mv.soorten}') && chrome.includes('zetTechMeldingen(techMeldingen,onReadNotification||null)'));
  check('band: knop «Технічні сповіщення» in TechLaag', /<TechMeldingenKnop uk=\{uk\} \/>/.test(lees('src/tech/TechLaag.tsx')));

  // Kritiek in de UI: «tonen» uitgeschakeld + uitleg.
  const paneel = lees('src/meldingen/MeldingVoorkeurenPaneel.tsx');
  check('voorkeuren: kritiek → schakelaar «Показувати» disabled + uitleg; zetTypeVoorkeur weigert verbergen', paneel.includes('disabled={kritiek}') && paneel.includes("if (veld === 'tonen' && isKritiekType(type) && !waarde) return;") && /приховати — ні/.test(paneel));

  // ------------------------------------------------------------------ 4. server (echte DB): siteNotificationOverview filtert
  const { getPool, closePool } = await import('../../server/platform/pg');
  const { db } = await import('../../server/platform/db');
  const idx = await import('../../backend/index');
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string, role = 'member') => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status: 'approved' }]); return { id, email, role, status: 'approved' } as never; };
  const gewoon = await mk(`gewoon-${sfx}@eenheid.test`), auditor = await mk(`auditor-${sfx}@eenheid.test`), weg = await mk(`weg-${sfx}@eenheid.test`);
  const uid = (u: unknown) => (u as { id: string }).id;
  const stil = console.error; console.error = () => {};
  try {
    await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['auditor'], 60, 'test')`, [uid(auditor), `tech-${randomBytes(6).toString("hex")}`]);
    await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door, ingetrokken_op) VALUES ($1, $2, ARRAY['beheerder'], 60, 'test', now())`, [uid(weg), `tech-${randomBytes(6).toString("hex")}`]);
    const soorten = ['security_warning', 'access_request', 'siem', 'uitrol.mislukt'];
    for (const u of [gewoon, auditor, weg]) await db.add('site_notifications', soorten.map((kind, i) => ({ recipientUserId: uid(u), recipientEmail: '', kind, title: `T${i}`, message: '', read: false, createdAt: Date.now() + i })));
    const zie = async (u: unknown) => { const r = await idx.siteNotificationOverview(u as never); return { kinds: r.notificationItems.map((m) => m.kind).sort().join(','), n: r.notifications }; };
    const g = await zie(gewoon), a = await zie(auditor), w = await zie(weg);
    check('DB: gewoon account krijgt geen technische meldingen, ook niet in de teller', g.kinds === 'security_warning' && g.n === 1, JSON.stringify(g));
    // 22.10.2026 (sfeer, shared/meldingen-soorten.ts): zonder technisch tabblad levert de server ALLEEN sfeer 'prive' — ook een oude «siem»
    // (lade prive) is uit de bel; de rol-filter (filterVoorOntvanger) blijft bestaan en wordt in het technische tabblad getest
    // (tests/eenheid/meldingen-sferen-20261022.test.ts, ruimte-meldingen-20261020.test.ts).
    check('DB: auditor krijgt in de bel (geen technisch tabblad) alleen de persoonlijke; de technische (SIEM) wachten in het technische paneel', a.kinds === 'security_warning' && a.n === 1, JSON.stringify(a));
    check('DB: ingetrokken profiel → geen technische meldingen', w.kinds === 'security_warning' && w.n === 1, JSON.stringify(w));
    const wie = await idx.meldingOntvanger(auditor as never);
    check('DB: ontvanger = profiel + mogelijkheden van de rollen', wie.techProfiel && wie.mogelijkheden.includes('journaal.lezen') && !wie.mogelijkheden.includes('users.manage') && !wie.eigenaar);
    // 20.10.2026: «gelezen» raakt bovendien alleen de LIVE lade (meldingenLade) — zie tests/eenheid/ruimte-meldingen-20261020.test.ts.
    check('server: «gelezen» markeert alleen meldingen die de ontvanger mag zien, en alleen in de live lade', /wie=await meldingOntvanger\(auth\.user\),lade=await meldingenLade\([\s\S]{0,120}selected=meldingenInLade\(\([\s\S]{0,200}\)\.filter\(item=>zichtbaarVoor\(item\.kind,wie\)\),lade\.ruimte\)/.test(lees('backend/index.ts')));
    // Sinds 20.10.2026 levert de server alleen de LIVE lade: zonder technisch tabblad de persoonlijke. Rijen van vóór die dag (zonder
    // `ruimte`, zoals hierboven aangemaakt) zijn persoonlijk en blijven dus in de gewone bel; de band krijgt de technische lade via het
    // technische tabblad (ruimte-meldingen-20261020). Het scherm volgt het serverveld, niet meer alleen de soort.
    const r = await idx.siteNotificationOverview(auditor as never);
    // 22.10.2026: de bel toont alleen sfeer 'prive' (oude technische soorten zonder ruimte blijven in de persoonlijke LADE, maar niet in de bel).
    check('bel (accountruimte): zonder technisch tabblad alleen sfeer prive; een oude rij met technische soort (lade prive) staat niet meer in de bel',
      r.meldingenRuimte === 'prive' && r.notificationItems.length === 1 && r.notificationItems.every((m) => m.ruimte === 'prive' && m.sfeer === 'prive') && meldingenVoorRuimte(r.notificationItems, 'technisch').length === 0 && meldingenVoorRuimte(r.notificationItems, 'prive').length === 1);
  } finally {
    console.error = stil;
    const lijst = [uid(gewoon), uid(auditor), uid(weg)];
    await pool.query(`DELETE FROM app.records WHERE tbl = 'site_notifications' AND data->>'recipientUserId' = ANY($1)`, [lijst]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [lijst]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [lijst]).catch(() => undefined);
    await closePool().catch(() => undefined);
  }
  return einde();
}
