// DE DIENST «ai» (Підключення ШІ) IN DE GESCHEIDEN GEGEVENSRUIMTES — 20.10.2026.
//
// Deze dienst was het bijzondere geval: de kolom `ruimte` bestond hier allang (migratie 0042: app.agents, app.mcp_oauth_tokens,
// app.mcp_console_tokens, en 0078 app.externe_mcp_verbinding) en 's ochtends kwam daar de LEVENDE berekening bij
// (backend/ai-ruimte-poort.ts → effectieveRuimte, gefilterd in tools/list én tools/call). Daardoor waren er DRIE waarheden, en
// de derde — de STAND van de dienst «ai» uit de kern (app.ruimte_dienst_stand: eigen / gedeeld / uit / bevroren) — las niemand.
// Een eigenaar die «Підключення ШІ» op «Вимкнено» zette, hield dus zijn volledige technische connector.
//
// Wat deze test vasthoudt:
//   1. de bestaande rijen blijven PERSOONLIJK (een rij zonder/met ruimte='prive' komt nooit in de technische lade);
//   2. 'uit'      — de technische connector krijgt GEEN technisch hulpmiddel en GEEN technisch apparaat;
//   3. 'eigen'    — hij krijgt zijn EIGEN technische apparaten en verbindingen, en nooit de persoonlijke;
//   4. 'gedeeld'  — hij gebruikt juist de PERSOONLIJKE verbindingen (de bewuste samenvoeging), terwijl de zes voorwaarden van
//                   het technische browserslot even streng blijven;
//   5. 'bevroren' — alles technische is op hetzelfde moment ingetrokken en onbereikbaar; het persoonlijke blijft heel;
//   6. de extensie: het technische SLOT is aan dezelfde stand ondergeschikt (zevende voorwaarde, niet minder dan zes);
//   7. GEEN van de bestaande wegen gaat eromheen: effectieveRuimte(Veilig), levendeRuimte, technischNuGeldig, v2Lijst/v2Roep,
//      lijstTools/roepTool, de browserpoort en de keuze-bij-het-koppelen;
//   8. het eigenaarsbesluit over een bevroren lade wordt ECHT uitgevoerd (overdragen / verwijderen) en een tweede aanroep is
//      onschadelijk.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import { hoortBij, sqlLadeWaar } from '../../shared/ruimte-scheiding';
import { apparaatInRuimte } from '../../shared/ai-ruimte';
import { WEIGER_UITLEG, isWeigercode } from '../../shared/extensie-ontgrendeling';
import * as rs from '../../backend/ruimte-scheiding';
import { aiPoortNu, aiStandVeilig, aiTechnischToegestaan, aiVerbindingRuimte, effectieveRuimte, effectieveRuimteVeilig } from '../../backend/ai-ruimte-poort';
import * as mc from '../../backend/mcp-connector';
import * as v2 from '../../backend/connector-v2';
import { metNamens } from '../../backend/mcp-namens';
import * as store from '../../backend/connectors-opslag';
import { recht as extensieRecht } from '../../backend/extensie-ontgrendeling';
import { tabHash } from '../../backend/tech-profiel';
import { checker } from './hulp/nep-google';
// Alleen voor het neveneffect: de dienst «ai» meldt zijn lade-uitvoerder aan bij het register (backend/ai-ruimte-lade.ts).
import '../../backend/ai-ruimte-lade';

const tab = () => randomBytes(24).toString('hex');
const lees = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
async function codeVan(p: Promise<unknown>): Promise<string> { try { await p; return 'OK'; } catch (e) { return e instanceof rs.RuimteFout ? e.code : `ANDERS:${(e as Error).message}`; } }
/** Namen uit het resultaat van machine_list (onbetrouwbare gegevens van het apparaat zelf; hier alleen om te vergelijken). */
const namenUit = (uit: { content?: Array<{ text?: string }>; isError?: boolean }): string[] => {
  if (uit.isError) return [];
  const t = String(uit.content?.[0]?.text ?? '');
  const m = t.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { return (JSON.parse(m[0]) as Array<{ name?: string }>).map((a) => String(a.name ?? '')); } catch { return []; }
};

export async function main(): Promise<number> {
  const { check, einde } = checker('ruimte-ai');
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');

  // Er kan maar één eigenaar zijn (index records_een_eigenaar): de bestaande hergebruiken.
  const bestaand = (await pool.query(`SELECT id, data->>'email' AS email, data->>'status' AS status FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const eigId = bestaand ? String(bestaand.id) : randomUUID();
  if (!bestaand) await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', eigId, { email: `eig-${sfx}@eenheid.test`, role: 'owner', status: 'approved' }]);
  const eigStatus = bestaand ? String(bestaand.status || 'approved') : 'approved';
  const lidId = randomUUID();
  await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', lidId, { email: `lid-${sfx}@eenheid.test`, role: 'member', status: 'approved' }]);

  const tE = tab();
  const hadProfiel = (await pool.query('SELECT 1 FROM app.tech_profielen WHERE user_id=$1', [eigId])).rows.length > 0;
  const hadKeuze = (await pool.query('SELECT 1 FROM app.ruimte_keuze WHERE user_id=$1', [eigId])).rows.length > 0;
  /** Apparaten en tokens die deze test maakt; worden in `finally` weggehaald. */
  const techAgent = randomUUID(); const priveAgent = randomUUID(); const lidAgent = randomUUID();
  const tokenTech = `t-${randomBytes(16).toString('hex')}`; const tokenPrive = `p-${randomBytes(16).toString('hex')}`;
  const externTech = randomUUID(); const externPrive = randomUUID();

  const wieTech = (): mc.Wie => ({ userId: eigId, clientName: 'Claude', ruimte: 'technisch' });
  const wiePrive = (): mc.Wie => ({ userId: eigId, clientName: 'Claude', ruimte: 'prive' });
  const koppeling = { userId: eigId, clientName: 'Claude', ruimte: 'prive' as const, tokenId: 'tok-test', agent: 'claude' as const };
  const v2Keuze = { kanten: ['gebruiker', 'beheer'] as Array<'gebruiker' | 'beheer'>, sleutels: ['v2_whoami:gebruiker', 'machine_list:beheer'] };
  const zetStand = async (stand: string) => {
    await pool.query(`INSERT INTO app.ruimte_dienst_stand (user_id, dienst, stand, vorige_stand, bevestigd_door)
      VALUES ($1,'ai',$2,'uit','eenheidstest')
      ON CONFLICT (user_id, dienst) DO UPDATE SET stand = EXCLUDED.stand, vorige_stand = 'uit', gewijzigd_op = now(),
        bevroren_op = CASE WHEN EXCLUDED.stand = 'bevroren' THEN now() ELSE NULL END,
        bevroren_oorzaak = CASE WHEN EXCLUDED.stand = 'bevroren' THEN 'rol-weg' ELSE '' END,
        besluit = '', besluit_op = NULL, besluit_door = '', verslag = '{}'::jsonb`, [eigId, stand]);
  };
  /** Het technische apparaat van de eigenaar weer in de lucht (de uitvoerders van punt 8 halen het weg). */
  const zetApparaten = async () => {
    await pool.query(`INSERT INTO app.agents (id, user_id, name, platform, token_hash, ruimte, agent_version)
      VALUES ($1,$2,'tech-pc','linux',$3,'technisch','0.9.0'), ($4,$2,'prive-pc','linux',$5,'prive','0.9.0')
      ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, ruimte = EXCLUDED.ruimte, revoked_at = NULL`,
    [techAgent, eigId, `h-${techAgent}`, priveAgent, `h-${priveAgent}`]);
  };

  try {
    for (const naam of ['0082_ruimte_scheiding.sql', '0087_ruimte_besluit_verslag.sql', '0085_ai_ruimte_lade.sql']) {
      const mig = lees(join('migrations', naam));
      await getPool('migratie').query(mig);
      await getPool('migratie').query(mig);
    }
    check('migratie 0085 draait twee keer zonder fout (idempotent) en zet de indexen voor de laden van de dienst «ai»',
      (await pool.query(`SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='app' AND indexname IN
        ('mcp_oauth_tokens_user_ruimte_idx','mcp_console_tokens_user_ruimte_idx','externe_mcp_verbinding_user_ruimte_idx')`)).rows[0].n === 3);

    // ---------------------------------------------------------------- opstelling: twee apparaten, twee tokens, twee externe MCP's
    await zetApparaten();
    await pool.query(`INSERT INTO app.agents (id, user_id, name, platform, token_hash, ruimte) VALUES ($1,$2,'lid-tech-pc','linux',$3,'technisch')`, [lidAgent, lidId, `h-${lidAgent}`]);
    await pool.query(`INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, ruimte) VALUES ($1,'tech','mrt_',$2,'technisch'), ($1,'prive','mrp_',$3,'prive')`, [eigId, tokenTech, tokenPrive]);
    await pool.query(`INSERT INTO app.externe_mcp_verbinding (user_id, id, naam, adres, ruimte, staat, actief)
      VALUES ($1,$2,'extern-tech','https://mcp.example.test/t','technisch','klaar',true), ($1,$3,'extern-prive','https://mcp.example.test/p','prive','klaar',true)`, [eigId, externTech, externPrive]);

    // Technisch profiel + lopende activering: zo zegt effectieveRuimte 'technisch' (de BASIS waarop de stand nu baas is).
    if (!hadProfiel) await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['eigenaar'],480,'test')`, [eigId, `tech-${randomBytes(6).toString('hex')}`]);
    await pool.query('UPDATE app.tech_profielen SET ingetrokken_op = NULL WHERE user_id=$1', [eigId]);
    const pid = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [eigId])).rows[0].profiel_id);
    await pool.query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'vervangen' WHERE user_id=$1 AND beeindigd_op IS NULL`, [eigId]);
    await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op)
      VALUES ($1,$2,$3,ARRAY['eigenaar'],'eenheidstest ruimte-ai', now() + interval '60 minutes')`, [eigId, pid, tabHash(tE)]);
    await pool.query(`INSERT INTO app.ruimte_keuze (user_id, gekozen, gekozen_door) VALUES ($1,'per_dienst',$1) ON CONFLICT (user_id) DO NOTHING`, [eigId]);

    check('de basis staat: zonder de stand erbij zou effectieveRuimte deze mens «technisch» geven (de derde waarheid was dus zichtbaar)',
      (await effectieveRuimte(eigId)) === 'technisch' && (await effectieveRuimteVeilig(eigId, 'owner', tE)) === 'technisch');

    // ---------------------------------------------------------------- 1. bestaande rijen blijven persoonlijk
    const priveRij = (await pool.query('SELECT user_id, ruimte FROM app.mcp_console_tokens WHERE token_hash=$1', [tokenPrive])).rows[0];
    const techniekLade = { userId: eigId, ruimte: 'technisch' as const };
    const inTechLade = (await pool.query(`SELECT name FROM app.mcp_console_tokens WHERE ${sqlLadeWaar('ruimte', techniekLade, 1)}`, [eigId])).rows.map((r: { name: unknown }) => String(r.name));
    check('1. bestaande verbindingen zijn en blijven PERSOONLIJK: ze staan niet in de technische lade en horen er ook niet bij',
      priveRij.ruimte === 'prive' && inTechLade.includes('tech') && !inTechLade.includes('prive')
      && hoortBij({ ownerUserId: eigId, ruimte: 'prive' }, { userId: eigId, ruimte: 'prive' })
      && !hoortBij({ ownerUserId: eigId, ruimte: 'prive' }, techniekLade),
      inTechLade.join(','));
    check('1b. een rij ZONDER ruimte (van vóór 0042) is persoonlijk — de technische lade pakt haar nooit op',
      !hoortBij({ ownerUserId: eigId }, techniekLade) && hoortBij({ ownerUserId: eigId }, { userId: eigId, ruimte: 'prive' }));

    // ---------------------------------------------------------------- 2. 'uit': geen technisch hulpmiddel, geen technisch apparaat
    await zetStand('uit');
    const uitPoort = await aiPoortNu(eigId);
    const uitLijst = await mc.lijstTools(wieTech());
    const uitV2 = await v2.v2Lijst(koppeling, v2Keuze);
    const uitRoep = await metNamens({ client: 'Claude', ruimte: 'technisch' }, () => mc.roepTool(wieTech(), 'machine_list', {}));
    const uitPriveLijst = await mc.lijstTools(wiePrive());
    check('2. «Вимкнено»: de technische kant bestaat niet meer — de poort zegt prive met de code DIENST_UIT en een uitleg in beide talen',
      uitPoort.ruimte === 'prive' && uitPoort.lade === 'prive' && uitPoort.basis === 'technisch' && uitPoort.code === 'DIENST_UIT'
      && !!uitPoort.uitleg?.uk && !!uitPoort.uitleg?.nl, `${uitPoort.ruimte}/${uitPoort.code}`);
    check('2b. «Вимкнено»: GEEN ENKEL technisch hulpmiddel in tools/list (het oude /mcp én connector v2 laten de _beheer-kant vallen)',
      uitLijst.length === 0 && uitV2.length > 0 && uitV2.every((t) => !t.name.endsWith('_beheer')) && uitV2.some((t) => t.name.endsWith('_gebruiker')),
      `mcp=${uitLijst.length} v2=${uitV2.map((t) => t.name).join(',')}`);
    check('2c. «Вимкнено»: GEEN ENKEL technisch apparaat — de aanroep wordt geweigerd met TECH_PROFILE_OFF, niet stil naar de privéruimte',
      uitRoep.isError === true && /TECH_PROFILE_OFF/.test(String(uitRoep.content[0]?.text)) && namenUit(uitRoep).length === 0);
    check('2d. «Вимкнено»: technischNuGeldig en levendeRuimte zeggen hetzelfde (één waarheid, geen omweg)',
      (await mc.technischNuGeldig(wieTech())) === false && (await mc.technischNuGeldig(wiePrive())) === true
      && (await v2.levendeRuimte(koppeling)) === 'prive');
    check('2e. «Вимкнено» raakt het PERSOONLIJKE niet aan: de privéverbinding houdt haar hulpmiddelen',
      uitPriveLijst.length > 0 && (await pool.query('SELECT revoked_at FROM app.mcp_console_tokens WHERE token_hash=$1', [tokenPrive])).rows[0].revoked_at === null);

    // ---------------------------------------------------------------- 3. 'eigen': eigen apparaten, nooit de persoonlijke
    await zetStand('eigen');
    const eigenPoort = await aiPoortNu(eigId);
    const eigenLijst = await mc.lijstTools(wieTech());
    const eigenV2 = await v2.v2Lijst(koppeling, v2Keuze);
    const eigenRoep = await metNamens({ client: 'Claude', ruimte: 'technisch', lade: eigenPoort.lade }, () => mc.roepTool({ ...wieTech(), lade: eigenPoort.lade }, 'machine_list', {}));
    const eigenNamen = namenUit(eigenRoep);
    check('3. «Окремі дані»: de technische kant bestaat én leest uit de TECHNISCHE lade',
      eigenPoort.ruimte === 'technisch' && eigenPoort.lade === 'technisch' && eigenPoort.stand === 'eigen' && eigenPoort.gedeeld === false && eigenPoort.code === null);
    check('3b. «Окремі дані»: de technische hulpmiddelen zijn terug, ook de _beheer-namen van connector v2',
      eigenLijst.length > 0 && eigenV2.some((t) => t.name.endsWith('_beheer')) && (await mc.technischNuGeldig(wieTech())) === true
      && (await v2.levendeRuimte(koppeling)) === 'technisch');
    check('3c. «Окремі дані»: EIGEN apparaten, en het persoonlijke apparaat van dezelfde mens is hier niet te zien',
      eigenNamen.includes('tech-pc') && !eigenNamen.includes('prive-pc') && !eigenNamen.includes('lid-tech-pc'), eigenNamen.join(','));
    const externTechRij = await (async () => (await pool.query(`SELECT naam FROM app.externe_mcp_verbinding WHERE ${sqlLadeWaar('ruimte', { userId: eigId, ruimte: 'technisch' }, 1)}`, [eigId])).rows.map((r: { naam: unknown }) => String(r.naam)))();
    check('3d. «Окремі дані»: ook de externe MCP-servers van de technische lade staan los van de persoonlijke',
      externTechRij.join(',') === 'extern-tech');

    // ---------------------------------------------------------------- 4. 'gedeeld': de PERSOONLIJKE verbindingen
    await zetStand('gedeeld');
    const deelPoort = await aiPoortNu(eigId);
    const deelRoep = await metNamens({ client: 'Claude', ruimte: 'technisch', lade: deelPoort.lade }, () => mc.roepTool({ ...wieTech(), lade: deelPoort.lade }, 'machine_list', {}));
    const deelNamen = namenUit(deelRoep);
    check('4. «Спільне з особистим»: de gereedschapskist blijft technisch, maar de GEGEVENSLADE is persoonlijk',
      deelPoort.ruimte === 'technisch' && deelPoort.lade === 'prive' && deelPoort.gedeeld === true && (await mc.technischNuGeldig(wieTech())) === true);
    check('4b. «Спільне з особистим»: de technische ruimte gebruikt nu de PERSOONLIJKE apparaten — en nooit die van een ander mens',
      deelNamen.includes('prive-pc') && !deelNamen.includes('tech-pc') && !deelNamen.includes('lid-tech-pc'), deelNamen.join(','));
    check('4c. het filter blijft een EXACTE gelijkheid: nooit kruislings, in welke stand ook',
      apparaatInRuimte({ ruimte: 'technisch' }, 'technisch') && !apparaatInRuimte({ ruimte: 'technisch' }, 'prive')
      && !apparaatInRuimte({ ruimte: 'prive' }, 'technisch') && apparaatInRuimte({}, 'prive'));
    check('4d. BROWSERSLOTEN volgen nooit de lade maar de ruimte: «gedeeld» maakt de zes voorwaarden van het technische slot niet losser',
      /a\.platform === 'browser' \? ruimte : lade/.test(lees('backend/connectors-hulpmiddelen.ts'))
      && /huidigeRuimte\(\) === 'technisch' && \(await aiDienstStand\(userId\)\)\.aan/.test(lees('backend/browser-technisch.ts')));

    // ---------------------------------------------------------------- 5. 'bevroren': alles technische weg, het persoonlijke heel
    await zetStand('bevroren');
    const bevrPoort = await aiPoortNu(eigId);
    const bevrLijst = await mc.lijstTools(wieTech());
    const bevrPriveLijst = await mc.lijstTools(wiePrive());
    check('5. «Заморожено»: geen technische ruimte meer, met de eigen code en uitleg; de privékant werkt onverminderd',
      bevrPoort.ruimte === 'prive' && bevrPoort.code === 'BEVROREN' && !!bevrPoort.uitleg?.uk && bevrLijst.length === 0 && bevrPriveLijst.length > 0,
      `${bevrPoort.ruimte}/${bevrPoort.code}`);
    // Het ONMIDDELLIJKE intrekken zelf doet de kern; hier bewijzen we dat het precies de technische kant raakt.
    await zetStand('eigen');
    await rs.dienstZetten(eigId, 'ai', 'ontkoppel');
    const naLos = await pool.query('SELECT token_hash, revoked_at FROM app.mcp_console_tokens WHERE user_id=$1', [eigId]);
    const techWeg = naLos.rows.find((r: { token_hash: unknown }) => String(r.token_hash) === tokenTech)?.revoked_at;
    const priveHeel = naLos.rows.find((r: { token_hash: unknown }) => String(r.token_hash) === tokenPrive)?.revoked_at;
    const externNaLos = (await pool.query('SELECT naam, actief FROM app.externe_mcp_verbinding WHERE user_id=$1 ORDER BY naam', [eigId])).rows;
    check('5b. losmaken trekt op hetzelfde moment ALLE technische verbindingen in (tokens, apparaten, externe MCP) en laat het persoonlijke staan',
      !!techWeg && !priveHeel
      && externNaLos.find((r: { naam: unknown }) => String(r.naam) === 'extern-tech')?.actief === false
      && externNaLos.find((r: { naam: unknown }) => String(r.naam) === 'extern-prive')?.actief === true
      && (await pool.query('SELECT revoked_at FROM app.agents WHERE id=$1', [techAgent])).rows[0].revoked_at !== null
      && (await pool.query('SELECT revoked_at FROM app.agents WHERE id=$1', [priveAgent])).rows[0].revoked_at === null);
    check('5c. en de mens van wie dit NIET is, merkt er niets van: zijn technische apparaat blijft ongemoeid',
      (await pool.query('SELECT revoked_at FROM app.agents WHERE id=$1', [lidAgent])).rows[0].revoked_at === null);

    // ---------------------------------------------------------------- 6. de extensie: zevende voorwaarde, niet minder dan zes
    await zetStand('uit');
    const rechtUit = await extensieRecht({ id: eigId, email: 'x@y.z', role: 'owner' }, tE);
    await zetStand('eigen');
    const rechtEigen = await extensieRecht({ id: eigId, email: 'x@y.z', role: 'owner' }, tE);
    check('6. extensie: bij «Вимкнено» is er geen technisch slot te ontgrendelen, met een eigen uitlegbare code',
      rechtUit.mag === false && rechtUit.code === 'RUIMTE_DIENST_UIT' && isWeigercode('RUIMTE_DIENST_UIT')
      && !!WEIGER_UITLEG.RUIMTE_DIENST_UIT.uk && !!WEIGER_UITLEG.RUIMTE_DIENST_UIT.nl, String(rechtUit.code));
    check('6b. extensie: bij «Окремі дані» staat de poort weer open voor de zes bestaande voorwaarden (ze zijn niet losser geworden)',
      rechtEigen.code !== 'RUIMTE_DIENST_UIT'
      && /if \(!beleid\.technischAan\) return leeg\('BELEID_UIT'/.test(lees('backend/extensie-ontgrendeling.ts'))
      && /if \(!activatie\) return leeg\('TECH_NIET_ACTIEF'/.test(lees('backend/extensie-ontgrendeling.ts'))
      && /if \(!caps\.length\) return leeg\('GEEN_BROWSER_RECHTEN'/.test(lees('backend/extensie-ontgrendeling.ts'))
      && /if \(!passkeys\) return leeg\('GEEN_PASSKEY'/.test(lees('backend/extensie-ontgrendeling.ts')), String(rechtEigen.code));
    check('6c. extensie: ook elke lopende ontgrendeling wordt bij elke opdracht opnieuw aan de stand getoetst (geen venster)',
      /EXTENSIE_RUIMTE[\s\S]{0,400}AI connections/.test(lees('backend/extensie-ontgrendeling.ts'))
      && /ruimte === 'technisch' && !\(await aiDienstStand\(userId\)/.test(lees('backend/extensie-ontgrendeling.ts')));

    // ---------------------------------------------------------------- 7. niemand gaat eromheen
    const poortBron = lees('backend/ai-ruimte-poort.ts');
    check('7. de connector rekent nergens meer zelf: levendeRuimte en technischNuGeldig lopen allebei via aiPoortNu',
      /levendeRuimte = async \(who: Koppeling\): Promise<AiRuimte> => \(await aiPoortNu\(who\.userId(?:,\s*\{[^}]*\})?\)\)\.ruimte/.test(lees('backend/connector-v2.ts'))
      && !/effectieveRuimteVeilig/.test(lees('backend/connector-v2.ts'))
      && /return \(await aiPoortNu\(who\.userId(?:,\s*\{[^}]*\})?\)\)\.ruimte === 'technisch'/.test(lees('backend/mcp-connector.ts'))
      && !/effectieveRuimteVeilig/.test(lees('backend/mcp-connector.ts')));
    check('7b. de apparaten en de externe MCP-servers volgen de LADE, en die komt alleen uit aiPoortNu',
      /huidigeLade\(\)/.test(lees('backend/connectors-hulpmiddelen.ts'))
      && /actieveTools\(userId, huidigeLade\(\)\)/.test(lees('backend/connectors-hulpmiddelen.ts'))
      && /viaSleutel\(userId, ontleed\.sleutel, huidigeLade\(\)\)/.test(lees('backend/connectors-hulpmiddelen.ts'))
      && /who\.lade \?\? who\.ruimte/.test(lees('backend/mcp-connector.ts')));
    check('7c. aiPoortNu vraagt het antwoord aan de KERN (gegevensLade), dus de weigering staat ook in het logboek',
      /gegevensLade\(\{ userId[\s\S]{0,200}dienst: 'ai' \}\)/.test(poortBron)
      && /import \{ gegevensLade, gegevensRuimteVeilig, standVan \} from '\.\/ruimte-scheiding'/.test(poortBron));
    const geweigerd = (await pool.query(`SELECT count(*)::int AS n FROM app.audit WHERE owner_id=$1 AND action='owner.ruimte.geweigerd'`, [eigId])).rows[0].n;
    check('7d. elke weigering van deze dienst is ook echt gelogd (owner.ruimte.geweigerd), niet alleen stil geweigerd', geweigerd > 0, String(geweigerd));
    check('7e. tools/call controleert de stand OP HET MOMENT VAN DE AANROEP, ook als tools/list het hulpmiddel net nog toonde',
      /if \(!\(await technischNuGeldig\(who\)\)\) \{/.test(lees('backend/mcp-connector.ts'))
      && /const lade = await ladeVan\(who\);/.test(lees('backend/mcp-connector.ts')));
    check('7f. de keuze BIJ HET KOPPELEN loopt door dezelfde poort: apparaat, oude /mcp-grant en externe MCP-server',
      /aiVerbindingRuimte\(auth\.user, body\)/.test(lees('backend/connectors-routes.ts'))
      && /aiVerbindingRuimte\(auth\.user, body\)/.test(lees('backend/mcp-connector-routes.ts'))
      && /aiVerbindingRuimte\(gebruiker\.user/.test(lees('backend/mcp-klant-routes.ts'))
      && !/ruimte: ruimteOf\(body\.ruimte\), authWijze/.test(lees('backend/mcp-klant-routes.ts')));

    // de poort bij het koppelen, echt uitgevoerd
    // isEigenaar() eist ook dat het e-mailadres het OWNER_EMAIL van deze server is (backend/tech-profiel.ts).
    const eig = { id: eigId, email: String(process.env.OWNER_EMAIL || bestaand?.email || `eig-${sfx}@eenheid.test`), role: 'owner' };
    await zetStand('eigen');
    const koppelEigen = await aiVerbindingRuimte(eig, { ruimte: 'technisch', tabContext: tE });
    await zetStand('gedeeld');
    const koppelGedeeld = await aiVerbindingRuimte(eig, { ruimte: 'technisch', tabContext: tE });
    await zetStand('uit');
    const koppelUit = await aiVerbindingRuimte(eig, { ruimte: 'technisch', tabContext: tE });
    await zetStand('bevroren');
    const koppelBevroren = await aiVerbindingRuimte(eig, { ruimte: 'technisch', tabContext: tE });
    const koppelPrive = await aiVerbindingRuimte(eig, { ruimte: 'prive', tabContext: tE });
    check('7g. koppelen in de technische ruimte kan alleen met een EIGEN technische lade; de privéruimte blijft altijd open',
      'ruimte' in koppelEigen && koppelEigen.ruimte === 'technisch'
      && 'fout' in koppelGedeeld && koppelGedeeld.fout === 'RUIMTE_DIENST_GEDEELD'
      && 'fout' in koppelUit && koppelUit.fout === 'RUIMTE_DIENST_UIT'
      && 'fout' in koppelBevroren && koppelBevroren.fout === 'RUIMTE_DIENST_BEVROREN'
      && 'ruimte' in koppelPrive && koppelPrive.ruimte === 'prive',
      JSON.stringify([koppelEigen, koppelGedeeld, koppelUit, koppelBevroren]));
    // Twee plekken gebruiken BEWUST nog de oude poort, en dat staat in de code uitgelegd: de serverdeur (die de eigenaar
    // ook moet kunnen opruimen terwijl «ai» uit staat) en het agenttoken van de MCP-console. Het laatste is geen gat: de
    // ruimte van dat token wordt bij elk gebruik opnieuw aan de stand getoetst, en dat is precies wat punt 2 bewijst.
    check('7g-bis: de twee overgebleven plekken met de oude poort zijn benoemd en onderbouwd, niet vergeten',
      /technischeRuimte` hieronder haar hergebruikt/.test(lees('backend/ai-ruimte-poort.ts'))
      && /backend\/mcp-console\.ts\) gebruikt nog deze functie/.test(lees('backend/ai-ruimte-poort.ts'))
      && /ruimteUitVerzoek/.test(lees('backend/mcp-console.ts')));
    check('7h. elke weigering bij het koppelen draagt een uitleg in beide talen mee (nooit een kaal 403)',
      'uitleg' in koppelUit && !!koppelUit.uitleg?.uk && !!koppelUit.uitleg?.nl && 'uitleg' in koppelBevroren && !!koppelBevroren.uitleg?.nl);
    check('7i. hulpfuncties geven dezelfde waarheid als de poort zelf (geen tweede rekenweg)',
      (await aiStandVeilig(eigId)) === 'bevroren' && (await aiTechnischToegestaan(eigId, tE)) === false
      && (await (async () => { await zetStand('gedeeld'); return aiTechnischToegestaan(eigId, tE); })()) === true);

    // ---------------------------------------------------------------- 8. het besluit van de eigenaar wordt ECHT uitgevoerd
    check('8. de dienst «ai» is aangemeld bij het register van de kern (één uitvoerder, geen dubbele)',
      rs.ladeUitvoerders('ai').length === 1 && rs.ladeUitvoerders('ai')[0].naam === 'ai-verbindingen');

    // 8a. de uitvoerder zelf, op een ANDER mens: dan is te zien dat de rijen echt van eigenaar wisselen.
    const uitvoerder = rs.ladeUitvoerders('ai')[0];
    const lidExtern = randomUUID();
    await pool.query(`INSERT INTO app.externe_mcp_verbinding (user_id, id, naam, adres, ruimte, staat, actief)
      VALUES ($1,$2,'lid-extern-tech','https://mcp.example.test/lt','technisch','klaar',true)`, [lidId, lidExtern]);
    await pool.query(`INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, ruimte) VALUES ($1,'lid-tech','mrl_',$2,'technisch')`, [lidId, `l-${sfx}`]);
    const over = await uitvoerder.overdragen({ vanUserId: lidId, naarUserId: eigId, lade: { userId: lidId, ruimte: 'technisch' } });
    const lidAgentNa = (await pool.query('SELECT user_id, ruimte, browser_enabled FROM app.agents WHERE id=$1', [lidAgent])).rows[0];
    const lidExternNa = (await pool.query('SELECT user_id, ruimte, actief, sleutel_naam FROM app.externe_mcp_verbinding WHERE id=$1', [lidExtern])).rows[0];
    const lidTokenNa = (await pool.query(`SELECT revoked_at FROM app.mcp_console_tokens WHERE user_id=$1 AND token_hash=$2`, [lidId, `l-${sfx}`])).rows[0];
    check('8a. «передати собі» verhuist de apparaten en de externe MCP-servers ECHT naar de servereigenaar, uitgezet en zonder sleutel',
      String(lidAgentNa.user_id) === eigId && lidAgentNa.ruimte === 'prive' && lidAgentNa.browser_enabled === false
      && String(lidExternNa.user_id) === eigId && lidExternNa.ruimte === 'prive' && lidExternNa.actief === false && String(lidExternNa.sleutel_naam) === ''
      && !!lidTokenNa.revoked_at && over.some((r) => r.tabel === 'app.agents' && r.rijen === 1),
      JSON.stringify(over));
    const over2 = await uitvoerder.overdragen({ vanUserId: lidId, naarUserId: eigId, lade: { userId: lidId, ruimte: 'technisch' } });
    check('8b. een tweede keer vindt niets meer en meldt dat eerlijk met rijen 0 (idempotent, nooit een fout)',
      over2.every((r) => r.rijen === 0), JSON.stringify(over2));

    // 8c. verwijderen, via het echte besluit van de eigenaar (register + verslag + logboek).
    await zetApparaten();
    await pool.query(`UPDATE app.agents SET revoked_at = NULL WHERE id = ANY($1::uuid[])`, [[techAgent, priveAgent]]);
    await pool.query(`UPDATE app.mcp_console_tokens SET revoked_at = NULL WHERE user_id=$1`, [eigId]);
    await pool.query(`UPDATE app.externe_mcp_verbinding SET actief = true WHERE user_id=$1`, [eigId]);
    await zetStand('bevroren');
    const besluit = await rs.eigenaarsBesluit({ userId: eigId, dienst: 'ai', besluit: 'verwijderen', eigenaarId: eigId, doorEigenaar: true, stapOpGedaan: true });
    const techAgentWeg = (await pool.query('SELECT 1 FROM app.agents WHERE id=$1', [techAgent])).rows.length === 0;
    const priveAgentHeel = (await pool.query('SELECT 1 FROM app.agents WHERE id=$1', [priveAgent])).rows.length === 1;
    const tokensNa = (await pool.query('SELECT name FROM app.mcp_console_tokens WHERE user_id=$1 ORDER BY name', [eigId])).rows.map((r: { name: unknown }) => String(r.name));
    const externeNa = (await pool.query('SELECT naam FROM app.externe_mcp_verbinding WHERE user_id=$1 AND naam LIKE $2 ORDER BY naam', [eigId, 'extern-%'])).rows.map((r: { naam: unknown }) => String(r.naam));
    check('8c. «видалити» wist de hele TECHNISCHE lade van deze dienst en laat de persoonlijke volledig heel',
      besluit.verslag?.volledig === true && besluit.verslag?.besluit === 'verwijderen' && (besluit.verslag?.rijen ?? 0) > 0
      && techAgentWeg && priveAgentHeel && !tokensNa.includes('tech') && tokensNa.includes('prive')
      && externeNa.join(',') === 'extern-prive',
      `rijen=${besluit.verslag?.rijen} tokens=${tokensNa.join(',')} externe=${externeNa.join(',')}`);
    check('8d. het verslag noemt per tabel wat er gebeurde, staat in de database en in het logboek',
      (besluit.verslag?.regels ?? []).some((r) => r.tabel === 'app.mcp_console_tokens' && r.door === 'ai-verbindingen')
      && (await rs.standenVan(eigId)).find((s) => s.dienst === 'ai')?.verslag?.besluit === 'verwijderen'
      && (await pool.query(`SELECT details FROM app.audit WHERE owner_id=$1 AND action='owner.ruimte.besluit' ORDER BY id DESC LIMIT 1`, [eigId])).rows[0]?.details?.verslag?.besluit === 'verwijderen');
    check('8e. hetzelfde besluit nog een keer doet NIETS meer (de dienst is niet meer bevroren): een herhaling is onschadelijk',
      (await codeVan(rs.eigenaarsBesluit({ userId: eigId, dienst: 'ai', besluit: 'verwijderen', eigenaarId: eigId, doorEigenaar: true, stapOpGedaan: true }))) === 'NIET_BEVROREN');
    const naVerwijderen = await aiPoortNu(eigId);
    check('8f. na «видалити» staat de dienst uit en is er dus ook geen technisch hulpmiddel meer',
      naVerwijderen.ruimte === 'prive' && naVerwijderen.code === 'DIENST_UIT' && (await mc.lijstTools(wieTech())).length === 0);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    const alle = [eigId, lidId];
    await pool.query('DELETE FROM app.extensie_ontgrendelingen WHERE user_id = ANY($1)', [alle]).catch(() => undefined);
    await pool.query('DELETE FROM app.agent_commands WHERE user_id = ANY($1)', [alle]).catch(() => undefined);
    await pool.query('DELETE FROM app.ai_grants WHERE user_id = ANY($1)', [alle]).catch(() => undefined);
    await pool.query('DELETE FROM app.agents WHERE id = ANY($1::uuid[])', [[techAgent, priveAgent, lidAgent]]).catch(() => undefined);
    await pool.query('DELETE FROM app.mcp_console_tokens WHERE user_id = ANY($1)', [alle]).catch(() => undefined);
    await pool.query('DELETE FROM app.externe_mcp_hulpmiddel WHERE user_id = ANY($1)', [alle]).catch(() => undefined);
    await pool.query('DELETE FROM app.externe_mcp_verbinding WHERE user_id = ANY($1)', [alle]).catch(() => undefined);
    await pool.query(`DELETE FROM app.ruimte_dienst_stand WHERE user_id = ANY($1)`, [alle]).catch(() => undefined);
    if (!hadKeuze) await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id=$1', [eigId]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [alle]).catch(() => undefined);
    if (!hadProfiel) await pool.query('DELETE FROM app.tech_profielen WHERE user_id=$1', [eigId]).catch(() => undefined);
    await pool.query(`UPDATE app.records SET data = data || jsonb_build_object('role','owner','status',$2::text) WHERE tbl='users' AND id=$1`, [eigId, eigStatus]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [bestaand ? [lidId] : [eigId, lidId]]).catch(() => undefined);
  }
  return einde();
}
