// KLIMOP-016 (21.11.2026): Модульні та інтеграційні випробування Етапу 15 екосистеми «Плющ» —
// Сходинка 3 контрольованого подвійного записування, звірки читання після запису, надгробків видалень і миттєвого повернення (§35, §42–§43 маніфесту):
//   1. Сувора заборона перестрибування сходинок (KLIMOP_STAP2_ACTIEF_VEREIST, KLIMOP_DUBBEL_SCHRIJVEN_PROEF_VEREIST)
//      та програмна заборона самовільного відокремлення чинної бази даних (KLIMOP_LOSKOPPELING_VERBODEN, 403);
//   2. Багатоопераційна перевірка voerGecontroleerdeDubbelSchrijfProefUit для всіх 11 служб на кворумі 3 незалежних вузлів NL/CH/UA
//      (створення zet, конкурентне оновлення за HLC, видалення verwijder, відновлення RS 4+2 та цілісність ланцюжка квитанцій SHA-256);
//   3. Вмикання Сходинки 3 та миттєве автоматичне скидання обох режимів (leesModus і schrijfModus) до alleen_erfenis_postgres
//      при кожному з 4 видів збоїв (tweede_schrijf_mislukt, lees_inhoud_afwijking, verwijder_tombstone_gemist, machtigingen_afwijking);
//   4. Аварійне повернення всіх 11 служб, інваріант schakelaars.json і виявлення підробки 1 байта в dubbel-schrijven-kluis.jsonl;
//   5. Захищені маршрути власника /api/owner/klimop/{dubbel-schrijven,dubbel-logboek,overdracht-schakelaar}, усі 7 технічних
//      інструментів MCP для 14 агентів, двомовна вебпанель KlimopPaneel.tsx, статті Етапів 1–15, досьє та Абсолютний мовний закон.
// Запуск: node scripts/eenheidstests.mjs klimop-016-dubbel-schrijven-terugval-20261121.test.ts

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { nepBrowser } from './hulp/nep-browser';
import { taalFouten } from './hulp/taalcontrole';
import {
  KLIMOP_CONTROLE_VRAGEN_IDS,
  beoordeelKlimopWijziging,
  type KlimopControleVraagId,
} from '../../shared/klimop/kern';
import { KLIMOP_ELF_DIENSTEN } from '../../shared/klimop/diensten';
import {
  HELP_KLIMOP,
  KLIMOP_CODES,
  KLIMOP_DUBBEL_SCHRIJFMODUS_TEKST,
  KLIMOP_LEESMODUS_TEKST,
  KLIMOP_PADEN,
  KLIMOP_TOOL_NAMEN,
} from '../../shared/klimop-overzicht-model';
import {
  KLIMOP_GENESIS_KETEN_SHA256,
  leesKlimopDubbelSchrijvenLogboek,
  leesKlimopSpiegelLogboek,
  schakelKlimopDienstOverdracht,
  verifieerDubbelKwitantieKeten,
  voerGecontroleerdeDubbelSchrijfProefUit,
  voerPassieveSpiegelLeesProefUit,
} from '../../backend/klimop-overdracht-opslag';
import { klimopOverzicht } from '../../backend/klimop-platform-brug';
import { klimopPaden } from '../../backend/klimop-paden';
import { KLIMOP_TOOLS, klimopToolNamenGelijk } from '../../backend/klimop-hulpmiddeldefinities';
import {
  _klimopMcpLimietenLeeg,
  isKlimopTool,
  voerKlimopToolUit,
} from '../../backend/klimop-hulpmiddelen';
import { BEHEER_TOOL_NAMEN } from '../../backend/ai-beheer-hulpmiddeldefinities';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';
import { V2_AGENTEN } from '../../shared/connector-v2/agenten';
import { MAX_NAAM, ontleed, toolNaam } from '../../shared/connector-v2/namen';
import { hulpmiddelTekst, isTweetalig } from '../../shared/hulpmiddel-teksten';
import { toolRuimte } from '../../shared/ai-ruimte';
import { TOOL_CAPABILITY } from '../../shared/ai-beleid/catalogus';
import { actieSoort, actieZin } from '../../shared/mcp-acties';
import { hulpGebreken, hulpVan } from '../../shared/hulp-register';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const lees = (pad: string) => readFileSync(pad, 'utf8');
type Tr = (uk: string, nl: string) => string;
const UK: Tr = (uk) => uk;
const NL: Tr = (_uk, nl) => nl;

function vangFout(fn: () => unknown): { code: string; status: number } {
  try {
    fn();
    return { code: '', status: 200 };
  } catch (e) {
    const err = e as { code?: string; status?: number };
    return { code: String(err.code ?? ''), status: Number(err.status ?? 0) };
  }
}

export async function main(): Promise<number> {
  const { check, einde } = checker(
    'KLIMOP-016 · Етап 15: Сходинка 3 контрольованого подвійного записування, звірка читання та повернення 11 служб',
  );

  const staatMap = mkdtempSync(join(tmpdir(), 'klimop-016-staat-'));
  try {
    // ------------------------------------------------------------------ 1. Заборона перестрибування сходинок та самовільного відокремлення чинної бази
    const beginDubbel = leesKlimopDubbelSchrijvenLogboek({ staatMap });
    const zonderStap2 = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'activeer_dubbel_schrijven', dienstId: 'postvak' },
        { staatMap },
      ),
    );

    // Активуємо Сходинку 2 для postvak, але ще БЕЗ проби Сходинки 3
    voerPassieveSpiegelLeesProefUit({ dienstId: 'postvak', steekproefGrootte: 4 }, { staatMap });
    schakelKlimopDienstOverdracht(
      { actie: 'activeer_passief_lezen', dienstId: 'postvak' },
      { staatMap },
    );
    const zonderDubbelProef = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'activeer_dubbel_schrijven', dienstId: 'postvak' },
        { staatMap },
      ),
    );

    // Спроби самовільного відокремлення чинної бази даних (§35, §43 п. 11)
    const loskoppel1 = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'ontkoppel_erfenis_postgres', dienstId: 'postvak' },
        { staatMap },
      ),
    );
    const loskoppel2 = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'volledig_onafhankelijk', dienstId: 'postvak' },
        { staatMap },
      ),
    );
    const loskoppel3 = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'terug_naar_erfenis', dienstId: 'postvak', ontkoppelErfenisDatabank: true },
        { staatMap },
      ),
    );

    // Перевірка відхилення невалідних параметрів проби Сходинки 3
    const teWeinigOperaties = vangFout(() =>
      voerGecontroleerdeDubbelSchrijfProefUit({ dienstId: 'postvak', operatiesAantal: 2 }, { staatMap }),
    );
    const teVeelOperaties = vangFout(() =>
      voerGecontroleerdeDubbelSchrijfProefUit({ dienstId: 'postvak', operatiesAantal: 13 }, { staatMap }),
    );
    const ongeldigeSimFout = vangFout(() =>
      voerGecontroleerdeDubbelSchrijfProefUit({ dienstId: 'postvak', simuleerFout: 'onbekend' }, { staatMap }),
    );

    check(
      'Сходинка 3 забороняє перестрибування сходинок (KLIMOP_STAP2_ACTIEF_VEREIST, KLIMOP_DUBBEL_SCHRIJVEN_PROEF_VEREIST), валідує вхідні межі й блокує самовільне відокремлення бази (403)',
      beginDubbel.ketenIntegriteit.ok === true
      && beginDubbel.ketenIntegriteit.laatsteSha256 === KLIMOP_GENESIS_KETEN_SHA256
      && beginDubbel.schakelaars.length === 11
      && beginDubbel.schakelaars.every(
        (s) =>
          s.leesModus === 'alleen_erfenis_postgres'
          && s.schrijfModus === 'alleen_erfenis_postgres'
          && s.primaireSchrijfBron === 'erfenis_postgres',
      )
      && zonderStap2.code === 'KLIMOP_STAP2_ACTIEF_VEREIST'
      && zonderStap2.status === 409
      && zonderDubbelProef.code === 'KLIMOP_DUBBEL_SCHRIJVEN_PROEF_VEREIST'
      && zonderDubbelProef.status === 409
      && loskoppel1.code === 'KLIMOP_LOSKOPPELING_VERBODEN'
      && loskoppel1.status === 403
      && loskoppel2.code === 'KLIMOP_LOSKOPPELING_VERBODEN'
      && loskoppel2.status === 403
      && loskoppel3.code === 'KLIMOP_LOSKOPPELING_VERBODEN'
      && loskoppel3.status === 403
      && teWeinigOperaties.code === 'KLIMOP_INVOER_ONGELDIG'
      && teVeelOperaties.code === 'KLIMOP_INVOER_ONGELDIG'
      && ongeldigeSimFout.code === 'KLIMOP_INVOER_ONGELDIG',
    );

    // ------------------------------------------------------------------ 2. Контрольоване подвійне записування для всіх 11 служб і кворум NL/CH/UA
    const alleElfDubbel = KLIMOP_ELF_DIENSTEN.map((dienstId) =>
      voerGecontroleerdeDubbelSchrijfProefUit(
        { dienstId, operatiesAantal: dienstId === 'werkblad' ? 3 : 5 },
        { staatMap },
      ),
    );
    const naElfDubbelLog = leesKlimopDubbelSchrijvenLogboek({ staatMap, limiet: 20 });

    check(
      'voerGecontroleerdeDubbelSchrijfProefUit перевіряє всі 11 служб на кворумі NL/CH/UA (zet + оновлення HLC + verwijder + RS 4+2) і будує цілісний ланцюжок із 11 квитанцій SHA-256',
      alleElfDubbel.every(
        (u) =>
          u.ok === true
          && u.knooppunten.regios.join(',') === 'NL,CH,UA'
          && u.knooppunten.onafhankelijkQuorumOk === true
          && u.tweedeSchrijfGeslaagd === true
          && u.leesNaSchrijfGelijk === true
          && u.tombstoneBevestigd === true
          && u.reedSolomonAlleActieveHersteld === true
          && u.crdtSamenvoegingOk === true
          && u.kruisDienstIsolatieAfgedwongen === true
          && u.pariteit.volledigGelijk === true
          && u.pariteit.afwijkingen === 0
          && u.overdrachtBesluit.toegestaan === true
          && u.overdrachtBesluit.gevalideerdeProefModus === 'klimop_primair_met_erfenis_terugval'
          && u.productieDatabankGewijzigd === false
          && u.kwitantieRegel.bevatGeheimenOfInhoud === false,
      )
      && naElfDubbelLog.ketenIntegriteit.ok === true
      && naElfDubbelLog.ketenIntegriteit.gecontroleerdeKwitanties === 11
      && naElfDubbelLog.samenvatting.totaalKwitanties === 11,
    );

    // ------------------------------------------------------------------ 3. Вмикання Сходинки 3 та миттєве автоповернення при кожному з 4 видів збою
    const vierDiensten = ['postvak', 'wolkopslag', 'agenda', 'slimwoon'] as const;
    for (const d of vierDiensten) {
      if (d !== 'postvak') {
        voerPassieveSpiegelLeesProefUit({ dienstId: d, steekproefGrootte: 3 }, { staatMap });
        schakelKlimopDienstOverdracht({ actie: 'activeer_passief_lezen', dienstId: d }, { staatMap });
      }
      schakelKlimopDienstOverdracht({ actie: 'activeer_dubbel_schrijven', dienstId: d }, { staatMap });
    }

    const ovMetVierDubbel = klimopOverzicht(process.cwd(), staatMap);

    const foutTweedeSchrijf = voerGecontroleerdeDubbelSchrijfProefUit(
      { dienstId: 'postvak', operatiesAantal: 4, simuleerFout: 'tweede_schrijf_mislukt' },
      { staatMap },
    );
    const foutLeesInhoud = voerGecontroleerdeDubbelSchrijfProefUit(
      { dienstId: 'wolkopslag', operatiesAantal: 4, simuleerFout: 'lees_inhoud_afwijking' },
      { staatMap },
    );
    const foutTombstone = voerGecontroleerdeDubbelSchrijfProefUit(
      { dienstId: 'agenda', operatiesAantal: 4, simuleerFout: 'verwijder_tombstone_gemist' },
      { staatMap },
    );
    const foutMachtigingen = voerGecontroleerdeDubbelSchrijfProefUit(
      { dienstId: 'slimwoon', operatiesAantal: 4, simuleerFout: 'machtigingen_afwijking' },
      { staatMap },
    );

    // Після автоповернення до alleen_erfenis_postgres не можна перестрибнути назад у Сходинку 3!
    const herinschakelNaFout = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'activeer_dubbel_schrijven', dienstId: 'postvak' },
        { staatMap },
      ),
    );

    const alleVierFouten = [foutTweedeSchrijf, foutLeesInhoud, foutTombstone, foutMachtigingen];

    check(
      'кожен із 4 збоїв Сходинки 3 (другий запис, розбіжність читання, пропуск надгробка видалення, права) миттєво скидає обидва режими на alleen_erfenis_postgres без витоку ключів у квитанції',
      ovMetVierDubbel.overdrachtStaat?.actievePassiefLezenDiensten === 4
      && ovMetVierDubbel.overdrachtStaat?.actieveDubbelSchrijvenDiensten === 4
      && foutTweedeSchrijf.tweedeSchrijfGeslaagd === false
      && foutLeesInhoud.pariteit.inhoudAfwijkingAantal === 1
      && foutTombstone.tombstoneBevestigd === false
      && foutMachtigingen.pariteit.machtigingenAfwijkingAantal === 1
      && alleVierFouten.every(
        (f) =>
          f.ok === false
          && f.automatischTeruggezetNaarErfenis === true
          && f.schakelaar.leesModus === 'alleen_erfenis_postgres'
          && f.schakelaar.schrijfModus === 'alleen_erfenis_postgres'
          && f.schakelaar.primaireSchrijfBron === 'erfenis_postgres'
          && f.schakelaar.automatischeTerugschakelingen === 1
          && f.kwitantieRegel.automatischTeruggezet === true
          && f.logboekRegel.soort === 'automatische_terugschakeling'
          && !JSON.stringify(f.kwitantieRegel).includes('_rec_1')
          && !JSON.stringify(f.kwitantieRegel).includes('_te_wissen')
          && !JSON.stringify(f.logboekRegel).includes('_rec_1')
          && !JSON.stringify(f.logboekRegel).includes('_te_wissen'),
      )
      && /^[0-9a-f]{16}$/.test(foutLeesInhoud.kwitantieRegel.afwijkingSleutelHashes.inhoud[0])
      && /^[0-9a-f]{16}$/.test(foutMachtigingen.kwitantieRegel.afwijkingSleutelHashes.machtigingen[0])
      && herinschakelNaFout.code === 'KLIMOP_STAP2_ACTIEF_VEREIST',
      JSON.stringify({
        ov: ovMetVierDubbel.overdrachtStaat,
        f1: { ok: foutTweedeSchrijf.ok, auto: foutTweedeSchrijf.automatischTeruggezetNaarErfenis, autoN: foutTweedeSchrijf.schakelaar.automatischeTerugschakelingen },
        f2: { inhoud: foutLeesInhoud.pariteit.inhoudAfwijkingAantal },
        f3: { tomb: foutTombstone.tombstoneBevestigd },
        f4: { macht: foutMachtigingen.pariteit.machtigingenAfwijkingAantal },
        her: herinschakelNaFout,
      }),
    );

    // ------------------------------------------------------------------ 4. Аварійне повернення всіх 11 служб, інваріант schakelaars.json і виявлення підробки квитанцій
    voerPassieveSpiegelLeesProefUit({ dienstId: 'identiteit', steekproefGrootte: 3 }, { staatMap });
    schakelKlimopDienstOverdracht(
      { actie: 'activeer_passief_lezen', dienstId: 'identiteit' },
      { staatMap },
    );
    schakelKlimopDienstOverdracht(
      { actie: 'activeer_dubbel_schrijven', dienstId: 'identiteit' },
      { staatMap },
    );
    voerPassieveSpiegelLeesProefUit({ dienstId: 'ai_ruimte', steekproefGrootte: 3 }, { staatMap });
    schakelKlimopDienstOverdracht(
      { actie: 'activeer_passief_lezen', dienstId: 'ai_ruimte' },
      { staatMap },
    );

    const noodTerug = schakelKlimopDienstOverdracht({ actie: 'nood_terug_alle_elf' }, { staatMap });
    const naNoodDubbel = leesKlimopDubbelSchrijvenLogboek({ staatMap });
    const naNoodSpiegel = leesKlimopSpiegelLogboek({ staatMap });

    // Перевіряємо інваріант читання schakelaars.json: якщо на диску вручну зіпсовано комбінацію (schrijfModus активний без leesModus),
    // leesKlimopDubbelSchrijvenLogboek примусово стягує schrijfModus до alleen_erfenis_postgres.
    const schakelPad = join(staatMap, 'schakelaars.json');
    const orgSchakelaars = readFileSync(schakelPad, 'utf8');
    const gemanipuleerd = JSON.parse(orgSchakelaars);
    gemanipuleerd.diensten.identiteit.leesModus = 'alleen_erfenis_postgres';
    gemanipuleerd.diensten.identiteit.schrijfModus = 'gecontroleerd_dubbel_schrijven';
    writeFileSync(schakelPad, JSON.stringify(gemanipuleerd, null, 2), 'utf8');
    const hersteldInvarianteStaat = leesKlimopDubbelSchrijvenLogboek({ staatMap });
    writeFileSync(schakelPad, orgSchakelaars, 'utf8');

    // Перевіряємо підробку 1 байта у dubbel-schrijven-kluis.jsonl
    const chronologisch = naNoodDubbel.recenteKwitanties.slice().reverse();
    const vervalsteRij = [
      { ...chronologisch[0], operatiesAantal: 99 },
      ...chronologisch.slice(1),
    ];
    const ketenVervalstToets = verifieerDubbelKwitantieKeten(vervalsteRij);

    const dubbelPad = join(staatMap, 'dubbel-schrijven-kluis.jsonl');
    const orgDubbelInhoud = readFileSync(dubbelPad, 'utf8');
    writeFileSync(
      dubbelPad,
      orgDubbelInhoud.replace('"operatiesAantal":3', '"operatiesAantal":88'),
      'utf8',
    );

    const opschakelBijGebrokenDubbel = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'activeer_dubbel_schrijven', dienstId: 'identiteit' },
        { staatMap },
      ),
    );
    const terugBijGebrokenDubbel = schakelKlimopDienstOverdracht(
      { actie: 'terug_naar_erfenis', dienstId: 'identiteit' },
      { staatMap },
    );
    writeFileSync(dubbelPad, orgDubbelInhoud, 'utf8');

    check(
      'nood_terug_alle_elf скидає і Сходинку 3, і Сходинку 2, інваріант блокує підроблений schakelaars.json, а підміна 1 байта у квитанціях блокує рух уперед (409) без блокування повернення',
      noodTerug.omgeschakeldeDienstenAantal === 2
      && noodTerug.actievePassiefLezenDiensten === 0
      && noodTerug.actieveDubbelSchrijvenDiensten === 0
      && naNoodDubbel.samenvatting.actieveDubbelSchrijvenDiensten === 0
      && naNoodDubbel.ketenIntegriteit.ok === true
      && naNoodSpiegel.ketenIntegriteit.ok === true
      && hersteldInvarianteStaat.schakelaars.find((s) => s.dienstId === 'identiteit')?.schrijfModus
        === 'alleen_erfenis_postgres'
      && ketenVervalstToets.ok === false
      && ketenVervalstToets.gebrokenBijVolgnummer === 1
      && opschakelBijGebrokenDubbel.code === 'KLIMOP_DUBBEL_LOGBOEK_KETEN_ONGELDIG'
      && opschakelBijGebrokenDubbel.status === 409
      && terugBijGebrokenDubbel.ok === true,
    );

    // ------------------------------------------------------------------ 5. Шлюз маршрутів власника /api/owner/klimop/* для Сходинки 3
    const EIGENAAR = 'eigenaar@klimop.invalid';
    const gebruikers: Record<string, { id: string; role: string; email: string; status: string }> = {
      eigenaar: { id: 'u-eig', role: 'owner', email: EIGENAAR, status: 'approved' },
      lid: { id: 'u-lid', role: 'member', email: 'lid@klimop.invalid', status: 'approved' },
    };
    const auditRegels: Array<{ action: string; result: string; details: Record<string, unknown> }> = [];
    const paden = klimopPaden({
      requireSession: async (event) =>
        event.wie
          ? ({ user: gebruikers[String(event.wie)], service: String(event.service ?? 'mcp') } as never)
          : { errorCode: 'UNAUTHORIZED' },
      isOwnerEmail: (email) => email === EIGENAAR,
      rateLimit: async () => ({ ok: true }),
      audit: async (_e, action, result, details) => {
        auditRegels.push({ action, result, details });
      },
      staatMap,
    });

    const roep = async (pad: string, wie: string | null, body: Record<string, unknown> = {}, service = 'mcp') => {
      const res = (await paden[`POST ${pad}`][0]({
        event: { wie, service, headers: {} },
        body,
      } as never)) as { statusCode: number; body: string };
      const data = JSON.parse(res.body);
      return { status: res.statusCode, data, fout: String(data?.error ?? '') };
    };

    const rGeweigerdLid = await roep(KLIMOP_PADEN.dubbelSchrijven, 'lid', { dienstId: 'ontwikkelmiddelen' });
    const rLoskoppelVerboden = await roep(KLIMOP_PADEN.overdrachtSchakelaar, 'eigenaar', {
      actie: 'ontkoppel_erfenis_postgres',
      dienstId: 'ontwikkelmiddelen',
    });
    const rStap2Proef = await roep(KLIMOP_PADEN.passieveSpiegel, 'eigenaar', {
      dienstId: 'ontwikkelmiddelen',
      steekproefGrootte: 3,
    });
    const rStap2Aan = await roep(KLIMOP_PADEN.overdrachtSchakelaar, 'eigenaar', {
      actie: 'activeer_passief_lezen',
      dienstId: 'ontwikkelmiddelen',
    });
    const rStap3Proef = await roep(KLIMOP_PADEN.dubbelSchrijven, 'eigenaar', {
      dienstId: 'ontwikkelmiddelen',
      operatiesAantal: 4,
    });
    const rStap3Aan = await roep(KLIMOP_PADEN.overdrachtSchakelaar, 'eigenaar', {
      actie: 'activeer_dubbel_schrijven',
      dienstId: 'ontwikkelmiddelen',
    });
    const rDubbelLog = await roep(KLIMOP_PADEN.dubbelLogboek, 'eigenaar', {
      dienstId: 'ontwikkelmiddelen',
      limiet: 5,
    });
    const rTerug = await roep(KLIMOP_PADEN.overdrachtSchakelaar, 'eigenaar', {
      actie: 'terug_naar_erfenis',
      dienstId: 'ontwikkelmiddelen',
    });

    check(
      'маршрути власника dubbel-schrijven, dubbel-logboek і overdracht-schakelaar блокують невласників (403) і спроби відокремлення бази (403), керують Сходинкою 3 та пишуть у журнал аудиту',
      rGeweigerdLid.status === 403
      && rGeweigerdLid.fout === 'OWNER_REQUIRED'
      && rLoskoppelVerboden.status === 403
      && rLoskoppelVerboden.fout === 'KLIMOP_LOSKOPPELING_VERBODEN'
      && rStap2Proef.status === 200
      && rStap2Aan.status === 200
      && rStap3Proef.status === 200
      && rStap3Proef.data.ok === true
      && rStap3Aan.status === 200
      && rStap3Aan.data.schakelaar.schrijfModus === 'gecontroleerd_dubbel_schrijven'
      && rDubbelLog.status === 200
      && rDubbelLog.data.ketenIntegriteit.ok === true
      && rTerug.status === 200
      && rTerug.data.schakelaar.schrijfModus === 'alleen_erfenis_postgres'
      && rTerug.data.schakelaar.leesModus === 'alleen_erfenis_postgres'
      && auditRegels.some((a) => a.action === 'klimop_dubbel_schrijven' && a.result === 'success')
      && auditRegels.some((a) => a.action === 'klimop_overdracht_schakelaar' && a.result === 'success'),
    );

    // ------------------------------------------------------------------ 6. Реєстрація та виконання всіх 7 MCP-інструментів для 14 ШІ-агентів
    const opties = KLIMOP_TOOL_NAMEN.map((n) => V2_OPTIES.find((o) => o.id === n && o.kant === 'beheer'));
    const alleAgentNamen = V2_AGENTEN.flatMap((a) =>
      opties.map((o) => ({ agent: a.slug, naam: toolNaam(o!, a.slug) })),
    );

    _klimopMcpLimietenLeeg();
    const mcpDubbel = await voerKlimopToolUit(
      { userId: 'u-eig', clientName: 'Antigravity', agent: 'antigravity' },
      'klimop_dubbel_schrijven',
      { dienstId: 'verbinders', operatiesAantal: 4 },
      { staatMap },
    );
    const mcpDubbelJson = JSON.parse(mcpDubbel.content[0].text);
    const mcpDubbelLog = await voerKlimopToolUit(
      { userId: 'u-eig', clientName: 'Claude', agent: 'claude' },
      'klimop_dubbel_logboek',
      { dienstId: 'verbinders', limiet: 5 },
      { staatMap },
    );
    const mcpDubbelLogJson = JSON.parse(mcpDubbelLog.content[0].text);
    const mcpVerbodenSchakelaar = await voerKlimopToolUit(
      { userId: 'u-eig', clientName: 'Codex', agent: 'codex' },
      'klimop_overdracht_schakelaar',
      { actie: 'activeer_dubbel_schrijven', dienstId: 'verbinders' },
      { staatMap },
    );

    check(
      'усі 7 інструментів klimop_* мають імена <= 64 знаків для всіх 14 агентів у технічному просторі, а сам перемикач overdracht_schakelaar недоступний через MCP (§34)',
      klimopToolNamenGelijk()
      && KLIMOP_TOOL_NAMEN.length >= 7
      && KLIMOP_TOOL_NAMEN.every((n) => isKlimopTool(n) && BEHEER_TOOL_NAMEN.has(n) && toolRuimte(n) === 'technisch')
      && alleAgentNamen.every(
        (x) => x.naam.length <= MAX_NAAM && /^[a-z0-9_]+$/.test(x.naam) && ontleed(x.naam, x.agent).ok,
      )
      && KLIMOP_TOOL_NAMEN.every(
        (n) =>
          TOOL_CAPABILITY[n] === 'deploy.status'
          && actieSoort(n) === 'uitrol'
          && actieZin(n, undefined, 'uk') !== actieZin(n, undefined, 'nl'),
      )
      && !mcpDubbel.isError
      && mcpDubbelJson.ok === true
      && mcpDubbelJson.tombstoneBevestigd === true
      && !mcpDubbelLog.isError
      && mcpDubbelLogJson.ketenIntegriteit.ok === true
      && mcpVerbodenSchakelaar.isError === true
      && mcpVerbodenSchakelaar.content[0].text.includes('ONBEKEND_KLIMOP_HULPMIDDEL'),
      alleAgentNamen.filter((x) => x.naam.length > MAX_NAAM).map((x) => x.naam).join(', '),
    );
  } finally {
    rmSync(staatMap, { recursive: true, force: true });
  }

  // ------------------------------------------------------------------ 7. Перевірка двомовності всіх нових текстів Сходинки 3, параметрів MCP і підказок
  const registerTaalFouten: string[] = [];
  for (const n of KLIMOP_TOOL_NAMEN) {
    const o = V2_OPTIES.find((x) => x.id === n && x.kant === 'beheer');
    if (!o) registerTaalFouten.push(`${n}: відсутній у V2_OPTIES`);
    else {
      registerTaalFouten.push(
        ...taalFouten(`${o.id} titel`, o.uk[0], o.nl[0]),
        ...taalFouten(`${o.id} uitleg`, o.uk[1], o.nl[1]),
        ...taalFouten(`${o.id} gevolg`, o.uk[2], o.nl[2]),
      );
    }
    const h = hulpmiddelTekst(n, 'beheer');
    if (!h) registerTaalFouten.push(`${n}: відсутній hulpmiddelTekst`);
    else {
      registerTaalFouten.push(
        ...taalFouten(`${n} tekst`, h.titel.uk, h.titel.nl),
        ...taalFouten(`${n} uitleg`, h.uitleg.uk, h.uitleg.nl),
      );
    }
  }
  for (const t of KLIMOP_TOOLS) {
    for (const [naam, prop] of Object.entries(
      (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {},
    )) {
      const d = (prop as { description?: unknown }).description;
      if (!isTweetalig(d)) registerTaalFouten.push(`${t.name}.${naam}: niet tweetalig`);
      else registerTaalFouten.push(...taalFouten(`${t.name}.${naam}`, d.uk, d.nl));
    }
  }
  for (const [c, t] of Object.entries(KLIMOP_CODES)) {
    registerTaalFouten.push(...taalFouten(c, t[0], t[1]));
  }
  for (const [m, t] of Object.entries(KLIMOP_LEESMODUS_TEKST)) {
    registerTaalFouten.push(...taalFouten(`leesmodus.${m}`, t.uk, t.nl));
  }
  for (const [m, t] of Object.entries(KLIMOP_DUBBEL_SCHRIJFMODUS_TEKST)) {
    registerTaalFouten.push(...taalFouten(`dubbelmodus.${m}`, t.uk, t.nl));
  }
  for (const k of Object.keys(HELP_KLIMOP)) {
    registerTaalFouten.push(...hulpGebreken(k, hulpVan(k)));
  }

  check(
    'усі двомовні підписи Сходинки 3, параметри MCP, KLIMOP_CODES, KLIMOP_DUBBEL_SCHRIJFMODUS_TEKST та HELP_KLIMOP проходять taalFouten і hulpGebreken',
    registerTaalFouten.length === 0,
    registerTaalFouten.join(' | '),
  );

  // ------------------------------------------------------------------ 8. Двомовне серверне відмальовування блоку Сходинки 3 у KlimopPaneel.tsx
  nepBrowser('https://mcp.tarasevych.com');
  const { default: KlimopPaneel } = await import('../../src/agenten/KlimopPaneel');
  const htmlUk = renderToStaticMarkup(createElement(KlimopPaneel, { tr: UK, lang: 'uk', ctx: {} }));
  const htmlNl = renderToStaticMarkup(createElement(KlimopPaneel, { tr: NL, lang: 'nl', ctx: {} }));

  check(
    'оновлена панель KlimopPaneel відмальовує керування Сходинкою 3 українською та нідерландською з підказкою klimop.dubbel і без <style>',
    htmlUk.includes('data-klimop-dubbel="1"')
    && htmlUk.includes('data-hulp="klimop.dubbel"')
    && htmlUk.includes('Перевірка подвійного записування Сходинки 3')
    && htmlUk.includes('Увімкнути подвійне записування')
    && !/Dubbelschrijfproef Stap 3|Dubbel schrijven activeren/.test(htmlUk)
    && htmlNl.includes('data-klimop-dubbel="1"')
    && htmlNl.includes('Dubbelschrijfproef Stap 3')
    && htmlNl.includes('Dubbel schrijven activeren')
    && !/Перевірка подвійного записування Сходинки 3|Увімкнути подвійне записування/.test(htmlNl)
    && !/<style[\s>]/.test(htmlUk),
  );

  // ------------------------------------------------------------------ 9. Обов'язкова 15-пунктова архітектурна перевірка (§42)
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
      id,
      {
        voldaan: true,
        bewijs: `Перевірено у KLIMOP-016 (Етап 15 — Сходинка 3 контрольованого подвійного записування, звірки читання та повернення) для ${id}`,
      },
    ]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;

  const oordeelEtappe15 = beoordeelKlimopWijziging({
    naam: 'KLIMOP-016 Етап 15: Сходинка 3 контрольованого подвійного записування, звірки читання та миттєвого повернення',
    fase: 15,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });

  check(
    'Етап 15 проходить обов’язкову 15-пунктову архітектурну перевірку маніфесту без зауважень',
    oordeelEtappe15.goedgekeurd === true && oordeelEtappe15.fouten.length === 0,
  );

  // ------------------------------------------------------------------ 10. Статті Етапів 1–15 без фінансових згадок, синхронізація пар, досьє та мовний закон
  const et15Uk = 'docs/hub/ПЛЮЩ-ЕТАП-15-ПОДВІЙНЕ-ЗАПИСУВАННЯ-ЗВІРКА-ЧИТАННЯ-ТА-ПОВЕРНЕННЯ.uk.md';
  const et15Md = 'docs/hub/ПЛЮЩ-ЕТАП-15-ПОДВІЙНЕ-ЗАПИСУВАННЯ-ЗВІРКА-ЧИТАННЯ-ТА-ПОВЕРНЕННЯ.md';
  const et15Nl = 'docs/hub/KLIMOP-FASE-15-DUBBEL-SCHRIJVEN-LEESVERIFICATIE-EN-TERUGVAL.nl.md';

  const klimopArtikelen = [
    'docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md',
    'docs/hub/KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md',
    'docs/hub/ПЛЮЩ-ЕТАП-10-КЕРОВАНЕ-РОЗШИРЕННЯ-ТА-ОБМІН-РЕСУРСАМИ.uk.md',
    'docs/hub/KLIMOP-FASE-10-BEHEERSTE-UITBREIDING-EN-MIDDELENUITWISSELING.nl.md',
    'docs/hub/ПЛЮЩ-ЕТАП-11-НЕЗАЛЕЖНИЙ-АУДИТ-БЕЗПЕКИ-ТА-МОДЕЛЬ-ЗАГРОЗ.uk.md',
    'docs/hub/KLIMOP-FASE-11-ONAFHANKELIJKE-BEVEILIGINGSAUDIT-EN-DREIGINGSMODEL.nl.md',
    'docs/hub/ПЛЮЩ-ЕТАП-12-НАСІННЯ-СПАДКОЄМНІСТЬ-ТА-ПОСТІЙНИЙ-РОЗВИТОК.uk.md',
    'docs/hub/KLIMOP-FASE-12-ZADEN-OPVOLGING-EN-DUURZAME-ONTWIKKELING.nl.md',
    'docs/hub/ПЛЮЩ-ЕТАП-13-ПЛАТФОРМНА-ІНТЕГРАЦІЯ-ТА-ДЗЕРКАЛЬНА-ЗВІРКА.uk.md',
    'docs/hub/KLIMOP-FASE-13-PLATFORMINTEGRATIE-EN-SPIEGELVERIFICATIE.nl.md',
    'docs/hub/ПЛЮЩ-ЕТАП-14-ПАСИВНЕ-ЧИТАННЯ-ЖУРНАЛ-РОЗБІЖНОСТЕЙ-ТА-ПЕРЕМИКАЧ-ПОВЕРНЕННЯ.uk.md',
    'docs/hub/KLIMOP-FASE-14-PASSIEF-LEZEN-AFWIJKINGSLOGBOEK-EN-TERUGSCHAKELING.nl.md',
    et15Uk,
    et15Nl,
  ];
  const financieelPatroon = /\b(0\s*євро|0\s*euro|грошов\w*\s+витрат|фінансов\w*\s+результат|maandelijkseKostenEuro)\b/i;
  const artikelenMetFinancieel = klimopArtikelen.filter((p) => financieelPatroon.test(lees(p)));

  check(
    'статті Етапів 1–15 не містять згадок про фінансові результати чи грошові суми, а всі дзеркальні пари документації синхронізовані байт-у-байт',
    artikelenMetFinancieel.length === 0
    && [et15Uk, et15Md, et15Nl].every((p) => existsSync(p))
    && lees(et15Uk) === lees(et15Md)
    && lees('.agents/skills/klimop-architectuur/SKILL.md') === lees('.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md')
    && lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md') === lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.md')
    && lees('README.md') === lees('ОГЛЯД-ПРОЄКТУ.uk.md')
    && lees('LEESMIJ.md') === lees('PROJECTOVERZICHT.nl.md')
    && lees('ПЛАН-ПЕРЕНЕСЕННЯ.uk.md') === lees('ПЛАН-ПЕРЕНЕСЕННЯ.md'),
    artikelenMetFinancieel.join(', '),
  );

  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));
  check(
    'досьє ecosysteem-klimop.json фіксує запит №197 для KLIMOP-015, задачу KLIMOP-016 та 34 активні можливості без втрат',
    dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-015' && w.pr === 197)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-016')
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length >= 34
    && dossier.mogelijkheden.every((m: { staat: string }) => m.staat !== 'verloren'),
  );

  const bestandenKlimop016 = [
    'shared/klimop-overzicht-model.ts',
    'backend/klimop-overdracht-opslag.ts',
    'backend/klimop-platform-brug.ts',
    'backend/klimop-paden.ts',
    'backend/klimop-hulpmiddeldefinities.ts',
    'backend/klimop-hulpmiddelen.ts',
    'src/klimop/klimop-klant.ts',
    'src/agenten/KlimopPaneel.tsx',
    et15Uk,
    et15Nl,
    'orchestratie/onderwerpen/ecosysteem-klimop.json',
    '.agents/skills/klimop-architectuur/SKILL.md',
    '.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md',
    '.agents/skills/klimop-architectuur/VAARDIGHEID.nl.md',
    'docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md',
    'docs/INDEX.nl.md',
    'README.md',
    'ОГЛЯД-ПРОЄКТУ.uk.md',
    'LEESMIJ.md',
    'PROJECTOVERZICHT.nl.md',
    'ПЛАН-ПЕРЕНЕСЕННЯ.uk.md',
    'PORTEERPLAN.nl.md',
    'tests/eenheid/klimop-016-dubbel-schrijven-terugval-20261121.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const overtredingen = bestandenKlimop016.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });
  const catalogusKlimopTeksten = KLIMOP_TOOL_NAMEN.flatMap((n) => {
    const o = V2_OPTIES.find((x) => x.id === n && x.kant === 'beheer');
    return [
      ...(o ? [...o.uk, ...o.nl] : []),
      actieZin(n, undefined, 'uk'),
      actieZin(n, undefined, 'nl'),
    ];
  });
  const catalogusOvertredingen = catalogusKlimopTeksten.filter(
    (tekst) => ruTekens.test(tekst) || Boolean(taalwetOvertreding(tekst)),
  );
  check(
    'усі нові та оновлені файли й записи каталогу KLIMOP-016 повністю дотримуються Абсолютного мовного закону',
    overtredingen.length === 0 && catalogusOvertredingen.length === 0,
    [...overtredingen, ...catalogusOvertredingen].join(', '),
  );

  return einde();
}
