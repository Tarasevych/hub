// MELDPANEEL-002 (22.11.2026): випробування єдиної панелі «Пульт уваги, спокою та дії» з офіційними логотипами src/merk/,
// семантичними маркерами файлів, печаткою ядра «Плющ», графом першопричини, радіусом дії мандата ШІ, умовним відкладенням,
// 15-секундним спокійним зведенням, живою капсулою перебігу, повагою до набору тексту та навчанням тиші.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  normaliseerGebeurtenis,
  standaardProfiel,
  type MeldingEcosysteemGebeurtenis,
} from '../../shared/meldingen-ecosysteem';
import {
  berekenMandaatStraal,
  bestandVisueelAnker,
  bouwRustigOverzicht,
  bundelOorzaakKetens,
  detecteerLiveVoortgang,
  heeftKlimopKernZegel,
  herkenMerkEnAnker,
  isInvoerElementActief,
  isUitstelVoorwaardeVervuld,
  maakVoorwaardelijkUitstel,
  magToastNuTonen,
  registreerWeggekliktZonderOpenen,
  uitstelKeuzeLabel,
  verrijkGebeurtenisVoorPuls,
} from '../../shared/meldingen-puls';
import { nepBrowser } from './hulp/nep-browser';
import { checker } from './hulp/nep-google';

const lees = (rel: string) => readFileSync(resolve(rel), 'utf8');

function maakGeb(
  id: string,
  velden: Partial<MeldingEcosysteemGebeurtenis> & { titel: string },
): MeldingEcosysteemGebeurtenis {
  const nu = 1_763_800_000_000;
  return normaliseerGebeurtenis(
    {
      id,
      externeSleutel: velden.externeSleutel ?? `ext:${id}`,
      ruimte: velden.ruimte ?? 'prive',
      kanaal: velden.kanaal ?? 'app',
      subdomein: velden.subdomein ?? 'hub',
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
    velden.ruimte ?? 'prive',
  )!;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('meldpaneel-002-aandachtspuls-20261122');

  // 1. Розпізнавання всіх 14 ШІ-агентів та відомих служб з єдиного реєстру src/merk/ без фальшивого вгадування
  const verwachteMerken: ReadonlyArray<[string, string]> = [
    ['Claude Code завершив перевірку', 'claude'],
    ['ChatGPT підготував відповідь', 'openai'],
    ['Codex оновив гілку', 'codex'],
    ['Gemini виконав аналіз', 'gemini'],
    ['Grok перевірив журнал', 'grok'],
    ['Antigravity зібрав випуск', 'antigravity'],
    ['AutoClaw виконав доручення', 'autoclaw'],
    ['Microsoft 365 Copilot знайшов документ', 'mscopilot'],
    ['GitHub Copilot запропонував правку', 'copilot'],
    ['Cursor відкрив проєкт', 'cursor'],
    ['Windsurf завершив сеанс', 'windsurf'],
    ['Cline зчитав конфігурацію', 'cline'],
    ['Devin створив звіт', 'devin'],
    ['OpenCode перевірив модуль', 'opencode'],
    ['Telegram: нове підтвердження безпеки', 'telegram'],
    ['OneDrive синхронізовано', 'microsoftonedrive'],
    ['Home Assistant: датчик вітальні', 'homeassistant'],
    ['GitHub: перевірка пройдена', 'github'],
    ['Gmail: вхідний лист', 'gmail'],
    ['Google Drive: спільна тека', 'googledrive'],
  ];

  for (const [titel, verwachtMerk] of verwachteMerken) {
    const g = maakGeb(`merk-${verwachtMerk}`, { titel, kanaal: verwachtMerk === 'gmail' ? 'mail' : 'ai' });
    const anker = herkenMerkEnAnker(g, 'uk');
    check(`merk-anker: «${titel}» → ${verwachtMerk}`, anker.merkSleutel === verwachtMerk, JSON.stringify(anker));
  }

  const gewoneBrief = maakGeb('brief-maria', {
    titel: 'Новий лист від Марії про сімейну вечерю',
    kanaal: 'mail',
    subdomein: 'mail',
    bron: 'post.inkomend',
  });
  check(
    'merk-anker: звичайний лист без постачальника не вгадує чужий бренд',
    herkenMerkEnAnker(gewoneBrief, 'uk').merkSleutel === null && herkenMerkEnAnker(gewoneBrief, 'uk').icoon === 'post',
  );

  // 2. Семантичні кольорові й піктограмні маркери форматів файлів (uk та nl)
  check('bestand-anker: таблиця xlsx → smaragd + XLSX', bestandVisueelAnker({ naam: 'zvit.xlsx', mime: '' }, 'uk').toon === 'smaragd');
  check('bestand-anker: документ pdf → koraal + PDF', bestandVisueelAnker({ naam: 'rahunok.pdf', mime: 'application/pdf' }, 'uk').toon === 'koraal');
  check('bestand-anker: зображення svg → hemel + SVG', bestandVisueelAnker({ naam: 'shema.svg', mime: 'image/svg+xml' }, 'uk').kortLabel === 'SVG');
  check('bestand-anker: різниця diff → amber + DIFF', bestandVisueelAnker({ naam: 'wijziging.diff', mime: 'text/x-diff' }, 'nl').kortLabel === 'DIFF');
  check('bestand-anker: архів uk/nl → АРХІВ / ARCHIEF', bestandVisueelAnker({ naam: 'pakket.tar.gz', mime: '' }, 'uk').kortLabel === 'АРХІВ' && bestandVisueelAnker({ naam: 'pakket.tar.gz', mime: '' }, 'nl').kortLabel === 'ARCHIEF');

  // 3. Непідробна печатка ядра «Плющ» (ніколи не надається зовнішнім листам)
  const kernBev = maakGeb('s:bev-1', {
    externeSleutel: 'site_notif:bev-1',
    kanaal: 'beveiliging',
    subdomein: 'id',
    bron: 'beveiliging.nieuw_apparaat',
    prioriteit: 'kritiek',
    titel: 'Новий вхід у систему з незнайомого пристрою',
  });
  const nepBrief = maakGeb('s:nep-mail', {
    externeSleutel: 'site_notif:nep-mail',
    kanaal: 'mail',
    subdomein: 'mail',
    bron: 'sleutelkluis.passkey.uitrol',
    prioriteit: 'kritiek',
    titel: 'Підпис ядра Плющ: терміново підтвердьте ключ входу',
  });
  check('klimop-zegel: справжня внутрішня подія безпеки має печатку ядра', heeftKlimopKernZegel(kernBev) === true);
  check('klimop-zegel: зовнішній лист пошти НІКОЛИ не отримує печатку ядра', heeftKlimopKernZegel(nepBrief) === false);

  // 4. Радіус дії мандата ШІ (що відкривається і що суворо закрито мандатом)
  const aiVerzoek = maakGeb('ai-mandaat-1', {
    kanaal: 'mcp',
    subdomein: 'mcp',
    bron: 'mcp.toestemming',
    titel: 'Claude Code просить одноразовий дозвіл на читання журналу перевірки',
  });
  const mandaat = berekenMandaatStraal(aiVerzoek, 'uk');
  check(
    'mandaat-straal: запит ШІ отримує логотип claude, межі дозволу і 2 опції тривалості',
    mandaat !== null &&
      mandaat.merkSleutel === 'claude' &&
      mandaat.welToegestaan.includes('Claude Code') &&
      mandaat.verbodenDoorMandaat.includes('Сховище ключів') &&
      mandaat.duurOpties.length === 2,
  );
  check('mandaat-straal: звичайний лист не показує блок мандата ШІ', berekenMandaatStraal(gewoneBrief, 'uk') === null);

  // 5. Граф першопричини: 3 пов’язані збої Google склеюються в один вузол з усіма залежними службами
  const googleWortel = maakGeb('g-id', {
    kanaal: 'beveiliging',
    subdomein: 'id',
    prioriteit: 'hoog',
    titel: 'Сеанс Google потребує повторного підтвердження входу',
    aangemaaktOp: 1000,
  });
  const googleMail = maakGeb('g-mail', {
    kanaal: 'mail',
    subdomein: 'mail',
    prioriteit: 'hoog',
    titel: 'Gmail тимчасово не синхронізує нові листи (помилка доступу)',
    aangemaaktOp: 2000,
  });
  const googleAi = maakGeb('g-ai', {
    kanaal: 'ai',
    subdomein: 'ai',
    prioriteit: 'hoog',
    titel: 'Gemini зупинив фонову чернетку через відсутність з’єднання Google',
    aangemaaktOp: 3000,
  });

  const gebundeld = bundelOorzaakKetens([googleMail, googleWortel, gewoneBrief, googleAi], 'uk');
  check('oorzaak-keten: 4 події стискаються до 2 одиниць (1 ланцюжок + 1 окремий лист)', gebundeld.length === 2);
  const ketenEenheid = gebundeld.find((e) => e.soort === 'keten');
  check(
    'oorzaak-keten: корінь ланцюжка — подія входу, містить усі 3 пов’язані служби з логотипами',
    ketenEenheid?.soort === 'keten' &&
      ketenEenheid.keten.wortel.id === 'g-id' &&
      ketenEenheid.keten.alleIds.length === 3 &&
      ketenEenheid.keten.gevolgen.some((d) => d.merkSleutel === 'gmail') &&
      ketenEenheid.keten.gevolgen.some((d) => d.merkSleutel === 'gemini'),
  );

  // 6. 15-секундне Спокійне зведення
  const ag1 = maakGeb('ag-1', { kanaal: 'systeem', subdomein: 'systeem', titel: 'Нічну перевірку цілісності завершено' });
  const ag2 = maakGeb('ag-2', { kanaal: 'systeem', subdomein: 'cloud', titel: 'Індексацію файлів синхронізовано' });
  const overzicht = bouwRustigOverzicht([aiVerzoek, ag1, ag2, gewoneBrief], 'uk');
  check(
    'rustig-overzicht: відділяє 1 питання людини від 2 виконаних фонових дій',
    overzicht.toon === true && overzicht.aandachtIds.length === 1 && overzicht.achtergrondKlaarIds.length === 2,
  );

  // 7. Розумне умовне відкладення (6 режимів та перевірка виконання умови)
  const basisNu = 1_763_800_000_000;
  const { regel: pcRegel } = maakVoorwaardelijkUitstel('brief-1', 'op_computer', basisNu, 'mail');
  check(
    'uitstel: у перші 15 с після відкладення умова не будить картку передчасно',
    !isUitstelVoorwaardeVervuld(pcRegel, {
      nu: basisNu + 5_000,
      schermBreedte: 1440,
      isAanraakScherm: false,
      subdomeinNu: 'hub',
      heeftRecentSuccesSignaal: false,
    }),
  );
  check(
    'uitstel: на телефоні умова «коли відкрию на комп’ютері» чекає далі',
    !isUitstelVoorwaardeVervuld(pcRegel, {
      nu: basisNu + 60_000,
      schermBreedte: 390,
      isAanraakScherm: true,
      subdomeinNu: 'hub',
      heeftRecentSuccesSignaal: false,
    }),
  );
  check(
    'uitstel: на широкому екрані комп’ютера умова спрацьовує автоматично',
    isUitstelVoorwaardeVervuld(pcRegel, {
      nu: basisNu + 60_000,
      schermBreedte: 1440,
      isAanraakScherm: false,
      subdomeinNu: 'hub',
      heeftRecentSuccesSignaal: false,
    }),
  );
  const { regel: subRegel } = maakVoorwaardelijkUitstel('wolk-1', 'bij_onderdeel', basisNu, 'cloud');
  check(
    'uitstel: умова «коли зайду у розділ» спрацьовує саме в потрібному піддомені',
    !isUitstelVoorwaardeVervuld(subRegel, {
      nu: basisNu + 30_000,
      schermBreedte: 1280,
      isAanraakScherm: false,
      subdomeinNu: 'mail',
      heeftRecentSuccesSignaal: false,
    }) &&
      isUitstelVoorwaardeVervuld(subRegel, {
        nu: basisNu + 30_000,
        schermBreedte: 1280,
        isAanraakScherm: false,
        subdomeinNu: 'cloud',
        heeftRecentSuccesSignaal: false,
      }),
  );
  check(
    'uitstel: двомовні підписи умов містять людську назву розділу',
    uitstelKeuzeLabel('bij_onderdeel', 'uk', 'cloud').includes('Хмара й файли') &&
      uitstelKeuzeLabel('bij_onderdeel', 'nl', 'cloud').includes('Cloud en bestanden'),
  );

  // 8. Жива капсула перебігу, повага спливних вікон до потоку набору та навчання тиші
  const lopendeTaak = maakGeb('taak-start', {
    kanaal: 'ai',
    subdomein: 'mcp',
    bron: 'uitrol.start',
    titel: 'Antigravity: складання випуску триває',
    meta: { voortgangPct: 68 },
    aangemaaktOp: basisNu - 120_000,
    bijgewerktOp: basisNu - 10_000,
  });
  const livePil = detecteerLiveVoortgang([lopendeTaak], 'uk', basisNu);
  check(
    'live-pil: розпізнає активний процес із відсотком та офіційним логотипом Antigravity',
    livePil !== null && livePil.procent === 68 && livePil.merkSleutel === 'antigravity',
  );

  check('typ-stroom: під час активного набору тексту некритичне спливне сповіщення чекає паузи', !magToastNuTonen({ isKritiek: false, laatsteToetsDrukMs: 5000, nu: 6200 }));
  check('typ-stroom: після паузи 2,5 с некритичне спливне сповіщення показується', magToastNuTonen({ isKritiek: false, laatsteToetsDrukMs: 5000, nu: 7600 }));
  check('typ-stroom: критичне сповіщення безпеки показується миттєво навіть під час набору', magToastNuTonen({ isKritiek: true, laatsteToetsDrukMs: 5000, nu: 5100 }));
  check(
    'typ-stroom: коректно розрізняє текстові поля вводу та кнопки/прапорці',
    isInvoerElementActief({ tagName: 'TEXTAREA' }) &&
      isInvoerElementActief({ tagName: 'INPUT', type: 'search' }) &&
      !isInvoerElementActief({ tagName: 'INPUT', type: 'checkbox' }),
  );

  let teller: Record<string, number> = {};
  teller = registreerWeggekliktZonderOpenen(teller, ag1, 'uk', 3).nieuweMap;
  teller = registreerWeggekliktZonderOpenen(teller, ag1, 'uk', 3).nieuweMap;
  const derdeKeer = registreerWeggekliktZonderOpenen(teller, ag1, 'uk', 3);
  check('stilte-suggestie: на 3-тє закриття некритичного джерела пропонує перевести в спокійний журнал', derdeKeer.suggestie !== null && derdeKeer.suggestie.aantalKeer === 3);
  check('stilte-suggestie: події безпеки НІКОЛИ не пропонуються до приглушення', registreerWeggekliktZonderOpenen({ 'beveiliging:id': 10 }, kernBev, 'uk', 3).suggestie === null);

  // 9. Статичне відмальовування єдиного Пульта у двох розмірах (compactBijBel=true і breed двоколонкове вікно) обома мовами
  nepBrowser('https://hub.tarasevych.com', 'uk');
  const { default: MeldingVeegKaart } = await import('../../src/meldingen/ecosysteem/MeldingVeegKaart');
  const { default: MeldingenPortaal } = await import('../../src/meldingen/ecosysteem/MeldingenPortaal');
  const profiel = standaardProfiel('prive');
  const profielBreed = { ...profiel, geometrie: { ...profiel.geometrie, modus: 'breed' as const, breedte: 780 } };
  const gebMetBijlage = maakGeb('claude-diff', {
    kanaal: 'ai',
    subdomein: 'github',
    bron: 'claude.controle',
    titel: 'Claude підготував звіт та таблицю перевірки',
    bijlagen: [
      { id: 'b1', naam: 'perevirka.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', grootteBytes: 4096 },
      { id: 'b2', naam: 'zminy.diff', mime: 'text/x-diff', grootteBytes: 512, tekstVoorbeeld: '+ nieuw' },
    ],
  });

  const verrijktBev = verrijkGebeurtenisVoorPuls(kernBev, 'uk');
  check('verrijking-x4: подія безпеки має рівень gevaar, 6 полів доказів та пару кнопок «Це не я» / «Це мій вхід»', verrijktBev.niveau === 'gevaar' && verrijktBev.emblemen.length === 6 && verrijktBev.knoppenPaar?.[0] === 'Це не я');

  const compactHtmlUk = renderToStaticMarkup(
    createElement(MeldingenPortaal, {
      lang: 'uk',
      open: true,
      compactBijBel: true,
      ruimte: 'prive',
      subdomeinNu: 'hub',
      profiel,
      stroom: [kernBev, aiVerzoek, googleWortel, googleMail, googleAi, gebMetBijlage, ag1, ag2],
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
        samenvatting: 'Короткий підсумок',
        watGebeurde: 'Подія',
        waaromBelangrijk: 'Важливо',
        aanbevolenStappen: ['Крок 1'],
        veiligheidsOpmerking: '',
        gegenereerdOp: basisNu,
      }),
      onMarkAll: () => undefined,
      onSwitchToClassic: () => undefined,
      onOpenVensterModus: () => undefined,
    }),
  );

  const breedHtmlNl = renderToStaticMarkup(
    createElement(MeldingenPortaal, {
      lang: 'nl',
      open: true,
      compactBijBel: false,
      ruimte: 'prive',
      subdomeinNu: 'mail',
      profiel: profielBreed,
      stroom: [kernBev, aiVerzoek, googleWortel, googleMail, gebMetBijlage, ag1, ag2],
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
        samenvatting: 'Korte samenvatting',
        watGebeurde: 'Gebeurtenis',
        waaromBelangrijk: 'Belangrijk',
        aanbevolenStappen: ['Stap 1'],
        veiligheidsOpmerking: '',
        gegenereerdOp: basisNu,
      }),
      onMarkAll: () => undefined,
      onSwitchToClassic: () => undefined,
    }),
  );

  const openKaartHtml = renderToStaticMarkup(
    createElement(MeldingVeegKaart, {
      lang: 'uk',
      gebeurtenis: gebMetBijlage,
      profiel,
      standaardOpen: true,
      bijlageVoorkeur: profiel.bijlageWeergave,
      onStatus: () => undefined,
      onOntleden: async () => ({
        aanbieder: 'intern-lokaal',
        modus: 'intern',
        samenvatting: 'Підсумок',
        watGebeurde: 'Опис',
        waaromBelangrijk: 'Значення',
        aanbevolenStappen: [],
        veiligheidsOpmerking: '',
        gegenereerdOp: basisNu,
      }),
      onOpenBijlageModaal: () => undefined,
    }),
  );

  check(
    'render-compact-uk: компактний Пульт біля дзвіночка містить перемикач «Вікно», логотипи <Merk>, печатку «Плющ», граф першопричини, мандат ШІ та маркери файлів',
    compactHtmlUk.includes('is-compact-bij-bel') &&
      compactHtmlUk.includes('data-puls-vorm="compact"') &&
      compactHtmlUk.includes('data-qa-id="melding-vorm-venster-puls"') &&
      compactHtmlUk.includes('data-puls-zegel="klimop"') &&
      compactHtmlUk.includes('data-puls-mandaat="1"') &&
      compactHtmlUk.includes('data-puls-keten="aanbieder:google"') &&
      compactHtmlUk.includes('data-puls-overzicht="1"') &&
      compactHtmlUk.includes('puls-bestand-chip') &&
      compactHtmlUk.includes('XLSX') &&
      compactHtmlUk.includes('DIFF'),
  );

  check(
    'render-breed-nl: розгорнуте нідерландське вікно містить інспектор події з доказами X4 та перемикач «Compact»',
    breedHtmlNl.includes('is-tweekolom') &&
      breedHtmlNl.includes('data-puls-vorm="venster"') &&
      breedHtmlNl.includes('puls-detail-kolom') &&
      breedHtmlNl.includes('puls-x4-emblemen') &&
      breedHtmlNl.includes('Klimop-kernzegel') &&
      breedHtmlNl.includes('Compact'),
  );

  check(
    'render-kaart-x4: розгорнута картка показує прогресивну сітку значків-питань X4',
    openKaartHtml.includes('data-puls-x4=') && openKaartHtml.includes('puls-x4-cel'),
  );

  // 10. Перевірка чистоти коду: відсутність заборонених не-українських кириличних літер та саморобних <svg> у нових модулях
  const verbodenTekensRe = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const nieuweBestanden = [
    'shared/meldingen-puls/kern.ts',
    'shared/meldingen-puls/index.ts',
    'src/meldingen/puls/puls-opslag.ts',
    'src/meldingen/puls/PulsVisueelAnker.tsx',
    'src/meldingen/puls/PulsOorzaakKetenKaart.tsx',
  ];
  for (const pad of nieuweBestanden) {
    const inhoud = lees(pad);
    check(`zuiverheid (${pad}): немає заборонених літер та ручних <svg>`, !verbodenTekensRe.test(inhoud) && !/<svg\b/i.test(inhoud));
  }

  return einde();
}
