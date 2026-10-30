// Toevoegen — de drie wegen uit het dossier (§3): beschrijven in eigen woorden (ruwe tekst gaat MEE als bedoeling en
// raakt nooit kwijt), een bestand (.json/.md/.txt → voorbeeld → bevestigen; idempotent; een kapot bestand wist de tekst
// niet), en de eerlijke uitleg van de agentweg (zelfde API, bron 'agent'; een agent kan nooit zelf goedkeuren).
// AI-structurering is in deze golf GEPLAND en heet ook zo — de mens bepaalt de structuur.
import { useRef, useState } from 'react';
import { Bot, FileUp, PenLine } from 'lucide-react';
import { AFSTEMMING_LIMIETEN, afstemmingTekst, schoneExternId, schoneTitel, type ImportVoorbeeld } from '../../../shared/afstemming-model';
import { afstemmingClient } from '../afstemming-client';
import type { OnderdeelProps } from '../AfstemmingPagina';
import Laag from '../Laag';
import { afstemmingFoutTekst, bronFormaat, criteriaUitTekst, PRIORITEITEN } from '../hulp';
import { foutTekst, tr } from '../tekst';

type Tv = 'beschrijf' | 'bestand' | 'agent';

export default function Toevoegen({ lang, smal, toon, openKaart, onSluit }: OnderdeelProps & { onSluit: () => void }) {
  const [tv, setTv] = useState<Tv>('beschrijf');
  const [besig, setBesig] = useState(false);
  const [fout, setFout] = useState('');
  // ---- weg A: beschrijven
  const [titel, setTitel] = useState('');
  const [samenvatting, setSamenvatting] = useState('');
  const [zadum, setZadum] = useState('');
  const [dienst, setDienst] = useState('');
  const [categorie, setCategorie] = useState('');
  const [prioriteit, setPrioriteit] = useState<'P0' | 'P1' | 'P2' | 'P3'>('P2');
  const [externId, setExternId] = useState('');
  const [criteria, setCriteria] = useState('');
  const idempotentie = useRef<string>(crypto.randomUUID());
  // ---- weg B: bestand
  const [bestandNaam, setBestandNaam] = useState('');
  const [ruw, setRuw] = useState('');
  const [voorbeeld, setVoorbeeld] = useState<ImportVoorbeeld | null>(null);
  const kies = useRef<HTMLInputElement | null>(null);

  const maak = () => void (async () => {
    setBesig(true); setFout('');
    try {
      const uit = await afstemmingClient.voorstel({
        titel: schoneTitel(titel), samenvatting: samenvatting.trim(), bedoeling: zadum, dienst: dienst.trim() || 'api',
        categorie: categorie.trim() || 'idee', prioriteit, criteria: criteriaUitTekst(criteria),
        ...(schoneExternId(externId) ? { externId: schoneExternId(externId) } : {}),
        bron: 'gesprek', idempotentie: idempotentie.current,
      });
      toon(tr(lang, `Чернетку ${uit.kaart.externId} створено.`, `Concept ${uit.kaart.externId} aangemaakt.`));
      onSluit(); openKaart(uit.kaart.id);
    } catch (e) { setFout(afstemmingFoutTekst(lang, e)); }
    finally { setBesig(false); }
  })();

  const leesBestand = (f: File | undefined) => {
    if (!f) return;
    const formaat = bronFormaat(f.name);
    if (!formaat) { setFout(foutTekst(lang, 'FORMAAT_ONBEKEND')); return; }
    if (f.size > AFSTEMMING_LIMIETEN.importBytesMax) { setFout(foutTekst(lang, 'IMPORT_TE_GROOT')); return; }
    const lezer = new FileReader();
    lezer.onload = () => { setBestandNaam(f.name); setRuw(String(lezer.result || '')); setVoorbeeld(null); setFout(''); void maakVoorbeeld(f.name, formaat, String(lezer.result || '')); };
    lezer.onerror = () => setFout(foutTekst(lang, 'IMPORT_ONGELDIG'));
    lezer.readAsText(f);
  };
  const maakVoorbeeld = async (naam: string, formaat: 'json' | 'md' | 'txt', inhoud: string) => {
    setBesig(true);
    try { setVoorbeeld(await afstemmingClient.importVoorbeeld(naam, formaat, inhoud)); setFout(''); }
    catch (e) { setVoorbeeld(null); setFout(afstemmingFoutTekst(lang, e)); }
    finally { setBesig(false); }
  };
  const legVast = () => void (async () => {
    if (!voorbeeld) return;
    setBesig(true); setFout('');
    try {
      const uit = await afstemmingClient.importVastleggen(voorbeeld.invoerHash, voorbeeld.kaart);
      toon(uit.hergebruikt ? tr(lang, `Ця ідея вже була — відкрито наявну картку ${uit.kaart.externId}.`, `Dit idee bestond al — bestaande kaart ${uit.kaart.externId} geopend.`) : tr(lang, `Картку ${uit.kaart.externId} створено з файла.`, `Kaart ${uit.kaart.externId} uit het bestand aangemaakt.`));
      onSluit(); openKaart(uit.kaart.id);
    } catch (e) { setFout(afstemmingFoutTekst(lang, e)); }
    finally { setBesig(false); }
  })();

  return (
    <Laag lang={lang} soort={smal ? 'scherm' : 'venster'} titel={tr(lang, 'Додати ідею', 'Idee toevoegen')} onSluit={onSluit} data={{ 'afv-toevoeg': 'laag' }}>
      <nav className='afv-dtabs' role='tablist' aria-label={tr(lang, 'Спосіб додавання', 'Manier van toevoegen')}>
        <button type='button' role='tab' aria-selected={tv === 'beschrijf'} className={tv === 'beschrijf' ? 'is-actief' : ''} data-afv-tv='beschrijf' onClick={() => setTv('beschrijf')}><PenLine aria-hidden='true' />{tr(lang, 'Описати', 'Beschrijven')}</button>
        <button type='button' role='tab' aria-selected={tv === 'bestand'} className={tv === 'bestand' ? 'is-actief' : ''} data-afv-tv='bestand' onClick={() => setTv('bestand')}><FileUp aria-hidden='true' />{tr(lang, 'Файл', 'Bestand')}</button>
        <button type='button' role='tab' aria-selected={tv === 'agent'} className={tv === 'agent' ? 'is-actief' : ''} data-afv-tv='agent' onClick={() => setTv('agent')}><Bot aria-hidden='true' />{tr(lang, 'Від агента', 'Via een agent')}</button>
      </nav>
      {fout ? <p className='afv-melding is-fout' role='alert'>{fout}</p> : null}

      {tv === 'beschrijf' ? (
        <form className='afv-vorm' onSubmit={(e) => { e.preventDefault(); if (titel.trim()) maak(); }}>
          <label className='afv-veld'><small>{tr(lang, 'Опишіть задум своїми словами — текст зберігається як є, нічого не губиться', 'Beschrijf het idee in eigen woorden — de tekst wordt bewaard zoals hij is')}</small>
            <textarea value={zadum} rows={5} maxLength={AFSTEMMING_LIMIETEN.tekstMax} data-afv-eerste='' data-afv-zadum='' placeholder={tr(lang, 'Хочу, щоб…', 'Ik wil dat…')} onChange={(e) => setZadum(e.target.value)} />
          </label>
          <p className='afv-hint'>{tr(lang, 'ШІ-розбір задуму — заплановано; зараз структуру задаєте ви.', 'AI-structurering is gepland; nu bepaalt u de structuur.')}</p>
          <input value={titel} maxLength={AFSTEMMING_LIMIETEN.titelMax} data-afv-titel='' placeholder={tr(lang, 'Коротка назва (обов’язково)', 'Korte titel (verplicht)')} aria-label={tr(lang, 'Назва', 'Titel')} onChange={(e) => setTitel(e.target.value)} />
          <input value={samenvatting} maxLength={AFSTEMMING_LIMIETEN.samenvattingMax} placeholder={tr(lang, 'Суть одним-двома реченнями', 'Kern in één à twee zinnen')} aria-label={tr(lang, 'Суть', 'Kern')} onChange={(e) => setSamenvatting(e.target.value)} />
          <div className='afv-rij'>
            <input value={dienst} placeholder={tr(lang, 'Сервіс (mail, cloud…)', 'Dienst (mail, cloud…)')} aria-label={tr(lang, 'Сервіс', 'Dienst')} onChange={(e) => setDienst(e.target.value)} />
            <input value={categorie} placeholder={tr(lang, 'Категорія', 'Categorie')} aria-label={tr(lang, 'Категорія', 'Categorie')} onChange={(e) => setCategorie(e.target.value)} />
            <select value={prioriteit} aria-label={tr(lang, 'Пріоритет', 'Prioriteit')} onChange={(e) => setPrioriteit(e.target.value as typeof prioriteit)}>{PRIORITEITEN.map((p) => <option key={p} value={p}>{p}</option>)}</select>
            <input value={externId} maxLength={24} placeholder={tr(lang, 'ID (напр. UI-015, не обов’язково)', 'ID (bv. UI-015, optioneel)')} aria-label='ID' onChange={(e) => setExternId(e.target.value)} />
          </div>
          <label className='afv-veld'><small>{tr(lang, 'Критерії приймання — рядок на критерій: «ID | текст | unit/integration/e2e/production/owner» (можна лише текст)', 'Acceptatiecriteria — één regel per criterium: «ID | tekst | unit/integration/e2e/production/owner» (alleen tekst mag ook)')}</small>
            <textarea value={criteria} rows={4} data-afv-criteria-invoer='' onChange={(e) => setCriteria(e.target.value)} />
          </label>
          <button type='submit' className='afv-knop is-hoofd' data-afv-tv-maak='' disabled={besig || !titel.trim()}>{tr(lang, 'Створити чернетку', 'Concept aanmaken')}</button>
        </form>
      ) : null}

      {tv === 'bestand' ? (
        <div className='afv-vorm'>
          <div className='afv-dropvlak' data-afv-import-invoer=''
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); leesBestand(e.dataTransfer.files?.[0]); }}>
            <p>{tr(lang, 'Перетягніть файл .json, .md або .txt — або', 'Sleep een .json-, .md- of .txt-bestand hierheen — of')}</p>
            <button type='button' className='afv-knop' onClick={() => kies.current?.click()}>{tr(lang, 'Оберіть файл', 'Kies een bestand')}</button>
            <input ref={kies} type='file' accept='.json,.md,.txt' className='afv-verborgen' tabIndex={-1} aria-hidden='true' onChange={(e) => leesBestand(e.target.files?.[0])} />
            <small className='afv-hint'>{tr(lang, 'PDF/зображення — заплановано (окремий безпечний розбір). Файл ніколи не виконується як код.', 'PDF/beeld is gepland (aparte veilige parser). Een bestand wordt nooit als code uitgevoerd.')}</small>
          </div>
          {ruw ? (
            <label className='afv-veld'><small>{tr(lang, `Сирий текст (${bestandNaam}) — зберігається, навіть якщо розбір не вдався`, `Ruwe tekst (${bestandNaam}) — blijft staan, ook als de analyse mislukt`)}</small>
              <textarea value={ruw} rows={5} data-afv-import-ruw='' onChange={(e) => setRuw(e.target.value)} />
              <button type='button' className='afv-knop is-klein' disabled={besig || !bestandNaam} onClick={() => { const f = bronFormaat(bestandNaam); if (f) void maakVoorbeeld(bestandNaam, f, ruw); }}>{tr(lang, 'Розібрати ще раз', 'Opnieuw analyseren')}</button>
            </label>
          ) : null}
          {voorbeeld ? (
            <section className='afv-blok' data-afv-import-voorbeeld=''>
              <h3>{tr(lang, 'Попередній перегляд — нічого ще не збережено', 'Voorbeeld — er is nog niets opgeslagen')}</h3>
              <table className='afv-diff-tabel'>
                <tbody>
                  <tr><td>{tr(lang, 'Назва', 'Titel')}</td><td>{afstemmingTekst(voorbeeld.kaart.titel, lang)}</td></tr>
                  <tr><td>{tr(lang, 'Суть', 'Kern')}</td><td>{afstemmingTekst(voorbeeld.kaart.samenvatting, lang)}</td></tr>
                  <tr><td>ID</td><td><code>{voorbeeld.kaart.externId || tr(lang, 'буде призначено', 'wordt toegekend')}</code></td></tr>
                  <tr><td>{tr(lang, 'Сервіс/категорія', 'Dienst/categorie')}</td><td>{voorbeeld.kaart.dienst} · {voorbeeld.kaart.categorie} · {voorbeeld.kaart.prioriteit}</td></tr>
                  <tr><td>{tr(lang, 'Критерії', 'Criteria')}</td><td>{voorbeeld.kaart.criteria.length}</td></tr>
                </tbody>
              </table>
              {voorbeeld.onzeker.length ? <p className='afv-melding is-info' data-afv-import-onzeker=''>{tr(lang, 'Непевні поля (перевірте перед збереженням): ', 'Onzekere velden (controleer vóór het bewaren): ')}{voorbeeld.onzeker.join(', ')}</p> : null}
              {voorbeeld.waarschuwingen.length ? <p className='afv-melding is-info'>{voorbeeld.waarschuwingen.join(' · ')}</p> : null}
              {voorbeeld.vergelijkbaar.length ? (
                <div className='afv-melding is-info' data-afv-import-vergelijkbaar=''>
                  <span>{tr(lang, 'Схожі картки вже існують:', 'Vergelijkbare kaarten bestaan al:')}</span>
                  {voorbeeld.vergelijkbaar.map((v) => <button key={v.kaartId} type='button' className='afv-knop is-klein' onClick={() => { onSluit(); openKaart(v.kaartId); }}>{v.externId} · {afstemmingTekst(v.titel, lang)}</button>)}
                </div>
              ) : null}
              {voorbeeld.bestaand ? (
                <div className='afv-melding is-ok' data-afv-import-bestaand=''>
                  <span>{tr(lang, `Ця ідея вже є: ${voorbeeld.bestaand.externId}. Повторний імпорт не створює дубля.`, `Dit idee bestaat al: ${voorbeeld.bestaand.externId}. Opnieuw importeren maakt geen duplicaat.`)}</span>
                  <button type='button' className='afv-knop is-klein' onClick={() => { onSluit(); openKaart(voorbeeld.bestaand!.kaartId); }}>{tr(lang, 'Відкрити наявну', 'Bestaande openen')}</button>
                </div>
              ) : (
                <button type='button' className='afv-knop is-hoofd' data-afv-import-opslaan='' disabled={besig} onClick={legVast}>{tr(lang, 'Зберегти картку', 'Kaart bewaren')}</button>
              )}
            </section>
          ) : null}
        </div>
      ) : null}

      {tv === 'agent' ? (
        <div className='afv-vorm' data-afv-agent-uitleg=''>
          <p>{tr(lang,
            'Агент (через підключення ШІ до сайту) додає пропозиції тим самим API, що й ця форма: POST /api/owner/afstemming/voorstel із bron:"agent" та ключем ідемпотентності; докази — через /bewijs. Квитанція з ID картки лягає в незмінну історію.',
            'Een agent (via de AI-koppeling van de site) dient voorstellen in met dezelfde API als dit formulier: POST /api/owner/afstemming/voorstel met bron:"agent" en een idempotentiesleutel; bewijs via /bewijs. De kwitantie met het kaart-ID komt in de onveranderlijke geschiedenis.')}</p>
          <p className='afv-melding is-info'>{tr(lang,
            'Агент НЕ може: схвалювати власні картки, ставити етапи «погоджено/прийнято», оголошувати production-успіх чи запускати розгортання — сервер відповідає AGENT_MAG_NIET.',
            'Een agent kan NIET: eigen kaarten goedkeuren, de fasen «goedgekeurd/aanvaard» zetten, productiesucces uitroepen of een uitrol starten — de server antwoordt AGENT_MAG_NIET.')}</p>
          <p className='afv-hint'>{tr(lang, 'Окремі MCP-інструменти afstemming.* — заплановано; сьогодні агент користується цим HTTP-API.', 'Aparte MCP-werktuigen afstemming.* zijn gepland; vandaag gebruikt een agent deze HTTP-API.')}</p>
        </div>
      ) : null}
    </Laag>
  );
}
