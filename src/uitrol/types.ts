import { datumInZone, tijdInZone, zoneKeuze } from './tijdzone';
// Gedeelde types en hulpfuncties van het «Оновлення»-paneel. De vorm komt 1-op-1 uit backend/uitrol-runs.ts (runUit, liveStand, diagnose).
export type Lang = 'uk' | 'nl';
export type RunStaat = 'bezig' | 'klaar' | 'mislukt' | 'geweigerd' | 'afgebroken';
export type Methode = 'passkey' | 'handtekening' | 'gitops' | 'opdracht' | 'ssh';
export type StapStaat = 'bezig' | 'ok' | 'fout';
export type RunStap = { stap: string; staat: StapStaat; pct: number; tijd: string; uk: string; nl: string };
export type Run = {
  id: string; methode: Methode; versie: string; release: string; staat: RunStaat; stap: string; sub: string; pct: number; code: string; uk: string; nl: string;
  stappen: RunStap[]; voorstelId: string; sha256: string; bytes: number; commit: string; voorbereider: string; goedgekeurdDoor: string; wijzigingen: string;
  wie: string; adres: string; logRegels: number; gestart: string; bijgewerkt: string; geeindigd: string;
  /** Bij een mislukking: de eerste echte foutregel en de regels eromheen (root, audit 18.10.2026). */
  reden?: string; context?: string[];
  /** Blijvend archief (audit 18.10.2026, punt 4): bewaard?, sha256, grootte; en de publicatie op GitHub. */
  pakket?: { bewaard: boolean; sha256: string; grootte: number; geleverdSha256?: string; herkomst?: '' | 'geleverd' | 'opnieuw-ingepakt' };
  github?: { url: string; fout: string; pogingen: number; op: string };
};
export type Regel = { nr: number; tijd: string; niveau: 'info' | 'ok' | 'warn' | 'error'; tekst: string };
export type Gebeurtenis = { id: string; tijd: string; code: string; niveau: string; uk: string; nl: string };
export type RunsAntwoord = { totaal: number; pagina: number; perPagina: number; paginas: number; runs: Run[]; tellers: Record<string, number> };
export type LiveAntwoord = { run: Run | null; regels: Regel[]; nu: string };
export type DiagnoseAntwoord = {
  root: null | { tijd: string; leeftijdSec: number; gezond: boolean; problemen: Array<{ code: string; uk: string; nl: string }>;
    eenheden: Record<string, { geladen: string; actief: string; sub: string; bestand: string; resultaat: string; exit: string; start: string; einde: string; volgende: string }>;
    lock: { bezet: boolean; door: string; bestaat: boolean }; inbox: { bestaat: boolean; bestanden: Array<{ naam: string; bytes: number; tijd: string }> };
    schijf: Record<string, { vrijMB: number; totaalMB: number }>; script: { bestaat: boolean; uitvoerbaar?: boolean; gewijzigd?: string; sha12?: string }; journaal: string[] };
  app: { statusMapLeesbaar: boolean; laatsteStapTijd: string; wachtOpRoot: Array<{ id: string; versie: string; beslist: string; seconden: number }> };
};
export type Versie = { versie: string | null; commit: string | null; releaseCommit: string | null; auteur: string | null; agent: string | null; samenvatting: string | null; commitStatus?: 'git' | 'zonder-git' | 'ontbreekt' | 'ongeldig'; zonderGitReden?: string | null; manifest?: import('../../shared/uitrol-manifest').Manifest | null };

export const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
export const loc = (lang: Lang) => (lang === 'uk' ? 'uk-UA' : 'nl-BE');
// Tijden volgen de gekozen tijdzone van de pagina (tijdzone.ts; standaard die van de browser) — terminal, stappen en historie gelijk.
export const datum = (lang: Lang, v?: string) => datumInZone(v, lang, 'short');
export const datumLang = (lang: Lang, v?: string) => datumInZone(v, lang, 'medium');
export const tijdKort = (lang: Lang, v?: string) => tijdInZone(v, zoneKeuze(), lang);
export const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const duur = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
export const runDuur = (r: Run, nu = Date.now()) => {
  const van = Date.parse(r.gestart);
  const tot = r.staat === 'bezig' ? nu : Date.parse(r.geeindigd || r.bijgewerkt);
  return Number.isFinite(van) && Number.isFinite(tot) ? duur(tot - van) : '—';
};

export const STAAT: Record<RunStaat, [string, string]> = {
  bezig: ['Триває', 'Bezig'], klaar: ['Успішно', 'Gelukt'], mislukt: ['Помилка', 'Mislukt'], geweigerd: ['Відхилено сервером', 'Geweigerd door de server'], afgebroken: ['Перервано', 'Afgebroken'],
};
export const METHODE: Record<Methode, [string, string]> = {
  passkey: ['Passkey (з сайту)', 'Passkey (via de site)'], handtekening: ['Підпис випуску', 'Release-handtekening'], gitops: ['GitOps', 'GitOps'], opdracht: ['Опрацювання завдання', 'Opdracht'], ssh: ['SSH', 'SSH'],
};
export const staatTekst = (lang: Lang, s: string) => { const t = STAAT[s as RunStaat]; return t ? tr(lang, t[0], t[1]) : s; };
export const methodeTekst = (lang: Lang, m: string) => { const t = METHODE[m as Methode]; return t ? tr(lang, t[0], t[1]) : m; };

// De negen zichtbare deelstappen van een installatie: eerst de controles van root, daarna de eigenlijke installatie (sub-fases van installeer-app.sh).
export const DEELSTAPPEN: Array<{ id: string; stap: string; sub?: string; uk: string; nl: string; hulpUk: string; hulpNl: string }> = [
  { id: 'ontvangen', stap: 'ontvangen', uk: 'Отримання пакета', nl: 'Pakket ontvangen', hulpUk: 'Сервер знайшов схвалений пакет у inbox', hulpNl: 'De server vond het goedgekeurde pakket in de inbox' },
  { id: 'kopie', stap: 'kopie', uk: 'Копіювання на сервер', nl: 'Kopiëren naar de server', hulpUk: 'Пакет копіюється в закриту робочу теку root', hulpNl: 'Het pakket wordt naar de afgesloten werkmap van root gekopieerd' },
  { id: 'echtheid', stap: 'echtheid', uk: 'Перевірка автентичності', nl: 'Echtheid controleren', hulpUk: 'Підпис passkey (або ключа випуску) і sha256', hulpNl: 'Passkey-handtekening (of release-sleutel) en sha256' },
  { id: 'inhoud', stap: 'inhoud', uk: 'Перевірка вмісту', nl: 'Inhoud controleren', hulpUk: 'Структура архіву, метадані, версія новіша за встановлену', hulpNl: 'Archiefstructuur, metadata, versie nieuwer dan geïnstalleerd' },
  { id: 'bron', stap: 'installeren', sub: 'bron', uk: 'Копіювання коду', nl: 'Broncode kopiëren', hulpUk: 'Файли випуску кладуться в нову теку релізу', hulpNl: 'Bestanden van de release naar een nieuwe releasemap' },
  { id: 'bouwen', stap: 'installeren', sub: 'bouwen', uk: 'Збірка (npm ci + vite)', nl: 'Bouwen (npm ci + vite)', hulpUk: 'Залежності й фронтенд збираються ізольовано', hulpNl: 'Afhankelijkheden en frontend worden geïsoleerd gebouwd' },
  { id: 'backup', stap: 'installeren', sub: 'backup', uk: 'Резервна копія бази', nl: 'Back-up van de database', hulpUk: 'Копія перед міграціями — для відкату', hulpNl: 'Kopie vóór de migraties — om terug te kunnen' },
  { id: 'migraties', stap: 'installeren', sub: 'migraties', uk: 'Міграції бази даних', nl: 'Databasemigraties', hulpUk: 'Нові SQL-міграції застосовуються автоматично', hulpNl: 'Nieuwe SQL-migraties worden automatisch uitgevoerd' },
  { id: 'actief', stap: 'installeren', sub: 'actief', uk: 'Активація й перевірка', nl: 'Activeren en controleren', hulpUk: 'Перезапуск сервісу і health-check; за невдачі — автоматичний відкат', hulpNl: 'Dienst herstarten en health-check; bij falen automatisch terug' },
];
const SUB_VOLGORDE = ['bron', 'bouwen', 'backup', 'migraties', 'actief'];
// Ook de voortgangsregels «[installeer] stap: <id> (<pct>%)» (audit 18.10.2026) markeren het begin van een onderdeel.
const SUB_REGEL: Array<[string, RegExp]> = [['bron', /^\[installeer\] (bron kopiëren|stap: kopie \()/], ['bouwen', /^\[installeer\] (bouwen \(|stap: (npm|bouwen) \()/], ['backup', /^\[installeer\] (back-up vóór migratie|stap: backup \()/], ['migraties', /^\[installeer\] (migraties uitvoeren|stap: migraties \()/], ['actief', /^\[installeer\] (stap: activeren \(|actief:)/]];
/** Begintijd (en duur tot het volgende onderdeel) van de onderdelen van de installatie, uit de logregels (de eerste regel van elk onderdeel). */
export function subTijden(regels: Regel[], eind?: string): Record<string, { tijd: string; duurMs: number | null }> {
  const eerste: Record<string, string> = {};
  for (const r of regels) for (const [sub, re] of SUB_REGEL) if (!eerste[sub] && re.test(r.tekst)) eerste[sub] = r.tijd;
  const uit: Record<string, { tijd: string; duurMs: number | null }> = {};
  const namen = SUB_REGEL.map(([n]) => n).filter((n) => eerste[n]);
  namen.forEach((n, i) => { const volgende = i + 1 < namen.length ? eerste[namen[i + 1]] : eind; const ms = volgende ? Date.parse(volgende) - Date.parse(eerste[n]) : NaN; uit[n] = { tijd: eerste[n], duurMs: Number.isFinite(ms) && ms >= 0 ? ms : null }; });
  return uit;
}
export type DeelStaat = 'wacht' | 'bezig' | 'ok' | 'fout';

/** Stand per deelstap uit een run: stappen[] voor de controles, run.sub voor de fases van de installatie. */
export function deelStanden(run: Run | null): Record<string, DeelStaat> {
  const uit: Record<string, DeelStaat> = {};
  for (const d of DEELSTAPPEN) uit[d.id] = 'wacht';
  if (!run) return uit;
  const stap = (naam: string) => run.stappen.find((s) => s.stap === naam);
  for (const d of DEELSTAPPEN.filter((x) => !x.sub)) { const s = stap(d.stap); if (s) uit[d.id] = s.staat === 'ok' ? 'ok' : s.staat === 'fout' ? 'fout' : 'bezig'; }
  const inst = stap('installeren');
  if (inst) {
    const subIdx = run.sub ? SUB_VOLGORDE.indexOf(run.sub) : -1;
    const mislukt = inst.staat === 'fout' || run.staat === 'mislukt';
    SUB_VOLGORDE.forEach((sub, i) => {
      if (inst.staat === 'ok' || run.staat === 'klaar') uit[sub] = 'ok';
      else if (i < subIdx) uit[sub] = 'ok';
      else if (i === subIdx) uit[sub] = mislukt ? 'fout' : 'bezig';
      else if (subIdx < 0 && i === 0) uit[sub] = mislukt ? 'fout' : 'bezig';
    });
  }
  if (run.staat === 'geweigerd' || run.staat === 'afgebroken') {
    for (const d of DEELSTAPPEN) if (uit[d.id] === 'bezig') uit[d.id] = 'fout';
  }
  return uit;
}

/** Hoofdfase (4 blokjes bovenaan): Voorbereiding → Goedkeuring → Controles → Uitrol, afgeleid van het voorstel en de run. */
export type Fase = 'voorbereiding' | 'goedkeuring' | 'controles' | 'uitrol';
export const FASEN: Array<{ id: Fase; uk: string; nl: string }> = [
  { id: 'voorbereiding', uk: 'Підготовка', nl: 'Voorbereiding' },
  { id: 'goedkeuring', uk: 'Схвалення', nl: 'Goedkeuring' },
  { id: 'controles', uk: 'Перевірки', nl: 'Controles' },
  { id: 'uitrol', uk: 'Розгортання', nl: 'Uitrol' },
];

export const NIVEAU_KLEUR = { info: 'info', ok: 'ok', warn: 'warn', error: 'error' } as const;

export function bestandOpslaan(naam: string, tekst: string) {
  try {
    const url = URL.createObjectURL(new Blob([tekst], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = naam; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch { /* downloaden niet mogelijk */ }
}
export const regelsNaarTekst = (regels: Regel[]) => regels.map((r) => `${String(r.nr).padStart(5, '0')} ${r.tijd ? r.tijd.slice(11, 19) : '--:--:--'} ${r.niveau.toUpperCase().padEnd(5)} ${r.tekst}`).join('\n');

// ---- Overzicht van het bestaande goedkeur-/grantsysteem (POST /api/owner/uitrol/overzicht)
export type Voorstel = { id: string; versie: string; status: string; bytes: number; sha256: string; ontvangen: number; voorbereider: string; commit: string; wijzigingen: string; tests: { geslaagd?: number | null; mislukt?: number | null; samenvatting?: string }; diffSamenvatting: string; aangemaaktOp: string; bijgewerktOp?: string; beslistOp: string; beslistDoor: string; uitkomstCode: string; uitkomst: { uk?: string; nl?: string; reden?: string } | null; voorcontrole?: VoorcontroleUit | null; pakketMeta?: PakketMetaUit | null };
export type GrantSoort = 'account' | 'agenttoken' | 'mcp-koppeling' | 'agent';
export type Grant = { id: string; soort: GrantSoort; onderwerp: string; label: string; gegevenDoor: string; gegevenOp: string; verlooptOp: string; ingetrokkenOp: string; status: 'actief' | 'verlopen' | 'ingetrokken'; /** Zonder einddatum («до відкликання»). */ onbepaald?: boolean; /** Herkomst: handmatig gegeven of automatisch uit het AI-beleid. */ bron?: 'handmatig' | 'ai-beleid'; /** Het account waarvoor de toestemming geldt (naam, e-mail, foto) — alleen voor actieve grants. */ eigenaar?: { naam: string; email: string; foto: string } | null };
export type AgentTegel = { slug: string; naam: string; modus: 'always' | 'ask' | 'off' | null; beleidCode: string; uitdrukkelijk: boolean;
  recht: { id: string; onbepaald: boolean; verlooptOp: string; bron: 'handmatig' | 'ai-beleid' } | null; verbindingen: { technisch: number; prive: number; laatstGebruikt: string } };
export type Passkey = { vingerafdruk: string; kort: string; label: string; toegevoegd?: string; door?: string };
export type Wachtend = { vingerafdruk: string; kort: string; label: string; aangemaakt: string; sshOpdracht: string };
export type Keuze = { id: string; label: string; naam?: string; foto?: string };
export type Installatie = { id: string; tijd: string; code: string; herkomst: string; wie: string; pakket: string; release: string; commit: string; adres: string; uk: string; nl: string };
export type Overzicht = {
  schakelaar: boolean; rpId: string; origins: string[]; passkeys: Passkey[]; wachtend: Wachtend[]; voorstellen: Voorstel[]; installaties?: Installatie[]; voorbereiders: Grant[];
  // accountsTotaal/accountsAfgekapt (20.10.2026): met meer goedgekeurde accounts dan de lijst toont, moet het scherm dat ZEGGEN en laten zoeken
  // — vroeger vielen mensen achteraan het alfabet er stil uit en kreeg de eigenaar geen uitleg waarom ze niet te kiezen waren.
  kandidaten: { accounts: Keuze[]; accountsTotaal?: number; accountsAfgekapt?: boolean; accountsZoek?: string; agenttokens: Keuze[]; koppelingen: Keuze[]; agents?: Keuze[]; uitgesloten?: { koppelingenPrive: number; tokensPrive: number } };
  /** Wat het ondertekende AI-beleid zegt over «Розгортати сайт» per agent + alle agents als tegels (backend/uitrol-beleid-sync.ts). */
  beleid?: { staat: string; agents: Array<{ slug: string; modus: 'always' | 'ask' | 'off' | null; code: string; uitdrukkelijk: boolean }>; tegels: AgentTegel[] } | null;
  rootStatus: { staat?: string; versie?: string; code?: string; uk?: string; nl?: string; tijd?: string; methode?: string } | null;
  limieten: { voorbereiderMaxDagen: number; maxBytes?: number; maxStuk?: number }; ik?: { id: string; email: string; naam?: string; foto?: string };
  /** UITROL-VERSIE van de release die nu draait (voor «niet nieuwer dan de actieve versie»). */
  actieveVersie?: string | null;
  /** Eén bron van waarheid (0062, backend/uitrol-bron.ts): samengevoegde stand + afwijkingen tussen de bronnen. */
  stand?: StandKort;
};
// ---- Джерела статусу (backend/uitrol-bron.ts) ----
export type BronId = 'runs' | 'status' | 'events' | 'voorstellen' | 'releasemap' | 'vorige' | 'versie' | 'nazorg' | 'github' | 'backups';
export type Hoofdbron = 'runs' | 'status' | 'releasemap' | 'versie';
export type BronToestand = 'ok' | 'afwijking' | 'oud' | 'onbekend' | 'bezig';
export type BronStand = { id: BronId; beschikbaar: boolean; versie: string; release: string; commit: string; staat: string; methode: string; tijd: string; leeftijdSec: number | null; toestand: BronToestand; detail: Record<string, unknown>; uk: string; nl: string };
export type Afwijking = { bron: BronId; veld: 'versie' | 'release' | 'staat' | 'commit'; waarde: string; verwacht: string; uk: string; nl: string; ernst: 'warn' | 'error' };
export type KaartKnoop = { id: BronId | 'root' | 'installer' | 'app' | 'ui' | 'mcp'; uk: string; nl: string; soort: 'bron' | 'proces' | 'uit'; pad?: string };
export type KaartRand = { van: KaartKnoop['id']; naar: KaartKnoop['id']; uk: string; nl: string };
export type StandKort = { versie: string; release: string; commit: string; staat: string; methode: string; tijd: string; hoofdbron: Hoofdbron; gebruikteBron: BronId; afwijkingen: Afwijking[] };
export type Stand = StandKort & { intervalSec: number; bronnen: BronStand[]; kaart: { knopen: KaartKnoop[]; randen: KaartRand[] }; bijgewerkt: string };
export const SOORT: Record<GrantSoort, [string, string]> = { account: ['Акаунт', 'Account'], agenttoken: ['Токен агента', 'Agenttoken'], 'mcp-koppeling': ['MCP-підключення', 'MCP-koppeling'], agent: ['Агент (усі його підключення)', 'Agent (al zijn koppelingen)'] };
export const VOORSTEL_STATUS: Record<string, [string, string]> = {
  uploaden: ['Завантажується', 'Wordt geüpload'], 'wacht-op-goedkeuring': ['Чекає схвалення', 'Wacht op goedkeuring'], goedgekeurd: ['Схвалено, чекає на сервер', 'Goedgekeurd, wacht op de server'],
  geinstalleerd: ['Встановлено', 'Geïnstalleerd'], mislukt: ['Не вдалося', 'Mislukt'], geweigerd: ['Сервер відмовив', 'Geweigerd door de server'],
  afgewezen: ['Відхилено вами', 'Door u afgewezen'], verlopen: ['Минув термін', 'Verlopen'], afgebroken: ['Скасовано', 'Afgebroken'],
};

// Voorcontrole van de site vóór de goedkeuring (backend/uitrol-voorcontrole.ts) en metadata uit het pakket zelf.
export type ControleNiveau = 'ok' | 'waarschuwing' | 'fout';
export type ControleUit = { id: string; niveau: ControleNiveau; uk: string; nl: string; details?: string[] };
export type VoorcontroleUit = { versie: number; tijd: string; ok: boolean; fouten: number; waarschuwingen: number; controles: ControleUit[] };
export type PakketMetaUit = { auteur: string; agent: string; samenvatting: string; bestanden: number; bytesUitgepakt: number; commit: string; bovenmap: string; manifest?: import('../../shared/uitrol-manifest').Manifest | null };
/** Stand van de «nieuwe update» (de wizard op het tabblad Огляд), zodat de vier fasen bovenaan bij een nieuw bestand opnieuw beginnen. */
export type FlowFase = 'leeg' | 'voorbereiding' | 'goedkeuring';
/** UITROL-001: «stap»/«stand» zeggen de conveyor welke van de eerste vier knopen loopt (vereisten → upload → controle → goedkeuring). */
export type Flow = { fase: FlowFase; versie: string; detail: string; stap?: 'vereisten' | 'upload' | 'controle' | 'goedkeuring'; stand?: 'wacht' | 'bezig' | 'fout' };
