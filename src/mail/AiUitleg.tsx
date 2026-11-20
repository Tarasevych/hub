// MAILAI-001 (15.11.2026), MAILAI-002 (16.11.2026): «Як працює ШІ в пошті» — чесне пояснення за фактичним станом коду, однаково
// в панелі «Рушії ШІ» і у «Вигляд → ШІ-аналіз над листом». Павло: «хто обробляє … локально, через постачальника чи через наш сервер;
// конфіденційність; чому конектор не може працювати у дві сторони».
// Uitleg over de AI in de post zoals de code nu werkt: (1) lokaal in Chrome via de extensie — niets verlaat het apparaat; (2) uw server
// roept een aanbieder aan met de EIGEN sleutel uit de Sleutelkluis (backend/ai-vertaling-routes.ts → sleutelEnAanbieder). Een MCP-connector
// werkt maar één kant op (de AI vraagt de site, niet omgekeerd); dat staat er eerlijk bij.
import { ExternalLink, KeyRound, ShieldCheck } from 'lucide-react';
import { AI_TOEGANG_HREF } from '../../shared/ai-vertaling';
import { aiHrefOplossen } from './ai-staat';
import './ai-uitleg.css';

export default function AiUitleg({ nl, compact = false }: { nl: boolean; compact?: boolean }) {
  const t = (uk: string, nlTekst: string) => (nl ? nlTekst : uk);
  return (
    <div className={`ai-uitleg${compact ? ' is-compact' : ''}`} data-testid="ai-uitleg">
      <strong className="ai-uitleg-kop">{t('Як працює ШІ в пошті', 'Hoe de AI in de post werkt')}</strong>
      <p>{t('Без вашого натискання текст листа нікуди не йде. Є два робочі способи, і над результатом завжди написано, який спрацював:', 'Zonder uw klik gaat de tekst van het bericht nergens heen. Er zijn twee werkende manieren, en boven het resultaat staat altijd welke het was:')}</p>
      <ul className="ai-uitleg-lijst">
        <li>
          <b>{t('Локально, на цьому комп’ютері', 'Lokaal, op deze computer')}</b> ·{' '}
          {t(
            'вбудований ШІ Chrome через розширення Mijn Ruimte: безкоштовно, без ключа, текст не бачить ніхто — навіть ваш сервер. Лише Chrome на комп’ютері (Windows, macOS, Linux); на телефонах Google його не підтримує. Уміє переклад і підсумок.',
            'ingebouwde AI van Chrome via de Mijn Ruimte-extensie: gratis, zonder sleutel, niemand ziet de tekst — ook uw server niet. Alleen Chrome op een computer (Windows, macOS, Linux); op telefoons ondersteunt Google hem niet. Kan vertalen en samenvatten.',
          )}
        </li>
        <li>
          <b>{t('Через постачальника з вашим ключем', 'Via een aanbieder met uw sleutel')}</b> ·{' '}
          {t(
            'ваш сервер прибирає трекери, приховує паролі й коди, і надсилає текст постачальнику (Google, Anthropic, OpenAI, xAI, Z.ai) вашим власним ключем зі «Сховища ключів». Ключ власника сервера чи іншого користувача не використовується ніколи. Працює на будь-якому пристрої, уміє все.',
            'uw server haalt trackers weg, verbergt wachtwoorden en codes en stuurt de tekst naar de aanbieder (Google, Anthropic, OpenAI, xAI, Z.ai) met uw eigen sleutel uit de «Sleutelkluis». De sleutel van de eigenaar van de server of van een andere gebruiker wordt nooit gebruikt. Werkt op elk apparaat en kan alles.',
          )}
        </li>
      </ul>
      <p>
        {t(
          'Безкоштовно серед постачальників — лише безкоштовний рівень Google Gemini (з лімітами; на ньому Google використовує запити для покращення продуктів і їх можуть читати люди; у ЄЕЗ, Швейцарії й Великій Британії умови Google для застосунків передбачають платний рівень). Решта — оплата за використання; актуальні ціни — на офіційних сторінках у картках рушіїв. Коли ліміт вичерпано, панель скаже про це й запропонує інший готовий рушій.',
          'Gratis bij de aanbieders is alleen het gratis niveau van Google Gemini (met limieten; daarop gebruikt Google de verzoeken om zijn producten te verbeteren en kunnen mensen ze lezen; in de EER, Zwitserland en het VK voorzien de voorwaarden van Google voor apps het betaalde niveau). De rest is betalen per gebruik; actuele prijzen staan op de officiële pagina’s in de motorkaarten. Is een limiet op, dan zegt het paneel dat en stelt het een andere motor voor die klaar is.',
        )}
      </p>
      <p>
        {t(
          'Конектор (Claude, ChatGPT тощо на їхніх сайтах) працює лише в один бік: ШІ з чату звертається до вашого простору, а сайт не може сам попросити його перекласти лист. Тож тут він не допоможе; але в чаті можна попросити свого ШІ прочитати й перекласти лист — він зробить це через конектор за вашою підпискою.',
          'Een connector (Claude, ChatGPT enz. op hun eigen sites) werkt maar één kant op: de AI in de chat vraagt uw ruimte, de site kan hem niet zelf vragen een bericht te vertalen. Hier helpt hij dus niet; maar in de chat kunt u uw AI vragen een bericht te lezen en te vertalen — dat doet hij via de connector met uw abonnement.',
        )}
      </p>
      <p className="ai-uitleg-stappen">
        {t(
          'Ключ для себе: «Сховище ключів» → додати ключ, призначення — постачальник; потім у «Підключення ШІ → Доступи» дозволити цьому ШІ читати пошту. Ключі — це «для себе»: їх бачите й використовуєте лише ви, навіть якщо ви власник сервера.',
          'Sleutel voor uzelf: «Sleutelkluis» → sleutel toevoegen, doel = aanbieder; daarna in «AI-verbindingen → Toegang» deze AI de post laten lezen. Sleutels zijn «voor uzelf»: alleen u ziet en gebruikt ze, ook als u de eigenaar van de server bent.',
        )}
      </p>
      <div className="ai-uitleg-knoppen">
        <a className="ai-uitleg-knop" href={aiHrefOplossen(AI_TOEGANG_HREF, 'sleutels')} data-testid="ai-uitleg-sleutels">
          <KeyRound size={13} aria-hidden="true" />
          {t('Сховище ключів', 'Sleutelkluis')}
          <ExternalLink size={12} aria-hidden="true" />
        </a>
        <a className="ai-uitleg-knop" href={aiHrefOplossen(AI_TOEGANG_HREF)} data-testid="ai-uitleg-toegang">
          <ShieldCheck size={13} aria-hidden="true" />
          {t('Доступи ШІ', 'AI-toegang')}
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
