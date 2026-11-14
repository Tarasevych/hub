// Live dashboard van het beheerpaneel: widgets die de beheerder kan verplaatsen (slepen of toetsenbord), vergroten/verkleinen, verbergen,
// weer toevoegen en terugzetten. De indeling staat op de server (per beheerder), niet alleen in de browser.
// Gegevens: elke 15 s opnieuw (niet in een verborgen tabblad, niet bij «Пауза»); de server cachet dezelfde 15 s tussen beheerders.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Eye, EyeOff, GripVertical, Minus, Pause, Play, Plus, RefreshCw, RotateCcw, Settings2, TriangleAlert, Check } from 'lucide-react';
import {
  BREEDTES, formaatZetten, gelijkeIndeling, HOOGTES, normaliseerIndeling, schuif, standaardIndeling, stap, verbergen, verplaats, widgetDef,
  type Indeling, type WidgetId,
} from '../../shared/overzicht-widgets';
import { bewaarIndeling, haalIndeling, haalOverzicht, wisIndeling } from './api';
import GebruikerKaart from './GebruikerKaart';
import { WIDGET_ICOON, WidgetInhoud, type WidgetCtx } from './widgets';
import type { Bron, Context, Lang, Overzicht } from './types';
import { tr } from './types';
import './overzicht.css';
import './overzicht-maquette.css';

const POLL_MS = 15_000;
const RIJ_PX = 118; const GAP_PX = 14;

type Opslag = 'rust' | 'bezig' | 'ok' | 'fout';

export default function Dashboard({ lang, context, bron, codes }: { lang: Lang; context: Context; bron: Bron; codes: boolean }) {
  const [o, setO] = useState<Overzicht | null>(null);
  const [fout, setFout] = useState('');
  const [bezigLaden, setBezigLaden] = useState(true);
  const [laatst, setLaatst] = useState(0);
  const [pauze, setPauze] = useState(false);
  const [indeling, setIndelingState] = useState<Indeling>(() => standaardIndeling());
  const [aangepast, setAangepast] = useState(false);
  const [indelingKlaar, setIndelingKlaar] = useState(false);
  const [bewerken, setBewerken] = useState(false);
  const [lade, setLade] = useState(false);
  const [opslag, setOpslag] = useState<Opslag>('rust');
  const [bevestigReset, setBevestigReset] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [melding, setMelding] = useState('');
  const [sleep, setSleep] = useState<WidgetId | null>(null);

  const ctxRef = useRef(context); ctxRef.current = context;
  const pauzeRef = useRef(pauze); pauzeRef.current = pauze;
  const bezigRef = useRef(false);
  const opslagTimer = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const focusId = useRef<string | null>(null);
  const indelingRef = useRef(indeling); indelingRef.current = indeling;

  // ---- gegevens
  const laden = useCallback(async () => {
    if (bezigRef.current) return;
    bezigRef.current = true;
    try {
      const d = await haalOverzicht(ctxRef.current);
      setO(d); setFout(''); setLaatst(Date.now());
    } catch (e) {
      const code = String((e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error || (e as Error)?.message || '');
      setFout(/5\d\d|NETWORK|fetch/i.test(code) ? tr(lang, 'Сервер тимчасово недоступний. Спробуємо ще раз.', 'De server is tijdelijk niet bereikbaar. We proberen het opnieuw.') : tr(lang, 'Не вдалося оновити дані огляду.', 'De overzichtsgegevens konden niet worden vernieuwd.'));
    } finally { bezigRef.current = false; setBezigLaden(false); }
  }, [lang]);

  useEffect(() => {
    void laden();
    // Op de telefoon elke ~60 s in plaats van 15 s; terugkeer naar het tabblad ververst nog steeds meteen.
    let teller = 0;
    const iv = window.setInterval(() => { teller += 1; const telefoon = window.matchMedia('(max-width:700px)').matches; if (!pauzeRef.current && !document.hidden && (!telefoon || teller % 4 === 0)) void laden(); }, POLL_MS);
    const zichtbaar = () => { if (!document.hidden && !pauzeRef.current) void laden(); };
    document.addEventListener('visibilitychange', zichtbaar);
    return () => { window.clearInterval(iv); document.removeEventListener('visibilitychange', zichtbaar); };
  }, [laden, context.tabContext]);

  useEffect(() => {
    let weg = false;
    haalIndeling(ctxRef.current).then((r) => { if (weg) return; setIndelingState(normaliseerIndeling(r.indeling)); setAangepast(r.aangepast); }).catch(() => { /* standaardindeling blijft */ }).finally(() => { if (!weg) setIndelingKlaar(true); });
    return () => { weg = true; };
  }, [context.tabContext]);

  // ---- indeling opslaan (met korte vertraging; direct bij «Готово»)
  const bewaar = useCallback(async (ind: Indeling) => {
    setOpslag('bezig');
    try { const r = await bewaarIndeling(ctxRef.current, ind); setAangepast(r.aangepast); setOpslag('ok'); }
    catch { setOpslag('fout'); }
  }, []);
  const zetIndeling = useCallback((volgende: Indeling) => {
    setIndelingState(volgende); setBevestigReset(false);
    if (opslagTimer.current) window.clearTimeout(opslagTimer.current);
    opslagTimer.current = window.setTimeout(() => { opslagTimer.current = null; void bewaar(indelingRef.current); }, 600);
  }, [bewaar]);
  useEffect(() => () => { if (opslagTimer.current) { window.clearTimeout(opslagTimer.current); void bewaar(indelingRef.current); } }, [bewaar]);

  const klaar = () => {
    if (opslagTimer.current) { window.clearTimeout(opslagTimer.current); opslagTimer.current = null; void bewaar(indelingRef.current); }
    setBewerken(false); setLade(false); setBevestigReset(false);
  };
  // Audit 19.10.2026 (A13): Esc verlaat de modus «Налаштувати» (eerst de lade/bevestiging, dan de modus zelf); wijzigingen blijven bewaard.
  const klaarRef = useRef(klaar); klaarRef.current = klaar;
  useEffect(() => {
    if (!bewerken) return;
    const toets = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; e.stopPropagation(); if (lade || bevestigReset) { setLade(false); setBevestigReset(false); } else klaarRef.current(); };
    window.addEventListener('keydown', toets, true);
    return () => window.removeEventListener('keydown', toets, true);
  }, [bewerken, lade, bevestigReset]);
  const terugzetten = async () => {
    if (!bevestigReset) { setBevestigReset(true); return; }
    setBevestigReset(false);
    if (opslagTimer.current) { window.clearTimeout(opslagTimer.current); opslagTimer.current = null; }
    setOpslag('bezig');
    try { const r = await wisIndeling(ctxRef.current); setIndelingState(normaliseerIndeling(r.indeling)); setAangepast(false); setOpslag('ok'); setMelding(tr(lang, 'Типове розташування відновлено.', 'Standaardindeling hersteld.')); }
    catch { setIndelingState(standaardIndeling()); setOpslag('fout'); }
  };

  // ---- toetsenbord-focus behouden na verplaatsen (DOM-knoop verhuist)
  useLayoutEffect(() => {
    if (focusId.current) { gridRef.current?.querySelector<HTMLElement>(`[data-handle="${focusId.current}"]`)?.focus(); focusId.current = null; }
  }, [indeling]);

  const titel = (id: WidgetId) => { const d = widgetDef(id)!; return tr(lang, d.titel[0], d.titel[1]); };
  const zichtbaar = indeling.items.filter((i) => !i.verborgen);
  const verborgen = indeling.items.filter((i) => i.verborgen);

  const handleToets = (e: ReactKeyboardEvent, id: WidgetId) => {
    const it = indeling.items.find((i) => i.id === id)!; const def = widgetDef(id)!;
    const k = e.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) return;
    e.preventDefault(); focusId.current = id;
    if (e.shiftKey) {
      if (k === 'ArrowLeft') zetIndeling(formaatZetten(indeling, id, stap(it.w, BREEDTES, def.minW, -1)));
      else if (k === 'ArrowRight') zetIndeling(formaatZetten(indeling, id, stap(it.w, BREEDTES, def.minW, 1)));
      else if (k === 'ArrowUp') zetIndeling(formaatZetten(indeling, id, undefined, stap(it.h, HOOGTES, def.minH, -1)));
      else zetIndeling(formaatZetten(indeling, id, undefined, stap(it.h, HOOGTES, def.minH, 1)));
      return;
    }
    const nieuw = schuif(indeling, id, k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 1);
    if (nieuw !== indeling) {
      zetIndeling(nieuw);
      const pos = nieuw.items.filter((i) => !i.verborgen).findIndex((i) => i.id === id) + 1;
      setMelding(tr(lang, `${titel(id)}: позиція ${pos} з ${zichtbaar.length}`, `${titel(id)}: plek ${pos} van ${zichtbaar.length}`));
    }
  };

  // ---- slepen (pointer events: muis én aanraking)
  const startSleep = (e: ReactPointerEvent, id: WidgetId) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    setSleep(id);
    let laatsteDoel = ''; let laatsteZijde = '';
    let huidig = indelingRef.current;
    const beweeg = (ev: PointerEvent) => {
      const els = document.elementsFromPoint(ev.clientX, ev.clientY);
      const doelEl = els.find((el) => el instanceof HTMLElement && el.dataset.widgetId && el.dataset.widgetId !== id) as HTMLElement | undefined;
      if (doelEl) {
        const doel = doelEl.dataset.widgetId as WidgetId; const r = doelEl.getBoundingClientRect();
        const zijde = ev.clientY < r.top + r.height / 2 || (ev.clientY < r.bottom && ev.clientX < r.left + r.width / 2 && r.height < RIJ_PX * 2.2) ? 'voor' : 'na';
        if (doel !== laatsteDoel || zijde !== laatsteZijde) {
          laatsteDoel = doel; laatsteZijde = zijde;
          const doelPos = huidig.items.findIndex((i) => i.id === doel);
          const vanPos = huidig.items.findIndex((i) => i.id === id);
          const naar = zijde === 'voor' ? (vanPos < doelPos ? doelPos - 1 : doelPos) : (vanPos < doelPos ? doelPos : doelPos + 1);
          const volgende = verplaats(huidig, id, naar);
          if (volgende !== huidig && !gelijkeIndeling(volgende, huidig)) { huidig = volgende; setIndelingState(volgende); }
        }
      }
      // automatisch scrollen bij de rand van het scherm
      if (ev.clientY < 70) window.scrollBy(0, -18); else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 18);
    };
    const eind = () => {
      handle.removeEventListener('pointermove', beweeg); handle.removeEventListener('pointerup', eind); handle.removeEventListener('pointercancel', eind);
      setSleep(null);
      zetIndeling(huidig);
    };
    handle.addEventListener('pointermove', beweeg); handle.addEventListener('pointerup', eind); handle.addEventListener('pointercancel', eind);
  };

  // ---- formaat slepen (hoek rechtsonder), vastklikkend op kolommen/rijen
  const startFormaat = (e: ReactPointerEvent, id: WidgetId) => {
    e.preventDefault(); e.stopPropagation();
    const grip = e.currentTarget as HTMLElement; grip.setPointerCapture(e.pointerId);
    const it = indelingRef.current.items.find((i) => i.id === id)!;
    const gridBreedte = gridRef.current?.getBoundingClientRect().width ?? 1200;
    const kolom = (gridBreedte + GAP_PX) / 12; const rij = RIJ_PX + GAP_PX;
    const x0 = e.clientX; const y0 = e.clientY; let huidig = indelingRef.current;
    setSleep(id);
    const beweeg = (ev: PointerEvent) => {
      const w = Math.round(it.w + (ev.clientX - x0) / kolom); const h = Math.round(it.h + (ev.clientY - y0) / rij);
      const volgende = formaatZetten(indelingRef.current, id, Math.max(3, Math.min(12, w)), Math.max(1, Math.min(4, h)));
      if (!gelijkeIndeling(volgende, huidig)) { huidig = volgende; setIndelingState(volgende); }
    };
    const eind = () => {
      grip.removeEventListener('pointermove', beweeg); grip.removeEventListener('pointerup', eind); grip.removeEventListener('pointercancel', eind);
      setSleep(null); zetIndeling(huidig);
    };
    grip.addEventListener('pointermove', beweeg); grip.addEventListener('pointerup', eind); grip.addEventListener('pointercancel', eind);
  };

  const ctx: WidgetCtx | null = useMemo(() => (o ? { o, lang, bron, codes, nu: o.nu, openGebruiker: setOpen, pauze, zetPauze: setPauze, context } : null), [o, lang, bron, codes, pauze, context]);

  const statusTekst = opslag === 'bezig' ? tr(lang, 'Зберігаємо…', 'Opslaan…') : opslag === 'ok' ? tr(lang, 'Розташування збережено', 'Indeling opgeslagen') : opslag === 'fout' ? tr(lang, 'Не вдалося зберегти розташування', 'Indeling kon niet worden opgeslagen') : aangepast ? tr(lang, 'Ваше розташування', 'Uw indeling') : tr(lang, 'Типове розташування', 'Standaardindeling');

  return (
    <div className="ov-root" data-admin-overview data-bewerken={bewerken ? 'ja' : 'nee'}>
      <div className="ov-balk" role="toolbar" aria-label={tr(lang, 'Керування оглядом', 'Overzichtsbesturing')}>
        <div className="ov-balk-status">
          <span className={`ov-live${pauze ? ' ov-live-uit' : ''}`}><i aria-hidden="true" />{pauze ? tr(lang, 'Пауза', 'Gepauzeerd') : tr(lang, 'Наживо', 'Live')}</span>
          <small>{laatst ? `${tr(lang, 'Оновлено', 'Bijgewerkt')} ${new Date(laatst).toLocaleTimeString(lang === 'uk' ? 'uk-UA' : 'nl-BE')}` : tr(lang, 'Завантаження…', 'Laden…')}</small>
        </div>
        <div className="ov-balk-knoppen">
          <button type="button" className="ov-knop" onClick={() => void laden()} disabled={bezigLaden} title={tr(lang, 'Оновити дані зараз', 'Nu vernieuwen')}><RefreshCw className={bezigLaden ? 'spin' : ''} aria-hidden="true" /><span>{tr(lang, 'Оновити', 'Vernieuwen')}</span></button>
          <button type="button" className="ov-knop" onClick={() => setPauze((v) => !v)} aria-pressed={pauze}>{pauze ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}<span>{pauze ? tr(lang, 'Продовжити', 'Hervatten') : tr(lang, 'Пауза', 'Pauze')}</span></button>
          {!bewerken
            ? <button type="button" className="ov-knop ov-knop-hoofd" onClick={() => setBewerken(true)} disabled={!indelingKlaar} data-testid="ov-bewerken"><Settings2 aria-hidden="true" /><span>{tr(lang, 'Налаштувати', 'Aanpassen')}</span></button>
            : (
              <>
                <button type="button" className="ov-knop" onClick={() => setLade((v) => !v)} aria-expanded={lade} data-testid="ov-toevoegen"><Plus aria-hidden="true" /><span>{tr(lang, 'Додати блок', 'Widget toevoegen')}{verborgen.length ? ` (${verborgen.length})` : ''}</span></button>
                <button type="button" className={`ov-knop${bevestigReset ? ' ov-knop-gevaar' : ''}`} onClick={() => void terugzetten()} data-testid="ov-reset"><RotateCcw aria-hidden="true" /><span>{bevestigReset ? tr(lang, 'Так, скинути', 'Ja, herstellen') : tr(lang, 'Скинути', 'Standaard')}</span></button>
                <button type="button" className="ov-knop ov-knop-hoofd" onClick={klaar} data-testid="ov-klaar"><Check aria-hidden="true" /><span>{tr(lang, 'Готово', 'Klaar')}</span></button>
              </>
            )}
        </div>
      </div>

      {bewerken && (
        <p className="ov-hint" role="note">
          {tr(lang, 'Режим налаштування: тягніть за ручку ⠿ (або Стрілки на ручці), змінюйте розмір кутом чи Shift+Стрілки, приховуйте око.', 'Aanpassen: sleep aan de greep ⠿ (of pijltjes op de greep), pas het formaat aan met de hoek of Shift+pijltjes, verberg met het oog.')}
          <span className={`ov-opslag ov-opslag-${opslag}`} role="status">{statusTekst}</span>
        </p>
      )}
      {bewerken && lade && (
        <section className="ov-lade" aria-label={tr(lang, 'Приховані блоки', 'Verborgen widgets')} data-testid="ov-lade">
          {verborgen.length === 0 ? <p className="ov-leeg">{tr(lang, 'Усі блоки вже на сторінці.', 'Alle widgets staan al op de pagina.')}</p> : (
            <ul>
              {verborgen.map((i) => {
                const d = widgetDef(i.id)!;
                return (
                  <li key={i.id}>
                    <span className="ov-lade-ic">{WIDGET_ICOON[i.id]}</span>
                    <div><strong>{tr(lang, d.titel[0], d.titel[1])}</strong><small>{tr(lang, d.uitleg[0], d.uitleg[1])}</small></div>
                    <button type="button" className="ov-knop" onClick={() => zetIndeling(verbergen(indeling, i.id, false))} data-testid={`ov-toon-${i.id}`}><Eye aria-hidden="true" /><span>{tr(lang, 'Показати', 'Tonen')}</span></button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {fout && <p className="ov-fout" role="alert"><TriangleAlert aria-hidden="true" /> {fout}</p>}
      <div className="ov-sr" aria-live="polite">{melding}</div>

      {!o && !fout && bezigLaden && <p className="ov-leeg"><RefreshCw className="spin" aria-hidden="true" /> {tr(lang, 'Завантажуємо живі дані…', 'Live gegevens laden…')}</p>}
      {!o && fout && (
        <div className="ov-noodkaarten" data-admin-overview-fallback>
          <article><b>{bron.summary.users}</b><span>{tr(lang, 'користувачів', 'gebruikers')}</span></article>
          <article><b>{bron.summary.activeSessions}</b><span>{tr(lang, 'активних сесій', 'actieve sessies')}</span></article>
          <article><b>{bron.summary.rememberedDevices}</b><span>{tr(lang, 'запам’ятованих пристроїв', 'onthouden apparaten')}</span></article>
          <article><b>{bron.summary.auditEvents}</b><span>{tr(lang, 'подій журналу', 'logboekgebeurtenissen')}</span></article>
        </div>
      )}

      {ctx && (
        <div className="ov-grid" ref={gridRef} role="list" data-sleept={sleep ? 'ja' : 'nee'}>
          {zichtbaar.length === 0 && <p className="ov-leeg ov-leeg-groot">{tr(lang, 'Усі блоки приховано. Натисніть «Налаштувати» → «Додати блок».', 'Alle widgets zijn verborgen. Kies «Aanpassen» → «Widget toevoegen».')}</p>}
          {zichtbaar.map((it, idx) => {
            const d = widgetDef(it.id)!;
            return (
              <section
                key={it.id} role="listitem" className={`ov-w${sleep === it.id ? ' ov-w-sleep' : ''}`} data-widget-id={it.id} data-w={it.w} data-h={it.h}
                style={{ ['--w' as string]: it.w, ['--h' as string]: it.h, gridColumn: `span ${it.w}`, gridRow: `span ${it.h}` }}
                aria-labelledby={`ov-t-${it.id}`}
              >
                <header className="ov-w-kop">
                  {bewerken && (
                    <button
                      type="button" className="ov-greep" data-handle={it.id} onPointerDown={(e) => startSleep(e, it.id)} onKeyDown={(e) => handleToets(e, it.id)}
                      aria-roledescription={tr(lang, 'переміщуваний блок', 'verplaatsbare widget')}
                      aria-label={`${tr(lang, 'Перемістити', 'Verplaatsen')}: ${titel(it.id)} (${idx + 1}/${zichtbaar.length})`}
                      title={tr(lang, 'Тягніть або Стрілки; Shift+Стрілки — розмір', 'Sleep of pijltjes; Shift+pijltjes = formaat')}
                    ><GripVertical aria-hidden="true" /></button>
                  )}
                  <span className="ov-w-ic">{WIDGET_ICOON[it.id]}</span>
                  <h3 id={`ov-t-${it.id}`} title={tr(lang, d.uitleg[0], d.uitleg[1])}>{titel(it.id)}</h3>
                  {bewerken && (
                    <div className="ov-w-act">
                      <span className="ov-maat" aria-label={tr(lang, 'Ширина', 'Breedte')}>
                        <button type="button" aria-label={tr(lang, 'Вужче', 'Smaller')} onClick={() => zetIndeling(formaatZetten(indeling, it.id, stap(it.w, BREEDTES, d.minW, -1)))} disabled={it.w <= d.minW}><Minus aria-hidden="true" /></button>
                        <b aria-hidden="true">{tr(lang, 'Ш', 'B')}{it.w}</b>
                        <button type="button" aria-label={tr(lang, 'Ширше', 'Breder')} onClick={() => zetIndeling(formaatZetten(indeling, it.id, stap(it.w, BREEDTES, d.minW, 1)))} disabled={it.w >= 12}><Plus aria-hidden="true" /></button>
                      </span>
                      <span className="ov-maat" aria-label={tr(lang, 'Висота', 'Hoogte')}>
                        <button type="button" aria-label={tr(lang, 'Нижче', 'Lager')} onClick={() => zetIndeling(formaatZetten(indeling, it.id, undefined, stap(it.h, HOOGTES, d.minH, -1)))} disabled={it.h <= d.minH}><Minus aria-hidden="true" /></button>
                        <b aria-hidden="true">{tr(lang, 'В', 'H')}{it.h}</b>
                        <button type="button" aria-label={tr(lang, 'Вище', 'Hoger')} onClick={() => zetIndeling(formaatZetten(indeling, it.id, undefined, stap(it.h, HOOGTES, d.minH, 1)))} disabled={it.h >= 4}><Plus aria-hidden="true" /></button>
                      </span>
                      <button type="button" className="ov-icoonknop" onClick={() => { zetIndeling(verbergen(indeling, it.id, true)); setMelding(tr(lang, `${titel(it.id)} приховано`, `${titel(it.id)} verborgen`)); }} aria-label={`${tr(lang, 'Приховати', 'Verbergen')}: ${titel(it.id)}`} title={tr(lang, 'Приховати', 'Verbergen')} data-testid={`ov-verberg-${it.id}`}><EyeOff aria-hidden="true" /></button>
                    </div>
                  )}
                </header>
                <div className="ov-w-body"><WidgetInhoud id={it.id} ctx={ctx} /></div>
                {bewerken && <span className="ov-formaat" onPointerDown={(e) => startFormaat(e, it.id)} aria-hidden="true" title={tr(lang, 'Змінити розмір', 'Formaat wijzigen')} data-testid={`ov-formaat-${it.id}`} />}
              </section>
            );
          })}
        </div>
      )}

      {open && <GebruikerKaart id={open} ctx={context} lang={lang} nu={o?.nu ?? Date.now()} onSluit={() => setOpen(null)} />}
    </div>
  );
}
