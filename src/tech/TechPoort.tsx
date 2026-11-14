// Двері розділу управління: адміністрування, API та сторінки управління всередині користувацьких служб (панель розгортання,
// додатки на сервері, архів, підписаний доступ ШІ) не відкриваються, доки в цій вкладці не увімкнено технічний профіль.
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { MaquetteKunst } from '../maquette-kern';
import { useIsMaquette } from '../thema/useThema';
import { openTechVenster } from './tech-opslag';
import { useRuimtesV2 } from './ruimtes/ruimtes-vlag';
import './tech.css';
import './tech-maquette.css';

// Audit 19.10 (2c): zonder technisch profiel geen knop «Увімкнути технічний профіль» (die zou een muur achter een muur zijn),
// maar de uitleg dat de eigenaar het profiel geeft; alleen «До облікового запису».
export default function TechPoort({ lang, onAccount, heeftProfiel = true }: { lang: 'uk' | 'nl'; onAccount: () => void; heeftProfiel?: boolean }) {
  const uk = lang === 'uk';
  const v2 = useRuimtesV2();
  const isMaquette = useIsMaquette();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const naarTech = async () => {
    setBezig(true); setFout('');
    try { const m = await import('./ruimtes/RuimteWissel'); const u = await m.kiesRuimte('technisch', lang); if (u && !u.ok) setFout(u.tekst); }
    catch { setFout(uk ? 'Не вдалося перемкнути. Спробуйте ще раз.' : 'Wisselen lukte niet. Probeer het opnieuw.'); }
    finally { setBezig(false); }
  };

  if (isMaquette) {
    const bovenTekst = uk ? 'ТЕХНІЧНИЙ КОНТУР · ЗАХИЩЕНА БРАМА' : 'TECHNISCH DOMEIN · BEVEILIGDE POORT';
    if (v2 && heeftProfiel) {
      return (
        <section className='tech-poort tech-poort-stil mq-tech-poort' data-tech-poort='1' data-tech-poort-soort='stil'>
          <div className='mq-tech-poort-boven'>
            <span className='mq-tech-poort-lijn' aria-hidden='true' />
            <span>{bovenTekst}</span>
          </div>
          <div className='mq-tech-poort-stil-kern'>
            <span className='mq-tech-poort-medaillon' aria-hidden='true'>
              <ShieldCheck aria-hidden='true' />
            </span>
            <div className='mq-tech-poort-stil-tekst'>
              <p>{uk ? 'Ця сторінка відкривається в технічному просторі.' : 'Deze pagina opent in de technische ruimte.'}</p>
              {fout ? <small role='alert' className='tech-poort-fout'>{fout}</small> : null}
            </div>
            <button type='button' className='tech-poort-naar' onClick={() => void naarTech()} disabled={bezig} aria-busy={bezig || undefined} data-tech-poort='naar-technisch'>
              <ShieldCheck aria-hidden='true' />{bezig ? (uk ? 'Перемикаю…' : 'Wisselen…') : (uk ? 'Перейти в технічний простір' : 'Naar de technische ruimte')}
            </button>
          </div>
        </section>
      );
    }
    return (
      <section className='tech-poort mq-tech-poort mq-tech-poort-vol' data-tech-poort='1'>
        <div className='mq-tech-poort-inhoud'>
          <div className='mq-tech-poort-boven'>
            <span className='mq-tech-poort-lijn' aria-hidden='true' />
            <span>{bovenTekst}</span>
          </div>
          <h1>{uk ? 'Управління сайтом' : 'Beheer van de site'}</h1>
          <p>{uk
            ? 'Ця сторінка стосується управління сайтом, а не вашого облікового запису. Вона відкривається лише в технічному профілі цієї вкладки; у меню облікового запису її немає.'
            : 'Deze pagina gaat over het beheer van de site, niet over uw account. Ze opent alleen in het technisch profiel van dit tabblad; in het accountmenu staat ze niet.'}</p>
          {!heeftProfiel ? <p className='mq-tech-poort-geen' data-tech-poort='geen-profiel'>{uk ? 'У вас немає технічного профілю; його дає власник сайту.' : 'U hebt geen technisch profiel; de eigenaar van de site geeft dat.'}</p> : null}
          <div className='tech-poort-knoppen'>
            {heeftProfiel ? <button type='button' className='is-hoofd' onClick={() => openTechVenster('activeren')} data-tech-poort='activeren'>{uk ? 'Увімкнути технічний профіль' : 'Technisch profiel aanzetten'}</button> : null}
            <button type='button' className={heeftProfiel ? undefined : 'is-hoofd'} onClick={onAccount} data-tech-poort='account'>{uk ? 'До облікового запису' : 'Naar het account'}</button>
          </div>
        </div>
        <div className='mq-tech-poort-kunst' aria-hidden='true'>
          <MaquetteKunst soort='admin' variant='kaart' lang={lang} />
        </div>
      </section>
    );
  }

  // 28.10.2026 (Pavlo): met twee ruimtes (vlag tech-ruimtes-v2) geen oud vraagvenster «Управління сайтом» met twee grote knoppen meer.
  // Eén rustige regel en één knop die naar de technische ruimte wisselt (zelfde weg als het menu en Ctrl+Alt+2).
  if (v2 && heeftProfiel) {
    return (
      <section className='tech-poort tech-poort-stil' data-tech-poort='1' data-tech-poort-soort='stil'>
        <p>{uk ? 'Ця сторінка відкривається в технічному просторі.' : 'Deze pagina opent in de technische ruimte.'}</p>
        <button type='button' className='tech-poort-naar' onClick={() => void naarTech()} disabled={bezig} aria-busy={bezig || undefined} data-tech-poort='naar-technisch'>
          <ShieldCheck aria-hidden='true' />{bezig ? (uk ? 'Перемикаю…' : 'Wisselen…') : (uk ? 'Перейти в технічний простір' : 'Naar de technische ruimte')}
        </button>
        {fout ? <small role='alert' className='tech-poort-fout'>{fout}</small> : null}
      </section>
    );
  }
  return (
    <section className='tech-poort' data-tech-poort='1'>
      <h1>{uk ? 'Управління сайтом' : 'Beheer van de site'}</h1>
      <p>{uk
        ? 'Ця сторінка стосується управління сайтом, а не вашого облікового запису. Вона відкривається лише в технічному профілі цієї вкладки; у меню облікового запису її немає.'
        : 'Deze pagina gaat over het beheer van de site, niet over uw account. Ze opent alleen in het technisch profiel van dit tabblad; in het accountmenu staat ze niet.'}</p>
      {!heeftProfiel ? <p data-tech-poort='geen-profiel'>{uk ? 'У вас немає технічного профілю; його дає власник сайту.' : 'U hebt geen technisch profiel; de eigenaar van de site geeft dat.'}</p> : null}
      <div className='tech-poort-knoppen'>
        {heeftProfiel ? <button type='button' className='is-hoofd' onClick={() => openTechVenster('activeren')} data-tech-poort='activeren'>{uk ? 'Увімкнути технічний профіль' : 'Technisch profiel aanzetten'}</button> : null}
        <button type='button' className={heeftProfiel ? undefined : 'is-hoofd'} onClick={onAccount} data-tech-poort='account'>{uk ? 'До облікового запису' : 'Naar het account'}</button>
      </div>
    </section>
  );
}
