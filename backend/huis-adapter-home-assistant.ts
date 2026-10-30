// Huis vNext — de ENIGE adapter van deze release: Home Assistant via zijn REST-API (uitgaand vanaf de server, langlevend token).
//   https://developers.home-assistant.io/docs/api/rest/
// Wat hij doet: verbinding testen (/api/, /api/config), alle entiteiten lezen (/api/states) en vertalen naar mogelijkheden en
// waargenomen toestanden, een opdracht sturen (/api/services/<domein>/<dienst>) en daarna de toestand opnieuw lezen (de ACK),
// geschiedenis van meetwaarden (/api/history/period) voor energie.
// Wat hij NIET doet: poorten openzetten, inkomend verkeer, geheimen loggen, toestanden verzinnen. Een adres zonder antwoord geeft
// 'offline'; 'unavailable' bij HA wordt kwaliteit 'onbeschikbaar'. Het token komt alleen versleuteld uit de database (huis-vnext.ts).
import type { Mogelijkheid, MogelijkheidSoort, Toestand } from '../shared/huis-model';

export type HaEntiteit = { entity_id: string; state: string; attributes: Record<string, unknown>; last_changed?: string; last_updated?: string };
export type OntdektApparaat = { bronId: string; naam: string; soort: string; fabrikant: string; model: string; mogelijkheden: Mogelijkheid[]; kritiek: boolean; online: boolean; laatstGezien: string | null; toestanden: Omit<Toestand, 'ontvangenOp'>[] };
export type HaFout = 'ADRES_ONGELDIG' | 'ADRES_GEWEIGERD' | 'TOKEN_GEWEIGERD' | 'GEEN_ANTWOORD' | 'ANTWOORD_ONGELDIG' | 'TE_GROOT' | 'ONBEKEND';
const TIMEOUT_MS = 8000;
const MAX_BYTES = 6_000_000;

/** Alleen http(s), geen aanmeldgegevens in het adres, geen loopback/link-local/0.0.0.0: de server praat met een echte HA op LAN/VPN. */
export function veiligAdres(raw: unknown): { ok: true; adres: string } | { ok: false; fout: HaFout } {
  let u: URL;
  try { u = new URL(String(raw ?? '').trim()); } catch { return { ok: false, fout: 'ADRES_ONGELDIG' }; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.search || u.hash) return { ok: false, fout: 'ADRES_ONGELDIG' };
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1' || h === '::' || /^127\./.test(h) || /^169\.254\./.test(h) || /^fe80:/i.test(h) || h.endsWith('.internal')) return { ok: false, fout: 'ADRES_GEWEIGERD' };
  return { ok: true, adres: `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}` };
}

async function roep(adres: string, token: string, pad: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: true; data: unknown } | { ok: false; fout: HaFout; status?: number }> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${adres}${pad}`, { method: init.method || 'GET', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' }, body: init.body === undefined ? undefined : JSON.stringify(init.body), signal: ctrl.signal, redirect: 'manual' });
    if (res.status === 401 || res.status === 403) return { ok: false, fout: 'TOKEN_GEWEIGERD', status: res.status };
    const len = Number(res.headers.get('content-length') || 0); if (len > MAX_BYTES) return { ok: false, fout: 'TE_GROOT' };
    const tekst = await res.text(); if (tekst.length > MAX_BYTES) return { ok: false, fout: 'TE_GROOT' };
    if (!res.ok) return { ok: false, fout: 'ANTWOORD_ONGELDIG', status: res.status };
    try { return { ok: true, data: tekst ? JSON.parse(tekst) : null }; } catch { return { ok: false, fout: 'ANTWOORD_ONGELDIG', status: res.status }; }
  } catch { return { ok: false, fout: 'GEEN_ANTWOORD' }; }
  finally { clearTimeout(t); }
}

export async function haVerbinden(adres: string, token: string): Promise<{ ok: true; versie: string; locatie: string; entiteiten: number } | { ok: false; fout: HaFout }> {
  const a = await roep(adres, token, '/api/');
  if (!a.ok) return a;
  const c = await roep(adres, token, '/api/config');
  const cfg = (c.ok && c.data && typeof c.data === 'object' ? c.data : {}) as Record<string, unknown>;
  const s = await roep(adres, token, '/api/states');
  return { ok: true, versie: String(cfg.version ?? ''), locatie: String(cfg.location_name ?? ''), entiteiten: s.ok && Array.isArray(s.data) ? s.data.length : 0 };
}

const getal = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null);
const kw = (state: string) => (state === 'unavailable' ? 'onbeschikbaar' : state === 'unknown' || state === '' ? 'onbekend' : 'gemeten') as Toestand['kwaliteit'];
/** Eén HA-entiteit → apparaat met mogelijkheden en waargenomen toestanden. Alleen wat het domein + de attributen echt zeggen. */
export function vertaalEntiteit(e: HaEntiteit): OntdektApparaat | null {
  const [domein] = e.entity_id.split('.');
  const a = e.attributes || {};
  const naam = String(a.friendly_name ?? e.entity_id).slice(0, 120);
  const klasse = String(a.device_class ?? '');
  const eenheid = String(a.unit_of_measurement ?? '');
  const op = e.last_changed || e.last_updated || null;
  const k = kw(e.state);
  const m: Mogelijkheid[] = []; const t: Omit<Toestand, 'ontvangenOp'>[] = [];
  const aanUit = (schrijven: boolean) => { m.push({ soort: 'aan_uit', lezen: true, schrijven }); t.push({ kenmerk: 'aan', waarde: k === 'gemeten' ? e.state === 'on' : null, eenheid: '', waargenomenOp: op, kwaliteit: k }); };
  switch (domein) {
    case 'light': {
      aanUit(true);
      const modi = Array.isArray(a.supported_color_modes) ? a.supported_color_modes.map(String) : [];
      if (modi.some((x) => ['brightness', 'color_temp', 'hs', 'rgb', 'rgbw', 'rgbww', 'xy', 'white'].includes(x))) { m.push({ soort: 'helderheid', lezen: true, schrijven: true, eenheid: '%', bereik: [0, 100] }); const b = getal(a.brightness); t.push({ kenmerk: 'helderheid', waarde: b === null ? null : Math.round((b / 255) * 100), eenheid: '%', waargenomenOp: op, kwaliteit: k }); }
      if (modi.includes('color_temp')) { const min = getal(a.min_color_temp_kelvin) ?? 2000, max = getal(a.max_color_temp_kelvin) ?? 6500; m.push({ soort: 'kleurtemperatuur', lezen: true, schrijven: true, eenheid: 'K', bereik: [min, max] }); t.push({ kenmerk: 'kleurtemperatuur', waarde: getal(a.color_temp_kelvin), eenheid: 'K', waargenomenOp: op, kwaliteit: k }); }
      break;
    }
    case 'switch': case 'input_boolean': case 'fan': case 'siren': aanUit(domein !== 'siren'); if (domein === 'siren') m[m.length - 1].kritiek = true; break;
    case 'sensor': {
      const soort: MogelijkheidSoort = klasse === 'temperature' ? 'temperatuur' : klasse === 'humidity' ? 'vochtigheid' : klasse === 'power' ? 'vermogen' : klasse === 'energy' ? 'energie' : klasse === 'battery' ? 'batterij' : 'meting';
      m.push({ soort, lezen: true, schrijven: false, eenheid, klasse });
      t.push({ kenmerk: soort === 'meting' ? 'meting' : soort, waarde: k === 'gemeten' ? (getal(e.state) ?? e.state) : null, eenheid, waargenomenOp: op, kwaliteit: k });
      break;
    }
    case 'binary_sensor': {
      const soort: MogelijkheidSoort = ['door', 'window', 'opening', 'garage_door', 'lock'].includes(klasse) ? 'contact' : ['motion', 'occupancy', 'presence'].includes(klasse) ? 'beweging' : klasse === 'moisture' ? 'water' : klasse === 'smoke' ? 'rook' : ['gas', 'carbon_monoxide'].includes(klasse) ? 'gas' : 'contact';
      m.push({ soort, lezen: true, schrijven: false, klasse, kritiek: soort === 'rook' || soort === 'gas' });
      t.push({ kenmerk: soort, waarde: k === 'gemeten' ? e.state === 'on' : null, eenheid: '', waargenomenOp: op, kwaliteit: k });
      break;
    }
    case 'climate': {
      m.push({ soort: 'temperatuur', lezen: true, schrijven: false, eenheid: '°C' });
      t.push({ kenmerk: 'temperatuur', waarde: getal(a.current_temperature), eenheid: '°C', waargenomenOp: op, kwaliteit: getal(a.current_temperature) === null ? 'onbekend' : k });
      m.push({ soort: 'doeltemperatuur', lezen: true, schrijven: true, eenheid: '°C', bereik: [getal(a.min_temp) ?? 5, getal(a.max_temp) ?? 35] });
      t.push({ kenmerk: 'doeltemperatuur', waarde: getal(a.temperature), eenheid: '°C', waargenomenOp: op, kwaliteit: k });
      break;
    }
    case 'cover': {
      m.push({ soort: 'open_dicht', lezen: true, schrijven: true, klasse });
      t.push({ kenmerk: 'open', waarde: k === 'gemeten' ? (e.state === 'open' || e.state === 'opening') : null, eenheid: '', waargenomenOp: op, kwaliteit: k });
      if (getal(a.current_position) !== null) { m.push({ soort: 'positie', lezen: true, schrijven: true, eenheid: '%', bereik: [0, 100] }); t.push({ kenmerk: 'positie', waarde: getal(a.current_position), eenheid: '%', waargenomenOp: op, kwaliteit: k }); }
      break;
    }
    case 'lock': m.push({ soort: 'vergrendeld', lezen: true, schrijven: true, kritiek: true }); t.push({ kenmerk: 'vergrendeld', waarde: k === 'gemeten' ? e.state === 'locked' : null, eenheid: '', waargenomenOp: op, kwaliteit: k }); break;
    case 'alarm_control_panel': m.push({ soort: 'alarm', lezen: true, schrijven: true, kritiek: true }); t.push({ kenmerk: 'alarm', waarde: k === 'gemeten' ? e.state : null, eenheid: '', waargenomenOp: op, kwaliteit: k }); break;
    case 'person': case 'device_tracker': m.push({ soort: 'aanwezigheid', lezen: true, schrijven: false }); t.push({ kenmerk: 'aanwezigheid', waarde: k === 'gemeten' ? e.state === 'home' : null, eenheid: '', waargenomenOp: op, kwaliteit: k }); break;
    default: return null; // automation, script, update, zone, sun, weather, … geen apparaat voor deze pagina
  }
  if (getal(a.battery_level) !== null) { m.push({ soort: 'batterij', lezen: true, schrijven: false, eenheid: '%' }); t.push({ kenmerk: 'batterij', waarde: getal(a.battery_level), eenheid: '%', waargenomenOp: op, kwaliteit: k }); }
  return { bronId: e.entity_id, naam, soort: domein, fabrikant: '', model: '', mogelijkheden: m, kritiek: m.some((x) => x.kritiek), online: k !== 'onbeschikbaar', laatstGezien: op, toestanden: t };
}
export async function haOntdekken(adres: string, token: string): Promise<{ ok: true; apparaten: OntdektApparaat[]; overgeslagen: number } | { ok: false; fout: HaFout }> {
  const s = await roep(adres, token, '/api/states');
  if (!s.ok) return s;
  if (!Array.isArray(s.data)) return { ok: false, fout: 'ANTWOORD_ONGELDIG' };
  const apparaten: OntdektApparaat[] = []; let overgeslagen = 0;
  for (const e of s.data as HaEntiteit[]) { if (!e || typeof e.entity_id !== 'string') continue; const a = vertaalEntiteit(e); if (a) apparaten.push(a); else overgeslagen++; }
  return { ok: true, apparaten, overgeslagen };
}
export async function haLezen(adres: string, token: string, entityId: string): Promise<OntdektApparaat | null | 'fout'> {
  const r = await roep(adres, token, `/api/states/${encodeURIComponent(entityId)}`);
  if (!r.ok) return r.fout === 'ANTWOORD_ONGELDIG' && r.status === 404 ? null : 'fout';
  return vertaalEntiteit(r.data as HaEntiteit);
}
/** Gewenste toestand → HA-dienst. Alleen voor schrijfbare mogelijkheden; kritieke komen hier alleen na step-up van een mens. */
export function haDienstVoor(entityId: string, mogelijkheid: MogelijkheidSoort, waarde: Record<string, unknown>): { domein: string; dienst: string; data: Record<string, unknown> } | null {
  const [domein] = entityId.split('.');
  const data: Record<string, unknown> = { entity_id: entityId };
  switch (mogelijkheid) {
    case 'aan_uit': if (!['light', 'switch', 'input_boolean', 'fan', 'siren'].includes(domein)) return null; return { domein, dienst: waarde.aan ? 'turn_on' : 'turn_off', data };
    case 'helderheid': if (domein !== 'light') return null; return { domein, dienst: 'turn_on', data: { ...data, brightness_pct: Number(waarde.waarde) } };
    case 'kleurtemperatuur': if (domein !== 'light') return null; return { domein, dienst: 'turn_on', data: { ...data, color_temp_kelvin: Number(waarde.waarde) } };
    case 'doeltemperatuur': if (domein !== 'climate') return null; return { domein, dienst: 'set_temperature', data: { ...data, temperature: Number(waarde.waarde) } };
    case 'open_dicht': if (domein !== 'cover') return null; return { domein, dienst: waarde.actie === 'open' ? 'open_cover' : waarde.actie === 'dicht' ? 'close_cover' : 'stop_cover', data };
    case 'positie': if (domein !== 'cover') return null; return { domein, dienst: 'set_cover_position', data: { ...data, position: Number(waarde.waarde) } };
    case 'vergrendeld': if (domein !== 'lock') return null; return { domein, dienst: waarde.aan ? 'lock' : 'unlock', data };
    case 'alarm': if (domein !== 'alarm_control_panel') return null; return { domein, dienst: waarde.aan ? 'alarm_arm_away' : 'alarm_disarm', data };
    default: return null;
  }
}
export async function haStuur(adres: string, token: string, d: { domein: string; dienst: string; data: Record<string, unknown> }): Promise<{ ok: true } | { ok: false; fout: HaFout }> {
  const r = await roep(adres, token, `/api/services/${encodeURIComponent(d.domein)}/${encodeURIComponent(d.dienst)}`, { method: 'POST', body: d.data });
  return r.ok ? { ok: true } : r;
}
/** Zegt of de waargenomen toestand na de opdracht overeenkomt met wat gevraagd was (de echte ACK). */
export function komtOvereen(mogelijkheid: MogelijkheidSoort, waarde: Record<string, unknown>, toestanden: ReadonlyArray<Pick<Toestand, 'kenmerk' | 'waarde'>>): boolean {
  const v = (k: string) => toestanden.find((t) => t.kenmerk === k)?.waarde;
  switch (mogelijkheid) {
    case 'aan_uit': return v('aan') === waarde.aan;
    case 'helderheid': { const n = Number(v('helderheid')); return Number.isFinite(n) && Math.abs(n - Number(waarde.waarde)) <= 2; }
    case 'kleurtemperatuur': { const n = Number(v('kleurtemperatuur')); return Number.isFinite(n) && Math.abs(n - Number(waarde.waarde)) <= 60; }
    case 'doeltemperatuur': { const n = Number(v('doeltemperatuur')); return Number.isFinite(n) && Math.abs(n - Number(waarde.waarde)) <= 0.3; }
    case 'open_dicht': return waarde.actie === 'stop' ? true : v('open') === (waarde.actie === 'open');
    case 'positie': { const n = Number(v('positie')); return Number.isFinite(n) && Math.abs(n - Number(waarde.waarde)) <= 3; }
    case 'vergrendeld': return v('vergrendeld') === waarde.aan;
    case 'alarm': return waarde.aan ? String(v('alarm')).startsWith('armed') : v('alarm') === 'disarmed';
    default: return false;
  }
}
export async function haGeschiedenis(adres: string, token: string, entityIds: string[], vanIso: string): Promise<{ ok: true; reeksen: Record<string, Array<{ op: string; waarde: number }>> } | { ok: false; fout: HaFout }> {
  const r = await roep(adres, token, `/api/history/period/${encodeURIComponent(vanIso)}?filter_entity_id=${encodeURIComponent(entityIds.join(','))}&minimal_response&no_attributes`);
  if (!r.ok) return r;
  const reeksen: Record<string, Array<{ op: string; waarde: number }>> = {};
  for (const reeks of Array.isArray(r.data) ? r.data : []) {
    if (!Array.isArray(reeks) || !reeks.length) continue;
    const id = String((reeks[0] as HaEntiteit).entity_id || '');
    reeksen[id] = (reeks as HaEntiteit[]).map((x) => ({ op: String(x.last_changed || x.last_updated || ''), waarde: getal(x.state) ?? NaN })).filter((x) => Number.isFinite(x.waarde)).slice(0, 2000);
  }
  return { ok: true, reeksen };
}
