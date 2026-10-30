// «Усі користувачі» (contract 0.6 §3): alleen voor de eigenaar of een lopende activering met users.manage. TabToegang rendert dit
// onderdeel ANDERS NIET (ook niet verborgen); de server weigert bovendien met 403. Per gebruiker: tech-profiel ja/nee, browsers met
// sloten en lopende ontgrendelingen (Відкликати met bevestigingsvenster, Продовжити binnen beleid) en het beleid (Зберегти).
import { useEffect, useState } from 'react';
import { Ban, RefreshCw, Save, Search, Timer, UserRound } from 'lucide-react';
import type { Tr } from '../../mcp-ui';
import HulpVraag from '../../hulp/HulpVraag';
import { Knop, Melding, exact, type Uitkomst } from '../ui';
import { beheerBeleid, beheerIntrekken, beheerVerlengen, laadBeheer, useBeheerToegang, wisBeheer } from './bron';
import { Aftellen, Chips, RuimteBadge, Venster, tgFout } from './delen';
import { ALLE_BROWSER_CAPS, BELEID_MAX_DAGEN, BELEID_MAX_MINUTEN, PRIVE_DAGEN, TECH_MINUTEN, capMens, filterGebruikers, type BeheerBrowser, type BeheerFilter, type BeheerGebruiker, type Beleid, type Ruimte } from './model';
import { MAX_DAGEN, MAX_MINUTEN } from '../../../shared/extensie-ontgrendeling';

type Vraag = { userId: string; agentId?: string; ruimte?: Ruimte; titel: string; tekst: string };
const minTekst = (m: number, tr: Tr) => (m < 60 ? tr(`${m} хв`, `${m} min`) : tr(`${m / 60} год`, `${m / 60} u`));
const dagTekst = (d: number, tr: Tr) => (d === 1 ? tr('1 день', '1 dag') : d >= MAX_DAGEN ? tr('Без обмеження', 'Onbeperkt') : tr(`${d} днів`, `${d} dagen`));
const minBeleid = (m: number, tr: Tr) => (m >= MAX_MINUTEN ? tr('Без обмеження', 'Onbeperkt') : m >= 1440 ? tr(`${Math.round(m / 1440)} дн.`, `${Math.round(m / 1440)} d`) : minTekst(m, tr));
const metHuidig = (opties: readonly number[], huidig: number) => ((opties as readonly number[]).includes(huidig) ? opties : [...opties, huidig].sort((a, b) => a - b));

export default function AlleGebruikers({ tr, ikEigenaar }: { tr: Tr; ikEigenaar: boolean }) {
  const s = useBeheerToegang();
  const uk = tr('uk', 'nl') === 'uk';
  const [zoek, setZoek] = useState('');
  const [filter, setFilter] = useState<BeheerFilter>('alle');
  const [vraag, setVraag] = useState<Vraag | null>(null);
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState<Uitkomst>(null);
  useEffect(() => {
    void laadBeheer();
    const t = window.setInterval(() => { if (!document.hidden) void laadBeheer(); }, 60_000);
    // Andermans gegevens niet laten staan als de sectie verdwijnt (tech-modus uit, ander tabblad).
    return () => { window.clearInterval(t); wisBeheer(); };
  }, []);
  const voer = async (sleutel: string, taak: () => Promise<string>, wat: [string, string]) => {
    setBezig(sleutel); setMelding(null);
    try { setMelding({ soort: 'ok', tekst: await taak(), at: Date.now() }); return true; }
    catch (e) { setMelding({ soort: 'fout', tekst: tgFout(e, tr, wat), at: Date.now() }); return false; }
    finally { setBezig(''); }
  };
  const bevestigIntrekken = () => {
    if (!vraag) return;
    const v = vraag;
    void voer(`in:${v.userId}:${v.agentId ?? ''}:${v.ruimte ?? ''}`, async () => {
      await beheerIntrekken(v.userId, { agentId: v.agentId, ruimte: v.ruimte });
      return tr('Доступ відкликано. Розширення в цієї людини заблоковане; вона отримала сповіщення.', 'Toegang ingetrokken. De extensie van deze persoon is vergrendeld; zij kreeg een melding.');
    }, ['Не вдалося відкликати', 'Intrekken mislukt']).then(() => setVraag(null));
  };
  const lijst = filterGebruikers(s.gebruikers, zoek, filter);

  return (
    <section className='tg-blok tg-beheer' aria-labelledby='tg-beheer-kop' data-tg-beheer=''>
      <div className='tg-blok-kop'>
        <h3 id='tg-beheer-kop'>{tr('Усі користувачі', 'Alle gebruikers')} <span className='ag-teller'>{s.gebruikers.length}</span> <HulpVraag k='toegang.beheer' meer={[['toegang.beheer.verlengen', 'Продовжити доступ', 'Toegang verlengen']]} uk={uk} label={tr('Усі користувачі', 'Alle gebruikers')} /></h3>
        <Knop icoon={<RefreshCw />} onClick={() => void laadBeheer()} data='tg-beheer-vernieuw'>{tr('Оновити', 'Vernieuwen')}</Knop>
      </div>
      <p className='tg-noot'>{tr('Видно лише власнику та технічному профілю з правом «Керування користувачами». Кожна дія записується в журнал, а людина отримує сповіщення.', 'Alleen zichtbaar voor de eigenaar en een technisch profiel met «Gebruikers beheren». Elke actie komt in het logboek en de persoon krijgt een melding.')}</p>
      <div className='tg-werkbalk' role='search'>
        <label className='tg-veld tg-zoek'>
          <span><Search aria-hidden='true' size={14} /> {tr('Пошук', 'Zoeken')}</span>
          <input type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={tr('ім’я або e-mail', 'naam of e-mail')} data-tg-zoek='' />
        </label>
        <label className='tg-veld'>
          <span>{tr('Показати', 'Tonen')}</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as BeheerFilter)} data-hulp-vrij='filter' data-tg-filter=''>
            <option value='alle'>{tr('Усіх', 'Iedereen')}</option>
            <option value='open'>{tr('З відкритим доступом', 'Met open toegang')}</option>
            <option value='tech'>{tr('З технічним профілем', 'Met technisch profiel')}</option>
            <option value='geblokkeerd'>{tr('З вимкненим профілем', 'Met uitgezet profiel')}</option>
          </select>
        </label>
      </div>
      <div aria-live='polite' className='tg-live'>
        <Melding uitkomst={melding} tr={tr} onSluit={() => setMelding(null)} />
        {s.verboden ? <p className='ag-melding ag-melding-fout' role='alert' data-tg-verboden=''>{tr('Сервер відмовив: потрібне право «Керування користувачами» в активному технічному профілі.', 'De server weigert: «Gebruikers beheren» in een actief technisch profiel is nodig.')}</p>
          : s.fout ? <p className='ag-melding ag-melding-fout' role='alert'>{tgFout(s.fout, tr, ['Не вдалося завантажити користувачів', 'Gebruikers laden mislukt'])}</p> : null}
      </div>
      {!s.geladen ? <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p> : lijst.length ? (
        <ul className='tg-kaarten'>
          {lijst.map((u) => (
            <GebruikerKaart key={u.userId} u={u} tr={tr} uk={uk} ikEigenaar={ikEigenaar} bezig={bezig}
              onIntrekken={(v) => setVraag(v)}
              onVerleng={(b, duur) => void voer(`ver:${b.agentId}`, async () => { await beheerVerlengen(b.ontgrendeling!.gid, duur); return tr(`Доступ «${b.naam}» (${u.email}) продовжено.`, `Toegang «${b.naam}» (${u.email}) verlengd.`); }, ['Не вдалося продовжити', 'Verlengen mislukt'])}
              onBewaar={(b) => voer(`bel:${u.userId}`, async () => { await beheerBeleid(u.userId, b); return tr(`Політику ${u.email} збережено. Доступи поза нею вже відкликано.`, `Beleid van ${u.email} opgeslagen. Toegang daarbuiten is al ingetrokken.`); }, ['Не вдалося зберегти політику', 'Beleid opslaan mislukt'])} />
          ))}
        </ul>
      ) : <p className='tg-leeg'>{tr('Нікого не знайдено.', 'Niemand gevonden.')}</p>}
      {vraag ? (
        <Venster titel={vraag.titel} ja={tr('Так, відкликати', 'Ja, intrekken')} nee={tr('Скасувати', 'Annuleren')} onJa={bevestigIntrekken} onNee={() => setVraag(null)} bezig={!!bezig} data='beheer-intrekken'>
          <p>{vraag.tekst}</p>
          <p>{tr('Розширення в цієї людини одразу заблокується, ШІ зупиниться. Людина отримає сповіщення; дія потрапить у журнал.', 'De extensie van deze persoon vergrendelt meteen en de AI stopt. De persoon krijgt een melding; de actie komt in het logboek.')} {/* hulp:eigen-vraag — bevestigingsvenster zonder kop */}<HulpVraag k='toegang.beheer.intrekken' uk={uk} label={tr('Відкликати', 'Intrekken')} /></p>
        </Venster>
      ) : null}
    </section>
  );
}

function GebruikerKaart({ u, tr, uk, ikEigenaar, bezig, onIntrekken, onVerleng, onBewaar }: {
  u: BeheerGebruiker; tr: Tr; uk: boolean; ikEigenaar: boolean; bezig: string;
  onIntrekken: (v: Vraag) => void; onVerleng: (b: BeheerBrowser, duur: { minuten: number } | { dagen: number }) => void; onBewaar: (b: Beleid) => Promise<boolean>;
}) {
  const beschermd = u.eigenaar && !ikEigenaar;
  const open = u.browsers.filter((b) => b.ontgrendeling && b.ontgrendeling.eind > Date.now());
  const wie = u.naam ? `${u.naam} (${u.email})` : u.email;
  return (
    <li className='tg-kaart' data-tg-gebruiker={u.userId}>
      <div className='tg-kaart-kop'>
        <span className='tg-icoon' aria-hidden='true'><UserRound /></span>
        <span className='tg-kaart-titel'>
          <b>{u.naam || u.email}</b>
          {u.naam ? <span className='tg-email'>{u.email}</span> : null}
          {u.eigenaar ? <span className='ag-badge ag-warn' data-badge='eigenaar'>{tr('Власник', 'Eigenaar')}</span> : null}
          <span className={`ag-badge ${u.techProfiel ? 'tg-badge-tech' : 'ag-off'}`} data-tech-profiel={u.techProfiel ? '1' : '0'}>{u.techProfiel ? tr('Технічний профіль: так', 'Technisch profiel: ja') : tr('Технічний профіль: ні', 'Technisch profiel: nee')}</span>
        </span>
      </div>
      {u.browsers.length ? (
        <ul className='tg-sloten'>
          {u.browsers.map((b) => <SlotRij key={b.agentId} b={b} u={u} tr={tr} uk={uk} bezig={bezig} beschermd={beschermd} wie={wie} onIntrekken={onIntrekken} onVerleng={onVerleng} />)}
        </ul>
      ) : <p className='tg-noot'>{tr('Браузерів не підключено.', 'Geen browsers gekoppeld.')}</p>}
      <div className='tg-knoppen'>
        <Knop toon='danger' icoon={<Ban />} disabled={!open.length || !!bezig || beschermd} data={`tg-beheer-alles:${u.userId}`}
          onClick={() => onIntrekken({ userId: u.userId, titel: tr('Відкликати весь доступ розширення?', 'Alle extensietoegang intrekken?'), tekst: tr(`Усі відкриті доступи розширення користувача ${wie} (${open.length}) буде відкликано.`, `Alle open extensietoegang van ${wie} (${open.length}) wordt ingetrokken.`) })}>
          {tr('Відкликати все', 'Alles intrekken')}
        </Knop>
      </div>
      {beschermd ? <p className='tg-noot' data-tg-beschermd=''>{tr('Це обліковий запис власника: його політику й доступи може змінювати лише сам власник. Сервер відхилить зміни.', 'Dit is het account van de eigenaar: beleid en toegang wijzigt alleen de eigenaar zelf. De server weigert wijzigingen.')}</p> : null}
      <details className='tg-beleid-wrap'>
        <summary>{tr('Політика', 'Beleid')}{' '}
          {/* Eén (?) voor het hele beleid; preventDefault: een tik op (?) klapt de <details> niet open of dicht. */}
          <span onClick={(e) => e.preventDefault()}><HulpVraag k='toegang.beleid.prive-aan' naam={['Профіль користувача дозволено', 'Gebruikersprofiel toegestaan']} meer={[['toegang.beleid.technisch-aan', 'Технічний профіль дозволено', 'Technisch profiel toegestaan'], ['toegang.beleid.max-dagen', 'Макс. строк (користувач)', 'Max. termijn (gebruiker)'], ['toegang.beleid.max-minuten', 'Макс. строк (технічний)', 'Max. termijn (technisch)'], ['toegang.beleid.lokaal', 'Локальний агент', 'Lokale agent'], ['toegang.beleid.notitie', 'Нотатка', 'Notitie']]} uk={uk} label={tr('Політика', 'Beleid')} /></span>{u.beleid.gewijzigdOp ? <small> · {tr('змінено', 'gewijzigd')} {exact(u.beleid.gewijzigdOp)}{u.beleid.gewijzigdDoor ? ` · ${u.beleid.gewijzigdDoor}` : ''}</small> : null}</summary>
        <BeleidForm u={u} tr={tr} uk={uk} beschermd={beschermd} bezig={bezig === `bel:${u.userId}`} onBewaar={onBewaar} />
      </details>
    </li>
  );
}

function SlotRij({ b, u, tr, bezig, beschermd, wie, onIntrekken, onVerleng }: {
  b: BeheerBrowser; u: BeheerGebruiker; tr: Tr; uk: boolean; bezig: string; beschermd: boolean; wie: string;
  onIntrekken: (v: Vraag) => void; onVerleng: (b: BeheerBrowser, duur: { minuten: number } | { dagen: number }) => void;
}) {
  const o = b.ontgrendeling && b.ontgrendeling.eind > Date.now() ? b.ontgrendeling : null;
  const prive = b.ruimte === 'prive';
  const dagen = PRIVE_DAGEN.filter((d) => d <= u.beleid.priveMaxDagen);
  const minuten = TECH_MINUTEN.filter((m) => m <= u.beleid.technischMaxMinuten);
  const [duur, setDuur] = useState<number>(prive ? dagen[0] ?? 1 : minuten.includes(60) ? 60 : minuten[0] ?? 15);
  const ruimteNaam = prive ? tr('профіль користувача', 'gebruikersprofiel') : tr('технічний профіль', 'technisch profiel');
  return (
    <li className='tg-slot' data-tg-slot={b.agentId} data-ruimte={b.ruimte}>
      <div className='tg-slot-kop'>
        <b>{b.naam}</b> <RuimteBadge ruimte={b.ruimte} tr={tr} />
        {b.online ? <span className='ag-badge ag-ok'>{tr('у мережі', 'online')}</span> : <span className='ag-badge ag-off'>{tr('не в мережі', 'offline')}</span>}
        {b.versie ? <code>{b.versie}</code> : null}
      </div>
      {o ? (
        <>
          <dl className='tg-feiten'>
            <div><dt>{tr('Що може ШІ', 'Wat de AI mag')}</dt><dd><Chips items={o.caps.map(capMens)} tr={tr} /></dd></div>
            <div><dt>{tr('Де', 'Waar')}</dt><dd><Chips items={o.domeinen.map((h) => [h, h] as const)} tr={tr} /></dd></div>
            <div><dt>{tr('До коли', 'Tot wanneer')}</dt><dd><Aftellen tot={o.eind} tr={tr} />{o.lokaal ? <> · {tr('з локальним агентом', 'met lokale agent')}</> : null}</dd></div>
          </dl>
          <div className='tg-knoppen'>
            <Knop toon='danger' icoon={<Ban />} disabled={!!bezig || beschermd} data={`tg-beheer-intrekken:${b.agentId}`}
              onClick={() => onIntrekken({ userId: u.userId, agentId: b.agentId, ruimte: b.ruimte, titel: tr('Відкликати чужий доступ?', 'Andermans toegang intrekken?'), tekst: tr(`Відкликати доступ «${b.naam}» (${ruimteNaam}) користувача ${wie}?`, `Toegang «${b.naam}» (${ruimteNaam}) van ${wie} intrekken?`) })}>
              {tr('Відкликати', 'Intrekken')}
            </Knop>
            <label className='tg-veld tg-veld-inline'>
              <span className='sr-only'>{tr('Продовжити на', 'Verlengen met')}</span>
              <select data-hulp='toegang.beheer.verlengen' value={duur} disabled={!!bezig || beschermd} onChange={(e) => setDuur(Number(e.target.value))}>
                {(prive ? dagen : minuten).map((x) => <option key={x} value={x}>{prive ? dagTekst(x, tr) : minTekst(x, tr)}</option>)}
              </select>
            </label>
            <Knop icoon={<Timer />} bezig={bezig === `ver:${b.agentId}`} disabled={!!bezig || beschermd} data={`tg-beheer-verleng:${b.agentId}`} onClick={() => onVerleng(b, prive ? { dagen: duur } : { minuten: duur })}>{tr('Продовжити', 'Verlengen')}</Knop>
          </div>
        </>
      ) : <p className='tg-noot'>{tr('Доступ закрито (немає розблокування).', 'Toegang dicht (geen ontgrendeling).')}</p>}
    </li>
  );
}

function BeleidForm({ u, tr, uk, beschermd, bezig, onBewaar }: { u: BeheerGebruiker; tr: Tr; uk: boolean; beschermd: boolean; bezig: boolean; onBewaar: (b: Beleid) => Promise<boolean> }) {
  const [b, setB] = useState<Beleid>(u.beleid);
  useEffect(() => { setB(u.beleid); }, [u.beleid]);
  const zet = (p: Partial<Beleid>) => setB((x) => ({ ...x, ...p }));
  const uit = beschermd || bezig;
  const capsVeld = (ruimte: Ruimte) => {
    const sleutel = ruimte === 'prive' ? 'priveCaps' : 'technischCaps';
    const waarde = b[sleutel];
    return (
      <fieldset className='tg-veldset' data-tg-caps={ruimte}>
        <legend>{ruimte === 'prive' ? tr('Можливості: профіль користувача', 'Mogelijkheden: gebruikersprofiel') : tr('Можливості: технічний профіль', 'Mogelijkheden: technisch profiel')}{' '}
          <HulpVraag k={`toegang.beleid.${ruimte}-caps`} uk={uk} label={tr('Можливості', 'Mogelijkheden')} /></legend>
        <label className='tg-vink'>
          <input type='checkbox' data-hulp={`toegang.beleid.${ruimte}-caps`} checked={waarde === null} disabled={uit} onChange={(e) => zet({ [sleutel]: e.target.checked ? null : [...ALLE_BROWSER_CAPS] } as Partial<Beleid>)} />
          <span>{tr('Усі (без обмежень політики)', 'Alle (zonder beperking van het beleid)')}</span>
        </label>
        {ALLE_BROWSER_CAPS.map((c) => (
          <label key={c} className='tg-vink'>
            <input type='checkbox' data-hulp={`toegang.beleid.${ruimte}-caps`} data-tg-cap={`${ruimte}:${c}`} checked={waarde === null || waarde.includes(c)} disabled={uit || waarde === null}
              onChange={(e) => zet({ [sleutel]: e.target.checked ? [...(waarde ?? []), c] : (waarde ?? []).filter((x) => x !== c) } as Partial<Beleid>)} />
            <span>{tr(...capMens(c))}</span>
          </label>
        ))}
      </fieldset>
    );
  };
  return (
    <form className='tg-beleid' data-tg-beleid={u.userId} onSubmit={(e) => { e.preventDefault(); if (!uit) void onBewaar(b); }}>
      <label className='tg-vink'>
        <input type='checkbox' data-hulp='toegang.beleid.prive-aan' checked={b.priveAan} disabled={uit} onChange={(e) => zet({ priveAan: e.target.checked })} />
        <span>{tr('Профіль користувача дозволено', 'Gebruikersprofiel toegestaan')}</span>
      </label>
      <label className='tg-vink'>
        <input type='checkbox' data-hulp='toegang.beleid.technisch-aan' checked={b.technischAan} disabled={uit} onChange={(e) => zet({ technischAan: e.target.checked })} />
        <span>{tr('Технічний профіль дозволено', 'Technisch profiel toegestaan')}{u.techProfiel ? '' : tr(' (зараз профілю немає)', ' (nu geen profiel)')}</span>
      </label>
      {capsVeld('prive')}
      {capsVeld('technisch')}
      <div className='tg-velden'>
        <label className='tg-veld'>
          <span>{tr('Макс. строк (користувач)', 'Max. termijn (gebruiker)')}</span>
          <select data-hulp='toegang.beleid.max-dagen' value={b.priveMaxDagen} disabled={uit} onChange={(e) => zet({ priveMaxDagen: Number(e.target.value) })}>
            {metHuidig(BELEID_MAX_DAGEN, b.priveMaxDagen).map((d) => <option key={d} value={d}>{dagTekst(d, tr)}</option>)}
          </select>
        </label>
        <label className='tg-veld'>
          <span>{tr('Макс. строк (технічний)', 'Max. termijn (technisch)')}</span>
          <select data-hulp='toegang.beleid.max-minuten' value={b.technischMaxMinuten} disabled={uit} onChange={(e) => zet({ technischMaxMinuten: Number(e.target.value) })}>
            {metHuidig(BELEID_MAX_MINUTEN, b.technischMaxMinuten).map((m) => <option key={m} value={m}>{minBeleid(m, tr)}</option>)}
          </select>
        </label>
      </div>
      <label className='tg-vink'>
        <input type='checkbox' data-hulp='toegang.beleid.lokaal' checked={b.lokaalAan} disabled={uit} onChange={(e) => zet({ lokaalAan: e.target.checked })} />
        <span>{tr('Локальний агент дозволено', 'Lokale agent toegestaan')}</span>
      </label>
      <label className='tg-veld'>
        <span>{tr('Нотатка', 'Notitie')}</span>
        <textarea data-hulp='toegang.beleid.notitie' rows={2} maxLength={500} value={b.notitie} disabled={uit} onChange={(e) => zet({ notitie: e.target.value })} />
      </label>
      <div className='tg-knoppen'>
        <Knop type='submit' toon='primary' icoon={<Save />} bezig={bezig} disabled={beschermd} data={`tg-beleid-bewaar:${u.userId}`}>{tr('Зберегти', 'Opslaan')}</Knop>
      </div>
    </form>
  );
}
