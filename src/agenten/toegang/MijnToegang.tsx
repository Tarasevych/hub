// «Мої доступи» (iedere gebruiker): alles wat de gebruiker aan AI's gaf, per methode, als kaarten (geen tabellen: smal scherm).
// Per kaart: wat (mensentaal), waar, tot wanneer (aftellen), via welke methode, en Відкликати / Продовжити / Обмежити.
import { useEffect, useState, type ReactNode } from 'react';
import { Bot, Globe, KeyRound, Monitor, Plug, RefreshCw, ShieldMinus, Timer, Trash2 } from 'lucide-react';
import type { Tr } from '../../mcp-ui';
import HulpVraag from '../../hulp/HulpVraag';
import { WEIGER_UITLEG, isWeigercode } from '../../../shared/extensie-ontgrendeling';
import { Knop, Melding, type Uitkomst } from '../ui';
import { beperken, heropenen, intrekken, laadMijn, rijenVan, useMijnToegang } from './bron';
import { Aftellen, Chips, RuimteBadge, tgFout } from './delen';
import { METHODE_TEKST, METHODEN, PRIVE_DAGEN, PRIVE_HOSTS_STANDAARD, TECH_MINUTEN, nietKorter, type Methode, type Recht, type Ruimte, type ToegangRij } from './model';
import '../agenten-toegang-maquette.css';

const ICOON: Record<Methode, ReactNode> = { connector: <Plug />, token: <KeyRound />, apparaat: <Monitor />, extensie: <Globe />, lokaal: <Bot /> };
/** Duurkeuzes technisch: nooit voorbij de lopende activering (servertijd), ≤ 480 min. */
export function techDuren(activatieTot: number | null, nu = Date.now()): number[] {
  const rest = activatieTot ? Math.floor((activatieTot - nu) / 60000) : 480;
  const k = TECH_MINUTEN.filter((m) => m <= Math.min(480, rest));
  return k.length ? [...k] : rest >= 1 ? [rest] : [];
}
const minTekst = (m: number, tr: Tr) => (m < 60 ? tr(`${m} хв`, `${m} min`) : tr(`${m / 60} год`, `${m / 60} u`));
const dagTekst = (d: number, tr: Tr) => (d === 1 ? tr('1 день', '1 dag') : tr(`${d} днів`, `${d} dagen`));

/** Waarom heropenen nu niet kan (of null). */
export function heropenBlok(ruimte: Ruimte, recht: Recht | null, tr: Tr): string | null {
  if (!recht) return tr('Стан розширення ще не завантажено.', 'De stand van de extensie is nog niet geladen.');
  if (ruimte === 'prive') {
    if (recht.prive.mag) return null;
    const c = recht.prive.code;
    if (c === 'GEEN_BROWSER_RECHTEN') return tr('Спершу дозвольте ШІ щось у вкладці «Розширення браузера → Що може ШІ».', 'Sta de AI eerst iets toe op het tabblad «Browserextensie → Wat mag de AI».');
    if (c && isWeigercode(c)) return tr(WEIGER_UITLEG[c].uk, WEIGER_UITLEG[c].nl);
    return tr('Політика сайту зараз не дозволяє відкрити доступ як користувач.', 'Het beleid van de site staat openen als gebruiker nu niet toe.');
  }
  if (!recht.technisch) return tr('У вашого облікового запису немає технічного профілю.', 'Uw account heeft geen technisch profiel.');
  if (recht.technisch.mag) return null;
  const c = recht.technisch.code && isWeigercode(recht.technisch.code) ? recht.technisch.code : 'TECH_NIET_ACTIEF';
  return tr(WEIGER_UITLEG[c].uk, WEIGER_UITLEG[c].nl);
}

export default function MijnToegang({ tr }: { tr: Tr }) {
  const s = useMijnToegang();
  const uk = tr('uk', 'nl') === 'uk';
  const [melding, setMelding] = useState<Uitkomst>(null);
  const [bezig, setBezig] = useState('');
  const [paneel, setPaneel] = useState<{ sleutel: string; soort: 'verleng' | 'beperk' } | null>(null);
  useEffect(() => {
    void laadMijn().catch(() => undefined);
    const t = window.setInterval(() => { if (!document.hidden) void laadMijn().catch(() => undefined); }, 60_000);
    return () => window.clearInterval(t);
  }, []);
  const rijen = rijenVan(s);
  const recht = s.ext?.recht ?? null;

  const voer = async (sleutel: string, taak: () => Promise<string>, wat: [string, string]) => {
    setBezig(sleutel); setMelding(null);
    try { const tekst = await taak(); setMelding({ soort: 'ok', tekst, at: Date.now() }); setPaneel(null); }
    catch (e) { setMelding({ soort: 'fout', tekst: tgFout(e, tr, wat), at: Date.now() }); }
    finally { setBezig(''); }
  };
  const trekIn = (r: ToegangRij) => voer(`in:${r.sleutel}`, async () => {
    await intrekken(r);
    return r.methode === 'lokaal'
      ? tr(`Розблокування «${r.naam}» відкликано — разом із локальним агентом. ШІ більше нічого не може в цьому браузері.`, `Ontgrendeling van «${r.naam}» ingetrokken — samen met de lokale agent. De AI kan niets meer in deze browser.`)
      : tr(`Доступ «${r.naam}» відкликано. ШІ втрачає його з наступного виклику.`, `Toegang «${r.naam}» ingetrokken. De AI verliest hem vanaf de volgende aanroep.`);
  }, ['Не вдалося відкликати', 'Intrekken mislukt']);

  const fout = Object.values(s.fouten)[0];
  const aantal = rijen.length;
  return (
    // INTEG-001 (03.11.2026): blok uit het contract van agenten-pagina.css — naam, één zin, de knop «Оновити» in de kop.
    <section className='tg-blok ag-blok' aria-labelledby='tg-mijn-kop' data-tg-mijn='' data-ag-blok='mijn-toegang'>
      <div className='tg-blok-kop ag-blok-kop'>
        <h3 className='ag-blok-titel' id='tg-mijn-kop'>{tr('Мої доступи', 'Mijn toegang')} <span className='ag-teller'>{aantal}</span> <HulpVraag k='toegang.intrekken' naam={['Відкликати', 'Intrekken']} meer={[['toegang.verlengen', 'Продовжити', 'Verlengen'], ['toegang.beperken', 'Обмежити', 'Beperken']]} uk={uk} label={tr('Мої доступи', 'Mijn toegang')} /></h3>
        <p className='ag-blok-uitleg'>{tr('Кожна картка — один доступ, який ви дали ШІ, згрупований за способом підключення.', 'Elke kaart is één toegang die u een AI gaf, gegroepeerd per manier van koppelen.')}</p>
        <div className='ag-knoppen'>
          <Knop icoon={<RefreshCw />} onClick={() => void laadMijn()} data='tg-vernieuw'>{tr('Оновити', 'Vernieuwen')}</Knop>
        </div>
      </div>
      <p className='tg-legenda'>
        <span>{tr('Відкликати — одразу', 'Intrekken — meteen')}</span>
        <span>{tr('Продовжити — з підтвердженням', 'Verlengen — met bevestiging')}</span>
        <span>{tr('Обмежити — відкликати й відкрити з меншими правами', 'Beperken — intrekken en opnieuw openen met minder')}</span>
      </p>
      <div aria-live='polite' className='tg-live'>
        <Melding uitkomst={melding} tr={tr} onSluit={() => setMelding(null)} />
        {fout ? <p className='ag-melding ag-melding-fout' role='alert' data-tg-laadfout=''>{tgFout(fout, tr, ['Не все вдалося завантажити', 'Niet alles kon worden geladen'])}</p> : null}
      </div>
      {!s.geladen ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : (
        <div className='tg-methoden'>
          {METHODEN.map((m) => {
            const lijst = rijen.filter((r) => r.methode === m);
            return (
              <section key={m} className='tg-methode' data-tg-methode={m} aria-labelledby={`tg-m-${m}`}>
                <h4 id={`tg-m-${m}`}><span className='tg-icoon' aria-hidden='true'>{ICOON[m]}</span>{tr(...METHODE_TEKST[m].naam)} <span className='ag-teller'>{lijst.length}</span></h4>
                <p className='tg-methode-uitleg'>{tr(...METHODE_TEKST[m].uitleg)}</p>
                {lijst.length ? (
                  <ul className='tg-kaarten'>
                    {lijst.map((r) => (
                      <RijKaart key={r.sleutel} r={r} tr={tr} uk={uk} recht={recht} bezig={bezig} paneel={paneel?.sleutel === r.sleutel ? paneel.soort : null}
                        onPaneel={(soort) => setPaneel(soort ? { sleutel: r.sleutel, soort } : null)} onIntrekken={() => void trekIn(r)}
                        onVerleng={(h) => void voer(`ver:${r.sleutel}`, async () => { await heropenen(h); return tr(`Доступ «${r.naam}» відкрито заново.`, `Toegang «${r.naam}» opnieuw geopend.`); }, ['Не вдалося продовжити', 'Verlengen mislukt'])}
                        onBeperk={(h) => void voer(`bep:${r.sleutel}`, async () => { await beperken(r, h); return tr(`Доступ «${r.naam}» відкликано й відкрито заново з меншими правами.`, `Toegang «${r.naam}» ingetrokken en opnieuw geopend met minder rechten.`); }, ['Не вдалося обмежити', 'Beperken mislukt'])} />
                    ))}
                  </ul>
                ) : <p className='tg-leeg' data-tg-leeg={m}>{tr('Нічого не надано.', 'Niets gegeven.')}</p>}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

type HeropenKeuze = { domeinen: string[]; lokaal: boolean; dagen?: number; minuten?: number };
function RijKaart({ r, tr, uk, recht, bezig, paneel, onPaneel, onIntrekken, onVerleng, onBeperk }: {
  r: ToegangRij; tr: Tr; uk: boolean; recht: Recht | null; bezig: string; paneel: 'verleng' | 'beperk' | null;
  onPaneel: (s: 'verleng' | 'beperk' | null) => void; onIntrekken: () => void;
  onVerleng: (h: HeropenKeuze & { agentId: string; ruimte: Ruimte }) => void; onBeperk: (h: HeropenKeuze) => void;
}) {
  const d = r.doel;
  const extensie = r.methode === 'extensie' || r.methode === 'lokaal';
  const agentId = d.soort === 'ontgrendeling' || d.soort === 'grants' ? d.agentId : '';
  const kanHeropenen = extensie && (d.soort === 'ontgrendeling' || (d.soort === 'grants' && r.ruimte === 'prive'));
  const iets = !!bezig;
  const link = (href: string, tekst: string, data: string, icoon: ReactNode) => <a className='ag-knop tg-knop' href={href} data-knop={data}><span className='ag-knop-icoon' aria-hidden='true'>{icoon}</span><span>{tekst}</span></a>;
  const verlengLink = r.methode === 'connector' ? link(`#ai/oauth:${encodeURIComponent(d.soort === 'oauth' ? d.id : '')}`, tr('Продовжити', 'Verlengen'), `tg-verleng:${r.sleutel}`, <Timer />)
    : r.methode === 'token' ? link('#tokens', tr('Продовжити (новий токен)', 'Verlengen (nieuw token)'), `tg-verleng:${r.sleutel}`, <Timer />)
      : r.methode === 'apparaat' ? link(`#apparaten/dev:${agentId}`, tr('Продовжити', 'Verlengen'), `tg-verleng:${r.sleutel}`, <Timer />) : null;
  const beperkLink = r.methode === 'connector' ? link(`#ai/oauth:${encodeURIComponent(d.soort === 'oauth' ? d.id : '')}`, tr('Обмежити', 'Beperken'), `tg-beperk:${r.sleutel}`, <ShieldMinus />)
    : r.methode === 'token' ? link('#tokens', tr('Обмежити', 'Beperken'), `tg-beperk:${r.sleutel}`, <ShieldMinus />)
      : r.methode === 'apparaat' || (extensie && d.soort === 'grants') ? link(r.methode === 'apparaat' ? `#apparaten/dev:${agentId}` : '#extensie', tr('Обмежити', 'Beperken'), `tg-beperk:${r.sleutel}`, <ShieldMinus />) : null;
  const linkUitleg = r.methode === 'connector' ? tr('ШІ сам оновлює підключення до цього строку. Що саме він може — у «Підключені ШІ → Доступ ШІ»; там можна й звузити.', 'De AI ververst de koppeling zelf tot deze datum. Wat hij precies mag staat bij «Verbonden AI → AI-toegang»; daar kunt u ook beperken.')
    : r.methode === 'token' ? tr('Токен не продовжується й не звужується: відкличте його й видайте новий із меншими правами.', 'Een token verlengt of verkleint u niet: trek het in en geef een nieuw met minder rechten.')
      : r.methode === 'apparaat' ? tr('Строки й окремі дозволи пристрою змінюються на його сторінці; там же «Зупинити всі».', 'Termijnen en losse toestemmingen van het apparaat wijzigt u op zijn pagina; daar staat ook «Alle stoppen».')
        : d.soort === 'grants' ? tr('Розширення заблоковане: ці дозволи почнуть діяти, лише коли ви відкриєте доступ. Менше дозволів — у «Розширення браузера → Що може ШІ».', 'De extensie is vergrendeld: deze toestemmingen werken pas als u de toegang opent. Minder toestemmingen — bij «Browserextensie → Wat mag de AI».') : '';
  const blok = kanHeropenen ? heropenBlok(r.ruimte, recht, tr) : null;
  return (
    <li className={`tg-kaart${r.dicht ? ' is-dicht' : ''}`} data-tg-rij={r.sleutel} data-methode={r.methode} data-ruimte={r.ruimte}>
      <div className='tg-kaart-kop'>
        <span className='tg-icoon' aria-hidden='true'>{ICOON[r.methode]}</span>
        <span className='tg-kaart-titel'>
          <b>{r.naam}</b>
          <RuimteBadge ruimte={r.ruimte} tr={tr} />
          {r.dicht ? <span className='ag-badge ag-warn' data-badge='dicht'>{tr('Заблоковано', 'Vergrendeld')}</span> : null}
          {r.online === true ? <span className='ag-badge ag-ok'>{tr('у мережі', 'online')}</span> : r.online === false ? <span className='ag-badge ag-off'>{tr('не в мережі', 'offline')}</span> : null}
        </span>
      </div>
      <dl className='tg-feiten'>
        <div><dt>{tr('Що може ШІ', 'Wat de AI mag')}</dt><dd><Chips items={r.wat} tr={tr} /></dd></div>
        <div><dt>{tr('Де', 'Waar')}</dt><dd><Chips items={r.waar} tr={tr} leeg={tr('адреси з дозволів', 'adressen uit de toestemmingen')} /></dd></div>
        <div><dt>{tr('До коли', 'Tot wanneer')}</dt><dd><Aftellen tot={r.tot} tr={tr} /></dd></div>
        <div><dt>{tr('Спосіб', 'Methode')}</dt><dd>{tr(...METHODE_TEKST[r.methode].naam)}</dd></div>
      </dl>
      {r.methode === 'lokaal' ? <p className='tg-noot'>{tr('Локальний агент живе в розблокуванні браузера: «Відкликати» закриває весь доступ цього браузера; щоб прибрати лише агента — «Обмежити».', 'De lokale agent hoort bij de ontgrendeling van de browser: «Intrekken» sluit alle toegang van deze browser; alleen de agent weg — «Beperken».')}</p> : null}
      <div className='tg-knoppen'>
        <Knop toon='danger' icoon={<Trash2 />} bezig={bezig === `in:${r.sleutel}`} disabled={iets} onClick={onIntrekken} data={`tg-intrekken:${r.sleutel}`}>{tr('Відкликати', 'Intrekken')}</Knop>
        {kanHeropenen ? <Knop icoon={<Timer />} disabled={iets} onClick={() => onPaneel(paneel === 'verleng' ? null : 'verleng')} data={`tg-verleng:${r.sleutel}`}>{d.soort === 'grants' ? tr('Відкрити доступ', 'Toegang openen') : tr('Продовжити', 'Verlengen')}</Knop> : verlengLink}
        {d.soort === 'ontgrendeling' ? <Knop icoon={<ShieldMinus />} disabled={iets} onClick={() => onPaneel(paneel === 'beperk' ? null : 'beperk')} data={`tg-beperk:${r.sleutel}`}>{tr('Обмежити', 'Beperken')}</Knop> : beperkLink}
      </div>
      {linkUitleg ? <small className='tg-noot'>{linkUitleg}</small> : null}
      {paneel && kanHeropenen ? (
        <HeropenPaneel r={r} tr={tr} uk={uk} recht={recht} blok={blok} soort={paneel} bezig={bezig === `ver:${r.sleutel}` || bezig === `bep:${r.sleutel}`}
          onSluit={() => onPaneel(null)} onGa={(k) => (paneel === 'beperk' ? onBeperk(k) : onVerleng({ ...k, agentId, ruimte: r.ruimte }))} />
      ) : null}
    </li>
  );
}

function HeropenPaneel({ r, tr, uk, recht, blok, soort, bezig, onSluit, onGa }: {
  r: ToegangRij; tr: Tr; uk: boolean; recht: Recht | null; blok: string | null; soort: 'verleng' | 'beperk'; bezig: boolean; onSluit: () => void; onGa: (k: HeropenKeuze) => void;
}) {
  const d = r.doel;
  const huidig = d.soort === 'ontgrendeling' ? d.domeinen : r.waar.map((w) => w[0]).filter((h) => PRIVE_HOSTS_STANDAARD.includes(h));
  const [domeinen, setDomeinen] = useState<string[]>(huidig);
  const [lokaal, setLokaal] = useState(d.soort === 'ontgrendeling' ? d.lokaal : false);
  const prive = r.ruimte === 'prive';
  const verlengVan = soort === 'verleng' && d.soort === 'ontgrendeling' ? r.tot : 0;
  const dagen = nietKorter(PRIVE_DAGEN.filter((x) => x <= (recht?.prive.maxDagen ?? 30)), 86_400_000, verlengVan);
  const minuten = nietKorter(techDuren(recht?.technisch?.activatieTot ?? null), 60_000, verlengVan);
  const [dag, setDag] = useState<number>(dagen[0] ?? 1);
  const [min, setMin] = useState<number>(minuten.includes(60) ? 60 : minuten[0] ?? 15);
  const beperk = soort === 'beperk';
  const geenKeuze = prive ? !dagen.length : !minuten.length;
  const leeg = beperk && !domeinen.length;
  return (
    <div className='tg-paneel' role='group' aria-label={beperk ? tr('Обмежити доступ', 'Toegang beperken') : tr('Продовжити доступ', 'Toegang verlengen')} data-tg-paneel={soort}>
      <p className='tg-noot'>{beperk
        ? tr('Звузити чинний доступ на місці не можна: спершу його буде відкликано, потім відкрито заново з меншими правами — з підтвердженням, як «Продовжити».', 'De huidige toegang ter plekke verkleinen kan niet: hij wordt eerst ingetrokken en daarna opnieuw geopend met minder rechten — met bevestiging zoals «Verlengen».')
        : prive ? tr('Сайт попросить підтвердити вхід (passkey, код із застосунку або Google). Можливості беруться з ваших дозволів «Що може ШІ».', 'De site vraagt een bevestiging van de aanmelding (passkey, app-code of Google). De mogelijkheden komen uit uw toestemmingen «Wat mag de AI».')
          : tr('Потрібен ваш passkey і активний технічний профіль у цій вкладці.', 'Uw passkey en een actief technisch profiel in dit tabblad zijn nodig.')}</p>
      {beperk && d.soort === 'ontgrendeling' ? (
        <fieldset className='tg-veldset'>
          <legend>{tr('Залишити адреси', 'Adressen behouden')} <HulpVraag k='toegang.domeinen' meer={[['toegang.lokaal', 'Локальний агент (лише читання)', 'Lokale agent (alleen lezen)']]} uk={uk} label={tr('Адреси', 'Adressen')} /></legend>
          {d.domeinen.map((h) => (
            <label key={h} className='tg-vink'>
              <input type='checkbox' data-hulp='toegang.domeinen' data-tg-domein={h} checked={domeinen.includes(h)} disabled={bezig}
                onChange={(e) => setDomeinen((oud) => (e.target.checked ? [...oud, h] : oud.filter((x) => x !== h)))} />
              <code>{h}</code>
            </label>
          ))}
          {d.lokaal ? (
            <label className='tg-vink'>
              <input type='checkbox' data-hulp='toegang.lokaal' checked={lokaal} disabled={bezig} onChange={(e) => setLokaal(e.target.checked)} />
              <span>{tr('Локальний агент (лише читання)', 'Lokale agent (alleen lezen)')}</span>
            </label>
          ) : null}
        </fieldset>
      ) : null}
      <label className='tg-veld'>
        <span>{tr('На скільки', 'Voor hoe lang')} {/* hulp:eigen-vraag — los veld in het venster, zonder kop */}<HulpVraag k='toegang.duur' uk={uk} label={tr('Строк', 'Termijn')} /></span>
        {prive ? (
          <select data-hulp='toegang.duur' value={dag} disabled={bezig || !dagen.length} onChange={(e) => setDag(Number(e.target.value))}>
            {dagen.map((x) => <option key={x} value={x}>{dagTekst(x, tr)}</option>)}
          </select>
        ) : (
          <select data-hulp='toegang.duur' value={min} disabled={bezig || !minuten.length} onChange={(e) => setMin(Number(e.target.value))}>
            {minuten.map((x) => <option key={x} value={x}>{minTekst(x, tr)}</option>)}
          </select>
        )}
      </label>
      {blok ? <p className='ag-melding ag-melding-fout' role='note' data-tg-blok=''>{blok}</p> : null}
      {leeg ? <p className='tg-noot' role='note'>{tr('Залиште хоча б одну адресу.', 'Laat minstens één adres staan.')}</p> : null}
      {!beperk && geenKeuze ? <p className='tg-noot' role='note'>{tr('Поточний строк довший за ці варіанти. Продовження тут його вкоротило б, тож кнопки немає. «Без обмеження» поновлює сервер сам.', 'De huidige termijn is langer dan deze keuzes. Verlengen zou hem hier inkorten, dus die knop is er niet. «Onbeperkt» verlengt de server zelf.')}</p> : null}
      <div className='tg-knoppen'>
        <Knop toon={beperk ? 'danger' : 'primary'} bezig={bezig} disabled={!!blok || geenKeuze || leeg} data={`tg-ga:${soort}:${r.sleutel}`}
          onClick={() => onGa({ domeinen, lokaal, ...(prive ? { dagen: dag } : { minuten: min }) })}>
          {beperk ? tr('Відкликати й відкрити з меншими правами', 'Intrekken en opnieuw openen met minder') : prive ? tr('Підтвердити й продовжити', 'Bevestigen en verlengen') : tr('Підтвердити passkey', 'Bevestigen met passkey')}
        </Knop>
        <Knop onClick={onSluit} disabled={bezig}>{tr('Скасувати', 'Annuleren')}</Knop>
      </div>
    </div>
  );
}
