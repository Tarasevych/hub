// IDENTITEIT-014: дані для «Інших способів входу» — спільний запит /api/aanmelden/telegram/config (кеш 30 с, без дубля).
// Gegevens voor «Andere aanmeldmethoden»: de gedeelde lezing van de Telegram-config. Het paneel laadt dit bestand lui.
import {useAanmeldConfig} from './telegram-aanmelden/aanmeld-config';
import {AndereMethodenWeergave,type AndereMethodenProps} from './AndereAanmeldMethoden';

export default function AndereMethoden(p:AndereMethodenProps){
  return <AndereMethodenWeergave {...p} cfg={useAanmeldConfig()}/>;
}
