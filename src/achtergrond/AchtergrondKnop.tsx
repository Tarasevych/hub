// ACHTERGROND-001 (крок 2): швидке керування «Живим фоном» просто зі сторінки — кнопка вгорі (у верхній смузі оболонки, а у вигляді
// «Макет» — у його власній шапці) і компактна панель, як у тла поштової служби: рівні від ледь помітного до вражаючого, швидкість,
// інтенсивність, перелив, кількість, форма, розмір, рух, кольори, кадри. Ті самі збережені налаштування, що й «Налаштування → Теми →
// Живий фон» (обліковий запис, окремо для звичайного й технічного профілю). Кожна зміна одразу видна на тлі.
// Snelle bediening van de levende achtergrond vanaf de pagina; dezelfde opgeslagen instellingen als Instellingen → Thema's.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, RotateCcw, Waves, X } from 'lucide-react';
import { ACHTERGROND_GRENZEN, ACHTERGROND_NIVEAUS, ACHTERGROND_NIVEAU_WAARDEN, achtergrondNiveau, achtergrondVolledig, normaliseerAchtergrond, type AchtergrondKader, type AchtergrondKleuren, type AchtergrondNiveau, type AchtergrondOvergang, type AchtergrondStand, type UiterlijkAchtergrond } from '../../shared/uiterlijk';
import { useThemaStand, zetAchtergrond } from '../thema/useThema';
import './achtergrond-knop.css';

type Tr = (uk: string, nl: string) => string;

export function AchtergrondPaneel({ tr, onSluit }: { tr: Tr; onSluit?: () => void }) {
  const { achtergrond } = useThemaStand();
  const a = achtergrondVolledig(achtergrond);
  const zet = (patch: Partial<UiterlijkAchtergrond>) => zetAchtergrond(normaliseerAchtergrond({ ...a, ...patch }));
  const uit = a.stand === 'uit';
  const niveau = achtergrondNiveau(a);
  const niveaus: Record<AchtergrondNiveau, [string, string]> = {
    subtiel: [tr('Ледь помітно', 'Nauwelijks'), tr('Майже нерухоме бліде тло — найменше відволікає й найменше витрачає батарею.', 'Bijna stilstaand, bleek vlak — leidt het minst af en kost de minste batterij.')],
    rustig: [tr('Спокійно', 'Rustig'), tr('Типовий рівень: м\'який перелив, як повільні хмари.', 'Standaard: zacht verloop, zoals trage wolken.')],
    levendig: [tr('Жваво', 'Levendig'), tr('Помітніший рух і кольори, більше плям.', 'Meer beweging en kleur, meer vlekken.')],
    opvallend: [tr('Вражаюче', 'Opvallend'), tr('Яскраві плями, що швидко переливаються. Текст поза картками може читатися гірше; на телефоні більше витрачає батарею.', 'Felle, snel vloeiende vlekken. Tekst buiten de kaarten leest minder goed; op een telefoon kost het meer batterij.')],
  };
  const standen: Array<[AchtergrondStand, string, string]> = [
    ['auto', tr('Авто', 'Auto'), tr('Повний на ПК, полегшений на телефоні й планшеті; «Зменшити рух» у системі зупиняє рух.', 'Volledig op de pc, licht op telefoon en tablet; «Beweging beperken» stopt de beweging.')],
    ['aan', tr('Повний', 'Volledig'), tr('Усі плями й кадри на будь-якому пристрої — на телефоні більше витрачає батарею.', 'Alle vlekken en beelden op elk apparaat — kost op een telefoon meer batterij.')],
    ['uit', tr('Вимк.', 'Uit'), tr('Фон не малюється — нуль навантаження, повертається нерухоме тло теми.', 'Niets getekend — geen belasting, het stilstaande vlak van het thema komt terug.')],
  ];
  const schuif = (veld: keyof typeof ACHTERGROND_GRENZEN, naam: string, uitleg: string, tekst: (v: number) => string) => {
    const [min, max] = ACHTERGROND_GRENZEN[veld];
    return <label className='la-snel-schuif' title={uitleg} data-achtergrond-snel-veld={veld}>
      <span>{naam}<output>{tekst(a[veld])}</output></span>
      <input type='range' min={min} max={max} step={1} value={a[veld]} disabled={uit} aria-valuetext={tekst(a[veld])} onChange={(e) => zet({ [veld]: Number(e.target.value) })} />
    </label>;
  };
  const traag = (v: number) => (v < 20 ? tr('ледь', 'nauwelijks') : v < 45 ? tr('повільно', 'traag') : v < 70 ? tr('помірно', 'matig') : tr('жваво', 'levendig'));
  return <div className='la-snel-paneel' role='group' aria-label={tr('Налаштування живого фону', 'Instellingen van de levende achtergrond')} data-achtergrond-paneel>
    <div className='la-snel-kop'><Waves aria-hidden /><strong>{tr('Живий фон', 'Levende achtergrond')}</strong>
      {onSluit && <button type='button' onClick={onSluit} aria-label={tr('Закрити', 'Sluiten')}><X aria-hidden /></button>}</div>
    <div className='la-snel-segment' role='radiogroup' aria-label={tr('Режим', 'Modus')}>
      {standen.map(([id, naam, uitleg]) => <button key={id} type='button' role='radio' aria-checked={a.stand === id} title={uitleg} onClick={() => zet({ stand: id })} data-achtergrond-snel-stand={id}>{naam}</button>)}
    </div>
    <div className='la-snel-niveaus' role='radiogroup' aria-label={tr('Рівень', 'Niveau')}>
      {ACHTERGROND_NIVEAUS.map((n) => <button key={n} type='button' role='radio' aria-checked={niveau === n} title={niveaus[n][1]} disabled={uit} onClick={() => zet(ACHTERGROND_NIVEAU_WAARDEN[n])} data-achtergrond-niveau={n}>
        <i data-n={n} aria-hidden />{niveaus[n][0]}{n === 'opvallend' && <AlertTriangle className='la-let-op' aria-label={tr('Більше батареї, гірша читабельність', 'Meer batterij, minder leesbaar')} />}
      </button>)}
    </div>
    {schuif('tempo', tr('Швидкість', 'Snelheid'), tr('Як швидко пливуть плями. На батарею майже не впливає.', 'Hoe snel de vlekken drijven. Bijna geen invloed op de batterij.'), traag)}
    {schuif('sterkte', tr('Інтенсивність', 'Sterkte'), tr('Яскравість плям. Вище 75 % текст поза картками читається гірше.', 'Helderheid van de vlekken. Boven 75 % leest tekst buiten de kaarten minder goed.'), (v) => `${v}%`)}
    {schuif('kleurwissel', tr('Плавність переливу', 'Kleurverloop'), tr('Як швидко плями переходять з відтінку у відтінок; 0 — сталі кольори.', 'Hoe snel de vlekken van tint wisselen; 0 — vaste kleuren.'), (v) => (v === 0 ? tr('сталі', 'vast') : traag(v)))}
    {schuif('aantal', tr('Кількість', 'Aantal'), tr('Більше плям — багатша картина й трохи більше роботи для пристрою (на телефоні в «Авто» не більше 4).', 'Meer vlekken — rijker beeld en iets meer werk (op een telefoon in «Auto» hoogstens 4).'), (v) => String(v))}
    {schuif('vervorming', tr('Форма', 'Vorm'), tr('0 — майже круглі; 100 — витягнуті, неправильні форми.', '0 — bijna rond; 100 — uitgerekt en grillig.'), (v) => `${v}%`)}
    {schuif('grootte', tr('Розмір', 'Grootte'), tr('Великі плями зливаються в один м\'який градієнт.', 'Grote vlekken vloeien samen tot één zacht verloop.'), (v) => `${v}%`)}
    <div className='la-snel-keuzes'>
      <label title={tr('Характер руху плям.', 'Soort beweging van de vlekken.')}>{tr('Рух', 'Beweging')}
        <select value={a.overgang} disabled={uit} onChange={(e) => zet({ overgang: e.target.value as AchtergrondOvergang })} data-achtergrond-snel-overgang>
          <option value='golf'>{tr('Хвилі', 'Golven')}</option><option value='drift'>{tr('Дрейф від краю до краю', 'Drift van rand tot rand')}</option><option value='adem'>{tr('Дихання', 'Ademen')}</option>
        </select></label>
      <label title={tr('Набір відтінків; «Як у темі» завжди пасує до сайту.', 'Kleurenset; «Zoals het thema» past altijd bij de site.')}>{tr('Кольори', 'Kleuren')}
        <select value={a.kleuren} disabled={uit} onChange={(e) => zet({ kleuren: e.target.value as AchtergrondKleuren })} data-achtergrond-snel-kleuren>
          <option value='thema'>{tr('Як у темі', 'Zoals het thema')}</option><option value='aurora'>{tr('Полярне сяйво', 'Noorderlicht')}</option><option value='zee'>{tr('Море', 'Zee')}</option>
          <option value='zonsondergang'>{tr('Захід сонця', 'Zonsondergang')}</option><option value='regenboog'>{tr('Веселка', 'Regenboog')}</option>
        </select></label>
      <label title={tr('Більше кадрів — плавніше, але більше витрачає батарею (60 к/с помітно на ноутбуці й телефоні).', 'Meer beelden — vloeiender, maar meer batterij (60 b/s merkbaar op laptop en telefoon).')}>{tr('Кадри', 'Beelden')}
        <select value={a.kader} disabled={uit} onChange={(e) => zet({ kader: e.target.value as AchtergrondKader })} data-achtergrond-snel-kader>
          <option value='zuinig'>{tr('Ощадно · 15/с', 'Zuinig · 15/s')}</option><option value='normaal'>{tr('Звичайно · 30/с', 'Normaal · 30/s')}</option><option value='vloeiend'>{tr('Плавно · 60/с ⚠', 'Vloeiend · 60/s ⚠')}</option>
        </select></label>
    </div>
    <div className='la-snel-voet'>
      <button type='button' onClick={() => zetAchtergrond(undefined)} title={tr('Повертає всі параметри фону до типових.', 'Zet alle instellingen van de achtergrond terug.')} data-achtergrond-snel-herstel><RotateCcw aria-hidden />{tr('Типово', 'Standaard')}</button>
      <small>{tr('Зберігається в обліковому записі; те саме — в Налаштування → Теми.', 'Bewaard in het account; hetzelfde staat in Instellingen → Thema\'s.')}</small>
    </div>
  </div>;
}

/** Кнопка вгорі сторінки + панель під нею (портал у body, щоб її не обрізала шапка). Knop bovenaan + paneel eronder. */
export default function AchtergrondKnop({ lang, variant = 'schil' }: { lang: 'uk' | 'nl'; variant?: 'schil' | 'maquette' }) {
  const tr: Tr = (uk, nl) => (lang === 'nl' ? nl : uk);
  const [open, setOpen] = useState(false);
  const knop = useRef<HTMLButtonElement>(null);
  const paneel = useRef<HTMLDivElement>(null);
  const [plek, setPlek] = useState<{ top: number; right: number }>({ top: 64, right: 12 });
  useLayoutEffect(() => {
    if (!open || !knop.current) return;
    const zet = () => {
      // Панель вирівнюється за правим краєм кнопки, але ніколи не виходить за край екрана (вузький телефон, кнопка не біля краю).
      const r = knop.current!.getBoundingClientRect(), vw = window.innerWidth, breedte = Math.min(320, vw - 24);
      setPlek({ top: Math.round(r.bottom + 8), right: Math.round(vw - Math.min(vw - 12, Math.max(12 + breedte, r.right))) });
    };
    zet(); window.addEventListener('resize', zet);
    return () => window.removeEventListener('resize', zet);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); knop.current?.focus(); } };
    const buiten = (e: PointerEvent) => { const t = e.target as Node; if (!paneel.current?.contains(t) && !knop.current?.contains(t)) setOpen(false); };
    document.addEventListener('keydown', esc); document.addEventListener('pointerdown', buiten, true);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', buiten, true); };
  }, [open]);
  return <>
    <button ref={knop} type='button' className={`la-knop la-knop-${variant}`} aria-expanded={open} aria-haspopup='true' onClick={() => setOpen((v) => !v)} data-achtergrond-knop
      aria-label={tr('Живий фон: налаштувати анімацію тла', 'Levende achtergrond: animatie instellen')}
      title={tr('Живий фон: швидкість, інтенсивність, перелив, кількість і форма плям — від ледь помітного до вражаючого. Зберігається в обліковому записі.', 'Levende achtergrond: snelheid, sterkte, kleurverloop, aantal en vorm van de vlekken — van nauwelijks zichtbaar tot opvallend. Bewaard in het account.')}>
      <Waves aria-hidden />
    </button>
    {open && createPortal(<div ref={paneel} className='la-snel-laag' style={{ top: plek.top, right: plek.right, maxHeight: `calc(100dvh - ${plek.top + 12}px)` }}>
      <AchtergrondPaneel tr={tr} onSluit={() => { setOpen(false); knop.current?.focus(); }} />
    </div>, (knop.current?.closest('.canonical-chrome') as HTMLElement | null) || document.body)}
  </>;
}

/**
 * У вигляді «Макет» верхня смуга оболонки схована, тож кнопка стає в його власну шапку (.mr-mq .top-actions) — перед пошуком.
 * Шапку будує шаблон макета, тому шукаємо її легким опитуванням лише поки <html data-identiteit-maquette="aan">.
 * In de weergave «Maquette» komt de knop in de eigen kopbalk van de maquette, vóór de zoekknop.
 */
export function AchtergrondKnopMaquette({ lang }: { lang: 'uk' | 'nl' }) {
  const [gastheer, setGastheer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let plek: HTMLSpanElement | null = null;
    const zoek = () => {
      const acties = document.documentElement.dataset.identiteitMaquette === 'aan' ? document.querySelector<HTMLElement>('.mr-mq .top-actions') : null;
      if (plek && plek.parentElement === acties) return;
      plek?.remove(); plek = null;
      if (acties) {
        plek = document.createElement('span');
        plek.className = 'la-knop-gastheer';
        const zoekKnop = acties.querySelector('.search-action');
        acties.insertBefore(plek, zoekKnop || acties.firstChild);
      }
      setGastheer(plek);
    };
    zoek();
    const id = window.setInterval(zoek, 1000);
    return () => { clearInterval(id); plek?.remove(); };
  }, []);
  return gastheer ? createPortal(<AchtergrondKnop lang={lang} variant='maquette' />, gastheer) : null;
}
