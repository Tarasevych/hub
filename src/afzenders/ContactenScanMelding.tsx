// MAILSCAN-002 · Лише згода власника; перебіг у переліку сповіщень, коротка звістка за бажанням.
// Вікно ніколи не перекриває пошту і не залишається на екрані після двох секунд.
import { BookUser } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import { contactenApi, zetScanStand, useScanStand, type ScanStand } from './api';
import { eenmaligAuto } from './scan-weergave';
import './contacten.css';

type Lang = 'uk' | 'nl';
const t = (lang: Lang, uk: string, nl: string) => lang === 'uk' ? uk : nl;
const zichtbareIds = (s: ScanStand | null) => (s?.gekoppeld || [])
  .filter((a) => a.voorkeur.aan && a.voorkeur.werkwijze !== 'handmatig'
    && navigator.onLine && (a.voorkeur.voorwaarde === 'verbonden' || document.visibilityState === 'visible'))
  .map((a) => a.accountId);

export default function ContactenScanMelding({ lang }: { lang: Lang; actief: boolean }) {
  const s = useScanStand();
  const vorige = useRef<ScanStand | null>(null);
  const timer = useRef(0);
  const [kort, zetKort] = useState('');

  useEffect(() => {
    // De status mag worden gelezen zonder toestemming; het starten gebeurt uitsluitend na opgeslagen toestemming.
    void contactenApi.scanStatus().then(zetScanStand).catch(() => undefined);
  }, []);

  useEffect(() => {
    const probeer = () => {
      const ids = zichtbareIds(s);
      if (ids.length) eenmaligAuto(() => contactenApi.scanAuto(ids).then(zetScanStand), Date.now(), ids.slice().sort().join('|'));
    };
    probeer();
    const id = window.setInterval(probeer, 60_000);
    window.addEventListener('online', probeer);
    document.addEventListener('visibilitychange', probeer);
    return () => { window.clearInterval(id); window.removeEventListener('online', probeer); document.removeEventListener('visibilitychange', probeer); };
  }, [s?.gekoppeld]);

  useEffect(() => {
    if (!s) return;
    const oud = vorige.current;
    vorige.current = s;
    if (!oud) return;
    const start = !oud.loopt && s.loopt;
    const fout = oud.staat !== 'fout' && s.staat === 'fout';
    const klaar = oud.loopt && !s.loopt && s.staat === 'klaar';
    if (!start && !fout && !klaar) return;
    const betrokken = (s.gekoppeld || []).filter((a) => a.voorkeur.aan && s.accounts.some((x) => x.accountId === a.accountId));
    if (!betrokken.length) return;
    const tekst = start ? t(lang, 'Перевірка адрес розпочалася у фоновому режимі.', 'De adrescontrole is op de achtergrond begonnen.')
      : fout ? t(lang, 'Перевірку адрес перервано. Подробиці — у сповіщеннях.', 'De adrescontrole is onderbroken. Details staan bij de meldingen.')
        : t(lang, 'Перевірку адрес завершено.', 'De adrescontrole is voltooid.');
    emitCanonicalNotice({ text: tekst, kind: fout ? 'warning' : klaar ? 'success' : 'info', source: 'mail-contacten-scan',
      retain: true, alleenPaneel: true, context: betrokken.map((a) => a.email).join(', ').slice(0, 180),
      action: { label: t(lang, 'Переглянути', 'Bekijken'), onAction: async () => {
        const { openContacten } = await import('./api');
        await openContacten('', lang);
      } },
    });
    const tonen = betrokken.some((a) => a.voorkeur.melding === (start ? 'begin' : 'fout')) && !klaar;
    if (tonen) {
      window.clearTimeout(timer.current);
      zetKort(tekst);
      timer.current = window.setTimeout(() => zetKort(''), 2000);
    }
  }, [s?.loopt, s?.staat, s?.bijgewerktOp, lang]);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!kort) return null;
  return <div className='ctv-scan-korte-melding' role='status' aria-live='polite'>
    <BookUser aria-hidden='true' size={17} /> <span>{kort}</span>
  </div>;
}
