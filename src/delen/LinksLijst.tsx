// IDENTITEIT-015 (крок «delen»): «Відкриті посилання» простору й вибір строку/адреси для нового посилання.
// Open uitnodigingslinks van een werkruimte (alleen voor eigenaar/beheerder; de server controleert opnieuw), elk met rol, adres,
// einddatum en «Відкликати» na een bevestigingsvenster. De code zelf komt nooit in de browser: de lijst toont 4 tekens + «…».
// Одна складова для hub-модалки й центру налаштувань.
import { useState } from 'react';
import { BevestigDialoog } from '../platform/BevestigDialoog';
import { LINK_DAGEN, dagenTekst, vervalTekst, type LinkDagen } from '../../shared/deel-links';
import { linkIntrekkenVraag, rolNaam, type OpenLink } from './delen-logica';
import './delen.css';

type Lang = 'uk' | 'nl';

export function LinksLijst(p: { lang: Lang; links: OpenLink[]; mag: boolean; bezig?: boolean; onIntrekken: (id: string) => Promise<unknown> | void }) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const [doel, setDoel] = useState<OpenLink | null>(null);
  if (!p.mag) return null;
  const vraag = doel ? linkIntrekkenVraag(p.lang, doel) : null;
  return (
    <div className='delen-links-lijst' data-delen-links={p.links.length}>
      {!p.links.length && <p className='hint delen-leeg'>{t('Відкритих посилань немає. Використані, прострочені й відкликані посилання тут не показуються.', 'Er zijn geen open links. Gebruikte, verlopen en ingetrokken links staan hier niet.')}</p>}
      {p.links.map((l) => (
        <article key={l.id} className='share-member-row delen-lid' data-link-id={l.id}>
          <div>
            <strong>{l.code} · {rolNaam(p.lang, l.workspaceRole)}</strong>
            <small>{l.email ? t(`Лише для ${l.email}`, `Alleen voor ${l.email}`) : t('Для будь-кого, хто відкриє першим', 'Voor wie hem als eerste opent')} · {t('діє до', 'geldig tot')} {vervalTekst(p.lang, l.expiresAt)}{l.blokken ? t(` · лише вибрані блоки (${l.blokken})`, ` · alleen gekozen blokken (${l.blokken})`) : ''}{l.eigen ? '' : t(' · створив інший адміністратор', ' · gemaakt door een andere beheerder')}</small>
          </div>
          <div className='delen-lid-acties'>
            <button type='button' className='ghost' disabled={p.bezig} title={t('Посилання перестане діяти одразу; учасників, які вже приєдналися, це не змінює.', 'De link werkt meteen niet meer; leden die al aansloten, blijven.')} onClick={() => setDoel(l)}>{t('Відкликати', 'Intrekken')}</button>
          </div>
        </article>
      ))}
      <BevestigDialoog open={!!doel} id='deel-link-intrekken' lang={p.lang} gevaarlijk bezig={p.bezig}
        titel={vraag?.titel || ''} uitleg={vraag?.uitleg} gevolgen={vraag?.gevolgen} bevestigTekst={vraag?.bevestigTekst || ''}
        onAnnuleer={() => setDoel(null)} onBevestig={async () => { const d = doel; setDoel(null); if (d) await p.onIntrekken(d.id); }} />
    </div>
  );
}

/** Keuze van de looptijd (1/7/30 dagen) en optioneel het adres waarvoor de link alleen werkt. */
export function LinkOpties(p: { lang: Lang; dagen: LinkDagen; onDagen: (d: LinkDagen) => void; email: string; onEmail: (e: string) => void; uit?: boolean }) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  return (
    <div className='delen-link-opties'>
      <label>{t('Строк дії', 'Geldig')}
        <select value={p.dagen} disabled={p.uit} title={t('Після цього строку посилання перестане діяти, навіть якщо ним ніхто не скористався.', 'Na deze termijn werkt de link niet meer, ook als niemand hem gebruikte.')} onChange={(e) => p.onDagen(Number(e.target.value) as LinkDagen)}>
          {LINK_DAGEN.map((d) => <option key={d} value={d}>{dagenTekst(p.lang, d)}</option>)}
        </select>
      </label>
      <label>{t('Лише для адреси (необов’язково)', 'Alleen voor adres (optioneel)')}
        <input type='email' value={p.email} disabled={p.uit} placeholder={t('будь-хто з посиланням', 'iedereen met de link')} title={t('Якщо вказати адресу, посилання спрацює лише після входу з нею; іншим воно доступу не дасть.', 'Met een adres werkt de link alleen na aanmelden met dat adres; anderen krijgen er geen toegang mee.')} onChange={(e) => p.onEmail(e.target.value)} />
      </label>
    </div>
  );
}
