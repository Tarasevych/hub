// Спільний перегляд вкладень, етап 3: смуга під шапкою — швидка картка рахунку (15.2) і дії етапу 3.
// Виконавець: Claude Opus 5.5 (High) через Google Antigravity (antigravity), продовження роботи Grok (grok).
// Прапорець `bijlage-weergave-gedeeld-v1`, типово вимкнений: цей компонент живе лише всередині WeergaveKop,
// а WeergaveKop з’являється лише за ввімкненого прапорця.
//
// Правила відмальовування:
//   • рядок картки показуємо лише тоді, коли поле справді знайдено в тексті документа; порожньо — смуги немає;
//   • поки текст читається, нічого не стрибає: смуга з’являється лише з готовими даними;
//   • мінімалізм для розсіяної людини: одна тонка смуга, значок, коротке слово й число, колір лише для терміновості;
//   • дія з’являється лише тоді, коли вона справді можлива (рахунок зі строком, є попередня версія тощо).
import { lazy, Suspense, useMemo, useState } from 'react';
import { CalendarClock, CalendarPlus, GitCompare, Hash, PenLine, Search, Wallet } from 'lucide-react';
import { kies, soortVan, type Taal } from './soort';
import { rekeningVelden, type RekeningVelden } from './rekening-velden';
import { snelkaartRijen, termijnHint, type SnelkaartSleutel } from './snelkaart';
import { useBijlageTekst } from './tekst';
import { toontKalenderBetaling, type BetalingBron } from './kalender-betaling';
import { KalenderBetalingVenster } from './KalenderBetalingVenster';
import { groepVoor, vorigeVersie, type CtxBericht } from './versies';
import { ZoekVeld, type ZoekBron } from './ZoekVeld';
import { ONDERTEKEN_LABEL, ONDERTEKEN_TOELICHTING, toontOndertekenen } from './ondertekenen';

// Наявне вікно порівняння з Пошти (src/mail/VersieVergelijk.tsx) — окремим шматком, лише коли людина натисне.
const VersieVergelijk = lazy(() => import('../mail/VersieVergelijk'));

const ICOON: Record<SnelkaartSleutel, typeof Wallet> = { bedrag: Wallet, termijn: CalendarClock, nummer: Hash };

function datumKort(ms: number, taal: Taal): string {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
  return taal === 'nl' ? `${dd}-${mm}-${d.getFullYear()}` : `${dd}.${mm}.${d.getFullYear()}`;
}

/**
 * Що джерело (Пошта; на етапі 4 — Диск, чат, дошка, сповіщення) знає про відкрите вкладення.
 * Усе необов’язкове: без поля відповідна дія просто не з’являється.
 */
export type WeergaveExtra = {
  /** Для ключа проти подвійного запису й внутрішнього посилання на лист (розділ 15.3). */
  profielId?: string;
  rekeningId?: string;
  briefId?: string;
  bijlageId?: string;
  afzender?: string;
  tijdzone?: string;
  /** 15.5: уся розмова (листи з вкладеннями) і доступ до файлів для наявного вікна порівняння. */
  versieBron?: { berichten: CtxBericht[]; bron: { context: Record<string, string>; accountId: string; cacheAccountId: string } } | null;
  /** 15.6: усі вкладення відкритого листа для пошуку одразу в усіх (читаються лише після запиту людини). */
  zoekBron?: ZoekBron | null;
  /**
   * 15.4: відкрити наявний редактор документа Пошти (MailDocumentBewerker) одразу в режимі позначок.
   * Джерело подає це поле лише тоді, коли редактор для файла справді доступний.
   * Редактор зберігає нову копію; оригінал у листі не змінюється.
   */
  onOndertekenen?: (() => void) | null;
};

export type Etappe3Props = {
  taal: Taal;
  naam: string;
  contentType: string;
  blob?: Blob | null;
  extra?: WeergaveExtra | null;
};

/** Поля рахунку з тексту відкритого вкладення. Для не-рахунку текст навіть не читаємо. */
export function useRekeningVelden(p: { naam: string; contentType: string; blob?: Blob | null }): { velden: RekeningVelden | null; tekst: string } {
  const isRekening = soortVan(p.naam, p.contentType).sleutel === 'rekening';
  const stand = useBijlageTekst(p.blob, p.contentType, p.naam, isRekening);
  return useMemo(() => {
    if (!isRekening || stand.fase !== 'klaar') return { velden: null, tekst: '' };
    return { velden: rekeningVelden(stand.tekst), tekst: stand.tekst };
  }, [isRekening, stand]);
}

export function WeergaveSnelkaart(p: { taal: Taal; velden: RekeningVelden | null }) {
  const rijen = p.velden ? snelkaartRijen(p.velden) : [];
  if (!rijen.length) return null;
  const hint = p.velden?.termijn ? termijnHint(p.velden.termijn.iso, p.taal) : null;
  return (
    <dl className='weergave-snelkaart' aria-label={kies(p.taal, ['Головне з рахунку', 'Belangrijkste uit de factuur'])}>
      {rijen.map((r) => {
        const Icoon = ICOON[r.sleutel];
        return (
          <div key={r.sleutel} className='weergave-snelkaart-rij' data-sleutel={r.sleutel} data-dringend={r.sleutel === 'termijn' && hint ? hint.dringend : undefined}>
            <dt><Icoon aria-hidden='true' /><span>{kies(p.taal, r.label)}</span></dt>
            <dd>
              <b>{kies(p.taal, r.waarde)}</b>
              {r.sleutel === 'termijn' && hint ? <small>{hint.tekst}</small> : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

type Venster = null | 'kalender' | 'versies' | 'zoek';

/** Уся смуга етапу 3: швидка картка й дії. Нічого не показує, якщо ні картки, ні дій немає. */
export function WeergaveEtappe3(p: Etappe3Props) {
  const t = (uk: string, nl: string) => kies(p.taal, [uk, nl]);
  const soort = soortVan(p.naam, p.contentType).sleutel;
  const { velden } = useRekeningVelden(p);
  const [venster, setVenster] = useState<Venster>(null);
  const x: WeergaveExtra = p.extra || {};

  // 15.3: лише для рахунку з зрозумілим строком
  const kalenderBron = useMemo<BetalingBron | null>(() => {
    if (!velden || !toontKalenderBetaling(soort, velden)) return null;
    return { velden, soort, taal: p.taal, bestandsnaam: p.naam, afzender: x.afzender, profielId: x.profielId, rekeningId: x.rekeningId, briefId: x.briefId, bijlageId: x.bijlageId, tijdzone: x.tijdzone };
  }, [velden, soort, p.taal, p.naam, x.afzender, x.profielId, x.rekeningId, x.briefId, x.bijlageId, x.tijdzone]);

  // 15.5: попередня версія того самого документа в розмові (правило «той самий документ» — з src/mail/gesprek-context.ts)
  const versie = useMemo(() => {
    const vb = x.versieBron, briefId = x.briefId || '', bijlageId = x.bijlageId || '';
    if (!vb || !briefId || !bijlageId || vb.berichten.length === 0) return null;
    const groep = groepVoor(vb.berichten, briefId, bijlageId);
    if (!groep) return null;
    const vorige = vorigeVersie(groep, briefId, bijlageId);
    const huidig = groep.items.find((it) => it.berichtId === briefId && it.bijlage.providerAttachmentId === bijlageId);
    if (!vorige || !huidig) return null;
    return { groep, vorige, huidig, bron: vb.bron };
  }, [x.versieBron, x.briefId, x.bijlageId]);

  const heeftKaart = Boolean(velden && snelkaartRijen(velden).length);
  const acties = [
    kalenderBron && (
      <button key='kalender' type='button' className='weergave-etappe3-actie' onClick={() => setVenster('kalender')}>
        <CalendarPlus aria-hidden='true' /><span>{t('Оплату в Календар', 'Betaling in Agenda')}</span>
      </button>
    ),
    versie && (
      <button key='versies' type='button' className='weergave-etappe3-actie' onClick={() => setVenster('versies')}
        title={t(`Попередня версія від ${datumKort(versie.vorige.wanneer, 'uk')}`, `Vorige versie van ${datumKort(versie.vorige.wanneer, 'nl')}`)}>
        <GitCompare aria-hidden='true' /><span>{t('Що змінилося', 'Wat is er veranderd')} <small>{t(`з ${datumKort(versie.vorige.wanneer, 'uk')}`, `sinds ${datumKort(versie.vorige.wanneer, 'nl')}`)}</small></span>
      </button>
    ),
    x.zoekBron && x.zoekBron.items.length > 1 && (
      <button key='zoek' type='button' className='weergave-etappe3-actie' aria-pressed={venster === 'zoek'} onClick={() => setVenster(venster === 'zoek' ? null : 'zoek')}>
        <Search aria-hidden='true' /><span>{t('Пошук у вкладеннях', 'Zoeken in bijlagen')}</span>
      </button>
    ),
    // 15.4: візуальна позначка на окремій копії через наявний редактор; не кваліфікований електронний підпис
    x.onOndertekenen && (toontOndertekenen(soort, p.contentType) || toontOndertekenen(soort, p.naam)) && (
      <button key='ondertekenen' type='button' className='weergave-etappe3-actie' onClick={() => x.onOndertekenen?.()}
        title={kies(p.taal, ONDERTEKEN_TOELICHTING)}>
        <PenLine aria-hidden='true' /><span>{kies(p.taal, ONDERTEKEN_LABEL)}</span>
      </button>
    ),
  ].filter(Boolean);
  if (!heeftKaart && !acties.length) return null;
  return (
    <div className='weergave-etappe3' data-weergave-etappe3=''>
      <WeergaveSnelkaart taal={p.taal} velden={velden} />
      {acties.length > 0 && <div className='weergave-etappe3-acties' role='group' aria-label={t('Що зробити з файлом', 'Wat te doen met het bestand')}>{acties}</div>}
      {venster === 'kalender' && kalenderBron && <KalenderBetalingVenster taal={p.taal} bron={kalenderBron} onSluit={() => setVenster(null)} />}
      {venster === 'zoek' && x.zoekBron && <ZoekVeld taal={p.taal} bron={x.zoekBron} onSluit={() => setVenster(null)} />}
      {venster === 'versies' && versie && (
        <Suspense fallback={null}>
          <VersieVergelijk lang={p.taal} bron={versie.bron} groep={versie.groep} beginKeuze={{ oud: versie.vorige.nummer, nieuw: versie.huidig.nummer }} onSluit={() => setVenster(null)} />
        </Suspense>
      )}
    </div>
  );
}
