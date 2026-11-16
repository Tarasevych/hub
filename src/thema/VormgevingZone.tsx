// KLEUREN-001 (16.11.2026): єдина зона «Вигляд і кольори». Раніше палітра, режим, акцент, «Живий фон», прозорість і сяйво стояли
// довгою стрічкою без пояснення, що саме фарбує кожне; два блоки звалися однаково «Кольори». Тут:
//  • VoorbeeldVenster — живий приклад: мініатюра сторінки на СПРАВЖНІХ змінних теми (--bg, --panel, --accent …), тож вона сама
//    показує будь-яку зміну; наведення на блок або рядок легенди підсвічує частини, які це налаштування фарбує;
//  • ZoneBlok — згортний блок із поточним значенням у заголовку (видно, що обрано, не розгортаючи);
//  • ZoneVoet — де діє зміна (усі сервіси, який профіль) і повернення декоративних шарів до типових.
// Eén zone «Weergave en kleuren»: een levend voorbeeld op de echte themavariabelen, inklapbare blokken met de huidige waarde in de
// kop, en een voet die zegt waar de wijziging geldt.
import { ChevronDown, RotateCcw } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { achtergrondVolledig, UITERLIJK_EFFECTEN_STANDAARD, type AchtergrondKleuren } from '../../shared/uiterlijk';
import { useThemaStand, zetAchtergrond, zetWeergaveStijl } from './useThema';
import { blokDekking, minderTransparantie } from './weergave-stijl';
import './vormgeving-zone.css';

type Tr = (uk: string, nl: string) => string;
/** Шари вигляду — у тому порядку, як вони лягають один на одного. De lagen, in de volgorde waarin ze op elkaar liggen. */
export const ZONE_LAGEN = ['basis', 'accent', 'tlo'] as const;
export type ZoneLaag = typeof ZONE_LAGEN[number];

/** Зразки наборів відтінків «Живого фону» (ті самі в картках вибору й у живому прикладі). Voorbeelden van de tinten van de achtergrond. */
export const TLO_VOORBEELD: Record<AchtergrondKleuren, string> = {
  thema: 'radial-gradient(circle at 30% 40%, var(--accent), transparent 62%), radial-gradient(circle at 75% 65%, color-mix(in srgb, var(--accent) 55%, #38bdf8), transparent 60%)',
  aurora: 'radial-gradient(circle at 25% 45%, #34d399, transparent 60%), radial-gradient(circle at 70% 40%, #a78bfa, transparent 58%), radial-gradient(circle at 55% 85%, #22d3ee, transparent 55%)',
  zee: 'radial-gradient(circle at 30% 40%, #38bdf8, transparent 60%), radial-gradient(circle at 75% 70%, #6366f1, transparent 58%)',
  zonsondergang: 'radial-gradient(circle at 30% 45%, #fb923c, transparent 60%), radial-gradient(circle at 72% 55%, #f472b6, transparent 58%), radial-gradient(circle at 50% 90%, #a855f7, transparent 55%)',
  regenboog: 'conic-gradient(from 30deg, #f87171, #fbbf24, #34d399, #38bdf8, #a78bfa, #f472b6, #f87171)',
};

/** Що фарбує кожен шар — один текст для легенди, підказок блоків і тесту. Wat elke laag kleurt: één tekst voor legenda, hints en test. */
export const LAAG_UITLEG: Record<ZoneLaag, { uk: [string, string]; nl: [string, string] }> = {
  basis: { uk: ['Палітра й режим', 'тло сторінки, картки, лінії й текст'], nl: ['Palet en modus', 'paginavlak, kaarten, lijnen en tekst'] },
  accent: { uk: ['Акцент', 'кнопки, посилання, активний пункт меню, перемикачі, рамка фокусу'], nl: ['Accent', 'knoppen, links, het actieve menu-item, schakelaars, de focusrand'] },
  tlo: { uk: ['Тло і глибина', 'плями живого фону під блоками, прозорість самих блоків і сяйво ілюстрацій центру облікового запису'], nl: ['Achtergrond en diepte', 'de vlekken van de levende achtergrond achter de blokken, de doorschijnendheid van de blokken zelf en de gloed van de illustraties in het accountcentrum'] },
};

/** Живий приклад. `wijs` — шар, який зараз підсвічено. Het levende voorbeeld; `wijs` = de laag die nu is uitgelicht. */
export function VoorbeeldVenster({ tr, wijs, onWijs }: { tr: Tr; wijs: ZoneLaag | null; onWijs: (laag: ZoneLaag | null) => void }) {
  const { stijl, achtergrond } = useThemaStand();
  const a = achtergrondVolledig(achtergrond);
  const t = typeof stijl.transparantie === 'number' && stijl.transparantie > 0 && !minderTransparantie() ? stijl.transparantie : 0;
  const effecten = typeof stijl.effecten === 'number' ? stijl.effecten : UITERLIJK_EFFECTEN_STANDAARD;
  const tloAan = a.stand !== 'uit';
  return <div className='vz-voorbeeld-vak' data-vz-voorbeeld data-wijs={wijs || undefined}>
    <div className='vz-voorbeeld' role='img'
      aria-label={tr('Приклад сторінки з поточними налаштуваннями: меню, картка з текстом, посиланням, кнопкою й перемикачем на тлі сторінки.', 'Voorbeeld van een pagina met de huidige instellingen: menu, een kaart met tekst, link, knop en schakelaar op het paginavlak.')}
      style={{ ['--vz-dekking' as string]: String(blokDekking(t)), ['--vz-glans' as string]: String(effecten / 100) }}>
      <span className='vz-v-tlo' data-laag='tlo' hidden={!tloAan} style={{ background: TLO_VOORBEELD[a.kleuren], opacity: Math.max(0.12, a.sterkte / 100) }} />
      <span className='vz-v-menu' data-laag='basis'><i /><i className='is-actief' data-laag='accent' /><i /><i /></span>
      <span className='vz-v-blok' data-laag='basis'>
        <b>{tr('Заголовок картки', 'Titel van de kaart')}</b>
        <span className='vz-v-tekst'>{tr('Звичайний текст і ', 'Gewone tekst en ')}<u data-laag='accent'>{tr('посилання', 'een link')}</u></span>
        <span className='vz-v-rij'><span className='vz-v-knop' data-laag='accent'>{tr('Кнопка', 'Knop')}</span><span className='vz-v-schakel' data-laag='accent' /></span>
      </span>
      <span className='vz-v-glans' data-laag='tlo' title={tr('Так світяться ілюстрації центру облікового запису.', 'Zo gloeien de illustraties van het accountcentrum.')} />
    </div>
    <ul className='vz-legenda' aria-label={tr('Що яке налаштування фарбує', 'Welke instelling wat kleurt')}>
      {ZONE_LAGEN.map((laag, i) => <li key={laag} data-vz-laag={laag} className={wijs === laag ? 'is-gewezen' : ''} tabIndex={0}
        onPointerEnter={() => onWijs(laag)} onPointerLeave={() => onWijs(null)} onFocus={() => onWijs(laag)} onBlur={() => onWijs(null)}>
        <i aria-hidden>{i + 1}</i><span><strong>{tr(LAAG_UITLEG[laag].uk[0], LAAG_UITLEG[laag].nl[0])}</strong>{' — '}{tr(LAAG_UITLEG[laag].uk[1], LAAG_UITLEG[laag].nl[1])}</span>
      </li>)}
    </ul>
  </div>;
}

const OPEN_SLEUTEL = 'mr-vormgeving-zone-open-v1';
const leesOpen = (): Partial<Record<ZoneLaag, boolean>> => { try { const v = JSON.parse(localStorage.getItem(OPEN_SLEUTEL) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

/** Згортний блок зони: номер шару, назва, поточне значення; стан «розгорнуто» пам'ятає цей браузер (лише зручність).
 *  Inklapbaar blok: laagnummer, naam, huidige waarde; of het open staat onthoudt deze browser (alleen gemak). */
export function ZoneBlok({ laag, titel, waarde, uitleg, standaardOpen, onWijs, children }: { laag: ZoneLaag; titel: string; waarde: string; uitleg: string; standaardOpen: boolean; onWijs: (laag: ZoneLaag | null) => void; children: ReactNode }) {
  const [open, setOpen] = useState(() => leesOpen()[laag] ?? standaardOpen);
  useEffect(() => { try { localStorage.setItem(OPEN_SLEUTEL, JSON.stringify({ ...leesOpen(), [laag]: open })); } catch { /* сховище недоступне — блок просто не запам'ятає стан */ } }, [laag, open]);
  return <details className='vz-blok' data-vz-blok={laag} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}
    onPointerEnter={() => onWijs(laag)} onPointerLeave={() => onWijs(null)} onFocusCapture={() => onWijs(laag)}>
    <summary title={uitleg}>
      <i className='vz-nummer' aria-hidden>{ZONE_LAGEN.indexOf(laag) + 1}</i>
      <span className='vz-blok-kop'><strong>{titel}</strong><small>{uitleg}</small></span>
      <span className='vz-waarde' data-vz-waarde>{waarde}</span>
      <ChevronDown className='vz-pijl' aria-hidden />
    </summary>
    <div className='vz-blok-inhoud'>{children}</div>
  </details>;
}

/** Низ зони: де діє зміна і скидання декоративних шарів. Voet: waar de wijziging geldt en het terugzetten van de sierlagen. */
export function ZoneVoet({ tr }: { tr: Tr }) {
  const technisch = (() => { try { return sessionStorage.getItem('tsv-weergave-ruimte') === 'technisch'; } catch { return false; } })();
  return <div className='vz-voet' data-vz-voet>
    <p className='thema-uitleg' data-vz-bereik={technisch ? 'technisch' : 'gebruiker'}>
      {tr('Кожна зміна зберігається одразу в обліковому записі й діє на всіх сервісах сайту (пошта, хмара, ШІ, дім, керування) і на всіх ваших пристроях після входу. ', 'Elke wijziging wordt meteen in het account bewaard en geldt op alle diensten van de site (mail, cloud, AI, huis, beheer) en op al uw apparaten na aanmelden. ')}
      {technisch
        ? tr('Зараз ви в технічному профілі: він має власний вигляд, звичайний профіль не зміниться.', 'U werkt nu in het technische profiel: dat heeft een eigen weergave, het gewone profiel verandert niet.')
        : tr('Технічний профіль має власний вигляд — він налаштовується окремо, коли профіль запущено.', 'Het technische profiel heeft een eigen weergave — die stelt u apart in wanneer het profiel loopt.')}
    </p>
    <button type='button' className='thema-knop' data-vz-herstel
      title={tr('Прибирає акцент, прозорість, сяйво й повертає «Живий фон» до типового. Палітра й режим лишаються як є.', 'Haalt accent, doorschijnendheid en gloed weg en zet de levende achtergrond terug. Palet en modus blijven zoals ze zijn.')}
      onClick={() => { zetWeergaveStijl({ accent: undefined, transparantie: undefined, effecten: undefined }); zetAchtergrond(undefined); }}>
      <RotateCcw aria-hidden />{tr('Типові акцент, тло й сяйво', 'Standaard accent, achtergrond en gloed')}
    </button>
  </div>;
}
