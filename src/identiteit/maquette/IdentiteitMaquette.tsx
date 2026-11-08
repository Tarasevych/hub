// Вигляд «Макет» центру облікового запису (IDENTITEIT-007): розмітка, стилі й поведінка макета власника один в один,
// а в гніздах карток — справжні панелі сайту з чинними діями та правами. Тема й мова беруться із сайту, адресу змінює застосунок.
// De weergave «Ontwerp»: het ontwerp van de eigenaar als omlijsting, de echte onderdelen van de site in de kaarten.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './maquette-stijlen.css';
import './maquette-omlijsting.css';
import { MAQUETTE_SJABLOON } from './maquette-sjabloon';
import { startMaquette, type Maquette, type MaquetteOpties } from './maquette-motor';
import { VormgevingKiezer } from '../VormgevingKiezer';

export type MaquetteGebruiker = { naam: string; foto: string } | null;

type Sectie = { id: string; titel: string; inhoud: ReactNode };
type Props = {
  lang: 'uk' | 'nl';
  /** Поточний розділ з адреси (`p.tab`). */
  actief: string;
  secties: readonly Sectie[];
  /** Перехід до розділу користувачем: застосунок змінює адресу. */
  onKies: (id: string) => void;
  /** Ім'я та світлина облікового запису — для аватарів макета (файл тут не обирають; це робить розділ «Акаунт»). */
  gebruiker?: MaquetteGebruiker;
};

/** Ідентифікатори макета ↔ сайту: лише «identities» ↔ «identity» відрізняються. */
export const naarSite = (id: string) => (id === 'identities' ? 'identity' : id);
export const naarOntwerp = (id: string) => (id === 'identity' ? 'identities' : id);

const helder = () => typeof document !== 'undefined' &&
  (document.documentElement.classList.contains('theme-light') || document.documentElement.classList.contains('theme-plum-light'));

const profiel = (g: MaquetteGebruiker | undefined): MaquetteOpties['profiel'] =>
  g && (g.naam || g.foto) ? { bevestigd: true, naam: g.naam || '', foto: g.foto || '' } : null;

export function IdentiteitMaquette({ lang, actief, secties, onKies, gebruiker }: Props) {
  const wortel = useRef<HTMLDivElement>(null);
  const motor = useRef<Maquette | null>(null);
  // Гнізда .mq-echt у живій розмітці; картки будуються рядком HTML, тож після кожного перемальовування збираємо їх знову.
  const [gaten, setGaten] = useState<HTMLElement[]>([]);
  const onKiesRef = useRef(onKies);
  onKiesRef.current = onKies;
  // Перехід, що почався в самому макеті: зміна адреси у відповідь не має відкривати панель удруге.
  const eigenKeuze = useRef<string | null>(null);

  const verzamelGaten = () => {
    const root = wortel.current;
    if (!root) return;
    setGaten(Array.from(root.querySelectorAll<HTMLElement>('.mq-echt[data-echt]')));
  };

  useLayoutEffect(() => {
    const root = wortel.current;
    if (!root) return;
    const m = startMaquette(root, {
      lang,
      licht: helder(),
      profiel: profiel(gebruiker),
      bijKies: (id) => { const s = naarSite(id); eigenKeuze.current = s; onKiesRef.current(s); },
      bijOpenen: verzamelGaten,
      bijRender: verzamelGaten,
    });
    motor.current = m;
    verzamelGaten();
    // Початковий розділ з адреси: для карток без прямої панелі одразу розгортаємо справжні налаштування.
    if (actief && actief !== 'intro') m.ga(naarOntwerp(actief), true);
    // Тема сайту може змінитися, поки вигляд відкритий (перемикач у шапці або в розділі «Теми»).
    const kijker = new MutationObserver(() => m.zetLicht(helder()));
    kijker.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => { kijker.disconnect(); m.stop(); motor.current = null; };
    // Мова перезапускає двигун (усі тексти макета — з його словника); решта оновлюється окремими ефектами.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Адреса змінилася ззовні (бічне меню сайту, пряме посилання): показуємо розділ і його справжню панель.
  useEffect(() => {
    const m = motor.current;
    if (!m || !actief) return;
    if (eigenKeuze.current === actief) { eigenKeuze.current = null; return; }
    m.ga(naarOntwerp(actief), true);
  }, [actief]);

  useEffect(() => { motor.current?.zetProfiel(profiel(gebruiker)); }, [gebruiker?.naam, gebruiker?.foto]);

  return (
    <>
      <div ref={wortel} className='mr-mq' lang={lang} data-vormgeving='maquette'
        // Розмітка макета незмінна й згенерована з його index.html; динамічні частини малює двигун.
        dangerouslySetInnerHTML={{ __html: MAQUETTE_SJABLOON }} />
      {gaten.map((gat) => {
        const id = gat.dataset.echt || '';
        if (id.startsWith('vormgeving')) return createPortal(<VormgevingKiezer lang={lang} className='mq-kiezer' />, gat, id);
        const sectie = secties.find((s) => s.id === naarSite(id));
        return sectie ? createPortal(<div className='mq-echt-inhoud'>{sectie.inhoud}</div>, gat, id) : null;
      })}
    </>
  );
}
