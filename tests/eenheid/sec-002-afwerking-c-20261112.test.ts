// SEC-002 · afwerking C (12.11.2026): toeleveringsketen, werkstromen, documentatie en uitrol.
// Завершальний крок C: ланцюг постачання, робочі процеси, документація, розгортання.
//   punt 1  werkstromen cloud-001/identiteit-009/identiteit-010 gesplitst — bewezen in tests/eenheid/sec-002-g01-20261112.test.ts
//   punt 2  scripts/keten-controle.mjs: npm audit (hoog/kritiek) + herkomst van elk pakket in package-lock.json
//   punt 3  uitrol en documentatie: cloudflared vastgezet, nieuwe omgevingsvariabelen beschreven (uk + nl), draaiboeken gespiegeld
//   punt 4  geen gevolgde afvalbestanden (Windows-pad met «» in de naam) in de wortel van de repository
// Alle «geheimen» hieronder zijn verzonnen proefwaarden.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-afwerking-c-20261112');
  const W = process.cwd();
  const basis = mkdtempSync(join(tmpdir(), 'sec002-afw-c-'));

  // ================================================================ punt 2 — scripts/keten-controle.mjs
  {
    const SCRIPT = join(W, 'scripts/keten-controle.mjs');
    check('keten: scripts/keten-controle.mjs bestaat', existsSync(SCRIPT));
    const lock = JSON.parse(readFileSync(join(W, 'package-lock.json'), 'utf8')) as { packages: Record<string, Record<string, unknown>> };
    const pkg = JSON.parse(readFileSync(join(W, 'package.json'), 'utf8')) as Record<string, unknown>;
    /** Voert het script uit zonder npm audit (geen netwerk) op een (gewijzigde) kopie van lock en package.json. */
    const draai = (l: unknown, p: unknown = pkg, extra: string[] = []) => {
      const m = mkdtempSync(join(basis, 'keten-'));
      writeFileSync(join(m, 'package-lock.json'), JSON.stringify(l)); writeFileSync(join(m, 'package.json'), JSON.stringify(p));
      const r = spawnSync(process.execPath, [SCRIPT, '--zonder-audit', '--map', m, ...extra], { encoding: 'utf8', timeout: 60_000 });
      return { code: r.status ?? 1, uit: `${r.stdout}${r.stderr}` };
    };
    const kopie = () => JSON.parse(JSON.stringify(lock)) as typeof lock;
    if (existsSync(SCRIPT)) {
      const echt = draai(lock);
      check('keten: de huidige package-lock.json en package.json → in orde (code 0)', echt.code === 0, echt.uit.slice(-400));
      check('keten: uitvoer is tweetalig uk · nl', /[А-Яа-яІіЇїЄє]/.test(echt.uit) && /pakketten|herkomst/i.test(echt.uit), echt.uit.slice(-200));

      // Een pakket van een andere host (typosquat/kaping van de bron) → weigeren.
      const a = kopie(); const naamA = Object.keys(a.packages).find((k) => k.startsWith('node_modules/') && String(a.packages[k].resolved ?? '').startsWith('https://registry.npmjs.org/'))!;
      a.packages[naamA].resolved = String(a.packages[naamA].resolved).replace('https://registry.npmjs.org/', 'https://registry.npmjs.org.kwaad.example/');
      const ra = draai(a);
      check('keten: pakket van een vreemde host → geweigerd (code ≠ 0, naam in de uitvoer)', ra.code !== 0 && ra.uit.includes(naamA.replace(/^.*node_modules\//, '')), ra.uit.slice(-300));
      // Juiste host, maar een ander pakket of andere versie dan het pad in node_modules (verwisselde tarball).
      const b = kopie(); const naamB = naamA; const echteNaam = naamB.replace(/^.*node_modules\//, '');
      b.packages[naamB].resolved = `https://registry.npmjs.org/kwaadaardig/-/kwaadaardig-1.0.0.tgz`;
      check('keten: tarball van een ander pakket dan het pad → geweigerd', draai(b).code !== 0);
      const b2 = kopie(); b2.packages[naamB].resolved = String(b2.packages[naamB].resolved).replace(/-(\d[^/]*)\.tgz$/, '-999.0.0.tgz');
      check('keten: tarball-versie wijkt af van «version» → geweigerd', draai(b2).code !== 0, echteNaam);
      // Geen of zwakke integriteit.
      const c = kopie(); delete c.packages[naamA].integrity;
      const c2 = kopie(); c2.packages[naamA].integrity = 'sha1-AAAAAAAAAAAAAAAAAAAAAAAAAAA=';
      check('keten: ontbrekende integrity of alleen sha1 → geweigerd', draai(c).code !== 0 && draai(c2).code !== 0);
      const d = kopie(); d.packages[naamA].resolved = String(d.packages[naamA].resolved).replace('https://', 'http://');
      check('keten: onversleuteld http:// → geweigerd', draai(d).code !== 0);
      // Git- of bestandsafhankelijkheden in de lock.
      const e = kopie(); e.packages['node_modules/uit-git'] = { version: '1.0.0', resolved: 'git+ssh://git@github.com/iemand/uit-git.git#abcdef', integrity: 'sha512-AAAA' };
      check('keten: git-afhankelijkheid in de lock → geweigerd', draai(e).code !== 0);
      // De ene bekende uitzondering (xlsx van cdn.sheetjs.com) geldt alleen met exact deze URL en integriteit.
      const xl = Object.keys(lock.packages).find((k) => k === 'node_modules/xlsx');
      if (xl) {
        const f = kopie(); f.packages[xl].integrity = 'sha512-' + Buffer.alloc(64, 7).toString('base64');
        check('keten: uitzondering xlsx met gewijzigde integriteit → geweigerd', draai(f).code !== 0);
        const g = kopie(); g.packages[xl].resolved = 'https://cdn.sheetjs.com/xlsx-0.20.4/xlsx-0.20.4.tgz'; g.packages[xl].version = '0.20.4';
        check('keten: uitzondering xlsx met een andere versie/URL → geweigerd (eerst de eigenaar)', draai(g).code !== 0);
        check('keten: --streng staat geen enkele uitzondering toe (ook xlsx niet)', draai(lock, pkg, ['--streng']).code !== 0);
      }
      // package.json: afhankelijkheid rechtstreeks uit git of een willekeurige URL.
      const p1 = JSON.parse(JSON.stringify(pkg)) as { dependencies: Record<string, string> }; p1.dependencies['iets'] = 'github:iemand/iets#main';
      check('keten: package.json met github:-afhankelijkheid → geweigerd', draai(lock, p1).code !== 0);
      const p2 = JSON.parse(JSON.stringify(pkg)) as { dependencies: Record<string, string> }; p2.dependencies['iets'] = 'https://voorbeeld.example/iets.tgz';
      check('keten: package.json met URL-afhankelijkheid buiten de uitzonderingen → geweigerd', draai(lock, p2).code !== 0);

      // npm audit: zuivere beoordeling (geen netwerk) — hoog/kritiek of een mislukte audit = stoppen (fail closed).
      // Runtime-import van het script zelf (niet gebundeld): zo test de suite precies het bestand dat de werkstroom draait.
      const mod = await import(pathToFileURL(SCRIPT).href) as { beoordeelAudit?: (json: string, code: number) => { ok: boolean; reden: string } };
      const ba = mod.beoordeelAudit;
      check('keten: beoordeelAudit is uitgevoerd (export)', typeof ba === 'function');
      if (typeof ba === 'function') {
        const meta = (v: Record<string, number>) => JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, ...v } } });
        check('keten: audit zonder kwetsbaarheden → in orde', ba(meta({}), 0).ok === true);
        check('keten: audit met alleen laag/matig → in orde (informatief)', ba(meta({ low: 1, moderate: 2 }), 0).ok === true);
        check('keten: audit met hoog of kritiek → stoppen', ba(meta({ high: 1 }), 1).ok === false && ba(meta({ critical: 1 }), 1).ok === false);
        check('keten: audit die niet lukt (netwerk, geen JSON, foutobject) → stoppen', ba('', 1).ok === false && ba('{"error":{"code":"ENOTFOUND"}}', 1).ok === false && ba('niet-json', 0).ok === false);
        check('keten: npm meldt een fout terwijl de telling nul is → toch stoppen', ba(meta({}), 1).ok === false);
      }
    }
  }

  // ================================================================ punt 3 — uitrol en documentatie
  {
    const lees = (p: string) => readFileSync(join(W, p), 'utf8');
    // (a) cloudflared bij herstel: echt vastgezet (anders installeert «herstel met één opdracht» geen tunnel).
    const herstel = lees('deploy/archief-herstellen.sh');
    const vast = (n: string) => new RegExp(`^${n}="([^"]*)"$`, 'm').exec(herstel)?.[1] ?? '';
    check('uitrol: archief-herstellen.sh draagt een vastgezette cloudflared-versie (geen «latest», geen lege waarde)', /^\d{4}\.\d{1,2}\.\d{1,3}$/.test(vast('CF_VERSIE_VAST')), vast('CF_VERSIE_VAST') || 'leeg');
    check('uitrol: … met een SHA-256 per architectuur (amd64 en arm64 verschillend)', /^[0-9a-f]{64}$/.test(vast('CF_SHA256_AMD64_VAST')) && /^[0-9a-f]{64}$/.test(vast('CF_SHA256_ARM64_VAST')) && vast('CF_SHA256_AMD64_VAST') !== vast('CF_SHA256_ARM64_VAST'));
    // (b) nieuwe omgevingsvariabelen van SEC-002 in beide talen (en .md = .uk.md, zoals in de rest van de repo).
    const NIEUW = ['STAP_OP_UIT_TOT', 'VLAG_RATE_LIMIT_PER_MIN', 'MAX_BODY_ANONIEM_BYTES', 'MAX_BODY_BUDGET_BYTES', 'MAX_BODY_PER_IP', 'MAX_BODY_PER_IP_AANGEMELD', 'MAX_BODY_PER_IP_BYTES',
      'MAX_BODY_KLEIN_BYTES', 'BODY_TIMEOUT_ANONIEM_MS', 'AGENT_WS_VOORAUTH_TOTAAL', 'AGENT_WS_VOORAUTH_PER_IP', 'AGENT_WS_VOORAUTH_MAX_BYTES', 'CLOUD_EIGEN_QUOTA_BYTES', 'PROEF_DATABASE_URL'];
    for (const doc of ['ЗМІННІ-СЕРЕДОВИЩА.uk.md', 'ЗМІННІ-СЕРЕДОВИЩА.md', 'OMGEVINGSVARIABELEN.nl.md']) {
      const t = lees(doc);
      const mist = NIEUW.filter((n) => !new RegExp(`\\|[^|\\n]*\`${n}\`[^|\\n]*\\|`).test(t));
      check(`docs: ${doc} beschrijft alle nieuwe variabelen van SEC-002 in een tabelregel`, mist.length === 0, mist.join(', '));
      check(`docs: ${doc} — rotatie van envelopsleutels via _V2, V1 NIET verwijderen zolang de 4 modules met TOTP-terugval niet zijn omgezet, niet vóór 0253`,
        /_V2/.test(t) && /(НЕ прибирати|NIET verwijderen)/.test(t) && ['connectors-crypto.ts', 'github-koppeling-opslag.ts', 'browser-diag-archief.ts', 'huis-vnext.ts'].every((m) => t.includes(m)) && /0253/.test(t));
      check(`docs: ${doc} — STAP_OP_UIT=1 als oude vorm zonder einde gemarkeerd`, /`STAP_OP_UIT`[^\n]*(Стара форма|Oude vorm)/.test(t));
    }
    check('docs: ЗМІННІ-СЕРЕДОВИЩА.md en .uk.md zijn gelijk', lees('ЗМІННІ-СЕРЕДОВИЩА.md') === lees('ЗМІННІ-СЕРЕДОВИЩА.uk.md'));
    // (c) Oekraïense spiegels van de draaiboeken (g07): geen onbegrensde noodschakelaar meer als advies.
    for (const doc of ['deploy/ІНСТРУКЦІЯ-ВИПРАВЛЕНЬ-АУДИТУ.uk.md', 'deploy/ІНСТРУКЦІЯ-ВИПРАВЛЕНЬ-АУДИТУ.md', 'deploy/ІНСТРУКЦІЯ-ЕТАПІВ-2-3.uk.md', 'deploy/ІНСТРУКЦІЯ-ЕТАПІВ-2-3.md']) {
      const t = lees(doc);
      check(`docs: ${doc} raadt STAP_OP_UIT_TOT aan (≤ 24 год), niet meer «echo STAP_OP_UIT=1» / «STAP_OP_UIT=1 у geheimen.env»`, t.includes('STAP_OP_UIT_TOT') && !/echo 'STAP_OP_UIT=1'/.test(t) && !/`STAP_OP_UIT=1` у `geheimen\.env`/.test(t));
    }
    // (d) draaiboek veilige uitrol (nl + uk): systemd-afscherming (g07) en afgeschermde bouw met de noodrem (g09).
    for (const doc of ['deploy/DRAAIBOEK-VEILIGE-UITROL.nl.md', 'deploy/ІНСТРУКЦІЯ-БЕЗПЕЧНОГО-РОЗГОРТАННЯ.uk.md', 'deploy/ІНСТРУКЦІЯ-БЕЗПЕЧНОГО-РОЗГОРТАННЯ.md']) {
      const t = lees(doc);
      check(`docs: ${doc} — §20: systemd-afscherming (4 units + systemd-analyze), bouwgebruiker en noodrem met «!»`,
        ['mijn-ruimte-diagnose.service', 'mijn-ruimte-nazorg.service', 'mijn-ruimte-proef.service', 'mijn-ruimte-opdracht@', 'systemd-analyze security', 'mijnruimte-bouw', 'bouw-afscherming.uit', 'keten-controle.mjs'].every((x) => t.includes(x)) && /\*\*! /.test(t));
    }
    // (e) Oekraïens geheimenregister gelijk aan het Nederlandse (rotatie via _V2, V1 nooit verwijderen).
    for (const doc of ['deploy/РЕЄСТР-ТАЄМНИЦЬ.uk.md', 'deploy/РЕЄСТР-ТАЄМНИЦЬ.md']) {
      const t = lees(doc);
      const rijen = ['TOTP_ENCRYPTION_KEY_V1', 'MAIL_APP_WACHTWOORD_SLEUTEL_V1', 'AGENDA_ABONNEMENT_SLEUTEL_V1', 'GITHUB_KOPPELING_SLEUTEL_V1'].map((n) => new RegExp(`^\\| \`${n}\` \\|.*$`, 'm').exec(t)?.[0] ?? '');
      check(`docs: ${doc} — rotatie via …_V2 bij de envelopsleutels en «V1 ніколи не прибирати»`, rijen.every((r) => /_V2/.test(r) && !/\| не ротувати/.test(r)) && /V1 ніколи не прибирати/.test(t) && /0253/.test(t));
    }
  }

  // ================================================================ punt 4 — afvalbestanden in de wortel
  {
    const gevolgd = execFileSync('git', ['-C', W, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean);
    // tekens uit het privégebruiksgebied (U+E000–U+F8FF) — zo komt «:» van een Windows-pad terug als bestandsnaam
    const PRIVE_GEBRUIK = new RegExp('[' + String.fromCharCode(0xe000) + '-' + String.fromCharCode(0xf8ff) + ']');
    const afval = gevolgd.filter((f) => !f.includes('/') && (/UserstAppData/i.test(f) || PRIVE_GEBRUIK.test(f)));
    check('afval: geen gevolgde uitvoerbestanden van tests met een Windows-pad (C:Users…aanroepen.txt, «:» als privéteken) in de wortel', afval.length === 0, afval.join(', ').slice(0, 300));
  }

  rmSync(basis, { recursive: true, force: true });
  return einde();
}
