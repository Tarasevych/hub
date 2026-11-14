// Hub → tabblad «Нотатки»: ECHTE notities, dezelfde als het MCP-hulpmiddel manage_hub_notes (bord-items kind 'note'
// met etiket 'hub'; backend/mcp-console.ts, routes POST /api/mcp/board/list, POST/PATCH /api/mcp/board).
//
// 19.10.2026 (punt 11 van de eigenaar) erbij gekomen:
//   * soorten notities — tekst, checklist, code, koppeling — plus kleur en «vastzetten»;
//   * zoeken op woorden, filter op etiket en op soort;
//   * vrije etiketten van de gebruiker;
//   * een catalogus van externe notitie-apps die EERLIJK zegt wat er nog niet is.
// Er komt geen nieuwe tabel bij: soort, kleur en «vast» zitten in de etiketten van het bord-item. Alle regels
// daarvoor staan zuiver in shared/notities-model.ts, zodat de browser nooit iets opslaat wat de server weigert.
// 28.10.2026 — Notities vNext (migratie 0127) achter de vlag `notities-vnext` (standaard UIT): met vlag de nieuwe pagina
// (src/notities/NotitiesPagina.tsx, lui geladen), zonder vlag precies deze oude pagina. Dezelfde notities: de server houdt
// app.notities en het bord (deze pagina) als spiegel gelijk, dus aan- of uitzetten verliest niets.
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useNotitiesVnext } from './notities/notities-vlag';
import { DIEPE_PARAMS, diepeWaarde, wisDiepeParams } from '../shared/zoek-diepe-link';
const NotitiesPagina = lazy(() => import('./notities/NotitiesPagina'));
import { AlertCircle, Check, Code2, Link2, ListChecks, NotebookPen, Pencil, Pin, PinOff, Plus, Search, Store, Tag, Trash2, Type, X, type LucideIcon } from 'lucide-react';
import { api, ApiError } from './platform/client';
import { RuimteGeslotenVlak, RuimteStrook } from './RuimteStrook';
import { ruimteFeitenUit, ruimteGeslotenUit, type RuimteFeiten, type RuimteGesloten } from '../shared/ruimte-weergave';
import { ecosystemTabContext } from './tab-context';
import { sessieDienst } from './canoniek-navigatie';
import {
  HUB_ETIKET, KLEUREN, KLEUR_LABEL, MAX_TEKST, MAX_TITEL, MAX_VRIJE_ETIKETTEN, NOTITIE_APPS, SOORTEN,
  eersteKoppeling, etiketWolk, etikettenVoorServer, leegVorm, lijstAf, lijstUitTekst, notitieKanVerbinden, notitieTekst,
  ordenNotities, schoonEtiket, tekstUitLijst, vormUitEtiketten, zoekNotities,
  type NotitieKleur, type NotitieSoort, type NotitieVorm,
} from '../shared/notities-model';
import './hub-notities.css';
import './notities/notities-maquette.css';

export type HubNotitie = { id: string; title: string; body: string; tags: string[]; author: string; createdAt: string; updatedAt: string };
const body = () => ({ service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

/** Zuiver: alleen hub-notities (etiket 'hub'), nieuwste eerst. Blijft bestaan voor wie alleen die lijst wil. */
export const hubNotities = (notes: readonly HubNotitie[] | null | undefined): HubNotitie[] =>
  (notes ?? []).filter((n) => (n.tags ?? []).includes(HUB_ETIKET)).sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));

const SOORT_ICOON: Record<NotitieSoort, LucideIcon> = { tekst: Type, lijst: ListChecks, code: Code2, koppeling: Link2 };

export default function HubNotes({ lang }: { lang: 'uk' | 'nl' }) {
  const vnext = useNotitiesVnext();
  if (vnext) return <Suspense fallback={<section className='vn' data-vn-pagina='laden' aria-busy='true' />}><NotitiesPagina lang={lang} /></Suspense>;
  return <HubNotesOud lang={lang} />;
}

/** De oude pagina (19.10.2026), ongewijzigd: zonder vlag is dit wat de mens ziet. */
function HubNotesOud({ lang }: { lang: 'uk' | 'nl' }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [notes, setNotes] = useState<HubNotitie[] | null>(null);
  /** In welke gegevenslade kijkt deze mens (0086) — en, als de poort dicht is, waarom. Nooit stil een lege lijst. */
  const [ruimte, setRuimte] = useState<RuimteFeiten | null>(null);
  const [gesloten, setGesloten] = useState<RuimteGesloten | null>(null);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const [open, setOpen] = useState<'' | 'nieuw' | string>('');
  const [vorm, setVorm] = useState<NotitieVorm>(leegVorm);
  const [nieuwEtiket, setNieuwEtiket] = useState('');
  const [vraag, setVraag] = useState('');
  const [etiket, setEtiket] = useState('');
  const [soortFilter, setSoortFilter] = useState<NotitieSoort | ''>('');
  const [apps, setApps] = useState(false);

  const laad = useCallback(async () => {
    try {
      const r = await api.post('/api/mcp/board/list', body());
      setNotes(hubNotities(r.data?.notes as HubNotitie[]));
      setRuimte(ruimteFeitenUit(r.data)); setGesloten(null); setFout('');
    } catch (e) {
      // Een weigering van de ruimtepoort is GEEN gewone fout: zij heeft een eigen uitleg, en die hoort in beeld te komen
      // in plaats van «notities laden mislukt» boven een lege lijst.
      const dicht = ruimteGeslotenUit(e instanceof ApiError ? e.response?.data : null);
      if (dicht) { setGesloten(dicht); setRuimte(null); setNotes([]); setFout(''); return; }
      setFout(String((e as Error)?.message || 'FOUT')); setNotes((n) => n ?? []);
    }
  }, []);
  useEffect(() => { void laad(); }, [laad]);

  const start = (n?: HubNotitie) => {
    setOpen(n ? n.id : 'nieuw');
    setVorm(n ? vormUitEtiketten(n.title, n.body, n.tags) : leegVorm());
    setNieuwEtiket('');
  };
  const sluit = () => { setOpen(''); setVorm(leegVorm()); setNieuwEtiket(''); };
  // ZOEKDIEP-001 (05.11.2026): diepe link uit de zoekpagina (?open_item_id=<id van de notitie>, shared/zoek-diepe-link.ts) → de notitie
  // meteen in de bewerker. Niet (meer) gevonden → eerlijke melding in plaats van een stille lijst.
  const [zoekNotitie, setZoekNotitie] = useState(() => (typeof location !== 'undefined' ? diepeWaarde(location.search, DIEPE_PARAMS.item) : ''));
  useEffect(() => {
    if (!zoekNotitie || notes === null) return;
    const n = notes.find((x) => x.id === zoekNotitie);
    setZoekNotitie(''); wisDiepeParams(DIEPE_PARAMS.item);
    if (n) start(n); else setFout(t('Нотатку з пошуку не знайдено: можливо, її вже видалено.', 'De notitie uit de zoekresultaten is niet gevonden: misschien is zij verwijderd.'));
  }, [notes, zoekNotitie]); // eslint-disable-line react-hooks/exhaustive-deps

  const bewaar = async () => {
    if (!vorm.titel.trim() || bezig) return;
    setBezig(true);
    const velden = { title: vorm.titel.trim().slice(0, MAX_TITEL), body: vorm.tekst.slice(0, MAX_TEKST), tags: etikettenVoorServer(vorm) };
    try {
      if (open === 'nieuw') await api.post('/api/mcp/board', { ...body(), kind: 'note', ...velden });
      else await api.patch('/api/mcp/board', { ...body(), kind: 'edit', id: open, ...velden });
      sluit(); await laad();
    } catch (e) { setFout(String((e as Error)?.message || 'FOUT')); } finally { setBezig(false); }
  };
  const verwijder = async (id: string) => {
    if (bezig) return;
    setBezig(true);
    try { await api.patch('/api/mcp/board', { ...body(), kind: 'delete', id }); if (open === id) sluit(); await laad(); }
    catch (e) { setFout(String((e as Error)?.message || 'FOUT')); } finally { setBezig(false); }
  };
  /** Vastzetten en het afstrepen van een checklistregel bewaren direct: dat zijn één-kliks-acties. */
  const bewaarDirect = async (n: HubNotitie, volgende: NotitieVorm) => {
    if (bezig) return;
    setBezig(true);
    try {
      await api.patch('/api/mcp/board', { ...body(), kind: 'edit', id: n.id, title: volgende.titel.slice(0, MAX_TITEL), body: volgende.tekst.slice(0, MAX_TEKST), tags: etikettenVoorServer(volgende) });
      await laad();
    } catch (e) { setFout(String((e as Error)?.message || 'FOUT')); } finally { setBezig(false); }
  };

  const datum = (iso: string) => { const ms = Date.parse(iso); return Number.isNaN(ms) ? '' : new Date(ms).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  const wolk = useMemo(() => etiketWolk(notes ?? []), [notes]);
  const gevonden = useMemo(() => ordenNotities(zoekNotities(notes ?? [], vraag, etiket, soortFilter)), [notes, vraag, etiket, soortFilter]);
  const filterActief = Boolean(vraag.trim() || etiket || soortFilter);

  const foutTekst = fout === 'MCP_SERVICE_REQUIRED' || /SESSION|401|403/.test(fout)
    ? t('Нотатки доступні лише після входу.', 'Notities zijn alleen beschikbaar na aanmelden.')
    : t(`Не вдалося завантажити нотатки (${fout}).`, `Notities laden mislukt (${fout}).`);

  const vrijeEtiketten = vorm.etiketten;
  const voegEtiket = () => {
    const schoon = schoonEtiket(nieuwEtiket);
    if (!schoon || vrijeEtiketten.includes(schoon) || vrijeEtiketten.length >= MAX_VRIJE_ETIKETTEN) { setNieuwEtiket(''); return; }
    setVorm({ ...vorm, etiketten: [...vrijeEtiketten, schoon] });
    setNieuwEtiket('');
  };

  const form = (
    <form className='hub-notes-form' data-hub-notes-form={open} onSubmit={(e) => { e.preventDefault(); void bewaar(); }}>
      <fieldset className='hub-notes-soorten'>
        <legend>{t('Тип нотатки', 'Soort notitie')}</legend>
        {SOORTEN.map((s) => {
          const Icoon = SOORT_ICOON[s.id];
          return (
            <label key={s.id} className={vorm.soort === s.id ? 'is-actief' : ''} data-hub-notes-soort={s.id} title={notitieTekst(s.uitleg, lang)}>
              <input type='radio' name='hub-notitie-soort' value={s.id} checked={vorm.soort === s.id} onChange={() => setVorm({ ...vorm, soort: s.id })} />
              <Icoon aria-hidden='true' />{notitieTekst(s.titel, lang)}
            </label>
          );
        })}
      </fieldset>
      <label>{t('Назва', 'Titel')}<input value={vorm.titel} maxLength={MAX_TITEL} required onChange={(e) => setVorm({ ...vorm, titel: e.target.value })} autoFocus /></label>
      <label>
        {vorm.soort === 'lijst' ? t('Пункти — по одному в рядок', 'Punten — één per regel')
          : vorm.soort === 'code' ? t('Код', 'Code')
            : vorm.soort === 'koppeling' ? t('Посилання (https) і примітка', 'Koppeling (https) en opmerking')
              : t('Текст', 'Tekst')}
        <textarea className={vorm.soort === 'code' ? 'is-code' : ''} value={vorm.tekst} maxLength={MAX_TEKST} rows={vorm.soort === 'code' ? 7 : 4} onChange={(e) => setVorm({ ...vorm, tekst: e.target.value })} />
      </label>
      {vorm.soort === 'koppeling' && vorm.tekst.trim() && !eersteKoppeling(vorm.tekst)
        ? <p className='hub-notes-waarschuwing'><AlertCircle aria-hidden='true' />{t('У тексті немає посилання https://… — нотатка збережеться як звичайний текст.', 'In de tekst staat geen https://-koppeling — de notitie wordt als gewone tekst bewaard.')}</p>
        : null}
      <div className='hub-notes-vorm-rij'>
        <label className='hub-notes-kleur'>{t('Колір', 'Kleur')}
          <select value={vorm.kleur} onChange={(e) => setVorm({ ...vorm, kleur: e.target.value as NotitieKleur })}>
            {KLEUREN.map((k) => <option key={k} value={k}>{notitieTekst(KLEUR_LABEL[k], lang)}</option>)}
          </select>
        </label>
        <label className='hub-notes-vast'>
          <input type='checkbox' checked={vorm.vast} onChange={(e) => setVorm({ ...vorm, vast: e.target.checked })} />
          <Pin aria-hidden='true' />{t('Закріпити зверху', 'Bovenaan vastzetten')}
        </label>
      </div>
      <div className='hub-notes-etiketten-vorm'>
        <span className='hub-notes-etiketten-kop'><Tag aria-hidden='true' />{t('Теги', 'Etiketten')} <small>{vrijeEtiketten.length}/{MAX_VRIJE_ETIKETTEN}</small></span>
        {vrijeEtiketten.map((e) => (
          <span key={e} className='hub-notes-etiket'>{e}
            <button type='button' aria-label={t(`Прибрати тег ${e}`, `Etiket ${e} verwijderen`)} onClick={() => setVorm({ ...vorm, etiketten: vrijeEtiketten.filter((x) => x !== e) })}><X aria-hidden='true' /></button>
          </span>
        ))}
        {vrijeEtiketten.length < MAX_VRIJE_ETIKETTEN ? (
          <span className='hub-notes-etiket-nieuw'>
            <input value={nieuwEtiket} maxLength={32} placeholder={t('новий тег', 'nieuw etiket')} aria-label={t('Новий тег', 'Nieuw etiket')}
              onChange={(e) => setNieuwEtiket(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); voegEtiket(); } }} />
            <button type='button' onClick={voegEtiket} disabled={!schoonEtiket(nieuwEtiket)}><Plus aria-hidden='true' />{t('Додати', 'Toevoegen')}</button>
          </span>
        ) : null}
      </div>
      <div className='hub-notes-acties'>
        <button type='submit' className='primary' disabled={bezig || !vorm.titel.trim()}>{open === 'nieuw' ? t('Додати', 'Toevoegen') : t('Зберегти', 'Opslaan')}</button>
        <button type='button' className='ghost' onClick={sluit}><X aria-hidden='true' />{t('Скасувати', 'Annuleren')}</button>
      </div>
    </form>
  );

  const kaart = (n: HubNotitie) => {
    const v = vormUitEtiketten(n.title, n.body, n.tags);
    const Icoon = SOORT_ICOON[v.soort];
    const regels = v.soort === 'lijst' ? lijstUitTekst(n.body) : [];
    const koppeling = v.soort === 'koppeling' ? eersteKoppeling(n.body) : '';
    return (
      <>
        <div className='hub-notes-tekst'>
          <h3><Icoon aria-hidden='true' />{n.title}{v.vast ? <Pin aria-hidden='true' className='hub-notes-vast-teken' /> : null}</h3>
          {v.soort === 'lijst' && regels.length ? (
            <>
              <ul className='hub-notes-checklist'>
                {regels.map((regel, i) => (
                  <li key={`${i}-${regel.tekst}`}>
                    <label>
                      <input type='checkbox' checked={regel.af} disabled={bezig}
                        onChange={() => void bewaarDirect(n, { ...v, tekst: tekstUitLijst(regels.map((r, j) => (j === i ? { ...r, af: !r.af } : r))) })} />
                      <span className={regel.af ? 'is-af' : ''}>{regel.tekst}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <small className='hub-notes-voortgang'>{lijstAf(regels)}/{regels.length} {t('виконано', 'gedaan')}</small>
            </>
          ) : v.soort === 'code' && n.body ? <pre className='hub-notes-code'><code>{n.body}</code></pre>
            : n.body ? <p>{n.body}</p> : null}
          {koppeling ? <a className='hub-notes-koppeling' href={koppeling} target='_blank' rel='noreferrer'><Link2 aria-hidden='true' />{koppeling}</a> : null}
          {v.etiketten.length ? (
            <div className='hub-notes-etiketten'>
              {v.etiketten.map((e) => <button key={e} type='button' className='hub-notes-etiket is-filter' onClick={() => setEtiket(etiket === e ? '' : e)}>{e}</button>)}
            </div>
          ) : null}
          <small>{datum(n.updatedAt || n.createdAt)}{n.author && n.author !== 'operator' ? ` · ${n.author}` : ''}</small>
        </div>
        <div className='hub-notes-knoppen'>
          <button type='button' className='icon-button' onClick={() => void bewaarDirect(n, { ...v, vast: !v.vast })} disabled={bezig}
            aria-label={v.vast ? t(`Відкріпити «${n.title}»`, `«${n.title}» losmaken`) : t(`Закріпити «${n.title}»`, `«${n.title}» vastzetten`)}
            title={v.vast ? t('Відкріпити', 'Losmaken') : t('Закріпити', 'Vastzetten')}>{v.vast ? <PinOff /> : <Pin />}</button>
          <button type='button' className='icon-button' onClick={() => start(n)} aria-label={t(`Редагувати «${n.title}»`, `«${n.title}» bewerken`)} title={t('Редагувати', 'Bewerken')}><Pencil /></button>
          <button type='button' className='icon-button is-gevaar' onClick={() => void verwijder(n.id)} aria-label={t(`Видалити «${n.title}»`, `«${n.title}» verwijderen`)} title={t('Видалити', 'Verwijderen')}><Trash2 /></button>
        </div>
      </>
    );
  };

  return (
    <section className='hub-notes' data-hub-notes={notes ? String(notes.length) : 'laden'} aria-labelledby='hub-notes-kop'>
      <header className='hub-notes-kop'>
        <h2 id='hub-notes-kop'><NotebookPen aria-hidden='true' /> {t('Нотатки', 'Notities')}</h2>
        <p>{t('Ваші нотатки в цьому просторі. ШІ бачить і може вести їх через інструмент «manage_hub_notes», якщо ви це дозволили.', 'Uw notities in deze ruimte. De AI ziet en beheert ze via het hulpmiddel «manage_hub_notes», als u dat toestond.')}</p>
        <div className='hub-notes-kop-acties'>
          {open !== 'nieuw' ? <button type='button' className='primary' onClick={() => start()} data-hub-notes-knop='nieuw'><Plus aria-hidden='true' />{t('Нова нотатка', 'Nieuwe notitie')}</button> : null}
          <button type='button' className='ghost' data-hub-notes-apps={apps ? 'open' : 'dicht'} onClick={() => setApps((v) => !v)}>
            <Store aria-hidden='true' />{apps ? t('Приховати додатки', 'Apps verbergen') : t('Підключити додаток нотаток', 'Notitie-app koppelen')}
          </button>
        </div>
      </header>

      <RuimteStrook feiten={ruimte} lang={lang} />
      {gesloten ? <RuimteGeslotenVlak gesloten={gesloten} lang={lang} /> : null}

      {fout ? <p className='hub-notes-fout' role='alert'>{foutTekst}</p> : null}

      {apps ? (
        <section className='hub-notes-apps' data-hub-notes-apps-paneel='1' aria-label={t('Додатки нотаток', 'Notitie-apps')}>
          <p className='hub-notes-apps-uitleg'>{t(
            'Жодного зовнішнього додатка нотаток поки не підключено — і ми не показуємо кнопок, які нічого не роблять. Нижче точно написано, чого бракує для кожного з них.',
            'Er is nog geen externe notitie-app gekoppeld — en we laten geen knoppen zien die niets doen. Hieronder staat precies wat er per app ontbreekt.')}</p>
          <ul className='hub-notes-apps-lijst'>
            {NOTITIE_APPS.map((app) => (
              <li key={app.id} data-hub-notes-app={app.id} data-hub-notes-app-stand={app.stand}>
                <span className='hub-notes-app-monogram' aria-hidden='true'>{app.naam.slice(0, 1)}</span>
                <div>
                  <strong>{app.naam}</strong>
                  <small>{notitieTekst(app.uitleg, lang)}</small>
                  {app.ontbreekt ? <em><AlertCircle aria-hidden='true' />{t('Чого бракує: ', 'Wat ontbreekt: ')}{notitieTekst(app.ontbreekt, lang)}</em> : null}
                </div>
                <span className={`hub-notes-app-stand is-${app.stand}`}>{app.stand === 'beschikbaar' ? t('доступно', 'beschikbaar') : t('скоро', 'binnenkort')}</span>
                {notitieKanVerbinden(app)
                  ? <button type='button' className='primary'>{t('Підключити', 'Koppelen')}</button>
                  : <span className='hub-notes-app-geen'>{t('Підключити ще неможливо', 'Koppelen is nog niet mogelijk')}</span>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {open === 'nieuw' ? form : null}

      {notes && notes.length ? (
        <div className='hub-notes-zoek' role='search'>
          <label className='hub-notes-zoekveld'>
            <Search aria-hidden='true' />
            <input type='search' value={vraag} placeholder={t('Шукати в нотатках…', 'In notities zoeken…')} aria-label={t('Шукати в нотатках', 'In notities zoeken')} onChange={(e) => setVraag(e.target.value)} />
          </label>
          <label>{t('Тип', 'Soort')}
            <select value={soortFilter} onChange={(e) => setSoortFilter(e.target.value as NotitieSoort | '')}>
              <option value=''>{t('усі типи', 'alle soorten')}</option>
              {SOORTEN.map((s) => <option key={s.id} value={s.id}>{notitieTekst(s.titel, lang)}</option>)}
            </select>
          </label>
          {wolk.length ? (
            <div className='hub-notes-wolk' role='group' aria-label={t('Теги', 'Etiketten')}>
              {wolk.slice(0, 14).map(({ etiket: e, aantal }) => (
                <button key={e} type='button' className={`hub-notes-etiket is-filter${etiket === e ? ' is-actief' : ''}`} aria-pressed={etiket === e} onClick={() => setEtiket(etiket === e ? '' : e)}>{e} <small>{aantal}</small></button>
              ))}
            </div>
          ) : null}
          {filterActief ? (
            <button type='button' className='ghost small' onClick={() => { setVraag(''); setEtiket(''); setSoortFilter(''); }}>
              <X aria-hidden='true' />{t('Скинути фільтр', 'Filter wissen')}
            </button>
          ) : null}
        </div>
      ) : null}

      {notes === null ? <p className='hub-notes-leeg'>{t('Завантаження…', 'Laden…')}</p>
        : !notes.length && open !== 'nieuw' ? <p className='hub-notes-leeg' data-hub-notes-leeg='1'>{t('Нотаток ще немає. Додайте першу — або попросіть ШІ занотувати щось для вас.', 'Nog geen notities. Voeg de eerste toe — of vraag de AI iets voor u te noteren.')}</p>
          : !gevonden.length ? <p className='hub-notes-leeg' data-hub-notes-geen-treffer='1'><Check aria-hidden='true' />{t('За цим фільтром нотаток немає.', 'Met dit filter zijn er geen notities.')}</p>
            : (
              <ul className='hub-notes-lijst'>
                {gevonden.map((n) => {
                  const v = vormUitEtiketten(n.title, n.body, n.tags);
                  return (
                    <li key={n.id} data-hub-note={n.id} data-hub-note-soort={v.soort} data-hub-note-kleur={v.kleur} data-hub-note-vast={v.vast ? '1' : '0'} className={`kleur-${v.kleur}`}>
                      {open === n.id ? form : kaart(n)}
                    </li>
                  );
                })}
              </ul>
            )}
    </section>
  );
}
