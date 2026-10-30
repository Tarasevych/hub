// «Налаштування → GitHub і архіви випусків» (audit 18.10.2026, punt 4).
//  - Welke token de site gebruikt: technisch `github-uitrol` (alleen releases, één repository) heeft voorrang op de persoonlijke `github`.
//    De token zelf blijft in «Секрети й ключі» (versleuteld, met passkey te tonen/wijzigen) — hier alleen naam en of hij er is.
//  - Repository (eigenaar/repo, niet meer vast in het script), «Публікувати автоматично» (na elke geslaagde installatie).
//  - Archiefmap: hoeveel, hoe groot; «Видалити старіші» (bewaar de N nieuwste, minimaal 3, de actieve blijft altijd) — met passkey.
//  - Logboek van publicaties (ook mislukte, met de reden).
import { useCallback, useEffect, useState } from 'react';
import { Archive, CheckCircle2, CircleDashed, ExternalLink, Github, KeyRound, Loader2, Save, Trash2, TriangleAlert } from 'lucide-react';
import { api } from '../platform/client';
import { githubFoutTekst } from './PakketActies';
import { datum, mb, tr, type Lang } from './types';
import HulpVraag from '../hulp/HulpVraag';

type Stand = {
  gekoppeld: boolean; gebruikt: 'github-uitrol' | 'github' | null; tokens: Array<{ doel: string; aanwezig: boolean; naam: string }>;
  repo: string; automatisch: boolean; bijgewerkt: string; klaar: boolean;
  publicaties: Array<{ runId: string; versie: string; repo: string; tag: string; uitkomst: string; url: string; fout: string; door: string; tijd: string }>;
  archief: { aantal: number; bytes: number; oudste: string; nieuwste: string };
};
const REPO = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;

export default function GithubInstellingen({ lang, context }: { lang: Lang; context: Record<string, unknown> }) {
  const [s, setS] = useState<Stand | null>(null);
  const [repo, setRepo] = useState('');
  const [auto, setAuto] = useState(false);
  const [bewaar, setBewaar] = useState(10);
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState<{ soort: 'ok' | 'fout'; tekst: string } | null>(null);
  const [fout, setFout] = useState('');

  const laden = useCallback(async () => {
    try { const d = (await api.post('/api/owner/uitrol/github/stand', context)).data as Stand; setS(d); setRepo(d.repo); setAuto(d.automatisch); setFout(''); }
    catch { setFout(tr(lang, 'Не вдалося завантажити стан GitHub.', 'De GitHub-stand kon niet worden geladen.')); }
  }, [context, lang]);
  useEffect(() => { void laden(); }, [laden]);

  const opslaan = async () => {
    if (repo && !REPO.test(repo.trim())) { setMelding({ soort: 'fout', tekst: tr(lang, 'Репозиторій має вигляд «власник/назва».', 'De repository heeft de vorm «eigenaar/naam».') }); return; }
    setBezig('opslaan'); setMelding(null);
    try { await api.post('/api/owner/uitrol/github/instellingen', { ...context, repo: repo.trim(), automatisch: auto }); setMelding({ soort: 'ok', tekst: tr(lang, 'Збережено й записано в журнал.', 'Opgeslagen en in het logboek gezet.') }); await laden(); }
    catch (e) { setMelding({ soort: 'fout', tekst: (e as { message?: string })?.message === 'REPO_ONGELDIG' ? tr(lang, 'Неправильний репозиторій.', 'Ongeldige repository.') : tr(lang, 'Не збережено (потрібне підтвердження passkey).', 'Niet opgeslagen (bevestiging met passkey nodig).') }); }
    finally { setBezig(''); }
  };
  const opruimen = async () => {
    if (!window.confirm(tr(lang, `Видалити всі архіви, крім ${bewaar} найновіших? Активний випуск лишиться завжди. Скасувати не можна.`, `Alle archieven behalve de ${bewaar} nieuwste verwijderen? De actieve release blijft altijd. Dit kan niet ongedaan worden gemaakt.`))) return;
    setBezig('opruimen'); setMelding(null);
    try { const r = (await api.post('/api/owner/uitrol/pakketten/opruimen', { ...context, bewaar })).data as { verwijderd: number; verwijderdBytes: number }; setMelding({ soort: 'ok', tekst: tr(lang, `Видалено ${r.verwijderd} (${mb(r.verwijderdBytes || 0)}).`, `${r.verwijderd} verwijderd (${mb(r.verwijderdBytes || 0)}).`) }); await laden(); }
    catch { setMelding({ soort: 'fout', tekst: tr(lang, 'Не видалено (потрібне підтвердження passkey).', 'Niet verwijderd (bevestiging met passkey nodig).') }); }
    finally { setBezig(''); }
  };

  const tokenNaam = (d: string) => d === 'github-uitrol' ? tr(lang, 'технічний — лише релізи сайту', 'technisch — alleen site-releases') : tr(lang, 'особистий токен (приватний простір)', 'persoonlijke token (privéruimte)');
  return <section className='ut-kaart ut-github' data-ut-github aria-labelledby='ut-gh-titel'>
    <header className='ut-kaart-kop'><div>
      <h2 id='ut-gh-titel'><Github aria-hidden='true' /> {tr(lang, 'Архіви випусків і GitHub', 'Release-archieven en GitHub')}</h2>
      <p className='ut-sub'>{tr(lang, 'Кожен успішно встановлений випуск зберігається на сервері. За бажанням сайт публікує його як реліз на GitHub (тег uitrol-<версія>, архів, sha256, коміт). Токен — у «Секрети й ключі», ніколи не в журналі.', 'Elke geslaagde release wordt op de server bewaard. Desgewenst publiceert de site haar als release op GitHub (tag uitrol-<versie>, archief, sha256, commit). De token staat in «Geheimen en sleutels», nooit in een logboek.')}</p>
    </div></header>
    {fout && <p className='ut-fout' role='alert'>{fout}</p>}
    {!s && !fout && <p className='ut-leeg' role='status'><Loader2 aria-hidden='true' className='ut-draai' /> {tr(lang, 'Завантаження…', 'Laden…')}</p>}
    {s && <>
      <div className='ut-gh-raster'>
        <div className='ut-gh-blok' data-ut-gh-tokens>
          <h3><KeyRound aria-hidden='true' />{tr(lang, 'Доступ до GitHub', 'Toegang tot GitHub')}</h3>
          <ul className='ut-gh-tokens'>{s.tokens.map((t) => <li key={t.doel} data-aanwezig={t.aanwezig} data-gebruikt={s.gebruikt === t.doel}>
            {t.aanwezig ? <CheckCircle2 aria-hidden='true' /> : <CircleDashed aria-hidden='true' />}
            <span><b>{tokenNaam(t.doel)}</b><small>{t.aanwezig ? `${t.naam}${s.gebruikt === t.doel ? ` · ${tr(lang, 'використовується', 'in gebruik')}` : ''}` : tr(lang, 'не додано', 'niet toegevoegd')}</small></span></li>)}</ul>
          <a className='ut-knop' href='https://admin.tarasevych.com/contour' data-ut-gh-koppel><KeyRound aria-hidden='true' />{s.gekoppeld ? tr(lang, 'Керувати токенами', 'Tokens beheren') : tr(lang, 'Підключити GitHub', 'GitHub koppelen')}<ExternalLink aria-hidden='true' /></a>
          <p className='ut-hint'>{tr(lang, 'Рекомендовано: fine-grained токен лише на один репозиторій з правом «Contents: write», призначення «GitHub — релізи сайту (технічний)».', 'Aanbevolen: een fine-grained token voor één repository met «Contents: write», doel «GitHub — site-releases (technisch)».')}</p>
        </div>
        <div className='ut-gh-blok'>
          <h3><Github aria-hidden='true' />{tr(lang, 'Публікація', 'Publicatie')}</h3>
          <label className='ut-veld'>{tr(lang, 'Репозиторій (власник/назва)', 'Repository (eigenaar/naam)')}
            <input type='text' value={repo} onChange={(e) => setRepo(e.target.value)} placeholder='Tarasevych/hub' maxLength={140} spellCheck={false} autoComplete='off' data-ut-gh-repo /></label>
          <label className='ut-schakel'><input data-hulp='uitrol.github-auto' type='checkbox' checked={auto} onChange={(e) => setAuto(e.target.checked)} data-ut-gh-auto />
            <span>{tr(lang, 'Публікувати автоматично після кожного успішного встановлення', 'Automatisch publiceren na elke geslaagde installatie')} <HulpVraag k='uitrol.github-auto' lang={lang} /></span></label>
          <button type='button' className='ut-knop ut-knop-primair' disabled={Boolean(bezig)} onClick={() => void opslaan()} data-ut-gh-opslaan>
            {bezig === 'opslaan' ? <Loader2 aria-hidden='true' className='ut-draai' /> : <Save aria-hidden='true' />}{tr(lang, 'Зберегти', 'Opslaan')}</button>
          {!s.klaar && <p className='ut-hint' data-ut-gh-niet-klaar><TriangleAlert aria-hidden='true' /> {!s.gekoppeld ? tr(lang, 'GitHub не підключено — публікація вимкнена, архіви все одно зберігаються на сервері.', 'GitHub is niet gekoppeld — publiceren staat uit, archieven worden wel op de server bewaard.') : tr(lang, 'Вкажіть репозиторій, щоб публікувати.', 'Stel een repository in om te publiceren.')}</p>}
        </div>
        <div className='ut-gh-blok' data-ut-archief>
          <h3><Archive aria-hidden='true' />{tr(lang, 'Архіви на сервері', 'Archieven op de server')}</h3>
          <p><b>{s.archief.aantal}</b> {tr(lang, 'архівів', 'archieven')} · {mb(s.archief.bytes || 0)}{s.archief.oudste ? ` · ${s.archief.oudste} … ${s.archief.nieuwste}` : ''}</p>
          <label className='ut-veld'>{tr(lang, 'Залишити найновіших', 'Nieuwste bewaren')}
            <input type='number' min={3} max={500} value={bewaar} onChange={(e) => setBewaar(Math.max(3, Math.min(500, Number(e.target.value) || 3)))} /></label>
          <button type='button' className='ut-knop ut-knop-gevaar' disabled={Boolean(bezig) || s.archief.aantal <= bewaar} onClick={() => void opruimen()} data-ut-opruimen>
            {bezig === 'opruimen' ? <Loader2 aria-hidden='true' className='ut-draai' /> : <Trash2 aria-hidden='true' />}{tr(lang, 'Видалити старіші', 'Oudere verwijderen')}</button>
        </div>
      </div>
      {melding && <p className={melding.soort === 'ok' ? 'ut-ok-tekst' : 'ut-fout'} role={melding.soort === 'ok' ? 'status' : 'alert'}>{melding.tekst}</p>}
      <details className='ut-gh-log' open={s.publicaties.length > 0 && s.publicaties.length < 6}>
        <summary>{tr(lang, 'Журнал публікацій', 'Logboek van publicaties')} <b>{s.publicaties.length}</b></summary>
        {s.publicaties.length === 0 ? <p className='ut-leeg'>{tr(lang, 'Ще нічого не публікувалося.', 'Nog niets gepubliceerd.')}</p>
          : <ol>{s.publicaties.map((p, i) => <li key={`${p.runId}-${i}`} data-uitkomst={p.uitkomst}>
            <time>{datum(lang, p.tijd)}</time><b className='ut-mono'>{p.versie}</b>
            <span>{p.uitkomst === 'ok' ? <a href={p.url} target='_blank' rel='noopener noreferrer'>{p.repo} · {p.tag}</a> : githubFoutTekst(lang, p.fout)}</span>
            <small>{p.door === 'automatisch' ? tr(lang, 'автоматично', 'automatisch') : p.door}</small></li>)}</ol>}
      </details>
    </>}
  </section>;
}
