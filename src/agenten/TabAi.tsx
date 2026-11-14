// «Підключені ШІ»: OAuth-verbindingen (Claude, Grok, Cursor, elke MCP/OAuth-client) en agenttokens (MCP-token), als GitHub-rijen.
// INTEG-001 (03.11.2026, «блоки не повторюються»): drie dubbels weg —
//   • «ШІ чекає вашого рішення» stond hier én in «Огляд → Потрібне ваше рішення»; nu alleen daar, hier één regel met de weg erheen;
//   • de zes knoppen «Підключити <ШІ>» herhaalden de lijst «Конектори»; de weg per AI loopt nu via het bord «Картки підключення»
//     (AgentBord, met «Сторінка цього ШІ» → #agent/<slug>), dat hier in «Підключити ШІ» zit in plaats van als los blok erboven;
//   • de kop van het tabblad staat in de rand van de pagina (AgentenPagina), dus hier geen tweede titel.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Copy, ExternalLink, KeyRound, SlidersHorizontal, Sparkles, Trash2, Wrench } from 'lucide-react';
import { api } from '../platform/client';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import { sessionBody, type ToolCall } from '../agenten-gegevens';
import { Logo, Section, type Tr } from '../mcp-ui';
import McpToolsPanel from '../McpHulpmiddelenPaneel';
import AiToegangTab from './AiToegangTab';
import AgentBord from './AgentBord';
import { aiEigenaar, aiLogo, isoMs, type DeurToken, type OauthVerbinding, type Overzicht } from './gegevens';
import { Badge, datum, exact, gebruiktBinnen, GevaarKnop, Groep, Knop, Melding, Rij, Tech, Tijd, useActies } from './ui';
import { CLAUDE_CONNECTORS_URL } from './verbind-recepten';
import './agenten-kern-maquette.css';

type Item = { sleutel: string; soort: 'oauth' | 'token'; naam: string; laatst: number | null; sinds: number | null; actief: boolean; oauth?: OauthVerbinding; token?: DeurToken };
// Sinds 2025 heet het in claude.ai en Claude Desktop «Settings → Connectors» (de oude ankerlink naar «Customize» bestaat niet meer).
const CLAUDE_CONNECTORS = CLAUDE_CONNECTORS_URL;

export default function TabAi({ tr, overzicht, tokens, naActie, item, kies, calls }: {
  tr: Tr; overzicht: Overzicht | null; tokens: DeurToken[] | null; naActie: () => Promise<void>; item: string; kies: (id: string) => void; calls: ToolCall[];
}) {
  const acties = useActies(tr);
  // Is het ondertekende AI-beleid actief? Dan is dat de enige plek voor rechten (zie hieronder).
  const [beleidActief, setBeleidActief] = useState(false);
  useEffect(() => { let weg = false; api.post('/api/owner/ai-beleid/overzicht', sessionBody()).then((r) => { if (!weg) setBeleidActief((r.data as { staat?: string })?.staat === 'geldig'); }).catch(() => undefined); return () => { weg = true; }; }, []);
  const [sorteer, setSorteer] = useState<'gebruik' | 'naam' | 'datum'>('gebruik');
  const [gekopieerd, setGekopieerd] = useState(false);
  const alle: Item[] = useMemo(() => [
    ...(overzicht?.oauth ?? []).map((g) => ({ sleutel: `oauth:${g.id}`, soort: 'oauth' as const, naam: g.clientName, laatst: g.lastUsedAt, sinds: g.createdAt, actief: g.status === 'active', oauth: g })),
    ...(tokens ?? []).map((t) => ({ sleutel: `token:${t.id}`, soort: 'token' as const, naam: t.name, laatst: isoMs(t.lastSeenAt), sinds: isoMs(t.createdAt), actief: !t.revokedAt && (isoMs(t.expiresAt) ?? 0) > Date.now(), token: t })),
  ], [overzicht, tokens]);
  const sorteren = (l: Item[]) => [...l].sort((a, b) => sorteer === 'naam' ? a.naam.localeCompare(b.naam) : sorteer === 'datum' ? (b.sinds ?? 0) - (a.sinds ?? 0) : (b.laatst ?? 0) - (a.laatst ?? 0));
  const actief = sorteren(alle.filter((x) => x.actief));
  const historie = alle.filter((x) => !x.actief).sort((a, b) => (eindVan(b) ?? 0) - (eindVan(a) ?? 0));
  const toolPending = calls.filter((c) => c.status === 'pending_approval');

  const intrekken = (x: Item) => acties.voerUit(x.sleutel, async () => {
    if (x.oauth) await api.post(`/api/owner/mcp-connector/grants/${x.oauth.id}/revoke`, sessionBody());
    else if (x.token) await api.post('/api/mcp/tokens/revoke', { ...sessionBody(), id: x.token.id });
    await naActie();
    return x.soort === 'oauth'
      ? tr(`Доступ «${x.naam}» відкликано о ${exact(Date.now())}. Наступний запит цього ШІ буде відхилено; рядок перенесено до «Відкликані».`, `Toegang van «${x.naam}» ingetrokken om ${exact(Date.now())}. Het volgende verzoek van deze AI wordt geweigerd; de rij staat nu bij "Ingetrokken".`)
      : tr(`Токен «${x.naam}» відкликано о ${exact(Date.now())}. Агент із цим токеном більше не пройде двері; рядок перенесено до «Відкликані».`, `Token «${x.naam}» ingetrokken om ${exact(Date.now())}. Een agent met dit token komt niet meer door de deur; de rij staat nu bij "Ingetrokken".`);
  }, ['Не вдалося відкликати', 'Intrekken mislukt']);
  const allesIntrekken = () => acties.voerUit('alles', async () => {
    let n = 0;
    try {
      for (const x of actief) {
        if (x.oauth) await api.post(`/api/owner/mcp-connector/grants/${x.oauth.id}/revoke`, sessionBody());
        else if (x.token) await api.post('/api/mcp/tokens/revoke', { ...sessionBody(), id: x.token.id });
        n += 1;
      }
    } catch (e) {
      // Stopt bij de eerste fout; wat al lukte blijft ingetrokken. Lijst bijwerken en zeggen hoeveel er lukten.
      await naActie();
      throw Object.assign(e as object, { message: (e as Error)?.message, gelukt: n });
    }
    await naActie();
    return tr(`Відкликано всі доступи ШІ (${n}). Жоден ШІ-клієнт чи агент із токеном більше не має доступу; історія — у «Відкликані» та в журналі.`, `Alle AI-toegang ingetrokken (${n}). Geen AI-client of agent met token heeft nog toegang; de geschiedenis staat bij "Ingetrokken" en in het logboek.`);
  }, ['Не вдалося відкликати всі (уже відкликані лишаються відкликаними; див. «Відкликані»)', 'Alles intrekken mislukt (wat al is ingetrokken blijft ingetrokken; zie "Ingetrokken")']);

  const kopieer = async () => { try { await navigator.clipboard?.writeText(overzicht?.mcpUrl ?? ''); setGekopieerd(true); window.setTimeout(() => setGekopieerd(false), 2000); } catch { /* geen klembord */ } };

  const rij = (x: Item, historisch = false) => {
    const g = x.oauth, t = x.token;
    const eigenaar = aiEigenaar(x.naam);
    const methode = x.soort === 'oauth' ? 'OAuth' : tr('MCP-токен', 'MCP-token');
    const status = historisch
      ? <>{statusHistorie(x, tr)} · {methode}</>
      : <>{gebruiktBinnen(x.laatst, tr)} · {methode}{eigenaar ? ` · ${tr('від', 'van')} ${eigenaar}` : ''}</>;
    return (
      <Rij key={x.sleutel} id={x.sleutel} open={item === x.sleutel} onToggle={() => kies(item === x.sleutel ? '' : x.sleutel)} gedimd={historisch}
        data={{ ai: x.soort, status: historisch ? (g?.status === 'expired' ? 'verlopen' : 'ingetrokken') : 'actief' }}
        logo={x.soort === 'token' && aiLogo(x.naam) === 'aiclient' ? <Logo kind='key' size={30} label={x.naam} /> : <Logo kind={aiLogo(x.naam)} size={30} label={x.naam} />}
        titel={x.naam}
        badges={historisch ? <Badge toon={g?.status === 'expired' ? 'off' : 'bad'} data='historie'>{g?.status === 'expired' ? tr('Закінчився', 'Verlopen') : tr('Відкликано', 'Ingetrokken')}</Badge> : <Badge toon={x.laatst && Date.now() - x.laatst < 86_400_000 ? 'ok' : 'off'}>{x.laatst && Date.now() - x.laatst < 86_400_000 ? tr('активний', 'actief') : tr('простоює', 'inactief')}</Badge>}
        status={status}
        acties={historisch ? undefined : (
          <GevaarKnop tr={tr} sleutel={x.sleutel} label={tr('Відкликати', 'Intrekken')} ja={tr('Так, відкликати', 'Ja, intrekken')} acties={acties} icoon={<Trash2 />} klein
            vraag={x.soort === 'oauth' ? tr(`«${x.naam}» одразу втратить доступ до сайту й ваших пристроїв.`, `«${x.naam}» verliest meteen de toegang tot de site en uw apparaten.`) : tr(`Агент із токеном «${x.naam}» більше не пройде двері.`, `Een agent met token «${x.naam}» komt niet meer door de deur.`)}
            onJa={() => void intrekken(x)} />
        )}>
        {g ? (
          <Tech rijen={[
            [tr('Метод', 'Methode'), tr('OAuth 2.1 + PKCE (MCP-конектор, без пароля)', 'OAuth 2.1 + PKCE (MCP-connector, zonder wachtwoord)')],
            [tr('ID підключення', 'Verbindings-id'), <code>{g.id}</code>],
            ['Client ID', <code>{g.clientId}</code>],
            [tr('Дозволи (scope)', 'Rechten (scope)'), <code>{g.scope || '—'}</code>],
            [tr('Що саме дозволено', 'Wat precies mag'), tr('інструменти сайту за налаштуваннями нижче («Що ШІ може робити»); дії на пристроях — лише за дозволами пристрою', 'hulpmiddelen van de site volgens de instellingen hieronder ("Wat de AI mag"); acties op apparaten alleen met de toestemmingen van het apparaat')],
            [tr('Підключено', 'Verbonden'), exact(g.createdAt)],
            [tr('Остання активність', 'Laatste activiteit'), g.lastUsedAt ? <>{exact(g.lastUsedAt)} (<Tijd ms={g.lastUsedAt} tr={tr} />)</> : tr('ще ні разу', 'nog nooit')],
            [tr('Токен доступу діє до', 'Toegangstoken geldig tot'), exact(g.accessExpiresAt)],
            [tr('Підключення діє до', 'Verbinding geldig tot'), exact(g.expiresAt)],
            g.revokedAt ? [tr('Відкликано', 'Ingetrokken'), exact(g.revokedAt)] : null,
            [tr('Стан', 'Stand'), g.status === 'active' ? tr('активне', 'actief') : g.status === 'revoked' ? tr('відкликано', 'ingetrokken') : g.status === 'expired' ? tr('строк минув', 'verlopen') : g.status],
          ]} />
        ) : t ? (
          <Tech rijen={[
            [tr('Метод', 'Methode'), tr('MCP-токен (Bearer) для дверей /Grok', 'MCP-token (Bearer) voor de deur /Grok')],
            [tr('ID токена', 'Token-id'), <code>{t.id}</code>],
            [tr('Префікс', 'Voorvoegsel'), <code>{t.prefix}…</code>],
            [tr('Дозволи', 'Rechten'), <code>{Array.isArray(t.scopes) ? t.scopes.join(' ') : String(t.scopes ?? '—')}</code>],
            [tr('Викликів', 'Aanroepen'), String(t.calls)],
            [tr('Створено', 'Gemaakt'), exact(isoMs(t.createdAt))],
            [tr('Остання активність', 'Laatste activiteit'), exact(isoMs(t.lastSeenAt))],
            [tr('Діє до', 'Geldig tot'), exact(isoMs(t.expiresAt))],
            t.revokedAt ? [tr('Відкликано', 'Ingetrokken'), exact(isoMs(t.revokedAt))] : null,
          ]} />
        ) : null}
        {!historisch ? (
          <section className='ag-kaart' data-toegang-tab={x.sleutel}>
            <div className='ag-kaart-kop'><h3>{tr('Доступ ШІ', 'AI-toegang')}</h3></div>
            <AiToegangTab
              verbinding={{ soort: x.soort, id: x.oauth?.id ?? x.token?.id ?? '', naam: x.naam }}
              tr={tr} metBeheer />
          </section>
        ) : null}
      </Rij>
    );
  };

  return (
    <div className='ag-tab' data-tab-inhoud='ai'>
      {toolPending.length ? (
        <p className='ag-melding ag-melding-wacht' role='status' data-ai-wacht={toolPending.length}>
          <AlertTriangle aria-hidden='true' />
          <span>{tr(`ШІ чекає вашого рішення (${toolPending.length}). Відповісти можна в «Огляді» → «Потрібне ваше рішення».`, `De AI wacht op uw beslissing (${toolPending.length}). Antwoorden kan in «Overzicht» → «Uw beslissing is nodig».`)}</span>
          <a href='#overzicht' className='ag-link' data-ai-naar-wacht='1'>{tr('До «Огляду»', 'Naar «Overzicht»')} <ArrowRight size={14} aria-hidden='true' /></a>
        </p>
      ) : null}

      <div className='ag-lijstkop'>
        <p className='ag-lijstkop-tekst'>{actief.length ? tr(`Ви надали доступ ${actief.length} ${actief.length === 1 ? 'застосунку' : 'застосункам'} ШІ.`, `U hebt ${actief.length} AI-${actief.length === 1 ? 'toepassing' : 'toepassingen'} toegang gegeven.`) : tr('Жоден ШІ зараз не має доступу.', 'Geen enkele AI heeft nu toegang.')}</p>
        <label className='ag-veld ag-veld-inline'><span>{tr('Сортувати', 'Sorteren')}</span>
          <select value={sorteer} onChange={(e) => setSorteer(e.target.value as typeof sorteer)} data-sorteer='ai'>
            <option value='gebruik'>{tr('Останнє використання', 'Laatst gebruikt')}</option>
            <option value='naam'>{tr('Назва', 'Naam')}</option>
            <option value='datum'>{tr('Дата підключення', 'Datum van verbinden')}</option>
          </select>
        </label>
        {actief.length > 1 ? <GevaarKnop tr={tr} sleutel='alles' label={tr('Відкликати всі', 'Alles intrekken')} ja={tr('Так, відкликати всі', 'Ja, alles intrekken')} acties={acties} icoon={<Trash2 />} vraag={tr(`Відкликати доступ усіх ${actief.length} ШІ та токенів?`, `Toegang van alle ${actief.length} AI's en tokens intrekken?`)} onJa={() => void allesIntrekken()} /> : null}
      </div>
      <Melding uitkomst={acties.uitkomst} tr={tr} onSluit={() => acties.setUitkomst(null)} />
      {overzicht === null && tokens === null ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : actief.length ? <ul className='ag-lijst' data-lijst='ai'>{actief.map((x) => rij(x))}</ul> : <p className='ag-leeg'>{tr('Підключіть Claude чи інший ШІ нижче — він з’явиться тут.', 'Verbind Claude of een andere AI hieronder — hij verschijnt dan hier.')}</p>}
      <Groep titel={tr('Відкликані й завершені (90 днів)', 'Ingetrokken en verlopen (90 dagen)')} aantal={historie.length} data='ai-historie'>{historie.map((x) => rij(x, true))}</Groep>

      {/* HUB-08: ÉÉN wizard «Підключити ШІ» met de keuze van de methode; de andere tabs (#connectors, #tokens) zijn de uitvoering van die keuze.
          INTEG-001: altijd zichtbaar als één blok (kop + drie manieren); de koppelkaarten per AI (AgentBord) staan ingeklapt eronder. */}
      <section className='ag-blok' id='ag-ai-verbinden' data-ai-wizard='methode'>
        <header className='ag-blok-kop'>
          <h3 className='ag-blok-titel'><KeyRound aria-hidden='true' /> {tr('Підключити новий ШІ', 'Een nieuwe AI koppelen')}</h3>
          <p className='ag-blok-uitleg'>{tr('Оберіть один зі способів; найпростіше — власна адреса-конектор для кожного ШІ.', 'Kies een van de manieren; het eenvoudigst is een eigen connectoradres per AI.')}</p>
        </header>
          <div className='ag-methoden' role='list'>
            <a role='listitem' className='ag-kaart ag-methode' href='#connectors' data-ai-methode='connectors'>
              <b>{tr('Окремий конектор для ШІ', 'Eigen connector per AI')}</b> <span className='ag-badge'>{tr('рекомендовано', 'aanbevolen')}</span>
              <small>{tr('Claude, ChatGPT, Grok, Cursor… — своя адреса й свої права; підключення, перепідключення й відкликання — у блоці «Конектори».', 'Claude, ChatGPT, Grok, Cursor… — eigen adres en eigen rechten; koppelen, opnieuw verbinden en intrekken in het blok «Connectors».')}</small>
            </a>
            <a role='listitem' className='ag-kaart ag-methode' href='#tokens' data-ai-methode='tokens'>
              <b>{tr('Токен або «в один клік»', 'Token of «in één klik»')}</b>
              <small>{tr('Для агентів без OAuth: отримати токен тут і вставити в клієнт (вкладка «Токени»).', 'Voor agents zonder OAuth: hier een token halen en in de client plakken (tabblad «Tokens»).')}</small>
            </a>
            <details className='ag-kaart ag-methode' data-ai-methode='mcp'>
              <summary><b>{tr('Стара спільна адреса', 'Het oude gedeelde adres')}</b> <small>{tr('працює для вже підключених ШІ й перенаправляє (308) на адресу агента; для нового підключення беріть адресу свого ШІ з «Конекторів»', 'blijft werken voor al gekoppelde AI en leidt door (308) naar het adres van de agent; neem voor een nieuwe koppeling het adres van uw AI uit «Connectors»')}</small></summary>
              <code className='hub-code' data-mcp-url='1'>{overzicht?.mcpUrl ?? '…'}</code>
              <div className='ag-knoppen'>
                <Knop icoon={gekopieerd ? <Check /> : <Copy />} onClick={() => void kopieer()}>{gekopieerd ? tr('Скопійовано', 'Gekopieerd') : tr('Скопіювати адресу', 'Adres kopiëren')}</Knop>
                <a className='ag-knop ag-knop-default' href={CLAUDE_CONNECTORS} target='_blank' rel='noreferrer'><ExternalLink aria-hidden='true' className='ag-knop-icoon' /><span>{tr('Відкрити конектори Claude', 'Connectors van Claude openen')}</span></a>
              </div>
              <ol className='hub-steps'>
                <li>{tr('У ШІ додайте власний конектор і вставте адресу.', 'Voeg in de AI een eigen connector toe en plak het adres.')}</li>
                <li>{tr('ШІ відкриє цей сайт: увійдіть і натисніть «Дозволити».', 'De AI opent deze site: meld u aan en klik op "Toestaan".')}</li>
                <li>{tr('Підключення з’явиться в списку вище з датою й кнопкою «Відкликати».', 'De verbinding verschijnt in de lijst hierboven met datum en de knop "Intrekken".')}</li>
              </ol>
            </details>
          </div>
          {/* Het bord (vroeger op ai.* onder verbindingen#bord): per AI het adres, het token, «Доступ ШІ» en de voorwaarden, met de weg naar #agent/<slug>. */}
          <details className='ag-kaart ag-bord-uitklap' data-bord='1' open={!actief.length}>
            <summary><Sparkles size={16} aria-hidden='true' /> {tr('Картки підключення для кожного ШІ (Claude, ChatGPT, Grok…)', 'Koppelkaarten per AI (Claude, ChatGPT, Grok…)')}</summary>
            <AgentBord tr={tr} ingebed />
          </details>
      </section>
      {beleidActief ? (
        // Eén plek: met een ondertekend beleid beslist alleen dat beleid; geen tweede set schakelaars die ermee botst.
        <section className='ag-blok' id='ag-ai-hulpmiddelen' data-beleid-actief='1'>
          <header className='ag-blok-kop'>
            <h3 className='ag-blok-titel'><SlidersHorizontal aria-hidden='true' /> {tr('Що ШІ може робити', 'Wat de AI mag')}</h3>
            <div className='ag-knoppen'><a href={canonicalNavigationUrl('admin', 'ai', tr('uk', 'nl') === 'uk' ? 'uk' : 'nl')} className='ag-link' data-beleid-link='admin'>{tr('Доступ ШІ за підписом (технічний профіль)', 'AI-toegang met handtekening (technisch profiel)')} <ExternalLink size={14} aria-hidden='true' /></a></div>
            <p className='ag-blok-uitleg'>{tr('Інструменти сайту (режими «завжди/питати/вимкнено») визначає підписана політика в Адміністрування → «Доступ ШІ» (технічний профіль, лише з вашим passkey); на цій вкладці їх не перемикають. Права кожного окремого ШІ — на вкладці «Конектори».', 'De hulpmiddelen van de site (standen «altijd/vragen/uit») bepaalt het ondertekende beleid in Beheer → «AI-toegang» (technisch profiel, alleen met uw passkey); op dit tabblad schakelt u ze niet. De rechten van elke afzonderlijke AI staan op het tabblad «Connectors».')}</p>
          </header>
        </section>
      ) : (
        <Section id='ag-ai-hulpmiddelen' icon={<SlidersHorizontal />} title={tr('Що ШІ може робити на сайті', 'Wat de AI op de site mag')} subtitle={tr('Кожен інструмент: завжди, питати або вимкнено. Діє, доки не встановлено підписану політику доступу ШІ.', 'Elk hulpmiddel: altijd, vragen of uit. Geldt tot het ondertekende AI-beleid is geïnstalleerd.')} defaultOpen={item === 'hulpmiddelen'}>
          <McpToolsPanel tr={tr} />
        </Section>
      )}
      {!toolPending.length ? <p className='hub-meta ag-voet'><Wrench size={14} aria-hidden='true' /> {tr('Запити ШІ в режимі «питати» з’являються в «Огляді» → «Потрібне ваше рішення».', 'Verzoeken van de AI in de modus "vragen" verschijnen in "Overzicht" → "Uw beslissing is nodig".')}</p> : null}
    </div>
  );
}

function eindVan(x: Item): number | null { return x.oauth ? (x.oauth.revokedAt ?? x.oauth.expiresAt) : x.token ? (isoMs(x.token.revokedAt) ?? isoMs(x.token.expiresAt)) : null; }
function statusHistorie(x: Item, tr: Tr) {
  const eind = eindVan(x);
  const verlopen = x.oauth ? x.oauth.status === 'expired' : !x.token?.revokedAt;
  return verlopen ? tr(`Закінчився ${datum(eind)}`, `Verlopen op ${datum(eind)}`) : tr(`Відкликано ${datum(eind)}`, `Ingetrokken op ${datum(eind)}`);
}
