// «Окремі простори» — het beheer van de GESCHEIDEN GEGEVENSRUIMTES (migratie 0082, shared/ruimte-scheiding.ts).
// Staat in de hub «Підключення ШІ» → tab «Технічне» (src/agenten/TabTechnisch.tsx), dus naast de technische verbindingen
// waar hij hoort; geen nieuwe pagina en geen nieuw menu-item.
//
// Twee toestanden, en geen derde:
//  1. de mens heeft nog niet gekozen → het venster met de drie mogelijkheden (роздільно / спільно / обидва окремо) met in
//     gewone taal wat elke keuze betekent. Tot er gekozen is, is de technische ruimte leeg en zegt de server dat ook
//     (KEUZE_ONTBREEKT) in plaats van een leeg scherm te tonen;
//  2. er is gekozen → de lijst met alle diensten: stand, wie het bevestigde en wanneer, en per dienst «Під'єднати» (vraagt
//     bevestiging) of «Від'єднати» (gebeurt onmiddellijk). Bevroren diensten tonen de oorzaak en de drie besluiten die alleen
//     de eigenaar van de server mag nemen: повернути / передати собі / видалити.
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Link2, Link2Off, Lock, Snowflake } from 'lucide-react';
import { api } from '../platform/client';
import type { Tr } from '../mcp-ui';
import { techBody } from '../tech/tech-opslag';
import {
  DIENST_NAAM, KEUZE_NAAM, KEUZE_UITLEG, KEUZES, STAND_NAAM, STAND_UITLEG, WEIGERING_UITLEG, OORZAAK_NAAM,
  type DeelbareDienst, type DienstStand, type Keuze, type Oorzaak,
} from '../../shared/ruimte-scheiding';
import { foutTekst } from './fouten';
import './agenten.css';
import './agenten-tabs-2.css';
import './agenten-toegang-maquette.css';

type DienstRij = { dienst: DeelbareDienst; stand: DienstStand; vorigeStand: DienstStand; gewijzigdOp: number; bevestigdDoor: string; bevrorenOp: number | null; bevrorenOorzaak: Oorzaak | '' };
type Verslag = { besluit: string; uitvoerders: number; rijen: number; volledig: boolean; regels: Array<{ tabel: string; rijen: number; door: string }> };
type Overzicht = { keuze: { keuze: Keuze; op: number; door: string } | null; standen: Array<DienstRij & { besluit?: string; verslag?: Verslag | null }>; rechten: { ok: boolean; oorzaak?: Oorzaak; rollen?: string[]; ikEigenaar?: boolean }; nu: number };

const tijd = (ms: number, uk: boolean) => (ms ? new Date(ms).toLocaleString(uk ? 'uk-UA' : 'nl-NL') : '—');
/** Kleur van de standbadge (statuskleuren van .ag in agenten.css). */
const STAND_TOON: Readonly<Record<DienstStand, 'ok' | 'info' | 'off' | 'warn'>> = { eigen: 'ok', gedeeld: 'info', uit: 'off', bevroren: 'warn' };

export default function RuimteScheiding({ tr }: { tr: Tr }) {
  const uk = tr('uk', 'nl') === 'uk';
  const taal = uk ? 'uk' : 'nl';
  const [data, setData] = useState<Overzicht | null>(null);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState('');

  const laad = useCallback(async () => {
    try { setData(((await api.post('/api/owner/ruimte/overzicht', techBody())).data) as Overzicht); setFout(''); }
    catch (e) { setFout(foutTekst(e, tr)); }
  }, [tr]);
  useEffect(() => { void laad(); }, [laad]);

  const doe = useCallback(async (sleutel: string, url: string, body: Record<string, unknown>) => {
    setBezig(sleutel);
    try { await api.post(url, { ...techBody(), ...body }); setFout(''); await laad(); }
    catch (e) { setFout(foutTekst(e, tr)); }
    finally { setBezig(''); }
  }, [laad, tr]);

  // INTEG-001 (agpag2, 03.11.2026): in elke toestand één blok (.ag-blok, contract van agenten-pagina.css) met naam en één zin;
  // de diensten staan als rijen (.ag2-diensten) in plaats van een kale tabel, ook op de telefoon zonder horizontale scroll.
  if (!data) {
    return (
      <section className='ag-blok' data-ag-blok='ruimte-scheiding' data-ruimte-scheiding='laden' aria-labelledby='ag2-ruimte-kop'>
        <header className='ag-blok-kop'>
          <h3 className='ag-blok-titel' id='ag2-ruimte-kop'><Lock aria-hidden='true' /> {tr('Окремі простори', 'Gescheiden ruimtes')}</h3>
          <p className='ag-blok-uitleg'>{tr('Які дані технічний профіль має окремо від вашого особистого, а які — спільно.', 'Welke gegevens het technische profiel apart van uw persoonlijke heeft, en welke gedeeld.')}</p>
        </header>
        <p className='ag-leeg'>{fout || tr('Завантаження…', 'Laden…')}</p>
      </section>
    );
  }

  // De keuze is nog niet gemaakt: één keer vragen, met de gevolgen in gewone taal.
  if (!data.keuze) {
    return (
      <section className='ag-blok' data-ag-blok='ruimte-scheiding' data-ruimte-scheiding='keuze' aria-labelledby='ag2-ruimte-kop'>
        <header className='ag-blok-kop'>
          <h3 className='ag-blok-titel' id='ag2-ruimte-kop'><Lock aria-hidden='true' /> {tr('Окремі простори: оберіть один раз', 'Gescheiden ruimtes: kies één keer')}</h3>
          <p className='ag-blok-uitleg'>{tr('Технічний профіль і ваш особистий профіль — це дві різні шухляди даних: своя пошта, своя хмара, свої підключення ШІ, своя дошка.', 'Het technische profiel en uw persoonlijke profiel zijn twee verschillende lades: eigen mail, eigen cloud, eigen AI-verbindingen, eigen bord.')}</p>
        </header>
        <p className='ag-rij ag2-rij is-warn'><span>{tr('Доки ви не оберете, технічний простір порожній: служби в ньому відмовляють і нічого не записують.', 'Tot u kiest, is de technische ruimte leeg: de diensten weigeren er en schrijven niets.')} {WEIGERING_UITLEG.KEUZE_ONTBREEKT[taal]}</span></p>
        <div className='ag-keuzes'>
          {KEUZES.map((k) => (
            <div key={k} className='ag-keuze' data-keuze={k}>
              <h4>{KEUZE_NAAM[k][taal]}</h4>
              <p>{KEUZE_UITLEG[k][taal]}</p>
              <button type='button' className='ag-knop ag-knop-primary' disabled={!!bezig}
                onClick={() => void doe(`keuze:${k}`, '/api/owner/ruimte/keuze', { keuze: k })}>
                <KeyRound size={16} aria-hidden='true' />{tr('Обрати (з підтвердженням)', 'Kiezen (met bevestiging)')}
              </button>
            </div>
          ))}
        </div>
        {fout ? <p className='ag-fout' role='alert'>{fout}</p> : null}
      </section>
    );
  }

  const bevroren = data.standen.filter((s) => s.stand === 'bevroren');
  return (
    <section className='ag-blok' data-ag-blok='ruimte-scheiding' data-ruimte-scheiding='standen' aria-labelledby='ag2-ruimte-kop'>
      <header className='ag-blok-kop'>
        <h3 className='ag-blok-titel' id='ag2-ruimte-kop'><Lock aria-hidden='true' /> {tr('Окремі простори', 'Gescheiden ruimtes')}</h3>
        <p className='ag-blok-uitleg'>{tr("Кожну службу можна під'єднати або від'єднати окремо: під'єднання вимагає підтвердження, від'єднання спрацьовує одразу.", 'Elke dienst kunt u apart verbinden of losmaken: verbinden vraagt een bevestiging, losmaken werkt onmiddellijk.')}</p>
      </header>
      <p className='ag-rij ag2-rij is-let'><span>{tr(
        `Ваш вибір: «${KEUZE_NAAM[data.keuze.keuze].uk}» (${tijd(data.keuze.op, true)}). Усе потрапляє до журналу.`,
        `Uw keuze: «${KEUZE_NAAM[data.keuze.keuze].nl}» (${tijd(data.keuze.op, false)}). Alles komt in het logboek.`,
      )}</span></p>
      {data.rechten.ok && data.rechten.rollen?.length ? (
        <p className='ag-uitleg' data-rollen='1'>{tr(
          `Технічний доступ: ${data.rechten.rollen.join(', ')}. Окремі шухляди даних є в кожного з технічним доступом; технічні права (випуски, сервер, термінали) від цього не змінюються.`,
          `Technische toegang: ${data.rechten.rollen.join(', ')}. Eigen gegevenslades heeft ieder met technische toegang; technische rechten (releases, server, terminals) veranderen hier niet.`,
        )}</p>
      ) : null}
      {!data.rechten.ok ? (
        <p className='ag-fout' role='alert' data-rechten='weg'>{tr(
          `Технічних прав зараз немає (${OORZAAK_NAAM[data.rechten.oorzaak || 'rol-weg'].uk}). Технічний простір заморожено.`,
          `Er zijn nu geen technische rechten (${OORZAAK_NAAM[data.rechten.oorzaak || 'rol-weg'].nl}). De technische ruimte is bevroren.`,
        )}</p>
      ) : null}
      <ul className='ag2-diensten' data-ruimte-tabel='1' aria-label={tr('Служби технічного простору', 'Diensten van de technische ruimte')}>
          {data.standen.map((s) => (
            <li key={s.dienst} className='ag2-dienst' data-dienst={s.dienst} data-stand={s.stand}>
              <span className='ag2-dienst-naam'>
                {DIENST_NAAM[s.dienst][taal]}
                <span className={`ag-badge ag-${STAND_TOON[s.stand]}`} title={STAND_UITLEG[s.stand][taal]} data-badge='stand'>
                  {s.stand === 'bevroren' ? <Snowflake size={12} aria-hidden='true' /> : null}
                  {STAND_NAAM[s.stand][taal]}
                </span>
              </span>
              <span className='ag2-dienst-wie'>
                {s.gewijzigdOp ? `${s.bevestigdDoor || '—'} · ${tijd(s.gewijzigdOp, uk)}` : tr('ще не змінювалося', 'nog niet gewijzigd')}
                {s.verslag ? (
                  <span className='ag-uitleg ag2-dienst-verslag' data-verslag={s.verslag.besluit}>{tr(
                    `Рішення «${s.verslag.besluit}»: ${s.verslag.volledig ? `оброблено рядків — ${s.verslag.rijen}` : 'фізичне перенесення ще не виконано (служба ще не підключила обробник)'}`,
                    `Besluit «${s.verslag.besluit}»: ${s.verslag.volledig ? `${s.verslag.rijen} rijen verwerkt` : 'fysiek verplaatsen nog niet uitgevoerd (de dienst heeft nog geen uitvoerder aangemeld)'}`,
                  )}</span>
                ) : null}
              </span>
              <span className='ag-knoppen ag2-dienst-acties'>
                {s.stand === 'bevroren' ? (
                  <>
                    <span className='ag-uitleg'>{s.bevrorenOorzaak ? OORZAAK_NAAM[s.bevrorenOorzaak][taal] : ''}</span>
                    {/* Beslissen over bevroren gegevens doet alleen de EIGENAAR VAN DE SERVER; een ander ziet hier geen knoppen,
                        maar wel waarom het bevroren is (de server weigert de route bovendien met OWNER_REQUIRED). */}
                    {!data.rechten.ikEigenaar ? <span className='ag-uitleg' data-besluit='alleen-eigenaar'>{tr('Рішення ухвалює власник сервера.', 'De eigenaar van de server beslist.')}</span> : null}
                    {data.rechten.ikEigenaar ? (['teruggeven', 'overdragen', 'verwijderen'] as const).map((b) => (
                      <button key={b} type='button' className='ag-knop' disabled={!!bezig}
                        onClick={() => void doe(`besluit:${s.dienst}:${b}`, '/api/owner/ruimte/besluit', { dienst: s.dienst, besluit: b })}>
                        {b === 'teruggeven' ? tr('Повернути', 'Teruggeven') : b === 'overdragen' ? tr('Передати собі', 'Overnemen') : tr('Видалити', 'Verwijderen')}
                      </button>
                    )) : null}
                  </>
                ) : (
                  <>
                    {s.stand !== 'eigen' ? (
                      <button type='button' className='ag-knop ag-knop-primary' disabled={!!bezig}
                        onClick={() => void doe(`eigen:${s.dienst}`, '/api/owner/ruimte/dienst', { dienst: s.dienst, actie: 'verbind-eigen' })}>
                        <Link2 size={14} aria-hidden='true' />{tr('Власні дані', 'Eigen gegevens')}
                      </button>
                    ) : null}
                    {s.stand !== 'gedeeld' ? (
                      <button type='button' className='ag-knop' disabled={!!bezig}
                        onClick={() => void doe(`gedeeld:${s.dienst}`, '/api/owner/ruimte/dienst', { dienst: s.dienst, actie: 'verbind-gedeeld' })}>
                        <Link2 size={14} aria-hidden='true' />{tr('Спільно з особистим', 'Gedeeld met persoonlijk')}
                      </button>
                    ) : null}
                    {s.stand !== 'uit' ? (
                      <button type='button' className='ag-knop' disabled={!!bezig}
                        onClick={() => void doe(`uit:${s.dienst}`, '/api/owner/ruimte/dienst', { dienst: s.dienst, actie: 'ontkoppel' })}>
                        <Link2Off size={14} aria-hidden='true' />{tr("Від'єднати", 'Losmaken')}
                      </button>
                    ) : null}
                  </>
                )}
              </span>
            </li>
          ))}
      </ul>
      {bevroren.length ? (
        <p className='ag-uitleg' data-bevroren='uitleg'>{STAND_UITLEG.bevroren[taal]}</p>
      ) : null}
      {fout ? <p className='ag-fout' role='alert'>{fout}</p> : null}
    </section>
  );
}
