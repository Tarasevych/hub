// Laag van het technisch profiel: de band bovenaan (alleen als het profiel in DIT tabblad loopt) en de vensters «Увімкнути»,
// «Колір смуги» en «Технічні профілі». Eigen React-root (main.tsx), los van de dienst die eronder draait, zodat de band op elke
// pagina van elk subdomein hetzelfde is.
import { useEffect, useMemo, useState } from 'react';
import { Clock, LogOut, Palette, ShieldCheck, Timer, Users } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { routeLang } from '../canonical-navigation';
import { HELP_TECH, contrast, maxMinutenVoor, rolInfo, type BandKleur, type BandPatroon, type TechRol } from '../../shared/tech-rollen';
import { openTechVenster, startTech, techActief, techActiveren, techBand, techBeeindigen, techBody, techMag, useTech, type TechStatus, type TechVenster } from './tech-store';
import Vraag from './Vraag';
import DiagnoseLaag from '../diagnose/Diagnose';
import './tech.css';

const fout = (e: unknown) => String((e as Error)?.message || 'FOUT');
const FOUTEN: Record<string, [string, string]> = {
  DUUR_ONGELDIG: ['Такий термін недоступний для ваших ролей.', 'Deze duur is niet beschikbaar voor uw rollen.'],
  REDEN_ONGELDIG: ['Вкажіть причину (від 3 символів).', 'Geef een reden (minstens 3 tekens).'],
  GEEN_TECH_PROFIEL: ['У вас немає технічного профілю.', 'U hebt geen technisch profiel.'],
  TECH_NIET_ACTIEF: ['Спершу увімкніть технічний профіль у цій вкладці.', 'Zet eerst het technisch profiel in dit tabblad aan.'],
  DELEGEREN_NIET_TOEGESTAAN: ['Ваші ролі не дозволяють призначати профілі.', 'Uw rollen staan toekennen niet toe.'],
  ROLLEN_BOVEN_EIGEN: ['Можна давати чи забирати лише ролі, які маєте самі.', 'U kunt alleen rollen geven of intrekken die u zelf hebt.'],
  EIGENAAR_ONAANTASTBAAR: ['Профіль власника сервера не змінюється через сайт.', 'Het profiel van de eigenaar wijzigt niet via de site.'],
  NIET_AAN_JEZELF: ['Собі змінювати профіль не можна.', 'Uw eigen profiel wijzigen kan niet.'],
  GEBRUIKER_NIET_GEVONDEN: ['Користувача з такою поштою не знайдено.', 'Geen gebruiker met dit e-mailadres.'],
  GEBRUIKER_NIET_GOEDGEKEURD: ['Цей обліковий запис ще не схвалено.', 'Dit account is nog niet goedgekeurd.'],
  EMAIL_ONGELDIG: ['Перевірте адресу пошти.', 'Controleer het e-mailadres.'],
  ROLLEN_ONGELDIG: ['Оберіть хоча б одну роль.', 'Kies minstens één rol.'],
};
const foutTekst = (e: unknown, uk: boolean) => { const c = fout(e); const f = FOUTEN[c]; if (f) return uk ? f[0] : f[1]; if (/STEP_UP|STAP_OP/.test(c)) return uk ? 'Вхід не підтверджено — нічого не змінено.' : 'Aanmelding niet bevestigd — niets gewijzigd.'; return `${uk ? 'Не вдалося' : 'Mislukt'} (${c}).`; };

const resterend = (t: TechStatus, nu: number) => Math.max(0, (t.activatie?.eind ?? 0) - (nu + t.scheef));
const mmss = (ms: number, uk: boolean) => { const m = Math.max(1, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} ${uk ? 'год' : 'u'} ${m % 60} ${uk ? 'хв' : 'min'}` : `${m} ${uk ? 'хв' : 'min'}`; };
const rolNaam = (r: string, uk: boolean) => { const i = rolInfo(r); return i ? (uk ? i.naam[0] : i.naam[1]) : r; };

export default function TechLaag() {
  const t = useTech();
  const uk = routeLang() !== 'nl';
  const [venster, setVenster] = useState<TechVenster | ''>('');
  const [nu, setNu] = useState(Date.now());
  const actief = techActief(t);

  useEffect(() => { startTech(); }, []);
  useEffect(() => {
    const op = (e: Event) => setVenster((e as CustomEvent<TechVenster>).detail);
    window.addEventListener('mr-tech-venster', op);
    return () => window.removeEventListener('mr-tech-venster', op);
  }, []);
  useEffect(() => { if (!actief) return; const i = window.setInterval(() => setNu(Date.now()), 15_000); return () => window.clearInterval(i); }, [actief]);

  // Band zichtbaar = kenmerk op <html> + kleuren als CSS-variabelen + [ТЕХ] in de titel van het tabblad (WCAG 1.4.1: niet alleen kleur).
  const kleur = t.profiel && t.catalogus ? t.catalogus.kleuren[t.profiel.band.kleur] : null;
  useEffect(() => {
    const html = document.documentElement;
    if (!actief) { delete html.dataset.tech; return; }
    html.dataset.tech = 'aan';
    html.dataset.techPatroon = t.profiel?.band.patroon || 'strepen';
    if (kleur) { html.style.setProperty('--tech-band-bg', kleur.bg); html.style.setProperty('--tech-band-fg', kleur.fg); }
    const prefix = uk ? '[ТЕХ] ' : '[TECH] ';
    const titel = () => { if (!document.title.startsWith(prefix)) document.title = prefix + document.title.replace(/^\[(ТЕХ|TECH)\] /, ''); };
    titel();
    const el = document.querySelector('title');
    const mo = el ? new MutationObserver(titel) : null;
    if (el && mo) mo.observe(el, { childList: true, characterData: true, subtree: true });
    return () => { mo?.disconnect(); document.title = document.title.replace(/^\[(ТЕХ|TECH)\] /, ''); delete html.dataset.tech; };
  }, [actief, kleur?.bg, kleur?.fg, t.profiel?.band.patroon, uk]);

  const rest = resterend(t, nu);
  return (
    <>
      {actief && t.activatie ? (
        <div className='tech-band' role='region' aria-label={uk ? 'Технічний режим' : 'Technische modus'} data-tech-band='1'>
          <span className='tech-band-merk'><ShieldCheck aria-hidden='true' />{uk ? 'ТЕХНІЧНИЙ' : 'TECHNISCH'}</span>
          <span className='tech-band-id' title={t.activatie.profielId}>{t.activatie.rollen.map((r) => rolNaam(r, uk)).join(' · ')}</span>
          <span className={`tech-band-tijd${rest < 5 * 60000 ? ' is-bijna' : ''}`} data-tech-rest={Math.round(rest / 60000)}><Timer aria-hidden='true' /><span className='tech-band-nog'>{uk ? 'ще' : 'nog'} </span>{mmss(rest, uk)}</span>
          <span className='tech-band-reden' title={t.activatie.reden}>{t.activatie.reden}</span>
          <span className='tech-band-knoppen'>
            <button type='button' onClick={() => setVenster('activeren')} data-tech-knop='verlengen'><Clock aria-hidden='true' /><span>{uk ? 'Подовжити' : 'Verlengen'}</span></button>
            {techMag('roles.delegate', t) ? <button type='button' onClick={() => setVenster('profielen')} data-tech-knop='profielen'><Users aria-hidden='true' /><span>{uk ? 'Профілі' : 'Profielen'}</span></button> : null}
            <button type='button' onClick={() => setVenster('band')} data-tech-knop='band' aria-label={uk ? 'Колір смуги' : 'Kleur van de band'}><Palette aria-hidden='true' /></button>
            <button type='button' className='is-uit' onClick={() => void techBeeindigen()} data-tech-knop='uit'><LogOut aria-hidden='true' /><span>{uk ? 'Вийти з технічного' : 'Technisch verlaten'}</span></button>
          </span>
        </div>
      ) : null}
      {venster === 'activeren' ? <Activeren uk={uk} t={t} sluit={() => setVenster('')} /> : null}
      {venster === 'band' ? <BandKeuze uk={uk} t={t} sluit={() => setVenster('')} /> : null}
      {venster === 'profielen' ? <Profielen uk={uk} t={t} sluit={() => setVenster('')} /> : null}
      <DiagnoseLaag />
    </>
  );
}

function Activeren({ uk, t, sluit }: { uk: boolean; t: TechStatus; sluit: () => void }) {
  const p = t.profiel;
  const max = p ? maxMinutenVoor(p.rollen, p.maxMinuten) : 60;
  const keuzes = (t.catalogus?.duren ?? [15, 30, 60]).filter((d) => d <= max);
  const [minuten, setMinuten] = useState(keuzes.includes(60) ? 60 : keuzes[keuzes.length - 1] ?? 15);
  const [reden, setReden] = useState(t.activatie?.reden ?? '');
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const verlengen = techActief(t);
  if (!p) {
    return (
      <Venster id='tech-activeren' titel={uk ? 'Технічний профіль' : 'Technisch profiel'} breedte={460} onSluit={sluit}>
        <div className='tech-venster'><p>{uk ? 'У вас немає технічного профілю. Його може дати власник сервера або адміністратор.' : 'U hebt geen technisch profiel. De eigenaar of een beheerder kan het geven.'}</p>
          <div className='tech-knoppen'><button type='button' onClick={sluit}>{uk ? 'Закрити' : 'Sluiten'}</button></div></div>
      </Venster>
    );
  }
  const doe = async () => {
    setBezig(true); setMelding('');
    try { await techActiveren(minuten, reden); sluit(); } catch (e) { setMelding(foutTekst(e, uk)); } finally { setBezig(false); }
  };
  return (
    <Venster id='tech-activeren' titel={verlengen ? (uk ? 'Подовжити технічний профіль' : 'Technisch profiel verlengen') : (uk ? 'Увімкнути технічний профіль' : 'Technisch profiel aanzetten')} breedte={520} onSluit={sluit}>
      <form className='tech-venster' data-tech-venster='activeren' onSubmit={(e) => { e.preventDefault(); if (!bezig) void doe(); }}>
        <p className='tech-lead'>{uk ? 'Лише в цій вкладці й лише на обраний час. Інші вкладки лишаються клієнтськими.' : 'Alleen in dit tabblad en alleen voor de gekozen tijd. Andere tabbladen blijven klantprofiel.'} <Vraag help={HELP_TECH.activeren} uk={uk} label={uk ? 'Увімкнути' : 'Aanzetten'} /></p>
        <div className='tech-rij'><span className='tech-label'>{uk ? 'Ваш профіль' : 'Uw profiel'}</span><code>{p.profielId}</code></div>
        <ul className='tech-rollen'>{p.rollen.map((r) => <li key={r}><b>{rolNaam(r, uk)}</b> <small>{(() => { const i = rolInfo(r); return i ? (uk ? i.kort[0] : i.kort[1]) : ''; })()}</small> {rolInfo(r) ? <Vraag help={rolInfo(r)!.help} uk={uk} label={rolNaam(r, uk)} /> : null}</li>)}</ul>
        <label className='tech-veld'><span>{uk ? 'Термін' : 'Duur'} <Vraag help={HELP_TECH.duur} uk={uk} label={uk ? 'Термін' : 'Duur'} /></span>
          <select value={minuten} onChange={(e) => setMinuten(Number(e.target.value))} data-tech-duur='1'>{keuzes.map((d) => <option key={d} value={d}>{d >= 60 ? `${d / 60} ${uk ? 'год' : 'u'}` : `${d} ${uk ? 'хв' : 'min'}`}</option>)}</select>
          <small>{uk ? `Найдовше для ваших ролей: ${max >= 60 ? `${max / 60} год` : `${max} хв`}` : `Maximaal voor uw rollen: ${max >= 60 ? `${max / 60} u` : `${max} min`}`}</small></label>
        <label className='tech-veld'><span>{uk ? 'Причина' : 'Reden'} <Vraag help={HELP_TECH.reden} uk={uk} label={uk ? 'Причина' : 'Reden'} /></span>
          <input value={reden} onChange={(e) => setReden(e.target.value)} maxLength={300} required minLength={3} placeholder={uk ? 'напр. запит №42: пошта не синхронізується' : 'bijv. melding #42: mail synchroniseert niet'} data-tech-reden='1' /></label>
        {melding ? <p className='tech-melding' role='alert'>{melding}</p> : null}
        <p className='tech-meta'>{uk ? 'Сайт попросить підтвердити вхід ще раз.' : 'De site vraagt de aanmelding nog eens te bevestigen.'}</p>
        <div className='tech-knoppen'>
          <button type='button' onClick={sluit}>{uk ? 'Скасувати' : 'Annuleren'}</button>
          <button type='submit' className='is-hoofd' disabled={bezig || reden.trim().length < 3} aria-busy={bezig || undefined} data-tech-knop='activeren'>{bezig ? (uk ? 'Зачекайте…' : 'Even geduld…') : verlengen ? (uk ? `Подовжити на ${minuten} хв` : `Verlengen met ${minuten} min`) : (uk ? `Увімкнути на ${minuten} хв` : `Aanzetten voor ${minuten} min`)}</button>
        </div>
      </form>
    </Venster>
  );
}

function BandKeuze({ uk, t, sluit }: { uk: boolean; t: TechStatus; sluit: () => void }) {
  const [kleur, setKleur] = useState<BandKleur>(t.profiel?.band.kleur ?? 'amber');
  const [patroon, setPatroon] = useState<BandPatroon>(t.profiel?.band.patroon ?? 'strepen');
  const [melding, setMelding] = useState('');
  const kleuren = t.catalogus?.kleuren;
  const patronen = t.catalogus?.patronen;
  if (!kleuren || !patronen || !t.profiel) return null;
  const k = kleuren[kleur];
  return (
    <Venster id='tech-band' titel={uk ? 'Колір смуги технічного режиму' : 'Kleur van de band'} breedte={520} onSluit={sluit}>
      <div className='tech-venster' data-tech-venster='band'>
        <p className='tech-lead'>{uk ? 'Оберіть, що вам приємно бачити. Напис «ТЕХНІЧНИЙ» лишається завжди.' : 'Kies wat u prettig vindt. De tekst «TECHNISCH» blijft altijd.'} <Vraag help={HELP_TECH.band} uk={uk} label={uk ? 'Колір смуги' : 'Kleur'} /></p>
        <div className='tech-kleuren' role='radiogroup' aria-label={uk ? 'Колір' : 'Kleur'}>
          {(Object.keys(kleuren) as BandKleur[]).map((id) => (
            <button key={id} type='button' role='radio' aria-checked={kleur === id} className='tech-kleur' onClick={() => setKleur(id)} data-tech-kleur={id}
              style={{ background: kleuren[id].bg, color: kleuren[id].fg }} title={`${uk ? kleuren[id].naam[0] : kleuren[id].naam[1]} · ${contrast(kleuren[id].bg, kleuren[id].fg).toFixed(1)}:1`}>
              {uk ? kleuren[id].naam[0] : kleuren[id].naam[1]}</button>
          ))}
        </div>
        <div className='tech-patronen' role='radiogroup' aria-label={uk ? 'Візерунок' : 'Patroon'}>
          {(Object.keys(patronen) as BandPatroon[]).map((id) => <button key={id} type='button' role='radio' aria-checked={patroon === id} onClick={() => setPatroon(id)} data-tech-patroon={id}>{uk ? patronen[id][0] : patronen[id][1]}</button>)}
        </div>
        <div className='tech-band-voorbeeld' data-patroon={patroon} style={{ ['--tech-band-bg' as string]: k.bg, ['--tech-band-fg' as string]: k.fg }}><ShieldCheck aria-hidden='true' />{uk ? 'ТЕХНІЧНИЙ · приклад' : 'TECHNISCH · voorbeeld'}</div>
        {melding ? <p className='tech-melding' role='alert'>{melding}</p> : null}
        <div className='tech-knoppen'>
          <button type='button' onClick={sluit}>{uk ? 'Скасувати' : 'Annuleren'}</button>
          <button type='button' className='is-hoofd' data-tech-knop='band-opslaan' onClick={() => { void techBand(kleur, patroon).then(sluit).catch((e) => setMelding(foutTekst(e, uk))); }}>{uk ? 'Зберегти' : 'Opslaan'}</button>
        </div>
      </div>
    </Venster>
  );
}

type Rij = { userId: string; profielId: string; rollen: TechRol[]; maxMinuten: number; email: string; naam: string; actiefTot: number | null; ingetrokkenOp: number | null; toegekendOp: number; notitie: string };
function Profielen({ uk, t, sluit }: { uk: boolean; t: TechStatus; sluit: () => void }) {
  const [lijst, setLijst] = useState<Rij[] | null>(null);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [email, setEmail] = useState('');
  const [rollen, setRollen] = useState<TechRol[]>(['ondersteuning']);
  const [max, setMax] = useState(60);
  const [notitie, setNotitie] = useState('');
  const [bezig, setBezig] = useState('');
  const [bevestig, setBevestig] = useState('');
  const eigen = useMemo(() => (t.activatie?.rollen.includes('eigenaar') ? ['ondersteuning', 'tester', 'ontwikkelaar', 'beheerder', 'auditor'] : (t.activatie?.rollen ?? []).filter((r) => r !== 'eigenaar')) as TechRol[], [t.activatie]);
  const laad = async () => { try { setLijst((await api.post('/api/owner/tech/profielen', techBody())).data?.profielen ?? []); } catch (e) { setMelding({ ok: false, tekst: foutTekst(e, uk) }); setLijst([]); } };
  useEffect(() => { void laad(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const geven = async () => {
    setBezig('geven'); setMelding(null);
    try {
      const r = await api.post('/api/owner/tech/toekennen', { ...techBody(), email, rollen, maxMinuten: max, notitie });
      setLijst(r.data?.profielen ?? lijst); setEmail(''); setNotitie('');
      setMelding({ ok: true, tekst: uk ? `Профіль видано: ${email}. Права з'являться лише після його активації.` : `Profiel gegeven: ${email}. Rechten pas na zijn activering.` });
    } catch (e) { setMelding({ ok: false, tekst: foutTekst(e, uk) }); } finally { setBezig(''); }
  };
  const nemen = async (r: Rij) => {
    setBezig(r.userId); setMelding(null); setBevestig('');
    try { const x = await api.post('/api/owner/tech/intrekken', { ...techBody(), userId: r.userId, reden: 'via de site' }); setLijst(x.data?.profielen ?? lijst); setMelding({ ok: true, tekst: uk ? `Профіль ${r.email} відкликано; активні вкладки втратили права.` : `Profiel van ${r.email} ingetrokken; actieve tabbladen verloren hun rechten.` }); }
    catch (e) { setMelding({ ok: false, tekst: foutTekst(e, uk) }); } finally { setBezig(''); }
  };
  return (
    <Venster id='tech-profielen' titel={uk ? 'Технічні профілі' : 'Technische profielen'} breedte={720} onSluit={sluit}>
      <div className='tech-venster' data-tech-venster='profielen'>
        <form className='tech-geven' onSubmit={(e) => { e.preventDefault(); if (!bezig) void geven(); }}>
          <h3>{uk ? 'Видати профіль' : 'Profiel geven'} <Vraag help={HELP_TECH.toekennen} uk={uk} label={uk ? 'Видати профіль' : 'Profiel geven'} /></h3>
          <label className='tech-veld'><span>{uk ? 'Пошта користувача' : 'E-mail van de gebruiker'}</span><input type='email' value={email} onChange={(e) => setEmail(e.target.value)} required data-tech-email='1' /></label>
          <fieldset className='tech-rolkeuze'><legend>{uk ? 'Ролі (лише ті, що маєте самі)' : 'Rollen (alleen die u zelf hebt)'}</legend>
            {eigen.map((r) => <label key={r}><input type='checkbox' checked={rollen.includes(r)} onChange={(e) => setRollen((o) => (e.target.checked ? [...o, r] : o.filter((x) => x !== r)))} data-tech-rol={r} />{rolNaam(r, uk)} <Vraag help={rolInfo(r)!.help} uk={uk} label={rolNaam(r, uk)} /></label>)}
          </fieldset>
          <label className='tech-veld'><span>{uk ? 'Найдовша активація' : 'Langste activering'}</span>
            <select value={max} onChange={(e) => setMax(Number(e.target.value))}>{[15, 30, 60, 120, 240, 480].map((d) => <option key={d} value={d}>{d >= 60 ? `${d / 60} ${uk ? 'год' : 'u'}` : `${d} ${uk ? 'хв' : 'min'}`}</option>)}</select>
            <small>{uk ? 'Найсильніша роль усе одно обмежує (адмін ≤ 1 год).' : 'De sterkste rol beperkt toch (beheerder ≤ 1 u).'}</small></label>
          <label className='tech-veld'><span>{uk ? 'Нотатка (навіщо)' : 'Notitie (waarom)'}</span><input value={notitie} onChange={(e) => setNotitie(e.target.value)} maxLength={300} /></label>
          <div className='tech-knoppen'><button type='submit' className='is-hoofd' disabled={!!bezig || !email || !rollen.length} aria-busy={bezig === 'geven' || undefined} data-tech-knop='geven'>{bezig === 'geven' ? (uk ? 'Зачекайте…' : 'Even geduld…') : (uk ? 'Видати' : 'Geven')}</button></div>
        </form>
        {melding ? <p className={`tech-melding${melding.ok ? ' is-ok' : ''}`} role={melding.ok ? 'status' : 'alert'}>{melding.tekst}</p> : null}
        <h3>{uk ? 'Видані профілі' : 'Gegeven profielen'}</h3>
        {lijst === null ? <p className='tech-meta'>{uk ? 'Завантаження…' : 'Laden…'}</p> : (
          <ul className='tech-lijst' data-tech-lijst='1'>{lijst.map((r) => (
            <li key={r.userId} className={r.ingetrokkenOp ? 'is-weg' : ''} data-tech-profiel={r.email}>
              <span className='tech-lijst-wie'><b>{r.naam || r.email}</b><small>{r.email} · <code>{r.profielId}</code></small></span>
              <span className='tech-lijst-rollen'>{r.rollen.map((x) => rolNaam(x, uk)).join(' · ')}</span>
              <span className='tech-lijst-stand'>{r.ingetrokkenOp ? (uk ? 'відкликано' : 'ingetrokken') : r.actiefTot ? (uk ? `активний до ${new Date(r.actiefTot).toLocaleTimeString()}` : `actief tot ${new Date(r.actiefTot).toLocaleTimeString()}`) : (uk ? 'неактивний' : 'inactief')}</span>
              {!r.ingetrokkenOp && !r.rollen.includes('eigenaar') && r.userId !== t.profiel?.userId ? (bevestig === r.userId
                ? <span className='tech-knoppen'><button type='button' className='is-gevaar' onClick={() => void nemen(r)} data-tech-knop={`intrekken-ja:${r.email}`}>{uk ? 'Так, відкликати' : 'Ja, intrekken'}</button><button type='button' onClick={() => setBevestig('')}>{uk ? 'Ні' : 'Nee'}</button></span>
                : <span className='tech-knoppen'><button type='button' className='is-gevaar' disabled={bezig === r.userId} onClick={() => setBevestig(r.userId)} data-tech-knop={`intrekken:${r.email}`}>{uk ? 'Відкликати' : 'Intrekken'}</button><Vraag help={HELP_TECH.intrekken} uk={uk} label={uk ? 'Відкликати' : 'Intrekken'} /></span>) : null}
            </li>
          ))}</ul>
        )}
        <div className='tech-knoppen'><button type='button' onClick={sluit}>{uk ? 'Закрити' : 'Sluiten'}</button></div>
      </div>
    </Venster>
  );
}

export { openTechVenster };
