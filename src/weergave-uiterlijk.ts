// Uiterlijk (thema, palet, auto, menuhint, geluid, belpositie, laatste paden) — de SERVER is de bron van waarheid, PER ACCOUNT en
// PER WEBRUIMTE. Punt 2 en punt 4, audit 20.10.2026. Exact dezelfde mechaniek als het menu (src/zijbalk-voorkeuren.ts):
//   • lezen: de GEBRUIKERSruimte komt mee in de bootstrap (uiPreferences.weergave); de TECHNISCHE ruimte staat NIET in de
//     bootstrap en wordt apart gevraagd (POST /api/owner/ui/weergave, ruimte:'technisch') — dat lukt alleen met een LOPEND
//     technisch profiel in DIT tabblad, anders 403 TECH_PROFIEL_VEREIST (ook voor de eigenaar);
//   • schrijven: gebundeld (350 ms) naar POST /api/owner/ui/weergave/save, altijd met de ruimte waarin dit tabblad staat;
//   • bij een accountwissel wordt openstaande opslag AFGEBROKEN: nooit het uiterlijk van de één onder het account van de ander;
//   • zonder goedgekeurde accountsessie blijft alles lokaal (cookie + sessionStorage), zoals bij een anonieme bezoeker.
// De cookie blijft alleen de snelle cache voor het eerste beeld (src/gedeelde-voorkeuren.ts).
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import {
  abonneerWeergave, uiterlijkVanServerZetten, uiterlijkVoorServer, weergaveAccountNu, weergaveRuimteNu,
  zetWeergaveAccount, zetWeergaveRuimte,
} from './gedeelde-voorkeuren';
import { cacheAccountKey } from './domein-weergave-cache';
import { normaliseerUiterlijkRuimte, uiterlijkLeeg, type UiterlijkRuimte } from '../shared/uiterlijk';
import type { MenuRuimte } from '../shared/menu-model';

type Server = { service: string; scope?: string } | null;
let server: Server = null;
let laatsteServer: Record<MenuRuimte, string> = { gebruiker: '', technisch: '' };
let gestart = false;

/** `routeBeeld` gaat NIET naar de server: dat is puur een skelet-hint voor het eerste beeld van DEZE browser en zegt op een ander
 *  toestel niets. `op` ook niet (dat dient alleen om cookie en sessionStorage samen te voegen). Al het andere wel: thema, palet,
 *  automatisch schakelen, menuhint, meldingsgeluid, plaats van de bel en de laatste paden. */
const schoon = (raw: unknown): UiterlijkRuimte => { const v = normaliseerUiterlijkRuimte(raw); delete v.routeBeeld; delete v.op; return v; };
const voorServer = (ruimte: MenuRuimte, account: string): UiterlijkRuimte => schoon(uiterlijkVoorServer(ruimte, account));
/** Een serverstand toepassen en de lokale skelet-hint (`routeBeeld`) laten staan: die kent alleen deze browser. */
const toepassen = (ruimte: MenuRuimte, v: UiterlijkRuimte, account: string) => uiterlijkVanServerZetten(ruimte, { ...v, routeBeeld: uiterlijkVoorServer(ruimte, account).routeBeeld }, account);
const vorm = (v: UiterlijkRuimte) => JSON.stringify(v);

const wachtenden = new Map<string, number>();
function wachtendenAf() { if (typeof window === 'undefined') { wachtenden.clear(); return; } for (const t of wachtenden.values()) window.clearTimeout(t); wachtenden.clear(); }

/** Uit de bootstrap (uiPreferences.weergave) — altijd de GEBRUIKERSruimte. `ctx` alleen bij een goedgekeurd account. */
export function weergaveVanServer(raw: unknown, ctx: Server): void {
  // Zelfde aanroep als zijbalkVanServer (het account-id van de sessie); hier wordt het de KORTE accountsleutel 'u-xxxxxxxx', want
  // dat is wat ook in de cookie (accountPerDienst) en in het eerste beeld (index.html) staat.
  const nieuwAccount = ctx ? cacheAccountKey(ctx.scope) : 'anon';
  if (nieuwAccount !== weergaveAccountNu()) { wachtendenAf(); laatsteServer = { gebruiker: '', technisch: '' }; }
  server = ctx; // eerst: een afmelding mag onderweg niets meer versturen, en een wissel nooit op naam van de vorige
  zetWeergaveAccount(nieuwAccount);
  start();
  if (!ctx) return;
  const account = weergaveAccountNu();
  if (weergaveRuimteNu() === 'technisch') void technischOphalen();
  if (raw === undefined || raw === null) {
    // De server heeft voor dit account nog geen stand. Wat deze browser al had — onder andere de gemigreerde gedeelde waarde van
    // vóór de splitsing (punt 3) — gaat één keer omhoog, zodat het uiterlijk ook op een ander toestel hetzelfde blijft. Van een
    // ANDER account kan hier niets staan: de scope is al die van dit account.
    if (!uiterlijkLeeg(voorServer('gebruiker', account))) naarServer(ctx, account, 'gebruiker');
    return;
  }
  const v = schoon(raw), s = vorm(v);
  if (s === laatsteServer.gebruiker) return;
  laatsteServer.gebruiker = s;
  toepassen('gebruiker', v, account);
}

/** Van ruimte wisselen (CanonicalChrome, zodra het oppervlak van dit tabblad bekend is). */
export function weergaveRuimte(ruimte: MenuRuimte): void {
  if (ruimte === weergaveRuimteNu()) return;
  zetWeergaveRuimte(ruimte);
  if (ruimte === 'technisch') void technischOphalen();
}

/** De technische stand staat NIET in de bootstrap: die vraagt een lopend technisch profiel in dit tabblad. */
let techBezig = false;
async function technischOphalen(): Promise<void> {
  if (!server || techBezig || typeof window === 'undefined') return;
  const ctx = server, account = weergaveAccountNu();
  techBezig = true;
  try {
    const r = await api.post('/api/owner/ui/weergave', { service: ctx.service, tabContext: ecosystemTabContext(), sourceOrigin: location.origin, ruimte: 'technisch' });
    if (weergaveAccountNu() !== account) return; // ander account tijdens het wachten: dit antwoord is niet van hem
    if (wachtenden.has(`${account}|technisch`)) return; // er wacht al een eigen wijziging: die mag dit antwoord niet overschrijven
    const v = schoon((r.data as { weergave?: unknown }).weergave);
    laatsteServer.technisch = vorm(v);
    toepassen('technisch', v, account);
  } catch { /* geen technisch profiel of offline: de lokale stand blijft gelden */ }
  finally { techBezig = false; }
}

function naarServer(ctx: NonNullable<Server>, account: string, ruimte: MenuRuimte) {
  if (typeof window === 'undefined') return;
  const sl = `${account}|${ruimte}`;
  window.clearTimeout(wachtenden.get(sl));
  wachtenden.set(sl, window.setTimeout(() => {
    wachtenden.delete(sl);
    if (!server || weergaveAccountNu() !== account) return; // ander account: NOOIT namens hem schrijven
    const weergave = voorServer(ruimte, account);
    void api.post('/api/owner/ui/weergave/save', { service: ctx.service, tabContext: ecosystemTabContext(), sourceOrigin: location.origin, ruimte, weergave })
      .then((resp) => { laatsteServer[ruimte] = vorm(schoon((resp.data as { weergave?: unknown }).weergave)); })
      .catch(() => undefined); // offline, uitgelogd of geen technisch profiel meer: lokaal blijft het gelden, een volgende wijziging probeert opnieuw
  }, 350));
}

/** Elke lokale wijziging van het uiterlijk van DIT tabblad gebundeld naar de server (alleen met een goedgekeurde sessie). */
function start() {
  if (gestart) return;
  gestart = true;
  abonneerWeergave(() => {
    if (!server) return;
    const account = weergaveAccountNu(), ruimte = weergaveRuimteNu(), eigen = voorServer(ruimte, account), nu = vorm(eigen);
    if (nu === laatsteServer[ruimte]) return; // dit is precies wat de server al heeft (of net gaf): niets te doen
    if (!laatsteServer[ruimte] && uiterlijkLeeg(eigen)) return; // nog niets gekozen en nog niets van de server: niets te melden
    naarServer(server, account, ruimte);
  });
}

/** Alleen voor tests. */
export function __weergaveReset() { wachtendenAf(); server = null; laatsteServer = { gebruiker: '', technisch: '' }; techBezig = false; }
