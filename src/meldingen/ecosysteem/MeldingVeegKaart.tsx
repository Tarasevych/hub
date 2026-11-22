// Картка події «Пульта уваги, спокою та дії» з горизонтальним змахом, фірмовими логотипами з src/merk/,
// семантичними маркерами файлів, радіусом дії мандата ШІ, печаткою ядра «Плющ» та умовним відкладенням (MELDPANEEL-002).
// Захищає нові критичні сповіщення безпеки від випадкового прибирання змахом.

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Archive,
  BellDot,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  ExternalLink,
  Eye,
  KeyRound,
  Paperclip,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
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
import {
  PulsBestandChip,
  PulsBronTeken,
  PulsIcoon,
  PulsKlimopZegel,
  PulsMandaatStraalBlok,
  PulsUitstelMenu,
} from '../puls/PulsVisueelAnker';
import MeldingAiPaneel from './MeldingAiPaneel';
import MeldingBijlageSpeler from './MeldingBijlageSpeler';

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
        className={`mel-kaart puls-kaart is-niveau-${verrijkt.niveau} is-prio-${gebeurtenis.prioriteit} is-status-${gebeurtenis.status}${geselecteerd ? ' is-geselecteerd' : ''}`}
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
          <PulsBronTeken anker={verrijkt.anker} maat={36} />

          <div className='mel-kaart-hoofd'>
            <div className='mel-kaart-meta'>
              <span className='mel-subdomein-chip puls-onderdeel-chip'>
                <PulsIcoon soort={verrijkt.anker.icoon} />
                <span>{subdomeinMenselijkLabel(gebeurtenis.subdomein, lang)}</span>
              </span>
              <span className='mel-kanaal-naam'>{verrijkt.anker.label}</span>
              {verrijkt.klimopKernZegel && <PulsKlimopZegel lang={lang} />}
              {gebeurtenis.prioriteit !== 'normaal' && gebeurtenis.prioriteit !== 'laag' && (
                <span className={`mel-prio is-${gebeurtenis.prioriteit}`}>
                  {prioriteitLabel(gebeurtenis.prioriteit, lang)}
                </span>
              )}
              {gebeurtenis.herhalingen > 1 && (
                <span className='mel-herhaling' title={t('Згруповано повторень', 'Gegroepeerde herhalingen')}>
                  ×{gebeurtenis.herhalingen}
                </span>
              )}
              <span className='mel-tijd'>{relatieveTijd(gebeurtenis.bijgewerktOp, lang)}</span>
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
              {gebeurtenis.status === 'nieuw' && <i className='mel-nieuw-stip' aria-hidden='true' />}
              <strong>{gebeurtenis.titel}</strong>
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

        {gebeurtenis.bijlagen.length > 0 && (
          <div className='mel-bijlagen-strook' data-geen-veeg='1'>
            {gebeurtenis.bijlagen.map((b, idx) => (
              <PulsBestandChip
                key={b.id}
                bijlage={b}
                lang={lang}
                actief={inlineBijlageIdx === idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(true);
                  if (bijlageVoorkeur.inlineSpeler) {
                    setInlineBijlageIdx((cur) => (cur === idx ? null : idx));
                  } else {
                    onOpenBijlageModaal(idx);
                  }
                }}
              />
            ))}
          </div>
        )}

        <div className='mel-kaart-acties puls-kaart-acties' data-geen-veeg='1'>
          {verrijkt.gevolgHint ? <span className='puls-gevolg-hint'>{verrijkt.gevolgHint}</span> : null}

          <div className='puls-actie-groep'>
            {verrijkt.niveau === 'gevaar' && gebeurtenis.status !== 'opgelost' && gebeurtenis.status !== 'archief' ? (
              <>
                {primaireActieHref ? (
                  <a
                    href={primaireActieHref}
                    className='mel-knop puls-knop-gevaar'
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ShieldAlert aria-hidden='true' />
                    <span>{verrijkt.knoppenPaar?.[0] || t('Це не я', 'Dit was ik niet')}</span>
                  </a>
                ) : (
                  <button
                    type='button'
                    className='mel-knop puls-knop-gevaar'
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(true);
                    }}
                  >
                    <ShieldAlert aria-hidden='true' />
                    <span>{verrijkt.knoppenPaar?.[0] || t('Це не я', 'Dit was ik niet')}</span>
                  </button>
                )}
                <button
                  type='button'
                  className='mel-knop puls-knop-bevestig'
                  onClick={(e) => {
                    e.stopPropagation();
                    void onStatus('opgelost');
                  }}
                >
                  <ShieldCheck aria-hidden='true' />
                  <span>{verrijkt.knoppenPaar?.[1] || t('Це мій вхід', 'Dit was ik')}</span>
                </button>
              </>
            ) : verrijkt.niveau === 'besluit' && gebeurtenis.status !== 'opgelost' && gebeurtenis.status !== 'archief' ? (
              <>
                <button
                  type='button'
                  className='mel-knop mel-knop-zacht'
                  onClick={(e) => {
                    e.stopPropagation();
                    void onStatus('archief');
                  }}
                >
                  <XCircle aria-hidden='true' />
                  <span>{verrijkt.knoppenPaar?.[0] || t('Відхилити', 'Weigeren')}</span>
                </button>
                {primaireActieHref ? (
                  <a
                    href={primaireActieHref}
                    className='mel-knop puls-knop-besluit'
                    onClick={(e) => e.stopPropagation()}
                  >
                    <KeyRound aria-hidden='true' />
                    <span>{verrijkt.knoppenPaar?.[1] || t('Дозволити', 'Toestaan')}</span>
                  </a>
                ) : (
                  <button
                    type='button'
                    className='mel-knop puls-knop-besluit'
                    onClick={(e) => {
                      e.stopPropagation();
                      void onStatus('opgelost');
                    }}
                  >
                    <KeyRound aria-hidden='true' />
                    <span>{verrijkt.knoppenPaar?.[1] || t('Дозволити', 'Toestaan')}</span>
                  </button>
                )}
              </>
            ) : (
              <>
                {gebeurtenis.acties
                  .filter((a) => a.soort === 'api' || (a.soort === 'navigeer' && Boolean(veiligeMeldingUrl(a.href, 500))))
                  .slice(0, 2)
                  .map((actie) => {
                    const veiligeHref = veiligeMeldingUrl(actie.href, 500);
                    return veiligeHref ? (
                      <a key={actie.id} href={veiligeHref} className='mel-knop mel-knop-zacht' onClick={(e) => e.stopPropagation()}>
                        <ExternalLink aria-hidden='true' />
                        <span>{lang === 'nl' ? actie.labelNl : actie.labelUk}</span>
                      </a>
                    ) : (
                      <button
                        key={actie.id}
                        type='button'
                        className='mel-knop mel-knop-primair'
                        disabled={uitvoerBezig === actie.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void voerActie(actie);
                        }}
                      >
                        <Check aria-hidden='true' />
                        <span>{lang === 'nl' ? actie.labelNl : actie.labelUk}</span>
                      </button>
                    );
                  })}

                {!gebeurtenis.acties.some((a) => a.href) && paginaLink && (
                  <a href={paginaLink} className='mel-knop mel-knop-zacht' onClick={(e) => e.stopPropagation()}>
                    <ExternalLink aria-hidden='true' />
                    <span>{t('Перейти', 'Openen')}</span>
                  </a>
                )}

                {gebeurtenis.bijlagen.length > 0 && inlineBijlageIdx === null && (
                  <button
                    type='button'
                    className='mel-knop mel-knop-zacht'
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(true);
                      setInlineBijlageIdx(0);
                    }}
                  >
                    <Eye aria-hidden='true' />
                    <span>{t('Переглянути тут', 'Hier bekijken')}</span>
                  </button>
                )}
              </>
            )}

            <button
              type='button'
              className={`mel-knop mel-knop-zacht${aiOpen ? ' is-actief' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
                setAiOpen((v) => !v);
              }}
            >
              <Bot aria-hidden='true' />
              <span>{t('ШІ', 'AI')}</span>
            </button>

            {gebeurtenis.status !== 'opgelost' && gebeurtenis.status !== 'archief' ? (
              <>
                <div className='puls-uitstel-anker'>
                  <button
                    type='button'
                    className='mel-ikoon-knop'
                    aria-expanded={uitstelMenuOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onVoorwaardelijkUitstel) {
                        setUitstelMenuOpen((v) => !v);
                      } else {
                        void onStatus('uitgesteld', 30);
                      }
                    }}
                    aria-label={t('Розумне відкладення за умовою', 'Slim voorwaardelijk uitstel')}
                    title={t('Відкласти за умовою або часом (S)', 'Uitstellen op voorwaarde of tijd (S)')}
                  >
                    <Clock3 aria-hidden='true' />
                  </button>
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
                <button
                  type='button'
                  className='mel-ikoon-knop'
                  onClick={(e) => {
                    e.stopPropagation();
                    void onStatus('opgelost');
                  }}
                  aria-label={t('Позначити виконаним', 'Als opgelost markeren')}
                  title={t('Позначити виконаним', 'Als opgelost markeren')}
                >
                  <CheckCheck aria-hidden='true' />
                </button>
                <button
                  type='button'
                  className='mel-ikoon-knop'
                  onClick={(e) => {
                    e.stopPropagation();
                    void onStatus('archief');
                  }}
                  aria-label={t('Перенести в архів', 'Archiveren')}
                  title={t('Перенести в архів (E)', 'Archiveren (E)')}
                >
                  <Archive aria-hidden='true' />
                </button>
              </>
            ) : gebeurtenis.status === 'opgelost' ? (
              <button
                type='button'
                className='mel-knop mel-knop-zacht'
                data-mel-heropenen='1'
                onClick={(e) => {
                  e.stopPropagation();
                  void onStatus('nieuw');
                }}
              >
                <RotateCcw aria-hidden='true' />
                <span>{t('Знову відкрити', 'Opnieuw openen')}</span>
              </button>
            ) : (
              <button
                type='button'
                className='mel-knop mel-knop-zacht'
                onClick={(e) => {
                  e.stopPropagation();
                  void onStatus('gelezen');
                }}
              >
                <RotateCcw aria-hidden='true' />
                <span>{t('Повернути з архіву', 'Uit archief terugzetten')}</span>
              </button>
            )}

            {gebeurtenis.status === 'nieuw' && (
              <button
                type='button'
                className='mel-ikoon-knop'
                onClick={(e) => {
                  e.stopPropagation();
                  void onStatus('gelezen');
                }}
                aria-label={t('Позначити прочитаним', 'Als gelezen markeren')}
                title={t('Позначити прочитаним', 'Als gelezen markeren')}
              >
                <Check aria-hidden='true' />
              </button>
            )}

            {gebeurtenis.status === 'gelezen' && (
              <button
                type='button'
                className='mel-ikoon-knop'
                data-mel-ongelezen='1'
                onClick={(e) => {
                  e.stopPropagation();
                  void onStatus('nieuw');
                }}
                aria-label={t('Позначити як непрочитане', 'Als ongelezen markeren')}
                title={t('Позначити як непрочитане', 'Als ongelezen markeren')}
              >
                <BellDot aria-hidden='true' />
              </button>
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
