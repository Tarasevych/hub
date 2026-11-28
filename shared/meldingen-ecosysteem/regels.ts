// Чисті геометричні правила вікна (перетягування, 8-стороннє змінення розміру), змахів,
// адаптації під активний піддомен і розкладу тихих годин.

import type {
  MeldingEcosysteemGebeurtenis,
  MeldingEcosysteemProfiel,
  MeldingSubdomein,
  RuimteType,
  SubdomeinContext,
  VeegActie,
  VeegRegels,
  VensterGeometrie,
  VensterModus,
} from './model';

export type SchermAfmeting = { breedte: number; hoogte: number; dokBoven?: number; dokOnder?: number; dokLinks?: number; dokRechts?: number };
export type RandRichting = 'n' | 'z' | 'w' | 'o' | 'nw' | 'no' | 'zw' | 'zo';

export const MIN_VENSTER_BREEDTE = 310;
export const MIN_VENSTER_HOOGTE = 300;
const SCHERM_RAND = 8;

export function maatVanModus(modus: VensterModus, scherm: SchermAfmeting): { breedte: number; hoogte: number } {
  const maxB = Math.max(MIN_VENSTER_BREEDTE, scherm.breedte - (scherm.dokLinks || 0) - (scherm.dokRechts || 0) - SCHERM_RAND * 2);
  const maxH = Math.max(MIN_VENSTER_HOOGTE, scherm.hoogte - (scherm.dokBoven || 0) - (scherm.dokOnder || 0) - SCHERM_RAND * 2);
  if (modus === 'kompakt') return { breedte: Math.min(360, maxB), hoogte: Math.min(460, maxH) };
  if (modus === 'breed') return { breedte: Math.min(760, maxB), hoogte: Math.min(680, maxH) };
  if (modus === 'volledig') return { breedte: maxB, hoogte: maxH };
  return { breedte: Math.min(460, maxB), hoogte: Math.min(600, maxH) };
}

export function klemVenster(geo: VensterGeometrie, scherm: SchermAfmeting): VensterGeometrie {
  const minX = (scherm.dokLinks || 0) + SCHERM_RAND;
  const minY = (scherm.dokBoven || 0) + SCHERM_RAND;
  const maxB = Math.max(MIN_VENSTER_BREEDTE, scherm.breedte - minX - (scherm.dokRechts || 0) - SCHERM_RAND);
  const maxH = Math.max(MIN_VENSTER_HOOGTE, scherm.hoogte - minY - (scherm.dokOnder || 0) - SCHERM_RAND);

  if (geo.modus === 'volledig') {
    return { ...geo, x: minX, y: minY, breedte: maxB, hoogte: maxH };
  }

  const breedte = Math.max(MIN_VENSTER_BREEDTE, Math.min(maxB, Math.round(geo.breedte)));
  const hoogte = Math.max(MIN_VENSTER_HOOGTE, Math.min(maxH, Math.round(geo.hoogte)));
  const maxX = Math.max(minX, scherm.breedte - (scherm.dokRechts || 0) - SCHERM_RAND - breedte);
  const maxY = Math.max(minY, scherm.hoogte - (scherm.dokOnder || 0) - SCHERM_RAND - hoogte);
  const x = Math.max(minX, Math.min(maxX, Math.round(geo.x)));
  const y = Math.max(minY, Math.min(maxY, Math.round(geo.y)));
  return { ...geo, x, y, breedte, hoogte };
}

export function pasVensterMaatAan(
  start: VensterGeometrie,
  richting: RandRichting,
  dx: number,
  dy: number,
  scherm: SchermAfmeting,
): VensterGeometrie {
  const minX = (scherm.dokLinks || 0) + SCHERM_RAND;
  const minY = (scherm.dokBoven || 0) + SCHERM_RAND;
  const maxRechts = scherm.breedte - (scherm.dokRechts || 0) - SCHERM_RAND;
  const maxOnder = scherm.hoogte - (scherm.dokOnder || 0) - SCHERM_RAND;

  let x = start.x;
  let y = start.y;
  let breedte = start.breedte;
  let hoogte = start.hoogte;

  if (richting.includes('o')) {
    breedte = Math.max(MIN_VENSTER_BREEDTE, Math.min(maxRechts - x, start.breedte + dx));
  }
  if (richting.includes('z')) {
    hoogte = Math.max(MIN_VENSTER_HOOGTE, Math.min(maxOnder - y, start.hoogte + dy));
  }
  if (richting.includes('w')) {
    const rechterRand = start.x + start.breedte;
    const nieuweX = Math.max(minX, Math.min(rechterRand - MIN_VENSTER_BREEDTE, start.x + dx));
    x = nieuweX;
    breedte = rechterRand - nieuweX;
  }
  if (richting.includes('n')) {
    const onderRand = start.y + start.hoogte;
    const nieuweY = Math.max(minY, Math.min(onderRand - MIN_VENSTER_HOOGTE, start.y + dy));
    y = nieuweY;
    hoogte = onderRand - nieuweY;
  }

  return klemVenster({ ...start, x, y, breedte, hoogte, modus: breedte >= 660 ? 'breed' : breedte <= 370 ? 'kompakt' : 'normaal' }, scherm);
}

export type VeegResultaat =
  | { uitvoeren: false; reden: 'uit' | 'kritiek_beschermd' }
  | { uitvoeren: true; actie: Exclude<VeegActie, 'geen'> };

export function evalueerVeeg(
  richting: 'links' | 'rechts',
  regels: VeegRegels,
  geb: Pick<MeldingEcosysteemGebeurtenis, 'kanaal' | 'prioriteit' | 'status'>,
): VeegResultaat {
  if (!regels.actief) return { uitvoeren: false, reden: 'uit' };
  const actie = richting === 'links' ? regels.links : regels.rechts;
  if (actie === 'geen') return { uitvoeren: false, reden: 'uit' };
  if (actie === 'archief' && geb.prioriteit === 'kritiek' && geb.status === 'nieuw' && geb.kanaal === 'beveiliging') {
    return { uitvoeren: false, reden: 'kritiek_beschermd' };
  }
  return { uitvoeren: true, actie };
}

export function contextVoorSubdomein(subdomein: MeldingSubdomein, ruimte: RuimteType = 'prive'): SubdomeinContext {
  if (ruimte === 'technisch') {
    return {
      subdomein,
      accent: '#f59e0b',
      tintAchtergrond: 'rgba(245, 158, 11, 0.14)',
      naamUk: 'Технічний контур',
      naamNl: 'Technische ruimte',
      snelFilters: ['beveiliging', 'systeem', 'pc_agent', 'extensie', 'mcp', 'pagina'],
    };
  }
  const map: Record<MeldingSubdomein, Omit<SubdomeinContext, 'subdomein'>> = {
    hub: { accent: '#3b82f6', tintAchtergrond: 'rgba(59, 130, 246, 0.12)', naamUk: 'Загальний хаб', naamNl: 'Algemene hub', snelFilters: ['beveiliging', 'mail', 'cloud', 'ai', 'huis'] },
    id: { accent: '#6366f1', tintAchtergrond: 'rgba(99, 102, 241, 0.14)', naamUk: 'Обліковий запис і безпека', naamNl: 'Account en veiligheid', snelFilters: ['beveiliging', 'systeem', 'extensie', 'pagina'] },
    ai: { accent: '#8b5cf6', tintAchtergrond: 'rgba(139, 92, 246, 0.14)', naamUk: 'Простір ШІ', naamNl: 'AI-werkruimte', snelFilters: ['ai', 'mcp', 'pc_agent', 'extensie'] },
    mail: { accent: '#0ea5e9', tintAchtergrond: 'rgba(14, 165, 233, 0.14)', naamUk: 'Пошта і вкладення', naamNl: 'Post en bijlagen', snelFilters: ['mail', 'beveiliging', 'ai', 'pagina'] },
    cloud: { accent: '#10b981', tintAchtergrond: 'rgba(16, 185, 129, 0.14)', naamUk: 'Хмарне сховище', naamNl: 'Cloudopslag', snelFilters: ['cloud', 'beveiliging', 'ai', 'app'] },
    github: { accent: '#14b8a6', tintAchtergrond: 'rgba(20, 184, 166, 0.14)', naamUk: 'Репозиторії GitHub', naamNl: 'GitHub-opslag', snelFilters: ['github', 'ai', 'mcp', 'systeem'] },
    huis: { accent: '#f97316', tintAchtergrond: 'rgba(249, 115, 22, 0.14)', naamUk: 'Розумний дім', naamNl: 'Slim wonen', snelFilters: ['huis', 'pc_agent', 'beveiliging', 'systeem'] },
    mcp: { accent: '#06b6d4', tintAchtergrond: 'rgba(6, 182, 212, 0.14)', naamUk: 'Роз’єми й пристрої', naamNl: 'Apparaten en MCP', snelFilters: ['mcp', 'pc_agent', 'extensie', 'ai', 'beveiliging'] },
    api: { accent: '#ec4899', tintAchtergrond: 'rgba(236, 72, 153, 0.14)', naamUk: 'Платформа API', naamNl: 'API-platform', snelFilters: ['beveiliging', 'systeem', 'mcp', 'ai'] },
    admin: { accent: '#eab308', tintAchtergrond: 'rgba(234, 179, 8, 0.14)', naamUk: 'Консоль керування', naamNl: 'Beheerconsole', snelFilters: ['systeem', 'beveiliging', 'pc_agent', 'extensie'] },
    systeem: { accent: '#64748b', tintAchtergrond: 'rgba(100, 116, 139, 0.14)', naamUk: 'Системні сигнали', naamNl: 'Systeemsignalen', snelFilters: ['systeem', 'pagina', 'beveiliging'] },
  };
  return { subdomein, ...map[subdomein] };
}

export function isStilInEcosysteem(profiel: MeldingEcosysteemProfiel, nu = new Date()): boolean {
  if (!profiel.stilleUren.actief) return false;
  const parseMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };
  const van = parseMin(profiel.stilleUren.van);
  const tot = parseMin(profiel.stilleUren.tot);
  const cur = nu.getHours() * 60 + nu.getMinutes();
  if (van === tot) return false;
  return van < tot ? cur >= van && cur < tot : cur >= van || cur < tot;
}
