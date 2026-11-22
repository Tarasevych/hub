import { useState, type FormEvent } from 'react';
import { leesHonderdsten, maakBegroting } from '../../shared/klantrelatie-begroting';

type Eigenschappen = {
  lang: 'uk' | 'nl'; klantNaam: string; titel: string; centen: number;
  magSchrijven: boolean; bewaar: (tekst: string) => Promise<void>;
};

const woorden = {
  uk: {
    kop: 'Кошторис', naam: 'Предмет пропозиції', aantal: 'Кількість', prijs: 'Ціна за одиницю без податку (€)',
    korting: 'Знижка (%)', belasting: 'ПДВ (%)', netto: 'Після знижки', btw: 'ПДВ', totaal: 'Разом',
    bewaar: 'Зберегти чернетку в картці', gelukt: 'Чернетку збережено в історії клієнта.',
    fout: 'Не вдалося зберегти чернетку. Спробуйте ще раз.', onjuist: 'Перевірте кількість, ціну та відсотки.',
    ontwerp: 'Чернетка кошторису', eenheid: 'шт.', voor: 'Для', artikel: 'Товар або послуга',
  },
  nl: {
    kop: 'Begroting', naam: 'Omschrijving', aantal: 'Aantal', prijs: 'Stukprijs zonder btw (€)',
    korting: 'Korting (%)', belasting: 'Btw (%)', netto: 'Na korting', btw: 'Btw', totaal: 'Totaal',
    bewaar: 'Ontwerp in klantdossier bewaren', gelukt: 'Het ontwerp staat in de contactgeschiedenis.',
    fout: 'Bewaren is mislukt. Probeer het opnieuw.', onjuist: 'Controleer het aantal, de prijs en de percentages.',
    ontwerp: 'Ontwerpbegroting', eenheid: 'st.', voor: 'Voor', artikel: 'Product of dienst',
  },
};

/** Een andere overeenkomst krijgt een eigen ontwerp, ook als het venster openblijft. */
export default function Rekenvoorstel(eigenschappen: Eigenschappen) {
  return <Begrotingsformulier key={JSON.stringify([eigenschappen.klantNaam, eigenschappen.titel, eigenschappen.centen])} {...eigenschappen} />;
}

function Begrotingsformulier({ lang, klantNaam, titel, centen, magSchrijven, bewaar }: Eigenschappen) {
  const w = woorden[lang];
  const [omschrijving, benoem] = useState(titel);
  const [aantal, tel] = useState('1');
  const [prijs, prijsIn] = useState((centen / 100).toFixed(2).replace('.', ','));
  const [korting, kortingIn] = useState('0');
  const [belasting, belastingIn] = useState('0');
  const [stand, zetStand] = useState<'vrij' | 'bezig' | 'bewaard' | 'fout'>('vrij');
  const stukprijs = leesHonderdsten(prijs);
  const bedrag = maakBegroting(/^\d{1,7}$/.test(aantal) ? Number(aantal) : 0,
    stukprijs ?? -1, leesHonderdsten(korting) ?? -1, leesHonderdsten(belasting) ?? -1);
  const geld = new Intl.NumberFormat(lang === 'nl' ? 'nl-BE' : 'uk-UA', { style: 'currency', currency: 'EUR' });
  const toon = (waarde: number) => geld.format(waarde / 100);
  const kanBewaren = magSchrijven && Boolean(omschrijving.trim()) && bedrag && stand !== 'bezig' && stand !== 'bewaard';

  async function opslaan(e: FormEvent) {
    e.preventDefault();
    if (!kanBewaren || !bedrag || stukprijs === null) return;
    zetStand('bezig');
    try {
      await bewaar([
        w.ontwerp, `${w.voor} ${klantNaam}`, omschrijving.trim(), `${aantal} ${w.eenheid} × ${toon(stukprijs)}`,
        `${w.korting} ${korting} · −${toon(bedrag.kortingbedrag)}`, `${w.netto} ${toon(bedrag.netto)}`,
        `${w.btw} ${belasting}% · ${toon(bedrag.belastingbedrag)}`, `${w.totaal} ${toon(bedrag.totaal)}`,
      ].join('\n'));
      zetStand('bewaard');
    } catch { zetStand('fout'); }
  }

  return <details className="kr-begroting">
    <summary>{w.kop}</summary>
    <form onSubmit={opslaan} onChange={() => zetStand('vrij')}>
      <fieldset disabled={stand === 'bezig'}>
        <label>{w.naam}<input value={omschrijving} onChange={e => benoem(e.target.value)} placeholder={w.artikel} maxLength={180} required /></label>
        <label>{w.aantal}<input inputMode="numeric" value={aantal} onChange={e => tel(e.target.value)} required /></label>
        <label>{w.prijs}<input inputMode="decimal" value={prijs} onChange={e => prijsIn(e.target.value)} required /></label>
        <label>{w.korting}<input inputMode="decimal" value={korting} onChange={e => kortingIn(e.target.value)} required /></label>
        <label>{w.belasting}<input inputMode="decimal" value={belasting} onChange={e => belastingIn(e.target.value)} required /></label>
      </fieldset>
      {bedrag ? <dl aria-live="polite">
        <div><dt>{w.netto}</dt><dd>{toon(bedrag.netto)}</dd></div>
        <div><dt>{w.btw}</dt><dd>{toon(bedrag.belastingbedrag)}</dd></div>
        <div><dt>{w.totaal}</dt><dd><strong>{toon(bedrag.totaal)}</strong></dd></div>
      </dl> : <p role="status">{w.onjuist}</p>}
      {magSchrijven && <button type="submit" disabled={!kanBewaren}>{w.bewaar}</button>}
      {stand === 'bewaard' && <p role="status">{w.gelukt}</p>}
      {stand === 'fout' && <p role="alert">{w.fout}</p>}
    </form>
  </details>;
}
