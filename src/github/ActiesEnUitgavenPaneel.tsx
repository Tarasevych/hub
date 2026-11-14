// Робочі поверхні конвеєрів дій (запуск, перезапуск, зупинка, етапи та вбудована термінальна консоль журналів)
// і випусків зі швидким автономним розгортанням зі сховища (випуски, контрольні суми SHA-256 та підключені пристрої).
// Werkvensters voor CI-werkstromen en uitgaven met ingebouwd logboekvenster en controlegetallen.
import { useEffect, useState, type ChangeEvent } from 'react';
import {
  Check, CheckCircle2, ChevronDown, ChevronUp, Copy, Download, ExternalLink, FileTerminal, GitBranch,
  Loader2, Maximize2, Package, Play, PlayCircle, Plus, RefreshCw, Rocket, RotateCcw, Server, ShieldCheck,
  Square, Tag, XCircle,
} from 'lucide-react';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import { useIsMaquette } from '../thema/useThema';
import {
  bouwGithubUitrolRecept,
  type GithubTakInfo,
  type GithubUitgave,
  type GithubWerkstroom,
} from '../../shared/github-werkruimte';
import {
  GhBezig, GhDialoog, GhMelding, ghFoutTekst, ghGeleden, ghGrootte, ghPost, useGhVraag, type Tr,
} from './github-client';
import './github-werkstroom-maquette.css';

/** Шукає 64-символьний шістнадцятковий відбиток SHA-256 для конкретного пакунка у нотатках випуску. */
function vindPakketSha256(notities: string, pakketNaam: string): string {
  if (!notities) return '';
  const regels = notities.split(/\r?\n/);
  for (const r of regels) {
    if (pakketNaam && r.includes(pakketNaam)) {
      const m = r.match(/\b([a-fA-F0-9]{64})\b/);
      if (m) return m[1].toLowerCase();
    }
  }
  return '';
}

function archiefSoortLabel(naam: string): string {
  const n = naam.toLowerCase();
  if (n.endsWith('.tar.gz') || n.endsWith('.tgz')) return 'TAR.GZ';
  if (n.endsWith('.tar.xz')) return 'TAR.XZ';
  if (n.endsWith('.zip')) return 'ZIP';
  if (n.endsWith('.sha256') || n.endsWith('.sig')) return 'SHA-256';
  if (n.endsWith('.deb')) return 'DEB';
  if (n.endsWith('.rpm')) return 'RPM';
  const ext = naam.includes('.') ? naam.split('.').pop() || '' : '';
  return ext ? ext.slice(0, 8).toUpperCase() : 'BIN';
}

function runStaatSoort(status: string, conclusion: string | null): 'ok' | 'fout' | 'bezig' | 'neutraal' {
  if (status !== 'completed') return 'bezig';
  if (conclusion === 'success') return 'ok';
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'action_required') return 'fout';
  return 'neutraal';
}

export default function ActiesEnUitgavenPaneel({
  tab,
  repo,
  tr,
}: {
  tab: string;
  repo: string;
  tr: Tr;
}) {
  const isMaquette = useIsMaquette();
  const [actieFout, setActieFout] = useState('');
  const [actieBezig, setActieBezig] = useState(false);

  // Стан конвеєрів дій та перегляду журналів виконання
  const [startWerkstroom, setStartWerkstroom] = useState<GithubWerkstroom | null>(null);
  const [startRef, setStartRef] = useState('main');
  const [startInvoerTekst, setStartInvoerTekst] = useState('');
  const [logRunId, setLogRunId] = useState<number | null>(null);
  const [logJobId, setLogJobId] = useState<number | null>(null);
  const [logDialoogOpen, setLogDialoogOpen] = useState(false);

  // Стан створення випусків, контрольних сум та розгортання
  const [uitgaveOpen, setUitgaveOpen] = useState(false);
  const [tagNaam, setTagNaam] = useState('');
  const [uitgaveTitel, setUitgaveTitel] = useState('');
  const [uitgaveTekst, setUitgaveTekst] = useState('');
  const [uitgaveDoelTak, setUitgaveDoelTak] = useState('main');
  const [uitgaveConcept, setUitgaveConcept] = useState(false);
  const [uitgaveVooraf, setUitgaveVooraf] = useState(false);
  const [uitgaveAutoNotities, setUitgaveAutoNotities] = useState(true);
  const [hashBezig, setHashBezig] = useState(false);

  const [uitrolOpen, setUitrolOpen] = useState(false);
  const [uitrolTak, setUitrolTak] = useState('main');
  const [uitrolPoort, setUitrolPoort] = useState(3000);
  const [uitrolApparaatId, setUitrolApparaatId] = useState('');
  const [gekopieerdVeld, setGekopieerdVeld] = useState('');

  useEffect(() => {
    setActieFout('');
    setLogRunId(null);
    setLogJobId(null);
    setLogDialoogOpen(false);
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

  const berekenBestandSha256 = async (ev: ChangeEvent<HTMLInputElement>) => {
    const bestand = ev.target.files?.[0];
    ev.target.value = '';
    if (!bestand || !globalThis.crypto?.subtle) return;
    setHashBezig(true);
    try {
      const buf = await bestand.arrayBuffer();
      const digest = await globalThis.crypto.subtle.digest('SHA-256', buf);
      const hex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const regel = `${hex}  ${bestand.name}`;
      setUitgaveTekst((vorige) => (vorige.trim() ? `${vorige.trim()}\n${regel}` : `### SHA-256\n${regel}`));
    } catch {
      setActieFout(tr('Не вдалося обчислити контрольну суму обраного файла.', 'Controlegetal van het gekozen bestand kon niet worden berekend.'));
    } finally {
      setHashBezig(false);
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
      <section className={`gh-card${isMaquette ? ' is-maquette' : ''}`} data-mq-paneel="acties">
        <p className="gh-empty">
          {tab === 'releases'
            ? tr('Оберіть сховище вгорі сторінки, щоб керувати випусками та розгортанням.', 'Kies bovenaan een opslagplaats om uitgaven en uitrol te beheren.')
            : tr('Оберіть сховище вгорі сторінки, щоб переглядати й запускати конвеєри дій.', 'Kies bovenaan een opslagplaats om CI-werkstromen te bekijken en te starten.')}
        </p>
      </section>
    );
  }

  // ========================================================================
  // ПОДАННЯ 1: ВИПУСКИ, ПАКУНКИ З КОНТРОЛЬНИМИ СУМАМИ ТА РОЗГОРТАННЯ (releases)
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
      <div className={`gh-werkruimte-uitgaven${isMaquette ? ' is-maquette' : ''}`} data-mq-paneel="acties" data-mq-afdeling="uitgaven">
        <section className="gh-card gh-werkbalk">
          <div className="gh-werkbalk-groep">
            <h3><Package size={17} /> {tr('Випуски та розгортання', 'Uitgaven en uitrol')}</h3>
            <span className="gh-chip gh-mq-mono-pil">{uitgaven.length} {tr('випусків', 'uitgaven')}</span>
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
            {uitgaven.map((rel, idx) => {
              const isNieuwste = idx === 0 && !rel.draft && !rel.prerelease;
              return (
                <article
                  key={rel.id}
                  className={`gh-card gh-uitgave-kaart${isNieuwste ? ' is-nieuwste' : ''}`}
                  data-uitgave-staat={rel.draft ? 'concept' : rel.prerelease ? 'vooraf' : 'stabiel'}
                >
                  <header className="gh-detail-head gh-mq-uitgave-kop">
                    <div className="gh-zaak-titelrij">
                      <span className="gh-mq-tag-pil">
                        <Tag size={14} className="gh-ok" />
                        <code>{rel.tagName}</code>
                      </span>
                      <h3>{rel.name || rel.tagName}</h3>
                      {isNieuwste ? (
                        <span className="gh-staat tone-ok">{tr('Найновіший', 'Nieuwste')}</span>
                      ) : null}
                      {rel.prerelease ? <span className="gh-chip gh-chip-warn">{tr('Попередній випуск', 'Vooruitgave')}</span> : null}
                      {rel.draft ? <span className="gh-chip">{tr('Чернетка', 'Concept')}</span> : null}
                    </div>
                    <a className="gh-btn" href={rel.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={14} /> GitHub
                    </a>
                  </header>

                  <div className="gh-facts">
                    <span className="gh-mq-auteur-pil">@{rel.author}</span>
                    <span>{ghGeleden(rel.publishedAt || rel.createdAt, tr)}</span>
                    <span className="gh-chip gh-mq-mono-pil">{rel.assets.length} {tr('архівів', 'archieven')}</span>
                  </div>

                  {rel.body ? <pre className="gh-readme gh-mq-uitgave-notities" data-no-edge-swipe>{rel.body}</pre> : null}

                  {rel.assets.length > 0 ? (
                    <div className="gh-koppel-blok">
                      <h4><Package size={14} /> {tr('Прикріплені пакунки випуску', 'Bijgevoegde pakketten')} ({rel.assets.length})</h4>
                      <ul className="gh-list gh-mq-archief-lijst">
                        {rel.assets.map((a) => {
                          const sha256 = vindPakketSha256(rel.body, a.name);
                          const sleutelHash = `asset-${a.id}`;
                          return (
                            <li key={a.id} className="gh-mq-archief-rij">
                              <a className="gh-item gh-mq-archief-link" href={a.downloadUrl} target="_blank" rel="noopener noreferrer">
                                <Download size={15} className="gh-ok" />
                                <span className="gh-item-main">
                                  <strong>{a.name}</strong>
                                  <span className="gh-sub gh-mq-archief-meta">
                                    <code className="gh-mq-maat-badge">{ghGrootte(a.size, tr)}</code>
                                    <code className="gh-mq-soort-badge">{archiefSoortLabel(a.name)}</code>
                                    <span>{tr(`завантажень: ${a.downloadCount}`, `gedownload: ${a.downloadCount}`)}</span>
                                  </span>
                                </span>
                              </a>
                              {sha256 ? (
                                <button
                                  type="button"
                                  className="gh-btn gh-mq-hash-knop"
                                  onClick={() => kopieerTekst(sleutelHash, sha256)}
                                  title={`SHA-256: ${sha256}`}
                                >
                                  {gekopieerdVeld === sleutelHash ? <Check size={13} /> : <ShieldCheck size={13} />}
                                  <code>sha256:{sha256.slice(0, 8)}…{sha256.slice(-6)}</code>
                                </button>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {/* Діалог: створення нового випуску з контрольною сумою SHA-256 */}
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
              placeholder={tr('Опис ключових змін та контрольні суми SHA-256…', 'Toelichting bij de wijzigingen en SHA-256-controlegetallen…')}
              aria-label={tr('Опис випуску', 'Beschrijving van de uitgave')}
            />
            <div className="gh-mq-hash-hulprij">
              <label className="gh-btn gh-mq-bestand-etiket">
                {hashBezig ? <Loader2 size={14} className="gh-spin" /> : <ShieldCheck size={14} />}
                <span>{tr('Додати SHA-256 локального пакунка', 'SHA-256 van lokaal pakket toevoegen')}</span>
                <input type="file" hidden disabled={hashBezig} onChange={(e) => void berekenBestandSha256(e)} />
              </label>
              <span className="gh-sub">
                {tr('Обчислюється локально в оглядачі без відправлення файла', 'Lokaal berekend in uw bladeraar')}
              </span>
            </div>
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

        {/* Діалог: розгортання служби зі сховища */}
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
  // ПОДАННЯ 2: КОНВЕЄРИ ДІЙ, ЕТАПИ ВИКОНАННЯ ТА ТЕРМІНАЛЬНІ ЖУРНАЛИ (actions)
  // ========================================================================
  const werkstromen = werkstromenVraag.data?.workflows ?? [];
  const runs = runsVraag.data?.runs ?? [];
  const takken = takkenVraag.data?.branches ?? [];
  const aantalGeslaagd = runs.filter((r) => r.conclusion === 'success').length;
  const aantalBezig = runs.filter((r) => r.status !== 'completed').length;
  const aantalMislukt = runs.filter((r) => r.conclusion === 'failure').length;

  const renderLogboekInhoud = (runId: number) => {
    if (logVraag.fout) return <GhMelding soort="error">{logVraag.fout}</GhMelding>;
    if (logVraag.laden || !logVraag.data) return <GhBezig tr={tr} />;
    const alleTaken = logVraag.data.jobs.concat(logVraag.data.otherJobs as any);

    return (
      <div className="gh-vergelijk-inhoud gh-mq-stappen-blok">
        {alleTaken.length > 0 ? (
          <div className="gh-actions gh-mq-taak-kiezer">
            {alleTaken.map((j) => {
              const jStaat = runStaatSoort(j.status, j.conclusion);
              const isGekozen = logJobId === j.id || (!logJobId && logVraag.data?.jobs[0]?.id === j.id);
              return (
                <button
                  key={j.id}
                  type="button"
                  className={`gh-btn gh-mq-taak-knop${isGekozen ? ' gh-primary' : ''}`}
                  data-run-staat={jStaat}
                  onClick={() => setLogJobId(j.id)}
                >
                  {jStaat === 'ok' ? (
                    <CheckCircle2 size={13} />
                  ) : jStaat === 'fout' ? (
                    <XCircle size={13} />
                  ) : jStaat === 'bezig' ? (
                    <Loader2 size={13} className="gh-spin" />
                  ) : (
                    <PlayCircle size={13} />
                  )}
                  <span>{j.name}</span>
                  <code className="gh-mq-taak-staat">{j.conclusion || j.status}</code>
                </button>
              );
            })}
          </div>
        ) : null}

        {logVraag.data.jobs.map((j) => {
          const logTekst = j.log?.tail || tr('Вивід для цього кроку порожній або недоступний.', 'Geen uitvoer beschikbaar voor deze taak.');
          const kopieSleutel = `log-${runId}-${j.id}`;
          return (
            <div key={j.id} className="gh-mq-terminal-doos">
              <header className="gh-mq-terminal-kop">
                <span className="gh-mq-terminal-stippen" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <strong className="gh-mq-terminal-titel">{j.name}</strong>
                <div className="gh-actions">
                  {j.log?.tail ? (
                    <button
                      type="button"
                      className="gh-btn gh-mq-terminal-knop"
                      onClick={() => kopieerTekst(kopieSleutel, j.log?.tail || '')}
                    >
                      {gekopieerdVeld === kopieSleutel ? <Check size={13} /> : <Copy size={13} />}
                      {gekopieerdVeld === kopieSleutel ? tr('Скопійовано', 'Gekopieerd') : tr('Копіювати вивід', 'Uitvoer kopiëren')}
                    </button>
                  ) : null}
                  {!logDialoogOpen ? (
                    <button
                      type="button"
                      className="gh-btn gh-mq-terminal-knop"
                      onClick={() => setLogDialoogOpen(true)}
                    >
                      <Maximize2 size={13} /> {tr('Широке вікно', 'Groot venster')}
                    </button>
                  ) : null}
                </div>
              </header>
              <pre className="gh-logboek-vak" data-no-edge-swipe>
                {logTekst}
              </pre>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`gh-werkruimte-acties${isMaquette ? ' is-maquette' : ''}`} data-mq-paneel="acties" data-mq-afdeling="werkstromen">
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
              <div key={wf.id} className="gh-subkaart gh-werkstroom-rij" data-wf-staat={wf.state}>
                <div className="gh-mq-wf-hoofd">
                  <span className="gh-mq-wf-tegel" aria-hidden="true">
                    <PlayCircle size={18} />
                  </span>
                  <div className="gh-mq-wf-tekst">
                    <div className="gh-mq-wf-titelrij">
                      <strong>{wf.name}</strong>
                      <span className={`gh-chip ${wf.state === 'active' ? 'gh-mq-chip-ok' : ''}`}>
                        {wf.state === 'active' ? tr('активний', 'actief') : wf.state}
                      </span>
                    </div>
                    <div className="gh-sub"><code>{wf.path}</code></div>
                  </div>
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
          <div className="gh-mq-run-statistiek">
            {runsVraag.data?.summary ? (
              <span className="gh-chip gh-mq-mono-pil">
                {tr(`Усього: ${runsVraag.data.summary.total}`, `Totaal: ${runsVraag.data.summary.total}`)}
              </span>
            ) : null}
            {runs.length > 0 ? (
              <>
                <span className="gh-chip gh-mq-chip-ok">{tr(`Успішно: ${aantalGeslaagd}`, `Geslaagd: ${aantalGeslaagd}`)}</span>
                {aantalBezig > 0 ? (
                  <span className="gh-chip gh-mq-chip-actief">{tr(`Виконується: ${aantalBezig}`, `Bezig: ${aantalBezig}`)}</span>
                ) : null}
                {aantalMislukt > 0 ? (
                  <span className="gh-chip gh-mq-chip-fout">{tr(`Збоїв: ${aantalMislukt}`, `Mislukt: ${aantalMislukt}`)}</span>
                ) : null}
              </>
            ) : null}
          </div>
        </header>

        {runsVraag.fout ? (
          <GhMelding soort="error">{runsVraag.fout}</GhMelding>
        ) : runsVraag.laden ? (
          <GhBezig tr={tr} />
        ) : runs.length === 0 ? (
          <p className="gh-empty">{tr('Запусків конвеєрів ще не було.', 'Nog geen uitvoeringen gevonden.')}</p>
        ) : (
          <ul className="gh-list gh-mq-runs-lijst">
            {runs.map((r) => {
              const staat = runStaatSoort(r.status, r.conclusion);
              const isUitgevouwen = logRunId === r.id && !logDialoogOpen;
              return (
                <li key={r.id} className={`gh-item gh-run-rij${isUitgevouwen ? ' is-uitgevouwen' : ''}`} data-run-staat={staat}>
                  <div className="gh-mq-run-boven">
                    <span className={`gh-mq-run-icoon is-${staat}`}>
                      {staat === 'ok' ? (
                        <CheckCircle2 size={18} className="gh-ok" />
                      ) : staat === 'fout' ? (
                        <XCircle size={18} className="gh-bad" />
                      ) : staat === 'bezig' ? (
                        <Loader2 size={18} className="gh-spin gh-mq-accent-icoon" />
                      ) : (
                        <PlayCircle size={18} className="gh-muted" />
                      )}
                    </span>
                    <span className="gh-item-main">
                      <strong>{r.name}</strong>
                      <span className="gh-sub gh-mq-run-meta">
                        <code className="gh-mq-tak-pil-klein"><GitBranch size={11} /> {r.branch}</code>
                        <span>{r.event}</span>
                        <code className="gh-mq-sha-pil">{String(r.sha || '').slice(0, 7)}</code>
                        <span>{r.conclusion || r.status}</span>
                        <span>{ghGeleden(r.updatedAt, tr)}</span>
                      </span>
                    </span>
                    <div className="gh-actions">
                      <button
                        type="button"
                        className={`gh-btn${isUitgevouwen ? ' gh-primary' : ''}`}
                        aria-expanded={isUitgevouwen}
                        onClick={() => {
                          if (isUitgevouwen) {
                            setLogRunId(null);
                            setLogJobId(null);
                          } else {
                            setLogDialoogOpen(false);
                            setLogJobId(null);
                            setLogRunId(r.id);
                          }
                        }}
                      >
                        <FileTerminal size={14} /> {tr('Журнал', 'Logboek')}
                        {isUitgevouwen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
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
                  </div>

                  {isUitgevouwen ? (
                    <div className="gh-mq-run-uitvouwing">
                      {renderLogboekInhoud(r.id)}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Діалог: ручний запуск конвеєра */}
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

      {/* Діалог: широке термінальне вікно перегляду журналу конвеєра */}
      <GhDialoog
        open={Boolean(logRunId && logDialoogOpen)}
        breed
        titel={tr(`Журнал виконання конвеєра #${logRunId ?? ''}`, `Uitvoeringslogboek #${logRunId ?? ''}`)}
        onSluit={() => setLogDialoogOpen(false)}
        tr={tr}
      >
        {logRunId ? renderLogboekInhoud(logRunId) : null}
      </GhDialoog>
    </div>
  );
}
