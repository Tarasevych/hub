// ЗНАК ПРОВАЙДЕРА (PLAATS-TEKENS-001, 17.11.2026, Павло: «провайдерів також базу логотипів створити треба всіх»).
// За номером мережі (ASN) або назвою з бази мереж (backend/geo/asn.ts) повертає ключ знака в реєстрі логотипів (src/merk) або
// null — тоді <Merk> малює монограму з назви. Номери ASN звірено з базою iptoasn.com (PDDL) 17.11.2026.
// PROVIDERTEKEN: van ASN of netwerknaam naar de sleutel van het logo in het register; onbekend = null (monogram).

/** zonderLogo: nog geen vrij bruikbaar origineel (de site weigert verzoeken van buiten of toont alleen een woordmerk) → monogram. */
export type ProviderDef = { sleutel: string; naam: string; land: string; asn: number[]; patroon?: RegExp; zonderLogo?: true };

/** Eén regel per provider. `sleutel` = sleutel in het logoregister (src/merk/officieel of merk-tabel). */
export const PROVIDERS: readonly ProviderDef[] = [
  // België
  { sleutel: 'proximus', naam: 'Proximus', land: 'BE', asn: [5432], patroon: /\bproximus\b|\bbelgacom\b/i },
  { sleutel: 'telenet', naam: 'Telenet', land: 'BE', asn: [6848], patroon: /\btelenet\b/i },
  { sleutel: 'orange', naam: 'Orange', land: 'BE', asn: [47377, 3215, 5511], patroon: /\borange\b/i },
  { sleutel: 'voo', naam: 'VOO', land: 'BE', asn: [12392], patroon: /\bvoo\b|\bbrutele\b|\bnethys\b/i },
  // Nederland
  { sleutel: 'kpn', naam: 'KPN', land: 'NL', asn: [1136, 286], patroon: /\bkpn\b/i },
  { sleutel: 'ziggo', naam: 'Ziggo', land: 'NL', asn: [33915, 9143], patroon: /\bziggo\b|vodafone ?libertel/i },
  { sleutel: 'odido', naam: 'Odido', land: 'NL', asn: [50266, 31615], patroon: /\bodido\b|t-mobile (netherlands|thuis)/i },
  // Україна
  { sleutel: 'kyivstar', naam: 'Київстар', land: 'UA', asn: [15895], patroon: /kyivstar/i, zonderLogo: true },
  { sleutel: 'vodafone', naam: 'Vodafone', land: 'UA', asn: [21497, 3209, 1273], patroon: /\bvf ukraine\b|\bvodafone\b|\bvodanet\b/i },
  { sleutel: 'ukrtelecom', naam: 'Укртелеком', land: 'UA', asn: [6849], patroon: /ukrtelecom|ukrtelnet/i },
  // Groot en grensoverschrijdend
  { sleutel: 'deutschetelekom', naam: 'Telekom', land: 'DE', asn: [3320], patroon: /deutsche telekom|\bdtag\b/i },
  { sleutel: 'starlink', naam: 'Starlink', land: 'US', asn: [14593], patroon: /starlink/i },
  { sleutel: 'google', naam: 'Google', land: 'US', asn: [15169, 396982], patroon: /^google\b/i },
  { sleutel: 'cloudflare', naam: 'Cloudflare', land: 'US', asn: [13335], patroon: /cloudflare/i },
];

const PER_ASN = new Map<number, ProviderDef>();
for (const p of PROVIDERS) for (const a of p.asn) PER_ASN.set(a, p);

/** Leesbare naam uit de netwerknaam van iptoasn («PROXIMUS-ISP-AS Proximus NV» → «Proximus NV»). */
export function providerNaamUitAsNaam(asNaam: unknown): string {
  const s = String(asNaam ?? '').trim();
  const m = /^[A-Z0-9][A-Z0-9_.-]*\s+(?:-\s+)?(.+)$/.exec(s);
  return (m ? m[1] : s).replace(/^"+|"+$/g, '').slice(0, 80);
}

export function providerTeken(v: { asn?: number | string | null; naam?: string | null }): ProviderDef | null {
  const n = Number(String(v.asn ?? '').replace(/^AS/i, ''));
  if (Number.isInteger(n) && n > 0 && PER_ASN.has(n)) return PER_ASN.get(n)!;
  const naam = String(v.naam ?? '');
  if (naam) for (const p of PROVIDERS) if (p.patroon?.test(naam)) return p;
  return null;
}
