// Спільний перегляд вкладень, етап 4 (CONSOL-001 / SPIL-WEERGAVE):
// серверне малювання 11 окремих PNG-карток станів вкладень (640×320, node:zlib без сторонніх залежностей)
// та безпечне доставлення сповіщень про вкладення у прив’язані чати Telegram через sendPhoto.
// Вміст самого файла у Telegram НІКОЛИ не передається — лише картка стану, двомовний підпис і кнопка переходу на сайт.
// Модуль прапорців сюди не імпортується: перевірка прапорця надходить через ін’єкцію vlagAan із backend/index.ts.

import { crc32, deflateSync } from 'node:zlib';
import { bijlageKaartKenmerken } from '../shared/bijlage-weergave/kaart-kenmerken';
import {
  TELEGRAM_KAART_HEX,
  TELEGRAM_KAART_STATEN,
  telegramKaartVoor,
  type TelegramKaartInvoer,
  type TelegramKaartStaat,
} from '../shared/bijlage-weergave/telegram-kaart';
import { LINK_DIENSTEN, routeerMeldingLink, type LinkDienst } from '../shared/melding-link';
import type { MeldingEcosysteemGebeurtenis, MeldingEcosysteemProfiel } from '../shared/meldingen-ecosysteem';
import type { Lade } from '../shared/ruimte-scheiding';
import { journaalSchrijf } from './beheer-journaal';
import { SERVICE_HOSTS } from './deployment-identiteit';
import { taalVoor } from './telegram-aanmelden/berichten';
import { botAanroep } from './telegram-aanmelden/bot-api';
import { instellingen, koppelingenVanGebruiker } from './telegram-aanmelden/opslag';
import { botSleutel } from './telegram-aanmelden/sleutels';

type Rgb = [number, number, number];

const ZEGEL_DONKER: Rgb = [0x1e, 0x2a, 0x6b];
const ZEGEL_LICHT: Rgb = [0x3d, 0x5b, 0xd9];
const WIT: Rgb = [0xff, 0xff, 0xff];
const SCHADUW: Rgb = [0x0f, 0x17, 0x33];
const GOUD: Rgb = [0xe8, 0xc6, 0x6a];

function leesHexKleur(h: string | undefined, terugval: string): Rgb {
  const schoon = typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h.trim()) ? h.trim() : terugval;
  return [
    parseInt(schoon.slice(1, 3), 16),
    parseInt(schoon.slice(3, 5), 16),
    parseInt(schoon.slice(5, 7), 16),
  ];
}

class Doek {
  readonly px: Uint8Array;
  readonly palet: Rgb[] = [];

  constructor(readonly b: number, readonly h: number, achtergrond: Rgb) {
    this.px = new Uint8Array(b * h);
    this.px.fill(this.kleur(achtergrond));
  }

  kleur(c: Rgb): number {
    const i = this.palet.findIndex((p) => p[0] === c[0] && p[1] === c[1] && p[2] === c[2]);
    if (i >= 0) return i;
    if (this.palet.length >= 256) return 0;
    this.palet.push(c);
    return this.palet.length - 1;
  }

  zet(x: number, y: number, k: number) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx >= 0 && ry >= 0 && rx < this.b && ry < this.h) {
      this.px[ry * this.b + rx] = k;
    }
  }

  rechthoek(x0: number, y0: number, b: number, h: number, c: Rgb, r = 0) {
    const k = this.kleur(c);
    const rx0 = Math.round(x0);
    const ry0 = Math.round(y0);
    const rb = Math.round(b);
    const rh = Math.round(h);
    for (let y = ry0; y < ry0 + rh; y += 1) {
      for (let x = rx0; x < rx0 + rb; x += 1) {
        const dx = Math.max(rx0 + r - x, 0, x - (rx0 + rb - 1 - r));
        const dy = Math.max(ry0 + r - y, 0, y - (ry0 + rh - 1 - r));
        if (dx * dx + dy * dy <= r * r) this.zet(x, y, k);
      }
    }
  }

  cirkel(cx: number, cy: number, r: number, c: Rgb) {
    const k = this.kleur(c);
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.zet(x, y, k);
      }
    }
  }

  ring(cx: number, cy: number, r: number, dikte: number, c: Rgb) {
    const k = this.kleur(c);
    for (let y = Math.floor(cy - r - dikte); y <= Math.ceil(cy + r + dikte); y += 1) {
      for (let x = Math.floor(cx - r - dikte); x <= Math.ceil(cx + r + dikte); x += 1) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (d <= r + dikte / 2 && d >= r - dikte / 2) this.zet(x, y, k);
      }
    }
  }

  boog(cx: number, cy: number, r: number, dikte: number, vanRad: number, totRad: number, c: Rgb) {
    const stappen = Math.max(24, Math.ceil(Math.abs(totRad - vanRad) * r * 1.5));
    for (let i = 0; i <= stappen; i += 1) {
      const hoek = vanRad + ((totRad - vanRad) * i) / stappen;
      this.cirkel(cx + Math.cos(hoek) * r, cy + Math.sin(hoek) * r, dikte / 2, c);
    }
  }

  veelhoek(punten: Array<[number, number]>, c: Rgb) {
    const k = this.kleur(c);
    const ys = punten.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += 1) {
      const snij: number[] = [];
      for (let i = 0; i < punten.length; i += 1) {
        const [x1, y1] = punten[i];
        const [x2, y2] = punten[(i + 1) % punten.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          snij.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      snij.sort((a, b) => a - b);
      for (let i = 0; i + 1 < snij.length; i += 2) {
        for (let x = Math.ceil(snij[i]); x <= Math.floor(snij[i + 1]); x += 1) {
          this.zet(x, y, k);
        }
      }
    }
  }

  lijn(x1: number, y1: number, x2: number, y2: number, dikte: number, c: Rgb) {
    const stappen = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
    for (let i = 0; i <= stappen; i += 1) {
      this.cirkel(x1 + ((x2 - x1) * i) / stappen, y1 + ((y2 - y1) * i) / stappen, dikte / 2, c);
    }
  }
}

/** Фірмовий щит «Мій простір» ліворуч на картці. */
function tekenZegel(d: Doek, cx: number, cy: number, s: number) {
  d.cirkel(cx, cy, s * 1.05, WIT);
  d.cirkel(cx, cy, s, ZEGEL_DONKER);
  d.ring(cx, cy, s * 0.86, Math.max(2, s * 0.06), GOUD);
  const schild = (f: number): Array<[number, number]> => [
    [cx - s * 0.5 * f, cy - s * 0.45 * f],
    [cx, cy - s * 0.62 * f],
    [cx + s * 0.5 * f, cy - s * 0.45 * f],
    [cx + s * 0.44 * f, cy + s * 0.15 * f],
    [cx, cy + s * 0.62 * f],
    [cx - s * 0.44 * f, cy + s * 0.15 * f],
  ];
  d.veelhoek(schild(1), ZEGEL_LICHT);
  d.veelhoek(schild(0.78), ZEGEL_DONKER);
}

/** 11 власних відмінних векторно-растрових піктограм — окремо для кожного з 11 станів вкладення. */
function tekenStaatPictogram(d: Doek, staat: TelegramKaartStaat, cx: number, cy: number, staatKleur: Rgb) {
  switch (staat) {
    case 'rekening-nieuw': {
      // Рахунок із зубчастим нижнім краєм та рядками суми
      d.veelhoek([
        [cx - 38, cy - 50],
        [cx + 38, cy - 50],
        [cx + 38, cy + 46],
        [cx + 25, cy + 34],
        [cx + 12, cy + 46],
        [cx, cy + 34],
        [cx - 12, cy + 46],
        [cx - 25, cy + 34],
        [cx - 38, cy + 46],
      ], WIT);
      d.rechthoek(cx - 24, cy - 32, 48, 7, staatKleur, 3);
      d.rechthoek(cx - 24, cy - 16, 34, 7, staatKleur, 3);
      d.rechthoek(cx - 24, cy + 8, 48, 11, GOUD, 4);
      break;
    }
    case 'termijn-binnenkort': {
      // Пісковий годинник
      d.rechthoek(cx - 38, cy - 50, 76, 9, WIT, 4);
      d.rechthoek(cx - 38, cy + 41, 76, 9, WIT, 4);
      d.veelhoek([[cx - 30, cy - 41], [cx + 30, cy - 41], [cx + 5, cy - 2], [cx - 5, cy - 2]], WIT);
      d.veelhoek([[cx - 5, cy + 2], [cx + 5, cy + 2], [cx + 30, cy + 41], [cx - 30, cy + 41]], WIT);
      d.veelhoek([[cx - 18, cy + 36], [cx + 18, cy + 36], [cx, cy + 16]], GOUD);
      break;
    }
    case 'termijn-vandaag': {
      // Календар із крапкою сьогоднішнього дня
      d.rechthoek(cx - 44, cy - 38, 88, 82, WIT, 12);
      d.rechthoek(cx - 44, cy - 38, 88, 22, ZEGEL_DONKER, 8);
      d.rechthoek(cx - 26, cy - 50, 10, 22, WIT, 4);
      d.rechthoek(cx + 16, cy - 50, 10, 22, WIT, 4);
      d.cirkel(cx, cy + 12, 16, staatKleur);
      break;
    }
    case 'termijn-verlopen': {
      // Знак оклику у товстому кільці прострочення
      d.ring(cx, cy, 56, 10, WIT);
      d.rechthoek(cx - 7, cy - 36, 14, 44, WIT, 6);
      d.cirkel(cx, cy + 24, 8, WIT);
      break;
    }
    case 'betaald': {
      // Широка галочка оплати в обідку
      d.ring(cx, cy, 58, 7, WIT);
      d.lijn(cx - 28, cy + 2, cx - 6, cy + 24, 15, WIT);
      d.lijn(cx - 6, cy + 24, cx + 32, cy - 20, 15, WIT);
      break;
    }
    case 'contract-nieuw': {
      // Аркуш договору з круглою печаткою й стрічками
      d.rechthoek(cx - 38, cy - 48, 68, 92, WIT, 8);
      d.rechthoek(cx - 24, cy - 30, 40, 6, staatKleur, 2);
      d.rechthoek(cx - 24, cy - 15, 40, 6, staatKleur, 2);
      d.rechthoek(cx - 24, cy, 26, 6, staatKleur, 2);
      d.veelhoek([[cx + 14, cy + 24], [cx + 22, cy + 54], [cx + 30, cy + 44], [cx + 38, cy + 54], [cx + 32, cy + 24]], GOUD);
      d.cirkel(cx + 24, cy + 20, 17, GOUD);
      d.cirkel(cx + 24, cy + 20, 10, ZEGEL_DONKER);
      break;
    }
    case 'nieuwe-versie': {
      // Дві дугові стрілки оновлення версії
      d.boog(cx, cy, 44, 11, -Math.PI * 0.82, -Math.PI * 0.12, WIT);
      d.veelhoek([[cx + 42, cy - 28], [cx + 54, cy - 2], [cx + 26, cy - 8]], WIT);
      d.boog(cx, cy, 44, 11, Math.PI * 0.18, Math.PI * 0.88, WIT);
      d.veelhoek([[cx - 42, cy + 28], [cx - 54, cy + 2], [cx - 26, cy + 8]], WIT);
      break;
    }
    case 'verdacht': {
      // Трикутник остороги зі знаком оклику
      d.veelhoek([[cx, cy - 52], [cx + 54, cy + 42], [cx - 54, cy + 42]], WIT);
      d.rechthoek(cx - 6, cy - 20, 12, 34, staatKleur, 5);
      d.cirkel(cx, cy + 26, 7, staatKleur);
      break;
    }
    case 'onleesbaar': {
      // Косий хрестик помилки читання
      d.lijn(cx - 34, cy - 34, cx + 34, cy + 34, 15, WIT);
      d.lijn(cx + 34, cy - 34, cx - 34, cy + 34, 15, WIT);
      break;
    }
    case 'foto': {
      // Рамка світлини з горою та сонцем
      d.rechthoek(cx - 48, cy - 38, 96, 76, WIT, 10);
      d.rechthoek(cx - 38, cy - 28, 76, 56, staatKleur, 6);
      d.cirkel(cx - 18, cy - 10, 9, GOUD);
      d.veelhoek([[cx - 36, cy + 26], [cx - 8, cy - 4], [cx + 16, cy + 26]], WIT);
      d.veelhoek([[cx - 2, cy + 26], [cx + 20, cy + 4], [cx + 36, cy + 26]], WIT);
      break;
    }
    case 'document': {
      // Аркуш документа із загнутим кутиком
      d.veelhoek([
        [cx - 36, cy - 48],
        [cx + 14, cy - 48],
        [cx + 36, cy - 26],
        [cx + 36, cy + 48],
        [cx - 36, cy + 48],
      ], WIT);
      d.veelhoek([[cx + 14, cy - 48], [cx + 14, cy - 26], [cx + 36, cy - 26]], GOUD);
      d.rechthoek(cx - 22, cy - 8, 44, 7, staatKleur, 3);
      d.rechthoek(cx - 22, cy + 10, 32, 7, staatKleur, 3);
      break;
    }
  }
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

function pngVanDoek(d: Doek): Buffer {
  const rij = d.b * 3 + 1;
  const ruw = Buffer.alloc(rij * d.h);
  for (let y = 0; y < d.h; y += 1) {
    ruw[y * rij] = 0;
    for (let x = 0; x < d.b; x += 1) {
      const c = d.palet[d.px[y * d.b + x]];
      ruw.set(c, y * rij + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(d.b, 0);
  ihdr.writeUInt32BE(d.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(ruw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const staatKaartCache = new Map<string, Buffer>();

/** Малює (і зберігає в пам’яті) окрему PNG-картку 640×320 для заданого стану вкладення. */
export function tekenBijlageStaatKaartPng(staat: TelegramKaartStaat, hexKleur?: string): Buffer {
  const standaardHex = TELEGRAM_KAART_HEX[TELEGRAM_KAART_STATEN[staat].kleur];
  const kleurRgb = leesHexKleur(hexKleur, standaardHex);
  const sleutel = `${staat}|${kleurRgb.join(',')}`;
  const bestaand = staatKaartCache.get(sleutel);
  if (bestaand) return bestaand;

  const b = 640;
  const h = 320;
  const d = new Doek(b, h, kleurRgb);
  d.rechthoek(24, 24, b - 48, h - 48, SCHADUW, 28);
  d.rechthoek(20, 18, b - 48, h - 48, WIT, 28);
  d.rechthoek(20, 18, b - 48, 18, kleurRgb, 8);
  tekenZegel(d, 150, h / 2 + 6, 84);
  d.cirkel(430, h / 2 + 6, 88, kleurRgb);
  tekenStaatPictogram(d, staat, 430, h / 2 + 6, kleurRgb);

  const png = pngVanDoek(d);
  staatKaartCache.set(sleutel, png);
  return png;
}

function bepaalVeiligeSiteUrl(geb: MeldingEcosysteemGebeurtenis, siteBasis?: string): string {
  const standaard = siteBasis && /^https:\/\//i.test(siteBasis)
    ? siteBasis
    : `https://${SERVICE_HOSTS.hub}/melding`;
  const sub = String(geb.subdomein || '');
  const dienst: LinkDienst | undefined = sub === 'id'
    ? 'identity'
    : (LINK_DIENSTEN as readonly string[]).includes(sub)
      ? (sub as LinkDienst)
      : undefined;
  const actieHref = geb.acties?.find((a) => typeof a.href === 'string' && a.href.trim())?.href;
  const metaLink = typeof geb.meta?.link === 'string' ? geb.meta.link : undefined;
  const kandidaat = routeerMeldingLink(actieHref || metaLink || '/melding', { dienst }) || standaard;
  try {
    const u = new URL(kandidaat);
    return u.protocol === 'https:' ? u.toString() : standaard;
  } catch {
    return standaard;
  }
}

export type BijlageTelegramMeldingDeps = {
  vlagAan?: (u: { id: string }) => Promise<boolean>;
  leesProfielFn?: (lade: Lade) => Promise<Pick<MeldingEcosysteemProfiel, 'kanalen'>>;
  koppelingenFn?: typeof koppelingenVanGebruiker;
  taalFn?: typeof taalVoor;
  botSleutelFn?: typeof botSleutel;
  instellingenFn?: typeof instellingen;
  botAanroepFn?: typeof botAanroep;
  journaalFn?: typeof journaalSchrijf;
  siteBasis?: string;
  nu?: Date;
};

const MAX_KAARTEN_PER_MELDING = 3;

/**
 * Надсилає картку стану вкладення в усі прив’язані чати Telegram користувача з правом «meldingen».
 * Вміст файла ніколи не передається — лише растровий малюнок стану, двомовний підпис і кнопка переходу на сайт.
 */
export async function stuurBijlageMeldingNaarTelegram(
  lade: Lade,
  geb: MeldingEcosysteemGebeurtenis,
  deps: BijlageTelegramMeldingDeps = {},
): Promise<number> {
  if (!lade?.userId || !Array.isArray(geb?.bijlagen) || geb.bijlagen.length === 0) {
    return 0;
  }

  if (deps.vlagAan) {
    const aan = await deps.vlagAan({ id: lade.userId }).catch(() => false);
    if (!aan) return 0;
  }

  const leesProfielFn = deps.leesProfielFn ?? (async (l: Lade) => {
    const m = await import('./meldingen-ecosysteem');
    return m.leesProfiel(l);
  });
  const profiel = await leesProfielFn(lade).catch(() => null);
  if (profiel?.kanalen && profiel.kanalen[geb.kanaal]?.actief === false) {
    return 0;
  }

  const sleutelFn = deps.botSleutelFn ?? botSleutel;
  const sleutel = await sleutelFn().catch(() => '');
  if (!sleutel) return 0;

  const koppelingenFn = deps.koppelingenFn ?? koppelingenVanGebruiker;
  const alleKoppelingen = await koppelingenFn(lade.userId).catch(() => []);
  const ontvangers = alleKoppelingen.filter((k) => Array.isArray(k.rechten) && k.rechten.includes('meldingen'));
  if (ontvangers.length === 0) return 0;

  const instFn = deps.instellingenFn ?? instellingen;
  const inst = await instFn().catch(() => ({ afbeeldingen: true }));
  if (inst.afbeeldingen === false) return 0;

  const taalLezer = deps.taalFn ?? taalVoor;
  const roepBotAan = deps.botAanroepFn ?? botAanroep;
  const schrijfJournaal = deps.journaalFn ?? journaalSchrijf;
  const siteUrl = bepaalVeiligeSiteUrl(geb, deps.siteBasis);

  let verzonden = 0;
  let eersteStaat: TelegramKaartStaat | null = null;
  const bijlagen = geb.bijlagen.slice(0, MAX_KAARTEN_PER_MELDING);

  for (const k of ontvangers) {
    const { taal: ruweTaal } = await taalLezer(k.telegram_id).catch(() => ({ taal: k.site_taal || ('uk' as const), herkend: false }));
    const kaartTaal: 'uk' | 'nl' = ruweTaal === 'nl' ? 'nl' : 'uk';

    for (const b of bijlagen) {
      const kenm = bijlageKaartKenmerken(b.naam, b.mime, b.tekstVoorbeeld, kaartTaal);
      const meta = b.meta && typeof b.meta === 'object' ? b.meta : {};
      const vertrouwen = meta.vertrouwen === 'gevaar' || meta.vertrouwen === 'let-op' || meta.vertrouwen === 'goed'
        ? meta.vertrouwen
        : undefined;
      const invoer: TelegramKaartInvoer = {
        taal: kaartTaal,
        naam: b.naam,
        soortNaam: kenm.soortNaam,
        isRekening: kenm.isRekening,
        isContract: kenm.isContract,
        isFoto: kenm.isFoto,
        bedrag: kenm.bedrag,
        termijnIso: kenm.termijnIso,
        betaald: meta.betaald === 'ja' || meta.betaald === 'true',
        vertrouwen,
        onleesbaar: meta.onleesbaar === 'ja' || meta.onleesbaar === 'true',
        heeftVorigeVersie: meta.heeftVorigeVersie === 'ja' || meta.heeftVorigeVersie === 'true',
        siteUrl,
        ...(deps.nu ? { nu: deps.nu } : {}),
      };
      const kaart = telegramKaartVoor(invoer);
      const png = tekenBijlageStaatKaartPng(kaart.staat, kaart.hex);

      try {
        await roepBotAan(
          sleutel,
          'sendPhoto',
          {
            chat_id: k.chat_id,
            caption: kaart.onderschrift,
            parse_mode: 'HTML',
            ...(kaart.knop.url
              ? { reply_markup: { inline_keyboard: [[{ text: kaart.knop.tekst, url: kaart.knop.url }]] } }
              : {}),
          },
          {
            bestand: {
              veld: 'photo',
              naam: `bijlage-${kaart.staat}.png`,
              type: 'image/png',
              inhoud: png,
            },
          },
        );
        verzonden += 1;
        if (!eersteStaat) eersteStaat = kaart.staat;
      } catch {
        // Збій окремого чату не перериває доставку іншим прив’язаним отримувачам.
      }
    }
  }

  if (verzonden > 0 && eersteStaat) {
    await schrijfJournaal({
      actie: 'owner.meldingen.bijlage.telegram',
      actor: lade.userId,
      eigenaar: lade.userId,
      resultaat: 'success',
      doel: { soort: 'melding', id: String(geb.id || '').slice(0, 120) },
      details: { staat: eersteStaat, ruimte: lade.ruimte, verzonden },
      service: 'hub',
    }).catch(() => null);
  }

  return verzonden;
}
