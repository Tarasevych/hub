import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { FASEN, KANALEN, type Klantoverzicht } from '../../shared/klantrelatiebeheer';
import { bewerkingNamen, faseNamen, kanaalNaam, tekst, type Bewerking, type Taal } from './relatietaal';

type Eigenschappen = {
  lang: Taal;
  soort: Bewerking;
  klantId: string;
  overzicht: Klantoverzicht;
  sluit: () => void;
  bewaar: (soort: Bewerking, waarden: Record<string, unknown>) => Promise<void>;
};

export default function Invoervenster({ lang, soort, klantId, overzicht, sluit, bewaar }: Eigenschappen) {
  const venster = useRef<HTMLDialogElement>(null);
  const titelId = useId();
  const [klant, zetKlant] = useState(klantId || overzicht.klanten[0]?.id || '');
  const gekozen = overzicht.klanten.find(rij => rij.id === klantId);
  const [fout, zetFout] = useState('');
  const [bezig, zetBezig] = useState(false);
  const t = (uk: string, nl: string) => tekst(lang, uk, nl);
  useEffect(() => {
    const knoop = venster.current;
    knoop?.showModal();
    return () => knoop?.close();
  }, []);
  async function dienIn(gebeurtenis: FormEvent<HTMLFormElement>) {
    gebeurtenis.preventDefault();
    if (bezig) return;
    const velden = new FormData(gebeurtenis.currentTarget);
    const waarden: Record<string, unknown> = {};
    for (const [naam, waarde] of velden) {
      if (typeof waarde === 'string' && waarde.trim()) waarden[naam] = waarde.trim();
    }
    if (soort === 'wijzig' || soort === 'wissen') {
      if (!gekozen) return;
      waarden.klantId = gekozen.id; waarden.versie = gekozen.versie ?? 1;
    }
    if (soort === 'kans') {
      waarden.centen = Math.round(Number(velden.get('bedrag')) * 100);
      delete waarden.bedrag;
    }
    if (soort === 'contact') waarden.minuten = Number(velden.get('minuten') || 0);
    zetFout('');
    zetBezig(true);
    try {
      await bewaar(soort, waarden);
      sluit();
    } catch (reden) {
      zetFout(reden instanceof Error ? reden.message : t('Не вдалося зберегти запис.', 'Opslaan is mislukt.'));
      zetBezig(false);
    }
  }
  return <dialog ref={venster} className="kr-venster" aria-labelledby={titelId}
    onCancel={e => { e.preventDefault(); if (!bezig) sluit(); }}>
    <form onSubmit={dienIn}>
      <div className="kr-kaderkop"><h2 id={titelId}>{t(...bewerkingNamen[soort])}</h2>
        <button type="button" className="kr-rond" disabled={bezig} onClick={sluit} aria-label={t('Закрити', 'Sluiten')}><X size={18}/></button>
      </div>
      <fieldset disabled={bezig} className="kr-velden">
        {soort === 'wissen' ? <p>{t('Видалити всі записи, угоди та завдання для', 'Alle contacten, verkoopkansen en taken wissen voor')} <strong>{gekozen?.naam}</strong>?</p> : soort === 'klant' || soort === 'wijzig' ? <>
          <label>{t('Ім’я або назва', 'Naam')}<input name="naam" defaultValue={soort === 'wijzig' ? gekozen?.naam : ''} autoFocus required maxLength={180} autoComplete="name"/></label>
          <label>{t('Організація', 'Organisatie')}<input name="organisatie" defaultValue={soort === 'wijzig' ? gekozen?.organisatie : ''} maxLength={200} autoComplete="organization"/></label>
          <label>{t('Електронна адреса', 'E-mailadres')}<input name="mail" defaultValue={soort === 'wijzig' ? gekozen?.mail : ''} type="email" maxLength={254} autoComplete="email"/></label>
          <label>{t('Телефон', 'Telefoonnummer')}<input name="telefoon" defaultValue={soort === 'wijzig' ? gekozen?.telefoon : ''} type="tel" maxLength={80} autoComplete="tel"/></label>
        </> : <>
          <label>{t('Клієнт', 'Klant')}<select name="klantId" value={klant} required onChange={e => zetKlant(e.target.value)}>
            {overzicht.klanten.map(k => <option value={k.id} key={k.id}>{k.naam}{k.organisatie ? ' · ' + k.organisatie : ''}</option>)}
          </select></label>
          {soort !== 'kans' && <label>{t('Угода', 'Verkoopkans')}<select key={klant} name="kansId">
            <option value="">{t('Без прив’язки до угоди', 'Geen specifieke verkoopkans')}</option>
            {overzicht.kansen.filter(k => k.klantId === klant).map(k => <option key={k.id} value={k.id}>{k.titel}</option>)}
          </select></label>}
          {soort !== 'contact' && <label>{t('Назва', 'Titel')}<input autoFocus name="titel" maxLength={160} required/></label>}
          {soort === 'kans' && <>
            <label>{t('Сума в євро', 'Bedrag in euro')}<input type="number" inputMode="decimal" name="bedrag" min="0" max="999999999" step="0.01" required/></label>
            <label>{t('Етап', 'Fase')}<select name="fase">{FASEN.map(f => <option value={f} key={f}>{t(...faseNamen[f])}</option>)}</select></label>
          </>}
          {soort === 'taak' && <label>{t('Термін виконання', 'Vervaldatum')}<input type="date" name="datum"/></label>}
          {soort === 'contact' && <>
            <label>{t('Джерело', 'Kanaal')}<select name="kanaal" defaultValue="notitie">{KANALEN.map(k => <option key={k} value={k}>{kanaalNaam(lang, k)}</option>)}</select></label>
            <label>{t('Напрямок', 'Richting')}<select name="richting" defaultValue="intern"><option value="intern">{t('Внутрішній запис', 'Intern')}</option><option value="in">{t('Вхідне звернення', 'Inkomend')}</option><option value="uit">{t('Вихідне звернення', 'Uitgaand')}</option></select></label>
            <label>{t('Зміст', 'Inhoud')}<textarea name="tekst" rows={4} maxLength={2000} required/></label>
            <label>{t('Витрачений час у хвилинах', 'Bestede tijd in minuten')}<input type="number" name="minuten" min="0" max="1440" step="1"/></label>
          </>}
        </>}
      </fieldset>
      {fout && <p className="kr-fout" role="alert">{fout}</p>}
      <footer><button type="button" className="kr-knop" disabled={bezig} onClick={sluit}>{t('Скасувати', 'Annuleren')}</button>
        <button className="kr-knop kr-hoofd" type="submit" disabled={bezig}>{bezig ? t('Збереження…', 'Bezig met opslaan…') : soort === 'wissen' ? t('Видалити досьє', 'Dossier wissen') : t('Зберегти', 'Opslaan')}</button></footer>
    </form>
  </dialog>;
}
