// Kern van het door de eigenaar ondertekende AI-beleid (wie mag wat, met timers). Gedeeld door root (goedkeur-hulp.mjs: controleert
// handtekeningen en schrijft de keten) en de app (backend/ai-beleid.ts: leest de keten en beslist per aanroep). Geen afhankelijkheden,
// alleen node:crypto. De volledige inhoudelijke controle (bekende mogelijkheden, timers) staat in shared/ai-beleid/model.ts.
//
// Formaat (compatibel met scripts/ceremony.ts van het pakket mijn-ruimte-access-control, zodat het eerste, offline met de
// herstelsleutel ondertekende beleid «genesis.signed.json» rechtstreeks kan worden geïnstalleerd):
//   beleid = { v:1, seq, prevHash, issuedAt, ownerKeys:[{id,type,publicKey,label,addedAt,credentialId?}], approvalSignature, agents:{…} }
//   hash   = sha256 hex van de canonieke JSON (sleutels gesorteerd)
//   Ed25519-handtekening (herstelsleutel) over sha256("MR-ACCESS/policy/v1\n" + canonieke JSON)
//   Passkey (WebAuthn) over uitdagingVoor("ai-beleid", { beleidHash, nonce, verloopt }) uit webauthn-kern.mjs
// Keten: versie n+1 heeft seq = n.seq + 1 en prevHash = hash(versie n); niets kan ertussen of eruit zonder dat het opvalt.
import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";

export const BELEID_VERSIE = 1;
export const ED25519_DOMEIN = "MR-ACCESS/policy/v1";
export const MAX_BELEID_BYTES = 256 * 1024;

/** Deterministische JSON: sleutels gesorteerd; undefined, NaN en oneindig zijn verboden. Gelijk aan canonicalize() in het pakket. */
export function canoniek(waarde) {
  if (waarde === null) return "null";
  switch (typeof waarde) {
    case "string": return JSON.stringify(waarde);
    case "boolean": return waarde ? "true" : "false";
    case "number":
      if (!Number.isFinite(waarde)) throw new Error("CANONIEK_GETAL");
      return Object.is(waarde, -0) ? "0" : JSON.stringify(waarde);
    case "object": {
      if (Array.isArray(waarde)) return `[${waarde.map((v) => canoniek(v)).join(",")}]`;
      const delen = [];
      for (const k of Object.keys(waarde).sort()) {
        if (waarde[k] === undefined) throw new Error("CANONIEK_ONGEDEFINIEERD");
        delen.push(`${JSON.stringify(k)}:${canoniek(waarde[k])}`);
      }
      return `{${delen.join(",")}}`;
    }
    default: throw new Error("CANONIEK_TYPE");
  }
}
const sha256 = (data) => createHash("sha256").update(data).digest();
export const beleidHash = (beleid) => sha256(Buffer.from(canoniek(beleid), "utf8")).toString("hex");
/** De 32 bytes die de herstelsleutel (Ed25519) ondertekent. */
export const ed25519Bericht = (beleid) => sha256(Buffer.from(`${ED25519_DOMEIN}\n${canoniek(beleid)}`, "utf8"));

const vanB64u = (s) => { if (typeof s !== "string" || !/^[A-Za-z0-9_-]+$/.test(s)) throw new Error("B64U"); return Buffer.from(s, "base64url"); };
/** Vingerafdruk van een publieke sleutel (SPKI-DER, base64url): sha256 hex — gelijk aan keyFingerprint() van de ceremonie. */
export const sleutelVingerafdruk = (spkiB64u) => sha256(vanB64u(spkiB64u)).toString("hex");

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const MOGELIJKHEID = /^[a-z]+\.[a-z]+$/;
function modusFout(m) {
  if (!m || typeof m !== "object") return "MODUS_ONTBREEKT";
  switch (m.kind) {
    case "off": case "ask": case "always": return null;
    case "timed":
      if (!Number.isFinite(m.startedAt) || !Number.isFinite(m.expiresAt) || m.expiresAt <= m.startedAt) return "MODUS_TIJD";
      if (m.after !== "off" && m.after !== "ask") return "MODUS_NA";
      if (typeof m.label !== "string" || m.label.length > 80) return "MODUS_LABEL";
      return null;
    default: return "MODUS_ONBEKEND";
  }
}
/**
 * Structuur van één beleid (root vertrouwt niets wat de app aanlevert). Geeft null of een foutcode.
 * `policy.change` mag nooit aan een agent gegeven worden.
 */
export function beleidFout(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return "BELEID_ONGELDIG";
  let tekst;
  try { tekst = canoniek(b); } catch { return "BELEID_ONGELDIG"; }
  if (Buffer.byteLength(tekst) > MAX_BELEID_BYTES) return "BELEID_TE_GROOT";
  if (b.v !== BELEID_VERSIE) return "BELEID_VERSIE";
  if (!Number.isSafeInteger(b.seq) || b.seq < 0) return "BELEID_SEQ";
  if (!(b.prevHash === null || (typeof b.prevHash === "string" && /^[0-9a-f]{64}$/.test(b.prevHash)))) return "BELEID_PREV";
  if ((b.seq === 0) !== (b.prevHash === null)) return "BELEID_PREV";
  if (!Number.isSafeInteger(b.issuedAt)) return "BELEID_TIJD";
  if (!["never", "risky", "all"].includes(b.approvalSignature)) return "BELEID_GOEDKEURING";
  if (!Array.isArray(b.ownerKeys) || b.ownerKeys.length < 1 || b.ownerKeys.length > 16) return "BELEID_SLEUTELS";
  const ids = new Set();
  for (const k of b.ownerKeys) {
    if (!k || typeof k.id !== "string" || !ID.test(k.id) || ids.has(k.id)) return "BELEID_SLEUTELS";
    ids.add(k.id);
    if (k.type !== "ed25519" && k.type !== "webauthn") return "BELEID_SLEUTELS";
    if (typeof k.publicKey !== "string" || k.publicKey.length < 20 || k.publicKey.length > 2048) return "BELEID_SLEUTELS";
    if (typeof k.label !== "string" || k.label.length > 80 || !Number.isFinite(k.addedAt)) return "BELEID_SLEUTELS";
  }
  if (!b.agents || typeof b.agents !== "object" || Array.isArray(b.agents) || Object.keys(b.agents).length > 64) return "BELEID_AGENTEN";
  for (const [id, a] of Object.entries(b.agents)) {
    if (!ID.test(id) || !a || typeof a !== "object") return "BELEID_AGENTEN";
    if (typeof a.name !== "string" || !a.name || a.name.length > 80 || typeof a.enabled !== "boolean") return "BELEID_AGENTEN";
    const f = modusFout(a.defaultMode); if (f) return f;
    if (!a.capabilities || typeof a.capabilities !== "object" || Array.isArray(a.capabilities) || Object.keys(a.capabilities).length > 64) return "BELEID_AGENTEN";
    for (const [cap, m] of Object.entries(a.capabilities)) {
      if (!MOGELIJKHEID.test(cap)) return "BELEID_MOGELIJKHEID";
      if (cap === "policy.change") return "BELEID_EIGENAAR_ALLEEN";
      const g = modusFout(m); if (g) return g;
    }
  }
  return null;
}

/** Ed25519-handtekening van een herstelsleutel uit `sleutels` (de ownerKeys van de vorige versie, of van het beleid zelf bij seq 0). */
export function controleerEd25519(beleid, handtekening, sleutels) {
  const h = handtekening || {};
  const sleutel = (Array.isArray(sleutels) ? sleutels : []).find((k) => k && k.type === "ed25519" && k.id === h.keyId);
  if (!sleutel) return { ok: false, code: "SLEUTEL_ONBEKEND" };
  try {
    const pub = createPublicKey({ key: vanB64u(sleutel.publicKey), format: "der", type: "spki" });
    if (pub.asymmetricKeyType !== "ed25519") return { ok: false, code: "SLEUTEL_ONGELDIG" };
    const ok = cryptoVerify(null, ed25519Bericht(beleid), pub, vanB64u(h.signature));
    return ok ? { ok: true, keyId: sleutel.id, vingerafdruk: sleutelVingerafdruk(sleutel.publicKey) } : { ok: false, code: "HANDTEKENING_ONGELDIG" };
  } catch { return { ok: false, code: "HANDTEKENING_ONGELDIG" }; }
}

/**
 * Samenhang van een keten (zonder handtekeningen: die controleerde root bij het schrijven). Geeft { ok, laatste } of { ok:false, code, index }.
 * Elke versie: geldige structuur, seq = index, prevHash = hash van de vorige, issuedAt niet terug in de tijd.
 */
export function ketenFout(versies) {
  if (!Array.isArray(versies) || versies.length === 0) return { ok: false, code: "KETEN_LEEG", index: 0 };
  let vorige = null;
  for (let i = 0; i < versies.length; i++) {
    const b = versies[i] && versies[i].beleid;
    const f = beleidFout(b);
    if (f) return { ok: false, code: f, index: i };
    if (b.seq !== i) return { ok: false, code: "KETEN_SEQ", index: i };
    if (i === 0 ? b.prevHash !== null : b.prevHash !== beleidHash(vorige)) return { ok: false, code: "KETEN_GEBROKEN", index: i };
    if (vorige && b.issuedAt < vorige.issuedAt) return { ok: false, code: "KETEN_TIJD", index: i };
    if (typeof versies[i].hash === "string" && versies[i].hash !== beleidHash(b)) return { ok: false, code: "KETEN_HASH", index: i };
    vorige = b;
  }
  return { ok: true, laatste: vorige, hash: beleidHash(vorige) };
}

/** Past een nieuwe versie op de laatste? (volgnummer, prevHash, tijd ±; root controleert daarna de handtekening) */
export function volgendeFout(laatste, nieuw, nu = Date.now()) {
  const f = beleidFout(nieuw);
  if (f) return f;
  if (nieuw.seq !== laatste.seq + 1) return "VERSIE_VERSCHILT";
  if (nieuw.prevHash !== beleidHash(laatste)) return "VERSIE_VERSCHILT";
  if (nieuw.issuedAt < laatste.issuedAt) return "KETEN_TIJD";
  if (nieuw.issuedAt > nu + 5 * 60_000 || nieuw.issuedAt < nu - 15 * 60_000) return "ONTWERP_VERLOPEN";
  return null;
}
