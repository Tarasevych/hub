// Оформлення сторінки облікового запису (завдання IDENTITY-002): оболонка одного екрана з меню-змістом, тринадцятьма розділами й підсвічуванням під час прокрутки.
// Розділи наповнює наявний код сторінок категорії «ідентичність» — тут лише розкладка й перехід до розділу.
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Columns3, Settings2, ShieldCheck, Palette, UsersRound, type LucideIcon } from 'lucide-react';
import '../maquette-kern/maquette-tokens.css';
import '../maquette-kern/maquette-oppervlakken.css';
import './identiteit-account.css';
import { MaquetteAnkerRail, type MaquetteAnkerItem } from '../maquette-kern/MaquetteAnkerRail';
import { IDENTITEIT_TABS } from './identiteit-tabs';
import { useVlag, vlaggenBekend } from '../functievlag-lezen';
import { ATELIER_GROEPEN, ATELIER_SYMBOLEN, IdentiteitAtelier } from './IdentiteitAtelier';
import { AtelierInhoud } from './atelier-inhoud';
import { VORMGEVING_TEKST, isKlassiekMaquettePalet, useBeschikbareVormgevingen, useVormgeving } from './identiteit-vormgeving';
import { VormgevingKiezer } from './VormgevingKiezer';
import { IdentiteitMaquette, type MaquetteGebruiker } from './maquette/IdentiteitMaquette';
import { IdentiteitKlassiekMaquette } from './IdentiteitKlassiekMaquette';
import { leesKeuze } from '../thema/kern';
import { useThemaStand } from '../thema/useThema';

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
  /** IDENTITEIT-015: справжня зміна мови сайту (cookie + обліковий запис) — для мовних кнопок картки «Мови» в «Макеті». */
  onTaal?: (lang: 'uk' | 'nl') => void;
};

const sectieId = (id: string) => `identity-sectie-${id}`;

/** Запобіжник вигляду «Макет»: збій двигуна макета показує класичну сторінку замість порожнього екрана. Een fout in het ontwerp laat de klassieke pagina zien. */
class MaquetteGrens extends Component<{ terugval: ReactNode; children: ReactNode }, { fout: boolean }> {
  state = { fout: false };
  static getDerivedStateFromError() { return { fout: true }; }
  componentDidCatch(fout: unknown) { console.error('[identiteit] вигляд «Макет» впав, показано класичний вигляд:', fout); }
  render() { return this.state.fout ? this.props.terugval : this.props.children; }
}

/** ZAVYSANNIA-001: вміст розділу класичної сторінки монтується, коли розділ підходить до екрана (або його обрано), і далі лишається.
 *  Раніше вихід із «Макета» в іншу тему в один кадр монтував усі 12 розділів з їхніми запитами — телефон завмирав на секунди.
 *  Zonder IntersectionObserver (server, tests): meteen alles, zoals vroeger. */
function LuiInhoud({ open, children }: { open: boolean; children: ReactNode }) {
  const [gemount, setGemount] = useState(() => open || typeof IntersectionObserver !== 'function');
  const plek = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) setGemount(true); }, [open]);
  useEffect(() => {
    const el = plek.current;
    if (gemount || !el || typeof IntersectionObserver !== 'function') return;
    const w = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setGemount(true); w.disconnect(); } }, { rootMargin: '600px 0px' });
    w.observe(el);
    return () => w.disconnect();
  }, [gemount]);
  if (gemount) return <>{children}</>;
  return <div ref={plek} className='ia-lui' aria-busy='true' style={{ minHeight: 160 }} />;
}

/** UNIF-ANKER-001 (стара вада, знайдена стендом): перехід до далекого розділу зупинявся на півдорозі. Розділи вище монтуються
 *  ліниво (LuiInhoud) саме під час плавної прокрутки, сторінка росте (у стенді 6,9 → 13,4 тис. px), і браузер доїжджає до старої
 *  позиції. Тепер ціль тримається до 5 с: коли прокрутка стала, а розділ не на місці, — ще раз без анімації; будь-яка дія людини
 *  (колесо, дотик, клавіша) зупиняє утримання. Het doel blijft tot 5 s vastgehouden; gebruikersinvoer stopt dat meteen. */
function gaNaarSectie(id: string, vasthouden: { current: (() => void) | null }) {
  vasthouden.current?.();
  vasthouden.current = null;
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const zonderBeweging = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  // Розділ може ще не існувати (сторінка відкривається за прямим посиланням, поки відомі не всі прапорці) — тоді чекаємо його появи.
  // De sectie kan nog ontbreken bij een directe link; dan wachten we tot ze verschijnt.
  let gestart = false;
  const start = () => {
    const doel = document.getElementById(sectieId(id));
    if (!doel || typeof doel.scrollIntoView !== 'function') return false;
    doel.scrollIntoView({ block: 'start', behavior: zonderBeweging ? 'auto' : 'smooth' });
    gestart = true;
    return true;
  };
  start();
  const begin = Date.now();
  let vorige = Number.NaN, rustig = 0;
  const invoer = ['wheel', 'touchstart', 'keydown'] as const;
  const stop = () => {
    window.clearInterval(klok);
    invoer.forEach((soort) => window.removeEventListener(soort, stop, true));
    if (vasthouden.current === stop) vasthouden.current = null;
  };
  const klok = window.setInterval(() => {
    if (Date.now() - begin > 5000) return stop();
    if (!gestart && !start()) return;
    const el = document.getElementById(sectieId(id));
    if (!el) return stop();
    const top = el.getBoundingClientRect().top;
    if (Math.abs(top - vorige) >= 1) { vorige = top; rustig = 0; return; } // ще їде
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
    const na = el.getBoundingClientRect().top;
    rustig = Math.abs(na - top) < 2 ? rustig + 1 : 0;
    vorige = na;
    if (rustig >= 4) stop();
  }, 120);
  invoer.forEach((soort) => window.addEventListener(soort, stop, { capture: true, passive: true }));
  vasthouden.current = stop;
}

export function IdentiteitAccountPagina({ lang, actief, kop, secties, onKies, gebruiker, onTaal }: Props) {
  const [inBeeld, setInBeeld] = useState(actief);
  const vasthouden = useRef<(() => void) | null>(null);
  useEffect(() => () => vasthouden.current?.(), []);
  // Alleen de weergave wisselt. Dezelfde dertien bestaande onderdelen en hun handelingen blijven bestaan.
  const atelierVlag = useVlag('identiteit-account-atelier', false);
  const themaStand = useThemaStand();
  const huidigPalet = String(leesKeuze(themaStand.theme, themaStand.palet).palet);
  const isThemaMaquette = huidigPalet === 'maquette';
  const isKlassiekPalet = isKlassiekMaquettePalet(huidigPalet);
  const atelier = atelierVlag || isThemaMaquette || isKlassiekPalet;
  // Прапорець або палітра «Макет» відкриває вибір вигляду; сам вигляд обирає користувач (IDENTITEIT-007). Zonder vlag of maquette-palet: altijd de klassieke weergave.
  const [vormgeving, kiesVormgeving] = useVormgeving();
  const beschikbareVormgevingen = useBeschikbareVormgevingen();
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

  const eigenWeergaveActief =
    isKlassiekPalet ||
    (atelier && (vormgeving === 'studio' || vormgeving === 'maquette'));

  // Адреса змінилася (наприклад, натискання в бічному меню або пряме посилання) — показуємо цей розділ.
  useEffect(() => {
    setInBeeld(actief);
    if (eigenWeergaveActief) return;
    gaNaarSectie(actief, vasthouden);
  }, [actief, eigenWeergaveActief]);

  // Підсвічування під час прокрутки: визначаємо розділ, який зараз найбільше видно. Без спостережника перетинів — тихо лишаємо як є.
  useEffect(() => {
    if (eigenWeergaveActief || typeof IntersectionObserver !== 'function') return;
    const waarnemer = new IntersectionObserver(
      (entries) => {
        if (vasthouden.current) return; // під час переходу підсвічено обраний розділ, а не ті, що пролітають повз
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
  }, [secties, eigenWeergaveActief]);

  const kies = (id: string) => {
    setInBeeld(id);
    onKies(id);
    gaNaarSectie(id, vasthouden);
  };

  // UNIF-ANKER-001 (16.11.2026): розділи класичного вигляду — у тому самому меню якорів, що й на інших сторінках сайту (MaquetteAnkerRail):
  // чотири змістові групи з піктограмами, як у «Студії» та класичному центрі, а також вибір вигляду сторінки як дії меню.
  // Раніше тут була власна липка смуга з 13 пігулок із номерами — без положення, компактності, згортання і шкали перегляду.
  // Dezelfde ankernavigatie als op de andere pagina's: vier groepen met iconen, plus de keuze van de weergave als actie.
  const ankerItems = useMemo<ReadonlyArray<MaquetteAnkerItem>>(() => {
    const GROEP_ICONEN: Record<(typeof ATELIER_GROEPEN)[number]['id'], LucideIcon> = { personal: Palette, social: UsersRound, account: Settings2, security: ShieldCheck };
    const groepen: MaquetteAnkerItem[] = ATELIER_GROEPEN.map((groep) => ({
      id: `groep-${groep.id}`,
      label: lang === 'uk' ? groep.ukKort : groep.nlKort,
      icoon: GROEP_ICONEN[groep.id],
      soort: 'groep' as const,
      badge: groep.bereik.replace(/\s+/g, ''),
      kiesbaar: false,
      kinderen: groep.ids.flatMap((atelierId) => {
        const id = atelierId === 'identities' ? 'identity' : atelierId;
        const index = IDENTITEIT_TABS.findIndex((t) => t.id === id);
        const sectie = secties.find((x) => x.id === id);
        if (!sectie || index < 0) return [];
        return [{ id, label: sectie.titel, icoon: ATELIER_SYMBOLEN[atelierId] ?? Settings2, badge: String(index + 1).padStart(2, '0') }];
      }),
    }));
    if (!atelier) return groepen;
    // Вибір вигляду: та сама логіка, що й у перемикачі над заголовком (недоступний вигляд не показуємо — пояснення є в повному перемикачі).
    const vormen = beschikbareVormgevingen.filter((v) => v !== vormgeving);
    if (vormen.length === 0) return groepen;
    return [...groepen, {
      id: 'groep-weergave',
      label: lang === 'uk' ? 'Вигляд сторінки' : 'Weergave',
      icoon: Columns3,
      soort: 'groep' as const,
      kiesbaar: false,
      kinderen: vormen.map((v) => ({
        id: `weergave-${v}`,
        label: lang === 'uk' ? `Перейти на «${VORMGEVING_TEKST[v].uk}»` : `Naar «${VORMGEVING_TEKST[v].nl}»`,
        soort: 'actie' as const,
        icoon: Columns3,
        onActie: () => kiesVormgeving(v),
      })),
    }];
  }, [lang, secties, atelier, beschikbareVormgevingen, vormgeving, kiesVormgeving]);

  // Поки прапорці не відомі, не показуємо жоден із двох виглядів: інакше старий вигляд на мить монтує всі 13 розділів,
  // їхні запити й прокрутки, а потім його змінює новий (сторінка «стрибала» вниз). Totdat de vlaggen bekend zijn: rustige plaatshouder.
  if (!vlaggenBekend()) return <div className='ia-account ia-wacht' aria-busy='true' aria-label={lang === 'uk' ? 'Завантаження налаштувань' : 'Instellingen laden'} />;
  if (atelier && vormgeving === 'studio') return <IdentiteitAtelier lang={lang} actief={actief} inBeeld={inBeeld} secties={secties} onKies={kies} />;

  const klassiek = (
    <AtelierInhoud.Provider value={true}>
    <div className='ia-account mq-schil'>
      {atelier && <VormgevingKiezer lang={lang} />}
      {kop}
      <MaquetteAnkerRail
        lang={lang}
        titel={lang === 'uk' ? 'Розділи' : 'Onderdelen'}
        items={ankerItems}
        actief={inBeeld}
        onKies={kies}
        opslagSleutel='identiteit-account'
      />
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
            <div className='ia-inhoud'><LuiInhoud open={inBeeld === sectie.id || actief === sectie.id}>{sectie.inhoud}</LuiInhoud></div>
          </section>
        ))}
      </div>
      {/* Під розділами теж, як у «Студії» та «Макеті»: дочитавши сторінку, можна одразу обрати інший вигляд. */}
      {atelier && <div className='ia-vormgeving-voet'><VormgevingKiezer lang={lang} /></div>}
    </div>
    </AtelierInhoud.Provider>
  );
  // Для тем «Біла класика» та «Чорна класика» вмикаємо прагматичний класичний центр облікового запису.
  if (isKlassiekPalet) {
    return <MaquetteGrens terugval={klassiek}><IdentiteitKlassiekMaquette lang={lang} actief={actief} inBeeld={inBeeld} secties={secties} onKies={kies} gebruiker={gebruiker} /></MaquetteGrens>;
  }
  // Типовий вигляд — макет власника (IDENTITEIT-007); «Студія» і класичний лишаються на вибір. Збій макета повертає класичну сторінку.
  if (atelier && vormgeving === 'maquette') {
    return <MaquetteGrens terugval={klassiek}><IdentiteitMaquette lang={lang} actief={actief} secties={secties} onKies={onKies} gebruiker={gebruiker} onTaal={onTaal} /></MaquetteGrens>;
  }
  return klassiek;
}
