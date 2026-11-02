// Voorcontrole van een uitrolpakket, VÓÓR de goedkeuring met de passkey.
//
// Waarom: de goedkeuring met passkey is de enige weg om de site op afstand bij te werken. Dan moet de eigenaar vooraf weten of dit pakket de
// site kan breken. Deze module pakt het pakket in een tijdelijke map uit en voert alleen STATISCHE controles uit (nooit code uit het pakket):
//   structuur   één bovenmap, gewone bestanden en mappen, geen links/apparaten/paden buiten de map, redelijke omvang
//   versie      UITROL-VERSIE klopt met het voorstel en is nieuwer dan de actieve versie
//   metadata    AUTEUR, AGENT en SAMENVATTING (≥ 20 tekens) — dezelfde regels als root (deploy/uitrol/mijn-ruimte-uitrol.sh)
//   commit      BRON-COMMIT = 40-hex git-commit (ok) of «zonder-git:<reden>» (waarschuwing); anders fout GEEN_BRON_COMMIT (regel 3)
//   scripts     `bash -n` (syntaxis) van alle shell-scripts onder deploy/ — het installatiescript en het root-script worden als root gebruikt
//   bouwen      package.json (geldig, build-script), package-lock.json, vite- en server-bouwbestanden, de ingangen van de app
//   migraties   naamreeks, geen dubbele nummers; NIEUWE migraties met DROP TABLE/COLUMN, TRUNCATE, DELETE zonder WHERE of RENAME → waarschuwing
//               (een databasemigratie wordt bij een terugdraaien niet teruggedraaid)
//   geheimen    privésleutels, tokens of .env-bestanden in het pakket → waarschuwing (alleen bestandsnamen, nooit inhoud)
// Uitkomst: { ok, fouten, waarschuwingen, controles[] }. «fout» blokkeert de goedkeuring; «waarschuwing» niet. Bouwen (npm ci + vite) en
// migreren gebeuren pas bij de installatie, geïsoleerd, met database-back-up, gezondheidscontrole, nabewaking en automatisch terugdraaien.
import { MANIFEST_BESTAND, MANIFEST_MAX, TESTRESULTATEN_MAX, leesTestresultaten, manifestVerplicht, testDetails, valideerManifest } from '../shared/uitrol-manifest';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
import { bronCommit } from '../shared/bron-commit';
import { GEHEIM_PATRONEN_STRIKT } from '../shared/geheim-patronen';
export type Niveau = 'ok' | 'waarschuwing' | 'fout';
export type Controle = { id: string; niveau: Niveau; uk: string; nl: string; details?: string[] };
export type PakketMeta = { auteur: string; agent: string; samenvatting: string; bestanden: number; bytesUitgepakt: number; commit: string; bovenmap: string;
  /** UI-010: gevalideerd manifest (deelnemers, beschrijving uk+nl); blijft in uitrol_voorstellen.pakket_meta, ook na intrekken van rechten. */
  manifest?: import('../shared/uitrol-manifest').Manifest | null };
export type Voorcontrole = { versie: 1; tijd: string; ok: boolean; fouten: number; waarschuwingen: number; controles: Controle[] };
export type VoorcontroleUitkomst = { resultaat: Voorcontrole; meta: PakketMeta };

const VERSIE = /^[0-9]{8}-[0-9]{6}$/;
const MAX_UITGEPAKT = 1.5 * 1024 ** 3;
const MAX_BESTANDEN = 60000;
const TAR = ['/usr/bin/tar', '/bin/tar'];
const BASH = ['/usr/bin/bash', '/bin/bash'];
const eerste = async (kandidaten: string[]) => { for (const k of kandidaten) { try { await stat(k); return k; } catch { /* volgende */ } } return kandidaten[0]; };

type Regel = { type: string; bytes: number; naam: string };
async function lijst(pakket: string): Promise<Regel[]> {
  const tar = await eerste(TAR);
  const { stdout } = await run(tar, ['--list', '--verbose', '--gzip', '--quoting-style=literal', '--file', pakket], { maxBuffer: 64 * 1024 * 1024, timeout: 60_000, env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' } });
  const uit: Regel[] = [];
  for (const r of stdout.split('\n')) {
    const m = /^(.)\S{9}\s+\S+\s+(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s(.*)$/.exec(r);
    if (m) uit.push({ type: m[1], bytes: Number(m[2]), naam: m[1] === 'l' || m[1] === 'h' ? m[3].replace(/ (?:->|link to) .*$/, '') : m[3] });
  }
  return uit;
}

const kaal = (s: string) => s.replace(/\r/g, '').replace(/\0/g, '').trim();
const leesMeta = async (dir: string, naam: string, max: number) => { try { return kaal((await readFile(path.join(dir, naam))).subarray(0, max).toString('utf8')); } catch { return ''; } };
async function alleBestanden(dir: string, basis = dir, uit: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') await alleBestanden(p, basis, uit); } else if (e.isFile()) uit.push(path.relative(basis, p));
    if (uit.length > MAX_BESTANDEN) break;
  }
  return uit;
}

const SQL_RISICO: Array<[RegExp, string, string]> = [
  [/\bDROP\s+(?:TABLE|COLUMN|SCHEMA|DATABASE|TYPE)\b/i, 'DROP TABLE/COLUMN/SCHEMA', 'DROP TABLE/COLUMN/SCHEMA'],
  [/\bALTER\s+TABLE\b[^;]*\bDROP\s+COLUMN\b/i, 'DROP COLUMN', 'DROP COLUMN'],
  [/\bTRUNCATE\b/i, 'TRUNCATE', 'TRUNCATE'],
  [/\bDELETE\s+FROM\s+[\w."]+\s*(?:;|$)/im, 'DELETE FROM zonder WHERE', 'DELETE FROM zonder WHERE'],
  [/\bALTER\s+TABLE\b[^;]*\bRENAME\b/i, 'RENAME', 'RENAME'],
  [/\bALTER\s+COLUMN\b[^;]*\b(?:SET\s+DATA\s+)?TYPE\b/i, 'kolomtype wijzigen', 'kolomtype wijzigen'],
];
// De patronen staan sinds 22.10.2026 in shared/geheim-patronen.ts (GEHEIM_PATRONEN_STRIKT), gedeeld met de zoekindex.
const GEHEIM_PATRONEN = GEHEIM_PATRONEN_STRIKT;

export async function pakketVoorcontrole(pakket: string, opties: { versie: string; actieveVersie?: string; toegepasteMigraties?: ReadonlySet<string> | null; tests?: { geslaagd?: number | null; mislukt?: number | null } | null }): Promise<VoorcontroleUitkomst> {
  const controles: Controle[] = [];
  const voeg = (id: string, niveau: Niveau, uk: string, nl: string, details?: string[]) => { controles.push({ id, niveau, uk, nl, ...(details?.length ? { details: details.slice(0, id === 'tests' || id === 'manifest' ? 120 : 12) } : {}) }); };
  const meta: PakketMeta = { auteur: '', agent: '', samenvatting: '', bestanden: 0, bytesUitgepakt: 0, commit: '', bovenmap: '' };
  let werk = '';
  try {
    // ---- 1. structuur (lijst, nog niet uitpakken)
    let regels: Regel[] = [];
    try { regels = await lijst(pakket); } catch (e) {
      voeg('structuur', 'fout', 'Архів не читається як tar.gz.', 'Het archief is niet te lezen als tar.gz.', [String((e as Error).message).slice(0, 200)]);
      return afronden(controles, meta);
    }
    const slecht: string[] = []; const toppen = new Set<string>(); let wortelBestand = false; let bytes = 0;
    for (const r of regels) {
      const naam = r.naam.replace(/^\.\//, '');
      const delen = naam.split('/').filter((d) => d && d !== '.');
      if (naam.startsWith('/') || delen.includes('..') || naam.includes('\\')) slecht.push(`onveilig pad: ${naam.slice(0, 80)}`);
      if (!['-', 'd', '0'].includes(r.type)) slecht.push(`niet-toegestaan type '${r.type}': ${naam.slice(0, 80)}`);
      if (delen.length === 1 && r.type !== 'd') wortelBestand = true; else if (delen.length) toppen.add(delen[0]);
      bytes += r.bytes;
    }
    meta.bestanden = regels.filter((r) => r.type !== 'd').length; meta.bytesUitgepakt = bytes;
    if (toppen.size > 1 || (toppen.size === 1 && wortelBestand)) slecht.push('het archief moet precies één bovenmap hebben');
    if (!regels.length) slecht.push('het archief is leeg');
    if (bytes > MAX_UITGEPAKT || meta.bestanden > MAX_BESTANDEN) slecht.push(`te groot na uitpakken (${Math.round(bytes / 1048576)} MB, ${meta.bestanden} bestanden)`);
    if (slecht.length) { voeg('structuur', 'fout', 'Структура архіву небезпечна або некоректна.', 'De structuur van het archief is onveilig of onjuist.', slecht); return afronden(controles, meta); }
    voeg('structuur', 'ok', `Структура в порядку: одна тека, ${meta.bestanden} файлів, ${Math.round(bytes / 1048576)} МБ після розпакування.`, `Structuur in orde: één map, ${meta.bestanden} bestanden, ${Math.round(bytes / 1048576)} MB uitgepakt.`);

    // ---- uitpakken (alleen bestanden; geen uitvoering)
    werk = await mkdtemp(path.join(tmpdir(), 'uitrol-voorcontrole-'));
    await run(await eerste(TAR), ['--extract', '--gzip', '--no-same-owner', '--no-same-permissions', '--file', pakket, '-C', werk], { timeout: 90_000, maxBuffer: 8 * 1024 * 1024, env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' } });
    let bron = werk;
    if (!(await stat(path.join(werk, 'UITROL-VERSIE')).catch(() => null))) {
      const top = await readdir(werk);
      if (top.length === 1) bron = path.join(werk, top[0]);
      meta.bovenmap = top.length === 1 ? top[0] : '';
    }
    const bestaat = async (p: string) => !!(await stat(path.join(bron, p)).catch(() => null));

    // ---- 2. versie
    const inhoudVersie = await leesMeta(bron, 'UITROL-VERSIE', 64).then((v) => v.replace(/\s+/g, ''));
    if (!inhoudVersie) voeg('versie', 'fout', 'У архіві немає файлу UITROL-VERSIE.', 'UITROL-VERSIE ontbreekt in het archief.');
    else if (!VERSIE.test(inhoudVersie)) voeg('versie', 'fout', `UITROL-VERSIE «${inhoudVersie.slice(0, 20)}» має бути РРРРММДД-ГГХХСС.`, `UITROL-VERSIE «${inhoudVersie.slice(0, 20)}» moet JJJJMMDD-UUMMSS zijn.`);
    else if (inhoudVersie !== opties.versie) voeg('versie', 'fout', `Версія в архіві (${inhoudVersie}) не збігається із заявленою (${opties.versie}).`, `Versie in het archief (${inhoudVersie}) wijkt af van de opgegeven versie (${opties.versie}).`);
    else if (opties.actieveVersie && VERSIE.test(opties.actieveVersie) && !(inhoudVersie > opties.actieveVersie)) voeg('versie', 'fout', `Версія ${inhoudVersie} не новіша за встановлену (${opties.actieveVersie}) — сервер відхилить такий пакет.`, `Versie ${inhoudVersie} is niet nieuwer dan de geïnstalleerde (${opties.actieveVersie}) — de server weigert zo’n pakket.`);
    else voeg('versie', 'ok', `Версія ${inhoudVersie}${opties.actieveVersie ? ` новіша за встановлену (${opties.actieveVersie})` : ''}.`, `Versie ${inhoudVersie}${opties.actieveVersie ? ` is nieuwer dan de geïnstalleerde (${opties.actieveVersie})` : ''}.`);

    // ---- 3. metadata (zelfde regels als root)
    meta.auteur = await leesMeta(bron, 'AUTEUR', 200);
    meta.agent = await leesMeta(bron, 'AGENT', 40);
    meta.samenvatting = (await leesMeta(bron, 'SAMENVATTING', 8000)).replace(/\n{3,}/g, '\n\n');
    const bc = bronCommit(await leesMeta(bron, 'BRON-COMMIT', 200));
    meta.commit = bc.waarde;
    const m: string[] = [];
    if (!meta.auteur) m.push('AUTEUR ontbreekt (хто автор)'); else if (meta.auteur.length < 3) m.push('AUTEUR is te kort');
    if (!meta.agent) m.push('AGENT ontbreekt (через якого агента зроблено)'); else if (!/^[a-z][a-z0-9-]{1,31}$/.test(meta.agent)) m.push('AGENT moet kleine letters zijn, bv. claude/cursor/gpt');
    if (!meta.samenvatting) m.push('SAMENVATTING ontbreekt — опису змін немає, встановлення неможливе'); else if (meta.samenvatting.replace(/\s+/g, ' ').length < 20) m.push('SAMENVATTING is te kort (minstens 20 tekens)');
    if (m.length) voeg('metadata', 'fout', 'Метадані випуску неповні — сервер відхилить пакет: ' + m.join('; ') + '.', 'Metadata van de release onvolledig — de server weigert het pakket: ' + m.join('; ') + '.');
    else voeg('metadata', 'ok', `Метадані є: автор ${meta.auteur}, агент ${meta.agent}, опис ${meta.samenvatting.replace(/\s+/g, ' ').length} символів.`, `Metadata aanwezig: auteur ${meta.auteur}, agent ${meta.agent}, beschrijving ${meta.samenvatting.replace(/\s+/g, ' ').length} tekens.`);

    // ---- 3a. UI-010: UITROL-MANIFEST.json (tweetalige beschrijving + deelnemers). Zelfde regels als de browser (shared/uitrol-manifest.ts).
    {
      const ruw = (await stat(path.join(bron, MANIFEST_BESTAND)).catch(() => null)) ? await leesMeta(bron, MANIFEST_BESTAND, MANIFEST_MAX) : null;
      if (ruw != null) {
        const r = valideerManifest(ruw, inhoudVersie);
        if (r.fouten.length) voeg('manifest', 'fout', `MANIFEST_ONGELDIG: у ${MANIFEST_BESTAND} бракує або неправильні поля (${r.fouten.length}). Виправте їх і зберіть пакет знову.`, `MANIFEST_ONGELDIG: ${MANIFEST_BESTAND} heeft ontbrekende of ongeldige velden (${r.fouten.length}). Herstel ze en bouw het pakket opnieuw.`, r.fouten.map((f) => `${f.veld}: ${f.uk} · ${f.nl}`));
        else { const m = r.manifest!; meta.manifest = m; const ai = m.deelnemers.filter((d) => d.soort === 'ai'); voeg('manifest', 'ok', `Опис українською й нідерландською є; учасників ${m.deelnemers.length}${m.zonderAi ? ' (без ШІ)' : `, ШІ-агентів ${ai.length}`}.`, `Beschrijving in het Oekraïens en Nederlands aanwezig; ${m.deelnemers.length} deelnemer(s)${m.zonderAi ? ' (zonder AI)' : `, ${ai.length} AI-agent(en)`}.`, m.deelnemers.map((d) => `${d.soort}: ${d.naam}${d.platform ? ` · ${d.platform}` : ''}${d.soort === 'ai' ? ` · model ${d.model?.id || 'onbekend'} (${d.model?.bron})` : ''} · ${d.rollen.join(',')}`)); }
      } else if (manifestVerplicht(inhoudVersie)) voeg('manifest', 'fout', `GEEN_MANIFEST: у пакеті немає ${MANIFEST_BESTAND} (опис uk+nl і учасники) — для нових випусків він обов’язковий.`, `GEEN_MANIFEST: ${MANIFEST_BESTAND} ontbreekt (beschrijving uk+nl en deelnemers) — verplicht voor nieuwe releases.`, ['deploy/REGELS-UITROLPAKKET.md §5']);
      else voeg('manifest', 'waarschuwing', 'Старий формат пакета: опис лише мовою оригіналу, без переліку ШІ-агентів і моделей. Встановлення дозволене.', 'Oud pakketformaat: beschrijving alleen in de oorspronkelijke taal, zonder lijst van AI-agenten en modellen. Installeren mag.');
    }

    // ---- 3b. commit (regel 3, shared/bron-commit.ts; root weigert met dezelfde regel): blokkeert bij ontbreken, waarschuwt bij «zonder git».
    if (bc.status === 'git') voeg('commit', 'ok', `Коміт ${bc.commit.slice(0, 12)} — випуск відтворюваний з git.`, `Commit ${bc.commit.slice(0, 12)} — de release is te herleiden tot git.`);
    else if (bc.status === 'zonder-git') voeg('commit', 'waarschuwing', `Пакет зібрано поза git (явно вказано): ${bc.reden}. Відтворити збірку з коміту не вийде.`, `Pakket buiten git gebouwd (uitdrukkelijk opgegeven): ${bc.reden}. De build is niet uit een commit te herhalen.`);
    else voeg('commit', 'fout', 'GEEN_BRON_COMMIT: у пакеті немає дійсного BRON-COMMIT (40-символьний git-коміт або «zonder-git:<причина>»). Сервер відхилить пакет — див. deploy/REGELS-UITROLPAKKET.md.', 'GEEN_BRON_COMMIT: het pakket heeft geen geldige BRON-COMMIT (40-tekens git-commit of «zonder-git:<reden>»). De server weigert het pakket — zie deploy/REGELS-UITROLPAKKET.md.', [bc.status === 'ontbreekt' ? 'BRON-COMMIT ontbreekt of is leeg' : 'BRON-COMMIT heeft een ongeldige vorm (bv. «unknown» of een korte hash)']);

    // ---- 4. scripts (syntaxis)
    const alle = await alleBestanden(bron);
    const scripts = alle.filter((f) => /^deploy\/.*\.sh$/.test(f.replace(/\\/g, '/')));
    const kapot: string[] = [];
    for (const s of scripts.slice(0, 120)) {
      try { await run(await eerste(BASH), ['-n', path.join(bron, s)], { timeout: 10_000, env: { PATH: '/usr/bin:/bin' } }); }
      catch (e) { kapot.push(`${s}: ${String((e as { stderr?: string }).stderr || (e as Error).message).split('\n')[0].slice(0, 120)}`); }
    }
    if (!(await bestaat('deploy/installeer-app.sh'))) voeg('scripts', 'fout', 'Немає deploy/installeer-app.sh.', 'deploy/installeer-app.sh ontbreekt.');
    else if (kapot.length) voeg('scripts', 'fout', `У ${kapot.length} скриптах синтаксична помилка — вони виконуються від root.`, `${kapot.length} script(s) hebben een syntaxisfout — ze draaien als root.`, kapot);
    else voeg('scripts', 'ok', `Синтаксис ${scripts.length} shell-скриптів у порядку (bash -n).`, `Syntaxis van ${scripts.length} shell-scripts in orde (bash -n).`);

    // ---- 5. bouwen
    const bouw: string[] = []; const bouwWaarschuwing: string[] = [];
    let pkg: { scripts?: Record<string, string>; dependencies?: Record<string, string> } | null = null;
    try { pkg = JSON.parse(await readFile(path.join(bron, 'package.json'), 'utf8')); } catch { bouw.push('package.json ontbreekt of is geen geldige JSON'); }
    if (pkg && !pkg.scripts?.build) bouw.push('package.json heeft geen "build"-script');
    if (!(await bestaat('package-lock.json'))) bouw.push('package-lock.json ontbreekt (npm ci faalt)');
    for (const f of ['index.html', 'server/migrate.ts', 'scripts/build-server.mjs', 'backend/index.ts']) if (!(await bestaat(f))) bouw.push(`${f} ontbreekt`);
    if (!(await bestaat('vite.config.ts')) && !(await bestaat('vite.config.js')) && !(await bestaat('vite.config.mjs'))) bouwWaarschuwing.push('geen vite-configuratie gevonden');
    if (bouw.length) voeg('bouwen', 'fout', 'Бракує файлів, потрібних для збірки на сервері.', 'Bestanden die de build op de server nodig heeft, ontbreken.', bouw);
    else if (bouwWaarschuwing.length) voeg('bouwen', 'waarschuwing', 'Збірка: є зауваження.', 'Bouwen: er zijn opmerkingen.', bouwWaarschuwing);
    else voeg('bouwen', 'ok', 'Усі файли для збірки на місці (package.json, lock-файл, vite, серверна збірка).', 'Alle bouwbestanden aanwezig (package.json, lockbestand, vite, serverbundel).');

    // ---- 6. migraties
    const mig = alle.map((f) => f.replace(/\\/g, '/')).filter((f) => /^migrations\/[^/]+\.sql$/.test(f)).sort();
    const migFout: string[] = []; const nummers = new Set<string>(); const nieuw: string[] = []; const risico: string[] = [];
    for (const f of mig) {
      const naam = path.basename(f, '.sql');
      if (!/^\d{4}_[a-z0-9_]+$/.test(naam) && naam !== 'rechten') { if (naam !== 'rechten') migFout.push(`ongeldige naam: ${naam}`); continue; }
      if (naam === 'rechten') continue;
      const nr = naam.slice(0, 4);
      if (nummers.has(nr)) migFout.push(`dubbel nummer ${nr}`); nummers.add(nr);
      const toegepast = opties.toegepasteMigraties;
      if (toegepast && !toegepast.has(naam)) {
        nieuw.push(naam);
        const sql = (await readFile(path.join(bron, f), 'utf8')).replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const [re, , nl] of SQL_RISICO) if (re.test(sql)) risico.push(`${naam}: ${nl}`);
      }
    }
    if (migFout.length) voeg('migraties', 'fout', 'Міграції: помилка в нумерації/назвах.', 'Migraties: fout in nummering/namen.', migFout);
    else if (risico.length) voeg('migraties', 'waarschuwing', `Нові міграції містять руйнівні команди (${risico.length}). Міграції при відкаті НЕ відкочуються — стара версія коду має працювати з новою схемою.`, `Nieuwe migraties bevatten ingrijpende opdrachten (${risico.length}). Migraties worden bij terugdraaien NIET teruggedraaid — de oude code moet met het nieuwe schema werken.`, risico);
    else voeg('migraties', 'ok', opties.toegepasteMigraties ? `Міграції в порядку: ${mig.length} усього, ${nieuw.length} нових${nieuw.length ? ` (${nieuw.join(', ')})` : ''}; руйнівних команд немає.` : `Міграції в порядку: ${mig.length} файлів.`, opties.toegepasteMigraties ? `Migraties in orde: ${mig.length} in totaal, ${nieuw.length} nieuw${nieuw.length ? ` (${nieuw.join(', ')})` : ''}; geen ingrijpende opdrachten.` : `Migraties in orde: ${mig.length} bestanden.`);

    // ---- 7. geheimen (alleen namen)
    const gevonden: string[] = [];
    for (const f of alle) {
      const n = f.replace(/\\/g, '/');
      if (/(^|\/)\.env(\.|$)/.test(n) && !/\.(example|sample|dist)$/.test(n)) gevonden.push(`${n}: .env-bestand`);
      if (/\.(pem|key|p12|pfx)$/i.test(n) && !/^tests?\//.test(n)) gevonden.push(`${n}: sleutelbestand`);
    }
    for (const f of alle.filter((x) => /\.(ts|tsx|js|mjs|json|sh|md|txt|ya?ml|env|sql)$/i.test(x) && !/(^|\/)package-lock\.json$/.test(x)).slice(0, 4000)) {
      if (gevonden.length > 20) break;
      const st = await stat(path.join(bron, f)).catch(() => null); if (!st || st.size > 2 * 1024 * 1024) continue;
      const t = await readFile(path.join(bron, f), 'utf8').catch(() => '');
      for (const [re, soort] of GEHEIM_PATRONEN) if (re.test(t)) { gevonden.push(`${f.replace(/\\/g, '/')}: ${soort}`); break; }
    }
    if (gevonden.length) voeg('geheimen', 'waarschuwing', 'Схоже, у пакеті є секрети (ключі/токени/.env). Перевірте перед схваленням.', 'Het pakket lijkt geheimen te bevatten (sleutels/tokens/.env). Controleer vóór het goedkeuren.', gevonden);
    else voeg('geheimen', 'ok', 'Явних секретів (приватні ключі, токени, .env) не знайдено.', 'Geen duidelijke geheimen (privésleutels, tokens, .env) gevonden.');

    // ---- 8. tests van de voorbereider (informatief): uit het voorstel (MCP-weg), en anders uit het bestand TESTRESULTATEN
    // in het pakket zelf (JSON {geslaagd, mislukt, samenvatting}; deploy/uitrol/maak-voorstelpakket.sh schrijft het mee).
    // Zo draagt ook een pakket dat als los .tar.gz via de wizard of SSH binnenkomt zijn eigen testuitslag — tot 29.10.2026
    // stuurde de wizard altijd «tests: {}» en stond hier bij elke release «де voorbereider meldde geen testresultaten».
    // UI-010 (eis van de eigenaar): niet alleen «61 mislukt», maar WELKE bestanden en of ze ook op de basis faalden.
    // De lijst komt altijd uit TESTRESULTATEN in het pakket (ook als het voorstel alleen getallen meegaf).
    const uitPakket = leesTestresultaten(await leesMeta(bron, 'TESTRESULTATEN', TESTRESULTATEN_MAX));
    const voorstel = opties.tests && (opties.tests.geslaagd != null || opties.tests.mislukt != null) ? { geslaagd: opties.tests.geslaagd ?? null, mislukt: opties.tests.mislukt ?? null } : null;
    const tests = voorstel ? { ...voorstel, uitPakket: false } : uitPakket ? { geslaagd: uitPakket.geslaagd, mislukt: uitPakket.mislukt, uitPakket: true } : null;
    const bronTekst = tests?.uitPakket ? [' (файл TESTRESULTATEN у пакеті)', ' (bestand TESTRESULTATEN in het pakket)'] : ['', ''];
    const det = uitPakket ? testDetails(uitPakket) : [];
    const bekend = uitPakket?.falend ? uitPakket.falend.filter((f) => f.ookOpBasis === true).length : 0;
    const nieuwF = uitPakket?.falend ? uitPakket.falend.filter((f) => f.ookOpBasis === false).length : 0;
    const basis = uitPakket?.basis;
    const basisTekst = basis ? [` На базовій версії ${basis.versie || '—'}: пройдено ${basis.geslaagd ?? '—'}, не пройдено ${basis.mislukt ?? '—'}.`, ` Op de basisversie ${basis.versie || '—'}: ${basis.geslaagd ?? '—'} geslaagd, ${basis.mislukt ?? '—'} mislukt.`] : ['', ''];
    const uitleg = uitPakket?.uitleg ? [` ${uitPakket.uitleg.uk || uitPakket.uitleg.nl}`, ` ${uitPakket.uitleg.nl || uitPakket.uitleg.uk}`] : ['', ''];
    const detailTekst = !uitPakket?.falend ? [' Деталі (які саме тести) недоступні в цьому пакеті.', ' Details (welke tests) zijn niet beschikbaar in dit pakket.']
      : [` Файлів із помилками: ${uitPakket.falend.length} — ті самі й на базовій версії: ${bekend}, нові: ${nieuwF}.`, ` Bestanden met fouten: ${uitPakket.falend.length} — ook op de basis: ${bekend}, nieuw: ${nieuwF}.`];
    if (tests && tests.mislukt != null && tests.mislukt > 0) voeg('tests', 'waarschuwing', `Пройдено ${tests.geslaagd ?? '—'}, не пройдено ${tests.mislukt}${bronTekst[0]}.${detailTekst[0]}${basisTekst[0]}${uitleg[0]}`, `${tests.geslaagd ?? '—'} geslaagd, ${tests.mislukt} mislukt${bronTekst[1]}.${detailTekst[1]}${basisTekst[1]}${uitleg[1]}`, det);
    else if (tests && tests.geslaagd != null && tests.geslaagd > 0) voeg('tests', 'ok', `Підготовник повідомив: ${tests.geslaagd} тестів пройдено${bronTekst[0]}.`, `De voorbereider meldde: ${tests.geslaagd} tests geslaagd${bronTekst[1]}.`);
    else voeg('tests', 'waarschuwing', 'Підготовник не повідомив результатів тестів (ані в пропозиції, ані файлом TESTRESULTATEN у пакеті).', 'De voorbereider meldde geen testresultaten (niet in het voorstel en niet via TESTRESULTATEN in het pakket).');
  } catch (e) {
    // Toon de echte tar-/gzip-fout, niet alleen de afgekorte opdrachtregel van execFile.
    // Geen stdout (kan inhoud bevatten); maximaal zes geschoonde stderr-regels voor de eigenaar.
    const fout = e as Error & { stderr?: string | Buffer; code?: string | number; signal?: string; killed?: boolean };
    const diagnostiek = String(fout.stderr ?? '')
      .split(/\r?\n/)
      .map((regel) => regel.replace(/[\u0000-\u001f\u007f]/g, ' ').trim())
      .filter(Boolean)
      .slice(-6)
      .map((regel) => regel.slice(0, 400));
    if (!diagnostiek.length) diagnostiek.push(String(fout.message || e).slice(0, 900));
    if (fout.code !== undefined && fout.code !== null) diagnostiek.unshift(`exitcode: ${String(fout.code).slice(0, 40)}`);
    if (fout.killed || fout.signal) diagnostiek.unshift(`timeout/signaal: ${String(fout.signal || 'timeout').slice(0, 40)}`);
    voeg('voorcontrole', 'fout', 'Перевірку пакета не вдалося виконати.', 'De voorcontrole kon niet worden uitgevoerd.', diagnostiek);
  } finally {
    if (werk) await rm(werk, { recursive: true, force: true }).catch(() => undefined);
  }
  return afronden(controles, meta);
}

function afronden(controles: Controle[], meta: PakketMeta): VoorcontroleUitkomst {
  const fouten = controles.filter((c) => c.niveau === 'fout').length;
  const waarschuwingen = controles.filter((c) => c.niveau === 'waarschuwing').length;
  return { resultaat: { versie: 1, tijd: new Date().toISOString(), ok: fouten === 0, fouten, waarschuwingen, controles }, meta };
}
