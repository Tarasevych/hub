// Технічна поверхня: доступність ШІ для всього сайту. Не дошка користувача.
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import { sessionBody } from '../agents-data';
import { BORD_AGENTEN, PRIVE_CAPS, SITE_REGEL, type SiteStaat } from '../../shared/ai-agent-bord';
import type { Tr } from '../mcp-ui';
import { foutTekst } from './fouten';

type Rij = { sleutel: string; naam: string; groep: string; aan: boolean };

function rijenVan(staat: SiteStaat | null): Rij[] {
  const aan = (sleutel: string, standaard = true) => {
    if (!staat) return standaard;
    if (sleutel.startsWith('agent:')) return staat.agent[sleutel.slice(6) as 'claude'] !== false;
    if (sleutel.startsWith('methode:')) return staat.methode[sleutel.slice(8) as 'mcp'] !== false;
    return staat.cap[sleutel.slice(4)] !== false;
  };
  return [
    ...BORD_AGENTEN.map((a) => ({ sleutel: `agent:${a.id}`, naam: a.naam, groep: 'ШІ', aan: aan(`agent:${a.id}`) })),
    { sleutel: 'methode:mcp', naam: 'MCP', groep: 'Способи', aan: aan('methode:mcp') },
    { sleutel: 'methode:token', naam: 'Токен консолі', groep: 'Способи', aan: aan('methode:token') },
    ...PRIVE_CAPS.map((c) => ({ sleutel: `cap:${c.id}`, naam: c.label, groep: c.group, aan: aan(`cap:${c.id}`) })),
  ];
}

export default function SiteSchakelaars({ tr }: { tr: Tr }) {
  const [staat, setStaat] = useState<SiteStaat | null>(null);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState('');
  const rijen = rijenVan(staat);
  const groepen = [...new Set(rijen.map((r) => r.groep))];

  useEffect(() => {
    let actief = true;
    api.post('/api/owner/ai-site-schakelaars', sessionBody('mcp'))
      .then((r) => { if (actief && r.data?.staat) setStaat(r.data.staat as SiteStaat); })
      .catch((e) => { if (actief) setFout(foutTekst(e, tr, ['Не вдалося прочитати перемикачі сайту', 'Siteschakelaars laden mislukt'])); });
    return () => { actief = false; };
  }, [tr]);

  const zet = (sleutel: string, aan: boolean) => {
    if (!staat) return;
    setBezig(sleutel);
    setFout('');
    api.post('/api/owner/ai-site-schakelaars/zet', { ...sessionBody('mcp'), sleutel, aan })
      .then((r) => { if (r.data?.staat) setStaat(r.data.staat as SiteStaat); })
      .catch((e) => setFout(foutTekst(e, tr, ['Не вдалося зберегти', 'Opslaan mislukt'])))
      .finally(() => setBezig(''));
  };

  return (
    <section className='ag-kaart ag-site' data-site-schakelaars='1'>
      <div className='ag-kaart-kop'><h3>{tr('Доступність для всіх на сайті', 'Beschikbaarheid voor iedereen op de site')}</h3></div>
      <p className='ag-site-regel' data-site-regel='1'>{tr(SITE_REGEL.uk, SITE_REGEL.nl)}</p>
      <p>{tr('Ці перемикачі керують лише приватними підключеннями людей. Технічний простір сайту вони не закривають і не відкривають.', 'Deze schakelaars gelden alleen voor privéverbindingen van mensen. De technische ruimte van de site sluiten of openen ze niet.')}</p>
      {fout ? <p className='ag-melding ag-melding-fout' role='alert'>{fout}</p> : null}
      {groepen.map((groep) => (
        <fieldset key={groep} className='ag-bord-groep'>
          <legend>{groep}</legend>
          {rijen.filter((r) => r.groep === groep).map((r) => (
            <label key={r.sleutel} className='ag-bord-cap' data-site-sleutel={r.sleutel}>
              <input type='checkbox' checked={r.aan} disabled={staat === null || bezig === r.sleutel} onChange={(e) => zet(r.sleutel, e.target.checked)} />
              <span>{r.naam}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </section>
  );
}
