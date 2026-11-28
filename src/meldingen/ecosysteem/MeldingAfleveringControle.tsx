// Панель адміністративного контролю доставки в клієнтську панель (✓), фактичного перегляду (✓✓)
// та виявлення недоставлених сповіщень (⏳) або тихо заархівованих за фільтрами каналів (HERSTEL-001).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import {
  bepaalOntvangstStaat,
  MELDING_KAPSEL_AFLEVERING_VLAG,
  type MeldingEcosysteemGebeurtenis,
  type RuimteType,
} from '../../../shared/meldingen-ecosysteem';
import { PulsOntvangstVinkjes } from '../puls/PulsVisueelAnker';
import { haalAfleveringOverzichtVanServer, type AfleveringOverzichtData } from './ecosysteem-opslag';

type Props = {
  lang: 'uk' | 'nl';
  ruimte: RuimteType;
  fallbackStroom?: MeldingEcosysteemGebeurtenis[];
  compact?: boolean;
};

function tijdKort(ts: number | null | undefined, lang: 'uk' | 'nl'): string {
  if (!ts || ts <= 0) return '—';
  try {
    return new Date(ts).toLocaleString(lang === 'nl' ? 'nl-BE' : 'uk-UA', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

export default function MeldingAfleveringControle({
  lang,
  ruimte,
  fallbackStroom = [],
  compact = false,
}: Props) {
  const t = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  const [alleenAandacht, setAlleenAandacht] = useState(false);
  const [alleRuimtes, setAlleRuimtes] = useState(true);
  const [laden, setLaden] = useState(false);
  const [serverData, setServerData] = useState<AfleveringOverzichtData | null>(null);

  const herlaad = useCallback(async () => {
    setLaden(true);
    try {
      const res = await haalAfleveringOverzichtVanServer({
        ruimte: alleRuimtes ? 'alle' : ruimte,
        alleenOngelezen: alleenAandacht,
      });
      if (res) setServerData(res);
    } finally {
      setLaden(false);
    }
  }, [alleRuimtes, ruimte, alleenAandacht]);

  useEffect(() => {
    void herlaad();
  }, [herlaad]);

  const lokaalAfgeleid: AfleveringOverzichtData = useMemo(() => {
    let wachtOpAflevering = 0;
    let afgeleverdOngelezen = 0;
    let gelezen = 0;
    let autoGearchiveerdOngelezen = 0;
    const items: AfleveringOverzichtData['items'] = [];

    for (const g of fallbackStroom) {
      const st = bepaalOntvangstStaat(g);
      if (st === 'wacht') wachtOpAflevering += 1;
      else if (st === 'afgeleverd') afgeleverdOngelezen += 1;
      else gelezen += 1;
      if (g.autoGearchiveerd && st !== 'gelezen') autoGearchiveerdOngelezen += 1;
      if (alleenAandacht && st === 'gelezen') continue;
      items.push({
        id: g.id,
        userId: 'eigenaar',
        gebruikerLabel: t('Поточний обліковий запис', 'Huidig account'),
        ruimte: g.ruimte,
        kanaal: g.kanaal,
        subdomein: g.subdomein,
        status: g.status,
        ontvangstStaat: st,
        autoGearchiveerd: Boolean(g.autoGearchiveerd),
        titel: g.titel,
        aangemaaktOp: g.aangemaaktOp,
        afgeleverdOp: g.afgeleverdOp ?? null,
        gelezenOp: g.gelezenOp ?? null,
      });
    }

    const rang = { wacht: 0, afgeleverd: 1, gelezen: 2 } as const;
    items.sort((a, b) => rang[a.ontvangstStaat] - rang[b.ontvangstStaat] || b.aangemaaktOp - a.aangemaaktOp);

    return {
      samenvatting: {
        totaal: fallbackStroom.length,
        wachtOpAflevering,
        afgeleverdOngelezen,
        gelezen,
        autoGearchiveerdOngelezen,
      },
      perGebruiker: fallbackStroom.length
        ? [
            {
              userId: 'eigenaar',
              label: t('Поточний обліковий запис', 'Huidig account'),
              totaal: fallbackStroom.length,
              wachtOpAflevering,
              afgeleverdOngelezen,
              gelezen,
              autoGearchiveerdOngelezen,
              laatsteAfleveringOp:
                fallbackStroom.reduce((acc, g) => Math.max(acc, g.afgeleverdOp || 0), 0) || null,
            },
          ]
        : [],
      items: items.slice(0, compact ? 12 : 30),
    };
  }, [fallbackStroom, alleenAandacht, compact, lang]);

  const data = serverData && serverData.samenvatting.totaal > 0 ? serverData : lokaalAfgeleid;

  return (
    <section
      className={`puls-aflevering-controle${compact ? ' is-compact' : ''}`}
      data-qa-id='puls-aflevering-controle'
      data-vlag={MELDING_KAPSEL_AFLEVERING_VLAG}
      aria-label={t('Контроль доставки та прочитання сповіщень', 'Controle op aflevering en lezing van meldingen')}
    >
      <div className='puls-aflevering-kop'>
        <div className='puls-aflevering-titel'>
          <ShieldCheck aria-hidden='true' />
          <div>
            <strong>{t('Контроль доставки й перегляду (адміністратор)', 'Afleverings- en leescontrole (beheer)')}</strong>
            <small>
              {t(
                'Очікує доставки (⏳), доставлено в панель (✓), переглянуто очима (✓✓) — включно з автоархівом фільтрів.',
                'Wacht op paneel (⏳), afgeleverd (✓), bekeken (✓✓) — inclusief automatische filterarchivering.',
              )}
            </small>
          </div>
        </div>

        <div className='puls-aflevering-gereedschap'>
          <label className='puls-aflevering-filter-check'>
            <input
              type='checkbox'
              checked={alleenAandacht}
              onChange={(e) => setAlleenAandacht(e.target.checked)}
            />
            <span>{t('Лише непрочитані / недоставлені', 'Alleen ongelezen / niet-afgeleverd')}</span>
          </label>
          {!compact && (
            <label className='puls-aflevering-filter-check'>
              <input
                type='checkbox'
                checked={alleRuimtes}
                onChange={(e) => setAlleRuimtes(e.target.checked)}
              />
              <span>{t('Обидва простори', 'Beide ruimtes')}</span>
            </label>
          )}
          <button
            type='button'
            className='mel-knop mel-knop-zacht'
            onClick={() => void herlaad()}
            title={t('Оновити зведення доставки з сервера', 'Afleveringsoverzicht verversen')}
          >
            <RefreshCw className={laden ? 'mel-draai' : undefined} aria-hidden='true' />
            <span>{t('Оновити', 'Verversen')}</span>
          </button>
        </div>
      </div>

      <div className='puls-aflevering-tellers'>
        <div className='puls-aflevering-kaart is-wacht' data-teller='wacht'>
          <small>{t('Не доставлено в панель', 'Niet in paneel afgeleverd')}</small>
          <strong>
            <PulsOntvangstVinkjes staat='wacht' lang={lang} />
            <span>{data.samenvatting.wachtOpAflevering}</span>
          </strong>
        </div>
        <div className='puls-aflevering-kaart is-afgeleverd' data-teller='afgeleverd'>
          <small>{t('Доставлено · не переглянуто', 'Afgeleverd · ongelezen')}</small>
          <strong>
            <PulsOntvangstVinkjes staat='afgeleverd' lang={lang} />
            <span>{data.samenvatting.afgeleverdOngelezen}</span>
          </strong>
        </div>
        <div className='puls-aflevering-kaart is-filter' data-teller='auto-archief'>
          <small>{t('Автоархів фільтра (не переглянуто)', 'Auto-archief filter (ongelezen)')}</small>
          <strong>
            <Filter aria-hidden='true' />
            <span>{data.samenvatting.autoGearchiveerdOngelezen}</span>
          </strong>
        </div>
        <div className='puls-aflevering-kaart is-gelezen' data-teller='gelezen'>
          <small>{t('Доставлено й прочитано', 'Afgeleverd en gelezen')}</small>
          <strong>
            <PulsOntvangstVinkjes staat='gelezen' lang={lang} />
            <span>{data.samenvatting.gelezen}</span>
          </strong>
        </div>
      </div>

      {data.perGebruiker.length > 0 && (
        <div className='puls-aflevering-gebruikers'>
          {data.perGebruiker.map((u) => (
            <div key={u.userId} className='puls-aflevering-gebruiker-rij'>
              <span className='puls-aflevering-naam'>
                <Users aria-hidden='true' />
                <strong>{u.label}</strong>
              </span>
              <span className='puls-aflevering-cijfers'>
                <span title={t('Очікує доставки', 'Wacht op aflevering')}>⏳ {u.wachtOpAflevering}</span>
                <span title={t('Доставлено без прочитання', 'Afgeleverd zonder lezing')}>✓ {u.afgeleverdOngelezen}</span>
                <span title={t('Доставлено і прочитано', 'Afgeleverd en gelezen')}>✓✓ {u.gelezen}</span>
                {u.laatsteAfleveringOp ? (
                  <small>{t('Ост. доставка:', 'Laatste aflevering:')} {tijdKort(u.laatsteAfleveringOp, lang)}</small>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.items.length > 0 ? (
        <div className='puls-aflevering-lijst'>
          {data.items.slice(0, compact ? 8 : 20).map((it) => (
            <div key={`${it.userId}:${it.id}`} className={`puls-aflevering-rij is-staat-${it.ontvangstStaat}`}>
              <PulsOntvangstVinkjes
                staat={it.ontvangstStaat}
                afgeleverdOp={it.afgeleverdOp}
                gelezenOp={it.gelezenOp}
                autoGearchiveerd={it.autoGearchiveerd}
                lang={lang}
              />
              <div className='puls-aflevering-rij-hoofd'>
                <strong>{it.titel}</strong>
                <small>
                  {it.gebruikerLabel} · {it.subdomein}
                  {it.autoGearchiveerd ? ` · ${t('автоархів за фільтром', 'auto-archief via filter')}` : ''}
                  {' · '}
                  {t('Доставлено:', 'Afgeleverd:')} {tijdKort(it.afgeleverdOp, lang)}
                  {' · '}
                  {t('Прочитано:', 'Gelezen:')} {tijdKort(it.gelezenOp, lang)}
                </small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className='puls-aflevering-leeg'>
          {t(
            'Недоставлених чи непрочитаних сповіщень немає — усі доставлені та переглянуті.',
            'Geen onafgeleverde of ongelezen meldingen — alles is afgeleverd en bekeken.',
          )}
        </p>
      )}
    </section>
  );
}
