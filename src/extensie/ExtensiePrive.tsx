// Slot «як користувач» van de browserextensie (0.6, 19.10.2026; hub mcp.*/agents → tab «Розширення браузера»).
//  - Statuskaart van het privé-slot (live: src/extensie/extensie-live.ts, ruimte 'prive'): Не підключено / Очікування підтвердження /
//    Доступ відкрито / ШІ-агент підключено, resttijd, mogelijkheden, pagina's, AI-namen; «Відкликати зараз» zonder bevestiging.
//  - Ontgrendelen: dagen (1/7/30, nooit boven het beleid), pagina's ⊂ PRIVE_HOSTS (standaard alle), lokale agent (alleen lezen).
//    POST /api/owner/agents/ontgrendeling/prive met de sessie; vraagt de server een step-up (403 STEP_UP_REQUIRED), dan opent het
//    bestaande venster «Підтвердіть доступ» en gaat het verzoek één keer opnieuw (client.ts). Geen technisch profiel nodig.
//  - Wat de AI mag = de bestaande toestemmingen van deze browser (AiToestemmingen); zonder toestemming → uitleg + knop erheen.
import { useEffect, useId, useMemo, useState } from 'react';
import { Bot, KeyRound, Lock, LockOpen, ShieldOff } from 'lucide-react';
import HulpVraag from '../hulp/HulpVraag';
import {
  PRIVE_DAGEN_KEUZES, PRIVE_HOSTS, PRIVE_STANDAARD_DAGEN, STAAT_TEKST, isWeigercode, weigerUitleg, type ExtensieStaat,
} from '../../shared/extensie-ontgrendeling';
import { eindeWeergave } from '../../shared/extensie-matrix';
import { restTekst, useExtensieLive } from './extensie-live';
import { CAP_TEKST, intrekken, ontgrendelenPrive, type Weigering } from './ExtensieOntgrendeling';
import './ExtensieOntgrendeling.css';
import '../agenten/agenten-toegang-maquette.css';
import { alleenMens, geenAi } from '../menselijke-actie'; // SEC-002 extensie-02

type Tr = (uk: string, nl: string) => string;
const staatVan = (s: ExtensieStaat | 'onbekend'): ExtensieStaat => (s === 'onbekend' ? 'vergrendeld' : s);
/** «2 дн 3 год» / «2 d 3 u» boven een dag, anders restTekst.
 *  E-04 (audit fase 2): bij een ontgrendeling van precies 1 dag stond er «ще 1 дн 1 год» — de klok van de browser liep een paar
 *  seconden achter op de server, en ceil maakte van 24 u + 3 s → 25 u. Daarom hier afronden op hele uren (24 u ± 30 min = 1 дн). */
export function restLang(ms: number, uk: boolean): string {
  const u = Math.max(0, Math.round(ms / 3_600_000));
  if (u < 24) return restTekst(ms, uk);
  const d = Math.floor(u / 24), h = u % 24;
  return `${d} ${uk ? 'дн' : 'd'}${h ? ` ${h} ${uk ? 'год' : 'u'}` : ''}`;
}
const datumTijd = (ms: number, uk: boolean) => new Date(ms).toLocaleString(uk ? 'uk-UA' : 'nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
/** Element met de toestemmingen («Що може ШІ») van deze browser. */
export const toestemmingId = (agentId: string) => `extensie-toestemmingen-${agentId}`;

export default function ExtensiePrive({ tr, agentId }: { tr: Tr; agentId?: string }) {
  const uk = tr('uk', 'nl') === 'uk';
  const live = useExtensieLive(agentId, 'prive');
  const kopId = useId();
  const [nu, setNu] = useState(() => Date.now());
  const recht = live.rechtPrive;
  const keuzes = useMemo(() => PRIVE_DAGEN_KEUZES.filter((d) => d <= (recht?.maxDagen ?? 30)), [recht?.maxDagen]);
  const [dagen, setDagen] = useState<number>(PRIVE_STANDAARD_DAGEN);
  const toegestaan = useMemo(() => (recht?.domeinen?.length ? PRIVE_HOSTS.filter((h) => recht.domeinen.includes(h)) : [...PRIVE_HOSTS]), [recht?.domeinen]);
  const [domeinen, setDomeinen] = useState<string[] | null>(null);
  const gekozenDomeinen = (domeinen ?? toegestaan).filter((h) => toegestaan.includes(h));
  const [lokaal, setLokaal] = useState(false);
  const [bezig, setBezig] = useState<'' | 'open' | 'intrekken'>('');
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string; weigering?: Weigering } | null>(null);

  const staat = staatVan(live.staat);
  const o = live.ontgrendeling;
  const open = staat === 'ontgrendeld' || staat === 'agent';
  const nuServer = nu + live.scheef;
  useEffect(() => { const i = window.setInterval(() => setNu(Date.now()), open ? 1000 : 30_000); return () => window.clearInterval(i); }, [open]);

  // Wat de toestemmingen van DEZE browser nu geven (server: agent.toestemming; anders de unie uit recht.prive).
  const capsNu = live.agent?.toestemming?.caps ?? recht?.caps ?? [];
  const gekozen = keuzes.includes(dagen as typeof keuzes[number]) ? dagen : keuzes[0] ?? 0;
  const blok: Weigering | null = live.fout === 'NIET_INGELOGD'
    ? { code: 'NIET_INGELOGD', ...weigerUitleg('NIET_INGELOGD', 'prive') }
    : recht && !recht.mag
      ? (() => { const c = recht.code && isWeigercode(recht.code) ? recht.code : 'BELEID_UIT'; return { code: c, ...weigerUitleg(c, 'prive') }; })()
      : live.geladen && live.agent && !capsNu.length ? { code: 'GEEN_BROWSER_RECHTEN', ...weigerUitleg('GEEN_BROWSER_RECHTEN', 'prive') } : null;
  const knopUit = !!bezig || !!blok || !gekozen || !gekozenDomeinen.length || !live.agentId;

  if (!live.heeftBrowser) {
    return (
      <section className='eo' id='extensie-prive' data-eo-slot='prive' data-eo-staat='niet-gekoppeld' aria-labelledby={kopId}>
        <h3 id={kopId}>{tr('Доступ ШІ як користувач', 'AI-toegang als gebruiker')}</h3>
        <p className='eo-meta' role='status'>{live.geladen ? tr('Цей браузер ще не підключено як користувача. Підключіть його вище — далі тут можна відкрити доступ.', 'Deze browser is nog niet als gebruiker gekoppeld. Koppel hem hierboven — daarna opent u hier de toegang.') : tr('Перевіряю стан розширення…', 'Stand van de extensie controleren…')}</p>
      </section>
    );
  }

  const naarToestemmingen = () => {
    const el = live.agentId ? document.getElementById(toestemmingId(live.agentId)) : null;
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    el?.querySelector<HTMLElement>('h4, h3, button')?.focus({ preventScroll: true });
  };
  const actie = (w: Weigering) => w.code === 'GEEN_BROWSER_RECHTEN'
    ? <button type='button' className='eo-actie' onClick={naarToestemmingen} data-eo-actie={w.code}>{tr('Що може ШІ', 'Wat mag de AI')}</button>
    : w.actie && !/#extensie$/.test(w.actie.url) ? <a className='eo-actie' href={w.actie.url} data-eo-actie={w.code}>{uk ? w.actie.uk : w.actie.nl}</a> : null;
  const uitleg = (w: Weigering, rol: 'alert' | 'note') => (
    <div className='eo-weigering' role={rol === 'alert' ? 'alert' : undefined} data-eo-weigering={w.code}><ShieldOff aria-hidden='true' /><p>{uk ? w.uk : w.nl}</p>{actie(w)}</div>
  );

  const doeOpen = async () => {
    if (knopUit || !live.agentId) return;
    setBezig('open'); setMelding(null);
    const r = await ontgrendelenPrive({ agentId: live.agentId, dagen: gekozen, domeinen: gekozenDomeinen, lokaal: lokaal && recht?.lokaal !== false });
    setBezig('');
    setMelding(r.ok
      ? { ok: true, tekst: r.verzonden ? tr('Доступ відкрито. Розширення вже отримало підписаний дозвіл.', 'Toegang open. De extensie heeft de ondertekende ontgrendeling al ontvangen.') : tr('Доступ відкрито. Розширення отримає дозвіл, щойно з’єднається із сервером.', 'Toegang open. De extensie krijgt de ontgrendeling zodra ze met de server verbindt.') }
      : { ok: false, tekst: uk ? r.weigering.uk : r.weigering.nl, weigering: r.weigering });
  };
  const doeIntrekken = async () => {
    if (bezig || !live.agentId) return;
    setBezig('intrekken'); setMelding(null);
    const r = await intrekken(live.agentId, o?.gid || undefined);
    setBezig('');
    setMelding(r.ok ? { ok: true, tekst: tr('Доступ відкликано. Слот «як користувач» заблоковано.', 'Toegang ingetrokken. Het slot «als gebruiker» is vergrendeld.') } : { ok: false, tekst: uk ? r.weigering.uk : r.weigering.nl, weigering: r.weigering });
  };
  const rest = o ? Math.max(0, o.eind - nuServer) : 0;

  return (
    <section className='eo' id={live.agentId ? `extensie-ontgrendeling-${live.agentId}` : 'extensie-prive'} data-eo-slot='prive' data-eo-staat={staat} data-eo-bron={live.bron} aria-labelledby={kopId} {...geenAi}>
      <h3 id={kopId} tabIndex={-1}>{tr('Доступ ШІ як користувач', 'AI-toegang als gebruiker')} <HulpVraag k='extensie.prive.ontgrendeling' uk={uk} label={tr('Доступ як користувач', 'Toegang als gebruiker')} /></h3>
      <div className={`eo-kaart is-${staat}`} role='status' aria-live='polite' aria-atomic='true' data-eo-kaart='prive'>
        <span className='eo-icoon' aria-hidden='true'>{staat === 'agent' ? <Bot /> : open ? <LockOpen /> : <Lock />}</span>
        <div className='eo-kaart-tekst'>
          <b data-eo-staattekst='1'>{uk ? STAAT_TEKST[staat][0] : STAAT_TEKST[staat][1]}</b>
          {open && o ? <span className='eo-rest' data-eo-rest-uur={Math.ceil(rest / 3_600_000)}>{(() => { const datum = datumTijd(o.eind - live.scheef, true), w = eindeWeergave(o.eindeSoort, { uk: `ще ${restLang(rest, true)} · до ${datum}`, nl: `nog ${restLang(rest, false)} · tot ${datumTijd(o.eind - live.scheef, false)}` }, uk ? datum : datumTijd(o.eind - live.scheef, false)); return uk ? w.uk : w.nl; })()}</span> : null}
          {!open ? <span className='eo-meta'>{tr('ШІ не може нічого робити через розширення в цьому слоті, нічого не збирається.', 'De AI kan via de extensie in dit slot niets, er wordt niets verzameld.')}</span> : null}
          {!live.online ? <span className='eo-meta'>{tr('Розширення зараз не з’єднане із сервером.', 'De extensie is nu niet met de server verbonden.')}</span> : null}
        </div>
      </div>
      {open && o ? (
        <dl className='eo-details' data-eo-details='prive'>
          <dt>{tr('Можливості', 'Mogelijkheden')}</dt><dd>{o.caps.length ? o.caps.map((c) => <span key={c} className='eo-chip'>{uk ? CAP_TEKST[c]?.[0] ?? c : CAP_TEKST[c]?.[1] ?? c}</span>) : '—'}</dd>
          <dt>{tr('Сторінки', 'Pagina’s')}</dt><dd>{o.domeinen.map((d) => <code key={d} className='eo-chip'>{d}</code>)}</dd>
          {live.ai.verbonden ? <><dt>{tr('ШІ-агент підключено', 'AI-agent verbonden')}</dt><dd data-eo-ai='1'>{live.ai.agenten.map((a) => <span key={a.naam} className='eo-chip'>{a.naam}</span>)}</dd></> : null}
        </dl>
      ) : null}
      {open ? (
        <div className='eo-knoppen'>
          <button type='button' className='eo-knop is-gevaar' onClick={() => void doeIntrekken()} disabled={!!bezig} data-eo-knop='prive-intrekken'><Lock aria-hidden='true' />{bezig === 'intrekken' ? tr('Відкликаю…', 'Intrekken…') : tr('Відкликати зараз', 'Nu intrekken')}</button>
        </div>
      ) : null}

      <form className='eo-form' onSubmit={(e) => { e.preventDefault(); alleenMens(() => void doeOpen())(e); }} data-eo-form='prive'>
        <p className='eo-lead'>{open ? tr('Нове відкриття замінить поточне.', 'Een nieuwe toegang vervangt de huidige.') : recht?.stapOpGeldig ? tr('Вхід у цій вкладці вже підтверджено — додатковий запит не потрібен.', 'De aanmelding in dit tabblad is al bevestigd — er is geen extra vraag nodig.') : tr('Перед відкриттям сайт попросить підтвердити доступ (passkey, код із додатка або Google).', 'Vóór het openen vraagt de site de toegang te bevestigen (passkey, code uit de app of Google).')}</p>
        {blok ? uitleg(blok, 'note') : null}
        <p className='eo-meta' data-eo-caps-nu='1'>{capsNu.length ? <>{tr('У цьому слоті діятиме: ', 'In dit slot geldt: ')}{capsNu.map((c) => (uk ? CAP_TEKST[c]?.[0] : CAP_TEKST[c]?.[1]) ?? c).join(', ')}{tr(' — ваші дозволи («Що може ШІ») у межах політики власника; строк і можливості нижче — єдине джерело для розширення.', ' — uw toestemmingen («Wat mag de AI») binnen het beleid van de eigenaar; termijn en mogelijkheden hieronder zijn de enige bron voor de extensie.')}</> : tr('Ще немає жодного дозволу для ШІ в цьому браузері.', 'Nog geen enkele toestemming voor de AI in deze browser.')}</p>
        <label className='eo-veld'>
          <span>{tr('Строк', 'Termijn')} <HulpVraag k='extensie.prive.dagen' uk={uk} label={tr('Строк', 'Termijn')} /></span>
          <select data-hulp='extensie.prive.dagen' value={gekozen || ''} disabled={!keuzes.length || !!bezig} onChange={(e) => setDagen(Number(e.target.value))} data-eo-dagen='1'>
            {keuzes.map((d) => <option key={d} value={d}>{d === 1 ? tr('1 день', '1 dag') : tr(`${d} днів`, `${d} dagen`)}</option>)}
          </select>
        </label>
        <fieldset className='eo-domeinen' disabled={!!bezig}>
          <legend>{tr('Ваші сторінки', 'Uw pagina’s')} <HulpVraag k='extensie.prive.domeinen' uk={uk} label={tr('Сторінки', 'Pagina’s')} /></legend>
          {toegestaan.map((h) => (
            <label key={h} className='eo-vink'>
              <input data-hulp='extensie.prive.domeinen' type='checkbox' checked={gekozenDomeinen.includes(h)} onChange={(e) => setDomeinen(e.target.checked ? [...gekozenDomeinen, h] : gekozenDomeinen.filter((x) => x !== h))} data-eo-prive-domein={h} />
              <code>{h}</code>
            </label>
          ))}
          {!gekozenDomeinen.length ? <small className='eo-fout'>{tr('Оберіть хоча б одну сторінку.', 'Kies minstens één pagina.')}</small> : null}
        </fieldset>
        {recht?.lokaal !== false ? (
          <label className='eo-vink eo-lokaal'>
            <input data-hulp='extensie.prive.lokaal' type='checkbox' checked={lokaal} disabled={!!bezig} onChange={(e) => setLokaal(e.target.checked)} data-eo-prive-lokaal='1' />
            <span>{tr('Дозволити локального агента (лише читання)', 'Lokale agent toestaan (alleen lezen)')}</span> <HulpVraag k='extensie.prive.lokaal' uk={uk} label={tr('Локальний агент', 'Lokale agent')} />
          </label>
        ) : null}
        <div className='eo-knoppen'>
          <button type='submit' className='eo-knop is-hoofd' disabled={knopUit} aria-busy={bezig === 'open' || undefined} data-eo-knop='prive-open' onClick={alleenMens(() => undefined)}>
            <KeyRound aria-hidden='true' />{bezig === 'open' ? tr('Підтвердження…', 'Bevestigen…') : tr('Підтвердити й відкрити доступ', 'Bevestigen en toegang openen')}
          </button>
        </div>
      </form>
      <div aria-live='assertive' className='eo-melding-plek'>
        {melding ? (melding.ok ? <p className='eo-melding is-ok' role='status' data-eo-melding='ok'>{melding.tekst}</p> : melding.weigering ? uitleg(melding.weigering, 'alert') : <p className='eo-melding' role='alert'>{melding.tekst}</p>) : null}
      </div>
    </section>
  );
}
