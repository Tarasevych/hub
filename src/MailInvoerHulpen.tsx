// Інструменти введення (UA/NL, трансліт, клавіатура, рукопис) за кнопкою «Введення» — і в окремому вікні листа, і у відповіді під листом
// (1.1/1.5): за замовчуванням згорнуті, щоб не забирати місце в тексту; вибір запам’ятовується (той самий ключ, що й у вікні листа).
import { useState } from 'react';
import { Keyboard } from 'lucide-react';
import MailInputTools from './MailInputTools';

type Props = { lang: 'uk' | 'nl'; context: Record<string, string>; onInsert: (v: string) => void; onBackspace: () => void };
const lees = () => { try { return localStorage.getItem('mail-nm-hulpen') === '1'; } catch { return false; } };

export default function MailInvoerHulpen({ lang, context, onInsert, onBackspace }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [open, setOpen] = useState(lees);
  const zet = (v: boolean) => { setOpen(v); try { localStorage.setItem('mail-nm-hulpen', v ? '1' : '0'); } catch { /* geen opslag */ } };
  return <div className='mail-invoer-hulpen' data-invoer-hulpen={open ? 'open' : 'dicht'}>
    <button type='button' className='mail-nm-hulpen' aria-expanded={open} onClick={() => zet(!open)} title={t('Інструменти введення: UA/NL, трансліт, клавіатура, рукопис', 'Invoerhulpen: UA/NL, translit, toetsenbord, handschrift')}><Keyboard aria-hidden='true' /><span>{t('Введення', 'Invoer')}</span></button>
    {open && <MailInputTools lang={lang} context={context} onInsert={onInsert} onBackspace={onBackspace} />}
  </div>;
}
