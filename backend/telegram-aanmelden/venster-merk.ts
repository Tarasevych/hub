// TELEGRAM-002 — officiële logo's (browser, systeem) en de landvlag voor het beveiligde Telegram-venster, als data-URI's.
// Zelfde bronnen als de site: het ENE merkregister (src/merk/merk-tabel.ts — simple-icons CC0; src/merk/merk-officieel.ts —
// officiële bestanden van Microsoft enz.) en country-flag-icons (MIT). Niets nagetekend; ontbreekt een logo, dan geen logo.
import { MERKEN } from '../../src/merk/merk-tabel';
import { OFFICIEEL } from '../../src/merk/merk-officieel';
import * as VLAGGEN from 'country-flag-icons/string/3x2';

const svgUri = (svg: string): string => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

export const browserSleutel = (b: string): string => {
  const v = b.toLowerCase();
  if (v.includes('edge')) return 'edge'; if (v.includes('firefox')) return 'firefox'; if (v.includes('opera')) return 'opera';
  if (v.includes('brave')) return 'brave'; if (v.includes('vivaldi')) return 'vivaldi'; if (v.includes('samsung')) return 'samsung';
  if (v.includes('safari')) return 'safari'; if (v.includes('chrom')) return 'chrome';
  return '';
};
export const systeemSleutel = (o: string): string => {
  const v = o.toLowerCase();
  if (v.startsWith('windows')) return 'windows'; if (v.includes('mac') || v.includes('ios') || v.includes('ipad')) return 'apple';
  if (v.includes('android')) return 'android'; if (v.includes('ubuntu')) return 'ubuntu'; if (v.includes('chromeos')) return 'google'; if (v.includes('linux')) return 'linux';
  return '';
};

/** Logo van een merk uit het register; `donker` = de achtergrond is donker (Apple/Linux volgen dan wit). */
export function merkLogo(sleutel: string, donker = false): string {
  if (!sleutel) return '';
  const off = (OFFICIEEL as Record<string, { soort: string; inhoud: string }>)[sleutel];
  if (off && off.soort === 'svg') return svgUri(off.inhoud);
  const m = (MERKEN as Record<string, { kleur: string; d?: string; regel?: string; volgtTekst?: boolean; neutraal?: boolean }>)[sleutel];
  if (!m || !m.d || m.neutraal) return '';
  const kleur = m.volgtTekst && donker ? '#ffffff' : m.kleur;
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${kleur}"${m.regel === 'evenodd' ? ' fill-rule="evenodd"' : ''} d="${m.d}"/></svg>`);
}
export function vlag(land: string): string {
  if (!/^[A-Z]{2}$/.test(land)) return '';
  const s = (VLAGGEN as Record<string, string>)[land];
  return s ? svgUri(s) : '';
}
