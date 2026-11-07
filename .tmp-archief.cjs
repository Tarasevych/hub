"use strict";

// .tmp-archief.ts
var import_node_fs = require("node:fs");
var import_node_crypto2 = require("node:crypto");

// shared/ontwikkelarchief.ts
var ONTWIKKELARCHIEF_MAX = 8192;
var ONTWIKKELARCHIEF_REPO = "Tarasevych/hub";
var SHA = /^[0-9a-f]{40}$/;
var HASH = /^[0-9a-f]{64}$/;
var VERSIE = /^\d{8}-\d{6}$/;
var TAAK = /^[A-Z][A-Z0-9]{1,9}-\d{3,5}$/;
var TAK = /^(feature|fix|audit|release)\/[a-z0-9]+(?:-[a-z0-9]+)*-\d{8}-\d{6}$/;
var ontwikkelArchiefPad = (id) => `orchestratie/ontwikkelarchieven/${id}.json`;
var ontwikkelArchiefUrl = (commit2, pad) => `https://github.com/${ONTWIKKELARCHIEF_REPO}/blob/${commit2}/${pad}`;
var ontwikkelArchiefRelease = (versie2) => `https://github.com/${ONTWIKKELARCHIEF_REPO}/releases/tag/${versie2}`;
var ontwikkelArchiefApi = (ref) => `https://api.github.com/repos/${ONTWIKKELARCHIEF_REPO}/contents/${ref.pad}?ref=${ref.commit}`;
var ontwikkelReleaseApi = (ref) => `https://api.github.com/repos/${ONTWIKKELARCHIEF_REPO}/releases/tags/${ref.release.split("/").at(-1)}`;
function leesOntwikkelArchief(ruw, versie2, bronCommit) {
  const fouten = [];
  if (!ruw || BufferByteLengte(ruw) > ONTWIKKELARCHIEF_MAX) return { ref: null, fouten: ["bestand ontbreekt of overschrijdt 8192 bytes"] };
  let o;
  try {
    const j = JSON.parse(ruw);
    if (!j || typeof j !== "object" || Array.isArray(j)) throw Error("object");
    o = j;
  } catch {
    return { ref: null, fouten: ["geen geldig JSON-object"] };
  }
  const veld = (k) => typeof o[k] === "string" ? String(o[k]) : "";
  const taakId = veld("taakId"), repo = veld("repo"), tak = veld("tak"), commit2 = veld("commit");
  const pad = veld("pad"), sha256 = veld("sha256"), url = veld("url"), release = veld("release"), pakket2 = veld("pakket");
  if (o.schema !== 1) fouten.push("schema");
  if (!TAAK.test(taakId)) fouten.push("taakId");
  if (repo !== ONTWIKKELARCHIEF_REPO) fouten.push("repo");
  if (!TAK.test(tak)) fouten.push("tak");
  if (!SHA.test(commit2) || commit2 !== bronCommit) fouten.push("commit / BRON-COMMIT");
  if (pad !== ontwikkelArchiefPad(taakId)) fouten.push("pad");
  if (!HASH.test(sha256)) fouten.push("sha256");
  if (url !== ontwikkelArchiefUrl(commit2, pad)) fouten.push("url");
  if (!VERSIE.test(versie2) || release !== ontwikkelArchiefRelease(versie2)) fouten.push("release");
  if (pakket2 !== `mijn-ruimte-${versie2}.tar.gz`) fouten.push("pakket");
  return fouten.length ? { ref: null, fouten } : { ref: o, fouten };
}
function BufferByteLengte(s) {
  return new TextEncoder().encode(s).byteLength;
}
function valideerOntwikkelDossier(ruw, taakId) {
  if (!ruw || typeof ruw !== "object" || Array.isArray(ruw)) return ["dossier: object ontbreekt"];
  const d = ruw;
  const fout2 = [];
  if (d.schema !== 1 || d.taakId !== taakId) fout2.push("dossier.schema/taakId");
  if (typeof d.opdracht !== "string" || d.opdracht.trim().length < 40) fout2.push("dossier.opdracht");
  for (const veld of ["tijdlijn", "keuzes", "wijzigingen", "controles", "bronnen", "beperkingen"]) {
    if (!Array.isArray(d[veld]) || !d[veld].length) fout2.push(`dossier.${veld}`);
  }
  if (!d.privacy || typeof d.privacy !== "object" || d.privacy.geheimenUitgesloten !== true) fout2.push("dossier.privacy");
  return fout2;
}

// backend/uitrol-ontwikkelarchief.ts
var import_node_crypto = require("node:crypto");
var fout = (code, reden) => ({ ok: false, code, reden });
async function controleerOntwikkelArchiefOnline(ref, pakketSha2, opties = {}) {
  if (!/^[0-9a-f]{64}$/.test(pakketSha2)) return fout("ONTWIKKELARCHIEF_ONGELDIG", "SHA-256 van het pakket ontbreekt");
  const ophalen = opties.ophalen || fetch;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Mijn-Ruimte-Uitrol-TRACE-001",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (opties.token) headers.Authorization = "Bearer " + opties.token;
  async function gh(url) {
    const res = await ophalen(url, { headers, redirect: "error", signal: AbortSignal.timeout(opties.timeoutMs ?? 12e3) });
    if (res.status === 404) throw new Error("404");
    if (!res.ok) throw new Error("HTTP_" + res.status);
    const raw = await res.text();
    if (raw.length > 8e5) throw new Error("TE_GROOT");
    return JSON.parse(raw);
  }
  try {
    const content = await gh(ontwikkelArchiefApi(ref));
    if (content.type !== "file" || content.encoding !== "base64" || typeof content.content !== "string") return fout("ONTWIKKELARCHIEF_ONGELDIG", "Geen GitHub-bestand");
    const bytes = Buffer.from(content.content.replace(/\s+/g, ""), "base64");
    if (bytes.length > 256e3 || bytes.length === 0) return fout("ONTWIKKELARCHIEF_ONGELDIG", "Dossier is leeg of te groot");
    if ((0, import_node_crypto.createHash)("sha256").update(bytes).digest("hex") !== ref.sha256) return fout("ONTWIKKELARCHIEF_SHA_VERSCHILT", "Commitbestand heeft andere SHA-256");
    let dossier;
    try {
      dossier = JSON.parse(bytes.toString("utf8"));
    } catch {
      return fout("ONTWIKKELARCHIEF_ONGELDIG", "Dossier-JSON ongeldig");
    }
    const fouten = valideerOntwikkelDossier(dossier, ref.taakId);
    if (fouten.length) return fout("ONTWIKKELARCHIEF_ONGELDIG", fouten.join(", ").slice(0, 230));
    const branch = await gh(`https://api.github.com/repos/${ONTWIKKELARCHIEF_REPO}/branches/${ref.tak.split("/").map(encodeURIComponent).join("/")}`);
    const head = String(branch?.commit?.sha || "");
    if (!/^[0-9a-f]{40}$/.test(head)) return fout("ONTWIKKELARCHIEF_TAK_ONGELDIG", "GitHub-tak heeft geen geldige HEAD");
    const vergelijking = await gh(`https://api.github.com/repos/${ONTWIKKELARCHIEF_REPO}/compare/${ref.commit}...${head}`);
    if (!["ahead", "identical"].includes(vergelijking?.status)) return fout("ONTWIKKELARCHIEF_TAK_ONGELDIG", "Dossiercommit hoort niet bij de taak-tak");
    const release = await gh(ontwikkelReleaseApi(ref));
    const asset = Array.isArray(release?.assets) ? release.assets.find((a) => a?.name === ref.pakket) : null;
    if (!asset || asset.state !== "uploaded") return fout("ONTWIKKELARCHIEF_PAKKET_ONTBREEKT", "Exacte tar.gz ontbreekt op GitHub Release");
    if (asset.digest !== `sha256:${pakketSha2}`) return fout("ONTWIKKELARCHIEF_PAKKET_SHA_VERSCHILT", "Release-asset wijkt af van het ge\xFCploade tar.gz");
    return { ok: true, code: "OK", reden: "Vastgelegd dossier, taak-tak en exact GitHub Release-archief bevestigd", url: ref.url };
  } catch (e) {
    const probleem = e instanceof Error ? e.message : "netwerk";
    return fout(
      probleem === "404" ? "ONTWIKKELARCHIEF_NIET_GEVONDEN" : "ONTWIKKELARCHIEF_ONBEREIKBAAR",
      probleem === "404" ? "GitHub-dossier, tak of Release bestaat niet" : "GitHub kon niet veilig worden geverifieerd: " + probleem.slice(0, 50)
    );
  }
}

// .tmp-archief.ts
var [refPad, pakket, versie, commit] = process.argv.slice(2);
var gelezen = leesOntwikkelArchief((0, import_node_fs.readFileSync)(refPad, "utf8"), versie, commit);
console.log("ref fouten:", gelezen.fouten.join(",") || "geen");
if (!gelezen.ref) process.exit(1);
var pakketSha = (0, import_node_crypto2.createHash)("sha256").update((0, import_node_fs.readFileSync)(pakket)).digest("hex");
controleerOntwikkelArchiefOnline(gelezen.ref, pakketSha).then((r) => {
  console.log("resultaat:", JSON.stringify(r));
});
