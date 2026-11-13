// Geïsoleerde tweerichtingsspiegel (1-op-1 tussen GitHub en Mijn Ruimte), ondertekende webhooks,
// brug met het Takenbord, gedeelde AI-context en directe samenwerking met verbonden apparaten (agent.mjs).
import { useEffect, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Bot, CheckCircle2, CloudDownload, CloudUpload, FolderGit2,
  GitBranch, KanbanSquare, Laptop, Loader2, Radio, RefreshCw, Rocket, ShieldCheck, Sparkles, Terminal,
} from 'lucide-react';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import type { GithubSpiegelGebeurtenis, GithubSpiegelRepo } from '../../shared/github-werkruimte';
import {
  GhBezig, GhMelding, ghFoutTekst, ghGeleden, ghPost, useGhVraag, type Tr,
} from './github-client';

export default function SpiegelEnBrugPaneel({
  repo,
  tr,
  onKiesRepo,
}: {
  repo: string;
  tr: Tr;
  onKiesRepo?: (fullName: string) => void;
}) {
  const taal: 'uk' | 'nl' = tr('uk', 'nl') === 'uk' ? 'uk' : 'nl';
  const overzicht = useGhVraag<{
    repos: GithubSpiegelRepo[];
    gebeurtenissen: GithubSpiegelGebeurtenis[];
    apparaten: Array<{ id: string; name: string; platform: string; online: boolean }>;
  }>('spiegel', {}, tr, [repo]);

  const huidigSpiegel = (overzicht.data?.repos ?? []).find((r) => r.fullName === repo) ?? null;

  const [apparaatId, setApparaatId] = useState('');
  const [lokaalPad, setLokaalPad] = useState('');
  const [actieTak, setActieTak] = useState('main');
  const [bezigActie, setBezigActie] = useState('');
  const [fout, setFout] = useState('');

  useEffect(() => {
    setApparaatId(huidigSpiegel?.apparaatId || '');
    setLokaalPad(huidigSpiegel?.lokaalPad || '');
    setActieTak(huidigSpiegel?.standaardTak || 'main');
  }, [huidigSpiegel?.fullName, huidigSpiegel?.apparaatId, huidigSpiegel?.lokaalPad, huidigSpiegel?.standaardTak]);

  const synchroniseerNu = async (enkelRepo?: string) => {
    setBezigActie(enkelRepo ? 'sync-enkel' : 'sync-alles');
    setFout('');
    try {
      const uit = await ghPost<{ gesynchroniseerd: number; bordBijgewerkt: number }>(
        'spiegel/sync',
        enkelRepo ? { repo: enkelRepo } : {},
      );
      emitCanonicalNotice({
        text: tr(
          `Дзеркало синхронізовано (${uit.gesynchroniseerd} сховищ, оновлено карток Дошки: ${uit.bordBijgewerkt})`,
          `Spiegel gesynchroniseerd (${uit.gesynchroniseerd} opslagplaatsen, bordkaarten bijgewerkt: ${uit.bordBijgewerkt})`,
        ),
        kind: 'success',
        source: 'github',
      });
      overzicht.herlaad();
    } catch (e) {
      setFout(ghFoutTekst(e, tr));
    } finally {
      setBezigActie('');
    }
  };

  const schakelWebhook = async (actief: boolean) => {
    if (!repo) return;
    setBezigActie('webhook');
    setFout('');
    try {
      await ghPost('spiegel/webhook', { repo, actief });
      emitCanonicalNotice({
        text: actief
          ? tr(`Живий перехоплювач подій увімкнено для ${repo}`, `Directe gebeurteniskoppeling ingeschakeld voor ${repo}`)
          : tr(`Перехоплювач подій вимкнено для ${repo}`, `Gebeurteniskoppeling uitgeschakeld voor ${repo}`),
        kind: 'success',
        source: 'github',
      });
      overzicht.herlaad();
    } catch (e) {
      setFout(ghFoutTekst(e, tr));
    } finally {
      setBezigActie('');
    }
  };

  const slaSpiegelOptiesOp = async (patch: Record<string, unknown>) => {
    if (!repo) return;
    setBezigActie('instellen');
    setFout('');
    try {
      await ghPost('spiegel/instellen', { repo, ...patch });
      overzicht.herlaad();
    } catch (e) {
      setFout(ghFoutTekst(e, tr));
    } finally {
      setBezigActie('');
    }
  };

  const stuurAiContext = async () => {
    if (!repo) return;
    setBezigActie('ai');
    setFout('');
    try {
      await ghPost('brug/ai-context', { repo });
      emitCanonicalNotice({
        text: tr(`Будову та опис ${repo} передано у спільний контекст ШІ вашого простору`, `Opbouw en beschrijving van ${repo} gedeeld met de AI-context van uw ruimte`),
        kind: 'success',
        source: 'github',
      });
      overzicht.herlaad();
    } catch (e) {
      setFout(ghFoutTekst(e, tr));
    } finally {
      setBezigActie('');
    }
  };

  const stuurApparaatOpdracht = async (actie: 'status' | 'pull' | 'push' | 'clone' | 'deploy') => {
    if (!repo) return;
    setBezigActie(`cmd:${actie}`);
    setFout('');
    try {
      await ghPost('brug/apparaat', {
        repo,
        apparaatId,
        lokaalPad,
        actie,
        tak: actieTak,
      });
      emitCanonicalNotice({
        text: tr('Команду надіслано на підключений пристрій (підтвердьте виконання у сповіщеннях)', 'Opdracht verzonden naar het verbonden apparaat (bevestig uitvoering in uw meldingen)'),
        kind: 'success',
        source: 'github',
        retain: true,
      });
      overzicht.herlaad();
    } catch (e) {
      setFout(ghFoutTekst(e, tr));
    } finally {
      setBezigActie('');
    }
  };

  const spiegelRepos = overzicht.data?.repos ?? [];
  const gebeurtenissen = overzicht.data?.gebeurtenissen ?? [];
  const apparaten = overzicht.data?.apparaten ?? [];
  const actieveHooks = spiegelRepos.filter((r) => r.webhookActief).length;

  return (
    <div className="gh-werkruimte-spiegel">
      {/* Samenvattingsstrook van de geïsoleerde ruimte */}
      <section className="gh-card gh-eenklik-held">
        <div className="gh-detail-head">
          <div>
            <h3><ShieldCheck size={18} className="gh-ok" /> {tr('Двостороннє дзеркало та екосистема простору', 'Tweerichtingsspiegel en ecosysteem van uw ruimte')}</h3>
            <p className="gh-sub">
              {tr(
                'Кожне сховище у цьому списку віддзеркалюється в ізольованому контурі вашого облікового запису (під захистом правил розмежування рядків бази даних) і доступне для підключених пристроїв та агентів ШІ за вашим дозволом.',
                'Elke opslagplaats wordt gespiegeld binnen de afgeschermde ruimte van uw account (met rijbeveiliging in de database) en werkt samen met uw apparaten en AI-agenten.',
              )}
            </p>
          </div>
          <div className="gh-actions">
            <button
              type="button"
              className="gh-btn gh-primary"
              disabled={Boolean(bezigActie)}
              onClick={() => void synchroniseerNu()}
            >
              {bezigActie === 'sync-alles' ? <Loader2 size={14} className="gh-spin" /> : <RefreshCw size={14} />}
              {tr('Синхронізувати всі сховища', 'Alle opslagplaatsen synchroniseren')}
            </button>
          </div>
        </div>

        <div className="gh-stat-strook">
          <div className="gh-stat-kaart">
            <strong>{spiegelRepos.length}</strong>
            <span className="gh-sub">{tr('Віддзеркалених сховищ', 'Gespiegelde opslagplaatsen')}</span>
          </div>
          <div className="gh-stat-kaart">
            <strong>{actieveHooks}</strong>
            <span className="gh-sub">{tr('Живих перехоплювачів подій', 'Actieve gebeurteniskoppelingen')}</span>
          </div>
          <div className="gh-stat-kaart">
            <strong>{apparaten.length}</strong>
            <span className="gh-sub">{tr('Підключених пристроїв', 'Verbonden apparaten')}</span>
          </div>
          <div className="gh-stat-kaart">
            <strong>{gebeurtenissen.length}</strong>
            <span className="gh-sub">{tr('Зафіксованих подій обміну', 'Geregistreerde uitwisselingen')}</span>
          </div>
        </div>
      </section>

      {fout ? <GhMelding soort="error">{fout}</GhMelding> : null}
      {overzicht.fout ? <GhMelding soort="error">{overzicht.fout}</GhMelding> : null}

      {/* Instellingen voor de huidig geselecteerde opslagplaats */}
      {repo ? (
        <div className="gh-grid">
          <section className="gh-card">
            <header className="gh-detail-head">
              <h3><Radio size={16} /> {repo} · {tr('Синхронізація 1-в-1', '1-op-1 synchronisatie')}</h3>
              <button
                type="button"
                className="gh-btn"
                disabled={Boolean(bezigActie)}
                onClick={() => void synchroniseerNu(repo)}
              >
                {bezigActie === 'sync-enkel' ? <Loader2 size={14} className="gh-spin" /> : <RefreshCw size={14} />}
                {tr('Оновити це сховище', 'Deze opslagplaats vernieuwen')}
              </button>
            </header>

            <div className="gh-subkaart">
              <div className="gh-detail-head">
                <div>
                  <strong>{tr('Миттєві події з GitHub (HMAC-SHA256)', 'Directe meldingen van GitHub (HMAC-SHA256)')}</strong>
                  <p className="gh-sub">
                    {tr(
                      'Будь-яка фіксація змін, задача, запит на злиття чи випуск на GitHub одразу оновлює стан на сайті.',
                      'Elke vastlegging, wijziging, beoordeling of uitgave op GitHub werkt direct de staat op de site bij.',
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className={`gh-btn ${huidigSpiegel?.webhookActief ? '' : 'gh-primary'}`}
                  disabled={Boolean(bezigActie)}
                  onClick={() => void schakelWebhook(!huidigSpiegel?.webhookActief)}
                >
                  {bezigActie === 'webhook' ? <Loader2 size={14} className="gh-spin" /> : <CheckCircle2 size={14} />}
                  {huidigSpiegel?.webhookActief
                    ? tr('Вимкнути перехоплювач', 'Koppeling uitschakelen')
                    : tr('Увімкнути перехоплювач в 1 натиск', 'In 1 klik inschakelen')}
                </button>
              </div>
              {huidigSpiegel?.webhookActief && huidigSpiegel.webhookUrl ? (
                <p className="gh-sub">
                  <code>{huidigSpiegel.webhookUrl}</code>
                </p>
              ) : null}
            </div>

            <label className="gh-radio">
              <input
                type="checkbox"
                checked={Boolean(huidigSpiegel?.bordSync)}
                disabled={Boolean(bezigActie)}
                onChange={(e) => void slaSpiegelOptiesOp({ bordSync: e.target.checked })}
              />
              <span>
                <KanbanSquare size={14} />{' '}
                {tr('Двосторонньо синхронізувати задачі з Дошкою завдань простору', 'Vraagstukken tweerichtings synchroniseren met het Takenbord')}
              </span>
            </label>

            <label className="gh-radio">
              <input
                type="checkbox"
                checked={Boolean(huidigSpiegel?.aiContextSync)}
                disabled={Boolean(bezigActie)}
                onChange={(e) => void slaSpiegelOptiesOp({ aiContextSync: e.target.checked })}
              />
              <span>
                <Bot size={14} />{' '}
                {tr('Автоматично підтримувати актуальний опис сховища у спільному контексті ШІ', 'Beschrijving en boom automatisch bijhouden in gedeelde AI-context')}
              </span>
            </label>

            <div className="gh-actions">
              <button type="button" className="gh-btn" disabled={Boolean(bezigActie)} onClick={() => void stuurAiContext()}>
                {bezigActie === 'ai' ? <Loader2 size={14} className="gh-spin" /> : <Sparkles size={14} />}
                {tr('Передати у контекст ШІ зараз', 'Nu naar AI-context sturen')}
              </button>
              <a className="gh-btn" href={canonicalNavigationUrl('ai', 'workspace', taal)}>
                <Bot size={14} /> {tr('Відкрити простір ШІ', 'AI-werkruimte openen')}
              </a>
              <a className="gh-btn" href={canonicalNavigationUrl('mcp', 'agents', taal)}>
                {tr('З’єднувачі та агенти', 'Verbindingen en agenten')}
              </a>
            </div>
          </section>

          {/* Samenwerking met verbonden apparaten (agent.mjs) */}
          <section className="gh-card">
            <header className="gh-detail-head">
              <h3><Laptop size={16} /> {tr('Співпраця з підключеними пристроями', 'Samenwerking met verbonden apparaten')}</h3>
            </header>
            <p className="gh-sub">
              {tr(
                'Прив’яжіть сховище до вашого комп’ютера або власного сервера, щоб виконувати команди Git і розгортання прямо з цієї сторінки за вашим підтвердженням.',
                'Koppel de opslagplaats aan uw computer of eigen server om Git-opdrachten en uitrol met uw bevestiging direct vanaf deze pagina uit te voeren.',
              )}
            </p>

            <div className="gh-form">
              <label className="gh-veld-inline">
                <span>{tr('Пристрій:', 'Apparaat:')}</span>
                <select value={apparaatId} onChange={(e) => setApparaatId(e.target.value)}>
                  <option value="">{tr('— Оберіть підключений пристрій —', '— Kies een verbonden apparaat —')}</option>
                  {apparaten.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.platform}) {a.online ? `· ${tr('у мережі', 'verbonden')}` : `· ${tr('поза мережею', 'niet verbonden')}`}
                    </option>
                  ))}
                </select>
              </label>

              <input
                value={lokaalPad}
                onChange={(e) => setLokaalPad(e.target.value)}
                placeholder={tr('Шлях до робочої теки на пристрої (наприклад, /srv/projecten/app)', 'Map op het apparaat (bijv. /srv/projecten/app)')}
                aria-label={tr('Локальний шлях на пристрої', 'Lokaal pad op het apparaat')}
              />

              <label className="gh-veld-inline">
                <span><GitBranch size={14} /> {tr('Робоча гілка:', 'Werktak:')}</span>
                <input value={actieTak} onChange={(e) => setActieTak(e.target.value)} style={{ maxWidth: 200 }} />
              </label>

              <div className="gh-actions">
                <button
                  type="button"
                  className="gh-btn"
                  disabled={Boolean(bezigActie)}
                  onClick={() => void slaSpiegelOptiesOp({ apparaatId, lokaalPad })}
                >
                  {tr('Зберегти прив’язку пристрою', 'Apparaatkoppeling opslaan')}
                </button>
              </div>
            </div>

            <div className="gh-koppel-blok">
              <h4><Terminal size={14} /> {tr('Швидкі команди Git на пристрої', 'Snelle Git-opdrachten op apparaat')}</h4>
              <div className="gh-actions">
                <button type="button" className="gh-btn" disabled={Boolean(bezigActie) || !apparaatId} onClick={() => void stuurApparaatOpdracht('status')}>
                  <Terminal size={14} /> {tr('Стан робочої копії', 'Git-status')}
                </button>
                <button type="button" className="gh-btn" disabled={Boolean(bezigActie) || !apparaatId} onClick={() => void stuurApparaatOpdracht('pull')}>
                  <CloudDownload size={14} /> {tr('Отримати зміни', 'Wijzigingen ophalen')}
                </button>
                <button type="button" className="gh-btn" disabled={Boolean(bezigActie) || !apparaatId} onClick={() => void stuurApparaatOpdracht('push')}>
                  <CloudUpload size={14} /> {tr('Відправити зміни', 'Wijzigingen verzenden')}
                </button>
                <button type="button" className="gh-btn" disabled={Boolean(bezigActie) || !apparaatId} onClick={() => void stuurApparaatOpdracht('clone')}>
                  <FolderGit2 size={14} /> {tr('Клонувати сховище', 'Opslagplaats klonen')}
                </button>
                <button type="button" className="gh-btn gh-primary" disabled={Boolean(bezigActie) || !apparaatId} onClick={() => void stuurApparaatOpdracht('deploy')}>
                  <Rocket size={14} /> {tr('Розгорнути службу', 'Dienst uitrollen')}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {/* Gespiegelde opslagplaatsen & Tweerichtings-gebeurtenissenstroom */}
      <div className="gh-grid">
        <section className="gh-card">
          <h3>{tr('Віддзеркалені сховища простору', 'Gespiegelde opslagplaatsen in deze ruimte')}</h3>
          {overzicht.laden && !overzicht.data ? (
            <GhBezig tr={tr} />
          ) : spiegelRepos.length === 0 ? (
            <p className="gh-empty">{tr('Натисніть «Синхронізувати всі сховища», щоб наповнити локальне дзеркало вашого простору.', 'Klik op «Alle opslagplaatsen synchroniseren» om de spiegel van uw ruimte te vullen.')}</p>
          ) : (
            <ul className="gh-list">
              {spiegelRepos.map((sr) => (
                <li key={sr.id}>
                  <button
                    type="button"
                    className={`gh-item gh-item-knop${sr.fullName === repo ? ' is-actief' : ''}`}
                    onClick={() => onKiesRepo?.(sr.fullName)}
                  >
                    <FolderGit2 size={16} className={sr.webhookActief ? 'gh-ok' : 'gh-muted'} />
                    <span className="gh-item-main">
                      <strong>
                        {sr.fullName}{' '}
                        {sr.webhookActief ? <span className="gh-chip">{tr('живий міст', 'actieve brug')}</span> : null}
                      </strong>
                      <span className="gh-sub">
                        <code>{sr.standaardTak}</code>
                        {sr.laatstGesynchroniseerd ? ` · ${ghGeleden(sr.laatstGesynchroniseerd, tr)}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="gh-card">
          <h3>{tr('Живий журнал обміну GitHub ↔ Мій простір', 'Uitwisselingslogboek GitHub ↔ Mijn Ruimte')}</h3>
          {gebeurtenissen.length === 0 ? (
            <p className="gh-empty">{tr('Подій двостороннього обміну ще немає.', 'Nog geen tweerichtingsgebeurtenissen geregistreerd.')}</p>
          ) : (
            <ul className="gh-list">
              {gebeurtenissen.map((ev) => (
                <li key={ev.id} className="gh-item">
                  {ev.richting === 'inkomend' ? (
                    <ArrowDownLeft size={16} className="gh-ok" aria-label={tr('З GitHub на сайт', 'Van GitHub naar site')} />
                  ) : (
                    <ArrowUpRight size={16} className="gh-muted" aria-label={tr('Із сайту на GitHub', 'Van site naar GitHub')} />
                  )}
                  <span className="gh-item-main">
                    <strong>{ev.samenvatting}</strong>
                    <span className="gh-sub">
                      {ev.fullName} · {ev.richting === 'inkomend' ? tr('Вхідна з GitHub', 'Inkomend van GitHub') : tr('Вихідна дія', 'Uitgaande actie')} · {ghGeleden(ev.aangemaaktOp, tr)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
