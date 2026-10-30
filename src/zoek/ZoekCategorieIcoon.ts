// /zoek — icoon per categorie (zone D, 22.10.2026): voor de groepskoppen «за джерелами» op de pagina. Alleen lucide-vormen;
// merklogo's (GitHub, Google) staan op de kaart zelf via src/merk (officieel), nooit hier getekend.
import { Calendar, CheckSquare, FileText, Folder, GitBranch, Layers, Mail, Settings, type LucideIcon } from 'lucide-react';
import type { Categorie } from './zoek-logica';

export const CATEGORIE_ICOON: Readonly<Record<Categorie, LucideIcon>> = Object.freeze({
  all: Layers, mail: Mail, files: Folder, paginas: FileText, instellingen: Settings, agenda: Calendar, github: GitBranch, bord: CheckSquare, overig: Layers,
});
