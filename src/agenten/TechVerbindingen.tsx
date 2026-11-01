// mcp.*/verbindingen — «Технічні підключення» (beheerpagina, alleen met actief technisch profiel): de AI-verbindingen van de
// TECHNISCHE ruimte (shared/ai-ruimte.ts). Hier koppelt de eigenaar een AI aan de serverdeur (/Grok, /claude, …) of aan de connector
// in de technische ruimte (releases, updates voorbereiden, serverstand), beheert hij technische agenttokens en ziet hij de agenten
// die op de server zelf draaien. Niets hiervan staat op de accountpagina Agenten (privéruimte), en omgekeerd staat hier niets van
// de gebruiker (mail, Drive, eigen pc of browser). Wie een technische verbinding updates mag laten voorbereiden, kiest de eigenaar
// op admin → Оновлення («Кому дозволено»); goedkeuren blijft altijd de eigenaar met zijn passkey.
import { useCallback, useMemo, useState } from 'react';
import { ArrowRight, Eye, KeyRound, Lock, Server, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody, useAgentsData } from '../agenten-gegevens';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import { Logo, type Tr } from '../mcp-ui';
import { RUIMTE_UITLEG } from '../../shared/ai-ruimte';
import AiVerbinden from './AiVerbinden';
import AiToegangTab from './AiToegangTab';
import ConnectorsTab from '../connector-v2/ConnectorsTab';
import SiteSchakelaars from './SiteSchakelaars';
import DeurVerbindingen, { useDeurVerbindingen } from './DeurVerbindingen';
import { aiEigenaar, aiLogo, inRuimte, isoMs, useDeurTokens, useOverzicht, type DeurToken, type OauthVerbinding } from './gegevens';
import { foutTekst } from './fouten';
import { Badge, datum, exact, gebruiktBinnen, GevaarKnop, Groep, Melding, Rij, Tech, useActies } from './ui';
import '../mcp-hub.css';
import './agenten.css';

type Item = { sleutel: string; soort: 'oauth' | 'token'; naam: string; laatst: number | null; sinds: number | null; actief: boolean; oauth?: OauthVerbinding; token?: DeurToken };

/** `ingebed` (hub «Підключення ШІ» op mcp, agents → tab «Технічне»): kop als h2 en geen tweede ConnectorsTab (die heeft de hub als eigen tab). */
export default function TechVerbindingen({ tr, ingebed = false }: { tr: Tr; ingebed?: boolean }) {
  const uk = tr('uk', 'nl') === 'uk';
  const acties = useActies(tr);
  const ov = useOverzicht();
  const tok = useDeurTokens();
  const deur = useDeurVerbindingen();
  const { agents: alleAgents, reload } = useAgentsData(tr);
  const [item, setItem] = useState('');
  const kies = useCallback((id: string) => setItem(id), []);

  const naActie = useCallback(async () => { await Promise.all([ov.laad(), tok.laad(), deur.laad(), reload().catch(() => undefined)]); }, [ov.laad, tok.laad, deur.laad, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Alleen de technische ruimte: verbindingen, tokens en apparaten met ruimte 'technisch'.
  const oauth = useMemo(() => inRuimte(ov.data?.oauth, 'technisch'), [ov.data]);
  const tokens = useMemo(() => inRuimte(tok.data?.tokens, 'technisch'), [tok.data]);
  const serverAgents = useMemo(() => inRuimte(alleAgents, 'technisch'), [alleAgents]);
  const nu = Date.now();
  const alle: Item[] = useMemo(() => [
    ...oauth.map((g) => ({ sleutel: `oauth:${g.id}`, soort: 'oauth' as const, naam: g.clientName, laatst: g.lastUsedAt, sinds: g.createdAt, actief: g.status === 'active', oauth: g })),
    ...tokens.map((t) => ({ sleutel: `token:${t.id}`, soort: 'token' as const, naam: t.name, laatst: isoMs(t.lastSeenAt), sinds: isoMs(t.createdAt), actief: !t.revokedAt && (isoMs(t.expiresAt) ?? 0) > nu, token: t })),
  ], [oauth, tokens, nu]);
  const actief = alle.filter((x) => x.actief).sort((a, b) => (b.laatst ?? 0) - (a.laatst ?? 0));
  const historie = alle.filter((x) => !x.actief).sort((a, b) => (b.sinds ?? 0) - (a.sinds ?? 0));

  const intrekken = (x: Item) => acties.voerUit(x.sleutel, async () => {
    if (x.oauth) await api.post(`/api/owner/mcp-connector/grants/${x.oauth.id}/revoke`, sessionBody());
    else if (x.token) await api.post('/api/mcp/tokens/revoke', { ...sessionBody(), id: x.token.id });
    await naActie();
    return tr(`Технічний доступ «${x.naam}» відкликано о ${exact(Date.now())}.`, `Technische toegang «${x.naam}» ingetrokken om ${exact(Date.now())}.`);
  }, ['Не вдалося відкликати', 'Intrekken mislukt']);

  const rij = (x: Item, historisch = false) => {
    const g = x.oauth, t = x.token;
    const eigenaar = aiEigenaar(x.naam);
    const methode = x.soort === 'oauth' ? 'OAuth' : tr('MCP-токен', 'MCP-token');
    return (
      <Rij key={x.sleutel} id={x.sleutel} open={item === x.sleutel} onToggle={() => kies(item === x.sleutel ? '' : x.sleutel)} gedimd={historisch}
        data={{ ai: x.soort, ruimte: 'technisch', status: historisch ? 'historie' : 'actief' }}
        logo={x.soort === 'token' && aiLogo(x.naam) === 'aiclient' ? <Logo kind='key' size={30} label={x.naam} /> : <Logo kind={aiLogo(x.naam)} size={30} label={x.naam} />}
        titel={x.naam}
        badges={<><Badge toon='info' data='ruimte'>{tr('технічний', 'technisch')}</Badge>{historisch ? <Badge toon={g?.status === 'expired' ? 'off' : 'bad'} data='historie'>{g?.status === 'expired' || (t && !t.revokedAt) ? tr('Закінчився', 'Verlopen') : tr('Відкликано', 'Ingetrokken')}</Badge> : null}</>}
        status={historisch ? <>{g?.revokedAt ? tr(`Відкликано ${datum(g.revokedAt)}`, `Ingetrokken op ${datum(g.revokedAt)}`) : t?.revokedAt ? tr(`Відкликано ${datum(isoMs(t.revokedAt))}`, `Ingetrokken op ${datum(isoMs(t.revokedAt))}`) : tr('Закінчився', 'Verlopen')} · {methode}</> : <>{gebruiktBinnen(x.laatst, tr)} · {methode}{eigenaar ? ` · ${tr('від', 'van')} ${eigenaar}` : ''}</>}
        acties={historisch ? undefined : (
          <GevaarKnop tr={tr} sleutel={x.sleutel} label={tr('Відкликати', 'Intrekken')} ja={tr('Так, відкликати', 'Ja, intrekken')} acties={acties} icoon={<Trash2 />} klein
            vraag={tr(`«${x.naam}» одразу втратить технічний доступ до сайту й сервера.`, `«${x.naam}» verliest meteen de technische toegang tot de site en de server.`)} onJa={() => void intrekken(x)} />
        )}>
        <Tech rijen={[
          [tr('ID', 'Id'), <code>{g?.id ?? t?.id}</code>],
          g ? [tr('Клієнт', 'Client'), <code>{g.clientId}</code>] : null,
          t ? [tr('Префікс', 'Voorvoegsel'), <code>{t.prefix}…</code>] : null,
          [tr('Створено', 'Gemaakt'), exact(g ? g.createdAt : isoMs(t?.createdAt))], [tr('Остання активність', 'Laatste activiteit'), exact(x.laatst)],
          [tr('Діє до', 'Geldig tot'), exact(g ? g.expiresAt : isoMs(t?.expiresAt))],
          t ? [tr('Викликів', 'Aanroepen'), String(t.calls)] : null,
          [tr('Простір', 'Ruimte'), tr('технічний — випуски, підготовка оновлень, стан сервера; без пошти, Drive чи особистих пристроїв', 'technisch — releases, updates voorbereiden, serverstand; geen mail, Drive of persoonlijke apparaten')],
        ]} />
        {/* Gescheiden ruimtes (1.11.2026): een technische verbinding erft het privébord niet — haar eigen rechten wijzigt u hier. */}
        {!historisch ? (
          <section className='ag-kaart' data-toegang-tab={x.sleutel}>
            <div className='ag-kaart-kop'><h3>{tr('Доступ ШІ цього технічного підключення', 'AI-toegang van deze technische verbinding')}</h3></div>
            <AiToegangTab verbinding={{ soort: x.soort, id: g?.id ?? t?.id ?? '', naam: x.naam }} tr={tr} />
          </section>
        ) : null}
      </Rij>
    );
  };

  const laadFout = ov.fout || tok.fout;
  const mag = !tok.data || tok.data.rechten.tokens !== false;
  const lang = uk ? 'uk' : 'nl';

  return (
    <div className='ag ag-tech' data-tech-verbindingen='1'>
      <header className='ag-tech-kop'>
        {ingebed ? <h2>{tr('Технічні підключення', 'Technische verbindingen')}</h2> : <h1>{tr('Технічні підключення', 'Technische verbindingen')}</h1>}
        <p>{uk ? RUIMTE_UITLEG.technisch.uk : RUIMTE_UITLEG.technisch.nl}</p>
      </header>
      <ul className='ag-tech-regels' aria-label={tr('Принципи', 'Regels')}>
        <li><Lock size={16} aria-hidden='true' /><span>{tr('Простір фіксується на підключенні, коли ви його створюєте тут. ШІ не може змінити свій простір і не бачить інструментів іншого.', 'De ruimte staat vast op de verbinding zodra u ze hier maakt. De AI kan zijn ruimte niet veranderen en ziet de hulpmiddelen van de andere niet.')}</span></li>
        <li><Eye size={16} aria-hidden='true' /><span>{tr('Технічний ШІ бачить лише сайт і сервер: випуски, стан, двері, агентів на сервері. Жодної пошти, Drive, дошки чи ваших пристроїв.', 'Een technische AI ziet alleen de site en de server: releases, stand, deur, agenten op de server. Geen mail, Drive, bord of uw apparaten.')}</span></li>
        <li><ShieldCheck size={16} aria-hidden='true' /><span>{tr('Підписана політика ШІ лишається стелею. Схвалення випуску, відкат, резервні копії й секрети — лише ви на сайті.', 'Het ondertekende AI-beleid blijft het plafond. Een release goedkeuren, terugdraaien, back-ups en geheimen — alleen u op de site.')}</span></li>
        <li><KeyRound size={16} aria-hidden='true' /><span>{tr('Право «готувати оновлення» можна дати лише технічному підключенню: ', 'Het recht «updates voorbereiden» kan alleen naar een technische verbinding: ')}<a className='ag-link' href={canonicalNavigationUrl('admin', 'updates', lang)}>{tr('Адміністрування → Оновлення', 'Beheer → Updates')} <ArrowRight size={12} aria-hidden='true' /></a></span></li>
      </ul>

      {/* Connector v2: één adres per AI met rechten per hulpmiddel — beide ruimtes, dus ook hier (de accountpagina verwijst met actief technisch profiel hierheen). */}
      {ingebed ? null : <ConnectorsTab tr={tr} />}

      <SiteSchakelaars tr={tr} />

      {laadFout ? <p className='ag-melding ag-melding-fout' role='alert' data-ag-melding='laden'>{foutTekst(laadFout, tr, ['Не всі дані вдалося завантажити', 'Niet alle gegevens konden worden geladen'])}</p> : null}

      <AiVerbinden tr={tr} magTokens={mag} naActie={naActie} ruimte='technisch' />
      <Melding uitkomst={acties.uitkomst} tr={tr} onSluit={() => acties.setUitkomst(null)} />

      <section className='ag-kaart' data-lijst='tech-verbindingen'>
        <div className='ag-kaart-kop'><h3>{tr('Технічні підключення ШІ', 'Technische AI-verbindingen')}</h3></div>
        <div className='ag-lijstkop'><p className='ag-lijstkop-tekst'>{actief.length ? tr(`Активних: ${actief.length}`, `Actief: ${actief.length}`) : tr('Активних технічних підключень немає.', 'Geen actieve technische verbindingen.')}</p></div>
        {ov.data === null && tok.data === null ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : actief.length ? <ul className='ag-lijst'>{actief.map((x) => rij(x))}</ul> : null}
        <Groep titel={tr('Відкликані й завершені', 'Ingetrokken en verlopen')} aantal={historie.length} data='tech-historie'>{historie.map((x) => rij(x, true))}</Groep>
      </section>

      <section className='ag-kaart' data-lijst='deur'>
        <div className='ag-kaart-kop'><h3>{tr('Двері сервера', 'Serverdeur')}</h3></div>
        <DeurVerbindingen tr={tr} item={item} kies={kies} deur={deur} naActie={naActie} />
        {deur.lijst === null && !deur.fout ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : null}
      </section>

      <section className='ag-kaart' data-lijst='server-agenten'>
        <div className='ag-kaart-kop'><h3>{tr('Агенти на сервері', 'Agenten op de server')}</h3><a className='ag-link' href={canonicalNavigationUrl('mcp', 'apps', lang)}>{tr('Підключити сервер / додатки', 'Server koppelen / apps')} <ArrowRight size={14} aria-hidden='true' /></a></div>
        {serverAgents.length ? <ul className='ag-lijst'>{serverAgents.map((a) => {
          const sleutel = `server:${a.id}`;
          return (
            <Rij key={a.id} id={sleutel} open={item === sleutel} onToggle={() => kies(item === sleutel ? '' : sleutel)} data={{ apparaat: a.id, ruimte: 'technisch' }}
              logo={<Logo kind='server' size={30} label={a.name} />} titel={a.name}
              badges={<><Badge toon={a.status === 'connected' ? 'ok' : 'off'}>{a.status === 'connected' ? tr('у мережі', 'online') : tr('не в мережі', 'offline')}</Badge><Badge toon='info' data='ruimte'>{tr('сервер', 'server')}</Badge></>}
              status={<>{gebruiktBinnen(a.lastSeenAt, tr)}{a.version ? ` · v${a.version}` : ''}{(a.capabilities as { apps?: unknown } | undefined)?.apps === true ? ` · ${tr('додатки', 'apps')}` : ''}</>}>
              <Tech rijen={[[tr('ID', 'Id'), <code>{a.id}</code>], [tr('Платформа', 'Platform'), a.platform ?? '—'], [tr('Підключено', 'Gekoppeld'), exact(a.createdAt)], [tr('Токен діє до', 'Token geldig tot'), exact(a.tokenExpiresAt)]]} />
            </Rij>
          );
        })}</ul> : <p className='ag-leeg'><Server size={14} aria-hidden='true' /> {tr('Жодного агента на сервері ще не підключено. Коди підключення, створені на сторінці «Додатки», належать технічному простору.', 'Nog geen agent op de server gekoppeld. Koppelcodes van de pagina «Apps» horen bij de technische ruimte.')}</p>}
      </section>
    </div>
  );
}
