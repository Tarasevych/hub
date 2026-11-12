// UI-015 — de EERLIJKE catalogus van toekomstige aanbieders (dossier §2.2 + gebruikerseis §4): Apple, Telegram, Discord,
// WhatsApp, Microsoft en SMS staan hier met hun echte stand uit de levende statusroute. Een koppelknop bestaat ALLEEN
// wanneer de server «klaarVoorKoppeling: true» zegt (alle sleutels aanwezig én de zelftest geslaagd) — tot die tijd toont
// de kaart de sleutelchecklist (alleen NAMEN, nooit waarden) en de eerlijke uitleg of omweg. Monogrammen, geen vreemde logo's.
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../platform/client';
import { AANBIEDER_STAND_LABEL, AANMELD_AANBIEDERS, aanmeldTekst } from '../../../shared/aanmeld-vnext-model';
import type { Lang } from '../../toegangslaag-teksten';

const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);

type Levend = { id: string; stand: string; sleutels: Array<{ naam: string; aanwezig: boolean }>; zelftest: 'ok' | 'niet-uitgevoerd' | 'fout'; klaarVoorKoppeling: boolean; gekoppeld?: { label: string; op: string } | null };

export default function AanbiederCatalogus({ lang, context }: { lang: Lang; context: Record<string, unknown> }) {
  const [levend, setLevend] = useState<Levend[] | null>(null);
  const [fout, setFout] = useState(false);
  const [melding, setMelding] = useState('');
  const laad = useCallback(async () => {
    try { const r = await api.post('/api/owner/aanmeld/vnext/aanbieders', context); const lijst = (r.data as { aanbieders?: Levend[] })?.aanbieders; setLevend(Array.isArray(lijst) ? lijst : []); setFout(false); }
    catch { setLevend(null); setFout(true); }
  }, [context]);
  useEffect(() => { void laad(); }, [laad]);
  // De koppelknop doet het ECHTE werk: start geeft de authorize-URL van de aanbieder terug en de browser navigeert erheen.
  // Telegram koppelt via het officiële Login-widget op een eigen pagina — de inbedding daarvan is de volgende stap en dat
  // zegt de kaart eerlijk, in plaats van een knop die stiekem niets doet.
  const koppel = useCallback(async (id: string) => {
    setMelding('');
    try {
      const r = await api.post('/api/owner/aanmeld/vnext/start', { ...context, id });
      const url = (r.data as { url?: string })?.url;
      if (url) { window.location.assign(url); return; }
      setMelding(tr(lang, 'Цей спосіб підключається віджетом на окремій сторінці — вбудову заплановано наступним кроком.', 'Deze methode koppelt via een widget op een eigen pagina — de inbedding is de geplande volgende stap.'));
    } catch { setMelding(tr(lang, 'Не вдалося почати підключення. Спробуйте ще раз.', 'Het koppelen kon niet starten. Probeer het opnieuw.')); }
  }, [context, lang]);

  return (
    <section className='amv-sectie' data-amv-catalogus='' aria-labelledby='amv-catalogus-kop'>
      <header className='amv-sectie-kop'>
        <h3 id='amv-catalogus-kop'>{tr(lang, 'Інші способи — чесно', 'Andere methoden — eerlijk')}</h3>
        <p className='amv-hint'>{tr(lang, 'Що в коді вже є і чого бракує. Жоден спосіб не з’явиться серед доступних, доки сервер не підтвердить ключі та самотест.', 'Wat al in de code staat en wat ontbreekt. Geen methode wordt beschikbaar vóór de server de sleutels en de zelftest bevestigt.')}</p>
      </header>
      {melding ? <p className='amv-melding is-info' role='status' data-amv-koppel-melding=''>{melding}</p> : null}
      {fout ? (
        <p className='amv-melding is-fout' role='alert'>
          {tr(lang, 'Стан не вдалося перевірити.', 'De status kon niet worden gecontroleerd.')}
          <button type='button' className='amv-knop is-klein' data-amv-catalogus-opnieuw='' onClick={() => void laad()}><RefreshCw aria-hidden='true' />{tr(lang, 'Повторити', 'Opnieuw')}</button>
        </p>
      ) : null}
      <div className='amv-tegels' role='list'>
        {AANMELD_AANBIEDERS.map((a) => {
          const live = levend?.find((l) => l.id === a.id) || null;
          const klaar = Boolean(live?.klaarVoorKoppeling);
          return (
            <article key={a.id} className={`amv-tegel is-${a.stand}`} role='listitem' data-amv-aanbieder={a.id}>
              <span className='amv-tegel-kop'>
                <span className='amv-brand is-neutraal' aria-hidden='true'>{a.monogram}</span>
                <strong>{a.naam}</strong>
                <span className='amv-staat is-catalogus'>{aanmeldTekst(AANBIEDER_STAND_LABEL[a.stand], lang)}</span>
              </span>
              <small>{aanmeldTekst(a.uitleg, lang)}</small>
              {a.omweg ? <small className='amv-hint'>{aanmeldTekst(a.omweg, lang)}</small> : null}
              {a.vereist?.length ? (
                <ul className='amv-sleutels' aria-label={tr(lang, 'Потрібні ключі власника', 'Vereiste sleutels van de eigenaar')}>
                  {a.vereist.map((naam) => {
                    const aanwezig = Boolean(Array.isArray(live?.sleutels) && live.sleutels.find((s) => s.naam === naam)?.aanwezig);
                    return <li key={naam} data-amv-sleutel={naam} data-amv-aanwezig={aanwezig ? 'ja' : 'nee'}><i aria-hidden='true'>{aanwezig ? '✓' : '✗'}</i><code>{naam}</code></li>;
                  })}
                </ul>
              ) : null}
              {live && a.vereist?.length ? <small className='amv-hint'>{tr(lang, 'Самотест:', 'Zelftest:')} {live.zelftest === 'ok' ? tr(lang, 'пройдено', 'geslaagd') : live.zelftest === 'fout' ? tr(lang, 'не пройдено', 'mislukt') : tr(lang, 'ще не виконувався', 'nog niet uitgevoerd')}</small> : null}
              {klaar ? <button type='button' className='amv-knop is-hoofd is-klein' data-amv-koppelknop={a.id} onClick={() => void koppel(a.id)}>{tr(lang, 'Підключити', 'Koppelen')}</button> : null}
              {live?.gekoppeld ? <small className='amv-hint' data-amv-gekoppeld={a.id}>{tr(lang, 'Прив’язано:', 'Gekoppeld:')} <code>{live.gekoppeld.label}</code></small> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
