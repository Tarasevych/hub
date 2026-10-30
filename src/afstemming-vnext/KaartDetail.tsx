// Kaartdetail — de minispecificatie uit het dossier (§4): kop met de twee assen, zeven bladen (wat/criteria/relaties/bewijs/
// releases/historie/acties). Eerlijkheidsregels die hier afgedwongen worden aan de UI-kant (de server dwingt ze óók af):
//   • «passed» kan alleen met een gekozen bewijsstuk — de knop is anders uitgeschakeld, met de reden ernaast;
//   • fasen uit FASE_MENS_VERPLICHT heten expliciet «рішення власника»;
//   • een 409 (VERSIE_CONFLICT) wist NOOIT het formulier: de verse versie wordt getoond en de mens kiest zelf;
//   • voortgang is telbaar (AC n/m), nooit een verzonnen percentage.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitCompareArrows, RefreshCw } from 'lucide-react';
import {
  AFSTEMMING_LIMIETEN, GEZONDHEID_LABEL, KOPPEL_LABEL, KOPPEL_SOORTEN, LEVENSFASE_LABEL, afstemmingTekst, voortgangTekst,
  type Gebeurtenis, type Kaart, type KoppelSoort, type Levensfase,
} from '../../shared/afstemming-model';
import { afstemmingClient, AfstemmingFout, type KaartDetail as KaartDetailUit } from './afstemming-client';
import Laag from './Laag';
import { actorTekst, afstemmingFoutTekst, criteriaNaarTekst, criteriaUitTekst, faseVolgende, faseVraagtMens, gebeurtenisTekst, kleineDatum, PRIORITEITEN } from './hulp';
import { foutTekst, tr, type Lang } from './tekst';

type Dtab = 'wat' | 'criteria' | 'relaties' | 'bewijs' | 'releases' | 'historie' | 'acties';
const DTABS: ReadonlyArray<[Dtab, string, string]> = [
  ['wat', 'Що це', 'Wat is dit'], ['criteria', 'Критерії', 'Criteria'], ['relaties', 'Зв’язки', 'Relaties'], ['bewijs', 'Докази', 'Bewijs'],
  ['releases', 'Випуски', 'Releases'], ['historie', 'Історія', 'Geschiedenis'], ['acties', 'Дії', 'Acties'],
];
const BEWIJS_SOORTEN = ['unit', 'integration', 'e2e', 'screenshot', 'owner_review', 'production_probe', 'ci', 'bron'] as const;
const OMGEVINGEN = ['lokaal', 'ci', 'staging', 'production', 'onbekend'] as const;
const POSTFLIGHT_TEKST: Record<string, [string, string]> = {
  niet_gecontroleerd: ['розгорнуто, не підтверджено', 'uitgerold, niet bevestigd'],
  gecontroleerd: ['перевірено після випуску', 'na de release gecontroleerd'],
  regressie: ['регресія після випуску', 'regressie na de release'],
};

type Props = { lang: Lang; smal: boolean; detail: KaartDetailUit; onSluit: () => void; herlaad: () => Promise<void>; toon: (t: string) => void };

export default function KaartDetail({ lang, smal, detail, onSluit, herlaad, toon }: Props) {
  const { kaart, revisie } = detail;
  const [dtab, setDtab] = useState<Dtab>('wat');
  const [besig, setBesig] = useState(false);
  const [fout, setFout] = useState('');
  const [conflict, setConflict] = useState<Kaart | null>(null);

  const doe = useCallback(async (fn: () => Promise<void>, melding?: string) => {
    setBesig(true); setFout('');
    try { await fn(); if (melding) toon(melding); await herlaad(); }
    catch (e) {
      if (e instanceof AfstemmingFout && e.code === 'VERSIE_CONFLICT') { setConflict(e.huidig || null); setFout(foutTekst(lang, 'VERSIE_CONFLICT')); }
      else setFout(afstemmingFoutTekst(lang, e));
    } finally { setBesig(false); }
  }, [herlaad, lang, toon]);

  // ---- blad «Що це»: eigen notitie (alleen dit veld; een agent herschrijft nooit de hele kaart)
  const [notitieBewerk, setNotitieBewerk] = useState(false);
  const [notitie, setNotitie] = useState(kaart.eigenNotitie || '');
  useEffect(() => { setNotitie(kaart.eigenNotitie || ''); }, [kaart.eigenNotitie]);

  // ---- blad «Критерії»
  const [bewijsKeuze, setBewijsKeuze] = useState<Record<string, string>>({});

  // ---- blad «Зв’язки»
  const [kZoek, setKZoek] = useState('');
  const [kGevonden, setKGevonden] = useState<Kaart | null>(null);
  const [kSoort, setKSoort] = useState<KoppelSoort>('relates_to');
  const [kReden, setKReden] = useState('');
  const [kZeker, setKZeker] = useState(70);

  // ---- blad «Докази»
  const [bVorm, setBVorm] = useState({ soort: 'e2e' as (typeof BEWIJS_SOORTEN)[number], omgeving: 'lokaal' as (typeof OMGEVINGEN)[number], verwijzing: '', resultaat: 'geslaagd' as 'geslaagd' | 'mislukt' | 'onbekend', sha256: '' });

  // ---- blad «Історія» (lui geladen) + diff
  const [events, setEvents] = useState<Gebeurtenis[] | null>(null);
  const [eToken, setEToken] = useState<string | null>(null);
  const [diffA, setDiffA] = useState(''); const [diffB, setDiffB] = useState('');
  const [diff, setDiff] = useState<Array<{ veld: string; a: string; b: string }> | null>(null);
  const laadEvents = useCallback(async (verder?: string) => {
    try { const uit = await afstemmingClient.geschiedenis(kaart.id, verder); setEvents((was) => (verder && was ? [...was, ...uit.gebeurtenissen] : uit.gebeurtenissen)); setEToken(uit.volgende); }
    catch (e) { setFout(afstemmingFoutTekst(lang, e)); }
  }, [kaart.id, lang]);
  useEffect(() => { if (dtab === 'historie' && events === null) void laadEvents(); }, [dtab, events, laadEvents]);
  const revisieOpties = useMemo(() => {
    const uit = new Map<string, string>([[revisie.id, `rev ${revisie.nummer}`]]);
    for (const g of events || []) {
      if (g.soort !== 'revisie') continue;
      const p = g.payload as { revisieId?: unknown; id?: unknown; nummer?: unknown; naar?: unknown; ouderRevisieId?: unknown; ouderNummer?: unknown };
      const id = String(p.revisieId || p.id || '');
      const nr = Number(p.nummer ?? p.naar);
      if (id) uit.set(id, Number.isFinite(nr) ? `rev ${nr}` : id.slice(0, 8));
      const ouder = String(p.ouderRevisieId || '');
      if (ouder) uit.set(ouder, Number.isFinite(Number(p.ouderNummer)) ? `rev ${Number(p.ouderNummer)}` : ouder.slice(0, 8));
      if (!id && !ouder) continue;
    }
    return [...uit.entries()];
  }, [events, revisie.id, revisie.nummer]);

  // ---- blad «Дії»: fase + patchvoorstel
  const volgende = faseVolgende(kaart.levensfase);
  const [fase, setFase] = useState<Levensfase | ''>('');
  const [faseReden, setFaseReden] = useState('');
  const [wijzigOpen, setWijzigOpen] = useState(false);
  const [w, setW] = useState(() => ({
    titelUk: afstemmingTekst(kaart.titel, 'uk'), titelNl: afstemmingTekst(kaart.titel, 'nl'),
    samenvattingUk: afstemmingTekst(kaart.samenvatting, 'uk'), samenvattingNl: afstemmingTekst(kaart.samenvatting, 'nl'),
    bedoeling: revisie.bedoeling || '', verwachtGedrag: revisie.verwachtGedrag || '',
    criteria: criteriaNaarTekst(revisie.criteria, lang), dienst: kaart.dienst, categorie: kaart.categorie, prioriteit: kaart.prioriteit,
  }));

  const stip = (g: string) => <span className='afv-chip' data-afv-gezondheid={g}><i className='afv-stip' aria-hidden='true' />{afstemmingTekst(GEZONDHEID_LABEL[kaart.gezondheid], lang)}</span>;
  const veld = (label: string, inhoud: string) => (
    <div className='afv-veld'><small>{label}</small><p>{inhoud || <span className='afv-hint'>{tr(lang, '— не заповнено —', '— leeg —')}</span>}</p></div>
  );

  return (
    <Laag lang={lang} soort={smal ? 'scherm' : 'paneel'} titel={`${kaart.externId} · ${afstemmingTekst(kaart.titel, lang)}`} onSluit={onSluit} data={{ 'afv-detail': kaart.id }}>
      <div className='afv-detail-kop'>
        <span className='afv-chip'>{afstemmingTekst(LEVENSFASE_LABEL[kaart.levensfase], lang)}</span>
        {stip(kaart.gezondheid)}
        <span className='afv-chip is-stil'>{kaart.prioriteit}</span>
        <span className='afv-chip is-stil'>{kaart.dienst}</span>
        {kaart.legacy ? <span className='afv-chip is-stil'>legacy · {kaart.legacy.claimId}</span> : null}
        <small className='afv-hint'>{voortgangTekst(kaart.criteriaGeslaagd, kaart.criteriaTotaal, lang)} · {tr(lang, 'ревізія', 'revisie')} {kaart.revisieNummer} · v{kaart.versie}</small>
      </div>
      {fout ? <p className='afv-melding is-fout' role='alert'>{fout}</p> : null}
      {conflict ? (
        <div className='afv-melding is-info' data-afv-conflict={conflict.versie} role='status'>
          <span>{tr(lang, `Свіжа версія: v${conflict.versie}, «${afstemmingTekst(conflict.titel, lang)}». Ваші поля в формі збережені.`, `Verse versie: v${conflict.versie}, «${afstemmingTekst(conflict.titel, lang)}». Uw formuliervelden staan er nog.`)}</span>
          <button type='button' className='afv-knop is-klein' data-afv-vervang='' onClick={() => { setConflict(null); setFout(''); void herlaad(); }}><RefreshCw aria-hidden='true' />{tr(lang, 'Оновити до свіжої', 'Naar de verse versie')}</button>
        </div>
      ) : null}
      <nav className='afv-dtabs' role='tablist' aria-label={tr(lang, 'Вкладки картки', 'Kaartbladen')}>
        {DTABS.map(([id, uk, nl]) => <button key={id} type='button' role='tab' aria-selected={dtab === id} className={dtab === id ? 'is-actief' : ''} data-afv-dtab={id} onClick={() => setDtab(id)}>{tr(lang, uk, nl)}</button>)}
      </nav>

      {dtab === 'wat' ? (
        <div className='afv-dblad'>
          {veld(tr(lang, 'Суть', 'Kern'), afstemmingTekst(kaart.samenvatting, lang))}
          {veld(tr(lang, 'Задум (слова людини, зберігаються як є)', 'Bedoeling (woorden van de mens, bewaard zoals ze zijn)'), revisie.bedoeling)}
          {veld(tr(lang, 'Очікувана поведінка', 'Verwacht gedrag'), revisie.verwachtGedrag)}
          <div className='afv-veld'>
            <small>{tr(lang, 'Моя нотатка (агент її не переписує)', 'Mijn notitie (een agent herschrijft die niet)')}</small>
            {notitieBewerk ? (
              <>
                <textarea value={notitie} rows={4} maxLength={AFSTEMMING_LIMIETEN.tekstMax} data-afv-notitie='' onChange={(e) => setNotitie(e.target.value)} />
                <div className='afv-rij'>
                  <button type='button' className='afv-knop is-klein is-hoofd' disabled={besig} onClick={() => void doe(async () => { await afstemmingClient.wijzig(kaart.id, kaart.versie, { eigenNotitie: notitie }); setNotitieBewerk(false); }, tr(lang, 'Нотатку збережено.', 'Notitie bewaard.'))}>{tr(lang, 'Зберегти', 'Bewaren')}</button>
                  <button type='button' className='afv-knop is-klein' onClick={() => { setNotitie(kaart.eigenNotitie || ''); setNotitieBewerk(false); }}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
                </div>
              </>
            ) : (
              <>
                <p>{kaart.eigenNotitie || <span className='afv-hint'>{tr(lang, 'Поки порожньо.', 'Nog leeg.')}</span>}</p>
                <button type='button' className='afv-knop is-klein' onClick={() => setNotitieBewerk(true)}>{tr(lang, 'Змінити нотатку', 'Notitie wijzigen')}</button>
              </>
            )}
          </div>
          {veld(tr(lang, 'Походження', 'Herkomst'), `${kaart.bronSoort} · ${kaart.provenance}`)}
          {kaart.legacy ? veld(tr(lang, 'Legacy-доказовість (не підвищена при перенесенні)', 'Legacy-bewijslaag (niet verhoogd bij de migratie)'), `${kaart.legacy.classificatie} · ${kaart.legacy.bewijslaag.join(', ')}`) : null}
        </div>
      ) : null}

      {dtab === 'criteria' ? (
        <div className='afv-dblad' data-afv-criteria=''>
          {!revisie.criteria.length ? <p className='afv-hint'>{tr(lang, 'Критеріїв ще немає — додайте через «Дії → Запропонувати правку».', 'Nog geen criteria — voeg ze toe via «Acties → Wijziging voorstellen».')}</p> : null}
          {revisie.criteria.map((c) => (
            <div key={c.id} className='afv-criterium' data-afv-criterium={c.id}>
              <div className='afv-criterium-kop'>
                <code>{c.id}</code>
                <span className='afv-chip is-stil'>{c.verificatie}</span>
                <span className={`afv-chip${c.stand === 'passed' ? ' is-ok' : c.stand === 'failed' ? ' is-conflict' : ''}`} data-afv-criterium-stand={c.stand}>
                  {c.stand === 'passed' ? tr(lang, 'пройдено', 'geslaagd') : c.stand === 'failed' ? tr(lang, 'провалено', 'mislukt') : c.stand === 'stale' ? tr(lang, 'застаріла перевірка', 'verouderde controle') : tr(lang, 'не перевірено', 'niet getest')}
                </span>
              </div>
              <p>{afstemmingTekst(c.tekst as { uk: string; nl?: string }, lang)}</p>
              <div className='afv-rij'>
                <select value={bewijsKeuze[c.id] || ''} data-afv-bewijs-keuze={c.id} aria-label={tr(lang, 'Доказ для цього критерію', 'Bewijs voor dit criterium')} onChange={(e) => setBewijsKeuze((was) => ({ ...was, [c.id]: e.target.value }))}>
                  <option value=''>{tr(lang, '— оберіть доказ —', '— kies een bewijsstuk —')}</option>
                  {detail.bewijs.map((b) => <option key={b.id} value={b.id}>{b.soort} · {b.omgeving} · {b.resultaat} · {b.verwijzing.slice(0, 60)}</option>)}
                </select>
                <button type='button' className='afv-knop is-klein is-hoofd' data-afv-criterium-passed={c.id} disabled={besig || !bewijsKeuze[c.id]}
                  title={!bewijsKeuze[c.id] ? tr(lang, 'Без доказу «пройдено» не ставиться', 'Zonder bewijsstuk kan «geslaagd» niet') : undefined}
                  onClick={() => void doe(async () => { await afstemmingClient.criterium(kaart.id, kaart.versie, c.id, 'passed', bewijsKeuze[c.id]); }, tr(lang, 'Критерій позначено пройденим.', 'Criterium op geslaagd gezet.'))}>{tr(lang, 'Пройдено', 'Geslaagd')}</button>
                <button type='button' className='afv-knop is-klein' data-afv-criterium-failed={c.id} disabled={besig}
                  onClick={() => void doe(async () => { await afstemmingClient.criterium(kaart.id, kaart.versie, c.id, 'failed'); }, tr(lang, 'Критерій позначено проваленим.', 'Criterium op mislukt gezet.'))}>{tr(lang, 'Провалено', 'Mislukt')}</button>
              </div>
              {!bewijsKeuze[c.id] ? <small className='afv-hint'>{tr(lang, '«Пройдено» вимагає вибраного доказу (вкладка «Докази»).', '«Geslaagd» vraagt een gekozen bewijsstuk (blad «Bewijs»).')}</small> : null}
            </div>
          ))}
        </div>
      ) : null}

      {dtab === 'relaties' ? (
        <div className='afv-dblad'>
          {!detail.koppelingen.length ? <p className='afv-hint'>{tr(lang, 'Зв’язків ще немає.', 'Nog geen koppelingen.')}</p> : null}
          {detail.koppelingen.map((k) => (
            <div key={k.id} className='afv-rij afv-koppeling' data-afv-koppeling={k.id} data-afv-koppeling-stand={k.stand}>
              <span className='afv-chip is-stil'>{afstemmingTekst(KOPPEL_LABEL[k.soort], lang)}</span>
              <code>{k.van === kaart.id ? `→ ${k.naar.slice(0, 8)}` : `← ${k.van.slice(0, 8)}`}</code>
              <span>{k.reden}</span>
              <small className='afv-hint'>{Math.round(k.zekerheid * 100)}%</small>
              <span className={`afv-chip${k.stand === 'bevestigd' ? ' is-ok' : ''}`}>{k.stand === 'bevestigd' ? tr(lang, 'підтверджено', 'bevestigd') : k.stand === 'afgewezen' ? tr(lang, 'відхилено', 'afgewezen') : tr(lang, 'пропозиція', 'voorstel')}</span>
              {k.stand === 'voorgesteld' ? (
                <span className='afv-rij'>
                  <button type='button' className='afv-knop is-klein is-hoofd' disabled={besig} data-afv-koppel-ok={k.id} onClick={() => void doe(async () => { await afstemmingClient.koppel({ actie: 'bevestig', id: k.id }); }, tr(lang, 'Зв’язок підтверджено.', 'Koppeling bevestigd.'))}>{tr(lang, 'Підтвердити', 'Bevestigen')}</button>
                  <button type='button' className='afv-knop is-klein' disabled={besig} data-afv-koppel-nee={k.id} onClick={() => void doe(async () => { await afstemmingClient.koppel({ actie: 'wijs-af', id: k.id }); }, tr(lang, 'Пропозицію відхилено.', 'Voorstel afgewezen.'))}>{tr(lang, 'Відхилити', 'Afwijzen')}</button>
                </span>
              ) : null}
            </div>
          ))}
          <form className='afv-vorm' data-afv-koppel-vorm='' onSubmit={(e) => { e.preventDefault(); if (!kGevonden) return; void doe(async () => { await afstemmingClient.koppel({ actie: 'stel-voor', van: kaart.id, naar: kGevonden.id, soort: kSoort, reden: kReden, zekerheid: kZeker / 100 }); setKGevonden(null); setKReden(''); }, tr(lang, 'Зв’язок запропоновано.', 'Koppeling voorgesteld.')); }}>
            <h4>{tr(lang, 'Запропонувати зв’язок', 'Koppeling voorstellen')}</h4>
            <div className='afv-rij'>
              <input value={kZoek} data-afv-koppel-zoek='' placeholder={tr(lang, 'ID або назва картки…', 'ID of titel van de kaart…')} aria-label={tr(lang, 'Пошук картки', 'Kaart zoeken')} onChange={(e) => setKZoek(e.target.value)} />
              <button type='button' className='afv-knop is-klein' disabled={kZoek.trim().length < AFSTEMMING_LIMIETEN.zoekMin} onClick={() => void (async () => { try { const uit = await afstemmingClient.kaarten({ zoek: kZoek.trim() }); setKGevonden(uit.kaarten.find((x) => x.id !== kaart.id) || null); if (!uit.kaarten.length) setFout(tr(lang, 'Нічого не знайдено.', 'Niets gevonden.')); } catch (err) { setFout(afstemmingFoutTekst(lang, err)); } })()}>{tr(lang, 'Знайти', 'Zoeken')}</button>
            </div>
            {kGevonden ? <p className='afv-hint' data-afv-koppel-gevonden={kGevonden.id}>{kGevonden.externId} · {afstemmingTekst(kGevonden.titel, lang)}</p> : null}
            <div className='afv-rij'>
              <select value={kSoort} aria-label={tr(lang, 'Тип зв’язку', 'Soort koppeling')} onChange={(e) => setKSoort(e.target.value as KoppelSoort)}>
                {KOPPEL_SOORTEN.map((s) => <option key={s} value={s}>{afstemmingTekst(KOPPEL_LABEL[s], lang)}</option>)}
              </select>
              <label className='afv-rij afv-zeker'>{tr(lang, 'Упевненість', 'Zekerheid')}
                <input type='range' min={0} max={100} value={kZeker} onChange={(e) => setKZeker(Number(e.target.value))} />
                <small>{kZeker}%</small>
              </label>
            </div>
            <input value={kReden} placeholder={tr(lang, 'Причина (обов’язково)', 'Reden (verplicht)')} aria-label={tr(lang, 'Причина', 'Reden')} onChange={(e) => setKReden(e.target.value)} />
            <button type='submit' className='afv-knop is-hoofd' disabled={besig || !kGevonden || !kReden.trim()}>{tr(lang, 'Запропонувати', 'Voorstellen')}</button>
          </form>
        </div>
      ) : null}

      {dtab === 'bewijs' ? (
        <div className='afv-dblad'>
          {!detail.bewijs.length ? <p className='afv-hint'>{tr(lang, 'Доказів ще немає — і картка ЧЕСНО не вважається перевіреною.', 'Nog geen bewijs — en de kaart heet dus EERLIJK niet gecontroleerd.')}</p> : null}
          {detail.bewijs.map((b) => (
            <div key={b.id} className='afv-rij afv-bewijsstuk' data-afv-bewijs={b.id}>
              <span className='afv-chip is-stil'>{b.soort}</span>
              <span className='afv-chip is-stil'>{b.omgeving}</span>
              <span className={`afv-chip${b.resultaat === 'geslaagd' ? ' is-ok' : b.resultaat === 'mislukt' ? ' is-conflict' : ''}`}>{b.resultaat}</span>
              <code>{b.verwijzing}</code>
              <small className='afv-hint'>{kleineDatum(lang, b.waargenomenOp)} · {actorTekst(lang, b.door)}</small>
            </div>
          ))}
          <form className='afv-vorm' data-afv-bewijs-vorm='' onSubmit={(e) => { e.preventDefault(); void doe(async () => { await afstemmingClient.bewijs({ kaartId: kaart.id, soort: bVorm.soort, omgeving: bVorm.omgeving, verwijzing: bVorm.verwijzing.trim(), resultaat: bVorm.resultaat, ...(bVorm.sha256.trim() ? { sha256: bVorm.sha256.trim() } : {}) }); setBVorm((v) => ({ ...v, verwijzing: '', sha256: '' })); }, tr(lang, 'Доказ додано.', 'Bewijs toegevoegd.')); }}>
            <h4>{tr(lang, 'Додати доказ', 'Bewijs toevoegen')}</h4>
            <div className='afv-rij'>
              <select value={bVorm.soort} aria-label={tr(lang, 'Тип доказу', 'Soort bewijs')} onChange={(e) => setBVorm((v) => ({ ...v, soort: e.target.value as typeof v.soort }))}>{BEWIJS_SOORTEN.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              <select value={bVorm.omgeving} aria-label={tr(lang, 'Середовище', 'Omgeving')} onChange={(e) => setBVorm((v) => ({ ...v, omgeving: e.target.value as typeof v.omgeving }))}>{OMGEVINGEN.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              <select value={bVorm.resultaat} aria-label={tr(lang, 'Результат', 'Resultaat')} onChange={(e) => setBVorm((v) => ({ ...v, resultaat: e.target.value as typeof v.resultaat }))}>
                <option value='geslaagd'>{tr(lang, 'пройшов', 'geslaagd')}</option><option value='mislukt'>{tr(lang, 'провалився', 'mislukt')}</option><option value='onbekend'>{tr(lang, 'невідомо', 'onbekend')}</option>
              </select>
            </div>
            <input value={bVorm.verwijzing} placeholder={tr(lang, 'Посилання/шлях на доказ (журнал, скриншот, тест)…', 'Verwijzing/pad naar het bewijs (log, screenshot, test)…')} aria-label={tr(lang, 'Посилання на доказ', 'Verwijzing')} onChange={(e) => setBVorm((v) => ({ ...v, verwijzing: e.target.value }))} />
            <input value={bVorm.sha256} placeholder='sha256 (не обов’язково / optioneel)' aria-label='sha256' onChange={(e) => setBVorm((v) => ({ ...v, sha256: e.target.value }))} />
            <button type='submit' className='afv-knop is-hoofd' disabled={besig || !bVorm.verwijzing.trim()}>{tr(lang, 'Додати', 'Toevoegen')}</button>
          </form>
        </div>
      ) : null}

      {dtab === 'releases' ? (
        <div className='afv-dblad' data-afv-releases=''>
          {!detail.releases.length ? <p className='afv-hint'>{tr(lang, 'Ця картка ще не пов’язана з жодним випуском.', 'Deze kaart is nog aan geen release gekoppeld.')}</p> : null}
          {detail.releases.map((r) => (
            <div key={r.id} className='afv-rij' data-afv-release={r.releaseVersie}>
              <code>{r.releaseVersie}</code>
              {r.commit ? <code className='afv-hint'>{r.commit.slice(0, 10)}</code> : null}
              <span className={`afv-chip${r.postflight === 'gecontroleerd' ? ' is-ok' : r.postflight === 'regressie' ? ' is-conflict' : ''}`}>{tr(lang, POSTFLIGHT_TEKST[r.postflight]?.[0] || r.postflight, POSTFLIGHT_TEKST[r.postflight]?.[1] || r.postflight)}</span>
              <small className='afv-hint'>{Math.round(r.zekerheid * 100)}% · {kleineDatum(lang, r.op)}</small>
            </div>
          ))}
          <p className='afv-hint'>{tr(lang, 'Успішне встановлення саме по собі не означає «працює»: підтвердження дає лише перевірка критеріїв.', 'Een geslaagde installatie betekent op zichzelf niet «werkt»: alleen de criteriumcontrole bevestigt dat.')}</p>
        </div>
      ) : null}

      {dtab === 'historie' ? (
        <div className='afv-dblad'>
          <ul className='afv-tijdlijn' data-afv-tijdlijn=''>
            {(events || []).map((g) => (
              <li key={g.id}><strong>{gebeurtenisTekst(lang, g.soort)}</strong><small className='afv-hint'> · {actorTekst(lang, g.actor)} · {kleineDatum(lang, g.op)}</small></li>
            ))}
            {events && !events.length ? <li className='afv-hint'>{tr(lang, 'Подій ще немає.', 'Nog geen gebeurtenissen.')}</li> : null}
            {events === null ? <li className='afv-hint' aria-busy='true'>{tr(lang, 'Завантаження…', 'Laden…')}</li> : null}
          </ul>
          {eToken ? <button type='button' className='afv-knop is-klein' onClick={() => void laadEvents(eToken)}>{tr(lang, 'Показати ще', 'Meer tonen')}</button> : null}
          {detail.besluiten.length ? (
            <div className='afv-veld'><small>{tr(lang, 'Рішення власника', 'Eigenaarsbesluiten')}</small>
              {detail.besluiten.map((b) => <p key={b.id}><code>{b.keuze}</code> — {b.reden} <small className='afv-hint'>({kleineDatum(lang, b.op)})</small></p>)}
            </div>
          ) : null}
          <div className='afv-veld'>
            <small>{tr(lang, 'Порівняти дві ревізії', 'Twee revisies vergelijken')}</small>
            <div className='afv-rij'>
              <select value={diffA} data-afv-diff-a='' aria-label='A' onChange={(e) => setDiffA(e.target.value)}><option value=''>A…</option>{revisieOpties.map(([id, naam]) => <option key={id} value={id}>{naam}</option>)}</select>
              <select value={diffB} data-afv-diff-b='' aria-label='B' onChange={(e) => setDiffB(e.target.value)}><option value=''>B…</option>{revisieOpties.map(([id, naam]) => <option key={id} value={id}>{naam}</option>)}</select>
              <button type='button' className='afv-knop is-klein' disabled={!diffA || !diffB || diffA === diffB} onClick={() => void (async () => { try { setDiff((await afstemmingClient.verschil(kaart.id, diffA, diffB)).velden); } catch (err) { setFout(afstemmingFoutTekst(lang, err)); } })()}><GitCompareArrows aria-hidden='true' />{tr(lang, 'Порівняти', 'Vergelijken')}</button>
            </div>
            {revisieOpties.length < 2 ? <small className='afv-hint'>{tr(lang, 'Поки є лише одна ревізія — порівнювати стане можливо після першої правки.', 'Er is nog één revisie — vergelijken kan na de eerste wijziging.')}</small> : null}
            {diff ? (
              <table className='afv-diff-tabel' data-afv-diff=''>
                <thead><tr><th>{tr(lang, 'Поле', 'Veld')}</th><th>A</th><th>B</th></tr></thead>
                <tbody>{diff.map((r) => <tr key={r.veld}><td><code>{r.veld}</code></td><td>{r.a}</td><td>{r.b}</td></tr>)}</tbody>
              </table>
            ) : null}
            {diff && !diff.length ? <p className='afv-hint'>{tr(lang, 'Відмінностей немає.', 'Geen verschillen.')}</p> : null}
          </div>
        </div>
      ) : null}

      {dtab === 'acties' ? (
        <div className='afv-dblad'>
          <form className='afv-vorm' data-afv-fase-vorm='' onSubmit={(e) => { e.preventDefault(); if (!fase) return; void doe(async () => { await afstemmingClient.fase(kaart.id, kaart.versie, fase, faseReden.trim() || undefined); setFase(''); setFaseReden(''); }, tr(lang, 'Етап змінено.', 'Fase gewijzigd.')); }}>
            <h4>{tr(lang, 'Перехід етапу', 'Fase-overgang')}</h4>
            <div className='afv-rij'>
              <select value={fase} data-afv-fase='' aria-label={tr(lang, 'Наступний етап', 'Volgende fase')} onChange={(e) => setFase(e.target.value as Levensfase)}>
                <option value=''>{tr(lang, '— оберіть етап —', '— kies een fase —')}</option>
                {volgende.map((f) => <option key={f} value={f}>{afstemmingTekst(LEVENSFASE_LABEL[f], lang)}{faseVraagtMens(f) ? tr(lang, ' · рішення власника', ' · eigenaarsbesluit') : ''}</option>)}
              </select>
              <button type='submit' className='afv-knop is-hoofd' data-afv-fase-zet='' disabled={besig || !fase}>{tr(lang, 'Змінити етап', 'Fase zetten')}</button>
            </div>
            {fase === 'production_verified' ? <small className='afv-hint'>{tr(lang, 'Сервер вимагатиме доказ із production — без нього буде чесна відмова.', 'De server eist productiebewijs — zonder volgt een eerlijke weigering.')}</small> : null}
            <input value={faseReden} placeholder={tr(lang, 'Причина (видно в історії)…', 'Reden (zichtbaar in de geschiedenis)…')} aria-label={tr(lang, 'Причина', 'Reden')} onChange={(e) => setFaseReden(e.target.value)} />
          </form>
          {!wijzigOpen ? <button type='button' className='afv-knop' data-afv-wijzig-open='' onClick={() => setWijzigOpen(true)}>{tr(lang, 'Запропонувати правку', 'Wijziging voorstellen')}</button> : (
            <form className='afv-vorm' data-afv-wijzig='' onSubmit={(e) => { e.preventDefault(); void doe(async () => { const uit = await afstemmingClient.wijzig(kaart.id, kaart.versie, { titel: [w.titelUk, w.titelNl || w.titelUk], samenvatting: [w.samenvattingUk, w.samenvattingNl || w.samenvattingUk], bedoeling: w.bedoeling, verwachtGedrag: w.verwachtGedrag, criteria: criteriaUitTekst(w.criteria), dienst: w.dienst, categorie: w.categorie, prioriteit: w.prioriteit }); toon(tr(lang, `Збережено як ревізію ${uit.revisie.nummer}.`, `Bewaard als revisie ${uit.revisie.nummer}.`)); setWijzigOpen(false); }); }}>
              <h4>{tr(lang, 'Правка (стане новою ревізією; попередня лишається в історії)', 'Wijziging (wordt een nieuwe revisie; de vorige blijft in de geschiedenis)')}</h4>
              <input value={w.titelUk} maxLength={AFSTEMMING_LIMIETEN.titelMax} data-afv-eerste='' aria-label={tr(lang, 'Назва (укр)', 'Titel (uk)')} placeholder={tr(lang, 'Назва (укр)', 'Titel (uk)')} onChange={(e) => setW((v) => ({ ...v, titelUk: e.target.value }))} />
              <input value={w.titelNl} maxLength={AFSTEMMING_LIMIETEN.titelMax} aria-label='Titel (nl)' placeholder='Titel (nl)' onChange={(e) => setW((v) => ({ ...v, titelNl: e.target.value }))} />
              <input value={w.samenvattingUk} maxLength={AFSTEMMING_LIMIETEN.samenvattingMax} aria-label={tr(lang, 'Суть (укр)', 'Kern (uk)')} placeholder={tr(lang, 'Суть (укр)', 'Kern (uk)')} onChange={(e) => setW((v) => ({ ...v, samenvattingUk: e.target.value }))} />
              <input value={w.samenvattingNl} maxLength={AFSTEMMING_LIMIETEN.samenvattingMax} aria-label='Kern (nl)' placeholder='Kern (nl)' onChange={(e) => setW((v) => ({ ...v, samenvattingNl: e.target.value }))} />
              <textarea value={w.bedoeling} rows={3} maxLength={AFSTEMMING_LIMIETEN.tekstMax} aria-label={tr(lang, 'Задум', 'Bedoeling')} onChange={(e) => setW((v) => ({ ...v, bedoeling: e.target.value }))} />
              <textarea value={w.verwachtGedrag} rows={3} maxLength={AFSTEMMING_LIMIETEN.tekstMax} aria-label={tr(lang, 'Очікувана поведінка', 'Verwacht gedrag')} onChange={(e) => setW((v) => ({ ...v, verwachtGedrag: e.target.value }))} />
              <label className='afv-veld'><small>{tr(lang, 'Критерії — рядок на критерій: «ID | текст | unit/integration/e2e/production/owner»', 'Criteria — één regel per criterium: «ID | tekst | unit/integration/e2e/production/owner»')}</small>
                <textarea value={w.criteria} rows={5} data-afv-wijzig-criteria='' onChange={(e) => setW((v) => ({ ...v, criteria: e.target.value }))} />
              </label>
              <div className='afv-rij'>
                <input value={w.dienst} aria-label={tr(lang, 'Сервіс', 'Dienst')} placeholder={tr(lang, 'Сервіс', 'Dienst')} onChange={(e) => setW((v) => ({ ...v, dienst: e.target.value }))} />
                <input value={w.categorie} aria-label={tr(lang, 'Категорія', 'Categorie')} placeholder={tr(lang, 'Категорія', 'Categorie')} onChange={(e) => setW((v) => ({ ...v, categorie: e.target.value }))} />
                <select value={w.prioriteit} aria-label={tr(lang, 'Пріоритет', 'Prioriteit')} onChange={(e) => setW((v) => ({ ...v, prioriteit: e.target.value as typeof v.prioriteit }))}>{PRIORITEITEN.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              </div>
              <div className='afv-rij'>
                <button type='submit' className='afv-knop is-hoofd' disabled={besig || !w.titelUk.trim()}>{tr(lang, 'Зберегти ревізію', 'Revisie bewaren')}</button>
                <button type='button' className='afv-knop' onClick={() => setWijzigOpen(false)}>{tr(lang, 'Згорнути', 'Inklappen')}</button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </Laag>
  );
}
