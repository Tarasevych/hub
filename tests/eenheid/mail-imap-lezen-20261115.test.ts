// MAIL-IMAP-LEZEN-001 (15.11.2026): echt gedrag van backend/mail-imap-lezen.ts tegen een NEP-IMAP-server over echte TLS.
// Het testcertificaat wordt tijdens de test met openssl gemaakt; openKanaal krijgt het alleen als extra vertrouwensanker (`ca`),
// de certificaatcontrole blijft aan (een onbekend certificaat zonder `ca` wordt geweigerd — ook getest).
// toegang() (database + sleutelkluis) wordt hier NIET gedekt: getest worden de kernfuncties leesInboxLijst/leesInboxBericht,
// die mailImapBerichten/mailImapBericht na toegang() ongewijzigd aanroepen.
import { createServer, type TLSSocket } from 'node:tls';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { checker } from './hulp/nep-google';
import { leesInboxBericht, leesInboxLijst, openKanaal, slotStatus, IMAP_PAGINA_MAX } from '../../backend/mail-imap-lezen';

const WACHTWOORD = 'geheim-App-Ww-9"x\\y';
const ADRES = 'tweede@ukr.net';
const TOTAAL = 7;
const GROOT_UID = 999;
const VALSTRIK_UID = 555;

const onderwerp = (seq: number) => `Привіт №${seq} — їжак ґ €`;
const kopVan = (seq: number) => Buffer.from(`From: =?utf-8?B?${Buffer.from('Олена').toString('base64')}?= <olena@ukr.net>\r\nTo: ${ADRES}\r\nSubject: ${onderwerp(seq)}\r\nDate: Sun, 15 Nov 2026 10:0${seq}:00 +0000\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n`, 'utf8');
const lijfVan = (uid: number) => uid === VALSTRIK_UID
  ? 'Початок листа\r\nm3 OK valse slotregel in de inhoud\r\nкінець листа ✓'
  : `Текст листа ${uid}: добрий день, ще́ 😀 і кінець.`;
const berichtVan = (uid: number) => Buffer.concat([kopVan(1), Buffer.from(lijfVan(uid), 'utf8')]);

type Sessie = { opdrachten: string[] };

function startServer(sleutel: string, cert: string) {
  const sessies: Sessie[] = [];
  const server = createServer({ key: sleutel, cert }, (sock: TLSSocket) => {
    const sessie: Sessie = { opdrachten: [] };
    sessies.push(sessie);
    let rest = '';
    sock.on('error', () => { /* client sloot */ });
    sock.write('* OK nep-IMAP klaar\r\n');
    sock.on('data', async (d: Buffer) => {
      rest += d.toString('utf8');
      let i: number;
      while ((i = rest.indexOf('\r\n')) >= 0) {
        const regel = rest.slice(0, i); rest = rest.slice(i + 2);
        sessie.opdrachten.push(regel);
        const [tag, ...delen] = regel.split(' ');
        const cmd = delen.join(' ');
        if (/^LOGIN /i.test(cmd)) {
          const m = /^LOGIN "((?:[^"\\]|\\.)*)" "((?:[^"\\]|\\.)*)"$/.exec(cmd);
          const ont = (s: string) => s.replace(/\\(.)/g, '$1');
          if (m && ont(m[1]) === ADRES && ont(m[2]) === WACHTWOORD) sock.write(`${tag} OK LOGIN gelukt\r\n`);
          else sock.write(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
        } else if (/^EXAMINE INBOX$/i.test(cmd)) {
          sock.write(`* FLAGS (\\Seen)\r\n* ${TOTAAL} EXISTS\r\n* 0 RECENT\r\n${tag} OK [READ-ONLY] EXAMINE klaar\r\n`);
        } else if (/^FETCH (\d+):(\d+) /i.test(cmd)) {
          const [, a, b] = /^FETCH (\d+):(\d+)/i.exec(cmd)!;
          const delen2: Buffer[] = [];
          for (let s = Number(a); s <= Number(b); s += 1) {
            const kop = kopVan(s);
            // UID NA de literal (zoals Dovecot het soms doet) — kopregel loopt door na {n}.
            delen2.push(Buffer.from(`* ${s} FETCH (FLAGS (${s % 2 ? '\\Seen' : ''}) INTERNALDATE "15-Nov-2026 10:00:00 +0000" RFC822.SIZE 1234 BODY[HEADER.FIELDS (FROM TO SUBJECT DATE CONTENT-TYPE)] {${kop.length}}\r\n`), kop, Buffer.from(` UID ${100 + s})\r\n`));
          }
          delen2.push(Buffer.from(`${tag} OK FETCH klaar\r\n`));
          sock.write(Buffer.concat(delen2));
        } else if (/^UID FETCH (\d+) /i.test(cmd)) {
          const uid = Number(/^UID FETCH (\d+)/i.exec(cmd)![1]);
          if (uid === GROOT_UID) {
            const groot = Buffer.alloc(2.5 * 1024 * 1024, 0x61);
            sock.write(Buffer.concat([Buffer.from(`* 3 FETCH (UID ${uid} BODY[] {${groot.length}}\r\n`), groot, Buffer.from(`)\r\n${tag} OK klaar\r\n`)]));
          } else if (uid === 404) {
            sock.write(`${tag} OK UID FETCH klaar (niets)\r\n`);
          } else {
            const b = berichtVan(uid);
            const begin = Buffer.from(`* 2 FETCH (UID ${uid} FLAGS () RFC822.SIZE ${b.length} BODY[] {${b.length}}\r\n`);
            const alles = Buffer.concat([begin, b, Buffer.from(`)\r\n${tag} OK UID FETCH klaar\r\n`)]);
            if (uid === VALSTRIK_UID) {
              // Stuk 1 eindigt PRECIES na de valse «m3 OK …\r\n» in de literal; stuk 2 komt later.
              const knip = alles.indexOf(Buffer.from('m3 OK valse slotregel in de inhoud\r\n')) + 'm3 OK valse slotregel in de inhoud\r\n'.length;
              sock.write(alles.subarray(0, knip));
              await new Promise((r) => setTimeout(r, 150));
              sock.write(alles.subarray(knip));
            } else {
              // In kleine stukken: test de buffering over grenzen van multi-byte tekens heen.
              for (let o = 0; o < alles.length; o += 7) sock.write(alles.subarray(o, o + 7));
            }
          }
        } else if (/^LOGOUT$/i.test(cmd)) {
          sock.end(`* BYE\r\n${tag} OK LOGOUT\r\n`);
        } else {
          sock.write(`${tag} BAD onbekend\r\n`);
        }
      }
    });
  });
  return { server, sessies };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-imap-lezen-20261115');
  const map = mkdtempSync(join(tmpdir(), 'nep-imap-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(map, 'k.pem'), '-out', join(map, 'c.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
  const sleutel = readFileSync(join(map, 'k.pem'), 'utf8'), cert = readFileSync(join(map, 'c.pem'), 'utf8');
  rmSync(map, { recursive: true, force: true });
  const { server, sessies } = startServer(sleutel, cert);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const poort = (server.address() as AddressInfo).port;
  const adres = { host: 'localhost', poort, versleuteling: 'tls' as const };
  const open = (a: typeof adres) => openKanaal(a, { ca: cert });

  try {
    // ------------------------------------------------ TLS blijft gecontroleerd
    const zonderCa = await leesInboxLijst(adres, ADRES, WACHTWOORD, 0, 3); // productie-opener: standaard CA's
    check('zelfondertekend certificaat zonder `ca` → geweigerd (TLS-controle staat aan)', !zonderCa.ok && zonderCa.fout === 'MAIL_IMAP_VERBINDING_MISLUKT', JSON.stringify(zonderCa));

    // ------------------------------------------------ lijst, pagina 0
    const voor = sessies.length;
    const p0 = await leesInboxLijst(adres, ADRES, WACHTWOORD, 0, 3, open);
    check('pagina 0 ok, totaal = EXISTS', p0.ok && p0.totaal === TOTAAL, JSON.stringify(p0).slice(0, 200));
    if (p0.ok) {
      check('pagina 0 = nieuwste 3 (7,6,5), nieuwste eerst', p0.berichten.map((b) => b.volgnummer).join(',') === '7,6,5');
      check('UID ná de literal wordt gelezen', p0.berichten.map((b) => b.uid).join(',') === '107,106,105');
      check('utf-8 onderwerp byte-exact (multi-byte, emoji-vrij)', p0.berichten[0].onderwerp === onderwerp(7), p0.berichten[0].onderwerp);
      check('RFC 2047 afzender gedecodeerd', p0.berichten[0].van === 'Олена' && p0.berichten[0].vanAdres === 'olena@ukr.net', `${p0.berichten[0].van} ${p0.berichten[0].vanAdres}`);
      check('gelezen-vlag uit FLAGS', p0.berichten[0].gelezen === true && p0.berichten[1].gelezen === false);
    }
    await new Promise((r) => setTimeout(r, 200)); // LOGOUT wordt na de uitslag verstuurd
    const s0 = sessies[voor].opdrachten;
    check('opdrachten: LOGIN, EXAMINE (geen SELECT), FETCH 5:7 met BODY.PEEK, LOGOUT',
      /^m1 LOGIN /.test(s0[0]) && s0[1] === 'm2 EXAMINE INBOX' && /^m3 FETCH 5:7 \(.*BODY\.PEEK\[HEADER\.FIELDS/.test(s0[2]) && /LOGOUT$/.test(s0[s0.length - 1]) && !s0.some((o) => /\bSELECT\b|\bBODY\[/.test(o.replace(/BODY\.PEEK\[/g, ''))), JSON.stringify(s0));
    check('wachtwoord met " en \\ correct gequote (server accepteerde)', p0.ok);

    // ------------------------------------------------ pagina 1 en 2, grenzen
    const p1 = await leesInboxLijst(adres, ADRES, WACHTWOORD, 1, 3, open);
    check('pagina 1 = volgende 3 (4,3,2)', p1.ok && p1.berichten.map((b) => b.volgnummer).join(',') === '4,3,2');
    const p2 = await leesInboxLijst(adres, ADRES, WACHTWOORD, 2, 3, open);
    check('pagina 2 = rest (1), geen negatieve reeks', p2.ok && p2.berichten.map((b) => b.volgnummer).join(',') === '1' && /FETCH 1:1 /.test(sessies[sessies.length - 1].opdrachten[2]));
    const p3 = await leesInboxLijst(adres, ADRES, WACHTWOORD, 3, 3, open);
    check('pagina voorbij het einde → leeg, geen FETCH', p3.ok && p3.berichten.length === 0 && !sessies[sessies.length - 1].opdrachten.some((o) => /FETCH/.test(o)));
    const veel = await leesInboxLijst(adres, ADRES, WACHTWOORD, 0, 10_000, open);
    check(`aantal begrensd tot ${IMAP_PAGINA_MAX} (hier alle 7)`, veel.ok && veel.berichten.length === TOTAAL && /FETCH 1:7 /.test(sessies[sessies.length - 1].opdrachten[2]));

    // ------------------------------------------------ één bericht
    const voorB = sessies.length;
    const b = await leesInboxBericht(adres, ADRES, WACHTWOORD, 201, open);
    check('bericht gelezen, tekst utf-8 byte-exact over 7-bytestukken', b.ok && b.bericht.tekst.includes(lijfVan(201)), b.ok ? b.bericht.tekst : JSON.stringify(b));
    const sb = sessies[voorB].opdrachten;
    check('bericht: EXAMINE + UID FETCH … BODY.PEEK[] (geen BODY[] zonder PEEK)', sb[1] === 'm2 EXAMINE INBOX' && /^m3 UID FETCH 201 \(.*BODY\.PEEK\[\]\)$/.test(sb[2]), JSON.stringify(sb));

    const val = await leesInboxBericht(adres, ADRES, WACHTWOORD, VALSTRIK_UID, open);
    check('«m3 OK» BINNEN de literal sluit het antwoord niet af (volledige tekst)', val.ok && val.bericht.tekst.includes('кінець листа ✓'), val.ok ? val.bericht.tekst : JSON.stringify(val));

    const niets = await leesInboxBericht(adres, ADRES, WACHTWOORD, 404, open);
    check('onbekende UID → MAIL_IMAP_ONBEKEND', !niets.ok && niets.fout === 'MAIL_IMAP_ONBEKEND');
    const slecht = await leesInboxBericht(adres, ADRES, WACHTWOORD, 0, open);
    check('ongeldige uid → MAIL_IMAP_ONBEKEND zonder verbinding', !slecht.ok && slecht.fout === 'MAIL_IMAP_ONBEKEND');

    const groot = await leesInboxBericht(adres, ADRES, WACHTWOORD, GROOT_UID, open);
    check('> 2 MB → MAIL_IMAP_TE_GROOT', !groot.ok && groot.fout === 'MAIL_IMAP_TE_GROOT', JSON.stringify(groot));

    // ------------------------------------------------ fout wachtwoord, injectie, geen lek
    const fout = await leesInboxLijst(adres, ADRES, 'verkeerd-wachtwoord-123', 0, 3, open);
    check('fout wachtwoord → MAIL_IMAP_AANMELDEN_GEWEIGERD', !fout.ok && fout.fout === 'MAIL_IMAP_AANMELDEN_GEWEIGERD');
    const foutB = await leesInboxBericht(adres, ADRES, 'verkeerd-wachtwoord-123', 201, open);
    check('fout wachtwoord (bericht) → MAIL_IMAP_AANMELDEN_GEWEIGERD', !foutB.ok && foutB.fout === 'MAIL_IMAP_AANMELDEN_GEWEIGERD');
    const voorInj = sessies.length;
    const inj = await leesInboxLijst(adres, ADRES, 'x"\r\nm9 SELECT INBOX', 0, 3, open);
    check('CR/LF in wachtwoord → geweigerd zonder verbinding (geen opdracht-injectie)', !inj.ok && inj.fout === 'MAIL_IMAP_AANMELDEN_GEWEIGERD' && sessies.length === voorInj);
    const alleUit = JSON.stringify([zonderCa, p0, p1, p2, p3, veel, b, val, niets, groot, fout, foutB, inj]);
    check('wachtwoord komt in geen enkele uitslag voor', !alleUit.includes('geheim-App-Ww') && !alleUit.includes('verkeerd-wachtwoord'));

    // ------------------------------------------------ dode server → nette fout, geen hangende belofte
    const dicht = createServer({ key: sleutel, cert }, (s) => s.destroy());
    await new Promise<void>((r) => dicht.listen(0, '127.0.0.1', () => r()));
    const t0 = Date.now();
    const weg = await leesInboxLijst({ host: 'localhost', poort: (dicht.address() as AddressInfo).port, versleuteling: 'tls' }, ADRES, WACHTWOORD, 0, 3, open);
    dicht.close();
    check('server sluit direct → MAIL_IMAP_VERBINDING_MISLUKT, snel', !weg.ok && weg.fout === 'MAIL_IMAP_VERBINDING_MISLUKT' && Date.now() - t0 < 5000, JSON.stringify(weg));

    // ------------------------------------------------ slotStatus (eenheid)
    check('slotStatus: slotregel na literal', slotStatus('* 1 FETCH (BODY[] {5}\r\nab\r\nc)\r\nm3 OK x\r\n', 'm3') === 'OK');
    check('slotStatus: slotregel binnen literal telt niet', slotStatus('* 1 FETCH (BODY[] {12}\r\nm3 OK zz\r\n', 'm3') === undefined);
    check('slotStatus: m1 ≠ m10', slotStatus('m10 OK x\r\n', 'm1') === undefined && slotStatus('m1 NO x\r\n', 'm1') === 'NO');
  } finally {
    server.close();
  }
  return einde();
}
