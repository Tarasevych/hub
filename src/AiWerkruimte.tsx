// Startpagina van «ШІ для вас» op ai.tarasevych.com (punt 13 van de eigenaarslijst, 19.10.2026).
//
// Klacht van de eigenaar: «немає справжньої робочої стартової точки: незрозуміло, що це за розділ і що він уміє;
// немає вікна чату, немає базових підказок цінності; потрібні інтеграції й доступ до всіх зручних інструментів».
//
// Dit scherm antwoordt op precies die punten, en uitsluitend met feiten van de server (shared/ai-werkruimte.ts):
//   1. een kop die zegt wat dit onderdeel IS en wat dit account er NU mee kan (sleutel? hulpmiddelen? koppelingen?);
//   2. het werkende chatvenster (AiWerkruimteChat);
//   3. kant-en-klare eerste vragen, gegroepeerd per wat echt aangesloten is; klikken zet ze in het veld;
//   4. één tabblad «Усі інструменти» met elk gemak, zijn échte stand en het adres waar je het aanzet;
//   5. zonder het recht 'api-platform' de eerlijke uitleg (wie het geeft), nooit «Сесія закінчилася»;
//   6. elke lege lijst zegt wat de volgende stap is.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Bot, PlugZap, ShieldAlert, Wrench } from 'lucide-react';
import ProductEmptyState from './ProductLegeToestand';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { canonicalNavigationUrl, routeLang } from './canoniek-navigatie';
import { foutCode, foutTekst, isRechtFout, RECHT_UITLEG } from './agenten/fouten';
import AiWerkruimteChat from './AiWerkruimteChat';
import {
  LEGE_FEITEN, startStaat, VRAAG_GROEPEN, vragenMetStand,
  type Feiten, type Middel, type MiddelStaat, type Startstaat, type Tweetalig,
} from '../shared/ai-werkruimte';
import './ai-werkruimte.css';

type Tr = (uk: string, nl: string) => string;
type Props = {
  tr: Tr;
  eigenaar: boolean;
  /** «Ключа ще немає»: de bestaande lege staat met de juiste volgende stap per rol (eigenaar → kluis, anders → hub). */
  geenSleutel: ReactNode;
  /** Band «напрямок сервісу» die boven elk ai.*-scherm staat. */
  band: ReactNode;
};
type Laden = { fase: 'laden' } | { fase: 'klaar'; feiten: Feiten; stand: Startstaat } | { fase: 'fout'; code: string; tekst: string; rechtFout: boolean };

const sessieLichaam = () => ({ service: 'ai', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

const STAAT_NAAM: Record<MiddelStaat, Tweetalig> = {
  aan: ['працює', 'werkt'],
  koppelen: ['треба підключити', 'moet gekoppeld worden'],
  'niet-in-chat': ['підключено, але не в цьому чаті', 'gekoppeld, maar niet in deze chat'],
  'geen-recht': ['немає права', 'geen recht'],
};

/** Adres waar dit gemak aangezet wordt; altijd via de canonieke navigatie van de site. */
const adresVan = (m: Middel) => {
  const lang = routeLang();
  const basis = canonicalNavigationUrl(m.waar.dienst, m.waar.tab, lang);
  return m.waar.hash ? `${basis.replace(/#.*$/, '')}#${m.waar.hash}` : basis;
};

function MiddelRij({ m, tr }: { m: Middel; tr: Tr }) {
  const naam = STAAT_NAAM[m.staat];
  return (
    <li className='aiw-middel' data-aiw-middel={m.id} data-aiw-staat={m.staat}>
      <b>{tr(m.naam[0], m.naam[1])}<span className={`aiw-vlag aiw-staat-${m.staat}`}>{tr(naam[0], naam[1])}</span></b>
      <small>{tr(m.wat[0], m.wat[1])}</small>
      {m.detail ? <small>{tr(m.detail[0], m.detail[1])}</small> : null}
      {m.staat === 'geen-recht'
        ? null
        : <small><a href={adresVan(m)}>{m.staat === 'aan' ? tr('Налаштування', 'Instellingen') : tr('Де це увімкнути', 'Waar u dit aanzet')}: {tr(m.waar.label[0], m.waar.label[1])}</a></small>}
      {m.staat === 'niet-in-chat'
        ? <small>{tr('Цей інструмент має ШІ, підключений через конектор, — у цьому вікні чату його ще немає.', 'Dit hulpmiddel heeft een AI die via de connector is gekoppeld — in dit chatvenster zit het nog niet.')}</small>
        : null}
    </li>
  );
}

export default function AiWerkruimte({ tr, eigenaar, geenSleutel, band }: Props) {
  const [laden, setLaden] = useState<Laden>({ fase: 'laden' });
  const [weergave, setWeergave] = useState<'werk' | 'middelen'>('werk');
  const [invoer, setInvoer] = useState('');

  const lees = useCallback(async () => {
    try {
      const res = await api.post('/api/owner/ai/werkruimte/overzicht', sessieLichaam());
      const feiten = { ...LEGE_FEITEN, ...(res.data?.feiten ?? {}) } as Feiten;
      setLaden({ fase: 'klaar', feiten, stand: startStaat(feiten) });
    } catch (e) {
      setLaden({ fase: 'fout', code: foutCode(e).code || 'HTTP_0', tekst: foutTekst(e, tr), rechtFout: isRechtFout(e) });
    }
  }, [tr]);
  useEffect(() => { void lees(); }, [lees]);
  /** De stand kan in een ander tabblad veranderd zijn (sleutel toegevoegd, apparaat gekoppeld, recht gegeven). */
  const herlaad = () => { setLaden({ fase: 'laden' }); void lees(); };
  const herlaadKnop = (label: Tweetalig) => (
    <div className='aiw-knoppen'><button type='button' className='aiw-tweede' data-aiw-herlaad='1' onClick={herlaad}>{tr(label[0], label[1])}</button></div>
  );

  if (laden.fase === 'laden') return <>{band}<p className='aiw-nog-niet' aria-busy='true'>{tr('Читаємо стан вашого акаунта…', 'De stand van uw account wordt gelezen…')}</p></>;

  // Punt 5: geldige sessie, maar het account mist het recht «API-платформа». Eerlijk zeggen wat er uit staat en wie het aanzet.
  if (laden.fase === 'fout' && laden.rechtFout) {
    return (
      <>{band}
        <section className='aiw' data-aiw-geen-recht='1'>
          <ProductEmptyState
            icon={ShieldAlert}
            title={tr('Розділ «ШІ для вас» для цього акаунта ще не ввімкнено', 'Het onderdeel «AI voor u» staat voor dit account nog niet aan')}
            description={eigenaar
              ? tr(
                'Сервер не бачить у цього акаунта права «API-платформа». Ви входите як власник, тому перевірте, що адреса акаунта збігається з OWNER_EMAIL на сервері, або видайте собі це право в Адміністрування → Користувачі та запити доступу.',
                'De server ziet voor dit account het recht «API-platform» niet. U bent als eigenaar aangemeld: controleer of het e-mailadres van dit account gelijk is aan OWNER_EMAIL op de server, of geef uzelf dit recht in Beheer → Gebruikers en toegangsverzoeken.',
              )
              : tr(RECHT_UITLEG[0], RECHT_UITLEG[1])}
          />
          <p className='aiw-nog-niet'>{tr('Код відповіді сервера', 'Antwoordcode van de server')}: {laden.code}</p>
          {herlaadKnop(['Перевірити ще раз', 'Opnieuw controleren'])}
        </section>
      </>
    );
  }
  if (laden.fase === 'fout') {
    return (
      <>{band}
        <section className='aiw'>
          <ProductEmptyState
            icon={Bot}
            title={tr('Не вдалося прочитати стан цього розділу', 'De stand van dit onderdeel kon niet gelezen worden')}
            description={laden.tekst}
            actionLabel={tr('Спробувати ще раз', 'Opnieuw proberen')}
            onAction={herlaad}
          />
        </section>
      </>
    );
  }

  const { feiten, stand } = laden;
  const vragen = vragenMetStand(feiten);
  const samenvatting = stand.kanChatten
    ? tr(
      `Це ваш власний ШІ-помічник на цьому сервері: ви питаєте тут, а він працює з тим, що ви йому відкрили. Зараз доступно інструментів: ${stand.aantalTools}; модель: ${stand.model}. Нічого з того, що тут видно, не вигадано — усе зчитано з вашого акаунта.`,
      `Dit is uw eigen AI-assistent op deze server: u vraagt het hier en hij werkt met wat u hem hebt opengezet. Nu beschikbaar: ${stand.aantalTools} hulpmiddelen; model: ${stand.model}. Niets op dit scherm is verzonnen — alles komt uit uw account.`,
    )
    : tr(
      'Це ваш власний ШІ-помічник на цьому сервері. Щоб він почав відповідати, не вистачає одного кроку — він описаний нижче.',
      'Dit is uw eigen AI-assistent op deze server. Er ontbreekt één stap voordat hij antwoordt — die staat hieronder.',
    );

  // Punt 6: niets aangesloten → de bestaande lege staat met de juiste volgende stap per rol, en niets anders beweren.
  if (stand.leeg) {
    return (
      <>{band}
        <section className='aiw' data-aiw-leeg='1'>
          {geenSleutel}
          <article className='aiw-kaart'>
            <h2>{tr('Що тут буде, коли ви це зробите', 'Wat hier komt als u dat doet')}</h2>
            <p>{tr('Вікно чату, готові запити під те, що ви підключите, і один екран з усіма інструментами та їхнім станом.', 'Een chatvenster, kant-en-klare vragen voor wat u koppelt, en één scherm met alle hulpmiddelen en hun stand.')}</p>
            <div className='aiw-knoppen'>
              <button type='button' className='aiw-tweede' onClick={() => setWeergave('middelen')}>{tr('Подивитися перелік інструментів', 'De lijst met hulpmiddelen bekijken')}</button>
            </div>
            {weergave === 'middelen' ? <ul className='aiw-lijst'>{stand.ontbreekt.map((m) => <MiddelRij key={m.id} m={m} tr={tr} />)}</ul> : null}
          </article>
        </section>
      </>
    );
  }

  const blokkadeUitleg = stand.blokkade === 'geen-sleutel' ? geenSleutel
    : stand.blokkade === 'geen-model' ? (
      <p className='aiw-fout' role='status'>{tr(
        'Власник сервера не налаштував модель (CHAT_MODEL), тому відповідати нема чим. Чат з’явиться, щойно модель буде задана.',
        'De eigenaar van de server heeft geen model ingesteld (CHAT_MODEL), dus er is niets om mee te antwoorden. De chat werkt zodra het model er is.',
      )}</p>
    ) : null;

  return (
    <>{band}
      <section className='aiw' data-aiw='1' data-aiw-kan-chatten={String(stand.kanChatten)}>
        <header className='aiw-kop'>
          <h1>{tr('ШІ для вас', 'AI voor u')}</h1>
          <p>{samenvatting}</p>
        </header>

        <nav className='aiw-schakel' aria-label={tr('Частини розділу', 'Delen van dit onderdeel')}>
          <button type='button' aria-pressed={weergave === 'werk'} onClick={() => setWeergave('werk')}>{tr('Робота', 'Werken')}</button>
          <button type='button' aria-pressed={weergave === 'middelen'} onClick={() => setWeergave('middelen')}>{tr('Усі інструменти', 'Alle hulpmiddelen')}</button>
        </nav>

        {weergave === 'werk' ? (
          <>
            <article className='aiw-kaart' data-aiw-vragen='1'>
              <h2>{tr('З чого почати', 'Waarmee u begint')}</h2>
              <p>{stand.kanChatten
                ? tr('Натисніть запит — він з’явиться у полі, і ви зможете його змінити перед надсиланням.', 'Druk op een vraag — die komt in het veld en u kunt hem nog aanpassen voor u verstuurt.')
                : tr('Готові запити стануть активними, щойно чат зможе відповідати.', 'De kant-en-klare vragen worden actief zodra de chat kan antwoorden.')}</p>
              <div className='aiw-vragen'>
                {VRAAG_GROEPEN.map((groep) => {
                  const rij = vragen.filter((v) => v.vraag.groep === groep.id);
                  if (!rij.length) return null;
                  return (
                    <div key={groep.id} className='aiw-vraaggroep' data-aiw-vraaggroep={groep.id}>
                      <span>{tr(groep.naam[0], groep.naam[1])}</span>
                      <div className='aiw-vraagrij'>
                        {rij.map(({ vraag, beschikbaar }) => (beschikbaar ? (
                          <button key={vraag.id} type='button' data-aiw-vraag={vraag.id} onClick={() => setInvoer(tr(vraag.tekst[0], vraag.tekst[1]))}>
                            {tr(vraag.tekst[0], vraag.tekst[1])}
                          </button>
                        ) : (
                          <button key={vraag.id} type='button' className='aiw-vraag-uit' data-aiw-vraag-uit={vraag.id} disabled aria-disabled='true'
                            title={tr('Для цього запиту ще немає інструмента в цьому чаті', 'Voor deze vraag heeft deze chat nog geen hulpmiddel')}>
                            {tr(vraag.tekst[0], vraag.tekst[1])}
                          </button>
                        )))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {vragen.every((v) => !v.beschikbaar)
                ? <p className='aiw-nog-niet'>{tr('Поки жоден готовий запит не працює. Наступний крок — на вкладці «Усі інструменти».', 'Nog geen enkele kant-en-klare vraag werkt. De volgende stap staat op het tabblad «Alle hulpmiddelen».')}</p>
                : null}
            </article>

            <AiWerkruimteChat tr={tr} feiten={feiten} stand={stand} invoer={invoer} onInvoer={setInvoer} blokkadeUitleg={blokkadeUitleg} />
          </>
        ) : (
          <>
            <article className='aiw-kaart' data-aiw-klaar={String(stand.klaar.length)}>
              <h2><Wrench aria-hidden='true' /> {tr('Працює зараз', 'Werkt nu')}</h2>
              {stand.klaar.length
                ? <ul className='aiw-lijst'>{stand.klaar.map((m) => <MiddelRij key={m.id} m={m} tr={tr} />)}</ul>
                : <p>{tr('Поки нічого. Почніть з першого пункту нижче — після цього він перейде сюди.', 'Nog niets. Begin met het eerste punt hieronder — daarna komt het hier te staan.')}</p>}
            </article>
            <article className='aiw-kaart' data-aiw-ontbreekt={String(stand.ontbreekt.length)}>
              <h2><PlugZap aria-hidden='true' /> {tr('Можна додати', 'Kan erbij')}</h2>
              {stand.ontbreekt.length
                ? <ul className='aiw-lijst'>{stand.ontbreekt.map((m) => <MiddelRij key={m.id} m={m} tr={tr} />)}</ul>
                : <p>{tr('Усе, що вміє цей розділ, у вас уже підключено.', 'Alles wat dit onderdeel kan, hebt u al gekoppeld.')}</p>}
              {herlaadKnop(['Я щось підключив — оновити стан', 'Ik heb iets gekoppeld — stand verversen'])}
            </article>
          </>
        )}
      </section>
    </>
  );
}
