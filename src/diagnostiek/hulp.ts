// Zuivere hulpfuncties van de beheerdiagnostiek (filteren, antwoord normaliseren, foutteksten). Geen React: te testen zonder browser.
import {
  CONTROLES, STAND_VOLGORDE, isControleId, schoonUitslag,
  type CategorieId, type ControleDef, type Historie, type Stand, type Toestand, type Uitslag,
} from '../../shared/beheer-diagnostiek';

export type Lang = 'uk' | 'nl';
export type Trend = { dagen: Array<{ dag: number; ok: number; slecht: number }>; top: Array<{ id: string; n: number; sinds: number }>; week: { uitvoeringen: number; slecht: number } };
export type Overzicht = { toestanden: Record<string, Toestand>; historie: Historie[]; trend: Trend; nu: number };
export type StandFilter = 'alles' | 'problemen' | 'ok' | 'nooit';

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});
const getal = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

/** Antwoord van de server → veilige vorm. Alles wat niet in het register staat of er vreemd uitziet valt weg. */
export function normaliseer(raw: unknown): Overzicht {
  const r = obj(raw);
  const toestanden: Record<string, Toestand> = {};
  for (const [id, t] of Object.entries(obj(r.toestanden))) {
    if (!isControleId(id)) continue;
    const o = obj(t);
    const laatste = schoonUitslag(o.laatste);
    toestanden[id] = {
      laatste: laatste && laatste.id === id ? laatste : null,
      laatsteSucces: getal(o.laatsteSucces), eersteFoutSindsSucces: getal(o.eersteFoutSindsSucces),
      fouten24: getal(o.fouten24), uitvoeringen24: getal(o.uitvoeringen24), door: typeof o.door === 'string' ? o.door.slice(0, 160) : undefined,
    };
  }
  const historie: Historie[] = [];
  for (const h of Array.isArray(r.historie) ? r.historie : []) {
    const u = schoonUitslag(h); const o = obj(h);
    if (u) historie.push({ ...u, nr: getal(o.nr), door: typeof o.door === 'string' ? o.door.slice(0, 160) : '', categorie: typeof o.categorie === 'string' ? o.categorie.slice(0, 20) : '' });
  }
  const t = obj(r.trend), w = obj(t.week);
  const trend: Trend = {
    dagen: (Array.isArray(t.dagen) ? t.dagen : []).map((d) => { const o = obj(d); return { dag: getal(o.dag), ok: getal(o.ok), slecht: getal(o.slecht) }; }).filter((d) => d.dag > 0).slice(-14),
    top: (Array.isArray(t.top) ? t.top : []).map((d) => { const o = obj(d); return { id: String(o.id || ''), n: getal(o.n), sinds: getal(o.sinds) }; }).filter((d) => isControleId(d.id)).slice(0, 5),
    week: { uitvoeringen: getal(w.uitvoeringen), slecht: getal(w.slecht) },
  };
  return { toestanden, historie, trend, nu: getal(r.nu) || Date.now() };
}

export const tekstUit = (lang: Lang, t: readonly [string, string]) => (lang === 'uk' ? t[0] : t[1]);

/** Filter + zoekterm op de lijst controles van één tabblad. Zoekt in naam, uitleg, id en de laatste detailtekst. */
export function filterControles(defs: readonly ControleDef[], opt: { cat: CategorieId | 'alle'; zoek: string; filter: StandFilter; toestanden: Record<string, Toestand | undefined>; lang: Lang }): ControleDef[] {
  const q = opt.zoek.trim().toLowerCase();
  const uit = defs.filter((d) => {
    if (opt.cat !== 'alle' && d.cat !== opt.cat) return false;
    const u = opt.toestanden[d.id]?.laatste ?? null;
    if (opt.filter === 'nooit' && u) return false;
    if (opt.filter === 'ok' && u?.stand !== 'ok') return false;
    if (opt.filter === 'problemen' && (!u || u.stand === 'ok')) return false;
    if (!q) return true;
    const hooi = `${d.id} ${d.naam.join(' ')} ${d.wat.join(' ')} ${d.waarom.join(' ')} ${u?.detail ?? ''} ${u?.code ?? ''}`.toLowerCase();
    return q.split(/\s+/).every((w) => hooi.includes(w));
  });
  // Problemen bovenaan: fout → let-op → onbekend → ok → nooit uitgevoerd; binnen de probleemgroepen de nieuwste uitslag eerst, daarna de registervolgorde.
  const rang = (d: ControleDef) => { const u = opt.toestanden[d.id]?.laatste; return u ? STAND_VOLGORDE[u.stand] : 4; };
  return opt.filter === 'alles' || opt.filter === 'problemen' ? uit.map((d, i) => ({ d, i })).sort((a, b) => rang(a.d) - rang(b.d) || (rang(a.d) < 3 ? (opt.toestanden[b.d.id]?.laatste?.op ?? 0) - (opt.toestanden[a.d.id]?.laatste?.op ?? 0) : 0) || a.i - b.i).map((x) => x.d) : uit;
}

const FOUT_TEKST: Record<string, readonly [string, string]> = {
  DIAGNOSE_BEZIG: ['Інша перевірка ще триває. Зачекайте кілька секунд.', 'Er loopt al een controle. Wacht enkele seconden.'],
  RATE_LIMITED: ['Забагато перевірок за короткий час. Спробуйте за кілька хвилин.', 'Te veel controles in korte tijd. Probeer over enkele minuten opnieuw.'],
  TECH_DIAGNOSE_VEREIST: ['Для діагностики потрібен активний технічний профіль з правом «читання діагностики».', 'Voor diagnostiek is een actief technisch profiel met het recht «diagnose lezen» nodig.'],
  OWNER_REQUIRED: ['Лише власник може запускати перевірки.', 'Alleen de eigenaar kan controles starten.'],
  ADMIN_SERVICE_REQUIRED: ['Діагностика доступна лише на admin.tarasevych.com.', 'Diagnostiek is alleen beschikbaar op admin.tarasevych.com.'],
  CHECK_ONBEKEND: ['Невідома перевірка.', 'Onbekende controle.'],
  DIAGNOSE_FOUT: ['Сервер не зміг виконати перевірки. Деталі — у журналі служби.', 'De server kon de controles niet uitvoeren. Details staan in het dienstlogboek.'],
};
export function foutTekst(lang: Lang, e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  const t = FOUT_TEKST[m];
  if (t) return tekstUit(lang, t);
  return lang === 'uk' ? 'Не вдалося виконати запит. Перевірте з’єднання та спробуйте ще раз.' : 'De aanvraag is mislukt. Controleer de verbinding en probeer opnieuw.';
}

export const STAND_KLEUR: Record<Stand | 'nooit', string> = { ok: '#10b981', 'let-op': '#f59e0b', fout: '#ef4444', onbekend: '#94a3b8', nooit: '#94a3b8' };
export const uitslagVan = (t: Record<string, Toestand | undefined>, id: string): Uitslag | null => t[id]?.laatste ?? null;

export const CONTROLES_PER_ID: Record<string, ControleDef> = Object.fromEntries(CONTROLES.map((c) => [c.id, c]));
