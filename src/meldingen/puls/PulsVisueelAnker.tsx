// Система мінімалістичних візуальних маркерів «Пульта уваги, спокою та дії» (MELDPANEEL-002).
// Використовує виключно офіційний реєстр логотипів src/merk/Merk.tsx (REESTR-LOGO-001) у парі з чіткими
// семантичними векторними піктограмами lucide-react та мікрокольорами для миттєвого сприйняття й підтримки розсіяної уваги.

import {
  Archive,
  Ban,
  Bell,
  Calendar,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock3,
  Cloud,
  Contact,
  Cpu,
  FileArchive,
  FileAudio,
  FileCode2,
  FileDiff,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FolderOpen,
  GitBranch,
  Home,
  KeyRound,
  Laptop,
  Mail,
  Network,
  Paperclip,
  Puzzle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Zap,
} from 'lucide-react';
import {
  classificeerBijlage,
  formaatGrootte,
  type MeldingBijlage,
  type MeldingSubdomein,
  type OntvangstStaat,
} from '../../../shared/meldingen-ecosysteem';
import {
  bestandVisueelAnker,
  uitstelKeuzeLabel,
  type PulsIcoonSoort,
  type PulsKleurToon,
  type PulsMandaatStraal,
  type PulsVisueelAnker as PulsAnkerData,
  type Taal,
  type VoorwaardelijkUitstelSoort,
} from '../../../shared/meldingen-puls/kern';
import Merk from '../../merk/Merk';
import MerkLogo from '../../merk/MerkLogo';

export function PulsIcoon({ soort, className }: { soort: PulsIcoonSoort; className?: string }) {
  if (soort === 'schild-alarm') return <ShieldAlert className={className} aria-hidden='true' />;
  if (soort === 'schild-ok') return <ShieldCheck className={className} aria-hidden='true' />;
  if (soort === 'sleutel') return <KeyRound className={className} aria-hidden='true' />;
  if (soort === 'post') return <Mail className={className} aria-hidden='true' />;
  if (soort === 'wolk') return <Cloud className={className} aria-hidden='true' />;
  if (soort === 'agenda') return <Calendar className={className} aria-hidden='true' />;
  if (soort === 'ai') return <Sparkles className={className} aria-hidden='true' />;
  if (soort === 'keten') return <Network className={className} aria-hidden='true' />;
  if (soort === 'huis') return <Home className={className} aria-hidden='true' />;
  if (soort === 'code') return <GitBranch className={className} aria-hidden='true' />;
  if (soort === 'laptop') return <Laptop className={className} aria-hidden='true' />;
  if (soort === 'puzzel') return <Puzzle className={className} aria-hidden='true' />;
  if (soort === 'systeem') return <Cpu className={className} aria-hidden='true' />;
  return <Bell className={className} aria-hidden='true' />;
}

export function PulsBronTeken({
  anker,
  maat = 34,
}: {
  anker: PulsAnkerData;
  maat?: number;
}) {
  return (
    <span className={`puls-bron-teken is-toon-${anker.toon}`} style={{ width: maat, height: maat }} aria-hidden='true'>
      {anker.merkSleutel ? (
        <MerkLogo id={anker.merkSleutel} logo={anker.merkSleutel} naam={anker.label} maat={Math.round(maat * 0.76)} />
      ) : (
        <PulsIcoon soort={anker.icoon} />
      )}
    </span>
  );
}

export function PulsDienstChip({
  merkSleutel,
  icoon,
  toon,
  label,
  sub,
  toonIcoon = true,
  titelHint,
}: {
  merkSleutel: string | null;
  icoon: PulsIcoonSoort;
  toon: PulsKleurToon;
  label: string;
  sub?: string;
  toonIcoon?: boolean;
  titelHint?: string;
}) {
  return (
    <span className={`puls-dienst-chip is-toon-${toon}`} title={titelHint}>
      {toonIcoon ? (
        merkSleutel ? (
          <MerkLogo id={merkSleutel} logo={merkSleutel} naam={label} maat={14} />
        ) : (
          <PulsIcoon soort={icoon} />
        )
      ) : null}
      <strong className='puls-dienst-naam'>{label}</strong>
      {sub ? <small className='puls-dienst-sub'>{sub}</small> : null}
    </span>
  );
}

function BestandFormaatIcoon({ icoon }: { icoon: ReturnType<typeof bestandVisueelAnker>['icoon'] }) {
  if (icoon === 'tabel') return <FileSpreadsheet aria-hidden='true' />;
  if (icoon === 'pdf') return <FileText aria-hidden='true' />;
  if (icoon === 'beeld') return <FileImage aria-hidden='true' />;
  if (icoon === 'geluid') return <FileAudio aria-hidden='true' />;
  if (icoon === 'video') return <FileVideo aria-hidden='true' />;
  if (icoon === 'verschil') return <FileDiff aria-hidden='true' />;
  if (icoon === 'agenda') return <Calendar aria-hidden='true' />;
  if (icoon === 'kaart') return <Contact aria-hidden='true' />;
  if (icoon === 'code') return <FileCode2 aria-hidden='true' />;
  if (icoon === 'archief') return <FileArchive aria-hidden='true' />;
  return <Paperclip aria-hidden='true' />;
}

export function PulsBestandChip({
  bijlage,
  lang = 'uk',
  actief = false,
  onClick,
}: {
  bijlage: MeldingBijlage;
  lang?: Taal;
  actief?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const anker = bestandVisueelAnker(bijlage, lang);
  const info = classificeerBijlage(bijlage);
  return (
    <button
      type='button'
      className={`mel-bijlage-chip puls-bestand-chip is-bestand-${anker.toon}${actief ? ' is-actief' : ''}`}
      onClick={onClick}
    >
      <span className='puls-bestand-icoon' aria-hidden='true'>
        <BestandFormaatIcoon icoon={anker.icoon} />
      </span>
      <span className='puls-bestand-naam'>{bijlage.naam}</span>
      <small className='puls-bestand-meta'>
        <b>{anker.kortLabel || info.label}</b> · {formaatGrootte(bijlage.grootteBytes)}
      </small>
    </button>
  );
}

export function PulsKlimopZegel({ lang, compact = false }: { lang: Taal; compact?: boolean }) {
  return (
    <span
      className={`puls-klimop-zegel${compact ? ' is-compact' : ''}`}
      data-puls-zegel='klimop'
      title={
        lang === 'nl'
          ? 'Klimop-kernzegel · authentieke systeemgebeurtenis uit de beveiligde serverkern van Mijn Ruimte'
          : 'Підпис ядра «Плющ» · достовірна внутрішня подія захищеного ядра системи'
      }
    >
      <ShieldCheck aria-hidden='true' />
      <span className={compact ? 'mr-sr' : undefined}>{lang === 'nl' ? 'Klimop-kernzegel' : 'Підпис ядра «Плющ»'}</span>
    </span>
  );
}

function kortTijdstip(ts: number | null | undefined, lang: Taal): string {
  if (!ts || ts <= 0) return '';
  try {
    return new Date(ts).toLocaleString(lang === 'nl' ? 'nl-BE' : 'uk-UA', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

export function PulsOntvangstVinkjes({
  staat,
  afgeleverdOp,
  gelezenOp,
  autoGearchiveerd = false,
  lang,
}: {
  staat: OntvangstStaat;
  afgeleverdOp?: number | null;
  gelezenOp?: number | null;
  autoGearchiveerd?: boolean;
  lang: Taal;
}) {
  const nl = lang === 'nl';
  const afgTijd = kortTijdstip(afgeleverdOp, lang);
  const gelTijd = kortTijdstip(gelezenOp, lang);
  const filterDeel = autoGearchiveerd
    ? nl
      ? ' · automatisch gearchiveerd via filter'
      : ' · автоматично в архів за фільтром'
    : '';
  const titelTekst =
    staat === 'gelezen'
      ? nl
        ? `Afgeleverd en gelezen${gelTijd ? ` (${gelTijd})` : ''}${filterDeel}`
        : `Доставлено й прочитано${gelTijd ? ` (${gelTijd})` : ''}${filterDeel}`
      : staat === 'afgeleverd'
        ? nl
          ? `Afgeleverd in paneel${afgTijd ? ` (${afgTijd})` : ''}, nog niet bekeken${filterDeel}`
          : `Доставлено в панель${afgTijd ? ` (${afgTijd})` : ''}, ще не прочитано${filterDeel}`
        : nl
          ? `Wacht op aflevering in paneel${filterDeel}`
          : `Очікує доставки в панель користувача${filterDeel}`;

  return (
    <span
      className={`puls-ontvangst-vinkjes is-ontvangst-${staat}${autoGearchiveerd ? ' is-auto-archief' : ''}`}
      data-ontvangst={staat}
      title={titelTekst}
      aria-label={titelTekst}
    >
      {staat === 'gelezen' ? (
        <CheckCheck aria-hidden='true' />
      ) : staat === 'afgeleverd' ? (
        <Check aria-hidden='true' />
      ) : (
        <Clock3 aria-hidden='true' />
      )}
    </span>
  );
}

export function PulsMandaatStraalBlok({
  mandaat,
  gekozenDuur,
  onKiesDuur,
  lang,
}: {
  mandaat: PulsMandaatStraal;
  gekozenDuur: 'eenmalig' | '15m';
  onKiesDuur: (duur: 'eenmalig' | '15m') => void;
  lang: Taal;
}) {
  const t = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  return (
    <div className='puls-mandaat-kader' data-puls-mandaat='1' data-geen-veeg='1' onClick={(e) => e.stopPropagation()}>
      <div className='puls-mandaat-straal'>
        <div className='puls-straal-wel'>
          <span className='puls-straal-kop'>
            <CheckCircle2 aria-hidden='true' />
            <strong>{t('Відкривається доступ', 'Wordt opengesteld')}</strong>
          </span>
          <p>{mandaat.welToegestaan}</p>
        </div>
        <div className='puls-straal-niet'>
          <span className='puls-straal-kop'>
            <Ban aria-hidden='true' />
            <strong>{t('Суворо закрито мандатом', 'Strikt afgeschermd')}</strong>
          </span>
          <p>{mandaat.verbodenDoorMandaat}</p>
        </div>
      </div>

      <div className='puls-mandaat-duur-rij'>
        <span className='puls-mandaat-label'>
          {mandaat.merkSleutel ? <Merk merk={mandaat.merkSleutel} naam={mandaat.agentNaam} maat={15} vorm='rond' /> : <Sparkles aria-hidden='true' />}
          <span>{t('Обсяг дозволу:', 'Mandaatduur:')}</span>
        </span>
        <div className='puls-duur-segment' role='radiogroup' aria-label={t('Обсяг дозволу ШІ', 'Duur van AI-mandaat')}>
          {mandaat.duurOpties.map((opt) => (
            <button
              key={opt.id}
              type='button'
              role='radio'
              aria-checked={gekozenDuur === opt.id}
              className={`puls-duur-knop${gekozenDuur === opt.id ? ' is-actief' : ''}`}
              onClick={() => onKiesDuur(opt.id)}
            >
              {opt.id === 'eenmalig' ? <Zap aria-hidden='true' /> : <Clock3 aria-hidden='true' />}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const UITSTEL_KEUZES: ReadonlyArray<{
  soort: VoorwaardelijkUitstelSoort;
  Icoon: typeof Laptop;
  toon: 'indigo' | 'hemel' | 'smaragd' | 'amber' | 'leisteen';
}> = [
  { soort: 'op_computer', Icoon: Laptop, toon: 'indigo' },
  { soort: 'bij_onderdeel', Icoon: FolderOpen, toon: 'hemel' },
  { soort: 'na_taak', Icoon: ShieldCheck, toon: 'smaragd' },
  { soort: 'morgen_09', Icoon: Sunrise, toon: 'amber' },
  { soort: '30m', Icoon: Clock3, toon: 'leisteen' },
  { soort: '60m', Icoon: Archive, toon: 'leisteen' },
];

export function PulsUitstelMenu({
  lang,
  doelSubdomein,
  onKies,
}: {
  lang: Taal;
  doelSubdomein?: MeldingSubdomein;
  onKies: (soort: VoorwaardelijkUitstelSoort) => void;
}) {
  const t = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  return (
    <div
      className='puls-uitstel-menu'
      role='menu'
      data-geen-veeg='1'
      aria-label={t('Розумне відкладення за умовою', 'Slim voorwaardelijk uitstel')}
      onClick={(e) => e.stopPropagation()}
    >
      <div className='puls-uitstel-kop'>{t('Повернути за умовою або часом', 'Terugbrengen op voorwaarde of tijd')}</div>
      {UITSTEL_KEUZES.map(({ soort, Icoon, toon }) => (
        <button
          key={soort}
          type='button'
          role='menuitem'
          className={`puls-uitstel-optie is-toon-${toon}`}
          onClick={() => onKies(soort)}
        >
          <span className='puls-uitstel-icoon' aria-hidden='true'>
            <Icoon />
          </span>
          <span>{uitstelKeuzeLabel(soort, lang, doelSubdomein)}</span>
        </button>
      ))}
    </div>
  );
}
