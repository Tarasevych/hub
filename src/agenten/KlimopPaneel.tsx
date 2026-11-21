// KLIMOP-014 (21.11.2026, Етап 13 впровадження «Плюща» у платформу «Мій простір»):
// Двомовна панель стану живої цифрової екосистеми «Плющ», цілісності пакета «Насіння»,
// Сходинки 1 безризикової дзеркальної перевірки всіх 11 служб (§35) та 15-пунктової перевірки (§42–§43).
// Вбудована в розділ «Координація» (src/agenten/TabOrch.tsx) за спільним контрактом .ag-blok без власного <style>.

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Network, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Tr } from '../mcp-ui';
import HulpVraag from '../hulp/HulpVraag';
import { besluitFoutCode } from '../besluit/besluit-client';
import { KLIMOP_ELF_DIENSTEN, type KlimopDienstId } from '../../shared/klimop/diensten';
import {
  KLIMOP_DIENST_TEKST,
  KLIMOP_OVERDRACHT_TEKST,
  type KlimopArchitectuurToetsUitkomst,
  type KlimopPlatformOverzicht,
  type KlimopSpiegelControleUitkomst,
} from '../../shared/klimop-overzicht-model';
import {
  klimopArchitectuurToetsen,
  klimopFoutTekst,
  klimopOverzichtOphalen,
  klimopSpiegelControleren,
} from '../klimop/klimop-klant';
import { Badge, Knop, Tech } from './ui';

const kort = (s: string | null | undefined, n = 16) => (s ? s.slice(0, n) : '—');

export default function KlimopPaneel({
  tr,
  lang,
  ctx,
}: {
  tr: Tr;
  lang: 'uk' | 'nl';
  ctx: Record<string, unknown>;
}) {
  const [overzicht, setOverzicht] = useState<KlimopPlatformOverzicht | null>(null);
  const [verborgenVoorNietEigenaar, setVerborgenVoorNietEigenaar] = useState(false);
  const [laadFout, setLaadFout] = useState('');
  const [gekozenDienst, setGekozenDienst] = useState<KlimopDienstId>('postvak');
  const [spiegelBezig, setSpiegelBezig] = useState(false);
  const [spiegelUit, setSpiegelUit] = useState<KlimopSpiegelControleUitkomst | null>(null);
  const [spiegelFout, setSpiegelFout] = useState('');

  const [voorstelNaam, setVoorstelNaam] = useState('');
  const [toetsBezig, setToetsBezig] = useState(false);
  const [toetsUit, setToetsUit] = useState<KlimopArchitectuurToetsUitkomst | null>(null);
  const [toetsFout, setToetsFout] = useState('');

  const laden = useCallback(async () => {
    setLaadFout('');
    try {
      setOverzicht(await klimopOverzichtOphalen(ctx));
    } catch (e) {
      const c = besluitFoutCode(e);
      if (c === 'OWNER_REQUIRED' || c === 'ADMIN_SERVICE_REQUIRED') {
        setVerborgenVoorNietEigenaar(true);
        return;
      }
      setLaadFout(klimopFoutTekst(e, lang));
    }
  }, [ctx, lang]);

  useEffect(() => {
    void laden();
  }, [laden]);

  if (verborgenVoorNietEigenaar) return null;

  const startSpiegel = async () => {
    setSpiegelBezig(true);
    setSpiegelFout('');
    setSpiegelUit(null);
    try {
      setSpiegelUit(await klimopSpiegelControleren(ctx, gekozenDienst));
    } catch (e) {
      setSpiegelFout(klimopFoutTekst(e, lang));
    } finally {
      setSpiegelBezig(false);
    }
  };

  const startToets = async () => {
    setToetsBezig(true);
    setToetsFout('');
    setToetsUit(null);
    try {
      setToetsUit(
        await klimopArchitectuurToetsen(ctx, {
          naam:
            voorstelNaam.trim()
            || tr(
              'Перевірка сумісності етапу екосистеми Плющ',
              'Compatibiliteitstoets van het Klimop-ecosysteem',
            ),
          fase: 12,
          raaktProductieDirectZonderGoedkeuring: false,
          gebruikStandaardBewijsVoorOntbrekendeVragen: true,
        }),
      );
    } catch (e) {
      setToetsFout(klimopFoutTekst(e, lang));
    } finally {
      setToetsBezig(false);
    }
  };

  const aanwezigeModules = overzicht?.kernModules.filter((m) => m.aanwezig).length ?? 0;

  return (
    <section className='ag-blok' id='orch-klimop' aria-labelledby='orch-klimop-titel' data-klimop-paneel='1'>
      <header className='ag-blok-kop'>
        <h3 className='ag-blok-titel' id='orch-klimop-titel'>
          <Network aria-hidden='true' />{' '}
          {tr('Екосистема «Плющ» та дзеркальна звірка служб', 'Ecosysteem «Klimop» en spiegelverificatie van diensten')}{' '}
          <HulpVraag k='klimop.overzicht' lang={lang} />
        </h3>
        <div className='ag-knoppen'>
          <Knop
            onClick={() => void laden()}
            icoon={<RefreshCw />}
            title={tr(
              'Перечитати контрольні відбитки модулів ядра та стан одинадцяти служб',
              'De controle-afdrukken van de kernmodules en de status van de elf diensten opnieuw lezen',
            )}
            data='klimop-vernieuw'
          >
            {tr('Звірити ядро', 'Kern verifiëren')}
          </Knop>
        </div>
        <p className='ag-blok-uitleg'>
          {tr(
            'Жива готовність дванадцяти модулів ядра, корінь Меркла пакета відтворення «Насіння» та безризикова перевірка Сходинки 1 розділу 35 без втручання в робочу базу даних.',
            'Actuele gereedheid van de twaalf kernmodules, de Merkle-wortel van het Zaadpakket en risicoloze Stap-1-verificatie van hoofdstuk 35 zonder ingreep in de draaiende databank.',
          )}
        </p>
      </header>

      {laadFout ? (
        <p className='ag-fout' role='alert'>
          {laadFout}
        </p>
      ) : null}

      {!overzicht && !laadFout ? (
        <p className='bsl-stil'>
          <Loader2 size={14} className='bsl-spin' aria-hidden='true' />{' '}
          {tr('Перевірка модулів екосистеми «Плющ»…', 'Modules van ecosysteem «Klimop» controleren…')}
        </p>
      ) : null}

      {overzicht?.bron.aanwezig ? (
        <div className='orch-grid' data-klimop-samenvatting='1'>
          <div className='orch-kv'>
            <small>{tr('Модулі ядра «Насіння»', 'Kernmodules van «Zaden»')}</small>
            <b>
              {aanwezigeModules} / {overzicht.kernModules.length}{' '}
              <Badge toon={aanwezigeModules === 12 ? 'ok' : 'warn'}>
                {aanwezigeModules === 12 ? tr('усі 12 цілісні', 'alle 12 integer') : tr('неповний набір', 'onvolledig')}
              </Badge>
            </b>
            <code title={overzicht.zaadMerkleWortelSha256 ?? ''}>
              Merkle {kort(overzicht.zaadMerkleWortelSha256)}…
            </code>
          </div>

          <div className='orch-kv'>
            <small>{tr('Засади розділу 46 і документи розділу 44', 'Pijlers van §46 en documenten van §44')}</small>
            <b>
              {overzicht.eindvisie46 ? (
                <Badge toon={overzicht.eindvisie46.ok ? 'ok' : 'warn'}>
                  {tr(
                    `${overzicht.eindvisie46.gedektePijlers}/12 засад · ${overzicht.eindvisie46.voltooideDocumenten44}/25 документів`,
                    `${overzicht.eindvisie46.gedektePijlers}/12 pijlers · ${overzicht.eindvisie46.voltooideDocumenten44}/25 documenten`,
                  )}
                </Badge>
              ) : (
                '—'
              )}
            </b>
            {overzicht.dossier ? (
              <small>
                {tr(
                  `досьє: ${overzicht.dossier.actieveMogelijkheden} активних можливостей, ${overzicht.dossier.verlorenMogelijkheden} втрачених`,
                  `dossier: ${overzicht.dossier.actieveMogelijkheden} actieve mogelijkheden, ${overzicht.dossier.verlorenMogelijkheden} verloren`,
                )}
              </small>
            ) : null}
          </div>

          <div className='orch-kv'>
            <small>{tr('Робоча база даних та 11 служб', 'Productiedatabank en 11 diensten')}</small>
            <b>
              <Badge toon='ok'>{tr('недоторканна основа', 'onaangetaste basis')}</Badge>
            </b>
            <small>
              {tr(
                `${overzicht.diensten.length} служб готові до паралельної звірки Сходинки 1`,
                `${overzicht.diensten.length} diensten gereed voor parallelle Stap-1-spiegelverificatie`,
              )}
            </small>
          </div>
        </div>
      ) : null}

      <div className='ag-formrij' data-klimop-spiegel='1'>
        <label className='bsl-veld bsl-groei'>
          <span>
            {tr('Служба для дзеркальної перевірки (Сходинка 1, розділ 35)', 'Dienst voor spiegelverificatie (Stap 1, hoofdstuk 35)')}{' '}
            <HulpVraag k='klimop.spiegel' lang={lang} />
          </span>
          <select
            value={gekozenDienst}
            disabled={spiegelBezig}
            data-hulp='klimop.spiegel'
            data-klimop-veld='dienst'
            onChange={(e) => setGekozenDienst(e.target.value as KlimopDienstId)}
          >
            {KLIMOP_ELF_DIENSTEN.map((d) => (
              <option key={d} value={d}>
                {lang === 'uk' ? KLIMOP_DIENST_TEKST[d].uk : KLIMOP_DIENST_TEKST[d].nl} ({d})
              </option>
            ))}
          </select>
        </label>
        <Knop
          toon='primary'
          icoon={<ShieldCheck />}
          bezig={spiegelBezig}
          onClick={() => void startSpiegel()}
          title={tr(
            'Перевірити в пам’яті ізоляцію служби, відновлення Ріда–Соломона після втрати двох смуг та злиття станів без змін бази даних',
            'In het geheugen dienstisolatie, Reed-Solomon-herstel na verlies van twee stroken en statensamenvoeging toetsen zonder wijziging van de databank',
          )}
          data='klimop-spiegel-start'
        >
          {tr('Перевірити Сходинку 1', 'Stap 1 toetsen')}
        </Knop>
      </div>

      {spiegelFout ? (
        <p className='ag-fout' role='alert'>
          {spiegelFout}
        </p>
      ) : null}

      {spiegelUit ? (
        <div className={`ag-kaart${spiegelUit.ok ? ' ag-vers' : ' ag-waarschuwing'}`} data-klimop-spiegel-uitkomst={spiegelUit.ok ? 'ok' : 'fout'}>
          <p>
            <CheckCircle2 size={15} aria-hidden='true' />{' '}
            <b>
              {spiegelUit.ok
                ? tr('Дзеркальна звірка Сходинки 1 успішна', 'Spiegelverificatie van Stap 1 geslaagd')
                : tr('Виявлено розбіжність у перевірці', 'Afwijking gevonden bij spiegelverificatie')}
            </b>{' '}
            · {lang === 'uk' ? KLIMOP_DIENST_TEKST[spiegelUit.dienstId].uk : KLIMOP_DIENST_TEKST[spiegelUit.dienstId].nl}
          </p>
          <Tech
            rijen={[
              [tr('Ізольований псевдонім служби', 'Geïsoleerd dienstpseudoniem'), <code>{spiegelUit.geisoleerdeDienstPsid}</code>],
              [
                tr('Коди Ріда та Соломона (4+2)', 'Reed-Solomon-codering (4+2)'),
                spiegelUit.reedSolomon.hersteldNaUitvalVanTweeStrepen && spiegelUit.reedSolomon.inhoudSha256Gelijk
                  ? tr('відновлено після втрати 2 із 6 смуг (0 байт втрат)', 'hersteld na uitval van 2 van 6 stroken (0 bytes verlies)')
                  : tr('помилка відновлення', 'herstelfout'),
              ],
              [
                tr('Безконфліктне злиття та ізоляція між службами', 'Conflictvrije samenvoeging en kruisdienstisolatie'),
                spiegelUit.crdtSamenvoegingOk && spiegelUit.kruisDienstIsolatieAfgedwongen
                  ? tr('підтверджено (чужий ключ відхилено)', 'bevestigd (vreemde sleutel geweigerd)')
                  : tr('не пройдено', 'niet geslaagd'),
              ],
              [
                tr('Поточний режим робочої бази', 'Huidige modus productiedatabank'),
                lang === 'uk'
                  ? KLIMOP_OVERDRACHT_TEKST[spiegelUit.overdrachtBesluit.huidigeProductieModus].uk
                  : KLIMOP_OVERDRACHT_TEKST[spiegelUit.overdrachtBesluit.huidigeProductieModus].nl,
              ],
              [
                tr('Перевірена готовність сходинки', 'Gevalideerde proefmodus'),
                lang === 'uk'
                  ? KLIMOP_OVERDRACHT_TEKST[spiegelUit.overdrachtBesluit.gevalideerdeProefModus].uk
                  : KLIMOP_OVERDRACHT_TEKST[spiegelUit.overdrachtBesluit.gevalideerdeProefModus].nl,
              ],
            ]}
          />
        </div>
      ) : null}

      <div className='ag-formrij' data-klimop-toets='1'>
        <label className='bsl-veld bsl-groei'>
          <span>
            {tr('Назва пропозиції для 15-пунктової архітектурної перевірки (розділи 42–43)', 'Naam van voorstel voor 15-punten-architectuurtoets (hoofdstukken 42–43)')}{' '}
            <HulpVraag k='klimop.toets' lang={lang} />
          </span>
          <input
            type='text'
            value={voorstelNaam}
            maxLength={200}
            disabled={toetsBezig}
            placeholder={tr('Наприклад: безпечне підключення вузла перевірки', 'Bijvoorbeeld: veilige koppeling van verificatieknooppunt')}
            onChange={(e) => setVoorstelNaam(e.target.value)}
            data-klimop-veld='voorstel'
          />
        </label>
        <Knop
          icoon={<CheckCircle2 />}
          bezig={toetsBezig}
          onClick={() => void startToets()}
          data='klimop-toets-start'
        >
          {tr('Перевірити за 15 питаннями', 'Aan 15 vragen toetsen')}
        </Knop>
      </div>

      {toetsFout ? (
        <p className='ag-fout' role='alert'>
          {toetsFout}
        </p>
      ) : null}

      {toetsUit ? (
        <div className={`ag-kaart${toetsUit.goedgekeurd ? ' ag-vers' : ' ag-waarschuwing'}`} data-klimop-toets-uitkomst={toetsUit.goedgekeurd ? 'ok' : 'fout'}>
          <p>
            <b>
              {toetsUit.goedgekeurd
                ? tr('Усі 15 питань архітектурної перевірки виконано', 'Aan alle 15 architectuurvragen voldaan')
                : tr('Виявлено порушення архітектурних правил', 'Schending van architectuurregels vastgesteld')}
            </b>{' '}
            · {toetsUit.naam}
          </p>
          <p className='ag-meta'>
            {tr(
              `Перевірено питань: ${toetsUit.beoordeeldeVragen}/15 · Будь-яка реальна зміна потребує окремого рішення власника або кворуму.`,
              `Getoetste vragen: ${toetsUit.beoordeeldeVragen}/15 · Elke echte doorvoering vereist een afzonderlijk besluit van eigenaar of quorum.`,
            )}
          </p>
        </div>
      ) : null}
    </section>
  );
}
