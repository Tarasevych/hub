// MAILAI-001 (15.11.2026): «Як працює ШІ в пошті» — чесне пояснення за фактичним станом коду, однаково в панелі «Рушії перекладу»
// і в «Вигляд → ШІ-аналіз над листом». Павло: «не зрозуміло, як це працює … лише за API чи є безкоштовні рішення … в один клік?»
// Uitleg over de AI in de post, zoals de code nu werkt: de server van de gebruiker roept een AI-aanbieder aan met de EIGEN sleutel
// uit de Sleutelkluis (backend/ai-vertaling-routes.ts → callAnthropicJson). Een MCP-connector of de ingebouwde AI van Chrome doet dat
// (nog) niet; dat staat er eerlijk bij, niets wordt beloofd wat er niet is.
import { ExternalLink, KeyRound, ShieldCheck } from 'lucide-react';
import { AI_TOEGANG_HREF } from '../../shared/ai-vertaling';
import { aiHrefOplossen } from './ai-staat';
import './ai-uitleg.css';

export default function AiUitleg({ nl, compact = false }: { nl: boolean; compact?: boolean }) {
  const t = (uk: string, nlTekst: string) => (nl ? nlTekst : uk);
  return (
    <div className={`ai-uitleg${compact ? ' is-compact' : ''}`} data-testid="ai-uitleg">
      <strong className="ai-uitleg-kop">{t('Як працює ШІ в пошті', 'Hoe de AI in de post werkt')}</strong>
      <p>
        {t(
          'Переклад, підсумок і контекст робить сам сайт на вашому сервері: після вашого натискання він надсилає текст листа постачальнику ШІ з вашим власним ключем API зі «Сховища ключів». Без натискання нічого не надсилається.',
          'Vertaling, samenvatting en context doet de site zelf op uw server: na uw klik stuurt hij de tekst van het bericht naar een AI-aanbieder met uw eigen API-sleutel uit de «Sleutelkluis». Zonder klik gaat er niets weg.',
        )}
      </p>
      <p>
        {t(
          'Підключення через конектор (Claude, ChatGPT тощо) тут не допоможе: конектор дає ШІ доступ до вашого простору з чату, але сайт не може сам попросити його перекласти лист.',
          'Een koppeling via de connector (Claude, ChatGPT enz.) helpt hier niet: die geeft de AI vanuit de chat toegang tot uw ruimte, maar de site kan hem niet zelf vragen een bericht te vertalen.',
        )}
      </p>
      <ul className="ai-uitleg-lijst">
        <li>
          <b>Google Gemini</b> ·{' '}
          {t(
            'у Google AI Studio є безкоштовний рівень з лімітами запитів; на ньому Google може використовувати запити для покращення своїх продуктів.',
            'Google AI Studio heeft een gratis niveau met limieten; daarop mag Google de verzoeken gebruiken om zijn producten te verbeteren.',
          )}
        </li>
        <li>
          <b>Anthropic (Claude), OpenAI, xAI (Grok), Z.ai (GLM)</b> · {t('платно, оплата за використання.', 'betaald, per gebruik.')}
        </li>
        <li>
          <b>{t('Вбудований ШІ Chrome', 'Ingebouwde AI van Chrome')}</b> ·{' '}
          {t(
            'безкоштовно й лише на вашому пристрої (розширення Mijn Ruimte), але пошта ним ще не користується.',
            'gratis en alleen op uw apparaat (Mijn Ruimte-extensie), maar de post gebruikt het nog niet.',
          )}
        </li>
      </ul>
      <p className="ai-uitleg-stappen">
        {t(
          'Кроки: 1) «Сховище ключів» → додати ключ, призначення — постачальник; 2) у «Підключення ШІ → Доступи» дозволити цьому ШІ читати пошту. «Сховище ключів» відкрите власнику сервера і тим, кому він дав право «API-платформа».',
          'Stappen: 1) «Sleutelkluis» → sleutel toevoegen, doel = aanbieder; 2) in «AI-verbindingen → Toegang» deze AI de post laten lezen. De «Sleutelkluis» is open voor de eigenaar van de server en wie van hem het recht «API-platform» kreeg.',
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
