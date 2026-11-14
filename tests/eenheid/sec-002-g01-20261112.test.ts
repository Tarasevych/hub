// SEC-002 · groep g01 (12.11.2026): regressietests voor
//   server-uitrol-01  voorcontrole van een uitrolpakket leest via een symbolische link bestanden BUITEN het archief
//   server-uitrol-03  WS-tunnel van het externe bureaublad: buffer zonder grens en herhaald ontleden vóór de aanmelding
//   keten-config-07   GitHub-werkstromen: schrijfrecht en sleutel voor alle stappen, acties zonder vaste SHA, takpatronen, letterlijke testcijfers
// Alle «geheimen» hieronder zijn verzonnen proefwaarden.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer as httpServer, type IncomingMessage } from 'node:http';
import { createServer as tcpServer, type AddressInfo, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { WebSocket } from 'ws';
import * as vc from '../../backend/uitrol-voorcontrole';
import * as G from '../../shared/extern-bureaublad';
import { checker } from './hulp/nep-google';
import { manifestVoor } from '../fixtures/uitrol/manifest-voorbeeld';

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function tot(f: () => boolean | Promise<boolean>, ms = 3000) { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await wacht(20); } return false; }

// ---------------------------------------------------------------- klein tar-schrijfje (ustar) met volledige controle over elk veld
type TarItem = { naam: string; type?: '0' | '5' | '2' | '1' | '6'; inhoud?: string; link?: string; uname?: string; mtime?: number; /** rechten (octaal), standaard 755 voor mappen en 644 voor bestanden */ modus?: number };
function tarGz(items: TarItem[]): Buffer {
  const blokken: Buffer[] = [];
  for (const it of items) {
    const type = it.type ?? '0';
    const data = type === '0' ? Buffer.from(it.inhoud ?? '', 'utf8') : Buffer.alloc(0);
    const h = Buffer.alloc(512);
    if (Buffer.byteLength(it.naam) > 100) throw new Error(`testnaam te lang: ${it.naam}`);
    h.write(it.naam, 0, 100, 'utf8');
    h.write((it.modus ?? (type === '5' ? 0o755 : type === '2' ? 0o777 : 0o644)).toString(8).padStart(7, '0') + '\0', 100, 8, 'latin1');
    h.write('0000000\0', 108, 8, 'latin1'); h.write('0000000\0', 116, 8, 'latin1');
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'latin1');
    const mt = it.mtime ?? 1_794_000_000;
    if (mt < 8 ** 11) h.write(Math.floor(mt).toString(8).padStart(11, '0') + '\0', 136, 12, 'latin1');
    else { h[136] = 0x80; h.writeBigUInt64BE(BigInt(mt), 140); } // base-256 (GNU): tijden voorbij het jaar 2242
    h.fill(0x20, 148, 156);
    h.write(type, 156, 1, 'latin1');
    if (it.link) h.write(it.link, 157, 100, 'utf8');
    h.write('ustar\0', 257, 6, 'latin1'); h.write('00', 263, 2, 'latin1');
    h.write(it.uname ?? 'root', 265, 32, 'utf8'); h.write('root', 297, 32, 'utf8');
    let som = 0; for (const b of h) som += b;
    h.write(som.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'latin1');
    blokken.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blokken.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blokken));
}

class NepWs extends EventEmitter {
  verzonden: string[] = []; gesloten: number | null = null; afgebroken = false;
  send(m: unknown) { this.verzonden.push(String(m)); }
  close(code: number) { if (this.gesloten === null) this.gesloten = code; }
  terminate() { this.afgebroken = true; }
  get dicht() { return this.afgebroken || this.gesloten !== null; }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g01-20261112');
  const W = process.cwd();
  const basis = mkdtempSync(join(tmpdir(), 'sec002-g01-'));

  // ================================================================ server-uitrol-01
  {
    const V = '20261103-211554';
    const top = `mijn-ruimte-${V}`;
    const MERK = 'PROEFWAARDE-BUITEN-HET-ARCHIEF-7f3a';
    const buiten = join(basis, 'buiten'); mkdirSync(buiten);
    writeFileSync(join(buiten, 'omgeving.txt'), `DATABASE_URL=${MERK}\nDit bestand staat buiten het pakket (plaatsvervanger voor /proc/self/environ).\n`);
    writeFileSync(join(buiten, 'tests.json'), JSON.stringify({ geslaagd: 1, mislukt: 1, uitleg: { uk: MERK, nl: MERK } }));
    writeFileSync(join(buiten, 'auteur.txt'), `${MERK}\n`);
    const sql = 'ALTER TABLE a ADD COLUMN b int;';
    const goedeBestanden = (): Record<string, string> => ({
      'UITROL-VERSIE': `${V}\n`, AUTEUR: 'Claude (Anthropic)\n', AGENT: 'claude\n', SAMENVATTING: 'Nieuwe uitrol-pagina: stappen, voorcontrole en nazorg. Niets verwijderd.\n', 'BRON-COMMIT': 'a'.repeat(40),
      'package.json': JSON.stringify({ name: 'x', scripts: { build: 'vite build' } }), 'package-lock.json': '{}', 'index.html': '<html></html>', 'vite.config.ts': 'export default {}',
      'server/migrate.ts': '//', 'scripts/build-server.mjs': '//', 'backend/index.ts': '//', 'deploy/installeer-app.sh': '#!/bin/bash\necho ok\n',
      'migrations/0001_basis.sql': 'CREATE TABLE a(id int);', 'migrations/0002_nieuw.sql': sql, 'UITROL-MANIFEST.json': manifestVoor(V),
    });
    let n = 0;
    /** Pakket: goede bestanden, behalve `zonder`; plus `extra` (links, vreemde eigenaar, vreemde tijd). */
    const maak = (o: { zonder?: string[]; extra?: TarItem[]; uname?: string } = {}) => {
      const b = goedeBestanden();
      for (const z of o.zonder ?? []) delete b[z];
      const mappen = new Set<string>([top]);
      for (const p of Object.keys(b)) { const d = p.split('/'); for (let i = 1; i < d.length; i++) mappen.add(`${top}/${d.slice(0, i).join('/')}`); }
      const items: TarItem[] = [...mappen].sort().map((m) => ({ naam: `${m}/`, type: '5' as const, uname: o.uname }));
      for (const [p, inhoud] of Object.entries(b)) items.push({ naam: `${top}/${p}`, inhoud, uname: o.uname });
      for (const e of o.extra ?? []) items.push({ ...e, naam: `${top}/${e.naam}` });
      const pad = join(basis, `pkg${++n}.tar.gz`);
      writeFileSync(pad, tarGz(items));
      return pad;
    };
    const proef = { id: 'proef-0001', ok: true, status: 'klaar', sqlSha256: new Map([['0002_nieuw', createHash('sha256').update(sql, 'utf8').digest('hex')]]) };
    const opties = { versie: V, actieveVersie: '20261102-000000', toegepasteMigraties: new Set(['0001_basis']), tests: null, proef };
    type Uit = Awaited<ReturnType<typeof vc.pakketVoorcontrole>>;
    const niv = (r: Uit, id: string) => r.resultaat.controles.find((c) => c.id === id)?.niveau;
    const lekt = (r: Uit) => JSON.stringify(r).includes(MERK);

    // Uitgangspunt: het proefpakket zonder trucs is in orde (anders bewijzen de volgende controles niets).
    const goed = await vc.pakketVoorcontrole(maak(), { ...opties, tests: { geslaagd: 10, mislukt: 0 } });
    check('uitrol-01: gewoon pakket (eigen tar-schrijfje) → voorcontrole in orde', goed.resultaat.ok && niv(goed, 'structuur') === 'ok', JSON.stringify(goed.resultaat.controles.filter((c) => c.niveau !== 'ok').map((c) => `${c.id}:${c.nl}:${(c.details || []).join('|')}`)).slice(0, 400));

    // De aanval van de audit: SAMENVATTING is een link, de eigenaarsnaam van die ene post bevat een spatie.
    const a1 = await vc.pakketVoorcontrole(maak({ zonder: ['SAMENVATTING'], extra: [{ naam: 'SAMENVATTING', type: '2', link: join(buiten, 'omgeving.txt'), uname: 'a b' }] }), opties);
    check('uitrol-01: link SAMENVATTING met eigenaar «a b» → structuur-fout (niet stil overgeslagen)', niv(a1, 'structuur') === 'fout' && !a1.resultaat.ok, `structuur=${niv(a1, 'structuur')}`);
    check('uitrol-01: inhoud van het bestand buiten het archief staat NIET in meta/uitkomst', !lekt(a1) && !a1.meta.samenvatting.includes(MERK), a1.meta.samenvatting.slice(0, 60));

    // Zelfde aanval via de tijd: mtime in het jaar 10000+ (datum met vijf cijfers past niet in het oude patroon).
    const a2 = await vc.pakketVoorcontrole(maak({ zonder: ['AUTEUR'], extra: [{ naam: 'AUTEUR', type: '2', link: join(buiten, 'auteur.txt'), mtime: 253_402_300_900 }] }), opties);
    check('uitrol-01: link AUTEUR met mtime in het jaar 10000 → structuur-fout, niets gelekt', niv(a2, 'structuur') === 'fout' && !lekt(a2), `structuur=${niv(a2, 'structuur')} auteur=${a2.meta.auteur.slice(0, 30)}`);

    // TESTRESULTATEN als link: de «uitleg» uit een vreemd JSON-bestand kwam letterlijk in de controle «tests».
    const a3 = await vc.pakketVoorcontrole(maak({ extra: [{ naam: 'TESTRESULTATEN', type: '2', link: join(buiten, 'tests.json'), uname: 'iemand anders' }] }), opties);
    check('uitrol-01: link TESTRESULTATEN → structuur-fout, uitleg uit het vreemde bestand niet getoond', niv(a3, 'structuur') === 'fout' && !lekt(a3), `structuur=${niv(a3, 'structuur')}`);

    // UITROL-MANIFEST.json als link (validatiefouten mogen geen inhoud van buiten tonen).
    const a4 = await vc.pakketVoorcontrole(maak({ zonder: ['UITROL-MANIFEST.json'], extra: [{ naam: 'UITROL-MANIFEST.json', type: '2', link: join(buiten, 'tests.json'), uname: 'x y' }] }), opties);
    check('uitrol-01: link UITROL-MANIFEST.json → structuur-fout, niets gelekt', niv(a4, 'structuur') === 'fout' && !lekt(a4), `structuur=${niv(a4, 'structuur')}`);

    // Harde link en FIFO met een vreemde eigenaar: ook die mogen niet buiten de typecontrole vallen.
    const a5 = await vc.pakketVoorcontrole(maak({ extra: [{ naam: 'kopie', type: '1', link: `${top}/AUTEUR`, uname: 'a b' }] }), opties);
    const a6 = await vc.pakketVoorcontrole(maak({ extra: [{ naam: 'pijp', type: '6', uname: 'a b' }] }), opties);
    check('uitrol-01: harde link en FIFO met eigenaar «a b» → structuur-fout', niv(a5, 'structuur') === 'fout' && niv(a6, 'structuur') === 'fout', `${niv(a5, 'structuur')}/${niv(a6, 'structuur')}`);

    // Bestandsnaam met een regeleinde: de tweede regel van de lijst werd stil overgeslagen.
    const a7 = await vc.pakketVoorcontrole(maak({ extra: [{ naam: 'docs/a\nb.md', inhoud: 'x' }] }), opties);
    check('uitrol-01: bestandsnaam met regeleinde → structuur-fout (elke regel van de lijst moet ontleed zijn)', niv(a7, 'structuur') === 'fout', `structuur=${niv(a7, 'structuur')}`);

    // Geen valse weigering: een eerlijk pakket met een eigenaarsnaam met spatie, en met Cyrillische namen en spaties in bestandsnamen.
    const b1 = await vc.pakketVoorcontrole(maak({ uname: 'Pavlo Tarasevych' }), { ...opties, tests: { geslaagd: 10, mislukt: 0 } });
    check('uitrol-01: eerlijk pakket met eigenaarsnaam met spatie → gewoon in orde (numerieke eigenaar in de lijst)', b1.resultaat.ok && niv(b1, 'structuur') === 'ok' && b1.meta.bestanden === goed.meta.bestanden, `ok=${b1.resultaat.ok} structuur=${niv(b1, 'structuur')} bestanden=${b1.meta.bestanden}/${goed.meta.bestanden}`);
    const b2 = await vc.pakketVoorcontrole(maak({ extra: [{ naam: 'docs/', type: '5' }, { naam: 'docs/НОТАТКИ БЕЗПЕКИ.uk.md', inhoud: 'текст' }, { naam: 'docs/a -> b.md', inhoud: 'pijl in de naam' }] }), { ...opties, tests: { geslaagd: 10, mislukt: 0 } });
    check('uitrol-01: Cyrillische naam, spaties en « -> » in een bestandsnaam → in orde', b2.resultaat.ok && niv(b2, 'structuur') === 'ok', JSON.stringify(b2.resultaat.controles.filter((c) => c.niveau !== 'ok').map((c) => `${c.id}:${(c.details || []).join('|')}`)).slice(0, 300));

    // Tweede laag (na het uitpakken, vóór het eerste lezen): alleen gewone bestanden en mappen.
    const controleer = (vc as unknown as { _controleerUitgepakt?: (wortel: string) => Promise<string[]> })._controleerUitgepakt;
    const leesVeilig = (vc as unknown as { _leesVeilig?: (wortel: string, rel: string, max: number) => Promise<Buffer | null> })._leesVeilig;
    check('uitrol-01: tweede en derde laag bestaan (_controleerUitgepakt, _leesVeilig)', typeof controleer === 'function' && typeof leesVeilig === 'function');
    if (typeof controleer === 'function' && typeof leesVeilig === 'function') {
      const schoon = join(basis, 'boom-schoon'); mkdirSync(join(schoon, 'top', 'sub'), { recursive: true });
      writeFileSync(join(schoon, 'top', 'AUTEUR'), 'Iemand\n'); writeFileSync(join(schoon, 'top', 'sub', 'x.txt'), 'x');
      check('uitrol-01: boom met alleen bestanden en mappen → geen bezwaren', (await controleer(schoon)).length === 0);
      const vuil = join(basis, 'boom-vuil'); mkdirSync(join(vuil, 'top', 'sub'), { recursive: true });
      writeFileSync(join(vuil, 'top', 'AUTEUR'), 'Iemand\n');
      symlinkSync(join(buiten, 'omgeving.txt'), join(vuil, 'top', 'SAMENVATTING'));
      symlinkSync(buiten, join(vuil, 'top', 'sub', 'map-link'));
      linkSync(join(vuil, 'top', 'AUTEUR'), join(vuil, 'top', 'sub', 'harde-link'));
      execFileSync('mkfifo', [join(vuil, 'top', 'sub', 'pijp')]);
      const bezwaren = await controleer(vuil);
      check('uitrol-01: boom met link, map-link, harde link en FIFO → alle vier gemeld', ['SAMENVATTING', 'map-link', 'harde-link', 'pijp'].every((x) => bezwaren.some((b) => b.includes(x))), bezwaren.join(' | ').slice(0, 300));
      check('uitrol-01: _leesVeilig leest een gewoon bestand (begrensd op max)', (await leesVeilig(vuil, 'top/AUTEUR', 3))?.toString() === 'Iem');
      check('uitrol-01: _leesVeilig volgt geen link (bestand), geen link (map) en opent geen FIFO',
        (await leesVeilig(vuil, 'top/SAMENVATTING', 8000)) === null && (await leesVeilig(vuil, 'top/sub/map-link/omgeving.txt', 8000)) === null
        && (await Promise.race([leesVeilig(vuil, 'top/sub/pijp', 10), wacht(1500).then(() => Buffer.from('hangt'))])) === null);
      check('uitrol-01: _leesVeilig weigert een pad buiten de map (..)', (await leesVeilig(join(vuil, 'top'), '../../buiten/omgeving.txt', 8000)) === null);
    }

    // ---------------------------------------------------------------- na de controle (toetsjournaal g01, opmerking 1)
    // Een map met modus 000 in het pakket maakt tar precies zo aan. De dienst draait NIET als root (User=mijnruimte): het nalopen faalt
    // met EACCES en het opruimen in `finally` kon de map niet meer in — tot 1,5 GB per poging bleef in de tijdelijke map van de dienst.
    // Після перевірки: тека без прав власника в пакеті; служба не root, тож прибирання мовчки не вдавалося.
    const vooraf = (r: Uit) => r.resultaat.controles.find((c) => c.id === 'structuur');
    const geweigerdOpLijst = (r: Uit, naam: string) => vooraf(r)?.niveau === 'fout' && /^De structuur van het archief/.test(vooraf(r)?.nl ?? '') && (vooraf(r)?.details ?? []).some((d) => d.includes(naam) && /rechten/.test(d));
    const toonS = (r: Uit) => `structuur=${vooraf(r)?.niveau} «${(vooraf(r)?.nl ?? '').slice(0, 40)}» ${(vooraf(r)?.details ?? []).join(' | ').slice(0, 160)}`;
    const dichtPakket = maak({ extra: [{ naam: 'dicht/', type: '5', modus: 0o000 }, { naam: 'dicht/a.txt', inhoud: 'x'.repeat(1000) }] });
    const n1 = await vc.pakketVoorcontrole(dichtPakket, opties);
    check('uitrol-01/n1: map met modus 000 → structuur-fout op de inhoudslijst (vóór het uitpakken)', geweigerdOpLijst(n1, 'dicht'), toonS(n1));
    const n2 = await vc.pakketVoorcontrole(maak({ extra: [{ naam: 'alleen-lezen/', type: '5', modus: 0o555 }, { naam: 'alleen-lezen/a.txt', inhoud: 'x' }] }), opties);
    const n3 = await vc.pakketVoorcontrole(maak({ extra: [{ naam: 'blind/', type: '5', modus: 0o300 }] }), opties);
    const n4 = await vc.pakketVoorcontrole(maak({ extra: [{ naam: 'dicht-voor-eigenaar/', type: '5', modus: 0o077 }] }), opties);
    check('uitrol-01/n1: map zonder schrijfrecht (555), zonder leesrecht (300) of alleen voor anderen (077) → structuur-fout op de lijst',
      geweigerdOpLijst(n2, 'alleen-lezen') && geweigerdOpLijst(n3, 'blind') && geweigerdOpLijst(n4, 'dicht-voor-eigenaar'), `${toonS(n2)} || ${toonS(n3)} || ${toonS(n4)}`);
    const n5 = await vc.pakketVoorcontrole(maak({ extra: [{ naam: 'onleesbaar.txt', inhoud: 'x', modus: 0o000 }] }), opties);
    const n6 = await vc.pakketVoorcontrole(maak({ zonder: ['AUTEUR'], extra: [{ naam: 'AUTEUR', inhoud: 'Iemand\n', modus: 0o244 }] }), opties);
    check('uitrol-01/n1: bestand dat de eigenaar niet kan lezen (000, 244) → structuur-fout op de lijst', geweigerdOpLijst(n5, 'onleesbaar.txt') && geweigerdOpLijst(n6, 'AUTEUR'), `${toonS(n5)} || ${toonS(n6)}`);
    // Geen valse weigering: krappe maar bruikbare rechten, uitvoerbare bestanden, setgid-map en bestand met setuid-bit in de lijst («s» op de plaats van «x»).
    const n7 = await vc.pakketVoorcontrole(maak({ extra: [{ naam: 'krap/', type: '5', modus: 0o700 }, { naam: 'krap/a.txt', inhoud: 'x', modus: 0o400 }, { naam: 'krap/b.sh', inhoud: '#!/bin/bash\n', modus: 0o755 },
      { naam: 'groep/', type: '5', modus: 0o2750 }, { naam: 'groep/c.txt', inhoud: 'x', modus: 0o600 }, { naam: 'kleverig/', type: '5', modus: 0o4755 }] }), { ...opties, tests: { geslaagd: 10, mislukt: 0 } });
    check('uitrol-01/n1: eerlijke rechten (map 700/2750/4755, bestand 400/600/755) → gewoon in orde', n7.resultaat.ok && niv(n7, 'structuur') === 'ok', JSON.stringify(n7.resultaat.controles.filter((c) => c.niveau !== 'ok').map((c) => `${c.id}:${(c.details || []).join('|')}`)).slice(0, 300));

    // Tweede laag: wat er na het uitpakken werkelijk staat. Als root faalt readdir niet — de controle moet de rechten dus zelf bekijken.
    if (typeof controleer === 'function') {
      const boom = join(basis, 'boom-rechten'); mkdirSync(join(boom, 'top', 'dicht', 'diep'), { recursive: true }); mkdirSync(join(boom, 'top', 'open'));
      writeFileSync(join(boom, 'top', 'dicht', 'diep', 'a.txt'), 'x'); writeFileSync(join(boom, 'top', 'open', 'geheim.txt'), 'x'); writeFileSync(join(boom, 'top', 'open', 'gewoon.txt'), 'x');
      chmodSync(join(boom, 'top', 'open', 'geheim.txt'), 0o000); chmodSync(join(boom, 'top', 'dicht'), 0o000);
      let bezwaren: string[] = []; let gooide = '';
      try { bezwaren = await controleer(boom); } catch (e) { gooide = String((e as Error).message).slice(0, 80); }
      check('uitrol-01/n1: _controleerUitgepakt meldt een map en een bestand zonder rechten voor de eigenaar (en gooit niet)', !gooide && bezwaren.some((b) => b.includes('dicht') && !b.includes('diep')) && bezwaren.some((b) => b.includes('geheim.txt')) && !bezwaren.some((b) => b.includes('gewoon.txt')),
        gooide ? `gooit: ${gooide}` : bezwaren.join(' | ').slice(0, 300) || 'geen bezwaren');
      try { chmodSync(join(boom, 'top', 'dicht'), 0o700); } catch { /* opruimen aan het eind */ }
    }

    // ---- g01-5 (na de controle): de details gaan naar de voorbereider (agent) — geen interne paden, geen opdrachtregel; nieuwe teksten uk · nl.
    {
      const intern = /uitrol-voorcontrole-|\/usr\/bin\/tar|\/bin\/tar|Command failed|EACCES|scandir|sec002-g01-/;
      const det = (r: Uit, id: string) => (r.resultaat.controles.find((c) => c.id === id)?.details ?? []).join(' | ');
      const geenTar = join(basis, 'geen-tar-map'); mkdirSync(geenTar); const geenTarPad = join(geenTar, 'pakket.tar.gz'); writeFileSync(geenTarPad, 'dit is geen archief');
      const p1 = await vc.pakketVoorcontrole(geenTarPad, opties);
      check('uitrol-01/n5: onleesbaar archief → structuur-fout zonder pad of opdrachtregel in de details', niv(p1, 'structuur') === 'fout' && !intern.test(det(p1, 'structuur')) && !det(p1, 'structuur').includes(geenTar), det(p1, 'structuur').slice(0, 200));
      const p2 = await vc.pakketVoorcontrole(maak({ extra: [{ naam: 'deploy/kapot.sh', inhoud: '#!/bin/bash\nif then fi (\n' }] }), opties);
      check('uitrol-01/n5: syntaxisfout in een script → scripts-fout met relatieve naam, zonder de tijdelijke werkmap', niv(p2, 'scripts') === 'fout' && det(p2, 'scripts').includes('deploy/kapot.sh') && !intern.test(det(p2, 'scripts')) && !det(p2, 'scripts').includes(tmpdir() + '/'), det(p2, 'scripts').slice(0, 200));
      const gooier = { has: () => { throw Object.assign(new Error(`EACCES: permission denied, scandir '${join(tmpdir(), 'uitrol-voorcontrole-AbCdEf', 'geheim')}'`), { code: 'EACCES' }); } } as unknown as ReadonlySet<string>;
      const p3 = await vc.pakketVoorcontrole(maak(), { ...opties, toegepasteMigraties: gooier });
      check('uitrol-01/n5: onverwachte uitzondering → voorcontrole-fout zonder pad (hoogstens een foutcode), tekst uk · nl', niv(p3, 'voorcontrole') === 'fout' && !/uitrol-voorcontrole-|scandir|\//.test(det(p3, 'voorcontrole')) && /[А-Яа-яІіЇїЄє]/.test(det(p3, 'voorcontrole')), det(p3, 'voorcontrole').slice(0, 200));
      const kyr = /[А-Яа-яІіЇїЄєҐґ]/;
      const p4 = await vc.pakketVoorcontrole(maak({ extra: [{ naam: 'dicht/', type: '5', modus: 0o000 }] }), opties);
      check('uitrol-01/n5: nieuwe details (rechten op de lijst) zijn tweetalig uk · nl', (vooraf(p4)?.details ?? []).some((d) => kyr.test(d) && /rechten/.test(d)), (vooraf(p4)?.details ?? []).join(' | ').slice(0, 200));
      const p5 = await vc.pakketVoorcontrole(maak({ extra: [{ naam: 'x\ny.txt', inhoud: 'x' }] }), opties);
      check('uitrol-01/n5: niet te ontleden regel van de inhoudslijst — detail tweetalig uk · nl', (vooraf(p5)?.details ?? []).some((d) => kyr.test(d) && /ontleden/.test(d)), (vooraf(p5)?.details ?? []).join(' | ').slice(0, 200));
      if (typeof controleer === 'function') {
        const boom2 = join(basis, 'boom-tweetalig'); mkdirSync(join(boom2, 'top'), { recursive: true });
        writeFileSync(join(boom2, 'top', 'a.txt'), 'x'); linkSync(join(boom2, 'top', 'a.txt'), join(boom2, 'top', 'b.txt')); symlinkSync('/etc/hostname', join(boom2, 'top', 'c'));
        const bz = await controleer(boom2);
        check('uitrol-01/n5: _controleerUitgepakt — elke melding tweetalig uk · nl', bz.length >= 2 && bz.every((b) => kyr.test(b)), bz.join(' | ').slice(0, 200));
      }
    }

    // Het opruimen zelf, ZONDER root-rechten (zoals de dienst): in een eigen proces, want als root bestaat EACCES niet.
    // Root → setpriv naar «nobody»; een gewone gebruiker (bv. CI) draait het kind rechtstreeks.
    {
      const KIND = `
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vc from './backend/uitrol-voorcontrole';
const over = () => readdirSync(tmpdir()).filter((n) => n.startsWith('uitrol-voorcontrole-')).length;
const uit: Record<string, unknown> = { uid: process.getuid?.() };
const r = await vc.pakketVoorcontrole(process.env.PAKKET!, { versie: process.env.VERSIE!, actieveVersie: '20261102-000000', toegepasteMigraties: null, tests: null });
uit.ok = r.resultaat.ok;
uit.fouten = r.resultaat.controles.filter((c) => c.niveau === 'fout').map((c) => c.id + ': ' + (c.details || []).join(' | ').slice(0, 200));
uit.achtergebleven = over();
const ruim = (vc as unknown as { _ruimWerkmapOp?: (werk: string) => Promise<boolean> })._ruimWerkmapOp;
uit.heeftRuim = typeof ruim === 'function';
if (typeof ruim === 'function') {
  const buiten = mkdtempSync(join(tmpdir(), 'buiten-')); writeFileSync(join(buiten, 'blijft.txt'), 'x'); chmodSync(buiten, 0o500);
  const w = mkdtempSync(join(tmpdir(), 'uitrol-voorcontrole-'));
  mkdirSync(join(w, 'top', 'dicht', 'diep'), { recursive: true }); mkdirSync(join(w, 'top', 'alleen-lezen'));
  writeFileSync(join(w, 'top', 'dicht', 'diep', 'a.txt'), 'x'); writeFileSync(join(w, 'top', 'dicht', 'b.txt'), 'x'); writeFileSync(join(w, 'top', 'alleen-lezen', 'c.txt'), 'x');
  symlinkSync(buiten, join(w, 'top', 'link-naar-buiten'));
  chmodSync(join(w, 'top', 'dicht', 'diep'), 0o000); chmodSync(join(w, 'top', 'dicht'), 0o000); chmodSync(join(w, 'top', 'alleen-lezen'), 0o555); chmodSync(join(w, 'top'), 0o100);
  const voor = over();
  uit.opgeruimd = await ruim(w);
  uit.bestaatNog = existsSync(w);
  uit.naOpruimen = over() - voor;
  uit.buitenModus = (statSync(buiten).mode & 0o777).toString(8);
  uit.buitenInhoud = (() => { chmodSync(buiten, 0o700); return readdirSync(buiten).join(','); })();
}
console.log('UITKOMST ' + JSON.stringify(uit));
`;
      const uid = process.getuid?.() ?? 0;
      const setpriv = ['/usr/bin/setpriv', '/bin/setpriv'].find((p) => existsSync(p));
      const voorvoegsel = uid !== 0 ? [] : setpriv ? [setpriv, '--reuid=65534', '--regid=65534', '--clear-groups'] : null;
      // Een plek die ook de gebruiker zonder rechten kan bereiken (de standaard tijdelijke map kan voor root alleen zijn).
      let kindMap = '';
      for (const kandidaat of [tmpdir(), '/tmp', '/var/tmp']) {
        if (!voorvoegsel) break;
        let m = '';
        try {
          m = mkdtempSync(join(kandidaat, 'sec002-g01-kind-')); chmodSync(m, 0o755);
          execFileSync([...voorvoegsel, process.execPath][0], [...voorvoegsel, process.execPath, '-e', 'require("node:fs").accessSync(process.argv[1], 5)', m].slice(1), { stdio: 'ignore', timeout: 20_000 });
          kindMap = m; break;
        } catch { if (m) rmSync(m, { recursive: true, force: true }); }
      }
      if (!voorvoegsel || !kindMap) console.log(`OVERGESLAGEN: opruimen zonder root-rechten (${!voorvoegsel ? 'root zonder setpriv' : 'geen map die een gebruiker zonder rechten kan bereiken'})`);
      else {
        let uitkomst: Record<string, unknown> = {}; let ruw = '';
        try {
          const { build } = await import('esbuild');
          const bundel = join(kindMap, 'kind.mjs');
          await build({ stdin: { contents: KIND, resolveDir: W, loader: 'ts', sourcefile: 'sec002-g01-kind.ts' }, outfile: bundel, bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', logLevel: 'silent' });
          const kindTmp = join(kindMap, 'tmp'); mkdirSync(kindTmp); chmodSync(kindTmp, 0o777);
          const pakket = join(kindMap, 'dicht.tar.gz'); writeFileSync(pakket, readFileSync(dichtPakket)); chmodSync(pakket, 0o644); chmodSync(bundel, 0o644);
          const cmd = [...voorvoegsel, process.execPath, bundel];
          ruw = execFileSync(cmd[0], cmd.slice(1), { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', TMPDIR: kindTmp, PAKKET: pakket, VERSIE: V } });
          uitkomst = JSON.parse(/^UITKOMST (.*)$/m.exec(ruw)?.[1] ?? '{}');
        } catch (e) { ruw = `${String((e as { stderr?: string }).stderr || '')} ${String((e as Error).message)}`.slice(0, 300); }
        const info = JSON.stringify(uitkomst).slice(0, 400) || ruw;
        check('uitrol-01/n1: kind draait zonder root-rechten', typeof uitkomst.uid === 'number' && uitkomst.uid !== 0, info === '{}' ? ruw : info);
        check('uitrol-01/n1: zonder root — pakket met map 000 geweigerd (structuur) en NIETS achtergebleven in de tijdelijke map', uitkomst.ok === false && uitkomst.achtergebleven === 0 && Array.isArray(uitkomst.fouten) && (uitkomst.fouten as string[]).some((f) => f.startsWith('structuur')), info);
        check('uitrol-01/n1: zonder root — foutmelding bevat geen intern pad of EACCES', Array.isArray(uitkomst.fouten) && !(uitkomst.fouten as string[]).some((f) => /EACCES|scandir|uitrol-voorcontrole-/.test(f)), info);
        check('uitrol-01/n1: zonder root — _ruimWerkmapOp verwijdert een werkmap met mappen 000/555/100 volledig', uitkomst.heeftRuim === true && uitkomst.opgeruimd === true && uitkomst.bestaatNog === false && uitkomst.naOpruimen === -1, info);
        check('uitrol-01/n1: zonder root — het herstellen van rechten volgt geen link (map buiten de werkmap ongemoeid: modus en inhoud)', uitkomst.buitenModus === '500' && uitkomst.buitenInhoud === 'blijft.txt', info);
        // Als root altijd weg; zonder root alleen als er niets met dichte mappen is achtergebleven.
        try { rmSync(kindMap, { recursive: true, force: true }); } catch { /* resten van een rode run */ }
      }
    }
  }

  // ================================================================ server-uitrol-03
  {
    // ---- zuivere ontleder: een instructie zonder einde mag niet onbegrensd groeien
    const gooit = (f: () => unknown) => { try { f(); return ''; } catch (e) { return (e as Error).message; } };
    check('uitrol-03: guacOntleed — 5000 elementen zonder «;» → GUAC_TE_GROOT (niet stil als rest bewaard)', gooit(() => G.guacOntleed('1.a,'.repeat(5000))) === 'GUAC_TE_GROOT');
    const lang = `${'60000.' + 'a'.repeat(60000)},`.repeat(12); // 12 × 60 kB, elk element binnen de grens, de instructie eindigt nooit
    check('uitrol-03: guacOntleed — onvoltooide instructie groter dan de instructiegrens → GUAC_TE_GROOT', gooit(() => G.guacOntleed(lang, 256 * 1024)) === 'GUAC_TE_GROOT');
    const blob = G.guacInstructie('blob', 1, 'A'.repeat(200_000));
    const veelArgs = G.guacInstructie('args', ...Array.from({ length: 300 }, (_, i) => `arg-${i}`));
    const ok = G.guacOntleed(`${G.guacInstructie('sync', 1)}${blob}${veelArgs}4.ke`);
    check('uitrol-03: guacOntleed — gewone stroom (sync, blob 200 kB, args ×300, onvolledige rest) ongewijzigd', ok.instructies.length === 3 && ok.instructies[1].args[1].length === 200_000 && ok.instructies[2].args.length === 300 && ok.rest === '4.ke');
    check('uitrol-03: guacOntleed — astrale tekens tellen als codepunten', G.guacOntleed(G.guacInstructie('key', '😀😀', 1)).instructies[0]?.args[0] === '😀😀');

    // ---- tunnel met een nep-WebSocket (geen netwerk): vóór de aanmelding
    const map = mkdtempSync(join(tmpdir(), 'sec002-rb-'));
    const rechten = join(map, 'mcp-rechten.json');
    writeFileSync(rechten, JSON.stringify({ read: true, guacamole: true }));
    process.env.MCP_RECHTEN_PAD = rechten;
    process.env.REMOTE_CONTROLE_MS = '600000';
    const rb = await import('../../backend/remote-bureaublad');
    const nieuw = () => { const ws = new NepWs(); rb.tunnelVerbinding(ws as never); return ws; };
    const klaar = (ws: NepWs) => ws.emit('close');

    const w1 = nieuw();
    w1.emit('message', Buffer.from('1.a,'.repeat(16 * 1024))); // 64 KiB, geen «;»
    check('uitrol-03: één bericht van 64 KiB vóór de aanmelding → verbinding METEEN afgebroken', w1.afgebroken, `afgebroken=${w1.afgebroken} gesloten=${w1.gesloten}`);
    klaar(w1);

    const w2 = nieuw(); let bij = -1;
    for (let i = 0; i < 40 && bij < 0; i++) { w2.emit('message', Buffer.from('1.a,'.repeat(256))); if (w2.dicht) bij = i + 1; } // 40 × 1 KiB
    check('uitrol-03: opstapelen in kleine berichten (40 × 1 KiB) vóór de aanmelding → afgebroken voordat de buffer 8 KiB voorbij is', bij > 0 && bij <= 9, `afgebroken na bericht ${bij}`);
    klaar(w2);

    const w3 = nieuw(); let bij3 = -1;
    w3.emit('message', Buffer.from('500.'));
    for (let i = 0; i < 300 && bij3 < 0; i++) { w3.emit('message', Buffer.from('a')); if (w3.dicht) bij3 = i + 2; }
    check('uitrol-03: honderden mini-berichten zonder volledige instructie vóór de aanmelding → begrensd aantal berichten', bij3 > 0 && bij3 <= 120, `afgebroken na bericht ${bij3}`);
    klaar(w3);

    const w4 = nieuw();
    w4.emit('message', Buffer.from(G.guacInstructie('mr-auth', 'geen-geldig-ticket')));
    const naWeigering = w4.verzonden.length;
    w4.emit('message', Buffer.from(G.guacInstructie('', 'ping', '1')));
    w4.emit('message', Buffer.from(G.guacInstructie('', 'ping', '2')));
    check('uitrol-03: ongeldig ticket → 4403', w4.gesloten === 4403);
    check('uitrol-03: na het begin van sluiten wordt geen bericht meer verwerkt (ping niet meer beantwoord)', w4.verzonden.length === naWeigering, `extra antwoorden: ${w4.verzonden.length - naWeigering}`);
    klaar(w4);

    const w5 = nieuw();
    w5.emit('message', Buffer.from(G.guacInstructie('nop') + G.guacInstructie('', 'ping', '7') + G.guacInstructie('size', 1280, 800, 96)));
    check('uitrol-03: gewone eerste berichten (nop, ping, size) blijven toegestaan; ping wordt beantwoord', !w5.dicht && w5.verzonden.some((m) => m.includes('4.ping,1.7')));
    klaar(w5);

    // ---- poort: zonder open sessie van de eigenaar komt niemand tot een WebSocket
    const http = httpServer((_q, s) => { s.statusCode = 404; s.end(); });
    http.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => { rb.upgrade(req, socket, head); });
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    const poort = (http.address() as AddressInfo).port;
    const verbind = () => new Promise<WebSocket>((res, rej) => {
      const ws = new WebSocket(`ws://127.0.0.1:${poort}${rb.REMOTE_WS_PATH}`, 'guacamole', { headers: { origin: `http://127.0.0.1:${poort}` } });
      ws.on('open', () => res(ws)); ws.on('error', (e) => rej(e)); ws.on('unexpected-response', (_q, r) => rej(new Error(`HTTP ${r.statusCode}`)));
    });
    const probeer = async () => { try { const ws = await verbind(); return ws; } catch (e) { return (e as Error).message; } };
    const nepSessie = (over: Record<string, unknown> = {}) => {
      const sid = randomUUID(); const nonce = randomBytes(18).toString('base64url'); const nu = Date.now();
      const s = { sid, userId: randomUUID(), tab: 'x', techSessie: null, verbindingId: randomUUID(), naam: 'proef', protocol: 'vnc', host: '127.0.0.1', ip: '127.0.0.1', poort: 5900, gebruiker: '', geheim: null,
        instellingen: G.instellingenNormaliseren({}), nonce, ticketExp: nu + 60_000, begin: nu, eind: nu + 600_000, laatsteInvoer: nu, ws: null, guacd: null, open: true, klaar: false, bytesIn: 0, bytesUit: 0, activatieId: 'x', timer: null, ...over };
      rb._sessies.set(sid, s as never);
      return { sid, ticket: rb.ticketMaken(sid, nonce, s.ticketExp), s };
    };
    try {
      rb._sessies.clear();
      const zonder = await probeer();
      check('uitrol-03: geen enkele open sessie → upgrade geweigerd met HTTP 403 (geen WebSocket voor anoniemen)', zonder === 'HTTP 403', typeof zonder === 'string' ? zonder : 'WebSocket geopend');
      if (typeof zonder !== 'string') zonder.terminate();

      // SEC-002 (afwerking A, g01-2 «oracle»): ook MET een wachtende sessie krijgt een verbinding zonder tech-cookie van de eigenaar 403 —
      // hetzelfde antwoord als zonder sessie, dus een buitenstaander leert niets over de stand van de eigenaar.
      const wachtend = nepSessie();
      const open: WebSocket[] = []; let geweigerd = '';
      for (let i = 0; i < 12; i++) { const r = await probeer(); if (typeof r === 'string') { geweigerd = r; break; } open.push(r); }
      check('uitrol-03 (afwerking A): met een wachtende sessie krijgt een verbinding zonder cookie ook 403 (geen oracle)', open.length === 0 && geweigerd === 'HTTP 403', `open=${open.length} daarna=${geweigerd || 'geen weigering'}`);
      for (const ws of open) ws.terminate();
      check('uitrol-03 (afwerking A): ook na herhalen blijft het 403 voor wie geen cookie heeft', (await probeer()) === 'HTTP 403');
      rb._sessies.delete(wachtend.sid);

      // ---- ná de aanmelding (echte sessie in het geheugen, nep-guacd die de handshake beantwoordt): buffer blijft begrensd
      if (process.env.DATABASE_URL || process.env.DATABASE_URL_SYSTEM) {
        const socks: Socket[] = [];
        const nep = tcpServer((sock) => {
          socks.push(sock); let buf = ''; sock.setEncoding('utf8');
          sock.on('data', (d: string) => {
            buf += d; let o; try { o = G.guacOntleed(buf); } catch { sock.destroy(); return; } buf = o.rest;
            for (const ins of o.instructies) { if (ins.opcode === 'select') sock.write(G.guacInstructie('args', 'VERSION_1_5_0', 'hostname', 'port')); else if (ins.opcode === 'connect') sock.write(G.guacInstructie('ready', '$nep')); }
          });
          sock.on('error', () => undefined);
        });
        await new Promise<void>((r) => nep.listen(0, '127.0.0.1', r));
        process.env.GUACD_HOST = '127.0.0.1'; process.env.GUACD_PORT = String((nep.address() as AddressInfo).port);
        try {
          const echt = nepSessie();
          const w6 = nieuw();
          w6.emit('message', Buffer.from(G.guacInstructie('mr-auth', echt.ticket)));
          check('uitrol-03: geldig ticket → sessie gekoppeld, handshake met guacd klaar', await tot(() => (echt.s as { klaar: boolean }).klaar === true) && !w6.dicht);
          w6.emit('message', Buffer.from(G.guacInstructie('mouse', 1, 2, 0)));
          check('uitrol-03: gewone invoer na de aanmelding gaat door', !w6.dicht && (echt.s as { bytesIn: number }).bytesIn > 0);
          const stuk = `${'200000.' + 'a'.repeat(200_000)},`; // geldig element, de instructie eindigt nooit
          let bij6 = -1;
          for (let i = 0; i < 10 && bij6 < 0; i++) { w6.emit('message', Buffer.from(stuk)); if (w6.dicht) bij6 = i + 1; }
          check('uitrol-03: eindeloze instructie ná de aanmelding (10 × 200 kB) → verbinding dicht voordat de buffer 1 MiB voorbij is', bij6 > 0 && bij6 <= 5 && !rb._sessies.has(echt.sid), `dicht na bericht ${bij6}`);
          klaar(w6);

          // ---- g01-2/g01-4 (na de controle): anoniemen die alle onaangemelde plaatsen bezetten, mogen de eigenaar NIET buitensluiten;
          // elke weigering laat een auditregel en een melding (uk/nl) voor de eigenaar van de open sessie achter.
          const pool = (await import('../../server/platform/pg')).getPool('systeem');
          const tp = await import('../../backend/tech-profiel');
          const tb = await import('../../backend/tech-bundels');
          const { TECH_ASSET_COOKIE } = await import('../../shared/tech-bundels');
          const melder = await import('../../backend/melder');
          const meldingen: Array<{ userId: string; kind: string; title: string; message: string }> = [];
          melder.registreerMelder(async (userId, _email, kind, title, message) => { meldingen.push({ userId, kind, title, message }); });
          const bestaand = (await pool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
          const uid = bestaand ? String(bestaand.id) : randomUUID();
          if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
          else await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid, { email: process.env.OWNER_EMAIL || 'eigenaar@eenheid.test', role: 'owner', status: 'approved', name: 'Eigenaar' }]);
          const eig = { id: uid, email: String(process.env.OWNER_EMAIL), role: 'owner', status: 'approved' };
          const seqVoor = Number((await pool.query('SELECT COALESCE(max(id), 0)::bigint AS s FROM app.audit')).rows[0]?.s || 0);
          const tabCtx = randomBytes(24).toString('hex');
          const anoniem: WebSocket[] = [];
          const probeerMet = (koppen: Record<string, string>) => new Promise<WebSocket | string>((res) => {
            const ws = new WebSocket(`ws://127.0.0.1:${poort}${rb.REMOTE_WS_PATH}`, 'guacamole', { headers: { origin: `http://127.0.0.1:${poort}`, ...koppen } });
            ws.on('open', () => res(ws)); ws.on('error', (e) => res((e as Error).message)); ws.on('unexpected-response', (_q, r) => res(`HTTP ${r.statusCode}`));
          });
          try {
            await tp.beeindigenBijIntrekken(uid, 'handmatig');
            await tp.profielVan(eig as never);
            const act = await tp.activeren(eig as never, tabCtx, 0, 'eenheidstest sec-002 g01 (tunnel)');
            const kop = await tb.assetCookieVoor(null, { id: act.id, eind: act.eind }, uid);
            const cookie = `${TECH_ASSET_COOKIE}=${/=([^;]*);/.exec(kop || '')?.[1] || ''}`;
            rb._sessies.clear();
            const eigen = nepSessie({ userId: uid, activatieId: act.id });
            let vol = '';
            for (let i = 0; i < 12; i++) { const r = await probeerMet({}); if (typeof r === 'string') { vol = r; break; } anoniem.push(r); }
            check('uitrol-03/n2 (afwerking A): anoniemen krijgen meteen 403 en kunnen dus geen plaatsen bezetten', vol === 'HTTP 403' && anoniem.length === 0, `open=${anoniem.length} daarna=${vol || 'geen weigering'}`);
            const verzonnen = await probeerMet({ cookie: `${TECH_ASSET_COOKIE}=${'A'.repeat(43)}` });
            check('uitrol-03/n2: verzonnen tech-cookie geeft geen toegang (403)', verzonnen === 'HTTP 403', typeof verzonnen === 'string' ? verzonnen : 'WebSocket geopend');
            if (typeof verzonnen !== 'string') verzonnen.terminate();
            const eigenWs = await probeerMet({ cookie });
            check('uitrol-03/n2: eigenaar met geldige tech-cookie komt binnen', typeof eigenWs !== 'string', typeof eigenWs === 'string' ? eigenWs : 'open');
            if (typeof eigenWs !== 'string') {
              eigenWs.send(G.guacInstructie('mr-auth', eigen.ticket));
              check('uitrol-03/n2: … en koppelt de wachtende sessie met het ticket', await tot(() => (eigen.s as { klaar: boolean }).klaar === true), `klaar=${(eigen.s as { klaar: boolean }).klaar}`);
              eigenWs.terminate();
            }
            const nogEen = nepSessie({ userId: randomUUID() }); // er wacht alleen een sessie van iemand anders
            const zonderEigen = await probeerMet({ cookie });
            check('uitrol-03/n2: geldige cookie zonder eigen wachtende sessie → 403', zonderEigen === 'HTTP 403', typeof zonderEigen === 'string' ? zonderEigen : 'WebSocket geopend');
            if (typeof zonderEigen !== 'string') zonderEigen.terminate();
            rb._sessies.delete(nogEen.sid);
            // g01-4: tweede wachtende sessie van de eigenaar (de eerste is gekoppeld) → weigering wordt aan hem gemeld
            nepSessie({ userId: uid, activatieId: act.id });
            const nog = await probeerMet({});
            check('uitrol-03/n4: (voorwaarde) nog een anonieme poging → 403', nog === 'HTTP 403', typeof nog === 'string' ? nog : 'open');
            if (typeof nog !== 'string') nog.terminate();
            const auditOk = await tot(async () => Number((await pool.query(`SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'owner.remote.tunnel.geweigerd' AND id > $2`, [uid, seqVoor])).rows[0]?.n || 0) > 0, 3000);
            const regel = (await pool.query(`SELECT result, details::text AS d FROM app.audit WHERE owner_id = $1 AND action = 'owner.remote.tunnel.geweigerd' AND id > $2 ORDER BY id DESC LIMIT 1`, [uid, seqVoor])).rows[0];
            check('uitrol-03/n4: weigering van de tunnel → auditregel owner.remote.tunnel.geweigerd (denied, met aantal en reden) voor de eigenaar van de open sessie', auditOk && regel?.result === 'denied' && /aantal/.test(String(regel?.d)) && /reden/.test(String(regel?.d)), JSON.stringify(regel ?? null).slice(0, 200));
            const m = meldingen.find((x) => x.userId === uid);
            check('uitrol-03/n4: … en een beveiligingsmelding uk / nl aan die eigenaar', !!m && m.kind === 'security' && /[А-Яа-яІіЇї]/.test(m.title) && / \/ /.test(m.title) && / \/ /.test(m.message), JSON.stringify(m ?? meldingen.slice(0, 2)).slice(0, 200));
            const voorAantal = meldingen.filter((x) => x.userId === uid).length;
            for (let i = 0; i < 5; i++) { const r = await probeerMet({}); if (typeof r !== 'string') r.terminate(); }
            await wacht(200);
            check('uitrol-03/n4: hoogstens één melding per minuut per eigenaar (geen vloed)', meldingen.filter((x) => x.userId === uid).length === voorAantal, `meldingen=${meldingen.filter((x) => x.userId === uid).length}`);
          } finally {
            for (const ws of anoniem) ws.terminate();
            rb._sessies.clear();
            await tp.beeindigenBijIntrekken(uid, 'handmatig').catch(() => 0);
          }
        } finally {
          for (const s of socks) s.destroy();
          await new Promise((r) => nep.close(r));
        }
      } else console.log('OVERGESLAGEN: tunnel ná de aanmelding (geen database)');
    } finally {
      rb._sessies.clear();
      http.closeAllConnections?.();
      await new Promise((r) => http.close(r));
      rmSync(map, { recursive: true, force: true });
    }
  }

  // ================================================================ keten-config-07
  {
    const WF = join(W, '.github/workflows');
    const MIJN = ['apparaat-001-uitgave', 'audit-001-release', 'github-010-uitgave', 'github-011-uitgave', 'github-012-uitgave', 'huis-001-uitgave', 'identiteit-003-release', 'identiteit-006-uitgave',
      'identiteit-007-uitgave', 'identiteit-008-uitgave', 'identiteit-account-uitgave', 'login-001-release-candidate', 'mailbg-001-uitgave', 'mailfit-001-release', 'mailfit-002-release', 'mailfix-001-checks',
      'mailmob-001-release', 'mailorbit-001-guard', 'mailpolish-001-release', 'mobiel-001-uitgave', 'perf-001-uitgave', 'trace-001-guard', 'uitrol-001-uitgave',
      // SEC-002 afwerking C (g01-9): de drie werkstromen die met de basis 11e0aad8 kwamen, volgen hetzelfde patroon als FAMILIE_A.
      // Завершальний крок C (g01-9): три процеси, що прийшли з основою 11e0aad8, — той самий зразок, що й FAMILIE_A.
      'cloud-001-uitgave', 'identiteit-009-uitgave', 'identiteit-010-uitgave'];
    const aanwezig = new Set(readdirSync(WF));
    check(`keten-07: alle ${MIJN.length} gecontroleerde werkstromen bestaan nog (niets verwijderd)`, MIJN.every((n) => aanwezig.has(`${n}.yml`)));
    type Stap = { tekst: string; naam: string };
    type Taak = { id: string; kop: string; stappen: Stap[]; schrijft: boolean };
    /** Eenvoudige ontleding van de vaste opmaak van deze werkstromen (2 spaties per niveau): top, taken, stappen. */
    const ontleed = (naam: string) => {
      const tekst = readFileSync(join(WF, `${naam}.yml`), 'utf8');
      const regels = tekst.split('\n');
      const iJobs = regels.findIndex((r) => r === 'jobs:');
      const top = regels.slice(0, iJobs).join('\n');
      const taken: Taak[] = [];
      let huidig: { id: string; regels: string[] } | null = null;
      const sluit = () => {
        if (!huidig) return;
        const iStappen = huidig.regels.findIndex((r) => r === '    steps:');
        const kop = huidig.regels.slice(0, iStappen < 0 ? undefined : iStappen).join('\n');
        const stappen: Stap[] = []; let s: string[] | null = null;
        for (const r of iStappen < 0 ? [] : huidig.regels.slice(iStappen + 1)) { if (/^      - /.test(r)) { if (s) stappen.push({ tekst: s.join('\n'), naam: '' }); s = [r]; } else if (s) s.push(r); }
        if (s) stappen.push({ tekst: s.join('\n'), naam: '' });
        for (const st of stappen) st.naam = /name: (.*)/.exec(st.tekst)?.[1] ?? /uses: (.*)/.exec(st.tekst)?.[1] ?? '';
        taken.push({ id: huidig.id, kop, stappen, schrijft: /^    permissions:\n(?:      .*\n)*?      contents: write$/m.test(kop + '\n') });
      };
      for (const r of regels.slice(iJobs + 1)) { const m = /^  ([A-Za-z0-9_-]+):\s*$/.exec(r); if (m) { sluit(); huidig = { id: m[1], regels: [] }; } else huidig?.regels.push(r); }
      sluit();
      return { tekst, top, taken };
    };
    const alle = MIJN.map((n) => ({ n, ...ontleed(n) }));
    const fout = (f: (w: (typeof alle)[number]) => boolean) => alle.filter((w) => !f(w)).map((w) => w.n);
    const toon = (l: string[]) => l.join(', ').slice(0, 300);

    const f1 = fout((w) => /^permissions:\n  contents: read\n(?!  )/m.test(w.top) && !/^  contents: write/m.test(w.top));
    check('keten-07: bovenaan alleen «contents: read» (schrijfrecht nooit voor de hele werkstroom)', f1.length === 0, toon(f1));

    const f2 = fout((w) => { const u = [...w.tekst.matchAll(/^\s*(?:- )?uses: (\S+)(.*)$/gm)]; return u.length > 0 && u.every((m) => /^actions\/[a-z-]+@[0-9a-f]{40}$/.test(m[1]) && /#\s*v\d+\.\d+\.\d+/.test(m[2])); });
    check('keten-07: elke actie vastgezet op een volledige commit-SHA met de versie als commentaar', f2.length === 0, toon(f2));

    const f3 = fout((w) => { const on = w.top.slice(w.top.indexOf('\non:')); const takken = /branches:\n((?:\s+- .*\n)+)/.exec(on)?.[1] ?? ''; return !!takken && !/[*?[\]!]/.test(takken); });
    check('keten-07: takken van «on: push» zijn exacte namen (geen «*»-patronen)', f3.length === 0, toon(f3));

    const f4 = fout((w) => w.taken.every((t) => !/GH_TOKEN|GITHUB_TOKEN|github\.token|secrets\./.test(t.kop)) && !/GH_TOKEN|github\.token/.test(w.top));
    check('keten-07: de sleutel staat nergens in «env» van een hele taak of werkstroom (alleen per stap)', f4.length === 0, toon(f4));

    const UITVOEREND = /\bnpm (?:ci|install|run|test|exec)\b|\bnpx\b|scripts\/eenheidstests\.mjs|\bvite\b|\btsc\b|playwright/;
    const f5 = fout((w) => w.taken.every((t) => t.stappen.every((s) => !/GH_TOKEN|github\.token/.test(s.tekst) || !UITVOEREND.test(s.tekst))));
    check('keten-07: geen stap met de sleutel voert npm, npx, tests of de bouw uit', f5.length === 0, toon(f5));

    // g01-3 (na de controle): ook geen eigen script (`node scripts/…`) naast de sleutel — zo’n script laadt na `npm ci` pakketten uit
    // node_modules (zoek-ui-catalogus.mjs → typescript). Toegestaan: `node --input-type=module` met ingebedde tekst die alleen node:-modules
    // laadt; git commit/push alleen met `-c core.hooksPath=/dev/null` (geen haken uit .git/hooks die een eerdere stap kan hebben gezet).
    const NODE_BESTAND = /(?:^|[\s;&|(])node(?:\s+(?!--input-type=module\b)\S+)/m;
    const PAKKET_IMPORT = /^\s*import\s[^\n]*\bfrom\s+['"](?!node:)|\brequire\(\s*['"](?!node:)|\bimport\(\s*['"](?!node:)/m;
    const zonderCommentaar = (s: string) => s.replace(/^\s*#.*$/gm, '');
    const metSleutel = (w: (typeof alle)[number]) => w.taken.flatMap((t) => t.stappen.filter((s) => /GH_TOKEN|github\.token/.test(s.tekst)).map((s) => ({ ...s, tekst: zonderCommentaar(s.tekst) })));
    const f5b = alle.flatMap((w) => metSleutel(w).filter((s) => NODE_BESTAND.test(s.tekst) || PAKKET_IMPORT.test(s.tekst)).map((s) => `${w.n} «${s.naam.slice(0, 40)}»`));
    check('keten-07/n3: geen stap met de sleutel voert een eigen script uit of laadt een pakket (alleen node --input-type=module met node:-modules)', f5b.length === 0, toon(f5b));
    const f5c = alle.flatMap((w) => metSleutel(w).filter((s) => s.tekst.split('\n').some((r) => /\bgit\s+(?:-c\s+\S+\s+)*(?:commit|push)\b/.test(r) && !/-c core\.hooksPath=\/dev\/null/.test(r))).map((s) => `${w.n} «${s.naam.slice(0, 40)}»`));
    check('keten-07/n3: git commit/push met de sleutel draait geen haken (-c core.hooksPath=/dev/null)', f5c.length === 0, toon(f5c));

    // g01-7 (na de controle): de grens ligt bij de TAAK, niet bij de stap. Een eerdere stap in dezelfde taak kan $GITHUB_PATH/$GITHUB_ENV
    // vergiftigen (een eigen `git`/`gh` vóór in PATH, BASH_ENV) of het geheugen van de runner lezen (sudo; tj-actions, CVE-2025-30066).
    // Dus: een taak met «contents: write» installeert en draait NIETS uit het pakket — geen setup-node, npm, npx, eigen scripts, vite, tsc, playwright.
    const SCHRIJFTAAK_VERBODEN = /uses: actions\/setup-node@|\bnpm\s|\bnpx\s|\bvite\b|\btsc\b|playwright|scripts\/eenheidstests\.mjs/;
    const f11 = alle.flatMap((w) => w.taken.filter((t) => t.schrijft && t.stappen.some((s) => { const x = zonderCommentaar(s.tekst); return SCHRIJFTAAK_VERBODEN.test(x) || NODE_BESTAND.test(x) || PAKKET_IMPORT.test(x); })).map((t) => `${w.n}/${t.id}`));
    check('keten-07/n7: geen taak met «contents: write» installeert of draait code uit het pakket (setup-node, npm, npx, node <script>, vite, tsc, playwright)', f11.length === 0, toon(f11));

    // g01-7: de 10 oudere werkstromen — de bouwtaak (alleen lezen) legt lokaal vast en geeft een git-bundel + pakketgegevens door; de
    // publicatietaak aanvaardt alleen commits bovenop GITHUB_SHA die uitsluitend de verwachte bestanden wijzigen, en geldige pakketgegevens.
    // Bewijs: de echte stappen uit de YAML (overdracht in de bouwtaak, controle in de publicatietaak) met bash uitgevoerd op proef-repo's.
    {
      const OUD = ['login-001-release-candidate', 'mailfit-001-release', 'mailfit-002-release', 'mailfix-001-checks', 'mailmob-001-release', 'mailorbit-001-guard', 'mailpolish-001-release', 'trace-001-guard', 'identiteit-003-release', 'audit-001-release'];
      const runVan = (s: Stap) => { const r = s.tekst.split('\n'); const i = r.findIndex((x) => /^        run: \|$/.test(x)); return i < 0 ? '' : r.slice(i + 1).map((x) => x.slice(10)).join('\n'); };
      const gitEnv = (m: string) => ({ PATH: '/usr/bin:/bin', HOME: m, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'proef', GIT_AUTHOR_EMAIL: 'proef@example.invalid', GIT_COMMITTER_NAME: 'proef', GIT_COMMITTER_EMAIL: 'proef@example.invalid', LC_ALL: 'C' });
      const git = (m: string, cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env: gitEnv(m), stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      const bash = (m: string, cwd: string, script: string, env: Record<string, string>) => {
        writeFileSync(join(m, 'stap.sh'), script);
        try { execFileSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', join(m, 'stap.sh')], { cwd, stdio: 'pipe', env: { ...gitEnv(m), ...env } }); return 0; }
        catch (e) { return (e as { status?: number }).status ?? 1; }
      };
      const fouten7: string[] = [];
      for (const n of OUD) {
        const w = alle.find((x) => x.n === n)!;
        const bouw = w.taken.find((t) => !t.schrijft && t.stappen.some((s) => /wijzigingen\.bundle/.test(s.tekst)));
        const pub = w.taken.find((t) => t.schrijft);
        const overdracht = bouw?.stappen.find((s) => /wijzigingen\.bundle/.test(s.tekst));
        const controle = pub?.stappen.find((s) => /refs\/sec002\/publicatie/.test(s.tekst));
        if (!bouw || !pub || !overdracht || !controle || !/needs: /.test(pub.kop)) { fouten7.push(`${n}: geen gescheiden bouw-/publicatietaak met overdracht en controle`); continue; }
        const toegestaan = (/TOEGESTAAN='([^']*)'/.exec(runVan(controle))?.[1] ?? '').split(/\s+/).filter(Boolean);
        const metPakket = /\bvars\b/.test(runVan(overdracht)) && /(?:RELEASE_VERSION|VERSIE)=/.test(runVan(overdracht));
        const V = '20261112-120000';
        /** Eén scenario: bouwrepo met basis, eventueel commits, overdracht; dan een verse «checkout» van de basis en de controle. */
        const scenario = (o: { wijzig?: string[]; knoei?: (p: string) => void }) => {
          const m = mkdtempSync(join(basis, `g01-7-${n}-`)); const A = join(m, 'bouw'); const B = join(m, 'pub'); const rt = join(m, 'rt'); mkdirSync(A); mkdirSync(rt);
          git(m, A, 'init', '-q'); writeFileSync(join(A, 'LEESMIJ'), 'basis\n');
          for (const p of toegestaan) { mkdirSync(join(A, p, '..'), { recursive: true }); writeFileSync(join(A, p), 'basis\n'); }
          git(m, A, 'add', '-A'); git(m, A, 'commit', '-q', '-m', 'basis'); const sha = git(m, A, 'rev-parse', 'HEAD');
          git(m, m, 'clone', '-q', A, B);
          if (o.wijzig?.length) { for (const p of o.wijzig) { mkdirSync(join(A, p, '..'), { recursive: true }); writeFileSync(join(A, p), 'gewijzigd\n'); } git(m, A, 'add', '-A'); git(m, A, 'commit', '-q', '-m', 'lokaal'); }
          mkdirSync(join(A, 'uitvoer'));
          writeFileSync(join(A, 'uitvoer', `mijn-ruimte-${V}.tar.gz`), 'pakket'); writeFileSync(join(A, 'uitvoer', `mijn-ruimte-${V}-codex-overdracht.zip`), 'zip'); writeFileSync(join(A, 'uitvoer', 'ONTWIKKELARCHIEF.json'), '{}');
          writeFileSync(join(A, 'uitvoer', `mijn-ruimte-${V}.tar.gz.sha256`), `${createHash('sha256').update('pakket').digest('hex')}  mijn-ruimte-${V}.tar.gz\n`);
          const env = { RUNNER_TEMP: rt, GITHUB_SHA: sha, RELEASE_VERSION: V, VERSIE: V, LIVE_VERSIE: '20261107-172451', LIVE_COMMIT: 'd'.repeat(40) };
          const o1 = bash(m, A, runVan(overdracht), env);
          o.knoei?.(join(rt, 'publicatie'));
          writeFileSync(join(m, 'genv'), '');
          const o2 = bash(m, B, runVan(controle), { RUNNER_TEMP: rt, GITHUB_SHA: sha, GITHUB_ENV: join(m, 'genv') });
          return { o1, o2, genv: readFileSync(join(m, 'genv'), 'utf8'), kop: git(m, A, 'rev-parse', 'HEAD') };
        };
        const goed = scenario({ wijzig: toegestaan.slice(0, 1) });
        const shaPakket = createHash('sha256').update('pakket').digest('hex');
        if (goed.o1 !== 0 || goed.o2 !== 0 || !goed.genv.includes(`RELEASE_COMMIT=${goed.kop}\n`) || (metPakket && !goed.genv.includes(`RELEASE_SHA=${shaPakket}\n`))) fouten7.push(`${n}: eerlijke overdracht geweigerd (${goed.o1}/${goed.o2}) ${goed.genv.replace(/\n/g, ' ').slice(0, 80)}`);
        const kwaad = scenario({ wijzig: [...toegestaan.slice(0, 1), 'backend/kwaad.ts'] });
        if (kwaad.o2 === 0) fouten7.push(`${n}: commit met backend/kwaad.ts aanvaard`);
        const kop = scenario({ wijzig: toegestaan.slice(0, 1), knoei: (p) => writeFileSync(join(p, 'HEAD'), `${'a'.repeat(40)}\n`) });
        if (kop.o2 === 0) fouten7.push(`${n}: verkeerde HEAD aanvaard`);
        if (metPakket) {
          const vars = scenario({ knoei: (p) => writeFileSync(join(p, 'vars'), `${readFileSync(join(p, 'vars'), 'utf8')}RELEASE_VERSION=1$(touch /tmp/x)\n`) });
          if (vars.o2 === 0) fouten7.push(`${n}: ongeldige pakketgegevens aanvaard`);
          const pk = scenario({ knoei: (p) => writeFileSync(join(p, 'uitvoer', `mijn-ruimte-${V}.tar.gz`), 'ander pakket') });
          if (pk.o2 === 0) fouten7.push(`${n}: pakket met afwijkende SHA-256 aanvaard`);
        }
      }
      check('keten-07/n7: 10 oudere werkstromen — publicatietaak aanvaardt alleen verwachte bestanden bovenop GITHUB_SHA en geldige pakketgegevens (uitgevoerd met bash en git)', fouten7.length === 0, toon(fouten7));
    }

    const f6 = fout((w) => w.taken.every((t) => t.stappen.filter((s) => /uses: actions\/checkout@/.test(s.tekst)).every((s) => /persist-credentials: false/.test(s.tekst))));
    check('keten-07: checkout bewaart de sleutel niet in .git/config (persist-credentials: false)', f6.length === 0, toon(f6));

    const f7 = fout((w) => w.taken.every((t) => t.schrijft || t.stappen.every((s) => !/GH_TOKEN|github\.token/.test(s.tekst))));
    check('keten-07: de sleutel wordt alleen gebruikt in een taak met uitdrukkelijk «contents: write»', f7.length === 0, toon(f7));

    // De jongste familie (één taak «controle-en-uitgave») is gesplitst: de taak met schrijfrecht bouwt en test niets en haalt het pakket als artefact op.
    const FAMILIE_A = ['apparaat-001-uitgave', 'github-010-uitgave', 'github-011-uitgave', 'github-012-uitgave', 'huis-001-uitgave', 'identiteit-006-uitgave', 'identiteit-007-uitgave', 'identiteit-008-uitgave',
      'mailbg-001-uitgave', 'mobiel-001-uitgave', 'perf-001-uitgave', 'uitrol-001-uitgave', 'cloud-001-uitgave', 'identiteit-009-uitgave', 'identiteit-010-uitgave'];
    const a = alle.filter((w) => FAMILIE_A.includes(w.n));
    const f8 = a.filter((w) => {
      const schrijvers = w.taken.filter((t) => t.schrijft), lezers = w.taken.filter((t) => !t.schrijft);
      return !(schrijvers.length === 1 && lezers.length === 1
        && schrijvers[0].stappen.every((s) => !UITVOEREND.test(s.tekst) && !/uses: actions\/(?:checkout|setup-node)@/.test(s.tekst))
        && /needs: /.test(schrijvers[0].kop) && schrijvers[0].stappen.some((s) => /uses: actions\/download-artifact@/.test(s.tekst))
        && schrijvers[0].stappen.some((s) => /gh release create/.test(s.tekst))
        && lezers[0].stappen.every((s) => !/\bgh (?:release|api)\b/.test(s.tekst)) && lezers[0].stappen.some((s) => UITVOEREND.test(s.tekst)));
    }).map((w) => w.n);
    check(`keten-07: ${FAMILIE_A.length} uitgave-werkstromen gesplitst — bouwen/testen zonder schrijfrecht, publiceren zonder npm/bouw`, f8.length === 0, toon(f8));

    // g01-3 (na de controle): de publicatietaak neemt de basis (versie=commit) uit het artefact van de bouwtaak alleen over als die in de
    // VERTROUWDE env van de werkstroom zelf staat (TOEGESTANE_BASES / BEKENDE_BASISSEN / vaste BASIS_VERSIE+BASIS_COMMIT).
    // Bewijs door de stap echt uit te voeren (bash) met een nagemaakt artefact: vertrouwde basis → verder; verzonnen basis → stop.
    {
      const topEnv = (top: string) => {
        const blok = /^env:\n((?:(?:  .*|\s*#.*|)\n)+)/m.exec(top + '\n')?.[1] ?? '';
        const uit: Record<string, string> = {};
        for (const m of blok.matchAll(/^  ([A-Z0-9_]+): '([^']*)'\s*$/gm)) uit[m[1]] = m[2];
        return uit;
      };
      const resultaten: string[] = [];
      for (const w of a) {
        const pub = w.taken.find((t) => t.schrijft)?.stappen.find((s) => /overdracht\/BASIS/.test(s.tekst));
        const env0 = topEnv(w.top);
        const paar = (env0.TOEGESTANE_BASES || env0.BEKENDE_BASISSEN || (env0.BASIS_VERSIE ? `${env0.BASIS_VERSIE}=${env0.BASIS_COMMIT}` : '')).trim().split(/\s+/)[0] ?? '';
        if (!pub || !paar.includes('=')) { resultaten.push(`${w.n}: geen publicatiestap of geen vertrouwde basis in env`); continue; }
        const regels = pub.tekst.split('\n'); const iRun = regels.findIndex((r) => /^        run: \|$/.test(r));
        const script = regels.slice(iRun + 1).map((r) => r.slice(10)).join('\n');
        const draai = (basisInhoud: string) => {
          const m = mkdtempSync(join(basis, 'pub-')); const rt = join(m, 'rt'); const ov = join(rt, 'overdracht');
          const V = '20261112-120000';
          mkdirSync(join(ov, 'uitvoer'), { recursive: true }); mkdirSync(join(m, 'werk'));
          writeFileSync(join(ov, 'VERSIE'), `${V}\n`); writeFileSync(join(ov, 'BASIS'), basisInhoud); writeFileSync(join(ov, 'opis.md'), 'x');
          writeFileSync(join(ov, 'uitvoer', `mijn-ruimte-${V}.tar.gz`), 'pakket');
          execFileSync('bash', ['-c', `cd "${ov}" && sha256sum "uitvoer/mijn-ruimte-${V}.tar.gz" > "uitvoer/mijn-ruimte-${V}.tar.gz.sha256"`]);
          writeFileSync(join(m, 'script.sh'), script); writeFileSync(join(m, 'genv'), '');
          try { execFileSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', join(m, 'script.sh')], { cwd: join(m, 'werk'), stdio: 'pipe', env: { PATH: '/usr/bin:/bin', RUNNER_TEMP: rt, GITHUB_ENV: join(m, 'genv'), ...env0 } }); return 0; }
          catch (e) { return (e as { status?: number }).status ?? 1; }
        };
        const [v, c] = paar.split('=');
        const goed = draai(`${v}\n${c}\n`), vals = draai(`20991231-235959\n${'f'.repeat(40)}\n`), half = draai(`${v}\n${'e'.repeat(40)}\n`);
        if (goed !== 0 || vals === 0 || half === 0) resultaten.push(`${w.n}: vertrouwd=${goed} verzonnen=${vals} andere-commit=${half}`);
      }
      check('keten-07/n3: publicatie aanvaardt de basis uit het artefact alleen als ze in de vertrouwde env van de werkstroom staat (uitgevoerd met bash)', resultaten.length === 0, toon(resultaten));
    }

    const gemeten = alle.filter((w) => FAMILIE_A.includes(w.n) || w.n === 'identiteit-003-release');
    const f9 = gemeten.filter((w) => /"?geslaagd"?:\s*[1-9]\d*\s*,/.test(w.tekst) || !/"?geslaagd"?:\s*gemeten\.geslaagd,\s*"?mislukt"?:\s*gemeten\.mislukt/.test(w.tekst)
      || !/scripts\/eenheidstests\.mjs \S+ 2>&1 \| tee -a "\$RUNNER_TEMP\/eenheidstests\.log"/.test(w.tekst) || !/readFileSync\((?:e|process\.env)\.RUNNER_TEMP ?\+ ?['"]\/eenheidstests\.log['"]/.test(w.tekst)).map((w) => w.n);
    check(`keten-07: testcijfers in TESTRESULTATEN komen uit de echte uitvoer van de tests (geen letterlijke getallen) — ${gemeten.length} werkstromen`, f9.length === 0, toon(f9));
    // Elke teststap die naar het logboek schrijft, moet falen als de test faalt (pipefail), anders verbergt «| tee» een rode test.
    const f9b = gemeten.filter((w) => w.taken.some((t) => t.stappen.some((s) => /\| tee -a "\$RUNNER_TEMP\/eenheidstests\.log"/.test(s.tekst) && !/set -(?:euo|o) pipefail/.test(s.tekst)))).map((w) => w.n);
    check('keten-07: teststappen met «| tee» hebben pipefail (een rode test blijft rood)', f9b.length === 0, toon(f9b));

    // g01-8 (na de controle): (a) elk testbestand telt één keer — de laatste uitvoering (sommige werkstromen draaien een test twee keer);
    // (b) de uitleg in TESTRESULTATEN noemt geen vooraf geschreven aantallen, alleen de gemeten lijst «bestand N/M».
    {
      const LOG = '10/10 geslaagd (a-test)\n10/10 geslaagd (a-test)\nOK iets\n5/6 geslaagd (b-test)\n3/3 geslaagd (c-test)\n';
      const LITERAL = /\(\s*\d+(?:\s*\/\s*\d+)?\s*\)|\(\s*(?:\d|понад|ruim)[^)]*\)|\b\d+\s+(?:перевір|контрол|controle|test|вкладок|tabbladen|елемент|element|маршрут|route)|\b(?:Усі|Alle|Щонайменше|Minstens)\s+\d+|Чотирнадцять|Veertien|\b\d+\/\d+\b/i;
      const r8: string[] = [];
      for (const w of gemeten) {
        const regels = w.tekst.split('\n');
        const i = regels.findIndex((r) => /const gemeten ?= ?\{ ?geslaagd: ?0, ?mislukt: ?0 ?\};?/.test(r));
        if (i < 0) { r8.push(`${w.n}: geen gemeten-blok`); continue; }
        // de regel met «const gemeten» en de volgende regel (het tellen) echt uitvoeren met een proeflogboek
        const code = `${regels[i].trim()}\n${regels[i + 1].trim()}`;
        let uitkomst: { g?: number; m?: number; l?: string } = {};
        try {
          const f = new Function('readFileSync', 'e', 'process', `${code}\nreturn { g: gemeten.geslaagd, m: gemeten.mislukt, l: typeof gemetenLijst === 'string' ? gemetenLijst : '' };`);
          uitkomst = f(() => LOG, { RUNNER_TEMP: '/proef' }, { env: { RUNNER_TEMP: '/proef' } });
        } catch (e) { r8.push(`${w.n}: tellen faalt (${String((e as Error).message).slice(0, 60)})`); continue; }
        if (uitkomst.g !== 18 || uitkomst.m !== 1) r8.push(`${w.n}: dubbel geteld of fout (${uitkomst.g}/${uitkomst.m}, verwacht 18/1)`);
        if (!/a-test 10\/10/.test(uitkomst.l ?? '') || !/b-test 5\/6/.test(uitkomst.l ?? '')) r8.push(`${w.n}: geen gemeten lijst per testbestand`);
        const na = w.tekst.slice(w.tekst.indexOf('uitleg', w.tekst.indexOf(regels[i])));
        const uk = /["']?uk["']?\s*:\s*(["'])((?:(?!\1).)*)\1([^,}]*)/s.exec(na), nl = /["']?nl["']?\s*:\s*(["'])((?:(?!\1).)*)\1([^,}]*)/s.exec(na);
        if (!uk || !nl) { r8.push(`${w.n}: geen uitleg uk/nl`); continue; }
        for (const [taal, m] of [['uk', uk], ['nl', nl]] as const) {
          if (LITERAL.test(m[2])) r8.push(`${w.n}: uitleg.${taal} bevat een vooraf geschreven aantal: «${LITERAL.exec(m[2])?.[0]}»`);
          if (!/gemetenLijst/.test(m[3])) r8.push(`${w.n}: uitleg.${taal} noemt de gemeten lijst niet`);
        }
      }
      check(`keten-07/n8: TESTRESULTATEN — elk testbestand één keer geteld, uitleg zonder vooraf geschreven aantallen en met de gemeten lijst (${gemeten.length} werkstromen)`, r8.length === 0, toon(r8));
    }
    const audit = alle.find((w) => w.n === 'audit-001-release')!;
    check('keten-07: een gepubliceerde uitgave wordt nooit verwijderd of vervangen (geen «gh release delete», geen --clobber)', alle.every((w) => !/gh release delete|--clobber|--cleanup-tag/.test(w.tekst.replace(/^\s*#.*$/gm, ''))) && /UITGAVE_BESTAAT/.test(audit.tekst));

    const f10 = alle.filter((w) => /\t/.test(w.tekst) || w.taken.length === 0 || w.taken.some((t) => t.stappen.length === 0 || !/runs-on: /.test(t.kop))).map((w) => w.n);
    check('keten-07: opmaak intact (geen tabs, elke taak heeft runs-on en stappen)', f10.length === 0, toon(f10));
  }

  rmSync(basis, { recursive: true, force: true });
  return einde();
}
