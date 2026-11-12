// Volledige eenheidstests voor GITHUB-010:
//  1. Zuivere validatie, verschilberekening, GitHub App-manifest en zelfstandig uitrolrecept (shared/github-werkruimte.ts);
//  2. Serverbewerkingen voor opslagplaatsen, takken, boom, webeditor, vergelijking, vraagstukken, samenvoegingsverzoeken,
//     werkstromen, uitgaven en ondertekende webhook-controles (backend/github-werkruimte.ts);
//  3. Menu-uitbreiding (13 tabbladen), 7 nieuwe tweetalige AI-hulpmiddelen (connector v2) en RLS-migratie 0208.
import { readFileSync } from 'node:fs';
import { setGithubDeps } from '../../backend/github-platform';
import {
  ghBestandLezen,
  ghBestandOpslaan,
  ghBestandVerwijderen,
  ghBoom,
  ghLabelMaken,
  ghLabels,
  ghRepoBijwerken,
  ghRepoForken,
  ghRepoMaken,
  ghRepoSter,
  ghRunBeheer,
  ghSamenvoegingBeoordelen,
  ghSamenvoegingDetail,
  ghSamenvoegingMaken,
  ghSamenvoegingUitvoeren,
  ghTakMaken,
  ghTakVerwijderen,
  ghTakkenEnTags,
  ghUitgaveMaken,
  ghUitgaven,
  ghVergelijken,
  ghWebhookVerwerken,
  ghWerkstroomStarten,
  ghWerkstromen,
  ghZaakBijwerken,
  ghZaakDetail,
} from '../../backend/github-werkruimte';
import {
  GITHUB_WERKRUIMTE_TOOL_NAMEN,
  berekenTekstVerschil,
  bouwGithubAppManifest,
  bouwGithubUitrolRecept,
  ontleedDiffPatch,
  veiligBestandPad,
  veiligRepoNaam,
  veiligTakNaam,
} from '../../shared/github-werkruimte';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';
import { MENU_PAGINAS } from '../../shared/menu-model';
import { checker } from './hulp/nep-google';

type Aanroep = { url: string; method: string; body?: any };

function nepGithub(antwoorden: Record<string, unknown | ((url: string, init?: RequestInit) => Response | unknown)>) {
  const aanroepen: Aanroep[] = [];
  const fn = (async (urlIn: string, init?: RequestInit) => {
    const url = String(urlIn);
    const method = (init?.method || 'GET').toUpperCase();
    const body = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : undefined;
    aanroepen.push({ url, method, body });

    const padMetQuery = url.replace('https://api.github.com', '');
    const padZonderQuery = padMetQuery.split('?')[0];
    const sleutel =
      Object.keys(antwoorden).find((k) => k === `${method} ${padMetQuery}`) ||
      Object.keys(antwoorden).find((k) => k === `${method} ${padZonderQuery}`) ||
      Object.keys(antwoorden).find((k) => k === padMetQuery || k === padZonderQuery);

    if (!sleutel) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    const ruw = antwoorden[sleutel];
    const uit = typeof ruw === 'function' ? (ruw as any)(url, init) : ruw;
    if (uit instanceof Response) return uit;
    if (uit === null) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(uit), {
      status: 200,
      headers: { 'x-ratelimit-remaining': '4990', 'x-ratelimit-reset': '1800000000' },
    });
  }) as unknown as typeof fetch;

  setGithubDeps({ fetch: fn, token: async () => 'gho_kunstmatig_testtoken' });
  return aanroepen;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('github-volledige-werkruimte');

  // 1. Zuivere validatie & verschilweergave
  check(
    'veiligBestandPad laat geldige paden toe en weigert traversal of stuurtekens',
    veiligBestandPad('/src/github/CodeEnEditorPaneel.tsx/') === 'src/github/CodeEnEditorPaneel.tsx' &&
      veiligBestandPad('README.md') === 'README.md' &&
      ['', '/', '../geheim', 'a/../../b', 'a/./b', 'pad\\windows', 'nul\u0000byte'].every((x) => veiligBestandPad(x) === ''),
  );

  check(
    'veiligTakNaam valideert Git-taknamen strikt',
    veiligTakNaam('main') === 'main' &&
      veiligTakNaam('feature/github-010-werkruimte') === 'feature/github-010-werkruimte' &&
      ['', '/main', 'tak..naam', 'tak.lock', 'met spatie', 'a~1', 'a^2', 'a@{1}'].every((x) => veiligTakNaam(x) === ''),
  );

  check(
    'veiligRepoNaam controleert namen van nieuwe opslagplaatsen',
    veiligRepoNaam('mijn-ruimte-app') === 'mijn-ruimte-app' &&
      ['', '.', '..', 'eigenaar/naam', 'spatie naam', 'vreemd$teken'].every((x) => veiligRepoNaam(x) === ''),
  );

  const patch = ['@@ -10,3 +10,4 @@', ' ongewijzigd', '-oude regel', '+nieuwe regel 1', '+nieuwe regel 2'].join('\n');
  const diffRegels = ontleedDiffPatch(patch);
  check(
    'ontleedDiffPatch berekent regelnummers en soorten voor verschilweergave',
    diffRegels.length === 5 &&
      diffRegels[0].soort === 'kop' &&
      diffRegels[1].oudRegel === 10 &&
      diffRegels[1].nieuwRegel === 10 &&
      diffRegels[2].soort === 'eraf' &&
      diffRegels[2].oudRegel === 11 &&
      diffRegels[3].soort === 'erbij' &&
      diffRegels[3].nieuwRegel === 11 &&
      diffRegels[4].nieuwRegel === 12,
  );

  const editorDiff = berekenTekstVerschil('regel 1\noud\nregel 3', 'regel 1\nnieuw A\nnieuw B\nregel 3');
  check(
    'berekenTekstVerschil toont toevoegingen en verwijderingen in de webeditor',
    editorDiff.eraf === 1 && editorDiff.erbij === 2 && editorDiff.regels.some((r) => r.soort === 'erbij' && r.tekst === 'nieuw A'),
  );

  const manifest = bouwGithubAppManifest('github.voorbeeld.ua');
  check(
    'bouwGithubAppManifest bouwt geldig manifest voor elk eigen domein en weigert ongeldige hosts',
    manifest !== null &&
      manifest.redirect_url === 'https://github.voorbeeld.ua/api/owner/github/eenklik/callback' &&
      Array.isArray(manifest.callback_urls) &&
      (manifest.callback_urls as string[]).includes('https://github.voorbeeld.ua/api/owner/github/oauth/callback') &&
      bouwGithubAppManifest('geen geldige host/pad?x=1') === null &&
      bouwGithubAppManifest('') === null,
  );

  const recept = bouwGithubUitrolRecept({ repo: 'eigenaar/Slimme-Dienst', tak: 'release/v1', poort: 4100, eigenHost: 'github.voorbeeld.ua' });
  check(
    'bouwGithubUitrolRecept levert Docker Compose en zelfstandige uitrolopdracht op',
    recept.appNaam === 'slimme-dienst' &&
      recept.tak === 'release/v1' &&
      recept.poort === 4100 &&
      recept.dockerCompose.includes('https://github.com/eigenaar/Slimme-Dienst.git#release/v1') &&
      recept.opdrachtEigenServer.includes('docker compose -f slimme-dienst/docker-compose.yml up -d --build'),
  );

  // 2. Serverbewerkingen met gesimuleerde GitHub REST API
  try {
    let aanroepen = nepGithub({
      'POST /user/repos': (_u, init) => {
        const b = JSON.parse(String(init?.body || '{}'));
        return { full_name: `pavlo/${b.name}`, name: b.name, private: b.private, default_branch: 'main', html_url: `https://github.com/pavlo/${b.name}` };
      },
      'PATCH /repos/pavlo/kern': { full_name: 'pavlo/kern', name: 'kern', description: 'Bijgewerkt', default_branch: 'main' },
      'PUT /repos/pavlo/kern/topics': { names: ['mijn-ruimte'] },
      'POST /repos/pavlo/kern/forks': { full_name: 'ander/kern', name: 'kern', fork: true, default_branch: 'main' },
      'PUT /user/starred/pavlo/kern': null,
    });

    const ongeldigRepo = await ghRepoMaken('u1', { name: '../fout' });
    const gemaakt = await ghRepoMaken('u1', { name: 'nieuw-project', description: 'Proef', private: true, gitignoreTemplate: 'Node', licenseTemplate: 'mit' });
    const bijgewerkt = await ghRepoBijwerken('u1', 'pavlo/kern', { description: 'Bijgewerkt', topics: ['mijn-ruimte'] });
    const geforkt = await ghRepoForken('u1', 'pavlo/kern');
    const gesterd = await ghRepoSter('u1', 'pavlo/kern', true);
    check(
      'opslagplaatsen: aanmaken, bijwerken, onderwerpen zetten, afsplitsen en met ster markeren',
      !ongeldigRepo.ok &&
        ongeldigRepo.error === 'GITHUB_REPO_NAAM_ONGELDIG' &&
        gemaakt.ok &&
        gemaakt.data.repo.fullName === 'pavlo/nieuw-project' &&
        bijgewerkt.ok &&
        geforkt.ok &&
        geforkt.data.repo.fullName === 'ander/kern' &&
        gesterd.ok &&
        gesterd.data.starred === true &&
        aanroepen.some((a) => a.method === 'PUT' && a.url.endsWith('/repos/pavlo/kern/topics')),
    );

    const shaHoofd = 'a'.repeat(40);
    const shaBestand = 'b'.repeat(40);
    aanroepen = nepGithub({
      'GET /repos/pavlo/kern': { full_name: 'pavlo/kern', default_branch: 'main' },
      'GET /repos/pavlo/kern/branches': [{ name: 'main', commit: { sha: shaHoofd }, protected: true }, { name: 'feature/ui', commit: { sha: shaBestand }, protected: false }],
      'GET /repos/pavlo/kern/tags': [{ name: 'v1.0.0', commit: { sha: shaHoofd } }],
      'GET /repos/pavlo/kern/git/ref/heads/main': { object: { sha: shaHoofd } },
      'POST /repos/pavlo/kern/git/refs': { ref: 'refs/heads/feature/nieuw', object: { sha: shaHoofd } },
      'DELETE /repos/pavlo/kern/git/refs/heads/feature/oud': null,
      'GET /repos/pavlo/kern/git/trees/main': {
        truncated: false,
        tree: [
          { path: 'src', type: 'tree', sha: '1'.repeat(40), size: 0 },
          { path: 'README.md', type: 'blob', sha: shaBestand, size: 24 },
        ],
      },
      'GET /repos/pavlo/kern/contents/README.md': {
        type: 'file',
        path: 'README.md',
        name: 'README.md',
        sha: shaBestand,
        size: 12,
        content: Buffer.from('# Вітаємо\n', 'utf8').toString('base64'),
        html_url: 'https://github.com/pavlo/kern/blob/main/README.md',
      },
      'GET /repos/pavlo/kern/contents/beeld.png': {
        type: 'file',
        path: 'beeld.png',
        name: 'beeld.png',
        sha: shaBestand,
        size: 4,
        content: Buffer.from([0x89, 0x50, 0x00, 0x0a]).toString('base64'),
      },
      'PUT /repos/pavlo/kern/contents/README.md': {
        commit: { sha: 'c'.repeat(40), html_url: 'https://github.com/pavlo/kern/commit/' + 'c'.repeat(40) },
      },
      'POST /repos/pavlo/kern/pulls': {
        number: 42,
        html_url: 'https://github.com/pavlo/kern/pull/42',
      },
      'DELETE /repos/pavlo/kern/contents/oud.txt': {
        commit: { sha: 'd'.repeat(40) },
      },
      'GET /repos/pavlo/kern/compare/main...feature/ui': {
        status: 'ahead',
        ahead_by: 2,
        behind_by: 0,
        total_commits: 2,
        commits: [{ sha: shaHoofd, commit: { message: 'Оновлення коду', author: { name: 'Pavlo', date: '2026-11-11T12:00:00Z' } }, html_url: 'https://github.com/pavlo/kern/commit/' + shaHoofd }],
        files: [{ filename: 'README.md', status: 'modified', additions: 3, deletions: 1, changes: 4, patch: '@@ -1 +1,3 @@\n-oud\n+nieuw' }],
      },
    });

    const takken = await ghTakkenEnTags('u1', 'pavlo/kern');
    const nieuweTak = await ghTakMaken('u1', 'pavlo/kern', { branch: 'feature/nieuw', fromRef: 'main' });
    const weigerStandaard = await ghTakVerwijderen('u1', 'pavlo/kern', 'main');
    const verwijderTak = await ghTakVerwijderen('u1', 'pavlo/kern', 'feature/oud');
    check(
      'takken & tags: lezen, nieuwe tak maken, standaardtak beschermen en werktak verwijderen',
      takken.ok &&
        takken.data.defaultBranch === 'main' &&
        takken.data.branches.length === 2 &&
        takken.data.tags.length === 1 &&
        nieuweTak.ok &&
        !weigerStandaard.ok &&
        weigerStandaard.error === 'GITHUB_STANDAARD_TAK_BESCHERMD' &&
        verwijderTak.ok,
    );

    const boom = await ghBoom('u1', 'pavlo/kern', { ref: 'main' });
    const tekstBestand = await ghBestandLezen('u1', 'pavlo/kern', { path: 'README.md', ref: 'main' });
    const binairBestand = await ghBestandLezen('u1', 'pavlo/kern', { path: 'beeld.png', ref: 'main' });
    const opgeslagenMetPr = await ghBestandOpslaan('u1', 'pavlo/kern', {
      path: 'README.md',
      content: '# Оновлено\n',
      message: 'Оновлення документації',
      branch: 'main',
      sha: shaBestand,
      nieuweTak: 'feature/nieuw',
      maakPr: true,
      prTitel: 'Оновлення README',
    });
    const verwijderdBestand = await ghBestandVerwijderen('u1', 'pavlo/kern', {
      path: 'oud.txt',
      sha: shaBestand,
      branch: 'feature/nieuw',
    });
    const vergelijking = await ghVergelijken('u1', 'pavlo/kern', { base: 'main', head: 'feature/ui' });
    check(
      'boom, webeditor (met nieuwe tak + PR), binair-detectie, verwijderen en takvergelijking werken volledig',
      boom.ok &&
        boom.data.entries[0].type === 'tree' &&
        tekstBestand.ok &&
        tekstBestand.data.inhoud === '# Вітаємо\n' &&
        !tekstBestand.data.binair &&
        binairBestand.ok &&
        binairBestand.data.binair === true &&
        opgeslagenMetPr.ok &&
        opgeslagenMetPr.data.branch === 'feature/nieuw' &&
        opgeslagenMetPr.data.pullNumber === 42 &&
        verwijderdBestand.ok &&
        vergelijking.ok &&
        vergelijking.data.aheadBy === 2,
    );

    // Vraagstukken, etiketten, samenvoegingsverzoeken, werkstromen & uitgaven
    nepGithub({
      'GET /repos/pavlo/kern/issues/7': {
        number: 7,
        title: 'Покращити мобільне вікно',
        state: 'open',
        user: { login: 'pavlo', avatar_url: '' },
        body: 'Детальний опис задачі',
        labels: [{ name: 'пріоритет', color: '10b981', description: '' }],
        assignees: [{ login: 'pavlo' }],
        comments: 1,
        created_at: '2026-11-11T10:00:00Z',
        updated_at: '2026-11-11T11:00:00Z',
        html_url: 'https://github.com/pavlo/kern/issues/7',
      },
      'GET /repos/pavlo/kern/issues/7/comments': [
        { id: 101, user: { login: 'pavlo', avatar_url: '' }, body: 'Готово до перевірки', created_at: '2026-11-11T11:00:00Z', updated_at: '2026-11-11T11:00:00Z', html_url: '' },
      ],
      'PATCH /repos/pavlo/kern/issues/7': { number: 7, title: 'Покращити мобільне вікно', state: 'closed' },
      'GET /repos/pavlo/kern/labels': [{ name: 'пріоритет', color: '10b981', description: '' }],
      'POST /repos/pavlo/kern/labels': { name: 'безпека', color: 'ef4444', description: 'Важливо' },
      'GET /repos/pavlo/kern/pulls/12': {
        number: 12,
        title: 'Нове робоче середовище GitHub',
        state: 'open',
        merged: false,
        mergeable: true,
        draft: false,
        user: { login: 'pavlo', avatar_url: '' },
        body: 'Повна двостороння синхронізація',
        head: { ref: 'feature/ui', sha: shaHoofd },
        base: { ref: 'main' },
        additions: 120,
        deletions: 10,
        changed_files: 4,
        commits: 2,
        html_url: 'https://github.com/pavlo/kern/pull/12',
        labels: [],
      },
      'GET /repos/pavlo/kern/pulls/12/files': [
        { filename: 'src/GitHubWeergave.tsx', status: 'modified', additions: 120, deletions: 10, changes: 130, patch: '@@ -1 +1 @@\n-a\n+b' },
      ],
      'GET /repos/pavlo/kern/pulls/12/reviews': [
        { id: 501, user: { login: 'reviewer', avatar_url: '' }, state: 'APPROVED', body: 'Схвалено', submitted_at: '2026-11-11T12:00:00Z' },
      ],
      'GET /repos/pavlo/kern/issues/12/comments': [],
      [`GET /repos/pavlo/kern/commits/${shaHoofd}/check-runs`]: {
        check_runs: [{ id: 901, name: 'eenheidstests', status: 'completed', conclusion: 'success', html_url: '' }],
      },
      'POST /repos/pavlo/kern/pulls': { number: 15, html_url: 'https://github.com/pavlo/kern/pull/15' },
      'POST /repos/pavlo/kern/pulls/12/reviews': { id: 502, state: 'APPROVED' },
      'PUT /repos/pavlo/kern/pulls/12/merge': { merged: true, sha: 'e'.repeat(40), message: 'Merged' },
      'GET /repos/pavlo/kern/actions/workflows': {
        workflows: [{ id: 301, name: 'Uitgave', path: '.github/workflows/uitgave.yml', state: 'active', html_url: '' }],
      },
      'POST /repos/pavlo/kern/actions/workflows/301/dispatches': null,
      'POST /repos/pavlo/kern/actions/runs/777/rerun': null,
      'GET /repos/pavlo/kern/releases': [
        {
          id: 801,
          tag_name: 'v2.0.0',
          name: 'Випуск 2.0.0',
          body: 'Нотатки випуску',
          draft: false,
          prerelease: false,
          author: { login: 'pavlo' },
          created_at: '2026-11-11T12:00:00Z',
          published_at: '2026-11-11T12:05:00Z',
          html_url: 'https://github.com/pavlo/kern/releases/tag/v2.0.0',
          assets: [{ id: 1, name: 'pakket.tar.gz', size: 1024, download_count: 3, browser_download_url: 'https://github.com/pavlo/kern/releases/download/v2.0.0/pakket.tar.gz', updated_at: '' }],
        },
      ],
      'POST /repos/pavlo/kern/releases': {
        id: 802,
        tag_name: 'v2.1.0',
        name: 'Випуск 2.1.0',
        body: '',
        draft: false,
        prerelease: false,
        author: { login: 'pavlo' },
        assets: [],
      },
    });

    const zaak = await ghZaakDetail('u1', 'pavlo/kern', 7);
    const zaakDicht = await ghZaakBijwerken('u1', 'pavlo/kern', 7, { state: 'closed' });
    const etiketten = await ghLabels('u1', 'pavlo/kern');
    const nieuwEtiket = await ghLabelMaken('u1', 'pavlo/kern', { name: 'безпека', color: '#ef4444', description: 'Важливо' });
    check(
      'vraagstukken & etiketten: detail met reacties, sluiten en kleur-etiket aanmaken',
      zaak.ok &&
        zaak.data.comments.length === 1 &&
        zaakDicht.ok &&
        zaakDicht.data.state === 'closed' &&
        etiketten.ok &&
        nieuwEtiket.ok &&
        nieuwEtiket.data.label.color === 'ef4444',
    );

    const prDetail = await ghSamenvoegingDetail('u1', 'pavlo/kern', 12);
    const nieuwePr = await ghSamenvoegingMaken('u1', 'pavlo/kern', { title: 'Нова зміна', head: 'feature/ui', base: 'main' });
    const beoordeling = await ghSamenvoegingBeoordelen('u1', 'pavlo/kern', 12, { event: 'APPROVE', body: 'Виглядає чудово' });
    const mergeZonderVink = await ghSamenvoegingUitvoeren('u1', 'pavlo/kern', 12, { mergeMethod: 'squash', bevestigd: false });
    const mergeMetVink = await ghSamenvoegingUitvoeren('u1', 'pavlo/kern', 12, { mergeMethod: 'squash', bevestigd: true });
    check(
      'samenvoegingsverzoeken: bestanden + controles + beoordelingen + verplichte bevestiging vóór samenvoegen',
      prDetail.ok &&
        prDetail.data.files.length === 1 &&
        prDetail.data.checks.length === 1 &&
        prDetail.data.reviews.length === 1 &&
        nieuwePr.ok &&
        beoordeling.ok &&
        !mergeZonderVink.ok &&
        mergeZonderVink.error === 'GITHUB_SAMENVOEGEN_BEVESTIGING_VEREIST' &&
        mergeMetVink.ok &&
        mergeMetVink.data.merged === true,
    );

    const wfLijst = await ghWerkstromen('u1', 'pavlo/kern');
    const wfStart = await ghWerkstroomStarten('u1', 'pavlo/kern', { workflowId: 301, ref: 'main', inputs: { omgeving: 'productie' } });
    const runHerstart = await ghRunBeheer('u1', 'pavlo/kern', { runId: 777, actie: 'rerun' });
    const uitgavenLijst = await ghUitgaven('u1', 'pavlo/kern');
    const nieuweUitgave = await ghUitgaveMaken('u1', 'pavlo/kern', { tagName: 'v2.1.0', name: 'Випуск 2.1.0', targetCommitish: 'main' });
    check(
      'CI-werkstromen & uitgaven: lijst, handmatig starten, herstarten en nieuwe uitgave publiceren',
      wfLijst.ok &&
        wfLijst.data.workflows.length === 1 &&
        wfStart.ok &&
        runHerstart.ok &&
        uitgavenLijst.ok &&
        uitgavenLijst.data.releases[0].assets.length === 1 &&
        nieuweUitgave.ok &&
        nieuweUitgave.data.release.tagName === 'v2.1.0',
    );
  } finally {
    setGithubDeps(null);
  }

  // Webhook-voorcontroles vóór database (sleutellengte, verplichte sha256-kop, maximale grootte)
  const whKort = await ghWebhookVerwerken({ sleutel: 'kort', handtekening: 'sha256=abc', gebeurtenis: 'push', leveringId: '1', rauwLichaam: '{}' });
  const whGeenSig = await ghWebhookVerwerken({ sleutel: 'geldige_webhook_sleutel_123456', handtekening: '', gebeurtenis: 'push', leveringId: '1', rauwLichaam: '{}' });
  const whTeGroot = await ghWebhookVerwerken({
    sleutel: 'geldige_webhook_sleutel_123456',
    handtekening: 'sha256=abc',
    gebeurtenis: 'push',
    leveringId: '1',
    rauwLichaam: 'x'.repeat(1024 * 1024 + 32),
  });
  check(
    'webhook weigert onbekende sleutels, ontbrekende HMAC-kop en te grote lichamen direct',
    !whKort.ok &&
      whKort.status === 404 &&
      !whGeenSig.ok &&
      whGeenSig.fout === 'WEBHOOK_HANDTEKENING_ONTBREEKT' &&
      !whTeGroot.ok &&
      whTeGroot.fout === 'WEBHOOK_TE_GROOT',
  );

  // 3. Menu, AI-hulpmiddelen, beveiliging & migratie 0208
  const subIds = MENU_PAGINAS.github ?? [];
  check(
    'menu van dienst github bevat alle 13 werkruimte- en beheeronderdelen',
    ['overview', 'repositories', 'code', 'issues', 'pulls', 'actions', 'releases', 'sync', 'projects', 'documentation', 'research', 'activity', 'accounts'].every(
      (id) => subIds.includes(id),
    ),
  );

  const v2Namen = new Set(V2_OPTIES.map((h) => h.intern || h.id));
  check(
    'alle 7 nieuwe GitHub-werkruimte-hulpmiddelen staan tweetalig in de connector-v2-catalogus',
    GITHUB_WERKRUIMTE_TOOL_NAMEN.every((naam) => {
      const gevonden = V2_OPTIES.find((h) => h.intern === naam || h.id === naam);
      return v2Namen.has(naam) && Boolean(gevonden?.uk?.[0] && gevonden?.nl?.[0] && gevonden?.uk?.[1] && gevonden?.nl?.[1]);
    }),
  );

  const migratie = readFileSync('migrations/0208_github_spiegel_en_werkruimte.sql', 'utf8');
  const rechten = readFileSync('migrations/rechten.sql', 'utf8');
  check(
    'migratie 0208 dwingt RLS + FORCE ROW LEVEL SECURITY af op alle 4 spiegel- en manifesttabellen en staat in rechten.sql',
    ['github_spiegel_repos', 'github_spiegel_gebeurtenissen', 'github_bord_koppelingen', 'github_eenklik_manifesten'].every(
      (tbl) =>
        migratie.includes(`app.${tbl}`) &&
        new RegExp(`ALTER TABLE app\\.${tbl} ENABLE ROW LEVEL SECURITY`).test(migratie) &&
        new RegExp(`ALTER TABLE app\\.${tbl} FORCE ROW LEVEL SECURITY`).test(migratie) &&
        rechten.includes(`app.${tbl}`),
    ),
  );

  const gecontroleerdeBestanden = [
    'backend/github-eenklik.ts',
    'backend/github-werkruimte.ts',
    'src/GitHubWeergave.tsx',
    'src/github/github-client.tsx',
    'src/github/EenklikKoppelPaneel.tsx',
    'src/github/CodeEnEditorPaneel.tsx',
    'src/github/ZakenEnSamenvoegingenPaneel.tsx',
    'src/github/ActiesEnUitgavenPaneel.tsx',
    'src/github/SpiegelEnBrugPaneel.tsx',
  ];
  check(
    'geen console-logboeken of wachtwoordvelden in de volledige GitHub-werkruimte',
    gecontroleerdeBestanden.every((pad) => {
      const inhoud = readFileSync(pad, 'utf8');
      return !/console\.(log|info|warn|error|debug)/.test(inhoud) && !/type=['"]password['"]/.test(inhoud);
    }),
  );

  return einde();
}
