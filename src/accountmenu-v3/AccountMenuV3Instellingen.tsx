// Налаштування спадного меню облікового запису v3 у розділі «Налаштувати меню» (IDENTITEIT-008).
// Дозволяє перемикати вигляд переліку облікових записів між Режимом А («Орбіта світлин», типово)
// та Режимом Б («Секційна картка»), а також скидати масштаб вікна до 100%.
import {
  herstelAccountmenuV3Schaal,
  SCHAAL_STANDAARD,
  useAccountmenuV3Voorkeuren,
  zetAccountmenuV3Indeling,
} from './accountmenu-v3-voorkeuren';
import { useAccountmenuV3 } from './vlag';

export function AccountMenuV3Instellingen({ lang }: { lang: 'uk' | 'nl' }) {
  const aan = useAccountmenuV3();
  const voorkeuren = useAccountmenuV3Voorkeuren();
  if (!aan) return null;
  const uk = lang === 'uk';

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
          {uk ? 'Вигляд спадного меню облікового запису (v3)' : 'Weergave van het accountmenu (v3)'}
        </strong>
        <small style={{ color: 'var(--canonical-muted, #556270)', fontSize: '0.78rem' }}>
          {uk
            ? 'Оберіть, як відображати інші облікові записи у верхній частині меню.'
            : 'Kies hoe andere accounts boven in het accountmenu worden getoond.'}
        </small>
      </div>

      <div
        role='group'
        aria-label={uk ? 'Режим списку облікових записів' : 'Weergavemodus voor de accountlijst'}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px' }}
      >
        <button
          type='button'
          data-am3-kies-indeling='orbita'
          aria-pressed={voorkeuren.indeling === 'orbita'}
          onClick={() => zetAccountmenuV3Indeling('orbita')}
          style={{
            padding: '10px 12px',
            borderRadius: '11px',
            border: '1px solid var(--canonical-line, #dce2ea)',
            background: voorkeuren.indeling === 'orbita' ? 'var(--canonical-panel, #ffffff)' : 'transparent',
            color: 'var(--canonical-text, #16202a)',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <strong style={{ display: 'block', fontSize: '0.82rem' }}>
            {uk ? 'Орбіта світлин (Режим А, типово)' : 'Profielfoto-orbita (Modus A, standaard)'}
          </strong>
          <small style={{ color: 'var(--canonical-muted, #556270)', fontSize: '0.72rem' }}>
            {uk
              ? 'Активний запис по центру, інші записи — кружечками обабіч для миттєвого переходу.'
              : 'Actief account in het midden, andere accounts als cirkels ernaast om snel te wisselen.'}
          </small>
        </button>

        <button
          type='button'
          data-am3-kies-indeling='kaart'
          aria-pressed={voorkeuren.indeling === 'kaart'}
          onClick={() => zetAccountmenuV3Indeling('kaart')}
          style={{
            padding: '10px 12px',
            borderRadius: '11px',
            border: '1px solid var(--canonical-line, #dce2ea)',
            background: voorkeuren.indeling === 'kaart' ? 'var(--canonical-panel, #ffffff)' : 'transparent',
            color: 'var(--canonical-text, #16202a)',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <strong style={{ display: 'block', fontSize: '0.82rem' }}>
            {uk ? 'Секційна картка (Режим Б)' : 'Sectiekaart (Modus B)'}
          </strong>
          <small style={{ color: 'var(--canonical-muted, #556270)', fontSize: '0.72rem' }}>
            {uk
              ? 'Лише велика світлина активного профілю вгорі та розкривний список записів нижче.'
              : 'Alleen de grote profielfoto bovenaan en de uitvouwbare lijst met accounts eronder.'}
          </small>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.78rem' }}>
        <span>
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
              padding: '4px 10px',
              borderRadius: '8px',
              border: '1px solid var(--canonical-line, #dce2ea)',
              background: 'var(--canonical-panel, #ffffff)',
              color: 'var(--canonical-text, #16202a)',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {uk ? 'Скинути до 100%' : 'Herstellen naar 100%'}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default AccountMenuV3Instellingen;
