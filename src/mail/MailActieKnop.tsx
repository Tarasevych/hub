// Knop van een actie met een brief (blok 1, 25.10.2026, punt 1.2): pictogram uit één tabel, tekst uit het register
// (shared/mail-acties.ts), en de kenmerken data-mail-actie + data-toon waaraan src/mail/mail-acties.css de kleur hangt.
// Oppervlakken met een eigen opmaak (menu-items, leesvenster, onderbalk) gebruiken mailActieIcoon() en mailActieKenmerken().
import { Archive, BadgeAlert, BadgeMinus, Ban, BellOff, BellRing, CalendarPlus, ChevronLeft, ChevronRight, Clock3, Copy, ExternalLink, Eye, FolderInput, Forward, Inbox, Info, Languages, ListChecks, ListFilter, ListTodo, Mail, MailOpen, Palette, Printer, Reply, ReplyAll, Scale, ShieldAlert, Smile, Star, Tags, Trash2, UserRound, VolumeX } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { mailActieTekst, mailActieToon, type MailActieId, type MailTaal, type MailTekstVorm } from '../../shared/mail-acties';
import './mail-acties.css';

/** Pictogram per actie (één tabel voor elk oppervlak). Toestanden: read «ongelezen» = gesloten envelop, star «uit» = gevulde ster,
 *  attention «gewoon» = badge met min (naast «belangrijk» in de selectiebalk moeten ze verschillen). */
const ICONEN: Record<MailActieId, LucideIcon> = {
  reply: Reply, 'reply-all': ReplyAll, 'emoji-reply': Smile, 'forward-attachment': Forward, translate: Languages,
  archive: Archive, read: MailOpen, star: Star, snooze: Clock3, move: FolderInput, inbox: Inbox, labels: Tags, tasks: ListTodo, event: CalendarPlus,
  'filter-similar': ListFilter, 'ignore-thread': VolumeX, unsubscribe: BellOff, classifyPeople: UserRound, classifySystem: BellRing, attention: BadgeAlert,
  select: ListChecks, senderColor: Palette, promoteMessage: UserRound, promoteSender: UserRound,
  preview: Eye, previous: ChevronLeft, next: ChevronRight, details: Info, 'copy-from': Copy, print: Printer, popout: ExternalLink,
  spam: ShieldAlert, block: Ban, phishing: ShieldAlert, illegal: Scale, trash: Trash2,
};

/** Het pictogram (decoratief: de naam staat op de knop). Een gevulde ster alleen als die er al is — lucide zet zelf fill="none". */
export function mailActieIcoon(id: MailActieId, toestand?: string): ReactNode {
  const Icoon = id === 'read' && toestand === 'ongelezen' ? Mail : id === 'attention' && toestand === 'gewoon' ? BadgeMinus : ICONEN[id];
  return <Icoon aria-hidden='true' {...(id === 'star' && toestand === 'uit' ? { fill: 'currentColor' } : {})} />;
}
/** Kenmerken voor elke knop van een actie, ook met eigen opmaak: daaraan hangt de toon (mail-acties.css) en vindt de stand de actie. */
export const mailActieKenmerken = (id: MailActieId, toestand?: string) => ({ 'data-mail-actie': id, 'data-toon': mailActieToon(id, toestand) });

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  actie: MailActieId;
  lang: MailTaal;
  toestand?: string;
  /** Welke tekst uit het register: lang (standaard), kort, bulk … */
  vorm?: MailTekstVorm;
  /** icoon: alleen pictogram (naam in aria-label); tekst: pictogram + zichtbare tekst (die is de naam); kort: pictogram + korte tekst,
   *  de lange naam in aria-label (onderbalk). */
  weergave?: 'icoon' | 'tekst' | 'kort';
  /** Tooltip (span role=tooltip) met deze tekst, of met de naam als `true`. */
  tooltip?: boolean | string;
  /** Andere naam dan het register (bv. met de status van het uitstel erbij). */
  label?: string;
  icoon?: ReactNode;
  children?: ReactNode;
};

export default function MailActieKnop({ actie, lang, toestand, vorm = 'lang', weergave = 'icoon', tooltip, label, icoon, children, ...knop }: Props) {
  const naam = label ?? mailActieTekst(actie, lang, { vorm, toestand });
  const kort = weergave === 'kort' ? mailActieTekst(actie, lang, { vorm: 'kort', toestand }) : '';
  return (
    <button type='button' {...mailActieKenmerken(actie, toestand)} aria-label={weergave === 'tekst' ? undefined : naam} {...knop}>
      {icoon ?? mailActieIcoon(actie, toestand)}
      {weergave === 'tekst' && <span>{naam}</span>}
      {weergave === 'kort' && <span aria-hidden='true'>{kort}</span>}
      {tooltip && <span role='tooltip'>{tooltip === true ? naam : tooltip}</span>}
      {children}
    </button>
  );
}
