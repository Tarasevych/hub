// IDENTITEIT-014 (фаза 3, крок «uitvoer»): Налаштування → Акаунт → «Ваші дані». Вивантаження всіх даних облікового запису
// одним JSON-файлом (POST /api/owner/privacy/export). Сервер просить повторне підтвердження доступу (вікно відкриває
// platform/client сам) і дозволяє 5 вивантажень на годину. Файл зберігає браузер: сервер віддає звичайний JSON.
// Компактний варіант стоїть у блоці видалення облікового запису, де текст радить спершу вивантажити дані.
// Export van alle gegevens van het account als één JSON-bestand; bevestiging van toegang regelt de client; 5 per uur.
// IDENTITEIT-015 (apparaten-uitvoer): вибір формату — «Структурований» (JSON) або «Табличний» (ZIP, по CSV на таблицю, сервер
// робить CSV без секретів, backend/privacy.ts); стан «Готую файл… → Готово → Зберегти файл ще раз». Ліміт і step-up — спільні.
// Keuze van het formaat (JSON of ZIP met CSV per tabel) en de stand «bezig → klaar → bestand opnieuw bewaren».
import { useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2, ShieldAlert } from 'lucide-react';
import { api } from '../platform/client';
import { bewaarBlob } from '../platform/bestand-opslaan';
import { ecosystemTabContext } from '../tab-context';
import { UITVOER_PER_UUR, uitvoerWeigering, type Paar } from '../weigeringen';
import { alleenMens, geenAi } from '../menselijke-actie';
import './gegevensuitvoer.css';

type Lang = 'uk' | 'nl';
export const UITVOER_ROUTE = '/api/owner/privacy/export';
export const UITVOER_FORMAAT = 'mijn-ruimte-export-v1';
/** IDENTITEIT-015: відповідь сервера для «Табличний» (ZIP у base64). Antwoord voor de tabelvorm. */
export const UITVOER_ZIP_FORMAAT = 'mijn-ruimte-export-v1-zip';
export type UitvoerFormaat = 'json' | 'zip';
const ONBEKEND: Paar = ['Не вдалося вивантажити дані. Файл не створено — спробуйте ще раз за хвилину.', 'De gegevens konden niet worden geëxporteerd. Er is geen bestand gemaakt — probeer het over een minuut opnieuw.'];
const VREEMD: Paar = ['Сервер відповів не файлом вивантаження. Нічого не збережено — оновіть сторінку й спробуйте ще раз.', 'De server antwoordde niet met een exportbestand. Er is niets bewaard — ververs de pagina en probeer het opnieuw.'];

/** Тіло запиту: сеанс налаштувань (identity) цієї вкладки. Verzoek met de identity-sessie van dit tabblad. */
export const uitvoerAanvraag = (tabContext: string, origin: string, formaat: UitvoerFormaat = 'json') => ({ service: 'identity', tabContext, sourceOrigin: origin, ...(formaat === 'zip' ? { formaat: 'zip' } : {}) });
/** Назва файлу з датою (UTC), напр. mijn-ruimte-export-2026-11-14.json або .zip. */
export const uitvoerBestandsnaam = (nu: Date, formaat: UitvoerFormaat = 'json') => `mijn-ruimte-export-${nu.toISOString().slice(0, 10)}.${formaat === 'zip' ? 'zip' : 'json'}`;

export type UitvoerUitkomst = { ok: true; naam: string; bytes: number; blob?: Blob; tabellen?: number } | { ok: false; tekst: Paar };
export type UitvoerAfh = {
  post: (url: string, body: unknown) => Promise<{ data: unknown }>;
  bewaar: (naam: string, blob: Blob) => void;
  tabContext: string;
  origin: string;
  nu?: Date;
  /** IDENTITEIT-015: типово JSON (як раніше). */
  formaat?: UitvoerFormaat;
};
/** base64 → байти (без Buffer: працює в браузері й у node). */
const uitBase64 = (s: string): Uint8Array => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

/** Чиста дія без React: запит, перевірка формату, збереження файлу; помилка → текст [uk, nl]. Zuivere handeling (testbaar). */
export async function gegevensUitvoeren(a: UitvoerAfh): Promise<UitvoerUitkomst> {
  const formaat: UitvoerFormaat = a.formaat === 'zip' ? 'zip' : 'json';
  let data: unknown;
  try { data = (await a.post(UITVOER_ROUTE, uitvoerAanvraag(a.tabContext, a.origin, formaat))).data; }
  catch (e) { return { ok: false, tekst: uitvoerWeigering(e) || ONBEKEND }; }
  if (formaat === 'zip') {
    const z = (data || {}) as { formaat?: unknown; data?: unknown; tabellen?: unknown };
    if (z.formaat !== UITVOER_ZIP_FORMAAT || typeof z.data !== 'string' || !z.data) return { ok: false, tekst: VREEMD };
    let bytes: Uint8Array;
    try { bytes = uitBase64(z.data); } catch { return { ok: false, tekst: VREEMD }; }
    // ZIP починається з «PK\x03\x04»; інакше це не архів — нічого не зберігаємо.
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { ok: false, tekst: VREEMD };
    const naam = uitvoerBestandsnaam(a.nu || new Date(), 'zip');
    const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
    a.bewaar(naam, blob);
    return { ok: true, naam, bytes: bytes.length, blob, tabellen: Array.isArray(z.tabellen) ? z.tabellen.length : undefined };
  }
  if (!data || typeof data !== 'object' || (data as { formaat?: unknown }).formaat !== UITVOER_FORMAAT) return { ok: false, tekst: VREEMD };
  const inhoud = JSON.stringify(data, null, 2);
  const naam = uitvoerBestandsnaam(a.nu || new Date());
  const blob = new Blob([inhoud], { type: 'application/json' });
  a.bewaar(naam, blob);
  return { ok: true, naam, bytes: new TextEncoder().encode(inhoud).length, blob };
}

/** Розмір файла людською мовою; для uk — «Б/КБ/МБ» (раніше змішано «B»/«MB» латиницею). / Bestandsgrootte per taal. */
export const grootte = (lang: Lang, b: number) => {
  const [B, KB, MB] = lang === 'uk' ? ['Б', 'КБ', 'МБ'] : ['B', 'kB', 'MB'];
  return b < 1024 ? `${b} ${B}` : b < 1048576 ? `${Math.round(b / 1024)} ${KB}` : `${(b / 1048576).toFixed(1).replace('.', ',')} ${MB}`; // uk і nl — десяткова кома
};

export default function Gegevensuitvoer({ lang, compact = false }: { lang: Lang; compact?: boolean }) {
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [bezig, setBezig] = useState(false);
  const [uitkomst, setUitkomst] = useState<UitvoerUitkomst | null>(null);
  // IDENTITEIT-015: формат (компактна кнопка в зоні видалення — завжди JSON, як і раніше). Formaat; compact blijft JSON.
  const [formaat, setFormaat] = useState<UitvoerFormaat>('json');
  const loopt = useRef(false); // повторне натискання під час підготовки нічого не запускає вдруге
  const start = alleenMens(() => {
    if (bezig || loopt.current) return;
    loopt.current = true; setBezig(true); setUitkomst(null);
    void gegevensUitvoeren({ post: (u, b) => api.post(u, b), bewaar: bewaarBlob, tabContext: ecosystemTabContext(), origin: location.origin, formaat: compact ? 'json' : formaat })
      .then(setUitkomst)
      .finally(() => { loopt.current = false; setBezig(false); });
  });
  const opnieuw = alleenMens(() => { if (uitkomst?.ok && uitkomst.blob) bewaarBlob(uitkomst.naam, uitkomst.blob); });
  const formaatLabel = formaat === 'zip' ? tr('ZIP із CSV', 'ZIP met CSV') : 'JSON';
  const knop = (
    <button type='button' className={compact ? 'gegevensuitvoer-knop' : 'settings-primary'} data-gegevensuitvoer-knop={compact ? 'compact' : 'vol'} disabled={bezig} aria-busy={bezig} onClick={start} {...geenAi}
      title={tr('Сайт попросить підтвердити, що це ви, і збереже файл на цьому пристрої. Нічого в обліковому записі не зміниться.', 'De site vraagt te bevestigen dat u het bent en bewaart het bestand op dit apparaat. Er verandert niets aan het account.')}>
      {bezig ? <Loader2 className='gegevensuitvoer-draai' aria-hidden='true' /> : <Download aria-hidden='true' />}
      {bezig ? tr('Готую файл…', 'Bestand wordt gemaakt…') : compact ? tr('Вивантажити мої дані (JSON)', 'Mijn gegevens exporteren (JSON)') : tr(`Вивантажити мої дані (${formaatLabel})`, `Mijn gegevens exporteren (${formaatLabel})`)}
    </button>
  );
  const stand = bezig ? (
    <p className='settings-muted' role='status' data-gegevensuitvoer-stand='bezig'>{tr('Готую файл: збираю дані облікового запису й прибираю секрети. Не закривайте сторінку.', 'Bestand wordt gemaakt: gegevens van het account verzamelen en geheimen weglaten. Sluit de pagina niet.')}</p>
  ) : uitkomst && (
    <div className='gegevensuitvoer-stand' data-gegevensuitvoer-stand={uitkomst.ok ? 'ok' : 'fout'}>
      <p className={uitkomst.ok ? 'settings-muted' : 'settings-honest-note'} role={uitkomst.ok ? 'status' : 'alert'}>
        {uitkomst.ok && <CheckCircle2 aria-hidden='true' />}
        {uitkomst.ok
          ? tr(`Готово. Файл «${uitkomst.naam}» (${grootte(lang, uitkomst.bytes)}${uitkomst.tabellen ? `, таблиць: ${uitkomst.tabellen}` : ''}) збережено в завантаження цього пристрою.`, `Klaar. Bestand «${uitkomst.naam}» (${grootte(lang, uitkomst.bytes)}${uitkomst.tabellen ? `, tabellen: ${uitkomst.tabellen}` : ''}) is bewaard bij de downloads van dit apparaat.`)
          : tr(uitkomst.tekst[0], uitkomst.tekst[1])}
      </p>
      {uitkomst.ok && uitkomst.blob && <button type='button' className='gegevensuitvoer-knop' data-gegevensuitvoer-opnieuw='1' onClick={opnieuw} {...geenAi}
        title={tr('Той самий файл ще раз — без нового запиту до сервера й без нового вивантаження в ліміті.', 'Hetzelfde bestand nog eens — zonder nieuw verzoek aan de server en zonder nieuwe export binnen de limiet.')}>
        <Download aria-hidden='true' />{tr('Зберегти файл ще раз', 'Bestand opnieuw bewaren')}</button>}
    </div>
  );
  const keuze = (
    <fieldset className='gegevensuitvoer-formaat' data-gegevensuitvoer-formaat={formaat} disabled={bezig}>
      <legend>{tr('Формат файлу', 'Bestandsformaat')}</legend>
      <label><input type='radio' name='gegevensuitvoer-formaat' value='json' checked={formaat === 'json'} onChange={() => setFormaat('json')} />
        <span><strong>{tr('Структурований (JSON)', 'Gestructureerd (JSON)')}</strong><small>{tr('Один файл .json з усією структурою — для перенесення в інші служби чи резервної копії.', 'Eén .json-bestand met de volledige structuur — om over te zetten naar andere diensten of als reservekopie.')}</small></span></label>
      <label><input type='radio' name='gegevensuitvoer-formaat' value='zip' checked={formaat === 'zip'} onChange={() => setFormaat('zip')} />
        <span><strong>{tr('Табличний (ZIP із CSV)', 'Tabelvorm (ZIP met CSV)')}</strong><small>{tr('Архів .zip: по одному CSV на кожну таблицю (відкривається в Excel, LibreOffice, Google Таблицях) і LEESMIJ.txt з поясненням. Ті самі дані, без секретів.', 'Een .zip-archief: één CSV per tabel (opent in Excel, LibreOffice, Google Spreadsheets) en LEESMIJ.txt met uitleg. Dezelfde gegevens, zonder geheimen.')}</small></span></label>
    </fieldset>
  );
  if (compact) return <div className='gegevensuitvoer-compact' data-gegevensuitvoer='compact'>{knop}{stand}</div>;
  return (
    <section id='gegevensuitvoer' data-gegevensuitvoer='vol'>
      <h3>{tr('Ваші дані', 'Uw gegevens')}</h3>
      <p className='settings-muted'>{tr(
        'Файл з усім, що сайт зберігає про ваш обліковий запис: профіль, робочі простори, блоки, сповіщення, налаштування й перелік файлів (без їхнього вмісту — його можна завантажити в хмарі). Паролі, ключі, токени й зашифровані поля у файл не потрапляють.',
        'Een bestand met alles wat de site over uw account bewaart: profiel, werkruimtes, blokken, meldingen, instellingen en de lijst van bestanden (zonder inhoud — die downloadt u in de cloud). Wachtwoorden, sleutels, tokens en versleutelde velden komen er niet in.')}</p>
      <p className='settings-honest-note' data-gegevensuitvoer-waarschuwing='1'><ShieldAlert aria-hidden='true' /> {tr(
        'У файл входить журнал безпеки: входи, IP-адреси, пристрої та дії з доступом. Хто отримає файл, побачить, звідки й коли ви входите. Зберігайте його як пароль і не пересилайте.',
        'Het bestand bevat het beveiligingslogboek: aanmeldingen, IP-adressen, apparaten en handelingen met toegang. Wie het bestand krijgt, ziet waar en wanneer u zich aanmeldt. Bewaar het als een wachtwoord en stuur het niet door.')}</p>
      <p className='settings-muted'>{tr(
        `Перед вивантаженням сайт попросить підтвердити, що це ви. Можна до ${UITVOER_PER_UUR} разів на годину; про кожне вивантаження прийде сповіщення в центр сповіщень.`,
        `Vóór het exporteren vraagt de site te bevestigen dat u het bent. Tot ${UITVOER_PER_UUR} keer per uur; bij elke export komt een melding in het meldingencentrum.`)}</p>
      {keuze}
      {knop}
      {stand}
    </section>
  );
}
