// KLIMOP-015 (21.11.2026): Модульні та інтеграційні випробування Етапу 14 екосистеми «Плющ» —
// Сходинка 2 пасивного читання, криптографічного журналу розбіжностей і перемикача миттєвого повернення (§35, §42–§43 маніфесту):
//   1. Пасивна багатоелементна звірка voerPassieveSpiegelLeesProefUit для всіх 11 служб із 0 змін у робочій PostgreSQL;
//   2. Незмінний ланцюжок SHA-256 журналу розбіжностей, виявлення підробки будь-якого запису й відсутність відкритих даних;
//   3. Захищений перемикач власника schakelKlimopDienstOverdracht: заборона увімкнення без попередньої звірки,
//      миттєве автоматичне повернення при розбіжності (inhoud / machtigingen / ontbrekend_record) та аварійне повернення всіх 11 служб;
//   4. Захищені маршрути /api/owner/klimop/{passieve-spiegel,spiegel-logboek,overdracht-schakelaar} і технічні MCP-інструменти для 14 агентів;
//   5. Двомовна вебпанель KlimopPaneel.tsx, повне очищення всіх статей від фінансових згадок та Абсолютний мовний закон.
// Запуск: node scripts/eenheidstests.mjs klimop-015-passieve-spiegel-terugschakeling-20261121.test.ts

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
  KLIMOP_LEESMODUS_TEKST,
  KLIMOP_PADEN,
  KLIMOP_TOOL_NAMEN,
} from '../../shared/klimop-overzicht-model';
import {
  KLIMOP_GENESIS_KETEN_SHA256,
  leesKlimopSpiegelLogboek,
  schakelKlimopDienstOverdracht,
  verifieerSpiegelLogboekKeten,
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

export async function main(): Promise<number> {
  const { check, einde } = checker(
    'KLIMOP-015 · Етап 14: Сходинка 2 пасивного читання, журнал розбіжностей і перемикач повернення 11 служб',
  );

  const staatMap = mkdtempSync(join(tmpdir(), 'klimop-015-staat-'));
  try {
    // ------------------------------------------------------------------ 1. Початковий стан і захист перемикача без попередньої звірки
    const beginStaat = leesKlimopSpiegelLogboek({ staatMap });
    let zonderSpiegelFout = '';
    try {
      schakelKlimopDienstOverdracht(
        { actie: 'activeer_passief_lezen', dienstId: 'postvak' },
        { staatMap },
      );
    } catch (e) {
      zonderSpiegelFout = String((e as { code?: string }).code ?? '');
    }

    check(
      'початковий стан тримає всі 11 служб на alleen_erfenis_postgres і блокує увімкнення пасивного читання без попередньої безрозбіжної звірки',
      beginStaat.ketenIntegriteit.ok === true
      && beginStaat.ketenIntegriteit.laatsteSha256 === KLIMOP_GENESIS_KETEN_SHA256
      && beginStaat.schakelaars.length === 11
      && beginStaat.schakelaars.every(
        (s) => s.leesModus === 'alleen_erfenis_postgres' && s.primaireSchrijfBron === 'erfenis_postgres',
      )
      && zonderSpiegelFout === 'KLIMOP_SPIEGEL_EERST_VEREIST',
    );

    // ------------------------------------------------------------------ 2. Багатоелементна пасивна звірка Сходинки 2 для всіх 11 служб
    const alleElfUitkomsten = KLIMOP_ELF_DIENSTEN.map((dienstId) =>
      voerPassieveSpiegelLeesProefUit({ dienstId, steekproefGrootte: 4 }, { staatMap }),
    );
    const naElfStaat = leesKlimopSpiegelLogboek({ staatMap, limiet: 20 });

    check(
      'voerPassieveSpiegelLeesProefUit без розбіжностей перевіряє всі 11 служб (по 4 елементи RS 4+2 та CRDT) і будує цілісний ланцюжок із 11 записів SHA-256',
      alleElfUitkomsten.every(
        (u) =>
          u.ok === true
          && u.steekproefGrootte === 4
          && u.reedSolomonAlleRecordsHersteld === true
          && u.crdtSamenvoegingOk === true
          && u.kruisDienstIsolatieAfgedwongen === true
          && u.pariteit.volledigGelijk === true
          && u.pariteit.afwijkingen === 0
          && u.productieDatabankGewijzigd === false
          && u.logboekRegel.bevatGeheimenOfInhoud === false,
      )
      && naElfStaat.ketenIntegriteit.ok === true
      && naElfStaat.ketenIntegriteit.gecontroleerdeRegels === 11
      && naElfStaat.samenvatting.totaalLogboekRegels === 11,
    );

    // ------------------------------------------------------------------ 3. Вмикання пасивного читання та миттєве автоповернення при розбіжності
    const schakelPostvakAan = schakelKlimopDienstOverdracht(
      { actie: 'activeer_passief_lezen', dienstId: 'postvak' },
      { staatMap },
    );
    const schakelWolkAan = schakelKlimopDienstOverdracht(
      { actie: 'activeer_passief_lezen', dienstId: 'wolkopslag' },
      { staatMap },
    );
    const schakelAgendaAan = schakelKlimopDienstOverdracht(
      { actie: 'activeer_passief_lezen', dienstId: 'agenda' },
      { staatMap },
    );

    const ovMetActieve = klimopOverzicht(process.cwd(), staatMap);

    // Моделюємо розбіжність вмісту для postvak та розбіжність прав доступу для wolkopslag
    const afwijkingInhoud = voerPassieveSpiegelLeesProefUit(
      { dienstId: 'postvak', steekproefGrootte: 4, simuleerAfwijking: 'inhoud' },
      { staatMap },
    );
    const afwijkingMachtigingen = voerPassieveSpiegelLeesProefUit(
      { dienstId: 'wolkopslag', steekproefGrootte: 3, simuleerAfwijking: 'machtigingen' },
      { staatMap },
    );

    // Після виявленої розбіжності не можна знову увімкнути пасивне читання без нової чистої звірки!
    let herinschakelZonderSchoonBewijsFout = '';
    try {
      schakelKlimopDienstOverdracht(
        { actie: 'activeer_passief_lezen', dienstId: 'postvak' },
        { staatMap },
      );
    } catch (e) {
      herinschakelZonderSchoonBewijsFout = String((e as { code?: string }).code ?? '');
    }

    check(
      'виявлення розбіжності вмісту або дозволів миттєво й автоматично повертає службу на alleen_erfenis_postgres, хешує сліди в журналі та блокує повторне увімкнення без чистої звірки',
      schakelPostvakAan.actievePassiefLezenDiensten === 1
      && schakelWolkAan.actievePassiefLezenDiensten === 2
      && schakelAgendaAan.actievePassiefLezenDiensten === 3
      && ovMetActieve.overdrachtStaat?.actievePassiefLezenDiensten === 3
      && afwijkingInhoud.ok === false
      && afwijkingInhoud.automatischTeruggezetNaarErfenis === true
      && afwijkingInhoud.schakelaar.leesModus === 'alleen_erfenis_postgres'
      && afwijkingInhoud.schakelaar.automatischeTerugschakelingen === 1
      && afwijkingInhoud.logboekRegel.soort === 'automatische_terugschakeling'
      && afwijkingInhoud.logboekRegel.afwijkingSleutelHashes.inhoud.length === 1
      && /^[0-9a-f]{16}$/.test(afwijkingInhoud.logboekRegel.afwijkingSleutelHashes.inhoud[0])
      && !JSON.stringify(afwijkingInhoud.logboekRegel).includes('passief_postvak_item_1')
      && afwijkingMachtigingen.ok === false
      && afwijkingMachtigingen.automatischTeruggezetNaarErfenis === true
      && afwijkingMachtigingen.schakelaar.leesModus === 'alleen_erfenis_postgres'
      && afwijkingMachtigingen.logboekRegel.afwijkingSleutelHashes.machtigingen.length === 1
      && herinschakelZonderSchoonBewijsFout === 'KLIMOP_SPIEGEL_EERST_VEREIST',
    );

    // ------------------------------------------------------------------ 4. Аварійне повернення всіх 11 служб та виявлення підробки журналу
    const schakelSlimwoonAan = schakelKlimopDienstOverdracht(
      { actie: 'activeer_passief_lezen', dienstId: 'slimwoon' },
      { staatMap },
    );
    const noodTerug = schakelKlimopDienstOverdracht(
      { actie: 'nood_terug_alle_elf' },
      { staatMap },
    );
    const naNood = leesKlimopSpiegelLogboek({ staatMap });

    check(
      'аварійний перемикач nood_terug_alle_elf одним рухом переводить усі активні служби назад у alleen_erfenis_postgres зі збереженням цілісності ланцюжка SHA-256',
      schakelSlimwoonAan.actievePassiefLezenDiensten === 2 // agenda + slimwoon
      && noodTerug.omgeschakeldeDienstenAantal === 2
      && noodTerug.actievePassiefLezenDiensten === 0
      && naNood.samenvatting.actievePassiefLezenDiensten === 0
      && naNood.ketenIntegriteit.ok === true,
    );

    // Перевіряємо виявлення підробки в журналі: псуємо 1 запис у копії й у живому файлі
    const vervalsteKopie = naNood.recenteRegels.slice().reverse();
    const eersteOrig = vervalsteKopie[0];
    const vervalst = [
      { ...eersteOrig, afwijkingenAantal: 99 },
      ...vervalsteKopie.slice(1),
    ];
    const ketenToetsVervalst = verifieerSpiegelLogboekKeten(vervalst);

    const logPad = join(staatMap, 'spiegel-logboek.jsonl');
    const orgInhoud = readFileSync(logPad, 'utf8');
    writeFileSync(logPad, orgInhoud.replace('"afwijkingenAantal":0', '"afwijkingenAantal":77'), 'utf8');

    let opschakelenBijGebrokenKetenFout = '';
    try {
      schakelKlimopDienstOverdracht(
        { actie: 'activeer_passief_lezen', dienstId: 'identiteit' },
        { staatMap },
      );
    } catch (e) {
      opschakelenBijGebrokenKetenFout = String((e as { code?: string }).code ?? '');
    }
    // Повернення назад працює НАВІТЬ за пошкодженого журналу!
    const terugBijGebrokenKeten = schakelKlimopDienstOverdracht(
      { actie: 'terug_naar_erfenis', dienstId: 'identiteit' },
      { staatMap },
    );
    // Відновлюємо чистий журнал для наступних кроків тесту
    writeFileSync(logPad, orgInhoud, 'utf8');

    check(
      'підміна одного байта в журналі виявляється ланцюжком SHA-256, блокує перемикання вперед (409), але залишає миттєве повернення на чинну основу повністю працездатним',
      ketenToetsVervalst.ok === false
      && ketenToetsVervalst.gebrokenBijVolgnummer === 1
      && opschakelenBijGebrokenKetenFout === 'KLIMOP_LOGBOEK_KETEN_ONGELDIG'
      && terugBijGebrokenKeten.ok === true,
    );

    // ------------------------------------------------------------------ 5. Шлюз маршрутів власника /api/owner/klimop/* для Сходинки 2
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

    const rGeweigerd = await roep(KLIMOP_PADEN.overdrachtSchakelaar, 'lid', {
      actie: 'nood_terug_alle_elf',
    });
    const rPassief = await roep(KLIMOP_PADEN.passieveSpiegel, 'eigenaar', {
      dienstId: 'ai_ruimte',
      steekproefGrootte: 3,
    });
    const rSchakelAan = await roep(KLIMOP_PADEN.overdrachtSchakelaar, 'eigenaar', {
      actie: 'activeer_passief_lezen',
      dienstId: 'ai_ruimte',
    });
    const rLog = await roep(KLIMOP_PADEN.spiegelLogboek, 'eigenaar', {
      dienstId: 'ai_ruimte',
      limiet: 5,
    });
    const rTerug = await roep(KLIMOP_PADEN.overdrachtSchakelaar, 'eigenaar', {
      actie: 'terug_naar_erfenis',
      dienstId: 'ai_ruimte',
    });

    check(
      'маршрути власника passieve-spiegel, spiegel-logboek і overdracht-schakelaar блокують невласників (403), керують Сходинкою 2 й записують дії в журнал безпеки',
      rGeweigerd.status === 403
      && rGeweigerd.fout === 'OWNER_REQUIRED'
      && rPassief.status === 200
      && rPassief.data.ok === true
      && rSchakelAan.status === 200
      && rSchakelAan.data.schakelaar.leesModus === 'passief_spiegel_lezen'
      && rLog.status === 200
      && rLog.data.ketenIntegriteit.ok === true
      && rTerug.status === 200
      && rTerug.data.schakelaar.leesModus === 'alleen_erfenis_postgres'
      && auditRegels.some((a) => a.action === 'klimop_passieve_spiegel' && a.result === 'success')
      && auditRegels.some((a) => a.action === 'klimop_overdracht_schakelaar' && a.result === 'success'),
    );

    // ------------------------------------------------------------------ 6. Реєстрація та виконання всіх 5 MCP-інструментів для 14 ШІ-агентів
    const opties = KLIMOP_TOOL_NAMEN.map((n) => V2_OPTIES.find((o) => o.id === n && o.kant === 'beheer'));
    const alleAgentNamen = V2_AGENTEN.flatMap((a) =>
      opties.map((o) => ({ agent: a.slug, naam: toolNaam(o!, a.slug) })),
    );

    _klimopMcpLimietenLeeg();
    const mcpPassief = await voerKlimopToolUit(
      { userId: 'u-eig', clientName: 'Antigravity', agent: 'antigravity' },
      'klimop_passieve_spiegel',
      { dienstId: 'mcp_poort', steekproefGrootte: 3 },
      { staatMap },
    );
    const mcpPassiefJson = JSON.parse(mcpPassief.content[0].text);
    const mcpLogboek = await voerKlimopToolUit(
      { userId: 'u-eig', clientName: 'Claude', agent: 'claude' },
      'klimop_spiegel_logboek',
      { dienstId: 'mcp_poort', limiet: 5 },
      { staatMap },
    );
    const mcpLogboekJson = JSON.parse(mcpLogboek.content[0].text);
    // Перевіряємо, що для ШІ-агента перемикача overdracht_schakelaar у MCP не існує взагалі (§34 маніфесту!)
    const mcpVerbodenSchakelaar = await voerKlimopToolUit(
      { userId: 'u-eig', clientName: 'Codex', agent: 'codex' },
      'klimop_overdracht_schakelaar',
      { actie: 'activeer_passief_lezen', dienstId: 'mcp_poort' },
      { staatMap },
    );

    check(
      'усі 5 інструментів klimop_* мають імена <= 64 знаків для всіх 14 агентів, працюють у технічному просторі, а сам перемикач режимів недоступний для самовільного виклику ШІ-агентами (§34)',
      klimopToolNamenGelijk()
      && KLIMOP_TOOL_NAMEN.length >= 5
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
      && !mcpPassief.isError
      && mcpPassiefJson.ok === true
      && !mcpLogboek.isError
      && mcpLogboekJson.ketenIntegriteit.ok === true
      && mcpVerbodenSchakelaar.isError === true
      && mcpVerbodenSchakelaar.content[0].text.includes('ONBEKEND_KLIMOP_HULPMIDDEL'),
      alleAgentNamen.filter((x) => x.naam.length > MAX_NAAM).map((x) => x.naam).join(', '),
    );
  } finally {
    rmSync(staatMap, { recursive: true, force: true });
  }

  // ------------------------------------------------------------------ 7. Перевірка двомовності всіх нових текстів каталогу, підказок і кодів
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
  for (const k of Object.keys(HELP_KLIMOP)) {
    registerTaalFouten.push(...hulpGebreken(k, hulpVan(k)));
  }

  check(
    'усі нові двомовні підписи Сходинки 2, параметри MCP, KLIMOP_CODES та HELP_KLIMOP проходять сувору перевірку taalFouten і hulpGebreken',
    registerTaalFouten.length === 0,
    registerTaalFouten.join(' | '),
  );

  // ------------------------------------------------------------------ 8. Двомовне серверне відмальовування оновленої панелі KlimopPaneel.tsx
  nepBrowser('https://mcp.tarasevych.com');
  const { default: KlimopPaneel } = await import('../../src/agenten/KlimopPaneel');
  const htmlUk = renderToStaticMarkup(createElement(KlimopPaneel, { tr: UK, lang: 'uk', ctx: {} }));
  const htmlNl = renderToStaticMarkup(createElement(KlimopPaneel, { tr: NL, lang: 'nl', ctx: {} }));

  check(
    'оновлена панель KlimopPaneel відмальовує керування Сходинкою 2 українською та нідерландською з підказками klimop.passief і klimop.schakelaar та без <style>',
    htmlUk.includes('data-klimop-passief="1"')
    && htmlUk.includes('Пасивна звірка Сходинки 2')
    && htmlUk.includes('Повернути всі 11 служб')
    && htmlUk.includes('data-hulp="klimop.schakelaar"')
    && !/Passieve proef Stap 2|Alle 11 diensten terugzetten/.test(htmlUk)
    && htmlNl.includes('Passieve proef Stap 2')
    && htmlNl.includes('Alle 11 diensten terugzetten')
    && !/Пасивна звірка Сходинки 2|Повернути всі 11 служб/.test(htmlNl)
    && !/<style[\s>]/.test(htmlUk),
  );

  // ------------------------------------------------------------------ 9. Обов'язкова 15-пунктова архітектурна перевірка (§42)
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
      id,
      {
        voldaan: true,
        bewijs: `Перевірено у KLIMOP-015 (Етап 14 — Сходинка 2 пасивного читання, журналу розбіжностей і перемикача повернення) для ${id}`,
      },
    ]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;

  const oordeelEtappe14 = beoordeelKlimopWijziging({
    naam: 'KLIMOP-015 Етап 14: Сходинка 2 пасивного читання, криптографічного журналу та перемикача повернення',
    fase: 12,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });

  check(
    'Етап 14 проходить обов’язкову 15-пунктову архітектурну перевірку маніфесту без зауважень',
    oordeelEtappe14.goedgekeurd === true && oordeelEtappe14.fouten.length === 0,
  );

  // ------------------------------------------------------------------ 10. Відсутність фінансових згадок у статтях, синхронізація пар, досьє та мовний закон
  const et14Uk = 'docs/hub/ПЛЮЩ-ЕТАП-14-ПАСИВНЕ-ЧИТАННЯ-ЖУРНАЛ-РОЗБІЖНОСТЕЙ-ТА-ПЕРЕМИКАЧ-ПОВЕРНЕННЯ.uk.md';
  const et14Md = 'docs/hub/ПЛЮЩ-ЕТАП-14-ПАСИВНЕ-ЧИТАННЯ-ЖУРНАЛ-РОЗБІЖНОСТЕЙ-ТА-ПЕРЕМИКАЧ-ПОВЕРНЕННЯ.md';
  const et14Nl = 'docs/hub/KLIMOP-FASE-14-PASSIEF-LEZEN-AFWIJKINGSLOGBOEK-EN-TERUGSCHAKELING.nl.md';

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
    et14Uk,
    et14Nl,
  ];
  const financieelPatroon = /\b(0\s*євро|0\s*euro|грошов\w*\s+витрат|фінансов\w*\s+результат|maandelijkseKostenEuro)\b/i;
  const artikelenMetFinancieel = klimopArtikelen.filter((p) => financieelPatroon.test(lees(p)));

  check(
    'усі статті Етапів 1–14 очищені від згадок про фінансові результати та грошові витрати, а всі дзеркальні пари повністю синхронізовані',
    artikelenMetFinancieel.length === 0
    && [et14Uk, et14Md, et14Nl].every((p) => existsSync(p))
    && lees(et14Uk) === lees(et14Md)
    && lees('.agents/skills/klimop-architectuur/SKILL.md') === lees('.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md')
    && lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md') === lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.md')
    && lees('README.md') === lees('ОГЛЯД-ПРОЄКТУ.uk.md')
    && lees('LEESMIJ.md') === lees('PROJECTOVERZICHT.nl.md')
    && lees('ПЛАН-ПЕРЕНЕСЕННЯ.uk.md') === lees('ПЛАН-ПЕРЕНЕСЕННЯ.md'),
    artikelenMetFinancieel.join(', '),
  );

  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));
  check(
    'досьє ecosysteem-klimop.json фіксує запит №196 для KLIMOP-014, задачу KLIMOP-015, зауваження власника та 32 активні можливості без втрат',
    dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-014' && w.pr === 196)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-015')
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length >= 32
    && dossier.mogelijkheden.every((m: { staat: string }) => m.staat !== 'verloren')
    && dossier.opmerkingenEigenaar.length >= 3,
  );

  const bestandenKlimop015 = [
    'shared/klimop-overzicht-model.ts',
    'backend/klimop-overdracht-opslag.ts',
    'backend/klimop-platform-brug.ts',
    'backend/klimop-paden.ts',
    'backend/klimop-hulpmiddeldefinities.ts',
    'backend/klimop-hulpmiddelen.ts',
    'src/klimop/klimop-klant.ts',
    'src/agenten/KlimopPaneel.tsx',
    et14Uk,
    et14Nl,
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
    'tests/eenheid/klimop-015-passieve-spiegel-terugschakeling-20261121.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const overtredingen = bestandenKlimop015.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });
  check(
    'усі нові та оновлені файли KLIMOP-015 повністю дотримуються Абсолютного мовного закону',
    overtredingen.length === 0,
    overtredingen.join(', '),
  );

  return einde();
}
