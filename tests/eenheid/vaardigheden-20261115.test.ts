// VAARD-002 (15.11.2026): навички ШІ-агентів, метадані uk/nl, SemVer, залежності, точне розмежування <id>:<kant>, валідатор і узгодженість із правилами.
// Draaien: node scripts/eenheidstests.mjs vaardigheden-20261115.test.ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
// @ts-expect-error — .mjs zonder typen
import { kiesVaardigheden, laadCatalogus, leesVaardigheid, leesVoorbeeld } from '../../scripts/vaardigheden/kies.mjs';
// @ts-expect-error — .mjs zonder typen
import { valideerVaardigheden } from '../../scripts/vaardigheden/valideer.mjs';
// @ts-expect-error — .mjs zonder typen
import { controleer as controleerKaart } from '../../scripts/kaart-controle.mjs';
import { valideerOntwikkelDossier } from '../../shared/ontwikkelarchief';
import { taalwetOvertreding, zoekEnRankVaardigheden } from '../../shared/vaardigheden-ecosysteem';
import { leesIngebouwdeVaardigheden, maakGeheugenVaardighedenOpslag, resetVaardighedenCacheVoorTest } from '../../backend/vaardigheden-opslag';
import { vaardighedenRoutes } from '../../backend/vaardigheden-routes';

const VERWACHTE_VAARDIGHEDEN = [
  'project-verkennen',
  'site-ontwikkelen',
  'wijziging-controleren',
  'uitgave-voorbereiden',
  'ontwikkelgeheugen-bewaken',
  'koppelingen-echte-vorm-testen',
  'uiterlijk-van-schermafdruk-herstellen',
  'prestatie-meten',
  'mijn-ruimte',
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

  // ------------------------------------------------------------------ 1. Каталог, файли SKILL.md, SemVer та метадані uk/nl
  check('каталог містить рівно 9 очікуваних навичок',
    cat.vaardigheden.length === VERWACHTE_VAARDIGHEDEN.length
    && VERWACHTE_VAARDIGHEDEN.every((n) => cat.vaardigheden.some((v: { naam: string }) => v.naam === n)));

  for (const naam of VERWACHTE_VAARDIGHEDEN) {
    const tekst = leesVaardigheid(naam, cat);
    const kaartItem = cat.vaardigheden.find((v: { naam: string }) => v.naam === naam);
    check(`навичка ${naam}: непорожні підсумки uk і nl та SemVer`,
      typeof kaartItem?.samenvatting?.uk === 'string' && kaartItem.samenvatting.uk.trim().length > 15
      && typeof kaartItem?.samenvatting?.nl === 'string' && kaartItem.samenvatting.nl.trim().length > 15
      && typeof kaartItem?.versie === 'string' && /^\d+\.\d+\.\d+$/.test(kaartItem.versie)
      && Array.isArray(kaartItem?.afhankelijkheden)
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

  // ------------------------------------------------------------------ 3. Автоматичний добір (uk + nl) по всіх 9 навичках
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
    ['uk-мій-простір', 'налаштуй з’єднувач antigravity, autoclaw і розширення оглядача через mcp міст', 'mijn-ruimte'],
    ['nl-mijn-ruimte', 'koppel antigravity connector, autoclaw en browserextensie via tweerichtingsbrug', 'mijn-ruimte'],
  ];

  for (const [label, vraag, verwacht] of proeven) {
    const uit = kiesVaardigheden(vraag, { catalogus: cat });
    check(`добір ${label} → перша навичка ${verwacht}`,
      uit.length > 0 && uit[0].naam === verwacht,
      uit.map((u: { naam: string; score: number }) => `${u.naam}(${u.score})`).join(', '));
  }

  // ------------------------------------------------------------------ 4. Межі повноважень, точне <id>:<kant> і зворотна сумісність
  check('порожній або пробільний запит повертає []',
    kiesVaardigheden('', { catalogus: cat }).length === 0
    && kiesVaardigheden('   \n\t ', { catalogus: cat }).length === 0);

  check('параметр maximum обмежує кількість пропозицій (1..10)',
    kiesVaardigheden('випуск підключення знімок швидкодія сайт', { catalogus: cat, maximum: 2 }).length <= 2);

  const zonderMiddelen = kiesVaardigheden('підготуй випуск', { catalogus: cat });
  const metExactBeheer = kiesVaardigheden('підготуй випуск', { catalogus: cat, zichtbareHulpmiddelen: ['uitrol_voorstel_begin:beheer'] });
  const metVerkeerdeKant = kiesVaardigheden('підготуй випуск', { catalogus: cat, zichtbareHulpmiddelen: ['uitrol_voorstel_begin:gebruiker'] });
  const zonderNodigMiddel = kiesVaardigheden('підготуй випуск', { catalogus: cat, zichtbareHulpmiddelen: ['orch_overzicht:beheer'] });
  check('kiesVaardigheden точно розрізняє :beheer від :gebruiker без підміни прав',
    zonderMiddelen[0]?.aansluiting === 'onbekend'
    && metExactBeheer[0]?.aansluiting === 'hulpmiddelen_aanwezig'
    && metVerkeerdeKant[0]?.aansluiting === 'hulpmiddelen_ontbreken'
    && metVerkeerdeKant[0]?.ontbrekendeHulpmiddelen.includes('uitrol_voorstel_begin:beheer')
    && zonderNodigMiddel[0]?.aansluiting === 'hulpmiddelen_ontbreken'
    && zonderNodigMiddel[0]?.ontbrekendeHulpmiddelen.includes('uitrol_voorstel_begin:beheer'));

  resetVaardighedenCacheVoorTest();
  const ingebouwd = leesIngebouwdeVaardigheden();
  const ecoFoutKant = zoekEnRankVaardigheden('підготуй випуск', ingebouwd, {
    ruimte: 'technisch',
    zichtbareHulpmiddelen: ['uitrol_voorstel_begin:gebruiker'],
  });
  const ecoJuistKant = zoekEnRankVaardigheden('підготуй випуск', ingebouwd, {
    ruimte: 'technisch',
    zichtbareHulpmiddelen: ['uitrol_voorstel_begin:beheer'],
  });
  check('zoekEnRankVaardigheden розрізняє <id>:<kant> і повертає versieSemver + afhankelijkheden',
    ecoFoutKant[0]?.id === 'uitgave-voorbereiden'
    && ecoFoutKant[0]?.aansluiting === 'hulpmiddelen_ontbreken'
    && ecoFoutKant[0]?.ontbrekendeHulpmiddelen.includes('uitrol_voorstel_begin:beheer')
    && ecoJuistKant[0]?.aansluiting === 'hulpmiddelen_aanwezig'
    && ecoJuistKant[0]?.versieSemver === '1.0.0'
    && Array.isArray(ecoJuistKant[0]?.afhankelijkheden)
    && ecoJuistKant[0]?.afhankelijkheden?.includes('wijziging-controleren'));

  // Перевірка повної маршрутизації через HTTP-маршрут /api/owner/vaardigheden/aanbevelen (ключі <id>:<kant> не обрізаються)
  const routeHandler = vaardighedenRoutes({
    requireSession: async () => ({ service: 'mcp', user: { id: 'u-vaard', status: 'approved', role: 'owner', entitlements: ['api-platform'] } }),
    opslag: maakGeheugenVaardighedenOpslag(),
    ladeVoor: async (uid) => ({ ok: true, userId: uid, ruimte: 'technisch' }),
    limiet: async () => true,
    audit: async () => undefined,
    meldWijziging: () => undefined,
    zichtbareHulpmiddelenVoor: async (_uid, slug) => (slug === 'gemini' ? ['uitrol_voorstel_begin:beheer'] : ['uitrol_voorstel_begin:gebruiker']),
  })['POST /api/owner/vaardigheden/aanbevelen'][0];
  const rGemini = JSON.parse((await routeHandler({ event: { headers: {} }, body: { vraag: 'підготуй випуск', agent: 'gemini', leesId: 'uitgave-voorbereiden' } } as never) as { body: string }).body);
  const rClaude = JSON.parse((await routeHandler({ event: { headers: {} }, body: { vraag: 'підготуй випуск', agent: 'claude' } } as never) as { body: string }).body);
  check('маршрут /api/owner/vaardigheden/aanbevelen зберігає точну сторону :beheer/:gebruiker',
    rGemini.aanbevelingen[0]?.aansluiting === 'hulpmiddelen_aanwezig'
    && rClaude.aanbevelingen[0]?.aansluiting === 'hulpmiddelen_ontbreken'
    && rClaude.aanbevelingen[0]?.ontbrekendeHulpmiddelen.includes('uitrol_voorstel_begin:beheer')
    && rGemini.gelezen?.versieSemver === '1.0.0');

  // ------------------------------------------------------------------ 5. Відмови при зіпсованих даних, циклічних залежностях і обходах шляхів
  const tijdelijk = mkdtempSync(join(tmpdir(), 'vaard-proef-'));
  try {
    const foutPad = join(tijdelijk, 'slecht.json');
    writeFileSync(foutPad, JSON.stringify({
      schema: 1,
      vaardigheden: [{ naam: 'slecht', pad: '../geheim', versie: '1.0.0', afhankelijkheden: [], samenvatting: { uk: 'а', nl: 'b' }, termen: { uk: [], nl: [] }, vereisteHulpmiddelen: [] }],
    }));
    let errPad = '';
    try { laadCatalogus(foutPad); } catch (e) { errPad = (e as Error).message; }
    check('небезпечний шлях у каталозі → VAARD_CATALOGUS_ONGELDIG', errPad === 'VAARD_CATALOGUS_ONGELDIG');

    const foutSemver = join(tijdelijk, 'slecht-semver.json');
    writeFileSync(foutSemver, JSON.stringify({
      schema: 1,
      vaardigheden: [{ naam: 'slecht-v', pad: '.agents/skills/slecht-v/SKILL.md', versie: 'v1', afhankelijkheden: [], samenvatting: { uk: 'Опис', nl: 'Uitleg' }, termen: { uk: [], nl: [] }, vereisteHulpmiddelen: [] }],
    }));
    let errSemver = '';
    try { laadCatalogus(foutSemver); } catch (e) { errSemver = (e as Error).message; }
    check('недійсна SemVer-версія → VAARD_CATALOGUS_ONGELDIG', errSemver === 'VAARD_CATALOGUS_ONGELDIG');

    const cyclusPad = join(tijdelijk, 'cyclus.json');
    writeFileSync(cyclusPad, JSON.stringify({
      schema: 1,
      vaardigheden: [
        { naam: 'een', pad: '.agents/skills/een/SKILL.md', versie: '1.0.0', afhankelijkheden: ['twee'], samenvatting: { uk: 'Один', nl: 'Een' }, termen: { uk: ['один'], nl: ['een'] }, vereisteHulpmiddelen: [] },
        { naam: 'twee', pad: '.agents/skills/twee/SKILL.md', versie: '1.0.0', afhankelijkheden: ['een'], samenvatting: { uk: 'Два', nl: 'Twee' }, termen: { uk: ['два'], nl: ['twee'] }, vereisteHulpmiddelen: [] },
      ],
    }));
    let errCyclus = '';
    try { laadCatalogus(cyclusPad); } catch (e) { errCyclus = (e as Error).message; }
    check('цикл залежностей у каталозі → VAARD_CATALOGUS_ONGELDIG', errCyclus === 'VAARD_CATALOGUS_ONGELDIG');

    let errOnbekend = '';
    try { leesVaardigheid('bestaat-niet', cat); } catch (e) { errOnbekend = (e as Error).message; }
    check('відсутня навичка → VAARD_NIET_GEVONDEN', errOnbekend === 'VAARD_NIET_GEVONDEN');

    mkdirSync(join(tijdelijk, '.agents/skills/nep-kaart'), { recursive: true });
    writeFileSync(join(tijdelijk, '.agents/skills/nep-kaart/SKILL.md'), '---\nname: nep-kaart\ndescription: Alleen Nederlands\n---\nТекст\n');
    const nepCat = {
      schema: 1,
      vaardigheden: [{
        naam: 'nep-kaart',
        pad: '.agents/skills/nep-kaart/SKILL.md',
        versie: '1.0.0',
        afhankelijkheden: [],
        samenvatting: { uk: 'Перевірка опису', nl: 'Controle beschrijving' },
        termen: { uk: ['перевірка'], nl: ['controle'] },
        vereisteHulpmiddelen: [],
      }],
    };
    let errTaal = '';
    try { leesVaardigheid('nep-kaart', nepCat, tijdelijk); } catch (e) { errTaal = (e as Error).message; }
    check('одномовний description у SKILL.md → VAARD_INHOUD_ONGELDIG', errTaal === 'VAARD_INHOUD_ONGELDIG');

    writeFileSync(join(tijdelijk, '.agents/skills/nep-kaart/SKILL.md'), '\n---\nname: nep-kaart\ndescription: Тест · Test\n---\nТекст\n');
    let errRegel1 = '';
    try { leesVaardigheid('nep-kaart', nepCat, tijdelijk); } catch (e) { errRegel1 = (e as Error).message; }
    check('YAML frontmatter не на 1-му рядку → VAARD_INHOUD_ONGELDIG', errRegel1 === 'VAARD_INHOUD_ONGELDIG');
  } finally {
    rmSync(tijdelijk, { recursive: true, force: true });
  }

  // ------------------------------------------------------------------ 6. Узгодженість правил, валідатор каталогу і заборони суперечностей
  const uitgave = leesVaardigheid('uitgave-voorbereiden', cat);
  check('uitgave-voorbereiden: PostgreSQL 18.6 (без згадки 16), zoek-ui-catalogus, ONTWIKKELARCHIEF, R:\\, ключ доступу, UITROL-002 GitHub/Telegram',
    uitgave.includes('PostgreSQL 18.6')
    && !uitgave.includes('PostgreSQL 16')
    && uitgave.includes('zoek-ui-catalogus')
    && uitgave.includes('ONTWIKKELARCHIEF')
    && uitgave.includes('R:\\mijn-ruimte-reservekopie\\')
    && uitgave.includes('міграції БД автоматично не скасовуються')
    && uitgave.includes('uitrol-github-ontvangen.ts')
    && uitgave.includes('TELEGRAM_UITROL_BOT_TOKEN')
    && uitgave.includes('ніколи не підміняє')
    && !uitgave.includes('поки не працює'));

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

  const valUit = valideerVaardigheden(process.cwd());
  check('valideerVaardigheden(): 0 помилок і рівно 9 навичок із ключами Connector v2',
    valUit.ok === true && valUit.fouten.length === 0 && valUit.aantallen.catalogus === 9,
    valUit.fouten.join(' · '));

  const dossierPad = 'orchestratie/ontwikkelarchieven/VAARD-002.json';
  const dossierFouten = existsSync(dossierPad)
    ? valideerOntwikkelDossier(JSON.parse(readFileSync(dossierPad, 'utf8')), 'VAARD-002')
    : ['dossier ontbreekt'];
  check('TRACE-001: доказове досьє VAARD-002.json чинне',
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
    '.agents/skills/mijn-ruimte/SKILL.md',
    '.agents/skills/mijn-ruimte/VAARDIGHEID.nl.md',
    '.agents/skills/mijn-ruimte/НАВИЧКА.uk.md',
    '.agents/skills/mijn-ruimte/НАВИЧКА-МІЙ-ПРОСТІР.uk.md',
    '.agents/skills/mijn-ruimte/scripts/mijn-ruimte',
    'scripts/vaardigheden/catalogus.json',
    'scripts/vaardigheden/kies.mjs',
    'scripts/vaardigheden/valideer.mjs',
    'tests/eenheid/vaardigheden-20261115.test.ts',
    'orchestratie/ontwikkelarchieven/VAARD-002.json',
    'orchestratie/taken/VAARD-002.json',
  ];

  const slechteTaal = teControlerenBestanden.filter((p) => taalwetOvertreding(readFileSync(p, 'utf8')));
  check('усі файли навичок і добору чисті від російських літер і техно-сленгу',
    slechteTaal.length === 0,
    slechteTaal.join(', '));

  const kaartUitslag = controleerKaart(process.cwd());
  const eigenWaarschuwingen = kaartUitslag.waarschuwingen.filter((w: string) =>
    w.startsWith('scripts/vaardigheden/') || w.startsWith('tests/eenheid/vaardigheden-'));
  check('kaart-controle: 0 помилок і 0 попереджень на нових файлах vaardigheden',
    kaartUitslag.fouten.length === 0 && eigenWaarschuwingen.length === 0,
    [...kaartUitslag.fouten, ...eigenWaarschuwingen].join(' · '));

  return einde();
}
