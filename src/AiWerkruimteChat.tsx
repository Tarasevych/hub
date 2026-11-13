// Het werkende chatvenster van «ШІ для вас» (ai.*, punt 13 van de eigenaarslijst, 19.10.2026).
//
// Wat hier bewust ANDERS is dan in het oude ChatPanel:
//   - modelkeuze uit de modellen die de SERVER echt heeft ingesteld (één model → gewoon de naam, geen nepkeuze);
//   - «Зупинити» breekt het lopende verzoek echt af (AbortController) en zegt dat het antwoord onvolledig is;
//   - elke fout noemt de ECHTE reden met de code erachter (geen «Не вдалося отримати відповідь» voor alles);
//   - niets wordt nagebootst: zonder sleutel of model is het veld uit en staat er wat er moet gebeuren.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, isAfgebroken } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { foutCode, foutTekst } from './agenten/fouten';
import { WERKRUIMTE_FOUTEN, type Feiten, type Startstaat } from '../shared/ai-werkruimte';
import { AI_AANBIEDER_BIJ_ID, aanbiederUitModel } from '../shared/ai-aanbieders';
import { AanvragerPill, GoedkeuringInhoud, MensKnop } from './GoedkeuringInhoud';
import { commandLabel, type Aanvrager } from './agenten-gegevens';
import { geenAi } from './menselijke-actie';
import './chat-paneel.css';
import './ai-werkruimte.css';

type Tr = (uk: string, nl: string) => string;
type Bericht = { rol: 'user' | 'assistant'; tekst: string; onvolledig?: boolean };
type Stap = { tool: string; isError: boolean };
type Wachtend = { id: string; agentName: string; type: string; params: unknown; aanvrager?: Aanvrager };

const sessieLichaam = () => ({ service: 'ai', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

/** Eén zin met de echte reden. Onze eigen codes eerst; de rest gaat naar de bestaande uitleg van de hub (fouten.ts). */
export function werkruimteFout(e: unknown, tr: Tr, modelId?: string): string {
  const { code } = foutCode(e);
  const aanbieder = modelId ? AI_AANBIEDER_BIJ_ID[aanbiederUitModel(modelId)] : null;
  const naamUk = aanbieder ? aanbieder.naamUk : 'Anthropic';
  const naamNl = aanbieder ? aanbieder.naamNl : 'Anthropic';
  const met = (uk: string, nl: string) => `${tr(uk, nl)} (${tr('код', 'code')}: ${code})`;
  if (code === WERKRUIMTE_FOUTEN.geenSleutel) return met(`Ключа ${naamUk} немає у сховищі — чат не може звернутися до моделі.`, `Geen ${naamNl}-sleutel in de kluis — de chat kan het model niet bereiken.`);
  if (code === WERKRUIMTE_FOUTEN.geenModel) return met('Власник сервера не налаштував жодної моделі (CHAT_MODEL).', 'De eigenaar van de server heeft geen model ingesteld (CHAT_MODEL).');
  if (code === WERKRUIMTE_FOUTEN.modelOnbekend) return met('Цю модель сервер не налаштовано використовувати. Виберіть зі списку.', 'Dit model is op de server niet ingesteld. Kies er een uit de lijst.');
  if (code === WERKRUIMTE_FOUTEN.teVeel) return met('Забагато запитів за хвилину для цього облікового запису. Зачекайте хвилину.', 'Te veel verzoeken per minuut op dit account. Wacht een minuut.');
  if (code === WERKRUIMTE_FOUTEN.laatsteMoetVraagZijn) return met('Останнім у розмові має бути ваше питання.', 'Het laatste in het gesprek moet uw eigen vraag zijn.');
  if (code.startsWith(`${WERKRUIMTE_FOUTEN.aanbieder}_401`)) return met(`${naamUk} відхилив ключ зі сховища — перевірте або замініть його.`, `${naamNl} weigert de sleutel uit de kluis — controleer of vervang hem.`);
  if (code.startsWith(`${WERKRUIMTE_FOUTEN.aanbieder}_429`)) return met(`${naamUk} обмежив ваш ключ (ліміт запитів). Спробуйте трохи згодом.`, `${naamNl} beperkt uw sleutel (verzoeklimiet). Probeer het iets later.`);
  if (code.startsWith(WERKRUIMTE_FOUTEN.aanbieder)) return met('Постачальник моделі повернув помилку. Текст помилки є в журналі.', 'De modelaanbieder gaf een fout terug. De tekst staat in het logboek.');
  return foutTekst(e, tr, ['Не вдалося отримати відповідь', 'Geen antwoord gekregen']);
}

type Props = {
  tr: Tr;
  feiten: Feiten;
  stand: Startstaat;
  /** De tekst in het veld; de startpagina zet er een kant-en-klare vraag in. */
  invoer: string;
  onInvoer: (waarde: string) => void;
  /** Wat de gebruiker moet doen als de chat (nog) niet kan antwoorden. */
  blokkadeUitleg: React.ReactNode;
  /** Optionele geïsoleerde agent-werkruimte waarbinnen deze chat mag handelen. */
  werkruimteId?: string;
  /** Optionele sleutels van gedeelde werkcontext tussen taken. */
  contextSleutels?: string[];
};

export default function AiWerkruimteChat({ tr, feiten, stand, invoer, onInvoer, blokkadeUitleg, werkruimteId, contextSleutels }: Props) {
  const [berichten, setBerichten] = useState<Bericht[]>([]);
  const [stappen, setStappen] = useState<Stap[]>([]);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [wachtend, setWachtend] = useState<Wachtend[]>([]);
  // SEC-002 interface-01: «Дозволити» pas als de mens ALLE parameters kon zien (geen slice(0, 800) meer).
  const [gezien, setGezien] = useState<Record<string, boolean>>({});
  const [model, setModel] = useState(stand.model);
  const afbreker = useRef<AbortController | null>(null);
  const einde = useRef<HTMLDivElement | null>(null);
  const actieveAanbieder = AI_AANBIEDER_BIJ_ID[aanbiederUitModel(model || stand.model)];

  useEffect(() => { setModel((huidig) => (feiten.modellen.some((m) => m.id === huidig) ? huidig : stand.model)); }, [feiten.modellen, stand.model]);

  // Tijdens een verzoek kan een actie op een apparaat op uw goedkeuring wachten: dan vaker kijken.
  const leesWachtend = useCallback(async () => {
    const res = await api.post('/api/owner/agents/list', sessieLichaam());
    setWachtend((res.data?.pending ?? []) as Wachtend[]);
  }, []);
  useEffect(() => {
    if (!stand.recht) return;
    void leesWachtend().catch(() => undefined);
    const timer = window.setInterval(() => { if (!document.hidden) void leesWachtend().catch(() => undefined); }, bezig ? 1500 : 6000);
    return () => window.clearInterval(timer);
  }, [bezig, leesWachtend, stand.recht]);

  useEffect(() => { einde.current?.scrollIntoView({ block: 'end' }); }, [berichten, bezig, wachtend.length]);
  useEffect(() => () => afbreker.current?.abort(), []);

  const versturen = async () => {
    const tekst = invoer.trim();
    if (!tekst || bezig || !stand.kanChatten) return;
    const volgende: Bericht[] = [...berichten, { rol: 'user', tekst }];
    setBerichten(volgende); onInvoer(''); setBezig(true); setFout(''); setMelding(''); setStappen([]);
    const ctrl = new AbortController();
    afbreker.current = ctrl;
    try {
      const res = await api.post('/api/owner/ai/werkruimte/chat', {
        ...sessieLichaam(), model,
        ...(werkruimteId ? { werkruimteId } : {}),
        ...(contextSleutels && contextSleutels.length ? { contextSleutels } : {}),
        messages: volgende.map((b) => ({ role: b.rol, content: b.tekst })),
      }, { signal: ctrl.signal });
      setBerichten([...volgende, { rol: 'assistant', tekst: String(res.data?.reply ?? ''), onvolledig: res.data?.truncated === true }]);
      setStappen((res.data?.steps ?? []) as Stap[]);
    } catch (e) {
      // Afgebroken door de gebruiker: geen fout, maar wel eerlijk dat er geen antwoord is.
      if (isAfgebroken(e)) setMelding(tr('Зупинено. Відповіді немає — надішліть запит ще раз, якщо потрібно.', 'Gestopt. Er is geen antwoord — stuur de vraag opnieuw als u wilt.'));
      else setFout(werkruimteFout(e, tr, model));
    }
    afbreker.current = null;
    setBezig(false);
    void leesWachtend().catch(() => undefined);
  };

  const stop = () => { afbreker.current?.abort(); afbreker.current = null; };

  const beslis = async (id: string, besluit: 'approve' | 'reject') => {
    try { await api.post(`/api/owner/agents/commands/${id}/${besluit}`, sessieLichaam()); }
    catch (e) { setFout(werkruimteFout(e, tr, model)); }
    void leesWachtend().catch(() => undefined);
  };

  return (
    <section className='chat-panel' data-aiw-chat='true'>
      <div className='aiw-model' data-aiw-model={model || 'geen'}>
        {feiten.modellen.length > 1 ? (
          <label>{tr('Модель ШІ', 'AI-model')}{' '}
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={bezig}>
              {feiten.modellen.map((m) => {
                const a = AI_AANBIEDER_BIJ_ID[aanbiederUitModel(m.id)];
                return <option key={m.id} value={m.id}>{a.naamUk}: {m.id}{m.standaard ? tr(' (типово)', ' (standaard)') : ''}</option>;
              })}
            </select>
          </label>
        ) : (
          <span>{stand.model
            ? tr(`Модель (${actieveAanbieder.naamUk}): ${stand.model} — її налаштував власник сервера`, `Model (${actieveAanbieder.naamNl}): ${stand.model} — ingesteld door de eigenaar van de server`)
            : tr('Модель не налаштована на сервері', 'Geen model ingesteld op de server')}</span>
        )}
        <span>{tr('Інструментів у чаті', 'Hulpmiddelen in de chat')}: {stand.aantalTools}</span>
        {/* Eerlijk over wat er NIET is: één apparaat vooraf kiezen kan dit venster niet; de AI kiest met machine_list. */}
        {feiten.apparaten.online > 1
          ? <span data-aiw-apparaatkeuze='nog-niet'>{tr('Пристроїв онлайн кілька — вибрати один тут поки не можна; назвіть його у запиті.', 'Er zijn meerdere apparaten online — hier één kiezen kan nog niet; noem het in uw vraag.')}</span>
          : null}
      </div>

      <div className='chat-log' role='log' aria-live='polite'>
        {berichten.length === 0 ? (
          <p className='chat-empty'>{stand.kanChatten
            ? tr('Поки порожньо. Натисніть готовий запит вище або напишіть своє питання.', 'Nog leeg. Druk op een kant-en-klare vraag hierboven of schrijf uw eigen vraag.')
            : tr('Чат ще не може відповідати — спершу зробіть крок, описаний вище.', 'De chat kan nog niet antwoorden — doe eerst de stap die hierboven staat.')}</p>
        ) : null}
        {berichten.map((b, i) => (
          <div key={i} className={`chat-msg chat-${b.rol}`}>
            <b>{b.rol === 'user' ? tr('Ви', 'U') : tr(actieveAanbieder.naamUk, actieveAanbieder.naamNl)}</b>
            <p>{b.tekst || tr('(порожня відповідь)', '(leeg antwoord)')}</p>
            {b.onvolledig ? <small>{tr('Відповідь неповна: час або кроки закінчилися. Напишіть «продовжуй».', 'Antwoord onvolledig: tijd of stappen op. Schrijf «ga verder».')}</small> : null}
          </div>
        ))}
        {stappen.length ? (
          <ul className='chat-steps' aria-label={tr('Що ШІ зробив', 'Wat de AI deed')}>
            {stappen.map((s, i) => <li key={i} className={s.isError ? 'chat-step-err' : 'chat-step-ok'}>{s.tool}</li>)}
          </ul>
        ) : null}
        {bezig ? <p className='chat-busy'>{tr(`${actieveAanbieder.naamUk} працює…`, `${actieveAanbieder.naamNl} is bezig…`)}</p> : null}
        <div ref={einde} />
      </div>

      {wachtend.length ? (
        <div className='chat-approvals' data-aiw-goedkeuringen={String(wachtend.length)} {...geenAi}>
          <b>{tr('Потрібне ваше підтвердження', 'Uw goedkeuring is nodig')}</b>
          {wachtend.map((item) => (
            <div key={item.id} className='chat-approval'>
              <span>{item.agentName}: <b>{commandLabel(item.type, tr)}</b> <code>{item.type}</code> <AanvragerPill tr={tr} aanvrager={item.aanvrager} /></span>
              <GoedkeuringInhoud tr={tr} params={item.params} onGezien={(g) => setGezien((v) => (v[item.id] === g ? v : { ...v, [item.id]: g }))} />
              <div className='chat-approval-actions'>
                <MensKnop className='' disabled={!gezien[item.id]} onKlik={() => void beslis(item.id, 'approve')}>{tr('Дозволити', 'Toestaan')}</MensKnop>
                <MensKnop className='chat-secondary' onKlik={() => void beslis(item.id, 'reject')}>{tr('Відхилити', 'Weigeren')}</MensKnop>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {fout ? <p className='aiw-fout' role='alert' data-aiw-fout='1'>{fout}</p> : null}
      {melding ? <p className='aiw-nog-niet' role='status'>{melding}</p> : null}
      {stand.kanChatten ? null : blokkadeUitleg}

      <form className='chat-form' onSubmit={(e) => { e.preventDefault(); void versturen(); }}>
        <textarea
          value={invoer} rows={2} disabled={bezig || !stand.kanChatten} data-concept='ai-chat'
          placeholder={stand.kanChatten ? tr('Ваше питання…', 'Uw vraag…') : tr('Поки недоступно', 'Nu nog niet beschikbaar')}
          onChange={(e) => onInvoer(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void versturen(); } }}
        />
        {bezig
          ? <button type='button' className='chat-secondary' onClick={stop} data-aiw-stop='1'>{tr('Зупинити', 'Stoppen')}</button>
          : <button type='submit' disabled={!stand.kanChatten || !invoer.trim()}>{tr('Надіслати', 'Verstuur')}</button>}
      </form>
    </section>
  );
}
