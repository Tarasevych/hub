// KLIMOP-001 (20.11.2026): Головний архітектурний маніфест «Плющ» / «Klimop» (16 частин, 46 розділів),
// канон правил 1.5.0 (B-024), паритет усіх 14 ШІ-агентів у політиці, перехідниках і навичках та чистота мовного закону.
// Запуск: node scripts/eenheidstests.mjs klimop-001-manifest-agenten-20261120.test.ts
import { existsSync, readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import * as k from '../../scripts/orch/kern.mjs';
// @ts-expect-error — .mjs без декларацій типів
import { kiesVaardigheden, laadCatalogus, leesVaardigheid } from '../../scripts/vaardigheden/kies.mjs';
// @ts-expect-error — .mjs без декларацій типів
import { valideerVaardigheden } from '../../scripts/vaardigheden/valideer.mjs';
import { V2_AGENTEN, agentUrl } from '../../shared/connector-v2/agenten';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const lees = (pad: string) => readFileSync(pad, 'utf8');

const ROMEINSE_DELEN = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII',
  'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI',
] as const;

const ALLE_14_ADAPTERS: ReadonlyArray<{
  id: string;
  slug: (typeof V2_AGENTEN)[number]['slug'];
  hoofd: string;
  uk: string;
  nl: string;
  extra: readonly string[];
}> = [
  { id: 'claude', slug: 'claude', hoofd: 'CLAUDE.md', uk: 'АДАПТЕР-КЛОД.uk.md', nl: 'CLAUDE.nl.md', extra: [] },
  { id: 'antigravity', slug: 'antigravity', hoofd: 'ANTIGRAVITY.md', uk: 'АДАПТЕР-АНТИГРАВІТІ.uk.md', nl: 'ANTIGRAVITY.nl.md', extra: [] },
  { id: 'autoclaw', slug: 'autoclaw', hoofd: 'AUTOCLAW.md', uk: 'АДАПТЕР-АВТОКЛО.uk.md', nl: 'AUTOCLAW.nl.md', extra: [] },
  { id: 'chatgpt', slug: 'gpt', hoofd: 'CHATGPT.md', uk: 'АДАПТЕР-ЧАТДЖПТ.uk.md', nl: 'CHATGPT.nl.md', extra: [] },
  { id: 'codex', slug: 'codex', hoofd: 'CODEX.md', uk: 'АДАПТЕР-КОДЕКС.uk.md', nl: 'CODEX.nl.md', extra: [] },
  { id: 'grok', slug: 'grok', hoofd: 'GROK.md', uk: 'АДАПТЕР-ГРОК.uk.md', nl: 'GROK.nl.md', extra: [] },
  { id: 'copilot', slug: 'copilot', hoofd: '.github/copilot-instructions.md', uk: '.github/ІНСТРУКЦІЇ-КОПІЛОТ.uk.md', nl: '.github/COPILOT-INSTRUCTIES.nl.md', extra: [] },
  { id: 'gemini', slug: 'gemini', hoofd: 'GEMINI.md', uk: 'АДАПТЕР-ДЖЕМІНІ.uk.md', nl: 'GEMINI.nl.md', extra: [] },
  { id: 'cursor', slug: 'cursor', hoofd: '.cursorrules', uk: 'АДАПТЕР-КУРСОР.uk.md', nl: 'CURSOR.nl.md', extra: ['CURSOR.md'] },
  { id: 'windsurf', slug: 'windsurf', hoofd: 'WINDSURF.md', uk: 'АДАПТЕР-ВІНДСЕРФ.uk.md', nl: 'WINDSURF.nl.md', extra: ['.windsurfrules'] },
  { id: 'cline', slug: 'cline', hoofd: 'CLINE.md', uk: 'АДАПТЕР-КЛАЙН.uk.md', nl: 'CLINE.nl.md', extra: ['.clinerules'] },
  { id: 'devin', slug: 'devin', hoofd: 'DEVIN.md', uk: 'АДАПТЕР-ДЕВІН.uk.md', nl: 'DEVIN.nl.md', extra: [] },
  { id: 'opencode', slug: 'opencode', hoofd: 'OPENCODE.md', uk: 'АДАПТЕР-ОПЕНКОД.uk.md', nl: 'OPENCODE.nl.md', extra: [] },
  { id: 'mscopilot', slug: 'mscopilot', hoofd: 'MSCOPILOT.md', uk: 'АДАПТЕР-МІКРОСОФТ-КОПІЛОТ.uk.md', nl: 'MSCOPILOT.nl.md', extra: [] },
];

export async function main(): Promise<number> {
  const { check, einde } = checker('klimop-001-manifest-agenten');

  // ------------------------------------------------------------------ 1. Двомовний Головний архітектурний маніфест «Плющ» / «Klimop»
  const padManifestUk = 'docs/hub/АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md';
  const padManifestMd = 'docs/hub/АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.md';
  const padManifestNl = 'docs/hub/ARCHITECTUURMANIFEST-KLIMOP.nl.md';

  check('файли маніфесту «Плющ» / «Klimop» існують обома мовами, .md збігається з .uk.md',
    existsSync(padManifestUk) && existsSync(padManifestMd) && existsSync(padManifestNl)
    && lees(padManifestUk) === lees(padManifestMd));

  const manifestUk = lees(padManifestUk);
  const manifestNl = lees(padManifestNl);

  check('маніфест (uk) містить усі XVI частин (ЧАСТИНА I .. ЧАСТИНА XVI)',
    ROMEINSE_DELEN.every((d) => new RegExp(`^## ЧАСТИНА ${d}\\.`, 'm').test(manifestUk)),
    ROMEINSE_DELEN.filter((d) => !new RegExp(`^## ЧАСТИНА ${d}\\.`, 'm').test(manifestUk)).join(','));

  check('маніфест (nl) містить усі XVI частин (DEEL I .. DEEL XVI)',
    ROMEINSE_DELEN.every((d) => new RegExp(`^## DEEL ${d}\\.`, 'm').test(manifestNl)),
    ROMEINSE_DELEN.filter((d) => !new RegExp(`^## DEEL ${d}\\.`, 'm').test(manifestNl)).join(','));

  const ontbrekendeSectiesUk: number[] = [];
  const ontbrekendeSectiesNl: number[] = [];
  for (let n = 1; n <= 46; n++) {
    if (!new RegExp(`^### ${n}\\.`, 'm').test(manifestUk)) ontbrekendeSectiesUk.push(n);
    if (!new RegExp(`^### ${n}\\.`, 'm').test(manifestNl)) ontbrekendeSectiesNl.push(n);
  }
  check('маніфест містить усі 46 пронумерованих розділів (1..46) в uk та nl',
    ontbrekendeSectiesUk.length === 0 && ontbrekendeSectiesNl.length === 0,
    `uk:[${ontbrekendeSectiesUk.join(',')}], nl:[${ontbrekendeSectiesNl.join(',')}]`);

  check('маніфест явно закріплює межу повноважень: не є дозволом на негайну зміну робочої інфраструктури',
    manifestUk.includes('Не є дозволом на негайну зміну робочої інфраструктури')
    && manifestNl.includes('Geen toestemming voor onmiddellijke wijziging van de productie-infrastructuur'));

  check('маніфест охоплює 7 елементів цифрового плюща (1.1..1.7), порогові підписи FROST і постквантову стійкість',
    ['1.1.', '1.2.', '1.3.', '1.4.', '1.5.', '1.6.', '1.7.', 'FROST'].every((s) => manifestUk.includes(s) && manifestNl.includes(s))
    && manifestUk.includes('постквантов') && manifestNl.includes('postkwantum'));

  // ------------------------------------------------------------------ 2. Політика 1.5.0, рішення B-024, замок правил і канон AGENTS.md / AGENTENREGELS.nl.md
  const beleid = JSON.parse(lees('orchestratie/beleid.json'));
  const lock = JSON.parse(lees('orchestratie/regels.lock.json'));
  const regelBestanden = Object.fromEntries(beleid.regelBestanden.map((p: string) => [p, lees(p)]));

  check('beleid.json має версію 1.5.0, проходить valideerBeleid та узгоджений з regels.lock.json',
    beleid.regelsVersie === '1.5.0'
    && k.valideerBeleid(beleid).length === 0
    && k.controleerLock(beleid, regelBestanden, lock).length === 0);

  check('beleid.json містить architectuurRichting KLIMOP-001 із забороною негайних змін робочого середовища та незмінним kritiek',
    beleid.architectuurRichting?.code === 'KLIMOP-001'
    && beleid.architectuurRichting?.besluit === 'B-024'
    && beleid.architectuurRichting?.onmiddellijkeProductieWijzigingToegestaan === false
    && beleid.architectuurRichting?.manifest?.uk === padManifestUk
    && beleid.architectuurRichting?.manifest?.nl === padManifestNl
    && beleid.architectuurRichting?.architectuurControleVragenAantal === 15
    && beleid.architectuurRichting?.verbodenVereenvoudigingenAantal === 14
    && beleid.kritiek?.privesleutelsNaarAgenten === false
    && beleid.kritiek?.installatieModi?.automatischBeperkt === null);

  check('реєстр рішень (BESLUITEN.md, РІШЕННЯ.uk.md, BESLUITEN.nl.md) містить B-024 для версії 1.5.0',
    ['orchestratie/BESLUITEN.md', 'orchestratie/РІШЕННЯ.uk.md', 'orchestratie/BESLUITEN.nl.md']
      .every((p) => existsSync(p) && /## B-024 · 2026-11-20 · 1\.5\.0 · (voorstel|bevestigd)/.test(lees(p))));

  const agentsUk = lees('AGENTS.md');
  const agentsNl = lees('AGENTENREGELS.nl.md');
  check('AGENTS.md дорівнює ПРАВИЛА-АГЕНТІВ.uk.md; обидві мовні версії мають compact §3б/§3b, §10, 15 питань та 14 заборонених спрощень',
    agentsUk === lees('ПРАВИЛА-АГЕНТІВ.uk.md')
    && agentsUk.includes('## 3б.')
    && agentsNl.includes('## 3b.')
    && agentsUk.includes('## 10.')
    && agentsNl.includes('## 10.')
    && agentsUk.includes("15. Чи не створюється нова небезпека для всієї мережі через один з'єднувач?")
    && agentsNl.includes('15. Ontstaat er een nieuw gevaar voor het gehele netwerk via één enkele verbinder?')
    && agentsUk.includes('(14) встановлювати критичні оновлення без належного погодження.')
    && agentsNl.includes('(14) kritieke updates te installeren zonder behoorlijke goedkeuring.'));

  // ------------------------------------------------------------------ 3. Повний паритет усіх 14 інтеграцій ШІ-агентів
  check('V2_AGENTEN (14 агентів) повністю збігається з beleid.agenten та beleid.adapters.bestanden',
    V2_AGENTEN.length === 14
    && beleid.agenten.length === 14
    && beleid.adapters.bestanden.length === 14
    && V2_AGENTEN.every((a) => beleid.agenten.some((ba: { id: string }) => ba.id === a.klant))
    && ALLE_14_ADAPTERS.every((item) => beleid.adapters.bestanden.includes(item.hoofd)));

  for (const item of ALLE_14_ADAPTERS) {
    const allePaden = [item.hoofd, item.uk, item.nl, ...item.extra];
    const bestaan = allePaden.every((p) => existsSync(p));
    const adapterGeldig = bestaan && allePaden.every((p) => k.controleerAdapter(p, lees(p), beleid.adapters.maxRegels).length === 0);
    const nlTekst = bestaan ? lees(item.nl) : '';
    const hoofdTekst = bestaan ? lees(item.hoofd) : '';
    const verwachtUrl = agentUrl(item.slug);

    const ukGelijkAanMd = item.id === 'cursor' ? lees('CURSOR.md') === lees(item.uk) : lees(item.hoofd) === lees(item.uk);

    check(`агент ${item.id}: перехідники (${allePaden.join(', ')}) чинні, двомовні, з адресою ${verwachtUrl} та KLIMOP-001`,
      bestaan
      && adapterGeldig
      && ukGelijkAanMd
      && /uitsluitend (een )?verwijzing/.test(nlTekst)
      && !nlTekst.includes('Цей файл — лише вказівник')
      && hoofdTekst.includes(verwachtUrl)
      && nlTekst.includes(verwachtUrl)
      && hoofdTekst.includes(`\`${item.id}\``)
      && nlTekst.includes(`\`${item.id}\``)
      && hoofdTekst.includes('KLIMOP-001')
      && nlTekst.includes('KLIMOP-001'));
  }

  // ------------------------------------------------------------------ 4. Досьє пам'яті, навичка klimop-architectuur та головні документи
  const dossierPad = 'orchestratie/onderwerpen/ecosysteem-klimop.json';
  const dossier = existsSync(dossierPad) ? JSON.parse(lees(dossierPad)) : null;
  check('досьє пам’яті ecosysteem-klimop.json існує та описує архітектурні засади «Плюща»',
    dossier !== null
    && dossier.naam === 'ecosysteem-klimop'
    && Array.isArray(dossier.mogelijkheden)
    && dossier.mogelijkheden.length >= 4);

  const cat = laadCatalogus();
  const klimopItem = cat.vaardigheden.find((v: { naam: string }) => v.naam === 'klimop-architectuur');
  const valVaard = valideerVaardigheden(process.cwd());
  const vaardInhoud = leesVaardigheid('klimop-architectuur', cat);
  check('спільна навичка klimop-architectuur підтримує всі 14 агентів і каталог навичок (12) валідний',
    Boolean(klimopItem)
    && Array.isArray(klimopItem.mogelijkheden)
    && klimopItem.mogelijkheden.length >= 3
    && klimopItem.mogelijkheden.every((m: { agenten: string[] }) =>
      Array.isArray(m.agenten)
      && m.agenten.length === 14
      && V2_AGENTEN.every((a) => m.agenten.includes(a.klant)))
    && vaardInhoud.includes('АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md')
    && vaardInhoud.includes('ARCHITECTUURMANIFEST-KLIMOP.nl.md')
    && valVaard.ok === true
    && valVaard.aantallen.catalogus === 12);

  const kiesUk = kiesVaardigheden('перевір архітектурний маніфест екосистема плющ і порогові підписи фрост', { catalogus: cat });
  const kiesNl = kiesVaardigheden('toets wijziging aan architectuurmanifest ecosysteem klimop en drempelhandtekeningen frost', { catalogus: cat });
  check('автоматичний добір навичок знаходить klimop-architectuur першою для запитів uk та nl',
    kiesUk[0]?.naam === 'klimop-architectuur' && kiesNl[0]?.naam === 'klimop-architectuur',
    `uk=${kiesUk[0]?.naam}, nl=${kiesNl[0]?.naam}`);

  check('головні оглядові файли README.md/ОГЛЯД-ПРОЄКТУ.uk.md та LEESMIJ.md/PROJECTOVERZICHT.nl.md синхронізовані й містять маніфест',
    lees('README.md') === lees('ОГЛЯД-ПРОЄКТУ.uk.md')
    && lees('LEESMIJ.md') === lees('PROJECTOVERZICHT.nl.md')
    && lees('README.md').includes('АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md')
    && lees('LEESMIJ.md').includes('ARCHITECTUURMANIFEST-KLIMOP.nl.md'));

  // ------------------------------------------------------------------ 5. Абсолютний мовний закон на всіх нових та оновлених файлах маніфесту й агентів
  const teToetsenBestanden = [
    padManifestUk,
    padManifestNl,
    'AGENTS.md',
    'ПРАВИЛА-АГЕНТІВ.uk.md',
    'AGENTENREGELS.nl.md',
    'orchestratie/beleid.json',
    'orchestratie/onderwerpen/ecosysteem-klimop.json',
    '.agents/skills/klimop-architectuur/SKILL.md',
    '.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md',
    '.agents/skills/klimop-architectuur/VAARDIGHEID.nl.md',
    ...ALLE_14_ADAPTERS.flatMap((x) => [x.hoofd, x.uk, x.nl, ...x.extra]),
  ];

  const russischeTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const overtredingen = teToetsenBestanden.filter((p) => {
    const inhoud = lees(p);
    return russischeTekens.test(inhoud) || taalwetOvertreding(inhoud);
  });
  check('жоден файл маніфесту, правил, навички чи перехідників 14 агентів не порушує мовного закону',
    overtredingen.length === 0,
    overtredingen.join(', '));

  return einde();
}
