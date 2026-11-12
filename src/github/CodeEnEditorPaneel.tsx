// Volledige codeverkenner, takken- en tagbeheer, vastleggingsgeschiedenis, takvergelijking
// en ingebouwde webeditor met directe regel-voor-regel verschilvoorvertoning.
import { useEffect, useMemo, useState } from 'react';
import {
  Check, ChevronRight, Code2, Copy, Edit3, ExternalLink, Eye, FileCode2, FilePlus2,
  Folder, FolderOpen, GitBranch, GitCommit, GitCompare, GitPullRequest, History, Loader2,
  Plus, RefreshCw, Save, Search, Tag, Trash2,
} from 'lucide-react';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import {
  berekenTekstVerschil,
  type GithubBestandInhoud,
  type GithubBoomKnoop,
  type GithubGewijzigdBestand,
  type GithubTagInfo,
  type GithubTakInfo,
} from '../../shared/github-werkruimte';
import {
  DiffWeergave, GhBezig, GhDialoog, GhMelding, ghFoutTekst, ghGeleden, ghGrootte, ghPost, useGhVraag, type Tr,
} from './github-client';

export default function CodeEnEditorPaneel({
  repo,
  tr,
  onOpenPulls,
}: {
  repo: string;
  tr: Tr;
  onOpenPulls?: () => void;
}) {
  const takkenVraag = useGhVraag<{ defaultBranch: string; branches: GithubTakInfo[]; tags: GithubTagInfo[] }>(
    'branches',
    repo ? { repo } : null,
    tr,
    [repo],
  );

  const [gekozenRef, setGekozenRef] = useState('');
  const actieveRef = gekozenRef || takkenVraag.data?.defaultBranch || 'main';
  const [huidigeMap, setHuidigeMap] = useState('');
  const [zoekPad, setZoekPad] = useState('');
  const [gekozenPad, setGekozenPad] = useState('');
  const [hoofdModus, setHoofdModus] = useState<'verkenner' | 'geschiedenis'>('verkenner');
  const [mobielPaneel, setMobielPaneel] = useState<'boom' | 'bestand'>('boom');

  // Webeditor-staat
  const [bewerkModus, setBewerkModus] = useState<'lezen' | 'bewerken' | 'nieuw'>('lezen');
  const [editorTab, setEditorTab] = useState<'code' | 'verschil'>('code');
  const [editorPad, setEditorPad] = useState('');
  const [editorInhoud, setEditorInhoud] = useState('');
  const [vastlegBericht, setVastlegBericht] = useState('');
  const [vastlegDoel, setVastlegDoel] = useState<'direct' | 'nieuwe-tak'>('direct');
  const [nieuweTakNaam, setNieuweTakNaam] = useState('');
  const [maakSamenvoeging, setMaakSamenvoeging] = useState(true);
  const [prTitel, setPrTitel] = useState('');
  const [prTekst, setPrTekst] = useState('');
  const [opslaanBezig, setOpslaanBezig] = useState(false);
  const [actieFout, setActieFout] = useState('');
  const [gekopieerd, setGekopieerd] = useState(false);
  const [regelTerugloop, setRegelTerugloop] = useState(false);

  // Dialogen: takkenbeheer, vergelijken, commitdetail
  const [takDialoog, setTakDialoog] = useState(false);
  const [maakTakNaam, setMaakTakNaam] = useState('');
  const [maakTakBron, setMaakTakBron] = useState('');
  const [takBezig, setTakBezig] = useState(false);

  const [vergelijkOpen, setVergelijkOpen] = useState(false);
  const [vergelijkBasis, setVergelijkBasis] = useState('');
  const [vergelijkKop, setVergelijkKop] = useState('');

  const [gekozenCommitSha, setGekozenCommitSha] = useState('');

  useEffect(() => {
    setGekozenRef('');
    setHuidigeMap('');
    setGekozenPad('');
    setBewerkModus('lezen');
    setActieFout('');
  }, [repo]);

  const boomVraag = useGhVraag<{ ref: string; path: string; truncated: boolean; entries: GithubBoomKnoop[] }>(
    'tree',
    repo ? { repo, ref: actieveRef, recursief: true } : null,
    tr,
    [repo, actieveRef],
  );

  const bestandVraag = useGhVraag<GithubBestandInhoud>(
    'file',
    repo && gekozenPad && bewerkModus !== 'nieuw' ? { repo, ref: actieveRef, path: gekozenPad } : null,
    tr,
    [repo, actieveRef, gekozenPad],
  );

  const readmeVraag = useGhVraag<{ name: string; text: string; truncated: boolean; url: string }>(
    'readme',
    repo && !gekozenPad && bewerkModus === 'lezen' ? { repo } : null,
    tr,
    [repo, gekozenPad, bewerkModus],
  );

  const geschiedenisVraag = useGhVraag<{ commits: Array<{ sha: string; message: string; author: string; login?: string; date: string; url: string }> }>(
    'commits',
    repo && hoofdModus === 'geschiedenis' ? { repo, branch: actieveRef } : null,
    tr,
    [repo, actieveRef, hoofdModus],
  );

  const commitDetailVraag = useGhVraag<{
    sha: string;
    message: string;
    fullMessage: string;
    author: string;
    date: string;
    url: string;
    stats: { additions: number; deletions: number; total: number };
    files: GithubGewijzigdBestand[];
  }>('commit', repo && gekozenCommitSha ? { repo, sha: gekozenCommitSha } : null, tr, [repo, gekozenCommitSha]);

  const vergelijkVraag = useGhVraag<{
    status: string;
    aheadBy: number;
    behindBy: number;
    totalCommits: number;
    url: string;
    commits: Array<{ sha: string; message: string; author: string; date: string }>;
    files: GithubGewijzigdBestand[];
  }>(
    'compare',
    repo && vergelijkOpen && vergelijkBasis && vergelijkKop && vergelijkBasis !== vergelijkKop
      ? { repo, base: vergelijkBasis, head: vergelijkKop }
      : null,
    tr,
    [repo, vergelijkOpen, vergelijkBasis, vergelijkKop],
  );

  // Filter de volledige boom naar de huidige map of een globale bestandszoekopdracht
  const zichtbareKnopen = useMemo(() => {
    const alle = boomVraag.data?.entries ?? [];
    const q = zoekPad.trim().toLowerCase();
    if (q) {
      return alle.filter((k) => k.path.toLowerCase().includes(q)).slice(0, 200);
    }
    const voorvoegsel = huidigeMap ? `${huidigeMap}/` : '';
    return alle
      .filter((k) => {
        if (!voorvoegsel) return !k.path.includes('/');
        if (!k.path.startsWith(voorvoegsel)) return false;
        const rest = k.path.slice(voorvoegsel.length);
        return Boolean(rest) && !rest.includes('/');
      })
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'tree' ? -1 : 1));
  }, [boomVraag.data, huidigeMap, zoekPad]);

  const broodkruimels = useMemo(() => {
    if (!huidigeMap) return [];
    const delen = huidigeMap.split('/');
    return delen.map((naam, idx) => ({ naam, pad: delen.slice(0, idx + 1).join('/') }));
  }, [huidigeMap]);

  const startBewerken = () => {
    if (!bestandVraag.data || bestandVraag.data.binair) return;
    setEditorPad(bestandVraag.data.path);
    setEditorInhoud(bestandVraag.data.inhoud);
    setVastlegBericht(tr(`Оновлено ${bestandVraag.data.name}`, `${bestandVraag.data.name} bijgewerkt`));
    setEditorTab('code');
    setVastlegDoel('direct');
    setNieuweTakNaam(`wijziging/${bestandVraag.data.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}-${Date.now().toString().slice(-4)}`);
    setPrTitel(tr(`Оновлення ${bestandVraag.data.path}`, `Bijwerking van ${bestandVraag.data.path}`));
    setPrTekst('');
    setActieFout('');
    setBewerkModus('bewerken');
    setMobielPaneel('bestand');
  };

  const startNieuwBestand = () => {
    const startPad = huidigeMap ? `${huidigeMap}/` : '';
    setEditorPad(startPad);
    setEditorInhoud('');
    setVastlegBericht(tr('Додано новий файл', 'Nieuw bestand toegevoegd'));
    setEditorTab('code');
    setVastlegDoel('direct');
    setNieuweTakNaam(`nieuw-bestand-${Date.now().toString().slice(-4)}`);
    setPrTitel(tr('Додавання нового файла', 'Nieuw bestand toevoegen'));
    setPrTekst('');
    setActieFout('');
    setBewerkModus('nieuw');
    setMobielPaneel('bestand');
  };

  const voorvertoningVerschil = useMemo(() => {
    if (bewerkModus === 'lezen') return null;
    const oud = bewerkModus === 'bewerken' ? bestandVraag.data?.inhoud || '' : '';
    return berekenTekstVerschil(oud, editorInhoud);
  }, [bewerkModus, bestandVraag.data, editorInhoud]);

  const slaBestandOp = async () => {
    setOpslaanBezig(true);
    setActieFout('');
    try {
      const uit = await ghPost<{
        path: string;
        branch: string;
        commitSha: string;
        commitUrl: string;
        pullNumber?: number;
        pullUrl?: string;
      }>('file/save', {
        repo,
        path: editorPad.trim(),
        content: editorInhoud,
        message: vastlegBericht.trim(),
        branch: actieveRef,
        ...(bewerkModus === 'bewerken' && bestandVraag.data?.sha ? { sha: bestandVraag.data.sha } : {}),
        ...(vastlegDoel === 'nieuwe-tak'
          ? {
              nieuweTak: nieuweTakNaam.trim(),
              maakPr: maakSamenvoeging,
              prTitel: prTitel.trim(),
              prTekst: prTekst.trim(),
            }
          : {}),
      });
      emitCanonicalNotice({
        text: uit.pullNumber
          ? tr(`Збережено у гілку ${uit.branch} та створено запит на злиття #${uit.pullNumber}`, `Opgeslagen in tak ${uit.branch} en samenvoegingsverzoek #${uit.pullNumber} geopend`)
          : tr(`Файл ${uit.path} збережено у гілку ${uit.branch}`, `Bestand ${uit.path} opgeslagen in tak ${uit.branch}`),
        kind: 'success',
        source: 'github',
        retain: true,
      });
      setGekozenRef(uit.branch);
      setGekozenPad(uit.path);
      setBewerkModus('lezen');
      boomVraag.herlaad();
      takkenVraag.herlaad();
      bestandVraag.herlaad();
      if (uit.pullNumber && onOpenPulls) onOpenPulls();
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setOpslaanBezig(false);
    }
  };

  const verwijderBestand = async () => {
    const b = bestandVraag.data;
    if (!b) return;
    if (!window.confirm(tr(`Видалити файл «${b.path}» із гілки «${actieveRef}»?`, `Bestand «${b.path}» verwijderen uit tak «${actieveRef}»?`))) return;
    setOpslaanBezig(true);
    setActieFout('');
    try {
      await ghPost('file/delete', {
        repo,
        path: b.path,
        sha: b.sha,
        branch: actieveRef,
        message: tr(`Видалено файл ${b.path}`, `Bestand ${b.path} verwijderd`),
      });
      emitCanonicalNotice({
        text: tr(`Файл ${b.path} видалено`, `Bestand ${b.path} verwijderd`),
        kind: 'success',
        source: 'github',
      });
      setGekozenPad('');
      boomVraag.herlaad();
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setOpslaanBezig(false);
    }
  };

  const maakTakAan = async () => {
    setTakBezig(true);
    setActieFout('');
    try {
      const bron = maakTakBron || actieveRef;
      const uit = await ghPost<{ branch: string }>('branch/create', { repo, branch: maakTakNaam.trim(), fromRef: bron });
      emitCanonicalNotice({
        text: tr(`Гілку ${uit.branch} створено`, `Tak ${uit.branch} aangemaakt`),
        kind: 'success',
        source: 'github',
      });
      setMaakTakNaam('');
      setGekozenRef(uit.branch);
      takkenVraag.herlaad();
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setTakBezig(false);
    }
  };

  const verwijderTak = async (naam: string) => {
    if (!window.confirm(tr(`Видалити гілку «${naam}» у сховищі ${repo}?`, `Tak «${naam}» verwijderen in ${repo}?`))) return;
    setTakBezig(true);
    setActieFout('');
    try {
      await ghPost('branch/delete', { repo, branch: naam });
      if (actieveRef === naam) setGekozenRef(takkenVraag.data?.defaultBranch || 'main');
      takkenVraag.herlaad();
    } catch (e) {
      setActieFout(ghFoutTekst(e, tr));
    } finally {
      setTakBezig(false);
    }
  };

  const kopieerInhoud = () => {
    if (!bestandVraag.data?.inhoud) return;
    void navigator.clipboard?.writeText(bestandVraag.data.inhoud).then(() => {
      setGekopieerd(true);
      window.setTimeout(() => setGekopieerd(false), 1600);
    }).catch(() => undefined);
  };

  if (!repo) {
    return (
      <section className="gh-card">
        <p className="gh-empty">{tr('Оберіть сховище вгорі сторінки, щоб переглядати дерево файлів, гілки та редагувати код.', 'Kies bovenaan een opslagplaats om de bestandsboom, takken en webeditor te openen.')}</p>
      </section>
    );
  }

  const takken = takkenVraag.data?.branches ?? [];
  const tags = takkenVraag.data?.tags ?? [];

  return (
    <div className="gh-werkruimte-code">
      {/* Werkbalk voor takken, weergavemodus, nieuw bestand en vergelijken */}
      <section className="gh-card gh-werkbalk">
        <div className="gh-werkbalk-groep">
          <label className="gh-select-wikkel" title={tr('Поточна гілка або мітка версії', 'Actieve tak of versiemarkering')}>
            <GitBranch size={15} />
            <select
              value={actieveRef}
              onChange={(e) => {
                setGekozenRef(e.target.value);
                setBewerkModus('lezen');
              }}
              aria-label={tr('Гілка або мітка версії', 'Tak of versiemarkering')}
            >
              {takken.length === 0 ? <option value={actieveRef}>{actieveRef}</option> : null}
              {takken.length > 0 ? (
                <optgroup label={tr('Гілки', 'Takken')}>
                  {takken.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}{b.standaard ? ` (${tr('типова', 'standaard')})` : ''}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {tags.length > 0 ? (
                <optgroup label={tr('Мітки версій', 'Versiemarkeringen')}>
                  {tags.map((t) => (
                    <option key={`tag:${t.name}`} value={t.name}>
                      🏷 {t.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>

          <button
            type="button"
            className="gh-btn"
            onClick={() => {
              setMaakTakBron(actieveRef);
              setTakDialoog(true);
            }}
          >
            <GitBranch size={14} />
            {tr('Гілки', 'Takken')} ({takken.length})
          </button>

          {tags.length > 0 ? (
            <span className="gh-chip">
              <Tag size={12} /> {tags.length} {tr('міток', 'markeringen')}
            </span>
          ) : null}
        </div>

        <div className="gh-werkbalk-groep">
          <div className="gh-segment" role="tablist" aria-label={tr('Режим перегляду коду', 'Codeweergave')}>
            <button
              type="button"
              role="tab"
              aria-selected={hoofdModus === 'verkenner'}
              className={hoofdModus === 'verkenner' ? 'is-on' : ''}
              onClick={() => setHoofdModus('verkenner')}
            >
              <Code2 size={14} /> {tr('Файли й редактор', 'Bestanden en editor')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={hoofdModus === 'geschiedenis'}
              className={hoofdModus === 'geschiedenis' ? 'is-on' : ''}
              onClick={() => setHoofdModus('geschiedenis')}
            >
              <History size={14} /> {tr('Історія фіксацій', 'Geschiedenis')}
            </button>
          </div>

          <button type="button" className="gh-btn" onClick={startNieuwBestand}>
            <FilePlus2 size={14} /> {tr('Новий файл', 'Nieuw bestand')}
          </button>

          <button
            type="button"
            className="gh-btn"
            onClick={() => {
              const std = takkenVraag.data?.defaultBranch || 'main';
              setVergelijkBasis(std);
              setVergelijkKop(actieveRef !== std ? actieveRef : takken.find((t) => t.name !== std)?.name || actieveRef);
              setVergelijkOpen(true);
            }}
          >
            <GitCompare size={14} /> {tr('Порівняти гілки', 'Takken vergelijken')}
          </button>

          <button type="button" className="gh-icon" onClick={() => { boomVraag.herlaad(); takkenVraag.herlaad(); }} aria-label={tr('Оновити дерево коду', 'Codeboom vernieuwen')} title={tr('Оновити дерево коду', 'Codeboom vernieuwen')}>
            <RefreshCw size={15} />
          </button>
        </div>
      </section>

      {actieFout ? <GhMelding soort="error">{actieFout}</GhMelding> : null}

      {hoofdModus === 'geschiedenis' ? (
        <section className="gh-card">
          <header className="gh-detail-head">
            <h3>
              <GitCommit size={17} /> {tr('Журнал фіксацій змін', 'Vastleggingsgeschiedenis')} · <code>{actieveRef}</code>
            </h3>
            <button type="button" className="gh-btn" onClick={geschiedenisVraag.herlaad}>
              <RefreshCw size={14} /> {tr('Оновити', 'Vernieuwen')}
            </button>
          </header>
          {geschiedenisVraag.fout ? (
            <GhMelding soort="error">{geschiedenisVraag.fout}</GhMelding>
          ) : geschiedenisVraag.laden ? (
            <GhBezig tr={tr} />
          ) : (geschiedenisVraag.data?.commits ?? []).length === 0 ? (
            <p className="gh-empty">{tr('У цій гілці ще немає фіксацій змін.', 'Deze tak bevat nog geen vastleggingen.')}</p>
          ) : (
            <ul className="gh-list">
              {(geschiedenisVraag.data?.commits ?? []).map((c) => (
                <li key={c.sha}>
                  <button
                    type="button"
                    className="gh-item gh-item-knop"
                    onClick={() => setGekozenCommitSha(c.sha)}
                  >
                    <GitCommit size={16} className="gh-ok" />
                    <span className="gh-item-main">
                      <strong>{c.message}</strong>
                      <span className="gh-sub">
                        {c.login || c.author} · <code>{c.sha.slice(0, 8)}</code> · {ghGeleden(c.date, tr)}
                      </span>
                    </span>
                    <span className="gh-chip">{tr('Різниця змін', 'Verschil')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          {/* Mobiele schakelaar tussen bestandsboom en geopende editor */}
          <div className="gh-mobiel-wissel">
            <button
              type="button"
              className={`gh-btn${mobielPaneel === 'boom' ? ' gh-primary' : ''}`}
              onClick={() => setMobielPaneel('boom')}
            >
              <Folder size={14} /> {tr('Дерево файлів', 'Bestandsboom')}
            </button>
            <button
              type="button"
              className={`gh-btn${mobielPaneel === 'bestand' ? ' gh-primary' : ''}`}
              onClick={() => setMobielPaneel('bestand')}
            >
              <FileCode2 size={14} /> {gekozenPad ? gekozenPad.split('/').pop() : tr('Перегляд / Редактор', 'Weergave / Editor')}
            </button>
          </div>

          <div className="gh-code-split" data-mobiel-paneel={mobielPaneel}>
            {/* Linkerkolom: bestandsboom */}
            <aside className={`gh-card gh-boom-kolom${mobielPaneel !== 'boom' ? ' is-verborgen-mobiel' : ''}`} aria-label={tr('Провідник файлів сховища', 'Bestandsverkenner')}>
              <label className="gh-search">
                <Search size={14} />
                <input
                  value={zoekPad}
                  onChange={(e) => setZoekPad(e.target.value)}
                  placeholder={tr('Швидкий пошук файла…', 'Bestand snel zoeken…')}
                  aria-label={tr('Пошук файла за шляхом', 'Bestand op pad zoeken')}
                />
              </label>

              {!zoekPad ? (
                <nav className="gh-kruimels" aria-label={tr('Шлях у сховищі', 'Pad in opslagplaats')}>
                  <button
                    type="button"
                    className={`gh-kruimel${!huidigeMap ? ' is-actief' : ''}`}
                    onClick={() => setHuidigeMap('')}
                  >
                    {repo.split('/')[1] || repo}
                  </button>
                  {broodkruimels.map((kr) => (
                    <span key={kr.pad} className="gh-kruimel-stap">
                      <ChevronRight size={13} />
                      <button
                        type="button"
                        className={`gh-kruimel${huidigeMap === kr.pad ? ' is-actief' : ''}`}
                        onClick={() => setHuidigeMap(kr.pad)}
                      >
                        {kr.naam}
                      </button>
                    </span>
                  ))}
                </nav>
              ) : null}

              {boomVraag.fout ? (
                <GhMelding soort="error">{boomVraag.fout}</GhMelding>
              ) : boomVraag.laden && !boomVraag.data ? (
                <GhBezig tr={tr} />
              ) : (
                <ul className="gh-boom-lijst">
                  {huidigeMap && !zoekPad ? (
                    <li>
                      <button
                        type="button"
                        className="gh-boom-rij"
                        onClick={() => {
                          const delen = huidigeMap.split('/');
                          delen.pop();
                          setHuidigeMap(delen.join('/'));
                        }}
                      >
                        <FolderOpen size={15} className="gh-muted" />
                        <span>.. ({tr('рівнем вище', 'map omhoog')})</span>
                      </button>
                    </li>
                  ) : null}
                  {zichtbareKnopen.map((knoop) => (
                    <li key={knoop.path}>
                      <button
                        type="button"
                        className={`gh-boom-rij${gekozenPad === knoop.path ? ' is-actief' : ''}`}
                        onClick={() => {
                          if (knoop.type === 'tree') {
                            setHuidigeMap(knoop.path);
                            setZoekPad('');
                          } else {
                            setGekozenPad(knoop.path);
                            setBewerkModus('lezen');
                            setMobielPaneel('bestand');
                          }
                        }}
                      >
                        {knoop.type === 'tree' ? (
                          <Folder size={15} className="gh-map-icoon" />
                        ) : (
                          <FileCode2 size={15} className="gh-muted" />
                        )}
                        <span className="gh-boom-naam">{zoekPad ? knoop.path : knoop.name}</span>
                        {knoop.type === 'blob' && knoop.size > 0 ? (
                          <span className="gh-boom-maat">{ghGrootte(knoop.size, tr)}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                  {zichtbareKnopen.length === 0 ? (
                    <li className="gh-sub gh-boom-leeg">{tr('Файлів не знайдено.', 'Geen bestanden gevonden.')}</li>
                  ) : null}
                </ul>
              )}
            </aside>

            {/* Rechterkolom: bestandslezer, README of volledige webeditor */}
            <section className={`gh-card gh-bestand-kolom${mobielPaneel !== 'bestand' ? ' is-verborgen-mobiel' : ''}`} aria-label={tr('Робоче вікно файла', 'Werkvenster voor bestand')}>
              <div className="gh-mobiel-terug-rij">
                <button type="button" className="gh-btn" onClick={() => setMobielPaneel('boom')}>
                  <Folder size={14} /> {tr('← До дерева файлів', '← Naar bestandsboom')}
                </button>
                <button
                  type="button"
                  className={`gh-btn${regelTerugloop ? ' gh-primary' : ''}`}
                  onClick={() => setRegelTerugloop((v) => !v)}
                >
                  {tr('Перенос рядків', 'Regelterugloop')}
                </button>
              </div>
              {bewerkModus !== 'lezen' ? (
                <div className="gh-editor-doos">
                  <header className="gh-detail-head">
                    <h3>
                      <Edit3 size={16} />
                      {bewerkModus === 'nieuw'
                        ? tr('Створення нового файла', 'Nieuw bestand aanmaken')
                        : tr('Вебредактор коду', 'Webeditor voor code')}
                    </h3>
                    <div className="gh-segment" role="tablist">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={editorTab === 'code'}
                        className={editorTab === 'code' ? 'is-on' : ''}
                        onClick={() => setEditorTab('code')}
                      >
                        <Code2 size={14} /> {tr('Редактор', 'Editor')}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={editorTab === 'verschil'}
                        className={editorTab === 'verschil' ? 'is-on' : ''}
                        onClick={() => setEditorTab('verschil')}
                      >
                        <Eye size={14} /> {tr('Різниця змін', 'Verschil')}
                        {voorvertoningVerschil ? ` (+${voorvertoningVerschil.erbij} / −${voorvertoningVerschil.eraf})` : ''}
                      </button>
                    </div>
                  </header>

                  <div className="gh-veld">
                    <label htmlFor="gh-editor-pad">{tr('Відносний шлях файла у сховищі', 'Relatief bestandspad in opslagplaats')}</label>
                    <input
                      id="gh-editor-pad"
                      value={editorPad}
                      onChange={(e) => setEditorPad(e.target.value)}
                      placeholder="src/voorbeeld.ts"
                      spellCheck={false}
                    />
                  </div>

                  {editorTab === 'code' ? (
                    <div className="gh-editor-veld-wikkel">
                      <textarea
                        className="gh-code-invoer"
                        value={editorInhoud}
                        onChange={(e) => setEditorInhoud(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab') {
                            e.preventDefault();
                            const el = e.currentTarget;
                            const start = el.selectionStart;
                            const eind = el.selectionEnd;
                            const nieuw = `${editorInhoud.slice(0, start)}  ${editorInhoud.slice(eind)}`;
                            setEditorInhoud(nieuw);
                            window.requestAnimationFrame(() => {
                              el.selectionStart = el.selectionEnd = start + 2;
                            });
                          }
                        }}
                        rows={18}
                        spellCheck={false}
                        aria-label={tr('Вміст файла', 'Bestandsinhoud')}
                      />
                      <div className="gh-editor-voet">
                        <span>{editorInhoud.split('\n').length} {tr('рядків', 'regels')}</span>
                        <span>{ghGrootte(new TextEncoder().encode(editorInhoud).length, tr)}</span>
                      </div>
                    </div>
                  ) : (
                    <DiffWeergave regels={voorvertoningVerschil?.regels ?? []} tr={tr} terugloop={regelTerugloop} />
                  )}

                  <div className="gh-vastleg-kaart">
                    <h4>{tr('Фіксація змін у GitHub', 'Wijzigingen vastleggen op GitHub')}</h4>
                    <input
                      value={vastlegBericht}
                      onChange={(e) => setVastlegBericht(e.target.value)}
                      placeholder={tr('Короткий зміст фіксації змін…', 'Korte omschrijving van de vastlegging…')}
                      aria-label={tr('Повідомлення фіксації змін', 'Vastleggingsboodschap')}
                    />

                    <div className="gh-keuze-rij">
                      <label className="gh-radio">
                        <input
                          type="radio"
                          name="gh-vastleg-doel"
                          checked={vastlegDoel === 'direct'}
                          onChange={() => setVastlegDoel('direct')}
                        />
                        <span>
                          {tr(`Зафіксувати безпосередньо у гілку «${actieveRef}»`, `Rechtstreeks vastleggen in tak «${actieveRef}»`)}
                        </span>
                      </label>
                      <label className="gh-radio">
                        <input
                          type="radio"
                          name="gh-vastleg-doel"
                          checked={vastlegDoel === 'nieuwe-tak'}
                          onChange={() => setVastlegDoel('nieuwe-tak')}
                        />
                        <span>
                          {tr('Створити нову гілку для цих змін (та за бажанням запит на злиття)', 'Nieuwe tak aanmaken voor deze wijziging (met optioneel samenvoegingsverzoek)')}
                        </span>
                      </label>
                    </div>

                    {vastlegDoel === 'nieuwe-tak' ? (
                      <div className="gh-form">
                        <input
                          value={nieuweTakNaam}
                          onChange={(e) => setNieuweTakNaam(e.target.value)}
                          placeholder={tr('Назва нової гілки (наприклад, tak/verbetering)', 'Naam van de nieuwe tak')}
                          aria-label={tr('Назва нової гілки', 'Naam van de nieuwe tak')}
                        />
                        <label className="gh-radio">
                          <input
                            type="checkbox"
                            checked={maakSamenvoeging}
                            onChange={(e) => setMaakSamenvoeging(e.target.checked)}
                          />
                          <span>
                            <GitPullRequest size={14} /> {tr('Одразу відкрити запит на злиття у гілку', 'Direct een samenvoegingsverzoek openen naar')} <code>{actieveRef}</code>
                          </span>
                        </label>
                        {maakSamenvoeging ? (
                          <>
                            <input
                              value={prTitel}
                              onChange={(e) => setPrTitel(e.target.value)}
                              placeholder={tr('Заголовок запиту на злиття', 'Titel van het samenvoegingsverzoek')}
                              aria-label={tr('Заголовок запиту на злиття', 'Titel van het samenvoegingsverzoek')}
                            />
                            <textarea
                              rows={3}
                              value={prTekst}
                              onChange={(e) => setPrTekst(e.target.value)}
                              placeholder={tr('Опис змін для рецензії (необов’язково)', 'Toelichting bij het samenvoegingsverzoek (optioneel)')}
                              aria-label={tr('Опис запиту на злиття', 'Beschrijving van het samenvoegingsverzoek')}
                            />
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="gh-actions">
                      <button
                        type="button"
                        className="gh-btn gh-primary"
                        disabled={opslaanBezig || !editorPad.trim() || vastlegBericht.trim().length < 2}
                        onClick={() => void slaBestandOp()}
                      >
                        {opslaanBezig ? <Loader2 size={14} className="gh-spin" /> : <Save size={14} />}
                        {tr('Зберегти та зафіксувати на GitHub', 'Opslaan en vastleggen op GitHub')}
                      </button>
                      <button
                        type="button"
                        className="gh-btn"
                        disabled={opslaanBezig}
                        onClick={() => setBewerkModus('lezen')}
                      >
                        {tr('Скасувати', 'Annuleren')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : gekozenPad ? (
                bestandVraag.fout ? (
                  <GhMelding soort="error">{bestandVraag.fout}</GhMelding>
                ) : bestandVraag.laden || !bestandVraag.data ? (
                  <GhBezig tr={tr} />
                ) : (
                  <div className="gh-bestand-lezer">
                    <header className="gh-detail-head">
                      <div>
                        <h3>{bestandVraag.data.path}</h3>
                        <span className="gh-sub">
                          {ghGrootte(bestandVraag.data.size, tr)}
                          {!bestandVraag.data.binair ? ` · ${bestandVraag.data.inhoud.split('\n').length} ${tr('рядків', 'regels')}` : ''}
                          {' · '}
                          <code>{bestandVraag.data.sha.slice(0, 8)}</code>
                        </span>
                      </div>
                      <div className="gh-actions">
                        {!bestandVraag.data.binair ? (
                          <>
                            <button
                              type="button"
                              className={`gh-btn${regelTerugloop ? ' gh-primary' : ''}`}
                              onClick={() => setRegelTerugloop((v) => !v)}
                            >
                              {tr('Перенос', 'Terugloop')}
                            </button>
                            <button type="button" className="gh-btn" onClick={kopieerInhoud}>
                              {gekopieerd ? <Check size={14} /> : <Copy size={14} />}
                              {gekopieerd ? tr('Скопійовано', 'Gekopieerd') : tr('Копіювати', 'Kopiëren')}
                            </button>
                            <button type="button" className="gh-btn gh-primary" onClick={startBewerken}>
                              <Edit3 size={14} /> {tr('Редагувати', 'Bewerken')}
                            </button>
                          </>
                        ) : null}
                        <button type="button" className="gh-btn" disabled={opslaanBezig} onClick={() => void verwijderBestand()}>
                          <Trash2 size={14} /> {tr('Видалити', 'Verwijderen')}
                        </button>
                        {bestandVraag.data.htmlUrl ? (
                          <a className="gh-btn" href={bestandVraag.data.htmlUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink size={14} /> GitHub
                          </a>
                        ) : null}
                      </div>
                    </header>

                    {bestandVraag.data.binair ? (
                      <p className="gh-sub">{tr('Це двійковий файл. Його можна завантажити або переглянути безпосередньо на GitHub.', 'Dit is een binair bestand. U kunt het rechtstreeks op GitHub bekijken of downloaden.')}</p>
                    ) : (
                      <div className="gh-code-tabel-wikkel" data-no-edge-swipe>
                        <table className={`gh-code-tabel${regelTerugloop ? ' is-terugloop' : ''}`}>
                          <tbody>
                            {bestandVraag.data.inhoud.split('\n').map((regel, idx) => (
                              <tr key={idx}>
                                <td className="gh-code-nr">{idx + 1}</td>
                                <td className="gh-code-regel">{regel || ' '}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              ) : readmeVraag.laden ? (
                <GhBezig tr={tr} />
              ) : readmeVraag.data?.text ? (
                <div>
                  <header className="gh-detail-head">
                    <h3>{readmeVraag.data.name || 'README.md'}</h3>
                    {readmeVraag.data.url ? (
                      <a className="gh-btn" href={readmeVraag.data.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} /> GitHub
                      </a>
                    ) : null}
                  </header>
                  <pre className="gh-readme" data-no-edge-swipe>{readmeVraag.data.text}</pre>
                </div>
              ) : (
                <p className="gh-empty">
                  {tr('Оберіть файл у провіднику ліворуч або натисніть «Новий файл», щоб створити його.', 'Kies links een bestand in de verkenner of klik op «Nieuw bestand» om te beginnen.')}
                </p>
              )}
            </section>
          </div>
        </>
      )}

      {/* Dialoog: Takken beheren & aanmaken */}
      <GhDialoog
        open={takDialoog}
        titel={tr('Керування гілками сховища', 'Takken van de opslagplaats beheren')}
        onSluit={() => setTakDialoog(false)}
        tr={tr}
      >
        <div className="gh-form">
          <h4>{tr('Створити нову гілку', 'Nieuwe tak aanmaken')}</h4>
          <input
            value={maakTakNaam}
            onChange={(e) => setMaakTakNaam(e.target.value)}
            placeholder={tr('Назва гілки (наприклад, tak/uitbreiding)', 'Taknaam (bijv. feature/nieuw-onderdeel)')}
            aria-label={tr('Назва нової гілки', 'Naam van nieuwe tak')}
          />
          <label className="gh-veld-inline">
            <span>{tr('Відгалужити від основи:', 'Afsplitsen vanaf basis:')}</span>
            <select value={maakTakBron || actieveRef} onChange={(e) => setMaakTakBron(e.target.value)}>
              {takken.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          </label>
          <div className="gh-actions">
            <button
              type="button"
              className="gh-btn gh-primary"
              disabled={takBezig || !maakTakNaam.trim()}
              onClick={() => void maakTakAan()}
            >
              {takBezig ? <Loader2 size={14} className="gh-spin" /> : <Plus size={14} />}
              {tr('Створити гілку', 'Tak aanmaken')}
            </button>
          </div>
        </div>

        <div className="gh-koppel-blok">
          <h4>{tr('Наявні гілки', 'Bestaande takken')} ({takken.length})</h4>
          <ul className="gh-list">
            {takken.map((b) => (
              <li key={b.name} className="gh-item">
                <GitBranch size={15} className={b.standaard ? 'gh-ok' : 'gh-muted'} />
                <span className="gh-item-main">
                  <strong>
                    {b.name}{' '}
                    {b.standaard ? <span className="gh-chip">{tr('типова', 'standaard')}</span> : null}
                    {b.protected ? <span className="gh-chip gh-chip-warn">{tr('захищена', 'beschermd')}</span> : null}
                  </strong>
                  <span className="gh-sub"><code>{b.sha.slice(0, 10)}</code></span>
                </span>
                <div className="gh-actions">
                  <button
                    type="button"
                    className="gh-btn"
                    onClick={() => {
                      setGekozenRef(b.name);
                      setTakDialoog(false);
                    }}
                  >
                    {tr('Перейти', 'Openen')}
                  </button>
                  {!b.standaard && !b.protected ? (
                    <button type="button" className="gh-icon" onClick={() => void verwijderTak(b.name)} aria-label={tr(`Видалити гілку ${b.name}`, `Tak ${b.name} verwijderen`)} title={tr('Видалити гілку', 'Tak verwijderen')}>
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </GhDialoog>

      {/* Dialoog: Twee takken vergelijken */}
      <GhDialoog
        open={vergelijkOpen}
        breed
        titel={tr('Порівняння гілок та змін у файлах', 'Takken en bestandswijzigingen vergelijken')}
        onSluit={() => setVergelijkOpen(false)}
        tr={tr}
      >
        <div className="gh-vergelijk-kop">
          <label className="gh-veld-inline">
            <span>{tr('Базова гілка:', 'Basistak:')}</span>
            <select value={vergelijkBasis} onChange={(e) => setVergelijkBasis(e.target.value)}>
              {takken.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
          </label>
          <span>←</span>
          <label className="gh-veld-inline">
            <span>{tr('Порівнювана гілка:', 'Vergelijkingstak:')}</span>
            <select value={vergelijkKop} onChange={(e) => setVergelijkKop(e.target.value)}>
              {takken.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
          </label>
        </div>

        {vergelijkBasis === vergelijkKop ? (
          <p className="gh-sub">{tr('Оберіть дві різні гілки для порівняння.', 'Kies twee verschillende takken om te vergelijken.')}</p>
        ) : vergelijkVraag.fout ? (
          <GhMelding soort="error">{vergelijkVraag.fout}</GhMelding>
        ) : vergelijkVraag.laden || !vergelijkVraag.data ? (
          <GhBezig tr={tr} />
        ) : (
          <div className="gh-vergelijk-inhoud">
            <div className="gh-facts">
              <span className="gh-chip">{tr(`Попереду на: ${vergelijkVraag.data.aheadBy}`, `Voorop met: ${vergelijkVraag.data.aheadBy}`)}</span>
              <span className="gh-chip">{tr(`Позаду на: ${vergelijkVraag.data.behindBy}`, `Achterop met: ${vergelijkVraag.data.behindBy}`)}</span>
              <span className="gh-chip">{tr(`Фіксацій змін: ${vergelijkVraag.data.totalCommits}`, `Vastleggingen: ${vergelijkVraag.data.totalCommits}`)}</span>
              <span className="gh-chip">{tr(`Змінених файлів: ${vergelijkVraag.data.files.length}`, `Gewijzigde bestanden: ${vergelijkVraag.data.files.length}`)}</span>
            </div>
            {vergelijkVraag.data.files.map((f) => (
              <details key={f.filename} className="gh-diff-bestand" open={vergelijkVraag.data!.files.length <= 5}>
                <summary>
                  <strong>{f.filename}</strong>
                  <span className="gh-sub">+{f.additions} / −{f.deletions}</span>
                </summary>
                <DiffWeergave patch={f.patch} tr={tr} />
              </details>
            ))}
          </div>
        )}
      </GhDialoog>

      {/* Dialoog: Detail van één vastlegging (commit) */}
      <GhDialoog
        open={Boolean(gekozenCommitSha)}
        breed
        titel={tr(`Фіксація змін ${gekozenCommitSha.slice(0, 8)}`, `Vastlegging ${gekozenCommitSha.slice(0, 8)}`)}
        onSluit={() => setGekozenCommitSha('')}
        tr={tr}
      >
        {commitDetailVraag.fout ? (
          <GhMelding soort="error">{commitDetailVraag.fout}</GhMelding>
        ) : commitDetailVraag.laden || !commitDetailVraag.data ? (
          <GhBezig tr={tr} />
        ) : (
          <div className="gh-vergelijk-inhoud">
            <pre className="gh-commit-bericht">{commitDetailVraag.data.fullMessage || commitDetailVraag.data.message}</pre>
            <div className="gh-facts">
              <span>{commitDetailVraag.data.author}</span>
              <span><code>{commitDetailVraag.data.sha.slice(0, 12)}</code></span>
              <span>+{commitDetailVraag.data.stats.additions} / −{commitDetailVraag.data.stats.deletions}</span>
              {commitDetailVraag.data.url ? (
                <a className="gh-btn" href={commitDetailVraag.data.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} /> GitHub
                </a>
              ) : null}
            </div>
            {commitDetailVraag.data.files.map((f) => (
              <details key={f.filename} className="gh-diff-bestand" open={commitDetailVraag.data!.files.length <= 4}>
                <summary>
                  <strong>{f.filename}</strong>
                  <span className="gh-sub">+{f.additions} / −{f.deletions}</span>
                </summary>
                <DiffWeergave patch={f.patch} tr={tr} />
              </details>
            ))}
          </div>
        )}
      </GhDialoog>
    </div>
  );
}
