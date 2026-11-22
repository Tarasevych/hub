// НЕ ПЕРЕВІРЕНО (очікує перевірки наступним агентом): тести, перевірку типів і складання не проганяли
// за прямою вказівкою власника (режим економії ліміту, 22.11.2026).
// Спільний перегляд вкладень, етап 4 (розділ 7 концепції): картка вкладення в сповіщенні.
// Виконавець: Claude Opus 5.5 (High) через Google Antigravity (antigravity), продовження роботи Grok (grok).
// Прапорець `bijlage-weergave-gedeeld-v1`, типово вимкнений: картку показує лише MeldingVeegKaart за ввімкненого прапорця,
// інакше лишаються старі «пігулки» вкладень.
//
// Правила:
//   • мінімалізм для розсіяної людини: мініатюра або значок виду, назва, одне головне число й одна дія «Відкрити»;
//   • мініатюра лише з того, що сповіщення вже принесло (вміст base64 або адреса цього ж сайту чи blob:), жодних сторонніх адрес;
//   • головне з рахунку (сума, строк) — лише з текстового уривка, який уже є в сповіщенні; нічого не завантажуємо заради цього;
//   • колір лише для терміновості строку (ті самі змінні, що й у швидкій картці переглядача).
import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Eye, FileText, Wallet } from 'lucide-react';
import { kies, soortVan, grootteTekst, type Taal } from './soort';
import { rekeningVelden } from './rekening-velden';
import { snelkaartRijen, termijnHint } from './snelkaart';
import './weergave.css';

export type MeldingKaartBijlage = {
  naam: string;
  mime: string;
  grootteBytes: number;
  url?: string;
  inhoudBase64?: string;
  tekstVoorbeeld?: string;
};

/** Найбільший вміст base64, з якого ще робимо мініатюру прямо в картці (щоб не гальмувати список сповіщень). */
export const MINI_MAX_BASE64 = 3 * 1024 * 1024;

export function veiligeMiniAdres(url?: string): string {
  if (!url) return '';
  if (url.startsWith('blob:')) return url;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    if (typeof window !== 'undefined' && new URL(url).origin === window.location.origin) return url;
  } catch { /* недійсна адреса — без мініатюри */ }
  return '';
}

/** Мініатюра фото: спершу з уже принесеного вмісту, інакше з адреси цього ж сайту. Інакше — значок виду файла. */
function useMini(b: MeldingKaartBijlage, isFoto: boolean): string {
  const [adres, setAdres] = useState('');
  useEffect(() => {
    setAdres('');
    if (!isFoto) return;
    if (b.inhoudBase64 && b.inhoudBase64.length <= MINI_MAX_BASE64 && !/svg/i.test(b.mime)) {
      let url = '';
      try {
        const schoon = b.inhoudBase64.includes(',') ? b.inhoudBase64.slice(b.inhoudBase64.indexOf(',') + 1) : b.inhoudBase64;
        const bin = atob(schoon);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        url = URL.createObjectURL(new Blob([bytes], { type: b.mime || 'image/*' }));
        setAdres(url);
      } catch { /* не розкодували — значок */ }
      return () => { if (url) URL.revokeObjectURL(url); };
    }
    // SVG із чужого джерела не показуємо як мініатюру: програвач сповіщень спершу очищає його
    if (!/svg/i.test(b.mime)) setAdres(veiligeMiniAdres(b.url));
    return undefined;
  }, [b.inhoudBase64, b.url, b.mime, isFoto]);
  return adres;
}

export function MeldingKaart(p: { taal: Taal; bijlage: MeldingKaartBijlage; actief?: boolean; onOpen: () => void }) {
  const t = (uk: string, nl: string) => kies(p.taal, [uk, nl]);
  const soort = soortVan(p.bijlage.naam, p.bijlage.mime);
  const isFoto = soort.sleutel === 'foto';
  const mini = useMini(p.bijlage, isFoto);
  const [miniFout, setMiniFout] = useState(false);
  useEffect(() => setMiniFout(false), [mini]);

  // Головне з рахунку — лише з уже принесеного уривка тексту
  const hoofd = useMemo(() => {
    if (soort.sleutel !== 'rekening' || !p.bijlage.tekstVoorbeeld) return null;
    const velden = rekeningVelden(p.bijlage.tekstVoorbeeld.slice(0, 20000));
    const rijen = snelkaartRijen(velden);
    const bedrag = rijen.find((r) => r.sleutel === 'bedrag');
    const termijn = rijen.find((r) => r.sleutel === 'termijn');
    const hint = velden.termijn ? termijnHint(velden.termijn.iso, p.taal) : null;
    if (!bedrag && !termijn) return null;
    return { bedrag, termijn, hint };
  }, [soort.sleutel, p.bijlage.tekstVoorbeeld, p.taal]);

  return (
    <div className='weergave-melding-kaart' data-weergave-drager='melding' data-soort={soort.sleutel} data-actief={p.actief ? 'ja' : undefined}
      data-staat={hoofd?.hint?.dringend /* свій вигляд для кожного стану строку (вказівка Павла 22.11.2026) — НЕ ПЕРЕВІРЕНО */}>
      <button type='button' className='weergave-melding-kaart-mini' onClick={(e) => { e.stopPropagation(); p.onOpen(); }}
        aria-label={t(`Відкрити «${p.bijlage.naam}»`, `«${p.bijlage.naam}» openen`)}>
        {mini && !miniFout
          ? <img src={mini} alt='' aria-hidden='true' draggable={false} onError={() => setMiniFout(true)} />
          : <span className='weergave-melding-kaart-soort'><FileText aria-hidden='true' /><b>{kies(p.taal, soort.kort)}</b></span>}
      </button>
      <div className='weergave-melding-kaart-tekst'>
        <strong title={p.bijlage.naam}>{p.bijlage.naam}</strong>
        <small>{kies(p.taal, soort.naam)} · {grootteTekst(Number(p.bijlage.grootteBytes || 0), p.taal)}</small>
        {hoofd && (
          <span className='weergave-melding-kaart-hoofd'>
            {hoofd.bedrag && <span><Wallet aria-hidden='true' /><b>{kies(p.taal, hoofd.bedrag.waarde)}</b></span>}
            {hoofd.termijn && (
              <span data-dringend={hoofd.hint?.dringend}>
                <CalendarClock aria-hidden='true' /><b>{kies(p.taal, hoofd.termijn.waarde)}</b>{hoofd.hint ? <small>{hoofd.hint.tekst}</small> : null}
              </span>
            )}
          </span>
        )}
      </div>
      <button type='button' className='weergave-melding-kaart-open' onClick={(e) => { e.stopPropagation(); p.onOpen(); }}>
        <Eye aria-hidden='true' /><span>{t('Відкрити', 'Openen')}</span>
      </button>
    </div>
  );
}
