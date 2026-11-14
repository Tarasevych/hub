// Verbindingen via de MCP-deur van de server (/Grok, /claude, …; OAuth van de deur, intrekbaar). De deur is sitebeheer en dus de
// TECHNISCHE ruimte: deze lijst staat op mcp.*/verbindingen (technisch profiel), niet meer op de accountpagina Agenten.
import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agenten-gegevens';
import { Logo, type Tr } from '../mcp-ui';
import { aiLogo } from './gegevens';
import { Badge, datum, exact, gebruiktBinnen, GevaarKnop, Melding, Rij, Tech, useActies } from './ui';
import { duur as duurVan } from '../../shared/ai-verbinding';
import './agenten-toegang-maquette.css';

export type DeurVerbinding = { id: string; klant: string; deur: string; duur: string; aangemaakt: number; laatst: number; accessTot: number; refreshTot: number; wie: { id: string; email: string } | null; via: string };

/** Laadt de deurverbindingen (alleen de eigenaar met actief technisch profiel; anderen krijgen 403 en zien niets). */
export function useDeurVerbindingen() {
  const [deur, setDeur] = useState<{ lijst: DeurVerbinding[] | null; fout: string; uit?: boolean }>({ lijst: null, fout: '' });
  const laad = useCallback(async () => {
    try { const r = await api.post('/api/owner/mcp-connector/deur/verbindingen', { ...sessionBody(), ruimte: 'technisch' }); setDeur({ lijst: (r.data?.verbindingen ?? []) as DeurVerbinding[], fout: '', uit: r.data?.beschikbaar === false }); }
    catch (e) { const code = String((e as Error)?.message || ''); setDeur({ lijst: null, fout: /OWNER|SESSION|403|TECH_PROFIEL/.test(code) ? '' : code }); }
  }, []);
  useEffect(() => { void laad(); }, [laad]);
  return { ...deur, laad };
}

export default function DeurVerbindingen({ tr, item, kies, deur, naActie }: { tr: Tr; item: string; kies: (id: string) => void; deur: ReturnType<typeof useDeurVerbindingen>; naActie?: () => Promise<void> }) {
  const acties = useActies(tr);
  const intrekken = (v: DeurVerbinding) => acties.voerUit(`deur:${v.id}`, async () => {
    await api.post('/api/owner/mcp-connector/deur/intrekken', { ...sessionBody(), id: v.id, ruimte: 'technisch' });
    await deur.laad(); await naActie?.();
    return tr(`Доступ «${v.klant}» до дверей ${v.deur ? `/${v.deur}` : ''} відкликано о ${exact(Date.now())}.`, `Toegang «${v.klant}» tot de deur ${v.deur ? `/${v.deur}` : ''} ingetrokken om ${exact(Date.now())}.`);
  }, ['Не вдалося відкликати доступ', 'Toegang intrekken mislukt']);
  if (deur.lijst === null && !deur.fout) return null;
  return (
    <div className='ag-deur-verbindingen' data-lijst='deur-verbindingen'>
      <Melding uitkomst={acties.uitkomst} tr={tr} onSluit={() => acties.setUitkomst(null)} />
      <div className='ag-lijstkop'><p className='ag-lijstkop-tekst'>{deur.uit ? tr('Двері сервера (/Grok, /claude…) на цьому сервері зараз не працюють — служба mijn-ruimte-mcp не запущена.', 'De serverdeur (/Grok, /claude…) draait nu niet op deze server — de dienst mijn-ruimte-mcp is niet gestart.') : deur.fout ? tr(`Двері не відповідають (${deur.fout}). Перевірте службу mijn-ruimte-mcp.`, `De deur antwoordt niet (${deur.fout}). Controleer de dienst mijn-ruimte-mcp.`) : deur.lijst?.length ? tr(`Доступи через двері сервера: ${deur.lijst.length}`, `Toegang via de serverdeur: ${deur.lijst.length}`) : tr('Доступів через двері сервера немає.', 'Geen toegang via de serverdeur.')}</p></div>
      {deur.lijst?.length ? <ul className='ag-lijst'>{deur.lijst.map((v) => {
        const sleutel = `deur:${v.id}`;
        const onbeperkt = v.refreshTot - Date.now() > 50 * 365 * 86_400_000;
        return (
          <Rij key={v.id} id={sleutel} open={item === sleutel} onToggle={() => kies(item === sleutel ? '' : sleutel)} data={{ deurverbinding: v.id }}
            logo={<Logo kind={aiLogo(v.klant) === 'aiclient' ? 'key' : aiLogo(v.klant)} size={30} label={v.klant} />} titel={v.klant}
            badges={<Badge toon='info' data='deur'>{v.deur ? `/${v.deur}` : tr('усі двері', 'alle deuren')}</Badge>}
            status={<>{gebruiktBinnen(v.laatst || null, tr)} · {tr(duurVan(v.duur).uk, duurVan(v.duur).nl)} · {onbeperkt ? tr('до відкликання', 'tot intrekken') : tr(`діє до ${datum(v.refreshTot)}`, `geldig tot ${datum(v.refreshTot)}`)}</>}
            acties={<GevaarKnop tr={tr} sleutel={sleutel} label={tr('Відкликати', 'Intrekken')} ja={tr('Так, відкликати', 'Ja, intrekken')} acties={acties} icoon={<Trash2 />} klein vraag={tr(`«${v.klant}» одразу втратить доступ до дверей.`, `«${v.klant}» verliest meteen de toegang tot de deur.`)} onJa={() => void intrekken(v)} />}>
            <Tech rijen={[
              [tr('ID доступу', 'Toegangs-id'), <code>{v.id}</code>], [tr('Двері', 'Deur'), <code>{v.deur ? `/${v.deur}` : '—'}</code>],
              [tr('Хто дозволив', 'Toegestaan door'), v.wie?.email || (v.via === 'deurtoken' ? tr('токен дверей (вручну)', 'deurtoken (handmatig)') : '—')],
              [tr('Термін', 'Duur'), tr(duurVan(v.duur).uk, duurVan(v.duur).nl)], [tr('Створено', 'Gemaakt'), exact(v.aangemaakt)], [tr('Остання активність', 'Laatste activiteit'), exact(v.laatst || null)],
              [tr('Токен доступу діє до', 'Toegangstoken geldig tot'), v.accessTot - Date.now() > 50 * 365 * 86_400_000 ? tr('до відкликання', 'tot intrekken') : exact(v.accessTot)],
            ]} />
          </Rij>
        );
      })}</ul> : null}
    </div>
  );
}
