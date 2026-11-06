// De bewerker: paneel rechts (breed scherm) of het hele scherm (telefoon). Markdown met een werkbalk, voorbeeld, checklist,
// soort/kleur/map/etiketten/vastzetten, klad in deze browser (nooit «opgeslagen» vóór de server het zegt), versiecontrole
// (409 → vergelijken, niet stil overschrijven), geschiedenis met terugzetten. Ctrl/Cmd+S of Ctrl/Cmd+Enter = opslaan, Esc = sluiten.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Bold, Check, CheckSquare, Code2, Eye, EyeOff, Heading2, History, Italic, Link2, List, Pin, Plus, Save, Tag, X } from 'lucide-react';
import {
  KLEUREN, VN_MAX_ETIKETTEN, VN_MAX_INHOUD, VN_MAX_TITEL, lijstVoortgang, naarChecklist, vnSchoonEtiket,
  type Notitie, type NotitieInvoer, type NotitieKleur, type NotitieMap, type NotitieRevisie, type NotitieSoort,
} from '../../shared/notities-vnext-model';
import Laag from './Laag';
import { veiligeHtml } from './NotitieKaart';
import { NotitiesFout, kladBewaren, kladLezen, kladWissen, notitiesClient } from './notities-client';
import { KLEUR_LABEL_VN, SOORT_LABEL, datumTekst, foutTekst, tr, type Lang } from './tekst';

type Props = {
  lang: Lang; smal: boolean; notitie: Notitie | null; mappen: NotitieMap[]; startMap: string | null; startSoort?: NotitieSoort;
  onSluit: () => void; onBewaard: (n: Notitie, nieuw: boolean) => void; onMappen: () => void;
};
type Stand = 'rust' | 'bezig' | 'conflict';
const kladId = (n: Notitie | null) => (n ? n.id : 'nieuw');

export default function NotitieBewerker({ lang, smal, notitie, mappen, startMap, startSoort, onSluit, onBewaard, onMappen }: Props) {
  const [v, setV] = useState<NotitieInvoer>(() => notitie
    ? { titel: notitie.titel, inhoud: notitie.inhoud, soort: notitie.soort, kleur: notitie.kleur, etiketten: notitie.etiketten, mapId: notitie.mapId, vast: notitie.vast }
    : { titel: '', inhoud: '', soort: startSoort ?? 'tekst', kleur: 'geen', etiketten: [], mapId: startMap, vast: false });
  const [versie, setVersie] = useState<number | null>(notitie?.versie ?? null);
  const [stand, setStand] = useState<Stand>('rust');
  const [fout, setFout] = useState('');
  const [huidig, setHuidig] = useState<Notitie | null>(null);
  const [voorbeeld, setVoorbeeld] = useState(false);
  const [nieuwEtiket, setNieuwEtiket] = useState('');
  const [klad, setKlad] = useState(() => { const k = kladLezen(kladId(notitie)); return k && (k.titel !== (notitie?.titel ?? '') || k.inhoud !== (notitie?.inhoud ?? '')) ? k : null; });
  const [geschiedenis, setGeschiedenis] = useState<NotitieRevisie[] | null>(null);
  const [nieuweMap, setNieuweMap] = useState('');
  const [vuil, setVuil] = useState(false);
  const tekst = useRef<HTMLTextAreaElement | null>(null);
  const titelVeld = useRef<HTMLInputElement | null>(null);
  const id = kladId(notitie);

  // Klad: na elke wijziging (met een korte pauze) in deze browser; weg zodra de server bevestigde.
  useEffect(() => {
    if (!vuil) return;
    const t = setTimeout(() => kladBewaren(id, { titel: v.titel, inhoud: v.inhoud }), 600);
    return () => clearTimeout(t);
  }, [v.titel, v.inhoud, vuil, id]);
  const zet = (p: Partial<NotitieInvoer>) => { setV((x) => ({ ...x, ...p })); setVuil(true); };

  const bewaar = useCallback(async (opnieuwVersie?: number | null) => {
    if (stand === 'bezig') return;
    setStand('bezig'); setFout('');
    try {
      let uit: Notitie;
      if (notitie) uit = await notitiesClient.wijzig(notitie.id, opnieuwVersie === undefined ? versie : opnieuwVersie, v);
      else uit = await notitiesClient.nieuw(v);
      kladWissen(id); setVuil(false); setVersie(uit.versie); setHuidig(null); setStand('rust');
      onBewaard(uit, !notitie);
    } catch (e) {
      if (e instanceof NotitiesFout && e.code === 'VERSIE_VEROUDERD') { setHuidig(e.data?.huidig ?? null); setStand('conflict'); return; }
      setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : String((e as Error)?.message || 'FOUT'))); setStand('rust');
    }
  }, [stand, notitie, versie, v, id, lang, onBewaard]);

  const toets = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'Enter')) { e.preventDefault(); void bewaar(); }
  };
  /** Opmaak rond de selectie in het tekstvak; de cursor blijft bruikbaar (geen eigen editor, native undo/redo blijft werken). */
  const omhul = (voor: string, na = voor, regel = false) => {
    const el = tekst.current; if (!el) return;
    const [a, b] = [el.selectionStart, el.selectionEnd];
    const s = v.inhoud;
    let nieuw: string; let cursor: number;
    if (regel) {
      const begin = s.lastIndexOf('\n', a - 1) + 1;
      const lijn = s.slice(begin, s.indexOf('\n', a) === -1 ? s.length : s.indexOf('\n', a));
      const al = lijn.startsWith(voor);
      nieuw = s.slice(0, begin) + (al ? lijn.slice(voor.length) : voor + lijn) + s.slice(begin + lijn.length);
      cursor = a + (al ? -voor.length : voor.length);
    } else {
      const gekozen = s.slice(a, b) || tr(lang, 'текст', 'tekst');
      nieuw = s.slice(0, a) + voor + gekozen + na + s.slice(b);
      cursor = a + voor.length + gekozen.length;
    }
    zet({ inhoud: nieuw });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cursor, cursor); });
  };
  const voegEtiket = () => {
    const s = vnSchoonEtiket(nieuwEtiket);
    if (s && !v.etiketten.includes(s) && v.etiketten.length < VN_MAX_ETIKETTEN) zet({ etiketten: [...v.etiketten, s] });
    setNieuwEtiket('');
  };
  const maakMap = async () => {
    const naam = nieuweMap.trim(); if (!naam) return;
    try { const m = await notitiesClient.mapNieuw(naam, 'geen'); setNieuweMap(''); onMappen(); zet({ mapId: m.id }); }
    catch (e) { setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT')); }
  };
  const laadGeschiedenis = async () => {
    if (!notitie) return;
    try { setGeschiedenis(await notitiesClient.revisies(notitie.id)); } catch (e) { setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT')); }
  };
  const herstelRevisie = async (r: NotitieRevisie) => {
    if (!notitie) return;
    setStand('bezig');
    try { const n = await notitiesClient.revisieHerstel(notitie.id, r.id); setV({ titel: n.titel, inhoud: n.inhoud, soort: n.soort, kleur: n.kleur, etiketten: n.etiketten, mapId: n.mapId, vast: n.vast }); setVersie(n.versie); setGeschiedenis(null); setStand('rust'); onBewaard(n, false); }
    catch (e) { setFout(foutTekst(lang, e instanceof NotitiesFout ? e.code : 'FOUT')); setStand('rust'); }
  };
  const html = useMemo(() => (voorbeeld ? veiligeHtml(v.inhoud) : ''), [voorbeeld, v.inhoud]);
  const voortgang = v.soort === 'lijst' ? lijstVoortgang(v.inhoud) : null;
  const titel = notitie ? tr(lang, 'Редагувати нотатку', 'Notitie bewerken') : tr(lang, 'Нова нотатка', 'Nieuwe notitie');
  const kanBewaren = stand !== 'bezig' && (v.titel.trim().length > 0 || v.inhoud.trim().length > 0);

  return (
    <Laag lang={lang} soort={smal ? 'scherm' : 'paneel'} titel={titel} onSluit={onSluit} data={{ 'vn-bewerker': notitie ? notitie.id : 'nieuw' }}
      kopExtra={<span className={`vn-bewaarstand is-${stand}${vuil ? ' is-vuil' : ''}`} role='status' aria-live='polite'>{stand === 'bezig' ? tr(lang, 'Зберігаю…', 'Opslaan…') : vuil ? tr(lang, 'Не збережено', 'Niet opgeslagen') : notitie ? tr(lang, 'Збережено', 'Opgeslagen') : ''}</span>}>
      <form className='vn-vorm' onSubmit={(e) => { e.preventDefault(); void bewaar(); }} onKeyDown={toets}>
        {klad ? (
          <p className='vn-melding is-info' data-vn-klad='1'>
            <AlertCircle aria-hidden='true' />{tr(lang, `Є незбережена чернетка (${datumTekst(lang, klad.op)}).`, `Er is een niet-opgeslagen klad (${datumTekst(lang, klad.op)}).`)}
            <button type='button' className='vn-knop is-klein' onClick={() => { zet({ titel: klad.titel, inhoud: klad.inhoud }); setKlad(null); }}>{tr(lang, 'Відновити', 'Terughalen')}</button>
            <button type='button' className='vn-knop is-klein is-stil' onClick={() => { kladWissen(id); setKlad(null); }}>{tr(lang, 'Відкинути', 'Weggooien')}</button>
          </p>
        ) : null}
        {stand === 'conflict' && huidig ? (
          <div className='vn-melding is-waarschuwing' role='alert' data-vn-conflict='1'>
            <p><AlertCircle aria-hidden='true' />{tr(lang, `Нотатку тим часом змінено (версія ${huidig.versie}, ${datumTekst(lang, huidig.gewijzigdOp)}). Що зробити?`, `De notitie is intussen gewijzigd (versie ${huidig.versie}, ${datumTekst(lang, huidig.gewijzigdOp)}). Wat wilt u doen?`)}</p>
            <details><summary>{tr(lang, 'Показати ту версію', 'Die versie tonen')}</summary><pre className='vn-code'>{huidig.titel}{'\n\n'}{huidig.inhoud.slice(0, 4000)}</pre></details>
            <div className='vn-knoppen'>
              <button type='button' className='vn-knop' onClick={() => void bewaar(huidig.versie)}>{tr(lang, 'Зберегти мою версію поверх', 'Mijn versie eroverheen bewaren')}</button>
              <button type='button' className='vn-knop is-stil' onClick={() => { setV({ titel: huidig.titel, inhoud: huidig.inhoud, soort: huidig.soort, kleur: huidig.kleur, etiketten: huidig.etiketten, mapId: huidig.mapId, vast: huidig.vast }); setVersie(huidig.versie); setHuidig(null); setStand('rust'); setVuil(false); titelVeld.current?.focus(); }}>{tr(lang, 'Взяти ту версію', 'Die versie overnemen')}</button>
            </div>
          </div>
        ) : null}
        {fout ? <p className='vn-melding is-fout' role='alert'><AlertCircle aria-hidden='true' />{fout}</p> : null}

        <label className='vn-veld'>
          <span>{tr(lang, 'Назва', 'Titel')}</span>
          <input ref={titelVeld} data-vn-eerste value={v.titel} maxLength={VN_MAX_TITEL} placeholder={tr(lang, 'Назва нотатки…', 'Titel van de notitie…')} onChange={(e) => zet({ titel: e.target.value })} />
        </label>

        <div className='vn-vorm-rij'>
          <fieldset className='vn-soorten'>
            <legend>{tr(lang, 'Тип', 'Soort')}</legend>
            {(['tekst', 'lijst', 'code', 'koppeling'] as NotitieSoort[]).map((s) => (
              <label key={s} className={v.soort === s ? 'is-actief' : ''} data-vn-soortkeuze={s}>
                <input type='radio' name='vn-soort' value={s} checked={v.soort === s} onChange={() => zet({ soort: s, inhoud: s === 'lijst' && v.inhoud && !/\[[ xX]\]/.test(v.inhoud) ? naarChecklist(v.inhoud) : v.inhoud })} />
                {tr(lang, SOORT_LABEL[s][0], SOORT_LABEL[s][1])}
              </label>
            ))}
          </fieldset>
          <fieldset className='vn-kleuren'>
            <legend>{tr(lang, 'Колір', 'Kleur')}</legend>
            {KLEUREN.map((k) => (
              <label key={k} className={`vn-kleurstip kleur-${k}${v.kleur === k ? ' is-actief' : ''}`} title={tr(lang, KLEUR_LABEL_VN[k][0], KLEUR_LABEL_VN[k][1])}>
                <input type='radio' name='vn-kleur' value={k} checked={v.kleur === k} onChange={() => zet({ kleur: k as NotitieKleur })} aria-label={tr(lang, KLEUR_LABEL_VN[k][0], KLEUR_LABEL_VN[k][1])} />
                {v.kleur === k ? <Check aria-hidden='true' /> : null}
              </label>
            ))}
          </fieldset>
        </div>

        <div className='vn-werkbalk' role='toolbar' aria-label={tr(lang, 'Форматування', 'Opmaak')}>
          <button type='button' className='vn-icoonknop' onClick={() => omhul('**')} title={tr(lang, 'Жирний', 'Vet')} aria-label={tr(lang, 'Жирний', 'Vet')}><Bold /></button>
          <button type='button' className='vn-icoonknop' onClick={() => omhul('*')} title={tr(lang, 'Курсив', 'Cursief')} aria-label={tr(lang, 'Курсив', 'Cursief')}><Italic /></button>
          <button type='button' className='vn-icoonknop' onClick={() => omhul('## ', '', true)} title={tr(lang, 'Заголовок', 'Kop')} aria-label={tr(lang, 'Заголовок', 'Kop')}><Heading2 /></button>
          <button type='button' className='vn-icoonknop' onClick={() => omhul('- ', '', true)} title={tr(lang, 'Список', 'Lijst')} aria-label={tr(lang, 'Список', 'Lijst')}><List /></button>
          <button type='button' className='vn-icoonknop' onClick={() => omhul('- [ ] ', '', true)} title={tr(lang, 'Пункт чеклісту', 'Checklistpunt')} aria-label={tr(lang, 'Пункт чеклісту', 'Checklistpunt')}><CheckSquare /></button>
          <button type='button' className='vn-icoonknop' onClick={() => omhul('`')} title={tr(lang, 'Код', 'Code')} aria-label={tr(lang, 'Код', 'Code')}><Code2 /></button>
          <button type='button' className='vn-icoonknop' onClick={() => omhul('[', '](https://)')} title={tr(lang, 'Посилання', 'Koppeling')} aria-label={tr(lang, 'Посилання', 'Koppeling')}><Link2 /></button>
          <span className='vn-werkbalk-rek' />
          <button type='button' className={`vn-knop is-klein${voorbeeld ? ' is-actief' : ''}`} aria-pressed={voorbeeld} onClick={() => setVoorbeeld((x) => !x)} data-vn-voorbeeld={voorbeeld ? '1' : '0'}>{voorbeeld ? <EyeOff aria-hidden='true' /> : <Eye aria-hidden='true' />}{tr(lang, 'Перегляд', 'Voorbeeld')}</button>
        </div>

        {voorbeeld
          ? <div className='vn-voorbeeld vn-md' data-vn-voorbeeldvak='1' dangerouslySetInnerHTML={{ __html: html || `<p><em>${tr(lang, 'Порожньо', 'Leeg')}</em></p>` }} />
          : (
            <label className='vn-veld vn-veld-tekst'>
              <span className='vn-verborgen'>{tr(lang, 'Текст', 'Tekst')}</span>
              <textarea ref={tekst} className={v.soort === 'code' ? 'is-code' : ''} value={v.inhoud} maxLength={VN_MAX_INHOUD} spellCheck={v.soort !== 'code'}
                placeholder={v.soort === 'lijst' ? tr(lang, '- [ ] перший пункт', '- [ ] eerste punt') : v.soort === 'code' ? tr(lang, 'Код…', 'Code…') : v.soort === 'koppeling' ? tr(lang, 'https://… і примітка', 'https://… en een opmerking') : tr(lang, 'Пишіть у Markdown: # заголовок, **жирний**, - [ ] пункт…', 'Schrijf in Markdown: # kop, **vet**, - [ ] punt…')}
                onChange={(e) => zet({ inhoud: e.target.value })} />
            </label>
          )}
        {voortgang && voortgang.totaal ? <small className='vn-hint'>{voortgang.af}/{voortgang.totaal} {tr(lang, 'виконано', 'gedaan')}</small> : null}
        {v.soort === 'koppeling' && v.inhoud.trim() && !/https:\/\//.test(v.inhoud) ? <p className='vn-melding is-waarschuwing'><AlertCircle aria-hidden='true' />{tr(lang, 'У тексті немає посилання https://…', 'In de tekst staat geen https://-koppeling.')}</p> : null}

        <div className='vn-vorm-rij'>
          <label className='vn-veld'>
            <span>{tr(lang, 'Тека', 'Map')}</span>
            <select value={v.mapId ?? ''} onChange={(e) => zet({ mapId: e.target.value || null })}>
              <option value=''>{tr(lang, '— без теки —', '— geen map —')}</option>
              {mappen.map((m) => <option key={m.id} value={m.id}>{m.naam}</option>)}
            </select>
          </label>
          <div className='vn-veld vn-nieuwe-map'>
            <span>{tr(lang, 'Нова тека', 'Nieuwe map')}</span>
            <span className='vn-rij'>
              <input value={nieuweMap} maxLength={80} placeholder={tr(lang, 'назва…', 'naam…')} onChange={(e) => setNieuweMap(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void maakMap(); } }} aria-label={tr(lang, 'Назва нової теки', 'Naam van de nieuwe map')} />
              <button type='button' className='vn-knop is-klein' disabled={!nieuweMap.trim()} onClick={() => void maakMap()}><Plus aria-hidden='true' />{tr(lang, 'Створити', 'Maken')}</button>
            </span>
          </div>
        </div>

        <div className='vn-etiketten-vorm'>
          <span className='vn-etiketten-kop'><Tag aria-hidden='true' />{tr(lang, 'Теги', 'Etiketten')} <small>{v.etiketten.length}/{VN_MAX_ETIKETTEN}</small></span>
          {v.etiketten.map((e) => (
            <span key={e} className='vn-etiket'>#{e}<button type='button' aria-label={tr(lang, `Прибрати тег ${e}`, `Etiket ${e} verwijderen`)} onClick={() => zet({ etiketten: v.etiketten.filter((x) => x !== e) })}><X aria-hidden='true' /></button></span>
          ))}
          {v.etiketten.length < VN_MAX_ETIKETTEN ? (
            <span className='vn-rij'>
              <input value={nieuwEtiket} maxLength={40} placeholder={tr(lang, 'новий тег', 'nieuw etiket')} aria-label={tr(lang, 'Новий тег', 'Nieuw etiket')} onChange={(e) => setNieuwEtiket(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); voegEtiket(); } }} onBlur={() => { if (nieuwEtiket.trim()) voegEtiket(); }} />
              <button type='button' className='vn-knop is-klein' disabled={!vnSchoonEtiket(nieuwEtiket)} onClick={voegEtiket}><Plus aria-hidden='true' />{tr(lang, 'Додати', 'Toevoegen')}</button>
            </span>
          ) : null}
        </div>

        <label className='vn-schakel'><input type='checkbox' checked={v.vast} onChange={(e) => zet({ vast: e.target.checked })} /><Pin aria-hidden='true' />{tr(lang, 'Закріпити зверху', 'Bovenaan vastzetten')}</label>

        {notitie ? (
          <details className='vn-geschiedenis' onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && !geschiedenis) void laadGeschiedenis(); }}>
            <summary><History aria-hidden='true' />{tr(lang, 'Історія змін', 'Geschiedenis')} <small>v{versie}</small></summary>
            {geschiedenis === null ? <p className='vn-hint'>{tr(lang, 'Завантаження…', 'Laden…')}</p>
              : !geschiedenis.length ? <p className='vn-hint'>{tr(lang, 'Попередніх версій ще немає.', 'Nog geen eerdere versies.')}</p>
                : <ul className='vn-revisies'>{geschiedenis.map((r) => (
                  <li key={r.id}><span>v{r.versie} · {datumTekst(lang, r.aangemaaktOp, false)} · {r.reden}</span><em>{r.titel}</em>
                    <button type='button' className='vn-knop is-klein is-stil' disabled={stand === 'bezig'} onClick={() => void herstelRevisie(r)}>{tr(lang, 'Повернути цю версію', 'Deze versie terugzetten')}</button></li>
                ))}</ul>}
          </details>
        ) : null}

        <div className='vn-laag-voet'>
          <button type='submit' className='vn-knop is-hoofd' disabled={!kanBewaren} data-vn-bewaar='1'><Save aria-hidden='true' />{notitie ? tr(lang, 'Зберегти', 'Opslaan') : tr(lang, 'Створити', 'Aanmaken')}<kbd>Ctrl+S</kbd></button>
          <button type='button' className='vn-knop is-stil' onClick={onSluit}>{tr(lang, 'Закрити', 'Sluiten')}</button>
        </div>
      </form>
    </Laag>
  );
}
