// Één tijdlijn voor «Історія» op admin.*/updates (22.10.2026, zone B): installaties (runs), afgebroken pogingen (0081) en pakketten
// die niet tot een installatie kwamen (voorstellen) in ÉÉN lijst op datum, met één stand per regel en de regel voor «Спробувати знову».
//
// Waarom: tot nu toe stonden afgebroken/mislukte pogingen in een apart blok onder de tabel en de afgewezen/verlopen pakketten in een
// derde kaart, zodat de eigenaar de volgorde van de gebeurtenissen zelf moest reconstrueren. En «Спробувати знову» bleef actief voor
// een poging waarna allang een nieuwere release was geïnstalleerd.
//
// Zuiver: geen DOM, geen fetch. Getest in tests/eenheid/uitrol-geschiedenis-tijdlijn-20261022.test.ts.
import type { PogingUit } from '../../shared/uitrol-pogingen';
import { pogingActie } from '../../shared/uitrol-pogingen';
import type { Lang, Run, Voorstel } from './types';

export type TijdlijnSoort = 'run' | 'poging' | 'voorstel';
/** Eén stand per regel: de staten van een run, plus «teruggedraaid» (op verzoek), «autoterug» (door de bewaker/rendercontrole) en de einden van een voorstel. */
export type TijdlijnStaat = 'bezig' | 'klaar' | 'mislukt' | 'geweigerd' | 'afgebroken' | 'teruggedraaid' | 'autoterug' | 'afgewezen' | 'verlopen';
export const TIJDLIJN_STATEN: readonly TijdlijnStaat[] = ['bezig', 'klaar', 'teruggedraaid', 'autoterug', 'mislukt', 'geweigerd', 'afgebroken', 'afgewezen', 'verlopen'];
export type OpnieuwReden = '' | 'NIEUWER_GEINSTALLEERD' | 'OUDER_DAN_ACTIEF' | 'BEZIG' | 'GEEN_VERSIE' | 'NIET_VAN_TOEPASSING';
export type TijdlijnItem = {
  id: string; soort: TijdlijnSoort; staat: TijdlijnStaat; tijd: string; versie: string; code: string; uk: string; nl: string; methode: string; wie: string;
  run?: Run; poging?: PogingUit; voorstel?: Voorstel;
  /** «Спробувати знову»: kan het, en zo nee waarom (de knop staat uit met deze uitleg). `hervat` = verder gaan waar het stopte. */
  opnieuw: { kan: boolean; reden: OpnieuwReden; hervat: boolean };
};

const AUTOTERUG = new Set(['ROOK_TERUGGEDRAAID', 'NAZORG_TERUGGEDRAAID']);
const TERUG = new Set(['TERUG_OK', 'SSH_TERUG']);
const VOORSTEL_EIND: Record<string, TijdlijnStaat> = { afgewezen: 'afgewezen', verlopen: 'verlopen', afgebroken: 'afgebroken', mislukt: 'mislukt', geweigerd: 'geweigerd' };
const VERSIE = /^\d{8}-\d{6}$/;
const ms = (v: string) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : 0; };

/** Stand van een run op de tijdlijn: terugdraaiingen krijgen een eigen stand (ze zijn geen «gelukte installatie»). */
export function runStaat(r: Pick<Run, 'staat' | 'code'>): TijdlijnStaat {
  if (r.staat === 'klaar' && TERUG.has(r.code)) return 'teruggedraaid';
  if (AUTOTERUG.has(r.code)) return 'autoterug';
  return r.staat;
}
/** Een echte installatie (geen terugdraaiing) die gelukt is: alleen die telt als «nieuwere release geïnstalleerd». */
const isInstallatie = (r: Run) => r.staat === 'klaar' && !TERUG.has(r.code) && !AUTOTERUG.has(r.code);
export const MISLUKT_STATEN: ReadonlySet<TijdlijnStaat> = new Set(['mislukt', 'geweigerd', 'afgebroken', 'afgewezen', 'verlopen', 'autoterug']);

/**
 * Mag «Спробувати знову» voor dit item? Nooit als er een run loopt; niet als na dit moment een NIEUWERE release is geïnstalleerd
 * (de poging is ingehaald) of als de versie van de poging ouder is dan de actieve versie (terug naar een oudere versie is geen
 * «opnieuw proberen» maar een terugdraaiing — daarvoor is de wizard op mcp-host /dashboard).
 */
export function opnieuwMogelijk(item: { staat: TijdlijnStaat; tijd: string; versie: string }, runs: readonly Run[], actieveVersie: string): { kan: boolean; reden: OpnieuwReden } {
  if (!MISLUKT_STATEN.has(item.staat)) return { kan: false, reden: 'NIET_VAN_TOEPASSING' };
  if (runs.some((r) => r.staat === 'bezig')) return { kan: false, reden: 'BEZIG' };
  if (!VERSIE.test(item.versie)) return { kan: false, reden: 'GEEN_VERSIE' };
  const t = ms(item.tijd);
  if (runs.some((r) => isInstallatie(r) && VERSIE.test(r.versie) && r.versie > item.versie && ms(r.geeindigd || r.gestart) > t)) return { kan: false, reden: 'NIEUWER_GEINSTALLEERD' };
  if (VERSIE.test(actieveVersie) && item.versie < actieveVersie) return { kan: false, reden: 'OUDER_DAN_ACTIEF' };
  return { kan: true, reden: '' };
}

/** Hoort dit voorstel bij een run (dan staat de run al in de lijst en hoeft het voorstel niet apart)? */
function heeftRun(v: Voorstel, runs: readonly Run[]): boolean {
  const beslist = ms(v.beslistOp);
  return runs.some((r) => r.voorstelId === v.id || (!!v.versie && r.versie === v.versie && beslist > 0 && Math.abs(ms(r.gestart) - beslist) < 15 * 60_000));
}

export type TijdlijnInvoer = { runs: readonly Run[]; pogingen: readonly PogingUit[]; voorstellen: readonly Voorstel[]; actieveVersie: string;
  /** Alleen items binnen dit venster (ms sinds epoch; voor paginering van de runs): ontbreekt = alles. */
  venster?: { van?: number; tot?: number } };

export function bouwTijdlijn(i: TijdlijnInvoer): TijdlijnItem[] {
  const uit: TijdlijnItem[] = [];
  const binnen = (tijd: string) => { const t = ms(tijd); if (!i.venster) return true; if (i.venster.van !== undefined && t < i.venster.van) return false; if (i.venster.tot !== undefined && t > i.venster.tot) return false; return true; };
  const opnieuw = (staat: TijdlijnStaat, tijd: string, versie: string, hervat = false) => ({ ...opnieuwMogelijk({ staat, tijd, versie }, i.runs, i.actieveVersie), hervat });
  for (const r of i.runs) {
    if (!binnen(r.gestart)) continue;
    const staat = runStaat(r);
    uit.push({ id: `run:${r.id}`, soort: 'run', staat, tijd: r.gestart, versie: r.versie || r.release || '', code: r.code, uk: r.uk, nl: r.nl, methode: r.methode, wie: r.wie || r.voorbereider || '', run: r, opnieuw: opnieuw(staat, r.gestart, r.versie || '') });
  }
  const metPoging = new Set<string>();
  for (const p of i.pogingen) {
    if (!binnen(p.tijd)) continue;
    metPoging.add(p.voorstelId);
    uit.push({ id: `poging:${p.id}`, soort: 'poging', staat: 'afgebroken', tijd: p.tijd, versie: p.versie, code: p.code, uk: '', nl: '', methode: p.gemeldDoor, wie: p.voorbereider, poging: p,
      opnieuw: opnieuw('afgebroken', p.tijd, p.versie, pogingActie(p) === 'hervatten') });
  }
  for (const v of i.voorstellen) {
    const staat = VOORSTEL_EIND[v.status];
    if (!staat || metPoging.has(v.id) || heeftRun(v, i.runs)) continue;
    const tijd = v.beslistOp || v.bijgewerktOp || v.aangemaaktOp;
    if (!binnen(tijd)) continue;
    uit.push({ id: `voorstel:${v.id}`, soort: 'voorstel', staat, tijd, versie: v.versie, code: v.uitkomstCode || '', uk: v.uitkomst?.uk || v.uitkomst?.reden || '', nl: v.uitkomst?.nl || v.uitkomst?.reden || '', methode: 'passkey', wie: v.voorbereider, voorstel: v,
      opnieuw: opnieuw(staat, tijd, v.versie, v.status === 'uploaden' && v.ontvangen > 0) });
  }
  return uit.sort((a, b) => ms(b.tijd) - ms(a.tijd) || a.id.localeCompare(b.id));
}

/** Tellers per stand (voor de filterchips). */
export function tijdlijnTellers(items: readonly TijdlijnItem[]): Record<TijdlijnStaat, number> {
  const t = Object.fromEntries(TIJDLIJN_STATEN.map((s) => [s, 0])) as Record<TijdlijnStaat, number>;
  for (const it of items) t[it.staat] = (t[it.staat] || 0) + 1;
  return t;
}

const STAAT_TEKST: Record<TijdlijnStaat, [string, string]> = {
  bezig: ['Триває', 'Bezig'], klaar: ['Встановлено', 'Geïnstalleerd'], teruggedraaid: ['Відкочено', 'Teruggedraaid'], autoterug: ['Автовідкат', 'Automatisch teruggedraaid'],
  mislukt: ['Помилка', 'Mislukt'], geweigerd: ['Відхилено сервером', 'Geweigerd door de server'], afgebroken: ['Обірвано', 'Afgebroken'], afgewezen: ['Відхилено вами', 'Door u afgewezen'], verlopen: ['Минув термін', 'Verlopen'],
};
export const tijdlijnStaatTekst = (lang: Lang, s: TijdlijnStaat) => (lang === 'uk' ? STAAT_TEKST[s][0] : STAAT_TEKST[s][1]);
const REDEN_TEKST: Record<Exclude<OpnieuwReden, ''>, [string, string]> = {
  NIEUWER_GEINSTALLEERD: ['Після цієї спроби вже встановлено новіший випуск — повторювати її немає сенсу.', 'Na deze poging is al een nieuwere release geïnstalleerd — opnieuw proberen heeft geen zin.'],
  OUDER_DAN_ACTIEF: ['Ця версія старіша за активну. Повернутися до старішої — це відкат (mcp → Панель розгортання), не повторна спроба.', 'Deze versie is ouder dan de actieve. Teruggaan naar een oudere is terugdraaien (mcp → Deploy-dashboard), geen nieuwe poging.'],
  BEZIG: ['Зараз триває інше розгортання — дочекайтеся його кінця.', 'Er loopt nu een andere uitrol — wacht tot die klaar is.'],
  GEEN_VERSIE: ['У цієї спроби немає версії — завантажте пакет заново.', 'Deze poging heeft geen versie — upload het pakket opnieuw.'],
  NIET_VAN_TOEPASSING: ['', ''],
};
export const opnieuwRedenTekst = (lang: Lang, r: OpnieuwReden) => (r ? (lang === 'uk' ? REDEN_TEKST[r][0] : REDEN_TEKST[r][1]) : '');
