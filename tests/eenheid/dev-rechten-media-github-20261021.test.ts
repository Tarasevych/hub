// Rechten die «у розробці» stonden, nu ECHT (besluit van de eigenaar, 21.10.2026) — de groepen GitHub, Ontwerp en media,
// Betalingen en Apps (shared/dev-media-github.ts). Wat hier bewezen wordt, met de echte servercode:
//   1. PUUR: de zeven opties zijn actief met een echt hulpmiddel (geen «У розробці»), teksten uk + nl, namen ≤ 64 tekens, scopes en
//      beleid gelijk; Mermaid-controle (wel en niet); SSRF-regels van de lokale generator; PR-voorstel en eigen domein vooraf gekeurd;
//      Stripe in de koppelwizard.
//   2. NAGEBOOTST, zonder database: GitHub (tests/eenheid/hulp/nep-github.ts: Actions-logboeken met omleiding en zip, Git Data API),
//      Stripe (eigen imitatie), en een ECHTE HTTP-generator op 127.0.0.1 (AUTOMATIC1111- en OpenAI-vorm, omleiding, geen beeld, traag).
//   3. MET DATABASE: PR alleen na bevestiging op de site (P1-wachtrij, 0094) — zonder bevestiging nul schrijfverzoeken aan GitHub;
//      beeld en schema in de hmara; ontwerpcontext volgt het palet van de mens; Stripe-route; eigen domein in de technische ruimte
//      met passkey-bevestiging; live rechten van connector v2 (alleen ingeschakelde opties in tools/list) en het oude /mcp kent ze niet.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { checker } from './hulp/nep-google';
import { nepGithub } from './hulp/nep-github';
import { aiDienstAan, aiDienstOpruimen } from './hulp/ruimte-ai';
import { closePool, getPool } from '../../server/platform/pg';
import { V2_OPTIES, v2Optie } from '../../shared/connector-v2/catalogus';
import { V2_AGENTEN } from '../../shared/connector-v2/agenten';
import { MAX_NAAM, NAAM_RE, toolNaam } from '../../shared/connector-v2/namen';
import { hulpmiddelTekst } from '../../shared/hulpmiddel-teksten';
import { DEV_MG_SET, DEV_MG_TOOLS } from '../../shared/dev-media-github';
import { SITE_TOOL_BY_NAME } from '../../backend/site-hulpmiddelen';
import { TOEGESTANE_ROUTES, zetSiteAanroeper } from '../../backend/site-aanroep';
import { scopeVoorTool } from '../../shared/ai-toegang';
import { capabilityForTool, isKnownCapability } from '../../shared/ai-beleid/catalogus';
import { toolInRuimte } from '../../shared/ai-ruimte';
import { controleerMermaid, isMermaidBestand, mermaidBestandsnaam } from '../../shared/mermaid-schema';
import { adresToegestaan, beeldSoort, leesGeneratorUrl, normaliseerGenerator } from '../../shared/media-generator';
import { geldigPad, geldigeBranch, leesPrVoorstel, PR_MAX_BESTANDEN, standaardBranch } from '../../shared/github-pr';
import { leesDomeinVoorstel, siteHosts } from '../../shared/app-domein';
import { WIZARD_PROVIDERS, WIZARD_STAPPEN, geldigeStripeSleutel, wizardWaarden } from '../../shared/integraties-wizard';
import { ghCiLogs, ghCreatePr, logSamenvatting, setGithubDeps } from '../../backend/github-platform';
import { controleerStripe, isBeperkteSleutel, stripeLijst, zetStripeDeps } from '../../backend/betalingen-stripe';
import { doelVan, generatorVerzoek, genereer, opdrachtStand, startOpdracht, zetGeneratorOpzoeker, type GeneratorFout } from '../../backend/media-generator';
import { cssBlokken } from '../../backend/ontwerp-context';
import { SERVICE_HOSTS } from '../../backend/deployment-identity';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const bron = (p: string) => readFileSync(p, 'utf8');
const lees = (r: unknown) => { const x = r as { statusCode: number; body: string }; return { status: x.statusCode, b: x.body ? JSON.parse(x.body) : null }; };
const foutCode = (e: unknown) => String((e as GeneratorFout)?.code || (e as Error)?.message || e);
const vang = async (p: Promise<unknown>) => { try { await p; return 'GEEN_FOUT'; } catch (e) { return foutCode(e); } };

export async function main(): Promise<number> {
  const { check, einde } = checker('dev-rechten-media-github-20261021');

  // ================================================================ 1. puur
  const ids = ['github_pr', 'github_ci_logs', 'app_domain', 'image_generate', 'diagram_generate', 'screenshot_design', 'payments_list'];
  const opties = V2_OPTIES.filter((o) => ids.includes(o.id));
  check('catalogus: de zeven opties zijn ACTIEF, intern = de echte hulpmiddelnaam, geen «dev.»-id meer',
    opties.length === 7 && opties.every((o) => o.status === 'actief' && o.intern === o.id) && !V2_OPTIES.some((o) => ['dev.github_pr', 'dev.github_ci_logs', 'dev.app_domain', 'dev.image_generate', 'dev.diagram_generate', 'dev.screenshot_design', 'dev.payments_list'].includes(o.id))
    && JSON.stringify([...DEV_MG_TOOLS].sort()) === JSON.stringify([...ids].sort()), opties.map((o) => `${o.key}:${o.status}`).join(','));
  check('catalogus: geen «У розробці» / «In ontwikkeling» meer in deze opties; uk en nl verschillen',
    opties.every((o) => ![...o.uk, ...o.nl].some((t) => /розробці|ontwikkeling/i.test(String(t || ''))) && o.uk[0] !== o.nl[0]));
  check('kanten: eigen domein alleen beheer (technisch); de andere zes alleen privé; Stripe gevoelig',
    v2Optie('app_domain:beheer')?.status === 'actief' && !v2Optie('app_domain:gebruiker') && ids.filter((i) => i !== 'app_domain').every((i) => !!v2Optie(`${i}:gebruiker`) && !v2Optie(`${i}:beheer`))
    && v2Optie('payments_list:gebruiker')!.gevoelig && v2Optie('github_pr:gebruiker')!.risico === 'hoog' && v2Optie('app_domain:beheer')!.risico === 'kritiek');
  const namen = V2_AGENTEN.flatMap((a) => opties.map((o) => toolNaam(o, a.slug)));
  check(`namen: ${namen.length} namen (7 × ${V2_AGENTEN.length} agenten) a-z0-9_ en ≤ ${MAX_NAAM} tekens`, namen.every((n) => NAAM_RE.test(n) && n.length <= MAX_NAAM), namen.filter((n) => n.length > MAX_NAAM).join(','));
  check('elk hulpmiddel bestaat als site-hulpmiddel met een toegestane route, en heeft een titel + uitleg in uk en nl',
    ids.every((i) => { const s = SITE_TOOL_BY_NAME.get(i); return !!s && TOEGESTANE_ROUTES.has(s.request(i === 'github_pr' ? { bevestiging_id: randomUUID() } : { repo: 'a/b', code: 'flowchart LR\nA-->B', prompt: 'abc', name: 'notes-app', domain: 'notes.example.org' }).route) && !!hulpmiddelTekst(i, i === 'app_domain' ? 'beheer' : 'gebruiker')?.uitleg.uk && !!hulpmiddelTekst(i)?.uitleg.nl; }));
  check('scopes van de oude laag: CI-logboeken onder github.read, PR onder github.write; beleid: elk hulpmiddel onder een bekende mogelijkheid',
    scopeVoorTool('github_ci_logs') === 'github.read' && scopeVoorTool('github_pr') === 'github.write' && ids.every((i) => !!capabilityForTool(i) && isKnownCapability(capabilityForTool(i)!)));
  check('ruimte: app_domain alleen technisch (ondanks het app_-voorvoegsel); de rest alleen privé',
    toolInRuimte('app_domain', 'technisch') && !toolInRuimte('app_domain', 'prive') && ids.filter((i) => i !== 'app_domain').every((i) => toolInRuimte(i, 'prive') && !toolInRuimte(i, 'technisch')));
  check('PR en eigen domein vragen de bevestiging op de site zelf (niet nog eens de oude goedkeurrij); wie iets maakt of wijzigt is «write: true», lezen niet',
    SITE_TOOL_BY_NAME.get('github_pr')!.eigenBevestiging === true && SITE_TOOL_BY_NAME.get('app_domain')!.eigenBevestiging === true
    && ['github_pr', 'app_domain', 'image_generate', 'diagram_generate'].every((i) => SITE_TOOL_BY_NAME.get(i)!.write === true && SITE_TOOL_BY_NAME.get(i)!.tool.annotations?.readOnlyHint === false)
    && ['github_ci_logs', 'screenshot_design', 'payments_list'].every((i) => SITE_TOOL_BY_NAME.get(i)!.write === false && SITE_TOOL_BY_NAME.get(i)!.tool.annotations?.readOnlyHint === true));
  check('nergens een samenvoegweg: github-platform.ts kent geen /merge en geen force', !/\/merge\b/.test(bron('backend/github-platform.ts')) && !/force:\s*true/.test(bron('backend/github-platform.ts')));
  // ---- installer: `mijn-ruimte-installeer app-domein <host>` — de tunnelregel (alleen het tekstwerk en de weigeringen; root-delen niet)
  {
    const dir = mkdtempSync(join(tmpdir(), 'mr-cf-'));
    writeFileSync(join(dir, 'twee.yml'), '  - service: http_status:404\n  - service: http_status:404\n');
    const sh = `source <(sed -n '/^cf_regel_toevoegen()/,/^}/p;/^app_domein_geldig()/,/^}/p' deploy/installeer-app.sh)
cf_regel_toevoegen deploy/cloudflared-config.yml "$1/uit.yml" notes.example.org 8090; echo "een=$?"
cf_regel_toevoegen "$1/twee.yml" "$1/x.yml" notes.example.org 8090; echo "twee=$?"
for h in notes.example.org hub.tarasevych.com tarasevych.com x.apps.tarasevych.com 1.2.3.4 '*.x.nl' 'a..b' 'A_B.nl'; do app_domein_geldig "$h" tarasevych.com 2>/dev/null && echo "ja:$h" || echo "nee:$h"; done`;
    const r = spawnSync('bash', ['-c', sh, 'proef', dir], { encoding: 'utf8' });
    const uit = (() => { try { return readFileSync(join(dir, 'uit.yml'), 'utf8').split('\n'); } catch { return []; } })();
    const vang = uit.findIndex((l) => l === '  - service: http_status:404');
    const syntax = spawnSync('bash', ['-n', 'deploy/installeer-app.sh'], { encoding: 'utf8' });
    check('installer app-domein: regel vlak vóór de vangregel (host → Caddy 127.0.0.1:8090), weigert twee vangregels, hosts onder het sitedomein (cookies), IP, wildcard; bash -n schoon',
      syntax.status === 0 && /een=0/.test(r.stdout) && /twee=3/.test(r.stdout) && vang > 2 && uit[vang - 2] === '  - hostname: notes.example.org' && uit[vang - 1] === '    service: http://127.0.0.1:8090'
      && /ja:notes\.example\.org/.test(r.stdout) && ['hub.tarasevych.com', 'tarasevych.com', 'x.apps.tarasevych.com', '1.2.3.4', '*.x.nl', 'a..b', 'A_B.nl'].every((h) => r.stdout.includes(`nee:${h}`))
      && /^\s+app-domein\) app_domein "\$@" ;;$/m.test(bron('deploy/installeer-app.sh')) && /app_domein\(\) \{[\s\S]*?vereis_root/.test(bron('deploy/installeer-app.sh')), r.stdout + r.stderr);
    rmSync(dir, { recursive: true, force: true });
  }

  // ---- Mermaid
  const ok = (c: string) => controleerMermaid(c).ok;
  const code = (c: string) => { const o = controleerMermaid(c); return o.ok ? 'OK' : o.code; };
  check('Mermaid: geldige flowchart, sequentie met alt/end, erDiagram met ||--o{, classDiagram met { over regels, frontmatter met alleen title',
    ok('flowchart LR\n  A[Start] --> B{Klaar?}\n  B -->|ja| C((Einde))\n  subgraph S\n    C\n  end')
    && ok('sequenceDiagram\n  Alice->>Bob: Hallo\n  alt goed\n    Bob-->>Alice: Ok\n  else slecht\n    Bob-->>Alice: Nee\n  end')
    && ok('erDiagram\n  KLANT ||--o{ ORDER : plaatst\n  ORDER ||--|{ REGEL : bevat') && ok('classDiagram\n  class Dier {\n    +String naam\n  }\n  Dier <|-- Hond')
    && ok('---\ntitle: Mijn schema\n---\ngraph TD\n  A --> B') && controleerMermaid('---\ntitle: Mijn schema\n---\ngraph TD\n  A --> B').ok && (controleerMermaid('---\ntitle: Mijn schema\n---\ngraph TD\n  A --> B') as { titel: string }).titel === 'Mijn schema'
    && ok('pie title Huisdieren\n  "Honden" : 386\n  "Katten" : 85') && ok('gantt\n  title Plan\n  section A\n  Taak :a1, 2026-10-21, 3d'));
  check('Mermaid: init-directief, script, onclick, javascript:, data:-URL, url(), click-callback, config-frontmatter, onbekend type, verkeerde richting, haakjes, subgraph zonder end, te groot → geweigerd met code',
    code('%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\nA-->B') === 'MERMAID_DIRECTIEF' && code('flowchart LR\nA["<script>alert(1)</script>"]-->B') === 'MERMAID_HTML'
    && code('flowchart LR\nA["<b onclick=x>"]-->B') === 'MERMAID_HTML' && code('flowchart LR\nA-->B\nclick A "javascript:alert(1)"') === 'MERMAID_ADRES'
    && code('flowchart LR\nA["data:text/html;base64,PHM+"]-->B') === 'MERMAID_ADRES' && code('flowchart LR\nA-->B\nstyle A fill:url(https://x)') === 'MERMAID_ADRES'
    && code('flowchart LR\nA-->B\nclick A callback') === 'MERMAID_CLICK' && ok('flowchart LR\nA-->B\nclick A "https://example.org" "Uitleg"')
    && code('---\nconfig:\n  securityLevel: loose\n---\nflowchart LR\nA-->B') === 'MERMAID_FRONTMATTER' && code('mijnDiagram\nA-->B') === 'MERMAID_TYPE'
    && code('flowchart XY\nA-->B') === 'MERMAID_RICHTING' && code('flowchart LR\nA[Open --> B') === 'MERMAID_HAAKJES' && code('flowchart LR\nsubgraph S\nA-->B') === 'MERMAID_BLOK'
    && code(`flowchart LR\n${'A-->B\n'.repeat(900)}`) === 'MERMAID_TE_GROOT' && code('') === 'MERMAID_LEEG' && code(42 as unknown as string) === 'MERMAID_LEEG'
    && (controleerMermaid('flowchart LR\nA-->B\nA[open') as { regel: number }).regel === 3);
  check('Mermaid: veilige bestandsnaam .mmd, herkenning van .mmd', mermaidBestandsnaam('Plan: a/b?') === 'Plan a b.mmd' && mermaidBestandsnaam('') === 'schema.mmd' && isMermaidBestand('x.MMD') && !isMermaidBestand('x.md'));

  // ---- lokale generator: SSRF-regels
  check('adressen: loopback en privénetwerk wel; internet, metadata (169.254), 0.0.0.0, multicast, CGNAT, link-local IPv6 en verpakte IPv4 niet',
    ['127.0.0.1', '127.5.5.5', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.20', '::1', 'fd00::5', '::ffff:192.168.1.2'].every(adresToegestaan)
    && !['8.8.8.8', '169.254.169.254', '0.0.0.0', '224.0.0.1', '100.64.0.1', '172.32.0.1', '192.169.0.1', 'fe80::1', '::ffff:169.254.169.254', '2001:4860::8888', '', 'localhost'].some(adresToegestaan));
  check('adres van de generator: http(s), geen login/query/fragment, verboden dienstpoorten (Docker-API, Caddy-admin, Postgres, SSH)',
    leesGeneratorUrl('http://127.0.0.1:7860').ok && leesGeneratorUrl('http://gpu.lan:8080/sd').ok && (leesGeneratorUrl('http://127.0.0.1:2375') as { code: string }).code === 'MEDIA_GENERATOR_POORT_VERBODEN'
    && ['2019', '5432', '22', '6379'].every((p) => !leesGeneratorUrl(`http://127.0.0.1:${p}`).ok) && (leesGeneratorUrl('http://169.254.169.254/latest') as { code: string }).code === 'MEDIA_GENERATOR_ADRES_VERBODEN'
    && !leesGeneratorUrl('ftp://127.0.0.1/').ok && !leesGeneratorUrl('http://a:b@127.0.0.1:7860').ok && !leesGeneratorUrl('http://127.0.0.1:7860/?x=1').ok && !leesGeneratorUrl('http://8.8.8.8:7860').ok
    && !normaliseerGenerator({ aan: true, url: 'http://169.254.169.254' }).ok && normaliseerGenerator({ aan: false, url: '' }).ok);
  check('beeld herkennen aan de eerste bytes (PNG/JPEG/WebP), nooit aan wat de generator beweert',
    beeldSoort(Buffer.from(PNG_B64, 'base64')) === 'image/png' && beeldSoort(Buffer.from([0xff, 0xd8, 0xff, 0xe0])) === 'image/jpeg' && beeldSoort(Buffer.from('<svg onload=x>')) === null);

  // ---- PR-voorstel en eigen domein (vooraf)
  const pr = (extra: Record<string, unknown>) => leesPrVoorstel({ repo: 'pavlo/proef', title: 'Kleine fix', files: [{ path: 'src/a.ts', content: 'x' }], ...extra });
  check('PR: geldig voorstel; standaardbranch «ai/<titel>-<tijd>»; branchregels (geen .., //, -begin, .lock, HEAD)',
    pr({}).ok && /^ai\/kleine-fix-\d{8}-\d{6}$/.test((pr({}) as { voorstel: { branch: string } }).voorstel.branch) && geldigeBranch('feature/x-1') && geldigeBranch(standaardBranch('Ünïcode titel'))
    && !['a..b', 'a//b', '-x', '/x', 'x/', 'x.lock', 'HEAD', 'a b', 'x/.y', ''].some(geldigeBranch));
  check('PR: .github/workflows en .github/actions, .git, .., absolute paden, dubbele paden, branch = base, te veel of te grote bestanden → geweigerd',
    !pr({ files: [{ path: '.github/workflows/ci.yml', content: 'x' }] }).ok && /CI with the repository secrets/.test((pr({ files: [{ path: '.GitHub/Workflows/x.yml', content: 'x' }] }) as { fout: string }).fout)
    && geldigPad('.github/actions/x/action.yml') === 'PAD_CI' && geldigPad('.git/config') === 'PAD_GIT' && geldigPad('../x') === 'PAD_ONGELDIG' && geldigPad('/etc/passwd') === 'PAD_ONGELDIG' && geldigPad('.github/CODEOWNERS') === null
    && !pr({ files: [{ path: 'a', content: 'x' }, { path: 'a', content: 'y' }] }).ok && !pr({ base: 'main', branch: 'main' }).ok
    && !pr({ files: Array.from({ length: PR_MAX_BESTANDEN + 1 }, (_, i) => ({ path: `f${i}`, content: 'x' })) }).ok && !pr({ files: [{ path: 'groot.bin', content: 'a'.repeat(500_000) }] }).ok
    && !pr({ files: [{ path: 'x', encoding: 'base64', content: '***' }] }).ok && pr({ files: [{ path: 'oud.txt', delete: true }] }).ok);
  const verboden = siteHosts(SERVICE_HOSTS, ['dashboard.tarasevych.com']);
  const dom = (d: string) => leesDomeinVoorstel({ name: 'notes-app', domain: d }, verboden, 'tarasevych.com');
  check('eigen domein vooraf: adressen van de site, het kale domein en ALLES onder het cookiedomein geweigerd; IP, jokerteken en ongeldige naam ook',
    !dom(SERVICE_HOSTS.hub).ok && !dom('tarasevych.com').ok && /login cookies/.test((dom('notes.tarasevych.com') as { fout: string }).fout) && !dom('notes.apps.tarasevych.com').ok
    && !dom('10.0.0.1').ok && !dom('*.example.org').ok && !dom('nietgeldig').ok && dom('notes.example.org').ok && dom('Notes.Example.ORG.').ok && (dom('Notes.Example.ORG.') as { voorstel: { domain: string } }).voorstel.domain === 'notes.example.org'
    && !leesDomeinVoorstel({ name: 'X', domain: 'notes.example.org' }, verboden).ok);

  // ---- Stripe in de wizard
  const sw = WIZARD_PROVIDERS.find((p) => p.id === 'stripe');
  check('koppelwizard: Stripe als provider (kluisdoel «stripe», console + documentatie https, ≥ 3 stappen uk ≠ nl), alleen BEPERKTE sleutels',
    !!sw && sw.kluisDoel === 'stripe' && sw.opslag === 'kluis' && /^https:\/\/dashboard\.stripe\.com\//.test(sw.console.url) && WIZARD_STAPPEN.stripe.length >= 3 && WIZARD_STAPPEN.stripe.every((s) => s.tekst[0] !== s.tekst[1])
    && wizardWaarden(SERVICE_HOSTS).stripe.some((w) => (w.regels || []).includes('Charges: Read')) && geldigeStripeSleutel(`rk_live_${'a'.repeat(24)}`) && !geldigeStripeSleutel(`sk_live_${'a'.repeat(24)}`) && !geldigeStripeSleutel(`pk_test_${'a'.repeat(24)}`)
    && isBeperkteSleutel(`rk_test_${'B1'.repeat(12)}`));

  // ================================================================ 2. nagebootst, zonder database
  // ---- GitHub: CI-logboeken
  const nep = nepGithub();
  const gToken = nep.tokenGeven();
  setGithubDeps({ fetch: globalThis.fetch, token: async () => gToken });
  const repo = nep.repoMaken('pavlo/proef', { 'README.md': '# proef\n', 'oud.txt': 'weg\n' });
  repo.runs.push({ id: 101, name: 'CI', status: 'completed', conclusion: 'failure', head_branch: 'main', head_sha: 'a'.repeat(40), event: 'push', html_url: 'https://github.com/pavlo/proef/actions/runs/101' },
    { id: 100, name: 'CI', status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: 'b'.repeat(40), event: 'push' });
  repo.jobs.set(101, [
    { id: 501, name: 'build', status: 'completed', conclusion: 'failure', steps: [{ number: 1, name: 'Set up job', status: 'completed', conclusion: 'success' }, { number: 2, name: 'Run tests', status: 'completed', conclusion: 'failure' }] },
    { id: 502, name: 'lint', status: 'completed', conclusion: 'success', steps: [{ number: 1, name: 'Lint', status: 'completed', conclusion: 'success' }] },
  ]);
  const regels = Array.from({ length: 3000 }, (_, i) => `2026-10-21T10:00:${String(i % 60).padStart(2, '0')}.1234567Z \u001b[32mregel ${i} in orde\u001b[0m`);
  repo.logs.set(501, [...regels, '2026-10-21T10:01:00.0000000Z ##[error]Test failed: verwacht 1, kreeg 2', '2026-10-21T10:01:01.0000000Z Process completed with exit code 1.'].join('\n'));
  const ci = await ghCiLogs({ userId: 'u-gh' }, 'pavlo/proef', { maxChars: 2000 }) as { ok: true; data: any };
  const logVerzoek = nep.verzoeken.find((v) => v.url.startsWith('https://pipelines.actions.githubusercontent.com/'));
  check('CI-logboeken: zonder run_id de laatste MISLUKTE run; de mislukte job met stappen; de andere job apart',
    ci.ok && ci.data.run.id === 101 && ci.data.jobs.length === 1 && ci.data.jobs[0].id === 501 && ci.data.jobs[0].steps[1].conclusion === 'failure' && ci.data.otherJobs.some((j: any) => j.id === 502), JSON.stringify(ci).slice(0, 300));
  check('CI-logboeken: omleiding naar het ondertekende adres van GitHub gevolgd ZONDER onze token; kleurcodes en tijdstempels weg; foutregel apart; staart ingekort',
    !!logVerzoek && logVerzoek.auth === '' && ci.data.jobs[0].log.source === 'job' && ci.data.jobs[0].log.errors.some((e: string) => /Test failed: verwacht 1, kreeg 2/.test(e))
    && !/\u001b|2026-10-21T10:/.test(ci.data.jobs[0].log.tail) && ci.data.jobs[0].log.truncated === true && ci.data.jobs[0].log.tail.length <= 2100 && /exit code 1/.test(ci.data.jobs[0].log.tail));
  repo.logOmleiding = () => 'https://kwaad.example/steel?x=1';
  const kwaad = await ghCiLogs({ userId: 'u-gh' }, 'pavlo/proef', {}) as { ok: false; error: string };
  repo.logOmleiding = undefined;
  check('CI-logboeken: een omleiding naar een ANDER adres dan GitHub wordt niet gevolgd (GITHUB_LOG_HOST); er gaat niets naar dat adres', !kwaad.ok && kwaad.error === 'GITHUB_LOG_HOST' && !nep.verzoeken.some((v) => v.url.includes('kwaad.example')));
  repo.logWeg.add(501);
  repo.zips.set(101, zipSync({ 'build/1_Set up job.txt': strToU8('2026-10-21T10:00:00.0000000Z klaarzetten'), 'build/2_Run tests.txt': strToU8('2026-10-21T10:00:05.0000000Z ##[error]Boem in de zip'), 'lint/1_Lint.txt': strToU8('alles goed') }));
  const zip = await ghCiLogs({ userId: 'u-gh' }, 'pavlo/proef', { runId: 101 }) as { ok: true; data: any };
  const lint = await ghCiLogs({ userId: 'u-gh' }, 'pavlo/proef', { runId: 101, jobId: 502 }) as { ok: true; data: any };
  check('CI-logboeken: logboek van de job verlopen (410) → de zip van de run als terugval, per job uitgepakt (stappen in volgorde)',
    zip.ok && zip.data.jobs[0].log.source === 'zip' && zip.data.jobs[0].log.errors.some((e: string) => /Boem in de zip/.test(e)) && zip.data.jobs[0].log.tail.indexOf('klaarzetten') < zip.data.jobs[0].log.tail.indexOf('Boem'), JSON.stringify(zip).slice(0, 300));
  check('CI-logboeken: een gekozen job_id; een job_id buiten de run → GITHUB_JOB_ONBEKEND', lint.ok && lint.data.jobs[0].id === 502 && /alles goed/.test(lint.data.jobs[0].log.tail)
    && ((await ghCiLogs({ userId: 'u-gh' }, 'pavlo/proef', { runId: 101, jobId: 999 })) as { error: string }).error === 'GITHUB_JOB_ONBEKEND');
  check('logSamenvatting: korte tekst blijft heel; ANSI weg', logSamenvatting('\u001b[31mfout\u001b[0m\nok', 1000).tail === 'fout\nok' && !logSamenvatting('x', 1000).truncated);

  // ---- GitHub: PR rechtstreeks (zonder de wachtrij: de uitvoerder zelf)
  repo.refs.set('ai/bestaat', repo.refs.get('main')!);
  const blobsVoor = repo.blobs.size;
  const bestaat = await ghCreatePr({ userId: 'u-gh' }, (pr({ branch: 'ai/bestaat' }) as { voorstel: any }).voorstel) as { ok: false; error: string };
  check('PR: een bestaande branch wordt NOOIT overschreven (GITHUB_BRANCH_EXISTS) en er is vóór die controle niets geschreven', !bestaat.ok && bestaat.error === 'GITHUB_BRANCH_EXISTS' && repo.blobs.size === blobsVoor && repo.refs.get('ai/bestaat') === repo.refs.get('main'));
  repo.prWeigeren = true;
  const geweigerd = await ghCreatePr({ userId: 'u-gh' }, (pr({ branch: 'ai/geweigerd' }) as { voorstel: any }).voorstel) as { ok: false; error: string };
  repo.prWeigeren = false;
  check('PR: weigert GitHub de pull request, dan haalt de server de branch die HIJ net maakte weer weg (en alleen die)', !geweigerd.ok && geweigerd.error === 'GITHUB_PR_GEWEIGERD' && !repo.refs.has('ai/geweigerd') && repo.verwijderdeRefs.join() === 'ai/geweigerd' && repo.refs.has('ai/bestaat'));

  // ---- Stripe (eigen imitatie)
  const SLEUTEL = `rk_test_${randomBytes(12).toString('hex')}`;
  const stripeVerzoeken: Array<{ url: string; auth: string; methode: string }> = [];
  let stripeStatus: Record<string, number> = {};
  const stripeFetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input), auth = String((init?.headers as Record<string, string>)?.Authorization || '');
    stripeVerzoeken.push({ url, auth, methode: String(init?.method || 'GET') });
    const u = new URL(url);
    const soort = u.pathname.replace('/v1/', '');
    if (auth !== `Bearer ${SLEUTEL}`) return new Response(JSON.stringify({ error: { type: 'invalid_request_error' } }), { status: 401 });
    if (stripeStatus[soort]) return new Response('{}', { status: stripeStatus[soort] });
    const na = u.searchParams.get('starting_after');
    const alle = soort === 'charges' ? [1, 2, 3].map((i) => ({ id: `ch_test00000${i}`, amount: 1000 * i, currency: 'eur', status: 'succeeded', paid: true, created: 1_760_000_000 + i, description: `Bestelling ${i}`, customer: 'cus_ABC123',
      billing_details: { name: 'Jan Klant', email: 'jan@example.org' }, receipt_email: 'jan@example.org', receipt_url: 'https://pay.stripe.com/receipts/geheim', payment_method_details: { type: 'card', card: { brand: 'visa', last4: '4242' } } }))
      : soort === 'invoices' ? [{ id: 'in_test000001', number: 'F-1', status: 'open', amount_due: 5000, amount_paid: 0, currency: 'eur', created: 1_760_000_100, customer: 'cus_ABC123', customer_email: 'jan@example.org', customer_name: 'Jan Klant', hosted_invoice_url: 'https://invoice.stripe.com/i/geheim' }]
        : [{ id: 'po_test000001', amount: 9000, currency: 'eur', status: 'paid', arrival_date: 1_760_100_000, created: 1_760_000_200, method: 'standard', type: 'bank_account', destination: 'ba_123' }];
    const start = na ? alle.findIndex((x) => x.id === na) + 1 : 0;
    const limit = Number(u.searchParams.get('limit') || 10);
    const deel = alle.slice(start, start + limit);
    return new Response(JSON.stringify({ object: 'list', data: deel, has_more: start + limit < alle.length }), { status: 200 });
  }) as typeof fetch;
  zetStripeDeps({ fetch: stripeFetch, sleutel: async () => SLEUTEL });
  const s1 = await stripeLijst('u-st', { soort: 'charges', limit: 2, created_from: '2025-10-01T00:00:00Z' }) as { ok: true; data: any };
  const s2 = await stripeLijst('u-st', { soort: 'charges', limit: 2, starting_after: s1.ok ? s1.data.nextCursor : '' }) as { ok: true; data: any };
  const json1 = JSON.stringify(s1);
  check('Stripe: alleen GET naar api.stripe.com met de BEPERKTE sleutel als Bearer; paginering met nextCursor → starting_after; created[gte] als unix-tijd',
    s1.ok && s1.data.count === 2 && s1.data.hasMore && s1.data.nextCursor === 'ch_test000002' && s2.ok && s2.data.count === 1 && !s2.data.hasMore && s2.data.items[0].id === 'ch_test000003'
    && stripeVerzoeken.every((v) => v.methode === 'GET' && new URL(v.url).hostname === 'api.stripe.com' && v.auth === `Bearer ${SLEUTEL}`) && new URL(stripeVerzoeken[0].url).searchParams.get('created[gte]') === String(Math.floor(Date.parse('2025-10-01T00:00:00Z') / 1000)));
  check('Stripe: minimaal — geen naam, e-mail, laatste cijfers van de kaart, bon- of factuurlink; de sleutel staat nergens in het antwoord',
    !/Jan Klant|jan@example\.org|4242|receipts\/geheim|invoice\.stripe\.com/.test(json1) && !json1.includes(SLEUTEL) && s1.data.items[0].cardBrand === 'visa' && s1.data.items[0].amount === 1000
    && !/Jan Klant|jan@example|invoice\.stripe\.com/.test(JSON.stringify(await stripeLijst('u-st', { soort: 'invoices' }))));
  const tellerVoor = stripeVerzoeken.length;
  zetStripeDeps({ fetch: stripeFetch, sleutel: async () => `sk_live_${'x'.repeat(30)}` });
  const ruim = await stripeLijst('u-st', {}) as { error: string };
  zetStripeDeps({ fetch: stripeFetch, sleutel: async () => null });
  const geen = await stripeLijst('u-st', {}) as { error: string };
  zetStripeDeps({ fetch: stripeFetch, sleutel: async () => SLEUTEL });
  const cursor = await stripeLijst('u-st', { soort: 'payouts', starting_after: 'ch_verkeerd00' }) as { error: string };
  check('Stripe: volledige geheime sleutel geweigerd ZONDER verzoek; zonder sleutel eerlijk STRIPE_NIET_GEKOPPELD; verkeerde cursor geweigerd vóór een verzoek',
    ruim.error === 'STRIPE_SLEUTEL_TE_RUIM' && geen.error === 'STRIPE_NIET_GEKOPPELD' && cursor.error === 'STRIPE_CURSOR_ONGELDIG' && stripeVerzoeken.length === tellerVoor);
  stripeStatus = { payouts: 403 };
  const recht = await stripeLijst('u-st', { soort: 'payouts' }) as { error: string };
  const controle = await controleerStripe(SLEUTEL);
  stripeStatus = {};
  const goedeControle = await controleerStripe(SLEUTEL);
  const slechteControle = await controleerStripe(`rk_test_${'0'.repeat(24)}`);
  check('Stripe: 403 → STRIPE_RECHT_ONTBREEKT; wizard-controle telt de leesbare lijsten (2 van 3 = let op, 3 = ok), verkeerde sleutel = fout, sk_ = fout zonder verzoek',
    recht.error === 'STRIPE_RECHT_ONTBREEKT' && controle.stand === 'let-op' && controle.n === 2 && goedeControle.stand === 'ok' && goedeControle.code === 'STRIPE_OK' && goedeControle.n === 3
    && slechteControle.code === 'STRIPE_SLEUTEL_ONGELDIG' && (await controleerStripe(`sk_live_${'a'.repeat(24)}`)).code === 'STRIPE_SLEUTEL_TE_RUIM' && (await controleerStripe(null)).stand === 'let-op');

  // ---- lokale generator: een ECHTE HTTP-server op 127.0.0.1
  const ontvangen: Array<{ methode: string; pad: string; body: any }> = [];
  const gen = createServer((req: IncomingMessage, res: ServerResponse) => {
    const delen: Buffer[] = [];
    req.on('data', (d) => delen.push(d));
    req.on('end', () => {
      let body: any = null; try { body = JSON.parse(Buffer.concat(delen).toString('utf8') || 'null'); } catch { body = null; }
      ontvangen.push({ methode: String(req.method), pad: String(req.url), body });
      const stuur = (status: number, data: unknown, kop: Record<string, string> = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...kop }); res.end(typeof data === 'string' ? data : JSON.stringify(data)); };
      if (req.url === '/sdapi/v1/txt2img' && req.method === 'POST') return stuur(200, { images: [PNG_B64], info: JSON.stringify({ seed: 4242 }) });
      if (req.url === '/v1/images/generations' && req.method === 'POST') return stuur(200, { data: [{ b64_json: PNG_B64 }] });
      if (req.url === '/sdapi/v1/sd-models') return stuur(200, [{ model_name: 'sd15', title: 'sd15.safetensors' }]);
      if (req.url === '/omleiding/sdapi/v1/txt2img') return stuur(302, '', { location: 'http://169.254.169.254/latest/meta-data/' });
      if (req.url === '/tekst/sdapi/v1/txt2img') return stuur(200, { images: [Buffer.from('<svg onload=alert(1)>').toString('base64')] });
      if (req.url === '/traag/sdapi/v1/txt2img') return void setTimeout(() => stuur(200, {}), 3000);
      if (req.url === '/groot/x') return stuur(200, 'a'.repeat(300_000));
      return stuur(404, { detail: 'Not Found' });
    });
  });
  await new Promise<void>((r) => gen.listen(0, '127.0.0.1', () => r()));
  const poort = (gen.address() as { port: number }).port;
  const BASIS = `http://127.0.0.1:${poort}`;
  const inst = { aan: true, url: BASIS, soort: 'a1111' as const, model: 'sd15', timeoutS: 30, maxZijde: 1024, stappen: 20 };
  const v = { prompt: 'Een vuurtoren bij nacht', negative: 'tekst', width: 512, height: 512, steps: 12 };
  const b1 = await genereer(inst, v);
  const b2 = await genereer({ ...inst, soort: 'openai' }, v);
  check('generator (AUTOMATIC1111-vorm): vast pad /sdapi/v1/txt2img, prompt, maat, stappen, model; PNG en het zaad terug',
    b1.mime === 'image/png' && b1.seed === 4242 && ontvangen[0].pad === '/sdapi/v1/txt2img' && ontvangen[0].body.prompt === v.prompt && ontvangen[0].body.width === 512 && ontvangen[0].body.steps === 12 && ontvangen[0].body.override_settings?.sd_model_checkpoint === 'sd15');
  check('generator (OpenAI-vorm): /v1/images/generations met b64_json en size', b2.mime === 'image/png' && ontvangen[1].pad === '/v1/images/generations' && ontvangen[1].body.size === '512x512' && ontvangen[1].body.response_format === 'b64_json');
  const aantal = ontvangen.length;
  check('generator: omleiding wordt NIET gevolgd (ook niet naar 169.254.169.254); antwoord zonder echt beeld geweigerd; traag → tijdsgrens; te groot → grens',
    (await vang(genereer({ ...inst, url: `${BASIS}/omleiding` }, v))) === 'MEDIA_GENERATOR_OMLEIDING' && ontvangen.length === aantal + 1
    && (await vang(genereer({ ...inst, url: `${BASIS}/tekst` }, v))) === 'MEDIA_GENERATOR_ANTWOORD'
    && (await vang(generatorVerzoek(`${BASIS}/traag`, '/sdapi/v1/txt2img', { methode: 'POST', body: {}, timeoutMs: 300 }))) === 'MEDIA_GENERATOR_TIJD'
    && (await vang(generatorVerzoek(`${BASIS}/groot`, '/x', { methode: 'GET', timeoutMs: 3000, maxBytes: 100_000 }))) === 'MEDIA_GENERATOR_TE_GROOT');
  check('generator: zonder adres eerlijk «niet ingesteld», uit = «uit»', (await vang(genereer({ ...inst, url: '' }, v))) === 'MEDIA_GENERATOR_NIET_INGESTELD' && (await vang(genereer({ ...inst, aan: false }, v))) === 'MEDIA_GENERATOR_UIT');
  // DNS: de naam wordt opgezocht, ELK antwoord getoetst, en daarna wordt met precies dat adres verbonden.
  zetGeneratorOpzoeker(async (h) => (h === 'lokaal.test' ? [{ address: '127.0.0.1', family: 4 }] : h === 'kwaad.test' ? [{ address: '169.254.169.254', family: 4 }]
    : h === 'gemengd.test' ? [{ address: '127.0.0.1', family: 4 }, { address: '8.8.8.8', family: 4 }] : h === 'zes.test' ? [{ address: 'fe80::1', family: 6 }] : []));
  const viaNaam = await genereer({ ...inst, url: `http://lokaal.test:${poort}` }, v);
  check('SSRF: een naam die naar loopback wijst werkt (en verbindt met het gecontroleerde IP); naar metadata, gemengd met internet, link-local IPv6 of onbekend → geweigerd zonder verzoek',
    viaNaam.mime === 'image/png' && (await doelVan(`http://lokaal.test:${poort}`)).ip === '127.0.0.1'
    && (await vang(genereer({ ...inst, url: `http://kwaad.test:${poort}` }, v))) === 'MEDIA_GENERATOR_ADRES_VERBODEN' && (await vang(doelVan('http://gemengd.test:7860'))) === 'MEDIA_GENERATOR_ADRES_VERBODEN'
    && (await vang(doelVan('http://zes.test:7860'))) === 'MEDIA_GENERATOR_ADRES_VERBODEN' && (await vang(doelVan('http://onbekend.test:7860'))) === 'MEDIA_GENERATOR_DNS' && ontvangen.length === aantal + 5);
  // Achtergrondopdrachten: wachten, dan een job_id; alleen de eigen mens ziet de stand.
  const traag = await startOpdracht('u-gen', () => new Promise((r) => setTimeout(() => r({ klaar: true }), 150)), 10);
  const langer = 'job_id' in traag ? traag.job_id : '';
  await new Promise((r) => setTimeout(r, 300));
  check('opdrachten: na de wachttijd «running» met job_id; daarna «done» met het resultaat; een ander ziet de opdracht niet',
    'status' in traag && traag.status === 'running' && (opdrachtStand('u-gen', langer) as { status: string }).status === 'done' && (opdrachtStand('iemand-anders', langer) as { error: string }).error === 'MEDIA_OPDRACHT_ONBEKEND');
  check('ontwerpcontext: de CSS-lezer haalt variabelen uit blokken en @media', cssBlokken(':root{--a:1px;--b:#fff}\n@media (max-width:5px){.x{color:red}}').some((b) => b.selector === ':root' && b.declaraties.length === 2) && cssBlokken('@media (x){.k{a:b}}')[0].media.startsWith('@media'));

  // ================================================================ 3. met database
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { gen.close(); nep.herstel(); console.log('OVERGESLAGEN dev-rechten (integratie): geen database'); return einde(); }
  const sys = getPool('systeem');
  const map = await mkdtemp(join(tmpdir(), 'mr-dev-mg-'));
  process.env.UPLOADS_DIR = map;
  const A = `mg-a-${randomUUID()}`, B = `mg-b-${randomUUID()}`;
  const ab = await import('../../backend/ai-bevestiging');
  const mg = await import('../../backend/dev-mg-bevestiging');
  const { devMgRoutes } = await import('../../backend/dev-mg-routes');
  const { zetGeneratorInstelling } = await import('../../backend/media-generator');
  const v2 = await import('../../backend/connector-v2');
  const c = await import('../../backend/mcp-connector');
  const ct = await import('../../backend/connectors-hulpmiddelen');
  const cstore = await import('../../backend/connectors-opslag');
  const { sleutelsUitScopes } = await import('../../backend/connector-v2-erfenis');
  const { AI_TOEGANG_SCOPES } = await import('../../shared/ai-toegang');
  const tp = await import('../../backend/tech-profiel');
  const { wizardControleer } = await import('../../backend/integraties-wizard');
  let E = '';
  let eTijdelijk = false;
  let eOrigineel: unknown = null;
  try {
    for (const u of [A, B]) await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [u, { email: `${u}@test.invalid`, role: 'member', status: 'approved' }]);
    const tabel = (await sys.query("SELECT to_regclass('app.ai_bevestiging') AS t, to_regclass('app.ai_media_generator') AS g, to_regclass('app.app_eigen_domeinen') AS d")).rows[0];
    check('migraties: 0094 (bevestigingsrij van P1) en 0095 (generator, eigen domeinen) staan in de database', !!tabel.t && !!tabel.g && !!tabel.d, JSON.stringify(tabel));

    // ---- PR alleen na bevestiging op de site
    const schrijf = () => nep.verzoeken.filter((x) => x.methode !== 'GET' && /\/repos\/pavlo\/proef\/(git|pulls)/.test(x.url)).length;
    const voorSchrijf = schrijf();
    const vraag = await mg.prVoorstelRoute(A, { repo: 'pavlo/proef', title: 'Kleine fix', body: 'Waarom', files: [{ path: 'src/a.ts', content: 'export const a = 1;\n' }, { path: 'oud.txt', delete: true }] }, { wachtMs: 50 });
    const id = vraag.ok ? vraag.data.bevestiging_id : '';
    check('PR: de aanroep van de AI maakt ALLEEN een verzoek (status «wacht» + bevestiging_id) — nul schrijfverzoeken aan GitHub', vraag.ok && vraag.data.status === 'wacht' && /^[0-9a-f-]{36}$/.test(id) && schrijf() === voorSchrijf, JSON.stringify(vraag));
    const kaart = (await ab.lijstVoorMens(A, 'prive')).find((x) => x.id === id);
    const tekst = JSON.stringify(kaart?.beschrijving ?? {});
    check('PR: de kaart op de site toont repository, branch, elk pad met grootte (+ en −) en de waarschuwing, in uk en nl; risico hoog = passkey',
      !!kaart && kaart.soort === mg.SOORT_PR && kaart.risico === 'hoog' && kaart.stapOp && /pavlo\/proef/.test(tekst) && /\+ src\/a\.ts/.test(tekst) && /− oud\.txt/.test(tekst) && /Злиття|Samenvoegen/.test(tekst));
    const fout = async (p: Promise<unknown>) => { try { await p; return 'GEEN'; } catch (e) { return (e as { code?: string }).code || String(e); } };
    check('PR: bevestigen zonder verse passkey → STEP_UP_STRONG_REQUIRED; door een ander account → onbekend; nog altijd niets op GitHub',
      (await fout(ab.bevestig({ userId: A, id, ruimte: 'prive', hash: kaart?.hash || '', stapOp: false }))) === 'STEP_UP_STRONG_REQUIRED'
      && (await fout(ab.bevestig({ userId: B, id, ruimte: 'prive', hash: kaart?.hash || '', stapOp: true }))) === 'BEVESTIGING_ONBEKEND' && schrijf() === voorSchrijf);
    const klaar = await ab.bevestig({ userId: A, id, ruimte: 'prive', hash: kaart?.hash || '', stapOp: true });
    const nieuwPr = repo.pulls[repo.pulls.length - 1];
    const branchNaam = nieuwPr?.head || '';
    const tree = repo.trees.get(repo.commits.get(repo.refs.get(branchNaam) || '')?.tree || '');
    check('PR: NA de bevestiging maakt de server branch + één commit + pull request; het bestand staat erin, het verwijderde niet; main onaangeroerd; nooit samengevoegd',
      klaar.status === 'uitgevoerd' && !!nieuwPr && nieuwPr.base === 'main' && /^ai\/kleine-fix-/.test(branchNaam) && tree?.get('src/a.ts') === 'export const a = 1;\n' && !tree?.has('oud.txt')
      && repo.trees.get(repo.commits.get(repo.refs.get('main')!)!.tree)!.has('oud.txt') && repo.samenvoegPogingen === 0 && klaar.uitkomst.some((u) => /#\d+ https:\/\/github\.com\/pavlo\/proef\/pull\//.test(u.waarde)), JSON.stringify(klaar).slice(0, 300));
    const stand = await mg.prVoorstelRoute(A, { bevestiging_id: id }, { wachtMs: 0 });
    check('PR: de AI haalt later met alleen bevestiging_id het resultaat op (nummer en adres); een ander account niet',
      stand.ok && stand.data.status === 'uitgevoerd' && (stand.data.resultaat as { number: number }).number === nieuwPr.number && !(await mg.prVoorstelRoute(B, { bevestiging_id: id }, { wachtMs: 0 })).ok);
    const tweede = await mg.prVoorstelRoute(A, { repo: 'pavlo/proef', title: 'Tweede voorstel', files: [{ path: 'b.txt', content: 'b' }] }, { wachtMs: 50 });
    const prsVoor = repo.pulls.length;
    await ab.weiger({ userId: A, id: tweede.ok ? tweede.data.bevestiging_id : '', ruimte: 'prive' });
    const naWeiger = await mg.prVoorstelRoute(A, { bevestiging_id: tweede.ok ? tweede.data.bevestiging_id : '' }, { wachtMs: 0 });
    check('PR: geweigerd op de site → er komt niets op GitHub, en de AI hoort «geweigerd»', repo.pulls.length === prsVoor && naWeiger.ok && naWeiger.data.status === 'geweigerd');
    const slechtVoorstel = await mg.prVoorstelRoute(A, { repo: 'pavlo/proef', title: 'CI aanpassen', files: [{ path: '.github/workflows/ci.yml', content: 'on: push' }] }, { wachtMs: 0 });
    check('PR: een voorstel voor .github/workflows komt niet eens in de wachtrij (eerlijke fout voor de AI)', !slechtVoorstel.ok && /GITHUB_PR_INVOER:.*CI/.test(slechtVoorstel.error));

    // ---- media-routes (hmara) en ontwerpcontext, Stripe-route
    let dienst = 'cloud';
    const R = devMgRoutes({ requireSession: async () => ({ service: dienst, user: { id: A, email: `${A}@test.invalid`, role: 'member', status: 'approved' } }) as never });
    const roep = async (pad: string, body: Record<string, unknown>) => lees(await (R[pad][0] as (x: unknown) => Promise<unknown>)({ event: { headers: {} }, body, params: {}, query: {} }));
    const MMD = 'flowchart LR\n  A[Idee] --> B{Goed?}\n  B -->|ja| C[Bouwen]';
    const d1 = await roep('POST /api/owner/media/diagram', { code: MMD, title: 'Mijn plan' });
    const item = d1.b?.itemId ? (await sys.query("SELECT data FROM app.records WHERE tbl = 'cloud_items_v1' AND id = $1", [d1.b.itemId])).rows[0]?.data : null;
    check('schema: gecontroleerde Mermaid als «Mijn plan.mmd» in de hmara van DEZE mens (privélade), met de code als tekst',
      d1.status === 200 && d1.b.type === 'flowchart' && !!item && item.originalName === 'Mijn plan.mmd' && item.ownerUserId === A && (item.ruimte ?? 'prive') === 'prive' && item.textContent === MMD && item.tags.includes('mermaid') && /^https:\/\//.test(d1.b.open), JSON.stringify(d1));
    const d2 = await roep('POST /api/owner/media/diagram', { code: '%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\nA-->B' });
    check('schema: een init-directief → 400 met code en regel, niets bewaard', d2.status === 400 && d2.b.error === 'MERMAID_DIRECTIEF' && d2.b.regel === 1);
    await sys.query('DELETE FROM app.ai_media_generator');
    const g0 = await roep('POST /api/owner/media/afbeelding', { prompt: 'Een vuurtoren' });
    check('beeld: zonder ingestelde generator eerlijk MEDIA_GENERATOR_NIET_INGESTELD (de tekst zegt hoe de eigenaar hem start)', g0.status === 409 && g0.b.error === 'MEDIA_GENERATOR_NIET_INGESTELD');
    await zetGeneratorInstelling({ ...inst, model: '' }, 'test');
    const g1 = await roep('POST /api/owner/media/afbeelding', { prompt: 'Een vuurtoren bij nacht', width: 512, height: 512, title: 'Vuurtoren' });
    const beeld = g1.b?.result?.itemId ? (await sys.query("SELECT data FROM app.records WHERE tbl = 'cloud_items_v1' AND id = $1", [g1.b.result.itemId])).rows[0]?.data : null;
    check('beeld: de lokale generator maakt het, de server bewaart het als PNG in de hmara van de mens (tag ai-afbeelding)',
      g1.status === 200 && g1.b.status === 'done' && g1.b.result.mimeType === 'image/png' && !!beeld && beeld.mimeType === 'image/png' && beeld.ownerUserId === A && beeld.tags.includes('ai-afbeelding') && beeld.originalName === 'vuurtoren.png', JSON.stringify(g1).slice(0, 300));
    await zetGeneratorInstelling({ ...inst, url: `http://kwaad.test:${poort}` }, 'test');
    const g2 = await roep('POST /api/owner/media/afbeelding', { prompt: 'Een vuurtoren' });
    check('beeld: een instelling die via DNS naar metadata wijst → opdracht mislukt met MEDIA_GENERATOR_ADRES_VERBODEN, geen verzoek', g2.status === 200 && g2.b.status === 'failed' && g2.b.error === 'MEDIA_GENERATOR_ADRES_VERBODEN');
    await sys.query('DELETE FROM app.ai_media_generator');
    const o1 = await roep('POST /api/owner/media/ontwerp-context', {});
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('owner_ui_preferences_v1',$1,$2)", [`pref-${A}`, { userId: A, menu: [], weergave: { gebruiker: { versie: 1, palet: 'puur', modus: 'dark' }, technisch: { versie: 1 } }, updatedAt: Date.now(), createdAt: Date.now() }]);
    const o2 = await roep('POST /api/owner/media/ontwerp-context', { sectie: 'mail' });
    check('ontwerpcontext: echte tokens (status, ritme), primitieven (.knop), lettertypen; standaard palet «kleur» per sectie; alleen stijlen (geen e-mail of id van de mens)',
      o1.status === 200 && o1.b.palet.naam === 'kleur' && /^#[0-9a-f]{6}$/i.test(o1.b.palet.licht['--accent']) && o1.b.staat.licht['--ok'] === '#166534' && o1.b.ritme['--ruimte-4'] === '16px'
      && o1.b.primitieven.some((p: { selector: string }) => /\.knop/.test(p.selector)) && o1.b.lettertypen.length > 0 && !JSON.stringify(o1.b).includes(A) && o1.b.bron['src/ontwerp/tokens.css'] === 'gelezen',
      JSON.stringify({ accent: o1.b?.palet?.licht?.['--accent'], ok: o1.b?.staat?.licht?.['--ok'], ritme: o1.b?.ritme?.['--ruimte-4'], prim: o1.b?.primitieven?.length, fonts: o1.b?.lettertypen?.length, bron: o1.b?.bron }));
    check('ontwerpcontext: volgt de keuze van DEZE mens (palet «puur», modus donker): zuiver wit/zwart', o2.status === 200 && o2.b.keuze.palet === 'puur' && o2.b.keuze.modus === 'dark' && o2.b.palet.licht['--bg'] === '#ffffff' && o2.b.palet.donker['--bg'] === '#000000');
    dienst = 'hub';
    const p1 = await roep('POST /api/owner/betalingen/stripe', { soort: 'payouts' });
    zetStripeDeps({ fetch: stripeFetch, sleutel: async () => null });
    const p2 = await roep('POST /api/owner/betalingen/stripe', {});
    zetStripeDeps({ fetch: stripeFetch, sleutel: async () => SLEUTEL });
    dienst = 'mail';
    const p3 = await roep('POST /api/owner/betalingen/stripe', {});
    check('Stripe-route: uitbetalingen gelezen; zonder sleutel 409 STRIPE_NIET_GEKOPPELD; vanuit een andere dienst geweigerd',
      p1.status === 200 && p1.b.items[0].id === 'po_test000001' && p2.status === 409 && p2.b.error === 'STRIPE_NIET_GEKOPPELD' && p3.status === 403);
    dienst = 'cloud';
    check('wizard: «Перевірити» voor Stripe doet een echt verzoek met de sleutel van deze beheerder (3 lijsten leesbaar)', (await wizardControleer('stripe', A)).code === 'STRIPE_OK');

    // ---- connector v2: levende rechten; het oude /mcp kent deze hulpmiddelen niet
    const kop = { userId: A, clientName: 'Claude', tokenId: randomUUID(), agent: 'claude' as const, ruimte: 'prive' as const, limietSleutel: `t-${randomUUID()}` };
    const alleenSchema = { kanten: ['gebruiker' as const], sleutels: ['diagram_generate:gebruiker', 'v2_whoami:gebruiker'] };
    const naamSchema = toolNaam(v2Optie('diagram_generate:gebruiker')!, 'claude');
    const lijst1 = (await v2.v2Lijst(kop, alleenSchema, 'prive')).map((t) => t.name);
    const allesPrive = { kanten: ['gebruiker' as const], sleutels: ids.filter((i) => i !== 'app_domain').map((i) => `${i}:gebruiker`) };
    const lijst2 = await v2.v2Lijst(kop, allesPrive, 'prive');
    check('v2 tools/list: alleen wat ingeschakeld is — met alleen «Створювати схеми» precies die naam, de andere vijf niet',
      lijst1.includes(naamSchema) && !lijst1.some((n) => ['image_generate', 'github_pr', 'payments_list', 'screenshot_design', 'github_ci_logs'].some((i) => n === toolNaam(v2Optie(`${i}:gebruiker`)!, 'claude'))), lijst1.join(','));
    check('v2 tools/list: alle zes privé-opties aan → zes namen, met Oekraïense titel en uitleg (de taal van de mens), PR en schema met invoerschema',
      ids.filter((i) => i !== 'app_domain').every((i) => lijst2.some((t) => t.name === toolNaam(v2Optie(`${i}:gebruiker`)!, 'claude')))
      && lijst2.find((t) => t.name === naamSchema)!.title === 'Створювати схеми' && /Mermaid/.test(lijst2.find((t) => t.name === naamSchema)!.description)
      && !!(lijst2.find((t) => t.name === toolNaam(v2Optie('github_pr:gebruiker')!, 'claude'))?.inputSchema as { properties?: Record<string, unknown> })?.properties?.files);
    const routes: Array<{ service: string; route: string; body: Record<string, unknown> }> = [];
    zetSiteAanroeper(async (_u, service, route, body) => { routes.push({ service, route, body }); return { status: 200, data: { itemId: 'proef', type: 'flowchart' } }; });
    // Iets in de hmara AANMAKEN is schrijven: standaard «vragen» (de oude goedkeuringsrij), zoals create_task en manage_hub_notes;
    // PR en domein hebben hun eigen passkey-bevestiging en dus geen tweede rij; lezen gaat meteen.
    check('standaardmodus: schema/afbeelding «vragen», PR/domein via de eigen bevestiging (geen tweede rij), CI-logboek/ontwerp/betalingen meteen',
      ct.defaultMode('diagram_generate') === 'ask' && ct.defaultMode('image_generate') === 'ask' && ct.defaultMode('github_pr') === 'always' && ct.defaultMode('app_domain') === 'always'
      && ['github_ci_logs', 'screenshot_design', 'payments_list'].every((t) => ct.defaultMode(t) === 'always'));
    await cstore.setToolModes(A, { diagram_generate: null });
    const wacht = v2.v2Roep(kop, alleenSchema, naamSchema, { code: MMD }, 'prive');
    const inRij = await (async () => { for (let i = 0; i < 60; i++) { const r = (await cstore.listToolCalls(A)).find((x) => x.tool === 'diagram_generate' && x.status === 'pending_approval'); if (r) return r; await new Promise((z) => setTimeout(z, 100)); } return null; })();
    const nogNiets = routes.length;
    const goed = inRij ? await ct.approveToolCall(A, inRij.id) : null;
    const r1 = await wacht;
    const r2 = await v2.v2Roep(kop, alleenSchema, toolNaam(v2Optie('image_generate:gebruiker')!, 'claude'), { prompt: 'x y z' }, 'prive');
    zetSiteAanroeper(null);
    check('v2 tools/call: schema wacht op goedkeuring (nog geen route), daarna Nederlandse naam → intern hulpmiddel → route van de hmara (dienst cloud) met de code; NIET ingeschakelde optie → PERMISSION_OFF',
      !!inRij && nogNiets === 0 && goed?.status === 'succeeded' && !r1.isError && routes.length === 1 && routes[0].route === 'POST /api/owner/media/diagram' && routes[0].service === 'cloud' && routes[0].body.code === MMD && !!r2.isError && /PERMISSION_OFF/.test(r2.content[0].text), JSON.stringify({ r1, r2 }).slice(0, 300));
    const oud = { userId: A, clientName: 'Claude', tokenId: randomUUID(), ruimte: 'prive' as const };
    const oudeLijst = (await c.lijstTools(oud)).map((t) => t.name);
    const oudeRoep = await c.roepTool(oud, 'diagram_generate', { code: MMD });
    check('oude /mcp: de zeven hulpmiddelen staan NIET in tools/list en een aanroep met de interne naam → V2_ONLY',
      !oudeLijst.some((n) => DEV_MG_SET.has(n)) && oudeLijst.length > 10 && !!oudeRoep.isError && /V2_ONLY/.test(oudeRoep.content[0].text));
    const erf = sleutelsUitScopes(['gebruiker', 'beheer'], AI_TOEGANG_SCOPES.map((s) => s.id));
    check('erfenis van het oude /mcp: geen van de zeven komt vanzelf mee, ook niet met alle scopes', !erf.some((k) => DEV_MG_SET.has(k.split(':')[0])) && erf.length > 10);

    // ---- eigen domein: technische ruimte, passkey-bevestiging, dan pas de route op het apparaat
    const bestaand = (await sys.query("SELECT id, data FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1")).rows[0] as { id: string; data: Record<string, unknown> } | undefined;
    E = bestaand?.id ?? `mg-e-${randomUUID()}`;
    eOrigineel = bestaand?.data ?? null;
    if (!bestaand) { eTijdelijk = true; await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [E, { email: process.env.OWNER_EMAIL, role: 'owner', status: 'approved' }]); }
    const eMail = String((bestaand?.data as { email?: string })?.email || process.env.OWNER_EMAIL);
    await sys.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['eigenaar'], 480, 'test') ON CONFLICT (user_id) DO NOTHING`, [E, `tech-${randomBytes(6).toString('hex')}`]);
    await tp.activeren({ id: E, email: eMail, role: 'owner', status: 'approved' }, randomBytes(24).toString('hex'), 60, 'test: eigen domein');
    await aiDienstAan(E);
    mg.zetDnsLezer({ cname: async (h) => (h === 'notes.example.org' ? ['abc123.cfargotunnel.com'] : Promise.reject(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))), a: async () => [], aaaa: async () => [] });
    const gezet: Array<{ name: string; domain: string }> = [];
    mg.zetDomeinDeps({ agenten: async () => [{ id: 'srv-1', name: 'server', platform: 'linux', ruimte: 'technisch', capabilities: { apps: true } }], online: () => true,
      route: async (_u, _a, p) => { gezet.push(p); return { ok: true, data: { routed: true, url: `https://${p.domain}` } }; } });
    await sys.query('DELETE FROM app.app_eigen_domeinen WHERE host = ANY($1)', [['notes.example.org']]);
    const priveVraag = await mg.domeinVoorstelRoute(E, 'prive', { name: 'notes-app', domain: 'notes.example.org' });
    const siteVraag = await mg.domeinVoorstelRoute(E, 'technisch', { name: 'notes-app', domain: SERVICE_HOSTS.admin });
    const cookieVraag = await mg.domeinVoorstelRoute(E, 'technisch', { name: 'notes-app', domain: 'notes.tarasevych.com' });
    check('eigen domein: vanuit de privéruimte bestaat het niet; een adres van de site of onder het cookiedomein komt niet in de wachtrij',
      !priveVraag.ok && priveVraag.error === 'BEVESTIGING_RUIMTE_NIET_TOEGESTAAN' && !siteVraag.ok && /APP_DOMEIN_INVOER/.test(siteVraag.error) && !cookieVraag.ok && /login cookies/.test(cookieVraag.error));
    const dv = await mg.domeinVoorstelRoute(E, 'technisch', { name: 'notes-app', domain: 'notes.example.org' }, { wachtMs: 50 });
    const did = dv.ok ? dv.data.bevestiging_id : '';
    const dkaart = (await ab.lijstVoorMens(E, 'technisch')).find((x) => x.id === did);
    check('eigen domein: voorstel in de TECHNISCHE wachtrij, risico kritiek (passkey), DNS al nagekeken (tunnel), tunnelopdracht op de kaart — en nog GEEN route gezet',
      dv.ok && dv.data.status === 'wacht' && !!dkaart && dkaart.risico === 'kritiek' && dkaart.stapOp && /cfargotunnel/.test(JSON.stringify(dkaart.beschrijving)) && /mijn-ruimte-installeer app-domein notes\.example\.org/.test(JSON.stringify(dkaart.beschrijving)) && gezet.length === 0, JSON.stringify(dv));
    check('eigen domein: bevestigen vanuit de privéruimte → andere ruimte, niets gezet', (await fout(ab.bevestig({ userId: E, id: did, ruimte: 'prive', hash: dkaart?.hash || '', stapOp: true }))) === 'BEVESTIGING_ANDERE_RUIMTE' && gezet.length === 0);
    const dklaar = await ab.bevestig({ userId: E, id: did, ruimte: 'technisch', hash: dkaart?.hash || '', stapOp: true });
    const rij = (await sys.query('SELECT app, agent_id, status, dns FROM app.app_eigen_domeinen WHERE host = $1', ['notes.example.org'])).rows[0];
    check('eigen domein: NA de passkey-bevestiging zet de server de route op het serverapparaat (apps.route) en legt de host vast; de AI krijgt de tunnelopdracht',
      dklaar.status === 'uitgevoerd' && gezet.length === 1 && gezet[0].name === 'notes-app' && gezet[0].domain === 'notes.example.org' && rij?.app === 'notes-app' && rij?.agent_id === 'srv-1' && rij?.dns?.tunnel === true
      && dklaar.uitkomst.some((u) => /mijn-ruimte-installeer app-domein notes\.example\.org/.test(u.waarde)), JSON.stringify(dklaar).slice(0, 300));
    const dv2 = await mg.domeinVoorstelRoute(E, 'technisch', { name: 'andere-app', domain: 'notes.example.org' }, { wachtMs: 50 });
    const dk2 = (await ab.lijstVoorMens(E, 'technisch')).find((x) => x.id === (dv2.ok ? dv2.data.bevestiging_id : ''));
    const dklaar2 = await ab.bevestig({ userId: E, id: dk2?.id || '', ruimte: 'technisch', hash: dk2?.hash || '', stapOp: true });
    check('eigen domein: dezelfde host voor een ANDERE app → mislukt met APP_DOMEIN_IN_GEBRUIK, geen tweede route', dklaar2.status === 'mislukt' && dklaar2.fout === 'APP_DOMEIN_IN_GEBRUIK' && gezet.length === 1);
  } finally {
    zetSiteAanroeper(null);
    mg?.zetDomeinDeps?.(null); mg?.zetDnsLezer?.(null);
    zetGeneratorOpzoeker(null); zetStripeDeps(null); setGithubDeps(null);
    await sys.query('DELETE FROM app.ai_media_generator').catch(() => undefined);
    await sys.query("DELETE FROM app.app_eigen_domeinen WHERE host = 'notes.example.org'").catch(() => undefined);
    await sys.query('DELETE FROM app.ai_bevestiging WHERE user_id = ANY($1)', [[A, B, E].filter(Boolean)]).catch(() => undefined);
    await sys.query('DELETE FROM app.connector_tool_calls WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await sys.query('DELETE FROM app.connector_tool_settings WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'cloud_items_v1' AND data->>'ownerUserId' = ANY($1)", [[A, B]]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'owner_ui_preferences_v1' AND data->>'userId' = ANY($1)", [[A, B]]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [[A, B]]).catch(() => undefined);
    if (E) {
      await tp.beeindigenBijIntrekken(E, 'handmatig').catch(() => undefined);
      await aiDienstOpruimen([E]);
      if (eTijdelijk) await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [E]).catch(() => undefined);
      else if (eOrigineel) await sys.query("UPDATE app.records SET data = $2 WHERE tbl = 'users' AND id = $1", [E, eOrigineel]).catch(() => undefined);
    }
    await rm(map, { recursive: true, force: true }).catch(() => undefined);
    gen.close();
    nep.herstel();
    await closePool();
  }
  return einde();
}
