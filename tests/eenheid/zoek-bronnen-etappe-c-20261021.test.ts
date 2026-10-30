// Zoeken etappe C (21.10.2026): veilig archieven uitpakken, tekst/OCR met sha256-cache, inhoud → delen, bronadapters,
// stand per bron en de regels van de wachtrij. Zuivere eenheden: geen database, geen netwerk.
import { zipSync, gzipSync, strToU8 } from 'fflate';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { archiefUitpakken, veiligPad } from '../../backend/zoek/archief';
import { tekstUitInhoud, sha256Hex, type OcrCache, type OcrCacheRij, type OcrEngine } from '../../backend/zoek/ocr';
import { inhoudNaarTekst } from '../../backend/zoek/inhoud';
import { standAfleiden, WACHT_SLEUTEL, type StandRij } from '../../backend/zoek/stand';
import { wachttijdMs, isBlijvend, MAX_POGINGEN } from '../../backend/zoek/wachtrij';
import { mailObject, bordObject, githubIssueObject, agendaExternObject, bijlageObject } from '../../backend/zoek/adapters';
import { checker } from './hulp/nep-google';

const geheugenCache = () => { const m = new Map<string, OcrCacheRij>(); let schrijf = 0; const c: OcrCache & { m: typeof m; schrijfTeller: () => number } = { m, schrijfTeller: () => schrijf, lees: async (s, e) => m.get(`${s}:${e}`) || null, schrijf: async (r) => { schrijf++; m.set(`${r.sha256}:${r.engine}`, r); } }; return c; };
const telEngine = (tekst = 'HERKEND') => { let n = 0; const e: OcrEngine & { n: () => number } = { naam: 'test-engine', n: () => n, herken: async () => { n++; await new Promise((r) => setTimeout(r, 5)); return tekst; } }; return e; };

function tar(items: Array<{ naam: string; data?: string; type?: string; link?: string }>) {
  const blokken: Uint8Array[] = [];
  for (const it of items) {
    const data = strToU8(it.data || ''); const kop = new Uint8Array(512);
    kop.set(strToU8(it.naam.slice(0, 100)), 0); kop.set(strToU8('0000644\0'), 100); kop.set(strToU8('0000000\0'), 108); kop.set(strToU8('0000000\0'), 116);
    kop.set(strToU8(data.length.toString(8).padStart(11, '0') + '\0'), 124); kop.set(strToU8('00000000000\0'), 136);
    kop[156] = (it.type || '0').charCodeAt(0); if (it.link) kop.set(strToU8(it.link), 157); kop.set(strToU8('ustar\0'), 257); kop.set(strToU8('00'), 263);
    kop.set(strToU8('        '), 148); let som = 0; for (const b of kop) som += b; kop.set(strToU8(som.toString(8).padStart(6, '0') + '\0 '), 148);
    blokken.push(kop); const pad = new Uint8Array(Math.ceil(data.length / 512) * 512); pad.set(data); blokken.push(pad);
  }
  blokken.push(new Uint8Array(1024));
  const uit = new Uint8Array(blokken.reduce((s, b) => s + b.length, 0)); let o = 0; for (const b of blokken) { uit.set(b, o); o += b.length; } return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-bronnen-etap-c');

  // ---- veiligPad ----
  check('pad: gewone naam blijft', veiligPad('map/a.txt') === 'map/a.txt');
  check('pad: ../ geweigerd', veiligPad('../etc/passwd') === '' && veiligPad('a/../../b') === '');
  check('pad: absoluut en schijfletter geweigerd', veiligPad('/etc/passwd') === '' && veiligPad('C:/x') === '' && veiligPad('a\\..\\b') === '');
  check('pad: ./ en // genormaliseerd', veiligPad('./a//b/./c.txt') === 'a/b/c.txt');

  // ---- zip ----
  const zip = zipSync({ 'docs/a.txt': strToU8('alpha tekst'), 'b.txt': strToU8('beta'), '../ontsnapt.txt': strToU8('kwaad') });
  const z = archiefUitpakken(zip, 'test.zip');
  check('zip: gewone bestanden uitgepakt', z.bestanden.length === 2 && z.bestanden.some((f) => f.pad === 'test.zip/docs/a.txt'));
  check('zip: traversal-item overgeslagen en gemeld', z.problemen.some((p) => p.code === 'ONVEILIG_PAD') && !z.bestanden.some((f) => f.pad.includes('..')));

  // zip-bom: 30 MiB nullen comprimeert tot ~30 KiB
  const bom = zipSync({ 'nul.bin': new Uint8Array(30 * 1024 * 1024) }, { level: 9 });
  const b = archiefUitpakken(bom, 'bom.zip', { maxVerhouding: 100 });
  check('zip-bom: afgebroken op verhouding, niets in het geheugen gehouden', b.problemen.some((p) => p.code === 'ZIP_BOM') && b.bestanden.length === 0, `${bom.length} B ingepakt`);
  const t = archiefUitpakken(bom, 'bom.zip', { maxVerhouding: 1e9, maxBestandBytes: 1e9, maxTotaalBytes: 5 * 1024 * 1024 });
  check('totaalgrens: hele archief afgebroken', t.afgebroken && t.problemen.some((p) => p.code === 'TE_GROOT_TOTAAL') && t.bestanden.length === 0 && t.totaalBytes <= 5 * 1024 * 1024 + 4200 * 1024, `${t.totaalBytes} B, ${t.problemen.map((p) => p.code)}`);

  // aantal bestanden
  const veel: Record<string, Uint8Array> = {}; for (let i = 0; i < 30; i++) veel[`f${i}.txt`] = strToU8(`x${i}`);
  const v = archiefUitpakken(zipSync(veel), 'veel.zip', { maxBestanden: 10 });
  check('aantal bestanden: grens afgedwongen', v.afgebroken && v.problemen.some((p) => p.code === 'TE_VEEL_BESTANDEN'));

  // nesting
  const n1 = zipSync({ 'diep.txt': strToU8('diep') }), n2 = zipSync({ 'n1.zip': n1 }), n3 = zipSync({ 'n2.zip': n2 }), n4 = zipSync({ 'n3.zip': n3 });
  const ok3 = archiefUitpakken(n3, 'n3.zip', { maxDiepte: 3 });
  check('nesting: 3 niveaus toegestaan', ok3.bestanden.length === 1 && ok3.bestanden[0].pad === 'n3.zip/n2.zip/n1.zip/diep.txt');
  const te4 = archiefUitpakken(n4, 'n4.zip', { maxDiepte: 3 });
  check('nesting: 4e niveau geweigerd (TE_DIEP)', te4.bestanden.length === 0 && te4.problemen.some((p) => p.code === 'TE_DIEP'));

  // tar + tar.gz, symlink en traversal
  const tr = tar([{ naam: 'a.txt', data: 'tar-tekst' }, { naam: '../../x.txt', data: 'kwaad' }, { naam: 'link', type: '2', link: '/etc/passwd' }]);
  const ta = archiefUitpakken(tr, 'p.tar');
  check('tar: gewoon bestand, traversal en symlink geweigerd', ta.bestanden.length === 1 && ta.problemen.some((p) => p.code === 'ONVEILIG_PAD') && ta.problemen.some((p) => p.code === 'GEEN_GEWOON_BESTAND'));
  const tgz = archiefUitpakken(gzipSync(tr), 'p.tar.gz');
  check('tar.gz: via gunzip naar tar', tgz.bestanden.length === 1 && tgz.bestanden[0].pad === 'p.tar/a.txt');
  const gzbom = archiefUitpakken(gzipSync(new Uint8Array(20 * 1024 * 1024)), 'x.gz', { maxVerhouding: 100 });
  check('gzip-bom: afgebroken', gzbom.afgebroken && gzbom.bestanden.length === 0);
  check('kapot archief: geen crash', !archiefUitpakken(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]), 'kapot.zip').bestanden.length);

  // ---- OCR-cache ----
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);
  const cache = geheugenCache(), engine = telEngine();
  const [r1, r2] = await Promise.all([tekstUitInhoud(png, 'image/png', 'a.png', { cache, engine }), tekstUitInhoud(png, 'image/png', 'kopie.png', { cache, engine })]);
  const r3 = await tekstUitInhoud(png, 'image/png', 'derde.png', { cache, engine });
  check('OCR: gelijktijdig dezelfde bytes = één herkenning', engine.n() === 1 && r1.tekst === 'HERKEND' && r2.tekst === 'HERKEND');
  check('OCR: later uit de cache (sha256-sleutel)', r3.herkomst === 'ocr_cache' && engine.n() === 1 && cache.m.has(`${sha256Hex(png)}:test-engine`));
  const uitCache = geheugenCache();
  const uitEngine: OcrEngine = { naam: 'platform-ai-ocr-v1', herken: async () => { const e: any = new Error('AI_NOT_CONFIGURED'); e.code = 'AI_NOT_CONFIGURED'; throw e; } };
  const r4 = await tekstUitInhoud(png, 'image/png', 'a.png', { cache: uitCache, engine: uitEngine });
  check('OCR: AI uit → eerlijk «niet beschikbaar», NIET gecachet', r4.status === 'ocr_niet_beschikbaar' && uitCache.schrijfTeller() === 0);
  const r5 = await tekstUitInhoud(strToU8('platte tekst'), 'text/plain', 'a.txt', { cache, engine });
  check('tekst: zonder OCR', r5.herkomst === 'tekst' && r5.tekst === 'platte tekst' && engine.n() === 1);
  check('onbekend type: niet ondersteund', (await tekstUitInhoud(new Uint8Array([1, 2, 3]), 'application/x-foo', 'a.foo', { cache, engine })).status === 'niet_ondersteund');

  // PDF met tekstlaag: echte pdfjs-dist, geen OCR nodig
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); pdf.addPage().drawText('Factuur nummer 2026-0042 voor Mijn Ruimte', { x: 50, y: 700, size: 14, font });
  const pdfBytes = await pdf.save();
  const engine2 = telEngine();
  const rp = await tekstUitInhoud(pdfBytes, 'application/pdf', 'f.pdf', { cache: geheugenCache(), engine: engine2 });
  check('PDF: tekstlaag via pdfjs-dist, OCR niet aangeroepen', rp.herkomst === 'pdf_tekstlaag' && /2026-0042/.test(rp.tekst) && engine2.n() === 0, rp.status);
  // Gescande PDF (geen tekstlaag) → OCR
  const leeg = await PDFDocument.create(); leeg.addPage(); const leegBytes = await leeg.save();
  const engine3 = telEngine('GESCAND');
  const rs = await tekstUitInhoud(leegBytes, 'application/pdf', 'scan.pdf', { cache: geheugenCache(), engine: engine3 });
  check('PDF zonder tekstlaag → OCR', rs.herkomst === 'ocr' && rs.tekst === 'GESCAND' && engine3.n() === 1);

  // ---- inhoud: zip met pdf + txt → delen ----
  const inh = await inhoudNaarTekst(zipSync({ 'f.pdf': pdfBytes, 'notitie.txt': strToU8('afspraak dinsdag'), '../kwaad.txt': strToU8('x') }), 'application/zip', 'bundel.zip', { cache: geheugenCache(), engine: telEngine() });
  check('inhoud: archief → één deel per bestand', inh.archief && inh.delen.length === 2 && inh.delen.some((d) => /2026-0042/.test(d.tekst)) && inh.problemen.some((p) => p.code === 'ONVEILIG_PAD'));
  const docx = await inhoudNaarTekst(zipSync({ '[Content_Types].xml': strToU8('<x/>') }), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx', { cache: geheugenCache(), engine: null });
  // Sinds Z3 (22.10.2026) gaat een docx als één document naar de tekstextractie (niet als archief); dit kapotte exemplaar geeft leeg/fout.
  check('inhoud: docx wordt niet als archief uitgepakt', !docx.archief && !docx.delen.some((d) => d.pad.includes('[Content_Types]')) && docx.delen.every((d) => ['leeg', 'fout', 'ok'].includes(d.status)));

  // ---- adapters (sinds Z2 22.10.2026: ZoekObject uit shared/zoek-model.ts, met de lade in `rechten`) ----
  const lade = { userId: 'u1', ruimte: 'prive' as const };
  const md = mailObject(lade, { id: 'm1', subject: 'Рахунок', senderName: 'Bank', senderEmail: 'b@x.test', body: 'тіло', labelIds: ['INBOX'], updatedAt: 5 });
  check('adapter mail', md.bron === 'mail' && md.soort === 'bericht' && md.titel === 'Рахунок' && md.omschrijving === 'Bank · b@x.test' && String(md.tekst).includes('тіло') && md.bijgewerktOp === 5 && md.rechten.userId === 'u1');
  const bd = bordObject(lade, { id: 'u1', kind: 'note', title: 'N', body: 'B', tags: ['hub'], updated_at: '2026-10-21T10:00:00Z' });
  check('adapter bord (notitie)', bd.route?.pad === 'notes' && bd.soort === 'notitie' && bd.bijgewerktOp > 0);
  check('adapter github issue', githubIssueObject(lade, 'o/r', { number: 7, title: 'Bug', state: 'open', isPull: false, body: 'x', labels: [{ name: 'p1' }], url: 'https://github.com/o/r/issues/7' }).id === 'issue:o/r#7');
  check('adapter ICS/CalDAV', agendaExternObject(lade, { abonnement_id: 'abonnement1', agenda_url: '', uid: 'u@x', titel: 'Les', begin_waarde: '2026-10-22T09:00' }).id.startsWith('x:abonnement1'));
  check('adapter bijlage in archief: eigen id per pad', bijlageObject(lade, { id: 'm1', subject: 'onderwerp' }, { providerAttachmentId: 'a', filename: 'z.zip', contentType: 'application/zip', partPath: '1.2' }, { pad: 'z.zip/a.txt', tekst: 't', sha256: 's' }).id === 'm1:1.2:z.zip/a.txt');
  check('versie: dezelfde inhoud = dezelfde versie, andere inhoud = andere (de kern slaat ongewijzigd over)', mailObject(lade, { id: 'm1', subject: 'A', body: 'b' }).versie === mailObject(lade, { id: 'm1', subject: 'A', body: 'b' }).versie && mailObject(lade, { id: 'm1', subject: 'A', body: 'b' }).versie !== mailObject(lade, { id: 'm1', subject: 'A', body: 'c' }).versie);

  // ---- stand (namen uit shared/zoek-model.ts: niet_gekoppeld | indexeert | gedeeltelijk | fout | klaar) ----
  const leegW = { wachtend: 0, bezig: 0, fout: 0, laatsteWachtFout: '', laatsteWachtFoutOp: 0 };
  const rij = (p: Partial<StandRij>): StandRij => ({ stand: '', voortgang: 0, aantal: 0, laatsteOk: 0, laatstePoging: 0, fout: '', versie: '', wachtReden: '', volledigOp: 0, ...p });
  check('stand: niet verbonden', standAfleiden('github', { verbonden: false }, null, leegW).stand === 'niet_gekoppeld');
  check('stand: indexeren als er werk wacht', standAfleiden('mail', { verbonden: true }, null, { ...leegW, wachtend: 3 }).stand === 'indexeert');
  const fout = standAfleiden('drive', { verbonden: true }, rij({ laatstePoging: 30, laatsteOk: 10, fout: 'CLOUD_GOOGLE_REAUTH_REQUIRED', aantal: 4 }), leegW);
  check('stand: fout na laatste succes, met code; met documenten = gedeeltelijk', fout.stand === 'gedeeltelijk' && fout.fout === 'CLOUD_GOOGLE_REAUTH_REQUIRED' && fout.aantal === 4);
  check('stand: fout zonder documenten = fout', standAfleiden('drive', { verbonden: true }, rij({ laatstePoging: 30, laatsteOk: 10, fout: 'X' }), leegW).stand === 'fout');
  check('stand: oude fout vóór een succes = klaar', standAfleiden('drive', { verbonden: true }, rij({ stand: 'klaar', laatstePoging: 40, laatsteOk: 40, aantal: 4 }), leegW).stand === 'klaar');
  check('stand: fout uit de wachtrij telt mee', standAfleiden('cloud', { verbonden: true }, rij({ stand: 'klaar', laatstePoging: 40, laatsteOk: 40, aantal: 1 }), { ...leegW, fout: 1, laatsteWachtFout: 'OCR_MISLUKT', laatsteWachtFoutOp: 50 }).stand === 'gedeeltelijk');
  check('stand: koppelfout (bv. GitHub 401) = fout', standAfleiden('github', { verbonden: false, fout: 'GITHUB_TOKEN_INVALID' }, null, leegW).stand === 'fout');
  check('stand: dichte sleutelkluis = wachten, geen fout', standAfleiden('mail', { verbonden: true }, rij({ wachtReden: WACHT_SLEUTEL, aantal: 2 }), leegW).stand === 'gedeeltelijk' && standAfleiden('mail', { verbonden: true }, rij({ wachtReden: WACHT_SLEUTEL }), leegW).fout === '');

  // ---- wachtrij-regels ----
  check('wachtrij: exponentiële wachttijd met plafond', wachttijdMs(1) === 30_000 && wachttijdMs(2) === 60_000 && wachttijdMs(30) === 6 * 3600_000);
  check('wachtrij: blijvende fouten niet herhalen', isBlijvend('GOOGLE_MAIL_MESSAGES_REAUTH_REQUIRED') && isBlijvend('GITHUB_TOKEN_MISSING') && !isBlijvend('GOOGLE_MAIL_MESSAGES_RATE_LIMITED') && MAX_POGINGEN >= 3);
  return einde();
}
