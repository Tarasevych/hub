// Ізольоване двостороннє дзеркало (1-в-1 між GitHub та Моїм простором), підписані перехоплювачі подій,
// міст із Дошкою завдань (зі стовпцем «Вхідні» для сторонніх авторів), спільний контекст ШІ та підключені пристрої.
// Geïsoleerde tweerichtingsspiegel, ondertekende gebeurteniskoppelingen, bordbrug en verbonden apparaten.
import { useEffect, useState } from 'react';
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Bot, CheckCircle2, CloudDownload, CloudUpload, FolderGit2,
  GitBranch, KanbanSquare, Laptop, Loader2, Radio, RefreshCw, Rocket, ShieldAlert, ShieldCheck,
  Sparkles, Terminal,
} from 'lucide-react';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import { useIsMaquette } from '../thema/useThema';
import type { GithubSpiegelGebeurtenis, GithubSpiegelRepo } from '../../shared/github-werkruimte';
import {
  GhBezig, GhMelding, ghFoutTekst, ghGeleden, ghPost, useGhVraag, type Tr,
} from './github-client';
import './github-werkstroom-maquette.css';

export default function SpiegelEnBrugPaneel({
  repo,
  tr,
  onKiesRepo,
}: {
  repo: string;
  tr: Tr;
  onKiesRepo?: (fullName: string) => void;
}) {
  const isMaquette = useIsMaquette();
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
  const actieveBordKoppelingen = spiegelRepos.filter((r) => r.bordSync).length;

  return (
    <div className={`gh-werkruimte-spiegel${isMaquette ? ' is-maquette' : ''}`} data-mq-paneel="spiegel">
      {/* Архітектурна шапка ізольованого простору та швидких дій запуску звірки */}
      <section className="gh-card gh-eenklik-held gh-mq-spiegel-held">
        <div className="gh-detail-head">
          <div className="gh-mq-spiegel-koptekst">
            <h3><ShieldCheck size={18} className="gh-ok" /> {tr('Двостороннє дзеркало та екосистема простору', 'Tweerichtingsspiegel en ecosysteem van uw ruimte')}</h3>
            <p className="gh-sub">
              {tr(
                'Кожне сховище у цьому списку віддзеркалюється в ізольованому контурі вашого облікового запису (під захистом правил розмежування рядків бази даних) і доступне для підключених пристроїв та агентів ШІ за вашим дозволом.',
                'Elke opslagplaats wordt gespiegeld binnen de afgeschermde ruimte van uw account (met rijbeveiliging in de database) en werkt samen met uw apparaten en AI-agenten.',
              )}
            </p>
          </div>
          <div className="gh-actions">
            {repo ? (
              <button
                type="button"
                className="gh-btn"
                disabled={Boolean(bezigActie)}
                onClick={() => void synchroniseerNu(repo)}
              >
                {bezigActie === 'sync-enkel' ? <Loader2 size={14} className="gh-spin" /> : <RefreshCw size={14} />}
                {tr('Звірити поточне сховище', 'Gekozen opslagplaats afstemmen')}
              </button>
            ) : null}
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

      {/* Налаштування перехоплювачів подій та пристроїв для обраного сховища */}
      {repo ? (
        <div className="gh-grid">
          <section className="gh-card gh-mq-webhook-kaart" data-webhook-actief={huidigSpiegel?.webhookActief ? 'ja' : 'nee'}>
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

            <div className="gh-subkaart gh-mq-webhook-doos">
              <div className="gh-detail-head">
                <div className="gh-mq-webhook-kop">
                  <div className="gh-mq-webhook-titelrij">
                    <strong>{tr('Миттєві події з GitHub (SHA-256)', 'Directe meldingen vanaf GitHub (SHA-256)')}</strong>
                    <span className={`gh-staat ${huidigSpiegel?.webhookActief ? 'tone-ok' : 'tone-neutraal'}`}>
                      <CheckCircle2 size={13} />
                      {huidigSpiegel?.webhookActief
                        ? tr('Підписаний канал активний', 'Ondertekend kanaal actief')
                        : tr('Вимкнено', 'Uitgeschakeld')}
                    </span>
                  </div>
                  <p className="gh-sub">
                    {tr(
                      'Будь-яка фіксація змін, задача, запит на злиття чи випуск на GitHub одразу оновлює стан на сайті.',
                      'Elke vastlegging, beoordeling of uitgave op GitHub werkt direct de staat op de site bij.',
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
                <div className="gh-mq-endpoint-rij">
                  <code>{huidigSpiegel.webhookUrl}</code>
                </div>
              ) : null}
            </div>

            <label className="gh-radio gh-mq-optie-kaart">
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

            <label className="gh-radio gh-mq-optie-kaart">
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

          {/* Співпраця з підключеними пристроями */}
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
                className="gh-mq-mono-veld"
                value={lokaalPad}
                onChange={(e) => setLokaalPad(e.target.value)}
                placeholder={tr('Шлях до робочої теки на пристрої (наприклад, /srv/projecten/app)', 'Map op het apparaat (bijv. /srv/projecten/app)')}
                aria-label={tr('Локальний шлях на пристрої', 'Lokaal pad op het apparaat')}
              />

              <label className="gh-veld-inline">
                <span><GitBranch size={14} /> {tr('Робоча гілка:', 'Werktak:')}</span>
                <input className="gh-mq-mono-veld" value={actieTak} onChange={(e) => setActieTak(e.target.value)} style={{ maxWidth: 200 }} />
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

      {/* Архітектурна картка зіставлення стовпців Дошки завдань і захисту від сторонніх авторів */}
      <section className="gh-card gh-mq-bord-kaart">
        <header className="gh-detail-head">
          <div>
            <h3><KanbanSquare size={17} /> {tr('Зіставлення стовпців Дошки завдань і карантин зовнішніх карток', 'Kolomkoppeling van het Takenbord en quarantaine voor derden')}</h3>
            <p className="gh-sub">
              {tr(
                `Активних мостів із Дошкою завдань у цьому просторі: ${actieveBordKoppelingen}. Кожен стан задачі GitHub зіставляється з визначеним стовпцем Дошки.`,
                `Actieve bordbruggen in deze ruimte: ${actieveBordKoppelingen}. Elke staat op GitHub correspondeert met een vaste kolom op het Takenbord.`,
              )}
            </p>
          </div>
          <a className="gh-btn" href={canonicalNavigationUrl('mcp', 'board', taal)}>
            <KanbanSquare size={14} /> {tr('Відкрити Дошку завдань', 'Takenbord openen')}
          </a>
        </header>

        <div className="gh-mq-kolom-koppeling">
          <div className="gh-subkaart gh-mq-kolom-tegel is-inkomend">
            <div className="gh-mq-kolom-stroom">
              <code className="gh-chip">GitHub: open</code>
              <ArrowRight size={14} aria-hidden="true" />
              <span className="gh-staat tone-waarschuwing">{tr('Вхідні', 'Inkomend')}</span>
            </div>
            <p className="gh-sub">
              {tr(
                'Нові задачі з перехоплювача подій спершу потрапляють у карантинний стовпець «Вхідні» з позначкою зовнішнього джерела.',
                'Nieuwe vraagstukken vanuit de gebeurteniskoppeling belanden eerst in de aparte kolom «Inkomend» met herkomstmarkering.',
              )}
            </p>
          </div>

          <div className="gh-subkaart gh-mq-kolom-tegel is-actief">
            <div className="gh-mq-kolom-stroom">
              <code className="gh-chip">GitHub: open</code>
              <ArrowRight size={14} aria-hidden="true" />
              <span className="gh-staat tone-ok">{tr('У роботі', 'In uitvoering')}</span>
            </div>
            <p className="gh-sub">
              {tr(
                'Після того як власник бере картку в роботу або переносить задачу вручну, зміни назви й відкритого стану синхронізуються двосторонньо.',
                'Zodra de eigenaar een kaart oppakt of handmatig koppelt, blijven titel en open staat tweerichtings afgestemd.',
              )}
            </p>
          </div>

          <div className="gh-subkaart gh-mq-kolom-tegel is-afgerond">
            <div className="gh-mq-kolom-stroom">
              <code className="gh-chip">GitHub: closed</code>
              <ArrowRight size={14} aria-hidden="true" />
              <span className="gh-staat tone-neutraal">{tr('Виконано', 'Afgerond')}</span>
            </div>
            <p className="gh-sub">
              {tr(
                'Закриття задачі у сховищі автоматично переводить пов’язану картку Дошки до стовпця завершених завдань.',
                'Het sluiten van het vraagstuk in de opslagplaats verplaatst de gekoppelde bordkaart naar de afgeronde kolom.',
              )}
            </p>
          </div>
        </div>

        <div className="gh-mq-derden-waarschuwing" role="note">
          <ShieldAlert size={17} />
          <div>
            <strong>{tr('Захисний бар’єр для вхідних карток від сторонніх авторів', 'Beveiligingsgrens bij inkomende kaarten van externe auteurs')}</strong>
            <p className="gh-sub">
              {tr(
                'Зовнішні звернення з GitHub ніколи не переходять до робочої черги самовільно й позначаються як текст третьої сторони. Від авторів без прав запису у сховищі імпортуються лише заголовок і пряме посилання, щоб унеможливити підміну вказівок для агентів ШІ.',
                'Externe meldingen vanaf GitHub schuiven nooit zelfstandig door naar uw werkwachtrij en dragen een derdenmarkering. Van auteurs zonder schrijfrechten in de opslagplaats worden uitsluitend titel en koppeling overgenomen.',
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Віддзеркалені сховища простору та живий журнал двостороннього обміну */}
      <div className="gh-grid">
        <section className="gh-card">
          <header className="gh-detail-head">
            <h3>{tr('Віддзеркалені сховища простору', 'Gespiegelde opslagplaatsen in deze ruimte')}</h3>
            <span className="gh-chip gh-mq-mono-pil">{spiegelRepos.length}</span>
          </header>
          {overzicht.laden && !overzicht.data ? (
            <GhBezig tr={tr} />
          ) : spiegelRepos.length === 0 ? (
            <p className="gh-empty">{tr('Натисніть «Синхронізувати всі сховища», щоб наповнити локальне дзеркало вашого простору.', 'Klik op «Alle opslagplaatsen synchroniseren» om de spiegel van uw ruimte te vullen.')}</p>
          ) : (
            <ul className="gh-list gh-mq-spiegel-lijst">
              {spiegelRepos.map((sr) => (
                <li key={sr.id}>
                  <button
                    type="button"
                    className={`gh-item gh-item-knop gh-mq-spiegel-rij${sr.fullName === repo ? ' is-actief' : ''}`}
                    onClick={() => onKiesRepo?.(sr.fullName)}
                  >
                    <FolderGit2 size={16} className={sr.webhookActief ? 'gh-ok' : 'gh-muted'} />
                    <span className="gh-item-main">
                      <span className="gh-mq-rij-boven">
                        <strong>{sr.fullName}</strong>
                        {sr.webhookActief ? <span className="gh-chip gh-mq-chip-ok">{tr('живий міст', 'actieve brug')}</span> : null}
                        {sr.bordSync ? <span className="gh-chip">{tr('дошка', 'bord')}</span> : null}
                      </span>
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
          <header className="gh-detail-head">
            <h3>{tr('Живий журнал обміну GitHub ↔ Мій простір', 'Uitwisselingslogboek GitHub ↔ Mijn Ruimte')}</h3>
            <span className="gh-chip gh-mq-mono-pil">{gebeurtenissen.length}</span>
          </header>
          {gebeurtenissen.length === 0 ? (
            <p className="gh-empty">{tr('Подій двостороннього обміну ще немає.', 'Nog geen tweerichtingsgebeurtenissen geregistreerd.')}</p>
          ) : (
            <ul className="gh-list gh-mq-gebeurtenis-lijst">
              {gebeurtenissen.map((ev) => (
                <li key={ev.id} className="gh-item gh-mq-gebeurtenis-rij" data-richting={ev.richting}>
                  <span className={`gh-mq-richting-icoon is-${ev.richting}`}>
                    {ev.richting === 'inkomend' ? (
                      <ArrowDownLeft size={15} className="gh-ok" aria-label={tr('З GitHub на сайт', 'Van GitHub naar site')} />
                    ) : (
                      <ArrowUpRight size={15} className="gh-mq-accent-icoon" aria-label={tr('Із сайту на GitHub', 'Van site naar GitHub')} />
                    )}
                  </span>
                  <span className="gh-item-main">
                    <span className="gh-mq-rij-boven">
                      <strong>{ev.samenvatting}</strong>
                      {ev.soort ? <code className="gh-chip gh-mq-mono-pil">{ev.soort}</code> : null}
                    </span>
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
