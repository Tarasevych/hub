// Hub → «Огляд» (/overzicht): het BUREAUBLAD. De gebruiker legt zelf tegels neer, sleept ze op hun plek,
// wijzigt hun formaat en dat alles blijft PER GEBRUIKER op de server staan (POST /api/owner/hub/bureau/load|save).
//
// Hergebruik in plaats van namaak:
//   * de vorm en de bediening van een venster komen uit src/platform/vensters.css (.venster, .venster-kop,
//     .venster-knoppen, .venster-grootte) — dus een tegel ziet uit en voelt als elk ander venster van de site;
//   * de catalogus «+ Додати блок» opent in het echte vensterbeheer (src/platform/vensters.tsx → <Venster/>),
//     met slepen, formaat, minimaliseren naar het dok en de gezamenlijke vensterlaag;
//   * de regels van de indeling staan zuiver in shared/bureau-indeling.ts en draaien ook op de server.
//
// Toetsenbord op de titelbalk van een tegel: ← → verplaatsen, Shift+← → breedte, Shift+↑ ↓ hoogte, Delete weghalen.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Activity, Bot, CalendarDays, CheckSquare, Code2, FolderOpen, GripVertical, LayoutGrid, Mail, NotebookPen, Plus, RotateCcw, Trash2, X, type LucideIcon } from 'lucide-react';
import { Venster } from '../platform/vensters';
import TegelInhoud from './Tegels';
import { bewaarBureau, haalBureau } from './api';
import { RuimteGeslotenVlak, RuimteStrook } from '../RuimteStrook';
import type { RuimteFeiten, RuimteGesloten } from '../../shared/ruimte-weergave';
import {
  BUREAU_CATEGORIEEN, BUREAU_WIDGETS, EERSTE_SUGGESTIE, KOLOMMEN, MAX_TEGELS, RIJEN, bureauTekst, bureauWidget,
  formaatTegel, gelijkBureau, leegBureau, leegIs, neerzetIndex, normaliseerBureau, schuifTegel, stapFormaat, verplaatsTegel, verwijderTegel, voegTegelToe,
  type BureauCategorie, type BureauIndeling, type BureauWidgetId,
} from '../../shared/bureau-indeling';
import '../platform/vensters.css';
import './bureau.css';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);

const CAT_ICOON: Record<BureauCategorie, LucideIcon> = {
  post: Mail, agenda: CalendarDays, bestanden: FolderOpen, taken: CheckSquare, notities: NotebookPen, github: Code2, diensten: Activity, ai: Bot,
};

export default function Bureau({ lang, ownerUserId, magBewerken }: { lang: Lang; ownerUserId: string; magBewerken: boolean }) {
  const [indeling, setIndeling] = useState<BureauIndeling>(leegBureau);
  const [geladen, setGeladen] = useState(false);
  const [fout, setFout] = useState('');
  /** In welke gegevenslade staat dit bureaublad (0086), en als de poort dicht is: waarom. */
  const [ruimte, setRuimte] = useState<RuimteFeiten | null>(null);
  const [gesloten, setGesloten] = useState<RuimteGesloten | null>(null);
  const [catalogus, setCatalogus] = useState(false);
  const [cat, setCat] = useState<BureauCategorie | 'alles'>('alles');
  const [sleept, setSleept] = useState('');
  const raster = useRef<HTMLDivElement | null>(null);
  const bewaarKeten = useRef<Promise<unknown>>(Promise.resolve());
  const laatstBewaard = useRef<BureauIndeling>(leegBureau());

  useEffect(() => {
    let actief = true;
    haalBureau().then((r) => { if (!actief) return; setIndeling(r.indeling); laatstBewaard.current = r.indeling; setRuimte(r.ruimte); setGesloten(r.gesloten); setFout(''); })
      .catch((e: unknown) => { if (actief) setFout(String((e as Error)?.message || 'FOUT')); })
      .finally(() => { if (actief) setGeladen(true); });
    return () => { actief = false; };
  }, [ownerUserId]);

  /** Elke wijziging gaat eerst door de zuivere regels en daarna in één keten naar de server. */
  const zet = useCallback((volgende: BureauIndeling) => {
    const schoon = normaliseerBureau(volgende);
    setIndeling(schoon);
    if (gelijkBureau(schoon, laatstBewaard.current)) return;
    laatstBewaard.current = schoon;
    bewaarKeten.current = bewaarKeten.current.catch(() => undefined)
      .then(() => bewaarBureau(schoon))
      .then(() => setFout(''))
      .catch((e: unknown) => setFout(String((e as Error)?.message || 'FOUT')));
  }, []);

  const tegels = indeling.tegels;
  const vol = tegels.length >= MAX_TEGELS;
  const zichtbareCatalogus = useMemo(() => BUREAU_WIDGETS.filter((w) => cat === 'alles' || w.cat === cat), [cat]);

  // ---------------------------------------------------------------- slepen (muis, pen, aanraken; geen HTML5-drag)
  const sleepRef = useRef<{ tid: string; x: number; y: number; actief: boolean } | null>(null);
  const startSleep = (tid: string) => (e: ReactPointerEvent) => {
    if (!magBewerken || e.button !== 0 || (e.target as HTMLElement).closest('button,a,input,select')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    sleepRef.current = { tid, x: e.clientX, y: e.clientY, actief: false };
  };
  const beweegSleep = (e: ReactPointerEvent) => {
    const d = sleepRef.current;
    if (!d) return;
    if (!d.actief && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 6) return;
    if (!d.actief) { d.actief = true; setSleept(d.tid); }
    e.preventDefault();
  };
  const eindSleep = (e: ReactPointerEvent) => {
    const d = sleepRef.current;
    sleepRef.current = null;
    setSleept('');
    if (!d?.actief || !raster.current) return;
    const kaarten = [...raster.current.querySelectorAll<HTMLElement>('[data-bureau-tegel]')];
    const andere = kaarten.filter((el) => el.dataset.bureauTegel !== d.tid);
    const index = neerzetIndex(andere.map((el) => el.getBoundingClientRect()), e.clientX, e.clientY);
    const doelTid = andere[index]?.dataset.bureauTegel ?? '';
    const doel = doelTid ? tegels.findIndex((t) => t.tid === doelTid) : tegels.length - 1;
    zet(verplaatsTegel(indeling, d.tid, doel < 0 ? 0 : doel));
  };

  // ---------------------------------------------------------------- formaat met de greep rechtsonder (zoals .venster-grootte)
  const maatRef = useRef<{ tid: string; x: number; y: number; k: number; r: number; kolomBreedte: number; rijHoogte: number } | null>(null);
  const startMaat = (tid: string) => (e: ReactPointerEvent) => {
    const tegel = tegels.find((t) => t.tid === tid);
    const vak = raster.current;
    if (!magBewerken || !tegel || !vak || e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const stijl = getComputedStyle(vak);
    const kolommen = stijl.gridTemplateColumns.split(' ').length || 12;
    maatRef.current = { tid, x: e.clientX, y: e.clientY, k: tegel.k, r: tegel.r, kolomBreedte: vak.clientWidth / Math.max(1, kolommen), rijHoogte: parseFloat(stijl.gridAutoRows) || 96 };
  };
  const beweegMaat = (e: ReactPointerEvent) => {
    const d = maatRef.current;
    if (!d) return;
    e.preventDefault();
    const k = d.k + Math.round((e.clientX - d.x) / Math.max(1, d.kolomBreedte));
    const r = d.r + Math.round((e.clientY - d.y) / Math.max(1, d.rijHoogte));
    setIndeling((huidig) => formaatTegel(huidig, d.tid, k, r));
  };
  const eindMaat = () => { const d = maatRef.current; maatRef.current = null; if (d) zet(indeling); };

  const toetsKop = (tid: string) => (e: ReactKeyboardEvent) => {
    if (!magBewerken) return;
    const tegel = tegels.find((t) => t.tid === tid);
    const def = tegel && bureauWidget(tegel.id);
    if (!tegel || !def) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); zet(verwijderTegel(indeling, tid)); return; }
    const richting = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
    if (!richting) return;
    e.preventDefault();
    if (!e.shiftKey) { zet(schuifTegel(indeling, tid, richting as -1 | 1)); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') zet(formaatTegel(indeling, tid, stapFormaat(tegel.k, KOLOMMEN, def.minK, richting as -1 | 1)));
    else zet(formaatTegel(indeling, tid, undefined, stapFormaat(tegel.r, RIJEN, def.minR, richting as -1 | 1)));
  };

  const voegToe = (id: BureauWidgetId) => zet(voegTegelToe(indeling, id));
  const eersteDrie = () => { let next = indeling; for (const id of EERSTE_SUGGESTIE) next = voegTegelToe(next, id); zet(next); };

  const kop = (
    <div className='bureau-balk'>
      <h2><LayoutGrid aria-hidden='true' />{tr(lang, 'Робочий стіл', 'Bureaublad')}</h2>
      <RuimteStrook feiten={ruimte} lang={lang} />
      {gesloten ? <RuimteGeslotenVlak gesloten={gesloten} lang={lang} /> : null}
      <p>{tegels.length
        ? tr(lang, `${tegels.length} з ${MAX_TEGELS} блоків. Перетягніть заголовок, щоб переставити; куток — щоб змінити розмір.`, `${tegels.length} van ${MAX_TEGELS} blokken. Sleep de titelbalk om te verplaatsen; de hoek om het formaat te wijzigen.`)
        : tr(lang, 'Складіть свій стіл із блоків, які справді читають ваші дані.', 'Stel uw bureaublad samen uit blokken die uw gegevens werkelijk lezen.')}</p>
      {magBewerken ? (
        <div className='bureau-balk-acties'>
          <button type='button' className='primary' data-bureau-catalogus='open' onClick={() => setCatalogus(true)} disabled={vol}>
            <Plus aria-hidden='true' />{tr(lang, 'Додати блок', 'Blok toevoegen')}
          </button>
          {tegels.length ? <button type='button' className='ghost' onClick={() => zet(leegBureau())}><RotateCcw aria-hidden='true' />{tr(lang, 'Очистити стіл', 'Bureaublad leegmaken')}</button> : null}
        </div>
      ) : null}
      {vol ? <p className='bureau-grens'>{tr(lang, `Більше ніж ${MAX_TEGELS} блоків на стіл не кладемо — приберіть щось, щоб додати нове.`, `Meer dan ${MAX_TEGELS} blokken leggen we niet neer — haal er iets af om iets nieuws toe te voegen.`)}</p> : null}
      {fout ? <p className='bureau-fout' role='alert'>{/^OWNER_HUB_BUREAU_/.test(fout) || /401|403/.test(fout)
        ? tr(lang, 'Розкладку столу можна зберегти лише після входу у ваш акаунт.', 'De indeling kan alleen worden bewaard als u in uw account bent aangemeld.')
        : tr(lang, `Розкладку не збережено (${fout}).`, `De indeling is niet bewaard (${fout}).`)}</p> : null}
    </div>
  );

  const leegStaat = (
    <section className='bureau-leeg' data-bureau-leeg='1'>
      <LayoutGrid aria-hidden='true' />
      <h3>{tr(lang, 'Ваш стіл поки порожній', 'Uw bureaublad is nog leeg')}</h3>
      <p>{tr(lang, 'Покладіть на нього блоки — пошту, календар, завдання, нотатки, файли або стан ваших служб. Усі вони читають саме ваші дані; те, чого ще немає на сервері, позначено «скоро».', 'Leg er blokken op — e-mail, agenda, taken, notities, bestanden of de stand van uw diensten. Ze lezen allemaal uw eigen gegevens; wat de server nog niet kan, staat als «binnenkort» aangegeven.')}</p>
      {magBewerken ? (
        <div className='bureau-leeg-acties'>
          <button type='button' className='primary' data-bureau-leeg-eerste='1' onClick={eersteDrie}>
            <Plus aria-hidden='true' />{tr(lang, 'Почати з пошти, календаря й завдань', 'Begin met e-mail, agenda en taken')}
          </button>
          <button type='button' className='ghost' onClick={() => setCatalogus(true)}>
            <LayoutGrid aria-hidden='true' />{tr(lang, 'Відкрити каталог блоків', 'De blokkencatalogus openen')}
          </button>
        </div>
      ) : <p className='bureau-grens'>{tr(lang, 'Складати стіл може власник цього простору.', 'De eigenaar van deze ruimte stelt het bureaublad samen.')}</p>}
    </section>
  );

  return (
    <section className='bureau' data-bureau-tegels={String(tegels.length)} aria-labelledby='bureau-kop'>
      <div id='bureau-kop'>{kop}</div>
      {!geladen ? <p className='bureau-laden'>{tr(lang, 'Відновлюємо ваш стіл…', 'Uw bureaublad wordt teruggezet…')}</p>
        : leegIs(indeling) ? leegStaat : (
          <div className='bureau-raster' ref={raster} data-bureau-raster='12'>
            {tegels.map((tegel, i) => {
              const def = bureauWidget(tegel.id)!;
              const Icoon = CAT_ICOON[def.cat];
              const stijl = { '--tegel-k': tegel.k, '--tegel-r': tegel.r } as CSSProperties;
              return (
                <article key={tegel.tid} className={`venster bureau-tegel${sleept === tegel.tid ? ' is-sleept' : ''}`} style={stijl} data-bureau-tegel={tegel.tid} data-bureau-widget={tegel.id} aria-label={bureauTekst(def.titel, lang)}>
                  <header
                    className={`venster-kop bureau-tegel-kop${magBewerken ? ' is-sleepbaar' : ''}`}
                    onPointerDown={startSleep(tegel.tid)} onPointerMove={beweegSleep} onPointerUp={eindSleep} onPointerCancel={eindSleep}
                  >
                    {magBewerken ? <GripVertical aria-hidden='true' className='bureau-greep' /> : <Icoon aria-hidden='true' className='bureau-greep' />}
                    <span
                      className='venster-greep venster-titel'
                      tabIndex={magBewerken ? 0 : -1}
                      role={magBewerken ? 'button' : undefined}
                      aria-label={magBewerken ? tr(lang, `${bureauTekst(def.titel, lang)}: блок ${i + 1} з ${tegels.length}. Стрілки — пересунути, Shift+стрілки — розмір, Delete — прибрати.`, `${bureauTekst(def.titel, lang)}: blok ${i + 1} van ${tegels.length}. Pijltjes — verplaatsen, Shift+pijltjes — formaat, Delete — weghalen.`) : undefined}
                      onKeyDown={toetsKop(tegel.tid)}
                    >{bureauTekst(def.titel, lang)}</span>
                    {magBewerken ? (
                      <div className='venster-knoppen'>
                        <button type='button' onClick={() => zet(verwijderTegel(indeling, tegel.tid))} title={tr(lang, 'Прибрати зі столу', 'Van het bureaublad halen')} aria-label={tr(lang, `Прибрати «${bureauTekst(def.titel, lang)}» зі столу`, `«${bureauTekst(def.titel, lang)}» van het bureaublad halen`)}><Trash2 aria-hidden='true' /></button>
                      </div>
                    ) : null}
                  </header>
                  <div className='venster-inhoud bureau-tegel-inhoud'>
                    <TegelInhoud lang={lang} widget={tegel.id} ownerUserId={ownerUserId} />
                  </div>
                  {magBewerken ? (
                    <span
                      /* Alleen voor de aanwijzer: met het toetsenbord gaat het formaat via Shift+pijl op de titelbalk. */
                      className='venster-grootte bureau-tegel-maat' aria-hidden='true' title={tr(lang, `Змінити розмір блоку «${bureauTekst(def.titel, lang)}»`, `Formaat van blok «${bureauTekst(def.titel, lang)}» wijzigen`)}
                      onPointerDown={startMaat(tegel.tid)} onPointerMove={beweegMaat} onPointerUp={eindMaat} onPointerCancel={eindMaat}
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

      {catalogus ? (
        <Venster id='bureau-catalogus' titel={tr(lang, 'Каталог блоків', 'Blokkencatalogus')} breedte={720} onSluit={() => setCatalogus(false)} lang={lang} className='bureau-catalogus-venster'>
          <div className='bureau-catalogus'>
            <p className='bureau-catalogus-uitleg'>{tr(lang,
              'Блоки з позначкою «скоро» покласти на стіл не можна: сервер ще не має джерела даних для них, і ми не малюємо порожніх рамок замість роботи.',
              'Blokken met de aanduiding «binnenkort» kunt u niet neerleggen: de server heeft er nog geen gegevensbron voor, en we zetten geen lege lijstjes in de plaats van echt werk.')}</p>
            <div className='bureau-catalogus-filters' role='group' aria-label={tr(lang, 'Категорії', 'Categorieën')}>
              <button type='button' className={cat === 'alles' ? 'is-actief' : ''} onClick={() => setCat('alles')}>{tr(lang, 'Усі', 'Alle')}</button>
              {BUREAU_CATEGORIEEN.map((c) => {
                const Icoon = CAT_ICOON[c.id];
                return <button key={c.id} type='button' className={cat === c.id ? 'is-actief' : ''} data-bureau-cat={c.id} onClick={() => setCat(c.id)}><Icoon aria-hidden='true' />{bureauTekst(c.titel, lang)}</button>;
              })}
            </div>
            <ul className='bureau-catalogus-lijst'>
              {zichtbareCatalogus.map((w) => {
                const Icoon = CAT_ICOON[w.cat];
                const klaar = w.stand === 'klaar';
                const aantal = tegels.filter((t) => t.id === w.id).length;
                return (
                  <li key={w.id} data-bureau-widget-kaart={w.id} data-bureau-stand={w.stand}>
                    <Icoon aria-hidden='true' />
                    <div>
                      <strong>{bureauTekst(w.titel, lang)}</strong>
                      <small>{bureauTekst(w.uitleg, lang)}</small>
                      {klaar
                        ? <code className='bureau-bron'>{w.bron}</code>
                        : <em className='bureau-ontbreekt'>{tr(lang, 'Чого бракує: ', 'Wat ontbreekt: ')}{bureauTekst(w.ontbreekt!, lang)}</em>}
                      {aantal ? <span className='bureau-al-op-stol'>{tr(lang, `Уже на столі: ${aantal}`, `Al op het bureaublad: ${aantal}`)}</span> : null}
                    </div>
                    <span className={`bureau-stand bureau-stand-${w.stand}`}>{klaar ? tr(lang, 'працює', 'werkt') : tr(lang, 'скоро', 'binnenkort')}</span>
                    <button type='button' className='primary' disabled={!klaar || vol || !magBewerken} onClick={() => voegToe(w.id)} aria-label={tr(lang, `Додати «${bureauTekst(w.titel, lang)}» на стіл`, `«${bureauTekst(w.titel, lang)}» op het bureaublad leggen`)}>
                      <Plus aria-hidden='true' />{tr(lang, 'Додати', 'Toevoegen')}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className='bureau-catalogus-voet'>
              <button type='button' className='ghost' onClick={() => setCatalogus(false)}><X aria-hidden='true' />{tr(lang, 'Готово', 'Klaar')}</button>
            </div>
          </div>
        </Venster>
      ) : null}
    </section>
  );
}
