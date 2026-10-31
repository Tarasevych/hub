// Regels voor «перевірений / неперевірений / підозрілий відправник» in de mail (audit 18.10.2026, artefact-draad f252547a).
// Puur (geen I/O): dezelfde code beslist op de server (backend/mail-afzenders.ts) en wordt in tests/eenheid/mail-afzenders.test.ts
// los getest.
//
// Kern (zo streng mogelijk, nooit «ziet er officieel uit»):
//  geverifieerd  — (a) de gebruiker bevestigde dit adres zelf (bron «handmatig»), of
//                  (b) het From-domein staat in de gecureerde lijst (shared/mail-bekende-afzenders.ts) ÉN de bovenste
//                      Authentication-Results van een vertrouwde ontvangende server (mx.google.com) zegt dmarc=pass voor
//                      precies dat domein (header.from), of dkim=pass met een handtekening van hetzelfde organisatiedomein
//                      (bron «bekende-dienst»).
//  verdacht      — de weergavenaam gebruikt een merk (PayPal, ING …) terwijl het domein niet van dat merk is; de weergavenaam
//                  bevat zelf een ander e-mailadres; het domein lijkt op een merkdomein (paypa1.com, paypal-security.net,
//                  paypal.com.evil.ru); de naam is die van een bevestigd contact maar het adres is anders; of een bekend
//                  merkdomein met dmarc=fail bij de vertrouwde server.
//  onbekend      — al het andere. Niet verborgen: naam én adres zichtbaar, met een oranje pastille.
// «authenticatie» als bron is gereserveerd en wordt nooit automatisch gezet (een geslaagde DMARC alleen bewijst enkel dat het
// domein klopt, niet dat het domein te vertrouwen is).
import { BEKENDE_DIENSTEN, GRATIS_MAILBOXEN, LIJST_HERZIEN, VERTROUWDE_AUTHSERV, type BekendeDienst } from './mail-bekende-afzenders';

export type AfzenderStatus = 'geverifieerd' | 'onbekend' | 'verdacht';
export type AfzenderBron = 'handmatig' | 'bekende-dienst' | 'authenticatie';
export const AFZENDER_STATUSSEN: readonly AfzenderStatus[] = ['geverifieerd', 'onbekend', 'verdacht'];

export type AuthUitslag = 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'temperror' | 'permerror' | 'policy' | '';
export type AuthResultaten = {
  /** Was er een Authentication-Results van een vertrouwde server? Zonder: alle velden leeg en niets telt. */
  betrouwbaar: boolean;
  authserv: string;
  spf: AuthUitslag; spfDomein: string;
  dkim: Array<{ uitslag: AuthUitslag; domein: string }>;
  dmarc: AuthUitslag; dmarcDomein: string;
  /** ARC (doorgestuurde mail: de keten van tussenliggende servers) volgens de eigen ontvangende server. Alleen informatief. */
  arc?: AuthUitslag;
};
export const GEEN_AUTH: AuthResultaten = Object.freeze({ betrouwbaar: false, authserv: '', spf: '', spfDomein: '', dkim: [], dmarc: '', dmarcDomein: '', arc: '' }) as AuthResultaten;

// ------------------------------------------------------------------------------------------------ adres
// Domeinlabels: letters/cijfers (ook Unicode — internationale domeinen, waarin homogliefen zitten) en koppeltekens.
const ADRES = /^[^\s@<>"(),;:]{1,64}@[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,62}[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,62}[\p{L}\p{N}])?)+$/u;

/** Punycode (RFC 3492) ontcijferen: «xn--80ak6aa92e.com» → Unicode, zodat een homoglief-domein vergeleken kan worden. */
export function vanPunycode(label: string): string {
  if (!label.startsWith('xn--')) return label;
  const invoer = label.slice(4), basis = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
  const uit: number[] = []; let n = 128, i = 0, bias = 72;
  const grens = invoer.lastIndexOf('-');
  if (grens > 0) for (const c of invoer.slice(0, grens)) uit.push(c.charCodeAt(0));
  const cijfer = (c: number) => (c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : basis);
  const aanpassen = (delta: number, aantal: number, eerste: boolean) => { let k = 0; delta = eerste ? Math.floor(delta / damp) : delta >> 1; delta += Math.floor(delta / aantal);
    for (; delta > ((basis - tMin) * tMax) >> 1; k += basis) delta = Math.floor(delta / (basis - tMin)); return Math.floor(k + ((basis - tMin + 1) * delta) / (delta + skew)); };
  for (let p = grens > 0 ? grens + 1 : 0; p < invoer.length;) {
    const oud = i;
    for (let w = 1, k = basis; ; k += basis) {
      if (p >= invoer.length) return label;
      const d = cijfer(invoer.charCodeAt(p++)); if (d >= basis) return label;
      i += d * w; const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (d < t) break; w *= basis - t;
    }
    bias = aanpassen(i - oud, uit.length + 1, oud === 0); n += Math.floor(i / (uit.length + 1)); i %= uit.length + 1;
    uit.splice(i++, 0, n);
  }
  try { return String.fromCodePoint(...uit); } catch { return label; }
}
const unicodeDomein = (d: string) => d.split('.').map(vanPunycode).join('.');
export const geldigAdres = (v: string) => v.length <= 254 && ADRES.test(v);
export const normaliseerAdres = (v: unknown) => String(v ?? '').trim().replace(/^<|>$/g, '').toLowerCase();

/** «Naam <a@b>», «a@b», «"Naam, X" <a@b>» → naam + adres + domein. Onbruikbaar → adres ''. */
export function adresVan(from: unknown): { naam: string; adres: string; domein: string } {
  const ruw = String(from ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 1500);
  const m = /^(.*?)\s*<([^<>]+)>\s*$/.exec(ruw);
  let adres = normaliseerAdres(m ? m[2] : (/^\S+@\S+$/.test(ruw) ? ruw : ''));
  let naam = (m ? m[1] : (adres ? '' : ruw)).trim().replace(/^"(.*)"$/s, '$1').replace(/\\(.)/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!geldigAdres(adres)) adres = '';
  const domein = adres ? adres.slice(adres.lastIndexOf('@') + 1) : '';
  if (naam && naam.toLowerCase() === adres) naam = '';
  return { naam, adres, domein };
}
/** Adreslijst uit To/Cc/Bcc («A <a@x>, "B, C" <b@y>, c@z»): komma's binnen aanhalingstekens of <> splitsen niet. Max 100. */
export function adressenVan(kop: unknown): Array<{ naam: string; adres: string; domein: string }> {
  const ruw = String(kop ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 20000);
  const delen: string[] = []; let huidig = '', quote = false, hoek = 0;
  for (let i = 0; i < ruw.length; i++) {
    const c = ruw[i];
    if (c === '\\' && quote) { huidig += c + (ruw[i + 1] ?? ''); i++; continue; }
    if (c === '"') quote = !quote; else if (!quote && c === '<') hoek++; else if (!quote && c === '>') hoek = Math.max(0, hoek - 1);
    if ((c === ',' || c === ';') && !quote && !hoek) { delen.push(huidig); huidig = ''; continue; }
    huidig += c;
  }
  delen.push(huidig);
  const uit: Array<{ naam: string; adres: string; domein: string }> = [], gezien = new Set<string>();
  for (const d of delen) { const a = adresVan(d.trim()); if (a.adres && !gezien.has(a.adres)) { gezien.add(a.adres); uit.push(a); } if (uit.length >= 100) break; }
  return uit;
}

// ------------------------------------------------------------------------------------------------ domeinen
// Tweede-niveau-achtervoegsels waarvoor het organisatiedomein drie labels heeft (bewust klein: alleen wat in onze lijst en regio voorkomt).
const DRIE_LABELS = new Set(['co.uk', 'org.uk', 'ac.uk', 'com.be', 'com.ua', 'org.ua', 'gov.ua', 'in.ua', 'kiev.ua', 'kyiv.ua', 'net.ua', 'com.au', 'co.nz', 'com.br', 'co.jp', 'com.tr', 'com.pl']);
export function organisatieDomein(domein: string): string {
  const d = domein.toLowerCase().replace(/\.$/, '');
  const delen = d.split('.').filter(Boolean);
  if (delen.length <= 2) return delen.join('.');
  const laatsteTwee = delen.slice(-2).join('.');
  return DRIE_LABELS.has(laatsteTwee) ? delen.slice(-3).join('.') : laatsteTwee;
}
const onderOf = (domein: string, basis: string) => domein === basis || domein.endsWith(`.${basis}`);

export function bekendeDienstVoor(domein: string): BekendeDienst | null {
  const d = domein.toLowerCase();
  if (!d || GRATIS_MAILBOXEN.includes(d)) return null;
  for (const dienst of BEKENDE_DIENSTEN) for (const x of dienst.domeinen) {
    if (d === x.domein || (x.subdomeinen && d.endsWith(`.${x.domein}`))) return dienst;
  }
  return null;
}
/** Hoort dit domein bij het merk (ook voor de imitatiecontrole: subdomeinen van een merkdomein zijn nooit «lookalike»)? */
const vanMerk = (dienst: BekendeDienst, domein: string) => dienst.domeinen.some((x) => onderOf(domein, x.domein));

// Verwarrende tekens: cijfers/symbolen die op letters lijken en Cyrillische homogliefen → Latijn, zodat «paypa1», «ԁ» … vergelijkbaar worden.
const VERWARRING: Record<string, string> = { '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '|': 'l', 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ԁ': 'd', 'ɡ': 'g', 'ν': 'v', 'ο': 'o', 'α': 'a' };
export const ontwar = (s: string) => s.normalize('NFKC').toLowerCase().replace(/rn/g, 'm').replace(/vv/g, 'w').split('').map((c) => VERWARRING[c] ?? c).join('');
function afstand(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const v = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let vorige = v[0]; v[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = v[j]; v[j] = Math.min(v[j] + 1, v[j - 1] + 1, vorige + (a[i - 1] === b[j - 1] ? 0 : 1)); vorige = tmp; }
  }
  return v[b.length];
}
/** Lijkt het domein op een merkdomein zonder ervan te zijn? Geeft het merk terug. */
export function lijktOpMerk(domein: string): BekendeDienst | null {
  const d = domein.toLowerCase();
  if (!d || bekendeDienstVoor(d) || GRATIS_MAILBOXEN.includes(d)) return null;
  const u = unicodeDomein(d), org = organisatieDomein(u), orgLabel = ontwar(org.split('.')[0] || '');
  const labels = u.split('.').map(ontwar);
  for (const dienst of BEKENDE_DIENSTEN) {
    if (vanMerk(dienst, d) || dienst.lijktOp === false) continue;
    for (const x of dienst.domeinen) {
      const merkLabel = x.domein.split('.')[0];
      if (merkLabel.length < 4) { if (orgLabel === merkLabel && org !== x.domein) return dienst; continue; } // ing.xyz, kbc.top
      if (orgLabel === merkLabel) return dienst;                                                            // paypa1.com → paypal
      if (merkLabel.length >= 6 && afstand(orgLabel, merkLabel) === 1) return dienst;                        // paypai.com (≥ 6 letters: «digit» ≠ DigiD)
      if (orgLabel.split('-').includes(merkLabel)) return dienst;                                           // paypal-security.net
      if (labels.slice(0, -1).some((l) => l === merkLabel) && !vanMerk(dienst, d)) {                        // paypal.com.evil.ru
        if (d.includes(`${x.domein}.`)) return dienst;
      }
    }
  }
  return null;
}

/** Een label dat Latijnse letters mengt met Cyrillische of Griekse (раураl, gооgle) — echte internationale domeinen gebruiken
 *  één schrift per label. Punycode wordt eerst ontcijferd. */
export function gemengdSchrift(domein: string): boolean {
  return unicodeDomein(domein.toLowerCase()).split('.').some((l) => /\p{Script=Latin}/u.test(l) && /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(l));
}

/** Alle merken die de weergavenaam noemt (hele woorden; «=WOORD» hoofdlettergevoelig). «Amazon Web Services» noemt zowel
 *  Amazon als AWS: het adres is dan echt als het bij één van die merken hoort. */
export function merkenInNaam(naam: string): BekendeDienst[] {
  if (!naam) return [];
  const woorden = ` ${ontwar(naam).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
  const ruw = ` ${naam.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
  return BEKENDE_DIENSTEN.filter((dienst) => dienst.merkWoorden.some((w) => (w.startsWith('=') ? ruw.includes(` ${w.slice(1)} `) : woorden.includes(` ${ontwar(w)} `))));
}
export const merkInNaam = (naam: string): BekendeDienst | null => merkenInNaam(naam)[0] || null;

// ------------------------------------------------------------------------------------------------ Authentication-Results
const UITSLAGEN = new Set(['pass', 'fail', 'softfail', 'neutral', 'none', 'temperror', 'permerror', 'policy']);
const uitslag = (v: string): AuthUitslag => (UITSLAGEN.has(v) ? v as AuthUitslag : '');
/** Збережений доказ (bewijs.laatste) тримає рядки; перед повторною оцінкою їх треба звірити з переліком AuthUitslag. · Opgeslagen bewijs bevat strings. */
export const authUitslag = uitslag;
/** Alleen de BOVENSTE Authentication-Results (= toegevoegd door de eigen ontvangende server) telt, en alleen als die server in
 *  VERTROUWDE_AUTHSERV staat. Lagere/andere kopregels kan de afzender zelf meesturen (vervalsing) en worden genegeerd. */
export function parseAuthResults(kopregels: readonly string[] | undefined, vertrouwd: readonly string[] = VERTROUWDE_AUTHSERV): AuthResultaten {
  const eerste = (kopregels || []).map((h) => String(h || '').replace(/\s+/g, ' ').trim()).find(Boolean);
  if (!eerste) return { ...GEEN_AUTH, dkim: [] };
  const authserv = (/^([A-Za-z0-9.-]+)/.exec(eerste)?.[1] || '').toLowerCase();
  if (!vertrouwd.includes(authserv)) return { ...GEEN_AUTH, dkim: [], authserv };
  const delen = eerste.slice(authserv.length).split(';').map((s) => s.trim()).filter(Boolean);
  const uit: AuthResultaten = { betrouwbaar: true, authserv, spf: '', spfDomein: '', dkim: [], dmarc: '', dmarcDomein: '' };
  for (const deel of delen) {
    const m = /^(spf|dkim|dmarc)\s*=\s*([a-z]+)/i.exec(deel);
    if (!m) continue;
    const soort = m[1].toLowerCase(), r = uitslag(m[2].toLowerCase());
    if (soort === 'spf' && !uit.spf) { uit.spf = r; uit.spfDomein = ((/smtp\.mailfrom=(?:[^@\s;]*@)?([A-Za-z0-9.-]+)/i.exec(deel)?.[1]) || '').toLowerCase(); }
    else if (soort === 'dkim') uit.dkim.push({ uitslag: r, domein: ((/header\.(?:i|d)=@?(?:[^@\s;]*@)?([A-Za-z0-9.-]+)/i.exec(deel)?.[1]) || '').toLowerCase() });
    else if (soort === 'dmarc' && !uit.dmarc) { uit.dmarc = r; uit.dmarcDomein = ((/header\.from=([A-Za-z0-9.-]+)/i.exec(deel)?.[1]) || '').toLowerCase(); }
  }
  const arc = /(?:^|;)\s*arc\s*=\s*([a-z]+)/i.exec(eerste.slice(authserv.length));
  uit.arc = arc ? uitslag(arc[1].toLowerCase()) : '';
  return uit;
}
/** Geslaagd en «aligned» met het From-domein: dmarc=pass voor dat domein, of dkim=pass van hetzelfde organisatiedomein. */
export function authGeslaagdVoor(auth: AuthResultaten, domein: string): boolean {
  if (!auth.betrouwbaar || !domein) return false;
  if (auth.dmarc === 'pass' && auth.dmarcDomein && (auth.dmarcDomein === domein || organisatieDomein(auth.dmarcDomein) === organisatieDomein(domein))) return true;
  return auth.dmarc !== 'fail' && auth.dkim.some((k) => k.uitslag === 'pass' && k.domein && organisatieDomein(k.domein) === organisatieDomein(domein));
}
export const authMisluktVoor = (auth: AuthResultaten, domein: string) => auth.betrouwbaar && !!domein && auth.dmarc === 'fail' && (!auth.dmarcDomein || organisatieDomein(auth.dmarcDomein) === organisatieDomein(domein));

// ------------------------------------------------------------------------------------------------ classificeren
export type Classificatie = { status: AfzenderStatus; bron: AfzenderBron | null; reden: string; merk: string };
export type ClassificeerInvoer = {
  naam: string; adres: string; domein: string;
  auth?: AuthResultaten;
  /** Bevestigde contacten van DEZE gebruiker: naam (genormaliseerd) → adressen. Voor «naam van een contact, ander adres». */
  contacten?: ReadonlyMap<string, readonly string[]>;
};
export const naamSleutel = (naam: string) => ontwar(naam).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function classificeer(i: ClassificeerInvoer): Classificatie {
  const auth = i.auth || GEEN_AUTH;
  if (!i.adres) return { status: 'onbekend', bron: null, reden: 'GEEN_ADRES', merk: '' };
  const dienst = bekendeDienstVoor(i.domein);
  // 1. Imitatie gaat altijd voor (ook bij een geslaagde DMARC: die bewijst alleen dat het domein klopt).
  const ander = /[^\s@<>"]+@([a-z0-9.-]+\.[a-z]{2,})/i.exec(i.naam);
  if (ander && organisatieDomein(ander[1].toLowerCase()) !== organisatieDomein(i.domein)) return { status: 'verdacht', bron: null, reden: 'NAAM_BEVAT_ANDER_ADRES', merk: '' };
  const merken = merkenInNaam(i.naam);
  if (merken.length && !merken.some((m) => vanMerk(m, i.domein))) return { status: 'verdacht', bron: null, reden: 'NAAM_MERK_ANDER_DOMEIN', merk: merken[0].merk };
  const lijkt = lijktOpMerk(i.domein);
  if (lijkt) return { status: 'verdacht', bron: null, reden: 'DOMEIN_LIJKT_OP_MERK', merk: lijkt.merk };
  if (gemengdSchrift(i.domein)) return { status: 'verdacht', bron: null, reden: 'DOMEIN_GEMENGD_SCHRIFT', merk: '' };
  if (i.naam && i.contacten) {
    const adressen = i.contacten.get(naamSleutel(i.naam));
    // Live-audit 19.10 (F3): noreply@tm.openai.com (DKIM/SPF/DMARC pass, officieel domein) werd «підозрілий» omdat het contact
    // «OpenAI» een ander adres had. Zelfde organisatiedomein als een contactadres telt als hetzelfde contact; en een officieel
    // merkdomein met geslaagde, aligned controle is geen imitatie — die uitslag (stap 2) gaat dan voor.
    const org = organisatieDomein(i.domein);
    // Безкоштовна пошта — не одна організація: jan@gmail.com і ander@gmail.com з тим самим ім’ям не «той самий контакт».
    const gratisDomein = (d: string) => GRATIS_MAILBOXEN.includes(d.toLowerCase());
    const orgVanAdres = (a: string) => {
      const d = (a.split('@')[1] || '').toLowerCase();
      if (!d || gratisDomein(d)) return '';
      return organisatieDomein(d);
    };
    const zelfdeOrganisatie = !gratisDomein(i.domein) && (adressen || []).some((a) => { const o = orgVanAdres(a); return !!o && o === org; });
    const officieel = !!dienst && vanMerk(dienst, i.domein) && authGeslaagdVoor(auth, i.domein);
    // Підпис власним доменом (DMARC/DKIM aligned) доводить, що лист справді з цієї адреси, а не підробка контакту.
    const eigenHandtekening = authGeslaagdVoor(auth, i.domein);
    if (adressen && adressen.length && !adressen.includes(i.adres) && !zelfdeOrganisatie && !officieel && !eigenHandtekening) return { status: 'verdacht', bron: null, reden: 'NAAM_VAN_CONTACT_ANDER_ADRES', merk: '' };
  }
  // 2. Bekend merkdomein: alleen met een geslaagde, aligned controle van de eigen ontvangende server.
  if (dienst) {
    if (authMisluktVoor(auth, i.domein)) return { status: 'verdacht', bron: null, reden: 'DMARC_MISLUKT', merk: dienst.merk };
    if (authGeslaagdVoor(auth, i.domein)) return { status: 'geverifieerd', bron: 'bekende-dienst', reden: 'BEKENDE_DIENST_DMARC', merk: dienst.merk };
    return { status: 'onbekend', bron: null, reden: auth.betrouwbaar ? 'BEKENDE_DIENST_ZONDER_PASS' : 'BEKENDE_DIENST_ZONDER_AUTH', merk: dienst.merk };
  }
  return { status: 'onbekend', bron: null, reden: GRATIS_MAILBOXEN.includes(i.domein) ? 'GRATIS_MAILBOX' : 'NIET_BEVESTIGD', merk: '' };
}

/** Uitleg per reden-code (uk, nl) voor de pastille, het venster en de beheerlijst. */
export const AFZENDER_REDENEN: Record<string, [string, string]> = {
  HANDMATIG: ['Ви підтвердили цього відправника вручну.', 'U hebt deze afzender zelf bevestigd.'],
  BEKENDE_DIENST_DMARC: ['Офіційна адреса відомого сервісу, і Gmail підтвердив, що лист справді надіслано з цього домену (DMARC).', 'Officieel adres van een bekende dienst, en Gmail bevestigde dat het bericht echt van dit domein komt (DMARC).'],
  BEKENDE_DIENST_ZONDER_AUTH: ['Домен відомого сервісу, але перевірки доставки (DMARC) ще немає — тому поки не позначено як перевірений.', 'Domein van een bekende dienst, maar nog zonder bezorgcontrole (DMARC) — daarom nog niet als geverifieerd gemarkeerd.'],
  BEKENDE_DIENST_ZONDER_PASS: ['Домен відомого сервісу, але Gmail не підтвердив, що лист надіслано саме з нього.', 'Domein van een bekende dienst, maar Gmail bevestigde niet dat het bericht echt van dit domein komt.'],
  DMARC_MISLUKT: ['Лист видає себе за відомий сервіс, але перевірка Gmail (DMARC) не пройдена. Ймовірна підробка.', 'Het bericht doet zich voor als een bekende dienst, maar de controle van Gmail (DMARC) mislukte. Waarschijnlijk vervalst.'],
  NAAM_MERK_ANDER_DOMEIN: ['Ім’я відправника — назва відомого сервісу, а адреса з іншого домену. Можливе видавання себе за інший сервіс.', 'De afzendernaam is die van een bekende dienst, maar het adres komt van een ander domein. Mogelijke imitatie.'],
  NAAM_BEVAT_ANDER_ADRES: ['В імені відправника вписано іншу адресу, ніж та, з якої прийшов лист.', 'In de afzendernaam staat een ander adres dan waar het bericht vandaan komt.'],
  DOMEIN_LIJKT_OP_MERK: ['Домен схожий на домен відомого сервісу, але не є ним (підміна літер, зайві слова).', 'Het domein lijkt op dat van een bekende dienst, maar is het niet (verwisselde letters, extra woorden).'],
  NAAM_VAN_CONTACT_ANDER_ADRES: ['Ім’я збігається з вашим перевіреним контактом, але адреса інша.', 'De naam is die van een bevestigd contact, maar het adres is anders.'],
  GRATIS_MAILBOX: ['Адреса безкоштовної пошти — її може створити будь-хто. Перевірте вручну, якщо знаєте відправника.', 'Adres van een gratis mailbox — iedereen kan er een maken. Bevestig zelf als u de afzender kent.'],
  NIET_BEVESTIGD: ['Цього відправника ще не підтверджено. Видно ім’я й адресу, щоб ви могли вирішити самі.', 'Deze afzender is nog niet bevestigd. Naam en adres staan erbij, zodat u zelf kunt beslissen.'],
  INGETROKKEN: ['Перевірку відкликано.', 'De bevestiging is ingetrokken.'],
  MARKERING_OPGEHEVEN: ['Позначку «підозрілий» знято. Відправника ще не підтверджено.', 'De markering «verdacht» is opgeheven. De afzender is nog niet bevestigd.'],
  GEEN_ADRES: ['Адресу відправника не вдалося прочитати.', 'Het afzenderadres kon niet gelezen worden.'],
  DOMEIN_GEMENGD_SCHRIFT: ['У назві домену змішано латинські й кириличні (або грецькі) літери — типовий прийом підробки.', 'In de domeinnaam zijn Latijnse en Cyrillische (of Griekse) letters gemengd — een typische vervalsingstruc.'],
  HANDMATIG_VERDACHT: ['Ви самі позначили цього відправника як підозрілого.', 'U hebt deze afzender zelf als verdacht gemarkeerd.'],
};
export const redenTekst = (code: string, lang: 'uk' | 'nl') => (AFZENDER_REDENEN[code] || AFZENDER_REDENEN.NIET_BEVESTIGD)[lang === 'uk' ? 0 : 1];

// ================================================================================================ «Контакти й відправники» (19.10.2026)
// Bewijs per contact uit officiële bronnen. Puur: de server (backend/mail-afzenders.ts + backend/mail-afzender-bronnen.ts) vult
// de invoer, de browser toont het resultaat; tests/eenheid/mail-contacten.test.ts test het los.
//   (a) gmail      — Authentication-Results van de EIGEN ontvangende server (DKIM d= = From-domein, SPF, DMARC, ARC)
//   (b) dns        — DNS van het domein zelf (MX, SPF-record, DMARC-record + beleid, BIMI met VMC-link)
//   (c) lijst      — de gecureerde lijst officiële domeinen (shared/mail-bekende-afzenders.ts)
//   (d) heuristiek — imitatie (lijkt op merk, homoglief/gemengd schrift, merk in weergavenaam, naam van een contact)
//   (e) gebruiker  — wat u zelf deed (bevestigd, verdacht gemarkeerd, in contacten)
//   (f) mail       — uw eigen mail: hoeveel berichten ontvangen, hoeveel keer u zelf schreef
// De STATUS blijft streng (classificeer hierboven): DNS en «ви писали» maken een adres nooit «geverifieerd»; ze bepalen wel het
// vertrouwensniveau, dat altijd met de regels erbij getoond wordt.

export type SpfBeleid = '' | 'streng' | 'zacht' | 'neutraal' | 'open' | 'doorverwezen';
export type DmarcBeleid = '' | 'reject' | 'quarantine' | 'none';
export type DnsBewijs = {
  domein: string; tijd: number;
  /** '' = gelukt; DNS_TIMEOUT / DNS_FOUT = (deels) niet beantwoord — dan telt niets van wat ontbreekt als «slecht». */
  fout: string;
  /** false = het domein bestaat niet (NXDOMAIN). */
  bestaat: boolean;
  mx: number;
  spf: SpfBeleid; spfRecord: boolean;
  dmarc: DmarcBeleid; dmarcRecord: boolean; dmarcVan: string; dmarcPct: number;
  bimi: boolean; bimiLogo: string; bimiVmc: string;
};
const txt = (records: readonly (readonly string[] | string)[]) => records.map((r) => (Array.isArray(r) ? r.join('') : String(r)).trim());
/** SPF-record (v=spf1 …): het «all»-mechanisme bepaalt het beleid. Meer dan één record = ongeldig (RFC 7208 §4.5) → geen. */
export function parseSpf(records: readonly (readonly string[] | string)[]): { record: boolean; beleid: SpfBeleid } {
  const spf = txt(records).filter((r) => /^v=spf1(\s|$)/i.test(r));
  if (spf.length !== 1) return { record: false, beleid: '' };
  const m = /(?:^|\s)([-~?+]?)all(?:\s|$)/i.exec(spf[0]);
  if (!m) return { record: true, beleid: /(?:^|\s)redirect=/i.test(spf[0]) ? 'doorverwezen' : 'neutraal' };
  return { record: true, beleid: m[1] === '-' ? 'streng' : m[1] === '~' ? 'zacht' : m[1] === '?' ? 'neutraal' : 'open' };
}
/** DMARC-record (v=DMARC1; p=…; sp=…; pct=…). `voorSubdomein`: het record komt van het organisatiedomein → sp= telt. */
export function parseDmarc(records: readonly (readonly string[] | string)[], voorSubdomein = false): { record: boolean; beleid: DmarcBeleid; pct: number } {
  const d = txt(records).filter((r) => /^v=DMARC1\s*(;|$)/i.test(r));
  if (d.length !== 1) return { record: false, beleid: '', pct: 0 };
  const tags = new Map(d[0].split(';').map((x) => x.trim().split('=').map((y) => y.trim().toLowerCase())).filter((x) => x.length === 2) as Array<[string, string]>);
  const ruw = (voorSubdomein && tags.get('sp')) || tags.get('p') || '';
  const beleid: DmarcBeleid = ruw === 'reject' || ruw === 'quarantine' || ruw === 'none' ? ruw : '';
  const pct = Math.max(0, Math.min(100, Number(tags.get('pct') ?? 100) || 0));
  return { record: !!beleid, beleid, pct: tags.has('pct') ? pct : 100 };
}
const veiligeUrl = (v: string) => (/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[^\s;"'<>]{0,280}$/.test(v) ? v : '');
/** BIMI-record (default._bimi): l= logo (SVG), a= VMC (Verified Mark Certificate, door een CA uitgegeven merkcertificaat). */
export function parseBimi(records: readonly (readonly string[] | string)[]): { record: boolean; logo: string; vmc: string } {
  const b = txt(records).find((r) => /^v=BIMI1\s*(;|$)/i.test(r));
  if (!b) return { record: false, logo: '', vmc: '' };
  const tag = (k: string) => (new RegExp(`(?:^|;)\\s*${k}\\s*=\\s*([^;]*)`, 'i').exec(b)?.[1] || '').trim();
  return { record: true, logo: veiligeUrl(tag('l')), vmc: veiligeUrl(tag('a')) };
}

export type BewijsBron = 'gmail' | 'dns' | 'lijst' | 'heuristiek' | 'gebruiker' | 'mail';
export type BewijsToon = 'goed' | 'slecht' | 'info';
export type BewijsRegel = { bron: BewijsBron; code: string; toon: BewijsToon; tijd: number | null; detail: string };
export type VertrouwensNiveau = 'hoog' | 'middel' | 'laag' | 'geen';
export const IMITATIE_REDENEN = new Set(['NAAM_MERK_ANDER_DOMEIN', 'NAAM_BEVAT_ANDER_ADRES', 'DOMEIN_LIJKT_OP_MERK', 'DOMEIN_GEMENGD_SCHRIFT', 'NAAM_VAN_CONTACT_ANDER_ADRES', 'DMARC_MISLUKT']);

export type ContactInvoer = {
  adres: string; domein: string; status: AfzenderStatus; bron: AfzenderBron | null; reden: string; merk: string;
  bewijs: { laatste?: { spf: string; dkim: string; dmarc: string; authserv: string; dkimDomein: string; dmarcDomein: string; tijd: number; arc?: string; spfDomein?: string }; pass?: number; fail?: number; zonder?: number; verdachtePogingen?: number };
  aantal: number; laatsteOp: string | null; verzonden: number; laatstVerzondenOp: string | null; inContacten: boolean;
  geverifieerdOp: string | null; bijgewerktOp: string | null;
  dns?: DnsBewijs | null;
};
const SPF_KWALIFICATIE: Record<string, string> = { streng: '-all', zacht: '~all', neutraal: '?all', open: '+all', doorverwezen: 'redirect=' };
const ms = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? null : typeof v === 'number' ? v : (Date.parse(v) || null));
export const isGratisMailbox = (domein: string) => GRATIS_MAILBOXEN.includes(domein.toLowerCase());
export const isOfficieel = (domein: string) => !!bekendeDienstVoor(domein);

/** Alle bewijsregels voor één contact, elk met bron en tijdstip. Volgorde: wat u zelf deed, lijst, Gmail, DNS, heuristiek, mail. */
export function bewijsRegels(c: ContactInvoer): BewijsRegel[] {
  const r: BewijsRegel[] = [], add = (bron: BewijsBron, code: string, toon: BewijsToon, tijd: number | null, detail = '') => r.push({ bron, code, toon, tijd, detail });
  const gratis = isGratisMailbox(c.domein), dienst = bekendeDienstVoor(c.domein), org = organisatieDomein(c.domein), bijgewerkt = ms(c.bijgewerktOp);
  if (c.bron === 'handmatig' && c.status === 'geverifieerd') add('gebruiker', 'HANDMATIG', 'goed', ms(c.geverifieerdOp));
  if (c.reden === 'HANDMATIG_VERDACHT') add('gebruiker', 'HANDMATIG_VERDACHT', 'slecht', bijgewerkt);
  if (c.inContacten) add('gebruiker', 'IN_CONTACTEN', 'info', null);
  const lijstTijd = Date.parse(`${LIJST_HERZIEN}T00:00:00Z`);
  if (dienst) add('lijst', 'LIJST_OFFICIEEL', 'goed', lijstTijd, `${dienst.merk} — ${dienst.bron}`);
  else if (gratis) add('lijst', 'LIJST_GRATIS', 'info', lijstTijd, c.domein);
  else add('lijst', 'LIJST_NIET', 'info', lijstTijd, c.domein);
  const l = c.bewijs.laatste;
  if (l) {
    const t = l.tijd || null, dmarcOk = l.dmarc === 'pass' && (!l.dmarcDomein || organisatieDomein(l.dmarcDomein) === org);
    if (l.dkimDomein && organisatieDomein(l.dkimDomein) === org) add('gmail', 'DKIM_ALIGNED', 'goed', t, `d=${l.dkimDomein}`);
    else if (l.dkimDomein) add('gmail', 'DKIM_ANDER', 'info', t, `d=${l.dkimDomein}`);
    else if (/(^|,)fail:/.test(l.dkim)) add('gmail', 'DKIM_FAIL', 'slecht', t);
    else add('gmail', 'DKIM_GEEN', 'info', t);
    if (l.spf === 'pass') add('gmail', 'SPF_PASS', l.spfDomein && organisatieDomein(l.spfDomein) === org ? 'goed' : 'info', t, l.spfDomein || '');
    else if (l.spf === 'fail' || l.spf === 'softfail') add('gmail', 'SPF_FAIL', 'slecht', t, l.spf);
    if (dmarcOk) add('gmail', 'DMARC_PASS', 'goed', t, l.dmarcDomein || c.domein);
    else if (l.dmarc === 'fail') add('gmail', 'DMARC_FAIL', 'slecht', t, l.dmarcDomein || c.domein);
    else add('gmail', 'DMARC_GEEN', 'info', t, l.dmarc || '');
    if (l.arc === 'pass') add('gmail', 'ARC_PASS', 'info', t);
    else if (l.arc === 'fail') add('gmail', 'ARC_FAIL', 'info', t);
  } else if (c.aantal > 0 || (c.bewijs.zonder || 0) > 0) add('gmail', 'AUTH_GEEN', 'info', ms(c.laatsteOp));
  if ((c.bewijs.pass || 0) + (c.bewijs.fail || 0) > 0) add('gmail', 'AUTH_TELLING', (c.bewijs.fail || 0) > 0 ? 'slecht' : 'goed', l?.tijd || null, `${c.bewijs.pass || 0}/${c.bewijs.fail || 0}`);
  const d = c.dns;
  if (gratis) add('dns', 'DNS_GRATIS', 'info', null, c.domein);
  else if (!d) add('dns', 'DNS_NOG_NIET', 'info', null, c.domein);
  else if (!d.bestaat) add('dns', 'DNS_GEEN_DOMEIN', 'slecht', d.tijd, d.domein);
  else {
    if (d.fout) add('dns', 'DNS_FOUT', 'info', d.tijd, d.fout);
    if (d.mx > 0) add('dns', 'DNS_MX', 'info', d.tijd, String(d.mx));
    else if (!d.fout) add('dns', 'DNS_GEEN_MX', 'slecht', d.tijd);
    if (d.spfRecord) add('dns', 'DNS_SPF', d.spf === 'streng' || d.spf === 'zacht' ? 'goed' : 'info', d.tijd, SPF_KWALIFICATIE[d.spf] || d.spf);
    else if (!d.fout) add('dns', 'DNS_GEEN_SPF', 'slecht', d.tijd);
    if (d.dmarc === 'reject' || d.dmarc === 'quarantine') add('dns', 'DNS_DMARC_STRENG', 'goed', d.tijd, `p=${d.dmarc}${d.dmarcPct < 100 ? ` pct=${d.dmarcPct}` : ''}${d.dmarcVan && d.dmarcVan !== d.domein ? ` (${d.dmarcVan})` : ''}`);
    else if (d.dmarc === 'none') add('dns', 'DNS_DMARC_NONE', 'info', d.tijd, d.dmarcVan);
    else if (!d.fout) add('dns', 'DNS_GEEN_DMARC', 'slecht', d.tijd);
    if (d.bimi && d.bimiVmc) add('dns', 'DNS_BIMI_VMC', 'goed', d.tijd, d.bimiVmc);
    else if (d.bimi) add('dns', 'DNS_BIMI', 'info', d.tijd, d.bimiLogo);
  }
  if (c.status === 'verdacht' && IMITATIE_REDENEN.has(c.reden)) add('heuristiek', c.reden, 'slecht', bijgewerkt, c.merk);
  else add('heuristiek', 'IMITATIE_GEEN', 'goed', bijgewerkt);
  if ((c.bewijs.verdachtePogingen || 0) > 0) add('heuristiek', 'VERDACHTE_POGINGEN', 'slecht', bijgewerkt, String(c.bewijs.verdachtePogingen));
  if (c.verzonden > 0) add('mail', 'VERZONDEN', 'goed', ms(c.laatstVerzondenOp), String(c.verzonden));
  if (c.aantal > 0) add('mail', 'ONTVANGEN', 'info', ms(c.laatsteOp), String(c.aantal));
  return r;
}

/** Vertrouwen 0–100 + niveau. Alleen «geverifieerd» kan «hoog» zijn; zonder bevestiging hoogstens 75 («middel»). */
export function vertrouwenVan(c: ContactInvoer): { score: number; niveau: VertrouwensNiveau } {
  let s: number;
  if (c.status === 'verdacht') s = c.reden === 'HANDMATIG_VERDACHT' ? 0 : 5;
  else if (c.status === 'geverifieerd') s = c.bron === 'handmatig' ? 100 : 95;
  else {
    const gratis = isGratisMailbox(c.domein), pass = c.bewijs.pass || 0, fail = c.bewijs.fail || 0, d = c.dns;
    s = 25; // onbekend zonder signalen = «laag»
    if (pass > 0 && fail === 0) s += gratis ? 10 : 25;
    if (fail > 0) s -= 25;
    if (d && !gratis) {
      if (!d.bestaat) s -= 20;
      else {
        if (d.dmarc === 'reject' || d.dmarc === 'quarantine') s += 10; else if (d.dmarc === 'none') s += 3;
        if (d.mx > 0) s += 3; else if (!d.fout) s -= 5;
        if (d.spf === 'streng' || d.spf === 'zacht') s += 4;
        if (d.bimi && d.bimiVmc) s += 5;
      }
    }
    if (c.verzonden > 0) s += c.verzonden >= 3 ? 20 : 15;
    if (c.inContacten) s += 10;
    if (c.aantal >= 5) s += 5;
    if ((c.bewijs.verdachtePogingen || 0) > 0) s -= 10;
    s = Math.max(0, Math.min(75, s));
  }
  return { score: s, niveau: niveauVoor(s) };
}
export const niveauVoor = (s: number): VertrouwensNiveau => (s >= 80 ? 'hoog' : s >= 50 ? 'middel' : s >= 25 ? 'laag' : 'geen');

export const NIVEAU_TEKST: Record<VertrouwensNiveau, [string, string]> = {
  hoog: ['Висока довіра', 'Hoog vertrouwen'], middel: ['Середня довіра', 'Gemiddeld vertrouwen'], laag: ['Низька довіра', 'Laag vertrouwen'], geen: ['Немає довіри', 'Geen vertrouwen'],
};
export const BRON_TEKST: Record<BewijsBron, [string, string]> = {
  gmail: ['Ваш поштовий сервер (Gmail, Authentication-Results)', 'Uw mailserver (Gmail, Authentication-Results)'],
  dns: ['DNS домену відправника', 'DNS van het afzenderdomein'],
  lijst: ['Перелік офіційних доменів Мого простору', 'Lijst officiële domeinen van Mijn Ruimte'],
  heuristiek: ['Перевірка на підробку', 'Controle op imitatie'],
  gebruiker: ['Ви', 'U'],
  mail: ['Ваша пошта', 'Uw mail'],
};
/** Tekst per bewijsregel; «{d}» = detail. */
export const REGEL_TEKST: Record<string, [string, string]> = {
  HANDMATIG: ['Ви підтвердили цю адресу вручну.', 'U bevestigde dit adres zelf.'],
  HANDMATIG_VERDACHT: ['Ви позначили цю адресу як підозрілу.', 'U markeerde dit adres als verdacht.'],
  IN_CONTACTEN: ['Додано у ваші контакти.', 'Toegevoegd aan uw contacten.'],
  LIJST_OFFICIEEL: ['Офіційний домен організації: {d}', 'Officieel domein van de organisatie: {d}'],
  LIJST_GRATIS: ['{d} — безкоштовна пошта: адресу може створити будь-хто.', '{d} — gratis mailbox: iedereen kan er een adres maken.'],
  LIJST_NIET: ['{d} немає в переліку офіційних доменів (це не означає, що домен поганий).', '{d} staat niet in de lijst officiële domeinen (dat zegt niet dat het domein slecht is).'],
  DKIM_ALIGNED: ['Підпис DKIM дійсний, і підписав сам домен відправника ({d}).', 'De DKIM-handtekening is geldig en komt van het afzenderdomein zelf ({d}).'],
  DKIM_ANDER: ['Підпис DKIM дійсний, але від іншого домену ({d}) — наприклад, розсилкового сервісу.', 'De DKIM-handtekening is geldig maar van een ander domein ({d}) — bv. een verzenddienst.'],
  DKIM_FAIL: ['Підпис DKIM недійсний.', 'De DKIM-handtekening is ongeldig.'],
  DKIM_GEEN: ['Лист без дійсного підпису DKIM.', 'Bericht zonder geldige DKIM-handtekening.'],
  SPF_PASS: ['SPF пройдено: сервер має право надсилати пошту для {d}.', 'SPF geslaagd: de server mag mail versturen voor {d}.'],
  SPF_FAIL: ['SPF не пройдено ({d}): сервер не має права надсилати від цього домену.', 'SPF mislukt ({d}): de server mag niet namens dit domein versturen.'],
  DMARC_PASS: ['DMARC пройдено для {d}: лист справді з цього домену.', 'DMARC geslaagd voor {d}: het bericht komt echt van dit domein.'],
  DMARC_FAIL: ['DMARC не пройдено для {d}: можлива підробка адреси.', 'DMARC mislukt voor {d}: mogelijk vervalst adres.'],
  DMARC_GEEN: ['Результату DMARC немає ({d}).', 'Geen DMARC-uitslag ({d}).'],
  ARC_PASS: ['Ланцюжок ARC (пересилання) пройдено.', 'ARC-keten (doorsturen) geslaagd.'],
  ARC_FAIL: ['Ланцюжок ARC (пересилання) не пройдено.', 'ARC-keten (doorsturen) mislukt.'],
  AUTH_GEEN: ['Ваш сервер не додав результатів перевірки для цих листів.', 'Uw server voegde voor deze berichten geen controle-uitslag toe.'],
  AUTH_TELLING: ['Листи з перевіркою DMARC: пройдено / не пройдено = {d}.', 'Berichten met DMARC-controle: geslaagd / mislukt = {d}.'],
  DNS_GRATIS: ['DNS не перевіряється: {d} — спільна безкоштовна пошта, її DNS нічого не каже про конкретну особу.', 'DNS niet gecontroleerd: {d} is een gedeelde gratis mailbox; die DNS zegt niets over de persoon.'],
  DNS_NOG_NIET: ['DNS домену {d} ще не перевірено.', 'DNS van {d} nog niet gecontroleerd.'],
  DNS_GEEN_DOMEIN: ['Домену {d} не існує (NXDOMAIN).', 'Het domein {d} bestaat niet (NXDOMAIN).'],
  DNS_FOUT: ['DNS відповів не повністю ({d}); перевірку повторимо пізніше.', 'DNS antwoordde niet volledig ({d}); we proberen later opnieuw.'],
  DNS_MX: ['Домен приймає пошту (записів MX: {d}).', 'Het domein ontvangt mail (MX-records: {d}).'],
  DNS_GEEN_MX: ['Домен не приймає пошту (немає MX) — незвично для справжнього відправника.', 'Het domein ontvangt geen mail (geen MX) — ongewoon voor een echte afzender.'],
  DNS_SPF: ['У домену є запис SPF (політика: {d}).', 'Het domein heeft een SPF-record (beleid: {d}).'],
  DNS_GEEN_SPF: ['У домену немає запису SPF.', 'Het domein heeft geen SPF-record.'],
  DNS_DMARC_STRENG: ['Домен вимагає відхиляти підроблені листи: DMARC {d}.', 'Het domein laat vervalste mail weigeren: DMARC {d}.'],
  DNS_DMARC_NONE: ['DMARC є, але лише спостереження (p=none) {d}.', 'DMARC aanwezig, maar alleen waarnemen (p=none) {d}.'],
  DNS_GEEN_DMARC: ['У домену немає DMARC — підробити його адресу легше.', 'Het domein heeft geen DMARC — het adres is makkelijker te vervalsen.'],
  DNS_BIMI_VMC: ['BIMI з сертифікатом торговельної марки (VMC): {d}', 'BIMI met merkcertificaat (VMC): {d}'],
  DNS_BIMI: ['BIMI-логотип опубліковано, але без сертифіката VMC.', 'BIMI-logo gepubliceerd, maar zonder VMC-certificaat.'],
  IMITATIE_GEEN: ['Ознак підробки (схожий домен, чужий бренд в імені, змішані алфавіти) не знайдено.', 'Geen tekenen van imitatie (lijkend domein, vreemd merk in de naam, gemengde alfabetten).'],
  VERDACHTE_POGINGEN: ['Підозрілих листів із цієї адреси: {d}.', 'Verdachte berichten van dit adres: {d}.'],
  VERZONDEN: ['Ви писали на цю адресу: {d} раз(и).', 'U schreef naar dit adres: {d} keer.'],
  ONTVANGEN: ['Отримано листів: {d}.', 'Ontvangen berichten: {d}.'],
};
for (const k of IMITATIE_REDENEN) if (!REGEL_TEKST[k]) REGEL_TEKST[k] = AFZENDER_REDENEN[k] as [string, string];
export const regelTekst = (r: BewijsRegel, lang: 'uk' | 'nl') => ((REGEL_TEKST[r.code] || [r.code, r.code])[lang === 'uk' ? 0 : 1]).replace('{d}', r.detail || '—');
