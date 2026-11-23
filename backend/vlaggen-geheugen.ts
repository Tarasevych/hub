// Спільне 15-секундне сховище рядків таблиці прапорців у пам’яті процесу (VLAG-001 / B-027).
// Відокремлене від маршрутів керування backend/vlaggen.ts, щоб модулі фонових та безсесійних перевірок
// (ai-prijzen, apparaat-bevestiging, telegram-aanmelden) читали ту саму кешовану копію без окремих SQL-запитів
// і миттєво бачили очищення пам’яті vlagGeheugenLeeg(), не порушуючи правила «прапорець ніколи не є правом».
// Gedeelde 15-seconden geheugencache voor rijen uit app.feature_flags zonder rechtstreekse SQL per hulplaag.

import { getPool } from '../server/platform/pg';

export const VLAG_GEHEUGEN_MS = 15_000;

let vlagGeheugen: { tot: number; rows: Record<string, unknown>[] } | null = null;
const geheugenLuisteraars = new Set<() => void>();

export const registreerVlagGeheugenLuisteraar = (fn: () => void): void => {
  geheugenLuisteraars.add(fn);
};

let bezigMetWissen = false;

export const wisVlagGeheugen = (): void => {
  vlagGeheugen = null;
  if (bezigMetWissen) return;
  bezigMetWissen = true;
  try {
    for (const fn of geheugenLuisteraars) {
      try {
        fn();
      } catch {
        /* безпечне сповіщення слухачів */
      }
    }
  } finally {
    bezigMetWissen = false;
  }
};

export async function alleGecacheteVlagRijen(): Promise<Record<string, unknown>[]> {
  if (vlagGeheugen && vlagGeheugen.tot > Date.now()) return vlagGeheugen.rows;
  const rows = (await getPool('systeem').query('SELECT * FROM app.feature_flags ORDER BY sleutel')).rows as Record<string, unknown>[];
  vlagGeheugen = { tot: Date.now() + VLAG_GEHEUGEN_MS, rows };
  return rows;
}

export async function leesGecacheteVlagRij(sleutel: string): Promise<Record<string, unknown> | null> {
  const alle = await alleGecacheteVlagRijen();
  return alle.find((r) => String(r.sleutel) === sleutel) ?? null;
}
