// KLIMOP-014 / KLIMOP-015 / KLIMOP-016 / KLIMOP-017 (21.11.2026, Етапи 13–16 впровадження «Плюща» у платформу «Мій простір»):
// Двомовна панель стану живої цифрової екосистеми «Плющ», цілісності пакета «Насіння»,
// Сходинок 1–4 безризикової перевірки всіх 11 служб (§35: дзеркальна звірка, пасивне читання, контрольоване подвійне записування,
// кворумний атестат готовності під печатками FROST RFC 9591 та Ed25519+ML-DSA-65), журналів і миттєвого повернення (§42–§43).
// Вбудована в розділ «Координація» (src/agenten/TabOrch.tsx) за спільним контрактом .ag-blok без власного <style>.

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileText, GitCommit, KeyRound, Loader2, Network, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import type { Tr } from '../mcp-ui';
import HulpVraag from '../hulp/HulpVraag';
import { besluitFoutCode } from '../besluit/besluit-client';
import { KLIMOP_ELF_DIENSTEN, type KlimopDienstId } from '../../shared/klimop/diensten';
import {
  KLIMOP_DIENST_TEKST,
  KLIMOP_DUBBEL_SCHRIJFMODUS_TEKST,
  KLIMOP_LEESMODUS_TEKST,
  KLIMOP_OVERDRACHT_TEKST,
  KLIMOP_QUORUM_ATTESTMODUS_TEKST,
  type KlimopArchitectuurToetsUitkomst,
  type KlimopDubbelLogboekOverzicht,
  type KlimopDubbelSchrijvenUitkomst,
  type KlimopPassieveSpiegelUitkomst,
  type KlimopPlatformOverzicht,
  type KlimopQuorumAttestUitkomst,
  type KlimopQuorumLogboekOverzicht,
  type KlimopSchakelaarActie,
  type KlimopSpiegelControleUitkomst,
  type KlimopSpiegelLogboekOverzicht,
} from '../../shared/klimop-overzicht-model';
import {
  klimopArchitectuurToetsen,
  klimopDubbelLogboekOphalen,
  klimopDubbelSchrijvenUitvoeren,
  klimopFoutTekst,
  klimopOverdrachtSchakelen,
  klimopOverzichtOphalen,
  klimopPassieveSpiegelUitvoeren,
  klimopQuorumAttestUitvoeren,
  klimopQuorumLogboekOphalen,
  klimopSpiegelControleren,
  klimopSpiegelLogboekOphalen,
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
  const [logboek, setLogboek] = useState<KlimopSpiegelLogboekOverzicht | null>(null);
  const [dubbelLogboek, setDubbelLogboek] = useState<KlimopDubbelLogboekOverzicht | null>(null);
  const [quorumLogboek, setQuorumLogboek] = useState<KlimopQuorumLogboekOverzicht | null>(null);
  const [verborgenVoorNietEigenaar, setVerborgenVoorNietEigenaar] = useState(false);
  const [laadFout, setLaadFout] = useState('');
  const [gekozenDienst, setGekozenDienst] = useState<KlimopDienstId>('postvak');
  const [spiegelBezig, setSpiegelBezig] = useState(false);
  const [spiegelUit, setSpiegelUit] = useState<KlimopSpiegelControleUitkomst | null>(null);
  const [spiegelFout, setSpiegelFout] = useState('');

  const [passiefBezig, setPassiefBezig] = useState(false);
  const [passiefUit, setPassiefUit] = useState<KlimopPassieveSpiegelUitkomst | null>(null);
  const [dubbelBezig, setDubbelBezig] = useState(false);
  const [dubbelUit, setDubbelUit] = useState<KlimopDubbelSchrijvenUitkomst | null>(null);
  const [attestBezig, setAttestBezig] = useState(false);
  const [attestUit, setAttestUit] = useState<KlimopQuorumAttestUitkomst | null>(null);
  const [schakelBezig, setSchakelBezig] = useState(false);
  const [passiefMelding, setPassiefMelding] = useState('');
  const [passiefFout, setPassiefFout] = useState('');

  const [voorstelNaam, setVoorstelNaam] = useState('');
  const [toetsBezig, setToetsBezig] = useState(false);
  const [toetsUit, setToetsUit] = useState<KlimopArchitectuurToetsUitkomst | null>(null);
  const [toetsFout, setToetsFout] = useState('');

  const laden = useCallback(async () => {
    setLaadFout('');
    try {
      const [ov, lb, dl, ql] = await Promise.all([
        klimopOverzichtOphalen(ctx),
        klimopSpiegelLogboekOphalen(ctx, { limiet: 8 }),
        klimopDubbelLogboekOphalen(ctx, { limiet: 6 }),
        klimopQuorumLogboekOphalen(ctx, { limiet: 6 }),
      ]);
      setOverzicht(ov);
      setLogboek(lb);
      setDubbelLogboek(dl);
      setQuorumLogboek(ql);
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

  const startPassieveSpiegel = async () => {
    setPassiefBezig(true);
    setPassiefFout('');
    setPassiefMelding('');
    try {
      const uitkomst = await klimopPassieveSpiegelUitvoeren(ctx, {
        dienstId: gekozenDienst,
        steekproefGrootte: 4,
      });
      setPassiefUit(uitkomst);
      setLogboek(await klimopSpiegelLogboekOphalen(ctx, { limiet: 8 }));
    } catch (e) {
      setPassiefFout(klimopFoutTekst(e, lang));
    } finally {
      setPassiefBezig(false);
    }
  };

  const startDubbelSchrijven = async () => {
    setDubbelBezig(true);
    setPassiefFout('');
    setPassiefMelding('');
    try {
      const uitkomst = await klimopDubbelSchrijvenUitvoeren(ctx, {
        dienstId: gekozenDienst,
        operatiesAantal: 4,
      });
      setDubbelUit(uitkomst);
      await laden();
    } catch (e) {
      setPassiefFout(klimopFoutTekst(e, lang));
    } finally {
      setDubbelBezig(false);
    }
  };

  const startQuorumAttest = async () => {
    setAttestBezig(true);
    setPassiefFout('');
    setPassiefMelding('');
    try {
      const uitkomst = await klimopQuorumAttestUitvoeren(ctx, {
        dienstId: gekozenDienst,
      });
      setAttestUit(uitkomst);
      await laden();
    } catch (e) {
      setPassiefFout(klimopFoutTekst(e, lang));
    } finally {
      setAttestBezig(false);
    }
  };

  const bedienSchakelaar = async (actie: KlimopSchakelaarActie) => {
    setSchakelBezig(true);
    setPassiefFout('');
    setPassiefMelding('');
    try {
      const r = await klimopOverdrachtSchakelen(ctx, {
        actie,
        ...(actie === 'nood_terug_alle_elf' ? {} : { dienstId: gekozenDienst }),
      });
      setPassiefMelding(
        actie === 'activeer_passief_lezen'
          ? tr(
              `Пасивне дзеркальне читання Сходинки 2 увімкнено (${r.actievePassiefLezenDiensten}/11 активних).`,
              `Passief spiegellezen van Stap 2 ingeschakeld (${r.actievePassiefLezenDiensten}/11 actief).`,
            )
          : actie === 'activeer_dubbel_schrijven'
            ? tr(
                `Контрольоване подвійне записування Сходинки 3 увімкнено (${r.actieveDubbelSchrijvenDiensten}/11 активних).`,
                `Gecontroleerd dubbel schrijven van Stap 3 ingeschakeld (${r.actieveDubbelSchrijvenDiensten}/11 actief).`,
              )
            : actie === 'bevestig_quorum_gereedheid'
              ? tr(
                  `Кворумну готовність Сходинки 4 підтверджено без вимкнення бази (${r.actieveQuorumGereedDiensten}/11 активних).`,
                  `Quorum-gereedheid van Stap 4 bevestigd zonder uitschakeling van de databank (${r.actieveQuorumGereedDiensten}/11 actief).`,
                )
              : actie === 'nood_terug_alle_elf'
                ? tr(
                    'Усі одинадцять служб миттєво повернено на чинну основу.',
                    'Alle elf diensten zijn onmiddellijk teruggezet naar de bestaande basis.',
                  )
                : tr(
                    'Вибрану службу повернено на чинну основу.',
                    'De gekozen dienst is teruggezet naar de bestaande basis.',
                  ),
      );
      await laden();
    } catch (e) {
      setPassiefFout(klimopFoutTekst(e, lang));
    } finally {
      setSchakelBezig(false);
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
  const gekozenSchakelaar = logboek?.schakelaars.find((s) => s.dienstId === gekozenDienst) ?? null;
  const drukBezig = spiegelBezig || passiefBezig || dubbelBezig || attestBezig || schakelBezig;

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
            'Жива готовність дванадцяти модулів ядра, корінь Меркла пакета відтворення «Насіння» та безризикова перевірка Сходинок 1–4 розділу 35 із криптографічними журналами, кворумними атестатами й миттєвим поверненням без зміни робочої бази даних.',
            'Actuele gereedheid van de twaalf kernmodules, de Merkle-wortel van het Zaadpakket en risicoloze verificatie van Stappen 1–4 van hoofdstuk 35 met cryptografische logboeken, quorumattesten en directe terugval zonder wijziging van de draaiende databank.',
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
            <small>{tr('Сходинки 1–4 та журнали звірки', 'Stappen 1–4 en logboeken')}</small>
            <b>
              <Badge
                toon={
                  overzicht.overdrachtStaat?.ketenIntegriteitOk !== false
                  && overzicht.overdrachtStaat?.dubbelKetenIntegriteitOk !== false
                  && overzicht.overdrachtStaat?.attestKetenIntegriteitOk !== false
                    ? 'ok'
                    : 'warn'
                }
              >
                {tr('недоторканна основа', 'onaangetaste basis')}
              </Badge>
            </b>
            <small>
              {tr(
                `Сходинка 2: ${overzicht.overdrachtStaat?.actievePassiefLezenDiensten ?? 0}/11 · Сходинка 3: ${overzicht.overdrachtStaat?.actieveDubbelSchrijvenDiensten ?? 0}/11 · Сходинка 4: ${overzicht.overdrachtStaat?.actieveQuorumGereedDiensten ?? 0}/11`,
                `Stap 2: ${overzicht.overdrachtStaat?.actievePassiefLezenDiensten ?? 0}/11 · Stap 3: ${overzicht.overdrachtStaat?.actieveDubbelSchrijvenDiensten ?? 0}/11 · Stap 4: ${overzicht.overdrachtStaat?.actieveQuorumGereedDiensten ?? 0}/11`,
              )}
            </small>
          </div>
        </div>
      ) : null}

      <div className='ag-formrij' data-klimop-spiegel='1'>
        <label className='bsl-veld bsl-groei'>
          <span>
            {tr('Служба для дзеркальної перевірки та керування Сходинками 1–4 (розділ 35)', 'Dienst voor spiegelverificatie en beheer van Stappen 1–4 (hoofdstuk 35)')}{' '}
            <HulpVraag k='klimop.spiegel' lang={lang} />
          </span>
          <select
            value={gekozenDienst}
            disabled={drukBezig}
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

      <div className='ag-formrij' data-klimop-passief='1'>
        <div className='bsl-veld bsl-groei'>
          <span>
            {tr('Сходинка 2: пасивне читання, журнал розбіжностей та перемикач миттєвого повернення', 'Stap 2: passief lezen, afwijkingslogboek en directe terugvalsleutel')}{' '}
            <HulpVraag k='klimop.passief' lang={lang} />{' '}
            <HulpVraag k='klimop.schakelaar' lang={lang} />
          </span>
          <small data-hulp='klimop.schakelaar'>
            {gekozenSchakelaar
              ? lang === 'uk'
                ? `${KLIMOP_LEESMODUS_TEKST[gekozenSchakelaar.leesModus].uk} · послідовних чистих звірок: ${gekozenSchakelaar.opeenvolgendeGelijkeControles}`
                : `${KLIMOP_LEESMODUS_TEKST[gekozenSchakelaar.leesModus].nl} · opeenvolgende foutloze controles: ${gekozenSchakelaar.opeenvolgendeGelijkeControles}`
              : tr(
                  'Основним джерелом запису завжди залишається чинна база даних; за будь-якої розбіжності служба повертається миттєво.',
                  'De bestaande databank blijft altijd de schrijfbron; bij elke afwijking valt de dienst direct terug.',
                )}
          </small>
        </div>
        <div className='ag-knoppen'>
          <Knop
            icoon={<FileText />}
            bezig={passiefBezig}
            disabled={schakelBezig || dubbelBezig || attestBezig}
            onClick={() => void startPassieveSpiegel()}
            data='klimop-passief-start'
          >
            {tr('Пасивна звірка Сходинки 2', 'Passieve proef Stap 2')}
          </Knop>
          <Knop
            icoon={<ShieldCheck />}
            bezig={schakelBezig}
            disabled={passiefBezig || dubbelBezig || attestBezig}
            onClick={() => void bedienSchakelaar('activeer_passief_lezen')}
            data='klimop-passief-aan'
          >
            {tr('Увімкнути пасивне читання', 'Passief lezen activeren')}
          </Knop>
          <Knop
            icoon={<RotateCcw />}
            bezig={schakelBezig}
            disabled={passiefBezig || dubbelBezig || attestBezig}
            onClick={() => void bedienSchakelaar('terug_naar_erfenis')}
            data='klimop-passief-terug'
          >
            {tr('Повернути службу', 'Dienst terugzetten')}
          </Knop>
          <Knop
            icoon={<RotateCcw />}
            bezig={schakelBezig}
            disabled={passiefBezig || dubbelBezig || attestBezig}
            onClick={() => void bedienSchakelaar('nood_terug_alle_elf')}
            data='klimop-nood-alle-elf'
          >
            {tr('Повернути всі 11 служб', 'Alle 11 diensten terugzetten')}
          </Knop>
        </div>
      </div>

      <div className='ag-formrij' data-klimop-dubbel='1'>
        <div className='bsl-veld bsl-groei'>
          <span>
            {tr('Сходинка 3: контрольоване подвійне записування зі звіркою читання після запису', 'Stap 3: gecontroleerd dubbel schrijven met onmiddellijke leesverificatie')}{' '}
            <HulpVraag k='klimop.dubbel' lang={lang} />
          </span>
          <small data-hulp='klimop.dubbel'>
            {gekozenSchakelaar
              ? lang === 'uk'
                ? `${KLIMOP_DUBBEL_SCHRIJFMODUS_TEKST[gekozenSchakelaar.schrijfModus].uk} · перевірених циклів: ${gekozenSchakelaar.opeenvolgendeDubbelSchrijfControles}`
                : `${KLIMOP_DUBBEL_SCHRIJFMODUS_TEKST[gekozenSchakelaar.schrijfModus].nl} · geverifieerde cycli: ${gekozenSchakelaar.opeenvolgendeDubbelSchrijfControles}`
              : tr(
                  'Перехід до Сходинки 3 дозволено лише після активної Сходинки 2 та безрозбіжної звірки читання й видалень.',
                  'Opschakelen naar Stap 3 is alleen toegestaan vanuit een actieve Stap 2 na foutloze lees- en wisverificatie.',
                )}
          </small>
        </div>
        <div className='ag-knoppen'>
          <Knop
            icoon={<GitCommit />}
            bezig={dubbelBezig}
            disabled={schakelBezig || passiefBezig || attestBezig}
            onClick={() => void startDubbelSchrijven()}
            data='klimop-dubbel-start'
          >
            {tr('Перевірка подвійного записування Сходинки 3', 'Dubbelschrijfproef Stap 3')}
          </Knop>
          <Knop
            icoon={<ShieldCheck />}
            bezig={schakelBezig}
            disabled={dubbelBezig || passiefBezig || attestBezig}
            onClick={() => void bedienSchakelaar('activeer_dubbel_schrijven')}
            data='klimop-dubbel-aan'
          >
            {tr('Увімкнути подвійне записування', 'Dubbel schrijven activeren')}
          </Knop>
        </div>
      </div>

      <div className='ag-formrij' data-klimop-attest='1'>
        <div className='bsl-veld bsl-groei'>
          <span>
            {tr('Сходинка 4: кворумний атестат готовності (порогова й постквантова печатки без вимкнення бази)', 'Stap 4: quorumattest van gereedheid (drempel- en postkwantumzegel zonder uitschakeling van databank)')}{' '}
            <HulpVraag k='klimop.attest' lang={lang} />
          </span>
          <small data-hulp='klimop.attest'>
            {gekozenSchakelaar
              ? lang === 'uk'
                ? `${KLIMOP_QUORUM_ATTESTMODUS_TEKST[gekozenSchakelaar.attestModus].uk} · чинних атестатів: ${gekozenSchakelaar.opeenvolgendeGeldigeAttesten}`
                : `${KLIMOP_QUORUM_ATTESTMODUS_TEKST[gekozenSchakelaar.attestModus].nl} · geldige attesten: ${gekozenSchakelaar.opeenvolgendeGeldigeAttesten}`
              : tr(
                  'Підтвердження Сходинки 4 вимагає активної Сходинки 3 та чинного атестата без самовільного відокремлення чинної бази.',
                  'Bevestiging van Stap 4 vereist een actieve Stap 3 en een geldig attest zonder loskoppeling van de databank.',
                )}
          </small>
        </div>
        <div className='ag-knoppen'>
          <Knop
            icoon={<KeyRound />}
            bezig={attestBezig}
            disabled={schakelBezig || passiefBezig || dubbelBezig}
            onClick={() => void startQuorumAttest()}
            data='klimop-attest-start'
          >
            {tr('Випустити кворумний атестат Сходинки 4', 'Quorum-attest Stap 4 opstellen')}
          </Knop>
          <Knop
            icoon={<ShieldCheck />}
            bezig={schakelBezig}
            disabled={attestBezig || passiefBezig || dubbelBezig}
            onClick={() => void bedienSchakelaar('bevestig_quorum_gereedheid')}
            data='klimop-attest-aan'
          >
            {tr('Підтвердити кворумну готовність', 'Quorum-gereedheid bevestigen')}
          </Knop>
        </div>
      </div>

      {passiefFout ? (
        <p className='ag-fout' role='alert'>
          {passiefFout}
        </p>
      ) : null}

      {passiefMelding ? (
        <p className='ag-meta' data-klimop-schakel-melding='1'>
          {passiefMelding}
        </p>
      ) : null}

      {passiefUit ? (
        <div className={`ag-kaart${passiefUit.ok ? ' ag-vers' : ' ag-waarschuwing'}`} data-klimop-passief-uitkomst={passiefUit.ok ? 'ok' : 'fout'}>
          <p>
            <b>
              {passiefUit.ok
                ? tr('Пасивна багатоелементна звірка Сходинки 2 без розбіжностей', 'Meervoudige passieve proef van Stap 2 zonder afwijkingen')
                : tr('Виявлено розбіжність — виконано захисне повернення', 'Afwijking vastgesteld — beschermende terugval uitgevoerd')}
            </b>{' '}
            · {kort(passiefUit.logboekRegel.regelSha256)}…
          </p>
          <Tech
            rijen={[
              [
                tr('Перевірено елементів та розбіжності', 'Gecontroleerde elementen en afwijkingen'),
                `${passiefUit.pariteit.totaalGecontroleerd} / ${passiefUit.pariteit.afwijkingen}`,
              ],
              [
                tr('Режим читання після перевірки', 'Leesmodus na controle'),
                lang === 'uk'
                  ? KLIMOP_LEESMODUS_TEKST[passiefUit.schakelaar.leesModus].uk
                  : KLIMOP_LEESMODUS_TEKST[passiefUit.schakelaar.leesModus].nl,
              ],
            ]}
          />
        </div>
      ) : null}

      {dubbelUit ? (
        <div className={`ag-kaart${dubbelUit.ok ? ' ag-vers' : ' ag-waarschuwing'}`} data-klimop-dubbel-uitkomst={dubbelUit.ok ? 'ok' : 'fout'}>
          <p>
            <b>
              {dubbelUit.ok
                ? tr('Подвійне записування та звірка читання Сходинки 3 без розбіжностей', 'Dubbel schrijven en leesverificatie van Stap 3 zonder afwijkingen')
                : tr('Збій подвійного записування — виконано миттєве повернення', 'Fout bij dubbel schrijven — onmiddellijke terugval uitgevoerd')}
            </b>{' '}
            · {kort(dubbelUit.kwitantieRegel.kwitantieSha256)}…
          </p>
          <Tech
            rijen={[
              [
                tr('Незалежний кворум вузлів та операції', 'Onafhankelijk knooppuntenquorum en bewerkingen'),
                `${dubbelUit.knooppunten.regios.join(' / ')} · ${dubbelUit.operaties.totaal} (${dubbelUit.operaties.zetAantal}+${dubbelUit.operaties.bijgewerktAantal}+${dubbelUit.operaties.verwijderTombstoneAantal})`,
              ],
              [
                tr('Режим подвійного записування після звірки', 'Dubbelschrijfmodus na controle'),
                lang === 'uk'
                  ? KLIMOP_DUBBEL_SCHRIJFMODUS_TEKST[dubbelUit.schakelaar.schrijfModus].uk
                  : KLIMOP_DUBBEL_SCHRIJFMODUS_TEKST[dubbelUit.schakelaar.schrijfModus].nl,
              ],
            ]}
          />
        </div>
      ) : null}

      {attestUit ? (
        <div className={`ag-kaart${attestUit.ok ? ' ag-vers' : ' ag-waarschuwing'}`} data-klimop-attest-uitkomst={attestUit.ok ? 'ok' : 'fout'}>
          <p>
            <b>
              {attestUit.ok
                ? tr('Кворумний атестат Сходинки 4 запечатано пороговим і постквантовим підписами', 'Quorumattest van Stap 4 verzegeld met drempel- en postkwantumhandtekening')
                : tr('Атестат Сходинки 4 відхилено — виконано захисне повернення', 'Attest van Stap 4 afgewezen — beschermende terugval uitgevoerd')}
            </b>{' '}
            · {kort(attestUit.attestRegel.attestSha256)}…
          </p>
          <Tech
            rijen={[
              [
                tr('Порогова та постквантова печатки (2/3)', 'Drempel- en postkwantumzegel (2/3)'),
                `${attestUit.knooppunten.regios.join(' / ')} · FROST ${attestUit.drempelZegel.frostVerificatieOk ? 'OK' : 'FOUT'} · ${attestUit.drempelZegel.hybrideAlgoritme} ${attestUit.drempelZegel.hybrideVerificatieOk ? 'OK' : 'FOUT'}`,
              ],
              [
                tr('Режим кворумного атестата (робоча база активна)', 'Quorumattestmodus (productiedatabank actief)'),
                lang === 'uk'
                  ? KLIMOP_QUORUM_ATTESTMODUS_TEKST[attestUit.schakelaar.attestModus].uk
                  : KLIMOP_QUORUM_ATTESTMODUS_TEKST[attestUit.schakelaar.attestModus].nl,
              ],
            ]}
          />
        </div>
      ) : null}

      {quorumLogboek && quorumLogboek.recenteAttesten.length > 0 ? (
        <div className='ag-kaart' data-klimop-quorum-logboek='1'>
          <p>
            <b>{tr('Останні кворумні атестати Сходинки 4', 'Recente quorumattesten van Stap 4')}</b>{' '}
            <Badge toon={quorumLogboek.ketenIntegriteit.ok ? 'ok' : 'warn'}>
              {quorumLogboek.ketenIntegriteit.ok
                ? tr('підписи й ланцюжок дійсні', 'handtekeningen en keten geldig')
                : tr('ланцюжок атестатів пошкоджено', 'attestketen doorbroken')}
            </Badge>
          </p>
          <Tech
            rijen={quorumLogboek.recenteAttesten.slice(0, 3).map((a) => [
              `#${a.volgnummer} · ${a.dienstId}`,
              <code key={a.attestId}>
                {a.frostVerificatieOk && a.hybrideVerificatieOk
                  ? tr('подвійна печатка дійсна', 'dubbel zegel geldig')
                  : tr('відхилено', 'afgewezen')}{' '}
                · {kort(a.attestSha256, 12)}…
              </code>,
            ])}
          />
        </div>
      ) : null}

      {dubbelLogboek && dubbelLogboek.recenteKwitanties.length > 0 ? (
        <div className='ag-kaart' data-klimop-dubbel-logboek='1'>
          <p>
            <b>{tr('Останні квитанції контрольованого подвійного записування', 'Recente kwitanties van gecontroleerd dubbel schrijven')}</b>{' '}
            <Badge toon={dubbelLogboek.ketenIntegriteit.ok ? 'ok' : 'warn'}>
              {dubbelLogboek.ketenIntegriteit.ok
                ? tr('ланцюжок квитанцій цілісний', 'kwitantieketen sluitend')
                : tr('ланцюжок квитанцій пошкоджено', 'kwitantieketen doorbroken')}
            </Badge>
          </p>
          <Tech
            rijen={dubbelLogboek.recenteKwitanties.slice(0, 3).map((k) => [
              `#${k.volgnummer} · ${k.dienstId}`,
              <code key={k.kwitantieId}>
                {k.leesNaSchrijfGelijk ? tr('звірка рівна', 'leesgelijk') : tr('розбіжність', 'afwijking')} · {kort(k.kwitantieSha256, 12)}…
              </code>,
            ])}
          />
        </div>
      ) : null}

      {logboek && logboek.recenteRegels.length > 0 ? (
        <div className='ag-kaart' data-klimop-logboek='1'>
          <p>
            <b>{tr('Останні записи криптографічного журналу звірки', 'Recente regels van het cryptografische spiegellogboek')}</b>{' '}
            <Badge toon={logboek.ketenIntegriteit.ok ? 'ok' : 'warn'}>
              {logboek.ketenIntegriteit.ok
                ? tr('ланцюжок SHA-256 цілісний', 'SHA-256-keten sluitend')
                : tr('ланцюжок пошкоджено', 'keten doorbroken')}
            </Badge>
          </p>
          <Tech
            rijen={logboek.recenteRegels.slice(0, 4).map((r) => [
              `#${r.volgnummer} · ${r.dienstId}`,
              <code key={r.regelId}>
                {r.soort} · {r.afwijkingenAantal === 0 ? tr('0 розбіжностей', '0 afwijkingen') : `${r.afwijkingenAantal}`} · {kort(r.regelSha256, 12)}…
              </code>,
            ])}
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
