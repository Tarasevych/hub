// Kern van het live-overzicht van het beheerpaneel: PUUR (geen database, geen netwerk), zodat het volledig te testen is.
// backend/beheer-overzicht.ts haalt de ruwe gegevens op en geeft ze hierheen; hier worden ze opgeteld, gelabeld en AFGESCHERMD.
//
// Privacy (vaste regels, ook getest):
//  - een gebeurtenis bevat nooit `details`, IP, tokens, mailinhoud of bestandsnamen: alleen tijd, soort handeling, sectie, uitkomst,
//    apparaatklasse (browser/OS) en de naam van de gebruiker;
//  - e-mailadressen verlaten dit bestand alleen gemaskeerd (ei***@example.test);
//  - tellers (populariteit) tellen handelingen, nooit wat erin stond.
import { sourceOfAudit } from './site-activiteit';

export const FAIL_RE = /fail|denied|error|reject|invalid|blocked|conflict/i;
/** Acties die geen «gebeurtenis voor mensen» zijn (lezen, rotatie, menu, het overzicht zelf). Supersetje van site-activity SKIP;
 *  dezelfde bron wordt in SQL gebruikt om de aantallen niet met ruis op te blazen. */
export const RUIS_BRON = '^(owner\\.notifications\\.|owner\\.session\\.(rotated|refresh)|owner\\.ui\\.|owner\\.tab\\.|owner\\.mail\\.(item\\.|send\\.prepared)|owner\\.admin\\.(audit\\.viewed|diagnostics|bootstrap|overview)|owner\\.redirect\\.|owner\\.auth\\.transaction\\.(created|started)|owner\\.browser\\.grant\\.(used|cookie)|owner\\.session\\.handoff\\.)';
const RUIS = new RegExp(RUIS_BRON);
export const isGebeurtenis = (action: string) => !RUIS.test(action) && sourceOfAudit(action) !== null;

export type Tekst2 = { uk: string; nl: string };

// ---------------------------------------------------------------------------------------------------------------- labels
const SECTIES: Record<string, Tekst2> = {
  mail: { uk: 'Пошта', nl: 'Mail' }, cloud: { uk: 'Хмара', nl: 'Cloud' }, calendar: { uk: 'Календар', nl: 'Agenda' }, github: { uk: 'GitHub', nl: 'GitHub' },
  ai: { uk: 'ШІ', nl: 'AI' }, agent: { uk: 'Агенти', nl: 'Agenten' }, claude: { uk: 'Claude (MCP)', nl: 'Claude (MCP)' }, browser: { uk: 'Браузер', nl: 'Browser' },
  api: { uk: 'API та секрети', nl: 'API en geheimen' }, admin: { uk: 'Адміністрування', nl: 'Beheer' }, identity: { uk: 'Вхід і безпека', nl: 'Aanmelden en beveiliging' },
  site: { uk: 'Сайт', nl: 'Site' },
};
export const sectieVan = (action: string): string => (sourceOfAudit(action) ?? 'site').split(':')[0];
export const sectieNaam = (s: string): Tekst2 => SECTIES[s] ?? { uk: s, nl: s };

const DIENSTEN: Record<string, Tekst2> = {
  hub: { uk: 'Хаб', nl: 'Hub' }, mail: { uk: 'Пошта', nl: 'Mail' }, cloud: { uk: 'Хмара', nl: 'Cloud' }, github: { uk: 'GitHub', nl: 'GitHub' }, huis: { uk: 'Дім', nl: 'Huis' },
  mcp: { uk: 'MCP', nl: 'MCP' }, ai: { uk: 'ШІ', nl: 'AI' }, admin: { uk: 'Адмін', nl: 'Beheer' }, api: { uk: 'API', nl: 'API' }, identity: { uk: 'Ідентичність', nl: 'Identiteit' },
};
export const dienstNaam = (s: string): Tekst2 => DIENSTEN[s] ?? { uk: s || '—', nl: s || '—' };

type Regel = [RegExp, string, string, string];
// [patroon, sleutel (groepering voor populariteit), uk, nl] — eerste treffer wint
const LABELS: Regel[] = [
  [/^owner\.(auth\.transaction\.completed|identity\.completed|redirect\.)/, 'aanmelden', 'Вхід', 'Aanmelding'],
  [/^owner\.(session\.logout|browser\.account\.logout|session\.revoked|tab\.session\.revoked)/, 'afmelden', 'Вихід із сесії', 'Afgemeld'],
  [/^owner\.identity\.failed/, 'aanmelden-mislukt', 'Невдалий вхід', 'Mislukte aanmelding'],
  [/^owner\.step_up\./, 'stap-op', 'Повторне підтвердження входу', 'Aanmelding opnieuw bevestigd'],
  [/^owner\.mail\.(send|compose\.send)/, 'mail-verzenden', 'Надіслав(ла) лист', 'Mail verzonden'],
  [/^owner\.mail\.compose\.(scheduled|cancelled)/, 'mail-plannen', 'Запланував(ла) лист', 'Mail gepland'],
  [/^owner\.mail\.account\./, 'mail-account', 'Змінив(ла) поштовий акаунт', 'Mailaccount gewijzigd'],
  [/^owner\.mail\./, 'mail', 'Дія в пошті', 'Actie in mail'],
  [/^owner\.cloud\./, 'cloud', 'Дія в хмарі', 'Actie in de cloud'],
  [/^owner\.calendar\./, 'agenda', 'Дія в календарі', 'Actie in de agenda'],
  [/^owner\.github\./, 'github', 'Дія в GitHub', 'Actie in GitHub'],
  [/^owner\.mcp\.tool/, 'ai-tool', 'Виклик інструмента ШІ', 'AI-hulpmiddel gebruikt'],
  [/^owner\.mcp\.(grant|deur|toegang|duur)/, 'ai-koppeling', 'Підключення ШІ', 'AI-koppeling'],
  [/^owner\.(agent|agents)\./, 'agent', 'Дія агента', 'Actie van agent'],
  [/^owner\.ai\.|^owner\.chat\./, 'ai', 'Налаштування ШІ', 'AI-instelling'],
  [/^owner\.api\.vault\.revealed/, 'kluis-bekijken', 'Переглянув(ла) секрет', 'Geheim bekeken'],
  [/^owner\.api\.vault\./, 'kluis', 'Зміна у сховищі секретів', 'Wijziging in de geheimenkluis'],
  [/^owner\.api\.token\./, 'api-token', 'API-токен', 'API-token'],
  [/^owner\.api\./, 'api', 'Дія з API', 'Actie met API'],
  [/^owner\.admin\.role\./, 'beheer-rol', 'Зміна адмін-ролі', 'Beheerrol gewijzigd'],
  [/^owner\.admin\.user\./, 'beheer-gebruiker', 'Керування користувачем', 'Gebruikersbeheer'],
  [/^owner\.admin\./, 'beheer', 'Дія в адмін-панелі', 'Actie in het beheerpaneel'],
  [/^owner\.tech\./, 'tech', 'Технічний профіль', 'Technisch profiel'],
  [/^owner\.uitrol\./, 'uitrol', 'Оновлення сайту', 'Site-update'],
  [/^owner\.terminal\./, 'terminal', 'Термінал', 'Terminal'],
  [/^owner\.ondersteuning\./, 'ondersteuning', 'Підтримка від імені', 'Ondersteuning namens'],
  [/^owner\.browser\./, 'browser', 'Доступ браузера', 'Browsertoegang'],
  [/^owner\.profile\./, 'profiel', 'Зміна профілю', 'Profiel gewijzigd'],
  [/^owner\.privacy\./, 'privacy', 'Приватність', 'Privacy'],
  [/^owner\.access\./, 'toegang', 'Запит доступу', 'Toegangsaanvraag'],
  [/^owner\.flags\./, 'vlaggen', 'Прапорці функцій', 'Functievlaggen'],
  [/^owner\.diagnose\./, 'diagnose', 'Діагностика', 'Diagnostiek'],
  [/^owner\.beleid\./, 'beleid', 'Політика доступу', 'Toegangsbeleid'],
  [/^account\./, 'account', 'Подія облікового запису', 'Accountgebeurtenis'],
];
export function labelVan(action: string): { sleutel: string } & Tekst2 {
  for (const [re, sleutel, uk, nl] of LABELS) if (re.test(action)) return { sleutel, uk, nl };
  return { sleutel: 'overig', uk: 'Дія на сайті', nl: 'Actie op de site' };
}

// ---------------------------------------------------------------------------------------------------------------- types
export type AuditRegel = { id: string; ownerId: string | null; actorId?: string | null; action: string; result: string; createdAt: number; service?: string | null; device?: string | null };
export type Gebruiker = { id: string; email: string; name?: string; picture?: string; status?: string; role?: string; createdAt?: number };
export type Sessie = { userId: string; service: string; createdAt?: number; lastSeenAt: number; idleExpiresAt: number; absoluteExpiresAt: number; revokedAt?: number; deviceType?: string; os?: string; browser?: string };
export type Emmer = { b: number; n: number; f: number };
export type Punt = { t: number; n: number; f: number };
export type RunKort = { id: string; versie: string; staat: string; methode: string; pct: number; gestart: string; geeindigd: string; wie: string; samenvatting: string };
export type ControleKort = { id: string; stand: string; ms?: number };

export type Invoer = {
  nu: number;
  gebruikers: Gebruiker[];
  /** exacte tellingen uit de database (de lijst kan afgekapt zijn) */
  telling: { totaal: number; nieuw24: number; nieuw7: number; wachtGoedkeuring: number };
  sessies: Sessie[];
  /** emmers per uur (b = uren sinds epoch) en per dag (b = dagen sinds epoch) */
  uren: Emmer[]; dagen: Emmer[];
  acties7: Array<{ action: string; n: number; f: number }>;
  recent: AuditRegel[];
  diensten: ControleKort[];
  runs: RunKort[];
  wachtUitrol: number;
  wachtToegang: number;
  /** mag de aanroeper het auditlogboek zien? Zo niet: geen gebeurtenislijsten. */
  magAudit: boolean;
};

export type Gebeurtenis = {
  id: string; t: number; gebruikerId: string; naam: string; foto: string;
  sectie: string; sectieNaam: Tekst2; label: Tekst2; sleutel: string; mislukt: boolean; apparaat: string; dienst: string;
};

const MIN = 60_000; const UUR = 3_600_000; const DAG = 86_400_000;
export const ONLINE_VENSTER_MS = 5 * MIN;

// ---------------------------------------------------------------------------------------------------------------- hulpjes
export function maskeerMail(email: string): string {
  const [lokaal, domein] = String(email || '').split('@');
  if (!domein) return '';
  return `${lokaal.slice(0, 2)}***@${domein}`;
}
export function weergaveNaam(g: Gebruiker | undefined, id: string, taal: 'uk' | 'nl' = 'uk'): string {
  if (g) {
    const n = (g.name || '').trim();
    if (n) return n.slice(0, 60);
    const l = (g.email || '').split('@')[0];
    if (l) return l.slice(0, 40);
  }
  return id ? `${taal === 'uk' ? 'Невідомий' : 'Onbekend'} ${id.slice(0, 6)}` : (taal === 'uk' ? 'Система' : 'Systeem');
}
/** Alleen een https-afbeelding van redelijke lengte (geen data-URL's van MB's in elk antwoord). */
export const veiligeFoto = (u: unknown): string => (typeof u === 'string' && /^https:\/\/[^\s"'<>]{4,300}$/.test(u) ? u : '');
const apparaatSchoon = (d: unknown): string => (typeof d === 'string' && /^[A-Za-z0-9 ._+/-]{1,40}$/.test(d) ? d : '');

/** Vult ontbrekende emmers met nullen: `aantal` emmers eindigend bij de huidige (b = floor(nu / stap)). */
export function vulEmmers(rows: Emmer[], nu: number, stap: number, aantal: number): Punt[] {
  const huidig = Math.floor(nu / stap);
  const map = new Map(rows.map((r) => [Number(r.b), r]));
  const uit: Punt[] = [];
  for (let b = huidig - aantal + 1; b <= huidig; b++) {
    const r = map.get(b);
    uit.push({ t: b * stap, n: r ? Number(r.n) : 0, f: r ? Number(r.f) : 0 });
  }
  return uit;
}

export function gebeurtenisUit(r: AuditRegel, users: Map<string, Gebruiker>): Gebeurtenis | null {
  if (!isGebeurtenis(r.action)) return null;
  const id = r.ownerId || r.actorId || '';
  const g = users.get(id);
  const l = labelVan(r.action);
  const sectie = sectieVan(r.action);
  return {
    id: `a:${r.id}`, t: r.createdAt, gebruikerId: id, naam: weergaveNaam(g, id), foto: veiligeFoto(g?.picture),
    sectie, sectieNaam: sectieNaam(sectie), label: { uk: l.uk, nl: l.nl }, sleutel: l.sleutel, mislukt: FAIL_RE.test(r.result),
    apparaat: apparaatSchoon(r.device), dienst: typeof r.service === 'string' ? r.service.replace(/[^a-z0-9-]/gi, '').slice(0, 20) : '',
  };
}

const optel = (lijst: string[], max: number, onbekend = 'Unknown') => {
  const m = new Map<string, number>();
  for (const x of lijst) { const k = (x || onbekend).slice(0, 40); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([naam, n]) => ({ naam, n }));
};

export const sessieActief = (s: Sessie, nu: number) => !s.revokedAt && s.idleExpiresAt > nu && s.absoluteExpiresAt > nu;

// ---------------------------------------------------------------------------------------------------------------- overzicht
export function bouwOverzicht(inv: Invoer) {
  const { nu } = inv;
  const users = new Map(inv.gebruikers.map((g) => [g.id, g]));
  const actief = inv.sessies.filter((s) => sessieActief(s, nu));

  // online = laatst gezien binnen 5 minuten (per gebruiker de meest recente sessie)
  const perGebruiker = new Map<string, Sessie>();
  for (const s of actief) { const v = perGebruiker.get(s.userId); if (!v || s.lastSeenAt > v.lastSeenAt) perGebruiker.set(s.userId, s); }
  const online = [...perGebruiker.values()].filter((s) => nu - s.lastSeenAt <= ONLINE_VENSTER_MS).sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  const dienstTeller = new Map<string, number>();
  for (const s of actief) dienstTeller.set(s.service, (dienstTeller.get(s.service) || 0) + 1);

  const uren = vulEmmers(inv.uren, nu, UUR, 24);
  const dagen = vulEmmers(inv.dagen, nu, DAG, 14);
  const events24 = uren.reduce((a, p) => a + p.n, 0);
  const fouten24 = uren.reduce((a, p) => a + p.f, 0);
  const events1u = uren[uren.length - 1]?.n ?? 0;

  // populariteit: handelingen per sectie en per soort handeling (alleen tellers)
  const perSectie = new Map<string, number>(); const perSoort = new Map<string, { n: number; l: Tekst2 }>();
  for (const a of inv.acties7) {
    if (!isGebeurtenis(a.action)) continue;
    const s = sectieVan(a.action); perSectie.set(s, (perSectie.get(s) || 0) + a.n);
    const l = labelVan(a.action); const v = perSoort.get(l.sleutel); perSoort.set(l.sleutel, { n: (v?.n || 0) + a.n, l: { uk: l.uk, nl: l.nl } });
  }
  const populariteit = {
    secties: [...perSectie.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([sleutel, n]) => ({ sleutel, ...sectieNaam(sleutel), n })),
    acties: [...perSoort.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([sleutel, v]) => ({ sleutel, ...v.l, n: v.n })),
  };

  const stroom: Gebeurtenis[] = [];
  if (inv.magAudit) for (const r of inv.recent) { const e = gebeurtenisUit(r, users); if (e) stroom.push(e); if (stroom.length >= 40) break; }
  const fouten = stroom.filter((e) => e.mislukt).slice(0, 8);

  const dienstenTelling = { ok: 0, letop: 0, fout: 0, onbekend: 0 };
  for (const d of inv.diensten) { if (d.stand === 'ok') dienstenTelling.ok++; else if (d.stand === 'let-op') dienstenTelling.letop++; else if (d.stand === 'fout') dienstenTelling.fout++; else dienstenTelling.onbekend++; }

  return {
    nu,
    kpi: {
      gebruikers: inv.telling.totaal, nieuw24: inv.telling.nieuw24, nieuw7: inv.telling.nieuw7, wachtGoedkeuring: inv.telling.wachtGoedkeuring,
      online: online.length, actieveSessies: actief.length,
      apparaten: new Set(actief.map((s) => `${s.userId}|${s.deviceType || ''}|${s.os || ''}|${s.browser || ''}`)).size,
      events24, events1u, fouten24, foutenPct: events24 ? Math.round((fouten24 / events24) * 1000) / 10 : 0,
    },
    uren, dagen,
    sessiesPerDienst: [...dienstTeller.entries()].sort((a, b) => b[1] - a[1]).map(([dienst, n]) => ({ dienst, ...dienstNaam(dienst), n })),
    online: online.slice(0, 12).map((s) => {
      const g = users.get(s.userId);
      return { id: s.userId, naam: weergaveNaam(g, s.userId), foto: veiligeFoto(g?.picture), dienst: s.service, dienstNaam: dienstNaam(s.service), laatst: s.lastSeenAt, apparaat: [s.browser, s.os].map(apparaatSchoon).filter(Boolean).join(' / ') };
    }),
    apparaten: {
      types: optel(actief.map((s) => s.deviceType || ''), 6), os: optel(actief.map((s) => s.os || ''), 6), browsers: optel(actief.map((s) => s.browser || ''), 6),
    },
    populariteit,
    stroom, fouten,
    diensten: { ...dienstenTelling, lijst: inv.diensten.slice(0, 20) },
    uitrol: { runs: inv.runs.slice(0, 5), wacht: inv.wachtUitrol },
    wachtrij: { toegang: inv.wachtToegang, uitrol: inv.wachtUitrol, gebruikers: inv.telling.wachtGoedkeuring },
    beperkt: !inv.magAudit,
    /** eerlijk: is er überhaupt iets om te tonen? */
    leeg: { activiteit: events24 === 0 && inv.dagen.length === 0, sessies: actief.length === 0 },
  };
}
export type Overzicht = ReturnType<typeof bouwOverzicht>;

// ---------------------------------------------------------------------------------------------------------------- gebruikerskaart
/** Historie van één gebruiker: alleen soort handeling, sectie, tijd, uitkomst en apparaatklasse — NOOIT details/IP/inhoud. */
export function gebruikerHistorie(opts: { nu: number; gebruiker: Gebruiker | undefined; id: string; audit: AuditRegel[]; sessies: Sessie[]; dagen?: Emmer[] }) {
  const { nu, gebruiker: g, id } = opts;
  const users = new Map<string, Gebruiker>(g ? [[id, g]] : []);
  const tijdlijn = opts.audit.map((r) => gebeurtenisUit({ ...r, ownerId: id }, users)).filter((e): e is Gebeurtenis => !!e).slice(0, 120);
  const mijn = opts.sessies.filter((s) => s.userId === id);
  const actief = mijn.filter((s) => sessieActief(s, nu));
  const laatst = Math.max(0, ...mijn.map((s) => s.lastSeenAt), ...tijdlijn.map((e) => e.t));
  const secties = new Map<string, number>();
  for (const e of tijdlijn) secties.set(e.sectie, (secties.get(e.sectie) || 0) + 1);
  const perDag = vulEmmers(
    (() => { const m = new Map<number, Emmer>(); for (const e of tijdlijn) { const b = Math.floor(e.t / DAG); const v = m.get(b) || { b, n: 0, f: 0 }; v.n++; if (e.mislukt) v.f++; m.set(b, v); } return [...m.values()]; })(),
    nu, DAG, 14,
  );
  return {
    gebruiker: {
      id, naam: weergaveNaam(g, id), mail: maskeerMail(g?.email || ''), foto: veiligeFoto(g?.picture), rol: g?.role || '', status: g?.status || '',
      aangemaakt: Number(g?.createdAt) || 0, bekend: !!g,
    },
    kpi: { laatstGezien: laatst, online: actief.some((s) => nu - s.lastSeenAt <= ONLINE_VENSTER_MS), actieveSessies: actief.length, events: tijdlijn.length, mislukt: tijdlijn.filter((e) => e.mislukt).length },
    apparaten: optel(actief.map((s) => [s.browser, s.os].map(apparaatSchoon).filter(Boolean).join(' / ')), 6, '—'),
    secties: [...secties.entries()].sort((a, b) => b[1] - a[1]).map(([sleutel, n]) => ({ sleutel, ...sectieNaam(sleutel), n })),
    perDag,
    tijdlijn,
  };
}
export type GebruikerHistorie = ReturnType<typeof gebruikerHistorie>;
