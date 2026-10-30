// WebDAV / Nextcloud (RFC 4918): verbindingscontrole en maplijst via PROPFIND Depth: 1. Alleen lezen.
// Nextcloud: adres https://<host>/remote.php/dav/files/<gebruiker>/ met een app-wachtwoord (Login Flow v2 levert er een).
import { alleenHttps, httpFout, type Haal, type Uitslag } from './gemeen';

export type WebdavItem = { pad: string; map: boolean; grootte: number; gewijzigd: string };
const PROPFIND = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>';

/** Minimale, defensieve ontleding van een 207 Multi-Status (namespace-prefix vrij). */
export function ontleedMultistatus(xml: string): WebdavItem[] {
  const uit: WebdavItem[] = [];
  const blokken = xml.match(/<(?:[a-z0-9]+:)?response\b[\s\S]*?<\/(?:[a-z0-9]+:)?response>/gi) || [];
  for (const b of blokken.slice(0, 2000)) {
    const href = /<(?:[a-z0-9]+:)?href>([\s\S]*?)<\/(?:[a-z0-9]+:)?href>/i.exec(b)?.[1]?.trim() || '';
    if (!href) continue;
    let pad = href; try { pad = decodeURIComponent(href); } catch { /* laat staan */ }
    uit.push({
      pad,
      map: /<(?:[a-z0-9]+:)?collection\s*\/?>/i.test(b),
      grootte: Number(/<(?:[a-z0-9]+:)?getcontentlength>(\d+)</i.exec(b)?.[1] || 0),
      gewijzigd: /<(?:[a-z0-9]+:)?getlastmodified>([^<]*)</i.exec(b)?.[1] || '',
    });
  }
  return uit;
}

export async function webdavLijst(haal: Haal, adres: string, gebruiker: string, wachtwoord: string, opties: { toestaanHttp?: boolean } = {}): Promise<Uitslag<{ items: WebdavItem[] }>> {
  const u = alleenHttps(adres, opties.toestaanHttp);
  if (!u) return { ok: false, fout: 'WEBDAV_ADRES_ONGELDIG' };
  if (!gebruiker || !wachtwoord) return { ok: false, fout: 'WEBDAV_GEGEVENS_ONTBREKEN' };
  let r: Response;
  try {
    r = await haal(u.toString(), { method: 'PROPFIND', headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8', Authorization: `Basic ${Buffer.from(`${gebruiker}:${wachtwoord}`).toString('base64')}` }, body: PROPFIND });
  } catch (e) { return { ok: false, fout: 'WEBDAV_ONBEREIKBAAR', detail: String((e as Error).message || '').slice(0, 120) }; }
  if (r.status !== 207) return { ok: false, fout: httpFout('WEBDAV', r.status) };
  const items = ontleedMultistatus(await r.text());
  if (!items.length) return { ok: false, fout: 'WEBDAV_ANTWOORD_ONGELDIG' };
  // Het eerste item is de map zelf; de rest is de inhoud.
  return { ok: true, waarde: { items: items.slice(1) } };
}
