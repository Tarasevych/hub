// Connector v2 — toestemmingsvenster in stappen (opent op mcp.*/agents?consent=<id> wanneer de AI zich op /ai/<agent> aanmeldt):
//  1. Bevestigen — wie vraagt (agent, klant, terugkeeradres, connectoradres);
//  2. Beveiliging — alleen als «extra bevestiging» aan staat: passkey/app-code nu; anders uitleg en, zonder 2FA, een aanrader;
//  3. Account — dit account, of met een ander account inloggen (het verzoek blijft bewaard);
//  4. Ruimte — alleen voor de eigenaar: privé, technisch of beide (technisch vraagt een actief technisch profiel);
//  5. Rechten — RechtenKiezer, standaard alleen veilige handelingen; bij herverbinden het verschil met vorige keer.
// «Дозволити» stuurt alles naar de server, die het opnieuw controleert (nooit de keuze van de AI-klant).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, KeyRound, LogIn, ShieldCheck, ShieldQuestion, TriangleAlert, UserRound, Wrench } from 'lucide-react';
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { Venster, vensterBeheer } from '../platform/vensters';
import { bevestigToegang } from '../platform/stap-op';
import { startPrimaryRedirectLogin } from '../redirect-login';
import { clearPendingConsent } from '../mcp-consent-store';
import { useTech, techActief } from '../tech/tech-store';
import { v2Agent, type AgentSlug } from '../../shared/connector-v2/agenten';
import { KANT_TEKST, type Kant } from '../../shared/connector-v2/catalogus';
import { hoogsteRisico, schoon, STANDAARD } from '../../shared/connector-v2/rechten';
import { factorVerplicht } from '../../shared/connector-v2/factor';
import { RISICO_TEKST } from '../../shared/connector-v2/catalogus';
import RechtenKiezer from './RechtenKiezer';
import './connector-v2.css';

type Tr = (uk: string, nl: string) => string;
export type V2ConsentInfo = {
  clientName: string; redirectHost: string; expiresAt: number; agent: AgentSlug; klant: string;
  v2: {
    agent: AgentSlug; url: string; naam: string;
    vorige: { kanten: Kant[]; sleutels: string[] } | null;
    voorkeur: { kanten: Kant[]; sleutels: string[]; herverbinden: boolean } | null;
    standaard: string[]; extraBevestigen: boolean;
    account: { email: string; rol: string; eigenaar: boolean };
    methoden: { passkey: boolean; totp: boolean; herstelcode: boolean; email?: boolean; sms?: boolean };
  };
};
type Stap = 'bevestigen' | 'beveiliging' | 'account' | 'ruimte' | 'rechten';
const body = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

export default function KoppelWizard({ tr, rid, info, onKlaar }: { tr: Tr; rid: string; info: V2ConsentInfo; onKlaar: () => void }) {
  const uk = tr('uk', 'nl') === 'uk';
  const v = info.v2;
  const agent = v2Agent(info.agent);
  const tech = useTech();
  const factor = factorVerplicht(v.methoden);
  const stappen: Stap[] = useMemo(() => ['bevestigen', ...(factor ? ['beveiliging' as Stap] : []), 'account', ...(v.account.eigenaar ? ['ruimte' as Stap] : []), 'rechten'], [v, factor]);
  const [stap, setStap] = useState<Stap>('bevestigen');
  const i = stappen.indexOf(stap);
  const start = v.voorkeur ?? v.vorige ?? { kanten: ['gebruiker'] as Kant[], sleutels: v.standaard };
  const [kanten, setKanten] = useState<Kant[]>(v.account.eigenaar ? start.kanten : ['gebruiker']);
  const [sleutels, setSleutels] = useState<string[]>(start.sleutels);
  const [bevestigd, setBevestigd] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const [over, setOver] = useState(Math.max(0, info.expiresAt - Date.now()));
  useEffect(() => { const t = window.setInterval(() => setOver(Math.max(0, info.expiresAt - Date.now())), 1000); return () => window.clearInterval(t); }, [info.expiresAt]);
  useEffect(() => { setSleutels((s) => schoon(s, kanten)); }, [kanten]);
  const klantPast = info.klant === agent.klant;
  const gekozen = schoon(sleutels, kanten);
  const risico = hoogsteRisico(gekozen);

  const volgende = () => setStap(stappen[Math.min(stappen.length - 1, i + 1)]);
  const terug = () => setStap(stappen[Math.max(0, i - 1)]);

  const beslis = useCallback(async (approve: boolean) => {
    setBezig(true); setMelding('');
    vensterBeheer.wacht('mcp-toestemming', true);
    try {
      const res = await api.post('/api/owner/mcp-connector/consent', { ...body(), rid, approve, ...(approve ? { kanten, sleutels: gekozen } : {}) });
      clearPendingConsent();
      location.assign(String(res.data.redirect));
    } catch (e) {
      const code = String((e as Error)?.message ?? '');
      const status = Number((e as { status?: number })?.status ?? 0);
      setMelding(status === 404 ? tr('Запит застарів. Почніть підключення в клієнті ШІ знову.', 'Het verzoek is verlopen. Begin de koppeling opnieuw in de AI-client.')
        : code === 'TECH_PROFIEL_VEREIST' || code === 'OWNER_REQUIRED' ? tr('Технічний доступ може дати лише власник з активним технічним профілем у цій вкладці. Увімкніть технічний профіль або залиште лише приватний простір.', 'Technische toegang kan alleen de eigenaar geven met een actief technisch profiel in dit tabblad. Zet het technisch profiel aan of kies alleen de privéruimte.')
        : code.startsWith('STEP_UP') ? tr('Вхід не підтверджено. Натисніть «Дозволити» ще раз і підтвердіть.', 'Aanmelding niet bevestigd. Klik nogmaals op «Toestaan» en bevestig.')
        : code === 'MCP_GRANT_LIMIT_REACHED' ? tr('Досягнуто ліміт активних підключень (10). Відкличте непотрібні у вкладці «Конектори».', 'Limiet van actieve koppelingen bereikt (10). Trek oude in op het tabblad «Connectors».')
        : tr(`Не вдалося зберегти рішення (${code || status || 'немає зв’язку'}).`, `De beslissing kon niet worden opgeslagen (${code || status || 'geen verbinding'}).`));
      setBezig(false);
    } finally { vensterBeheer.wacht('mcp-toestemming', false); }
  }, [rid, kanten, gekozen, tr]);

  const bevestigNu = async () => {
    setMelding('');
    const uit = await bevestigToegang({ service: 'mcp', tabContext: ecosystemTabContext(), post: (u, d) => api.post(u, d), sterk: true });
    if (uit.ok) { setBevestigd(true); volgende(); } else setMelding(tr('Підтвердження не завершено.', 'Bevestiging niet afgerond.'));
  };
  const anderAccount = () => { void startPrimaryRedirectLogin({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin, locale: uk ? 'uk' : 'nl', intent: 'replace-tab' }).catch(() => setMelding(tr('Не вдалося почати вхід.', 'Aanmelden kon niet starten.'))); };
  const zetKant = (k: Kant, aan: boolean) => setKanten((huidig) => { const n = aan ? [...new Set([...huidig, k])] : huidig.filter((x) => x !== k); return (n.length ? n : ['gebruiker']).sort() as Kant[]; });

  const stapNaam: Record<Stap, string> = {
    bevestigen: tr('Підтвердження', 'Bevestigen'), beveiliging: tr('Захист', 'Beveiliging'), account: tr('Обліковий запис', 'Account'),
    ruimte: tr('Простір', 'Ruimte'), rechten: tr('Дозволи', 'Rechten'),
  };

  return (
    <Venster id='mcp-toestemming' titel={tr(`Підключення ${agent.naam}`, `${agent.naam} koppelen`)} breedte={760} labelledBy='v2-wizard-titel' className='mcp-consent-venster v2-wizard-venster'>
      <div className='v2-wizard' data-v2-wizard={info.agent} data-v2-stap={stap} data-v2-factor={factor ? '1' : '0'}>
        <header className='v2-wizard-kop'>
          <h2 id='v2-wizard-titel'>{tr(`${agent.naam} просить доступ до «Мого простору»`, `${agent.naam} vraagt toegang tot Mijn Ruimte`)}</h2>
          <ol className='v2-stappen' aria-label={tr('Кроки', 'Stappen')}>
            {stappen.map((s, n) => <li key={s} className={n < i ? 'is-klaar' : n === i ? 'is-nu' : ''} aria-current={n === i ? 'step' : undefined}><span>{n < i ? <Check size={12} /> : n + 1}</span>{stapNaam[s]}</li>)}
          </ol>
          <p className='v2-wizard-tijd'>{tr('Запит діє ще', 'Verzoek geldig nog')} {Math.floor(over / 60000)}:{String(Math.floor(over / 1000) % 60).padStart(2, '0')}</p>
        </header>

        {stap === 'bevestigen' ? (
          <section className='v2-wizard-deel'>
            <dl className='v2-feiten'>
              <div><dt>{tr('Агент', 'Agent')}</dt><dd><b>{agent.naam}</b></dd></div>
              <div><dt>{tr('Клієнт називає себе', 'Client noemt zich')}</dt><dd>{info.clientName}</dd></div>
              <div><dt>{tr('Після рішення повернетеся на', 'Na uw keuze terug naar')}</dt><dd><code>{info.redirectHost}</code></dd></div>
              <div><dt>{tr('Адреса конектора', 'Connectoradres')}</dt><dd><code>{v.url}</code></dd></div>
            </dl>
            {!klantPast ? <p className='v2-let' role='note'><TriangleAlert size={16} aria-hidden='true' />{tr(`Клієнт називає себе «${info.clientName}», а адреса — для ${agent.naam}. Якщо ви не підключали ${agent.naam} щойно, заборонити.`, `De client noemt zich «${info.clientName}», maar het adres is voor ${agent.naam}. Als u ${agent.naam} niet net koppelde: weigeren.`)}</p> : null}
            <p className='v2-uitleg'>{tr('Ця адреса працює лише для цього агента: токен з неї не підійде іншому ШІ, а назви інструментів містять ім’я агента.', 'Dit adres werkt alleen voor deze agent: het token past bij geen andere AI en de namen van de hulpmiddelen bevatten de naam van de agent.')}</p>
          </section>
        ) : null}

        {stap === 'beveiliging' ? (
          <section className='v2-wizard-deel'>
            <p className='v2-uitleg'><KeyRound size={16} aria-hidden='true' />{tr('У налаштуваннях безпеки цього облікового запису ввімкнено passkey, код із застосунку або запасний код. Підключення ШІ просить цей фактор. Якщо його вимкнути, крок зникне — але тоді викрадена сесія браузера зможе підключити агента без другого підтвердження.', 'In de beveiliging van dit account staat een passkey, een app-code of een herstelcode aan. Een AI koppelen vraagt die factor. Zet u hem uit, dan verdwijnt deze stap — maar dan kan een gestolen browsersessie een agent koppelen zonder tweede bevestiging.')}</p>
            {bevestigd ? <p className='v2-ok'><Check size={16} />{tr('Підтверджено', 'Bevestigd')}</p> : <button type='button' className='mcp-consent-primary' onClick={() => void bevestigNu()}><ShieldCheck size={16} />{tr('Підтвердити зараз', 'Nu bevestigen')}</button>}
          </section>
        ) : null}

        {stap === 'account' ? (
          <section className='v2-wizard-deel'>
            <div className='v2-account' data-v2-account={v.account.email}><UserRound size={22} aria-hidden='true' /><div><b>{v.account.email}</b><small>{v.account.eigenaar ? tr('власник сайту · уже вхід виконано', 'eigenaar van de site · al aangemeld') : tr('цей обліковий запис · уже вхід виконано', 'dit account · al aangemeld')}</small></div><span className='v2-chip is-nieuw'><Check size={12} />{tr('вибрано', 'gekozen')}</span></div>
            <button type='button' className='mcp-consent-secondary' data-v2-ander-account='1' onClick={anderAccount}><LogIn size={16} />{tr('Додати інший / увійти', 'Ander account toevoegen / aanmelden')}</button>
            <p className='v2-uitleg'>{tr('Підключиться обліковий запис, у який ви зараз увійшли. Інший запис: кнопка вище відкриє вхід, а цей запит збережеться й вікно з’явиться знову.', 'Gekoppeld wordt het account waarmee u nu bent aangemeld. Een ander account: de knop hierboven opent het aanmelden, dit verzoek blijft bewaard en het venster komt terug.')}</p>
            {!factor ? (
              <p className='v2-let' role='note'><ShieldQuestion size={16} aria-hidden='true' />{tr('Другий фактор не ввімкнено, тож підключення його не вимагає і не блокує вас. У «Налаштування → Безпека» можна додати passkey або код із застосунку: тоді наступне підключення ШІ спитає його, і викрадена сесія браузера сама агента не підключить.', 'Een tweede factor staat niet aan, dus koppelen eist hem niet en blokkeert u niet. Onder «Instellingen → Beveiliging» kunt u een passkey of app-code toevoegen: dan vraagt de volgende AI-koppeling die, en kan een gestolen browsersessie niet zelf een agent koppelen.')}</p>
            ) : null}
          </section>
        ) : null}

        {stap === 'ruimte' ? (
          <section className='v2-wizard-deel v2-ruimtes'>
            {(['gebruiker', 'beheer'] as Kant[]).map((k) => (
              <label key={k} className={`v2-ruimte-kaart kant-${k}${kanten.includes(k) ? ' is-gekozen' : ''}`}>
                <input type='checkbox' checked={kanten.includes(k)} onChange={(e) => zetKant(k, e.target.checked)} />
                <span className='v2-kant-icoon' aria-hidden='true'>{k === 'beheer' ? <Wrench size={20} /> : <UserRound size={20} />}</span>
                <span><b>{KANT_TEKST[k][uk ? 'uk' : 'nl']}</b><small>{uk ? KANT_TEKST[k].uitlegUk : KANT_TEKST[k].uitlegNl}</small>
                  {k === 'beheer' && !techActief(tech) ? <small className='v2-let-klein'>{tr('Потрібен активний технічний профіль у цій вкладці.', 'Een actief technisch profiel in dit tabblad is nodig.')}</small> : null}
                </span>
              </label>
            ))}
            <p className='v2-uitleg'>{tr('Дозволи технічного доступу ніколи не діють у приватному просторі й навпаки: кожен інструмент має позначку _gebruiker або _beheer.', 'Rechten van technische toegang gelden nooit in de privéruimte en omgekeerd: elk hulpmiddel draagt _gebruiker of _beheer.')}</p>
          </section>
        ) : null}

        {stap === 'rechten' ? (
          <section className='v2-wizard-deel'>
            {v.voorkeur?.herverbinden ? <p className='v2-uitleg'>{tr('Це перепідключення: нижче видно, що буде додано, що вже було і що не буде. Можна змінити тут же.', 'Dit is opnieuw verbinden: hieronder ziet u wat erbij komt, wat u al had en wat vervalt. U kunt het hier meteen wijzigen.')}</p> : null}
            <RechtenKiezer tr={tr} agent={info.agent} kanten={kanten} waarde={gekozen} onChange={setSleutels} vorige={v.vorige?.sleutels ?? null} />
            <p className={`v2-samenvatting risico-${risico}`}>{tr('Найвищий ризик у виборі:', 'Hoogste risico in de keuze:')} <b>{RISICO_TEKST[risico][uk ? 'uk' : 'nl']}</b> · {gekozen.length} {tr('дозволів', 'rechten')}
              {gekozen.length === 0 ? <> · {tr('ШІ нічого не зможе робити', 'de AI kan niets doen')}</> : null}
              {' '}<button type='button' className='v2-link' onClick={() => setSleutels(STANDAARD(kanten))}>{tr('Повернути безпечний стандарт', 'Veilige standaard terugzetten')}</button>
            </p>
          </section>
        ) : null}

        {melding ? <p className='mcp-consent-msg' role='alert'>{melding}</p> : null}

        <footer className='mcp-consent-actions v2-wizard-acties'>
          <button type='button' className='mcp-consent-secondary' disabled={bezig} onClick={() => void beslis(false)}>{tr('Заборонити', 'Weigeren')}</button>
          <span className='v2-ruimte-vul' />
          {i > 0 ? <button type='button' className='mcp-consent-secondary' disabled={bezig} onClick={terug}><ArrowLeft size={16} />{tr('Назад', 'Terug')}</button> : null}
          {stap !== 'rechten'
            ? <button type='button' className='mcp-consent-primary' disabled={bezig || (stap === 'beveiliging' && !bevestigd)} onClick={volgende} data-v2-verder='1'>{stap === 'bevestigen' ? tr('Підтвердити', 'Bevestigen') : tr('Далі', 'Volgende')}<ArrowRight size={16} /></button>
            : <button type='button' className={`mcp-consent-primary risico-${risico}`} disabled={bezig} onClick={() => void beslis(true)} data-v2-toestaan='1'><Check size={16} />{tr('Дозволити', 'Toestaan')}</button>}
          <button type='button' className='v2-link' onClick={onKlaar}>{tr('Пізніше', 'Later')}</button>
        </footer>
      </div>
    </Venster>
  );
}
