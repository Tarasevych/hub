// Meldingen v2 (vlag `meldingen-v2`, standaard UIT) — het compacte aandachtscentrum. Vervangt BINNEN het bestaande paneel van
// CanoniekMeldingencentrum (zelfde bel, zelfde plaats, zelfde gegevens) de kop, de lijst en de voettools. Zie
// docs/meldingen-v2/INVENTARIS-EN-OORZAKEN.md voor wat er mis was en waarom het zo is opgebouwd.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Archive, ArrowLeft, BellOff, Check, CheckCheck, CircleAlert, CircleCheck, Ellipsis, ExternalLink, History, Info, ListFilter,
  Minimize2, Moon, Search, Settings2, ShieldCheck, TriangleAlert, Volume2, VolumeX, X, Clock, RotateCcw, ListChecks, EyeOff,
} from 'lucide-react';
import { pasStatusToe, tabLijst, verborgenReden, verborgenTelling, TABS, type Tab, type MeldingStatus } from '../../../shared/meldingen-v2/status';
import { useStatusStand, wijzigStatus } from './status-opslag';
import HistorieV3, { BewaarTermijn } from './HistorieV3';
import { styleOf, type Section } from '../../melding-stijl';
import { Logo, type LogoKind } from '../../mcp-ui';
import { LEVER_MODI, NIET_STOREN_KEUZES_MIN, zetNietStoren, zetRegel, geldendeRegel, type LeverModus, type LeverRegels } from '../../../shared/meldingen-v2/beleid';
import { accountsPerAanbieder, accountWeergave, actieveFilters, filter as filterGroepen, vraagtAandacht, type Ernst, type Filters, type Toestand, type V2Groep, type V2Melding, type Weergave } from '../../../shared/meldingen-v2/groepering';
import { bewaarRegels } from './regels-opslag';
import { DICHTHEDEN, STANDAARD_WEERGAVE, TEKSTGROOTTES, type PaneelWeergave } from '../../../shared/meldingen-v2/beleid';
import { useUitlegV3 } from './vlag-uitleg';
import MeldingUitleg from './MeldingUitleg';
import { laterActief, zetLater } from './later';
import type { Bronnen } from './model';
import { bouwModel } from './model';
import './meldingen-v2.css';

type Lang = 'uk' | 'nl';
export type MeldingenV2Props = Bronnen & {
  regels: LeverRegels;
  onReadLocal: (id: string) => void; onReadServer?: (id: string) => void | Promise<void>; onReadEvent: (id: string) => void;
  onMarkAll: () => void | Promise<void>; geluid: boolean; onGeluid: () => void; onSluiten: () => void;
  tech?: { aantal: number; open: () => void; tekst: string } | null;
  /** Voor schermafbeeldingen/tests: vaste «nu». */
  nu?: number;
  /** Tests: vlag meldingen-uitleg-v3 forceren (anders de echte vlag). */
  uitlegV3?: boolean;
};

const SECTIE_VAN_DIENST: Record<string, Section> = { post: 'mail', cloud: 'cloud', agenda: 'calendar', huis: 'huis', github: 'github', ai: 'ai', identity: 'identity', browser: 'browser', site: 'site' };
const LOGO_OK = new Set<string>(['google', 'microsoft', 'github', 'claude', 'windows', 'linux', 'macos', 'chrome', 'edge', 'opera', 'brave', 'firefox', 'docker']);
const AANBIEDER_NAAM: Record<string, string> = { google: 'Google', microsoft: 'Microsoft', dropbox: 'Dropbox', homeassistant: 'Home Assistant', github: 'GitHub', claude: 'Claude', nextcloud: 'Nextcloud', icloud: 'iCloud' };
const MODUS_NAAM: Record<LeverModus, [string, string]> = { prioriteit: ['Пріоритетне', 'Prioriteit'], normaal: ['Звичайне', 'Normaal'], stil: ['Тихе', 'Stil'], uit: ['Вимкнене', 'Uit'] };
const MODUS_UITLEG: Record<LeverModus, [string, string]> = {
  prioriteit: ['Звук, спливне вікно, лічильник та історія', 'Geluid, pop-up, teller en geschiedenis'],
  normaal: ['Без звуку; лічильник та історія', 'Geen geluid; teller en geschiedenis'],
  stil: ['Лише в історії', 'Alleen in de geschiedenis'],
  uit: ['Не показувати в центрі (обов’язкові записи лишаються)', 'Niet in het centrum (verplichte registratie blijft)'],
};
const ERNST_ICON: Record<Ernst, typeof Info> = { fout: CircleAlert, aandacht: TriangleAlert, succes: CircleCheck, info: Info };

function relatief(t: number, nu: number, lang: Lang) {
  const s = Math.max(0, Math.round((nu - t) / 1000));
  if (s < 60) return lang === 'uk' ? 'щойно' : 'zojuist';
  const m = Math.round(s / 60); if (m < 60) return lang === 'uk' ? `${m} хв` : `${m} min`;
  const h = Math.round(m / 60); if (h < 24) return lang === 'uk' ? `${h} год` : `${h} u`;
  const d = Math.round(h / 24); return lang === 'uk' ? `${d} дн` : `${d} d`;
}
const tijdLang = (t: number, lang: Lang) => new Date(t).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'medium', timeStyle: 'short' });

export default function MeldingenV2(p: MeldingenV2Props) {
  const lang = p.lang, t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const nu = p.nu ?? Date.now();
  // UI-014: vlag meldingen-uitleg-v3 (standaard UIT) — uitleg + snelle acties in de kaart, en de instelbare grootte.
  const v3Vlag = useUitlegV3();
  const v3 = p.uitlegV3 ?? v3Vlag;
  const weergaveGr: PaneelWeergave = p.regels.weergave || STANDAARD_WEERGAVE;
  const [later, setLater] = useState<Record<string, number>>(() => laterActief(nu));
  // UI-014 fase 2B: blijvende status per melding (server) — alleen met de vlag.
  const statusStand = useStatusStand(v3);
  const model = useMemo(() => bouwModel(p, p.regels, nu, v3 ? (ms) => pasStatusToe(ms, statusStand, nu) : undefined), [p.local, p.server, p.events, p.readEvents, p.lang, p.regels, nu, v3, statusStand]);
  const [tab, setTab] = useState<Tab>(() => (model.tellers.aandacht ? 'belangrijk' : 'alle'));
  const [toonVerborgen, setToonVerborgen] = useState(false);
  const [kiezen, setKiezen] = useState(false);
  const [gekozen, setGekozen] = useState<Set<string>>(() => new Set());
  const [weergave, setWeergave] = useState<Weergave>(() => (model.tellers.aandacht ? 'belangrijk' : 'alle'));
  const [zoekOpen, setZoekOpen] = useState(false);
  const [f, setF] = useState<Filters>({});
  const [paneel, setPaneel] = useState<null | 'filters' | 'niet-storen' | 'regels'>(null);
  const [geschiedenis, setGeschiedenis] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [menuPlek, setMenuPlek] = useState<{ top?: number; bottom?: number; right: number }>({ right: 8 });
  const [lokaal, setLokaal] = useState<Record<string, Toestand>>({});
  const [melding, setMelding] = useState<string | null>(null);
  const [volledigAdres, setVolledigAdres] = useState(false);
  const zoekRef = useRef<HTMLInputElement>(null);
  const wortel = useRef<HTMLDivElement>(null);
  // «Уся історія» = apart scherm: het paneel wordt volledig (CSS is-v2-volledig), terug = weer het compacte paneel.
  useEffect(() => { wortel.current?.closest('.canonical-notification-panel')?.classList.toggle('is-v2-volledig', geschiedenis); }, [geschiedenis]);
  useEffect(() => { if (zoekOpen) zoekRef.current?.focus(); }, [zoekOpen]);
  // UI-014: grootte op het hele paneel (breedte/hoogte schalen mee met de tekst; zie meldingen-v2.css «weergavegrootte»).
  useEffect(() => {
    const paneelEl = wortel.current?.closest<HTMLElement>('.canonical-notification-panel');
    if (!paneelEl) return;
    if (v3) { paneelEl.dataset.mv2Tekst = weergaveGr.tekst; paneelEl.dataset.mv2Dichtheid = weergaveGr.dichtheid; }
    else { delete paneelEl.dataset.mv2Tekst; delete paneelEl.dataset.mv2Dichtheid; }
  }, [v3, weergaveGr.tekst, weergaveGr.dichtheid]);

  // Esc sluit eerst de open laag (menu → paneel → zoeken); pas daarna sluit het bestaande paneel zelf (data-mv2-esc, CanoniekMeldingencentrum).
  const eigenEsc = !!(menu || paneel || zoekOpen || geschiedenis);
  const opEsc = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !eigenEsc) return;
    e.preventDefault();
    if (menu) setMenu(null); else if (paneel) setPaneel(null); else if (zoekOpen) { setZoekOpen(false); setF((c) => ({ ...c, zoek: '' })); } else setGeschiedenis(false);
  };
  const groepen = useMemo(() => model.groepen.map((g) => (lokaal[g.sleutel] ? { ...g, toestand: lokaal[g.sleutel] } : g)), [model.groepen, lokaal]);
  const lijstOud = useMemo(() => filterGroepen(groepen, geschiedenis ? 'alle' : weergave, f).filter((g) => geschiedenis || !(later[g.sleutel] > nu)), [groepen, weergave, f, geschiedenis, later, nu]);
  // v3: één functie voor lijst ÉN teller per tab (shared/meldingen-v2/status.ts tabLijst) → tellers = lijstlengtes, ook met filters.
  const metFilters = (l: V2Groep[]) => filterGroepen(l.map((g) => (g.levering.centrum ? g : { ...g, levering: { ...g.levering, centrum: true } })), 'alle', f);
  const v3Tabs = useMemo(() => (v3 ? Object.fromEntries(TABS.map((x) => [x, metFilters(tabLijst(groepen, x, nu, { toonVerborgen }))])) as Record<Tab, V2Groep[]> : null), [v3, groepen, nu, toonVerborgen, f]);
  const lijst = v3Tabs && !geschiedenis ? v3Tabs[tab] : lijstOud;
  const verborgen = useMemo(() => (v3 ? verborgenTelling(groepen, nu) : null), [v3, groepen, nu]);
  const uitgesteldN = v3 ? groepen.filter((g) => (g.hoofd.uitgesteldTot || 0) > nu).length : 0;
  const zetGroepen = async (gs: V2Groep[], status: MeldingStatus | 'nieuw', hoe: 'kaart' | 'bulk', tot?: number, uitleg?: string) => {
    const ids = gs.flatMap((g) => g.leden.map((x) => x.id));
    const beveiliging = gs.filter((g) => g.levering.beschermd).flatMap((g) => g.leden.map((x) => x.id));
    if (status !== 'gelezen' && status !== 'nieuw') gs.forEach(markeerGroep);
    const ok = await wijzigStatus({ ids, status, hoe, tot, beveiliging });
    setMelding(ok ? (uitleg || t('Збережено.', 'Opgeslagen.')) : t('Не вдалося зберегти. Спробуйте ще раз.', 'Opslaan mislukt. Probeer opnieuw.'));
  };
  const perAanbieder = useMemo(() => accountsPerAanbieder(model.meldingen), [model.meldingen]);
  const aandacht = groepen.filter(vraagtAandacht).length, ongelezen = groepen.filter((g) => g.ongelezen && g.levering.centrum).length;
  const dnd = p.regels.nietStoren && p.regels.nietStoren.tot > nu ? p.regels.nietStoren : null;
  const nFilters = actieveFilters(f);

  const markeer = (m: V2Melding) => { if (m.gelezen) return; const id = m.id.slice(2); if (m.id.startsWith('s:')) void p.onReadServer?.(id); else if (m.id.startsWith('l:')) p.onReadLocal(id); else p.onReadEvent(id); };
  const markeerGroep = (g: V2Groep) => { g.leden.forEach(markeer); if (v3) { const terug = g.leden.filter((x) => x.terugOp).map((x) => x.id); if (terug.length) void wijzigStatus({ ids: terug, status: 'gelezen', hoe: 'kaart' }); } };
  const regel = async (doel: { dienst?: string; account?: string; categorie?: string }, modus: LeverModus | null, uitleg: string) => {
    const ok = await bewaarRegels(zetRegel(p.regels, doel, modus));
    setMelding(ok ? uitleg : t('Не вдалося зберегти. Спробуйте ще раз.', 'Opslaan mislukt. Probeer opnieuw.'));
  };

  const dienstNaam = (d: string) => styleOf(SECTIE_VAN_DIENST[d] || 'site', lang).label;
  const bronBadge = (m: V2Melding) => {
    const st = styleOf(SECTIE_VAN_DIENST[m.dienst] || 'site', lang);
    const meerdere = (perAanbieder.get(m.aanbieder || m.dienst) || 0) > 1;
    const acc = accountWeergave(m, meerdere, volledigAdres);
    const aanb = m.aanbieder ? AANBIEDER_NAAM[m.aanbieder] || m.aanbieder : '';
    return { Icon: st.Icon, label: st.label, aanbieder: aanb, logo: m.aanbieder && LOGO_OK.has(m.aanbieder) ? (m.aanbieder as LogoKind) : null, account: acc };
  };

  const rij = (g: V2Groep) => {
    const m = g.hoofd, b = bronBadge(m), EIcon = ERNST_ICON[g.ernst], isOpen = open === g.sleutel, id = `mv2-${g.sleutel.replace(/[^a-z0-9]/gi, '_').slice(0, 60)}`;
    const toestandTekst = g.toestand === 'actie' ? t('Потребує дії', 'Actie nodig') : g.toestand === 'opgelost' ? t('Вирішено', 'Opgelost') : g.toestand === 'archief' ? t('В архіві', 'Gearchiveerd') : '';
    return (
      <li key={g.sleutel} className={`mv2-rij e-${g.ernst}${g.ongelezen ? ' is-nieuw' : ''}${isOpen ? ' is-open' : ''}${kiezen ? ' is-kiezen' : ''}`} data-modus={g.levering.modus} data-toestand={g.toestand} data-verborgen={v3 ? verborgenReden(g) || undefined : undefined} aria-labelledby={id}>
        {v3 && kiezen ? <label className='mv2-kies'><input type='checkbox' checked={gekozen.has(g.sleutel)} aria-label={t(`Вибрати: ${m.titel}`, `Kiezen: ${m.titel}`)} onChange={() => setGekozen((c) => { const n = new Set(c); if (n.has(g.sleutel)) n.delete(g.sleutel); else n.add(g.sleutel); return n; })} /></label> : null}
        <span className='mv2-status' aria-hidden='true'><b.Icon className='mv2-bron-icoon' />{g.ernst !== 'info' ? <EIcon className='mv2-ernst' /> : null}</span>
        <button type='button' className='mv2-hoofd' aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : g.sleutel); markeerGroep(g); }}>
          <span className='mv2-titel' id={id}>{g.ongelezen ? <i className='mv2-punt' aria-label={t('Непрочитане', 'Ongelezen')} /> : null}{m.titel}{v3 && m.object && /^command\.fs\./.test(m.soort || '') ? <span className='mv2-object'>{` · ${m.object.split(/[\\/]/).pop()}`}</span> : null}</span>
          <span className='mv2-meta'>
            <span className='mv2-bron'>{b.label}</span>
            {b.aanbieder ? <span className='mv2-aanbieder'>{b.logo ? <Logo kind={b.logo} size={12} label={b.aanbieder} /> : null}{b.aanbieder}</span> : null}
            {b.account ? <span className='mv2-account' title={volledigAdres ? undefined : t('Акаунт', 'Account')}>{b.account}</span> : null}
            {toestandTekst ? <span className={`mv2-toestand t-${g.toestand}`}>{toestandTekst}</span> : null}
            {v3 && g.hoofd.terugOp ? <span className='mv2-toestand t-terug'>{t('Повернулось після відкладення', 'Terug na uitstel')}</span> : null}
            {v3 && toonVerborgen && verborgenReden(g) ? <span className='mv2-toestand t-verborgen'><EyeOff aria-hidden='true' />{verborgenReden(g) === 'stil-standaard' ? t('Тихе за замовчуванням', 'Standaard stil') : verborgenReden(g) === 'regel-uit' ? t('Вимкнено правилом', 'Uit door regel') : t('Тихе за правилом', 'Stil door regel')}</span> : null}
            <time dateTime={new Date(m.tijd).toISOString()} title={tijdLang(m.tijd, lang)}>{relatief(m.tijd, nu, lang)}</time>
            {g.aantal > 1 ? <span className='mv2-aantal' title={t(`${g.aantal} подій цього процесу`, `${g.aantal} gebeurtenissen van dit proces`)}>×{g.aantal}</span> : null}
          </span>
        </button>
        <div className='mv2-menu-houder'>
          <button type='button' className='mv2-ikoon' aria-haspopup='menu' aria-expanded={menu === g.sleutel} aria-label={t('Дії', 'Acties')} aria-describedby={id} data-tip={t('Дії', 'Acties')} onClick={(e) => { if (menu === g.sleutel) { setMenu(null); return; } const w = wortel.current?.getBoundingClientRect(), b = e.currentTarget.getBoundingClientRect(); if (w) { const onder = w.bottom - b.bottom, boven = b.top - w.top; setMenuPlek(onder >= 300 || onder >= boven ? { top: b.bottom - w.top + 2, right: Math.max(6, w.right - b.right) } : { bottom: w.bottom - b.top + 2, right: Math.max(6, w.right - b.right) }); } setMenu(g.sleutel); }}><Ellipsis aria-hidden='true' /></button>
        </div>
        {isOpen ? (
          <div className='mv2-detail'>
            {m.tekst ? <p>{m.tekst}</p> : null}
            {v3 && statusStand.items[m.id] && statusStand.items[m.id].s !== 'gelezen' ? (() => { const it = statusStand.items[m.id]; return <p className='mv2-statusinfo' data-mv2-statusinfo='1'>{{ opgelost: t('Вирішено', 'Opgelost'), archief: t('В архіві', 'Gearchiveerd'), uitgesteld: t('Відкладено', 'Uitgesteld'), gelezen: '' }[it.s]}{' · '}{it.hoe === 'automatisch' ? t('автоматично (термін зберігання)', 'automatisch (bewaartermijn)') : t('ви', 'u')}{' · '}{tijdLang(it.op, lang)}{it.hoe === 'bulk' ? t(' · кілька разом', ' · meerdere tegelijk') : it.hoe === 'kaart' ? t(' · у картці', ' · in de kaart') : ''}</p>; })() : null}
            {v3 && toonVerborgen && verborgenReden(g) ? <p className='mv2-statusinfo'><EyeOff aria-hidden='true' />{verborgenReden(g) === 'stil-standaard' ? t('Успішні фонові дії типово тихі: їх видно лише тут і в «Уся історія».', 'Geslaagd achtergrondwerk is standaard stil: alleen hier en in «Volledige geschiedenis».') : t('Приховано вашим правилом для цього джерела.', 'Verborgen door uw regel voor deze bron.')}{' '}<button type='button' className='mv2-tekstknop' onClick={() => { setPaneel('regels'); }}>{t('Відкрити правило', 'Regel openen')}</button></p> : null}
            {v3 ? <MeldingUitleg lang={lang} groep={g} nu={nu} beschermd={g.levering.beschermd}
              onGelezen={() => markeerGroep(g)}
              onLater={() => { setLater(zetLater(g.sleutel, nu + 3600_000)); setOpen(null); setMelding(t('Нагадаю через годину.', 'Herinnering over een uur.')); }}
              onTypeStil={() => void regel({ dienst: m.dienst, categorie: m.categorie || m.soort }, 'stil', t('Такі події тепер тихі.', 'Zulke gebeurtenissen zijn nu stil.'))} /> : null}
            {g.openFout && g.hoofd.ernst !== 'fout' ? <p className='mv2-let'><CircleAlert aria-hidden='true' />{t('Раніше в цьому процесі була помилка, яку ще не вирішено.', 'Eerder in dit proces trad een fout op die nog niet is opgelost.')}</p> : null}
            {g.aantal > 1 ? (
              <details className='mv2-verloop'><summary>{t(`Історія запусків (${g.aantal})`, `Verloop (${g.aantal})`)}</summary>
                <ol>{g.leden.slice(0, 50).map((x) => <li key={x.id} className={`e-${x.ernst}`}><time>{tijdLang(x.tijd, lang)}</time><span>{x.titel}{x.object ? ` · ${x.object}` : ''}</span></li>)}</ol>
              </details>
            ) : null}
            {m.technischeTekst ? <details className='mv2-tech'><summary>{t('Технічні подробиці', 'Technische details')}</summary><code>{m.technischeTekst}</code></details> : null}
            {m.link && !v3 ? <a className='mv2-knop-link' href={m.link} onClick={() => markeerGroep(g)}>{t('Відкрити', 'Openen')}<ExternalLink aria-hidden='true' /></a> : null}
          </div>
        ) : null}
      </li>
    );
  };

  const menuInhoud = (g: V2Groep) => {
    const m = g.hoofd;
    return (
      <>
              {g.ongelezen ? <button role='menuitem' type='button' onClick={() => { markeerGroep(g); setMenu(null); }}><Check aria-hidden='true' />{t('Позначити прочитаним', 'Als gelezen markeren')}</button> : null}
              {m.link ? <a role='menuitem' href={m.link} onClick={() => markeerGroep(g)}><ExternalLink aria-hidden='true' />{t('Відкрити джерело', 'Bron openen')}</a> : null}
              {v3 ? <>
                {g.toestand !== 'opgelost' ? <button role='menuitem' type='button' onClick={() => { void zetGroepen([g], 'opgelost', 'kaart', undefined, t('Позначено вирішеним.', 'Als opgelost gemarkeerd.')); setMenu(null); }}><CircleCheck aria-hidden='true' />{t('Позначити вирішеним', 'Als opgelost markeren')}</button> : null}
                {g.toestand !== 'archief' ? <button role='menuitem' type='button' onClick={() => { void zetGroepen([g], 'archief', 'kaart', undefined, t('Перенесено в архів.', 'Naar het archief.')); setMenu(null); }}><Archive aria-hidden='true' />{t('В архів', 'Archiveren')}</button> : null}
                <button role='menuitem' type='button' onClick={() => { void zetGroepen([g], 'uitgesteld', 'kaart', nu + 3600_000, t('Відкладено на годину.', 'Een uur uitgesteld.')); setMenu(null); }}><Clock aria-hidden='true' />{t('Відкласти на годину', 'Een uur uitstellen')}</button>
                <button role='menuitem' type='button' onClick={() => { void zetGroepen([g], 'uitgesteld', 'kaart', morgen(nu), t('Відкладено до завтра, 9:00.', 'Uitgesteld tot morgen 9:00.')); setMenu(null); }}><Clock aria-hidden='true' />{t('Відкласти до завтра', 'Uitstellen tot morgen')}</button>
                {g.toestand === 'opgelost' || g.toestand === 'archief' ? <button role='menuitem' type='button' onClick={() => { void zetGroepen([g], 'nieuw', 'kaart', undefined, t('Повернуто в нові.', 'Terug naar nieuw.')); setMenu(null); }}><RotateCcw aria-hidden='true' />{t('Повернути в нові', 'Terugzetten naar nieuw')}</button> : null}
              </> : <>
              {g.toestand !== 'opgelost' ? <button role='menuitem' type='button' onClick={() => { setLokaal((c) => ({ ...c, [g.sleutel]: 'opgelost' })); markeerGroep(g); setMenu(null); }}><CircleCheck aria-hidden='true' />{t('Позначити вирішеним', 'Als opgelost markeren')}</button> : null}
              <button role='menuitem' type='button' onClick={() => { setLokaal((c) => ({ ...c, [g.sleutel]: 'archief' })); markeerGroep(g); setMenu(null); }}><Archive aria-hidden='true' />{t('В архів', 'Archiveren')}</button>
              </>}
              <hr />
              {g.levering.beschermd
                ? <p className='mv2-menu-uitleg'><ShieldCheck aria-hidden='true' />{t('Важливе для безпеки — приглушити не можна.', 'Belangrijk voor de beveiliging — dempen kan niet.')}</p>
                : <>
                  <button role='menuitem' type='button' onClick={() => { void regel({ dienst: m.dienst, categorie: m.categorie || m.soort }, 'stil', t('Такі події тепер тихі.', 'Zulke gebeurtenissen zijn nu stil.')); setMenu(null); }}><BellOff aria-hidden='true' />{t('Зробити тихими події цього типу', 'Dit soort gebeurtenissen stil maken')}</button>
                  {m.account ? <button role='menuitem' type='button' onClick={() => { void regel({ account: m.account }, 'uit', t('Сповіщення цього акаунта вимкнено.', 'Meldingen van dit account staan uit.')); setMenu(null); }}><VolumeX aria-hidden='true' />{t('Вимкнути повідомлення цього акаунта', 'Meldingen van dit account uitzetten')}</button> : null}
                </>}
              <button role='menuitem' type='button' onClick={() => { setPaneel('regels'); setF({ ...f, dienst: [m.dienst] }); setMenu(null); }}><Settings2 aria-hidden='true' />{t('Налаштувати джерело', 'Bron instellen')}</button>
      </>
    );
  };
  const keuzeLijst = (veld: 'dienst' | 'account' | 'categorie', opties: Array<[string, string]>) => (
    <div className='mv2-chips' role='group'>
      {opties.map(([w, label]) => { const aan = (f[veld] || []).includes(w); return <button key={w} type='button' aria-pressed={aan} onClick={() => setF((c) => ({ ...c, [veld]: aan ? (c[veld] || []).filter((x) => x !== w) : [...(c[veld] || []), w] }))}>{label}</button>; })}
    </div>
  );
  const menuGroep = menu ? groepen.find((g) => g.sleutel === menu) || null : null;
  const diensten = [...new Set(model.meldingen.map((m) => m.dienst))];
  const accounts = [...new Map(model.meldingen.filter((m) => m.account).map((m) => [m.account!, accountWeergave(m, true, volledigAdres) || m.account!])).entries()];

  const kop = (
    <header className='mv2-kop'>
      {geschiedenis || paneel === 'regels' ? <button type='button' className='mv2-ikoon' aria-label={t('Назад', 'Terug')} data-tip={t('Назад', 'Terug')} onClick={() => { setGeschiedenis(false); setPaneel(null); }}><ArrowLeft aria-hidden='true' /></button> : null}
      <h2 className='mv2-kop-titel'>{paneel === 'regels' ? t('Правила сповіщень', 'Meldingsregels') : geschiedenis ? t('Уся історія', 'Volledige geschiedenis') : t('Сповіщення', 'Meldingen')}
        {paneel !== 'regels' && aandacht ? <span className='mv2-teller is-aandacht' role='status' aria-label={t(`Потребують уваги: ${aandacht}`, `Vragen aandacht: ${aandacht}`)}>{aandacht}</span> : null}
      </h2>
      <div className='mv2-kop-ikonen'>
        {paneel !== 'regels' ? <>
          <button type='button' className='mv2-ikoon' aria-label={t('Пошук', 'Zoeken')} data-tip={t('Пошук', 'Zoeken')} aria-expanded={zoekOpen} onClick={() => { setZoekOpen((v) => !v); if (zoekOpen) setF((c) => ({ ...c, zoek: '' })); }}><Search aria-hidden='true' /></button>
          <button type='button' className={`mv2-ikoon${nFilters ? ' is-actief' : ''}`} aria-label={nFilters ? t(`Фільтри (активних: ${nFilters})`, `Filters (actief: ${nFilters})`) : t('Фільтри й порядок', 'Filters en volgorde')} data-tip={t('Фільтри й порядок', 'Filters en volgorde')} aria-expanded={paneel === 'filters'} onClick={() => setPaneel(paneel === 'filters' ? null : 'filters')}><ListFilter aria-hidden='true' />{nFilters ? <i className='mv2-stip' aria-hidden='true' /> : null}</button>
          <button type='button' className={`mv2-ikoon${dnd ? ' is-actief' : ''}`} aria-label={t('Не турбувати', 'Niet storen')} data-tip={t('Не турбувати', 'Niet storen')} aria-expanded={paneel === 'niet-storen'} onClick={() => setPaneel(paneel === 'niet-storen' ? null : 'niet-storen')}><Moon aria-hidden='true' /></button>
        </> : null}
        <button type='button' className='mv2-ikoon' aria-label={t('Згорнути', 'Inklappen')} data-tip={t('Згорнути', 'Inklappen')} onClick={p.onSluiten}><Minimize2 aria-hidden='true' /></button>
      </div>
    </header>
  );

  if (paneel === 'regels') {
    const doelen: Array<{ doel: { dienst?: string; account?: string }; naam: string; sub?: string }> = [
      ...diensten.map((d) => ({ doel: { dienst: d }, naam: dienstNaam(d) })),
      ...accounts.map(([a, label]) => ({ doel: { account: a }, naam: label, sub: t('Акаунт', 'Account') })),
    ];
    return (
      <div ref={wortel} className='mv2' data-mv2='regels' data-mv2-esc='1' onKeyDown={opEsc}>
        {kop}
        <div className='mv2-regels'>
          {v3 ? <fieldset className='mv2-regel mv2-grootte' data-mv2-grootte='1'>
            <legend>{t('Розмір сповіщень', 'Grootte van de meldingen')}<small>{t('Панель збільшується разом із текстом', 'Het paneel groeit mee met de tekst')}</small></legend>
            <div className='mv2-segment is-klein' role='radiogroup' aria-label={t('Розмір тексту', 'Tekstgrootte')}>
              {TEKSTGROOTTES.map((g) => <button key={g} type='button' role='radio' aria-checked={weergaveGr.tekst === g} onClick={() => void bewaarRegels({ ...p.regels, weergave: { ...weergaveGr, tekst: g }, bijgewerkt: Date.now() })}>{g === 'S' ? t('Малий', 'Klein') : g === 'M' ? t('Звичайний', 'Normaal') : g === 'L' ? t('Великий', 'Groot') : t('Дуже великий', 'Zeer groot')}</button>)}
            </div>
            <div className='mv2-segment is-klein' role='radiogroup' aria-label={t('Щільність', 'Dichtheid')}>
              {DICHTHEDEN.map((d) => <button key={d} type='button' role='radio' aria-checked={weergaveGr.dichtheid === d} onClick={() => void bewaarRegels({ ...p.regels, weergave: { ...weergaveGr, dichtheid: d }, bijgewerkt: Date.now() })}>{d === 'compact' ? t('Щільно', 'Compact') : d === 'normaal' ? t('Звичайно', 'Normaal') : t('Просторо', 'Ruim')}</button>)}
            </div>
            <p className='mv2-uitleg' data-mv2-voorbeeld='1'>{t('Зміна видно одразу на цій панелі й зберігається для вашого облікового запису на всіх пристроях.', 'De wijziging is meteen zichtbaar in dit paneel en wordt voor uw account op al uw apparaten bewaard.')}</p>
          </fieldset> : null}
          {v3 ? <BewaarTermijn lang={lang} dagen={statusStand.bewaarDagen} /> : null}
          <p className='mv2-uitleg'>{t('Правила зберігаються в обліковому записі й діють на всіх пристроях. Сповіщення безпеки та запити на підтвердження приглушити не можна.', 'Regels worden in uw account bewaard en gelden op al uw apparaten. Beveiligingsmeldingen en bevestigingsverzoeken kunnen niet gedempt worden.')}</p>
          <ul className='mv2-modi-uitleg'>{LEVER_MODI.map((m) => <li key={m}><b>{t(...MODUS_NAAM[m])}</b> — {t(...MODUS_UITLEG[m])}</li>)}</ul>
          {doelen.map(({ doel, naam, sub }) => {
            const huidig = geldendeRegel(p.regels, doel)?.modus;
            const sleutel = doel.dienst || doel.account || '';
            const exact = p.regels.regels.find((r) => (doel.dienst ? r.dienst === doel.dienst && !r.account && !r.categorie : r.account === doel.account && !r.dienst && !r.categorie));
            return (
              <fieldset key={sleutel} className='mv2-regel'>
                <legend>{naam}{sub ? <small>{sub}</small> : null}</legend>
                <div className='mv2-segment is-klein' role='radiogroup' aria-label={naam}>
                  {LEVER_MODI.map((m) => <button key={m} type='button' role='radio' aria-checked={(exact?.modus || huidig || 'normaal') === m} title={t(...MODUS_UITLEG[m])} onClick={() => void regel(doel, m === 'normaal' ? null : m, t('Збережено.', 'Opgeslagen.'))}>{t(...MODUS_NAAM[m])}</button>)}
                </div>
              </fieldset>
            );
          })}
          <label className='mv2-schakel'><input type='checkbox' checked={volledigAdres} onChange={(e) => setVolledigAdres(e.target.checked)} /><span>{t('Показувати повні адреси акаунтів', 'Volledige accountadressen tonen')}</span></label>
          <label className='mv2-schakel'><input type='checkbox' checked={p.geluid} onChange={p.onGeluid} /><span>{t('Звук для пріоритетних', 'Geluid bij prioriteit')}</span></label>
          {melding ? <p className='mv2-toast' role='status'>{melding}</p> : null}
        </div>
      </div>
    );
  }

  if (v3 && geschiedenis) {
    return (
      <div ref={wortel} className='mv2 is-geschiedenis' data-mv2-esc='1' onKeyDown={opEsc} data-mv2='geschiedenis'>
        {kop}
        <HistorieV3 lang={lang} meldingen={model.meldingen} stand={statusStand} nu={nu} dienstNaam={dienstNaam} />
      </div>
    );
  }

  return (
    <div ref={wortel} className={`mv2${geschiedenis ? ' is-geschiedenis' : ''}`} data-mv2-esc={eigenEsc ? '1' : undefined} onKeyDown={opEsc} data-mv2={geschiedenis ? 'geschiedenis' : 'lijst'} data-bel={model.tellers.bel} data-aandacht={aandacht}>
      {kop}
      {dnd ? <div className='mv2-dnd' role='status'><Moon aria-hidden='true' /><span>{t('Не турбувати до ', 'Niet storen tot ')}{new Date(dnd.tot).toLocaleTimeString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { hour: '2-digit', minute: '2-digit' })}</span><button type='button' onClick={() => void bewaarRegels(zetNietStoren(p.regels, null))}>{t('Вимкнути', 'Uitzetten')}</button></div> : null}
      {zoekOpen ? (
        <div className='mv2-zoek'>
          <Search aria-hidden='true' />
          <input ref={zoekRef} type='search' value={f.zoek || ''} placeholder={t('Пошук у сповіщеннях', 'Zoeken in meldingen')} aria-label={t('Пошук у сповіщеннях', 'Zoeken in meldingen')}
            onChange={(e) => setF((c) => ({ ...c, zoek: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setF((c) => ({ ...c, zoek: '' })); setZoekOpen(false); } }} />
          {f.zoek ? <button type='button' className='mv2-ikoon is-klein' aria-label={t('Очистити', 'Wissen')} onClick={() => { setF((c) => ({ ...c, zoek: '' })); zoekRef.current?.focus(); }}><X aria-hidden='true' /></button> : null}
        </div>
      ) : null}
      {paneel === 'niet-storen' ? (
        <div className='mv2-context' role='dialog' aria-label={t('Не турбувати', 'Niet storen')}>
          <p className='mv2-uitleg'>{t('Без звуку й спливних вікон. Сповіщення безпеки все одно буде видно.', 'Geen geluid en geen pop-ups. Beveiligingsmeldingen blijven zichtbaar.')}</p>
          <div className='mv2-chips'>{NIET_STOREN_KEUZES_MIN.map((min) => <button key={min} type='button' onClick={() => { void bewaarRegels(zetNietStoren(p.regels, min)); setPaneel(null); }}>{min < 60 ? t(`${min} хв`, `${min} min`) : min < 1440 ? t(`${min / 60} год`, `${min / 60} u`) : t('До завтра', 'Tot morgen')}</button>)}</div>
        </div>
      ) : null}
      {paneel === 'filters' ? (
        <div className='mv2-context' role='dialog' aria-label={t('Фільтри й порядок', 'Filters en volgorde')}>
          <span className='mv2-label'>{t('Джерело', 'Bron')}</span>{keuzeLijst('dienst', diensten.map((d) => [d, dienstNaam(d)]))}
          {accounts.length ? <><span className='mv2-label'>{t('Акаунт', 'Account')}</span>{keuzeLijst('account', accounts)}</> : null}
          <span className='mv2-label'>{t('Стан', 'Status')}</span>
          <div className='mv2-chips'>{(['open', 'actie', 'opgelost', 'archief'] as Toestand[]).map((s) => { const aan = (f.toestand || []).includes(s); return <button key={s} type='button' aria-pressed={aan} onClick={() => setF((c) => ({ ...c, toestand: aan ? (c.toestand || []).filter((x) => x !== s) : [...(c.toestand || []), s] }))}>{{ open: t('Відкриті', 'Open'), actie: t('Потребують дії', 'Actie nodig'), opgelost: t('Вирішені', 'Opgelost'), archief: t('Архів', 'Archief') }[s]}</button>; })}</div>
          <span className='mv2-label'>{t('Період', 'Periode')}</span>
          <div className='mv2-chips'>{([[0, t('Будь-коли', 'Altijd')], [86400_000, t('Доба', 'Dag')], [7 * 86400_000, t('Тиждень', 'Week')], [30 * 86400_000, t('Місяць', 'Maand')]] as Array<[number, string]>).map(([ms, l]) => <button key={ms} type='button' aria-pressed={ms ? f.vanaf === nu - ms || (!!f.vanaf && Math.abs(f.vanaf - (nu - ms)) < 1000) : !f.vanaf} onClick={() => setF((c) => ({ ...c, vanaf: ms ? nu - ms : undefined }))}>{l}</button>)}</div>
          <span className='mv2-label'>{t('Порядок', 'Volgorde')}</span>
          <div className='mv2-segment is-klein' role='radiogroup' aria-label={t('Порядок', 'Volgorde')}>{(['nieuw', 'oud', 'ernst'] as const).map((s) => <button key={s} type='button' role='radio' aria-checked={(f.sortering || 'nieuw') === s} onClick={() => setF((c) => ({ ...c, sortering: s }))}>{{ nieuw: t('Нові', 'Nieuw'), oud: t('Старі', 'Oud'), ernst: t('Важливість', 'Ernst') }[s]}</button>)}</div>
          <div className='mv2-context-voet'><button type='button' onClick={() => setF({ zoek: f.zoek })} disabled={!nFilters}>{t('Скинути', 'Wissen')}</button><button type='button' className='is-hoofd' onClick={() => setPaneel(null)}>{t('Готово', 'Klaar')}</button></div>
        </div>
      ) : null}
      {v3Tabs && !geschiedenis ? (
        <>
          <div className='mv2-segment mv2-tabs5' role='tablist' aria-label={t('Показати', 'Tonen')} data-mv2-tabs='v3'>
            {TABS.map((x) => <button key={x} type='button' role='tab' data-tab={x} aria-selected={tab === x} onClick={() => { setTab(x); setGekozen(new Set()); }}>{TAB_NAAM[x][lang === 'uk' ? 0 : 1]}<span className='mv2-n' data-n={v3Tabs[x].length}>{v3Tabs[x].length > 99 ? '99+' : v3Tabs[x].length}</span></button>)}
          </div>
          <div className='mv2-regelbalk'>
            {verborgen && verborgen.totaal ? <span className='mv2-verborgen' data-mv2-verborgen={verborgen.totaal}><EyeOff aria-hidden='true' />{t(`${verborgen.totaal} прихованих правилами / тихим режимом`, `${verborgen.totaal} verborgen door regels / stille modus`)}<button type='button' className='mv2-tekstknop' aria-pressed={toonVerborgen} onClick={() => setToonVerborgen((v) => !v)}>{toonVerborgen ? t('Сховати', 'Verbergen') : t('Показати', 'Tonen')}</button></span> : <span className='mv2-verborgen is-leeg'>{t('Правила нічого не приховують', 'Regels verbergen niets')}</span>}
            {uitgesteldN ? <span className='mv2-verborgen'><Clock aria-hidden='true' />{t(`відкладено: ${uitgesteldN}`, `uitgesteld: ${uitgesteldN}`)}</span> : null}
            <button type='button' className={`mv2-tekstknop${kiezen ? ' is-actief' : ''}`} aria-pressed={kiezen} onClick={() => { setKiezen((v) => !v); setGekozen(new Set()); }}><ListChecks aria-hidden='true' />{kiezen ? t('Готово', 'Klaar') : t('Вибрати', 'Kiezen')}</button>
          </div>
          {kiezen ? (
            <div className='mv2-bulk' role='toolbar' aria-label={t('Дії з вибраними', 'Acties voor de keuze')} data-mv2-bulk={gekozen.size}>
              <label className='mv2-kies'><input type='checkbox' checked={!!lijst.length && lijst.every((g) => gekozen.has(g.sleutel))} aria-label={t('Вибрати всі', 'Alles kiezen')} onChange={(e) => setGekozen(e.target.checked ? new Set(lijst.map((g) => g.sleutel)) : new Set())} /></label>
              <span className='mv2-uitleg'>{t(`Вибрано: ${gekozen.size}`, `Gekozen: ${gekozen.size}`)}</span>
              {([['gelezen', Check, t('Прочитано', 'Gelezen')], ['opgelost', CircleCheck, t('Вирішено', 'Opgelost')], ['archief', Archive, t('В архів', 'Archief')], ['uitgesteld', Clock, t('Відкласти', 'Uitstellen')]] as Array<[MeldingStatus, typeof Check, string]>).map(([s, I, l]) => (
                <button key={s} type='button' className='mv2-ikoon' data-bulk={s} aria-label={l} data-tip={l} disabled={!gekozen.size} onClick={() => { const gs = lijst.filter((g) => gekozen.has(g.sleutel)); if (s === 'gelezen') gs.forEach(markeerGroep); void zetGroepen(gs, s, 'bulk', s === 'uitgesteld' ? nu + 3600_000 : undefined, t(`Готово: ${gs.length}`, `Klaar: ${gs.length}`)); setGekozen(new Set()); }}><I aria-hidden='true' /></button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      {!geschiedenis && !v3Tabs ? (
        <div className='mv2-segment' role='tablist' aria-label={t('Показати', 'Tonen')}>
          {([['belangrijk', t('Важливі', 'Belangrijk'), aandacht], ['alle', t('Усі', 'Alle'), 0], ['ongelezen', t('Непрочитані', 'Ongelezen'), ongelezen]] as Array<[Weergave, string, number]>).map(([w, l, n]) => (
            <button key={w} type='button' role='tab' aria-selected={weergave === w} onClick={() => setWeergave(w)}>{l}{n ? <span className='mv2-n'>{n > 99 ? '99+' : n}</span> : null}</button>
          ))}
        </div>
      ) : null}
      <ul className='mv2-lijst' aria-label={t('Сповіщення', 'Meldingen')} onClick={() => setMelding(null)}>
        {lijst.length ? lijst.slice(0, geschiedenis ? 500 : 60).map(rij) : (
          <li className='mv2-leeg'><CircleCheck aria-hidden='true' /><span>{(v3Tabs ? tab === 'belangrijk' : weergave === 'belangrijk') && !f.zoek ? t('Нічого не потребує уваги', 'Niets vraagt aandacht') : t('Нічого не знайдено', 'Niets gevonden')}</span></li>
        )}
      </ul>
      {melding ? <p className='mv2-toast' role='status'>{melding}</p> : null}
      <footer className='mv2-voet'>
        {!geschiedenis ? <button type='button' className='mv2-tekstknop' onClick={() => setGeschiedenis(true)}><History aria-hidden='true' />{t('Уся історія', 'Volledige geschiedenis')}<span className='mv2-n is-zacht'>{model.tellers.totaal}</span></button> : <span className='mv2-uitleg'>{t(`Записів: ${model.tellers.regels}, об’єднано в ${model.tellers.totaal}`, `Regels: ${model.tellers.regels}, samengevoegd tot ${model.tellers.totaal}`)}</span>}
        {p.tech ? <button type='button' className='mv2-tekstknop is-tech' onClick={p.tech.open} title={p.tech.tekst}><ShieldCheck aria-hidden='true' />{t('Технічні', 'Technisch')}{p.tech.aantal ? <span className='mv2-n is-zacht'>{p.tech.aantal}</span> : null}</button> : null}
        <button type='button' className='mv2-ikoon is-klein' aria-label={t('Позначити все прочитаним', 'Alles als gelezen')} data-tip={t('Позначити все прочитаним', 'Alles als gelezen')} disabled={!ongelezen} onClick={() => void p.onMarkAll()}><CheckCheck aria-hidden='true' /></button>
        <button type='button' className='mv2-ikoon is-klein' aria-label={t('Правила сповіщень', 'Meldingsregels')} data-tip={t('Правила сповіщень', 'Meldingsregels')} onClick={() => setPaneel('regels')}><Settings2 aria-hidden='true' /></button>
        <button type='button' className='mv2-ikoon is-klein' aria-label={p.geluid ? t('Звук увімкнено', 'Geluid aan') : t('Звук вимкнено', 'Geluid uit')} data-tip={p.geluid ? t('Звук увімкнено', 'Geluid aan') : t('Звук вимкнено', 'Geluid uit')} aria-pressed={p.geluid} onClick={p.onGeluid}>{p.geluid ? <Volume2 aria-hidden='true' /> : <VolumeX aria-hidden='true' />}</button>
      </footer>
      {menu ? <div className='mv2-vanger' aria-hidden='true' onPointerDown={() => setMenu(null)} /> : null}
      {menuGroep ? <div className='mv2-menu' role='menu' style={menuPlek} aria-label={menuGroep.hoofd.titel} onKeyDown={(e) => menuToetsen(e, () => setMenu(null))}>{menuInhoud(menuGroep)}</div> : null}
    </div>
  );
}

const TAB_NAAM: Record<Tab, [string, string]> = { belangrijk: ['Важливі', 'Belangrijk'], alle: ['Усі', 'Alle'], ongelezen: ['Непрочитані', 'Ongelezen'], opgelost: ['Вирішені', 'Opgelost'], archief: ['Архів', 'Archief'] };
/** Morgen 9:00 (lokale tijd van het apparaat). */
const morgen = (nu: number) => { const d = new Date(nu); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); };

function menuToetsen(e: ReactKeyboardEvent<HTMLDivElement>, sluit: () => void) {
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sluit(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
}
