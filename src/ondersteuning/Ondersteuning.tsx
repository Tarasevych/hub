// «Підтримка від імені» (etap 7). Twee kanten:
//  - ToestemmingLaag (voor ELKE gebruiker): een verzoek verschijnt als venster «Дозволити / Відхилити»; lopende toegang als RODE
//    band bovenaan (rood is voorbehouden aan «від імені») met «Завершити». Toestaan vraagt een verse bevestiging van de aanmelding.
//  - OndersteuningVenster (ondersteuner in technisch profiel): aanvragen, eigen verzoeken, en het alleen-lezen overzicht.
import { useEffect, useState } from 'react';
import { Eye, LifeBuoy, ShieldAlert, X } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { routeLang } from '../canonical-navigation';
import { ecosystemTabContext } from '../tab-context';
import { serviceFromLocation } from '../canonical-navigation';
import { abonneerZijbalk, zijbalkServerDienst } from '../zijbalk-voorkeuren';
import Vraag from '../tech/Vraag';
import { techActief, useTech } from '../tech/tech-store';
import { HELP_ONDERSTEUNING, HELP_TOESTEMMING } from '../../shared/ondersteuning';
import './ondersteuning.css';

type Verzoek = { id: string; reden: string; minuten: number; nood: boolean; status: string; aangevraagd: number; besloten: number | null; eind: number | null; aanvrager?: string; doel?: string; ditTabblad?: boolean };
const body = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const tijd = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
const FOUTEN: Record<string, [string, string]> = {
  TECH_ONDERSTEUNING_VEREIST: ['Потрібен активний технічний профіль із правом підтримки.', 'Een actief technisch profiel met ondersteuning is nodig.'],
  GEBRUIKER_NIET_GEVONDEN: ['Користувача з такою поштою не знайдено.', 'Geen gebruiker met dit e-mailadres.'],
  GEBRUIKER_NIET_GOEDGEKEURD: ['Цей обліковий запис ще не схвалено.', 'Dit account is nog niet goedgekeurd.'],
  EIGENAAR_ONAANTASTBAAR: ['Обліковий запис власника сервера переглядати не можна.', 'Het account van de eigenaar kan niet bekeken worden.'],
  NIET_AAN_JEZELF: ['Собі — не можна.', 'Niet bij uzelf.'],
  NOOD_ALLEEN_EIGENAAR: ['Термінова підтримка — лише для власника сервера.', 'Noodtoegang alleen voor de eigenaar van de server.'],
  GEEN_TOESTEMMING: ['Немає дозволу (ще не дозволено, відхилено або час вийшов).', 'Geen toestemming (nog niet, geweigerd of verlopen).'],
  ANDER_TABBLAD: ['Переглядати можна лише у вкладці, з якої надіслано запит.', 'Alleen te bekijken in het tabblad van de aanvraag.'],
  VERZOEK_NIET_OPEN: ['Запит уже закрито.', 'Verzoek is al gesloten.'],
  REDEN_ONGELDIG: ['Вкажіть причину (від 3 символів).', 'Geef een reden (minstens 3 tekens).'],
  EMAIL_ONGELDIG: ['Перевірте адресу пошти.', 'Controleer het e-mailadres.'],
};
const foutTekst = (e: unknown, uk: boolean) => { const c = String((e as Error)?.message || 'FOUT'); const f = FOUTEN[c]; return f ? (uk ? f[0] : f[1]) : /STEP_UP|STAP_OP/.test(c) ? (uk ? 'Вхід не підтверджено — нічого не змінено.' : 'Aanmelding niet bevestigd — niets gewijzigd.') : `${uk ? 'Не вдалося' : 'Mislukt'} (${c}).`; };

// ---------------------------------------------------------------- gebruiker: toestemming + rode band
export function ToestemmingLaag() {
  const uk = routeLang() !== 'nl';
  const [lijst, setLijst] = useState<Verzoek[]>([]);
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState('');
  const [, setTik] = useState(0);
  useEffect(() => {
    let laatsteDienst = '';
    const laad = () => { if (!zijbalkServerDienst() || document.hidden) return; void api.post('/api/ondersteuning/voor-mij', body()).then((r) => setLijst((r.data?.verzoeken ?? []) as Verzoek[]), () => undefined); };
    const wijz = () => { const d = zijbalkServerDienst(); if (d !== laatsteDienst) { laatsteDienst = d; if (d) laad(); else setLijst([]); } };
    const weg = abonneerZijbalk(wijz); wijz();
    const i = window.setInterval(laad, 60_000);
    const zicht = () => { if (!document.hidden) laad(); };
    document.addEventListener('visibilitychange', zicht);
    const t = window.setInterval(() => setTik((x) => x + 1), 30_000);
    return () => { weg(); window.clearInterval(i); window.clearInterval(t); document.removeEventListener('visibilitychange', zicht); };
  }, []);
  const actief = lijst.find((v) => v.status === 'goedgekeurd' && (v.eind ?? 0) > Date.now());
  const wacht = lijst.find((v) => v.status === 'wacht');
  useEffect(() => {
    const html = document.documentElement;
    if (actief) html.dataset.ondersteuning = 'aan'; else delete html.dataset.ondersteuning;
    return () => { delete html.dataset.ondersteuning; };
  }, [!!actief]);
  const doe = async (pad: string, id: string) => {
    setBezig(id + pad); setMelding('');
    try { await api.post(pad, { ...body(), id }); const r = await api.post('/api/ondersteuning/voor-mij', body()); setLijst((r.data?.verzoeken ?? []) as Verzoek[]); }
    catch (e) { setMelding(foutTekst(e, uk)); } finally { setBezig(''); }
  };
  return (
    <>
      {actief ? (
        <div className='ond-band' role='region' aria-label={uk ? 'Підтримка переглядає ваш простір' : 'Ondersteuning bekijkt uw ruimte'} data-ond-band='1'>
          <ShieldAlert aria-hidden='true' />
          <span className='ond-band-tekst'><b>{uk ? 'ПІДТРИМКА' : 'ONDERSTEUNING'}</b> {uk ? 'до' : 'tot'} {tijd(actief.eind)}{actief.nood ? (uk ? ' · термінова' : ' · nood') : ''} · {actief.aanvrager} {uk ? 'переглядає огляд вашого облікового запису · лише читання' : 'bekijkt het overzicht van uw account · alleen lezen'}</span>
          <button type='button' onClick={() => void doe('/api/ondersteuning/beeindigen', actief.id)} disabled={!!bezig} data-ond-knop='beeindigen'><X aria-hidden='true' />{uk ? 'Завершити' : 'Beëindigen'}</button>
        </div>
      ) : null}
      {wacht ? (
        <Venster id='ond-toestemming' titel={uk ? 'Запит на підтримку' : 'Verzoek om ondersteuning'} breedte={480} onSluit={() => setLijst((l) => l.filter((x) => x.id !== wacht.id))} prioriteit='kritiek'>
          <div className='ond-venster' data-ond-toestemming={wacht.id}>
            <p><b>{wacht.aanvrager}</b> {uk ? `просить ${wacht.minuten} хв на перегляд огляду вашого облікового запису.` : `vraagt ${wacht.minuten} min om het overzicht van uw account te bekijken.`} <Vraag help={HELP_TOESTEMMING} uk={uk} label={uk ? 'Що побачить підтримка' : 'Wat ondersteuning ziet'} /></p>
            <p className='ond-reden'>{uk ? 'Причина' : 'Reden'}: {wacht.reden}</p>
            <p className='ond-meta'>{uk ? 'Лише читання: стан облікового запису, налаштування, пристрої, підключення ШІ, звіти перевірки й останні дії. Без вмісту листів, ключів і паролів. Завершити можна будь-коли.' : 'Alleen lezen: status, instellingen, apparaten, AI-verbindingen, controleverslagen en recente acties. Geen mailinhoud, sleutels of wachtwoorden. Op elk moment te beëindigen.'}</p>
            {melding ? <p className='ond-melding' role='alert'>{melding}</p> : null}
            <div className='ond-knoppen'>
              <button type='button' onClick={() => void doe('/api/ondersteuning/weigeren', wacht.id)} disabled={!!bezig} data-ond-knop='weigeren'>{uk ? 'Відхилити' : 'Weigeren'}</button>
              <button type='button' className='is-hoofd' onClick={() => void doe('/api/ondersteuning/toestaan', wacht.id)} disabled={!!bezig} aria-busy={bezig === wacht.id + '/api/ondersteuning/toestaan' || undefined} data-ond-knop='toestaan'>{uk ? `Дозволити на ${wacht.minuten} хв` : `Toestaan voor ${wacht.minuten} min`}</button>
            </div>
            <p className='ond-meta'>{uk ? 'Сайт попросить підтвердити вхід.' : 'De site vraagt uw aanmelding te bevestigen.'}</p>
          </div>
        </Venster>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- ondersteuner
export function OndersteuningVenster({ sluit }: { sluit: () => void }) {
  const uk = routeLang() !== 'nl';
  const t = useTech();
  const eigenaar = !!t.activatie?.rollen.includes('eigenaar');
  const [email, setEmail] = useState('');
  const [reden, setReden] = useState('');
  const [minuten, setMinuten] = useState(15);
  const [nood, setNood] = useState(false);
  const [lijst, setLijst] = useState<Verzoek[] | null>(null);
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [bekijk, setBekijk] = useState('');
  const laad = () => api.post('/api/ondersteuning/mijn-aanvragen', body()).then((r) => setLijst((r.data?.aanvragen ?? []) as Verzoek[]), (e) => setMelding({ ok: false, tekst: foutTekst(e, uk) }));
  useEffect(() => { void laad(); const i = window.setInterval(() => void laad(), 15_000); return () => window.clearInterval(i); }, []);
  const vraag = async () => {
    setBezig('vraag'); setMelding(null);
    try { await api.post('/api/ondersteuning/aanvragen', { ...body(), email, reden, minuten, nood }); setMelding({ ok: true, tekst: nood ? (uk ? 'Термінову підтримку розпочато; користувача сповіщено.' : 'Noodtoegang gestart; de gebruiker is verwittigd.') : (uk ? 'Запит надіслано. Чекаємо відповіді користувача (до 15 хв).' : 'Verzoek verstuurd. Wachten op antwoord (tot 15 min).') }); setReden(''); setNood(false); await laad(); }
    catch (e) { setMelding({ ok: false, tekst: foutTekst(e, uk) }); } finally { setBezig(''); }
  };
  const STATUS: Record<string, [string, string]> = { wacht: ['чекає відповіді', 'wacht op antwoord'], goedgekeurd: ['дозволено', 'toegestaan'], geweigerd: ['відхилено', 'geweigerd'], beeindigd: ['завершено', 'beëindigd'], verlopen: ['час вийшов', 'verlopen'], ingetrokken: ['замінено', 'vervangen'] };
  return (
    <>
      <Venster id='tech-ondersteuning' titel={uk ? 'Підтримка від імені (за згодою)' : 'Ondersteuning (met toestemming)'} breedte={580} onSluit={sluit}>
        <div className='tech-venster' data-tech-venster='ondersteuning'>
          <p className='tech-lead'>{uk ? 'Користувач сам дозволяє перегляд. Ви бачите лише огляд (без вмісту листів і ключів), лише в цій вкладці й лише на дозволений час.' : 'De gebruiker staat het zelf toe. U ziet alleen een overzicht, alleen in dit tabblad en alleen voor de toegestane tijd.'} <Vraag help={HELP_ONDERSTEUNING} uk={uk} label={uk ? 'Підтримка' : 'Ondersteuning'} /></p>
          <form className='tech-geven' onSubmit={(e) => { e.preventDefault(); if (!bezig) void vraag(); }}>
            <label className='tech-veld'><span>{uk ? 'Пошта користувача' : 'E-mail van de gebruiker'}</span><input type='email' value={email} onChange={(e) => setEmail(e.target.value)} required data-ond-email='1' /></label>
            <label className='tech-veld'><span>{uk ? 'Причина (користувач її побачить)' : 'Reden (de gebruiker ziet die)'}</span><input value={reden} onChange={(e) => setReden(e.target.value)} minLength={3} maxLength={300} required data-ond-reden='1' /></label>
            <label className='tech-veld'><span>{uk ? 'Термін' : 'Duur'}</span><select value={minuten} onChange={(e) => setMinuten(Number(e.target.value))} data-ond-minuten='1'>{[5, 10, 15, 20, 30].map((m) => <option key={m} value={m}>{m} {uk ? 'хв' : 'min'}</option>)}</select></label>
            {eigenaar ? <label className='ond-nood'><input type='checkbox' checked={nood} onChange={(e) => setNood(e.target.checked)} data-ond-nood='1' />{uk ? 'Термінова (без згоди, лише власник сервера; користувача сповістимо одразу)' : 'Nood (zonder toestemming, alleen eigenaar; gebruiker wordt meteen verwittigd)'}</label> : null}
            <div className='tech-knoppen'><button type='submit' className='is-hoofd' disabled={!!bezig || !email || reden.trim().length < 3} data-ond-knop='aanvragen'>{nood ? (uk ? 'Почати термінову' : 'Nood starten') : (uk ? 'Надіслати запит' : 'Verzoek sturen')}</button></div>
          </form>
          {melding ? <p className={`tech-melding${melding.ok ? ' is-ok' : ''}`} role={melding.ok ? 'status' : 'alert'}>{melding.tekst}</p> : null}
          <h3>{uk ? 'Ваші запити' : 'Uw verzoeken'}</h3>
          {lijst === null ? <p className='tech-meta'>{uk ? 'Завантаження…' : 'Laden…'}</p> : !lijst.length ? <p className='tech-meta'>{uk ? 'Ще немає.' : 'Nog geen.'}</p> : (
            <ul className='tech-lijst' data-ond-lijst='1'>{lijst.map((v) => (
              <li key={v.id} data-ond-verzoek={v.id} data-ond-status={v.status}>
                <span className='tech-lijst-wie'><b>{v.doel}</b><small>{v.reden}</small></span>
                <span className='tech-lijst-stand'>{uk ? STATUS[v.status]?.[0] : STATUS[v.status]?.[1]}{v.status === 'goedgekeurd' ? ` · ${uk ? 'до' : 'tot'} ${tijd(v.eind)}` : ''}{v.nood ? (uk ? ' · термінова' : ' · nood') : ''}</span>
                {v.status === 'goedgekeurd' && (v.eind ?? 0) > Date.now() ? (
                  <span className='tech-knoppen'>
                    {v.ditTabblad ? <button type='button' className='is-hoofd' onClick={() => setBekijk(v.id)} data-ond-knop={`bekijken:${v.id}`}><Eye aria-hidden='true' />{uk ? 'Переглянути' : 'Bekijken'}</button> : <span className='tech-meta'>{uk ? 'лише у вкладці запиту' : 'alleen in het tabblad van de aanvraag'}</span>}
                    <button type='button' className='is-gevaar' onClick={() => void api.post('/api/ondersteuning/beeindigen', { ...body(), id: v.id }).then(laad)} data-ond-knop={`beeindigen:${v.id}`}>{uk ? 'Завершити' : 'Beëindigen'}</button>
                  </span>) : v.status === 'wacht' ? <span className='tech-knoppen'><button type='button' onClick={() => void api.post('/api/ondersteuning/beeindigen', { ...body(), id: v.id }).then(laad)}>{uk ? 'Скасувати' : 'Annuleren'}</button></span> : null}
              </li>
            ))}</ul>
          )}
        </div>
      </Venster>
      {bekijk ? <Overzicht id={bekijk} uk={uk} sluit={() => setBekijk('')} actief={techActief(t)} /> : null}
    </>
  );
}

type OverzichtData = { verzoek: Verzoek; account: { email: string; naam: string; status: string; rol: string; aangemaakt: number | null }; weergave: string; techRollen: string[];
  apparaten: Array<{ naam: string; platform: string; status: string; laatst: number | null; browser: boolean; versie: string }>;
  aiVerbindingen: Array<{ klant: string; laatst: number | null; tot: number | null; aantal: number }>;
  diagnose: Array<{ oordeel: string; dienst: string; op: number; problemen: string[] }>;
  recenteActies: Array<{ actie: string; resultaat: string; dienst: string; op: number }> };
function Overzicht({ id, uk, sluit, actief }: { id: string; uk: boolean; sluit: () => void; actief: boolean }) {
  const [d, setD] = useState<OverzichtData | null>(null);
  const [fout, setFout] = useState('');
  useEffect(() => { if (!actief) { setFout(foutTekst(new Error('TECH_ONDERSTEUNING_VEREIST'), uk)); return; } void api.post('/api/ondersteuning/overzicht', { ...body(), id }).then((r) => setD(r.data as OverzichtData), (e) => setFout(foutTekst(e, uk))); }, [id]);
  const dt = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : '—');
  return (
    <Venster id='ond-overzicht' titel={uk ? 'Огляд від імені (лише читання)' : 'Overzicht namens (alleen lezen)'} breedte={680} onSluit={sluit}>
      <div className='ond-overzicht' data-ond-overzicht='1'>
        {d ? <p className='ond-kop' data-ond-kop='1'><ShieldAlert aria-hidden='true' /><b>{uk ? 'ВІД ІМЕНІ' : 'NAMENS'}</b> {d.account.email} · {uk ? 'лише читання' : 'alleen lezen'} · {uk ? 'до' : 'tot'} {tijd(d.verzoek.eind)}</p> : null}
        {fout ? <p className='ond-melding' role='alert'>{fout}</p> : !d ? <p className='tech-meta'>{uk ? 'Завантаження…' : 'Laden…'}</p> : (
          <>
            <section><h4>{uk ? 'Обліковий запис' : 'Account'}</h4><dl className='ond-dl'>
              <dt>{uk ? 'Пошта' : 'E-mail'}</dt><dd>{d.account.email}</dd><dt>{uk ? 'Ім’я' : 'Naam'}</dt><dd>{d.account.naam || '—'}</dd>
              <dt>{uk ? 'Стан' : 'Status'}</dt><dd>{d.account.status}</dd><dt>{uk ? 'Створено' : 'Aangemaakt'}</dt><dd>{dt(d.account.aangemaakt)}</dd>
              <dt>{uk ? 'Режим показу' : 'Weergave'}</dt><dd>{d.weergave === 'expert' ? (uk ? 'Розширений' : 'Uitgebreid') : (uk ? 'Простий' : 'Eenvoudig')}</dd>
              <dt>{uk ? 'Технічні ролі' : 'Technische rollen'}</dt><dd>{d.techRollen.join(', ') || '—'}</dd></dl></section>
            <section><h4>{uk ? 'Пристрої' : 'Apparaten'} ({d.apparaten.length})</h4>{d.apparaten.length ? <ul className='ond-lijst'>{d.apparaten.map((a, i) => <li key={i}><b>{a.naam}</b> · {a.platform || '—'} · {a.status === 'connected' ? (uk ? 'на зв’язку' : 'verbonden') : (uk ? 'не на зв’язку' : 'niet verbonden')} · {dt(a.laatst)}{a.browser ? (uk ? ' · браузер для ШІ' : ' · browser voor AI') : ''}{a.versie ? ` · v${a.versie}` : ''}</li>)}</ul> : <p className='tech-meta'>—</p>}</section>
            <section><h4>{uk ? 'Підключення ШІ' : 'AI-verbindingen'} ({d.aiVerbindingen.length})</h4>{d.aiVerbindingen.length ? <ul className='ond-lijst'>{d.aiVerbindingen.map((a, i) => <li key={i}><b>{a.klant}</b> · {uk ? 'востаннє' : 'laatst'} {dt(a.laatst)} · {uk ? 'до' : 'tot'} {dt(a.tot)}</li>)}</ul> : <p className='tech-meta'>—</p>}</section>
            <section><h4>{uk ? 'Звіти перевірки' : 'Controleverslagen'}</h4>{d.diagnose.length ? <ul className='ond-lijst'>{d.diagnose.map((x, i) => <li key={i}>{dt(x.op)} · {x.dienst} · <b>{x.oordeel}</b>{x.problemen.length ? ` · ${x.problemen.join(', ')}` : ''}</li>)}</ul> : <p className='tech-meta'>—</p>}</section>
            <section><h4>{uk ? 'Останні дії' : 'Recente acties'}</h4>{d.recenteActies.length ? <ul className='ond-lijst ond-acties'>{d.recenteActies.map((x, i) => <li key={i}>{dt(x.op)} · <code>{x.actie}</code> · {x.resultaat}{x.dienst ? ` · ${x.dienst}` : ''}</li>)}</ul> : <p className='tech-meta'>—</p>}</section>
            <p className='tech-meta'>{uk ? 'Кожен перегляд записується в журнал користувача.' : 'Elke weergave staat in het logboek van de gebruiker.'}</p>
          </>
        )}
      </div>
    </Venster>
  );
}
export const OndersteuningIcoon = LifeBuoy;
