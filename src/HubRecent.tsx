// Hub → tabblad «Останні» (HUB-03, 19.10.2026): eigen inhoud in plaats van een kopie van «Огляд».
//  - «Останні відкриті розділи»: per dienst de laatst bezochte pagina (shared-preferences: lastPathByService, dezelfde bron als het menu);
//  - «Останні події»: wat de AI en uw apparaten recent deden — één verzoek bij openen (POST /api/owner/agents/activity, geen polling;
//    het meldingencentrum pollt al). Zonder sessie of recht: alleen de eerste lijst.
import { useEffect, useState } from 'react';
import { Activity, Clock, ExternalLink } from 'lucide-react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { publicServiceIds, sessieDienst, type CanonicalLang } from './canoniek-navigatie';
import { canonicalServiceUrl, type CanonicalService } from './canoniek-dienst';
import { lastPathForService, rememberedTabForPath } from './gedeelde-voorkeuren';
import { activityLink, activityTitle, durationText, statusInfo, type ActivityEvent } from './connector-activiteit';
import { useIsMaquette } from './thema/useThema';
import './hub-recent.css';

type Lang = CanonicalLang;
const NAAM: Record<string, [string, string]> = {
  ai: ['ШІ для вас', 'AI voor u'], mail: ['Пошта', 'E-mail'], cloud: ['Хмарне сховище', 'Cloudopslag'], github: ['GitHub та код', 'GitHub en code'],
  huis: ['Розумний будинок', 'Slim huis'], mcp: ['Міст ШІ → сайт', 'Brug AI → site'],
};

/** Zuiver: diensten met een onthouden pad (hub zelf niet). */
export function recenteDiensten(lees: (s: CanonicalService) => string = lastPathForService): Array<{ service: CanonicalService; path: string; tab: string }> {
  return (publicServiceIds as readonly CanonicalService[]).filter((s) => s !== 'hub').map((s) => ({ service: s, path: lees(s) })).filter((x) => !!x.path).map((x) => ({ ...x, tab: rememberedTabForPath(x.service, x.path) }));
}

export default function HubRecent({ lang }: { lang: Lang }) {
  const uk = lang === 'uk';
  const isMaquette = useIsMaquette();
  const diensten = recenteDiensten();
  const [events, setEvents] = useState<ActivityEvent[] | null | 'geen'>(null);
  useEffect(() => {
    let actief = true;
    api.post('/api/owner/agents/activity', { service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin })
      .then((r) => { if (actief) setEvents(((r.data?.events ?? []) as ActivityEvent[]).slice(0, 25)); })
      .catch(() => { if (actief) setEvents('geen'); });
    return () => { actief = false; };
  }, []);
  return (
    <div className={`hub-recent${isMaquette ? ' is-maquette' : ''}`} data-hub-recent='1' data-mq-dienst={isMaquette ? 'hub' : undefined}>
      <section className='hub-recent-kaart' data-hub-recent-sectie='diensten' aria-labelledby='hub-recent-diensten'>
        <h2 id='hub-recent-diensten'><Clock aria-hidden='true' /> {uk ? 'Останні відкриті розділи' : 'Laatst geopende onderdelen'}</h2>
        {diensten.length ? (
          <ul className='hub-recent-lijst' data-hub-recent-diensten={diensten.length}>
            {diensten.map((d) => (
              <li key={d.service} data-recent-dienst={d.service}><a href={canonicalServiceUrl(d.service, d.tab, lang, true)}><b>{NAAM[d.service] ? (uk ? NAAM[d.service][0] : NAAM[d.service][1]) : d.service}</b><small>{d.path}</small><ExternalLink size={14} aria-hidden='true' /></a></li>
            ))}
          </ul>
        ) : <p className='hub-recent-leeg'>{uk ? 'Ви ще не відкривали інші розділи в цьому браузері. Оберіть розділ у меню ліворуч — він з’явиться тут.' : 'U hebt in deze browser nog geen andere onderdelen geopend. Kies een onderdeel in het menu links; het verschijnt dan hier.'}</p>}
      </section>
      <section className='hub-recent-kaart' data-hub-recent-sectie='events' aria-labelledby='hub-recent-events'>
        <h2 id='hub-recent-events'><Activity aria-hidden='true' /> {uk ? 'Останні події' : 'Recente gebeurtenissen'}</h2>
        {events === null ? <p className='hub-recent-leeg'>{uk ? 'Завантаження…' : 'Laden…'}</p>
          : events === 'geen' ? <p className='hub-recent-leeg'>{uk ? 'Події недоступні (немає входу або прав).' : 'Gebeurtenissen niet beschikbaar (geen aanmelding of recht).'}</p>
          : !events.length ? <p className='hub-recent-leeg'>{uk ? 'Поки що подій немає. Коли ШІ чи ваші пристрої щось зроблять, це з’явиться тут.' : 'Nog geen gebeurtenissen. Zodra de AI of uw apparaten iets doen, verschijnt het hier.'}</p>
          : (
            <ul className='hub-recent-lijst' data-hub-recent-events={events.length}>
              {events.map((e) => { const st = statusInfo(e.status, lang); const link = activityLink(e, lang); return (
                <li key={e.id} data-status-groep={st.group}>
                  <span className='hub-recent-tekst'><b>{activityTitle(e, lang)}</b><small>{st.text} · {durationText(e, lang)}{e.createdAt ? ` · ${new Date(e.createdAt).toLocaleString(uk ? 'uk-UA' : 'nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</small></span>
                  {link.href ? <a href={link.href}>{link.label}</a> : null}
                </li>
              ); })}
            </ul>
          )}
      </section>
    </div>
  );
}
