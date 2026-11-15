// MAIL-IMAP-LEZEN-001: tests voor shared/mail-imap-mime.ts — byte-exacte IMAP-FETCH-antwoorden (literal {n} telt BYTES)
// en MIME → platte tekst. Тести для розбору відповідей IMAP FETCH і MIME (Ukr.net, utf-8, windows-1251, koi8-u).
import { checker } from './hulp/nep-google';
import {
  imapKopUitBron, imapBerichtUitBron, decodeerKop, decodeerTekenset, htmlNaarTekst, afzender, fetchItems,
} from '../../shared/mail-imap-mime';

// Bytes → latin1-tekenreeks (één teken = één byte), zoals de IMAP-client ze aanlevert.
const L = (b: Buffer) => b.toString('latin1');
const U = (s: string) => Buffer.from(s, 'utf8');
// windows-1251 voor Oekraïens/Russisch (alleen de letters die we nodig hebben) / кодування cp1251 вручну
const cp1251 = (s: string): Buffer => Buffer.from([...s].map((c) => {
  const k = c.codePointAt(0)!;
  if (k < 0x80) return k;
  if (k >= 0x410 && k <= 0x44f) return k - 0x410 + 0xc0;
  const extra: Record<string, number> = { 'і': 0xb3, 'І': 0xb2, 'ї': 0xbf, 'Ї': 0xaf, 'є': 0xba, 'Є': 0xaa, 'ґ': 0xb4, 'Ґ': 0xa5, '«': 0xab, '»': 0xbb, '№': 0xb9, '—': 0x97 };
  if (c in extra) return extra[c];
  throw new Error(`cp1251: ${c}`);
}));
// koi8-u «Привіт» (bytes uit de tabel) / «Привіт» у koi8-u
const KOI8U_PRYVIT = Buffer.from([0xf0, 0xd2, 0xc9, 0xd7, 0xa6, 0xd4]);
const b64 = (b: Buffer) => b.toString('base64');
const qp = (b: Buffer) => [...b].map((x) => (x >= 33 && x <= 126 && x !== 61 ? String.fromCharCode(x) : `=${x.toString(16).toUpperCase().padStart(2, '0')}`)).join('');

// Eén FETCH-item: «* n FETCH (<voor> {n}\r\n<literal><na>)\r\n» — n = bytelengte van de literal.
const item = (n: number, voor: string, literal: Buffer, na = ''): Buffer => Buffer.concat([
  Buffer.from(`* ${n} FETCH (${voor} {${literal.length}}\r\n`, 'latin1'), literal, Buffer.from(`${na})\r\n`, 'latin1'),
]);
const KOPVELDEN = 'BODY[HEADER.FIELDS (FROM TO SUBJECT DATE CONTENT-TYPE)]';

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-imap-mime-20261115');

  // ---------------------------------------------------------------- koppen (RFC 2047)
  check('RFC2047 B utf-8 (Oekraïens)', decodeerKop(`=?UTF-8?B?${b64(U('Привіт, світе'))}?=`) === 'Привіт, світе');
  check('RFC2047 Q utf-8 met underscore = spatie', decodeerKop(`=?utf-8?Q?${qp(U('Рахунок')).replace(/=20/g, '_')}_=E2=84=96_5?=`) === 'Рахунок № 5');
  check('RFC2047 B windows-1251', decodeerKop(`=?windows-1251?B?${b64(cp1251('Звіт за листопад'))}?=`) === 'Звіт за листопад');
  check('RFC2047 Q koi8-u', decodeerKop(`=?koi8-u?Q?${qp(KOI8U_PRYVIT)}?=`) === 'Привіт');
  check('twee gecodeerde woorden: witruimte ertussen valt weg', decodeerKop(`=?utf-8?B?${b64(U('Добрий '))}?=\r\n =?utf-8?B?${b64(U('день'))}?=`) === 'Добрий день');
  check('gewone tekst + gecodeerd woord', decodeerKop(`Re: =?utf-8?B?${b64(U('Зустріч'))}?=`) === 'Re: Зустріч');
  check('ruwe 8-bit utf-8 in kop', decodeerKop(L(U('Тема без кодування'))) === 'Тема без кодування');
  check('afzender met aanhalingstekens', JSON.stringify(afzender('"Іван Петренко" <Ivan@Ukr.NET>')) === JSON.stringify(['Іван Петренко', 'ivan@ukr.net']));
  check('afzender alleen adres', afzender('bot@example.test')[1] === 'bot@example.test');
  check('onbekende tekenset → geen fout', typeof decodeerTekenset(Buffer.from('abc'), 'x-onbekend') === 'string');

  // ---------------------------------------------------------------- lijst: meerdere FETCH-items
  const kop1 = U([
    `From: "=?UTF-8?B?${b64(U('Олена Коваль'))}?=" <olena@ukr.net>`,
    'To: ik@ukr.net',
    `Subject: =?UTF-8?B?${b64(U('Дуже довга тема листа, '))}?=`,
    ` =?UTF-8?B?${b64(U('яка складена'))}?=`,
    'Date: Sun, 15 Nov 2026 10:00:00 +0200',
    'Content-Type: multipart/mixed;',
    '\tboundary="abc"',
    '', '',
  ].join('\r\n'));
  const kop2 = Buffer.concat([
    Buffer.from('From: =?windows-1251?Q?', 'latin1'), Buffer.from(qp(cp1251('Бухгалтерія')), 'latin1'), Buffer.from('?= <buh@example.ua>\r\n', 'latin1'),
    Buffer.from(`Subject: =?windows-1251?B?${b64(cp1251('Рахунок до сплати'))}?=\r\nDate: Mon, 16 Nov 2026 08:30:00 +0000\r\nContent-Type: text/plain; charset=windows-1251\r\n\r\n`, 'latin1'),
  ]);
  const kop3 = U(`From: koi@example.ua\r\nSubject: =?koi8-u?B?${b64(KOI8U_PRYVIT)}?=\r\nDate: garbage\r\n\r\n`);
  const lijst = L(Buffer.concat([
    item(1, `UID 101 FLAGS (\\Seen) INTERNALDATE "15-Nov-2026 10:00:01 +0200" RFC822.SIZE 2048 ${KOPVELDEN}`, kop1),
    item(2, `UID 102 FLAGS () INTERNALDATE "16-Nov-2026 08:30:00 +0000" RFC822.SIZE 512 ${KOPVELDEN}`, kop2),
    // FLAGS/UID NA de literal (zo antwoorden sommige servers) / прапорці після літерала
    item(3, `INTERNALDATE "17-Nov-2026 12:00:00 +0000" RFC822.SIZE 99 ${KOPVELDEN}`, kop3, ' UID 103 FLAGS (\\Answered \\Seen)'),
    Buffer.from('A5 OK FETCH completed\r\n', 'latin1'),
  ]));
  const koppen = imapKopUitBron(lijst);
  check('lijst: drie items', koppen.length === 3, String(koppen.length));
  const [a, b, c] = koppen;
  check('item 1: uid, gelezen, grootte, bijlage (multipart/mixed)', a?.uid === 101 && a.volgnummer === 1 && a.gelezen && a.grootte === 2048 && a.bijlage);
  check('item 1: gevouwen onderwerp utf-8', a?.onderwerp === 'Дуже довга тема листа, яка складена', a?.onderwerp);
  check('item 1: gecodeerde naam tussen aanhalingstekens', a?.van === 'Олена Коваль' && a.vanAdres === 'olena@ukr.net', `${a?.van} / ${a?.vanAdres}`);
  check('item 1: datum uit Date-kop', a?.datum === Date.parse('2026-11-15T08:00:00Z'));
  check('item 2: ongelezen, windows-1251 afzender (Q) en onderwerp (B)', b?.uid === 102 && !b.gelezen && b.van === 'Бухгалтерія' && b.onderwerp === 'Рахунок до сплати' && !b.bijlage, `${b?.van} / ${b?.onderwerp}`);
  check('item 3: UID en FLAGS na de literal', c?.uid === 103 && c.gelezen, JSON.stringify(c));
  check('item 3: koi8-u onderwerp', c?.onderwerp === 'Привіт');
  check('item 3: ongeldige Date → INTERNALDATE', c?.datum === Date.parse('2026-11-17T12:00:00Z'));
  check('literal byte-exact (utf-8 telt bytes, geen tekens)', fetchItems(lijst)[0].literal.length === kop1.length);

  // ---------------------------------------------------------------- volledig bericht: multipart/alternative
  const vol = (literal: Buffer, uid = 200) => L(Buffer.concat([
    item(1, `UID ${uid} FLAGS (\\Seen) INTERNALDATE "15-Nov-2026 10:00:00 +0000" RFC822.SIZE ${literal.length} BODY[]`, literal),
    Buffer.from('A7 OK done\r\n', 'latin1'),
  ]));
  const alt = Buffer.concat([
    U(`From: Олена <olena@ukr.net>\r\nSubject: =?utf-8?B?${b64(U('Тест'))}?=\r\nDate: Sun, 15 Nov 2026 10:00:00 +0000\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="b1"\r\n\r\n`),
    U('This is a multi-part message.\r\n--b1\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'),
    U(`${b64(U('Добрий день!\r\nЦе платна версія листа.\r\n')).replace(/(.{76})/g, '$1\r\n')}\r\n`),
    U('--b1\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n'),
    Buffer.from(`${qp(U('<p>HTML-версія</p>'))}\r\n--b1--\r\n`, 'latin1'),
  ]);
  const m1 = imapBerichtUitBron(vol(alt));
  check('alternative: platte tekst wint', m1?.tekst === 'Добрий день!\nЦе платна версія листа.' && m1.wasHtml === false, JSON.stringify(m1?.tekst));
  check('alternative: kop + geen bijlagen', m1?.onderwerp === 'Тест' && m1.uid === 200 && m1.bijlagen.length === 0 && !m1.bijlage);

  // ---------------------------------------------------------------- alleen HTML
  const html = '<html><head><title>X</title><style>p{color:red}</style></head><body><script>alert(1)</script>'
    + '<p>Шановний клієнте,</p><p>Ваш рахунок&nbsp;&#8470;&nbsp;7 &amp; акт <b>готові</b>.</p>'
    + '<a href="https://example.ua/pay?id=1&amp;x=2">Сплатити</a><br><img src="https://track.example/p.gif"><!-- verborgen --></body></html>';
  const htmlMsg = U(`From: shop@example.ua\r\nSubject: HTML\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${qp(U(html)).replace(/(.{70})/g, '$1=\r\n')}\r\n`);
  const m2 = imapBerichtUitBron(vol(htmlMsg, 201));
  const t2 = m2?.tekst || '';
  check('html: wasHtml en geen tags meer', m2?.wasHtml === true && !/<[a-z!/]/i.test(t2), t2);
  check('html: script/style/title weg, img weg', !t2.includes('alert') && !t2.includes('color') && !t2.includes('p.gif') && !t2.startsWith('X'));
  check('html: entiteiten opgelost', t2.includes('Ваш рахунок № 7 & акт готові.'), t2);
  check('html: link als «tekst (url)»', t2.includes('Сплатити (https://example.ua/pay?id=1&x=2)'), t2);
  check('htmlNaarTekst: commentaar weg', !htmlNaarTekst('a<!-- <b>x</b> -->b').includes('x'));

  // ---------------------------------------------------------------- multipart/mixed met bijlagen
  const pdf = Buffer.from('%PDF-1.4 nep inhoud 1234567890');
  const mixed = Buffer.concat([
    U('From: a@example.ua\r\nSubject: bijlagen\r\nContent-Type: multipart/mixed; boundary="=_mix"\r\n\r\n'),
    U('--=_mix\r\nContent-Type: multipart/alternative; boundary="=_alt"\r\n\r\n'),
    U('--=_alt\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\nДив. вкладення.\r\n--=_alt\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Див.</p>\r\n--=_alt--\r\n'),
    U(`--=_mix\r\nContent-Type: application/pdf; name="=?utf-8?B?${b64(U('Договір.pdf'))}?="\r\nContent-Disposition: attachment;\r\n filename*=utf-8''${encodeURIComponent('Договір №1.pdf')}\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(pdf)}\r\n`),
    U(`--=_mix\r\nContent-Type: image/png; name="foto.png"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(Buffer.from([1, 2, 3, 4, 5]))}\r\n--=_mix--\r\n`),
  ]);
  const m3 = imapBerichtUitBron(vol(mixed, 202));
  check('mixed: tekst uit geneste alternative (8-bit utf-8)', m3?.tekst === 'Див. вкладення.' && !m3.wasHtml, JSON.stringify(m3?.tekst));
  check('mixed: twee bijlagen, bijlage-vlag', m3?.bijlagen.length === 2 && m3.bijlage, JSON.stringify(m3?.bijlagen));
  check('mixed: RFC2231 filename*=utf-8\'\' gedecodeerd', m3?.bijlagen[0]?.naam === 'Договір №1.pdf' && m3.bijlagen[0].type === 'application/pdf' && m3.bijlagen[0].grootte === pdf.length, JSON.stringify(m3?.bijlagen[0]));
  check('mixed: gewone name="foto.png"', m3?.bijlagen[1]?.naam === 'foto.png' && m3.bijlagen[1].grootte === 5);
  // RFC2231 met windows-1251 bytes (geen geldige utf-8 voor decodeURIComponent)
  const naam1251 = [...cp1251('Звіт.doc')].map((x) => `%${x.toString(16).toUpperCase()}`).join('');
  const m3b = imapBerichtUitBron(vol(U(`From: a@b.ua\r\nContent-Type: multipart/mixed; boundary=zz\r\n\r\n--zz\r\nContent-Type: text/plain\r\n\r\nok\r\n--zz\r\nContent-Type: application/msword\r\nContent-Disposition: attachment; filename*=windows-1251''${naam1251}\r\n\r\nabc\r\n--zz--\r\n`), 203));
  check('mixed: RFC2231 filename*=windows-1251\'\'', m3b?.bijlagen[0]?.naam === 'Звіт.doc', JSON.stringify(m3b?.bijlagen));

  // ---------------------------------------------------------------- ruwe 8-bit utf-8 en windows-1251 lichaam
  const m4 = imapBerichtUitBron(vol(U('From: x@y.ua\r\nSubject: 8bit\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\nЇжак їсть ґудзики — 100%.\r\n'), 204));
  check('8-bit utf-8 lichaam', m4?.tekst === 'Їжак їсть ґудзики — 100%.', JSON.stringify(m4?.tekst));
  const m5 = imapBerichtUitBron(vol(Buffer.concat([
    U('From: x@y.ua\r\nSubject: cp1251\r\nContent-Type: text/plain; charset="windows-1251"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n'),
    cp1251('Шановні колеги, «Звіт» № 3 у вкладенні. Ще є питання?'), U('\r\n'),
  ]), 205));
  check('windows-1251 lichaam', m5?.tekst === 'Шановні колеги, «Звіт» № 3 у вкладенні. Ще є питання?', JSON.stringify(m5?.tekst));

  // ---------------------------------------------------------------- Ukr.net-achtig bericht (koi8-u/1251 koppen, base64 1251 tekst, html)
  const ukr = Buffer.concat([
    U('Return-Path: <info@ukr.net>\r\nReceived: from frv1.fwdcdn.com\r\n\tby mx.ukr.net with esmtp\r\n'),
    U(`From: =?windows-1251?B?${b64(cp1251('Служба підтримки'))}?= <info@ukr.net>\r\n`),
    U(`To: =?koi8-u?Q?${qp(KOI8U_PRYVIT)}?= <ik@ukr.net>\r\n`),
    U(`Subject: =?windows-1251?B?${b64(cp1251('Вхід до скриньки'))}?=\r\nDate: Sun, 15 Nov 2026 12:34:56 +0200\r\nX-Mailer: FREEMAIL\r\nMIME-Version: 1.0\r\n`),
    U('Content-Type: multipart/alternative;\r\n\tboundary="----=_Part_12345_67890.1731666896000"\r\n\r\n'),
    U('------=_Part_12345_67890.1731666896000\r\nContent-Type: text/html; charset=windows-1251\r\nContent-Transfer-Encoding: base64\r\n\r\n'),
    U(`${b64(cp1251('<div>Ваш пароль змінено.</div>')).replace(/(.{76})/g, '$1\r\n')}\r\n`),
    U('------=_Part_12345_67890.1731666896000\r\nContent-Type: text/plain; charset=windows-1251\r\nContent-Transfer-Encoding: base64\r\n\r\n'),
    U(`${b64(cp1251('Ваш пароль змінено. Якщо це не ви — зверніться до підтримки.'))}\r\n------=_Part_12345_67890.1731666896000--\r\n`),
  ]);
  const m6 = imapBerichtUitBron(vol(ukr, 9001));
  check('ukr.net: afzender en onderwerp (1251)', m6?.van === 'Служба підтримки' && m6.vanAdres === 'info@ukr.net' && m6.onderwerp === 'Вхід до скриньки', `${m6?.van} / ${m6?.onderwerp}`);
  check('ukr.net: aan (koi8-u)', m6?.aan === 'Привіт <ik@ukr.net>', m6?.aan);
  check('ukr.net: platte tekst wint ook als html eerst staat', m6?.tekst === 'Ваш пароль змінено. Якщо це не ви — зверніться до підтримки.' && !m6.wasHtml, JSON.stringify(m6?.tekst));
  check('ukr.net: datum', m6?.datum === Date.parse('2026-11-15T10:34:56Z'));

  check('geen FETCH → null', imapBerichtUitBron('A1 OK nothing\r\n') === null);
  return einde();
}
