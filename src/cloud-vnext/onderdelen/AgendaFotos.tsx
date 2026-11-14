// Agenda en Foto's binnen cloud vNext: HERGEBRUIK van de bestaande, werkende Google-weergaven (geen tweede implementatie;
// de bron blijft src/GoogleSuiteMediaWeergave.tsx). Uitvoerder D verfijnde alleen de schil, eerlijk:
//   • de dienststatus komt uit de ECHTE bootstrap (onboarding.services: calendar/photos, veld granted) — niet uit een
//     verzonnen veld; staat er niets, dan is de dienst niet gekoppeld en zeggen we dat;
//   • niet gekoppeld → eigen lege staat met één knop naar het integratiecentrum (geen dode «koppelen»-knop die niets doet);
//   • gekoppeld → exact dezelfde weergaven als op de oude pagina, in een .cvn-blok, met de hint dat dit dezelfde
//     Google-gegevens zijn en dat de koppeling in «Інтеграції» wordt beheerd.
import { useEffect, useState } from 'react';
import { CalendarDays, Images, Link2 } from 'lucide-react';
import { GoogleCalendarView, GooglePhotosView } from '../../GoogleSuiteMediaWeergave';
import { cloudClient } from '../cloud-client';
import { tr } from '../tekst';
import type { OnderdeelProps } from '../CloudPagina';
import '../../cloud-klassiek-maquette.css';

type Dienst = { id: string; status: string; granted: boolean; connectEnabled: boolean };
type Werkruimte = { id: string; title: string };
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const lijst = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** onboarding.services uit de bootstrap, tolerant gelezen: ontbrekende velden worden leeg, nooit verzonnen. */
function leesDiensten(boot: Record<string, unknown> | null): Dienst[] {
  return lijst(obj(boot?.onboarding).services).map(obj).filter((s) => typeof s.id === 'string' && s.id)
    .map((s) => ({ id: String(s.id), status: String(s.status || ''), granted: s.granted === true, connectEnabled: s.connectEnabled === true }));
}
function leesWerkruimtes(boot: Record<string, unknown> | null): Werkruimte[] {
  return lijst(boot?.workspaces).map(obj).filter((w) => typeof w.id === 'string' && w.id)
    .map((w) => ({ id: String(w.id), title: String(w.title || w.id) }));
}

export default function AgendaFotos({ lang, sourceOrigin, tabContext, naarTab, deel }: OnderdeelProps & { deel: 'calendar' | 'photos' }) {
  const [boot, setBoot] = useState<Record<string, unknown> | null>(null);
  const [stand, setStand] = useState<'laden' | 'klaar' | 'fout'>('laden');
  useEffect(() => {
    let actief = true;
    cloudClient.bootstrap()
      .then((d) => { if (actief) { setBoot(d); setStand('klaar'); } })
      .catch(() => { if (actief) setStand('fout'); });
    return () => { actief = false; };
  }, []);

  const Titel = deel === 'photos' ? Images : CalendarDays;
  const naam = deel === 'photos' ? tr(lang, 'Google Фото', 'Google Foto’s') : tr(lang, 'Google Календар', 'Google Agenda');
  if (stand === 'laden') return <p className='cvn-hint' role='status' aria-busy='true'>{tr(lang, 'Завантаження…', 'Laden…')}</p>;
  if (stand === 'fout') {
    return <p className='cvn-melding is-fout' role='alert'>{tr(lang, 'Не вдалося прочитати стан хмари. Оновіть сторінку або спробуйте пізніше.', 'De cloudstatus kon niet worden gelezen. Vernieuw de pagina of probeer het later.')}</p>;
  }

  const dienst = leesDiensten(boot).find((s) => s.id === (deel === 'photos' ? 'photos' : 'calendar')) || null;
  if (!dienst?.granted) {
    // Eerlijk: zonder verleende Google-toegang is hier niets te tonen; de koppeling zelf loopt via het integratiecentrum.
    return (
      <section className='cvn-leeg' data-cvn-google='niet-gekoppeld'>
        <Titel aria-hidden='true' />
        <p>{tr(lang, `${naam} не підключено.`, `${naam} is niet gekoppeld.`)}</p>
        <p className='cvn-hint'>{dienst?.status === 'waiting_previous_consent'
          ? tr(lang, 'Спочатку завершіть попередній крок Google у центрі інтеграцій.', 'Voltooi eerst de vorige Google-stap in het integratiecentrum.')
          : tr(lang, 'Підключення виконується один раз у центрі інтеграцій; після цього дані з’являться тут.', 'De koppeling gebeurt één keer in het integratiecentrum; daarna verschijnen de gegevens hier.')}</p>
        <button type='button' className='cvn-knop is-hoofd' onClick={() => naarTab('accounts')}><Link2 aria-hidden='true' />{tr(lang, 'Відкрити інтеграції', 'Integraties openen')}</button>
      </section>
    );
  }

  // Gekoppeld: dezelfde weergaven als op de oude cloudpagina; de klik op hun eigen «koppelen» (als de status ooit terugvalt)
  // leidt eerlijk naar het integratiecentrum in plaats van niets te doen.
  const naarIntegraties = () => naarTab('accounts');
  return (
    <section className='cvn-blok' data-cvn-google={deel}>
      <p className='cvn-hint'>
        {tr(lang, 'Ті самі дані Google, що й у хмарі досі; підключенням керують', 'Dezelfde Google-gegevens als elders in de cloud; de koppeling beheert u in')}{' '}
        <button type='button' className='cvn-knop is-klein' onClick={naarIntegraties}>{tr(lang, 'Інтеграції', 'Integraties')}</button>
      </p>
      {deel === 'photos'
        ? <GooglePhotosView lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext} service={dienst as never} onStart={naarIntegraties as never} workspaces={leesWerkruimtes(boot) as never} />
        : <GoogleCalendarView lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext} service={dienst as never} onStart={naarIntegraties as never} />}
    </section>
  );
}
