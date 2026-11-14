// IDENTITEIT-014 (фаза 3): «Огляд резервного доступу» у розділі «Відновлення доступу» (id herstel-overzicht — на нього веде жива карта).
// Три перевірки (src/herstel/reserve.ts): щонайменше два незалежні способи, коди облікового запису є і збережені, ключ даних має
// passkey з PRF і код відновлення сховища. Кожен червоний пункт веде через onKies у свій розділ; «Що зробити першим» — той самий
// пріоритет, що й у героя «Способів входу» (eersteInTeStellen). Лише читання: stap-op/methoden і sleutelkluis/stand без step-up.
// Overzicht van de reservetoegang: drie controles, elk rood punt leidt naar zijn onderdeel; alleen lezen.
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Info, ShieldAlert } from 'lucide-react';
import { api } from '../platform/client';
import { foutNaarTekst } from '../weigeringen';
import { InfoTip } from '../InfoTip';
import type { SnapshotLike } from '../aanmeld-vnext/snapshotNaarKaarten';
import { eersteStap, reserveControles, type Controle, type HerstelSectie, type KluisKern, type Paar, type ReserveMethoden } from './reserve';
import { useKluisKern } from './useKluisKern';
import './herstel.css';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, p: Paar) => (lang === 'nl' ? p[1] : p[0]);
const ICOON = { goed: CheckCircle2, slecht: ShieldAlert, aandacht: AlertTriangle, neutraal: Info, onbekend: CircleDashed } as const;

type WeergaveProps = {
  lang: Lang;
  controles: Controle[];
  eerste: { sectie: HerstelSectie; titel: Paar } | null;
  /** Відмова stap-op/methoden: огляд рахує лише те, що знає знімок, і чесно про це каже. */
  fout?: Paar | null;
  onKies: (sectie: HerstelSectie) => void;
};

/** Вигляд без запитів (його рендерять модульні тести). */
export function ReserveOverzichtWeergave({ lang, controles, eerste, fout, onKies }: WeergaveProps) {
  const rood = controles.filter((c) => c.toon === 'slecht').length;
  return <section className='access-plane-section herstel-overzicht' id='herstel-overzicht' data-herstel-overzicht data-rood={rood} tabIndex={-1}>
    <header className='access-plane-section-head'><h2>{tr(lang, ['Чи вистачить резерву', 'Is er genoeg reserve'])}</h2>
      <InfoTip label={tr(lang, ['Про огляд резервного доступу', 'Over het overzicht van reservetoegang'])}>
        <p>{tr(lang, ['Огляд показує, чи зможете ви повернути доступ, якщо втратите телефон, ключ доступу або застосунок-автентифікатор. Червоний пункт веде туди, де це виправити.', 'Het overzicht laat zien of u weer binnenkomt als u uw telefoon, toegangssleutel of authenticator-app kwijt bent. Een rood punt leidt naar de plek waar u het oplost.'])}</p>
      </InfoTip></header>
    <div className='access-plane-box'>
      {eerste && <div className='herstel-eerste' data-herstel-eerste={eerste.sectie}>
        <span><strong>{tr(lang, ['Що зробити першим', 'Wat eerst doen'])}</strong><small>{tr(lang, ['Найбільше зменшує ризик утратити доступ.', 'Verkleint het risico op verlies van toegang het meest.'])}</small></span>
        <button type='button' onClick={() => onKies(eerste.sectie)}>{tr(lang, eerste.titel)}<ArrowRight /></button>
      </div>}
      <ul className='herstel-controles'>
        {controles.map((c) => {
          const Icoon = ICOON[c.toon];
          return <li key={c.id} data-controle={c.id} data-toon={c.toon}>
            <Icoon className='herstel-controle-icoon' aria-hidden='true' />
            <span className='herstel-controle-tekst'><strong>{tr(lang, c.titel)}</strong><small>{tr(lang, c.uitleg)}</small></span>
            {c.sectie && c.actie && c.toon !== 'goed' && <button type='button' className='secondary' data-ga={c.sectie} onClick={() => onKies(c.sectie!)}>{tr(lang, c.actie)}<ArrowRight /></button>}
          </li>;
        })}
      </ul>
      {fout && <p className='access-plane-hint-line access-plane-subrow' role='status' data-herstel-fout>{tr(lang, fout)}</p>}
    </div>
  </section>;
}

type Props = { lang: Lang; context: Record<string, unknown>; data: SnapshotLike; onKies: (sectie: HerstelSectie) => void };

export function ReserveOverzicht({ lang, context, data, onKies }: Props) {
  const [methoden, setMethoden] = useState<ReserveMethoden | null>(null);
  const [fout, setFout] = useState<Paar | null>(null);
  const kluis: KluisKern | null | undefined = useKluisKern(context);
  // Знову читаємо способи, коли знімок змінився (додано passkey, вимкнено автентифікатор, створено коди).
  const sleutel = data.factors.map((f) => `${f.id}:${f.enrolled ? 1 : 0}:${f.remaining ?? ''}:${f.status}`).join('|');
  useEffect(() => {
    let actief = true;
    api.post('/api/owner/access/stap-op/methoden', { ...context, actie: 'herstel-overzicht', sterk: false })
      .then((r) => { if (actief) { setMethoden((r?.data?.methoden as ReserveMethoden) || null); setFout(null); } })
      .catch((e) => {
        if (!actief) return;
        const paar = foutNaarTekst(e);
        setFout([`Не всі способи вдалося перевірити — враховано лише passkey, автентифікатор, коди й Google. ${paar ? paar[0] : ''}`.trim(), `Niet alle manieren konden worden gecontroleerd — alleen passkey, authenticator, codes en Google tellen mee. ${paar ? paar[1] : ''}`.trim()]);
      });
    return () => { actief = false; };
  }, [context, sleutel]);
  const controles = reserveControles(data, methoden, kluis);
  return <ReserveOverzichtWeergave lang={lang} controles={controles} eerste={eersteStap(data, controles)} fout={fout} onKies={onKies} />;
}
