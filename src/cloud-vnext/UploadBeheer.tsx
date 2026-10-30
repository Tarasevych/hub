// Het overdrachtenpaneel van «Mijn bestanden» (cloud vNext). De ECHTE arbeid gebeurt in overdracht-beheer.ts — een
// module-singleton buiten React, zodat navigeren binnen de clouddienst niets afbreekt. Dit paneel kijkt mee via
// useSyncExternalStore en biedt: voortgang in % en bytes, snelheid, het aantal parallelle stukken, pauze/verder/stop,
// de eerlijke toestand «wacht op netwerk — gaat vanzelf verder», en na een herlaad de rij «hervatbaar»: dezelfde
// bestandskeuze en de upload gaat verder vanaf precies de ontbrekende stukken ('zoek' + 'status').
// Daaronder: de achtergrond-TAKEN van de server (overdrachten tussen diensten) met voortgang, annuleren/opnieuw en
// bij een fout de eerlijke reden mét suggestie (shared/cloud-overdracht-model.ts).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeftRight, CircleCheck, CircleX, LoaderCircle, Pause, Play, Upload, WifiOff, X } from 'lucide-react';
import { PARALLEL_STUKKEN, type CloudTaak } from '../../shared/cloud-overdracht-model';
import { cloudTekst } from '../../shared/cloud-vnext-model';
import { cloudClient } from './cloud-client';
import { overdrachten, type OverdrachtRij } from './overdracht-beheer';
import { bytesTekst, foutTekst, tr, type Lang } from './tekst';

const TAKEN_POLL_MS = 3000;
const procent = (r: OverdrachtRij) => (r.bytes > 0 ? Math.min(100, Math.round((r.klaarBytes / r.bytes) * 100)) : 0);

export function useOverdrachten(): OverdrachtRij[] {
  const m = overdrachten();
  return useSyncExternalStore(m.abonneer, m.stand, m.stand);
}

function TaakRij({ lang, t, onBijgewerkt }: { lang: Lang; t: CloudTaak; onBijgewerkt: () => void }) {
  const [besig, setBesig] = useState(false);
  const doe = async (actie: 'annuleer' | 'opnieuw') => {
    setBesig(true);
    try { await cloudClient.taken({ actie, id: t.id }); onBijgewerkt(); } catch { /* de eerstvolgende peiling toont de echte stand */ }
    finally { setBesig(false); }
  };
  const richting = (p: CloudTaak['bron']) => (p.dienst === 'eigen' ? tr(lang, 'Моя хмара', 'Mijn cloud') : 'Google Drive');
  const pct = t.totaalBytes > 0 ? Math.min(100, Math.round((t.voortgangBytes / t.totaalBytes) * 100)) : 0;
  return (
    <li className={`cvn-ov-taak is-${t.stand}`} data-cvn-ov-taak={t.stand}>
      <ArrowLeftRight aria-hidden='true' />
      <span className='cvn-upload-naam'>{t.naam}</span>
      <span className='cvn-ov-route'>{richting(t.bron)} → {richting(t.doel)} · {t.soort === 'verplaats' ? tr(lang, 'перемістити', 'verplaatsen') : tr(lang, 'копіювати', 'kopiëren')}</span>
      <span className='cvn-upload-info'>
        {t.stand === 'klaar' ? tr(lang, 'Готово', 'Klaar')
          : t.stand === 'geannuleerd' ? tr(lang, 'Скасовано', 'Geannuleerd')
          : t.stand === 'fout' ? tr(lang, 'Не вдалося', 'Mislukt')
          : t.stand === 'wacht' ? tr(lang, 'У черзі (фоном)', 'In de rij (achtergrond)')
          : `${pct}%`}
      </span>
      {t.stand === 'fout' && t.fout ? (
        <span className='cvn-ov-fout' data-cvn-ov-fout={t.fout.code}>
          {cloudTekst(t.fout.uitleg, lang)}{t.fout.suggestie ? ` ${cloudTekst(t.fout.suggestie, lang)}` : ''}
        </span>
      ) : null}
      {t.stand === 'bezig' || t.stand === 'wacht' ? (
        <>
          <span className='cvn-voortgang' role='progressbar' aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t.naam}><i style={{ width: `${pct}%` }} /></span>
          <button type='button' className='cvn-icoonknop is-gevaar' disabled={besig} onClick={() => void doe('annuleer')} aria-label={tr(lang, `Скасувати задачу ${t.naam}`, `Taak ${t.naam} annuleren`)}><X aria-hidden='true' /></button>
        </>
      ) : t.stand === 'fout' ? (
        <button type='button' className='cvn-knop is-klein' disabled={besig} onClick={() => void doe('opnieuw')}>{tr(lang, 'Повторити', 'Opnieuw')}</button>
      ) : null}
    </li>
  );
}

/** De zichtbare overdrachten: lokale uploads/downloads (de singleton) + de achtergrondtaken van de server. */
export default function UploadBeheer({ lang }: { lang: Lang }) {
  const rijen = useOverdrachten();
  const m = overdrachten();
  const [taken, setTaken] = useState<CloudTaak[]>([]);
  const kiesHervat = useRef<HTMLInputElement | null>(null);
  const hervatVoor = useRef('');
  const [hervatMis, setHervatMis] = useState('');

  const laadTaken = useCallback(async () => {
    try { const r = await cloudClient.taken({ actie: 'lijst' }); setTaken(r.taken || []); }
    catch { /* taken zijn optioneel tot de serverkant meedoet; niets verzinnen */ }
  }, []);
  useEffect(() => { void laadTaken(); }, [laadTaken]);
  const actieveTaak = taken.some((t) => t.stand === 'wacht' || t.stand === 'bezig');
  useEffect(() => {
    if (!actieveTaak) return;
    const t = window.setInterval(() => void laadTaken(), TAKEN_POLL_MS);
    return () => window.clearInterval(t);
  }, [actieveTaak, laadTaken]);

  if (!rijen.length && !taken.length) return null;
  const opTeRuimen = rijen.some((r) => ['klaar', 'fout', 'afgebroken'].includes(r.staat));
  const netwerkWacht = rijen.some((r) => r.staat === 'wacht-netwerk');
  return (
    <section className='cvn-blok cvn-uploads' data-cvn-upload='wachtrij' aria-label={tr(lang, 'Передачі', 'Overdrachten')}>
      <h3><Upload aria-hidden='true' />{tr(lang, 'Передачі', 'Overdrachten')}
        <span className='cvn-hint'>{tr(lang, `до ${PARALLEL_STUKKEN} потоків · працює у фоні`, `tot ${PARALLEL_STUKKEN} stromen · loopt op de achtergrond`)}</span>
        {opTeRuimen ? <button type='button' className='cvn-knop is-klein is-stil' onClick={() => m.ruimOp()}>{tr(lang, 'Прибрати завершені', 'Afgeronde opruimen')}</button> : null}
      </h3>
      {netwerkWacht ? <p className='cvn-melding is-info' role='status'><WifiOff aria-hidden='true' />{tr(lang, 'Обрив мережі — передача продовжиться сама, щойно з’явиться зв’язок. Нічого не втрачено.', 'Netwerk weggevallen — de overdracht gaat vanzelf verder zodra er weer verbinding is. Er is niets verloren.')}</p> : null}
      {rijen.length ? (
        <ul className='cvn-upload-rijen'>
          {rijen.map((r) => (
            <li key={r.sleutel} className={`cvn-upload-rij is-${r.staat}`} data-cvn-ov-rij={r.staat}>
              {r.staat === 'klaar' ? <CircleCheck aria-hidden='true' className='cvn-upload-ok' />
                : r.staat === 'fout' || r.staat === 'afgebroken' ? <CircleX aria-hidden='true' className='cvn-upload-mis' />
                : r.staat === 'wacht-netwerk' ? <WifiOff aria-hidden='true' />
                : r.staat === 'gepauzeerd' || r.staat === 'hervatbaar' ? <Pause aria-hidden='true' />
                : <LoaderCircle aria-hidden='true' className='cvn-draai' />}
              <span className='cvn-upload-naam'>{r.naam}{r.soort === 'download' ? ` · ${tr(lang, 'скачування', 'download')}` : ''}</span>
              <span className='cvn-upload-info'>
                {r.staat === 'fout' ? foutTekst(lang, r.foutCode)
                  : r.staat === 'afgebroken' ? tr(lang, 'Скасовано', 'Afgebroken')
                  : r.staat === 'klaar' ? bytesTekst(lang, r.bytes)
                  : r.staat === 'wacht' ? tr(lang, 'У черзі…', 'In de rij…')
                  : r.staat === 'gepauzeerd' ? tr(lang, 'На паузі', 'Gepauzeerd')
                  : r.staat === 'wacht-netwerk' ? tr(lang, 'Чекаємо мережу…', 'Wachten op netwerk…')
                  : r.staat === 'hervatbaar' ? tr(lang, 'Можна продовжити — оберіть той самий файл', 'Kan verder — kies hetzelfde bestand')
                  : `${procent(r)}% · ${bytesTekst(lang, r.klaarBytes)} / ${bytesTekst(lang, r.bytes)}${r.snelheidBps > 0 ? ` · ${bytesTekst(lang, r.snelheidBps)}/s` : ''}${r.parallel > 1 ? ` · ×${r.parallel}` : ''}`}
              </span>
              {r.staat === 'hervatbaar' ? (
                <>
                  <button type='button' className='cvn-knop is-klein is-hoofd' data-cvn-ov-hervat={r.sleutel}
                    onClick={() => { hervatVoor.current = r.sleutel; kiesHervat.current?.click(); }}>{tr(lang, 'Продовжити…', 'Verdergaan…')}</button>
                  <button type='button' className='cvn-icoonknop' onClick={() => m.vergeetHervatbaar(r.sleutel)} aria-label={tr(lang, 'Прибрати', 'Weghalen')}><X aria-hidden='true' /></button>
                </>
              ) : null}
              {r.staat === 'bezig' || r.staat === 'wacht' || r.staat === 'gepauzeerd' || r.staat === 'wacht-netwerk' ? (
                <>
                  <span className='cvn-voortgang' role='progressbar' aria-valuemin={0} aria-valuemax={100} aria-valuenow={procent(r)} aria-label={r.naam}><i style={{ width: `${procent(r)}%` }} /></span>
                  {r.soort === 'upload' && r.staat !== 'gepauzeerd' && r.staat !== 'wacht-netwerk'
                    ? <button type='button' className='cvn-icoonknop' data-cvn-ov-pauze={r.sleutel} onClick={() => m.pauzeer(r.sleutel)} aria-label={tr(lang, `Пауза ${r.naam}`, `${r.naam} pauzeren`)}><Pause aria-hidden='true' /></button>
                    : null}
                  {r.staat === 'gepauzeerd' || r.staat === 'wacht-netwerk'
                    ? <button type='button' className='cvn-icoonknop' data-cvn-ov-verder={r.sleutel} onClick={() => m.verder(r.sleutel)} aria-label={tr(lang, `Продовжити ${r.naam}`, `${r.naam} hervatten`)}><Play aria-hidden='true' /></button>
                    : null}
                  <button type='button' className='cvn-icoonknop is-gevaar' data-cvn-ov-stop={r.sleutel} onClick={() => m.stop(r.sleutel)} aria-label={tr(lang, `Скасувати ${r.naam}`, `${r.naam} afbreken`)}><X aria-hidden='true' /></button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {/* verborgen bestandskeuze voor het hervatten na een herlaad — zelfde bestand, alleen de ontbrekende stukken */}
      <input ref={kiesHervat} type='file' className='cvn-verborgen' tabIndex={-1} aria-hidden='true'
        onChange={(e) => {
          const f = e.target.files?.[0]; const sleutel = hervatVoor.current; hervatVoor.current = ''; e.target.value = '';
          if (!f || !sleutel) return;
          // eerlijk: alleen exact hetzelfde bestand (naam + grootte) kan verder; anders gewoon opnieuw uploaden
          setHervatMis(m.hervatMet(sleutel, f) ? '' : tr(lang, 'Це інший файл (назва або розмір не збігаються) — продовжити можна лише тим самим файлом. Інший файл завантажте звичайним способом.', 'Dit is een ander bestand (naam of grootte verschilt) — verdergaan kan alleen met exact hetzelfde bestand. Upload een ander bestand gewoon opnieuw.'));
        }} />
      {hervatMis ? <p className='cvn-melding is-fout' role='alert'>{hervatMis}</p> : null}
      {taken.length ? (
        <>
          <h4 className='cvn-ov-taken-kop'>{tr(lang, 'Фонові задачі (між сервісами)', 'Achtergrondtaken (tussen diensten)')}</h4>
          <ul className='cvn-upload-rijen'>{taken.map((t) => <TaakRij key={t.id} lang={lang} t={t} onBijgewerkt={() => void laadTaken()} />)}</ul>
        </>
      ) : null}
    </section>
  );
}
