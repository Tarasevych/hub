// Metadata van een sleutel in de kluis (api.* → Сховище секретів, admin.* → Ключі): wanneer hij begint en eindigt, aan wie hij
// toebehoort (dienst, AI, apparaat of persoon) en wie verantwoordelijk is. Nooit de waarde zelf: die blijft versleuteld.
// Datums zijn kalenderdagen (JJJJ-MM-DD, inclusief) in de tijdzone van de eigenaar, zoals op een sleutelbrief van GitHub of Google.
// Gedeeld door backend (normaliseren, meldingen) en frontend (weergave, formulier).

export const VAULT_SOORTEN = ['service', 'ai', 'device', 'person'] as const;
export type VaultSoort = typeof VAULT_SOORTEN[number];
export type VaultMeta = {
  /** Eerste geldige dag (JJJJ-MM-DD) of '' (onbekend). */
  geldigVan: string;
  /** Laatste geldige dag (JJJJ-MM-DD, inclusief) of '' (zonder einddatum). */
  geldigTot: string;
  /** Aan wat hoort de sleutel: een dienst (Home Assistant), een AI (Claude), een apparaat (ПК) of een persoon. */
  soort: VaultSoort | '';
  /** Naam van die dienst/AI/apparaat/persoon. */
  van: string;
  /** Wie verantwoordelijk is (vernieuwen, intrekken). */
  verantwoordelijke: string;
  /** Korte notitie (bijv. «scope: repo, read:org»). Nooit de waarde. */
  notitie: string;
};
export type VaultStaat = 'zonder-termijn' | 'nog-niet' | 'actief' | 'bijna' | 'verlopen';

export const VAULT_TZ = 'Europe/Brussels';
/** Vanaf zoveel dagen voor het einde: «скоро закінчиться». */
export const BIJNA_DAGEN = 14;
const DAG = /^(\d{4})-(\d{2})-(\d{2})$/;
const STUURTEKENS = /[\u0000-\u001f\u007f\u2028\u2029]/g;

export const leegMeta = (): VaultMeta => ({ geldigVan: '', geldigTot: '', soort: '', van: '', verantwoordelijke: '', notitie: '' });

/** Vandaag (JJJJ-MM-DD) in de tijdzone van de eigenaar. */
export function vandaag(nu = Date.now(), tz = VAULT_TZ): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(nu));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}
const geldigeDag = (s: string) => {
  const m = DAG.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 2000 && +m[1] <= 2200;
};
/** Aantal kalenderdagen van a tot b (b − a). */
export const dagenTussen = (a: string, b: string) => {
  const [x, y] = [a, b].map((s) => { const m = DAG.exec(s)!; return Date.UTC(+m[1], +m[2] - 1, +m[3]); });
  return Math.round((y - x) / 86_400_000);
};
const tekst = (v: unknown, max: number) => String(v ?? '').replace(STUURTEKENS, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Normaliseert wat de browser stuurt. `basis` = de huidige metadata (bij bijwerken blijft wat niet is meegestuurd).
 * Geeft { meta } of { fout } (foutcode voor de API).
 */
export function normaliseerVaultMeta(raw: unknown, basis: VaultMeta = leegMeta()): { meta: VaultMeta } | { fout: string } {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const neem = <K extends keyof VaultMeta>(k: K) => (Object.prototype.hasOwnProperty.call(r, k) ? r[k] : basis[k]);
  const geldigVan = tekst(neem('geldigVan'), 10);
  const geldigTot = tekst(neem('geldigTot'), 10);
  if (geldigVan && !geldigeDag(geldigVan)) return { fout: 'OWNER_VAULT_META_DATE_INVALID' };
  if (geldigTot && !geldigeDag(geldigTot)) return { fout: 'OWNER_VAULT_META_DATE_INVALID' };
  if (geldigVan && geldigTot && geldigTot < geldigVan) return { fout: 'OWNER_VAULT_META_RANGE_INVALID' };
  const soortRaw = tekst(neem('soort'), 16);
  if (soortRaw && !(VAULT_SOORTEN as readonly string[]).includes(soortRaw)) return { fout: 'OWNER_VAULT_META_KIND_INVALID' };
  return { meta: { geldigVan, geldigTot, soort: soortRaw as VaultSoort | '', van: tekst(neem('van'), 80), verantwoordelijke: tekst(neem('verantwoordelijke'), 120), notitie: tekst(neem('notitie'), 240) } };
}

/** Uit een opgeslagen record (ook oude records zonder metadata). */
export function metaUitRecord(v: unknown): VaultMeta {
  const r = normaliseerVaultMeta(v);
  return 'meta' in r ? r.meta : leegMeta();
}

export function vaultStaat(meta: VaultMeta, nu = Date.now(), tz = VAULT_TZ): { staat: VaultStaat; dagenOver: number | null } {
  const dag = vandaag(nu, tz);
  if (meta.geldigVan && dag < meta.geldigVan) return { staat: 'nog-niet', dagenOver: meta.geldigTot ? dagenTussen(dag, meta.geldigTot) : null };
  if (!meta.geldigTot) return { staat: 'zonder-termijn', dagenOver: null };
  const over = dagenTussen(dag, meta.geldigTot); // 0 = vandaag de laatste dag
  if (over < 0) return { staat: 'verlopen', dagenOver: over };
  return { staat: over <= BIJNA_DAGEN ? 'bijna' : 'actief', dagenOver: over };
}

const SOORT_TEKST: Record<VaultSoort, [string, string]> = { service: ['Сервіс', 'Dienst'], ai: ['ШІ', 'AI'], device: ['Пристрій', 'Apparaat'], person: ['Людина', 'Persoon'] };
export const soortTekst = (s: VaultSoort | '', lang: 'uk' | 'nl') => (s ? SOORT_TEKST[s][lang === 'uk' ? 0 : 1] : '');

/** «залишилось 3 дні» / «nog 3 dagen» (Oekraïense meervoudsvormen). */
export function dagenTekst(n: number, lang: 'uk' | 'nl'): string {
  const a = Math.abs(n);
  if (lang === 'nl') return `${a} ${a === 1 ? 'dag' : 'dagen'}`;
  const m10 = a % 10, m100 = a % 100;
  const vorm = m10 === 1 && m100 !== 11 ? 'день' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'дні' : 'днів';
  return `${a} ${vorm}`;
}

/** Korte statusregel voor een kaart of melding. */
export function staatTekst(meta: VaultMeta, lang: 'uk' | 'nl', nu = Date.now(), tz = VAULT_TZ): string {
  const { staat, dagenOver } = vaultStaat(meta, nu, tz);
  const uk = lang === 'uk';
  switch (staat) {
    case 'zonder-termijn': return uk ? 'Без строку дії' : 'Zonder einddatum';
    case 'nog-niet': return uk ? `Почне діяти ${meta.geldigVan}` : `Geldig vanaf ${meta.geldigVan}`;
    case 'verlopen': return uk ? `Строк вийшов ${meta.geldigTot} (${dagenTekst(dagenOver!, lang)} тому)` : `Verlopen op ${meta.geldigTot} (${dagenTekst(dagenOver!, lang)} geleden)`;
    case 'bijna': return dagenOver === 0 ? (uk ? 'Сьогодні останній день' : 'Vandaag de laatste dag') : (uk ? `Скоро закінчиться: залишилось ${dagenTekst(dagenOver!, lang)}` : `Loopt bijna af: nog ${dagenTekst(dagenOver!, lang)}`);
    default: return uk ? `Діє до ${meta.geldigTot} · залишилось ${dagenTekst(dagenOver!, lang)}` : `Geldig tot ${meta.geldigTot} · nog ${dagenTekst(dagenOver!, lang)}`;
  }
}
