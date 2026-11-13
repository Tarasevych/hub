// Дошка підключення ШІ на ai.*/connections. Картка розгортається панеллю з горизонтальними вкладками.
// MCP — лише спосіб, якщо каталог клієнта його має. Двері сервера й технічні інструменти сюди не входять.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Plug } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agenten-gegevens';
import { canonicalNavigationUrl, serviceFromLocation } from '../canoniek-navigatie';
import { Logo, type Tr } from '../mcp-ui';
import {
  BORD_AGENTEN, MCP_URL, PRIVE_CAPS, SITE_UMOVY, STANDAARD_STAAT, tabsVoor,
  type BordAgent, type BordKlantId, type TabId,
} from '../../shared/ai-agent-bord';
import { agentVoorKlant, agentUrl } from '../../shared/connector-v2/agenten';
import { aiLogo } from './gegevens';
import { foutTekst } from './fouten';
import AiToegangTab from './AiToegangTab';
import { Knop } from './ui';
import './agenten.css';
// SEC-002 extensie-02/-09 (g10a-2/-3): toegang en tokens van het bord geeft alleen de mens; een vers token leest de AI niet.
import { alleenMens, geenAi, verborgenVoorAi } from '../menselijke-actie';

type CapRij = { id: string; group: string; label: string; hint: string; aanSite: boolean };
type AgentRij = BordAgent & { aan: boolean; tabs: TabId[] };
type Bord = {
  agenten: AgentRij[];
  caps: CapRij[];
  gebruiker: Partial<Record<BordKlantId, Partial<Record<string, boolean>>>>;
  beleidStaat: string;
  mcpUrl: string;
  umovy: readonly string[];
};

// INTEG-001: de namen van de tabbladen stonden alleen in het Oekraïens (ook op de Nederlandse site); nu uk + nl via tr().
const TAB: Record<TabId, readonly [string, string]> = { kaart: ['Картка', 'Kaart'], mcp: ['MCP', 'MCP'], token: ['Токен', 'Token'], toegang: ['Доступ ШІ', 'AI-toegang'], umovy: ['Умови ШІ', 'AI-voorwaarden'] };

const lokaal = (): Bord => ({
  agenten: BORD_AGENTEN.map((a) => ({ ...a, aan: true, tabs: tabsVoor(a.id, STANDAARD_STAAT) })),
  caps: PRIVE_CAPS.map((c) => ({ ...c, aanSite: true })),
  gebruiker: {},
  beleidStaat: 'niet-ingesteld',
  mcpUrl: MCP_URL,
  umovy: SITE_UMOVY,
});

/** Adres van deze AI: zijn eigen connectorpad; valt alleen terug op het oude gedeelde adres als de agent nog geen pad heeft. */
function bordAdres(id: BordKlantId, terugval: string) {
  const a = agentVoorKlant(id);
  return a ? agentUrl(a.slug) : terugval;
}

function dienst() {
  return serviceFromLocation() === 'mcp' ? 'mcp' : 'ai';
}
/** De hub (mcp-host, pagina agents) zonder hash: op de mcp-host zelf blijft het de huidige pagina, op ai.* het volledige adres. */
function hubBasis() {
  if (serviceFromLocation() === 'mcp') return '';
  try { return canonicalNavigationUrl('mcp', 'agents', document.documentElement.lang === 'nl' ? 'nl' : 'uk').replace(/#.*$/, ''); } catch { return ''; }
}

function useKolommen(ref: { current: HTMLElement | null }) {
  const [n, setN] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const meet = () => {
      // Gebruik de gerenderde gridsporen, ook in een smal venster op een groot scherm.
      const sporen = getComputedStyle(el).gridTemplateColumns.trim();
      setN(sporen && sporen !== 'none' ? sporen.split(/\s+/).length : 1);
    };
    meet();
    const ro = new ResizeObserver(meet);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return n;
}

// `ingebed` (INTEG-001): in de hub mcp.* → agents staat het bord in het blok «Підключити новий ШІ»; de eigen kop
// «Підключення ШІ» (h1) zou daar de paginatitel herhalen en valt dan weg. Op ai.* → verbindingen blijft hij staan.
export default function AgentBord({ tr, ingebed = false }: { tr: Tr; ingebed?: boolean }) {
  const [bord, setBord] = useState<Bord>(lokaal);
  const [open, setOpen] = useState<BordKlantId | ''>('');
  const [tab, setTab] = useState<TabId>('kaart');
  const [token, setToken] = useState('');
  const [melding, setMelding] = useState('');
  const [bezig, setBezig] = useState('');
  const rooster = useRef<HTMLDivElement>(null);
  const kolommen = useKolommen(rooster);
  const paneelId = useId();

  useEffect(() => {
    let actief = true;
    api.post('/api/owner/ai-bord', sessionBody(dienst()))
      .then((r) => { if (actief && r.data?.agenten) setBord(r.data as Bord); })
      .catch(() => { /* каталог лишається: дошка видима і без сесії API */ });
    return () => { actief = false; };
  }, []);

  const idx = bord.agenten.findIndex((a) => a.id === open);
  const eindeRij = idx < 0 ? -1 : Math.min(bord.agenten.length - 1, Math.floor(idx / kolommen) * kolommen + kolommen - 1);
  const gekozen = bord.agenten.find((a) => a.id === open) || null;
  const plafond = bord.beleidStaat === 'geldig';

  const openKaart = (id: BordKlantId, aan: boolean) => {
    if (!aan) return;
    setToken('');
    setMelding('');
    if (open === id) { setOpen(''); return; }
    setOpen(id);
    setTab('kaart');
  };

  const zetCap = (cap: string, aan: boolean) => {
    if (!gekozen || plafond) return;
    const capRij = bord.caps.find((c) => c.id === cap);
    if (!capRij?.aanSite) return;
    setBezig(cap);
    const vorige = bord.gebruiker;
    setBord({ ...bord, gebruiker: { ...vorige, [gekozen.id]: { ...vorige[gekozen.id], [cap]: aan } } });
    api.post('/api/owner/ai-bord/modus', { ...sessionBody(dienst()), klant: gekozen.id, cap, aan })
      .then((r) => { if (r.data?.gebruiker) setBord((b) => ({ ...b, gebruiker: r.data.gebruiker })); })
      .catch((e) => { setBord((b) => ({ ...b, gebruiker: vorige })); setMelding(foutTekst(e, tr, ['Не вдалося зберегти доступ', 'Toegang opslaan mislukt'])); })
      .finally(() => setBezig(''));
  };

  const maakToken = () => {
    if (!gekozen) return;
    setBezig('token');
    setMelding('');
    api.post('/api/owner/ai-bord/token', { ...sessionBody(dienst()), klant: gekozen.id, naam: gekozen.naam })
      .then((r) => { setToken(String(r.data?.token?.token || '')); setMelding(tr('Токен показано один раз. Скопіюйте його зараз.', 'Het token wordt één keer getoond. Kopieer het nu.')); })
      .catch((e) => setMelding(foutTekst(e, tr, ['Не вдалося випустити токен', 'Token uitgeven mislukt'])))
      .finally(() => setBezig(''));
  };

  const groepen = useMemo(() => {
    const map = new Map<string, CapRij[]>();
    for (const c of bord.caps) {
      const lijst = map.get(c.group) || [];
      lijst.push(c);
      map.set(c.group, lijst);
    }
    return [...map.entries()];
  }, [bord.caps]);

  return (
    <section className='ag ag-bord-wrap' data-agent-bord='1' data-ingebed={ingebed ? '1' : undefined} {...geenAi}>
      {ingebed ? (
        <p className='ag-blok-uitleg'>{tr('Оберіть ШІ. Картка розгорнеться під блоком: що він вміє, як підключити і який доступ отримає. Лише ваш простір.', 'Kies een AI. De kaart opent eronder: wat hij kan, hoe u koppelt en welke toegang hij krijgt. Alleen uw ruimte.')}</p>
      ) : (
        <header className='ag-kop'>
          <div>
            <h1>{tr('Підключення ШІ', 'AI-koppelingen')}</h1>
            <p>{tr('Оберіть ШІ. Картка розгорнеться під блоком: що він вміє, як підключити і який доступ отримає. Лише ваш простір.', 'Kies een AI. De kaart opent eronder: wat hij kan, hoe u koppelt en welke toegang hij krijgt. Alleen uw ruimte.')}</p>
          </div>
        </header>
      )}
      <div className='ag-bord' ref={rooster} data-kolommen={kolommen}>
        {bord.agenten.map((a, i) => (
          <div key={a.id} className='ag-bord-sleuf' style={{ display: 'contents' }}>
            <button type='button' className={`ag-bord-kaart${open === a.id ? ' is-open' : ''}${a.aan ? '' : ' is-uit'}`} data-agent={a.id} data-agent-aan={a.aan ? '1' : '0'} aria-expanded={open === a.id} aria-controls={open === a.id ? paneelId : undefined} disabled={!a.aan} onClick={() => openKaart(a.id, a.aan)}>
              <Logo kind={aiLogo(a.naam)} size={36} label={a.naam} />
              <span className='ag-bord-naam'>{a.naam}</span>
              <span className='ag-bord-sub'>{a.aan ? tr('Ваш простір', 'Uw ruimte') : tr('Вимкнено для всіх на сайті', 'Uit voor iedereen op de site')}</span>
              <ChevronDown className='ag-bord-pijl' size={16} aria-hidden='true' />
            </button>
            {i === eindeRij && gekozen ? (
              <div id={paneelId} className='ag-bord-paneel' data-agent-paneel={gekozen.id} role='region' aria-label={gekozen.naam}>
                <div className='ag-bord-tabs' role='tablist' aria-label={tr(`Розділи: ${gekozen.naam}`, `Onderdelen: ${gekozen.naam}`)}>
                  {gekozen.tabs.map((id) => (
                    <button key={id} type='button' role='tab' className='ag-bord-tab' aria-selected={tab === id} data-tab={id} onClick={() => setTab(id)}>{tr(TAB[id][0], TAB[id][1])}</button>
                  ))}
                </div>
                {tab === 'kaart' ? (
                  <div className='ag-bord-blad' data-blad='kaart'>
                    <p>{gekozen.kan}</p>
                    <p>{gekozen.toegang}</p>
                    {/* 20.10.2026: de volledige koppelstap (grote knop, deeplink, stappen, ware stand) staat op de plek van die ene AI in de hub. */}
                    {agentVoorKlant(gekozen.id) ? (
                      <a className='ag-knop ag-knop-primary' href={`${hubBasis()}#agent/${agentVoorKlant(gekozen.id)!.slug}`} data-knop='agent-pagina' data-agent-ingang={agentVoorKlant(gekozen.id)!.slug}>
                        <Plug size={15} aria-hidden='true' /> {tr(`Підключити ${gekozen.naam} — сторінка агента`, `${gekozen.naam} koppelen — plek van de agent`)}
                      </a>
                    ) : null}
                    {gekozen.vendorUrl ? (
                      <a className='ag-knop ag-knop-default' href={gekozen.vendorUrl} target='_blank' rel='noopener noreferrer' data-knop='verbinden'>
                        <Plug size={15} aria-hidden='true' /> {tr('Відкрити налаштування виробника', 'Instellingen van de maker openen')}
                      </a>
                    ) : agentVoorKlant(gekozen.id) ? null : (
                      <p className='ag-bord-eerlijk' data-geen-vendor='1'>{gekozen.methoden.length
                        ? tr('Одноразового підключення виробника ще немає. Оберіть спосіб, який уже працює, на вкладках вище.', 'Er is nog geen koppeling in één klik bij de maker. Kies hierboven een manier die wel werkt.')
                        : tr('Для цього ШІ в продукті ще немає жодного способу підключення. Кнопки переходу немає.', 'Voor deze AI is er in het product nog geen manier om te koppelen. Er is geen doorklik.')}</p>
                    )}
                  </div>
                ) : null}
                {/* EEN ШІ — ОДНА АДРЕСА: het adres van DEZE agent (/claude, /gpt, …), niet het ene gedeelde adres van de site. */}
                {tab === 'mcp' ? (
                  <div className='ag-bord-blad' data-blad='mcp'>
                    <p>{gekozen.mcpUk}</p>
                    <p className='ag-bord-url'><code data-agent-adres={gekozen.id}>{bordAdres(gekozen.id, bord.mcpUrl)}</code></p>
                    <Kopieer tekst={bordAdres(gekozen.id, bord.mcpUrl)} tr={tr} />
                  </div>
                ) : null}
                {tab === 'token' ? (
                  <div className='ag-bord-blad' data-blad='token'>
                    <p>{gekozen.tokenUk}</p>
                    <Knop toon='primary' data='token' bezig={bezig === 'token'} onClick={alleenMens(() => maakToken())}>{tr('Випустити токен', 'Token uitgeven')}</Knop>
                    {token ? <p className='ag-bord-url' {...verborgenVoorAi}><code data-token-eenmaal='1'>{token}</code></p> : null}
                    {token ? <Kopieer tekst={token} tr={tr} /> : null}
                  </div>
                ) : null}
                {tab === 'toegang' ? (
                  <div className='ag-bord-blad' data-blad='toegang'>
                    <p>{plafond
                      ? tr('Підписана політика ШІ зараз стеля. Перемикачі лише для перегляду.', 'Het ondertekende AI-beleid is nu het plafond. De schakelaars zijn alleen te bekijken.')
                      : tr('Перемикачі «Доступ ШІ» стосуються лише вашого приватного простору й цього ШІ: усіх його приватних підключень через спільну адресу /mcp, наявних і нових. Вони не змінюють підключень через власну адресу ШІ (їхні інструменти — на сторінці ШІ), MCP-токенів (доступ — у рядку токена) і технічних підключень цього ШІ: ті мають власні права, які змінюються на вкладці «Технічне» (видно з активним технічним профілем) у рядку підключення.',
                        'De schakelaars «AI-toegang» gelden alleen voor uw privéruimte en deze AI: al zijn privéverbindingen via het gedeelde adres /mcp, bestaande en nieuwe. Ze veranderen geen verbindingen via het eigen adres van de AI (hun hulpmiddelen staan op de pagina van de AI), geen MCP-tokens (toegang op de rij van het token) en geen technische verbindingen van deze AI: die hebben eigen rechten, die u wijzigt op het tabblad «Technisch» (zichtbaar met een actief technisch profiel) op de rij van de verbinding.')}</p>
                    <AiToegangTab verbinding={{ soort: 'oauth', id: `bord:${gekozen.id}`, naam: gekozen.naam }} tr={tr} metBeheer />
                    {groepen.length && !plafond ? (
                      <p data-caps-uitleg='1'>{(() => {
                        // De mogelijkheden (app.ai_gebruiker_caps) gelden voor ELKE privé-OAuth-verbinding van deze AI (mcp-connector lijstTools/
                        // roepTool, ook connector v2 via wieVoorKant 'gebruiker'); niet voor MCP-tokens en niet voor technische verbindingen.
                        const adres = agentVoorKlant(gekozen.id) ? ` (${agentUrl(agentVoorKlant(gekozen.id)!.slug).replace(/^https?:\/\/[^/]+/, '')})` : '';
                        return tr(`Можливості нижче — додаткова заборона для всіх приватних підключень цього ШІ: і через спільну адресу /mcp, і через його власну адресу${adres}. MCP-токенів і технічних підключень вони не стосуються. Вимкнене адміністратором лишається вимкненим.`,
                          `De mogelijkheden hieronder zijn een extra verbod voor alle privéverbindingen van deze AI: via het gedeelde adres /mcp én via het eigen adres${adres}. Ze gelden niet voor MCP-tokens en technische verbindingen. Wat de beheerder uitzette, blijft uit.`);
                      })()}</p>
                    ) : null}
                    {groepen.map(([groep, caps]) => (
                      <fieldset key={groep} className='ag-bord-groep'>
                        <legend>{groep}</legend>
                        {caps.map((c) => {
                          const persoonlijk = bord.gebruiker[gekozen.id]?.[c.id];
                          const aan = c.aanSite && persoonlijk !== false;
                          return (
                            <label key={c.id} className='ag-bord-cap' data-cap={c.id} data-cap-uit={c.aanSite ? '0' : '1'}>
                              <input type='checkbox' checked={aan} disabled={!c.aanSite || plafond || bezig === c.id} onChange={alleenMens((e: { target: { checked: boolean }; preventDefault: () => void }) => zetCap(c.id, e.target.checked))} />
                              <span><b>{c.label}</b><small>{c.aanSite ? c.hint : tr('Вимкнено для всіх на сайті', 'Uit voor iedereen op de site')}</small></span>
                            </label>
                          );
                        })}
                      </fieldset>
                    ))}
                  </div>
                ) : null}
                {tab === 'umovy' ? (
                  <div className='ag-bord-blad' data-blad='umovy'>
                    <ul>{bord.umovy.map((u) => <li key={u}>{u}</li>)}</ul>
                  </div>
                ) : null}
                {melding ? <p className='ag-melding' role='status'>{melding}</p> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function Kopieer({ tekst, tr }: { tekst: string; tr: Tr }) {
  const [ok, setOk] = useState(false);
  return <Knop data='kopieer' icoon={ok ? <Check /> : <Copy />} onClick={() => { void navigator.clipboard?.writeText(tekst).then(() => { setOk(true); window.setTimeout(() => setOk(false), 2000); }).catch(() => undefined); }}>{ok ? tr('Скопійовано', 'Gekopieerd') : tr('Скопіювати', 'Kopiëren')}</Knop>;
}
