// WebAuthn-kern voor de goedkeuring van updates met een passkey (Mijn Ruimte).
//
// Eén bestand, alleen ingebouwde Node-modules (node:crypto). Gebruikt door:
//   - de app (backend/uitrol-goedkeuring.ts): registratie lezen en een assertie vooraf controleren;
//   - root (/usr/local/lib/mijn-ruimte/goedkeuring/goedkeur-hulp.mjs): de assertie ONAFHANKELIJK opnieuw controleren
//     tegen de publieke sleutels in /etc/mijn-ruimte/goedkeur-passkeys.json, vlak vóór het installeren.
// Waarom zelf en niet @simplewebauthn/server: die zit niet in node_modules en root mag geen code uit node_modules van een
// release uitvoeren (die map is tijdens `npm ci` schrijfbaar voor mijnruimte). Wat hier nodig is, is klein en goed
// gespecificeerd (W3C WebAuthn L2 §7.1 en §7.2): CBOR (alleen de typen die in authData/COSE voorkomen), authData lezen,
// COSE → JWK (ES256, EdDSA, RS256) en crypto.verify. Attestation wordt bewust NIET gecontroleerd ("none"): het vertrouwen in een
// nieuwe sleutel komt van een tweede kanaal (SSH-bevestiging van de vingerafdruk of een assertie van een al bekende sleutel).
import { createHash, createPublicKey, timingSafeEqual, verify as cryptoVerify } from "node:crypto";

export const KERN_VERSIE = 1;
export const UITDAGING_MAX_MS = 5 * 60 * 1000;   // challenge hooguit 5 minuten geldig
export const KLOK_SPELING_MS = 60 * 1000;          // speling tussen app- en rootklok
export const ALGORITMEN = Object.freeze({ ES256: -7, EdDSA: -8, RS256: -257 });
const TOEGESTANE_ALG = new Set([-7, -8, -257]);
const DOELEN = new Set(["goedkeuren", "sleutel-toevoegen", "sleutel-verwijderen"]);
const B64U = /^[A-Za-z0-9_-]+$/;

export const b64u = (buf) => Buffer.from(buf).toString("base64url");
export function vanB64u(s, max = 1 << 20) {
  if (typeof s !== "string" || !s.length || s.length > max || !B64U.test(s)) throw new Error("B64U_ONGELDIG");
  return Buffer.from(s, "base64url");
}
const sha256 = (buf) => createHash("sha256").update(buf).digest();
const zelfde = (a, b) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && x.length > 0 && timingSafeEqual(x, y); };

// ------------------------------------------------------------------------------------------------ CBOR (RFC 8949, subset)
/** Decodeert één CBOR-item vanaf `pos`. Ondersteunt: uint, negint, bytes, tekst, array, map, false/true/null. Geen tags, floats of onbepaalde lengtes. */
export function cborLees(buf, pos = 0, diepte = 0) {
  if (diepte > 8) throw new Error("CBOR_TE_DIEP");
  if (pos >= buf.length) throw new Error("CBOR_EINDE");
  const eerste = buf[pos++];
  const major = eerste >> 5; const info = eerste & 0x1f;
  let lengte;
  if (info < 24) lengte = info;
  else if (info === 24) { if (pos + 1 > buf.length) throw new Error("CBOR_EINDE"); lengte = buf[pos]; pos += 1; }
  else if (info === 25) { if (pos + 2 > buf.length) throw new Error("CBOR_EINDE"); lengte = buf.readUInt16BE(pos); pos += 2; }
  else if (info === 26) { if (pos + 4 > buf.length) throw new Error("CBOR_EINDE"); lengte = buf.readUInt32BE(pos); pos += 4; }
  else if (info === 27) {
    if (pos + 8 > buf.length) throw new Error("CBOR_EINDE");
    const groot = buf.readBigUInt64BE(pos); pos += 8;
    if (groot > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CBOR_TE_GROOT");
    lengte = Number(groot);
  } else throw new Error("CBOR_NIET_ONDERSTEUND");
  switch (major) {
    case 0: return { waarde: lengte, pos };
    case 1: return { waarde: -1 - lengte, pos };
    case 2: case 3: {
      if (lengte > 65536 || pos + lengte > buf.length) throw new Error("CBOR_EINDE");
      const stuk = buf.subarray(pos, pos + lengte);
      return { waarde: major === 2 ? Buffer.from(stuk) : stuk.toString("utf8"), pos: pos + lengte };
    }
    case 4: {
      if (lengte > 64) throw new Error("CBOR_TE_GROOT");
      const uit = [];
      for (let i = 0; i < lengte; i++) { const r = cborLees(buf, pos, diepte + 1); uit.push(r.waarde); pos = r.pos; }
      return { waarde: uit, pos };
    }
    case 5: {
      if (lengte > 64) throw new Error("CBOR_TE_GROOT");
      const uit = new Map();
      for (let i = 0; i < lengte; i++) {
        const k = cborLees(buf, pos, diepte + 1); pos = k.pos;
        if (typeof k.waarde !== "number" && typeof k.waarde !== "string") throw new Error("CBOR_SLEUTEL");
        if (uit.has(k.waarde)) throw new Error("CBOR_DUBBELE_SLEUTEL");
        const v = cborLees(buf, pos, diepte + 1); pos = v.pos;
        uit.set(k.waarde, v.waarde);
      }
      return { waarde: uit, pos };
    }
    case 7: {
      if (info === 20) return { waarde: false, pos };
      if (info === 21) return { waarde: true, pos };
      if (info === 22) return { waarde: null, pos };
      throw new Error("CBOR_NIET_ONDERSTEUND");
    }
    default: throw new Error("CBOR_NIET_ONDERSTEUND");
  }
}

// ------------------------------------------------------------------------------------------------ authData (WebAuthn §6.1)
export const VLAG = Object.freeze({ UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40, ED: 0x80 });
export function leesAuthData(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 37 || buf.length > 4096) throw new Error("AUTHDATA_LENGTE");
  const uit = { rpIdHash: buf.subarray(0, 32), vlaggen: buf[32], signCount: buf.readUInt32BE(33), credentialId: null, cose: null };
  if (uit.vlaggen & VLAG.AT) {
    if (buf.length < 55) throw new Error("AUTHDATA_LENGTE");
    const idLen = buf.readUInt16BE(53);
    if (idLen < 16 || idLen > 1023 || 55 + idLen > buf.length) throw new Error("AUTHDATA_CREDENTIAL");
    uit.credentialId = Buffer.from(buf.subarray(55, 55 + idLen));
    const r = cborLees(buf, 55 + idLen);
    if (!(r.waarde instanceof Map)) throw new Error("AUTHDATA_COSE");
    uit.cose = r.waarde;
    if (r.pos !== buf.length && !(uit.vlaggen & VLAG.ED)) throw new Error("AUTHDATA_RESTBYTES");
  }
  return uit;
}

/** COSE_Key → { alg, jwk }. Alleen ES256 (P-256), EdDSA (Ed25519) en RS256 (≥ 2048 bit). */
export function coseNaarJwk(cose) {
  if (!(cose instanceof Map)) throw new Error("COSE_ONGELDIG");
  const kty = cose.get(1); const alg = cose.get(3);
  if (!TOEGESTANE_ALG.has(alg)) throw new Error("COSE_ALG");
  let jwk;
  if (alg === -7) {
    const crv = cose.get(-1); const x = cose.get(-2); const y = cose.get(-3);
    if (kty !== 2 || crv !== 1 || !Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) throw new Error("COSE_EC2");
    jwk = { kty: "EC", crv: "P-256", x: b64u(x), y: b64u(y) };
  } else if (alg === -8) {
    const crv = cose.get(-1); const x = cose.get(-2);
    if (kty !== 1 || crv !== 6 || !Buffer.isBuffer(x) || x.length !== 32) throw new Error("COSE_OKP");
    jwk = { kty: "OKP", crv: "Ed25519", x: b64u(x) };
  } else {
    const n = cose.get(-1); const e = cose.get(-2);
    if (kty !== 3 || !Buffer.isBuffer(n) || !Buffer.isBuffer(e) || n.length < 256 || n.length > 512 || e.length > 8) throw new Error("COSE_RSA");
    jwk = { kty: "RSA", n: b64u(n), e: b64u(e) };
  }
  sleutelObject({ alg, jwk }); // gooit als de sleutel ongeldig is (bijv. punt niet op de curve)
  return { alg, jwk };
}

/** KeyObject uit een opgeslagen sleutel; controleert dat type en algoritme bij elkaar passen. */
export function sleutelObject(sleutel) {
  const { alg, jwk } = sleutel || {};
  if (!TOEGESTANE_ALG.has(alg) || !jwk || typeof jwk !== "object") throw new Error("SLEUTEL_ONGELDIG");
  const schoon = alg === -7 ? { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y } : alg === -8 ? { kty: "OKP", crv: "Ed25519", x: jwk.x } : { kty: "RSA", n: jwk.n, e: jwk.e };
  if ((alg === -7 && (jwk.kty !== "EC" || jwk.crv !== "P-256")) || (alg === -8 && (jwk.kty !== "OKP" || jwk.crv !== "Ed25519")) || (alg === -257 && jwk.kty !== "RSA")) throw new Error("SLEUTEL_ONGELDIG");
  const obj = createPublicKey({ key: schoon, format: "jwk" });
  if (alg === -257 && (obj.asymmetricKeyDetails?.modulusLength || 0) < 2048) throw new Error("SLEUTEL_TE_ZWAK");
  return obj;
}

/** Vingerafdruk: sha256 (hex) van de SPKI-DER van de publieke sleutel. Zo toont de telefoon hem en zo typt de eigenaar hem via SSH. */
export function vingerafdruk(sleutel) {
  return createHash("sha256").update(sleutelObject(sleutel).export({ type: "spki", format: "der" })).digest("hex");
}
/** Leesbaar: 8 groepen van 4 hex-tekens (de eerste 32 tekens = 128 bit). */
export const vingerafdrukKort = (hex) => String(hex).slice(0, 32).replace(/(.{4})(?=.)/g, "$1 ");

// ------------------------------------------------------------------------------------------------ challenge
/**
 * De challenge is een hash over ALLES wat de eigenaar goedkeurt, met domeinscheiding per doel:
 *   goedkeuren:          voorstel-id, versie, sha256 van het pakket, nonce, verloopt (ms)
 *   sleutel-toevoegen:   vingerafdruk van de nieuwe sleutel, nonce, verloopt
 *   sleutel-verwijderen: vingerafdruk van de te verwijderen sleutel, nonce, verloopt
 * Root rekent hem zelf uit (de sha256 van het pakket uit zijn eigen kopie) en vergelijkt met clientDataJSON.challenge.
 */
export function uitdagingVoor(doel, velden) {
  if (!DOELEN.has(doel)) throw new Error("DOEL_ONBEKEND");
  const v = velden || {};
  const nonce = String(v.nonce || ""); const verloopt = Number(v.verloopt);
  if (!/^[A-Za-z0-9_-]{22,128}$/.test(nonce)) throw new Error("NONCE_ONGELDIG");
  if (!Number.isSafeInteger(verloopt) || verloopt <= 0) throw new Error("VERLOOPT_ONGELDIG");
  let delen;
  if (doel === "goedkeuren") {
    if (!/^[0-9a-f-]{36}$/.test(String(v.voorstelId || ""))) throw new Error("VOORSTEL_ONGELDIG");
    if (!/^[0-9]{8}-[0-9]{6}$/.test(String(v.versie || ""))) throw new Error("VERSIE_ONGELDIG");
    if (!/^[0-9a-f]{64}$/.test(String(v.sha256 || ""))) throw new Error("SHA256_ONGELDIG");
    delen = [v.voorstelId, v.versie, v.sha256];
  } else {
    if (!/^[0-9a-f]{64}$/.test(String(v.vingerafdruk || ""))) throw new Error("VINGERAFDRUK_ONGELDIG");
    delen = [v.vingerafdruk];
  }
  return b64u(sha256(Buffer.from(["mijn-ruimte-goedkeuring/v1", doel, ...delen, nonce, String(verloopt)].join("\n"), "utf8")));
}

/** Is `verloopt` (ms) nog geldig en niet verder dan 5 minuten (+ klokspeling) in de toekomst? */
export function verlooptGeldig(verloopt, nu = Date.now()) {
  if (!Number.isSafeInteger(verloopt)) return "VERLOOPT_ONGELDIG";
  if (verloopt <= nu) return "VERLOPEN";
  if (verloopt > nu + UITDAGING_MAX_MS + KLOK_SPELING_MS) return "VERLOOPT_TE_LAAT";
  return null;
}

// ------------------------------------------------------------------------------------------------ clientDataJSON
function leesClientData(b64, type, verwachteUitdaging, origins) {
  let raw;
  try { raw = vanB64u(b64, 8192); } catch { return { fout: "CLIENTDATA_ONGELDIG" }; }
  let cd;
  try { cd = JSON.parse(raw.toString("utf8")); } catch { return { fout: "CLIENTDATA_ONGELDIG" }; }
  if (!cd || typeof cd !== "object") return { fout: "CLIENTDATA_ONGELDIG" };
  if (cd.type !== type) return { fout: "TYPE_ONJUIST" };
  if (typeof cd.challenge !== "string" || !zelfde(cd.challenge, verwachteUitdaging)) return { fout: "UITDAGING_ONJUIST" };
  if (typeof cd.origin !== "string" || !origins.includes(cd.origin)) return { fout: "ORIGIN_ONJUIST" };
  if (cd.crossOrigin === true) return { fout: "CROSS_ORIGIN" };
  if (cd.topOrigin !== undefined && !origins.includes(cd.topOrigin)) return { fout: "ORIGIN_ONJUIST" };
  return { raw, cd };
}
const rpIdOk = (rpIdHash, rpId) => zelfde(rpIdHash, sha256(Buffer.from(String(rpId), "utf8")));

// ------------------------------------------------------------------------------------------------ registratie (§7.1)
/**
 * Leest een nieuwe passkey (navigator.credentials.create). Controleert type, challenge, origin, rpIdHash, UP+UV+AT en de
 * sleutel zelf. Geeft { ok, credentialId, alg, jwk, vingerafdruk, signCount, aaguid, fmt } of { ok:false, code }.
 */
export function verifieerRegistratie({ credentialId, clientDataJSON, attestationObject, verwachteUitdaging, rpId, origins }) {
  try {
    const c = leesClientData(clientDataJSON, "webauthn.create", verwachteUitdaging, origins);
    if (c.fout) return { ok: false, code: c.fout };
    const att = cborLees(vanB64u(attestationObject, 64 * 1024)).waarde;
    if (!(att instanceof Map) || !Buffer.isBuffer(att.get("authData")) || typeof att.get("fmt") !== "string") return { ok: false, code: "ATTESTATION_ONGELDIG" };
    const ad = leesAuthData(att.get("authData"));
    if (!rpIdOk(ad.rpIdHash, rpId)) return { ok: false, code: "RPID_ONJUIST" };
    if (!(ad.vlaggen & VLAG.UP)) return { ok: false, code: "GEEN_AANWEZIGHEID" };
    if (!(ad.vlaggen & VLAG.UV)) return { ok: false, code: "GEEN_VERIFICATIE" };
    if (!(ad.vlaggen & VLAG.AT) || !ad.credentialId || !ad.cose) return { ok: false, code: "GEEN_SLEUTEL" };
    if (credentialId !== undefined && b64u(ad.credentialId) !== credentialId) return { ok: false, code: "CREDENTIAL_VERSCHILT" };
    const { alg, jwk } = coseNaarJwk(ad.cose);
    const ab = att.get("authData");
    return { ok: true, credentialId: b64u(ad.credentialId), alg, jwk, vingerafdruk: vingerafdruk({ alg, jwk }), signCount: ad.signCount,
      aaguid: ab.length >= 53 ? ab.subarray(37, 53).toString("hex") : "", fmt: att.get("fmt") };
  } catch (err) {
    return { ok: false, code: String(err?.message || "REGISTRATIE_ONGELDIG").replace(/[^A-Z0-9_]/g, "") || "REGISTRATIE_ONGELDIG" };
  }
}

// ------------------------------------------------------------------------------------------------ assertie (§7.2)
/**
 * Controleert een assertie (navigator.credentials.get) tegen een lijst bekende sleutels:
 * sleutel gevonden op credentialId, type webauthn.get, challenge, origin, rpIdHash, UP + UV, en de handtekening over
 * authenticatorData ‖ sha256(clientDataJSON). signCount wordt teruggegeven; de beller vergelijkt met de opgeslagen teller.
 * @returns {{ok:true, credentialId:string, vingerafdruk:string, signCount:number, vlaggen:number, label?:string} | {ok:false, code:string}}
 */
export function verifieerAssertie({ assertie, verwachteUitdaging, rpId, origins, sleutels }) {
  try {
    const a = assertie || {};
    if (typeof a.credentialId !== "string" || !B64U.test(a.credentialId) || a.credentialId.length > 1400) return { ok: false, code: "CREDENTIAL_ONGELDIG" };
    const sleutel = (Array.isArray(sleutels) ? sleutels : []).find((s) => s && typeof s.credentialId === "string" && zelfde(s.credentialId, a.credentialId));
    if (!sleutel) return { ok: false, code: "SLEUTEL_ONBEKEND" };
    const c = leesClientData(a.clientDataJSON, "webauthn.get", verwachteUitdaging, origins);
    if (c.fout) return { ok: false, code: c.fout };
    const authData = vanB64u(a.authenticatorData, 8192);
    const ad = leesAuthData(authData);
    if (!rpIdOk(ad.rpIdHash, rpId)) return { ok: false, code: "RPID_ONJUIST" };
    if (!(ad.vlaggen & VLAG.UP)) return { ok: false, code: "GEEN_AANWEZIGHEID" };
    if (!(ad.vlaggen & VLAG.UV)) return { ok: false, code: "GEEN_VERIFICATIE" };
    const handtekening = vanB64u(a.signature, 2048);
    const sleutelObj = sleutelObject(sleutel);
    const data = Buffer.concat([authData, sha256(c.raw)]);
    let geldig = false;
    if (sleutel.alg === -7) geldig = cryptoVerify("sha256", data, { key: sleutelObj, dsaEncoding: "der" }, handtekening);
    else if (sleutel.alg === -8) geldig = cryptoVerify(null, data, sleutelObj, handtekening);
    else geldig = cryptoVerify("sha256", data, sleutelObj, handtekening);
    if (!geldig) return { ok: false, code: "HANDTEKENING_ONGELDIG" };
    return { ok: true, credentialId: sleutel.credentialId, vingerafdruk: vingerafdruk(sleutel), signCount: ad.signCount, vlaggen: ad.vlaggen, label: sleutel.label };
  } catch (err) {
    return { ok: false, code: String(err?.message || "ASSERTIE_ONGELDIG").replace(/[^A-Z0-9_]/g, "") || "ASSERTIE_ONGELDIG" };
  }
}

/** Teller-regel (§7.2 stap 21): als een van beide tellers niet 0 is, moet de nieuwe groter zijn dan de opgeslagen. */
export function tellerOk(opgeslagen, nieuw) {
  const o = Number(opgeslagen) || 0; const n = Number(nieuw) || 0;
  return (o === 0 && n === 0) || n > o;
}

/** Standaard relying party (kan in het root-bestand worden overschreven). */
export const STANDAARD_RP = Object.freeze({ rpId: "admin.tarasevych.com", origins: Object.freeze(["https://admin.tarasevych.com"]) });

/** Leest de inhoud van goedkeur-passkeys.json (al geparsed) en geeft een schone lijst + rp-instellingen. Onbekende velden vallen weg. */
export function normaliseerSleutelbestand(data) {
  const d = data && typeof data === "object" ? data : {};
  const rpId = typeof d.rpId === "string" && /^[a-z0-9.-]{3,253}$/.test(d.rpId) ? d.rpId : STANDAARD_RP.rpId;
  const origins = Array.isArray(d.origins) && d.origins.every((o) => typeof o === "string" && /^https:\/\/[a-z0-9.-]+$/.test(o)) && d.origins.length
    ? d.origins.slice(0, 5) : [...STANDAARD_RP.origins];
  const sleutels = [];
  for (const s of Array.isArray(d.sleutels) ? d.sleutels.slice(0, 20) : []) {
    try {
      if (!s || typeof s.credentialId !== "string" || !B64U.test(s.credentialId)) continue;
      const fp = vingerafdruk(s);
      sleutels.push({ credentialId: s.credentialId, alg: s.alg, jwk: s.jwk, label: String(s.label || "").slice(0, 60), vingerafdruk: fp,
        toegevoegd: String(s.toegevoegd || ""), door: String(s.door || "").slice(0, 80) });
    } catch { /* ongeldige sleutel overslaan */ }
  }
  return { versie: 1, rpId, origins, sleutels };
}
