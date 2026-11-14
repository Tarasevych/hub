// Оформлення сторінки облікового запису (завдання IDENTITY-002): натискання на аватар відкриває три джерела фото (пристрій, сервіс, посилання).
// Смітничок — маленька кнопка 24 px у куті аватара, тому камера в центрі лишається вільною.
// IDENTITEIT-015 (profiel-blokken): четвертий варіант «Без фото» (лише ініціали, і Google при вході фото не повертає) і
// посилання через сервер (fotoVanLink: сервер сам завантажує зображення із захистом від SSRF; браузерний fetch лише як запасний шлях).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ImagePlus, Link2, Trash2, Upload, Cloud, UserRound, X } from 'lucide-react';
import { BevestigDialoog } from '../platform/BevestigDialoog';

type Props = {
  naam: string;
  email: string;
  foto: string;
  eigenFoto?: boolean;
  /** IDENTITEIT-015: вибрано «Без фото» — показуються лише ініціали. */
  geenFoto?: boolean;
  rolTekst: ReactNode;
  lang: 'uk' | 'nl';
  /** Передає файл, null (повернути сервісне фото) або 'geen' («Без фото») у наявний код застосунку. */
  onFoto?: (file: File | null | 'geen') => Promise<unknown>;
  /** IDENTITEIT-015: завантаження за посиланням через сервер. Повертає файл або пару [uk, nl] з причиною відмови. */
  fotoVanLink?: (url: string) => Promise<File | readonly [string, string]>;
};

type Bron = 'apparaat' | 'dienst' | 'link' | 'geen';

const tekst = (lang: 'uk' | 'nl', uk: string, nl: string) => (lang === 'uk' ? uk : nl);

const MAX_URL_FOTO_BYTES = 8 * 1024 * 1024;
const MAX_APPARAAT_FOTO_BYTES = 12 * 1024 * 1024;

const initialen = (naam: string, email = '') => {
  const delen = naam
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((deel) => deel[0]?.toUpperCase() ?? '')
    .join('');
  if (delen) return delen;
  return (email.trim().slice(0, 2) || '?').toUpperCase();
};

/** Перетворює URL у файл із обмеженням часу, розміру, заголовка джерела й дозволених растрових форматів. */
async function bestandVanUrl(url: string): Promise<File> {
  const regelaar = new AbortController();
  const wekker = setTimeout(() => regelaar.abort(), 10_000);
  try {
    const antwoord = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: regelaar.signal,
    });
    if (!antwoord.ok) throw new Error(`HTTP ${antwoord.status}`);
    const opgegeven = Number(antwoord.headers.get('content-length') || 0);
    if (opgegeven > MAX_URL_FOTO_BYTES) throw new Error('FOTO_TE_GROOT');
    const blob = await antwoord.blob();
    if (blob.size > MAX_URL_FOTO_BYTES) throw new Error('FOTO_TE_GROOT');
    if (!/^image\/(jpeg|png|webp)$/.test(blob.type)) throw new Error('GEEN_VEILIGE_AFBEELDING');
    const naam = `foto-${Date.now()}.${(blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
    return new File([blob], naam, { type: blob.type });
  } finally {
    clearTimeout(wekker);
  }
}

export function Profielfoto({ naam, email, foto, eigenFoto, geenFoto, rolTekst, lang, onFoto, fotoVanLink }: Props) {
  const [open, setOpen] = useState(false);
  const [bron, setBron] = useState<Bron>('apparaat');
  const [voorbeeld, setVoorbeeld] = useState<string>('');
  const [voorbeelFile, setVoorbeeldFile] = useState<File | null>(null);
  const [link, setLink] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [fotoFout, setFotoFout] = useState(false);
  const dialoog = useRef<HTMLDivElement>(null);
  const invoer = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFotoFout(false);
  }, [foto]);

  useEffect(() => {
    if (!open) return;
    const opToets = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', opToets);
    dialoog.current?.focus();
    return () => document.removeEventListener('keydown', opToets);
  }, [open]);

  useEffect(() => {
    if (!voorbeeld || !voorbeeld.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(voorbeeld);
  }, [voorbeeld]);

  const kiesBestand = (file: File | null) => {
    setFout('');
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setFout(tekst(lang, 'Потрібен JPEG, PNG або WebP.', 'Alleen JPEG, PNG of WebP.'));
      return;
    }
    if (file.size > MAX_APPARAAT_FOTO_BYTES) {
      setFout(tekst(lang, 'Файл завеликий (максимум 12 МБ). Оберіть менше зображення.', 'Het bestand is te groot (maximaal 12 MB). Kies een kleinere afbeelding.'));
      return;
    }
    setVoorbeeldFile(file);
    setVoorbeeld(URL.createObjectURL(file));
  };

  const vanafLink = async () => {
    setFout('');
    if (!/^https:\/\//i.test(link.trim())) {
      setFout(tekst(lang, 'Потрібне посилання https://.', 'Een https://-adres is nodig.'));
      return;
    }
    setBezig(true);
    try {
      // IDENTITEIT-015: спершу сервер (без обмежень CORS, із захистом від SSRF); його відмову показуємо як є.
      const file = fotoVanLink ? await fotoVanLink(link.trim()) : await bestandVanUrl(link.trim());
      if (Array.isArray(file)) { setFout(tekst(lang, file[0], file[1])); return; }
      setVoorbeeldFile(file as File);
      setVoorbeeld(URL.createObjectURL(file as File));
    } catch {
      setFout(tekst(
        lang,
        'Не вдалося завантажити зображення JPEG/PNG/WebP за посиланням (сайт може забороняти прямий доступ або формат не підтримується). Збережіть файл і оберіть «Пристрій».',
        'De JPEG/PNG/WebP-afbeelding kon niet worden opgehaald (de site kan directe toegang weigeren of het formaat wordt niet ondersteund). Bewaar het bestand en kies «Apparaat».',
      ));
    } finally {
      setBezig(false);
    }
  };

  // IDENTITEIT-013: прибирання власного фото — лише після підтвердження: власний файл не зберігається, повернути його можна
  // тільки повторним завантаженням. Обидві кнопки (смітник і «Повернути сервісне фото») спершу відкривають діалог.
  const [vraagHerstel, setVraagHerstel] = useState(false);
  const herstel = async () => {
    setFout('');
    if (!eigenFoto && !geenFoto) {
      setFout(tekst(
        lang,
        'Власне фото профілю не встановлено.',
        'Er is geen eigen profielfoto ingesteld.',
      ));
      return;
    }
    if (!onFoto) return;
    setBezig(true);
    try {
      await onFoto(null);
      setVoorbeeld('');
      setVoorbeeldFile(null);
      setOpen(false);
    } catch {
      setFout(tekst(lang, 'Не вдалося прибрати власне фото профілю.', 'De eigen profielfoto kon niet worden verwijderd.'));
    } finally {
      setBezig(false);
    }
  };

  // IDENTITEIT-015: «Без фото» — після підтвердження. Повторний вибір дає той самий стан (сервер ідемпотентний).
  const [vraagGeen, setVraagGeen] = useState(false);
  const zonderFoto = async () => {
    if (!onFoto) return;
    setBezig(true);
    setFout('');
    try {
      await onFoto('geen');
      setVoorbeeld('');
      setVoorbeeldFile(null);
      setOpen(false);
    } catch {
      setFout(tekst(lang, 'Не вдалося прибрати фото. Нічого не змінено — спробуйте ще раз.', 'De foto kon niet worden verwijderd. Er is niets gewijzigd — probeer het opnieuw.'));
    } finally {
      setBezig(false);
    }
  };

  const toepassen = async () => {
    if (!voorbeelFile || !onFoto) return;
    setBezig(true);
    setFout('');
    try {
      await onFoto(voorbeelFile);
      setOpen(false);
      setVoorbeeld('');
      setVoorbeeldFile(null);
      setLink('');
    } catch {
      setFout(tekst(lang, 'Сервер не прийняв фото. Спробуйте інший файл.', 'De server accepteerde de foto niet. Probeer een ander bestand.'));
    } finally {
      setBezig(false);
    }
  };

  const toonFoto = Boolean(foto && !fotoFout);

  const dialoogVenster = open ? (
    <div className='ia-dialoog-achtergrond' role='presentation' onClick={() => setOpen(false)}>
      <div
        className='ia-dialoog'
        role='dialog'
        aria-modal='true'
        aria-label={tekst(lang, 'Фото профілю', 'Profielfoto')}
        tabIndex={-1}
        ref={dialoog}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3>{tekst(lang, 'Фото профілю', 'Profielfoto')}</h3>
          <button type='button' className='ia-dialoog-sluit' onClick={() => setOpen(false)} aria-label={tekst(lang, 'Закрити', 'Sluiten')}>
            <X />
          </button>
        </header>

        <div className='ia-bronnen' role='tablist' aria-label={tekst(lang, 'Джерело фото', 'Bron van de foto')}>
          <button type='button' role='tab' aria-selected={bron === 'apparaat'} className={bron === 'apparaat' ? 'actief' : ''} onClick={() => { setFout(''); setBron('apparaat'); }}>
            <Upload />{tekst(lang, 'Пристрій', 'Apparaat')}
          </button>
          <button type='button' role='tab' aria-selected={bron === 'dienst'} className={bron === 'dienst' ? 'actief' : ''} onClick={() => { setFout(''); setBron('dienst'); }}>
            <Cloud />{tekst(lang, 'Сервіс', 'Dienst')}
          </button>
          <button type='button' role='tab' aria-selected={bron === 'link'} className={bron === 'link' ? 'actief' : ''} onClick={() => { setFout(''); setBron('link'); }}>
            <Link2 />{tekst(lang, 'Посилання', 'Link')}
          </button>
          <button type='button' role='tab' aria-selected={bron === 'geen'} className={bron === 'geen' ? 'actief' : ''} onClick={() => { setFout(''); setBron('geen'); }} data-foto-geen>
            <UserRound />{tekst(lang, 'Без фото', 'Geen foto')}
          </button>
        </div>

        <div className='ia-bron-inhoud'>
          {bron === 'apparaat' && (
            <>
              <p>{tekst(lang, 'JPEG, PNG або WebP. Фото автоматично вирівнюється по центру у квадрат 512×512 px.', 'JPEG, PNG of WebP. De foto wordt automatisch in het midden uitgesneden tot 512×512 px.')}</p>
              <input ref={invoer} type='file' accept='image/jpeg,image/png,image/webp' className='ia-bestand' onChange={(e) => { kiesBestand(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} />
              <button type='button' className='ia-knop' onClick={() => invoer.current?.click()}>
                <ImagePlus />{tekst(lang, 'Обрати файл', 'Bestand kiezen')}
              </button>
            </>
          )}
          {bron === 'dienst' && (
            eigenFoto || geenFoto ? (
              <>
                <p>{geenFoto ? tekst(lang, 'Зараз вибрано «Без фото»: усюди показуються лише ініціали. Можна знову показувати фото з вашого сервісу входу.', 'Nu is «Geen foto» gekozen: overal staan alleen initialen. U kunt de foto van uw aanmelddienst weer laten tonen.') : tekst(lang, 'Зараз встановлено вашу власну світлину. Ви можете повернути стандартне фото з вашого сервісу входу.', 'U gebruikt nu een eigen profielfoto. U kunt de standaardfoto van uw aanmelddienst herstellen.')}</p>
                <button type='button' className='ia-knop' onClick={() => setVraagHerstel(true)} disabled={bezig || !onFoto}>
                  <Cloud />{tekst(lang, 'Повернути сервісне фото', 'Servicefoto herstellen')}
                </button>
              </>
            ) : (
              <>
                <p>{tekst(lang, 'Зараз використовується фото з вашого сервісу входу.', 'De foto uit uw aanmelddienst is al actief.')}</p>
                {toonFoto ? <img className='ia-dienst-voorbeeld' src={foto} alt='' referrerPolicy='no-referrer' onError={() => setFotoFout(true)} /> : <p className='ia-leeg'>{tekst(lang, 'Сервіс не передав фото.', 'De dienst heeft geen foto geleverd.')}</p>}
              </>
            )
          )}
          {bron === 'link' && (
            <>
              <p>{fotoVanLink ? tekst(lang, 'Пряме https-посилання на зображення JPEG, PNG або WebP до 8 МБ. Сайт завантажить його сам; адреси внутрішніх мереж і переадресації не приймаються.', 'Een directe https-link naar een JPEG-, PNG- of WebP-afbeelding tot 8 MB. De site haalt die zelf op; adressen in interne netwerken en doorverwijzingen worden niet aanvaard.') : tekst(lang, 'Пряме https-посилання на зображення.', 'Een directe https-link naar een afbeelding.')}</p>
              <input type='url' className='ia-link' placeholder='https://…' value={link} onChange={(e) => setLink(e.target.value)} />
              <button type='button' className='ia-knop' onClick={() => void vanafLink()} disabled={bezig}>
                <Link2 />{tekst(lang, 'Завантажити', 'Ophalen')}
              </button>
            </>
          )}
          {bron === 'geen' && (
            <>
              <p>{tekst(lang, 'Замість фото всюди (шапка, меню облікового запису, інші піддомени) показуватимуться ваші ініціали. Під час наступного входу через Google фото не повернеться само.', 'In plaats van een foto staan overal (kop, accountmenu, andere subdomeinen) uw initialen. Bij de volgende aanmelding via Google komt de foto niet vanzelf terug.')}</p>
              <span className='ia-avatar ia-avatar-klein' aria-hidden='true'><span className='ia-initialen'>{initialen(naam, email)}</span></span>
              {geenFoto ? <p className='ia-leeg' data-foto-geen-actief>{tekst(lang, 'Уже вибрано. Щоб знову показувати фото, оберіть «Сервіс» або «Пристрій».', 'Al gekozen. Om weer een foto te tonen, kies «Dienst» of «Apparaat».')}</p> : (
                <button type='button' className='ia-knop' onClick={() => setVraagGeen(true)} disabled={bezig || !onFoto}>
                  <UserRound />{tekst(lang, 'Показувати лише ініціали', 'Alleen initialen tonen')}
                </button>
              )}
            </>
          )}
        </div>

        {bron !== 'dienst' && bron !== 'geen' && (
          <div className='ia-voorbeeld'>
            {voorbeeld ? <img src={voorbeeld} alt={tekst(lang, 'Попередній перегляд', 'Voorbeeld')} /> : <span>{tekst(lang, 'Попередній перегляд з’явиться після вибору', 'Het voorbeeld verschijnt na uw keuze')}</span>}
          </div>
        )}

        {fout && <p className='ia-fout' role='alert'>{fout}</p>}

        <footer>
          <button type='button' className='ia-knop ia-knop-zwak' onClick={() => setOpen(false)}>
            {tekst(lang, 'Скасувати', 'Annuleren')}
          </button>
          {bron !== 'dienst' && bron !== 'geen' && (
            <button type='button' className='ia-knop' onClick={() => void toepassen()} disabled={!voorbeelFile || bezig || !onFoto}>
              {tekst(lang, 'Застосувати', 'Toepassen')}
            </button>
          )}
        </footer>
      </div>
    </div>
  ) : null;

  return (
    <article className='settings-profile-card ia-profiel'>
      <span className='ia-avatar-wikkel'>
        <button
          type='button'
          className='ia-avatar'
          onClick={() => setOpen(true)}
          aria-label={tekst(lang, 'Змінити фото профілю', 'Profielfoto wijzigen')}
        >
          {toonFoto ? <img src={foto} alt='' referrerPolicy='no-referrer' onError={() => setFotoFout(true)} /> : <span className='ia-initialen'>{initialen(naam, email)}</span>}
          <span className='ia-avatar-camera' aria-hidden='true'><Camera /></span>
        </button>
        {eigenFoto && (
          <button
            type='button'
            className='ia-avatar-prullenbak'
            disabled={bezig}
            onClick={() => setVraagHerstel(true)}
            aria-label={tekst(lang, 'Прибрати власне фото', 'Eigen foto verwijderen')}
            title={tekst(lang, 'Прибрати власне фото', 'Eigen foto verwijderen')}
          >
            <Trash2 />
          </button>
        )}
      </span>
      <div>
        <strong>{naam}</strong>
        <span>{email}</span>
        {rolTekst}
      </div>

      {dialoogVenster ? (typeof document !== 'undefined' && document.body ? createPortal(dialoogVenster, document.body) : dialoogVenster) : null}
      <BevestigDialoog
        open={vraagHerstel}
        id='foto-herstellen'
        lang={lang}
        gevaarlijk
        titel={tekst(lang, 'Прибрати власне фото?', 'Eigen foto verwijderen?')}
        uitleg={tekst(lang, 'Замість нього знову показуватиметься фото з вашого сервісу входу (наприклад, Google).', 'In plaats daarvan wordt de foto van uw aanmelddienst (bijvoorbeeld Google) weer getoond.')}
        gevolgen={[
          tekst(lang, 'Власний файл фото не зберігається — повернути його можна лише новим завантаженням.', 'Het eigen fotobestand wordt niet bewaard — terugzetten kan alleen door het opnieuw te uploaden.'),
          tekst(lang, 'Нове фото з’явиться на всіх піддоменах одразу.', 'De nieuwe foto verschijnt meteen op alle subdomeinen.'),
        ]}
        bevestigTekst={tekst(lang, 'Так, прибрати', 'Ja, verwijderen')}
        bezig={bezig}
        onAnnuleer={() => setVraagHerstel(false)}
        onBevestig={async () => { setVraagHerstel(false); await herstel(); }}
      />
      <BevestigDialoog
        open={vraagGeen}
        id='foto-geen'
        lang={lang}
        titel={tekst(lang, 'Показувати лише ініціали?', 'Alleen initialen tonen?')}
        uitleg={tekst(lang, 'Буде прибрано і власне фото, і фото з сервісу входу.', 'Zowel de eigen foto als de foto van de aanmelddienst worden weggehaald.')}
        gevolgen={[
          tekst(lang, 'Власний файл фото не зберігається — повернути його можна лише новим завантаженням.', 'Het eigen fotobestand wordt niet bewaard — terugzetten kan alleen door het opnieuw te uploaden.'),
          tekst(lang, 'Фото з Google можна повернути будь-коли: «Сервіс» → «Повернути сервісне фото».', 'De foto van Google kunt u altijd terugzetten: «Dienst» → «Servicefoto herstellen».'),
          tekst(lang, 'Зміна з’явиться на всіх піддоменах одразу.', 'De wijziging verschijnt meteen op alle subdomeinen.'),
        ]}
        bevestigTekst={tekst(lang, 'Так, без фото', 'Ja, geen foto')}
        bezig={bezig}
        onAnnuleer={() => setVraagGeen(false)}
        onBevestig={async () => { setVraagGeen(false); await zonderFoto(); }}
      />
    </article>
  );
}
