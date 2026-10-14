// «Токени й двері»: AI koppelen (automatisch in één klik of handmatig met een token, zie AiVerbinden.tsx), agenttokens als rijen,
// verbindingen via de MCP-deur (OAuth van de deur, intrekbaar). De schakelaars van de deur (root-bestand op de server) zijn sitebeheer:
// zie DeurSchakelaars op mcp.*/dashboard (technisch profiel), niet hier in de accountruimte.
import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agents-data';
import { Logo, type Tr } from '../mcp-ui';
import { aiLogo, isoMs, type DeurToken } from './data';
import { Badge, datum, exact, gebruiktBinnen, GevaarKnop, Groep, Melding, Rij, Tech, useActies } from './ui';
import AiVerbinden from './AiVerbinden';
import { duur as duurVan } from '../../shared/ai-verbinding';

type DeurVerbinding = { id: string; klant: string; deur: string; duur: string; aangemaakt: number; laatst: number; accessTot: number; refreshTot: number; wie: { id: string; email: string } | null; via: string };

type Data = { tokens: DeurToken[]; rechten: Record<string, boolean>; catalogus: Array<{ id: string; uk: string; nl: string; group?: string }>; bestand: string };

export default function TabTokens({ tr, data, naActie, item, kies }: { tr: Tr; data: Data | null; naActie: () => Promise<void>; item: string; kies: (id: string) => void }) {
  const acties = useActies(tr);
  const mag = !data || data.rechten.tokens !== false;
  // Verbindingen via de MCP-deur (alleen de eigenaar van de server ziet ze; anderen krijgen 403 en zien de lijst niet).
  const [deur, setDeur] = useState<{ lijst: DeurVerbinding[] | null; fout: string; uit?: boolean }>({ lijst: null, fout: '' });
  const laadDeur = useCallback(async () => {
    try { const r = await api.post('/api/owner/mcp-connector/deur/verbindingen', sessionBody()); setDeur({ lijst: (r.data?.verbindingen ?? []) as DeurVerbinding[], fout: '', uit: r.data?.beschikbaar === false }); }
    catch (e) { const code = String((e as Error)?.message || ''); setDeur({ lijst: null, fout: /OWNER|SESSION|403/.test(code) ? '' : code }); }
  }, []);
  useEffect(() => { void laadDeur(); }, [laadDeur]);
  const naKoppelen = useCallback(async () => { await Promise.all([naActie(), laadDeur()]); }, [naActie, laadDeur]);
  const deurIntrekken = (v: DeurVerbinding) => acties.voerUit(`deur:${v.id}`, async () => {
    await api.post('/api/owner/mcp-connector/deur/intrekken', { ...sessionBody(), id: v.id });
    await laadDeur();
    return tr(`Доступ «${v.klant}» до дверей ${v.deur ? `/${v.deur}` : ''} відкликано о ${exact(Date.now())}.`, `Toegang «${v.klant}» tot de deur ${v.deur ? `/${v.deur}` : ''} ingetrokken om ${exact(Date.now())}.`);
  }, ['Не вдалося відкликати доступ', 'Toegang intrekken mislukt']);
  const nu = Date.now();
  const actief = (data?.tokens ?? []).filter((t) => !t.revokedAt && (isoMs(t.expiresAt) ?? 0) > nu);
  const weg = (data?.tokens ?? []).filter((t) => !actief.includes(t));

  const intrekken = (t: DeurToken) => acties.voerUit(`tok:${t.id}`, async () => {
    await api.post('/api/mcp/tokens/revoke', { ...sessionBody(), id: t.id });
    await naActie();
    return tr(`Токен «${t.name}» відкликано о ${exact(Date.now())}. Агент із ним більше не пройде двері; рядок перенесено до «Відкликані».`, `Token «${t.name}» ingetrokken om ${exact(Date.now())}. Een agent ermee komt niet meer door de deur; de rij staat nu bij "Ingetrokken".`);
  }, ['Не вдалося відкликати токен', 'Token intrekken mislukt']);

  const rij = (t: DeurToken, historisch = false) => {
    const sleutel = `tok:${t.id}`;
    const logo = aiLogo(t.name);
    return (
      <Rij key={t.id} id={sleutel} open={item === sleutel} onToggle={() => kies(item === sleutel ? '' : sleutel)} gedimd={historisch} data={{ token: t.id, status: historisch ? 'ingetrokken' : 'actief' }}
        logo={<Logo kind={logo === 'aiclient' ? 'key' : logo} size={30} label={t.name} />} titel={t.name}
        badges={historisch ? <Badge toon='bad' data='historie'>{t.revokedAt ? tr('Відкликано', 'Ingetrokken') : tr('Закінчився', 'Verlopen')}</Badge> : null}
        status={historisch
          ? <>{t.revokedAt ? tr(`Відкликано ${datum(isoMs(t.revokedAt))}`, `Ingetrokken op ${datum(isoMs(t.revokedAt))}`) : tr(`Закінчився ${datum(isoMs(t.expiresAt))}`, `Verlopen op ${datum(isoMs(t.expiresAt))}`)} · <code>{t.prefix}…</code></>
          : <>{gebruiktBinnen(isoMs(t.lastSeenAt), tr)} · <code>{t.prefix}…</code> · {tr(`викликів: ${t.calls}`, `aanroepen: ${t.calls}`)} · {tr(`діє до ${datum(isoMs(t.expiresAt))}`, `geldig tot ${datum(isoMs(t.expiresAt))}`)}</>}
        acties={historisch ? undefined : <GevaarKnop tr={tr} sleutel={sleutel} label={tr('Відкликати', 'Intrekken')} ja={tr('Так, відкликати', 'Ja, intrekken')} acties={acties} icoon={<Trash2 />} klein vraag={tr(`Агент із токеном «${t.name}» одразу втратить доступ.`, `Een agent met token «${t.name}» verliest meteen de toegang.`)} onJa={() => void intrekken(t)} />}>
        <Tech rijen={[
          [tr('ID токена', 'Token-id'), <code>{t.id}</code>], [tr('Префікс', 'Voorvoegsel'), <code>{t.prefix}…</code>],
          [tr('Дозволи', 'Rechten'), <code>{Array.isArray(t.scopes) ? t.scopes.join(' ') : String(t.scopes ?? '—')}</code>],
          [tr('Викликів', 'Aanroepen'), String(t.calls)], [tr('Створено', 'Gemaakt'), exact(isoMs(t.createdAt))], [tr('Остання активність', 'Laatste activiteit'), exact(isoMs(t.lastSeenAt))],
          [tr('Діє до', 'Geldig tot'), exact(isoMs(t.expiresAt))], t.revokedAt ? [tr('Відкликано', 'Ingetrokken'), exact(isoMs(t.revokedAt))] : null,
          [tr('Як користуватися', 'Gebruik'), <code>Authorization: Bearer {t.prefix}…</code>],
        ]} />
      </Rij>
    );
  };

  return (
    <div className='ag-tab' data-tab-inhoud='tokens'>
      <AiVerbinden tr={tr} magTokens={mag} naActie={naKoppelen} />
      <Melding uitkomst={acties.uitkomst} tr={tr} onSluit={() => acties.setUitkomst(null)} />
      <div className='ag-lijstkop'><p className='ag-lijstkop-tekst'>{actief.length ? tr(`Активних токенів: ${actief.length}`, `Actieve tokens: ${actief.length}`) : tr('Активних токенів немає.', 'Geen actieve tokens.')}</p></div>
      {data === null ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : actief.length ? <ul className='ag-lijst' data-lijst='tokens'>{actief.map((t) => rij(t))}</ul> : null}
      <Groep titel={tr('Відкликані й завершені', 'Ingetrokken en verlopen')} aantal={weg.length} data='tokens-historie'>{weg.map((t) => rij(t, true))}</Groep>

      {deur.lijst !== null || deur.fout ? (
        <div className='ag-deur-verbindingen' data-lijst='deur-verbindingen'>
          <div className='ag-lijstkop'><p className='ag-lijstkop-tekst'>{deur.uit ? tr('Двері сервера (/Grok, /claude…) на цьому сервері зараз не працюють — служба mijn-ruimte-mcp не запущена.', 'De serverdeur (/Grok, /claude…) draait nu niet op deze server — de dienst mijn-ruimte-mcp is niet gestart.') : deur.fout ? tr(`Двері не відповідають (${deur.fout}). Перевірте службу mijn-ruimte-mcp.`, `De deur antwoordt niet (${deur.fout}). Controleer de dienst mijn-ruimte-mcp.`) : deur.lijst?.length ? tr(`Доступи через двері: ${deur.lijst.length}`, `Toegang via de deur: ${deur.lijst.length}`) : tr('Доступів через двері немає.', 'Geen toegang via de deur.')}</p></div>
          {deur.lijst?.length ? <ul className='ag-lijst'>{deur.lijst.map((v) => {
            const sleutel = `deur:${v.id}`;
            const onbeperkt = v.refreshTot - Date.now() > 50 * 365 * 86_400_000;
            return (
              <Rij key={v.id} id={sleutel} open={item === sleutel} onToggle={() => kies(item === sleutel ? '' : sleutel)} data={{ deurverbinding: v.id }}
                logo={<Logo kind={aiLogo(v.klant) === 'aiclient' ? 'key' : aiLogo(v.klant)} size={30} label={v.klant} />} titel={v.klant}
                badges={<Badge toon='info' data='deur'>{v.deur ? `/${v.deur}` : tr('усі двері', 'alle deuren')}</Badge>}
                status={<>{gebruiktBinnen(v.laatst || null, tr)} · {tr(duurVan(v.duur).uk, duurVan(v.duur).nl)} · {onbeperkt ? tr('до відкликання', 'tot intrekken') : tr(`діє до ${datum(v.refreshTot)}`, `geldig tot ${datum(v.refreshTot)}`)}</>}
                acties={<GevaarKnop tr={tr} sleutel={sleutel} label={tr('Відкликати', 'Intrekken')} ja={tr('Так, відкликати', 'Ja, intrekken')} acties={acties} icoon={<Trash2 />} klein vraag={tr(`«${v.klant}» одразу втратить доступ до дверей.`, `«${v.klant}» verliest meteen de toegang tot de deur.`)} onJa={() => void deurIntrekken(v)} />}>
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
      ) : null}

    </div>
  );
}
