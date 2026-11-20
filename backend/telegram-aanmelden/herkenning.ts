// TELEGRAM-002 — herkenning van het vragende toestel voor mensen: browser + versie, systeem + versie, plaats en land.
// Alleen weergave (officiële logo's en vlag in het venster en op de site); de grove sleutel «Chrome/Windows» (audit.apparaat)
// blijft de sleutel voor blokkeren en «bekend apparaat». Nooit het IP zelf, nooit de volledige user-agent.
export type Herkenning = { toestel: string; plaats: string; land: string; /** TELEGRAM-004: punt volgens het IP-adres (koppen van de tunnel), afgerond op 1 decimaal. */ ipLat?: number | null; ipLon?: number | null };

import { geldigPunt } from '../../shared/telegram-aanmelden/plaats-vergelijking';

const kop = (headers: Record<string, unknown> | undefined, naam: string): string => {
  if (!headers) return '';
  const k = Object.keys(headers).find((x) => x.toLowerCase() === naam);
  return k ? String(headers[k] ?? '') : '';
};
const decodeer = (v: string): string => { try { return decodeURIComponent(v); } catch { return v; } };
const schoon = (v: string, max: number): string => decodeer(v).replace(/[^\p{L}\p{N} .'()-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);

export function browserEnVersie(ua: string, headers?: Record<string, unknown>): { browser: string; versie: string } {
  const merken = [...kop(headers, 'sec-ch-ua').matchAll(/"([^"]+)";v="([^"]+)"/g)].map((m) => ({ naam: m[1], versie: m[2] }));
  const voorkeur = merken.find((m) => m.naam === 'Microsoft Edge') || merken.find((m) => m.naam === 'Opera') || merken.find((m) => m.naam === 'Brave')
    || merken.find((m) => m.naam === 'Google Chrome') || merken.find((m) => m.naam === 'Chromium');
  if (voorkeur) return { browser: voorkeur.naam === 'Microsoft Edge' ? 'Edge' : voorkeur.naam === 'Google Chrome' ? 'Chrome' : voorkeur.naam, versie: voorkeur.versie.split('.')[0] };
  const tests: Array<[RegExp, string]> = [[/Edg\/(\d+)/, 'Edge'], [/OPR\/(\d+)/, 'Opera'], [/SamsungBrowser\/(\d+)/, 'Samsung Internet'], [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
    [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'], [/Version\/(\d+).*Safari/, 'Safari']];
  for (const [re, naam] of tests) { const m = re.exec(ua); if (m) return { browser: naam, versie: m[1] }; }
  return { browser: '', versie: '' };
}
export function systeemEnVersie(ua: string, headers?: Record<string, unknown>): { systeem: string; versie: string } {
  const platform = kop(headers, 'sec-ch-ua-platform').replace(/"/g, '');
  const pv = kop(headers, 'sec-ch-ua-platform-version').replace(/"/g, '');
  if (platform === 'Windows') { const major = Number(pv.split('.')[0] || 0); return { systeem: 'Windows', versie: major >= 13 ? '11' : major >= 1 ? '10' : '' }; }
  if (platform && platform !== 'Unknown') return { systeem: platform === 'macOS' ? 'macOS' : platform, versie: pv.split('.').slice(0, 2).join('.') };
  let m: RegExpExecArray | null;
  if ((m = /Android\s([\d.]+)/.exec(ua))) return { systeem: 'Android', versie: m[1].split('.')[0] };
  if ((m = /(?:iPhone OS|CPU OS)\s([\d_]+)/.exec(ua))) return { systeem: /iPad/.test(ua) ? 'iPadOS' : 'iOS', versie: m[1].split('_').slice(0, 2).join('.') };
  if ((m = /Mac OS X\s([\d_]+)/.exec(ua))) return { systeem: 'macOS', versie: '' };
  if (/Windows NT 10\.0/.test(ua)) return { systeem: 'Windows', versie: '' };
  if (/CrOS/.test(ua)) return { systeem: 'ChromeOS', versie: '' };
  if (/Linux/.test(ua)) return { systeem: 'Linux', versie: '' };
  return { systeem: '', versie: '' };
}

/** «Chrome 131 · Windows 11», plaats «Brussel, BE» en land «BE» uit de koppen van het verzoek. */
export function herkenning(ua: string, headers?: Record<string, unknown>): Herkenning {
  const b = browserEnVersie(String(ua || ''), headers);
  const s = systeemEnVersie(String(ua || ''), headers);
  const toestel = [b.browser && `${b.browser}${b.versie ? ` ${b.versie}` : ''}`, s.systeem && `${s.systeem}${s.versie ? ` ${s.versie}` : ''}`].filter(Boolean).join(' · ').slice(0, 80);
  const landRuw = kop(headers, 'cf-ipcountry').toUpperCase();
  const land = /^[A-Z]{2}$/.test(landRuw) && landRuw !== 'XX' && landRuw !== 'T1' ? landRuw : '';
  const plaats = [schoon(kop(headers, 'cf-ipcity'), 50), schoon(kop(headers, 'cf-region'), 50)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ').slice(0, 120);
  const punt = geldigPunt(kop(headers, 'cf-iplatitude'), kop(headers, 'cf-iplongitude'));
  return { toestel, plaats, land, ipLat: punt ? Math.round(punt.lat * 10) / 10 : null, ipLon: punt ? Math.round(punt.lon * 10) / 10 : null };
}
