// Uittreksel in de lijst (audit пошти 18.10.2026, «Очистити генерацію прев'ю»): ruis eruit, inhoud blijft, idempotent,
// afkappen op woorden, hoeveelheid per dichtheid. Elke fixture toont eerst het OUDE gedrag (de ruwe snippet bevat de ruis).
import { readFileSync } from 'node:fs';
import { knipOpWoord, maakUittreksel, uittrekselVoor, voorbeeldProfiel } from '../../shared/mail-uittreksel';
import { ingeslotenBeeld, isBeeldBijlage, pasOpWoorden, volgende } from '../../src/voorbeeld/voorbeeld-hulp';
import { checker } from './hulp/nep-google';

type F = { naam: string; ruw: string; moet?: string[]; nooit?: string[]; begint?: string; leeg?: boolean };

const FIXTURES: F[] = [
  { naam: 'AWS-voorbeeld uit het artefact (alt-tekst «AWS logo»)', ruw: 'AWS logo Your AWS free plan account (ID: 123456789012) ends on 23 September 2026. Upgrade to keep using AWS.', begint: 'Your AWS free plan account', nooit: ['AWS logo'] },
  { naam: 'alt-tekst met meerdere woorden', ruw: 'Kinetics Fysiotherapie logo Beste Pavlo, uw afspraak van woensdag is bevestigd.', begint: 'Beste Pavlo', nooit: ['logo'] },
  { naam: 'Gmail [image: …]-marker', ruw: '[image: Google] Security alert A new sign-in on Windows. If this was you, you don’t need to do anything.', begint: 'Security alert', nooit: ['[image'] },
  { naam: '[cid:…]-marker', ruw: '[cid:image001.png@01DA] Goedemiddag, in bijlage de offerte.', begint: 'Goedemiddag', nooit: ['cid:'] },
  { naam: '«View in browser» vooraan (EN)', ruw: 'View in browser Your order #4471 has shipped and will arrive on Friday.', begint: 'Your order #4471', nooit: ['View in browser'] },
  { naam: '«Bekijk in je browser» vooraan (NL)', ruw: 'Bekijk in je browser De nieuwe collectie is er! Ontdek 30% korting dit weekend.', begint: 'De nieuwe collectie', nooit: ['Bekijk in je browser'] },
  { naam: '«Переглянути в браузері» (UK)', ruw: 'Переглянути в браузері Нові курси вже відкрито. Реєстрація до п’ятниці.', begint: 'Нові курси', nooit: ['браузері'] },
  { naam: '«Having trouble viewing this email?»', ruw: 'Having trouble viewing this email? View it online. Weekly digest: 5 new posts in your team space.', begint: 'Weekly digest', nooit: ['trouble viewing'] },
  { naam: '«Sent from my iPhone» achteraan', ruw: 'Ok, see you at 3pm tomorrow. Sent from my iPhone', moet: ['see you at 3pm'], nooit: ['iPhone'] },
  { naam: '«Verzonden vanaf mijn iPhone» (NL)', ruw: 'Prima, ik bel je straks.\nVerzonden vanaf mijn iPhone', moet: ['ik bel je straks'], nooit: ['iPhone'] },
  { naam: '«Надіслано з iPhone» (UK)', ruw: 'Дякую, отримав.\n\nНадіслано з iPhone', moet: ['Дякую, отримав'], nooit: ['iPhone'] },
  { naam: '«Get Outlook for Android»', ruw: 'Can you send me the slides?\n\nGet Outlook for Android', moet: ['send me the slides'], nooit: ['Outlook'] },
  { naam: 'geciteerde geschiedenis «On … wrote:» (EN)', ruw: 'Sounds good, let’s do Monday.\n\nOn Fri, 16 Oct 2026 at 10:12, Jan Peeters <jan@example.be> wrote:\n> Shall we meet next week?', moet: ['Sounds good'], nooit: ['wrote:', 'Shall we meet'] },
  { naam: 'geciteerde geschiedenis «Op … schreef …:» (NL, in één snippet-regel)', ruw: 'Akkoord met de planning. Op vr 16 okt. 2026 om 10:12 schreef Jan Peeters <jan@example.be>: Zullen we volgende week afspreken?', moet: ['Akkoord met de planning'], nooit: ['schreef', 'Zullen we'] },
  { naam: 'geciteerde geschiedenis (UK, «пише:»)', ruw: 'Так, підходить.\n\n16 жовт. 2026 р. о 10:12 Олена <olena@example.com> пише:\n> Зустрінемося у вівторок?', moet: ['Так, підходить'], nooit: ['пише:', 'вівторок'] },
  { naam: 'regels met «>» (citaat)', ruw: 'Hier is het antwoord.\n> vorige vraag\n> nog meer', moet: ['Hier is het antwoord'], nooit: ['vorige vraag'] },
  { naam: '«-----Original Message-----»', ruw: 'Approved.\n-----Original Message-----\nFrom: Finance\nSent: Monday\nPlease approve invoice 77.', moet: ['Approved'], nooit: ['Original Message', 'invoice 77'] },
  { naam: 'Outlook-kop «Van: … Verzonden:»', ruw: 'Bedankt voor de snelle reactie.\nVan: Lopke Van Acker\nVerzonden: woensdag 16 september\nOnderwerp: Les 5', moet: ['Bedankt voor de snelle reactie'], nooit: ['Verzonden:', 'Les 5'] },
  { naam: 'handtekening «-- »', ruw: 'Graag tot donderdag in het lokaal.\n-- \nLopke Van Acker\nCVO Focus | 03 123 45 67', moet: ['Graag tot donderdag'], nooit: ['CVO Focus', '03 123'] },
  { naam: 'juridische voettekst / unsubscribe / ©', ruw: 'Your invoice for October is ready.\nUnsubscribe | Manage preferences\n© 2026 Example Inc. All rights reserved.\nThis email was sent to pavlo@example.com', moet: ['Your invoice for October is ready'], nooit: ['Unsubscribe', '©', 'rights reserved', 'was sent to'] },
  { naam: 'NL voettekst «Afmelden» / «Alle rechten voorbehouden»', ruw: 'Uw pakket wordt vandaag geleverd tussen 14:00 en 16:00.\nAfmelden voor deze e-mails\nDeze e-mail is verzonden naar pavlo@example.be. Alle rechten voorbehouden.', moet: ['Uw pakket wordt vandaag geleverd'], nooit: ['Afmelden', 'verzonden naar', 'voorbehouden'] },
  { naam: 'UK voettekst «Відписатися»', ruw: 'Ваше замовлення №5521 відправлено.\nВідписатися від розсилки\nУсі права захищено.', moet: ['Ваше замовлення №5521'], nooit: ['Відписатися', 'права захищено'] },
  { naam: 'onzichtbare preheader-tekens', ruw: 'Big autumn sale ͏‌͏‌͏‌​​​ starts today — up to 50% off.', moet: ['Big autumn sale starts today'], nooit: ['͏', '‌', '​'] },
  { naam: 'lange tracking-URL', ruw: 'Reset your password using the link below https://click.example.com/ls/click?upn=Abc123XyZ-very-long-token-0987654321abcdef', moet: ['Reset your password'], nooit: ['https://', 'upn='] },
  { naam: 'menu-regel «Home | Shop | Contact»', ruw: 'Home | Shop | Sale | Contact\nYour cart is waiting for you.', begint: 'Your cart is waiting', nooit: ['Home |'] },
  { naam: 'alleen ruis → leeg (niets verzonnen)', ruw: 'View in browser\nUnsubscribe\n© 2026 Shop', leeg: true },
  { naam: 'gewone tekst blijft ongewijzigd', ruw: 'Les 5 schriftelijk - woensdag 16 september. Breng je cursus mee.', moet: ['Les 5 schriftelijk - woensdag 16 september. Breng je cursus mee.'] },
  { naam: '«New logo for our team» is GEEN alt-tekst (geen nieuwe zin erna)', ruw: 'New logo for our team is ready for review.', moet: ['New logo for our team is ready for review.'] },
  { naam: '«Image processing» is GEEN alt-tekst', ruw: 'Image processing results are attached.', moet: ['Image processing results are attached.'] },
  { naam: '«do not reply» weg', ruw: 'Your verification code is 482913.\nPlease do not reply to this email.', moet: ['482913'], nooit: ['do not reply'] },
];

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-uittreksel');

  check(`minstens 25 fixtures (${FIXTURES.length})`, FIXTURES.length >= 25);
  for (const f of FIXTURES) {
    const uit = maakUittreksel(f.ruw);
    const oudRuis = (f.nooit || []).some((n) => f.ruw.includes(n));
    const ok = f.leeg ? uit === ''
      : (f.begint ? uit.startsWith(f.begint) : true) && (f.moet || []).every((m) => uit.includes(m)) && (f.nooit || []).every((n) => !uit.includes(n));
    check(`${f.naam}${oudRuis ? ' (ruwe snippet bevatte de ruis)' : ''}`, ok && (f.nooit?.length ? oudRuis : true), JSON.stringify(uit));
    check(`idempotent: ${f.naam}`, maakUittreksel(uit) === uit, JSON.stringify([uit, maakUittreksel(uit)]));
  }

  // Afkappen op woorden (punt «Обрізання тексту з'їдає сенс»): nooit midden in een woord, altijd ≤ max, «…» aan het eind.
  const zin = 'Your AWS free plan is ending soon and your account will be closed';
  const k = knipOpWoord(zin, 28);
  check('knipOpWoord: niet midden in een woord («endin…» kan niet meer)', k === 'Your AWS free plan is…', k);
  check('knipOpWoord: lengte ≤ max', k.length <= 28, String(k.length));
  check('knipOpWoord: past al → ongewijzigd', knipOpWoord('Kort onderwerp', 40) === 'Kort onderwerp');
  check('knipOpWoord: idempotent', knipOpWoord(k, 28) === k);
  check('knipOpWoord: reuzenwoord wordt toch afgekapt (geen lege rij)', knipOpWoord('https://example.com/' + 'x'.repeat(80), 30).length <= 30);
  check('knipOpWoord: geen leesteken vóór «…»', !/[,;:]…$/.test(knipOpWoord('Eerste deel, tweede deel; derde deel en meer tekst', 22)));
  const lang = maakUittreksel('Woord '.repeat(200), 100);
  check('maakUittreksel(max): op woordgrens en ≤ max', lang.length <= 100 && lang.endsWith('Woord…'), lang.slice(-12));

  // Dichtheid: van minimum naar bulky neemt de hoeveelheid toe — nooit af.
  const volgorde = ['minimum', 'normal', 'detailed', 'bulky'].map(voorbeeldProfiel);
  const stijgt = volgorde.every((p, i) => i === 0 || (p.tekens > volgorde[i - 1].tekens && p.regels >= volgorde[i - 1].regels));
  check('dichtheid: tekens en regels stijgen minimum → normal → detailed → bulky', stijgt, JSON.stringify(volgorde.map((p) => [p.tekens, p.regels])));
  check('dichtheid: minimum = kleine miniatuur, bulky = grote + inhoud van bijlage', volgorde[0].miniatuur === 'klein' && volgorde[3].miniatuur === 'groot' && volgorde[3].bijlageInhoud && !volgorde[0].bijlagenLijst);
  const lange = 'Dit is een lange brief met veel inhoud. '.repeat(40);
  const lens = ['minimum', 'normal', 'detailed', 'bulky'].map((d) => uittrekselVoor(lange, d).length);
  check('uittrekselVoor: zichtbare tekst groeit per dichtheid', lens.every((n, i) => i === 0 || n > lens[i - 1]), JSON.stringify(lens));
  check('onbekende dichtheid → profiel «normal»', JSON.stringify(voorbeeldProfiel('x')) === JSON.stringify(voorbeeldProfiel('normal')));

  // Server: de lijst gebruikt het uittreksel (niet meer de ruwe snippet), zoekcontext blijft gecentreerd op de treffer.
  const srv = readFileSync('backend/google-suite-mail-browser.ts', 'utf8');
  check('server: lijst (Gmail-metadata) geeft uittreksel i.p.v. ruwe snippet', /snippet:maakUittreksel\(normalizeMailDisplayText\(detail\.snippet\|\|'',1000\),1000\)/.test(srv));
  check('server: lijst uit de lokale index geeft uittreksel i.p.v. begin van de tekst', /snippet:maakUittreksel\(body\.slice\(0,8000\),1000\)/.test(srv));
  check('server: zoekresultaat houdt de gecentreerde context (treffer zichtbaar)', srv.includes('snippet:centeredSearchSnippet(body,'));

  // Client: rij gebruikt WoordKnip (afkappen op woorden + title met de volledige tekst) en de datum blijft staan.
  for (const pad of ['src/MailBerichtRij.tsx', 'src/MailMinimumBerichtRij.tsx']) {
    const rij = readFileSync(pad, 'utf8');
    check(`${pad}: uittreksel via WoordKnip met dichtheid`, /<WoordKnip[^>]*tekst=\{message\.snippet\}|<WoordKnip[^>]*tekst=\{p\.message\.snippet\}/.test(rij));
    check(`${pad}: onderwerp met volledige tekst bij aanwijzen (title of eigen tooltip)`, /title=\{\[?(?:p\.)?message\.subject/.test(rij) || rij.includes("className='mail-row-subject-tooltip' role='tooltip'>{message.subject||noSubject}"));
    check(`${pad}: knop «Попередній перегляд» (VoorbeeldKnop)`, rij.includes('<VoorbeeldKnop'));
  }
  const knip = readFileSync('src/voorbeeld/WoordKnip.tsx', 'utf8');
  check('WoordKnip: title = volledige tekst, afkappen via knipOpWoord (woordgrens)', knip.includes('title={volledig') && knip.includes('knipOpWoord'));
  // Breedte-aanpassing: grootste aantal hele woorden dat past (meetfunctie: 7 px per teken).
  const m7 = (x: string) => x.length * 7;
  const pas = pasOpWoorden('Les 5 schriftelijk - woensdag 16 september', 140, m7);
  check('pasOpWoorden: hele woorden + «…», nooit «woensda…»', pas === 'Les 5 schriftelijk…' && !/woensda…$/.test(pas), pas);
  check('pasOpWoorden: past al → ongewijzigd', pasOpWoorden('Kort', 140, m7) === 'Kort');

  // Werkvenster: veiligheid en bediening.
  check('ingesloten beeld: png uit de brief → data-URL', ingeslotenBeeld({ contentType: 'image/png', data: 'iVBORw0KGgo_-' }) === 'data:image/png;base64,iVBORw0KGgo/+');
  check('ingesloten beeld: SVG geweigerd (kan script bevatten)', ingeslotenBeeld({ contentType: 'image/svg+xml', data: 'PHN2Zz4=' }) === '');
  check('ingesloten beeld: nooit een externe URL', ingeslotenBeeld({ contentType: 'image/png', data: 'https://tracker.example.com/p.gif' }) === '');
  check('ingesloten beeld: geen afbeelding → leeg', ingeslotenBeeld({ contentType: 'text/html', data: 'PGI+' }) === '');
  check('afbeelding-bijlage herkend op type of naam', isBeeldBijlage({ contentType: 'image/jpeg', filename: 'x' }) && isBeeldBijlage({ contentType: 'application/octet-stream', filename: 'foto.HEIC' }) && !isBeeldBijlage({ contentType: 'application/pdf', filename: 'a.pdf' }));
  check('← / → lopen rond', volgende(0, 3, -1) === 2 && volgende(2, 3, 1) === 0 && volgende(0, 0, 1) === 0);
  const venster = readFileSync('src/voorbeeld/VoorbeeldVenster.tsx', 'utf8');
  check('venster: tekst via MailMessageBody (zelfde sanitizer + beleid externe afbeeldingen als de lezer)', venster.includes("lazy(() => import('../MailBerichtTekst'))") && venster.includes('<MailMessageBody'));
  check('venster: geen eigen HTML-injectie (geen dangerouslySetInnerHTML/innerHTML)', !/dangerouslySetInnerHTML|innerHTML/.test(venster));
  check('venster: afbeeldingen alleen uit de brief (data:) of uit bijlagen (object-URL), nooit een externe src', !/src=\{?['"`]https?:/.test(venster) && venster.includes('ingeslotenBeeld(') && venster.includes('loadMailAttachmentPreview('));
  check('venster: bijlagen via de bestaande viewers (archief/pdf/office), niets uitgevoerd', venster.includes('<MailAttachmentPreviewBody') && !/\beval\(|new Function|<iframe|<script/.test(venster));
  check('venster: object-URL\'s opgeruimd bij sluiten', venster.includes('revokeMailAttachmentPreview('));
  check('venster: Esc via vensterbeheer (onSluit), ←/→ tussen bijlagen', venster.includes('onSluit={p.onSluit}') && venster.includes("e.key === 'ArrowRight'") && venster.includes("e.key === 'ArrowLeft'"));
  check('venster: smal scherm = volledig scherm', readFileSync('src/voorbeeld/voorbeeld.css', 'utf8').includes('.venster.voorbeeld-venster,.venster.is-max.voorbeeld-venster{inset:0!important'));
  const ws = readFileSync('src/GoogleMailWerkruimte.tsx', 'utf8');
  check('pagina: rij → onVoorbeeld → VoorbeeldVenster (zonder naar een andere pagina te gaan)', ws.includes('onVoorbeeld={()=>setVoorbeeld(') && ws.includes('<VoorbeeldVenster '));
  return einde();
}
