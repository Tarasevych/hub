// Snelle mailbox-wisselaar in de lijst (klacht van de eigenaar, 15.11.2026, telefoon, mail.…/postvak-in):
//   «хоч ми підключили ще один обліковий запис іншого сервісу, в цьому списку чомусь лише відображається перший … і список не поновлюється».
// Deel «ДО»: de oude regel (alleen Google-snapshot + /accounts/list) laat een IMAP-koppeling (Ukr.net) per constructie weg.
// Deel «ПІСЛЯ»: src/mail/mail-wisselaar-model.ts geeft Google + Microsoft + IMAP, zonder dubbele adressen, met eerlijke uitleg;
// de werkruimte vraagt /imap/aanbieders en ververst bij openen, bfcache-terugkeer, zichtbaarheid en de melding van het koppelvenster.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { wisselRijen, wisselUitleg, MAIL_ACCOUNTS_KANAAL } from '../../src/mail/mail-wisselaar-model';
import type { MailImapKoppelingPubliek } from '../../shared/mail-aanbieders';

const lees = (pad: string) => readFileSync(join(process.cwd(), pad), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-wisselaar-20261115');
  const google = [{ id: 'g1', email: 'eigenaar@example.test', displayName: 'Eigenaar', picture: '', accountRole: 'primary' as const }];
  const connectors = [{ id: 'm1', provider: 'microsoft', email: 'werk@example.test', status: 'connected' }, { id: 'm2', provider: 'microsoft', email: 'oud@example.test', status: 'disconnected' }];
  const imap: MailImapKoppelingPubliek[] = [
    { id: 'i1', aanbieder: 'ukrnet', adres: 'tweede@ukr.net', actief: true, mappen: 5, smtpGoed: true, laatstGoedOp: 1, fout: '', aangemaaktOp: 1 },
    { id: 'i2', aanbieder: 'gmail', adres: 'EIGENAAR@example.test', actief: true, mappen: 3, smtpGoed: true, laatstGoedOp: 1, fout: '', aangemaaktOp: 1 },
    { id: 'i3', aanbieder: 'iua', adres: 'derde@i.ua', actief: true, mappen: 0, smtpGoed: false, laatstGoedOp: 0, fout: 'MAIL_IMAP_AANMELDEN_GEWEIGERD', aangemaaktOp: 1 },
    { id: 'i4', aanbieder: 'yahoo', adres: 'weg@yahoo.com', actief: false, mappen: 0, smtpGoed: false, laatstGoedOp: 0, fout: '', aangemaaktOp: 1 },
  ];

  // ---------------------------------------------------------------- ДО: de oude filter van MailAccountBadge (letterlijk overgenomen)
  const oudExtra = (() => {
    const keys = new Set(google.map((a) => `google:${a.email.toLowerCase()}`));
    return connectors.filter((c) => !['revoked', 'disconnected'].includes(c.status) && !keys.has(`${c.provider}:${c.email.toLowerCase()}`));
  })();
  check('ДО: de oude wisselaar kende geen IMAP — Ukr.net kon nooit verschijnen', !oudExtra.some((c) => c.email === 'tweede@ukr.net'));

  // ---------------------------------------------------------------- ПІСЛЯ: model
  const rijen = wisselRijen({ taal: 'uk', google, connectors, imap });
  const adressen = rijen.map((r) => r.email.toLowerCase());
  check('ПІСЛЯ: Ukr.net (IMAP) staat in de lijst met naam en logo van de dienst',
    rijen.some((r) => r.soort === 'imap' && r.email === 'tweede@ukr.net' && r.dienst === 'Ukr.net' && r.merk === 'ukrnet' && r.stand.includes('Ukr.net')));
  check('ПІСЛЯ: Microsoft verschijnt, losgekoppelde Microsoft niet', adressen.includes('werk@example.test') && !adressen.includes('oud@example.test'));
  check('ПІСЛЯ: geen dubbel adres (Gmail via Google én IMAP → alleen de Google-rij, die kan worden geopend)',
    adressen.filter((a) => a === 'eigenaar@example.test').length === 1 && rijen.find((r) => r.email.toLowerCase() === 'eigenaar@example.test')?.soort === 'google');
  check('ПІСЛЯ: inactieve IMAP-koppeling niet in het menu', !adressen.includes('weg@yahoo.com'));
  check('ПІСЛЯ: volgorde — hoofd-Gmail eerst, dan Microsoft, dan IMAP', rijen[0].hoofd && rijen[0].soort === 'google' && rijen[1].soort === 'microsoft' && rijen.slice(2).every((r) => r.soort === 'imap'));
  // MAIL-IMAP-LEZEN-001 (15.11.2026, tweede klacht): IMAP kiezen = de berichten van die mailbox zien; alleen Microsoft gaat nog naar het beheer.
  check('ПІСЛЯ: Google en IMAP zijn kiesbaar (wisselen in de lijst); Microsoft opent het beheer',
    rijen.filter((r) => r.soort !== 'microsoft').every((r) => r.kiesbaar) && rijen.filter((r) => r.soort === 'microsoft').every((r) => !r.kiesbaar));
  const werkBron = lees('src/GoogleMailWerkruimte.tsx');
  check('ПІСЛЯ: werkruimte toont ImapPostvak voor de gekozen IMAP-mailbox en beide wisselaars krijgen onSelectImap',
    werkBron.includes('<ImapPostvak key={imapActiefId}') && (werkBron.match(/onSelectImap=\{setImapActiefId\}/g) || []).length === 2 && (werkBron.match(/setImapActiefId\(''\);void selectAccount\(id\)/g) || []).length === 2);
  const fout = rijen.find((r) => r.email === 'derde@i.ua')!;
  check('ПІСЛЯ: een IMAP-fout vraagt aandacht en de uitleg zegt wat er gebeurt (uk + nl)', fout.aandacht && wisselUitleg(fout, 'uk').includes('сторінку облікових записів') && wisselUitleg(fout, 'nl').includes('accountpagina'));
  const nl = wisselRijen({ taal: 'nl', google, connectors, imap });
  check('ПІСЛЯ: Nederlandse standen', nl.some((r) => r.stand === 'primair') && nl.some((r) => r.stand.includes('gekoppeld')));
  check('ПІСЛЯ: geen geheimen of tellers in de rijen', !JSON.stringify(rijen).match(/wachtwoord|geheim|password/i));

  // ---------------------------------------------------------------- ПІСЛЯ: bedrading in de echte bronnen
  const werk = lees('src/GoogleMailWerkruimte.tsx'), badge = lees('src/MailAccountBadge.tsx'), wissel = lees('src/MailAccountWisselaar.tsx');
  const venster = lees('src/mail/MailKoppelVenster.tsx'), hub = lees('src/MailAccountsHub.tsx');
  check('werkruimte vraagt /imap/aanbieders en geeft imap door aan beide wisselaars',
    werk.includes("'/api/owner/mail/imap/aanbieders'") && (werk.match(/imap=\{imapKoppelingen\}/g) || []).length === 2);
  check('werkruimte ververst bij openen van het menu en luistert naar bfcache/zichtbaarheid/meldingen',
    (werk.match(/onOpen=\{\(\)=>mailboxRefreshRef\.current\.fn\(\)\}/g) || []).length === 2 && werk.includes('luisterMailAccounts(') && werk.includes('const refreshMailboxes='));
  check('beide wisselaars gebruiken het gedeelde model (geen eigen filter meer)', badge.includes('wisselRijen(') && wissel.includes('wisselRijen(') && !badge.includes("['revoked', 'disconnected']"));
  // 16.11.2026 (klacht eigenaar): tijdens het laden stond «Перевіряємо підключення Gmail», ook bij Ukr.net/Outlook.
  check('laadtekst van de mailpagina noemt geen Gmail meer (controleert alle mailboxen)',
    !werk.includes('Перевіряємо підключення Gmail') && werk.includes('Перевіряємо підключені поштові скриньки') && !werk.includes('Не вдалося перевірити підключення Gmail'));
  check('koppelvenster en accountpagina melden een wijziging', venster.includes('meldMailAccountsGewijzigd()') && hub.includes('meldMailAccountsGewijzigd()'));

  // ---------------------------------------------------------------- ПІСЛЯ: verversen (luisteraar) in een nagebootst venster
  const { luisterMailAccounts, meldMailAccountsGewijzigd } = await import('../../src/mail/mail-wisselaar-model');
  const doelen = new Map<string, Set<(e: unknown) => void>>();
  const doel = () => ({
    addEventListener: (n: string, f: (e: unknown) => void) => { if (!doelen.has(n)) doelen.set(n, new Set()); doelen.get(n)!.add(f); },
    removeEventListener: (n: string, f: (e: unknown) => void) => { doelen.get(n)?.delete(f); },
    dispatchEvent: (e: { type: string }) => { for (const f of doelen.get(e.type) || []) f(e); return true; },
  });
  const g = globalThis as Record<string, unknown>;
  const oudWindow = g.window, oudDocument = g.document, oudLocal = g.localStorage;
  g.window = doel();
  g.document = { ...doel(), visibilityState: 'visible' };
  g.localStorage = { setItem: () => undefined };
  let tel = 0;
  const stop = luisterMailAccounts(() => { tel += 1; });
  meldMailAccountsGewijzigd();
  (g.window as { dispatchEvent: (e: unknown) => void }).dispatchEvent({ type: 'pageshow', persisted: true });
  (g.window as { dispatchEvent: (e: unknown) => void }).dispatchEvent({ type: 'pageshow', persisted: false });
  (g.document as { dispatchEvent: (e: unknown) => void }).dispatchEvent({ type: 'visibilitychange' });
  await new Promise((r) => setTimeout(r, 20)); // BroadcastChannel levert asynchroon
  const naMelding = tel;
  stop();
  meldMailAccountsGewijzigd();
  await new Promise((r) => setTimeout(r, 20));
  check(`luisteraar ververst bij melding (zelfde tab), bfcache-terugkeer en zichtbaarheid; niet bij gewone pageshow; stil na stop (tel ${naMelding} → ${tel})`,
    naMelding === 3 && tel === 3 && MAIL_ACCOUNTS_KANAAL.length > 0);
  g.window = oudWindow; g.document = oudDocument; g.localStorage = oudLocal;
  return einde();
}
