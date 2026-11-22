import { useCallback, useEffect, useRef, useState } from 'react';
import { BookUser, Building2, CalendarDays, Mail, Phone, Plus, RefreshCw, Search, UserRound } from 'lucide-react';
import { FASEN, klantdossier, verkoopstand, type Klantbewerking, type Klantoverzicht, type Verkoopkans, type Vervolgtaak } from '../../shared/klantrelatiebeheer';
import { sleutelkluisOntgrendelAdres } from '../../shared/github-koppeling';
import { api, ApiError } from '../platform/client';
import Invoervenster from './Invoervenster';
import Koppelingen, { Klantafspraak } from './Koppelingen';
import Relatiehulp from './Relatiehulp';
import Rekenvoorstel from './Rekenvoorstel';
import Werkoverzicht, { eerstvolgende, Faseoverzicht, Kader, Kerncijfers, Leeg, Takenlijst, Tijdlijn } from './Werkoverzicht';
import { bewerkingNamen, faseNamen, geld, land, tabNamen, tekst, type Bewerking, type Taal } from './relatietaal';
import './klantrelatiebeheer.css';

type Eigenschappen = { lang: Taal; tab: string; naarTab: (naam: string) => void; tabContext: string; sourceOrigin: string };
type Velden = Record<string, unknown>;
const grondpad = '/api/owner/klantrelatiebeheer/';

function fouttekst(lang: Taal, fout: unknown) {
  const t = (uk: string, nl: string) => tekst(lang, uk, nl);
  if (fout instanceof ApiError) {
    if (fout.status === 423) return t('Для роботи з досьє увімкніть та відкрийте особисте сховище ключів.', 'Schakel de persoonlijke sleutelkluis in en ontgrendel deze om dossiers te openen.');
    if (fout.status === 401 || fout.status === 403) return t('Доступу до цієї дії немає. Перевірте обліковий запис і права простору.', 'U hebt geen toegang tot deze handeling. Controleer uw aanmelding en de rechten van de ruimte.');
    if (fout.status === 400 || fout.status === 422) return t('Перевірте введені значення.', 'Controleer de ingevulde waarden.');
    if (fout.status === 409) return t('Запис вже змінився. Оновіть огляд і перевірте його стан.', 'Het dossier is intussen gewijzigd. Vernieuw het overzicht en controleer de stand.');
  }
  return t('Не вдалося отримати відповідь від сервера. Перевірте з’єднання та повторіть спробу.', 'De dienst antwoordt niet. Controleer de verbinding en probeer het opnieuw.');
}

export default function Klantrelatiebeheer({ lang, tab, naarTab, tabContext, sourceOrigin }: Eigenschappen) {
  const t = (uk: string, nl: string) => tekst(lang, uk, nl);
  const [overzicht, zetOverzicht] = useState<Klantoverzicht | null>(null);
  const [fout, zetFout] = useState('');
  const [bezig, zetBezig] = useState(false);
  const [kluisDicht, zetKluisDicht] = useState(false);
  const [bericht, meld] = useState('');
  const [leest, zetLeest] = useState(true);
  const [bewerking, zetBewerking] = useState<Bewerking | null>(null);
  const [gekozen, kies] = useState(() => new URLSearchParams(window.location.search).get('klant') || '');
  const [zoek, zoekNaar] = useState('');
  const [takenfilter, filterTaken] = useState<'open' | 'klaar' | 'alle'>('open');
  const [fasefilter, filterFase] = useState('');
  const nummer = useRef(0);
  const opslaanBezig = useRef(false);
  const herhalingen = useRef(new Map<string, string>());
  const taal = useRef(lang);
  taal.current = lang;
  const laad = useCallback(async () => {
    const volgnummer = ++nummer.current;
    zetLeest(true);
    try {
      const antwoord = await api.post(grondpad + 'overzicht', { service: 'crm', tabContext, sourceOrigin });
      if (nummer.current !== volgnummer) return;
      const inhoud: Klantoverzicht = antwoord.data;
      if (!inhoud || !Array.isArray(inhoud.klanten) || !Array.isArray(inhoud.kansen) ||
          !Array.isArray(inhoud.taken) || !Array.isArray(inhoud.momenten) || typeof inhoud.magSchrijven !== 'boolean') throw new Error();
      zetOverzicht(inhoud);
      zetKluisDicht(false);
      zetFout('');
    } catch (reden) {
      if (nummer.current !== volgnummer) return;
      zetFout(fouttekst(taal.current, reden));
      zetKluisDicht(reden instanceof ApiError && reden.status === 423);
      zetOverzicht(null);
    } finally {
      if (nummer.current === volgnummer) zetLeest(false);
    }
  }, [tabContext, sourceOrigin]);
  useEffect(() => {
    void laad();
    return () => { nummer.current++; };
  }, [laad]);
  async function schrijf(soort: Klantbewerking, waarden: Velden) {
    if (!overzicht?.magSchrijven || opslaanBezig.current) throw new Error(t('Зараз запис недоступний.', 'Schrijven is op dit moment niet mogelijk.'));
    opslaanBezig.current = true;
    zetBezig(true);
    const vingerafdruk = JSON.stringify([soort, waarden]);
    const sleutel = herhalingen.current.get(vingerafdruk) || crypto.randomUUID();
    herhalingen.current.set(vingerafdruk, sleutel);
    try {
      const antwoord = await api.post(grondpad + soort, { service: 'crm', tabContext, sourceOrigin, ...waarden, sleutel });
      herhalingen.current.delete(vingerafdruk);
      if (soort === 'klant') {
        kies(antwoord.data.id);
        zoekNaar('');
        naarTab('klanten');
      }
      meld(t('Зміни збережено.', 'De wijzigingen zijn opgeslagen.'));
      await laad();
    } catch (reden) {
      throw new Error(fouttekst(lang, reden));
    } finally {
      opslaanBezig.current = false;
      zetBezig(false);
    }
  }
  function voerUit(soort: Klantbewerking, waarden: Velden) {
    meld('');
    void schrijf(soort, waarden).catch(reden => zetFout(reden.message));
  }
  function naarKlant(id: string) {
    kies(id);
    zoekNaar('');
    naarTab('klanten');
  }
  const afronden = (taak: Vervolgtaak) => voerUit('afronden', { taakId: taak.id });
  function openen(soort: Bewerking) {
    meld('');
    zetBewerking(soort);
  }
  const pagina = tab in tabNamen ? tab : 'overzicht';
  const overzichtsknop: Bewerking = pagina === 'overeenkomsten' ? 'kans' : pagina === 'taken' ? 'taak' : 'klant';
  const nieuw = overzicht?.klanten.length ? overzichtsknop : 'klant';
  const naam = t(...tabNamen[pagina]);
  const klanten = [...(overzicht?.klanten || [])].sort((a, b) => a.naam.localeCompare(b.naam, land(lang)));
  const gevonden = klanten.filter(k => [k.naam, k.organisatie, k.mail, k.telefoon].join(' ').toLocaleLowerCase(land(lang)).includes(zoek.trim().toLocaleLowerCase(land(lang))));
  const klant = gevonden.find(k => k.id === gekozen) ?? gevonden[0];
  const dossier = overzicht && klant ? klantdossier(overzicht, klant.id) : null;
  const nieuweKnop = (soort: Bewerking) => <button type="button" disabled={bezig} className="kr-knop" onClick={() => openen(soort)}><Plus size={16} aria-hidden="true"/>{t(...bewerkingNamen[soort])}</button>;

  function kansenlijst(kansen: Verkoopkans[], toonKlant: boolean) {
    if (!overzicht) return null;
    if (!kansen.length) return <Leeg>{t('Угод за цим відбором поки немає.', 'Er zijn nog geen verkoopkansen voor deze selectie.')}</Leeg>;
    return <ul className="kr-kansen">{kansen.map(kans => {
      const klantNaam = klanten.find(k => k.id === kans.klantId)?.naam || '';
      return <li key={kans.id}><div className="kr-kansregel"><div className="kr-rijtekst"><strong>{kans.titel}</strong>
        {toonKlant && <button type="button" className="kr-tekstknop" onClick={() => naarKlant(kans.klantId)}>{klantNaam}</button>}
      </div><b>{geld(lang, kans.centen)}</b>
      {overzicht.magSchrijven ? <label className="kr-fasekeuze"><span className={'kr-fasestip kr-' + kans.fase} aria-hidden="true"/>
        <select aria-label={t('Етап угоди', 'Fase verkoopkans') + ' · ' + kans.titel} disabled={bezig} value={kans.fase}
          onChange={e => voerUit('fase', { kansId: kans.id, fase: e.target.value, vorigeFase: kans.fase })}>
          {FASEN.map(f => <option value={f} key={f}>{t(...faseNamen[f])}</option>)}
        </select></label> : <span>{t(...faseNamen[kans.fase])}</span>}</div>
        <Rekenvoorstel lang={lang} klantNaam={klantNaam} titel={kans.titel} centen={kans.centen} magSchrijven={overzicht.magSchrijven}
          bewaar={inhoud => schrijf('contact', { klantId: kans.klantId, kansId: kans.id, kanaal: 'notitie', richting: 'intern', tekst: inhoud })}/>
      </li>;
    })}</ul>;
  }
  const hulp = klant && dossier && overzicht && <Relatiehulp key={klant.id} taal={lang} klantnaam={klant.naam}
    contacten={dossier.momenten.map(m => ({ datum: m.aangemaakt, tekst: m.tekst }))} openTaken={dossier.taken.filter(a => !a.klaar).length}
    minuten={dossier.momenten.reduce((som, m) => som + m.minuten, 0)} magSchrijven={overzicht.magSchrijven}
    opTaak={(titel, datum) => schrijf('taak', { klantId: klant.id, titel, datum: datum || '' })}/>;
  const leegKlant = <Leeg>{t('Додайте першого клієнта, щоб відкрити його картку.', 'Voeg de eerste klant toe om een dossier te openen.')}</Leeg>;
  return <div className="kr-ruimte" lang={lang}>
    <header className="kr-kop"><div><div className="kr-plaats"><BookUser size={16} aria-hidden="true"/>Klantrelatiebeheer</div><h2>{naam}</h2>
      {pagina === 'overzicht' && <p className="kr-vandaag"><CalendarDays size={15} aria-hidden="true"/>{new Intl.DateTimeFormat(land(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</p>}
    </div><div className="kr-acties"><button className="kr-rond" type="button" title={t('Оновити дані', 'Gegevens vernieuwen')} aria-label={t('Оновити дані', 'Gegevens vernieuwen')}
      disabled={leest || bezig} onClick={() => void laad()}><RefreshCw size={18}/></button>
      {overzicht?.magSchrijven && !['koppelingen','inzichten','assistenten'].includes(pagina) && <button type="button" className="kr-knop kr-hoofd" disabled={bezig} onClick={() => openen(nieuw)}><Plus size={17} aria-hidden="true"/>{t(...bewerkingNamen[nieuw])}</button>}
    </div></header>
    {fout && <div role="alert" className="kr-fout">{fout} {kluisDicht && <a href={sleutelkluisOntgrendelAdres(sourceOrigin)}>{t('Відкрити сховище ключів', 'Naar de sleutelkluis')}</a>} <button className="kr-tekstknop" onClick={() => void laad()} disabled={leest}>{t('Оновити', 'Vernieuwen')}</button></div>}
    {bericht && <p className="kr-bericht" role="status">{bericht}</p>}
    {leest && !overzicht && <p className="kr-leeg" role="status">{t('Зчитуємо дані простору…', 'De gegevens worden opgehaald…')}</p>}
    {overzicht && <>
      {pagina === 'overzicht' && <Werkoverzicht lang={lang} overzicht={overzicht} naarTab={naarTab} naarKlant={naarKlant} afronden={afronden} bezig={bezig}/>}
      {pagina === 'koppelingen' && <Koppelingen lang={lang} tabContext={tabContext} magSchrijven={overzicht.magSchrijven}/>}
      {(pagina === 'klanten' || pagina === 'assistenten') && <div className="kr-dossierraam"><aside className="kr-klantkeuze">
        <h3>{t('Список клієнтів', 'Klantenlijst')} <span>{klanten.length}</span></h3><label className="kr-zoek"><Search size={17} aria-hidden="true"/><input type="search" value={zoek}
          onChange={e => zoekNaar(e.target.value)} placeholder={t('Знайти клієнта', 'Klant zoeken')} aria-label={t('Знайти клієнта', 'Klant zoeken')}/></label>
        {gevonden.length ? <ul>{gevonden.map(k => <li key={k.id}><button type="button" onClick={() => kies(k.id)} aria-pressed={k.id === klant?.id}>
          <span className="kr-monogram" aria-hidden="true">{k.naam.trim().slice(0, 1).toLocaleUpperCase(land(lang))}</span><span><strong>{k.naam}</strong>{k.organisatie && <small>{k.organisatie}</small>}</span>
        </button></li>)}</ul> : <Leeg>{zoek ? t('Збігів немає.', 'Geen overeenkomsten.') : t('Список порожній.', 'De lijst is leeg.')}</Leeg>}
      </aside><div className="kr-dossier">
        {klant && dossier ? <><header className="kr-kaartkop"><span className="kr-persoon"><UserRound size={24} aria-hidden="true"/></span><div>
          <h3>{klant.naam}</h3>{klant.organisatie && <p><Building2 size={14} aria-hidden="true"/>{klant.organisatie}</p>}</div></header>
          {pagina === 'assistenten' ? hulp : <>
            <div className="kr-gegevens">{klant.mail && <a href={'mailto:' + klant.mail}><Mail size={16} aria-hidden="true"/>{klant.mail}</a>}{klant.telefoon && <a href={'tel:' + klant.telefoon}><Phone size={16} aria-hidden="true"/>{klant.telefoon}</a>}</div>
            {overzicht.magSchrijven && <div className="kr-acties">{nieuweKnop('contact')}{nieuweKnop('taak')}{nieuweKnop('kans')}<button className="kr-knop" onClick={() => openen('wijzig')}>{t(...bewerkingNamen.wijzig)}</button></div>}
            <Kader titel={t('Історія взаємодій', 'Contactgeschiedenis')}><Tijdlijn lang={lang} overzicht={overzicht} momenten={[...dossier.momenten].sort((a, b) => b.aangemaakt - a.aangemaakt)}/></Kader>
            <Kader titel={t('Угоди клієнта', 'Verkoopkansen van deze klant')}>{kansenlijst(dossier.kansen, false)}</Kader>
            <Kader titel={t('Завдання клієнта', 'Taken voor deze klant')}><Takenlijst lang={lang} overzicht={overzicht} taken={[...dossier.taken].sort(eerstvolgende)} naarKlant={naarKlant} afronden={afronden} bezig={bezig}/></Kader>
            <Klantafspraak key={klant.id} lang={lang} tabContext={tabContext} magSchrijven={overzicht.magSchrijven} klantId={klant.id} klantNaam={klant.naam} naWijziging={laad}/>
            {hulp}
            <details className="kr-kader"><summary>{t('Керування досьє', 'Dossierbeheer')}</summary>
              <button type="button" className="kr-knop" onClick={() => {
                const adres = URL.createObjectURL(new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' }));
                const link = document.createElement('a'); link.href = adres; link.download = 'klantdossier-' + klant.id + '.json'; link.click();
                window.setTimeout(() => URL.revokeObjectURL(adres), 10000);
              }}>{t('Завантажити копію досьє', 'Dossier downloaden')}</button>
              {overzicht.magSchrijven && <button type="button" className="kr-knop" onClick={() => openen('wissen')}>{t(...bewerkingNamen.wissen)}</button>}
            </details>
          </>}</> : zoek ? <Leeg>{t('Змініть пошуковий запит.', 'Pas de zoekopdracht aan.')}</Leeg> : leegKlant}
      </div></div>}
      {pagina === 'overeenkomsten' && <>
        <Kader titel={t('Угоди за етапами', 'Verkoopkansen per fase')}><Faseoverzicht lang={lang} overzicht={overzicht}/></Kader>
        <Kader titel={t('Перелік угод', 'Verkoopkansen')} extra={<select className="kr-keuze" aria-label={t('Відбір за етапом', 'Op fase filteren')} value={fasefilter} onChange={e => filterFase(e.target.value)}>
          <option value="">{t('Усі етапи', 'Alle fasen')}</option>{FASEN.map(f => <option key={f} value={f}>{t(...faseNamen[f])}</option>)}</select>}>
          {kansenlijst(overzicht.kansen.filter(k => !fasefilter || k.fase === fasefilter), true)}
        </Kader></>}
      {pagina === 'taken' && <Kader titel={t('Перелік завдань', 'Takenlijst')} extra={<select className="kr-keuze" aria-label={t('Стан завдання', 'Taakstatus')} value={takenfilter}
        onChange={e => filterTaken(e.target.value as typeof takenfilter)}><option value="open">{t('Відкриті', 'Open')}</option><option value="klaar">{t('Виконані', 'Afgerond')}</option><option value="alle">{t('Усі', 'Alle')}</option></select>}>
        <Takenlijst lang={lang} overzicht={overzicht} naarKlant={naarKlant} afronden={afronden} bezig={bezig} taken={overzicht.taken.filter(k => takenfilter === 'alle' || k.klaar === (takenfilter === 'klaar')).sort(eerstvolgende)}/></Kader>}
      {pagina === 'inzichten' && <><Kerncijfers lang={lang} overzicht={overzicht}/>
        <div className="kr-tweekolom"><Kader titel={t('Розподіл угод', 'Verdeling van verkoopkansen')}><Faseoverzicht lang={lang} overzicht={overzicht}/></Kader>
        <Kader titel={t('Підсумок роботи', 'Werkresultaten')}><dl className="kr-uitkomst">
          {verkoopstand(overzicht.kansen).filter(v => v.fase === 'gewonnen' || v.fase === 'verloren').map(v => <div key={v.fase}><dt>{t(...faseNamen[v.fase])}</dt><dd>{geld(lang, v.centen)} · {v.aantal}</dd></div>)}
          <div><dt>{t('Записані взаємодії', 'Vastgelegde contacten')}</dt><dd>{overzicht.momenten.length}</dd></div>
          <div><dt>{t('Облікований час', 'Vastgelegde tijd')}</dt><dd>{overzicht.momenten.reduce((s, m) => s + m.minuten, 0)} {t('хв', 'min')}</dd></div>
          <div><dt>{t('Виконані завдання', 'Afgeronde taken')}</dt><dd>{overzicht.taken.filter(v => v.klaar).length}</dd></div>
        </dl></Kader></div></>}
      {bewerking && <Invoervenster lang={lang} soort={bewerking} klantId={klant?.id || ''} overzicht={overzicht} sluit={() => zetBewerking(null)} bewaar={schrijf}/>}
    </>}
  </div>;
}
