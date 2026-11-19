// Регресійне випробування для UPD-008: виправлення меню на домені пошти (mail.tarasevych.com) та ізоляція просторів «Звичайний / Технічний».
// Regressietest voor UPD-008: reparatie van het menu op het postdomein (mail.tarasevych.com) en scheiding van de gewone en technische ruimte.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import {
  huidigeRuimte,
  meldRuimte,
  RUIMTE_WISSEL_GEBEURTENIS,
  TAB_RUIMTE_SLEUTEL,
} from '../../src/tech/ruimtes/ruimte-signaal';

const WORTEL = process.cwd();
const lees = (pad: string) => readFileSync(join(WORTEL, pad), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('upd-008-mail-menu-ruimtes-20261119');

  // 1. CSS пошти: при фіксованому розгорнутому меню (.sidebar-pinned) пошта зсувається на 316px без перекриття.
  const menuV2 = lees('src/menu-v2.css');
  const gelaagd = lees('src/mail-gelaagde-inbox.css');
  const lezer = lees('src/mail-lezer-verbeteringen.css');
  const werkruimteCss = lees('src/google-mail-werkruimte.css');

  check(
    '1. При .sidebar-pinned верхня командна панель пошти отримує --canonical-command-inline-start із шириною 316px',
    /\.canonical-chrome\.sidebar-pinned:not\(\.sidebar-drawer-mode\):not\(\[data-dock='rechts'\]\):not\(\[data-dock='boven'\]\):not\(\[data-dock='onder'\]\)\{--canonical-command-inline-start:calc\(min\(316px,calc\(100vw - var\(--zijbalk-rail\)\)\) \+ 14px\)\}/.test(menuV2),
  );

  check(
    '2. При .sidebar-hover бічна панель наповзає поверх шапки пошти й відкритого листа (z-index:260)',
    /\.canonical-chrome:not\(\.sidebar-drawer-mode\)\.sidebar-hover\s+\.canonical-sidebar\{[^}]*z-index:260/.test(menuV2),
  );

  check(
    '3. Фон відкритого листа та переглядача вкладень зсувається ТІЛЬКИ при .sidebar-pinned (316px), а не при .sidebar-expanded/.sidebar-hover',
    /\.canonical-chrome:not\(\.sidebar-pinned\):not\(\.sidebar-drawer-mode\)\s+\.google-mail-reader-backdrop\{left:var\(--zijbalk-rail\)\}/.test(menuV2)
      && /\.canonical-chrome\.sidebar-pinned:not\(\.sidebar-drawer-mode\):not\(\[data-dock='rechts'\]\):not\(\[data-dock='boven'\]\):not\(\[data-dock='onder'\]\)\s+:is\(\.google-mail-reader-backdrop,\.google-mail-attachment-backdrop\)\{left:min\(316px,calc\(100vw - var\(--zijbalk-rail\)\)\)\}/.test(menuV2)
      && !/sidebar-expanded/.test(lezer)
      && !/sidebar-expanded/.test(werkruimteCss)
      && /padding-left:min\(316px,calc\(100vw - var\(--zijbalk-rail,60px\)\)\)/.test(gelaagd)
      && /padding-left:min\(316px,calc\(100vw - var\(--zijbalk-rail,60px\)\)\)/.test(lezer),
  );

  check(
    '4. Дзеркальне положення меню справа ([data-dock=rechts]) також коректно зсуває робочу область пошти й читач при .sidebar-pinned',
    /\.canonical-chrome\[data-dock='rechts'\]\.sidebar-pinned:has\(\.mail-functional\.google-workspace-active\)\s+\.canonical-workspace\{padding-left:0!important;padding-right:min\(316px,calc\(100vw - var\(--zijbalk-rail\)\)\)\}/.test(menuV2)
      && /\.canonical-chrome\[data-dock='rechts'\]\.sidebar-pinned\s+:is\(\.google-mail-reader-backdrop,\.google-mail-attachment-backdrop\)\{left:0;right:min\(316px,calc\(100vw - var\(--zijbalk-rail\)\)\)\}/.test(menuV2),
  );

  // 2. Послідовність перемикання простору в ruimtes-opslag.ts: оптимістичний стан не викликає meldRuimte ДО відповіді сервера.
  const opslag = lees('src/tech/ruimtes/ruimtes-opslag.ts');
  const idxWissel = opslag.indexOf('export async function wissel');
  const idxActie = opslag.indexOf('async function actie');
  const blokWissel = opslag.slice(idxWissel, opslag.indexOf('/** «Пауза»', idxWissel));
  const blokActie = opslag.slice(idxActie, idxWissel);
  const posTechVernieuwen = blokActie.indexOf('await techVernieuwen()');
  const posMeldRuimte = blokActie.indexOf('meldRuimte(ruimteVanStatus(s))');

  check(
    '5. Оптимістичний zet() у wissel() передає meldSignaal=false, а meldRuimte() в actie() іде суворо ПІСЛЯ підтвердження сервера та techVernieuwen()',
    /const zet = \(x: Partial<RuimtesToestand>, meldSignaal = true\)/.test(opslag)
      && /if \(oud\) zet\(\{ status: \{ \.\.\.oud, actief: naar/.test(blokWissel)
      && blokWissel.includes('}, false);')
      && posTechVernieuwen > 0
      && posMeldRuimte > posTechVernieuwen
      && /if \(d\.ruimte === 'technisch'\) void ruimtesVernieuwen\(\)/.test(opslag),
  );

  // 3. Збереження простору вкладки у sessionStorage (ruimte-signaal.ts) та реакція на зміну простору.
  const winkel = new Map<string, string>();
  const gebeurtenissen: Array<{ type: string; detail: { van: string; naar: string } }> = [];
  const origWin = (globalThis as any).window;
  const origDoc = (globalThis as any).document;
  const origStor = (globalThis as any).sessionStorage;
  const origCE = (globalThis as any).CustomEvent;
  (globalThis as any).CustomEvent ??= class {
    type: string;
    detail: unknown;
    constructor(t: string, o: { detail?: unknown }) {
      this.type = t;
      this.detail = o?.detail;
    }
  };
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => winkel.get(k) ?? null,
    setItem: (k: string, v: string) => { winkel.set(k, v); },
    removeItem: (k: string) => { winkel.delete(k); },
  };
  (globalThis as any).window = {
    dispatchEvent: (e: { type: string; detail: { van: string; naar: string } }) => {
      gebeurtenissen.push(e);
      return true;
    },
  };
  (globalThis as any).document = { documentElement: { dataset: {} as Record<string, string> } };

  try {
    meldRuimte('prive');
    gebeurtenissen.length = 0;
    const naarTech = meldRuimte('technisch');
    const opgeslagenTech = winkel.get(TAB_RUIMTE_SLEUTEL);
    const dataTech = (globalThis as any).document.documentElement.dataset.ruimte;
    const opnieuwTech = meldRuimte('technisch');
    const terugPrive = meldRuimte('prive');
    const opgeslagenPrive = winkel.get(TAB_RUIMTE_SLEUTEL);
    check(
      '6. ruimte-signaal зберігає активний простір у sessionStorage, синхронізує data-ruimte і не надсилає зайвих подій при збігу',
      naarTech === true
        && opgeslagenTech === 'technisch'
        && dataTech === 'technisch'
        && opnieuwTech === false
        && terugPrive === true
        && opgeslagenPrive === undefined
        && huidigeRuimte() === 'prive'
        && gebeurtenissen.length === 2
        && gebeurtenissen[0].type === RUIMTE_WISSEL_GEBEURTENIS
        && gebeurtenissen[0].detail.naar === 'technisch'
        && gebeurtenissen[1].detail.naar === 'prive',
    );
  } finally {
    if (origWin === undefined) delete (globalThis as any).window; else (globalThis as any).window = origWin;
    if (origDoc === undefined) delete (globalThis as any).document; else (globalThis as any).document = origDoc;
    if (origStor === undefined) delete (globalThis as any).sessionStorage; else (globalThis as any).sessionStorage = origStor;
    if (origCE === undefined) delete (globalThis as any).CustomEvent; else (globalThis as any).CustomEvent = origCE;
  }

  // 4. Ізоляція просторів у компонентах пошти (GoogleMailWerkruimte, MailFunctioneelWeergave, MailZijbalkNavigatie).
  const gmw = lees('src/GoogleMailWerkruimte.tsx');
  const func = lees('src/MailFunctioneelWeergave.tsx');
  const zijbalk = lees('src/MailZijbalkNavigatie.tsx');

  check(
    '7. GoogleMailWerkruimte ізолює sessionStorage, IndexedDB-знімок, незавершені запити, відкриття листа та readerRanden при автонаведенні',
    /const mailTransientKey=\(ownerUserId:string\)=>\{const r=huidigeRuimte\(\);return`tsv:mail-ui-context-v3:\$\{r==='prive'\?ownerUserId:ruimteSleutel\(r,ownerUserId\)\}`\}/.test(gmw)
      && /mailListRequestKey=\(payload:Record<string,unknown>\)=>JSON\.stringify\(\['POST','\/api\/owner\/mail\/google-suite\/messages',huidigeRuimte\(\)/.test(gmw)
      && /mailOwnerCacheScope=\(\)=>\{const r=huidigeRuimte\(\);return r==='prive'\?ownerUserId:ruimteSleutel\(r,ownerUserId\)\}/.test(gmw)
      && /opRuimteWissel\(\(\{van,naar\}\)=>\{detailRequest\.current\+=1;listRequest\.current\+=1;searchRequest\.current\+=1;attachmentMetadataRequest\.current\+=1;cancelMailBackgroundPrefetch\(van\);cancelMailBackgroundPrefetch\(naar\);hydratedViewRef\.current=null;reloadTransient\.current=null;pageAccountRef\.current=''/.test(gmw)
      && /POST:\/api\/owner\/mail\/google-suite\/message:\$\{openRuimte\}:\$\{targetAccountId\}:\$\{messageId\}/.test(gmw)
      && /POST:\/api\/owner\/mail\/google-suite\/thread:\$\{threadRuimte\}:\$\{targetAccountId\}:\$\{threadId\}/.test(gmw)
      && /request!==detailRequest\.current\|\|huidigeRuimte\(\)!==openRuimte/.test(gmw)
      && /const reqRuimte=huidigeRuimte\(\);[\s\S]{0,400}\/api\/owner\/mail\/google-suite\/accounts/.test(gmw)
      && /readMailListViewSnapshot<Message>\(mailOwnerCacheScope\(\),tab,routeLabel\)/.test(gmw)
      && /writeMailListViewSnapshot\(mailOwnerCacheScope\(\),accountId,tab,listLabel/.test(gmw)
      && /zweeftOver=root\.classList\.contains\('sidebar-hover'\)&&!root\.classList\.contains\('sidebar-pinned'\)&&dock!=='boven'&&dock!=='onder'/.test(gmw),
  );

  check(
    '8. MailFunctioneelWeergave та MailZijbalkNavigatie слухають opRuimteWissel і скидають облікові записи та мітки старого простору',
    /opRuimteWissel/.test(func)
      && /googleMail:\s*undefined/.test(func)
      && /opRuimteWissel/.test(zijbalk)
      && /setAccountId\(''\)/.test(zijbalk)
      && /setLabels\(\[\]\)/.test(zijbalk),
  );

  return einde();
}
