// Пам’ять цієї вкладки: які фото сервер уже віддав (не localStorage — це картинки).
import { useSyncExternalStore } from 'react';
import { kiesBeeld, voegBeeldStap, type BeeldStap } from '../../shared/beeld-geschiedenis';

const LEEG: readonly BeeldStap[] = [];
const per = new Map<string, BeeldStap[]>();
const keuze = new Map<string, string>();
const luister = new Set<() => void>();
const meld = () => { for (const l of luister) l(); };
const abonneer = (l: () => void) => { luister.add(l); return () => { luister.delete(l); }; };
const sleutel = (adres: string) => String(adres || '').trim().toLowerCase();

export function noteerBeeld(adres: string, bron: string, data: string): void {
  const a = sleutel(adres);
  if (!a) return;
  const next = voegBeeldStap(per.get(a), { bron, data });
  const oud = per.get(a);
  if (oud && oud.length === next.length && oud[0]?.bron === next[0]?.bron && oud[0]?.data === next[0]?.data) return;
  per.set(a, next);
  meld();
}

export function kiesBeeldBron(adres: string, bron: string): void {
  const a = sleutel(adres);
  if (!a || !per.get(a)?.some((s) => s.bron === bron)) return;
  keuze.set(a, bron);
  meld();
}

export function stappenVan(adres: string): readonly BeeldStap[] {
  return per.get(sleutel(adres)) || LEEG;
}

export function gebruikBeeldStappen(adres: string): readonly BeeldStap[] {
  return useSyncExternalStore(abonneer, () => stappenVan(adres), () => LEEG);
}

export function gebruikGekozenBeeld(adres: string): BeeldStap | null {
  const stappen = gebruikBeeldStappen(adres);
  const bron = useSyncExternalStore(abonneer, () => keuze.get(sleutel(adres)) || '', () => '');
  return kiesBeeld(stappen, bron);
}

export function wisBeeldGeschiedenis(): void {
  if (!per.size && !keuze.size) return;
  per.clear();
  keuze.clear();
  meld();
}
