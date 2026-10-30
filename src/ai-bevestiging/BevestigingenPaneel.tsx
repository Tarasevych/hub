// «Запити ШІ на підтвердження» — wat een AI-agent voorstelde en pas na uw klik gebeurt (backend/ai-bevestiging.ts, migratie 0098).
//
// Staat op de plek van één AI (#agent/<slug>, alleen die agent) en in het overzicht van «Підключення ШІ» (alle agenten): één lijst,
// geen tweede kopie. De server geeft alleen de verzoeken van de RUIMTE van dit tabblad (tabContext): een verzoek uit de technische
// ruimte ziet u alleen daar, en omgekeerd — zo kan het ook nooit vanuit de verkeerde ruimte bevestigd worden.
//
// Per verzoek: wie vroeg het, wat er precies gebeurt (de details komen van de server, uit de ONVERANDERLIJKE parameters), hoe lang
// het nog geldt, het risico, en de knoppen «Підтвердити» / «Відхилити». Hoog risico vraagt een verse passkey (src/platform/client.ts
// opent het venster «Підтвердіть доступ» bij 403 STEP_UP_STRONG_REQUIRED en herhaalt het verzoek één keer). De hash die de server
// meestuurde gaat terug bij «Підтвердити»: zijn de parameters intussen veranderd, dan weigert de server.
// Eigen keuzes van de mens (geen parameters van de AI): een vinkje (bv. «для всіх із посиланням») of de fotokiezer van Google.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock, ExternalLink, Images, KeyRound, Loader2, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agenten-gegevens';
import {
  BEVESTIG_FOUT, RISICO_TEKST, STATUS_TEKST, type BevestigKeuze, type BevestigingWeergave,
} from '../../shared/ai-bevestiging';
import './bevestigingen.css';

type Tr = (uk: string, nl: string) => string;
type Lijst = { ruimte: 'prive' | 'technisch'; items: BevestigingWeergave[]; open: number };
type FotoStand = { sessieId: string; pickerUri: string; status: 'selecting' | 'ready' | 'expired'; aantal: number };

const codeVan = (e: unknown): string => String((e as { message?: string } | null)?.message || '');
const uitlegVan = (e: unknown, uk: boolean): string => {
  const data = (e as { response?: { data?: { uitleg?: { uk?: string; nl?: string } } } } | null)?.response?.data;
  if (data?.uitleg && typeof data.uitleg === 'object') return String((uk ? data.uitleg.uk : data.uitleg.nl) || '');
  const c = codeVan(e);
  const t = BEVESTIG_FOUT[c];
  return t ? (uk ? t.uk : t.nl) : (uk ? `Не вдалося (${c || 'немає зв’язку'}).` : `Mislukt (${c || 'geen verbinding'}).`);
};
/** ?bevestiging=<id> en ?google-toegang=<dienst> uit de hash (#agent/claude?bevestiging=…). */
function hashVraag(): URLSearchParams {
  if (typeof location === 'undefined') return new URLSearchParams();
  const h = location.hash || '';
  const i = h.indexOf('?');
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : '');
}
const resterend = (tot: number, tr: Tr): string => {
  const min = Math.max(0, Math.round((tot - Date.now()) / 60000));
  return min <= 0 ? tr('строк минув', 'verlopen') : tr(`ще ${min} хв`, `nog ${min} min`);
};
const GOOGLE_DIENST_TEKST: Record<string, [string, string]> = {
  mail: ['надсилати листи з Gmail', 'mail verzenden met Gmail'],
  drive: ['створювати файли й ділитися ними на Google Диску', 'bestanden maken en delen op Google Drive'],
  photos: ['відкривати вибір фото в Google Photos', 'de fotokiezer van Google Photos openen'],
};

/** Kaart «Надати доступ»: incrementele toestemming bij Google (zelfde koppeling, één scope erbij). */
function GoogleToegang({ tr, dienst }: { tr: Tr; dienst: string }) {
  const uk = tr('uk', 'nl') === 'uk';
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const tekst = GOOGLE_DIENST_TEKST[dienst];
  if (!tekst) return null;
  const start = async () => {
    setBezig(true); setFout('');
    try {
      const r = (await api.post('/api/owner/ai-rechten/google-toegang', { ...sessionBody(), dienst, locale: uk ? 'uk' : 'nl' })).data as { authUrl?: string; alGegeven?: boolean };
      if (r.alGegeven) { setFout(tr('Google уже дав цей дозвіл. Попросіть ШІ спробувати ще раз.', 'Google gaf deze toestemming al. Vraag de AI het opnieuw te proberen.')); setBezig(false); return; }
      if (!r.authUrl) throw new Error('GOOGLE_TOEGANG_START_MISLUKT');
      location.assign(r.authUrl);
    } catch (e) { setFout(uitlegVan(e, uk)); setBezig(false); }
  };
  return (
    <section className='ab-kaart ab-google' data-ab-google={dienst} aria-label={tr('Надати доступ', 'Toegang geven')}>
      <h4><KeyRound size={16} aria-hidden='true' />{tr('ШІ потрібен додатковий дозвіл Google', 'De AI heeft een extra toestemming van Google nodig')}</h4>
      <p>{tr(`Щоб ШІ міг ${tekst[0]}, Google має дозволити це сайту. Це розширює ваше наявне підключення (нічого не від’єднується), і навіть тоді кожна дія — лише з вашим підтвердженням тут.`,
        `Om de AI te laten ${tekst[1]}, moet Google dat de site toestaan. Dit breidt uw bestaande koppeling uit (er wordt niets losgekoppeld), en ook dan gebeurt elke actie alleen met uw bevestiging hier.`)}</p>
      <button type='button' className='ab-knop ab-knop-hoofd' disabled={bezig} onClick={() => void start()} data-ab-google-start='1'>
        {bezig ? <Loader2 size={16} className='spin' aria-hidden='true' /> : <ExternalLink size={16} aria-hidden='true' />}{tr('Надати доступ', 'Toegang geven')}
      </button>
      {fout ? <p className='ab-fout' role='alert'>{fout}</p> : null}
    </section>
  );
}

function Keuzes({ tr, item, keuze, zet, foto, startFoto }: {
  tr: Tr; item: BevestigingWeergave; keuze: Record<string, unknown>; zet: (k: Record<string, unknown>) => void;
  foto: FotoStand | null; startFoto: () => void;
}) {
  const uk = tr('uk', 'nl') === 'uk';
  const lijst: BevestigKeuze[] = item.beschrijving?.keuzes ?? [];
  if (!lijst.length) return null;
  return (
    <div className='ab-keuzes'>
      {lijst.map((k) => k.soort === 'vinkje' ? (
        <label key={k.id} className='ab-vinkje' data-ab-keuze={k.id}>
          {/* Nooit standaard aangevinkt: dit is de aparte, uitdrukkelijke keuze van de mens. */}
          <input type='checkbox' checked={keuze[k.id] === true} onChange={(e) => zet({ ...keuze, [k.id]: e.target.checked })} />
          <span><b>{uk ? k.label.uk : k.label.nl}</b>{k.uitleg ? <small>{uk ? k.uitleg.uk : k.uitleg.nl}</small> : null}</span>
        </label>
      ) : (
        <div key={k.id} className='ab-fotos' data-ab-keuze={k.id}>
          <button type='button' className='ab-knop' onClick={startFoto} disabled={foto?.status === 'selecting' && !!foto.pickerUri}>
            <Images size={16} aria-hidden='true' />{uk ? k.label.uk : k.label.nl}
          </button>
          {foto ? <small data-ab-fotos-stand={foto.status}>{foto.status === 'ready' ? tr(`Вибрано фото: ${foto.aantal}. Тепер натисніть «Підтвердити».`, `Gekozen foto’s: ${foto.aantal}. Klik nu op «Bevestigen».`)
            : foto.status === 'expired' ? tr('Час вибору минув — відкрийте вибір ще раз.', 'De keuzetijd is voorbij — open de kiezer opnieuw.')
              : tr('Вікно Google відкрито: виберіть фото й натисніть там «Готово».', 'Het venster van Google is open: kies de foto’s en klik daar op «Klaar».')}</small> : null}
        </div>
      ))}
    </div>
  );
}

export default function BevestigingenPaneel({ tr, agent }: { tr: Tr; agent?: string }) {
  const uk = tr('uk', 'nl') === 'uk';
  const [data, setData] = useState<Lijst | null>(null);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState<Record<string, string>>({});
  const [keuzes, setKeuzes] = useState<Record<string, Record<string, unknown>>>({});
  const [fotos, setFotos] = useState<Record<string, FotoStand>>({});
  const vraag = useMemo(hashVraag, []);
  const uitgelicht = vraag.get('bevestiging') || '';
  const googleDienst = vraag.get('google-toegang') || '';

  const laad = useCallback(async () => {
    try {
      const r = (await api.post('/api/owner/ai-bevestiging/lijst', { ...sessionBody(), ...(agent ? { agent } : {}), ookAfgerond: true })).data as Lijst;
      setData(r); setFout('');
    } catch (e) { setFout(uitlegVan(e, uk)); }
  }, [agent, uk]);
  useEffect(() => { void laad(); }, [laad]);
  // Zolang er iets open is: elke 5 s verversen (een nieuw verzoek verschijnt dan vanzelf; een verlopen verzoek verdwijnt).
  const iets = !!data?.items.some((x) => x.status === 'wacht' || x.status === 'bezig');
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void laad(); }, iets ? 5000 : 30000);
    return () => window.clearInterval(t);
  }, [laad, iets]);
  // Fotokiezer: stand volgen tot de mens in het venster van Google «Готово» koos.
  useEffect(() => {
    const lopend = Object.entries(fotos).filter(([, f]) => f.status === 'selecting');
    if (!lopend.length) return;
    const t = window.setInterval(() => {
      for (const [id, f] of lopend) {
        void api.post('/api/owner/ai-rechten/fotos/stand', { ...sessionBody(), sessieId: f.sessieId }).then((r) => {
          const d = r.data as { status: FotoStand['status']; items: unknown[] };
          if (d.status !== 'selecting') {
            setFotos((x) => ({ ...x, [id]: { ...f, status: d.status, aantal: d.items.length } }));
            if (d.status === 'ready') setKeuzes((k) => ({ ...k, [id]: { ...(k[id] || {}), sessie: f.sessieId } }));
          }
        }).catch(() => undefined);
      }
    }, 3000);
    return () => window.clearInterval(t);
  }, [fotos]);

  const startFoto = async (item: BevestigingWeergave) => {
    setMelding((m) => ({ ...m, [item.id]: '' }));
    // Eerst een leeg venster openen (in de klik zelf, anders blokkeert de browser het), dan het adres van Google erin zetten.
    const venster = window.open('about:blank', '_blank', 'width=720,height=760');
    try {
      const r = (await api.post('/api/owner/ai-rechten/fotos/sessie', { ...sessionBody(), bevestigingId: item.id })).data as { sessie: { id: string; pickerUri: string } };
      setFotos((x) => ({ ...x, [item.id]: { sessieId: r.sessie.id, pickerUri: r.sessie.pickerUri, status: 'selecting', aantal: 0 } }));
      if (venster) { venster.opener = null; venster.location.href = r.sessie.pickerUri; } else window.open(r.sessie.pickerUri, '_blank', 'noopener');
    } catch (e) { venster?.close(); setMelding((m) => ({ ...m, [item.id]: uitlegVan(e, uk) })); }
  };
  const besluit = async (item: BevestigingWeergave, ja: boolean) => {
    setBezig(item.id); setMelding((m) => ({ ...m, [item.id]: '' }));
    try {
      const r = (await api.post(ja ? '/api/owner/ai-bevestiging/bevestigen' : '/api/owner/ai-bevestiging/weigeren',
        { ...sessionBody(), id: item.id, ...(ja ? { hash: item.hash, keuze: keuzes[item.id] || {} } : {}) })).data as { item: BevestigingWeergave };
      setMelding((m) => ({ ...m, [item.id]: r.item.status === 'uitgevoerd' ? tr('Виконано.', 'Uitgevoerd.') : r.item.status === 'geweigerd' ? tr('Відхилено. ШІ отримає відповідь «відхилено».', 'Geweigerd. De AI krijgt «geweigerd» terug.') : (uk ? STATUS_TEKST[r.item.status].uk : STATUS_TEKST[r.item.status].nl) }));
    } catch (e) { setMelding((m) => ({ ...m, [item.id]: uitlegVan(e, uk) })); }
    setBezig('');
    void laad();
  };

  const open = (data?.items ?? []).filter((x) => x.status === 'wacht' || x.status === 'bezig');
  const afgerond = (data?.items ?? []).filter((x) => x.status !== 'wacht' && x.status !== 'bezig').slice(0, 8);
  return (
    <section className='ag-kaart ab-paneel' data-ab-paneel={agent || 'alle'} data-ab-open={open.length} aria-labelledby={`ab-kop-${agent || 'alle'}`}>
      <div className='ag-kaart-kop'>
        <h3 id={`ab-kop-${agent || 'alle'}`}><ShieldCheck size={16} aria-hidden='true' /> {tr('Запити ШІ на підтвердження', 'AI-verzoeken ter bevestiging')}</h3>
        <small className='hub-meta'>{data ? (data.ruimte === 'technisch' ? tr('технічний простір', 'technische ruimte') : tr('приватний простір', 'privéruimte')) : ''}</small>
      </div>
      <p className='ab-uitleg'>{tr('Тут з’являється те, що ШІ хоче зробити від вашого імені (надіслати лист, поділитися файлом, вибрати фото…). Без вашого «Підтвердити» нічого не відбувається; запит діє 30 хвилин. Запити іншого простору видно лише там.',
        'Hier verschijnt wat een AI namens u wil doen (een bericht verzenden, een bestand delen, foto’s kiezen…). Zonder uw «Bevestigen» gebeurt er niets; een verzoek geldt 30 minuten. Verzoeken van de andere ruimte ziet u alleen daar.')}</p>
      {googleDienst ? <GoogleToegang tr={tr} dienst={googleDienst} /> : null}
      {fout ? <p className='ab-fout' role='alert'>{fout}</p> : null}
      {!data && !fout ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : null}
      {data && !open.length ? <p className='ag-leeg' data-ab-leeg='1'>{tr('Зараз нічого не чекає на ваше рішення.', 'Er wacht nu niets op uw besluit.')}</p> : null}
      <ul className='ab-lijst'>
        {open.map((item) => {
          const b = item.beschrijving;
          const verplicht = (b?.keuzes ?? []).filter((k) => k.verplicht);
          const keuzeKlaar = verplicht.every((k) => (k.soort === 'fotos' ? typeof keuzes[item.id]?.sessie === 'string' : keuzes[item.id]?.[k.id] === true));
          return (
            <li key={item.id} className={`ab-kaart risico-${item.risico}${item.id === uitgelicht ? ' is-uitgelicht' : ''}`} data-ab-verzoek={item.id} data-ab-soort={item.soort} data-ab-status={item.status}>
              <div className='ab-kop'>
                <b>{b ? (uk ? b.titel.uk : b.titel.nl) : item.soort}</b>
                <span className={`ab-chip risico-${item.risico}`}>{item.stapOp ? <ShieldAlert size={12} aria-hidden='true' /> : <ShieldCheck size={12} aria-hidden='true' />}{uk ? RISICO_TEKST[item.risico].uk : RISICO_TEKST[item.risico].nl}</span>
                <span className='ab-chip'><Clock size={12} aria-hidden='true' />{resterend(item.verlooptOp, tr)}</span>
              </div>
              <small className='hub-meta'>{tr('Просить', 'Vraagt')}: {item.klant || item.agent || tr('ШІ', 'AI')}{item.agent && item.klant ? ` (${item.agent})` : ''}</small>
              {item.gesloten ? <p className='ab-fout' role='note'>{uk ? BEVESTIG_FOUT.SLEUTELKLUIS_GESLOTEN.uk : BEVESTIG_FOUT.SLEUTELKLUIS_GESLOTEN.nl}</p> : null}
              {b ? (
                <>
                  <p className='ab-samenvatting'>{uk ? b.samenvatting.uk : b.samenvatting.nl}</p>
                  <dl className='ab-details'>
                    {b.details.map((d, i) => <div key={i} className={d.nadruk ? 'is-nadruk' : ''}><dt>{uk ? d.label.uk : d.label.nl}</dt><dd>{d.waarde}</dd></div>)}
                  </dl>
                  {b.waarschuwing ? <p className='ab-let' role='note'><ShieldAlert size={14} aria-hidden='true' />{uk ? b.waarschuwing.uk : b.waarschuwing.nl}</p> : null}
                  <Keuzes tr={tr} item={item} keuze={keuzes[item.id] || {}} zet={(k) => setKeuzes((x) => ({ ...x, [item.id]: k }))} foto={fotos[item.id] ?? null} startFoto={() => void startFoto(item)} />
                </>
              ) : null}
              {item.status === 'wacht' ? (
                <div className='ab-acties'>
                  <button type='button' className={`ab-knop ab-knop-hoofd risico-${item.risico}`} data-ab-bevestig={item.id} disabled={!!bezig || item.gesloten || !b || !keuzeKlaar} onClick={() => void besluit(item, true)}>
                    {bezig === item.id ? <Loader2 size={16} className='spin' aria-hidden='true' /> : item.stapOp ? <KeyRound size={16} aria-hidden='true' /> : <Check size={16} aria-hidden='true' />}
                    {item.stapOp ? tr('Підтвердити з passkey', 'Bevestigen met passkey') : tr('Підтвердити', 'Bevestigen')}
                  </button>
                  <button type='button' className='ab-knop' data-ab-weiger={item.id} disabled={!!bezig} onClick={() => void besluit(item, false)}><X size={16} aria-hidden='true' />{tr('Відхилити', 'Weigeren')}</button>
                </div>
              ) : <p className='ab-stand'><Loader2 size={14} className='spin' aria-hidden='true' />{uk ? STATUS_TEKST[item.status].uk : STATUS_TEKST[item.status].nl}</p>}
              {melding[item.id] ? <p className='ab-melding' role='status'>{melding[item.id]}</p> : null}
            </li>
          );
        })}
      </ul>
      {afgerond.length ? (
        <details className='ab-afgerond'>
          <summary>{tr(`Нещодавно вирішені (${afgerond.length})`, `Recent beslist (${afgerond.length})`)}</summary>
          <ul>
            {afgerond.map((item) => (
              <li key={item.id} data-ab-afgerond={item.status}>
                <b>{item.beschrijving ? (uk ? item.beschrijving.titel.uk : item.beschrijving.titel.nl) : item.soort}</b>
                {' · '}{uk ? STATUS_TEKST[item.status].uk : STATUS_TEKST[item.status].nl}
                {item.uitkomst.map((u, i) => <span key={i}>{' · '}{uk ? u.label.uk : u.label.nl}: {u.waarde}</span>)}
                {item.fout ? <small> · {BEVESTIG_FOUT[item.fout] ? (uk ? BEVESTIG_FOUT[item.fout].uk : BEVESTIG_FOUT[item.fout].nl) : item.fout}</small> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
