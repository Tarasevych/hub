// Kartotheek — de doorzoekbare kaartenlijst: filters (dienst/categorie/fase/gezondheid/conflict), sorteren, paginering
// via token, snelle weergaven (aandacht / zonder bewijs / legacy — verfijning op de GELADEN pagina, eerlijk zo benoemd)
// en het kaartdetail als laag. Overdracht vanuit het overzicht loopt via sessionStorage 'afv-filter' (lees-en-wis).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Filter } from 'lucide-react';
import { GEZONDHEID_LABEL, LEVENSFASEN, LEVENSFASE_LABEL, afstemmingTekst, type Gezondheid, type Kaart, type Levensfase } from '../../../shared/afstemming-model';
import { afstemmingClient, type KaartDetail as KaartDetailUit, type KaartenVraag } from '../afstemming-client';
import type { OnderdeelProps } from '../AfstemmingPagina';
import KaartDetail from '../KaartDetail';
import KaartKaartje from '../KaartKaartje';
import { afstemmingFoutTekst, isBouwFout, sessieNeem } from '../hulp';
import { tr } from '../tekst';

const GEZONDHEDEN = Object.keys(GEZONDHEID_LABEL) as Gezondheid[];
type Snel = '' | 'aandacht' | 'zonder-bewijs' | 'legacy';

export default function Kartotheek(props: OnderdeelProps) {
  const { lang, smal, toon, openKaartId, zoek } = props;
  // De overdracht uit het overzicht (sessionStorage 'afv-filter', lees-en-wis) wordt ÉÉN keer gelezen en voedt zowel de
  // servervraag als de snelle weergave.
  const start = useRef<{ v: KaartenVraag; s: Snel } | null>(null);
  if (start.current === null) {
    const basis: KaartenVraag = { zoek: zoek.trim().length >= 2 ? zoek.trim() : '', sorteer: 'bijgewerkt', oplopend: false };
    let s: Snel = '';
    try {
      const over = sessieNeem('afv-filter');
      if (over) {
        const j = JSON.parse(over) as Record<string, string>;
        if (j.conflict) basis.conflict = true; if (j.dienst) basis.dienst = j.dienst; if (j.fase) basis.fase = j.fase;
        if (j.snel === 'aandacht' || j.snel === 'zonder-bewijs' || j.snel === 'legacy') s = j.snel;
      }
    } catch { /* kapotte overdracht = gewoon alles */ }
    start.current = { v: basis, s };
  }
  const [vraag, setVraag] = useState<KaartenVraag>(start.current.v);
  const [snel, setSnel] = useState<Snel>(start.current.s);
  const [kaarten, setKaarten] = useState<Kaart[]>([]);
  const [totaal, setTotaal] = useState<number | null>(null);
  const [volgende, setVolgende] = useState<string | null>(null);
  const [diensten, setDiensten] = useState<string[]>([]);
  const [categorieen, setCategorieen] = useState<string[]>([]);
  const [bouw, setBouw] = useState(false);
  const [fout, setFout] = useState('');
  const [zoekVeld, setZoekVeld] = useState(vraag.zoek || '');
  const [detail, setDetail] = useState<KaartDetailUit | null>(null);
  const geopend = useRef('');

  const laad = useCallback(async (token?: string) => {
    try {
      const uit = await afstemmingClient.kaarten({ ...vraag, ...(token ? { token } : {}) });
      setKaarten((was) => (token ? [...was, ...uit.kaarten] : uit.kaarten));
      setTotaal(uit.totaal); setVolgende(uit.volgende);
      setDiensten(uit.diensten); setCategorieen(uit.categorieen);
      setBouw(false); setFout('');
    } catch (e) { if (isBouwFout(e)) setBouw(true); else setFout(afstemmingFoutTekst(lang, e)); }
  }, [vraag, lang]);
  useEffect(() => { void laad(); }, [laad]);

  const openDetail = useCallback(async (id: string) => {
    try { setDetail(await afstemmingClient.kaart(id)); }
    catch (e) { toon(afstemmingFoutTekst(lang, e)); }
  }, [lang, toon]);
  const herlaad = useCallback(async () => {
    if (detail) { try { setDetail(await afstemmingClient.kaart(detail.kaart.id)); } catch { /* de lijst hieronder vertelt het */ } }
    await laad();
  }, [detail, laad]);
  useEffect(() => { if (openKaartId && openKaartId !== geopend.current) { geopend.current = openKaartId; void openDetail(openKaartId); } }, [openKaartId, openDetail]);

  // Snelle weergaven: verfijning op wat geladen is — eerlijk benoemd in het etiket, geen tweede zoekmachine.
  const zichtbaar = kaarten.filter((k) => snel === '' ? true
    : snel === 'aandacht' ? (k.openConflicten > 0 || k.gezondheid === 'regressed' || k.gezondheid === 'blocked' || k.levensfase === 'needs_review')
    : snel === 'zonder-bewijs' ? k.bewijs === 0
    : Boolean(k.legacy));

  const zet = (deel: Partial<KaartenVraag>) => setVraag((v) => ({ ...v, ...deel }));
  return (
    <div className='afv-kartotheek' data-afv-kartotheek=''>
      {bouw ? <p className='afv-melding is-info' role='status' data-afv-bouw=''>{tr(lang, 'Серверна частина картотеки ще збирається.', 'De serverkant van de kartotheek is nog in aanbouw.')}</p> : null}
      {fout ? <p className='afv-melding is-fout' role='alert'>{fout}</p> : null}
      <section className='afv-blok afv-filters' aria-label={tr(lang, 'Фільтри', 'Filters')}>
        <div className='afv-rij'>
          <input value={zoekVeld} data-afv-f-zoek='' placeholder={tr(lang, 'Пошук у картках…', 'Zoeken in kaarten…')} aria-label={tr(lang, 'Пошук', 'Zoeken')}
            onChange={(e) => setZoekVeld(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') zet({ zoek: zoekVeld.trim() }); }} />
          <select value={vraag.dienst || ''} data-afv-f-dienst='' aria-label={tr(lang, 'Сервіс', 'Dienst')} onChange={(e) => zet({ dienst: e.target.value || undefined })}>
            <option value=''>{tr(lang, 'усі сервіси', 'alle diensten')}</option>{diensten.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={vraag.categorie || ''} data-afv-f-categorie='' aria-label={tr(lang, 'Категорія', 'Categorie')} onChange={(e) => zet({ categorie: e.target.value || undefined })}>
            <option value=''>{tr(lang, 'усі категорії', 'alle categorieën')}</option>{categorieen.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={vraag.fase || ''} data-afv-f-fase='' aria-label={tr(lang, 'Етап', 'Fase')} onChange={(e) => zet({ fase: e.target.value || undefined })}>
            <option value=''>{tr(lang, 'усі етапи', 'alle fasen')}</option>{LEVENSFASEN.map((f: Levensfase) => <option key={f} value={f}>{afstemmingTekst(LEVENSFASE_LABEL[f], lang)}</option>)}
          </select>
          <select value={vraag.gezondheid || ''} data-afv-f-gezondheid='' aria-label={tr(lang, 'Стан', 'Gezondheid')} onChange={(e) => zet({ gezondheid: e.target.value || undefined })}>
            <option value=''>{tr(lang, 'будь-який стан', 'elke gezondheid')}</option>{GEZONDHEDEN.map((g) => <option key={g} value={g}>{afstemmingTekst(GEZONDHEID_LABEL[g], lang)}</option>)}
          </select>
          <button type='button' className={`afv-knop is-klein${vraag.conflict ? ' is-actief' : ''}`} data-afv-f-conflict='' aria-pressed={Boolean(vraag.conflict)}
            onClick={() => zet({ conflict: vraag.conflict ? undefined : true })}><Filter aria-hidden='true' />{tr(lang, 'лише конфлікти', 'alleen conflicten')}</button>
          <select value={`${vraag.sorteer}:${vraag.oplopend ? '1' : '0'}`} data-afv-f-sorteer='' aria-label={tr(lang, 'Сортування', 'Sortering')}
            onChange={(e) => { const [s, o] = e.target.value.split(':'); zet({ sorteer: s as KaartenVraag['sorteer'], oplopend: o === '1' }); }}>
            <option value='bijgewerkt:0'>{tr(lang, 'нові зміни згори', 'jongst gewijzigd eerst')}</option>
            <option value='aangemaakt:0'>{tr(lang, 'нові картки згори', 'jongst aangemaakt eerst')}</option>
            <option value='titel:1'>{tr(lang, 'за назвою', 'op titel')}</option>
            <option value='prioriteit:1'>{tr(lang, 'за пріоритетом', 'op prioriteit')}</option>
          </select>
        </div>
        <div className='afv-rij afv-snelle'>
          {([['', 'Усі', 'Alle'], ['aandacht', 'Потребують уваги', 'Vragen aandacht'], ['zonder-bewijs', 'Без перевірки', 'Zonder bewijs'], ['legacy', 'Legacy-матриця', 'Legacy-matrix']] as Array<[Snel, string, string]>).map(([id, uk, nl]) => (
            <button key={id || 'alle'} type='button' className={`afv-knop is-klein${snel === id ? ' is-actief' : ''}`} data-afv-snel={id || 'alle'} aria-pressed={snel === id} onClick={() => setSnel(id)}>{tr(lang, uk, nl)}</button>
          ))}
          {totaal !== null ? <small className='afv-hint'>{tr(lang, `Разом: ${totaal}; показано ${zichtbaar.length}${snel ? tr(lang, ' (фільтр на завантаженій сторінці)', ' (verfijning op de geladen pagina)') : ''}`, `Totaal: ${totaal}; getoond ${zichtbaar.length}${snel ? ' (verfijning op de geladen pagina)' : ''}`)}</small> : null}
        </div>
      </section>
      {!bouw && totaal === 0 ? (
        <section className='afv-leeg' data-afv-leeg='kartotheek'>
          <p>{tr(lang, 'За цими фільтрами нічого немає. Скиньте фільтри або додайте першу ідею кнопкою вгорі.', 'Niets voor deze filters. Wis de filters of voeg bovenaan het eerste idee toe.')}</p>
          <button type='button' className='afv-knop is-klein' onClick={() => { setZoekVeld(''); setSnel(''); setVraag({ zoek: '', sorteer: 'bijgewerkt', oplopend: false }); }}>{tr(lang, 'Скинути фільтри', 'Filters wissen')}</button>
        </section>
      ) : null}
      <div className='afv-kaartjes' role='list' aria-label={tr(lang, 'Картки', 'Kaarten')}>
        {zichtbaar.map((k) => <KaartKaartje key={k.id} lang={lang} kaart={k} onOpen={(kk) => void openDetail(kk.id)} />)}
      </div>
      {volgende ? <button type='button' className='afv-knop afv-volgende' data-afv-volgende='' onClick={() => void laad(volgende)}>{tr(lang, 'Показати ще', 'Meer tonen')}</button> : null}
      {detail ? <KaartDetail lang={lang} smal={smal} detail={detail} onSluit={() => { setDetail(null); geopend.current = ''; }} herlaad={herlaad} toon={toon} /> : null}
    </div>
  );
}
