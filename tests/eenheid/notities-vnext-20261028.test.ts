// NOTITIES vNEXT (28.10.2026, migratie 0127, backend/notities-vnext.ts, shared/notities-vnext-model.ts).
//
// WAT DEZE TEST VASTHOUDT:
//   1. 0 VERLIES. Elke hub-notitie van het bord (kind 'note', etiket 'hub') staat na 0127 in app.notities met DEZELFDE id, titel,
//      tekst, datums, ruimte, soort/kleur/vast uit de etiketten; de bordrij zelf is niet veranderd (sha256 vooraf = achteraf).
//      0127 draait twee keer zonder fout en zonder dubbelen; de migratie bevat geen UPDATE/DELETE op het bord.
//   2. DE SPIEGEL. Aanmaken/wijzigen/vastzetten/archiveren in vNext → dezelfde id in app.mcp_console_items met titel ≤ 160,
//      tekst ≤ 4000 en ≤ 8 geldige etiketten; prullenbak haalt de spiegel weg, herstel zet haar terug.
//   3. DE OUDE WEG. bordNotitieToevoegen/Wijzigen/Verwijderen (wat manage_hub_notes en PATCH /api/mcp/board doen) schrijven in
//      vNext; een ongewijzigde afgeknotte tekst knot de lange inhoud NIET af; verwijderen = prullenbak, herstelbaar.
//   4. RUIMTES EN RLS. De technische lade ziet de persoonlijke notities niet en andersom; een andere gebruiker ziet niets.
//   5. VERSIES. Een wijziging met een verouderde versie → VERSIE_VEROUDERD met de huidige notitie; elke inhoudelijke wijziging
//      laat een revisie achter; een revisie is terug te zetten; vastzetten/archiveren maakt geen revisie en geen versiesprong.
//   6. IMPORT/EXPORT. Markdown, tekst en JSON; dubbelen vooraf gezien en overgeslagen; onbekend formaat en kapotte JSON geven een
//      fout per bestand; HTML in een bestand wordt tekst (geen opmaak), nooit uitvoerbaar.
//   7. VEILIGE WEERGAVE. markdownNaarHtml ontsnapt alles, laat alleen https-koppelingen door, geen javascript:/data:, geen ruwe HTML.
//   8. CATALOGUS. Elke bron heeft een eerlijke stand; «beschikbaar» alleen voor wat deze release doet (bestanden); geen bron
//      belooft tweerichtingssynchronisatie.
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import * as vn from '../../backend/notities-vnext';
import {
  BRON_STAND_LABEL, NOTITIE_BRONNEN, SPIEGEL_ETIKET, VN_MAX_TITEL, invoerUitBord, lijstRegelOmzetten, lijstRegels, markdownNaarHtml, markeerDubbelen,
  naarChecklist, parseerImport, platteTekst, schoneInvoer, spiegelEtiketten, titelUitInhoud, vingerafdruk, vnEtiketten, vnSchoonEtiket, vnVeiligeKoppeling, zoekWoorden,
} from '../../shared/notities-vnext-model';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { checker } from './hulp/nep-google';

const lees = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export async function main(): Promise<number> {
  const { check, einde } = checker('notities-vnext-20261028');
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string) => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'member', status: 'approved' }]); return id; };
  const a = await mk(`vn-a-${sfx}@eenheid.test`);
  const b = await mk(`vn-b-${sfx}@eenheid.test`);
  const prive = { userId: a, ruimte: 'prive' as const };
  const tech = { userId: a, ruimte: 'technisch' as const };
  const ander = { userId: b, ruimte: 'prive' as const };

  try {
    // ================================================================ 1. migratie: 0 verlies
    const mig = lees('migrations/0127_notities_vnext.sql');
    check('0127 bevat geen UPDATE/DELETE op het bord (de oude rijen blijven onaangeroerd)',
      !/\bUPDATE\s+app\.mcp_console_items\b/i.test(mig) && !/\bDELETE\s+FROM\s+app\.mcp_console_items\b/i.test(mig) && /ON CONFLICT \(id\) DO NOTHING/.test(mig));
    // Legacy hub-notities van VÓÓR de migratie nabootsen: rechtstreeks op het bord, met de oude etiketvorm.
    const legacy = [
      { title: 'Oud boodschappen', body: '- [ ] melk\n- [x] brood', tags: ['hub', 'soort:lijst', 'kleur:geel', 'vast', 'huis'], ruimte: 'prive' },
      { title: 'Oud code', body: 'console.log(1)', tags: ['hub', 'soort:code'], ruimte: 'prive' },
      { title: 'Oud technisch', body: 'server-notitie', tags: ['hub', 'ops'], ruimte: 'technisch' },
      { title: 'Geen hub-notitie', body: 'gewone bordnotitie', tags: ['los'], ruimte: 'prive' },
    ];
    const legacyIds: string[] = [];
    for (const l of legacy) {
      const r = await pool.query(`INSERT INTO app.mcp_console_items (user_id, kind, title, body, author, tags, ruimte, created_at, updated_at) VALUES ($1,'note',$2,$3,'operator',$4,$5, now() - interval '3 days', now() - interval '2 days') RETURNING id`, [a, l.title, l.body, l.tags, l.ruimte]);
      legacyIds.push(String(r.rows[0].id));
    }
    const hashVoor = (await pool.query(`SELECT string_agg(id::text || title || body || array_to_string(tags, ',') || ruimte || updated_at::text, '|' ORDER BY id) AS h FROM app.mcp_console_items WHERE user_id = $1`, [a])).rows[0].h;
    await getPool('migratie').query(mig);
    await getPool('migratie').query(mig);
    const hashNa = (await pool.query(`SELECT string_agg(id::text || title || body || array_to_string(tags, ',') || ruimte || updated_at::text, '|' ORDER BY id) AS h FROM app.mcp_console_items WHERE user_id = $1`, [a])).rows[0].h;
    check('0127 draait twee keer zonder fout en laat de bordrijen byte voor byte zoals ze waren', hashVoor === hashNa);
    const over = (await pool.query(`SELECT * FROM app.notities WHERE user_id = $1 ORDER BY created_at`, [a])).rows;
    check('elke hub-notitie (3 van de 4 bordnotities) staat in app.notities met dezelfde id; de niet-hub-notitie niet', over.length === 3 && legacyIds.slice(0, 3).every((id) => over.some((r) => String(r.id) === id)) && !over.some((r) => String(r.id) === legacyIds[3]));
    const o0 = over.find((r) => String(r.id) === legacyIds[0]);
    check('soort/kleur/vast/vrije etiketten komen uit de oude etiketten; titel, tekst en datums zijn gelijk',
      o0?.soort === 'lijst' && o0?.kleur === 'geel' && Boolean(o0?.vast_sinds) && JSON.stringify(o0?.etiketten) === '["huis"]' && o0?.titel === 'Oud boodschappen' && o0?.inhoud_md === '- [ ] melk\n- [x] brood'
      && String(o0?.herkomst?.bron) === 'legacy-bord' && o0?.herkomst?.legacy_sha256 === sha('Oud boodschappen\n- [ ] melk\n- [x] brood'));
    check('de ruimte reist mee: de technische hub-notitie blijft technisch, de persoonlijke persoonlijk', over.find((r) => String(r.id) === legacyIds[2])?.ruimte === 'technisch' && o0?.ruimte === 'prive');
    check('de vlag notities-vnext bestaat en staat UIT (standaard de oude pagina)', (await pool.query(`SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'notities-vnext'`)).rows[0]?.aan === false);
    check('de vlag heeft een uitleg in gewone woorden (shared/vlaggen.ts)', Boolean(VLAG_UITLEG['notities-vnext']?.wat[0]) && Boolean(VLAG_UITLEG['notities-vnext']?.gevolg[1]));

    // ================================================================ 2. lijst, spiegel
    const l1 = await vn.notitiesLijst(prive, {});
    check('de lijst van de persoonlijke lade toont precies de 2 persoonlijke hub-notities, vastgezette eerst', l1.notities.length === 2 && l1.notities[0].id === legacyIds[0] && l1.notities[0].vast && l1.telling.alle === 2 && l1.telling.vast === 1 && l1.telling.lijsten === 1);
    const lT = await vn.notitiesLijst(tech, {});
    check('de technische lade ziet alleen haar eigen notitie (ruimtes gescheiden)', lT.notities.length === 1 && lT.notities[0].id === legacyIds[2]);
    const lB = await vn.notitiesLijst(ander, {});
    check('een andere gebruiker ziet niets', lB.notities.length === 0 && lB.telling.alle === 0);

    const lang = 'x'.repeat(5000);
    const n1 = await vn.notitieMaken(prive, { titel: 'Nieuwe lange notitie', inhoud: `# Kop\n\n${lang}\n\n- [ ] punt`, soort: 'tekst', kleur: 'blauw', etiketten: ['проєкт', 'werk'], mapId: null, vast: false }, { auteur: 'test' });
    if ('fout' in n1) throw new Error('maken mislukt');
    const sp1 = (await pool.query(`SELECT * FROM app.mcp_console_items WHERE id = $1`, [n1.id])).rows[0];
    check('aanmaken in vNext spiegelt naar het bord met dezelfde id, tekst ≤ 4000, en alleen etiketten die de oude regel aankan',
      sp1 && sp1.kind === 'note' && sp1.body.length === 4000 && sp1.body === n1.inhoud.slice(0, 4000) && JSON.stringify(sp1.tags) === JSON.stringify(['hub', 'kleur:blauw', 'werk']) && sp1.ruimte === 'prive');
    check('de notitie zelf houdt de volledige inhoud (5000+ tekens) en het Oekraïense etiket', n1.inhoud.length > 5000 && n1.etiketten.includes('проєкт') && n1.versie === 1);

    // ================================================================ 3. de oude weg
    const viaBord = await vn.bordNotitieToevoegen(prive, 'Via manage_hub_notes', 'tekst van de AI', ['hub', 'calendar-draft'], 'claude');
    check('bordNotitieToevoegen maakt een vNext-notitie en antwoordt in de OUDE vorm (id/title/body/tags)', Boolean(viaBord?.note?.id) && viaBord?.note.title === 'Via manage_hub_notes' && viaBord?.note.tags.includes('hub') && viaBord?.note.tags.includes('calendar-draft'));
    const vb = await vn.notitieLezen(prive, viaBord!.note.id);
    check('… en die notitie staat in app.notities met herkomst «bord»', vb?.herkomst?.bron === 'bord' && vb?.etiketten.includes('calendar-draft'));
    const onveranderd = await vn.bordNotitieWijzigen(prive, n1.id, { title: 'Nieuwe lange notitie (bord)', body: sp1.body, tags: ['hub', 'kleur:blauw', 'werk', 'vast'] }, 'claude');
    const n1b = await vn.notitieLezen(prive, n1.id);
    check('bewerken via het bord met de ongewijzigde (afgeknotte) tekst knot de lange inhoud NIET af; titel en «vast» volgen wel',
      Boolean(onveranderd) && n1b?.inhoud.length === n1.inhoud.length && n1b?.titel === 'Nieuwe lange notitie (bord)' && n1b?.vast === true && n1b?.etiketten.includes('проєкт'));
    const echt = await vn.bordNotitieWijzigen(prive, n1.id, { body: 'korte nieuwe tekst' }, 'claude');
    check('bewerken via het bord met een echt andere tekst vervangt de inhoud', echt?.note.body === 'korte nieuwe tekst' && (await vn.notitieLezen(prive, n1.id))?.inhoud === 'korte nieuwe tekst');
    const weg = await vn.bordNotitieVerwijderen(prive, viaBord!.note.id, 'claude');
    const naWeg = (await pool.query(`SELECT 1 FROM app.mcp_console_items WHERE id = $1`, [viaBord!.note.id])).rows.length;
    const inBak = await vn.notitieLezen(prive, viaBord!.note.id);
    check('verwijderen via het bord = prullenbak: spiegelrij weg, vNext-rij blijft met verwijderd_op', weg?.deleted === true && weg?.prullenbak === true && naWeg === 0 && Boolean(inBak?.verwijderdOp));
    check('een niet-vNext-id geeft null (het bord doet dan wat het deed)', (await vn.bordNotitieWijzigen(prive, legacyIds[3], { title: 'x' }, 'c')) === null && (await vn.bordNotitieVerwijderen(prive, randomUUID(), 'c')) === null);
    const hersteld = await vn.notitieActie(prive, viaBord!.note.id, 'herstel');
    check('herstel uit de prullenbak zet de spiegelrij terug met dezelfde id', Boolean(hersteld) && !hersteld?.verwijderdOp && (await pool.query(`SELECT 1 FROM app.mcp_console_items WHERE id = $1`, [viaBord!.note.id])).rows.length === 1);

    // ================================================================ 4. ruimtes, RLS
    check('de technische lade kan een persoonlijke notitie niet lezen, wijzigen of verwijderen', (await vn.notitieLezen(tech, n1.id)) === null && !(await vn.notitieWijzigen(tech, n1.id, { titel: 'kaap' }, null)).ok && (await vn.notitieActie(tech, n1.id, 'prullenbak')) === null);
    check('een andere gebruiker kan niets met die notitie', (await vn.notitieLezen(ander, n1.id)) === null && !(await vn.notitieWijzigen(ander, n1.id, { titel: 'kaap' }, null)).ok && (await vn.revisiesLezen(ander, n1.id)) === null);

    // ================================================================ 5. versies en revisies
    const cur = (await vn.notitieLezen(prive, n1.id))!;
    const oud = await vn.notitieWijzigen(prive, n1.id, { titel: 'met oude versie' }, cur.versie - 1);
    check('een wijziging met een verouderde versie wordt geweigerd en geeft de huidige notitie mee', !oud.ok && oud.fout === 'VERSIE_VEROUDERD' && oud.huidig?.versie === cur.versie);
    const goed = await vn.notitieWijzigen(prive, n1.id, { titel: 'met juiste versie', inhoud: 'v-nieuw' }, cur.versie);
    check('met de juiste versie slaagt zij en de versie telt op', goed.ok && goed.notitie.versie === cur.versie + 1 && goed.notitie.titel === 'met juiste versie');
    const vastErna = await vn.notitieActie(prive, n1.id, 'losmaken');
    check('vastzetten/losmaken maakt geen versiesprong', vastErna?.versie === cur.versie + 1 && vastErna?.vast === false);
    const revs = (await vn.revisiesLezen(prive, n1.id))!;
    check('elke inhoudelijke wijziging liet een revisie achter (hoogste versie eerst), de allereerste inhoud is terug te vinden', revs.length >= 3 && revs[0].versie > revs[revs.length - 1].versie && revs.some((r) => r.inhoud.length > 5000));
    const terug = await vn.revisieHerstellen(prive, n1.id, revs[revs.length - 1].id);
    check('een revisie terugzetten herstelt titel en inhoud en laat weer een revisie achter', terug.ok && terug.notitie.inhoud.length > 5000 && (await vn.revisiesLezen(prive, n1.id))!.length === revs.length + 1);
    const sp2 = (await pool.query(`SELECT body, tags FROM app.mcp_console_items WHERE id = $1`, [n1.id])).rows[0];
    check('de spiegel volgt elke stap (tekst weer afgeknot op 4000, «vast» weg uit de etiketten)', sp2.body.length === 4000 && !sp2.tags.includes('vast'));

    // ================================================================ archief, mappen, zoeken, vandaag
    const arch = await vn.notitieActie(prive, n1.id, 'archief');
    const spA = (await pool.query(`SELECT tags FROM app.mcp_console_items WHERE id = $1`, [n1.id])).rows[0];
    check('archiveren: uit «alle», in «archief», en de spiegel krijgt het etiket «archief»', Boolean(arch?.gearchiveerdOp) && (await vn.notitiesLijst(prive, { weergave: 'archief' })).notities.some((n) => n.id === n1.id) && !(await vn.notitiesLijst(prive, {})).notities.some((n) => n.id === n1.id) && spA.tags.includes('archief'));
    await vn.notitieActie(prive, n1.id, 'uit-archief');
    const m1 = await vn.mapMaken(prive, 'Проєкти', 'groen');
    check('een map aanmaken; dezelfde naam nog eens wordt geweigerd', !('fout' in m1) && 'fout' in (await vn.mapMaken(prive, 'проєкти')));
    if ('fout' in m1) throw new Error('map');
    await vn.notitieWijzigen(prive, n1.id, { mapId: m1.id }, null);
    check('filter op map werkt en de map telt haar notities', (await vn.notitiesLijst(prive, { mapId: m1.id })).notities.length === 1 && (await vn.mappenLijst(prive)).find((m) => m.id === m1.id)?.aantal === 1);
    check('een map van een ander kan niet gekozen worden', !(await vn.notitieWijzigen(ander, legacyIds[1], { mapId: m1.id }, null)).ok && 'fout' in (await vn.notitieMaken(ander, { titel: 'x', inhoud: '', soort: 'tekst', kleur: 'geen', etiketten: [], mapId: m1.id, vast: false })));
    check('een map verwijderen laat de notitie staan (zonder map)', (await vn.mapVerwijderen(prive, m1.id)) && (await vn.notitieLezen(prive, n1.id))?.mapId === null);
    check('zoeken op een Oekraïens etiket en op een woord in de tekst (hoofdletterongevoelig)', (await vn.notitiesLijst(prive, { etiket: 'ПРОЄКТ' })).notities.length === 1 && (await vn.notitiesLijst(prive, { vraag: 'BROOD' })).notities.length === 1 && (await vn.notitiesLijst(prive, { vraag: 'bestaatniet-zzz' })).notities.length === 0);
    check('«vandaag» toont vandaag gewijzigde notities en checklists met open punten', (await vn.notitiesLijst(prive, { weergave: 'vandaag' })).telling.vandaag >= 2);
    check('paginering: limiet 1 geeft één rij en een «volgende»', (await vn.notitiesLijst(prive, { limiet: 1 })).volgende === 1);

    // ================================================================ 6. import/export
    const bestanden = [
      { naam: 'a.md', tekst: '---\ntitle: Uit Obsidian\ntags: [idee, план]\n---\n# Kop\n\ntekst <img src=x onerror=alert(1)>' },
      { naam: 'b.txt', tekst: '- [ ] een\n- [x] twee\n- [ ] drie' },
      { naam: 'c.json', tekst: JSON.stringify({ notities: [{ titel: 'Uit json', inhoud: 'json-inhoud', etiketten: ['j'] }, { title: 'Uit json', body: 'json-inhoud' }] }) },
      { naam: 'kapot.json', tekst: '{nee' },
      { naam: 'plaat.png', tekst: 'xx' },
      { naam: 'leeg.md', tekst: '   ' },
    ];
    const vb1 = await vn.importVoorbeeld(prive, bestanden);
    check('import-voorbeeld: 4 items (md, txt, 2× json), 1 dubbel binnen de import, 3 fouten (kapotte JSON, onbekend formaat, leeg)',
      vb1.items.length === 4 && vb1.dubbel === 1 && vb1.items.filter((i) => i.dubbel === 'in-import').length === 1 && vb1.fouten.length === 3 && vb1.fouten.map((f) => f.fout).sort().join() === 'JSON_ONGELDIG,LEEG,ONBEKEND_FORMAAT');
    check('frontmatter geeft titel en etiketten; een tekstbestand met vinkjes wordt een checklist', vb1.items[0].titel === 'Uit Obsidian' && vb1.items[0].etiketten.join() === 'idee,план' && vb1.items[1].soort === 'lijst' && vb1.items[1].titel === 'b');
    const uit1 = await vn.importUitvoeren(prive, bestanden, { etiket: 'import-1' });
    check('import maakt de 3 unieke notities (dubbel overgeslagen), met herkomst en extra etiket, en spiegelt ze', uit1.aangemaakt.length === 3 && uit1.overgeslagen === 1 && uit1.aangemaakt.every((n) => n.herkomst?.bron === 'import' && n.etiketten.includes('import-1'))
      && (await pool.query(`SELECT count(*)::int AS n FROM app.mcp_console_items WHERE id = ANY($1::uuid[])`, [uit1.aangemaakt.map((n) => n.id)])).rows[0].n === 3);
    const vb2 = await vn.importVoorbeeld(prive, bestanden);
    check('dezelfde bestanden nog eens: alles is nu «bestaand» dubbel en wordt overgeslagen', vb2.items.every((i) => i.dubbel) && (await vn.importUitvoeren(prive, bestanden, {})).aangemaakt.length === 0);
    const html = markdownNaarHtml(uit1.aangemaakt[0].inhoud);
    check('HTML uit een importbestand blijft tekst in de weergave (geen <img>, geen onerror)', !/<img/.test(html) && /&lt;img/.test(html));
    const ex = await vn.exportAlles(prive);
    check('export bevat alle actieve notities van deze lade (niet de prullenbak, niet een andere ruimte)', ex.notities.length === (await vn.notitiesLijst(prive, {})).totaal && !ex.notities.some((n) => n.id === legacyIds[2]));
    check('te veel/te grote import wordt geweigerd', (await vn.importVoorbeeld(prive, [{ naam: 'groot.md', tekst: 'x'.repeat(4_000_001) }])).fouten[0]?.fout === 'TE_GROOT');

    // ================================================================ definitief, prullenbak
    const bak = await vn.notitieActie(prive, uit1.aangemaakt[0].id, 'prullenbak');
    check('prullenbak: de notitie staat in «prullenbak», niet in «alle»', Boolean(bak?.verwijderdOp) && (await vn.notitiesLijst(prive, { weergave: 'prullenbak' })).notities.some((n) => n.id === bak!.id));
    await vn.notitieActie(prive, bak!.id, 'definitief');
    check('definitief verwijderen haalt de notitie, haar revisies en de spiegel weg', (await vn.notitieLezen(prive, bak!.id)) === null && (await pool.query(`SELECT 1 FROM app.notities_revisies WHERE notitie_id = $1`, [bak!.id])).rows.length === 0);

    // ================================================================ 7. model: veilige weergave
    const h = markdownNaarHtml('# T\n\n<script>alert(1)</script> **vet** [x](javascript:alert(1)) [ok](https://ok.nl/a?b=1&c=2) https://los.nl/.\n\n- [ ] melk\n- [x] brood\n\n```html\n<b>code</b>\n```\n\n> citaat\n\n1. een\n2. twee\n\n---\n');
    check('markdownNaarHtml: ruwe HTML wordt tekst, javascript: wordt geen koppeling, https wel (met rel=noopener)', /&lt;script&gt;/.test(h) && !/<script/.test(h) && !/href="javascript/.test(h) && !/<a [^>]*javascript/.test(h) && /href="https:\/\/ok.nl\/a\?b=1&amp;c=2"/.test(h) && /rel="noopener noreferrer"/.test(h) && /href="https:\/\/los.nl\/"/.test(h));
    check('markdownNaarHtml: kop, vet, checklist met data-regel, codeblok ontsnapt, citaat, nummering, lijn', /<h2>T<\/h2>/.test(h) && /<strong>vet<\/strong>/.test(h) && /class="vn-checklist"/.test(h) && /data-regel="4"/.test(h) && /data-regel="5"/.test(h) && /&lt;b&gt;code&lt;\/b&gt;/.test(h) && /<blockquote>/.test(h) && /<ol><li>een<\/li><li>twee<\/li><\/ol>/.test(h) && /<hr>/.test(h));
    check('markdownNaarHtml: data:- en http:-koppelingen worden geen koppeling', !/<a /.test(markdownNaarHtml('[a](data:text/html,x) [b](http://onveilig.nl)')) && vnVeiligeKoppeling('http://x.y') === '' && vnVeiligeKoppeling('https://x.y/p?q=1') === 'https://x.y/p?q=1');
    check('lijstRegels/lijstRegelOmzetten/naarChecklist', lijstRegels('- [ ] a\n\ntekst\n- [x] b').map((r) => `${r.regel}${r.af ? 'x' : 'o'}`).join() === '0o,3x' && lijstRegelOmzetten('- [ ] a\n- [x] b', 1) === '- [ ] a\n- [ ] b' && naarChecklist('een\n- twee\n- [x] drie') === '- [ ] een\n- [ ] twee\n- [x] drie');
    check('platteTekst haalt opmaak weg en houdt woorden en koppelingen', platteTekst('# Kop\n- [ ] **melk** [site](https://a.b)') === 'Kop\nmelk site https://a.b');
    check('titelUitInhoud neemt de eerste zinvolle regel zonder Markdown-tekens', titelUitInhoud('\n\n## Eerste *kop*\nrest') === 'Eerste kop' && titelUitInhoud('- [ ] punt') === 'punt');
    check('zoekWoorden houdt Oekraïense letters (й/ї) intact en verkleint', zoekWoorden('Їжак Й').join() === 'їжак,й');

    // ================================================================ model: etiketten, invoer, spiegel
    check('vnSchoonEtiket: Oekraïens mag, spaties → -, # weg, systeem-etiketten geweigerd, hoogstens 40 tekens', vnSchoonEtiket(' #Проєкт Дім ') === 'проєкт-дім' && vnSchoonEtiket('hub') === '' && vnSchoonEtiket('soort:code') === '' && vnSchoonEtiket('archief') === '' && vnSchoonEtiket('a'.repeat(60)).length === 40);
    check('vnEtiketten: uniek, hoogstens 24, uit een lijst of uit komma-tekst', vnEtiketten('a, b, a, B').join() === 'a,b' && vnEtiketten(Array.from({ length: 40 }, (_, i) => `e${i}`)).length === 24);
    const si = schoneInvoer({ inhoud: '# Zonder titel\ntekst', soort: 'lijst', etiketten: ['x'], vast: true });
    check('schoneInvoer: lege titel komt uit de inhoud; onbekende soort/kleur/map geweigerd; te lange titel geweigerd',
      si.ok && si.invoer.titel === 'Zonder titel' && si.invoer.vast && !schoneInvoer({ titel: 'x', soort: 'foto' }).ok && !schoneInvoer({ titel: 'x', kleur: 'paars' }).ok && !schoneInvoer({ titel: 'x', mapId: 'nee' }).ok && !schoneInvoer({ titel: 'y'.repeat(VN_MAX_TITEL + 1) }).ok);
    const spt = spiegelEtiketten({ soort: 'lijst', kleur: 'geel', etiketten: ['проєкт', 'werk', 'a', 'b', 'c', 'd', 'e', 'f', 'g'], vast: true, gearchiveerdOp: '2026-01-01' });
    check('spiegelEtiketten: hub, soort, kleur, vast, archief vooraan; ≤ 8; alleen etiketten die de oude regel aankan', spt.length === 8 && spt.slice(0, 5).join() === 'hub,soort:lijst,kleur:geel,vast,archief' && spt.every((e) => SPIEGEL_ETIKET.test(e)) && !spt.includes('проєкт'));
    const ib = invoerUitBord('T', 'B', ['hub', 'soort:code', 'kleur:roze', 'vast', 'archief', 'vrij']);
    check('invoerUitBord: de oude etiketten → soort/kleur/vast/gearchiveerd/vrije etiketten', ib.soort === 'code' && ib.kleur === 'roze' && ib.vast && ib.gearchiveerd && ib.etiketten.join() === 'vrij');
    check('vingerafdruk is stabiel en ongevoelig voor witruimte/hoofdletters in de titel', vingerafdruk('A', 'x  y') === vingerafdruk('a ', 'x y') && vingerafdruk('a', 'x') !== vingerafdruk('a', 'y'));
    check('markeerDubbelen: bestaand vóór in-import', markeerDubbelen(parseerImport({ naam: 'q.md', tekst: 'q' }).items, new Set([vingerafdruk('q', 'q')]))[0].dubbel === 'bestaand');

    // ================================================================ 8. catalogus
    check('elke bron heeft een eerlijke stand met label in beide talen, uitleg, en een https-bron', NOTITIE_BRONNEN.every((b) => BRON_STAND_LABEL[b.stand] && b.uitleg[0].length > 10 && b.uitleg[1].length > 10 && b.wat[0].length > 10 && /^https:\/\//.test(b.bron)));
    check('«beschikbaar» alleen voor de bestandsweg die deze release werkelijk heeft; «alleen-invoer» noemt haar formaten; «gepland»/«beperkt» hebben geen formaten', NOTITIE_BRONNEN.filter((b) => b.stand === 'beschikbaar').map((b) => b.id).join() === 'bestanden' && NOTITIE_BRONNEN.filter((b) => b.stand === 'alleen-invoer').every((b) => b.formaten.length > 0) && NOTITIE_BRONNEN.filter((b) => b.stand === 'gepland' || b.stand === 'beperkt').every((b) => b.formaten.length === 0));
    check('geen enkele bron belooft tweerichtingssynchronisatie', !NOTITIE_BRONNEN.some((b) => /двосторонн[а-я]+ синхронізац[а-я]+ (працює|доступна)|tweerichtingssynchronisatie werkt/i.test(b.uitleg[0] + b.uitleg[1] + b.wat[0] + b.wat[1])));
    check('de oude catalogus, de oude pagina en manage_hub_notes zijn er nog (niets verwijderd, geen nieuwe toolnaam)', /NOTITIE_APPS/.test(lees('shared/notities-model.ts')) && /manage_hub_notes/.test(lees('backend/site-hulpmiddelen.ts')) && /bordNotitieToevoegen/.test(lees('backend/mcp-console.ts')) && /notitiesRoutes/.test(lees('backend/index.ts')));
  } finally {
    await pool.query(`DELETE FROM app.notities WHERE user_id = ANY($1)`, [[a, b]]).catch(() => undefined);
    await pool.query(`DELETE FROM app.notities_mappen WHERE user_id = ANY($1)`, [[a, b]]).catch(() => undefined);
    await pool.query(`DELETE FROM app.mcp_console_items WHERE user_id = ANY($1)`, [[a, b]]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [[a, b]]).catch(() => undefined);
  }
  return einde();
}
