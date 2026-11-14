// «Секрети й ключі» (admin.* /contour): alle geheimen van de site op één plek.
// Veiligheidsmodel (zie backend/geheimen.ts en api-platform-kluis.ts):
//  - de lijst bevat alleen namen en metadata; een waarde komt pas na «Показати» terug, met passkey / app-code / herstelcode
//    (venster «Підтвердіть доступ», één bevestiging = één actie);
//  - een getoonde waarde staat alleen in het geheugen van deze pagina en verdwijnt na 30 s, bij een andere tab of bij sluiten;
//  - tonen, vervangen en verwijderen worden met wie/wanneer/hoe vastgelegd in het auditlogboek (nooit de waarde).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, ClipboardCopy, Eye, EyeOff, History, Info, KeyRound, Lock, Plus, RefreshCw, Replace, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { api } from '../platform/client';
import { Venster } from '../platform/vensters';
import { VaultMetaBewerker, VaultMetaRegel } from '../KluisMeta';
import { ACTIE_NAAM, BRON_NAAM, DIENSTEN, DOEL_INFO, GEHEIM_GROEPEN, GROEP_NAAM, STAAT_NAAM, VAULT_DOELEN, isVaultDoel, type Geheim, type GeheimActie, type GeheimGebeurtenis, type GeheimGroep, type VaultDoel } from '../../shared/geheimen';
import { DienstLogo, GROEP_ICOON } from './logos';
import { Avatar, Historie } from './Historie';
import { aandacht, datum, datumTijd, filterGeheimen, filterJournaal, foutTekst, geleden, groepeer, kies, laatstePerNaam, sorteerGeheimen, standaardFilters, standaardJournaal, telStanden, tr, type Filters, type JournaalFilter, type Lang } from './hulp';
// Invoer en rotatie lopen via het canonieke GeheimFormulier (met GeheimInvoer soort='kluis' en verborgen).
import { GeheimFormulier } from './GeheimFormulier';
import './geheimen.css';
import './geheimen-maquette.css';

type Props = { lang: Lang; sourceOrigin: string; tabContext: string };
type Bericht = { soort: 'ok' | 'fout' | 'info'; tekst: string } | null;
const TOON_SECONDEN = 30;
const apiFout = (e: unknown) => {
  const v = e as { response?: { data?: { error?: unknown; reasonCode?: unknown } }; message?: unknown };
  return String(v?.response?.data?.error || v?.response?.data?.reasonCode || v?.message || '');
};
const vaultId = (g: Geheim) => (g.bron === 'vault' ? g.id.slice('vault:'.length) : '');

export default function Geheimen({ lang, sourceOrigin, tabContext }: Props) {
  const context = useMemo(() => ({ service: 'admin', tabContext, sourceOrigin }), [tabContext, sourceOrigin]);
  const [laden, setLaden] = useState(true);
  const [items, setItems] = useState<Geheim[]>([]);
  const [vaultKlaar, setVaultKlaar] = useState(true);
  const [journaal, setJournaal] = useState<GeheimGebeurtenis[]>([]);
  const [bericht, setBericht] = useState<Bericht>(null);
  const [bezig, setBezig] = useState('');
  const [weergave, setWeergave] = useState<'lijst' | 'journaal'>('lijst');
  const [filters, setFilters] = useState<Filters>(standaardFilters);
  const [jFilter, setJFilter] = useState<JournaalFilter>(standaardJournaal);
  const [detailId, setDetailId] = useState('');
  const [detailHistorie, setDetailHistorie] = useState<GeheimGebeurtenis[] | null>(null);
  const [getoond, setGetoond] = useState<{ id: string; waarde: string; tot: number } | null>(null);
  const [nu, setNu] = useState(Date.now());
  const [gekopieerd, setGekopieerd] = useState('');
  const [toevoegen, setToevoegen] = useState<{ doel: VaultDoel } | null>(null);
  const [vervangen, setVervangen] = useState<{ item: Geheim } | null>(null);
  const [verwijderen, setVerwijderen] = useState<{ item: Geheim; typed: string } | null>(null);
  const timer = useRef<number>(0);

  const verberg = useCallback(() => setGetoond(null), []);

  const laad = useCallback(async () => {
    setLaden(true);
    try {
      const [lijst, hist] = await Promise.all([
        api.post('/api/owner/geheimen/lijst', context),
        api.post('/api/owner/geheimen/historie', { ...context, limiet: 300 }).catch(() => null),
      ]);
      const d = (lijst.data || {}) as { items?: Geheim[]; vaultKlaar?: boolean };
      setItems(Array.isArray(d.items) ? d.items : []);
      setVaultKlaar(d.vaultKlaar !== false);
      const h = (hist?.data || {}) as { items?: GeheimGebeurtenis[] };
      setJournaal(Array.isArray(h.items) ? h.items : []);
    } catch (e) {
      setBericht({ soort: 'fout', tekst: tr(lang, 'Не вдалося завантажити секрети: ', 'Geheimen laden mislukt: ') + foutTekst(apiFout(e), lang) });
    }
    setLaden(false);
  }, [context, lang]);

  useEffect(() => { void laad(); }, [laad]);

  // Een getoonde waarde verdwijnt vanzelf: timer, andere tab, en bij het verlaten van de pagina.
  useEffect(() => {
    if (!getoond) return undefined;
    const t = window.setInterval(() => { const n = Date.now(); setNu(n); if (n >= getoond.tot) setGetoond(null); }, 250);
    const zichtbaar = () => { if (document.visibilityState === 'hidden') setGetoond(null); };
    document.addEventListener('visibilitychange', zichtbaar);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', zichtbaar); };
  }, [getoond]);
  useEffect(() => () => { setGetoond(null); window.clearTimeout(timer.current); }, []);

  const melding = (soort: 'ok' | 'fout' | 'info', tekst: string) => { setBericht({ soort, tekst }); };

  const standen = useMemo(() => telStanden(items), [items]);
  const zichtbaar = useMemo(() => sorteerGeheimen(filterGeheimen(items, filters, lang)), [items, filters, lang]);
  const groepen = useMemo(() => groepeer(zichtbaar), [zichtbaar]);
  const laatste = useMemo(() => laatstePerNaam(journaal), [journaal]);
  const weekGeleden = Date.now() - 7 * 86_400_000;
  const dezeWeek = journaal.filter((e) => e.at >= weekGeleden).length;
  const telPerGroep = useMemo(() => { const m = new Map<GeheimGroep, number>(); for (const g of items) m.set(g.groep, (m.get(g.groep) ?? 0) + 1); return m; }, [items]);
  const wie = useMemo(() => { const m = new Map<string, GeheimGebeurtenis['wie']>(); for (const e of journaal) if (e.wie.id && !m.has(e.wie.id)) m.set(e.wie.id, e.wie); return [...m.values()]; }, [journaal]);
  const journaalZicht = useMemo(() => filterJournaal(journaal, jFilter), [journaal, jFilter]);
  const detail = items.find((g) => g.id === detailId) || null;

  // ---------------------------------------------------------------------------------------------- acties
  const toon = async (g: Geheim) => {
    if (bezig) return;
    if (getoond?.id === g.id) { verberg(); return; }
    setBezig('toon');
    try {
      const r = await api.post(`/api/owner/api-platform/vault/${vaultId(g)}/reveal`, { ...context, confirm: 'REVEAL_SECRET' });
      const waarde = String(r.data?.revealedValue || '');
      if (!waarde) throw new Error('OWNER_VAULT_REVEAL_FAILED');
      const n = Date.now();
      setNu(n);
      setGetoond({ id: g.id, waarde, tot: n + TOON_SECONDEN * 1000 });
      void laad();
    } catch (e) { melding('fout', tr(lang, 'Не вдалося показати: ', 'Tonen mislukt: ') + foutTekst(apiFout(e), lang)); }
    setBezig('');
  };

  const kopieer = async (g: Geheim) => {
    if (!getoond || getoond.id !== g.id) return;
    try { await navigator.clipboard.writeText(getoond.waarde); setGekopieerd(g.id); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setGekopieerd(''), 2500); }
    catch { melding('fout', tr(lang, 'Браузер не дозволив копіювання.', 'De browser stond kopiëren niet toe.')); }
  };

  const verwijder = async (g: Geheim) => {
    setBezig('verwijder');
    try {
      await api.post(`/api/owner/api-platform/vault/${vaultId(g)}/delete`, context);
      setVerwijderen(null); verberg(); if (detailId === g.id) setDetailId('');
      await laad();
      melding('ok', tr(lang, `«${g.naam}» видалено. Дію записано в журнал.`, `«${g.naam}» verwijderd. De actie is gelogd.`));
    } catch (e) { melding('fout', tr(lang, 'Не вдалося видалити: ', 'Verwijderen mislukt: ') + foutTekst(apiFout(e), lang)); }
    setBezig('');
  };

  const openDetail = async (g: Geheim) => {
    setDetailId(g.id); setDetailHistorie(null);
    try {
      const r = await api.post('/api/owner/geheimen/historie', { ...context, naam: g.naam, vaultId: vaultId(g) || undefined, limiet: 200 });
      setDetailHistorie(Array.isArray(r.data?.items) ? r.data.items : []);
    } catch { setDetailHistorie([]); }
  };

  // ---------------------------------------------------------------------------------------------- onderdelen
  const staatChip = (g: Geheim) => {
    const toon = g.staat === 'ingesteld' ? 'ok' : g.staat === 'bijna' || g.staat === 'nog-niet' ? 'warn' : 'bad';
    return <span className='gm-chip' data-toon={toon} data-staat={g.staat}>{kies(lang, STAAT_NAAM[g.staat])}</span>;
  };
  const rest = getoond ? Math.max(0, Math.ceil((getoond.tot - nu) / 1000)) : 0;

  const kaart = (g: Geheim) => {
    const isGetoond = getoond?.id === g.id;
    const l = laatste.get(g.naam);
    return (
      <article key={g.id} className='gm-kaart' data-gm-geheim={g.naam} data-gm-staat={g.staat} data-gm-bron={g.bron} data-aandacht={aandacht(g) ? '' : undefined}>
        <DienstLogo dienst={g.dienst} grootte={42} titel={kies(lang, DIENSTEN[g.dienst].naam)} />
        <div className='gm-kaart-tekst'>
          <div className='gm-kaart-kop'>
            <button type='button' className='gm-naam' onClick={() => void openDetail(g)} title={tr(lang, 'Відкрити деталі та історію', 'Details en geschiedenis openen')}>{g.naam}</button>
            {staatChip(g)}
          </div>
          <div className='gm-kaart-sub'>
            <span>{kies(lang, DIENSTEN[g.dienst].naam)}</span><span aria-hidden='true'>·</span><span>{kies(lang, BRON_NAAM[g.bron])}</span>
            {g.bijgewerktOp ? <><span aria-hidden='true'>·</span><span>{tr(lang, 'змінено ', 'gewijzigd ')}{datum(g.bijgewerktOp, lang)}</span></> : null}
          </div>
          <code className={`gm-waarde${isGetoond ? ' is-zichtbaar' : ''}`} data-gm-waarde={isGetoond ? 'zichtbaar' : 'verborgen'}>
            {isGetoond ? getoond!.waarde : (g.gemaskeerd || '—')}
          </code>
          {isGetoond ? <div className='gm-teller' role='timer' aria-live='off'><span style={{ width: `${(rest / TOON_SECONDEN) * 100}%` }} /><small>{tr(lang, `Сховається через ${rest} с`, `Verdwijnt over ${rest} s`)}</small></div> : null}
          {g.bron === 'vault' ? <VaultMetaRegel lang={lang} meta={g.meta} staat={g.vaultStaat} /> : g.verlooptOp ? <small className='gm-klein'><CalendarClock aria-hidden='true' />{tr(lang, 'діє до ', 'geldig tot ')}{datum(g.verlooptOp, lang)}</small> : null}
          {l ? <small className='gm-klein gm-laatste'><Avatar wie={l.wie} grootte={18} />{l.wie.naam || l.wie.email}: {tr(lang, 'остання дія — ', 'laatste actie — ')}{kies(lang, ACTIE(l.actie))} · {geleden(l.at, lang)}</small> : null}
          {g.beheerdIn ? <small className='gm-klein gm-beheerd'><Lock aria-hidden='true' />{kies(lang, g.beheerdIn)}</small> : null}
        </div>
        <div className='gm-acties'>
          {g.bron === 'vault' ? <>
            <button type='button' className='gm-knop' data-gm-toon={g.naam} disabled={!!bezig || !g.kanTonen} onClick={() => void toon(g)} aria-pressed={isGetoond}>
              {isGetoond ? <EyeOff aria-hidden='true' /> : <Eye aria-hidden='true' />}{isGetoond ? tr(lang, 'Сховати', 'Verbergen') : tr(lang, 'Показати', 'Tonen')}
            </button>
            {isGetoond ? <button type='button' className='gm-knop' onClick={() => void kopieer(g)}>{gekopieerd === g.id ? <Check aria-hidden='true' /> : <ClipboardCopy aria-hidden='true' />}{gekopieerd === g.id ? tr(lang, 'Скопійовано', 'Gekopieerd') : tr(lang, 'Копіювати', 'Kopiëren')}</button> : null}
            <button type='button' className='gm-knop' data-gm-vervang={g.naam} disabled={!!bezig || !g.kanWijzigen} onClick={() => setVervangen({ item: g })}><Replace aria-hidden='true' />{tr(lang, 'Замінити', 'Vervangen')}</button>
            <button type='button' className='gm-knop is-gevaar' data-gm-verwijder={g.naam} disabled={!!bezig} onClick={() => setVerwijderen({ item: g, typed: '' })}><Trash2 aria-hidden='true' />{tr(lang, 'Видалити', 'Verwijderen')}</button>
          </> : null}
          <button type='button' className='gm-knop' onClick={() => void openDetail(g)}><History aria-hidden='true' />{tr(lang, 'Історія', 'Geschiedenis')}</button>
        </div>
      </article>
    );
  };

  if (laden && !items.length) {
    return <section className='admin-section gm-root' data-gm='laden' aria-busy='true'><RefreshCw className='spin' /><p>{tr(lang, 'Завантажуємо секрети…', 'Geheimen worden geladen…')}</p></section>;
  }

  return (
    <section className='admin-section gm-root' data-gm='klaar'>
      <header className='gm-kop'>
        <ShieldCheck aria-hidden='true' />
        <div>
          <h2>{tr(lang, 'Секрети й ключі', 'Geheimen en sleutels')}</h2>
          <p>{tr(lang, 'Усі ключі й секрети сайту, сервера та підключених сервісів — лише назви й стан. Значення з’являється тільки після підтвердження (passkey або код) і зникає через 30 секунд.', 'Alle sleutels en geheimen van de site, de server en de gekoppelde diensten — alleen namen en status. Een waarde verschijnt pas na bevestiging (passkey of code) en verdwijnt na 30 seconden.')}</p>
        </div>
        <div className='gm-kop-acties'>
          <button type='button' className='gm-knop' onClick={() => void laad()} disabled={laden}><RefreshCw className={laden ? 'spin' : undefined} aria-hidden='true' />{tr(lang, 'Оновити', 'Vernieuwen')}</button>
          <button type='button' className='gm-knop is-primair' data-gm-toevoegen onClick={() => setToevoegen({ doel: 'github' })} disabled={!vaultKlaar}><Plus aria-hidden='true' />{tr(lang, 'Додати секрет', 'Geheim toevoegen')}</button>
        </div>
      </header>

      <div className='gm-veilig' role='note'>
        <Lock aria-hidden='true' />
        <p>{tr(lang, 'Показ, заміна й видалення — лише після підтвердження passkey, кодом із застосунку або кодом відновлення; одне підтвердження діє на одну дію. Кожна дія (хто, коли, що, чим підтверджено) пишеться в журнал аудиту — без самого значення.', 'Tonen, vervangen en verwijderen kan alleen na bevestiging met passkey, app-code of herstelcode; één bevestiging geldt voor één actie. Elke actie (wie, wanneer, wat, waarmee bevestigd) wordt gelogd in het auditlogboek — zonder de waarde zelf.')}</p>
      </div>
      {!vaultKlaar ? <p className='gm-banner is-bad' role='alert'><AlertTriangle aria-hidden='true' />{tr(lang, 'Шифрування сховища недоступне на сервері (OWNER_VAULT_ENCRYPTION_KEY_V1): нові секрети зараз не зберігаються.', 'Kluisversleuteling is niet beschikbaar op de server (OWNER_VAULT_ENCRYPTION_KEY_V1): nieuwe geheimen worden nu niet opgeslagen.')}</p> : null}
      {bericht ? <p className={`gm-banner is-${bericht.soort}`} role={bericht.soort === 'fout' ? 'alert' : 'status'}>{bericht.soort === 'fout' ? <AlertTriangle aria-hidden='true' /> : bericht.soort === 'ok' ? <Check aria-hidden='true' /> : <Info aria-hidden='true' />}<span>{bericht.tekst}</span><button type='button' className='gm-sluit' aria-label={tr(lang, 'Закрити повідомлення', 'Melding sluiten')} onClick={() => setBericht(null)}><X aria-hidden='true' /></button></p> : null}

      <div className='gm-tegels'>
        <article><b>{standen.totaal}</b><span>{tr(lang, 'усього секретів', 'geheimen totaal')}</span></article>
        <article data-toon='ok'><b>{standen.ingesteld}</b><span>{tr(lang, 'задано й діють', 'ingesteld en geldig')}</span></article>
        <button type='button' className='gm-tegel-knop' data-toon={standen.aandacht ? 'bad' : 'ok'} onClick={() => { setWeergave('lijst'); setFilters({ ...standaardFilters, staat: 'aandacht' }); }}><b>{standen.aandacht}</b><span>{tr(lang, 'потребують уваги', 'vragen aandacht')}</span><small>{tr(lang, `${standen.verlopen} прострочені · ${standen.bijna} скоро · ${standen.ontbreekt} відсутні`, `${standen.verlopen} verlopen · ${standen.bijna} bijna · ${standen.ontbreekt} ontbreken`)}</small></button>
        <button type='button' className='gm-tegel-knop' onClick={() => setWeergave('journaal')}><b>{dezeWeek}</b><span>{tr(lang, 'дій за 7 днів', 'acties in 7 dagen')}</span><small>{tr(lang, 'відкрити журнал', 'journaal openen')}</small></button>
      </div>

      <div className='gm-tabs' role='tablist'>
        <button type='button' role='tab' aria-selected={weergave === 'lijst'} className={weergave === 'lijst' ? 'is-actief' : ''} onClick={() => setWeergave('lijst')}><KeyRound aria-hidden='true' />{tr(lang, 'Секрети', 'Geheimen')}<i>{items.length}</i></button>
        <button type='button' role='tab' aria-selected={weergave === 'journaal'} className={weergave === 'journaal' ? 'is-actief' : ''} onClick={() => setWeergave('journaal')}><History aria-hidden='true' />{tr(lang, 'Журнал дій', 'Actielogboek')}<i>{journaal.length}</i></button>
      </div>

      {weergave === 'lijst' ? <>
        <div className='gm-balk'>
          <label className='gm-zoek'><Search aria-hidden='true' /><input type='search' value={filters.zoek} onChange={(e) => setFilters({ ...filters, zoek: e.target.value })} placeholder={tr(lang, 'Пошук: назва, сервіс, відповідальний…', 'Zoeken: naam, dienst, verantwoordelijke…')} aria-label={tr(lang, 'Пошук секретів', 'Geheimen zoeken')} /></label>
          <select data-hulp-vrij='filter' value={filters.staat} onChange={(e) => setFilters({ ...filters, staat: e.target.value as Filters['staat'] })} aria-label={tr(lang, 'Стан', 'Staat')}>
            <option value='alle'>{tr(lang, 'Усі стани', 'Alle statussen')}</option>
            <option value='aandacht'>{tr(lang, 'Потребують уваги', 'Vragen aandacht')}</option>
            {(['ingesteld', 'ontbreekt', 'bijna', 'verlopen', 'ingetrokken'] as const).map((s) => <option key={s} value={s}>{kies(lang, STAAT_NAAM[s])}</option>)}
          </select>
          <select data-hulp-vrij='filter' value={filters.bron} onChange={(e) => setFilters({ ...filters, bron: e.target.value as Filters['bron'] })} aria-label={tr(lang, 'Джерело', 'Bron')}>
            <option value='alle'>{tr(lang, 'Усі джерела', 'Alle bronnen')}</option>
            {(Object.keys(BRON_NAAM) as Array<keyof typeof BRON_NAAM>).map((b) => <option key={b} value={b}>{kies(lang, BRON_NAAM[b])}</option>)}
          </select>
        </div>
        <div className='gm-chips' role='group' aria-label={tr(lang, 'Категорії', 'Categorieën')}>
          <button type='button' className={filters.groep === 'alle' ? 'is-actief' : ''} onClick={() => setFilters({ ...filters, groep: 'alle' })}>{tr(lang, 'Усі', 'Alle')}<i>{items.length}</i></button>
          {GEHEIM_GROEPEN.filter((gr) => telPerGroep.get(gr)).map((gr) => { const Ic = GROEP_ICOON[gr]; return <button key={gr} type='button' data-gm-groep={gr} className={filters.groep === gr ? 'is-actief' : ''} onClick={() => setFilters({ ...filters, groep: gr })}><Ic aria-hidden />{kies(lang, GROEP_NAAM[gr])}<i>{telPerGroep.get(gr)}</i></button>; })}
        </div>

        {groepen.length ? groepen.map(([gr, lijst]) => { const Ic = GROEP_ICOON[gr]; return (
          <section key={gr} className='gm-groep' data-gm-groepssectie={gr}>
            <h3><Ic aria-hidden />{kies(lang, GROEP_NAAM[gr])}<i>{lijst.length}</i></h3>
            <div className='gm-lijst'>{lijst.map(kaart)}</div>
          </section>); }) : <p className='gm-leeg'>{items.length ? tr(lang, 'Нічого не знайдено за цими фільтрами.', 'Niets gevonden met deze filters.') : tr(lang, 'Секретів ще немає. Додайте перший.', 'Nog geen geheimen. Voeg het eerste toe.')} {filters.zoek || filters.groep !== 'alle' || filters.staat !== 'alle' || filters.bron !== 'alle' ? <button type='button' className='gm-link' onClick={() => setFilters(standaardFilters)}>{tr(lang, 'Скинути фільтри', 'Filters wissen')}</button> : null}</p>}
      </> : (
        <div className='gm-journaal' data-gm-journaal>
          <div className='gm-balk'>
            <label className='gm-zoek'><Search aria-hidden='true' /><input type='search' value={jFilter.zoek} onChange={(e) => setJFilter({ ...jFilter, zoek: e.target.value })} placeholder={tr(lang, 'Пошук: секрет, людина…', 'Zoeken: geheim, persoon…')} aria-label={tr(lang, 'Пошук у журналі', 'Zoeken in logboek')} /></label>
            <select data-hulp-vrij='filter' value={jFilter.actie} onChange={(e) => setJFilter({ ...jFilter, actie: e.target.value as JournaalFilter['actie'] })} aria-label={tr(lang, 'Дія', 'Actie')}>
              <option value='alle'>{tr(lang, 'Усі дії', 'Alle acties')}</option>
              {(['getoond', 'aangemaakt', 'vervangen', 'termijn', 'hernoemd', 'verwijderd', 'geweigerd', 'bekeken'] as const).map((a) => <option key={a} value={a}>{kies(lang, ACTIE(a))}</option>)}
            </select>
            <select data-hulp-vrij='filter' value={jFilter.wie} onChange={(e) => setJFilter({ ...jFilter, wie: e.target.value })} aria-label={tr(lang, 'Хто', 'Wie')}>
              <option value='alle'>{tr(lang, 'Усі люди', 'Alle personen')}</option>
              {wie.map((w) => <option key={w.id} value={w.id}>{w.naam || w.email || w.id}</option>)}
            </select>
            <label className='gm-datum'>{tr(lang, 'з', 'van')}<input type='date' value={jFilter.van} onChange={(e) => setJFilter({ ...jFilter, van: e.target.value })} /></label>
            <label className='gm-datum'>{tr(lang, 'по', 'tot')}<input type='date' value={jFilter.tot} onChange={(e) => setJFilter({ ...jFilter, tot: e.target.value })} /></label>
          </div>
          <Historie lang={lang} items={journaalZicht} leeg={journaal.length ? tr(lang, 'За цими фільтрами подій немає.', 'Geen gebeurtenissen met deze filters.') : tr(lang, 'Подій ще немає: тут з’являться перегляди, додавання, заміни та видалення.', 'Nog geen gebeurtenissen: hier komen bekijken, toevoegen, vervangen en verwijderen.')} />
          <p className='gm-klein'><Info aria-hidden='true' />{tr(lang, 'Повний захищений хеш-ланцюжком журнал усіх дій — на сторінці ', 'Het volledige, met een hashketen beveiligde logboek van alle acties staat op de pagina ')}<a href='/audit'>{tr(lang, 'Журнал', 'Logboek')}</a>.</p>
        </div>
      )}

      {detail ? (
        <Venster id='gm-detail' titel={detail.naam} breedte={680} lang={lang} onSluit={() => setDetailId('')} className='gm-venster'>
          <div className='gm-detail' data-gm-detail={detail.naam}>
            <div className='gm-detail-kop'><DienstLogo dienst={detail.dienst} grootte={52} titel={kies(lang, DIENSTEN[detail.dienst].naam)} /><div><h3>{detail.naam}</h3><p>{kies(lang, DIENSTEN[detail.dienst].naam)} · {kies(lang, GROEP_NAAM[detail.groep])}</p></div>{staatChip(detail)}</div>
            <dl className='gm-feiten'>
              <div><dt>{tr(lang, 'Джерело', 'Bron')}</dt><dd>{kies(lang, BRON_NAAM[detail.bron])}</dd></div>
              <div><dt>{tr(lang, 'Додано', 'Aangemaakt')}</dt><dd>{detail.aangemaaktOp ? datumTijd(detail.aangemaaktOp, lang) : '—'}</dd></div>
              <div><dt>{tr(lang, 'Остання зміна', 'Laatst gewijzigd')}</dt><dd>{detail.bijgewerktOp ? datumTijd(detail.bijgewerktOp, lang) : '—'}</dd></div>
              <div><dt>{tr(lang, 'Діє до', 'Geldig tot')}</dt><dd>{detail.verlooptOp ? datum(detail.verlooptOp, lang) : tr(lang, 'без терміну', 'zonder termijn')}</dd></div>
              {detail.laatstGebruikt ? <div><dt>{tr(lang, 'Востаннє використано', 'Laatst gebruikt')}</dt><dd>{datumTijd(detail.laatstGebruikt, lang)}</dd></div> : null}
              {detail.doel ? <div><dt>{tr(lang, 'Призначення', 'Doel')}</dt><dd>{kies(lang, DOEL_INFO[(VAULT_DOELEN as readonly string[]).includes(detail.doel) ? detail.doel as VaultDoel : 'other'].naam)}</dd></div> : null}
            </dl>
            {detail.notitie ? <p className='gm-klein'><Info aria-hidden='true' />{kies(lang, detail.notitie)}</p> : null}
            {detail.beheerdIn ? <p className='gm-banner is-info'><Lock aria-hidden='true' /><span>{kies(lang, detail.beheerdIn)}</span></p> : null}
            {detail.bron === 'vault' ? <div className='gm-detail-meta'><h4>{tr(lang, 'Термін, власник, відповідальний', 'Termijn, eigenaar, verantwoordelijke')}</h4><VaultMetaBewerker lang={lang} id={vaultId(detail)} meta={detail.meta} context={context} onOpgeslagen={async () => { await laad(); await openDetail(detail); }} /></div> : null}
            <h4 className='gm-historie-kop'><History aria-hidden='true' />{tr(lang, 'Історія цього секрету', 'Geschiedenis van dit geheim')}</h4>
            {detailHistorie ? <Historie lang={lang} items={detailHistorie} metNaam={false} leeg={tr(lang, 'Для цього секрету подій ще немає.', 'Nog geen gebeurtenissen voor dit geheim.')} /> : <p className='gm-leeg'><RefreshCw className='spin' aria-hidden='true' /> {tr(lang, 'Завантаження…', 'Laden…')}</p>}
          </div>
        </Venster>
      ) : null}

      {toevoegen ? (
        <Venster id='gm-toevoegen' titel={tr(lang, 'Додати секрет', 'Geheim toevoegen')} breedte={620} lang={lang} onSluit={() => setToevoegen(null)} className='gm-venster'>
          <GeheimFormulier
            lang={lang}
            beginDoel={toevoegen.doel}
            vaultKlaar={vaultKlaar}
            context={context}
            formulierNaam='toevoegen'
            onAnnuleer={() => setToevoegen(null)}
            onOpgeslagen={async ({ rotated }) => {
              setToevoegen(null);
              verberg();
              await laad();
              melding('ok', rotated ? tr(lang, 'Значення замінено й зашифровано. Дію записано в журнал.', 'Waarde vervangen en versleuteld. De actie is gelogd.') : tr(lang, 'Секрет додано й зашифровано. Дію записано в журнал.', 'Geheim toegevoegd en versleuteld. De actie is gelogd.'));
            }}
          />
        </Venster>
      ) : null}

      {vervangen ? (
        <Venster id='gm-vervangen' titel={`${tr(lang, 'Замінити значення', 'Waarde vervangen')}: ${vervangen.item.naam}`} breedte={600} lang={lang} onSluit={() => setVervangen(null)} className='gm-venster'>
          <GeheimFormulier
            lang={lang}
            vasteItem={{
              id: vaultId(vervangen.item),
              naam: vervangen.item.naam,
              doel: isVaultDoel(vervangen.item.doel) ? vervangen.item.doel : 'other',
              meta: vervangen.item.meta,
            }}
            vaultKlaar={vaultKlaar}
            context={context}
            formulierNaam='vervangen'
            onAnnuleer={() => setVervangen(null)}
            onOpgeslagen={async () => {
              setVervangen(null);
              verberg();
              await laad();
              melding('ok', tr(lang, 'Значення замінено й зашифровано. Дію записано в журнал.', 'Waarde vervangen en versleuteld. De actie is gelogd.'));
            }}
          />
        </Venster>
      ) : null}

      {verwijderen ? (
        <Venster id='gm-verwijderen' titel={`${tr(lang, 'Видалити секрет', 'Geheim verwijderen')}: ${verwijderen.item.naam}`} breedte={520} lang={lang} onSluit={() => setVerwijderen(null)} className='gm-venster'>
          <form className='gm-formulier' data-gm-formulier='verwijderen' onSubmit={(e) => { e.preventDefault(); if (verwijderen.typed === verwijderen.item.naam) void verwijder(verwijderen.item); }}>
            <p className='gm-banner is-bad'><AlertTriangle aria-hidden='true' /><span>{tr(lang, 'Видалення незворотне: значення зникне зі сховища. Сервіси, що його використовують, перестануть працювати.', 'Verwijderen is onomkeerbaar: de waarde verdwijnt uit de kluis. Diensten die het gebruiken, werken niet meer.')}</span></p>
            <label>{tr(lang, `Введіть назву «${verwijderen.item.naam}» для підтвердження`, `Typ de naam «${verwijderen.item.naam}» ter bevestiging`)}<input value={verwijderen.typed} onChange={(e) => setVerwijderen({ ...verwijderen, typed: e.target.value })} autoComplete='off' spellCheck={false} /></label>
            <div className='gm-formulier-acties'><button type='button' className='gm-knop' onClick={() => setVerwijderen(null)}>{tr(lang, 'Скасувати', 'Annuleren')}</button><button type='submit' className='gm-knop is-gevaar' disabled={!!bezig || verwijderen.typed !== verwijderen.item.naam}>{bezig === 'verwijder' ? <RefreshCw className='spin' aria-hidden='true' /> : <Trash2 aria-hidden='true' />}{tr(lang, 'Видалити назавжди', 'Definitief verwijderen')}</button></div>
          </form>
        </Venster>
      ) : null}
    </section>
  );
}

function ACTIE(a: GeheimActie) { return ACTIE_NAAM[a]; }
