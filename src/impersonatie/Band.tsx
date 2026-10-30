// Rode band van de BEHEERDER tijdens «Подивитися як користувач»: «Ви переглядаєте як <ім'я> · залишилось mm:ss · Завершити».
// Rood is voorbehouden aan «увійти як / від імені»: de technische band kan die kleur niet kiezen. Met recht op acties: gestreept.
// Eigen root (zoals de technische laag), zodat de dienst eronder niets hoeft te weten.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Eye, Hand, X } from 'lucide-react';
import { ecosystemTabContext } from '../tab-context';
import { routeLang } from '../canoniek-navigatie';
import { resterend } from '../../shared/impersonatie';
import { dienstVanHost, echteFetch, impersonatieEinde, impersonatieUrl, stopImpersonatieModus, type ImpStaat } from './modus';
import './impersonatie.css';

type BandData = { id: string; status: string; eind: number | null; metActies: boolean; doel?: string; doelNaam?: string; reden: string };
const DIENSTEN: Array<[string, string, string]> = [['hub', 'Огляд', 'Overzicht'], ['mail', 'Пошта', 'Mail'], ['cloud', 'Файли', 'Bestanden'], ['ai', 'ШІ', 'AI'], ['github', 'GitHub', 'GitHub'], ['huis', 'Дім', 'Huis']];
const EIND_TEKST: Record<string, [string, string]> = {
  IMPERSONATIE_BEEINDIGD: ['Перегляд завершено: час вийшов, користувач завершив доступ або ви вийшли з технічного профілю.', 'Bekijken beëindigd: tijd om, de gebruiker beëindigde de toegang of u verliet het technisch profiel.'],
  ANDER_TABBLAD: ['Перегляд можливий лише у вкладці, з якої надіслано запит.', 'Alleen in het tabblad van de aanvraag.'],
  TECH_IMPERSONATIE_VEREIST: ['Технічний профіль у цій вкладці вже не активний — перегляд завершено.', 'Het technisch profiel is in dit tabblad niet meer actief — bekijken beëindigd.'],
  IMPERSONATIE_NIET_GEVONDEN: ['Цей перегляд не знайдено.', 'Deze sessie bestaat niet.'],
};

async function post(pad: string, data: Record<string, unknown>) {
  const r = await echteFetch()(pad, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ service: dienstVanHost(location.hostname), tabContext: ecosystemTabContext(), ...data }) });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(String(d?.error || `HTTP_${r.status}`));
  return d;
}

export function ImpersonatieBand({ staat, lang }: { staat: ImpStaat; lang?: 'uk' | 'nl' }) {
  const uk = (lang || routeLang()) !== 'nl';
  const [d, setD] = useState<BandData | null>(null);
  const [einde, setEinde] = useState(() => impersonatieEinde());
  const [, setTik] = useState(0);
  useEffect(() => {
    let weg = false;
    const laad = () => post('/api/impersonatie/band', { id: staat.id }).then((x) => { if (!weg) setD(x as BandData); }, (e) => { if (!weg) setEinde(String((e as Error).message)); });
    void laad();
    const i = window.setInterval(() => void laad(), 20_000);
    const t = window.setInterval(() => setTik((x) => x + 1), 1000);
    const op = (e: Event) => setEinde(String((e as CustomEvent).detail || 'IMPERSONATIE_BEEINDIGD'));
    window.addEventListener('mr-impersonatie-einde', op);
    return () => { weg = true; window.clearInterval(i); window.clearInterval(t); window.removeEventListener('mr-impersonatie-einde', op); };
  }, [staat.id]);
  useEffect(() => { if (d?.eind && d.eind <= Date.now() && !einde) setEinde('IMPERSONATIE_BEEINDIGD'); });
  const naam = d ? (d.doelNaam || d.doel || '') : '…';
  const beeindig = async () => { try { await post('/api/impersonatie/beeindigen', { id: staat.id }); } catch { /* al beëindigd */ } stopImpersonatieModus(); };
  const huidig = dienstVanHost(location.hostname);
  return (
    <>
      <div className={`imp-band${d?.metActies ? ' is-acties' : ''}`} role='region' aria-label={uk ? `Ви переглядаєте як ${naam}, ${d?.metActies ? 'з правом дій' : 'лише перегляд'}` : `U bekijkt als ${naam}, ${d?.metActies ? 'met acties' : 'alleen bekijken'}`} title={d?.reden} data-imp-band='1' data-imp-acties={d?.metActies ? '1' : '0'}>
        {d?.metActies ? <Hand aria-hidden='true' /> : <Eye aria-hidden='true' />}
        <span className='imp-band-tekst'>
          <b>{uk ? 'Ви переглядаєте як' : 'U bekijkt als'} <span data-imp-naam='1'>{naam}</span></b>
          <span className='imp-band-sep' aria-hidden='true'>·</span>
          <span className='imp-band-tijd' data-imp-tijd='1'>{uk ? 'залишилось' : 'nog'} {d?.eind ? resterend(d.eind) : '--:--'}</span>
          <span className='imp-band-sep is-modus' aria-hidden='true'>·</span>
          <span className='imp-band-modus'>{d?.metActies ? (uk ? 'з правом дій' : 'met acties') : (uk ? 'лише перегляд' : 'alleen bekijken')}</span>
        </span>
        <nav className='imp-band-diensten' aria-label={uk ? 'Сервіси користувача' : 'Diensten van de gebruiker'}>
          {DIENSTEN.map(([s, u, n]) => <a key={s} href={impersonatieUrl(staat.id, s)} aria-current={s === huidig ? 'page' : undefined} data-imp-dienst={s}>{uk ? u : n}</a>)}
        </nav>
        <button type='button' onClick={() => void beeindig()} data-imp-knop='beeindigen'><X aria-hidden='true' />{uk ? 'Завершити' : 'Beëindigen'}</button>
      </div>
      {einde ? (
        <div className='imp-einde' role='alertdialog' aria-modal='true' aria-labelledby='imp-einde-titel' data-imp-einde={einde}>
          <div className='imp-einde-kaart'>
            <h2 id='imp-einde-titel'>{uk ? 'Перегляд завершено' : 'Bekijken beëindigd'}</h2>
            <p>{(EIND_TEKST[einde] || EIND_TEKST.IMPERSONATIE_BEEINDIGD)[uk ? 0 : 1]}</p>
            <p className='imp-meta'>{uk ? 'Журнал ваших дій користувач бачить у «Хто має доступ».' : 'De gebruiker ziet het journaal van uw acties in «Wie heeft toegang».'}</p>
            <button type='button' className='is-hoofd' autoFocus onClick={() => stopImpersonatieModus()} data-imp-knop='terug'>{uk ? 'Повернутися до свого акаунта' : 'Terug naar mijn account'}</button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function monteer(staat: ImpStaat) {
  if (document.getElementById('impersonatie-band')) return;
  const el = document.createElement('div'); el.id = 'impersonatie-band'; document.body.prepend(el);
  createRoot(el).render(<ImpersonatieBand staat={staat} />);
}
