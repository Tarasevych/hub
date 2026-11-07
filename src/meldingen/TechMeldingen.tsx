// Paneel «Технічні сповіщення» in de technische band (18.10.2026). Knop met teller; paneel met filters (тип, важливість,
// прочитані/непрочитані) en «Позначити все прочитаним». Bron: tech-meldingen-store (CanonicalChrome zet de technische serverMeldingen).
// Opent ook via de regel in de gewone bel (gebeurtenis TECH_MELDINGEN_EVENT) en, na het activeren vanuit die regel, vanzelf.
import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { soortInfo } from '../../shared/melding-soorten';
import { filterTechMeldingen, ongelezenTech, type Gelezen } from './tech-filter';
import { typeInfo, type MeldingErnst, type MeldingType } from '../../shared/melding-typen';
import { useZijbalkVoorkeuren } from '../zijbalk-voorkeuren';
import { TECH_MELDINGEN_EVENT, naActiverenMeldingen, ongelezenTechActiviteit, techMeldingenStaat, useTechMeldingen } from './tech-meldingen-opslag';
import { activityCause, activityStatusText, activityTitle, sourceLabel, statusInfo } from '../connector-activiteit';
import { styleOf } from '../melding-stijl';
import './meldingen.css';

const ERNST: Record<MeldingErnst, [string, string]> = { kritiek: ['Критичне', 'Kritiek'], belangrijk: ['Важливе', 'Belangrijk'], info: ['Інформація', 'Informatie'] };

export function TechMeldingenKnop({ uk }: { uk: boolean }) {
  const staat = useTechMeldingen();
  const { items } = staat;
  const soorten = useZijbalkVoorkeuren().meldingen.soorten;
  const [open, setOpen] = useState(false);
  // 22.10.2026: ook de ongelezen technische ACTIVITEITEN (beheer, uitrol, diagnose, SIEM, звірка) tellen hier mee — niet in de bel.
  const n = ongelezenTech(items, soorten) + ongelezenTechActiviteit(staat);
  useEffect(() => {
    const op = () => setOpen(true);
    window.addEventListener(TECH_MELDINGEN_EVENT, op);
    // Vanuit de gewone bel eerst geactiveerd: de band (en deze knop) verschijnt nu → meteen terug naar het paneel.
    if (naActiverenMeldingen()) setOpen(true);
    return () => window.removeEventListener(TECH_MELDINGEN_EVENT, op);
  }, []);
  const label = uk ? (n ? `Технічні сповіщення: ${n} нових` : 'Технічні сповіщення') : (n ? `Technische meldingen: ${n} nieuw` : 'Technische meldingen');
  return (
    <>
      <button type='button' className='tech-meldingen-knop' data-tech-knop='meldingen' aria-haspopup='dialog' aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((v) => !v)}>
        <Bell aria-hidden='true' />{n > 0 ? <b data-tech-meldingen-teller={n}>{n > 99 ? '99+' : n}</b> : null}
      </button>
      {open ? <TechMeldingenPaneel uk={uk} sluit={() => setOpen(false)} /> : null}
    </>
  );
}

export function TechMeldingenPaneel({ uk, sluit }: { uk: boolean; sluit: () => void }) {
  const { items, lees, activiteit, activiteitGelezen, leesActiviteit } = useTechMeldingen();
  const lang = uk ? 'uk' : 'nl';
  const soorten = useZijbalkVoorkeuren().meldingen.soorten;
  const t = (a: string, b: string) => (uk ? a : b);
  const [type, setType] = useState<MeldingType | ''>('');
  const [ernst, setErnst] = useState<MeldingErnst | ''>('');
  const [gelezen, setGelezen] = useState<Gelezen>('alle');
  const [bezig, setBezig] = useState(false);
  const zichtbaar = useMemo(() => filterTechMeldingen(items, soorten, { type: '', ernst: '', gelezen: 'alle' }), [items, soorten]);
  const typen = useMemo(() => [...new Set(zichtbaar.map((m) => soortInfo(m.kind).type))], [zichtbaar]);
  const lijst = useMemo(() => filterTechMeldingen(items, soorten, { type, ernst, gelezen }), [items, soorten, type, ernst, gelezen]);
  const ongelezen = zichtbaar.filter((m) => !m.read);
  const tijd = (v: number) => new Date(v).toLocaleString(uk ? 'uk-UA' : 'nl-BE', { dateStyle: 'short', timeStyle: 'short' });
  const ongelezenActiviteit = activiteit.filter((e) => !activiteitGelezen.has(e.id));
  const activiteitLijst = gelezen === 'alle' ? activiteit : gelezen === 'ongelezen' ? ongelezenActiviteit : activiteit.filter((e) => activiteitGelezen.has(e.id));
  // Gelijke handelingen (zelfde soort, stand en naam) één keer, met «N×» — anders verdringen herhalingen (elke activering, elke poging)
  // de enkele die ertoe doet. De nieuwste staat voorop (de server sorteert nieuwste eerst); «Прочитано» geldt voor de hele groep.
  const activiteitGroepen = useMemo(() => {
    const m = new Map<string, { e: (typeof activiteit)[number]; ids: string[]; gelezen: boolean }>();
    for (const e of activiteitLijst) {
      const k = `${e.kind}|${e.type}|${e.status}|${activityTitle(e, lang)}|${activityCause(e, lang)}`;
      const g = m.get(k);
      if (g) { g.ids.push(e.id); if (!activiteitGelezen.has(e.id)) g.gelezen = false; }
      else m.set(k, { e, ids: [e.id], gelezen: activiteitGelezen.has(e.id) });
    }
    return [...m.values()];
  }, [activiteitLijst, activiteitGelezen, lang]);
  const allesGelezen = async () => {
    const l = techMeldingenStaat().lees;
    setBezig(true);
    try { if (l) for (const m of ongelezen) await l(m.id); } catch { /* volgende verversing toont de echte stand */ }
    const la = techMeldingenStaat().leesActiviteit; if (la) for (const e of ongelezenActiviteit) la(e.id);
    setBezig(false);
  };
  return (
    <Venster id='tech-meldingen' titel={t('Технічні сповіщення', 'Technische meldingen')} breedte={560} onSluit={sluit} lang={uk ? 'uk' : 'nl'}>
      <div className='tech-venster tm-paneel' data-tech-meldingen-paneel>
        <div className='tm-filters' role='group' aria-label={t('Фільтри', 'Filters')}>
          <label><span>{t('Тип', 'Soort')}</span>
            <select value={type} onChange={(e) => setType(e.target.value as MeldingType | '')} data-tm-filter='type' data-hulp-vrij='filter'>
              <option value=''>{t('Усі типи', 'Alle soorten')}</option>
              {typen.map((id) => <option key={id} value={id}>{uk ? typeInfo(id).naam[0] : typeInfo(id).naam[1]}</option>)}
            </select></label>
          <label><span>{t('Важливість', 'Belang')}</span>
            <select value={ernst} onChange={(e) => setErnst(e.target.value as MeldingErnst | '')} data-tm-filter='ernst' data-hulp-vrij='filter'>
              <option value=''>{t('Будь-яка', 'Alle')}</option>
              {(Object.keys(ERNST) as MeldingErnst[]).map((k) => <option key={k} value={k}>{uk ? ERNST[k][0] : ERNST[k][1]}</option>)}
            </select></label>
          <div className='tm-seg' role='radiogroup' aria-label={t('Стан', 'Status')}>
            {(['alle', 'ongelezen', 'gelezen'] as Gelezen[]).map((g) => (
              <button key={g} type='button' role='radio' aria-checked={gelezen === g} data-tm-gelezen={g} onClick={() => setGelezen(g)}>
                {g === 'alle' ? t('Усі', 'Alle') : g === 'ongelezen' ? t(`Непрочитані (${ongelezen.length})`, `Ongelezen (${ongelezen.length})`) : t('Прочитані', 'Gelezen')}
              </button>))}
          </div>
        </div>
        {lijst.length === 0 ? (activiteitLijst.length && !type && !ernst ? null :
          <p className='tm-leeg' data-tm-leeg>{zichtbaar.length ? t('Нічого не відповідає фільтрам.', 'Niets voldoet aan de filters.') : t('Технічних сповіщень немає.', 'Geen technische meldingen.')}</p>
        ) : (
          <ul className='tm-lijst'>
            {lijst.map((m) => {
              const s = soortInfo(m.kind);
              return (
                <li key={m.id} className={`tm-item ernst-${s.ernst}${m.read ? ' is-gelezen' : ''}`} data-tm-id={m.id} data-tm-kind={m.kind}>
                  <div className='tm-meta'><span className={`tm-chip ernst-${s.ernst}`}>{uk ? ERNST[s.ernst][0] : ERNST[s.ernst][1]}</span><span>{uk ? typeInfo(s.type).naam[0] : typeInfo(s.type).naam[1]}</span><time dateTime={new Date(m.createdAt).toISOString()}>{tijd(m.createdAt)}</time></div>
                  <strong>{m.title}</strong>
                  {m.message ? <p>{m.message}</p> : null}
                  <div className='tech-knoppen'>
                    {m.link ? <a className='tm-link' href={m.link}><ExternalLink aria-hidden='true' />{t('Відкрити', 'Openen')}</a> : null}
                    {!m.read && lees ? <button type='button' data-tm-lees={m.id} onClick={() => void lees(m.id)}>{t('Прочитано', 'Gelezen')}</button> : null}
                  </div>
                </li>);
            })}
          </ul>
        )}
        {/* 22.10.2026: technische activiteiten (sfeer 'technisch', shared/meldingen-soorten.ts) — vroeger in de bel van de gebruiker als «Дія на сайті: …». */}
        {!type && !ernst && activiteitLijst.length > 0 ? (
          <section className='tm-activiteit' data-tm-activiteit aria-label={t('Дії в технічному просторі', 'Acties in de technische ruimte')}>
            <h3>{t('Дії в технічному просторі', 'Acties in de technische ruimte')} <span>{activiteitLijst.length}</span></h3>
            <ul className='tm-lijst'>
              {activiteitGroepen.slice(0, 60).map(({ e, ids, gelezen: isGelezen }) => {
                const st = statusInfo(e.status, lang), oorzaak = activityCause(e, lang);
                return (
                  <li key={e.id} className={`tm-item ernst-${st.group === 'failed' ? 'kritiek' : st.group === 'waiting' || st.group === 'rejected' ? 'belangrijk' : 'info'}${isGelezen ? ' is-gelezen' : ''}`} data-tm-activiteit-id={e.id} data-tm-aantal={ids.length} data-tm-sfeer='technisch'>
                    <div className='tm-meta'><span className={`tm-chip ernst-${st.group === 'failed' ? 'kritiek' : st.group === 'rejected' ? 'belangrijk' : 'info'}`}>{e.kind === 'site' ? styleOf(e.source, lang).label : sourceLabel(e.source, lang)}</span><span>{activityStatusText(e, lang)}</span><time dateTime={new Date(e.createdAt).toISOString()}>{tijd(e.createdAt)}</time>{ids.length > 1 ? <span className='tm-aantal' aria-label={t(`${ids.length} рази`, `${ids.length} keer`)}>{ids.length}×</span> : null}</div>
                    <strong>{activityTitle(e, lang)}</strong>
                    {oorzaak ? <p>{oorzaak}</p> : null}
                    <div className='tech-knoppen'>
                      {!isGelezen && leesActiviteit ? <button type='button' data-tm-lees-activiteit={e.id} onClick={() => { for (const id of ids) leesActiviteit(id); }}>{t('Прочитано', 'Gelezen')}</button> : null}
                    </div>
                  </li>);
              })}
            </ul>
          </section>
        ) : null}
        <div className='tech-knoppen tm-voet'>
          <small>{t('Звук, спливні й приховування типів — у налаштуваннях дзвіночка («Типи сповіщень»).', 'Geluid, pop-ups en verbergen per soort: in de instellingen van de bel («Soorten meldingen»).')}</small>
          <button type='button' className='is-hoofd' disabled={(!ongelezen.length || !lees) && !ongelezenActiviteit.length || bezig} aria-busy={bezig || undefined} data-tm-alles onClick={() => void allesGelezen()}><CheckCheck aria-hidden='true' />{t('Позначити все прочитаним', 'Alles als gelezen')}</button>
        </div>
      </div>
    </Venster>
  );
}
