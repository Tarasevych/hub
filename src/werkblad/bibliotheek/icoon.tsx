// Iconen van de bibliotheek: menu-iconen via MenuGlyph (zelfde id's als het zijmenu), extra's via lucide. Nooit vrije SVG/URL.
import { CircleDot, Contact, Folder, PenLine, Server, Sparkle, Upload, Zap, type LucideIcon } from 'lucide-react';
import { MenuGlyph } from '../../menu-voorkeuren';
import { MENU_ICOON_IDS } from '../../../shared/werkblad-register';

export const EXTRA_ICONEN: Record<string, LucideIcon> = { folder: Folder, 'pen-line': PenLine, upload: Upload, zap: Zap, server: Server, sparkle: Sparkle, contacts: Contact };

export function RegisterIcoon({ icoon }: { icoon: string }) {
  if ((MENU_ICOON_IDS as readonly string[]).includes(icoon)) return <MenuGlyph icon={icoon} />;
  const I = EXTRA_ICONEN[icoon] || CircleDot;
  return <I className='menu-lucide-glyph' aria-hidden='true' />;
}
