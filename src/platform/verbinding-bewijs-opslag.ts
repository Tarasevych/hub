// Клієнтське тривале сховище та синхронізація доказів і хронології перерв зв’язку з сервером (HERSTEL-001).
// Зберігає кожен інцидент зв’язку у localStorage (до 60 записів, до 30 спроб на інцидент, суворо без чутливих даних),
// перетворює його на повноцінну подію екосистеми сповіщень зі збереженням історії після відновлення та синхронізує на сервер.

import { codeLabel, dienstNaam, dienstVanHostnaam, kiesTaal, tijdTekst, type Lang } from '../../shared/foutuitleg';
import {
  interpreteerGebeurtenis,
  SUBDOMEINEN,
  type MeldingEcosysteemGebeurtenis,
  type MeldingSubdomein,
  type RuimteType,
} from '../../shared/meldingen-ecosysteem';
import { meldingLichaam } from '../meldingen/sessie-context';

export const VERBINDING_INCIDENTEN_SLEUTEL = 'mr:verbinding:incidenten:v1';
const MAX_INCIDENTEN = 60;
const MAX_POGINGEN = 30;
const ACTIEF_VENSTER_MS = 30 * 60_000;

export type VerbindingPogingBewijs = {
  nr: number;
  tijd: number;
  route: string;
  status: number;
  code: string;
};

export type VerbindingIncidentBewijs = {
  id: string;
  ruimte: 'technisch' | 'prive';
  soort: 'server_storing' | 'netwerk_offline';
  dienst: string;
  eersteTijd: number;
  laatsteTijd: number;
  hersteldOp: number | null;
  duurMs: number | null;
  laatsteStatus: number;
  laatsteCode: string;
  laatsteRoute: string;
  uitrolStand: 'bezig' | 'nee' | 'onbekend';
  rauwVoorbeeld: string;
  pogingen: VerbindingPogingBewijs[];
  gesynchroniseerdOp: number | null;
};

const luisteraars = new Set<(lijst: VerbindingIncidentBewijs[]) => void>();

const kanaal: BroadcastChannel | null = (() => {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel('mr-verbinding-bewijs') : null;
  } catch {
    return null;
  }
})();

function verwittig(lijst: VerbindingIncidentBewijs[], uitzenden = true) {
  for (const fn of luisteraars) {
    try {
      fn(lijst);
    } catch {
      /* слухач не перериває збереження доказів */
    }
  }
  if (uitzenden) {
    try {
      kanaal?.postMessage({ soort: 'incidenten-bijgewerkt' });
    } catch {
      /* канал між вкладками недоступний */
    }
  }
}

kanaal?.addEventListener('message', (ev) => {
  if (ev.data && typeof ev.data === 'object' && (ev.data as { soort?: string }).soort === 'incidenten-bijgewerkt') {
    verwittig(leesVerbindingIncidenten(), false);
  }
});

/** Очищує уривки відповідей і заголовків від будь-яких ключів, паролів, реп’яшків та довгих кодових рядків. */
export function schoonBewijsTekst(ruw: string, maxLen = 500): string {
  if (!ruw) return '';
  let s = String(ruw);
  s = s.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [приховано]');
  s = s.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[приховано]');
  s = s.replace(
    /([?&])(token|access_token|refresh_token|id_token|key|api_key|apikey|secret|password|wachtwoord|code|session|session_id|sid|cookie|auth|signature|sig)=([^&\s#"'<>]+)/gi,
    '$1$2=[приховано]',
  );
  s = s.replace(
    /\b(authorization|cookie|set-cookie|x-api-key|x-goog-api-key|"token"|"access_token"|"refresh_token"|"secret"|"password"|"wachtwoord"|"apiKey")\s*([:=])\s*("[^"]*"|'[^']*'|[^\s,;}\]]+)/gi,
    '$1$2[приховано]',
  );
  s = s.replace(/\b\d{6,12}:[A-Za-z0-9_-]{24,}\b/g, '[приховано]');
  s = s.replace(/\b[0-9a-fA-F]{24,}\b/g, '[приховано]');
  s = s.replace(/(?<![/A-Za-z0-9_-])[A-Za-z0-9+=_-]{36,}(?![/A-Za-z0-9_-])/g, '[приховано]');
  return s.trim().slice(0, maxLen);
}

/** Повертає чистий час ГГ:ХХ:СС без префікса «остання спроба» / «laatste poging». */
export function klokTijd(taal: Lang, ms: number, zone?: string): string {
  return tijdTekst(taal, ms, zone)
    .replace(/^(?:остання спроба|laatste poging)\s+/i, '')
    .trim();
}

/** Очищує HTTP-маршрут від чутливих параметрів запиту та довгих одноразових ідентифікаторів у шляху. */
export function schoonRouteBewijs(ruw: string): string {
  if (!ruw) return '';
  const schoon = schoonBewijsTekst(String(ruw), 240);
  const match = /^([A-Z]{2,8}\s+)?([^\s?#]+)(\?[^\s#]*)?/.exec(schoon);
  if (!match) return schoon.slice(0, 180);
  const methode = match[1] || '';
  const pad = match[2]
    .split('/')
    .map((deel) => {
      if (!deel) return '';
      if (/^[0-9a-fA-F-]{24,}$/.test(deel) || /^[A-Za-z0-9_-]{32,}$/.test(deel)) return '[приховано]';
      return deel;
    })
    .join('/');
  const vraag = match[3] || '';
  return `${methode}${pad}${vraag}`.trim().slice(0, 180);
}

export function bepaalVerbindingRuimte(dienst?: string): 'technisch' | 'prive' {
  const d = String(dienst || '').toLowerCase();
  if (d === 'admin') return 'technisch';
  if (typeof document !== 'undefined') {
    try {
      if (document.querySelector('[data-ruimte-actief="technisch"], .tech-band[data-actief="1"], #tech-laag[data-actief="1"]')) {
        return 'technisch';
      }
    } catch {
      /* поза переглядачем */
    }
  }
  return 'prive';
}

function subdomeinVanDienst(dienst: string): MeldingSubdomein {
  const d = String(dienst || '').toLowerCase();
  if (d === 'identity') return 'id';
  if ((SUBDOMEINEN as readonly string[]).includes(d)) return d as MeldingSubdomein;
  return 'systeem';
}

function journaalPadVoorHost(): string {
  if (typeof location === 'undefined') return 'https://admin.tarasevych.com/updates';
  const delen = location.hostname.split('.');
  return delen.length >= 3 ? `${location.protocol}//admin.${delen.slice(1).join('.')}/updates` : '/updates';
}

export function duurTekst(lang: 'uk' | 'nl', duurMs: number | null): string {
  const uk = lang !== 'nl';
  if (duurMs === null || !Number.isFinite(duurMs) || duurMs < 0) {
    return uk ? 'триває' : 'bezig';
  }
  if (duurMs < 1000) return uk ? 'менше 1 с' : 'minder dan 1 s';
  const totaalSec = Math.round(duurMs / 1000);
  if (totaalSec < 60) return uk ? `${totaalSec} с` : `${totaalSec} s`;
  const min = Math.floor(totaalSec / 60);
  const sec = totaalSec % 60;
  if (min < 60) {
    return sec > 0
      ? (uk ? `${min} хв ${sec} с` : `${min} min ${sec} s`)
      : (uk ? `${min} хв` : `${min} min`);
  }
  const uren = Math.floor(min / 60);
  const restMin = min % 60;
  return restMin > 0
    ? (uk ? `${uren} год ${restMin} хв` : `${uren} u ${restMin} min`)
    : (uk ? `${uren} год` : `${uren} u`);
}

function normaliseerOpgeslagenIncident(raw: unknown): VerbindingIncidentBewijs | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id || '').trim().slice(0, 180);
  if (!id) return null;
  const dienst = String(r.dienst || 'hub').trim().slice(0, 40) || 'hub';
  const soort = r.soort === 'netwerk_offline' ? 'netwerk_offline' : 'server_storing';
  const ruimte = r.ruimte === 'technisch' ? 'technisch' : 'prive';
  const eersteTijd = Math.max(1, Math.trunc(Number(r.eersteTijd) || Date.now()));
  const laatsteTijd = Math.max(eersteTijd, Math.trunc(Number(r.laatsteTijd) || eersteTijd));
  const hersteldOp = r.hersteldOp !== null && r.hersteldOp !== undefined && Number(r.hersteldOp) > 0
    ? Math.max(eersteTijd, Math.trunc(Number(r.hersteldOp)))
    : null;
  const duurMs = hersteldOp !== null ? Math.max(0, hersteldOp - eersteTijd) : null;
  const uitrolStand = r.uitrolStand === 'bezig' || r.uitrolStand === 'nee' ? r.uitrolStand : 'onbekend';
  const pogingenRuw = Array.isArray(r.pogingen) ? r.pogingen : [];
  const pogingen: VerbindingPogingBewijs[] = pogingenRuw
    .filter((p) => p && typeof p === 'object')
    .slice(-MAX_POGINGEN)
    .map((p, idx) => {
      const po = p as Record<string, unknown>;
      return {
        nr: Math.max(1, Math.trunc(Number(po.nr) || idx + 1)),
        tijd: Math.max(1, Math.trunc(Number(po.tijd) || eersteTijd)),
        route: schoonRouteBewijs(String(po.route || '')),
        status: Math.max(0, Math.trunc(Number(po.status) || 0)),
        code: schoonBewijsTekst(String(po.code || ''), 64),
      };
    });
  const gesynchroniseerdOp = r.gesynchroniseerdOp !== null && r.gesynchroniseerdOp !== undefined && Number(r.gesynchroniseerdOp) > 0
    ? Math.trunc(Number(r.gesynchroniseerdOp))
    : null;

  return {
    id,
    ruimte,
    soort,
    dienst,
    eersteTijd,
    laatsteTijd,
    hersteldOp,
    duurMs,
    laatsteStatus: Math.max(0, Math.trunc(Number(r.laatsteStatus) || 0)),
    laatsteCode: schoonBewijsTekst(String(r.laatsteCode || ''), 64),
    laatsteRoute: schoonRouteBewijs(String(r.laatsteRoute || '')),
    uitrolStand,
    rauwVoorbeeld: schoonBewijsTekst(String(r.rauwVoorbeeld || ''), 500),
    pogingen: pogingen.length > 0 ? pogingen : [{
      nr: 1,
      tijd: eersteTijd,
      route: schoonRouteBewijs(String(r.laatsteRoute || '')),
      status: Math.max(0, Math.trunc(Number(r.laatsteStatus) || 0)),
      code: schoonBewijsTekst(String(r.laatsteCode || ''), 64),
    }],
    gesynchroniseerdOp,
  };
}

export function leesVerbindingIncidenten(): VerbindingIncidentBewijs[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(VERBINDING_INCIDENTEN_SLEUTEL);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normaliseerOpgeslagenIncident)
      .filter((x): x is VerbindingIncidentBewijs => x !== null)
      .sort((a, b) => b.eersteTijd - a.eersteTijd)
      .slice(0, MAX_INCIDENTEN);
  } catch {
    return [];
  }
}

function schrijfVerbindingIncidenten(lijst: VerbindingIncidentBewijs[], uitzenden = true): VerbindingIncidentBewijs[] {
  const gesorteerd = [...lijst]
    .sort((a, b) => b.eersteTijd - a.eersteTijd)
    .slice(0, MAX_INCIDENTEN);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(VERBINDING_INCIDENTEN_SLEUTEL, JSON.stringify(gesorteerd));
    }
  } catch {
    /* обмеження пам’яті оглядача не ламає інтерфейс */
  }
  verwittig(gesorteerd, uitzenden);
  return gesorteerd;
}

export function registreerVerbindingPoging(invoer: {
  soort: 'server_storing' | 'netwerk_offline';
  dienst?: string;
  ruimte?: 'technisch' | 'prive';
  status?: number;
  code?: string;
  route?: string;
  tijd?: number;
  poging?: number;
  lichaam?: string;
  uitrolStand?: 'bezig' | 'nee' | 'onbekend';
}): VerbindingIncidentBewijs {
  const dienst = String(
    invoer.dienst || (typeof location !== 'undefined' ? dienstVanHostnaam(location.hostname) : 'hub'),
  ).trim() || 'hub';
  const nu = typeof invoer.tijd === 'number' && Number.isFinite(invoer.tijd) && invoer.tijd > 0
    ? Math.trunc(invoer.tijd)
    : Date.now();
  const status = Math.max(0, Math.trunc(Number(invoer.status) || 0));
  const code = schoonBewijsTekst(
    String(invoer.code || (invoer.soort === 'netwerk_offline' ? 'BROWSER_OFFLINE' : status > 0 ? `HTTP_${status}` : 'NETWORK_ERROR')),
    64,
  );
  const route = schoonRouteBewijs(String(invoer.route || ''));
  const rauw = schoonBewijsTekst(String(invoer.lichaam || ''), 500);
  const uitrolStand = invoer.uitrolStand === 'bezig' || invoer.uitrolStand === 'nee' ? invoer.uitrolStand : 'onbekend';
  const ruimte = invoer.ruimte || bepaalVerbindingRuimte(dienst);

  const lijst = leesVerbindingIncidenten();
  const idx = lijst.findIndex(
    (item) => item.hersteldOp === null && item.dienst === dienst && Math.abs(nu - item.laatsteTijd) <= ACTIEF_VENSTER_MS,
  );

  if (idx >= 0) {
    const cur = lijst[idx];
    const gegevenNr = typeof invoer.poging === 'number' && invoer.poging > 0 ? Math.trunc(invoer.poging) : 0;
    const zelfdePoging = cur.pogingen.some(
      (p) => p.tijd === nu && (gegevenNr > 0 ? p.nr === gegevenNr : p.code === code && p.route === route),
    );
    const volgendeNr = gegevenNr > 0
      ? Math.max(cur.pogingen[cur.pogingen.length - 1]?.nr ?? 0, gegevenNr)
      : (cur.pogingen[cur.pogingen.length - 1]?.nr ?? 0) + 1;
    const nieuwePogingen = zelfdePoging
      ? cur.pogingen
      : [
          ...cur.pogingen,
          {
            nr: volgendeNr > (cur.pogingen[cur.pogingen.length - 1]?.nr ?? 0) ? volgendeNr : (cur.pogingen[cur.pogingen.length - 1]?.nr ?? 0) + 1,
            tijd: nu,
            route,
            status,
            code,
          },
        ].slice(-MAX_POGINGEN);

    const bijgewerkt: VerbindingIncidentBewijs = {
      ...cur,
      soort: invoer.soort,
      laatsteTijd: Math.max(cur.laatsteTijd, nu),
      laatsteStatus: status,
      laatsteCode: code,
      laatsteRoute: route || cur.laatsteRoute,
      uitrolStand: uitrolStand !== 'onbekend' ? uitrolStand : cur.uitrolStand,
      rauwVoorbeeld: rauw || cur.rauwVoorbeeld,
      pogingen: nieuwePogingen,
      gesynchroniseerdOp: null,
    };
    lijst[idx] = bijgewerkt;
    schrijfVerbindingIncidenten(lijst);
    return bijgewerkt;
  }

  const eersteNr = typeof invoer.poging === 'number' && invoer.poging > 0 ? Math.trunc(invoer.poging) : 1;
  const nieuw: VerbindingIncidentBewijs = {
    id: `verbinding-incident:${dienst}:${nu}`,
    ruimte,
    soort: invoer.soort,
    dienst,
    eersteTijd: nu,
    laatsteTijd: nu,
    hersteldOp: null,
    duurMs: null,
    laatsteStatus: status,
    laatsteCode: code,
    laatsteRoute: route,
    uitrolStand,
    rauwVoorbeeld: rauw,
    pogingen: [{ nr: eersteNr, tijd: nu, route, status, code }],
    gesynchroniseerdOp: null,
  };
  schrijfVerbindingIncidenten([nieuw, ...lijst]);
  return nieuw;
}

export function markeerVerbindingHersteld(hersteldOp = Date.now()): VerbindingIncidentBewijs[] {
  const nu = typeof hersteldOp === 'number' && Number.isFinite(hersteldOp) && hersteldOp > 0
    ? Math.trunc(hersteldOp)
    : Date.now();
  const lijst = leesVerbindingIncidenten();
  const herstelde: VerbindingIncidentBewijs[] = [];
  let gewijzigd = false;

  const volgende = lijst.map((inc) => {
    if (inc.hersteldOp !== null) return inc;
    gewijzigd = true;
    const eind = Math.max(inc.eersteTijd, nu);
    const gesloten: VerbindingIncidentBewijs = {
      ...inc,
      hersteldOp: eind,
      duurMs: Math.max(0, eind - inc.eersteTijd),
      gesynchroniseerdOp: null,
    };
    herstelde.push(gesloten);
    return gesloten;
  });

  if (gewijzigd) {
    schrijfVerbindingIncidenten(volgende);
  }
  return herstelde;
}

export function actiefVerbindingIncident(dienst?: string): VerbindingIncidentBewijs | null {
  const lijst = leesVerbindingIncidenten();
  return lijst.find((x) => x.hersteldOp === null && (!dienst || x.dienst === dienst)) || null;
}

export function laatstHersteldVerbindingIncident(dienst?: string): VerbindingIncidentBewijs | null {
  const lijst = leesVerbindingIncidenten();
  const gevonden = lijst
    .filter((x) => x.hersteldOp !== null && (!dienst || x.dienst === dienst))
    .sort((a, b) => (b.hersteldOp || 0) - (a.hersteldOp || 0));
  return gevonden[0] || null;
}

export function abonneerVerbindingIncidenten(fn: (lijst: VerbindingIncidentBewijs[]) => void): () => void {
  luisteraars.add(fn);
  try {
    fn(leesVerbindingIncidenten());
  } catch {
    /* початкове сповіщення безпечне */
  }
  return () => {
    luisteraars.delete(fn);
  };
}

export function _wisVerbindingIncidentenVoorTest(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(VERBINDING_INCIDENTEN_SLEUTEL);
    }
  } catch {
    /* без сховища */
  }
  verwittig([], false);
}

export function incidentNaarEcosysteemGebeurtenis(
  inc: VerbindingIncidentBewijs,
  lang: 'uk' | 'nl',
  zone?: string,
): MeldingEcosysteemGebeurtenis {
  const taal: Lang = lang === 'nl' ? 'nl' : 'uk';
  const t = (uk: string, nl: string) => kiesTaal(taal, uk, nl);
  const dienstLabel = dienstNaam(taal, inc.dienst);
  const codeKort = codeLabel({ code: inc.laatsteCode, status: inc.laatsteStatus });
  const hersteld = inc.hersteldOp !== null;
  const startKlok = klokTijd(taal, inc.eersteTijd, zone);
  const laatsteKlok = klokTijd(taal, inc.hersteldOp ?? inc.laatsteTijd, zone);
  const duur = duurTekst(lang, hersteld ? inc.duurMs : Math.max(0, inc.laatsteTijd - inc.eersteTijd));
  const aantal = Math.max(1, inc.pogingen.length);

  const titel = inc.soort === 'netwerk_offline'
    ? (hersteld
        ? t(
            `Втрата мережевого з’єднання (${dienstLabel}) — відновлено`,
            `Verlies van netwerkverbinding (${dienstLabel}) — hersteld`,
          )
        : t(
            `Втрата мережевого з’єднання (${dienstLabel}) — триває`,
            `Verlies van netwerkverbinding (${dienstLabel}) — bezig`,
          ))
    : (hersteld
        ? t(
            `Перерва зв’язку з сервером (${codeKort} · ${dienstLabel}) — відновлено`,
            `Verbindingsonderbreking met de server (${codeKort} · ${dienstLabel}) — hersteld`,
          )
        : t(
            `Перерва зв’язку з сервером (${codeKort} · ${dienstLabel}) — триває`,
            `Verbindingsonderbreking met de server (${codeKort} · ${dienstLabel}) — bezig`,
          ));

  const bericht = hersteld
    ? t(
        `Початок інциденту: ${startKlok}. Відновлено: ${laatsteKlok} (тривалість простою: ${duur}, зафіксовано спроб: ${aantal}). Доказ збережено в хронології.`,
        `Begin van incident: ${startKlok}. Hersteld: ${laatsteKlok} (duur onderbreking: ${duur}, vastgelegde pogingen: ${aantal}). Bewijs bewaard in de tijdlijn.`,
      )
    : t(
        `Початок інциденту: ${startKlok}. Остання спроба: ${laatsteKlok} (зафіксовано спроб: ${aantal}${inc.laatsteRoute ? `, маршрут: ${inc.laatsteRoute}` : ''}).`,
        `Begin van incident: ${startKlok}. Laatste poging: ${laatsteKlok} (vastgelegde pogingen: ${aantal}${inc.laatsteRoute ? `, route: ${inc.laatsteRoute}` : ''}).`,
      );

  const uitrolRegel = inc.uitrolStand === 'bezig'
    ? t('Стан розгортання: підтверджено встановлення оновлення', 'Uitrolstand: lopende installatie bevestigd')
    : inc.uitrolStand === 'nee'
      ? t('Стан розгортання: встановлення не відбувається', 'Uitrolstand: geen lopende installatie')
      : t('Стан розгортання: не підтверджено', 'Uitrolstand: niet bevestigd');

  const chronologieRegels = inc.pogingen.map((p) => {
    const k = klokTijd(taal, p.tijd, zone);
    const c = codeLabel({ code: p.code, status: p.status });
    return `#${p.nr} · ${k}${p.route ? ` — ${p.route}` : ''} → ${c}`;
  });

  const uitleg = [
    `${t('Ідентифікатор інциденту', 'Incident-id')}: ${inc.id}`,
    `${t('Служба', 'Dienst')}: ${dienstLabel}`,
    uitrolRegel,
    `${t('Хронологія спроб', 'Tijdlijn van pogingen')} (${aantal}):`,
    ...chronologieRegels,
  ].join('\n');

  const chronologieJson = JSON.stringify(
    {
      id: inc.id,
      ruimte: inc.ruimte,
      soort: inc.soort,
      dienst: inc.dienst,
      eersteTijd: inc.eersteTijd,
      laatsteTijd: inc.laatsteTijd,
      hersteldOp: inc.hersteldOp,
      duurMs: inc.duurMs,
      uitrolStand: inc.uitrolStand,
      pogingen: inc.pogingen,
    },
    null,
    2,
  );

  const diagnoseTekst = [
    uitleg,
    ...(inc.rauwVoorbeeld ? [`${t('Очищений уривок відповіді', 'Geschoond antwoordfragment')}: ${inc.rauwVoorbeeld}`] : []),
  ].join('\n');

  return interpreteerGebeurtenis(
    {
      id: inc.id,
      externeSleutel: inc.id,
      ruimte: inc.ruimte,
      bron: 'verbinding-bewijs',
      kanaal: 'pagina',
      subdomein: subdomeinVanDienst(inc.dienst),
      soort: inc.soort,
      ernst: hersteld ? 'waarschuwing' : 'kritiek',
      status: hersteld ? 'opgelost' : 'nieuw',
      herhalingen: aantal,
      titel,
      bericht,
      uitleg,
      contextLabel: `${codeKort} · ${dienstLabel}`,
      link: journaalPadVoorHost(),
      aangemaaktOp: inc.eersteTijd,
      bijgewerktOp: inc.hersteldOp ?? inc.laatsteTijd,
      bijlagen: [
        {
          id: 'verbinding-chronologie',
          naam: 'verbinding-chronologie.json',
          mime: 'application/json',
          grootteBytes: chronologieJson.length,
          tekstVoorbeeld: chronologieJson,
        },
        {
          id: 'verbinding-diagnose',
          naam: 'verbinding-diagnose.txt',
          mime: 'text/plain',
          grootteBytes: diagnoseTekst.length,
          tekstVoorbeeld: diagnoseTekst,
        },
      ],
      meta: {
        incidentId: inc.id,
        soort: inc.soort,
        dienst: inc.dienst,
        statusCode: inc.laatsteStatus,
        foutCode: inc.laatsteCode,
        route: inc.laatsteRoute,
        eersteTijd: inc.eersteTijd,
        laatsteTijd: inc.laatsteTijd,
        hersteldOp: inc.hersteldOp,
        duurMs: inc.duurMs,
        pogingenAantal: aantal,
        uitrolStand: inc.uitrolStand,
      },
    },
    inc.ruimte,
  );
}

let actieveSyncBelofte: Promise<number> | null = null;

function statusUitFout(err: unknown): number {
  if (!err || typeof err !== 'object') return 0;
  const o = err as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  const s = Number(o.status ?? o.statusCode ?? o.response?.status ?? 0);
  return Number.isFinite(s) ? s : 0;
}

export async function synchroniseerVerbindingBewijzenNaarServer(
  scope: string,
  apiPost: (url: string, data: unknown) => Promise<unknown>,
  lang: 'uk' | 'nl' = 'uk',
): Promise<number> {
  if (!scope || scope === 'anon') return 0;
  if (actieveSyncBelofte) return actieveSyncBelofte;

  actieveSyncBelofte = (async () => {
    const lijst = leesVerbindingIncidenten();
    const wachtend = lijst.filter((inc) => inc.hersteldOp !== null && inc.gesynchroniseerdOp === null);
    if (!wachtend.length) return 0;

    let gelukt = 0;
    const gesynchroniseerdMap = new Map<string, { tijd: number; ruimte: RuimteType }>();

    for (const inc of wachtend) {
      const geb = incidentNaarEcosysteemGebeurtenis(inc, lang);
      const bouwLichaam = (doelRuimte: RuimteType) =>
        meldingLichaam({
          ruimte: doelRuimte,
          externeSleutel: geb.externeSleutel,
          bron: 'verbinding-bewijs',
          kanaal: 'pagina',
          subdomein: geb.subdomein,
          soort: inc.soort,
          ernst: 'waarschuwing',
          status: 'opgelost',
          herhalingen: geb.herhalingen,
          titel: geb.titel,
          bericht: geb.bericht,
          uitleg: geb.uitleg,
          contextLabel: geb.contextLabel,
          link: journaalPadVoorHost(),
          bijlagen: geb.bijlagen,
          aangemaaktOp: inc.eersteTijd,
          bijgewerktOp: inc.hersteldOp ?? inc.laatsteTijd,
          meta: geb.meta,
        });

      try {
        const res = (await apiPost('/api/owner/meldingen/ecosysteem/gebeurtenis', bouwLichaam(inc.ruimte))) as { status?: number } | null;
        if (res && typeof res.status === 'number' && res.status === 403 && inc.ruimte === 'technisch') {
          const resPrive = (await apiPost('/api/owner/meldingen/ecosysteem/gebeurtenis', bouwLichaam('prive'))) as { status?: number } | null;
          if (!resPrive || typeof resPrive.status !== 'number' || (resPrive.status >= 200 && resPrive.status < 300)) {
            gesynchroniseerdMap.set(inc.id, { tijd: Date.now(), ruimte: 'prive' });
            gelukt += 1;
          }
          continue;
        }
        if (!res || typeof res.status !== 'number' || (res.status >= 200 && res.status < 300)) {
          gesynchroniseerdMap.set(inc.id, { tijd: Date.now(), ruimte: inc.ruimte });
          gelukt += 1;
        }
      } catch (err) {
        if (statusUitFout(err) === 403 && inc.ruimte === 'technisch') {
          try {
            const resPrive = (await apiPost('/api/owner/meldingen/ecosysteem/gebeurtenis', bouwLichaam('prive'))) as { status?: number } | null;
            if (!resPrive || typeof resPrive.status !== 'number' || (resPrive.status >= 200 && resPrive.status < 300)) {
              gesynchroniseerdMap.set(inc.id, { tijd: Date.now(), ruimte: 'prive' });
              gelukt += 1;
            }
          } catch {
            /* залишиться в черзі до наступного з’єднання */
          }
        }
      }
    }

    if (gesynchroniseerdMap.size > 0) {
      const actueel = leesVerbindingIncidenten();
      const bijgewerkt = actueel.map((item) => {
        const sync = gesynchroniseerdMap.get(item.id);
        return sync ? { ...item, ruimte: sync.ruimte, gesynchroniseerdOp: sync.tijd } : item;
      });
      schrijfVerbindingIncidenten(bijgewerkt);
    }

    return gelukt;
  })();

  try {
    return await actieveSyncBelofte;
  } finally {
    actieveSyncBelofte = null;
  }
}
