// Налаштування стилю спадного меню облікового запису у розділі «Налаштувати меню» (IDENTITEIT-008, Віха M2: М-2).
// Підтримує 4 взаємосумісні режими подання без втрати жодної попередньої можливості:
//   · 'orbita'   — Орбіта світлин (Режим А v3, типово);
//   · 'kaart'    — Секційна картка (Режим Б v3);
//   · 'v2'       — Компактне меню (v2);
//   · 'klassiek' — Класичний перелік (v6).
import { useAccountmenuV2 } from '../accountmenu-v2/vlag';
import {
  herstelAccountmenuV3Schaal,
  SCHAAL_STANDAARD,
  useAccountmenuV3Voorkeuren,
  zetAccountmenuV3Indeling,
  type AccountmenuV3Indeling,
} from './accountmenu-v3-voorkeuren';
import { useAccountmenuV3 } from './vlag';

export function AccountMenuV3Instellingen({ lang }: { lang: 'uk' | 'nl' }) {
  const v3Aan = useAccountmenuV3();
  const v2Aan = useAccountmenuV2();
  const voorkeuren = useAccountmenuV3Voorkeuren();
  if (!v3Aan && !v2Aan) return null;
  const uk = lang === 'uk';

  const keuzes: Array<{
    id: AccountmenuV3Indeling;
    titelUk: string;
    titelNl: string;
    uitlegUk: string;
    uitlegNl: string;
    beschikbaar: boolean;
  }> = [
    {
      id: 'orbita',
      titelUk: 'Орбіта світлин (Режим А, типово)',
      titelNl: 'Profielfoto-orbita (Modus A, standaard)',
      uitlegUk: 'Активний запис по центру, інші записи — кружечками обабіч для миттєвого переходу.',
      uitlegNl: 'Actief account in het midden, andere accounts als cirkels ernaast om snel te wisselen.',
      beschikbaar: v3Aan,
    },
    {
      id: 'kaart',
      titelUk: 'Секційна картка (Режим Б)',
      titelNl: 'Sectiekaart (Modus B)',
      uitlegUk: 'Велика світлина активного профілю вгорі та розкривний список записів нижче.',
      uitlegNl: 'Grote profielfoto bovenaan en een uitvouwbare lijst met accounts eronder.',
      beschikbaar: v3Aan,
    },
    {
      id: 'v2',
      titelUk: 'Компактне меню (v2)',
      titelNl: 'Compact menu (v2)',
      uitlegUk: 'Згруповані кнопки мови, теми й сеансу з лаконічними підказками.',
      uitlegNl: 'Gegroepeerde knoppen voor taal, thema en sessie met beknopte toelichting.',
      beschikbaar: v3Aan || v2Aan,
    },
    {
      id: 'klassiek',
      titelUk: 'Класичний перелік',
      titelNl: 'Klassieke lijst',
      uitlegUk: 'Повнотекстовий класичний список дій та облікових записів.',
      uitlegNl: 'Klassieke lijstweergave met uitgeschreven acties en accounts.',
      beschikbaar: true,
    },
  ];

  return (
    <section
      className='am3-instellingen-kaart'
      data-am3-instellingen='1'
      style={{
        padding: '12px 14px',
        marginBottom: '12px',
        borderRadius: '14px',
        border: '1px solid var(--canonical-line, #dce2ea)',
        background: 'var(--canonical-surface, #f5f7fa)',
        display: 'grid',
        gap: '10px',
      }}
    >
      <div>
        <strong style={{ display: 'block', fontSize: '0.9rem' }}>
          {uk ? 'Вигляд спадного меню облікового запису' : 'Weergave van het accountmenu'}
        </strong>
        <small style={{ color: 'var(--canonical-muted, #556270)', fontSize: '0.78rem' }}>
          {uk
            ? 'Оберіть зручний варіант меню облікового запису (Орбіта, Картка, Компактний v2 або Класичний).'
            : 'Kies uw gewenste variant van het accountmenu (Orbita, Sectiekaart, Compact v2 of Klassiek).'}
        </small>
      </div>

      <div
        role='group'
        aria-label={uk ? 'Режим списку облікових записів' : 'Weergavemodus voor het accountmenu'}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '8px' }}
      >
        {keuzes
          .filter((k) => k.beschikbaar)
          .map((k) => (
            <button
              key={k.id}
              type='button'
              data-am3-kies-indeling={k.id}
              aria-pressed={voorkeuren.indeling === k.id}
              onClick={() => zetAccountmenuV3Indeling(k.id)}
              style={{
                padding: '10px 12px',
                borderRadius: '11px',
                border: '1px solid var(--canonical-line, #dce2ea)',
                background: voorkeuren.indeling === k.id ? 'var(--canonical-panel, #ffffff)' : 'transparent',
                color: 'var(--canonical-text, #16202a)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <strong style={{ display: 'block', fontSize: '0.82rem' }}>{uk ? k.titelUk : k.titelNl}</strong>
              <small style={{ color: 'var(--canonical-muted, #556270)', fontSize: '0.72rem' }}>
                {uk ? k.uitlegUk : k.uitlegNl}
              </small>
            </button>
          ))}
      </div>

      {v3Aan && (voorkeuren.indeling === 'orbita' || voorkeuren.indeling === 'kaart') ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            fontSize: '0.78rem',
          }}
        >
          <span style={{ minWidth: 0 }}>
            {uk
              ? `Масштаб вікна меню: ${Math.round(voorkeuren.schaal * 100)}% (змінюється розтягуванням за нижній кутик)`
              : `Vensterschaal: ${Math.round(voorkeuren.schaal * 100)}% (aanpasbaar via de onderste hoek)`}
          </span>
          {voorkeuren.schaal !== SCHAAL_STANDAARD ? (
            <button
              type='button'
              data-am3-herstel-schaal='1'
              onClick={() => herstelAccountmenuV3Schaal()}
              style={{
                minHeight: 'var(--tik-hoogte, 40px)',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--canonical-line, #dce2ea)',
                background: 'var(--canonical-panel, #ffffff)',
                color: 'var(--canonical-text, #16202a)',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {uk ? 'Скинути до 100%' : 'Herstellen naar 100%'}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
