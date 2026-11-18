// ЗНАК МІСЦЯ В РЕЄСТРІ ЛОГОТИПІВ (PLAATS-TEKENS-001, 17.11.2026). <Merk merk="stad-be-gent" vorm="rond" maat={22}/> потрапляє сюди.
//   land-xx   прапор країни 1x1 з country-flag-icons (MIT): кожен прапор — окремий маленький файл, вантажиться лише коли потрібен;
//   regio-…   герб/прапор провінції чи області, stad-… герб міста: файл public/merk/plaats/<sleutel>.webp (оригінал із Вікісховища,
//             зменшений), як <img> — у бандл не потрапляє.
// Немає файла (404) або прапора — показується наступний знак ланцюжка (`keten`) або монограма. Нічого не малюється заново.
// PLAATSTEKEN: vlag (country-flag-icons) of wapen (public/merk/plaats) als <img>; ontbreekt het, dan het volgende teken van de keten.
import { useEffect, useState } from 'react';
import { landCode } from '../../shared/plaats-teken';
import { PLAATS_DONKER } from './plaats/plaats-gegenereerd';
import { merkTint, monogram } from './merk-register';

// Vite zet import.meta.glob om in een tabel met luie imports (één bundelstuk per vlag). Buiten Vite (tests via esbuild) bestaat
// import.meta.glob niet: dan geen vlaggen (leeg vlak), geen fout.
let VLAGGEN: Record<string, () => Promise<string>> = {};
try { VLAGGEN = import.meta.glob<string>('/node_modules/country-flag-icons/string/1x1/[A-Z]*.js', { import: 'default' }); } catch { VLAGGEN = {}; }
const vlagCache = new Map<string, string>();

export function plaatsBeeldUrl(sleutel: string): string {
  return `/merk/plaats/${sleutel}.webp`;
}

/** Laadt het vlagbestand van een land (data-URI) — alleen dat ene bestand. */
export async function laadVlag(land: string): Promise<string> {
  const c = landCode(land);
  if (!c) return '';
  if (vlagCache.has(c)) return vlagCache.get(c)!;
  const laad = VLAGGEN[`/node_modules/country-flag-icons/string/1x1/${c}.js`];
  if (!laad) return '';
  const svg = await laad();
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  vlagCache.set(c, uri);
  return uri;
}

export type MerkPlaatsProps = {
  /** Eén sleutel of een keten (fijn → grof); het eerste teken dat bestaat wordt getoond. */
  keten: string[];
  maat?: number;
  vorm?: 'tegel' | 'rond' | 'gliefje';
  titel?: string;
  /** Naam voor het monogram als geen enkel teken bestaat. */
  naam?: string;
  className?: string;
};

export default function MerkPlaats({ keten, maat, vorm = 'rond', titel, naam, className }: MerkPlaatsProps) {
  const sleutels = keten.filter(Boolean);
  const [stap, setStap] = useState(0);
  const [vlag, setVlag] = useState('');
  const sleutel = sleutels[stap] || '';
  const isLand = /^land-[a-z]{2}$/.test(sleutel);
  useEffect(() => { setStap(0); }, [sleutels.join('|')]);
  useEffect(() => {
    if (!isLand) { setVlag(''); return; }
    let weg = false;
    const c = sleutel.slice(5);
    if (vlagCache.has(c.toUpperCase())) { setVlag(vlagCache.get(c.toUpperCase())!); return; }
    void laadVlag(c).then((u) => { if (weg) return; if (u) setVlag(u); else setStap((s) => s + 1); }).catch(() => { if (!weg) setStap((s) => s + 1); });
    return () => { weg = true; };
  }, [sleutel, isLand]);

  const a11y = titel ? { role: 'img' as const, 'aria-label': titel } : { 'aria-hidden': true as const };
  const r = maat ? Math.round(maat * (vorm === 'rond' ? 0.5 : vorm === 'gliefje' ? 0 : 0.28)) : undefined;
  const stijl = { ...(maat ? { width: maat, height: maat, flex: 'none' as const } : null), borderRadius: r };
  const klasse = `merk merk-plaats${vorm === 'gliefje' ? ' merk-gliefje' : ' merk-vlak'}${className ? ` ${className}` : ''}`;

  if (!sleutel) {
    const n = String(naam || '?');
    return (
      <span {...a11y} className={`${klasse} merk-mono`} data-merk='onbekend'
        style={{ ...stijl, ['--merk-kleur' as string]: `hsl(${merkTint(n)} 55% 42%)`, fontSize: maat ? Math.round(maat * 0.36) : undefined }}>
        {monogram(n)}
      </span>
    );
  }
  if (isLand) {
    // Een vlag vult het hele vlak (zo is het 1x1-bestand ontworpen); een dun randje houdt wit in een vlag zichtbaar.
    return (
      <span {...a11y} className={`${klasse} merk-plaats-vlag`} data-merk-plaats={sleutel} data-merk-laag='plaats' style={stijl}>
        {vlag && <img src={vlag} alt='' draggable={false} decoding='async' />}
      </span>
    );
  }
  const donker = PLAATS_DONKER.has(sleutel);
  return (
    <span {...a11y} className={`${klasse} merk-plaats-wapen${donker ? ' merk-plaat-donker' : ' merk-plaat'}`} data-merk-plaats={sleutel} data-merk-laag='plaats'
      data-merk-ondergrond={donker ? 'donker' : 'licht'} style={stijl}>
      <img src={plaatsBeeldUrl(sleutel)} alt='' draggable={false} decoding='async' loading='lazy' onError={() => setStap((s) => s + 1)} />
    </span>
  );
}
