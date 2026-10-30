// Живий стан одного рішення власника (спільний для майстра відкату і для зовнішніх хостів): бейдж стану, текст root-а
// (uk/nl), подробиці й підказка, що робити далі. Нічого не запитує сам — отримує дані від besluit-client.
import { CheckCircle2, Clock, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import type { BesluitUit } from '../../shared/eigenaar-besluit';
import { BESLUIT_STAAT_TEKST, besluitCodeTekst } from '../../shared/eigenaar-besluit';

type Tr = (uk: string, nl: string) => string;
export type LeefStand = { besluit: BesluitUit | null; pauze?: string; wachtSinds?: number };

export default function BesluitStand({ tr, stand }: { tr: Tr; stand: LeefStand }) {
  const lang = tr('uk', 'nl') as 'uk' | 'nl';
  const b = stand.besluit;
  if (!b) return null;
  const Icoon = b.staat === 'klaar' ? CheckCircle2 : b.staat === 'ondertekend' || b.staat === 'ontwerp' ? Loader2 : b.staat === 'verlopen' ? Clock : b.staat === 'mislukt' ? ShieldAlert : XCircle;
  const rootTekst = lang === 'uk' ? b.uitkomst?.uk : b.uitkomst?.nl;
  const uitleg = rootTekst || (b.code ? besluitCodeTekst(lang, b.code) : '');
  return <div className='bsl-stand' data-besluit-stand={b.staat} data-besluit-code={b.code || undefined} role='status' aria-live='polite'>
    <p className='bsl-stand-kop'><Icoon size={18} className={b.staat === 'ondertekend' ? 'bsl-spin' : undefined} aria-hidden='true' /><b>{tr(BESLUIT_STAAT_TEKST[b.staat][0], BESLUIT_STAAT_TEKST[b.staat][1])}</b></p>
    {b.staat === 'ondertekend' && <p className='bsl-stand-tekst'>{stand.pauze
      ? tr('Сайт перезапускається або тимчасово не відповідає — це очікувано під час відкату. Чекаю далі…', 'De site herstart of antwoordt tijdelijk niet — dat hoort bij terugdraaien. Ik wacht verder…')
      : tr('Root перевіряє підпис passkey своїми ключами і лише після цього виконує рішення. Можна не закривати цю сторінку.', 'Root controleert de passkey-handtekening met zijn eigen sleutels en voert het besluit pas daarna uit. U hoeft deze pagina niet te sluiten.')}</p>}
    {uitleg && b.staat !== 'ondertekend' && <p className='bsl-stand-tekst'>{uitleg}</p>}
    {b.code && b.staat !== 'klaar' && b.staat !== 'ondertekend' && <p className='bsl-stand-code'><code>{b.code}</code>{b.passkey ? <> · passkey <code>{b.passkey}</code></> : null}</p>}
    {b.uitkomst?.detail && <details className='bsl-stand-detail'><summary>{tr('Подробиці від root', 'Details van root')}</summary><pre>{b.uitkomst.detail}</pre></details>}
    {b.staat === 'verlopen' && b.code === 'GEEN_UITKOMST' && <p className='bsl-stand-hint'>{tr('Перевірте на сервері: systemctl status mijn-ruimte-besluit.path і journalctl -u mijn-ruimte-besluit -n 50.', 'Controleer op de server: systemctl status mijn-ruimte-besluit.path en journalctl -u mijn-ruimte-besluit -n 50.')}</p>}
  </div>;
}
