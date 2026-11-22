/** Geldbedragen in centen, percentages in honderdsten van een procent. */
export function leesHonderdsten(tekst: string): number | null {
  const delen = /^(\d{1,10})(?:[,.](\d{1,2}))?$/.exec(tekst.trim());
  if (!delen) return null;
  return Number(delen[1]) * 100 + Number((delen[2] ?? '').padEnd(2, '0'));
}

export function maakBegroting(aantal: number, stukprijs: number, korting: number, belasting: number) {
  if (![aantal, stukprijs, korting, belasting].every(Number.isSafeInteger)
    || aantal < 1 || aantal > 1_000_000 || stukprijs < 0
    || korting < 0 || korting > 10_000 || belasting < 0 || belasting > 10_000) return null;
  const bruto = BigInt(aantal) * BigInt(stukprijs);
  const aandeel = (bedrag: bigint, tarief: number) => (bedrag * BigInt(tarief) + 5000n) / 10000n;
  const kortingbedrag = aandeel(bruto, korting);
  const netto = bruto - kortingbedrag;
  const belastingbedrag = aandeel(netto, belasting);
  const totaal = netto + belastingbedrag;
  if (bruto > BigInt(Number.MAX_SAFE_INTEGER) || totaal > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return {
    bruto: Number(bruto), kortingbedrag: Number(kortingbedrag), netto: Number(netto),
    belastingbedrag: Number(belastingbedrag), totaal: Number(totaal),
  };
}
