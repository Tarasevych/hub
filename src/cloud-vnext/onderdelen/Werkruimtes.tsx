// Робочі простори (Werkruimtes): kaarten uit het overzicht (titel + aantal), «Відкрити» zet het werkruimtefilter
// voor «Мої файли» (sessionStorage 'cvn-ws-filter'), en «Створити» praat RECHTSTREEKS met de bestaande route
// /api/owner/cloud/workspaces/create (geen vNext-route; dezelfde drie regels dienst/tabblad/herkomst als cloud-client).
// Eerlijk: beheren (hernoemen, archiveren, secties) zit in deze release niet hier — dat blijft bij de bestaande stroom.
import { useState } from 'react';
import { FolderOpen, Plus, Users } from 'lucide-react';
import { api, ApiError } from '../../platform/client';
import { ecosystemTabContext } from '../../tab-context';
import { sessieDienst } from '../../canoniek-navigatie';
import type { OnderdeelProps } from '../CloudPagina';
import Laag from '../Laag';
import { sessieZet } from '../hulp';
import { tr } from '../tekst';

// Dezelfde envelop als src/cloud-vnext/cloud-client.ts meegeeft (dat bestand blijft onaangeroerd).
const envelop = (extra: Record<string, unknown> = {}) => ({ service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin, ...extra });
const SJABLONEN = ['project', 'documentation', 'meeting', 'personal'] as const;
const SJABLOON_LABEL: Record<(typeof SJABLONEN)[number], [string, string]> = {
  project: ['Проєкт', 'Project'], documentation: ['Документація', 'Documentatie'], meeting: ['Зустрічі', 'Vergaderingen'], personal: ['Особисте', 'Persoonlijk'],
};

export default function Werkruimtes({ lang, ov, vernieuw, toon, naarTab }: OnderdeelProps) {
  const [maakOpen, setMaakOpen] = useState(false);
  const [titel, setTitel] = useState('');
  const [omschrijving, setOmschrijving] = useState('');
  const [sjabloon, setSjabloon] = useState<(typeof SJABLONEN)[number]>('project');
  const [besig, setBesig] = useState(false);
  const [mis, setMis] = useState('');

  const open = (id: string) => { sessieZet('cvn-ws-filter', id); naarTab('files'); };
  const maak = async () => {
    const naam = titel.trim();
    if (naam.length < 2) { setMis(tr(lang, 'Назва закоротка (від 2 символів).', 'De titel is te kort (vanaf 2 tekens).')); return; }
    setBesig(true); setMis('');
    try {
      await api.post('/api/owner/cloud/workspaces/create', envelop({ title: naam.slice(0, 100), description: omschrijving.trim().slice(0, 500), template: sjabloon }));
      setMaakOpen(false); setTitel(''); setOmschrijving('');
      toon(tr(lang, `Простір «${naam}» створено.`, `Werkruimte «${naam}» aangemaakt.`));
      await vernieuw();
    } catch (e) {
      const code = e instanceof ApiError ? e.message : 'FOUT';
      setMis(code === 'CLOUD_WORKSPACE_ALREADY_EXISTS' ? tr(lang, 'Простір із такою назвою вже є.', 'Een werkruimte met deze titel bestaat al.')
        : code === 'CLOUD_WORKSPACE_LIMIT_REACHED' ? tr(lang, 'Досягнуто ліміт просторів.', 'De grens aan werkruimtes is bereikt.')
        : code === 'CLOUD_WORKSPACE_TITLE_REQUIRED' ? tr(lang, 'Назва закоротка (від 2 символів).', 'De titel is te kort (vanaf 2 tekens).')
        : tr(lang, `Не вдалося (${code}).`, `Mislukt (${code}).`));
    } finally { setBesig(false); }
  };

  return (
    <div className='cvn-werkruimtes' data-cvn-werkruimtes=''>
      <section className='cvn-blok'>
        <h3><Users aria-hidden='true' />{tr(lang, 'Робочі простори', 'Werkruimtes')}
          <button type='button' className='cvn-knop is-klein is-hoofd' data-cvn-ws-nieuw='' onClick={() => setMaakOpen(true)}><Plus aria-hidden='true' />{tr(lang, 'Створити', 'Aanmaken')}</button>
        </h3>
        {!ov ? <p className='cvn-melding is-info' role='status' data-cvn-bouw=''>{tr(lang, 'Серверна частина огляду ще збирається — список просторів з’явиться, щойно сервер буде готовий. Створення вже працює (стара перевірена дорога).', 'De serverkant van het overzicht is nog in aanbouw — de lijst volgt zodra de server klaar is. Aanmaken werkt al (de bestaande, beproefde route).')}</p> : null}
        {ov && !ov.workspaces.length ? (
          <div className='cvn-leeg' data-cvn-leeg='werkruimtes'><p>{tr(lang, 'Просторів ще немає. Простір — це тематична полиця (проєкт, дім, навчання), куди «Швидко зберегти» розкладає знахідки.', 'Nog geen werkruimtes. Een werkruimte is een themaplank (project, huis, studie) waar «Snel opslaan» vondsten op legt.')}</p></div>
        ) : null}
        {ov?.workspaces.length ? (
          <div className='cvn-ws-kaarten' role='list'>
            {ov.workspaces.map((w) => (
              <article key={w.id} className='cvn-ws-kaart' role='listitem' data-cvn-ws={w.id}>
                <strong>{w.titel}</strong>
                <span className='cvn-hint'>{tr(lang, `${w.aantal} файл(ів)`, `${w.aantal} bestand(en)`)}</span>
                <button type='button' className='cvn-knop is-klein' data-cvn-ws-filter={w.id} onClick={() => open(w.id)}><FolderOpen aria-hidden='true' />{tr(lang, 'Відкрити у «Мої файли»', 'Openen in «Mijn bestanden»')}</button>
              </article>
            ))}
          </div>
        ) : null}
        <p className='cvn-hint'>{tr(lang, 'Тут — перегляд, створення і фільтр для «Мої файли». Впорядкування вмісту простору (секції, статуси) — у «Швидкий вхід» і майстрі розкладання.', 'Hier: bekijken, aanmaken en het filter voor «Mijn bestanden». Het ordenen bínnen een werkruimte (secties, statussen) blijft bij «Snelle invoer» en de bestaande hulp.')}</p>
      </section>

      {maakOpen ? (
        <Laag lang={lang} soort='venster' titel={tr(lang, 'Новий простір', 'Nieuwe werkruimte')} onSluit={() => setMaakOpen(false)} data={{ 'cvn-ws-nieuw': 'laag' }}>
          <form className='cvn-laag-vorm' onSubmit={(e) => { e.preventDefault(); void maak(); }}>
            {mis ? <p className='cvn-melding is-fout' role='alert'>{mis}</p> : null}
            <label>{tr(lang, 'Назва', 'Titel')}
              <input value={titel} maxLength={100} data-cvn-eerste='' onChange={(e) => { setTitel(e.target.value); setMis(''); }} placeholder={tr(lang, 'Напр., Ремонт кухні', 'Bv. Keukenrenovatie')} />
            </label>
            <label>{tr(lang, 'Опис (не обов’язково)', 'Omschrijving (niet verplicht)')}
              <input value={omschrijving} maxLength={500} onChange={(e) => setOmschrijving(e.target.value)} />
            </label>
            <label>{tr(lang, 'Шаблон', 'Sjabloon')}
              <select value={sjabloon} onChange={(e) => setSjabloon(e.target.value as (typeof SJABLONEN)[number])}>
                {SJABLONEN.map((s) => <option key={s} value={s}>{tr(lang, SJABLOON_LABEL[s][0], SJABLOON_LABEL[s][1])}</option>)}
              </select>
            </label>
            <div className='cvn-laag-knoppen'>
              <button type='submit' className='cvn-knop is-hoofd' disabled={besig}>{besig ? tr(lang, 'Створення…', 'Aanmaken…') : tr(lang, 'Створити', 'Aanmaken')}</button>
              <button type='button' className='cvn-knop' onClick={() => setMaakOpen(false)}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
            </div>
          </form>
        </Laag>
      ) : null}
    </div>
  );
}
