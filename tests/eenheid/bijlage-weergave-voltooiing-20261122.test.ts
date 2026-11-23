// Комплексні модульні випробування завершення Етапів 3–4 спільного переглядача вкладень (CONSOL-001 / SPIL-WEERGAVE, 22.11.2026).
// Покривають: 11 станів і 11 окремих растрових PNG-карток Telegram, доставку sendPhoto без витоку вмісту файла,
// захищений серверний маршрут POST /api/owner/bijlage-weergave/ocr-tekst (права, простори, межа 20 МБ, формати),
// клієнтські помічники розпізнавання сканів, швидкокарту строків, ключ оплати Календаря, veiligeMiniAdres та Мовний закон.

import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import {
  stuurBijlageMeldingNaarTelegram,
  tekenBijlageStaatKaartPng,
} from '../../backend/bijlage-telegram-melding';
import { bijlageWeergaveOcrRoutes, MAX_OCR_BYTES } from '../../backend/bijlage-weergave-ocr';
import { bijlageKaartKenmerken } from '../../shared/bijlage-weergave/kaart-kenmerken';
import {
  escHtml,
  TELEGRAM_KAART_STATEN,
  telegramKaartStaat,
  telegramKaartVoor,
  type TelegramKaartStaat,
} from '../../shared/bijlage-weergave/telegram-kaart';
import { standaardProfiel, type MeldingEcosysteemGebeurtenis } from '../../shared/meldingen-ecosysteem';
import {
  betalingSleutelKort,
  betalingSpoor,
  bewaarBetalingSpoor,
  googleAgendaAdres,
} from '../../src/bijlage-weergave/kalender-betaling';
import { MINI_MAX_BASE64, veiligeMiniAdres } from '../../src/bijlage-weergave/MeldingKaart';
import { kanScanHerkennen, MAX_SCAN_OCR_BYTES, ocrFoutUitleg } from '../../src/bijlage-weergave/ocr-client';
import { toontOndertekenen } from '../../src/bijlage-weergave/ondertekenen';
import { dagenTot, termijnHint } from '../../src/bijlage-weergave/snelkaart';
import { foutTekst } from '../../src/bijlage-weergave/Weergave';
import { checker } from './hulp/nep-google';

const VERBODEN_LETTERS = /[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/;
const ACTIEF_DEELWOORD = /[а-яіїєґ]+(уч|юч|ач|яч)(ий|а|е|і|ого|ої|им|их|ому|ій|у)\b/iu;

function ontleedPng(buf: Buffer): { geldig: boolean; breedte: number; hoogte: number; idatUitgepakt: Buffer } {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(sig)) {
    return { geldig: false, breedte: 0, hoogte: 0, idatUitgepakt: Buffer.alloc(0) };
  }
  let pos = 8;
  let breedte = 0;
  let hoogte = 0;
  const idatDelen: Buffer[] = [];
  let gezienIend = false;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii');
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (pos + 12 + len > buf.length) return { geldig: false, breedte: 0, hoogte: 0, idatUitgepakt: Buffer.alloc(0) };
    if (type === 'IHDR' && len === 13) {
      breedte = data.readUInt32BE(0);
      hoogte = data.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idatDelen.push(data);
    } else if (type === 'IEND') {
      gezienIend = true;
      break;
    }
    pos += 12 + len;
  }
  const uitgepakt = idatDelen.length ? inflateSync(Buffer.concat(idatDelen)) : Buffer.alloc(0);
  return {
    geldig: gezienIend && breedte > 0 && hoogte > 0 && uitgepakt.length === (breedte * 3 + 1) * hoogte,
    breedte,
    hoogte,
    idatUitgepakt: uitgepakt,
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('bijlage-weergave-voltooiing-20261122');

  const nu = new Date(2026, 10, 22, 12, 0, 0); // 22.11.2026 за місцевим часом

  // ---------------------------------------------------------------- 1. 11 станів картки Telegram і порядок переваги
  const alleStaten = Object.keys(TELEGRAM_KAART_STATEN) as TelegramKaartStaat[];
  check('1a рівно 11 станів карток Telegram у реєстрі', alleStaten.length === 11);

  check(
    '1b порядок переваги telegramKaartStaat: verdacht → onleesbaar → betaald → verlopen/vandaag/binnenkort/nieuw → versie → contract → foto → document',
    telegramKaartStaat({ taal: 'uk', naam: 'x.pdf', siteUrl: 'https://hub.tarasevych.com/', vertrouwen: 'gevaar', onleesbaar: true, isRekening: true, nu }) === 'verdacht'
      && telegramKaartStaat({ taal: 'uk', naam: 'x.pdf', siteUrl: 'https://hub.tarasevych.com/', onleesbaar: true, isRekening: true, nu }) === 'onleesbaar'
      && telegramKaartStaat({ taal: 'uk', naam: 'x.pdf', siteUrl: 'https://hub.tarasevych.com/', isRekening: true, betaald: true, termijnIso: '2026-11-10', nu }) === 'betaald'
      && telegramKaartStaat({ taal: 'uk', naam: 'x.pdf', siteUrl: 'https://hub.tarasevych.com/', isRekening: true, termijnIso: '2026-11-20', nu }) === 'termijn-verlopen'
      && telegramKaartStaat({ taal: 'uk', naam: 'x.pdf', siteUrl: 'https://hub.tarasevych.com/', isRekening: true, termijnIso: '2026-11-22', nu }) === 'termijn-vandaag'
      && telegramKaartStaat({ taal: 'uk', naam: 'x.pdf', siteUrl: 'https://hub.tarasevych.com/', isRekening: true, termijnIso: '2026-11-27', nu }) === 'termijn-binnenkort'
      && telegramKaartStaat({ taal: 'uk', naam: 'x.pdf', siteUrl: 'https://hub.tarasevych.com/', isRekening: true, termijnIso: '2026-12-15', nu }) === 'rekening-nieuw'
      && telegramKaartStaat({ taal: 'uk', naam: 'x.pdf', siteUrl: 'https://hub.tarasevych.com/', heeftVorigeVersie: true, isContract: true, nu }) === 'nieuwe-versie'
      && telegramKaartStaat({ taal: 'uk', naam: 'x.pdf', siteUrl: 'https://hub.tarasevych.com/', isContract: true, nu }) === 'contract-nieuw'
      && telegramKaartStaat({ taal: 'uk', naam: 'x.jpg', siteUrl: 'https://hub.tarasevych.com/', isFoto: true, nu }) === 'foto'
      && telegramKaartStaat({ taal: 'uk', naam: 'x.pdf', siteUrl: 'https://hub.tarasevych.com/', nu }) === 'document',
  );

  check(
    '1c escHtml екранує кутові дужки й амперсанд',
    escHtml('<script>alert(1)&x</script>') === '&lt;script&gt;alert(1)&amp;x&lt;/script&gt;',
  );

  const langeKaart = telegramKaartVoor({
    taal: 'nl',
    naam: `<img src=x onerror=1>${'A'.repeat(400)}`,
    soortNaam: 'Rekening',
    isRekening: true,
    bedrag: '€ 1.240,00',
    termijnIso: '2026-11-22',
    siteUrl: 'https://hub.tarasevych.com/melding',
    nu,
  });
  const onveiligeKaart = telegramKaartVoor({
    taal: 'uk',
    naam: 'файл.pdf',
    siteUrl: 'http://onveilig.example/pad',
    nu,
  });
  check(
    '1d telegramKaartVoor обрізає підпис до <= 1024 знаків, екранує HTML і приймає лише https: для кнопки',
    langeKaart.onderschrift.length <= 1024
      && !langeKaart.onderschrift.includes('<img')
      && langeKaart.onderschrift.includes('22.11.2026')
      && langeKaart.knop.url === 'https://hub.tarasevych.com/melding'
      && onveiligeKaart.knop.url === '',
  );

  const vreemdDomeinKaart = telegramKaartVoor({
    taal: 'uk',
    naam: 'рахунок.pdf',
    siteUrl: 'https://evil.example/login',
    nu,
  });
  const inlogGegevensKaart = telegramKaartVoor({
    taal: 'uk',
    naam: 'рахунок.pdf',
    siteUrl: 'https://user:pass@hub.tarasevych.com/melding',
    nu,
  });
  const valsAchtervoegselKaart = telegramKaartVoor({
    taal: 'nl',
    naam: 'factuur.pdf',
    siteUrl: 'https://tarasevych.com.evil.example/melding',
    nu,
  });
  const lokaalKaart = telegramKaartVoor({
    taal: 'nl',
    naam: 'factuur.pdf',
    siteUrl: 'https://localhost:8443/melding',
    nu,
  });
  check(
    '1e telegramKaartVoor блокує сторонні https-домени та вбудовані облікові дані у кнопці й дозволяє власні домени та localhost',
    vreemdDomeinKaart.knop.url === ''
      && inlogGegevensKaart.knop.url === ''
      && valsAchtervoegselKaart.knop.url === ''
      && lokaalKaart.knop.url === 'https://localhost:8443/melding',
  );

  const geldigTelegramHtml = (html: string): boolean => {
    const openB = (html.match(/<b>/g) || []).length;
    const sluitB = (html.match(/<\/b>/g) || []).length;
    const openI = (html.match(/<i>/g) || []).length;
    const sluitI = (html.match(/<\/i>/g) || []).length;
    const heeftGebrokenEntiteit = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/.test(html);
    const heeftLosseSurrogaat = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(html);
    return (
      html.length <= 1024
      && openB > 0
      && openB === sluitB
      && openI === 1
      && openI === sluitI
      && !heeftGebrokenEntiteit
      && !heeftLosseSurrogaat
    );
  };
  const ampersandKaart = telegramKaartVoor({
    taal: 'uk',
    naam: '&'.repeat(180),
    soortNaam: 'Файл невідомого типу',
    isRekening: true,
    bedrag: '12 345 678,90 грн',
    termijnIso: '2026-11-22',
    siteUrl: 'https://hub.tarasevych.com/melding',
    nu,
  });
  const gemengdHtmlKaart = telegramKaartVoor({
    taal: 'nl',
    naam: '<>&"'.repeat(200),
    soortNaam: 'Rekening & bijlage <1>'.repeat(5),
    isRekening: true,
    bedrag: `& € ${'9'.repeat(80)}`,
    termijnIso: '2026-11-22',
    siteUrl: 'https://hub.tarasevych.com/melding',
    nu,
  });
  const emojiGrensKaart = telegramKaartVoor({
    taal: 'uk',
    naam: `${'📄&'.repeat(180)}`,
    isRekening: true,
    bedrag: '500,00 грн',
    termijnIso: '2026-11-22',
    siteUrl: 'https://hub.tarasevych.com/melding',
    nu,
  });
  check(
    '1f telegramKaartVoor зберігає <= 1024 знаків, парні теги <b>/<i> і цілі сутності &amp;/&lt;/&gt; на 180 амперсандах та "<>&\\"".repeat(200)',
    geldigTelegramHtml(ampersandKaart.onderschrift)
      && (ampersandKaart.onderschrift.match(/<b>/g) || []).length === 3
      && geldigTelegramHtml(gemengdHtmlKaart.onderschrift)
      && (gemengdHtmlKaart.onderschrift.match(/<b>/g) || []).length === 3
      && geldigTelegramHtml(emojiGrensKaart.onderschrift),
  );

  // ---------------------------------------------------------------- 2. 11 окремих растрових PNG-карток 640×320
  const pngBuffers = new Map<TelegramKaartStaat, Buffer>();
  const medailleHandtekeningen = new Set<string>();
  let allePngGeldig = true;
  for (const s of alleStaten) {
    // Навіть якщо подати однаковий колір #2AABEE, піктограми всіх 11 станів мусять бути геометрично різними!
    const png = tekenBijlageStaatKaartPng(s);
    pngBuffers.set(s, png);
    const info = ontleedPng(png);
    if (!info.geldig || info.breedte !== 640 || info.hoogte !== 320) allePngGeldig = false;
    const zelfdeKleurPng = ontleedPng(tekenBijlageStaatKaartPng(s, '#2AABEE'));
    // Вирізаємо область правого медальйона піктограми (x = 360..500, y = 100..230) для перевірки унікальності малюнка.
    const rijLengte = 640 * 3 + 1;
    const stukken: Buffer[] = [];
    for (let y = 100; y <= 230; y += 2) {
      stukken.push(zelfdeKleurPng.idatUitgepakt.subarray(y * rijLengte + 1 + 360 * 3, y * rijLengte + 1 + 500 * 3));
    }
    medailleHandtekeningen.add(Buffer.concat(stukken).toString('base64'));
  }
  const uniekePngs = new Set([...pngBuffers.values()].map((b) => b.toString('hex')));
  check('2a усі 11 станів генерують дійсний PNG 640×320', allePngGeldig);
  check('2b усі 11 PNG-карток попарно відмінні та мають 11 різних піктограм', uniekePngs.size === 11 && medailleHandtekeningen.size === 11);

  // ---------------------------------------------------------------- 3. stuurBijlageMeldingNaarTelegram + bijlageKaartKenmerken
  const kenmUk = bijlageKaartKenmerken('Рахунок-листопад.pdf', 'application/pdf', 'Послуги зв’язку\nРазом до сплати: 1 240,50 грн\nСплатити до: 22.11.2026', 'uk');
  const kenmNl = bijlageKaartKenmerken('factuur-nov.pdf', 'application/pdf', 'Totaal te betalen: € 1.234,56\nVervaldatum: 2026-11-25', 'nl');
  const kenmKommaDuizend = bijlageKaartKenmerken('invoice-dec.pdf', 'application/pdf', 'Total due: EUR 1,234.56\nDue date: 2026-12-05', 'nl');
  const kenmKort = bijlageKaartKenmerken('nota.pdf', 'application/pdf', 'Te betalen: 123.45 EUR', 'uk');
  check(
    '3a bijlageKaartKenmerken витягує вид, суму (1 240,50 / 1.234,56 / 1,234.56 / 123.45) й строк українською та нідерландською',
    kenmUk.isRekening && kenmUk.bedrag === '1 240,50 грн' && kenmUk.termijnIso === '2026-11-22'
      && kenmNl.isRekening && kenmNl.bedrag === '€ 1.234,56' && kenmNl.termijnIso === '2026-11-25'
      && kenmKommaDuizend.bedrag === '€ 1.234,56' && kenmKommaDuizend.termijnIso === '2026-12-05'
      && kenmKort.bedrag === '123,45 €',
  );

  const geheimInhoud = 'GEHEIM_DOCUMENT_INHOUD_NOOIT_NAAR_TELEGRAM_991122';
  const geb: MeldingEcosysteemGebeurtenis = {
    id: '11111111-2222-4333-8444-555555555555',
    ruimte: 'prive',
    externeSleutel: 'mail:factuur-1',
    kanaal: 'mail',
    subdomein: 'mail',
    bron: 'mail',
    prioriteit: 'hoog',
    status: 'nieuw',
    titel: 'Новий рахунок',
    bericht: 'Надійшов рахунок',
    uitleg: '',
    contextLabel: '',
    herhalingen: 1,
    uitgesteldTot: null,
    bijlagen: [
      {
        id: 'bij-1',
        naam: 'Рахунок-104.pdf',
        mime: 'application/pdf',
        grootteBytes: 42_000,
        inhoudBase64: Buffer.from(geheimInhoud).toString('base64'),
        tekstVoorbeeld: 'Разом до сплати: 450,00 €\nСплатити до: 22.11.2026',
      },
    ],
    acties: [{ id: 'open', labelUk: 'Відкрити', labelNl: 'Openen', soort: 'navigeer', href: 'https://mail.tarasevych.com/postvak-in' }],
    meta: {},
    aiSamenvatting: null,
    aangemaaktOp: nu.getTime(),
    bijgewerktOp: nu.getTime(),
  };

  const botOproepen: Array<{ methode: string; gegevens: Record<string, unknown>; bestandNaam?: string; pngBytes?: number }> = [];
  const journaalRegels: Array<Record<string, unknown>> = [];

  const uitVlag = await stuurBijlageMeldingNaarTelegram({ userId: 'u-1', ruimte: 'prive' }, geb, {
    vlagAan: async () => false,
    botAanroepFn: (async () => ({ message_id: 1 })) as never,
  });
  check('3b вимкнений прапорець bijlage-weergave-gedeeld-v1 не надсилає нічого в Telegram', uitVlag === 0 && botOproepen.length === 0);

  const verzondenN = await stuurBijlageMeldingNaarTelegram({ userId: 'u-1', ruimte: 'prive' }, geb, {
    vlagAan: async () => true,
    leesProfielFn: async () => standaardProfiel('prive'),
    botSleutelFn: async () => '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi',
    instellingenFn: async () => ({ afbeeldingen: true } as never),
    koppelingenFn: async () => [
      { id: 'k1', user_id: 'u-1', telegram_id: 'tg-1', chat_id: '777001', rechten: ['meldingen'], site_taal: 'uk' } as never,
      { id: 'k2', user_id: 'u-1', telegram_id: 'tg-2', chat_id: '777002', rechten: ['aanmelden'], site_taal: 'nl' } as never,
    ],
    taalFn: async () => ({ taal: 'uk', herkend: false }),
    botAanroepFn: (async (_sl: string, methode: string, gegevens: Record<string, unknown>, opties?: { bestand?: { naam: string; inhoud: Buffer } }) => {
      botOproepen.push({ methode, gegevens, bestandNaam: opties?.bestand?.naam, pngBytes: opties?.bestand?.inhoud.length });
      return { message_id: 42 };
    }) as never,
    journaalFn: (async (g: Record<string, unknown>) => {
      journaalRegels.push(g);
      return { id: 'j1', seq: 1, hash: 'h1' };
    }) as never,
    nu,
  });

  const eersteBot = botOproepen[0];
  const geserialiseerd = JSON.stringify({ botOproepen, journaalRegels });
  check(
    '3c stuurBijlageMeldingNaarTelegram шле sendPhoto лише чатам із правом meldingen з точною карткою termijn-vandaag без витоку вмісту файла',
    verzondenN === 1
      && botOproepen.length === 1
      && eersteBot.methode === 'sendPhoto'
      && eersteBot.gegevens.chat_id === '777001'
      && eersteBot.gegevens.parse_mode === 'HTML'
      && String(eersteBot.gegevens.caption).includes('450,00 €')
      && String(eersteBot.gegevens.caption).includes('22.11.2026')
      && eersteBot.bestandNaam === 'bijlage-termijn-vandaag.png'
      && (eersteBot.pngBytes ?? 0) > 500
      && !geserialiseerd.includes(geheimInhoud)
      && !geserialiseerd.includes(Buffer.from(geheimInhoud).toString('base64'))
      && journaalRegels.length === 1
      && journaalRegels[0].actie === 'owner.meldingen.bijlage.telegram',
  );

  const vijandigeKnoppen: string[] = [];
  for (const kwaadHref of [
    'https://evil.example/login',
    'https://user:pass@hub.tarasevych.com/',
    'https://user:pass@hub.tarasevych.com/agenda',
  ]) {
    await stuurBijlageMeldingNaarTelegram(
      { userId: 'u-1', ruimte: 'prive' },
      {
        ...geb,
        acties: [{ id: 'open', labelUk: 'Відкрити', labelNl: 'Openen', soort: 'navigeer', href: kwaadHref }],
        meta: { link: kwaadHref },
      },
      {
        vlagAan: async () => true,
        leesProfielFn: async () => standaardProfiel('prive'),
        botSleutelFn: async () => '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi',
        instellingenFn: async () => ({ afbeeldingen: true } as never),
        koppelingenFn: async () => [
          { id: 'k1', user_id: 'u-1', telegram_id: 'tg-1', chat_id: '777001', rechten: ['meldingen'], site_taal: 'uk' } as never,
        ],
        taalFn: async () => ({ taal: 'uk', herkend: false }),
        botAanroepFn: (async (_sl: string, _m: string, gegevens: Record<string, unknown>) => {
          const rm = gegevens.reply_markup as { inline_keyboard?: Array<Array<{ url?: string }>> } | undefined;
          vijandigeKnoppen.push(rm?.inline_keyboard?.[0]?.[0]?.url ?? '');
          return { message_id: 43 };
        }) as never,
        journaalFn: (async () => ({ id: 'j2', seq: 2, hash: 'h2' })) as never,
        nu,
      },
    );
  }
  check(
    '3d stuurBijlageMeldingNaarTelegram підміняє сторонні домени та адреси з обліковими даними на безпечний standaard власного сайту',
    vijandigeKnoppen.length === 3
      && vijandigeKnoppen.every((u) => u === 'https://hub.tarasevych.com/melding')
      && !JSON.stringify(vijandigeKnoppen).includes('evil.example')
      && !JSON.stringify(vijandigeKnoppen).includes('user:pass'),
  );

  // ---------------------------------------------------------------- 4. Маршрут POST /api/owner/bijlage-weergave/ocr-tekst
  let huidigeSessie: { errorCode: string } | { user: { id: string; role: string; status: string; accessLevel: string } } = { errorCode: 'NO_SESSION' };
  let vlagWaarde = true;
  let limietToestaan = true;
  let actieveRuimte: 'prive' | 'technisch' = 'technisch';
  let ocrOproepen = 0;
  let laatstGezienSleutel: { userId: string; ruimte: string } | null = null;

  const ocrRoutes = bijlageWeergaveOcrRoutes({
    requireSession: async () => huidigeSessie,
    vlagAan: async () => vlagWaarde,
    rateLimitFn: (async () => (limietToestaan ? { ok: true, remaining: 29, retryAfter: 0 } : { ok: false, remaining: 0, retryAfter: 30 })) as never,
    ruimteFn: async () => actieveRuimte,
    leesMail: async (_uid, _acc, msgId, _attId, naam, mime) => {
      if (msgId === 'msg_te_groot') throw new Error('GOOGLE_MAIL_ATTACHMENT_PREVIEW_TOO_LARGE');
      return { bytes: Buffer.from('%PDF-1.7 scan'), contentType: mime || 'application/pdf', filename: naam };
    },
    leesCloud: async (lade, bestandId) => {
      if (bestandId === 'onbekend') return null;
      if (bestandId === 'wolk_groot') {
        return { bestand: { naam: 'groot.pdf', mime: 'application/pdf', bytes: MAX_OCR_BYTES + 10 } as never, data: Buffer.alloc(16), totaalBytes: MAX_OCR_BYTES + 10 };
      }
      if (bestandId === 'wolk_zip') {
        return { bestand: { naam: 'archief.zip', mime: 'application/zip', bytes: 120 } as never, data: Buffer.from('PK\x03\x04'), totaalBytes: 120 };
      }
      return {
        bestand: { naam: `scan-${lade.ruimte}.png`, mime: 'image/png', bytes: 64 } as never,
        data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        totaalBytes: 64,
      };
    },
    voerOcrUit: (async (invoer: { sleutel: { userId: string; ruimte: string } }) => {
      ocrOproepen += 1;
      laatstGezienSleutel = invoer.sleutel;
      return {
        status: 'ok',
        herkomst: 'ocr',
        tekst: 'Розпізнаний рахунок № 551 на суму 920 грн',
        paginas: [{ nr: 1, tekst: 'Розпізнаний рахунок', ocr: true }, { nr: 2, tekst: '920 грн', ocr: true }],
      };
    }) as never,
  });

  const roepOcr = async (body: Record<string, unknown>) => {
    const handler = ocrRoutes['POST /api/owner/bijlage-weergave/ocr-tekst'][0];
    const r = await handler({ event: {} as never, body, query: {}, params: {} });
    return { status: r?.statusCode ?? 0, data: JSON.parse(r?.body || '{}') as Record<string, unknown> };
  };

  check('4a без сеансу → 401', (await roepOcr({ bron: 'mail' })).status === 401);

  huidigeSessie = { user: { id: 'u-pending', role: 'member', status: 'pending', accessLevel: 'limited' } };
  check('4b несхвалений обліковий запис → 403', (await roepOcr({ bron: 'mail' })).status === 403);

  huidigeSessie = { user: { id: 'u-goed', role: 'member', status: 'approved', accessLevel: 'full' } };
  check('4c чужий ownerUserId у тілі запиту → 403 RBAC_FOREIGN_OWNER_REJECTED', (await roepOcr({ bron: 'mail', ownerUserId: 'vreemde-gebruiker' })).data.error === 'RBAC_FOREIGN_OWNER_REJECTED');

  vlagWaarde = false;
  const rUit = await roepOcr({ bron: 'mail', accountId: 'a1', messageId: 'msg_123', attachmentId: 'att_1', filename: 'scan.pdf' });
  check('4d вимкнений прапорець → 404 BIJLAGE_WEERGAVE_UIT', rUit.status === 404 && rUit.data.error === 'BIJLAGE_WEERGAVE_UIT');
  vlagWaarde = true;

  limietToestaan = false;
  check('4e перевищення частоти запитів → 429 RATE_LIMITED', (await roepOcr({ bron: 'mail', messageId: 'msg_123', attachmentId: 'att_1' })).status === 429);
  limietToestaan = true;

  const rMailGroot = await roepOcr({ bron: 'mail', accountId: 'a1', messageId: 'msg_te_groot', attachmentId: 'att_1', filename: 'scan.pdf' });
  const rCloudGroot = await roepOcr({ bron: 'cloud', bestandId: 'wolk_groot', filename: 'groot.pdf' });
  check(
    '4f вкладення понад 20 МБ (пошта і хмара) → 200 status=te_groot без виклику рушія OCR',
    rMailGroot.status === 200 && rMailGroot.data.status === 'te_groot'
      && rCloudGroot.status === 200 && rCloudGroot.data.status === 'te_groot'
      && ocrOproepen === 0,
  );

  const rZip = await roepOcr({ bron: 'cloud', bestandId: 'wolk_zip', filename: 'archief.zip' });
  check('4g непідтримуваний формат (.zip) → status=niet_ondersteund без виклику рушія OCR', rZip.status === 200 && rZip.data.status === 'niet_ondersteund' && ocrOproepen === 0);

  check('4h невідомий файл у хмарі → 404 BESTAND_ONBEKEND', (await roepOcr({ bron: 'cloud', bestandId: 'onbekend' })).status === 404);

  // Клієнт навмисне передає ruimte: 'prive' у тілі, але сеанс технічний — має спрацювати виключно ruimteVanSessie ('technisch')!
  const rOk = await roepOcr({ bron: 'cloud', bestandId: 'wolk_scan_1', ruimte: 'prive' });
  check(
    '4i успішне розпізнавання скану передає ізольований ключ { userId, ruimte } із сеансу та повертає текст і кількість сторінок',
    rOk.status === 200
      && rOk.data.ok === true
      && rOk.data.status === 'ok'
      && rOk.data.paginas === 2
      && String(rOk.data.tekst).includes('920 грн')
      && ocrOproepen === 1
      && laatstGezienSleutel?.userId === 'u-goed'
      && laatstGezienSleutel?.ruimte === 'technisch',
  );

  // ---------------------------------------------------------------- 5. Чисті клієнтські функції Етапів 3–4
  check(
    '5a kanScanHerkennen приймає PDF і растрові фото <= 20 МБ та відхиляє SVG, архіви, порожні й надвеликі файли',
    kanScanHerkennen('scan.pdf', 'application/pdf', 1024)
      && kanScanHerkennen('foto.tiff', 'image/tiff', MAX_SCAN_OCR_BYTES)
      && !kanScanHerkennen('groot.pdf', 'application/pdf', MAX_SCAN_OCR_BYTES + 1)
      && !kanScanHerkennen('leeg.png', 'image/png', 0)
      && !kanScanHerkennen('vector.svg', 'image/svg+xml', 500)
      && !kanScanHerkennen('pakket.zip', 'application/zip', 5000),
  );
  check(
    '5b ocrFoutUitleg дає відмінні змістовні українські та нідерландські пояснення для всіх станів',
    ['leeg', 'te_groot', 'niet_ondersteund', 'ocr_niet_beschikbaar', 'geen_toegang', 'te_veel_verzoeken', 'fout'].every((st) => {
      const uk = ocrFoutUitleg(st, 'uk');
      const nl = ocrFoutUitleg(st, 'nl');
      return uk.length > 12 && nl.length > 12 && uk !== nl;
    }),
  );

  check(
    '5c dagenTot і termijnHint точно рахують прострочення, сьогодні, завтра, найближчі 7 днів і віддалену дату (uk/nl)',
    dagenTot('2026-11-20', nu) === -2
      && termijnHint('2026-11-20', 'uk', nu)?.tekst === 'прострочено на 2 дні'
      && termijnHint('2026-11-20', 'nl', nu)?.dringend === 'verlopen'
      && termijnHint('2026-11-22', 'uk', nu)?.tekst === 'сьогодні'
      && termijnHint('2026-11-23', 'nl', nu)?.tekst === 'morgen'
      && termijnHint('2026-11-27', 'uk', nu)?.dringend === 'binnenkort'
      && termijnHint('2026-12-10', 'uk', nu)?.dringend === 'later'
      && termijnHint('ongeldig', 'uk', nu) === null,
  );

  const sleutelA = betalingSleutelKort({
    profielId: 'p1',
    rekeningId: 'acc1',
    briefId: 'm1',
    bijlageId: 'b1',
    velden: { bedrag: { centen: 124000, valuta: 'EUR', bron: '1240 EUR' }, termijn: { iso: '2026-12-05', bron: '05.12.2026' }, nummer: null },
  });
  const sleutelB = betalingSleutelKort({
    profielId: 'p1',
    rekeningId: 'acc1',
    briefId: 'm1',
    bijlageId: 'b2',
    velden: { bedrag: { centen: 124000, valuta: 'EUR', bron: '1240 EUR' }, termijn: { iso: '2026-12-05', bron: '05.12.2026' }, nummer: null },
  });
  const googleUrl = googleAgendaAdres({ titel: 'Оплата: INV-7', beschrijving: 'Сума: 1 240,00 €', begin: '2026-12-05', einde: '2026-12-05' });
  check(
    '5d betalingSleutelKort задовольняє ^[A-Za-z0-9_-]{8,120}$, а googleAgendaAdres ставить кінець цілоденної події наступним днем',
    /^[A-Za-z0-9_-]{8,120}$/.test(sleutelA)
      && sleutelA !== sleutelB
      && googleUrl.startsWith('https://calendar.google.com/calendar/render?')
      && googleUrl.includes('dates=20261205%2F20261206'),
  );

  // Межа 200 записів для betalingSpoor / bewaarBetalingSpoor у штучному localStorage
  const opslagMap = new Map<string, string>();
  const vorigStorage = (globalThis as { localStorage?: Storage }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => opslagMap.get(k) ?? null,
    setItem: (k: string, v: string) => { opslagMap.set(k, v); },
    removeItem: (k: string) => { opslagMap.delete(k); },
  };
  try {
    for (let i = 0; i < 205; i += 1) {
      bewaarBetalingSpoor(`sl-${i}`, { doel: 'onze-agenda', wanneer: 1000 + i, datum: '2026-12-05' });
    }
    check(
      '5e bewaarBetalingSpoor обмежує пам’ять 200 найновішими записами',
      betalingSpoor('sl-0') === null && betalingSpoor('sl-204')?.doel === 'onze-agenda',
    );
  } finally {
    (globalThis as { localStorage?: Storage }).localStorage = vorigStorage;
  }

  check(
    '5f toontOndertekenen вмикає дію для рахунку, договору й PDF та вимикає для звичайного фото й архіву',
    toontOndertekenen('rekening', 'application/pdf', 'factuur.pdf')
      && toontOndertekenen('contract', 'application/pdf', 'overeenkomst.pdf')
      && toontOndertekenen('document', 'application/pdf', 'brief.pdf')
      && !toontOndertekenen('foto', 'image/jpeg', 'vakantie.jpg')
      && !toontOndertekenen('archief', 'application/zip', 'archief.zip'),
  );

  check(
    '5g foutTekst узгоджує рід в українській мові для всіх 4 джерел WeergaveBron',
    foutTekst('FOUT', 'post')[0].includes('Сервер пошти не віддав')
      && foutTekst('FOUT', 'schijf')[0].includes('Сховище файлів не віддало')
      && foutTekst('FOUT', 'melding')[0].includes('Служба сповіщень не віддала')
      && foutTekst('FOUT', 'bestand')[0].includes('Джерело файла не віддало'),
  );

  check(
    '5h veiligeMiniAdres та MINI_MAX_BASE64 відсікають сторонні адреси й // та дозволяють blob: і відносний шлях',
    MINI_MAX_BASE64 === 3 * 1024 * 1024
      && veiligeMiniAdres('blob:https://hub.tarasevych.com/123') === 'blob:https://hub.tarasevych.com/123'
      && veiligeMiniAdres('/api/owner/bestand/1') === '/api/owner/bestand/1'
      && veiligeMiniAdres('//kwaadaardig.example/x.png') === ''
      && veiligeMiniAdres('https://kwaadaardig.example/x.png') === ''
      && veiligeMiniAdres('javascript:alert(1)') === '',
  );

  // ---------------------------------------------------------------- 6. Перевірка врізів і Абсолютного мовного закону
  const gecontroleerdeBestanden = [
    'backend/bijlage-weergave-ocr.ts',
    'backend/bijlage-telegram-melding.ts',
    'shared/bijlage-weergave/kaart-kenmerken.ts',
    'shared/bijlage-weergave/telegram-kaart.ts',
    'src/bijlage-weergave/ocr-client.ts',
    'src/bijlage-weergave/ZoekVeld.tsx',
    'src/bijlage-weergave/MeldingKaart.tsx',
    'src/cloud-vnext/DetailPaneel.tsx',
    'src/voorbeeld/VoorbeeldVenster.tsx',
  ].filter(existsSync);

  const samengevoegd = gecontroleerdeBestanden.map((p) => readFileSync(p, 'utf8')).join('\n');
  check('6a нуль заборонених літер у всіх нових та оновлених файлах переглядача', !VERBODEN_LETTERS.test(samengevoegd));
  check('6b нуль активних дієприкметників на -учий/-ючий/-ачий/-ячий', !ACTIEF_DEELWOORD.test(samengevoegd));

  const detailTekst = readFileSync('src/cloud-vnext/DetailPaneel.tsx', 'utf8');
  const voorbeeldTekst = readFileSync('src/voorbeeld/VoorbeeldVenster.tsx', 'utf8');
  check(
    '6c DetailPaneel.tsx та VoorbeeldVenster.tsx підключають WeergaveKopLui і розпізнавання сканів суворо за прапорцем WEERGAVE_VLAG',
    detailTekst.includes('useVlag(WEERGAVE_VLAG') && detailTekst.includes('WeergaveKopLui') && detailTekst.includes('vraagBijlageOcrTekst')
      && voorbeeldTekst.includes('useVlag(WEERGAVE_VLAG') && voorbeeldTekst.includes('WeergaveKopLui') && voorbeeldTekst.includes('WeergaveStrookLui') && voorbeeldTekst.includes('vraagBijlageOcrTekst'),
  );

  const serverBestanden = ['backend/bijlage-weergave-ocr.ts', 'backend/bijlage-telegram-melding.ts'].map((p) => readFileSync(p, 'utf8')).join('\n');
  check('6d нові серверні модулі не імпортують vlaggen напряму і не містять naarTelegrams(', !/vlaggen['"]/.test(serverBestanden) && !/naarTelegrams\s*\(/.test(serverBestanden));

  return einde();
}
