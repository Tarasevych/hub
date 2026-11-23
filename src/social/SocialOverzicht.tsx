// Прикладна сторінка розділу «Соціальні мережі» (id.tarasevych.com/netwerken, CONSOL-001 / M4).
// Поєднує підключені канали облікового запису (Telegram, Discord, GitHub), огляд імпортованих архівів зі служби «Фото»
// та суверенну майстерню власних профілів і чернеток публікацій без сторонніх трекерів і без збереження таємних ключів.
// Повністю безпечна для статичного рендерингу (renderToStaticMarkup) двома мовами (uk + nl).
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ExternalLink, FileText, Globe, Images, Pencil, Plus, RefreshCw, Rss, Share2, ShieldCheck, Trash2 } from 'lucide-react';
import type { TargetService } from '../canoniek-navigatie';
import Merk from '../merk/Merk';
import {
  bewaarSocialBericht,
  bewaarSocialProfiel,
  laadSocialOverzicht,
  verwijderSocialBericht,
  verwijderSocialProfiel,
  type SocialBericht,
  type SocialBerichtStatus,
  type SocialNetwerkId,
  type SocialOverzichtData,
  type SocialProfiel,
  type SocialProfielStatus,
} from './api';
import './social.css';

export type SocialTaal = 'uk' | 'nl';

export type SocialOverzichtProps = {
  lang?: SocialTaal;
  vlagAan?: boolean;
  tabContext?: string;
  sourceOrigin?: string;
  onNavigate?: (dienst: string, tab: string) => void;
};

type NetwerkKeuze = {
  id: SocialNetwerkId;
  naam: readonly [string, string];
  merk?: string;
  voorbeeldHandvat: string;
};

const NETWERKEN: readonly NetwerkKeuze[] = Object.freeze([
  { id: 'telegram', naam: ['Telegram', 'Telegram'], merk: 'telegram', voorbeeldHandvat: '@kanaal' },
  { id: 'discord', naam: ['Discord', 'Discord'], merk: 'discord', voorbeeldHandvat: 'gemeenschap' },
  { id: 'github', naam: ['GitHub', 'GitHub'], merk: 'github', voorbeeldHandvat: '@profiel' },
  { id: 'mastodon', naam: ['Mastodon', 'Mastodon'], merk: 'mastodon', voorbeeldHandvat: '@naam@mastodon.social' },
  { id: 'bluesky', naam: ['Bluesky', 'Bluesky'], merk: 'bluesky', voorbeeldHandvat: '@naam.bsky.social' },
  { id: 'linkedin', naam: ['LinkedIn', 'LinkedIn'], merk: 'linkedin', voorbeeldHandvat: 'profiel' },
  { id: 'youtube', naam: ['YouTube', 'YouTube'], merk: 'youtube', voorbeeldHandvat: '@kanaal' },
  { id: 'rss', naam: ['Стрічка RSS', 'RSS-stroom'], voorbeeldHandvat: 'rss.xml' },
  { id: 'eigen', naam: ['Власний сайт', 'Eigen website'], voorbeeldHandvat: 'tarasevych.com' },
]);

const BERICHT_STATUSSEN: ReadonlyArray<{ id: SocialBerichtStatus; naam: readonly [string, string] }> = Object.freeze([
  { id: 'concept', naam: ['Чернетка', 'Concept'] },
  { id: 'gepland', naam: ['Заплановано', 'Gepland'] },
  { id: 'gepubliceerd', naam: ['Опубліковано', 'Gepubliceerd'] },
  { id: 'gearchiveerd', naam: ['В архіві', 'Gearchiveerd'] },
]);

const tr = (lang: SocialTaal, uk: string, nl: string): string => (lang === 'uk' ? uk : nl);

function netwerkNaam(id: SocialNetwerkId, lang: SocialTaal): string {
  const gevonden = NETWERKEN.find((n) => n.id === id);
  return gevonden ? (lang === 'uk' ? gevonden.naam[0] : gevonden.naam[1]) : id;
}

function NetwerkTeken({ id }: { id: SocialNetwerkId }) {
  const gevonden = NETWERKEN.find((n) => n.id === id);
  if (gevonden?.merk) {
    return <Merk merk={gevonden.merk} naam={gevonden.naam[0]} vorm='tegel' maat={26} />;
  }
  if (id === 'rss') return <Rss aria-hidden='true' />;
  return <Globe aria-hidden='true' />;
}

function vertaalFout(code: string, lang: SocialTaal): string {
  if (code.includes('SOCIAL_GEHEIM_GEWEIGERD')) {
    return tr(
      lang,
      'Запис відхилено: виявлено таємний ключ, пароль або маркер доступу. Служба зберігає лише відкриті профілі та чернетки.',
      'Opslaan geweigerd: er is een geheime sleutel, wachtwoord of toegangstoken herkend. Deze dienst bewaart alleen openbare profielen en concepten.',
    );
  }
  if (code.includes('SOCIAL_URL_ONGELDIG')) {
    return tr(
      lang,
      'Недійсне посилання: дозволено лише публічні адреси https:// без облікових даних і внутрішніх вузлів.',
      'Ongeldige koppeling: alleen openbare https://-adressen zonder aanmeldgegevens of interne adressen zijn toegestaan.',
    );
  }
  if (code.includes('SOCIAL_VELDEN_VERPLICHT')) {
    return tr(
      lang,
      'Заповніть назву або псевдонім профілю (для публікації — заголовок або текст).',
      'Vul een naam of gebruikersnaam in (voor een bericht: een titel of inhoud).',
    );
  }
  if (code.includes('SOCIAL_DIENST_UIT')) {
    return tr(
      lang,
      'Серверне сховище розділу «Соціальні мережі» наразі вимкнено перемикачем можливостей social-overzicht-v1.',
      'De serveropslag van «Sociale netwerken» staat momenteel uit via de functieschakelaar social-overzicht-v1.',
    );
  }
  return tr(
    lang,
    `Не вдалося виконати дію (${code}). Ваші дані не втрачено.`,
    `De handeling kon niet worden voltooid (${code}). Uw gegevens zijn bewaard gebleven.`,
  );
}

export function SocialOverzicht({
  lang = 'uk',
  vlagAan = true,
  tabContext,
  sourceOrigin,
  onNavigate,
}: SocialOverzichtProps) {
  const [data, setData] = useState<SocialOverzichtData | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [dienstUitOpServer, setDienstUitOpServer] = useState(false);

  // Стан форми профілю/каналу
  const [profielBewerkId, setProfielBewerkId] = useState('');
  const [profielNetwerk, setProfielNetwerk] = useState<SocialNetwerkId>('mastodon');
  const [profielTitel, setProfielTitel] = useState('');
  const [profielHandvat, setProfielHandvat] = useState('');
  const [profielUrl, setProfielUrl] = useState('');
  const [profielInhoud, setProfielInhoud] = useState('');
  const [profielStatus, setProfielStatus] = useState<SocialProfielStatus>('actief');

  // Стан форми чернетки публікації
  const [berichtBewerkId, setBerichtBewerkId] = useState('');
  const [berichtNetwerk, setBerichtNetwerk] = useState<SocialNetwerkId>('telegram');
  const [berichtTitel, setBerichtTitel] = useState('');
  const [berichtInhoud, setBerichtInhoud] = useState('');
  const [berichtUrl, setBerichtUrl] = useState('');
  const [berichtStatus, setBerichtStatus] = useState<SocialBerichtStatus>('concept');

  const gaNaar = useCallback(
    (dienst: TargetService, tab: string) => {
      if (onNavigate) {
        onNavigate(dienst, tab);
        return;
      }
      if (typeof location !== 'undefined') {
        void import('../canoniek-navigatie').then((m) => {
          location.assign(m.canonicalNavigationUrl(dienst, tab, lang));
        });
      }
    },
    [lang, onNavigate],
  );

  const herlaad = useCallback(async () => {
    if (vlagAan === false) return;
    setBezig(true);
    setFout('');
    try {
      const overzicht = await laadSocialOverzicht({ service: 'identity', tabContext, sourceOrigin });
      setData(overzicht);
      setDienstUitOpServer(false);
    } catch (e) {
      const code = String((e as Error)?.message || 'SOCIAL_FOUT');
      if (code.includes('SOCIAL_DIENST_UIT') || code.includes('404')) {
        setDienstUitOpServer(true);
      } else {
        setFout(vertaalFout(code, lang));
      }
    } finally {
      setBezig(false);
    }
  }, [lang, sourceOrigin, tabContext, vlagAan]);

  useEffect(() => {
    if (vlagAan === false) return;
    void herlaad();
  }, [herlaad, vlagAan]);

  const opslagActief = vlagAan !== false && !dienstUitOpServer;
  const magSchrijven = opslagActief && (data ? data.magSchrijven : true);

  const wisProfielFormulier = () => {
    setProfielBewerkId('');
    setProfielTitel('');
    setProfielHandvat('');
    setProfielUrl('');
    setProfielInhoud('');
    setProfielStatus('actief');
  };

  const wisBerichtFormulier = () => {
    setBerichtBewerkId('');
    setBerichtTitel('');
    setBerichtInhoud('');
    setBerichtUrl('');
    setBerichtStatus('concept');
  };

  const slaProfielOp = async (e: FormEvent) => {
    e.preventDefault();
    if (!magSchrijven) return;
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      await bewaarSocialProfiel(
        {
          ...(profielBewerkId ? { id: profielBewerkId } : {}),
          netwerk: profielNetwerk,
          titel: profielTitel,
          handvat: profielHandvat,
          url: profielUrl,
          inhoud: profielInhoud,
          status: profielStatus,
        },
        { service: 'identity', tabContext, sourceOrigin },
      );
      wisProfielFormulier();
      setMelding(tr(lang, 'Профіль мережі збережено у вашому просторі.', 'Het netwerkprofiel is in uw ruimte opgeslagen.'));
      await herlaad();
    } catch (err) {
      setFout(vertaalFout(String((err as Error)?.message || 'SOCIAL_FOUT'), lang));
    } finally {
      setBezig(false);
    }
  };

  const verwijderProfielItem = async (p: SocialProfiel) => {
    if (!magSchrijven) return;
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      await verwijderSocialProfiel(p.id, { service: 'identity', tabContext, sourceOrigin });
      if (profielBewerkId === p.id) wisProfielFormulier();
      setMelding(tr(lang, 'Профіль прибрано з цього простору.', 'Het profiel is uit deze ruimte verwijderd.'));
      await herlaad();
    } catch (err) {
      setFout(vertaalFout(String((err as Error)?.message || 'SOCIAL_FOUT'), lang));
    } finally {
      setBezig(false);
    }
  };

  const slaBerichtOp = async (e: FormEvent) => {
    e.preventDefault();
    if (!magSchrijven) return;
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      await bewaarSocialBericht(
        {
          ...(berichtBewerkId ? { id: berichtBewerkId } : {}),
          netwerk: berichtNetwerk,
          handvat: '',
          url: berichtUrl,
          titel: berichtTitel,
          inhoud: berichtInhoud,
          status: berichtStatus,
        },
        { service: 'identity', tabContext, sourceOrigin },
      );
      wisBerichtFormulier();
      setMelding(tr(lang, 'Чернетку публікації збережено.', 'Het publicatieconcept is opgeslagen.'));
      await herlaad();
    } catch (err) {
      setFout(vertaalFout(String((err as Error)?.message || 'SOCIAL_FOUT'), lang));
    } finally {
      setBezig(false);
    }
  };

  const verwijderBerichtItem = async (b: SocialBericht) => {
    if (!magSchrijven) return;
    setBezig(true);
    setFout('');
    setMelding('');
    try {
      await verwijderSocialBericht(b.id, { service: 'identity', tabContext, sourceOrigin });
      if (berichtBewerkId === b.id) wisBerichtFormulier();
      setMelding(tr(lang, 'Чернетку публікації видалено.', 'Het publicatieconcept is verwijderd.'));
      await herlaad();
    } catch (err) {
      setFout(vertaalFout(String((err as Error)?.message || 'SOCIAL_FOUT'), lang));
    } finally {
      setBezig(false);
    }
  };

  const tgAantal = data?.koppelingen.telegram.aantal ?? 0;
  const discordAantal = data?.koppelingen.discord.aantal ?? 0;
  const ghAantal = data?.koppelingen.github.accounts.length ?? 0;
  const fotoMediaAantal = data?.fotoArchieven.totaalMedia ?? 0;
  const profielen = data?.profielen ?? [];
  const berichten = data?.berichten ?? [];

  return (
    <section className='soc-pagina' data-social-overzicht='klaar' data-social-ruimte={data?.ruimte || 'prive'} aria-labelledby='soc-hoofdkop'>
      <header className='soc-kop'>
        <div className='soc-kop-tekst'>
          <span className='soc-pil is-ok'>
            <Share2 aria-hidden='true' />
            {tr(lang, 'Власний простір без трекерів', 'Eigen ruimte zonder volgers')}
          </span>
          <h1 id='soc-hoofdkop'>{tr(lang, 'Соціальні мережі та канали', 'Sociale netwerken en kanalen')}</h1>
          <p>
            {tr(
              lang,
              'Єдиний огляд підключених облікових прив’язок, збережених медіаархівів у службі «Фото» та ваших власних каналів і чернеток публікацій — суворо ізольовано в межах вибраного простору.',
              'Eén overzicht van uw gekoppelde accounts, bewaarde media-archieven in «Foto’s» en uw eigen kanalen en publicatieconcepten — strikt gescheiden binnen de gekozen ruimte.',
            )}
          </p>
        </div>
        <div className='soc-kop-acties'>
          {data?.ruimte === 'technisch' ? (
            <span className='soc-pil is-warn'>
              <ShieldCheck aria-hidden='true' />
              {tr(lang, 'Технічний простір', 'Technische ruimte')}
            </span>
          ) : null}
          {opslagActief ? (
            <button type='button' className='soc-knop' disabled={bezig} onClick={() => void herlaad()} data-social-vernieuwen='1'>
              <RefreshCw aria-hidden='true' />
              {tr(lang, 'Оновити стан', 'Status vernieuwen')}
            </button>
          ) : null}
        </div>
      </header>

      <nav className='soc-snelle-sprongen' aria-label={tr(lang, 'Суміжні розділи простору', 'Verwante onderdelen van de ruimte')}>
        <button type='button' className='soc-knop' onClick={() => gaNaar('hub', 'photos')} data-social-sprong='photos'>
          <Images aria-hidden='true' />
          {tr(lang, 'Архіви у «Фото»', 'Archieven in «Foto’s»')}
          <ArrowRight aria-hidden='true' />
        </button>
        <button type='button' className='soc-knop' onClick={() => gaNaar('hub', 'notes')} data-social-sprong='notes'>
          <FileText aria-hidden='true' />
          {tr(lang, 'Нотатки простору', 'Ruimtenotities')}
          <ArrowRight aria-hidden='true' />
        </button>
        <button type='button' className='soc-knop' onClick={() => gaNaar('cloud', 'accounts')} data-social-sprong='cloud-accounts'>
          <Globe aria-hidden='true' />
          {tr(lang, 'Центр підключень хмари', 'Verbindingencentrum van opslag')}
          <ArrowRight aria-hidden='true' />
        </button>
        <button type='button' className='soc-knop' onClick={() => gaNaar('identity', 'methods')} data-social-sprong='identity-methods'>
          <ShieldCheck aria-hidden='true' />
          {tr(lang, 'Прив’язки Telegram і Discord', 'Telegram- en Discord-koppelingen')}
          <ArrowRight aria-hidden='true' />
        </button>
      </nav>

      {!opslagActief ? (
        <p className='soc-melding' role='status' data-social-vlag='uit'>
          {tr(
            lang,
            'Серверне збереження власних каналів і чернеток очікує ввімкнення прапорця можливостей «social-overzicht-v1». Переходи до служби «Фото», «Нотаток» і налаштувань підключень уже доступні вище.',
            'De serveropslag voor eigen kanalen en concepten wacht op het inschakelen van de functieschakelaar «social-overzicht-v1». De snelkoppelingen naar «Foto’s», «Notities» en de koppelinstellingen hierboven werken direct.',
          )}
        </p>
      ) : null}

      {fout ? (
        <p className='soc-melding is-fout' role='alert' data-social-fout='1'>
          {fout}
        </p>
      ) : null}
      {melding ? (
        <p className='soc-melding' role='status' data-social-melding='1'>
          {melding}
        </p>
      ) : null}

      <div className='soc-tellers'>
        <div className='soc-teller-kaart'>
          <strong>{tgAantal + discordAantal + ghAantal}</strong>
          <span>{tr(lang, 'підключених служб входу та коду', 'gekoppelde aanmeld- en codediensten')}</span>
        </div>
        <div className='soc-teller-kaart'>
          <strong>{fotoMediaAantal}</strong>
          <span>{tr(lang, 'збережених світлин і відео у «Фото»', 'bewaarde foto’s en video’s in «Foto’s»')}</span>
        </div>
        <div className='soc-teller-kaart'>
          <strong>{profielen.length}</strong>
          <span>{tr(lang, 'власних профілів та каналів', 'eigen profielen en kanalen')}</span>
        </div>
        <div className='soc-teller-kaart'>
          <strong>{berichten.length}</strong>
          <span>{tr(lang, 'чернеток і запланованих дописів', 'concepten en geplande berichten')}</span>
        </div>
      </div>

      <section className='soc-sectie' aria-labelledby='soc-kanalen-kop'>
        <div className='soc-sectie-kop'>
          <h2 id='soc-kanalen-kop'>{tr(lang, 'Підключені облікові канали', 'Gekoppelde accountkanalen')}</h2>
          <span className='soc-pil'>
            {tr(lang, 'Без витоку маркерів доступу', 'Zonder blootstelling van toegangstokens')}
          </span>
        </div>
        <p className='soc-sectie-uitleg'>
          {tr(
            lang,
            'Стан ваших чинних прив’язок у Telegram, Discord і GitHub. Особисті способи входу видно лише в особистому просторі.',
            'De actuele status van uw koppelingen bij Telegram, Discord en GitHub. Persoonlijke aanmeldwegen verschijnen alleen in de persoonlijke ruimte.',
          )}
        </p>
        <div className='soc-kanalen-raster'>
          <article className='soc-kanaal-kaart' data-social-kanaal='telegram'>
            <div className='soc-kanaal-boven'>
              <Merk merk='telegram' naam='Telegram' vorm='tegel' maat={32} />
              <div>
                <strong>Telegram</strong>
                <div>
                  <span className={`soc-pil ${tgAantal > 0 ? 'is-ok' : ''}`}>
                    {tgAantal > 0 ? tr(lang, `Підключено: ${tgAantal}`, `Gekoppeld: ${tgAantal}`) : tr(lang, 'Не підключено', 'Niet gekoppeld')}
                  </span>
                </div>
              </div>
            </div>
            {data?.koppelingen.telegram.kanalen.length ? (
              <ul className='soc-kanaal-lijst'>
                {data.koppelingen.telegram.kanalen.map((k) => (
                  <li key={k.id}>
                    <span>{k.naam}</span>
                    <small>{k.gebruikersnaam || k.stand}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className='soc-waarschuwing'>
                {tr(lang, 'Налаштування бота та сповіщень доступні в розділі «Способи входу».', 'De bot- en meldingsinstellingen vindt u bij «Aanmeldmethoden».')}
              </p>
            )}
          </article>

          <article className='soc-kanaal-kaart' data-social-kanaal='discord'>
            <div className='soc-kanaal-boven'>
              <Merk merk='discord' naam='Discord' vorm='tegel' maat={32} />
              <div>
                <strong>Discord</strong>
                <div>
                  <span className={`soc-pil ${discordAantal > 0 ? 'is-ok' : ''}`}>
                    {discordAantal > 0 ? tr(lang, `Підключено: ${discordAantal}`, `Gekoppeld: ${discordAantal}`) : tr(lang, 'Не підключено', 'Niet gekoppeld')}
                  </span>
                </div>
              </div>
            </div>
            {data?.koppelingen.discord.accounts.length ? (
              <ul className='soc-kanaal-lijst'>
                {data.koppelingen.discord.accounts.map((d) => (
                  <li key={d.id}>
                    <span>{d.label}</span>
                    <small>OAuth2</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className='soc-waarschuwing'>
                {tr(lang, 'Прив’язка Discord з одноразовим PKCE виконується в «Способах входу».', 'Een Discord-koppeling met eenmalige PKCE maakt u bij «Aanmeldmethoden».')}
              </p>
            )}
          </article>

          <article className='soc-kanaal-kaart' data-social-kanaal='github'>
            <div className='soc-kanaal-boven'>
              <Merk merk='github' naam='GitHub' vorm='tegel' maat={32} />
              <div>
                <strong>GitHub</strong>
                <div>
                  <span className={`soc-pil ${ghAantal > 0 ? 'is-ok' : data?.koppelingen.github.kluisGesloten ? 'is-warn' : ''}`}>
                    {data?.koppelingen.github.kluisGesloten
                      ? tr(lang, 'Сховище ключів зачинене', 'Sleutelkluis gesloten')
                      : ghAantal > 0
                        ? tr(lang, `Підключено: ${ghAantal}`, `Gekoppeld: ${ghAantal}`)
                        : tr(lang, 'Не підключено', 'Niet gekoppeld')}
                  </span>
                </div>
              </div>
            </div>
            {data?.koppelingen.github.accounts.length ? (
              <ul className='soc-kanaal-lijst'>
                {data.koppelingen.github.accounts.map((g) => (
                  <li key={`${g.pad}:${g.login}`}>
                    <span>{g.login ? `@${g.login}` : g.pad.toUpperCase()}</span>
                    <small>{tr(lang, `${g.repoAantal} сховищ`, `${g.repoAantal} opslagplaatsen`)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className='soc-waarschuwing'>
                {tr(lang, 'Керування профілями й сховищами GitHub доступне у службі GitHub.', 'Het beheer van GitHub-profielen en opslagplaatsen staat in de dienst GitHub.')}
              </p>
            )}
          </article>
        </div>
      </section>

      <section className='soc-sectie' aria-labelledby='soc-foto-kop'>
        <div className='soc-sectie-kop'>
          <h2 id='soc-foto-kop'>{tr(lang, 'Імпортовані архіви соцмереж у службі «Фото»', 'Geïmporteerde netwerkarchieven in «Foto’s»')}</h2>
          <button type='button' className='soc-knop' onClick={() => gaNaar('hub', 'photos')}>
            <Images aria-hidden='true' />
            {tr(lang, 'Відкрити «Фото»', '«Foto’s» openen')}
          </button>
        </div>
        <p className='soc-sectie-uitleg'>
          {tr(
            lang,
            'Вивантажені архіви Instagram, Google Фото, Telegram чи Facebook імпортуються локально у ваш простір служби «Фото» зі збереженням дат зйомки та альбомів.',
            'Gedownloade archieven van Instagram, Google Foto’s, Telegram of Facebook importeert u lokaal in uw «Foto’s»-ruimte met behoud van opnamedata en albums.',
          )}
        </p>
        {data?.fotoArchieven.perBron.length ? (
          <ul className='soc-items'>
            {data.fotoArchieven.perBron.map((b) => (
              <li key={b.id} className='soc-item'>
                <div className='soc-item-kop'>
                  <span className='soc-item-titel'>{lang === 'uk' ? b.naam[0] : b.naam[1]}</span>
                  <span className='soc-pil is-ok'>{tr(lang, `Елементів: ${b.aantal}`, `Items: ${b.aantal}`)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className='soc-leeg'>
            {tr(
              lang,
              'У цьому просторі ще немає імпортованих архівів соцмереж. Завантажити архів можна на вкладці «Фото».',
              'In deze ruimte staan nog geen geïmporteerde archieven uit sociale netwerken. U kunt een archief inlezen op het tabblad «Foto’s».',
            )}
          </p>
        )}
      </section>

      <div className='soc-twee-kolommen'>
        <section className='soc-sectie' aria-labelledby='soc-profielen-kop'>
          <div className='soc-sectie-kop'>
            <h2 id='soc-profielen-kop'>{tr(lang, 'Мої профілі та канали', 'Mijn profielen en kanalen')}</h2>
            <span className='soc-pil'>{profielen.length}</span>
          </div>
          <p className='soc-waarschuwing'>
            {tr(
              lang,
              'Зберігайте лише публічні посилання https:// та назви каналів. Таємні ключі, паролі й маркери доступу тут заборонені.',
              'Bewaar hier uitsluitend openbare https://-koppelingen en kanaalnamen. Geheime sleutels, wachtwoorden en tokens worden geweigerd.',
            )}
          </p>

          <form className='soc-formulier' onSubmit={(e) => void slaProfielOp(e)} data-social-profiel-form='1'>
            <div className='soc-veld'>
              <span>{tr(lang, 'Мережа або платформа', 'Netwerk of platform')}</span>
              <div className='soc-chips' role='group' aria-label={tr(lang, 'Вибір мережі для профілю', 'Netwerk kiezen voor profiel')}>
                {NETWERKEN.map((n) => (
                  <button
                    key={n.id}
                    type='button'
                    className='soc-chip'
                    aria-pressed={profielNetwerk === n.id}
                    disabled={!magSchrijven}
                    onClick={() => setProfielNetwerk(n.id)}
                  >
                    <NetwerkTeken id={n.id} />
                    <span>{lang === 'uk' ? n.naam[0] : n.naam[1]}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className='soc-veld'>
              <span>{tr(lang, 'Назва каналу або сторінки', 'Naam van het kanaal of de pagina')}</span>
              <input
                type='text'
                maxLength={200}
                disabled={!magSchrijven}
                value={profielTitel}
                placeholder={tr(lang, 'Наприклад: Особистий щоденник розробок', 'Bijv.: Persoonlijk ontwikkelkanaal')}
                onChange={(e) => setProfielTitel(e.target.value)}
              />
            </label>

            <label className='soc-veld'>
              <span>{tr(lang, 'Псевдонім або ідентифікатор', 'Gebruikersnaam of kanaalcode')}</span>
              <input
                type='text'
                maxLength={160}
                disabled={!magSchrijven}
                value={profielHandvat}
                placeholder={NETWERKEN.find((n) => n.id === profielNetwerk)?.voorbeeldHandvat || '@naam'}
                onChange={(e) => setProfielHandvat(e.target.value)}
              />
            </label>

            <label className='soc-veld'>
              <span>{tr(lang, 'Публічне посилання (https://)', 'Openbare koppeling (https://)')}</span>
              <input
                type='url'
                maxLength={500}
                disabled={!magSchrijven}
                value={profielUrl}
                placeholder='https://'
                onChange={(e) => setProfielUrl(e.target.value)}
              />
            </label>

            <label className='soc-veld'>
              <span>{tr(lang, 'Короткий опис або примітка', 'Korte toelichting of notitie')}</span>
              <textarea
                maxLength={4000}
                disabled={!magSchrijven}
                value={profielInhoud}
                onChange={(e) => setProfielInhoud(e.target.value)}
              />
            </label>

            <div className='soc-chips' role='group' aria-label={tr(lang, 'Стан каналу', 'Status van het kanaal')}>
              <button type='button' className='soc-chip' aria-pressed={profielStatus === 'actief'} disabled={!magSchrijven} onClick={() => setProfielStatus('actief')}>
                {tr(lang, 'Активний', 'Actief')}
              </button>
              <button type='button' className='soc-chip' aria-pressed={profielStatus === 'gepauzeerd'} disabled={!magSchrijven} onClick={() => setProfielStatus('gepauzeerd')}>
                {tr(lang, 'Призупинений', 'Gepauzeerd')}
              </button>
            </div>

            <div className='soc-item-acties'>
              <button type='submit' className='soc-knop is-primair' disabled={!magSchrijven || bezig} data-social-profiel-opslaan='1'>
                <Plus aria-hidden='true' />
                {profielBewerkId ? tr(lang, 'Оновити профіль', 'Profiel bijwerken') : tr(lang, 'Зберегти профіль', 'Profiel bewaren')}
              </button>
              {profielBewerkId ? (
                <button type='button' className='soc-knop' onClick={wisProfielFormulier}>
                  {tr(lang, 'Скасувати редагування', 'Bewerken annuleren')}
                </button>
              ) : null}
            </div>
          </form>

          {profielen.length ? (
            <ul className='soc-items' data-social-profielen-lijst='1'>
              {profielen.map((p) => (
                <li key={p.id} className='soc-item'>
                  <div className='soc-item-kop'>
                    <span className='soc-item-titel'>
                      <NetwerkTeken id={p.netwerk} />
                      <span>{p.titel || p.handvat || netwerkNaam(p.netwerk, lang)}</span>
                    </span>
                    <span className={`soc-pil ${p.status === 'actief' ? 'is-ok' : 'is-warn'}`}>
                      {p.status === 'actief' ? tr(lang, 'Активний', 'Actief') : tr(lang, 'Призупинений', 'Gepauzeerd')}
                    </span>
                  </div>
                  {p.handvat ? <small>{p.handvat}</small> : null}
                  {p.inhoud ? <p>{p.inhoud}</p> : null}
                  <div className='soc-item-acties'>
                    {p.url ? (
                      <a className='soc-knop' href={p.url} target='_blank' rel='noopener noreferrer'>
                        <ExternalLink aria-hidden='true' />
                        {tr(lang, 'Відкрити сторінку', 'Pagina openen')}
                      </a>
                    ) : null}
                    {magSchrijven ? (
                      <>
                        <button
                          type='button'
                          className='soc-knop'
                          onClick={() => {
                            setProfielBewerkId(p.id);
                            setProfielNetwerk(p.netwerk);
                            setProfielTitel(p.titel);
                            setProfielHandvat(p.handvat);
                            setProfielUrl(p.url);
                            setProfielInhoud(p.inhoud);
                            setProfielStatus(p.status);
                          }}
                        >
                          <Pencil aria-hidden='true' />
                          {tr(lang, 'Змінити', 'Wijzigen')}
                        </button>
                        <button type='button' className='soc-knop is-gevaar' disabled={bezig} onClick={() => void verwijderProfielItem(p)}>
                          <Trash2 aria-hidden='true' />
                          {tr(lang, 'Видалити', 'Verwijderen')}
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className='soc-leeg'>{tr(lang, 'Збережених власних профілів у цьому просторі ще немає.', 'Er zijn nog geen opgeslagen eigen profielen in deze ruimte.')}</p>
          )}
        </section>

        <section className='soc-sectie' aria-labelledby='soc-berichten-kop'>
          <div className='soc-sectie-kop'>
            <h2 id='soc-berichten-kop'>{tr(lang, 'Чернетки та план публікацій', 'Concepten en publicatieplan')}</h2>
            <span className='soc-pil'>{berichten.length}</span>
          </div>
          <p className='soc-waarschuwing'>
            {tr(
              lang,
              'Готуйте тексти дописів у власному просторі без автоматичного відправлення назовні. Публікація завжди виконується вами свідомо.',
              'Bereid uw berichten voor in uw eigen ruimte zonder automatische verzending naar buiten. Publiceren doet u altijd zelf bewust.',
            )}
          </p>

          <form className='soc-formulier' onSubmit={(e) => void slaBerichtOp(e)} data-social-bericht-form='1'>
            <div className='soc-veld'>
              <span>{tr(lang, 'Цільовий канал', 'Doelkanaal')}</span>
              <div className='soc-chips' role='group' aria-label={tr(lang, 'Вибір мережі для допису', 'Netwerk kiezen voor bericht')}>
                {NETWERKEN.map((n) => (
                  <button
                    key={n.id}
                    type='button'
                    className='soc-chip'
                    aria-pressed={berichtNetwerk === n.id}
                    disabled={!magSchrijven}
                    onClick={() => setBerichtNetwerk(n.id)}
                  >
                    <NetwerkTeken id={n.id} />
                    <span>{lang === 'uk' ? n.naam[0] : n.naam[1]}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className='soc-veld'>
              <span>{tr(lang, 'Заголовок допису', 'Titel van het bericht')}</span>
              <input
                type='text'
                maxLength={200}
                disabled={!magSchrijven}
                value={berichtTitel}
                placeholder={tr(lang, 'Коротка тема публікації', 'Kort onderwerp van de publicatie')}
                onChange={(e) => setBerichtTitel(e.target.value)}
              />
            </label>

            <label className='soc-veld'>
              <span>{tr(lang, 'Текст чернетки', 'Tekst van het concept')}</span>
              <textarea
                maxLength={4000}
                disabled={!magSchrijven}
                value={berichtInhoud}
                placeholder={tr(lang, 'Напишіть чернетку або план допису…', 'Schrijf uw concept of berichtopzet…')}
                onChange={(e) => setBerichtInhoud(e.target.value)}
              />
            </label>

            <label className='soc-veld'>
              <span>{tr(lang, 'Посилання до матеріалу (https://, необов’язково)', 'Koppeling bij het bericht (https://, optioneel)')}</span>
              <input
                type='url'
                maxLength={500}
                disabled={!magSchrijven}
                value={berichtUrl}
                placeholder='https://'
                onChange={(e) => setBerichtUrl(e.target.value)}
              />
            </label>

            <div className='soc-chips' role='group' aria-label={tr(lang, 'Стан публікації', 'Status van het bericht')}>
              {BERICHT_STATUSSEN.map((s) => (
                <button
                  key={s.id}
                  type='button'
                  className='soc-chip'
                  aria-pressed={berichtStatus === s.id}
                  disabled={!magSchrijven}
                  onClick={() => setBerichtStatus(s.id)}
                >
                  {lang === 'uk' ? s.naam[0] : s.naam[1]}
                </button>
              ))}
            </div>

            <div className='soc-item-acties'>
              <button type='submit' className='soc-knop is-primair' disabled={!magSchrijven || bezig} data-social-bericht-opslaan='1'>
                <Plus aria-hidden='true' />
                {berichtBewerkId ? tr(lang, 'Оновити чернетку', 'Concept bijwerken') : tr(lang, 'Зберегти чернетку', 'Concept bewaren')}
              </button>
              {berichtBewerkId ? (
                <button type='button' className='soc-knop' onClick={wisBerichtFormulier}>
                  {tr(lang, 'Скасувати редагування', 'Bewerken annuleren')}
                </button>
              ) : null}
            </div>
          </form>

          {berichten.length ? (
            <ul className='soc-items' data-social-berichten-lijst='1'>
              {berichten.map((b) => {
                const st = BERICHT_STATUSSEN.find((s) => s.id === b.status);
                return (
                  <li key={b.id} className='soc-item'>
                    <div className='soc-item-kop'>
                      <span className='soc-item-titel'>
                        <NetwerkTeken id={b.netwerk} />
                        <span>{b.titel || netwerkNaam(b.netwerk, lang)}</span>
                      </span>
                      <span className='soc-pil'>{st ? (lang === 'uk' ? st.naam[0] : st.naam[1]) : b.status}</span>
                    </div>
                    {b.inhoud ? <p>{b.inhoud}</p> : null}
                    <div className='soc-item-acties'>
                      {b.url ? (
                        <a className='soc-knop' href={b.url} target='_blank' rel='noopener noreferrer'>
                          <ExternalLink aria-hidden='true' />
                          {tr(lang, 'Посилання', 'Koppeling')}
                        </a>
                      ) : null}
                      {magSchrijven ? (
                        <>
                          <button
                            type='button'
                            className='soc-knop'
                            onClick={() => {
                              setBerichtBewerkId(b.id);
                              setBerichtNetwerk(b.netwerk);
                              setBerichtTitel(b.titel);
                              setBerichtInhoud(b.inhoud);
                              setBerichtUrl(b.url);
                              setBerichtStatus(b.status);
                            }}
                          >
                            <Pencil aria-hidden='true' />
                            {tr(lang, 'Змінити', 'Wijzigen')}
                          </button>
                          <button type='button' className='soc-knop is-gevaar' disabled={bezig} onClick={() => void verwijderBerichtItem(b)}>
                            <Trash2 aria-hidden='true' />
                            {tr(lang, 'Видалити', 'Verwijderen')}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className='soc-leeg'>{tr(lang, 'Чернеток публікацій у цьому просторі ще немає.', 'Er zijn nog geen publicatieconcepten in deze ruimte.')}</p>
          )}
        </section>
      </div>
    </section>
  );
}

export default SocialOverzicht;
