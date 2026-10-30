// Technische browserhulpmiddelen (20.10.2026) — de ZES voorwaarden waaronder een AI in de TECHNISCHE ruimte de browser van de
// eigenaar mag lezen of bedienen, als één pure beslissing. Server (backend/browser-technisch.ts), extensie (extension/shared.js →
// debuggerToegestaan, profielToegestaan) en de test lopen dezelfde regels na; deze module is de bovenste laag: ze beslist of er
// überhaupt een opdracht naar het technische slot gestuurd mag worden.
//
// Waarom hij er is: tot nu bestonden de browserhulpmiddelen alleen in de privéruimte (alle namen eindigden op `_gebruiker`). Een
// technische AI kon daardoor geen enkele administratieve pagina lezen en ook de debugger niet gebruiken, waarvoor het pakket
// «diagnose» juist bestaat. De grenzen worden hier NIET losser: elke voorwaarde blijft staan, maar de weigering zegt nu precies
// wat ontbreekt en wat de eigenaar moet doen — nooit een kaal «403».
//
// De zes voorwaarden (in deze volgorde; de eerste die faalt bepaalt de weigering):
//   1. RUIMTE   — de aanroep loopt in de technische ruimte van de connector (naam op `_beheer`);
//   2. SLOT     — dit account heeft een browserextensie gekoppeld in het slot 'technisch';
//   3. VERGRENDELD — dat slot heeft NU een lopende, ondertekende ontgrendeling (en het beleid van de gebruiker laat het slot toe);
//   4. CAP      — de ontgrendeling (∩ beleid) geeft de mogelijkheid die dit opdrachttype nodig heeft;
//   5. HOST     — elk adres in de opdracht staat in ADMIN_HOSTS_TOEGESTAAN ∩ de domeinen van de ontgrendeling;
//   6. PROFIEL  — het tabblad staat echt in de technische modus (<meta name="mjn-profiel" content="technisch">).
// Daarbovenop, alleen voor diepe diagnose: DEBUGGER — Chrome heeft het recht `debugger` (pakket «diagnose»).
// Puur (geen React/DOM/Node): server, site en tests gebruiken dezelfde functie.
import { ruimteOf, type AiRuimte } from './ai-ruimte';
import { BROWSER_BEHEER_PAD_EN } from './extensie-matrix';
import {
  ADMIN_HOSTS_TOEGESTAAN, DIAG_CAP, DIAG_PAKKET, DIAG_RUIMTE,
  type BrowserCap, type DiagRechtStand,
} from './extensie-ontgrendeling';

/** Profiel van een tabblad zoals de extensie het meldt; null/undefined = de server weet het (nog) niet. */
export type TabProfiel = 'gebruiker' | 'technisch';

export const TECHNISCHE_BROWSER_CODES = ['RUIMTE', 'SLOT', 'VERGRENDELD', 'CAP', 'HOST', 'PROFIEL', 'DEBUGGER'] as const;
export type TechnischeBrowserCode = typeof TECHNISCHE_BROWSER_CODES[number];

export type TechnischeBrowserInvoer = {
  /** Ruimte van DEZE connectoraanroep (shared/ai-ruimte.ts). */
  ruimte: AiRuimte;
  /** Is er een browseragent gekoppeld in het slot 'technisch'? */
  slot: boolean;
  /** Lopende ondertekende ontgrendeling van dat slot, al door het beleid gekapt; null = vergrendeld of beleid uit. */
  ontgrendeling: { ruimte: AiRuimte; caps: readonly BrowserCap[]; domeinen: readonly string[] } | null;
  /** false = de eigenaar of een beheerder zette het technische slot uit (app.extensie_beleid.technisch_aan). */
  beleidAan: boolean;
  /** Opdrachttype van de extensie, bv. 'browser.snapshot' of 'browser.deep_diagnostics'. */
  type: string;
  /** Mogelijkheid die dit type nodig heeft (backend/ai-toestemmingen.ts TYPE_CAPABILITY); null = onbekend type. */
  cap: BrowserCap | null;
  /** Adressen die in de opdracht staan (backend/ai-toestemmingen.ts commandUrls). Leeg = de opdracht werkt op het actieve tabblad. */
  urls?: readonly string[];
  /** Laatst gemelde profiel van het actieve tabblad; null/undefined = onbekend (dan beslist de extensie zelf opnieuw). */
  tabProfiel?: TabProfiel | null;
  /** Laatst gemelde stand van het Chrome-recht `debugger`; null/undefined = onbekend. */
  diagRecht?: DiagRechtStand | null;
};

export type TechnischeBrowserUitslag =
  | { ok: true; cap: BrowserCap }
  | { ok: false; code: TechnischeBrowserCode; fout: string };

/** Stappen voor de eigenaar om het pakket «diagnose» te installeren (tweetalig, voor de site). */
export const DIAG_STAPPEN: Readonly<Record<'uk' | 'nl', readonly string[]>> = Object.freeze({
  uk: Object.freeze([
    `Завантажте пакет «діагностика»: /downloads/${DIAG_PAKKET}`,
    'Розпакуйте архів у власну теку (не в теку наявного розширення).',
    'chrome://extensions → увімкніть «Режим розробника» → «Завантажити розпаковане» → виберіть цю теку.',
    'У налаштуваннях розширення увімкніть «Глибока діагностика» (вона лишається вимкненою доти).',
    'Активуйте технічний профіль у вкладці й розблокуйте технічний слот своїм passkey.',
  ]),
  nl: Object.freeze([
    `Download het pakket «diagnose»: /downloads/${DIAG_PAKKET}`,
    'Pak het archief uit in een eigen map (niet in de map van de bestaande extensie).',
    'chrome://extensions → «Ontwikkelaarsmodus» aan → «Uitgepakte extensie laden» → kies die map.',
    'Zet in de opties van de extensie «Diepe diagnose» aan (die blijft tot dan uit).',
    'Activeer het technische profiel in het tabblad en ontgrendel het technische slot met uw passkey.',
  ]),
});

// 0.8.0: `debugger` staat vast in het manifest van het gewone pakket; het diagnosepakket is gelijk. Stappen = bijwerken naar ≥ 0.8.0.
const STAPPEN_EN = [
  `download /downloads/mijn-ruimte-extension.zip (extension 0.8.0 or newer; ${DIAG_PAKKET} is identical)`,
  'unpack it into the SAME permanent folder the extension is loaded from (never a temporary, network or removable drive)',
  'chrome://extensions → click ↻ on «Mijn Ruimte» (approve the new permission if Chrome asks)',
  'switch "deep diagnostics" on in the extension options',
  'activate the technical profile in the tab and unlock the technical slot with the passkey',
];

const HOE_ONTGRENDELEN = 'The owner activates the technical profile in that tab (admin.tarasevych.com → «Технічний профіль») and then unlocks the '
  + `technical slot of the extension with their own passkey at ${BROWSER_BEHEER_PAD_EN} → «Technical slot» → «Open access» (Browser extension → Technical profile).`;

/** Hostnaam van een adres, of '' als het geen geldige https-URL is. */
export function hostVanAdres(u: string): string {
  try { return new URL(String(u)).hostname.toLowerCase(); } catch { return ''; }
}

/**
 * Mag deze browseropdracht naar het TECHNISCHE slot? Eén weigering per oorzaak, met de oorzaak in de tekst (de AI leest hem en
 * vertelt de eigenaar wat te doen). Nooit «403»: elke tekst noemt wat ontbreekt en welke stap dat oplost.
 */
export function technischeBrowserPoort(inv: TechnischeBrowserInvoer): TechnischeBrowserUitslag {
  const type = String(inv.type || '');
  const diep = type === 'browser.deep_diagnostics';

  // 1. ruimte van de connector
  if (ruimteOf(inv.ruimte) !== 'technisch') {
    return { ok: false, code: 'RUIMTE', fout: 'EXTENSIE_RUIMTE: this tool acts on the TECHNICAL slot of the Mijn Ruimte extension, but this connection lives in the '
      + 'user\'s private space. A user-space AI never reads or controls a technical tab. The owner connects a separate AI in the technical space '
      + '(mcp.tarasevych.com → Technical connections, with the technical profile active) and grants the browser tools there. Do not try another way.' };
  }

  // 2. gekoppeld slot
  if (!inv.slot) {
    return { ok: false, code: 'SLOT', fout: 'EXTENSIE_SLOT: no Mijn Ruimte browser extension is connected in the TECHNICAL slot for this account. '
      + 'This technical connection never uses the user\'s own (private) browser slot. The owner connects the technical slot on '
      + `${BROWSER_BEHEER_PAD_EN} → «Technical slot» (Browser extension → Technical profile: a separate pairing code, a separate unlock). Do not try another way.` };
  }

  // 3. lopende ondertekende ontgrendeling van dit slot (beleid eerst: dat is een andere oorzaak dan «nog niet ontgrendeld»)
  if (!inv.beleidAan) {
    return { ok: false, code: 'VERGRENDELD', fout: 'EXTENSIE_VERGRENDELD: the owner or an administrator switched the TECHNICAL browser slot off for this account '
      + `(extension policy: «technisch aan» = off). Nothing is sent to the extension until that is switched back on (${BROWSER_BEHEER_PAD_EN} → «All users»; Browser extension policy). Tell the user; do not retry.` };
  }
  const g = inv.ontgrendeling;
  if (!g || ruimteOf(g.ruimte) !== 'technisch') {
    return { ok: false, code: 'VERGRENDELD', fout: `EXTENSIE_VERGRENDELD: the TECHNICAL slot of the Mijn Ruimte extension has no active signed unlock${g ? ' (the only active unlock belongs to the private slot)' : ''}. `
      + `${HOE_ONTGRENDELEN} The owner chooses the term there (15 min … 1 year, until the browser closes, until logout, until revoked); a term longer than the activation survives it, but every technical tool still needs an active technical profile in the tab. Tell the user; do not retry.` };
  }

  // 4. mogelijkheid in de ontgrendeling (= rollen ∩ beleid)
  const cap = inv.cap;
  if (!cap) {
    return { ok: false, code: 'CAP', fout: `EXTENSIE_TYPE: "${type.slice(0, 60)}" is not a browser command the extension knows. Use tools/list; do not retry.` };
  }
  if (!g.caps.includes(cap)) {
    return { ok: false, code: 'CAP', fout: `EXTENSIE_CAP: the current unlock of the technical slot does not include "${cap}" (it allows: ${[...g.caps].join(', ') || 'nothing'}). `
      + `The owner's technical roles and the extension policy decide this${cap === DIAG_CAP ? ' — "browser.debug" exists only for the roles ontwikkelaar, beheerder and eigenaar' : ''}. `
      + `The owner ticks the row «${cap}» for this agent at ${BROWSER_BEHEER_PAD_EN} (slot «technisch»; a running unlock is re-signed at once) or unlocks again with the missing capability (Browser extension → Technical profile). Tell the user this exact place; do not retry.` };
  }

  // 5. host: ADMIN_HOSTS_TOEGESTAAN ∩ domeinen van de ontgrendeling
  const toegestaan = ADMIN_HOSTS_TOEGESTAAN.filter((h) => g.domeinen.includes(h));
  for (const u of inv.urls ?? []) {
    const h = hostVanAdres(u);
    if (!h || !toegestaan.includes(h)) {
      return { ok: false, code: 'HOST', fout: `EXTENSIE_HOST: "${h || String(u).slice(0, 60)}" is outside this unlock. The technical slot works only on ${toegestaan.join(', ') || '(no host at all: the unlock has no allowed host left)'}`
        + ` — the intersection of the hosts the owner chose and the administrative hosts of the own site (${ADMIN_HOSTS_TOEGESTAAN.join(', ')}). `
        + 'Ask the user to include that host when they unlock; do not retry with another address.' };
    }
  }
  if (!toegestaan.length) {
    return { ok: false, code: 'HOST', fout: 'EXTENSIE_HOST: the unlock of the technical slot has no host that is also an administrative host of the own site. '
      + `Ask the user to unlock again and pick at least one of ${ADMIN_HOSTS_TOEGESTAAN.join(', ')}; do not retry.` };
  }

  // 6. profiel van het tabblad (de extensie controleert het nog een keer vlak voor de uitvoering)
  if (inv.tabProfiel === 'gebruiker') {
    return { ok: false, code: 'PROFIEL', fout: 'EXTENSIE_PROFIEL: the active tab is NOT in technical mode, so the technical slot may not touch it (a technical command never runs '
      + 'in a user tab, just as a user-space AI never reads a technical tab). The owner activates the technical profile in that tab '
      + `(the «Технічний профіль» bar, or admin.tarasevych.com/?tech=activeren) and then this works; the state of both slots is shown at ${BROWSER_BEHEER_PAD_EN}. Tell the user; do not retry.` };
  }

  // Diepe diagnose: zonder het Chrome-recht is er geen debugger — en Chrome staat `debugger` niet toe als optioneel recht.
  if (diep && inv.diagRecht && inv.diagRecht !== 'ja') {
    const waarom = inv.diagRecht === 'geweigerd' ? 'the user declined the Chrome permission'
      : inv.diagRecht === 'ingetrokken' ? 'the Chrome permission was removed again'
        : inv.diagRecht === 'niet-aanvraagbaar' ? 'the installed extension is older than 0.8.0 and has no «debugger» permission in its manifest (Chrome refuses it as an optional permission)'
          : 'this extension build has no «debugger» permission in its manifest';
    return { ok: false, code: 'DEBUGGER', fout: `EXTENSIE_DEBUGGER: deep diagnostics needs the Chrome "debugger" permission and ${waarom}. `
      + `Update the extension: ${STAPPEN_EN.map((s, i) => `${i + 1}) ${s}`).join('; ')}. `
      + 'Tell the user these steps; do not retry until they confirm the package is installed.' };
  }
  if (diep && ruimteOf(g.ruimte) !== DIAG_RUIMTE) {
    return { ok: false, code: 'DEBUGGER', fout: `EXTENSIE_DEBUGGER: the Chrome debugger is only available to the slot "${DIAG_RUIMTE}". Do not retry.` };
  }

  return { ok: true, cap };
}

/**
 * Een foutmelding van de extensie zelf (background.js DEBUG_WEIGER / PROFIEL_FOUT) omzetten in dezelfde, uitlegbare weigering.
 * De extensie weigert als laatste schakel; haar tekst is kort en kent de stappen niet. null = niets te verduidelijken.
 */
export function verduidelijkExtensieFout(type: string, fout: unknown): { code: TechnischeBrowserCode; fout: string } | null {
  const t = String(fout || '');
  if (/debugger" permission|diagnostics package|optional permission/i.test(t)) {
    return { code: 'DEBUGGER', fout: `EXTENSIE_DEBUGGER: the extension refused: ${t.slice(0, 200)}. `
      + `Update the extension: ${STAPPEN_EN.map((s, i) => `${i + 1}) ${s}`).join('; ')}. Tell the user these steps; do not retry.` };
  }
  if (/another debugger is already attached/i.test(t)) {
    return { code: 'DEBUGGER', fout: 'EXTENSIE_DEBUGGER_CONFLICT: Chrome DevTools or another debugger is already attached to this tab. The owner closes DevTools for that tab; then retry once. Tell the user.' };
  }
  if (/deep diagnostics is off/i.test(t)) {
    return { code: 'DEBUGGER', fout: 'EXTENSIE_DEBUGGER: deep diagnostics is switched off in the extension options. The owner switches it on in the '
      + 'extension (pop-up, side panel or options). Tell the user; do not retry.' };
  }
  if (/^EXTENSIE_PROFIEL|technical mode|not in technical mode/i.test(t)) {
    return { code: 'PROFIEL', fout: 'EXTENSIE_PROFIEL: the tab is not in technical mode (any more). The owner activates the technical profile in that tab '
      + '(the «Технічний профіль» bar) and then this works. Tell the user; do not retry.' };
  }
  if (/only allowed on the administrative hosts|not on an unlocked tarasevych/i.test(t)) {
    return { code: 'HOST', fout: `EXTENSIE_HOST: the extension refused the address: ${t.slice(0, 160)}. The technical slot works only on the administrative hosts the owner unlocked `
      + `(${ADMIN_HOSTS_TOEGESTAAN.join(', ')}). Do not retry with another address.` };
  }
  void type;
  return null;
}
