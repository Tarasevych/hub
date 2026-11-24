// Картка події «Пульта уваги, спокою та дії» з горизонтальним змахом, фірмовими логотипами з src/merk/,
// семантичними маркерами файлів, радіусом дії мандата ШІ, печаткою ядра «Плющ» та умовним відкладенням (MELDPANEEL-002).
// Захищає нові критичні сповіщення безпеки від випадкового прибирання змахом.

import { Suspense, lazy, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Archive,
  BellDot,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  ExternalLink,
  KeyRound,
  Paperclip,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Zap,
} from 'lucide-react';
import { MELDING_SCHEMAS, type MeldingNiveau } from '../../../shared/meldingen-catalogus';
import {
  evalueerVeeg,
  prioriteitLabel,
  veiligeMeldingUrl,
  type AiAanbiederKeuze,
  type BijlageWeergaveVoorkeur,
  type MeldingActie,
  type MeldingAiSamenvatting,
  type MeldingEcosysteemGebeurtenis,
  type MeldingEcosysteemProfiel,
  type MeldingGebeurtenisStatus,
  type VeegActie,
} from '../../../shared/meldingen-ecosysteem';
import {
  subdomeinMenselijkLabel,
  verrijkGebeurtenisVoorPuls,
  type VoorwaardelijkUitstelSoort,
} from '../../../shared/meldingen-puls/kern';
import { voerPaginaSignaalActieUit } from '../../canoniek-meldingen';
import IcoonActieKnop from '../IcoonActieKnop';
import {
  PulsBestandChip,
  PulsBronTeken,
  PulsKlimopZegel,
  PulsMandaatStraalBlok,
  PulsUitstelMenu,
} from '../puls/PulsVisueelAnker';
import MeldingAiPaneel from './MeldingAiPaneel';
import MeldingBijlageSpeler from './MeldingBijlageSpeler';
import { useVlag } from '../../functievlag-lezen';
import { WEERGAVE_VLAG } from '../../bijlage-weergave/soort';

export type PulsKaartStaat = 'goed' | 'let' | 'fout' | 'neutraal';

/** Прибирає початкові службові емодзі стану з відображуваного заголовка, бо поруч уже стоїть офіційний знак із реєстру src/merk/. */
export function schoonKaartTitel(titel: string): string {
  const schoon = titel
    .replace(/^(?:[\u2705\u26A0\u26D4\u2757\u{1F6A8}\u{1F4CD}\u{1F5BC}\u{1F514}\u{1F512}\u{1F511}]\uFE0F?\s*)+/u, '')
    .trim();
  return schoon || titel;
}

/** Визначає семантичний колір стану картки (--staat-goed, --staat-let, --staat-fout) за змістом події та рівнем. */
export function bepaalKaartStaat(
  geb: Pick<MeldingEcosysteemGebeurtenis, 'titel' | 'bericht' | 'prioriteit' | 'status'>,
  niveau: MeldingNiveau,
): PulsKaartStaat {
  const ruw = `${geb.titel} ${geb.bericht}`;
  const zonderOntkenning = ruw.replace(
    /(?:без\s+(?:помилок|помилки|збоїв|збою|тривог)|zonder\s+(?:fout(?:en)?|storing(?:en)?)|geen\s+(?:fout(?:en)?|storing(?:en)?))/giu,
    ' ',
  );
  const heeftFoutWoord =
    /(тривога|заблоковано|відхилено|збій|помилка|не працює|недоступн|не вдалося|alarm|geblokkeerd|geweigerd|storing|fout|werkt niet|mislukt)/iu.test(
      zonderOntkenning,
    );
  const heeftHerstelWoord =
    !heeftFoutWoord &&
    /(зв’язок відновлено|знову працює|прив’язано|успішно|виконано|завершено|синхронізовано|verbinding hersteld|werkt weer|gekoppeld|geslaagd|voltooid|gesynchroniseerd)/iu.test(
      ruw,
    );
  if (heeftHerstelWoord || geb.status === 'opgelost') return 'goed';
  if (niveau === 'gevaar' || geb.prioriteit === 'kritiek' || heeftFoutWoord) return 'fout';
  if (niveau === 'besluit' || geb.prioriteit === 'hoog') return 'let';
  return 'neutraal';
}

// SPIL-WEERGAVE етап 4, крок 4.6, НЕ ПЕРЕВІРЕНО (Claude Opus 5.5 (High) через Google Antigravity):
// картка вкладення підвантажується ліниво й лише за ввімкненого прапорця bijlage-weergave-gedeeld-v1;
// поки вона вантажиться (і коли прапорець вимкнений) — чинні значки файлів «Пульта уваги» без змін.
const MeldingKaartLui = lazy(() => import('../../bijlage-weergave/MeldingKaart').then((m) => ({ default: m.MeldingKaart })));

function relatieveTijd(ts: number, lang: 'uk' | 'nl'): string {
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return lang === 'nl' ? 'zojuist' : 'щойно';
  if (min < 60) return lang === 'nl' ? `${min} min` : `${min} хв`;
  const uren = Math.floor(min / 60);
  if (uren < 24) return lang === 'nl' ? `${uren} u` : `${uren} год`;
  const dagen = Math.floor(uren / 24);
  return lang === 'nl' ? `${dagen} d` : `${dagen} дн`;
}

function tijdVolledig(ts: number, lang: 'uk' | 'nl'): string {
  return new Date(ts).toLocaleString(lang === 'nl' ? 'nl-BE' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' });
}

function duurTekst(ms: number, lang: 'uk' | 'nl'): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return lang === 'nl' ? `${sec} s` : `${sec} с`;
  const min = Math.floor(sec / 60);
  const restSec = sec % 60;
  if (min < 60) return lang === 'nl' ? `${min} min${restSec ? ` ${restSec} s` : ''}` : `${min} хв${restSec ? ` ${restSec} с` : ''}`;
  const uren = Math.floor(min / 60);
  const restMin = min % 60;
  if (uren < 24) return lang === 'nl' ? `${uren} u${restMin ? ` ${restMin} min` : ''}` : `${uren} год${restMin ? ` ${restMin} хв` : ''}`;
  const dagen = Math.floor(uren / 24);
  const restUren = uren % 24;
  return lang === 'nl' ? `${dagen} d${restUren ? ` ${restUren} u` : ''}` : `${dagen} дн${restUren ? ` ${restUren} год` : ''}`;
}

function veegLabel(actie: VeegActie, lang: 'uk' | 'nl'): string {
  const map: Record<VeegActie, [string, string]> = {
    gelezen: ['Прочитано', 'Gelezen'],
    archief: ['В архів', 'Archiveren'],
    uitstellen: ['На 30 хв', '30 min uitstel'],
    uitklappen: ['Детальніше', 'Uitklappen'],
    geen: ['', ''],
  };
  return lang === 'nl' ? map[actie][1] : map[actie][0];
}

type Props = {
  lang: 'uk' | 'nl';
  gebeurtenis: MeldingEcosysteemGebeurtenis;
  profiel: MeldingEcosysteemProfiel;
  geselecteerd?: boolean;
  standaardOpen?: boolean;
  geforceerdOpen?: boolean;
  bijlageVoorkeur: BijlageWeergaveVoorkeur;
  onSelect?: () => void;
  onStatus: (status: MeldingGebeurtenisStatus, uitstelMinuten?: number) => Promise<void> | void;
  onVoorwaardelijkUitstel?: (soort: VoorwaardelijkUitstelSoort) => void;
  onOntleden: (modus: 'intern' | 'extern', aanbieder?: AiAanbiederKeuze) => Promise<MeldingAiSamenvatting>;
  onOpenBijlageModaal: (index: number) => void;
  onOpenActie?: (actie: MeldingActie) => void;
};

export default function MeldingVeegKaart({
  lang,
  gebeurtenis,
  profiel,
  geselecteerd = false,
  standaardOpen = false,
  geforceerdOpen,
  bijlageVoorkeur,
  onSelect,
  onStatus,
  onVoorwaardelijkUitstel,
  onOntleden,
  onOpenBijlageModaal,
  onOpenActie,
}: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [open, setOpen] = useState(standaardOpen);
  const [aiOpen, setAiOpen] = useState(Boolean(gebeurtenis.aiSamenvatting));
  const [inlineBijlageIdx, setInlineBijlageIdx] = useState<number | null>(null);
  const gedeeldeWeergave = useVlag(WEERGAVE_VLAG, false);
  const [uitstelMenuOpen, setUitstelMenuOpen] = useState(false);
  const [mandaatDuur, setMandaatDuur] = useState<'eenmalig' | '15m'>('eenmalig');
  const [offsetX, setOffsetX] = useState(0);
  const [beschermHint, setBeschermHint] = useState('');
  const [uitvoerBezig, setUitvoerBezig] = useState('');

  useEffect(() => {
    if (typeof geforceerdOpen === 'boolean') setOpen(geforceerdOpen);
  }, [geforceerdOpen]);

  const verrijkt = useMemo(() => verrijkGebeurtenisVoorPuls(gebeurtenis, lang), [gebeurtenis, lang]);

  const sleep = useRef<{
    actief: boolean;
    id: number;
    startX: number;
    startY: number;
    laatsteDx: number;
    locked: 'hor' | 'vert' | null;
  }>({ actief: false, id: -1, startX: 0, startY: 0, laatsteDx: 0, locked: null });
  const hintTimerRef = useRef<number | undefined>(undefined);
  const negeerKlikRef = useRef(false);

  useEffect(
    () => () => {
      if (hintTimerRef.current !== undefined) window.clearTimeout(hintTimerRef.current);
    },
    [],
  );

  const veegRegels = profiel.veeg;
  const richting: 'links' | 'rechts' | null = offsetX > 12 ? 'rechts' : offsetX < -12 ? 'links' : null;
  const veegEval = richting ? evalueerVeeg(richting, veegRegels, gebeurtenis) : null;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!veegRegels.actief || e.button > 0) return;
    const doel = e.target as HTMLElement | null;
    if (doel?.closest('button,a,input,select,textarea,audio,video,iframe,[data-geen-veeg]')) return;
    sleep.current = { actief: true, id: e.pointerId, startX: e.clientX, startY: e.clientY, laatsteDx: 0, locked: null };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!sleep.current.actief || sleep.current.id !== e.pointerId) return;
    const dx = e.clientX - sleep.current.startX;
    const dy = e.clientY - sleep.current.startY;
    if (!sleep.current.locked) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        sleep.current.locked = 'vert';
        sleep.current.actief = false;
        return;
      }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        sleep.current.locked = 'hor';
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* не критично */
        }
      }
    }
    if (sleep.current.locked === 'hor') {
      const begrensd = Math.max(-150, Math.min(150, dx));
      sleep.current.laatsteDx = begrensd;
      setOffsetX(begrensd);
    }
  };

  const afrondenVeeg = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!sleep.current.actief || sleep.current.id !== e.pointerId) return;
    const wasHor = sleep.current.locked === 'hor';
    const rawDx = e.type === 'pointercancel' ? sleep.current.laatsteDx : e.clientX - sleep.current.startX;
    const dx = Math.max(-150, Math.min(150, Math.abs(rawDx) > 0 ? rawDx : sleep.current.laatsteDx));
    sleep.current.actief = false;
    sleep.current.locked = null;
    sleep.current.laatsteDx = 0;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ігноруємо */
    }
    setOffsetX(0);
    if (!wasHor) return;
    if (Math.abs(dx) > 12) {
      negeerKlikRef.current = true;
      window.setTimeout(() => {
        negeerKlikRef.current = false;
      }, 150);
    }

    if (Math.abs(dx) < veegRegels.drempelPx) return;
    const kant = dx > 0 ? 'rechts' : 'links';
    const res = evalueerVeeg(kant, veegRegels, gebeurtenis);
    if (!res.uitvoeren) {
      if (res.reden === 'kritiek_beschermd') {
        setBeschermHint(
          t(
            'Критичне сповіщення безпеки не можна змахнути в архів до перегляду.',
            'Kritieke beveiligingsmelding is beschermd tegen per ongeluk archiveren.',
          ),
        );
        if (hintTimerRef.current !== undefined) window.clearTimeout(hintTimerRef.current);
        hintTimerRef.current = window.setTimeout(() => setBeschermHint(''), 3200);
      }
      return;
    }

    if (veegRegels.trilling && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(14);
      } catch {
        /* без вібрації */
      }
    }

    if (res.actie === 'gelezen') void onStatus('gelezen');
    else if (res.actie === 'archief') void onStatus('archief');
    else if (res.actie === 'uitstellen') void onStatus('uitgesteld', 30);
    else if (res.actie === 'uitklappen') setOpen((v) => !v);
  };

  const voerActie = async (actie: MeldingActie) => {
    if (actie.id.startsWith('ps:')) {
      const delen = actie.id.split(':');
      const sigId = delen.slice(1, -1).join(':');
      const actId = delen[delen.length - 1];
      setUitvoerBezig(actie.id);
      try {
        await voerPaginaSignaalActieUit(sigId, actId);
      } finally {
        setUitvoerBezig('');
      }
      return;
    }
    if (actie.soort === 'bijlage') {
      if (gebeurtenis.bijlagen.length) {
        setOpen(true);
        setInlineBijlageIdx(0);
      }
      return;
    }
    if (actie.soort === 'ai') {
      setOpen(true);
      setAiOpen(true);
      return;
    }
    if (actie.soort === 'status' && actie.statusDoel) {
      await onStatus(actie.statusDoel, actie.uitstelMinuten);
      return;
    }
    const veiligeHref = veiligeMeldingUrl(actie.href, 500);
    if (veiligeHref) {
      onOpenActie?.(actie);
      if (typeof window !== 'undefined') window.location.assign(veiligeHref);
    }
  };

  const paginaLink = veiligeMeldingUrl(gebeurtenis.meta?.link, 500) || '';
  const primaireActieHref =
    gebeurtenis.acties.map((a) => veiligeMeldingUrl(a.href, 500)).find(Boolean) || paginaLink;
  const kaartStaat = bepaalKaartStaat(gebeurtenis, verrijkt.niveau);
  const schemaNaam = MELDING_SCHEMAS[verrijkt.schemaId]?.naam[lang === 'nl' ? 1 : 0] || verrijkt.schemaNaam;
  const zichtbareTitel = schoonKaartTitel(gebeurtenis.titel);
  const kortOnderdeel = (() => {
    const Vol = subdomeinMenselijkLabel(gebeurtenis.subdomein, lang);
    const kaart: Partial<Record<string, [string, string]>> = {
      admin: ['Керування', 'Beheer'],
      github: ['GitHub', 'GitHub'],
      hub: ['Простір', 'Ruimte'],
      id: ['Вхід і ключі', 'Toegang'],
      cloud: ['Хмара', 'Cloud'],
      mcp: ['Міст ШІ', 'AI-brug'],
      api: ['Інтеграції', 'API'],
      crm: ['Контакти', 'CRM'],
    };
    const paar = kaart[gebeurtenis.subdomein];
    return paar ? paar[lang === 'nl' ? 1 : 0] : Vol;
  })();

  return (
    <div className='mel-veeg-houder' data-testid={`mel-kaart-${gebeurtenis.id}`}>
      {richting && veegEval && (
        <div
          className={`mel-veeg-achtergrond is-${richting}${veegEval.uitvoeren ? '' : ' is-geblokkeerd'}`}
          aria-hidden='true'
        >
          {veegEval.uitvoeren ? veegLabel(veegEval.actie, lang) : t('Захист безпеки', 'Beveiligingsblokkade')}
        </div>
      )}

      <article
        className={`mel-kaart puls-kaart is-niveau-${verrijkt.niveau} is-staat-${kaartStaat} is-prio-${gebeurtenis.prioriteit} is-status-${gebeurtenis.status}${geselecteerd ? ' is-geselecteerd' : ''}`}
        style={offsetX ? { transform: `translate3d(${offsetX}px, 0, 0)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={afrondenVeeg}
        onPointerCancel={afrondenVeeg}
        onClick={() => {
          if (negeerKlikRef.current) return;
          onSelect?.();
        }}
      >
        <div className='mel-kaart-kop'>
          <PulsBronTeken anker={verrijkt.anker} maat={34} />

          <div className='mel-kaart-hoofd'>
            <div className='mel-kaart-meta puls-meta-slank'>
              <span className='puls-meta-onderdeel' title={subdomeinMenselijkLabel(gebeurtenis.subdomein, lang)}>
                {kortOnderdeel}
              </span>
              <span className='puls-meta-punt' aria-hidden='true'>·</span>
              <span
                className={`puls-schema-chip is-staat-${kaartStaat}`}
                data-puls-schema={verrijkt.schemaId}
                data-puls-staat={kaartStaat}
              >
                {schemaNaam}
              </span>
              {kaartStaat !== 'goed' && gebeurtenis.prioriteit === 'kritiek' && (
                <span className={`mel-prio is-${gebeurtenis.prioriteit}`}>
                  {prioriteitLabel(gebeurtenis.prioriteit, lang)}
                </span>
              )}
              {gebeurtenis.herhalingen > 1 && (
                <span className='mel-herhaling' title={t('Згруповано повторень', 'Gegroepeerde herhalingen')}>
                  ×{gebeurtenis.herhalingen}
                </span>
              )}
              <span className='puls-meta-rechts'>
                {verrijkt.klimopKernZegel && <PulsKlimopZegel lang={lang} compact />}
                <span className='mel-tijd'>{relatieveTijd(gebeurtenis.bijgewerktOp, lang)}</span>
              </span>
            </div>

            <button
              type='button'
              className='mel-kaart-titel-knop'
              aria-expanded={open}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.();
                setOpen((v) => !v);
                if (gebeurtenis.status === 'nieuw') void onStatus('gelezen');
              }}
            >
              <strong>{zichtbareTitel}</strong>
              <ChevronDown className={`mel-pijl-klap${open ? ' is-open' : ''}`} aria-hidden='true' />
            </button>

            {gebeurtenis.contextLabel && !/^[a-z_]+\s*·\s*[a-z_]+$/i.test(gebeurtenis.contextLabel.trim()) && (
              <small className='mel-context'>{gebeurtenis.contextLabel}</small>
            )}
          </div>
        </div>

        {(gebeurtenis.bericht || open) && (
          <p className={`mel-bericht${open ? ' is-vol' : ''}`}>{gebeurtenis.bericht || gebeurtenis.uitleg}</p>
        )}

        {verrijkt.mandaat && gebeurtenis.status !== 'opgelost' && gebeurtenis.status !== 'archief' && (
          <PulsMandaatStraalBlok
            mandaat={verrijkt.mandaat}
            gekozenDuur={mandaatDuur}
            onKiesDuur={setMandaatDuur}
            lang={lang}
          />
        )}

        {beschermHint && (
          <div className='mel-bescherm-hint' role='alert'>
            <ShieldAlert aria-hidden='true' />
            <span>{beschermHint}</span>
          </div>
        )}

        {gebeurtenis.bijlagen.length > 0 && (() => {
          // Спільна дія відкриття для значка файла й картки: розгорнути сповіщення, далі вбудований або модальний переглядач.
          const openBijlage = (idx: number, vanKaart: boolean) => {
            setOpen(true);
            if (bijlageVoorkeur.inlineSpeler) {
              setInlineBijlageIdx((cur) => (cur === idx ? null : idx));
            } else {
              onOpenBijlageModaal(idx);
            }
            // Розділ 7 концепції: «переглянуте зникає з уваги» — з картки (лише за прапорцем) нове сповіщення стає прочитаним,
            // так само як під час розгортання заголовка.
            if (vanKaart && gebeurtenis.status === 'nieuw') void onStatus('gelezen');
          };
          const oudeStrook = (
            <div className='mel-bijlagen-strook' data-geen-veeg='1'>
              {gebeurtenis.bijlagen.map((b, idx) => (
                <PulsBestandChip
                  key={b.id}
                  bijlage={b}
                  lang={lang}
                  actief={inlineBijlageIdx === idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    openBijlage(idx, false);
                  }}
                />
              ))}
            </div>
          );
          if (!gedeeldeWeergave) return oudeStrook;
          return (
            <Suspense fallback={oudeStrook}>
              <div className='mel-bijlagen-kaarten' data-geen-veeg='1'>
                {gebeurtenis.bijlagen.map((b, idx) => (
                  <MeldingKaartLui
                    key={b.id}
                    taal={lang}
                    bijlage={b}
                    actief={inlineBijlageIdx === idx}
                    onOpen={() => openBijlage(idx, true)}
                  />
                ))}
              </div>
            </Suspense>
          );
        })()}

        <div className='mel-kaart-acties puls-kaart-acties' data-geen-veeg='1'>
          {verrijkt.gevolgHint && verrijkt.niveau !== 'gewoon' ? (
            <span className='puls-gevolg-hint'>{verrijkt.gevolgHint}</span>
          ) : null}

          <div className='puls-actie-groep puls-kaart-knoppen-rij'>
            {verrijkt.niveau === 'gevaar' && gebeurtenis.status !== 'opgelost' && gebeurtenis.status !== 'archief' ? (
              <>
                <IcoonActieKnop
                  href={primaireActieHref || undefined}
                  toon='primair-fout'
                  icoon={<ShieldAlert aria-hidden='true' />}
                  label={verrijkt.knoppenPaar?.[0] || t('Це не я', 'Dit was ik niet')}
                  stopPropagatie
                  onClick={primaireActieHref ? undefined : () => setOpen(true)}
                />
                <IcoonActieKnop
                  toon='primair-goed'
                  icoon={<ShieldCheck aria-hidden='true' />}
                  label={verrijkt.knoppenPaar?.[1] || t('Це мій вхід', 'Dit was ik')}
                  stopPropagatie
                  onClick={() => void onStatus('opgelost')}
                />
              </>
            ) : verrijkt.niveau === 'besluit' && gebeurtenis.status !== 'opgelost' && gebeurtenis.status !== 'archief' ? (
              <>
                <IcoonActieKnop
                  icoon={<XCircle aria-hidden='true' />}
                  label={verrijkt.knoppenPaar?.[0] || t('Відхилити', 'Weigeren')}
                  stopPropagatie
                  onClick={() => void onStatus('archief')}
                />
                <IcoonActieKnop
                  href={primaireActieHref || undefined}
                  toon='primair-let'
                  icoon={<KeyRound aria-hidden='true' />}
                  label={verrijkt.knoppenPaar?.[1] || t('Дозволити', 'Toestaan')}
                  stopPropagatie
                  onClick={primaireActieHref ? undefined : () => void onStatus('opgelost')}
                />
              </>
            ) : (
              <>
                {gebeurtenis.acties
                  .filter((a) => a.soort === 'api' || (a.soort === 'navigeer' && Boolean(veiligeMeldingUrl(a.href, 500))))
                  .slice(0, 2)
                  .map((actie) => {
                    const veiligeHref = veiligeMeldingUrl(actie.href, 500);
                    const actieLabel = lang === 'nl' ? actie.labelNl : actie.labelUk;
                    return veiligeHref ? (
                      <IcoonActieKnop
                        key={actie.id}
                        href={veiligeHref}
                        icoon={<ExternalLink aria-hidden='true' />}
                        label={actieLabel}
                        stopPropagatie
                      />
                    ) : (
                      <IcoonActieKnop
                        key={actie.id}
                        toon='primair-let'
                        disabled={uitvoerBezig === actie.id}
                        icoon={<Zap aria-hidden='true' />}
                        label={actieLabel}
                        stopPropagatie
                        onClick={() => void voerActie(actie)}
                      />
                    );
                  })}

                {!gebeurtenis.acties.some((a) => a.href) && paginaLink && (
                  <IcoonActieKnop
                    href={paginaLink}
                    icoon={<ExternalLink aria-hidden='true' />}
                    label={t('Перейти до сторінки', 'Pagina openen')}
                    stopPropagatie
                  />
                )}

                {gebeurtenis.bijlagen.length > 1 && inlineBijlageIdx === null && (
                  <IcoonActieKnop
                    icoon={<Paperclip aria-hidden='true' />}
                    teller={gebeurtenis.bijlagen.length}
                    label={t('Переглянути всі вкладення', 'Alle bijlagen bekijken')}
                    stopPropagatie
                    onClick={() => {
                      setOpen(true);
                      setInlineBijlageIdx(0);
                    }}
                  />
                )}
              </>
            )}

            <IcoonActieKnop
              toon={aiOpen ? 'actief' : 'standaard'}
              icoon={<Bot aria-hidden='true' />}
              label={t('Швидкий розбір ШІ', 'Snelle AI-duiding')}
              aria-pressed={aiOpen}
              stopPropagatie
              data-qa-id='puls-kaart-ai'
              onClick={() => {
                setOpen(true);
                setAiOpen((v) => !v);
              }}
            />

            {gebeurtenis.status !== 'opgelost' && gebeurtenis.status !== 'archief' ? (
              <>
                {kaartStaat !== 'goed' && (
                  <div className='puls-uitstel-anker'>
                    <IcoonActieKnop
                      toon={uitstelMenuOpen ? 'actief' : 'standaard'}
                      icoon={<Clock3 aria-hidden='true' />}
                      label={t('Відкласти за умовою або часом', 'Uitstellen op voorwaarde of tijd')}
                      ariaLabel={t('Розумне відкладення за умовою', 'Slim voorwaardelijk uitstel')}
                      aria-expanded={uitstelMenuOpen}
                      stopPropagatie
                      onClick={() => {
                        if (onVoorwaardelijkUitstel) {
                          setUitstelMenuOpen((v) => !v);
                        } else {
                          void onStatus('uitgesteld', 30);
                        }
                      }}
                    />
                    {uitstelMenuOpen && onVoorwaardelijkUitstel ? (
                      <PulsUitstelMenu
                        lang={lang}
                        doelSubdomein={gebeurtenis.subdomein}
                        onKies={(soort) => {
                          setUitstelMenuOpen(false);
                          onVoorwaardelijkUitstel(soort);
                        }}
                      />
                    ) : null}
                  </div>
                )}

                {kaartStaat === 'goed' && gebeurtenis.status === 'nieuw' ? (
                  <IcoonActieKnop
                    icoon={<Check aria-hidden='true' />}
                    label={t('Позначити прочитаним', 'Als gelezen markeren')}
                    stopPropagatie
                    onClick={() => void onStatus('gelezen')}
                  />
                ) : (
                  <IcoonActieKnop
                    icoon={<CheckCheck aria-hidden='true' />}
                    label={t('Позначити виконаним', 'Als opgelost markeren')}
                    stopPropagatie
                    onClick={() => void onStatus('opgelost')}
                  />
                )}

                <IcoonActieKnop
                  icoon={<Archive aria-hidden='true' />}
                  label={t('Перенести в архів', 'Archiveren')}
                  stopPropagatie
                  onClick={() => void onStatus('archief')}
                />
              </>
            ) : gebeurtenis.status === 'opgelost' ? (
              <IcoonActieKnop
                icoon={<RotateCcw aria-hidden='true' />}
                label={t('Знову відкрити', 'Opnieuw openen')}
                data-mel-heropenen='1'
                stopPropagatie
                onClick={() => void onStatus('nieuw')}
              />
            ) : (
              <IcoonActieKnop
                icoon={<RotateCcw aria-hidden='true' />}
                label={t('Повернути з архіву', 'Uit archief terugzetten')}
                stopPropagatie
                onClick={() => void onStatus('gelezen')}
              />
            )}

            {gebeurtenis.status === 'gelezen' && (
              <IcoonActieKnop
                icoon={<BellDot aria-hidden='true' />}
                label={t('Позначити як непрочитане', 'Als ongelezen markeren')}
                data-mel-ongelezen='1'
                stopPropagatie
                onClick={() => void onStatus('nieuw')}
              />
            )}
          </div>
        </div>

        {open && (
          <div className='mel-kaart-details' data-geen-veeg='1'>
            {/* Прогресивне розкриття значків-питань X4 — не захаращує картку в закритому стані */}
            <div className='puls-x4-emblemen' data-puls-x4={verrijkt.schemaId}>
              {verrijkt.emblemen.map((emb) => (
                <div key={emb.vraag} className='puls-x4-cel'>
                  <small>{emb.vraag}</small>
                  <strong>{emb.waarde}</strong>
                </div>
              ))}
            </div>

            {(gebeurtenis.herhalingen > 1 || gebeurtenis.bijgewerktOp - gebeurtenis.aangemaaktOp >= 1000) && (
              <p className='mel-tijden-samenvatting' data-mel-verloop-tijden='1'>
                <Clock3 aria-hidden='true' />
                {t('Перша поява', 'Eerste keer')}: {tijdVolledig(gebeurtenis.aangemaaktOp, lang)}
                {' · '}
                {t('Остання поява', 'Laatste keer')}: {tijdVolledig(gebeurtenis.bijgewerktOp, lang)}
                {gebeurtenis.bijgewerktOp - gebeurtenis.aangemaaktOp >= 1000
                  ? ` · ${t('Тривалість', 'Duur')}: ${duurTekst(gebeurtenis.bijgewerktOp - gebeurtenis.aangemaaktOp, lang)}`
                  : ''}
                {gebeurtenis.herhalingen > 1 ? ` · ×${gebeurtenis.herhalingen}` : ''}
              </p>
            )}
            {gebeurtenis.uitleg && gebeurtenis.uitleg !== gebeurtenis.bericht && (
              <pre className='mel-uitleg-blok'>{gebeurtenis.uitleg}</pre>
            )}

            {inlineBijlageIdx !== null && gebeurtenis.bijlagen[inlineBijlageIdx] && (
              <MeldingBijlageSpeler
                lang={lang}
                bijlagen={gebeurtenis.bijlagen}
                actieveIndex={inlineBijlageIdx}
                voorkeur={bijlageVoorkeur}
                onSelectIndex={setInlineBijlageIdx}
                onSluiten={() => setInlineBijlageIdx(null)}
                onToggleModaal={() => onOpenBijlageModaal(inlineBijlageIdx)}
                contextActies={/* SPIL-WEERGAVE етап 4, НЕ ПЕРЕВІРЕНО (Claude Opus 5.5 (High) через Antigravity): дії сповіщення в спільній шапці; діють лише з увімкненим прапорцем bijlage-weergave-gedeeld-v1 */ [
                  ...(gebeurtenis.status === 'nieuw'
                    ? [{ sleutel: 'gelezen', label: ['Прочитано', 'Gelezen'] as [string, string], icoon: Check, zichtbaar: true, toon: 'goed' as const, uitvoeren: () => void onStatus('gelezen') }]
                    : []),
                  ...gebeurtenis.acties
                    .filter((a) => a.soort === 'api')
                    .slice(0, 1)
                    .map((a) => ({ sleutel: `actie:${a.id}`, label: [a.labelUk, a.labelNl] as [string, string], icoon: Zap, zichtbaar: true, uitvoeren: () => void voerActie(a) })),
                ]}
              />
            )}

            {gebeurtenis.bijlagen.length > 0 && inlineBijlageIdx === null && (
              <button type='button' className='mel-knop mel-knop-zacht' onClick={() => onOpenBijlageModaal(0)}>
                <Paperclip aria-hidden='true' />
                <span>{t('Відкрити переглядач вкладень', 'Bijlageweergave openen')}</span>
              </button>
            )}

            {aiOpen && (
              <MeldingAiPaneel
                lang={lang}
                gebeurtenis={gebeurtenis}
                aiInstelling={profiel.ai}
                onOntleden={(modus, aanbieder) => onOntleden(modus, aanbieder)}
              />
            )}
          </div>
        )}
      </article>
    </div>
  );
}
