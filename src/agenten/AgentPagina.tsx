// «Один ШІ — одна вкладка» (скарга власника 20.10.2026): ÉÉN pagina per AI-agent, in de hub «Підключення ШІ».
//
// Waarom: het beheer van één AI stond verspreid over vijf tabbladen (Конектори = adres en rechten, Токени = token en manier van
// verbinden, Доступи = ruimte, Розширення = kleur, Журнал = geschiedenis). Wie Grok wilde instellen, moest vier keer opnieuw
// kiezen welke AI het was. Hier staat alles van ÉÉN agent bij elkaar, in de volgorde waarin een mens het nodig heeft:
//   1. Підключити — de GROTE knop en de stappen voor juist deze client (src/agenten/verbind-recepten.ts: deeplink van Cursor en
//      VS Code, opdracht van Claude Code, instellingen van claude.ai en ChatGPT; eerlijk waar de maker niets toelaat) én de WARE
//      stand: v2-koppelingen, de erfenis van het oude /mcp en de serverdeur («стара дорога — перепідключіть»);
//   2. Дозволи — dezelfde kiezer als in het toestemmingsvenster (src/connector-v2/RechtenKiezer.tsx) met herverbinden/intrekken;
//   3. Простір — welke kanten zijn toegestaan en welke NU leven (de levende poort van de server, aiPoortNu);
//   4. Спосіб зв'язку й токени — alleen voor clients die een Authorization-kop willen; ingeklapt, want waar OAuth bestaat is dit de
//      oude weg;
//   5. Колір агента — hergebruikt src/agenten/AgentKleuren.tsx (geen tweede kopie van die lijst);
//   6. Журнал — alleen de gebeurtenissen van deze agent.
// Er komt GEEN nieuwe pagina bij: dit is een plek in de bestaande hub (#agent/<slug>). De algemene tabbladen blijven voor wat
// echt gedeeld is (apparaten, externe MCP-servers, de browserextensie, het hele journaal).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, KeyRound, Link2, Palette, Plug, ShieldCheck, SlidersHorizontal, Trash2, UserRound, Wrench } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agenten-gegevens';
import type { Tr } from '../mcp-ui';
import { agentUrl, oudAgentUrl, OUD_GEDEELD_URL, v2Agent, type AgentSlug } from '../../shared/connector-v2/agenten';
import { RUIMTE_NAAM, RUIMTE_UITLEG } from '../../shared/ai-ruimte';
import { agentSlugUitNaam } from '../../shared/markering-agenten';
import { KANT_TEKST, type Kant } from '../../shared/connector-v2/catalogus';
import { levendeKanten, SOORT_TEKST, zichtbareSleutels, type VerbindingSoort } from '../../shared/connector-v2/stand';
import { AgentInstellingen, agentVanItem, standVanAgent, type AgentStand, type Data } from '../connector-v2/ConnectorsTab';
import AgentKleuren from './AgentKleuren';
import AgentLogo from './AgentLogo';
import AgentVerbinden from './AgentVerbinden';
import TabTokens from './TabTokens';
import { JournaalLijst } from './Journaal';
import { inRuimte, isoMs, useDeurTokens, useJournaal } from './gegevens';
import { foutTekst } from './fouten';
import { GevaarKnop, Melding, useActies } from './ui';
import BevestigingenPaneel from '../ai-bevestiging/BevestigingenPaneel';

const wanneer = (ms: number | null | undefined, uk: boolean) => (ms ? new Date(ms).toLocaleString(uk ? 'uk-UA' : 'nl-BE', { dateStyle: 'short', timeStyle: 'short' }) : (uk ? 'ще не було' : 'nog niet'));

type Rij = { sleutel: string; soort: VerbindingSoort; naam: string; kanten: Kant[]; sleutels: number; laatst: number | null; tot: number | null; id: string };

/** Alle verbindingen van deze ene AI, langs welke weg dan ook, als één lijst (nieuwste gebruik eerst). */
function rijenVan(a: AgentStand): Rij[] {
  const uit: Rij[] = [
    ...a.koppelingen.map((k): Rij => ({ sleutel: `v2:${k.id}`, soort: 'v2', naam: k.clientName, kanten: k.kanten, sleutels: k.sleutels.length, laatst: k.lastUsedAt, tot: k.expiresAt, id: k.id })),
    ...(a.erfenis ?? []).map((g): Rij => ({ sleutel: `mcp:${g.id}`, soort: 'erfenis', naam: g.clientName, kanten: [g.ruimte === 'technisch' ? 'beheer' : 'gebruiker'], sleutels: 0, laatst: g.lastUsedAt, tot: g.expiresAt, id: g.id })),
    ...(a.deur ?? []).map((d): Rij => ({ sleutel: `deur:${d.id}`, soort: 'deur', naam: `${d.klant}${d.deur ? ` · /${d.deur}` : ''}`, kanten: ['beheer'], sleutels: 0, laatst: d.laatst || null, tot: d.refreshTot || null, id: d.id })),
  ];
  return uit.sort((x, y) => (y.laatst ?? 0) - (x.laatst ?? 0));
}

export default function AgentPagina({ tr, slug, terug }: { tr: Tr; slug: AgentSlug; terug: () => void }) {
  // De open rij is PLAATSELIJK: het adres (#agent/<slug>) wijst de agent aan, niet een geopende rij — anders zou het openen van
  // een tokenrij de slug uit de hash duwen en de pagina kwijtraken.
  const [item, setItem] = useState('');
  const kies = (id: string) => setItem(id);
  const uk = tr('uk', 'nl') === 'uk';
  const info = v2Agent(slug);
  const adres = agentUrl(slug);
  const [data, setData] = useState<Data | null>(null);
  const [fout, setFout] = useState<unknown>(null);
  const [versie, setVersie] = useState(0);
  const tok = useDeurTokens();
  const acties = useActies(tr);

  const laad = useCallback(async () => {
    try { setData((await api.post('/api/owner/connector-v2/overzicht', sessionBody())).data as Data); setFout(null); }
    catch (e) { setFout(e); }
  }, []);
  useEffect(() => { void laad(); }, [laad]);
  const naWijziging = useCallback(async () => { await Promise.all([laad(), tok.laad()]); setVersie((v) => v + 1); }, [laad, tok.laad]); // eslint-disable-line react-hooks/exhaustive-deps

  const stand = useMemo(() => (data?.agenten ?? []).find((a) => a.slug === slug) ?? null, [data, slug]);
  // De WARE stand (shared/connector-v2/stand.ts): v2 + oud /mcp + serverdeur. `null` zolang de server niet antwoordde (geen
  // «не підключено» beweren wat we niet weten).
  const ware = stand ? standVanAgent(stand) : null;
  const rijen = useMemo(() => (stand ? rijenVan(stand) : []), [stand]);
  const poort = data?.poort ?? null;
  const ruimteNu = poort?.ruimte ?? 'prive';
  // Toegestane kanten (actieve koppeling, anders de onthouden keuze) en welke daarvan NU bestaan.
  const keuze = stand?.actief ?? stand?.voorkeur ?? null;
  const kanten: Kant[] = keuze?.kanten ?? ['gebruiker'];
  const levend = levendeKanten(kanten, ruimteNu);
  const hulpmiddelenNu = keuze ? zichtbareSleutels(keuze.sleutels, kanten, ruimteNu).length : 0;
  // Tokens van DEZE agent: de naam van een token is de klant waarvoor het is uitgegeven (AiVerbinden stuurt `klant` mee).
  const nu = Date.now();
  // Dezelfde naamregel als de markering in het tabblad en de logo's (shared/markering-agenten.ts), zodat «ChatGPT», «gpt» en
  // «Claude Code» bij de juiste agent terechtkomen. Een token met een vrije naam («ноутбук Олени») hoort bij geen enkele agent
  // en blijft op het algemene tabblad «Токени» staan.
  const eigenTokens = useMemo(() => inRuimte(tok.data?.tokens, 'prive').filter((t) => agentSlugUitNaam(t.name) === slug), [tok.data, slug]);
  const actieveTokens = eigenTokens.filter((t) => !t.revokedAt && (isoMs(t.expiresAt) ?? 0) > nu).length;
  const journaal = useJournaal(useMemo(() => ({ soort: '', onderwerp: '', limit: 80 }), []), true, versie);
  const eigenEvents = useMemo(() => (journaal.items ?? []).filter((e) => agentVanItem(e) === slug), [journaal.items, slug]);

  const stempel = ware ? tr(ware.uk, ware.nl) : tr('стан невідомий', 'stand onbekend');
  const stempelKlas = !ware ? 'is-onbekend' : ware.code === 'wacht' ? 'is-wacht' : ware.alleenOud ? 'is-oud' : ware.verbonden ? 'is-aan' : 'is-uit';

  // Een grant van het oude /mcp intrekken gaat via de bestaande route van de connector; de serverdeur trekt alleen het technische
  // tabblad in (die lijst is sitebeheer), dus daar wijzen we naartoe.
  const intrekOud = (r: Rij) => acties.voerUit(r.sleutel, async () => {
    await api.post(`/api/owner/mcp-connector/grants/${r.id}/revoke`, sessionBody());
    await naWijziging();
    return tr(`Старе підключення «${r.naam}» відкликано. Підключіть ${info.naam} знову через власну адресу вище.`, `Oude koppeling «${r.naam}» ingetrokken. Koppel ${info.naam} opnieuw via het eigen adres hierboven.`);
  }, ['Не вдалося відкликати', 'Intrekken mislukt']);

  return (
    <div className='ag-tab ag-agent' data-agent-pagina={slug} data-agent-stand={ware?.code ?? 'onbekend'}>
      <div className='ag-agent-kop'>
        <button type='button' className='ag-link' onClick={terug} data-agent-terug='1'><ArrowLeft size={14} aria-hidden='true' />{tr('Усі ШІ', 'Alle AI')}</button>
        <AgentLogo agent={slug} naam={info.naam} size={34} />
        <div>
          <h2>{info.naam}</h2>
          <small className={`v2b-stand ${stempelKlas}`} data-agent-stempel={ware?.code ?? 'onbekend'}><i aria-hidden='true' />{stempel}</small>
        </div>
      </div>
      {fout ? <p className='ag-melding ag-melding-fout' role='alert'>{foutTekst(fout, tr, ['Не вдалося завантажити дані агента', 'Gegevens van de agent laden mislukt'])}</p> : null}

      {/* 1: підключити — de grote knop en de stappen voor juist deze client, en de ware stand. */}
      <section className='ag-kaart ag-agent-verbinden' data-agent-sectie='verbinding' aria-labelledby={`ag-agent-verbinding-${slug}`}>
        <div className='ag-kaart-kop'><h3 id={`ag-agent-verbinding-${slug}`}><Plug size={16} aria-hidden='true' /> {tr(`Підключити ${info.naam}`, `${info.naam} koppelen`)}</h3>
          <small className='hub-meta' data-agent-hulpmiddelen={hulpmiddelenNu}>{data ? tr(`інструментів зараз видно: ${hulpmiddelenNu}`, `hulpmiddelen nu zichtbaar: ${hulpmiddelenNu}`) : ''}</small></div>
        <AgentVerbinden tr={tr} slug={slug} />

        <div className='ag-agent-verbindingen' data-agent-verbindingen={rijen.length}>
          <h4>{tr('Що зараз підключено', 'Wat er nu gekoppeld is')}</h4>
          <Melding uitkomst={acties.uitkomst} tr={tr} onSluit={() => acties.setUitkomst(null)} />
          {!data && !fout ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p>
            : rijen.length ? (
              <ul className='v2-koppelingen ag-agent-koppelingen'>
                {rijen.map((r) => {
                  const soort = SOORT_TEKST[r.soort];
                  return (
                    <li key={r.sleutel} data-agent-verbinding={r.soort} className={soort.oud ? 'is-oud' : ''}>
                      <span><b>{r.naam}</b> <small className='hub-meta'>{uk ? soort.uk : soort.nl}</small></span>
                      <span>{r.kanten.map((x) => <span key={x} className={`v2-kant-teller kant-${x}`}>{x === 'beheer' ? <Wrench size={12} /> : <UserRound size={12} />}{KANT_TEKST[x][uk ? 'uk' : 'nl']}</span>)}</span>
                      <span>{r.soort === 'v2' ? tr(`${r.sleutels} дозволів`, `${r.sleutels} rechten`) : tr('права як на старій адресі', 'rechten van het oude adres')}</span>
                      <small>{tr('остання дія', 'laatst gebruikt')}: {wanneer(r.laatst, uk)}{r.tot ? ` · ${tr('діє до', 'geldig tot')} ${wanneer(r.tot, uk)}` : ''}</small>
                      {r.soort === 'erfenis' ? <GevaarKnop tr={tr} sleutel={r.sleutel} label={tr('Відкликати старе', 'Oude intrekken')} ja={tr('Так, відкликати', 'Ja, intrekken')} acties={acties} icoon={<Trash2 />} klein
                        vraag={tr(`«${r.naam}» одразу втратить доступ через стару адресу. Потім підключіть ${info.naam} через кнопку вище.`, `«${r.naam}» verliest meteen de toegang via het oude adres. Koppel ${info.naam} daarna via de knop hierboven.`)} onJa={() => void intrekOud(r)} /> : null}
                      {r.soort === 'deur' ? <small className='hub-meta'><a href='#technisch' className='ag-link'>{tr('відкликати на вкладці «Технічне»', 'intrekken op het tabblad «Technisch»')}</a></small> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <p className='ag-leeg' data-agent-leeg='1'>{tr(`${info.naam} ще не підключено. Натисніть кнопку вище й пройдіть кроки.`, `${info.naam} is nog niet gekoppeld. Klik op de knop hierboven en volg de stappen.`)}</p>}
          {ware?.alleenOud ? <p className='ag-verbind-let' role='note' data-agent-oud-pad='1'>{tr(`${info.naam} працює через стару дорогу. Усе ще діє, але нові дозволи, живі права й журнал саме цього ШІ є лише на власній адресі. Підключіть ${info.naam} знову через кнопку вище й відкличте старе.`, `${info.naam} werkt via een oude weg. Het werkt nog, maar nieuwe rechten, levende rechten en het logboek van juist deze AI bestaan alleen op het eigen adres. Koppel ${info.naam} opnieuw via de knop hierboven en trek het oude in.`)}</p> : null}
          {stand?.deur === null && data?.account.eigenaar ? <p className='hub-meta' data-agent-deur='onbekend'>{tr('Двері сервера зараз не відповідають або вимкнені — підключення через них (якщо є) тут не видно.', 'De serverdeur antwoordt nu niet of staat uit — koppelingen daarlangs (als die er zijn) zijn hier niet te zien.')}</p> : null}
        </div>
        <p className='hub-meta' data-agent-oude-adressen='1'>{tr(`Адреса ${info.naam}: `, `Adres van ${info.naam}: `)}<code data-agent-adres={slug}>{adres}</code>{tr(` — тільки для ${info.naam}; токен, виданий для неї, більше ніде не працює. Старі адреси (${OUD_GEDEELD_URL}, ${oudAgentUrl(slug)}) відповідають перенаправленням 308 сюди.`,
          ` — alleen voor ${info.naam}; een token voor dit adres werkt nergens anders. De oude adressen (${OUD_GEDEELD_URL}, ${oudAgentUrl(slug)}) antwoorden met een 308 naar dit adres.`)}</p>
      </section>

      {/* 1b (21.10.2026): wat DEZE AI voorstelde en op uw «Підтвердити» wacht (mail verzenden, delen, foto's …). */}
      <BevestigingenPaneel tr={tr} agent={slug} />

      {/* 2: дозволи — dezelfde kiezer als in het toestemmingsvenster, met herverbinden en intrekken. */}
      <section className='ag-kaart' data-agent-sectie='rechten' aria-labelledby={`ag-agent-rechten-${slug}`}>
        <div className='ag-kaart-kop'><h3 id={`ag-agent-rechten-${slug}`}><Link2 size={16} aria-hidden='true' /> {tr('Дозволи', 'Rechten')}</h3></div>
        {data && stand ? <AgentInstellingen tr={tr} uk={uk} a={stand} eigenaar={!!data.account.eigenaar} naWijziging={naWijziging} />
          : <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p>}
      </section>

      {/* 3: простір — welke kanten zijn toegestaan en welke NU bestaan (levende poort van de server). */}
      <section className='ag-kaart' data-agent-sectie='ruimte' aria-labelledby={`ag-agent-ruimte-${slug}`}>
        <div className='ag-kaart-kop'><h3 id={`ag-agent-ruimte-${slug}`}><ShieldCheck size={16} aria-hidden='true' /> {tr('Простір', 'Ruimte')}</h3></div>
        <ul className='ag-agent-ruimtes' data-agent-kanten={kanten.join(',')} data-agent-levend={levend.join(',')} data-agent-poort={poort ? `${poort.ruimte}:${poort.stand}` : 'onbekend'}>
          {(['prive', 'technisch'] as const).map((r) => {
            const kant: Kant = r === 'prive' ? 'gebruiker' : 'beheer';
            const toegestaan = kanten.includes(kant);
            const nuAan = levend.includes(kant);
            return (
              <li key={r} data-ruimte={r} data-ruimte-toegestaan={toegestaan ? '1' : '0'} data-ruimte-nu={nuAan ? '1' : '0'} className={toegestaan ? (nuAan ? 'is-aan' : 'is-slapend') : 'is-uit'}>
                <b>{uk ? RUIMTE_NAAM[r].uk : RUIMTE_NAAM[r].nl} <small className='v2b-stand'>{!toegestaan ? tr('не дозволено', 'niet toegestaan') : nuAan ? tr('дозволено · діє зараз', 'toegestaan · nu actief') : tr('дозволено · зараз не діє', 'toegestaan · nu niet actief')}</small></b>
                <small>{uk ? RUIMTE_UITLEG[r].uk : RUIMTE_UITLEG[r].nl}</small>
              </li>
            );
          })}
        </ul>
        <p className='hub-meta'>{tr(`Зараз для ${info.naam} дозволено: ${kanten.map((k) => KANT_TEKST[k].uk).join(', ')}; діє: ${levend.map((k) => KANT_TEKST[k].uk).join(', ')}. Технічні інструменти існують лише поки активний ваш технічний профіль і дія «Підключення ШІ» увімкнена в технічному просторі — незалежно від того, що відмічено.`,
          `Nu toegestaan voor ${info.naam}: ${kanten.map((k) => KANT_TEKST[k].nl).join(', ')}; actief: ${levend.map((k) => KANT_TEKST[k].nl).join(', ')}. Technische hulpmiddelen bestaan alleen zolang uw technisch profiel actief is en «AI-koppelingen» in de technische ruimte aan staat — wat er ook is aangevinkt.`)}</p>
        {poort?.code ? <p className='hub-meta' data-agent-poort-code={poort.code}>{tr(`Причина, чому технічна сторона зараз не діє: ${poort.code}.`, `Waarom de technische kant nu niet actief is: ${poort.code}.`)}</p> : null}
      </section>

      {/* 4: спосіб зв'язку (прямий токен) і токени саме цього агента — ingeklapt: waar OAuth bestaat is dit de oude weg. */}
      <section className='ag-kaart' data-agent-sectie='verbinding-soort' aria-labelledby={`ag-agent-tokens-${slug}`}>
        <details open={actieveTokens > 0}>
          <summary><KeyRound size={15} aria-hidden='true' /> <span id={`ag-agent-tokens-${slug}`}>{tr('Прямий токен (для клієнтів без входу через браузер)', 'Direct token (voor clients zonder aanmelden via de browser)')}</span>
            <small className='hub-meta' data-agent-tokens={actieveTokens}>{tr(`активних токенів: ${actieveTokens}`, `actieve tokens: ${actieveTokens}`)}</small></summary>
          <p className='hub-meta'>{tr('Лише якщо ваш клієнт не вміє входити через OAuth і просить заголовок Authorization: Bearer. Для Claude, ChatGPT, Cursor і VS Code це не потрібно — використовуйте кнопку вгорі.', 'Alleen als uw client niet via OAuth kan aanmelden en een kop Authorization: Bearer vraagt. Voor Claude, ChatGPT, Cursor en VS Code is dit niet nodig — gebruik de knop bovenaan.')}</p>
          <div data-agent-sectie='tokens'>
            <TabTokens tr={tr} data={tok.data ? { ...tok.data, tokens: eigenTokens } : null} naActie={naWijziging} item={item} kies={kies} vastKlant={info.klant} />
          </div>
        </details>
      </section>

      {/* 5: колір агента — та сама секція, що в «Розширенні браузера» (один список, без копії). */}
      <section className='ag-kaart' data-agent-sectie='kleur'>
        <details>
          <summary><Palette size={15} aria-hidden='true' /> {tr(`Колір агента (${info.naam} та інші)`, `Kleur per agent (${info.naam} en de andere)`)}</summary>
          <AgentKleuren tr={tr} />
        </details>
      </section>

      {/* 6: журнал саме цього агента. */}
      <section className='ag-kaart' data-agent-sectie='journaal' aria-labelledby={`ag-agent-journaal-${slug}`}>
        <div className='ag-kaart-kop'><h3 id={`ag-agent-journaal-${slug}`}><Activity size={16} aria-hidden='true' /> {tr(`Журнал: ${info.naam}`, `Logboek: ${info.naam}`)}</h3>
          <small className='hub-meta'>{tr('Події інших ШІ — у спільному журналі.', 'Gebeurtenissen van andere AI staan in het gezamenlijke logboek.')}</small></div>
        {journaal.fout ? <p className='ag-melding ag-melding-fout' role='alert'>{foutTekst(journaal.fout, tr, ['Не вдалося завантажити події', 'Gebeurtenissen laden mislukt'])}</p> : null}
        {journaal.items === null ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p>
          : eigenEvents.length ? <JournaalLijst tr={tr} items={eigenEvents.slice(0, 25)} compact />
            : <p className='ag-leeg' data-agent-journaal='leeg'>{tr(`Для ${info.naam} подій ще немає.`, `Voor ${info.naam} zijn er nog geen gebeurtenissen.`)}</p>}
      </section>
      <p className='hub-meta' data-agent-voet='1'><SlidersHorizontal size={13} aria-hidden='true' /> {tr('Пристрої, зовнішні MCP-сервери, розширення браузера й повний журнал — спільні для всіх ШІ й лишаються окремими вкладками.', 'Apparaten, externe MCP-servers, de browserextensie en het volledige logboek zijn voor alle AI samen en blijven eigen tabbladen.')}</p>
    </div>
  );
}
