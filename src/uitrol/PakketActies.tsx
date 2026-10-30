// «Завантажити цей випуск» en «Опублікувати на GitHub» voor één run (audit 18.10.2026, punt 4).
// Downloaden: eerst een eenmalige link (eigenaar + passkey/app-code/herstelcode — client.ts vraagt de bevestiging zelf), dan het bestand;
// na het downloaden wordt de sha256 in de browser gecontroleerd tegen wat de server bewaarde. Geen archief (runs van vóór 18.10.2026):
// een uitleg in plaats van een knop.
import { useState } from 'react';
import { Archive, CheckCircle2, Download, ExternalLink, Github, Loader2, TriangleAlert } from 'lucide-react';
import { api } from '../platform/client';
import { leesSha256 } from '../../shared/bestand-lezen';
import { bestandLeesUitleg, bestandLeesfoutCode } from '../../shared/foutuitleg';
import { mb, tr, type Lang, type Run } from './types';

export const GITHUB_FOUT: Record<string, [string, string]> = {
  GITHUB_NIET_GEKOPPELD: ['GitHub не підключено: додайте токен у «Секрети й ключі» (призначення «GitHub — релізи сайту»).', 'GitHub is niet gekoppeld: voeg een token toe in «Geheimen en sleutels» (doel «GitHub — site-releases»).'],
  GEEN_REPO: ['Не вказано репозиторій для релізів (Налаштування → GitHub).', 'Geen repository voor releases ingesteld (Instellingen → GitHub).'],
  ARCHIEF_NIET_BEWAARD: ['Архів цього випуску не збережено — його нема чого публікувати.', 'Het archief van deze release is niet bewaard — er is niets om te publiceren.'],
  ARCHIEF_ONTBREEKT: ['Файл архіву зник із сервера (видалено під час прибирання?).', 'Het archiefbestand staat niet meer op de server (opgeruimd?).'],
  RUN_NIET_KLAAR: ['Публікувати можна лише успішно встановлений випуск.', 'Alleen een geslaagde installatie kan worden gepubliceerd.'],
  GITHUB_HTTP_401: ['GitHub відхилив токен (401): він недійсний або прострочений.', 'GitHub weigerde de token (401): ongeldig of verlopen.'],
  GITHUB_HTTP_403: ['GitHub: бракує прав (403). Токену потрібен доступ «Contents: write» до цього репозиторію.', 'GitHub: onvoldoende rechten (403). De token heeft «Contents: write» op deze repository nodig.'],
  GITHUB_HTTP_404: ['GitHub: репозиторій не знайдено або токен його не бачить (404).', 'GitHub: repository niet gevonden of niet zichtbaar voor de token (404).'],
  GITHUB_HTTP_422: ['GitHub відхилив дані релізу (422) — наприклад, тег уже існує з іншим комітом.', 'GitHub weigerde de releasegegevens (422) — bv. de tag bestaat al met een andere commit.'],
  GITHUB_NETWERK: ['Немає зв’язку з GitHub (тричі). Спробуйте пізніше.', 'Geen verbinding met GitHub (driemaal). Probeer het later.'],
  AL_BEZIG: ['Публікація вже триває.', 'De publicatie loopt al.'],
};
export const githubFoutTekst = (lang: Lang, code: string) => { const t = GITHUB_FOUT[code] || (code.startsWith('GITHUB_HTTP_5') ? ['GitHub тимчасово недоступний (тричі спробували).', 'GitHub is tijdelijk niet bereikbaar (driemaal geprobeerd).'] as [string, string] : null); return t ? (lang === 'uk' ? t[0] : t[1]) : code; };

// Het lezen van de blob gaat door shared/bestand-lezen.ts: een leesfout mag hier NIET als «sha256 збігається» eindigen
// (dat was zo: `.catch(() => '')` maakte de controle stil onwaar). Eigenaar 20.10.2026.
const sha256Hex = (blob: Blob) => leesSha256(blob);

export default function PakketActies({ lang, context, run, onGewijzigd }: { lang: Lang; context: Record<string, unknown>; run: Run; onGewijzigd?: () => void }) {
  const [bezig, setBezig] = useState<'' | 'download' | 'github'>('');
  const [melding, setMelding] = useState<{ soort: 'ok' | 'fout'; tekst: string } | null>(null);
  const bewaard = Boolean(run.pakket?.bewaard);

  const downloaden = async () => {
    setBezig('download'); setMelding(null);
    try {
      const link = (await api.post(`/api/owner/uitrol/pakket/${encodeURIComponent(run.id)}/link`, context)).data as { downloadId: string; naam: string; sha256: string };
      const res = await fetch(`/api/owner/uitrol/pakket/${encodeURIComponent(run.id)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...context, downloadId: link.downloadId }) });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      // Leesfout = de controle is NIET gedaan; dat zegt de melding dan ook (nooit stilzwijgend «sha256 збігається»).
      let echt = ''; let leesCode = '';
      try { echt = await sha256Hex(blob); } catch (e) { leesCode = bestandLeesfoutCode(e); }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = link.naam; document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMelding(echt && echt !== link.sha256
        ? { soort: 'fout', tekst: tr(lang, 'Увага: sha256 завантаженого файлу НЕ збігається зі збереженим. Не використовуйте цей файл.', 'Let op: de sha256 van het gedownloade bestand komt NIET overeen met de bewaarde. Gebruik dit bestand niet.') }
        : leesCode
          ? { soort: 'fout', tekst: `${tr(lang, `Файл ${link.naam} збережено, але sha256 НЕ перевірено: браузер не зміг прочитати завантажений файл.`, `Bestand ${link.naam} is bewaard, maar de sha256 is NIET gecontroleerd: de browser kon het gedownloade bestand niet lezen.`)} ${bestandLeesUitleg(lang, leesCode).waarom} ${bestandLeesUitleg(lang, leesCode).doen}` }
          : { soort: 'ok', tekst: tr(lang, `Завантажено ${link.naam}. sha256 збігається.`, `${link.naam} gedownload. sha256 komt overeen.`) });
    } catch (e) {
      const code = (e as { message?: string })?.message || '';
      setMelding({ soort: 'fout', tekst: code === 'ARCHIEF_NIET_BEWAARD'
        ? tr(lang, 'Архів цього випуску на сервері не знайдено.', 'Het archief van deze release staat niet op de server.')
        : tr(lang, 'Не вдалося завантажити (потрібне підтвердження passkey; посилання діє 5 хвилин).', 'Downloaden mislukt (bevestiging met passkey nodig; de link geldt 5 minuten).') });
    } finally { setBezig(''); }
  };

  const publiceren = async () => {
    setBezig('github'); setMelding(null);
    try {
      const r = (await api.post('/api/owner/uitrol/github/publiceren', { ...context, run: run.id })).data as { uitkomst: string; code?: string; url?: string };
      setMelding(r.uitkomst === 'ok'
        ? { soort: 'ok', tekst: tr(lang, 'Опубліковано на GitHub.', 'Gepubliceerd op GitHub.') }
        : { soort: 'fout', tekst: githubFoutTekst(lang, r.code || '') });
      onGewijzigd?.();
    } catch (e) { setMelding({ soort: 'fout', tekst: githubFoutTekst(lang, (e as { message?: string })?.message || '') }); }
    finally { setBezig(''); }
  };

  return <section className='ut-pakket-acties' data-ut-pakket={bewaard ? 'bewaard' : 'ontbreekt'}>
    <h3><Archive aria-hidden='true' />{tr(lang, 'Архів випуску', 'Archief van de release')}</h3>
    {bewaard
      ? <p className='ut-sub'>{tr(lang, `Збережено на сервері${run.pakket?.grootte ? ` · ${mb(run.pakket.grootte)}` : ''}. Завантаження — з підтвердженням passkey і записом у журнал.`, `Bewaard op de server${run.pakket?.grootte ? ` · ${mb(run.pakket.grootte)}` : ''}. Downloaden met bevestiging (passkey) en een regel in het logboek.`)}</p>
      : <p className='ut-hint' data-ut-geen-archief>{run.staat === 'klaar'
        ? tr(lang, 'Архів цього випуску не збережено: до виправлення 18.10.2026 сервер не зберігав пакети (шукав файл не там). Нові випуски зберігаються автоматично.', 'Het archief van deze release is niet bewaard: vóór de reparatie van 18.10.2026 bewaarde de server geen pakketten (zocht het bestand op de verkeerde plek). Nieuwe releases worden automatisch bewaard.')
        : tr(lang, 'Архів зберігається лише для успішно встановлених випусків.', 'Een archief wordt alleen bewaard voor geslaagde installaties.')}</p>}
    <div className='ut-pakket-knoppen'>
      <button type='button' className='ut-knop ut-knop-primair' data-ut-download disabled={!bewaard || Boolean(bezig)} onClick={() => void downloaden()}>
        {bezig === 'download' ? <Loader2 aria-hidden='true' className='ut-draai' /> : <Download aria-hidden='true' />}{tr(lang, 'Завантажити цей випуск', 'Deze release downloaden')}</button>
      {run.github?.url
        ? <a className='ut-knop' href={run.github.url} target='_blank' rel='noopener noreferrer' data-ut-github-link><Github aria-hidden='true' />{tr(lang, 'Реліз на GitHub', 'Release op GitHub')}<ExternalLink aria-hidden='true' /></a>
        : <button type='button' className='ut-knop' data-ut-publiceer disabled={!bewaard || run.staat !== 'klaar' || Boolean(bezig)} onClick={() => void publiceren()}>
          {bezig === 'github' ? <Loader2 aria-hidden='true' className='ut-draai' /> : <Github aria-hidden='true' />}{tr(lang, 'Опублікувати на GitHub', 'Publiceren op GitHub')}</button>}
    </div>
    {run.github?.fout && !run.github.url && !melding && <p className='ut-hint' data-ut-github-fout><TriangleAlert aria-hidden='true' /> {githubFoutTekst(lang, run.github.fout)}</p>}
    {melding && <p className={melding.soort === 'ok' ? 'ut-ok-tekst' : 'ut-fout'} role={melding.soort === 'ok' ? 'status' : 'alert'}>
      {melding.soort === 'ok' ? <CheckCircle2 aria-hidden='true' /> : <TriangleAlert aria-hidden='true' />} {melding.tekst}</p>}
  </section>;
}
