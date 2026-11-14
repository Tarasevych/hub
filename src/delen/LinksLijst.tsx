// IDENTITEIT-015 (крок «delen»): «Відкриті посилання» простору й вибір строку/адреси для нового посилання.
// Open uitnodigingslinks van een werkruimte (alleen voor eigenaar/beheerder; de server controleert opnieuw), elk met rol, adres,
// einddatum en «Відкликати» na een bevestigingsvenster. De code zelf komt nooit in de browser: de lijst toont 4 tekens + «…».
// Одна складова для hub-модалки й центру налаштувань.
import { useEffect, useId, useRef, useState } from 'react';
import { BevestigDialoog } from '../platform/BevestigDialoog';
import { LINK_DAGEN, dagenTekst, type LinkDagen } from '../../shared/deel-links';
import { linkIntrekkenLabel, linkIntrekkenVraag, linkOmschrijving, rolNaam, type OpenLink } from './delen-logica';
import './delen.css';

type Lang = 'uk' | 'nl';

export function LinksLijst(p: { lang: Lang; links: OpenLink[]; mag: boolean; bezig?: boolean; onIntrekken: (id: string) => Promise<unknown> | void }) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const [doel, setDoel] = useState<OpenLink | null>(null);
  const lijstRef = useRef<HTMLDivElement>(null);
  /* IDENTITEIT-015 (рецензія delen): рядок після відкликання зникає разом із кнопкою, на яку діалог повернув фокус, — ставимо фокус
     на наступну кнопку «Відкликати» (або попередню), а якщо посилань не лишилося — на сам перелік, щоб він не падав на body.
     Робимо це ПІСЛЯ того, як React прибрав рядок (ефект на зміну переліку), а не за таймером — інакше гонка з оновленням. */
  const wacht = useRef<{ id: string; index: number } | null>(null);
  useEffect(() => {
    const w = wacht.current, lijst = lijstRef.current;
    if (!w || !lijst || p.links.some((l) => l.id === w.id)) return;
    wacht.current = null;
    const knoppen = [...lijst.querySelectorAll<HTMLButtonElement>('button[data-link-intrekken]')];
    (knoppen[Math.min(w.index, knoppen.length - 1)] || lijst).focus();
  }, [p.links]);
  if (!p.mag) return null;
  const vraag = doel ? linkIntrekkenVraag(p.lang, doel) : null;
  return (
    <div className='delen-links-lijst' data-delen-links={p.links.length} ref={lijstRef} tabIndex={-1} aria-label={t('Відкриті посилання', 'Open links')}>
      {!p.links.length && <p className='hint delen-leeg'>{t('Відкритих посилань немає. Використані, прострочені й відкликані посилання тут не показуються.', 'Er zijn geen open links. Gebruikte, verlopen en ingetrokken links staan hier niet.')}</p>}
      {p.links.map((l) => (
        <article key={l.id} className='share-member-row delen-lid' data-link-id={l.id} data-link-werkt={l.werkt === false ? 'nee' : 'ja'}>
          <div>
            <strong>{l.code} · {rolNaam(p.lang, l.workspaceRole)}</strong>
            <small>{linkOmschrijving(p.lang, l)}</small>
          </div>
          <div className='delen-lid-acties'>
            <button type='button' className='ghost' data-link-intrekken='1' disabled={p.bezig} aria-label={linkIntrekkenLabel(p.lang, l)} title={t('Посилання перестане діяти одразу; учасників, які вже приєдналися, це не змінює.', 'De link werkt meteen niet meer; leden die al aansloten, blijven.')} onClick={() => setDoel(l)}>{t('Відкликати', 'Intrekken')}</button>
          </div>
        </article>
      ))}
      <BevestigDialoog open={!!doel} id='deel-link-intrekken' lang={p.lang} gevaarlijk bezig={p.bezig}
        titel={vraag?.titel || ''} uitleg={vraag?.uitleg} gevolgen={vraag?.gevolgen} bevestigTekst={vraag?.bevestigTekst || ''}
        onAnnuleer={() => setDoel(null)} onBevestig={async () => {
          const d = doel; setDoel(null); if (!d) return;
          wacht.current = { id: d.id, index: Math.max(0, p.links.findIndex((x) => x.id === d.id)) };
          await p.onIntrekken(d.id);
          // не вдалося (рядок лишився) — фокус уже на його кнопці; більше не чекаємо
          requestAnimationFrame(() => { if (wacht.current?.id === d.id && lijstRef.current?.querySelector(`[data-link-id="${d.id}"]`)) wacht.current = null; });
        }} />
    </div>
  );
}

/** Keuze van de looptijd (1/7/30 dagen) en optioneel het adres waarvoor de link alleen werkt. */
export function LinkOpties(p: { lang: Lang; dagen: LinkDagen; onDagen: (d: LinkDagen) => void; email: string; onEmail: (e: string) => void; uit?: boolean }) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const id = useId();
  /* IDENTITEIT-015 (рецензія delen): підказки видимі (на дотикових екранах title не показується) і пов'язані з полями (aria-describedby) */
  return (
    <div className='delen-link-opties'>
      <label>{t('Строк дії', 'Geldig')}
        <select value={p.dagen} disabled={p.uit} aria-describedby={`${id}-dagen`} onChange={(e) => p.onDagen(Number(e.target.value) as LinkDagen)}>
          {LINK_DAGEN.map((d) => <option key={d} value={d}>{dagenTekst(p.lang, d)}</option>)}
        </select>
        <small id={`${id}-dagen`} className='delen-link-hint'>{t('Після цього строку посилання перестане діяти, навіть якщо ним ніхто не скористався.', 'Daarna werkt de link niet meer, ook als niemand hem gebruikte.')}</small>
      </label>
      <label>{t('Лише для адреси (необов’язково)', 'Alleen voor adres (optioneel)')}
        <input type='email' value={p.email} disabled={p.uit} placeholder={t('будь-хто з посиланням', 'iedereen met de link')} aria-describedby={`${id}-adres`} onChange={(e) => p.onEmail(e.target.value)} />
        <small id={`${id}-adres`} className='delen-link-hint'>{t('З адресою посилання спрацює лише після входу з нею; іншим воно доступу не дасть.', 'Met een adres werkt de link alleen na aanmelden met dat adres; anderen krijgen er geen toegang mee.')}</small>
      </label>
    </div>
  );
}
