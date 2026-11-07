// Connector v2 — tabblad «Конектори» op mcp.*/agents. Eén overzicht in de stijl van de beheerpagina's: kaarten met het logo van elke AI,
// zoeken, filteren op stand, sorteren (standaard: laatste actie bovenaan), en rechts «Пришвидшене керування»: één modus op alle
// (of gekozen) agents tegelijk, vaste groepen van rechten en de laatste acties (nieuwste eerst). Per agent: een eigen adres, de actieve
// koppelingen, de rechten (zelfde kiezer als in het toestemmingsvenster), herverbinden en intrekken. Inperken geldt meteen; uitbreiden
// wordt onthouden en vraagt herverbinden. Een massale wijziging toont eerst per agent wat er bij komt en wegvalt; uitbreiden of
// «alle acties» vraagt een verse passkey-bevestiging (zelfde stap als elders: STEP_UP_REQUIRED).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Ban, Check, Copy, Eye, Fingerprint, KeyRound, Link2, RefreshCw, Search, ShieldCheck, ShieldQuestion, SlidersHorizontal, Trash2, UserRound, Wrench, X, Zap } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agenten-gegevens';
import { ondertekenAgentBeleidInPlaats } from '../agenten/beleid-ondertekenen';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import { v2Agent, V2_AGENTEN, type AgentSlug } from '../../shared/connector-v2/agenten';
import { KANT_TEKST, RISICO_TEKST, V2_GROEPEN, V2_OPTIES, type GroepId, type Kant } from '../../shared/connector-v2/catalogus';
import { toolNaam } from '../../shared/connector-v2/namen';
import { breidtUit, hoogsteRisico, MODI, MODUS_TEKST, schoon, STANDAARD, type Modus } from '../../shared/connector-v2/rechten';
import { aantalMogelijk, berekenMassa, basisVan } from '../../shared/connector-v2/massa';
import { standVan } from '../../shared/connector-v2/stand';
import { WEIGER_UITLEG, type AgentToegangDiagnose } from '../../shared/ai-toegang-diagnose';
import { actieZin } from '../../shared/mcp-acties';
import { Logo, type LogoKind } from '../mcp-ui';
import { useJournaal, type JournaalItem } from '../agenten/gegevens';
import { useTech, techActief } from '../tech/tech-opslag';
import RechtenKiezer, { Schakelaar, groepIcoon } from './RechtenKiezer';
import './connector-v2.css';
import './beheer.css';

type Tr = (uk: string, nl: string) => string;
type Keuze = { kanten: Kant[]; sleutels: string[] };
export type AgentStand = {
  slug: AgentSlug; url: string;
  koppelingen: Array<{ id: string; clientName: string; createdAt: number; lastUsedAt: number | null; expiresAt: number; kanten: Kant[]; sleutels: string[] }>;
  voorkeur: (Keuze & { herverbinden: boolean; updatedAt: number }) | null;
  actief: Keuze | null;
  /** 20.10.2026 — de WARE stand (shared/connector-v2/stand.ts): ook het oude /mcp (erfenis) en de serverdeur tellen mee. */
  erfenis?: Array<{ id: string; clientName: string; ruimte: 'prive' | 'technisch'; createdAt: number; lastUsedAt: number | null; expiresAt: number }>;
  deur?: Array<{ id: string; klant: string; deur: string; laatst: number; refreshTot: number }> | null;
  laatst?: number | null;
  /** 01.11.2026 (MCP-ACCESS-001) — exacte oorzakelijke diagnose en echt zichtbaar aantal hulpmiddelen uit v2Lijst. */
  diagnose?: AgentToegangDiagnose;
};
export type Poort = { ruimte: 'prive' | 'technisch'; stand: string; code: string | null };
export type Data = { agenten: AgentStand[]; instellingen: { extraBevestigen: boolean }; account: { email: string; eigenaar: boolean }; methoden: { passkey: boolean; totp: boolean; herstelcode: boolean }; poort?: Poort };

/** Eén regel voor «is deze AI verbonden?» — v2, oud /mcp en serverdeur samen (shared/connector-v2/stand.ts). */
export const standVanAgent = (a: Pick<AgentStand, 'koppelingen' | 'erfenis' | 'deur' | 'voorkeur'>) =>
  standVan({ v2: a.koppelingen.length, erfenis: a.erfenis?.length ?? 0, deur: a.deur === null ? null : (a.deur?.length ?? 0), wacht: !!a.voorkeur?.herverbinden });

const datum = (ms: number | null, uk: boolean) => (ms ? new Date(ms).toLocaleString(uk ? 'uk-UA' : 'nl-BE', { dateStyle: 'short', timeStyle: 'short' }) : '—');


// ---------------------------------------------------------------- hulpjes

const LOGO: Record<AgentSlug, LogoKind> = { claude: 'claude', gpt: 'openai', grok: 'grok', gemini: 'gemini', copilot: 'copilot', cursor: 'cursor', antigravity: 'antigravity', autoclaw: 'autoclaw' };
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const ALLE_SLUGS: AgentSlug[] = V2_AGENTEN.map((a) => a.slug);

/** Relatieve tijd in gewone woorden («5 хв тому»); exacte tijd staat in de title. */
function relatief(ms: number | null, uk: boolean): string {
  if (!ms) return uk ? 'ще не було' : 'nog niet';
  const d = Math.max(0, Date.now() - ms);
  const m = Math.round(d / 60_000);
  if (m < 1) return uk ? 'щойно' : 'zojuist';
  if (m < 60) return uk ? `${m} хв тому` : `${m} min geleden`;
  const h = Math.round(m / 60);
  if (h < 24) return uk ? `${h} год тому` : `${h} uur geleden`;
  const dg = Math.round(h / 24);
  return uk ? `${dg} дн. тому` : `${dg} d geleden`;
}

/** Welke agent hoort bij een journaalregel (v2-agent in de details, anders op naam van de client). */
export function agentVanItem(e: JournaalItem): AgentSlug | null {
  const a = s(e.details.agent);
  if ((ALLE_SLUGS as string[]).includes(a)) return a as AgentSlug;
  const n = `${e.onderwerp?.naam ?? ''} ${s(e.details.client)}`.toLowerCase();
  if (/claude|anthropic/.test(n)) return 'claude';
  if (/chatgpt|openai|gpt/.test(n)) return 'gpt';
  if (/grok|xai/.test(n)) return 'grok';
  if (/gemini/.test(n)) return 'gemini';
  if (/copilot|vscode/.test(n)) return 'copilot';
  if (/cursor/.test(n)) return 'cursor';
  if (/antigravity|jetski/.test(n)) return 'antigravity';
  if (/autoclaw|openclaw|zhipu|chatglm|\bglm\b/.test(n)) return 'autoclaw';
  return null;
}

type Filter = 'alle' | 'verbonden' | 'beschikbaar' | 'wacht';
type Sorteer = 'actie' | 'naam' | 'rechten' | 'risico';
type Voorbeeld = { slug: AgentSlug; verbonden: boolean; kanten: Kant[]; toegevoegd: number; vervalt: number; totaal: number; risico: 'laag' | 'midden' | 'hoog' | 'kritiek'; riskant: number; gevoelig: number; uitbreiding: boolean; gewijzigd: boolean };

/** Vaste groepen van rechten (rechts: «Групи дозволів»): kies er één, controleer de samenvatting, pas toe. */
type Preset = { id: string; groep?: GroepId; modus: Modus; uk: [string, string]; nl: [string, string]; icoon: string };
const PRESETS: readonly Preset[] = [
  { id: 'mail-lezen', groep: 'mail', modus: 'lezen', icoon: 'Mail', uk: ['Пошта (читання)', 'Доступ лише до читання листів'], nl: ['E-mail (lezen)', 'Alleen berichten lezen'] },
  { id: 'mail-alles', groep: 'mail', modus: 'alles', icoon: 'Mail', uk: ['Пошта (повний доступ)', 'Читання, відповіді, створення, видалення'], nl: ['E-mail (volledig)', 'Lezen, antwoorden, maken, verwijderen'] },
  { id: 'agenda', groep: 'agenda', modus: 'lezen-schrijven', icoon: 'CalendarDays', uk: ['Календар', 'Події: перегляд, створення, зміна'], nl: ['Agenda', 'Afspraken: lezen, maken, wijzigen'] },
  { id: 'bestanden', groep: 'bestanden', modus: 'lezen', icoon: 'FolderOpen', uk: ['Файли й фото (читання)', 'Перегляд і читання файлів'], nl: ['Bestanden en foto\'s (lezen)', 'Bestanden bekijken en lezen'] },
  { id: 'bord', groep: 'bord', modus: 'lezen-schrijven', icoon: 'KanbanSquare', uk: ['Дошка й нотатки', 'Читання й запис без видалення'], nl: ['Bord en notities', 'Lezen en schrijven zonder verwijderen'] },
  { id: 'github', groep: 'github', modus: 'lezen', icoon: 'Github', uk: ['GitHub (читання)', 'Репозиторії, issues, CI'], nl: ['GitHub (lezen)', 'Repo\'s, issues, CI'] },
  { id: 'alles-lezen', modus: 'lezen', icoon: 'Eye', uk: ['Усе: лише читання', 'Безпечний режим для всіх категорій'], nl: ['Alles: alleen lezen', 'Veilige stand voor alle categorieën'] },
  { id: 'alles-uit', modus: 'geen', icoon: 'Ban', uk: ['Вимкнути все', 'Забрати всі дозволи (діє одразу)'], nl: ['Alles uit', 'Alle rechten intrekken (direct)'] },
];

// ---------------------------------------------------------------- instellingen van één agent (uitklapbaar in de kaart)

export function AgentInstellingen({ tr, uk, a, eigenaar, naWijziging }: { tr: Tr; uk: boolean; a: AgentStand; eigenaar: boolean; naWijziging: () => Promise<void> }) {
  const info = v2Agent(a.slug);
  const tabTechNu = techActief(useTech());
  // MCP-ACCESS-001: gebruik de WERKELIJKE technische toegang van deze agent op de server (niet de staat van het browsertabblad),
  // zodat het scherm nooit beweert dat technische hulpmiddelen zichtbaar zijn terwijl delegatie, dienst of beleid ze blokkeert.
  const agentTechNu = a.diagnose ? a.diagnose.effectiveTechnicalAccess : tabTechNu;
  const basis: Keuze = a.voorkeur ?? a.actief ?? { kanten: ['gebruiker'], sleutels: STANDAARD() };
  const [kanten, setKanten] = useState<Kant[]>(basis.kanten);
  const [sleutels, setSleutels] = useState<string[]>(basis.sleutels);
  const [melding, setMelding] = useState('');
  const [bezig, setBezig] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);
  useEffect(() => { setKanten(basis.kanten); setSleutels(basis.sleutels); }, [a.voorkeur?.updatedAt, a.actief?.sleutels.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const gekozen = schoon(sleutels, kanten);
  const gewijzigd = gekozen.join() !== schoon(basis.sleutels, basis.kanten).join() || kanten.join() !== basis.kanten.join();
  const verbonden = a.koppelingen.length > 0;
  const heeftActieveVerbinding = verbonden || (a.erfenis?.length ?? 0) > 0;
  const kanDirectToepassen = heeftActieveVerbinding && (
    !!a.voorkeur?.herverbinden
    || !a.actief
    || breidtUit(a.actief.sleutels, gekozen)
    || kanten.some((x) => !a.actief!.kanten.includes(x))
  );
  const beleidIngesteld = eigenaar && !!a.diagnose && a.diagnose.aiPolicyState !== 'niet-ingesteld' && a.diagnose.aiPolicyState !== 'ongeldig';
  const beleidBlokkeert = beleidIngesteld && (
    a.diagnose!.aiPolicyBlockedCount > 0
    || a.diagnose!.aiPolicyState === 'agent-onbekend'
    || a.diagnose!.aiPolicyState === 'agent-uit'
    || a.diagnose!.aiPolicyState === 'verlopen'
    || a.diagnose!.aiPolicyState === 'uit'
  );
  const techActiveringNodig = eigenaar && kanten.includes('beheer') && !agentTechNu && a.diagnose?.aiServiceState !== 'bevroren';
  const heeftActieNodig = gewijzigd || kanDirectToepassen || beleidBlokkeert || techActiveringNodig;
  const vraagtEenActieActivatie = kanDirectToepassen
    || beleidBlokkeert
    || techActiveringNodig
    || (beleidIngesteld && (breidtUit(basis.sleutels, gekozen) || kanten.some((x) => !basis.kanten.includes(x))));
  const voorbeeld = V2_OPTIES.find((o) => o.key === 'v2_whoami:gebruiker');

  const doe = async (pad: string, extra: Record<string, unknown>, ok: (d: any) => string) => {
    setBezig(true); setMelding('');
    try { const r = await api.post(pad, { ...sessionBody(), agent: a.slug, ...extra }); setMelding(ok(r.data)); await naWijziging(); }
    catch (e) {
      const code = String((e as Error)?.message ?? '');
      setMelding(code === 'OWNER_REQUIRED' || code === 'TECH_PROFIEL_VEREIST' ? tr('Технічні інструменти змінює лише власник сайту.', 'Technische hulpmiddelen wijzigt alleen de eigenaar van de site.') : /STEP_UP|NotAllowedError/.test(code) ? tr('Підтвердження скасовано — активний токен не змінено.', 'Bevestiging geannuleerd — het actieve token is niet gewijzigd.') : tr(`Не вдалося (${code || 'немає зв’язку'}).`, `Mislukt (${code || 'geen verbinding'}).`));
    } finally { setBezig(false); }
  };

  // UX-AI-VAULT-001: één gecombineerde actie (zonder herverbinden=true-val en zonder omweg via admin/ai) die met één Passkey-bevestiging
  // tegelijk het ondertekende beleidsplafond (ai-beleid), de actieve koppeling (connector_v2_rechten) én de technische sessiedelegatie bijwerkt.
  const bewaarEnActiveer = async () => {
    if (!vraagtEenActieActivatie) {
      await doe('/api/owner/connector-v2/wijzig', { kanten, sleutels: gekozen }, (d) =>
        verbonden
          ? tr(`Збережено й уже діє для активного підключення (${d.ingeperkt ?? 1}).`, `Opgeslagen en al van kracht voor de actieve koppeling (${d.ingeperkt ?? 1}).`)
          : tr('Збережено. Ці дозволи буде запропоновано під час підключення.', 'Opgeslagen. Deze rechten worden voorgesteld bij het koppelen.'));
      return;
    }
    setBezig(true);
    setMelding('');
    try {
      const delen: string[] = [];
      if (beleidIngesteld) {
        const pol = await ondertekenAgentBeleidInPlaats({
          slug: a.slug,
          naam: info.naam,
          sleutels: gekozen,
          lang: uk ? 'uk' : 'nl',
        });
        if (pol.getekend) {
          delen.push(tr(`політику «Доступ ШІ» підписано (версія ${pol.seq})`, `beleid «AI-toegang» getekend (versie ${pol.seq})`));
        }
      }
      if (heeftActieveVerbinding) {
        const r = await api.post('/api/owner/connector-v2/toepassen', { ...sessionBody(), agent: a.slug, kanten, sleutels: gekozen });
        delen.push(tr(`дозволи застосовано до активного підключення (${r.data?.bijgewerkt ?? 1})`, `rechten toegepast op de actieve koppeling (${r.data?.bijgewerkt ?? 1})`));
      } else {
        await api.post('/api/owner/connector-v2/wijzig', { ...sessionBody(), agent: a.slug, kanten, sleutels: gekozen });
        delen.push(tr('дозволи збережено', 'rechten opgeslagen'));
      }
      if (eigenaar && kanten.includes('beheer') && a.diagnose?.aiServiceState !== 'bevroren') {
        await api.post('/api/owner/connector-v2/activeer-tech', {
          ...sessionBody(),
          agent: a.slug,
          actie: 'alles-aan',
          termijn: 'tot-technisch-einde',
        });
        delen.push(tr('технічний сеанс делеговано', 'technische sessie gedelegeerd'));
      }
      await naWijziging();
      setMelding(`${tr('Готово однією дією', 'In één actie uitgevoerd')}: ${delen.join(' · ')}.`);
    } catch (e) {
      const code = String((e as Error)?.message ?? '');
      setMelding(
        code === 'OWNER_REQUIRED'
          ? tr('Технічні інструменти змінює лише власник сайту.', 'Technische hulpmiddelen wijzigt alleen de eigenaar van de site.')
          : /STEP_UP|NotAllowedError|Підтвердження passkey скасовано|Passkey-bevestiging geannuleerd/i.test(code)
            ? tr('Підтвердження Passkey скасовано — стан не змінено.', 'Passkey-bevestiging geannuleerd — de staat is niet gewijzigd.')
            : code || tr('Не вдалося застосувати дозволи.', 'Rechten toepassen mislukt.'),
      );
    } finally {
      setBezig(false);
    }
  };
  const herverbind = () => doe('/api/owner/connector-v2/herverbind', {}, () => tr(`Підключення закрито. Відкрийте ${info.naam}: він попросить підключитися знову, і ви побачите, що буде додано.`, `Koppeling gesloten. Open ${info.naam}: die vraagt opnieuw te verbinden en u ziet wat erbij komt.`));
  const intrek = () => doe('/api/owner/connector-v2/intrekken', {}, (d) => tr(`Відкликано: ${d.ingetrokken}. ${info.naam} більше нічого не зможе зробити, доки ви знову не підключите.`, `Ingetrokken: ${d.ingetrokken}. ${info.naam} kan niets meer tot u opnieuw koppelt.`));

  const techRedenTekst = agentTechNu
    ? tr('технічний доступ для цього ШІ активний — ці інструменти він бачить зараз', 'technische toegang voor deze AI actief — de AI ziet deze hulpmiddelen nu')
    : a.diagnose?.denialCode
      ? WEIGER_UITLEG[a.diagnose.denialCode][uk ? 'uk' : 'nl']
      : tr('технічний профіль вимкнений — ШІ зараз їх не бачить', 'technisch profiel uit — de AI ziet ze nu niet');

  return (
    <div className='v2-agent-rechten v2b-instellingen'>
      <div className='v2b-adresrij'>
        <code className='v2-adres'>{a.url}</code>
        <button type='button' className='v2-knop' aria-label={tr('Копіювати адресу конектора', 'Connectoradres kopiëren')} onClick={() => { void navigator.clipboard?.writeText(a.url).then(() => { setGekopieerd(true); window.setTimeout(() => setGekopieerd(false), 1500); }); }}>{gekopieerd ? <Check size={14} /> : <Copy size={14} />}{tr('Копіювати адресу', 'Adres kopiëren')}</button>
        {verbonden ? <button type='button' className='v2-knop' disabled={bezig} onClick={() => void herverbind()}><RefreshCw size={14} />{tr('Перепідключити', 'Opnieuw verbinden')}</button> : null}
        {verbonden ? <button type='button' className='v2-knop is-gevaar' disabled={bezig} onClick={() => void intrek()}><Trash2 size={14} />{tr('Відкликати', 'Intrekken')}</button> : null}
      </div>
      {a.koppelingen.length ? (
        <ul className='v2-koppelingen'>
          {a.koppelingen.map((k) => (
            <li key={k.id}>
              <span>{k.clientName}</span>
              <span>{k.kanten.map((x) => <span key={x} className={`v2-kant-teller kant-${x}`}>{x === 'beheer' ? <Wrench size={12} /> : <UserRound size={12} />}{KANT_TEKST[x][uk ? 'uk' : 'nl']}</span>)}</span>
              <span>{k.sleutels.length} {tr('дозволів', 'rechten')} · <span className={`v2-chip risico-${hoogsteRisico(k.sleutels)}`}>{RISICO_TEKST[hoogsteRisico(k.sleutels)][uk ? 'uk' : 'nl']}</span></span>
              <small>{tr('остання дія', 'laatst gebruikt')}: {datum(k.lastUsedAt, uk)}</small>
            </li>
          ))}
        </ul>
      ) : null}
      {eigenaar ? (
        <div className='v2-ruimtes is-rij'>
          {(['gebruiker', 'beheer'] as Kant[]).map((k) => (
            <label key={k} className={`v2-ruimte-kaart kant-${k}${kanten.includes(k) ? ' is-gekozen' : ''}`}>
              <input type='checkbox' checked={kanten.includes(k)} onChange={(e) => setKanten((h) => { const n = e.target.checked ? [...new Set([...h, k])] : h.filter((x) => x !== k); return (n.length ? n : ['gebruiker']).sort() as Kant[]; })} />
              <span className='v2-kant-icoon' aria-hidden='true'>{k === 'beheer' ? <Wrench size={18} /> : <UserRound size={18} />}</span>
              <span><b>{KANT_TEKST[k][uk ? 'uk' : 'nl']}</b>
                {k === 'beheer' ? <small className='v2-let-klein' data-v2-beheer-status={agentTechNu ? 'actief' : (a.diagnose?.denialCode ?? 'uit')}>{techRedenTekst}</small> : null}
              </span>
            </label>
          ))}
        </div>
      ) : null}
      <p className='v2-uitleg'>{tr('Одна адреса на агента. Що ШІ бачить і може викликати, вирішується в момент кожного виклику за вашим поточним станом: приватні інструменти — завжди, технічні — лише поки активний технічний профіль.', 'Eén adres per agent. Wat de AI ziet en kan aanroepen, wordt bij elke aanroep bepaald naar uw huidige staat: privéhulpmiddelen altijd, technische alleen zolang het technische profiel actief is.')}</p>
      <p className='v2-uitleg' data-v2-lijst-cache='1'>{tr('Застосунки ШІ запам’ятовують список інструментів. Коли ви вмикаєте чи вимикаєте технічний профіль, сервер надсилає сповіщення «список змінився» через відкритий потік підключення; якщо застосунок такого потоку не тримає (наприклад, claude.ai), список у поточній розмові оновиться лише після нової розмови або «Перепідключити». Дозволи при цьому не втрачаються.', 'AI-apps onthouden de lijst van hulpmiddelen. Zet u het technische profiel aan of uit, dan stuurt de server «lijst gewijzigd» over de open stroom van de koppeling; houdt de app geen stroom open (bijvoorbeeld claude.ai), dan wordt de lijst in het lopende gesprek pas na een nieuw gesprek of «Opnieuw verbinden» vernieuwd. Rechten gaan daarbij niet verloren.')}</p>
      <RechtenKiezer tr={tr} agent={a.slug} kanten={kanten} waarde={gekozen} onChange={setSleutels} vorige={verbonden && a.actief ? a.actief.sleutels : null} techNu={agentTechNu} />
      <div className='v2-agent-acties'>
        <button type='button' className='v2-knop is-primair' disabled={bezig || !heeftActieNodig} onClick={() => void bewaarEnActiveer()} data-v2-bewaar={a.slug}>
          {vraagtEenActieActivatie ? <Fingerprint size={15} /> : <Check size={15} />}
          {vraagtEenActieActivatie
            ? tr('Зберегти й активувати (Passkey)', 'Opslaan en activeren (Passkey)')
            : tr('Зберегти', 'Opslaan')}
        </button>
        {vraagtEenActieActivatie ? (
          <small className='v2-let-klein'>
            {tr(
              'Однією дією оновлює активний грант без перепідключення, підписує політику-стелю «Доступ ШІ» та за потреби делегує технічний сеанс.',
              'Werkt in één actie de actieve koppeling bij zonder opnieuw verbinden, ondertekent het beleidsplafond «AI-toegang» en delegeert zo nodig de technische sessie.',
            )}
          </small>
        ) : null}
      </div>
      {voorbeeld ? <p className='v2-uitleg'>{tr('Приклад назви інструмента для цього агента:', 'Voorbeeld van een hulpmiddelnaam voor deze agent:')} <code>{toolNaam(voorbeeld, a.slug)}</code></p> : null}
      {melding ? <p className='v2-melding' role='status'>{melding}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- kaart met logo

// 20.10.2026 — «один ШІ — одна вкладка»: de kaart is hier nog maar het OVERZICHT van een agent. Instellen (adres, rechten,
// ruimte, tokens, kleur, journaal) gebeurt op de plek van die ene agent (#agent/<slug>), zodat het niet op twee plekken staat.
type KaartProps = { tr: Tr; uk: boolean; a: AgentStand; eigenaar: boolean; laatste: number | null; gekozen: boolean; onKies: (v: boolean) => void; naWijziging: () => Promise<void> };
function AgentKaart({ tr, uk, a, laatste, gekozen, onKies }: KaartProps) {
  const info = v2Agent(a.slug);
  // De WARE stand: een AI die via het oude /mcp of de serverdeur werkt, is verbonden — alleen langs een oude weg.
  const ware = standVanAgent(a);
  const verbonden = ware.verbonden;
  const basis = basisVan(a.voorkeur, a.actief);
  const aan = schoon(basis.sleutels, basis.kanten).length;
  const totaal = aantalMogelijk(basis.kanten);
  const risico = hoogsteRisico(schoon(basis.sleutels, basis.kanten));
  const stand = { tekst: tr(ware.uk, ware.nl), klas: ware.code === 'wacht' ? 'is-wacht' : ware.alleenOud ? 'is-oud' : verbonden ? 'is-aan' : 'is-uit' };
  const uitleg = uk ? info.uk : info.nl;
  return (
    <li className={`v2b-kaart${verbonden ? ' is-verbonden' : ''}${gekozen ? ' is-gekozen' : ''}`} data-v2-agent={a.slug} data-v2-stand={ware.code}>
      <div className='v2b-kaart-kop'>
        <span className='v2b-logo' aria-hidden='true'><Logo kind={LOGO[a.slug]} size={34} /></span>
        <div className='v2b-kaart-titel'>
          <h3>{info.naam}</h3>
          <span className={`v2b-stand ${stand.klas}`}><i aria-hidden='true' />{stand.tekst}</span>
        </div>
        <label className='v2b-kies' title={tr('Вибрати для масових дій', 'Kiezen voor massale acties')}>
          <input type='checkbox' checked={gekozen} onChange={(e) => onKies(e.target.checked)} aria-label={tr(`Вибрати ${info.naam} для масових дій`, `${info.naam} kiezen voor massale acties`)} />
          <span aria-hidden='true'><Check size={13} /></span>
        </label>
      </div>
      <p className='v2b-kaart-tekst'>{uitleg}</p>
      <div className='v2b-teller'>
        <span className='v2b-teller-icoon' aria-hidden='true'><Zap size={15} /></span>
        <span className='v2b-teller-tekst'>
          <small>{tr('Дії для агента', 'Acties voor agent')}</small>
          <b>{verbonden && a.diagnose
            ? tr(`доступно зараз: ${a.diagnose.effectiveVisibleToolsCount} (обрано ${aan} з ${totaal})`, `nu beschikbaar: ${a.diagnose.effectiveVisibleToolsCount} (${aan} van ${totaal} gekozen)`)
            : tr(`${aan} з ${totaal} увімкнено`, `${aan} van ${totaal} aan`)}</b>
        </span>
        <span className={`v2-chip risico-${risico}`}>{RISICO_TEKST[risico][uk ? 'uk' : 'nl']}</span>
      </div>
      {verbonden && a.diagnose?.denialCode ? (
        <p className='v2-let-klein' data-v2-kaart-diagnose={a.diagnose.denialCode}>
          <AlertTriangle size={13} aria-hidden='true' /> {WEIGER_UITLEG[a.diagnose.denialCode][uk ? 'uk' : 'nl']}
        </p>
      ) : null}
      <div className='v2b-kaart-meta'>
        <span>{a.koppelingen.some((k) => k.kanten.includes('beheer')) || (!verbonden && basis.kanten.includes('beheer')) ? <span className='v2-kant-teller kant-beheer'><Wrench size={12} />{KANT_TEKST.beheer[uk ? 'uk' : 'nl']}</span> : null}<span className='v2-kant-teller kant-gebruiker'><UserRound size={12} />{KANT_TEKST.gebruiker[uk ? 'uk' : 'nl']}</span></span>
        <small title={laatste ? new Date(laatste).toLocaleString(uk ? 'uk-UA' : 'nl-BE') : ''}>{tr('остання дія', 'laatste actie')}: {relatief(laatste, uk)}</small>
      </div>
      <div className='v2b-kaart-acties'>
        <a className='v2-knop' href={`#agent/${a.slug}`} data-v2-open={a.slug}><SlidersHorizontal size={15} />{tr(`Керувати ${v2Agent(a.slug).naam}`, `${v2Agent(a.slug).naam} beheren`)}<ArrowRight size={14} aria-hidden='true' /></a>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- samenvatting vóór een massale wijziging

function MassaVenster({ tr, uk, voorbeeld, bezig, melding, klaar, onAnnuleer, onBevestig }: { tr: Tr; uk: boolean; voorbeeld: Voorbeeld[]; bezig: boolean; melding: string; klaar: boolean; onAnnuleer: () => void; onBevestig: () => void }) {
  const wijzigend = voorbeeld.filter((v) => v.gewijzigd);
  const riskant = voorbeeld.reduce((n, v) => n + v.riskant, 0);
  const gevoelig = voorbeeld.reduce((n, v) => n + v.gevoelig, 0);
  const uitbreiding = voorbeeld.some((v) => v.uitbreiding);
  const herverbinden = voorbeeld.filter((v) => v.uitbreiding && v.verbonden).length;
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !bezig) onAnnuleer(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [bezig, onAnnuleer]);
  return (
    <div className='v2b-overlay' role='presentation' onMouseDown={(e) => { if (e.target === e.currentTarget && !bezig) onAnnuleer(); }}>
      <div className='v2b-venster' role='dialog' aria-modal='true' aria-labelledby='v2b-venster-titel'>
        <header>
          <h3 id='v2b-venster-titel'>{klaar ? tr('Готово', 'Klaar') : tr('Перевірте зміни перед застосуванням', 'Controleer de wijzigingen voor het toepassen')}</h3>
          <button type='button' className='v2b-sluit' aria-label={tr('Закрити', 'Sluiten')} onClick={onAnnuleer} disabled={bezig}><X size={18} /></button>
        </header>
        <div className='v2b-venster-lijf'>
          <table className='v2b-tabel'>
            <thead><tr><th>{tr('Агент', 'Agent')}</th><th>{tr('Додається', 'Erbij')}</th><th>{tr('Зникає', 'Vervalt')}</th><th>{tr('Разом', 'Totaal')}</th><th>{tr('Ризик', 'Risico')}</th></tr></thead>
            <tbody>
              {voorbeeld.map((v) => (
                <tr key={v.slug} className={v.gewijzigd ? '' : 'is-ongewijzigd'}>
                  <td><span className='v2b-tabel-agent'><Logo kind={LOGO[v.slug]} size={20} />{v2Agent(v.slug).naam}</span></td>
                  <td className={v.toegevoegd ? 'is-plus' : ''}>{v.toegevoegd ? `+${v.toegevoegd}` : '—'}</td>
                  <td className={v.vervalt ? 'is-min' : ''}>{v.vervalt ? `−${v.vervalt}` : '—'}</td>
                  <td>{v.totaal}</td>
                  <td><span className={`v2-chip risico-${v.risico}`}>{RISICO_TEKST[v.risico][uk ? 'uk' : 'nl']}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!wijzigend.length ? <p className='v2-uitleg'>{tr('Нічого не зміниться: ці налаштування вже діють.', 'Er verandert niets: deze instellingen gelden al.')}</p> : null}
          {riskant > 0 ? <p className='v2-let' role='note'><AlertTriangle size={15} aria-hidden='true' />{tr(`Додається ризикованих дозволів (високий або критичний ризик): ${riskant}.`, `Er komen risicovolle rechten bij (hoog of kritiek risico): ${riskant}.`)}{gevoelig ? tr(` З них чутливих (пошта, фото): ${gevoelig}.`, ` Waarvan gevoelig (mail, foto's): ${gevoelig}.`) : ''}</p> : null}
          {uitbreiding && !klaar ? <p className='v2-let' role='note'><KeyRound size={15} aria-hidden='true' />{tr('Розширення дозволів потребує підтвердження passkey — браузер попросить його після натискання кнопки.', 'Uitbreiden van rechten vraagt bevestiging met passkey — de browser vraagt die na het indrukken van de knop.')}</p> : null}
          {herverbinden > 0 && !klaar ? <p className='v2-uitleg'>{tr(`Для ${herverbinden} підключених агентів нові дозволи з’являться після перепідключення; обмеження діють одразу.`, `Bij ${herverbinden} gekoppelde agents verschijnen nieuwe rechten na opnieuw verbinden; beperkingen gelden meteen.`)}</p> : null}
          {melding ? <p className='v2-melding' role='status'>{melding}</p> : null}
        </div>
        <footer>
          {klaar ? <button type='button' className='v2-knop is-primair' onClick={onAnnuleer}><Check size={15} />{tr('Закрити', 'Sluiten')}</button> : (
            <>
              <button type='button' className='v2-knop' onClick={onAnnuleer} disabled={bezig}>{tr('Скасувати', 'Annuleren')}</button>
              <button type='button' className='v2-knop is-primair' onClick={onBevestig} disabled={bezig || !wijzigend.length} data-v2-massa-bevestig>{uitbreiding ? <KeyRound size={15} /> : <Check size={15} />}{bezig ? tr('Застосовую…', 'Toepassen…') : uitbreiding ? tr('Підтвердити passkey і застосувати', 'Bevestigen met passkey en toepassen') : tr('Застосувати', 'Toepassen')}</button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tabblad

/** `ingebed` (INTEG-001, hub mcp.* → agents): het blok «Конектори» van de pagina geeft al de titel en de ene zin uitleg, de filters
 *  tonen al «підключено/чекають» per stand en «Останні події» + «Журнал» staan elders op dezelfde pagina. Dan valt hier weg wat
 *  anders dubbel zou staan: de eigen kop met samenvatting en het paneel «Останні дії». Elders (ai.* → verbindingen) blijft alles. */
export default function ConnectorsTab({ tr, ingebed = false }: { tr: Tr; ingebed?: boolean }) {
  const uk = tr('uk', 'nl') === 'uk';
  const lang = uk ? 'uk' : 'nl';
  const [data, setData] = useState<Data | null>(null);
  const [fout, setFout] = useState('');
  const [zoek, setZoek] = useState('');
  const [filter, setFilter] = useState<Filter>('alle');
  const [sorteer, setSorteer] = useState<Sorteer>('actie');
  const [selectie, setSelectie] = useState<AgentSlug[]>([]);
  const [alleAgenten, setAlleAgenten] = useState(false);
  const [alleActies, setAlleActies] = useState(false);
  const [modus, setModus] = useState<Modus>('lezen');
  const [kantenKeuze, setKantenKeuze] = useState<Kant[]>(['gebruiker']);
  const [groep, setGroep] = useState<GroepId | ''>('');
  const [preset, setPreset] = useState('');
  const [voorbeeld, setVoorbeeld] = useState<Voorbeeld[] | null>(null);
  const [bezig, setBezig] = useState(false);
  const [massaMelding, setMassaMelding] = useState('');
  const [klaar, setKlaar] = useState(false);
  const [versie, setVersie] = useState(0);

  const laad = useCallback(async () => {
    try { setData((await api.post('/api/owner/connector-v2/overzicht', sessionBody())).data as Data); setFout(''); }
    catch (e) { setFout(String((e as Error)?.message ?? 'FOUT')); }
  }, []);
  useEffect(() => { void laad(); }, [laad]);
  const naWijziging = useCallback(async () => { await laad(); setVersie((v) => v + 1); }, [laad]);
  const zetExtra = async (v: boolean) => {
    try { await api.post('/api/owner/connector-v2/instellingen', { ...sessionBody(), extraBevestigen: v }); await laad(); }
    catch (e) { setFout(String((e as Error)?.message ?? 'FOUT')); }
  };

  // Laatste acties van AI (nieuwste eerst) uit het journaal: voedt de lijst rechts én «остання дія» op elke kaart.
  const journaal = useJournaal({ soort: 'werk', onderwerp: '', limit: 60 }, true, versie);
  const acties = useMemo(() => [...(journaal.items ?? [])].sort((x, y) => y.at - x.at), [journaal.items]);
  const laatstePerAgent = useMemo(() => {
    const m = new Map<AgentSlug, number>();
    for (const e of acties) { const sl = agentVanItem(e); if (sl && !m.has(sl)) m.set(sl, e.at); }
    for (const a of data?.agenten ?? []) {
      const k = Math.max(0, a.laatst ?? 0, ...a.koppelingen.map((x) => x.lastUsedAt ?? 0));
      if (k > (m.get(a.slug) ?? 0)) m.set(a.slug, k);
    }
    return m;
  }, [acties, data]);

  const agenten = data?.agenten ?? [];
  const eigenaar = !!data?.account.eigenaar;
  const aantallen = useMemo(() => ({
    alle: agenten.length,
    verbonden: agenten.filter((a) => standVanAgent(a).verbonden).length,
    beschikbaar: agenten.filter((a) => !standVanAgent(a).verbonden).length,
    wacht: agenten.filter((a) => a.voorkeur?.herverbinden).length,
  }), [agenten]);

  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    const lijst = agenten.filter((a) => {
      if (filter === 'verbonden' && !standVanAgent(a).verbonden) return false;
      if (filter === 'beschikbaar' && standVanAgent(a).verbonden) return false;
      if (filter === 'wacht' && !a.voorkeur?.herverbinden) return false;
      if (q && !`${v2Agent(a.slug).naam} ${a.slug} ${v2Agent(a.slug).uk} ${v2Agent(a.slug).nl}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const naam = (a: AgentStand) => v2Agent(a.slug).naam;
    const aanTel = (a: AgentStand) => { const b = basisVan(a.voorkeur, a.actief); return schoon(b.sleutels, b.kanten).length; };
    const rang = { laag: 0, midden: 1, hoog: 2, kritiek: 3 } as const;
    const risicoVan = (a: AgentStand) => { const b = basisVan(a.voorkeur, a.actief); return rang[hoogsteRisico(schoon(b.sleutels, b.kanten))]; };
    return [...lijst].sort((x, y) => {
      if (sorteer === 'naam') return naam(x).localeCompare(naam(y));
      if (sorteer === 'rechten') return aanTel(y) - aanTel(x) || naam(x).localeCompare(naam(y));
      if (sorteer === 'risico') return risicoVan(y) - risicoVan(x) || naam(x).localeCompare(naam(y));
      // Standaard: laatste actie bovenaan; wie nog nooit iets deed onderaan, daarbinnen gekoppeld eerst.
      return (laatstePerAgent.get(y.slug) ?? 0) - (laatstePerAgent.get(x.slug) ?? 0) || (standVanAgent(y).totaal - standVanAgent(x).totaal) || naam(x).localeCompare(naam(y));
    });
  }, [agenten, filter, zoek, sorteer, laatstePerAgent]);

  // ------------------------------------------------ massaal
  const doelAgenten: AgentSlug[] = alleAgenten ? ALLE_SLUGS : selectie;
  const werkModus: Modus = alleActies ? 'alles' : modus;
  const kiesAgent = (slug: AgentSlug, aan: boolean) => setSelectie((l) => (aan ? [...new Set([...l, slug])] : l.filter((x) => x !== slug)));
  const zetPreset = (p: Preset) => {
    const nu = preset === p.id ? '' : p.id;
    setPreset(nu);
    if (nu) { setGroep(p.groep ?? ''); setModus(p.modus); setAlleActies(false); } else setGroep('');
  };
  const invoer = { modus: werkModus, kanten: kantenKeuze.length ? kantenKeuze : ['gebruiker' as Kant], ...(groep ? { groep } : {}) };
  const body = () => ({ ...sessionBody(), agenten: alleAgenten ? 'alle' : selectie, modus: invoer.modus, kanten: invoer.kanten, ...(groep ? { groep } : {}) });
  const toonSamenvatting = async () => {
    setBezig(true); setMassaMelding(''); setKlaar(false);
    try { const r = await api.post('/api/owner/connector-v2/massa', { ...body(), voorbeeld: true }); setVoorbeeld(r.data.agenten as Voorbeeld[]); }
    catch (e) {
      const code = String((e as Error)?.message ?? '');
      // Zelfde berekening in de browser als terugval: de server blijft leidend bij het opslaan.
      if (!code || code === 'NETWORK_ERROR') {
        setVoorbeeld(doelAgenten.map((slug) => { const a = agenten.find((x) => x.slug === slug); const b = basisVan(a?.voorkeur, a?.actief); const u = berekenMassa(b, invoer); return { slug, verbonden: !!a?.koppelingen.length, kanten: u.kanten, toegevoegd: u.toegevoegd, vervalt: u.vervalt, totaal: u.totaal, risico: u.risico, riskant: u.riskant, gevoelig: u.gevoelig, uitbreiding: u.uitbreiding, gewijzigd: u.gewijzigd }; }));
      } else setFout(code);
    } finally { setBezig(false); }
  };
  const pasToe = async () => {
    setBezig(true); setMassaMelding('');
    try {
      const r = await api.post('/api/owner/connector-v2/massa', body());
      const gedaan = (r.data.resultaat ?? []) as Array<{ gewijzigd: boolean; herverbinden: boolean }>;
      const n = gedaan.filter((g) => g.gewijzigd).length;
      const h = gedaan.filter((g) => g.herverbinden).length;
      setMassaMelding(tr(`Застосовано до ${n} агентів.${h ? ` Для ${h} з них нові дозволи з’являться після перепідключення.` : ''}`, `Toegepast op ${n} agents.${h ? ` Bij ${h} daarvan verschijnen nieuwe rechten na opnieuw verbinden.` : ''}`));
      setKlaar(true); await naWijziging();
    } catch (e) {
      const code = String((e as Error)?.message ?? '');
      setMassaMelding(code === 'TECH_PROFIEL_VEREIST' || code === 'OWNER_REQUIRED' ? tr('Технічний доступ змінює лише власник з активним технічним профілем у цій вкладці.', 'Technische toegang wijzigt alleen de eigenaar met actief technisch profiel in dit tabblad.') : /STEP_UP/.test(code) ? tr('Підтвердження не пройдено — нічого не змінено.', 'Bevestiging niet gelukt — er is niets gewijzigd.') : tr(`Не вдалося (${code || 'немає зв’язку'}). Нічого не змінено.`, `Mislukt (${code || 'geen verbinding'}). Er is niets gewijzigd.`));
    } finally { setBezig(false); }
  };

  const groepen = V2_GROEPEN.filter((g) => kantenKeuze.some((k) => g.kant === 'beide' || g.kant === k));
  const presetNaam = PRESETS.find((p) => p.id === preset);

  return (
    <div className='ag-tab v2-tab v2b' data-v2-tab='connectors' data-ingebed={ingebed ? '1' : undefined}>
      {ingebed ? null : <div className='v2b-hoofd'>
        <div className='v2b-titel'>
          <h2>{tr('Конектори ШІ', 'AI-connectors')}</h2>
          <p>{tr('Кожен ШІ підключається за своєю адресою. Керуйте доступом одного агента або одразу всіх: вмикайте, обмежуйте, відкликайте.', 'Elke AI verbindt via een eigen adres. Beheer de toegang van één agent of van alle tegelijk: aanzetten, beperken, intrekken.')}</p>
        </div>
        <div className='v2b-samenvatting' aria-label={tr('Підсумок', 'Samenvatting')}>
          {/* HUB-03: zonder antwoord van de server (503, netwerk) geen «0 з 0» maar «onbekend». */}
          <b data-v2-teller={data ? 'bekend' : 'onbekend'}>{data ? tr(`${aantallen.verbonden} підключено з ${aantallen.alle}`, `${aantallen.verbonden} gekoppeld van ${aantallen.alle}`) : fout ? tr('Стан невідомий', 'Stand onbekend') : tr('Завантаження…', 'Laden…')}</b>
          <small>{!data ? (fout ? tr('сервер не відповів', 'de server antwoordde niet') : '') : aantallen.wacht ? tr(`${aantallen.wacht} чекає перепідключення`, `${aantallen.wacht} wacht op opnieuw verbinden`) : tr('усе актуально', 'alles actueel')}</small>
        </div>
      </div>}

      {fout ? <p className='ag-melding ag-melding-fout' role='alert'>{tr(`Не вдалося завантажити (${fout}).`, `Laden mislukt (${fout}).`)}</p> : null}

      <div className='v2b-indeling'>
        <div className='v2b-links'>
          <div className='v2b-werkbalk' role='toolbar' aria-label={tr('Фільтри й пошук', 'Filters en zoeken')}>
            <div className='v2b-filters' role='tablist' aria-label={tr('Фільтр агентів', 'Filter van agents')}>
              {([['alle', tr('Усі', 'Alle')], ['verbonden', tr('Підключені', 'Gekoppeld')], ['beschikbaar', tr('Доступні', 'Beschikbaar')], ['wacht', tr('Чекають', 'Wachtend')]] as Array<[Filter, string]>).map(([id, naam]) => (
                <button key={id} type='button' role='tab' aria-selected={filter === id} className={filter === id ? 'is-actief' : ''} onClick={() => setFilter(id)}>{naam}{/* HUB-03: zonder antwoord van de server geen «0» (onbekend ≠ nul) */}{data ? <span className='v2-teller'>{aantallen[id]}</span> : null}</button>
              ))}
            </div>
            <label className='v2b-sorteer'>
              <span>{tr('Сортування', 'Sorteren')}</span>
              <select value={sorteer} onChange={(e) => setSorteer(e.target.value as Sorteer)} aria-label={tr('Сортування агентів', 'Agents sorteren')}>
                <option value='actie'>{tr('За останньою дією', 'Laatste actie')}</option>
                <option value='naam'>{tr('За назвою', 'Naam')}</option>
                <option value='rechten'>{tr('За кількістю дозволів', 'Aantal rechten')}</option>
                <option value='risico'>{tr('За ризиком', 'Risico')}</option>
              </select>
            </label>
            <label className='v2b-zoek'><Search size={15} aria-hidden='true' /><input type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} onInput={(e) => setZoek((e.target as HTMLInputElement).value)} placeholder={tr('Пошук агента…', 'Agent zoeken…')} aria-label={tr('Пошук агента', 'Agent zoeken')} />{zoek ? <button type='button' className='v2b-zoek-wis' onClick={() => setZoek('')} aria-label={tr('Очистити пошук', 'Zoekopdracht wissen')} data-v2-zoek-wis='1'>×</button> : null}</label>
          </div>

          {data ? (
            zichtbaar.length ? (
              <ul className='v2b-rooster v2-agenten'>
                {zichtbaar.map((a) => (
                  <AgentKaart key={a.slug} tr={tr} uk={uk} a={a} eigenaar={eigenaar} laatste={laatstePerAgent.get(a.slug) ?? null}
                    gekozen={selectie.includes(a.slug)} onKies={(v) => kiesAgent(a.slug, v)} naWijziging={naWijziging} />
                ))}
              </ul>
            ) : <p className='v2b-leeg'>{tr('Нічого не знайдено. Змініть фільтр або пошук.', 'Niets gevonden. Pas het filter of de zoekopdracht aan.')}</p>
          ) : !fout ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : null}

          <section className='v2-instelling' aria-label={tr('Захист підключень', 'Beveiliging van koppelingen')}>
            {/* HUB-03: geen gegevens → geen schakelaar «UIT» tonen (dat is een bewering), maar de onbekend-staat. */}
            {data ? <Schakelaar aan={!!data.instellingen.extraBevestigen} kant='gebruiker' label={tr('Додаткове підтвердження кожного нового підключення', 'Extra bevestiging van elke nieuwe koppeling')} onChange={(v) => void zetExtra(v)} />
              : <span className='v2-schakelaar is-onbekend' role='img' aria-label={tr('Стан невідомий', 'Stand onbekend')} data-v2-schakelaar='onbekend' title={tr('Стан невідомий: сервер не відповів', 'Stand onbekend: de server antwoordde niet')}><span className='v2-schakelaar-knop' aria-hidden='true'>?</span></span>}
            <div>
              <b>{tr('Додаткове підтвердження кожного нового підключення', 'Extra bevestiging van elke nieuwe koppeling')}</b>
              {!data && fout ? <p className='v2-let' role='note'>{tr('Стан невідомий — сервер не відповів. Поточне налаштування не змінено.', 'Stand onbekend — de server antwoordde niet. De huidige instelling is niet gewijzigd.')}</p> : null}
              <p>{tr('Перед видачею доступу сайт попросить passkey або код із застосунку-автентифікатора — навіть якщо ви щойно увійшли. Це захищає, якщо хтось заволодів вашою сесією в браузері.', 'Voor toegang vraagt de site een passkey of code uit de authenticator-app — ook als u net bent aangemeld. Dat beschermt als iemand uw browsersessie overneemt.')}</p>
              {data && !data.methoden.passkey && !data.methoden.totp ? (
                <p className='v2-let' role='note'><ShieldQuestion size={15} aria-hidden='true' />{tr('У вас ще немає passkey чи застосунку-автентифікатора, тому зараз підтвердження йде через повторний вхід Google. Додайте сильніший спосіб:', 'U hebt nog geen passkey of authenticator-app, dus nu gaat de bevestiging via opnieuw aanmelden met Google. Voeg een sterkere manier toe:')} <a href={canonicalNavigationUrl('identity', 'methods', lang)}><KeyRound size={13} />{tr('Способи входу', 'Aanmeldmethoden')}</a></p>
              ) : data ? <p className='v2-ok'><ShieldCheck size={15} />{tr('Сильний спосіб підтвердження є', 'Een sterke bevestigingsmanier is aanwezig')} ({[data.methoden.passkey ? 'passkey' : '', data.methoden.totp ? tr('застосунок', 'app') : ''].filter(Boolean).join(', ')})</p> : null}
            </div>
          </section>
          <p className='v2-uitleg'>{tr('Старий загальний конектор /mcp продовжує працювати для вже підключених ШІ. Його дозволи не зникають: на новій адресі того самого ШІ вони діють як спадщина (без повторної згоди), а вікно згоди пропонує їх уже позначеними.', 'De oude gezamenlijke connector /mcp blijft werken voor al gekoppelde AI. Zijn rechten verdwijnen niet: op het nieuwe adres van dezelfde AI gelden ze als erfenis (zonder nieuwe toestemming), en het toestemmingsvenster biedt ze al aangevinkt aan.')}</p>
        </div>

        <aside className='v2b-rechts' aria-label={tr('Масове керування', 'Massale acties')}>
          <section className='v2b-paneel v2b-snel' data-v2-massa>
            <header><span className='v2b-paneel-icoon' aria-hidden='true'><Zap size={18} /></span><div><h3>{tr('Пришвидшене керування', 'Snel beheren')}</h3><small>{tr('Застосуйте налаштування до кількох агентів одразу', 'Pas instellingen op meerdere agents tegelijk toe')}</small></div></header>
            <div className='v2b-rij'>
              <div><b>{tr('Увімкнути всіх агентів', 'Alle agents aanzetten')}</b><small>{tr(`Застосувати до всіх ${aantallen.alle} агентів, а не лише до вибраних`, `Op alle ${aantallen.alle} agents toepassen, niet alleen op de gekozen`)}</small></div>
              <Schakelaar aan={alleAgenten} kant='gebruiker' label={tr('Увімкнути всіх агентів', 'Alle agents aanzetten')} onChange={setAlleAgenten} />
            </div>
            <div className={`v2b-rij${alleActies ? ' is-gevaar' : ''}`}>
              <div><b>{tr('Дозволити всі дії', 'Alle acties toestaan')}</b><small>{tr('Читання, запис і видалення — найвищий рівень. Потрібен passkey.', 'Lezen, schrijven en verwijderen — hoogste niveau. Passkey nodig.')}</small></div>
              <Schakelaar aan={alleActies} kant='beheer' label={tr('Дозволити всі дії', 'Alle acties toestaan')} onChange={setAlleActies} />
            </div>
            {!alleActies ? (
              <div className='v2b-veld'>
                <span>{tr('Рівень дозволів', 'Niveau van rechten')}</span>
                <div className='v2b-modus' role='radiogroup' aria-label={tr('Рівень дозволів', 'Niveau van rechten')}>
                  {MODI.filter((m) => m !== 'alles').map((m) => (
                    <button key={m} type='button' role='radio' aria-checked={modus === m} className={modus === m ? 'is-actief' : ''} onClick={() => { setModus(m); setPreset(''); }}>{MODUS_TEKST[m][lang]}</button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className='v2b-veld'>
              <span>{tr('Категорія', 'Categorie')}</span>
              <select value={groep} onChange={(e) => { setGroep(e.target.value as GroepId | ''); setPreset(''); }} aria-label={tr('Категорія дозволів', 'Rechtencategorie')}>
                <option value=''>{tr('Усі категорії', 'Alle categorieën')}</option>
                {groepen.map((g) => <option key={g.id} value={g.id}>{uk ? g.uk : g.nl}</option>)}
              </select>
            </div>
            {eigenaar ? (
              <div className='v2b-veld'>
                <span>{tr('Простір', 'Ruimte')}</span>
                <div className='v2b-ruimtes'>
                  {(['gebruiker', 'beheer'] as Kant[]).map((k) => (
                    <label key={k} className={`kant-${k}${kantenKeuze.includes(k) ? ' is-gekozen' : ''}`}>
                      <input type='checkbox' checked={kantenKeuze.includes(k)} onChange={(e) => setKantenKeuze((h) => { const n = e.target.checked ? [...new Set([...h, k])] : h.filter((x) => x !== k); return (n.length ? n : ['gebruiker']) as Kant[]; })} />
                      {k === 'beheer' ? <Wrench size={13} aria-hidden='true' /> : <UserRound size={13} aria-hidden='true' />}{KANT_TEKST[k][lang]}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            {presetNaam ? <p className='v2b-gekozen-preset'><Check size={13} aria-hidden='true' />{tr('Група:', 'Groep:')} <b>{uk ? presetNaam.uk[0] : presetNaam.nl[0]}</b></p> : null}
            <button type='button' className={`v2-knop is-primair v2b-toepassen${alleActies ? ' is-gevaar' : ''}`} disabled={!doelAgenten.length || bezig || !data} onClick={() => void toonSamenvatting()} data-v2-massa-toepassen>
              <Zap size={15} />{doelAgenten.length ? tr(`Застосувати до ${doelAgenten.length} ${doelAgenten.length === 1 ? 'агента' : 'агентів'}`, `Toepassen op ${doelAgenten.length} ${doelAgenten.length === 1 ? 'agent' : 'agents'}`) : tr('Оберіть агентів у списку', 'Kies agents in de lijst')}
            </button>
            {!alleAgenten && !selectie.length ? <small className='v2b-hint'>{tr('Позначте галочкою картки агентів ліворуч або ввімкніть «Усіх агентів».', 'Vink agentkaarten links aan of zet «Alle agents» aan.')}</small> : null}
          </section>

          <section className='v2b-paneel'>
            <header><div><h3>{tr('Групи дозволів', 'Groepen van rechten')}</h3><small>{tr('Швидкі налаштування для агентів та категорій', 'Snelle instellingen voor agents en categorieën')}</small></div></header>
            <ul className='v2b-presets'>
              {PRESETS.map((p) => (
                <li key={p.id}>
                  <button type='button' className={preset === p.id ? 'is-actief' : ''} aria-pressed={preset === p.id} onClick={() => zetPreset(p)}>
                    <span className='v2b-preset-icoon' aria-hidden='true'>{p.icoon === 'Eye' ? <Eye size={18} /> : p.icoon === 'Ban' ? <Ban size={18} /> : groepIcoon(p.icoon, 18)}</span>
                    <span><b>{uk ? p.uk[0] : p.nl[0]}</b><small>{uk ? p.uk[1] : p.nl[1]}</small></span>
                    <ArrowRight size={15} aria-hidden='true' />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {ingebed ? null : <section className='v2b-paneel' data-v2-laatste>
            <header><div><h3>{tr('Останні дії', 'Laatste acties')}</h3><small>{tr('Нові зверху', 'Nieuwste bovenaan')}</small></div><a className='v2b-link' href='#journaal'>{tr('Уся історія', 'Alle geschiedenis')}</a></header>
            {acties.length ? (
              <ul className='v2b-acties'>
                {acties.slice(0, 8).map((e) => {
                  const sl = agentVanItem(e);
                  const mislukt = /fail|denied|error/i.test(e.resultaat);
                  return (
                    <li key={e.id} className={mislukt ? 'is-mislukt' : ''}>
                      <span className='v2b-actie-logo' aria-hidden='true'>{sl ? <Logo kind={LOGO[sl]} size={22} /> : <Link2 size={18} />}</span>
                      <span className='v2b-actie-tekst'>
                        <b>{actieZin(s(e.details.tool), s(e.details.doel) || undefined, lang)}</b>
                        <small>{sl ? v2Agent(sl).naam : (e.onderwerp?.naam || '—')} · <span title={new Date(e.at).toLocaleString(uk ? 'uk-UA' : 'nl-BE')}>{relatief(e.at, uk)}</span>{mislukt ? ` · ${e.resultaat === 'denied' ? tr('відхилено', 'geweigerd') : tr('помилка', 'mislukt')}` : ''}</small>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className='v2b-leeg'>{journaal.items === null ? tr('Завантаження…', 'Laden…') : tr('Дій ШІ ще не було.', 'Nog geen acties van AI.')}</p>}
          </section>}
        </aside>
      </div>

      {voorbeeld ? (
        <MassaVenster tr={tr} uk={uk} voorbeeld={voorbeeld} bezig={bezig} melding={massaMelding} klaar={klaar}
          onAnnuleer={() => { if (!bezig) { setVoorbeeld(null); setMassaMelding(''); setKlaar(false); } }} onBevestig={() => void pasToe()} />
      ) : null}
    </div>
  );
}
