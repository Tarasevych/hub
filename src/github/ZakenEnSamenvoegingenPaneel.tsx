// Volledige werkvensters voor Vraagstukken (issues + etiketten + bordbrug) en Samenvoegingsverzoeken
// (pull requests met verschilweergave, CI-controles, beoordelingen en bevestigd samenvoegen).
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, CircleDot, Edit3, ExternalLink, FileDiff, GitBranch, GitMerge,
  GitPullRequest, KanbanSquare, Loader2, MessageSquare, MessageSquarePlus, Plus, RefreshCw,
  Search, ShieldAlert, Tag, XCircle,
} from 'lucide-react';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import type {
  GithubLabelInfo,
  GithubSamenvoegingDetail,
  GithubTakInfo,
  GithubZaakDetail,
} from '../../shared/github-werkruimte';
import {
  DiffWeergave, GhBezig, GhDialoog, GhMelding, ghFoutTekst, ghGeleden, ghPost, useGhVraag,
  type GhZaakRij, type Tr,
} from './github-client';

const STANDAARD_KLEUREN = ['0ea5e9', '10b981', 'f59e0b', 'ef4444', '8b5cf6', 'ec4899', '64748b'];

function ZakenOnderdeel({ repo, tr }: { repo: string; tr: Tr }) {
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed'>('open');
  const [zoekTekst, setZoekTekst] = useState('');
  const [gekozenNr, setGekozenNr] = useState<number | null>(null);

  // Dialogen voor nieuw vraagstuk & etikettenbeheer
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [nieuwTitel, setNieuwTitel] = useState('');
  const [nieuwTekst, setNieuwTekst] = useState('');
  const [actieBezig, setActieBezig] = useState(false);
  const [actieFout, setActieFout] = useState('');

  const [etiketOpen, setEtiketOpen] = useState(false);
  const [etiketNaam, setEtiketNaam] = useState('');
  const [etiketKleur, setEtiketKleur] = useState('0ea5e9');
  const [etiketOmschrijving, setEtiketOmschrijving] = useState('');

  // Detail-bewerking
  const [bewerkOpen, setBewerkOpen] = useState(false);
  const [bewerkTitel, setBewerkTitel] = useState('');
  const [bewerkLijf, setBewerkLijf] = useState('');
  const [reactieTekst, setReactieTekst] = useState('');

  useEffect(() => {
    setGekozenNr(null);
    setActieFout('');
  }, [repo]);

  const lijstVraag = useGhVraag<{ items: GhZaakRij[] }>(
    'issues',
    repo ? { repo, state: statusFilter, kind: 'issue' } : null,
    tr,
    [repo, statusFilter],
  );

  const etikettenVraag = useGhVraag<{ labels: GithubLabelInfo[] }>(
    'labels',
    repo ? { repo } : null,
    tr,
    [repo],
  );

  const detailVraag = useGhVraag<GithubZaakDetail>(
    'issue/detail',
    repo && gekozenNr ? { repo, number: gekozenNr } : null,
    tr,
    [repo, gekozenNr],
  );

  const gefilterd = useMemo(() => {
    const q = zoekTekst.trim().toLowerCase();
    return (lijstVraag.data?.items ?? []).filter((z) => {
      if (!q) return true;
      const lbl = z.labels.map((l) => l.name).join(' ');
      return `${z.number} ${z.title} ${z.author} ${lbl}`.toLowerCase().includes(q);
    });
  }, [lijstVraag.data, zoekTekst]);

  const maakZaak = async () => {
    setActieBezig(true);
    setActieFout('');
    try {
      const uit = await ghPost<{ number: number; url: string }>('issue/create', {
        repo,
        title: nieuwTitel.trim(),
        body: nieuwTekst.trim(),
      });
      emitCanonicalNotice({
        text: tr(`Задачу #${uit.number} створено у ${repo}`, `Vraagstuk #${uit.number} aangemaakt in ${repo}`),
        kind: 'success',
        source: 'github',
      });
      setNieuwTitel('');
      setNieuwTekst('');
      setNieuwOpen(false);
      lijstVraag.herlaad();
      setGekozenNr(uit.number);
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setActieBezig(false);
    }
  };

  const maakEtiket = async () => {
    setActieBezig(true);
    setActieFout('');
    try {
      await ghPost('label/create', {
        repo,
        name: etiketNaam.trim(),
        color: etiketKleur.replace(/^#/, ''),
        description: etiketOmschrijving.trim(),
      });
      setEtiketNaam('');
      setEtiketOmschrijving('');
      etikettenVraag.herlaad();
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setActieBezig(false);
    }
  };

  const werkZaakBij = async (patch: Record<string, unknown>) => {
    if (!gekozenNr) return;
    setActieBezig(true);
    setActieFout('');
    try {
      await ghPost('issue/update', { repo, number: gekozenNr, ...patch });
      setBewerkOpen(false);
      detailVraag.herlaad();
      lijstVraag.herlaad();
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setActieBezig(false);
    }
  };

  const plaatsReactie = async () => {
    if (!gekozenNr || !reactieTekst.trim()) return;
    setActieBezig(true);
    setActieFout('');
    try {
      await ghPost('issue/comment', { repo, number: gekozenNr, body: reactieTekst.trim() });
      setReactieTekst('');
      detailVraag.herlaad();
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setActieBezig(false);
    }
  };

  const stuurNaarBord = async () => {
    if (!gekozenNr) return;
    setActieBezig(true);
    setActieFout('');
    try {
      await ghPost('brug/bord', { repo, number: gekozenNr });
      emitCanonicalNotice({
        text: tr(`Задачу #${gekozenNr} додано й зв’язано з Дошкою завдань`, `Vraagstuk #${gekozenNr} gekoppeld aan het Takenbord`),
        kind: 'success',
        source: 'github',
      });
      detailVraag.herlaad();
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setActieBezig(false);
    }
  };

  if (!repo) {
    return (
      <section className="gh-card">
        <p className="gh-empty">{tr('Оберіть сховище вгорі сторінки, щоб працювати із задачами та мітками.', 'Kies bovenaan een opslagplaats om met vraagstukken en etiketten te werken.')}</p>
      </section>
    );
  }

  if (gekozenNr) {
    const z = detailVraag.data;
    const alleEtiketten = etikettenVraag.data?.labels ?? [];
    const actieveNamen = new Set((z?.labels ?? []).map((l) => l.name));

    return (
      <section className="gh-card gh-werkvenster">
        <header className="gh-detail-head">
          <button type="button" className="gh-btn" onClick={() => setGekozenNr(null)}>
            <ArrowLeft size={14} /> {tr('До списку задач', 'Terug naar vraagstukken')}
          </button>
          <div className="gh-actions">
            <button type="button" className="gh-btn" disabled={actieBezig || !z} onClick={() => void stuurNaarBord()}>
              <KanbanSquare size={14} />
              {z?.bordItemId
                ? tr('Оновити картку на Дошці', 'Bordkaart bijwerken')
                : tr('Перенести на Дошку завдань', 'Naar Takenbord sturen')}
            </button>
            {z ? (
              <a className="gh-btn" href={z.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} /> GitHub
              </a>
            ) : null}
          </div>
        </header>

        {actieFout ? <GhMelding soort="error">{actieFout}</GhMelding> : null}

        {detailVraag.fout ? (
          <GhMelding soort="error">{detailVraag.fout}</GhMelding>
        ) : detailVraag.laden || !z ? (
          <GhBezig tr={tr} />
        ) : (
          <div className="gh-zaak-inhoud">
            <div className="gh-zaak-kop">
              <div className="gh-zaak-titelrij">
                <span className={`gh-staat ${z.state === 'open' ? 'tone-ok' : 'tone-neutraal'}`}>
                  <CircleDot size={14} />
                  {z.state === 'open' ? tr('Відкрита', 'Open') : tr('Закрита', 'Gesloten')}
                </span>
                <h3>#{z.number} · {z.title}</h3>
              </div>
              <p className="gh-sub">
                @{z.author} · {ghGeleden(z.createdAt, tr)}
                {z.bordItemId ? ` · ${tr('Зв’язано з Дошкою завдань', 'Gekoppeld aan Takenbord')}` : ''}
              </p>
            </div>

            {bewerkOpen ? (
              <div className="gh-form gh-subkaart">
                <input
                  value={bewerkTitel}
                  onChange={(e) => setBewerkTitel(e.target.value)}
                  aria-label={tr('Заголовок задачі', 'Titel van vraagstuk')}
                />
                <textarea
                  rows={6}
                  value={bewerkLijf}
                  onChange={(e) => setBewerkLijf(e.target.value)}
                  aria-label={tr('Опис задачі', 'Beschrijving van vraagstuk')}
                />
                <div className="gh-actions">
                  <button
                    type="button"
                    className="gh-btn gh-primary"
                    disabled={actieBezig || bewerkTitel.trim().length < 3}
                    onClick={() => void werkZaakBij({ title: bewerkTitel.trim(), body: bewerkLijf })}
                  >
                    {tr('Зберегти зміни', 'Wijzigingen opslaan')}
                  </button>
                  <button type="button" className="gh-btn" onClick={() => setBewerkOpen(false)}>
                    {tr('Скасувати', 'Annuleren')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="gh-subkaart">
                <pre className="gh-readme">{z.body || tr('Опис не вказано.', 'Geen beschrijving opgegeven.')}</pre>
                <div className="gh-actions">
                  <button
                    type="button"
                    className="gh-btn"
                    onClick={() => {
                      setBewerkTitel(z.title);
                      setBewerkLijf(z.body);
                      setBewerkOpen(true);
                    }}
                  >
                    <Edit3 size={14} /> {tr('Редагувати опис', 'Beschrijving bewerken')}
                  </button>
                  <button
                    type="button"
                    className="gh-btn"
                    disabled={actieBezig}
                    onClick={() => void werkZaakBij({ state: z.state === 'open' ? 'closed' : 'open' })}
                  >
                    {z.state === 'open'
                      ? tr('Закрити задачу', 'Vraagstuk sluiten')
                      : tr('Відкрити знову', 'Opnieuw openen')}
                  </button>
                </div>
              </div>
            )}

            {/* Etiketten snel aan/uit zetten */}
            {alleEtiketten.length > 0 ? (
              <div className="gh-koppel-blok">
                <h4><Tag size={14} /> {tr('Мітки цієї задачі', 'Etiketten van dit vraagstuk')}</h4>
                <div className="gh-labels">
                  {alleEtiketten.map((lbl) => {
                    const aan = actieveNamen.has(lbl.name);
                    return (
                      <button
                        key={lbl.name}
                        type="button"
                        className={`gh-label-knop${aan ? ' is-actief' : ''}`}
                        style={{ borderColor: `#${lbl.color}` }}
                        disabled={actieBezig}
                        onClick={() => {
                          const volgende = aan
                            ? [...actieveNamen].filter((n) => n !== lbl.name)
                            : [...actieveNamen, lbl.name];
                          void werkZaakBij({ labels: volgende });
                        }}
                      >
                        <span className="gh-kleur-stip" style={{ background: `#${lbl.color}` }} />
                        {lbl.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Reacties */}
            <div className="gh-koppel-blok">
              <h4><MessageSquare size={15} /> {tr('Обговорення', 'Gesprek')} ({z.comments.length})</h4>
              {z.comments.length === 0 ? (
                <p className="gh-sub">{tr('Коментарів ще немає.', 'Nog geen reacties.')}</p>
              ) : (
                <ul className="gh-reactie-lijst">
                  {z.comments.map((c) => (
                    <li key={c.id} className="gh-reactie">
                      <header>
                        <strong>@{c.author}</strong>
                        <span className="gh-sub">{ghGeleden(c.createdAt, tr)}</span>
                      </header>
                      <pre className="gh-readme">{c.body}</pre>
                    </li>
                  ))}
                </ul>
              )}

              <div className="gh-form">
                <textarea
                  rows={3}
                  value={reactieTekst}
                  onChange={(e) => setReactieTekst(e.target.value)}
                  placeholder={tr('Напишіть коментар до задачі…', 'Schrijf een reactie op dit vraagstuk…')}
                  aria-label={tr('Текст коментаря', 'Reactietekst')}
                />
                <div className="gh-actions">
                  <button
                    type="button"
                    className="gh-btn gh-primary"
                    disabled={actieBezig || !reactieTekst.trim()}
                    onClick={() => void plaatsReactie()}
                  >
                    {actieBezig ? <Loader2 size={14} className="gh-spin" /> : <MessageSquarePlus size={14} />}
                    {tr('Додати коментар', 'Reactie plaatsen')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="gh-werkruimte-zaken">
      <section className="gh-card gh-werkbalk">
        <div className="gh-werkbalk-groep">
          <div className="gh-segment" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'open'}
              className={statusFilter === 'open' ? 'is-on' : ''}
              onClick={() => setStatusFilter('open')}
            >
              <CircleDot size={14} /> {tr('Відкриті', 'Open')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'closed'}
              className={statusFilter === 'closed' ? 'is-on' : ''}
              onClick={() => setStatusFilter('closed')}
            >
              <CheckCircle2 size={14} /> {tr('Закриті', 'Gesloten')}
            </button>
          </div>

          <label className="gh-search">
            <Search size={14} />
            <input
              value={zoekTekst}
              onChange={(e) => setZoekTekst(e.target.value)}
              placeholder={tr('Пошук серед задач…', 'Zoeken in vraagstukken…')}
              aria-label={tr('Пошук задач', 'Vraagstukken zoeken')}
            />
          </label>
        </div>

        <div className="gh-werkbalk-groep">
          <button type="button" className="gh-btn" onClick={() => setEtiketOpen(true)}>
            <Tag size={14} /> {tr('Мітки', 'Etiketten')} ({etikettenVraag.data?.labels.length ?? 0})
          </button>
          <button type="button" className="gh-btn gh-primary" onClick={() => setNieuwOpen(true)}>
            <Plus size={14} /> {tr('Нова задача', 'Nieuw vraagstuk')}
          </button>
          <button type="button" className="gh-icon" onClick={lijstVraag.herlaad} aria-label={tr('Оновити список задач', 'Lijst vernieuwen')} title={tr('Оновити список задач', 'Lijst vernieuwen')}>
            <RefreshCw size={15} />
          </button>
        </div>
      </section>

      {actieFout ? <GhMelding soort="error">{actieFout}</GhMelding> : null}

      <section className="gh-card">
        {lijstVraag.fout ? (
          <GhMelding soort="error">{lijstVraag.fout}</GhMelding>
        ) : lijstVraag.laden ? (
          <GhBezig tr={tr} />
        ) : gefilterd.length === 0 ? (
          <p className="gh-empty">{tr('Задач за цим фільтром немає.', 'Geen vraagstukken gevonden voor dit filter.')}</p>
        ) : (
          <ul className="gh-list">
            {gefilterd.map((z) => (
              <li key={z.number}>
                <button type="button" className="gh-item gh-item-knop" onClick={() => setGekozenNr(z.number)}>
                  <CircleDot size={16} className={z.state === 'open' ? 'gh-ok' : 'gh-muted'} />
                  <span className="gh-item-main">
                    <strong>#{z.number} {z.title}</strong>
                    <span className="gh-sub">
                      @{z.author} · {ghGeleden(z.updatedAt, tr)}
                      {z.comments ? ` · ${z.comments} 💬` : ''}
                    </span>
                    {z.labels.length > 0 ? (
                      <span className="gh-labels">
                        {z.labels.map((l) => (
                          <span key={l.name} className="gh-label" style={{ borderColor: `#${l.color || '64748b'}` }}>
                            {l.name}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Dialoog: Nieuw vraagstuk */}
      <GhDialoog
        open={nieuwOpen}
        titel={tr(`Нова задача у ${repo}`, `Nieuw vraagstuk in ${repo}`)}
        onSluit={() => setNieuwOpen(false)}
        tr={tr}
      >
        <div className="gh-form">
          <input
            value={nieuwTitel}
            onChange={(e) => setNieuwTitel(e.target.value)}
            placeholder={tr('Короткий і зрозумілий заголовок задачі', 'Korte en duidelijke titel van het vraagstuk')}
            aria-label={tr('Заголовок нової задачі', 'Titel van nieuw vraagstuk')}
          />
          <textarea
            rows={5}
            value={nieuwTekst}
            onChange={(e) => setNieuwTekst(e.target.value)}
            placeholder={tr('Детальний опис, кроки відтворення або очікуваний результат…', 'Uitgebreide beschrijving, stappen of verwacht resultaat…')}
            aria-label={tr('Опис нової задачі', 'Beschrijving van nieuw vraagstuk')}
          />
          <div className="gh-actions">
            <button
              type="button"
              className="gh-btn gh-primary"
              disabled={actieBezig || nieuwTitel.trim().length < 3}
              onClick={() => void maakZaak()}
            >
              {actieBezig ? <Loader2 size={14} className="gh-spin" /> : <Plus size={14} />}
              {tr('Створити задачу на GitHub', 'Vraagstuk aanmaken op GitHub')}
            </button>
          </div>
        </div>
      </GhDialoog>

      {/* Dialoog: Etiketten beheren */}
      <GhDialoog
        open={etiketOpen}
        titel={tr('Мітки сховища', 'Etiketten van de opslagplaats')}
        onSluit={() => setEtiketOpen(false)}
        tr={tr}
      >
        <div className="gh-form">
          <h4>{tr('Створити нову мітку', 'Nieuw etiket aanmaken')}</h4>
          <input
            value={etiketNaam}
            onChange={(e) => setEtiketNaam(e.target.value)}
            placeholder={tr('Назва мітки (наприклад, пріоритет)', 'Etiketnaam (bijvoorbeeld prioriteit)')}
            aria-label={tr('Назва мітки', 'Etiketnaam')}
          />
          <input
            value={etiketOmschrijving}
            onChange={(e) => setEtiketOmschrijving(e.target.value)}
            placeholder={tr('Коротке пояснення (необов’язково)', 'Korte toelichting (optioneel)')}
            aria-label={tr('Пояснення мітки', 'Toelichting van etiket')}
          />
          <div className="gh-kleur-kiezer">
            {STANDAARD_KLEUREN.map((kl) => (
              <button
                key={kl}
                type="button"
                className={`gh-kleur-knop${etiketKleur === kl ? ' is-actief' : ''}`}
                style={{ background: `#${kl}` }}
                onClick={() => setEtiketKleur(kl)}
                aria-label={`#${kl}`}
              />
            ))}
          </div>
          <div className="gh-actions">
            <button
              type="button"
              className="gh-btn gh-primary"
              disabled={actieBezig || !etiketNaam.trim()}
              onClick={() => void maakEtiket()}
            >
              <Plus size={14} /> {tr('Додати мітку', 'Etiket toevoegen')}
            </button>
          </div>
        </div>

        <div className="gh-koppel-blok">
          <h4>{tr('Наявні мітки', 'Bestaande etiketten')}</h4>
          <div className="gh-labels">
            {(etikettenVraag.data?.labels ?? []).map((l) => (
              <span key={l.name} className="gh-label" style={{ borderColor: `#${l.color}` }}>
                <span className="gh-kleur-stip" style={{ background: `#${l.color}` }} /> {l.name}
              </span>
            ))}
          </div>
        </div>
      </GhDialoog>
    </div>
  );
}

function SamenvoegingenOnderdeel({ tab, repo, tr }: { tab: string; repo: string; tr: Tr }) {
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed'>('open');
  const [zoekTekst, setZoekTekst] = useState('');
  const [gekozenNr, setGekozenNr] = useState<number | null>(null);
  const [onderdeel, setOnderdeel] = useState<'gesprek' | 'controles' | 'bestanden'>('gesprek');

  // Nieuw samenvoegingsverzoek
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [basisTak, setBasisTak] = useState('');
  const [kopTak, setKopTak] = useState('');
  const [nieuwTitel, setNieuwTitel] = useState('');
  const [nieuwTekst, setNieuwTekst] = useState('');
  const [alsConcept, setAlsConcept] = useState(false);

  // Beoordeling en samenvoegen
  const [beoordelingTekst, setBeoordelingTekst] = useState('');
  const [beoordelingVorm, setBeoordelingVorm] = useState<'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'>('COMMENT');
  const [samenvoegMethode, setSamenvoegMethode] = useState<'squash' | 'merge' | 'rebase'>('squash');
  const [samenvoegTitel, setSamenvoegTitel] = useState('');
  const [samenvoegBevestigd, setSamenvoegBevestigd] = useState(false);
  const [actieBezig, setActieBezig] = useState(false);
  const [actieFout, setActieFout] = useState('');

  useEffect(() => {
    setGekozenNr(null);
    setActieFout('');
  }, [repo]);

  const lijstVraag = useGhVraag<{ items: GhZaakRij[] }>(
    'issues',
    repo ? { repo, state: statusFilter, kind: 'pr' } : null,
    tr,
    [repo, statusFilter],
  );

  const takkenVraag = useGhVraag<{ defaultBranch: string; branches: GithubTakInfo[] }>(
    'branches',
    repo && nieuwOpen ? { repo } : null,
    tr,
    [repo, nieuwOpen],
  );

  const detailVraag = useGhVraag<GithubSamenvoegingDetail>(
    'pull/detail',
    repo && gekozenNr ? { repo, number: gekozenNr } : null,
    tr,
    [repo, gekozenNr],
  );

  const gefilterd = useMemo(() => {
    const q = zoekTekst.trim().toLowerCase();
    return (lijstVraag.data?.items ?? []).filter((p) => !q || `${p.number} ${p.title} ${p.author}`.toLowerCase().includes(q));
  }, [lijstVraag.data, zoekTekst]);

  const openNieuwDialoog = () => {
    setActieFout('');
    setNieuwTitel('');
    setNieuwTekst('');
    setAlsConcept(false);
    setNieuwOpen(true);
  };

  useEffect(() => {
    if (!nieuwOpen || !takkenVraag.data) return;
    const std = takkenVraag.data.defaultBranch || 'main';
    if (!basisTak) setBasisTak(std);
    if (!kopTak) {
      const ander = takkenVraag.data.branches.find((b) => b.name !== std);
      setKopTak(ander?.name || std);
    }
  }, [nieuwOpen, takkenVraag.data, basisTak, kopTak]);

  const maakSamenvoeging = async () => {
    setActieBezig(true);
    setActieFout('');
    try {
      const uit = await ghPost<{ number: number; url: string }>('pull/create', {
        repo,
        title: nieuwTitel.trim(),
        body: nieuwTekst.trim(),
        base: basisTak,
        head: kopTak,
        draft: alsConcept,
      });
      emitCanonicalNotice({
        text: tr(`Запит на злиття #${uit.number} створено`, `Samenvoegingsverzoek #${uit.number} aangemaakt`),
        kind: 'success',
        source: 'github',
      });
      setNieuwOpen(false);
      lijstVraag.herlaad();
      setGekozenNr(uit.number);
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setActieBezig(false);
    }
  };

  const dienBeoordelingIn = async () => {
    if (!gekozenNr) return;
    setActieBezig(true);
    setActieFout('');
    try {
      await ghPost('pull/review', {
        repo,
        number: gekozenNr,
        event: beoordelingVorm,
        body: beoordelingTekst.trim(),
      });
      setBeoordelingTekst('');
      detailVraag.herlaad();
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setActieBezig(false);
    }
  };

  const voerSamenvoegingUit = async () => {
    const pr = detailVraag.data;
    if (!gekozenNr || !pr) return;
    setActieBezig(true);
    setActieFout('');
    try {
      await ghPost('pull/merge', {
        repo,
        number: gekozenNr,
        mergeMethod: samenvoegMethode,
        commitTitle: samenvoegTitel.trim() || `${pr.title} (#${pr.number})`,
        sha: pr.headSha,
        bevestigd: samenvoegBevestigd,
      });
      emitCanonicalNotice({
        text: tr(`Запит на злиття #${gekozenNr} успішно злито`, `Samenvoegingsverzoek #${gekozenNr} is samengevoegd`),
        kind: 'success',
        source: 'github',
      });
      setSamenvoegBevestigd(false);
      detailVraag.herlaad();
      lijstVraag.herlaad();
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setActieBezig(false);
    }
  };

  if (tab !== 'pulls') return null;

  if (!repo) {
    return (
      <section className="gh-card">
        <p className="gh-empty">{tr('Оберіть сховище вгорі сторінки, щоб працювати із запитами на злиття.', 'Kies bovenaan een opslagplaats om met samenvoegingsverzoeken te werken.')}</p>
      </section>
    );
  }

  if (gekozenNr) {
    const pr = detailVraag.data;
    return (
      <section className="gh-card gh-werkvenster">
        <header className="gh-detail-head">
          <button type="button" className="gh-btn" onClick={() => setGekozenNr(null)}>
            <ArrowLeft size={14} /> {tr('До списку запитів на злиття', 'Terug naar samenvoegingsverzoeken')}
          </button>
          {pr ? (
            <a className="gh-btn" href={pr.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} /> GitHub
            </a>
          ) : null}
        </header>

        {actieFout ? <GhMelding soort="error">{actieFout}</GhMelding> : null}

        {detailVraag.fout ? (
          <GhMelding soort="error">{detailVraag.fout}</GhMelding>
        ) : detailVraag.laden || !pr ? (
          <GhBezig tr={tr} />
        ) : (
          <div className="gh-zaak-inhoud">
            <div className="gh-zaak-kop">
              <div className="gh-zaak-titelrij">
                <span className={`gh-staat ${pr.merged ? 'tone-ok' : pr.state === 'open' ? 'tone-ok' : 'tone-neutraal'}`}>
                  {pr.merged ? <GitMerge size={14} /> : <GitPullRequest size={14} />}
                  {pr.merged
                    ? tr('Злито', 'Samengevoegd')
                    : pr.draft
                      ? tr('Чернетка', 'Concept')
                      : pr.state === 'open'
                        ? tr('Відкрито', 'Open')
                        : tr('Закрито', 'Gesloten')}
                </span>
                <h3>#{pr.number} · {pr.title}</h3>
              </div>
              <div className="gh-facts">
                <span>@{pr.author}</span>
                <span>
                  <GitBranch size={13} /> <code>{pr.headRef}</code> → <code>{pr.baseRef}</code>
                </span>
                <span className="gh-ok">+{pr.additions}</span>
                <span className="gh-bad">−{pr.deletions}</span>
                <span>{pr.changedFiles} {tr('файлів', 'bestanden')}</span>
                <span>{pr.commits} {tr('фіксацій', 'vastleggingen')}</span>
              </div>
            </div>

            <div className="gh-segment" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={onderdeel === 'gesprek'}
                className={onderdeel === 'gesprek' ? 'is-on' : ''}
                onClick={() => setOnderdeel('gesprek')}
              >
                <MessageSquare size={14} /> {tr('Обговорення й рецензії', 'Gesprek en beoordelingen')} ({pr.comments.length + pr.reviews.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={onderdeel === 'controles'}
                className={onderdeel === 'controles' ? 'is-on' : ''}
                onClick={() => setOnderdeel('controles')}
              >
                <CheckCircle2 size={14} /> {tr('Перевірки конвеєра', 'CI-controles')} ({pr.checks.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={onderdeel === 'bestanden'}
                className={onderdeel === 'bestanden' ? 'is-on' : ''}
                onClick={() => setOnderdeel('bestanden')}
              >
                <FileDiff size={14} /> {tr('Змінені файли', 'Gewijzigde bestanden')} ({pr.files.length})
              </button>
            </div>

            {onderdeel === 'gesprek' ? (
              <>
                <div className="gh-subkaart">
                  <pre className="gh-readme">{pr.body || tr('Опис не вказано.', 'Geen toelichting opgegeven.')}</pre>
                </div>

                {pr.reviews.length > 0 ? (
                  <div className="gh-koppel-blok">
                    <h4>{tr('Рецензії', 'Beoordelingen')}</h4>
                    <ul className="gh-reactie-lijst">
                      {pr.reviews.map((rv) => (
                        <li key={rv.id} className="gh-reactie">
                          <header>
                            <strong>@{rv.author}</strong>
                            <span className="gh-chip">{rv.state}</span>
                            <span className="gh-sub">{ghGeleden(rv.submittedAt, tr)}</span>
                          </header>
                          {rv.body ? <pre className="gh-readme">{rv.body}</pre> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {pr.comments.length > 0 ? (
                  <div className="gh-koppel-blok">
                    <h4>{tr('Коментарі', 'Reacties')}</h4>
                    <ul className="gh-reactie-lijst">
                      {pr.comments.map((c) => (
                        <li key={c.id} className="gh-reactie">
                          <header>
                            <strong>@{c.author}</strong>
                            <span className="gh-sub">{ghGeleden(c.createdAt, tr)}</span>
                          </header>
                          <pre className="gh-readme">{c.body}</pre>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Beoordeling plaatsen */}
                <div className="gh-koppel-blok">
                  <h4>{tr('Залишити рецензію або відгук', 'Beoordeling of opmerking plaatsen')}</h4>
                  <div className="gh-form">
                    <div className="gh-keuze-rij">
                      {([
                        ['COMMENT', tr('Залишити зауваження', 'Opmerking plaatsen')],
                        ['APPROVE', tr('Схвалити зміни', 'Wijzigingen goedkeuren')],
                        ['REQUEST_CHANGES', tr('Запросити доопрацювання', 'Aanpassingen vragen')],
                      ] as const).map(([code, naam]) => (
                        <label key={code} className="gh-radio">
                          <input
                            type="radio"
                            name="gh-review-soort"
                            checked={beoordelingVorm === code}
                            onChange={() => setBeoordelingVorm(code)}
                          />
                          <span>{naam}</span>
                        </label>
                      ))}
                    </div>
                    <textarea
                      rows={3}
                      value={beoordelingTekst}
                      onChange={(e) => setBeoordelingTekst(e.target.value)}
                      placeholder={tr('Висновок рецензії або коментар до змін…', 'Toelichting bij uw beoordeling…')}
                      aria-label={tr('Текст рецензії', 'Beoordelingstekst')}
                    />
                    <div className="gh-actions">
                      <button
                        type="button"
                        className="gh-btn gh-primary"
                        disabled={actieBezig || (beoordelingVorm !== 'APPROVE' && !beoordelingTekst.trim())}
                        onClick={() => void dienBeoordelingIn()}
                      >
                        {actieBezig ? <Loader2 size={14} className="gh-spin" /> : <MessageSquarePlus size={14} />}
                        {tr('Надіслати рецензію', 'Beoordeling verzenden')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Gecontroleerd samenvoegen */}
                {pr.state === 'open' && !pr.merged ? (
                  <div className="gh-vastleg-kaart">
                    <h4><GitMerge size={16} /> {tr('Захищене злиття гілок', 'Beveiligd samenvoegen van takken')}</h4>
                    {pr.mergeable === false ? (
                      <GhMelding soort="error">
                        {tr('GitHub повідомляє про конфлікт злиття між гілками. Розв’яжіть конфлікти у вебредакторі або на пристрої.', 'GitHub meldt een samenvoegconflict tussen deze takken. Los het conflict eerst op.')}
                      </GhMelding>
                    ) : null}
                    <div className="gh-form">
                      <label className="gh-veld-inline">
                        <span>{tr('Спосіб злиття:', 'Samenvoegmethode:')}</span>
                        <select
                          value={samenvoegMethode}
                          onChange={(e) => setSamenvoegMethode(e.target.value as 'squash' | 'merge' | 'rebase')}
                        >
                          <option value="squash">{tr('Зі стисненням в одну фіксацію', 'Samenpersen tot één vastlegging')}</option>
                          <option value="merge">{tr('Звичайне злиття зі збереженням історії', 'Samenvoegvastlegging behouden')}</option>
                          <option value="rebase">{tr('Лінійне перенесення фіксацій', 'Lineair herplaatsen')}</option>
                        </select>
                      </label>
                      <input
                        value={samenvoegTitel}
                        onChange={(e) => setSamenvoegTitel(e.target.value)}
                        placeholder={`${pr.title} (#${pr.number})`}
                        aria-label={tr('Заголовок фіксації злиття', 'Titel van samenvoegvastlegging')}
                      />
                      <label className="gh-radio">
                        <input
                          type="checkbox"
                          checked={samenvoegBevestigd}
                          onChange={(e) => setSamenvoegBevestigd(e.target.checked)}
                        />
                        <span>
                          <ShieldAlert size={14} />{' '}
                          {tr(
                            `Підтверджую злиття гілки «${pr.headRef}» у «${pr.baseRef}»`,
                            `Ik bevestig het samenvoegen van «${pr.headRef}» in «${pr.baseRef}»`,
                          )}
                        </span>
                      </label>
                      <div className="gh-actions">
                        <button
                          type="button"
                          className="gh-btn gh-primary"
                          disabled={actieBezig || !samenvoegBevestigd || pr.mergeable === false}
                          onClick={() => void voerSamenvoegingUit()}
                        >
                          {actieBezig ? <Loader2 size={14} className="gh-spin" /> : <GitMerge size={14} />}
                          {tr('Виконати злиття на GitHub', 'Samenvoegen uitvoeren op GitHub')}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : onderdeel === 'controles' ? (
              pr.checks.length === 0 ? (
                <p className="gh-empty">{tr('Для цієї фіксації перевірок конвеєра не знайдено.', 'Geen CI-controles gevonden voor deze vastlegging.')}</p>
              ) : (
                <ul className="gh-list">
                  {pr.checks.map((ch) => (
                    <li key={ch.id} className="gh-item">
                      {ch.conclusion === 'success' ? (
                        <CheckCircle2 size={16} className="gh-ok" />
                      ) : ch.conclusion === 'failure' ? (
                        <XCircle size={16} className="gh-bad" />
                      ) : (
                        <Loader2 size={16} className="gh-muted" />
                      )}
                      <span className="gh-item-main">
                        <strong>{ch.name}</strong>
                        <span className="gh-sub">{ch.conclusion || ch.status}</span>
                      </span>
                      {ch.url ? (
                        <a className="gh-btn" href={ch.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={13} /> {tr('Деталі', 'Details')}
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <div className="gh-vergelijk-inhoud">
                {pr.files.map((f) => (
                  <details key={f.filename} className="gh-diff-bestand" open={pr.files.length <= 5}>
                    <summary>
                      <strong>{f.filename}</strong>
                      <span className="gh-sub">+{f.additions} / −{f.deletions}</span>
                    </summary>
                    <DiffWeergave patch={f.patch} tr={tr} />
                  </details>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="gh-werkruimte-zaken">
      <section className="gh-card gh-werkbalk">
        <div className="gh-werkbalk-groep">
          <div className="gh-segment" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'open'}
              className={statusFilter === 'open' ? 'is-on' : ''}
              onClick={() => setStatusFilter('open')}
            >
              <GitPullRequest size={14} /> {tr('Відкриті', 'Open')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'closed'}
              className={statusFilter === 'closed' ? 'is-on' : ''}
              onClick={() => setStatusFilter('closed')}
            >
              <GitMerge size={14} /> {tr('Закриті та злиті', 'Gesloten en samengevoegd')}
            </button>
          </div>

          <label className="gh-search">
            <Search size={14} />
            <input
              value={zoekTekst}
              onChange={(e) => setZoekTekst(e.target.value)}
              placeholder={tr('Пошук запитів на злиття…', 'Samenvoegingsverzoeken zoeken…')}
              aria-label={tr('Пошук запитів на злиття', 'Samenvoegingsverzoeken zoeken')}
            />
          </label>
        </div>

        <div className="gh-werkbalk-groep">
          <button type="button" className="gh-btn gh-primary" onClick={openNieuwDialoog}>
            <Plus size={14} /> {tr('Новий запит на злиття', 'Nieuw samenvoegingsverzoek')}
          </button>
          <button type="button" className="gh-icon" onClick={lijstVraag.herlaad} aria-label={tr('Оновити запити на злиття', 'Vernieuwen')} title={tr('Оновити запити на злиття', 'Vernieuwen')}>
            <RefreshCw size={15} />
          </button>
        </div>
      </section>

      {actieFout ? <GhMelding soort="error">{actieFout}</GhMelding> : null}

      <section className="gh-card">
        {lijstVraag.fout ? (
          <GhMelding soort="error">{lijstVraag.fout}</GhMelding>
        ) : lijstVraag.laden ? (
          <GhBezig tr={tr} />
        ) : gefilterd.length === 0 ? (
          <p className="gh-empty">{tr('Запитів на злиття за цим фільтром немає.', 'Geen samenvoegingsverzoeken gevonden.')}</p>
        ) : (
          <ul className="gh-list">
            {gefilterd.map((p) => (
              <li key={p.number}>
                <button type="button" className="gh-item gh-item-knop" onClick={() => setGekozenNr(p.number)}>
                  <GitPullRequest size={16} className={p.state === 'open' ? 'gh-ok' : 'gh-muted'} />
                  <span className="gh-item-main">
                    <strong>
                      #{p.number} {p.title}
                      {p.draft ? <span className="gh-chip"> {tr('чернетка', 'concept')}</span> : null}
                    </strong>
                    <span className="gh-sub">
                      @{p.author} · {ghGeleden(p.updatedAt, tr)}
                      {p.comments ? ` · ${p.comments} 💬` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Dialoog: Nieuw samenvoegingsverzoek */}
      <GhDialoog
        open={nieuwOpen}
        titel={tr(`Новий запит на злиття у ${repo}`, `Nieuw samenvoegingsverzoek in ${repo}`)}
        onSluit={() => setNieuwOpen(false)}
        tr={tr}
      >
        <div className="gh-form">
          <div className="gh-vergelijk-kop">
            <label className="gh-veld-inline">
              <span>{tr('Куди зливаємо (база):', 'Doeltak (basis):')}</span>
              <select value={basisTak} onChange={(e) => setBasisTak(e.target.value)}>
                {(takkenVraag.data?.branches ?? []).map((b) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            </label>
            <label className="gh-veld-inline">
              <span>{tr('Звідки зміни (гілка):', 'Brontak (wijzigingen):')}</span>
              <select value={kopTak} onChange={(e) => setKopTak(e.target.value)}>
                {(takkenVraag.data?.branches ?? []).map((b) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            </label>
          </div>
          <input
            value={nieuwTitel}
            onChange={(e) => setNieuwTitel(e.target.value)}
            placeholder={tr('Заголовок запиту на злиття', 'Titel van het samenvoegingsverzoek')}
            aria-label={tr('Заголовок запиту на злиття', 'Titel van het samenvoegingsverzoek')}
          />
          <textarea
            rows={5}
            value={nieuwTekst}
            onChange={(e) => setNieuwTekst(e.target.value)}
            placeholder={tr('Що зроблено, що перевірено та на що звернути увагу…', 'Samenvatting van de wijzigingen en controles…')}
            aria-label={tr('Опис запиту на злиття', 'Beschrijving van het samenvoegingsverzoek')}
          />
          <label className="gh-radio">
            <input type="checkbox" checked={alsConcept} onChange={(e) => setAlsConcept(e.target.checked)} />
            <span>{tr('Створити як чернетку (ще в роботі)', 'Aanmaken als concept (nog in bewerking)')}</span>
          </label>
          <div className="gh-actions">
            <button
              type="button"
              className="gh-btn gh-primary"
              disabled={actieBezig || nieuwTitel.trim().length < 3 || !basisTak || !kopTak || basisTak === kopTak}
              onClick={() => void maakSamenvoeging()}
            >
              {actieBezig ? <Loader2 size={14} className="gh-spin" /> : <GitPullRequest size={14} />}
              {tr('Створити запит на злиття', 'Samenvoegingsverzoek openen')}
            </button>
          </div>
        </div>
      </GhDialoog>
    </div>
  );
}

export default function ZakenEnSamenvoegingenPaneel({ tab, repo, tr }: { tab: string; repo: string; tr: Tr }) {
  if (tab === 'pulls') return <SamenvoegingenOnderdeel tab={tab} repo={repo} tr={tr} />;
  return <ZakenOnderdeel repo={repo} tr={tr} />;
}
