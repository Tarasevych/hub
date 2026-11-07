// Оформлення сторінки облікового запису (завдання IDENTITY-002): натискання на аватар відкриває три джерела фото (пристрій, сервіс, посилання).
// Смітничок — маленька кнопка 24 px у куті аватара, тому камера в центрі лишається вільною.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, ImagePlus, Link2, Trash2, Upload, Cloud, X } from 'lucide-react';

type Props = {
  naam: string;
  email: string;
  foto: string;
  rolTekst: ReactNode;
  lang: 'uk' | 'nl';
  /** Передає файл у наявний код застосунку (він стискає до 512 px і надсилає на сервер). */
  onFoto?: (file: File) => Promise<unknown>;
};

type Bron = 'apparaat' | 'dienst' | 'link';

const tekst = (lang: 'uk' | 'nl', uk: string, nl: string) => (lang === 'uk' ? uk : nl);

const initialen = (naam: string) =>
  naam
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((deel) => deel[0]?.toUpperCase() ?? '')
    .join('');

/** Перетворює URL у файл, щоб використати той самий шлях завантаження, що й для пристрою. */
async function bestandVanUrl(url: string): Promise<File> {
  const antwoord = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!antwoord.ok) throw new Error(`HTTP ${antwoord.status}`);
  const blob = await antwoord.blob();
  if (!/^image\//.test(blob.type)) throw new Error('GEEN_AFBEELDING');
  const naam = `foto-${Date.now()}.${(blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
  return new File([blob], naam, { type: blob.type });
}

export function Profielfoto({ naam, email, foto, rolTekst, lang, onFoto }: Props) {
  const [open, setOpen] = useState(false);
  const [bron, setBron] = useState<Bron>('apparaat');
  const [voorbeeld, setVoorbeeld] = useState<string>('');
  const [voorbeelFile, setVoorbeeldFile] = useState<File | null>(null);
  const [link, setLink] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const dialoog = useRef<HTMLDivElement>(null);
  const invoer = useRef<HTMLInputElement>(null);

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
      const file = await bestandVanUrl(link.trim());
      setVoorbeeldFile(file);
      setVoorbeeld(URL.createObjectURL(file));
    } catch {
      setFout(tekst(
        lang,
        'Не вдалося завантажити зображення за посиланням (сайт може забороняти прямий доступ). Збережіть файл і оберіть «Пристрій».',
        'De afbeelding kon niet worden opgehaald (de site kan directe toegang weigeren). Bewaar het bestand en kies «Apparaat».',
      ));
    } finally {
      setBezig(false);
    }
  };

  const gebruikDienstFoto = async () => {
    setFout('');
    if (!foto) {
      setFout(tekst(lang, 'У профілі немає фото від сервісу.', 'Er is geen servicefoto in het profiel.'));
      return;
    }
    setBezig(true);
    try {
      const file = await bestandVanUrl(foto);
      setVoorbeeldFile(file);
      setVoorbeeld(URL.createObjectURL(file));
    } catch {
      setFout(tekst(
        lang,
        'Сервісне фото не вдалося прочитати в браузері. Збережіть його як файл і оберіть «Пристрій».',
        'De servicefoto kon de browser niet lezen. Bewaar haar als bestand en kies «Apparaat».',
      ));
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

  const herstel = async () => {
    setFout('');
    if (!foto) {
      setFout(tekst(
        lang,
        'Видалення фото на сервері ще не підтримується: поточне фото — єдине, що є.',
        'Foto verwijderen wordt nog niet door de server ondersteund: er is alleen de huidige foto.',
      ));
      return;
    }
    setBezig(true);
    try {
      await onFoto?.(await bestandVanUrl(foto));
      setOpen(false);
    } catch {
      setFout(tekst(lang, 'Не вдалося повернути фото сервісу.', 'De servicefoto kon niet worden hersteld.'));
    } finally {
      setBezig(false);
    }
  };

  return (
    <article className='settings-profile-card ia-profiel'>
      <span className='ia-avatar-wikkel'>
        <button
          type='button'
          className='ia-avatar'
          onClick={() => setOpen(true)}
          aria-label={tekst(lang, 'Змінити фото профілю', 'Profielfoto wijzigen')}
        >
          {foto ? <img src={foto} alt='' /> : <span className='ia-initialen'>{initialen(naam)}</span>}
          <span className='ia-avatar-camera' aria-hidden='true'><Camera /></span>
        </button>
        <button
          type='button'
          className='ia-avatar-prullenbak'
          onClick={() => void herstel()}
          aria-label={tekst(lang, 'Прибрати власне фото', 'Eigen foto verwijderen')}
          title={tekst(lang, 'Прибрати власне фото', 'Eigen foto verwijderen')}
        >
          <Trash2 />
        </button>
      </span>
      <div>
        <strong>{naam}</strong>
        <span>{email}</span>
        {rolTekst}
      </div>

      {open && (
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
              <button type='button' role='tab' aria-selected={bron === 'apparaat'} className={bron === 'apparaat' ? 'actief' : ''} onClick={() => setBron('apparaat')}>
                <Upload />{tekst(lang, 'Пристрій', 'Apparaat')}
              </button>
              <button type='button' role='tab' aria-selected={bron === 'dienst'} className={bron === 'dienst' ? 'actief' : ''} onClick={() => setBron('dienst')}>
                <Cloud />{tekst(lang, 'Сервіс', 'Dienst')}
              </button>
              <button type='button' role='tab' aria-selected={bron === 'link'} className={bron === 'link' ? 'actief' : ''} onClick={() => setBron('link')}>
                <Link2 />{tekst(lang, 'Посилання', 'Link')}
              </button>
            </div>

            <div className='ia-bron-inhoud'>
              {bron === 'apparaat' && (
                <>
                  <p>{tekst(lang, 'JPEG, PNG або WebP. Фото стиснеться до 512 px перед відправкою.', 'JPEG, PNG of WebP. De foto wordt vóór verzending verkleind naar 512 px.')}</p>
                  <input ref={invoer} type='file' accept='image/jpeg,image/png,image/webp' className='ia-bestand' onChange={(e) => kiesBestand(e.target.files?.[0] ?? null)} />
                  <button type='button' className='ia-knop' onClick={() => invoer.current?.click()}>
                    <ImagePlus />{tekst(lang, 'Обрати файл', 'Bestand kiezen')}
                  </button>
                </>
              )}
              {bron === 'dienst' && (
                <>
                  <p>{tekst(lang, 'Поточне фото з вашого сервісу входу. Його можна використати як фото профілю.', 'De huidige foto uit uw aanmelddienst. U kunt haar als profielfoto gebruiken.')}</p>
                  {foto ? <img className='ia-dienst-voorbeeld' src={foto} alt='' /> : <p className='ia-leeg'>{tekst(lang, 'Сервіс не передав фото.', 'De dienst heeft geen foto geleverd.')}</p>}
                  <button type='button' className='ia-knop' onClick={() => void gebruikDienstFoto()} disabled={bezig || !foto}>
                    <Cloud />{tekst(lang, 'Використати це фото', 'Deze foto gebruiken')}
                  </button>
                </>
              )}
              {bron === 'link' && (
                <>
                  <p>{tekst(lang, 'Пряме https-посилання на зображення.', 'Een directe https-link naar een afbeelding.')}</p>
                  <input type='url' className='ia-link' placeholder='https://…' value={link} onChange={(e) => setLink(e.target.value)} />
                  <button type='button' className='ia-knop' onClick={() => void vanafLink()} disabled={bezig}>
                    <Link2 />{tekst(lang, 'Завантажити', 'Ophalen')}
                  </button>
                </>
              )}
            </div>

            <div className='ia-voorbeeld'>
              {voorbeeld ? <img src={voorbeeld} alt={tekst(lang, 'Попередній перегляд', 'Voorbeeld')} /> : <span>{tekst(lang, 'Попередній перегляд з’явиться після вибору', 'Het voorbeeld verschijnt na uw keuze')}</span>}
            </div>

            {fout && <p className='ia-fout' role='alert'>{fout}</p>}

            <footer>
              <button type='button' className='ia-knop ia-knop-zwak' onClick={() => setOpen(false)}>
                {tekst(lang, 'Скасувати', 'Annuleren')}
              </button>
              <button type='button' className='ia-knop' onClick={() => void toepassen()} disabled={!voorbeelFile || bezig || !onFoto}>
                {tekst(lang, 'Застосувати', 'Toepassen')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </article>
  );
}
