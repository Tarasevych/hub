// Налаштування → Акаунт → «Стан моїх служб»: de gebruiker controleert ALLEEN het eigen account (pošta, kalender, Drive, GitHub,
// ШІ-підключення, пристрої, налаштування). Geen serverkolom, geen andere gebruikers: de route negeert elk gebruikerId.
// Bij een probleem staat er per dienst wat er mis is en wat te doen. Alleen standen en korte codes; nooit inhoud of tokens.
import { useCallback, useEffect, useState } from 'react';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import DienstenTabel, { rijenUit, tijdKort, type Lang } from './DienstenTabel';
import type { TabelRij } from '../../shared/diagnostiek-account';

const FOUT: Record<string, [string, string]> = {
  RATE_LIMITED: ['Забагато перевірок — спробуйте за кілька хвилин.', 'Te veel controles — probeer over een paar minuten opnieuw.'],
  ACCOUNT_NOT_APPROVED: ['Обліковий запис ще не схвалено.', 'Het account is nog niet goedgekeurd.'],
};

export default function MijnDiensten({ lang }: { lang: Lang }) {
  const [rijen, setRijen] = useState<TabelRij[]>([]);
  const [laatst, setLaatst] = useState(0);
  const [bezig, setBezig] = useState<'' | 'laden' | 'controle'>('laden');
  const [fout, setFout] = useState('');
  const uk = lang === 'uk';
  const haal = useCallback(async (uitvoeren: boolean) => {
    setBezig(uitvoeren ? 'controle' : 'laden'); setFout('');
    try {
      const r = await api.post('/api/owner/diagnostiek/mijn-diensten', { service: 'identity', tabContext: ecosystemTabContext(), sourceOrigin: location.origin, uitvoeren });
      const lijst = rijenUit((r.data as Record<string, unknown>)?.rijen);
      setRijen(lijst);
      setLaatst(Math.max(0, ...lijst.map((x) => x.account?.op || 0)));
    } catch (e) {
      const c = String((e as Error)?.message || '');
      const f = FOUT[c];
      setFout(f ? (uk ? f[0] : f[1]) : (uk ? 'Не вдалося отримати стан служб.' : 'De stand van de diensten kon niet worden opgehaald.'));
    } finally { setBezig(''); }
  }, [uk]);
  useEffect(() => { void haal(false); }, [haal]);
  const nooit = !rijen.some((r) => r.account);
  return (
    <section className='mdt-sectie' data-mijn-diensten='1' aria-busy={bezig !== ''}>
      <header>
        <h3><Activity aria-hidden='true' />{uk ? 'Стан моїх служб' : 'Stand van mijn diensten'}</h3>
        <button type='button' onClick={() => void haal(true)} disabled={bezig !== ''} data-mijn-diensten-knop='1'>
          {bezig === 'controle' ? <Loader2 className='mdt-draai' aria-hidden='true' /> : <RefreshCw aria-hidden='true' />}{uk ? 'Перевірити зараз' : 'Nu controleren'}
        </button>
      </header>
      <p className='mdt-uitleg'>{uk
        ? 'Перевіряємо лише ваш акаунт: чи підключені пошта, календар і Drive, чи дійсний доступ Google, GitHub, підключення ШІ та пристрої. Вміст листів і файлів не читається.'
        : 'We controleren alleen uw account: of mail, agenda en Drive gekoppeld zijn, of de Google-toegang geldt, GitHub, AI-koppelingen en apparaten. De inhoud van mails en bestanden wordt niet gelezen.'}</p>
      {fout && <p className='mdt-fout' role='alert'>{fout}</p>}
      {bezig === 'laden' && !rijen.length ? <p className='mdt-uitleg'><Loader2 className='mdt-draai' aria-hidden='true' /> {uk ? 'Завантаження…' : 'Laden…'}</p> : <DienstenTabel lang={lang} rijen={rijen} metServer={false} />}
      <small className='mdt-voet'>{nooit ? (uk ? 'Ще не перевірялося — натисніть «Перевірити зараз».' : 'Nog niet gecontroleerd — klik op «Nu controleren».') : `${uk ? 'Остання перевірка' : 'Laatste controle'}: ${tijdKort(lang, laatst)}`}</small>
    </section>
  );
}
