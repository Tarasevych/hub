// Onboarding (audit 19.10.2026, punt 4): na goedkeuring zag een nieuwe gebruiker alleen «Доступ схвалено» en een lege hub (0 листів,
// 0 файлів). Deze kaart «Що далі» staat één keer op het hub-overzicht: drie concrete stappen (pošta → hmara/kalendar → ШІ, de laatste
// alleen als het account het recht «api-platform» heeft). Sluiten wordt op de server onthouden (ui-voorkeuren.welkomGesloten), dus op
// alle apparaten. Geen eigen opslag, geen polling.
import type { ReactElement } from 'react';
import { Bot, CalendarDays, Mail, X } from 'lucide-react';
import { canonicalNavigationUrl } from './canoniek-navigatie';
import './welkom-kaart.css';

type Service = 'mail' | 'cloud' | 'mcp';
type Props = { lang: 'uk' | 'nl'; ai: boolean; onOpen: (service: 'mail' | 'cloud', tab: string) => void; onClose: () => void };

export default function WelkomKaart({ lang, ai, onOpen, onClose }: Props) {
  const uk = lang === 'uk';
  const stappen: Array<{ id: Service; icoon: ReactElement; titel: string; tekst: string; knop: string; ga: () => void }> = [
    { id: 'mail', icoon: <Mail aria-hidden='true' />, titel: uk ? '1. Підключіть пошту' : '1. Koppel uw e-mail', tekst: uk ? 'Пошта → Акаунти: оберіть Gmail або Microsoft. Після цього листи, контакти й вкладення з’являться тут.' : 'E-mail → Accounts: kies Gmail of Microsoft. Daarna verschijnen berichten, contacten en bijlagen hier.', knop: uk ? 'Пошта → Акаунти' : 'E-mail → Accounts', ga: () => onOpen('mail', 'accounts') },
    { id: 'cloud', icoon: <CalendarDays aria-hidden='true' />, titel: uk ? '2. Хмара й календар' : '2. Cloud en agenda', tekst: uk ? 'Після пошти підключаються Диск, Календар і Фото того самого акаунта Google — файли й події стануть видимі на цій сторінці.' : 'Na de e-mail koppelt u Drive, Agenda en Foto’s van hetzelfde Google-account — bestanden en afspraken worden hier zichtbaar.', knop: uk ? 'Хмарне сховище' : 'Cloudopslag', ga: () => onOpen('cloud', 'overview') },
  ];
  if (ai) stappen.push({ id: 'mcp', icoon: <Bot aria-hidden='true' />, titel: uk ? '3. Підключіть ШІ' : '3. Koppel een AI', tekst: uk ? 'Claude, ChatGPT чи Grok можуть працювати з вашими даними через міст ШІ → сайт — лише з вашого дозволу й на обраний час.' : 'Claude, ChatGPT of Grok kunnen via de brug AI → site met uw gegevens werken — alleen met uw toestemming en voor de gekozen tijd.', knop: uk ? 'Підключення ШІ' : 'AI-koppelingen', ga: () => { location.assign(`${canonicalNavigationUrl('mcp', 'agents', lang).replace(/#.*$/, '')}#overzicht`); } });
  return (
    <section className='welkom-kaart' data-hub-welkom={ai ? 'met-ai' : 'zonder-ai'} aria-labelledby='welkom-kaart-titel'>
      <header>
        <div>
          <h2 id='welkom-kaart-titel'>{uk ? 'Що далі' : 'Wat nu'}</h2>
          <p>{uk ? 'Ваш простір готовий, але ще порожній. Три кроки, щоб він наповнився вашими даними.' : 'Uw ruimte is klaar, maar nog leeg. Drie stappen om ze met uw gegevens te vullen.'}</p>
        </div>
        <button type='button' className='icon-button' onClick={onClose} title={uk ? 'Закрити й більше не показувати' : 'Sluiten en niet meer tonen'} data-hub-welkom-sluiten='1'><X aria-hidden='true' /></button>
      </header>
      <ol>
        {stappen.map((s) => (
          <li key={s.id} data-welkom-stap={s.id}>
            <span className='welkom-icoon'>{s.icoon}</span>
            <div><strong>{s.titel}</strong><p>{s.tekst}</p></div>
            <button type='button' className='secondary' onClick={s.ga}>{s.knop}</button>
          </li>
        ))}
      </ol>
    </section>
  );
}
