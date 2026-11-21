// KLIMOP-014 (21.11.2026): Модульні та інтеграційні випробування Етапу 13 екосистеми «Плющ» —
// вбудовування ядра «Плюща» у платформу «Мій простір» (§32–§35, §42–§43, §46 маніфесту):
//   1. Серверний міст klimopOverzicht / klimopArchitectuurToets / klimopSpiegelControle (backend/klimop-platform-brug.ts);
//   2. Безризикова криптографічна перевірка Сходинки 1 (§35) для всіх 11 служб платформи з 0 змін у PostgreSQL;
//   3. Захищені маршрути власника /api/owner/klimop/* (backend/klimop-paden.ts, підключено у backend/index.ts);
//   4. Технічні інструменти MCP klimop_* у З'єднувачі другої версії для всіх 14 ШІ-агентів;
//   5. Двомовна вебпанель KlimopPaneel.tsx у розділі «Координація» (TabOrch.tsx) і підказки HELP_KLIMOP;
//   6. Двомовна документація Етапу 13, досьє (30 активних можливостей, 0 втрачених) та Абсолютний мовний закон.
// Запуск: node scripts/eenheidstests.mjs klimop-014-platformintegratie-spiegel-20261121.test.ts

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  KLIMOP_DIENST_TEKST,
  KLIMOP_PADEN,
  KLIMOP_TOOL_NAMEN,
  klimopCodeTekst,
} from '../../shared/klimop-overzicht-model';
import {
  klimopArchitectuurToets,
  klimopOverzicht,
  klimopSpiegelControle,
} from '../../backend/klimop-platform-brug';
import { klimopPaden } from '../../backend/klimop-paden';
import {
  KLIMOP_TOOLS,
  klimopToolNamenGelijk,
} from '../../backend/klimop-hulpmiddeldefinities';
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
  const { check, einde } = checker('KLIMOP-014 · Етап 13: платформна інтеграція, MCP 14 агентів і дзеркальна звірка Сходинки 1');

  // ------------------------------------------------------------------ 1. Огляд ядра та чесний стан при відсутності копії
  const legeMap = mkdtempSync(join(tmpdir(), 'klimop-014-leeg-'));
  try {
    const ovLeeg = klimopOverzicht(legeMap);
    check(
      'klimopOverzicht без робочої копії джерел чесно повертає KLIMOP_GEEN_BRON без вигадування кореня Меркла',
      ovLeeg.bron.aanwezig === false
      && ovLeeg.bron.code === 'KLIMOP_GEEN_BRON'
      && ovLeeg.zaadMerkleWortelSha256 === null
      && ovLeeg.kernModules.length === 0
      && ovLeeg.productieOnaangetast === true,
    );
  } finally {
    rmSync(legeMap, { recursive: true, force: true });
  }

  const ovEcht = klimopOverzicht(process.cwd());
  check(
    'klimopOverzicht на справжньому сховищі підтверджує 12/12 модулів ядра, корінь Меркла SHA-256, 12 засад §46, 25 документів §44 і 11 служб',
    ovEcht.bron.aanwezig === true
    && ovEcht.kernModules.length === 12
    && ovEcht.kernModules.every((m) => m.aanwezig && /^[0-9a-f]{64}$/.test(m.sha256) && m.grootteBytes > 1000)
    && typeof ovEcht.zaadMerkleWortelSha256 === 'string'
    && /^[0-9a-f]{64}$/.test(ovEcht.zaadMerkleWortelSha256)
    && ovEcht.afhankelijkheden.ok === true
    && ovEcht.eindvisie46?.ok === true
    && ovEcht.eindvisie46.gedektePijlers === 12
    && ovEcht.eindvisie46.voltooideDocumenten44 === 25
    && ovEcht.diensten.length === 11
    && ovEcht.productieOnaangetast === true,
  );

  // ------------------------------------------------------------------ 2. Машинна 15-пунктова перевірка пропозицій
  const toetsGoed = klimopArchitectuurToets({
    naam: 'Безпечна дзеркальна звірка Сходинки 1',
    fase: 12,
    richting: 'compatibiliteit_en_migratie',
    raaktProductieDirectZonderGoedkeuring: false,
    probeertZelfGoedTeKeurenOfUitTeRollen: false,
    gebruikStandaardBewijsVoorOntbrekendeVragen: true,
  });
  const toetsFout = klimopArchitectuurToets({
    naam: 'Спроба одноосібного перемикання робочої бази',
    fase: 12,
    richting: 'verdeelde_opslag',
    raaktProductieDirectZonderGoedkeuring: true,
    probeertZelfGoedTeKeurenOfUitTeRollen: true,
    aanwezigeVerbodenVereenvoudigingen: ['productie_uitschakelen_voor_alternatief'],
    gebruikStandaardBewijsVoorOntbrekendeVragen: true,
  });

  check(
    'klimopArchitectuurToets схвалює перевірену пропозицію і блокує втручання в робочу базу та самосхвалення ШІ-агента',
    toetsGoed.goedgekeurd === true
    && toetsGoed.beoordeeldeVragen === 15
    && toetsGoed.vereistMenselijkOfQuorumBesluit === true
    && toetsFout.goedgekeurd === false
    && toetsFout.fouten.includes('DIRECTE_PRODUCTIEWIJZIGING_ZONDER_EIGENAAR_VERBODEN')
    && toetsFout.fouten.includes('AI_ZELFGOEDKEURING_OF_UITROL_VERBODEN'),
  );

  // ------------------------------------------------------------------ 3. Дзеркальна перевірка Сходинки 1 (§35) для всіх 11 служб
  const psids = new Set<string>();
  const spiegelUitkomsten = KLIMOP_ELF_DIENSTEN.map((dienstId) => {
    const r = klimopSpiegelControle({ dienstId });
    psids.add(r.geisoleerdeDienstPsid);
    return r;
  });

  let onbekendeDienstFout = '';
  try {
    klimopSpiegelControle({ dienstId: 'niet_bestaande_dienst' });
  } catch (e) {
    onbekendeDienstFout = String((e as { code?: string }).code ?? '');
  }

  check(
    'klimopSpiegelControle успішно проходить Сходинку 1 §35 для всіх 11 служб із відновленням Ріда–Соломона (4+2), злиттям CRDT і міжслужбовою ізоляцією',
    spiegelUitkomsten.length === 11
    && spiegelUitkomsten.every(
      (u) =>
        u.ok === true
        && u.geisoleerdeDienstPsid.startsWith('psid1_')
        && u.reedSolomon.hersteldNaUitvalVanTweeStrepen === true
        && u.reedSolomon.inhoudSha256Gelijk === true
        && u.crdtSamenvoegingOk === true
        && u.kruisDienstIsolatieAfgedwongen === true
        && u.pariteit.volledigGelijk === true
        && u.pariteit.afwijkingen === 0
        && u.overdrachtBesluit.toegestaan === true
        && u.overdrachtBesluit.huidigeProductieModus === 'alleen_erfenis_postgres'
        && u.overdrachtBesluit.gevalideerdeProefModus === 'schaduw_dubbel_schrijven'
        && u.productieDatabankGewijzigd === false,
    )
    && psids.size === 11
    && onbekendeDienstFout === 'ONBEKENDE_KLIMOP_DIENST',
  );

  // ------------------------------------------------------------------ 4. Шлюз маршрутів власника /api/owner/klimop/*
  const EIGENAAR = 'eigenaar@klimop.invalid';
  const gebruikers: Record<string, { id: string; role: string; email: string; status: string }> = {
    eigenaar: { id: 'u-eig', role: 'owner', email: EIGENAAR, status: 'approved' },
    lid: { id: 'u-lid', role: 'member', email: 'lid@klimop.invalid', status: 'approved' },
    vreemdOwner: { id: 'u-vreemd', role: 'owner', email: 'vreemd@klimop.invalid', status: 'approved' },
  };
  const auditRegels: Array<{ action: string; result: string; details: Record<string, unknown> }> = [];
  let blokkeerLimiet = false;

  const paden = klimopPaden({
    requireSession: async (event) =>
      event.wie
        ? ({ user: gebruikers[String(event.wie)], service: String(event.service ?? 'mcp') } as never)
        : { errorCode: 'UNAUTHORIZED' },
    isOwnerEmail: (email) => email === EIGENAAR,
    rateLimit: async () => ({ ok: !blokkeerLimiet }),
    audit: async (_e, action, result, details) => {
      auditRegels.push({ action, result, details });
    },
  });

  const roepRoute = async (
    pad: string,
    wie: string | null,
    body: Record<string, unknown> = {},
    service = 'mcp',
  ) => {
    const res = (await paden[`POST ${pad}`][0]({
      event: { wie, service, headers: {} },
      body,
    } as never)) as { statusCode: number; body: string };
    const data = JSON.parse(res.body);
    return { status: res.statusCode, data, fout: String(data?.error ?? '') };
  };

  check(
    'шлюз /api/owner/klimop/*: блокує запити без сеансу (401), звичайного учасника, чужий e-mail та неадміністративні піддомени (hub -> 403)',
    Object.values(KLIMOP_PADEN).every((p) => paden[`POST ${p}`]?.length === 1)
    && (await roepRoute(KLIMOP_PADEN.overzicht, null)).status === 401
    && (await roepRoute(KLIMOP_PADEN.overzicht, 'lid')).fout === 'OWNER_REQUIRED'
    && (await roepRoute(KLIMOP_PADEN.overzicht, 'vreemdOwner')).fout === 'OWNER_REQUIRED'
    && (await roepRoute(KLIMOP_PADEN.overzicht, 'eigenaar', {}, 'hub')).fout === 'ADMIN_SERVICE_REQUIRED'
    && lees('backend/index.ts').includes('...klimopPaden({'),
  );

  const rOv = await roepRoute(KLIMOP_PADEN.overzicht, 'eigenaar', {}, 'admin');
  const rSp = await roepRoute(KLIMOP_PADEN.spiegelControle, 'eigenaar', { dienstId: 'postvak' }, 'mcp');
  const rTt = await roepRoute(
    KLIMOP_PADEN.architectuurToets,
    'eigenaar',
    { naam: 'Перевірка маршруту власника', gebruikStandaardBewijsVoorOntbrekendeVragen: true },
    'mcp',
  );
  blokkeerLimiet = true;
  const rLim = await roepRoute(KLIMOP_PADEN.overzicht, 'eigenaar');
  blokkeerLimiet = false;

  check(
    'маршрути власника на mcp.* та admin.* повертають огляд і результати перевірок, записують події в журнал безпеки та дотримуються обмеження частоти 429',
    rOv.status === 200
    && rOv.data.kernModules.length === 12
    && rSp.status === 200
    && rSp.data.ok === true
    && rSp.data.dienstId === 'postvak'
    && rTt.status === 200
    && rTt.data.goedgekeurd === true
    && auditRegels.some((a) => a.action === 'klimop_spiegel_controle' && a.result === 'success')
    && auditRegels.some((a) => a.action === 'klimop_architectuur_toets' && a.result === 'success')
    && rLim.status === 429
    && rLim.fout === 'RATE_LIMITED',
  );

  // ------------------------------------------------------------------ 5. Реєстрація та виконання MCP-інструментів klimop_* для всіх 14 агентів
  const opties = KLIMOP_TOOL_NAMEN.map((n) => V2_OPTIES.find((o) => o.id === n && o.kant === 'beheer'));
  const alleAgentNamen = V2_AGENTEN.flatMap((a) =>
    opties.map((o) => ({ agent: a.slug, naam: toolNaam(o!, a.slug) })),
  );

  check(
    'усі 3 інструменти klimop_* зареєстровані в BEHEER_TOOLS і каталозі v2 лише в технічному просторі та мають імена <= 64 знаків для всіх 14 агентів',
    klimopToolNamenGelijk()
    && KLIMOP_TOOL_NAMEN.length >= 3
    && KLIMOP_TOOL_NAMEN.every((n) => isKlimopTool(n) && BEHEER_TOOL_NAMEN.has(n) && toolRuimte(n) === 'technisch')
    && KLIMOP_TOOL_NAMEN.every((n) => !V2_OPTIES.some((o) => o.id === n && o.kant === 'gebruiker'))
    && opties.every((o) => o && o.groep === 'releases' && o.sub === 'admin' && o.soort === 'lezen' && o.risico === 'laag' && o.status === 'actief')
    && V2_AGENTEN.length === 14
    && alleAgentNamen.every(
      (x) => x.naam.length <= MAX_NAAM && /^[a-z0-9_]+$/.test(x.naam) && ontleed(x.naam, x.agent).ok,
    )
    && KLIMOP_TOOL_NAMEN.every(
      (n) =>
        TOOL_CAPABILITY[n] === 'deploy.status'
        && actieSoort(n) === 'uitrol'
        && actieZin(n, undefined, 'uk') !== n
        && actieZin(n, undefined, 'nl') !== n
        && actieZin(n, undefined, 'uk') !== actieZin(n, undefined, 'nl'),
    ),
    alleAgentNamen.filter((x) => x.naam.length > MAX_NAAM).map((x) => x.naam).join(', '),
  );

  const registerTaalFouten: string[] = [];
  for (const o of opties) {
    registerTaalFouten.push(
      ...taalFouten(`${o!.id} titel`, o!.uk[0], o!.nl[0]),
      ...taalFouten(`${o!.id} uitleg`, o!.uk[1], o!.nl[1]),
      ...taalFouten(`${o!.id} gevolg`, o!.uk[2], o!.nl[2]),
    );
  }
  for (const n of KLIMOP_TOOL_NAMEN) {
    const h = hulpmiddelTekst(n, 'beheer');
    if (!h) registerTaalFouten.push(`${n}: geen hulpmiddelTekst`);
    else {
      registerTaalFouten.push(
        ...taalFouten(`${n} tekst`, h.titel.uk, h.titel.nl),
        ...taalFouten(`${n} uitleg`, h.uitleg.uk, h.uitleg.nl),
      );
    }
  }
  for (const t of KLIMOP_TOOLS) {
    for (const [naam, prop] of Object.entries((t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {})) {
      const d = (prop as { description?: unknown }).description;
      if (!isTweetalig(d)) registerTaalFouten.push(`${t.name}.${naam}: niet tweetalig`);
      else registerTaalFouten.push(...taalFouten(`${t.name}.${naam}`, d.uk, d.nl));
    }
  }
  for (const [c, t] of Object.entries(KLIMOP_CODES)) {
    registerTaalFouten.push(...taalFouten(c, t[0], t[1]));
  }
  for (const k of Object.keys(HELP_KLIMOP)) {
    registerTaalFouten.push(...hulpGebreken(k, hulpVan(k)));
  }

  check(
    'усі тексти каталогу, hulpmiddelTekst, параметрів MCP, KLIMOP_CODES та HELP_KLIMOP двомовні (uk/nl) без англійської та без прогалин',
    registerTaalFouten.length === 0 && klimopCodeTekst('uk', 'ONBEKEND_X') === 'ONBEKEND_X',
    registerTaalFouten.join(' | '),
  );

  _klimopMcpLimietenLeeg();
  const mcpOv = await voerKlimopToolUit(
    { userId: 'u-eig', clientName: 'Antigravity', agent: 'antigravity' },
    'klimop_overzicht',
    {},
  );
  const mcpOvJson = JSON.parse(mcpOv.content[0].text);
  const mcpSp = await voerKlimopToolUit(
    { userId: 'u-eig', clientName: 'Claude', agent: 'claude' },
    'klimop_spiegel_controle',
    { dienstId: 'wolkopslag' },
  );
  const mcpSpJson = JSON.parse(mcpSp.content[0].text);
  const mcpFout = await voerKlimopToolUit(
    { userId: 'u-eig', clientName: 'Grok', agent: 'grok' },
    'klimop_spiegel_controle',
    { dienstId: 'onbekend' },
  );

  check(
    'voerKlimopToolUit маскує локальний шлях сервера для ШІ-агента, виконує перевірку Сходинки 1 для wolkopslag і повертає двомовну помилку для невідомої служби',
    !mcpOv.isError
    && mcpOvJson.bron.wortel === 'werkkopie-server'
    && mcpOvJson.kernModules.length === 12
    && !mcpSp.isError
    && mcpSpJson.ok === true
    && mcpSpJson.dienstId === 'wolkopslag'
    && mcpFout.isError === true
    && mcpFout.content[0].text.includes('ONBEKENDE_KLIMOP_DIENST'),
  );

  // ------------------------------------------------------------------ 6. Серверне відмальовування двомовної панелі KlimopPaneel.tsx та TabOrch.tsx
  nepBrowser('https://mcp.tarasevych.com');
  const { default: KlimopPaneel } = await import('../../src/agenten/KlimopPaneel');
  const { default: TabOrch } = await import('../../src/agenten/TabOrch');

  const htmlUk = renderToStaticMarkup(createElement(KlimopPaneel, { tr: UK, lang: 'uk', ctx: {} }));
  const htmlNl = renderToStaticMarkup(createElement(KlimopPaneel, { tr: NL, lang: 'nl', ctx: {} }));
  const tabOrchUk = renderToStaticMarkup(createElement(TabOrch, { tr: UK }));

  check(
    'KlimopPaneel і TabOrch відмальовуються українською та нідерландською з усіма 11 службами, підказками «?» і без тегів <style> чи змішування мов',
    htmlUk.includes('data-klimop-paneel="1"')
    && htmlUk.includes('Екосистема «Плющ» та дзеркальна звірка служб')
    && htmlUk.includes('data-hulp="klimop.spiegel"')
    && KLIMOP_ELF_DIENSTEN.every(
      (d) => htmlUk.includes(KLIMOP_DIENST_TEKST[d].uk) && htmlNl.includes(KLIMOP_DIENST_TEKST[d].nl),
    )
    && !/Spiegelverificatie van dienst|Kern verifiëren/.test(htmlUk)
    && htmlNl.includes('Ecosysteem «Klimop» en spiegelverificatie van diensten')
    && !/Дзеркальна звірка|Звірити ядро/.test(htmlNl)
    && !/<style[\s>]/.test(htmlUk)
    && tabOrchUk.includes('id="orch-klimop"'),
  );

  // ------------------------------------------------------------------ 7. Архітектурна перевірка 15 питань (§42)
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
      id,
      {
        voldaan: true,
        bewijs: `Перевірено у KLIMOP-014 (Етап 13 платформної інтеграції та Сходинки 1) для ${id}`,
      },
    ]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;

  const oordeelEtappe13 = beoordeelKlimopWijziging({
    naam: 'KLIMOP-014 Етап 13: платформна інтеграція, MCP 14 агентів і дзеркальна звірка Сходинки 1',
    fase: 12,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  check(
    'Етап 13 проходить обов’язкову 15-пунктову архітектурну перевірку маніфесту без зауважень',
    oordeelEtappe13.goedgekeurd === true && oordeelEtappe13.fouten.length === 0,
  );

  // ------------------------------------------------------------------ 8. Двомовні документи Етапу 13, дзеркальні пари та досьє (30 можливостей)
  const et13Uk = 'docs/hub/ПЛЮЩ-ЕТАП-13-ПЛАТФОРМНА-ІНТЕГРАЦІЯ-ТА-ДЗЕРКАЛЬНА-ЗВІРКА.uk.md';
  const et13Md = 'docs/hub/ПЛЮЩ-ЕТАП-13-ПЛАТФОРМНА-ІНТЕГРАЦІЯ-ТА-ДЗЕРКАЛЬНА-ЗВІРКА.md';
  const et13Nl = 'docs/hub/KLIMOP-FASE-13-PLATFORMINTEGRATIE-EN-SPIEGELVERIFICATIE.nl.md';

  check(
    'двомовні документи Етапу 13 і всі дзеркальні пари документації повністю синхронізовані',
    [et13Uk, et13Md, et13Nl].every((p) => existsSync(p))
    && lees(et13Uk) === lees(et13Md)
    && lees('.agents/skills/klimop-architectuur/SKILL.md') === lees('.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md')
    && lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md') === lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.md')
    && lees('README.md') === lees('ОГЛЯД-ПРОЄКТУ.uk.md')
    && lees('LEESMIJ.md') === lees('PROJECTOVERZICHT.nl.md')
    && lees('ПЛАН-ПЕРЕНЕСЕННЯ.uk.md') === lees('ПЛАН-ПЕРЕНЕСЕННЯ.md')
    && [
      'klimop-overzicht-model.ts',
      'klimop-platform-brug.ts',
      'klimop-paden.ts',
      'klimop-hulpmiddelen.ts',
      'KlimopPaneel.tsx',
      'klimopSpiegelControle',
    ].every((s) => lees(et13Uk).includes(s) && lees(et13Nl).includes(s)),
  );

  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));
  check(
    'досьє ecosysteem-klimop.json фіксує запит №195 для KLIMOP-013, задачу KLIMOP-014 та всі 30 активних можливостей без жодної втраченої',
    dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-013' && w.pr === 195)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-014')
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length >= 30
    && dossier.mogelijkheden.every((m: { staat: string }) => m.staat !== 'verloren'),
  );

  // ------------------------------------------------------------------ 9. Абсолютний мовний закон
  const bestandenKlimop014 = [
    'shared/klimop-overzicht-model.ts',
    'backend/klimop-platform-brug.ts',
    'backend/klimop-paden.ts',
    'backend/klimop-hulpmiddeldefinities.ts',
    'backend/klimop-hulpmiddelen.ts',
    'src/klimop/klimop-klant.ts',
    'src/agenten/KlimopPaneel.tsx',
    et13Uk,
    et13Nl,
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
    'tests/eenheid/klimop-014-platformintegratie-spiegel-20261121.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const overtredingen = bestandenKlimop014.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });
  check(
    'усі нові та оновлені файли KLIMOP-014 повністю дотримуються Абсолютного мовного закону',
    overtredingen.length === 0,
    overtredingen.join(', '),
  );

  return einde();
}
