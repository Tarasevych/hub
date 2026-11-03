// Блоки 2–3 і 7, частина 26.10: поріг дзвоника на скриньку, розмір перегляду вкладення, позначка формату, контраст привітання.
import { readFileSync } from 'node:fs';
import { briefMoment, laatsteRegel } from '../../src/mail/laatste-brief';
import { mailMeldingNiveauNaam, mailMeldingSleutelGeldig, mailShouldNotify } from '../../shared/mail-melding-niveau';
import { effectieveMaat, voorbeeldBreedte, voorbeeldHoogte } from '../../shared/bijlage-voorbeeld-maat';
import { moetVernieuwen, termijnVan, vernieuwEinde } from '../../shared/extensie-matrix';
import { nietKorter } from '../../src/agenten/toegang/model';
import { leesHash, ontgrendelDoel } from '../../src/agenten/agenten-hash';

const lees = (p: string) => readFileSync(p, 'utf8');
const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean) => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}`); };

export async function main() {
  check('дія проходить поріг «лише дія», інфо — ні', mailShouldNotify('action', 'action') && !mailShouldNotify('info', 'action'));
  check('«не показувати» глушить усе, «усі» пускає пізніше', !mailShouldNotify('action', 'none') && mailShouldNotify('later', 'all'));
  check('ключ скриньки', mailMeldingSleutelGeldig('google:abc') && mailMeldingSleutelGeldig('imap:1') && !mailMeldingSleutelGeldig('anders:x'));
  check('назва порога українською', mailMeldingNiveauNaam('none', 'uk') === 'Не показувати' && mailMeldingNiveauNaam('action', 'nl').includes('Actie'));
  check('колесо з M іде на L, не стрибає через розмір', effectieveMaat('M', true) === 'L' && voorbeeldBreedte('M', 1600, true) === 720);
  check('XL не ширший за вікно', voorbeeldBreedte('XL', 400) === 384);
  check('висота M вміщується у вікно', voorbeeldHoogte('M', 200) === 150);

  const teken = lees('src/bestand/FormaatTeken.tsx');
  const tekenCss = lees('src/bestand/formaat-teken.css');
  check('позначка PDF без логотипа', teken.includes('data-familie={f.familie}') && teken.includes('formaatVan') && tekenCss.includes("[data-familie='pdf']") && !teken.includes('@iconify') && !teken.includes('logos'));

  const hub = lees('src/MailAccountsHub.tsx');
  const bel = lees('src/mail/MailMeldingBel.tsx');
  const voorkeuren = lees('backend/mail-weergave-voorkeuren.ts');
  const index = lees('backend/index.ts');
  const css = lees('src/werkblad/werkblad.css');
  check('дзвоник на картці й чесний рядок', hub.includes('MailMeldingBel') && bel.includes('Сповіщень про нові листи поки немає') && bel.includes('aria-haspopup'));
  check('сервер не плутає загальний поріг із порогом скриньки', index.includes('!row.accountKey') && index.includes('notification-preferences/list') && index.includes('MAIL_NOTIFICATION_ACCOUNT_UNKNOWN'));
  check('розмір перегляду переживає відповідь сервера', voorkeuren.includes("attachmentHoverSize:'S'") && voorkeuren.includes('record.attachmentHoverSize') && voorkeuren.includes('patch.attachmentHoverSize'));
  check('підзаголовок привітання не на --muted', css.includes('.wb-begroeting-tekst p{margin:2px 0 0;color:var(--text)') && css.includes('.wb-begroeting-datum{color:var(--text)'));
  const nu = Date.parse('2026-10-26T12:00:00Z');
  const vandaag = Date.parse('2026-10-26T10:02:00Z');
  check('сьогодні без теми листа', briefMoment(vandaag, 'uk', nu).startsWith('сьогодні') && laatsteRegel('uk', { latestReceivedAt: vandaag, empty: false, checkedAt: nu, errorCode: '' }, nu).startsWith('Останній лист:'));
  check('порожні вхідні', laatsteRegel('nl', { latestReceivedAt: 0, empty: true, checkedAt: nu, errorCode: '' }, nu).includes('Postvak IN is leeg'));
  check('повторний вхід', laatsteRegel('uk', { latestReceivedAt: 0, empty: false, checkedAt: nu, errorCode: 'REAUTH' }, nu) === 'Потрібен повторний вхід');
  const wbTs = lees('src/werkblad/Werkblad.tsx');
  const menu = lees('src/menu-naadloos.css');
  check('блок останніх листів з темами зник', !lees('src/MailFunctioneelWeergave.tsx').includes('data-mail-live-preview') && hub.includes('laatste-ontvangst') && hub.includes('data-mail-laatste'));
  check('фон на оболонці, меню 64/56', wbTs.includes('pasPaginaAchtergrondToe') && lees('src/werkblad/pagina-achtergrond.ts').includes('dataset.achtergrond') && css.includes(".canonical-chrome[data-achtergrond='nacht']") && menu.includes('64%,transparent') && menu.includes('56%,transparent') && menu.includes('prefers-reduced-transparency'));

  const D = 86_400_000;
  const nuT = 1_700_000_000_000;
  check('без обмеження поновлюється лише коли лишається менше 30 днів і політика дає щонайменше день зверху',
    termijnVan('handmatig')?.uk === 'Без обмеження'
    && moetVernieuwen('handmatig', nuT + 20 * D, nuT, 366 * D)
    && !moetVernieuwen('handmatig', nuT + 40 * D, nuT, 366 * D)
    && !moetVernieuwen('uitloggen', nuT + 20 * D, nuT, 366 * D)
    && !moetVernieuwen('handmatig', nuT + 29 * D, nuT, 30 * D)
    && vernieuwEinde(nuT, 366 * D) === nuT + 366 * D);
  check('продовжити не пропонує кінець раніше за поточний', nietKorter([1, 7, 30], D, nuT + 10 * D, nuT).join() === '30' && nietKorter([1, 7, 30], D, 0, nuT).join() === '1,7,30');
  const mini = lees('src/MailBijlageMiniatuur.tsx');
  check('мініатюра не качає файл при економії трафіку', mini.includes('miniatuurBesluit') && mini.includes("saveData:prefetchMode()==='off'") && mini.includes('ensureRef.current?.()'));
  // INTEG-001: UI-011 zit in elke 0.8.x-versie; een vaste versie-string liep na de volgende release vanzelf vast (nu 0.8.1, F2).
  check('розширення ≥ 0.7.1 (UI-011 in 0.8.x): без обмеження без «найпізніше», темний червоний текст', /"version": "0\.8\.\d+"/.test(lees('extension/manifest.json')) &&lees('extension/ui.js').includes('Без обмеження — доки не відкличете') && lees('extension/ui.css').includes('--rood-tekst:#fca5a5') && lees('extension/ui.css').includes('opacity:1'));
  check('сервер поновлює handmatig новим рядком, не eindeZetten', lees('backend/extensie-ontgrendeling.ts').includes('owner.extensie.vernieuwd') && lees('backend/extensie-ontgrendeling.ts').includes("einde_soort = 'handmatig'") && lees('backend/extensie-ontgrendeling.ts').includes('vernieuwOnbeperkt'));
  const lok = leesHash('#extension-lokaal');
  const ruim = leesHash('#ruimte');
  check('посилання розширення ведуть на вкладку, не на огляд', lok.tab === 'extensie' && lok.anker === 'extension-lokaal' && ruim.tab === 'technisch' && ruim.anker === 'ruimte' && leesHash('#claude').tab === 'ai');
  check('?ontgrendelen=prive відкриває приватний слот, сміття — ні', ontgrendelDoel('?ontgrendelen=prive', new URLSearchParams()) === 'prive' && ontgrendelDoel('', leesHash('#extensie?ontgrendelen=technisch').vraag) === 'technisch' && ontgrendelDoel('?ontgrendelen=anders', new URLSearchParams()) === '');
  check('якір локального агента стоїть на вкладці, не всередині згорнутої позначки', lees('src/agenten/TabExtensie.tsx').includes("id='extension-lokaal'") && lees('src/agenten/agenten.css').includes('position:sticky') && lees('src/agenten/TabTechnisch.tsx').includes("id='ruimte'"));

  const mis = resultaten.filter((r) => !r.ok);
  console.log(`${resultaten.length - mis.length}/${resultaten.length} geslaagd (blok-2-8-20261026)`);
  return mis.length ? 1 : 0;
}
