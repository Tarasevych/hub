// Картка події екосистеми з горизонтальним змахом, швидкими діями, вкладеннями та ШІ-інспектором (GEMINI-002).
// Захищає нові критичні сповіщення безпеки від випадкового прибирання змахом.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Archive,
  Bell,
  BellDot,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  Cloud,
  Cpu,
  ExternalLink,
  GitBranch,
  Home,
  Laptop,
  Mail,
  Paperclip,
  PlugZap,
  Zap,
  Puzzle,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import {
  classificeerBijlage,
  evalueerVeeg,
  formaatGrootte,
  kanaalLabel,
  prioriteitLabel,
  veiligeMeldingUrl,
  type AiAanbiederKeuze,
  type BijlageWeergaveVoorkeur,
  type MeldingActie,
  type MeldingAiSamenvatting,
  type MeldingEcosysteemGebeurtenis,
  type MeldingEcosysteemProfiel,
  type MeldingGebeurtenisStatus,
  type MeldingKanaal,
  type VeegActie,
} from '../../../shared/meldingen-ecosysteem';
import { voerPaginaSignaalActieUit } from '../../canoniek-meldingen';
import MeldingBijlageSpeler, { IcoonVoorFormaat } from './MeldingBijlageSpeler';
import MeldingAiPaneel from './MeldingAiPaneel';

function KanaalIcoon({ kanaal }: { kanaal: MeldingKanaal }) {
  if (kanaal === 'beveiliging') return <ShieldAlert aria-hidden='true' />;
  if (kanaal === 'mail') return <Mail aria-hidden='true' />;
  if (kanaal === 'cloud') return <Cloud aria-hidden='true' />;
  if (kanaal === 'ai') return <Bot aria-hidden='true' />;
  if (kanaal === 'mcp') return <PlugZap aria-hidden='true' />;
  if (kanaal === 'github') return <GitBranch aria-hidden='true' />;
  if (kanaal === 'huis') return <Home aria-hidden='true' />;
  if (kanaal === 'pc_agent') return <Laptop aria-hidden='true' />;
  if (kanaal === 'extensie') return <Puzzle aria-hidden='true' />;
  if (kanaal === 'systeem') return <Cpu aria-hidden='true' />;
  return <Bell aria-hidden='true' />;
}

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
  bijlageVoorkeur: BijlageWeergaveVoorkeur;
  onSelect?: () => void;
  onStatus: (status: MeldingGebeurtenisStatus, uitstelMinuten?: number) => Promise<void> | void;
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
  bijlageVoorkeur,
  onSelect,
  onStatus,
  onOntleden,
  onOpenBijlageModaal,
  onOpenActie,
}: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [open, setOpen] = useState(standaardOpen);
  const [aiOpen, setAiOpen] = useState(Boolean(gebeurtenis.aiSamenvatting));
  const [inlineBijlageIdx, setInlineBijlageIdx] = useState<number | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [beschermHint, setBeschermHint] = useState('');
  const [uitvoerBezig, setUitvoerBezig] = useState('');

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

  useEffect(() => () => {
    if (hintTimerRef.current !== undefined) window.clearTimeout(hintTimerRef.current);
  }, []);

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

  return (
    <div className='mel-veeg-houder' data-testid={`mel-kaart-${gebeurtenis.id}`}>
      {richting && veegEval && (
        <div
          className={`mel-veeg-achtergrond is-${richting}${veegEval.uitvoeren ? '' : ' is-geblokkeerd'}`}
          aria-hidden='true'
        >
          {veegEval.uitvoeren
            ? veegLabel(veegEval.actie, lang)
            : t('Захист безпеки', 'Beveiligingsblokkade')}
        </div>
      )}

      <article
        className={`mel-kaart is-prio-${gebeurtenis.prioriteit} is-status-${gebeurtenis.status}${geselecteerd ? ' is-geselecteerd' : ''}`}
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
          <span className={`mel-kanaal-teken is-${gebeurtenis.kanaal}`}>
            <KanaalIcoon kanaal={gebeurtenis.kanaal} />
          </span>

          <div className='mel-kaart-hoofd'>
            <div className='mel-kaart-meta'>
              <span className='mel-subdomein-chip'>{gebeurtenis.subdomein}</span>
              <span className='mel-kanaal-naam'>{kanaalLabel(gebeurtenis.kanaal, lang)}</span>
              {gebeurtenis.prioriteit !== 'normaal' && (
                <span className={`mel-prio is-${gebeurtenis.prioriteit}`}>
                  {prioriteitLabel(gebeurtenis.prioriteit, lang)}
                </span>
              )}
              {gebeurtenis.herhalingen > 1 && (
                <span className='mel-herhaling' title={t('Повторень', 'Herhalingen')}>
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

            {gebeurtenis.contextLabel && (
              <small className='mel-context'>{gebeurtenis.contextLabel}</small>
            )}
          </div>
        </div>

        {(gebeurtenis.bericht || open) && (
          <p className={`mel-bericht${open ? ' is-vol' : ''}`}>
            {gebeurtenis.bericht || gebeurtenis.uitleg}
          </p>
        )}

        {beschermHint && (
          <div className='mel-bescherm-hint' role='alert'>
            <ShieldAlert aria-hidden='true' />
            <span>{beschermHint}</span>
          </div>
        )}

        {gebeurtenis.bijlagen.length > 0 && (
          <div className='mel-bijlagen-strook' data-geen-veeg='1'>
            {gebeurtenis.bijlagen.map((b, idx) => {
              const info = classificeerBijlage(b);
              const actief = inlineBijlageIdx === idx;
              return (
                <button
                  key={b.id}
                  type='button'
                  className={`mel-bijlage-chip${actief ? ' is-actief' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(true);
                    if (bijlageVoorkeur.inlineSpeler) {
                      setInlineBijlageIdx((cur) => (cur === idx ? null : idx));
                    } else {
                      onOpenBijlageModaal(idx);
                    }
                  }}
                >
                  <IcoonVoorFormaat weergave={info.weergave} />
                  <span>{b.naam}</span>
                  <small>{info.label} · {formaatGrootte(b.grootteBytes)}</small>
                </button>
              );
            })}
          </div>
        )}

        <div className='mel-kaart-acties' data-geen-veeg='1'>
          {gebeurtenis.acties
            .filter((a) => a.soort === 'api' || (a.soort === 'navigeer' && Boolean(veiligeMeldingUrl(a.href, 500))))
            .slice(0, 2)
            .map((actie) => {
              const veiligeHref = veiligeMeldingUrl(actie.href, 500);
              return veiligeHref ? (
                <a key={actie.id} href={veiligeHref} className='mel-knop mel-knop-zacht' onClick={(e) => e.stopPropagation()}>
                  <ExternalLink aria-hidden='true' />
                  {lang === 'nl' ? actie.labelNl : actie.labelUk}
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
                  {lang === 'nl' ? actie.labelNl : actie.labelUk}
                </button>
              );
            })}

          {!gebeurtenis.acties.some((a) => a.href) && paginaLink && (
            <a href={paginaLink} className='mel-knop mel-knop-zacht' onClick={(e) => e.stopPropagation()}>
              <ExternalLink aria-hidden='true' />
              {t('Перейти', 'Openen')}
            </a>
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
            {t('ШІ', 'AI')}
          </button>

          {gebeurtenis.status !== 'opgelost' && gebeurtenis.status !== 'archief' ? (
            <>
              <button
                type='button'
                className='mel-ikoon-knop'
                onClick={(e) => {
                  e.stopPropagation();
                  void onStatus('uitgesteld', 30);
                }}
                aria-label={t('Відкласти на 30 хв', '30 min uitstellen')}
                title={t('Відкласти на 30 хв', '30 min uitstellen')}
              >
                <Clock3 aria-hidden='true' />
              </button>
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
                title={t('Перенести в архів', 'Archiveren')}
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
              {t('Знову відкрити', 'Opnieuw openen')}
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
              {t('Повернути з архіву', 'Uit archief terugzetten')}
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

        {open && (
          <div className='mel-kaart-details' data-geen-veeg='1'>
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
              <button
                type='button'
                className='mel-knop mel-knop-zacht'
                onClick={() => onOpenBijlageModaal(0)}
              >
                <Paperclip aria-hidden='true' />
                {t('Відкрити переглядач вкладень', 'Bijlageweergave openen')}
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
