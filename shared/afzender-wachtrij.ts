// Черга перевірки відправників (блок 5, 3.1). Чисті функції: без бази й без Gmail, тож прогін можна
// продовжити з курсора, а тихі збої листів не зникають, коли кнопкою «Повторити підозрілі» йдуть іншою партією.
// DNS іде за алфавітом і курсором: межа 2000 не викидає «решту» без порядку.

export type WachtrijSoort = 'onbekend' | 'rest' | 'verdacht';
export type WachtrijStaat = 'wacht' | 'bezig' | 'gepauzeerd' | 'gestopt' | 'klaar' | 'fout';
export type Wachtrij = {
  soort: WachtrijSoort;
  staat: WachtrijStaat;
  cursor: string;
  dnsCursor: string;
  verwerkt: number;
  gewijzigd: number;
  /** Ідентифікатори листів, які не вдалося прочитати. Ніколи не викидаються мовчки. */
  stil: string[];
  poging: number;
};

export const DNS_GRENS = 2000;
const STIL_MAX = 500;

export function legeWachtrij(soort: WachtrijSoort): Wachtrij {
  return { soort, staat: 'wacht', cursor: '', dnsCursor: '', verwerkt: 0, gewijzigd: 0, stil: [], poging: 0 };
}

/** «bezig» лишається як є. Пауза й помилка тримають курсор. «klaar» / «gestopt» / перший старт починають адреси спочатку, але тихі збої лишаються. */
export function startOfHervat(oud: Wachtrij | null | undefined, soort: WachtrijSoort): Wachtrij {
  const basis: Wachtrij = oud && oud.soort === soort
    ? { ...legeWachtrij(soort), ...oud, stil: [...(oud.stil || [])].slice(0, STIL_MAX) }
    : legeWachtrij(soort);
  if (basis.staat === 'bezig') return basis;
  const houden = basis.staat === 'gepauzeerd' || basis.staat === 'fout';
  return {
    ...basis,
    staat: 'bezig',
    cursor: houden ? basis.cursor : '',
    dnsCursor: houden ? basis.dnsCursor : '',
    verwerkt: houden ? basis.verwerkt : 0,
    gewijzigd: houden ? basis.gewijzigd : 0,
    stil: basis.stil,
    poging: basis.poging + 1,
  };
}

export function pauzeWachtrij(w: Wachtrij): Wachtrij {
  return { ...w, staat: 'gepauzeerd' };
}

export function voegStil(stil: readonly string[] | null | undefined, ids: readonly string[]): string[] {
  const uit = [...(stil || [])].slice(0, STIL_MAX);
  for (const ruw of ids) {
    const id = String(ruw || '').slice(0, 300);
    if (id && !uit.includes(id) && uit.length < STIL_MAX) uit.push(id);
  }
  return uit;
}

/** Сторінка далі, але лист, який не прочитався, лишається в `stil`. Успіх прибирає його звідти. */
export function verwerkPagina(w: Wachtrij, uit: readonly { id: string; ok: boolean }[], volgendeCursor: string): Wachtrij {
  const gelukt = new Set(uit.filter((u) => u.ok && u.id).map((u) => u.id));
  const stil = voegStil(w.stil, uit.filter((u) => !u.ok).map((u) => u.id)).filter((id) => !gelukt.has(id));
  return { ...w, cursor: volgendeCursor || w.cursor, verwerkt: w.verwerkt + uit.length, stil, staat: 'bezig' };
}

/**
 * «Повторити підозрілі». Успіх прибирає лише той id. Невдача лишає його.
 * Тихий збій, якого в цій партії немає, НЕ зникає.
 */
export function herhaalVerdacht(stil: readonly string[], pogingen: readonly { id: string; ok: boolean }[]): string[] {
  const gelukt = new Set(pogingen.filter((p) => p.ok && p.id).map((p) => p.id));
  const nog = stil.filter((id) => !gelukt.has(id));
  for (const p of pogingen) {
    const id = String(p.id || '').slice(0, 300);
    if (!p.ok && id && !nog.includes(id) && nog.length < STIL_MAX) nog.push(id);
  }
  return nog;
}

/** Наступна пачка доменів за алфавітом, після курсора. Решта не губиться: її курсор повертається. */
export function dnsVolgende(domeinen: readonly string[], cursor = '', grens = DNS_GRENS): { deel: string[]; cursor: string; meer: boolean } {
  const uniek = [...new Set(domeinen.map((d) => String(d || '').trim().toLowerCase()).filter(Boolean))].sort();
  const na = uniek.filter((d) => d > cursor);
  const deel = na.slice(0, Math.max(0, grens));
  return { deel, cursor: deel.length ? deel[deel.length - 1] : cursor, meer: na.length > deel.length };
}
