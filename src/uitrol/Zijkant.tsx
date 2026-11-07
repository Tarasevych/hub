// Rechterkolom: «Стан системи» (live release, keten van goedkeuring, schijf), «Швидкі дії» en «Хто готує оновлення» (kort).
import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Fingerprint, ScrollText, Settings2, Stethoscope, Upload, XCircle } from 'lucide-react';
import { api } from '../platform/client';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import { Avatar } from './Voorbereiders';
import Persoon from './Persoon';
import CommitTekst from './CommitTekst';
import ToegangBlok from './ToegangBlok';
import { useUitrolV2 } from './uitrol-vlag';
import UitgaveBeschrijving, { Deelnemers, mensWeergaveNaam } from './UitgaveBeschrijving';
import { datum, duur, mb, tr, type DiagnoseAntwoord, type Lang, type Overzicht, type Versie } from './types';

type Props = { lang: Lang; context: Record<string, unknown>; data: Overzicht; kanPasskey: boolean; naarUpload: () => void; naarLog: () => void; naarDiagnose: () => void; naarInstellen: () => void };

const Rij = ({ ok, children }: { ok: boolean | null; children: React.ReactNode }) => <li data-ok={ok === null ? 'n' : ok}>{ok === null ? <i aria-hidden='true' /> : ok ? <CheckCircle2 aria-hidden='true' /> : <XCircle aria-hidden='true' />}<span>{children}</span></li>;

export default function Zijkant({ lang, context, data, kanPasskey, naarUpload, naarLog, naarDiagnose, naarInstellen }: Props) {
  const [versie, setVersie] = useState<Versie | null>(null);
  const v2 = useUitrolV2() === true;
  const [diag, setDiag] = useState<DiagnoseAntwoord | null>(null);
  useEffect(() => { void api.get('/api/version').then((r) => setVersie(r.data as Versie)).catch(() => undefined); }, []);
  useEffect(() => {
    let weg = false;
    const haal = () => { if (document.hidden) return; void api.post('/api/owner/uitrol/diagnose', context).then((r) => { if (!weg) setDiag(r.data as DiagnoseAntwoord); }).catch(() => undefined); };
    haal(); const t = window.setInterval(haal, 20000); return () => { weg = true; window.clearInterval(t); };
  }, [context]);
  const root = diag?.root;
  const eenheid = (n: string) => root?.eenheden[n];
  const pathOk = eenheid('mijn-ruimte-goedkeuring.path')?.actief === 'active';
  const vers = root ? root.leeftijdSec < 180 : null;
  const vrij = root ? Math.min(...Object.values(root.schijf).map((s) => s.vrijMB)) : null;
  const actieveGrants = data.voorbereiders.filter((g) => g.status === 'actief');
  return <aside className='ut-zijkant' aria-label={tr(lang, 'Стан системи та швидкі дії', 'Systeemstatus en snelle acties')}>
    <section className='ut-kaart'>
      <h2>{tr(lang, 'Стан системи', 'Systeemstatus')}</h2>
      <dl className='ut-dl'>
        {/* Eén bron van waarheid (0062): de versie komt uit de samengevoegde stand (hoofdbron: runs); /api/version is alleen nog de achtervang. */}
        <dt>{tr(lang, 'Працює версія', 'Draaiende versie')}</dt><dd><b className='ut-mono'>{data.stand?.versie || versie?.versie || '—'}</b>{data.stand?.release && data.stand.release !== data.stand.versie ? <small className='ut-hint'> · {tr(lang, 'тека', 'map')} {data.stand.release}</small> : null}</dd>
        {(data.stand?.versie || versie?.versie) && <><dt>{tr(lang, 'Коміт', 'Commit')}</dt><dd><CommitTekst lang={lang} commit={data.stand?.commit || versie?.commit} /></dd></>}
        {versie?.auteur && <><dt>{tr(lang, 'Автор', 'Auteur')}</dt><dd>{mensWeergaveNaam(versie.auteur, data.ik)}{versie.agent ? ` · ${versie.agent}` : ''}</dd></>}
        {(data.stand?.tijd || data.rootStatus?.tijd) && <><dt>{tr(lang, 'Останнє встановлення', 'Laatste installatie')}</dt><dd>{datum(lang, data.stand?.tijd || data.rootStatus?.tijd)}</dd></>}
      </dl>
      {data.stand && data.stand.afwijkingen.length > 0 && <button type='button' className='ut-stand-afw' onClick={naarDiagnose}>
        <XCircle aria-hidden='true' />{tr(lang, `Джерела статусу розходяться (${data.stand.afwijkingen.length}) — відкрити «Діагностика»`, `Statusbronnen lopen uiteen (${data.stand.afwijkingen.length}) — open «Діагностика»`)}</button>}
      {(versie?.samenvatting || versie?.manifest) && <details><summary>{tr(lang, 'Про цей випуск', 'Over deze release')}</summary><UitgaveBeschrijving lang={lang} manifest={versie.manifest} samenvatting={versie.samenvatting} kort />{versie.manifest && <Deelnemers lang={lang} m={versie.manifest} account={data.ik} />}</details>}
      <ul className='ut-checks'>
        <Rij ok={data.schakelaar}>{data.schakelaar ? tr(lang, 'Схвалення passkey увімкнено', 'Goedkeuren met passkey staat aan') : tr(lang, 'Схвалення passkey вимкнено на сервері', 'Goedkeuren met passkey staat uit')}</Rij>
        <Rij ok={data.passkeys.length > 0}>{tr(lang, `Passkey, що схвалюють: ${data.passkeys.length}`, `Passkeys die goedkeuren: ${data.passkeys.length}`)}{data.wachtend.length ? tr(lang, ` (+${data.wachtend.length} чекає)`, ` (+${data.wachtend.length} wacht)`) : ''}</Rij>
        {!kanPasskey && <Rij ok={false}>{tr(lang, 'Цей браузер без passkey', 'Deze browser zonder passkey')}</Rij>}
        <Rij ok={root ? pathOk : null}>{root ? (pathOk ? tr(lang, 'Спостерігач inbox активний', 'Inbox-bewaker actief') : tr(lang, 'Спостерігач inbox НЕ активний', 'Inbox-bewaker NIET actief')) : tr(lang, 'Діагностика root: ще немає даних', 'Root-diagnose: nog geen gegevens')}</Rij>
        <Rij ok={vers}>{root ? tr(lang, `Дані root свіжі: ${duur(root.leeftijdSec * 1000)} тому`, `Root-gegevens vers: ${duur(root.leeftijdSec * 1000)} geleden`) : tr(lang, 'Встановіть цей випуск через SSH один раз', 'Installeer deze release één keer via SSH')}</Rij>
        {vrij !== null && <Rij ok={vrij >= 800}>{tr(lang, `Вільно на диску: ${mb(vrij * 1048576)}`, `Vrij op schijf: ${mb(vrij * 1048576)}`)}</Rij>}
        {root && root.problemen.length > 0 && <Rij ok={false}>{tr(lang, `Проблем у ланцюзі: ${root.problemen.length}`, `Problemen in de keten: ${root.problemen.length}`)}</Rij>}
      </ul>
    </section>

    <section className='ut-kaart'>
      <h2>{tr(lang, 'Швидкі дії', 'Snelle acties')}</h2>
      <div className='ut-snel'>
        <button type='button' className='ut-knop ut-knop-primair' onClick={naarUpload}><Upload aria-hidden='true' />{tr(lang, 'Завантажити архів', 'Archief uploaden')}</button>
        <button type='button' className='ut-knop' onClick={naarLog}><ScrollText aria-hidden='true' />{tr(lang, 'Журнал', 'Logboek')}</button>
        <button type='button' className='ut-knop' onClick={naarDiagnose}><Stethoscope aria-hidden='true' />{tr(lang, 'Діагностика', 'Diagnose')}</button>
        <button type='button' className='ut-knop' onClick={naarInstellen}><Settings2 aria-hidden='true' />{tr(lang, 'Налаштування', 'Instellingen')}</button>
        <a className='ut-knop' href={canonicalNavigationUrl('identity', 'methods', lang)}><Fingerprint aria-hidden='true' />{tr(lang, 'Мої passkey', 'Mijn passkeys')}<ExternalLink aria-hidden='true' /></a>
      </div>
    </section>

    {v2 ? <ToegangBlok lang={lang} data={data} naarInstellen={naarInstellen} /> : <section className='ut-kaart'>
      <h2>{tr(lang, 'Хто готує оновлення', 'Wie bereidt updates voor')}</h2>
      {actieveGrants.length === 0 ? <p className='ut-hint'>{tr(lang, 'Ніхто окремо. Власний архів можна завантажити завжди.', 'Niemand apart. Uw eigen archief kunt u altijd uploaden.')}</p>
        : <ul className='ut-lijst ut-lijst-klein ut-zij-agents'>{actieveGrants.map((g) => <li key={g.id}>{g.soort === 'account' && g.eigenaar ? <Persoon naam={g.eigenaar.naam || g.label} id={g.onderwerp} foto={g.eigenaar.foto} klein /> : <Avatar naam={g.label} id={g.onderwerp} klein />}<span><b>{g.soort === 'account' && g.eigenaar?.naam ? g.eigenaar.naam : g.label}</b><small>{g.onbepaald ? tr(lang, 'до відкликання', 'tot intrekking') : <>{tr(lang, 'до ', 'tot ')}{datum(lang, g.verlooptOp)}</>}</small></span></li>)}</ul>}
      <button type='button' className='ut-knop' onClick={naarInstellen}>{tr(lang, 'Керувати доступом', 'Toegang beheren')}</button>
    </section>}
  </aside>;
}
