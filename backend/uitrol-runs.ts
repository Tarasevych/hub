// Blijvende geschiedenis van uitrollen: stappen + logregels per run (app.uitrol_runs / app.uitrol_run_regels, migratie 0047).
//
// Root (deploy/uitrol/mijn-ruimte-uitrol.sh) schrijft in /var/lib/mijn-ruimte-uitrol-status (root:mijnruimte 0750):
//   stappen.jsonl        één regel per stap-overgang van een run (ontvangen, kopie, echtheid, inhoud, installeren, klaar)
//   runs/<run>.log       het doorlopende logboek van die run (controles + uitvoer van installeer-app.sh, geheimen gemaskeerd)
//   gebeurtenissen.jsonl uitkomsten (OK, INSTALLATIE_MISLUKT, weigeringen, SSH_OK, …) — ook van runs van vóór deze versie
//   diagnose.json        elke minuut: staat van path-unit, service, vergrendeling, inbox, schijf, journaal (deploy/uitrol/…-diagnose.sh)
// De app leest die bestanden alleen (nooit de 0700-werkmap van root), neemt ze op in de database en toont ze in Admin → «Оновлення».
// Daardoor overleeft de geschiedenis een volgende installatie, een SSH-installatie en het inkorten van de bestanden.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { getPool } from '../server/platform/pg';
import { parseRootGebeurtenissen, type RootGebeurtenis } from './server-beheer';
import { RUN_STIL_MINUTEN } from '../shared/uitrol-tijden';

const statusDir = () => process.env.OPDRACHT_STATUS_DIR || '/var/lib/mijn-ruimte-uitrol-status';
const sys = () => getPool('systeem');

export const RUN_ID = /^\d{8}T\d{6}Z-[0-9a-f]{8}$/;
const STAPPEN = ['ontvangen', 'kopie', 'echtheid', 'inhoud', 'installeren', 'klaar'] as const;
export type Stap = (typeof STAPPEN)[number];
// «nazorg» (0062): terugdraaien door de bewaker na een storing; «opdracht»: terugdraaien via het dashboard. Beide komen uit TERUG_OK-gebeurtenissen van de installer.
const METHODEN = ['passkey', 'handtekening', 'gitops', 'opdracht', 'ssh', 'nazorg'] as const;
export type Methode = (typeof METHODEN)[number];
export type RunStaat = 'bezig' | 'klaar' | 'mislukt' | 'geweigerd' | 'afgebroken';
export const RUN_STATEN: readonly RunStaat[] = ['bezig', 'klaar', 'mislukt', 'geweigerd', 'afgebroken'];
export type Sub = '' | 'bron' | 'bouwen' | 'backup' | 'migraties' | 'actief';
/** Een run zonder nieuwe stap- of logregel langer dan dit (en niet «bezig» volgens status.json) is vastgelopen. */
// 60 min (> systemd-limiet 45 min; een gestopte run meldt zichzelf via de trap als ONDERBROKEN): zie shared/uitrol-tijden.ts.
/** Voortgang binnen «installeren» (42 → 97 %) per onderdeel; de installatiescripts melden alleen deze mijlpalen. */
const SUB_PCT: Record<Exclude<Sub, ''>, number> = { bron: 5, bouwen: 20, backup: 62, migraties: 72, actief: 96 };
const INSTALLEREN_VAN = 42, INSTALLEREN_TOT = 97;

const tekst = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');
const tijdOk = (v: string) => Number.isFinite(Date.parse(v));

type StapRegel = { run: string; tijd: string; versie: string; methode: Methode; stap: Stap; staat: 'bezig' | 'ok' | 'fout'; pct: number; uk: string; nl: string };
export type RunStap = { stap: Stap; staat: 'bezig' | 'ok' | 'fout'; pct: number; tijd: string; uk: string; nl: string };

export function parseStappen(raw: string): StapRegel[] {
  const uit: StapRegel[] = [];
  for (const regel of raw.split('\n')) {
    if (!regel.trim()) continue;
    try {
      const d = JSON.parse(regel) as Record<string, unknown>;
      const run = String(d.run || ''), stap = String(d.stap || ''), staat = String(d.staat || ''), methode = String(d.methode || '');
      if (!RUN_ID.test(run) || !(STAPPEN as readonly string[]).includes(stap) || !['bezig', 'ok', 'fout'].includes(staat) || !(METHODEN as readonly string[]).includes(methode)) continue;
      const tijd = tekst(d.tijd, 40);
      if (!tijdOk(tijd)) continue;
      const versie = /^\d{8}-\d{6}$/.test(String(d.versie || '')) ? String(d.versie) : '';
      const pct = Math.max(0, Math.min(100, Math.trunc(Number(d.pct) || 0)));
      uit.push({ run, tijd, versie, methode: methode as Methode, stap: stap as Stap, staat: staat as StapRegel['staat'], pct, uk: tekst(d.uk, 300), nl: tekst(d.nl, 300) });
    } catch { /* kapotte regel overslaan */ }
  }
  return uit;
}

/** Welk onderdeel van de installatie? De mijlpalen staan in de meldingen van deploy/installeer-app.sh. */
export function subVanRegel(regel: string): Sub | 'klaar' | '' {
  // Voortgangsregels van installeer-app.sh (audit 18.10.2026, punt 6): «[installeer] stap: <id> (<pct>%) …».
  const st = /^\[installeer\] stap: ([a-z]+) \(/.exec(regel);
  if (st) return ({ kopie: 'bron', npm: 'bouwen', bouwen: 'bouwen', backup: 'backup', migraties: 'migraties', activeren: 'actief', gezondheid: 'actief', nabewaken: 'actief', rook: 'actief' } as Record<string, Sub>)[st[1]] || '';   // rook (22.10): rendercontrole, hoort bij «actief»
  if (/^\[installeer\] actief:/.test(regel)) return 'actief';
  if (/^\[installeer\] klaar: release/.test(regel)) return 'klaar';
  if (/^\[installeer\] migraties uitvoeren/.test(regel)) return 'migraties';
  if (/^\[installeer\] back-up vóór migratie/.test(regel)) return 'backup';
  if (/^\[installeer\] bouwen \(/.test(regel)) return 'bouwen';
  if (/^\[installeer\] bron kopiëren/.test(regel)) return 'bron';
  return '';
}
export function niveauVanRegel(regel: string): 'info' | 'ok' | 'warn' | 'error' {
  if (/FOUT|\berror\b|ERR!|mislukt|failed|GEWEIGERD|Traceback|exception/i.test(regel) && !/^\[installeer\] (actief|klaar)/.test(regel)) return 'error';
  if (/LET OP|\bwarn(ing)?\b|waarschuwing|automatisch terug/i.test(regel)) return 'warn';
  if (/^\[installeer\] (actief|klaar)|geldig|\bOK\b|gezond/i.test(regel)) return 'ok';
  return 'info';
}
const procentVoor = (sub: Sub): number => (sub ? Math.round(INSTALLEREN_VAN + (SUB_PCT[sub] / 100) * (INSTALLEREN_TOT - INSTALLEREN_VAN)) : INSTALLEREN_VAN);

async function leesTekst(naam: string): Promise<string> {
  try { return await readFile(path.join(statusDir(), naam), 'utf8'); } catch { return ''; }
}

/** Bouwt per run de samengevatte stappen. De laatste regel per stap telt; volgorde = eerste verschijning. */
export function samenvatRun(regels: StapRegel[]) {
  const per = new Map<Stap, RunStap>();
  for (const r of regels) per.set(r.stap, { stap: r.stap, staat: r.staat, pct: r.pct, tijd: r.tijd, uk: r.uk, nl: r.nl });
  const stappen = [...per.values()];
  const eerste = regels[0], laatste = regels[regels.length - 1];
  const fout = stappen.find((s) => s.staat === 'fout');
  const klaar = stappen.find((s) => s.stap === 'klaar' && s.staat === 'ok');
  const hoogste = Math.max(0, ...regels.filter((r) => r.staat !== 'fout').map((r) => r.pct));
  const staat: RunStaat = klaar ? 'klaar' : fout ? (fout.stap === 'installeren' ? 'mislukt' : 'geweigerd') : 'bezig';
  const bezigStap = [...stappen].reverse().find((s) => s.staat === 'bezig')?.stap || laatste.stap;
  return {
    methode: eerste.methode, versie: regels.find((r) => r.versie)?.versie || '', staat, stap: (fout?.stap || (klaar ? 'klaar' : bezigStap)) as Stap,
    pct: klaar ? 100 : hoogste, stappen, gestart: eerste.tijd, laatsteTijd: laatste.tijd, fout,
  };
}

const eindEvent = (events: RootGebeurtenis[], run: { versie: string; methode: Methode; gestart: string; laatsteTijd: string }) => {
  const van = Date.parse(run.gestart) - 5000, tot = Date.parse(run.laatsteTijd) + 180_000;
  return events.filter((g) => g.bron === 'uitrol' && g.tag === run.versie && (!g.herkomst || g.herkomst === run.methode)
    && Date.parse(g.tijd) >= van && Date.parse(g.tijd) <= tot && (g.code === 'OK' || g.code === 'INSTALLATIE_MISLUKT' || g.niveau !== 'info')).pop();
};

// ------------------------------------------------------------------------------------------------ opnemen (root → database)
const gezienLog = new Map<string, { size: number; mtimeMs: number }>();
let laatsteSync = 0;
let syncLoopt: Promise<void> | null = null;

/** Alle nieuwe stappen, logregels en uitkomsten van root in de database zetten. Veilig om vaak aan te roepen (gedeeld, ≥ 700 ms apart). */
export function runsSynchroniseren(force = false): Promise<void> {
  if (syncLoopt) return force ? syncLoopt.then(() => runsSynchroniseren(true)) : syncLoopt;
  if (!force && Date.now() - laatsteSync < 700) return Promise.resolve();
  syncLoopt = (async () => {
    try { await synchroniseerEcht(); laatsteSync = Date.now(); }
    catch (err) { console.error('[uitrol-runs] synchroniseren mislukt:', (err as Error).message); }
    finally { syncLoopt = null; }
  })();
  return syncLoopt;
}

async function synchroniseerEcht() {
  const stappenRaw = await leesTekst('stappen.jsonl');
  const events = parseRootGebeurtenissen(await leesTekst('gebeurtenissen.jsonl'));
  let statusBezig = '';
  try { const st = JSON.parse(await leesTekst('status.json')) as Record<string, string>; if (st.staat === 'bezig') statusBezig = String(st.versie || ''); } catch { /* geen status */ }

  const perRun = new Map<string, StapRegel[]>();
  for (const r of parseStappen(stappenRaw)) { const l = perRun.get(r.run); if (l) l.push(r); else perRun.set(r.run, [r]); }

  for (const [id, regels] of perRun) {
    const s = samenvatRun(regels);
    const ev = eindEvent(events, s);
    let code = '', uk = '', nl = '';
    if (ev) { code = ev.code; uk = ev.uk; nl = ev.nl; }
    else if (s.fout) { uk = s.fout.uk; nl = s.fout.nl; code = s.staat === 'mislukt' ? 'INSTALLATIE_MISLUKT' : 'GEWEIGERD'; }
    else if (s.staat === 'klaar') { code = 'OK'; uk = s.stappen.find((x) => x.stap === 'klaar')?.uk || ''; nl = s.stappen.find((x) => x.stap === 'klaar')?.nl || ''; }
    let staat: RunStaat = s.staat;
    // Root meldt een onderbreking (SIGTERM/timeout) of een interne fout zelf (trap in mijn-ruimte-uitrol.sh): dat is «перервано», geen weigering.
    if (ev && (ev.code === 'AFGEBROKEN' || ev.code === 'ONDERBROKEN')) staat = 'afgebroken';
    // Een run zonder nieuwe regel (stap of log) die root niet meer als «bezig» meldt, is vastgelopen.
    const logTijd = await stat(path.join(statusDir(), 'runs', `${id}.log`)).then((x) => x.mtimeMs).catch(() => 0);
    const laatsteActiviteit = Math.max(Date.parse(s.laatsteTijd), logTijd);
    if (staat === 'bezig' && Date.now() - laatsteActiviteit > RUN_STIL_MINUTEN * 60_000 && statusBezig !== s.versie) {
      staat = 'afgebroken'; code = 'RUN_STIL';
      uk = 'Запуск зупинився без завершення (немає нових записів від сервера). Перегляньте журнал і діагностику.'; nl = 'De run is gestopt zonder einde (geen nieuwe regels van de server). Bekijk het logboek en de diagnose.';
    }
    const klaarTijd = staat === 'bezig' ? null : (ev?.tijd || s.laatsteTijd);
    // Oorzaak (punt 6): de echte foutregel + context uit de gebeurtenis van root; blijft bij de run, ook als het logboek wordt ingekort.
    const reden = ev?.reden ? tekst(ev.reden, 400) : '';
    const context = JSON.stringify((ev?.context || []).slice(0, 8).map((r) => tekst(r, 300)));
    await sys().query(`INSERT INTO app.uitrol_runs (id, methode, versie, staat, stap, pct, code, uk, nl, stappen, gestart_op, bijgewerkt_op, geeindigd_op, reden, context)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15::jsonb)
      ON CONFLICT (id) DO UPDATE SET methode = EXCLUDED.methode, versie = EXCLUDED.versie, staat = EXCLUDED.staat, stap = EXCLUDED.stap,
        pct = GREATEST(app.uitrol_runs.pct, EXCLUDED.pct), code = EXCLUDED.code, uk = EXCLUDED.uk, nl = EXCLUDED.nl, stappen = EXCLUDED.stappen,
        bijgewerkt_op = EXCLUDED.bijgewerkt_op, geeindigd_op = EXCLUDED.geeindigd_op, reden = EXCLUDED.reden, context = EXCLUDED.context
      WHERE app.uitrol_runs.staat IN ('bezig', 'afgebroken') OR app.uitrol_runs.stappen IS DISTINCT FROM EXCLUDED.stappen OR app.uitrol_runs.reden IS DISTINCT FROM EXCLUDED.reden`,
      [id, s.methode, s.versie, staat, s.stap, s.pct, tekst(code, 40), tekst(uk, 300), tekst(nl, 300), JSON.stringify(s.stappen), s.gestart, s.laatsteTijd, klaarTijd, reden, context]);
  }

  await logregelsOpnemen();
  await oudeUitkomstenOpnemen(events, perRun);
  await voorstelKoppelen();
  await pakketKoppelen(events);
}

/**
 * Het blijvend bewaarde archief (audit 18.10.2026, punt 4) bij de run zetten: root (OK) en de SSH-installer (SSH_OK) schrijven pad,
 * sha256 en grootte in de uitkomstregel. Daarna kan «Історія» «Завантажити цей випуск» aanbieden en kan de site op GitHub publiceren.
 * Nieuw archief gekoppeld en automatisch publiceren aan → de publicatie in de wachtrij (dynamische import: geen kringverwijzing).
 */
async function pakketKoppelen(events: RootGebeurtenis[]) {
  const nieuw: string[] = [];
  for (const g of events) {
    if (g.bron !== 'uitrol' || !g.pakketPad || !g.pakketSha256) continue;
    let r;
    if (g.code === 'SSH_OK') {
      r = await sys().query(`UPDATE app.uitrol_runs SET pakket_pad = $2, pakket_sha256 = $3, pakket_grootte = $4, pakket_geleverd_sha256 = $5, pakket_herkomst = $6
          WHERE id = $1 AND pakket_pad = '' RETURNING id`,
        [`ssh-${g.id}`, g.pakketPad, g.pakketSha256, g.pakketBytes || 0, g.geleverdSha256 || '', g.pakketHerkomst || '']);
    } else if (g.code === 'OK' && /^\d{8}-\d{6}$/.test(g.tag || '')) {
      r = await sys().query(`UPDATE app.uitrol_runs SET pakket_pad = $2, pakket_sha256 = $3, pakket_grootte = $4, pakket_geleverd_sha256 = $6, pakket_herkomst = $7
          WHERE id = (SELECT id FROM app.uitrol_runs WHERE versie = $1 AND staat = 'klaar' AND methode <> 'ssh' AND pakket_pad = ''
                      AND gestart_op <= $5::timestamptz + interval '1 minute' ORDER BY gestart_op DESC LIMIT 1) RETURNING id`,
        [g.tag, g.pakketPad, g.pakketSha256, g.pakketBytes || 0, g.tijd, g.geleverdSha256 || '', g.pakketHerkomst || '']);
    } else continue;
    for (const row of r.rows) nieuw.push(String(row.id));
  }
  if (!nieuw.length) return;
  try { const m = await import('./uitrol-github'); for (const id of nieuw) m.naInstallatie(id); } catch (err) { console.error('[uitrol-runs] github-wachtrij:', (err as Error).message); }
}

/**
 * Het logboek van één run, zo leesbaar als het kan:
 *  1. runs/<run>.log (het eigen logboek van de run, door root geschreven);
 *  2. installeer.log (de staart van het logboek van de LAATSTE run) — vangnet voor het geval runs/<run>.log voor de app onleesbaar is
 *     (een oudere versie van het root-script maakte dat bestand met de groep root, waardoor de terminal op de site leeg bleef).
 *     Dit bestand telt alleen als het zelf bewijst bij deze run te horen: de eerste «[uitrol] run <id>»-regel moet dit id zijn.
 */
export async function leesRunLog(id: string): Promise<{ raw: string; size: number; mtimeMs: number; bron: 'run' | 'installeer' } | null> {
  const eigen = path.join(statusDir(), 'runs', `${id}.log`);
  try { const [raw, st] = [await readFile(eigen, 'utf8'), await stat(eigen)]; return { raw, size: st.size, mtimeMs: st.mtimeMs, bron: 'run' }; } catch { /* ontbreekt of onleesbaar: vangnet */ }
  const vangnet = path.join(statusDir(), 'installeer.log');
  try {
    const [raw, st] = [await readFile(vangnet, 'utf8'), await stat(vangnet)];
    const kop = /^\[uitrol\] run (\S+?):/m.exec(raw);
    if (!kop || kop[1] !== id) return null;
    return { raw, size: st.size, mtimeMs: st.mtimeMs, bron: 'installeer' };
  } catch { return null; }
}

async function logregelsOpnemen() {
  let namen: string[] = [];
  try { namen = (await readdir(path.join(statusDir(), 'runs'))).filter((n) => n.endsWith('.log') && RUN_ID.test(n.slice(0, -4))).map((n) => n.slice(0, -4)); } catch { /* map ontbreekt of onleesbaar */ }
  // Ook runs waarvan het eigen logboek niet leesbaar is (of nog niet bestaat) komen in aanmerking: lopende, of recent afgesloten zonder regels.
  const kandidaten = (await sys().query(`SELECT id FROM app.uitrol_runs WHERE methode <> 'ssh' AND (staat = 'bezig' OR (log_regels = 0 AND bijgewerkt_op > now() - interval '12 hours')) ORDER BY gestart_op DESC LIMIT 5`)).rows
    .map((r) => String(r.id)).filter((i) => RUN_ID.test(i));
  for (const id of new Set([...namen, ...kandidaten])) {
    const log = await leesRunLog(id);
    if (!log) continue;
    const vorig = gezienLog.get(id);
    if (vorig && vorig.size === log.size && vorig.mtimeMs === log.mtimeMs) continue;
    const { rows } = await sys().query('SELECT log_regels, sub, pct, staat, stap FROM app.uitrol_runs WHERE id = $1', [id]);
    if (!rows[0]) continue; // run nog niet opgenomen (stappen volgen zo)
    const lijnen = log.raw.split('\n'); if (lijnen[lijnen.length - 1] === '') lijnen.pop();
    const al = Number(rows[0].log_regels);
    if (lijnen.length > al) {
      const nieuw = lijnen.slice(al, al + 2000);
      let sub = String(rows[0].sub || '') as Sub;
      let installatieKlaar = false;
      for (const l of nieuw) { const v = subVanRegel(l); if (v === 'klaar') installatieKlaar = true; else if (v) sub = v; }
      // Het logboek heeft geen tijdstempels. Wordt het live gevolgd (poll ≈ 1,5 s), dan is de opnametijd binnen ±2 s juist. Komt een run pas laat in beeld
      // (pagina later geopend, app herstart), dan zouden alle regels dezelfde tijd krijgen: dan verdelen we ze evenredig tussen de laatst bekende tijd
      // (of het begin van de run) en het tijdstip waarop root het bestand voor het laatst schreef.
      const van = Date.parse(String((await sys().query('SELECT COALESCE((SELECT max(tijd) FROM app.uitrol_run_regels WHERE run_id = $1), (SELECT gestart_op FROM app.uitrol_runs WHERE id = $1)) AS t', [id])).rows[0]?.t || ''));
      const tot = Math.min(Date.now(), log.mtimeMs);
      const nu = Date.now();
      const tijden = nieuw.map((_, i) => new Date(Number.isFinite(van) && tot - van > 3000 && nieuw.length > 1 && nu - tot > 3000 ? van + ((tot - van) * (i + 1)) / nieuw.length : nu).toISOString());
      await sys().query(`INSERT INTO app.uitrol_run_regels (run_id, nr, niveau, tekst, tijd)
        SELECT $1, n, l, t, w FROM unnest($2::int[], $3::text[], $4::text[], $5::timestamptz[]) AS x(n, l, t, w) ON CONFLICT DO NOTHING`,
      [id, nieuw.map((_, i) => al + i), nieuw.map((l) => niveauVanRegel(l)), nieuw.map((l) => tekst(l, 600)), tijden]);
      // Het percentage groeit met de onderdelen van de installatie, maar alleen zolang root de stap «installeren» als bezig meldt.
      const bezigInstalleren = rows[0].staat === 'bezig' && rows[0].stap === 'installeren';
      await sys().query(`UPDATE app.uitrol_runs SET log_regels = $2, sub = $3, pct = CASE WHEN $4::boolean THEN GREATEST(pct, $5::int) ELSE pct END,
        bijgewerkt_op = now() WHERE id = $1`,
      [id, al + nieuw.length, sub, bezigInstalleren && !installatieKlaar, procentVoor(sub)]);
    }
    gezienLog.set(id, { size: log.size, mtimeMs: log.mtimeMs });
  }
}

/**
 * Uitkomsten zonder stappen: SSH-installaties en runs van vóór deze versie van het root-script. Zo komt de geschiedenis die al in
 * gebeurtenissen.jsonl staat (laatste 500) vanzelf in de database. Nooit dubbel: bestaat er al een run met dezelfde versie en methode
 * binnen 15 minuten, dan is dat dezelfde uitrol.
 */
/** Waarde in goedgekeurd_door voor een installatie via SSH (de site toont daar «SSH, root, без passkey» met uitleg). */
export const SSH_ROOT_GOEDKEURING = 'ssh-root';
async function oudeUitkomstenOpnemen(events: RootGebeurtenis[], perRun: Map<string, StapRegel[]>) {
  for (const g of events) {
    if (g.bron !== 'uitrol') continue;
    const tijd = g.tijd; if (!tijdOk(tijd)) continue;
    // SSH-installatie/-terugdraaiing, en (0062) terugdraaien via dashboard (opdracht) of bewaker (nazorg): de installer schrijft TERUG_OK met die herkomst.
    // «besluit» (22.10.2026, §15): terugdraaien op een met passkey ondertekend besluit van de eigenaar — in de geschiedenis als methode 'opdracht', wie = 'passkey'.
    const terug = g.code === 'TERUG_OK' && (g.herkomst === 'opdracht' || g.herkomst === 'nazorg' || g.herkomst === 'besluit') ? (g.herkomst === 'besluit' ? 'opdracht' : g.herkomst) : '';
    if (g.code === 'SSH_OK' || g.code === 'SSH_TERUG' || terug) {
      await sys().query(`INSERT INTO app.uitrol_runs (id, methode, versie, release, staat, stap, pct, code, uk, nl, stappen, bron_commit, wie, adres, gestart_op, bijgewerkt_op, geeindigd_op)
        VALUES ($1, $12, $2, $3, 'klaar', 'klaar', 100, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $11, $11) ON CONFLICT (id) DO NOTHING`,
      [`${terug || 'ssh'}-${g.id}`, g.pakket || '', g.release || g.tag || '', g.code, tekst(g.uk, 300), tekst(g.nl, 300),
        JSON.stringify([{ stap: 'klaar', staat: 'ok', pct: 100, tijd, uk: tekst(g.uk, 300), nl: tekst(g.nl, 300) }]), g.bronCommit || g.commit || '', g.wie || '', g.adres || '', tijd, terug || 'ssh']);
      // Pakketgegevens van een SSH-installatie (29.10.2026): wie voorbereidde, «SSH, root, zonder passkey», sha256 en grootte.
      if (g.code === 'SSH_OK' && (g.auteur || g.agent || g.goedkeuring || g.pakketSha256)) {
        await sys().query(`UPDATE app.uitrol_runs SET voorbereider = CASE WHEN voorbereider = '' THEN $2 ELSE voorbereider END,
            goedgekeurd_door = CASE WHEN goedgekeurd_door = '' THEN $3 ELSE goedgekeurd_door END,
            sha256 = CASE WHEN sha256 = '' THEN $4 ELSE sha256 END, bytes = CASE WHEN bytes = 0 THEN $5 ELSE bytes END WHERE id = $1`,
        [`ssh-${g.id}`, [g.auteur, g.agent].filter(Boolean).join(' · '), g.goedkeuring === 'ssh-root' ? SSH_ROOT_GOEDKEURING : '', g.pakketSha256 || '', g.pakketBytes || 0]);
      }
      continue;
    }
    const methode = g.herkomst && (METHODEN as readonly string[]).includes(g.herkomst) ? (g.herkomst as Methode) : null;
    if (!methode || methode === 'ssh') continue;
    const eind = g.code === 'OK' || g.code === 'INSTALLATIE_MISLUKT' || g.niveau !== 'info';
    if (!eind) continue;
    const versie = /^\d{8}-\d{6}$/.test(g.tag || '') ? (g.tag as string) : '';
    // Hoort deze uitkomst bij een run met stappen? Dan is die al opgenomen.
    const heeftRun = [...perRun.values()].some((r) => r[0].methode === methode && r[0].versie === versie && Math.abs(Date.parse(r[0].tijd) - Date.parse(tijd)) < 15 * 60_000);
    if (heeftRun) continue;
    const staat: RunStaat = g.code === 'OK' ? 'klaar' : g.code === 'INSTALLATIE_MISLUKT' ? 'mislukt' : 'geweigerd';
    const dubbel = await sys().query(`SELECT 1 FROM app.uitrol_runs WHERE versie = $1 AND methode = $2 AND gestart_op BETWEEN $3::timestamptz - interval '15 minutes' AND $3::timestamptz + interval '15 minutes' LIMIT 1`, [versie, methode, tijd]);
    if (dubbel.rows[0]) continue;
    const laatsteStap: Stap = staat === 'klaar' ? 'klaar' : staat === 'mislukt' ? 'installeren' : 'echtheid';
    await sys().query(`INSERT INTO app.uitrol_runs (id, methode, versie, staat, stap, pct, code, uk, nl, stappen, gestart_op, bijgewerkt_op, geeindigd_op)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $11, $11) ON CONFLICT (id) DO NOTHING`,
    [`ev-${g.id}`, methode, versie, staat, laatsteStap, staat === 'klaar' ? 100 : 0, g.code, tekst(g.uk, 300), tekst(g.nl, 300),
      JSON.stringify([{ stap: laatsteStap, staat: staat === 'klaar' ? 'ok' : 'fout', pct: staat === 'klaar' ? 100 : 0, tijd, uk: tekst(g.uk, 300), nl: tekst(g.nl, 300) }]), tijd]);
  }
}

/** Pakketgegevens (sha256, commit, wie bereidde voor, wat veranderde) bij de run bewaren, zodat ze blijven staan als het voorstel wordt opgeruimd. */
async function voorstelKoppelen() {
  await sys().query(`WITH k AS (
      SELECT r.id AS rid, (SELECT v.id FROM app.uitrol_voorstellen v WHERE v.versie = r.versie AND v.beslist_op IS NOT NULL AND v.beslist_op <= r.gestart_op + interval '2 minutes'
                           ORDER BY v.beslist_op DESC LIMIT 1) AS vid
        FROM app.uitrol_runs r WHERE r.voorstel_id IS NULL AND r.methode = 'passkey' AND r.versie <> '')
    UPDATE app.uitrol_runs r SET voorstel_id = v.id, sha256 = v.sha256, bytes = v.bytes, bron_commit = COALESCE(v.bron_commit, r.bron_commit),
        voorbereider = v.voorbereider_label, goedgekeurd_door = COALESCE(v.beslist_door, ''), wijzigingen = left(v.wijzigingen, 8000)
      FROM k JOIN app.uitrol_voorstellen v ON v.id = k.vid WHERE r.id = k.rid`);
}

// ------------------------------------------------------------------------------------------------ lezen (API)
const runUit = (r: any) => ({
  id: String(r.id), methode: String(r.methode) as Methode, versie: String(r.versie), release: String(r.release || ''), staat: String(r.staat) as RunStaat,
  stap: String(r.stap), sub: String(r.sub || ''), pct: Number(r.pct), code: String(r.code), uk: String(r.uk), nl: String(r.nl), stappen: (r.stappen || []) as RunStap[],
  voorstelId: r.voorstel_id ? String(r.voorstel_id) : '', sha256: String(r.sha256 || ''), bytes: Number(r.bytes || 0), commit: String(r.bron_commit || ''),
  voorbereider: String(r.voorbereider || ''), goedgekeurdDoor: String(r.goedgekeurd_door || ''), wijzigingen: String(r.wijzigingen || ''), wie: String(r.wie || ''), adres: String(r.adres || ''),
  logRegels: Number(r.log_regels || 0), gestart: iso(r.gestart_op), bijgewerkt: iso(r.bijgewerkt_op), geeindigd: iso(r.geeindigd_op),
  reden: String(r.reden || ''), context: (Array.isArray(r.context) ? r.context : []).map(String) as string[],
  // Archief (punt 4): alleen of het er is, de sha256 en de grootte — nooit het pad op de server.
  // 29.10.2026: sha256 van het geleverde archief en de herkomst van het bewaarde bestand ('' = oude rij, onbekend).
  pakket: { bewaard: Boolean(r.pakket_pad), sha256: String(r.pakket_sha256 || ''), grootte: Number(r.pakket_grootte || 0), geleverdSha256: String(r.pakket_geleverd_sha256 || ''), herkomst: String(r.pakket_herkomst || '') as '' | 'geleverd' | 'opnieuw-ingepakt' },
  github: { url: String(r.github_release_url || ''), fout: String(r.github_fout || ''), pogingen: Number(r.github_pogingen || 0), op: iso(r.github_op) },
});
export type RunUit = ReturnType<typeof runUit>;

export type RunFilter = { q?: unknown; staat?: unknown; methode?: unknown; van?: unknown; tot?: unknown; pagina?: unknown; perPagina?: unknown };
const lijst = (v: unknown, toegestaan: readonly string[]) => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(',') : []).map(String).filter((x) => toegestaan.includes(x));
const datumOk = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(v) && Number.isFinite(Date.parse(v)) ? v : '');

export async function runsLijst(f: RunFilter) {
  await runsSynchroniseren();
  const staten = lijst(f.staat, RUN_STATEN), methoden = lijst(f.methode, METHODEN);
  const q = tekst(f.q, 80).trim(), van = datumOk(f.van), tot = datumOk(f.tot);
  const perPagina = Math.max(5, Math.min(50, Math.trunc(Number(f.perPagina) || 15)));
  const pagina = Math.max(1, Math.min(10_000, Math.trunc(Number(f.pagina) || 1)));
  const waar: string[] = []; const p: unknown[] = [];
  const bind = (v: unknown) => { p.push(v); return `$${p.length}`; };
  if (methoden.length) waar.push(`methode = ANY(${bind(methoden)}::text[])`);
  if (van) waar.push(`gestart_op >= ${bind(van)}::timestamptz`);
  if (tot) waar.push(`gestart_op < (${bind(tot)}::timestamptz + interval '1 day')`);
  if (q) {
    const l = bind(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    waar.push(`(versie ILIKE ${l} OR release ILIKE ${l} OR bron_commit ILIKE ${l} OR wie ILIKE ${l} OR voorbereider ILIKE ${l} OR code ILIKE ${l} OR uk ILIKE ${l} OR nl ILIKE ${l} OR wijzigingen ILIKE ${l} OR sha256 ILIKE ${l})`);
  }
  const basis = waar.length ? `WHERE ${waar.join(' AND ')}` : '';
  const tellers = (await sys().query(`SELECT staat, count(*)::int AS n FROM app.uitrol_runs ${basis} GROUP BY staat`, p)).rows as Array<{ staat: string; n: number }>;
  const metStaat = staten.length ? `${basis ? `${basis} AND` : 'WHERE'} staat = ANY(${bind(staten)}::text[])` : basis;
  const totaal = Number((await sys().query(`SELECT count(*)::int AS n FROM app.uitrol_runs ${metStaat}`, p)).rows[0].n);
  const { rows } = await sys().query(`SELECT * FROM app.uitrol_runs ${metStaat} ORDER BY gestart_op DESC, id DESC LIMIT ${bind(perPagina)} OFFSET ${bind((pagina - 1) * perPagina)}`, p);
  return { totaal, pagina, perPagina, paginas: Math.max(1, Math.ceil(totaal / perPagina)), runs: rows.map(runUit), tellers: Object.fromEntries(tellers.map((t) => [t.staat, t.n])) };
}

export async function runDetail(id: unknown) {
  await runsSynchroniseren();
  const rid = String(id || '');
  if (!/^[A-Za-z0-9T:.-]{3,80}$/.test(rid)) return null;
  const { rows } = await sys().query('SELECT * FROM app.uitrol_runs WHERE id = $1', [rid]);
  if (!rows[0]) return null;
  const run = runUit(rows[0]);
  const ev = parseRootGebeurtenissen(await leesTekst('gebeurtenissen.jsonl'));
  const van = Date.parse(run.gestart) - 60_000, tot = Date.parse(run.geeindigd || run.bijgewerkt) + 180_000;
  const gebeurtenissen = run.methode === 'ssh' ? [] : ev.filter((g) => g.bron === 'uitrol' && (!run.versie || g.tag === run.versie) && Date.parse(g.tijd) >= van && Date.parse(g.tijd) <= tot)
    .map((g) => ({ id: g.id, tijd: g.tijd, code: g.code, niveau: g.niveau, uk: g.uk, nl: g.nl }));
  return { run, gebeurtenissen };
}

export async function runRegels(id: unknown, na: unknown, limiet = 400) {
  const rid = String(id || '');
  const sinds = Math.max(-1, Math.min(1_000_000, Math.trunc(Number(na ?? -1)) || -1));
  const { rows } = await sys().query(`SELECT nr, tijd, niveau, tekst FROM app.uitrol_run_regels WHERE run_id = $1 AND nr > $2 ORDER BY nr LIMIT $3`, [rid, sinds, Math.max(1, Math.min(2000, limiet))]);
  return rows.map((r) => ({ nr: Number(r.nr), tijd: iso(r.tijd), niveau: String(r.niveau) as 'info' | 'ok' | 'warn' | 'error', tekst: String(r.tekst) }));
}

/** Aantal regels per live-aanroep; de browser haalt bij een volle pagina meteen de volgende op (geen wachttijd van een pollinterval). */
export const LIVE_PAGINA = 2000;
/** Eén poll voor de levende kaart: de gekozen (of lopende, of laatste) run met de nieuwe logregels sinds `na`. */
export async function liveStand(runId: unknown, na: unknown) {
  await runsSynchroniseren();
  let id = String(runId || '');
  if (!id) {
    const bezig = (await sys().query(`SELECT id FROM app.uitrol_runs WHERE staat = 'bezig' ORDER BY gestart_op DESC LIMIT 1`)).rows[0];
    id = bezig ? String(bezig.id) : String((await sys().query('SELECT id FROM app.uitrol_runs ORDER BY gestart_op DESC LIMIT 1')).rows[0]?.id || '');
  }
  if (!id) return { run: null, regels: [] as Awaited<ReturnType<typeof runRegels>>, nu: new Date().toISOString() };
  const { rows } = await sys().query('SELECT * FROM app.uitrol_runs WHERE id = $1', [id]);
  if (!rows[0]) return { run: null, regels: [], nu: new Date().toISOString() };
  return { run: runUit(rows[0]), regels: await runRegels(id, na, LIVE_PAGINA), nu: new Date().toISOString() };
}

export type Diagnose = { tijd: string; leeftijdSec: number; gezond: boolean; problemen: Array<{ code: string; uk: string; nl: string }>; [k: string]: unknown };
/** diagnose.json van root + wat de app zelf ziet (wanneer root voor het laatst een stap schreef, of de statusmap leesbaar is). */
export async function diagnose() {
  let root: Diagnose | null = null;
  try {
    const d = JSON.parse(await readFile(path.join(statusDir(), 'diagnose.json'), 'utf8')) as Diagnose;
    root = { ...d, leeftijdSec: Math.max(0, Math.round((Date.now() - Date.parse(String(d.tijd))) / 1000)) };
  } catch { root = null; }
  let mapOk = true; let stappenTijd = '';
  try { await stat(statusDir()); } catch { mapOk = false; }
  const regels = parseStappen(await leesTekst('stappen.jsonl'));
  if (regels.length) stappenTijd = regels[regels.length - 1].tijd;
  const wacht = (await sys().query(`SELECT id, versie, beslist_op FROM app.uitrol_voorstellen WHERE status = 'goedgekeurd' ORDER BY beslist_op ASC`)).rows
    .map((r) => ({ id: String(r.id), versie: String(r.versie), beslist: iso(r.beslist_op), seconden: Math.max(0, Math.round((Date.now() - new Date(r.beslist_op).getTime()) / 1000)) }));
  return { root, app: { statusMapLeesbaar: mapOk, laatsteStapTijd: stappenTijd, wachtOpRoot: wacht } };
}
