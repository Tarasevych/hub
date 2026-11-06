// EXT090-001 (06.11.2026): blok «Вбудований ШІ Chrome» in «Розширення браузера» — de site-kant van extensie 0.9.0.
// Blok «Ingebouwde AI van Chrome»: per API wat Chrome op DEZE pagina aanbiedt (availability(), nooit create(): geen download zonder
// klik) en wat de gebruiker in de extensie aanzette (alleen keuzes uit de publieke status). Tekst gaat nooit naar de server.
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, XCircle } from 'lucide-react';
import type { Tr } from '../mcp-ui';
import { vergelijkVersie } from '../../shared/extensie-update';
import { LOKALE_AI_APIS, LOKALE_AI_INFO, LOKALE_AI_MIN_EXTENSIE, laiRegel, meetPagina, type LokaleAiApi, type LokaleAiKeuze, type PaginaStand } from '../../shared/lokale-ai-model';

const ouder = (a: string, b: string) => vergelijkVersie(a, b) < 0;

export default function LokaleAiPaneel({ tr, keuze, extVersie }: { tr: Tr; keuze: LokaleAiKeuze | null; extVersie: string }) {
  const [pagina, setPagina] = useState<Record<LokaleAiApi, PaginaStand> | null>(null);
  useEffect(() => {
    let weg = false;
    void meetPagina().then((r) => { if (!weg) setPagina(r); }).catch(() => undefined);
    return () => { weg = true; };
  }, []);
  const regels = LOKALE_AI_APIS.map((api) => ({ api, r: pagina ? laiRegel(api, pagina[api], keuze, extVersie, ouder) : null }));
  const klaar = regels.filter((x) => x.r?.stand === 'ja').length;
  const samenvatting = !pagina ? tr('Перевіряємо, що підтримує цей Chrome…', 'Controleren wat deze Chrome ondersteunt…')
    : klaar ? tr(`Готово до роботи: ${klaar} з ${LOKALE_AI_APIS.length} функцій`, `Klaar voor gebruik: ${klaar} van ${LOKALE_AI_APIS.length} functies`)
      : tr('Зараз жодна функція не готова — нижче причина для кожної', 'Nu is geen functie klaar — hieronder per functie de reden');

  return (
    <section className='ag-blok' data-ag-blok='extensie-lokale-ai' aria-labelledby='ag-ext-lokale-ai'>
      <header className='ag-blok-kop'>
        <h3 className='ag-blok-titel' id='ag-ext-lokale-ai'><Cpu aria-hidden='true' /> {tr('Вбудований ШІ Chrome', 'Ingebouwde AI van Chrome')}</h3>
        <p className='ag-blok-uitleg'>{tr(
          `Розширення ${LOKALE_AI_MIN_EXTENSIE}+ використовує модель Gemini Nano, що працює прямо на цьому комп’ютері: стислий виклад, написання, переписування, переклад, визначення мови, коректура й діалог. Текст не залишає пристрій — навіть сервер Mijn Ruimte його не бачить. Користуватися: бічна панель розширення → «Локальний ШІ».`,
          `Extensie ${LOKALE_AI_MIN_EXTENSIE}+ gebruikt het model Gemini Nano dat op deze computer zelf draait: samenvatten, schrijven, herschrijven, vertalen, taal herkennen, proeflezen en een gesprek. Tekst verlaat het apparaat niet — ook de server van Mijn Ruimte ziet hem niet. Gebruik: zijpaneel van de extensie → «Lokale AI».`)}</p>
      </header>
      <p className={`ag-rij ag2-rij ${klaar ? 'is-let' : 'is-warn'}`} role='status' aria-live='polite' data-lai-samenvatting={pagina ? klaar : 'bezig'}>
        {klaar ? <CheckCircle2 aria-hidden='true' /> : <AlertTriangle aria-hidden='true' />}<span>{samenvatting}</span>
      </p>
      <details className='ag-ext-lai' data-lai-details='1'>
        <summary title={tr('Для кожної функції: чи є вона в цьому Chrome і чи ввімкнено її в розширенні. Нічого не завантажує й не запускає.', 'Per functie: zit ze in deze Chrome en staat ze aan in de extensie. Downloadt of start niets.')}>
          {tr('Деталі по кожній функції', 'Details per functie')}
        </summary>
        <ul className='ag-ext-lijst' data-lijst='lokale-ai'>
          {regels.map(({ api, r }) => (
            <li key={api} className='ag-rij ag2-rij' data-lai-api={api} data-lai-stand={r ? r.stand : 'bezig'}>
              {!r ? <Cpu aria-hidden='true' /> : r.stand === 'ja' ? <CheckCircle2 aria-hidden='true' /> : r.stand === 'nee' ? <XCircle aria-hidden='true' /> : <AlertTriangle aria-hidden='true' />}
              <span><b>{tr(LOKALE_AI_INFO[api].uk, LOKALE_AI_INFO[api].nl)}</b>{r ? ` — ${tr(r.uk, r.nl)}` : ''}</span>
            </li>
          ))}
        </ul>
        <p className='ag-blok-uitleg'>{tr(
          'Вимоги Chrome: Windows 10/11, macOS 13+, Linux або ChromeOS (Chromebook Plus); ≥ 22 ГБ вільного місця; GPU понад 4 ГБ або 16 ГБ RAM і 4 ядра; безлімітне з’єднання для першого завантаження моделі. Українська та нідерландська — через перекладач.',
          'Vereisten van Chrome: Windows 10/11, macOS 13+, Linux of ChromeOS (Chromebook Plus); ≥ 22 GB vrij; GPU met meer dan 4 GB of 16 GB RAM en 4 kernen; een onbeperkte verbinding voor de eerste download van het model. Oekraïens en Nederlands gaan via de vertaler.')}</p>
      </details>
    </section>
  );
}
