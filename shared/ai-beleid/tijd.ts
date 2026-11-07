/**
 * Час доступу: шаблони, «до години», власна тривалість і справжній зворотний відлік.
 *
 * Модуль чистий (без Node-залежностей), тож працює і на сервері, і в браузері.
 * Усі межі зберігаються як АБСОЛЮТНІ позначки часу (мс від епохи UTC): сервер
 * порівнює їх зі своїм годинником, тому «залишилось» не залежить від вкладки
 * браузера, а доступ закінчується навіть коли ніхто не дивиться на екран.
 */

export const DEFAULT_TZ = 'Europe/Brussels';

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Найкоротший і найдовший дозволений час. Довше за 5 років — це вже «завжди». */
export const MIN_DURATION_MS = MINUTE;
export const MAX_DURATION_MS = 5 * 366 * DAY;

export type After = 'off' | 'ask';

export type PresetId =
  | '30m' | '1h' | '2h' | 'half_day' | '1d' | '1w' | '1m' | '6m' | '1y' | '2y';

export interface PresetInfo {
  id: PresetId;
  /** Повна назва для списку. */
  label: string;
  /** Коротка — для кнопок-«чіпів». */
  short: string;
}

/** Порядок — так, як просив власник: 30 хв … 2 роки. */
export const PRESETS: readonly PresetInfo[] = [
  { id: '30m', label: '30 хвилин', short: '30 хв' },
  { id: '1h', label: '1 година', short: '1 год' },
  { id: '2h', label: '2 години', short: '2 год' },
  { id: 'half_day', label: 'Пів дня (12 годин)', short: 'Пів дня' },
  { id: '1d', label: 'День', short: 'День' },
  { id: '1w', label: 'Тиждень', short: 'Тиждень' },
  { id: '1m', label: 'Місяць', short: 'Місяць' },
  { id: '6m', label: 'Пів року', short: 'Пів року' },
  { id: '1y', label: 'Рік', short: 'Рік' },
  { id: '2y', label: 'Два роки', short: '2 роки' },
];

/** Що власник обрав у інтерфейсі. */
export type GrantSpec =
  | { type: 'off' }
  | { type: 'ask' }
  | { type: 'always' }
  | { type: 'preset'; preset: PresetId; after?: After }
  | { type: 'duration'; ms: number; after?: After }
  /** До конкретного моменту (абсолютна мітка). */
  | { type: 'until'; at: number; after?: After }
  /** До години доби: найближче настання HH:MM у часовому поясі власника. */
  | { type: 'until_clock'; hour: number; minute: number; after?: After };

/** Що діє насправді. `timed` несе абсолютні межі. */
export type Mode =
  | { kind: 'off' }
  | { kind: 'ask' }
  | { kind: 'always' }
  | { kind: 'timed'; startedAt: number; expiresAt: number; after: After; label: string };

export class GrantError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GrantError';
    this.code = code;
  }
}

// ───────────────────────── часові пояси ─────────────────────────

interface Parts { y: number; mo: number; d: number; h: number; mi: number; s: number }

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Календарні складові моменту `ms` у поясі `tz`. */
export function partsInZone(ms: number, tz: string = DEFAULT_TZ): Parts {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    y: out.year!, mo: out.month!, d: out.day!,
    h: out.hour! === 24 ? 0 : out.hour!, mi: out.minute!, s: out.second!,
  };
}

/** Зсув пояса від UTC у мс на момент `ms`. */
function offsetAt(ms: number, tz: string): number {
  const p = partsInZone(ms, tz);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(ms / SECOND) * SECOND;
}

/**
 * Локальний «настінний» час у поясі → мить UTC.
 * Перехід на літній час: ненаявний час зсувається вперед; неоднозначний (осінь)
 * бере РАННІШЕ настання — для доступу це безпечніша, коротша межа.
 */
export function zonedToUtc(
  y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string = DEFAULT_TZ,
): number {
  const t = Date.UTC(y, mo - 1, d, h, mi, s);
  const before = offsetAt(t - DAY, tz);
  const after = offsetAt(t + DAY, tz);
  const ca = t - before;
  const cb = t - after;
  const okA = offsetAt(ca, tz) === before;
  const okB = offsetAt(cb, tz) === after;
  if (okA && okB) return Math.min(ca, cb);
  if (okA) return ca;
  if (okB) return cb;
  return t - before; // «діра» навесні
}

function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** Додає календарні дні/місяці, зберігаючи локальний час доби. Кінець місяця «притискається». */
export function addCalendar(
  ms: number, add: { days?: number; months?: number }, tz: string = DEFAULT_TZ,
): number {
  const p = partsInZone(ms, tz);
  const sub = ((ms % SECOND) + SECOND) % SECOND;
  let y = p.y;
  let mo = p.mo;
  let d = p.d;
  if (add.months) {
    const total = y * 12 + (mo - 1) + add.months;
    y = Math.floor(total / 12);
    mo = (total % 12) + 1;
    d = Math.min(d, daysInMonth(y, mo));
  }
  if (add.days) {
    const base = new Date(Date.UTC(y, mo - 1, d + add.days));
    y = base.getUTCFullYear();
    mo = base.getUTCMonth() + 1;
    d = base.getUTCDate();
  }
  return zonedToUtc(y, mo, d, p.h, p.mi, p.s, tz) + sub;
}

// ───────────────────────── розрахунок межі ─────────────────────────

function pad(n: number): string { return String(n).padStart(2, '0'); }

/** «15.10.2026 14:30» у поясі власника. */
export function formatMoment(ms: number, tz: string = DEFAULT_TZ): string {
  const p = partsInZone(ms, tz);
  return `${pad(p.d)}.${pad(p.mo)}.${p.y} ${pad(p.h)}:${pad(p.mi)}`;
}

function sameLocalDay(a: number, b: number, tz: string): boolean {
  const pa = partsInZone(a, tz);
  const pb = partsInZone(b, tz);
  return pa.y === pb.y && pa.mo === pb.mo && pa.d === pb.d;
}

function momentLabel(ms: number, now: number, tz: string): string {
  const p = partsInZone(ms, tz);
  const hm = `${pad(p.h)}:${pad(p.mi)}`;
  if (sameLocalDay(ms, now, tz)) return `до ${hm}`;
  if (sameLocalDay(ms, addCalendar(now, { days: 1 }, tz), tz)) return `до завтра ${hm}`;
  return `до ${formatMoment(ms, tz)}`;
}

function assertAfter(a: After | undefined): After {
  const v = a ?? 'off';
  if (v !== 'off' && v !== 'ask') throw new GrantError('bad_after', 'Після закінчення можна лише вимкнути або питати щоразу.');
  return v;
}

function timed(now: number, expiresAt: number, after: After | undefined, label: string): Mode {
  if (!Number.isFinite(expiresAt)) throw new GrantError('bad_time', 'Некоректний час.');
  if (expiresAt <= now) throw new GrantError('in_past', 'Цей момент уже минув. Оберіть час у майбутньому.');
  if (expiresAt - now > MAX_DURATION_MS) {
    throw new GrantError('too_long', 'Понад 5 років — це вже «Завжди». Оберіть «Завжди» або коротший строк.');
  }
  return { kind: 'timed', startedAt: now, expiresAt, after: assertAfter(after), label };
}

export function presetInfo(id: PresetId): PresetInfo {
  const info = PRESETS.find((p) => p.id === id);
  if (!info) throw new GrantError('bad_preset', `Невідомий шаблон «${String(id)}».`);
  return info;
}

/** Перетворює вибір власника на дію з абсолютними межами. `now` — годинник СЕРВЕРА. */
export function resolveGrant(spec: GrantSpec, now: number, tz: string = DEFAULT_TZ): Mode {
  if (!Number.isFinite(now)) throw new GrantError('bad_time', 'Некоректний поточний час.');
  switch (spec.type) {
    case 'off': return { kind: 'off' };
    case 'ask': return { kind: 'ask' };
    case 'always': return { kind: 'always' };
    case 'preset': {
      const info = presetInfo(spec.preset);
      let end: number;
      switch (spec.preset) {
        case '30m': end = now + 30 * MINUTE; break;
        case '1h': end = now + HOUR; break;
        case '2h': end = now + 2 * HOUR; break;
        case 'half_day': end = now + 12 * HOUR; break;
        case '1d': end = addCalendar(now, { days: 1 }, tz); break;
        case '1w': end = addCalendar(now, { days: 7 }, tz); break;
        case '1m': end = addCalendar(now, { months: 1 }, tz); break;
        case '6m': end = addCalendar(now, { months: 6 }, tz); break;
        case '1y': end = addCalendar(now, { months: 12 }, tz); break;
        case '2y': end = addCalendar(now, { months: 24 }, tz); break;
      }
      return timed(now, end, spec.after, info.short === info.label ? info.label : info.short);
    }
    case 'duration': {
      if (!Number.isFinite(spec.ms) || spec.ms < MIN_DURATION_MS) {
        throw new GrantError('too_short', 'Мінімальний час — 1 хвилина.');
      }
      const ms = Math.round(spec.ms / SECOND) * SECOND;
      return timed(now, now + ms, spec.after, `на ${formatDuration(ms)}`);
    }
    case 'until': {
      return timed(now, spec.at, spec.after, momentLabel(spec.at, now, tz));
    }
    case 'until_clock': {
      const { hour, minute } = spec;
      if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
        throw new GrantError('bad_clock', 'Вкажіть годину 0–23 і хвилини 0–59.');
      }
      const p = partsInZone(now, tz);
      let end = zonedToUtc(p.y, p.mo, p.d, hour, minute, 0, tz);
      if (end <= now) end = addCalendar(zonedToUtc(p.y, p.mo, p.d, hour, minute, 0, tz), { days: 1 }, tz);
      return timed(now, end, spec.after, momentLabel(end, now, tz));
    }
    default: {
      const never: never = spec;
      throw new GrantError('bad_spec', `Невідомий вибір: ${JSON.stringify(never)}`);
    }
  }
}

// ───────────────────────── відлік ─────────────────────────

export interface Countdown {
  /** Скільки встановлено (мс). */
  total: number;
  /** Скільки вже минуло. */
  elapsed: number;
  /** Скільки залишилось (0, якщо вичерпано). */
  remaining: number;
  /** Частка, що вже минула, 0…1 — для смужки прогресу. */
  fraction: number;
  expired: boolean;
}

export function countdown(mode: Mode, now: number): Countdown | null {
  if (mode.kind !== 'timed') return null;
  const total = mode.expiresAt - mode.startedAt;
  const elapsed = Math.min(Math.max(now - mode.startedAt, 0), total);
  const remaining = Math.max(mode.expiresAt - now, 0);
  return {
    total,
    elapsed,
    remaining,
    fraction: total > 0 ? elapsed / total : 1,
    expired: now >= mode.expiresAt,
  };
}

/** Режим, що ДІЄ зараз (після спливу строку — `after`). */
export function effectiveMode(mode: Mode, now: number): Exclude<Mode, { kind: 'timed' }> {
  if (mode.kind !== 'timed') return mode;
  if (now < mode.expiresAt) return { kind: 'always' };
  return { kind: mode.after };
}

// ───────────────────────── українське форматування ─────────────────────────

/** Українська множина: 1 день, 2 дні, 5 днів. */
export function pluralUk(n: number, forms: readonly [string, string, string]): string {
  const a = Math.abs(Math.trunc(n));
  const m10 = a % 10;
  const m100 = a % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

interface Unit { ms: number; short: string; long: readonly [string, string, string] }
const UNITS: readonly Unit[] = [
  { ms: DAY, short: 'дн', long: ['день', 'дні', 'днів'] },
  { ms: HOUR, short: 'год', long: ['година', 'години', 'годин'] },
  { ms: MINUTE, short: 'хв', long: ['хвилина', 'хвилини', 'хвилин'] },
  { ms: SECOND, short: 'с', long: ['секунда', 'секунди', 'секунд'] },
];

function breakDown(ms: number, maxUnits: number): Array<{ n: number; unit: Unit }> {
  let rest = Math.max(0, Math.floor(ms / SECOND) * SECOND);
  const parts: Array<{ n: number; unit: Unit }> = [];
  for (const unit of UNITS) {
    const n = Math.floor(rest / unit.ms);
    rest -= n * unit.ms;
    if (n > 0) parts.push({ n, unit });
  }
  if (parts.length === 0) return [{ n: 0, unit: UNITS[3]! }];
  return parts.slice(0, maxUnits);
}

/** «2 год 15 хв». */
export function formatDuration(ms: number, maxUnits = 2): string {
  return breakDown(ms, maxUnits).map(({ n, unit }) => `${n} ${unit.short}`).join(' ');
}

/** «2 години 15 хвилин». */
export function formatDurationLong(ms: number, maxUnits = 2): string {
  return breakDown(ms, maxUnits).map(({ n, unit }) => `${n} ${pluralUk(n, unit.long)}`).join(' ');
}

/** Для лічильника на екрані: «01:59:07» або «3 дн 04:12:00». */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SECOND));
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  const hms = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return d > 0 ? `${d} дн ${hms}` : hms;
}

/** Людський опис режиму для списків і журналу. */
export function describeMode(mode: Mode, now: number, tz: string = DEFAULT_TZ): string {
  switch (mode.kind) {
    case 'off': return 'Вимкнено';
    case 'ask': return 'Питати щоразу';
    case 'always': return 'Завжди';
    case 'timed': {
      const c = countdown(mode, now)!;
      const after = mode.after === 'ask' ? 'потім питати щоразу' : 'потім вимкнеться';
      if (c.expired) {
        return `Строк вичерпано ${formatMoment(mode.expiresAt, tz)} → ${mode.after === 'ask' ? 'питати щоразу' : 'вимкнено'}`;
      }
      return `${mode.label} · залишилось ${formatDuration(c.remaining)} (до ${formatMoment(mode.expiresAt, tz)}, ${after})`;
    }
  }
}
