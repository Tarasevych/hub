// Rendercontrole-uitslag voor «Діагностика» (zone A, 22.10.2026). De app voert zelf GEEN browser uit (geen child_process; de dienst mag
// dat niet en hoort het niet te kunnen): ze leest alleen het resultaat dat de installer of de nazorg-bewaker als root heeft geschreven
// (/var/lib/mijn-ruimte-uitrol-status/rook-controle.json, root:mijnruimte 0640) en kan een LEEG verzoekbestand in de goedkeur-inbox
// zetten; de nazorg-timer (root, elke minuut) ziet dat bestand, verwijdert het en start `mijn-ruimte-installeer rook-controle`.
// Eerlijkheid: zonder browser op de server staat er «alleen HTTP, rendering niet gecontroleerd» — nooit een groen vinkje op gok.
import { access, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConst } from 'node:fs';
import path from 'node:path';
import { releaseInfo } from './uitgave-info';

export type RookPagina = { naam: string; url: string; stand: 'ok' | 'kapot'; fouten: string[]; http: number; ms: number };
export type RookUitslag = {
  tijd: string; modus: 'stand' | 'live' | 'modules' | 'geen'; chromium: string; chromiumVersie?: string; release?: string; uitgevoerd: boolean; kapot: boolean;
  paginas: RookPagina[]; bundels: { aantal: number; ok: number; kapot: string[]; waarschuwingen?: string[]; onbeoordeelbaar?: string[]; modus: string };
  fouten: string[]; samenvatting: { uk: string; nl: string }; ms: number; code?: number;
};

const statusDir = () => process.env.OPDRACHT_STATUS_DIR || '/var/lib/mijn-ruimte-uitrol-status';
const inbox = () => process.env.GOEDKEUR_INBOX || '/srv/mijn-ruimte/goedkeur-inbox';
export const ROOK_BESTAND = 'rook-controle.json';
export const ROOK_VERZOEK = 'rook-verzoek';
/** Ouder dan dit = «verouderd» (de release kan intussen anders zijn). */
export const ROOK_MAX_LEEFTIJD_MS = 7 * 24 * 3_600_000;
/** Waar de installer een browser zoekt (dezelfde lijst als scripts/rook-controle.mjs en deploy/installeer-app.sh rook_chromium). */
export const CHROMIUM_PADEN = ['/srv/mijn-ruimte/browser/chrome-headless-shell', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/lib/chromium/chromium'];

const str = (v: unknown, max = 400) => (typeof v === 'string' ? v.slice(0, max) : '');
const lijst = (v: unknown, max = 40) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => (x as string).slice(0, 300)).slice(0, max) : []);

/** Ruwe JSON → vaste vorm; alles wat vreemd is wordt weggeknipt (het bestand is van root, maar we vertrouwen nooit blind). */
export function normaliseerRook(raw: unknown): RookUitslag | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const modus = ['stand', 'live', 'modules', 'geen'].includes(String(o.modus)) ? (o.modus as RookUitslag['modus']) : 'geen';
  const b = (o.bundels && typeof o.bundels === 'object' ? o.bundels : {}) as Record<string, unknown>;
  const s = (o.samenvatting && typeof o.samenvatting === 'object' ? o.samenvatting : {}) as Record<string, unknown>;
  const paginas = (Array.isArray(o.paginas) ? o.paginas : []).map((p): RookPagina | null => {
    if (!p || typeof p !== 'object') return null;
    const q = p as Record<string, unknown>;
    if (!/^[a-z0-9-]{2,40}$/.test(String(q.naam))) return null;
    return { naam: String(q.naam), url: str(q.url, 200), stand: q.stand === 'kapot' ? 'kapot' : 'ok', fouten: lijst(q.fouten, 8), http: Number(q.http) || 0, ms: Number(q.ms) || 0 };
  }).filter((p): p is RookPagina => !!p);
  return {
    tijd: str(o.tijd, 40), modus, chromium: str(o.chromium, 200), chromiumVersie: str(o.chromiumVersie, 60) || undefined, release: /^[0-9]{8}-[0-9]{6}$/.test(String(o.release)) ? String(o.release) : undefined,
    uitgevoerd: o.uitgevoerd === true, kapot: o.kapot === true, paginas,
    bundels: { aantal: Number(b.aantal) || 0, ok: Number(b.ok) || 0, kapot: lijst(b.kapot), waarschuwingen: lijst(b.waarschuwingen), onbeoordeelbaar: lijst(b.onbeoordeelbaar, 10), modus: str(b.modus, 20) },
    fouten: lijst(o.fouten, 5), samenvatting: { uk: str(s.uk), nl: str(s.nl) }, ms: Number(o.ms) || 0, code: Number.isFinite(Number(o.code)) ? Number(o.code) : undefined,
  };
}

export async function leesRook(): Promise<RookUitslag | null> {
  try { return normaliseerRook(JSON.parse(await readFile(path.join(statusDir(), ROOK_BESTAND), 'utf8'))); } catch { return null; }
}

export async function browserAanwezig(): Promise<string> {
  for (const p of [process.env.ROOK_CHROMIUM, ...CHROMIUM_PADEN]) { if (!p) continue; try { await access(p, fsConst.X_OK); return p; } catch { /* volgende */ } }
  return '';
}

export type RookBeoordeling = { stand: 'ok' | 'let-op' | 'fout' | 'onbekend'; code: string; detail: string; leeftijdMs: number; verouderd: boolean };

/** Zuivere beoordeling van de laatste uitslag voor het register-item «pagina-rendering» (getest zonder bestanden). */
export function beoordeelRook(u: RookUitslag | null, nu: number, huidigeVersie: string | null, browser: string): RookBeoordeling {
  if (!u) {
    return browser
      ? { stand: 'onbekend', code: 'ROOK_GEEN', detail: 'Рендеринг ще не перевірявся (запустіть «Перевірити рендеринг» або встановіть пакет)', leeftijdMs: 0, verouderd: false }
      : { stand: 'let-op', code: 'ROOK_NIET_GECONTROLEERD', detail: 'Лише HTTP, рендеринг не перевірено: на сервері немає браузера (sudo mijn-ruimte-installeer browser-controle)', leeftijdMs: 0, verouderd: false };
  }
  const t = Date.parse(u.tijd); const leeftijdMs = Number.isFinite(t) ? Math.max(0, nu - t) : ROOK_MAX_LEEFTIJD_MS + 1;
  const andereRelease = !!(u.release && huidigeVersie && u.release !== huidigeVersie);
  const verouderd = leeftijdMs > ROOK_MAX_LEEFTIJD_MS || andereRelease;
  const wanneer = `${new Date(t || nu).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  if (!u.uitgevoerd) return { stand: 'let-op', code: 'ROOK_NIET_UITGEVOERD', detail: `Остання перевірка (${wanneer}) не виконалась: ${u.fouten[0] || 'невідомо'}`, leeftijdMs, verouderd };
  if (u.modus === 'modules' || !u.chromium) {
    const kapot = u.bundels.kapot.length;
    return kapot
      ? { stand: 'fout', code: 'ROOK_KAPOT', detail: `Лише модулі (без браузера): ${kapot} бандл(ів) падає на рівні модуля — ${u.bundels.kapot[0]}`, leeftijdMs, verouderd }
      : { stand: 'let-op', code: 'ROOK_NIET_GECONTROLEERD', detail: `Лише HTTP + модулі (${u.bundels.ok}/${u.bundels.aantal} ок, ${wanneer}): рендеринг не перевірено — встановіть браузер (sudo mijn-ruimte-installeer browser-controle)`, leeftijdMs, verouderd };
  }
  const kapot = u.paginas.filter((p) => p.stand === 'kapot');
  const waar = u.modus === 'live' ? 'жива служба, без входу' : 'стенд із тестовим власником і технічним профілем';
  if (kapot.length || u.bundels.kapot.length) {
    const eerste = kapot[0] ? `сторінка ${kapot[0].naam} не рендериться (${kapot[0].fouten[0] || '?'})` : `бандл ${u.bundels.kapot[0]}`;
    return { stand: 'fout', code: 'ROOK_KAPOT', detail: `${wanneer} (${waar}): ${kapot.length} з ${u.paginas.length} сторінок зламано, бандлів ${u.bundels.kapot.length}; ${eerste}`, leeftijdMs, verouderd };
  }
  if (verouderd) return { stand: 'let-op', code: 'ROOK_OUD', detail: `Остання перевірка ${wanneer}${andereRelease ? ` для іншого випуску (${u.release})` : ''}: ${u.paginas.length} сторінок ок — запустіть знову для поточного випуску`, leeftijdMs, verouderd };
  const w = u.bundels.waarschuwingen?.length || 0;
  return { stand: w ? 'let-op' : 'ok', code: w ? 'ROOK_WAARSCHUWING' : '', detail: `${wanneer} (${waar}): ${u.paginas.length} сторінок рендеряться, бандлів ${u.bundels.ok}/${u.bundels.aantal}${w ? `; попередження: ${u.bundels.waarschuwingen![0]}` : ''}`, leeftijdMs, verouderd };
}

/** Voor de HTTP-controles «pagina-<slug>»: wat zei de laatste browsercontrole over DEZE admin-pagina? */
export function paginaUitRook(u: RookUitslag | null, slug: string, nu: number, huidigeVersie: string | null): { tekst: string; kapot: boolean; gecontroleerd: boolean } {
  if (!u || !u.uitgevoerd || u.modus === 'modules' || u.modus === 'geen' || !u.chromium) return { tekst: 'лише HTTP, рендеринг не перевірено (встановіть browser-controle)', kapot: false, gecontroleerd: false };
  const p = u.paginas.find((x) => x.naam === `admin-${slug}`);
  if (!p) return { tekst: 'лише HTTP; ця сторінка не входить у рендер-контроль', kapot: false, gecontroleerd: false };
  const t = Date.parse(u.tijd); const oud = !Number.isFinite(t) || nu - t > ROOK_MAX_LEEFTIJD_MS || !!(u.release && huidigeVersie && u.release !== huidigeVersie);
  const wanneer = Number.isFinite(t) ? `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '?';
  if (p.stand === 'kapot') return { tekst: `рендеринг ЗЛАМАНО (${wanneer}): ${p.fouten[0] || '?'}`, kapot: true, gecontroleerd: true };
  return { tekst: `рендеринг ок у браузері (${wanneer}${oud ? ', застаріло' : ''})`, kapot: false, gecontroleerd: !oud };
}

/** Verzoek aan root: leeg bestand in de goedkeur-inbox; de nazorg-timer pakt het binnen een minuut op. Alleen het bestaan telt. */
export async function rookAanvragen(): Promise<{ ok: boolean; reden?: string }> {
  try { await writeFile(path.join(inbox(), ROOK_VERZOEK), '', { flag: 'w', mode: 0o640 }); return { ok: true }; }
  catch (e) { return { ok: false, reden: String((e as NodeJS.ErrnoException).code || 'SCHRIJVEN_MISLUKT') }; }
}

export async function rookWachtend(): Promise<boolean> {
  try { await access(path.join(inbox(), ROOK_VERZOEK), fsConst.F_OK); return true; } catch { return false; }
}

export const huidigeVersie = (): string | null => { const v = releaseInfo().versie; return v && /^[0-9]{8}-[0-9]{6}$/.test(v) ? v : null; };
