// IDENTITEIT-015 (крок apparaten-uitvoer): «Сесії та пристрої» → «Попереджати про новий пристрій».
// Вибір «Завжди / Вимкнено» (збережено в обліковому записі — однаково на всіх пристроях), перелік відомих пристроїв
// (app.bekende_apparaten) з позначками «Цей пристрій» і «Підтверджено вами», кнопки «Це був я» і «Забути пристрій».
// Вимкнення й «Забути» — через BevestigDialoog і повторне підтвердження доступу (вікно відкриває platform/client); сервер
// перевіряє права, пише аудит і надсилає сповіщення безпеки (backend/bekende-apparaten.ts). Запис у журналі безпеки про вхід
// з нового пристрою лишається завжди. Без прапорця власника `meldingen-uitleg-v3` спливне сповіщення не надходить — це сказано прямо.
// Keuze «Altijd / Uit» voor de waarschuwing bij een nieuw apparaat, lijst van bekende apparaten, «Dit was ik» en «Apparaat vergeten».
import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, CheckCircle2, Laptop, Trash2 } from 'lucide-react';
import { api } from './platform/client';
import { BevestigDialoog } from './platform/BevestigDialoog';
import { ecosystemTabContext } from './tab-context';
import { foutNaarTekst, type Paar } from './weigeringen';
import { alleenMens, geenAi } from './menselijke-actie';
import { apparaatTekst } from './ToegangContext';
import './bekende-apparaten.css';

type Lang = 'uk' | 'nl';
export type ApparaatKeuze = 'altijd' | 'uit';
export type BekendApparaat = { id: string; apparaat: string; eerstGezien: string; laatstGezien: string; bevestigdOp: string | null; ditApparaat: boolean };
export type ApparatenStand = { keuze: ApparaatKeuze; vlag: boolean; meldingActief: boolean; apparaten: BekendApparaat[] };
export const APPARATEN_ROUTES = {
  lijst: '/api/owner/identity/apparaten/lijst', melding: '/api/owner/identity/apparaten/melding',
  vergeten: '/api/owner/identity/apparaten/vergeten', bevestigen: '/api/owner/identity/apparaten/bevestigen',
} as const;
/** Точна передумова власника (де саме він вмикає прапорці). Exacte voorwaarde voor de eigenaar. */
export const VLAG_VOORWAARDE: Paar = [
  'Спливне сповіщення поки не надходить: потребує налаштування власника сайту. Власник вмикає технічний профіль → смуга технічного режиму → «Перемикачі функцій» → «Новий центр сповіщень» (meldingen-v2) і «Зрозумілі сповіщення й розмір панелі» (meldingen-uitleg-v3) для вашого облікового запису або для всіх. Доти нові пристрої все одно запам’ятовуються й записуються в журнал безпеки.',
  'Er komt nog geen melding: dit vraagt een instelling van de eigenaar van de site. De eigenaar zet het technische profiel aan → balk van de technische modus → «Functieschakelaars» → «Nieuw meldingencentrum» (meldingen-v2) en «Begrijpelijke meldingen en paneelgrootte» (meldingen-uitleg-v3) aan, voor uw account of voor iedereen. Tot dan worden nieuwe apparaten wel onthouden en in het beveiligingslogboek gezet.',
];
const ONBEKEND: Paar = ['Не вдалося виконати дію. Нічого не змінено — спробуйте ще раз.', 'De handeling is niet gelukt. Er is niets gewijzigd — probeer het opnieuw.'];

const codeVan = (e: unknown) => { const f = (e ?? {}) as { message?: unknown; response?: { data?: { error?: unknown } } }; return String(f.response?.data?.error || f.message || ''); };
/** Тексти відмов цього блоку; решта (step-up, мережа) — foutNaarTekst. Eigen weigeringen; de rest via foutNaarTekst. */
export function apparatenWeigering(e: unknown): Paar {
  const code = codeVan(e);
  if (code === 'RATE_LIMITED') {
    const f = (e ?? {}) as { retryAfter?: unknown; response?: { data?: { retryAfter?: unknown } } };
    const m = Math.ceil(Number(f.retryAfter ?? f.response?.data?.retryAfter ?? 0) / 60);
    return [`Забагато змін за годину — нічого не змінено. Спробуйте ${m > 0 ? `через ~${m} хв` : 'пізніше'}.`, `Te veel wijzigingen in een uur — er is niets gewijzigd. Probeer het ${m > 0 ? `over ~${m} min.` : 'later'} opnieuw.`];
  }
  if (code === 'APPARAAT_ONBEKEND') return ['Цього пристрою вже немає в переліку (можливо, його забуто в іншій вкладці). Перелік оновлено.', 'Dit apparaat staat niet meer in de lijst (misschien vergeten in een ander tabblad). De lijst is ververst.'];
  if (code === 'OWNER_IDENTITY_SESSION_REQUIRED' || code === 'ACCOUNT_NOT_APPROVED') return ['Сеанс налаштувань закінчився або обліковий запис ще не схвалено. Увійдіть знову.', 'De sessie van de instellingen is verlopen of het account is nog niet goedgekeurd. Meld u opnieuw aan.'];
  return foutNaarTekst(e) || ONBEKEND;
}

const context = () => ({ service: 'identity', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
type Post = (url: string, body: unknown) => Promise<{ data: unknown }>;
const standVan = (d: unknown): ApparatenStand => {
  const x = (d || {}) as Partial<ApparatenStand>;
  return { keuze: x.keuze === 'uit' ? 'uit' : 'altijd', vlag: x.vlag === true, meldingActief: x.meldingActief === true, apparaten: Array.isArray(x.apparaten) ? x.apparaten : [] };
};
/** Zuivere handelingen (testbaar zonder React). */
export const apparatenActies = (post: Post) => ({
  lijst: async () => standVan((await post(APPARATEN_ROUTES.lijst, context())).data),
  keuze: async (keuze: ApparaatKeuze) => standVan((await post(APPARATEN_ROUTES.melding, { ...context(), keuze })).data),
  vergeten: async (id: string) => standVan((await post(APPARATEN_ROUTES.vergeten, { ...context(), id })).data),
  bevestigen: async (id: string) => standVan((await post(APPARATEN_ROUTES.bevestigen, { ...context(), id })).data),
});

export default function BekendeApparaten({ lang, beginStand = null, post = (u, b) => api.post(u, b) }: { lang: Lang; beginStand?: ApparatenStand | null; post?: Post }) {
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [stand, setStand] = useState<ApparatenStand | null>(beginStand);
  const [fout, setFout] = useState<Paar | null>(null);
  const [melding, setMelding] = useState('');
  const [bezig, setBezig] = useState(false);
  const [vraagUit, setVraagUit] = useState(false);
  const [vergeetVraag, setVergeetVraag] = useState<BekendApparaat | null>(null);
  const loopt = useRef(false); // повторне натискання під час запиту нічого не надсилає вдруге
  const acties = useRef(apparatenActies(post)).current;
  const doe = useCallback(async (f: () => Promise<ApparatenStand>, gelukt?: (s: ApparatenStand) => string) => {
    if (loopt.current) return;
    loopt.current = true; setBezig(true); setFout(null); setMelding('');
    try { const s = await f(); setStand(s); if (gelukt) setMelding(gelukt(s)); }
    catch (e) { setFout(apparatenWeigering(e)); if (codeVan(e) === 'APPARAAT_ONBEKEND') { try { setStand(await acties.lijst()); } catch { /* blijft */ } } }
    finally { loopt.current = false; setBezig(false); }
  }, [acties]);
  useEffect(() => { if (!beginStand) void doe(() => acties.lijst()); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const tijd = (v: string) => new Date(v).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'medium', timeStyle: 'short' });
  const keuze = stand?.keuze || 'altijd';
  // Посилання зі сповіщення (…/sessions?apparaat=<id>) підсвічує саме той пристрій. Link uit de melding markeert dat apparaat.
  const uitMelding = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('apparaat') || '' : '';
  const kies = (k: ApparaatKeuze) => {
    if (k === keuze || bezig) return;
    if (k === 'uit') { setVraagUit(true); return; }
    void doe(() => acties.keuze('altijd'), () => tr('Попередження про новий пристрій увімкнено.', 'De waarschuwing voor een nieuw apparaat staat aan.'));
  };
  return <section className='sessies-nieuw-apparaat' id='sessies-nieuw-apparaat' data-nieuw-apparaat={keuze} aria-busy={bezig}>
    <h3><BellRing aria-hidden='true' />{tr('Попереджати про новий пристрій', 'Waarschuwen bij een nieuw apparaat')}</h3>
    <p className='settings-muted'>{tr('Після входу з браузера, якого ще немає серед відомих, у центрі сповіщень з’являється попередження з пристроєм, регіоном і часом. Вибір зберігається в обліковому записі й діє на всіх пристроях.', 'Na een aanmelding vanaf een browser die nog niet bij de bekende hoort, verschijnt in het meldingencentrum een waarschuwing met apparaat, regio en tijd. De keuze wordt in het account bewaard en geldt op alle apparaten.')}</p>
    <fieldset className='nieuw-apparaat-keuze' disabled={bezig || !stand} data-nieuw-apparaat-keuze={keuze}>
      <legend>{tr('Попередження', 'Waarschuwing')}</legend>
      <label data-keuze='altijd'><input type='radio' name='nieuw-apparaat-keuze' value='altijd' checked={keuze === 'altijd'} onChange={alleenMens(() => kies('altijd'))} {...geenAi} />
        <span><strong>{tr('Завжди', 'Altijd')}</strong><small>{tr('Рекомендовано. Чужий вхід ви побачите одразу й зможете завершити його в «Сесіях».', 'Aanbevolen. Een vreemde aanmelding ziet u meteen en u kunt haar beëindigen bij «Sessies».')}</small></span></label>
      <label data-keuze='uit' className='nieuw-apparaat-risico'><input type='radio' name='nieuw-apparaat-keuze' value='uit' checked={keuze === 'uit'} onChange={alleenMens(() => kies('uit'))} {...geenAi} />
        <span><strong><span className='nieuw-apparaat-uitroep' aria-hidden='true'>!</span>{tr('Вимкнено', 'Uit')}</strong><small>{tr('Ризик: якщо хтось увійде з вашим Google чи кодом на іншому пристрої, ви не отримаєте сповіщення й можете не помітити чужого входу. Подія все одно потрапить у журнал безпеки. Вимкнення потребує підтвердження доступу.', 'Risico: meldt iemand zich met uw Google of code aan op een ander apparaat, dan krijgt u geen melding en ziet u de vreemde aanmelding misschien niet. De gebeurtenis komt wel in het beveiligingslogboek. Uitzetten vraagt bevestiging van toegang.')}</small></span></label>
    </fieldset>
    {stand && !stand.vlag && keuze === 'altijd' && <p className='settings-honest-note' data-nieuw-apparaat-voorwaarde='vlag'>{tr(VLAG_VOORWAARDE[0], VLAG_VOORWAARDE[1])}</p>}
    {stand && keuze === 'uit' && <p className='settings-honest-note' data-nieuw-apparaat-voorwaarde='uit'>{tr('Попередження вимкнено: нові входи лише записуються в журнал безпеки.', 'De waarschuwing staat uit: nieuwe aanmeldingen komen alleen in het beveiligingslogboek.')}</p>}
    {melding && <p className='sessies-melding' role='status'>{melding}</p>}
    {fout && <p className='settings-honest-note' role='alert' data-nieuw-apparaat-fout>{tr(fout[0], fout[1])}</p>}
    <h4>{tr('Відомі пристрої', 'Bekende apparaten')}</h4>
    {!stand ? <div className='security-empty'>{tr('Завантаження…', 'Laden…')}</div>
      : stand.apparaten.length ? <ul className='bekende-apparaten-lijst' data-bekende-apparaten={stand.apparaten.length}>{stand.apparaten.map((a) => <li key={a.id} data-bekend-apparaat={a.id} data-dit-apparaat={a.ditApparaat ? '1' : undefined} data-uit-melding={uitMelding === a.id ? '1' : undefined}>
        <span className='security-device-icon'><Laptop aria-hidden='true' /></span>
        <div className='bekend-apparaat-tekst'>
          <strong>{apparaatTekst(lang, a.apparaat || null)}{a.ditApparaat && <em className='bekend-apparaat-dit'>{tr('Цей пристрій', 'Dit apparaat')}</em>}</strong>
          <small>{tr(`Уперше: ${tijd(a.eerstGezien)} · востаннє: ${tijd(a.laatstGezien)}`, `Eerst: ${tijd(a.eerstGezien)} · laatst: ${tijd(a.laatstGezien)}`)}</small>
          <small data-bevestigd={a.bevestigdOp ? '1' : '0'}>{a.bevestigdOp ? <><CheckCircle2 aria-hidden='true' />{tr(`Підтверджено вами ${tijd(a.bevestigdOp)}`, `Door u bevestigd ${tijd(a.bevestigdOp)}`)}</> : tr('Ще не підтверджено', 'Nog niet bevestigd')}</small>
        </div>
        <div className='bekend-apparaat-acties'>
          {!a.bevestigdOp && <button type='button' className='sessies-secundair' data-apparaat-bevestigen={a.id} disabled={bezig} {...geenAi} onClick={alleenMens(() => void doe(() => acties.bevestigen(a.id), () => tr('Позначено: це були ви.', 'Gemarkeerd: dit was u.')))}
            title={tr('Позначити цей пристрій як ваш. Нічого не завершує й не видаляє.', 'Dit apparaat als het uwe markeren. Beëindigt en verwijdert niets.')}>{tr('Це був я', 'Dit was ik')}</button>}
          <button type='button' className='security-revoke' data-apparaat-vergeten={a.id} disabled={bezig} {...geenAi} onClick={alleenMens(() => setVergeetVraag(a))}
            title={tr('Пристрій зникне з відомих: наступний вхід із нього знову дасть попередження. Сеанси на ньому не завершуються.', 'Het apparaat verdwijnt uit de bekende: de volgende aanmelding ermee geeft weer een waarschuwing. Sessies erop worden niet beëindigd.')}><Trash2 aria-hidden='true' />{tr('Забути пристрій', 'Apparaat vergeten')}</button>
        </div>
      </li>)}</ul>
      : <div className='security-empty' data-bekende-apparaten='0'>{tr('Відомих пристроїв ще немає: перший вхід запам’ятовується тихо, наступні нові — з попередженням.', 'Nog geen bekende apparaten: de eerste aanmelding wordt stil onthouden, volgende nieuwe met een waarschuwing.')}</div>}
    <BevestigDialoog open={vraagUit} id='nieuw-apparaat-uit' lang={lang} gevaarlijk bezig={bezig}
      titel={tr('Вимкнути попередження про новий пристрій?', 'Waarschuwing voor een nieuw apparaat uitzetten?')}
      uitleg={tr('Після вимкнення вхід із невідомого пристрою не дасть спливного сповіщення.', 'Na het uitzetten geeft een aanmelding vanaf een onbekend apparaat geen melding meer.')}
      gevolgen={[tr('Чужий вхід можна помітити лише в «Сесіях» або в журналі безпеки.', 'Een vreemde aanmelding ziet u alleen nog bij «Sessies» of in het beveiligingslogboek.'), tr('Запис у журналі безпеки про кожен новий пристрій лишається.', 'De regel in het beveiligingslogboek voor elk nieuw apparaat blijft.'), tr('Про саме вимкнення прийде сповіщення безпеки.', 'Over het uitzetten zelf komt een beveiligingsmelding.')]}
      bevestigTekst={tr('Так, вимкнути', 'Ja, uitzetten')}
      onAnnuleer={() => setVraagUit(false)}
      onBevestig={async () => { await doe(() => acties.keuze('uit'), () => tr('Попередження вимкнено. Увімкнути знову можна тут же.', 'De waarschuwing staat uit. Weer aanzetten kan hier.')); setVraagUit(false); }} />
    <BevestigDialoog open={!!vergeetVraag} id='apparaat-vergeten' lang={lang} gevaarlijk bezig={bezig}
      titel={tr('Забути цей пристрій?', 'Dit apparaat vergeten?')}
      uitleg={vergeetVraag ? tr(`«${apparaatTekst('uk', vergeetVraag.apparaat || null)}» зникне з відомих пристроїв.`, `«${apparaatTekst('nl', vergeetVraag.apparaat || null)}» verdwijnt uit de bekende apparaten.`) : ''}
      gevolgen={[tr('Наступний вхід із нього знову дасть попередження про новий пристрій.', 'De volgende aanmelding ermee geeft weer een waarschuwing voor een nieuw apparaat.'), tr('Відкриті сеанси на ньому не завершуються — це робиться в переліку сесій вище.', 'Open sessies erop worden niet beëindigd — dat gebeurt in de lijst van sessies hierboven.')]}
      bevestigTekst={tr('Так, забути', 'Ja, vergeten')}
      onAnnuleer={() => setVergeetVraag(null)}
      onBevestig={async () => { const a = vergeetVraag; if (!a) return; await doe(() => acties.vergeten(a.id), () => tr('Пристрій забуто.', 'Het apparaat is vergeten.')); setVergeetVraag(null); }} />
  </section>;
}
