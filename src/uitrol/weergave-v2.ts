// UI-010 fase 2 (vlag uitrol-weergave-v2): pure regels voor de vernieuwde «Оновлення»-pagina. Geen DOM, geen fetch.
// Getest in tests/eenheid/uitrol-weergave-v2.test.ts.
//   * effectieveToegang — ÉÉN definitie van «heeft nu echt toegang» voor het compacte blok (Огляд) én de volledige lijst
//     (Налаштування → Voorbereiders): verlopen, ingetrokken, geblokkeerd door het AI-beleid, koppeling/token bestaat niet meer.
//   * herstelActies — alleen acties die technisch echt bestaan voor deze fout (geen universele «Почати заново»).
//   * voortgang — percentage altijd met de etappe erbij: «100% gelezen» is geen geslaagde installatie.
//   * groepeer — opeenvolgende mislukte pogingen van dezelfde versie in één groep; elke poging blijft een eigen regel (audit).
//   * recenteProblemen — wat op «Огляд» nog aandacht vraagt (≤ 7 dagen, niet ingehaald door een nieuwere installatie).
import { POGING_ETAPPES, type PogingUit } from '../../shared/uitrol-pogingen';
import { MISLUKT_STATEN, type TijdlijnItem } from './geschiedenis-tijdlijn';
import type { Grant, Overzicht, Run } from './types';

export type ToegangStaat = 'actief' | 'verlopen' | 'ingetrokken' | 'beleid' | 'verweesd';
export function effectieveToegang(g: Grant, data: Pick<Overzicht, 'beleid' | 'kandidaten'>, nu = Date.now()): ToegangStaat {
  if (g.status === 'ingetrokken') return 'ingetrokken';
  if (g.status === 'verlopen' || (!g.onbepaald && g.verlooptOp && Date.parse(g.verlooptOp) <= nu)) return 'verlopen';
  if (g.soort === 'agent' && data.beleid?.staat === 'geldig') {
    const modus = data.beleid.tegels?.find((t) => t.slug === g.onderwerp)?.modus;
    if (modus !== 'always' && modus !== 'ask') return 'beleid';
  }
  if (g.soort === 'mcp-koppeling' && !data.kandidaten.koppelingen.some((k) => k.id === g.onderwerp)) return 'verweesd';
  if (g.soort === 'agenttoken' && !data.kandidaten.agenttokens.some((k) => k.id === g.onderwerp)) return 'verweesd';
  return 'actief';
}
export const TOEGANG_TEKST: Record<ToegangStaat, [string, string]> = {
  actief: ['діє', 'actief'], verlopen: ['термін минув', 'verlopen'], ingetrokken: ['відкликано', 'ingetrokken'],
  beleid: ['заблоковано політикою ШІ', 'geblokkeerd door AI-beleid'], verweesd: ['підключення більше немає', 'koppeling bestaat niet meer'],
};

export type HerstelActie = 'hervatten' | 'archief-kiezen' | 'controle-herhalen' | 'vereisten' | 'diagnose' | 'logboek';
const LEESFOUT = /NotReadable|BESTAND_LEZEN|NotFound|SecurityError|LEES/i;
export function herstelActies(p: Pick<PogingUit, 'etappe' | 'code' | 'hervatbaar' | 'ontvangen'>): HerstelActie[] {
  if (p.hervatbaar && p.ontvangen > 0) return ['hervatten', 'archief-kiezen'];
  if (LEESFOUT.test(p.code) || p.etappe === 'kiezen' || p.etappe === 'lezen') return ['archief-kiezen'];
  if (p.etappe === 'voorcontrole' || /VOORCONTROLE|GEEN_|_ONGELDIG|_KORT|MANIFEST/.test(p.code)) return ['vereisten', 'controle-herhalen'];
  if (p.etappe === 'installeren') return ['logboek', 'diagnose'];
  if (p.etappe === 'goedkeuren') return ['diagnose'];
  return ['archief-kiezen', 'diagnose'];
}
export const HERSTEL_TEKST: Record<HerstelActie, [string, string, string, string]> = {
  hervatten: ['Продовжити з місця зупинки', 'Hervatten waar het stopte', 'Сервер уже має частину пакета: виберіть той самий файл — завантаження продовжиться.', 'De server heeft al een deel: kies hetzelfde bestand — de upload gaat verder.'],
  'archief-kiezen': ['Вибрати архів знову', 'Archief opnieuw kiezen', 'Браузер втратив доступ до файлу. Відновити його сам він не може: виберіть файл ще раз (краще з локального диска, не з хмарної теки).', 'De browser verloor de toegang tot het bestand en kan het niet zelf herstellen: kies het opnieuw (liefst van de lokale schijf, niet uit een cloudmap).'],
  'controle-herhalen': ['Повторити перевірку', 'Controle herhalen', 'Виберіть виправлений архів — перевірка запуститься знову.', 'Kies het herstelde archief — de controle loopt opnieuw.'],
  vereisten: ['Переглянути вимоги пакета', 'Pakketvereisten bekijken', 'Які файли й поля мають бути в пакеті.', 'Welke bestanden en velden in het pakket moeten staan.'],
  diagnose: ['Відкрити «Діагностика»', '«Diagnose» openen', 'Стан служб і ланцюжка сервера.', 'Stand van de diensten en de serverketen.'],
  logboek: ['Відкрити журнал', 'Logboek openen', 'Повний вивід сервера цього запуску.', 'Volledige serveruitvoer van deze run.'],
};

/** Percentage gekoppeld aan de etappe. `stap` = 1..8 van de keten. */
export function voortgang(p: Pick<PogingUit, 'etappe' | 'procent' | 'bytes' | 'verstuurd'>): { stap: number; totaal: number; soort: 'gelezen' | 'verstuurd' | 'geen'; procent: number } {
  const stap = Math.max(1, (POGING_ETAPPES as readonly string[]).indexOf(String(p.etappe)) + 1);
  const soort = p.etappe === 'lezen' || p.etappe === 'kiezen' || p.etappe === 'voorcontrole' ? 'gelezen' : p.etappe === 'begin' || p.etappe === 'uploaden' || p.etappe === 'klaar' ? 'verstuurd' : 'geen';
  return { stap, totaal: POGING_ETAPPES.length, soort: p.bytes > 0 ? soort : 'geen', procent: Math.max(0, Math.min(100, Math.round(p.procent || 0))) };
}

export type Groep = { sleutel: string; versie: string; items: TijdlijnItem[] };
export function groepeer(items: readonly TijdlijnItem[]): Groep[] {
  const uit: Groep[] = [];
  for (const it of items) {
    const laatste = uit[uit.length - 1];
    const mislukt = MISLUKT_STATEN.has(it.staat);
    if (laatste && mislukt && it.versie && laatste.versie === it.versie && laatste.items.every((x) => MISLUKT_STATEN.has(x.staat))) laatste.items.push(it);
    else uit.push({ sleutel: it.id, versie: it.versie, items: [it] });
  }
  return uit;
}

export function recenteProblemen(pogingen: readonly PogingUit[], runs: readonly Run[], actieveVersie: string, nu = Date.now(), dagen = 7): PogingUit[] {
  const grens = nu - dagen * 86400_000;
  return pogingen.filter((p) => {
    const t = Date.parse(p.tijd); if (!(t > grens)) return false;
    if (actieveVersie && p.versie && p.versie <= actieveVersie) return false;
    return !runs.some((r) => r.staat === 'klaar' && r.versie && p.versie && r.versie >= p.versie && Date.parse(r.geeindigd || r.gestart) > t);
  });
}
