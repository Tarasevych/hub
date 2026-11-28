// SITE-001 (пункт 15): справжня 404 для невідомих адрес і власна сторінка 404.
// Сервер виконує ту саму `resolve` з public/canonical-service.js, що й оглядач; особливі шляхи (гостьовий доступ, повернення з
// OAuth) і всі вкладки служб лишаються 200. Сторінка 404 без входу — сама, без меню; шлях показано розкодованим.
// nl: echte 404 voor onbekende adressen; zelfde `resolve` als de browser; gastpagina en OAuth-terugkeer blijven 200.
import { readFile } from 'node:fs/promises';
import { checker } from './hulp/nep-google';
import { onbekendAppPad } from '../../server/platform/onbekend-pad';
import { leesbaarPad } from '../../src/niet-gevonden-pad';

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-404');
  const root = 'public';
  const is404 = (host: string, adres: string) => onbekendAppPad(root, host, new URL(adres, `https://${host}`));

  check('hub: невідома адреса → 404', is404('hub.tarasevych.com', '/bestaat-niet'));
  check('hub: закодована кирилиця → 404', is404('hub.tarasevych.com', '/%D1%89%D0%BE'));
  check('hub: корінь → 200', !is404('hub.tarasevych.com', '/'));
  check('hub: вкладка «overzicht» (нідерландська назва) → 200', !is404('hub.tarasevych.com', '/overzicht'));
  check('hub: вкладка «notities» → 200', !is404('hub.tarasevych.com', '/notities'));
  check('mail: «postvak-in» з глибшим шляхом → 200', !is404('mail.tarasevych.com', '/postvak-in/abc'));
  check('mail: давня англійська назва «inbox» → 200', !is404('mail.tarasevych.com', '/inbox'));
  check('api: давній псевдонім «connections» → 200', !is404('api.tarasevych.com', '/connections'));
  check('cloud: спільне посилання «gedeeld/<код>» → 200', !is404('cloud.tarasevych.com', '/gedeeld/abcdefghijklmnop1234'));
  check('id: гостьовий доступ «/toegang» → 200', !is404('id.tarasevych.com', '/toegang'));
  check('id: повернення з OAuth → 200', !is404('id.tarasevych.com', '/oauth-terug'));
  check('hub: «/toegang» не є вкладкою hub → 404', is404('hub.tarasevych.com', '/toegang'));
  check('admin: «diagnostiek» → 200', !is404('admin.tarasevych.com', '/diagnostiek'));
  check('admin: невідома адреса → 404', is404('admin.tarasevych.com', '/geheim'));
  check('порт у заголовку Host не заважає', is404('hub.tarasevych.com:8443', '/bestaat-niet'));
  check('місцевий стенд (localhost) без висновку → 200', !is404('localhost', '/bestaat-niet'));
  check('немає canonical-service.js → поводимося як раніше (200)', !onbekendAppPad('bestaat-niet-map', 'hub.tarasevych.com', new URL('https://hub.tarasevych.com/x')));

  check('шлях розкодовано для людини', leesbaarPad('/%D1%89%D0%BE') === '/що');
  check('зіпсоване кодування показано як є', leesbaarPad('/%E0%A4%A') === '/%E0%A4%A');

  const start = await readFile('server/start.ts', 'utf8');
  check('server/start.ts віддає index.html з кодом onbekendAppPad', /onbekendAppPad\(root, String\(req\.headers\.host \|\| ''\), url\) \? 404 : 200/.test(start));
  check('для коду ≠ 200 немає відповіді 304 (ETag)', (start.match(/status === 200 && req\.headers\['if-none-match'\]/g) || []).length === 2);
  const app = await readFile('src/App.tsx', 'utf8');
  check('hub без входу: сторінка 404 сама, без меню', app.includes("state==='signed_out'?<NietGevonden lang={lang} los/>"));
  const dienst = await readFile('src/VerenigdDienstApp.tsx', 'utf8');
  check('інші служби без входу: сторінка 404 сама', dienst.includes("if(routeOnbekend()&&state==='signed_out')return <NietGevonden lang={lang} los/>;"));
  const nietGevonden = await readFile('src/NietGevonden.tsx', 'utf8');
  check('заголовок вкладки «Сторінку не знайдено» / «Pagina niet gevonden»', nietGevonden.includes('Сторінку не знайдено — ${dienst}') && nietGevonden.includes('Pagina niet gevonden — ${dienst}'));
  return einde();
}
