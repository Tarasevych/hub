// APPARAAT-001 — de hele stroom tegen een echte database (geen netwerk, geen Telegram-server): A vraagt, B ziet (zonder het
// juiste symbool), aftelling, toegangssleutel op B, zelfde browser geweigerd, één poging (verkeerd = geweigerd + teller),
// juist = bevestigd → step-up voor A via de poort (sterk met toegangssleutel), verbruik, «Ні» wint, intrekken, snelheidslimiet,
// pauze en «uit» na te veel fouten + herstel, symboolknop in Telegram (zelfde teller), opruimen, stroom zonder sessie = 503.
import { randomUUID } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { getPool } from '../../server/platform/pg';

export async function main(): Promise<number> {
  const { check, einde } = checker('apparaat-bevestiging-stroom-20261109');
  if (!process.env.DATABASE_URL) { console.log('OK   overgeslagen: geen DATABASE_URL'); return einde(); }
  const pool = getPool('systeem');
  const sql = async <T = Record<string, unknown>>(q: string, w: unknown[] = []): Promise<T[]> => (await pool.query(q, w)).rows as T[];
  const verwacht = async (fn: () => Promise<unknown>): Promise<string> => { try { await fn(); return ''; } catch (e) { return String((e as Error).message); } };

  // Eén eigenaar (records_een_eigenaar): de bestaande gebruiken, anders tijdelijk maken.
  const bestaand = (await sql<{ id: string }>("SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1"))[0];
  const eigenaar = bestaand ? String(bestaand.id) : randomUUID();
  if (!bestaand) await sql('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', eigenaar, { email: `apb-${eigenaar.slice(0, 8)}@voorbeeld.test`, role: 'owner', status: 'approved', name: 'Pavlo' }]);
  const R = randomUUID().slice(0, 8);
  const ankerA = `anker-a-${R}`, tabA = `tab-a-${R}`, ankerB = `anker-b-${R}`, tabB = `tab-b-${R}`;
  const nu = Date.now();
  const opruimen = async () => {
    await sql("DELETE FROM app.records WHERE tbl = 'owner_tab_sessions_v1' AND id IN ($1,$2)", [tabA, tabB]);
    await sql('DELETE FROM app.bevestigingen_apparaat WHERE user_id = $1', [eigenaar]);
    await sql('DELETE FROM app.apparaat_voorkeuren WHERE user_id = $1', [eigenaar]);
    await sql('DELETE FROM app.apparaat_instellingen');
    await sql("DELETE FROM app.tg_bevestigingen WHERE user_id = $1 AND actie = 'stap-op'", [eigenaar]);
    await sql("DELETE FROM app.tg_koppelingen WHERE telegram_id = '424242'");
  };
  await opruimen();
  await sql("UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel = 'apparaat-bevestiging-v1'");
  const tabRij = (id: string, anker: string) => ({ anchorSessionId: anker, tabHash: `h-${id}`, userId: eigenaar, service: 'identity', sourceOrigin: 'https://id.tarasevych.com', status: 'active', createdAt: nu, lastSeenAt: nu, idleExpiresAt: nu + 3_600_000, absoluteExpiresAt: nu + 86_400_000, revocationEpoch: 0 });
  await sql('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3), ($1,$4,$5)', ['owner_tab_sessions_v1', tabA, tabRij(tabA, ankerA), tabB, tabRij(tabB, ankerB)]);

  const opslag = await import('../../backend/apparaat-bevestiging/opslag');
  opslag.registreerVlagBeoordelaar(async (id) => id === eigenaar);
  opslag.instellingenCacheWissen();
  const kern = await import('../../backend/apparaat-bevestiging/kern');
  const stroom = await import('../../backend/apparaat-bevestiging/stroom');
  const stapOp = await import('../../backend/stap-op');
  const poortMod = await import('../../backend/telegram-aanmelden/beleid-poort');
  type Auth = Parameters<typeof kern.aanvragen>[0];
  const authA: Auth = { user: { id: eigenaar, role: 'owner' }, session: { id: ankerA, createdAt: nu }, tabSession: { id: tabA, createdAt: nu } };
  const authB: Auth = { user: { id: eigenaar, role: 'owner' }, session: { id: ankerB, createdAt: nu }, tabSession: { id: tabB, createdAt: nu } };
  const vorige = { verlopen: async (id: string) => sql("UPDATE app.bevestigingen_apparaat SET aangemaakt_op = now() - interval '30 seconds' WHERE id = $1", [id]) };

  try {
    // ------------------------------------------------------------ beschikbaarheid
    const b0 = await kern.beschikbaarheid(eigenaar, 'owner', ankerA);
    check('beschikbaar voor A: één ander levend apparaat (B)', b0.ok && b0.apparaten === 1, JSON.stringify({ reden: b0.reden, apparaten: b0.apparaten }));
    const bX = await kern.beschikbaarheid(randomUUID(), 'owner');
    check('zonder vlag voor die gebruiker → VLAG_UIT', !bX.ok && bX.reden === 'VLAG_UIT');
    await opslag.instellingenOpslaan('test', { wieMag: 'eigenaar' });
    const bG = await kern.beschikbaarheid(eigenaar, 'gast', ankerA);
    check('wieMag «eigenaar» sluit anderen uit (NIET_TOEGESTAAN)', !bG.ok && bG.reden === 'NIET_TOEGESTAAN');
    await opslag.instellingenOpslaan('test', { wieMag: 'iedereen', aan: false });
    check('noodschakelaar uit → UITGESCHAKELD', (await kern.beschikbaarheid(eigenaar, 'owner', ankerA)).reden === 'UITGESCHAKELD');
    await opslag.instellingenOpslaan('test', { wieMag: 'iedereen', aan: true, maxPerTienMinuten: 30 });

    // ------------------------------------------------------------ aanvragen → open → stand
    const v1 = await kern.aanvragen(authA, { actie: 'stap-op', label: 'passkey-toevoegen', dienst: 'identity', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0' });
    check('aanvraag: 3 kandidaten, juiste positie alleen naar A, apparaatlabel, naam van de echte handeling', v1.kandidaten.length === 3 && typeof v1.juist === 'number' && v1.apparaten === 1 && v1.apparaatA === 'Chrome/Windows' && v1.actieNaam[0] === 'Додавання passkey' && v1.stand === 'wacht');
    const openB = await kern.open(authB);
    check('B ziet het verzoek ZONDER het juiste symbool, met dezelfde kandidaten in dezelfde volgorde', openB.verzoeken.length === 1 && openB.verzoeken[0].juist === undefined && openB.verzoeken[0].kandidaten.join() === v1.kandidaten.join());
    check('A (dezelfde browser als het verzoek) ziet het NIET als te bevestigen', (await kern.open(authA)).verzoeken.length === 0);
    check('stand voor A: wacht, met de juiste positie', (await kern.stand(authA, v1.id)).juist === v1.juist);
    check('stand door een vreemde sessie → VERZOEK_ONBEKEND', await verwacht(() => kern.stand(authB, v1.id)) === 'VERZOEK_ONBEKEND');

    // ------------------------------------------------------------ bekrachtigen: aftelling, sleutel, zelfde anker, één poging
    check('vóór de aftelling → TE_SNEL', await verwacht(() => kern.bekrachtigen(authB, v1.id, v1.juist!)) === 'TE_SNEL');
    await vorige.verlopen(v1.id);
    check('zonder verse toegangssleutel op B → STEP_UP_PASSKEY_REQUIRED', await verwacht(() => kern.bekrachtigen(authB, v1.id, v1.juist!)) === 'STEP_UP_PASSKEY_REQUIRED');
    check('vanaf hetzelfde anker (A zelf) → ZELFDE_APPARAAT', await verwacht(() => kern.bekrachtigen(authA, v1.id, v1.juist!)) === 'ZELFDE_APPARAAT');
    await stapOp.passkeyStapOpVastleggen(authB as never);
    check('ongeldige positie → KEUZE_ONGELDIG', await verwacht(() => kern.bekrachtigen(authB, v1.id, 7)) === 'KEUZE_ONGELDIG');
    const fout1 = await kern.bekrachtigen(authB, v1.id, (v1.juist! + 1) % 3);
    check('verkeerd symbool: geweigerd, uitkomst «fout», teller 1', !fout1.ok && fout1.stand === 'geweigerd' && fout1.uitkomst === 'fout' && (await opslag.voorkeuren(eigenaar)).mislukt === 1);
    check('daarna: AL_AFGEROND (één poging, geen tweede kans op hetzelfde verzoek)', await verwacht(() => kern.bekrachtigen(authB, v1.id, v1.juist!)) === 'AL_AFGEROND');
    check('A ziet geweigerd met reden «fout-symbool»', (await kern.stand(authA, v1.id)).stand === 'geweigerd' && (await kern.stand(authA, v1.id)).reden === 'fout-symbool');

    // ------------------------------------------------------------ juist → bevestigd → step-up voor A via de poort
    const v2 = await kern.aanvragen(authA, { actie: 'stap-op', label: 'passkey-toevoegen', dienst: 'identity' });
    await vorige.verlopen(v2.id);
    const ok2 = await kern.bekrachtigen(authB, v2.id, v2.juist!);
    check('juist symbool → bevestigd; teller terug op 0', ok2.ok && (await opslag.voorkeuren(eigenaar)).mislukt === 0);
    check('vóór de poort: A heeft nog GEEN step-up (de kern legt hem niet zelf)', !(await stapOp.stapOpGeldig(authA as never, Date.now(), { onthoud: false })));
    check('voldaan voor sessie A + stap-op', await kern.voldaan(eigenaar, tabA, 'stap-op'));
    const p = await poortMod.poort(authA as never, 'stap-op');
    check('poort van de bevestigingstabel: toegestaan met voldaan «apparaat»', p.ok, JSON.stringify(p));
    const methode = await kern.stapOpNaPoort(authA, await poortMod.voldaanVoor(authA as never, 'stap-op'));
    check('step-up voor A vastgelegd als «apparaat», sterk (toegangssleutel op B, sterkBijPasskey aan)', methode === 'apparaat' && (await stapOp.stapOpGeldig(authA as never, Date.now(), { onthoud: false })) && (await stapOp.sterkeStapOpGeldig(authA as never)) && !(await stapOp.passkeyStapOpGeldig(authA as never)));
    await poortMod.verbruik(authA as never, 'stap-op');
    check('verbruikt: niet nog eens te gebruiken', !(await kern.voldaan(eigenaar, tabA, 'stap-op')) && (await kern.stand(authA, v2.id)).stand === 'gebruikt');
    check('B ziet geen open verzoek meer', (await kern.open(authB)).verzoeken.length === 0);

    // ------------------------------------------------------------ niet sterk zonder sterkBijPasskey; totp op B
    await opslag.instellingenOpslaan('test', { sterkBijPasskey: false, maxPerTienMinuten: 30 });
    await stapOp.stapOpVerbruiken(authA as never);
    const v3 = await kern.aanvragen(authA, { actie: 'stap-op', dienst: 'identity' });
    await vorige.verlopen(v3.id);
    await kern.bekrachtigen(authB, v3.id, v3.juist!);
    await kern.stapOpNaPoort(authA, new Set(['apparaat']));
    check('sterkBijPasskey uit → gewone step-up, niet sterk', (await stapOp.stapOpGeldig(authA as never, Date.now(), { onthoud: false })) && !(await stapOp.sterkeStapOpGeldig(authA as never)));
    await opslag.instellingenOpslaan('test', { sterkBijPasskey: true, maxPerTienMinuten: 30 });

    // ------------------------------------------------------------ «Ні» wint; intrekken door A
    const v4 = await kern.aanvragen(authA, { actie: 'stap-op', dienst: 'identity' });
    await kern.weigeren(authB, v4.id);
    const s4 = await kern.stand(authA, v4.id);
    check('«Це не я» op B: meteen geweigerd, reden «niet-ik», zonder aftelling of sleutel', s4.stand === 'geweigerd' && s4.reden === 'niet-ik');
    const v5 = await kern.aanvragen(authA, { actie: 'stap-op', dienst: 'identity' });
    await kern.intrekken(authA, v5.id);
    check('A trekt in → ingetrokken; B kan niet meer bekrachtigen', (await kern.stand(authA, v5.id)).stand === 'ingetrokken' && await verwacht(() => kern.bekrachtigen(authB, v5.id, 0)) === 'AL_AFGEROND');
    const v6a = await kern.aanvragen(authA, { actie: 'stap-op', dienst: 'identity' });
    const v6b = await kern.aanvragen(authA, { actie: 'stap-op', dienst: 'identity' });
    check('nieuw verzoek van hetzelfde tabblad vervangt het vorige (geen stapel)', (await kern.stand(authA, v6a.id)).stand === 'ingetrokken' && (await kern.stand(authA, v6b.id)).stand === 'wacht');

    // ------------------------------------------------------------ snelheidslimiet
    await opslag.instellingenOpslaan('test', { maxPerTienMinuten: 3 });
    check('snelheidslimiet per 10 minuten → RATE_LIMITED', await verwacht(() => kern.aanvragen(authA, { actie: 'stap-op', dienst: 'identity' })) === 'RATE_LIMITED');
    await opslag.instellingenOpslaan('test', { maxPerTienMinuten: 30, pauzeNa: 2, uitNa: 3 });
    await sql("UPDATE app.bevestigingen_apparaat SET stand = 'verlopen' WHERE user_id = $1 AND stand = 'wacht'", [eigenaar]);

    // ------------------------------------------------------------ pauze en «uit» na te veel fouten, herstel
    const fout = async () => { const v = await kern.aanvragen(authA, { actie: 'stap-op', dienst: 'identity' }); await vorige.verlopen(v.id); return kern.bekrachtigen(authB, v.id, (v.juist! + 1) % 3); };
    await fout();
    const f2 = await fout();
    check('na pauzeNa (2) fouten → pauze; beschikbaarheid METHODE_PAUZE', !f2.ok && f2.uitkomst === 'pauze' && (await kern.beschikbaarheid(eigenaar, 'owner', ankerA)).reden === 'METHODE_PAUZE');
    check('in de pauze kan A niet aanvragen', await verwacht(() => kern.aanvragen(authA, { actie: 'stap-op', dienst: 'identity' })) === 'METHODE_PAUZE');
    await sql('UPDATE app.apparaat_voorkeuren SET pauze_tot = NULL WHERE user_id = $1', [eigenaar]);
    const f3 = await fout();
    check('na uitNa (3) fouten → uit; beschikbaarheid METHODE_UIT', !f3.ok && f3.uitkomst === 'uit' && (await kern.beschikbaarheid(eigenaar, 'owner', ankerA)).reden === 'METHODE_UIT');
    await kern.herstelNaSleutel(authA);
    check('herstel (na toegangssleutel) → weer beschikbaar, teller 0', (await kern.beschikbaarheid(eigenaar, 'owner', ankerA)).ok && (await opslag.voorkeuren(eigenaar)).mislukt === 0);

    // ------------------------------------------------------------ voorkeuren: uit, symbolen, toonAls
    await kern.voorkeurenZetten(authA, { aan: false });
    check('voorkeur «aan: false» → UITGESCHAKELD voor deze gebruiker', (await kern.beschikbaarheid(eigenaar, 'owner', ankerA)).reden === 'UITGESCHAKELD');
    await kern.voorkeurenZetten(authA, { aan: true, symbolen: 'letters', geluid: true });
    const v7 = await kern.aanvragen(authA, { actie: 'stap-op', dienst: 'identity' });
    check('voorkeur «letters» bepaalt de soort; open() geeft geluid-voorkeur mee aan B', v7.soort === 'letters' && (await kern.open(authB)).geluid === true);
    const oz = await kern.overzicht(authA);
    check('overzicht voor de gebruiker: voorkeuren, teller, apparaten, recente verzoeken zonder juiste positie', oz.voorkeuren.symbolen === 'letters' && oz.apparaten.length === 1 && oz.recent.length > 3 && oz.recent.every((r) => r.juist === undefined));
    const bo = await kern.beheerOverzicht();
    check('beheeroverzicht telt: verzoeken, verkeerde symbolen, «niet ik»', bo.cijfers.week >= 8 && bo.cijfers.geweigerd >= 3 && bo.cijfers.nietIk >= 1 && bo.ongedaanMogelijk);

    // ------------------------------------------------------------ Telegram: symboolknop (zelfde teller)
    const tg = await import('../../backend/telegram-aanmelden/bevestigen');
    const [k] = await sql<{ id: string }>("INSERT INTO app.tg_koppelingen (user_id, telegram_id, chat_id, telefoon, naam, site_taal) VALUES ($1, '424242', '424242', '+32400000000', 'Test', 'uk') RETURNING id", [eigenaar]);
    const tgId = (n: number) => `tgsym${String(n).padStart(7, '0')}`;
    await sql("INSERT INTO app.tg_bevestigingen (id, user_id, sessie_id, actie, methode, verloopt_op, soort, kandidaten, juist) VALUES ($1,$2,$3,'stap-op','telegram', now() + interval '5 minutes', 'cijfers', '{0,1,2}', 1)", [tgId(1), eigenaar, tabA]);
    check('Telegram: verkeerd symbool → fout-symbool, rij geweigerd, teller +1', await tg.bevestigingSymbool(`${tgId(1)}:${k.id}:0`, '424242') === 'fout-symbool' && (await sql<{ stand: string }>('SELECT stand FROM app.tg_bevestigingen WHERE id = $1', [tgId(1)]))[0].stand === 'geweigerd' && (await opslag.voorkeuren(eigenaar)).mislukt === 1);
    await sql("INSERT INTO app.tg_bevestigingen (id, user_id, sessie_id, actie, methode, verloopt_op, soort, kandidaten, juist) VALUES ($1,$2,$3,'stap-op','telegram', now() + interval '5 minutes', 'cijfers', '{0,1,2}', 1)", [tgId(2), eigenaar, tabA]);
    check('Telegram: juist symbool → bevestigd', await tg.bevestigingSymbool(`${tgId(2)}:${k.id}:1`, '424242') === 'bevestigd');
    check('Telegram: vreemde Telegram-id → verlopen (niets gewijzigd)', await tg.bevestigingSymbool(`${tgId(2)}:${k.id}:1`, '1') === 'verlopen');
    await stapOp.stapOpVerbruiken(authA as never);
    await kern.verbruik(eigenaar, tabA, 'stap-op'); // de nog openstaande apparaat-bevestiging (v3) telt anders mee: de poort kiest de sterkste bron
    const voldaanTg = await poortMod.voldaanVoor(authA as never, 'stap-op');
    check('poort ziet «telegram» voldaan; stapOpNaPoort → telegram, nooit sterk', voldaanTg.has('telegram') && (await kern.stapOpNaPoort(authA, voldaanTg)) === 'telegram' && (await stapOp.stapOpGeldig(authA as never, Date.now(), { onthoud: false })) && !(await stapOp.sterkeStapOpGeldig(authA as never)));

    // ------------------------------------------------------------ opruimen en stroom
    await sql("UPDATE app.bevestigingen_apparaat SET aangemaakt_op = now() - interval '31 days', verloopt_op = now() - interval '31 days' + interval '2 minutes' WHERE id = $1", [v7.id]);
    await kern.opruimen();
    check('opruimen: rijen ouder dan 30 dagen weg, open verlopen verzoeken gesloten', (await sql('SELECT 1 FROM app.bevestigingen_apparaat WHERE id = $1', [v7.id])).length === 0 && (await sql("SELECT count(*)::int AS n FROM app.bevestigingen_apparaat WHERE user_id = $1 AND stand = 'wacht' AND verloopt_op < now()", [eigenaar]))[0].n === 0);
    check('stroom: publiceren zonder open stromen bereikt niemand (en faalt niet)', stroom.publiceer(eigenaar, { soort: 'hartslag', op: new Date().toISOString() }) === 0);
    stroom.registreerStroomAuth(null);
    const koppen: Record<string, unknown> = {}; let status = 0; let lichaam = '';
    const res = { writeHead: (s: number, h: Record<string, unknown>) => { status = s; Object.assign(koppen, h); }, end: (b?: string) => { lichaam = String(b || ''); }, write: () => true } as never;
    await stroom.stroomVerzoekApparaat({ on: () => undefined } as never, res, {}, {});
    check('stroom zonder geregistreerde sessiecontrole → 503, geen open verbinding', status === 503 && lichaam.includes('STROOM_NIET_BESCHIKBAAR'));
    stroom.registreerStroomAuth(async () => ({ fout: 'OWNER_SESSION_REQUIRED' }));
    await stroom.stroomVerzoekApparaat({ on: () => undefined } as never, res, {}, {});
    check('stroom zonder sessie → 401', status === 401);
  } finally {
    await opruimen();
  }
  return einde();
}
