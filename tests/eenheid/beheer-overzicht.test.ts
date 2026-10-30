// Admin → «Огляд» (/overzicht): widgets/indeling (normalisatie, verplaatsen, formaat), privacy van gebeurtenissen en gebruikersgeschiedenis,
// tellers, momentopnamen (puur + database, 90 dagen bewaard) en de toegangsrechten van de routes.
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import {
  BREEDTES, HOOGTES, MAX_WIDGETS, WIDGETS, WIDGET_IDS, formaatZetten, normaliseerIndeling, schuif, standaardIndeling, stap, verbergen, verplaats,
} from '../../shared/overzicht-widgets';
import {
  bouwOverzicht, gebeurtenisUit, gebruikerHistorie, maskeerMail, vulEmmers, veiligeFoto, type AuditRegel, type Gebruiker, type Invoer, type Sessie,
} from '../../backend/beheer-overzicht-kern';
import {
  BEWAAR_DAGEN, bewaarMomentopname, emmerVan, getalSchoon, leesMomentopname, lijstMomentopnamen, maakMomentopname, vergeetEmmers,
} from '../../backend/beheer-overzicht-momentopnamen';
import { checker } from './hulp/nep-google';

const NU = Date.UTC(2026, 9, 17, 12, 0, 0);
const GEHEIM = ['SUPERGEHEIM-TOKEN-123', '203.0.113.77', 'Onderwerp: salarisbrief.pdf', 'sk-live-ABCDEF'];

export async function main(): Promise<number> {
  const { check, einde } = checker('beheer-overzicht');
  const sys = () => getPool('systeem');
  try {
    // ---- widgets / indeling
    const std = standaardIndeling();
    check('indeling: standaard bevat elke widget precies één keer, zichtbaar', std.items.length === WIDGETS.length && new Set(std.items.map((i) => i.id)).size === WIDGET_IDS.length && std.items.every((i) => !i.verborgen));
    check('indeling: widgets ≤ MAX_WIDGETS en elk met uk+nl titel en uitleg', WIDGETS.length <= MAX_WIDGETS && WIDGETS.every((w) => w.titel[0] && w.titel[1] && w.uitleg[0] && w.uitleg[1]));
    check('indeling: nieuwe widget «momenten» bestaat', WIDGET_IDS.includes('momenten' as never));
    const vuil = normaliseerIndeling({ items: [{ id: 'online', w: 7, h: 99, verborgen: true }, { id: 'online', w: 3, h: 2 }, { id: 'bestaat-niet', w: 3 }, null, 5, { id: 'fouten', w: -4, h: 0 }] });
    const on = vuil.items.find((i) => i.id === 'online')!; const fo = vuil.items.find((i) => i.id === 'fouten')!;
    check('indeling: dubbele en onbekende widgets vallen weg, ontbrekende komen achteraan terug', vuil.items.length === WIDGETS.length && vuil.items.filter((i) => i.id === 'online').length === 1);
    check('indeling: afmetingen worden op toegestane waarden gezet (≥ minimum)', BREEDTES.includes(on.w as never) && HOOGTES.includes(on.h as never) && BREEDTES.includes(fo.w as never) && fo.w >= 3 && fo.h >= 2);
    check('indeling: verborgen blijft verborgen', on.verborgen === true);
    check('indeling: onzin (null, tekst, getal) geeft de standaardindeling', [null, 'x', 42, [], {}].every((r) => JSON.stringify(normaliseerIndeling(r)) === JSON.stringify(std)));
    const v1 = verplaats(std, 'gezag', 0);
    check('indeling: verplaatsen naar voren', v1.items[0].id === 'gezag' && v1.items.length === std.items.length);
    const s1 = schuif(std, 'online', 1);
    check('indeling: schuif +1 wisselt met de volgende zichtbare', s1.items[0].id === 'sessies' && s1.items[1].id === 'online');
    const verb = verbergen(std, 'sessies', true);
    check('indeling: schuif slaat verborgen widgets over', schuif(verb, 'online', 1).items.findIndex((i) => i.id === 'online') > verb.items.findIndex((i) => i.id === 'sessies'));
    check('indeling: schuif voorbij het einde verandert niets', schuif(std, 'online', -1) === std);
    const f1 = formaatZetten(std, 'activiteit', 3, 1);
    const fa = f1.items.find((i) => i.id === 'activiteit')!;
    check('indeling: formaat respecteert het minimum van de widget', fa.w >= 4 && fa.h >= 2);
    check('indeling: stap loopt door de toegestane waarden en blijft binnen de grenzen', stap(6, BREEDTES, 3, 1) === 8 && stap(12, BREEDTES, 3, 1) === 12 && stap(3, BREEDTES, 3, -1) === 3);

    // ---- emmers
    const em = vulEmmers([{ b: Math.floor(NU / 3_600_000), n: 5, f: 1 }], NU, 3_600_000, 24);
    check('emmers: 24 uren, laatste bevat de telling, rest nullen', em.length === 24 && em[23].n === 5 && em[23].f === 1 && em.slice(0, 23).every((p) => p.n === 0));

    // ---- privacy
    check('privacy: e-mail wordt gemaskeerd', maskeerMail('eigenaar@example.test') === 'ei***@example.test' && maskeerMail('geen-mail') === '');
    check('privacy: alleen https-foto\'s', veiligeFoto('https://lh3.googleusercontent.com/a/x') !== '' && veiligeFoto('http://x.nl/a.png') === '' && veiligeFoto('data:image/png;base64,AAAA') === '' && veiligeFoto('javascript:alert(1)') === '');
    const gebr = new Map<string, Gebruiker>([['u1', { id: 'u1', email: 'eigenaar@example.test', name: 'Власник', picture: 'https://lh3.googleusercontent.com/a/x' }]]);
    const vuilRegel = {
      id: 'r1', ownerId: 'u1', actorId: 'u1', action: 'owner.api.vault.revealed', result: 'success', createdAt: NU - 1000, service: 'api', device: 'Chrome 130',
      details: { token: GEHEIM[0], ip: GEHEIM[1], onderwerp: GEHEIM[2], key: GEHEIM[3] }, ip: GEHEIM[1], ipHash: 'abc', userAgent: 'Mozilla/5.0 (X11; Linux) SecretUA',
    } as unknown as AuditRegel;
    const ev = gebeurtenisUit(vuilRegel, gebr);
    const evJson = JSON.stringify(ev);
    check('privacy: gebeurtenis bevat nooit details, IP, tokens of onderwerp', !!ev && GEHEIM.every((g) => !evJson.includes(g)) && !/details|ipHash|userAgent|SecretUA/.test(evJson));
    check('privacy: gebeurtenis bevat geen volledig e-mailadres', !evJson.includes('eigenaar@example.test'));
    check('privacy: ruis (menu/tab/overzicht zelf) is geen gebeurtenis', gebeurtenisUit({ ...vuilRegel, action: 'owner.ui.menu' }, gebr) === null && gebeurtenisUit({ ...vuilRegel, action: 'owner.admin.overview' }, gebr) === null);
    const sessies: Sessie[] = [{ userId: 'u1', service: 'admin', lastSeenAt: NU - 60_000, idleExpiresAt: NU + 1e6, absoluteExpiresAt: NU + 1e7, deviceType: 'desktop', os: 'Linux', browser: 'Chrome' }];
    const hist = gebruikerHistorie({ nu: NU, gebruiker: gebr.get('u1'), id: 'u1', audit: [vuilRegel, { ...vuilRegel, id: 'r2', action: 'owner.mail.send', result: 'failed' }], sessies });
    const hJson = JSON.stringify(hist);
    check('privacy: gebruikersgeschiedenis lekt geen geheimen/IP/UA/onderwerp', GEHEIM.every((g) => !hJson.includes(g)) && !/SecretUA|ipHash/.test(hJson));
    check('privacy: gebruikersgeschiedenis toont gemaskeerde mail, naam en tellers', hist.gebruiker.mail === 'ei***@example.test' && hist.gebruiker.naam === 'Власник' && hist.kpi.events === 2 && hist.kpi.mislukt === 1 && hist.kpi.online === true && hist.secties.length >= 1);
    check('privacy: onbekende gebruiker valt terug op een veilige naam', gebruikerHistorie({ nu: NU, gebruiker: undefined, id: 'abcdef123', audit: [], sessies: [] }).gebruiker.bekend === false);

    // ---- overzicht
    const inv: Invoer = {
      nu: NU, gebruikers: [...gebr.values()], telling: { totaal: 3, nieuw24: 1, nieuw7: 2, wachtGoedkeuring: 1 }, sessies,
      uren: [{ b: Math.floor(NU / 3_600_000), n: 4, f: 1 }], dagen: [{ b: Math.floor(NU / 86_400_000), n: 9, f: 2 }],
      acties7: [{ action: 'owner.mail.send', n: 6, f: 0 }, { action: 'owner.ui.menu', n: 99, f: 0 }, { action: 'owner.cloud.list', n: 2, f: 0 }],
      recent: [vuilRegel], diensten: [{ id: 'database', stand: 'ok' }, { id: 'schijf', stand: 'fout' }], runs: [], wachtUitrol: 1, wachtToegang: 2, magAudit: true,
    };
    const o = bouwOverzicht(inv);
    check('overzicht: kpi (online, sessies, apparaten, events 24u, storingen)', o.kpi.online === 1 && o.kpi.actieveSessies === 1 && o.kpi.apparaten === 1 && o.kpi.events24 === 4 && o.kpi.fouten24 === 1 && o.kpi.foutenPct === 25);
    check('overzicht: populariteit telt alleen echte acties (geen menu-ruis), op volgorde', o.populariteit.acties[0].sleutel === 'mail-verzenden' && !o.populariteit.acties.some((a) => a.n === 99));
    check('overzicht: diensten- en wachtrijtellers', o.diensten.ok === 1 && o.diensten.fout === 1 && o.wachtrij.uitrol === 1 && o.wachtrij.toegang === 2);
    check('overzicht: zonder audit.read geen gebeurtenislijst (alleen tellers)', bouwOverzicht({ ...inv, magAudit: false }).stroom.length === 0 && bouwOverzicht({ ...inv, magAudit: false }).beperkt === true);
    const oJson = JSON.stringify(o);
    check('overzicht: geheel antwoord bevat geen geheimen of volledige e-mail', GEHEIM.every((g) => !oJson.includes(g)) && !oJson.includes('eigenaar@example.test'));
    check('overzicht: leeg systeem geeft eerlijk «leeg» in plaats van verzonnen cijfers', (() => { const l = bouwOverzicht({ ...inv, sessies: [], uren: [], dagen: [], recent: [], acties7: [], diensten: [], gebruikers: [] }); return l.leeg.activiteit && l.leeg.sessies && l.kpi.events24 === 0 && l.kpi.online === 0; })());

    // ---- momentopnamen (puur)
    const m = maakMomentopname(o);
    check('momentopname: alleen getallen, juiste waarden', m.v === 1 && m.online === 1 && m.actieveSessies === 1 && m.events24 === 4 && m.fouten24 === 1 && m.gebruikers === 3 && m.wacht.toegang === 2 && m.diensten.fout === 1);
    check('momentopname: bevat geen namen/e-mail/geheimen', GEHEIM.every((g) => !JSON.stringify(m).includes(g)) && !JSON.stringify(m).includes('Власник') && !JSON.stringify(m).includes('@'));
    check('momentopname: getalSchoon begrenst NaN, tekst en negatieven', getalSchoon('x') === 0 && getalSchoon(-5) === 0 && getalSchoon(3.6) === 4 && getalSchoon(1e12) === 10_000_000 && getalSchoon(Infinity) === 0);
    const vuilDoc = leesMomentopname({ online: '7', gebruikers: -3, diensten: 'x', wacht: null, naam: 'Власник', ip: GEHEIM[1] });
    check('momentopname: lezen zet willekeurige JSON terug in de vaste vorm (geen extra velden)', vuilDoc.online === 7 && vuilDoc.gebruikers === 0 && vuilDoc.diensten.ok === 0 && Object.keys(vuilDoc).sort().join() === Object.keys(m).sort().join() && !JSON.stringify(vuilDoc).includes(GEHEIM[1]));

    // ---- momentopnamen (database; migratie 0058)
    let tabel = true;
    try { await sys().query('SELECT 1 FROM app.admin_overzicht_momentopnamen LIMIT 1'); } catch { tabel = false; }
    if (!tabel) check('database: tabel app.admin_overzicht_momentopnamen bestaat (migratie 0058)', false, 'pas migratie 0058 toe');
    else {
      await sys().query('DELETE FROM app.admin_overzicht_momentopnamen');
      vergeetEmmers();
      const t0 = NU;
      const r1 = await bewaarMomentopname(o, t0);
      check('database: eerste momentopname schrijft uur én dag', r1.uur === true && r1.dag === true);
      vergeetEmmers();
      const o2 = { ...o, kpi: { ...o.kpi, online: 9 } };
      const r2 = await bewaarMomentopname(o2, t0 + 600_000);
      const uurRij = (await sys().query(`SELECT data FROM app.admin_overzicht_momentopnamen WHERE soort='uur' AND emmer=$1`, [emmerVan('uur', t0)])).rows;
      check('database: tweede meting in hetzelfde uur overschrijft het uur niet', r2.uur === false && uurRij.length === 1 && uurRij[0].data.online === 1);
      const dagRij = (await sys().query(`SELECT data FROM app.admin_overzicht_momentopnamen WHERE soort='dag' AND emmer=$1`, [emmerVan('dag', t0)])).rows;
      check('database: dagwaarde = laatste meting van de dag', dagRij.length === 1 && dagRij[0].data.online === 9);
      // volgende uur + oude rij (> 90 dagen) wordt opgeruimd
      await sys().query(`INSERT INTO app.admin_overzicht_momentopnamen (soort, emmer, genomen_op, data) VALUES ('dag', 1, now() - interval '120 days', '{"v":1}'::jsonb) ON CONFLICT DO NOTHING`);
      vergeetEmmers();
      await bewaarMomentopname(o, t0 + 3_700_000);
      const oud = (await sys().query(`SELECT count(*)::int AS n FROM app.admin_overzicht_momentopnamen WHERE emmer = 1`)).rows[0].n;
      check(`database: rijen ouder dan ${BEWAAR_DAGEN} dagen worden opgeruimd`, oud === 0);
      const lijst = await lijstMomentopnamen(t0 + 3_700_000);
      check('database: lijst geeft uur- en dagreeks oud → nieuw in de vaste vorm', lijst.uur.length === 2 && lijst.uur[0].t < lijst.uur[1].t && lijst.dag.length >= 1 && lijst.uur[0].d.online === 1 && lijst.bewaardDagen === BEWAAR_DAGEN);
      check('database: tabel bevat geen persoonsgegevens', !JSON.stringify((await sys().query('SELECT data FROM app.admin_overzicht_momentopnamen')).rows).match(/@|Власник|token|203\.0/));
      let geweigerd = false;
      try { await sys().query(`INSERT INTO app.admin_overzicht_momentopnamen (soort, emmer, data) VALUES ('week', 1, '{}'::jsonb)`); } catch { geweigerd = true; }
      check('database: onbekende soort wordt geweigerd (CHECK)', geweigerd);
      await sys().query('DELETE FROM app.admin_overzicht_momentopnamen');
    }

    // ---- indeling per beheerder (migratie 0057)
    let indTabel = true;
    try { await sys().query('SELECT 1 FROM app.admin_overzicht_indeling LIMIT 1'); } catch { indTabel = false; }
    if (!indTabel) check('database: tabel app.admin_overzicht_indeling bestaat (migratie 0057)', false, 'pas migratie 0057 toe');
    else {
      const ov = await import('../../backend/beheer-overzicht');
      await sys().query(`DELETE FROM app.admin_overzicht_indeling WHERE user_id IN ('test-a','test-b')`);
      const l0 = await ov.indelingLezen('test-a');
      check('indeling-db: zonder rij krijgt de beheerder de standaardindeling', l0.aangepast === false && l0.indeling.items.length === WIDGETS.length);
      const eigen = verbergen(verplaats(standaardIndeling(), 'gezag', 0), 'fouten', true);
      const opg = await ov.indelingOpslaan('test-a', eigen);
      const l1 = await ov.indelingLezen('test-a');
      check('indeling-db: opslaan en teruglezen (volgorde + verborgen)', opg.aangepast && l1.aangepast && l1.indeling.items[0].id === 'gezag' && l1.indeling.items.find((i) => i.id === 'fouten')!.verborgen === true);
      const andere = await ov.indelingLezen('test-b');
      check('indeling-db: een andere beheerder ziet jouw indeling niet', andere.aangepast === false && andere.indeling.items[0].id !== 'gezag');
      await ov.indelingOpslaan('test-a', { items: [{ id: 'hack', w: 99 }, { id: 'online', w: 99, h: 99 }], extra: 'x'.repeat(50000) });
      const l2 = await ov.indelingLezen('test-a');
      check('indeling-db: de server normaliseert vuile invoer vóór het opslaan', l2.indeling.items.length === WIDGETS.length && l2.indeling.items.every((i) => (BREEDTES as readonly number[]).includes(i.w)));
      const w = await ov.indelingWissen('test-a');
      check('indeling-db: terugzetten wist de rij', w.aangepast === false && (await ov.indelingLezen('test-a')).aangepast === false);
    }

    // ---- routes: rechten
    const { adminOverzichtRoutes } = await import('../../backend/beheer-overzicht');
    const gevraagd: string[] = [];
    const routes = adminOverzichtRoutes(async (_ctx, cap) => { gevraagd.push(cap); return { errorCode: 'ADMIN_FORBIDDEN' }; });
    const ctx = { event: {}, body: {} } as never;
    const sleutels = Object.keys(routes);
    const antw = await Promise.all(sleutels.map(async (k) => [k, await (routes[k][0] as unknown as (c: unknown) => Promise<{ statusCode?: number; status?: number }>)(ctx)] as const));
    check('routes: zonder beheerrecht weigert elke route (403)', antw.every(([, r]) => (r.statusCode ?? r.status) === 403), String(antw.map(([k, r]) => `${k.split('/').pop()}:${r.statusCode ?? r.status}`)));
    check('routes: gebruikersgeschiedenis vraagt audit.read, rest admin.read', gevraagd[sleutels.indexOf('POST /api/owner/admin/overview/user')] === 'audit.read' && gevraagd.filter((c) => c === 'admin.read').length === sleutels.length - 1);
    check('routes: snapshots-route bestaat', sleutels.includes('POST /api/owner/admin/overview/snapshots'));
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err));
  } finally {
    await closePool().catch(() => undefined);
  }
  // Audit 19.10.2026 (A13): Esc verlaat «Налаштувати»; kaarttitels worden niet meer met … afgekapt (max. 2 regels).
  const ui = readFileSync('src/overzicht/Dashboard.tsx', 'utf8'); const css = readFileSync('src/overzicht/overzicht.css', 'utf8');
  check('A13: Esc-handler in bewerkmodus roept klaar() aan (lade/bevestiging eerst)', /e\.key !== 'Escape'\) return;[^\n]*klaarRef\.current\(\)/.test(ui) && /\[bewerken, lade, bevestigReset\]\)/.test(ui));
  check('A13: .ov-w-kop h3 heeft geen nowrap/ellipsis meer maar line-clamp 2', !/\.ov-w-kop h3\{[^}]*(white-space:nowrap|text-overflow:ellipsis)/.test(css) && /\.ov-w-kop h3\{[^}]*-webkit-line-clamp:2/.test(css));
  // Audit 19.10.2026 (A14): «Показати технічні коди» toont de code naast elk label in de hele console (data-codes op <main> + CSS), niet alleen waar de prop doorgegeven wordt.
  const term = readFileSync('src/beheer-termen.tsx', 'utf8'); const console_ = readFileSync('src/BeheerConsoleWeergave.tsx', 'utf8'); const acss = readFileSync('src/beheer-console.css', 'utf8');
  check('A14: Term rendert de code altijd (admin-term-code-schakel) en de console zet data-codes op <main>', /<code className='admin-term-code admin-term-code-schakel'>\{code\}<\/code>/.test(term) && /data-codes=\{codes\?'ja':'nee'\}/.test(console_)
    && /\[data-codes="ja"\] \.admin-term-code-schakel/.test(acss) && /\.admin-term-code-schakel\{display:none\}/.test(acss));
  // Audit 19.10.2026: «Межа повноважень» komt tweetalig van de server (geen Engelse zinnen meer) en de widget kiest per taal.
  const be = readFileSync('backend/index.ts', 'utf8');
  check('limitations: ADMIN_LIMITATIONS uk+nl, geen Engelse tekst; widget kiest per taal', /const ADMIN_LIMITATIONS:Array<\{uk:string;nl:string\}>=\[/.test(be) && !/MDM compliance telemetry is not connected/.test(be) && /limitations:ADMIN_LIMITATIONS/.test(be)
    && /typeof l === 'string' \? l : \(lang === 'uk' \? l\.uk : l\.nl\)/.test(readFileSync('src/overzicht/widgets.tsx', 'utf8')));
  return einde();
}
