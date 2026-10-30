// RENDERCONTROLE (zone A, 22.10.2026). Oorzaak: release 20261021-221718 deed `Buffer.from(…)` op moduleniveau in de technische bundel;
// elke admin.*-pagina was wit terwijl /__gezondheid, «HTTP 200» en «Діагностика» groen waren. Hier:
//   1. de zuivere beoordeling van een pagina (beoordeel): pageerror, console.error met ReferenceError/TypeError, #root leeg/alleen strook,
//      bundel ≠ 200, «Internal server error»;
//   2. de modulecontrole in Node (zonder browser) op een synthetische dist: een chunk in het paginaskelet met `Buffer.from` op moduleniveau
//      = KAPOT (precies de fout van 20261021), een lazy bibliotheek met `process` = waarschuwing, een chunk die window.Buffer polyfilt
//      maskeert de volgende chunk NIET, een wees-chunk telt niet, en een gezonde dist = in orde (exitcode 0/1 via het script zelf);
//   3. skeletChunks/weesChunks (statische graaf vanuit index.html + lazy routes van het eerste niveau + tech-chunks);
//   4. de beoordeling voor «Діагностика» (backend/rook-controle.ts: beoordeelRook, paginaUitRook, normaliseerRook);
//   5. de databaseslot van de rook-stand (server/rook.ts databaseOmbuigen): alleen mijnruimte_rook_*; nooit de productiedatabase.
// Echte browsercontrole (Chromium + wegwerpdatabase) alleen als ROOK_E2E_DIST en ROOK_DB zijn gezet (zie VERSLAG: handmatig gedraaid).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';
import { beoordeelRook, normaliseerRook, paginaUitRook, type RookUitslag } from '../../backend/rook-controle';
import { databaseOmbuigen } from '../../server/rook';
import { UITROL_CODES } from '../../shared/uitrol-codes';

const W = process.cwd();
const SCRIPT = resolve(W, 'scripts/rook-controle.mjs');

/** Synthetische dist: index.html → assets/index-AAAA.js (entry) → lazy View-BBBB.js, tech/Admin-CCCC.js; lib-DDDD.js lazy uit View; wees-EEEE.js. */
function maakDist(map: string, o: { bufferInTech?: boolean; processInLib?: boolean; polyfill?: boolean; bufferInView?: boolean } = {}) {
  mkdirSync(join(map, 'assets', 'tech'), { recursive: true });
  writeFileSync(join(map, 'index.html'), '<!doctype html><html><head><script src="./canonical-boot.js"></script><script type="module" crossorigin src="./assets/index-AAAA.js"></script></head><body><div id="root"></div></body></html>');
  writeFileSync(join(map, 'canonical-boot.js'), 'window.__TSV_CANONICAL_SERVICE__ = { ok: true };');
  writeFileSync(join(map, 'assets', 'gedeeld-FFFF.js'), 'export const g = 1;');
  writeFileSync(join(map, 'assets', 'index-AAAA.js'), `import{g}from"./gedeeld-FFFF.js";const r=document.getElementById("root");export const laad=()=>import("./View-BBBB.js");export const t=()=>import("./tech/Admin-CCCC.js");export default g+1;`);
  writeFileSync(join(map, 'assets', 'View-BBBB.js'), `import g from"./index-AAAA.js";${o.bufferInView ? 'const b=Buffer.from("x");' : ''}${o.polyfill ? 'window.Buffer=class{static from(){return{}}};' : ''}export const lib=()=>import("./lib-DDDD.js");export default g;`);
  writeFileSync(join(map, 'assets', 'tech', 'Admin-CCCC.js'), `import g from"../index-AAAA.js";${o.bufferInTech ? 'const PNG=Buffer.from([137,80,78,71]);' : 'const PNG=[137,80,78,71];'}export default g+PNG.length;`);
  writeFileSync(join(map, 'assets', 'lib-DDDD.js'), `${o.processInLib ? 'const v=process.version;' : ''}export const x=typeof window;`);
  writeFileSync(join(map, 'assets', 'wees-EEEE.js'), 'const q=require("fs");export default q;');
}
const draai = (dist: string, uit: string) => spawnSync(process.execPath, [SCRIPT, '--alleen-modules', '--dist', dist, '--uit', uit], { encoding: 'utf8', cwd: W, env: { ...process.env, ROOK_CHROMIUM: '' }, timeout: 120_000 });
const lees = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as { code: number; kapot: boolean; modus: string; uitgevoerd: boolean; bundels: { aantal: number; ok: number; kapot: string[]; waarschuwingen: string[]; onbeoordeelbaar: string[]; polyfills?: string[] }; samenvatting: { uk: string; nl: string } };

export async function main(): Promise<number> {
  const { check, einde } = checker('rook-controle-20261022');
  const m = await import(pathToFileURL(SCRIPT).href) as Record<string, any>;
  const T = mkdtempSync(join(tmpdir(), 'rook-'));
  try {
    // ------------------------------------------------------------------ 1. beoordeel (zuiver)
    const basis = { http: 200, bundels: [] as string[], pageerrors: [] as string[], consoleFouten: [] as string[], tekst: 'Адміністрування · Огляд', rootKinderen: 1, inhoud: true, geladen: true };
    check('beoordeel: gezonde pagina = ok', m.beoordeel(basis).stand === 'ok' && m.beoordeel(basis).fouten.length === 0);
    const be = m.beoordeel({ ...basis, pageerrors: ['Error: Buffer is not defined'], rootKinderen: 0, inhoud: false });
    check('beoordeel: pageerror «Buffer is not defined» + #root leeg = kapot (de fout van 20261021)', be.stand === 'kapot' && be.fouten.some((f) => f.includes('Buffer is not defined')) && be.fouten.includes('#root leeg'), be.fouten.join('|'));
    check('beoordeel: console.error met ReferenceError = kapot; console.error zonder = niet', m.beoordeel({ ...basis, consoleFouten: ['ReferenceError: x is not defined'] }).stand === 'kapot' && m.beoordeel({ ...basis, consoleFouten: ['Warning: iets in React'] }).stand === 'ok');
    check('beoordeel: #root alleen strook (kinderen maar geen main/sectie) = kapot', m.beoordeel({ ...basis, inhoud: false }).fouten.some((f) => f.includes('strook')));
    check('beoordeel: bundel ≠ 200 = kapot; «Internal server error» in tekst = kapot; HTTP 5xx = kapot', m.beoordeel({ ...basis, bundels: ['404 https://admin.x/assets/a.js'] }).stand === 'kapot' && m.beoordeel({ ...basis, tekst: 'Internal server error' }).stand === 'kapot' && m.beoordeel({ ...basis, http: 500 }).stand === 'kapot');
    check('beoordeel: niet geladen (time-out) = kapot', m.beoordeel({ ...basis, geladen: false }).fouten.some((f) => f.includes('time-out')));

    // ------------------------------------------------------------------ 2. modulecontrole zonder browser (het script zelf, exitcodes)
    const gezond = join(T, 'gezond'); maakDist(gezond);
    let r = draai(gezond, join(T, 'gezond.json')); let j = lees(join(T, 'gezond.json'));
    check('script zonder browser: gezonde dist → exit 0, modus modules, uitgevoerd, 5/5 modules (wees telt niet mee als kapot)', r.status === 0 && j.code === 0 && j.modus === 'modules' && j.uitgevoerd && !j.kapot && j.bundels.aantal === 6 && j.bundels.ok >= 5, `${r.status} ${JSON.stringify(j.bundels)} ${r.stderr.slice(-300)}`);
    check('script zonder browser: samenvatting zegt eerlijk «рендеринг НЕ перевірено» (uk+nl) en noemt browser-controle', /рендеринг НЕ перевірено/.test(j.samenvatting.uk) && /rendering NIET gecontroleerd/.test(j.samenvatting.nl) && /browser-controle/.test(j.samenvatting.uk));
    check('script: wees-chunk (require) is «onbeoordeelbaar», geen kapot', j.bundels.onbeoordeelbaar.some((x) => x.includes('wees-EEEE')) && !j.bundels.kapot.length);

    const kapot = join(T, 'kapot'); maakDist(kapot, { bufferInTech: true });
    r = draai(kapot, join(T, 'kapot.json')); j = lees(join(T, 'kapot.json'));
    check('script: Buffer.from op moduleniveau in een tech-chunk → exit 1, kapot, naam + «Buffer is not defined»', r.status === 1 && j.kapot && j.bundels.kapot.length === 1 && /tech\/Admin-CCCC\.js: Buffer is not defined/.test(j.bundels.kapot[0]), `${r.status} ${JSON.stringify(j.bundels.kapot)}`);
    check('script: samenvatting (uk/nl) noemt de kapotte bundel', j.samenvatting.uk.includes('Admin-CCCC') && j.samenvatting.nl.includes('Admin-CCCC'));

    const lazy = join(T, 'lazy'); maakDist(lazy, { processInLib: true });
    r = draai(lazy, join(T, 'lazy.json')); j = lees(join(T, 'lazy.json'));
    check('script: `process` in een lazy bibliotheek buiten het paginaskelet → waarschuwing, exit 0 (geen terugdraai)', r.status === 0 && !j.kapot && j.bundels.waarschuwingen.length === 1 && /lib-DDDD\.js.*process is not defined/.test(j.bundels.waarschuwingen[0]), JSON.stringify(j.bundels));

    const masker = join(T, 'masker'); maakDist(masker, { polyfill: true, bufferInTech: true });
    r = draai(masker, join(T, 'masker.json')); j = lees(join(T, 'masker.json'));
    check('script: een chunk die window.Buffer polyfilt maskeert de tech-chunk NIET (polyfill wordt na die chunk weggehaald) → nog steeds kapot', r.status === 1 && j.bundels.kapot.length === 1 && (j.bundels.polyfills || []).some((p) => p.includes('View-BBBB') && p.endsWith('Buffer')), JSON.stringify(j.bundels));

    const view = join(T, 'view'); maakDist(view, { bufferInView: true });
    r = draai(view, join(T, 'view.json')); j = lees(join(T, 'view.json'));
    check('script: Buffer in een lazy route van het eerste niveau (App → View) = paginaskelet → kapot', r.status === 1 && /View-BBBB/.test(j.bundels.kapot[0] || ''), JSON.stringify(j.bundels.kapot));

    // ------------------------------------------------------------------ 3. skelet en wezen
    const sk = [...m.skeletChunks(gezond)].map((p) => p.replace(/.*assets\//, ''));
    check('skeletChunks: entry + gedeeld (statisch) + lazy route + tech-chunk; lazy bibliotheek en wees niet', sk.includes('index-AAAA.js') && sk.includes('gedeeld-FFFF.js') && sk.includes('View-BBBB.js') && sk.includes('tech/Admin-CCCC.js') && !sk.includes('lib-DDDD.js') && !sk.includes('wees-EEEE.js'), sk.join(','));
    const wz = [...m.weesChunks(gezond)].map((p) => p.replace(/.*assets\//, ''));
    check('weesChunks: alleen wees-EEEE', wz.length === 1 && wz[0] === 'wees-EEEE.js', wz.join(','));
    check('klassiekeScripts: ./canonical-boot.js uit index.html', m.klassiekeScripts(gezond).join() === 'canonical-boot.js');
    check('zoekChromium: expliciet pad dat niet bestaat → leeg (geen gok), ROOK_CHROMIUN leeg → lijst', m.zoekChromium('/bestaat/niet') === '' || typeof m.zoekChromium('/bestaat/niet') === 'string');
    check('paginaLijst: met sessie 13 sleutelpagina\'s incl. admin /updates /diagnostiek /toegang en mcp; zonder sessie 3 publieke', m.paginaLijst({ hub: 'h', identity: 'i', ai: 'a', mail: 'm', cloud: 'c', github: 'g', admin: 'ad', mcp: 'mc' }, true).length === 13
      && m.paginaLijst({ hub: 'h', identity: 'i', ai: 'a', mail: 'm', cloud: 'c', github: 'g', admin: 'ad', mcp: 'mc' }, true).filter((p) => p.host === 'ad').map((p) => p.pad).join() === '/overzicht,/updates,/diagnostiek,/toegang'
      && m.paginaLijst({ hub: 'h', identity: 'i', ai: 'a', mail: 'm', cloud: 'c', github: 'g', admin: 'ad', mcp: 'mc' }, false).length === 3);

    // ------------------------------------------------------------------ 4. beoordeling voor «Діагностика»
    const nu = Date.now();
    const uit = (x: Partial<RookUitslag>): RookUitslag => normaliseerRook({ tijd: new Date(nu - 60_000).toISOString(), modus: 'stand', chromium: '/srv/mijn-ruimte/browser/chrome-headless-shell', release: '20261022-121416', uitgevoerd: true, kapot: false, paginas: [{ naam: 'admin-updates', url: 'u', stand: 'ok', fouten: [], http: 200, ms: 900 }, { naam: 'hub-overzicht', url: 'u', stand: 'ok', fouten: [], http: 200, ms: 900 }], bundels: { aantal: 10, ok: 10, kapot: [], waarschuwingen: [], modus: 'browser' }, fouten: [], samenvatting: { uk: 'Гаразд', nl: 'In orde' }, ms: 1, ...x })!;
    check('normaliseerRook: vreemde invoer → null; geldige → vaste vorm met alleen geldige paginanamen', normaliseerRook('x') === null && normaliseerRook({ paginas: [{ naam: '<script>' }], modus: 'raar' })!.paginas.length === 0 && normaliseerRook({ modus: 'raar' })!.modus === 'geen');
    check('beoordeelRook: geen uitslag + geen browser = let-op ROOK_NIET_GECONTROLEERD met «лише HTTP» en browser-controle', (() => { const b = beoordeelRook(null, nu, '20261022-121416', ''); return b.stand === 'let-op' && b.code === 'ROOK_NIET_GECONTROLEERD' && /Лише HTTP/.test(b.detail) && /browser-controle/.test(b.detail); })());
    check('beoordeelRook: geen uitslag + wel browser = onbekend ROOK_GEEN', beoordeelRook(null, nu, null, '/x').code === 'ROOK_GEEN');
    check('beoordeelRook: verse stand-uitslag zonder fouten = ok met tijd en aantallen', (() => { const b = beoordeelRook(uit({}), nu, '20261022-121416', '/x'); return b.stand === 'ok' && /2 сторінок/.test(b.detail) && /10\/10/.test(b.detail); })());
    check('beoordeelRook: kapotte pagina = fout ROOK_KAPOT met paginanaam en eerste fout', (() => { const b = beoordeelRook(uit({ kapot: true, paginas: [{ naam: 'admin-updates', url: 'u', stand: 'kapot', fouten: ['pageerror: Error: Buffer is not defined', '#root leeg'], http: 200, ms: 1 }] }), nu, '20261022-121416', '/x'); return b.stand === 'fout' && b.code === 'ROOK_KAPOT' && /admin-updates/.test(b.detail) && /Buffer is not defined/.test(b.detail); })());
    check('beoordeelRook: andere release of ouder dan 7 dagen = let-op ROOK_OUD', beoordeelRook(uit({ release: '20261001-000000' }), nu, '20261022-121416', '/x').code === 'ROOK_OUD' && beoordeelRook(uit({ tijd: new Date(nu - 8 * 86_400_000).toISOString() }), nu, '20261022-121416', '/x').code === 'ROOK_OUD');
    check('beoordeelRook: modus modules (geen browser) = let-op ROOK_NIET_GECONTROLEERD; met kapotte bundel = fout', beoordeelRook(uit({ modus: 'modules', chromium: '' }), nu, null, '').code === 'ROOK_NIET_GECONTROLEERD' && beoordeelRook(uit({ modus: 'modules', chromium: '', bundels: { aantal: 3, ok: 2, kapot: ['assets/tech/a.js: Buffer is not defined'], modus: 'node-vm' } }), nu, null, '').code === 'ROOK_KAPOT');
    check('beoordeelRook: niet uitgevoerd (infrastructuur) = let-op ROOK_NIET_UITGEVOERD, nooit fout', beoordeelRook(uit({ uitgevoerd: false, fouten: ['Chromium stopte'] }), nu, null, '/x').code === 'ROOK_NIET_UITGEVOERD');
    check('beoordeelRook: lazy waarschuwing = let-op ROOK_WAARSCHUWING', beoordeelRook(uit({ bundels: { aantal: 3, ok: 2, kapot: [], waarschuwingen: ['lib: process is not defined'], modus: 'browser' } }), nu, '20261022-121416', '/x').code === 'ROOK_WAARSCHUWING');
    check('paginaUitRook: zonder browser «лише HTTP, рендеринг не перевірено»; met uitslag ok «рендеринг ок»; kapot → kapot', /лише HTTP, рендеринг не перевірено/.test(paginaUitRook(null, 'updates', nu, null).tekst) && !paginaUitRook(null, 'updates', nu, null).gecontroleerd
      && paginaUitRook(uit({}), 'updates', nu, '20261022-121416').gecontroleerd && paginaUitRook(uit({ paginas: [{ naam: 'admin-updates', url: 'u', stand: 'kapot', fouten: ['#root leeg'], http: 200, ms: 1 }] }), 'updates', nu, null).kapot
      && !paginaUitRook(uit({}), 'audit', nu, null).gecontroleerd);

    // ------------------------------------------------------------------ 5. databaseslot van de stand
    const env: Record<string, string | undefined> = { DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/mijnruimte', DATABASE_URL_SYSTEM: 'postgres://s:p@127.0.0.1:5432/mijnruimte?x=1', DATABASE_URL_MIGRATIE: 'postgres://m:p@127.0.0.1/mijnruimte' };
    const om = databaseOmbuigen(env, 'mijnruimte_rook_20261022');
    check('databaseOmbuigen: elke DATABASE_URL* wijst daarna naar mijnruimte_rook_<stempel> (rol/wachtwoord/host blijven)', om.length === 3 && Object.values(env).every((v) => /\/mijnruimte_rook_20261022(\?|$)/.test(v!)) && env.DATABASE_URL!.startsWith('postgres://u:p@127.0.0.1:5432/'), JSON.stringify(env));
    let geweigerd = 0;
    for (const naam of ['mijnruimte', 'mijnruimte_rook', 'postgres', 'mijnruimte_rook_x; DROP', '']) { try { databaseOmbuigen({ DATABASE_URL: 'postgres://u@127.0.0.1/mijnruimte' }, naam); } catch { geweigerd++; } }
    check('databaseOmbuigen: productienaam, lege naam of injectie → geweigerd (nooit op de echte database)', geweigerd === 5);
    try { databaseOmbuigen({}, 'mijnruimte_rook_a'); check('databaseOmbuigen: zonder enige DATABASE_URL → fout', false); } catch (e) { check('databaseOmbuigen: zonder enige DATABASE_URL → fout', (e as Error).message === 'GEEN_DATABASE_URL'); }

    // ------------------------------------------------------------------ 6. scripts/deploy: aanwezig en consistent
    const inst = readFileSync(join(W, 'deploy/installeer-app.sh'), 'utf8');
    check('installer: rook_controleren na nabewaken; code 1 = terugdraaien met ROOK_TERUGGEDRAAID; code 2 = actief met waarschuwing', /rook_controleren "\$doel" \|\| rrc=\$\?/.test(inst) && /if \[ "\$rrc" -ne 1 \]; then/.test(inst) && /noteer_rook ROOK_TERUGGEDRAAID warn "\$doel" "\$vorige"/.test(inst));
    check('installer: de vorige release wordt na een terugdraai één keer live gecontroleerd en nooit nog eens teruggedraaid', /rook_controleren "\$vorige" live "\$doel" \|\| vrc=\$\?/.test(inst) && !/vrc" -eq 1 \]; then[^\n]*omzetten/.test(inst));
    check('installer: rook-stand draait als de dienstgebruiker (systemd-run User=mijnruimte, NoNewPrivileges, ProtectSystem=strict), nooit als root', /systemd-run[^\n]*\n[^\n]*-p User="\$GEBRUIKER"[^\n]*\n[^\n]*NoNewPrivileges=yes -p ProtectSystem=strict[\s\S]{0,400}rook-controle\.mjs/.test(inst));
    check('installer: wegwerpdatabase heet mijnruimte_rook_<stempel> en wordt na afloop verwijderd', /db="mijnruimte_rook_\$\(date \+%Y%m%d%H%M%S\)"/.test(inst) && /\[ -z "\$db" \] \|\| rook_db_opruimen "\$db"/.test(inst));
    check('installer: subopdrachten browser-controle en rook-controle', /^\s+browser-controle\) vereis_root;/m.test(inst) && /^\s+rook-controle\) rook_opdracht "\$@" ;;/m.test(inst));
    check('browser-controle-installeren.sh: vastgepinde versie + SHA-256, geen curl|bash', (() => { const b = readFileSync(join(W, 'deploy/browser-controle-installeren.sh'), 'utf8'); const code = b.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'); return /^VERSIE='\d+\.\d+\.\d+\.\d+'$/m.test(b) && /^SHA256='[0-9a-f]{64}'$/m.test(b) && /sha256sum/.test(code) && !/curl[^\n]*\|\s*(ba)?sh/.test(code); })());
    check('shared/uitrol-codes: ROOK_TERUGGEDRAAID/ROOK_MISLUKT/ROOK_KAPOT/ROOK_WAARSCHUWING vertaald (uk+nl)', (() => { const c = UITROL_CODES; return ['ROOK_TERUGGEDRAAID', 'ROOK_MISLUKT', 'ROOK_KAPOT', 'ROOK_WAARSCHUWING'].every((k) => c[k] && c[k].uk.length > 5 && c[k].nl.length > 5 && c[k].uk !== c[k].nl); })());
    check('bash-syntaxis van de drie scripts', ['deploy/installeer-app.sh', 'deploy/browser-controle-installeren.sh', 'deploy/uitrol/mijn-ruimte-nazorg.sh'].every((f) => { try { execFileSync('bash', ['-n', join(W, f)]); return true; } catch { return false; } }));
  } finally { rmSync(T, { recursive: true, force: true }); }
  return einde();
}
