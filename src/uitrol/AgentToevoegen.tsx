// Venster «Додати агента» van «Хто готує оновлення»: eerst ALLE agents die op de site kunnen aansluiten als blokken (logo, beleid, rechten,
// verbindingen), daarna de termijn (1 / 7 / 30 dagen of «до відкликання»). «Інший спосіб» (concrete koppeling, token of account) is een eigen
// weergave met echte keuzekaarten en een uitleg als de lijst leeg is — de oude keuzelijst bleef zonder reden leeg, omdat privéverbindingen
// nooit in aanmerking komen (zie backend/uitrol-goedkeuring.ts onderwerpControleren).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, CalendarClock, Check, Clock, ExternalLink, Info, KeyRound, Link2, Plug, ShieldAlert, ShieldCheck, UserRound, X } from 'lucide-react';
import AgentLogo from '../agenten/AgentLogo';
import { SOORT, tr, type AgentTegel, type Grant, type GrantSoort, type Keuze, type Lang, type Overzicht } from './types';
import './agent-toevoegen.css';

export type GevenInvoer = { soort: GrantSoort; onderwerp: string; dagen: number; onbepaald?: boolean; label: string };
type Props = { lang: Lang; data: Overzicht; busy: string; geven: (g: GevenInvoer) => void; termijn?: (g: Grant, t: { dagen: number; onbepaald: boolean }) => void; onSluit: () => void; zoekAccounts?: (zoek: string) => Promise<{ accounts?: Keuze[]; accountsTotaal?: number }> };
type Weergave = { v: 'agents' } | { v: 'duur'; soort: GrantSoort; onderwerp: string; naam: string; logo: string | null } | { v: 'ander' };

const DAGEN = [1, 7, 30];
const kort = (lang: Lang, iso: string) => (iso ? new Date(iso).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { day: 'numeric', month: 'short' }) : '');

/** Wat zegt het AI-beleid over «Розгортати сайт» voor deze agent, als korte chip. */
function beleidChip(lang: Lang, t: AgentTegel | undefined, staat: string) {
  if (!t || staat === 'niet-ingesteld') return { toon: 'neutraal', tekst: tr(lang, 'Політику ШІ не налаштовано', 'AI-beleid niet ingesteld') };
  if (staat !== 'geldig') return { toon: 'warn', tekst: tr(lang, 'Політику ШІ не вдалося перевірити', 'AI-beleid niet te verifiëren') };
  if (t.modus === null) return { toon: 'warn', tekst: tr(lang, 'Немає в політиці ШІ', 'Staat niet in het AI-beleid') };
  if (t.modus === 'off') return { toon: 'warn', tekst: tr(lang, '«Розгортати сайт»: вимкнено', '«Site uitrollen»: uit') };
  return { toon: 'ok', tekst: tr(lang, `«Розгортати сайт»: ${t.modus === 'always' ? 'завжди' : 'питати щоразу'}`, `«Site uitrollen»: ${t.modus === 'always' ? 'altijd' : 'vragen'}`) };
}

export default function AgentToevoegen({ lang, data, busy, geven, termijn, onSluit, zoekAccounts }: Props) {
  const [w, setW] = useState<Weergave>({ v: 'agents' });
  const [dagen, setDagen] = useState(30);
  const [onbepaald, setOnbepaald] = useState(false);
  const [naam, setNaam] = useState('');
  const [wijzig, setWijzig] = useState<string | null>(null); // grant-id waarvan de termijn wordt gewijzigd
  const [wDagen, setWDagen] = useState(30);
  const [wOnb, setWOnb] = useState(false);
  const [ander, setAnder] = useState<'mcp-koppeling' | 'agenttoken' | 'account'>('mcp-koppeling');
  const [keuze, setKeuze] = useState('');
  const sluitKnop = useRef<HTMLButtonElement>(null);
  const max = data.limieten.voorbereiderMaxDagen;
  const beleid = data.beleid || null;
  const staat = beleid?.staat || 'niet-ingesteld';
  const actief = useMemo(() => data.voorbereiders.filter((g) => g.status === 'actief'), [data.voorbereiders]);
  const tegels: AgentTegel[] = useMemo(() => beleid?.tegels?.length ? beleid.tegels : (data.kandidaten.agents || []).map((a) => ({ slug: a.id, naam: a.label, modus: null, beleidCode: '', uitdrukkelijk: false, recht: null, verbindingen: { technisch: 0, prive: 0, laatstGebruikt: '' } })), [beleid, data.kandidaten.agents]);
  const rechtVan = (slug: string) => actief.find((g) => g.soort === 'agent' && g.onderwerp === slug);

  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onSluit(); };
    window.addEventListener('keydown', f); sluitKnop.current?.focus();
    return () => window.removeEventListener('keydown', f);
  }, [onSluit]);

  const bevestig = () => {
    if (w.v === 'duur') { geven({ soort: w.soort, onderwerp: w.onderwerp, dagen: onbepaald ? 1 : Math.min(dagen, max), onbepaald, label: naam.trim() }); onSluit(); }
  };
  const duurKeuze = (d: number, on: boolean, zetD: (n: number) => void, zetOn: (b: boolean) => void) => <div className='ut-chips-keuze' role='group' aria-label={tr(lang, 'На скільки', 'Hoe lang')}>
    {DAGEN.filter((x) => x <= max).map((x) => <button key={x} type='button' aria-pressed={!on && d === x} onClick={() => { zetOn(false); zetD(x); }}>{x} {tr(lang, x === 1 ? 'день' : 'днів', x === 1 ? 'dag' : 'dagen')}</button>)}
    <button type='button' aria-pressed={on} onClick={() => zetOn(true)} data-onbepaald><Clock aria-hidden='true' />{tr(lang, 'До відкликання', 'Tot intrekking')}</button>
  </div>;

  const [zoek, setZoek] = useState('');
  const [gevonden, setGevonden] = useState<Keuze[] | null>(null);
  const [gevondenTotaal, setGevondenTotaal] = useState<number | null>(null);
  const [zoekt, setZoekt] = useState(false);
  useEffect(() => {
    const term = zoek.trim();
    if (!zoekAccounts || !term) { setGevonden(null); setGevondenTotaal(null); setZoekt(false); return; }
    let leeft = true; setZoekt(true);
    const t = window.setTimeout(() => {
      void zoekAccounts(term).then((r) => { if (!leeft) return; setGevonden(r.accounts || []); setGevondenTotaal(r.accountsTotaal ?? (r.accounts || []).length); })
        .catch(() => { if (leeft) { setGevonden([]); setGevondenTotaal(0); } })
        .finally(() => { if (leeft) setZoekt(false); });
    }, 250);
    return () => { leeft = false; window.clearTimeout(t); window.clearTimeout(t); };
  }, [zoek, zoekAccounts]);

  const titel = w.v === 'agents' ? tr(lang, 'Додати агента', 'Agent toevoegen') : w.v === 'duur' ? tr(lang, `Доступ для ${w.naam}`, `Toegang voor ${w.naam}`) : tr(lang, 'Інший спосіб', 'Andere manier');

  // ---- «Інший спосіб»: kaarten i.p.v. een lege keuzelijst
  // Accounts: het overzicht stuurt hoogstens het eerste blok mee. Met meer goedgekeurde mensen moet het scherm dat ZEGGEN en laten
  // zoeken (server-side, dus ook buiten dat blok) — anders viel iemand achteraan het alfabet er stil uit (20.10.2026).
  const anderLijst = ander === 'account' ? (gevonden ?? data.kandidaten.accounts) : ander === 'agenttoken' ? data.kandidaten.agenttokens : data.kandidaten.koppelingen;
  const accountsTotaal = gevondenTotaal ?? data.kandidaten.accountsTotaal ?? data.kandidaten.accounts.length;
  const accountsAfgekapt = accountsTotaal > anderLijst.length;
  const prive = ander === 'mcp-koppeling' ? data.kandidaten.uitgesloten?.koppelingenPrive || 0 : ander === 'agenttoken' ? data.kandidaten.uitgesloten?.tokensPrive || 0 : 0;
  const bezet = (id: string) => actief.some((g) => g.soort === ander && g.onderwerp === id);

  return <div className='ut-modal-schaduw' onMouseDown={(e) => { if (e.target === e.currentTarget) onSluit(); }}>
    <div className='ut-modal ut-agentvenster' role='dialog' aria-modal='true' aria-labelledby='ut-agent-titel' data-agent-venster>
      <header>
        {w.v !== 'agents' && <button type='button' className='ut-icoon-knop' aria-label={tr(lang, 'Назад', 'Terug')} onClick={() => { setW({ v: 'agents' }); setKeuze(''); }}><ArrowLeft aria-hidden='true' /></button>}
        <h3 id='ut-agent-titel'>{w.v === 'agents' ? <Bot aria-hidden='true' /> : w.v === 'duur' && w.logo ? <AgentLogo agent={w.logo} size={26} /> : <Link2 aria-hidden='true' />}{titel}</h3>
        <button ref={sluitKnop} type='button' className='ut-icoon-knop ut-sluit' aria-label={tr(lang, 'Закрити', 'Sluiten')} onClick={onSluit}><X aria-hidden='true' /></button>
      </header>

      {w.v === 'agents' && <>
        <p className='ut-sub'>{tr(lang, 'Усі ШІ-агенти, що можуть підключатися до сайту. Дозвіл діє для всіх підключень агента до технічного простору, навіть після перепідключення. Також його надає ввімкнення «Розгортати сайт» у «Доступ ШІ».', 'Alle AI-agents die met de site kunnen verbinden. De toestemming geldt voor al hun koppelingen met de technische ruimte, ook na opnieuw verbinden. Ook het aanzetten van «Site uitrollen» in «AI-toegang» geeft haar.')}</p>
        <ul className='ut-agenttegels' data-agent-tegels>
          {tegels.map((t) => { const g = rechtVan(t.slug); const bc = beleidChip(lang, t, staat);
            return <li key={t.slug} className='ut-agenttegel' data-agent={t.slug} data-recht={g ? 'ja' : 'nee'}>
              <div className='ut-agenttegel-kop'><AgentLogo agent={t.slug} naam={t.naam} size={44} /><div><b>{t.naam}</b>
                <span className='ut-agenttegel-sub'>{t.verbindingen.technisch > 0 ? tr(lang, `${t.verbindingen.technisch} техн. підключ.`, `${t.verbindingen.technisch} techn. koppeling(en)`) : tr(lang, 'немає технічних підключень', 'geen technische koppelingen')}{t.verbindingen.prive > 0 ? ` · ${tr(lang, `${t.verbindingen.prive} приватних`, `${t.verbindingen.prive} privé`)}` : ''}{t.verbindingen.laatstGebruikt ? ` · ${tr(lang, 'востаннє', 'laatst')} ${kort(lang, t.verbindingen.laatstGebruikt)}` : ''}</span></div></div>
              <div className='ut-agenttegel-chips'>
                <span className='ut-chip' data-toon={bc.toon === 'neutraal' ? undefined : bc.toon}>{bc.toon === 'ok' ? <ShieldCheck aria-hidden='true' /> : <ShieldAlert aria-hidden='true' />}{bc.tekst}</span>
                {g ? <span className='ut-chip' data-toon='ok'><CalendarClock aria-hidden='true' />{g.onbepaald ? tr(lang, 'Дозволено · до відкликання', 'Toegestaan · tot intrekking') : tr(lang, `Дозволено · до ${kort(lang, g.verlooptOp)}`, `Toegestaan · tot ${kort(lang, g.verlooptOp)}`)}{g.bron === 'ai-beleid' ? ` · ${tr(lang, 'з політики ШІ', 'uit AI-beleid')}` : ''}</span>
                  : <span className='ut-chip'>{tr(lang, 'Ще без дозволу готувати оновлення', 'Nog geen toestemming om updates voor te bereiden')}</span>}
              </div>
              {t.modus === 'off' && <p className='ut-agenttegel-nb'><Info aria-hidden='true' />{tr(lang, 'Політика ШІ блокує «Розгортати сайт» для цього агента: навіть з дозволом тут він нічого не завантажить. Увімкніть це в «Доступ ШІ» (потрібен passkey).', 'Het AI-beleid blokkeert «Site uitrollen» voor deze agent: ook met toestemming hier kan hij niets uploaden. Zet het aan in «AI-toegang» (passkey nodig).')} <a href='/ai'>{tr(lang, 'Відкрити «Доступ ШІ»', '«AI-toegang» openen')}<ExternalLink aria-hidden='true' /></a></p>}
              {wijzig === g?.id && g && <div className='ut-agenttegel-wijzig'>
                {duurKeuze(wDagen, wOnb, setWDagen, setWOnb)}
                <div className='ut-acties'><button type='button' className='ut-knop ut-knop-primair' disabled={!!busy || !termijn} onClick={() => { termijn?.(g, { dagen: wDagen, onbepaald: wOnb }); setWijzig(null); }}><Check aria-hidden='true' />{tr(lang, 'Зберегти термін', 'Termijn opslaan')}</button>
                  <button type='button' className='ut-knop' onClick={() => setWijzig(null)}>{tr(lang, 'Скасувати', 'Annuleren')}</button></div>
              </div>}
              <div className='ut-acties'>
                {!g && <button type='button' className='ut-knop ut-knop-primair' disabled={!!busy} data-agent-kies={t.slug} onClick={() => { setW({ v: 'duur', soort: 'agent', onderwerp: t.slug, naam: t.naam, logo: t.slug }); setNaam(''); setOnbepaald(false); setDagen(30); }}><Plug aria-hidden='true' />{tr(lang, 'Дозволити', 'Toestaan')}</button>}
                {g && wijzig !== g.id && termijn && <button type='button' className='ut-knop' disabled={!!busy} onClick={() => { setWijzig(g.id); setWOnb(!!g.onbepaald); setWDagen(30); }}><Clock aria-hidden='true' />{tr(lang, 'Змінити термін', 'Termijn wijzigen')}</button>}
              </div>
            </li>; })}
        </ul>
        <button type='button' className='ut-link' onClick={() => { setW({ v: 'ander' }); setKeuze(''); setAnder('mcp-koppeling'); }}>{tr(lang, 'Інший спосіб: конкретне підключення, токен або акаунт', 'Andere manier: specifieke koppeling, token of account')}</button>
      </>}

      {w.v === 'duur' && <>
        <p className='ut-sub'>{tr(lang, 'На скільки дати дозвіл готувати й завантажувати пакети? Схвалювати оновлення агент усе одно не може — це робите ви passkey.', 'Voor hoe lang mag deze agent pakketten voorbereiden en uploaden? Goedkeuren kan hij nooit — dat doet u met een passkey.')}</p>
        <fieldset className='ut-veld'><legend>{tr(lang, 'На скільки', 'Hoe lang')}</legend>{duurKeuze(dagen, onbepaald, setDagen, setOnbepaald)}</fieldset>
        {onbepaald && <p className='ut-agenttegel-nb' data-toon='warn'><Info aria-hidden='true' />{tr(lang, 'Без терміну: дозвіл діє, доки ви його не вимкнете (кнопка «Вимкнути доступ»). Усе записується в журнал.', 'Zonder termijn: de toestemming blijft tot u haar uitzet (knop «Toegang uitzetten»). Alles komt in het logboek.')}</p>}
        <label className='ut-veld'><span>{tr(lang, 'Назва (необов’язково)', 'Naam (optioneel)')}</span><input value={naam} maxLength={80} onChange={(e) => setNaam(e.target.value)} /></label>
        <footer className='ut-acties'>
          <button type='button' className='ut-knop ut-knop-primair' disabled={!!busy} data-agent-bevestig onClick={bevestig}><Check aria-hidden='true' />{tr(lang, 'Дозволити', 'Toestaan')}{' — '}{onbepaald ? tr(lang, 'до відкликання', 'tot intrekking') : `${dagen} ${tr(lang, dagen === 1 ? 'день' : 'днів', dagen === 1 ? 'dag' : 'dagen')}`}</button>
          <button type='button' className='ut-knop' onClick={onSluit}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
        </footer>
      </>}

      {w.v === 'ander' && <>
        <p className='ut-sub'>{tr(lang, 'Точніший дозвіл: лише для одного підключення чи токена, або для людини. Підключення й токени працюють лише з технічного простору; прив’язка зникає, якщо ШІ підключиться знову.', 'Een nauwkeuriger toestemming: alleen voor één koppeling of token, of voor een persoon. Koppelingen en tokens komen alleen uit de technische ruimte; de binding vervalt als de AI opnieuw verbindt.')}</p>
        <div className='ut-chips-keuze' role='group' aria-label={tr(lang, 'Вид дозволу', 'Soort toestemming')}>
          {(['mcp-koppeling', 'agenttoken', 'account'] as const).map((s) => <button key={s} type='button' aria-pressed={ander === s} onClick={() => { setAnder(s); setKeuze(''); }}>{s === 'account' ? <UserRound aria-hidden='true' /> : s === 'agenttoken' ? <KeyRound aria-hidden='true' /> : <Link2 aria-hidden='true' />}{tr(lang, SOORT[s][0], SOORT[s][1])}</button>)}
        </div>
        {ander === 'account' && zoekAccounts && <div className='ut-keuze-zoek'>
          <label htmlFor='ut-kandidaat-zoek'>{tr(lang, 'Пошук за адресою або іменем', 'Zoeken op adres of naam')}</label>
          <input id='ut-kandidaat-zoek' type='search' autoComplete='off' value={zoek} onChange={(e) => { setZoek(e.target.value); setKeuze(''); }}
            placeholder={tr(lang, 'напр. petro@', 'bijv. petro@')} data-kandidaat-zoek />
          <small role='status'>{zoekt ? tr(lang, 'Шукаю…', 'Zoeken…')
            : accountsAfgekapt ? tr(lang, `Показано ${anderLijst.length} з ${accountsTotaal}. Шукайте за адресою, щоб знайти решту.`, `${anderLijst.length} van ${accountsTotaal} getoond. Zoek op adres om de rest te vinden.`)
            : tr(lang, `Показано всі: ${anderLijst.length}.`, `Alle ${anderLijst.length} getoond.`)}</small>
        </div>}
        <ul className='ut-keuzekaarten' role='radiogroup' aria-label={tr(lang, SOORT[ander][0], SOORT[ander][1])}>
          {anderLijst.map((k) => <li key={k.id}><button data-hulp-vrij='keuze' type='button' role='radio' aria-checked={keuze === k.id} disabled={bezet(k.id)} data-gekozen={keuze === k.id || undefined} className='ut-keuzekaart' onClick={() => setKeuze(k.id)}>
            <AgentLogo agent={k.label} naam={k.label} size={32} /><span><b>{k.label}</b>{bezet(k.id) && <small><Check aria-hidden='true' />{tr(lang, 'вже дозволено', 'al toegestaan')}</small>}</span></button></li>)}
          {anderLijst.length === 0 && <li className='ut-keuze-leeg'><Info aria-hidden='true' /><div>
            <b>{ander === 'account' ? tr(lang, 'Немає схвалених акаунтів', 'Geen goedgekeurde accounts') : ander === 'agenttoken' ? tr(lang, 'Немає активних токенів агента з технічного простору', 'Geen actieve agenttokens uit de technische ruimte') : tr(lang, 'Немає активних MCP-підключень з технічного простору', 'Geen actieve MCP-koppelingen uit de technische ruimte')}</b>
            <p>{prive > 0 ? tr(lang, `Є ${prive} приватних підключень, але вони не можуть торкатися сервера — це навмисно. Підключіть ШІ в технічному просторі (технічний профіль → «Підключення») або виберіть «Агент» у першому кроці: він працює для всіх підключень агента.`, `Er zijn ${prive} privéverbindingen, maar die kunnen de server nooit raken — dat is bewust. Verbind de AI in de technische ruimte (technisch profiel → «Koppelingen») of kies «Agent» in de eerste stap: die geldt voor al zijn koppelingen.`)
              : tr(lang, 'Підключіть ШІ в технічному просторі, або поверніться й виберіть агента — тоді дозвіл не залежить від окремого токена.', 'Verbind de AI in de technische ruimte, of ga terug en kies een agent — dan hangt de toestemming niet aan één token.')}</p></div></li>}
        </ul>
        <div className='ut-acties'>
          <button type='button' className='ut-knop ut-knop-primair' disabled={!keuze || !!busy} data-ander-verder onClick={() => { const k = anderLijst.find((x) => x.id === keuze); if (k) { setW({ v: 'duur', soort: ander, onderwerp: k.id, naam: k.label, logo: null }); setNaam(''); setOnbepaald(false); setDagen(30); } }}>{tr(lang, 'Далі: вибрати термін', 'Verder: termijn kiezen')}</button>
        </div>
      </>}
    </div>
  </div>;
}
