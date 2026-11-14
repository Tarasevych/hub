// IDENTITEIT-014 (фаза 3, крок «delen»): «Хто має доступ» — один список учасників для hub-модалки й центру налаштувань.
// Wie heeft toegang: staat in twee talen (actief / uitgenodigd / verlopen), rol wijzigen en intrekken alleen waar de rol in DEZE
// ruimte het toelaat (shared/werkruimte-rechten.ts), intrekken en «beheerder maken» pas na een bevestigingsvenster.
import { useState } from 'react';
import { BevestigDialoog } from '../platform/BevestigDialoog';
import { WERKRUIMTE_ROLLEN, magDelen, magRolBeheren, type WerkruimteRol } from '../../shared/werkruimte-rechten';
import { STAAT_UITLEG, beheerderMakenVraag, lidStaat, rolNaam, rolVanLid, staatTekst, type Lid } from './delen-logica';
import './delen.css';

type Lang = 'uk' | 'nl';
const KEUZES = WERKRUIMTE_ROLLEN.filter((r): r is Exclude<WerkruimteRol, 'owner'> => r !== 'owner').reverse(); // viewer, member, admin

export function LedenLijst(p: {
  lang: Lang;
  leden: Lid[];
  /** Rol van de huidige gebruiker in DEZE ruimte. */
  rol: WerkruimteRol | null | undefined;
  bezig?: boolean;
  onRol: (lidId: string, rol: WerkruimteRol) => Promise<unknown> | void;
  onIntrekken: (lidId: string) => Promise<unknown> | void;
  /** Verlopen uitnodiging opnieuw sturen (opent het venster «Надати доступ» van de ouder). */
  onOpnieuw?: (email: string, rol: WerkruimteRol) => void;
}) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const [intrekDoel, setIntrekDoel] = useState<{ id: string; email: string } | null>(null);
  const [beheerderDoel, setBeheerderDoel] = useState<{ id: string; email: string } | null>(null);
  const mag = magDelen(p.rol);
  const nietBeheren = t('Змінювати ролі й відкликати доступ може лише власник або адміністратор цього простору.', 'Rollen wijzigen en toegang intrekken kan alleen de eigenaar of een beheerder van deze werkruimte.');
  if (!p.leden.length) return <p className='hint delen-leeg'>{t('Поки що доступу немає ні в кого, крім вас.', 'Nog niemand anders dan u heeft toegang.')}</p>;
  const vraag = beheerderDoel ? beheerderMakenVraag(p.lang, beheerderDoel.email) : null;
  return (
    <div className='delen-leden-lijst'>
      {p.leden.map((lid) => {
        const huidig = rolVanLid(lid);
        const staat = lidStaat(lid);
        const magDit = magRolBeheren(p.rol, huidig);
        return (
          <article key={lid.id} className='share-member-row delen-lid' data-lid-staat={staat}>
            <div>
              <strong>{lid.email}</strong>
              <small><span className={`delen-staat is-${staat}`} title={t(STAAT_UITLEG[staat][0], STAAT_UITLEG[staat][1])}>{staatTekst(p.lang, lid)}</span> · {rolNaam(p.lang, huidig)}</small>
              {staat === 'verlopen' && <small className='delen-uitleg'>{t(STAAT_UITLEG.verlopen[0], STAAT_UITLEG.verlopen[1])}</small>}
            </div>
            <div className='delen-lid-acties'>
              <label className='delen-rol-keuze'>
                <span className='delen-verborgen'>{t(`Роль для ${lid.email}`, `Rol voor ${lid.email}`)}</span>
                <select value={huidig} disabled={!mag || !magDit || p.bezig} title={!mag || !magDit ? nietBeheren : t('Нова роль діє одразу; людина отримає сповіщення.', 'De nieuwe rol geldt meteen; deze persoon krijgt een melding.')}
                  onChange={(e) => { const doel = e.target.value as WerkruimteRol; if (doel === huidig) return; if (doel === 'admin') { setBeheerderDoel({ id: lid.id, email: lid.email }); return; } void p.onRol(lid.id, doel); }}>
                  {KEUZES.map((r) => <option key={r} value={r} disabled={r !== huidig && !magRolBeheren(p.rol, r, huidig)}>{rolNaam(p.lang, r)}</option>)}
                </select>
              </label>
              {staat === 'verlopen' && p.onOpnieuw && magDit && <button type='button' className='ghost' disabled={p.bezig} title={t('Нове запрошення знову діятиме 7 днів.', 'De nieuwe uitnodiging is weer 7 dagen geldig.')} onClick={() => p.onOpnieuw?.(lid.email, huidig)}>{t('Надіслати знову', 'Opnieuw sturen')}</button>}
              {mag && magDit && <button type='button' className='ghost' disabled={p.bezig} title={t('Людина одразу перестане бачити простір.', 'Deze persoon ziet de werkruimte meteen niet meer.')} onClick={() => setIntrekDoel({ id: lid.id, email: lid.email })}>{t('Відкликати', 'Intrekken')}</button>}
            </div>
          </article>
        );
      })}
      <BevestigDialoog open={!!intrekDoel} id='deel-intrekken' lang={p.lang} gevaarlijk bezig={p.bezig}
        titel={t('Відкликати доступ?', 'Toegang intrekken?')}
        uitleg={intrekDoel ? t(`${intrekDoel.email} більше не бачитиме цей простір.`, `${intrekDoel.email} ziet deze werkruimte dan niet meer.`) : ''}
        gevolgen={[t('Блоки, які створила ця особа, переходять власнику простору.', 'Blokken die deze persoon maakte, gaan over naar de eigenaar van de werkruimte.'), t('Щоб повернути доступ, потрібне нове запрошення.', 'Om de toegang terug te geven is een nieuwe uitnodiging nodig.')]}
        bevestigTekst={t('Так, відкликати', 'Ja, intrekken')} onAnnuleer={() => setIntrekDoel(null)}
        onBevestig={async () => { const doel = intrekDoel; setIntrekDoel(null); if (doel) await p.onIntrekken(doel.id); }} />
      <BevestigDialoog open={!!beheerderDoel} id='deel-rol-beheerder' lang={p.lang} gevaarlijk bezig={p.bezig}
        titel={vraag?.titel || ''} uitleg={vraag?.uitleg} gevolgen={vraag?.gevolgen} bevestigTekst={vraag?.bevestigTekst || ''}
        onAnnuleer={() => setBeheerderDoel(null)}
        onBevestig={async () => { const doel = beheerderDoel; setBeheerderDoel(null); if (doel) await p.onRol(doel.id, 'admin'); }} />
    </div>
  );
}
