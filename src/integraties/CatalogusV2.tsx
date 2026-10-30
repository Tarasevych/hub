// UI-013 — vernieuwde catalogus (vlag `integraties-catalogus-v2`, standaard UIT). Hergebruikt Logo (src/merk), Detail en de
// levende stand van Integraties.tsx; voegt geen eigen auth of opslag van tokens toe. Groepen komen uit groepVan() (echte stand).
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ExternalLink, Info, LayoutGrid, List, Search, Star, X } from 'lucide-react';
import { CATEGORIEEN, INTEGRATIES, METHODE_LABEL, type Integratie, type IntegratieCategorie, type IntegratieMethode } from '../../shared/integraties-catalogus';
import { GROEPEN, actieVan, groepVan, officieelTekst, registerVan, type LevendeStand } from '../../shared/integraties-register';
import { canonicalServiceUrl } from '../canoniek-dienst';
import { weergaveScopeNu } from '../gedeelde-voorkeuren';
import Logo from '../merk/MerkLogo';
import HulpVraag from '../hulp/HulpVraag';
import type { ServerStand } from './Detail';
import { codeTekst } from '../../shared/integraties-detail';
import WizardV2 from './WizardV2';
import { wizardKan, autorisatieSoort } from './wizard-v2-logica';
import { indelen, isOpen, leesVoorkeur, wissel, zoekt, type Voorkeur2 } from './catalogus-v2-logica';

type Lang = 'uk' | 'nl';
interface Props {
  lang: Lang;
  levend: (i: Integratie) => LevendeStand;
  stand: ServerStand | null;
  href: (i: Integratie) => string;
  wens: string[];
  onWens: (id: string) => void;
  onDetail: (id: string) => void;
  onMappen: () => void;
  gelezenOp: number;
  context: Record<string, unknown>;
  onVernieuw: () => void;
}
/** Een controle ouder dan 24 uur geldt als verouderd en wordt zo getoond. */
export const VEROUDERD_MS = 24 * 60 * 60 * 1000;
const OPSLAG = () => `tsv-integraties-v2:${weergaveScopeNu()}`;
const tijd = (ms: number, lang: Lang) => new Date(ms).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'short', timeStyle: 'short' });

export default function CatalogusV2({ lang, levend, stand, href, wens, onWens, onDetail, onMappen, gelezenOp, context, onVernieuw }: Props) {
  const [wizard, setWizard] = useState<string | null>(null);
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [v, setV] = useState<Voorkeur2>(() => { try { return leesVoorkeur(localStorage.getItem(OPSLAG())); } catch { return leesVoorkeur(null); } });
  const [zoek, setZoek] = useState('');
  const [plan, setPlan] = useState<string | null>(null);
  useEffect(() => { try { localStorage.setItem(OPSLAG(), JSON.stringify(v)); } catch { /* opslag geblokkeerd */ } }, [v]);

  const lijst = useMemo(() => INTEGRATIES.filter((i) => (!v.cat || i.cat === v.cat) && (!v.methode || i.methoden.includes(v.methode)) && zoekt(i, zoek)), [v.cat, v.methode, zoek]);
  const blokken = useMemo(() => indelen(lijst, levend, v, lang), [lijst, levend, v, lang]);
  // Kritieke fouten: ALTIJD zichtbaar, los van filters en ingeklapte blokken.
  const fouten = useMemo(() => INTEGRATIES.filter((i) => levend(i) === 'fout'), [levend]);
  const favorieten = useMemo(() => INTEGRATIES.filter((i) => wens.includes(i.id)), [wens]);
  const tel = useMemo(() => { const t: Record<string, number> = {}; for (const i of INTEGRATIES) { const g = groepVan(i, levend(i)); t[g] = (t[g] || 0) + 1; } return t; }, [levend]);

  const link = (i: Integratie): string => {
    const h = href(i); if (h) return h;
    const p = registerVan(i.id)?.pagina; if (!p) return '';
    try { return canonicalServiceUrl(p.dienst as never, p.tab, lang, true); } catch { return ''; }
  };
  const ACTIE: Record<string, [string, string]> = { koppelen: ['Підключити', 'Koppelen'], beheren: ['Керувати', 'Beheren'], herstellen: ['Відновити', 'Herstellen'], instellen: ['Налаштувати', 'Instellen'], plan: ['План', 'Plan'] };

  const kaart = (i: Integratie) => {
    const l = levend(i), g = groepVan(i, l), a = actieVan(g), r = registerVan(i.id), url = link(i);
    const c = CATEGORIEEN.find((x) => x.id === i.cat)!;
    const sv = stand?.levend?.[i.id], ctl = stand?.controles?.[i.id];
    const op = wens.includes(i.id);
    const label = ACTIE[a][lang === 'uk' ? 0 : 1];
    const metWizard = (a === 'koppelen' || a === 'herstellen' || a === 'instellen') && wizardKan(i, l) && autorisatieSoort(i) !== 'directory';
    const hoofd = metWizard
      ? <button type='button' className={`ic2-knop${a === 'instellen' ? '' : ' is-primair'}`} data-ic2-actie={a} onClick={() => { setWizard(i.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{label}<span className='il-sr'> — {i.naam}</span></button>
      : a === 'plan' || (!url && i.doel?.soort !== 'directory')
      ? <button type='button' className='ic2-knop' aria-expanded={plan === i.id} onClick={() => setPlan(plan === i.id ? null : i.id)}>{a === 'plan' ? label : tr('Що потрібно', 'Wat is nodig')}<span className='il-sr'> — {i.naam}</span></button>
      : i.doel?.soort === 'directory' ? <button type='button' className='ic2-knop is-primair' onClick={onMappen}>{label}<span className='il-sr'> — {i.naam}</span></button>
      : <a className={`ic2-knop${a === 'koppelen' || a === 'herstellen' ? ' is-primair' : ''}`} href={url} data-ic2-actie={a}>{label}<span className='il-sr'> — {i.naam}</span></a>;
    return (
      <li key={i.id} className='ic2-kaart' data-integratie={i.id} data-groep={g}>
        <div className='ic2-kop'>
          <Logo id={i.id} naam={i.naam} logo={i.logo} />
          <div className='ic2-titel'><h4>{i.naam}</h4><span>{c[lang]}{i.methoden.length ? ` · ${i.methoden.map((m) => METHODE_LABEL[m][lang === 'uk' ? 0 : 1]).join(', ')}` : ''}</span></div>
          <button type='button' className='ic2-ster' aria-pressed={op} aria-label={`${op ? tr('Прибрати з обраного', 'Uit favorieten') : tr('До обраного', 'Naar favorieten')}: ${i.naam}`} onClick={() => onWens(i.id)}><Star aria-hidden /></button>
        </div>
        <p className='ic2-uitleg'>{r && r.uitvoering !== 'geen' ? r.operaties[lang === 'uk' ? 0 : 1] : i[lang]}</p>
        <p className='ic2-stand' data-groep={g}>
          <i aria-hidden />
          {g === 'verbonden' ? tr('Підключено', 'Gekoppeld') : g === 'aandacht' ? tr('Помилка — потрібна дія', 'Fout — actie nodig') : g === 'instellen' ? (l === 'ingesteld' ? tr('Налаштовано, ще не перевірено', 'Ingesteld, nog niet gecontroleerd') : tr('Бракує налаштувань', 'Instellingen ontbreken')) : g === 'beschikbaar' ? tr('Можна підключити', 'Klaar om te koppelen') : tr('Ще не створено', 'Nog niet gebouwd')}
          {sv && (g === 'verbonden' || g === 'aandacht') ? (() => { const t = codeTekst(sv.code, lang, sv.n, lang === 'nl' ? sv.detail : ''); return t ? <span className='ic2-acc'> · {t}</span> : null; })() : null}
        </p>
        {g === 'verbonden' || g === 'aandacht' || g === 'instellen' ? (
          <p className={`ic2-tijd${(ctl?.op || sv?.gecontroleerdOp || Date.now()) < Date.now() - VEROUDERD_MS ? ' ic2-verouderd' : ''}`}>{(ctl?.op || sv?.gecontroleerdOp || Date.now()) < Date.now() - VEROUDERD_MS ? tr('Перевірка застаріла (понад добу). ', 'Controle verouderd (meer dan een dag). ') : null}{ctl || sv?.gecontroleerdOp ? tr(`Остання перевірка: ${tijd(ctl?.op || sv!.gecontroleerdOp!, lang)}`, `Laatste controle: ${tijd(ctl?.op || sv!.gecontroleerdOp!, lang)}`) : gelezenOp ? tr(`Стан прочитано: ${tijd(gelezenOp, lang)}; перевірки ще не було`, `Stand gelezen: ${tijd(gelezenOp, lang)}; nog geen controle`) : tr('Стан ще не прочитано', 'Stand nog niet gelezen')}</p>
        ) : null}
        {plan === i.id && r ? (
          <div className='ic2-plan' role='region' aria-label={tr('План підключення', 'Plan van de koppeling')}>
            <p><b>{tr('Спосіб', 'Wijze')}:</b> {officieelTekst(r, lang)}</p>
            <p><b>{tr('Потрібно', 'Nodig')}:</b> {r.vereist[lang === 'uk' ? 0 : 1]}</p>
            <p><b>{tr('Ще зробити', 'Nog te doen')}:</b> {r.nogTeDoen[lang === 'uk' ? 0 : 1]}</p>
            {r.beperking ? <p><b>{tr('Обмеження сервісу', 'Beperking van de dienst')}:</b> {r.beperking[lang === 'uk' ? 0 : 1]}</p> : null}
          </div>
        ) : null}
        <div className='ic2-acties'>
          {hoofd}
          <button type='button' className='ic2-knop is-icoon' onClick={() => onDetail(i.id)} aria-haspopup='dialog' title={tr('Докладніше: права, перевірка, відключення', 'Details: rechten, controle, loskoppelen')}><Info aria-hidden /><span className='il-sr'>{tr('Докладніше', 'Details')} — {i.naam}</span></button>
          <a className='ic2-knop is-icoon' href={i.site} target='_blank' rel='noopener noreferrer' title={tr('Сайт сервісу', 'Website van de dienst')}><ExternalLink aria-hidden /><span className='il-sr'>{tr('Сайт', 'Website')}: {i.naam}</span></a>
        </div>
      </li>
    );
  };

  return (
    <div className='ic2' data-weergave={v.weergave} data-integraties-v2>
      <div className='ic2-kopblok'>
        <h3>{tr('Каталог за темами', 'Catalogus per thema')}</h3>
        <HulpVraag k='integraties.v2-catalogus' lang={lang} />
        <button type='button' className='ic2-knop is-primair ic2-wizardknop' onClick={() => setWizard('')}>{tr('Майстер підключень', 'Koppelwizard')}</button>
      </div>
      {wizard !== null ? <WizardV2 key={wizard} lang={lang} context={context} begin={wizard || undefined} levend={levend} href={href} onSluit={() => setWizard(null)} onGewijzigd={onVernieuw} onMappen={onMappen} /> : null}
      <p className='ic2-samen'>{GROEPEN.map((g) => `${g[lang]}: ${tel[g.id] || 0}`).join(' · ')}</p>

      <div className='ic2-balk'>
        <label className='ic2-zoek'><Search aria-hidden /><span className='il-sr'>{tr('Пошук', 'Zoeken')}</span>
          <input type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={tr('Назва, тема, можливість, провайдер…', 'Naam, thema, mogelijkheid, aanbieder…')} autoComplete='off' />
          {zoek ? <button type='button' onClick={() => setZoek('')} aria-label={tr('Очистити пошук', 'Zoekopdracht wissen')}><X aria-hidden /></button> : null}
        </label>
        <select aria-label={tr('Тема', 'Thema')} value={v.cat} onChange={(e) => setV({ ...v, cat: e.target.value as IntegratieCategorie | '' })} data-hulp-vrij='filter'>
          <option value=''>{tr('Усі теми', 'Alle thema’s')}</option>
          {CATEGORIEEN.map((c) => <option key={c.id} value={c.id}>{c[lang]}</option>)}
        </select>
        <select aria-label={tr('Спосіб підключення', 'Koppelwijze')} value={v.methode} onChange={(e) => setV({ ...v, methode: e.target.value as IntegratieMethode | '' })} data-hulp-vrij='filter'>
          <option value=''>{tr('Будь-який спосіб', 'Elke wijze')}</option>
          {(Object.keys(METHODE_LABEL) as IntegratieMethode[]).map((m) => <option key={m} value={m}>{METHODE_LABEL[m][lang === 'uk' ? 0 : 1]}</option>)}
        </select>
        <select aria-label={tr('Порядок тем', 'Volgorde van thema’s')} value={v.sorteer} onChange={(e) => setV({ ...v, sorteer: e.target.value === 'naam' ? 'naam' : 'stand' })} data-hulp-vrij='sortering'>
          <option value='stand'>{tr('Спершу теми з підключеннями', 'Eerst thema’s met koppelingen')}</option>
          <option value='naam'>{tr('Звичайний порядок тем', 'Gewone volgorde van thema’s')}</option>
        </select>
        <div className='ic2-wissel' role='group' aria-label={tr('Вигляд', 'Weergave')}>
          <button type='button' aria-pressed={v.weergave === 'raster'} onClick={() => setV({ ...v, weergave: 'raster' })} title={tr('Сітка', 'Raster')}><LayoutGrid aria-hidden /><span className='il-sr'>{tr('Сітка', 'Raster')}</span></button>
          <button type='button' aria-pressed={v.weergave === 'lijst'} onClick={() => setV({ ...v, weergave: 'lijst' })} title={tr('Список', 'Lijst')}><List aria-hidden /><span className='il-sr'>{tr('Список', 'Lijst')}</span></button>
        </div>
      </div>

      {fouten.length ? (
        <section className='ic2-fouten' role='alert' aria-label={tr('Помилки підключення', 'Koppelfouten')}>
          <h4><AlertTriangle aria-hidden />{tr('Потребують уваги зараз', 'Vragen nu aandacht')} ({fouten.length})</h4>
          <ul className='ic2-raster'>{fouten.map(kaart)}</ul>
        </section>
      ) : null}

      {favorieten.length ? (
        <section className='ic2-blok'>
          <button type='button' className='ic2-blokkop' aria-expanded={isOpen(v, 'fav')} onClick={() => setV(wissel(v, 'fav'))}><Star aria-hidden />{tr('Обране', 'Favorieten')}<b>{favorieten.length}</b><ChevronDown aria-hidden className='ic2-pijl' /></button>
          {isOpen(v, 'fav') ? <ul className='ic2-raster'>{favorieten.map(kaart)}</ul> : null}
        </section>
      ) : null}

      <p className='il-sr' role='status' aria-live='polite'>{tr(`Знайдено: ${lijst.length} із ${INTEGRATIES.length}`, `Gevonden: ${lijst.length} van ${INTEGRATIES.length}`)}</p>
      {blokken.length === 0 ? <p className='ic2-leeg'>{tr('Нічого не знайдено. Змініть запит або тему.', 'Niets gevonden. Pas de zoekopdracht of het thema aan.')}</p> : null}
      {blokken.map((b) => {
        const c = CATEGORIEEN.find((x) => x.id === b.cat)!;
        const open = zoek.trim() ? true : isOpen(v, b.cat);
        return (
          <section key={b.cat} className='ic2-blok' data-cat={b.cat}>
            <button type='button' className='ic2-blokkop' aria-expanded={open} onClick={() => setV(wissel(v, b.cat))}>
              {c[lang]}<b>{b.totaal}</b>{b.verbonden ? <em>{tr(`підключено ${b.verbonden}`, `${b.verbonden} gekoppeld`)}</em> : null}<ChevronDown aria-hidden className='ic2-pijl' />
            </button>
            {open ? b.groepen.map((g) => {
              const s = `${b.cat}:${g.id}`, go = zoek.trim() ? true : isOpen(v, s), def = GROEPEN.find((x) => x.id === g.id)!;
              return (
                <div key={g.id} className='ic2-groep' data-groep={g.id}>
                  <button type='button' className='ic2-groepkop' aria-expanded={go} onClick={() => setV(wissel(v, s))}>{def[lang]}<b>{g.lijst.length}</b><ChevronDown aria-hidden className='ic2-pijl' /></button>
                  {go ? <ul className='ic2-raster'>{g.lijst.map(kaart)}</ul> : null}
                </div>
              );
            }) : null}
          </section>
        );
      })}
    </div>
  );
}
