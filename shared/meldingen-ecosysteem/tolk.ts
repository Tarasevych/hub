// Інтерпретатор (tolk) подій екосистеми сповіщень.
// Перетворює сигнали з будь-якого піддомену, серверного журналу, ПК-агента, розширення оглядача,
// сторінки (інформаційної смуги) чи пошти/сховища/ШІ в єдину структуровану подію екосистеми з діями, контекстом і вкладеннями.

import { normaliseerActies, normaliseerBijlagen, type MeldingActie, type MeldingBijlage, type MeldingEcosysteemGebeurtenis, type MeldingKanaal, type MeldingPrioriteit, type MeldingSubdomein, type RuimteType, SUBDOMEINEN } from './model';

export type RuweBronGebeurtenis = {
  id?: string;
  ruimte?: RuimteType;
  externeSleutel?: string;
  bron?: string;
  kanaal?: MeldingKanaal;
  subdomein?: MeldingSubdomein;
  soort?: string;
  ernst?: string;
  titel?: string;
  bericht?: string;
  uitleg?: string;
  contextLabel?: string;
  link?: string;
  aangemaaktOp?: number;
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
  if (/(^|[/:_\s-])(mail|gmail|imap|smtp|post)/.test(g)) return 'mail';
  if (/(^|[/:_\s-])(cloud|drive|bestand|opslag|s3)/.test(g)) return 'cloud';
  if (/(^|[/:_\s-])(github|git|pr|workflow|repo)/.test(g)) return 'github';
  if (/(^|[/:_\s-])(huis|home|scene|lamp|thermostat|slim)/.test(g)) return 'huis';
  if (/(^|[/:_\s-])(mcp|connector|agent|browser|pc|terminal)/.test(g)) return 'mcp';
  if (/(^|[/:_\s-])(ai|gemini|claude|openai|grok|chat|vertal)/.test(g)) return 'ai';
  if (/(^|[/:_\s-])(id|passkey|kluis|sleutelkluis|aanmeld|account|toegang|beveilig)/.test(g)) return 'id';
  if (/(^|[/:_\s-])(admin|uitrol|diagnose|audit|beheer)/.test(g)) return 'admin';
  if (/(^|[/:_\s-])(api|kluis-api)/.test(g)) return 'api';
  if (/(^|[/:_\s-])(systeem|versie|verbinding|netwerk)/.test(g)) return 'systeem';
  return fallback;
}

export function herkenKanaal(bron = '', soort = '', subdomein: MeldingSubdomein = 'hub'): MeldingKanaal {
  const b = `${bron} ${soort}`.toLowerCase();
  if (/(beveilig|security|passkey|sleutelkluis|kluis|toegang|login|auth|vergrendel|blokkeer|fout-auth)/.test(b)) return 'beveiliging';
  if (/(pc[_-]?agent|host|schijf|cpu|geheugen|docker|terminal|lokale[_-]?pc)/.test(b)) return 'pc_agent';
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
  if (/(kritiek|critical|geblokkeerd|dreiging|nood|crash|sleutel_dicht|toegang_geweigerd)/.test(s)) return 'kritiek';
  if (/(error|fout|warning|waarschuwing|hoog|high|mislukt|verouderd|verlopen|storing)/.test(s)) return 'hoog';
  if (kanaal === 'beveiliging' && !/geslaagd|succes|success|info/.test(s)) return 'hoog';
  if (/(laag|low|info|samenvatting|tip)/.test(s)) return 'laag';
  return 'normaal';
}

export function bouwStandaardActies(subdomein: MeldingSubdomein, kanaal: MeldingKanaal, link?: string, bijlagenCount = 0): MeldingActie[] {
  const acties: MeldingActie[] = [];
  if (link) {
    acties.push({
      id: 'open-link',
      labelUk: 'Відкрити на сторінці',
      labelNl: 'Openen op de pagina',
      soort: 'navigeer',
      href: link,
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
  const subdomein = invoer.subdomein ?? herkenSubdomein(invoer.bron || '', invoer.link || '', 'hub');
  const kanaal = invoer.kanaal ?? herkenKanaal(invoer.bron || '', invoer.soort || '', subdomein);
  const prioriteit = berekenPrioriteit(invoer.soort || '', invoer.ernst || '', kanaal);
  const bijlagen = normaliseerBijlagen(invoer.bijlagen);
  const eigenActies = normaliseerActies(invoer.acties);
  const acties = eigenActies.length ? eigenActies : bouwStandaardActies(subdomein, kanaal, invoer.link, bijlagen.length);
  const titel = String(invoer.titel || '').trim() || 'Подія системи / Systeemgebeurtenis';
  const externeSleutel = String(invoer.externeSleutel || invoer.id || '').trim().slice(0, 180);

  return {
    id: String(invoer.id || externeSleutel || `geb-${nu}-${Math.random().toString(36).slice(2, 8)}`),
    ruimte,
    externeSleutel,
    kanaal,
    subdomein,
    bron: String(invoer.bron || kanaal).slice(0, 120),
    prioriteit,
    status: invoer.gelezen ? 'gelezen' : 'nieuw',
    titel: titel.slice(0, 400),
    bericht: String(invoer.bericht || '').slice(0, 4000),
    uitleg: String(invoer.uitleg || '').slice(0, 2000),
    contextLabel: String(invoer.contextLabel || `${subdomein} · ${kanaal}`).slice(0, 240),
    herhalingen: 1,
    uitgesteldTot: null,
    bijlagen,
    acties,
    meta: { ...(invoer.meta || {}), ...(invoer.link ? { link: invoer.link } : {}) },
    aiSamenvatting: null,
    aangemaaktOp: nu,
    bijgewerktOp: nu,
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
