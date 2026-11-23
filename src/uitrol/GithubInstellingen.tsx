// «Налаштування → GitHub і архіви випусків» + безпечне приймання випусків із GitHub (вхідний приймач, вручну, MCP).
// «Instellingen → Release-archieven en GitHub» + veilige ontvangst van releases uit GitHub (webhook, handmatig, MCP).
import { useCallback, useEffect, useState } from 'react';
import {
  Archive, CheckCircle2, CircleDashed, CloudDownload, Copy, ExternalLink, Github, KeyRound, Loader2, Save, Trash2, TriangleAlert, Webhook,
} from 'lucide-react';
import { api } from '../platform/client';
import { foutCode } from '../platform/webauthn';
import { foutTekst } from './fouten';
import { githubFoutTekst } from './PakketActies';
import { datum, mb, tr, type Lang } from './types';
import HulpVraag from '../hulp/HulpVraag';

type Stand = {
  gekoppeld: boolean;
  gebruikt: 'github-uitrol' | 'github' | null;
  tokens: Array<{ doel: string; aanwezig: boolean; naam: string }>;
  repo: string;
  automatisch: boolean;
  bijgewerkt: string;
  klaar: boolean;
  publicaties: Array<{ runId: string; versie: string; repo: string; tag: string; uitkomst: string; url: string; fout: string; door: string; tijd: string }>;
  archief: { aantal: number; bytes: number; oudste: string; nieuwste: string };
};

type OntvangstStand = {
  repo: string;
  webhookAan: boolean;
  webhookAutoOphalen: boolean;
  toegestaneTagPrefix: string;
  webhookGeheimAanwezig: boolean;
  webhookUrl: string;
  ontvangen: Array<{
    id: string;
    bron: string;
    repo: string;
    tag: string;
    versie: string;
    assetNaam: string;
    assetSha256: string;
    assetBytes: number;
    voorstelId: string | null;
    status: string;
    foutCode: string;
    samenvattingUk: string;
    samenvattingNl: string;
    aangemaaktOp: string;
  }>;
  leveringen: Array<{
    deliveryId: string;
    gebeurtenis: string;
    repo: string;
    tag: string;
    uitkomst: string;
    ontvangenOp: string;
  }>;
};

const REPO = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;

export default function GithubInstellingen({
  lang,
  context,
  onVoorstelOntvangen,
}: {
  lang: Lang;
  context: Record<string, unknown>;
  onVoorstelOntvangen?: () => void;
}) {
  const [s, setS] = useState<Stand | null>(null);
  const [ont, setOnt] = useState<OntvangstStand | null>(null);
  const [repo, setRepo] = useState('');
  const [auto, setAuto] = useState(false);
  const [bewaar, setBewaar] = useState(10);

  // Налаштування приймання випусків із GitHub
  const [webhookAan, setWebhookAan] = useState(false);
  const [webhookAuto, setWebhookAuto] = useState(true);
  const [tagPrefix, setTagPrefix] = useState('');
  const [webhookGeheim, setWebhookGeheim] = useState('');
  const [eenmaligGeheim, setEenmaligGeheim] = useState('');
  const [ophaalTag, setOphaalTag] = useState('');
  const [ophaalSha, setOphaalSha] = useState('');

  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState<{ soort: 'ok' | 'fout'; tekst: string } | null>(null);
  const [fout, setFout] = useState('');

  const laden = useCallback(async () => {
    try {
      const [pubR, ontR] = await Promise.all([
        api.post('/api/owner/uitrol/github/stand', context),
        api.post('/api/owner/uitrol/github/ontvangst/stand', context).catch(() => null),
      ]);
      const d = pubR.data as Stand;
      setS(d);
      setRepo(d.repo);
      setAuto(d.automatisch);
      if (ontR?.data) {
        const od = ontR.data as OntvangstStand;
        setOnt(od);
        setWebhookAan(Boolean(od.webhookAan));
        setWebhookAuto(Boolean(od.webhookAutoOphalen));
        setTagPrefix(od.toegestaneTagPrefix ?? '');
      }
      setFout('');
    } catch {
      setFout(tr(lang, 'Не вдалося завантажити стан GitHub.', 'De GitHub-stand kon niet worden geladen.'));
    }
  }, [context, lang]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const opslaan = async () => {
    if (repo && !REPO.test(repo.trim())) {
      setMelding({ soort: 'fout', tekst: tr(lang, 'Репозиторій має вигляд «власник/назва».', 'De repository heeft de vorm «eigenaar/naam».') });
      return;
    }
    setBezig('opslaan');
    setMelding(null);
    try {
      await api.post('/api/owner/uitrol/github/instellingen', { ...context, repo: repo.trim(), automatisch: auto });
      setMelding({ soort: 'ok', tekst: tr(lang, 'Збережено й записано в журнал.', 'Opgeslagen en in het logboek gezet.') });
      await laden();
    } catch (e) {
      setMelding({
        soort: 'fout',
        tekst: (e as { message?: string })?.message === 'REPO_ONGELDIG'
          ? tr(lang, 'Неправильний репозиторій.', 'Ongeldige repository.')
          : tr(lang, 'Не збережено (потрібне підтвердження ключем доступу).', 'Niet opgeslagen (bevestiging met passkey nodig).'),
      });
    } finally {
      setBezig('');
    }
  };

  const ontvangstOpslaan = async (genereerGeheim = false) => {
    if (repo && !REPO.test(repo.trim())) {
      setMelding({ soort: 'fout', tekst: tr(lang, 'Репозиторій має вигляд «власник/назва».', 'De repository heeft de vorm «eigenaar/naam».') });
      return;
    }
    setBezig(genereerGeheim ? 'wh-genereer' : 'wh-opslaan');
    setMelding(null);
    setEenmaligGeheim('');
    try {
      const r = (await api.post('/api/owner/uitrol/github/ontvangst/instellen', {
        ...context,
        repo: repo.trim(),
        webhookAan,
        webhookAutoOphalen: webhookAuto,
        toegestaneTagPrefix: tagPrefix.trim(),
        ...(genereerGeheim ? { genereerGeheim: true } : webhookGeheim.trim() ? { webhookGeheim: webhookGeheim.trim() } : {}),
      })).data as OntvangstStand & { eenmaligWebhookGeheim?: string };
      setWebhookGeheim('');
      if (r.eenmaligWebhookGeheim) setEenmaligGeheim(r.eenmaligWebhookGeheim);
      setMelding({
        soort: 'ok',
        tekst: genereerGeheim
          ? tr(lang, 'Секрет підпису вхідного приймача GitHub згенеровано й збережено в Сховищі секретів. Скопіюйте його нижче.', 'HMAC-geheim voor GitHub-webhook gegenereerd en in het Geheimenkluis opgeslagen. Kopieer het hieronder.')
          : tr(lang, 'Налаштування отримання випусків із GitHub збережено.', 'Instellingen voor release-ontvangst uit GitHub opgeslagen.'),
      });
      await laden();
    } catch (e) {
      setMelding({ soort: 'fout', tekst: foutTekst(lang, foutCode(e)) });
    } finally {
      setBezig('');
    }
  };

  const nuOphalen = async () => {
    if (!repo.trim() && !ont?.repo) {
      setMelding({ soort: 'fout', tekst: tr(lang, 'Спочатку вкажіть репозиторій (власник/назва).', 'Vul eerst een repository in (eigenaar/naam).') });
      return;
    }
    setBezig('ophalen');
    setMelding(null);
    try {
      const r = (await api.post('/api/owner/uitrol/github/ophalen', {
        ...context,
        bron: 'handmatig',
        ...(repo.trim() ? { repo: repo.trim() } : {}),
        ...(ophaalTag.trim() ? { tag: ophaalTag.trim() } : {}),
        ...(ophaalSha.trim() ? { sha256: ophaalSha.trim() } : {}),
      })).data as { ok?: boolean; overgeslagen?: boolean; code?: string; versie?: string; status?: string };
      if (r.overgeslagen) {
        setMelding({ soort: 'ok', tekst: tr(lang, `Версія ${r.versie} уже є у списку пропозицій.`, `Versie ${r.versie} staat al in de lijst met voorstellen.`) });
      } else if (!r.ok) {
        setMelding({ soort: 'fout', tekst: tr(lang, `Випуск ${r.versie || ''} завантажено, але попередня перевірка зупинила його (${r.code || 'VOORCONTROLE_MISLUKT'}).`, `Release ${r.versie || ''} opgehaald, maar door de voorcontrole geweigerd (${r.code || 'VOORCONTROLE_MISLUKT'}).`) });
      } else {
        setMelding({ soort: 'ok', tekst: tr(lang, `Випуск ${r.versie} завантажено з GitHub і перевірено! Відкрийте «Огляд», щоб схвалити ключем доступу.`, `Release ${r.versie} uit GitHub opgehaald en gecontroleerd! Open «Overzicht» om met passkey goed te keuren.`) });
        onVoorstelOntvangen?.();
      }
      await laden();
    } catch (e) {
      setMelding({ soort: 'fout', tekst: foutTekst(lang, foutCode(e)) });
      await laden();
    } finally {
      setBezig('');
    }
  };

  const opruimen = async () => {
    if (!window.confirm(tr(lang, `Видалити всі архіви, крім ${bewaar} найновіших? Активний випуск лишиться завжди. Скасувати не можна.`, `Alle archieven behalve de ${bewaar} nieuwste verwijderen? De actieve release blijft altijd. Dit kan niet ongedaan worden gemaakt.`))) return;
    setBezig('opruimen');
    setMelding(null);
    try {
      const r = (await api.post('/api/owner/uitrol/pakketten/opruimen', { ...context, bewaar })).data as { verwijderd: number; verwijderdBytes: number };
      setMelding({ soort: 'ok', tekst: tr(lang, `Видалено ${r.verwijderd} (${mb(r.verwijderdBytes || 0)}).`, `${r.verwijderd} verwijderd (${mb(r.verwijderdBytes || 0)}).`) });
      await laden();
    } catch {
      setMelding({ soort: 'fout', tekst: tr(lang, 'Не видалено (потрібне підтвердження ключем доступу).', 'Niet verwijderd (bevestiging met passkey nodig).') });
    } finally {
      setBezig('');
    }
  };

  const kopieer = async (tekstVal: string, labelUk: string, labelNl: string) => {
    try {
      await navigator.clipboard.writeText(tekstVal);
      setMelding({ soort: 'ok', tekst: tr(lang, labelUk, labelNl) });
    } catch { /* ігнор */ }
  };

  const tokenNaam = (d: string) => d === 'github-uitrol' ? tr(lang, 'технічний — лише випуски сайту', 'technisch — alleen site-releases') : tr(lang, 'особистий ключ доступу (приватний простір)', 'persoonlijke token (privéruimte)');

  return (
    <section className='ut-kaart ut-github' data-ut-github aria-labelledby='ut-gh-titel'>
      <header className='ut-kaart-kop'>
        <div>
          <h2 id='ut-gh-titel'><Github aria-hidden='true' /> {tr(lang, 'Архіви випусків і GitHub', 'Release-archieven en GitHub')}</h2>
          <p className='ut-sub'>
            {tr(
              lang,
              'Публікація встановлених випусків на GitHub, а також безпечне отримання нових випусків із GitHub (через підписаний приймач сповіщень, вручну або MCP) на попередню перевірку перед схваленням ключ доступу.',
              'Publicatie van geïnstalleerde releases op GitHub, én veilige ontvangst van nieuwe releases uit GitHub (via ondertekende webhook, handmatig of MCP) voor voorcontrole vóór passkey-goedkeuring.',
            )}
          </p>
        </div>
      </header>

      {fout && <p className='ut-fout' role='alert'>{fout}</p>}
      {!s && !fout && <p className='ut-leeg' role='status'><Loader2 aria-hidden='true' className='ut-draai' /> {tr(lang, 'Завантаження…', 'Laden…')}</p>}

      {s && (
        <>
          <div className='ut-gh-raster'>
            <div className='ut-gh-blok' data-ut-gh-tokens>
              <h3><KeyRound aria-hidden='true' />{tr(lang, 'Доступ до GitHub', 'Toegang tot GitHub')}</h3>
              <ul className='ut-gh-tokens'>
                {s.tokens.map((t) => (
                  <li key={t.doel} data-aanwezig={t.aanwezig} data-gebruikt={s.gebruikt === t.doel}>
                    {t.aanwezig ? <CheckCircle2 aria-hidden='true' /> : <CircleDashed aria-hidden='true' />}
                    <span>
                      <b>{tokenNaam(t.doel)}</b>
                      <small>{t.aanwezig ? `${t.naam}${s.gebruikt === t.doel ? ` · ${tr(lang, 'використовується', 'in gebruik')}` : ''}` : tr(lang, 'не додано', 'niet toegevoegd')}</small>
                    </span>
                  </li>
                ))}
              </ul>
              <a className='ut-knop' href='https://admin.tarasevych.com/contour' data-ut-gh-koppel>
                <KeyRound aria-hidden='true' />{s.gekoppeld ? tr(lang, 'Керувати ключами доступу', 'Tokens beheren') : tr(lang, 'Підключити GitHub', 'GitHub koppelen')}
                <ExternalLink aria-hidden='true' />
              </a>
              <p className='ut-hint'>{tr(lang, 'Рекомендовано: обмежений ключ доступу (fine-grained) лише на один репозиторій з правом «Contents: write», призначення «github-uitrol» (технічний).', 'Aanbevolen: een fine-grained token voor één repository met «Contents: write», doel «GitHub — site-releases (technisch)».')}</p>
            </div>

            <div className='ut-gh-blok'>
              <h3><Github aria-hidden='true' />{tr(lang, 'Публікація після встановлення', 'Publicatie na installatie')}</h3>
              <label className='ut-veld'>
                {tr(lang, 'Репозиторій (власник/назва)', 'Repository (eigenaar/naam)')}
                <input type='text' value={repo} onChange={(e) => setRepo(e.target.value)} placeholder='Tarasevych/hub' maxLength={140} spellCheck={false} autoComplete='off' data-ut-gh-repo />
              </label>
              <label className='ut-schakel'>
                <input data-hulp='uitrol.github-auto' type='checkbox' checked={auto} onChange={(e) => setAuto(e.target.checked)} data-ut-gh-auto />
                <span>{tr(lang, 'Публікувати автоматично після кожного успішного встановлення', 'Automatisch publiceren na elke geslaagde installatie')} <HulpVraag k='uitrol.github-auto' lang={lang} /></span>
              </label>
              <button type='button' className='ut-knop ut-knop-primair' disabled={Boolean(bezig)} onClick={() => void opslaan()} data-ut-gh-opslaan>
                {bezig === 'opslaan' ? <Loader2 aria-hidden='true' className='ut-draai' /> : <Save aria-hidden='true' />}{tr(lang, 'Зберегти', 'Opslaan')}
              </button>
              {!s.klaar && (
                <p className='ut-hint' data-ut-gh-niet-klaar>
                  <TriangleAlert aria-hidden='true' />{' '}
                  {!s.gekoppeld
                    ? tr(lang, 'GitHub не підключено — публікація вимкнена, архіви все одно зберігаються на сервері.', 'GitHub is niet gekoppeld — publiceren staat uit, archieven worden wel op de server bewaard.')
                    : tr(lang, 'Вкажіть репозиторій, щоб публікувати.', 'Stel een repository in om te publiceren.')}
                </p>
              )}
            </div>

            <div className='ut-gh-blok' data-ut-archief>
              <h3><Archive aria-hidden='true' />{tr(lang, 'Архіви на сервері', 'Archieven op de server')}</h3>
              <p><b>{s.archief.aantal}</b> {tr(lang, 'архівів', 'archieven')} · {mb(s.archief.bytes || 0)}{s.archief.oudste ? ` · ${s.archief.oudste} … ${s.archief.nieuwste}` : ''}</p>
              <label className='ut-veld'>
                {tr(lang, 'Залишити найновіших', 'Nieuwste bewaren')}
                <input type='number' min={3} max={500} value={bewaar} onChange={(e) => setBewaar(Math.max(3, Math.min(500, Number(e.target.value) || 3)))} />
              </label>
              <button type='button' className='ut-knop ut-knop-gevaar' disabled={Boolean(bezig) || s.archief.aantal <= bewaar} onClick={() => void opruimen()} data-ut-opruimen>
                {bezig === 'opruimen' ? <Loader2 aria-hidden='true' className='ut-draai' /> : <Trash2 aria-hidden='true' />}{tr(lang, 'Видалити старіші', 'Oudere verwijderen')}
              </button>
            </div>
          </div>

          {ont && (
            <div className='ut-gh-raster' data-ut-gh-ontvangst>
              <div className='ut-gh-blok'>
                <h3><Webhook aria-hidden='true' /> {tr(lang, 'Отримання випусків через приймач подій GitHub', 'Releases ontvangen via GitHub Webhook')} <HulpVraag k='uitrol.github-webhook-aan' naam={['Приймач подій', 'Webhook']} meer={[['uitrol.github-webhook-auto', 'Автозавантаження', 'Automatisch ophalen']]} lang={lang} /></h3>
                <p className='ut-hint'>
                  {tr(
                    lang,
                    'У налаштуваннях GitHub (Settings → Webhooks) оберіть подію «Releases», Content-Type «application/json» та вкажіть адресу й HMAC-секрет.',
                    'Kies in GitHub (Settings → Webhooks) de gebeurtenis «Releases», Content-Type «application/json» en vul het adres en het HMAC-geheim in.',
                  )}
                </p>
                <div className='ut-pakket-knoppen'>
                  <code className='ut-mono'>{ont.webhookUrl}</code>
                  <button
                    type='button'
                    className='ut-knop'
                    onClick={() => void kopieer(ont.webhookUrl, 'Адресу приймача подій скопійовано.', 'Webhook-adres gekopieerd.')}
                  >
                    <Copy size={14} aria-hidden='true' /> {tr(lang, 'Копіювати URL', 'URL kopiëren')}
                  </button>
                </div>

                <label className='ut-veld'>
                  <span>
                    {tr(lang, 'HMAC-секрет приймача подій', 'HMAC-geheim van de webhook')}{' '}
                    ({ont.webhookGeheimAanwezig ? tr(lang, 'установлено', 'ingesteld') : tr(lang, 'не встановлено', 'niet ingesteld')})
                  </span>
                  <input
                    type='password'
                    value={webhookGeheim}
                    onChange={(e) => setWebhookGeheim(e.target.value)}
                    placeholder={ont.webhookGeheimAanwezig ? '••••••••••••••••' : tr(lang, 'Мін. 16 символів або згенеруйте нижче', 'Min. 16 tekens of genereer er een')}
                    maxLength={256}
                    autoComplete='new-password'
                  />
                </label>

                <label className='ut-veld'>
                  <span>{tr(lang, 'Дозволений префікс міток випуску (порожньо — будь-яка)', 'Toegestane tag-prefix van releases (leeg = alle)')}</span>
                  <input type='text' value={tagPrefix} onChange={(e) => setTagPrefix(e.target.value)} placeholder={tr(lang, 'порожньо — будь-яка', 'leeg = elke tag')} maxLength={40} />
                </label>

                <label className='ut-schakel'>
                  <input data-hulp='uitrol.github-webhook-aan' type='checkbox' checked={webhookAan} onChange={(e) => setWebhookAan(e.target.checked)} data-ut-gh-wh-aan />
                  <span>{tr(lang, 'Приймати вхідні сповіщення про випуски з перевіркою HMAC-SHA256', 'Inkomende release-events accepteren met HMAC-SHA256-controle')}</span>
                </label>

                <label className='ut-schakel'>
                  <input data-hulp='uitrol.github-webhook-auto' type='checkbox' checked={webhookAuto} onChange={(e) => setWebhookAuto(e.target.checked)} data-ut-gh-wh-auto />
                  <span>{tr(lang, 'Автоматично завантажувати й перевіряти архів (без самочинного встановлення — лише до «Очікує ключ доступу»)', 'Archief automatisch ophalen en voorcontroleren (nooit automatisch installeren — alleen tot «Wacht op passkey»)')}</span>
                </label>

                <div className='ut-pakket-knoppen'>
                  <button type='button' className='ut-knop ut-knop-primair' disabled={Boolean(bezig)} onClick={() => void ontvangstOpslaan(false)} data-ut-gh-wh-opslaan>
                    {bezig === 'wh-opslaan' ? <Loader2 className='ut-draai' aria-hidden='true' /> : <Save aria-hidden='true' />}
                    {tr(lang, 'Зберегти приймач подій', 'Webhook opslaan')}
                  </button>
                  <button type='button' className='ut-knop' disabled={Boolean(bezig)} onClick={() => void ontvangstOpslaan(true)} data-ut-gh-wh-genereer>
                    {bezig === 'wh-genereer' ? <Loader2 className='ut-draai' aria-hidden='true' /> : <KeyRound aria-hidden='true' />}
                    {tr(lang, 'Згенерувати секрет', 'Geheim genereren')}
                  </button>
                </div>

                {eenmaligGeheim && (
                  <div className='ut-pakket-knoppen' role='status' data-ut-gh-eenmalig-geheim>
                    <code className='ut-mono'>{eenmaligGeheim}</code>
                    <button
                      type='button'
                      className='ut-knop'
                      onClick={() => void kopieer(eenmaligGeheim, 'Секрет приймача подій скопійовано.', 'Webhook-geheim gekopieerd.')}
                    >
                      <Copy size={14} aria-hidden='true' /> {tr(lang, 'Копіювати секрет', 'Geheim kopiëren')}
                    </button>
                  </div>
                )}
              </div>

              <div className='ut-gh-blok'>
                <h3><CloudDownload aria-hidden='true' /> {tr(lang, 'Завантажити випуск із GitHub вручну', 'Release handmatig uit GitHub ophalen')}</h3>
                <p className='ut-hint'>
                  {tr(
                    lang,
                    'Завантажує .tar.gz із випуску GitHub, звіряє SHA-256 і запускає ту саму попередню перевірку. Після успіху пропозиція чекатиме схвалення ключем доступу у вкладці «Огляд».',
                    'Haalt een .tar.gz uit een GitHub-release, controleert SHA-256 en draait dezelfde voorcontrole. Na succes wacht het voorstel op uw passkey in «Overzicht».',
                  )}
                </p>
                <label className='ut-veld'>
                  <span>{tr(lang, 'Мітка випуску (порожньо — найновіший випуск)', 'Release-tag (leeg = nieuwste release)')}</span>
                  <input type='text' value={ophaalTag} onChange={(e) => setOphaalTag(e.target.value)} placeholder='20261115-120000' maxLength={120} data-ut-gh-ophalen-tag />
                </label>
                <label className='ut-veld'>
                  <span>{tr(lang, 'Очікуваний SHA-256 (необов’язково)', 'Verwachte SHA-256 (optioneel)')}</span>
                  <input type='text' value={ophaalSha} onChange={(e) => setOphaalSha(e.target.value)} placeholder='64 hex' maxLength={64} />
                </label>
                <button type='button' className='ut-knop ut-knop-primair' disabled={Boolean(bezig)} onClick={() => void nuOphalen()} data-ut-gh-ophalen>
                  {bezig === 'ophalen' ? <Loader2 className='ut-draai' aria-hidden='true' /> : <CloudDownload aria-hidden='true' />}
                  {tr(lang, 'Завантажити й перевірити зараз', 'Nu ophalen en voorcontroleren')}
                </button>
              </div>
            </div>
          )}

          {melding && (
            <p className={melding.soort === 'ok' ? 'ut-ok-tekst' : 'ut-fout'} role={melding.soort === 'ok' ? 'status' : 'alert'}>
              {melding.tekst}
            </p>
          )}

          {ont && ont.ontvangen.length > 0 && (
            <details className='ut-gh-log' open={ont.ontvangen.length < 6}>
              <summary>{tr(lang, 'Журнал отримання випусків із GitHub', 'Ontvangen releases uit GitHub')} <b>{ont.ontvangen.length}</b></summary>
              <ol>
                {ont.ontvangen.map((o) => (
                  <li key={o.id} data-uitkomst={o.status === 'voorcontrole_ok' ? 'ok' : o.status === 'voorcontrole_mislukt' || o.status === 'geweigerd' || o.status === 'fout' ? 'fout' : undefined}>
                    <time>{datum(lang, o.aangemaaktOp)}</time>
                    <b className='ut-mono'>{o.versie || o.tag}</b>
                    <span>{lang === 'uk' ? o.samenvattingUk : o.samenvattingNl}</span>
                    <small>{o.bron} · {o.status}</small>
                  </li>
                ))}
              </ol>
            </details>
          )}

          <details className='ut-gh-log' open={s.publicaties.length > 0 && s.publicaties.length < 6}>
            <summary>{tr(lang, 'Журнал публікацій', 'Logboek van publicaties')} <b>{s.publicaties.length}</b></summary>
            {s.publicaties.length === 0 ? (
              <p className='ut-leeg'>{tr(lang, 'Ще нічого не публікувалося.', 'Nog niets gepubliceerd.')}</p>
            ) : (
              <ol>
                {s.publicaties.map((p, i) => (
                  <li key={`${p.runId}-${i}`} data-uitkomst={p.uitkomst}>
                    <time>{datum(lang, p.tijd)}</time>
                    <b className='ut-mono'>{p.versie}</b>
                    <span>{p.uitkomst === 'ok' ? <a href={p.url} target='_blank' rel='noopener noreferrer'>{p.repo} · {p.tag}</a> : githubFoutTekst(lang, p.fout)}</span>
                    <small>{p.door === 'automatisch' ? tr(lang, 'автоматично', 'automatisch') : p.door}</small>
                  </li>
                ))}
              </ol>
            )}
          </details>
        </>
      )}
    </section>
  );
}
