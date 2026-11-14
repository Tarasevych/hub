// Вкладка «Доступ ШІ»: детальні доступи одного підключення ШІ (per-user, per-agent, per-function).
// Малюється з ОДНОГО каталогу shared/ai-toegang.ts — жодних захардкоджених списків скоупів тут.
// Props-driven, щоб дошка-картка (своя чи сестринська з гілки board) просто підключала
// <AiToegangTab verbinding={{ soort: 'oauth', id, naam }} />. Світла, вузький екран — ок.
// Двомовна (uk/nl через tr, 1.11.2026): до того nl-сайт показував тут лише українські тексти.
// Розділені простори (рішення власника 1.11.2026): сервер повертає ruimte підключення. Для технічного вкладка показує лише те,
// чим технічне підключення може скористатися (пристрої, сайт, зовнішні MCP), і пояснює, що воно не успадковує приватний «Доступ ШІ».
// Підключення connector v2 (власна адреса ШІ, agent ≠ null) має права per інструмент на сторінці ШІ: тут лише пояснення й посилання,
// без перемикачів (сервер відповідає TOEGANG_V2). Для «Доступ ШІ» (bord) вкладка каже, скільки v2-підключень цього ШІ він не зачіпає.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Info, Lock, RotateCcw, ShieldCheck, ShieldOff, Wrench } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agenten-gegevens';
import { canonicalNavigationUrl, serviceFromLocation } from '../canoniek-navigatie';
import {
  AI_TOEGANG_GROEPEN, AI_TOEGANG_GROEP_NL, AI_TOEGANG_SCOPES, STANDAARD_SCOPES, TECHNISCHE_STANDAARD_SCOPES, scopeBruikbaar, toegangScope, zichtbareScopes,
  type AiToegangScope,
} from '../../shared/ai-toegang';
import { toolInRuimte } from '../../shared/ai-ruimte';
import { isBordKlant } from '../../shared/ai-agent-bord';
import { agentPaginaUrl, isAgentSlug, v2Agent } from '../../shared/connector-v2/agenten';
import { klantVan } from '../../shared/ai-verbinding';
import type { Tr } from '../mcp-ui';
// SEC-002 extensie-02 (g10a-2): scopes geven en bewaren doet alleen de mens (zone + alleen een echte klik).
import { alleenMens, geenAi } from '../menselijke-actie';
import './agenten-toegang-maquette.css';

export type ToegangVerbinding = { soort: 'oauth' | 'token'; id: string; naam: string };
type T2 = (uk: string, nl: string) => string;
/** Zonder tr (sestrinska kaart zonder taal) — Oekraïens, zoals voorheen. */
const vertaler = (tr: Tr | undefined): T2 => (u, n) => (tr ? tr(u, n) : u);
const naamVan = (t: T2, s: AiToegangScope) => t(s.uk, s.nl);
/** Regel onder de schakelaar; technisch de eigen omschrijving als de scope daar iets anders opent (andere apparaten, andere hulpmiddelen). */
const regelVan = (t: T2, s: AiToegangScope, technisch = false) =>
  (technisch && s.technischUk && s.technischNl ? t(s.technischUk, s.technischNl) : t(s.omschrijvingUk, s.omschrijvingNl));
const zelfdeSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
const groepVan = (t: T2, groep: string) => t(groep, AI_TOEGANG_GROEP_NL[groep] ?? groep);
const toegangScopeGroep = (groep: string) => AI_TOEGANG_SCOPES.filter((s) => s.groep === groep);
const dienst = () => (serviceFromLocation() === 'ai' ? 'ai' : 'mcp');
/** Wat een technische verbinding ooit kan gebruiken: geen gevoelige scope en minstens één hulpmiddel van de technische ruimte. */
const technischBruikbaar = (s: AiToegangScope) => !s.gevoelig && scopeBruikbaar(s, (tool) => toolInRuimte(tool, 'technisch'));
/** Pagina van de AI (connector v2, tab «Конектори» → ШІ) — volledig adres, ook vanaf ai.*; anders het vaste productieadres. */
const agentPagina = (slug: string): string => {
  const uk = typeof document === 'undefined' || document.documentElement.lang !== 'nl';
  try { return `${canonicalNavigationUrl('mcp', 'agents', uk ? 'uk' : 'nl').replace(/#.*$/, '')}#agent/${slug}`; } catch { /* hieronder */ }
  return isAgentSlug(slug) ? agentPaginaUrl(slug) : '#';
};
const agentNaam = (slug: string) => (isAgentSlug(slug) ? v2Agent(slug).naam : slug);

/** Bekende foutcodes van /api/owner/ai-toegang/* in mensentaal; de code blijft erbij voor diagnose. */
const FOUTEN: Readonly<Record<string, readonly [string, string]>> = {
  TOEGANG_ONBEKEND: ['Підключення не знайдено або воно вже не ваше. Оновіть сторінку.', 'Verbinding niet gevonden of niet meer van u. Vernieuw de pagina.'],
  TOEGANG_SCOPE_ONBEKEND: ['У запиті невідомий доступ. Оновіть сторінку й спробуйте ще раз.', 'Onbekende toegang in het verzoek. Vernieuw de pagina en probeer opnieuw.'],
  TOEGANG_BEVESTIGING_VEREIST: ['Чутливий доступ потребує вашого підтвердження.', 'Gevoelige toegang vraagt uw bevestiging.'],
  TOEGANG_V2: ['Це підключення через власну адресу ШІ: його доступи змінюються лише на сторінці ШІ.', 'Dit is een verbinding via het eigen adres van de AI: de toegang wijzigt u alleen op de pagina van de AI.'],
};
const foutTekst = (t: T2, e: unknown, terugval: string): string => {
  const ruw = e instanceof Error ? e.message : '';
  const code = Object.keys(FOUTEN).find((c) => ruw.includes(c));
  return code ? `${t(...FOUTEN[code])} (${code})` : ruw || terugval;
};

export default function AiToegangTab({ verbinding, tr, metBeheer }: { verbinding: ToegangVerbinding; tr?: Tr; metBeheer?: boolean }) {
  const t = vertaler(tr);
  const klant = useMemo(() => klantVan(verbinding.naam), [verbinding.naam]);
  const [ruimte, setRuimte] = useState<'prive' | 'technisch'>('prive');
  const [agent, setAgent] = useState<string | null>(null);
  const [v2Elders, setV2Elders] = useState<{ agent: string; aantal: number } | null>(null);
  const technisch = ruimte === 'technisch';
  // Technisch: alleen wat daar kan werken (geen gevoelige scope — de server bewaart die ook niet — en geen privéhulpmiddelen).
  const scopes = useMemo(() => zichtbareScopes(klant).filter((s) => !technisch || technischBruikbaar(s)), [klant, technisch]);
  const bord = verbinding.id.startsWith('bord:');
  const [granted, setGranted] = useState<string[] | null>(null);
  const [beheerUit, setBeheerUit] = useState<string[]>([]);
  const [fout, setFout] = useState('');
  // Laden mislukt (geen bord): geen schakelaars tonen — anders zou «Зберегти» een lege lijst over de echte rechten schrijven.
  const [laadFout, setLaadFout] = useState(false);
  const [ok, setOk] = useState('');
  const [bezig, setBezig] = useState(false);
  const [bevest, setBevest] = useState<string | null>(null);

  const laad = useCallback(async () => {
    setFout('');
    setLaadFout(false);
    try {
      const [o, b] = await Promise.all([
        api.post('/api/owner/ai-toegang/overzicht', { ...sessionBody(dienst()), soort: verbinding.soort, id: verbinding.id }),
        api.post('/api/owner/ai-toegang/beheer', sessionBody(dienst())),
      ]);
      const data = o.data as { granted?: unknown; ruimte?: unknown; agent?: unknown; v2Elders?: { agent?: unknown; aantal?: unknown } | null };
      setRuimte(data.ruimte === 'technisch' ? 'technisch' : 'prive');
      setAgent(typeof data.agent === 'string' && data.agent ? data.agent : null);
      setV2Elders(data.v2Elders && typeof data.v2Elders.agent === 'string' && Number(data.v2Elders.aantal) > 0
        ? { agent: data.v2Elders.agent, aantal: Number(data.v2Elders.aantal) } : null);
      setGranted(Array.isArray(data.granted) ? (data.granted as string[]) : []);
      setBeheerUit(Array.isArray((b.data as { uit?: unknown }).uit) ? (b.data as { uit: string[] }).uit : []);
    } catch (e) {
      if (verbinding.id.startsWith('bord:')) {
        setGranted(STANDAARD_SCOPES.filter((s) => zichtbareScopes(klant).some((z) => z.id === s)));
      } else {
        setFout(foutTekst(t, e, 'TOEGANG_LADEN_MISLUKT'));
        setLaadFout(true);
        setGranted([]);
      }
    }
  }, [verbinding.soort, verbinding.id, klant]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setGranted(null); void laad(); }, [laad]);

  const schakel = (id: string) => {
    if (granted === null) return;
    const aan = granted.includes(id);
    const info = toegangScope(id);
    // Чутливий скоуп вмикається у два кроки (мітка + підтвердження).
    if (!aan && info?.gevoelig) { setBevest(id); return; }
    setGranted(aan ? granted.filter((s) => s !== id) : [...granted, id]);
    setOk('');
  };
  const bevestigJa = () => {
    if (bevest && granted !== null && !granted.includes(bevest)) setGranted([...granted, bevest]);
    setBevest(null);
    setOk('');
  };

  const bewaar = async () => {
    if (granted === null) return;
    setBezig(true); setFout(''); setOk('');
    try {
      const r = await api.post('/api/owner/ai-toegang/zet', { ...sessionBody(dienst()), soort: verbinding.soort, id: verbinding.id, scopes: granted, bevestigd: true });
      setGranted((r.data as { granted: string[] }).granted);
      setOk(t('Збережено. Діє з наступного виклику — перепідключати не треба.', 'Opgeslagen. Geldt vanaf de volgende aanroep — opnieuw verbinden is niet nodig.'));
    } catch (e) {
      setFout(foutTekst(t, e, 'TOEGANG_BEWAREN_MISLUKT'));
    } finally { setBezig(false); }
  };
  const reset = () => { void laad(); setOk(''); };

  if (granted === null) return <p className='at-leeg'>{t('Завантаження доступів…', 'Toegang laden…')}</p>;
  if (laadFout) {
    return (
      <div className='at' data-toegang={verbinding.id} data-laadfout='1'>
        <p className='at-melding at-fout' role='alert'>{fout}</p>
        <div className='at-voet'>
          <button type='button' className='at-knop-twee' data-opnieuw='1' onClick={() => { setGranted(null); void laad(); }}
            title={t('Ще раз завантажує доступи цього підключення; поки вони не завантажені, перемикачі приховано, щоб випадково не зберегти порожній список.', 'Laadt de toegang van deze verbinding opnieuw; zolang die niet geladen is, zijn de schakelaars verborgen, zodat u niet per ongeluk een lege lijst bewaart.')}>
            <RotateCcw size={14} aria-hidden='true' />{t('Спробувати ще раз', 'Opnieuw proberen')}
          </button>
        </div>
      </div>
    );
  }
  if (agent) {
    // Connector v2: rechten per hulpmiddel op de pagina van de AI; hier schakelen zou die omzeilen (de server weigert: TOEGANG_V2).
    return (
      <div className='at' data-toegang={verbinding.id} data-ruimte={ruimte} data-v2-agent={agent}>
        <p className='at-melding at-info' data-v2-uitleg='1'>
          <Info size={14} aria-hidden='true' />{' '}
          {t(`Це підключення через власну адресу ШІ (/${agent}). Його доступи — окремі інструменти для приватного й технічного простору — змінюються лише на сторінці «${agentNaam(agent)}»: обмеження там діють одразу для всіх таких підключень цього ШІ, нові дозволи — після перепідключення. «Доступ ШІ» й перемикачі тут його не змінюють.`,
            `Dit is een verbinding via het eigen adres van de AI (/${agent}). De toegang — afzonderlijke hulpmiddelen voor de privé- en de technische ruimte — wijzigt u alleen op de pagina «${agentNaam(agent)}»: beperken geldt daar meteen voor alle zulke verbindingen van deze AI, nieuwe rechten na opnieuw verbinden. De «AI-toegang» en schakelaars hier veranderen hem niet.`)}
        </p>
        <a className='ag-link' href={agentPagina(agent)} data-v2-link={agent}
          title={t('Відкриває сторінку ШІ з переліком інструментів. Обмеження там діють одразу для всіх підключень цього ШІ через його власну адресу; нові дозволи — після перепідключення.', 'Opent de pagina van de AI met de lijst hulpmiddelen. Beperken geldt daar meteen voor alle verbindingen van deze AI via het eigen adres; nieuwe rechten na opnieuw verbinden.')}>
          <ExternalLink size={14} aria-hidden='true' />{t(`Змінити доступи на сторінці «${agentNaam(agent)}»`, `Toegang wijzigen op de pagina «${agentNaam(agent)}»`)}
        </a>
      </div>
    );
  }
  // Wat «Зберегти доступи» precies raakt, per soort verbinding (backend/mcp-connector-routes.ts, /api/owner/ai-toegang/zet).
  const bewaarUitleg = bord
    ? t('Зберігає вибір приватного простору цього ШІ: діє для всіх його приватних підключень через спільну адресу /mcp і для нових таких підключень. Не змінює технічних підключень, підключень через власну адресу ШІ (вони на сторінці ШІ) і MCP-токенів.',
      'Bewaart de keuze voor de privéruimte van deze AI: geldt voor al zijn privéverbindingen via het gedeelde adres /mcp en voor nieuwe zulke verbindingen. Verandert geen technische verbindingen, verbindingen via het eigen adres van de AI (die staan op de pagina van de AI) en MCP-tokens.')
    : technisch
      ? t('Зберігає доступи лише цього технічного підключення; діє з наступного виклику, перепідключати не треба. Приватний «Доступ ШІ» та інші підключення не змінюються.',
        'Bewaart de toegang van alleen deze technische verbinding; geldt vanaf de volgende aanroep, opnieuw verbinden is niet nodig. De privé «AI-toegang» en andere verbindingen veranderen niet.')
      : verbinding.soort === 'oauth' && isBordKlant(klant)
        ? t('Зберігає доступи цього приватного підключення й водночас робить їх вибором «Доступ ШІ» цього ШІ: нові приватні підключення через /mcp отримають те саме. Інші наявні підключення, технічні й MCP-токени не змінюються.',
          'Bewaart de toegang van deze privéverbinding en maakt hem meteen de keuze «AI-toegang» van deze AI: nieuwe privéverbindingen via /mcp krijgen hetzelfde. Andere bestaande verbindingen, technische verbindingen en MCP-tokens veranderen niet.')
        : t('Зберігає доступи лише цього підключення; діє з наступного виклику ШІ, перепідключати не треба. Інші підключення не змінюються.',
          'Bewaart de toegang van alleen deze verbinding; geldt vanaf de volgende aanroep van de AI, opnieuw verbinden is niet nodig. Andere verbindingen veranderen niet.');
  return (
    <div className='at' data-toegang={verbinding.id} data-ruimte={ruimte} {...geenAi}>
      <p className='at-ondertitel'>
        {technisch
          ? t(`Що саме цей ШІ («${verbinding.naam}») може робити в технічному просторі через це підключення. Діє лише для нього і застосовується з наступного виклику.`,
            `Wat deze AI («${verbinding.naam}») via deze verbinding precies mag in de technische ruimte. Geldt alleen voor deze verbinding en vanaf de volgende aanroep.`)
          : t(`Що саме цей ШІ («${verbinding.naam}») може робити у вашому приватному просторі. Діє лише для нього і застосовується з наступного виклику.`,
            `Wat deze AI («${verbinding.naam}») precies mag in uw privéruimte. Geldt alleen voor deze AI en vanaf de volgende aanroep.`)}
      </p>
      {technisch ? (
        <p className='at-melding at-info' data-ruimte-uitleg='technisch'>
          <Wrench size={14} aria-hidden='true' />{' '}
          {t('Технічне підключення має власні права й не успадковує приватний «Доступ ШІ» цього ШІ: зміни там його не торкаються, а зміни тут не торкаються приватних підключень. Нове технічне підключення отримує технічний стандарт; створене до 1.11.2026 могло отримати права з «Доступу ШІ» — перевірте перемикачі або натисніть «Технічний стандарт». Тут лише те, чим технічне підключення може скористатися: технічні пристрої, адміністративні відомості сайту й зовнішні MCP-сервери технічного простору. Пошта, фото, календар, файли, дошка, нотатки й GitHub йому недоступні ніколи.',
            "Een technische verbinding heeft eigen rechten en erft de privé «AI-toegang» van deze AI niet: wijzigingen daar raken haar niet, en wijzigingen hier raken de privéverbindingen niet. Een nieuwe technische verbinding krijgt de technische standaard; een verbinding van vóór 1-11-2026 kan rechten uit de «AI-toegang» hebben gekregen — controleer de schakelaars of klik op «Technische standaard». Hier staat alleen wat een technische verbinding kan gebruiken: technische apparaten, beheergegevens van de site en externe MCP-servers van de technische ruimte. E-mail, foto's, agenda, bestanden, bord, notities en GitHub krijgt zij nooit.")}
        </p>
      ) : null}
      {bord && v2Elders ? (
        <p className='at-melding at-info' data-v2-elders={v2Elders.aantal}>
          <Info size={14} aria-hidden='true' />{' '}
          {t(`Цей вибір не діє для ${v2Elders.aantal} ${v2Elders.aantal % 10 === 1 && v2Elders.aantal % 100 !== 11 ? 'підключення' : 'підключень'} цього ШІ через його власну адресу (/${v2Elders.agent}): їхні доступи змінюються на сторінці ШІ.`,
            `Deze keuze geldt niet voor ${v2Elders.aantal} ${v2Elders.aantal === 1 ? 'verbinding' : 'verbindingen'} van deze AI via het eigen adres (/${v2Elders.agent}): die toegang wijzigt u op de pagina van de AI.`)}{' '}
          <a className='ag-link' href={agentPagina(v2Elders.agent)} data-v2-link={v2Elders.agent}
            title={t('Відкриває сторінку ШІ з переліком інструментів для підключень через його власну адресу.', 'Opent de pagina van de AI met de lijst hulpmiddelen voor verbindingen via het eigen adres.')}>
            <ExternalLink size={12} aria-hidden='true' />{t(`Сторінка «${agentNaam(v2Elders.agent)}»`, `Pagina «${agentNaam(v2Elders.agent)}»`)}
          </a>
        </p>
      ) : null}
      {technisch && !zelfdeSet(granted, TECHNISCHE_STANDAARD_SCOPES) ? (
        <p className='at-melding at-info' data-tech-afwijking='1'>
          <Info size={14} aria-hidden='true' />{' '}
          {t('Вибір відрізняється від технічного стандарту. Якщо ви цього не налаштовували, права могли скопіюватися з «Доступу ШІ» до 1.11.2026.',
            'De keuze wijkt af van de technische standaard. Als u dit niet zelf instelde, kunnen de rechten vóór 1-11-2026 uit de «AI-toegang» zijn overgenomen.')}
        </p>
      ) : null}
      {fout ? <p className='at-melding at-fout' role='alert'>{fout}</p> : null}
      {ok ? <p className='at-melding at-ok' role='status'>{ok}</p> : null}
      {AI_TOEGANG_GROEPEN.map((groep) => {
        const rijen = scopes.filter((s) => s.groep === groep);
        if (!rijen.length) return null;
        return (
          <section key={groep} className='at-groep' data-groep={groep}>
            <h4>{groepVan(t, groep)}</h4>
            <ul>
              {rijen.map((s) => {
                const aan = granted.includes(s.id);
                const adminUit = beheerUit.includes(s.id);
                return (
                  <li key={s.id} className={`at-rij${aan ? ' is-aan' : ''}${adminUit ? ' is-beheer-uit' : ''}`} data-scope={s.id}>
                    <button
                      type='button' role='switch' aria-checked={aan} disabled={adminUit}
                      className='at-schakelaar' data-scope-schakelaar={s.id}
                      onClick={alleenMens(() => schakel(s.id))}
                      aria-label={`${naamVan(t, s)}: ${regelVan(t, s, technisch)}`}
                    >
                      <span className='at-knop' aria-hidden='true' />
                    </button>
                    <span className='at-tekst'>
                      <span className='at-naam'>
                        {naamVan(t, s)}
                        {s.gevoelig ? <span className='at-gevoelig' title={t('Чутливі дані: вмикається лише з вашим підтвердженням', 'Gevoelige gegevens: gaat alleen aan na uw bevestiging')}><Lock size={12} aria-hidden='true' />{t('чутливе', 'gevoelig')}</span> : null}
                      </span>
                      <span className='at-lijn'>{regelVan(t, s, technisch)}</span>
                      {adminUit ? <span className='at-beheer'><ShieldOff size={12} aria-hidden='true' />{t('Вимкнено адміністратором для всього сайту', 'Door de beheerder uitgezet voor de hele site')}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {bevest ? (
        <div className='at-bevest' role='alertdialog' aria-modal='false' aria-label={t('Підтвердження чутливого доступу', 'Bevestiging van gevoelige toegang')}>
          <p><Lock size={14} aria-hidden='true' /> <strong>{toegangScope(bevest) ? naamVan(t, toegangScope(bevest)!) : bevest}</strong></p>
          <p>{t('Це чутливі дані. ШІ зможе їх читати, доки ви не вимкнете доступ. Надати доступ?', 'Dit zijn gevoelige gegevens. De AI kan ze lezen tot u de toegang uitzet. Toegang geven?')}</p>
          <div className='at-bevest-knoppen'>
            <button type='button' className='at-knop-prim' data-bevest-ja='1' onClick={alleenMens(bevestigJa)}>{t('Так, надати', 'Ja, geven')}</button>
            <button type='button' className='at-knop-twee' data-bevest-nee='1' onClick={() => setBevest(null)}>{t('Скасувати', 'Annuleren')}</button>
          </div>
        </div>
      ) : null}
      <div className='at-voet'>
        <button type='button' className='at-knop-prim' data-bewaar='1' disabled={bezig} onClick={alleenMens(() => void bewaar())} title={bewaarUitleg}>
          <ShieldCheck size={14} aria-hidden='true' />{bezig ? t('Збереження…', 'Opslaan…') : t('Зберегти доступи', 'Toegang opslaan')}
        </button>
        {technisch ? (
          <button type='button' className='at-knop-twee' data-tech-standaard='1' disabled={bezig || zelfdeSet(granted, TECHNISCHE_STANDAARD_SCOPES)}
            onClick={() => { setGranted([...TECHNISCHE_STANDAARD_SCOPES]); setOk(''); }}
            title={t('Ставить перемикачі цього технічного підключення на технічний стандарт (пристрої й адміністративні відомості, без зовнішніх MCP) і прибирає права, скопійовані колись із «Доступу ШІ». Діє лише після «Зберегти доступи»; приватні підключення не змінюються.',
              'Zet de schakelaars van deze technische verbinding op de technische standaard (apparaten en beheergegevens, zonder externe MCP) en haalt rechten weg die ooit uit de «AI-toegang» zijn overgenomen. Geldt pas na «Toegang opslaan»; privéverbindingen veranderen niet.')}>
            <Wrench size={14} aria-hidden='true' />{t('Технічний стандарт', 'Technische standaard')}
          </button>
        ) : null}
        <button type='button' className='at-knop-twee' data-reset='1' disabled={bezig} onClick={reset}
          title={t('Повертає перемикачі до збереженого стану; нічого не змінює на сервері.', 'Zet de schakelaars terug naar de bewaarde stand; verandert niets op de server.')}>
          <RotateCcw size={14} aria-hidden='true' />{t('Скасувати зміни', 'Wijzigingen annuleren')}
        </button>
      </div>
      {metBeheer ? <AiToegangBeheer tr={tr} beheerUit={beheerUit} onChanged={setBeheerUit} /> : null}
    </div>
  );
}

/** Адміністративна стеля (лише власник; іншим — 403, секція ховається). Дошка сестринської гілки може перевикористати. */
export function AiToegangBeheer({ tr, beheerUit, onChanged }: { tr?: Tr; beheerUit: string[]; onChanged: (uit: string[]) => void }) {
  const t = vertaler(tr);
  const [verboden, setVerboden] = useState(false);
  const [bezig, setBezig] = useState<string | null>(null);
  const zet = async (id: string, uit: boolean) => {
    setBezig(id);
    try {
      const r = await api.post('/api/owner/ai-toegang/beheer/zet', { ...sessionBody(dienst()), scope: id, uit });
      onChanged((r.data as { uit: string[] }).uit);
    } catch (e) {
      if (e instanceof Error && /OWNER_REQUIRED|403/.test(e.message)) setVerboden(true);
    } finally { setBezig(null); }
  };
  if (verboden) return null;
  return (
    <section className='at-beheer' data-beheer='1'>
      <h4><ShieldCheck size={14} aria-hidden='true' />{t('Стеля сайту (лише власник)', 'Plafond van de site (alleen eigenaar)')}</h4>
      <p className='at-ondertitel'>{t('Вимкнене тут не працює в жодного ШІ, навіть зі старим дозволом.', 'Wat hier uit staat, werkt bij geen enkele AI, ook niet met een oude toestemming.')}</p>
      <ul className='at-beheer-lijst'>
        {AI_TOEGANG_GROEPEN.flatMap((groep) =>
          toegangScopeGroep(groep).map((s) => (
            <li key={s.id} className='at-beheer-rij2' data-beheer-scope={s.id}>
              <span>{naamVan(t, s)} <span className='at-beheer-groep-naam'>· {groepVan(t, s.groep)}</span></span>
              <button
                type='button' role='switch' aria-checked={!beheerUit.includes(s.id)}
                className={`at-schakelaar${beheerUit.includes(s.id) ? '' : ' is-aan'}`}
                disabled={bezig !== null} onClick={() => void zet(s.id, !beheerUit.includes(s.id))}
                aria-label={`${naamVan(t, s)} — ${beheerUit.includes(s.id) ? t('вимкнено для сайту', 'uitgezet voor de site') : t('увімкнено для сайту', 'aangezet voor de site')}`}
                title={beheerUit.includes(s.id)
                  ? t('Увімкнути для сайту: кожне підключення знову зможе користуватися цим доступом, якщо воно його має.', 'Aanzetten voor de site: elke verbinding die deze toegang heeft, kan hem weer gebruiken.')
                  : t('Вимкнути для сайту: жодне підключення ШІ не зможе користуватися цим доступом, навіть зі старим дозволом.', 'Uitzetten voor de site: geen enkele AI-verbinding kan deze toegang nog gebruiken, ook niet met een oude toestemming.')}
              >
                <span className='at-knop' aria-hidden='true' />
              </button>
            </li>
          )),
        )}
      </ul>
    </section>
  );
}
