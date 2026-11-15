// VAARD-002 (15.11.2026): навички ШІ-агентів, метадані uk/nl, автоматичний добір і узгодженість із правилами координації.
// Draaien: node scripts/eenheidstests.mjs vaardigheden-20261115.test.ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
// @ts-expect-error — .mjs zonder typen
import { kiesVaardigheden, laadCatalogus, leesVaardigheid, leesVoorbeeld } from '../../scripts/vaardigheden/kies.mjs';
// @ts-expect-error — .mjs zonder typen
import { controleer as controleerKaart } from '../../scripts/kaart-controle.mjs';
import { valideerOntwikkelDossier } from '../../shared/ontwikkelarchief';

const VERWACHTE_VAARDIGHEDEN = [
  'project-verkennen',
  'site-ontwikkelen',
  'wijziging-controleren',
  'uitgave-voorbereiden',
  'ontwikkelgeheugen-bewaken',
  'koppelingen-echte-vorm-testen',
  'uiterlijk-van-schermafdruk-herstellen',
  'prestatie-meten',
] as const;

const MET_VOORBEELD = [
  'uitgave-voorbereiden',
  'koppelingen-echte-vorm-testen',
  'uiterlijk-van-schermafdruk-herstellen',
  'prestatie-meten',
] as const;

export async function main(): Promise<number> {
  const { check, einde } = checker('vaardigheden-20261115');
  const cat = laadCatalogus();

  // ------------------------------------------------------------------ 1. Каталог, файли SKILL.md та метадані uk/nl
  check('каталог містить рівно 8 очікуваних навичок',
    cat.vaardigheden.length === VERWACHTE_VAARDIGHEDEN.length
    && VERWACHTE_VAARDIGHEDEN.every((n) => cat.vaardigheden.some((v: { naam: string }) => v.naam === n)));

  for (const naam of VERWACHTE_VAARDIGHEDEN) {
    const tekst = leesVaardigheid(naam, cat);
    const kaartItem = cat.vaardigheden.find((v: { naam: string }) => v.naam === naam);
    check(`навичка ${naam}: непорожні підсумки uk і nl`,
      typeof kaartItem?.samenvatting?.uk === 'string' && kaartItem.samenvatting.uk.trim().length > 15
      && typeof kaartItem?.samenvatting?.nl === 'string' && kaartItem.samenvatting.nl.trim().length > 15
      && tekst.includes(`name: ${naam}\n`));
  }

  // ------------------------------------------------------------------ 2. Відтворювані приклади, обмеження, результати й передавання
  check('зразок передавання WERKOVERDRACHT.uk.md існує',
    existsSync('.agents/skills/ontwikkelgeheugen-bewaken/WERKOVERDRACHT.uk.md'));

  for (const naam of MET_VOORBEELD) {
    const vb = leesVoorbeeld(naam, cat);
    check(`приклад ${naam}/VOORBEELD.uk.md містить обмеження, результати й передавання`,
      vb.includes('Перевірені обмеження')
      && vb.includes('Фактично спостережені результати')
      && vb.includes('WERKOVERDRACHT'));
  }

  const vbUitgave = leesVoorbeeld('uitgave-voorbereiden', cat);
  check('приклад uitgave-voorbereiden охоплює окремо напрям 1 (збирання) і напрям 5 (встановлення/повернення)',
    vbUitgave.includes('Напрям 1') && vbUitgave.includes('Напрям 5'));

  // ------------------------------------------------------------------ 3. Автоматичний добір (uk + nl) по всіх 8 навичках і 5 напрямах
  const proeven: Array<[string, string, string]> = [
    ['uk-напрям1-випуск', 'підготуй випуск і перевір каталог пошуку та міграції', 'uitgave-voorbereiden'],
    ['nl-richting1-uitgave', 'bereid een uitgave voor en controleer migraties en zoekcatalogus', 'uitgave-voorbereiden'],
    ['uk-напрям5-встановлення', 'пам’ятка встановлення: перевір запасні копії на R:\\ та відкат версії', 'uitgave-voorbereiden'],
    ['nl-richting5-installatie', 'controleer reservekopieën vóór installeren en terugdraaien na updates', 'uitgave-voorbereiden'],
    ['uk-напрям4-підключення', 'перевір підключення Telegram initData з signature і пошту IMAP на справжніх даних', 'koppelingen-echte-vorm-testen'],
    ['nl-richting4-koppeling', 'test telegram initdata met signature en imap op echte berichten en randgevallen', 'koppelingen-echte-vorm-testen'],
    ['uk-напрям2-знімок', 'виправ за знімком екрана гострі кути на вузькому екрані в темній темі двома мовами', 'uiterlijk-van-schermafdruk-herstellen'],
    ['nl-richting2-schermafdruk', 'herstel uiterlijke fout vanaf schermafdruk op smal scherm in licht en donker thema', 'uiterlijk-van-schermafdruk-herstellen'],
    ['uk-напрям3-швидкодія', 'виміряй швидкодію на умовно повільному телефоні з навантаженням процесора й похибкою', 'prestatie-meten'],
    ['nl-richting3-prestatie', 'meet prestaties op een trage telefoon met cpu beperking en foutmarge', 'prestatie-meten'],
    ['uk-памʼять', 'зафіксуй ідею в пам’ять розвитку та підготуй передавання роботи іншому агенту', 'ontwikkelgeheugen-bewaken'],
    ['nl-geheugen', 'bewaar idee in ontwikkelgeheugen en maak werkoverdracht voor andere agent', 'ontwikkelgeheugen-bewaken'],
    ['uk-огляд', 'оглянь проєкт і де розташовано служби без змін', 'project-verkennen'],
    ['nl-verkennen', 'verken projectopbouw en waar staat de dienst', 'project-verkennen'],
    ['uk-розробка', 'створи сторінку і додай розділ із кнопками', 'site-ontwikkelen'],
    ['nl-ontwikkelen', 'ontwikkel nieuwe pagina en knoppen op website', 'site-ontwikkelen'],
    ['uk-перевірка', 'перевір зміни на безпеку й готовність', 'wijziging-controleren'],
    ['nl-controleren', 'controleer wijzigingen op kwaliteit en beveiliging', 'wijziging-controleren'],
  ];

  for (const [label, vraag, verwacht] of proeven) {
    const uit = kiesVaardigheden(vraag, { catalogus: cat });
    check(`добір ${label} → перша навичка ${verwacht}`,
      uit.length > 0 && uit[0].naam === verwacht,
      uit.map((u: { naam: string; score: number }) => `${u.naam}(${u.score})`).join(', '));
  }

  // ------------------------------------------------------------------ 4. Межі повноважень і межові вхідні дані
  check('порожній або пробільний запит повертає []',
    kiesVaardigheden('', { catalogus: cat }).length === 0
    && kiesVaardigheden('   \n\t ', { catalogus: cat }).length === 0);

  check('параметр maximum обмежує кількість пропозицій (1..10)',
    kiesVaardigheden('випуск підключення знімок швидкодія сайт', { catalogus: cat, maximum: 2 }).length <= 2);

  const zonderMiddelen = kiesVaardigheden('підготуй випуск', { catalogus: cat });
  const metMiddel = kiesVaardigheden('підготуй випуск', { catalogus: cat, zichtbareHulpmiddelen: ['uitrol_voorstel_begin'] });
  const zonderNodigMiddel = kiesVaardigheden('підготуй випуск', { catalogus: cat, zichtbareHulpmiddelen: ['orch_overzicht'] });
  check('видимі інструменти відображають статус підключення без підміни прав',
    zonderMiddelen[0]?.aansluiting === 'onbekend'
    && metMiddel[0]?.aansluiting === 'hulpmiddelen_aanwezig'
    && zonderNodigMiddel[0]?.aansluiting === 'hulpmiddelen_ontbreken'
    && zonderNodigMiddel[0]?.ontbrekendeHulpmiddelen.includes('uitrol_voorstel_begin'));

  // ------------------------------------------------------------------ 5. Відмови при зіпсованих даних і обходах шляхів
  const tijdelijk = mkdtempSync(join(tmpdir(), 'vaard-proef-'));
  try {
    const foutPad = join(tijdelijk, 'slecht.json');
    writeFileSync(foutPad, JSON.stringify({
      schema: 1,
      vaardigheden: [{ naam: 'slecht', pad: '../geheim', samenvatting: { uk: 'а', nl: 'b' }, termen: { uk: [], nl: [] }, vereisteHulpmiddelen: [] }],
    }));
    let errPad = '';
    try { laadCatalogus(foutPad); } catch (e) { errPad = (e as Error).message; }
    check('небезпечний шлях у каталозі → VAARD_CATALOGUS_ONGELDIG', errPad === 'VAARD_CATALOGUS_ONGELDIG');

    let errOnbekend = '';
    try { leesVaardigheid('bestaat-niet', cat); } catch (e) { errOnbekend = (e as Error).message; }
    check('неіснуюча навичка → VAARD_NIET_GEVONDEN', errOnbekend === 'VAARD_NIET_GEVONDEN');

    mkdirSync(join(tijdelijk, '.agents/skills/nep-kaart'), { recursive: true });
    writeFileSync(join(tijdelijk, '.agents/skills/nep-kaart/SKILL.md'), '---\nname: nep-kaart\ndescription: Alleen Nederlands\n---\n');
    const nepCat = {
      schema: 1,
      vaardigheden: [{
        naam: 'nep-kaart',
        pad: '.agents/skills/nep-kaart/SKILL.md',
        samenvatting: { uk: 'Перевірка опису', nl: 'Controle beschrijving' },
        termen: { uk: ['перевірка'], nl: ['controle'] },
        vereisteHulpmiddelen: [],
      }],
    };
    let errTaal = '';
    try { leesVaardigheid('nep-kaart', nepCat, tijdelijk); } catch (e) { errTaal = (e as Error).message; }
    check('одномовний description у SKILL.md → VAARD_INHOUD_ONGELDIG', errTaal === 'VAARD_INHOUD_ONGELDIG');
  } finally {
    rmSync(tijdelijk, { recursive: true, force: true });
  }

  // ------------------------------------------------------------------ 6. Узгодженість правил і заборони суперечностей
  const uitgave = leesVaardigheid('uitgave-voorbereiden', cat);
  check('uitgave-voorbereiden: PostgreSQL 18.6 (без згадки 16), zoek-ui-catalogus, ONTWIKKELARCHIEF, R:\\, ключ доступу, заплановані GitHub/Telegram',
    uitgave.includes('PostgreSQL 18.6')
    && !uitgave.includes('PostgreSQL 16')
    && uitgave.includes('zoek-ui-catalogus')
    && uitgave.includes('ONTWIKKELARCHIEF')
    && uitgave.includes('R:\\mijn-ruimte-reservekopie\\')
    && uitgave.includes('міграції БД автоматично не скасовуються')
    && uitgave.includes('запланованим напрямом')
    && uitgave.includes('поки не працює'));

  const kop = leesVaardigheid('koppelingen-echte-vorm-testen', cat);
  check('koppelingen-echte-vorm-testen: справжня будова, знеособлення, signature, IMAP/Dovecot, TLS, повтори/відмови',
    kop.includes('signature')
    && kop.includes('Dovecot')
    && kop.includes('TLS')
    && kop.includes('app.tg_updates')
    && kop.includes('SLEUTEL_GESLOTEN'));

  const uit = leesVaardigheid('uiterlijk-van-schermafdruk-herstellen', cat);
  check('uiterlijk-van-schermafdruk-herstellen: заборона сліпого перенесення вниз, cssCodeSplit, mobiel.css, !important, теми, обидві мови',
    uit.includes('cssCodeSplit: true')
    && uit.includes('mobiel.css')
    && uit.includes('!important')
    && uit.includes('gedeelde-voorkeuren.ts')
    && uit.includes('plaatsing-vaste-elementen.json')
    && uit.includes('360–390 px')
    && uit.includes('1280–1920 px'));

  const prest = leesVoorbeeld('prestatie-meten', cat) && leesVaardigheid('prestatie-meten', cat);
  check('prestatie-meten: заборона субʼєктивних оцінок, 4× CPU, RTT, холодний/теплий, медіана й похибка',
    leesVaardigheid('prestatie-meten', cat).includes('суб’єктивне враження')
    && leesVaardigheid('prestatie-meten', cat).includes('4× CPU')
    && leesVaardigheid('prestatie-meten', cat).includes('RTT')
    && leesVaardigheid('prestatie-meten', cat).includes('холодний вхід')
    && leesVaardigheid('prestatie-meten', cat).includes('похибк')
    && typeof prest === 'string');

  const dossierPad = 'orchestratie/ontwikkelarchieven/VAARD-002.json';
  const dossierFouten = existsSync(dossierPad)
    ? valideerOntwikkelDossier(JSON.parse(readFileSync(dossierPad, 'utf8')), 'VAARD-002')
    : ['dossier ontbreekt'];
  check('TRACE-001: доказове досьє VAARD-002.json валідне',
    dossierFouten.length === 0,
    dossierFouten.join(', '));

  // ------------------------------------------------------------------ 7. Чистота мовного закону та карти файлів
  const teControlerenBestanden = [
    '.agents/skills/project-verkennen/SKILL.md',
    '.agents/skills/site-ontwikkelen/SKILL.md',
    '.agents/skills/wijziging-controleren/SKILL.md',
    '.agents/skills/ontwikkelgeheugen-bewaken/SKILL.md',
    '.agents/skills/ontwikkelgeheugen-bewaken/WERKOVERDRACHT.uk.md',
    '.agents/skills/uitgave-voorbereiden/SKILL.md',
    '.agents/skills/uitgave-voorbereiden/VOORBEELD.uk.md',
    '.agents/skills/koppelingen-echte-vorm-testen/SKILL.md',
    '.agents/skills/koppelingen-echte-vorm-testen/VOORBEELD.uk.md',
    '.agents/skills/uiterlijk-van-schermafdruk-herstellen/SKILL.md',
    '.agents/skills/uiterlijk-van-schermafdruk-herstellen/VOORBEELD.uk.md',
    '.agents/skills/prestatie-meten/SKILL.md',
    '.agents/skills/prestatie-meten/VOORBEELD.uk.md',
    'scripts/vaardigheden/catalogus.json',
    'scripts/vaardigheden/kies.mjs',
    'orchestratie/ontwikkelarchieven/VAARD-002.json',
    'orchestratie/taken/VAARD-002.json',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const jargon = new RegExp('(?:^|[^\\p{L}])(' + ['баг', 'баги', 'фікс', 'фікси', 'білд', 'деплой', 'коміт', 'бренч', 'пул-?реквест', 'таска', 'таску', 'фіча', 'фічі', 'кеш', 'мікрокешування', 'бекап', 'дефолтн', 'кастомн', 'апдейт', 'скріншот', 'лейаут', 'вотерфол', 'таймаут', 'чек-?ліст', 'дедуплікація'].join('|') + ')(?:[^\\p{L}]|$)', 'iu');

  const slechteTaal = teControlerenBestanden.filter((p) => {
    const s = readFileSync(p, 'utf8');
    return ruTekens.test(s) || jargon.test(s);
  });
  const testInhoud = readFileSync('tests/eenheid/vaardigheden-20261115.test.ts', 'utf8');
  check('усі файли навичок і добору чисті від російських літер і техно-сленгу',
    slechteTaal.length === 0 && !ruTekens.test(testInhoud),
    slechteTaal.join(', '));

  const kaartUitslag = controleerKaart(process.cwd());
  const eigenWaarschuwingen = kaartUitslag.waarschuwingen.filter((w: string) =>
    w.startsWith('scripts/vaardigheden/') || w.startsWith('tests/eenheid/vaardigheden-'));
  check('kaart-controle: 0 помилок і 0 попереджень на нових файлах vaardigheden',
    kaartUitslag.fouten.length === 0 && eigenWaarschuwingen.length === 0,
    [...kaartUitslag.fouten, ...eigenWaarschuwingen].join(' · '));

  return einde();
}
