// Канонічна сторінка налаштувань та керування єдиною екосистемою сповіщень (https://id.tarasevych.com/melding, GEMINI-002).
// Забезпечує суворе розмежування просторів `prive` та `technisch`, реактивну синхронізацію режиму порталу,
// живий тренажер змахів, перегляд усіх форматів вкладень і генератор тестових подій.

import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Bot,
  FileCode2,
  FlaskConical,
  Hand,
  Layers,
  Lock,
  Maximize2,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import {
  AI_AANBIEDERS_KEUZE,
  AI_MODI,
  KANALEN,
  PRIORITEITEN,
  VEEG_ACTIES,
  VENSTER_MODI,
  interneAiAnalyse,
  kanaalLabel,
  prioriteitLabel,
  standaardProfiel,
  type AiAanbiederKeuze,
  type AiModus,
  type MeldingBijlage,
  type MeldingEcosysteemGebeurtenis,
  type MeldingEcosysteemProfiel,
  type MeldingGebeurtenisStatus,
  type MeldingKanaal,
  type MeldingPrioriteit,
  type RuimteType,
  type VeegActie,
  type VensterModus,
} from '../../../shared/meldingen-ecosysteem';
import {
  MELDINGEN_OPENEN_EVENT,
  emitCanonicalNotice,
  publiceerPaginaSignaal,
} from '../../canoniek-meldingen';
import {
  MeldingBijlageSpeler,
  MeldingVeegKaart,
  bewaarProfielOpServer,
  haalProfielVanServer,
  leesLokaalProfiel,
  useEcosysteemModusActief,
  zetEcosysteemModusActief,
} from '../../meldingen/ecosysteem';
import MeldingVoorkeurenPaneel from '../../meldingen/MeldingVoorkeurenPaneel';
import { useHuidigeRuimte } from '../../tech/ruimtes/ruimte-signaal';
import { useTech } from '../../tech/tech-opslag';
import { useZijbalkVoorkeuren, zetZijbalk } from '../../zijbalk-voorkeuren'; // ДУБЛІ-001: одне сховище тихих годин
import MeldingRegisterVerkenner from './MeldingRegisterVerkenner';
import './melding-pagina.css';

type Props = {
  lang: 'uk' | 'nl';
  scope: string;
  techTypen?: boolean;
};

function maakDemoWavBase64(): string {
  // Формуємо справжній короткий WAV (8000 Гц, 8-біт, моно, 0.25 с) для безпечного локального відтворення.
  const samples = 2000;
  const bytes = new Uint8Array(44 + samples);
  const wStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) bytes[off + i] = s.charCodeAt(i);
  };
  const w32 = (off: number, val: number) => {
    bytes[off] = val & 0xff;
    bytes[off + 1] = (val >>> 8) & 0xff;
    bytes[off + 2] = (val >>> 16) & 0xff;
    bytes[off + 3] = (val >>> 24) & 0xff;
  };
  const w16 = (off: number, val: number) => {
    bytes[off] = val & 0xff;
    bytes[off + 1] = (val >>> 8) & 0xff;
  };
  wStr(0, 'RIFF');
  w32(4, 36 + samples);
  wStr(8, 'WAVEfmt ');
  w32(16, 16);
  w16(20, 1);
  w16(22, 1);
  w32(24, 8000);
  w32(28, 8000);
  w16(32, 1);
  w16(34, 8);
  wStr(36, 'data');
  w32(40, samples);
  for (let i = 0; i < samples; i += 1) {
    const tSec = i / 8000;
    const env = Math.max(0, 1 - i / samples);
    const s = Math.sin(2 * Math.PI * 523.25 * tSec) * 40 * env;
    bytes[44 + i] = Math.max(0, Math.min(255, Math.round(128 + s)));
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return typeof btoa === 'function' ? btoa(bin) : '';
}

function maakVoorbeeldBijlagen(lang: 'uk' | 'nl'): MeldingBijlage[] {
  const uk = lang === 'uk';
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 150">',
    '<rect width="360" height="150" rx="18" fill="#0f2530"/>',
    '<circle cx="76" cy="75" r="38" fill="#2cc2b3" opacity="0.24"/>',
    '<path d="M56 77 L70 91 L98 60" stroke="#47e3d4" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    `<text x="134" y="68" fill="#eaf7f6" font-size="16" font-family="sans-serif" font-weight="700">${uk ? 'Екосистема сповіщень' : 'Meldings-ecosysteem'}</text>`,
    `<text x="134" y="94" fill="#9cc6cc" font-size="12" font-family="sans-serif">${uk ? 'Вбудований векторний перегляд' : 'Ingebouwde vectorweergave'}</text>`,
    '</svg>',
  ].join('');
  const hexBytes = new Uint8Array([0x54, 0x53, 0x56, 0x00, 0x4d, 0x52, 0x2d, 0x30, 0x32, 0xde, 0xad, 0xbe, 0xef, 0x20, 0x4f, 0x4b]);
  let hexB64 = '';
  for (let i = 0; i < hexBytes.length; i += 1) hexB64 += String.fromCharCode(hexBytes[i]);
  const wavB64 = maakDemoWavBase64();

  return [
    {
      id: 'demo-svg',
      naam: 'shema-ecosysteem.svg',
      mime: 'image/svg+xml',
      grootteBytes: svg.length,
      inhoudBase64: typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(svg))) : undefined,
      tekstVoorbeeld: svg,
      bronDienst: 'hub',
    },
    {
      id: 'demo-wav',
      naam: 'sygnaal-toon.wav',
      mime: 'audio/wav',
      grootteBytes: 2044,
      ...(wavB64 ? { inhoudBase64: wavB64 } : {}),
      bronDienst: 'systeem',
    },
    {
      id: 'demo-csv',
      naam: 'kanalen-overzicht.csv',
      mime: 'text/csv',
      grootteBytes: 184,
      tekstVoorbeeld: uk
        ? 'Канал,Піддомен,Стан,Пріоритет\nБезпека,id,Активний,Критичний\nПошта,mail,Активний,Звичайний\nШІ,ai,Активний,Високий'
        : 'Kanaal,Subdomein,Status,Prioriteit\nBeveiliging,id,Actief,Kritiek\nPost,mail,Actief,Normaal\nAI,ai,Actief,Hoog',
      bronDienst: 'admin',
    },
    {
      id: 'demo-diff',
      naam: 'profiel-regels.diff',
      mime: 'text/x-diff',
      grootteBytes: 210,
      tekstVoorbeeld: '--- a/beleid.json\n+++ b/beleid.json\n@@ -1,3 +1,4 @@\n contextAdaptatie: true,\n+veegBeschermingBeveiliging: true,\n bewaarDagen: 30',
      bronDienst: 'github',
    },
    {
      id: 'demo-ics',
      naam: 'controle-afspraak.ics',
      mime: 'text/calendar',
      grootteBytes: 245,
      tekstVoorbeeld: [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        `SUMMARY:${uk ? 'Аудит безпеки ключів' : 'Sleutelcontrole en audit'}`,
        'DTSTART:20261115T090000Z',
        'DTEND:20261115T094500Z',
        'LOCATION:https://id.tarasevych.com',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\n'),
      bronDienst: 'hub',
    },
    {
      id: 'demo-vcf',
      naam: 'contact-beheer.vcf',
      mime: 'text/vcard',
      grootteBytes: 148,
      tekstVoorbeeld: 'BEGIN:VCARD\nFN:Olena Koval\nORG:Mijn Ruimte (Demo)\nEMAIL:olena.koval@example.test\nEND:VCARD',
      bronDienst: 'mail',
    },
    {
      id: 'demo-json',
      naam: 'gebeurtenis-meta.json',
      mime: 'application/json',
      grootteBytes: 170,
      tekstVoorbeeld: JSON.stringify({ dienst: 'hub', ruimte: 'prive', status: 'actief', geschoondVoorAi: true }, null, 2),
      bronDienst: 'api',
    },
    {
      id: 'demo-hex',
      naam: 'handtekening-blok.bin',
      mime: 'application/octet-stream',
      grootteBytes: hexBytes.length,
      ...(typeof btoa === 'function' ? { inhoudBase64: btoa(hexB64) } : {}),
      bronDienst: 'systeem',
    },
  ];
}

const MODUS_LABELS: Record<VensterModus, [string, string]> = {
  kompakt: ['Компактне (360 px)', 'Compact (360 px)'],
  normaal: ['Звичайне (460 px)', 'Normaal (460 px)'],
  breed: ['Широке (680 px)', 'Breed (680 px)'],
  volledig: ['На весь робочий екран', 'Volledig werkvenster'],
};

const VEEG_LABELS: Record<VeegActie, [string, string]> = {
  gelezen: ['Позначити прочитаним', 'Als gelezen markeren'],
  archief: ['Перенести в архів', 'Archiveren'],
  uitstellen: ['Відкласти на 30 хв', '30 min uitstellen'],
  uitklappen: ['Розгорнути деталі', 'Details uitklappen'],
  geen: ['Вимкнути дію', 'Geen actie'],
};

const AI_MODUS_LABELS: Record<AiModus, [string, string]> = {
  beide: ['Внутрішній ШІ + зовнішній постачальник (за вибором)', 'Interne AI + externe aanbieder (naar keuze)'],
  intern: ['Лише локальний внутрішній ШІ (без виходу за сайт)', 'Alleen interne lokale AI (binnen de site)'],
  extern: ['Переважно зовнішній ШІ після очищення таємниць', 'Vooral externe AI na opschonen van geheimen'],
  uit: ['Вимкнено', 'Uitgeschakeld'],
};

export default function MeldingEcosysteemPagina({ lang, scope, techTypen }: Props) {
  const uk = lang === 'uk';
  const t = (a: string, b: string) => (uk ? a : b);
  const tech = useTech();
  const huidigeRuimte = useHuidigeRuimte();
  const magTechnisch = Boolean(techTypen ?? tech.profiel);

  const [bewerkRuimte, setBewerkRuimte] = useState<RuimteType>(() =>
    magTechnisch && huidigeRuimte === 'technisch' ? 'technisch' : 'prive',
  );

  // Якщо права на технічний простір зникли — негайно повертаємося до особистого.
  useEffect(() => {
    if (!magTechnisch && bewerkRuimte !== 'prive') {
      setBewerkRuimte('prive');
    }
  }, [magTechnisch, bewerkRuimte]);

  const ruimte: RuimteType = magTechnisch ? bewerkRuimte : 'prive';
  const ecosysteemActief = useEcosysteemModusActief();

  const [profiel, setProfiel] = useState<MeldingEcosysteemProfiel>(() => leesLokaalProfiel(scope, ruimte));
  const [opslaanStatus, setOpslaanStatus] = useState<string>('');
  const [trainerStatus, setTrainerStatus] = useState<MeldingGebeurtenisStatus>('nieuw');
  const [trainerKritiek, setTrainerKritiek] = useState<boolean>(false);
  const [trainerHint, setTrainerHint] = useState<string>('');
  const [actieveBijlageIdx, setActieveBijlageIdx] = useState<number>(0);

  // Змінюємо редагований профіль при перемиканні простору або облікового запису
  useEffect(() => {
    let levend = true;
    setProfiel(leesLokaalProfiel(scope, ruimte));
    void haalProfielVanServer(scope, ruimte).then((vanServer) => {
      if (levend) setProfiel(vanServer);
    });
    return () => {
      levend = false;
    };
  }, [scope, ruimte]);

  // ДУБЛІ-001: тихі години діють через zijbalk.meldingen.stil (центр сповіщень, мітки меню); профіль екосистеми лише віддзеркалює їх,
  // тож двох різних значень більше немає. Stille uren: één opslag, het profiel spiegelt mee.
  const stil = useZijbalkVoorkeuren().meldingen.stil;
  const zetStil = (patch: { aan?: boolean; van?: string; tot?: string }) => {
    zetZijbalk((cur) => ({ ...cur, meldingen: { ...cur.meldingen, stil: { ...cur.meldingen.stil, ...patch } } }));
    slaProfielOp((c) => ({ ...c, stilleUren: { ...c.stilleUren, ...(patch.aan !== undefined ? { actief: patch.aan } : {}), ...(patch.van ? { van: patch.van } : {}), ...(patch.tot ? { tot: patch.tot } : {}) } }));
  };
  const slaProfielOp = (updater: (cur: MeldingEcosysteemProfiel) => MeldingEcosysteemProfiel) => {
    setProfiel((cur) => {
      const volgende = updater(cur);
      void bewaarProfielOpServer(scope, ruimte, volgende).then(() => {
        setOpslaanStatus(
          t('Профіль простору збережено й синхронізовано.', 'Ruimteprofiel bewaard en gesynchroniseerd.'),
        );
      });
      return volgende;
    });
  };

  // Тестовий генератор у пісочниці
  const [zandbakKanaal, setZandbakKanaal] = useState<MeldingKanaal>('app');
  const [zandbakPrioriteit, setZandbakPrioriteit] = useState<MeldingPrioriteit>('normaal');
  const [zandbakTekst, setZandbakTekst] = useState<string>('');
  const [zandbakGemeld, setZandbakGemeld] = useState<string>('');

  const demoBijlagen = useMemo(() => maakVoorbeeldBijlagen(lang), [lang]);

  const trainerGebeurtenis: MeldingEcosysteemGebeurtenis = useMemo(
    () => ({
      id: `demo-veeg-${ruimte}-${trainerKritiek ? 'krit' : 'norm'}`,
      ruimte,
      externeSleutel: `demo:veeg:${ruimte}`,
      kanaal: trainerKritiek ? 'beveiliging' : 'app',
      subdomein: trainerKritiek ? 'id' : 'hub',
      bron: trainerKritiek ? 'id:beveiliging' : 'hub:demo',
      prioriteit: trainerKritiek ? 'kritiek' : 'normaal',
      status: trainerStatus,
      titel: trainerKritiek
        ? t('Критичний вхід з нового пристрою (тест захисту)', 'Kritieke aanmelding vanaf nieuw apparaat (beveiligingstest)')
        : t('Навчальна картка для перевірки змахів', 'Oefenkaart om veeggebaren te testen'),
      bericht: trainerKritiek
        ? t(
            'Спробуйте змахнути цю картку в архів або відкласти: система заблокує випадкове прибирання критичної безпеки.',
            'Probeer deze kaart te archiveren of uit te stellen: het systeem beschermt kritieke meldingen.',
          )
        : t(
            'Потягніть картку ліворуч або праворуч (чи скористайтеся кнопками дій) відповідно до ваших правил вище.',
            'Veeg de kaart naar links of rechts volgens uw ingestelde drempel en acties hierboven.',
          ),
      uitleg: t('Живий тренажер використовує ваші поточні налаштування змахів цього простору.', 'De oefenkaart gebruikt de actuele veegregels van deze ruimte.'),
      contextLabel: `${ruimte} · ${trainerKritiek ? 'id' : 'hub'}`,
      herhalingen: 1,
      uitgesteldTot: null,
      bijlagen: [demoBijlagen[0]],
      acties: [],
      meta: {},
      aiSamenvatting: null,
      aangemaaktOp: Date.now() - 45_000,
      bijgewerktOp: Date.now() - 45_000,
    }),
    [ruimte, trainerKritiek, trainerStatus, demoBijlagen, lang],
  );

  const zendTestMelding = () => {
    const titel =
      zandbakTekst.trim() ||
      t(
        `Перевірка каналу «${kanaalLabel(zandbakKanaal, 'uk')}»`,
        `Testmelding voor kanaal «${kanaalLabel(zandbakKanaal, 'nl')}»`,
      );
    const kind =
      zandbakPrioriteit === 'kritiek'
        ? 'error'
        : zandbakPrioriteit === 'hoog'
          ? 'warning'
          : 'info';
    emitCanonicalNotice({
      text: titel,
      kind,
      source: zandbakKanaal,
      kanaal: zandbakKanaal,
      prioriteit: zandbakPrioriteit,
      subdomein: zandbakKanaal === 'beveiliging' ? 'id' : zandbakKanaal === 'mail' ? 'mail' : 'hub',
      context: `${ruimte === 'technisch' ? t('Технічний простір', 'Technische ruimte') : t('Особистий простір', 'Privéruimte')}`,
      explain: t(
        'Тестове сповіщення надіслано через єдину шину екосистеми та містить зразок вкладення для перевірки вбудованого програвача.',
        'Testmelding verzonden via de centrale ecosysteembus met een voorbeeldbijlage voor de speler.',
      ),
      bijlagen: [demoBijlagen[0], demoBijlagen[2]],
      losseRegel: true,
    });
    publiceerPaginaSignaal({
      id: `zandbak-${Date.now()}`,
      bron: 'melding-zandbak',
      kanaal: zandbakKanaal,
      subdomein: 'id',
      soort: zandbakKanaal,
      ernst: zandbakPrioriteit === 'kritiek' ? 'kritiek' : zandbakPrioriteit === 'hoog' ? 'hoog' : 'info',
      titelUk: titel,
      titelNl: titel,
      berichtUk: 'Сигнал із пісочниці сторінки /melding — доступний у центрі сповіщень.',
      berichtNl: 'Signaal vanuit de zandbak op /melding — beschikbaar in het meldingencentrum.',
      contextLabel: `${ruimte} · ${zandbakKanaal}`,
      bijlagen: [demoBijlagen[actieveBijlageIdx]],
    });
    setZandbakGemeld(
      t(
        'Надіслано. Відкрийте портал сповіщень або перевірте спливне вікно.',
        'Verzonden. Open het ecosysteemvenster of bekijk de pop-up.',
      ),
    );
  };

  return (
    <div className='mp-pagina' data-ruimte-actief={ruimte}>
      <div className='mp-ruimte-balk'>
        <div className='mp-ruimte-info'>
          <strong>
            <ShieldCheck size={18} aria-hidden='true' />
            {t('Ізоляція та вибір простору сповіщень', 'Ruimte-isolatie voor meldingen')}
          </strong>
          <small>
            {magTechnisch
              ? t(
                  'Правила, геометрія, тихі години й ШІ зберігаються окремо для особистого й технічного просторів.',
                  'Regels, venstermaat, stille uren en AI worden strikt gescheiden bewaard per ruimte.',
                )
              : t(
                  'У цьому сеансі активний лише особистий простір — технічні правила й події повністю ізольовані.',
                  'In deze sessie is alleen de privéruimte actief — technische regels blijven strikt afgescheiden.',
                )}
          </small>
        </div>
        <div className='mp-ruimte-knoppen' role='group' aria-label={t('Вибір редагованого простору', 'Te bewerken ruimte kiezen')}>
          <button
            type='button'
            className={`mp-pil-knop${ruimte === 'prive' ? ' is-actief' : ''}`}
            data-mp-ruimte='prive'
            onClick={() => setBewerkRuimte('prive')}
          >
            {t('Особистий простір', 'Privéruimte')}
          </button>
          {magTechnisch && (
            <button
              type='button'
              className={`mp-pil-knop${ruimte === 'technisch' ? ' is-actief' : ''}`}
              data-mp-ruimte='technisch'
              onClick={() => setBewerkRuimte('technisch')}
            >
              {t('Технічний простір', 'Technische ruimte')}
            </button>
          )}
        </div>
      </div>

      {/* 1. Режим порталу й загальна поведінка */}
      <section id='melding-modus' className='mp-sectie'>
        <div className='mp-sectie-kop'>
          <div className='mp-sectie-titel'>
            <span className='mp-sectie-icoon'><Sparkles size={19} aria-hidden='true' /></span>
            <div>
              <h2>{t('Розмір єдиного Пульта уваги та загальна поведінка', 'Grootte van de ene Aandachtspuls en algemeen gedrag')}</h2>
              <p>{t('Одна спільна панель сповіщень з офіційними логотипами служб і графом першопричини у двох зручних розмірах.', 'Één gedeeld meldingenpaneel met officiële dienstlogo’s en oorzaakketens in twee handige groottes.')}</p>
            </div>
          </div>
          <button
            type='button'
            className='settings-primary'
            data-qa-id='mp-open-portaal'
            onClick={() => {
              zetEcosysteemModusActief(true);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent(MELDINGEN_OPENEN_EVENT));
              }
            }}
          >
            <Bell size={17} aria-hidden='true' />
            {t('Відкрити Пульт зараз', 'Puls nu openen')}
          </button>
        </div>

        <div className='mp-keuze-rij' role='radiogroup' aria-label={t('Розмір Пульта уваги', 'Grootte van de Aandachtspuls')}>
          <button
            type='button'
            role='radio'
            aria-checked={ecosysteemActief}
            data-mp-modus='ecosysteem'
            className={`mp-keuze-kaart${ecosysteemActief ? ' is-actief' : ''}`}
            onClick={() => zetEcosysteemModusActief(true)}
          >
            <strong><Sparkles size={16} aria-hidden='true' />{t('Розгорнуте вікно з інспектором', 'Uitgeklapt venster met inspectie')}</strong>
            <small>{t('Двоколонкове рухоме вікно поверх сторінок: граф першопричини, радіус мандата ШІ, умовне відкладення та вкладення.', 'Tweekoloms zwevend venster boven alle pagina’s: oorzaakketen, AI-mandaatstraal, voorwaardelijk uitstel en bijlagen.')}</small>
          </button>
          <button
            type='button'
            role='radio'
            aria-checked={!ecosysteemActief}
            data-mp-modus='klassiek'
            className={`mp-keuze-kaart${!ecosysteemActief ? ' is-actief' : ''}`}
            onClick={() => zetEcosysteemModusActief(false)}
          >
            <strong><Layers size={16} aria-hidden='true' />{t('Компактний пульт біля дзвіночка', 'Compacte puls bij de bel')}</strong>
            <small>{t('Той самий Пульт уваги у повітряному компактному форматі під дзвіночком із перемикачем «Вікно» в один дотик.', 'Dezelfde Aandachtspuls in luchtig compact formaat onder de bel met één-klik-schakelaar «Venster».')}</small>
          </button>
        </div>

        <div className='mp-schakel-raster'>
          <label className='mp-schakel'>
            <input
              type='checkbox'
              checked={profiel.contextAdaptatie}
              onChange={(e) => slaProfielOp((c) => ({ ...c, contextAdaptatie: e.target.checked }))}
            />
            <span>
              {t('Контекстна адаптація до піддомену', 'Contextadaptatie per subdomein')}
              <small>{t('Підлаштовує колірний акцент і швидкі фільтри під поточний сервіс (Пошта, Хмара, Дім, Безпека).', 'Past accent en snelfilters automatisch aan de huidige dienst aan.')}</small>
            </span>
          </label>
          <label className='mp-schakel'>
            <input
              type='checkbox'
              checked={profiel.toonBannersInCentrum}
              onChange={(e) => slaProfielOp((c) => ({ ...c, toonBannersInCentrum: e.target.checked }))}
            />
            <span>
              {t('Збирати інформаційні смуги й сигнали сторінок', 'Paginabanners en signalen bundelen')}
              <small>{t('Направляє попередження інтерфейсу, оновлення розширення та зв’язок безпосередньо в єдиний потік.', 'Verzamelt statusbalken, updates en verbindingsmeldingen in één stroom.')}</small>
            </span>
          </label>
          <label className='mp-schakel'>
            <input
              type='checkbox'
              checked={profiel.geluidGlobaal}
              onChange={(e) => slaProfielOp((c) => ({ ...c, geluidGlobaal: e.target.checked }))}
            />
            <span>
              {t('Звуковий супровід екосистеми', 'Geluidssignaal van ecosysteem')}
              <small>{t('Загальний дозвіл на коротке звукове сповіщення (тихі години мають перевагу).', 'Algemene toestemming voor een zacht geluidssignaal.')}</small>
            </span>
          </label>
        </div>

        <div className='mp-velden-raster'>
          <label>
            {t('Тривалість спливного сповіщення, с (2–30)', 'Duur van pop-up, s (2–30)')}
            <input
              type='number'
              min={2}
              max={30}
              value={profiel.toastSeconden}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  toastSeconden: Math.max(2, Math.min(30, Math.round(Number(e.target.value) || 4))),
                }))
              }
            />
          </label>
          <label>
            {t('Зберігати журнал подій, днів (1–365)', 'Bewaartermijn in dagen (1–365)')}
            <input
              type='number'
              min={1}
              max={365}
              value={profiel.bewaarDagen}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  bewaarDagen: Math.max(1, Math.min(365, Math.round(Number(e.target.value) || 30))),
                }))
              }
            />
          </label>
        </div>

        <div className='mp-status-regel'>
          <span role='status' aria-live='polite'>
            {opslaanStatus || t(`Редагуєте простір: ${ruimte === 'technisch' ? 'технічний' : 'особистий'}.`, `U bewerkt ruimte: ${ruimte}.`)}
          </span>
          <button
            type='button'
            className='settings-secundair'
            onClick={() => slaProfielOp(() => standaardProfiel(ruimte))}
          >
            <RotateCcw size={16} aria-hidden='true' />
            {t('Скинути профіль простору', 'Ruimteprofiel herstellen')}
          </button>
        </div>
      </section>

      {/* 2. Геометрія та незалежне розташування вікна */}
      <section id='melding-geometrie' className='mp-sectie'>
        <div className='mp-sectie-kop'>
          <div className='mp-sectie-titel'>
            <span className='mp-sectie-icoon'><Maximize2 size={19} aria-hidden='true' /></span>
            <div>
              <h2>{t('Геометрія та незалежне вікно', 'Geometrie en onafhankelijk venster')}</h2>
              <p>{t('Розміри, режим розгортання та закріплення вікна екосистеми поверх усіх шарів сайту.', 'Afmetingen, uitbreidingsmodus en vastpinnen boven alle vensters van de site.')}</p>
            </div>
          </div>
        </div>

        <div className='mp-velden-raster'>
          <label>
            {t('Стандартний режим розміру', 'Standaard venstermodus')}
            <select
              value={profiel.geometrie.modus}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  geometrie: { ...c.geometrie, modus: e.target.value as VensterModus },
                }))
              }
            >
              {VENSTER_MODI.map((m) => (
                <option key={m} value={m}>
                  {t(...MODUS_LABELS[m])}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Ширина вікна, px (310–1600)', 'Vensterbreedte, px (310–1600)')}
            <input
              type='number'
              min={310}
              max={1600}
              step={10}
              value={profiel.geometrie.breedte}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  geometrie: {
                    ...c.geometrie,
                    breedte: Math.max(310, Math.min(1600, Math.round(Number(e.target.value) || 460))),
                  },
                }))
              }
            />
          </label>
          <label>
            {t('Висота вікна, px (300–1400)', 'Vensterhoogte, px (300–1400)')}
            <input
              type='number'
              min={300}
              max={1400}
              step={10}
              value={profiel.geometrie.hoogte}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  geometrie: {
                    ...c.geometrie,
                    hoogte: Math.max(300, Math.min(1400, Math.round(Number(e.target.value) || 600))),
                  },
                }))
              }
            />
          </label>
        </div>

        <div className='mp-schakel-raster'>
          <label className='mp-schakel'>
            <input
              type='checkbox'
              checked={profiel.geometrie.vastgepind}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  geometrie: { ...c.geometrie, vastgepind: e.target.checked },
                }))
              }
            />
            <span>
              {t('Закріпити поверх інтерфейсу', 'Vastpinnen boven de interface')}
              <small>{t('Вікно не закривається при натисканні поза межами — зручно для безперервної роботи.', 'Het venster sluit niet bij klikken buiten het kader.')}</small>
            </span>
          </label>
          <label className='mp-schakel'>
            <input
              type='checkbox'
              checked={profiel.geometrie.minimalePil}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  geometrie: { ...c.geometrie, minimalePil: e.target.checked },
                }))
              }
            />
            <span>
              {t('Згортати в компактну пігулку', 'Inklappen naar compacte capsule')}
              <small>{t('Залишає рухомий індикатор непрочитаних подій у куті екрана для миттєвого повернення.', 'Laat een versleepbare capsule met het aantal nieuwe meldingen staan.')}</small>
            </span>
          </label>
        </div>
      </section>

      {/* 3. Змахування й тренажер */}
      <section id='melding-veeg' className='mp-sectie'>
        <div className='mp-sectie-kop'>
          <div className='mp-sectie-titel'>
            <span className='mp-sectie-icoon'><Hand size={19} aria-hidden='true' /></span>
            <div>
              <h2>{t('Змахування й захист безпеки', 'Veeggebaren en beveiligingsrem')}</h2>
              <p>{t('Налаштуйте дії для змахування ліворуч та праворуч. Нові критичні сповіщення безпеки захищені від випадкового прибирання.', 'Stel acties in voor vegen naar links en rechts. Nieuwe kritieke beveiligingsmeldingen zijn altijd beschermd.')}</p>
            </div>
          </div>
        </div>

        <div className='mp-schakel-raster'>
          <label className='mp-schakel'>
            <input
              type='checkbox'
              checked={profiel.veeg.actief}
              onChange={(e) => slaProfielOp((c) => ({ ...c, veeg: { ...c.veeg, actief: e.target.checked } }))}
            />
            <span>
              {t('Увімкнути змахування на картках', 'Veeggebaren op kaarten inschakelen')}
              <small>{t('Працює дотиком і мишею всередині порталу екосистеми.', 'Werkt zowel met aanraking als met muisbeweging.')}</small>
            </span>
          </label>
          <label className='mp-schakel'>
            <input
              type='checkbox'
              checked={profiel.veeg.trilling}
              onChange={(e) => slaProfielOp((c) => ({ ...c, veeg: { ...c.veeg, trilling: e.target.checked } }))}
            />
            <span>
              {t('Тактильний відгук на телефоні', 'Trilling bij uitvoeren op mobiel')}
              <small>{t('Коротке вібро-підтвердження при досягненні порогу жесту.', 'Kort trilsignaal zodra de drempel wordt bereikt.')}</small>
            </span>
          </label>
        </div>

        <div className='mp-velden-raster'>
          <label>
            {t('Змах ліворуч', 'Veeg naar links')}
            <select
              value={profiel.veeg.links}
              onChange={(e) =>
                slaProfielOp((c) => ({ ...c, veeg: { ...c.veeg, links: e.target.value as VeegActie } }))
              }
            >
              {VEEG_ACTIES.map((a) => (
                <option key={a} value={a}>
                  {t(...VEEG_LABELS[a])}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Змах праворуч', 'Veeg naar rechts')}
            <select
              value={profiel.veeg.rechts}
              onChange={(e) =>
                slaProfielOp((c) => ({ ...c, veeg: { ...c.veeg, rechts: e.target.value as VeegActie } }))
              }
            >
              {VEEG_ACTIES.map((a) => (
                <option key={a} value={a}>
                  {t(...VEEG_LABELS[a])}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Поріг спрацювання, px (48–180)', 'Veegdrempel, px (48–180)')}
            <input
              type='number'
              min={48}
              max={180}
              step={4}
              value={profiel.veeg.drempelPx}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  veeg: {
                    ...c.veeg,
                    drempelPx: Math.max(48, Math.min(180, Math.round(Number(e.target.value) || 76))),
                  },
                }))
              }
            />
          </label>
        </div>

        <div className='mp-demo-omlijst' data-mp-veeg-trainer>
          <div className='mp-demo-balk'>
            <strong>{t('Живий тренажер картки:', 'Interactieve oefenkaart:')}</strong>
            <button
              type='button'
              className={`mp-pil-knop${!trainerKritiek ? ' is-actief' : ''}`}
              onClick={() => {
                setTrainerKritiek(false);
                setTrainerStatus('nieuw');
                setTrainerHint('');
              }}
            >
              {t('Звичайна подія', 'Gewone melding')}
            </button>
            <button
              type='button'
              className={`mp-pil-knop${trainerKritiek ? ' is-actief' : ''}`}
              onClick={() => {
                setTrainerKritiek(true);
                setTrainerStatus('nieuw');
                setTrainerHint('');
              }}
            >
              {t('Критична безпека (захищена)', 'Kritieke beveiliging (beschermd)')}
            </button>
            <button
              type='button'
              className='mp-pil-knop'
              onClick={() => {
                setTrainerStatus('nieuw');
                setTrainerHint('');
              }}
            >
              <RotateCcw size={15} aria-hidden='true' />
              {t('Скинути картку', 'Kaart resetten')}
            </button>
            <small>
              {t(`Поточний стан: ${trainerStatus}`, `Huidige status: ${trainerStatus}`)}
              {trainerHint ? ` · ${trainerHint}` : ''}
            </small>
          </div>
          <MeldingVeegKaart
            lang={lang}
            gebeurtenis={trainerGebeurtenis}
            profiel={profiel}
            bijlageVoorkeur={profiel.bijlageWeergave}
            onStatus={(status) => {
              setTrainerStatus(status);
              setTrainerHint(
                t(`застосовано стан «${status}»`, `status «${status}» toegepast`),
              );
            }}
            onOntleden={async () => interneAiAnalyse(trainerGebeurtenis, lang)}
            onOpenBijlageModaal={() => setActieveBijlageIdx(0)}
          />
        </div>
      </section>

      {/* 4. Канали, тихі години й класичні типи */}
      <section id='melding-kanalen' className='mp-sectie'>
        <div className='mp-sectie-kop'>
          <div className='mp-sectie-titel'>
            <span className='mp-sectie-icoon'><SlidersHorizontal size={19} aria-hidden='true' /></span>
            <div>
              <h2>{t('Канали, піддомени та тихі години', 'Kanalen, subdomeinen en stille uren')}</h2>
              <p>{t('Гнучке керування кожним каналом сайту: активність, спливання, звук і поріг важливості.', 'Beheer elk sitekanaal afzonderlijk: zichtbaarheid, pop-ups, geluid en drempelprioriteit.')}</p>
            </div>
          </div>
        </div>

        <div className='mp-schakel-raster' data-stille-uren>
          <label className='mp-schakel' data-meld-schakel='stil'>
            <input
              type='checkbox'
              checked={stil.aan}
              onChange={(e) => zetStil({ aan: e.target.checked })}
            />
            <span>
              {t('Тихі години', 'Stille uren')}
              <small>{stil.aan
                ? t(`З ${stil.van} до ${stil.tot} нові сповіщення не спливають і не звучать, мітки меню не пульсують — усе лишається в панелі сповіщень. Попередження безпеки все одно спливають. Після кінця — одне зведення «Поки була тиша».`, `Van ${stil.van} tot ${stil.tot} verschijnen nieuwe meldingen niet en klinken ze niet, menubadges pulseren niet — alles blijft in het meldingenpaneel. Beveiligingswaarschuwingen verschijnen wel. Daarna één samenvatting.`)
                : t('Вимкнено: сповіщення спливають і звучать у будь-який час.', 'Uit: meldingen verschijnen en klinken op elk moment.')}</small>
            </span>
          </label>
          <label className='mp-schakel'>
            <input
              type='checkbox'
              checked={profiel.stilleUren.kritiekStilOmzeilen}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  stilleUren: { ...c.stilleUren, kritiekStilOmzeilen: e.target.checked },
                }))
              }
            />
            <span>
              {t('Критична безпека пробиває тишу', 'Kritieke beveiliging doorbreekt stilte')}
              <small>{t('Попередження про вхід чи загрозу доставляються одразу попри тихі години.', 'Beveiligingswaarschuwingen blijven altijd hoorbaar en zichtbaar.')}</small>
            </span>
          </label>
        </div>

        <div className='mp-velden-raster' data-stille-tijden>
          <label>
            {t('Початок тиші', 'Start stille uren')}
            <input
              type='time'
              value={stil.van}
              disabled={!stil.aan}
              onChange={(e) => zetStil({ van: e.target.value })}
            />
          </label>
          <label>
            {t('Кінець тиші', 'Einde stille uren')}
            <input
              type='time'
              value={stil.tot}
              disabled={!stil.aan}
              onChange={(e) => zetStil({ tot: e.target.value })}
            />
          </label>
        </div>

        <div className='mp-kanalen-tabel'>
          {KANALEN.map((k) => {
            const vk = profiel.kanalen[k];
            const isBeveiliging = k === 'beveiliging';
            const patchKanaal = (patch: Partial<typeof vk>) =>
              slaProfielOp((c) => ({
                ...c,
                kanalen: {
                  ...c.kanalen,
                  [k]: {
                    ...c.kanalen[k],
                    ...patch,
                    actief: isBeveiliging ? true : patch.actief ?? c.kanalen[k].actief,
                  },
                },
              }));
            return (
              <div key={k} className='mp-kanaal-rij' data-mp-kanaal={k}>
                <div className='mp-kanaal-naam'>
                  <strong>{kanaalLabel(k, lang)}</strong>
                  <small>
                    {isBeveiliging
                      ? t('Завжди увімкнений для захисту акаунта', 'Altijd actief voor accountbescherming')
                      : k}
                  </small>
                </div>
                <label className='mp-kanaal-check'>
                  <input
                    type='checkbox'
                    checked={vk.actief}
                    disabled={isBeveiliging}
                    onChange={(e) => patchKanaal({ actief: e.target.checked })}
                  />
                  {t('Активний', 'Actief')}
                </label>
                <label className='mp-kanaal-check'>
                  <input
                    type='checkbox'
                    checked={vk.popUp}
                    onChange={(e) => patchKanaal({ popUp: e.target.checked })}
                  />
                  {t('Спливання', 'Pop-up')}
                </label>
                <label className='mp-kanaal-check'>
                  <input
                    type='checkbox'
                    checked={vk.geluid}
                    onChange={(e) => patchKanaal({ geluid: e.target.checked })}
                  />
                  {t('Звук', 'Geluid')}
                </label>
                <select
                  aria-label={`${kanaalLabel(k, lang)}: ${t('мінімальна важливість', 'drempelprioriteit')}`}
                  value={vk.drempelPrioriteit}
                  onChange={(e) => patchKanaal({ drempelPrioriteit: e.target.value as MeldingPrioriteit })}
                >
                  {PRIORITEITEN.map((prio) => (
                    <option key={prio} value={prio}>
                      {prioriteitLabel(prio, lang)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <MeldingVoorkeurenPaneel lang={lang} techTypen={magTechnisch} />
      </section>

      {/* 5. Переглядач і програвач усіх форматів вкладень */}
      <section id='melding-bijlagen' className='mp-sectie'>
        <div className='mp-sectie-kop'>
          <div className='mp-sectie-titel'>
            <span className='mp-sectie-icoon'><Paperclip size={19} aria-hidden='true' /></span>
            <div>
              <h2>{t('Вкладення та вбудований програвач', 'Bijlagen en universele speler')}</h2>
              <p>{t('Перегляд і відтворення будь-яких форматів безпосередньо всередині екосистеми без сторонніх сайтів.', 'Alle formaten direct binnen het ecosysteem bekijken en afspelen zonder externe websites.')}</p>
            </div>
          </div>
        </div>

        <div className='mp-schakel-raster'>
          <label className='mp-schakel'>
            <input
              type='checkbox'
              checked={profiel.bijlageWeergave.inlineSpeler}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  bijlageWeergave: { ...c.bijlageWeergave, inlineSpeler: e.target.checked },
                }))
              }
            />
            <span>
              {t('Вбудований програвач у картці', 'Inline speler in meldingskaart')}
              <small>{t('Дозволяє розгортати фото, відео, аудіо й документи одразу під текстом сповіщення.', 'Toont afbeeldingen, video, audio en documenten direct in de kaart.')}</small>
            </span>
          </label>
          <label className='mp-schakel'>
            <input
              type='checkbox'
              checked={profiel.bijlageWeergave.autoMetadata}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  bijlageWeergave: { ...c.bijlageWeergave, autoMetadata: e.target.checked },
                }))
              }
            />
            <span>
              {t('Автоматичне визначення форматів', 'Automatische formaatherkenning')}
              <small>{t('Аналізує MIME, таблиці, події .ics, контакти .vcf, підписи .p7s і архіви.', 'Analyseert MIME, tabellen, .ics, .vcf, .p7s en archieven.')}</small>
            </span>
          </label>
          <label className='mp-schakel'>
            <input
              type='checkbox'
              checked={profiel.bijlageWeergave.hexFallback}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  bijlageWeergave: { ...c.bijlageWeergave, hexFallback: e.target.checked },
                }))
              }
            />
            <span>
              {t('HEX-інспектор для невідомих файлів', 'HEX-inspectie voor onbekende bestanden')}
              <small>{t('Покроковий перегляд байтів і ASCII для довільних двійкових файлів.', 'Veilige hexadecimale weergave voor binaire of onbekende bestanden.')}</small>
            </span>
          </label>
        </div>

        <div className='mp-velden-raster'>
          <label>
            {t('Межа розміру для автоперегляду, MB (1–100)', 'Limiet voor voorvertoning, MB (1–100)')}
            <input
              type='number'
              min={1}
              max={100}
              value={profiel.bijlageWeergave.maxVoorbeeldMb}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  bijlageWeergave: {
                    ...c.bijlageWeergave,
                    maxVoorbeeldMb: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 25))),
                  },
                }))
              }
            />
          </label>
        </div>

        <div className='mp-formaat-chippen' aria-label={t('Підтримувані формати вкладень', 'Ondersteunde formaten')}>
          {[
            t('Зображення (PNG/SVG/WEBP)', 'Afbeeldingen (PNG/SVG/WEBP)'),
            t('Відео та аудіо (MP4/WEBM/WAV)', 'Video en audio (MP4/WEBM/WAV)'),
            'PDF / DOCX / ODT',
            t('Таблиці (CSV/XLSX)', 'Tabellen (CSV/XLSX)'),
            t('Бази даних (SQLite/JSON)', 'Databases (SQLite/JSON)'),
            t('Архіви (ZIP/TAR)', 'Archieven (ZIP/TAR)'),
            t('Календар (.ics) і контакти (.vcf)', 'Agenda (.ics) en contacten (.vcf)'),
            t('Підписи (.p7s) і різниці (.diff)', 'Handtekeningen (.p7s) en diffs'),
            t('Двійковий HEX-інспектор', 'Binaire HEX-inspectie'),
          ].map((label) => (
            <span key={label} className='mp-formaat-chip'>
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* 6. Конфіденційний внутрішній та зовнішній ШІ */}
      <section id='melding-ai' className='mp-sectie'>
        <div className='mp-sectie-kop'>
          <div className='mp-sectie-titel'>
            <span className='mp-sectie-icoon'><Bot size={19} aria-hidden='true' /></span>
            <div>
              <h2>{t('Взаємодія зі штучним інтелектом', 'Koppeling met artificiële intelligentie')}</h2>
              <p>{t('Автономний локальний аналізатор у просторі користувача та захищений зовнішній розбір з обов’язковим очищенням приватних даних.', 'Lokale analyser in de gebruikersruimte en veilige externe duiding na strikte anonimisering.')}</p>
            </div>
          </div>
        </div>

        <div className='mp-velden-raster'>
          <label>
            {t('Режим аналізу ШІ', 'AI-analysemodus')}
            <select
              value={profiel.ai.modus}
              onChange={(e) =>
                slaProfielOp((c) => ({ ...c, ai: { ...c.ai, modus: e.target.value as AiModus } }))
              }
            >
              {AI_MODI.map((m) => (
                <option key={m} value={m}>
                  {t(...AI_MODUS_LABELS[m])}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Переважний зовнішній постачальник', 'Voorkeursaanbieder voor externe AI')}
            <select
              value={profiel.ai.aanbieder}
              disabled={profiel.ai.modus === 'intern' || profiel.ai.modus === 'uit'}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  ai: { ...c.ai, aanbieder: e.target.value as AiAanbiederKeuze },
                }))
              }
            >
              {AI_AANBIEDERS_KEUZE.map((aanb) => (
                <option key={aanb} value={aanb}>
                  {aanb.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className='mp-schakel-raster'>
          <label className='mp-schakel'>
            <input
              type='checkbox'
              checked={profiel.ai.autoSamenvatting}
              onChange={(e) =>
                slaProfielOp((c) => ({ ...c, ai: { ...c.ai, autoSamenvatting: e.target.checked } }))
              }
            />
            <span>
              {t('Автоматичне узагальнення складних подій', 'Automatische samenvatting van complexe meldingen')}
              <small>{t('Одразу формує причину та план дій для критичних або багаторядкових сповіщень.', 'Vat oorzaak en aanbevolen stappen automatisch samen.')}</small>
            </span>
          </label>
          <label className='mp-schakel'>
            <input
              type='checkbox'
              checked={profiel.ai.alleenLokaalVoorBeveiliging}
              onChange={(e) =>
                slaProfielOp((c) => ({
                  ...c,
                  ai: { ...c.ai, alleenLokaalVoorBeveiliging: e.target.checked },
                }))
              }
            />
            <span>
              <Lock size={14} aria-hidden='true' />{' '}
              {t('Лише локальний ШІ для подій безпеки', 'Alleen lokale AI voor beveiliging')}
              <small>{t('Події безпеки, ключів і доступу ніколи не покидають ваш оглядач і сервер.', 'Beveiligings- en sleutelmeldingen worden nooit extern verzonden.')}</small>
            </span>
          </label>
        </div>
      </section>

      {/* 7. Пісочниця подій і живий переглядач форматів */}
      <section id='melding-zandbak' className='mp-sectie'>
        <div className='mp-sectie-kop'>
          <div className='mp-sectie-titel'>
            <span className='mp-sectie-icoon'><FlaskConical size={19} aria-hidden='true' /></span>
            <div>
              <h2>{t('Пісочниця сповіщень і вкладень', 'Zandbak voor meldingen en bijlagen')}</h2>
              <p>{t('Перевірте роботу переглядача вкладень на зразках різних форматів і надішліть тестову подію до активного порталу.', 'Test de bijlage-speler met verschillende bestandsformaten en stuur een proefmelding.')}</p>
            </div>
          </div>
        </div>

        <div className='mp-velden-raster'>
          <label>
            {t('Канал тестової події', 'Kanaal van proefmelding')}
            <select
              value={zandbakKanaal}
              onChange={(e) => setZandbakKanaal(e.target.value as MeldingKanaal)}
            >
              {KANALEN.map((k) => (
                <option key={k} value={k}>
                  {kanaalLabel(k, lang)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Важливість', 'Prioriteit')}
            <select
              value={zandbakPrioriteit}
              onChange={(e) => setZandbakPrioriteit(e.target.value as MeldingPrioriteit)}
            >
              {PRIORITEITEN.map((prio) => (
                <option key={prio} value={prio}>
                  {prioriteitLabel(prio, lang)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Власний заголовок (необов’язково)', 'Eigen titel (optioneel)')}
            <input
              type='text'
              maxLength={140}
              value={zandbakTekst}
              onChange={(e) => setZandbakTekst(e.target.value)}
              placeholder={t('Напр.: Успішне з’єднання з ПК-агентом', 'Bijv.: Verbinding met pc-agent hersteld')}
            />
          </label>
        </div>

        <div className='mp-demo-balk'>
          <button type='button' className='settings-primary' data-qa-id='mp-zend-test' onClick={zendTestMelding}>
            <Send size={16} aria-hidden='true' />
            {t('Надіслати тестову подію', 'Proefmelding versturen')}
          </button>
          {zandbakGemeld && <small role='status'>{zandbakGemeld}</small>}
        </div>

        <div className='mp-demo-omlijst' data-mp-zandbak-speler>
          <div className='mp-demo-balk'>
            <strong>
              <FileCode2 size={16} aria-hidden='true' />{' '}
              {t('Перевірка мультиформатного переглядача:', 'Voorbeeldbijlagen testen:')}
            </strong>
            {demoBijlagen.map((b, idx) => (
              <button
                key={b.id}
                type='button'
                className={`mp-pil-knop${actieveBijlageIdx === idx ? ' is-actief' : ''}`}
                data-mp-demo-bijlage={b.id}
                onClick={() => setActieveBijlageIdx(idx)}
              >
                {b.naam}
              </button>
            ))}
          </div>
          <MeldingBijlageSpeler
            lang={lang}
            bijlagen={demoBijlagen}
            actieveIndex={actieveBijlageIdx}
            voorkeur={profiel.bijlageWeergave}
            onSelectIndex={setActieveBijlageIdx}
          />
        </div>
      </section>

      {/* 8. Жива класифікована база типів сповіщень, кодів дій та схем доказів (MELDINGEN-REGISTER-001) */}
      <MeldingRegisterVerkenner lang={lang} magTechnisch={magTechnisch} />
    </div>
  );
}
