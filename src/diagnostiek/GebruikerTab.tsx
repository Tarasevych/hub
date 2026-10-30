// «Скарга користувача»: de beheerder zoekt een gebruiker en ziet wat die op de site ervaart (alleen metadata, nooit inhoud).
// Het antwoord komt van /api/owner/admin/diagnostiek/gebruiker; de beoordeling (bevindingen) is een zuivere functie op de server.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CircleHelp, Clock, Loader2, MonitorSmartphone, Plug, Search, UserRound, X, XCircle } from 'lucide-react';
import { api } from '../platform/client';
import { leeftijd, type Tekst } from '../../shared/beheer-diagnostiek';
import { foutTekst, tekstUit, type Lang } from './hulp';
import AccountTabel from './AccountTabel';

type Kort = { id: string; naam: string; email: string; foto: string; status: string };
type Bevinding = { ernst: 'fout' | 'let-op' | 'info'; code: string; tekst: Tekst; stap?: Tekst };
type Detail = {
  nu: number;
  gebruiker: Kort & { rol: string; aangemaakt: number };
  sessies: { actief: number; totaal: number; laatsteActiviteit: number; apparaten: string[] };
  acties: { dag: number; weekMislukt: number; dagMislukt: number; recent: Array<{ t: number; label: Tekst; sectie: Tekst; dienst: string; mislukt: boolean }> };
  koppelingen: { oauth: Array<{ client: string; n: number; laatst: number }>; agenten: { verbonden: number; totaal: number }; mailMislukt: number; mailVast: number };
  diensten: Array<{ dienst: string; naam: Tekst; stand: 'ok' | 'let-op' | 'fout' | 'onbekend' | 'nooit'; acties: number; mislukt: number }>;
  bevindingen: Bevinding[];
};
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const tijd = (lang: Lang, ms: number) => (ms ? new Date(ms).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const STAND_NAAM: Record<string, Tekst> = { ok: ['Справно', 'In orde'], 'let-op': ['Увага', 'Let op'], fout: ['Збій', 'Fout'], onbekend: ['Невідомо', 'Onbekend'], nooit: ['Не перевірено', 'Niet gecontroleerd'] };

function Avatar({ k, groot }: { k: { naam: string; foto: string }; groot?: boolean }) {
  const [stuk, setStuk] = useState(false);
  const letters = (k.naam || '?').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  return k.foto && !stuk
    ? <img className={`adg-av${groot ? ' adg-av-groot' : ''}`} src={k.foto} alt='' loading='lazy' decoding='async' referrerPolicy='no-referrer' onError={() => setStuk(true)} />
    : <span className={`adg-av adg-av-letters${groot ? ' adg-av-groot' : ''}`} aria-hidden='true'>{letters}</span>;
}

export default function GebruikerTab({ lang, ctx, openCategorie }: { lang: Lang; ctx: Record<string, unknown>; openCategorie: (dienst: string) => void }) {
  const [q, setQ] = useState('');
  const [lijst, setLijst] = useState<Kort[]>([]);
  const [zoekt, setZoekt] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const teller = useRef(0);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setLijst([]); setZoekt(false); return; }
    const mijn = ++teller.current;
    setZoekt(true);
    const h = window.setTimeout(async () => {
      try {
        const r = await api.post('/api/owner/admin/diagnostiek/gebruiker', { ...ctx, zoek: t });
        if (mijn === teller.current) { setLijst(((r.data as { gebruikers?: Kort[] }).gebruikers ?? []).slice(0, 8)); setFout(''); }
      } catch (e) { if (mijn === teller.current) setFout(foutTekst(lang, e)); }
      if (mijn === teller.current) setZoekt(false);
    }, 250);
    return () => window.clearTimeout(h);
  }, [q, ctx, lang]);

  const kies = useCallback(async (k: Kort) => {
    setBezig(true); setFout('');
    try { const r = await api.post('/api/owner/admin/diagnostiek/gebruiker', { ...ctx, gebruikerId: k.id }); setDetail(r.data as Detail); }
    catch (e) { setFout(foutTekst(lang, e)); }
    setBezig(false);
  }, [ctx, lang]);

  return (
    <section className='adg-gebruiker' data-adg-gebruiker>
      <header className='adg-gb-kop'>
        <UserRound />
        <div>
          <h3>{tr(lang, 'Скарга користувача — перевірити від свого імені', 'Klacht van een gebruiker — zelf nagaan')}</h3>
          <p>{tr(lang, 'Знайдіть користувача й подивіться, що він бачить на сайті: сесії, невдалі дії, підключення та стан сервісів, якими він користувався. Лише метадані — без листів, файлів, IP і токенів. Кожен перегляд записується в журнал.', 'Zoek de gebruiker en zie wat die op de site ervaart: sessies, mislukte acties, koppelingen en de toestand van de diensten die hij gebruikte. Alleen metadata — geen mails, bestanden, IP of tokens. Elke inzage komt in het logboek.')}</p>
        </div>
      </header>

      <label className='adg-zoek'>
        <Search aria-hidden='true' />
        <input type='search' value={q} onChange={(e) => setQ(e.target.value)} data-adg-gebruiker-zoek placeholder={tr(lang, 'Ім’я або e-mail (мінімум 2 символи)…', 'Naam of e-mail (minstens 2 tekens)…')} aria-label={tr(lang, 'Пошук користувача', 'Gebruiker zoeken')} />
        {zoekt ? <Loader2 className='adg-spin' /> : q && <button type='button' aria-label={tr(lang, 'Очистити пошук', 'Zoekopdracht wissen')} onClick={() => { setQ(''); setLijst([]); }}><X /></button>}
      </label>
      {fout && <p className='adg-melding' data-soort='fout' role='alert'>{fout}</p>}

      {lijst.length > 0 && (
        <ul className='adg-gb-lijst' aria-label={tr(lang, 'Знайдені користувачі', 'Gevonden gebruikers')}>
          {lijst.map((k) => (
            <li key={k.id}><button type='button' data-adg-gebruiker-kies={k.id} onClick={() => void kies(k)}><Avatar k={k} /><span><strong>{k.naam}</strong><small>{k.email}</small></span></button></li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !zoekt && !lijst.length && !fout && <p className='adg-leeg'>{tr(lang, 'Користувача не знайдено.', 'Geen gebruiker gevonden.')}</p>}
      {bezig && <p className='adg-laden'><Loader2 className='adg-spin' />{tr(lang, 'Перевіряємо…', 'Bezig met nagaan…')}</p>}

      {detail && !bezig && (
        <div className='adg-gb-detail' data-adg-gebruiker-detail>
          <div className='adg-gb-persoon'>
            <Avatar k={detail.gebruiker} groot />
            <div>
              <strong>{detail.gebruiker.naam}</strong>
              <small>{detail.gebruiker.email}</small>
              <small>{detail.gebruiker.rol ? `${detail.gebruiker.rol} · ` : ''}{detail.gebruiker.status}{detail.gebruiker.aangemaakt ? ` · ${tr(lang, 'з', 'sinds')} ${tijd(lang, detail.gebruiker.aangemaakt)}` : ''}</small>
            </div>
          </div>

          <AccountTabel lang={lang} ctx={ctx} gebruikerId={detail.gebruiker.id} />

          <ul className='adg-gb-bevindingen' aria-label={tr(lang, 'Висновки', 'Bevindingen')}>
            {detail.bevindingen.map((b) => (
              <li key={b.code} data-ernst={b.ernst}>
                {b.ernst === 'fout' ? <XCircle /> : b.ernst === 'let-op' ? <AlertTriangle /> : <Check />}
                <div><span>{tekstUit(lang, b.tekst)}</span>{b.stap && <small><b>{tr(lang, 'Що зробити: ', 'Wat te doen: ')}</b>{tekstUit(lang, b.stap)}</small>}</div>
              </li>
            ))}
          </ul>

          <div className='adg-gb-kpi'>
            <div><b>{detail.sessies.actief}</b><span>{tr(lang, 'активних сесій', 'actieve sessies')}</span><small>{detail.sessies.laatsteActiviteit ? `${tr(lang, 'остання активність', 'laatste activiteit')}: ${leeftijd(detail.sessies.laatsteActiviteit, detail.nu, lang)}` : tr(lang, 'активності немає', 'geen activiteit')}</small></div>
            <div><b>{detail.acties.dag}</b><span>{tr(lang, 'дій за добу', 'acties per dag')}</span><small>{tr(lang, `невдалих: ${detail.acties.dagMislukt} (за тиждень ${detail.acties.weekMislukt})`, `mislukt: ${detail.acties.dagMislukt} (week ${detail.acties.weekMislukt})`)}</small></div>
            <div><b>{detail.koppelingen.oauth.reduce((a, o) => a + o.n, 0)}</b><span>{tr(lang, 'підключень ШІ', 'AI-verbindingen')}</span><small>{detail.koppelingen.oauth.map((o) => o.client).join(', ') || tr(lang, 'немає', 'geen')}</small></div>
            <div><b>{detail.koppelingen.agenten.verbonden}/{detail.koppelingen.agenten.totaal}</b><span>{tr(lang, 'локальних агентів', 'lokale agenten')}</span><small>{tr(lang, `пошта: невдалих ${detail.koppelingen.mailMislukt}, застрягло ${detail.koppelingen.mailVast}`, `mail: mislukt ${detail.koppelingen.mailMislukt}, vast ${detail.koppelingen.mailVast}`)}</small></div>
          </div>

          {detail.sessies.apparaten.length > 0 && <p className='adg-gb-regel'><MonitorSmartphone />{tr(lang, 'Пристрої: ', 'Apparaten: ')}{detail.sessies.apparaten.join(' · ')}</p>}

          {detail.diensten.length > 0 && (
            <div className='adg-gb-blok'>
              <h4><Plug />{tr(lang, 'Сервіси, якими користувач скористався за добу', 'Diensten die de gebruiker in de afgelopen dag gebruikte')}</h4>
              <ul className='adg-gb-diensten'>
                {detail.diensten.map((d) => (
                  <li key={d.dienst} data-stand={d.stand}>
                    <span className='adg-pil' data-stand={d.stand}>{d.stand === 'ok' ? <Check /> : d.stand === 'fout' ? <XCircle /> : d.stand === 'let-op' ? <AlertTriangle /> : <CircleHelp />}{tekstUit(lang, STAND_NAAM[d.stand])}</span>
                    <strong>{tekstUit(lang, d.naam)}</strong>
                    <small>{tr(lang, `${d.acties} дій, невдалих ${d.mislukt}`, `${d.acties} acties, mislukt ${d.mislukt}`)}</small>
                    <button type='button' className='adg-knop adg-knop-klein adg-knop-stil' onClick={() => openCategorie(d.dienst)}>{tr(lang, 'Перевірити сервіс', 'Dienst nagaan')}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail.acties.recent.length > 0 && (
            <div className='adg-gb-blok'>
              <h4><Clock />{tr(lang, 'Останні дії (лише назви)', 'Laatste acties (alleen namen)')}</h4>
              <ol className='adg-gb-acties'>
                {detail.acties.recent.map((a, i) => (
                  <li key={i} data-mislukt={a.mislukt ? '1' : '0'}>
                    {a.mislukt ? <XCircle /> : <Check />}
                    <span>{tekstUit(lang, a.label)}<small>{tekstUit(lang, a.sectie)}{a.dienst ? ` · ${a.dienst}` : ''}</small></span>
                    <time>{tijd(lang, a.t)}</time>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
