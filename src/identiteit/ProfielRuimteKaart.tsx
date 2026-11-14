// IDENTITEIT-015 (крок «vormgeving»): справжній перемикач «Технічний простір» прямо в картці «Активний профіль» вигляду «Макет».
// Раніше кнопка «Справжнє налаштування» мала порожню ціль і відкривала лише чотири картки переходів. Тепер у картці той самий
// тумблер, що й у меню облікового запису (RuimteWissel: права перевіряє сервер, без дозволу — пояснення «Немає дозволу…»), а коли
// перемикання вимкнене на сайті — точна передумова: що й де вмикає власник.
// De echte schakelaar «Technische ruimte» in de kaart «Actief profiel»; zonder vlag de exacte voorwaarde.
import { lazy, Suspense, useEffect } from 'react';
import { useRuimtesV2 } from '../tech/ruimtes/ruimtes-vlag';
import { startRuimtes, useRuimtes } from '../tech/ruimtes/ruimtes-opslag';

const RuimteWissel = lazy(() => import('../tech/ruimtes/RuimteWissel'));

export function ProfielRuimteKaart({ lang }: { lang: 'uk' | 'nl' }) {
  const v2 = useRuimtesV2();
  useEffect(() => { if (v2) startRuimtes(); }, [v2]);
  const r = useRuimtes();
  const uk = lang === 'uk';
  if (!v2 || (r.status && !r.status.aan)) {
    return <p className='mq-echt-noot' data-profiel-ruimte='uit'>{uk
      ? 'Перемикання «Звичайний / Технічний простір» на сайті вимкнене. Його вмикає власник сайту: технічний профіль → «Перемикачі функцій» → «Два простори одного акаунта (нова версія)» (tech-ruimtes-v2). До того ви завжди у звичайному просторі.'
      : 'Wisselen tussen gewone en technische ruimte staat uit op de site. De eigenaar zet het aan: technisch profiel → «Functieschakelaars» → «Twee ruimtes van één account (nieuwe versie)» (tech-ruimtes-v2). Tot dan bent u altijd in de gewone ruimte.'}</p>;
  }
  if (!r.geladen) return <p className='mq-echt-noot' role='status' data-profiel-ruimte='laden'>{uk ? 'Перевіряю стан простору…' : 'Stand van de ruimte controleren…'}</p>;
  if (!r.status) {
    return <p className='mq-echt-noot' data-profiel-ruimte='geen'>{uk
      ? 'Стан простору зараз недоступний: потрібен схвалений вхід у цьому браузері. Оновіть сторінку після входу.'
      : 'De stand van de ruimte is nu niet beschikbaar: een goedgekeurde aanmelding in deze browser is nodig. Vernieuw de pagina na het aanmelden.'}</p>;
  }
  return <div data-profiel-ruimte='aan'><Suspense fallback={null}><RuimteWissel taal={lang} /></Suspense></div>;
}
