// AANMELD-PLAATSING v1 — beheer: per aanmeldmethode «На головній» / «У «Інші способи входу»» / «Приховано» + volgorde, met een
// voorbeeld van het aanmeldscherm. Opslaan gaat via de gewone poort 'beheer-instellingen' (verse toegangssleutel) en het journaal.
// Розміщення способів входу: адміністратор визначає, що видно на головній сторінці входу, а що — під «Інші способи входу».
import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react';
import { tgPost, foutTekst, type Ctx } from './api';
import { useEenmalig } from './Bevestigen';
import { indelen, METHODE_NAMEN, PLEK_NAMEN, PLEKKEN, plaatsingControleren, verschuiven, type MethodeId, type Plaatsing, type Plek } from '../../shared/aanmeld-plaatsing/plaatsing';
type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);

const kies = (lang: Lang, p: [string, string]) => (lang === 'nl' ? p[1] : p[0]);

export default function PlaatsingBeheer({ ctx, lang, uitvoeren }: { ctx: Ctx; lang: Lang; uitvoeren: <T>(fn: () => Promise<T>) => Promise<T> }) {
  const [opgeslagen, setOpgeslagen] = useState<Plaatsing | null>(null);
  const [p, setP] = useState<Plaatsing | null>(null);
  const [werkend, setWerkend] = useState<MethodeId[]>(['google']);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const { bezig, doe } = useEenmalig();
  const laden = useCallback(() => tgPost<{ plaatsing: Plaatsing; werkend: MethodeId[] }>(ctx, '/api/owner/telegram/beheer/plaatsing-lezen')
    .then((r) => { setOpgeslagen(r.plaatsing); setP(r.plaatsing); setWerkend(r.werkend); }).catch((e) => setFout(foutTekst(lang, e))), [ctx, lang]);
  useEffect(() => { void laden(); }, [laden]);
  if (!p || !opgeslagen) return fout ? <div className='tga-blok'><p className='tga-fout'>{fout}</p></div> : null;

  const fouten = plaatsingControleren(p, werkend);
  const gewijzigd = JSON.stringify(p) !== JSON.stringify(opgeslagen);
  const voorbeeld = indelen(p, werkend);
  const zet = (m: MethodeId, plek: Plek) => setP({ ...p, plek: { ...p.plek, [m]: plek } });
  const opslaan = () => doe(async () => {
    setFout(''); setMelding('');
    try {
      await uitvoeren(() => tgPost(ctx, '/api/owner/telegram/beheer/plaatsing', { plaatsing: p }));
      setMelding(tr(lang, 'Розміщення збережено. Сторінка входу зміниться протягом хвилини.', 'Plaatsing opgeslagen. Het aanmeldscherm verandert binnen een minuut.'));
      await laden();
    } catch (e) { if ((e as Error).message !== 'GEANNULEERD') setFout(foutTekst(lang, e)); }
  });
  const stand = (m: MethodeId) => werkend.includes(m)
    ? tr(lang, 'працює', 'werkt')
    : m === 'telegram' ? tr(lang, 'ще не працює (немає ключа бота) — не показується, доки не запрацює', 'werkt nog niet (geen botsleutel) — niet getoond tot hij werkt')
      // IDENTITEIT-015 (aanmelden): точна передумова для нових способів входу.
      : m === 'passkey' ? tr(lang, 'ще не працює — увімкніть прапорець «Вхід лише ключем доступу» у «Функціях» (хоча б для себе)', 'werkt nog niet — zet de vlag «Aanmelden met alleen een toegangssleutel» aan bij «Functies» (minstens voor uzelf)')
      : m === 'wachtwoord' ? tr(lang, 'ще не працює — увімкніть прапорець «Вхід паролем» у «Функціях»; доти не показується', 'werkt nog niet — zet de vlag «Aanmelden met wachtwoord» aan bij «Functies»; tot dan niet getoond')
      : m === 'microsoft' || m === 'apple' || m === 'discord' ? tr(lang, 'ще не працює — потрібні ключі AANMELD_* і пройдена самоперевірка (розділ «Інші способи — чесно») та прапорець «Вхід через Microsoft, Discord або Apple»', 'werkt nog niet — AANMELD_*-sleutels, een geslaagde zelftest («Andere methoden — eerlijk») en de vlag «Aanmelden met Microsoft, Discord of Apple» zijn nodig')
      : tr(lang, 'ще не працює — на головній не показується; в «Інші способи входу» видно як недоступний з причиною', 'werkt nog niet — nooit op het hoofdscherm; onder «Andere aanmeldmethoden» als niet beschikbaar met reden');

  return <div className='tga-blok tga-plaatsing' data-aanmeld-plaatsing>
    <h3>{tr(lang, 'Розміщення способів входу', 'Plaatsing van de aanmeldmethoden')}</h3>
    <p className='tga-klein'>{tr(lang,
      'Для кожного способу виберіть, де він показується на сторінці входу, і порядок стрілками. На головній можна поставити скільки завгодно способів, навіть усі. Спосіб, який зараз не працює, на головній ніколи не з’являється. Хоча б один робочий спосіб мусить лишатися видимим — інакше ніхто не зможе увійти. Збереження підтверджується ключем доступу й записується в журнал.',
      'Kies per methode waar hij op het aanmeldscherm staat, en de volgorde met de pijlen. Op het hoofdscherm mogen zoveel methoden als u wilt, ook alle. Een methode die nu niet werkt, verschijnt nooit op het hoofdscherm. Minstens één werkende methode moet zichtbaar blijven — anders kan niemand zich aanmelden. Opslaan bevestigt u met uw toegangssleutel en komt in het journaal.')}</p>
    <ol className='tga-plaatsing-lijst'>
      {p.volgorde.map((m, i) => <li key={m} data-methode={m}>
        <span className='tga-plaatsing-naam'><strong>{kies(lang, METHODE_NAMEN[m])}</strong><small>{stand(m)}</small></span>
        <select value={p.plek[m]} onChange={(e) => zet(m, e.target.value as Plek)} aria-label={tr(lang, `Де показувати: ${kies(lang, METHODE_NAMEN[m])}`, `Waar tonen: ${kies(lang, METHODE_NAMEN[m])}`)}>
          {PLEKKEN.map((pl) => <option key={pl} value={pl}>{kies(lang, PLEK_NAMEN[pl])}</option>)}
        </select>
        <span className='tga-plaatsing-pijlen'>
          <button type='button' className='tga-knop tga-knop-klein' disabled={i === 0} onClick={() => setP(verschuiven(p, m, -1))} aria-label={tr(lang, 'Вище', 'Hoger')}><ArrowUp size={16} aria-hidden='true' /></button>
          <button type='button' className='tga-knop tga-knop-klein' disabled={i === p.volgorde.length - 1} onClick={() => setP(verschuiven(p, m, 1))} aria-label={tr(lang, 'Нижче', 'Lager')}><ArrowDown size={16} aria-hidden='true' /></button>
        </span>
      </li>)}
    </ol>
    <div className='tga-plaatsing-voorbeeld' aria-label={tr(lang, 'Попередній перегляд сторінки входу', 'Voorbeeld van het aanmeldscherm')}>
      <strong>{tr(lang, 'Попередній перегляд', 'Voorbeeld')}</strong>
      <div className='tga-voorbeeld-hoofd'>{voorbeeld.hoofd.map((m) => <span key={m} className='tga-voorbeeld-knop'>{tr(lang, `Увійти через ${kies(lang, METHODE_NAMEN[m])}`, `Aanmelden met ${kies(lang, METHODE_NAMEN[m])}`)}</span>)}</div>
      {voorbeeld.andere.length > 0
        ? <div className='tga-voorbeeld-andere'><span className='tga-voorbeeld-schakel'>{tr(lang, 'Інші способи входу', 'Andere aanmeldmethoden')} <ChevronDown size={16} aria-hidden='true' /></span>
          <ul>{voorbeeld.andere.map((m) => <li key={m}>{kies(lang, METHODE_NAMEN[m])}{!werkend.includes(m) && <em> · {tr(lang, 'недоступно', 'niet beschikbaar')}</em>}</li>)}</ul></div>
        : <p className='tga-klein'>{tr(lang, 'Кнопку «Інші способи входу» не показано: там нічого немає.', 'De knop «Andere aanmeldmethoden» wordt niet getoond: er staat niets onder.')}</p>}
      {voorbeeld.noodGoogle && <p className='tga-fout'>{tr(lang, 'Жоден робочий спосіб не видно — сторінка входу все одно покаже Google, щоб ніхто не залишився без входу.', 'Geen werkende methode zichtbaar — het aanmeldscherm toont toch Google, zodat niemand buitengesloten wordt.')}</p>}
    </div>
    {fouten.includes('GEEN_WERKENDE_METHODE') && <p className='tga-fout' role='alert'>{tr(lang, 'Так зберегти не можна: усі робочі способи входу приховано. Залиште видимим хоча б Google.', 'Zo opslaan kan niet: alle werkende methoden zijn verborgen. Laat minstens Google zichtbaar.')}</p>}
    {fout && <p className='tga-fout' role='alert'>{fout}</p>}
    {melding && <p className='tga-ok' role='status'>{melding}</p>}
    <div className='tga-rij'>
      <button type='button' className='tga-knop tga-knop-hoofd' disabled={bezig || !gewijzigd || fouten.length > 0} onClick={() => void opslaan()}>{tr(lang, 'Зберегти розміщення', 'Plaatsing opslaan')}</button>
      <button type='button' className='tga-knop' disabled={bezig || !gewijzigd} onClick={() => setP(opgeslagen)}>{tr(lang, 'Скасувати зміни', 'Wijzigingen terugdraaien')}</button>
    </div>
  </div>;
}
