#!/usr/bin/env node
// HISTORIE-001: хронологія гілок і робіт із посиланнями «← попередник / → наступник».
// Скрипт лише читає git, orchestratie/taken, orchestratie/ontwikkelarchieven і знімок PR. Нічого в git не змінює.
// Документ лише доповнюється: кожен запуск дописує в кінець новий «знімок» із роботами, яких іще немає (або вершина гілки змінилася).
// Наявні рядки ніколи не переписуються, тож історія самого документа теж лишається простежуваною.
// HISTORIE-001: kroniek van takken en taken met verwijzingen «← voorganger / → opvolger». Leest alleen; vult het document enkel aan.
//
// Запуск / Gebruik:
//   node scripts/geschiedenis/kroniek.mjs --live <sha> --live-versie <JJJJMMDD-UUMMSS> [--datum JJJJ-MM-DD]
//        [--uit-uk docs/hub/ХРОНОЛОГІЯ-ГІЛОК.uk.md] [--uit-nl docs/hub/KRONIEK-TAKKEN.nl.md] [--remote origin] [--controle]
//   --controle: нічого не пише; код виходу 1, якщо документи треба доповнити (для CI).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPO_URL = 'https://github.com/Tarasevych/hub';
const TAAK_ID = /\b([A-Z][A-Z0-9]{1,9}-\d{3,5})\b/;
// Деякі коміти підписано українським відповідником ідентифікатора; зводимо до канонічного Task ID.
// Sommige commits gebruiken de Oekraïense naam van de taak-ID; die herleiden we naar de canonieke ID.
const ALIASSEN = { 'ІДЕНТИЧНІСТЬ': 'IDENTITEIT' };
export const taakUitOnderwerp = (s) => {
  const lat = s.match(TAAK_ID)?.[1];
  if (lat) return lat;
  const cyr = s.match(/(?:^|[^\p{L}])(\p{Lu}{2,14})-(\d{3,5})(?![\p{L}\d])/u);
  return cyr && ALIASSEN[cyr[1]] ? `${ALIASSEN[cyr[1]]}-${cyr[2]}` : null;
};

// ───────── Аргументи / Argumenten ─────────
export function leesArgumenten(argv) {
  const a = { remote: 'origin', uitUk: 'docs/hub/ХРОНОЛОГІЯ-ГІЛОК.uk.md', uitNl: 'docs/hub/KRONIEK-TAKKEN.nl.md', controle: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === '--live') a.live = v();
    else if (k === '--live-versie') a.liveVersie = v();
    else if (k === '--datum') a.datum = v();
    else if (k === '--uit-uk') a.uitUk = v();
    else if (k === '--uit-nl') a.uitNl = v();
    else if (k === '--remote') a.remote = v();
    else if (k === '--prs') a.prs = v();
    else if (k === '--controle') a.controle = true;
    else throw new Error('Невідомий аргумент / onbekend argument: ' + k);
  }
  if (!a.live || !a.liveVersie) throw new Error('Потрібні --live <sha> і --live-versie <версія> (жива версія з /api/version).');
  a.datum ||= new Date().toISOString().slice(0, 10);
  a.prs ||= 'scripts/geschiedenis/samenvoegverzoeken.json';
  return a;
}

// ───────── Git (лише читання) ─────────
const git = (args, opts = {}) => execFileSync('git', args, { cwd: WORTEL, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', opts.stil ? 'ignore' : 'pipe'] }).trim();
const gitMag = (args) => { try { return git(args, { stil: true }); } catch { return null; } };
const isVoorouder = (a, b) => { try { execFileSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: WORTEL, stdio: 'ignore' }); return true; } catch { return false; } };

function verzamelTakken(remote) {
  const uit = git(['for-each-ref', '--format=%(refname)\t%(objectname)\t%(committerdate:iso-strict)', `refs/remotes/${remote}`]);
  const takken = new Map();
  for (const r of uit.split('\n').filter(Boolean)) {
    const [ref, sha, datum] = r.split('\t');
    const naam = ref.replace(`refs/remotes/${remote}/`, '');
    if (naam === 'HEAD') continue;
    takken.set(naam, { naam, ref, sha, datum: datum.slice(0, 10) });
  }
  return takken;
}

function verzamelTags() {
  const uit = git(['for-each-ref', '--format=%(refname:short)\t%(objectname)\t%(*objectname)', 'refs/tags']);
  return uit.split('\n').filter(Boolean).map((r) => { const [naam, sha, deref] = r.split('\t'); return { naam, sha: deref || sha }; })
    .filter((t) => /^v?\d{8}-\d{6}$/.test(t.naam)).sort((x, y) => x.naam.replace(/^v/, '').localeCompare(y.naam.replace(/^v/, '')));
}

const leesJson = (tekst) => { try { return JSON.parse(tekst); } catch { return null; } };

/** Робота = запис orchestratie/taken/<ID>.json. Беремо з робочого дерева й з вершин усіх гілок (нова робота живе лише у своїй гілці). */
function verzamelTaken(takken) {
  const taken = new Map();
  const neem = (d, bron) => {
    if (!d?.id || !TAAK_ID.test(d.id)) return;
    const eerder = taken.get(d.id);
    // Перевага — версії з власної гілки роботи: там стан актуальніший, ніж в integratie (merge=orch-staat).
    if (!eerder || (bron === d.tak && eerder.bron !== d.tak)) taken.set(d.id, { ...d, bron });
  };
  const map = path.join(WORTEL, 'orchestratie/taken');
  // Робота поточної гілки: запис у робочому дереві новіший за опублікований (агент його щойно оновив).
  const huidig = gitMag(['rev-parse', '--abbrev-ref', 'HEAD']);
  for (const f of fs.existsSync(map) ? fs.readdirSync(map) : []) if (f.endsWith('.json')) {
    const d = leesJson(fs.readFileSync(path.join(map, f), 'utf8'));
    neem(d, d?.tak && d.tak === huidig ? d.tak : 'werkboom');
  }
  for (const t of takken.values()) {
    const lijst = gitMag(['ls-tree', '--name-only', t.sha, 'orchestratie/taken/']);
    for (const p of (lijst || '').split('\n').filter((x) => x.endsWith('.json'))) {
      const id = path.basename(p, '.json');
      const bestaand = taken.get(id);
      if (bestaand && bestaand.bron === bestaand.tak) continue;
      const d = leesJson(gitMag(['show', `${t.sha}:${p}`]) || '');
      if (d && (!bestaand || d.tak === t.naam)) neem(d, t.naam);
    }
  }
  return taken;
}

function leesArchief(id, takken, tak) {
  const lokaal = path.join(WORTEL, 'orchestratie/ontwikkelarchieven', id + '.json');
  if (fs.existsSync(lokaal)) return leesJson(fs.readFileSync(lokaal, 'utf8'));
  const t = takken.get(tak);
  return t ? leesJson(gitMag(['show', `${t.sha}:orchestratie/ontwikkelarchieven/${id}.json`]) || '') : null;
}

// ───────── Модель / Model ─────────
export function bouwModel(a) {
  const takken = verzamelTakken(a.remote);
  const tags = verzamelTags();
  const taken = verzamelTaken(takken);
  const prsBestand = path.join(WORTEL, a.prs);
  const prs = fs.existsSync(prsBestand) ? (leesJson(fs.readFileSync(prsBestand, 'utf8'))?.verzoeken || []) : [];
  const integratie = takken.get('integratie')?.sha;
  const voornaamst = takken.get('voornaamst')?.sha;
  const live = gitMag(['rev-parse', a.live + '^{commit}']) || a.live;

  const slugVan = (id) => id.toLowerCase();
  const werken = [...taken.values()].map((t) => {
    // Робота може мати кілька гілок (повторні гілки випуску): власна з запису плюс ті, чия назва містить її ідентифікатор.
    const eigen = [...takken.values()].filter((x) => x.naam === t.tak || new RegExp(`(^|/)${slugVan(t.id)}(-|$)`).test(x.naam));
    eigen.sort((x, y) => y.datum.localeCompare(x.datum) || y.naam.localeCompare(x.naam));
    const tak = takken.get(t.tak) || eigen[0];
    const archief = leesArchief(t.id, takken, t.tak);
    const top = tak?.sha || null;
    return {
      id: t.id, agent: t.agent || '?', staat: t.staat || '?', gestart: (t.gestart || '').slice(0, 10), tak: t.tak || '',
      takken: eigen.map((x) => x.naam).filter((n) => n !== t.tak),
      top, topDatum: tak?.datum || '', basis: t.basisCommit || '', basisVersie: t.basisVersie || '',
      omschrijving: String(t.omschrijving || archief?.titel || archief?.opdracht || '').replace(/\s+/g, ' ').trim(),
      prs: prs.filter((p) => p.kop === t.tak || eigen.some((x) => x.naam === p.kop)),
    };
  }).sort((x, y) => (x.gestart || '9').localeCompare(y.gestart || '9') || x.id.localeCompare(y.id));

  // ← Попередник: остання (за датою вершини) інша робота, вершина якої входить у базу цієї роботи.
  for (const w of werken) {
    w.basisTags = tags.filter((t) => t.sha === w.basis).map((t) => t.naam);
    w.basisIn = [integratie && w.basis && isVoorouder(w.basis, integratie) ? 'integratie' : null, voornaamst && w.basis && isVoorouder(w.basis, voornaamst) ? 'voornaamst' : null].filter(Boolean);
    const kandidaten = werken.filter((o) => o !== w && o.top && w.basis && (o.top === w.basis || isVoorouder(o.top, w.basis)));
    kandidaten.sort((x, y) => (y.top === w.basis) - (x.top === w.basis) || y.topDatum.localeCompare(x.topDatum) || x.id.localeCompare(y.id));
    w.voorganger = kandidaten[0]?.id || null;
    w.voorgangerExact = kandidaten[0]?.top === w.basis;
  }
  // → Наступник: де вершина гілки опинилася (integratie, жива версія, voornaamst, випуски) і які роботи взяли її за основу.
  for (const w of werken) {
    w.in = w.top ? {
      integratie: !!integratie && isVoorouder(w.top, integratie),
      live: isVoorouder(w.top, live),
      voornaamst: !!voornaamst && isVoorouder(w.top, voornaamst),
    } : null;
    w.uitgaven = w.top ? tags.filter((t) => isVoorouder(w.top, t.sha)).map((t) => t.naam).slice(0, 1) : [];
    w.opvolgers = werken.filter((o) => o.voorganger === w.id).map((o) => o.id);
  }

  const bekendeTakken = new Set(werken.flatMap((w) => [w.tak, ...w.takken]));
  const zonderTaak = [...takken.values()].filter((t) => !bekendeTakken.has(t.naam)).map((t) => ({
    ...t,
    id: (t.naam.match(/^(?:feature|fix|audit|release)\/([a-z0-9]+-\d{3,5})/i)?.[1] || '').toUpperCase() || null,
    inIntegratie: !!integratie && isVoorouder(t.sha, integratie), inLive: isVoorouder(t.sha, live),
    basisIntegratie: integratie ? (gitMag(['merge-base', t.sha, integratie]) || '') : '',
    prs: prs.filter((p) => p.kop === t.naam),
  })).sort((x, y) => y.datum.localeCompare(x.datum) || x.naam.localeCompare(y.naam));

  // Розрив voornaamst ↔ жива версія: коміти, яких немає в voornaamst, згруповані за Task ID з першого рядка.
  const rozriv = [];
  if (voornaamst) {
    const regels = git(['log', '--no-merges', '--format=%h\t%ad\t%s', '--date=short', `${voornaamst}..${live}`]).split('\n').filter(Boolean);
    const groepen = new Map();
    for (const r of regels) {
      const [sha, datum, ...onderwerp] = r.split('\t');
      const s = onderwerp.join('\t');
      const id = taakUitOnderwerp(s) || '—';
      if (!groepen.has(id)) groepen.set(id, []);
      groepen.get(id).push({ sha, datum, onderwerp: s });
    }
    for (const [id, c] of groepen) rozriv.push({ id, commits: c.reverse() });
    rozriv.sort((x, y) => x.commits[0].datum.localeCompare(y.commits[0].datum) || x.id.localeCompare(y.id));
  }
  const telling = (x, y) => gitMag(['rev-list', '--count', `${x}..${y}`]) || '0';
  return {
    datum: a.datum, live, liveVersie: a.liveVersie, integratie, voornaamst, werken, zonderTaak, rozriv,
    tellingen: voornaamst ? { naarLive: telling(voornaamst, live), naarIntegratie: integratie ? telling(voornaamst, integratie) : '0', integratieNaarLive: integratie ? telling(integratie, live) : '0' } : null,
    aantalTakken: takken.size,
  };
}

// ───────── Тексти / Teksten ─────────
const T = {
  uk: {
    titel: 'Хронологія гілок і робіт', ander: '[Nederlands](KRONIEK-TAKKEN.nl.md)', anderNaam: 'Українська',
    nav: '[Головна](../../README.md) · [Покажчик документації](../ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md) · [Гілки, PR та випуски](./ГІЛКИ-ТА-ЗАПИТИ-НА-ЗЛИТТЯ.uk.md) · [Історія розвитку](./ІСТОРІЯ-РОЗВИТКУ.uk.md)',
    intro: [
      'Цей документ **лише доповнюється**: генератор `scripts/geschiedenis/kroniek.mjs` (HISTORIE-001) дописує в кінець новий знімок із роботами, яких тут ще немає, або з тими, у яких змінилася вершина гілки. Наявні записи не змінюються й не видаляються.',
      'Кожна робота має позначки **← Попередник** (з якої основи й поверх якої попередньої роботи її почато) та **→ Наступник** (куди її влито, чи є вона в живій версії, які роботи продовжили її). Дані беруться лише з git, `orchestratie/taken/*.json`, `orchestratie/ontwikkelarchieven/*.json` і знімка PR `scripts/geschiedenis/samenvoegverzoeken.json`.',
      'Як читати: «Попередня робота» — найсвіжіша інша робота, вершина гілки якої вже входила в основу цієї. «Наступні роботи» — ті, що взяли цю роботу за свого попередника.',
    ],
    znimok: 'Знімок', liveV: 'жива версія', commit: 'коміт', takken: 'гілок на GitHub:', andereTakken: 'Інші гілки цієї роботи',
    rozrivKop: 'Розрив `voornaamst` ↔ жива версія',
    rozrivTekst: (t) => `Гілка за замовчуванням \`voornaamst\` не містить **${t.naarLive}** комітів живої версії: **${t.naarIntegratie}** уже є в \`integratie\`, ще **${t.integratieNaarLive}** лежать поверх \`integratie\` у гілці випуску. Оновити \`voornaamst\` (fast-forward або злиття з \`integratie\`) може **лише власник**; агенти захищених гілок не змінюють (AGENTS.md).`,
    rozrivDetails: 'Коміти за роботами', geenId: 'без Task ID',
    werkenKop: 'Роботи за датою початку', zonderKop: 'Гілки без запису роботи',
    zonderTekst: 'Гілки агентів (`claude/*`), оновлення залежностей і гілки, для яких немає `orchestratie/taken/<ID>.json`. Показано лише факти з git.',
    grafiekKop: 'Схема спадкоємності', tak: 'Гілка', top: 'вершина', geenTak: 'гілки на GitHub немає (видалена або не опублікована)',
    voorganger: '← Попередник', basis: 'основа', versie: 'версія', vorigeWerk: 'попередня робота', exact: 'точно на її вершині', bevat: 'містить її вершину',
    opvolger: '→ Наступник', inIntegratie: 'влито в `integratie`', nietIntegratie: 'ще не в `integratie`', deelsIntegratie: 'частково в `integratie` (PR влито, але вершина гілки пішла далі)', inLive: 'є в живій версії', inVoornaamst: 'є в `voornaamst`',
    eersteUitgave: 'перший випуск, що її містить', volgendeWerken: 'наступні роботи', geen: 'немає',
    pr: 'PR', samengevoegd: 'влито', open: 'відкритий', gesloten: 'закритий без злиття', staat: 'стан у записі', agent: 'агент',
    kolommen: '| Гілка | Вершина | Основа в `integratie` | У `integratie` | У живій версії | PR |', ja: 'так', nee: 'ні',
    logboek: 'Журнал доповнень',
    geenNieuws: 'нових робіт немає',
  },
  nl: {
    titel: 'Kroniek van takken en taken', ander: '[Українська](ХРОНОЛОГІЯ-ГІЛОК.uk.md)', anderNaam: 'Nederlands',
    nav: '[Start](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md) · [Takken, PR’s en releases](./TAKKEN-EN-SAMENVOEGVERZOEKEN.nl.md) · [Geschiedenis](./GESCHIEDENIS.nl.md)',
    intro: [
      'Dit document wordt **alleen aangevuld**: de generator `scripts/geschiedenis/kroniek.mjs` (HISTORIE-001) voegt onderaan een nieuwe momentopname toe met taken die hier nog niet staan, of waarvan de top van de tak veranderd is. Bestaande regels worden nooit gewijzigd of verwijderd.',
      'Elke taak heeft **← Voorganger** (op welke basis en bovenop welke eerdere taak ze begon) en **→ Opvolger** (waar ze is samengevoegd, of ze in de live versie zit, welke taken erop voortbouwen). Bronnen: alleen git, `orchestratie/taken/*.json`, `orchestratie/ontwikkelarchieven/*.json` en de momentopname van PR’s `scripts/geschiedenis/samenvoegverzoeken.json`.',
      'Lezen: «vorige taak» is de recentste andere taak waarvan de top al in de basis van deze taak zat. «Volgende taken» kozen deze taak als voorganger.',
    ],
    znimok: 'Momentopname', liveV: 'live versie', commit: 'commit', takken: 'takken op GitHub:', andereTakken: 'Andere takken van deze taak',
    rozrivKop: 'Achterstand `voornaamst` ↔ live versie',
    rozrivTekst: (t) => `De standaardtak \`voornaamst\` mist **${t.naarLive}** commits van de live versie: **${t.naarIntegratie}** staan al in \`integratie\`, nog **${t.integratieNaarLive}** liggen bovenop \`integratie\` in de releasetak. Alleen **de eigenaar** werkt \`voornaamst\` bij (fast-forward of samenvoegen met \`integratie\`); agenten wijzigen geen beschermde takken (AGENTS.md).`,
    rozrivDetails: 'Commits per taak', geenId: 'zonder taak-ID',
    werkenKop: 'Taken op startdatum', zonderKop: 'Takken zonder taakrecord',
    zonderTekst: 'Agenttakken (`claude/*`), afhankelijkheidsupdates en takken zonder `orchestratie/taken/<ID>.json`. Alleen feiten uit git.',
    grafiekKop: 'Opvolgingsschema', tak: 'Tak', top: 'top', geenTak: 'tak niet op GitHub (verwijderd of niet gepubliceerd)',
    voorganger: '← Voorganger', basis: 'basis', versie: 'versie', vorigeWerk: 'vorige taak', exact: 'precies op haar top', bevat: 'bevat haar top',
    opvolger: '→ Opvolger', inIntegratie: 'samengevoegd in `integratie`', nietIntegratie: 'nog niet in `integratie`', deelsIntegratie: 'deels in `integratie` (PR samengevoegd, maar de tak liep verder)', inLive: 'zit in de live versie', inVoornaamst: 'zit in `voornaamst`',
    eersteUitgave: 'eerste release die haar bevat', volgendeWerken: 'volgende taken', geen: 'geen',
    pr: 'PR', samengevoegd: 'samengevoegd', open: 'open', gesloten: 'gesloten zonder samenvoegen', staat: 'status in record', agent: 'agent',
    kolommen: '| Tak | Top | Basis in `integratie` | In `integratie` | In live versie | PR |', ja: 'ja', nee: 'nee',
    logboek: 'Aanvullingslogboek',
    geenNieuws: 'geen nieuwe taken',
  },
};

const kort = (sha) => (sha || '').slice(0, 7);
const commitLink = (sha) => sha ? `[\`${kort(sha)}\`](${REPO_URL}/commit/${sha})` : '—';
const takLink = (tak) => `[\`${tak}\`](${REPO_URL}/tree/${tak.split('/').map(encodeURIComponent).join('/')})`;
const anker = (id) => 't-' + id.toLowerCase();
const prTekst = (t, p) => `[#${p.nummer}](${REPO_URL}/pull/${p.nummer}) → \`${p.basis}\` (${p.samengevoegd ? `${t.samengevoegd} ${p.samengevoegd.slice(0, 10)}` : p.staat === 'open' ? t.open : t.gesloten})`;
const sleutelWerk = (w) => `k:${w.id}@${w.top || 'geen'}`;
const sleutelTak = (t) => `b:${t.naam}@${t.sha}`;
const mmd = (id) => id.replace(/[^A-Za-z0-9]/g, '_');

function werkBlok(t, w, bestaandeAnkers) {
  const r = [];
  const ankerTag = bestaandeAnkers.has(anker(w.id)) ? '' : `<a id="${anker(w.id)}"></a>`;
  bestaandeAnkers.add(anker(w.id));
  r.push(`#### ${ankerTag}${w.id} · ${w.gestart || '—'} · ${t.agent} ${w.agent} <!-- ${sleutelWerk(w)} -->`);
  if (w.omschrijving) r.push('', w.omschrijving.length > 420 ? w.omschrijving.slice(0, 417) + '…' : w.omschrijving);
  r.push('');
  r.push(`- **${t.tak}:** ${w.tak ? takLink(w.tak) : '—'} · ${w.top ? `${t.top} ${commitLink(w.top)} (${w.topDatum})` : t.geenTak} · ${t.staat}: \`${w.staat}\``);
  if (w.takken.length) r.push(`- **${t.andereTakken}:** ${w.takken.map(takLink).join(', ')}`);
  const voor = [`${t.basis} ${commitLink(w.basis)}`];
  if (w.basisVersie) voor.push(`${t.versie} \`${w.basisVersie}\``);
  if (w.basisTags.length) voor.push(w.basisTags.map((x) => `[\`${x}\`](${REPO_URL}/releases/tag/${x})`).join(', '));
  if (w.basisIn.length) voor.push(w.basisIn.map((x) => `∈ \`${x}\``).join(' '));
  if (w.voorganger) voor.push(`${t.vorigeWerk}: [${w.voorganger}](#${anker(w.voorganger)}) (${w.voorgangerExact ? t.exact : t.bevat})`);
  r.push(`- **${t.voorganger}:** ${voor.join(' · ')}`);
  const na = [];
  if (w.in) {
    // Вершина гілки могла піти далі після злиття PR: тоді чесно кажемо «частково».
    const prIn = w.prs.some((p) => p.samengevoegd && p.basis === 'integratie');
    na.push(w.in.integratie ? t.inIntegratie : prIn ? t.deelsIntegratie : t.nietIntegratie);
    if (w.in.live) na.push(t.inLive);
    if (w.in.voornaamst) na.push(t.inVoornaamst);
  }
  if (w.uitgaven.length) na.push(`${t.eersteUitgave}: [\`${w.uitgaven[0]}\`](${REPO_URL}/releases/tag/${w.uitgaven[0]})`);
  na.push(`${t.volgendeWerken}: ${w.opvolgers.length ? w.opvolgers.map((o) => `[${o}](#${anker(o)})`).join(', ') : t.geen}`);
  r.push(`- **${t.opvolger}:** ${na.join(' · ')}`);
  if (w.prs.length) r.push(`- **${t.pr}:** ${w.prs.map((p) => prTekst(t, p)).join(' · ')}`);
  r.push('');
  return r.join('\n');
}

function grafiek(werken) {
  const r = ['```mermaid', 'flowchart LR', '  INT[(integratie)]', '  LIVE((live))'];
  for (const w of werken) {
    r.push(`  ${mmd(w.id)}["${w.id}"]`);
    if (w.voorganger) r.push(`  ${mmd(w.voorganger)} --> ${mmd(w.id)}`);
    if (w.in?.integratie) r.push(`  ${mmd(w.id)} -.-> INT`);
  }
  r.push('  INT --> LIVE', '```');
  return r.join('\n');
}

/** Знімок для мови: лише нові записи (ключі, яких іще немає в документі). Порожній рядок — нічого дописувати. */
export function maakZnimok(m, taal, bestaand) {
  const t = T[taal];
  const sleutels = new Set([...bestaand.matchAll(/<!-- ((?:k|b|r):[^ ]+) -->/g)].map((x) => x[1]));
  const ankers = new Set([...bestaand.matchAll(/<a id="([^"]+)"><\/a>/g)].map((x) => x[1]));
  const nieuweWerken = m.werken.filter((w) => !sleutels.has(sleutelWerk(w)));
  const nieuweTakken = m.zonderTaak.filter((x) => !sleutels.has(sleutelTak(x)));
  const rSleutel = `r:${m.live}:${m.voornaamst || 'geen'}`;
  const nieuwRozriv = m.rozriv.length && !sleutels.has(rSleutel);
  if (!nieuweWerken.length && !nieuweTakken.length && !nieuwRozriv) return '';
  const r = [];
  r.push(`## ${t.znimok} ${m.datum} · ${t.liveV} \`${m.liveVersie}\` · ${t.commit} ${commitLink(m.live)} · ${t.takken} ${m.aantalTakken}`, '');
  if (nieuwRozriv && m.tellingen) {
    r.push(`### ${t.rozrivKop} <!-- ${rSleutel} -->`, '', t.rozrivTekst(m.tellingen), '');
    r.push('<details>', `<summary>${t.rozrivDetails}</summary>`, '');
    for (const g of m.rozriv) {
      const kop = g.id === '—' ? t.geenId : (m.werken.some((w) => w.id === g.id) ? `[${g.id}](#${anker(g.id)})` : g.id);
      r.push(`- **${kop}** — ${g.commits.length} · ${g.commits[0].datum} → ${g.commits[g.commits.length - 1].datum}`);
      for (const c of g.commits) r.push(`  - [\`${c.sha}\`](${REPO_URL}/commit/${c.sha}) ${c.datum} ${c.onderwerp.replace(/[<>]/g, '')}`);
    }
    r.push('', '</details>', '');
  }
  if (nieuweWerken.length) {
    r.push(`### ${t.werkenKop}`, '');
    for (const w of nieuweWerken) r.push(werkBlok(t, w, ankers));
    r.push(`### ${t.grafiekKop}`, '', grafiek(nieuweWerken), '');
  }
  if (nieuweTakken.length) {
    r.push(`### ${t.zonderKop}`, '', t.zonderTekst, '', t.kolommen, '|---|---|---|---|---|---|');
    for (const x of nieuweTakken) {
      r.push(`| ${takLink(x.naam)} <!-- ${sleutelTak(x)} --> | ${commitLink(x.sha)} ${x.datum} | ${commitLink(x.basisIntegratie)} | ${x.inIntegratie ? t.ja : t.nee} | ${x.inLive ? t.ja : t.nee} | ${x.prs.map((p) => prTekst(t, p)).join('<br>') || '—'} |`);
    }
    r.push('');
  }
  r.push(`> ${t.logboek}: ${m.datum} — +${nieuweWerken.length} / +${nieuweTakken.length}${nieuwRozriv ? ' / Δ' : ''}`, '');
  return r.join('\n');
}

export function kop(taal) {
  const t = T[taal];
  return [
    `> 🌐 **Мова / Taal:** **${t.anderNaam}** · ${t.ander} | ${t.nav}`, '',
    `# ${t.titel}`, '',
    ...t.intro.flatMap((p) => [p, '']),
    '---', '',
  ].join('\n');
}

/** Повертає новий вміст документа: старий вміст без змін + дописаний знімок. */
export function aanvullen(bestaand, m, taal) {
  const basis = bestaand && bestaand.trim() ? bestaand.replace(/\s*$/, '\n\n') : kop(taal);
  const znimok = maakZnimok(m, taal, basis);
  return znimok ? basis + znimok : (bestaand || basis);
}

export function main(argv = process.argv.slice(2)) {
  const a = leesArgumenten(argv);
  const m = bouwModel(a);
  let teDoen = 0;
  for (const [taal, uit] of [['uk', a.uitUk], ['nl', a.uitNl]]) {
    const bestand = path.resolve(WORTEL, uit);
    const oud = fs.existsSync(bestand) ? fs.readFileSync(bestand, 'utf8') : '';
    const nieuw = aanvullen(oud, m, taal);
    if (nieuw === oud) { console.log(`${uit}: ${T[taal].geenNieuws}`); continue; }
    if (oud && !nieuw.startsWith(oud.replace(/\s*$/, ''))) throw new Error('Захист: доповнення змінило б наявний текст / bescherming: bestaande tekst zou wijzigen: ' + uit);
    teDoen++;
    if (a.controle) { console.log(`${uit}: потрібне доповнення / aanvulling nodig`); continue; }
    fs.mkdirSync(path.dirname(bestand), { recursive: true });
    fs.writeFileSync(bestand, nieuw);
    console.log(`${uit}: доповнено / aangevuld (${m.werken.length} робіт, ${m.zonderTaak.length} гілок без запису)`);
  }
  return a.controle && teDoen ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (e) { console.error(String(e?.message || e)); process.exitCode = 2; }
}
