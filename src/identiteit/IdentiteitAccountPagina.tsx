// Оформлення сторінки облікового запису (завдання IDENTITY-002): оболонка одного екрана з меню-змістом, дванадцятьма розділами й підсвічуванням під час прокрутки.
// Розділи наповнює наявний код сторінок категорії «ідентичність» — тут лише розкладка й перехід до розділу.
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import './identiteit-account.css';
import { IDENTITEIT_TABS } from './identiteit-tabs';
import { useVlag, vlaggenBekend } from '../functievlag-lezen';
import { IdentiteitAtelier } from './IdentiteitAtelier';
import { useVormgeving } from './identiteit-vormgeving';
import { VormgevingKiezer } from './VormgevingKiezer';
import { IdentiteitMaquette, type MaquetteGebruiker } from './maquette/IdentiteitMaquette';

export type IdentiteitSectie = { id: string; titel: string; inhoud: ReactNode };

type Props = {
  lang: 'uk' | 'nl';
  /** Поточна сторінка з адреси (`p.tab`); після завантаження прокручуємо до неї. */
  actief: string;
  /** Заголовок сторінки, який уже є в застосунку (не дублюємо тексти). */
  kop?: ReactNode;
  secties: readonly IdentiteitSectie[];
  /** Перехід до розділу: застосунок сам вирішує, чи це зміна адреси, чи лише прокрутка. */
  onKies: (id: string) => void;
  /** Ім'я та світлина облікового запису для аватарів у вигляді «Макет». */
  gebruiker?: MaquetteGebruiker;
};

const sectieId = (id: string) => `identity-sectie-${id}`;

/** Запобіжник вигляду «Макет»: збій двигуна макета показує класичну сторінку замість порожнього екрана. Een fout in het ontwerp laat de klassieke pagina zien. */
class MaquetteGrens extends Component<{ terugval: ReactNode; children: ReactNode }, { fout: boolean }> {
  state = { fout: false };
  static getDerivedStateFromError() { return { fout: true }; }
  componentDidCatch(fout: unknown) { console.error('[identiteit] вигляд «Макет» впав, показано класичний вигляд:', fout); }
  render() { return this.state.fout ? this.props.terugval : this.props.children; }
}

export function IdentiteitAccountPagina({ lang, actief, kop, secties, onKies, gebruiker }: Props) {
  const [inBeeld, setInBeeld] = useState(actief);
  // Alleen de weergave wisselt. Dezelfde twaalf bestaande onderdelen en hun handelingen blijven bestaan.
  const atelier = useVlag('identiteit-account-atelier', false);
  // Прапорець відкриває вибір вигляду; сам вигляд обирає користувач (IDENTITEIT-007). Zonder vlag: altijd de klassieke weergave.
  const [vormgeving] = useVormgeving();
  // Зміна вигляду користувачем: робоча область прокручується вгору, інакше новий вигляд відкривається на випадковій глибині
  // попереднього (і перемикач класичної сторінки лишається поза екраном). Bij een andere weergave begint de pagina bovenaan.
  const vorigeVormgeving = useRef(vormgeving);
  useEffect(() => {
    if (vorigeVormgeving.current === vormgeving) return;
    vorigeVormgeving.current = vormgeving;
    const werkruimte = document.querySelector<HTMLElement>('.canonical-workspace');
    if (werkruimte) werkruimte.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }, [vormgeving]);

  // Адреса змінилася (наприклад, натискання в бічному меню або пряме посилання) — показуємо цей розділ.
  useEffect(() => {
    setInBeeld(actief);
    const doel = document.getElementById(sectieId(actief));
    if (doel && typeof doel.scrollIntoView === 'function') {
      doel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [actief]);

  // Підсвічування під час прокрутки: визначаємо розділ, який зараз найбільше видно. Без спостережника перетинів — тихо лишаємо як є.
  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return;
    const waarnemer = new IntersectionObserver(
      (entries) => {
        const beste = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = beste?.target.getAttribute('data-sectie');
        if (id) setInBeeld(id);
      },
      { rootMargin: '-15% 0px -55% 0px', threshold: [0, 0.2, 0.5, 0.8] },
    );
    for (const sectie of secties) {
      const el = document.getElementById(sectieId(sectie.id));
      if (el) waarnemer.observe(el);
    }
    return () => waarnemer.disconnect();
  }, [secties]);

  const kies = (id: string) => {
    setInBeeld(id);
    onKies(id);
    const doel = document.getElementById(sectieId(id));
    if (doel && typeof doel.scrollIntoView === 'function') {
      doel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  };

  // Поки прапорці не відомі, не показуємо жоден із двох виглядів: інакше старий вигляд на мить монтує всі 12 розділів,
  // їхні запити й прокрутки, а потім його змінює новий (сторінка «стрибала» вниз). Totdat de vlaggen bekend zijn: rustige plaatshouder.
  if (!vlaggenBekend()) return <div className='ia-account ia-wacht' aria-busy='true' aria-label={lang === 'uk' ? 'Завантаження налаштувань' : 'Instellingen laden'} />;
  if (atelier && vormgeving === 'studio') return <IdentiteitAtelier lang={lang} actief={actief} inBeeld={inBeeld} secties={secties} onKies={kies} />;

  const klassiek = (
    <div className='ia-account'>
      {atelier && <VormgevingKiezer lang={lang} />}
      {kop}
      <nav className='ia-toc' aria-label={lang === 'uk' ? 'Розділи облікового запису' : 'Accountonderdelen'}>
        {IDENTITEIT_TABS.map((tab, index) => (
          <button
            key={tab.id}
            type='button'
            className={inBeeld === tab.id ? 'ia-toc-knop actief' : 'ia-toc-knop'}
            aria-current={inBeeld === tab.id ? 'true' : undefined}
            onClick={() => kies(tab.id)}
          >
            <span className='ia-toc-nummer' aria-hidden='true'>{index + 1}</span>
            <span className='ia-toc-tekst'>{tab[lang]}</span>
          </button>
        ))}
        {/* Компактний перемикач у липкому меню: класична сторінка відкривається на розділі, а не згори, тож верхній перемикач поза екраном. */}
        {atelier && <VormgevingKiezer lang={lang} compact />}
      </nav>
      <div className='ia-secties'>
        {secties.map((sectie) => (
          <section
            key={sectie.id}
            id={sectieId(sectie.id)}
            data-sectie={sectie.id}
            className='ia-sectie'
            aria-labelledby={`${sectieId(sectie.id)}-kop`}
          >
            <h2 id={`${sectieId(sectie.id)}-kop`}>{sectie.titel}</h2>
            <div className='ia-inhoud'>{sectie.inhoud}</div>
          </section>
        ))}
      </div>
      {/* Під розділами теж, як у «Студії» та «Макеті»: дочитавши сторінку, можна одразу обрати інший вигляд. */}
      {atelier && <div className='ia-vormgeving-voet'><VormgevingKiezer lang={lang} /></div>}
    </div>
  );
  // Типовий вигляд — макет власника (IDENTITEIT-007); «Студія» і класичний лишаються на вибір. Збій макета повертає класичну сторінку.
  if (atelier && vormgeving === 'maquette') {
    return <MaquetteGrens terugval={klassiek}><IdentiteitMaquette lang={lang} actief={actief} secties={secties} onKies={onKies} gebruiker={gebruiker} /></MaquetteGrens>;
  }
  return klassiek;
}
