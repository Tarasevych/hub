// Connector v2 — rechten kiezen: groepen met pictogrammen, modus per groep en voor alles (alles / lezen / lezen+schrijven /
// alleen schrijven / geen), schakelaar per categorie, schakelaar per hulpmiddel (kleur ÉN pictogram: nooit alleen kleur),
// zoeken, uitklappen met echte uitleg (wat, gevolgen, waarschuwing, schets, adres van het hulpmiddel), risico, privé ↔ technisch
// duidelijk anders, en «в розробці» zichtbaar maar nooit aan te zetten. Bij herverbinden: drie delen (буде додано / вже було /
// не буде) waarin je meteen kunt wijzigen. Gebruikt in het toestemmingsvenster en op de beheerpagina.
import { useMemo, useState, type ReactElement } from 'react';
import {
  Ban, Boxes, CalendarDays, Check, ChevronDown, Construction, Copy, CreditCard, Eye, FolderOpen, Github, Globe, KanbanSquare, Mail, Monitor,
  Palette, PenLine, PencilLine, Rocket, Search, Server, ShieldAlert, ShieldCheck, Trash2, TriangleAlert, UserRound, Wrench, X,
} from 'lucide-react';
import { V2_GROEPEN, V2_OPTIES, RISICO_TEKST, SOORT_TEKST, KANT_TEKST, type GroepId, type Kant, type Soort, type V2Optie } from '../../shared/connector-v2/catalogus';
import { toolNaam } from '../../shared/connector-v2/namen';
import { MODI, MODUS_TEKST, modusVan, pasModusToe, verschil, type Modus } from '../../shared/connector-v2/rechten';
import { v2Agent, type AgentSlug } from '../../shared/connector-v2/agenten';
import { BEVESTIGING_BADGE, MET_BEVESTIGING } from '../../shared/ai-bevestiging';
import './connector-v2.css';
import '../ai-bevestiging/bevestigingen.css';
import '../agenten/agenten-kern-maquette.css';

type Tr = (uk: string, nl: string) => string;

const GROEP_ICOON: Record<string, (p: { size?: number }) => ReactElement> = {
  UserRound: (p) => <UserRound {...p} />, Mail: (p) => <Mail {...p} />, CalendarDays: (p) => <CalendarDays {...p} />, FolderOpen: (p) => <FolderOpen {...p} />,
  KanbanSquare: (p) => <KanbanSquare {...p} />, Search: (p) => <Search {...p} />, Monitor: (p) => <Monitor {...p} />, Boxes: (p) => <Boxes {...p} />,
  Globe: (p) => <Globe {...p} />, Github: (p) => <Github {...p} />, Palette: (p) => <Palette {...p} />, CreditCard: (p) => <CreditCard {...p} />,
  Rocket: (p) => <Rocket {...p} />, Server: (p) => <Server {...p} />,
};
export const groepIcoon = (naam: string, size = 18) => (GROEP_ICOON[naam] ?? GROEP_ICOON.Search)({ size });
const MODUS_ICOON: Record<Modus, ReactElement> = {
  alles: <ShieldAlert size={15} />, 'lezen-schrijven': <PencilLine size={15} />, lezen: <Eye size={15} />, schrijven: <PenLine size={15} />, geen: <Ban size={15} />,
};
const SOORT_ICOON: Record<Soort, ReactElement> = { lezen: <Eye size={13} />, schrijven: <PencilLine size={13} />, wissen: <Trash2 size={13} /> };

/** Schakelaar met kleur én pictogram (✓ aan, × uit, bouwhek = in ontwikkeling). */
export function Schakelaar({ aan, kant, disabled, dev, label, onChange, klein }: { aan: boolean; kant: Kant; disabled?: boolean; dev?: boolean; label: string; onChange: (v: boolean) => void; klein?: boolean }) {
  return (
    <button type='button' role='switch' aria-checked={aan} aria-label={label} disabled={disabled || dev}
      className={`v2-schakelaar${aan ? ' is-aan' : ''}${dev ? ' is-dev' : ''}${klein ? ' is-klein' : ''} kant-${kant}`} onClick={() => onChange(!aan)}>
      <span className='v2-schakelaar-knop' aria-hidden='true'>{dev ? <Construction size={12} /> : aan ? (kant === 'beheer' ? <Wrench size={12} /> : <Check size={12} />) : <X size={12} />}</span>
    </button>
  );
}

/** Kleine schets: AI → handeling → waar (subdomein / dienst). Geen afbeelding van buiten: alleen SVG en tekst. */
function Schets({ o, agent, uk }: { o: V2Optie; agent: AgentSlug; uk: boolean }) {
  const doel = `${o.sub}.tarasevych.com${o.dienst ? ` · ${o.dienst}` : ''}`;
  const actie = SOORT_TEKST[o.soort][uk ? 'uk' : 'nl'];
  return (
    <svg className={`v2-schets kant-${o.kant} risico-${o.risico}`} viewBox='0 0 360 64' role='img' aria-label={`${v2Agent(agent).naam} → ${actie} → ${doel}`}>
      <rect x='2' y='14' width='92' height='36' rx='8' className='v2-schets-ai' />
      <text x='48' y='37' textAnchor='middle'>{v2Agent(agent).naam}</text>
      <path d='M98 32 H134' className='v2-schets-lijn' markerEnd='url(#v2pijl)' />
      <rect x='138' y='14' width='84' height='36' rx='18' className='v2-schets-actie' />
      <text x='180' y='37' textAnchor='middle'>{actie}</text>
      <path d='M226 32 H262' className='v2-schets-lijn' markerEnd='url(#v2pijl)' />
      <rect x='266' y='8' width='92' height='48' rx='8' className='v2-schets-doel' />
      <text x='312' y='29' textAnchor='middle'>{o.sub}</text>
      <text x='312' y='45' textAnchor='middle' className='v2-schets-klein'>{o.dienst ?? (o.kant === 'beheer' ? 'server' : uk ? 'ваше' : 'van u')}</text>
      <defs><marker id='v2pijl' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='6' markerHeight='6' orient='auto-start-reverse'><path d='M0 0 L10 5 L0 10 z' /></marker></defs>
    </svg>
  );
}

function OptieRij({ o, aan, agent, uk, tr, onToggle, uitgeklapt, onKlap, markering, nuUit }: {
  o: V2Optie; aan: boolean; agent: AgentSlug; uk: boolean; tr: Tr; onToggle: (v: boolean) => void; uitgeklapt: boolean; onKlap: () => void; markering?: 'nieuw' | 'was' | 'weg';
  /** Levende rechten: het recht is gegeven, maar bestaat op dit moment niet (technisch profiel uit). Grijs, met uitleg. */
  nuUit?: boolean;
}) {
  const t = uk ? o.uk : o.nl;
  const naam = toolNaam(o, agent);
  const dev = o.status === 'in-ontwikkeling';
  // 21.10.2026: hulpmiddelen die langs de bevestigingsrij op de site gaan (shared/ai-bevestiging.ts → MET_BEVESTIGING) dragen dat zichtbaar.
  const bevestiging = o.intern ? MET_BEVESTIGING[o.intern] : undefined;
  const [gekopieerd, setGekopieerd] = useState(false);
  return (
    <li className={`v2-optie kant-${o.kant}${dev ? ' is-dev' : ''}${aan ? ' is-aan' : ''}${nuUit ? ' is-nu-uit' : ''}`} data-v2-optie={o.key} data-v2-nu-uit={nuUit ? '1' : undefined}>
      <div className='v2-optie-kop'>
        <Schakelaar aan={aan} kant={o.kant} dev={dev} label={t[0]} onChange={onToggle} />
        <button type='button' className='v2-optie-naam' aria-expanded={uitgeklapt} onClick={onKlap}>
          <span className='v2-optie-titel'>{t[0]}</span>
          <span className='v2-chips'>
            <span className={`v2-chip soort-${o.soort}`}>{SOORT_ICOON[o.soort]}{SOORT_TEKST[o.soort][uk ? 'uk' : 'nl']}</span>
            <span className={`v2-chip risico-${o.risico}`}>{o.risico === 'kritiek' || o.risico === 'hoog' ? <TriangleAlert size={12} /> : <ShieldCheck size={12} />}{RISICO_TEKST[o.risico][uk ? 'uk' : 'nl']}</span>
            {o.gevoelig ? <span className='v2-chip is-gevoelig'>{tr('чутливе', 'gevoelig')}</span> : null}
            {dev ? <span className='v2-chip is-dev'><Construction size={12} />{tr('у розробці', 'in ontwikkeling')}</span> : null}
            {bevestiging && !dev ? <span className='v2-chip is-bevestiging' data-v2-bevestiging={bevestiging}><ShieldCheck size={12} />{BEVESTIGING_BADGE[bevestiging][uk ? 'uk' : 'nl']}</span> : null}
            {nuUit ? <span className='v2-chip is-nu-uit' title={tr('Технічний профіль вимкнений: ШІ зараз цього не бачить і не може викликати.', 'Technisch profiel staat uit: de AI ziet dit nu niet en kan het niet aanroepen.')}><Wrench size={12} />{tr('зараз недоступно', 'nu niet beschikbaar')}</span> : null}
            {markering === 'nieuw' ? <span className='v2-chip is-nieuw'>{tr('буде додано', 'wordt toegevoegd')}</span> : markering === 'weg' ? <span className='v2-chip is-weg'>{tr('не буде', 'vervalt')}</span> : null}
          </span>
          <ChevronDown size={16} className='v2-klap' aria-hidden='true' />
        </button>
      </div>
      {uitgeklapt ? (
        <div className='v2-optie-uitleg'>
          <code className='v2-adres' title={tr('Адреса інструмента (так його бачить ШІ)', 'Adres van het hulpmiddel (zo ziet de AI het)')}>
            {naam}
            <button type='button' className='v2-kopieer' aria-label={tr('Копіювати адресу', 'Adres kopiëren')} onClick={() => { void navigator.clipboard?.writeText(naam).then(() => { setGekopieerd(true); window.setTimeout(() => setGekopieerd(false), 1500); }); }}>
              {gekopieerd ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </code>
          <dl>
            <div className='v2-uitleg-wat'><dt>{tr('Що робить', 'Wat het doet')}</dt><dd>{t[1]}</dd></div>
            <div className='v2-uitleg-gevolg'><dt>{tr('Що це означає для вас', 'Wat dit voor u betekent')}</dt><dd>{t[2]}</dd></div>
            {t[3] ? <div className='v2-uitleg-let' role='note'><dt><TriangleAlert size={14} aria-hidden='true' />{tr('Зверніть увагу', 'Let op')}</dt><dd>{t[3]}</dd></div> : null}
            <div className='v2-uitleg-kant'><dt>{o.kant === 'beheer' ? <Wrench size={14} aria-hidden='true' /> : <UserRound size={14} aria-hidden='true' />}{KANT_TEKST[o.kant][uk ? 'uk' : 'nl']}</dt><dd>{uk ? KANT_TEKST[o.kant].uitlegUk : KANT_TEKST[o.kant].uitlegNl}</dd></div>
          </dl>
          <Schets o={o} agent={agent} uk={uk} />
        </div>
      ) : null}
    </li>
  );
}

function ModusKeuze({ huidig, onKies, tr, uk, label, compact }: { huidig: Modus | null; onKies: (m: Modus) => void; tr: Tr; uk: boolean; label: string; compact?: boolean }) {
  return (
    <div className={`v2-modus${compact ? ' is-compact' : ''}`} role='radiogroup' aria-label={label}>
      {MODI.map((m) => (
        <button key={m} type='button' role='radio' aria-checked={huidig === m} className={`v2-modus-knop modus-${m}${huidig === m ? ' is-gekozen' : ''}`} onClick={() => onKies(m)}
          title={MODUS_TEKST[m][uk ? 'uk' : 'nl']}>
          {MODUS_ICOON[m]}<span className={compact ? 'sr-only' : ''}>{MODUS_TEKST[m][uk ? 'uk' : 'nl']}</span>
        </button>
      ))}
      {huidig === null ? <span className='v2-modus-gemengd'>{tr('вибірково', 'handmatig')}</span> : null}
    </div>
  );
}

export type KiezerProps = {
  tr: Tr; agent: AgentSlug; kanten: readonly Kant[]; waarde: string[]; onChange: (keys: string[]) => void;
  /** Wat de koppeling had (herverbinden): toont de drie delen «буде додано / вже було / не буде». */
  vorige?: string[] | null;
  /**
   * Levende rechten (20.10.2026): is het technische profiel NU actief? `false` = de technische rechten blijven kiesbaar en
   * bewaard, maar staan grijs met «зараз недоступно» — precies wat de AI op dit moment ziet (namelijk niets technisch).
   * Niet opgegeven = niets vergrijzen (bv. een weergave buiten een sessie).
   */
  techNu?: boolean;
};

export default function RechtenKiezer({ tr, agent, kanten, waarde, onChange, vorige, techNu }: KiezerProps) {
  const uk = tr('uk', 'nl') === 'uk';
  const [zoek, setZoek] = useState('');
  const [toonDev, setToonDev] = useState(true);
  const [alleenAan, setAlleenAan] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [groepDicht, setGroepDicht] = useState<Record<string, boolean>>({});
  const set = useMemo(() => new Set(waarde), [waarde]);
  const zet = (key: string, v: boolean) => { const n = new Set(waarde); if (v) n.add(key); else n.delete(key); onChange([...n].sort()); };
  const q = zoek.trim().toLowerCase();
  const past = (o: V2Optie) => {
    if (!toonDev && o.status !== 'actief') return false;
    if (alleenAan && !set.has(o.key)) return false;
    if (!q) return true;
    return [o.uk[0], o.nl[0], o.uk[1], o.nl[1], o.weergave, toolNaam(o, agent)].some((s) => String(s).toLowerCase().includes(q));
  };
  const vs = vorige ? verschil(vorige, waarde) : null;
  const markering = (key: string): 'nieuw' | 'was' | 'weg' | undefined => !vs ? undefined : vs.toegevoegd.includes(key) ? 'nieuw' : vs.vervalt.includes(key) ? 'weg' : vs.behouden.includes(key) ? 'was' : undefined;
  const aanTotaal = (k: Kant) => V2_OPTIES.filter((o) => o.kant === k && set.has(o.key)).length;
  const risicoTelling = (['laag', 'midden', 'hoog', 'kritiek'] as const).map((r) => ({ r, n: V2_OPTIES.filter((o) => o.risico === r && set.has(o.key)).length }));

  return (
    <div className='v2-kiezer' data-v2-kiezer={agent}>
      <div className='v2-werkbalk'>
        <label className='v2-zoek'>
          <Search size={16} aria-hidden='true' />
          <input type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={tr('Пошук дозволу або адреси…', 'Recht of adres zoeken…')} aria-label={tr('Пошук дозволів', 'Rechten zoeken')} />
        </label>
        <label className='v2-filter'><input type='checkbox' checked={alleenAan} onChange={(e) => setAlleenAan(e.target.checked)} />{tr('лише ввімкнені', 'alleen aan')}</label>
        <label className='v2-filter'><input type='checkbox' checked={toonDev} onChange={(e) => setToonDev(e.target.checked)} />{tr('показувати «у розробці»', '«in ontwikkeling» tonen')}</label>
      </div>

      <div className='v2-risico-balk' aria-live='polite'>
        {kanten.map((k) => (
          <span key={k} className={`v2-kant-teller kant-${k}`}>{k === 'beheer' ? <Wrench size={14} /> : <UserRound size={14} />}{KANT_TEKST[k][uk ? 'uk' : 'nl']}: <b>{aanTotaal(k)}</b></span>
        ))}
        {risicoTelling.filter((x) => x.n).map((x) => <span key={x.r} className={`v2-chip risico-${x.r}`}>{RISICO_TEKST[x.r][uk ? 'uk' : 'nl']}: {x.n}</span>)}
      </div>

      {vs ? (
        <section className='v2-verschil' aria-label={tr('Що зміниться після перепідключення', 'Wat er verandert na opnieuw verbinden')}>
          {([['toegevoegd', tr('Буде додано', 'Wordt toegevoegd'), 'nieuw'], ['behouden', tr('Вже було', 'Had u al'), 'was'], ['vervalt', tr('Не буде додано', 'Wordt niet toegevoegd'), 'weg']] as const).map(([veld, kop, cls]) => (
            <div key={veld} className={`v2-verschil-deel is-${cls}`} data-v2-verschil={veld}>
              <h4>{kop} <span className='v2-teller'>{vs[veld].length}</span></h4>
              {vs[veld].length ? (
                <ul>{vs[veld].map((k) => { const o = V2_OPTIES.find((x) => x.key === k); if (!o) return null; return (
                  <li key={k}><Schakelaar klein aan={set.has(k)} kant={o.kant} label={(uk ? o.uk : o.nl)[0]} onChange={(v) => zet(k, v)} /><span>{(uk ? o.uk : o.nl)[0]}</span></li>
                ); })}</ul>
              ) : <p className='v2-leeg'>{tr('Нічого', 'Niets')}</p>}
            </div>
          ))}
        </section>
      ) : null}

      {(['gebruiker', 'beheer'] as const).filter((k) => kanten.includes(k)).map((kant) => {
        const groepen = V2_GROEPEN.filter((g) => g.kant === kant || g.kant === 'beide');
        const kantNuUit = kant === 'beheer' && techNu === false;
        return (
          <section key={kant} className={`v2-kant kant-${kant}${kantNuUit ? ' is-nu-uit' : ''}`} data-v2-kant={kant} data-v2-nu-uit={kantNuUit ? '1' : undefined}>
            <header className='v2-kant-kop'>
              <span className='v2-kant-icoon' aria-hidden='true'>{kant === 'beheer' ? <Wrench size={18} /> : <UserRound size={18} />}</span>
              <div>
                <h3>{KANT_TEKST[kant][uk ? 'uk' : 'nl']}</h3>
                <p>{uk ? KANT_TEKST[kant].uitlegUk : KANT_TEKST[kant].uitlegNl}</p>
                {kantNuUit ? (
                  <p className='v2-let-klein' role='note'>
                    {tr('Технічний профіль зараз вимкнений, тож ШІ цих інструментів не бачить і викликати їх не може. Дозвіл зберігається: вони з’являться самі, щойно ви ввімкнете технічний профіль, і зникнуть, щойно вийдете з нього. Перепідключати конектор не потрібно.',
                        'Het technische profiel staat nu uit, dus de AI ziet deze hulpmiddelen niet en kan ze niet aanroepen. Het recht blijft bewaard: ze komen terug zodra u het technische profiel aanzet en verdwijnen zodra u het verlaat. Opnieuw verbinden is niet nodig.')}
                  </p>
                ) : null}
              </div>
              <ModusKeuze tr={tr} uk={uk} label={tr('Режим для всього простору', 'Modus voor de hele ruimte')} huidig={modusVan(waarde, kanten, { kant })} onKies={(m) => onChange(pasModusToe(waarde, m, kanten, { kant }))} />
            </header>
            {groepen.map((g) => {
              const opties = V2_OPTIES.filter((o) => o.kant === kant && o.groep === g.id);
              const zichtbaar = opties.filter(past);
              if (!zichtbaar.length) return null;
              const actief = opties.filter((o) => o.status === 'actief');
              const aantalAan = actief.filter((o) => set.has(o.key)).length;
              const dicht = !!groepDicht[`${kant}:${g.id}`] && !q;
              const modus = modusVan(waarde, kanten, { kant, groep: g.id as GroepId });
              return (
                <div key={g.id} className='v2-groep' data-v2-groep={g.id}>
                  <div className='v2-groep-kop'>
                    <Schakelaar aan={aantalAan > 0} kant={kant} disabled={!actief.length} label={tr(`Категорія «${g.uk}»: увімкнути або вимкнути`, `Categorie «${g.nl}» aan of uit`)}
                      onChange={(v) => onChange(pasModusToe(waarde, v ? 'lezen' : 'geen', kanten, { kant, groep: g.id as GroepId }))} />
                    <button type='button' className='v2-groep-naam' aria-expanded={!dicht} onClick={() => setGroepDicht((d) => ({ ...d, [`${kant}:${g.id}`]: !dicht }))}>
                      <span className='v2-groep-icoon' aria-hidden='true'>{groepIcoon(g.icoon)}</span>
                      <span>{uk ? g.uk : g.nl}</span>
                      <span className='v2-teller'>{aantalAan}/{actief.length}</span>
                      {!actief.length ? <span className='v2-chip is-dev'><Construction size={12} />{tr('у розробці', 'in ontwikkeling')}</span> : null}
                      <ChevronDown size={16} className='v2-klap' aria-hidden='true' />
                    </button>
                    {actief.length ? <ModusKeuze compact tr={tr} uk={uk} label={tr(`Режим для «${g.uk}»`, `Modus voor «${g.nl}»`)} huidig={modus} onKies={(m) => onChange(pasModusToe(waarde, m, kanten, { kant, groep: g.id as GroepId }))} /> : null}
                  </div>
                  {!dicht ? (
                    <ul className='v2-opties'>
                      {zichtbaar.map((o) => (
                        <OptieRij key={o.key} o={o} aan={set.has(o.key)} agent={agent} uk={uk} tr={tr} onToggle={(v) => zet(o.key, v)} markering={markering(o.key)}
                          nuUit={kantNuUit} uitgeklapt={!!open[o.key]} onKlap={() => setOpen((x) => ({ ...x, [o.key]: !x[o.key] }))} />
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
