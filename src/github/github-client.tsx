// Gedeelde hulpfuncties, netwerkaanroepen, foutvertalingen en vensterbouwstenen voor de GitHub-werkruimte.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { api, ApiError } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { GITHUB_OAUTH_FOUTEN } from '../../shared/github-koppeling';
import { ontleedDiffPatch, type DiffRegel } from '../../shared/github-werkruimte';
import { ruimteFeitenUit, ruimteGeslotenUit, type RuimteFeiten, type RuimteGesloten } from '../../shared/ruimte-weergave';

export type Tr = (uk: string, nl: string) => string;

export type GhRepoSamenvatting = {
  fullName: string;
  name: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  openIssues: number;
  private: boolean;
  archived: boolean;
  pushedAt: string;
  url: string;
  defaultBranch: string;
  fork: boolean;
  topics?: string[];
  homepage?: string;
};

export type GhZaakRij = {
  number: number;
  title: string;
  state: string;
  isPull: boolean;
  draft: boolean;
  author: string;
  comments: number;
  labels: { name: string; color: string }[];
  updatedAt: string;
  url: string;
  body: string;
};

export const ghBasisCtx = () => ({
  service: 'github',
  tabContext: ecosystemTabContext(),
  sourceOrigin: typeof location !== 'undefined' ? location.origin : '',
});

export async function ghPost<T = any>(pad: string, lichaam: Record<string, unknown> = {}): Promise<T> {
  const res = await api.post(`/api/owner/github/${pad}`, { ...ghBasisCtx(), ...lichaam });
  return res.data as T;
}

export const ghFoutCode = (e: unknown): string =>
  e instanceof ApiError ? String(e.response?.data?.error || e.message) : String((e as Error)?.message || '');

const EXTRA_FOUTEN: Record<string, [string, string]> = {
  GITHUB_TOKEN_MISSING: [
    'GitHub ще не підключено. Натисніть «Підключити GitHub в 1 натиск» або відкрийте Сховище ключів.',
    'GitHub is nog niet gekoppeld. Klik op «GitHub in 1 klik koppelen» of open de Sleutelkluis.',
  ],
  GITHUB_TOKEN_INVALID: [
    'GitHub відхилив ключ доступу (недійсний або прострочений). Перепідключіть обліковий запис.',
    'GitHub weigerde de toegangssleutel (ongeldig of verlopen). Koppel het account opnieuw.',
  ],
  GITHUB_FORBIDDEN: [
    'Поточний доступ не має достатніх прав для виконання цієї дії на GitHub.',
    'De huidige koppeling heeft onvoldoende rechten voor deze handeling op GitHub.',
  ],
  GITHUB_RATE_LIMITED: [
    'Тимчасово вичерпано ліміт запитів до GitHub. Спробуйте за кілька хвилин.',
    'De aanvraaglimiet van GitHub is tijdelijk bereikt. Probeer het over enkele minuten opnieuw.',
  ],
  GITHUB_NOT_FOUND: [
    'Сховище, гілку або ресурс не знайдено чи немає доступу.',
    'Opslagplaats, tak of onderdeel niet gevonden of geen toegang.',
  ],
  GITHUB_UNREACHABLE: [
    'Служба GitHub тимчасово недоступна. Спробуйте ще раз.',
    'GitHub is tijdelijk niet bereikbaar. Probeer het opnieuw.',
  ],
  GITHUB_PROJECTS_SCOPE: [
    'Для перегляду проєктів потрібен дозвіл «read:project».',
    'Voor projecten is het recht «read:project» vereist.',
  ],
  GITHUB_TITLE_INVALID: [
    'Заголовок надто короткий (щонайменше 3 символи).',
    'De titel is te kort (minimaal 3 tekens).',
  ],
  GITHUB_BODY_INVALID: [
    'Текст повідомлення або опису не може бути порожнім.',
    'De tekst of beschrijving mag niet leeg zijn.',
  ],
  GITHUB_QUERY_INVALID: [
    'Пошуковий запит занадто короткий.',
    'De zoekopdracht is te kort.',
  ],
  GITHUB_REPO_INVALID: [
    'Неправильний формат назви сховища (очікується власник/назва).',
    'Ongeldige naam van de opslagplaats (verwacht eigenaar/naam).',
  ],
  GITHUB_REPO_NAAM_ONGELDIG: [
    'Вкажіть коректну назву нового сховища (латинські літери, цифри, дефіс або крапка).',
    'Geef een geldige naam voor de nieuwe opslagplaats op (letters, cijfers, koppelteken of punt).',
  ],
  GITHUB_BRANCH_INVALID: [
    'Некоректна назва гілки або обидві гілки однакові.',
    'Ongeldige taknaam of beide takken zijn gelijk.',
  ],
  GITHUB_BRANCH_EXISTS: [
    'Гілка з такою назвою вже існує в цьому сховищі.',
    'Er bestaat al een tak met deze naam in deze opslagplaats.',
  ],
  GITHUB_STANDAARD_TAK_BESCHERMD: [
    'Типову гілку сховища видаляти заборонено.',
    'De standaardtak van de opslagplaats mag niet worden verwijderd.',
  ],
  GITHUB_PAD_ONGELDIG: [
    'Некоректний відносний шлях до файла.',
    'Ongeldig relatief bestandspad.',
  ],
  GITHUB_GEEN_BESTAND: [
    'Вибраний об’єкт є текою, а не текстовим файлом.',
    'Het gekozen pad is een map en geen bestand.',
  ],
  GITHUB_INHOUD_ONGELDIG: [
    'Вміст файла перевищує дозволений обсяг (512 КБ) або пошкоджений.',
    'De bestandsinhoud overschrijdt de limiet (512 KB) of is ongeldig.',
  ],
  GITHUB_COMMIT_BERICHT_ONGELDIG: [
    'Вкажіть змістовне повідомлення фіксації змін (щонайменше 2 символи).',
    'Geef een duidelijke vastleggingsboodschap op (minimaal 2 tekens).',
  ],
  GITHUB_SHA_ONTBREEKT: [
    'Відсутній відбиток версії файла або фіксації змін. Оновіть дані.',
    'De versie-afdruk (SHA) ontbreekt. Vernieuw eerst de weergave.',
  ],
  GITHUB_ISSUE_INVALID: [
    'Некоректний номер задачі або запиту на злиття.',
    'Ongeldig nummer van het vraagstuk of samenvoegingsverzoek.',
  ],
  GITHUB_LABEL_ONGELDIG: [
    'Вкажіть назву мітки та шістнадцятковий колір із 6 символів.',
    'Geef een etiketnaam en een kleur van 6 hex-tekens op.',
  ],
  GITHUB_REVIEW_ONGELDIG: [
    'Оберіть коректний вид рецензії.',
    'Kies een geldige beoordelingsvorm.',
  ],
  GITHUB_SAMENVOEGEN_BEVESTIGING_VEREIST: [
    'Підтвердьте злиття прапорцем перед виконанням дії.',
    'Bevestig het samenvoegen eerst met het selectievakje.',
  ],
  GITHUB_MERGE_METHODE_ONGELDIG: [
    'Невідомий спосіб злиття гілок.',
    'Onbekende samenvoegmethode.',
  ],
  GITHUB_WORKFLOW_ONGELDIG: [
    'Некоректний ідентифікатор конвеєра дій.',
    'Ongeldige aanduiding van de werkstroom.',
  ],
  GITHUB_RUN_INVALID: [
    'Некоректний номер виконання конвеєра.',
    'Ongeldig uitvoeringsnummer.',
  ],
  GITHUB_GEEN_RUNS: [
    'У цьому сховищі ще немає запусків конвеєрів перевірок.',
    'Deze opslagplaats heeft nog geen uitvoeringen van werkstromen.',
  ],
  GITHUB_LOGS_GONE: [
    'Журнал цього виконання на GitHub уже вилучено за строком давності.',
    'Het logboek van deze uitvoering is op GitHub verlopen.',
  ],
  GITHUB_TAG_ONGELDIG: [
    'Вкажіть коректну мітку версії випуску (наприклад, v1.2.0).',
    'Geef een geldige versiemarkering op (bijvoorbeeld v1.2.0).',
  ],
  GITHUB_APPARAAT_ONTBREEKT: [
    'Спершу оберіть підключений пристрій зі списку.',
    'Kies eerst een verbonden apparaat uit de lijst.',
  ],
  GITHUB_APPARAAT_NIET_GEVONDEN: [
    'Вибраний пристрій не знайдено в поточному просторі.',
    'Het gekozen apparaat is niet gevonden in deze ruimte.',
  ],
  GITHUB_APPARAAT_GEWEIGERD: [
    'Пристрій відхилив команду або зараз не в мережі.',
    'Het apparaat weigerde de opdracht of is momenteel niet verbonden.',
  ],
  RATE_LIMITED: [
    'Забагато запитів за короткий час. Зачекайте хвилину.',
    'Te veel verzoeken in korte tijd. Wacht een ogenblik.',
  ],
  OWNER_GITHUB_SESSION_REQUIRED: [
    'Сеанс завершився. Увійдіть повторно й спробуйте ще раз.',
    'De sessie is verlopen. Meld u opnieuw aan en probeer het nogmaals.',
  ],
};

export function ghCodeTekst(code: string, tr: Tr): string {
  const oauth = GITHUB_OAUTH_FOUTEN[code];
  if (oauth) return tr(oauth[0], oauth[1]);
  const hit = EXTRA_FOUTEN[code];
  return hit
    ? tr(hit[0], hit[1])
    : tr('Не вдалося виконати дію з GitHub. Спробуйте ще раз.', 'De GitHub-handeling is niet gelukt. Probeer het opnieuw.');
}

export const ghFoutTekst = (e: unknown, tr: Tr): string => ghCodeTekst(ghFoutCode(e), tr);

export function ghGeleden(iso: string | null | undefined, tr: Tr): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!t) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (m < 1) return tr('щойно', 'zojuist');
  if (m < 60) return tr(`${m} хв тому`, `${m} min geleden`);
  const h = Math.round(m / 60);
  if (h < 48) return tr(`${h} год тому`, `${h} uur geleden`);
  return tr(`${Math.round(h / 24)} дн. тому`, `${Math.round(h / 24)} d geleden`);
}

export function ghGrootte(bytes: number, tr: Tr): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${tr('Б', 'B')}`;
  if (bytes < 1024) return `${bytes} ${tr('Б', 'B')}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${tr('КБ', 'KB')}`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} ${tr('МБ', 'MB')}`;
}

export function useGhVraag<T>(pad: string, lichaam: Record<string, unknown> | null, tr: Tr, deps: unknown[]) {
  const [staat, setStaat] = useState<{
    laden: boolean;
    fout: string;
    code: string;
    data: T | null;
    rate?: { remaining: number; reset: number };
    ruimte?: RuimteFeiten | null;
    gesloten?: RuimteGesloten | null;
  }>({ laden: Boolean(lichaam), fout: '', code: '', data: null });
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (!lichaam) {
      setStaat({ laden: false, fout: '', code: '', data: null });
      return;
    }
    let actief = true;
    setStaat((s) => ({ ...s, laden: true, fout: '', code: '' }));
    ghPost<any>(pad, lichaam)
      .then((d) => {
        if (!actief) return;
        setStaat({
          laden: false,
          fout: '',
          code: '',
          data: d as T,
          rate: d?.rate,
          ruimte: ruimteFeitenUit(d),
          gesloten: null,
        });
      })
      .catch((e) => {
        if (!actief) return;
        const dicht = ruimteGeslotenUit(e instanceof ApiError ? e.response?.data : null);
        if (dicht) {
          setStaat({ laden: false, fout: '', code: dicht.code, data: null, ruimte: null, gesloten: dicht });
          return;
        }
        setStaat({ laden: false, fout: ghFoutTekst(e, tr), code: ghFoutCode(e), data: null, ruimte: null, gesloten: null });
      });
    return () => {
      actief = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pad, rev, ...deps]);

  return { ...staat, herlaad: () => setRev((v) => v + 1) };
}

export function GhMelding({ soort, children }: { soort: 'error' | 'info' | 'ok'; children: ReactNode }) {
  return (
    <div className={`gh-notice gh-${soort}`} role={soort === 'error' ? 'alert' : 'status'}>
      {soort === 'error' ? <AlertTriangle size={16} /> : soort === 'ok' ? <CheckCircle2 size={16} /> : <Loader2 size={16} />}
      <span>{children}</span>
    </div>
  );
}

export function GhBezig({ tr, tekst }: { tr: Tr; tekst?: string }) {
  return (
    <div className="gh-busy">
      <Loader2 size={16} className="gh-spin" />
      <span>{tekst || tr('Завантаження…', 'Laden…')}</span>
    </div>
  );
}

/**
 * Toegankelijk bovenlaagvenster via het native <dialog>-element van de browser.
 * Opent in de top-layer zonder `position: fixed`, ondersteunt Esc en tikken naast het venster,
 * en past zich op smartphones automatisch aan de volledige schermbreedte aan.
 */
export function GhDialoog({
  open,
  titel,
  breed = false,
  onSluit,
  tr,
  children,
}: {
  open: boolean;
  titel: string;
  breed?: boolean;
  onSluit: () => void;
  tr: Tr;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      try {
        el.showModal();
      } catch {
        el.setAttribute('open', '');
      }
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className={`gh-dialoog${breed ? ' gh-dialoog-breed' : ''}`}
      aria-label={titel}
      onCancel={(e) => {
        e.preventDefault();
        onSluit();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onSluit();
      }}
    >
      <div className="gh-dialoog-binnen">
        <header className="gh-dialoog-kop">
          <h3>{titel}</h3>
          <button type="button" className="gh-icon" onClick={onSluit} aria-label={tr('Закрити вікно', 'Venster sluiten')} title={tr('Закрити вікно', 'Venster sluiten')}>
            <X size={18} />
          </button>
        </header>
        <div className="gh-dialoog-lijf">{children}</div>
      </div>
    </dialog>
  );
}

/** Tweekleurige regel-voor-regel verschilweergave voor patches en voorvertoningen in de webeditor. */
export function DiffWeergave({ patch, regels, tr }: { patch?: string; regels?: DiffRegel[]; tr: Tr }) {
  const lijst = regels ?? ontleedDiffPatch(patch || '');
  if (!lijst.length) {
    return <p className="gh-sub">{tr('Текстова різниця змін відсутня (двійковий файл або без змін).', 'Geen tekstverschil beschikbaar (binair bestand of ongewijzigd).')}</p>;
  }
  return (
    <div className="gh-diff-wikkel" role="region" aria-label={tr('Різниця змін за рядками', 'Regel-voor-regel verschil')}>
      <table className="gh-diff-tabel">
        <tbody>
          {lijst.map((r, idx) => (
            <tr key={idx} className={`gh-diff-rij is-${r.soort}`}>
              <td className="gh-diff-nr">{r.oudRegel ?? ''}</td>
              <td className="gh-diff-nr">{r.nieuwRegel ?? ''}</td>
              <td className="gh-diff-teken">{r.soort === 'erbij' ? '+' : r.soort === 'eraf' ? '−' : r.soort === 'kop' ? '@@' : ' '}</td>
              <td className="gh-diff-tekst">{r.soort === 'kop' ? r.tekst : r.tekst || ' '}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
