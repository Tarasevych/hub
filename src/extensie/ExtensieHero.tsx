// EXTUI-001 (15.11.2026, прохання власника: «розділ розширення виглядає як сайт 90-х»): шапка розділу «Розширення браузера».
// Одним поглядом: чи є розширення в цьому браузері (версія), чи тримає воно зв'язок із сервером і чи відкрито доступ ШІ,
// а також ДЕ воно працює: ваші сторінки tarasevych.com, у фоні (коли сайт закрито), сайти ШІ (поки вимкнено — потрібен дозвіл).
// Kop van het blok «Browserextensie»: in één oogopslag of de extensie in deze browser zit (versie), verbonden is en of de AI-toegang
// open is, en WAAR ze werkt. Alleen weergave: de gegevens komen uit useExtensieLiveToestand (dezelfde bron als de rest van het blok).
import { AlertTriangle, CheckCircle2, CircleDashed, Globe2, Moon, Puzzle, Sparkles, Wifi } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Tr } from '../mcp-ui';
import type { ExtensieLive } from './extensie-live';
import './extensie-ontwerp.css';

type Stand = 'ok' | 'let' | 'uit';
/** Сайти ШІ, на яких розширення МОГЛО б працювати після окремого дозволу власника (пропозиція, ще не ввімкнено). */
export const AI_SITES = ['claude.ai', 'chatgpt.com', 'gemini.google.com', 'grok.com', 'copilot.microsoft.com'] as const;

function Tegel({ stand, icoon, titel, waarde, uitleg, data }: { stand: Stand; icoon: ReactNode; titel: string; waarde: string; uitleg: string; data: string }) {
  return (
    <li className='exh-tegel' data-stand={stand} data-exh-tegel={data} title={uitleg}>
      <span className='exh-tegel-icoon' aria-hidden='true'>{icoon}</span>
      <span className='exh-tegel-tekst'>
        <small>{titel}</small>
        <b>{waarde}</b>
      </span>
    </li>
  );
}

export default function ExtensieHero({ tr, live, nieuwste }: { tr: Tr; live: ExtensieLive; nieuwste?: string }) {
  const ext = live.extensie;
  const aanwezig = !!ext?.versie;
  const verbonden = !!(ext?.verbonden ?? live.online);
  const open = live.staat === 'ontgrendeld' || live.staat === 'agent';
  const gekoppeld = live.staat !== 'niet-gekoppeld' && live.staat !== 'onbekend';
  const oud = aanwezig && !!nieuwste && nieuwste !== ext?.versie;
  return (
    <section className='exh' data-exh='1' aria-labelledby='exh-titel'>
      <div className='exh-kop'>
        <span className='exh-logo' aria-hidden='true'><Puzzle /></span>
        <div className='exh-kop-tekst'>
          <h3 id='exh-titel'>{tr('Розширення Mijn Ruimte', 'Extensie Mijn Ruimte')}{aanwezig ? <span className='exh-versie' data-exh-versie={ext?.versie}>v{ext?.versie}</span> : null}</h3>
          <p>{tr('Руки вашого ШІ в браузері: читає й виконує дії лише там і лише те, що ви дозволили. Усе видно в центрі сповіщень.', 'De handen van uw AI in de browser: leest en handelt alleen waar en wat u toestaat. Alles staat in het meldingencentrum.')}</p>
        </div>
      </div>
      <ul className='exh-tegels' aria-label={tr('Стан розширення', 'Stand van de extensie')}>
        <Tegel data='aanwezig' stand={aanwezig ? (oud ? 'let' : 'ok') : 'uit'} icoon={aanwezig ? <CheckCircle2 /> : <CircleDashed />}
          titel={tr('У цьому браузері', 'In deze browser')}
          waarde={aanwezig ? (oud ? tr(`є оновлення ${nieuwste}`, `update ${nieuwste} beschikbaar`) : tr('встановлено', 'geïnstalleerd')) : tr('не знайдено', 'niet gevonden')}
          uitleg={aanwezig ? tr('Сайт бачить розширення в цьому браузері. Якщо є новіша версія, сайт запропонує її нижче.', 'De site ziet de extensie in deze browser. Is er een nieuwere versie, dan biedt de site die hieronder aan.') : tr('Розширення в цьому браузері немає або воно вимкнене. Встановіть його кроками нижче — без нього ШІ не бачить ваших сторінок.', 'De extensie zit niet in deze browser of staat uit. Installeer ze met de stappen hieronder — zonder ziet de AI uw pagina’s niet.')} />
        <Tegel data='verbinding' stand={!gekoppeld ? 'uit' : verbonden ? 'ok' : 'let'} icoon={<Wifi />}
          titel={tr('Зв’язок із сервером', 'Verbinding met de server')}
          waarde={!gekoppeld ? tr('не підключено', 'niet gekoppeld') : verbonden ? tr('на зв’язку', 'verbonden') : tr('немає зв’язку', 'geen verbinding')}
          uitleg={tr('Розширення тримає власне захищене з’єднання з вашим сервером. Без підключення ШІ не може надсилати йому команди.', 'De extensie houdt een eigen beveiligde verbinding met uw server. Zonder koppeling kan de AI haar geen opdrachten sturen.')} />
        <Tegel data='toegang' stand={open ? 'ok' : gekoppeld ? 'let' : 'uit'} icoon={<Sparkles />}
          titel={tr('Доступ ШІ', 'Toegang van de AI')}
          waarde={open ? tr('відкрито', 'open') : tr('закрито', 'dicht')}
          uitleg={open ? tr('ШІ зараз може виконувати дозволені дії. Закрити можна будь-коли кнопкою «Стоп» — розширення одразу перестає виконувати команди.', 'De AI kan nu toegestane acties uitvoeren. Sluiten kan altijd met «Stop» — de extensie voert dan meteen niets meer uit.') : tr('ШІ нічого не може через розширення, доки ви не відкриєте доступ (сайт попросить підтвердження).', 'De AI kan niets via de extensie tot u de toegang opent (de site vraagt een bevestiging).')} />
      </ul>
      <div className='exh-waar' data-exh-waar='1'>
        <h4>{tr('Де працює', 'Waar ze werkt')}</h4>
        <ul>
          <li data-stand='ok' data-exh-waar-item='site' title={tr('Ваша пошта, диск, хаб та інші сторінки tarasevych.com. Вкладка може бути у фоні — активною вона бути не мусить.', 'Uw mail, drive, hub en andere pagina’s van tarasevych.com. Het tabblad mag op de achtergrond staan — actief hoeft niet.')}>
            <Globe2 aria-hidden='true' /><span><b>tarasevych.com</b><small>{tr('ваші сторінки, навіть у фоновій вкладці', 'uw pagina’s, ook in een achtergrondtabblad')}</small></span>
          </li>
          <li data-stand={gekoppeld ? 'ok' : 'uit'} data-exh-waar-item='achtergrond' title={tr('З’єднання з сервером живе в самому розширенні, тож сайт можна закрити: сповіщення й «Стоп» працюють далі. Дії на сторінці ШІ виконає, щойно сторінку tarasevych.com буде відкрито.', 'De verbinding met de server leeft in de extensie zelf, dus de site mag dicht: meldingen en «Stop» blijven werken. Acties op een pagina voert de AI uit zodra een pagina van tarasevych.com open is.')}>
            <Moon aria-hidden='true' /><span><b>{tr('У фоні', 'Op de achtergrond')}</b><small>{tr('зв’язок тримається, коли сайт закрито', 'verbinding blijft als de site dicht is')}</small></span>
          </li>
          <li data-stand='uit' data-exh-waar-item='ai-sites' className='exh-gevaar' title={tr(`Опція в налаштуваннях розширення → «Браузер і вкладки». Щоб розширення допомагало на ${AI_SITES.join(', ')}, Chrome має дати йому окремий дозвіл на ці адреси — він питає лише після вашого вибору «Завжди». Ризик: на чужих сайтах ШІ бачитиме текст сторінок, які ви відкрили. Типово «Вимкнено»; кожна зміна потрапляє в центр сповіщень.`, `Optie in de instellingen van de extensie → «Browser en tabbladen». Om te helpen op ${AI_SITES.join(', ')} heeft de extensie een apart recht van Chrome op die adressen nodig — Chrome vraagt het pas na uw keuze «Altijd». Risico: op andere sites ziet de AI de tekst van pagina’s die u opent. Standaard «Uit»; elke wijziging komt in het meldingencentrum.`)}>
            <AlertTriangle aria-hidden='true' /><span><b>{tr('Сайти ШІ', 'AI-sites')} <em className='exh-badge'>!</em></b><small>{tr('типово вимкнено — вмикаєте ви', 'standaard uit — u zet het aan')}</small></span>
          </li>
        </ul>
      </div>
    </section>
  );
}
