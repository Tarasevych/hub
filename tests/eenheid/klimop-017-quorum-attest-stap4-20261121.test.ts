// KLIMOP-017 (21.11.2026): Модульні та інтеграційні випробування Етапу 16 екосистеми «Плющ» —
// Сходинка 4 кворумного атестата готовності під подвійною печаткою FROST (RFC 9591) та Ed25519 + ML-DSA-65 (FIPS 204)
// і порогового допуску власника без самовільного вимкнення живої бази даних (§35, §10, §13, §34, §42–§43 маніфесту):
//   1. Заборона перестрибування сходинок при bevestig_quorum_gereedheid (KLIMOP_STAP2_ACTIEF_VEREIST,
//      KLIMOP_STAP3_ACTIEF_VEREIST, KLIMOP_QUORUM_ATTEST_VEREIST) та блокування вимкнення бази (KLIMOP_LOSKOPPELING_VERBODEN, 403);
//   2. Випуск кворумних атестатів voerStap4QuorumAttestProefUit для всіх 11 служб на між’юрисдикційному кворумі NL/CH/UA
//      через бездилерський DKG (2-з-3), пороговий підпис FROST і постквантовий підпис Ed25519 + ML-DSA-65;
//   3. Підтвердження Сходинки 4 власником та миттєве автоматичне скидання всіх трьох режимів (leesModus, schrijfModus, attestModus)
//      до alleen_erfenis_postgres при кожному з 4 видів криптографічних і мережевих відмов (frost_deel_vervalst із поіменним
//      виявленням учасника 2, hybride_pq_vervalst, onafhankelijkheid_geschonden, keten_kop_afwijking);
//   4. Аварійне повернення всіх 11 служб, інваріант schakelaars.json і трирівневе виявлення підробки атестатів
//      (ATTEST_HASH_ONGELDIG, ATTEST_FROST_HANDTEKENING_ONGELDIG, ATTEST_HYBRIDE_HANDTEKENING_ONGELDIG);
//   5. Захищені маршрути власника /api/owner/klimop/{quorum-attest,quorum-logboek,overdracht-schakelaar}, усі 9 інструментів MCP
//      для 14 ШІ-агентів, двомовна панель KlimopPaneel.tsx, статті Етапів 1–16 без фінансових згадок, досьє та мовний закон.
// Запуск: node scripts/eenheidstests.mjs klimop-017-quorum-attest-stap4-20261121.test.ts

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
  KLIMOP_QUORUM_ATTESTMODUS_TEKST,
  KLIMOP_TOOL_NAMEN,
} from '../../shared/klimop-overzicht-model';
import {
  KLIMOP_GENESIS_KETEN_SHA256,
  berekenQuorumAttestSha256,
  leesKlimopDubbelSchrijvenLogboek,
  leesKlimopQuorumAttestLogboek,
  leesKlimopSpiegelLogboek,
  schakelKlimopDienstOverdracht,
  verifieerQuorumAttestKeten,
  voerGecontroleerdeDubbelSchrijfProefUit,
  voerPassieveSpiegelLeesProefUit,
  voerStap4QuorumAttestProefUit,
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
    'KLIMOP-017 · Етап 16: Сходинка 4 кворумного атестата готовності та порогового допуску власника',
  );

  const staatMap = mkdtempSync(join(tmpdir(), 'klimop-017-staat-'));
  try {
    // ------------------------------------------------------------------ 1. Заборона перестрибування сходинок та самовільного вимкнення живої бази
    const beginQuorum = leesKlimopQuorumAttestLogboek({ staatMap });

    // Без Сходинки 2 -> KLIMOP_STAP2_ACTIEF_VEREIST
    const zonderStap2 = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'bevestig_quorum_gereedheid', dienstId: 'postvak' },
        { staatMap },
      ),
    );

    // Зі Сходинкою 2, але без Сходинки 3 -> KLIMOP_STAP3_ACTIEF_VEREIST
    voerPassieveSpiegelLeesProefUit({ dienstId: 'postvak', steekproefGrootte: 3 }, { staatMap });
    schakelKlimopDienstOverdracht(
      { actie: 'activeer_passief_lezen', dienstId: 'postvak' },
      { staatMap },
    );
    const zonderStap3 = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'bevestig_quorum_gereedheid', dienstId: 'postvak' },
        { staatMap },
      ),
    );

    // Зі Сходинками 2 і 3, але без кворумного атестата Сходинки 4 -> KLIMOP_QUORUM_ATTEST_VEREIST
    voerGecontroleerdeDubbelSchrijfProefUit({ dienstId: 'postvak', operatiesAantal: 4 }, { staatMap });
    schakelKlimopDienstOverdracht(
      { actie: 'activeer_dubbel_schrijven', dienstId: 'postvak' },
      { staatMap },
    );
    const zonderAttest = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'bevestig_quorum_gereedheid', dienstId: 'postvak' },
        { staatMap },
      ),
    );

    // Спроби самовільного вимкнення або відокремлення живої бази даних (§35, §43 п. 11)
    const loskoppel1 = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'schakel_postgres_uit', dienstId: 'postvak' },
        { staatMap },
      ),
    );
    const loskoppel2 = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'ontkoppel_erfenis_postgres', dienstId: 'postvak' },
        { staatMap },
      ),
    );
    const loskoppel3 = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'bevestig_quorum_gereedheid', dienstId: 'postvak', ontkoppelErfenisDatabank: true },
        { staatMap },
      ),
    );

    // Валідація невалідних параметрів проби кворумного атестата
    const onbekendeDienst = vangFout(() =>
      voerStap4QuorumAttestProefUit({ dienstId: 'onbestaand' }, { staatMap }),
    );
    const ongeldigeSimFout = vangFout(() =>
      voerStap4QuorumAttestProefUit({ dienstId: 'postvak', simuleerFout: 'onbekend' }, { staatMap }),
    );
    const ongeldigeMerkle = vangFout(() =>
      voerStap4QuorumAttestProefUit(
        { dienstId: 'postvak', zaadMerkleWortelSha256: 'kort' },
        { staatMap },
      ),
    );

    check(
      'Сходинка 4 забороняє перестрибування сходинок (KLIMOP_STAP2_ACTIEF_VEREIST, KLIMOP_STAP3_ACTIEF_VEREIST, KLIMOP_QUORUM_ATTEST_VEREIST), валідує вхідні поля та блокує вимкнення бази (403)',
      beginQuorum.ketenIntegriteit.ok === true
      && beginQuorum.ketenIntegriteit.laatsteSha256 === KLIMOP_GENESIS_KETEN_SHA256
      && beginQuorum.schakelaars.length === 11
      && beginQuorum.schakelaars.every(
        (s) =>
          s.leesModus === 'alleen_erfenis_postgres'
          && s.schrijfModus === 'alleen_erfenis_postgres'
          && s.attestModus === 'alleen_erfenis_postgres'
          && s.primaireSchrijfBron === 'erfenis_postgres',
      )
      && zonderStap2.code === 'KLIMOP_STAP2_ACTIEF_VEREIST'
      && zonderStap2.status === 409
      && zonderStap3.code === 'KLIMOP_STAP3_ACTIEF_VEREIST'
      && zonderStap3.status === 409
      && zonderAttest.code === 'KLIMOP_QUORUM_ATTEST_VEREIST'
      && zonderAttest.status === 409
      && loskoppel1.code === 'KLIMOP_LOSKOPPELING_VERBODEN'
      && loskoppel1.status === 403
      && loskoppel2.code === 'KLIMOP_LOSKOPPELING_VERBODEN'
      && loskoppel2.status === 403
      && loskoppel3.code === 'KLIMOP_LOSKOPPELING_VERBODEN'
      && loskoppel3.status === 403
      && onbekendeDienst.code === 'ONBEKENDE_KLIMOP_DIENST'
      && ongeldigeSimFout.code === 'KLIMOP_INVOER_ONGELDIG'
      && ongeldigeMerkle.code === 'KLIMOP_INVOER_ONGELDIG',
    );

    // ------------------------------------------------------------------ 2. Кворумний атестат DKG + FROST + Ed25519+ML-DSA-65 для всіх 11 служб
    const zaadWortel = '1234567890abcdef'.repeat(4);
    const alleElfAttesten = KLIMOP_ELF_DIENSTEN.map((dienstId) =>
      voerStap4QuorumAttestProefUit(
        { dienstId, zaadMerkleWortelSha256: zaadWortel },
        { staatMap },
      ),
    );
    const naElfQuorumLog = leesKlimopQuorumAttestLogboek({ staatMap, limiet: 30 });

    check(
      'voerStap4QuorumAttestProefUit запечатує всі 11 служб на кворумі NL/CH/UA (DKG 2-з-3 + FROST RFC 9591 + Ed25519+ML-DSA-65) зі збереженням живої бази та цілісним ланцюжком із 11 атестатів',
      alleElfAttesten.every(
        (u) =>
          u.ok === true
          && u.knooppunten.regios.join(',') === 'NL,CH,UA'
          && u.knooppunten.onafhankelijkQuorumOk === true
          && u.drempelZegel.drempel.k === 2
          && u.drempelZegel.drempel.n === 3
          && u.drempelZegel.frostVerificatieOk === true
          && u.drempelZegel.verdachteDeelnemers.length === 0
          && u.drempelZegel.hybrideAlgoritme === 'ed25519+ml-dsa-65'
          && u.drempelZegel.hybrideVerificatieOk === true
          && u.ketenVerankering.ketensSluitend === true
          && /^[0-9a-f]{64}$/.test(u.ketenVerankering.spiegelKetenKopSha256)
          && /^[0-9a-f]{64}$/.test(u.ketenVerankering.dubbelKetenKopSha256)
          && u.overdrachtBesluit.toegestaan === true
          && u.overdrachtBesluit.huidigeProductieModus === 'alleen_erfenis_postgres'
          && u.overdrachtBesluit.gevalideerdeDoelModus === 'volledig_onafhankelijk_geverifieerd'
          && u.productieDatabankActief === true
          && u.productieDatabankGewijzigd === false
          && u.attestRegel.bevatGeheimenOfInhoud === false
          && u.attestRegel.zaadMerkleWortelSha256 === zaadWortel,
      )
      && naElfQuorumLog.ketenIntegriteit.ok === true
      && naElfQuorumLog.ketenIntegriteit.gecontroleerdeAttesten === 11
      && naElfQuorumLog.samenvatting.totaalAttesten === 11,
    );

    // ------------------------------------------------------------------ 3. Підтвердження Сходинки 4 та каскадне скидання при всіх 4 видах відмов
    const vierDiensten = ['postvak', 'wolkopslag', 'agenda', 'slimwoon'] as const;
    for (const d of vierDiensten) {
      if (d !== 'postvak') {
        voerPassieveSpiegelLeesProefUit({ dienstId: d, steekproefGrootte: 3 }, { staatMap });
        schakelKlimopDienstOverdracht({ actie: 'activeer_passief_lezen', dienstId: d }, { staatMap });
        voerGecontroleerdeDubbelSchrijfProefUit({ dienstId: d, operatiesAantal: 4 }, { staatMap });
        schakelKlimopDienstOverdracht({ actie: 'activeer_dubbel_schrijven', dienstId: d }, { staatMap });
        voerStap4QuorumAttestProefUit({ dienstId: d, zaadMerkleWortelSha256: zaadWortel }, { staatMap });
      }
      schakelKlimopDienstOverdracht({ actie: 'bevestig_quorum_gereedheid', dienstId: d }, { staatMap });
    }

    const ovMetVierQuorum = klimopOverzicht(process.cwd(), staatMap);

    const foutFrostDeel = voerStap4QuorumAttestProefUit(
      { dienstId: 'postvak', simuleerFout: 'frost_deel_vervalst' },
      { staatMap },
    );
    const foutHybridePq = voerStap4QuorumAttestProefUit(
      { dienstId: 'wolkopslag', simuleerFout: 'hybride_pq_vervalst' },
      { staatMap },
    );
    const foutOnafhankelijkheid = voerStap4QuorumAttestProefUit(
      { dienstId: 'agenda', simuleerFout: 'onafhankelijkheid_geschonden' },
      { staatMap },
    );
    const foutKetenKop = voerStap4QuorumAttestProefUit(
      { dienstId: 'slimwoon', simuleerFout: 'keten_kop_afwijking' },
      { staatMap },
    );

    // Після автоскидання зі Сходинки 4 служба опиняється на alleen_erfenis_postgres і не може перестрибнути на Сходинку 4!
    const herbevestigNaFout = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'bevestig_quorum_gereedheid', dienstId: 'postvak' },
        { staatMap },
      ),
    );

    const alleVierAttestFouten = [
      foutFrostDeel,
      foutHybridePq,
      foutOnafhankelijkheid,
      foutKetenKop,
    ];

    check(
      'кожна з 4 криптографічних/кворумних відмов Сходинки 4 поіменно ловить збій (зокрема учасника 2 у FROST) і миттєво скидає Сходинки 2–4 на alleen_erfenis_postgres',
      ovMetVierQuorum.overdrachtStaat?.actievePassiefLezenDiensten === 4
      && ovMetVierQuorum.overdrachtStaat?.actieveDubbelSchrijvenDiensten === 4
      && ovMetVierQuorum.overdrachtStaat?.actieveQuorumGereedDiensten === 4
      && foutFrostDeel.drempelZegel.frostVerificatieOk === false
      && foutFrostDeel.drempelZegel.verdachteDeelnemers.includes(2)
      && foutHybridePq.drempelZegel.hybrideVerificatieOk === false
      && foutOnafhankelijkheid.knooppunten.onafhankelijkQuorumOk === false
      && foutKetenKop.ketenVerankering.ketensSluitend === false
      && alleVierAttestFouten.every(
        (f) =>
          f.ok === false
          && f.automatischTeruggezetNaarErfenis === true
          && f.schakelaar.leesModus === 'alleen_erfenis_postgres'
          && f.schakelaar.schrijfModus === 'alleen_erfenis_postgres'
          && f.schakelaar.attestModus === 'alleen_erfenis_postgres'
          && f.schakelaar.primaireSchrijfBron === 'erfenis_postgres'
          && f.schakelaar.automatischeTerugschakelingen === 1
          && f.attestRegel.automatischTeruggezet === true
          && f.logboekRegel.soort === 'automatische_terugschakeling'
          && f.productieDatabankActief === true
          && f.productieDatabankGewijzigd === false,
      )
      && herbevestigNaFout.code === 'KLIMOP_STAP2_ACTIEF_VEREIST',
    );

    // ------------------------------------------------------------------ 4. Аварійне повернення, інваріант schakelaars.json і трирівнева криптоперевірка ланцюжка
    voerPassieveSpiegelLeesProefUit({ dienstId: 'identiteit', steekproefGrootte: 3 }, { staatMap });
    schakelKlimopDienstOverdracht({ actie: 'activeer_passief_lezen', dienstId: 'identiteit' }, { staatMap });
    voerGecontroleerdeDubbelSchrijfProefUit({ dienstId: 'identiteit', operatiesAantal: 4 }, { staatMap });
    schakelKlimopDienstOverdracht({ actie: 'activeer_dubbel_schrijven', dienstId: 'identiteit' }, { staatMap });
    voerStap4QuorumAttestProefUit({ dienstId: 'identiteit', zaadMerkleWortelSha256: zaadWortel }, { staatMap });
    schakelKlimopDienstOverdracht({ actie: 'bevestig_quorum_gereedheid', dienstId: 'identiteit' }, { staatMap });

    // Перевіряємо також каскадне автоскидання Сходинки 4 при збої на нижчій Сходинці 2:
    voerPassieveSpiegelLeesProefUit({ dienstId: 'ai_ruimte', steekproefGrootte: 3 }, { staatMap });
    schakelKlimopDienstOverdracht({ actie: 'activeer_passief_lezen', dienstId: 'ai_ruimte' }, { staatMap });
    voerGecontroleerdeDubbelSchrijfProefUit({ dienstId: 'ai_ruimte', operatiesAantal: 4 }, { staatMap });
    schakelKlimopDienstOverdracht({ actie: 'activeer_dubbel_schrijven', dienstId: 'ai_ruimte' }, { staatMap });
    voerStap4QuorumAttestProefUit({ dienstId: 'ai_ruimte', zaadMerkleWortelSha256: zaadWortel }, { staatMap });
    schakelKlimopDienstOverdracht({ actie: 'bevestig_quorum_gereedheid', dienstId: 'ai_ruimte' }, { staatMap });

    const spiegelFoutOpStap4 = voerPassieveSpiegelLeesProefUit(
      { dienstId: 'ai_ruimte', steekproefGrootte: 3, simuleerAfwijking: 'inhoud' },
      { staatMap },
    );

    const noodTerug = schakelKlimopDienstOverdracht({ actie: 'nood_terug_alle_elf' }, { staatMap });
    const naNoodQuorum = leesKlimopQuorumAttestLogboek({ staatMap, limiet: 100 });
    const naNoodDubbel = leesKlimopDubbelSchrijvenLogboek({ staatMap });
    const naNoodSpiegel = leesKlimopSpiegelLogboek({ staatMap });

    // Інваріант читання schakelaars.json: якщо вручну прописати attestModus без активної Сходинки 3, він примусово скидається
    const schakelPad = join(staatMap, 'schakelaars.json');
    const orgSchakelaars = readFileSync(schakelPad, 'utf8');
    const gemanipuleerd = JSON.parse(orgSchakelaars);
    gemanipuleerd.diensten.identiteit.leesModus = 'passief_spiegel_lezen';
    gemanipuleerd.diensten.identiteit.schrijfModus = 'alleen_erfenis_postgres';
    gemanipuleerd.diensten.identiteit.attestModus = 'quorum_gereed_onder_erfenis';
    writeFileSync(schakelPad, JSON.stringify(gemanipuleerd, null, 2), 'utf8');
    const hersteldInvarianteStaat = leesKlimopQuorumAttestLogboek({ staatMap });
    writeFileSync(schakelPad, orgSchakelaars, 'utf8');

    // Трирівнева перевірка verifieerQuorumAttestKeten:
    //   А) підміна поля без перерахунку гешу -> ATTEST_HASH_ONGELDIG
    //   Б) підміна поля zaadMerkleWortelSha256 ІЗ перерахунком attestSha256 -> ATTEST_FROST_HANDTEKENING_ONGELDIG
    //   В) підміна постквантового підпису ML-DSA-65 ІЗ перерахунком attestSha256 -> ATTEST_HYBRIDE_HANDTEKENING_ONGELDIG
    const chronologisch = naNoodQuorum.recenteAttesten.slice().reverse();
    const eerste = chronologisch[0];

    const ketenHashFout = verifieerQuorumAttestKeten([
      { ...eerste, zaadMerkleWortelSha256: 'a'.repeat(64) },
    ]);

    const { attestSha256: _oud1, ...zonderHashFrost } = {
      ...eerste,
      zaadMerkleWortelSha256: 'b'.repeat(64),
    };
    const herrekendFrostVervalst = {
      ...zonderHashFrost,
      attestSha256: berekenQuorumAttestSha256(zonderHashFrost),
    };
    const ketenFrostFout = verifieerQuorumAttestKeten([herrekendFrostVervalst]);

    const vervalstMlDsa =
      eerste.hybrideHandtekening.mlDsa65HandtekeningB64u.slice(0, -4)
      + (eerste.hybrideHandtekening.mlDsa65HandtekeningB64u.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    const { attestSha256: _oud2, ...zonderHashHybride } = {
      ...eerste,
      hybrideHandtekening: {
        ...eerste.hybrideHandtekening,
        mlDsa65HandtekeningB64u: vervalstMlDsa,
      },
    };
    const herrekendHybrideVervalst = {
      ...zonderHashHybride,
      attestSha256: berekenQuorumAttestSha256(zonderHashHybride),
    };
    const ketenHybrideFout = verifieerQuorumAttestKeten([herrekendHybrideVervalst]);

    // Перевіряємо на диску: пошкоджений quorum-attesten-kluis.jsonl блокує bevestig_quorum_gereedheid (409), але дозволяє повернення!
    const attestPad = join(staatMap, 'quorum-attesten-kluis.jsonl');
    const orgAttestInhoud = readFileSync(attestPad, 'utf8');
    writeFileSync(
      attestPad,
      orgAttestInhoud.replace(zaadWortel, 'c'.repeat(64)),
      'utf8',
    );
    const bevestigBijGebrokenAttest = vangFout(() =>
      schakelKlimopDienstOverdracht(
        { actie: 'bevestig_quorum_gereedheid', dienstId: 'identiteit' },
        { staatMap },
      ),
    );
    const terugBijGebrokenAttest = schakelKlimopDienstOverdracht(
      { actie: 'terug_naar_erfenis', dienstId: 'identiteit' },
      { staatMap },
    );
    writeFileSync(attestPad, orgAttestInhoud, 'utf8');

    check(
      'каскадне автоскидання і nood_terug_alle_elf скидають Сходинки 2–4, інваріант захищає schakelaars.json, а verifieerQuorumAttestKeten ловить і геш, і FROST, і ML-DSA-65 без блокування повернення',
      spiegelFoutOpStap4.ok === false
      && spiegelFoutOpStap4.schakelaar.attestModus === 'alleen_erfenis_postgres'
      && spiegelFoutOpStap4.schakelaar.schrijfModus === 'alleen_erfenis_postgres'
      && spiegelFoutOpStap4.schakelaar.leesModus === 'alleen_erfenis_postgres'
      && noodTerug.omgeschakeldeDienstenAantal === 1
      && noodTerug.actievePassiefLezenDiensten === 0
      && noodTerug.actieveDubbelSchrijvenDiensten === 0
      && noodTerug.actieveQuorumGereedDiensten === 0
      && naNoodQuorum.ketenIntegriteit.ok === true
      && naNoodDubbel.ketenIntegriteit.ok === true
      && naNoodSpiegel.ketenIntegriteit.ok === true
      && hersteldInvarianteStaat.schakelaars.find((s) => s.dienstId === 'identiteit')?.attestModus
        === 'alleen_erfenis_postgres'
      && ketenHashFout.ok === false
      && ketenHashFout.fout === 'ATTEST_HASH_ONGELDIG'
      && ketenFrostFout.ok === false
      && ketenFrostFout.fout === 'ATTEST_FROST_HANDTEKENING_ONGELDIG'
      && ketenHybrideFout.ok === false
      && ketenHybrideFout.fout === 'ATTEST_HYBRIDE_HANDTEKENING_ONGELDIG'
      && bevestigBijGebrokenAttest.code === 'KLIMOP_ATTEST_KETEN_ONGELDIG'
      && bevestigBijGebrokenAttest.status === 409
      && terugBijGebrokenAttest.ok === true,
    );

    // ------------------------------------------------------------------ 5. Шлюз маршрутів власника /api/owner/klimop/* для Сходинки 4
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

    const rGeweigerdLid = await roep(KLIMOP_PADEN.quorumAttest, 'lid', { dienstId: 'ontwikkelmiddelen' });
    const rGeweigerdHost = await roep(KLIMOP_PADEN.quorumAttest, 'eigenaar', { dienstId: 'ontwikkelmiddelen' }, 'mail');
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
    const rStap4Attest = await roep(KLIMOP_PADEN.quorumAttest, 'eigenaar', {
      dienstId: 'ontwikkelmiddelen',
    });
    const rStap4Aan = await roep(KLIMOP_PADEN.overdrachtSchakelaar, 'eigenaar', {
      actie: 'bevestig_quorum_gereedheid',
      dienstId: 'ontwikkelmiddelen',
    });
    const rQuorumLog = await roep(KLIMOP_PADEN.quorumLogboek, 'eigenaar', {
      dienstId: 'ontwikkelmiddelen',
      limiet: 5,
    });
    const rTerug = await roep(KLIMOP_PADEN.overdrachtSchakelaar, 'eigenaar', {
      actie: 'terug_naar_erfenis',
      dienstId: 'ontwikkelmiddelen',
    });

    check(
      'маршрути власника quorum-attest, quorum-logboek і overdracht-schakelaar відхиляють невласників і неадмінські хости (403), проводять Сходинки 2–4, повертають службу та пишуть в аудит',
      rGeweigerdLid.status === 403
      && rGeweigerdLid.fout === 'OWNER_REQUIRED'
      && rGeweigerdHost.status === 403
      && rGeweigerdHost.fout === 'ADMIN_SERVICE_REQUIRED'
      && rStap2Proef.status === 200
      && rStap2Aan.status === 200
      && rStap3Proef.status === 200
      && rStap3Aan.status === 200
      && rStap4Attest.status === 200
      && rStap4Attest.data.ok === true
      && rStap4Attest.data.drempelZegel.frostVerificatieOk === true
      && rStap4Attest.data.drempelZegel.hybrideVerificatieOk === true
      && rStap4Aan.status === 200
      && rStap4Aan.data.schakelaar.attestModus === 'quorum_gereed_onder_erfenis'
      && rQuorumLog.status === 200
      && rQuorumLog.data.ketenIntegriteit.ok === true
      && rTerug.status === 200
      && rTerug.data.schakelaar.attestModus === 'alleen_erfenis_postgres'
      && rTerug.data.schakelaar.schrijfModus === 'alleen_erfenis_postgres'
      && rTerug.data.schakelaar.leesModus === 'alleen_erfenis_postgres'
      && auditRegels.some((a) => a.action === 'klimop_quorum_attest' && a.result === 'success')
      && auditRegels.some((a) => a.action === 'klimop_overdracht_schakelaar' && a.result === 'success'),
    );

    // ------------------------------------------------------------------ 6. Реєстрація та виконання всіх 9 MCP-інструментів для 14 ШІ-агентів
    const opties = KLIMOP_TOOL_NAMEN.map((n) => V2_OPTIES.find((o) => o.id === n && o.kant === 'beheer'));
    const alleAgentNamen = V2_AGENTEN.flatMap((a) =>
      opties.map((o) => ({ agent: a.slug, naam: toolNaam(o!, a.slug) })),
    );

    _klimopMcpLimietenLeeg();
    const mcpAttest = await voerKlimopToolUit(
      { userId: 'u-eig', clientName: 'Antigravity', agent: 'antigravity' },
      'klimop_quorum_attest',
      { dienstId: 'verbinders' },
      { staatMap },
    );
    const mcpAttestJson = JSON.parse(mcpAttest.content[0].text);
    const mcpQuorumLog = await voerKlimopToolUit(
      { userId: 'u-eig', clientName: 'Claude', agent: 'claude' },
      'klimop_quorum_logboek',
      { dienstId: 'verbinders', limiet: 5 },
      { staatMap },
    );
    const mcpQuorumLogJson = JSON.parse(mcpQuorumLog.content[0].text);
    const mcpVerbodenSchakelaar = await voerKlimopToolUit(
      { userId: 'u-eig', clientName: 'Codex', agent: 'codex' },
      'klimop_overdracht_schakelaar',
      { actie: 'bevestig_quorum_gereedheid', dienstId: 'verbinders' },
      { staatMap },
    );

    check(
      'усі 9 інструментів klimop_* мають імена <= 64 знаків для всіх 14 агентів у технічному просторі, виконують атестати, а сам перемикач overdracht_schakelaar недоступний через MCP (§34)',
      klimopToolNamenGelijk()
      && KLIMOP_TOOL_NAMEN.length === 9
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
      && !mcpAttest.isError
      && mcpAttestJson.ok === true
      && mcpAttestJson.drempelZegel.frostVerificatieOk === true
      && mcpAttestJson.drempelZegel.hybrideVerificatieOk === true
      && !mcpQuorumLog.isError
      && mcpQuorumLogJson.ketenIntegriteit.ok === true
      && mcpVerbodenSchakelaar.isError === true
      && mcpVerbodenSchakelaar.content[0].text.includes('ONBEKEND_KLIMOP_HULPMIDDEL'),
      alleAgentNamen.filter((x) => x.naam.length > MAX_NAAM).map((x) => x.naam).join(', '),
    );
  } finally {
    rmSync(staatMap, { recursive: true, force: true });
  }

  // ------------------------------------------------------------------ 7. Перевірка двомовності всіх підписів Сходинки 4, параметрів MCP і підказок
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
  for (const [m, t] of Object.entries(KLIMOP_QUORUM_ATTESTMODUS_TEKST)) {
    registerTaalFouten.push(...taalFouten(`attestmodus.${m}`, t.uk, t.nl));
  }
  for (const k of Object.keys(HELP_KLIMOP)) {
    registerTaalFouten.push(...hulpGebreken(k, hulpVan(k)));
  }

  check(
    'усі двомовні підписи Сходинки 4, параметри MCP, KLIMOP_CODES, KLIMOP_QUORUM_ATTESTMODUS_TEKST та HELP_KLIMOP проходять taalFouten і hulpGebreken',
    registerTaalFouten.length === 0,
    registerTaalFouten.join(' | '),
  );

  // ------------------------------------------------------------------ 8. Двомовне серверне відмальовування блоку Сходинки 4 у KlimopPaneel.tsx
  nepBrowser('https://mcp.tarasevych.com');
  const { default: KlimopPaneel } = await import('../../src/agenten/KlimopPaneel');
  const htmlUk = renderToStaticMarkup(createElement(KlimopPaneel, { tr: UK, lang: 'uk', ctx: {} }));
  const htmlNl = renderToStaticMarkup(createElement(KlimopPaneel, { tr: NL, lang: 'nl', ctx: {} }));

  check(
    'оновлена панель KlimopPaneel відмальовує керування Сходинкою 4 українською та нідерландською з підказкою klimop.attest і без <style>',
    htmlUk.includes('data-klimop-attest="1"')
    && htmlUk.includes('data-hulp="klimop.attest"')
    && htmlUk.includes('Випустити кворумний атестат Сходинки 4')
    && htmlUk.includes('Підтвердити кворумну готовність')
    && !/Quorum-attest Stap 4 opstellen|Quorum-gereedheid bevestigen/.test(htmlUk)
    && htmlNl.includes('data-klimop-attest="1"')
    && htmlNl.includes('Quorum-attest Stap 4 opstellen')
    && htmlNl.includes('Quorum-gereedheid bevestigen')
    && !/Випустити кворумний атестат Сходинки 4|Підтвердити кворумну готовність/.test(htmlNl)
    && !/<style[\s>]/.test(htmlUk),
  );

  // ------------------------------------------------------------------ 9. Обов’язкова 15-пунктова архітектурна перевірка (§42)
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
      id,
      {
        voldaan: true,
        bewijs: `Перевірено у KLIMOP-017 (Етап 16 — Сходинка 4 кворумного атестата готовності та порогового допуску власника) для ${id}`,
      },
    ]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;

  const oordeelEtappe16 = beoordeelKlimopWijziging({
    naam: 'KLIMOP-017 Етап 16: Сходинка 4 кворумного атестата готовності та порогового допуску власника без вимкнення живої бази',
    fase: 12,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });

  check(
    'Етап 16 проходить обов’язкову 15-пунктову архітектурну перевірку маніфесту без зауважень',
    oordeelEtappe16.goedgekeurd === true && oordeelEtappe16.fouten.length === 0,
  );

  // ------------------------------------------------------------------ 10. Статті Етапів 1–16 без фінансових згадок, синхронізація пар, досьє та мовний закон
  const et16Uk = 'docs/hub/ПЛЮЩ-ЕТАП-16-КВОРУМНИЙ-АТЕСТАТ-СХОДИНКИ-4-ТА-ПОРОГОВИЙ-ДОПУСК.uk.md';
  const et16Md = 'docs/hub/ПЛЮЩ-ЕТАП-16-КВОРУМНИЙ-АТЕСТАТ-СХОДИНКИ-4-ТА-ПОРОГОВИЙ-ДОПУСК.md';
  const et16Nl = 'docs/hub/KLIMOP-FASE-16-STAP-4-QUORUMATTEST-EN-DREMPELVRIJGAVE.nl.md';

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
    'docs/hub/ПЛЮЩ-ЕТАП-15-ПОДВІЙНЕ-ЗАПИСУВАННЯ-ЗВІРКА-ЧИТАННЯ-ТА-ПОВЕРНЕННЯ.uk.md',
    'docs/hub/KLIMOP-FASE-15-DUBBEL-SCHRIJVEN-LEESVERIFICATIE-EN-TERUGVAL.nl.md',
    et16Uk,
    et16Nl,
  ];
  const financieelPatroon = /\b(0\s*євро|0\s*euro|грошов\w*\s+витрат|фінансов\w*\s+результат|maandelijkseKostenEuro)\b/i;
  const artikelenMetFinancieel = klimopArtikelen.filter((p) => financieelPatroon.test(lees(p)));

  check(
    'статті Етапів 1–16 не містять згадок про фінансові результати чи грошові суми, а всі дзеркальні пари документації синхронізовані байт-у-байт',
    artikelenMetFinancieel.length === 0
    && [et16Uk, et16Md, et16Nl].every((p) => existsSync(p))
    && lees(et16Uk) === lees(et16Md)
    && lees('.agents/skills/klimop-architectuur/SKILL.md') === lees('.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md')
    && lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md') === lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.md')
    && lees('README.md') === lees('ОГЛЯД-ПРОЄКТУ.uk.md')
    && lees('LEESMIJ.md') === lees('PROJECTOVERZICHT.nl.md')
    && lees('ПЛАН-ПЕРЕНЕСЕННЯ.uk.md') === lees('ПЛАН-ПЕРЕНЕСЕННЯ.md'),
    artikelenMetFinancieel.join(', '),
  );

  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));
  check(
    'досьє ecosysteem-klimop.json фіксує запит №198 для KLIMOP-016, задачу KLIMOP-017 та 36 активних можливостей без втрат',
    dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-016' && w.pr === 198)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-017')
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length === 36
    && dossier.mogelijkheden.every((m: { staat: string }) => m.staat !== 'verloren'),
  );

  const bestandenKlimop017 = [
    'shared/klimop-overzicht-model.ts',
    'backend/klimop-overdracht-opslag.ts',
    'backend/klimop-platform-brug.ts',
    'backend/klimop-paden.ts',
    'backend/klimop-hulpmiddeldefinities.ts',
    'backend/klimop-hulpmiddelen.ts',
    'src/klimop/klimop-klant.ts',
    'src/agenten/KlimopPaneel.tsx',
    et16Uk,
    et16Nl,
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
    'tests/eenheid/klimop-017-quorum-attest-stap4-20261121.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const overtredingen = bestandenKlimop017.filter((p) => {
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
    'усі нові та оновлені файли й записи каталогу KLIMOP-017 повністю дотримуються Абсолютного мовного закону',
    overtredingen.length === 0 && catalogusOvertredingen.length === 0,
    [...overtredingen, ...catalogusOvertredingen].join(', '),
  );

  return einde();
}
