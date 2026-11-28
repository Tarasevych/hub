// Інтерпретатор (tolk) подій екосистеми сповіщень.
// Перетворює сигнали з будь-якого піддомену, серверного журналу, ПК-агента, розширення оглядача,
// сторінки (інформаційної смуги) чи пошти/сховища/ШІ в єдину структуровану подію екосистеми з діями, контекстом і вкладеннями.

import {
  GEBEURTENIS_STATUSSEN,
  normaliseerActies,
  normaliseerBijlagen,
  veiligeMeldingUrl,
  veiligePaginaLink,
  type MeldingActie,
  type MeldingBijlage,
  type MeldingEcosysteemGebeurtenis,
  type MeldingGebeurtenisStatus,
  type MeldingKanaal,
  type MeldingPrioriteit,
  type MeldingSubdomein,
  type RuimteType,
  SUBDOMEINEN,
} from './model';

export type RuweBronGebeurtenis = {
  id?: string;
  ruimte?: RuimteType;
  externeSleutel?: string;
  bron?: string;
  kanaal?: MeldingKanaal;
  subdomein?: MeldingSubdomein;
  soort?: string;
  ernst?: string;
  status?: MeldingGebeurtenisStatus;
  herhalingen?: number;
  titel?: string;
  bericht?: string;
  uitleg?: string;
  contextLabel?: string;
  link?: string;
  aangemaaktOp?: number;
  bijgewerktOp?: number;
  gelezen?: boolean;
  bijlagen?: unknown[];
  acties?: unknown[];
  meta?: Record<string, unknown>;
};

export function herkenSubdomein(bron = '', link = '', fallback: MeldingSubdomein = 'hub'): MeldingSubdomein {
  const g = `${bron} ${link}`.toLowerCase();
  const hostMatch = /https?:\/\/([a-z0-9-]+)\./.exec(g);
  if (hostMatch && (SUBDOMEINEN as readonly string[]).includes(hostMatch[1])) {
    return hostMatch[1] as MeldingSubdomein;
  }
  if (/(^|[/:_.\s-])(mail|gmail|imap|smtp|post)/.test(g)) return 'mail';
  if (/(^|[/:_.\s-])(cloud|drive|bestand|opslag|s3)/.test(g)) return 'cloud';
  if (/(^|[/:_.\s-])(github|git|pr|workflow|repo)/.test(g)) return 'github';
  if (/(^|[/:_.\s-])(huis|home|scene|lamp|thermostat|slim)/.test(g)) return 'huis';
  if (
    g.includes('owner.apparaat.nieuw') ||
    g.includes('apparaat.nieuw') ||
    /(?:^|[/:_\s-])(?:owner\.apparaat\.(?:nieuw|bevestigd|vergeten|melding)|apparaat\.(?:aangevraagd|bevestigd|niet-ik|fout-symbool|alarm|stap-op|ingetrokken|hersteld|gedeblokkeerd|telegram-sterk)|account\.email\.conflict)(?:$|[/:_.\s-])/.test(g)
  ) {
    return 'id';
  }
  if (/(^|[/:_.\s-])(mcp|connector|agent|browser|pc|terminal|remote|apparaat|vaardigheden|koppeling_gewijzigd)/.test(g)) return 'mcp';
  if (/(^|[/:_.\s-])(ai|gemini|claude|openai|grok|chat|vertal|geheugen)/.test(g)) return 'ai';
  if (/(^|[/:_.\s-])(id|passkey|kluis|sleutelkluis|aanmeld|aanmelden|account|toegang|beveilig|bevestigen|telegram|plaats-eis|stap-op|niet-ik|fout-symbool|privacy)/.test(g)) return 'id';
  if (/(^|[/:_.\s-])(admin|uitrol|diagnose|audit|beheer|klimop|orch|eigenaar_besluit|flags|ruimte|ondersteuning|impersonatie|zoek\.index)/.test(g)) return 'admin';
  if (/(^|[/:_.\s-])(api|kluis-api)/.test(g)) return 'api';
  if (/(^|[/:_.\s-])(systeem|versie|verbinding|netwerk)/.test(g)) return 'systeem';
  return fallback;
}

export function herkenKanaal(bron = '', soort = '', subdomein: MeldingSubdomein = 'hub'): MeldingKanaal {
  const b = `${bron} ${soort}`.toLowerCase();
  const isExplicieteBeveiligingInMail =
    /(security_warning|owner\.apparaat\.(?:nieuw|bevestigd|vergeten|melding)|account\.email\.conflict|niet-ik|fout-symbool)/.test(b);
  if (
    (subdomein !== 'mail' || isExplicieteBeveiligingInMail) &&
    /(beveilig|security|passkey|sleutelkluis|kluis|toegang|login|(?<![a-z])auth(?![a-z])|aanmeld|bevestigen|niet-ik|fout-symbool|stap-op|vergrendel|blokkeer|fout-auth|owner\.apparaat\.(?:nieuw|bevestigd|vergeten|melding)|apparaat\.(?:aangevraagd|bevestigd|niet-ik|fout-symbool|alarm|stap-op|ingetrokken|hersteld|gedeblokkeerd|telegram-sterk)|account\.email\.conflict)/.test(
      b,
    )
  ) {
    return 'beveiliging';
  }
  if (/(pc[_-]?agent|host|schijf|cpu|geheugen_pc|docker|terminal|remote|lokale[_-]?pc)/.test(b)) return 'pc_agent';
  if (/(extensie|extension|browser|tabblad|debugger)/.test(b)) return 'extensie';
  if (/(pagina|band|strook|banner|offline|versie|herlaad)/.test(b)) return 'pagina';
  if (subdomein === 'mail') return 'mail';
  if (subdomein === 'cloud') return 'cloud';
  if (subdomein === 'ai') return 'ai';
  if (subdomein === 'mcp') return 'mcp';
  if (subdomein === 'github') return 'github';
  if (subdomein === 'huis') return 'huis';
  if (subdomein === 'admin' || subdomein === 'systeem') return 'systeem';
  return 'app';
}

export function berekenPrioriteit(soort = '', ernst = '', kanaal: MeldingKanaal = 'app'): MeldingPrioriteit {
  const s = `${soort} ${ernst}`.toLowerCase();
  if (
    /(kritiek|critical|geblokkeerd|dreiging|nood|crash|sleutel_dicht|toegang_geweigerd|owner\.apparaat\.nieuw|apparaat\.nieuw|(?:\.|^)niet-ik|fout-symbool|\.alarm\.|account\.email\.conflict|vervalsing)/.test(
      s,
    )
  ) {
    return 'kritiek';
  }
  if (/(error|fout|warning|waarschuwing|hoog|high|mislukt|verouderd|verlopen|storing)/.test(s)) return 'hoog';
  if (kanaal === 'beveiliging' && !/geslaagd|succes|success|info/.test(s)) return 'hoog';
  if (/(laag|low|info|samenvatting|tip)/.test(s)) return 'laag';
  return 'normaal';
}

export function bouwStandaardActies(subdomein: MeldingSubdomein, kanaal: MeldingKanaal, link?: string, bijlagenCount = 0): MeldingActie[] {
  const acties: MeldingActie[] = [];
  const veiligeLink = veiligeMeldingUrl(link, 500);
  if (veiligeLink) {
    acties.push({
      id: 'open-link',
      labelUk: 'Відкрити на сторінці',
      labelNl: 'Openen op de pagina',
      soort: 'navigeer',
      href: veiligeLink,
    });
  } else {
    acties.push({
      id: `open-${subdomein}`,
      labelUk: `Перейти до розділу (${subdomein})`,
      labelNl: `Naar onderdeel (${subdomein})`,
      soort: 'navigeer',
      href: subdomein === 'systeem' ? '/' : `https://${subdomein === 'hub' ? 'hub' : subdomein}.tarasevych.com/`,
    });
  }
  if (bijlagenCount > 0) {
    acties.push({
      id: 'open-bijlagen',
      labelUk: 'Відкрити вкладення',
      labelNl: 'Bijlage bekijken',
      soort: 'bijlage',
    });
  }
  acties.push(
    {
      id: 'ai-ontleden',
      labelUk: 'Розбір ШІ',
      labelNl: 'AI-duiding',
      soort: 'ai',
    },
    {
      id: 'uitstel-30',
      labelUk: 'Відкласти на 30 хв',
      labelNl: '30 min uitstellen',
      soort: 'status',
      statusDoel: 'uitgesteld',
      uitstelMinuten: 30,
    },
    {
      id: 'oplossen',
      labelUk: kanaal === 'beveiliging' ? 'Позначити перевіреним' : 'Виконано',
      labelNl: kanaal === 'beveiliging' ? 'Als gecontroleerd markeren' : 'Opgelost',
      soort: 'status',
      statusDoel: 'opgelost',
    },
  );
  return acties;
}

export function interpreteerGebeurtenis(invoer: RuweBronGebeurtenis, ruimteFallback: RuimteType = 'prive'): MeldingEcosysteemGebeurtenis {
  const nu = Number(invoer.aangemaaktOp) || Date.now();
  const ruimte: RuimteType = invoer.ruimte === 'technisch' ? 'technisch' : ruimteFallback;
  // MELDLINK-001: het subdomein herkennen aan de link zoals de bron hem gaf; de link zelf wordt een absolute adres van een bestaande pagina.
  const ruweLink = veiligeMeldingUrl(invoer.link, 500);
  const bronEnSoort = `${invoer.bron || ''} ${invoer.soort || ''}`.trim();
  const subdomein = invoer.subdomein ?? herkenSubdomein(bronEnSoort, ruweLink || '', 'hub');
  const linkHint = { soort: invoer.soort || invoer.bron || '', subdomein: invoer.subdomein };
  const veiligeLink = veiligePaginaLink(invoer.link, linkHint, 500);
  const kanaal = invoer.kanaal ?? herkenKanaal(invoer.bron || '', invoer.soort || '', subdomein);
  const prioriteit = berekenPrioriteit(bronEnSoort, invoer.ernst || '', kanaal);
  const bijlagen = normaliseerBijlagen(invoer.bijlagen);
  const eigenActies = normaliseerActies(invoer.acties, linkHint);
  const acties = eigenActies.length ? eigenActies : bouwStandaardActies(subdomein, kanaal, veiligeLink, bijlagen.length);
  const titel = String(invoer.titel || '').trim() || 'Подія системи / Systeemgebeurtenis';
  const externeSleutel = String(invoer.externeSleutel || invoer.id || '').trim().slice(0, 180);
  const schoonMeta = (() => {
    const base: Record<string, unknown> = invoer.meta && typeof invoer.meta === 'object' ? { ...invoer.meta } : {};
    if ('link' in base) {
      const mLink = veiligeMeldingUrl(base.link, 500);
      if (mLink) base.link = mLink;
      else delete base.link;
    }
    if (veiligeLink) base.link = veiligeLink;
    return base;
  })();

  const status: MeldingGebeurtenisStatus =
    typeof invoer.status === 'string' && (GEBEURTENIS_STATUSSEN as readonly string[]).includes(invoer.status)
      ? (invoer.status as MeldingGebeurtenisStatus)
      : invoer.gelezen
        ? 'gelezen'
        : 'nieuw';
  const herhalingen =
    typeof invoer.herhalingen === 'number' && Number.isFinite(invoer.herhalingen) && invoer.herhalingen >= 1
      ? Math.min(100_000, Math.trunc(invoer.herhalingen))
      : 1;
  const bijgewerktOp =
    typeof invoer.bijgewerktOp === 'number' && Number.isFinite(invoer.bijgewerktOp) && invoer.bijgewerktOp > 0
      ? Math.trunc(invoer.bijgewerktOp)
      : nu;

  return {
    id: String(invoer.id || externeSleutel || `geb-${nu}-${Math.random().toString(36).slice(2, 8)}`),
    ruimte,
    externeSleutel,
    kanaal,
    subdomein,
    bron: String(invoer.bron || kanaal).slice(0, 120),
    prioriteit,
    status,
    titel: titel.slice(0, 400),
    bericht: String(invoer.bericht || '').slice(0, 4000),
    uitleg: String(invoer.uitleg || '').slice(0, 2000),
    contextLabel: String(invoer.contextLabel || `${subdomein} · ${kanaal}`).slice(0, 240),
    herhalingen,
    uitgesteldTot: null,
    bijlagen,
    acties,
    meta: schoonMeta,
    aiSamenvatting: null,
    aangemaaktOp: nu,
    bijgewerktOp,
  };
}

export function kanaalLabel(kanaal: MeldingKanaal, lang: 'uk' | 'nl'): string {
  const labels: Record<MeldingKanaal, [string, string]> = {
    beveiliging: ['Безпека й доступ', 'Beveiliging en toegang'],
    mail: ['Пошта', 'Post'],
    cloud: ['Хмара й файли', 'Cloud en bestanden'],
    ai: ['Штучний інтелект', 'Artificiële intelligentie'],
    mcp: ['Роз’єми MCP', 'MCP-koppelingen'],
    github: ['GitHub і код', 'GitHub en code'],
    huis: ['Розумний дім', 'Slim wonen'],
    pc_agent: ['Локальний ПК-агент', 'Lokale pc-agent'],
    extensie: ['Розширення оглядача', 'Browserextensie'],
    systeem: ['Платформа і сервер', 'Platform en server'],
    app: ['Вебзастосунки', 'Webtoepassingen'],
    pagina: ['Сигнали сторінок', 'Paginasignalen'],
  };
  return lang === 'nl' ? labels[kanaal][1] : labels[kanaal][0];
}

export function prioriteitLabel(prioriteit: MeldingPrioriteit, lang: 'uk' | 'nl'): string {
  const labels: Record<MeldingPrioriteit, [string, string]> = {
    kritiek: ['Критичний', 'Kritiek'],
    hoog: ['Високий', 'Hoog'],
    normaal: ['Звичайний', 'Normaal'],
    laag: ['Низький', 'Laag'],
  };
  return lang === 'nl' ? labels[prioriteit][1] : labels[prioriteit][0];
}

export function maakDemoBijlagenVoorTest(bijlage?: Partial<MeldingBijlage>): MeldingBijlage[] {
  return [
    {
      id: bijlage?.id || 'bijlage-1',
      naam: bijlage?.naam || 'rapport.txt',
      mime: bijlage?.mime || 'text/plain',
      grootteBytes: bijlage?.grootteBytes ?? 512,
      ...(bijlage?.tekstVoorbeeld ? { tekstVoorbeeld: bijlage.tekstVoorbeeld } : {}),
    },
  ];
}

const AANMELD_METHODE_WOORDEN: Readonly<Record<string, readonly [uk: string, nl: string]>> = {
  passkey: ['Ключ доступу', 'Toegangssleutel'],
  webauthn: ['Ключ доступу', 'Toegangssleutel'],
  password: ['Пароль', 'Wachtwoord'],
  code: ['Одноразовий код', 'Eenmalige code'],
  totp: ['Одноразовий код', 'Eenmalige code'],
  otp: ['Одноразовий код', 'Eenmalige code'],
  google: ['Google', 'Google'],
  telegram: ['Telegram', 'Telegram'],
  microsoft: ['Microsoft', 'Microsoft'],
  apple: ['Apple', 'Apple'],
  discord: ['Discord', 'Discord'],
};

export function vertaalAanmeldMethode(methode: string | undefined, lang: 'uk' | 'nl'): string {
  const sleutel = String(methode || '').trim().toLowerCase();
  if (!sleutel) return '';
  const paar = AANMELD_METHODE_WOORDEN[sleutel];
  return paar ? paar[lang === 'nl' ? 1 : 0] : '';
}
