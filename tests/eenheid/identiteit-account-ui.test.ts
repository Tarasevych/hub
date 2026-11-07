// IDENTITY-002 / AUDIT-001 · Перевірка єдиної сторінки облікового запису (12 розділів), діалогу фото та 4 виправлень аудиту 05.11.2026.
import { readFileSync } from 'node:fs';
import { IDENTITEIT_TABS, identiteitTitel, isIdentiteitTab } from '../../src/identiteit/identiteit-tabs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-account-ui');
  const pagina = readFileSync('src/identiteit/IdentiteitAccountPagina.tsx', 'utf8');
  const foto = readFileSync('src/identiteit/Profielfoto.tsx', 'utf8');
  const css = readFileSync('src/identiteit/identiteit-account.css', 'utf8');
  const plaatsing = JSON.parse(readFileSync('scripts/plaatsing-vaste-elementen.json', 'utf8'));

  check('IDENTITEIT_TABS містить рівно 12 розділів у канонічному порядку з двомовними назвами (uk/nl)',
    IDENTITEIT_TABS.length === 12
    && IDENTITEIT_TABS.every((t) => isIdentiteitTab(t.id) && t.uk.length > 0 && t.nl.length > 0)
    && !isIdentiteitTab('onbekend')
    && identiteitTitel('personalization', 'uk') === 'Персоналізація'
    && identiteitTitel('recovery', 'nl') === 'Toegangsherstel'
    && identiteitTitel('onbekend', 'uk') === 'onbekend');

  check('IdentiteitAccountPagina рендерить меню-зміст (.ia-toc) і всі 12 секцій (.ia-sectie) зі scrollIntoView',
    pagina.includes("className='ia-toc'")
    && pagina.includes("className='ia-sectie'")
    && pagina.includes('IDENTITEIT_TABS.map')
    && pagina.includes('scrollIntoView'));

  check('Profielfoto підтримує 3 джерела фото (apparaat, dienst, link), центровану камеру та окремий смітничок',
    foto.includes("className='ia-avatar-camera'")
    && foto.includes("className='ia-avatar-prullenbak'")
    && foto.includes("setBron('apparaat')")
    && foto.includes("setBron('dienst')")
    && foto.includes("setBron('link')")
    && foto.includes("className='ia-dialoog-achtergrond'"));

  check('Аудит cbeb3d0 (проблеми 1 і 2): камера 22×22 px по центру аватара, смітничок 24×24 px у куті без перекриття',
    /\.ia-avatar-camera\s*\{[\s\S]*?top:\s*50%;[\s\S]*?left:\s*50%;[\s\S]*?transform:\s*translate\(-50%,\s*-50%\);[\s\S]*?width:\s*22px;[\s\S]*?height:\s*22px;/.test(css)
    && /\.ia-avatar-prullenbak\s*\{[\s\S]*?top:\s*-6px;[\s\S]*?right:\s*-6px;[\s\S]*?width:\s*24px;[\s\S]*?height:\s*24px;/.test(css));

  check('Аудит a318ba0 (проблема 3): модальне вікно фото (.ia-dialoog-achtergrond) має z-index 99500 вище шапки (.app-header 99000) і безпечний відступ зверху',
    /\.ia-dialoog-achtergrond\s*\{[\s\S]*?padding-top:\s*max\(var\(--ruimte-4\),\s*calc\(76px\s*\+\s*env\(safe-area-inset-top,\s*0px\)\)\);[\s\S]*?z-index:\s*99500;/.test(css)
    && Array.isArray(plaatsing.toegestaan)
    && plaatsing.toegestaan.some((l: { sleutel?: string }) => l.sleutel?.includes('.ia-dialoog-achtergrond')));

  check('Аудит a318ba0 (проблема 4): sticky меню-зміст (.ia-toc) має top 70px/62px, а секції (.ia-sectie) мають scroll-margin-top 170px/150px',
    /\.ia-toc\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*70px;/.test(css)
    && /\.ia-sectie\s*\{[\s\S]*?scroll-margin-top:\s*170px;/.test(css)
    && /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.ia-toc\s*\{[\s\S]*?top:\s*62px;[\s\S]*?\.ia-sectie\s*\{[\s\S]*?scroll-margin-top:\s*150px;/.test(css));

  return einde();
}
