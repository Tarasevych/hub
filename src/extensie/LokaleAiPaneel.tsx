// EXT090-001 (06.11.2026): blok «Вбудований ШІ Chrome» in «Розширення браузера» — de site-kant van extensie 0.9.0.
// Blok «Ingebouwde AI van Chrome»: per API wat Chrome op DEZE pagina aanbiedt (availability(), nooit create(): geen download zonder
// klik) en wat de gebruiker in de extensie aanzette (alleen keuzes uit de publieke status). Tekst gaat nooit naar de server.
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, Play, Settings, XCircle } from 'lucide-react';
import type { Tr } from '../mcp-ui';
import { vergelijkVersie } from '../../shared/extensie-update';
import { sendToExtension } from '../extensie-toestand';
import { LOKALE_AI_APIS, LOKALE_AI_INFO, LOKALE_AI_MAX_TEKST, LOKALE_AI_MIN_EXTENSIE, LOKALE_AI_REDENEN, filterLokaleAiAntwoord, kiesStand, type LokaleAiAntwoord, laiRegel, meetPagina, type LokaleAiApi, type LokaleAiKeuze, type PaginaStand } from '../../shared/lokale-ai-model';
import '../agenten/agenten-toegang-maquette.css';

const ouder = (a: string, b: string) => vergelijkVersie(a, b) < 0;

export default function LokaleAiPaneel({ tr, keuze, extVersie, extId = '' }: { tr: Tr; keuze: LokaleAiKeuze | null; extVersie: string; extId?: string }) {
  const [pagina, setPagina] = useState<Record<LokaleAiApi, PaginaStand> | null>(null);
  useEffect(() => {
    let weg = false;
    void meetPagina().then((r) => { if (!weg) setPagina(r); }).catch(() => undefined);
    return () => { weg = true; };
  }, []);
  // 0.9.1: de meting van de extensie (offscreen.html) gaat voor; zonder die meting telt wat Chrome op deze pagina zegt.
  const regels = LOKALE_AI_APIS.map((api) => { const k = kiesStand(api, pagina, keuze); return { api, bron: k?.bron ?? null, r: k ? laiRegel(api, k.stand, keuze, extVersie, ouder, k.bron) : null }; });
  const klaar = regels.filter((x) => x.r?.stand === 'ja').length;
  const gemeten = regels.every((x) => x.r);
  const samenvatting = !gemeten ? tr('Перевіряємо, що підтримує цей Chrome…', 'Controleren wat deze Chrome ondersteunt…')
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
      <p className={`ag-rij ag2-rij ${klaar ? 'is-let' : 'is-warn'}`} role='status' aria-live='polite' data-lai-samenvatting={gemeten ? klaar : 'bezig'}>
        {klaar ? <CheckCircle2 aria-hidden='true' /> : <AlertTriangle aria-hidden='true' />}<span>{samenvatting}</span>
      </p>
      <details className='ag-ext-lai' data-lai-details='1'>
        <summary title={tr('Для кожної функції: чи є вона в цьому Chrome і чи ввімкнено її в розширенні. «У розширенні» — перевірку зробило саме розширення (прихований offscreen-документ), бо там функції й працюють. Нічого не завантажує й не запускає.', 'Per functie: zit ze in deze Chrome en staat ze aan in de extensie. «In de extensie» — de extensie controleerde het zelf (verborgen offscreen-document), want daar draaien de functies. Downloadt of start niets.')}>
          {tr('Деталі по кожній функції', 'Details per functie')}
        </summary>
        <ul className='ag-ext-lijst' data-lijst='lokale-ai'>
          {regels.map(({ api, bron, r }) => (
            <li key={api} className='ag-rij ag2-rij' data-lai-api={api} data-lai-stand={r ? r.stand : 'bezig'} data-lai-bron={bron ?? 'bezig'}>
              {!r ? <Cpu aria-hidden='true' /> : r.stand === 'ja' ? <CheckCircle2 aria-hidden='true' /> : r.stand === 'nee' ? <XCircle aria-hidden='true' /> : <AlertTriangle aria-hidden='true' />}
              <span><b>{tr(LOKALE_AI_INFO[api].uk, LOKALE_AI_INFO[api].nl)}</b>{r ? ` — ${tr(r.uk, r.nl)}` : ''}</span>
            </li>
          ))}
        </ul>
        <p className='ag-blok-uitleg'>{tr(
          'Вимоги Chrome: Windows 10/11, macOS 13+, Linux або ChromeOS (Chromebook Plus); ≥ 22 ГБ вільного місця; GPU понад 4 ГБ або 16 ГБ RAM і 4 ядра; безлімітне з’єднання для першого завантаження моделі. Українська та нідерландська — через перекладач.',
          'Vereisten van Chrome: Windows 10/11, macOS 13+, Linux of ChromeOS (Chromebook Plus); ≥ 22 GB vrij; GPU met meer dan 4 GB of 16 GB RAM en 4 kernen; een onbeperkte verbinding voor de eerste download van het model. Oekraïens en Nederlands gaan via de vertaler.')}</p>
      </details>
      <SiteToegang tr={tr} keuze={keuze} extId={extId} />
    </section>
  );
}

/**
 * 0.9.2: «Використання сторінками сайту». Toont of de gebruiker in de extensie de «!»-schakelaar siteToegang aanzette (standaard uit)
 * en laat, alleen dan, een korte tekst lokaal verwerken (LOKALE_AI via externally_connectable). Tekst gaat nooit naar de server.
 */
function SiteToegang({ tr, keuze, extId }: { tr: Tr; keuze: LokaleAiKeuze | null; extId: string }) {
  const [modus, setModus] = useState<LokaleAiApi>('summarizer');
  const [tekst, setTekst] = useState('');
  const [doelTaal, setDoelTaal] = useState('uk');
  const [bezig, setBezig] = useState(false);
  const [uitkomst, setUitkomst] = useState<LokaleAiAntwoord | null>(null);
  if (!keuze || typeof keuze.siteToegang !== 'boolean') return null; // extensie ouder dan 0.9.2 meldt dit niet
  const openOpties = () => { if (extId) void sendToExtension(extId, { type: 'OPEN_OPTIONS' }); };
  if (!keuze.siteToegang) {
    return (
      <div className='ag-ext-lai-site' data-lai-site='uit'>
        <p className='ag-rij ag2-rij is-warn'><AlertTriangle aria-hidden='true' /><span>
          <b>{tr('! Використання сторінками сайту: вимкнено', '! Gebruik door pagina’s van de site: uit')}</b>{' — '}
          {tr('Якщо ввімкнути, сторінки *.tarasevych.com зможуть надсилати текст локальній моделі й отримувати результат. Текст лишається на цьому пристрої, але сторінка навантажує GPU/RAM вашого комп’ютера (не більше 20 запитів за хвилину, модель ніколи не завантажується без вашого натискання).',
            'Aangezet kunnen pagina’s van *.tarasevych.com tekst naar het lokale model sturen en het resultaat terugkrijgen. De tekst blijft op dit apparaat, maar de pagina belast de GPU/RAM van uw computer (hoogstens 20 verzoeken per minuut; het model wordt nooit zonder uw klik gedownload).')}
        </span></p>
        {extId ? (
          <button type='button' className='ag-knop' onClick={openOpties} data-lai-actie='opties'
            title={tr('Відкриває налаштування розширення. Перемикач «!» вмикаєте лише ви; сайт сам його змінити не може.', 'Opent de instellingen van de extensie. De «!»-schakelaar zet alleen u aan; de site kan hem niet zelf wijzigen.')}>
            <Settings aria-hidden='true' /> {tr('Відкрити налаштування розширення', 'Instellingen van de extensie openen')}
          </button>
        ) : null}
      </div>
    );
  }
  const voerUit = async () => {
    if (!extId || bezig) return;
    setBezig(true); setUitkomst(null);
    const r = await sendToExtension(extId, { type: 'LOKALE_AI', modus, tekst: tekst.slice(0, LOKALE_AI_MAX_TEKST), ...(modus === 'translator' ? { doel: doelTaal } : {}) }, 125_000);
    setUitkomst(filterLokaleAiAntwoord(r)); setBezig(false);
  };
  const beschikbaar = LOKALE_AI_APIS.filter((a) => keuze.apis.includes(a));
  return (
    <div className='ag-ext-lai-site' data-lai-site='aan'>
      <p className='ag-rij ag2-rij is-let'><CheckCircle2 aria-hidden='true' /><span>
        <b>{tr('! Використання сторінками сайту: увімкнено', '! Gebruik door pagina’s van de site: aan')}</b>{' — '}
        {tr('спробуйте тут: текст обробляє модель на цьому комп’ютері, сервер його не отримує.', 'probeer het hier: het model op deze computer verwerkt de tekst, de server krijgt hem niet.')}
      </span></p>
      <label className='ag-veld'>{tr('Функція', 'Functie')}
        <select value={modus} onChange={(e) => setModus(e.target.value as LokaleAiApi)} data-lai-veld='modus'>
          {beschikbaar.map((a) => <option key={a} value={a}>{tr(LOKALE_AI_INFO[a].uk, LOKALE_AI_INFO[a].nl)}</option>)}
        </select>
      </label>
      {modus === 'translator' ? (
        <label className='ag-veld'>{tr('Мова перекладу', 'Doeltaal')}
          <select value={doelTaal} onChange={(e) => setDoelTaal(e.target.value)} data-lai-veld='doel'>
            <option value='uk'>{tr('українська', 'Oekraïens')}</option><option value='nl'>{tr('нідерландська', 'Nederlands')}</option><option value='en'>{tr('англійська', 'Engels')}</option>
          </select>
        </label>
      ) : null}
      <label className='ag-veld'>{tr('Текст', 'Tekst')}
        <textarea value={tekst} maxLength={LOKALE_AI_MAX_TEKST} rows={4} onChange={(e) => setTekst(e.target.value)} data-lai-veld='tekst' />
      </label>
      <button type='button' className='ag-knop' onClick={() => { void voerUit(); }} disabled={bezig || !tekst.trim() || !beschikbaar.includes(modus)} data-lai-actie='uitvoeren'
        title={tr('Виконує вибрану функцію моделлю на цьому пристрої (до 120 с). Якщо модель ще не завантажена, нічого не завантажується — з’явиться пояснення.', 'Voert de gekozen functie uit met het model op dit apparaat (tot 120 s). Is het model nog niet gedownload, dan wordt niets gedownload — u krijgt uitleg.')}>
        <Play aria-hidden='true' /> {bezig ? tr('Виконується…', 'Bezig…') : tr('Виконати на цьому пристрої', 'Uitvoeren op dit apparaat')}
      </button>
      <div role='status' aria-live='polite' data-lai-uitkomst={uitkomst ? (uitkomst.ok ? 'ok' : uitkomst.reden) : ''}>
        {uitkomst?.ok ? <pre className='ag-ext-lai-uit'>{uitkomst.tekst}</pre> : null}
        {uitkomst && !uitkomst.ok ? <p className='ag-rij ag2-rij is-warn'><XCircle aria-hidden='true' /><span>{tr(...(LOKALE_AI_REDENEN[uitkomst.reden] ?? LOKALE_AI_REDENEN.FOUT))}</span></p> : null}
      </div>
    </div>
  );
}
