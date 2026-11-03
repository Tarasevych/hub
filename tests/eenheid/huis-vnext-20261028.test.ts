// HUIS vNEXT (28.10.2026, migratie 0128, backend/huis-vnext.ts, backend/huis-adapter-thuis-assistent.ts, shared/huis-model.ts).
//
// WAT DEZE TEST VASTHOUDT — tegen een NAGEBOOTSTE Home Assistant (tests/eenheid/hulp/nep-thuis-assistent.ts), nooit een echte:
//   1. Zonder integratie: een woning is leeg en zegt dat eerlijk (geen apparaten, geen toestand, geen «armed»).
//   2. De adapter vertaalt alleen wat het domein/de attributen zeggen: lamp met helderheid, sensor als meting met eenheid,
//      'unavailable' → onbeschikbaar, 'unknown' → onbekend, automation/sun → geen apparaat, slot/alarm/rook = kritiek.
//   3. Het token staat versleuteld in de rij en komt in geen enkel antwoord; het adres wordt geweigerd bij loopback/userinfo.
//   4. Opdracht: zonder schrijftoestemming geweigerd; met toestemming verzocht→aanvaard→verzonden→bevestigd→waargenomen→voltooid,
//      en pas voltooid als de bron de gewenste toestand teruggeeft; dezelfde idempotentiesleutel = dezelfde opdracht; een bron die
//      niets doet → verlopen zonder bevestiging; onbereikbaar → offline; kritiek zonder step-up → geweigerd, via scène/AI altijd.
//   5. Scène: per stap een opdracht met uitkomst; automatisering: 'aan' wordt eerlijk geweigerd, droogloop doet geen I/O;
//      voorstel van de AI voert nooit uit en weigert kritiek al bij het maken.
//   6. Leden/RLS: een niet-lid ziet niets; een gast kan geen opdracht geven; de eigenaar alleen kan integraties beheren.
//   7. Gebeurtenissen en energie/beveiliging-overzichten komen uit dezelfde bron, zonder verzonnen waarden.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import * as huis from '../../backend/huis-vnext';
import { haDienstVoor, komtOvereen, veiligAdres, vertaalEntiteit } from '../../backend/huis-adapter-thuis-assistent';
import { INTEGRATIE_CATALOGUS, OVERGANGEN, droogloop, magOvergang, plannerStructuur, schoneOpdrachtWaarde, schoneRegel, schoneScene, versheid } from '../../shared/huis-model';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { checker } from './hulp/nep-google';
import { ENTITEITEN, nepHomeAssistant, nietLoopbackAdres } from './hulp/nep-thuis-assistent';

const lees = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function main(): Promise<number> {
  const { check, einde } = checker('huis-vnext-20261028');
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string) => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'member', status: 'approved', name: email.split('@')[0] }]); return id; };
  const eig = await mk(`huis-eig-${sfx}@eenheid.test`);
  const gast = await mk(`huis-gast-${sfx}@eenheid.test`);
  const vreemd = await mk(`huis-vreemd-${sfx}@eenheid.test`);
  const TOKEN = `tok_${randomBytes(24).toString('hex')}`;
  const ha = await nepHomeAssistant({ token: TOKEN, entiteiten: ENTITEITEN });
  const oudVertrouwd = process.env.HUIS_VERTROUWDE_TOESTELLEN;
  delete process.env.HUIS_VERTROUWDE_TOESTELLEN;
  let woningId = '';
  try {
    // ================================================================ 0. migratie en vlag
    const mig = lees('migrations/0128_huis_vnext.sql');
    await getPool('migratie').query(mig); await getPool('migratie').query(mig);
    { const m131 = lees('migrations/0131_huis_rls_zonder_kringloop.sql'); await getPool('migratie').query(m131); await getPool('migratie').query(m131); } // UI-005: 0128 opnieuw zet de lus terug; 0131 haalt haar weg
    check('0128 draait twee keer zonder fout (idempotent) en de vlag huis-vnext staat UIT', (await pool.query(`SELECT aan FROM app.feature_flags WHERE sleutel = 'huis-vnext'`)).rows[0]?.aan === false && Boolean(VLAG_UITLEG['huis-vnext']?.wat[0]));

    // ================================================================ 1. lege woning
    const w = await huis.woningMaken(eig, 'Proefhuis');
    if ('fout' in w) throw new Error(w.fout);
    woningId = w.id;
    const leeg = (await huis.overzicht(eig, woningId))!;
    check('nieuwe woning: eigenaar is lid, geen integratie, geen apparaten, geen scènes — eerlijk leeg', leeg.woning.eigenaar && leeg.lid.rol === 'eigenaar' && leeg.integraties.length === 0 && leeg.apparaten.length === 0 && leeg.scenes.length === 0);
    check('een niet-lid ziet de woning niet (overzicht null, lijst leeg)', (await huis.overzicht(vreemd, woningId)) === null && (await huis.woningenLijst(vreemd)).length === 0);
    const r1 = await huis.ruimteMaken(eig, woningId, { naam: 'Woonkamer', verdieping: '0', geometrie: { x: 0, y: 0, w: 6, h: 4 } });
    const r2 = await huis.ruimteMaken(eig, woningId, { naam: 'Keuken', verdieping: '0' });
    check('ruimtes aanmaken met geometrie; een vreemde kan dat niet', !('fout' in r1) && !('fout' in r2) && (r1 as any).geometrie.w === 6 && 'fout' in (await huis.ruimteMaken(vreemd, woningId, { naam: 'x' })));

    // ================================================================ 2. adapter: vertaling
    const per = Object.fromEntries(ENTITEITEN.map((e) => [e.entity_id, vertaalEntiteit(e)]));
    check('lamp: aan/uit + helderheid (%) + kleurtemperatuur met bereik; toestand aan=false, helderheid 0', per['light.woonkamer']?.mogelijkheden.map((m) => m.soort).join() === 'aan_uit,helderheid,kleurtemperatuur' && per['light.woonkamer']?.mogelijkheden[2].bereik?.join() === '2000,6500' && per['light.woonkamer']?.toestanden.find((t) => t.kenmerk === 'aan')?.waarde === false);
    check('sensor temperature → temperatuur 21.4 °C gemeten; energy → energie kWh; unavailable → onbeschikbaar zonder waarde', per['sensor.temp_keuken']?.toestanden[0].waarde === 21.4 && per['sensor.temp_keuken']?.toestanden[0].eenheid === '°C' && per['sensor.energie_totaal']?.mogelijkheden[0].soort === 'energie' && per['sensor.vermogen_nu']?.toestanden[0].kwaliteit === 'onbeschikbaar' && per['sensor.vermogen_nu']?.toestanden[0].waarde === null && per['sensor.vermogen_nu']?.online === false);
    check('binary_sensor door → contact (+ batterij 87 %); moisture → water; smoke unknown → rook, kwaliteit onbekend, kritiek', per['binary_sensor.voordeur']?.mogelijkheden.map((m) => m.soort).join() === 'contact,batterij' && per['binary_sensor.lek_keuken']?.mogelijkheden[0].soort === 'water' && per['binary_sensor.rook_hal']?.toestanden[0].kwaliteit === 'onbekend' && per['binary_sensor.rook_hal']?.kritiek === true);
    check('climate → temperatuur (lezen) + doeltemperatuur (schrijven, bereik 7–30); cover → open_dicht + positie; lock/alarm kritiek; person → aanwezigheid', per['climate.thermostaat']?.mogelijkheden[1].bereik?.join() === '7,30' && per['cover.rolluik']?.mogelijkheden.map((m) => m.soort).join() === 'open_dicht,positie' && per['lock.voordeur']?.kritiek && per['alarm_control_panel.huis']?.kritiek && per['person.pavlo']?.toestanden[0].waarde === true);
    check('automation en sun zijn geen apparaat (null)', per['automation.nachtlicht'] === null && per['sun.sun'] === null);
    check('veiligAdres: loopback (ook IPv6-mapped), Hyper-V-subnet 203.0.113.0/24, userinfo, query, ftp geweigerd; LAN-adres aanvaard en genormaliseerd', !veiligAdres('http://127.0.0.1:8123').ok && !veiligAdres('http://[::ffff:127.0.0.1]:8123').ok && !veiligAdres('http://203.0.113.10:8123').ok && !veiligAdres('http://localhost:8123').ok && !veiligAdres('http://u:p@192.168.1.5:8123').ok && !veiligAdres('http://192.168.1.5:8123/?x=1').ok && !veiligAdres('ftp://192.168.1.5').ok && (veiligAdres('http://192.168.1.5:8123/') as any).adres === 'http://192.168.1.5:8123');
    check('haDienstVoor: aan→light.turn_on, helderheid→brightness_pct, cover dicht→close_cover, slot→lock; verkeerd domein → null', haDienstVoor('light.a', 'aan_uit', { aan: true })?.dienst === 'turn_on' && haDienstVoor('light.a', 'helderheid', { waarde: 40 })?.data.brightness_pct === 40 && haDienstVoor('cover.a', 'open_dicht', { actie: 'dicht' })?.dienst === 'close_cover' && haDienstVoor('lock.a', 'vergrendeld', { aan: true })?.dienst === 'lock' && haDienstVoor('sensor.a', 'aan_uit', { aan: true }) === null);
    check('komtOvereen: helderheid binnen 2 %, doeltemperatuur binnen 0,3 °C, aan/uit exact', komtOvereen('helderheid', { waarde: 40 }, [{ kenmerk: 'helderheid', waarde: 41 }]) && !komtOvereen('helderheid', { waarde: 40 }, [{ kenmerk: 'helderheid', waarde: 50 }]) && komtOvereen('doeltemperatuur', { waarde: 21 }, [{ kenmerk: 'doeltemperatuur', waarde: 21.2 }]) && !komtOvereen('aan_uit', { aan: true }, [{ kenmerk: 'aan', waarde: false }]));

    // ================================================================ 3. integratie: instellen, ontdekken, importeren
    check('lokaal adres zonder vermelding in gecontroleerde vertrouwde-toestellenlijst → TOESTEL_NIET_VERTROUWD en geen netwerkaanroep',
      (await huis.integratieInstellen(eig, woningId, { adres: ha.url, token: TOKEN }) as any).fout === 'TOESTEL_NIET_VERTROUWD' && ha.s.aanroepen.length === 0);
    process.env.HUIS_VERTROUWDE_TOESTELLEN = ha.url;
    check('instellen met een fout token wordt geweigerd (TOKEN_GEWEIGERD) en slaat niets op', (await huis.integratieInstellen(eig, woningId, { adres: ha.url, token: 'x'.repeat(30) }) as any).fout === 'TOKEN_GEWEIGERD' && (await pool.query(`SELECT count(*)::int AS n FROM app.huis_integraties WHERE woning_id = $1`, [woningId])).rows[0].n === 0);
    check('instellen door een niet-eigenaar is niet toegestaan', (await huis.integratieInstellen(gast, woningId, { adres: ha.url, token: TOKEN }) as any).fout === 'ALLEEN_EIGENAAR');
    const integ = await huis.integratieInstellen(eig, woningId, { adres: ha.url, token: TOKEN });
    if ('fout' in integ && integ.fout) throw new Error(`instellen: ${integ.fout}`);
    if (!('id' in integ)) throw new Error('instellen');
    const rij = (await pool.query(`SELECT geheim, info FROM app.huis_integraties WHERE id = $1`, [integ.id])).rows[0];
    check('integratie verbonden: token versleuteld (envelop v1.…), niet in de rij en niet in het antwoord; info zonder geheim', integ.stand === 'verbonden' && rij.geheim.startsWith('v1.') && !rij.geheim.includes(TOKEN) && !JSON.stringify(integ).includes(TOKEN) && !JSON.stringify(rij.info).includes(TOKEN) && integ.info.versie === '2026.10.1');
    const ont = await huis.integratieOntdekken(eig, woningId, integ.id);
    check('ontdekken (alleen lezen): 13 apparaten, 2 overgeslagen, nog niets opgeslagen', !('fout' in ont) && (ont as any).apparaten.length === 13 && (ont as any).overgeslagen === 2 && (await pool.query(`SELECT count(*)::int AS n FROM app.huis_apparaten WHERE woning_id = $1`, [woningId])).rows[0].n === 0);
    const imp = await huis.integratieImporteren(eig, woningId, integ.id, null);
    const imp2 = await huis.integratieImporteren(eig, woningId, integ.id, null);
    check('importeren: 13 nieuw; nog eens importeren: 0 nieuw, 13 bijgewerkt (geen dubbelen)', (imp as any).nieuw === 13 && (imp2 as any).nieuw === 0 && (imp2 as any).bijgewerkt === 13 && (await pool.query(`SELECT count(*)::int AS n FROM app.huis_apparaten WHERE woning_id = $1`, [woningId])).rows[0].n === 13);
    const ov = (await huis.overzicht(eig, woningId))!;
    const lamp = ov.apparaten.find((a) => a.bronId === 'light.woonkamer')!;
    const slot = ov.apparaten.find((a) => a.bronId === 'lock.voordeur')!;
    const rook = ov.apparaten.find((a) => a.bronId === 'binary_sensor.rook_hal')!;
    check('overzicht toont waargenomen toestanden met tijd en kwaliteit; de rookmelder is «onbekend», niet «in orde»', lamp.toestanden.find((t) => t.kenmerk === 'aan')?.waarde === false && versheid(lamp.toestanden[0]) === 'vers' && versheid(rook.toestanden[0]) === 'onbekend' && rook.toestanden[0].waarde === null);
    await huis.apparaatWijzigen(eig, woningId, lamp.id, { ruimteId: (r1 as any).id });
    check('apparaat in een ruimte zetten; een ruimte van een andere woning kan niet', (await huis.overzicht(eig, woningId))!.apparaten.find((a) => a.id === lamp.id)?.ruimteId === (r1 as any).id && (await huis.apparaatWijzigen(eig, woningId, lamp.id, { ruimteId: randomUUID() }) as any).fout === 'RUIMTE_ONBEKEND');

    // ================================================================ 4. opdrachten
    const o0 = await huis.opdrachtGeven(eig, woningId, { apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: true }, idempotentie: `idem-${sfx}-0` });
    check('zonder schrijftoestemming: opdracht geweigerd (SCHRIJVEN_NIET_TOEGESTAAN), vastgelegd als «geweigerd», niets naar HA', !o0.ok && o0.fout === 'SCHRIJVEN_NIET_TOEGESTAAN' && o0.opdracht?.stand === 'geweigerd' && !ha.s.aanroepen.some((a) => a.pad.startsWith('/api/services/')));
    await huis.integratieSchrijven(eig, woningId, integ.id, true);
    const o1 = await huis.opdrachtGeven(eig, woningId, { apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: true }, idempotentie: `idem-${sfx}-1` });
    check('lamp aan: HA kreeg light.turn_on; opdracht is VOLTOOID omdat de bron «on» teruggaf; uitkomst bewaard', o1.ok && o1.opdracht.stand === 'voltooid' && ha.s.aanroepen.some((a) => a.pad === '/api/services/light/turn_on') && o1.opdracht.uitkomst.aan === true, JSON.stringify({ stand: o1.opdracht?.stand, fout: (o1 as any).fout }));
    const o1b = await huis.opdrachtGeven(eig, woningId, { apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: false }, idempotentie: `idem-${sfx}-1` });
    check('dezelfde idempotentiesleutel geeft dezelfde opdracht terug (geen tweede uitvoering)', o1b.ok && o1b.opdracht.id === o1.opdracht.id && ha.s.aanroepen.filter((a) => a.pad.startsWith('/api/services/light/')).length === 1);
    const o2 = await huis.opdrachtGeven(eig, woningId, { apparaatId: lamp.id, mogelijkheid: 'helderheid', waarde: { waarde: 40 }, idempotentie: `idem-${sfx}-2` });
    check('helderheid 40 %: brightness_pct=40 verzonden en waargenomen (41 %) → voltooid', o2.ok && o2.opdracht.stand === 'voltooid' && ha.s.aanroepen.some((a) => (a.body as any)?.brightness_pct === 40));
    check('waarde buiten bereik of verkeerde vorm wordt geweigerd zonder HA aan te raken', (await huis.opdrachtGeven(eig, woningId, { apparaatId: lamp.id, mogelijkheid: 'helderheid', waarde: { waarde: 140 }, idempotentie: `idem-${sfx}-3` }) as any).fout === 'WAARDE_BUITEN_BEREIK' && (await huis.opdrachtGeven(eig, woningId, { apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: 'ja' }, idempotentie: `idem-${sfx}-4` }) as any).fout === 'WAARDE_AAN_VEREIST');
    const temp = ov.apparaten.find((a) => a.bronId === 'sensor.temp_keuken')!;
    check('een sensor is niet schrijfbaar (MOGELIJKHEID_NIET_SCHRIJFBAAR)', (await huis.opdrachtGeven(eig, woningId, { apparaatId: temp.id, mogelijkheid: 'temperatuur', waarde: { waarde: 25 }, idempotentie: `idem-${sfx}-5` }) as any).fout === 'MOGELIJKHEID_NIET_SCHRIJFBAAR');
    const k1 = await huis.opdrachtGeven(eig, woningId, { apparaatId: slot.id, mogelijkheid: 'vergrendeld', waarde: { aan: false }, idempotentie: `idem-${sfx}-6` });
    const k2 = await huis.opdrachtGeven(eig, woningId, { apparaatId: slot.id, mogelijkheid: 'vergrendeld', waarde: { aan: false }, idempotentie: `idem-${sfx}-7`, via: 'ai-voorstel', stepUpOk: true });
    check('slot ontgrendelen: zonder step-up geweigerd (STEP_UP_VEREIST); via AI-voorstel altijd geweigerd (KRITIEK_ALLEEN_MENS); HA niet aangeraakt', (k1 as any).fout === 'STEP_UP_VEREIST' && (k2 as any).fout === 'KRITIEK_ALLEEN_MENS' && !ha.s.aanroepen.some((a) => a.pad.startsWith('/api/services/lock/')));
    const k3 = await huis.opdrachtGeven(eig, woningId, { apparaatId: slot.id, mogelijkheid: 'vergrendeld', waarde: { aan: false }, idempotentie: `idem-${sfx}-8`, stepUpOk: true });
    check('slot ontgrendelen door een mens MET step-up: verzonden en voltooid; beleid vermeldt kritiek + stepUp', k3.ok && k3.opdracht.stand === 'voltooid' && k3.opdracht.beleid.kritiek === true && k3.opdracht.beleid.stepUp === true);
    // trage bron: ACK komt pas na 2,5 s → de opdracht blijft 'verzonden'/'bevestigd' en opdrachtLezen maakt haar later voltooid
    ha.s.vertragingMs = 2500;
    const o3 = await huis.opdrachtGeven(eig, woningId, { apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: false }, idempotentie: `idem-${sfx}-9` });
    check('trage bron: na de korte wachttijd nog niet voltooid (verzonden/bevestigd), niet als succes gemeld', o3.ok && (o3.opdracht.stand === 'verzonden' || o3.opdracht.stand === 'bevestigd'), o3.opdracht?.stand);
    await wacht(2600);
    const o3b = await huis.opdrachtLezen(eig, woningId, o3.opdracht!.id);
    check('… en opdrachtLezen poolt de waarneming na: nu voltooid', o3b?.stand === 'voltooid', o3b?.stand);
    ha.s.vertragingMs = 0; ha.s.doof = true;
    const o4 = await huis.opdrachtGeven(eig, woningId, { apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: true }, idempotentie: `idem-${sfx}-10` });
    await pool.query(`UPDATE app.huis_opdrachten SET deadline = now() - interval '1 second' WHERE id = $1`, [o4.opdracht!.id]);
    const o4b = await huis.opdrachtLezen(eig, woningId, o4.opdracht!.id);
    check('dove bron (aanvaardt, doet niets): na de deadline «verlopen zonder bevestiging», nooit voltooid', o4b?.stand === 'verlopen' && o4b?.fout === 'GEEN_ACK', o4b?.stand);
    ha.s.doof = false;
    check('overgangen: aanvaard→voltooid mag niet; verzonden→bevestigd wel; eindstanden hebben geen uitgang', !magOvergang('aanvaard', 'voltooid') && magOvergang('verzonden', 'bevestigd') && OVERGANGEN.voltooid.length === 0 && OVERGANGEN.geweigerd.length === 0);
    check('een gast kan geen opdracht geven (ROL_ALLEEN_LEZEN); een vreemde heeft geen toegang', ((await huis.lidToevoegen(eig, woningId, { email: `huis-gast-${sfx}@eenheid.test`, rol: 'gast' })) as any).ok === true && (await huis.opdrachtGeven(gast, woningId, { apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: true }, idempotentie: `idem-${sfx}-11` }) as any).fout === 'ROL_ALLEEN_LEZEN' && (await huis.opdrachtGeven(vreemd, woningId, { apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: true }, idempotentie: `idem-${sfx}-12` }) as any).fout === 'GEEN_TOEGANG');
    check('een gast ziet wel het overzicht (lezen), maar kan geen integratie beheren', (await huis.overzicht(gast, woningId))!.apparaten.length === 13 && (await huis.integratieSchrijven(gast, woningId, integ.id, false) as any).fout === 'ALLEEN_EIGENAAR');

    // ================================================================ 5. scènes, automatiseringen, voorstellen
    const sc = await huis.sceneBewaren(eig, woningId, null, { naam: 'Avond', stappen: [{ apparaatId: lamp.id, mogelijkheid: 'helderheid', waarde: { waarde: 30 } }, { apparaatId: ov.apparaten.find((a) => a.bronId === 'cover.rolluik')!.id, mogelijkheid: 'open_dicht', waarde: { actie: 'dicht' } }] });
    check('scène bewaren; een kritieke stap (slot) wordt al bij het bewaren geweigerd', !('fout' in sc) && (await huis.sceneBewaren(eig, woningId, null, { naam: 'Fout', stappen: [{ apparaatId: slot.id, mogelijkheid: 'vergrendeld', waarde: { aan: false } }] }) as any).fout === 'STAP_KRITIEK_NIET_TOEGESTAAN');
    const run = await huis.sceneUitvoeren(eig, woningId, (sc as any).id, `scene-${sfx}-1`);
    check('scène uitvoeren: elke stap een eigen opdracht met ACK → uitkomst voltooid 2/2, bewaard bij de scène', !('fout' in run) && (run as any).uitkomst === 'voltooid' && (run as any).stappen.length === 2 && (run as any).stappen.every((s: any) => s.stand === 'voltooid') && ((await huis.scenesLijst(eig, woningId))![0].laatsteRun as any).uitkomst === 'voltooid');
    const regel = { wanneer: [{ soort: 'drempel', apparaatId: temp.id, kenmerk: 'temperatuur', boven: 20 }], als: [{ soort: 'tijdvenster', van: '18:00', tot: '23:00' }], dan: [{ soort: 'opdracht', apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: true } }] };
    const dl = await huis.automatiseringDroogloop(eig, woningId, regel, '19:30');
    const voorDl = ha.s.aanroepen.length;
    check('droogloop tegen echte waarnemingen (21,4 > 20, 19:30 in venster) → zou starten; GEEN I/O naar de bron', !('fout' in dl) && (dl as any).droogloop.zouStarten === true && (dl as any).geenIo && ha.s.aanroepen.length === voorDl);
    const dl2 = await huis.automatiseringDroogloop(eig, woningId, regel, '09:00');
    check('droogloop om 09:00: buiten het venster → start niet; alles uitgelegd per voorwaarde', (dl2 as any).droogloop.zouStarten === false && (dl2 as any).droogloop.als[0].waar === false);
    const au = await huis.automatiseringBewaren(eig, woningId, null, { naam: 'Avondlicht', regel, stand: 'simulatie' });
    check('automatisering bewaren als simulatie; «aan» wordt eerlijk geweigerd (NOG_NIET_UITVOERBAAR); kritiek in «dan» geweigerd', !('fout' in au) && (au as any).stand === 'simulatie' && (await huis.automatiseringBewaren(eig, woningId, null, { naam: 'x', regel, stand: 'aan' }) as any).fout === 'NOG_NIET_UITVOERBAAR' && !schoneRegel({ ...regel, dan: [{ soort: 'opdracht', apparaatId: slot.id, mogelijkheid: 'vergrendeld', waarde: { aan: false } }] }).ok);
    const vs = await huis.voorstelMaken(eig, woningId, { door: 'claude', samenvatting: 'Lamp uit, niemand thuis', apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: false } });
    const voorVs = ha.s.aanroepen.filter((a) => a.pad.startsWith('/api/services/')).length;
    check('AI-voorstel maken voert NIETS uit; kritiek voorstel geweigerd bij het maken', !('fout' in vs) && (vs as any).stand === 'wacht' && ha.s.aanroepen.filter((a) => a.pad.startsWith('/api/services/')).length === voorVs && (await huis.voorstelMaken(eig, woningId, { door: 'claude', samenvatting: 'open slot', apparaatId: slot.id, mogelijkheid: 'vergrendeld', waarde: { aan: false } }) as any).fout === 'KRITIEK_ALLEEN_MENS');
    const bes = await huis.voorstelBesluiten(eig, woningId, (vs as any).id, true);
    check('goedkeuren door een mens → opdracht via «ai-voorstel», voltooid; het voorstel verwijst ernaar', !('fout' in bes && bes.fout) && (bes as any).opdracht?.stand === 'voltooid' && (bes as any).opdracht?.via === 'ai-voorstel' && (bes as any).voorstel.stand === 'goedgekeurd');

    // ================================================================ 6. overzichten en gebeurtenissen
    const en = (await huis.energieOverzicht(eig, woningId, 24))!;
    check('energie: alleen apparaten met energie/vermogen (2), reeksen uit de bron (leeg in de nep-HA), geen verzonnen tarief', en.meters === 2 && en.fout === '' && Object.keys(en.reeksen).length === 0 && !('tarief' in en));
    const bv = (await huis.beveiligingOverzicht(eig, woningId))!;
    check('beveiliging: sensoren/slot/alarm/aanwezigheid uit de bron, «gecertificeerd: false» uitdrukkelijk', bv.apparaten.length === 6 && bv.gecertificeerd === false);
    const geb = (await huis.gebeurtenissenLijst(eig, woningId, {}))!;
    check('gebeurtenissen: integratie, import, opdrachten (verzonden/bevestigd/geweigerd), scène, voorstel — nieuwste eerst, zonder token', geb.gebeurtenissen.length >= 8 && geb.gebeurtenissen.some((g) => g.soort === 'scene') && geb.gebeurtenissen.some((g) => g.soort === 'voorstel') && !JSON.stringify(geb).includes(TOKEN));
    const sync = await huis.integratieSynchroniseren(eig, woningId, integ.id);
    check('synchroniseren: 13 bijgewerkt, 0 weg, hartslag gezet', (sync as any).bijgewerkt === 13 && (sync as any).weg === 0 && Boolean((await huis.overzicht(eig, woningId))!.integraties[0].hartslag));
    await ha.stop();
    const sync2 = await huis.integratieSynchroniseren(eig, woningId, integ.id);
    const o5 = await huis.opdrachtGeven(eig, woningId, { apparaatId: lamp.id, mogelijkheid: 'aan_uit', waarde: { aan: true }, idempotentie: `idem-${sfx}-13` });
    check('bron onbereikbaar: synchronisatie meldt GEEN_ANTWOORD, integratie «verzwakt», opdracht «offline» — nooit «voltooid»', (sync2 as any).fout === 'GEEN_ANTWOORD' && (await huis.overzicht(eig, woningId))!.integraties[0].stand === 'verzwakt' && !o5.ok && o5.opdracht?.stand === 'offline');
    check('loskoppelen: token en apparaten weg', (await huis.integratieVerwijderen(eig, woningId, integ.id) as any).verwijderd === true && (await pool.query(`SELECT count(*)::int AS n FROM app.huis_apparaten WHERE woning_id = $1`, [woningId])).rows[0].n === 0);

    // ================================================================ 7. model
    check('schoneOpdrachtWaarde: open_dicht alleen open/dicht/stop; doeltemperatuur binnen 5–35', (schoneOpdrachtWaarde('open_dicht', { actie: 'open' }) as any).waarde.actie === 'open' && !schoneOpdrachtWaarde('open_dicht', { actie: 'half' }).ok && !schoneOpdrachtWaarde('doeltemperatuur', { waarde: 60 }).ok);
    check('schoneScene: naam vereist, hoogstens 40 stappen', !schoneScene({ naam: '', stappen: [] }).ok && !schoneScene({ naam: 'x', stappen: Array.from({ length: 41 }, () => ({ apparaatId: 'a', mogelijkheid: 'aan_uit', waarde: { aan: true } })) }).ok);
    const dr = droogloop({ wanneer: [{ soort: 'toestand', apparaatId: 'a', kenmerk: 'aan', wordt: true }], als: [], alsModus: 'alle', dan: [{ soort: 'opdracht', apparaatId: 'a', mogelijkheid: 'aan_uit', waarde: { aan: false } }], instellingen: { afkoelMinuten: 0, maxPerDag: 50, vertragingSeconden: 0 } }, { a: { aan: true } });
    check('droogloop markeert een mogelijke lus (zelfde apparaat in wanneer en dan) en ontbrekende afkoeltijd', dr.zouStarten && dr.opmerkingen.includes('MOGELIJKE_LUS') && dr.opmerkingen.includes('GEEN_AFKOELTIJD'));
    const pl = plannerStructuur({ soort: 'rijhuis', oppervlakte: 150, fase: 'bewoond', functies: ['licht', 'beveiliging', 'camera'] });
    check('planner geeft structuur (zones, aantallen, complexiteit) en GEEN bedragen', pl.zones === 8 && pl.totaal > 0 && pl.complexiteit.some((c) => c.id === 'bewoond') && !('prijs' in pl) && !JSON.stringify(pl).includes('€'));
    check('catalogus: alleen Home Assistant «beschikbaar»; Ajax en Apple Home «niet ondersteund»; elk met bron en uitleg', INTEGRATIE_CATALOGUS.filter((k) => k.stand === 'beschikbaar').map((k) => k.id).join() === 'home-assistant' && INTEGRATIE_CATALOGUS.find((k) => k.id === 'ajax')?.stand === 'niet_ondersteund' && INTEGRATIE_CATALOGUS.find((k) => k.id === 'apple-home')?.stand === 'niet_ondersteund' && INTEGRATIE_CATALOGUS.every((k) => /^https:\/\//.test(k.bron) && k.wat[0].length > 5));
    check('de oude pagina (DomoticaWeergave) bestaat nog; de nieuwe zit achter de vlag', /huis-vnext/.test(lees('src/DomoticaWeergave.tsx')) && /SmartHomeView/.test(lees('src/VerenigdDienstApp.tsx')));
    check('bronadres zonder loopback beschikbaar voor deze test', Boolean(nietLoopbackAdres()));
  } finally {
    if (oudVertrouwd === undefined) delete process.env.HUIS_VERTROUWDE_TOESTELLEN; else process.env.HUIS_VERTROUWDE_TOESTELLEN = oudVertrouwd;
    await ha.stop().catch(() => undefined);
    if (woningId) await pool.query(`DELETE FROM app.huis_woningen WHERE id = $1`, [woningId]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [[eig, gast, vreemd]]).catch(() => undefined);
  }
  return einde();
}
