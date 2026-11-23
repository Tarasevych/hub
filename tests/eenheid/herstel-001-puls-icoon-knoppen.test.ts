// Модульне випробування HERSTEL-001 (Частина 7Б):
// 1. Компактна піктограмна кнопка IcoonActieKnop (тони зі staat-kleuren.css, числові значки, прихований підпис mr-sr).
// 2. Однорядкові 6 вкладок фільтрації (.mel-tabs), 5 дій ланцюга першопричини (.puls-keten-acties), дії картки та підвалу.
// 3. Очищення початкових сирих емодзі біля офіційних логотипів src/merk/ (schoonKaartTitel) та типи сповіщень з MELDING_SCHEMAS.
// 4. Семантичні кольори стану картки (--staat-goed зелений для відновлення/успіху, --staat-let помаранчевий для уваги, --staat-fout червоний для збою).
// 5. Мовна чистота та відсутність нових правил position:fixed чи !important у стилях.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RefreshCw } from 'lucide-react';
import { SERVICE_HOSTS } from '../../backend/deployment-identiteit';
import { MELDING_SCHEMAS } from '../../shared/meldingen-catalogus';
import { dienstVoorSoort, routeerMeldingLink } from '../../shared/melding-link';
import {
  normaliseerGebeurtenis,
  standaardProfiel,
  type MeldingEcosysteemGebeurtenis,
} from '../../shared/meldingen-ecosysteem';
import { interpreteerGebeurtenis } from '../../shared/meldingen-ecosysteem/tolk';
import { bundelOorzaakKetens } from '../../shared/meldingen-puls';
import { nepBrowser } from './hulp/nep-browser';
import { checker } from './hulp/nep-google';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const lees = (pad: string) => readFileSync(resolve(pad), 'utf8');

function maakGeb(
  id: string,
  velden: Partial<MeldingEcosysteemGebeurtenis> & { titel: string },
): MeldingEcosysteemGebeurtenis {
  const nu = 1_763_930_000_000;
  return normaliseerGebeurtenis(
    {
      id,
      externeSleutel: velden.externeSleutel ?? `ext:${id}`,
      ruimte: velden.ruimte ?? 'technisch',
      kanaal: velden.kanaal ?? 'beveiliging',
      subdomein: velden.subdomein ?? 'admin',
      bron: velden.bron ?? 'systeem',
      prioriteit: velden.prioriteit ?? 'normaal',
      status: velden.status ?? 'nieuw',
      titel: velden.titel,
      bericht: velden.bericht ?? '',
      uitleg: velden.uitleg ?? '',
      contextLabel: velden.contextLabel ?? '',
      herhalingen: velden.herhalingen ?? 1,
      bijlagen: velden.bijlagen ?? [],
      acties: velden.acties ?? [],
      meta: velden.meta ?? {},
      aangemaaktOp: velden.aangemaaktOp ?? nu - 60_000,
      bijgewerktOp: velden.bijgewerktOp ?? nu,
    },
    velden.ruimte ?? 'technisch',
  )!;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('herstel-001-puls-icoon-knoppen');

  nepBrowser('https://admin.tarasevych.com', 'uk');

  const { default: IcoonActieKnop } = await import('../../src/meldingen/IcoonActieKnop');
  const { default: MeldingVeegKaart, schoonKaartTitel, bepaalKaartStaat } = await import(
    '../../src/meldingen/ecosysteem/MeldingVeegKaart'
  );
  const { default: PulsOorzaakKetenKaart } = await import('../../src/meldingen/puls/PulsOorzaakKetenKaart');
  const { default: MeldingenPortaal } = await import('../../src/meldingen/ecosysteem/MeldingenPortaal');

  // 1. Компонент IcoonActieKnop: підтримує всі семантичні тони, числовий значок teller, посилання href та прихований mr-sr
  for (const toon of ['standaard', 'actief', 'primair-let', 'primair-goed', 'primair-fout'] as const) {
    const knopHtml = renderToStaticMarkup(
      createElement(IcoonActieKnop, {
        icoon: createElement(RefreshCw, { 'aria-hidden': 'true' }),
        label: `Дія тону ${toon}`,
        toon,
        teller: toon === 'actief' ? 43 : undefined,
      }),
    );
    check(
      `1a IcoonActieKnop відмальовує семантичний тон ${toon} зі схованим підписом mr-sr без видимого розтягнутого тексту`,
      knopHtml.includes(`is-toon-${toon}`) &&
        knopHtml.includes('puls-icoon-knop') &&
        knopHtml.includes(`<span class="mr-sr">Дія тону ${toon}</span>`) &&
        (toon !== 'actief' || knopHtml.includes('<b class="puls-icoon-teller" aria-hidden="true">43</b>')),
    );
  }

  const linkHtml = renderToStaticMarkup(
    createElement(IcoonActieKnop, {
      href: 'https://id.tarasevych.com/melding#melding-register',
      icoon: createElement(RefreshCw, { 'aria-hidden': 'true' }),
      label: 'База всіх типів сповіщень',
      'data-qa-id': 'puls-open-register',
    }),
  );
  check(
    '1b IcoonActieKnop із href відмальовує семантичне посилання <a> зі збереженими data-qa-id та aria-label',
    linkHtml.startsWith('<a ') &&
      linkHtml.includes('href="https://id.tarasevych.com/melding#melding-register"') &&
      linkHtml.includes('data-qa-id="puls-open-register"') &&
      linkHtml.includes('aria-label="База всіх типів сповіщень"'),
  );

  // 2. Очищення сирих емодзі заголовка (schoonKaartTitel) та семантичні кольори стану картки (bepaalKaartStaat)
  check(
    '2a schoonKaartTitel прибирає сирі емодзі (✅, 🚨, ⚠️, ⛔, 📍, 🖼️) перед заголовком, не чіпаючи змістовний текст',
    schoonKaartTitel('✅ Telegram: зв’язок відновлено') === 'Telegram: зв’язок відновлено' &&
      schoonKaartTitel('🚨 Telegram: тривога безпеки') === 'Telegram: тривога безпеки' &&
      schoonKaartTitel('⚠️ Зміна у вашому Telegram') === 'Зміна у вашому Telegram' &&
      schoonKaartTitel('⛔ Спробу входу заблоковано') === 'Спробу входу заблоковано' &&
      schoonKaartTitel('📍 Місце пристрою не надано') === 'Місце пристрою не надано' &&
      schoonKaartTitel('🖼️ Нове фото профілю Telegram') === 'Нове фото профілю Telegram' &&
      schoonKaartTitel('Claude підготував звіт') === 'Claude підготував звіт',
  );

  const tgHerstelGeb = maakGeb('tg-ok', {
    kanaal: 'beveiliging',
    subdomein: 'admin',
    prioriteit: 'hoog',
    titel: '✅ Telegram: зв’язок відновлено',
    bericht: 'Вхід через Telegram знову працює.',
  });
  const tgAlarmGeb = maakGeb('tg-fout', {
    kanaal: 'beveiliging',
    subdomein: 'id',
    prioriteit: 'kritiek',
    titel: '🚨 Telegram: тривога безпеки',
    bericht: 'Вхід через Telegram не працює: перевірте ключ.',
    meta: { link: 'https://admin.tarasevych.com/sso' },
  });
  const mcpBesluitGeb = maakGeb('mcp-let', {
    kanaal: 'mcp',
    subdomein: 'mcp',
    prioriteit: 'hoog',
    titel: 'Claude Code просить одноразовий дозвіл на читання журналу',
  });

  const tgHerstelNlGeb = maakGeb('tg-ok-nl', {
    kanaal: 'beveiliging',
    subdomein: 'admin',
    prioriteit: 'hoog',
    titel: '✅ Telegram: verbinding hersteld',
    bericht: 'Aanmelden met Telegram werkt weer stabiel zonder fouten.',
  });

  check(
    '2b bepaalKaartStaat виставляє goed (зелений) для відновлення (включно з «zonder fouten»), fout (червоний) для збою та let (помаранчевий) для рішення',
    bepaalKaartStaat(tgHerstelGeb, 'gewoon') === 'goed' &&
      bepaalKaartStaat(tgHerstelNlGeb, 'gewoon') === 'goed' &&
      bepaalKaartStaat(tgAlarmGeb, 'gevaar') === 'fout' &&
      bepaalKaartStaat(mcpBesluitGeb, 'besluit') === 'let',
  );

  const profiel = standaardProfiel('technisch');
  const herstelKaartHtml = renderToStaticMarkup(
    createElement(MeldingVeegKaart, {
      lang: 'uk',
      gebeurtenis: tgHerstelGeb,
      profiel,
      bijlageVoorkeur: profiel.bijlageWeergave,
      onStatus: () => undefined,
      onOntleden: async () => ({
        aanbieder: 'intern-lokaal',
        modus: 'intern',
        samenvatting: 'Підсумок',
        watGebeurde: 'Подія',
        waaromBelangrijk: 'Важливо',
        aanbevolenStappen: [],
        veiligheidsOpmerking: '',
        gegenereerdOp: Date.now(),
      }),
      onOpenBijlageModaal: () => undefined,
    }),
  );

  check(
    '2c картка відновлення Telegram не містить сирого ✅ у заголовку, показує назву схеми з MELDING_SCHEMAS (S15) та зелений стан is-staat-goed',
    !herstelKaartHtml.includes('✅') &&
      herstelKaartHtml.includes('<strong>Telegram: зв’язок відновлено</strong>') &&
      herstelKaartHtml.includes('data-puls-schema="S15"') &&
      herstelKaartHtml.includes(MELDING_SCHEMAS.S15.naam[0]) &&
      herstelKaartHtml.includes('data-puls-staat="goed"') &&
      herstelKaartHtml.includes('data-qa-id="puls-kaart-ai"') &&
      herstelKaartHtml.includes('Швидкий розбір ШІ'),
  );

  // 3. PulsOorzaakKetenKaart: 5 компактних піктограмних кнопок у .puls-keten-acties з числовим значком 18
  const ketenBronItems: MeldingEcosysteemGebeurtenis[] = [tgAlarmGeb];
  for (let i = 1; i < 18; i += 1) {
    ketenBronItems.push(
      maakGeb(`tg-keten-${i}`, {
        kanaal: 'systeem',
        subdomein: 'admin',
        prioriteit: 'hoog',
        titel: 'Вхід через Telegram тимчасово недоступний',
        bericht: 'Вхід через Telegram не працює понад 10 хвилин.',
      }),
    );
  }
  const ketens = bundelOorzaakKetens(ketenBronItems, 'uk');
  const eersteKeten = ketens.find((e) => e.soort === 'keten');
  check('3a сформовано ланцюг першопричини з 18 пов’язаних подій', eersteKeten?.soort === 'keten' && eersteKeten.keten.alleIds.length === 18);

  if (eersteKeten?.soort === 'keten') {
    const ketenHtmlUk = renderToStaticMarkup(
      createElement(PulsOorzaakKetenKaart, {
        lang: 'uk',
        keten: eersteKeten.keten,
        onSelect: () => undefined,
        onHerstelKeten: () => undefined,
        renderLosseKaart: () => null,
        alleGebeurtenissenMap: new Map(),
      }),
    );
    const ketenHtmlNl = renderToStaticMarkup(
      createElement(PulsOorzaakKetenKaart, {
        lang: 'nl',
        keten: eersteKeten.keten,
        onSelect: () => undefined,
        onHerstelKeten: () => undefined,
        renderLosseKaart: () => null,
        alleGebeurtenissenMap: new Map(),
      }),
    );
    check(
      '3b PulsOorzaakKetenKaart відмальовує 5 піктограмних кнопок у .puls-keten-acties з тоном primair-let і числовим значком 18 двома мовами',
      ketenHtmlUk.includes('puls-keten-acties') &&
        ketenHtmlUk.includes('data-qa-id="puls-keten-herstel"') &&
        ketenHtmlUk.includes('is-toon-primair-let') &&
        ketenHtmlUk.includes('data-qa-id="puls-keten-uitstel"') &&
        ketenHtmlUk.includes('data-qa-id="puls-keten-opgelost"') &&
        ketenHtmlUk.includes('data-qa-id="puls-keten-archief"') &&
        ketenHtmlUk.includes('data-qa-id="puls-keten-leden-knop"') &&
        ketenHtmlUk.includes('<b class="puls-icoon-teller" aria-hidden="true">18</b>') &&
        ketenHtmlUk.includes('Показати пов’язані події (18)') &&
        ketenHtmlNl.includes('Gekoppelde gebeurtenissen tonen (18)') &&
        !ketenHtmlUk.includes('🚨'),
    );
  }

  // 4. MeldingenPortaal: 6 піктограмних вкладок у .mel-tabs, компактна шапка та 3 піктограмні кнопки у підвалі .mel-voet
  (globalThis.window as unknown as { innerWidth: number; innerHeight: number }).innerWidth = 360;
  (globalThis.window as unknown as { innerWidth: number; innerHeight: number }).innerHeight = 800;
  const portaalUk = renderToStaticMarkup(
    createElement(MeldingenPortaal, {
      lang: 'uk',
      open: true,
      compactBijBel: false,
      ruimte: 'technisch',
      subdomeinNu: 'admin',
      profiel,
      stroom: [...ketenBronItems, tgHerstelGeb, mcpBesluitGeb],
      laden: false,
      sound: true,
      onSluiten: () => undefined,
      onOpenen: () => undefined,
      onToggleSound: () => undefined,
      onVervers: () => undefined,
      onSlaGeometrieOp: () => undefined,
      onStatusWijzigen: async () => undefined,
      onOntleden: async () => ({
        aanbieder: 'intern-lokaal',
        modus: 'intern',
        samenvatting: 'Підсумок',
        watGebeurde: 'Опис',
        waaromBelangrijk: 'Значення',
        aanbevolenStappen: [],
        veiligheidsOpmerking: '',
        gegenereerdOp: Date.now(),
      }),
      onMarkAll: () => undefined,
      onSwitchToClassic: () => undefined,
    }),
  );
  (globalThis.window as unknown as { innerWidth: number; innerHeight: number }).innerWidth = 1280;

  check(
    '4a MeldingenPortaal на смартфоні (360×800) відмальовує всі 6 піктограмних вкладок (modus="tab"), компактний перемикач форми й 3 кнопки підвалу',
    ['actief', 'nieuw', 'uitgesteld', 'opgelost', 'archief', 'alle'].every((s) =>
      portaalUk.includes(`data-qa-id="puls-tab-${s}"`),
    ) &&
      portaalUk.includes('data-puls-icoon-knop="tab"') &&
      portaalUk.includes('data-qa-id="melding-vorm-compact"') &&
      portaalUk.includes('data-qa-id="puls-markeer-alle"') &&
      portaalUk.includes('data-qa-id="puls-open-register"') &&
      portaalUk.includes('data-qa-id="puls-open-regels"') &&
      portaalUk.includes('puls-voet-teller'),
  );

  // Сумісність зі сценарієм L4-S03 consolidatie-001 (рядки 749–803, uk + nl)
  const vertolktConflict = interpreteerGebeurtenis({
    bron: 'afstemming.conflict',
    soort: 'afstemming.conflict',
    subdomein: 'api',
    titel: 'Виявлено конфлікт вимог / Eisenconflict gedetecteerd',
    link: '/afstemming',
  });
  const doelHref = routeerMeldingLink('/afstemming', { soort: 'afstemming.conflict' });
  let conflictRendersOk = dienstVoorSoort('afstemming.conflict') === 'api' && doelHref.startsWith(`https://${SERVICE_HOSTS.api}/`) && vertolktConflict.meta.link === doelHref;
  for (const taal of ['uk', 'nl'] as const) {
    const geb = maakGeb(`afst-${taal}`, {
      kanaal: 'app',
      subdomein: 'api',
      bron: 'afstemming.conflict',
      prioriteit: 'hoog',
      titel: taal === 'uk' ? 'Потрібне рішення власника у Звірці' : 'Besluit van eigenaar vereist in Afstemming',
      bericht: taal === 'uk' ? 'Перевірте картку узгодження.' : 'Controleer de afstemmingskaart.',
      meta: { link: doelHref },
    });
    const html = renderToStaticMarkup(
      createElement(MeldingVeegKaart, {
        lang: taal,
        gebeurtenis: geb,
        profiel,
        bijlageVoorkeur: profiel.bijlageWeergave,
        onStatus: () => undefined,
        onOntleden: async () => ({
          aanbieder: 'intern-lokaal',
          modus: 'intern',
          samenvatting: 'Огляд',
          watGebeurde: 'Зміна',
          waaromBelangrijk: 'Відкрити',
          aanbevolenStappen: [],
          veiligheidsOpmerking: '',
          gegenereerdOp: Date.now(),
        }),
        onOpenBijlageModaal: () => undefined,
      }),
    );
    if (!html.includes(taal === 'uk' ? 'Потрібне рішення власника' : 'Besluit van eigenaar vereist') || !html.includes(doelHref)) {
      conflictRendersOk = false;
    }
  }
  check('4b сумісність із L4-S03 consolidatie-001: картка конфлікту узгодження коректно відмальовується uk і nl із переходом на api.*', conflictRendersOk);

  // 5. Мовна чистота та дотримання правил CSS (без !important і без нових position:fixed у таблиці стилів)
  const ecoCss = lees('src/meldingen/ecosysteem/meldingen-ecosysteem.css');
  check(
    '5a meldingen-ecosysteem.css не містить !important та містить прив’язки до --staat-goed, --staat-let, --staat-fout',
    !ecoCss.includes('!important') &&
      ecoCss.includes('var(--staat-goed)') &&
      ecoCss.includes('var(--staat-let)') &&
      ecoCss.includes('var(--staat-fout)'),
  );

  for (const pad of [
    'src/meldingen/IcoonActieKnop.tsx',
    'src/meldingen/ecosysteem/MeldingenPortaal.tsx',
    'src/meldingen/ecosysteem/MeldingVeegKaart.tsx',
    'src/meldingen/puls/PulsOorzaakKetenKaart.tsx',
    'src/meldingen/ecosysteem/meldingen-ecosysteem.css',
  ]) {
    const inhoud = lees(pad);
    check(
      `5b мовна й архітектурна чистота (${pad}): немає заборонених літер та саморобних <svg>`,
      !VERBODEN_LETTERS.test(inhoud) && (pad.endsWith('.css') || !/<svg\b/i.test(inhoud)),
    );
  }

  return einde();
}
