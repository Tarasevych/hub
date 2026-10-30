// Kern van «een besluit van de eigenaar met passkey-handtekening» (Mijn Ruimte, 22.10.2026; RUNBOOK-VEILIGE-UITROL.md §15).
//
// Eén bestand, alleen ingebouwde Node-modules, gebruikt door TWEE kanten die elkaar niet vertrouwen:
//   - de app (backend/eigenaar-besluit.ts): de inhoud normaliseren en de hash uitrekenen waar de passkey over tekent;
//   - root (/usr/local/lib/mijn-ruimte/goedkeuring/goedkeur-hulp.mjs verifieer-besluit): PRECIES dezelfde normalisatie en hash
//     opnieuw uitrekenen uit het bestand dat de app neerlegde, en pas dan de assertie controleren (webauthn-kern.mjs).
// Zo kan een gecompromitteerde app na het tekenen niets meer aan de inhoud veranderen: elke byte anders = andere hash =
// challenge past niet (UITDAGING_ONJUIST).
//
// Soorten besluiten (BESLUIT_SOORTEN):
//   terugdraaien   { van: <release>, naar: <release> }  — de site terugzetten van release `van` naar release `naar`
//                  (root voert `mijn-ruimte-installeer terugdraaien <naar>` uit; migraties worden NIET teruggedraaid)
//   externe-hosts  { hosts: [<host>…] }                 — de witte lijst `externeMcpHosts` in /etc/mijn-ruimte/mcp-rechten.json
//                  (root schrijft het bestand atomisch, met reservekopie en syntaxiscontrole)
import { createHash } from "node:crypto";

export const BESLUIT_VERSIE = 1;
export const BESLUIT_SOORTEN = Object.freeze(["terugdraaien", "externe-hosts"]);
/** Zoveel minuten mag een ondertekend besluit onderweg zijn; daarna is de challenge sowieso verlopen (webauthn-kern: 5 min). */
export const BESLUIT_MAX_HOSTS = 50;
const RELEASE = /^[0-9]{8}-[0-9]{6}$/;
const HOST = /^\*?\.?[a-z0-9.-]+$/;
const ID = /^[0-9a-f]{32}$/;

export const isBesluitSoort = (s) => BESLUIT_SOORTEN.includes(String(s || ""));
export const isBesluitId = (s) => ID.test(String(s || ""));

/** Eén hostregel zoals shared/mcp-klant-model.ts schoonHostLijst hem accepteert: hostnaam of `*.achtervoegsel`, nooit `*`. */
export function hostRegelOk(regel) {
  const r = String(regel ?? "").trim().toLowerCase();
  return !!r && r !== "*" && r !== "*." && r.length <= 300 && HOST.test(r) && !r.includes("..") && !/^[.-]/.test(r.replace(/^\*\./, ""));
}

/**
 * Inhoud van een besluit normaliseren (en valideren). Geeft een nieuw object met ALLEEN de velden die tellen, in vaste vorm.
 * Gooit Error("INHOUD_ONGELDIG") bij alles wat niet klopt. Idempotent: normaliseer(normaliseer(x)) === normaliseer(x).
 */
export function normaliseerInhoud(soort, inhoud) {
  const i = inhoud && typeof inhoud === "object" && !Array.isArray(inhoud) ? inhoud : null;
  if (!isBesluitSoort(soort) || !i) throw new Error("INHOUD_ONGELDIG");
  if (soort === "terugdraaien") {
    const van = String(i.van ?? "").trim(), naar = String(i.naar ?? "").trim();
    if (!RELEASE.test(van) || !RELEASE.test(naar) || van === naar) throw new Error("INHOUD_ONGELDIG");
    return { van, naar };
  }
  const bron = Array.isArray(i.hosts) ? i.hosts : null;
  if (!bron || bron.length > BESLUIT_MAX_HOSTS) throw new Error("INHOUD_ONGELDIG");
  const hosts = [];
  for (const h of bron) {
    const r = String(h ?? "").trim().toLowerCase();
    if (!hostRegelOk(r)) throw new Error("INHOUD_ONGELDIG");
    if (!hosts.includes(r)) hosts.push(r);
  }
  return { hosts };
}

/** Canonieke tekst (vaste sleutelvolgorde, geen witruimte) — hierover gaat de hash. */
export function canoniekeTekst(soort, inhoud) {
  const n = normaliseerInhoud(soort, inhoud);
  const body = soort === "terugdraaien" ? `{"naar":${JSON.stringify(n.naar)},"van":${JSON.stringify(n.van)}}` : `{"hosts":${JSON.stringify(n.hosts)}}`;
  return `mijn-ruimte-besluit/v${BESLUIT_VERSIE}\n${soort}\n${body}`;
}

/** sha256 (hex) van de canonieke tekst: dit is `besluitHash` in de WebAuthn-challenge (webauthn-kern uitdagingVoor('eigenaar-besluit')). */
export function besluitHash(soort, inhoud) {
  return createHash("sha256").update(canoniekeTekst(soort, inhoud), "utf8").digest("hex");
}

/**
 * De schakelaars in mcp-rechten.json voor dit kanaal (drie standen, zie RUNBOOK §15):
 *   terugdraaien:  "opdracht.terugdraaien": true → de oude directe knop werkt ook; ontbreekt/false → alleen via een passkey-besluit;
 *                  "terugdraaien-passkey": false → ook het passkey-besluit is dicht (BESLUIT_UIT).
 *   externe-hosts: "externe-hosts-passkey": false → dicht; anders open (de lijst zelf staat in "externeMcpHosts").
 * Ontbreekt de sleutel, dan is het passkey-kanaal OPEN: een passkey-handtekening van de eigenaar is de poort, niet een SSH-sessie.
 */
export function besluitKanaalOpen(soort, rechten) {
  const d = rechten && typeof rechten === "object" ? rechten : {};
  if (soort === "terugdraaien") return d["terugdraaien-passkey"] !== false;
  if (soort === "externe-hosts") return d["externe-hosts-passkey"] !== false;
  return false;
}
