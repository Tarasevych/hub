// Huis vNext (28.10.2026, migratie 0128): het DOMEINMODEL van het slimme huis, gedeeld door browser (src/huis/*), server
// (backend/huis-*.ts) en tests.
//
// REGELS DIE HIER VASTLIGGEN
//   • Een toestand is WAARGENOMEN (met tijd en kwaliteit) of ze bestaat niet. Er is geen «standaard aan/uit»: zonder meting is de
//     versheid 'onbekend'. Ouder dan VERS_MAX is 'verouderd'; een bron die 'unavailable' zegt is 'onbeschikbaar'.
//   • Een opdracht is pas «voltooid» als de bron de gewenste toestand teruggeeft (ACK + waarneming). «aanvaard»/«verzonden» ≠ succes.
//   • Mogelijkheden (capabilities) komen uit het MODEL/de bron (HA-domein + attributen), nooit uit een merknaam.
//   • Kritieke mogelijkheden (slot, alarm, sirene, rook/gas) kent de AI nooit als uitvoerbaar; een mens doet ze alleen met step-up.
//   • Automatiseringen bestaan in dit stadium als concept + simulatie (droogloop zonder I/O); de site voert ze niet uit.
//   • De catalogus van integraties zegt eerlijk wat er IS (alleen Home Assistant) en wat er niet is.
import type { Tweetalig } from './notities-model';
export type { Tweetalig };

export const HUIS_VLAG = 'huis-vnext';
export const VERS_MAX_MS = 15 * 60_000;           // waarneming ouder dan 15 min = verouderd
export const OPDRACHT_DEADLINE_MS = 20_000;        // zonder ACK binnen 20 s: verlopen
export const MAX_RUIMTES = 120;
export const MAX_SCENE_STAPPEN = 40;
export const MAX_WONINGEN = 10;

// HUIS-001 (10.11.2026): tot nu toe een vaste lijst van 7 tijdzones in de browser en een regex op de server die alleen
// «Regio/Stad» doorliet — «UTC» uit die eigen lijst werd geweigerd (TIJDZONE_ONGELDIG), net als «America/Argentina/Buenos_Aires».
// Nu één regel voor browser, server en tests: de vorm van een IANA-naam én de motor (Intl) moet de zone kennen.
export const TIJDZONES_VAAK: readonly string[] = Object.freeze(['Europe/Amsterdam', 'Europe/Brussels', 'Europe/Kyiv', 'Europe/Warsaw', 'Europe/Berlin', 'Europe/London', 'UTC']);
export function geldigeTijdzone(z: unknown): z is string {
  if (typeof z !== 'string' || !/^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(z)) return false;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: z }); return true; } catch { return false; }
}
/** Alle tijdzones die deze motor kent (gesorteerd); een oudere motor zonder Intl.supportedValuesOf geeft de vaak gebruikte. */
export function alleTijdzones(): string[] {
  const bron = (Intl as unknown as { supportedValuesOf?: (sleutel: string) => string[] }).supportedValuesOf;
  let lijst: string[] = [];
  try { lijst = typeof bron === 'function' ? bron.call(Intl, 'timeZone') : []; } catch { lijst = []; }
  return [...new Set([...lijst, ...TIJDZONES_VAAK])].filter(geldigeTijdzone).sort((a, b) => a.localeCompare(b, 'en'));
}

export type HuisTab = 'overview' | 'rooms' | 'devices' | 'scenes' | 'automations' | 'security' | 'energy' | 'activity' | 'integrations' | 'assistant' | 'settings' | 'showroom' | 'planner';
export const HUIS_TABS: readonly HuisTab[] = Object.freeze(['overview', 'rooms', 'devices', 'scenes', 'automations', 'security', 'energy', 'activity', 'integrations', 'assistant', 'settings', 'showroom', 'planner']);
export const HUIS_TAB_LABEL: Record<HuisTab, Tweetalig> = Object.freeze({
  overview: ['Огляд', 'Overzicht'], rooms: ['Кімнати', 'Kamers'], devices: ['Пристрої', 'Apparaten'], scenes: ['Сцени', 'Scènes'], automations: ['Автоматизації', 'Automatiseringen'],
  security: ['Безпека', 'Beveiliging'], energy: ['Енергія', 'Energie'], activity: ['Події', 'Gebeurtenissen'], integrations: ['Інтеграції', 'Integraties'], assistant: ['ШІ-помічник', 'AI-assistent'],
  settings: ['Налаштування', 'Instellingen'], showroom: ['Вітрина', 'Toonzaal'], planner: ['Калькулятор', 'Planner'],
});

// ------------------------------------------------------------------------------- mogelijkheden (capabilities)
export type MogelijkheidSoort = 'aan_uit' | 'helderheid' | 'kleurtemperatuur' | 'temperatuur' | 'doeltemperatuur' | 'vochtigheid' | 'meting' | 'vermogen' | 'energie' | 'contact' | 'beweging' | 'water' | 'rook' | 'gas' | 'open_dicht' | 'positie' | 'vergrendeld' | 'alarm' | 'aanwezigheid' | 'batterij' | 'onbekend';
export type Mogelijkheid = { soort: MogelijkheidSoort; lezen: boolean; schrijven: boolean; eenheid?: string; bereik?: [number, number]; kritiek?: boolean; klasse?: string };
export const KRITIEKE_SOORTEN: readonly MogelijkheidSoort[] = Object.freeze(['vergrendeld', 'alarm', 'rook', 'gas']);
export const MOGELIJKHEID_LABEL: Record<MogelijkheidSoort, Tweetalig> = Object.freeze({
  aan_uit: ['Увімк./вимк.', 'Aan/uit'], helderheid: ['Яскравість', 'Helderheid'], kleurtemperatuur: ['Температура кольору', 'Kleurtemperatuur'], temperatuur: ['Температура', 'Temperatuur'], doeltemperatuur: ['Цільова температура', 'Doeltemperatuur'],
  vochtigheid: ['Вологість', 'Vochtigheid'], meting: ['Вимір', 'Meting'], vermogen: ['Потужність', 'Vermogen'], energie: ['Енергія', 'Energie'], contact: ['Контакт', 'Contact'], beweging: ['Рух', 'Beweging'], water: ['Вода/протікання', 'Water/lek'],
  rook: ['Дим', 'Rook'], gas: ['Газ/CO', 'Gas/CO'], open_dicht: ['Відкрити/закрити', 'Open/dicht'], positie: ['Положення', 'Positie'], vergrendeld: ['Замок', 'Slot'], alarm: ['Охорона', 'Alarm'], aanwezigheid: ['Присутність', 'Aanwezigheid'], batterij: ['Батарея', 'Batterij'], onbekend: ['Невідомо', 'Onbekend'],
});
export const isKritiek = (m: readonly Mogelijkheid[]) => m.some((x) => x.kritiek || KRITIEKE_SOORTEN.includes(x.soort));

// ------------------------------------------------------------------------------- toestand en versheid
export type Kwaliteit = 'gemeten' | 'geschat' | 'onbekend' | 'onbeschikbaar';
export type Versheid = 'vers' | 'verouderd' | 'onbekend' | 'onbeschikbaar';
export type Toestand = { kenmerk: string; waarde: unknown; eenheid: string; waargenomenOp: string | null; ontvangenOp: string; kwaliteit: Kwaliteit };
export function versheid(t: Pick<Toestand, 'waargenomenOp' | 'ontvangenOp' | 'kwaliteit'> | null | undefined, nu = Date.now()): Versheid {
  if (!t) return 'onbekend';
  if (t.kwaliteit === 'onbeschikbaar') return 'onbeschikbaar';
  if (t.kwaliteit === 'onbekend') return 'onbekend';
  const ms = Date.parse(t.ontvangenOp || t.waargenomenOp || '');
  if (Number.isNaN(ms)) return 'onbekend';
  return nu - ms > VERS_MAX_MS ? 'verouderd' : 'vers';
}
export const VERSHEID_LABEL: Record<Versheid, Tweetalig> = Object.freeze({ vers: ['актуально', 'actueel'], verouderd: ['застаріло', 'verouderd'], onbekend: ['невідомо', 'onbekend'], onbeschikbaar: ['поза мережею', 'onbeschikbaar'] });

export type Apparaat = {
  id: string; woningId: string; integratieId: string | null; bronId: string; naam: string; soort: string; fabrikant: string; model: string; firmware: string;
  ruimteId: string | null; mogelijkheden: Mogelijkheid[]; kritiek: boolean; online: boolean | null; laatstGezien: string | null; verborgen: boolean; toestanden: Toestand[];
};
export type Ruimte = { id: string; woningId: string; verdieping: string; naam: string; soort: string; geometrie: { x: number; y: number; w: number; h: number }; volgorde: number };
export type Verdieping = { id: string; naam: string };
export type Lid = { woningId: string; userId: string; rol: string; eigenaar: boolean; magSchrijven: boolean };
export type Woning = { id: string; naam: string; tijdzone: string; taal: 'uk' | 'nl'; verdiepingen: Verdieping[]; eigenaar: boolean; rol: string; aangemaaktOp: string };
export type IntegratieStand = 'niet_geinstalleerd' | 'geconfigureerd' | 'verbindt' | 'verbonden' | 'verzwakt' | 'geweigerd';
export type Integratie = { id: string; woningId: string; soort: 'home-assistant'; naam: string; adres: string; stand: IntegratieStand; schrijven: boolean; laatsteSync: string | null; hartslag: string | null; fout: string; info: Record<string, unknown> };

// ------------------------------------------------------------------------------- opdrachten (toestandsmachine)
export type OpdrachtStand = 'verzocht' | 'wacht_op_goedkeuring' | 'aanvaard' | 'verzonden' | 'bevestigd' | 'waargenomen' | 'voltooid' | 'geweigerd' | 'verlopen' | 'mislukt' | 'gedeeltelijk' | 'offline';
export const OPDRACHT_EIND: readonly OpdrachtStand[] = Object.freeze(['voltooid', 'geweigerd', 'verlopen', 'mislukt', 'gedeeltelijk', 'offline']);
export const OPDRACHT_LABEL: Record<OpdrachtStand, Tweetalig> = Object.freeze({
  verzocht: ['запитано', 'verzocht'], wacht_op_goedkeuring: ['чекає підтвердження', 'wacht op goedkeuring'], aanvaard: ['прийнято', 'aanvaard'], verzonden: ['надіслано', 'verzonden'], bevestigd: ['підтверджено шлюзом', 'bevestigd door de bron'],
  waargenomen: ['стан спостережено', 'waargenomen'], voltooid: ['виконано та підтверджено', 'voltooid en bevestigd'], geweigerd: ['відмовлено', 'geweigerd'], verlopen: ['час вийшов без підтвердження', 'verlopen zonder bevestiging'], mislukt: ['не вдалося', 'mislukt'], gedeeltelijk: ['частково', 'gedeeltelijk'], offline: ['поза мережею', 'offline'],
});
export type Opdracht = { id: string; woningId: string; via: string; apparaatId: string | null; mogelijkheid: MogelijkheidSoort; verzocht: Record<string, unknown>; idempotentie: string; correlatie: string; stand: OpdrachtStand; beleid: Record<string, unknown>; fout: string; uitkomst: Record<string, unknown>; deadline: string | null; aangemaaktOp: string; bijgewerktOp: string };
/** Toegestane overgangen: alles wat niet hier staat, is een programmeerfout en wordt geweigerd. */
export const OVERGANGEN: Record<OpdrachtStand, readonly OpdrachtStand[]> = Object.freeze({
  verzocht: ['wacht_op_goedkeuring', 'aanvaard', 'geweigerd', 'offline'], wacht_op_goedkeuring: ['aanvaard', 'geweigerd', 'verlopen'], aanvaard: ['verzonden', 'mislukt', 'offline'],
  verzonden: ['bevestigd', 'mislukt', 'verlopen', 'offline'], bevestigd: ['waargenomen', 'verlopen', 'gedeeltelijk'], waargenomen: ['voltooid', 'gedeeltelijk'],
  voltooid: [], geweigerd: [], verlopen: [], mislukt: [], gedeeltelijk: [], offline: [],
});
export const magOvergang = (van: OpdrachtStand, naar: OpdrachtStand) => OVERGANGEN[van]?.includes(naar) ?? false;

/** Gewenste waarde per mogelijkheid controleren (server én bewerker). */
export function schoneOpdrachtWaarde(soort: MogelijkheidSoort, raw: unknown, m?: Mogelijkheid): { ok: true; waarde: Record<string, unknown> } | { ok: false; fout: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const getal = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null);
  const binnen = (n: number, b?: [number, number]) => (!b || (n >= b[0] && n <= b[1]));
  switch (soort) {
    case 'aan_uit': case 'vergrendeld': case 'alarm': { if (typeof r.aan !== 'boolean') return { ok: false, fout: 'WAARDE_AAN_VEREIST' }; return { ok: true, waarde: { aan: r.aan } }; }
    case 'open_dicht': { if (!['open', 'dicht', 'stop'].includes(String(r.actie))) return { ok: false, fout: 'WAARDE_ACTIE_VEREIST' }; return { ok: true, waarde: { actie: String(r.actie) } }; }
    case 'helderheid': case 'positie': case 'doeltemperatuur': case 'kleurtemperatuur': {
      const n = getal(r.waarde); if (n === null) return { ok: false, fout: 'WAARDE_GETAL_VEREIST' };
      const bereik = m?.bereik ?? (soort === 'doeltemperatuur' ? [5, 35] : soort === 'kleurtemperatuur' ? [1000, 10000] : [0, 100]);
      if (!binnen(n, bereik as [number, number])) return { ok: false, fout: 'WAARDE_BUITEN_BEREIK' };
      return { ok: true, waarde: { waarde: n } };
    }
    default: return { ok: false, fout: 'MOGELIJKHEID_NIET_SCHRIJFBAAR' };
  }
}

// ------------------------------------------------------------------------------- scènes
export type SceneStap = { apparaatId: string; mogelijkheid: MogelijkheidSoort; waarde: Record<string, unknown> };
export type Scene = { id: string; woningId: string; naam: string; icoon: string; favoriet: boolean; stappen: SceneStap[]; laatsteRun: Record<string, unknown>; aangemaaktOp: string };
export function schoneScene(raw: unknown): { ok: true; naam: string; icoon: string; favoriet: boolean; stappen: SceneStap[] } | { ok: false; fout: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const naam = String(r.naam ?? '').replace(/\s+/g, ' ').trim();
  if (!naam || naam.length > 80) return { ok: false, fout: 'NAAM_ONGELDIG' };
  const stappenRaw = Array.isArray(r.stappen) ? r.stappen : [];
  if (stappenRaw.length > MAX_SCENE_STAPPEN) return { ok: false, fout: 'TE_VEEL_STAPPEN' };
  const stappen: SceneStap[] = [];
  for (const s of stappenRaw) {
    const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    if (typeof o.apparaatId !== 'string' || !o.apparaatId) return { ok: false, fout: 'STAP_APPARAAT_VEREIST' };
    const soort = String(o.mogelijkheid ?? '') as MogelijkheidSoort;
    if (KRITIEKE_SOORTEN.includes(soort)) return { ok: false, fout: 'STAP_KRITIEK_NIET_TOEGESTAAN' };
    const w = schoneOpdrachtWaarde(soort, o.waarde);
    if (!w.ok) return { ok: false, fout: w.fout };
    stappen.push({ apparaatId: o.apparaatId, mogelijkheid: soort, waarde: w.waarde });
  }
  return { ok: true, naam, icoon: /^[a-z-]{1,24}$/.test(String(r.icoon ?? '')) ? String(r.icoon) : 'sparkles', favoriet: r.favoriet === true, stappen };
}

// ------------------------------------------------------------------------------- automatiseringen (concept + droogloop)
export type Wanneer = { soort: 'tijd'; tijd: string; dagen?: number[] } | { soort: 'toestand'; apparaatId: string; kenmerk: string; wordt: unknown } | { soort: 'drempel'; apparaatId: string; kenmerk: string; boven?: number; onder?: number };
export type Als = { soort: 'tijdvenster'; van: string; tot: string } | { soort: 'toestand'; apparaatId: string; kenmerk: string; is: unknown } | { soort: 'aanwezig'; aanwezig: boolean };
export type Dan = { soort: 'scene'; sceneId: string } | { soort: 'opdracht'; apparaatId: string; mogelijkheid: MogelijkheidSoort; waarde: Record<string, unknown> } | { soort: 'melding'; tekst: string };
export type Regel = { wanneer: Wanneer[]; als: Als[]; alsModus: 'alle' | 'een'; dan: Dan[]; instellingen: { afkoelMinuten: number; maxPerDag: number; vertragingSeconden: number } };
export const legeRegel = (): Regel => ({ wanneer: [], als: [], alsModus: 'alle', dan: [], instellingen: { afkoelMinuten: 5, maxPerDag: 50, vertragingSeconden: 0 } });
export type Automatisering = { id: string; woningId: string; naam: string; regel: Regel; stand: 'concept' | 'simulatie' | 'aan' | 'gepauzeerd' | 'fout'; versie: number; laatsteRun: Record<string, unknown>; aangemaaktOp: string; bijgewerktOp: string };

const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/;
export function schoneRegel(raw: unknown): { ok: true; regel: Regel } | { ok: false; fout: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const regel = legeRegel();
  for (const w of Array.isArray(r.wanneer) ? r.wanneer : []) {
    const o = (w && typeof w === 'object' ? w : {}) as Record<string, unknown>;
    if (o.soort === 'tijd') { if (!TIJD.test(String(o.tijd))) return { ok: false, fout: 'WANNEER_TIJD_ONGELDIG' }; regel.wanneer.push({ soort: 'tijd', tijd: String(o.tijd), dagen: Array.isArray(o.dagen) ? o.dagen.map(Number).filter((d) => d >= 0 && d <= 6) : undefined }); }
    else if (o.soort === 'toestand') { if (!o.apparaatId || !o.kenmerk) return { ok: false, fout: 'WANNEER_APPARAAT_VEREIST' }; regel.wanneer.push({ soort: 'toestand', apparaatId: String(o.apparaatId), kenmerk: String(o.kenmerk), wordt: o.wordt }); }
    else if (o.soort === 'drempel') { if (!o.apparaatId || !o.kenmerk) return { ok: false, fout: 'WANNEER_APPARAAT_VEREIST' }; regel.wanneer.push({ soort: 'drempel', apparaatId: String(o.apparaatId), kenmerk: String(o.kenmerk), boven: typeof o.boven === 'number' ? o.boven : undefined, onder: typeof o.onder === 'number' ? o.onder : undefined }); }
    else return { ok: false, fout: 'WANNEER_SOORT_ONBEKEND' };
  }
  if (!regel.wanneer.length) return { ok: false, fout: 'WANNEER_VEREIST' };
  for (const a of Array.isArray(r.als) ? r.als : []) {
    const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
    if (o.soort === 'tijdvenster') { if (!TIJD.test(String(o.van)) || !TIJD.test(String(o.tot))) return { ok: false, fout: 'ALS_TIJD_ONGELDIG' }; regel.als.push({ soort: 'tijdvenster', van: String(o.van), tot: String(o.tot) }); }
    else if (o.soort === 'toestand') { if (!o.apparaatId || !o.kenmerk) return { ok: false, fout: 'ALS_APPARAAT_VEREIST' }; regel.als.push({ soort: 'toestand', apparaatId: String(o.apparaatId), kenmerk: String(o.kenmerk), is: o.is }); }
    else if (o.soort === 'aanwezig') regel.als.push({ soort: 'aanwezig', aanwezig: o.aanwezig !== false });
    else return { ok: false, fout: 'ALS_SOORT_ONBEKEND' };
  }
  regel.alsModus = r.alsModus === 'een' ? 'een' : 'alle';
  for (const d of Array.isArray(r.dan) ? r.dan : []) {
    const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
    if (o.soort === 'scene') { if (!o.sceneId) return { ok: false, fout: 'DAN_SCENE_VEREIST' }; regel.dan.push({ soort: 'scene', sceneId: String(o.sceneId) }); }
    else if (o.soort === 'opdracht') {
      const soort = String(o.mogelijkheid ?? '') as MogelijkheidSoort;
      if (KRITIEKE_SOORTEN.includes(soort)) return { ok: false, fout: 'DAN_KRITIEK_NIET_TOEGESTAAN' };
      const w = schoneOpdrachtWaarde(soort, o.waarde); if (!w.ok) return { ok: false, fout: w.fout };
      if (!o.apparaatId) return { ok: false, fout: 'DAN_APPARAAT_VEREIST' };
      regel.dan.push({ soort: 'opdracht', apparaatId: String(o.apparaatId), mogelijkheid: soort, waarde: w.waarde });
    } else if (o.soort === 'melding') { const tekst = String(o.tekst ?? '').trim().slice(0, 200); if (!tekst) return { ok: false, fout: 'DAN_MELDING_LEEG' }; regel.dan.push({ soort: 'melding', tekst }); }
    else return { ok: false, fout: 'DAN_SOORT_ONBEKEND' };
  }
  if (!regel.dan.length) return { ok: false, fout: 'DAN_VEREIST' };
  const i = (r.instellingen && typeof r.instellingen === 'object' ? r.instellingen : {}) as Record<string, unknown>;
  regel.instellingen = { afkoelMinuten: Math.min(1440, Math.max(0, Number(i.afkoelMinuten) || 0)), maxPerDag: Math.min(1000, Math.max(1, Number(i.maxPerDag) || 50)), vertragingSeconden: Math.min(3600, Math.max(0, Number(i.vertragingSeconden) || 0)) };
  return { ok: true, regel };
}
/** Vorm van een waarneming voor de droogloop: {apparaatId: {kenmerk: waarde}}. */
export type Waarnemingen = Record<string, Record<string, unknown>>;
export type Droogloop = { zouStarten: boolean; wanneer: Array<{ beschrijving: string; waar: boolean }>; als: Array<{ beschrijving: string; waar: boolean }>; dan: Array<{ beschrijving: string; kritiek: boolean; apparaatId?: string }>; opmerkingen: string[] };
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
/** Droogloop: ZONDER I/O; zegt wat er zou gebeuren bij deze waarnemingen en dit tijdstip (lokale tijd van de oproeper). */
export function droogloop(regel: Regel, w: Waarnemingen, nu = new Date(), naam = (id: string) => id): Droogloop {
  const tijd = hhmm(nu); const dag = nu.getDay();
  const lees = (a: string, k: string) => w[a]?.[k];
  const wanneer = regel.wanneer.map((x) => {
    if (x.soort === 'tijd') return { beschrijving: `tijd ${x.tijd}${x.dagen?.length ? ` (dagen ${x.dagen.join(',')})` : ''}`, waar: x.tijd === tijd && (!x.dagen?.length || x.dagen.includes(dag)) };
    if (x.soort === 'toestand') return { beschrijving: `${naam(x.apparaatId)}.${x.kenmerk} wordt ${JSON.stringify(x.wordt)}`, waar: lees(x.apparaatId, x.kenmerk) !== undefined && JSON.stringify(lees(x.apparaatId, x.kenmerk)) === JSON.stringify(x.wordt) };
    const v = Number(lees(x.apparaatId, x.kenmerk));
    return { beschrijving: `${naam(x.apparaatId)}.${x.kenmerk} ${x.boven !== undefined ? `> ${x.boven}` : ''}${x.onder !== undefined ? ` < ${x.onder}` : ''}`, waar: Number.isFinite(v) && (x.boven === undefined || v > x.boven) && (x.onder === undefined || v < x.onder) };
  });
  const als = regel.als.map((x) => {
    if (x.soort === 'tijdvenster') { const in_ = x.van <= x.tot ? tijd >= x.van && tijd <= x.tot : tijd >= x.van || tijd <= x.tot; return { beschrijving: `tijdvenster ${x.van}–${x.tot}`, waar: in_ }; }
    if (x.soort === 'toestand') return { beschrijving: `${naam(x.apparaatId)}.${x.kenmerk} is ${JSON.stringify(x.is)}`, waar: JSON.stringify(lees(x.apparaatId, x.kenmerk)) === JSON.stringify(x.is) };
    return { beschrijving: `aanwezig = ${x.aanwezig}`, waar: w.__woning?.aanwezig === x.aanwezig };
  });
  const dan = regel.dan.map((x) => x.soort === 'scene' ? { beschrijving: `scène ${naam(x.sceneId)}`, kritiek: false } : x.soort === 'melding' ? { beschrijving: `melding «${x.tekst}»`, kritiek: false } : { beschrijving: `${naam(x.apparaatId)} → ${x.mogelijkheid} ${JSON.stringify(x.waarde)}`, kritiek: KRITIEKE_SOORTEN.includes(x.mogelijkheid), apparaatId: x.apparaatId });
  const alsOk = !als.length || (regel.alsModus === 'alle' ? als.every((a) => a.waar) : als.some((a) => a.waar));
  const opmerkingen: string[] = [];
  if (dan.some((d) => d.kritiek)) opmerkingen.push('KRITIEK_IN_DAN');
  if (regel.instellingen.afkoelMinuten === 0) opmerkingen.push('GEEN_AFKOELTIJD');
  if (regel.dan.some((d) => d.soort === 'opdracht' && regel.wanneer.some((x) => x.soort !== 'tijd' && x.apparaatId === d.apparaatId))) opmerkingen.push('MOGELIJKE_LUS');
  return { zouStarten: wanneer.some((x) => x.waar) && alsOk, wanneer, als, dan, opmerkingen };
}

// ------------------------------------------------------------------------------- gebeurtenissen, voorstellen
export type Gebeurtenis = { id: string; bron: string; soort: string; ernst: 'info' | 'belangrijk' | 'kritiek'; apparaatId: string | null; opdrachtId: string | null; bericht: string; gegevens: Record<string, unknown>; bronTijd: string | null; ontvangenOp: string; correlatie: string };
export type Voorstel = { id: string; door: string; samenvatting: string; opdracht: { apparaatId: string; mogelijkheid: MogelijkheidSoort; waarde: Record<string, unknown> }; stand: 'wacht' | 'goedgekeurd' | 'afgewezen' | 'verlopen'; verlooptOp: string; besluitOp: string | null; opdrachtId: string | null; aangemaaktOp: string };

// ------------------------------------------------------------------------------- integraties: eerlijke catalogus
export type IntegratieKaartStand = 'beschikbaar' | 'beperkt' | 'gepland' | 'niet_ondersteund';
export type IntegratieKaart = { id: string; naam: string; stand: IntegratieKaartStand; lokaal: Tweetalig; mogelijkheden: Tweetalig; vereisten: Tweetalig; wat: Tweetalig; bron: string };
export const INTEGRATIE_CATALOGUS: readonly IntegratieKaart[] = Object.freeze([
  { id: 'home-assistant', naam: 'Home Assistant', stand: 'beschikbaar', lokaal: ['локально (LAN/VPN), вихідне з’єднання з сервера', 'lokaal (LAN/VPN), uitgaande verbinding vanaf de server'], mogelijkheden: ['читання всіх сутностей; команди для світла, вимикачів, штор, клімату — після окремого дозволу на запис', 'alle entiteiten lezen; opdrachten voor licht, schakelaars, rolluiken, klimaat — na aparte schrijftoestemming'], vereisten: ['працюючий Home Assistant, довгостроковий токен доступу, адреса, доступна з сервера', 'een werkende Home Assistant, een langlevend toegangstoken, een adres dat de server kan bereiken'], wat: ['Єдиний адаптер у цьому випуску. Замки, охорона, сирени — лише читання; AI ніколи не керує ними.', 'De enige adapter in deze release. Sloten, alarm, sirenes: alleen lezen; de AI bedient ze nooit.'], bron: 'https://developers.home-assistant.io/docs/api/rest/' },
  { id: 'matter', naam: 'Matter / Thread', stand: 'gepland', lokaal: ['через контролер Matter (напр. у Home Assistant)', 'via een Matter-controller (bv. in Home Assistant)'], mogelijkheden: ['за capability кожного пристрою; через міст часто менше функцій, ніж у рідній інтеграції', 'per capability van elk apparaat; via een bridge vaak minder functies dan native'], vereisten: ['Matter Server, для Thread — Border Router', 'Matter Server, voor Thread een Border Router'], wat: ['Окремого адаптера немає; пристрої Matter, підключені до Home Assistant, з’являються через нього.', 'Geen eigen adapter; Matter-apparaten die aan Home Assistant hangen komen daarlangs binnen.'], bron: 'https://www.home-assistant.io/integrations/matter' },
  { id: 'zigbee', naam: 'Zigbee (ZHA / Zigbee2MQTT)', stand: 'gepland', lokaal: ['локально через координатор', 'lokaal via een coördinator'], mogelijkheden: ['за моделлю й expose', 'per model en expose'], vereisten: ['координатор Zigbee, канал, mesh', 'Zigbee-coördinator, kanaal, mesh'], wat: ['Лише через Home Assistant у цьому випуску.', 'Alleen via Home Assistant in deze release.'], bron: 'https://www.home-assistant.io/integrations/zha' },
  { id: 'zwave', naam: 'Z-Wave JS', stand: 'gepland', lokaal: ['локально через контролер', 'lokaal via een controller'], mogelijkheden: ['за підтримуваним класом', 'per ondersteunde klasse'], vereisten: ['частотний регіон, S2', 'frequentieregio, S2'], wat: ['Лише через Home Assistant у цьому випуску.', 'Alleen via Home Assistant in deze release.'], bron: 'https://www.home-assistant.io/integrations/zwave_js/' },
  { id: 'knx', naam: 'KNX', stand: 'gepland', lokaal: ['KNX/IP шлюз, IP Secure', 'KNX/IP-gateway, IP Secure'], mogelijkheden: ['інженерна інтеграція', 'engineering-integratie'], vereisten: ['проєкт ETS, ключі', 'ETS-project, sleutels'], wat: ['Адаптера немає.', 'Geen adapter.'], bron: 'https://support.knx.org/hc/en-us/articles/360000216419-KNX-Secure-Devices' },
  { id: 'loxone', naam: 'Loxone Miniserver', stand: 'gepland', lokaal: ['WebSocket з токеном', 'WebSocket met token'], mogelijkheden: ['залежить від конфігурації', 'afhankelijk van de configuratie'], vereisten: ['сертифікат, secure token', 'certificaat, secure token'], wat: ['Адаптера немає.', 'Geen adapter.'], bron: 'https://www.loxone.com/wp-content/uploads/datasheets/CommunicatingWithMiniserver.pdf' },
  { id: 'ajax', naam: 'Ajax Systems', stand: 'niet_ondersteund', lokaal: ['хмара виробника', 'cloud van de fabrikant'], mogelijkheden: ['лише офіційно дозволені інтеграції', 'alleen officieel toegestane integraties'], vereisten: ['Enterprise API — партнерський доступ, не для приватного акаунта', 'Enterprise API: partnertoegang, niet voor een privéaccount'], wat: ['Не обіцяємо. Охоронна система керується лише своїм застосунком.', 'Beloven wij niet. Het alarmsysteem bedient u alleen met zijn eigen app.'], bron: 'https://www.ajax-systems.uz/blog/enterprise-api/' },
  { id: 'tuya', naam: 'Tuya / LSC Smart Connect', stand: 'gepland', lokaal: ['хмара Tuya або авторизований локальний міст', 'Tuya-cloud of een geautoriseerde lokale brug'], mogelijkheden: ['за сервісом', 'per dienst'], vereisten: ['cloud project, регіон, тариф', 'cloudproject, regio, tarief'], wat: ['Лише через Home Assistant у цьому випуску.', 'Alleen via Home Assistant in deze release.'], bron: 'https://developer.tuya.com/en/docs/developer/apply-cloud-api-key?id=Kff30z8sv62ah' },
  { id: 'apple-home', naam: 'Apple Home', stand: 'niet_ondersteund', lokaal: ['HomeKit SDK у застосунку або Matter multi-admin', 'HomeKit-SDK in een app of Matter multi-admin'], mogelijkheden: ['залежить від шляху', 'afhankelijk van de weg'], vereisten: ['вебсайт не отримує доступ до бази HomeKit', 'een website krijgt geen toegang tot de HomeKit-database'], wat: ['Не можливо з вебсайту.', 'Niet mogelijk vanaf een website.'], bron: 'https://developer.apple.com/documentation/homekit' },
  { id: 'google-home', naam: 'Google Home', stand: 'gepland', lokaal: ['Home APIs (native SDK) або Matter', 'Home APIs (native SDK) of Matter'], mogelijkheden: ['залежить від пристроїв і згоди', 'afhankelijk van apparaten en toestemming'], vereisten: ['native mobile SDK, не серверний API', 'native mobile SDK, geen server-API'], wat: ['Адаптера немає.', 'Geen adapter.'], bron: 'https://developers.home.google.com/apis' },
  { id: 'alexa', naam: 'Amazon Alexa', stand: 'gepland', lokaal: ['хмарний skill', 'cloud-skill'], mogelijkheden: ['голос за підтримкою', 'spraak waar ondersteund'], vereisten: ['власний skill', 'eigen skill'], wat: ['Адаптера немає.', 'Geen adapter.'], bron: 'https://developer.amazon.com/en-US/alexa/connected-devices/development-resources/smart-home-skills' },
  { id: 'mqtt', naam: 'MQTT / ESPHome', stand: 'gepland', lokaal: ['локальний брокер', 'lokale broker'], mogelijkheden: ['власний профіль', 'eigen profiel'], vereisten: ['auth/ACL/TLS, discovery', 'auth/ACL/TLS, discovery'], wat: ['Лише через Home Assistant у цьому випуску.', 'Alleen via Home Assistant in deze release.'], bron: 'https://www.zigbee2mqtt.io/guide/usage/integrations/home_assistant.html' },
  { id: 'camera', naam: 'Камери / RTSP', stand: 'niet_ondersteund', lokaal: ['vendor bridge, локальний проксі', 'vendor bridge, lokale proxy'], mogelijkheden: ['лише за авторизованою сесією', 'alleen binnen een geautoriseerde sessie'], vereisten: ['приватність, ретенція, без відкритого RTSP', 'privacy, retentie, geen open RTSP'], wat: ['Потоків у цьому випуску немає.', 'Geen streams in deze release.'], bron: 'https://www.home-assistant.io/integrations/camera/' },
]);
export const INTEGRATIE_STAND_LABEL: Record<IntegratieKaartStand, Tweetalig> = Object.freeze({ beschikbaar: ['доступно', 'beschikbaar'], beperkt: ['обмежено', 'beperkt'], gepland: ['заплановано', 'gepland'], niet_ondersteund: ['не підтримується', 'niet ondersteund'] });
export const INTEGRATIE_STAND_TEKST: Record<IntegratieStand, Tweetalig> = Object.freeze({ niet_geinstalleerd: ['не встановлено', 'niet geïnstalleerd'], geconfigureerd: ['налаштовано, ще не перевірено', 'geconfigureerd, nog niet getest'], verbindt: ['з’єднання…', 'verbindt…'], verbonden: ['підключено', 'verbonden'], verzwakt: ['працює з перебоями', 'verzwakt'], geweigerd: ['відмовлено', 'geweigerd'] });

// ------------------------------------------------------------------------------- planner (structuur, GEEN prijzen)
export type PlannerInvoer = { soort: 'appartement' | 'rijhuis' | 'vrijstaand'; oppervlakte: number; fase: 'nieuwbouw' | 'renovatie' | 'bewoond'; functies: string[] };
export const PLANNER_FUNCTIES: ReadonlyArray<{ id: string; naam: Tweetalig; apparatenPer100m2: number; hub: boolean }> = Object.freeze([
  { id: 'licht', naam: ['Освітлення', 'Verlichting'], apparatenPer100m2: 8, hub: true },
  { id: 'klimaat', naam: ['Клімат', 'Klimaat'], apparatenPer100m2: 3, hub: true },
  { id: 'rolluiken', naam: ['Штори/ролети', 'Rolluiken'], apparatenPer100m2: 4, hub: true },
  { id: 'beveiliging', naam: ['Датчики безпеки', 'Beveiligingssensoren'], apparatenPer100m2: 6, hub: true },
  { id: 'water', naam: ['Захист від протікання', 'Lekdetectie'], apparatenPer100m2: 3, hub: true },
  { id: 'energie', naam: ['Облік енергії', 'Energiemeting'], apparatenPer100m2: 1, hub: true },
  { id: 'camera', naam: ['Камери', 'Camera’s'], apparatenPer100m2: 2, hub: false },
]);
/** Structuur van een toekomstig project: zones, aantallen en complexiteit — ZONDER bedragen (die horen bij een geverifieerde prijslijst). */
export function plannerStructuur(i: PlannerInvoer) {
  const m2 = Math.min(2000, Math.max(20, Number(i.oppervlakte) || 0));
  const factor = m2 / 100;
  const functies = PLANNER_FUNCTIES.filter((f) => i.functies.includes(f.id));
  const apparaten = functies.map((f) => ({ id: f.id, naam: f.naam, aantal: Math.max(1, Math.round(f.apparatenPer100m2 * factor * (i.soort === 'vrijstaand' ? 1.2 : i.soort === 'appartement' ? 0.9 : 1))) }));
  const totaal = apparaten.reduce((a, b) => a + b.aantal, 0);
  const complexiteit: Array<{ id: string; tekst: Tweetalig }> = [];
  if (i.fase === 'bewoond') complexiteit.push({ id: 'bewoond', tekst: ['Житло заселене: перевага бездротовим пристроям (Zigbee/Thread), мінімум штроблення', 'Bewoond: voorkeur voor draadloos (Zigbee/Thread), weinig breekwerk'] });
  if (i.fase === 'nieuwbouw') complexiteit.push({ id: 'nieuwbouw', tekst: ['Новобудова: можна планувати дротову шину (KNX) і нейтраль у кожній коробці', 'Nieuwbouw: bedrade bus (KNX) en een nul in elke doos zijn planbaar'] });
  if (totaal > 40) complexiteit.push({ id: 'mesh', tekst: ['Понад 40 пристроїв: потрібна mesh-мережа з повторювачами й окремий IoT-VLAN', 'Meer dan 40 apparaten: mesh met repeaters en een aparte IoT-VLAN'] });
  if (i.functies.includes('beveiliging')) complexiteit.push({ id: 'beveiliging', tekst: ['Безпека: сертифікована охоронна система окремо від вебінтерфейсу; сайт лише спостерігає', 'Beveiliging: gecertificeerd alarmsysteem los van de webinterface; de site kijkt alleen mee'] });
  if (i.functies.includes('camera')) complexiteit.push({ id: 'camera', tekst: ['Камери: політика приватності, ретенція, без відкритого RTSP в інтернеті', 'Camera’s: privacybeleid, retentie, geen open RTSP op internet'] });
  return { m2, zones: Math.max(1, Math.round(m2 / 18)), apparaten, totaal, hub: functies.some((f) => f.hub), complexiteit };
}
export const huisTekst = (p: Tweetalig, lang: 'uk' | 'nl') => (lang === 'uk' ? p[0] : p[1]);

// ------------------------------------------------------------------------------- leden en uitnodigingen (SEC-002, migratie 0212)
// Lid van een woning wordt men ALLEEN door zelf een uitnodiging te aanvaarden. De uitnodiger krijgt voor elk adres hetzelfde
// antwoord (ook als er geen account met dat adres bestaat) en ziet een afwijzing niet: zo is «toevoegen» geen middel om te
// raden wie een account heeft, en verschijnt een woning van een vreemde nooit ongevraagd in iemands lijst.
export const HUIS_ROLLEN_UITNODIGBAAR: readonly string[] = Object.freeze(['lid', 'gast', 'installateur', 'ondersteuning']);
export const HUIS_ROL_LABEL: Record<string, Tweetalig> = Object.freeze({
  eigenaar: ['власник', 'eigenaar'], lid: ['мешканець (керує)', 'bewoner (bedient)'], gast: ['гість (лише перегляд)', 'gast (alleen kijken)'],
  installateur: ['інсталятор (тимчасово)', 'installateur (tijdelijk)'], ondersteuning: ['підтримка (тимчасово)', 'ondersteuning (tijdelijk)'],
});
export const HUIS_UITNODIGING = Object.freeze({ geldigDagen: 14, openPerWoning: 20, herhaalMeldingUren: 24, perUur: 10 });
/** Een openstaande uitnodiging zoals de EIGENAAR ze ziet: nooit of er een account achter het adres zit, nooit een afwijzing. */
export type Uitnodiging = { id: string; woningId: string; email: string; rol: string; lidGeldigTot: string | null; stand: 'uitgenodigd'; verlooptOp: string; aangemaaktOp: string };
/** Een uitnodiging zoals de GENODIGDE ze ziet: welke woning, welke rol en wie uitnodigt (het adres van het account, niet te vervalsen). */
export type UitnodigingVoorMij = { id: string; woningNaam: string; rol: string; lidGeldigTot: string | null; doorEmail: string; doorNaam: string; verlooptOp: string; aangemaaktOp: string };
/** Teksten (uk/nl) bij de codes en stappen die SEC-002 toevoegde — voor de interface en voor de melding aan de genodigde. */
export const HUIS_UITLEG: Record<string, Tweetalig> = Object.freeze({
  RATE_LIMITED: ['Забагато запитів за короткий час. Зачекайте кілька хвилин — нічого не втрачено.', 'Te veel verzoeken in korte tijd. Wacht enkele minuten — er is niets verloren.'],
  HUIS_BEZET: ['Джерело цієї оселі зараз зайняте іншими запитами. Команду не надіслано — спробуйте ще раз за кілька секунд.', 'De bron van deze woning is nu bezet met andere verzoeken. De opdracht is niet verstuurd — probeer het over enkele seconden opnieuw.'],
  VERZENDING_ONDERBROKEN: ['Надсилання перервалося, і невідомо, чи дійшла команда до пристрою. Перевірте стан пристрою, перш ніж повторювати.', 'Het versturen werd onderbroken; het is onbekend of de opdracht het apparaat bereikte. Controleer de toestand van het apparaat voordat u het opnieuw probeert.'],
  TE_VEEL_INTEGRATIES: ['До однієї оселі можна підключити щонайбільше п’ять джерел. Від’єднайте зайве, щоб додати нове.', 'Aan één woning kunnen hoogstens vijf bronnen gekoppeld worden. Koppel er één los om een nieuwe toe te voegen.'],
  TE_VEEL_UITNODIGINGEN: ['Забагато відкритих запрошень для цієї оселі. Відкличте зайві або дочекайтеся, поки вони спливуть.', 'Te veel openstaande uitnodigingen voor deze woning. Trek er enkele in of wacht tot ze verlopen.'],
  EMAIL_ONGELDIG: ['Вкажіть повну електронну адресу.', 'Geef een volledig e-mailadres op.'],
  UITNODIGING_VERSTUURD: ['Запрошення записано. Людина стане учасником лише після того, як сама його прийме. Якщо облікового запису з цією адресою немає, запрошення просто спливе за 14 днів.', 'De uitnodiging is vastgelegd. De persoon wordt pas lid nadat hij of zij ze zelf aanvaardt. Bestaat er geen account met dit adres, dan verloopt de uitnodiging vanzelf na 14 dagen.'],
  UITNODIGING_AANVAARDEN: ['Прийнявши запрошення, ви побачите пристрої та події цієї оселі, а її власник побачить ваше ім’я й адресу. Приймайте лише від людей, яких знаєте. Вийти з оселі можна будь-коли: «Налаштування» → «Вийти з оселі».', 'Als u aanvaardt, ziet u de apparaten en gebeurtenissen van deze woning en ziet de eigenaar uw naam en adres. Aanvaard alleen van mensen die u kent. U kunt de woning altijd verlaten: «Instellingen» → «Woning verlaten».'],
  LID_VERLATEN: ['Ви одразу втратите доступ до пристроїв, подій і пропозицій цієї оселі. Повернутися можна лише за новим запрошенням від власника.', 'U verliest meteen de toegang tot de apparaten, gebeurtenissen en voorstellen van deze woning. Terugkomen kan alleen met een nieuwe uitnodiging van de eigenaar.'],
  EIGENAAR_KAN_NIET_VERTREKKEN: ['Власник не може вийти зі своєї оселі.', 'De eigenaar kan zijn eigen woning niet verlaten.'],
  UITNODIGING_AFWIJZEN: ['Відхилення нічого не повідомляє тому, хто запросив: для нього запрошення просто спливе.', 'Afwijzen meldt niets aan wie uitnodigde: voor die persoon verloopt de uitnodiging gewoon.'],
  UITNODIGING_MELDING_TITEL: ['Запрошення до оселі', 'Uitnodiging voor een woning'],
  UITNODIGING_AANVAARD_TITEL: ['Запрошення до оселі прийнято', 'Uitnodiging voor de woning aanvaard'],
});
