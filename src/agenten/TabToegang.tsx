// «Доступи» (hub «Підключення ШІ», mcp.*/agents, tab-id 'toegang'; contract 0.6 §3/§4).
//  - «Мої доступи»: voor iedereen — alles wat de gebruiker zelf aan AI's gaf (connectors, tokens, pc-agenten, browserextensie per slot,
//    lokale agent) met Відкликати / Продовжити / Обмежити (toegang/MijnToegang.tsx).
//  - «Усі користувачі»: ALLEEN voor de eigenaar of een lopende technische activering met users.manage. Voor ieder ander wordt dit
//    onderdeel niet gerenderd (niet verborgen, niet geladen); de server weigert de route bovendien met 403 (toegang/AlleGebruikers.tsx).
import type { Tr } from '../mcp-ui';
import HulpVraag from '../hulp/HulpVraag';
import { techActief, techMag, useTech } from '../tech/tech-opslag';
import { useExtensieLiveToestand } from '../extensie/extensie-live';
import MijnToegang from './toegang/MijnToegang';
import AlleGebruikers from './toegang/AlleGebruikers';
import './toegang/toegang.css';

export default function TabToegang({ tr }: { tr: Tr }) {
  const t = useTech();
  const uk = tr('uk', 'nl') === 'uk';
  // HUB-09: de server zegt of deze sessie «Усі користувачі» mag (extensie-status.beheer: eigenaar — ook zonder activering — of een
  // lopende activering met users.manage); zonder serverantwoord valt het terug op de activering in dit tabblad.
  const live = useExtensieLiveToestand();
  const serverBeheer = (live.antwoord as { beheer?: unknown } | null)?.beheer;
  const beheer = typeof serverBeheer === 'boolean' ? serverBeheer : techMag('users.manage', t);
  // Eigenaar = rol 'eigenaar' in de lopende activering, of beheer zonder activering (dat kan alleen de eigenaar zijn).
  const ikEigenaar = beheer && (!!t.activatie?.rollen.includes('eigenaar') || !techActief(t));
  return (
    <div className='ag-tab tg' data-tab-inhoud='toegang'>
      <header className='tg-kop'>
        <h2>{tr('Доступи', 'Toegang')} <HulpVraag k='toegang.overzicht' uk={uk} label={tr('Доступи', 'Toegang')} /></h2>
        <p>{tr(
          'Тут зібрано все, що ви дозволили ШІ: конектори, токени, пристрої, розширення браузера й локальний агент — що саме, де і до коли. Будь-що можна одразу відкликати, а продовжити чи звузити — лише з повторним підтвердженням.',
          'Hier staat alles wat u de AI toestond: connectors, tokens, apparaten, de browserextensie en de lokale agent — wat precies, waar en tot wanneer. Alles kunt u meteen intrekken; verlengen of beperken gaat alleen met een nieuwe bevestiging.',
        )}</p>
      </header>
      <MijnToegang tr={tr} />
      {beheer ? <AlleGebruikers tr={tr} ikEigenaar={ikEigenaar} /> : null}
    </div>
  );
}
