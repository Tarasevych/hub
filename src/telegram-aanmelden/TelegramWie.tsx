// TELEGRAM-002 — wie in Telegram (eis van de eigenaar 14.11.2026): naast elk verzoek op de site staan de naam, @naam en de FOTO
// van de Telegram-account waar het verzoek heen ging (of die het bevestigde). Een visueel kenmerk: zo ziet u meteen of het uw
// eigen Telegram is. Geen foto bij Telegram → een cirkel met de eerste letter.
// Фото й ім’я Telegram поруч із запитом на сайті: видно, куди пішов запит і хто підтвердив.
type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);

export type TelegramPersoon = { naam: string; gebruikersnaam: string; foto: string; letter: string };

const veilig = (foto: unknown): string => (typeof foto === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(foto) && foto.length <= 120000 ? foto : '');

export const geldigePersonen = (lijst: unknown): TelegramPersoon[] => (Array.isArray(lijst) ? lijst : []).slice(0, 3).map((p) => {
  const r = (p ?? {}) as Record<string, unknown>;
  return { naam: String(r.naam ?? '').slice(0, 80) || 'Telegram', gebruikersnaam: String(r.gebruikersnaam ?? '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40), foto: veilig(r.foto), letter: String(r.letter ?? 'T').slice(0, 2) };
});

export default function TelegramWie({ lang, personen, soort }: { lang: Lang; personen: TelegramPersoon[]; soort: 'verstuurd' | 'bevestigd' }) {
  if (!personen.length) return null;
  return <div className='tg2-wie' role='group' aria-label={soort === 'verstuurd' ? tr(lang, 'Запит надіслано в цей Telegram', 'Verzoek verstuurd naar deze Telegram') : tr(lang, 'Підтверджено в цьому Telegram', 'Bevestigd in deze Telegram')}>
    <span className='tga-klein'>{soort === 'verstuurd' ? tr(lang, 'Запит надіслано в Telegram:', 'Verzoek verstuurd naar Telegram:') : tr(lang, 'Підтверджено в Telegram:', 'Bevestigd in Telegram:')}</span>
    {personen.map((p, i) => <span key={i} className='tg2-persoon'>
      {p.foto ? <img src={p.foto} alt={tr(lang, 'Фото профілю Telegram', 'Telegram-profielfoto')} width={44} height={44} /> : <span className='tg2-letter' aria-hidden='true'>{p.letter}</span>}
      <span><strong>{p.naam}</strong>{p.gebruikersnaam ? <small>@{p.gebruikersnaam}</small> : null}</span>
    </span>)}
  </div>;
}
