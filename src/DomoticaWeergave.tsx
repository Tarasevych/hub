// 28.10.2026 — Huis vNext (migratie 0128) achter de vlag `huis-vnext` (standaard UIT): met vlag de nieuwe pagina (src/huis/HuisPagina.tsx,
// lui geladen), zonder vlag precies deze oude informatiepagina — die stuurt niets en toont niets verzonnens.
import { Suspense, lazy, useMemo, useState } from 'react';
import { Activity, ExternalLink, Grid2X2, Home, Plug, ShieldCheck, Sparkles, Workflow, Zap } from 'lucide-react';
import './domotica.css';
import './huis/domotica-maquette.css';
import { useHuisVnext } from './huis/huis-vlag';
import { MaquetteAnkerRail, MaquetteHeld, type MaquetteAnkerItem, type MaquetteHeldStatistiek } from './maquette-kern';
import { useIsMaquette } from './thema/useThema';

const HuisPagina = lazy(() => import('./huis/HuisPagina'));

type Props = { lang: 'uk' | 'nl'; tab?: string; onNavigateTab?: (id: string) => void };

export default function SmartHomeView({ lang, tab, onNavigateTab }: Props) {
  const vnext = useHuisVnext();
  if (vnext) {
    return (
      <Suspense fallback={<section className='hv' data-hv-pagina='laden' aria-busy='true' />}>
        <HuisPagina lang={lang} tab={tab || 'overview'} onNavigateTab={onNavigateTab || (() => {})} />
      </Suspense>
    );
  }
  return <SmartHomeOud lang={lang} />;
}

type Section = { id: string; titleUk: string; titleNl: string; bodyUk: string; bodyNl: string; icon: typeof Home; accent: string };

const sections: Section[] = [
  { id: 'rooms', titleUk: 'Кімнати', titleNl: 'Kamers', bodyUk: 'Структура кімнат ще не налаштована.', bodyNl: 'De kamerstructuur is nog niet ingesteld.', icon: Grid2X2, accent: 'mq-accent-amber' },
  { id: 'devices', titleUk: 'Пристрої', titleNl: 'Apparaten', bodyUk: 'До цієї сторінки ще не підключено жодної платформи пристроїв.', bodyNl: 'Er is nog geen apparatenplatform aan deze pagina gekoppeld.', icon: Plug, accent: 'mq-accent-cyan' },
  { id: 'scenes', titleUk: 'Сцени', titleNl: 'Scènes', bodyUk: 'Сцени з’являться після підключення реального джерела станів і команд.', bodyNl: 'Scènes verschijnen nadat een echte bron voor statussen en opdrachten is gekoppeld.', icon: Zap, accent: 'mq-accent-violet' },
  { id: 'automations', titleUk: 'Автоматизації', titleNl: 'Automatiseringen', bodyUk: 'Жодна автоматизація з цієї сторінки зараз не виконується.', bodyNl: 'Er wordt momenteel geen automatisering vanaf deze pagina uitgevoerd.', icon: Workflow, accent: 'mq-accent-mint' },
  { id: 'energy', titleUk: 'Енергія', titleNl: 'Energie', bodyUk: 'Дані споживання енергії ще не підключені.', bodyNl: 'Energieverbruiksgegevens zijn nog niet gekoppeld.', icon: Activity, accent: 'mq-accent-emerald' },
  { id: 'security', titleUk: 'Безпека', titleNl: 'Beveiliging', bodyUk: 'Датчики, замки та охоронні стани ще не підключені.', bodyNl: 'Sensoren, sloten en beveiligingsstatussen zijn nog niet gekoppeld.', icon: ShieldCheck, accent: 'mq-accent-blue' },
];

function SmartHomeOud({ lang }: { lang: 'uk' | 'nl' }) {
  const isMaquette = useIsMaquette();
  const [actieveSectie, setActieveSectie] = useState<string>('rooms');
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);

  const statistieken = useMemo<ReadonlyArray<MaquetteHeldStatistiek>>(
    () => [
      { waarde: sections.length, label: t('Розділів оселі', 'Huisonderdelen') },
      { waarde: t('Локальний шлюз', 'Lokale gateway'), label: t('Спосіб з’єднання', 'Verbindingswijze') },
      { waarde: t('З підтвердженням', 'Met bevestiging'), label: t('Критичні дії', 'Kritieke handelingen') },
      { waarde: 0, label: t('Вигаданих станів', 'Verzonnen statussen') },
    ],
    [lang],
  );

  const ankerItems = useMemo<ReadonlyArray<MaquetteAnkerItem>>(
    () => sections.map((item) => ({ id: item.id, label: lang === 'uk' ? item.titleUk : item.titleNl })),
    [lang],
  );

  if (!isMaquette) {
    return <main className='smart-home' data-smart-home='overview'><header className='smart-home-hero'><span className='smart-home-mark' aria-hidden='true'><Home/></span><div><small>huis.tarasevych.com</small><h1>{t('Розумний будинок','Slim huis')}</h1><p>{t('Окремий приватний простір для майбутнього керування кімнатами, пристроями, сценами та автоматизаціями.','Een aparte privéruimte voor toekomstig beheer van kamers, apparaten, scènes en automatiseringen.')}</p></div></header><section className='smart-home-status' aria-labelledby='smart-home-status-title'><ShieldCheck aria-hidden='true'/><div><h2 id='smart-home-status-title'>{t('Інтеграції ще не підключені','Integraties zijn nog niet gekoppeld')}</h2><p>{t('Сторінка зараз не надсилає команд пристроям і не показує вигаданих станів. Керування з’явиться тільки після підключення реальної платформи або шлюзу.','De pagina stuurt momenteel geen opdrachten naar apparaten en toont geen verzonnen statussen. Bediening verschijnt pas nadat een echt platform of een echte gateway is gekoppeld.')}</p></div></section>{/* HUIS-001 (етап 0): клікабельний макет майбутнього хабу — статична сторінка dist/huis-maquette/ (scripts/huis-maquette.mjs --site). */}<section className='smart-home-status smart-home-maquette' aria-labelledby='smart-home-maquette-title' data-smart-home-maquette='1'><Sparkles aria-hidden='true'/><div><h2 id='smart-home-maquette-title'>{t('Макет «Живий дім» — яким стане розумний будинок','Maquette «Levend huis» — zo wordt het slimme huis')}</h2><p>{t('Повний клікабельний макет нового хабу на вбудованому симуляторі з вигаданими даними: дім, кімнати й план, керування кожним типом пристрою, енергія, безпека, гараж із транспортом і безпілотниками, автоматика, ШІ-агенти з дозволами. Макет нічим не керує й не має зв’язку з вашими пристроями.','De volledige klikbare maquette van de nieuwe hub op de ingebouwde simulator met verzonnen gegevens: huis, kamers en plattegrond, bediening van elk soort apparaat, energie, beveiliging, de garage met voertuigen en drones, automatisering en AI-agenten met toestemmingen. De maquette bedient niets en heeft geen verbinding met uw apparaten.')}</p><p><a className='smart-home-maquette-link' href='/huis-maquette/' target='_blank' rel='noopener' data-smart-home-maquette-open='1' title={t('Відкриється в новій вкладці; жодна дія в макеті не доходить до ваших пристроїв.','Opent in een nieuw tabblad; geen enkele actie in de maquette bereikt uw apparaten.')}><ExternalLink aria-hidden='true'/>{t('Відкрити макет','Maquette openen')}</a></p></div></section><section className='smart-home-sections' aria-label={t('Розділи розумного будинку','Onderdelen van het slimme huis')}>{sections.map(item=>{const Icon=item.icon;return <article key={item.id} data-smart-home-section={item.id}><span aria-hidden='true'><Icon/></span><div><h2>{lang==='uk'?item.titleUk:item.titleNl}</h2><p>{lang==='uk'?item.bodyUk:item.bodyNl}</p><small>{t('Немає підключення','Niet gekoppeld')}</small></div></article>})}</section><section className='smart-home-next' aria-labelledby='smart-home-next-title'><div><h2 id='smart-home-next-title'>{t('Наступний технічний крок','Volgende technische stap')}</h2><p>{t('Підключити обрану реальну платформу розумного будинку до цього канонічного сервісу. До цього моменту сторінка лишається безпечною інформаційною оболонкою без фіктивного керування.','Koppel het gekozen echte smart-homeplatform aan deze canonieke dienst. Tot dat moment blijft de pagina een veilige informatieve omgeving zonder fictieve bediening.')}</p></div></section></main>;
  }

  return (
    <div className='mq-schil domotica-maquette-wikkel' data-mq-dienst='huis'>
      <MaquetteHeld
        id='domotica-maquette-held'
        dienst='huis'
        lang={lang}
        modus='volledig'
        opslagSleutel='huis-klassiek'
        bovenregel={t('ПРОСТІР ОСЕЛІ · HUIS.TARASEVYCH.COM', 'WOONRUIMTE · HUIS.TARASEVYCH.COM')}
        titelVoor={t('Спокійна оселя та', 'Een rustig huis en')}
        titelCursief={t('чесні спостереження.', 'eerlijke waarnemingen.')}
        beschrijving={t(
          'Приватне середовище для кімнат, освітлення, мікроклімату, енергії та охорони у вашій мережі. Жодних вигаданих станів — лише справжні показники локального шлюзу й обов’язкове підтвердження людини для важливих дій.',
          'Een besloten omgeving voor kamers, verlichting, binnenklimaat, energie en beveiliging in uw eigen netwerk. Geen verzonnen statussen — uitsluitend echte waarden van de lokale gateway en verplichte menselijke bevestiging voor kritieke handelingen.',
        )}
        statistieken={statistieken}
        primair={{
          label: t('Відкрити макет «Живий дім»', 'Maquette «Levend huis» openen'),
          onClick: () => {
            window.open('/huis-maquette/', '_blank', 'noopener');
          },
        }}
        secundair={{
          label: t('Оглянути розділи оселі', 'Huisonderdelen bekijken'),
          onClick: () => {
            setActieveSectie('rooms');
            document.getElementById('domotica-sectie-rooms')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        }}
      />
      <main className='smart-home' data-smart-home='overview'>
        <header className='smart-home-hero'>
          <span className='smart-home-mark' aria-hidden='true'><Home /></span>
          <div>
            <small>huis.tarasevych.com</small>
            <h1>{t('Розумний будинок', 'Slim huis')}</h1>
            <p>{t('Окремий приватний простір для майбутнього керування кімнатами, пристроями, сценами та автоматизаціями.', 'Een aparte privéruimte voor toekomstig beheer van kamers, apparaten, scènes en automatiseringen.')}</p>
          </div>
        </header>
        <section className='smart-home-status' aria-labelledby='smart-home-status-title'>
          <ShieldCheck aria-hidden='true' />
          <div>
            <h2 id='smart-home-status-title'>{t('Інтеграції ще не підключені', 'Integraties zijn nog niet gekoppeld')}</h2>
            <p>{t('Сторінка зараз не надсилає команд пристроям і не показує вигаданих станів. Керування з’явиться тільки після підключення реальної платформи або шлюзу.', 'De pagina stuurt momenteel geen opdrachten naar apparaten en toont geen verzonnen statussen. Bediening verschijnt pas nadat een echt platform of een echte gateway is gekoppeld.')}</p>
          </div>
        </section>
        <section className='smart-home-status smart-home-maquette' aria-labelledby='smart-home-maquette-title' data-smart-home-maquette='1'>
          <Sparkles aria-hidden='true' />
          <div>
            <h2 id='smart-home-maquette-title'>{t('Макет «Живий дім» — яким стане розумний будинок', 'Maquette «Levend huis» — zo wordt het slimme huis')}</h2>
            <p>{t('Повний клікабельний макет нового хабу на вбудованому симуляторі з вигаданими даними: дім, кімнати й план, керування кожним типом пристрою, енергія, безпека, гараж із транспортом і безпілотниками, автоматика, ШІ-агенти з дозволами. Макет нічим не керує й не має зв’язку з вашими пристроями.', 'De volledige klikbare maquette van de nieuwe hub op de ingebouwde simulator met verzonnen gegevens: huis, kamers en plattegrond, bediening van elk soort apparaat, energie, beveiliging, de garage met voertuigen en drones, automatisering en AI-agenten met toestemmingen. De maquette bedient niets en heeft geen verbinding met uw apparaten.')}</p>
            <p>
              <a className='smart-home-maquette-link' href='/huis-maquette/' target='_blank' rel='noopener' data-smart-home-maquette-open='1' title={t('Відкриється в новій вкладці; жодна дія в макеті не доходить до ваших пристроїв.', 'Opent in een nieuw tabblad; geen enkele actie in de maquette bereikt uw apparaten.')}>
                <ExternalLink aria-hidden='true' />{t('Відкрити макет', 'Maquette openen')}
              </a>
            </p>
          </div>
        </section>
        <section className='smart-home-sections' aria-label={t('Розділи розумного будинку', 'Onderdelen van het slimme huis')}>
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.id} id={'domotica-sectie-' + item.id} className={item.accent} data-smart-home-section={item.id}>
                <span aria-hidden='true'><Icon /></span>
                <div>
                  <h2>{lang === 'uk' ? item.titleUk : item.titleNl}</h2>
                  <p>{lang === 'uk' ? item.bodyUk : item.bodyNl}</p>
                  <small>{t('Немає підключення', 'Niet gekoppeld')}</small>
                </div>
              </article>
            );
          })}
        </section>
        <section className='smart-home-next' aria-labelledby='smart-home-next-title'>
          <div>
            <h2 id='smart-home-next-title'>{t('Наступний технічний крок', 'Volgende technische stap')}</h2>
            <p>{t('Підключити обрану реальну платформу розумного будинку до цього канонічного сервісу. До цього моменту сторінка лишається безпечною інформаційною оболонкою без фіктивного керування.', 'Koppel het gekozen echte smart-homeplatform aan deze canonieke dienst. Tot dat moment blijft de pagina een veilige informatieve omgeving zonder fictieve bediening.')}</p>
          </div>
        </section>
      </main>
      <MaquetteAnkerRail
        lang={lang}
        opslagSleutel='domotica-anker'
        titel={t('Розділи оселі', 'Huisonderdelen')}
        ondertitel={t('Перетягніть до зручного краю', 'Sleep naar een gewenste rand')}
        items={ankerItems}
        actief={actieveSectie}
        onKies={(id) => {
          setActieveSectie(id);
          document.getElementById('domotica-sectie-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />
    </div>
  );
}