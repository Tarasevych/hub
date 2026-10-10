#!/usr/bin/env node
// Root-hulp voor de goedkeuring van updates met een passkey (Mijn Ruimte). Geïnstalleerd als
// /usr/local/lib/mijn-ruimte/goedkeuring/goedkeur-hulp.mjs (root 0644) naast webauthn-kern.mjs; aangeroepen via
// /usr/local/sbin/mijn-ruimte-passkey (wist de omgeving, neemt de vergrendeling). Zie deploy/RUNBOOK-VEILIGE-UITROL.md §13.
//
// Vertrouwensmodel: ALLES wat de app (gebruiker mijnruimte) schrijft, is onbetrouwbaar. Root installeert alleen als een assertie
// van een passkey uit het ROOT-bestand /etc/mijn-ruimte/goedkeur-passkeys.json geldig is voor precies dit pakket (sha256 uit de
// eigen kopie), met juiste rpId/origin, UV, een niet-verlopen challenge (≤ 5 min) en een nonce die root nog nooit zag.
// Een nieuwe sleutel komt alleen in het root-bestand via SSH (`toevoegen <vingerafdruk>`, de allereerste) of met een assertie van
// een sleutel die er al in staat (`verwerk`, aangestuurd door mijn-ruimte-goedkeur-sleutels.path).
// Recht INTREKKEN kan de app zonder assertie vragen (sleutel-intrekken-*.json met reden; alleen weghalen = veilige richting). Root
// onthoudt die vingerafdruk in staat.json (ingetrokken) en neemt hem daarna alleen nog via SSH (`toevoegen`) terug.
//
// Opdrachten:
//   verifieer-goedkeuring <pakket> <goedkeuring.json> <versie>   (door mijn-ruimte-uitrol --goedkeuring)  → exit 0 ok, 2 geweigerd
//   verwerk                                                       sleutelverzoeken uit de inbox (path-unit)
//   wachtend | lijst                                              tonen (SSH)
//   toevoegen <vingerafdruk (≥ 16 hex-tekens)>                    wachtende aanmelding bevestigen (SSH; eerste sleutel)
//   verwijderen <vingerafdruk (≥ 16 hex-tekens)>                  sleutel weghalen (SSH)
//   alles-intrekken                                               alle sleutels weghalen (SSH; telefoon kwijt)
//   beleid-start <genesis.signed.json> <vingerafdruk ≥ 16 hex>    eerste AI-beleid (offline ondertekend met de herstelsleutel; SSH)
//   beleid-toon                                                   huidige versie van het AI-beleid (SSH)
//   (verwerk ook: ai-beleid-*.json — nieuwe versie met een assertie van een root-passkey of een Ed25519-handtekening)
//   rp-bijwerken                                                  leeg sleutelbestand met de oude rpId (admin.tarasevych.com)
//                                                                 → rpId tarasevych.com + origins admin/id (installer, idempotent)
import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants as FS, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, chownSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { OUDE_RP_ID, STANDAARD_RP, normaliseerSleutelbestand, originHoortBijRp, tellerOk, uitdagingVoor, verifieerAssertie, verlooptGeldig, vingerafdruk, vingerafdrukKort } from "./webauthn-kern.mjs";
import { beleidFout, beleidHash, controleerEd25519, ketenFout, sleutelVingerafdruk, volgendeFout } from "./ai-beleid-kern.mjs";

const IS_ROOT = typeof process.getuid === "function" && process.getuid() === 0;
// Overschrijven kan alleen in tests (niet als root).
const omg = (naam, standaard) => (!IS_ROOT && process.env[naam]) || standaard;
const SLEUTELS = omg("GOEDKEUR_SLEUTELS", "/etc/mijn-ruimte/goedkeur-passkeys.json");
const RECHTEN = omg("GOEDKEUR_RECHTEN", "/etc/mijn-ruimte/mcp-rechten.json");
const STAAT = omg("GOEDKEUR_STAAT", "/var/lib/mijn-ruimte/goedkeuring");
const INBOX = omg("GOEDKEUR_INBOX", "/srv/mijn-ruimte/goedkeur-inbox");
const STATUS_DIR = omg("GOEDKEUR_STATUS_DIR", "/var/lib/mijn-ruimte-uitrol-status");
// AI-beleid (§13.12): de keten van door de eigenaar ondertekende versies. Root schrijft, de app leest (0755/0644).
const BELEID_DIR = omg("AI_BELEID_DIR", "/var/lib/mijn-ruimte/ai-beleid");
const GROEP = omg("GOEDKEUR_GROEP", "mijnruimte");
const MAX_JSON = 64 * 1024;
const MAX_SLEUTELS = 10;
const ZELF = fileURLToPath(import.meta.url);

const sha256Hex = (b) => createHash("sha256").update(b).digest("hex");
const nuMs = () => Date.now();
/** sha256 van een (groot) bestand in stukken, zonder symlinks te volgen. */
function sha256Bestand(p) {
  const fd = openSync(p, FS.O_RDONLY | FS.O_NOFOLLOW);
  try {
    if (!fstatSync(fd).isFile()) throw new Error("GEEN_GEWOON_BESTAND");
    const h = createHash("sha256"); const buf = Buffer.alloc(1 << 20);
    for (;;) { const n = readSync(fd, buf, 0, buf.length, null); if (n <= 0) break; h.update(buf.subarray(0, n)); }
    return h.digest("hex");
  } finally { closeSync(fd); }
}
const log = (s) => process.stderr.write(`[goedkeuring] ${s}\n`);

// ------------------------------------------------------------------------------------------------ bestanden
function groepId() {
  try {
    for (const regel of readFileSync("/etc/group", "utf8").split("\n")) { const d = regel.split(":"); if (d[0] === GROEP) return Number(d[2]); }
  } catch { /* geen /etc/group */ }
  return -1;
}
/** Root-bestand: geen symlink, gewoon bestand, eigendom van root en niet schrijfbaar voor groep/anderen (alleen gecontroleerd als root). */
function rootBestandOk(p) {
  let st; try { st = lstatSync(p); } catch { return false; }
  if (!st.isFile() || st.isSymbolicLink()) return false;
  if (!IS_ROOT) return true;
  return st.uid === 0 && (st.mode & 0o022) === 0;
}
/** Leest een (mogelijk door de app geschreven) bestand veilig: geen symlinks (O_NOFOLLOW), alleen een gewoon bestand, begrensd. */
function leesBegrensd(p, max = MAX_JSON) {
  const fd = openSync(p, FS.O_RDONLY | FS.O_NOFOLLOW | (FS.O_NONBLOCK || 0));
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw new Error("GEEN_GEWOON_BESTAND");
    if (st.size > max) throw new Error("TE_GROOT");
    const buf = Buffer.alloc(st.size);
    let gelezen = 0;
    while (gelezen < st.size) { const n = readSync(fd, buf, gelezen, st.size - gelezen, gelezen); if (n <= 0) break; gelezen += n; }
    return buf.subarray(0, gelezen);
  } finally { closeSync(fd); }
}
function schrijfAtomisch(p, inhoud, modus, groepLeesbaar) {
  mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${randomBytes(4).toString("hex")}`;
  writeFileSync(tmp, inhoud, { mode: modus });
  if (IS_ROOT) { const g = groepLeesbaar ? groepId() : 0; chownSync(tmp, 0, g >= 0 ? g : 0); }
  renameSync(tmp, p);
}
function leesSleutelbestand() {
  if (!existsSync(SLEUTELS)) return normaliseerSleutelbestand({});
  if (!rootBestandOk(SLEUTELS)) throw Object.assign(new Error("SLEUTELBESTAND_RECHTEN"), { uk: "Файл ключів passkey не належить root або доступний для запису іншим.", nl: "Het passkey-sleutelbestand is niet van root of is schrijfbaar voor anderen." });
  return normaliseerSleutelbestand(JSON.parse(leesBegrensd(SLEUTELS, 256 * 1024).toString("utf8")));
}
function schrijfSleutelbestand(d) {
  schrijfAtomisch(SLEUTELS, JSON.stringify({ versie: 1, rpId: d.rpId, origins: d.origins, sleutels: d.sleutels }, null, 2) + "\n", 0o640, true);
}
function schakelaarAan() {
  if (!rootBestandOk(RECHTEN)) return false;
  try { return JSON.parse(leesBegrensd(RECHTEN).toString("utf8"))["passkey-goedkeuring"] === true; } catch { return false; }
}

// ------------------------------------------------------------------------------------------------ toestand (nonces, tellers)
function leesStaat() {
  mkdirSync(STAAT, { recursive: true, mode: 0o700 });
  let d = {};
  try { d = JSON.parse(readFileSync(path.join(STAAT, "staat.json"), "utf8")); } catch { d = {}; }
  const nonces = d.nonces && typeof d.nonces === "object" ? d.nonces : {};
  const tellers = d.tellers && typeof d.tellers === "object" ? d.tellers : {};
  const grens = nuMs() - 24 * 3600_000; // een verlopen nonce kan nooit meer slagen (verloopt-controle); na 24 uur opruimen
  for (const [k, v] of Object.entries(nonces)) if (Number(v) < grens) delete nonces[k];
  // Vingerafdrukken die via de app (zonder assertie) zijn ingetrokken: die komen alleen via SSH terug (§13.10).
  const ingetrokken = d.ingetrokken && typeof d.ingetrokken === "object" ? d.ingetrokken : {};
  return { nonces, tellers, ingetrokken };
}
const schrijfStaat = (s) => schrijfAtomisch(path.join(STAAT, "staat.json"), JSON.stringify(s) + "\n", 0o600, false);

/** Gemeenschappelijke controle van een assertie + verbruik van de nonce + teller. Geeft {ok,...} of {ok:false, code}. */
/** Extra origin alleen voor het AI-beleid (zie controleerEnVerbruik). */
const BELEID_EXTRA_ORIGINS = Object.freeze(["https://mcp.tarasevych.com"]);
function controleerEnVerbruik(doel, velden, assertie, bestand) {
  const tijd = verlooptGeldig(Number(velden.verloopt));
  if (tijd) return { ok: false, code: tijd };
  let uitdaging;
  try { uitdaging = uitdagingVoor(doel, velden); } catch (err) { return { ok: false, code: String(err.message) }; }
  if (!bestand.sleutels.length) return { ok: false, code: "GEEN_SLEUTELS" };
  const staat = leesStaat();
  const nonceHash = sha256Hex(String(velden.nonce));
  if (staat.nonces[nonceHash]) return { ok: false, code: "HERGEBRUIKT" };
  // Het AI-beleid wordt beheerd waar de AI-verbindingen staan (mcp.*/agents): alleen voor DIT doel telt mcp.* als extra origin.
  // Serverupdates en sleutelbeheer blijven bij de origins uit het sleutelbestand (admin/id).
  const origins = doel === "ai-beleid" ? [...new Set([...bestand.origins, ...BELEID_EXTRA_ORIGINS.filter((o) => originHoortBijRp(o, bestand.rpId))])] : bestand.origins;
  const r = verifieerAssertie({ assertie, verwachteUitdaging: uitdaging, rpId: bestand.rpId, origins, sleutels: bestand.sleutels });
  if (!r.ok) return r;
  if (!tellerOk(staat.tellers[r.credentialId], r.signCount)) return { ok: false, code: "TELLER_TERUG" };
  // Eerst verbruiken, dan pas handelen: ook als de installatie straks mislukt, werkt deze assertie nooit meer.
  staat.nonces[nonceHash] = Number(velden.verloopt);
  staat.tellers[r.credentialId] = r.signCount;
  schrijfStaat(staat);
  return r;
}

// ------------------------------------------------------------------------------------------------ meldingen
const TEKSTEN = {
  OK: ["Підтвердження passkey дійсне.", "De passkey-bevestiging is geldig."],
  UIT: ["Схвалення через passkey вимкнено на сервері.", "Goedkeuren met een passkey staat uit op de server."],
  GEEN_SLEUTELS: ["На сервері немає жодного підтвердженого passkey власника.", "Er staat nog geen bevestigde passkey van de eigenaar op de server."],
  SLEUTEL_ONBEKEND: ["Цей passkey не зареєстрований на сервері як ключ власника.", "Deze passkey staat niet als sleutel van de eigenaar op de server."],
  HANDTEKENING_ONGELDIG: ["Підпис passkey недійсний.", "De handtekening van de passkey is ongeldig."],
  UITDAGING_ONJUIST: ["Підтвердження стосується іншого пакета або іншого запиту.", "De bevestiging hoort bij een ander pakket of een ander verzoek."],
  PAKKET_GEWIJZIGD: ["Пакет змінено після схвалення.", "Het pakket is na de goedkeuring gewijzigd."],
  VERLOPEN: ["Час підтвердження минув (5 хв). Схваліть ще раз.", "De bevestiging is verlopen (5 min). Keur opnieuw goed."],
  VERLOOPT_TE_LAAT: ["Термін дії підтвердження задовгий.", "De geldigheid van de bevestiging is te lang."],
  HERGEBRUIKT: ["Це підтвердження вже використано.", "Deze bevestiging is al gebruikt."],
  TELLER_TERUG: ["Лічильник passkey пішов назад (можлива копія ключа).", "De teller van de passkey ging terug (mogelijk een gekopieerde sleutel)."],
  RPID_ONJUIST: ["Passkey призначений для іншого сайту.", "De passkey hoort bij een andere site."],
  ORIGIN_ONJUIST: ["Підтвердження надійшло з іншої адреси.", "De bevestiging kwam van een ander adres."],
  GEEN_VERIFICATIE: ["Пристрій не перевірив вас (відбиток, обличчя або PIN).", "Het apparaat heeft u niet geverifieerd (vingerafdruk, gezicht of pincode)."],
  VERSIE_VERSCHILT: ["Версія в підтвердженні не збігається з пакетом.", "De versie in de bevestiging wijkt af van het pakket."],
  GOEDKEURING_ONGELDIG: ["Файл схвалення пошкоджений.", "Het goedkeuringsbestand is beschadigd."],
  SLEUTELBESTAND_RECHTEN: ["Файл ключів passkey не належить root або доступний для запису іншим.", "Het passkey-sleutelbestand is niet van root of is schrijfbaar voor anderen."],
  EERSTE_SLEUTEL_VIA_SSH: ["Перший passkey підтверджується лише через SSH.", "De eerste passkey wordt alleen via SSH bevestigd."],
  TE_VEEL_SLEUTELS: ["Забагато ключів passkey.", "Te veel passkey-sleutels."],
  BESTAAT_AL: ["Цей passkey вже додано.", "Deze passkey is al toegevoegd."],
  NIET_GEVONDEN: ["Ключ не знайдено.", "Sleutel niet gevonden."],
  OPNIEUW_VIA_SSH: ["Право цього ключа відкликано через застосунок; повернути його можна лише через SSH.", "Het recht van deze sleutel is via de app ingetrokken; terugzetten kan alleen via SSH."],
  REDEN_ONGELDIG: ["Для відкликання потрібна причина.", "Voor het intrekken is een reden nodig."],
  BELEID_NIET_GESTART: ["Політику доступу ШІ ще не встановлено (перша версія — через SSH: beleid-start).", "Het AI-beleid is nog niet geïnstalleerd (eerste versie via SSH: beleid-start)."],
  BELEID_KETEN_ONGELDIG: ["Ланцюжок версій політики пошкоджено.", "De keten van beleidsversies is beschadigd."],
  VERSIE_VERSCHILT_BELEID: ["Політику вже змінено іншим підписом. Відкрийте сторінку заново.", "Het beleid is intussen met een andere handtekening gewijzigd. Open de pagina opnieuw."],
  ONTWERP_VERLOPEN: ["Чернетка застаріла. Підготуйте зміну ще раз.", "Het ontwerp is verouderd. Bereid de wijziging opnieuw voor."],
  BELEID_ONGELDIG: ["Чернетка політики недійсна.", "Het beleidsontwerp is ongeldig."],
  BELEID_EIGENAAR_ALLEEN: ["Право змінювати дозволи не можна видати агентові.", "Het recht om toestemmingen te wijzigen kan niet aan een agent worden gegeven."],
};
const tekst = (code) => TEKSTEN[code] || [`Відхилено (${code}).`, `Geweigerd (${code}).`];

function gebeurtenis(code, niveau, uk, nl) {
  // Zelfde vorm als gitops/opdracht (zie backend/server-beheer.ts parseRootGebeurtenissen); onder de gedeelde vergrendeling.
  const nu = new Date();
  const p = (n, l = 2) => String(n).padStart(l, "0");
  const id = `${nu.getUTCFullYear()}${p(nu.getUTCMonth() + 1)}${p(nu.getUTCDate())}T${p(nu.getUTCHours())}${p(nu.getUTCMinutes())}${p(nu.getUTCSeconds())}${p(nu.getUTCMilliseconds(), 3)}000Z-${randomBytes(4).toString("hex")}`;
  const regel = JSON.stringify({ id, tijd: nu.toISOString(), bron: "goedkeuring", code, niveau, uk, nl, tag: "" });
  try {
    mkdirSync(STATUS_DIR, { recursive: true });
    const lock = path.join(STATUS_DIR, ".gebeurtenissen.lock");
    const r = spawnSync("flock", ["-x", lock, process.execPath, ZELF, "__gebeurtenis", regel], { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, PATH: "/usr/bin:/bin" } });
    if (r.status !== 0) schrijfGebeurtenis(regel);
  } catch { /* melden mag nooit de hoofdtaak breken */ }
}
function schrijfGebeurtenis(regel) {
  const pad = path.join(STATUS_DIR, "gebeurtenissen.jsonl");
  let oud = [];
  try { oud = readFileSync(pad, "utf8").split("\n").filter(Boolean).slice(-499); } catch { oud = []; }
  schrijfAtomisch(pad, [...oud, regel].join("\n") + "\n", 0o640, true);
}
function sleutelStatus(uitkomst, code, extra = {}) {
  const [uk, nl] = tekst(code);
  schrijfAtomisch(path.join(STATUS_DIR, "goedkeur-sleutels.json"), JSON.stringify({ uitkomst, code, uk, nl, tijd: new Date().toISOString(), ...extra }) + "\n", 0o640, true);
}

// ------------------------------------------------------------------------------------------------ opdrachten
function verifieerGoedkeuring(pakket, goedkeuringPad, versie) {
  const uit = (code, extra = {}) => { const [uk, nl] = tekst(code); process.stdout.write(JSON.stringify({ ok: code === "OK", code, uk, nl, ...extra }) + "\n"); return code === "OK" ? 0 : 2; };
  if (!schakelaarAan()) return uit("UIT");
  let g;
  try { g = JSON.parse(leesBegrensd(goedkeuringPad).toString("utf8")); } catch { return uit("GOEDKEURING_ONGELDIG"); }
  if (!g || typeof g !== "object" || g.doel !== "goedkeuren" || !g.assertie || typeof g.assertie !== "object") return uit("GOEDKEURING_ONGELDIG");
  if (String(g.versie) !== String(versie)) return uit("VERSIE_VERSCHILT");
  // De sha256 komt NIET uit het bestand van de app, maar uit root's eigen kopie van het pakket.
  let eigen;
  try { eigen = sha256Bestand(pakket); } catch { return uit("GOEDKEURING_ONGELDIG"); }
  if (String(g.sha256) !== eigen) return uit("PAKKET_GEWIJZIGD");
  let bestand;
  try { bestand = leesSleutelbestand(); } catch (err) { return uit(err.message === "SLEUTELBESTAND_RECHTEN" ? "SLEUTELBESTAND_RECHTEN" : "GEEN_SLEUTELS"); }
  const r = controleerEnVerbruik("goedkeuren", { voorstelId: String(g.voorstelId || ""), versie: String(versie), sha256: eigen, nonce: g.nonce, verloopt: Number(g.verloopt) }, g.assertie, bestand);
  if (!r.ok) return uit(r.code);
  return uit("OK", { label: r.label || "", vingerafdruk: r.vingerafdruk, voorstelId: String(g.voorstelId) });
}

// sleutel-intrekken (§13.10): de app vraagt ZONDER assertie om het recht van één sleutel in te trekken. Dat kan alleen rechten
// weghalen (de veilige richting); root onthoudt de vingerafdruk en neemt die sleutel daarna alleen nog via SSH terug.
const VERZOEK = /^sleutel-(toevoegen|verwijderen|intrekken)-[0-9a-f]{16,64}\.json$/;
const BELEID_VERZOEK = /^ai-beleid-([0-9a-f]{16,64})\.json$/;
function verwerk() {
  let namen = [];
  try { namen = readdirSync(INBOX).filter((n) => VERZOEK.test(n) || BELEID_VERZOEK.test(n)).sort(); } catch { log(`inbox ${INBOX} ontbreekt`); return 0; }
  let laatste = 0;
  for (const naam of namen.slice(0, 20)) {
    const p = path.join(INBOX, naam);
    let req = null;
    try { req = JSON.parse(leesBegrensd(p, 512 * 1024).toString("utf8")); } catch { req = null; }
    try { unlinkSync(p); } catch { /* al weg */ }
    const beleid = BELEID_VERZOEK.exec(naam);
    if (beleid) { const code = verwerkBeleid(beleid[1], req); laatste = code === "OK" ? laatste : 2; continue; }
    const doel = naam.startsWith("sleutel-toevoegen-") ? "sleutel-toevoegen" : naam.startsWith("sleutel-intrekken-") ? "sleutel-intrekken" : "sleutel-verwijderen";
    const code = doel === "sleutel-intrekken" ? intrekkenEen(req) : verwerkEen(doel, req);
    laatste = code === "OK" ? laatste : 2;
  }
  return laatste;
}
function verwerkEen(doel, req) {
  const weiger = (code, extra = {}) => { const [uk, nl] = tekst(code); log(`${doel} geweigerd: ${code}`); sleutelStatus("geweigerd", code, { doel, ...extra }); gebeurtenis(code, "waarschuwing", uk, nl); return code; };
  if (!req || typeof req !== "object" || req.doel !== doel || !req.assertie) return weiger("GOEDKEURING_ONGELDIG");
  let bestand;
  try { bestand = leesSleutelbestand(); } catch (err) { return weiger(String(err.message)); }
  if (doel === "sleutel-toevoegen") {
    if (!bestand.sleutels.length) return weiger("EERSTE_SLEUTEL_VIA_SSH");
    const n = req.nieuw || {};
    let fp;
    try { fp = vingerafdruk({ alg: n.alg, jwk: n.jwk }); } catch { return weiger("GOEDKEURING_ONGELDIG"); }
    if (typeof n.credentialId !== "string" || !/^[A-Za-z0-9_-]{16,1400}$/.test(n.credentialId)) return weiger("GOEDKEURING_ONGELDIG");
    if (bestand.sleutels.some((s) => s.credentialId === n.credentialId || s.vingerafdruk === fp)) return weiger("BESTAAT_AL");
    if (bestand.sleutels.length >= MAX_SLEUTELS) return weiger("TE_VEEL_SLEUTELS");
    if (leesStaat().ingetrokken[fp]) return weiger("OPNIEUW_VIA_SSH", { vingerafdruk: fp });
    const r = controleerEnVerbruik(doel, { vingerafdruk: fp, nonce: req.nonce, verloopt: Number(req.verloopt) }, req.assertie, bestand);
    if (!r.ok) return weiger(r.code, { vingerafdruk: fp });
    bestand.sleutels.push({ credentialId: n.credentialId, alg: n.alg, jwk: n.jwk, label: String(n.label || "passkey").slice(0, 60), vingerafdruk: fp, toegevoegd: new Date().toISOString(), door: `passkey:${r.vingerafdruk.slice(0, 16)}` });
    schrijfSleutelbestand(bestand);
    sleutelStatus("klaar", "OK", { doel, vingerafdruk: fp });
    gebeurtenis("PASSKEY_TOEGEVOEGD", "info", `Додано passkey ${vingerafdrukKort(fp)} (підтверджено ключем ${vingerafdrukKort(r.vingerafdruk)}).`, `Passkey ${vingerafdrukKort(fp)} toegevoegd (bevestigd met sleutel ${vingerafdrukKort(r.vingerafdruk)}).`);
    return "OK";
  }
  const doelFp = String(req.vingerafdruk || "");
  if (!/^[0-9a-f]{64}$/.test(doelFp)) return weiger("GOEDKEURING_ONGELDIG");
  if (!bestand.sleutels.some((s) => s.vingerafdruk === doelFp)) return weiger("NIET_GEVONDEN");
  const r = controleerEnVerbruik(doel, { vingerafdruk: doelFp, nonce: req.nonce, verloopt: Number(req.verloopt) }, req.assertie, bestand);
  if (!r.ok) return weiger(r.code, { vingerafdruk: doelFp });
  bestand.sleutels = bestand.sleutels.filter((s) => s.vingerafdruk !== doelFp);
  schrijfSleutelbestand(bestand);
  sleutelStatus("klaar", "OK", { doel, vingerafdruk: doelFp });
  gebeurtenis("PASSKEY_VERWIJDERD", "info", `Passkey ${vingerafdrukKort(doelFp)} видалено.`, `Passkey ${vingerafdrukKort(doelFp)} verwijderd.`);
  return "OK";
}

/** Recht van één sleutel intrekken op verzoek van de app (geen assertie nodig: alleen weghalen). */
function intrekkenEen(req) {
  const doel = "sleutel-intrekken";
  const weiger = (code, extra = {}) => { const [uk, nl] = tekst(code); log(`${doel} geweigerd: ${code}`); sleutelStatus("geweigerd", code, { doel, ...extra }); gebeurtenis(code, "waarschuwing", uk, nl); return code; };
  if (!req || typeof req !== "object" || req.doel !== doel) return weiger("GOEDKEURING_ONGELDIG");
  const fp = String(req.vingerafdruk || "");
  if (!/^[0-9a-f]{64}$/.test(fp)) return weiger("GOEDKEURING_ONGELDIG");
  const reden = String(req.reden || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 500);
  if (reden.length < 10) return weiger("REDEN_ONGELDIG", { vingerafdruk: fp });
  let bestand;
  try { bestand = leesSleutelbestand(); } catch (err) { return weiger(String(err.message)); }
  const sleutel = bestand.sleutels.find((s) => s.vingerafdruk === fp);
  if (!sleutel) return weiger("NIET_GEVONDEN", { vingerafdruk: fp });
  const door = String(req.door || "").slice(0, 200), sessie = String(req.sessie || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 8);
  const staat = leesStaat();
  staat.ingetrokken[fp] = { op: new Date().toISOString(), door, sessie, wijziging: String(req.wijziging || "").replace(/[^0-9a-f-]/g, "").slice(0, 40), reden };
  schrijfStaat(staat); // eerst onthouden (opnieuw toevoegen via de app blijft dicht), dan pas weghalen
  bestand.sleutels = bestand.sleutels.filter((s) => s.vingerafdruk !== fp);
  schrijfSleutelbestand(bestand);
  sleutelStatus("klaar", "OK", { doel, vingerafdruk: fp });
  gebeurtenis("PASSKEY_INGETROKKEN", "waarschuwing", `Право схвалення ключа ${vingerafdrukKort(fp)} («${sleutel.label}») відкликано через застосунок (${door}). Причина: ${reden}`, `Goedkeurrecht van sleutel ${vingerafdrukKort(fp)} («${sleutel.label}») ingetrokken via de app (${door}). Reden: ${reden}`);
  return "OK";
}

// ------------------------------------------------------------------------------------------------ AI-beleid (§13.12)
// Keten in BELEID_DIR/keten.json: { versie:1, versies:[{ beleid, hash, ondertekend, op }] }; per versie ook versie-NNNNNN.json.
// Alleen root schrijft. Een versie komt er alleen bij met een geldige handtekening van de eigenaar over PRECIES die inhoud:
//  - een assertie van een passkey uit het root-bestand (dezelfde sleutels als voor het goedkeuren van updates), of
//  - een Ed25519-handtekening van een herstelsleutel uit de vorige versie (offline, scripts/ceremony.ts).
// De app (en dus een agent) kan alleen een verzoek neerleggen; zonder handtekening weigert root.
const ketenPad = () => path.join(BELEID_DIR, "keten.json");
function leesKeten() {
  if (!existsSync(ketenPad())) return null;
  if (!rootBestandOk(ketenPad())) throw new Error("BELEID_KETEN_ONGELDIG");
  const d = JSON.parse(leesBegrensd(ketenPad(), 16 * 1024 * 1024).toString("utf8"));
  const k = ketenFout(d && d.versies);
  if (!k.ok) throw new Error("BELEID_KETEN_ONGELDIG");
  return { versies: d.versies, laatste: k.laatste, hash: k.hash };
}
function schrijfKeten(versies, nieuw) {
  mkdirSync(BELEID_DIR, { recursive: true, mode: 0o755 });
  const nr = String(nieuw.beleid.seq).padStart(6, "0");
  // Eerst de losse versie (alleen nieuw aanmaken), dan de keten atomisch vervangen.
  const los = path.join(BELEID_DIR, `versie-${nr}.json`);
  if (existsSync(los)) throw new Error("VERSIE_VERSCHILT_BELEID");
  schrijfAtomisch(los, JSON.stringify(nieuw, null, 2) + "\n", 0o644, false);
  schrijfAtomisch(ketenPad(), JSON.stringify({ versie: 1, versies: [...versies, nieuw] }) + "\n", 0o644, false);
}
function beleidStatus(id, uitkomst, code, extra = {}) {
  const [uk, nl] = tekst(code);
  schrijfAtomisch(path.join(STATUS_DIR, `ai-beleid-${id}.json`), JSON.stringify({ uitkomst, code, uk, nl, tijd: new Date().toISOString(), ...extra }) + "\n", 0o640, true);
}
function verwerkBeleid(id, req) {
  const weiger = (code, extra = {}) => { const [uk, nl] = tekst(code); log(`ai-beleid geweigerd: ${code}`); beleidStatus(id, "geweigerd", code, extra); gebeurtenis(`AI_BELEID_${code}`, "waarschuwing", `Зміну політики ШІ відхилено: ${uk}`, `Wijziging van het AI-beleid geweigerd: ${nl}`); return code; };
  if (!req || typeof req !== "object" || req.doel !== "ai-beleid" || !req.ontwerp) return weiger("GOEDKEURING_ONGELDIG");
  let keten;
  try { keten = leesKeten(); } catch { return weiger("BELEID_KETEN_ONGELDIG"); }
  if (!keten) return weiger("BELEID_NIET_GESTART");
  const f = volgendeFout(keten.laatste, req.ontwerp);
  if (f) return weiger(f === "VERSIE_VERSCHILT" ? "VERSIE_VERSCHILT_BELEID" : f);
  const hash = beleidHash(req.ontwerp);
  let ondertekend;
  if (req.assertie) {
    let bestand;
    try { bestand = leesSleutelbestand(); } catch (err) { return weiger(String(err.message)); }
    const r = controleerEnVerbruik("ai-beleid", { beleidHash: hash, nonce: req.nonce, verloopt: Number(req.verloopt) }, req.assertie, bestand);
    if (!r.ok) return weiger(r.code);
    ondertekend = { soort: "passkey", vingerafdruk: r.vingerafdruk, label: String(r.label || "passkey").slice(0, 60) };
  } else if (req.ed25519) {
    const r = controleerEd25519(req.ontwerp, req.ed25519, keten.laatste.ownerKeys);
    if (!r.ok) return weiger(r.code);
    ondertekend = { soort: "ed25519", keyId: r.keyId, vingerafdruk: r.vingerafdruk };
  } else return weiger("GOEDKEURING_ONGELDIG");
  try { schrijfKeten(keten.versies, { beleid: req.ontwerp, hash, ondertekend, op: new Date().toISOString() }); }
  catch (err) { return weiger(String(err.message) === "VERSIE_VERSCHILT_BELEID" ? "VERSIE_VERSCHILT_BELEID" : "BELEID_KETEN_ONGELDIG"); }
  beleidStatus(id, "klaar", "OK", { seq: req.ontwerp.seq, hash });
  gebeurtenis("AI_BELEID_GEWIJZIGD", "info", `Політику ШІ змінено: версія ${req.ontwerp.seq} (підпис ${ondertekend.soort === "passkey" ? `passkey ${vingerafdrukKort(ondertekend.vingerafdruk)}` : `ключ ${ondertekend.keyId}`}).`,
    `AI-beleid gewijzigd: versie ${req.ontwerp.seq} (handtekening ${ondertekend.soort === "passkey" ? `passkey ${vingerafdrukKort(ondertekend.vingerafdruk)}` : `sleutel ${ondertekend.keyId}`}).`);
  return "OK";
}
/** Eerste versie via SSH: genesis.signed.json uit de ceremonie, met de vingerafdruk van de herstelsleutel die de eigenaar zelf intypt. */
function beleidStart(bestandPad, prefix) {
  if (!prefixOk(prefix)) { log("geef minstens 16 hex-tekens van de vingerafdruk van de herstelsleutel (ceremony.ts fingerprint)"); return 1; }
  if (leesKeten()) { log("er is al een AI-beleid; wijzigingen gaan alleen met een handtekening (site of ceremony.ts draft/sign)"); return 1; }
  let g;
  try { g = JSON.parse(leesBegrensd(bestandPad, 512 * 1024).toString("utf8")); } catch { log("genesis-bestand onleesbaar"); return 1; }
  const beleid = g && g.policy, sig = g && g.signature;
  const fout = beleidFout(beleid);
  if (fout) { log(`ongeldig beleid: ${fout}`); return 1; }
  if (beleid.seq !== 0 || beleid.prevHash !== null) { log("dit is geen eerste versie (seq 0)"); return 1; }
  if (!sig || sig.type !== "ed25519") { log("de eerste versie moet met de herstelsleutel (Ed25519) ondertekend zijn"); return 1; }
  const sleutel = beleid.ownerKeys.find((k) => k.type === "ed25519" && k.id === sig.keyId);
  if (!sleutel) { log("de ondertekenende sleutel staat niet in het beleid"); return 1; }
  const fp = sleutelVingerafdruk(sleutel.publicKey);
  if (!fp.startsWith(schoonPrefix(prefix))) { log(`vingerafdruk past niet: in het bestand ${vingerafdrukKort(fp)}`); return 1; }
  const r = controleerEd25519(beleid, sig, beleid.ownerKeys);
  if (!r.ok) { log(`handtekening ongeldig: ${r.code}`); return 1; }
  const hash = beleidHash(beleid);
  schrijfKeten([], { beleid, hash, ondertekend: { soort: "ed25519", keyId: r.keyId, vingerafdruk: fp }, op: new Date().toISOString() });
  gebeurtenis("AI_BELEID_GESTART", "info", `Політику ШІ встановлено: агентів ${Object.keys(beleid.agents).length}, ключ ${vingerafdrukKort(fp)}.`, `AI-beleid geïnstalleerd: ${Object.keys(beleid.agents).length} agents, sleutel ${vingerafdrukKort(fp)}.`);
  process.stdout.write(`AI-beleid geïnstalleerd: versie 0, ${Object.keys(beleid.agents).length} agents, hash ${hash.slice(0, 16)}…\n  keten: ${ketenPad()}\n`);
  return 0;
}
function beleidToon() {
  const k = leesKeten();
  if (!k) { process.stdout.write("(nog geen AI-beleid; zie beleid-start)\n"); return 0; }
  const laatste = k.versies[k.versies.length - 1];
  process.stdout.write(`versie ${k.laatste.seq}  hash ${k.hash.slice(0, 16)}…  agents ${Object.keys(k.laatste.agents).length}  ondertekend ${laatste.ondertekend?.soort || "?"} ${laatste.ondertekend?.label || laatste.ondertekend?.keyId || ""}  op ${laatste.op || ""}\n`);
  return 0;
}

const AANMELDING = /^sleutel-aanmelding-[0-9a-f]{64}\.json$/;
function wachtend() {
  const uit = [];
  let namen = [];
  try { namen = readdirSync(INBOX).filter((n) => AANMELDING.test(n)).sort(); } catch { return uit; }
  for (const naam of namen.slice(0, 20)) {
    try {
      const d = JSON.parse(leesBegrensd(path.join(INBOX, naam)).toString("utf8"));
      const fp = vingerafdruk({ alg: d.alg, jwk: d.jwk }); // zelf uitrekenen, nooit de vingerafdruk van de app overnemen
      if (typeof d.credentialId !== "string" || !/^[A-Za-z0-9_-]{16,1400}$/.test(d.credentialId)) continue;
      uit.push({ bestand: naam, vingerafdruk: fp, credentialId: d.credentialId, alg: d.alg, jwk: d.jwk, label: String(d.label || "passkey").slice(0, 60), aangemaakt: String(d.aangemaakt || "") });
    } catch { /* ongeldig overslaan */ }
  }
  return uit;
}
const prefixOk = (s) => /^[0-9a-f]{16,64}$/.test(String(s || "").replace(/\s+/g, "").toLowerCase());
const schoonPrefix = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();

function toevoegenViaSsh(prefix) {
  if (!prefixOk(prefix)) { log("geef minstens 16 hex-tekens van de vingerafdruk (zoals op de telefoon)"); return 1; }
  const p = schoonPrefix(prefix);
  const treffers = wachtend().filter((w) => w.vingerafdruk.startsWith(p));
  if (treffers.length !== 1) { log(treffers.length ? "meer dan één wachtende aanmelding past; geef meer tekens" : "geen wachtende aanmelding met deze vingerafdruk (zie: mijn-ruimte-passkey wachtend)"); return 1; }
  const w = treffers[0];
  const bestand = leesSleutelbestand();
  if (bestand.sleutels.some((s) => s.credentialId === w.credentialId || s.vingerafdruk === w.vingerafdruk)) { log("deze passkey staat er al in"); return 1; }
  if (bestand.sleutels.length >= MAX_SLEUTELS) { log("te veel sleutels"); return 1; }
  bestand.sleutels.push({ credentialId: w.credentialId, alg: w.alg, jwk: w.jwk, label: w.label, vingerafdruk: w.vingerafdruk, toegevoegd: new Date().toISOString(), door: "ssh" });
  schrijfSleutelbestand(bestand);
  const staat = leesStaat();
  if (staat.ingetrokken[w.vingerafdruk]) { delete staat.ingetrokken[w.vingerafdruk]; schrijfStaat(staat); } // root zelf heeft het teruggezet
  try { unlinkSync(path.join(INBOX, w.bestand)); } catch { /* app ruimt op */ }
  gebeurtenis("PASSKEY_TOEGEVOEGD", "info", `Додано passkey ${vingerafdrukKort(w.vingerafdruk)} через SSH.`, `Passkey ${vingerafdrukKort(w.vingerafdruk)} toegevoegd via SSH.`);
  process.stdout.write(`toegevoegd: ${w.label}  ${vingerafdrukKort(w.vingerafdruk)}\n  volledige vingerafdruk: ${w.vingerafdruk}\n  bestand: ${SLEUTELS}\n`);
  if (!schakelaarAan()) process.stdout.write(`let op: "passkey-goedkeuring" staat nog uit in ${RECHTEN}\n`);
  return 0;
}
function verwijderenViaSsh(prefix) {
  if (!prefixOk(prefix)) { log("geef minstens 16 hex-tekens van de vingerafdruk"); return 1; }
  const p = schoonPrefix(prefix);
  const bestand = leesSleutelbestand();
  const treffers = bestand.sleutels.filter((s) => s.vingerafdruk.startsWith(p));
  if (treffers.length !== 1) { log(treffers.length ? "meer dan één sleutel past" : "geen sleutel met deze vingerafdruk"); return 1; }
  bestand.sleutels = bestand.sleutels.filter((s) => s !== treffers[0]);
  schrijfSleutelbestand(bestand);
  gebeurtenis("PASSKEY_VERWIJDERD", "info", `Passkey ${vingerafdrukKort(treffers[0].vingerafdruk)} видалено через SSH.`, `Passkey ${vingerafdrukKort(treffers[0].vingerafdruk)} verwijderd via SSH.`);
  process.stdout.write(`verwijderd: ${treffers[0].label}  ${vingerafdrukKort(treffers[0].vingerafdruk)}\n`);
  return 0;
}
/**
 * rpId naar het hoofddomein (tarasevych.com) zodat dezelfde passkey uit «Способи входу» ook updates kan goedkeuren. Alleen als er
 * nog GEEN sleutels zijn: een bestaande sleutel is aan zijn rpId gebonden en zou met een andere rpId nooit meer werken.
 */
function rpBijwerken() {
  const bestand = leesSleutelbestand();
  const zelfde = bestand.rpId === STANDAARD_RP.rpId && bestand.origins.length === STANDAARD_RP.origins.length && STANDAARD_RP.origins.every((o) => bestand.origins.includes(o));
  if (zelfde) { process.stdout.write(`rpId ${bestand.rpId} is al actueel\n`); return 0; }
  if (bestand.sleutels.length) {
    log(`rpId blijft ${bestand.rpId}: er staan al ${bestand.sleutels.length} sleutel(s) in (die horen bij deze rpId). Eerst 'alles-intrekken' als u echt wilt wisselen.`);
    return 1;
  }
  if (bestand.rpId !== OUDE_RP_ID && bestand.rpId !== STANDAARD_RP.rpId) { log(`rpId ${bestand.rpId} is met de hand gezet; niets gewijzigd`); return 1; }
  schrijfSleutelbestand({ ...bestand, rpId: STANDAARD_RP.rpId, origins: [...STANDAARD_RP.origins] });
  gebeurtenis("PASSKEY_RP_BIJGEWERKT", "info", `Passkey: rpId ${STANDAARD_RP.rpId} (${STANDAARD_RP.origins.join(", ")}).`, `Passkey: rpId ${STANDAARD_RP.rpId} (${STANDAARD_RP.origins.join(", ")}).`);
  process.stdout.write(`rpId ${bestand.rpId} -> ${STANDAARD_RP.rpId}; origins ${STANDAARD_RP.origins.join(", ")}\n`);
  return 0;
}
function allesIntrekken() {
  const bestand = leesSleutelbestand();
  const n = bestand.sleutels.length;
  bestand.sleutels = [];
  schrijfSleutelbestand(bestand);
  gebeurtenis("PASSKEYS_INGETROKKEN", "waarschuwing", `Усі passkey (${n}) відкликано через SSH.`, `Alle passkeys (${n}) ingetrokken via SSH.`);
  process.stdout.write(`alle ${n} sleutel(s) ingetrokken; goedkeuren met een passkey kan pas weer na een nieuwe aanmelding + 'toevoegen'\n`);
  return 0;
}

// ------------------------------------------------------------------------------------------------ hoofdprogramma
function hoofd(argv) {
  const [opdracht, ...args] = argv;
  try {
    switch (opdracht) {
      case "__gebeurtenis": schrijfGebeurtenis(String(args[0] || "")); return 0;
      case "verifieer-goedkeuring": return args.length === 3 ? verifieerGoedkeuring(args[0], args[1], args[2]) : 64;
      case "verwerk": return verwerk();
      case "wachtend": for (const w of wachtend()) process.stdout.write(`${vingerafdrukKort(w.vingerafdruk)}  ${w.label}  ${w.aangemaakt}\n  ${w.vingerafdruk}\n`); return 0;
      case "lijst": {
        const b = leesSleutelbestand();
        process.stdout.write(`rpId ${b.rpId}  origins ${b.origins.join(", ")}  schakelaar ${schakelaarAan() ? "aan" : "uit"}\n`);
        for (const s of b.sleutels) process.stdout.write(`${vingerafdrukKort(s.vingerafdruk)}  ${s.label}  toegevoegd ${s.toegevoegd} (${s.door})\n`);
        if (!b.sleutels.length) process.stdout.write("(geen sleutels)\n");
        return 0;
      }
      case "toevoegen": return toevoegenViaSsh(args.join(""));
      case "verwijderen": return verwijderenViaSsh(args.join(""));
      case "alles-intrekken": return allesIntrekken();
      case "rp-bijwerken": return rpBijwerken();
      case "beleid-start": return args.length >= 2 ? beleidStart(args[0], args.slice(1).join("")) : 64;
      case "beleid-toon": return beleidToon();
      default:
        process.stderr.write("gebruik: mijn-ruimte-passkey wachtend | lijst | toevoegen <vingerafdruk> | verwijderen <vingerafdruk> | alles-intrekken | rp-bijwerken | beleid-start <genesis.signed.json> <vingerafdruk> | beleid-toon\n");
        return 64;
    }
  } catch (err) {
    log(`fout: ${err?.message || err}`);
    return 1;
  }
}
process.exitCode = hoofd(process.argv.slice(2));
