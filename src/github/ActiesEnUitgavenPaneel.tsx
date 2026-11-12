// Werkvensters voor CI-werkstromen (Actions: starten, herstarten, annuleren en ingebouwde logboeken)
// en Uitgaven & éénkliks zelfstandige uitrol vanuit de opslagplaats (Releases + Docker Compose / verbonden apparaat).
import { useEffect, useState } from 'react';
import {
  Check, CheckCircle2, Copy, Download, ExternalLink, FileTerminal, GitBranch, Loader2,
  Package, Play, PlayCircle, Plus, RefreshCw, Rocket, RotateCcw, Server, Square, Tag, XCircle,
} from 'lucide-react';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import {
  bouwGithubUitrolRecept,
  type GithubTakInfo,
  type GithubUitgave,
  type GithubWerkstroom,
} from '../../shared/github-werkruimte';
import {
  GhBezig, GhDialoog, GhMelding, ghFoutTekst, ghGeleden, ghGrootte, ghPost, useGhVraag, type Tr,
} from './github-client';

export default function ActiesEnUitgavenPaneel({
  tab,
  repo,
  tr,
}: {
  tab: string;
  repo: string;
  tr: Tr;
}) {
  const [actieFout, setActieFout] = useState('');
  const [actieBezig, setActieBezig] = useState(false);

  // Staten voor CI-werkstromen
  const [startWerkstroom, setStartWerkstroom] = useState<GithubWerkstroom | null>(null);
  const [startRef, setStartRef] = useState('main');
  const [startInvoerTekst, setStartInvoerTekst] = useState('');
  const [logRunId, setLogRunId] = useState<number | null>(null);
  const [logJobId, setLogJobId] = useState<number | null>(null);

  // Staten voor Uitgaven & Uitrol
  const [uitgaveOpen, setUitgaveOpen] = useState(false);
  const [tagNaam, setTagNaam] = useState('');
  const [uitgaveTitel, setUitgaveTitel] = useState('');
  const [uitgaveTekst, setUitgaveTekst] = useState('');
  const [uitgaveDoelTak, setUitgaveDoelTak] = useState('main');
  const [uitgaveConcept, setUitgaveConcept] = useState(false);
  const [uitgaveVooraf, setUitgaveVooraf] = useState(false);
  const [uitgaveAutoNotities, setUitgaveAutoNotities] = useState(true);

  const [uitrolOpen, setUitrolOpen] = useState(false);
  const [uitrolTak, setUitrolTak] = useState('main');
  const [uitrolPoort, setUitrolPoort] = useState(3000);
  const [uitrolApparaatId, setUitrolApparaatId] = useState('');
  const [gekopieerdVeld, setGekopieerdVeld] = useState('');

  useEffect(() => {
    setActieFout('');
    setLogRunId(null);
    setLogJobId(null);
  }, [repo, tab]);

  const takkenVraag = useGhVraag<{ defaultBranch: string; branches: GithubTakInfo[] }>(
    'branches',
    repo ? { repo } : null,
    tr,
    [repo],
  );

  useEffect(() => {
    if (takkenVraag.data?.defaultBranch) {
      setStartRef(takkenVraag.data.defaultBranch);
      setUitgaveDoelTak(takkenVraag.data.defaultBranch);
      setUitrolTak(takkenVraag.data.defaultBranch);
    }
  }, [takkenVraag.data?.defaultBranch]);

  const werkstromenVraag = useGhVraag<{ workflows: GithubWerkstroom[] }>(
    'workflows',
    repo && tab !== 'releases' ? { repo } : null,
    tr,
    [repo, tab],
  );

  const runsVraag = useGhVraag<{
    summary?: { total: number; failing: number };
    runs: Array<{
      id: number;
      name: string;
      status: string;
      conclusion: string | null;
      branch: string;
      event: string;
      sha: string;
      updatedAt: string;
      url: string;
    }>;
  }>('actions', repo && tab !== 'releases' ? { repo } : null, tr, [repo, tab]);

  const logVraag = useGhVraag<{
    run: { id: number; name: string; branch: string; conclusion: string | null; status: string; url: string };
    jobs: Array<{ id: number; name: string; conclusion: string | null; status: string; log?: { tail?: string; missing?: boolean } }>;
    otherJobs: Array<{ id: number; name: string; conclusion: string | null; status: string }>;
  }>(
    'actions/logs',
    repo && logRunId ? { repo, run_id: logRunId, ...(logJobId ? { job_id: logJobId } : {}) } : null,
    tr,
    [repo, logRunId, logJobId],
  );

  const uitgavenVraag = useGhVraag<{ releases: GithubUitgave[] }>(
    'releases',
    repo && tab === 'releases' ? { repo } : null,
    tr,
    [repo, tab],
  );

  const spiegelApparatenVraag = useGhVraag<{ apparaten: Array<{ id: string; name: string; platform: string; online: boolean }> }>(
    'spiegel',
    repo && uitrolOpen ? {} : null,
    tr,
    [repo, uitrolOpen],
  );

  const voerWerkstroomStartUit = async () => {
    if (!startWerkstroom) return;
    setActieBezig(true);
    setActieFout('');
    try {
      const inputs: Record<string, string> = {};
      for (const regel of startInvoerTekst.split('\n')) {
        const idx = regel.indexOf('=');
        if (idx > 0) {
          const sleutel = regel.slice(0, idx).trim();
          const waarde = regel.slice(idx + 1).trim();
          if (sleutel) inputs[sleutel] = waarde;
        }
      }
      const wfBestand = startWerkstroom.path.split('/').pop() || String(startWerkstroom.id);
      await ghPost('workflow/dispatch', {
        repo,
        workflowId: wfBestand,
        ref: startRef,
        inputs,
      });
      emitCanonicalNotice({
        text: tr(`Конвеєр «${startWerkstroom.name}» запущено на гілці ${startRef}`, `Werkstroom «${startWerkstroom.name}» gestart op tak ${startRef}`),
        kind: 'success',
        source: 'github',
      });
      setStartWerkstroom(null);
      setStartInvoerTekst('');
      window.setTimeout(() => runsVraag.herlaad(), 1500);
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setActieBezig(false);
    }
  };

  const beheerRun = async (runId: number, actie: 'rerun' | 'rerun-failed' | 'cancel') => {
    setActieBezig(true);
    setActieFout('');
    try {
      await ghPost('actions/control', { repo, runId, actie });
      emitCanonicalNotice({
        text: tr(`Команду конвеєра виконано (#${runId})`, `Opdracht voor uitvoering #${runId} verstuurd`),
        kind: 'success',
        source: 'github',
      });
      runsVraag.herlaad();
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setActieBezig(false);
    }
  };

  const maakUitgaveAan = async () => {
    setActieBezig(true);
    setActieFout('');
    try {
      const uit = await ghPost<{ release: GithubUitgave }>('release/create', {
        repo,
        tagName: tagNaam.trim(),
        name: uitgaveTitel.trim() || tagNaam.trim(),
        body: uitgaveTekst.trim(),
        targetCommitish: uitgaveDoelTak,
        draft: uitgaveConcept,
        prerelease: uitgaveVooraf,
        generateReleaseNotes: uitgaveAutoNotities,
      });
      emitCanonicalNotice({
        text: tr(`Випуск ${uit.release.tagName} оприлюднено`, `Uitgave ${uit.release.tagName} aangemaakt`),
        kind: 'success',
        source: 'github',
      });
      setUitgaveOpen(false);
      setTagNaam('');
      setUitgaveTitel('');
      setUitgaveTekst('');
      uitgavenVraag.herlaad();
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setActieBezig(false);
    }
  };

  const startUitrolOpApparaat = async () => {
    if (!uitrolApparaatId) return;
    setActieBezig(true);
    setActieFout('');
    try {
      await ghPost('brug/apparaat', {
        repo,
        apparaatId: uitrolApparaatId,
        actie: 'deploy',
        tak: uitrolTak,
        poort: uitrolPoort,
      });
      emitCanonicalNotice({
        text: tr('Запит на розгортання передано на підключений пристрій (підтвердьте дію у сповіщеннях)', 'Uitrolverzoek verstuurd naar het verbonden apparaat (bevestig in uw meldingen)'),
        kind: 'success',
        source: 'github',
        retain: true,
      });
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setActieBezig(false);
    }
  };

  const kopieerTekst = (sleutel: string, tekst: string) => {
    void navigator.clipboard?.writeText(tekst).then(() => {
      setGekopieerdVeld(sleutel);
      window.setTimeout(() => setGekopieerdVeld(''), 1600);
    }).catch(() => undefined);
  };

  if (!repo) {
    return (
      <section className="gh-card">
        <p className="gh-empty">
          {tab === 'releases'
            ? tr('Оберіть сховище вгорі сторінки, щоб керувати випусками та розгортанням.', 'Kies bovenaan een opslagplaats om uitgaven en uitrol te beheren.')
            : tr('Оберіть сховище вгорі сторінки, щоб переглядати й запускати конвеєри дій.', 'Kies bovenaan een opslagplaats om CI-werkstromen te bekijken en te starten.')}
        </p>
      </section>
    );
  }

  // ========================================================================
  // WEERGAVE 1: UITGAVEN & ZELFSTANDIGE UITROL (tab === 'releases')
  // ========================================================================
  if (tab === 'releases') {
    const recept = bouwGithubUitrolRecept({
      repo,
      tak: uitrolTak,
      poort: uitrolPoort,
      eigenHost: typeof location !== 'undefined' ? location.host : '',
    });
    const uitgaven = uitgavenVraag.data?.releases ?? [];
    const takken = takkenVraag.data?.branches ?? [];
    const apparaten = spiegelApparatenVraag.data?.apparaten ?? [];

    return (
      <div className="gh-werkruimte-uitgaven">
        <section className="gh-card gh-werkbalk">
          <div className="gh-werkbalk-groep">
            <h3><Package size={17} /> {tr('Випуски та розгортання', 'Uitgaven en uitrol')}</h3>
            <span className="gh-chip">{uitgaven.length} {tr('випусків', 'uitgaven')}</span>
          </div>
          <div className="gh-werkbalk-groep">
            <button type="button" className="gh-btn" onClick={() => setUitrolOpen(true)}>
              <Rocket size={14} /> {tr('Розгорнути зі сховища', 'Uitrollen vanuit opslagplaats')}
            </button>
            <button type="button" className="gh-btn gh-primary" onClick={() => setUitgaveOpen(true)}>
              <Plus size={14} /> {tr('Створити випуск', 'Uitgave aanmaken')}
            </button>
            <button type="button" className="gh-icon" onClick={uitgavenVraag.herlaad} aria-label={tr('Оновити випуски', 'Uitgaven vernieuwen')} title={tr('Оновити випуски', 'Uitgaven vernieuwen')}>
              <RefreshCw size={15} />
            </button>
          </div>
        </section>

        {actieFout ? <GhMelding soort="error">{actieFout}</GhMelding> : null}

        {uitgavenVraag.fout ? (
          <GhMelding soort="error">{uitgavenVraag.fout}</GhMelding>
        ) : uitgavenVraag.laden ? (
          <GhBezig tr={tr} />
        ) : uitgaven.length === 0 ? (
          <section className="gh-card">
            <p className="gh-empty">{tr('У цьому сховищі ще немає оприлюднених випусків.', 'Deze opslagplaats heeft nog geen gepubliceerde uitgaven.')}</p>
          </section>
        ) : (
          <div className="gh-uitgaven-lijst">
            {uitgaven.map((rel, idx) => (
              <article key={rel.id} className="gh-card gh-uitgave-kaart">
                <header className="gh-detail-head">
                  <div className="gh-zaak-titelrij">
                    <Tag size={16} className="gh-ok" />
                    <h3>{rel.name || rel.tagName}</h3>
                    <code className="gh-chip">{rel.tagName}</code>
                    {idx === 0 && !rel.draft && !rel.prerelease ? (
                      <span className="gh-staat tone-ok">{tr('Найновіший', 'Nieuwste')}</span>
                    ) : null}
                    {rel.prerelease ? <span className="gh-chip gh-chip-warn">{tr('Попередній випуск', 'Vooruitgave')}</span> : null}
                    {rel.draft ? <span className="gh-chip">{tr('Чернетка', 'Concept')}</span> : null}
                  </div>
                  <a className="gh-btn" href={rel.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={14} /> GitHub
                  </a>
                </header>
                <p className="gh-sub">
                  @{rel.author} · {ghGeleden(rel.publishedAt || rel.createdAt, tr)}
                </p>
                {rel.body ? <pre className="gh-readme">{rel.body}</pre> : null}

                {rel.assets.length > 0 ? (
                  <div className="gh-koppel-blok">
                    <h4>{tr('Прикріплені пакунки випуску', 'Bijgevoegde pakketten')} ({rel.assets.length})</h4>
                    <ul className="gh-list">
                      {rel.assets.map((a) => (
                        <li key={a.id}>
                          <a className="gh-item" href={a.downloadUrl} target="_blank" rel="noopener noreferrer">
                            <Download size={15} className="gh-ok" />
                            <span className="gh-item-main">
                              <strong>{a.name}</strong>
                              <span className="gh-sub">
                                {ghGrootte(a.size, tr)} · {tr(`завантажень: ${a.downloadCount}`, `downloads: ${a.downloadCount}`)}
                              </span>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}

        {/* Dialoog: Nieuwe uitgave aanmaken */}
        <GhDialoog
          open={uitgaveOpen}
          titel={tr(`Новий випуск у ${repo}`, `Nieuwe uitgave in ${repo}`)}
          onSluit={() => setUitgaveOpen(false)}
          tr={tr}
        >
          <div className="gh-form">
            <div className="gh-vergelijk-kop">
              <input
                value={tagNaam}
                onChange={(e) => setTagNaam(e.target.value)}
                placeholder={tr('Мітка версії (наприклад, v1.0.0)', 'Versiemarkering (bijv. v1.0.0)')}
                aria-label={tr('Мітка версії', 'Versiemarkering')}
              />
              <label className="gh-veld-inline">
                <span>{tr('Цільова гілка:', 'Doeltak:')}</span>
                <select value={uitgaveDoelTak} onChange={(e) => setUitgaveDoelTak(e.target.value)}>
                  {takken.length === 0 ? <option value={uitgaveDoelTak}>{uitgaveDoelTak}</option> : null}
                  {takken.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>
              </label>
            </div>
            <input
              value={uitgaveTitel}
              onChange={(e) => setUitgaveTitel(e.target.value)}
              placeholder={tr('Назва випуску', 'Titel van de uitgave')}
              aria-label={tr('Назва випуску', 'Titel van de uitgave')}
            />
            <textarea
              rows={5}
              value={uitgaveTekst}
              onChange={(e) => setUitgaveTekst(e.target.value)}
              placeholder={tr('Опис ключових змін випуску…', 'Toelichting bij de wijzigingen in deze uitgave…')}
              aria-label={tr('Опис випуску', 'Beschrijving van de uitgave')}
            />
            <label className="gh-radio">
              <input type="checkbox" checked={uitgaveAutoNotities} onChange={(e) => setUitgaveAutoNotities(e.target.checked)} />
              <span>{tr('Автоматично додати перелік змін із фіксацій на GitHub', 'Automatisch wijzigingsoverzicht uit vastleggingen toevoegen')}</span>
            </label>
            <label className="gh-radio">
              <input type="checkbox" checked={uitgaveVooraf} onChange={(e) => setUitgaveVooraf(e.target.checked)} />
              <span>{tr('Позначити як попередній випуск', 'Markeren als vooruitgave')}</span>
            </label>
            <label className="gh-radio">
              <input type="checkbox" checked={uitgaveConcept} onChange={(e) => setUitgaveConcept(e.target.checked)} />
              <span>{tr('Зберегти як чернетку', 'Opslaan als concept')}</span>
            </label>
            <div className="gh-actions">
              <button
                type="button"
                className="gh-btn gh-primary"
                disabled={actieBezig || !tagNaam.trim()}
                onClick={() => void maakUitgaveAan()}
              >
                {actieBezig ? <Loader2 size={14} className="gh-spin" /> : <Package size={14} />}
                {tr('Оприлюднити випуск', 'Uitgave publiceren')}
              </button>
            </div>
          </div>
        </GhDialoog>

        {/* Dialoog: Zelfstandig of via verbonden apparaat uitrollen */}
        <GhDialoog
          open={uitrolOpen}
          breed
          titel={tr(`Розгортання служби зі сховища ${repo}`, `Dienst uitrollen vanuit ${repo}`)}
          onSluit={() => setUitrolOpen(false)}
          tr={tr}
        >
          <div className="gh-form">
            <p className="gh-sub">
              {tr(
                'Розгорніть це сховище в один натиск на будь-якому вашому підключеному сервері чи комп’ютері або скопіюйте готовий рецепт для повністю незалежного власного обладнання.',
                'Rol deze opslagplaats in één klik uit op een verbonden computer of server, of gebruik het kant-en-klare recept voor volledig eigen apparatuur.',
              )}
            </p>
            <div className="gh-vergelijk-kop">
              <label className="gh-veld-inline">
                <span><GitBranch size={14} /> {tr('Гілка:', 'Tak:')}</span>
                <select value={uitrolTak} onChange={(e) => setUitrolTak(e.target.value)}>
                  {takken.length === 0 ? <option value={uitrolTak}>{uitrolTak}</option> : null}
                  {takken.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>
              </label>
              <label className="gh-veld-inline">
                <span>{tr('Порт служби:', 'Poort:')}</span>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={uitrolPoort}
                  onChange={(e) => setUitrolPoort(Number(e.target.value) || 3000)}
                  style={{ width: 110 }}
                />
              </label>
            </div>

            <div className="gh-koppel-blok">
              <h4><Server size={15} /> {tr('Варіант 1: Розгорнути на підключеному пристрої в 1 натиск', 'Optie 1: In 1 klik uitrollen op verbonden apparaat')}</h4>
              {apparaten.length === 0 ? (
                <p className="gh-sub">{tr('У цьому просторі ще немає підключених комп’ютерів або серверів (розділ З’єднувачі → Пристрої).', 'Nog geen verbonden computers of servers in deze ruimte (zie Verbindingen → Apparaten).')}</p>
              ) : (
                <div className="gh-veld-rij">
                  <select value={uitrolApparaatId} onChange={(e) => setUitrolApparaatId(e.target.value)}>
                    <option value="">{tr('— Оберіть пристрій —', '— Kies een apparaat —')}</option>
                    {apparaten.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.platform}) {a.online ? '●' : '○'}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="gh-btn gh-primary"
                    disabled={actieBezig || !uitrolApparaatId}
                    onClick={() => void startUitrolOpApparaat()}
                  >
                    {actieBezig ? <Loader2 size={14} className="gh-spin" /> : <Rocket size={14} />}
                    {tr('Запустити розгортання', 'Uitrol starten')}
                  </button>
                </div>
              )}
            </div>

            <div className="gh-koppel-blok">
              <div className="gh-detail-head">
                <h4>{tr('Варіант 2: Власне обладнання (docker-compose.yml)', 'Optie 2: Eigen apparatuur (docker-compose.yml)')}</h4>
                <button type="button" className="gh-btn" onClick={() => kopieerTekst('compose', recept.dockerCompose)}>
                  {gekopieerdVeld === 'compose' ? <Check size={14} /> : <Copy size={14} />}
                  {gekopieerdVeld === 'compose' ? tr('Скопійовано', 'Gekopieerd') : tr('Копіювати конфігурацію', 'Configuratie kopiëren')}
                </button>
              </div>
              <pre className="gh-logboek-vak">{recept.dockerCompose}</pre>
              <div className="gh-veld-rij">
                <input readOnly value={recept.opdrachtEigenServer} aria-label={tr('Команда запуску на власному сервері', 'Opdracht voor eigen server')} />
                <button type="button" className="gh-btn" onClick={() => kopieerTekst('cmd', recept.opdrachtEigenServer)}>
                  {gekopieerdVeld === 'cmd' ? <Check size={14} /> : <Copy size={14} />}
                  {gekopieerdVeld === 'cmd' ? tr('Скопійовано', 'Gekopieerd') : tr('Копіювати команду', 'Opdracht kopiëren')}
                </button>
              </div>
            </div>
          </div>
        </GhDialoog>
      </div>
    );
  }

  // ========================================================================
  // WEERGAVE 2: CI-WERKSTROMEN & LOGBOEKEN (tab === 'actions')
  // ========================================================================
  const werkstromen = werkstromenVraag.data?.workflows ?? [];
  const runs = runsVraag.data?.runs ?? [];
  const takken = takkenVraag.data?.branches ?? [];

  return (
    <div className="gh-werkruimte-acties">
      <section className="gh-card">
        <header className="gh-detail-head">
          <h3><PlayCircle size={17} /> {tr('Конвеєри дій сховища', 'Werkstromen van de opslagplaats')} ({werkstromen.length})</h3>
          <button
            type="button"
            className="gh-btn"
            onClick={() => {
              werkstromenVraag.herlaad();
              runsVraag.herlaad();
            }}
          >
            <RefreshCw size={14} /> {tr('Оновити стан', 'Status vernieuwen')}
          </button>
        </header>

        {werkstromenVraag.fout ? (
          <GhMelding soort="error">{werkstromenVraag.fout}</GhMelding>
        ) : werkstromenVraag.laden ? (
          <GhBezig tr={tr} />
        ) : werkstromen.length === 0 ? (
          <p className="gh-sub">{tr('Визначених файлів конвеєрів у .github/workflows не виявлено.', 'Geen werkstromen gevonden onder .github/workflows.')}</p>
        ) : (
          <div className="gh-werkstroom-kaarten">
            {werkstromen.map((wf) => (
              <div key={wf.id} className="gh-subkaart gh-werkstroom-rij">
                <div>
                  <strong>{wf.name}</strong>
                  <div className="gh-sub"><code>{wf.path}</code></div>
                </div>
                <div className="gh-actions">
                  <button type="button" className="gh-btn gh-primary" onClick={() => setStartWerkstroom(wf)}>
                    <Play size={13} /> {tr('Запустити вручну', 'Handmatig starten')}
                  </button>
                  {wf.url ? (
                    <a className="gh-btn" href={wf.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={13} /> GitHub
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {actieFout ? <GhMelding soort="error">{actieFout}</GhMelding> : null}

      <section className="gh-card">
        <header className="gh-detail-head">
          <h3>{tr('Останні виконання конвеєрів', 'Recente uitvoeringen')}</h3>
          {runsVraag.data?.summary ? (
            <span className="gh-sub">
              {tr(
                `Усього: ${runsVraag.data.summary.total} · збійних серед останніх: ${runsVraag.data.summary.failing}`,
                `Totaal: ${runsVraag.data.summary.total} · recent mislukt: ${runsVraag.data.summary.failing}`,
              )}
            </span>
          ) : null}
        </header>

        {runsVraag.fout ? (
          <GhMelding soort="error">{runsVraag.fout}</GhMelding>
        ) : runsVraag.laden ? (
          <GhBezig tr={tr} />
        ) : runs.length === 0 ? (
          <p className="gh-empty">{tr('Запусків конвеєрів ще не було.', 'Nog geen uitvoeringen gevonden.')}</p>
        ) : (
          <ul className="gh-list">
            {runs.map((r) => (
              <li key={r.id} className="gh-item gh-run-rij">
                {r.conclusion === 'success' ? (
                  <CheckCircle2 size={17} className="gh-ok" />
                ) : r.conclusion === 'failure' ? (
                  <XCircle size={17} className="gh-bad" />
                ) : (
                  <PlayCircle size={17} className="gh-muted" />
                )}
                <span className="gh-item-main">
                  <strong>{r.name}</strong>
                  <span className="gh-sub">
                    <code>{r.branch}</code> · {r.event} · <code>{String(r.sha || '').slice(0, 7)}</code> ·{' '}
                    {r.conclusion || r.status} · {ghGeleden(r.updatedAt, tr)}
                  </span>
                </span>
                <div className="gh-actions">
                  <button
                    type="button"
                    className="gh-btn"
                    onClick={() => {
                      setLogJobId(null);
                      setLogRunId(r.id);
                    }}
                  >
                    <FileTerminal size={14} /> {tr('Журнал', 'Logboek')}
                  </button>
                  {r.status !== 'completed' ? (
                    <button
                      type="button"
                      className="gh-btn"
                      disabled={actieBezig}
                      onClick={() => void beheerRun(r.id, 'cancel')}
                    >
                      <Square size={13} /> {tr('Зупинити', 'Stoppen')}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="gh-btn"
                        disabled={actieBezig}
                        onClick={() => void beheerRun(r.id, 'rerun')}
                      >
                        <RotateCcw size={13} /> {tr('Перезапустити', 'Herstarten')}
                      </button>
                      {r.conclusion === 'failure' ? (
                        <button
                          type="button"
                          className="gh-btn"
                          disabled={actieBezig}
                          onClick={() => void beheerRun(r.id, 'rerun-failed')}
                        >
                          <RotateCcw size={13} /> {tr('Лише збійні', 'Alleen mislukte')}
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Dialoog: Handmatig werkstroom starten */}
      <GhDialoog
        open={Boolean(startWerkstroom)}
        titel={startWerkstroom ? tr(`Запуск конвеєра «${startWerkstroom.name}»`, `Werkstroom «${startWerkstroom.name}» starten`) : ''}
        onSluit={() => setStartWerkstroom(null)}
        tr={tr}
      >
        <div className="gh-form">
          <label className="gh-veld-inline">
            <span>{tr('Гілка виконання:', 'Tak voor uitvoering:')}</span>
            <select value={startRef} onChange={(e) => setStartRef(e.target.value)}>
              {takken.length === 0 ? <option value={startRef}>{startRef}</option> : null}
              {takken.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
          </label>
          <label htmlFor="gh-wf-inputs" className="gh-sub">
            {tr('Вхідні параметри workflow_dispatch (необов’язково, по одному на рядок у форматі ключ=значення):', 'Invoerwaarden voor workflow_dispatch (optioneel, één per regel als sleutel=waarde):')}
          </label>
          <textarea
            id="gh-wf-inputs"
            rows={4}
            value={startInvoerTekst}
            onChange={(e) => setStartInvoerTekst(e.target.value)}
            placeholder="omgeving=acceptatie"
            spellCheck={false}
          />
          <div className="gh-actions">
            <button
              type="button"
              className="gh-btn gh-primary"
              disabled={actieBezig}
              onClick={() => void voerWerkstroomStartUit()}
            >
              {actieBezig ? <Loader2 size={14} className="gh-spin" /> : <Play size={14} />}
              {tr('Виконати запуск на GitHub', 'Nu starten op GitHub')}
            </button>
          </div>
        </div>
      </GhDialoog>

      {/* Dialoog: CI-logboek lezen */}
      <GhDialoog
        open={Boolean(logRunId)}
        breed
        titel={tr(`Журнал виконання конвеєра #${logRunId ?? ''}`, `Uitvoeringslogboek #${logRunId ?? ''}`)}
        onSluit={() => setLogRunId(null)}
        tr={tr}
      >
        {logVraag.fout ? (
          <GhMelding soort="error">{logVraag.fout}</GhMelding>
        ) : logVraag.laden || !logVraag.data ? (
          <GhBezig tr={tr} />
        ) : (
          <div className="gh-vergelijk-inhoud">
            <div className="gh-actions">
              {logVraag.data.jobs.concat(logVraag.data.otherJobs as any).map((j) => (
                <button
                  key={j.id}
                  type="button"
                  className={`gh-btn${logJobId === j.id ? ' gh-primary' : ''}`}
                  onClick={() => setLogJobId(j.id)}
                >
                  {j.name} ({j.conclusion || j.status})
                </button>
              ))}
            </div>
            {logVraag.data.jobs.map((j) => (
              <div key={j.id} className="gh-koppel-blok">
                <h4>{j.name}</h4>
                <pre className="gh-logboek-vak">
                  {j.log?.tail || tr('Вивід для цього кроку порожній або недоступний.', 'Geen uitvoer beschikbaar voor deze taak.')}
                </pre>
              </div>
            ))}
          </div>
        )}
      </GhDialoog>
    </div>
  );
}
