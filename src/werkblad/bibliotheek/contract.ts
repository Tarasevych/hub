// Contract bibliotheek → canvas (Werkblad v3). Het canvas (werker C) luistert hiernaar; de bibliotheek kent het canvas niet.
//
// 1) Slepen (HTML5 drag & drop):  dataTransfer type `application/x-werkblad-bibliotheek` met JSON `BibliotheekVerzoek`
//    (zonder `point`; het canvas vult het punt zelf in uit het drop-event). Daarnaast `text/plain` = itemId (alleen informatief).
// 2) Knop/toetsenbord («Додати як ярлик» / «Додати як віджет»): CustomEvent `werkblad-bibliotheek:toevoegen` op `window`,
//    detail = `BibliotheekVerzoek`. `point` (logische canvas-px) alleen als de mens «Розмістити тут…» koos; anders kiest het canvas.
// 3) Het canvas valideert ALTIJD opnieuw tegen het register (registerItem + toegestaanVoor): de payload is geen bewijs van recht.
import type { ItemSoort } from '../../../shared/werkblad-v3-types';

export const BIBLIOTHEEK_EVENT = 'werkblad-bibliotheek:toevoegen' as const;
export const BIBLIOTHEEK_MIME = 'application/x-werkblad-bibliotheek' as const;

export type BibliotheekVerzoek = {
  itemId: string;
  kind: ItemSoort;
  point?: { x: number; y: number };
  /** Optioneel: eigen naam/icoon (uit «перейменувати / змінити значок» in de bibliotheek). Altijd opnieuw gesaneerd door het canvas. */
  titleOverride?: string;
  iconOverride?: string;
};

const ID = /^(svc:[a-z]{2,12}|pg:[a-z]{2,12}\/[a-z-]{2,24}|cmd:[a-z-]{2,40}|wdg:[a-z-]{2,40}|usr:[a-z0-9-]{1,40}|map:[a-z0-9-]{1,40})$/;
const KINDS: readonly ItemSoort[] = ['shortcut', 'folder', 'widget'];

/** Strikte lezer (canvas-kant en tests): onbekende vorm → undefined. */
export function leesVerzoek(raw: unknown): BibliotheekVerzoek | undefined {
  let v = raw;
  if (typeof v === 'string') { if (v.length > 2000) return undefined; try { v = JSON.parse(v); } catch { return undefined; } }
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.itemId !== 'string' || !ID.test(o.itemId) || !KINDS.includes(o.kind as ItemSoort)) return undefined;
  const uit: BibliotheekVerzoek = { itemId: o.itemId, kind: o.kind as ItemSoort };
  const p = o.point as { x?: unknown; y?: unknown } | undefined;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) uit.point = { x: Math.round(Number(p.x)), y: Math.round(Number(p.y)) };
  if (typeof o.titleOverride === 'string') uit.titleOverride = o.titleOverride.replace(/[\u0000-\u001f<>]/g, '').slice(0, 60);
  if (typeof o.iconOverride === 'string' && /^[a-z0-9-]{1,24}$/.test(o.iconOverride)) uit.iconOverride = o.iconOverride;
  return uit;
}

export function zetSleepData(dt: DataTransfer, v: BibliotheekVerzoek) {
  dt.setData(BIBLIOTHEEK_MIME, JSON.stringify(v));
  dt.setData('text/plain', v.itemId);
  dt.effectAllowed = 'copy';
}

export function leesSleepData(dt: DataTransfer | null): BibliotheekVerzoek | undefined {
  return dt ? leesVerzoek(dt.getData(BIBLIOTHEEK_MIME)) : undefined;
}

export function stuurToevoegen(v: BibliotheekVerzoek, doel: EventTarget = window) {
  doel.dispatchEvent(new CustomEvent<BibliotheekVerzoek>(BIBLIOTHEEK_EVENT, { detail: v }));
}
