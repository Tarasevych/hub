import { useCallback, useEffect, useState } from 'react';
import { Ban, Check, CheckCheck, Clock, Hand, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { api } from './platform/client';
import { emitCanonicalNotice } from './canoniek-meldingen';
import { Help, IconButton, Logo, type LogoKind, type Tr } from './mcp-ui';
import { textOf } from './mcp-teksten';
import { ALGEMEEN_RISICO, bulkAltijdToegestaan, isGevaarlijk } from '../shared/mcp-hulpmiddel-gevaar'; // SEC-002 interface-03/04
import { ago, sessionBody, type ToolCall } from './agenten-gegevens';
import { AanvragerPill, GoedkeuringInhoud, MensKnop } from './GoedkeuringInhoud'; // SEC-002 interface-01/02, extensie-02
import { geenAi } from './menselijke-actie';
import './mcp-kern-maquette.css';

type Mode = 'always' | 'ask' | 'off';
// Een groep die de server kent maar deze pagina nog niet (nieuwe hulpmiddelen) krijgt automatisch een eigen tabblad (zie groepMeta).
export type Group = 'devices' | 'apps' | 'browser' | 'mail' | 'calendar' | 'drive' | 'site' | 'github' | (string & {});
type Tool = {
  name: string; title: string; description: string; kind: string; group: Group; mode: Mode; defaultMode: Mode;
  risky: boolean; needsApproval: boolean; readOnly: boolean; destructive: boolean; enabled: boolean;
};
type Source = { logo: LogoKind; uk: string; nl: string; live: boolean };

/** Bronnen per groep: zo ziet u meteen WELKE dienst achter een hulpmiddel zit (Google, Microsoft of ons eigen systeem) en wat nog niet gekoppeld kan worden. */
const GROUPS: Array<{ id: Group; logo: LogoKind; uk: string; nl: string; hint: [string, string]; sources: Source[] }> = [
  { id: 'devices', logo: 'device', uk: 'Пристрої', nl: 'Apparaten', hint: ['Файли, команди, Docker і метрики ваших ПК та віртуальних машин через агента. Межі кожного пристрою задаються в його картці.', 'Bestanden, commando\'s, Docker en metrics van uw pc\'s en virtuele machines via de agent. De grenzen per apparaat stelt u in op de kaart van dat apparaat in.'],
    sources: [{ logo: 'windows', uk: 'Windows', nl: 'Windows', live: true }, { logo: 'linux', uk: 'Linux', nl: 'Linux', live: true }, { logo: 'macos', uk: 'macOS', nl: 'macOS', live: true }, { logo: 'docker', uk: 'Docker', nl: 'Docker', live: true }] },
  { id: 'apps', logo: 'docker', uk: 'Додатки', nl: 'Apps', hint: ['Вебдодатки, які ШІ збирає й запускає на ВАШОМУ пристрої в ізольованому контейнері (без root), зі знімками й відкатом. Секрети вводите лише ви на сторінці «Додатки». Розгортання, відкат, зупинка й домен типово вимкнені.', 'Webapps die de AI op UW apparaat bouwt en start in een geïsoleerde container (zonder root), met snapshots en terugdraaien. Geheimen voert alleen u in op de pagina «Apps». Uitrollen, terugdraaien, stoppen en domein staan standaard uit.'],
    sources: [{ logo: 'docker', uk: 'Podman / Docker', nl: 'Podman / Docker', live: true }, { logo: 'server', uk: 'Caddy (домени)', nl: 'Caddy (domeinen)', live: true }] },
  { id: 'browser', logo: 'chrome', uk: 'Браузер', nl: 'Browser', hint: ['Читання й керування сторінками сайту через розширення. Докладні перемикачі для кожного браузера — у його картці.', 'Pagina\'s van de site lezen en bedienen via de extensie. Gedetailleerde schakelaars per browser staan op de kaart van die browser.'],
    sources: [{ logo: 'chrome', uk: 'Chrome / Edge', nl: 'Chrome / Edge', live: true }, { logo: 'firefox', uk: 'Firefox', nl: 'Firefox', live: false }] },
  { id: 'mail', logo: 'mail', uk: 'Пошта', nl: 'E-mail', hint: ['Пошук, читання й зміна листів у підключених поштових акаунтах.', 'Zoeken, lezen en wijzigen van berichten in gekoppelde mailaccounts.'],
    sources: [{ logo: 'google', uk: 'Gmail (Google)', nl: 'Gmail (Google)', live: true }, { logo: 'microsoft', uk: 'Outlook (Microsoft)', nl: 'Outlook (Microsoft)', live: false }] },
  { id: 'calendar', logo: 'calendar', uk: 'Календар', nl: 'Agenda', hint: ['Календарі й події.', 'Agenda\'s en afspraken.'],
    sources: [{ logo: 'google', uk: 'Google Calendar', nl: 'Google Agenda', live: true }, { logo: 'microsoft', uk: 'Outlook Calendar', nl: 'Outlook-agenda', live: false }] },
  { id: 'drive', logo: 'internal', uk: 'Диск', nl: 'Schijf', hint: ['Перегляд тек і читання файлів. Зараз працює лише з Google Drive; інші диски з’являться, коли їх буде підключено до сайту.', 'Mappen bekijken en bestanden lezen. Nu alleen met Google Drive; andere schijven komen erbij zodra ze aan de site gekoppeld zijn.'],
    sources: [{ logo: 'google', uk: 'Google Drive', nl: 'Google Drive', live: true }, { logo: 'microsoft', uk: 'OneDrive (Microsoft)', nl: 'OneDrive (Microsoft)', live: false }, { logo: 'internal', uk: 'Внутрішній диск сайту', nl: 'Interne schijf van de site', live: false }] },
  { id: 'site', logo: 'internal', uk: 'Пошук по сайту', nl: 'Zoeken op de site', hint: ['Єдиний пошук по всьому, що вже проіндексовано в Mijn Ruimte.', 'Eén zoekopdracht over alles wat Mijn Ruimte al heeft geïndexeerd.'],
    sources: [{ logo: 'internal', uk: 'Mijn Ruimte', nl: 'Mijn Ruimte', live: true }] },
  { id: 'github', logo: 'github', uk: 'GitHub', nl: 'GitHub', hint: ['Лише читання через ваш токен зі сховища.', 'Alleen lezen met uw token uit de kluis.'],
    sources: [{ logo: 'github', uk: 'GitHub', nl: 'GitHub', live: true }] },
];

const MODE_META: Record<Mode, { icon: typeof Check; uk: string; nl: string }> = {
  always: { icon: CheckCheck, uk: 'Завжди', nl: 'Altijd' },
  ask: { icon: Hand, uk: 'Питати', nl: 'Vragen' },
  off: { icon: Ban, uk: 'Вимк.', nl: 'Uit' },
};

function ModeSwitch({ value, disabled, onChange, label, tr }: { value: Mode; disabled: boolean; onChange: (m: Mode) => void; label: string; tr: Tr }) {
  const help: Record<Mode, string> = {
    always: tr('Завжди: підключений ШІ викликає без запиту від сайту. Межі агента (теки, список команд) лишаються.', 'Altijd: de gekoppelde AI roept het aan zonder vraag van de site. De grenzen van de agent (mappen, lijst met commando\'s) blijven gelden.'),
    ask: tr('Питати: кожен виклик чекає вашого «Дозволити».', 'Vragen: elke aanroep wacht op uw "Toestaan".'),
    off: tr('Вимкнено: жоден підключений ШІ не бачить цього інструмента й не може його викликати.', 'Uit: geen enkele gekoppelde AI ziet dit hulpmiddel of kan het aanroepen.'),
  };
  return (
    <span className='hub-seg' role='radiogroup' aria-label={label}>
      {(['always', 'ask', 'off'] as Mode[]).map((mode) => {
        const Icon = MODE_META[mode].icon;
        return (
          <button key={mode} type='button' role='radio' aria-checked={value === mode} data-mode={mode} title={help[mode]} disabled={disabled} onClick={() => value !== mode && onChange(mode)}>
            <Icon aria-hidden='true' /><span>{tr(MODE_META[mode].uk, MODE_META[mode].nl)}</span>
          </button>
        );
      })}
    </span>
  );
}

/** Lijst met wachtende aanroepen van site-hulpmiddelen (modus "Vragen"); de gegevens komen van de poller van de pagina (useToolApprovals). */
export function ToolApprovals({ tr, calls, reload }: { tr: Tr; calls: ToolCall[]; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [gezien, setGezien] = useState<Record<string, boolean>>({});
  const lang = tr('uk', 'nl') === 'uk' ? 'uk' : 'nl';

  const decide = async (call: ToolCall, approve: boolean) => {
    setBusy(true); setNotice('');
    try { await api.post(`/api/owner/mcp-connector/approvals/${call.id}/${approve ? 'approve' : 'reject'}`, sessionBody()); await reload(); }
    catch { setNotice(tr('Запит уже недійсний (час вийшов або його вже оброблено).', 'Dit verzoek is niet meer geldig (verlopen of al afgehandeld).')); await reload().catch(() => undefined); }
    setBusy(false);
  };
  const nameOf = (tool: string) => textOf(tool, lang)?.title || tool;
  const pending = calls.filter((c) => c.status === 'pending_approval');
  const recent = calls.filter((c) => c.status !== 'pending_approval').slice(0, 6);
  const statusText = (s: string) => ({ succeeded: tr('виконано', 'uitgevoerd'), failed: tr('помилка', 'mislukt'), rejected: tr('відхилено', 'geweigerd'), timeout: tr('час вийшов', 'verlopen'), approved: tr('схвалено', 'goedgekeurd') } as Record<string, string>)[s] || s;
  return (
    <div data-mcp-approvals={String(pending.length)} className='hub-feed' {...geenAi}>
      {pending.length ? pending.map((c) => (
        <div key={c.id} className='hub-feed-item' data-approval={c.id}>
          <Clock aria-hidden='true' />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className='hub-row start'><b>{nameOf(c.tool)}</b><AanvragerPill tr={tr} aanvrager={c.aanvrager} /><small>{ago(c.createdAt, tr)}</small></div>
            <GoedkeuringInhoud tr={tr} params={c.args} onGezien={(g) => setGezien((s) => (s[c.id] === g ? s : { ...s, [c.id]: g }))} />
            <div className='hub-actions' style={{ marginTop: 8 }}>
              <MensKnop tone='primary' icon={<Check />} disabled={busy || !gezien[c.id]} onKlik={() => void decide(c, true)}>{tr('Дозволити', 'Toestaan')}</MensKnop>
              <MensKnop icon={<X />} disabled={busy} onKlik={() => void decide(c, false)}>{tr('Відхилити', 'Weigeren')}</MensKnop>
            </div>
          </div>
        </div>
      )) : <div className='hub-empty'><ShieldCheck aria-hidden='true' /><span>{tr('Жоден підключений ШІ нічого не очікує від вас. Коли ШІ викличе інструмент у режимі «Питати», запит з’явиться тут і в сповіщеннях — із назвою клієнта, який просить.', 'Geen enkele gekoppelde AI wacht op iets van u. Roept een AI een hulpmiddel in de modus "Vragen" aan, dan verschijnt het hier en bij de meldingen — met de naam van de klant die het vraagt.')}</span></div>}
      {recent.length ? <small className='hub-meta'>{tr('Останні', 'Recent')}: {recent.map((c) => `${nameOf(c.tool)}: ${statusText(c.status)}`).join(' · ')}</small> : null}
      {notice ? <p role='status' className='hub-note warn'>{notice}</p> : null}
    </div>
  );
}

/** "Інструменти й дозволи": per bron een tabblad met logo, per hulpmiddel Altijd / Vragen / Uit en een uitleg die precies zegt wat DIT hulpmiddel doet. */
export default function McpToolsPanel({ tr }: { tr: Tr }) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<Group>(() => { try { return (sessionStorage.getItem('mr.mcp.tools.tab') as Group) || 'devices'; } catch { return 'devices'; } });
  const [riskAsk, setRiskAsk] = useState<string | null>(null);
  const [allesAsk, setAllesAsk] = useState(false); // SEC-002 interface-03: «Усі → Завжди» eerst bevestigen
  const lang = tr('uk', 'nl') === 'uk' ? 'uk' : 'nl';

  const load = useCallback(async () => {
    const res = await api.post('/api/owner/mcp-connector/tools', sessionBody());
    setTools(res.data?.tools ?? []);
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);
  const pick = (g: Group) => { setTab(g); setRiskAsk(null); try { sessionStorage.setItem('mr.mcp.tools.tab', g); } catch { /* geen opslag */ } };

  const setMode = async (tool: Tool, mode: Mode) => {
    setBusy(true); setNotice('');
    try {
      const res = await api.post('/api/owner/mcp-connector/tools/set', { ...sessionBody(), name: tool.name, mode });
      setTools(res.data?.tools ?? []);
      const label = textOf(tool.name, lang)?.title || tool.name;
      emitCanonicalNotice({ text: tr(`${label}: ${MODE_META[mode].uk}`, `${label}: ${MODE_META[mode].nl}`), kind: mode === 'off' ? 'info' : mode === 'always' && tool.risky ? 'warning' : 'success', source: 'mcp' });
    } catch { setNotice(tr('Не вдалося змінити режим інструмента.', 'Modus van het hulpmiddel wijzigen mislukt.')); }
    setBusy(false);
  };
  const choose = (tool: Tool, mode: Mode) => {
    // SEC-002 (interface-03/04): elk gevaarlijk hulpmiddel (ook schrijvende site-hulpmiddelen) vraagt bevestiging vóór «Завжди».
    if (isGevaarlijk(tool) && mode === 'always' && tool.mode !== 'always') { setRiskAsk(tool.name); return; }
    setRiskAsk(null); void setMode(tool, mode);
  };
  const setAll = async (mode: Mode | 'default', group?: Group, inclusiefRiskant = false) => {
    setBusy(true); setNotice('');
    try {
      const res = await api.post('/api/owner/mcp-connector/tools/set-all', { ...sessionBody(), mode, ...(group ? { group } : {}), ...(inclusiefRiskant ? { inclusiefRiskant: true } : {}) }); setTools(res.data?.tools ?? []);
      // SEC-002 (interface-03): ook een bulkwijziging komt in het meldingencentrum (zoals setMode).
      const m = mode === 'default' ? { uk: 'типові режими', nl: 'standaardmodi' } : MODE_META[mode];
      emitCanonicalNotice({ text: tr(`${group ? `Група «${groepMeta(group).uk}»` : 'Усі інструменти'}: ${m.uk}`, `${group ? `Groep «${groepMeta(group).nl}»` : 'Alle hulpmiddelen'}: ${m.nl}`), kind: mode === 'always' ? 'warning' : 'info', source: 'mcp' });
    } catch { setNotice(tr('Не вдалося змінити режим.', 'Modus wijzigen mislukt.')); }
    setBusy(false);
  };

  // Alle groepen die de server stuurt, ook nieuwe: bekende met hun eigen uitleg, onbekende met een algemene.
  const groepMeta = (id: string) => GROUPS.find((g) => g.id === id) ?? { id, logo: 'internal' as LogoKind, uk: id, nl: id, hint: ['Нова група інструментів. Перевірте опис кожного інструмента нижче.', 'Nieuwe groep hulpmiddelen. Bekijk de uitleg bij elk hulpmiddel hieronder.'] as [string, string], sources: [] as Source[] };
  const alleGroepen = [...GROUPS.map((g) => g.id), ...new Set(tools.map((t) => t.group).filter((g) => !GROUPS.some((x) => x.id === g)))].map(groepMeta);
  const current = alleGroepen.find((g) => g.id === tab && tools.some((t) => t.group === g.id)) ?? alleGroepen.find((g) => tools.some((t) => t.group === g.id)) ?? alleGroepen[0];
  const rows = tools.filter((t) => t.group === current.id);
  return (
    <div className='hub-tools-wrap' data-mcp-tools-panel='true' data-mcp-tools={String(tools.length)} {...geenAi}>
      <p className='hub-note'>{tr('Це той самий список, що бачить Claude. Для кожного інструмента оберіть: «Завжди» (без запиту від сайту), «Питати» (кожен виклик чекає вашого «Дозволити») або «Вимк.» (Claude його не бачить). Інструменти зі знаком «!» змінюють дані, надсилають, видаляють, діють у браузері чи на пристрої або показують приватне. Запис на сайті типово «Питати», ризиковані інструменти пристрою й браузера — «Вимк.». «Завжди» для будь-якого інструмента зі знаком «!» вмикається лише поодинці, з підтвердженням.', 'Dit is dezelfde lijst die Claude ziet. Kies per hulpmiddel: "Altijd" (geen vraag van de site), "Vragen" (elke aanroep wacht op uw "Toestaan") of "Uit" (Claude ziet het niet). Hulpmiddelen met een "!" wijzigen gegevens, verzenden, verwijderen, handelen in de browser of op een apparaat, of tonen iets privés. Schrijven op de site staat standaard op "Vragen", riskante hulpmiddelen van apparaat en browser op "Uit". "Altijd" zet u voor elk hulpmiddel met "!" alleen één voor één aan, met bevestiging.')}</p>

      <div className='hub-row' data-mcp-setall='true'>
        <span className='hub-row start'><b>{tr('Усі інструменти', 'Alle hulpmiddelen')}</b>
          <Help tr={tr} content={{ title: tr('Усі інструменти одразу', 'Alle hulpmiddelen tegelijk'), what: tr('Змінює режим усіх інструментів в усіх вкладках.', 'Wijzigt de modus van alle hulpmiddelen op alle tabbladen.'), touches: tr('«Завжди» (після підтвердження) змінює лише інструменти читання; інструменти зі знаком «!» ним не вмикаються — лише поодинці. «Питати» переводить у «Питати» все, крім ризикованих інструментів пристрою й браузера (їх — окремо або кнопкою групи). «Вимк.» і «За замовч.» змінюють усі.', '"Altijd" (na bevestiging) wijzigt alleen leeshulpmiddelen; hulpmiddelen met "!" gaan er niet mee aan — alleen één voor één. "Vragen" zet alles op "Vragen", behalve de riskante hulpmiddelen van apparaat en browser (die apart of met de knop van de groep). "Uit" en "Standaard" wijzigen alles.'), on: tr('«Типово»: читання «Завжди», запис на сайті «Питати», небезпечні вимкнені.', '"Standaard": lezen "Altijd", schrijven op de site "Vragen", riskante uit.'), off: tr('«Вимк.»: Claude не бачить жодного інструмента, зокрема й безпечних.', '"Uit": Claude ziet geen enkel hulpmiddel, ook de veilige niet.') }} />
        </span>
        <span className='hub-seg' role='group' aria-label={tr('Усі інструменти', 'Alle hulpmiddelen')}>
          <button type='button' disabled={busy} onClick={() => setAllesAsk(true)}><CheckCheck aria-hidden='true' />{tr('Завжди', 'Altijd')}</button>
          <button type='button' disabled={busy} onClick={() => void setAll('ask')}><Hand aria-hidden='true' />{tr('Питати', 'Vragen')}</button>
          <button type='button' disabled={busy} onClick={() => void setAll('off')}><Ban aria-hidden='true' />{tr('Вимк.', 'Uit')}</button>
          <button type='button' disabled={busy} onClick={() => void setAll('default')}><RotateCcw aria-hidden='true' />{tr('За замовч.', 'Standaard')}</button>
        </span>
      </div>
      {allesAsk ? (() => {
        // SEC-002 (interface-03): eerst zeggen WELKE hulpmiddelen niet meer vragen; schrijvende en «!»-hulpmiddelen blijven zoals ze zijn.
        const namen = tools.filter((t) => bulkAltijdToegestaan(t) && t.mode !== 'always').map((t) => textOf(t.name, lang)?.title || t.title || t.name);
        return (
          <span className='hub-confirm' role='alertdialog' aria-label={tr('Підтвердження', 'Bevestiging')} data-mcp-setall-bevestig='true'>
            <span><b>{tr('Увімкнути «Завжди» для інструментів читання?', '«Altijd» aanzetten voor leeshulpmiddelen?')}</b> {namen.length
              ? tr(`Перестануть питати (${namen.length}): ${namen.join(', ')}.`, `Vragen niet meer (${namen.length}): ${namen.join(', ')}.`)
              : tr('Усі інструменти читання вже в режимі «Завжди».', 'Alle leeshulpmiddelen staan al op «Altijd».')} {tr('Інструменти, що змінюють дані, надсилають чи видаляють, і всі зі знаком «!» не зміняться: їх вмикають лише поодинці, з підтвердженням.', 'Hulpmiddelen die gegevens wijzigen, verzenden of verwijderen, en alle met «!», veranderen niet: die zet u alleen één voor één aan, met bevestiging.')}</span>
            <MensKnop tone='danger' icon={<CheckCheck />} disabled={busy || !namen.length} onKlik={() => { setAllesAsk(false); void setAll('always'); }}>{tr('Так, завжди', 'Ja, altijd')}</MensKnop>
            <IconButton icon={<X />} onClick={() => setAllesAsk(false)}>{tr('Скасувати', 'Annuleren')}</IconButton>
          </span>
        );
      })() : null}

      <div className='hub-tabs' role='tablist' aria-label={tr('Джерела інструментів', 'Bronnen van hulpmiddelen')}>
        {alleGroepen.map((g) => {
          const list = tools.filter((t) => t.group === g.id);
          if (!list.length) return null;
          const active = list.filter((t) => t.mode !== 'off').length;
          return (
            <button key={g.id} type='button' role='tab' className='hub-tab' aria-selected={current.id === g.id} data-tool-group={g.id} onClick={() => pick(g.id)}>
              <Logo kind={g.logo} size={20} label={tr(g.uk, g.nl)} />{tr(g.uk, g.nl)}<span className='hub-count'>{active}/{list.length}</span>
            </button>
          );
        })}
      </div>

      <div className='hub-card'>
        <div className='hub-source' style={{ flexWrap: 'wrap' }}>
          {current.sources.map((s) => (
            <span key={s.uk} className={`hub-pill ${s.live ? 'ok' : 'off'}`} title={s.live ? tr('Працює', 'Werkt') : tr('Ще не підключено до сайту', 'Nog niet aan de site gekoppeld')}>
              <Logo kind={s.logo} size={16} label={tr(s.uk, s.nl)} />{tr(s.uk, s.nl)}{s.live ? '' : ` · ${tr('скоро', 'binnenkort')}`}
            </span>
          ))}
        </div>
        <p>{tr(current.hint[0], current.hint[1])}</p>
        <div className='hub-actions'>
          <IconButton icon={<Hand />} disabled={busy} onClick={() => void setAll('ask', current.id, true)}>{tr('Увімкнути групу: питати щоразу', 'Groep aanzetten: elke keer vragen')}</IconButton>
          <IconButton icon={<Ban />} disabled={busy} onClick={() => void setAll('off', current.id)}>{tr('Вимкнути групу', 'Groep uitzetten')}</IconButton>
          <IconButton icon={<RotateCcw />} disabled={busy} onClick={() => void setAll('default', current.id)}>{tr('Типово', 'Standaard')}</IconButton>
        </div>
      </div>

      <div className='hub-tools' role='tabpanel'>
        {rows.map((x) => {
          // SEC-002 (interface-04): zonder eigen tekst de vertaalde titel/uitleg van de server (nooit een kale Engelse naam, nooit een
          // dode knop); «!» en de risicotekst volgen uit isGevaarlijk, niet uit het bestaan van een tekst.
          const text = textOf(x.name, lang) ?? { title: x.title || x.name, what: x.description || '', touches: '', on: '', off: '', risk: undefined as string | undefined };
          const gevaar = isGevaarlijk(x);
          const risico = text.risk || ALGEMEEN_RISICO[lang === 'uk' ? 0 : 1];
          return (
            <div key={x.name} className={`hub-tool${x.mode === 'off' ? ' is-off' : ''}`} data-tool={x.name} data-mode={x.mode}>
              <span className='hub-tool-name'>
                <b>{text?.title || x.name}</b>
                {gevaar ? <Help tone='warn' tr={tr} content={{ title: text.title, what: text.what, touches: text.touches, on: text.on, off: text.off, risk: risico }} />
                  : <Help tr={tr} content={{ title: text.title, touches: text.touches, on: text.on, off: text.off }} />}
                <code>{x.name}</code>
              </span>
              <span className='hub-tool-desc'>{text?.what || ''}</span>
              <ModeSwitch value={x.mode} disabled={busy} tr={tr} label={text?.title || x.name} onChange={(m) => choose(x, m)} />
              {riskAsk === x.name ? (
                <span className='hub-confirm' role='alertdialog' aria-label={tr('Підтвердження', 'Bevestiging')}>
                  <span><b>{tr('Увімкнути «Завжди»?', 'Op "Altijd" zetten?')}</b> {risico}{' '}{tr('Кожен підключений ШІ виконуватиме це без запиту на кожен виклик.', 'Elke gekoppelde AI voert dit uit zonder vraag per aanroep.')}</span>
                  <MensKnop tone='danger' icon={<CheckCheck />} disabled={busy} onKlik={() => { setRiskAsk(null); void setMode(x, 'always'); }}>{tr('Так, завжди', 'Ja, altijd')}</MensKnop>
                  <IconButton icon={<X />} onClick={() => setRiskAsk(null)}>{tr('Скасувати', 'Annuleren')}</IconButton>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {notice ? <p role='status' className='hub-note warn'>{notice}</p> : null}
    </div>
  );
}
