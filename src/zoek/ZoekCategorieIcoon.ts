// /zoek — iconen: per categorie (zone D, 22.10.2026; voor de groepskoppen «за джерелами» en de recente zoekopdrachten) en per soort
// resultaat (INTEG-001, 03.11.2026: verplaatst uit ZoekKaart.tsx, zodat het uitklapvenster in de bovenbalk dezelfde iconen toont zonder
// de zware kaartcomponent (afzenderfoto, merklogo's) in de schil te laden). Alleen lucide-vormen; merklogo's (GitHub, Google) staan op
// de kaart zelf via src/merk (officieel), nooit hier getekend.
import { Calendar, CheckSquare, CircleDot, CircleHelp, File, FileText, Folder, GitBranch, GitCommitHorizontal, GitPullRequest, Layers, Mail, Menu, MessageSquare, Monitor, MousePointerClick, Paperclip, Plug, Settings, StickyNote, TextCursorInput, User, Zap, type LucideIcon } from 'lucide-react';
import type { ZoekSoort } from '../../shared/zoek-model';
import type { Categorie } from './zoek-logica';

export const CATEGORIE_ICOON: Readonly<Record<Categorie, LucideIcon>> = Object.freeze({
  all: Layers, mail: Mail, files: Folder, paginas: FileText, instellingen: Settings, agenda: Calendar, github: GitBranch, bord: CheckSquare, overig: Layers,
});

/** Icoon per soort resultaat (pagina, knop, bericht, bestand, …). */
export const SOORT_ICOON: Readonly<Record<ZoekSoort, LucideIcon>> = Object.freeze({
  pagina: FileText, knop: MousePointerClick, menu: Menu, actie: Zap, veld: TextCursorInput, instelling: Settings, dialoog: MessageSquare, integratie: Plug, hulp: CircleHelp,
  bericht: Mail, bijlage: Paperclip, bestand: File, map: Folder, notitie: StickyNote, taak: CheckSquare, afspraak: Calendar, repo: GitBranch, issue: CircleDot, pull: GitPullRequest, commit: GitCommitHorizontal,
  contact: User, apparaat: Monitor, overig: FileText,
});

/** Icoon per type recente rij: een getypte zoekopdracht toont het icoon van haar categorie; een functie of pagina zijn eigen icoon. */
export const RECENT_SOORT_ICOON: Readonly<Record<'functie' | 'pagina', LucideIcon>> = Object.freeze({ functie: Zap, pagina: FileText });
