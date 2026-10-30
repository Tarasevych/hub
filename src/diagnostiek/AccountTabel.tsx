// Діагностика → «Для всіх / цей акаунт»: per dienst de serverkant («Сервер (для всіх)», geplande ronde elke 15 min) naast een
// synthetische controle van één account («Цей акаунт», op verzoek). Standaard het eigen account; vanuit «Скарга користувача» het
// gekozen account. Alleen standen en korte codes — nooit inhoud, tokens of IP's (backend/diagnostiek-account.ts).
import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, Play } from 'lucide-react';
import { api } from '../platform/client';
import DienstenTabel, { rijenUit, tijdKort } from '../instellingen/DienstenTabel';
import { DIENST_NAAM, isAccountDienst, type TabelRij } from '../../shared/diagnostiek-account';
import { foutTekst, type Lang } from './hulp';

type Hist = { nr: number; dienst: string; stand: string; code: string; op: number; door: string };
const DOOR: Record<string, [string, string]> = { zelf: ['сам користувач', 'de gebruiker zelf'], beheer: ['адміністратор', 'beheerder'], systeem: ['за розкладом', 'gepland'] };

export default function AccountTabel({ lang, ctx, gebruikerId }: { lang: Lang; ctx: Record<string, unknown>; gebruikerId?: string }) {
  const uk = lang === 'uk';
  const [rijen, setRijen] = useState<TabelRij[]>([]);
  const [hist, setHist] = useState<Hist[]>([]);
  const [wie, setWie] = useState<{ naam: string; email: string; zelf: boolean } | null>(null);
  const [bezig, setBezig] = useState<'' | 'laden' | 'controle'>('laden');
  const [fout, setFout] = useState('');
  const haal = useCallback(async (uitvoeren: boolean) => {
    setBezig(uitvoeren ? 'controle' : 'laden'); setFout('');
    try {
      const r = await api.post('/api/owner/admin/diagnostiek/account', { ...ctx, ...(gebruikerId ? { gebruikerId } : {}), uitvoeren });
      const d = (r.data || {}) as Record<string, unknown>;
      setRijen(rijenUit(d.rijen));
      const g = (d.gebruiker || {}) as Record<string, unknown>;
      setWie({ naam: String(g.naam || '').slice(0, 80), email: String(g.email || '').slice(0, 160), zelf: d.zelf === true });
      setHist((Array.isArray(d.historie) ? d.historie : []).map((h) => h as Hist).filter((h) => isAccountDienst(h.dienst)).slice(0, 40));
    } catch (e) { setFout(foutTekst(lang, e)); } finally { setBezig(''); }
  }, [ctx, gebruikerId, lang]);
  useEffect(() => { void haal(false); }, [haal]);
  const slecht = hist.filter((h) => h.stand !== 'ok');
  return (
    <section className='mdt-sectie' data-adg-account={gebruikerId || 'zelf'} aria-busy={bezig !== ''}>
      <header>
        <h3>{uk ? 'Сервер (для всіх) чи лише цей акаунт' : 'Server (voor iedereen) of alleen dit account'}{wie ? ` — ${wie.zelf ? (uk ? 'ваш акаунт' : 'uw account') : wie.naam}` : ''}</h3>
        <button type='button' onClick={() => void haal(true)} disabled={bezig !== ''} data-adg-account-knop='1'>
          {bezig === 'controle' ? <Loader2 className='mdt-draai' aria-hidden='true' /> : <Play aria-hidden='true' />}{uk ? 'Перевірити акаунт' : 'Account controleren'}
        </button>
      </header>
      <p className='mdt-uitleg'>{uk
        ? 'Ліва колонка — серверна перевірка (для всіх, за розкладом кожні 15 хв). Права — перевірка саме цього акаунта (підключення, дійсність доступу Google, пристрої), лише на запит. Вміст листів і файлів не читається.'
        : 'Links de servercontrole (voor iedereen, gepland elke 15 min). Rechts de controle van dit account (koppelingen, geldige Google-toegang, apparaten), alleen op verzoek. De inhoud van mails en bestanden wordt niet gelezen.'}</p>
      {fout && <p className='mdt-fout' role='alert'>{fout}</p>}
      {bezig === 'laden' && !rijen.length ? <p className='mdt-uitleg'><Loader2 className='mdt-draai' aria-hidden='true' /> {uk ? 'Завантаження…' : 'Laden…'}</p> : <DienstenTabel lang={lang} rijen={rijen} metServer />}
      {slecht.length > 0 && <details className='mdt-hist'>
        <summary><History aria-hidden='true' /> {uk ? `Історія проблем акаунта (${slecht.length})` : `Geschiedenis van accountproblemen (${slecht.length})`}</summary>
        <ul>{slecht.slice(0, 20).map((h) => <li key={h.nr}><span>{tijdKort(lang, h.op)}</span> <b>{isAccountDienst(h.dienst) ? DIENST_NAAM[h.dienst][uk ? 0 : 1] : h.dienst}</b> · {h.stand}{h.code ? ` · ${h.code}` : ''} <small>({(DOOR[h.door] || DOOR.beheer)[uk ? 0 : 1]})</small></li>)}</ul>
      </details>}
    </section>
  );
}
