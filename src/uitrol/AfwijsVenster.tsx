// SEC-PAKKET-001 · Вікно відхилення пакета (власник 16.11.2026: «зроби це вікно дизайнерськи, з прикладами та швидкими діями вставки»;
// далі: «список виглядає наче тут накидали кнопки… треба реально круто й модерно»).
// Причини — сітка плиток: кольорова піктограма, назва, короткий підпис і кружок вибору; знахідки перевірки сайту — окремою широкою
// плиткою «Рекомендовано». Один дотик вставляє причину в поле, ще один прибирає. Правило причини те саме, що й на сервері (afwijsReden).
// Afwijsvenster: redenen als tegels (gekleurd icoon, titel, korte regel, keuzerondje); bevindingen van de voorcontrole als brede
// tegel «Aanbevolen». Eén tik voegt in, nog een tik haalt weg. Zelfde regel als de server.
import { useId, useRef, type CSSProperties } from 'react';
import { ArrowLeft, Bell, Check, CircleCheck, Clock, Copy, Eraser, FlaskConical, Github, History, MessageCircleQuestion, OctagonX, PackageX, PenLine, Plus, ShieldAlert, Sparkles, type LucideIcon } from 'lucide-react';
import { zonderUitleg, rodeVlaggen } from './RodeVlaggen';
import { tr, type Lang, type Voorstel } from './types';

/** Те саме правило, що й на сервері (afwijsReden): щонайменше 2 літери чи цифри. Zelfde regel als de server. */
export const afwijsRedenGeldig = (r: string) => [...r.replace(/[^\p{L}\p{N}]/gu, '')].length >= 2;
export const AFWIJS_MAX = 500;
const SCHEIDING = '; ';

/** 1 зміна · 2 зміни · 5 змін. */
const zmin = (n: number) => { const d = n % 10, h = n % 100; return d === 1 && h !== 11 ? 'зміна' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'зміни' : 'змін'; };

type T2 = [string, string];
/** kleur: відтінок плитки (hex), з нього CSS змішує тло й рамку для світлої та темної теми. Tint van de tegel. */
export type Snel = { id: string; icoon: LucideIcon; kleur: string; label: T2; kort: T2; tekst: T2; uitleg: T2; voorstel?: boolean };

/** Готові причини. Перші — з перевірки сайту (якщо вона щось знайшла), далі загальні. Snelle redenen; eerst die uit de voorcontrole. */
export function snelleRedenen(v: Pick<Voorstel, 'tests' | 'voorcontrole'>): Snel[] {
  const uit: Snel[] = [];
  const zonder = (rodeVlaggen(v.voorcontrole) || []).filter(zonderUitleg).length;
  if (zonder > 0) uit.push({ id: 'zonder-uitleg', icoon: ShieldAlert, kleur: '#d97706', voorstel: true,
    label: [`${zonder} ${zmin(zonder)} без пояснення`, `${zonder} ${zonder === 1 ? 'wijziging' : 'wijzigingen'} zonder uitleg`],
    kort: ['Автор не пояснив ризиковані зміни', 'De maker legde risicovolle wijzigingen niet uit'],
    tekst: [`Ризиковані зміни без пояснення автора (${zonder})`, `Risicovolle wijzigingen zonder uitleg van de maker (${zonder})`],
    uitleg: ['Перевірка сайту знайшла ризиковані зміни, які автор не пояснив. Вставити це як причину.', 'De voorcontrole vond risicovolle wijzigingen zonder uitleg van de maker. Als reden invoegen.'] });
  const mislukt = Number(v.tests?.mislukt || 0);
  if (mislukt > 0) uit.push({ id: 'tests', icoon: FlaskConical, kleur: '#7c3aed', voorstel: true,
    label: [`Тести: ${mislukt} з помилками`, `Tests: ${mislukt} mislukt`],
    kort: ['Так зазначив сам автор', 'Zo meldt de maker zelf'],
    tekst: [`Тести не пройшли (${mislukt} з помилками)`, `Tests mislukt (${mislukt})`],
    uitleg: ['Автор сам зазначив, що частина тестів не пройшла. Вставити це як причину.', 'De maker meldt zelf mislukte tests. Als reden invoegen.'] });
  uit.push(
    { id: 'niet-besteld', icoon: PackageX, kleur: '#e11d48', label: ['Не замовляв', 'Niet besteld'], kort: ['Прийшов без запиту', 'Kwam zonder verzoek'],
      tekst: ['Не замовляв це оновлення', 'Deze update niet besteld'],
      uitleg: ['Пакет з’явився без вашого запиту — найчастіша причина відхилити одразу.', 'Het pakket kwam zonder uw verzoek — de meest voorkomende reden om meteen af te wijzen.'] },
    { id: 'uitleg', icoon: MessageCircleQuestion, kleur: '#2563eb', label: ['Чекаю пояснення', 'Wacht op uitleg'], kort: ['Автор допише й надішле знову', 'Maker vult aan en stuurt opnieuw'],
      tekst: ['Чекаю пояснення від автора', 'Wacht op uitleg van de maker'],
      uitleg: ['Автор побачить це в сповіщенні й на GitHub і зможе надіслати новий пакет із поясненням.', 'De maker ziet dit in de melding en op GitHub en kan een nieuw pakket met uitleg sturen.'] },
    ...(zonder > 0 ? [] : [{ id: 'risico', icoon: ShieldAlert, kleur: '#d97706', label: ['Ризиковані зміни', 'Risicovol'] as T2, kort: ['Прапорці не переконали', 'Vlaggen overtuigen niet'] as T2,
      tekst: ['Ризиковані зміни, яких я не розумію', 'Risicovolle wijzigingen die ik niet begrijp'] as T2,
      uitleg: ['Якщо червоні прапорці вас не переконали.', 'Als de rode vlaggen u niet overtuigen.'] as T2 }]),
    ...(mislukt > 0 ? [] : [{ id: 'tests', icoon: FlaskConical, kleur: '#7c3aed', label: ['Тести', 'Tests'] as T2, kort: ['Не пройшли чи не запускались', 'Mislukt of niet gedraaid'] as T2,
      tekst: ['Тести не пройшли або не запускались', 'Tests mislukt of niet gedraaid'] as T2,
      uitleg: ['Для випадку, коли ви не довіряєте результатам тестів або їх немає.', 'Als u de testresultaten niet vertrouwt of ze ontbreken.'] as T2 }]),
    { id: 'oud', icoon: History, kleur: '#0d9488', label: ['Застаріла', 'Verouderd'], kort: ['Вже є новіша версія', 'Er is al een nieuwere'],
      tekst: ['Застаріла версія, є новіша', 'Verouderde versie, er is een nieuwere'],
      uitleg: ['Коли вже є свіжіший пакет і цей більше не потрібен.', 'Als er al een nieuwer pakket is.'] },
    { id: 'dubbel', icoon: Copy, kleur: '#0891b2', label: ['Дублікат', 'Dubbel'], kort: ['Цей пакет уже надсилали', 'Dit pakket kwam al eerder'],
      tekst: ['Дублікат уже надісланого пакета', 'Dubbel van een al gestuurd pakket'],
      uitleg: ['Той самий пакет прийшов удруге.', 'Hetzelfde pakket kwam een tweede keer.'] },
    { id: 'later', icoon: Clock, kleur: '#64748b', label: ['Не зараз', 'Niet nu'], kort: ['Нехай надішле пізніше', 'Later opnieuw sturen'],
      tekst: ['Не зараз, нехай автор надішле пізніше', 'Niet nu, de maker stuurt later opnieuw'],
      uitleg: ['Відхилення не можна скасувати: пакет буде видалено, і автор надішле його знову.', 'Afwijzen is definitief: het pakket wordt verwijderd en de maker stuurt het opnieuw.'] },
  );
  return uit;
}

const delen = (t: string) => t.split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean);
/** Вставити або прибрати готову причину. Invoegen of weghalen. */
export function wisselReden(huidig: string, tekst: string): string {
  const d = delen(huidig);
  const i = d.findIndex((x) => x.toLowerCase() === tekst.toLowerCase());
  if (i >= 0) d.splice(i, 1); else d.push(tekst);
  return d.join(SCHEIDING).slice(0, AFWIJS_MAX);
}

type Props = { lang: Lang; v: Voorstel; reden: string; setReden: (r: string) => void; busy: boolean; onAfwijzen: (reden: string) => void; onTerug: () => void };

export default function AfwijsVenster({ lang, v, reden, setReden, busy, onAfwijzen, onTerug }: Props) {
  const ids = useId(); const veld = useRef<HTMLTextAreaElement>(null);
  const L = lang === 'nl' ? 1 : 0;
  const snel = snelleRedenen(v);
  const gekozen = new Set(delen(reden).map((x) => x.toLowerCase()));
  const aantal = snel.filter((s) => gekozen.has(s.tekst[L].toLowerCase())).length;
  const geldig = afwijsRedenGeldig(reden);
  const lengte = [...reden].length;
  const waar: [LucideIcon, T2, T2][] = [
    [History, ['Історія', 'Geschiedenis'], ['Причина назавжди лишиться в історії оновлень разом із вашим іменем, e-mail і часом.', 'De reden blijft in de updategeschiedenis met uw naam, e-mail en tijd.']],
    [Bell, ['Вам і автору', 'U en de maker'], ['Сповіщення в центрі сповіщень отримаєте ви й автор пакета.', 'U en de maker van het pakket krijgen een melding in het meldingencentrum.']],
    [Github, ['GitHub', 'GitHub'], ['Коментар біля коміту пакета на GitHub: версія, причина, хто й коли. E-mail там частково приховано, бо сховище публічне.', 'Commentaar bij de commit op GitHub: versie, reden, wie en wanneer. E-mail half verborgen, want de repository is openbaar.']],
  ];
  const tegel = (s: Snel) => { const aan = gekozen.has(s.tekst[L].toLowerCase()); const I = s.icoon;
    return <button key={s.id} type='button' className='ut-afwijs-tegel' data-voorstel={s.voorstel || undefined} aria-pressed={aan} disabled={busy}
      style={{ '--h': s.kleur } as CSSProperties}
      title={`${s.uitleg[L]} ${aan ? tr(lang, 'Натисніть ще раз, щоб прибрати.', 'Nog eens tikken om weg te halen.') : ''}`.trim()}
      onClick={() => setReden(wisselReden(reden, s.tekst[L]))}>
      <span className='ut-afwijs-tegel-icoon' aria-hidden='true'><I /></span>
      <span className='ut-afwijs-tegel-tekst'>
        {s.voorstel && <span className='ut-afwijs-aanbevolen'><Sparkles aria-hidden='true' />{tr(lang, 'Знайшла перевірка сайту', 'Gevonden door de voorcontrole')}</span>}
        <strong>{s.label[L]}</strong><small>{s.kort[L]}</small></span>
      <span className='ut-afwijs-tegel-keuze' aria-hidden='true'>{aan ? <Check /> : s.voorstel ? <Plus /> : null}</span>
    </button>; };
  const voorstellen = snel.filter((s) => s.voorstel); const overige = snel.filter((s) => !s.voorstel);
  return <div className='ut-afwijs' role='group' aria-labelledby={`${ids}-t`} data-afwijzen-voorstel={v.id}>
    <header className='ut-afwijs-kop'>
      <span className='ut-afwijs-icoon' aria-hidden='true'><OctagonX /></span>
      <div><h4 id={`${ids}-t`}>{tr(lang, 'Відхилити версію ', 'Versie ')}<span className='ut-mono'>{v.versie}</span>{tr(lang, '?', ' afwijzen?')}</h4>
        <p>{tr(lang, 'Пакет не встановиться й буде видалений. Скажіть чому — хоч одним словом.', 'Het pakket wordt niet geïnstalleerd en verwijderd. Zeg waarom — één woord mag.')}</p></div>
    </header>
    {voorstellen.length > 0 && <div className='ut-afwijs-aanbevolen-rij'>{voorstellen.map(tegel)}</div>}
    <div className='ut-afwijs-sectie'>
      <div className='ut-afwijs-sectie-kop'><span>{tr(lang, 'Оберіть причину', 'Kies een reden')}</span>
        {aantal > 0 && <span className='ut-afwijs-gekozen'>{tr(lang, `вибрано ${aantal}`, `${aantal} gekozen`)}</span>}</div>
      <div className='ut-afwijs-raster'>{overige.map(tegel)}</div>
    </div>
    <div className='ut-afwijs-veld' data-geldig={geldig || undefined}>
      <label className='ut-afwijs-veld-kop' htmlFor={`${ids}-r`}><PenLine aria-hidden='true' />{tr(lang, 'Або своїми словами', 'Of in eigen woorden')}</label>
      <textarea ref={veld} id={`${ids}-r`} rows={2} maxLength={AFWIJS_MAX} required aria-required='true' aria-describedby={`${ids}-s`} value={reden} disabled={busy}
        onChange={(e) => setReden(e.target.value)} placeholder={tr(lang, 'Наприклад: незрозумілий rm -rf у скрипті', 'Bijvoorbeeld: onduidelijke rm -rf in het script')} />
      <div className='ut-afwijs-voet'>
        <span id={`${ids}-s`} className='ut-afwijs-stand' aria-live='polite'>{geldig
          ? <><CircleCheck aria-hidden='true' />{tr(lang, 'Причину вказано', 'Reden ingevuld')}</>
          : <>{tr(lang, 'Потрібне хоч одне слово', 'Minstens één woord nodig')}</>}</span>
        <span className='ut-afwijs-teller' data-bijna={lengte > AFWIJS_MAX - 50 || undefined}>{lengte}/{AFWIJS_MAX}</span>
        {reden && <button type='button' className='ut-afwijs-wis' disabled={busy} onClick={() => { setReden(''); veld.current?.focus(); }}
          title={tr(lang, 'Очистити поле причини. Нічого не відхиляє.', 'Het redenveld leegmaken. Wijst niets af.')} aria-label={tr(lang, 'Очистити причину', 'Reden wissen')}><Eraser aria-hidden='true' /></button>}
      </div>
    </div>
    <ul className='ut-afwijs-waar' aria-label={tr(lang, 'Куди піде причина', 'Waar de reden heen gaat')}>
      {waar.map(([I, l, t]) => <li key={l[1]} title={t[L]}><I aria-hidden='true' /><span>{l[L]}</span><span className='ut-sr'>: {t[L]}</span></li>)}
    </ul>
    <div className='ut-afwijs-acties'>
      <button type='button' className='ut-knop ut-knop-gevaar ut-afwijs-ja' disabled={busy || !geldig}
        title={geldig ? tr(lang, 'Відхилити остаточно: пакет видаляється, автор і GitHub отримують причину. Скасувати не можна.', 'Definitief afwijzen: pakket verwijderd, maker en GitHub krijgen de reden. Kan niet ongedaan.') : tr(lang, 'Спершу вкажіть причину — хоч одне слово або плитку вище.', 'Geef eerst een reden — één woord of een tegel hierboven.')}
        onClick={() => onAfwijzen(reden.replace(/\s+/g, ' ').trim().slice(0, AFWIJS_MAX))}><OctagonX aria-hidden='true' />{tr(lang, 'Відхилити версію', 'Versie afwijzen')}</button>
      <button type='button' className='ut-knop ut-afwijs-terug' disabled={busy} onClick={onTerug}
        title={tr(lang, 'Закрити це вікно й нічого не відхиляти: пакет і далі чекатиме вашого рішення.', 'Dit venster sluiten zonder af te wijzen: het pakket blijft op uw beslissing wachten.')}><ArrowLeft aria-hidden='true' />{tr(lang, 'Назад, не відхиляти', 'Terug, niet afwijzen')}</button>
    </div>
  </div>;
}
