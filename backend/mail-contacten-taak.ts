// Черга перевірки адрес (блок 5). Рядок у app.records, без нової SQL-таблиці.
import { getPool } from '../server/platform/pg';
import { startOfHervat, voegStil } from '../shared/afzender-wachtrij';

export type TaakSoort = 'onbekend' | 'rest' | 'verdacht';
export type TaakStaat = 'wacht' | 'bezig' | 'gepauzeerd' | 'gestopt' | 'klaar' | 'fout';
export type TaakRij = {
  userId: string; soort: TaakSoort; staat: TaakStaat; cursor: string; dnsCursor: string;
  totaal: number; verwerkt: number; gewijzigd: number; fout: string; poging: number; wachtTot: number; updatedAt: number;
  /** Листи, які не вдалося прочитати. «Повторити підозрілі» не викидає їх, якщо цієї партії їх немає. */
  stil: string[];
};

const TBL = 'mail_contacten_taak_v1';
const idVan = (userId: string, soort: TaakSoort) => `taak:${soort}:${userId}`;

export function taakSoort(v: unknown): TaakSoort | null {
  return v === 'onbekend' || v === 'rest' || v === 'verdacht' ? v : null;
}

const leeg = (userId: string, soort: TaakSoort): TaakRij => ({ userId, soort, staat: 'wacht', cursor: '', dnsCursor: '', totaal: 0, verwerkt: 0, gewijzigd: 0, fout: '', poging: 0, wachtTot: 0, updatedAt: 0, stil: [] });

export async function taakLezen(userId: string, soort: TaakSoort): Promise<TaakRij> {
  const r = await getPool().query('SELECT data FROM app.records WHERE tbl = $1 AND id = $2', [TBL, idVan(userId, soort)]);
  const d = r.rows[0]?.data as Partial<TaakRij> | undefined;
  const rij = d && d.soort === soort ? { ...leeg(userId, soort), ...d, stil: Array.isArray(d.stil) ? d.stil.map(String) : [] } : leeg(userId, soort);
  return rij;
}

async function schrijf(rij: TaakRij) {
  const data = { ...rij, stil: (rij.stil || []).slice(0, 500), updatedAt: Date.now() };
  await getPool().query(
    `INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (tbl, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [TBL, idVan(rij.userId, rij.soort), JSON.stringify(data)],
  );
  return data;
}

/** Уже «bezig» не скидає курсор. Пауза й помилка тримають курсор. «klaar» / «gestopt» починають адреси спочатку, тихі збої лишаються. */
export async function taakStart(userId: string, soort: TaakSoort): Promise<TaakRij> {
  const rij = await taakLezen(userId, soort);
  if (rij.staat === 'bezig') return rij;
  const volgend = startOfHervat(rij, soort);
  return schrijf({ ...rij, ...volgend, userId, soort, fout: '' });
}

export async function taakPauze(userId: string, soort: TaakSoort): Promise<TaakRij> {
  const rij = await taakLezen(userId, soort);
  return schrijf({ ...rij, staat: 'gepauzeerd' });
}

export async function taakStop(userId: string, soort: TaakSoort): Promise<TaakRij> {
  const rij = await taakLezen(userId, soort);
  return schrijf({ ...rij, staat: 'gestopt' });
}

export async function taakBijwerken(userId: string, soort: TaakSoort, patch: Partial<Pick<TaakRij, 'cursor' | 'dnsCursor' | 'verwerkt' | 'gewijzigd' | 'staat' | 'fout' | 'stil'>>): Promise<TaakRij> {
  const rij = await taakLezen(userId, soort);
  return schrijf({ ...rij, ...patch });
}

/** Тихі збої читання листів (не 404 і не жорстка помилка Gmail) лишаються на завданні «verdacht». */
export async function taakStilBij(userId: string, ids: readonly string[]): Promise<TaakRij> {
  const rij = await taakLezen(userId, 'verdacht');
  return schrijf({ ...rij, stil: voegStil(rij.stil, ids) });
}