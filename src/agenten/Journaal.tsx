// Журнал: één tijdlijn van alles rond agents (tokens, apparaten, extensie, toestemmingen, AI aan/uit, noodstop), uit app.audit.
// Dicht: één zin + onderwerp + relatieve tijd (exacte tijd bij aanwijzen). Open: actiecode, id's, ip-hash, apparaat, ruwe details.
import { useMemo, useState, type ReactElement } from 'react';
import { Fingerprint, Globe, KeyRound, Monitor, OctagonX, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import type { Tr } from '../mcp-ui';
import { CAP_TEXT } from '../AiToestemmingen';
import { datum, Knop, Rij, Tech, Tijd, exact } from './ui';
import { foutTekst } from './fouten';
import { useJournaal, type JournaalItem } from './data';

export const SOORTEN: Array<[string, string, string]> = [
  ['', 'Усі події', 'Alle gebeurtenissen'], ['ai', 'Підключення ШІ', 'AI-verbindingen'], ['token', 'Токени', 'Tokens'], ['apparaat', 'Пристрої', 'Apparaten'],
  ['browser', 'Браузер (ШІ увімк./вимк.)', 'Browser (AI aan/uit)'], ['toestemming', 'Дозволи', 'Toestemmingen'], ['noodstop', 'Стоп і блокування', 'Stop en blokkeren'], ['hulpmiddelen', 'Інструменти', 'Hulpmiddelen'],
  ['toegang', 'Права й ключі', 'Rechten en sleutels'],
];
const ICOON: Record<string, ReactElement> = { ai: <Sparkles />, token: <KeyRound />, apparaat: <Monitor />, browser: <Globe />, toestemming: <ShieldCheck />, noodstop: <OctagonX />, hulpmiddelen: <Wrench />, toegang: <Fingerprint /> };
const s = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const capNaam = (c: unknown, tr: Tr) => { const t = CAP_TEXT[s(c) as keyof typeof CAP_TEXT]; return t ? tr(t[0], t[1]) : s(c); };
const REDEN: Record<string, [string, string]> = {
  user: ['вами', 'door u'], client: ['самим клієнтом', 'door de client zelf'], refresh_reuse: ['автоматично: повторне використання токена (можлива крадіжка)', 'automatisch: hergebruik van een token (mogelijke diefstal)'],
  repaired: ['перевстановлення (новий токен)', 'herinstallatie (nieuw token)'], blocked: ['блокування доступу ШІ', 'blokkade van AI-toegang'], ui: ['вами', 'door u'],
};

/** Eén zin in gewone taal voor een journaalregel. */
export function zin(e: JournaalItem, tr: Tr): string {
  const d = e.details, n = e.onderwerp?.naam || s(d.name) || s(d.clientName) || '—';
  const reden = (r: unknown) => { const x = REDEN[s(r)] ?? (s(r).startsWith('preset:') ? ['замінено набором', 'vervangen door een set'] as [string, string] : null); return x ? ` (${tr(x[0], x[1])})` : ''; };
  switch (e.actie) {
    case 'owner.mcp.grant.approved': return tr('Ви дозволили ШІ-клієнту підключитися', 'U stond een AI-client toe te verbinden');
    case 'owner.mcp.grant.denied': return tr('Ви відхилили запит ШІ на підключення', 'U weigerde een verzoek van een AI om te verbinden');
    case 'owner.mcp.grant.connected': return tr(`Підключено ШІ «${n}» (OAuth)`, `AI «${n}» verbonden (OAuth)`);
    case 'owner.mcp.grant.revoked': return tr(`Відкликано доступ «${n}»`, `Toegang van «${n}» ingetrokken`) + reden(d.reason);
    case 'owner.mcp.grant.expired': return tr(`Закінчився строк доступу «${n}»`, `Toegang van «${n}» verlopen`);
    case 'mcp_console_token_issued': return tr(`Випущено токен «${n}»`, `Token «${n}» uitgegeven`);
    case 'mcp_console_token_revoked': return tr(`Відкликано токен «${n}»`, `Token «${n}» ingetrokken`);
    case 'owner.agent.paired': {
      const r = Number(d.replaced || 0), browser = s(d.platform) === 'browser' || e.onderwerp?.platform === 'browser';
      if (r > 0) return tr(`Перевстановлено «${n}»: новий токен, старе підключення відкликано`, `«${n}» opnieuw geïnstalleerd: nieuw token, oude koppeling ingetrokken`);
      return browser ? tr(`Розширення підключено в браузері «${n}»`, `Extensie gekoppeld in browser «${n}»`) : tr(`Підключено пристрій «${n}»`, `Apparaat «${n}» gekoppeld`);
    }
    case 'owner.agent.revoked': return tr(`Відключено «${n}»`, `«${n}» losgekoppeld`) + reden(d.reason);
    case 'owner.agent.updated': return tr(`Оновлено «${n}»: ${s(d.from)} → ${s(d.to)}`, `«${n}» bijgewerkt: ${s(d.from)} → ${s(d.to)}`);
    case 'owner.agent.policy': return tr(`Змінено, що «${n}» виконує без кліку`, `Gewijzigd wat «${n}» zonder klik uitvoert`);
    case 'owner.agent.pairing_code': return tr('Створено одноразовий код підключення', 'Eenmalige koppelcode gemaakt');
    case 'owner.browser.enabled': return tr(`ШІ ввімкнено для браузера «${n}»`, `AI aangezet voor browser «${n}»`);
    case 'owner.browser.disabled': return tr(`ШІ вимкнено для браузера «${n}»`, `AI uitgezet voor browser «${n}»`);
    case 'ai_grant_added': return tr(`Дозвіл «${capNaam(d.capability, tr)}» для «${n}» до ${datum(Date.parse(s(d.expiresAt)))}`, `Toestemming "${capNaam(d.capability, tr)}" voor «${n}» tot ${datum(Date.parse(s(d.expiresAt)))}`);
    case 'ai_grant_always_enabled': return tr(`Дозвіл «${capNaam(d.capability, tr)}» «завжди» для «${n}» до ${datum(Date.parse(s(d.expiresAt)))}`, `Toestemming "${capNaam(d.capability, tr)}" "altijd" voor «${n}» tot ${datum(Date.parse(s(d.expiresAt)))}`);
    case 'ai_grant_expired': return tr(`Закінчився дозвіл «${capNaam(d.capability, tr)}» для «${n}»`, `Toestemming "${capNaam(d.capability, tr)}" voor «${n}» verlopen`);
    case 'ai_grants_revoked': return (e.onderwerp ? tr(`Забрано дозволів у «${n}»: ${s(d.count)}`, `Toestemmingen van «${n}» ingetrokken: ${s(d.count)}`) : tr(`Забрано дозволів: ${s(d.count)}`, `Toestemmingen ingetrokken: ${s(d.count)}`)) + reden(d.reason);
    case 'ai_capabilities_changed': return tr('Змінено загальні межі ШІ', 'Algemene grenzen van de AI gewijzigd');
    case 'ai_stop_all': return tr(`Стоп: забрано дозволів ${s(d.grants) || 0}, вимкнено браузерів ${s(d.agents) || 0}, відкликано MCP-доступів ${s(d.mcpTokens) || 0}`, `Stop: ${s(d.grants) || 0} toestemmingen ingetrokken, ${s(d.agents) || 0} browsers uitgezet, ${s(d.mcpTokens) || 0} MCP-toegangen ingetrokken`);
    case 'ai_user_blocked': return tr('Доступ ШІ заблоковано', 'AI-toegang geblokkeerd');
    case 'ai_user_unblocked': return tr('Доступ ШІ розблоковано', 'AI-toegang gedeblokkeerd');
    case 'owner.mcp.tool.setting': return tr(`Інструмент «${s(d.tool)}»: ${s(d.mode)}`, `Hulpmiddel «${s(d.tool)}»: ${s(d.mode)}`);
    case 'owner.mcp.tool.setting_all': return tr(`Усі інструменти (${s(d.group)}): ${s(d.mode)}`, `Alle hulpmiddelen (${s(d.group)}): ${s(d.mode)}`);
    // §13.10: rechten om updates goed te keuren / voor te bereiden — welke sleutel, waarom (reden), en «Це був не я».
    case 'goedkeur_recht_ingetrokken': return tr(`Відкликано право схвалювати оновлення в ключа «${s(d.label)}»`, `Recht om updates goed te keuren ingetrokken voor sleutel «${s(d.label)}»`) + (s(d.reden) ? tr(` — причина: ${s(d.reden)}`, ` — reden: ${s(d.reden)}`) : '');
    case 'goedkeur_passkey_verwijderd': return tr(`Видалено passkey «${s(d.label)}», що міг схвалювати оновлення`, `Passkey «${s(d.label)}» verwijderd die updates mocht goedkeuren`) + (s(d.reden) ? tr(` — причина: ${s(d.reden)}`, ` — reden: ${s(d.reden)}`) : '');
    case 'uitrol_passkey_intrekken_gevraagd': return tr('Серверу передано запит відкликати ключ', 'Verzoek om een sleutel in te trekken aan de server doorgegeven');
    case 'uitrol_voorbereider_gegeven': return tr(`Надано право готувати оновлення: «${s(d.label) || s(d.onderwerp)}»`, `Recht om updates voor te bereiden gegeven: «${s(d.label) || s(d.onderwerp)}»`);
    case 'uitrol_voorbereider_ingetrokken': return tr(`Відкликано право готувати оновлення: «${s(d.label) || s(d.onderwerp)}»`, `Recht om updates voor te bereiden ingetrokken: «${s(d.label) || s(d.onderwerp)}»`) + (s(d.reden) ? tr(` — причина: ${s(d.reden)}`, ` — reden: ${s(d.reden)}`) : '');
    case 'toegang_wijziging_ongedaan': return tr(`«Це був не я»: зміну скасовано (${s(d.recht) === 'behouden' ? 'право збережено' : s(d.recht) === 'ssh-nodig' ? 'право — лише через SSH' : 'право не відновлено'})`, `«Dit was ik niet»: wijziging teruggedraaid (${s(d.recht) === 'behouden' ? 'recht behouden' : s(d.recht) === 'ssh-nodig' ? 'recht alleen via SSH' : 'recht niet teruggezet'})`);
    default: return e.actie;
  }
}
const toon = (e: JournaalItem) => (/revoked|stop_all|blocked|expired|disabled|denied|ingetrokken|verwijderd/.test(e.actie) ? 'bad' : /paired|connected|issued|enabled|added|approved|updated/.test(e.actie) ? 'ok' : 'info');

export function JournaalLijst({ tr, items, compact = false }: { tr: Tr; items: JournaalItem[]; compact?: boolean }) {
  const [open, setOpen] = useState('');
  if (!items.length) return <p className='ag-leeg'>{tr('Поки що подій немає.', 'Nog geen gebeurtenissen.')}</p>;
  return (
    <ul className={`ag-lijst ag-journaal${compact ? ' is-compact' : ''}`} data-journaal={items.length}>
      {items.map((e) => (
        <Rij key={e.id} id={e.id} open={open === e.id} onToggle={() => setOpen(open === e.id ? '' : e.id)} data={{ actie: e.actie, soort: e.soort, toon: toon(e) }}
          logo={<span className={`ag-journaal-icoon ag-${toon(e)}`}>{ICOON[e.soort] ?? <Monitor />}</span>}
          titel={zin(e, tr)}
          status={<>{e.onderwerp ? <span className='ag-chip'>{e.onderwerp.naam || e.onderwerp.id.slice(0, 8)}</span> : null}<Tijd ms={e.at} tr={tr} /></>}>
          <Tech rijen={[
            [tr('Подія', 'Gebeurtenis'), <code>{e.actie}</code>],
            [tr('Час', 'Tijd'), exact(e.at)],
            [tr('Результат', 'Resultaat'), e.resultaat || '—'],
            e.onderwerp ? [tr('Об’єкт', 'Onderwerp'), <><code>{e.onderwerp.id}</code> · {e.onderwerp.soort}{e.onderwerp.platform ? ` · ${e.onderwerp.platform}` : ''}</>] : null,
            e.ipHash ? [tr('IP (хеш)', 'IP (hash)'), <code>{e.ipHash}</code>] : null,
            e.apparaat ? [tr('Пристрій входу', 'Apparaat van aanmelding'), e.apparaat] : null,
            e.dienst ? [tr('Сервіс', 'Dienst'), e.dienst] : null,
            [tr('Запис журналу', 'Logregel'), <code>{e.id}</code>],
          ]} />
          {Object.keys(e.details).length ? <pre className='ag-ruw' aria-label={tr('Технічні дані', 'Technische gegevens')}>{JSON.stringify(e.details, null, 2)}</pre> : null}
        </Rij>
      ))}
    </ul>
  );
}

export default function Journaal({ tr, onderwerpen, versie, actief }: { tr: Tr; onderwerpen: Array<{ id: string; naam: string; groep: string }>; versie: number; actief: boolean }) {
  const [soort, setSoort] = useState('');
  const [onderwerp, setOnderwerp] = useState('');
  const filter = useMemo(() => ({ soort, onderwerp }), [soort, onderwerp]);
  const j = useJournaal(filter, actief, versie);
  const groepen = [...new Set(onderwerpen.map((o) => o.groep))];
  return (
    <div className='ag-journaal-wrap ag-tab' data-tab-inhoud='journaal'>
      <div className='ag-werkbalk' role='group' aria-label={tr('Фільтри журналу', 'Filters van het logboek')}>
        <label className='ag-veld'><span>{tr('Тип', 'Soort')}</span>
          <select value={soort} onChange={(e) => setSoort(e.target.value)} data-filter='soort'>{SOORTEN.map(([id, uk, nl]) => <option key={id} value={id}>{tr(uk, nl)}</option>)}</select>
        </label>
        <label className='ag-veld'><span>{tr('Агент або пристрій', 'Agent of apparaat')}</span>
          <select value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} data-filter='onderwerp'>
            <option value=''>{tr('Усі', 'Alle')}</option>
            {groepen.map((g) => <optgroup key={g} label={g}>{onderwerpen.filter((o) => o.groep === g).map((o) => <option key={o.id} value={o.id}>{o.naam}</option>)}</optgroup>)}
          </select>
        </label>
        <small className='hub-meta ag-werkbalk-info'>{tr('Час — відносний; точний час із часовим поясом — при наведенні.', 'Relatieve tijd; de exacte tijd met tijdzone bij aanwijzen.')}</small>
      </div>
      {j.fout ? <p className='ag-melding ag-melding-fout' role='alert'>{foutTekst(j.fout, tr, ['Не вдалося завантажити журнал', 'Logboek laden mislukt'])}</p> : null}
      {j.items === null ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : <JournaalLijst tr={tr} items={j.items} />}
      {j.volgende ? <div className='ag-meer'><Knop bezig={j.bezig} onClick={() => void j.laad(j.volgende ?? undefined)}>{tr('Показати старіші', 'Oudere tonen')}</Knop></div> : null}
    </div>
  );
}
