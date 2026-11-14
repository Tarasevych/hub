// SEC-002 / http-rand-05 (12.11.2026) — WELK ADRES TELT VOOR EEN LIMIET OF EEN BLOKKADE?
//
// Limieten per minuut (server/start.ts) en blokkades na mislukte pogingen (backend/toegangslaag.ts, backend/toegangscodes-routes.ts)
// telden per VOLLEDIG adres. Bij IPv4 is dat één aansluiting. Bij IPv6 krijgt elke aansluiting (thuis, een gehuurde server) een
// heel /64-net: 2^64 adressen. Wie bij elke poging een ander adres uit zijn eigen net nam, begon telkens met een verse teller en
// een verse blokkade — onbeperkt wachtwoorden raden, onbeperkt registreren, en een rij in de database per adres.
// Daarom telt voor IPv6 het /64-net (de eerste 64 bits), voor IPv4 het adres zelf (ook als het als ::ffff:a.b.c.d binnenkomt).
// Zuiver: geen netwerk, geen node-modules (de tests lezen dit bestand).

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** De acht groepen van een IPv6-adres (elk 0–65535), of null als het geen geldig IPv6-adres is. */
function ipv6Groepen(ruw: string): number[] | null {
  let s = ruw;
  // Ingesloten IPv4 aan het eind (::ffff:192.0.2.1, 64:ff9b::192.0.2.1) → twee groepen.
  const punt = s.lastIndexOf(':');
  const staart = punt >= 0 ? s.slice(punt + 1) : '';
  if (staart.includes('.')) {
    const m = IPV4.exec(staart);
    if (!m || m.slice(1).some((d) => Number(d) > 255)) return null;
    const [a, b, c, d] = m.slice(1).map(Number);
    s = `${s.slice(0, punt + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const helften = s.split('::');
  if (helften.length > 2) return null;
  const lees = (deel: string): number[] | null => {
    if (!deel) return [];
    const uit: number[] = [];
    for (const g of deel.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      uit.push(parseInt(g, 16));
    }
    return uit;
  };
  const links = lees(helften[0]);
  const rechts = helften.length === 2 ? lees(helften[1]) : [];
  if (!links || !rechts) return null;
  if (helften.length === 1) return links.length === 8 ? links : null;
  const gat = 8 - links.length - rechts.length;
  if (gat < 1) return null;
  return [...links, ...new Array<number>(gat).fill(0), ...rechts];
}

/**
 * De sleutel waarop limieten en blokkades tellen: IPv4 → het adres zelf; IPv6 → het /64-net («2001:db8:1:2::/64»);
 * IPv4 in IPv6-vorm (::ffff:a.b.c.d) → dat IPv4-adres. Iets wat geen IP-adres is, komt ongewijzigd (kleine letters) terug.
 */
export function limietSleutel(ip: unknown): string {
  const s = String(ip ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (!s) return '';
  if (IPV4.test(s) || !s.includes(':') || s.length > 45) return s;
  const g = ipv6Groepen(s);
  if (!g) return s;
  // IPv4-mapped (::ffff:a.b.c.d): het is IPv4-verkeer, dus het adres zelf telt.
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
}
