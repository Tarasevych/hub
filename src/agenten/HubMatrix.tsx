// «Що через який спосіб» (overzicht van de hub): tabel op brede schermen, lijst per methode op de telefoon (geen horizontaal scrollen).
// INTEG-001 (03.11.2026): een blok .ag-blok met kop + één zin uitleg; de cellen zijn ronde tekens (agenten-pagina.css), geen kale tabel.
import type { Tr } from '../mcp-ui';
import { CEL_TEKEN, CEL_TEKST, DOELEN, METHODEN, berekenMatrix, type MatrixInvoer } from './matrix';

export default function HubMatrix({ tr, invoer, ga }: { tr: Tr; invoer: MatrixInvoer; ga: (tab: string) => void }) {
  const m = berekenMatrix(invoer);
  const doel = (id: string) => DOELEN.find((d) => d.id === id)!;
  const methode = (id: string) => METHODEN.find((x) => x.id === id)!;
  const t2 = (x: readonly [string, string]) => tr(x[0], x[1]);
  return (
    <section className='ag-blok ag-matrix' data-matrix={m.kolommen.join(',')} aria-labelledby='ag-matrix-kop'>
      <header className='ag-blok-kop'>
        <h3 className='ag-blok-titel' id='ag-matrix-kop'>{tr('Що через який спосіб', 'Wat via welke weg')}</h3>
        <p className='ag-blok-uitleg'>{tr('Який спосіб підключення до чого дає доступ саме зараз. Натисніть на спосіб, щоб перейти до нього.', 'Welke manier van koppelen nu waartoe toegang geeft. Klik op een manier om erheen te gaan.')}</p>
      </header>
      <p className='ag-matrix-legenda'>
        <span><b aria-hidden='true'>{CEL_TEKEN.ja}</b> {t2(CEL_TEKST.ja)}</span>
        <span><b aria-hidden='true'>{CEL_TEKEN.kan}</b> {t2(CEL_TEKST.kan)}</span>
        <span><b aria-hidden='true'>{CEL_TEKEN.nooit}</b> {t2(CEL_TEKST.nooit)}</span>
      </p>
      <div className='ag-matrix-tabel'>
        <table>
          <thead>
            <tr><th scope='col'>{tr('Спосіб', 'Weg')}</th>{m.kolommen.map((k) => <th scope='col' key={k} data-kolom={k}>{t2(doel(k).naam)}</th>)}</tr>
          </thead>
          <tbody>
            {m.rijen.map((r) => (
              <tr key={r.methode} data-methode={r.methode}>
                <th scope='row'><a href={`#${methode(r.methode).tab}`} onClick={(e) => { e.preventDefault(); ga(methode(r.methode).tab); }}>{t2(methode(r.methode).naam)}</a><small>{t2(methode(r.methode).uitleg)}</small></th>
                {m.kolommen.map((k) => (
                  <td key={k} data-cel={`${r.methode}:${k}`} data-waarde={r.cellen[k]} className={`is-${r.cellen[k]}`} title={t2(CEL_TEKST[r.cellen[k]])}>
                    <span aria-hidden='true'>{CEL_TEKEN[r.cellen[k]]}</span><span className='ag-sr'>{t2(CEL_TEKST[r.cellen[k]])}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className='ag-matrix-lijst' aria-label={tr('Що через який спосіб', 'Wat via welke weg')}>
        {m.rijen.map((r) => {
          const ja = m.kolommen.filter((k) => r.cellen[k] === 'ja'), kan = m.kolommen.filter((k) => r.cellen[k] === 'kan');
          return (
            <li key={r.methode} data-methode-lijst={r.methode}>
              <a href={`#${methode(r.methode).tab}`} onClick={(e) => { e.preventDefault(); ga(methode(r.methode).tab); }}><b>{t2(methode(r.methode).naam)}</b></a>
              <small>{t2(methode(r.methode).uitleg)}</small>
              <p><span className='is-ja'>{CEL_TEKEN.ja}</span> {ja.length ? ja.map((k) => t2(doel(k).naam)).join(', ') : tr('нічого зараз', 'nu niets')}</p>
              {kan.length ? <p><span className='is-kan'>{CEL_TEKEN.kan}</span> {kan.map((k) => t2(doel(k).naam)).join(', ')}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
