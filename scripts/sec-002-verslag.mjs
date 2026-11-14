#!/usr/bin/env node
// Публічний звіт безпеки SEC-002 (12.11.2026) / Openbaar beveiligingsrapport SEC-002.
// Складає з одного файла даних docs/beveiliging/sec-002-gegevens.json два документи з однаковою будовою:
//   docs/beveiliging/ЗВІТ-БЕЗПЕКИ-SEC-002-20261112.uk.md      (українською)
//   docs/beveiliging/BEVEILIGINGSRAPPORT-SEC-002-20261112.nl.md (нідерландською)
// Генератор нічого не перекладає й не вигадує: усі тексти знахідок беруться з даних (поля uk і nl).
// Без залежностей, без мережі, без бази.
//
//   node scripts/sec-002-verslag.mjs [--gegevens <файл>] [--uit <тека>] [--uitgave <адреса випуску>] [--controle]
//
// --uitgave   адреса сторінки випуску SEC-002; без неї в документах стоїть позначка «буде додано під час випуску».
//             Адреса записується в службовий коментар у кінці документа, тож --controle без --uitgave бере її звідти.
// --controle  нічого не пише; код виходу 1, якщо в даних бракує стану чи перекладу або файли на диску
//             відрізняються від згенерованих.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const W = process.cwd();
const args = process.argv.slice(2);
const optie = (naam) => (args.includes(naam) ? args[args.indexOf(naam) + 1] : undefined);
const gegevensPad = resolve(W, optie('--gegevens') || 'docs/beveiliging/sec-002-gegevens.json');
const uitMap = resolve(W, optie('--uit') || 'docs/beveiliging');
const controle = args.includes('--controle');
let uitgave = optie('--uitgave');

const STANDEN = ['opgelost', 'gedeeltelijk', 'weerlegd', 'uitgesteld'];
const ERNST = ['hoog', 'midden', 'laag'];
const BRONNEN = ['audit', 'aanvullend', 'toets'];
const VELDEN = ['titel', 'wat', 'gevolg', 'herstel'];
const MARKER = 'sec-002-verslag';

// ---------- тексти оформлення (усе, що не є описом знахідки) ----------
const T = {
  uk: {
    schakel: (d) => `> 🌐 **Мова / Taal:** **Українська** · [Nederlands](${d.nl}) | [Головна](../../README.md) · [Покажчик документації](../ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md)`,
    titel: 'Звіт безпеки SEC-002 (12.11.2026): знайдені вразливості та їх виправлення',
    intro: (n) => `Цей звіт відкрито описує вразливості, знайдені під час глибокого аудиту безпеки всього сховища «Mijn Ruimte» (задача SEC-002), і те, як їх виправлено. Опис оприлюднено одночасно з патчами й архівом випуску, щоб усі, хто розгорнув проєкт у себе, знали про небезпеку й оновилися. Тут немає значень секретів, приватних даних і покрокових рецептів атаки: лише суть кожної вади, хто міг нею скористатися, наслідок і що змінено. Усього записів: **${n}**.`,
    gegenereerd: 'Документ згенеровано сценарієм `scripts/sec-002-verslag.mjs` з файла даних [`sec-002-gegevens.json`](sec-002-gegevens.json); не редагуйте його вручну.',
    hDoel: 'Для кого цей звіт і що робити',
    doel: (u) => [
      `**Оновіться до випуску SEC-002:** ${u}. Попередні версії містять описані нижче вразливості.`,
      'Нові міграції бази даних цього випуску застосовуються звичайним встановленням оновлення; окремих дій не потрібно.',
      'Оновіть розширення браузера до версії 0.9.3 (у ньому змінено захист від дій ШІ й приховування секретів).',
      'Після оновлення перегляньте «Сесії» та підключення ШІ й відкличте все незнайоме; перевірте сторінку «Захист» — там видно, чи не вимкнено повторні підтвердження входу.',
      'Якщо на вашому сервері працювали інші локальні користувачі чи ШІ-агенти з правом виконувати команди, змініть пароль системної ролі бази даних (див. server-uitrol-07). Якщо ви давали право «готувати оновлення» стороннім обліковим записам чи ШІ, розгляньте ротацію секретів служби за процедурою реєстру ключів (див. server-uitrol-01).',
    ],
    doelVooral: 'Оновлення особливо важливе, якщо:',
    vooral: ['ваш сайт доступний з інтернету чи іншої мережі;', 'на сайті кілька користувачів (родина, колеги, гості);', 'ви підключаєте ШІ-агентів (MCP, токени, агенти на пристроях);', 'ви користуєтеся розширенням браузера для ШІ.'],
    geenUitgave: 'адресу буде додано під час випуску',
    hCijfers: 'Короткий підсумок у цифрах',
    kolCijfers: ['Показник', 'Кількість'],
    rijAudit: 'Знахідок аудиту', rijAuditUitleg: (a, b) => `${a + b} (основний аудит ${a}, додаткові пошуки ${b})`,
    rijErnst: (e) => `— з вагою «${ERNSTLABEL.uk[e]}»`,
    rijStand: (s) => `— ${STANDLABEL.uk[s]}`,
    rijToets: 'Нових вад, знайдених незалежними перевіряльниками в патчах і суміжному коді',
    rijToetsUitleg: (n, r, b) => `${n} (з них регресій патчів, не пов'язаних із безпекою напряму: ${r}; старих вад основи без впливу на безпеку: ${b})`,
    rijToetsStand: (s) => `— нові вади: ${STANDLABEL.uk[s]}`,
    zelfde: (n) => `Частина знахідок описує ту саму першопричину з різних ділянок (${n} таких груп); у записах це позначено «Та сама першопричина».`,
    hGebieden: 'Таблиця за ділянками',
    kolGebieden: ['Ділянка', 'Знахідок', 'Висока', 'Середня', 'Низька', 'Виправлено', 'Частково', 'Відкладено', 'Нових вад від перевіряльників'],
    totaal: 'Разом',
    hBelangrijk: 'Найважливіші виправлення (усі з високою вагою)',
    belangrijkUitleg: 'Повні описи — у розділах нижче.',
    nieuwKort: 'нова вада, знайдена перевіряльником',
    hOpgelost: 'Усі виправлені знахідки за ділянками',
    hToets: 'Нові вади, знайдені перевіряльниками (виправлено)',
    toetsUitleg: 'Кожну групу патчів перевіряв незалежний перевіряльник. Нижче — вади, які він знайшов у самих патчах або в суміжному коді, і які виправлено до випуску. Регресії — помилки патчів у законній роботі без прямого впливу на безпеку.',
    hWeerlegd: 'Спростовані знахідки',
    geenWeerlegd: 'Жодну знахідку не спростовано повністю: кожну підтверджено на коді до патча — здебільшого тестом, що відтворює ваду, а частину інтерфейсних виправлень перевіркою коду (такі записи позначено). Спростовано лише окремі підпункти пропозицій:',
    hRest: 'Частково виправлені й відкладені',
    restUitleg: 'Тут лише загальна суть того, що лишилося, і що робити до наступного випуску; подробиці, які полегшили б атаку, свідомо не наводяться.',
    geenRest: 'Немає.',
    hMethode: 'Як перевірено',
    methode: (v) => [
      `Аудит охопив 13 ділянок; кожну знахідку з основного аудиту (${v.audit}) і додаткових пошуків (${v.aanvullend}) розподілено між ${v.groepen} групами патчів.`,
      'Для кожної знахідки інженер спершу написав тест, що відтворює ваду на коді до патча й падає, а потім зробив мінімальний патч у першопричині; той самий тест після патча зелений. Код «до патча» — це встановлена версія, на якій почалася робота.',
      `Кожну групу незалежно перевірив окремий перевіряльник: відтворював вади, шукав обхід патчів і ту саму ваду в сусідньому коді. Його зауваження (${v.toets} визнано вадами) інженер підтверджував новим тестом, виправляв і отримував повторну перевірку.`,
      `Наприкінці ${v.afwerking} завершальні кроки доробили відкладене, що зачіпало кілька груп (сервер і безпека, інтерфейс і тексти, ланцюг постачання й документація), з власними тестами й повною перевіркою типів.`,
      ...(v.eind ? [`Потім ${v.eind} наскрізні перевіряльники перевірили весь випуск разом (обхід і повнота, регресії законних сценаріїв, інтерфейс і мова); знайдене (записи eind-…) виправлено до випуску й доведено тестами.`] : []),
      `Тести, що доводять виправлення, лежать у теці \`tests/eenheid/\` (файлів тестів, названих у записах: ${v.tests}); їх можна запустити самостійно.${v.scripts.length ? ` Окремо одне виправлення доводить сценарій перевірки під час збирання (${v.scripts.map((x) => '\`' + x + '\`').join(', ')}).` : ''}`,
      ...(v.code ? [`Частину виправлень інтерфейсу (записів, позначених «доведено перевіркою коду»: ${v.code}) доведено перевіркою коду й статичними перевірками, а не тестом, що падає до патча.`] : []),
    ],
    hGedrag: 'Що змінено в поведінці для законних користувачів',
    gedragUitleg: 'Ці зміни свідомі: вони можуть бути помітні в щоденній роботі.',
    waarom: 'Чому',
    lAardBasis: 'Стара вада основи, без впливу на безпеку', lBewijsCode: 'Доведено перевіркою коду, без тесту, що падає до патча', lWat: 'Що було не так', lGevolg: 'Хто міг скористатися й наслідок', lHerstel: 'Що змінено', lTest: 'Тест', lZie: 'Та сама першопричина', lBij: 'Стосується', lRest: 'Що лишилося й що робити', lStand: 'Стан', lErnst: 'Вага', lAard: 'Регресія патча',
  },
  nl: {
    schakel: (d) => `> 🌐 **Taal / Мова:** [Українська](${d.uk}) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)`,
    titel: 'Beveiligingsrapport SEC-002 (12-11-2026): gevonden kwetsbaarheden en hun herstel',
    intro: (n) => `Dit rapport beschrijft openlijk de kwetsbaarheden die bij een diepe beveiligingsaudit van de hele repository «Mijn Ruimte» (taak SEC-002) zijn gevonden, en hoe ze zijn hersteld. De beschrijving verschijnt tegelijk met de patches en het releasearchief, zodat iedereen die het project zelf draait van het gevaar weet en bijwerkt. Er staan geen waarden van geheimen, geen privégegevens en geen stapsgewijze aanvalsrecepten in: alleen de kern van elke fout, wie die kon misbruiken, het gevolg en wat er is veranderd. Aantal vermeldingen: **${n}**.`,
    gegenereerd: 'Dit document is gemaakt door het script `scripts/sec-002-verslag.mjs` uit het gegevensbestand [`sec-002-gegevens.json`](sec-002-gegevens.json); bewerk het niet met de hand.',
    hDoel: 'Voor wie dit rapport is en wat te doen',
    doel: (u) => [
      `**Werk bij naar de release SEC-002:** ${u}. Eerdere versies bevatten de hieronder beschreven kwetsbaarheden.`,
      'De nieuwe databasemigraties van deze release worden bij een gewone installatie van de update toegepast; er zijn geen aparte stappen nodig.',
      'Werk de browserextensie bij naar versie 0.9.3 (daarin is de bescherming tegen AI-acties en het verbergen van geheimen gewijzigd).',
      'Bekijk na de update «Sessies» en de AI-koppelingen en trek alles in wat u niet kent; controleer de pagina «Beveiliging» — daar ziet u of extra aanmeldbevestigingen niet zijn uitgeschakeld.',
      'Draaiden er op uw server andere lokale gebruikers of AI-agenten die opdrachten mogen uitvoeren, wijzig dan het wachtwoord van de systeemrol van de database (zie server-uitrol-07). Gaf u het recht «update voorbereiden» aan externe accounts of een AI, overweeg dan de geheimen van de dienst te roteren volgens de procedure in het sleutelregister (zie server-uitrol-01).',
    ],
    doelVooral: 'Bijwerken is vooral belangrijk als:',
    vooral: ['uw site vanaf internet of een ander netwerk bereikbaar is;', 'de site meerdere gebruikers heeft (gezin, collega\'s, gasten);', 'u AI-agenten koppelt (MCP, tokens, agenten op apparaten);', 'u de browserextensie voor AI gebruikt.'],
    geenUitgave: 'het adres wordt bij de release toegevoegd',
    hCijfers: 'Korte samenvatting in cijfers',
    kolCijfers: ['Kenmerk', 'Aantal'],
    rijAudit: 'Bevindingen van de audit', rijAuditUitleg: (a, b) => `${a + b} (hoofdaudit ${a}, aanvullend onderzoek ${b})`,
    rijErnst: (e) => `— met ernst «${ERNSTLABEL.nl[e]}»`,
    rijStand: (s) => `— ${STANDLABEL.nl[s]}`,
    rijToets: 'Nieuwe fouten die onafhankelijke controleurs in patches en naburige code vonden',
    rijToetsUitleg: (n, r, b) => `${n} (waarvan regressies door patches zonder direct beveiligingsgevolg: ${r}; oude fouten uit de basis zonder beveiligingsgevolg: ${b})`,
    rijToetsStand: (s) => `— nieuwe fouten: ${STANDLABEL.nl[s]}`,
    zelfde: (n) => `Een deel van de bevindingen beschrijft dezelfde grondoorzaak vanuit verschillende gebieden (${n} zulke groepen); in de vermeldingen staat dat bij «Dezelfde grondoorzaak».`,
    hGebieden: 'Tabel per gebied',
    kolGebieden: ['Gebied', 'Bevindingen', 'Hoog', 'Middel', 'Laag', 'Opgelost', 'Gedeeltelijk', 'Uitgesteld', 'Nieuwe fouten van controleurs'],
    totaal: 'Totaal',
    hBelangrijk: 'Belangrijkste herstelwerk (alles met ernst hoog)',
    belangrijkUitleg: 'Volledige beschrijvingen staan in de onderstaande hoofdstukken.',
    nieuwKort: 'nieuwe fout, gevonden door een controleur',
    hOpgelost: 'Alle opgeloste bevindingen per gebied',
    hToets: 'Nieuwe fouten gevonden door controleurs (opgelost)',
    toetsUitleg: 'Elke patchgroep is door een onafhankelijke controleur nagekeken. Hieronder staan de fouten die hij in de patches zelf of in naburige code vond en die vóór de release zijn hersteld. Regressies zijn fouten van patches in legitiem gebruik zonder direct beveiligingsgevolg.',
    hWeerlegd: 'Weerlegde bevindingen',
    geenWeerlegd: 'Geen enkele bevinding is volledig weerlegd: elke bevinding is op de code van vóór de patch bevestigd — meestal met een test die de fout aantoont, een deel van het interfaceherstel met een controle van de code (zulke vermeldingen zijn gemarkeerd). Alleen enkele onderdelen van voorstellen zijn weerlegd:',
    hRest: 'Gedeeltelijk opgelost en uitgesteld',
    restUitleg: 'Hier staat alleen de algemene kern van wat overblijft en wat u tot de volgende release kunt doen; details die een aanval zouden vergemakkelijken, zijn bewust weggelaten.',
    geenRest: 'Geen.',
    hMethode: 'Hoe is gecontroleerd',
    methode: (v) => [
      `De audit besloeg 13 gebieden; elke bevinding uit de hoofdaudit (${v.audit}) en het aanvullend onderzoek (${v.aanvullend}) is over ${v.groepen} patchgroepen verdeeld.`,
      'Voor elke bevinding schreef de engineer eerst een test die de fout op de code van vóór de patch aantoont en faalt, en maakte daarna een minimale patch in de grondoorzaak; dezelfde test is na de patch groen. De code «vóór de patch» is de geïnstalleerde versie waarop het werk begon.',
      `Elke groep is onafhankelijk nagekeken door een aparte controleur: die toonde fouten opnieuw aan, zocht omwegen om patches heen en dezelfde fout in naburige code. Zijn opmerkingen (${v.toets} als fout erkend) bevestigde de engineer met een nieuwe test, herstelde ze en liet ze opnieuw controleren.`,
      `Tot slot rondden ${v.afwerking} afrondingsstappen uitgesteld werk af dat meerdere groepen raakte (server en beveiliging, interface en teksten, toeleveringsketen en documentatie), met eigen tests en een volledige typecontrole.`,
      ...(v.eind ? [`Daarna controleerden ${v.eind} overkoepelende controleurs de hele release samen (omzeiling en volledigheid, regressies in legitiem gebruik, interface en taal); wat zij vonden (vermeldingen eind-…) is vóór de release hersteld en met tests aangetoond.`] : []),
      `De tests die het herstel aantonen staan in de map \`tests/eenheid/\` (aantal testbestanden genoemd in de vermeldingen: ${v.tests}); u kunt ze zelf uitvoeren.${v.scripts.length ? ` Eén herstel wordt apart aangetoond door een controlescript tijdens de build (${v.scripts.map((x) => '\`' + x + '\`').join(', ')}).` : ''}`,
      ...(v.code ? [`Een deel van het interfaceherstel (vermeldingen gemarkeerd met «aangetoond met een codecontrole»: ${v.code}) is aangetoond met een controle van de code en statische controles, niet met een test die vóór de patch faalt.`] : []),
    ],
    hGedrag: 'Wat er verandert voor legitieme gebruikers',
    gedragUitleg: 'Deze wijzigingen zijn bewust: ze kunnen in het dagelijks gebruik opvallen.',
    waarom: 'Waarom',
    lAardBasis: 'Oude fout uit de basis, zonder beveiligingsgevolg', lBewijsCode: 'Aangetoond met een codecontrole, zonder test die vóór de patch faalt', lWat: 'Wat er mis was', lGevolg: 'Wie het kon misbruiken en het gevolg', lHerstel: 'Wat is veranderd', lTest: 'Test', lZie: 'Dezelfde grondoorzaak', lBij: 'Hoort bij', lRest: 'Wat overblijft en wat te doen', lStand: 'Status', lErnst: 'Ernst', lAard: 'Regressie door de patch',
  },
};
const ERNSTLABEL = { uk: { hoog: 'висока', midden: 'середня', laag: 'низька' }, nl: { hoog: 'hoog', midden: 'middel', laag: 'laag' } };
const STANDLABEL = { uk: { opgelost: 'виправлено', gedeeltelijk: 'частково', weerlegd: 'спростовано', uitgesteld: 'відкладено' }, nl: { opgelost: 'opgelost', gedeeltelijk: 'gedeeltelijk opgelost', weerlegd: 'weerlegd', uitgesteld: 'uitgesteld' } };

// ---------- перевірка даних ----------
function controleerGegevens(g) {
  const fouten = [];
  const gebieden = new Set((g.gebieden || []).map((x) => x.id));
  if (gebieden.size !== 13) fouten.push(`очікується 13 ділянок, є ${gebieden.size}`);
  for (const x of g.gebieden || []) if (!x.uk || !x.nl) fouten.push(`ділянка ${x.id}: немає назви uk/nl`);
  const ids = new Set();
  for (const b of g.bevindingen || []) {
    if (ids.has(b.id)) fouten.push(`${b.id}: повторюється`);
    ids.add(b.id);
    if (!STANDEN.includes(b.stand)) fouten.push(`${b.id}: немає стану або стан невідомий (${b.stand})`);
    if (!ERNST.includes(b.ernst)) fouten.push(`${b.id}: невідома вага (${b.ernst})`);
    if (!BRONNEN.includes(b.bron)) fouten.push(`${b.id}: невідоме джерело (${b.bron})`);
    if (!gebieden.has(b.gebied)) fouten.push(`${b.id}: невідома ділянка (${b.gebied})`);
    if (!b.test) fouten.push(`${b.id}: немає тестового файла`);
    if (b.testen !== undefined && (!Array.isArray(b.testen) || b.testen.some((x) => typeof x !== 'string' || !x))) fouten.push(`${b.id}: поле testen має бути переліком шляхів`);
    if (!['beveiliging', 'regressie', 'basis'].includes(b.aard)) fouten.push(`${b.id}: невідомий вид (${b.aard})`);
    if (b.bewijs !== undefined && b.bewijs !== 'code') fouten.push(`${b.id}: невідоме поле bewijs (${b.bewijs})`);
    for (const taal of ['uk', 'nl']) {
      for (const v of VELDEN) if (!String(b[taal]?.[v] || '').trim()) fouten.push(`${b.id}: немає ${taal}.${v}${taal === 'nl' ? ' (переклад)' : ''}`);
      if ((b.stand === 'gedeeltelijk' || b.stand === 'uitgesteld') && !String(b[taal]?.rest || '').trim()) fouten.push(`${b.id}: немає ${taal}.rest для стану ${b.stand}`);
    }
    for (const z of b.zie || []) if (!(g.bevindingen || []).some((x) => x.id === z)) fouten.push(`${b.id}: посилання на невідомий ${z}`);
  }
  for (const d of g.gedrag || []) for (const taal of ['uk', 'nl']) if (!d[taal]?.titel || !d[taal]?.tekst || !d[taal]?.waarom) fouten.push(`розділ поведінки: бракує ${taal}`);
  for (const d of g.deelweerlegd || []) if (!d.uk || !d.nl) fouten.push(`спростований підпункт ${d.id}: бракує перекладу`);
  return fouten;
}

// ---------- побудова документа ----------
const tel = (lijst, f) => lijst.filter(f).length;
const rij = (cellen) => `| ${cellen.join(' | ')} |`;
const kop = (cellen) => [rij(cellen), rij(cellen.map(() => '---'))];
const testLink = (p) => `[\`${p.split('/').pop()}\`](../../${p})`;

function maakDocument(g, taal, uitgaveAdres) {
  const t = T[taal];
  const alle = g.bevindingen;
  const vond = alle.filter((b) => b.bron !== 'toets');
  const toets = alle.filter((b) => b.bron === 'toets');
  const gebiedNaam = Object.fromEntries(g.gebieden.map((x) => [x.id, x[taal]]));
  const ernstLabel = ERNSTLABEL[taal];
  const standLabel = STANDLABEL[taal];
  const u = uitgaveAdres ? `<${uitgaveAdres}>` : `_${t.geenUitgave}_`;
  const regels = [];
  const p = (...r) => regels.push(...r);

  // Повний запис однієї знахідки — рівно один раз у документі.
  const volledig = (b, metRest) => {
    const x = b[taal];
    const kenmerken = [`${t.lErnst}: ${ernstLabel[b.ernst]}`, `${t.lStand}: ${standLabel[b.stand]}`];
    if (b.aard === 'regressie') kenmerken.push(t.lAard);
    if (b.aard === 'basis') kenmerken.push(t.lAardBasis);
    if (b.bewijs === 'code') kenmerken.push(t.lBewijsCode);
    p(`#### ${b.id} · ${x.titel}`, '', `_${kenmerken.join(' · ')}_`, '');
    p(`- **${t.lWat}.** ${x.wat}`);
    p(`- **${t.lGevolg}.** ${x.gevolg}`);
    p(`- **${t.lHerstel}.** ${x.herstel}`);
    if (metRest && x.rest) p(`- **${t.lRest}.** ${x.rest}`);
    if (b.bij) p(`- **${t.lBij}:** ${b.bij}`);
    if (b.zie?.length) p(`- **${t.lZie}:** ${b.zie.join(', ')}`);
    p(`- **${t.lTest}:** ${[b.test, ...(b.testen || [])].map(testLink).join(', ')}`, '');
  };

  p(t.schakel(g.document), '', `# ${t.titel}`, '', t.intro(alle.length), '', t.gegenereerd, '');

  // Для кого й що робити.
  p(`## ${t.hDoel}`, '');
  t.doel(u).forEach((r, i) => p(`${i + 1}. ${r}`));
  p('', t.doelVooral, '', ...t.vooral.map((r) => `- ${r}`), '');

  // Цифри.
  p(`## ${t.hCijfers}`, '', ...kop(t.kolCijfers));
  const nAudit = tel(vond, (b) => b.bron === 'audit');
  const nAanv = tel(vond, (b) => b.bron === 'aanvullend');
  p(rij([t.rijAudit, t.rijAuditUitleg(nAudit, nAanv)]));
  for (const e of ERNST) p(rij([t.rijErnst(e), String(tel(vond, (b) => b.ernst === e))]));
  for (const s of STANDEN) p(rij([t.rijStand(s), String(tel(vond, (b) => b.stand === s))]));
  p(rij([t.rijToets, t.rijToetsUitleg(toets.length, tel(toets, (b) => b.aard === 'regressie'), tel(toets, (b) => b.aard === 'basis'))]));
  for (const s of STANDEN) p(rij([t.rijToetsStand(s), String(tel(toets, (b) => b.stand === s))]));
  const groepenZelfde = new Set(vond.filter((b) => b.zie?.length).map((b) => [b.id, ...b.zie].sort().join(','))).size;
  p('', t.zelfde(groepenZelfde), '');

  // Таблиця за ділянками.
  p(`## ${t.hGebieden}`, '', ...kop(t.kolGebieden));
  const kolommen = (l, tl) => [l.length, ...ERNST.map((e) => tel(l, (b) => b.ernst === e)), tel(l, (b) => b.stand === 'opgelost'), tel(l, (b) => b.stand === 'gedeeltelijk'), tel(l, (b) => b.stand === 'uitgesteld'), tl.length].map(String);
  for (const gb of g.gebieden) p(rij([gb[taal], ...kolommen(vond.filter((b) => b.gebied === gb.id), toets.filter((b) => b.gebied === gb.id))]));
  p(rij([`**${t.totaal}**`, ...kolommen(vond, toets).map((x) => `**${x}**`)]), '');

  // Найважливіші.
  p(`## ${t.hBelangrijk}`, '', t.belangrijkUitleg, '');
  for (const b of alle.filter((x) => x.ernst === 'hoog')) {
    const x = b[taal];
    p(`- **${b.id}** — ${x.titel}${b.bron === 'toets' ? ` _(${t.nieuwKort})_` : ''} (${standLabel[b.stand]}). ${x.herstel}`);
  }
  p('');

  // Усі виправлені за ділянками.
  p(`## ${t.hOpgelost}`, '');
  for (const gb of g.gebieden) {
    const l = vond.filter((b) => b.gebied === gb.id && b.stand === 'opgelost');
    if (!l.length) continue;
    p(`### ${gb[taal]}`, '');
    l.forEach((b) => volledig(b, false));
  }

  // Нові вади від перевіряльників.
  p(`## ${t.hToets}`, '', t.toetsUitleg, '');
  for (const gb of g.gebieden) {
    const l = toets.filter((b) => b.gebied === gb.id && b.stand === 'opgelost');
    if (!l.length) continue;
    p(`### ${gb[taal]}`, '');
    l.forEach((b) => volledig(b, false));
  }

  // Спростовані.
  p(`## ${t.hWeerlegd}`, '');
  const weerlegd = alle.filter((b) => b.stand === 'weerlegd');
  if (weerlegd.length) weerlegd.forEach((b) => volledig(b, true));
  else p(t.geenWeerlegd, '');
  for (const d of g.deelweerlegd || []) p(`- **${d.id}** — ${d[taal]}`);
  p('');

  // Частково й відкладені.
  p(`## ${t.hRest}`, '', t.restUitleg, '');
  const rest = alle.filter((b) => b.stand === 'gedeeltelijk' || b.stand === 'uitgesteld');
  if (!rest.length) p(t.geenRest, '');
  rest.forEach((b) => volledig(b, true));

  // Як перевірено.
  p(`## ${t.hMethode}`, '');
  const v = { audit: nAudit, aanvullend: nAanv, groepen: g.verificatie.groepen, toets: tel(toets, (b) => !b.id.startsWith('eind-')), afwerking: g.verificatie.afwerkingsstappen, eind: g.verificatie.eindcontroles || 0, tests: new Set(alle.flatMap((b) => [b.test, ...(b.testen || [])]).filter((x) => x.startsWith('tests/eenheid/'))).size, scripts: [...new Set(alle.flatMap((b) => [b.test, ...(b.testen || [])]).filter((x) => !x.startsWith('tests/eenheid/')))].sort(), code: tel(alle, (b) => b.bewijs === 'code') };
  t.methode(v).forEach((r) => p(`- ${r}`));
  p('');

  // Поведінка.
  p(`## ${t.hGedrag}`, '', t.gedragUitleg, '');
  for (const d of g.gedrag) p(`- **${d[taal].titel}.** ${d[taal].tekst} _${t.waarom}:_ ${d[taal].waarom}`);
  p('', `<!-- ${MARKER}: uitgave=${uitgaveAdres || ''} -->`, '');
  return regels.join('\n');
}

// ---------- запуск ----------
if (!existsSync(gegevensPad)) { console.error(`Немає файла даних / Geen gegevensbestand: ${gegevensPad}`); process.exit(1); }
const g = JSON.parse(readFileSync(gegevensPad, 'utf8'));
const fouten = controleerGegevens(g);
const paden = { uk: join(uitMap, g.document.uk), nl: join(uitMap, g.document.nl) };

if (controle && uitgave === undefined && existsSync(paden.uk)) {
  const m = readFileSync(paden.uk, 'utf8').match(new RegExp(`<!-- ${MARKER}: uitgave=([^ ]*) -->`));
  uitgave = m ? m[1] : '';
}
const documenten = { uk: maakDocument(g, 'uk', uitgave), nl: maakDocument(g, 'nl', uitgave) };

// Кількість повних записів у кожному документі = кількість записів у даних.
for (const taal of ['uk', 'nl']) {
  const n = (documenten[taal].match(/^#### /gm) || []).length;
  if (n !== g.bevindingen.length) fouten.push(`${taal}: у документі ${n} записів, у даних ${g.bevindingen.length}`);
}

if (controle) {
  for (const taal of ['uk', 'nl']) {
    if (!existsSync(paden[taal])) fouten.push(`немає файла ${paden[taal]}`);
    else if (readFileSync(paden[taal], 'utf8') !== documenten[taal]) fouten.push(`${paden[taal]} відрізняється від згенерованого — запустіть генератор`);
  }
  if (fouten.length) { console.error('SEC-002-звіт: перевірка НЕ пройдена / controle MISLUKT'); for (const f of fouten) console.error(' - ' + f); process.exit(1); }
  console.log(`SEC-002-звіт: перевірка пройдена / controle geslaagd (${g.bevindingen.length} записів / vermeldingen)`);
  process.exit(0);
}
if (fouten.length) { console.error('SEC-002-звіт: дані неповні / gegevens onvolledig'); for (const f of fouten) console.error(' - ' + f); process.exit(1); }
writeFileSync(paden.uk, documenten.uk);
writeFileSync(paden.nl, documenten.nl);
const telStand = Object.fromEntries(STANDEN.map((s) => [s, tel(g.bevindingen, (b) => b.stand === s)]));
console.log(`Записано / geschreven: ${paden.uk}, ${paden.nl}`);
console.log(`Записів / vermeldingen: ${g.bevindingen.length}; стани / standen: ${JSON.stringify(telStand)}`);
