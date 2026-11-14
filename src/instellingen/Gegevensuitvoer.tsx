// IDENTITEIT-014 (фаза 3, крок «uitvoer»): Налаштування → Акаунт → «Ваші дані». Вивантаження всіх даних облікового запису
// одним JSON-файлом (POST /api/owner/privacy/export). Сервер просить повторне підтвердження доступу (вікно відкриває
// platform/client сам) і дозволяє 5 вивантажень на годину. Файл зберігає браузер: сервер віддає звичайний JSON.
// Компактний варіант стоїть у блоці видалення облікового запису, де текст радить спершу вивантажити дані.
// Export van alle gegevens van het account als één JSON-bestand; bevestiging van toegang regelt de client; 5 per uur.
import { useState } from 'react';
import { Download, Loader2, ShieldAlert } from 'lucide-react';
import { api } from '../platform/client';
import { bewaarBlob } from '../platform/bestand-opslaan';
import { ecosystemTabContext } from '../tab-context';
import { UITVOER_PER_UUR, uitvoerWeigering, type Paar } from '../weigeringen';
import { alleenMens, geenAi } from '../menselijke-actie';
import './gegevensuitvoer.css';

type Lang = 'uk' | 'nl';
export const UITVOER_ROUTE = '/api/owner/privacy/export';
export const UITVOER_FORMAAT = 'mijn-ruimte-export-v1';
const ONBEKEND: Paar = ['Не вдалося вивантажити дані. Файл не створено — спробуйте ще раз за хвилину.', 'De gegevens konden niet worden geëxporteerd. Er is geen bestand gemaakt — probeer het over een minuut opnieuw.'];
const VREEMD: Paar = ['Сервер відповів не файлом вивантаження. Нічого не збережено — оновіть сторінку й спробуйте ще раз.', 'De server antwoordde niet met een exportbestand. Er is niets bewaard — ververs de pagina en probeer het opnieuw.'];

/** Тіло запиту: сеанс налаштувань (identity) цієї вкладки. Verzoek met de identity-sessie van dit tabblad. */
export const uitvoerAanvraag = (tabContext: string, origin: string) => ({ service: 'identity', tabContext, sourceOrigin: origin });
/** Назва файлу з датою (UTC), напр. mijn-ruimte-export-2026-11-14.json. */
export const uitvoerBestandsnaam = (nu: Date) => `mijn-ruimte-export-${nu.toISOString().slice(0, 10)}.json`;

export type UitvoerUitkomst = { ok: true; naam: string; bytes: number } | { ok: false; tekst: Paar };
export type UitvoerAfh = {
  post: (url: string, body: unknown) => Promise<{ data: unknown }>;
  bewaar: (naam: string, blob: Blob) => void;
  tabContext: string;
  origin: string;
  nu?: Date;
};

/** Чиста дія без React: запит, перевірка формату, збереження файлу; помилка → текст [uk, nl]. Zuivere handeling (testbaar). */
export async function gegevensUitvoeren(a: UitvoerAfh): Promise<UitvoerUitkomst> {
  let data: unknown;
  try { data = (await a.post(UITVOER_ROUTE, uitvoerAanvraag(a.tabContext, a.origin))).data; }
  catch (e) { return { ok: false, tekst: uitvoerWeigering(e) || ONBEKEND }; }
  if (!data || typeof data !== 'object' || (data as { formaat?: unknown }).formaat !== UITVOER_FORMAAT) return { ok: false, tekst: VREEMD };
  const inhoud = JSON.stringify(data, null, 2);
  const naam = uitvoerBestandsnaam(a.nu || new Date());
  a.bewaar(naam, new Blob([inhoud], { type: 'application/json' }));
  return { ok: true, naam, bytes: new TextEncoder().encode(inhoud).length };
}

const grootte = (lang: Lang, b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} ${lang === 'uk' ? 'КБ' : 'kB'}` : `${(b / 1048576).toFixed(1)} MB`);

export default function Gegevensuitvoer({ lang, compact = false }: { lang: Lang; compact?: boolean }) {
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [bezig, setBezig] = useState(false);
  const [uitkomst, setUitkomst] = useState<UitvoerUitkomst | null>(null);
  const start = alleenMens(() => {
    if (bezig) return;
    setBezig(true); setUitkomst(null);
    void gegevensUitvoeren({ post: (u, b) => api.post(u, b), bewaar: bewaarBlob, tabContext: ecosystemTabContext(), origin: location.origin })
      .then(setUitkomst)
      .finally(() => setBezig(false));
  });
  const knop = (
    <button type='button' className={compact ? 'gegevensuitvoer-knop' : 'settings-primary'} data-gegevensuitvoer-knop={compact ? 'compact' : 'vol'} disabled={bezig} aria-busy={bezig} onClick={start} {...geenAi}
      title={tr('Сайт попросить підтвердити, що це ви, і збереже файл на цьому пристрої. Нічого в обліковому записі не зміниться.', 'De site vraagt te bevestigen dat u het bent en bewaart het bestand op dit apparaat. Er verandert niets aan het account.')}>
      {bezig ? <Loader2 className='gegevensuitvoer-draai' aria-hidden='true' /> : <Download aria-hidden='true' />}
      {bezig ? tr('Готую файл…', 'Bestand wordt gemaakt…') : tr('Вивантажити мої дані (JSON)', 'Mijn gegevens exporteren (JSON)')}
    </button>
  );
  const stand = uitkomst && (
    <p className={uitkomst.ok ? 'settings-muted' : 'settings-honest-note'} role={uitkomst.ok ? 'status' : 'alert'} data-gegevensuitvoer-stand={uitkomst.ok ? 'ok' : 'fout'}>
      {uitkomst.ok
        ? tr(`Файл «${uitkomst.naam}» (${grootte(lang, uitkomst.bytes)}) збережено в завантаження цього пристрою.`, `Bestand «${uitkomst.naam}» (${grootte(lang, uitkomst.bytes)}) is bewaard bij de downloads van dit apparaat.`)
        : tr(uitkomst.tekst[0], uitkomst.tekst[1])}
    </p>
  );
  if (compact) return <div className='gegevensuitvoer-compact' data-gegevensuitvoer='compact'>{knop}{stand}</div>;
  return (
    <section id='gegevensuitvoer' data-gegevensuitvoer='vol'>
      <h3>{tr('Ваші дані', 'Uw gegevens')}</h3>
      <p className='settings-muted'>{tr(
        'Один файл JSON з усім, що сайт зберігає про ваш обліковий запис: профіль, робочі простори, блоки, сповіщення, налаштування й перелік файлів (без їхнього вмісту — його можна завантажити в хмарі). Паролі, ключі, токени й зашифровані поля у файл не потрапляють.',
        'Eén JSON-bestand met alles wat de site over uw account bewaart: profiel, werkruimtes, blokken, meldingen, instellingen en de lijst van bestanden (zonder inhoud — die downloadt u in de cloud). Wachtwoorden, sleutels, tokens en versleutelde velden komen er niet in.')}</p>
      <p className='settings-honest-note' data-gegevensuitvoer-waarschuwing='1'><ShieldAlert aria-hidden='true' /> {tr(
        '! У файл входить журнал безпеки: входи, IP-адреси, пристрої та дії з доступом. Хто отримає файл, побачить, звідки й коли ви входите. Зберігайте його як пароль і не пересилайте.',
        '! Het bestand bevat het beveiligingslogboek: aanmeldingen, IP-adressen, apparaten en handelingen met toegang. Wie het bestand krijgt, ziet waar en wanneer u zich aanmeldt. Bewaar het als een wachtwoord en stuur het niet door.')}</p>
      <p className='settings-muted'>{tr(
        `Перед вивантаженням сайт попросить підтвердити, що це ви. Можна до ${UITVOER_PER_UUR} разів на годину; про кожне вивантаження прийде сповіщення в центр сповіщень.`,
        `Vóór het exporteren vraagt de site te bevestigen dat u het bent. Tot ${UITVOER_PER_UUR} keer per uur; bij elke export komt een melding in het meldingencentrum.`)}</p>
      {knop}
      {stand}
    </section>
  );
}
