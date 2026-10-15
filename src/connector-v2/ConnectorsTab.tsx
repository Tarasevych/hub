// Connector v2 — tabblad «Конектори» op mcp.*/agents: per AI-agent een eigen adres, de actieve koppelingen, de rechten (zelfde
// kiezer als in het toestemmingsvenster), herverbinden en intrekken. Inperken geldt meteen; uitbreiden wordt onthouden en vraagt
// herverbinden — de keuze gaat niet verloren tot de nieuwe toestemming. Plus de instelling «extra bevestiging bij koppelen».
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Link2, RefreshCw, ShieldCheck, ShieldQuestion, SlidersHorizontal, Trash2, UserRound, Wrench } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agents-data';
import { canonicalNavigationUrl } from '../canonical-navigation';
import { v2Agent, type AgentSlug } from '../../shared/connector-v2/agenten';
import { KANT_TEKST, V2_OPTIES, type Kant } from '../../shared/connector-v2/catalogus';
import { toolNaam } from '../../shared/connector-v2/namen';
import { breidtUit, hoogsteRisico, schoon, STANDAARD } from '../../shared/connector-v2/rechten';
import { RISICO_TEKST } from '../../shared/connector-v2/catalogus';
import RechtenKiezer, { Schakelaar } from './RechtenKiezer';
import './connector-v2.css';

type Tr = (uk: string, nl: string) => string;
type Keuze = { kanten: Kant[]; sleutels: string[] };
type AgentStand = {
  slug: AgentSlug; url: string;
  koppelingen: Array<{ id: string; clientName: string; createdAt: number; lastUsedAt: number | null; expiresAt: number; kanten: Kant[]; sleutels: string[] }>;
  voorkeur: (Keuze & { herverbinden: boolean; updatedAt: number }) | null;
  actief: Keuze | null;
};
type Data = { agenten: AgentStand[]; instellingen: { extraBevestigen: boolean }; account: { email: string; eigenaar: boolean }; methoden: { passkey: boolean; totp: boolean; herstelcode: boolean } };

const datum = (ms: number | null, uk: boolean) => (ms ? new Date(ms).toLocaleString(uk ? 'uk-UA' : 'nl-BE', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function AgentKaart({ tr, uk, a, eigenaar, naWijziging }: { tr: Tr; uk: boolean; a: AgentStand; eigenaar: boolean; naWijziging: () => Promise<void> }) {
  const info = v2Agent(a.slug);
  const basis: Keuze = a.voorkeur ?? a.actief ?? { kanten: ['gebruiker'], sleutels: STANDAARD() };
  const [open, setOpen] = useState(false);
  const [kanten, setKanten] = useState<Kant[]>(basis.kanten);
  const [sleutels, setSleutels] = useState<string[]>(basis.sleutels);
  const [melding, setMelding] = useState('');
  const [bezig, setBezig] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);
  useEffect(() => { setKanten(basis.kanten); setSleutels(basis.sleutels); }, [a.voorkeur?.updatedAt, a.actief?.sleutels.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const gekozen = schoon(sleutels, kanten);
  const gewijzigd = gekozen.join() !== schoon(basis.sleutels, basis.kanten).join() || kanten.join() !== basis.kanten.join();
  const verbonden = a.koppelingen.length > 0;
  const wachtOpHerverbinden = !!a.voorkeur?.herverbinden;
  const voorbeeld = V2_OPTIES.find((o) => o.key === 'v2_whoami:gebruiker');

  const doe = async (pad: string, extra: Record<string, unknown>, ok: (d: any) => string) => {
    setBezig(true); setMelding('');
    try { const r = await api.post(pad, { ...sessionBody(), agent: a.slug, ...extra }); setMelding(ok(r.data)); await naWijziging(); }
    catch (e) {
      const code = String((e as Error)?.message ?? '');
      setMelding(code === 'TECH_PROFIEL_VEREIST' || code === 'OWNER_REQUIRED' ? tr('Технічний доступ змінює лише власник з активним технічним профілем у цій вкладці.', 'Technische toegang wijzigt alleen de eigenaar met actief technisch profiel in dit tabblad.') : tr(`Не вдалося (${code || 'немає зв’язку'}).`, `Mislukt (${code || 'geen verbinding'}).`));
    } finally { setBezig(false); }
  };
  const bewaar = () => doe('/api/owner/connector-v2/wijzig', { kanten, sleutels: gekozen }, (d) => d.herverbinden
    ? tr(`Збережено. Обмеження вже діють (${d.ingeperkt}); нові дозволи з’являться після перепідключення.`, `Opgeslagen. Beperkingen gelden al (${d.ingeperkt}); nieuwe rechten komen na opnieuw verbinden.`)
    : verbonden ? tr('Збережено й уже діє для активного підключення.', 'Opgeslagen en al van kracht voor de actieve koppeling.') : tr('Збережено. Ці дозволи буде запропоновано під час підключення.', 'Opgeslagen. Deze rechten worden voorgesteld bij het koppelen.'));
  const herverbind = () => doe('/api/owner/connector-v2/herverbind', {}, () => tr(`Підключення закрито. Відкрийте ${info.naam}: він попросить підключитися знову, і ви побачите, що буде додано.`, `Koppeling gesloten. Open ${info.naam}: die vraagt opnieuw te verbinden en u ziet wat erbij komt.`));
  const intrek = () => doe('/api/owner/connector-v2/intrekken', {}, (d) => tr(`Відкликано: ${d.ingetrokken}. ${info.naam} більше нічого не зможе зробити, доки ви знову не підключите.`, `Ingetrokken: ${d.ingetrokken}. ${info.naam} kan niets meer tot u opnieuw koppelt.`));

  return (
    <li className={`v2-agent${verbonden ? ' is-verbonden' : ''}`} data-v2-agent={a.slug}>
      <div className='v2-agent-kop'>
        <span className='v2-agent-logo' aria-hidden='true'>{info.naam.slice(0, 1)}</span>
        <div className='v2-agent-tekst'>
          <h3>{info.naam}</h3>
          <code className='v2-adres'>{a.url}
            <button type='button' className='v2-kopieer' aria-label={tr('Копіювати адресу конектора', 'Connectoradres kopiëren')} onClick={() => { void navigator.clipboard?.writeText(a.url).then(() => { setGekopieerd(true); window.setTimeout(() => setGekopieerd(false), 1500); }); }}>{gekopieerd ? <Check size={13} /> : <Copy size={13} />}</button>
          </code>
          <small>{uk ? info.uk : info.nl}</small>
        </div>
        <span className={`v2-chip ${verbonden ? 'is-nieuw' : ''}`}>{verbonden ? <><Link2 size={12} />{tr(`підключено: ${a.koppelingen.length}`, `gekoppeld: ${a.koppelingen.length}`)}</> : tr('не підключено', 'niet gekoppeld')}</span>
      </div>
      {wachtOpHerverbinden ? <p className='v2-let' role='status'><RefreshCw size={15} aria-hidden='true' />{tr('Є зміни, які чекають на перепідключення. Ваш вибір збережено.', 'Er zijn wijzigingen die op opnieuw verbinden wachten. Uw keuze is bewaard.')}</p> : null}
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
      <div className='v2-agent-acties'>
        <button type='button' className='v2-knop' aria-expanded={open} onClick={() => setOpen((x) => !x)}><SlidersHorizontal size={15} />{tr('Дозволи', 'Rechten')}</button>
        {verbonden ? <button type='button' className='v2-knop' disabled={bezig} onClick={() => void herverbind()}><RefreshCw size={15} />{tr('Перепідключити', 'Opnieuw verbinden')}</button> : null}
        {verbonden ? <button type='button' className='v2-knop is-gevaar' disabled={bezig} onClick={() => void intrek()}><Trash2 size={15} />{tr('Відкликати', 'Intrekken')}</button> : null}
      </div>
      {open ? (
        <div className='v2-agent-rechten'>
          {eigenaar ? (
            <div className='v2-ruimtes is-rij'>
              {(['gebruiker', 'beheer'] as Kant[]).map((k) => (
                <label key={k} className={`v2-ruimte-kaart kant-${k}${kanten.includes(k) ? ' is-gekozen' : ''}`}>
                  <input type='checkbox' checked={kanten.includes(k)} onChange={(e) => setKanten((h) => { const n = e.target.checked ? [...new Set([...h, k])] : h.filter((x) => x !== k); return (n.length ? n : ['gebruiker']).sort() as Kant[]; })} />
                  <span className='v2-kant-icoon' aria-hidden='true'>{k === 'beheer' ? <Wrench size={18} /> : <UserRound size={18} />}</span>
                  <span><b>{KANT_TEKST[k][uk ? 'uk' : 'nl']}</b></span>
                </label>
              ))}
            </div>
          ) : null}
          <RechtenKiezer tr={tr} agent={a.slug} kanten={kanten} waarde={gekozen} onChange={setSleutels} vorige={verbonden && a.actief ? a.actief.sleutels : null} />
          <div className='v2-agent-acties'>
            <button type='button' className='v2-knop is-primair' disabled={bezig || !gewijzigd} onClick={() => void bewaar()} data-v2-bewaar={a.slug}><Check size={15} />{tr('Зберегти', 'Opslaan')}</button>
            {verbonden && a.actief && breidtUit(a.actief.sleutels, gekozen) ? <small className='v2-let-klein'>{tr('Розширення почне діяти після перепідключення; обмеження — одразу.', 'Uitbreiden werkt na opnieuw verbinden; beperken meteen.')}</small> : null}
          </div>
          {voorbeeld ? <p className='v2-uitleg'>{tr('Приклад назви інструмента для цього агента:', 'Voorbeeld van een hulpmiddelnaam voor deze agent:')} <code>{toolNaam(voorbeeld, a.slug)}</code></p> : null}
        </div>
      ) : null}
      {melding ? <p className='v2-melding' role='status'>{melding}</p> : null}
    </li>
  );
}

export default function ConnectorsTab({ tr }: { tr: Tr }) {
  const uk = tr('uk', 'nl') === 'uk';
  const [data, setData] = useState<Data | null>(null);
  const [fout, setFout] = useState('');
  const laad = useCallback(async () => {
    try { setData((await api.post('/api/owner/connector-v2/overzicht', sessionBody())).data as Data); setFout(''); }
    catch (e) { setFout(String((e as Error)?.message ?? 'FOUT')); }
  }, []);
  useEffect(() => { void laad(); }, [laad]);
  const zetExtra = async (v: boolean) => {
    try { await api.post('/api/owner/connector-v2/instellingen', { ...sessionBody(), extraBevestigen: v }); await laad(); }
    catch (e) { setFout(String((e as Error)?.message ?? 'FOUT')); }
  };
  const lang = uk ? 'uk' : 'nl';
  return (
    <div className='ag-tab v2-tab' data-v2-tab='connectors'>
      <section className='v2-intro'>
        <h2>{tr('Конектори ШІ — окрема адреса для кожного агента', 'AI-connectors — een eigen adres per agent')}</h2>
        <p>{tr('Кожен ШІ підключається лише за своєю адресою. Токен однієї адреси не працює на іншій, а назва кожного інструмента містить ім’я агента, піддомен, сервіс і позначку простору: _gebruiker (ваше) чи _beheer (керування сайтом). Ви самі вирішуєте, які інструменти бачить кожен агент.', 'Elke AI koppelt alleen via zijn eigen adres. Een token van het ene adres werkt niet op een ander, en elke hulpmiddelnaam bevat de agent, het subdomein, de dienst en de ruimte: _gebruiker (van u) of _beheer (beheer van de site). U bepaalt zelf welke hulpmiddelen elke agent ziet.')}</p>
        <p className='v2-uitleg'>{tr('Старий загальний конектор /mcp продовжує працювати для вже підключених ШІ.', 'De oude gezamenlijke connector /mcp blijft werken voor al gekoppelde AI.')}</p>
      </section>

      <section className='v2-instelling' aria-label={tr('Захист підключень', 'Beveiliging van koppelingen')}>
        <Schakelaar aan={!!data?.instellingen.extraBevestigen} kant='gebruiker' label={tr('Додаткове підтвердження кожного нового підключення', 'Extra bevestiging van elke nieuwe koppeling')} onChange={(v) => void zetExtra(v)} disabled={!data} />
        <div>
          <b>{tr('Додаткове підтвердження кожного нового підключення', 'Extra bevestiging van elke nieuwe koppeling')}</b>
          <p>{tr('Перед видачею доступу сайт попросить passkey або код із застосунку-автентифікатора — навіть якщо ви щойно увійшли. Це захищає, якщо хтось заволодів вашою сесією в браузері.', 'Voor toegang vraagt de site een passkey of code uit de authenticator-app — ook als u net aanmeldde. Dat beschermt als iemand uw browsersessie overnam.')}</p>
          {data && !data.methoden.passkey && !data.methoden.totp ? (
            <p className='v2-let' role='note'><ShieldQuestion size={15} aria-hidden='true' />{tr('У вас ще немає passkey чи застосунку-автентифікатора, тому зараз підтвердження йде через повторний вхід Google. Додайте сильніший спосіб:', 'U hebt nog geen passkey of authenticator-app, dus nu gaat bevestigen via opnieuw aanmelden bij Google. Voeg een sterkere manier toe:')} <a href={canonicalNavigationUrl('identity', 'methods', lang)}><KeyRound size={13} />{tr('Способи входу', 'Aanmeldmethoden')}</a></p>
          ) : data ? <p className='v2-ok'><ShieldCheck size={15} />{tr('Сильний спосіб підтвердження є', 'Een sterke bevestigingsmanier is aanwezig')} ({[data.methoden.passkey ? 'passkey' : '', data.methoden.totp ? tr('застосунок', 'app') : ''].filter(Boolean).join(', ')})</p> : null}
        </div>
      </section>

      {fout ? <p className='ag-melding ag-melding-fout' role='alert'>{tr(`Не вдалося завантажити (${fout}).`, `Laden mislukt (${fout}).`)}</p> : null}
      {data ? (
        <ul className='v2-agenten'>
          {data.agenten.map((a) => <AgentKaart key={a.slug} tr={tr} uk={uk} a={a} eigenaar={data.account.eigenaar} naWijziging={laad} />)}
        </ul>
      ) : !fout ? <p>{tr('Завантаження…', 'Laden…')}</p> : null}
    </div>
  );
}
