// Багатошарові об'ємні векторно-скляні композиції художньої системи «Макет» (MAQUETTE-001).
// Кожен із 13 видів відтворює нічну студійну раму з внутрішньо освітленою сферою, орбітами, нахиленими скляними вікнами та двомовними штампами.
// Gelaagde vector- en glaskunstwerken in een nachtelijk studioraam voor alle 13 scènes van het «Maquette»-stelsel.

import type { ReactNode } from 'react';

export type MaquetteKunstSoort =
  | 'identity'
  | 'mail'
  | 'cloud'
  | 'github'
  | 'hub'
  | 'ai'
  | 'huis'
  | 'mcp'
  | 'api'
  | 'admin'
  | 'aanmelden'
  | 'gast'
  | 'niet-gevonden';

export interface MaquetteKunstProps {
  soort: MaquetteKunstSoort;
  lang?: 'uk' | 'nl';
  variant?: 'held' | 'kaart';
  className?: string;
}

interface KunstTeksten {
  stempel: string;
  cursief: string;
  labelA: string;
  labelB: string;
}

const TEKSTEN: Record<'uk' | 'nl', Record<MaquetteKunstSoort, KunstTeksten>> = {
  uk: {
    identity: {
      stempel: 'ОСОБА · ДОВІРА',
      cursief: 'Особисте ядро',
      labelA: 'КЛЮЧ ДОСТУПУ',
      labelB: 'ПІДТВЕРДЖЕНО',
    },
    hub: {
      stempel: 'МІЙ ПРОСТІР · ЯДРО',
      cursief: 'Єдиний дім',
      labelA: 'УСІ СЛУЖБИ РАЗОМ',
      labelB: 'УЗГОДЖЕНИЙ СТАН',
    },
    ai: {
      stempel: 'РОЗУМНИЙ ПОМІЧНИК',
      cursief: 'Ясна думка',
      labelA: 'КОНТЕКСТ РОЗМОВИ',
      labelB: 'ТОЧНА ВІДПОВІДЬ',
    },
    mail: {
      stempel: 'ЛИСТУВАННЯ · СПОКІЙ',
      cursief: 'Тиха скринька',
      labelA: 'ПЕРЕВІРЕНА ПОШТА',
      labelB: 'ЧИСТИЙ ПОТІК',
    },
    cloud: {
      stempel: 'СХОВИЩЕ · ЗАХИСТ',
      cursief: 'Власна скарбниця',
      labelA: 'ШИФРОВАНІ ТОМИ',
      labelB: 'ЦІЛІСНІСТЬ ДАНИХ',
    },
    github: {
      stempel: 'ДЕРЕВО ЗМІН · ПІДПИС',
      cursief: 'Чиста лінія',
      labelA: 'ПЕРЕВІРЕНА ГІЛКА',
      labelB: 'ТОЧНИЙ ВІДБИТОК',
    },
    huis: {
      stempel: 'ОСЕЛЯ · ЗАТИШОК',
      cursief: 'Тепло дому',
      labelA: 'КЛІМАТ І СВІТЛО',
      labelB: 'ТИХИЙ ВЕЧІР · 21,5°',
    },
    mcp: {
      stempel: 'КООРДИНАЦІЯ · ВУЗЛИ',
      cursief: 'Спільна пам’ять',
      labelA: 'МІСТ КОНТЕКСТУ',
      labelB: 'ЧЕРГА УЗГОДЖЕННЯ',
    },
    api: {
      stempel: 'ШЛЮЗИ · КОНТРАКТИ',
      cursief: 'Чіткий обмін',
      labelA: 'СХЕМА ЗАПИТУ',
      labelB: 'ПЕРЕВІРЕНА ВІДПОВІДЬ',
    },
    admin: {
      stempel: 'НАГЛЯД · ЦІЛІСНІСТЬ',
      cursief: 'Твердий лад',
      labelA: 'СЛУЖБИ ВУЗЛА',
      labelB: 'ЖУРНАЛ ПОДІЙ',
    },
    aanmelden: {
      stempel: 'БРАМА ВХОДУ · ЗАХИСТ',
      cursief: 'Особистий ключ',
      labelA: 'БЕЗПАРОЛЬНИЙ ВХІД',
      labelB: 'ВЛАСНИЙ ПРОСТІР',
    },
    gast: {
      stempel: 'ОГЛЯД · ВІДКРИТІСТЬ',
      cursief: 'Світла вітрина',
      labelA: 'ЗНАЙОМСТВО',
      labelB: 'ОГЛЯДОВИЙ РЕЖИМ',
    },
    'niet-gevonden': {
      stempel: 'ЗА МЕЖАМИ КАРТИ',
      cursief: 'Новий обрій',
      labelA: 'МАРШРУТ 404',
      labelB: 'КОМПАС ПОВЕРНЕННЯ',
    },
  },
  nl: {
    identity: {
      stempel: 'IDENTITEIT · VERTROUWEN',
      cursief: 'Eigen kern',
      labelA: 'TOEGANGSSLEUTEL',
      labelB: 'BEVESTIGD',
    },
    hub: {
      stempel: 'MIJN RUIMTE · KERN',
      cursief: 'Één thuis',
      labelA: 'ALLE DIENSTEN SAMEN',
      labelB: 'AFGESTEMDE STAAT',
    },
    ai: {
      stempel: 'SLIMME ASSISTENT',
      cursief: 'Heldere gedachte',
      labelA: 'GESPREKSCONTEXT',
      labelB: 'ZORGVULDIG ANTWOORD',
    },
    mail: {
      stempel: 'CORRESPONDENTIE · RUST',
      cursief: 'Stille postbus',
      labelA: 'GECONTROLEERDE POST',
      labelB: 'ZUIVERE STROOM',
    },
    cloud: {
      stempel: 'OPSLAG · BESCHERMING',
      cursief: 'Eigen kluis',
      labelA: 'VERSLEUTELDE VOLUMES',
      labelB: 'BESTANDSINTEGRITEIT',
    },
    github: {
      stempel: 'BRONBOOM · HANDTEKENING',
      cursief: 'Zuivere lijn',
      labelA: 'GEVERIFIEERDE TAK',
      labelB: 'VASTE AFDRUK',
    },
    huis: {
      stempel: 'WONEN · GEBORGENHEID',
      cursief: 'Warmte thuis',
      labelA: 'KLIMAAT EN LICHT',
      labelB: 'STILLE AVOND · 21,5°',
    },
    mcp: {
      stempel: 'AFSTEMMING · KNOPEN',
      cursief: 'Gedeeld geheugen',
      labelA: 'CONTEXTBRUG',
      labelB: 'WACHTRIJ IN BALANS',
    },
    api: {
      stempel: 'POORTEN · CONTRACTEN',
      cursief: 'Helder verkeer',
      labelA: 'VERZOEKSCHEMA',
      labelB: 'GECONTROLEERD ANTWOORD',
    },
    admin: {
      stempel: 'BEHEER · INTEGRITEIT',
      cursief: 'Vaste orde',
      labelA: 'SYSTEEMDIENSTEN',
      labelB: 'CONTROLELOGBOEK',
    },
    aanmelden: {
      stempel: 'TOEGANG · BESCHERMING',
      cursief: 'Persoonlijke sleutel',
      labelA: 'WACHTWOORDLOOS',
      labelB: 'EIGEN DOMEIN',
    },
    gast: {
      stempel: 'KENNISMAKING · OPENHEID',
      cursief: 'Open etalage',
      labelA: 'RONDLEIDING',
      labelB: 'GASTWEERGAVE',
    },
    'niet-gevonden': {
      stempel: 'BUITEN DE KAART',
      cursief: 'Nieuwe horizon',
      labelA: 'ROUTE 404',
      labelB: 'KOMPAS NAAR HUIS',
    },
  },
};

function VensterStippen() {
  return (
    <div className="mq-venster-stippen">
      <i />
      <i />
      <i />
    </div>
  );
}

function IcoonSleutel() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="12" r="4.2" />
      <path d="M12.7 12H21m-3 0v3m-3-3v2" />
    </svg>
  );
}

function IcoonSchild() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.8 19.5 6v5.8c0 4.6-3.1 8.4-7.5 9.6-4.4-1.2-7.5-5-7.5-9.6V6L12 2.8Z" />
      <path d="m9 12.2 2.1 2.1 4.1-4.2" />
    </svg>
  );
}

function IcoonHuis() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3.5 11.2 8.5-7 8.5 7v8.3a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-8.3Z" />
      <path d="M9.5 21v-6.5h5V21" />
    </svg>
  );
}

function IcoonBrief() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6.5L20 7" />
    </svg>
  );
}

function IcoonWolk() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.2 18.8h10.3a3.8 3.8 0 0 0 .4-7.6A6.2 6.2 0 0 0 6 8.8a4.7 4.7 0 0 0 1.2 10Z" />
    </svg>
  );
}

function IcoonCode() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m8 6-5 6 5 6m8-12 5 6-5 6m-2-14-4 16" />
    </svg>
  );
}

function IcoonVonk() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 2.3 6.2L20.5 12l-6.2 2.8L12 21l-2.3-6.2L3.5 12l6.2-2.8L12 3Z" />
    </svg>
  );
}

function IcoonKnopen() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <circle cx="12" cy="17.5" r="2.5" />
      <path d="M8.3 8.2 10.6 15m4.8 0 2.3-6.8M8.5 7h7" />
    </svg>
  );
}

function IcoonKompas() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.8" />
      <path d="m15.8 8.2-2.2 5.4-5.4 2.2 2.2-5.4 5.4-2.2Z" />
    </svg>
  );
}

function renderToneel(soort: MaquetteKunstSoort, t: KunstTeksten): ReactNode {
  switch (soort) {
    case 'identity':
      return (
        <>
          <div className="mq-kunst-baan elips-a stippel" />
          <div className="mq-kunst-baan elips-b" />
          <div className="mq-kunst-bol" />
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '178px', right: '-4px', top: '26px', transform: 'rotate(5deg)' }}
          >
            <VensterStippen />
            <span className="mq-venster-label">{t.labelA}</span>
            <span className="mq-venster-cursief" style={{ marginTop: '5px' }}>{t.cursief}</span>
            <div className="mq-venster-rij">
              <span className="mq-venster-icoon"><IcoonSleutel /></span>
              <span className="mq-venster-balk" style={{ width: '82px' }} />
            </div>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '146px', left: '0px', bottom: '36px', transform: 'rotate(-6deg)' }}
          >
            <div className="mq-venster-rij" style={{ margin: 0 }}>
              <span className="mq-venster-icoon"><IcoonSchild /></span>
              <div>
                <span className="mq-venster-label">{t.labelB}</span>
                <span className="mq-venster-balk" style={{ width: '64px', marginTop: '5px' }} />
              </div>
            </div>
          </div>
          <span className="mq-kunst-vonk" style={{ top: '24px', left: '48px', fontSize: '19px' }}>✦</span>
          <span className="mq-kunst-vonk" style={{ bottom: '44px', right: '32px', fontSize: '14px' }}>✧</span>
        </>
      );

    case 'hub':
      return (
        <>
          <div className="mq-kunst-baan kring-groot stippel">
            <span className="mq-baan-satelliet" style={{ top: '-18px', left: '102px' }}><IcoonHuis /></span>
            <span className="mq-baan-satelliet" style={{ bottom: '20px', right: '-12px' }}><IcoonBrief /></span>
            <span className="mq-baan-satelliet" style={{ bottom: '24px', left: '-12px' }}><IcoonWolk /></span>
          </div>
          <div className="mq-kunst-baan elips-b" />
          <div className="mq-kunst-bol" style={{ display: 'grid', placeItems: 'center' }}>
            <svg viewBox="0 0 64 64" width="66" height="66" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="1.9">
              <path d="M32 7 54 19.5v25L32 57 10 44.5v-25L32 7Z" />
              <path d="m18 42 14-22 14 22M23.5 35.5h17" strokeLinecap="round" />
            </svg>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '176px', right: '-6px', bottom: '34px', transform: 'rotate(-4deg)' }}
          >
            <span className="mq-venster-label">{t.labelA}</span>
            <span className="mq-venster-cursief" style={{ marginTop: '4px' }}>{t.cursief}</span>
            <div className="mq-venster-rij" style={{ marginBottom: 0 }}>
              <span className="mq-venster-balk" style={{ width: '96px' }} />
              <span className="mq-venster-label">{t.labelB.split(' ')[0]}</span>
            </div>
          </div>
          <span className="mq-kunst-vonk" style={{ top: '22px', right: '42px', fontSize: '18px' }}>✦</span>
        </>
      );

    case 'ai':
      return (
        <>
          <svg
            viewBox="0 0 300 260"
            width="290"
            height="250"
            fill="none"
            style={{ position: 'absolute', inset: '12px', pointerEvents: 'none', opacity: 0.72 }}
          >
            <path d="M44 176C94 82 206 82 256 176" stroke="rgba(235, 205, 255, 0.34)" strokeWidth="1.3" strokeDasharray="4 5" />
            <path d="M58 84c56 64 128 64 184 0" stroke="rgba(255, 196, 232, 0.28)" strokeWidth="1.2" />
            <circle cx="58" cy="84" r="4" fill="rgba(249, 216, 255, 0.95)" />
            <circle cx="242" cy="84" r="4" fill="rgba(212, 190, 255, 0.95)" />
            <circle cx="150" cy="42" r="4.5" fill="rgba(255, 255, 255, 0.96)" />
          </svg>
          <div className="mq-kunst-baan elips-a stippel">
            <span className="mq-baan-satelliet" style={{ top: '-18px', left: '124px' }}><IcoonVonk /></span>
          </div>
          <div className="mq-kunst-bol klein" />
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '164px', left: '0px', top: '28px', transform: 'rotate(-5deg)' }}
          >
            <span className="mq-venster-label">{t.labelA}</span>
            <span className="mq-venster-balk" style={{ width: '112px', marginTop: '8px' }} />
            <span className="mq-venster-balk" style={{ width: '76px', marginTop: '6px', opacity: 0.65 }} />
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '178px', right: '-4px', bottom: '34px', transform: 'rotate(4deg)' }}
          >
            <div className="mq-venster-rij" style={{ marginTop: 0 }}>
              <span className="mq-venster-icoon"><IcoonVonk /></span>
              <span className="mq-venster-label">{t.labelB}</span>
            </div>
            <span className="mq-venster-cursief">{t.cursief}</span>
          </div>
          <span className="mq-kunst-vonk" style={{ top: '26px', right: '42px', fontSize: '21px' }}>✳</span>
          <span className="mq-kunst-vonk" style={{ bottom: '48px', left: '34px', fontSize: '15px' }}>✦</span>
        </>
      );

    case 'mail':
      return (
        <>
          <div className="mq-kunst-baan elips-a stippel" />
          <div className="mq-kunst-baan kring-middel" />
          <div className="mq-kunst-bol klein" style={{ transform: 'translate(-32px, -16px)' }} />
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '198px', right: '4px', top: '38px', transform: 'rotate(-4deg)' }}
          >
            <VensterStippen />
            <svg viewBox="0 0 160 62" width="100%" height="54" fill="none" style={{ display: 'block', marginBottom: '8px' }}>
              <rect x="2" y="4" width="156" height="54" rx="10" stroke="rgba(226,238,255,0.45)" fill="rgba(18,34,64,0.38)" />
              <path d="m6 9 74 34L154 9" stroke="rgba(216,234,255,0.82)" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="mq-venster-cursief">{t.cursief}</span>
            <span className="mq-venster-label" style={{ marginTop: '4px' }}>{t.labelA}</span>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '152px', left: '2px', bottom: '36px', transform: 'rotate(5deg)' }}
          >
            <div className="mq-venster-rij" style={{ margin: 0 }}>
              <span className="mq-venster-icoon"><IcoonBrief /></span>
              <div>
                <span className="mq-venster-label">{t.labelB}</span>
                <span className="mq-venster-balk" style={{ width: '68px', marginTop: '5px' }} />
              </div>
            </div>
          </div>
          <span className="mq-kunst-vonk" style={{ top: '24px', left: '46px', fontSize: '17px' }}>✦</span>
        </>
      );

    case 'cloud':
      return (
        <>
          <div className="mq-kunst-baan kring-groot stippel">
            <span className="mq-baan-satelliet" style={{ top: '24px', right: '-6px' }}><IcoonSchild /></span>
          </div>
          <div className="mq-kunst-bol" style={{ display: 'grid', placeItems: 'center' }}>
            <svg viewBox="0 0 88 64" width="88" height="64" fill="none">
              <path
                d="M23 50h42a13.5 13.5 0 0 0 1.4-26.9A21.5 21.5 0 0 0 25.2 16 16.5 16.5 0 0 0 23 50Z"
                fill="rgba(235, 250, 255, 0.22)"
                stroke="rgba(235, 252, 255, 0.88)"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '174px', left: '-2px', top: '26px', transform: 'rotate(-5deg)' }}
          >
            <span className="mq-venster-label">{t.labelA}</span>
            <span className="mq-venster-cursief" style={{ marginTop: '4px' }}>{t.cursief}</span>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '168px', right: '-2px', bottom: '34px', transform: 'rotate(4deg)' }}
          >
            <div className="mq-venster-rij" style={{ margin: 0 }}>
              <span className="mq-venster-icoon"><IcoonWolk /></span>
              <div>
                <span className="mq-venster-label">{t.labelB}</span>
                <span className="mq-venster-balk" style={{ width: '78px', marginTop: '6px' }} />
              </div>
            </div>
          </div>
          <span className="mq-kunst-vonk" style={{ top: '30px', right: '38px', fontSize: '16px' }}>✧</span>
        </>
      );

    case 'github':
      return (
        <>
          <div className="mq-kunst-baan elips-b stippel">
            <span className="mq-baan-satelliet" style={{ top: '-18px', left: '82px' }}><IcoonCode /></span>
          </div>
          <div className="mq-kunst-bol klein" style={{ transform: 'translate(34px, -18px)' }} />
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '204px', left: '4px', top: '34px', transform: 'rotate(-3deg)' }}
          >
            <VensterStippen />
            <svg viewBox="0 0 170 68" width="100%" height="62" fill="none" style={{ display: 'block', marginBottom: '6px' }}>
              <path d="M22 16h126M22 16c26 0 32 34 62 34h42" stroke="rgba(215,230,255,0.78)" strokeWidth="2" strokeLinecap="round" />
              <circle cx="22" cy="16" r="5" fill="rgba(239, 245, 255, 0.96)" />
              <circle cx="88" cy="16" r="5" fill="rgba(197, 212, 238, 0.96)" />
              <circle cx="148" cy="16" r="5" fill="rgba(239, 245, 255, 0.96)" />
              <circle cx="84" cy="50" r="5" fill="rgba(155, 191, 255, 0.96)" />
              <circle cx="126" cy="50" r="5" fill="rgba(239, 245, 255, 0.96)" />
            </svg>
            <span className="mq-venster-cursief">{t.cursief}</span>
            <span className="mq-venster-label" style={{ marginTop: '4px' }}>{t.labelA}</span>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '152px', right: '0px', bottom: '34px', transform: 'rotate(5deg)' }}
          >
            <span className="mq-venster-label">{t.labelB}</span>
            <span className="mq-venster-balk" style={{ width: '96px', marginTop: '7px' }} />
          </div>
          <span className="mq-kunst-vonk" style={{ bottom: '48px', left: '26px', fontSize: '15px' }}>✦</span>
        </>
      );

    case 'huis':
      return (
        <>
          <div className="mq-kunst-baan kring-groot stippel">
            <span className="mq-baan-satelliet" style={{ top: '20px', left: '6px' }}><IcoonHuis /></span>
          </div>
          <div className="mq-kunst-bol" style={{ display: 'grid', placeItems: 'center' }}>
            <svg viewBox="0 0 76 76" width="74" height="74" fill="none" stroke="rgba(255,244,224,0.9)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 36 38 15l26 21" />
              <path d="M20 33v25h36V33" />
              <circle cx="38" cy="42" r="7" fill="rgba(255,214,152,0.32)" />
            </svg>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '176px', right: '-4px', top: '28px', transform: 'rotate(4deg)' }}
          >
            <span className="mq-venster-label">{t.labelA}</span>
            <span className="mq-venster-cursief" style={{ marginTop: '5px' }}>{t.cursief}</span>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '164px', left: '0px', bottom: '34px', transform: 'rotate(-4deg)' }}
          >
            <span className="mq-venster-label">{t.labelB}</span>
            <span className="mq-venster-balk" style={{ width: '92px', marginTop: '7px' }} />
          </div>
          <span className="mq-kunst-vonk" style={{ top: '24px', left: '48px', fontSize: '18px' }}>✦</span>
        </>
      );

    case 'mcp':
      return (
        <>
          <div className="mq-kunst-baan kring-groot stippel">
            <span className="mq-baan-satelliet" style={{ top: '-18px', left: '104px' }}><IcoonKnopen /></span>
            <span className="mq-baan-satelliet" style={{ bottom: '-18px', left: '104px' }}><IcoonCode /></span>
          </div>
          <div className="mq-kunst-baan kring-middel" />
          <div className="mq-kunst-bol klein" style={{ display: 'grid', placeItems: 'center' }}>
            <svg viewBox="0 0 64 64" width="58" height="58" fill="none" stroke="rgba(232,255,244,0.92)" strokeWidth="1.9">
              <circle cx="18" cy="20" r="5" />
              <circle cx="46" cy="20" r="5" />
              <circle cx="32" cy="46" r="5" />
              <path d="M23 20h18M20.5 24.5 29.5 41.5M43.5 24.5 34.5 41.5" />
            </svg>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '176px', right: '-6px', top: '28px', transform: 'rotate(5deg)' }}
          >
            <span className="mq-venster-label">{t.labelA}</span>
            <span className="mq-venster-cursief" style={{ marginTop: '4px' }}>{t.cursief}</span>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '158px', left: '-4px', bottom: '36px', transform: 'rotate(-5deg)' }}
          >
            <span className="mq-venster-label">{t.labelB}</span>
            <span className="mq-venster-balk" style={{ width: '88px', marginTop: '7px' }} />
          </div>
        </>
      );

    case 'api':
      return (
        <>
          <svg
            viewBox="0 0 300 260"
            width="290"
            height="250"
            fill="none"
            style={{ position: 'absolute', inset: '14px', pointerEvents: 'none', opacity: 0.78 }}
          >
            <path d="M20 132c45-48 90 48 135 0s90-48 125 0" stroke="rgba(255, 182, 218, 0.52)" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M20 156c45 42 90-42 135 0s90 42 125 0" stroke="rgba(196, 214, 255, 0.34)" strokeWidth="1.3" strokeDasharray="4 4" />
          </svg>
          <div className="mq-kunst-baan elips-a stippel" />
          <div className="mq-kunst-bol klein" />
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '180px', left: '0px', top: '26px', transform: 'rotate(-4deg)' }}
          >
            <VensterStippen />
            <span className="mq-venster-label">{t.labelA}</span>
            <span className="mq-venster-cursief" style={{ marginTop: '4px' }}>{t.cursief}</span>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '166px', right: '0px', bottom: '34px', transform: 'rotate(4deg)' }}
          >
            <div className="mq-venster-rij" style={{ margin: 0 }}>
              <span className="mq-venster-icoon"><IcoonCode /></span>
              <div>
                <span className="mq-venster-label">{t.labelB}</span>
                <span className="mq-venster-balk" style={{ width: '72px', marginTop: '5px' }} />
              </div>
            </div>
          </div>
          <span className="mq-kunst-vonk" style={{ top: '28px', right: '36px', fontSize: '18px' }}>✦</span>
        </>
      );

    case 'admin':
      return (
        <>
          <div className="mq-kunst-baan kring-groot stippel">
            <span className="mq-baan-satelliet" style={{ top: '24px', right: '-4px' }}><IcoonSleutel /></span>
          </div>
          <div className="mq-kunst-schild">
            <IcoonSchild />
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '172px', left: '-4px', top: '28px', transform: 'rotate(-5deg)' }}
          >
            <span className="mq-venster-label">{t.labelA}</span>
            <span className="mq-venster-cursief" style={{ marginTop: '4px' }}>{t.cursief}</span>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '164px', right: '-4px', bottom: '34px', transform: 'rotate(4deg)' }}
          >
            <span className="mq-venster-label">{t.labelB}</span>
            <div className="mq-venster-rij" style={{ marginBottom: 0 }}>
              <span className="mq-venster-balk" style={{ width: '92px' }} />
            </div>
          </div>
          <span className="mq-kunst-vonk" style={{ bottom: '46px', left: '28px', fontSize: '16px' }}>✧</span>
        </>
      );

    case 'aanmelden':
      return (
        <>
          <div className="mq-kunst-baan elips-a stippel" />
          <div className="mq-kunst-baan elips-b" />
          <div className="mq-kunst-bol" style={{ transform: 'translate(-18px, -6px)' }} />
          <div
            className="mq-kunst-schild"
            style={{ position: 'absolute', right: '34px', top: '44px', width: '112px', height: '130px' }}
          >
            <IcoonSleutel />
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '186px', left: '4px', bottom: '34px', transform: 'rotate(-4deg)' }}
          >
            <span className="mq-venster-label">{t.labelA}</span>
            <span className="mq-venster-cursief" style={{ marginTop: '4px' }}>{t.cursief}</span>
            <div className="mq-venster-rij" style={{ marginBottom: 0 }}>
              <span className="mq-venster-icoon"><IcoonSchild /></span>
              <span className="mq-venster-label">{t.labelB}</span>
            </div>
          </div>
          <span className="mq-kunst-vonk" style={{ top: '22px', left: '54px', fontSize: '20px' }}>✦</span>
        </>
      );

    case 'gast':
      return (
        <>
          <div className="mq-kunst-baan kring-groot stippel">
            <span className="mq-baan-satelliet" style={{ top: '-18px', left: '104px' }}><IcoonKompas /></span>
          </div>
          <div className="mq-kunst-bol" style={{ display: 'grid', placeItems: 'center' }}>
            <svg viewBox="0 0 72 72" width="68" height="68" fill="none" stroke="rgba(236,255,252,0.92)" strokeWidth="1.8">
              <path d="M18 56V32a18 18 0 0 1 36 0v24" />
              <path d="M12 56h48" strokeLinecap="round" />
              <circle cx="36" cy="30" r="5" fill="rgba(255,255,255,0.45)" />
            </svg>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '178px', right: '-2px', bottom: '34px', transform: 'rotate(4deg)' }}
          >
            <span className="mq-venster-label">{t.labelA}</span>
            <span className="mq-venster-cursief" style={{ marginTop: '4px' }}>{t.cursief}</span>
            <span className="mq-venster-label" style={{ marginTop: '6px', opacity: 0.72 }}>{t.labelB}</span>
          </div>
          <span className="mq-kunst-vonk" style={{ top: '28px', left: '38px', fontSize: '18px' }}>✦</span>
        </>
      );

    case 'niet-gevonden':
      return (
        <>
          <div className="mq-kunst-baan kring-groot stippel" />
          <div className="mq-kunst-baan elips-a" />
          <div className="mq-kunst-bol klein" style={{ display: 'grid', placeItems: 'center' }}>
            <svg viewBox="0 0 64 64" width="58" height="58" fill="none" stroke="rgba(236,244,255,0.92)" strokeWidth="1.8">
              <circle cx="32" cy="32" r="22" strokeOpacity="0.45" />
              <path d="m42 22-6.5 13.5L22 42l6.5-13.5L42 22Z" fill="rgba(196,216,255,0.28)" />
            </svg>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '174px', right: '0px', top: '28px', transform: 'rotate(5deg)' }}
          >
            <span className="mq-venster-label">{t.labelA}</span>
            <span className="mq-venster-cursief" style={{ marginTop: '4px' }}>{t.cursief}</span>
          </div>
          <div
            className="mq-zwevend-venster floating-window"
            style={{ width: '164px', left: '0px', bottom: '36px', transform: 'rotate(-5deg)' }}
          >
            <div className="mq-venster-rij" style={{ margin: 0 }}>
              <span className="mq-venster-icoon"><IcoonKompas /></span>
              <span className="mq-venster-label">{t.labelB}</span>
            </div>
          </div>
          <span className="mq-kunst-vonk" style={{ top: '24px', left: '42px', fontSize: '19px' }}>✦</span>
          <span className="mq-kunst-vonk" style={{ bottom: '44px', right: '34px', fontSize: '15px' }}>✧</span>
        </>
      );
  }
}

export function MaquetteKunst({
  soort,
  lang = 'uk',
  variant = 'held',
  className = '',
}: MaquetteKunstProps) {
  const taal = lang === 'nl' ? 'nl' : 'uk';
  const t = TEKSTEN[taal][soort] ?? TEKSTEN[taal].identity;
  const klassen = ['mq-kunst-raam', variant === 'held' ? 'is-held' : 'is-kaart', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={klassen} data-mq-dienst={soort} aria-hidden="true">
      <div className="mq-kunst-toneel">{renderToneel(soort, t)}</div>
      <span className="mq-kunst-stempel">{t.stempel}</span>
    </div>
  );
}
