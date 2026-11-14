// Connector v2 — toestemmingsvenster in stappen (opent op mcp.*/agents?consent=<id> wanneer de AI zich op /<agent> aanmeldt):
//  1. Bevestigen — wie vraagt (agent, klant, terugkeeradres, connectoradres);
//  2. Beveiliging — alleen als «extra bevestiging» aan staat: passkey/app-code nu; anders uitleg en, zonder 2FA, een aanrader;
//  3. Account — dit account, of met een ander account inloggen (het verzoek blijft bewaard);
//  4. Ruimte — alleen voor de eigenaar: privé, technisch of beide. Levende rechten (20.10.2026): technisch AANVINKEN vraagt GEEN
//     actief technisch profiel meer. Het is één connector; wat er op een moment echt bestaat, beslist de server bij elke aanroep
//     («zolang mijn technische profiel actief is»). Daarom geen gele waarschuwing meer en geen «open dit in de technische ruimte»;
//  5. Rechten — RechtenKiezer, standaard alleen veilige handelingen; bij herverbinden het verschil met vorige keer.
// «Дозволити» stuurt alles naar de server, die het opnieuw controleert (nooit de keuze van de AI-klant).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, KeyRound, LogIn, ShieldCheck, ShieldQuestion, TriangleAlert, UserRound, Wrench } from 'lucide-react';
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { Venster, vensterBeheer } from '../platform/vensters';
import { bevestigToegang } from '../platform/stap-op';
import { startPrimaryRedirectLogin } from '../aanmeld-omleiding';
import { aanmeldPauzeBericht, aanmeldStartFoutTekst, useAftelPauze } from '../aanmeld-pauze';
import { clearPendingConsent } from '../mcp-toestemming-opslag';
import { useTech, techActief } from '../tech/tech-opslag';
import { v2Agent, type AgentSlug } from '../../shared/connector-v2/agenten';
import { KANT_TEKST, type Kant } from '../../shared/connector-v2/catalogus';
import { hoogsteRisico, schoon, STANDAARD } from '../../shared/connector-v2/rechten';
import { RISICO_TEKST, v2Optie } from '../../shared/connector-v2/catalogus';
import { MET_BEVESTIGING } from '../../shared/ai-bevestiging';
import RechtenKiezer from './RechtenKiezer';
import './connector-v2.css';
import './koppel-wizard-plaats.css'; // 21.10.2026: knoppen in een vaste onderste rij van het venster (telefoon: altijd zichtbaar)
import '../agenten/agenten-kern-maquette.css';

type Tr = (uk: string, nl: string) => string;
export type V2ConsentInfo = {
  clientName: string; redirectHost: string; expiresAt: number; agent: AgentSlug; klant: string;
  v2: {
    agent: AgentSlug; url: string; naam: string;
    vorige: { kanten: Kant[]; sleutels: string[] } | null;
    /** Erfenis van het oude /mcp (backend/connector-v2-erfenis.ts): wat de mens deze AI daar al toestond. */
    erfenis?: { kanten: Kant[]; sleutels: string[]; grants: number; scopes: string[] } | null;
    voorkeur: { kanten: Kant[]; sleutels: string[]; herverbinden: boolean } | null;
    standaard: string[]; extraBevestigen: boolean;
    account: { email: string; rol: string; eigenaar: boolean };
    methoden: { passkey: boolean; totp: boolean; herstelcode: boolean };
  };
};
type Stap = 'bevestigen' | 'beveiliging' | 'account' | 'ruimte' | 'rechten';
const body = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

export default function KoppelWizard({ tr, rid, info, onKlaar }: { tr: Tr; rid: string; info: V2ConsentInfo; onKlaar: () => void }) {
  const uk = tr('uk', 'nl') === 'uk';
  const v = info.v2;
  const agent = v2Agent(info.agent);
  const tech = useTech();
  const stappen: Stap[] = useMemo(() => ['bevestigen', ...(v.extraBevestigen ? ['beveiliging' as Stap] : []), 'account', ...(v.account.eigenaar ? ['ruimte' as Stap] : []), 'rechten'], [v]);
  const [stap, setStap] = useState<Stap>('bevestigen');
  const i = stappen.indexOf(stap);
  // Startkeuze: onthouden keuze → vorige v2-koppeling → erfenis van het oude /mcp (oude toestemmingen vallen niet stil weg) → standaard.
  const start = v.voorkeur ?? v.vorige ?? v.erfenis ?? { kanten: ['gebruiker'] as Kant[], sleutels: v.standaard };
  const uitErfenis = !v.voorkeur && !v.vorige && !!v.erfenis;
  const [kanten, setKanten] = useState<Kant[]>(v.account.eigenaar ? start.kanten : ['gebruiker']);
  const [sleutels, setSleutels] = useState<string[]>(start.sleutels);
  const [bevestigd, setBevestigd] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const pauze = useAftelPauze();
  const pauzeTekst = pauze.actief || pauze.zojuistVrij
    ? aanmeldPauzeBericht(Math.max(1, pauze.resterend), uk ? 'uk' : 'nl', 'koppel', pauze.limiet)
    : null;
  const [over, setOver] = useState(Math.max(0, info.expiresAt - Date.now()));
  useEffect(() => { const t = window.setInterval(() => setOver(Math.max(0, info.expiresAt - Date.now())), 1000); return () => window.clearInterval(t); }, [info.expiresAt]);
  useEffect(() => { setSleutels((s) => schoon(s, kanten)); }, [kanten]);
  const klantPast = info.klant === agent.klant;
  const gekozen = schoon(sleutels, kanten);
  const risico = hoogsteRisico(gekozen);

  const volgende = () => setStap(stappen[Math.min(stappen.length - 1, i + 1)]);
  const terug = () => setStap(stappen[Math.max(0, i - 1)]);

  const beslis = useCallback(async (approve: boolean) => {
    if (pauze.actief) return;
    setBezig(true); setMelding('');
    vensterBeheer.wacht('mcp-toestemming', true);
    try {
      const res = await api.post('/api/owner/mcp-connector/consent', { ...body(), rid, approve, ...(approve ? { kanten, sleutels: gekozen } : {}) });
      pauze.wis();
      clearPendingConsent();
      location.assign(String(res.data.redirect));
    } catch (e) {
      const p = pauze.vangPauze(e);
      if (!p.isPauze) {
        const code = String((e as Error)?.message ?? '');
        const status = Number((e as { status?: number })?.status ?? 0);
        setMelding(status === 404 ? tr('Запит застарів. Почніть підключення в клієнті ШІ знову.', 'Het verzoek is verlopen. Begin de koppeling opnieuw in de AI-client.')
          : code === 'OWNER_REQUIRED' || code === 'TECH_PROFIEL_VEREIST' ? tr('Технічні інструменти може дозволити лише власник сайту. Залиште лише приватний простір.', 'Technische hulpmiddelen kan alleen de eigenaar van de site toestaan. Kies alleen de privéruimte.')
          : code.startsWith('STEP_UP') ? tr('Вхід не підтверджено. Натисніть «Дозволити» ще раз і підтвердіть.', 'Aanmelding niet bevestigd. Klik nogmaals op «Toestaan» en bevestig.')
          : code === 'MCP_GRANT_LIMIT_REACHED' ? tr('Досягнуто ліміт активних підключень (10). Відкличте непотрібні у вкладці «Конектори».', 'Limiet van actieve koppelingen bereikt (10). Trek oude in op het tabblad «Connectors».')
          : tr(`Не вдалося зберегти рішення (${code || status || 'немає зв’язку'}).`, `De beslissing kon niet worden opgeslagen (${code || status || 'geen verbinding'}).`));
      }
      setBezig(false);
    } finally { vensterBeheer.wacht('mcp-toestemming', false); }
  }, [rid, kanten, gekozen, tr, pauze]);

  const bevestigNu = async () => {
    setMelding('');
    const uit = await bevestigToegang({ service: 'mcp', tabContext: ecosystemTabContext(), post: (u, d) => api.post(u, d), sterk: true });
    if (uit.ok) { setBevestigd(true); volgende(); } else setMelding(tr('Підтвердження не завершено.', 'Bevestiging niet afgerond.'));
  };
  const anderAccount = () => {
    if (pauze.actief) return;
    setMelding('');
    void startPrimaryRedirectLogin({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin, locale: uk ? 'uk' : 'nl', intent: 'replace-tab' }).catch((e: unknown) => {
      const p = pauze.vangPauze(e);
      if (!p.isPauze) setMelding(aanmeldStartFoutTekst(e, uk ? 'uk' : 'nl'));
    });
  };
  const zetKant = (k: Kant, aan: boolean) => setKanten((huidig) => { const n = aan ? [...new Set([...huidig, k])] : huidig.filter((x) => x !== k); return (n.length ? n : ['gebruiker']).sort() as Kant[]; });

  const stapNaam: Record<Stap, string> = {
    bevestigen: tr('Підтвердження', 'Bevestigen'), beveiliging: tr('Захист', 'Beveiliging'), account: tr('Обліковий запис', 'Account'),
    ruimte: tr('Простір', 'Ruimte'), rechten: tr('Дозволи', 'Rechten'),
  };

  return (
    <Venster id='mcp-toestemming' titel={tr(`Підключення ${agent.naam}`, `${agent.naam} koppelen`)} breedte={760} labelledBy='v2-wizard-titel' className='mcp-consent-venster v2-wizard-venster'>
      <div className='v2-wizard' data-v2-wizard={info.agent} data-v2-stap={stap} data-mq-laag-open='1'>
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
            <p className='v2-uitleg'><KeyRound size={16} aria-hidden='true' />{tr('У налаштуваннях ви ввімкнули додаткове підтвердження для кожного нового підключення. Підтвердіть passkey або кодом із застосунку.', 'In de instellingen zette u extra bevestiging aan voor elke nieuwe koppeling. Bevestig met een passkey of een code uit de app.')}</p>
            {bevestigd ? <p className='v2-ok'><Check size={16} />{tr('Підтверджено', 'Bevestigd')}</p> : <button type='button' className='mcp-consent-primary' onClick={() => void bevestigNu()}><ShieldCheck size={16} />{tr('Підтвердити зараз', 'Nu bevestigen')}</button>}
          </section>
        ) : null}

        {stap === 'account' ? (
          <section className='v2-wizard-deel'>
            <div className='v2-account'><UserRound size={22} aria-hidden='true' /><div><b>{v.account.email}</b><small>{v.account.eigenaar ? tr('власник сайту', 'eigenaar van de site') : tr('ваш обліковий запис', 'uw account')}</small></div><span className='v2-chip is-nieuw'><Check size={12} />{tr('вибрано', 'gekozen')}</span></div>
            <button type='button' className='mcp-consent-secondary' disabled={pauze.actief} onClick={anderAccount}><LogIn size={16} />{pauze.actief && pauzeTekst ? pauzeTekst.knop : tr('Підключити інший обліковий запис', 'Ander account koppelen')}</button>
            <p className='v2-uitleg'>{tr('Запит збережеться: після входу вікно відкриється знову. Також можна перемкнути обліковий запис у меню вгорі праворуч.', 'Het verzoek blijft bewaard: na het aanmelden opent dit venster opnieuw. U kunt ook van account wisselen in het menu rechtsboven.')}</p>
            {!v.methoden.passkey && !v.methoden.totp ? (
              <p className='v2-let' role='note'><ShieldQuestion size={16} aria-hidden='true' />{tr('У вас немає ні passkey, ні застосунку-автентифікатора. Ми радимо додати їх у «Налаштування → Безпека» і ввімкнути «Додаткове підтвердження підключень» у вкладці «Конектори»: тоді навіть викрадена сесія не зможе непомітно підключити ШІ до вашого простору.', 'U hebt geen passkey en geen authenticator-app. We raden aan ze toe te voegen onder «Instellingen → Beveiliging» en «Extra bevestiging van koppelingen» aan te zetten op het tabblad «Connectors»: dan kan zelfs een gestolen sessie niet ongemerkt een AI aan uw ruimte koppelen.')}</p>
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
                  {k === 'beheer' ? <small className='v2-let-klein'>{techActief(tech)
                    ? tr('Технічний профіль зараз активний: ці інструменти буде видно одразу. Щойно ви вийдете з профілю — вони зникнуть самі.', 'Het technische profiel is nu actief: deze hulpmiddelen zijn meteen zichtbaar. Zodra u het profiel verlaat, verdwijnen ze van zelf.')
                    : tr('Профіль зараз вимкнений — дозвіл можна дати вже тепер: інструменти з’являться самі, коли ви ввімкнете технічний профіль, і зникнуть, коли вийдете.', 'Het profiel staat nu uit — u kunt het recht nu al geven: de hulpmiddelen komen zodra u het technische profiel aanzet en verdwijnen zodra u het verlaat.')}</small> : null}
                </span>
              </label>
            ))}
            <p className='v2-uitleg'>{tr('Це один конектор з однією адресою. Дозволи технічного доступу ніколи не діють у приватному просторі й навпаки: кожен інструмент має позначку _gebruiker або _beheer. Права перевіряються не тут, а в момент кожного виклику — за вашим поточним станом.', 'Dit is één connector met één adres. Rechten van technische toegang gelden nooit in de privéruimte en omgekeerd: elk hulpmiddel draagt _gebruiker of _beheer. De rechten worden niet hier gecontroleerd maar bij elke aanroep — naar uw huidige staat.')}</p>
          </section>
        ) : null}

        {stap === 'rechten' ? (
          <section className='v2-wizard-deel'>
            {v.voorkeur?.herverbinden ? <p className='v2-uitleg'>{tr('Це перепідключення: нижче видно, що буде додано, що вже було і що не буде. Можна змінити тут же.', 'Dit is opnieuw verbinden: hieronder ziet u wat erbij komt, wat u al had en wat vervalt. U kunt het hier meteen wijzigen.')}</p> : null}
            {uitErfenis && v.erfenis ? <p className='v2-uitleg' data-v2-erfenis={v.erfenis.grants}>{tr(`Позначено те, що ви вже дозволили ${agent.naam} через старий конектор /mcp (${v.erfenis.grants} ${v.erfenis.grants === 1 ? 'підключення' : 'підключень'}): нічого не зникає, усе можна змінити тут.`, `Aangevinkt staat wat u ${agent.naam} al toestond via de oude connector /mcp (${v.erfenis.grants} ${v.erfenis.grants === 1 ? 'koppeling' : 'koppelingen'}): niets vervalt, alles is hier te wijzigen.`)}</p> : null}
            <RechtenKiezer tr={tr} agent={info.agent} kanten={kanten} waarde={gekozen} onChange={setSleutels} vorige={v.vorige?.sleutels ?? null} techNu={techActief(tech)} />
            {(() => {
              // 21.10.2026: wat in de keuze langs «підтвердження на сайті» gaat — de AI vraagt alleen, de server voert pas na uw klik uit.
              const met = gekozen.map((k) => v2Optie(k)).filter((o) => !!o && !!o.intern && !!MET_BEVESTIGING[o.intern as string]);
              if (!met.length) return null;
              const namen = met.map((o) => (uk ? o!.uk[0] : o!.nl[0])).join(', ');
              return <p className='v2-uitleg v2-bevestiging-noot' data-v2-met-bevestiging={met.length}><ShieldCheck size={16} aria-hidden='true' />{tr(`Кожна дія — з вашим підтвердженням на сайті (${met.length}): ${namen}. ШІ лише просить, а виконує сервер після вашого «Підтвердити».`, `Elke actie met uw bevestiging op de site (${met.length}): ${namen}. De AI vraagt alleen; de server voert uit na uw «Bevestigen».`)}</p>;
            })()}
            <p className={`v2-samenvatting risico-${risico}`}>{tr('Найвищий ризик у виборі:', 'Hoogste risico in de keuze:')} <b>{RISICO_TEKST[risico][uk ? 'uk' : 'nl']}</b> · {gekozen.length} {tr('дозволів', 'rechten')}
              {gekozen.length === 0 ? <> · {tr('ШІ нічого не зможе робити', 'de AI kan niets doen')}</> : null}
              {' '}<button type='button' className='v2-link' onClick={() => setSleutels(STANDAARD(kanten))}>{tr('Повернути безпечний стандарт', 'Veilige standaard terugzetten')}</button>
            </p>
          </section>
        ) : null}

        {pauzeTekst ? <p className='mcp-consent-msg' role='status' aria-live='polite'>{pauze.actief ? `${pauzeTekst.kop}. ${pauzeTekst.uitleg}` : pauzeTekst.vrij}</p> : null}
        {melding && !pauze.actief ? <p className='mcp-consent-msg' role='alert'>{melding}</p> : null}

        {/* Vaste onderste rij (koppel-wizard-plaats.css: sticky): «Далі/Дозволити», «Назад», «Заборонити», «Пізніше» altijd in beeld;
            de stap erboven scrolt. Op de telefoon twee rijen: [Назад][Далі] / [Заборонити][Пізніше]. */}
        <footer className={`mcp-consent-actions v2-wizard-acties${i > 0 ? ' met-terug' : ''}`}>
          <button type='button' className='mcp-consent-secondary' data-v2-actie='weigeren' disabled={bezig || pauze.actief} onClick={() => void beslis(false)}>{tr('Заборонити', 'Weigeren')}</button>
          <span className='v2-ruimte-vul' />
          {i > 0 ? <button type='button' className='mcp-consent-secondary' data-v2-actie='terug' disabled={bezig} onClick={terug}><ArrowLeft size={16} />{tr('Назад', 'Terug')}</button> : null}
          {stap !== 'rechten'
            ? <button type='button' className='mcp-consent-primary' data-v2-actie='verder' disabled={bezig || (stap === 'beveiliging' && !bevestigd)} onClick={volgende}>{tr('Далі', 'Volgende')}<ArrowRight size={16} /></button>
            : <button type='button' className={`mcp-consent-primary risico-${risico}`} data-v2-actie='toestaan' disabled={bezig || pauze.actief} onClick={() => void beslis(true)} data-v2-toestaan='1'><Check size={16} />{pauze.actief && pauzeTekst ? pauzeTekst.knop : tr('Дозволити', 'Toestaan')}</button>}
          <button type='button' className='v2-link' data-v2-actie='later' onClick={onKlaar}>{tr('Пізніше', 'Later')}</button>
        </footer>
      </div>
    </Venster>
  );
}
