// UPD-010: розумна кумулятивна черга оновлень та гнучкі права агентів.
// Чистий спільний модуль для сервера і клієнта (без доступу до БД чи DOM).

export type ToegangNiveau = 'uploaden' | 'installeren';
export type LimietModus = 'periode' | 'eenmalig' | 'aantal' | 'bevestiging_per_keer';

export type GrantRechten = {
  toegangNiveau: ToegangNiveau;
  limietModus: LimietModus;
  maxAantal: number | null;
  gebruiktAantal: number;
  bevestigingPerKeer: boolean;
};

export const TOEGANG_NIVEAUS: readonly ToegangNiveau[] = ['uploaden', 'installeren'];
export const LIMIET_MODI: readonly LimietModus[] = ['periode', 'eenmalig', 'aantal', 'bevestiging_per_keer'];

export const STANDAARD_GRANT_RECHTEN: GrantRechten = Object.freeze({
  toegangNiveau: 'uploaden',
  limietModus: 'periode',
  maxAantal: null,
  gebruiktAantal: 0,
  bevestigingPerKeer: false,
});

export function normaliseerGrantRechten(invoer: {
  toegangNiveau?: unknown;
  limietModus?: unknown;
  maxAantal?: unknown;
  gebruiktAantal?: unknown;
  bevestigingPerKeer?: unknown;
}): { ok: true; waarde: GrantRechten } | { ok: false; code: string } {
  const niveauRaw = invoer.toegangNiveau === undefined ? 'uploaden' : String(invoer.toegangNiveau);
  if (!TOEGANG_NIVEAUS.includes(niveauRaw as ToegangNiveau)) {
    return { ok: false, code: 'TOEGANG_NIVEAU_ONGELDIG' };
  }
  const toegangNiveau = niveauRaw as ToegangNiveau;

  const modusRaw = invoer.limietModus === undefined ? 'periode' : String(invoer.limietModus);
  if (!LIMIET_MODI.includes(modusRaw as LimietModus)) {
    return { ok: false, code: 'LIMIET_MODUS_ONGELDIG' };
  }
  const limietModus = modusRaw as LimietModus;

  const gebruiktRaw = invoer.gebruiktAantal === undefined ? 0 : Number(invoer.gebruiktAantal);
  const gebruiktAantal = Number.isInteger(gebruiktRaw) && gebruiktRaw >= 0 ? gebruiktRaw : 0;

  let maxAantal: number | null = null;
  if (limietModus === 'eenmalig') {
    maxAantal = 1;
  } else if (limietModus === 'aantal') {
    const n = Number(invoer.maxAantal);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      return { ok: false, code: 'MAX_AANTAL_ONGELDIG' };
    }
    maxAantal = n;
  } else if (invoer.maxAantal !== undefined && invoer.maxAantal !== null && invoer.maxAantal !== '') {
    const n = Number(invoer.maxAantal);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      return { ok: false, code: 'MAX_AANTAL_ONGELDIG' };
    }
    maxAantal = n;
  }

  const bevestigingPerKeer =
    limietModus === 'bevestiging_per_keer'
      ? true
      : invoer.bevestigingPerKeer === true;

  return {
    ok: true,
    waarde: {
      toegangNiveau,
      limietModus,
      maxAantal,
      gebruiktAantal,
      bevestigingPerKeer,
    },
  };
}

export function isGrantUitgeput(g: {
  limietModus?: LimietModus;
  maxAantal?: number | null;
  gebruiktAantal?: number;
}): boolean {
  const max = g.limietModus === 'eenmalig' ? 1 : (g.maxAantal ?? null);
  if (max === null) return false;
  return (g.gebruiktAantal ?? 0) >= max;
}

export function resterendAantal(g: {
  limietModus?: LimietModus;
  maxAantal?: number | null;
  gebruiktAantal?: number;
}): number | null {
  const max = g.limietModus === 'eenmalig' ? 1 : (g.maxAantal ?? null);
  if (max === null) return null;
  return Math.max(0, max - (g.gebruiktAantal ?? 0));
}

export function rechtenSamenvatting(
  lang: 'uk' | 'nl',
  g: {
    toegangNiveau?: ToegangNiveau;
    limietModus?: LimietModus;
    maxAantal?: number | null;
    gebruiktAantal?: number;
    bevestigingPerKeer?: boolean;
  },
): { niveau: string; beperking: string } {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const niveau =
    g.toegangNiveau === 'installeren'
      ? t('Завантаження + встановлення', 'Uploaden + installeren')
      : t('Лише завантаження в чергу', 'Alleen uploaden naar wachtrij');

  const modus = g.limietModus || 'periode';
  const gebruikt = g.gebruiktAantal ?? 0;
  const max = modus === 'eenmalig' ? 1 : (g.maxAantal ?? null);

  let beperking = t('За терміном дії', 'Voor gekozen periode');
  if (modus === 'eenmalig') {
    beperking = gebruikt >= 1
      ? t('Одноразово (використано)', 'Eenmalig (verbruikt)')
      : t('Один раз (0/1)', 'Eenmalig (0/1)');
  } else if (modus === 'aantal' && max !== null) {
    beperking = t(
      `Ліміт: ${gebruikt} з ${max}`,
      `Limiet: ${gebruikt} van ${max}`,
    );
  } else if (modus === 'bevestiging_per_keer' || g.bevestigingPerKeer) {
    beperking = t('Підтвердження щоразу', 'Bevestiging per keer');
  }
  return { niveau, beperking };
}

export type WachtrijVoorstelBasis = {
  id: string;
  versie: string;
  status: string;
  aangemaaktOp?: string;
  voorbereider?: string;
};

export type CumulatiefWachtrijItem<T extends WachtrijVoorstelBasis> = {
  voorstel: T;
  /** Номер у черзі від найновішого (1) до найстарішого (N). */
  rang: number;
  /** Чи це найновіша версія в черзі, яка покриває всі попередні. */
  isLaatste: boolean;
  /** Старіші версії в черзі, які будуть включені та закриті як поглинуті після встановлення цієї версії. */
  omvatVersies: string[];
  /** Ідентифікатори старіших очікуючих пропозицій у черзі. */
  omvatIds: string[];
};

/**
 * Будує впорядковану кумулятивну чергу очікуючих оновлень (від найновішого до найстарішого).
 * Кожне наступне оновлення включає всі попередні очікуючі оновлення з меншим номером версії.
 */
export function bouwCumulatieveWachtrij<T extends WachtrijVoorstelBasis>(
  voorstellen: T[],
  verbergId = '',
): CumulatiefWachtrijItem<T>[] {
  const wachtend = voorstellen
    .filter((v) => v.status === 'wacht-op-goedkeuring' && v.id !== verbergId)
    .slice()
    .sort((a, b) => b.versie.localeCompare(a.versie));

  return wachtend.map((v, index) => {
    const oudere = wachtend.filter((x) => x.id !== v.id && x.versie.localeCompare(v.versie) < 0);
    return {
      voorstel: v,
      rang: index + 1,
      isLaatste: index === 0,
      omvatVersies: oudere.map((x) => x.versie),
      omvatIds: oudere.map((x) => x.id),
    };
  });
}

/**
 * Визначає очікуючі пропозиції, які автоматично поглинаються після успішного встановлення обраної версії.
 */
export function bepaalIngehaaldeVoorstellen<T extends WachtrijVoorstelBasis>(
  voorstellen: T[],
  geinstalleerdeVersie: string,
): T[] {
  if (!geinstalleerdeVersie) return [];
  return voorstellen
    .filter((v) => v.status === 'wacht-op-goedkeuring' && v.versie.localeCompare(geinstalleerdeVersie) < 0)
    .sort((a, b) => a.versie.localeCompare(b.versie));
}
