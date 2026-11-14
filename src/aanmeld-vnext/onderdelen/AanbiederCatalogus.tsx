// UI-015 — de EERLIJKE catalogus van toekomstige aanbieders (dossier §2.2 + gebruikerseis §4): Apple, Telegram, Discord,
// WhatsApp, Microsoft en SMS staan hier met hun echte stand uit de levende statusroute. Een koppelknop bestaat ALLEEN
// wanneer de server «klaarVoorKoppeling: true» zegt (alle sleutels aanwezig én de zelftest geslaagd) — tot die tijd toont
// de kaart de sleutelchecklist (alleen NAMEN, nooit waarden) en de eerlijke uitleg of omweg. Monogrammen, geen vreemde logo's.
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../platform/client';
import { pauzeBericht, useTelegramPauze } from '../../telegram-aanmelden/api';
import { AANBIEDER_STAND_LABEL, AANMELD_AANBIEDERS, aanmeldTekst } from '../../../shared/aanmeld-vnext-model';
import type { Lang } from '../../toegangslaag-teksten';

const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);

type Levend = { id: string; stand: string; sleutels: Array<{ naam: string; aanwezig: boolean }>; zelftest: 'ok' | 'niet-uitgevoerd' | 'fout'; klaarVoorKoppeling: boolean; gekoppeld?: { label: string; op: string } | null; sleutelsCompleet?: boolean };

/** `zonder` — aanbieders die elders op dezelfde pagina al met hun LEVENDE stand staan (oude paneel: Telegram), zodat er geen tweede, tegenstrijdige stand komt. */
/** `beheer` — IDENTITEIT-015 (aanmelden): власник/адміністратор бачить назви ключів і самоперевірку; схвалений не-власник — лише «готово / ще не налаштовано власником» і кнопку прив'язки (сервер тоді назв ключів і не надсилає). */
export default function AanbiederCatalogus({ lang, context, zonder = [], beheer = true }: { lang: Lang; context: Record<string, unknown>; zonder?: readonly string[]; beheer?: boolean }) {
  const [levend, setLevend] = useState<Levend[] | null>(null);
  const [fout, setFout] = useState(false);
  const [melding, setMelding] = useState('');
  const [pauzeId, setPauzeId] = useState('');
  const pauze = useTelegramPauze();
  const laad = useCallback(async () => {
    try { const r = await api.post('/api/owner/aanmeld/vnext/aanbieders', context); const lijst = (r.data as { aanbieders?: Levend[] })?.aanbieders; setLevend(Array.isArray(lijst) ? lijst : []); setFout(false); }
    catch { setLevend(null); setFout(true); }
  }, [context]);
  useEffect(() => { void laad(); }, [laad]);
  useEffect(() => { if (!pauze.actief && !pauze.zojuistVrij) setPauzeId(''); }, [pauze.actief, pauze.zojuistVrij]);

  // De koppelknop doet het ECHTE werk: voor Telegram schuiven we naar de volledige sectie [data-telegram-sectie] onderaan
  // de pagina; andere aanbieders krijgen hun authorize-adres van de server.
  const koppel = useCallback(async (id: string) => {
    if (pauze.actief) return;
    setMelding('');
    if (id === 'telegram') {
      const sectie = document.querySelector<HTMLElement>('[data-telegram-sectie]');
      if (sectie) {
        sectie.scrollIntoView({ behavior: 'smooth', block: 'start' });
        sectie.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
        return;
      }
    }
    try {
      const r = await api.post('/api/owner/aanmeld/vnext/start', { ...context, id });
      const url = (r.data as { url?: string })?.url;
      if (url) { pauze.wis(); window.location.assign(url); return; }
      setMelding(id === 'telegram'
        ? tr(lang, 'Скористайтеся розділом «Telegram» нижче на цій сторінці.', 'Gebruik de sectie «Telegram» hieronder op deze pagina.')
        : tr(lang, 'Цей спосіб підключається на окремій сторінці — інтеграцію заплановано наступним кроком.', 'Deze methode koppelt op een eigen pagina — de inbedding is de geplande volgende stap.'));
    } catch (caught) {
      const p = pauze.vangPauze(caught);
      if (p.isPauze) { setPauzeId(id); return; }
      setMelding(tr(lang, 'Не вдалося почати підключення. Спробуйте ще раз.', 'Het koppelen kon niet starten. Probeer het opnieuw.'));
    }
  }, [context, lang, pauze]);

  const pauzeTekst = pauze.actief || pauze.zojuistVrij ? pauzeBericht(Math.max(1, pauze.resterend), lang, 'koppelen') : null;
  const zichtbareMelding = pauze.actief && pauzeTekst
    ? pauzeTekst.melding
    : pauze.zojuistVrij && pauzeTekst
      ? pauzeTekst.vrij
      : melding;

  return (
    <section className='amv-sectie' data-amv-catalogus='' aria-labelledby='amv-catalogus-kop'>
      <header className='amv-sectie-kop'>
        <h3 id='amv-catalogus-kop'>{tr(lang, 'Інші способи — чесно', 'Andere methoden — eerlijk')}</h3>
        <p className='amv-hint'>{tr(lang, 'Що в коді вже є і чого бракує. Жоден спосіб не з’явиться серед доступних, доки сервер не підтвердить ключі та самотест.', 'Wat al in de code staat en wat ontbreekt. Geen methode wordt beschikbaar vóór de server de sleutels en de zelftest bevestigt.')}</p>
      </header>
      {zichtbareMelding ? <p className='amv-melding is-info' role='status' aria-live='polite' data-amv-koppel-melding=''>{zichtbareMelding}</p> : null}
      {fout ? (
        <p className='amv-melding is-fout' role='alert'>
          {tr(lang, 'Стан не вдалося перевірити.', 'De status kon niet worden gecontroleerd.')}
          <button type='button' className='amv-knop is-klein' data-amv-catalogus-opnieuw='' onClick={() => void laad()}><RefreshCw aria-hidden='true' />{tr(lang, 'Повторити', 'Opnieuw')}</button>
        </p>
      ) : null}
      <div className='amv-tegels' role='list'>
        {AANMELD_AANBIEDERS.filter((a) => !zonder.includes(a.id)).map((a) => {
          const live = levend?.find((l) => l.id === a.id) || null;
          const klaar = Boolean(live?.klaarVoorKoppeling);
          const opPauze = pauze.actief && (!pauzeId || pauzeId === a.id);
          return (
            <article key={a.id} className={`amv-tegel is-${a.stand}`} role='listitem' data-amv-aanbieder={a.id}>
              <span className='amv-tegel-kop'>
                <span className='amv-brand is-neutraal' aria-hidden='true'>{a.monogram}</span>
                <strong>{a.naam}</strong>
                <span className='amv-staat is-catalogus'>{aanmeldTekst(AANBIEDER_STAND_LABEL[a.stand], lang)}</span>
              </span>
              <small>{aanmeldTekst(a.uitleg, lang)}</small>
              {a.omweg ? <small className='amv-hint'>{aanmeldTekst(a.omweg, lang)}</small> : null}
              {beheer && a.vereist?.length ? (
                <ul className='amv-sleutels' aria-label={tr(lang, 'Потрібні ключі власника', 'Vereiste sleutels van de eigenaar')}>
                  {a.vereist.map((naam) => {
                    const aanwezig = Boolean(Array.isArray(live?.sleutels) && live.sleutels.find((s) => s.naam === naam)?.aanwezig);
                    return <li key={naam} data-amv-sleutel={naam} data-amv-aanwezig={aanwezig ? 'ja' : 'nee'}><i aria-hidden='true'>{aanwezig ? '✓' : '✗'}</i><code>{naam}</code></li>;
                  })}
                </ul>
              ) : null}
              {!beheer && live && a.vereist?.length && !klaar ? <small className='amv-hint' data-amv-niet-ingesteld={a.id}>{tr(lang, 'Ще не налаштовано власником сайту — прив’язати поки не можна.', 'Nog niet ingesteld door de site-eigenaar — koppelen kan nog niet.')}</small> : null}
              {beheer && live && a.vereist?.length ? <small className='amv-hint'>{tr(lang, 'Самотест:', 'Zelftest:')} {live.zelftest === 'ok' ? tr(lang, 'пройдено', 'geslaagd') : live.zelftest === 'fout' ? tr(lang, 'не пройдено', 'mislukt') : tr(lang, 'ще не виконувався', 'nog niet uitgevoerd')}</small> : null}
              {klaar ? <button type='button' className='amv-knop is-hoofd is-klein' data-amv-koppelknop={a.id} disabled={pauze.actief} onClick={() => void koppel(a.id)}>{opPauze && pauzeTekst ? pauzeTekst.knop : tr(lang, 'Підключити', 'Koppelen')}</button> : null}
              {live?.gekoppeld ? <small className='amv-hint' data-amv-gekoppeld={a.id}>{tr(lang, 'Прив’язано:', 'Gekoppeld:')} <code>{live.gekoppeld.label}</code></small> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
