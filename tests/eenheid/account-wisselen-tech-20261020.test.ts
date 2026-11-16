// KLACHT 2 VAN DE EIGENAAR (20.10.2026):
//   «Треба додати можливість перепідключатися між акаунтами швидко, без натискання "вийти з технічного".»
//
// WAT ER WAS. Wisselen tussen onthouden accounts in hetzelfde tabblad bestond al
// (POST /api/owner/session/replace-tab-remembered), en die route beëindigde de technische activering van het VORIGE account
// (R-05 van de audit van 19.10). Maar het accountmenu gooide zichzelf daarna dicht: de mens werd stil in een ander profiel
// gezet en moest zelf raden waar zij uitkwam. Wie in een technisch profiel zat, dacht daarom dat zij eerst «Вийти з
// технічного» moest indrukken.
//
// WAT HIER BEWEZEN WORDT
//   1. SNEL WISSELEN ZONDER EERST HET TECHNISCHE PROFIEL TE VERLATEN: de accountlijst in het menu staat er altijd, ook met
//      een actieve activering, en kiezen roept rechtstreeks de wisselroute aan — geen «beëindig eerst»-stap;
//   2. HET TECHNISCHE PROFIEL GAAT NIET MEE. Dit is de veiligheidsgrens en zij wordt op de server afgedwongen, niet in het
//      scherm: de activering hangt aan (mens, tabblad); na de wissel heeft het NIEUWE account in dat tabblad niets, ook als
//      het zelf een geldig technisch profiel heeft — en de gegevenspoort geeft dan de PERSOONLIJKE lade;
//   3. DE MENS ZIET WAAR ZIJ IS: het menu blijft open en zegt het account én het profiel, en dat de activering van het
//      vorige account is beëindigd. Geen stille overgang;
//   4. MET RECHT: één knop zet het technische profiel voor het nieuwe account aan (met de gewone bevestiging);
//   5. ZONDER RECHT: een eerlijke regel, geen knop die zou falen — en de server weigert het ook echt.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import * as tp from '../../backend/tech-profiel';
import * as rs from '../../backend/ruimte-scheiding';
import { checker } from './hulp/nep-google';
import { nepBrowser } from './hulp/nep-browser';

const W = process.cwd();
const bron = (p: string) => readFileSync(join(W, p), 'utf8');
const tab = () => randomBytes(24).toString('hex');

export async function main(): Promise<number> {
  const { check, einde } = checker('account-wisselen-tech-20261020');
  // De paginamodules lezen hun runtime uit `window` bij het importeren: eerst de nepbrowser, dan importeren.
  nepBrowser('https://hub.tarasevych.com');
  const { accountWisselMelding } = await import('../../src/CanoniekAccountMenu');

  // ================================================================ 3/4/5 — wat het menu zegt (pure regels, beide talen)
  {
    const na = (over: Partial<Parameters<typeof accountWisselMelding>[1]> = {}) =>
      accountWisselMelding('uk', { techBeeindigd: false, heeftTechProfiel: false, techActief: false, techGeladen: true, ...over });
    const naNl = (over: Partial<Parameters<typeof accountWisselMelding>[1]> = {}) =>
      accountWisselMelding('nl', { techBeeindigd: false, heeftTechProfiel: false, techActief: false, techGeladen: true, ...over });

    const gewoon = na();
    check('3. na een wissel staat er altijd in welk profiel de mens is, en dat is het GEBRUIKERSprofiel',
      gewoon.profielId === 'gebruiker' && !!gewoon.kop && gewoon.profiel.includes('користувацький'), gewoon.profiel);
    check('3. en dat het technische profiel niet meegaat wordt met zoveel woorden gezegd, in beide talen',
      /не переноситься/.test(gewoon.uitleg) && /niet mee/.test(naNl().uitleg), `${gewoon.uitleg} || ${naNl().uitleg}`);
    const beeindigd = na({ techBeeindigd: true });
    check('3. werd de activering van het VORIGE account beëindigd, dan staat dat er ook — nooit stil',
      /завершено/.test(beeindigd.uitleg) && /не переноситься/.test(beeindigd.uitleg)
      && /beeindigd/.test(naNl({ techBeeindigd: true }).uitleg), beeindigd.uitleg);

    const metRecht = na({ heeftTechProfiel: true });
    check('4. met een eigen technisch profiel: precies ÉÉN actie om het aan te zetten, en geen «geen recht»-regel',
      !!metRecht.actie && metRecht.geenRecht === null && /Увімкнути технічний профіль/.test(metRecht.actie!)
      && !!naNl({ heeftTechProfiel: true }).actie, String(metRecht.actie));
    const zonderRecht = na({ heeftTechProfiel: false });
    check('5. zonder technisch profiel: GEEN knop, maar een eerlijke regel waarom er niets aan te zetten is',
      zonderRecht.actie === null && !!zonderRecht.geenRecht && /не має технічного профілю/.test(zonderRecht.geenRecht!)
      && !!naNl().geenRecht, String(zonderRecht.geenRecht));
    const nogLaden = na({ heeftTechProfiel: false, techGeladen: false });
    check('zolang de status van het technische profiel nog niet binnen is: geen knop EN geen bewering («geen recht» zou kunnen liegen)',
      nogLaden.actie === null && nogLaden.geenRecht === null);
    const alTechnisch = na({ heeftTechProfiel: true, techActief: true });
    check('staat het technische profiel (door een ander tabblad van dit account) tóch al open, dan zegt het menu dat — en biedt het niets aan',
      alTechnisch.profielId === 'technisch' && alTechnisch.actie === null && alTechnisch.geenRecht === null);
    check('alle teksten bestaan in beide talen en zijn niet gelijk aan elkaar (geen vergeten vertaling)',
      ['uk', 'nl'].every((l) => {
        const m = accountWisselMelding(l as 'uk' | 'nl', { techBeeindigd: true, heeftTechProfiel: true, techActief: false, techGeladen: true });
        return !!m.kop && !!m.profiel && !!m.uitleg && !!m.actie;
      })
      && accountWisselMelding('uk', { techBeeindigd: true, heeftTechProfiel: true, techActief: false, techGeladen: true }).kop
       !== accountWisselMelding('nl', { techBeeindigd: true, heeftTechProfiel: true, techActief: false, techGeladen: true }).kop);
  }

  // ================================================================ 1 — snel wisselen, zonder eerst te «вийти з технічного»
  {
    const menu = bron('src/CanoniekAccountMenu.tsx');
    check('1. de accountlijst hangt niet af van het technische profiel: zij staat er ook met een actieve activering',
      !/visibleRows[^;]*techActief/.test(menu) && !/canonical-account-list[^>]*techActief/.test(menu)
      && menu.includes("const visibleRows = displayUser ? model.visibleExpandedAccounts : model.knownAccounts;"));
    check('1. kiezen gaat rechtstreeks naar de wisselroute; er staat geen «beëindig eerst het technische profiel»-stap tussen',
      menu.includes('const uit = await onSelectAccount(item.grantId);') && !/select[\s\S]{0,400}techBeeindigen\(/.test(menu));
    check('3. het menu BLIJFT OPEN na de wissel en onthoudt wat er gebeurde (geen close() meer in select)',
      /const select = async[\s\S]{0,1400}setGewisseld\(\{/.test(menu) && !/const select = async[\s\S]{0,1200}\n      close\(\);/.test(menu));
    check('3. de melding verdwijnt pas als de mens het menu zelf sluit',
      /const close = \(\) => \{[\s\S]{0,160}setGewisseld\(null\);/.test(menu));
    check('4. de knop opent precies het bestaande activeringsvenster (dezelfde bevestiging als altijd, geen tweede weg)',
      menu.includes("data-account-gewisseld-actie='tech-aan'") && menu.includes("openTechVenster('activeren')"));
    for (const pad of ['src/App.tsx', 'src/VerenigdDienstApp.tsx']) {
      const s = bron(pad);
      check(`${pad}: de wissel meldt aan het menu of het technische profiel van het vorige account is beëindigd`,
        s.includes("api.post('/api/owner/session/replace-tab-remembered'") && s.includes('return{techBeeindigd:Number(response.data?.techBeeindigd||0)}'));
    }
    check('de server blijft degene die de activering van het VORIGE account beëindigt (R-05 blijft staan via ownerActivateBrowserAccount)',
      bron('backend/index.ts').includes('techBeeindigenBijUitloggen(vorigeUserId,tab)') && bron('backend/index.ts').includes("techBeeindigenBijIntrekken(vorigeUserId,'uitgelogd',{sessieId:oldAnchor.id})") && bron('backend/index.ts').includes('const activated=await ownerActivateBrowserAccount(anchor.session,user,service,sourceOrigin,tab,grantId,ctx.event,'));
  }

  // ================================================================ 2/5 — de grens zelf, met de echte database
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string, role = 'member') => {
    const id = randomUUID();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status: 'approved' }]);
    return id;
  };
  const A = await mk(`wissel-a-${sfx}@eenheid.test`);
  const B = await mk(`wissel-b-${sfx}@eenheid.test`);
  const C = await mk(`wissel-c-${sfx}@eenheid.test`);
  const tWissel = tab(), tAnder = tab();

  try {
    for (const naam of ['0082_ruimte_scheiding.sql', '0083_mail_contacten_ruimte.sql']) {
      await getPool('migratie').query(readFileSync(join(W, 'migrations', naam), 'utf8'));
    }
    const profielGeven = async (userId: string) => {
      const pid = `tech-${randomBytes(6).toString('hex')}`;
      await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door)
        VALUES ($1,$2,ARRAY['ontwikkelaar'],240,'test') ON CONFLICT (user_id) DO UPDATE SET rollen=EXCLUDED.rollen, ingetrokken_op=NULL`, [userId, pid]);
      return pid;
    };
    const pA = await profielGeven(A), pB = await profielGeven(B);
    const gebruiker = (id: string, email: string) => ({ id, email, role: 'member', status: 'approved' });

    // A heeft het technische profiel open in het tabblad waarin straks gewisseld wordt, EN in een tweede tabblad.
    await tp.activeren(gebruiker(A, `wissel-a-${sfx}@eenheid.test`), tWissel, 30, 'tabblad waarin gewisseld wordt');
    await tp.activeren(gebruiker(A, `wissel-a-${sfx}@eenheid.test`), tAnder, 30, 'ander tabblad van A');
    check('vooraf: A heeft een lopende activering in beide tabbladen, en de gegevenspoort noemt dit tabblad technisch',
      !!(await tp.actieveActivatie(A, tWissel)) && !!(await tp.actieveActivatie(A, tAnder))
      && (await rs.gegevensRuimteVeilig(A, { tabContext: tWissel })) === 'technisch');

    // DE WISSEL, precies zoals de route haar doet: alleen het tabblad waarin gewisseld wordt, alleen voor het vorige account.
    const beeindigd = await tp.beeindigenBijUitloggen(A, tWissel);
    check('1/2. wisselen beëindigt de activering van A in DIT tabblad — en alleen daar; het andere tabblad van A blijft open',
      beeindigd === 1 && !(await tp.actieveActivatie(A, tWissel)) && !!(await tp.actieveActivatie(A, tAnder)), String(beeindigd));

    // B is nu het account van dit tabblad. B heeft een GELDIG technisch profiel, en toch is er niets.
    check('2. het technische profiel gaat NIET mee: B heeft in dit tabblad geen activering, ook met een geldig eigen profiel',
      !(await tp.actieveActivatie(B, tWissel)) && (await rs.technischeRechten(B)).ok === true);
    check('2. en de gegevenspoort geeft B daarom de PERSOONLIJKE lade — geen technische gegevens door een wissel',
      (await rs.gegevensRuimteVeilig(B, { tabContext: tWissel })) === 'prive');
    const ladeB = await rs.gegevensLade({ userId: B, tabContext: tWissel, dienst: 'mail' });
    check('2. de poort van post bevestigt dat: B leest na de wissel uit zijn eigen persoonlijke lade',
      ladeB.ok === true && ladeB.lade.ruimte === 'prive');

    // 4. MET RECHT: één stap, en die stap is de bestaande activering (dezelfde bevestiging, geen nieuwe weg).
    const aB = await tp.activeren(gebruiker(B, `wissel-b-${sfx}@eenheid.test`), tWissel, 30, 'technisch aan na wissel');
    check('4. met recht zet B het technische profiel in ÉÉN stap aan voor dit tabblad — zonder dat A ooit terugkomt',
      !!aB?.id && !!(await tp.actieveActivatie(B, tWissel)) && !(await tp.actieveActivatie(A, tWissel))
      && (await rs.gegevensRuimteVeilig(B, { tabContext: tWissel })) === 'technisch');
    check('4. en dat raakt A niet: het andere tabblad van A houdt zijn eigen activering',
      !!(await tp.actieveActivatie(A, tAnder)));

    // 5. ZONDER RECHT: een eerlijke weigering van de server, geen stille activering.
    const fout = await (async () => { try { await tp.activeren(gebruiker(C, `wissel-c-${sfx}@eenheid.test`), tab(), 30, 'zonder profiel'); return 'OK'; } catch (e) { return (e as { code?: string }).code || (e as Error).message; } })();
    check('5. zonder technisch profiel weigert de server het aanzetten met een eigen code — nooit stil een activering',
      fout !== 'OK' && !(await tp.actieveActivatie(C, tWissel)), fout);
    const ladeC = await rs.gegevensLade({ userId: C, tabContext: tWissel, dienst: 'mail' });
    check('5. en de poort houdt C persoonlijk: een weigering geeft nooit alsnog de technische lade',
      ladeC.ok === true && ladeC.lade.ruimte === 'prive');

    // Het profiel INTREKKEN tijdens een lopende activering: ook dan komt er niets technisch meer, in geen enkel tabblad.
    await pool.query('UPDATE app.tech_profielen SET ingetrokken_op = now() WHERE user_id = $1', [B]);
    check('wordt het technische profiel ingetrokken, dan is de lopende activering van dit tabblad meteen niets meer waard',
      (await rs.gegevensRuimteVeilig(B, { tabContext: tWissel })) === 'prive' && (await rs.technischeRechten(B)).ok === false);
    void pA; void pB;
  } finally {
    for (const id of [A, B, C]) {
      await pool.query('DELETE FROM app.tech_activaties WHERE user_id=$1', [id]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_profielen WHERE user_id=$1', [id]).catch(() => undefined);
      await pool.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id=$1', [id]).catch(() => undefined);
      await pool.query('DELETE FROM app.ruimte_keuze WHERE user_id=$1', [id]).catch(() => undefined);
      await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id=$1`, [id]).catch(() => undefined);
    }
  }

  return einde();
}
