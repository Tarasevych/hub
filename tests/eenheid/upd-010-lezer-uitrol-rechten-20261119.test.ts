// UPD-010: перевірка всіх трьох напрямів випуску:
// 1) Переглядач листа (усунення порожньої смуги, компактна верхня панель перекладу та розгортуваних пілюль, прибирання дубліката);
// 2) Фонове завантаження та встановлення оновлень без обриву при зміні вкладки або піддомену;
// 3) Розумна кумулятивна черга оновлень та гнучкі права агентів із посиленим підтвердженням власника.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import {
  bepaalIngehaaldeVoorstellen,
  bouwCumulatieveWachtrij,
  isGrantUitgeput,
  normaliseerGrantRechten,
  rechtenSamenvatting,
  resterendAantal,
} from '../../shared/uitrol-wachtrij';
import { UITROL_CODES } from '../../shared/uitrol-codes';
import { huidigeDienstUitHost } from '../../src/platform/uitrol-achtergrond-beheer';

const lees = (pad: string) => readFileSync(join(process.cwd(), pad), 'utf8');
const RUSS_RE = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

export async function main(): Promise<number> {
  const { check, einde } = checker('upd-010-lezer-uitrol-rechten-20261119');

  // ---------------------------------------------------------------- 1. Переглядач листа
  const kopCss = lees('src/mail/mail-lezer-compact-kop.css');
  const werkbalk = lees('src/MailLezerWerkbalk.tsx');
  const gesprek = lees('src/MailGesprekInhoud.tsx');
  const vertaal = lees('src/mail/VertaalStrook.tsx');
  const watNodig = lees('src/mail/WatNodigBlok.tsx');
  const bericht = lees('src/MailBerichtTekst.tsx');

  check('1.1: mail-lezer-compact-kop.css прибирає білий провал (.mail-thread-content має align-content: start і grid-auto-rows: max-content)',
    /\.mail-thread-content[\s\S]*align-content:\s*start/.test(kopCss) && /grid-auto-rows:\s*max-content/.test(kopCss));
  check('1.2: mail-lezer-compact-kop.css використовує виключно змінні оформлення (без сирих hex-кольорів і без prefers-color-scheme)',
    !/#[0-9a-f]{3,8}\b/i.test(kopCss) && !/prefers-color-scheme/.test(kopCss));
  check('1.3: MailLezerWerkbalk має слот data-mail-reader-opties-host і приховує дублікат кнопки перекладу коли смуга у верхній панелі',
    werkbalk.includes('data-mail-reader-opties-host') && /\[data-reader-action-id=['"]translate['"]\]/.test(kopCss));
  check('1.4: VertaalStrook, WatNodigBlok та MailBerichtTekst підтримують портал у kopHost (однорядкова смуга перекладу й розгортувані пілюлі)',
    vertaal.includes('createPortal') && vertaal.includes('data-in-kop=')
    && watNodig.includes('createPortal') && watNodig.includes('mail-kop-pil')
    && bericht.includes('createPortal') && bericht.includes('mail-kop-pil')
    && gesprek.includes('useKopOptiesHost'));

  // ---------------------------------------------------------------- 2. Фонове завантаження та встановлення
  const bgBeheer = lees('src/platform/uitrol-achtergrond-beheer.ts');
  const bgBand = lees('src/platform/UitrolAchtergrondBand.tsx');
  const bgCss = lees('src/platform/uitrol-achtergrond-band.css');
  const mainTsx = lees('src/main.tsx');
  const beheerView = lees('src/BeheerUitrolWeergave.tsx');
  const uploadTsx = lees('src/uitrol/Upload.tsx');
  const goedkTs = lees('backend/uitrol-goedkeuring.ts');
  const ghOntvTs = lees('backend/uitrol-github-ontvangen.ts');

  check('2.1: huidigeDienstUitHost коректно розпізнає піддомени',
    huidigeDienstUitHost('admin.tarasevych.com') === 'admin'
    && huidigeDienstUitHost('mail.tarasevych.com') === 'mail'
    && huidigeDienstUitHost('ai.tarasevych.com') === 'ai'
    && huidigeDienstUitHost('hub.tarasevych.com') === 'hub');
  check('2.2: UitrolAchtergrondBand підключено в main.tsx на всіх піддоменах, а стилі без сирих кольорів',
    mainTsx.includes('./platform/UitrolAchtergrondBand')
    && bgBand.includes('data-ut-achtergrond-band')
    && !/#[0-9a-f]{3,8}\b/i.test(bgCss) && !/prefers-color-scheme/.test(bgCss));
  check('2.3: BeheerUitrolWeergave не розмонтовує Upload при перемиканні вкладок (hidden замість умовного видалення)',
    beheerView.includes("hidden={tab !== 'overzicht'}") && uploadTsx.includes('useUitrolAchtergrond') && uploadTsx.includes('startGithubAchtergrondUpload'));
  check('2.4: сервер надає маршрут POST /api/owner/uitrol/achtergrond для власника на будь-якому піддомені та фоновий режим GitHub',
    goedkTs.includes("'POST /api/owner/uitrol/achtergrond'")
    && goedkTs.includes('eigenaarOveral')
    && ghOntvTs.includes('startGithubReleaseAchtergrond')
    && ghOntvTs.includes('b.achtergrond === true')
    && bgBeheer.includes('BroadcastChannel'));

  // ---------------------------------------------------------------- 3. Кумулятивна черга та гнучкі права агентів
  const lijst = [
    { id: 'v1', versie: '20261119-100000', status: 'wacht-op-goedkeuring' },
    { id: 'v2', versie: '20261119-110000', status: 'wacht-op-goedkeuring' },
    { id: 'v3', versie: '20261119-120000', status: 'wacht-op-goedkeuring' },
    { id: 'v4', versie: '20261119-130000', status: 'wacht-op-goedkeuring' },
    { id: 'v5', versie: '20261119-140000', status: 'wacht-op-goedkeuring' },
    { id: 'old', versie: '20261118-090000', status: 'geinstalleerd' },
  ];
  const wachtrij = bouwCumulatieveWachtrij(lijst);
  check('3.1: bouwCumulatieveWachtrij сортує 5 очікуючих від найновішого до найстарішого й рахує охоплені попередні',
    wachtrij.length === 5
    && wachtrij[0].voorstel.versie === '20261119-140000'
    && wachtrij[0].isLaatste === true
    && wachtrij[0].omvatVersies.length === 4
    && wachtrij[2].voorstel.versie === '20261119-120000'
    && wachtrij[2].omvatVersies.length === 2
    && wachtrij[4].omvatVersies.length === 0);

  const ingehaald = bepaalIngehaaldeVoorstellen(lijst, '20261119-130000');
  check('3.2: bepaalIngehaaldeVoorstellen знаходить рівно 3 попередні очікуючі версії при встановленні v4 (v5 лишається)',
    ingehaald.length === 3
    && ingehaald.map((x) => x.id).join(',') === 'v1,v2,v3');

  const nEenmalig = normaliseerGrantRechten({ toegangNiveau: 'uploaden', limietModus: 'eenmalig' });
  const nAantal = normaliseerGrantRechten({ toegangNiveau: 'installeren', limietModus: 'aantal', maxAantal: 3 });
  const nFout = normaliseerGrantRechten({ limietModus: 'aantal', maxAantal: 0 });
  const nFoutNiveau = normaliseerGrantRechten({ toegangNiveau: 'root-bypass' });
  check('3.3: normaliseerGrantRechten правильно перевіряє рівні та режими обмежень',
    nEenmalig.ok && nEenmalig.waarde.maxAantal === 1
    && nAantal.ok && nAantal.waarde.toegangNiveau === 'installeren' && nAantal.waarde.maxAantal === 3
    && !nFout.ok && nFout.code === 'MAX_AANTAL_ONGELDIG'
    && !nFoutNiveau.ok && nFoutNiveau.code === 'TOEGANG_NIVEAU_ONGELDIG');

  check('3.4: isGrantUitgeput, resterendAantal і rechtenSamenvatting коректно відпрацьовують лічильник',
    !isGrantUitgeput({ limietModus: 'eenmalig', maxAantal: 1, gebruiktAantal: 0 })
    && isGrantUitgeput({ limietModus: 'eenmalig', maxAantal: 1, gebruiktAantal: 1 })
    && resterendAantal({ limietModus: 'aantal', maxAantal: 5, gebruiktAantal: 2 }) === 3
    && rechtenSamenvatting('uk', { toegangNiveau: 'installeren', limietModus: 'aantal', maxAantal: 3, gebruiktAantal: 1 }).beperking.includes('1 з 3')
    && rechtenSamenvatting('nl', { toegangNiveau: 'uploaden', limietModus: 'bevestiging_per_keer' }).beperking.includes('Bevestiging'));

  const mig0303 = lees('migrations/0303_uitrol_wachtrij_en_rechten.sql');
  const goedkUi = lees('src/uitrol/Goedkeuring.tsx');
  const voorbUi = lees('src/uitrol/Voorbereiders.tsx');
  const toevoegenUi = lees('src/uitrol/AgentToevoegen.tsx');
  const toegangUi = lees('src/uitrol/ToegangBlok.tsx');
  const docUk = lees('docs/ПОРЯДОК-ЧЕРГИ-ОНОВЛЕНЬ.uk.md');
  const docNl = lees('docs/WACHTRIJ-UPDATES.nl.md');

  check('3.5: сервер підтримує чергу ≥ 15, sluitIngehaaldeVoorstellen, verbruiktGrantEenheid і маршрут /voorbereiders/rechten зі sterk: true',
    /openPerVoorbereider:\s*15/.test(goedkTs)
    && goedkTs.includes('export async function sluitIngehaaldeVoorstellen')
    && goedkTs.includes('export async function verbruiktGrantEenheid')
    && goedkTs.includes("'POST /api/owner/uitrol/voorbereiders/rechten': [eigenaar({ sterk: true }")
    && Boolean(UITROL_CODES.INGEHAALD_DOOR_NIEUWERE));

  check('3.6: міграція 0303 зворотно сумісна та містить усі нові колонки й статус ingehaald',
    mig0303.includes('ADD COLUMN IF NOT EXISTS toegang_niveau')
    && mig0303.includes('ADD COLUMN IF NOT EXISTS limiet_modus')
    && mig0303.includes('ADD COLUMN IF NOT EXISTS max_aantal')
    && mig0303.includes('ADD COLUMN IF NOT EXISTS gebruikt_aantal')
    && mig0303.includes('ADD COLUMN IF NOT EXISTS ingehaald_door')
    && mig0303.includes("'ingehaald'"));

  check('3.7: інтерфейс кумулятивної черги та гнучких прав підключений у всіх 4 компонентах і є двомовна документація',
    goedkUi.includes('data-ut-cumulatieve-wachtrij') && goedkUi.includes('data-ut-installeer-laatste')
    && voorbUi.includes('data-rechten-wijzig') && voorbUi.includes('data-rechten-veld')
    && toevoegenUi.includes('data-ut-toegang-niveau') && toevoegenUi.includes('data-ut-limiet-modus')
    && toegangUi.includes('rechtenSamenvatting')
    && docUk.includes('кумулятивна черга') && docNl.includes('cumulatieve updatewachtrij'));

  // ---------------------------------------------------------------- 4. Мовний закон
  const nieuweBestanden = [
    kopCss,
    bgBeheer,
    bgBand,
    bgCss,
    mig0303,
    docUk,
    docNl,
    lees('shared/uitrol-wachtrij.ts'),
    lees('src/mail/lezer-kop-host.ts'),
  ];
  check('4.1: жоден новий файл UPD-010 не містить заборонених символів російської абетки',
    nieuweBestanden.every((s) => !RUSS_RE.test(s)));

  return einde();
}
